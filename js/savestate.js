// Save / load / clear mid-game state using localStorage.
// Key: mineCtris_saveState
// Requires: state.js, config.js, world.js (createBlockMesh, registerBlock),
//           inventory.js (updateInventoryHUD), pieces.js (updateNextPiecesHUD, initPieceQueue),
//           gamestate.js (updateScoreHUD), daily.js (getDailyPrng, getTodayLabel)

const SAVE_STATE_KEY     = "mineCtris_saveState";
const SAVE_STATE_VERSION = 1;

/** Returns true if a saved game exists in localStorage. */
function hasSaveState() {
  try { return !!localStorage.getItem(SAVE_STATE_KEY); } catch (_) { return false; }
}

/** Remove saved game from localStorage and hide the Resume button. */
function clearSaveState() {
  try { localStorage.removeItem(SAVE_STATE_KEY); } catch (_) {}
  const btn = document.getElementById("start-resume-btn");
  if (btn) btn.style.display = "none";
}

/**
 * Serialize the current game state to localStorage after each piece lands.
 * Skips if game is over or a line-clear animation is in progress.
 */
function saveGameState() {
  if (isGameOver || lineClearInProgress) return;

  // Collect all landed blocks (position + color)
  const landedBlocks = [];
  worldGroup.children.forEach(function (obj) {
    if (obj.name === "landed_block" && obj.userData.isBlock && obj.userData.gridPos) {
      const gp = obj.userData.gridPos;
      landedBlocks.push({
        x: gp.x,
        y: gp.y,
        z: gp.z,
        color: obj.material.color.getHex()
      });
    }
  });

  const mode = isSprintMode     ? "sprint"
             : isBlitzMode      ? "blitz"
             : isDailyChallenge ? "daily"
             : "classic";

  const data = {
    version:             SAVE_STATE_VERSION,
    mode,
    score,
    blocksMined,
    linesCleared,
    gameElapsedSeconds,
    lastDifficultyTier,
    difficultyMultiplier,
    inventory:           Object.assign({}, inventory),
    selectedBlockColor,
    pickaxeTier,
    sprintElapsedMs,
    sprintTimerActive,
    blitzRemainingMs,
    blitzTimerActive,
    blitzBonusActive,
    pieceQueue:          pieceQueue.map(function (p) { return { index: p.index }; }),
    landedBlocks
  };

  try {
    localStorage.setItem(SAVE_STATE_KEY, JSON.stringify(data));
    const btn = document.getElementById("start-resume-btn");
    if (btn) btn.style.display = "block";
  } catch (_) {}
}

/**
 * Restore a previously saved game into the current world.
 * Call this BEFORE controls.lock() so all state is in place when the game starts.
 * Returns true on success, false if no valid save exists.
 */
function restoreGameState() {
  let data;
  try {
    const raw = localStorage.getItem(SAVE_STATE_KEY);
    if (!raw) return false;
    data = JSON.parse(raw);
    if (!data || data.version !== SAVE_STATE_VERSION) return false;
  } catch (_) { return false; }

  // ── Scores & stats ────────────────────────────────────────────────────────
  score               = data.score              || 0;
  blocksMined         = data.blocksMined         || 0;
  linesCleared        = data.linesCleared        || 0;
  gameElapsedSeconds  = data.gameElapsedSeconds  || 0;
  lastDifficultyTier  = data.lastDifficultyTier  || 0;
  difficultyMultiplier = data.difficultyMultiplier || 1.0;

  // ── Inventory & crafting ──────────────────────────────────────────────────
  inventory          = Object.assign({}, data.inventory || {});
  selectedBlockColor = data.selectedBlockColor  || null;
  pickaxeTier        = data.pickaxeTier         || "none";

  // ── Game mode ─────────────────────────────────────────────────────────────
  const mode        = data.mode || "classic";
  isSprintMode      = mode === "sprint";
  isBlitzMode       = mode === "blitz";
  isDailyChallenge  = mode === "daily";
  gameRng           = isDailyChallenge && typeof getDailyPrng === "function"
                      ? getDailyPrng() : null;

  // ── Mode-specific timers ──────────────────────────────────────────────────
  sprintElapsedMs  = data.sprintElapsedMs  || 0;
  sprintTimerActive = !!data.sprintTimerActive;
  blitzRemainingMs  = typeof data.blitzRemainingMs === "number"
                      ? data.blitzRemainingMs : BLITZ_DURATION_MS;
  blitzTimerActive  = !!data.blitzTimerActive;
  blitzBonusActive  = !!data.blitzBonusActive;

  // ── Piece queue ───────────────────────────────────────────────────────────
  if (Array.isArray(data.pieceQueue) && data.pieceQueue.length > 0) {
    pieceQueue.length = 0;
    data.pieceQueue.forEach(function (p) {
      if (p.index > 0 && p.index < SHAPES.length) {
        pieceQueue.push({ index: p.index, shape: SHAPES[p.index] });
      }
    });
  }
  if (pieceQueue.length === 0) initPieceQueue();
  updateNextPiecesHUD();

  // ── Restore landed blocks ─────────────────────────────────────────────────
  (data.landedBlocks || []).forEach(function (b) {
    const block = createBlockMesh(b.color);
    block.position.set(b.x, b.y, b.z);
    block.name = "landed_block";
    worldGroup.add(block);
    registerBlock(block);
  });

  // ── Update HUDs ───────────────────────────────────────────────────────────
  updateScoreHUD();
  updateInventoryHUD();

  // Show daily badge when resuming a daily run
  if (isDailyChallenge) {
    const badgeEl = document.getElementById("daily-challenge-badge");
    if (badgeEl && typeof getTodayLabel === "function") {
      badgeEl.textContent = "Daily: " + getTodayLabel();
      badgeEl.style.display = "block";
    }
  }

  return true;
}
