// Game state management — score, HUD, danger warning, game over, and reset.
// Requires: state.js, config.js, inventory.js (updateInventoryHUD, inventoryTotal),
//           mining.js (unhighlightTarget), world.js (gridOccupancy)

function addScore(pts) {
  score += pts;
  updateScoreHUD();
}

/** Re-render the score HUD from current state. */
function updateScoreHUD() {
  if (!scoreEl) return;
  scoreEl.querySelector(".hud-score").textContent = score;
  scoreEl.querySelector(".hud-stat:nth-child(2)").textContent =
    "Blocks: " + blocksMined;
  if (isSprintMode) {
    // Sprint: show progress toward 40 lines and sprint elapsed time
    scoreEl.querySelector(".hud-stat:nth-child(3)").textContent =
      "Lines: " + linesCleared + "/" + SPRINT_LINE_TARGET;
    const sprintSecs = Math.floor(sprintElapsedMs / 1000);
    const sm = Math.floor(sprintSecs / 60).toString().padStart(2, "0");
    const ss = (sprintSecs % 60).toString().padStart(2, "0");
    scoreEl.querySelector(".hud-stat:nth-child(4)").textContent =
      "Time: " + sm + ":" + ss;
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
      "Level " + (lastDifficultyTier + 1);
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
  // Sprint has no lose condition — never show danger warning
  if (isSprintMode) return;
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
  // Sprint has no lose condition — blocks can pile indefinitely
  if (isSprintMode) return;
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
  } else {
    const dailyEl = document.getElementById('daily-go-section');
    if (dailyEl) dailyEl.style.display = 'none';
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

/** Reset all game state and return to the start screen. */
function resetGame() {
  if (typeof resetBgMusic === "function") resetBgMusic();
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
  sessionHighestComboCount = 0;

  // Reset difficulty
  difficultyMultiplier = 1.0;
  lastDifficultyTier = 0;
  speedUpBannerTimer = 0;
  if (speedUpBannerEl) speedUpBannerEl.style.display = "none";

  // Reset inventory
  inventory = {};
  selectedBlockColor = null;
  updateInventoryHUD();

  // Reset crafting state
  pickaxeTier = "none";
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

  // Reset daily challenge state
  isDailyChallenge = false;
  gameRng = null;
  const dailyBadgeEl = document.getElementById('daily-challenge-badge');
  if (dailyBadgeEl) dailyBadgeEl.style.display = 'none';

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
  // Sprint: fixed speed = Classic Level 5; no escalation, no banner
  if (isSprintMode) {
    difficultyMultiplier = SPRINT_FIXED_MULTIPLIER;
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
