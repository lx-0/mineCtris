// Puzzle Mode — definitions, progress tracking, preset-block setup, and completion.
// Requires: state.js, config.js (COLORS, BLOCK_TYPES), world.js (createBlockMesh, registerBlock),
//           gamestate.js (submitLifetimeStats), achievements.js (unlockAchievement)

const PUZZLE_STORAGE_KEY = "mineCtris_puzzleProgress";

// ── Puzzle definitions ─────────────────────────────────────────────────────────
// layout: [[x, yLevel, z, colorIndex], ...]  yLevel 0 → world Y=0.5 (ground)
// pieces: ordered array of piece indices to draw from (1–7)
const PUZZLES = [
  {
    id: 1,
    name: "First Steps",
    difficulty: "tutorial",
    description: "Mine all the stone blocks to clear the field.",
    layout: [
      [-1, 0, 0, 2], [0, 0, 0, 2], [1, 0, 0, 2],
    ],
    pieces: [1, 3, 5, 2, 7, 4, 6],
  },
  {
    id: 2,
    name: "L-Shape",
    difficulty: "tutorial",
    description: "An L-shaped wall. Mine your way through it.",
    layout: [
      [0, 0, 0, 2], [0, 1, 0, 2], [0, 2, 0, 2], [1, 0, 0, 2],
    ],
    pieces: [2, 4, 6, 1, 3, 5, 7, 2],
  },
  {
    id: 3,
    name: "The Staircase",
    difficulty: "tutorial",
    description: "Blocks ascend like stairs. Reach and mine each one.",
    layout: [
      [-2, 0, 0, 2], [-1, 1, 0, 2], [0, 2, 0, 2], [1, 3, 0, 2], [2, 4, 0, 2],
    ],
    pieces: [3, 1, 5, 2, 7, 4, 6, 1, 3],
  },
  {
    id: 4,
    name: "Golden Arch",
    difficulty: "medium",
    description: "Gold ore forms an arch. Mine it all before pieces run out.",
    layout: [
      [-1, 0, 0, 3], [1, 0, 0, 3],
      [-1, 1, 0, 3], [0, 1, 0, 3], [1, 1, 0, 3],
    ],
    pieces: [2, 5, 7, 4, 1, 3, 6, 2, 5, 7],
  },
  {
    id: 5,
    name: "Crystal Column",
    difficulty: "medium",
    description: "Crystals stacked five high. Reach the top to clear them.",
    layout: [
      [0, 0, 0, 7], [0, 1, 0, 7], [0, 2, 0, 7], [0, 3, 0, 7], [0, 4, 0, 7],
    ],
    pieces: [1, 6, 3, 5, 2, 4, 7, 1, 6, 3],
  },
  {
    id: 6,
    name: "Mossy Cross",
    difficulty: "medium",
    description: "A cross of moss stone. Mine from all sides.",
    layout: [
      [0, 0, 0, 5],
      [-1, 1, 0, 5], [0, 1, 0, 5], [1, 1, 0, 5],
      [0, 2, 0, 5],
    ],
    pieces: [4, 7, 2, 5, 1, 6, 3, 4, 7, 2, 5],
  },
  {
    id: 7,
    name: "The Gate",
    difficulty: "medium",
    description: "Stone pillars support a crossbeam. Dismantle the gate.",
    layout: [
      [-2, 0, 0, 2], [-2, 1, 0, 2], [-2, 2, 0, 2],
      [2, 0, 0, 2], [2, 1, 0, 2], [2, 2, 0, 2],
      [-1, 2, 0, 2], [0, 2, 0, 2], [1, 2, 0, 2],
    ],
    pieces: [3, 1, 7, 5, 2, 6, 4, 3, 1, 7, 5, 2],
  },
  {
    id: 8,
    name: "Lava Shards",
    difficulty: "hard",
    description: "Lava blocks scattered at height. Precision and planning required.",
    layout: [
      [-2, 3, -1, 6], [0, 4, 0, 6], [2, 3, 1, 6],
      [-1, 2, 1, 6], [1, 2, -1, 6],
    ],
    pieces: [2, 4, 7, 1, 5, 3, 6, 2, 4, 7, 1, 5],
  },
  {
    id: 9,
    name: "Crystal Fortress",
    difficulty: "hard",
    description: "Crystal walls form a fortress. Tear it down block by block.",
    layout: [
      [-1, 0, -1, 7], [0, 0, -1, 7], [1, 0, -1, 7],
      [-1, 0, 1, 7], [0, 0, 1, 7], [1, 0, 1, 7],
      [-1, 1, -1, 7], [1, 1, -1, 7],
      [-1, 1, 1, 7], [1, 1, 1, 7],
    ],
    pieces: [1, 5, 3, 7, 2, 6, 4, 1, 5, 3, 7, 2, 6, 4],
  },
  {
    id: 10,
    name: "The Colossus",
    difficulty: "hard",
    description: "Stone pillars, a gold crown, a crystal capstone. The ultimate challenge.",
    layout: [
      [-2, 0, 0, 2], [-2, 1, 0, 2], [-2, 2, 0, 2], [-2, 3, 0, 2],
      [2, 0, 0, 2], [2, 1, 0, 2], [2, 2, 0, 2], [2, 3, 0, 2],
      [-1, 4, 0, 3], [0, 4, 0, 3], [1, 4, 0, 3],
      [0, 5, 0, 7],
    ],
    pieces: [4, 6, 2, 7, 1, 5, 3, 4, 6, 2, 7, 1, 5, 3, 4, 6],
  },
];

