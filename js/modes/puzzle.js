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
    description: "Lava blocks scattered at height. Build stacks to reach them and clear 3 lines.",
    layout: [
      [-2, 3, -1, 6], [0, 4, 0, 6], [2, 3, 1, 6],
      [-1, 2, 1, 6], [1, 2, -1, 6],
    ],
    pieces: [2, 4, 7, 1, 5, 3, 6, 2, 4, 7, 1, 5],
    winCondition: { mode: "clear_lines", n: 3 },
  },
  {
    id: 9,
    name: "Crystal Fortress",
    difficulty: "hard",
    description: "Crystal walls form a fortress. Tear it down — but don't touch the crafting table.",
    layout: [
      [-1, 0, -1, 7], [0, 0, -1, 7], [1, 0, -1, 7],
      [-1, 0, 1, 7], [0, 0, 1, 7], [1, 0, 1, 7],
      [-1, 1, -1, 7], [1, 1, -1, 7],
      [-1, 1, 1, 7], [1, 1, 1, 7],
    ],
    pieces: [1, 5, 3, 7, 2, 6, 4, 1, 5, 3, 7, 2, 6, 4],
    winCondition: { mode: "no_craft" },
  },
  {
    id: 10,
    name: "The Colossus",
    difficulty: "hard",
    description: "Stone pillars, a gold crown, a crystal capstone. Score 500 points in 2 minutes.",
    layout: [
      [-2, 0, 0, 2], [-2, 1, 0, 2], [-2, 2, 0, 2], [-2, 3, 0, 2],
      [2, 0, 0, 2], [2, 1, 0, 2], [2, 2, 0, 2], [2, 3, 0, 2],
      [-1, 4, 0, 3], [0, 4, 0, 3], [1, 4, 0, 3],
      [0, 5, 0, 7],
    ],
    pieces: [4, 6, 2, 7, 1, 5, 3, 4, 6, 2, 7, 1, 5, 3, 4, 6],
    winCondition: { mode: "timed_score", scoreTarget: 500, timeLimit: 120 },
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
let _puzzleNoCraftViolated = false; // True if player crafted during a no_craft puzzle
let _puzzleTimeLimitSecs = 0;       // Time limit for timed_score puzzles (0 = no limit)
let _puzzleTimeElapsed = 0;         // Seconds elapsed for timed_score puzzles

function resetPuzzleState() {
  _puzzlePresetBlocks = [];
  _puzzleInitialCount = 0;
  _puzzlePiecesUsed = 0;
  _thinkModeActive = false;
  _puzzleNoCraftViolated = false;
  _puzzleTimeLimitSecs = 0;
  _puzzleTimeElapsed = 0;
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

/** Initialize win-condition state for the current built-in puzzle (call after resetPuzzleState). */
function initPuzzleWinCondition() {
  const puzzle = getPuzzleById(puzzlePuzzleId);
  const wc = puzzle && puzzle.winCondition;
  _puzzleTimeLimitSecs = (wc && wc.mode === "timed_score") ? wc.timeLimit : 0;
  _puzzleTimeElapsed = 0;
  _puzzleNoCraftViolated = false;
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

// ── Custom puzzle piece sequence queue ────────────────────────────────────────

/** Internal looping cursor for the custom puzzle fixed sequence. */
let _customPieceSeqIndex = 0;

/**
 * Initialise the piece queue for a custom puzzle based on customPieceSequence.
 * In "fixed" mode: seeds pieceQueue from the sequence (looping).
 * In "random" mode: does nothing — spawnFallingPiece falls through to random logic.
 */
function initCustomPuzzlePieceQueue() {
  _customPieceSeqIndex = 0;
  if (typeof customPieceSequence === "undefined" || customPieceSequence.mode !== "fixed") return;
  const seq = customPieceSequence.pieces;
  if (!seq || seq.length === 0) return;
  // Seed visible preview queue from beginning of fixed sequence
  pieceQueue.length = 0;
  const previewCount = Math.min(NEXT_QUEUE_SIZE, seq.length);
  for (let i = 0; i < previewCount; i++) {
    const idx = seq[i % seq.length];
    pieceQueue.push({ index: idx, shape: SHAPES[idx] });
  }
  updateNextPiecesHUD();
}

/**
 * Draw the next piece from the custom puzzle fixed sequence (looping).
 * Returns { index, shape } or null if sequence is empty / mode is random.
 */
function drawCustomPuzzlePiece() {
  if (typeof customPieceSequence === "undefined" || customPieceSequence.mode !== "fixed") return null;
  const seq = customPieceSequence.pieces;
  if (!seq || seq.length === 0) return null;
  const idx = seq[_customPieceSeqIndex % seq.length];
  _customPieceSeqIndex++;
  // Rebuild preview: next NEXT_QUEUE_SIZE pieces in the looping sequence
  pieceQueue.length = 0;
  for (let i = 0; i < NEXT_QUEUE_SIZE; i++) {
    const pi = seq[(_customPieceSeqIndex + i) % seq.length];
    pieceQueue.push({ index: pi, shape: SHAPES[pi] });
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

// ── Custom puzzle layout setup ────────────────────────────────────────────────

/**
 * Place preset blocks from customPuzzleLayout into the world.
 * Used when entering a test play of an editor-built puzzle.
 */
function setupCustomPuzzleLayout() {
  _puzzlePresetBlocks = [];

  if (!Array.isArray(customPuzzleLayout)) return;

  customPuzzleLayout.forEach(function (b) {
    // Determine palette index from color hex for material type lookup
    var hexInt = 0;
    if (b.color) {
      hexInt = parseInt(b.color.replace("#", ""), 16);
    }
    var paletteIdx = 1; // default stone
    if (typeof EDITOR_PALETTE !== "undefined") {
      for (var i = 0; i < EDITOR_PALETTE.length; i++) {
        if (EDITOR_PALETTE[i].hex === hexInt) { paletteIdx = i; break; }
      }
    }
    // Map palette idx to COLORS index (EDITOR_PALETTE order matches colorIndex 1-9)
    var colorIndex = paletteIdx + 1;
    var color = COLORS[colorIndex] || COLORS[2];

    var block = createBlockMesh(color);
    block.name = "landed_block";
    block.userData.isPuzzlePreset = true;
    var matName = _PUZZLE_COLOR_TO_MAT[colorIndex] || "stone";
    block.userData.materialType = matName;
    var matInfo = BLOCK_TYPES[matName];
    block.userData.miningClicks = matInfo ? matInfo.hits : MINING_CLICKS_NEEDED;
    block.position.set(b.x, b.y, b.z);
    worldGroup.add(block);
    registerBlock(block);
    _puzzlePresetBlocks.push(block);
  });

  _puzzleInitialCount = _puzzlePresetBlocks.length;
  _puzzleIsFirstAttempt = true;
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
 * Handles both built-in puzzle mode and editor custom puzzle mode.
 */
function checkPuzzleConditions() {
  if (isGameOver) return;

  // ── Custom puzzle mode ────────────────────────────────────────────────────
  if (isCustomPuzzleMode && customPuzzleWinCondition) {
    const wc = customPuzzleWinCondition;
    let won = false;
    if (wc.mode === "mine_all") {
      won = countRemainingPresetBlocks() === 0 && _puzzleInitialCount > 0;
    } else if (wc.mode === "clear_lines") {
      won = linesCleared >= wc.n;
    } else if (wc.mode === "survive_seconds") {
      won = gameElapsedSeconds >= wc.n;
    } else if (wc.mode === "score_points") {
      won = score >= wc.n;
    }
    if (won) _triggerCustomPuzzleWin();
    return;
  }

  // ── Built-in puzzle mode ──────────────────────────────────────────────────
  if (!isPuzzleMode) return;

  const puzzle = getPuzzleById(puzzlePuzzleId);
  const wc = (puzzle && puzzle.winCondition) ? puzzle.winCondition : { mode: "mine_all" };

  if (wc.mode === "mine_all") {
    const remaining = countRemainingPresetBlocks();
    if (remaining === 0 && _puzzleInitialCount > 0) {
      _triggerPuzzleWin();
      return;
    }
    if (puzzleFixedQueue.length === 0 && pieceQueue.length === 0 && fallingPieces.length === 0) {
      _triggerPuzzleLose();
    }

  } else if (wc.mode === "clear_lines") {
    if (linesCleared >= wc.n) {
      _triggerPuzzleWin();
      return;
    }
    if (puzzleFixedQueue.length === 0 && pieceQueue.length === 0 && fallingPieces.length === 0) {
      _triggerPuzzleLose();
    }

  } else if (wc.mode === "no_craft") {
    const remaining = countRemainingPresetBlocks();
    if (remaining === 0 && _puzzleInitialCount > 0) {
      if (_puzzleNoCraftViolated) {
        _triggerPuzzleLose();
      } else {
        _triggerPuzzleWin();
      }
      return;
    }
    if (puzzleFixedQueue.length === 0 && pieceQueue.length === 0 && fallingPieces.length === 0) {
      _triggerPuzzleLose();
    }

  } else if (wc.mode === "timed_score") {
    if (score >= wc.scoreTarget) {
      _triggerPuzzleWin();
      return;
    }
    const timeLeft = _puzzleTimeLimitSecs - _puzzleTimeElapsed;
    if (timeLeft <= 0) {
      _triggerPuzzleLose();
    }
  }
}

