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
  const totalSecs = Math.floor(gameElapsedSeconds);
  const mm = Math.floor(totalSecs / 60).toString().padStart(2, "0");
  const ss = (totalSecs % 60).toString().padStart(2, "0");
  scoreEl.querySelector(".hud-score").textContent = score;
  scoreEl.querySelector(".hud-stat:nth-child(2)").textContent =
    "Blocks: " + blocksMined;
  scoreEl.querySelector(".hud-stat:nth-child(3)").textContent =
    "Lines: " + linesCleared;
  scoreEl.querySelector(".hud-stat:nth-child(4)").textContent =
    "Time: " + mm + ":" + ss;
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

  // Show Game Over overlay
  const gameOverEl = document.getElementById("game-over-screen");
  if (gameOverEl) gameOverEl.style.display = "flex";

  // Release pointer lock so the Play Again button is clickable
  if (controls && controls.isLocked) controls.unlock();
}

/** Reset all game state and return to the start screen. */
function resetGame() {
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

  // Reset score / stats
  score = 0;
  blocksMined = 0;
  linesCleared = 0;
  gameElapsedSeconds = 0;
  lastHudSecond = -1;

  // Reset inventory
  inventory = {};
  updateInventoryHUD();

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

  // Reset player
  if (controls) {
    controls.getObject().position.set(0, PLAYER_HEIGHT, 5);
    playerVelocity.set(0, 0, 0);
    playerOnGround = false;
    canJump = false;
    moveForward = moveBackward = moveLeft = moveRight = false;
  }

  // Reset game over flag
  isGameOver = false;

  // Hide Game Over screen
  const gameOverEl = document.getElementById("game-over-screen");
  if (gameOverEl) gameOverEl.style.display = "none";

  updateScoreHUD();

  // Return to start screen
  blocker.style.display = "flex";
  instructions.style.display = "";
  crosshair.style.display = "none";
  if (scoreEl) scoreEl.style.display = "none";
  document.getElementById("inventory-hud").style.display = "none";
}
