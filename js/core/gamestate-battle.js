// Battle game state — result processing, summary screen, difficulty, score race.
// Requires: core/gamestate.js loaded first.

function triggerBattleResult(result) {
  if (isGameOver) return; // already resolved
  isGameOver = true;
  gameTimerRunning = false;
  battleResult = result;

  // Hide danger overlay
  const dangerEl = document.getElementById('danger-overlay');
  const dangerTextEl = document.getElementById('danger-text');
  if (dangerEl) dangerEl.style.display = 'none';
  if (dangerTextEl) dangerTextEl.style.display = 'none';

  // Hide battle HUD badge and opponent mini-map
  const badgeEl = document.getElementById('battle-mode-badge');
  if (badgeEl) badgeEl.style.display = 'none';
  if (typeof battleHud !== 'undefined') battleHud.hide();

  // Capture our stats snapshot before WebSocket disconnect
  const _myStats = {
    score: score,
    linesCleared: linesCleared,
    blocksMined: blocksMined,
    rubbleMined: battleRubbleMined,
    garbageSent: battleGarbageSent,
    garbageReceived: battleGarbageReceived,
    highestCombo: sessionHighestComboCount,
    duration: Math.floor(gameElapsedSeconds),
  };

  // Notify opponent and share our stats so they can show their summary
  if (result === 'loss' && typeof battle !== 'undefined' && battle.state === BattleState.IN_GAME) {
    battle.send({ type: 'battle_game_over', stats: _myStats });
  }

  if (typeof stopBgMusic === 'function') stopBgMusic();

  // Award flat XP for battle (win: 150, draw: 75, loss: 50)
  const _xpEarned = result === 'win' ? 150 : result === 'draw' ? 75 : 50;
  const _lsStats = (typeof loadLifetimeStats === 'function') ? loadLifetimeStats() : { playerXP: 0 };
  const _oldXP = _lsStats.playerXP || 0;
  _lsStats.playerXP = _oldXP + _xpEarned;
  if (typeof saveLifetimeStats === 'function') saveLifetimeStats(_lsStats);
  const _newXP = _lsStats.playerXP;

  // Update Elo battle rating
  const _ratingChange = (typeof updateBattleRating === 'function')
    ? updateBattleRating(result, typeof battleOpponentRating !== 'undefined' ? battleOpponentRating : 1000)
    : null;

  // Fire battle achievements (win streak already updated by updateBattleRating above)
  if (typeof achOnBattleResult === 'function') {
    achOnBattleResult(result, _myStats.garbageReceived, _myStats.duration);
  }

  // Mastery tracking — rating updated above, read fresh from storage
  if (typeof masteryOnBattleResult === 'function') masteryOnBattleResult();

  // Fire battle mission hooks
  if (result === 'win' && typeof onMissionBattleWin === 'function') {
    onMissionBattleWin();
  }

  // Season mission hooks — ranked match
  if (typeof onSeasonMissionRankedMatchEnd === 'function') {
    onSeasonMissionRankedMatchEnd(result === 'win');
  }

  // Apply tournament win bonus (+50 rating) if this was a tournament match
  if (result === 'win' && typeof isTournamentMatch !== 'undefined' && isTournamentMatch) {
    if (typeof applyTournamentWinBonus === 'function') {
      applyTournamentWinBonus();
    }
  }
  if (typeof isTournamentMatch !== 'undefined') {
    isTournamentMatch = false; // reset for next match
  }

  // Submit rating to online leaderboard (non-blocking, rate-limited to 1/day)
  if (typeof trySubmitBattleRatingToLeaderboard === 'function') {
    setTimeout(trySubmitBattleRatingToLeaderboard, 500);
  }

  if (controls && controls.isLocked) controls.unlock();

  // Disconnect the battle WebSocket immediately — match is over
  if (typeof battle !== 'undefined') {
    try { battle.disconnect(); } catch (_) {}
  }

  const resultEl = document.getElementById('battle-result-screen');

  // Build the summary DOM into resultEl
  if (resultEl) {
    _buildBattleSummaryScreen(resultEl, result, _myStats, battleOpponentStats, _xpEarned, _oldXP, _newXP, _ratingChange);
  }

  // Show KO/Victory overlay first (~2.4s), then reveal post-match summary.
  function _showResultScreen() {
    if (resultEl) resultEl.style.display = 'flex';
    // Fire level-up toasts after a short delay so they play over the summary
    if (typeof checkLevelUp === 'function') {
      setTimeout(function () { checkLevelUp(_oldXP, _newXP); }, 600);
    }
  }

  if (typeof battleFx !== 'undefined') {
    battleFx.showKOScreen(result, _showResultScreen);
  } else {
    _showResultScreen();
  }
}

