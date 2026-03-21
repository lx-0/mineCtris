// js/clan-war-results.js — Clan War Results: ELO rating, post-war result screen, share card.
// Requires: guild.js (GUILD_API, guildUserId, _loadMyGuildId)

const ClanWarResults = (() => {
  const K_FACTOR      = 32;
  const RATING_FLOOR  = 100;
  const DEFAULT_RATING = 1000;

  // ── ELO helpers ──────────────────────────────────────────────────────────────

  /**
   * Compute ELO rating change for one side.
   * @param {number} myRating
   * @param {number} opponentRating
   * @param {'win'|'draw'|'loss'} outcome
   * @returns {number} signed integer rating delta
   */
  function computeEloChange(myRating, opponentRating, outcome) {
    const expected = 1 / (1 + Math.pow(10, (opponentRating - myRating) / 400));
    const actual   = outcome === 'win' ? 1.0 : outcome === 'draw' ? 0.5 : 0.0;
    return Math.round(K_FACTOR * (actual - expected));
  }

  /**
   * Apply a rating change, enforcing the floor.
   * @param {number} oldRating
   * @param {number} change
   * @returns {number}
   */
  function applyElo(oldRating, change) {
    return Math.max(RATING_FLOOR, oldRating + change);
  }

  // ── API helpers ──────────────────────────────────────────────────────────────

  async function _apiFetch(path, options = {}) {
    try {
      const res  = await fetch(GUILD_API + path, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: { error: 'Network error' } };
    }
  }

  /** GET /api/guilds/:guildId/rating — current rating + last-10 war history */
  async function apiGetGuildRating(guildId) {
    return _apiFetch(`/api/guilds/${guildId}/rating`);
  }

  /** POST /api/wars/:warId/finalize — trigger ELO update after last slot resolves */
  async function apiFinalizeWar(warId) {
    return _apiFetch(`/api/wars/${warId}/finalize`, { method: 'POST', body: '{}' });
  }

  // ── MVP detection ─────────────────────────────────────────────────────────────

  /**
   * Identify the MVP player from the completed slot results.
   * MVP = winner of a slot with the highest line-clear count, or shortest match time,
   * or first winning slot if neither stat is available.
   * @param {object[]} slots
   * @returns {{ playerId: string, slotIndex: number } | null}
   */
  function findMvp(slots) {
    const winnerSlots = slots.filter(s =>
      (s.status === 'done' || s.status === 'forfeited') &&
      (s.result === 'challenger_win' || s.result === 'defender_win')
    );
    if (!winnerSlots.length) return null;

    // Score each winner slot: prefer higher linesCleared, then shorter matchTimeMs
    const scored = winnerSlots.map(slot => {
      const isChallengerWin = slot.result === 'challenger_win';
      const playerId = isChallengerWin ? slot.challengerUserId : slot.defenderUserId;
      const lines    = isChallengerWin
        ? (slot.challengerLinesCleared || slot.challengerLines || 0)
        : (slot.defenderLinesCleared   || slot.defenderLines   || 0);
      const timeMs   = slot.matchTimeMs || slot.durationMs || Infinity;
      return { playerId, slotIndex: slot.slotIndex, lines, timeMs };
    });

    scored.sort((a, b) => {
      if (b.lines !== a.lines) return b.lines - a.lines; // more lines = better
      return a.timeMs - b.timeMs;                        // less time  = better
    });

    const best = scored[0];
    return { playerId: best.playerId, slotIndex: best.slotIndex };
  }

  // ── HTML escaping ─────────────────────────────────────────────────────────────

  function _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Result screen rendering ───────────────────────────────────────────────────

  /**
   * Render the post-war result screen HTML.
   * @param {object}   war         — war object
   * @param {object[]} slots       — slot array (completed)
   * @param {string}   myGuildId
   * @param {number}   myOldRating
   * @param {number}   opOldRating
   * @param {number}   myChange    — signed integer
   */
  function renderResultScreen(war, slots, myGuildId, myOldRating, opOldRating, myChange) {
    const isChallenger = war.challengerGuildId === myGuildId;
    const myName   = isChallenger
      ? (war.challengerGuildName || war.challengerGuildId)
      : (war.defenderGuildName   || war.defenderGuildId);
    const opName   = isChallenger
      ? (war.defenderGuildName   || war.defenderGuildId)
      : (war.challengerGuildName || war.challengerGuildId);
    const myTag    = isChallenger ? (war.challengerGuildTag || '') : (war.defenderGuildTag || '');
    const opTag    = isChallenger ? (war.defenderGuildTag   || '') : (war.challengerGuildTag || '');

    // Aggregate slot scores
    let myWins = 0, opWins = 0;
    for (const slot of slots) {
      if (slot.status !== 'done' && slot.status !== 'forfeited') continue;
      const isChallengerWin = slot.result === 'challenger_win';
      if (isChallenger) {
        if (isChallengerWin) myWins++; else if (slot.result === 'defender_win') opWins++;
      } else {
        if (!isChallengerWin && slot.result === 'defender_win') myWins++;
        else if (isChallengerWin) opWins++;
      }
    }

    const winner = myWins > opWins ? 'mine' : myWins < opWins ? 'theirs' : 'draw';
    const isDraw = winner === 'draw';
    const weWon  = winner === 'mine';

    // Banner
    const bannerCls   = isDraw ? 'draw' : weWon ? 'win' : 'loss';
    const bannerLabel = isDraw ? '🤝 DRAW' : weWon ? '🏆 VICTORY' : '💀 DEFEAT';

    // Rating change line
    const changeSign  = myChange >= 0 ? '+' : '';
    const changeCls   = myChange >= 0 ? 'wrs-rating-up' : 'wrs-rating-down';
    const changeArrow = myChange >= 0 ? '▲' : '▼';
    const ratingHtml  = `
      <div class="wrs-rating-row">
        <span class="wrs-rating-label">Guild Rating</span>
        <span class="wrs-rating-old">${myOldRating}</span>
        <span class="wrs-rating-arrow">→</span>
        <span class="wrs-rating-new">${applyElo(myOldRating, myChange)}</span>
        <span class="${changeCls}">${changeArrow} ${changeSign}${myChange}</span>
      </div>`;

    // Slot-by-slot results grid
    const mvp = findMvp(slots);
    const slotsHtml = slots.map(slot => {
      const done = slot.status === 'done' || slot.status === 'forfeited';
      let resultLabel = '—';
      let resultCls   = '';
      if (done) {
        if (slot.result === 'draw') { resultLabel = '🤝 Draw'; resultCls = 'wrs-slot-draw'; }
        else {
          const isChallengerWin = slot.result === 'challenger_win';
          const isMineWin = isChallenger ? isChallengerWin : !isChallengerWin;
          resultLabel = isMineWin ? '🏆 Win' : '💀 Loss';
          resultCls   = isMineWin ? 'wrs-slot-win' : 'wrs-slot-loss';
        }
      }
      const isMvpSlot = mvp && mvp.slotIndex === slot.slotIndex;
      return `
        <div class="wrs-slot-row${isMvpSlot ? ' wrs-slot-row--mvp' : ''}">
          <div class="wrs-slot-num">#${slot.slotIndex + 1}</div>
          <div class="wrs-slot-players">
            <span>${_esc(slot.challengerUserId || '—')}</span>
            <span class="wrs-slot-vs">vs</span>
            <span>${_esc(slot.defenderUserId || '—')}</span>
          </div>
          <div class="wrs-slot-result ${resultCls}">${resultLabel}${isMvpSlot ? ' ⭐ MVP' : ''}</div>
        </div>`;
    }).join('');

    // Score header
    const scoreHtml = `
      <div class="wrs-score-header">
        <div class="wrs-score-side">
          <div class="wrs-score-guild">${_esc(myName)} [${_esc(myTag)}]</div>
          <div class="wrs-score-num ${weWon ? 'wrs-score-num--win' : ''}">${myWins}</div>
        </div>
        <div class="wrs-score-sep">vs</div>
        <div class="wrs-score-side">
          <div class="wrs-score-guild">${_esc(opName)} [${_esc(opTag)}]</div>
          <div class="wrs-score-num ${!weWon && !isDraw ? 'wrs-score-num--win' : ''}">${opWins}</div>
        </div>
      </div>`;

    // MVP callout
    const mvpHtml = mvp
      ? `<div class="wrs-mvp">⭐ MVP: <strong>${_esc(mvp.playerId)}</strong></div>`
      : '';

    return `
      <div class="wrs-panel">
        <div class="wrs-banner wrs-banner--${bannerCls}">${bannerLabel}</div>
        ${scoreHtml}
        ${ratingHtml}
        <div class="wrs-section-title">SLOT RESULTS</div>
        <div class="wrs-slots">${slotsHtml}</div>
        ${mvpHtml}
        <div class="wrs-actions">
          <button class="guild-primary-btn" id="wrs-share-btn">📤 Share Result</button>
          <button class="guild-secondary-btn" id="wrs-close-btn">✕ Close</button>
        </div>
      </div>`;
  }

  // ── Modal show/hide ───────────────────────────────────────────────────────────

  /**
   * Fetch ratings, compute ELO change, and show the war result screen modal.
   * @param {object}   war
   * @param {object[]} slots
   * @param {string}   myGuildId
   */
  async function showResultScreen(war, slots, myGuildId) {
    const overlay = document.getElementById('war-result-screen');
    if (!overlay) return;

    const isChallenger = war.challengerGuildId === myGuildId;
    const opGuildId    = isChallenger ? war.defenderGuildId : war.challengerGuildId;

    // Fetch both guild ratings in parallel
    const [myRes, opRes] = await Promise.all([
      apiGetGuildRating(myGuildId),
      apiGetGuildRating(opGuildId),
    ]);

    const myOldRating = (myRes.ok && myRes.data.rating) ? myRes.data.rating : DEFAULT_RATING;
    const opOldRating = (opRes.ok && opRes.data.rating) ? opRes.data.rating : DEFAULT_RATING;

    // Determine war outcome for my guild
    let myWins = 0, opWins = 0;
    for (const slot of slots) {
      if (slot.status !== 'done' && slot.status !== 'forfeited') continue;
      const isChallengerWin = slot.result === 'challenger_win';
      if (isChallenger) {
        if (isChallengerWin) myWins++; else if (slot.result === 'defender_win') opWins++;
      } else {
        if (!isChallengerWin && slot.result === 'defender_win') myWins++;
        else if (isChallengerWin) opWins++;
      }
    }
    const outcome = myWins > opWins ? 'win' : myWins < opWins ? 'loss' : 'draw';
    const myChange = computeEloChange(myOldRating, opOldRating, outcome);

    const inner = overlay.querySelector('#war-result-screen-inner');
    if (inner) {
      inner.innerHTML = renderResultScreen(war, slots, myGuildId, myOldRating, opOldRating, myChange);
    }

    overlay.style.display = 'flex';

    // Wire buttons
    const closeBtn = overlay.querySelector('#wrs-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => { overlay.style.display = 'none'; });

    const shareBtn = overlay.querySelector('#wrs-share-btn');
    if (shareBtn) {
      const mvp = findMvp(slots);
      shareBtn.addEventListener('click', () => _shareResultCard(war, myGuildId, myWins, opWins, mvp, myChange));
    }
  }

  // ── Share card (canvas) ───────────────────────────────────────────────────────

  function _shareResultCard(war, myGuildId, myWins, opWins, mvp, ratingChange) {
    const W = 520, H = 260;
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const isChallenger = war.challengerGuildId === myGuildId;
    const myName   = isChallenger
      ? (war.challengerGuildName || war.challengerGuildId || 'Us')
      : (war.defenderGuildName   || war.defenderGuildId   || 'Us');
    const opName   = isChallenger
      ? (war.defenderGuildName   || war.defenderGuildId   || 'Them')
      : (war.challengerGuildName || war.challengerGuildId || 'Them');

    const weWon  = myWins > opWins;
    const isDraw = myWins === opWins;
    const bgColor = isDraw ? '#1a1a0d' : weWon ? '#0a1a0a' : '#1a0a0a';

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, W, H);

    // Accent bar
    ctx.fillStyle = isDraw ? '#facc15' : weWon ? '#4ade80' : '#f87171';
    ctx.fillRect(0, 0, W, 4);

    // Game label
    ctx.fillStyle = '#888';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('MINECTRIS  ⚔️  CLAN WAR', 20, 26);

    // Result label
    const resultText = isDraw ? 'DRAW' : weWon ? 'VICTORY' : 'DEFEAT';
    ctx.fillStyle = isDraw ? '#facc15' : weWon ? '#4ade80' : '#f87171';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(resultText, W / 2, 72);

    // Guild names + score
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(_truncate(myName, 18), 20, 115);
    ctx.textAlign = 'right';
    ctx.fillText(_truncate(opName, 18), W - 20, 115);

    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${myWins}  –  ${opWins}`, W / 2, 155);

    // Rating change
    const changeSign = ratingChange >= 0 ? '+' : '';
    ctx.font = '13px monospace';
    ctx.fillStyle = ratingChange >= 0 ? '#4ade80' : '#f87171';
    ctx.textAlign = 'center';
    ctx.fillText(`Guild Rating: ${changeSign}${ratingChange}`, W / 2, 185);

    // MVP
    if (mvp) {
      ctx.font = '11px monospace';
      ctx.fillStyle = '#facc15';
      ctx.textAlign = 'center';
      ctx.fillText(`⭐ MVP: ${_truncate(mvp.playerId, 20)}`, W / 2, 207);
    }

    // Footer
    ctx.fillStyle = '#444';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('minetris.pages.dev', 20, H - 12);
    ctx.textAlign = 'right';
    ctx.fillText(new Date().toLocaleDateString(), W - 20, H - 12);

    // Download
    const link = document.createElement('a');
    link.download = `minectris-clan-war-${(war.id || 'result').slice(0, 8)}.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function _truncate(str, max) {
    str = String(str || '');
    return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  return {
    computeEloChange,
    applyElo,
    apiGetGuildRating,
    apiFinalizeWar,
    findMvp,
    renderResultScreen,
    showResultScreen,
  };
})();