// ── Progress persistence ───────────────────────────────────────────────────────

/** Load all puzzle progress from localStorage. Returns { [puzzleId]: { stars, date } }. */
function loadPuzzleProgress() {
  try {
    const raw = localStorage.getItem(PUZZLE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

/** Save stars for a puzzle if it beats the existing record. Returns true if new best. */
function savePuzzleStars(puzzleId, stars) {
  const progress = loadPuzzleProgress();
  const existing = progress[puzzleId] || {};
  if ((existing.stars || 0) < stars) {
    progress[puzzleId] = { stars, date: new Date().toISOString().slice(0, 10) };
    try { localStorage.setItem(PUZZLE_STORAGE_KEY, JSON.stringify(progress)); } catch (_) {}
    return true;
  }
  return false;
}

/** Get best star rating for a puzzle (0 = never completed). */
function getPuzzleStars(puzzleId) {
  const progress = loadPuzzleProgress();
  return (progress[puzzleId] || {}).stars || 0;
}

/** Puzzle N is unlocked once puzzle N-1 has at least 1 star. Puzzle 1 is always unlocked. */
function isPuzzleUnlocked(puzzleId) {
  if (puzzleId <= 1) return true;
  return getPuzzleStars(puzzleId - 1) >= 1;
}

/** Count how many puzzles have been completed (≥1 star). */
function countCompletedPuzzles() {
  const progress = loadPuzzleProgress();
  return Object.keys(progress).filter(id => (progress[id].stars || 0) >= 1).length;
}

/** Count how many puzzles have 3 stars. */
function countThreeStarPuzzles() {
  const progress = loadPuzzleProgress();
  return Object.keys(progress).filter(id => (progress[id].stars || 0) >= 3).length;
}

// ── Runtime state ─────────────────────────────────────────────────────────────
// These track the current puzzle session; reset in resetPuzzleState().

let _puzzlePresetBlocks = [];   // Array of THREE.Mesh refs that are puzzle presets
let _puzzleInitialCount = 0;    // Total preset blocks at puzzle start
let _puzzleIsFirstAttempt = true; // Cleared if player has attempted this puzzle before
let _puzzlePiecesUsed = 0;      // Count of pieces consumed so far this session
let _thinkModeActive = false;   // True while think-mode key is held

function resetPuzzleState() {
  _puzzlePresetBlocks = [];
  _puzzleInitialCount = 0;
  _puzzlePiecesUsed = 0;
  _thinkModeActive = false;
}

// ── Piece queue for puzzle mode ────────────────────────────────────────────────

/** Remaining pieces in the current puzzle's fixed queue (populated on puzzle start). */
let puzzleFixedQueue = [];

/** Populate puzzleFixedQueue from the puzzle's piece list and init the visible queue. */
function initPuzzlePieceQueue() {
  const puzzle = getPuzzleById(puzzlePuzzleId);
  if (!puzzle) return;
  puzzleFixedQueue = puzzle.pieces.slice(); // copy
  // Seed pieceQueue (visible preview) from the front of the fixed queue
  pieceQueue.length = 0;
  const previewCount = Math.min(NEXT_QUEUE_SIZE, puzzleFixedQueue.length);
  for (let i = 0; i < previewCount; i++) {
    const idx = puzzleFixedQueue[i];
    pieceQueue.push({ index: idx, shape: SHAPES[idx] });
  }
  updateNextPiecesHUD();
}

/** Draw the next piece from puzzleFixedQueue. Returns { index, shape } or null if empty. */
function drawPuzzlePiece() {
  if (puzzleFixedQueue.length === 0) return null;
  _puzzlePiecesUsed++;
  const idx = puzzleFixedQueue.shift();
  // Rebuild preview from remaining fixed queue
  pieceQueue.length = 0;
  const previewCount = Math.min(NEXT_QUEUE_SIZE, puzzleFixedQueue.length);
  for (let i = 0; i < previewCount; i++) {
    const qIdx = puzzleFixedQueue[i];
    pieceQueue.push({ index: qIdx, shape: SHAPES[qIdx] });
  }
  updateNextPiecesHUD();
  return { index: idx, shape: SHAPES[idx] };
}

// ── Preset block setup ─────────────────────────────────────────────────────────

function getPuzzleById(id) {
  return PUZZLES.find(p => p.id === id) || null;
}

// Map colorIndex (1-8) to material type string (used for mining behavior)
const _PUZZLE_COLOR_TO_MAT = {
  1: "dirt",
  2: "stone",
  3: "gold",
  4: "ice",
  5: "moss",
  6: "lava",
  7: "crystal",
  8: "diamond",
};

/**
 * Place all preset blocks for the given puzzle into the world.
 * Must be called after the scene is ready (worldGroup exists).
 */
function setupPuzzleLayout() {
  const puzzle = getPuzzleById(puzzlePuzzleId);
  if (!puzzle) return;

  _puzzlePresetBlocks = [];

  puzzle.layout.forEach(([x, yLevel, z, colorIndex]) => {
    const color = COLORS[colorIndex];
    const block = createBlockMesh(color);
    block.name = "landed_block";

    // Tag as puzzle preset for win-condition tracking
    block.userData.isPuzzlePreset = true;
    block.userData.materialType = _PUZZLE_COLOR_TO_MAT[colorIndex] || "stone";

    // Mining clicks from BLOCK_TYPES
    const matInfo = BLOCK_TYPES[block.userData.materialType];
    block.userData.miningClicks = matInfo ? matInfo.hits : MINING_CLICKS_NEEDED;

    // Place in world
    block.position.set(x, yLevel + 0.5, z);
    worldGroup.add(block);
    registerBlock(block);

    _puzzlePresetBlocks.push(block);
  });

  _puzzleInitialCount = _puzzlePresetBlocks.length;

  // Check if this is the first attempt (no stars recorded yet)
  const progress = loadPuzzleProgress();
  _puzzleIsFirstAttempt = !progress[puzzlePuzzleId];
}

// ── Win / lose detection ───────────────────────────────────────────────────────

/**
 * Count how many preset blocks are still in the world (not yet mined/cleared).
 * A block is considered gone when its gridPos is null (unregistered).
 */
function countRemainingPresetBlocks() {
  return _puzzlePresetBlocks.filter(b => b.userData.gridPos !== null && worldGroup.children.includes(b)).length;
}

/**
 * Check win/lose conditions. Call after each piece lands or block is mined.
 * - Win: all preset blocks removed from the world
 * - Lose: piece queue empty and preset blocks remain
 */
function checkPuzzleConditions() {
  if (!isPuzzleMode || isGameOver) return;

  const remaining = countRemainingPresetBlocks();

  if (remaining === 0) {
    // Win!
    _triggerPuzzleWin();
    return;
  }

  // Lose: all pieces consumed and blocks remain
  if (puzzleFixedQueue.length === 0 && pieceQueue.length === 0 && fallingPieces.length === 0) {
    _triggerPuzzleLose();
  }
}

// ── Completion logic ───────────────────────────────────────────────────────────

function _calcStars(piecesTotal, piecesUsed, isFirstAttempt) {
  const remaining = piecesTotal - piecesUsed;
  const pctRemaining = piecesTotal > 0 ? remaining / piecesTotal : 0;

  if (isFirstAttempt && pctRemaining >= 0) {
    // First attempt earns 3 stars
    return 3;
  }
  if (pctRemaining >= 0.2) {
    // Completed with 20%+ pieces remaining
    return 2;
  }
  return 1;
}

function _triggerPuzzleWin() {
  if (puzzleComplete) return;
  puzzleComplete = true;
  isGameOver = true;
  gameTimerRunning = false;

  const puzzle = getPuzzleById(puzzlePuzzleId);
  const piecesTotal = puzzle ? puzzle.pieces.length : 1;
  const stars = _calcStars(piecesTotal, _puzzlePiecesUsed, _puzzleIsFirstAttempt);

  const isNewBest = savePuzzleStars(puzzlePuzzleId, stars);

  // Submit lifetime stats
  if (typeof submitLifetimeStats === "function") {
    submitLifetimeStats({
      score,
      blocksMined,
      linesCleared,
      blocksPlaced,
      totalCrafts:           sessionCrafts,
      highestComboCount:     sessionHighestComboCount,
      highestDifficultyTier: lastDifficultyTier,
      isDailyChallenge:      false,
      isPuzzleMode:          true,
    });
  }

  // Award XP (puzzle win)
  if (typeof awardXP === "function") {
    const _pzXpBefore = (typeof loadLifetimeStats === 'function' ? loadLifetimeStats().playerXP || 0 : 0);
    const { xpEarned: _pzXP, streakBonus: _pzStreak } = awardXP(score, 'puzzle');
    const pzXpEl = document.getElementById('puzzle-xp-earned');
    if (pzXpEl) {
      pzXpEl.textContent = '+ ' + _pzXP + ' XP' + (_pzStreak ? '  (Streak Bonus!)' : '');
      pzXpEl.className = 'xp-earned-display' + (_pzStreak ? ' xp-streak' : '');
    }
    if (typeof checkLevelUp === 'function' && typeof loadLifetimeStats === 'function') {
      checkLevelUp(_pzXpBefore, loadLifetimeStats().playerXP || 0);
    }
    if (typeof updateStreakHUD === 'function') updateStreakHUD();
  }

  // Achievements
  if (typeof achOnPuzzleComplete === "function") {
    achOnPuzzleComplete(puzzlePuzzleId, stars);
  }

  // Daily missions: puzzle completed
  if (typeof onMissionPuzzleComplete === "function") onMissionPuzzleComplete();

  _showPuzzleCompleteOverlay(true, stars, isNewBest, puzzle);

  if (typeof stopBgMusic === "function") stopBgMusic();
  if (typeof playGameOverJingle === "function") playGameOverJingle();
  if (controls && controls.isLocked) controls.unlock();
}

function _triggerPuzzleLose() {
  if (puzzleComplete) return;
  puzzleComplete = true;
  isGameOver = true;
  gameTimerRunning = false;

  const pzXpElLose = document.getElementById('puzzle-xp-earned');
  if (pzXpElLose) { pzXpElLose.textContent = ''; pzXpElLose.className = 'xp-earned-display'; }

  _showPuzzleCompleteOverlay(false, 0, false, getPuzzleById(puzzlePuzzleId));

  if (typeof stopBgMusic === "function") stopBgMusic();
  if (typeof playGameOverJingle === "function") playGameOverJingle();
  if (controls && controls.isLocked) controls.unlock();
}

function _showPuzzleCompleteOverlay(won, stars, isNewBest, puzzle) {
  const overlayEl = document.getElementById("puzzle-complete-screen");
  if (!overlayEl) return;

  const titleEl = document.getElementById("puzzle-complete-title");
  if (titleEl) titleEl.textContent = won ? "PUZZLE SOLVED!" : "OUT OF PIECES";

  const nameEl = document.getElementById("puzzle-complete-name");
  if (nameEl && puzzle) nameEl.textContent = "#" + puzzle.id + " — " + puzzle.name;

  const starsEl = document.getElementById("puzzle-complete-stars");
  if (starsEl) {
    if (won) {
      starsEl.textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
      starsEl.className = "puzzle-stars puzzle-stars-" + stars;
    } else {
      starsEl.textContent = "☆☆☆";
      starsEl.className = "puzzle-stars puzzle-stars-0";
    }
  }

  const pbEl = document.getElementById("puzzle-complete-pb");
  if (pbEl) {
    if (won && isNewBest) {
      pbEl.textContent = "NEW BEST!";
      pbEl.className = "puzzle-new-best";
    } else if (won) {
      const best = getPuzzleStars(puzzlePuzzleId);
      pbEl.textContent = "Best: " + "★".repeat(best) + "☆".repeat(3 - best);
      pbEl.className = "puzzle-pb-line";
    } else {
      pbEl.textContent = "";
      pbEl.className = "";
    }
  }

  const remainEl = document.getElementById("puzzle-complete-remain");
  if (remainEl) {
    const remaining = countRemainingPresetBlocks();
    if (won) {
      remainEl.textContent = "All " + _puzzleInitialCount + " blocks cleared!";
    } else {
      remainEl.textContent = remaining + " block" + (remaining === 1 ? "" : "s") + " remaining";
    }
  }

  // Show/hide next puzzle button
  const nextBtn = document.getElementById("puzzle-next-btn");
  if (nextBtn) {
    const nextId = puzzlePuzzleId + 1;
    const nextPuzzle = getPuzzleById(nextId);
    if (won && nextPuzzle && isPuzzleUnlocked(nextId)) {
      nextBtn.style.display = "";
      nextBtn.textContent = "Next Puzzle ▶";
    } else {
      nextBtn.style.display = "none";
    }
  }

  overlayEl.style.display = "flex";
}

// ── Think mode ────────────────────────────────────────────────────────────────

/** Call from keydown handler when the think-mode key (F) is pressed. */
function setThinkMode(active) {
  if (!isPuzzleMode) return;
  _thinkModeActive = active;
}

/** Returns true when gravity should be suppressed for falling pieces. */
function isThinkModeActive() {
  return isPuzzleMode && _thinkModeActive;
}

// ── HUD helpers ───────────────────────────────────────────────────────────────

/** Update the puzzle HUD badge: shows puzzle #, pieces left, blocks remaining. */
function updatePuzzleHUD() {
  const badgeEl = document.getElementById("puzzle-badge");
  if (!badgeEl) return;
  const puzzle = getPuzzleById(puzzlePuzzleId);
  const blocksLeft = countRemainingPresetBlocks();
  const piecesLeft = puzzleFixedQueue.length + pieceQueue.length + fallingPieces.length;
  badgeEl.textContent =
    "Puzzle " + (puzzle ? puzzle.id : "?") + "/" + PUZZLES.length +
    " | Blocks: " + blocksLeft + " | Pieces: " + piecesLeft +
    (isThinkModeActive() ? " | THINK MODE" : "");
}

// ── Puzzle selector ───────────────────────────────────────────────────────────

/** Render the puzzle-select list inside #puzzle-select-list. */
function renderPuzzleSelectList() {
  const listEl = document.getElementById("puzzle-select-list");
  if (!listEl) return;

  listEl.innerHTML = "";
  PUZZLES.forEach(puzzle => {
    const unlocked = isPuzzleUnlocked(puzzle.id);
    const stars = getPuzzleStars(puzzle.id);

    const item = document.createElement("div");
    item.className = "puzzle-list-item" + (unlocked ? "" : " puzzle-locked");

    const starsStr = unlocked
      ? ("★".repeat(stars) + "☆".repeat(3 - stars))
      : "🔒";

    item.innerHTML =
      '<div class="puzzle-list-num">' + puzzle.id + '</div>' +
      '<div class="puzzle-list-info">' +
        '<div class="puzzle-list-name">' + puzzle.name + '</div>' +
        '<div class="puzzle-list-diff puzzle-diff-' + puzzle.difficulty + '">' + puzzle.difficulty + '</div>' +
      '</div>' +
      '<div class="puzzle-list-stars">' + starsStr + '</div>';

    if (unlocked) {
      item.addEventListener("click", function () {
        puzzlePuzzleId = puzzle.id;
        hidePuzzleSelect();
        // Lock pointer (mirrors requestPointerLock in main.js)
        if (typeof Tone !== "undefined" && Tone.context.state !== "running") {
          Tone.start().then(() => controls.lock()).catch(() => controls.lock());
        } else if (controls) {
          controls.lock();
        }
      });
    }
    listEl.appendChild(item);
  });
}

function showPuzzleSelect() {
  const el = document.getElementById("puzzle-select-screen");
  if (el) {
    renderPuzzleSelectList();
    el.style.display = "flex";
  }
}

function hidePuzzleSelect() {
  const el = document.getElementById("puzzle-select-screen");
  if (el) el.style.display = "none";
}