/**
 * Build the post-match summary screen HTML and wire up action buttons.
 * @param {HTMLElement} el        The #battle-result-screen container element.
 * @param {string}      result    'win' | 'loss' | 'draw'
 * @param {object}      myStats   Our match stats snapshot.
 * @param {object|null} oppStats  Opponent stats (may be null if not received yet).
 * @param {number}      xpEarned     XP awarded this match.
 * @param {number}      oldXP        Player XP before award.
 * @param {number}      newXP        Player XP after award.
 * @param {object|null} ratingChange { ratingBefore, ratingAfter, delta } or null.
 */
function _buildBattleSummaryScreen(el, result, myStats, oppStats, xpEarned, oldXP, newXP, ratingChange) {
  const modeLabel = battleMatchMode === 'score_race' ? 'SCORE RACE' : 'SURVIVAL';
  let bannerText, bannerClass;
  if (battleMatchMode === 'survival') {
    bannerText = result === 'win' ? 'VICTORY!' : 'KO';
    bannerClass = result === 'win' ? 'win' : 'loss';
  } else {
    bannerText = result === 'win' ? 'WIN' : result === 'loss' ? 'LOSS' : 'DRAW';
    bannerClass = result;
  }

  const opp = oppStats || {};

  function _fmtDur(secs) {
    const s = Math.max(0, secs | 0);
    return Math.floor(s / 60).toString().padStart(2, '0') + ':' + (s % 60).toString().padStart(2, '0');
  }

  const oppDur = (opp.duration != null) ? opp.duration : myStats.duration;

  const statRows = [
    ['SCORE',    myStats.score,          (opp.score          != null) ? opp.score          : '--'],
    ['LINES',    myStats.linesCleared,   (opp.linesCleared   != null) ? opp.linesCleared   : '--'],
    ['MINED',    myStats.blocksMined,    (opp.blocksMined    != null) ? opp.blocksMined    : '--'],
    ['RUBBLE',   myStats.rubbleMined,    (opp.rubbleMined    != null) ? opp.rubbleMined    : '--'],
    ['ATK SENT', myStats.garbageSent,    (opp.garbageSent    != null) ? opp.garbageSent    : '--'],
    ['ATK RECV', myStats.garbageReceived,(opp.garbageReceived!= null) ? opp.garbageReceived: '--'],
    ['COMBO',    myStats.highestCombo,   (opp.highestCombo   != null) ? opp.highestCombo   : '--'],
    ['TIME',     _fmtDur(myStats.duration), _fmtDur(oppDur)],
  ];

  // MVP badges
  const badges = [];
  if (opp.linesCleared != null) {
    badges.push({ icon: 'L', label: 'MOST LINES',  winner: myStats.linesCleared  >= opp.linesCleared  ? 'you' : 'opp' });
  }
  if (opp.blocksMined != null) {
    badges.push({ icon: 'M', label: 'BEST MINER',  winner: myStats.blocksMined   >= opp.blocksMined   ? 'you' : 'opp' });
  }
  if (opp.garbageSent != null) {
    badges.push({ icon: 'A', label: 'ATTACKER',    winner: myStats.garbageSent   >= opp.garbageSent   ? 'you' : 'opp' });
  }
  // Survivor badge
  if (result === 'draw') {
    badges.push({ icon: 'S', label: 'SURVIVOR', winner: 'both' });
  } else {
    badges.push({ icon: 'S', label: 'SURVIVOR', winner: result === 'win' ? 'you' : 'opp' });
  }

  const levelOld = (typeof getLevelFromXP === 'function') ? getLevelFromXP(oldXP) : 1;
  const levelNew = (typeof getLevelFromXP === 'function') ? getLevelFromXP(newXP) : 1;
  const didLevelUp = levelNew > levelOld;

  function _colHtml(rows, colIdx) {
    return rows.map(function (r) {
      return '<div class="brs-stat-row"><span class="brs-stat-label">' + r[0] + '</span><span class="brs-stat-val">' + r[colIdx] + '</span></div>';
    }).join('');
  }

  function _badgeHtml(b) {
    const winnerLabel = b.winner === 'both' ? 'BOTH' : (b.winner === 'you' ? 'YOU' : 'OPP');
    return '<div class="brs-badge brs-badge-' + b.winner + '">' +
      '<span class="brs-badge-icon brs-bi-' + b.icon.toLowerCase() + '"></span>' +
      '<span class="brs-badge-label">' + b.label + '</span>' +
      '<span class="brs-badge-winner">' + winnerLabel + '</span>' +
      '</div>';
  }

  el.innerHTML =
    '<div class="brs-mode">' + modeLabel + '</div>' +
    '<div class="brs-banner ' + bannerClass + '">' + bannerText + '</div>' +
    '<div class="brs-columns">' +
      '<div class="brs-player">' +
        '<div class="brs-player-label">YOU</div>' +
        _colHtml(statRows, 1) +
      '</div>' +
      '<div class="brs-col-divider"></div>' +
      '<div class="brs-player">' +
        '<div class="brs-player-label">OPPONENT</div>' +
        _colHtml(statRows, 2) +
      '</div>' +
    '</div>' +
    '<div class="brs-badges">' + badges.map(_badgeHtml).join('') + '</div>' +
    (ratingChange ? (function () {
      const tier = (typeof getBattleRankTier === 'function') ? getBattleRankTier(ratingChange.ratingAfter) : null;
      const tierBadge = tier ? ('<span class="battle-rank-badge battle-rank-' + tier.cls + '">' + tier.icon + ' ' + tier.name + '</span>') : '';
      const sign = ratingChange.delta >= 0 ? '+' : '';
      const deltaCls = ratingChange.delta >= 0 ? 'brs-rating-gain' : 'brs-rating-loss';
      return '<div class="brs-rating">' +
        tierBadge +
        '<span class="brs-rating-val">' + ratingChange.ratingAfter + '</span>' +
        '<span class="' + deltaCls + '">' + sign + ratingChange.delta + '</span>' +
        '</div>';
    })() : '') +
    '<div class="brs-xp">' +
      '<span class="brs-xp-earned">+' + xpEarned + ' XP</span>' +
      (didLevelUp
        ? '<span class="brs-level-up">LEVEL UP! L' + levelNew + '</span>'
        : '<span class="brs-level-cur">L' + levelNew + '</span>') +
    '</div>' +
    '<div class="brs-actions">' +
      '<button id="brs-rematch-btn">Rematch</button>' +
      '<button id="brs-newmatch-btn">New Opponent</button>' +
      '<button id="brs-menu-btn">Menu</button>' +
    '</div>';

  function _toBattleLobby() {
    el.style.display = 'none';
    resetGame();
    var battleOverlay = document.getElementById('battle-overlay');
    var blockerEl = document.getElementById('blocker');
    if (battleOverlay) {
      ['battle-choice-view', 'battle-create-view', 'battle-join-view', 'battle-ready-view'].forEach(function (id) {
        var v = document.getElementById(id);
        if (v) v.style.display = (id === 'battle-choice-view') ? '' : 'none';
      });
      if (blockerEl) blockerEl.style.display = 'none';
      battleOverlay.style.display = 'flex';
    }
  }

  var rematchBtn  = document.getElementById('brs-rematch-btn');
  var newMatchBtn = document.getElementById('brs-newmatch-btn');
  var menuBtn     = document.getElementById('brs-menu-btn');

  if (rematchBtn)  rematchBtn.onclick  = _toBattleLobby;
  if (newMatchBtn) newMatchBtn.onclick = function () {
    el.style.display = 'none';
    resetGame();
    // Open battle overlay and auto-click quick match
    var battleOverlay = document.getElementById('battle-overlay');
    var blockerEl = document.getElementById('blocker');
    if (battleOverlay) {
      ['battle-choice-view', 'battle-create-view', 'battle-join-view', 'battle-ready-view'].forEach(function (id) {
        var v = document.getElementById(id);
        if (v) v.style.display = (id === 'battle-choice-view') ? '' : 'none';
      });
      if (blockerEl) blockerEl.style.display = 'none';
      battleOverlay.style.display = 'flex';
      var qmBtn = document.getElementById('battle-quickmatch-btn');
      if (qmBtn) qmBtn.click();
    }
  };
  if (menuBtn) menuBtn.onclick = function () {
    el.style.display = 'none';
    resetGame();
  };
}

