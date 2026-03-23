// Dungeon room generation — Phase 2A.
// Generates 1-2 Shallow Mine rooms per world in depths 4-9 (Y=-5 to -10).
// Carves rooms into the underground terrain data layer from underground.js,
// places dungeon-wall + entrance block types, and adds point lights for torches.
//
// Requires: config.js (DUNGEON_WALL_COLOR, DUNGEON_ENTRANCE_COLOR)
//           underground.js (UNDERGROUND_COLS/ROWS/DEPTH, UG_DUNGEON_WALL,
//                           UG_DUNGEON_ENTRANCE, markRoomAdjacentBlocks)
//           state.js / Three.js (scene for PointLights)

// ── Module state ─────────────────────────────────────────────────────────────

var _drRooms         = [];  // Array<RoomObject>
var _drTorchLights   = []; // Array<THREE.PointLight> — removed on clearDungeonRoomLights()
var _drShaftPositions = []; // Array<{col,row}> — 2×2 surface shaft hole positions

var DUNGEON_ROOMS_SAVE_KEY = 'mineCtris_dungeonRooms';

// ── Seeded RNG (mulberry32 — same algorithm as underground.js) ────────────────

function _drMkRng(seed) {
  var s = (seed >>> 0) || 1;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate dungeon rooms for a brand-new Survival world.
 * Carves them into the underground data map and spawns torch lights.
 * Call from initUnderground() after the terrain data is populated.
 *
 * @param {number} seed   Same integer seed used for underground terrain.
 * @param {Map}    ugData Underground data map (col,row,depth → {type,mined}).
 */
function initDungeonRooms(seed, ugData) {
  _drClearState();
  var rng = _drMkRng(((seed ^ 0xdeadbeef) >>> 0));
  _drRooms = _drGenerateRooms(rng);
  _drCarveRooms(ugData);
  _drSaveState();
  _drSpawnTorchLights();
  if (typeof markRoomAdjacentBlocks === 'function') {
    markRoomAdjacentBlocks(_drWallCells());
  }
  carveDungeonShaft(ugData);
}

/**
 * Restore dungeon rooms for a continued Survival world.
 * Re-generates room positions from the stored seed, then re-applies
 * saved completion/discovered state.
 * Call from restoreUnderground() after terrain + mined state are loaded.
 *
 * @param {number} seed   Seed read from localStorage by underground.js.
 * @param {Map}    ugData Underground data map.
 */
function restoreDungeonRooms(seed, ugData) {
  _drClearState();
  var rng = _drMkRng(((seed ^ 0xdeadbeef) >>> 0));
  _drRooms = _drGenerateRooms(rng);

  // Re-apply persisted completion state
  var savedState = _drLoadState();
  if (savedState) {
    for (var i = 0; i < _drRooms.length; i++) {
      var saved = savedState[_drRooms[i].id];
      if (saved) {
        _drRooms[i].completed  = !!saved.completed;
        _drRooms[i].discovered = !!saved.discovered;
      }
    }
  }

  _drCarveRooms(ugData);
  _drSpawnTorchLights();
  if (typeof markRoomAdjacentBlocks === 'function') {
    markRoomAdjacentBlocks(_drWallCells());
  }
  carveDungeonShaft(ugData);
}

/** Return a shallow copy of the current room array. */
function getDungeonRooms() {
  return _drRooms.slice();
}

/** Return a copy of the 2×2 shaft surface positions [{col,row},…]. */
function getDungeonShaftPositions() {
  return _drShaftPositions.slice();
}

/**
 * Carve a 2×2 access shaft from the surface into the underground.
 * Positions shaft 3 blocks from room[0]'s nearest edge toward grid center.
 * Marks depth 0-2 cells as mined in ugData so the shaft is open from the start.
 * Surface grid spawner uses getDungeonShaftPositions() to skip these blocks.
 *
 * @param {Map} ugData  Underground data map (col,row,depth → {type,mined}).
 */
function carveDungeonShaft(ugData) {
  _drShaftPositions = [];
  if (!_drRooms.length) return;

  var room = _drRooms[0];
  var gridCenterCol = 9;
  var gridCenterRow = 9;
  var dCol = gridCenterCol - room.centerCol;
  var dRow = gridCenterRow - room.centerRow;

  var shaftCol, shaftRow;
  if (Math.abs(dCol) >= Math.abs(dRow)) {
    // Primary axis: columns
    var colDir = (dCol >= 0) ? 1 : -1;
    var edgeCol = (colDir > 0) ? room.colMax : room.colMin;
    shaftCol = edgeCol + colDir * 3;
    shaftRow = room.centerRow;
  } else {
    // Primary axis: rows
    var rowDir = (dRow >= 0) ? 1 : -1;
    var edgeRow = (rowDir > 0) ? room.rowMax : room.rowMin;
    shaftCol = room.centerCol;
    shaftRow = edgeRow + rowDir * 3;
  }

  // Clamp so both col and col+1 (and row and row+1) stay within cols/rows 1-18
  shaftCol = Math.max(1, Math.min(17, shaftCol));
  shaftRow = Math.max(1, Math.min(17, shaftRow));

  _drShaftPositions = [
    { col: shaftCol,     row: shaftRow     },
    { col: shaftCol + 1, row: shaftRow     },
    { col: shaftCol,     row: shaftRow + 1 },
    { col: shaftCol + 1, row: shaftRow + 1 },
  ];

  // Pre-mine depths 0-2 for each shaft cell (3 underground layers)
  for (var i = 0; i < _drShaftPositions.length; i++) {
    var sp = _drShaftPositions[i];
    for (var depth = 0; depth < 3; depth++) {
      var key = sp.col + ',' + sp.row + ',' + depth;
      var cell = ugData.get(key);
      if (cell) cell.mined = true;
    }
  }
}

/**
 * Find the dungeon room whose entrance block is at (col, row, depth).
 * Returns the room object, or null if none matches.
 * @param {number} col
 * @param {number} row
 * @param {number} depth
 */
function findRoomByEntrance(col, row, depth) {
  for (var i = 0; i < _drRooms.length; i++) {
    var r = _drRooms[i];
    if (r.depthMin === depth &&
        r.centerCol === col &&
        r.centerRow === row) {
      return r;
    }
  }
  return null;
}

/**
 * Mark a room as discovered (call when player is near entrance).
 * @param {string} roomId
 */
function markDungeonRoomDiscovered(roomId) {
  for (var i = 0; i < _drRooms.length; i++) {
    if (_drRooms[i].id === roomId) {
      if (!_drRooms[i].discovered) {
        _drRooms[i].discovered = true;
        _drSaveState();
      }
      return;
    }
  }
}

/**
 * Mark a room as completed (call after player finishes the dungeon floor).
 * @param {string} roomId
 */
function markDungeonRoomCompleted(roomId) {
  for (var i = 0; i < _drRooms.length; i++) {
    if (_drRooms[i].id === roomId) {
      if (!_drRooms[i].completed) {
        _drRooms[i].completed = true;
        _drSaveState();
      }
      return;
    }
  }
}

/**
 * Remove dungeon room saves from localStorage.
 * Call on voluntary world reset (alongside clearUndergroundSave).
 */
function clearDungeonRoomsSave() {
  try { localStorage.removeItem(DUNGEON_ROOMS_SAVE_KEY); } catch (_) {}
}

/**
 * Remove torch PointLights from the scene.
 * Call from clearUnderground() at session end.
 */
function clearDungeonRoomLights() {
  _drClearTorchLights();
}

// ── Room generation ───────────────────────────────────────────────────────────

/**
 * Generate 1-2 Shallow Mine rooms using the provided seeded RNG.
 *
 * Placement constraints (all in underground grid coordinates):
 *   - Depth band: depths 4-9 (Y ≈ -5 to -10 in world space)
 *   - Room height: 5 depth layers (fixed)
 *   - Room width / depth_z: 5-7 blocks each
 *   - At least 2 blocks from the underground boundary on all horizontal sides
 *   - Not centered directly under the Tetris play area (cols 8-11, rows 8-11)
 *   - Minimum 3-block gap between rooms
 */
function _drGenerateRooms(rng) {
  var rooms = [];
  var maxRooms = rng() < 0.5 ? 1 : 2;
  var attempts = 0;

  while (rooms.length < maxRooms && attempts < 60) {
    attempts++;
    var w = 5 + Math.floor(rng() * 3);       // 5, 6, or 7 columns wide
    var dz = 5 + Math.floor(rng() * 3);      // 5, 6, or 7 rows deep
    var h  = 5;                               // always 5 depth layers tall

    // top depth: 4 or 5 — room bottom is 8 or 9, fully within shallow band
    var topDepth = 4 + Math.floor(rng() * 2);

    var halfW  = Math.floor(w  / 2);
    var halfDz = Math.floor(dz / 2);

    // Center must be at least 2 blocks from boundary + half-room from edge
    var minCenterCol = 2 + halfW;
    var maxCenterCol = UNDERGROUND_COLS - 3 - halfW;
    var minCenterRow = 2 + halfDz;
    var maxCenterRow = UNDERGROUND_ROWS - 3 - halfDz;

    if (maxCenterCol <= minCenterCol || maxCenterRow <= minCenterRow) continue;

    var colRange = maxCenterCol - minCenterCol;
    var rowRange = maxCenterRow - minCenterRow;
    var centerCol = minCenterCol + Math.floor(rng() * (colRange + 1));
    var centerRow = minCenterRow + Math.floor(rng() * (rowRange + 1));

    // Reject if centered directly under the Tetris board core (cols 8-11, rows 8-11)
    if (centerCol >= 8 && centerCol <= 11 && centerRow >= 8 && centerRow <= 11) continue;

    var colMin   = centerCol - halfW;
    var colMax   = colMin + w - 1;
    var rowMin   = centerRow - halfDz;
    var rowMax   = rowMin + dz - 1;
    var depthMin = topDepth;
    var depthMax = topDepth + h - 1;

    // Hard boundary check
    if (colMin < 2 || colMax > UNDERGROUND_COLS - 3) continue;
    if (rowMin < 2 || rowMax > UNDERGROUND_ROWS - 3) continue;
    if (depthMax >= UNDERGROUND_DEPTH) continue;

    // Overlap check: 3-block gap between rooms
    var overlap = false;
    for (var i = 0; i < rooms.length; i++) {
      var r = rooms[i];
      if (colMin   <= r.colMax   + 3 && colMax   >= r.colMin   - 3 &&
          rowMin   <= r.rowMax   + 3 && rowMax   >= r.rowMin   - 3 &&
          depthMin <= r.depthMax + 3 && depthMax >= r.depthMin - 3) {
        overlap = true;
        break;
      }
    }
    if (overlap) continue;

    rooms.push({
      id:         'room_' + rooms.length,
      tier:       'shallow',
      centerCol:  centerCol,
      centerRow:  centerRow,
      topDepth:   topDepth,
      colMin:     colMin,
      colMax:     colMax,
      rowMin:     rowMin,
      rowMax:     rowMax,
      depthMin:   depthMin,
      depthMax:   depthMax,
      width:      w,
      height:     h,
      depth_z:    dz,
      // boardWidth: Tetris board columns for the room challenge (min 7 per design spec)
      boardWidth: Math.max(7, w),
      completed:  false,
      discovered: false,
      loot:       [],
    });
  }
  return rooms;
}

// ── Carving ───────────────────────────────────────────────────────────────────

/**
 * Carve all rooms into the underground data map.
 * - Interior cells: marked mined=true (hollow)
 * - Perimeter cells: type = UG_DUNGEON_WALL (non-mineable stone-brick)
 * - Top-center cell: type = UG_DUNGEON_ENTRANCE (3-hit entrance block)
 */
function _drCarveRooms(ugData) {
  for (var i = 0; i < _drRooms.length; i++) {
    _drCarveOneRoom(ugData, _drRooms[i]);
  }
}

function _drCarveOneRoom(ugData, room) {
  for (var col = room.colMin; col <= room.colMax; col++) {
    for (var row = room.rowMin; row <= room.rowMax; row++) {
      for (var depth = room.depthMin; depth <= room.depthMax; depth++) {
        var key = col + ',' + row + ',' + depth;
        var isPerimeter = (
          col   === room.colMin  || col   === room.colMax  ||
          row   === room.rowMin  || row   === room.rowMax  ||
          depth === room.depthMin || depth === room.depthMax
        );

        if (!isPerimeter) {
          // Interior: clear to empty space
          var cell = ugData.get(key);
          if (cell) cell.mined = true;
          continue;
        }

        // Entrance: top-center single block (col=centerCol, row=centerRow, depth=depthMin)
        if (depth === room.depthMin &&
            col === room.centerCol &&
            row === room.centerRow) {
          ugData.set(key, { type: UG_DUNGEON_ENTRANCE, mined: false });
          continue;
        }

        // All other perimeter cells: non-mineable wall
        ugData.set(key, { type: UG_DUNGEON_WALL, mined: false });
      }
    }
  }
}

/** Return all perimeter cell positions across all rooms. */
function _drWallCells() {
  var cells = [];
  for (var i = 0; i < _drRooms.length; i++) {
    var room = _drRooms[i];
    for (var col = room.colMin; col <= room.colMax; col++) {
      for (var row = room.rowMin; row <= room.rowMax; row++) {
        for (var depth = room.depthMin; depth <= room.depthMax; depth++) {
          var isPerimeter = (
            col   === room.colMin  || col   === room.colMax  ||
            row   === room.rowMin  || row   === room.rowMax  ||
            depth === room.depthMin || depth === room.depthMax
          );
          if (isPerimeter) {
            cells.push({ col: col, row: row, depth: depth });
          }
        }
      }
    }
  }
  return cells;
}

// ── Torch lights ──────────────────────────────────────────────────────────────

/** Spawn warm point lights inside each room at symmetric positions. */
function _drSpawnTorchLights() {
  if (typeof THREE === 'undefined' || typeof scene === 'undefined' || !scene) return;
  for (var i = 0; i < _drRooms.length; i++) {
    var room = _drRooms[i];
    // Two torches at quarter-points along the room width, at mid-height, centered on Z
    var midDepth = room.depthMin + Math.floor(room.height / 2);
    var q1col    = room.colMin + Math.floor(room.width / 4);
    var q3col    = room.colMin + Math.floor(3 * room.width / 4);
    _drAddTorch(q1col,    room.centerRow, midDepth);
    _drAddTorch(q3col,    room.centerRow, midDepth);
  }
}

function _drAddTorch(col, row, depth) {
  var light = new THREE.PointLight(0xff8c00, 1.4, 7);
  var p = _drWorldPos(col, row, depth);
  light.position.set(p.x, p.y, p.z);
  scene.add(light);
  _drTorchLights.push(light);
}

function _drClearTorchLights() {
  for (var i = 0; i < _drTorchLights.length; i++) {
    if (typeof scene !== 'undefined' && scene) {
      scene.remove(_drTorchLights[i]);
    }
  }
  _drTorchLights = [];
}

/** World-space centre for a grid cell (mirrors _ugWorldPos in underground.js). */
function _drWorldPos(col, row, depth) {
  return { x: col - 9.5, y: -depth - 0.5, z: row - 9.5 };
}

// ── State management ──────────────────────────────────────────────────────────

function _drClearState() {
  _drClearTorchLights();
  _drRooms = [];
  _drShaftPositions = [];
}

/** Persist completion/discovered state for each room. */
function _drSaveState() {
  try {
    var map = {};
    for (var i = 0; i < _drRooms.length; i++) {
      var r = _drRooms[i];
      map[r.id] = { completed: r.completed, discovered: r.discovered };
    }
    localStorage.setItem(DUNGEON_ROOMS_SAVE_KEY, JSON.stringify(map));
  } catch (_) {}
}

/** Load completion/discovered state from localStorage. */
function _drLoadState() {
  try {
    var raw = localStorage.getItem(DUNGEON_ROOMS_SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}
