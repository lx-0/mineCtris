// The Furnace — Deep tier heat and pressure boss encounter.
// Magma blocks rise from the bottom, solidify into obsidian, pieces fall faster,
// lava pools form after line-clears, and rare ice blocks neutralize lava.
//
// Requires: config.js (HAZARD_COLOR_*, BLOCK_TYPES), world.js (createBlockMesh,
//           registerBlock, unregisterBlock), state.js (gridOccupancy, worldGroup),
//           depths-boss.js (getBossState, dealBossMineDamage),
//           hazard-blocks.js (registerHazardBlock, unregisterHazardBlock)
// Used by:  depths-boss.js (_fireMechanic dispatches magma_rise / lava_pool)

// ── Color constants ──────────────────────────────────────────────────────────

var FURNACE_COLOR_MAGMA     = 0xff4400;   // glowing orange magma
var FURNACE_COLOR_OBSIDIAN  = 0x1a0a2e;   // dark purple-black obsidian
var FURNACE_COLOR_LAVA_POOL = 0xff6600;   // bright orange lava
var FURNACE_COLOR_ICE       = 0x88ccff;   // crystalline blue ice

// ── Tracking arrays ──────────────────────────────────────────────────────────
// Magma entries: { block, solidifyTimer, solidifyMax }
// Obsidian entries: { block, mineHits } (8 hits to destroy)
// Lava pool entries: { block, dangerTimer } (2s danger zone)
// Ice entries: { block }

var _furnaceMagma    = [];
var _furnaceObsidian = [];
var _furnaceLava     = [];
var _furnaceIce      = [];

// Track ice pieces injected into piece queue
var _furnaceIcePieceCounter = 0;
var _furnaceIcePieceThreshold = 20;  // 1 ice per 20 pieces

// ── Public API (called by depths-boss.js _fireMechanic) ──────────────────────

/**
 * Spawn magma blocks rising from the bottom row.
 * @param {number} count  Number of magma blocks to spawn
 */
function spawnFurnaceMagma(count) {
  var bottomCells = _getBottomRowCells();
  if (bottomCells.length === 0) return;

  for (var i = 0; i < count && bottomCells.length > 0; i++) {
    var idx = Math.floor(Math.random() * bottomCells.length);
    var cell = bottomCells.splice(idx, 1)[0];
    _placeFurnaceMagma(cell.x, cell.y, cell.z);
  }
}

/**
 * Spawn lava pool cells at given positions after a line-clear.
 * Called by The Furnace mechanic when lines are cleared.
 * @param {number} count      Number of lava cells to create
 * @param {Array}  positions  Array of {x, y, z} positions in the cleared area
 */
function spawnFurnaceLavaPools(count, positions) {
  if (!positions || positions.length === 0) return;

  for (var i = 0; i < count && positions.length > 0; i++) {
    var idx = Math.floor(Math.random() * positions.length);
    var cell = positions.splice(idx, 1)[0];
    _placeFurnaceLava(cell.x, cell.y, cell.z);
  }
}

/**
 * Notify The Furnace that lines were cleared (for lava pool spawning).
 * @param {number} lineCount   Number of lines cleared
 * @param {Array}  clearedRows Array of y-values for cleared rows
 */
function onFurnaceLinesClear(lineCount, clearedRows) {
  if (!_isFurnaceActive()) return;

  // Determine lava pool count from current phase
  var lavaCount = _getFurnaceLavaCount();
  if (lavaCount <= 0) return;

  // Collect positions in the cleared area
  var positions = [];
  var width = (typeof DEPTHS_BOARD_WIDTH !== 'undefined') ? DEPTHS_BOARD_WIDTH : 8;
  var halfW = width / 2;

  if (clearedRows && clearedRows.length > 0) {
    for (var r = 0; r < clearedRows.length; r++) {
      var y = clearedRows[r];
      for (var x = -halfW + 0.5; x < halfW + 0.5; x += 1) {
        if (_isFurnaceCellEmpty(x, y, 0)) {
          positions.push({ x: x, y: y, z: 0 });
        }
      }
    }
  }

  spawnFurnaceLavaPools(lavaCount, positions);
}

