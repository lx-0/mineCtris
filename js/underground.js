// Underground terrain — data layer, chunk-based mesh loading, and depth lighting.
// Phase 1B: 20×20×10 grid below the mineable surface.
//
// Depth layers:
//   depth 0-2  → world Y -0.5 to -2.5  → Dirt  (2 mining hits)
//   depth 3-9  → world Y -3.5 to -9.5  → Stone (4 mining hits)
//
// Chunk size: 8×8×4. Load radius: 2 chunks. Unload distance: 4 chunks.
//
// Requires: config.js, world.js (createBlockMesh, registerBlock, unregisterBlock,
//           disposeBlock), state.js (worldGroup, hemisphereLight, isSurvivalMode,
//           controls)

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

var UG_CHUNK_H    = 8;   // columns / rows per horizontal chunk slice
var UG_CHUNK_V    = 4;   // depth layers per vertical chunk slice

var UG_LOAD_RADIUS   = 2;  // load chunks within this Chebyshev distance
var UG_UNLOAD_DIST   = 4;  // unload chunks beyond this Chebyshev distance

// localStorage persistence key
var UNDERGROUND_MINED_KEY = 'mineCtris_undergroundMined';
var UNDERGROUND_SEED_KEY  = 'mineCtris_undergroundSeed';

// Module-private state
var _ugData          = null;      // Map<"col,row,depth", {type, mined}>
var _ugMeshes        = new Map(); // Map<"col,row,depth", THREE.Mesh>
var _loadedChunks    = new Set(); // Set<"cx,cz,cy">
var _ugChunkTimer    = 0;         // throttle: seconds until next chunk update
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

/** Chunk coordinates for (col, row, depth). */
function _ugChunkCoords(col, row, depth) {
  return {
    cx: Math.floor(col   / UG_CHUNK_H),
    cz: Math.floor(row   / UG_CHUNK_H),
    cy: Math.floor(depth / UG_CHUNK_V),
  };
}

/** Data-map key. */
function _ugKey(col, row, depth) {
  return col + ',' + row + ',' + depth;
}

/**
 * Convert a registered grid X back to column index.
 * Surface blocks: x_world = col - 9.5, gx = Math.round(x_world) = col - 9 (for all col 0..19).
 */
function _gxToCol(gx) { return gx + 9; }
function _gzToRow(gz) { return gz + 9; }

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
}

/**
 * Per-frame tick. Updates chunk loading/unloading and depth lighting.
 * Throttled internally — safe to call every frame.
 * @param {number} delta  Seconds since last frame.
 */