/**
 * Called every frame (while game is running). Derives the current difficulty
 * tier from gameElapsedSeconds, updates difficultyMultiplier, and shows the
 * speed-up banner when a new tier is reached.
 */
function updateDifficulty(delta) {
  // Sprint/Blitz: fixed speed = Classic Level 5; no escalation, no banner
  if (isSprintMode || isBlitzMode) {
    difficultyMultiplier = BLITZ_FIXED_MULTIPLIER;
    return;
  }
  // Puzzle mode: fixed slow speed; no escalation
  if (isPuzzleMode) return;

  // Tick banner display timer
  if (speedUpBannerTimer > 0) {
    speedUpBannerTimer -= delta;
    if (speedUpBannerTimer <= 0 && speedUpBannerEl) {
      speedUpBannerEl.style.display = "none";
    }
  }

  // Battle mode: difficulty starts at Level 3 and escalates from there.
  // Both players use the same time-based escalation so they stay synchronized.
  const battleOffset = isBattleMode ? BATTLE_START_TIER : 0;
  const tier = Math.floor(gameElapsedSeconds / DIFFICULTY_INTERVAL) + battleOffset;
  difficultyMultiplier = Math.min(
    DIFFICULTY_MAX_MULTIPLIER,
    Math.pow(DIFFICULTY_MULTIPLIER_PER_TIER, tier)
  );

  if (tier > lastDifficultyTier) {
    lastDifficultyTier = tier;
    if (typeof achOnDifficultyTier === "function") achOnDifficultyTier(tier);
    // Coach mark: first speed increase
    if (typeof coachMarkSpeedUp === "function") coachMarkSpeedUp(tier);
    if (speedUpBannerEl) {
      speedUpBannerEl.textContent =
        "SPEED UP!  Level " + (lastDifficultyTier + 1);
      speedUpBannerEl.style.display = "block";
      speedUpBannerTimer = 2.0;
    }
    updateScoreHUD();
    // Flash the level indicator
    const levelEl = document.getElementById("hud-level");
    if (levelEl) {
      levelEl.classList.remove("level-up-flash");
      void levelEl.offsetWidth; // force reflow to restart animation
      levelEl.classList.add("level-up-flash");
    }
  }
}