/**
 * Per-frame tick for The Furnace mechanics.
 * Handles magma solidification, obsidian visuals, lava danger timers, ice adjacency.
 * Called from updateHazardBlocks() in hazard-blocks.js.
 * @param {number} delta  Seconds since last frame
 */
function updateFurnaceBlocks(delta) {
  _updateFurnaceMagma(delta);
  _updateFurnaceObsidian(delta);
  _updateFurnaceLava(delta);
  _updateFurnaceIce(delta);
}

/**
 * Clean up all Furnace-spawned blocks. Called on boss cleanup.
 */
function cleanupFurnaceBlocks() {
  _furnaceMagma.length = 0;
  _furnaceObsidian.length = 0;
  _furnaceLava.length = 0;
  _furnaceIce.length = 0;
  _furnaceIcePieceCounter = 0;
}

/**
 * Notify The Furnace that a piece was placed (for ice piece injection tracking).
 * Returns true if this piece should be replaced with an ice block.
 */
function furnaceCheckIcePiece() {
  if (!_isFurnaceActive()) return false;

  _furnaceIcePieceCounter++;
  if (_furnaceIcePieceCounter >= _furnaceIcePieceThreshold) {
    _furnaceIcePieceCounter = 0;
    return true;
  }
  return false;
}

/**
 * Place an ice block at the given position (from an ice piece landing).
 * Ice neutralizes adjacent lava on placement.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
function placeFurnaceIce(x, y, z) {
  var block = createBlockMesh(FURNACE_COLOR_ICE);
  block.position.set(x, y, z);
  block.name = 'landed_block';
  block.userData.materialType = 'furnace_ice';
  block.userData.bossSpawned = true;
  if (typeof worldGroup !== 'undefined') worldGroup.add(block);
  if (typeof registerBlock === 'function') registerBlock(block);

  _furnaceIce.push({ block: block });

  // Check for adjacent lava neutralization immediately
  _checkIceLavaNeutralize(block);
}

// ── Magma solidification ────────────────────────────────────────────────────

function _updateFurnaceMagma(delta) {
  for (var i = _furnaceMagma.length - 1; i >= 0; i--) {
    var entry = _furnaceMagma[i];
    var block = entry.block;

    // Block may have been removed by line-clear or mining
    if (!block.parent || !block.userData.gridPos) {
      _furnaceMagma.splice(i, 1);
      continue;
    }

    entry.solidifyTimer -= delta;

    // Visual: pulsing orange glow that dims as solidification approaches
    if (block.material) {
      var progress = 1 - Math.max(0, entry.solidifyTimer / entry.solidifyMax);
      var pulse = Math.sin(performance.now() * 0.005 + i * 2.3) * 0.15;
      var glow = 0.5 * (1 - progress) + pulse;
      block.material.emissive.setRGB(Math.max(0, glow), Math.max(0, glow * 0.3), 0);
      block.material.needsUpdate = true;
    }

    if (entry.solidifyTimer <= 0) {
      // Solidify into obsidian
      _solidifyToObsidian(block);
      _furnaceMagma.splice(i, 1);
    }
  }
}

function _solidifyToObsidian(block) {
  var gp = block.userData.gridPos;
  if (!gp) return;

  // Remove the magma block
  if (typeof unregisterHazardBlock === 'function') unregisterHazardBlock(block);
  if (typeof unregisterBlock === 'function') unregisterBlock(block);
  if (typeof worldGroup !== 'undefined') worldGroup.remove(block);

  // Place obsidian block (very tough, 8 hits to mine)
  var obsBlock = createBlockMesh(FURNACE_COLOR_OBSIDIAN);
  obsBlock.position.set(gp.x, gp.y, gp.z);
  obsBlock.name = 'landed_block';
  obsBlock.userData.materialType = 'furnace_obsidian';
  obsBlock.userData.bossSpawned = true;
  obsBlock.userData.mineHitsRequired = 8;
  obsBlock.userData.mineHitsRemaining = 8;
  if (typeof worldGroup !== 'undefined') worldGroup.add(obsBlock);
  if (typeof registerBlock === 'function') registerBlock(obsBlock);

  _furnaceObsidian.push({ block: obsBlock });
}

// ── Obsidian visuals ────────────────────────────────────────────────────────

function _updateFurnaceObsidian(delta) {
  for (var i = _furnaceObsidian.length - 1; i >= 0; i--) {
    var entry = _furnaceObsidian[i];
    var block = entry.block;

    if (!block.parent || !block.userData.gridPos) {
      _furnaceObsidian.splice(i, 1);
      continue;
    }

    // Cracking texture effect: subtle purple pulse based on remaining hits
    if (block.material && block.userData.mineHitsRemaining !== undefined) {
      var hitsLeft = block.userData.mineHitsRemaining;
      var crackProgress = 1 - (hitsLeft / 8);
      // More cracks = more emissive purple glow showing through
      var crackGlow = crackProgress * 0.15;
      block.material.emissive.setRGB(crackGlow * 0.3, 0, crackGlow);
      block.material.needsUpdate = true;
    }
  }
}

// ── Lava pools ───────────────────────────────────────────────────────────────

function _updateFurnaceLava(delta) {
  for (var i = _furnaceLava.length - 1; i >= 0; i--) {
    var entry = _furnaceLava[i];
    var block = entry.block;

    if (!block.parent || !block.userData.gridPos) {
      _furnaceLava.splice(i, 1);
      continue;
    }

    entry.dangerTimer -= delta;

    // Visual: bright orange with bubble-like pulsing
    if (block.material) {
      var bubblePulse = Math.sin(performance.now() * 0.008 + i * 1.5) * 0.2;
      block.material.emissive.setRGB(0.5 + bubblePulse, 0.2 + bubblePulse * 0.3, 0);
      block.material.opacity = 0.7 + Math.sin(performance.now() * 0.003) * 0.15;
      block.material.transparent = true;
      block.material.needsUpdate = true;
    }

    if (entry.dangerTimer <= 0) {
      // Lava pool fades away
      if (typeof unregisterHazardBlock === 'function') unregisterHazardBlock(block);
      if (typeof unregisterBlock === 'function') unregisterBlock(block);
      if (typeof worldGroup !== 'undefined') worldGroup.remove(block);
      _furnaceLava.splice(i, 1);
    }
  }
}

// ── Ice block updates ────────────────────────────────────────────────────────

function _updateFurnaceIce(delta) {
  for (var i = _furnaceIce.length - 1; i >= 0; i--) {
    var entry = _furnaceIce[i];
    var block = entry.block;

    if (!block.parent || !block.userData.gridPos) {
      _furnaceIce.splice(i, 1);
      continue;
    }

    // Frost particle visual: crystalline shimmer
    if (block.material) {
      var frost = 0.15 + Math.sin(performance.now() * 0.003 + i * 0.9) * 0.1;
      block.material.emissive.setRGB(frost * 0.3, frost * 0.5, frost);
      block.material.needsUpdate = true;
    }
  }
}

// ── Ice-lava neutralization ──────────────────────────────────────────────────

function _checkIceLavaNeutralize(iceBlock) {
  var gp = iceBlock.userData.gridPos;
  if (!gp) return;

  var offsets = [
    { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
  ];

  var neutralized = false;

  for (var i = _furnaceLava.length - 1; i >= 0; i--) {
    var lavaEntry = _furnaceLava[i];
    var lavaBlock = lavaEntry.block;
    if (!lavaBlock.parent || !lavaBlock.userData.gridPos) continue;

    var lp = lavaBlock.userData.gridPos;
    for (var o = 0; o < offsets.length; o++) {
      if (lp.x === gp.x + offsets[o].x &&
          Math.abs(lp.y - (gp.y + offsets[o].y)) < 0.1 &&
          lp.z === gp.z + offsets[o].z) {
        // Neutralize this lava pool
        if (typeof unregisterHazardBlock === 'function') unregisterHazardBlock(lavaBlock);
        if (typeof unregisterBlock === 'function') unregisterBlock(lavaBlock);
        if (typeof worldGroup !== 'undefined') worldGroup.remove(lavaBlock);
        _furnaceLava.splice(i, 1);
        neutralized = true;

        // Spawn steam/dust particles at neutralization point
        if (typeof spawnDustParticles === 'function') {
          spawnDustParticles(lavaBlock, { breakBurst: true });
        }
        break;
      }
    }
  }

  if (neutralized) {
    // Also remove the ice block
    if (typeof unregisterHazardBlock === 'function') unregisterHazardBlock(iceBlock);
    if (typeof unregisterBlock === 'function') unregisterBlock(iceBlock);
    if (typeof worldGroup !== 'undefined') worldGroup.remove(iceBlock);

    // Remove from tracking
    for (var j = _furnaceIce.length - 1; j >= 0; j--) {
      if (_furnaceIce[j].block === iceBlock) {
        _furnaceIce.splice(j, 1);
        break;
      }
    }

    // Bonus damage for neutralizing lava
    if (typeof dealBossMineDamage === 'function') {
      dealBossMineDamage(2);
    }
  }
}

/**
 * Check if a block placed on a lava pool should be destroyed.
 * Called when a piece lands — checks each block position for lava.
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {boolean} true if the position contains active lava (block should be destroyed)
 */
