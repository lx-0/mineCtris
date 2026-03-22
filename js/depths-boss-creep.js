// The Creep — Shallow tier overgrowth boss encounter.
// Moss spawns on empty cells, hardens into permanent obstacles, and vines spread
// from existing moss. Line-clears remove moss/vine in cleared rows.
//
// Requires: config.js (HAZARD_COLOR_*, BLOCK_TYPES), world.js (createBlockMesh,
//           registerBlock, unregisterBlock), state.js (gridOccupancy, worldGroup),
//           depths-boss.js (getBossState, dealBossMineDamage),
//           hazard-blocks.js (registerHazardBlock, unregisterHazardBlock)
// Used by:  depths-boss.js (_fireMechanic dispatches moss_spawn / vine_spread)

// ── Tracking arrays ────────────────────────────────────────────────────────────
// Each soft moss entry: { block, hardenTimer }
// Vine entries: { block }

var _creepSoftMoss = [];
var _creepVines    = [];

// ── Public API (called by depths-boss.js _fireMechanic) ────────────────────────

/**
 * Spawn soft moss blocks on random empty cells.
 * @param {number} count       Number of moss blocks to spawn
 * @param {number} hardenSecs  Seconds before soft moss hardens
 */
function spawnCreepMoss(count, hardenSecs) {
  var empties = _getEmptyCells();
  if (empties.length === 0) return;

  for (var i = 0; i < count && empties.length > 0; i++) {
    var idx = Math.floor(Math.random() * empties.length);
    var cell = empties.splice(idx, 1)[0];
    _placeCreepMoss(cell.x, cell.y, cell.z, hardenSecs);
  }
}

/**
 * Spread vine blocks from existing moss/vine to adjacent empty cells.
 * @param {number} count  Number of vine blocks to spread
 */
function spreadCreepVines(count) {
  var sources = _getAllCreepBlocks();
  if (sources.length === 0) return;

  var placed = 0;
  var attempts = 0;
  var maxAttempts = sources.length * 4;

  while (placed < count && attempts < maxAttempts) {
    attempts++;
    var src = sources[Math.floor(Math.random() * sources.length)];
    var gp = src.userData.gridPos;
    if (!gp) continue;

    // Pick a random adjacent cell (4 cardinal directions on x/z plane, same y)
    var offsets = [
      { x: 1, z: 0 }, { x: -1, z: 0 },
      { x: 0, z: 1 }, { x: 0, z: -1 },
    ];
    var off = offsets[Math.floor(Math.random() * offsets.length)];
    var nx = gp.x + off.x;
    var nz = gp.z + off.z;

    if (_isCellEmpty(nx, gp.y, nz) && _isInBounds(nx, nz)) {
      _placeCreepVine(nx, gp.y, nz);
      placed++;
    }
  }
}

/**
 * Per-frame tick for The Creep mechanics.
 * Handles soft moss hardening timers and visual effects.
 * Called from updateHazardBlocks() in hazard-blocks.js.
 * @param {number} delta  Seconds since last frame
 */
function updateCreepBlocks(delta) {
  _updateSoftMoss(delta);
  _updateVineVisuals(delta);
}

/**
 * Clean up all Creep-spawned blocks. Called on boss cleanup.
 */
function cleanupCreepBlocks() {
  _creepSoftMoss.length = 0;
  _creepVines.length = 0;
}

// ── Soft moss hardening ────────────────────────────────────────────────────────

function _updateSoftMoss(delta) {
  for (var i = _creepSoftMoss.length - 1; i >= 0; i--) {
    var entry = _creepSoftMoss[i];
    var block = entry.block;

    // Block may have been removed by line-clear or mining
    if (!block.parent || !block.userData.gridPos) {
      _creepSoftMoss.splice(i, 1);
      continue;
    }

    entry.hardenTimer -= delta;

    // Visual: pulse green glow while minable
    if (block.material) {
      var progress = 1 - Math.max(0, entry.hardenTimer / entry.hardenMax);
      // Glow fades from bright green to dull as hardening approaches
      var glow = 0.4 * (1 - progress);
      block.material.emissive.setRGB(0, glow, 0);
      block.material.needsUpdate = true;
    }

    if (entry.hardenTimer <= 0) {
      // Harden: convert to permanent obstacle
      _hardenMossBlock(block);
      _creepSoftMoss.splice(i, 1);
    }
  }
}

