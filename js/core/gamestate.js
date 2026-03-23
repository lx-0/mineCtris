// Game state management — score, HUD, danger warning, game over, and reset.
// Requires: state.js, config.js, inventory.js (updateInventoryHUD, inventoryTotal),
//           mining.js (unhighlightTarget), world.js (gridOccupancy)

function addScore(pts) {
  const _wmod = typeof getWorldModifier === 'function' ? getWorldModifier() : null;
  let _mult = _wmod ? _wmod.scoreMultiplier : 1.0;
  if (isCoopMode) _mult *= coopScoreMultiplier;
  const _actual = (_mult !== 1.0) ? Math.round(pts * _mult) : pts;
  score += _actual;
  if (isCoopMode) {
    coopScore += _actual;
    coopMyScore += _actual;
    if (typeof coop !== 'undefined' && coop.state === CoopState.IN_GAME) {
      coop.send({ type: 'score', delta: _actual });
    }
    if (typeof achOnCoopScoreUpdate === 'function') achOnCoopScoreUpdate(coopScore);
  }
  updateScoreHUD();
  if (typeof achOnClassicScore === "function") achOnClassicScore(score);
}

/** Re-render the co-op combined score HUD. */
function updateCoopScoreHUD() {
  const el = document.getElementById('coop-score-display');
  if (!el) return;
  el.querySelector('.coop-combined-score').textContent = coopScore;
  el.querySelector('.coop-score-sub').textContent =
    'You: ' + coopMyScore + '  |  Partner: ' + coopPartnerScore;
}

/** Update the partner status dot color. */
function updateCoopPartnerStatus() {
  const dotEl = document.getElementById('coop-partner-dot');
  if (!dotEl) return;
  if (coopPartnerStatus === 'connected') {
    dotEl.style.background = '#00ff88';
  } else if (coopPartnerStatus === 'lagging') {
    dotEl.style.background = '#ffcc00';
  } else {
    dotEl.style.background = '#ff4444';
  }
}

/** Re-render the score HUD from current state. */
function updateScoreHUD() {
  if (!scoreEl) return;
  if (isCoopMode) {
    updateCoopScoreHUD();
    return;
  }
  scoreEl.querySelector(".hud-score").textContent = score;
  scoreEl.querySelector(".hud-stat:nth-child(2)").textContent =
    "Blocks: " + blocksMined;
  if (isBlitzMode) {
    // Blitz: show lines and countdown timer (gold when bonus active)
    scoreEl.querySelector(".hud-stat:nth-child(3)").textContent =
      "Lines: " + linesCleared;
    const blitzSecs = Math.max(0, Math.ceil(blitzRemainingMs / 1000));
    const bm = Math.floor(blitzSecs / 60).toString().padStart(2, "0");
    const bs = (blitzSecs % 60).toString().padStart(2, "0");
    const timerEl = scoreEl.querySelector(".hud-stat:nth-child(4)");
    timerEl.textContent = "Time: " + bm + ":" + bs;
    timerEl.style.color = blitzBonusActive ? "#ffd700" : "";
    scoreEl.querySelector(".hud-stat:nth-child(5)").textContent = "Blitz";
  } else if (isSprintMode) {
    // Sprint: show progress toward 40 lines and sprint elapsed time
    scoreEl.querySelector(".hud-stat:nth-child(3)").textContent =
      "Lines: " + linesCleared + "/" + SPRINT_LINE_TARGET;
    const sprintSecs = Math.floor(sprintElapsedMs / 1000);
    const sm = Math.floor(sprintSecs / 60).toString().padStart(2, "0");
    const ss = (sprintSecs % 60).toString().padStart(2, "0");
    scoreEl.querySelector(".hud-stat:nth-child(4)").textContent =
      "Time: " + sm + ":" + ss;
    scoreEl.querySelector(".hud-stat:nth-child(4)").style.color = "";
    scoreEl.querySelector(".hud-stat:nth-child(5)").textContent = "Sprint";
  } else {
    const totalSecs = Math.floor(gameElapsedSeconds);
    const mm = Math.floor(totalSecs / 60).toString().padStart(2, "0");
    const ss = (totalSecs % 60).toString().padStart(2, "0");
    scoreEl.querySelector(".hud-stat:nth-child(3)").textContent =
      "Lines: " + linesCleared;
    scoreEl.querySelector(".hud-stat:nth-child(4)").textContent =
      "Time: " + mm + ":" + ss;
    scoreEl.querySelector(".hud-stat:nth-child(5)").textContent =
      isPuzzleMode
        ? "Puzzle " + puzzlePuzzleId
        : isWeeklyChallenge
          ? (weeklyModifier ? weeklyModifier.name : "Weekly")
          : isBattleMode
            ? "Battle L" + (lastDifficultyTier + 1)
            : "Level " + (lastDifficultyTier + 1);
  }
}