function isFurnaceLavaAt(x, y, z) {
  for (var i = 0; i < _furnaceLava.length; i++) {
    var entry = _furnaceLava[i];
    var block = entry.block;
    if (!block.parent || !block.userData.gridPos) continue;

    var gp = block.userData.gridPos;
    if (Math.abs(gp.x - x) < 0.1 &&
        Math.abs(gp.y - y) < 0.1 &&
        Math.abs(gp.z - z) < 0.1) {
      return true;
    }
  }
  return false;
}

// ── Block placement helpers ──────────────────────────────────────────────────

function _placeFurnaceMagma(x, y, z) {
  var block = createBlockMesh(FURNACE_COLOR_MAGMA);
  block.position.set(x, y, z);
  block.name = 'landed_block';
  block.userData.materialType = 'furnace_magma';
  block.userData.bossSpawned = true;
  if (typeof worldGroup !== 'undefined') worldGroup.add(block);
  if (typeof registerBlock === 'function') registerBlock(block);

  var solidifySecs = 4;  // magma solidifies after 4 seconds
  _furnaceMagma.push({
    block: block,
    solidifyTimer: solidifySecs,
    solidifyMax: solidifySecs,
  });
}

function _placeFurnaceLava(x, y, z) {
  var block = createBlockMesh(FURNACE_COLOR_LAVA_POOL);
  block.position.set(x, y, z);
  block.name = 'landed_block';
  block.userData.materialType = 'furnace_lava';
  block.userData.bossSpawned = true;
  block.userData.isLavaDanger = true;
  if (typeof worldGroup !== 'undefined') worldGroup.add(block);
  if (typeof registerBlock === 'function') registerBlock(block);

  _furnaceLava.push({
    block: block,
    dangerTimer: 2.0,  // 2s danger zone
  });
}

