// js/battle.js — Client-side Battle mode WebSocket connection manager.
// State machine: idle → connecting → waiting_for_partner → ready → in_game → disconnected
// Reuses the same Durable Object relay infrastructure as co-op.

const BATTLE_WORKER_URL = 'https://minectris-leaderboard.workers.dev';

const BattleState = {
  IDLE:               'idle',
  CONNECTING:         'connecting',
  WAITING_FOR_PARTNER:'waiting_for_partner',
  READY:              'ready',
  IN_GAME:            'in_game',
  SPECTATING:         'spectating',
  DISCONNECTED:       'disconnected',
};

const battle = (function () {
  let _state           = BattleState.IDLE;
  let _ws              = null;
  let _roomCode        = null;
  let _lastWsUrl       = null;
  let _handlers        = {};
  let _pingInterval    = null;
  let _partnerTimeout  = null;
  let _reconnectCount  = 0;
  let _isHost          = false;
  let _isSpectator     = false;
  let _spectatorCount  = 0;  // spectators in room (updated from server messages)
  let _quickMatchPoll  = null;

  // ── Internal helpers ────────────────────────────────────────────────────────

  function _setState(s) {
    _state = s;
  }

  function _clearTimers() {
    if (_pingInterval)    { clearInterval(_pingInterval);   _pingInterval    = null; }
    if (_partnerTimeout)  { clearTimeout(_partnerTimeout);  _partnerTimeout  = null; }
    if (_quickMatchPoll)  { clearTimeout(_quickMatchPoll);  _quickMatchPoll  = null; }
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
    _setState(BattleState.CONNECTING);
    _emit('state_change', { state: _state, roomCode: _roomCode });

    _ws = new WebSocket(wsUrl);

    _ws.addEventListener('open', function () {
      _startPing();
      if (_reconnectCount > 0) {
        _publicAPI.send({ type: 'piece_resync' });
      }
      _setState(BattleState.WAITING_FOR_PARTNER);
      _emit('state_change', { state: _state, roomCode: _roomCode });

      // 90-second timeout if opponent does not join
      _partnerTimeout = setTimeout(function () {
        if (_state === BattleState.WAITING_FOR_PARTNER) {
          _emit('timeout', {});
          _publicAPI.disconnect();
        }
      }, 90000);
    });

    _ws.addEventListener('message', function (event) {
      let msg;
      try { msg = JSON.parse(event.data); } catch (_) { return; }

      if (msg.type === 'pong') return;

      if (msg.type === 'spectator_joined') {
        _spectatorCount = msg.spectatorCount || 0;
        _emit('spectator_joined', { spectatorCount: _spectatorCount });
        return;
      }

      if (msg.type === 'spectator_count') {
        _spectatorCount = msg.spectatorCount || 0;
        _emit('spectator_count', { spectatorCount: _spectatorCount });
        return;
      }

      if (msg.type === 'room_privacy_ack') {
        _emit('room_privacy_ack', msg);
        return;
      }

      if (msg.type === 'player_joined') {
        if (_partnerTimeout) { clearTimeout(_partnerTimeout); _partnerTimeout = null; }
        _setState(BattleState.READY);
        _emit('state_change', { state: _state, roomCode: _roomCode });
        _emit('opponent_connected', {});
        return;
      }

      if (msg.type === 'player_left') {
        if (_state === BattleState.IN_GAME) {
          _setState(BattleState.DISCONNECTED);
          _emit('state_change', { state: _state });
          _emit('opponent_left', {});
        } else {
          _setState(BattleState.WAITING_FOR_PARTNER);
          _emit('state_change', { state: _state, roomCode: _roomCode });
          _emit('opponent_left', {});
        }
        return;
      }

      _emit(msg.type, msg);
    });

    _ws.addEventListener('close', function (event) {
      _clearTimers();
      if (_state === BattleState.IN_GAME && _reconnectCount < 1) {
        _reconnectCount++;
        _setState(BattleState.CONNECTING);
        _emit('state_change', { state: _state });
        setTimeout(function () { _connectWs(_lastWsUrl); }, 1000);
        return;
      }
      if (_state !== BattleState.IDLE) {
        _setState(BattleState.DISCONNECTED);
        _emit('state_change', { state: _state });
        _emit('disconnected', { wasClean: event.wasClean });
      }
    });

    _ws.addEventListener('error', function () {
      // close event fires after error; handled above
    });
  }

  function _connectSpectatorWs(wsUrl) {
    _lastWsUrl = wsUrl;
    _setState(BattleState.CONNECTING);
    _emit('state_change', { state: _state, roomCode: _roomCode });

    _ws = new WebSocket(wsUrl);

    _ws.addEventListener('open', function () {
      _startPing();
      _setState(BattleState.SPECTATING);
      _emit('state_change', { state: _state, roomCode: _roomCode });
    });

    _ws.addEventListener('message', function (event) {
      let msg;
      try { msg = JSON.parse(event.data); } catch (_) { return; }

      if (msg.type === 'pong') return;

      if (msg.type === 'spectator_welcome') {
        _spectatorCount = msg.spectatorCount || 0;
        _emit('spectator_welcome', msg);
        return;
      }

      _emit(msg.type, msg);
    });

    _ws.addEventListener('close', function (event) {
      _clearTimers();
      if (_state !== BattleState.IDLE) {
        _setState(BattleState.DISCONNECTED);
        _emit('state_change', { state: _state });
        _emit('disconnected', { wasClean: event.wasClean });
      }
    });

    _ws.addEventListener('error', function () {
      // close event fires after error
    });
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  const _publicAPI = {
    get state()          { return _state; },
    get roomCode()       { return _roomCode; },
    get isHost()         { return _isHost; },
    get isSpectator()    { return _isSpectator; },
    get spectatorCount() { return _spectatorCount; },

    /** POST /battle/room/create → connects as host */
    async createRoom() {
      _reconnectCount = 0;
      _isHost = true;
      const resp = await fetch(BATTLE_WORKER_URL + '/battle/room/create', { method: 'POST' });
      if (!resp.ok) throw new Error('Failed to create battle room');
      const data = await resp.json();
      _roomCode = data.roomCode;
      _connectWs(data.wsUrl);
      return _roomCode;
    },

    /** GET /battle/room/{CODE}/join → connects as guest */
    async joinRoom(code) {
      _reconnectCount = 0;
      _isHost = false;
      _roomCode = code.toUpperCase().trim();
      const resp = await fetch(BATTLE_WORKER_URL + '/battle/room/' + _roomCode + '/join');
      if (!resp.ok) {
        const err = await resp.json().catch(function () { return {}; });
        throw new Error(err.error || 'Failed to join room');
      }
      const data = await resp.json();
      _connectWs(data.wsUrl);
    },

    /**
     * POST /battle/quickmatch → join the global waiting queue.
     * Returns { waiting: true, roomCode } if we created the room (host),
     * or { roomCode } of the existing waiting player (guest).
     * Emits 'quickmatch_waiting' or directly connects.
     */
    async quickMatch() {
      _reconnectCount = 0;
      const resp = await fetch(BATTLE_WORKER_URL + '/battle/quickmatch', { method: 'POST' });
      if (!resp.ok) throw new Error('Quick match failed');
      const data = await resp.json();
      _roomCode = data.roomCode;
      if (data.waiting) {
        // We are the host waiting for an opponent
        _isHost = true;
        _emit('quickmatch_waiting', { roomCode: _roomCode });
        _connectWs(data.wsUrl);
      } else {
        // We join the waiting player's room as guest
        _isHost = false;
        _connectWs(data.wsUrl);
      }
      return data;
    },

    /**
     * GET /battle/room/{CODE}/spectate → connect as a read-only spectator.
     * Throws if room is private, full, or has no active match.
     */
    async watchRoom(code) {
      _reconnectCount = 0;
      _isSpectator = true;
      _isHost = false;
      _roomCode = code.toUpperCase().trim();
      const resp = await fetch(BATTLE_WORKER_URL + '/battle/room/' + _roomCode + '/spectate');
      if (!resp.ok) {
        const err = await resp.json().catch(function () { return {}; });
        throw Object.assign(new Error(err.error || 'Cannot spectate room'), { full: !!err.full });
      }
      const data = await resp.json();
      _spectatorCount = data.spectatorCount || 0;
      _connectSpectatorWs(data.wsUrl);
    },

    /** Send a JSON message to the opponent */
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

    /** Transition state to in_game */
    startGame() {
      _reconnectCount = 0;
      _setState(BattleState.IN_GAME);
      _emit('state_change', { state: _state });
    },

    /** Clean disconnect — resets all state */
    disconnect() {
      _clearTimers();
      if (_ws) {
        try { _ws.close(); } catch (_) {}
        _ws = null;
      }
      _roomCode       = null;
      _lastWsUrl      = null;
      _reconnectCount = 0;
      _isHost         = false;
      _isSpectator    = false;
      _spectatorCount = 0;
      _setState(BattleState.IDLE);
      _handlers = {};
    },
  };

  return _publicAPI;
})();