/** Returns current game stats for use by the Game Over screen. */
function getGameState() {
  return {
    score,
    blocksMined,
    linesCleared,
    elapsedSeconds: gameElapsedSeconds,
  };
}

/** Return the highest occupied Y level, or 0 if world is empty. */
function getMaxBlockHeight() {
  let maxY = 0;
  for (const gy of gridOccupancy.keys()) {
    if (gy > maxY) maxY = gy;
  }
  return maxY;
}

/** Show/hide the danger overlay based on current max block height. */
function updateDangerWarning() {
  // Sprint, Blitz, Puzzle, and Battle have no lose-by-height condition displayed here
  if (isSprintMode || isBlitzMode || isPuzzleMode || isBattleMode) return;
  const dangerEl = document.getElementById("danger-overlay");
  const dangerTextEl = document.getElementById("danger-text");
  if (!dangerEl || !dangerTextEl) return;
  const localMaxY = getMaxBlockHeight();
  const authHeight = isCoopMode ? Math.max(localMaxY, coopPartnerMaxY) : localMaxY;
  const inDanger =
    !isGameOver &&
    controls &&
    controls.isLocked &&
    authHeight >= DANGER_ZONE_HEIGHT;
  dangerEl.style.display = inDanger ? "block" : "none";
  dangerTextEl.style.display = inDanger ? "block" : "none";
  // Contextual game tooltip: first danger warning
  if (inDanger && typeof gameTooltip === 'function') gameTooltip('dangerWarning');
}

/** Check if any landed block has reached the game-over height. */
function checkGameOver() {
  // Sprint and Blitz have no lose condition — blocks can pile indefinitely
  if (isSprintMode || isBlitzMode) return;
  if (isGameOver) return;
  const localMaxY = getMaxBlockHeight();
  const authHeight = isCoopMode ? Math.max(localMaxY, coopPartnerMaxY) : localMaxY;
  if (authHeight >= GAME_OVER_HEIGHT) {
    // Battle mode: trigger battle loss, not regular game-over
    if (isBattleMode) {
      triggerBattleResult('loss');
      return;
    }
    // Shield power-up: absorb the first game-over trigger (solo only)
    if (shieldActive && !isCoopMode) {
      shieldActive = false;
      showCraftedBanner("Shield absorbed the blow! Keep going.");
      if (typeof updatePowerupHUD === "function") updatePowerupHUD();
      // Visual: absorption burst flash + chromatic hit
      const shEl = document.getElementById("shield-overlay");
      if (shEl) {
        shEl.style.display = "block";
        shEl.classList.add("absorb");
        shEl.addEventListener("animationend", function onEnd() {
          shEl.style.display = "none";
          shEl.classList.remove("absorb");
          shEl.removeEventListener("animationend", onEnd);
        }, { once: true });
      }
      if (typeof triggerChromaticAberration === "function") triggerChromaticAberration(0.007, 0.5);
      return;
    }
    // In co-op: broadcast game-over to partner before triggering locally
    if (isCoopMode && typeof coop !== 'undefined' && coop.state === CoopState.IN_GAME) {
      coop.send({ type: 'game_over', reason: 'height' });
    }
    triggerGameOver();
  }
}