// ── Score Race helpers ────────────────────────────────────────────────────────

/**
 * Called every frame during a Score Race match. Ticks down the timer and
 * triggers match resolution when time runs out.
 * @param {number} delta seconds since last frame
 */
function checkBattleScoreRace(delta) {
  if (battleMatchMode !== 'score_race' || isGameOver) return;
  battleScoreRaceRemainingMs -= delta * 1000;
  _updateScoreRaceTimerHud();
  if (battleScoreRaceRemainingMs <= 0) {
    battleScoreRaceRemainingMs = 0;
    _updateScoreRaceTimerHud();
    // Notify opponent with our final score and summary stats
    if (typeof battle !== 'undefined' && battle.state === BattleState.IN_GAME) {
      battle.send({
        type: 'battle_score_race_end',
        score: score,
        linesCleared: linesCleared,
        stats: {
          score: score, linesCleared: linesCleared, blocksMined: blocksMined,
          rubbleMined: battleRubbleMined, garbageSent: battleGarbageSent,
          garbageReceived: battleGarbageReceived,
          highestCombo: sessionHighestComboCount,
          duration: Math.floor(gameElapsedSeconds),
        },
      });
    }
    _resolveScoreRace(score, linesCleared, battleOpponentScore, battleOpponentLines);
  }
}

/**
 * Compare scores and trigger the battle result.
 * @param {number} myScore
 * @param {number} myLines
 * @param {number} oppScore
 * @param {number} oppLines
 */
function _resolveScoreRace(myScore, myLines, oppScore, oppLines) {
  let result;
  if (myScore > oppScore) result = 'win';
  else if (myScore < oppScore) result = 'loss';
  else if (myLines > oppLines) result = 'win';
  else if (myLines < oppLines) result = 'loss';
  else result = 'draw';
  triggerBattleResult(result);
}

/** Refresh the Score Race countdown timer display. */
function _updateScoreRaceTimerHud() {
  const timerEl = document.getElementById('battle-score-race-timer');
  if (!timerEl) return;
  const totalSecs = Math.max(0, Math.ceil(battleScoreRaceRemainingMs / 1000));
  const mm = Math.floor(totalSecs / 60).toString().padStart(2, '0');
  const ss = (totalSecs % 60).toString().padStart(2, '0');
  timerEl.textContent = mm + ':' + ss;
  timerEl.classList.toggle('danger', battleScoreRaceRemainingMs <= 30000);
  // Update our score in the race HUD
  const mineEl = document.getElementById('battle-score-race-mine');
  if (mineEl) mineEl.textContent = score;
  const oppEl = document.getElementById('battle-score-race-opp');
  if (oppEl) oppEl.textContent = battleOpponentScore;
}
