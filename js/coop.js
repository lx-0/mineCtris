// js/coop.js — Client-side co-op WebSocket connection manager.
// State machine: idle → connecting → waiting_for_partner → ready → in_game → disconnected
// Requires: leaderboard.js loaded first (uses same worker base URL pattern).

const COOP_WORKER_URL = 'https://minectris-leaderboard.workers.dev';

const CoopState = {
  IDLE:               'idle',
  CONNECTING:         'connecting',
  WAITING_FOR_PARTNER:'waiting_for_partner',
  READY:              'ready',
  IN_GAME:            'in_game',
  DISCONNECTED:       'disconnected',
};

const coop = (function () {
  let _state        = CoopState.IDLE;
  let _ws           = null;
  let _roomCode     = null;
  let _lastWsUrl    = null;
  let _handlers     = {};
  let _pingInterval = null;
  let _partnerTimeout = null;
  let _reconnectCount = 0;
  let _isHost       = false;

  // ── Internal helpers ────────────────────────────────────────────────────────

  function _setState(s) {
    _state = s;
  }

  function _clearTimers() {
    if (_pingInterval)    { clearInterval(_pingInterval);  _pingInterval    = null; }
    if (_partnerTimeout)  { clearTimeout(_partnerTimeout); _partnerTimeout  = null; }
  }

  function _startPing() {
    _pingInterval = setInterval(function () {
      if (_ws && _ws.readyState === WebSocket.OPEN) {
        _ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  function _emit(type, data) {
    const fns = _handlers[type];
    if (fns) fns.forEach(function (fn) { try { fn(data); } catch (_) {} });
  }

  function _connectWs(wsUrl) {
    _lastWsUrl = wsUrl;
    _setState(CoopState.CONNECTING);
    _emit('state_change', { state: _state, roomCode: _roomCode });

    _ws = new WebSocket(wsUrl);

    _ws.addEventListener('open', function () {
      _startPing();
      // On in-game reconnect, request a piece resync from the server
      if (_reconnectCount > 0) {
        _publicAPI.send({ type: 'piece_resync' });
      }
      _setState(CoopState.WAITING_FOR_PARTNER);
      _emit('state_change', { state: _state, roomCode: _roomCode });

      // 90-second timeout if partner does not join
      _partnerTimeout = setTimeout(function () {
        if (_state === CoopState.WAITING_FOR_PARTNER) {
          _emit('timeout', {});
          _publicAPI.disconnect();
        }
      }, 90000);
    });

    _ws.addEventListener('message', function (event) {
      let msg;
      try { msg = JSON.parse(event.data); } catch (_) { return; }

      if (msg.type === 'pong') return;

      if (msg.type === 'player_joined') {
        if (_partnerTimeout) { clearTimeout(_partnerTimeout); _partnerTimeout = null; }
        _setState(CoopState.READY);
        _emit('state_change', { state: _state, roomCode: _roomCode });
        _emit('partner_connected', {});
        return;
      }

      if (msg.type === 'player_left') {
        if (_state === CoopState.IN_GAME) {
          _setState(CoopState.DISCONNECTED);
          _emit('state_change', { state: _state });
          _emit('partner_left', {});
        } else {
          // Partner left before game started — go back to waiting
          _setState(CoopState.WAITING_FOR_PARTNER);
          _emit('state_change', { state: _state, roomCode: _roomCode });
          _emit('partner_left', {});
        }
        return;
      }

      _emit(msg.type, msg);
    });

    _ws.addEventListener('close', function (event) {
      _clearTimers();
      if (_state === CoopState.IN_GAME && _reconnectCount < 1) {
        // One reconnect attempt during a live game
        _reconnectCount++;
        _setState(CoopState.CONNECTING);
        _emit('state_change', { state: _state });
        setTimeout(function () { _connectWs(_lastWsUrl); }, 1000);
        return;
      }
      if (_state !== CoopState.IDLE) {
        _setState(CoopState.DISCONNECTED);
        _emit('state_change', { state: _state });
        _emit('disconnected', { wasClean: event.wasClean });
      }
    });

    _ws.addEventListener('error', function () {
      // close event fires after error; handled above
    });
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  const _publicAPI = {
    get state()    { return _state; },
    get roomCode() { return _roomCode; },
    get isHost()   { return _isHost; },

    /** POST /room/create → connects as host */
    async createRoom() {
      _reconnectCount = 0;
      _isHost = true;
      const resp = await fetch(COOP_WORKER_URL + '/room/create', { method: 'POST' });
      if (!resp.ok) throw new Error('Failed to create room');
      const data = await resp.json();
      _roomCode = data.roomCode;
      _connectWs(data.wsUrl);
      return _roomCode;
    },

    /** GET /room/{CODE}/join → connects as guest */
    async joinRoom(code) {
      _reconnectCount = 0;
      _isHost = false;
      _roomCode = code.toUpperCase().trim();
      const resp = await fetch(COOP_WORKER_URL + '/room/' + _roomCode + '/join');
      if (!resp.ok) {
        const err = await resp.json().catch(function () { return {}; });
        throw new Error(err.error || 'Failed to join room');
      }
      const data = await resp.json();
      _connectWs(data.wsUrl);
    },

    /** Send a JSON message to the partner */
    send(message) {
      if (_ws && _ws.readyState === WebSocket.OPEN) {
        _ws.send(JSON.stringify(message));
      }
    },

    /** Register an event handler */
    on(type, handler) {
      if (!_handlers[type]) _handlers[type] = [];
      _handlers[type].push(handler);
    },

    /** Remove an event handler */
    off(type, handler) {
      if (!_handlers[type]) return;
      _handlers[type] = _handlers[type].filter(function (fn) { return fn !== handler; });
    },

    /** Transition state to in_game (called when both players hit Start) */
    startGame() {
      _reconnectCount = 0;
      _setState(CoopState.IN_GAME);
      _emit('state_change', { state: _state });
    },

    /** Clean disconnect — resets all state */
    disconnect() {
      _clearTimers();
      if (_ws) {
        try { _ws.close(); } catch (_) {}
        _ws = null;
      }
      _roomCode     = null;
      _lastWsUrl    = null;
      _reconnectCount = 0;
      _isHost       = false;
      _setState(CoopState.IDLE);
      _handlers = {};
    },
  };

  return _publicAPI;
})();
