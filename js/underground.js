// Underground terrain — data layer, pre-generated mesh system, and dungeon support.
// Phase 1B: 20×20×10 grid below the mineable surface.
//
// Depth layers:
//   depth 0-2  → world Y -0.5 to -2.5  → Dirt  (2 mining hits)
//   depth 3-9  → world Y -3.5 to -9.5  → Stone (4 mining hits)
//
// All 4000 underground block meshes are created at world init, fully visible.
// No chunk loading — one unified world. Underground blocks are NOT added to
// gridOccupancy (prevents power-ups from targeting underground layers), but
// each mesh carries a gridPos so the mining code can capture it.
//
// Requires: config.js, world.js (createBlockMesh, unregisterBlock, disposeBlock),
//           state.js (worldGroup, isSurvivalMode, controls)

var UNDERGROUND_COLS  = 20;
var UNDERGROUND_ROWS  = 20;
var UNDERGROUND_DEPTH = 10;  // 10 layers deep

var UG_DIRT          = 1;  // depth 0-2
var UG_STONE         = 2;  // depth 3-9
var UG_BEDROCK       = 3;  // indestructible boundary walls
var UG_DUNGEON_WALL  = 4;  // non-mineable room perimeter (stone-brick)
var UG_DUNGEON_ENTRANCE = 5; // mineable entrance block (3 hits, warm glow)

var UG_DIRT_COLOR         = 0x8b4513;  // "dirt"            in COLOR_TO_MATERIAL
var UG_STONE_COLOR        = 0x808080;  // "stone"           in COLOR_TO_MATERIAL
var UG_BEDROCK_COLOR      = 0x404040;  // "bedrock"         in COLOR_TO_MATERIAL
var UG_DUNGEON_WALL_COLOR = 0x4a4a5e;  // "dungeon_wall"    in COLOR_TO_MATERIAL
var UG_DUNGEON_ENT_COLOR  = 0x7a4028;  // "dungeon_entrance" in COLOR_TO_MATERIAL

// localStorage persistence key
var UNDERGROUND_MINED_KEY = 'mineCtris_undergroundMined';
var UNDERGROUND_SEED_KEY  = 'mineCtris_undergroundSeed';

// Module-private state
var _ugData          = null;      // Map<"col,row,depth", {type, mined}>
var _ugMeshes        = new Map(); // Map<"col,row,depth", THREE.Mesh>
var _bedrockWalls    = [];        // always-loaded boundary bedrock meshes
var _dungeonGlowKeys      = new Set(); // block keys flagged for warm emissive tint (full)
var _dungeonGlowFaintKeys = new Set(); // subset: faint glow (3-5 steps from room wall)
var _ugSeed          = 0;         // seed in use for this world (exposed for dungeon-rooms.js)

// ── Seeded RNG (mulberry32) ─────────────────────────────────────────────────