function updateUndergroundChunks(delta) {
  if (!_ugData || !isSurvivalMode) return;
  if (!controls || !controls.isLocked) return;

  _ugChunkTimer -= delta;
  if (_ugChunkTimer > 0) return;
  _ugChunkTimer = 0.5; // run at most twice per second

  var pos   = controls.getObject().position;
  var pCol  = pos.x + 9.5;
  var pRow  = pos.z + 9.5;
  var pDepth = Math.max(0, -pos.y - 0.5); // world Y < 0 → depth

  var pcx = Math.floor(pCol  / UG_CHUNK_H);
  var pcz = Math.floor(pRow  / UG_CHUNK_H);
  var pcy = Math.floor(pDepth / UG_CHUNK_V);

  // Load chunks within radius
  for (var dx = -UG_LOAD_RADIUS; dx <= UG_LOAD_RADIUS; dx++) {
    for (var dz = -UG_LOAD_RADIUS; dz <= UG_LOAD_RADIUS; dz++) {
      for (var dy = -UG_LOAD_RADIUS; dy <= UG_LOAD_RADIUS; dy++) {
        var cx = pcx + dx, cz = pcz + dz, cy = pcy + dy;
        if (cx < 0 || cz < 0 || cy < 0) continue;
        if (cx * UG_CHUNK_H >= UNDERGROUND_COLS)  continue;
        if (cz * UG_CHUNK_H >= UNDERGROUND_ROWS)  continue;
        if (cy * UG_CHUNK_V >= UNDERGROUND_DEPTH) continue;
        _loadChunk(cx, cz, cy);
      }
    }
  }

  // Unload distant chunks
  var toUnload = [];
  _loadedChunks.forEach(function (key) {
    var parts = key.split(',');
    var cx = +parts[0], cz = +parts[1], cy = +parts[2];
    var dist = Math.max(
      Math.abs(cx - pcx),
      Math.abs(cz - pcz),
      Math.abs(cy - pcy)
    );
    if (dist > UG_UNLOAD_DIST) toUnload.push({ cx: cx, cz: cz, cy: cy });
  });
  for (var i = 0; i < toUnload.length; i++) {
    var c = toUnload[i];
    _unloadChunk(c.cx, c.cz, c.cy);
  }

  // Update depth-based ambient lighting
  _updateDepthLighting(pos.y);
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
  var gp = blockData.gridPos;
  if (!gp) return;

  if (blockData.isUnderground) {
    // ── Underground block mined ──────────────────────────────────────────
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

    // Reveal the block directly below (next depth layer)
    if (depth + 1 < UNDERGROUND_DEPTH) {
      _revealBlock(col, row, depth + 1);
    }

  } else {
    // ── Surface block (Y ≈ 0.5) mined — reveal depth=0 block below ──────
    if (Math.abs(gp.y - 0.5) > 0.1) return; // only Y=0.5 surface blocks
    var col = _gxToCol(gp.x);
    var row = _gzToRow(gp.z);
    if (col < 0 || col >= UNDERGROUND_COLS) return;
    if (row < 0 || row >= UNDERGROUND_ROWS) return;
    _revealBlock(col, row, 0);
  }
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
  // Restore default hemisphere light intensity
  if (typeof hemisphereLight !== 'undefined' && hemisphereLight) {
    hemisphereLight.intensity = 0.5;
  }
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
  _loadedChunks    = new Set();
  _ugChunkTimer    = 0;
  _bedrockWalls    = [];
  _dungeonGlowKeys      = new Set();
  _dungeonGlowFaintKeys = new Set();
}

/** Instantiate a THREE.js mesh for the given underground block and add it to the world. */
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

  worldGroup.add(mesh);
  registerBlock(mesh);
  return mesh;
}

/** Load a chunk — create meshes for all unmined blocks it contains. */
function _loadChunk(cx, cz, cy) {
  var cKey = cx + ',' + cz + ',' + cy;
  if (_loadedChunks.has(cKey)) return;
  _loadedChunks.add(cKey);

  var colStart   = cx * UG_CHUNK_H;
  var rowStart   = cz * UG_CHUNK_H;
  var depthStart = cy * UG_CHUNK_V;

  for (var col = colStart; col < colStart + UG_CHUNK_H && col < UNDERGROUND_COLS; col++) {
    for (var row = rowStart; row < rowStart + UG_CHUNK_H && row < UNDERGROUND_ROWS; row++) {
      for (var depth = depthStart; depth < depthStart + UG_CHUNK_V && depth < UNDERGROUND_DEPTH; depth++) {
        var bKey  = _ugKey(col, row, depth);
        var bData = _ugData.get(bKey);
        if (!bData || bData.mined || _ugMeshes.has(bKey)) continue;
        var mesh = _createUgMesh(col, row, depth, bData.type);
        _ugMeshes.set(bKey, mesh);
        if (_dungeonGlowKeys.has(bKey)) {
          if (_dungeonGlowFaintKeys.has(bKey)) _applyDungeonGlowFaint(mesh);
          else _applyDungeonGlow(mesh);
        }
      }
    }
  }
}

