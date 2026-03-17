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

  // Submit and render high scores (not for survival — it has its own table)
  if (!isSurvivalMode) {
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

  // Fade out background music, then play game-over jingle
  if (typeof stopBgMusic === "function") stopBgMusic();
  if (typeof playGameOverJingle === "function") playGameOverJingle();

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
function resetGame() {
  // Survival: if exiting without game over, record this as a survived session
  if (isSurvivalMode && !isGameOver && typeof recordSurvivedSession === 'function') {
    recordSurvivedSession({
      score:        score,
      blocksMined:  blocksMined,
      linesCleared: linesCleared,
      timeAlive:    gameElapsedSeconds,
    });
  }

  if (typeof resetBgMusic === "function") resetBgMusic();
  if (typeof clearSaveState === "function") clearSaveState();
  // Remove landed blocks (keep ground and trees)
  const toRemove = worldGroup.children.filter(
    (c) => c.name === "landed_block"
  );
  toRemove.forEach((b) => worldGroup.remove(b));

  // Clear falling pieces
  fallingPieces.forEach((p) => fallingPiecesGroup.remove(p));
  fallingPieces.length = 0;
  spawnTimer = 0;

  // Reset grid occupancy
  gridOccupancy.clear();

  // Reset fog to initial clear density
  if (scene.fog) scene.fog.density = 0.002;

  // Snap post-processing grade back to normal
  if (typeof resetPostProcessing === 'function') resetPostProcessing();

  // Reset score / stats
  score = 0;
  blocksMined = 0;
  linesCleared = 0;
  gameElapsedSeconds = 0;
  lastHudSecond = -1;

  // Reset session stats for lifetime tracking
  blocksPlaced = 0;
  sessionCrafts = 0;
  sessionConsumableCrafts = 0;
  sessionHighestComboCount = 0;
  if (typeof achResetSession === "function") achResetSession();
  if (typeof resetMissionSession === "function") resetMissionSession();

  // Reset difficulty
  difficultyMultiplier = 1.0;
  lastDifficultyTier = 0;
  speedUpBannerTimer = 0;
  if (speedUpBannerEl) {
    speedUpBannerEl.style.display = "none";
    speedUpBannerEl.style.color = "";
  }

  // Reset inventory
  inventory = {};
  selectedBlockColor = null;
  updateInventoryHUD();

  // Reset crafting state
  pickaxeTier        = "none";
  hasCraftingBench   = false;
  consumables        = { lava_flask: 0, ice_bridge: 0 };
  powerUps           = { row_bomb: 0, slow_down: 0, shield: 0, magnet: 0, time_freeze: 0 };
  iceBridgeSlowActive = false;
  iceBridgeSlowTimer  = 0.0;
  // Reset power-up effect state
  equippedPowerUpType = null;
  slowDownActive = false;
  slowDownTimer  = 0.0;
  shieldActive   = false;
  magnetActive   = false;
  magnetTimer    = 0.0;
  magnetLastPullTime = 0.0;
  timeFreezeActive = false;
  timeFreezeTimer  = 0.0;
  counterActive  = false;
  fortressActive = false;
  fortressTimer  = 0.0;
  obsidianPickaxeActive = false;
  const powerupHudEl = document.getElementById("powerup-hud");
  if (powerupHudEl) powerupHudEl.style.display = "none";
  closeCraftingPanel();

  // Clear tree respawn queue
  treeRespawnQueue.length = 0;

  // Reset nudge state
  nudgeCooldown = 0;
  const nudgeHintEl = document.getElementById("nudge-hint");
  if (nudgeHintEl) nudgeHintEl.style.display = "none";

  // Reset sprint state
  isSprintMode      = false;
  sprintTimerActive = false;
  sprintElapsedMs   = 0;
  sprintComplete    = false;
  const sprintCompleteEl = document.getElementById("sprint-complete-screen");
  if (sprintCompleteEl) sprintCompleteEl.style.display = "none";

  // Reset blitz state
  isBlitzMode       = false;
  blitzTimerActive  = false;
  blitzRemainingMs  = BLITZ_DURATION_MS;
  blitzComplete     = false;
  blitzBonusActive  = false;
  const blitzCompleteEl = document.getElementById("blitz-complete-screen");
  if (blitzCompleteEl) blitzCompleteEl.style.display = "none";
  // Reset timer HUD color
  if (scoreEl) {
    const timerEl = scoreEl.querySelector(".hud-stat:nth-child(4)");
    if (timerEl) timerEl.style.color = "";
  }

  // Reset co-op mode state
  isCoopMode = false;
  coopPieceQueue.length = 0;
  _coopPosBroadcastLastTime = 0;
  _coopPosLastSent = null;
  coopScore = 0;
  coopMyScore = 0;
  coopPartnerScore = 0;
  coopPartnerMaxY = 0;
  coopHeightBroadcastLastTime = 0;
  coopPartnerStatus = 'disconnected';
  coopPartnerLastSeenTime = 0;
  coopMyBlocksMined = 0;
  coopMyLinesTriggered = 0;
  coopMyCraftsMade = 0;
  coopMyTradesCompleted = 0;
  coopPartnerBlocksMined = 0;
  coopPartnerLinesTriggered = 0;
  coopPartnerCraftsMade = 0;
  coopPartnerTradesCompleted = 0;
  coopPartnerName = '';
  coopStatsReceived = false;
  if (typeof coopAvatar !== 'undefined') coopAvatar.destroy();
  if (typeof coopTrade !== 'undefined') coopTrade.reset();
  coopPartnerLastPos = null;
  // Reset co-op difficulty state
  coopDifficulty = 'normal';
  coopFallMultiplier = 1.5;
  coopScoreMultiplier = 1.8;
  coopBonusBannerTimer = 0;
  const coopBonusEl = document.getElementById('coop-bonus-overlay');
  if (coopBonusEl) coopBonusEl.style.display = 'none';
  // Hide co-op HUD elements
  const coopBadgeEl2 = document.getElementById('coop-mode-badge');
  if (coopBadgeEl2) coopBadgeEl2.style.display = 'none';
  const coopHudEl2 = document.getElementById('coop-score-display');
  if (coopHudEl2) coopHudEl2.style.display = 'none';
  const coopPartnerStatusEl2 = document.getElementById('coop-partner-status');
  if (coopPartnerStatusEl2) coopPartnerStatusEl2.style.display = 'none';
  const coopGoEl = document.getElementById('coop-game-over-screen');
  if (coopGoEl) coopGoEl.style.display = 'none';
  const coopPartnerLeftEl = document.getElementById('coop-partner-left-dialog');
  if (coopPartnerLeftEl) coopPartnerLeftEl.style.display = 'none';

  // Reset daily challenge state
  isDailyChallenge = false;
  isDailyCoopChallenge = false;
  gameRng = null;
  const dailyBadgeEl = document.getElementById('daily-challenge-badge');
  if (dailyBadgeEl) dailyBadgeEl.style.display = 'none';

  // Reset weekly challenge state
  isWeeklyChallenge = false;
  weeklyModifier = null;
  weeklyNoIron = false;
  weeklyGoldRush = false;
  weeklyIceAge = false;
  weeklyDoubleOrNothing = false;
  weeklyBlindDrop = false;
  const weeklyBadgeEl = document.getElementById('weekly-challenge-badge');
  if (weeklyBadgeEl) weeklyBadgeEl.style.display = 'none';

  // Reset battle mode state
  isBattleMode = false;
  battleResult = null;
  battleMatchMode = 'survival';
  battleScoreRaceRemainingMs = 180000;
  battleOpponentScore = 0;
  battleOpponentLines = 0;
  battleGarbageSent = 0;
  battleGarbageReceived = 0;
  battleRubbleMined = 0;
  battleOpponentStats = null;
  if (typeof resetGarbageQueue === 'function') resetGarbageQueue();
  const battleBadgeEl = document.getElementById('battle-mode-badge');
  if (battleBadgeEl) battleBadgeEl.style.display = 'none';
  const battleResultEl = document.getElementById('battle-result-screen');
  if (battleResultEl) battleResultEl.style.display = 'none';
  const battleSrHudEl = document.getElementById('battle-score-race-hud');
  if (battleSrHudEl) battleSrHudEl.style.display = 'none';

  // Reset survival mode state
  isSurvivalMode = false;
  survivalSessionNumber = 1;
  const survivalBadgeEl = document.getElementById('survival-badge');
  if (survivalBadgeEl) survivalBadgeEl.style.display = 'none';
  const survGoEl2 = document.getElementById('survival-go-section');
  if (survGoEl2) survGoEl2.style.display = 'none';
  const goTitleEl2 = document.getElementById('game-over-title');
  if (goTitleEl2) goTitleEl2.textContent = 'GAME OVER';
  const hsLabelEl2 = document.getElementById('hs-go-label');
  if (hsLabelEl2) hsLabelEl2.style.display = '';
  const hsTableEl2 = document.getElementById('hs-go-table');
  if (hsTableEl2) hsTableEl2.style.display = '';

  // Reset event engine
  if (typeof resetEventEngine === "function") resetEventEngine();

  // Reset world modifier
  if (typeof resetWorldModifier === 'function') resetWorldModifier();
  const worldModBadgeEl = document.getElementById('world-modifier-badge');
  if (worldModBadgeEl) worldModBadgeEl.style.display = 'none';

  // Reset puzzle mode state
  isPuzzleMode = false;
  puzzlePuzzleId = 1;
  puzzleComplete = false;
  if (typeof resetPuzzleState === "function") resetPuzzleState();
  if (typeof puzzleFixedQueue !== "undefined") puzzleFixedQueue.length = 0;
  if (typeof hidePuzzleSelect === "function") hidePuzzleSelect();

  // Reset custom puzzle mode state
  isCustomPuzzleMode = false;
  customPuzzleWinCondition = null;
  customPlayFromEditor = false;
  const puzzleCompleteEl = document.getElementById("puzzle-complete-screen");
  if (puzzleCompleteEl) puzzleCompleteEl.style.display = "none";
  const puzzleBadgeEl2 = document.getElementById("puzzle-badge");
  if (puzzleBadgeEl2) puzzleBadgeEl2.style.display = "none";

  // Reset next-piece queue
  initPieceQueue();
  if (nextPiecesEl) nextPiecesEl.style.display = "none";

  // Reset mining feedback state
  miningShakeActive = false;
  miningShakeBlock = null;
  dustParticles.forEach((p) => scene.remove(p.mesh));
  dustParticles = [];

  // Reset line-clear state
  lineClearInProgress = false;
  lineClearFlashBlocks = [];
  lineClearPendingYs = [];
  bannerTimer = 0;
  if (lineClearBannerEl) lineClearBannerEl.style.display = "none";

  // Reset combo state
  comboCount = 0;
  lastClearTime = -1;
  comboBannerTimer = 0;
  if (comboBannerEl) comboBannerEl.style.display = "none";
  lastClearWasTetris = false;

  // Reset player
  if (controls) {
    controls.getObject().position.set(0, PLAYER_HEIGHT, 5);
    playerVelocity.set(0, 0, 0);
    playerPushVelocity.set(0, 0, 0);
    screenShakeActive = false;
    playerOnGround = false;
    canJump = false;
    moveForward = moveBackward = moveLeft = moveRight = false;
  }

  // Reset editor mode state
  if (isEditorMode && typeof cleanupEditorMode === "function") cleanupEditorMode();
  isEditorMode = false;
  moveUp = false;
  moveDown = false;
  const editorHudEl = document.getElementById("editor-hud");
  if (editorHudEl) editorHudEl.style.display = "none";

  // Reset game over / pause flags
  isGameOver = false;
  isPaused = false;

  // Hide Game Over and pause screens
  const gameOverEl = document.getElementById("game-over-screen");
  if (gameOverEl) gameOverEl.style.display = "none";
  const pauseScreenEl = document.getElementById("pause-screen");
  if (pauseScreenEl) pauseScreenEl.style.display = "none";

  updateScoreHUD();

  // Return to start screen (hide mode select if it was open)
  const modeSelectEl = document.getElementById("mode-select");
  if (modeSelectEl) modeSelectEl.style.display = "none";
  blocker.style.display = "flex";
  instructions.style.display = "";
  crosshair.style.display = "none";
  if (scoreEl) scoreEl.style.display = "none";
  document.getElementById("inventory-hud").style.display = "none";

  renderHighScoresStart();
}

// Battle mode Level 3 starting multiplier (tier 2 = Math.pow(1.1, 2))
const BATTLE_START_MULTIPLIER = Math.pow(1.1, 2); // ≈ 1.21
const BATTLE_START_TIER = 2; // Display "Level 3" at game start

/**
 * Show battle post-match summary screen (win/loss/draw).
 * Called from checkGameOver (loss), battle opponent-left handler (win), or
 * opponent_game_over message (win). Sets battleResult and isBattleMode = false.
 */
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

  // Fire battle mission hooks
  if (result === 'win' && typeof onMissionBattleWin === 'function') {
    onMissionBattleWin();
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