function _hardenMossBlock(block) {
  var gp = block.userData.gridPos;
  if (!gp) return;

  // Unregister the soft moss
  if (typeof unregisterHazardBlock === 'function') unregisterHazardBlock(block);
  if (typeof unregisterBlock === 'function') unregisterBlock(block);
  if (typeof worldGroup !== 'undefined') worldGroup.remove(block);

  // Place a hardened moss block (permanent, unmineable)
  var hardenedBlock = createBlockMesh(HAZARD_COLOR_HARDENED_MOSS);
  hardenedBlock.position.set(gp.x, gp.y, gp.z);
  hardenedBlock.name = 'landed_block';
  hardenedBlock.userData.materialType = 'hardened_moss';
  hardenedBlock.userData.bossSpawned = true;
  if (typeof worldGroup !== 'undefined') worldGroup.add(hardenedBlock);
  if (typeof registerBlock === 'function') registerBlock(hardenedBlock);
}

// ── Vine visuals ───────────────────────────────────────────────────────────────

function _updateVineVisuals(delta) {
  for (var i = _creepVines.length - 1; i >= 0; i--) {
    var entry = _creepVines[i];
    var block = entry.block;

    // Block may have been removed
    if (!block.parent || !block.userData.gridPos) {
      _creepVines.splice(i, 1);
      continue;
    }

    // Subtle tendril animation: gentle sway
    if (block.material) {
      var pulse = 0.1 + Math.sin(performance.now() * 0.002 + i * 1.7) * 0.08;
      block.material.emissive.setRGB(0, pulse, 0);
      block.material.needsUpdate = true;
    }
  }
}

// ── Block placement helpers ────────────────────────────────────────────────────

function _placeCreepMoss(x, y, z, hardenSecs) {
  var block = createBlockMesh(HAZARD_COLOR_SOFT_MOSS);
  block.position.set(x, y, z);
  block.name = 'landed_block';
  block.userData.materialType = 'soft_moss';
  block.userData.bossSpawned = true;
  if (typeof worldGroup !== 'undefined') worldGroup.add(block);
  if (typeof registerBlock === 'function') registerBlock(block);

  _creepSoftMoss.push({
    block: block,
    hardenTimer: hardenSecs,
    hardenMax: hardenSecs,
  });
}

function _placeCreepVine(x, y, z) {
  var block = createBlockMesh(HAZARD_COLOR_VINE);
  block.position.set(x, y, z);
  block.name = 'landed_block';
  block.userData.materialType = 'vine';
  block.userData.bossSpawned = true;
  if (typeof worldGroup !== 'undefined') worldGroup.add(block);
  if (typeof registerBlock === 'function') registerBlock(block);

  _creepVines.push({ block: block });
}

// ── Board helpers ──────────────────────────────────────────────────────────────

function _getEmptyCells() {
  var empties = [];
  if (typeof gridOccupancy === 'undefined') return empties;

  var width = (typeof DEPTHS_BOARD_WIDTH !== 'undefined') ? DEPTHS_BOARD_WIDTH : 8;
  var halfW = width / 2;

  // Scan lower half of board (y = 0.5 to 10.5) for reachable empty cells
  for (var y = 0.5; y <= 10.5; y += 1) {
    var layer = gridOccupancy.get(y);
    for (var x = -halfW + 0.5; x < halfW + 0.5; x += 1) {
      var key = x + ',0';
      if (!layer || !layer.has(key)) {
        // Check the cell above also — only place moss where it can rest
        // (on a filled cell or the ground)
        var belowY = y - 1;
        if (belowY < 0 || _isCellOccupied(x, belowY, 0)) {
          empties.push({ x: x, y: y, z: 0 });
        }
      }
    }
  }

  return empties;
}

function _isCellEmpty(x, y, z) {
  if (typeof gridOccupancy === 'undefined') return false;
  var layer = gridOccupancy.get(y);
  if (!layer) return true;
  return !layer.has(x + ',' + z);
}

function _isCellOccupied(x, y, z) {
  if (typeof gridOccupancy === 'undefined') return false;
  var layer = gridOccupancy.get(y);
  if (!layer) return false;
  return layer.has(x + ',' + z);
}

function _isInBounds(x, z) {
  var width = (typeof DEPTHS_BOARD_WIDTH !== 'undefined') ? DEPTHS_BOARD_WIDTH : 8;
  var halfW = width / 2;
  return x >= -halfW + 0.5 && x < halfW + 0.5;
}

function _getAllCreepBlocks() {
  var blocks = [];
  for (var i = 0; i < _creepSoftMoss.length; i++) {
    var b = _creepSoftMoss[i].block;
    if (b.parent && b.userData.gridPos) blocks.push(b);
  }
  for (var j = 0; j < _creepVines.length; j++) {
    var v = _creepVines[j].block;
    if (v.parent && v.userData.gridPos) blocks.push(v);
  }
  // Also include hardened moss blocks on the board
  if (typeof worldGroup !== 'undefined') {
    for (var k = 0; k < worldGroup.children.length; k++) {
      var obj = worldGroup.children[k];
      if (obj.userData.materialType === 'hardened_moss' && obj.userData.gridPos) {
        blocks.push(obj);
      }
    }
  }
  return blocks;
}