/** Unload a chunk — dispose and remove all its meshes. */
function _unloadChunk(cx, cz, cy) {
  var cKey = cx + ',' + cz + ',' + cy;
  if (!_loadedChunks.has(cKey)) return;
  _loadedChunks.delete(cKey);

  var colStart   = cx * UG_CHUNK_H;
  var rowStart   = cz * UG_CHUNK_H;
  var depthStart = cy * UG_CHUNK_V;

  for (var col = colStart; col < colStart + UG_CHUNK_H && col < UNDERGROUND_COLS; col++) {
    for (var row = rowStart; row < rowStart + UG_CHUNK_H && row < UNDERGROUND_ROWS; row++) {
      for (var depth = depthStart; depth < depthStart + UG_CHUNK_V && depth < UNDERGROUND_DEPTH; depth++) {
        var bKey = _ugKey(col, row, depth);
        var mesh = _ugMeshes.get(bKey);
        if (!mesh) continue;
        unregisterBlock(mesh);
        disposeBlock(mesh);
        worldGroup.remove(mesh);
        _ugMeshes.delete(bKey);
      }
    }
  }
}

/**
 * Ensure a specific block has a mesh (reveal it after mining a block above).
 * Force-loads the block's chunk if not already loaded.
 */
function _revealBlock(col, row, depth) {
  var bKey  = _ugKey(col, row, depth);
  var bData = _ugData.get(bKey);
  if (!bData || bData.mined || _ugMeshes.has(bKey)) return;

  var c    = _ugChunkCoords(col, row, depth);
  var cKey = c.cx + ',' + c.cz + ',' + c.cy;
  if (!_loadedChunks.has(cKey)) {
    // Force-load this one chunk so the revealed block is immediately visible
    _loadChunk(c.cx, c.cz, c.cy);
  } else {
    // Chunk already loaded but mesh missing (shouldn't normally happen, but be safe)
    var mesh = _createUgMesh(col, row, depth, bData.type);
    _ugMeshes.set(bKey, mesh);
    if (_dungeonGlowKeys.has(bKey)) {
      if (_dungeonGlowFaintKeys.has(bKey)) _applyDungeonGlowFaint(mesh);
      else _applyDungeonGlow(mesh);
    }
  }
}

/**
 * Lerp hemisphere light intensity from 0.5 (surface) to 0.1 (Y=-10).
 * Only dims when the player is underground (Y < 0).
 */
function _updateDepthLighting(playerY) {
  if (typeof hemisphereLight === 'undefined' || !hemisphereLight) return;
  if (playerY >= 0) {
    // At or above surface: restore full intensity
    hemisphereLight.intensity = 0.5;
    return;
  }
  // t = 0 at Y=0, t = 1 at Y=-10
  var t = Math.max(0, Math.min(1, -playerY / 10));
  hemisphereLight.intensity = 0.5 - 0.4 * t; // lerp 0.5 → 0.1
}

// ── Bedrock boundary walls ───────────────────────────────────────────────────

/**
 * Place indestructible bedrock blocks around the perimeter of the underground
 * space (one block thick exterior wall on all four sides, full depth).
 * These are always loaded — no chunk management needed.
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
 * Flag underground blocks adjacent to dungeon room cells for warm emissive
 * tinting. Call from the dungeon system (MINAA-348) after room layout is known.
 * Blocks that are already loaded get their emissive applied immediately; blocks
 * not yet loaded pick it up when their chunk is loaded.
 *
 * @param {Array<{col:number, row:number, depth:number}>} roomCells
 *   Array of cell positions that form room walls. Blocks within 5 steps of any
 *   room cell are flagged (full amber 1-2 steps, faint glow 3-5 steps).
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
          // Chebyshev distance from the room wall cell
          var dist = Math.max(Math.abs(dc), Math.abs(dr), Math.abs(dd));
          var isFaint = dist >= 3;
          _dungeonGlowKeys.add(key);
          if (isFaint) {
            _dungeonGlowFaintKeys.add(key);
          } else {
            // Full-intensity overwrites a previously faint entry for the same key
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