/** Freeze gameplay and display the Game Over screen. */
function triggerGameOver() {
  if (isGameOver) return;
  isGameOver = true;
  gameTimerRunning = false;
  if (typeof clearSaveState === "function") clearSaveState();
  // Contextual game tooltip: first game over (dismiss any active tooltip first)
  if (typeof gameTooltipDismiss === 'function') gameTooltipDismiss();
  if (typeof gameTooltip === 'function') gameTooltip('gameOver', { score: score });

  // Co-op game over: show co-op summary and bail out
  if (isCoopMode) {
    const dangerEl = document.getElementById("danger-overlay");
    const dangerTextEl = document.getElementById("danger-text");
    if (dangerEl) dangerEl.style.display = "none";
    if (dangerTextEl) dangerTextEl.style.display = "none";
    if (typeof stopBgMusic === "function") stopBgMusic();
    if (typeof playGameOverJingle === "function") playGameOverJingle();
    if (typeof achOnCoopGameOver === "function") achOnCoopGameOver(gameElapsedSeconds);
    _showCoopGameOver();
    // Host sends stats first; guest will reply when it receives host's stats
    if (typeof coop !== 'undefined' && typeof coop.isHost !== 'undefined' && coop.isHost) {
      coopStatsReceived = false;
      coop.send({
        type: 'game_end_stats',
        blocksMined:     coopMyBlocksMined,
        linesTriggered:  coopMyLinesTriggered,
        craftsMade:      coopMyCraftsMade,
        tradesCompleted: coopMyTradesCompleted,
        name: typeof loadDisplayName === 'function' ? (loadDisplayName() || 'You') : 'You',
      });
    }
    if (controls && controls.isLocked) controls.unlock();
    return;
  }

  // Survival mode: record run, clear the world, then show special summary
  if (isSurvivalMode) {
    const survStats = typeof submitSurvivalStats === "function"
      ? submitSurvivalStats(score, gameElapsedSeconds, survivalSessionNumber)
      : null;
    if (typeof clearSurvivalWorld === "function") clearSurvivalWorld();

    // Build survival summary section in game-over overlay
    const survGoEl = document.getElementById("survival-go-section");
    if (survGoEl && survStats) {
      const bestMin = Math.floor(survStats.bestTimeAlive / 60).toString().padStart(2, "0");
      const bestSec = (Math.floor(survStats.bestTimeAlive) % 60).toString().padStart(2, "0");
      survGoEl.innerHTML =
        '<div class="go-label" style="margin-bottom:4px;">SURVIVAL WORLD LOST</div>' +
        '<div>Sessions on this world: ' + survivalSessionNumber + '</div>' +
        '<div>All-time runs: ' + survStats.totalRuns + '</div>' +
        '<div>Best score: ' + survStats.bestScore + '</div>' +
        '<div>Best survival time: ' + bestMin + ':' + bestSec + '</div>';
      survGoEl.style.display = "block";
    }

    // Change game-over title for survival mode
    const goTitleEl = document.getElementById("game-over-title");
    if (goTitleEl) goTitleEl.textContent = "WORLD LOST";
  }

  // Hide danger overlay immediately
  const dangerEl = document.getElementById("danger-overlay");
  const dangerTextEl = document.getElementById("danger-text");
  if (dangerEl) dangerEl.style.display = "none";
  if (dangerTextEl) dangerTextEl.style.display = "none";

  // Populate stats
  const state = getGameState();
  const totalSecs = Math.floor(state.elapsedSeconds);
  const mm = Math.floor(totalSecs / 60).toString().padStart(2, "0");
  const ss = (totalSecs % 60).toString().padStart(2, "0");
  const statsEl = document.getElementById("game-over-stats");
  if (statsEl) {
    const _goMod = typeof getWorldModifier === 'function' ? getWorldModifier() : null;
    const _modBadge = (_goMod && _goMod.id !== 'normal')
      ? `<div class="go-modifier-badge">${_goMod.icon} ${_goMod.name} <span class="go-modifier-mult">\xD7${_goMod.scoreMultiplier}</span></div>`
      : '';
    statsEl.innerHTML =
      _modBadge +
      `<div><span class="go-label">SCORE</span><br>${state.score}</div>` +
      `<div><span class="go-label">BLOCKS MINED</span><br>${state.blocksMined}</div>` +
      `<div><span class="go-label">LINES CLEARED</span><br>${state.linesCleared}</div>` +
      `<div><span class="go-label">TIME SURVIVED</span><br>${mm}:${ss}</div>`;
  }

  // Record lifetime stats
  submitLifetimeStats({
    score: state.score,
    blocksMined: state.blocksMined,
    linesCleared: state.linesCleared,
    blocksPlaced,
    totalCrafts: sessionCrafts,
    highestComboCount: sessionHighestComboCount,
    highestDifficultyTier: lastDifficultyTier,
    isDailyChallenge,
  });

  // Metrics: log session end
  if (typeof metricsSessionEnd === 'function') {
    metricsSessionEnd({ score: state.score, linesCleared: state.linesCleared, blocksMined: state.blocksMined });
  }

  // Mastery tracking
  if (typeof masteryOnClassicEnd === 'function') {
    masteryOnClassicEnd({
      score:           state.score,
      linesCleared:    state.linesCleared,
      maxCombo:        sessionHighestComboCount,
      difficultyTier:  lastDifficultyTier,
      timeSeconds:     state.elapsedSeconds,
      pickaxeTier:     pickaxeTier,
      isSurvivalMode:  isSurvivalMode,
      isDailyChallenge: isDailyChallenge,
      blocksPlaced:    blocksPlaced,
    });
  }

  // Daily missions: classic survival time (only in pure classic mode)
  if (!isDailyChallenge && !isWeeklyChallenge) {
    if (typeof onMissionClassicEnd === "function") onMissionClassicEnd(state.elapsedSeconds);
  }

  // Award XP (capture old XP to detect level-up)
  const _xpModeKey = isDailyChallenge ? 'daily'
    : isWeeklyChallenge ? 'weekly'
    : 'classic';
  const _xpBefore = (loadLifetimeStats().playerXP || 0);
  const { xpEarned: _xpEarned, streakBonus: _xpStreak } = awardXP(state.score, _xpModeKey);
  const goXpEl = document.getElementById('go-xp-earned');
  if (goXpEl) {
    goXpEl.textContent = '+ ' + _xpEarned + ' XP' + (_xpStreak ? '  (Streak Bonus!)' : '');
    goXpEl.className = 'xp-earned-display' + (_xpStreak ? ' xp-streak' : '');
  }

  // Level-up detection after XP award
  const _xpAfter = (loadLifetimeStats().playerXP || 0);
  if (typeof checkLevelUp === 'function') checkLevelUp(_xpBefore, _xpAfter);
  if (typeof updateStreakHUD === 'function') updateStreakHUD();

  // Coach mark: first game over — explain XP and leveling
  if (typeof coachMarkGameOver === 'function') coachMarkGameOver();

  // Key lifetime stats on game-over screen
  const lifetimeStats = loadLifetimeStats();
  const goLifetimeEl = document.getElementById('go-lifetime-stats');
  if (goLifetimeEl) {
    goLifetimeEl.innerHTML =
      `<div><span class="go-label">BEST SCORE</span><br>${lifetimeStats.bestScore}</div>` +
      `<div><span class="go-label">GAMES PLAYED</span><br>${lifetimeStats.gamesPlayed}</div>` +
      `<div><span class="go-label">ALL-TIME LINES</span><br>${lifetimeStats.totalLinesCleared}</div>`;
  }

  // Level badge on game-over screen
  const goLevelEl = document.getElementById('go-level-badge-row');
  if (goLevelEl && typeof getLevelFromXP === 'function') {
    const _goLevel = getLevelFromXP(_xpAfter);
    const _goTitle = typeof getLevelTitle === 'function' ? getLevelTitle(_goLevel) : '';
    goLevelEl.innerHTML =
      `<span class="go-level-badge">` +
      (typeof getLevelBadgeLabel === 'function' ? getLevelBadgeLabel(_goLevel) : 'L' + _goLevel) +
      `</span>` +
      (_goTitle ? `<span class="go-level-title"> ${_goTitle}</span>` : '');
  }

  // Submit and render high scores (not for survival or expedition — each has its own screen)
  const _inExpedition = (typeof activeBiomeId !== 'undefined') && !!activeBiomeId;
  if (!isSurvivalMode && !_inExpedition) {
    const hsRank = submitHighScore(
      state.score,
      state.elapsedSeconds,
      state.blocksMined,
      state.linesCleared
    );
    renderHighScoresGameOver(hsRank);
  } else {
    // Hide classic HS table in survival mode
    const hsLabelEl = document.getElementById("hs-go-label");
    const hsTableEl = document.getElementById("hs-go-table");
    if (hsLabelEl) hsLabelEl.style.display = "none";
    if (hsTableEl) hsTableEl.style.display = "none";
  }

  // Daily challenge score tracking
  if (isDailyChallenge) {
    const isNewDailyBest = submitDailyScore(
      state.score,
      state.elapsedSeconds,
      state.blocksMined,
      state.linesCleared
    );
    renderDailyBestGameOver(isNewDailyBest);
    if (typeof achOnDailyComplete === "function") achOnDailyComplete();
    if (typeof onMissionDailyEnd === "function") onMissionDailyEnd(state.score);
    if (typeof initLeaderboardSubmitBtn === "function") {
      initLeaderboardSubmitBtn(state.score, state.linesCleared);
    }
  } else {
    const dailyEl = document.getElementById('daily-go-section');
    if (dailyEl) dailyEl.style.display = 'none';
  }

  // Weekly challenge score tracking
  if (isWeeklyChallenge) {
    const isNewWeeklyBest = submitWeeklyScore(
      state.score,
      state.elapsedSeconds,
      state.blocksMined,
      state.linesCleared
    );
    renderWeeklyBestGameOver(isNewWeeklyBest);
    if (typeof achOnWeeklyComplete === "function") achOnWeeklyComplete(state.score);
    if (typeof onMissionWeeklyEnd === "function") onMissionWeeklyEnd(state.score);
    if (typeof initWeeklyLeaderboardSubmitBtn === "function") {
      initWeeklyLeaderboardSubmitBtn(state.score, state.linesCleared);
    }
  } else {
    const weeklyEl = document.getElementById('weekly-go-section');
    if (weeklyEl) weeklyEl.style.display = 'none';
    if (!isDailyChallenge && typeof hideLeaderboardSubmitBtn === "function") {
      hideLeaderboardSubmitBtn();
    }
  }

  // Hide survival section when not in survival mode
  if (!isSurvivalMode) {
    const survGoEl = document.getElementById('survival-go-section');
    if (survGoEl) survGoEl.style.display = 'none';
  }

  // Wire up Share Score button
  const shareBtn = document.getElementById("go-share-btn");
  const shareFeedback = document.getElementById("go-share-feedback");
  if (shareBtn) {
    shareBtn.onclick = function () {
      const weeklyModeLabel = isWeeklyChallenge
        ? "Weekly Challenge" + (weeklyModifier ? " \u2014 " + weeklyModifier.name : "")
        : null;
      const modeLine = isDailyChallenge ? "Daily Challenge"
        : weeklyModeLabel ? weeklyModeLabel
        : isBlitzMode ? "Blitz" : "Classic";

      // Build deep link URL with encoded score data
      const modeKey = isDailyChallenge ? "Daily"
        : isWeeklyChallenge ? "Weekly"
        : isBlitzMode ? "Blitz" : "Classic";
      const timeStr = mm + ss; // e.g. "0342"
      const shareParam = modeKey + "-" + state.score + "-" + state.linesCleared + "-" + timeStr;
      const displayName = typeof loadDisplayName === "function" ? loadDisplayName() : "";
      const baseUrl = location.href.split("?")[0].split("#")[0];
      let shareUrl = baseUrl + "?share=" + encodeURIComponent(shareParam);
      if (displayName) {
        shareUrl += "&sname=" + encodeURIComponent(displayName);
      }

      // Fall back to plain text if URL somehow exceeds 2000 chars
      const MAX_URL = 2000;
      const copyContent = shareUrl.length <= MAX_URL ? shareUrl
        : "MINETRIS\n" + modeLine + " \u2014 Score: " + state.score.toLocaleString() + " | Lines: " + state.linesCleared + " | Survived: " + mm + ":" + ss;

      // Remove any old fallback input
      const oldWrap = document.getElementById("go-share-fallback-wrap");
      if (oldWrap) oldWrap.remove();

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(copyContent).then(function () {
          if (typeof onMissionScoreShared === "function") onMissionScoreShared();
          if (shareFeedback) {
            shareFeedback.textContent = "Copied!";
            shareFeedback.classList.add("visible");
            clearTimeout(shareFeedback._fadeTimer);
            shareFeedback._fadeTimer = setTimeout(function () {
              shareFeedback.classList.remove("visible");
            }, 1500);
          }
        }).catch(function () {
          showShareFallback(copyContent, shareBtn);
        });
      } else {
        showShareFallback(copyContent, shareBtn);
      }
    };
  }

  // Community goals: submit contribution (fire-and-forget)
  if (typeof submitCommunityGoalContribution === 'function') {
    submitCommunityGoalContribution({
      blocksMined:     state.blocksMined,
      linesCleared:    state.linesCleared,
      maxCombo:        sessionHighestComboCount,
      sprintCompleted: (typeof isSprintMode !== 'undefined' && isSprintMode &&
                        typeof sprintComplete !== 'undefined' && sprintComplete) ? 1 : 0,
    });
  }

  // Fade out background music, then play game-over jingle
  if (typeof stopBgMusic === "function") stopBgMusic();
  if (typeof playGameOverJingle === "function") playGameOverJingle();

  // Expedition mode: show dedicated results screen instead of generic game-over
  if (_inExpedition && typeof showExpeditionResults === 'function') {
    showExpeditionResults({
      score:        state.score,
      linesCleared: state.linesCleared,
      blocksMined:  state.blocksMined,
      timeSeconds:  state.elapsedSeconds,
    });
    if (controls && controls.isLocked) controls.unlock();
    return;
  }

  // First-game teaser: show "more ways to play" after first game
  if (typeof onFirstGameOver === 'function') onFirstGameOver();

  // Show Game Over overlay
  const gameOverEl = document.getElementById("game-over-screen");
  if (gameOverEl) gameOverEl.style.display = "flex";

  // Release pointer lock so the Play Again button is clickable
  if (controls && controls.isLocked) controls.unlock();
}

