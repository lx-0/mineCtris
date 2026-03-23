// Guild war UI helpers — pure rendering utilities for war cards.
// Requires: social/guild.js loaded first (for _esc).

  function _renderWarHistoryCard(war, myGuildId) {
    const isChallenger = war.challengerGuildId === myGuildId;
    const opName  = _esc(isChallenger ? (war.defenderGuildName   || war.defenderGuildId)   : (war.challengerGuildName || war.challengerGuildId));
    const opTag   = _esc(isChallenger ? (war.defenderGuildTag    || '') : (war.challengerGuildTag || ''));
    const weWon   = war.winner === myGuildId;
    const isDraw  = war.winner === 'draw';
    const resCls  = isDraw ? 'draw' : weWon ? 'win' : 'loss';
    const resLbl  = isDraw ? '🤝 Draw' : weWon ? '🏆 Victory' : '💀 Defeat';

    // Slot score line (e.g. 3-2)
    const cW = war.challengerSlotWins || 0;
    const dW = war.defenderSlotWins   || 0;
    const mySlotWins  = isChallenger ? cW : dW;
    const opSlotWins  = isChallenger ? dW : cW;
    const scoreLine   = war.status === 'completed' ? `${mySlotWins}–${opSlotWins}` : '';

    // Rating delta
    let ratingHtml = '';
    if (war.status === 'completed') {
      const delta = isChallenger ? (war.challengerRatingDelta || 0) : (war.defenderRatingDelta || 0);
      if (delta !== 0) {
        const sign = delta > 0 ? '+' : '';
        const cls  = delta > 0 ? 'war-rating-up' : 'war-rating-down';
        ratingHtml = `<span class="${cls}">${sign}${delta}</span>`;
      }
    }

    const dateStr = war.completedAt ? _fmtWarTime(war.completedAt) : (war.windowStart ? _fmtWarTime(war.windowStart) : '');

    // Slot grid (hidden by default, revealed on click)
    let slotsHtml = '';
    const slots = war.slots || [];
    if (slots.length > 0) {
      const rows = slots.map(s => {
        const done = s.status === 'done' || s.status === 'forfeited';
        const isChallengerWin = s.result === 'challenger_win';
        let slotRes = '—', slotCls = '';
        if (done) {
          if (s.result === 'draw') { slotRes = '🤝'; slotCls = 'slot-draw'; }
          else {
            const isMineWin = isChallenger ? isChallengerWin : !isChallengerWin;
            slotRes = isMineWin ? '🏆' : '💀';
            slotCls = isMineWin ? 'slot-win' : 'slot-loss';
          }
        }
        const myPlayer = _esc(isChallenger ? (s.challengerUserId || '—') : (s.defenderUserId || '—'));
        const opPlayer = _esc(isChallenger ? (s.defenderUserId   || '—') : (s.challengerUserId || '—'));
        return `<div class="war-slot-row ${slotCls}">
          <span class="slot-num">#${s.slotIndex + 1}</span>
          <span class="slot-player">${myPlayer}</span>
          <span class="slot-vs">vs</span>
          <span class="slot-player">${opPlayer}</span>
          <span class="slot-result">${slotRes}</span>
        </div>`;
      }).join('');
      slotsHtml = `<div class="war-slots-detail" style="display:none">${rows}</div>`;
    }

    return `<div class="war-history-card war-history-card--${resCls}" data-war-id="${_esc(war.id)}">
      <div class="war-history-header">
        <div class="war-history-vs">vs <strong>${opName}</strong> [${opTag}]</div>
        <div class="war-history-result">${resLbl} ${scoreLine ? `<span class="war-score">${scoreLine}</span>` : ''} ${ratingHtml}</div>
      </div>
      <div class="war-history-meta">${dateStr}${slots.length > 0 ? ' · <span class="war-expand-hint">click to expand</span>' : ''}</div>
      ${slotsHtml}
    </div>`;
  }

  function _renderWarSummaryCard(war, myGuildId, withDetailBtn) {
    const isChallenger = war.challengerGuildId === myGuildId;
    const opponentName = isChallenger
      ? (war.defenderGuildName   || war.defenderGuildId)
      : (war.challengerGuildName || war.challengerGuildId);
    const opponentTag  = isChallenger ? (war.defenderGuildTag || '') : (war.challengerGuildTag || '');
    const statusLabel  = _warStatusLabel(war.status);
    const statusClass  = _warStatusClass(war.status);

    let timeHtml = '';
    if (war.windowStart) {
      timeHtml = `<div class="war-card-time">🕐 ${_fmtWarTime(war.windowStart)}</div>`;
    } else if (war.proposedWindowStart) {
      timeHtml = `<div class="war-card-time">📅 Proposed: ${_fmtWarTime(war.proposedWindowStart)}</div>`;
    }

    let winnerHtml = '';
    if (war.status === 'completed' && war.winner) {
      const weWon = war.winner === myGuildId;
      const isDraw = war.winner === 'draw';
      winnerHtml = isDraw
        ? `<div class="war-card-result war-card-result--draw">Draw</div>`
        : weWon
          ? `<div class="war-card-result war-card-result--win">Victory</div>`
          : `<div class="war-card-result war-card-result--loss">Defeat</div>`;
    }

    return `<div class="war-card">
      <div class="war-card-header">
        <div class="war-card-vs">vs <strong>${_esc(opponentName)}</strong> [${_esc(opponentTag)}]</div>
        <span class="war-status-badge war-status-badge--${statusClass}">${statusLabel}</span>
      </div>
      ${timeHtml}
      ${winnerHtml}
      ${withDetailBtn ? `<button class="guild-secondary-btn war-detail-btn" id="war-detail-btn-${_esc(war.id)}">Details →</button>` : ''}
    </div>`;
  }

  function _warStatusLabel(status) {
    return {
      pending_acceptance: 'Awaiting Response',
      scheduled: 'Scheduled',
      roster_open: 'Roster Open',
      roster_locked: 'Roster Locked',
      in_progress: 'IN PROGRESS',
      completed: 'Completed',
      cancelled: 'Cancelled',
    }[status] || status;
  }

  function _warStatusClass(status) {
    return {
      pending_acceptance: 'pending',
      scheduled: 'scheduled',
      roster_open: 'roster',
      roster_locked: 'roster',
      in_progress: 'active',
      completed: 'done',
      cancelled: 'cancelled',
    }[status] || 'pending';
  }

  function _fmtWarTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
    } catch (_) { return iso; }
  }