// ── Board helpers ────────────────────────────────────────────────────────────

function _getBottomRowCells() {
  var cells = [];
  var width = (typeof DEPTHS_BOARD_WIDTH !== 'undefined') ? DEPTHS_BOARD_WIDTH : 8;
  var halfW = width / 2;

  // Bottom rows (y = 0.5 to 2.5) for magma to rise from
  for (var y = 0.5; y <= 2.5; y += 1) {
    for (var x = -halfW + 0.5; x < halfW + 0.5; x += 1) {
      if (_isFurnaceCellEmpty(x, y, 0)) {
        cells.push({ x: x, y: y, z: 0 });
      }
    }
  }

  return cells;
}

function _isFurnaceCellEmpty(x, y, z) {
  if (typeof gridOccupancy === 'undefined') return false;
  var layer = gridOccupancy.get(y);
  if (!layer) return true;
  return !layer.has(x + ',' + z);
}

function _isFurnaceActive() {
  if (typeof getBossState !== 'function') return false;
  if (typeof getActiveBossDef !== 'function') return false;
  var state = getBossState();
  if (state !== 'active') return false;
  var def = getActiveBossDef();
  return def && def.id === 'the_furnace';
}

function _getFurnaceLavaCount() {
  if (typeof getBossPhaseIndex !== 'function') return 2;
  var phaseIdx = getBossPhaseIndex();
  // Phase 1: 2 lava cells, Phase 2: 3 lava cells
  return phaseIdx >= 1 ? 3 : 2;
}