/** Populate the co-op summary DOM elements with current data. */
function _populateCoopSummary() {
  const el = document.getElementById('coop-game-over-screen');
  if (!el) return;

  const myName = (typeof loadDisplayName === 'function' ? loadDisplayName() : '') || 'You';
  const partnerName = coopPartnerName || 'Partner';

  // Header
  const combinedEl = el.querySelector('#coop-go-combined-score');
  if (combinedEl) combinedEl.textContent = 'COMBINED SCORE: ' + coopScore.toLocaleString();

  const totalSecs = Math.floor(gameElapsedSeconds);
  const mm = Math.floor(totalSecs / 60).toString().padStart(2, '0');
  const ss = (totalSecs % 60).toString().padStart(2, '0');
  const timeEl = el.querySelector('#coop-go-time');
  if (timeEl) timeEl.textContent = 'SURVIVAL TIME: ' + mm + ':' + ss;

  // Column headers with MVP crown
  const mvpCol = _getCoopMVP(myName, partnerName);
  const myHeaderEl  = el.querySelector('#coop-go-col-my-name');
  const prtHeaderEl = el.querySelector('#coop-go-col-partner-name');
  if (myHeaderEl)  myHeaderEl.innerHTML  = (mvpCol === 'me'      ? '&#x1F451; ' : '') + _escHtml(myName);
  if (prtHeaderEl) prtHeaderEl.innerHTML = (mvpCol === 'partner' ? '&#x1F451; ' : '') + _escHtml(partnerName);

  // MVP / Perfect Partnership badge
  const mvpBadgeEl = el.querySelector('#coop-go-mvp-badge');
  if (mvpBadgeEl) {
    if (mvpCol === 'tie') {
      mvpBadgeEl.textContent = '🤝 Perfect Partnership!';
      mvpBadgeEl.style.display = 'block';
    } else {
      const mvpName = mvpCol === 'me' ? myName : partnerName;
      mvpBadgeEl.textContent = '👑 MVP: ' + mvpName;
      mvpBadgeEl.style.display = 'block';
    }
  }

  // Contribution rows
  const rows = [
    ['SCORE',       coopMyScore,           coopPartnerScore],
    ['BLOCKS MINED',coopMyBlocksMined,     coopPartnerBlocksMined],
    ['LINES TRIG.', coopMyLinesTriggered,  coopPartnerLinesTriggered],
    ['CRAFTS MADE', coopMyCraftsMade,      coopPartnerCraftsMade],
    ['TRADES',      coopMyTradesCompleted, coopPartnerTradesCompleted],
  ];
  const tableEl = el.querySelector('#coop-go-contribution-table');
  if (tableEl) {
    tableEl.innerHTML = rows.map(function (r) {
      return '<tr>' +
        '<td class="coop-go-stat-label">' + r[0] + '</td>' +
        '<td class="coop-go-stat-val">' + (typeof r[1] === 'number' ? r[1].toLocaleString() : r[1]) + '</td>' +
        '<td class="coop-go-stat-val">' + (typeof r[2] === 'number' ? r[2].toLocaleString() : r[2]) + '</td>' +
        '</tr>';
    }).join('');
  }
}

