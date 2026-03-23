// js/guild-expedition.js — Guild Expedition co-op mode (Phase 3: Social Integration)
//
// Manages a guild expedition session where 2-5 guild members each play the same biome
// independently while their scores combine toward a collective target.
//
// Collective target: 50,000 pts × number of participants
// Success reward: +50% XP bonus applied to the individual's expedition XP award
// History: last 7 days of guild expedition results in guild screen
//
// Depends on:
//   guild.js         (GUILD_API, guildUserId, _loadMyGuildId)
//   expedition-session.js  (showExpeditionResults — patched to intercept run completion)
//   biome-themes.js  (activeBiomeId — read to detect current biome)
//   state.js         (score, linesCleared globals — polled during gameplay)

const GUILD_EXPEDITION_API = 'https://minectris-leaderboard.workers.dev';

// ── State ─────────────────────────────────────────────────────────────────────

const GuildExpeditionPhase = {
  IDLE:        'idle',
  CONNECTING:  'connecting',
  LOBBY:       'lobby',
  IN_GAME:     'in_game',
  COMPLETED:   'completed',
};

const guildExpedition = (function () {

  let _phase         = GuildExpeditionPhase.IDLE;
  let _ws            = null;
  let _sessionId     = null;
  let _biomeId       = null;
  let _guildId       = null;
  let _players       = {};        // userId -> { status, score }
  let _collectiveScore   = 0;
  let _collectiveTarget  = 0;
  let _lobbyDeadline = null;
  let _pingInterval  = null;
  let _scoreInterval = null;      // reports local score every 2s during gameplay
  let _lobbyTimer    = null;      // countdown UI interval
  let _xpBonusPct    = 0;         // 0.5 on success
  let _runResult     = null;      // captured from showExpeditionResults
  let _handlers      = {};

  // ── Event emitter ─────────────────────────────────────────────────────────

  function _emit(type, data) {
    const fns = _handlers[type];
    if (fns) fns.forEach(function (fn) { try { fn(data); } catch (_) {} });
  }

  // ── WebSocket helpers ──────────────────────────────────────────────────────

  function _startPing() {
    _pingInterval = setInterval(function () {
      if (_ws && _ws.readyState === WebSocket.OPEN) {
        _ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  }

  function _startScoreReporting() {
    _scoreInterval = setInterval(function () {
      if (_phase !== GuildExpeditionPhase.IN_GAME) return;
      if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
      const currentScore   = (typeof score !== 'undefined') ? score : 0;
      const currentLines   = (typeof linesCleared !== 'undefined') ? linesCleared : 0;
      _ws.send(JSON.stringify({
        type: 'score_update',
        score:        currentScore,
        linesCleared: currentLines,
      }));
    }, 2000);
  }

  function _clearTimers() {
    if (_pingInterval)  { clearInterval(_pingInterval);  _pingInterval  = null; }
    if (_scoreInterval) { clearInterval(_scoreInterval); _scoreInterval = null; }
    if (_lobbyTimer)    { clearInterval(_lobbyTimer);    _lobbyTimer    = null; }
  }

  function _connectWs(wsUrl) {
    _phase = GuildExpeditionPhase.CONNECTING;
    _emit('phase_change', { phase: _phase });
    _ws = new WebSocket(wsUrl);

    _ws.addEventListener('open', function () {
      _startPing();
      _emit('connected', {});
    });

    _ws.addEventListener('message', function (event) {
      let msg;
      try { msg = JSON.parse(event.data); } catch (_) { return; }
      if (msg.type === 'pong') return;
      _handleMessage(msg);
    });

    _ws.addEventListener('close', function () {
      _clearTimers();
      if (_phase !== GuildExpeditionPhase.COMPLETED && _phase !== GuildExpeditionPhase.IDLE) {
        _phase = GuildExpeditionPhase.IDLE;
        _emit('phase_change', { phase: _phase });
        _emit('disconnected', {});
      }
    });

    _ws.addEventListener('error', function () {});
  }

  function _handleMessage(msg) {
    switch (msg.type) {

      case 'session_joined':
        _sessionId       = msg.sessionId  || _sessionId;
        _biomeId         = msg.biomeId    || _biomeId;
        _lobbyDeadline   = msg.lobbyDeadline || null;
        _collectiveScore = msg.collectiveScore  || 0;
        _collectiveTarget = msg.collectiveTarget || 0;
        _players         = {};
        if (Array.isArray(msg.players)) {
          msg.players.forEach(function (p) { _players[p.userId] = p; });
        }
        _phase = msg.phase === 'in_game' ? GuildExpeditionPhase.IN_GAME : GuildExpeditionPhase.LOBBY;
        _emit('phase_change', { phase: _phase });
        _updateLobbyUI();
        if (_phase === GuildExpeditionPhase.IN_GAME) {
          _startScoreReporting();
        }
        break;

      case 'lobby_update':
        _players       = {};
        if (Array.isArray(msg.players)) {
          msg.players.forEach(function (p) { _players[p.userId] = p; });
        }
        _collectiveTarget = msg.collectiveTarget || _collectiveTarget;
        _lobbyDeadline    = msg.lobbyDeadline    || _lobbyDeadline;
        _updateLobbyUI();
        break;

      case 'player_joined':
        if (!_players[msg.userId]) _players[msg.userId] = { userId: msg.userId, status: 'lobby', score: 0 };
        _updateLobbyUI();
        _emit('player_joined', { userId: msg.userId });
        break;

      case 'player_left':
        delete _players[msg.userId];
        _updateLobbyUI();
        _emit('player_left', { userId: msg.userId });
        break;

      case 'game_start':
        _phase            = GuildExpeditionPhase.IN_GAME;
        _collectiveTarget = msg.collectiveTarget || _collectiveTarget;
        for (const uid in _players) { _players[uid].status = 'playing'; }
        _emit('phase_change', { phase: _phase });
        _emit('game_start', { biomeId: _biomeId, collectiveTarget: _collectiveTarget });
        _hideLobbyOverlay();
        _showExpeditionHUD();
        _startScoreReporting();
        break;

      case 'collective_score':
        _collectiveScore  = msg.collectiveScore  || 0;
        _collectiveTarget = msg.collectiveTarget || _collectiveTarget;
        if (msg.playerScores) {
          for (const uid in msg.playerScores) {
            if (_players[uid]) _players[uid].score = msg.playerScores[uid];
          }
        }
        _updateHUD();
        _emit('collective_score', { collectiveScore: _collectiveScore, collectiveTarget: _collectiveTarget });
        break;

      case 'player_done':
        if (_players[msg.userId]) {
          _players[msg.userId].status = 'done';
          if (typeof msg.score === 'number') _players[msg.userId].score = msg.score;
        }
        _updateHUD();
        break;

      case 'player_dropped':
        if (_players[msg.userId]) {
          _players[msg.userId].status = 'dropped';
          if (typeof msg.score === 'number') _players[msg.userId].score = msg.score;
        }
        _updateHUD();
        _emit('player_dropped', { userId: msg.userId });
        break;

      case 'expedition_complete':
        _phase           = GuildExpeditionPhase.COMPLETED;
        _collectiveScore = msg.collectiveScore || 0;
        _xpBonusPct      = msg.success ? 0.5 : 0;
        _clearTimers();
        _hideExpeditionHUD();
        _emit('phase_change', { phase: _phase });
        _emit('expedition_complete', {
          success:          msg.success,
          collectiveScore:  msg.collectiveScore,
          collectiveTarget: msg.collectiveTarget,
          players:          msg.players,
        });
        // If our run_complete was already sent, show deferred results now
        if (_runResult) {
          _showResultsWithBonus(_runResult);
          _runResult = null;
        }
        break;

      case 'expedition_cancelled':
        _phase = GuildExpeditionPhase.IDLE;
        _clearTimers();
        _hideLobbyOverlay();
        _emit('phase_change', { phase: _phase });
        _emit('expedition_cancelled', { reason: msg.reason });
        _showGuildExpeditionToast('Not enough players joined — expedition cancelled.', '#ef4444');
        break;
    }
  }

  // ── Lobby UI ───────────────────────────────────────────────────────────────

  function _updateLobbyUI() {
    const playerCount = Object.keys(_players).length;
    const listEl  = document.getElementById('gexp-lobby-players');
    const countEl = document.getElementById('gexp-lobby-count');
    const targetEl = document.getElementById('gexp-lobby-target');

    if (countEl)  countEl.textContent  = playerCount + '/5';
    if (targetEl) targetEl.textContent = '🎯 Collective target: ' +
      (50000 * Math.max(playerCount, 1)).toLocaleString() + ' pts';

    if (listEl) {
      listEl.innerHTML = Object.entries(_players).map(function (entry) {
        const uid = entry[0];
        const p   = entry[1];
        const icon = p.status === 'done' ? '✓' : p.status === 'dropped' ? '✕' : '◎';
        return '<div class="gexp-lobby-player">' +
          '<span class="gexp-lobby-icon">' + icon + '</span>' +
          '<span class="gexp-lobby-name">' + _escHtml(uid) + '</span>' +
          '<span class="gexp-lobby-score">' + (p.score > 0 ? p.score.toLocaleString() : '') + '</span>' +
          '</div>';
      }).join('');
    }

    // Countdown timer
    if (_lobbyDeadline && _phase === GuildExpeditionPhase.LOBBY) {
      _startLobbyCountdown();
    }
  }

  function _startLobbyCountdown() {
    if (_lobbyTimer) return; // already running
    _lobbyTimer = setInterval(function () {
      const timerEl = document.getElementById('gexp-lobby-timer');
      if (!timerEl) return;
      const remaining = Math.max(0, Math.ceil((_lobbyDeadline - Date.now()) / 1000));
      timerEl.textContent = remaining + 's';
      if (remaining <= 0) {
        clearInterval(_lobbyTimer);
        _lobbyTimer = null;
      }
    }, 500);
  }

  function _hideLobbyOverlay() {
    const el = document.getElementById('guild-expedition-lobby');
    if (el) el.style.display = 'none';
  }

  // ── In-game HUD ────────────────────────────────────────────────────────────

  function _showExpeditionHUD() {
    const hud = document.getElementById('guild-expedition-hud');
    if (!hud) return;
    hud.style.display = 'flex';
    _updateHUD();
  }

  function _hideExpeditionHUD() {
    const hud = document.getElementById('guild-expedition-hud');
    if (hud) hud.style.display = 'none';
  }

  function _updateHUD() {
    const totalEl  = document.getElementById('gexp-hud-total');
    const targetEl = document.getElementById('gexp-hud-target');
    const barEl    = document.getElementById('gexp-hud-bar-fill');
    const playersEl = document.getElementById('gexp-hud-players');

    if (totalEl)  totalEl.textContent  = _collectiveScore.toLocaleString();
    if (targetEl) targetEl.textContent = _collectiveTarget.toLocaleString();

    if (barEl) {
      const pct = _collectiveTarget > 0
        ? Math.min(100, Math.round(_collectiveScore / _collectiveTarget * 100))
        : 0;
      barEl.style.width = pct + '%';
      barEl.className = 'gexp-hud-bar-fill' + (pct >= 100 ? ' gexp-hud-bar-full' : '');
    }

    if (playersEl) {
      playersEl.innerHTML = Object.entries(_players).map(function (entry) {
        const uid = entry[0];
        const p   = entry[1];
        const cls = p.status === 'done' ? 'done' : p.status === 'dropped' ? 'dropped' : 'playing';
        return '<span class="gexp-hud-player gexp-hud-player--' + cls + '">' +
          _escHtml(uid.slice(0, 8)) + ': ' + (p.score || 0).toLocaleString() +
          '</span>';
      }).join('');
    }
  }

  // ── Results with XP bonus ──────────────────────────────────────────────────

  function _showResultsWithBonus(data) {
    // Augment data with XP bonus if expedition succeeded
    const augmented = Object.assign({}, data);
    if (_xpBonusPct > 0 && typeof augmented.score === 'number') {
      augmented._guildExpeditionBonus = _xpBonusPct;
      augmented._collectiveScore      = _collectiveScore;
      augmented._collectiveTarget     = _collectiveTarget;
      // Grant the +50% XP bonus via the biome reward system
      if (typeof awardBiomeRunXP === 'function' && _biomeId) {
        const bonusXp = Math.min(250, Math.floor((augmented.score * _xpBonusPct) / 100));
        if (bonusXp > 0) awardBiomeRunXP(_biomeId, bonusXp * 100); // scaled so min(500,x/100)=bonusXp
      }
    }
    if (typeof _origShowExpeditionResults === 'function') {
      _origShowExpeditionResults(augmented);
    }
    _showGuildExpeditionBadge(augmented);
  }

  // ── Guild expedition badge/toast ───────────────────────────────────────────

  function _showGuildExpeditionBadge(data) {
    const success   = _xpBonusPct > 0;
    const toastEl   = document.getElementById('guild-error-toast');
    if (!toastEl) return;
    const msg = success
      ? '🏆 Guild Expedition Success! Collective score: ' + _collectiveScore.toLocaleString() +
        ' / ' + _collectiveTarget.toLocaleString() + ' — +50% XP bonus!'
      : '⚔️ Guild Expedition ended. Collective score: ' + _collectiveScore.toLocaleString() +
        ' / ' + _collectiveTarget.toLocaleString();
    _showGuildExpeditionToast(msg, success ? '#22c55e' : '#94a3b8');
  }

  function _showGuildExpeditionToast(msg, color) {
    const el = document.getElementById('guild-expedition-toast');
    if (!el) return;
    el.textContent   = msg;
    el.style.background = color || '#1e293b';
    el.style.display = 'block';
    clearTimeout(el._hideTimeout);
    el._hideTimeout = setTimeout(function () { el.style.display = 'none'; }, 6000);
  }

  // ── Utility ────────────────────────────────────────────────────────────────

  function _escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  const _publicAPI = {
    get phase()           { return _phase; },
    get sessionId()       { return _sessionId; },
    get biomeId()         { return _biomeId; },
    get collectiveScore() { return _collectiveScore; },
    get collectiveTarget(){ return _collectiveTarget; },
    get players()         { return Object.assign({}, _players); },
    get xpBonus()         { return _xpBonusPct; },

    isActive() {
      return _phase === GuildExpeditionPhase.IN_GAME || _phase === GuildExpeditionPhase.LOBBY;
    },

    on(type, fn) {
      if (!_handlers[type]) _handlers[type] = [];
      _handlers[type].push(fn);
    },

    off(type, fn) {
      if (!_handlers[type]) return;
      _handlers[type] = _handlers[type].filter(function (f) { return f !== fn; });
    },

    /**
     * Start a guild expedition (Officer+).
     * Opens the lobby overlay and connects the WS.
     */
    async startExpedition(guildId, biomeId) {
      if (_phase !== GuildExpeditionPhase.IDLE) {
        throw new Error('Already in an expedition');
      }
      _guildId = guildId;
      _biomeId = biomeId;
      const userId = (typeof guildUserId === 'function') ? guildUserId() : '';
      const res = await fetch(GUILD_EXPEDITION_API + '/api/guild-expedition/start', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ guildId, userId, biomeId }),
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'Failed to start expedition');
      _sessionId     = data.sessionId;
      _lobbyDeadline = data.lobbyDeadline;
      _showLobbyOverlay(biomeId, true);
      _connectWs(data.wsUrl + '?userId=' + encodeURIComponent(userId));
      return data;
    },

    /**
     * Join an existing guild expedition.
     */
    async joinExpedition(sessionId, biomeId) {
      if (_phase !== GuildExpeditionPhase.IDLE) {
        throw new Error('Already in an expedition');
      }
      _sessionId = sessionId;
      _biomeId   = biomeId;
      const userId  = (typeof guildUserId === 'function') ? guildUserId() : '';
      const proto   = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsBase  = GUILD_EXPEDITION_API.replace(/^https?:/, proto);
      const wsUrl   = wsBase + '/guild-expedition/' + sessionId + '/ws?userId=' +
                      encodeURIComponent(userId);
      _showLobbyOverlay(biomeId, false);
      _connectWs(wsUrl);
    },

    /**
     * Called by the patched showExpeditionResults hook when the player's run ends.
     */
    onRunComplete(data) {
      if (_phase !== GuildExpeditionPhase.IN_GAME) return;
      if (_scoreInterval) { clearInterval(_scoreInterval); _scoreInterval = null; }
      const finalScore   = data.score        || 0;
      const finalLines   = data.linesCleared || 0;
      if (_ws && _ws.readyState === WebSocket.OPEN) {
        _ws.send(JSON.stringify({ type: 'run_complete', score: finalScore, linesCleared: finalLines }));
      }
      _runResult = data; // hold results until expedition_complete arrives (or use immediately)
      // If expedition already completed (e.g. last player), show results right away
      if (_phase === GuildExpeditionPhase.COMPLETED) {
        _showResultsWithBonus(data);
        _runResult = null;
      }
      // Otherwise, hold _runResult until expedition_complete arrives
    },

    disconnect() {
      _clearTimers();
      if (_ws) { try { _ws.close(); } catch (_) {} _ws = null; }
      _sessionId     = null;
      _biomeId       = null;
      _guildId       = null;
      _players       = {};
      _collectiveScore   = 0;
      _collectiveTarget  = 0;
      _lobbyDeadline = null;
      _xpBonusPct    = 0;
      _runResult     = null;
      _phase         = GuildExpeditionPhase.IDLE;
      _handlers      = {};
      _hideLobbyOverlay();
      _hideExpeditionHUD();
    },
  };

  return _publicAPI;
})();

// ── Lobby overlay ─────────────────────────────────────────────────────────────

const _BIOME_ICONS_EXP = { stone: '⛏', forest: '🌳', nether: '🔥', ice: '❄' };

function _showLobbyOverlay(biomeId, isHost) {
  let overlay = document.getElementById('guild-expedition-lobby');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'guild-expedition-lobby';
    overlay.className = 'guild-expedition-lobby-overlay';
    document.body.appendChild(overlay);
  }
  const icon = _BIOME_ICONS_EXP[biomeId] || '🌍';
  overlay.innerHTML =
    '<div class="gexp-lobby-panel">' +
      '<div class="gexp-lobby-header">' +
        '<span class="gexp-lobby-biome-icon">' + icon + '</span>' +
        '<span class="gexp-lobby-title">GUILD EXPEDITION</span>' +
        '<span class="gexp-lobby-biome-name">' + (biomeId || '').toUpperCase() + '</span>' +
      '</div>' +
      '<div class="gexp-lobby-info">' +
        '<div class="gexp-lobby-meta">' +
          '<span id="gexp-lobby-count" class="gexp-lobby-count">1/5</span>' +
          '<span id="gexp-lobby-timer" class="gexp-lobby-timer">60s</span>' +
        '</div>' +
        '<div id="gexp-lobby-target" class="gexp-lobby-target"></div>' +
      '</div>' +
      '<div class="gexp-lobby-section-title">PARTICIPANTS</div>' +
      '<div id="gexp-lobby-players" class="gexp-lobby-players"></div>' +
      '<div class="gexp-lobby-rules">' +
        '<div>▸ Play <strong>' + (biomeId || '').toUpperCase() + ' biome</strong> independently</div>' +
        '<div>▸ Scores combine toward a collective target</div>' +
        '<div>▸ Success: <strong>+50% XP bonus</strong> + Guild Expedition Badge</div>' +
        '<div>▸ You can still finish if others drop mid-run</div>' +
      '</div>' +
      (isHost
        ? '<div class="gexp-lobby-host-note">⚔️ You started this expedition. Share your guild to let others join!</div>'
        : '<div class="gexp-lobby-host-note">🔗 Waiting for expedition to start…</div>') +
      '<button class="gexp-lobby-cancel-btn" id="gexp-lobby-cancel">✕ Leave</button>' +
    '</div>';

  overlay.style.display = 'flex';

  const cancelBtn = document.getElementById('gexp-lobby-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function () {
      guildExpedition.disconnect();
    });
  }
}

