// js/battle-garbage.js — Battle mode garbage (Rubble) injection system.
// When the opponent clears lines they send a battle_attack message; we queue the
// attack and deliver one row of Rubble blocks per piece spawn (standard Tetris rule).
//
// Requires: state.js  (worldGroup, gridOccupancy, lineClearInProgress, BLOCK_SIZE)
//           config.js (BLOCK_SIZE)
//           world.js  (addFaceBrightnessColors — optional, for face shading)
//           THREE.js  (global)

// ── Garbage queue ─────────────────────────────────────────────────────────────
// Each entry: { lines: number, gapSeed: uint32 }
let _garbageQueue = [];

// ── Garbage grid dimensions ───────────────────────────────────────────────────
// The active play area forms a 10 × 10 block grid (100 cells = LINE_CLEAR_CELLS_NEEDED).
// Each garbage row fills 9 of 10 X-columns (90 cells) so it never auto-clears.
const _GG_X_MIN  = -4;
const _GG_X_MAX  =  5;   // inclusive → 10 columns (-4 … +5)
const _GG_Z_MIN  = -4;
const _GG_Z_MAX  =  5;   // inclusive → 10 rows    (-4 … +5)
const _GG_COLS   = 10;   // number of X-columns available for the gap

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Queue an incoming garbage attack from the opponent.
 * @param {number} lines    Number of rows to inject (1–4).
 * @param {number} gapSeed  Uint32 seed used to derive the gap column position.
 */
function queueGarbage(lines, gapSeed) {
  _garbageQueue.push({ lines: Math.max(1, lines | 0), gapSeed: (gapSeed >>> 0) || 1 });
}

/**
 * Deliver one queued garbage entry (called each time a piece spawns in battle mode).
 * Skips silently while a line-clear animation is running to avoid conflicts.
 */
function deliverPendingGarbage() {
  if (!_garbageQueue.length) return;
  if (lineClearInProgress) return;
  const entry = _garbageQueue.shift();
  _injectRubbleRows(entry.lines, entry.gapSeed);
}

/** Flush the queue — call on battle start and game reset. */
function resetGarbageQueue() {
  _garbageQueue = [];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * LCG step: advances a 32-bit seed and returns a gap column index in [0, _GG_COLS).
 * Using the same multiplier / increment as Numerical Recipes.
 */
function _nextGapCol(seed) {
  return (((seed * 1664525) + 1013904223) >>> 0) % _GG_COLS;
}

/**
 * Shifts all landed blocks up by `count` Y levels, then injects `count` rows of
 * Rubble blocks at the bottom (grid-Y levels 0.5, 1.5, …, count − 0.5).
 *
 * @param {number} count    Number of rows to inject.
 * @param {number} gapSeed  Seed for gap column derivation.
 */
function _injectRubbleRows(count, gapSeed) {
  // 1. Shift all existing landed blocks upward ─────────────────────────────────
  const toShift = [];
  worldGroup.children.forEach(function (obj) {
    if (obj.name !== 'landed_block' || !obj.userData.gridPos) return;
    toShift.push(obj);
  });

  toShift.forEach(function (obj) {
    const gp  = obj.userData.gridPos;
    const key = gp.x + ',' + gp.z;

    // Remove from old Y level in gridOccupancy
    const oldLayer = gridOccupancy.get(gp.y);
    if (oldLayer) {
      oldLayer.delete(key);
      if (!oldLayer.size) gridOccupancy.delete(gp.y);
    }

    // Move up by count levels (BLOCK_SIZE === 1, so world-Y and grid-Y are equal)
    gp.y += count;
    obj.position.y += count * BLOCK_SIZE;
    obj.userData.boundingBox = null;

    // Register at new Y level
    if (!gridOccupancy.has(gp.y)) gridOccupancy.set(gp.y, new Set());
    gridOccupancy.get(gp.y).add(key);
  });

  // 2. Inject Rubble rows at the bottom ─────────────────────────────────────────
  let seed = gapSeed >>> 0;
  for (let row = 0; row < count; row++) {
    // Advance seed for each row to get a distinct gap column per row
    seed   = ((seed * 1664525) + 1013904223) >>> 0;
    const gapCol = seed % _GG_COLS;
    const gapX   = _GG_X_MIN + gapCol;   // X position of the gap column

    // grid-Y follows the same float convention: 0.5, 1.5, 2.5, …
    const gridY = row + 0.5;

    for (let gx = _GG_X_MIN; gx <= _GG_X_MAX; gx++) {
      if (gx === gapX) continue;   // leave the gap column empty

      for (let gz = _GG_Z_MIN; gz <= _GG_Z_MAX; gz++) {
        const block = _createRubbleMesh();

        // BLOCK_SIZE === 1 → world-Y == grid-Y
        block.position.set(gx, gridY, gz);
        block.name = 'landed_block';
        worldGroup.add(block);

        // Register in grid occupancy
        if (!gridOccupancy.has(gridY)) gridOccupancy.set(gridY, new Set());
        gridOccupancy.get(gridY).add(gx + ',' + gz);
        block.userData.gridPos    = { x: gx, y: gridY, z: gz };
        block.userData.boundingBox = null;
      }
    }
  }

  // 3. Invalidate all bounding boxes (block positions changed globally) ──────────
  worldGroup.children.forEach(function (obj) {
    if (obj.name === 'landed_block') obj.userData.boundingBox = null;
  });
}

/**
 * Creates a Rubble block mesh: slate grey body with subtle orange-crack emissive.
 * Uses a dedicated material (not the standard palette) so it renders correctly
 * regardless of active theme or colorblind mode.
 */
function _createRubbleMesh() {
  const geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  if (typeof addFaceBrightnessColors === 'function') {
    addFaceBrightnessColors(geometry);
  }
  const edges        = new THREE.EdgesGeometry(geometry);
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
  const edgesMesh    = new THREE.LineSegments(edges, lineMaterial);

  const material = new THREE.MeshStandardMaterial({
    color:             new THREE.Color(RUBBLE_COLOR),
    roughness:         0.9,
    metalness:         0.0,
    emissive:          new THREE.Color(0x3d1a00),
    emissiveIntensity: 0.15,
  });

  const cube = new THREE.Mesh(geometry, material);
  cube.add(edgesMesh);

  cube.userData.isBlock        = true;
  cube.userData.originalColor  = material.color.clone();
  cube.userData.canonicalColor = RUBBLE_COLOR;
  cube.userData.materialType   = 'rubble';
  cube.userData.miningClicks   = BLOCK_TYPES.rubble.hits;   // 2
  cube.userData.miningPoints   = BLOCK_TYPES.rubble.points; // 5
  cube.userData.isRubble       = true;

  return cube;
}