/**
 * Determine MVP column: 'me', 'partner', or 'tie'.
 * MVP = most lines triggered; tie-break = higher score; full tie = 'tie'.
 */
function _getCoopMVP(myName, partnerName) {
  if (coopMyLinesTriggered > coopPartnerLinesTriggered) return 'me';
  if (coopPartnerLinesTriggered > coopMyLinesTriggered) return 'partner';
  // Lines tied — break on score
  if (coopMyScore > coopPartnerScore) return 'me';
  if (coopPartnerScore > coopMyScore) return 'partner';
  return 'tie';
}

/** Escape HTML for safe insertion. */
function _escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/** Refresh summary with partner stats once they arrive. */
function _refreshCoopGameOver() {
  _populateCoopSummary();
}

/** Show the co-op game-over summary screen. */
function _showCoopGameOver() {
  const el = document.getElementById('coop-game-over-screen');
  if (!el) return;
  _populateCoopSummary();
  el.style.display = 'flex';
}

/** Show a selectable text input as fallback when clipboard API is unavailable. */
function showShareFallback(text, anchorBtn) {
  const wrap = document.createElement("div");
  wrap.id = "go-share-fallback-wrap";
  wrap.className = "go-share-fallback-wrap";
  const label = document.createElement("label");
  label.textContent = "Copy manually:";
  const input = document.createElement("input");
  input.id = "go-share-fallback-input";
  input.type = "text";
  input.readOnly = true;
  input.value = text.replace(/\n/g, " | ");
  wrap.appendChild(label);
  wrap.appendChild(input);
  anchorBtn.insertAdjacentElement("afterend", wrap);
  input.select();
}

/** Reset all game state and return to the start screen. */