// ── In-game HUD element ───────────────────────────────────────────────────────

function initGuildExpeditionHUD() {
  if (document.getElementById('guild-expedition-hud')) return;
  const hud = document.createElement('div');
  hud.id        = 'guild-expedition-hud';
  hud.className = 'guild-expedition-hud';
  hud.style.display = 'none';
  hud.innerHTML =
    '<div class="gexp-hud-label">⚔ GUILD EXPEDITION</div>' +
    '<div class="gexp-hud-scores">' +
      '<span id="gexp-hud-total" class="gexp-hud-total">0</span>' +
      '<span class="gexp-hud-sep"> / </span>' +
      '<span id="gexp-hud-target" class="gexp-hud-target">0</span>' +
    '</div>' +
    '<div class="gexp-hud-bar-wrap">' +
      '<div id="gexp-hud-bar-fill" class="gexp-hud-bar-fill"></div>' +
    '</div>' +
    '<div id="gexp-hud-players" class="gexp-hud-players"></div>';

  const gameContainer = document.getElementById('game-container');
  if (gameContainer) gameContainer.appendChild(hud);
  else document.body.appendChild(hud);

  // Toast
  if (!document.getElementById('guild-expedition-toast')) {
    const toast = document.createElement('div');
    toast.id    = 'guild-expedition-toast';
    toast.className = 'guild-expedition-toast';
    toast.style.display = 'none';
    document.body.appendChild(toast);
  }
}

