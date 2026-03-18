// js/clan-war-engine.js — Clan War Match Engine
// Manages 5 concurrent 1v1 slot matches for in_progress clan wars.
// Requires: guild.js (GUILD_API, guildUserId), battle.js (Battle)

const ClanWarEngine = (() => {
  const FORFEIT_DELAY_MS  = 2 * 60 * 1000;  // 2 min to join before auto-forfeit
  const WAR_TIME_LIMIT_MS = 45 * 60 * 1000; // 45 min war time limit
  const POLL_MS           = 10_000;          // command center poll interval

  let _pollTimer  = null;
  let _onRefresh  = null; // callback() to re-render command center
  let _activeWarId = null;

  // ── API helpers ─────────────────────────────────────────────────────────────

  async function _apiFetch(path, options = {}) {
    try {
      const res = await fetch(GUILD_API + path, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: { error: 'Network error' } };
    }
  }

  // GET /api/clan-wars/{warId}/slots
  async function apiGetSlots(warId) {
    return _apiFetch(`/api/clan-wars/${warId}/slots`);
  }

  // POST /api/clan-wars/{warId}/slots/{slotIndex}/room  — register or fetch room code
  async function apiRegisterSlotRoom(warId, slotIndex, battleRoomCode) {
    return _apiFetch(`/api/clan-wars/${warId}/slots/${slotIndex}/room`, {
      method: 'POST',
      body: JSON.stringify({ actorId: guildUserId(), battleRoomCode }),
    });
  }

  // POST /api/clan-wars/{warId}/slots/{slotIndex}/result
  async function apiReportSlotResult(warId, slotIndex, result) {
    return _apiFetch(`/api/clan-wars/${warId}/slots/${slotIndex}/result`, {
      method: 'POST',
      body: JSON.stringify({ actorId: guildUserId(), result }),
    });
  }

  // POST /api/clan-wars/{warId}/slots/{slotIndex}/forfeit
  async function apiForfeitSlot(warId, slotIndex) {
    return _apiFetch(`/api/clan-wars/${warId}/slots/${slotIndex}/forfeit`, {
      method: 'POST',
      body: JSON.stringify({ actorId: guildUserId() }),
    });
  }

  // ── Polling ─────────────────────────────────────────────────────────────────

  function startPolling(warId, onRefresh) {
    stopPolling();
    _activeWarId = warId;
    _onRefresh   = onRefresh;
    _pollTimer   = setInterval(async () => {
      if (_onRefresh && _activeWarId) _onRefresh();
    }, POLL_MS);
  }

  function stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    _activeWarId = null;
    _onRefresh   = null;
  }

  // ── Forfeit timer ────────────────────────────────────────────────────────────

  // Returns ms remaining until forfeit deadline given warStartISO
  function forfeitMsRemaining(warStartISO) {
    const start = new Date(warStartISO).getTime();
    return Math.max(0, start + FORFEIT_DELAY_MS - Date.now());
  }

  function warTimeLimitMsRemaining(warStartISO) {
    const start = new Date(warStartISO).getTime();
    return Math.max(0, start + WAR_TIME_LIMIT_MS - Date.now());
  }

  function _fmtMs(ms) {
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // ── Result aggregation ───────────────────────────────────────────────────────

  /**
   * Compute aggregate war result from slot array.
   * Returns { challengerWins, defenderWins, pending, winner: 'challenger'|'defender'|'draw'|null }
   */
  function aggregateSlots(slots, challengerGuildId, defenderGuildId) {
    let cWins = 0, dWins = 0, pending = 0;
    for (const slot of slots) {
      if (slot.status === 'done' || slot.status === 'forfeited') {
        if (slot.result === 'challenger_win') cWins++;
        else if (slot.result === 'defender_win') dWins++;
        // draw counts as 0 for both
      } else {
        pending++;
      }
    }
    const complete = pending === 0;
    let winner = null;
    if (complete || cWins >= 3 || dWins >= 3) {
      if (cWins > dWins) winner = 'challenger';
      else if (dWins > cWins) winner = 'defender';
      else winner = 'draw';
    }
    return { challengerWins: cWins, defenderWins: dWins, pending, winner };
  }

  // ── Command center HTML ──────────────────────────────────────────────────────

  /**
   * Render the 5-slot command center grid.
   * @param {object} war   — war object from API
   * @param {object[]} slots — slot array from API
   * @param {object} rosters — { [guildId]: userId[] }
   * @param {string} myGuildId
   */
  function renderCommandCenter(war, slots, rosters, myGuildId) {
    const isChallenger  = war.challengerGuildId === myGuildId;
    const myRoster      = rosters[myGuildId] || [];
    const opponentId    = isChallenger ? war.defenderGuildId : war.challengerGuildId;
    const myUserId      = guildUserId();

    // Which slot is this player in?
    const mySlot = slots.find(s =>
      s.challengerUserId === myUserId || s.defenderUserId === myUserId
    );

    const cRoster = rosters[war.challengerGuildId] || [];
    const dRoster = rosters[war.defenderGuildId]   || [];

    const agg = aggregateSlots(slots, war.challengerGuildId, war.defenderGuildId);
    const cName = war.challengerGuildName || war.challengerGuildId;
    const dName = war.defenderGuildName   || war.defenderGuildId;

    // Score header
    const scoreHtml = `
      <div class="wcc-scoreboard">
        <div class="wcc-score-side ${isChallenger ? 'wcc-score-side--mine' : ''}">
          <div class="wcc-score-guild">${_esc(cName)}</div>
          <div class="wcc-score-num ${agg.challengerWins >= 3 ? 'wcc-score-num--win' : ''}">${agg.challengerWins}</div>
        </div>
        <div class="wcc-score-sep">vs</div>
        <div class="wcc-score-side ${!isChallenger ? 'wcc-score-side--mine' : ''}">
          <div class="wcc-score-guild">${_esc(dName)}</div>
          <div class="wcc-score-num ${agg.defenderWins >= 3 ? 'wcc-score-num--win' : ''}">${agg.defenderWins}</div>
        </div>
      </div>`;

    // Time limit indicator
    const tlMs = warTimeLimitMsRemaining(war.windowStart || war.startedAt || new Date().toISOString());
    const tlHtml = tlMs > 0 && agg.winner === null
      ? `<div class="wcc-time-limit">⏱ War ends in ${_fmtMs(tlMs)}</div>`
      : '';

    // Result banner (if complete)
    let resultHtml = '';
    if (agg.winner !== null) {
      const isMineWin = (isChallenger && agg.winner === 'challenger') ||
                        (!isChallenger && agg.winner === 'defender');
      const isDraw    = agg.winner === 'draw';
      const cls       = isDraw ? 'draw' : isMineWin ? 'win' : 'loss';
      const label     = isDraw ? '🤝 DRAW — WAR ENDS' : isMineWin ? '🏆 YOUR GUILD WINS' : '💀 YOUR GUILD FALLS';
      resultHtml = `<div class="wcc-result-banner wcc-result-banner--${cls}">${label}</div>`;
    }

    // Slot rows
    const slotsHtml = slots.map(slot => _renderSlotRow(slot, war, myUserId, isChallenger)).join('');

    return `
      <div class="wcc-panel">
        <div class="wcc-header">⚔️ WAR COMMAND CENTER</div>
        ${scoreHtml}
        ${tlHtml}
        ${resultHtml}
        <div class="wcc-slots">${slotsHtml}</div>
        ${mySlot && mySlot.status === 'waiting' ? _renderMySlotJoinSection(mySlot, war) : ''}
      </div>`;
  }

  function _renderSlotRow(slot, war, myUserId, isChallenger) {
    const isMySlot = slot.challengerUserId === myUserId || slot.defenderUserId === myUserId;
    const { statusLabel, statusClass } = _slotStatusInfo(slot);

    const cUser = slot.challengerUserId || '—';
    const dUser = slot.defenderUserId   || '—';

    let actionHtml = '';
    if (slot.status === 'in_progress' && slot.battleRoomCode) {
      actionHtml = `<button class="wcc-spectate-btn" data-room="${_esc(slot.battleRoomCode)}" data-slot="${slot.slotIndex}">👁 Watch</button>`;
    } else if (slot.status === 'waiting' && isMySlot) {
      actionHtml = `<button class="wcc-join-btn guild-primary-btn" data-slot="${slot.slotIndex}">⚔️ Enter</button>`;
    }

    return `
      <div class="wcc-slot-row ${isMySlot ? 'wcc-slot-row--mine' : ''}">
        <div class="wcc-slot-num">#${slot.slotIndex + 1}</div>
        <div class="wcc-slot-players">
          <span class="wcc-slot-player">${_esc(cUser)}</span>
          <span class="wcc-slot-vs">vs</span>
          <span class="wcc-slot-player">${_esc(dUser)}</span>
        </div>
        <div class="wcc-slot-status">
          <span class="wcc-slot-badge wcc-slot-badge--${statusClass}">${statusLabel}</span>
          ${_renderSlotResult(slot, war)}
        </div>
        <div class="wcc-slot-action">${actionHtml}</div>
      </div>`;
  }

  function _renderSlotResult(slot, war) {
    if (slot.status !== 'done' && slot.status !== 'forfeited') return '';
    const labels = {
      challenger_win: `🏆 ${_esc(slot.challengerUserId || '?')}`,
      defender_win:   `🏆 ${_esc(slot.defenderUserId   || '?')}`,
      draw:           '🤝 Draw',
    };
    return `<div class="wcc-slot-result">${labels[slot.result] || slot.result || ''}</div>`;
  }

  function _renderMySlotJoinSection(slot, war) {
    const deadline    = new Date(war.windowStart || Date.now()).getTime() + FORFEIT_DELAY_MS;
    const msLeft      = Math.max(0, deadline - Date.now());
    const countdownId = 'wcc-join-countdown';
    return `
      <div class="wcc-join-section" id="wcc-join-section">
        <div class="wcc-join-title">⚔️ YOUR MATCH IS STARTING</div>
        <div class="wcc-join-sub">Join now or your slot will be forfeited in:</div>
        <div class="wcc-join-countdown" id="${countdownId}">${_fmtMs(msLeft)}</div>
        <button class="guild-primary-btn wcc-join-main-btn" id="wcc-join-main-btn" data-slot="${slot.slotIndex}">
          ⚔️ Enter Battle
        </button>
        <button class="guild-secondary-btn wcc-forfeit-btn" id="wcc-forfeit-btn" data-slot="${slot.slotIndex}">
          🏳 Forfeit Slot
        </button>
        <div id="wcc-join-error" class="guild-error" style="display:none"></div>
      </div>`;
  }

  function _slotStatusInfo(slot) {
    const map = {
      waiting:   { statusLabel: 'Waiting',     statusClass: 'waiting'    },
      in_progress: { statusLabel: 'In Progress', statusClass: 'active'   },
      done:      { statusLabel: 'Done',         statusClass: 'done'       },
      forfeited: { statusLabel: 'Forfeited',    statusClass: 'forfeited'  },
    };
    return map[slot.status] || { statusLabel: slot.status, statusClass: 'waiting' };
  }

  function _esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Wire command center events ───────────────────────────────────────────────

  /**
   * Attach event handlers after rendering command center HTML into container.
   * @param {HTMLElement} container
   * @param {string} warId
   * @param {object[]} slots
   * @param {object} war
   * @param {function} rerender  — async fn() to reload the war detail view
   */
  function wireCommandCenter(container, warId, slots, war, rerender) {
    // Spectate buttons
    container.querySelectorAll('.wcc-spectate-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.room;
        if (code && typeof Battle !== 'undefined') {
          _launchSpectator(code);
        }
      });
    });

    // Inline slot "Enter" buttons in grid (redundant with join section but useful UX)
    container.querySelectorAll('.wcc-join-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const slotIndex = parseInt(btn.dataset.slot, 10);
        _handleJoin(warId, slotIndex, war, rerender, container);
      });
    });

    // Main join section button
    const joinMainBtn = container.querySelector('#wcc-join-main-btn');
    if (joinMainBtn) {
      joinMainBtn.addEventListener('click', () => {
        const slotIndex = parseInt(joinMainBtn.dataset.slot, 10);
        _handleJoin(warId, slotIndex, war, rerender, container);
      });
    }

    // Forfeit button
    const forfeitBtn = container.querySelector('#wcc-forfeit-btn');
    if (forfeitBtn) {
      forfeitBtn.addEventListener('click', async () => {
        if (!confirm('Forfeit your slot? The opposing guild will win this slot.')) return;
        forfeitBtn.disabled = true;
        forfeitBtn.textContent = 'Forfeiting…';
        const slotIndex = parseInt(forfeitBtn.dataset.slot, 10);
        await apiForfeitSlot(warId, slotIndex);
        rerender();
      });
    }

    // Countdown ticker
    _startJoinCountdown(container, war);
  }

  async function _handleJoin(warId, slotIndex, war, rerender, container) {
    const errEl = container.querySelector('#wcc-join-error');
    const btn   = container.querySelector('#wcc-join-main-btn') ||
                  container.querySelector(`.wcc-join-btn[data-slot="${slotIndex}"]`);
    if (btn) { btn.disabled = true; btn.textContent = 'Connecting…'; }
    if (errEl) errEl.style.display = 'none';

    try {
      if (typeof Battle === 'undefined') throw new Error('Battle engine not loaded');

      // Ask backend if a room already exists for this slot
      const slotRes = await apiRegisterSlotRoom(warId, slotIndex, null);

      if (slotRes.ok && slotRes.data.battleRoomCode) {
        // Room already exists — join as guest
        await Battle.joinRoom(slotRes.data.battleRoomCode);
        _showWarMatchModal(slotIndex, war, warId, slotIndex, rerender);
      } else {
        // We are first — create the room and register the code
        const roomCode = await Battle.createRoom();
        const regRes = await apiRegisterSlotRoom(warId, slotIndex, roomCode);
        if (!regRes.ok) {
          throw new Error(regRes.data.error || 'Failed to register room');
        }
        _showWarMatchModal(slotIndex, war, warId, slotIndex, rerender);
      }
    } catch (e) {
      if (errEl) { errEl.textContent = e.message || 'Failed to start match'; errEl.style.display = ''; }
      if (btn) { btn.disabled = false; btn.textContent = '⚔️ Enter Battle'; }
    }
  }

  function _startJoinCountdown(container, war) {
    const el = container.querySelector('#wcc-join-countdown');
    if (!el) return;
    const deadline = new Date(war.windowStart || Date.now()).getTime() + FORFEIT_DELAY_MS;
    const tick = () => {
      if (!el.isConnected) return; // element removed
      const ms = Math.max(0, deadline - Date.now());
      el.textContent = _fmtMs(ms);
      if (ms > 0) requestAnimationFrame(tick);
      else el.textContent = '0:00';
    };
    requestAnimationFrame(tick);
  }

  async function _launchSpectator(roomCode) {
    try {
      await Battle.spectateRoom(roomCode);
    } catch (e) {
      // Spectate might fail if match is over; show brief notice
      const toast = document.getElementById('guild-error-toast');
      if (toast) { toast.textContent = `Cannot spectate: ${e.message}`; toast.style.display = ''; setTimeout(() => { toast.style.display = 'none'; }, 4000); }
    }
  }

  // ── War Match Starting modal ─────────────────────────────────────────────────

  function _showWarMatchModal(slotIndex, war, warId, mySlotIndex, rerender) {
    const overlay = document.getElementById('war-match-modal');
    if (!overlay) return;

    const myUserId = guildUserId();
    overlay.style.display = 'flex';

    const title = overlay.querySelector('#wmm-title');
    const sub   = overlay.querySelector('#wmm-sub');
    const timer = overlay.querySelector('#wmm-timer');
    if (title) title.textContent = `⚔️ WAR MATCH — SLOT ${slotIndex + 1}`;
    if (sub) sub.textContent = 'Your battle is live. Fight for your guild!';

    // Live countdown until war time limit
    if (timer) {
      const deadline = new Date(war.windowStart || Date.now()).getTime() + WAR_TIME_LIMIT_MS;
      const tick = () => {
        if (!timer.isConnected) return;
        const ms = Math.max(0, deadline - Date.now());
        timer.textContent = `⏱ ${_fmtMs(ms)} remaining`;
        if (ms > 0) setTimeout(tick, 1000);
      };
      tick();
    }

    // Wire close — closes modal but keeps battle open
    const closeBtn = overlay.querySelector('#wmm-close');
    if (closeBtn) closeBtn.onclick = () => { overlay.style.display = 'none'; };

    // Wire result reporting once Battle emits match-over
    if (typeof Battle !== 'undefined') {
      const onStateChange = async (data) => {
        if (data.state === 'finished' || data.state === 'disconnected') {
          Battle.off('state_change', onStateChange);
          overlay.style.display = 'none';

          // Determine result from Battle outcome
          const isWin  = data.outcome === 'win';
          const isLoss = data.outcome === 'loss';
          const isChallenger = (war.challengerGuildId === _loadMyGuildId());
          let result;
          if (isWin)       result = isChallenger ? 'challenger_win' : 'defender_win';
          else if (isLoss) result = isChallenger ? 'defender_win'   : 'challenger_win';
          else             result = 'draw';

          await apiReportSlotResult(warId, mySlotIndex, result);

          // Award guild XP for war win
          if (isWin && typeof awardGuildXP === 'function') awardGuildXP('clan_war_win');

          rerender();
        }
      };
      Battle.on('state_change', onStateChange);
    }
  }

  // Helper to get guildId from localStorage (mirrors guild.js pattern)
  function _loadMyGuildId() {
    try { return localStorage.getItem('mineCtris_guildId') || null; } catch (_) { return null; }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  return {
    /** Fetch slot data for an in_progress war */
    getSlots: apiGetSlots,

    /** Render the command center HTML string */
    renderCommandCenter,

    /** Wire event handlers after injecting HTML */
    wireCommandCenter,

    /** Start polling loop (calls onRefresh every 10s) */
    startPolling,

    /** Stop polling */
    stopPolling,

    /** Compute aggregate result from slots */
    aggregateSlots,

    /** Forfeit a slot directly */
    forfeitSlot: apiForfeitSlot,

    /** Check if any auto-forfeit should fire (call at war start time) */
    async checkAutoForfeits(warId, slots, war) {
      const started = war.windowStart ? new Date(war.windowStart).getTime() : 0;
      if (Date.now() < started + FORFEIT_DELAY_MS) return; // deadline not reached yet
      for (const slot of slots) {
        if (slot.status === 'waiting') {
          await apiForfeitSlot(warId, slot.slotIndex);
        }
      }
    },
  };
})();