function _ugMkRng(seed) {
  var s = (seed >>> 0) || 1;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Coordinate helpers ──────────────────────────────────────────────────────

/** World-space centre position for (col, row, depth). */
function _ugWorldPos(col, row, depth) {
  return { x: col - 9.5, y: -depth - 0.5, z: row - 9.5 };
}

/** Data-map key. */
function _ugKey(col, row, depth) {
  return col + ',' + row + ',' + depth;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a brand-new underground for a fresh Survival world.
 * Also clears the mined-state save from localStorage.
 * @param {number} seed  Integer derived from Date.now() at world creation.
 */
function initUnderground(seed) {
  _clearModuleState();
  _ugSeed = (seed >>> 0) || 1;
  var rng = _ugMkRng(_ugSeed);
  _ugData = new Map();

  for (var col = 0; col < UNDERGROUND_COLS; col++) {
    for (var row = 0; row < UNDERGROUND_ROWS; row++) {
      for (var depth = 0; depth < UNDERGROUND_DEPTH; depth++) {
        rng(); // reserved slot for future ore-vein generation
        var type = depth < 3 ? UG_DIRT : UG_STONE;
        _ugData.set(_ugKey(col, row, depth), { type: type, mined: false });
      }
    }
  }

  // Persist seed so restoreUnderground can reproduce the same layout
  try { localStorage.setItem(UNDERGROUND_SEED_KEY, String(_ugSeed)); } catch (_) {}
  // Clear any stale mined state from a previous world
  try { localStorage.removeItem(UNDERGROUND_MINED_KEY); } catch (_) {}

  _createBedrockWalls();

  // Phase 2A: generate and carve dungeon rooms into the fresh terrain
  if (typeof initDungeonRooms === 'function') {
    initDungeonRooms(_ugSeed, _ugData);
  }

  // Pre-generate all block meshes — all visible from the start
  _createAllUgMeshes();
}

/**
 * Restore underground for an existing Survival world (continued session).
 * Regenerates terrain from the stored seed, then re-applies saved mined cells.
 */
function restoreUnderground() {
  var seed = 0;
  try { seed = parseInt(localStorage.getItem(UNDERGROUND_SEED_KEY), 10) || 0; } catch (_) {}
  if (!seed) return; // no seed → underground was never initialised for this world

  _clearModuleState();
  _ugSeed = (seed >>> 0) || 1;
  var rng = _ugMkRng(_ugSeed);
  _ugData = new Map();

  for (var col = 0; col < UNDERGROUND_COLS; col++) {
    for (var row = 0; row < UNDERGROUND_ROWS; row++) {
      for (var depth = 0; depth < UNDERGROUND_DEPTH; depth++) {
        rng();
        var type = depth < 3 ? UG_DIRT : UG_STONE;
        _ugData.set(_ugKey(col, row, depth), { type: type, mined: false });
      }
    }
  }

  // Phase 2A: restore dungeon rooms (carves walls/entrance into _ugData before
  // mined state is applied so that mined entrance blocks stay mined correctly)
  if (typeof restoreDungeonRooms === 'function') {
    restoreDungeonRooms(_ugSeed, _ugData);
  }

  // Re-apply mined state (after dungeon carving so entrance blocks can be mined)
  var minedArr = _loadMinedKeys();
  for (var i = 0; i < minedArr.length; i++) {
    var d = _ugData.get(minedArr[i]);
    if (d) d.mined = true;
  }

  _createBedrockWalls();

  // Pre-generate all block meshes — all visible from the start
  _createAllUgMeshes();
}

/**
 * Notify the underground system that a block was mined.
 * Must be called with a snapshot of userData captured BEFORE unregisterBlock().
 *
 * @param {{
 *   gridPos: {x:number,y:number,z:number},
 *   isUnderground: boolean,
 *   ugCol: number|undefined,
 *   ugRow: number|undefined,
 *   ugDepth: number|undefined
 * }} blockData
 */
function notifyBlockMined(blockData) {
  if (!_ugData) return;
  if (!blockData.isUnderground) return; // only handle underground blocks

  var col   = blockData.ugCol;
  var row   = blockData.ugRow;
  var depth = blockData.ugDepth;
  if (col == null || row == null || depth == null) return;

  var bKey = _ugKey(col, row, depth);
  var bData = _ugData.get(bKey);
  if (bData) bData.mined = true;
  _ugMeshes.delete(bKey); // mesh already removed by caller

  // Persist
  _appendMinedKey(bKey);
}

/**
 * Tear down the underground system completely.
 * Call from resetGame before the generic landed_block cleanup.
 * Disposes all meshes and clears data structures.
 */
function clearUnderground() {
  _ugMeshes.forEach(function (mesh) {
    if (typeof unregisterBlock === 'function') unregisterBlock(mesh);
    if (typeof disposeBlock    === 'function') disposeBlock(mesh);
    if (worldGroup) worldGroup.remove(mesh);
  });
  // Remove dungeon torch point lights from the scene
  if (typeof clearDungeonRoomLights === 'function') clearDungeonRoomLights();
  _clearModuleState();
}

/**
 * Erase saved underground mined state (call when the Survival world is reset/lost).
 */
function clearUndergroundSave() {
  try { localStorage.removeItem(UNDERGROUND_MINED_KEY); } catch (_) {}
  try { localStorage.removeItem(UNDERGROUND_SEED_KEY);  } catch (_) {}
}

// ── Internal helpers ────────────────────────────────────────────────────────

function _clearModuleState() {
  // Dispose always-loaded bedrock boundary walls
  _bedrockWalls.forEach(function (mesh) {
    if (worldGroup) worldGroup.remove(mesh);
    if (typeof disposeBlock === 'function') disposeBlock(mesh);
  });
  _ugData          = null;
  _ugMeshes        = new Map();
  _bedrockWalls    = [];
  _dungeonGlowKeys      = new Set();
  _dungeonGlowFaintKeys = new Set();
}

/**
 * Instantiate a THREE.js mesh for the given underground block and add it to the world.
 * The mesh is visible immediately. gridPos is set manually so the mining code can
 * capture it, but the block is NOT registered in gridOccupancy (prevents power-ups
 * from targeting underground layers).
 */
function _createUgMesh(col, row, depth, type) {
  var color;
  if (type === UG_DUNGEON_WALL) {
    color = UG_DUNGEON_WALL_COLOR;
  } else if (type === UG_DUNGEON_ENTRANCE) {
    color = UG_DUNGEON_ENT_COLOR;
  } else {
    color = (type === UG_DIRT) ? UG_DIRT_COLOR : UG_STONE_COLOR;
  }

  var mesh = createBlockMesh(color);
  var p    = _ugWorldPos(col, row, depth);
  mesh.position.set(p.x, p.y, p.z);
  mesh.name = 'landed_block';
  mesh.userData.isUnderground = true;
  mesh.userData.ugCol         = col;
  mesh.userData.ugRow         = row;
  mesh.userData.ugDepth       = depth;

  // Dungeon entrance: tag so notifyBlockMined can handle room discovery
  if (type === UG_DUNGEON_ENTRANCE) {
    mesh.userData.isDungeonEntrance = true;
  }

  // Set gridPos so the mining capture in main.js works.
  // x = col - 9, y = -depth - 0.5, z = row - 9  (matches snapGrid / snapGridY).
  mesh.userData.gridPos = { x: col - 9, y: -depth - 0.5, z: row - 9 };

  worldGroup.add(mesh);
  return mesh;
}

/**
 * Pre-generate all underground block meshes at world init.
 * All meshes are created visible; mined cells (dungeon interiors, shaft holes) are skipped.
 */
function _createAllUgMeshes() {
  _ugMeshes = new Map();

  for (var col = 0; col < UNDERGROUND_COLS; col++) {
    for (var row = 0; row < UNDERGROUND_ROWS; row++) {
      for (var depth = 0; depth < UNDERGROUND_DEPTH; depth++) {
        var bKey  = _ugKey(col, row, depth);
        var bData = _ugData.get(bKey);
        if (!bData || bData.mined) continue;
        var mesh = _createUgMesh(col, row, depth, bData.type);
        // Apply dungeon glow (markRoomAdjacentBlocks already populated the sets)
        if (_dungeonGlowKeys.has(bKey)) {
          if (_dungeonGlowFaintKeys.has(bKey)) _applyDungeonGlowFaint(mesh);
          else _applyDungeonGlow(mesh);
        }
        _ugMeshes.set(bKey, mesh);
      }
    }
  }
}

// ── Bedrock boundary walls ───────────────────────────────────────────────────

/**
 * Place indestructible bedrock blocks around the perimeter of the underground
 * space (one block thick exterior wall on all four sides, full depth).
 */
function _createBedrockWalls() {
  if (!worldGroup) return;
  for (var depth = 0; depth < UNDERGROUND_DEPTH; depth++) {
    var y = -depth - 0.5;
    // Left wall  (col = -1 → world X = -10.5)
    for (var row = 0; row < UNDERGROUND_ROWS; row++) {
      _makeBedrockBlock(-10.5, y, row - 9.5);
    }
    // Right wall (col = 20 → world X = 10.5)
    for (var row = 0; row < UNDERGROUND_ROWS; row++) {
      _makeBedrockBlock(10.5, y, row - 9.5);
    }
    // Front wall (row = -1 → world Z = -10.5), corners included
    for (var col = -1; col <= UNDERGROUND_COLS; col++) {
      _makeBedrockBlock(col - 9.5, y, -10.5);
    }
    // Back wall  (row = 20 → world Z = 10.5), corners included
    for (var col = -1; col <= UNDERGROUND_COLS; col++) {
      _makeBedrockBlock(col - 9.5, y, 10.5);
    }
  }
}

/** Create one bedrock block mesh and add it to the scene (no grid registration). */
function _makeBedrockBlock(x, y, z) {
  var mesh = createBlockMesh(UG_BEDROCK_COLOR);
  mesh.position.set(x, y, z);
  mesh.name = 'landed_block';
  mesh.userData.isBedrock = true;
  worldGroup.add(mesh);
  _bedrockWalls.push(mesh);
}

// ── Dungeon room glow ────────────────────────────────────────────────────────

/**
 * Apply warm amber emissive tint to a mesh (called for dungeon-adjacent blocks).
 * @param {THREE.Mesh} mesh
 */
function _applyDungeonGlow(mesh) {
  if (!mesh || !mesh.material) return;
  mesh.material.emissive = new THREE.Color(0x2a1400);
  mesh.material.needsUpdate = true;
}

function _applyDungeonGlowFaint(mesh) {
  if (!mesh || !mesh.material) return;
  mesh.material.emissive = new THREE.Color(0x0a0500);
  mesh.material.needsUpdate = true;
}

/**
 * Flag underground blocks adjacent to dungeon room cells for warm emissive tinting.
 * Call from the dungeon system after room layout is known.
 * Blocks already created get their emissive applied immediately; blocks not yet
 * created pick it up in _createAllUgMeshes.
 *
 * @param {Array<{col:number, row:number, depth:number}>} roomCells
 */
function markRoomAdjacentBlocks(roomCells) {
  if (!_ugData || !roomCells || !roomCells.length) return;
  var GLOW_RADIUS = 5;
  for (var i = 0; i < roomCells.length; i++) {
    var rc = roomCells[i];
    for (var dc = -GLOW_RADIUS; dc <= GLOW_RADIUS; dc++) {
      for (var dr = -GLOW_RADIUS; dr <= GLOW_RADIUS; dr++) {
        for (var dd = -GLOW_RADIUS; dd <= GLOW_RADIUS; dd++) {
          var nc = rc.col   + dc;
          var nr = rc.row   + dr;
          var nd = rc.depth + dd;
          if (nc < 0 || nc >= UNDERGROUND_COLS) continue;
          if (nr < 0 || nr >= UNDERGROUND_ROWS) continue;
          if (nd < 0 || nd >= UNDERGROUND_DEPTH) continue;
          var key   = _ugKey(nc, nr, nd);
          var bData = _ugData.get(key);
          if (!bData || bData.mined) continue;
          var dist = Math.max(Math.abs(dc), Math.abs(dr), Math.abs(dd));
          var isFaint = dist >= 3;
          _dungeonGlowKeys.add(key);
          if (isFaint) {
            _dungeonGlowFaintKeys.add(key);
          } else {
            _dungeonGlowFaintKeys.delete(key);
          }
          var mesh = _ugMeshes.get(key);
          if (mesh) {
            if (isFaint) _applyDungeonGlowFaint(mesh);
            else _applyDungeonGlow(mesh);
          }
        }
      }
    }
  }
}

// ── Persistence helpers ─────────────────────────────────────────────────────

/** Append a mined cell key to localStorage. */
function _appendMinedKey(key) {
  try {
    var raw = localStorage.getItem(UNDERGROUND_MINED_KEY);
    var arr = raw ? JSON.parse(raw) : [];
    if (arr.indexOf(key) === -1) arr.push(key);
    localStorage.setItem(UNDERGROUND_MINED_KEY, JSON.stringify(arr));
  } catch (_) {}
}

/** Load the array of mined cell keys from localStorage. */
function _loadMinedKeys() {
  try {
    var raw = localStorage.getItem(UNDERGROUND_MINED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) { return []; }
}