// ── Hook showExpeditionResults to intercept guild expedition run completion ───

let _origShowExpeditionResults = null;

function _hookExpeditionResults() {
  if (typeof showExpeditionResults !== 'function') {
    // Retry after a short delay — script load order
    setTimeout(_hookExpeditionResults, 200);
    return;
  }
  _origShowExpeditionResults = showExpeditionResults;
  showExpeditionResults = function (data) {
    if (guildExpedition.isActive()) {
      // In-expedition: let guild system handle results display after completion
      guildExpedition.onRunComplete(data);
      // Don't call original here — it will be called by _showResultsWithBonus
      // once expedition_complete arrives. If solo expedition run (not guild), pass through.
      return;
    }
    _origShowExpeditionResults(data);
  };
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiGetGuildExpeditionHistory(guildId) {
  try {
    const res  = await fetch(GUILD_EXPEDITION_API + '/api/guilds/' + encodeURIComponent(guildId) + '/expedition-history');
    const data = await res.json();
    return data.history || [];
  } catch (_) {
    return [];
  }
}

async function apiGetGuildExpeditionSession(sessionId) {
  try {
    const res  = await fetch(GUILD_EXPEDITION_API + '/api/guild-expedition/' + encodeURIComponent(sessionId));
    return await res.json();
  } catch (_) {
    return null;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function initGuildExpedition() {
  initGuildExpeditionHUD();
  _hookExpeditionResults();
}

// Auto-init on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGuildExpedition);
} else {
  initGuildExpedition();
}
