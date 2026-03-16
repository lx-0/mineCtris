// Game state management — score, HUD, danger warning, game over, and reset.
// Requires: state.js, config.js, inventory.js (updateInventoryHUD, inventoryTotal),
//           mining.js (unhighlightTarget), world.js (gridOccupancy)

function addScore(pts) {
  score += pts;
  updateScoreHUD();
  if (typeof achOnClassicScore === "function") achOnClassicScore(score);
}

/** Re-render the score HUD from current state. */
function updateScoreHUD() {
  if (!scoreEl) return;
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
      isWeeklyChallenge
        ? (weeklyModifier ? weeklyModifier.name : "Weekly")
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
  // Sprint and Blitz have no lose condition — never show danger warning
  if (isSprintMode || isBlitzMode) return;
  const dangerEl = document.getElementById("danger-overlay");
  const dangerTextEl = document.getElementById("danger-text");
  if (!dangerEl || !dangerTextEl) return;
  const inDanger =
    !isGameOver &&
    controls &&
    controls.isLocked &&
    getMaxBlockHeight() >= DANGER_ZONE_HEIGHT;
  dangerEl.style.display = inDanger ? "block" : "none";
  dangerTextEl.style.display = inDanger ? "block" : "none";
}

/** Check if any landed block has reached the game-over height. */
function checkGameOver() {
  // Sprint and Blitz have no lose condition — blocks can pile indefinitely
  if (isSprintMode || isBlitzMode) return;
  if (isGameOver) return;
  for (const gy of gridOccupancy.keys()) {
    if (gy >= GAME_OVER_HEIGHT) {
      triggerGameOver();
      return;
    }
  }
}

/** Freeze gameplay and display the Game Over screen. */
function triggerGameOver() {
  if (isGameOver) return;
  isGameOver = true;
  gameTimerRunning = false;
  if (typeof clearSaveState === "function") clearSaveState();

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
    statsEl.innerHTML =
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

  // Key lifetime stats on game-over screen
  const lifetimeStats = loadLifetimeStats();
  const goLifetimeEl = document.getElementById('go-lifetime-stats');
  if (goLifetimeEl) {
    goLifetimeEl.innerHTML =
      `<div><span class="go-label">BEST SCORE</span><br>${lifetimeStats.bestScore}</div>` +
      `<div><span class="go-label">GAMES PLAYED</span><br>${lifetimeStats.gamesPlayed}</div>` +
      `<div><span class="go-label">ALL-TIME LINES</span><br>${lifetimeStats.totalLinesCleared}</div>`;
  }

  // Submit and render high scores
  const hsRank = submitHighScore(
    state.score,
    state.elapsedSeconds,
    state.blocksMined,
    state.linesCleared
  );
  renderHighScoresGameOver(hsRank);

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
  iceBridgeSlowActive = false;
  iceBridgeSlowTimer  = 0.0;
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

  // Reset daily challenge state
  isDailyChallenge = false;
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

  // Tick banner display timer
  if (speedUpBannerTimer > 0) {
    speedUpBannerTimer -= delta;
    if (speedUpBannerTimer <= 0 && speedUpBannerEl) {
      speedUpBannerEl.style.display = "none";
    }
  }

  const tier = Math.floor(gameElapsedSeconds / DIFFICULTY_INTERVAL);
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
