// The Wither Storm boss encounter — Abyssal tier chaos and corruption boss.
// Implements gravity inversion, void block clusters, board shrink, and corruption waves.
//
// Requires: depths-boss.js (boss state machine), depths-boss-config.js (mechanic types),
//           hazard-blocks.js (registerHazardBlock), world.js (registerBlock, unregisterBlock),
//           state.js (gridOccupancy, worldGroup), config.js (BLOCK_SIZE, HAZARD_COLOR_VOID)
// Used by:  depths-boss.js (_fireMechanic), hazard-blocks.js (updateWitherBlocks, cleanupWitherBlocks)

// ── Wither Storm state ─────────────────────────────────────────────────────────

var _witherGravityInverted = false;   // true while gravity is flipped
var _witherGravityTimer    = 0;       // countdown for current inversion duration
var _witherGravityInterval = 0;       // seconds between inversions (set by mechanic config)
var _witherGravityCooldown = 0;       // countdown until next inversion trigger
var _witherGravityDuration = 5;       // how long inversion lasts (seconds)

// Void block tracking: { block, spawnTime }
var _witherVoidBlocks = [];

// Board shrink state
var _witherShrinkLeft  = 0;  // columns removed from left
var _witherShrinkRight = 0;  // columns removed from right
var _witherShrinkNext  = 'left';  // which side shrinks next
var _witherWallBlocks  = []; // wall blocks placed to shrink the board

// Corruption wave tracking
var _witherCorruptedRows = []; // rows that have been corrupted

// Visual overlay element for gravity inversion tint
var _witherInversionOverlay = null;

// ── Gravity inversion ──────────────────────────────────────────────────────────

/**
 * Start the gravity inversion mechanic with given parameters.
 * Called when the gravity_inversion mechanic fires from the boss timer.
 *
 * @param {number} duration  How long inversion lasts (seconds)
 */
function triggerWitherGravityInversion(duration) {
  if (_witherGravityInverted) return; // already active

  _witherGravityInverted = true;
  _witherGravityTimer = duration || _witherGravityDuration;

  _showWitherInversionVisual(true);
}

/**
 * Returns true if gravity is currently inverted by the Wither Storm.
 * Used by the game engine to flip piece fall direction.
 */
function isWitherGravityInverted() {
  return _witherGravityInverted;
}

/**
 * Returns the gravity direction multiplier: 1.0 normal, -1.0 inverted.
 */
function getWitherGravityDirection() {
  return _witherGravityInverted ? -1.0 : 1.0;
}

// ── Void block clusters ────────────────────────────────────────────────────────

/**
 * Spawn void block clusters on the board.
 * Void blocks are unmovable and immune to mining — only destroyed by line-clears.
 *
 * @param {number} count  Number of void blocks to spawn
 */
function spawnWitherVoidBlocks(count) {
  if (typeof worldGroup === 'undefined' || !worldGroup) return;
  if (typeof gridOccupancy === 'undefined') return;
  if (typeof THREE === 'undefined') return;

  // Find empty cells that have support below (or are on bottom row)
  var emptyCells = _findWitherEmptyCells();
  if (emptyCells.length === 0) return;

  // Try to spawn in clusters — pick a seed cell and spawn neighbors
  var seedIdx = Math.floor(Math.random() * emptyCells.length);
  var seed = emptyCells[seedIdx];
  var spawned = 0;

  // Spawn at seed first
  var block = _createWitherVoidBlock(seed.x, seed.y, seed.z);
  if (block) {
    _witherVoidBlocks.push({ block: block, spawnTime: performance.now() });
    spawned++;
  }

  // Spawn remaining near the seed
  var offsets = [
    { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
    { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
  ];

  // Shuffle offsets for variety
  for (var s = offsets.length - 1; s > 0; s--) {
    var j = Math.floor(Math.random() * (s + 1));
    var tmp = offsets[s]; offsets[s] = offsets[j]; offsets[j] = tmp;
  }

  for (var i = 0; i < offsets.length && spawned < count; i++) {
    var nx = seed.x + offsets[i].x;
    var ny = seed.y + offsets[i].y;
    var nz = seed.z + offsets[i].z;

    // Bounds check
    if (ny < 0 || ny > 19) continue;

    // Check if cell is empty
    var key = nx + ',' + nz;
    var layer = gridOccupancy.get(ny);
    if (layer && layer.has(key)) continue;

    var vBlock = _createWitherVoidBlock(nx, ny, nz);
    if (vBlock) {
      _witherVoidBlocks.push({ block: vBlock, spawnTime: performance.now() });
      spawned++;
    }
  }

  // If cluster didn't fill, spawn remaining at random empty cells
  while (spawned < count && emptyCells.length > 0) {
    var rIdx = Math.floor(Math.random() * emptyCells.length);
    var cell = emptyCells.splice(rIdx, 1)[0];
    var rBlock = _createWitherVoidBlock(cell.x, cell.y, cell.z);
    if (rBlock) {
      _witherVoidBlocks.push({ block: rBlock, spawnTime: performance.now() });
      spawned++;
    }
  }
}

/**
 * Create a single void block at grid position.
 * @returns {THREE.Mesh|null} The created block, or null if failed
 */
function _createWitherVoidBlock(gx, gy, gz) {
  if (typeof THREE === 'undefined') return null;
  if (typeof BLOCK_SIZE === 'undefined') return null;

  var geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  var material = new THREE.MeshStandardMaterial({
    color: 0x1a0033,
    emissive: 0x2a0045,
    emissiveIntensity: 0.4,
    roughness: 0.8,
    metalness: 0.3,
    transparent: true,
    opacity: 0.9,
  });

  var block = new THREE.Mesh(geometry, material);
  block.position.set(gx * BLOCK_SIZE, gy * BLOCK_SIZE, gz * BLOCK_SIZE);
  block.name = 'landed_block';
  block.userData = {
    gridPos: { x: gx, y: gy, z: gz },
    materialType: 'wither_void',
    isHazard: true,
    hazardType: 'wither_void',
    isVoid: true,
    bossSpawned: true,
    unmineable: true,
  };

  worldGroup.add(block);

  if (typeof registerBlock === 'function') registerBlock(block);
  if (typeof registerHazardBlock === 'function') registerHazardBlock(block);

  return block;
}

/**
 * Find empty cells on the board suitable for void block spawning.
 * Returns array of { x, y, z } grid positions.
 */
function _findWitherEmptyCells() {
  var cells = [];
  // Scan the playfield — typically x: -4..5, z: -4..5 (10-wide), y: 0..19
  var halfW = 5; // default half-width
  var minX = -halfW + _witherShrinkLeft;
  var maxX = halfW - 1 - _witherShrinkRight;

  for (var y = 0; y < 15; y++) { // don't spawn too high — keep it playable
    var layer = gridOccupancy.get(y);
    for (var x = minX; x <= maxX; x++) {
      for (var z = -halfW; z <= halfW - 1; z++) {
        var key = x + ',' + z;
        if (layer && layer.has(key)) continue;

        // Must have support below or be on bottom row
        if (y === 0) {
          cells.push({ x: x, y: y, z: z });
        } else {
          var belowLayer = gridOccupancy.get(y - 1);
          if (belowLayer && belowLayer.has(key)) {
            cells.push({ x: x, y: y, z: z });
          }
        }
      }
    }
  }
  return cells;
}

// ── Board shrink ───────────────────────────────────────────────────────────────

/**
 * Shrink the board by removing one column from alternating sides.
 * Places permanent wall blocks in the removed column.
 */
function shrinkWitherBoard() {
  if (typeof worldGroup === 'undefined' || !worldGroup) return;
  if (typeof THREE === 'undefined') return;
  if (typeof BLOCK_SIZE === 'undefined') return;

  var halfW = 5;
  var col;

  if (_witherShrinkNext === 'left') {
    col = -halfW + _witherShrinkLeft;
    _witherShrinkLeft++;
    _witherShrinkNext = 'right';
  } else {
    col = halfW - 1 - _witherShrinkRight;
    _witherShrinkRight++;
    _witherShrinkNext = 'left';
  }

  // Don't shrink below 4 columns wide
  var currentWidth = 10 - _witherShrinkLeft - _witherShrinkRight;
  if (currentWidth < 4) {
    // Undo the shrink
    if (_witherShrinkNext === 'right') { _witherShrinkLeft--; _witherShrinkNext = 'left'; }
    else { _witherShrinkRight--; _witherShrinkNext = 'right'; }
    return;
  }

  // Remove any existing blocks in this column
  _removeWitherColumn(col);

  // Place wall blocks along the entire column height
  for (var y = 0; y < 20; y++) {
    for (var z = -halfW; z <= halfW - 1; z++) {
      var wallBlock = _createWitherWallBlock(col, y, z);
      if (wallBlock) {
        _witherWallBlocks.push(wallBlock);
      }
    }
  }
}

/**
 * Remove all blocks in a given column (x coordinate).
 */
function _removeWitherColumn(col) {
  if (typeof worldGroup === 'undefined') return;

  var toRemove = [];
  for (var i = worldGroup.children.length - 1; i >= 0; i--) {
    var obj = worldGroup.children[i];
    if (obj.name !== 'landed_block' || !obj.userData.gridPos) continue;
    if (obj.userData.gridPos.x === col) {
      toRemove.push(obj);
    }
  }

  for (var r = 0; r < toRemove.length; r++) {
    if (typeof unregisterBlock === 'function') unregisterBlock(toRemove[r]);
    worldGroup.remove(toRemove[r]);
  }
}

/**
 * Create a wall block for the board shrink effect.
 */
function _createWitherWallBlock(gx, gy, gz) {
  if (typeof THREE === 'undefined') return null;
  if (typeof BLOCK_SIZE === 'undefined') return null;

  var geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  var material = new THREE.MeshStandardMaterial({
    color: 0x0d001a,
    emissive: 0x1a0033,
    emissiveIntensity: 0.2,
    roughness: 1.0,
    metalness: 0.0,
  });

  var block = new THREE.Mesh(geometry, material);
  block.position.set(gx * BLOCK_SIZE, gy * BLOCK_SIZE, gz * BLOCK_SIZE);
  block.name = 'landed_block';
  block.userData = {
    gridPos: { x: gx, y: gy, z: gz },
    materialType: 'wither_wall',
    isHazard: true,
    hazardType: 'wither_wall',
    isVoid: true,
    bossSpawned: true,
    unmineable: true,
    isWall: true,
  };

  worldGroup.add(block);
  if (typeof registerBlock === 'function') registerBlock(block);

  return block;
}

// ── Corruption wave ────────────────────────────────────────────────────────────

/**
 * Corrupt a random row — convert all existing blocks in that row to void blocks.
 */
function witherCorruptionWave() {
  if (typeof worldGroup === 'undefined' || !worldGroup) return;

  // Find rows with blocks
  var rowsWithBlocks = [];
  for (var i = 0; i < worldGroup.children.length; i++) {
    var obj = worldGroup.children[i];
    if (obj.name !== 'landed_block' || !obj.userData.gridPos) continue;
    if (obj.userData.isVoid || obj.userData.isWall) continue; // skip already void/wall

    var gy = obj.userData.gridPos.y;
    if (rowsWithBlocks.indexOf(gy) === -1) {
      rowsWithBlocks.push(gy);
    }
  }

  if (rowsWithBlocks.length === 0) return;

  // Pick a random row
  var targetY = rowsWithBlocks[Math.floor(Math.random() * rowsWithBlocks.length)];

  // Convert all non-void blocks in this row to void
  var blocksInRow = [];
  for (var j = worldGroup.children.length - 1; j >= 0; j--) {
    var block = worldGroup.children[j];
    if (block.name !== 'landed_block' || !block.userData.gridPos) continue;
    if (block.userData.gridPos.y !== targetY) continue;
    if (block.userData.isVoid || block.userData.isWall) continue;

    blocksInRow.push(block);
  }

  for (var k = 0; k < blocksInRow.length; k++) {
    var b = blocksInRow[k];

    // Change material to void appearance
    if (b.material) {
      b.material.color.setHex(0x1a0033);
      b.material.emissive.setHex(0x2a0045);
      b.material.emissiveIntensity = 0.4;
      b.material.transparent = true;
      b.material.opacity = 0.9;
      b.material.needsUpdate = true;
    }

    // Mark as void
    b.userData.materialType = 'wither_void';
    b.userData.isHazard = true;
    b.userData.hazardType = 'wither_void';
    b.userData.isVoid = true;
    b.userData.bossSpawned = true;
    b.userData.unmineable = true;

    _witherVoidBlocks.push({ block: b, spawnTime: performance.now() });
  }

  _witherCorruptedRows.push(targetY);

  // Visual pulse effect for the corruption wave
  _showWitherCorruptionPulse(targetY);
}

// ── Per-frame update ───────────────────────────────────────────────────────────

/**
 * Tick Wither Storm mechanics each frame.
 * Called from updateHazardBlocks() in hazard-blocks.js.
 *
 * @param {number} delta  Frame delta in seconds
 */
function updateWitherBlocks(delta) {
  // Update gravity inversion timer
  if (_witherGravityInverted) {
    _witherGravityTimer -= delta;
    if (_witherGravityTimer <= 0) {
      _witherGravityInverted = false;
      _witherGravityTimer = 0;
      _showWitherInversionVisual(false);
    }
  }

  // Animate void blocks — swirling emissive pulse
  var now = performance.now();
  for (var i = _witherVoidBlocks.length - 1; i >= 0; i--) {
    var entry = _witherVoidBlocks[i];
    var block = entry.block;

    // Check if block was removed (line-clear)
    if (!block.parent || !block.userData.gridPos) {
      _witherVoidBlocks.splice(i, 1);
      continue;
    }

    // Swirling purple glow
    if (block.material) {
      var t = (now - entry.spawnTime) * 0.002;
      var pulse = 0.3 + Math.sin(t) * 0.15 + Math.sin(t * 1.7) * 0.05;
      block.material.emissive.setRGB(pulse * 0.4, 0, pulse);
      block.material.needsUpdate = true;
    }
  }

  // Update inversion overlay visual
  if (_witherGravityInverted && _witherInversionOverlay) {
    var remaining = _witherGravityTimer / _witherGravityDuration;
    _witherInversionOverlay.style.opacity = (0.08 + remaining * 0.07).toString();
  }
}

// ── Visual effects ─────────────────────────────────────────────────────────────

/**
 * Show/hide the gravity inversion screen tint.
 */
function _showWitherInversionVisual(active) {
  if (!_witherInversionOverlay) {
    _witherInversionOverlay = document.createElement('div');
    _witherInversionOverlay.id = 'wither-inversion-overlay';
    _witherInversionOverlay.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;' +
      'background:radial-gradient(ellipse at center, rgba(75,0,130,0.15) 0%, rgba(30,0,60,0.08) 70%);' +
      'pointer-events:none;z-index:900;transition:opacity 0.5s ease;';
    document.body.appendChild(_witherInversionOverlay);
  }

  if (active) {
    _witherInversionOverlay.style.display = 'block';
    _witherInversionOverlay.style.opacity = '0.15';
  } else {
    _witherInversionOverlay.style.opacity = '0';
    setTimeout(function () {
      if (_witherInversionOverlay && !_witherGravityInverted) {
        _witherInversionOverlay.style.display = 'none';
      }
    }, 500);
  }
}

/**
 * Show a corruption wave pulse effect on a row.
 */
function _showWitherCorruptionPulse(rowY) {
  var el = document.createElement('div');
  el.className = 'wither-corruption-pulse';
  el.style.cssText =
    'position:fixed;left:0;width:100%;height:4px;' +
    'background:linear-gradient(90deg, transparent, rgba(75,0,130,0.8), rgba(128,0,255,0.6), rgba(75,0,130,0.8), transparent);' +
    'pointer-events:none;z-index:901;' +
    'top:' + (30 + (19 - rowY) * 3) + '%;' +
    'animation:wither-pulse-fade 1s ease-out forwards;';
  document.body.appendChild(el);

  setTimeout(function () {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 1100);
}

// ── Cleanup ────────────────────────────────────────────────────────────────────

/**
 * Clean up all Wither Storm blocks and state.
 * Called on boss encounter cleanup.
 */
function cleanupWitherBlocks() {
  // Remove void blocks
  for (var i = _witherVoidBlocks.length - 1; i >= 0; i--) {
    var entry = _witherVoidBlocks[i];
    if (entry.block && entry.block.parent) {
      if (typeof unregisterBlock === 'function') unregisterBlock(entry.block);
      entry.block.parent.remove(entry.block);
    }
  }
  _witherVoidBlocks.length = 0;

  // Remove wall blocks
  for (var w = _witherWallBlocks.length - 1; w >= 0; w--) {
    var wallBlock = _witherWallBlocks[w];
    if (wallBlock && wallBlock.parent) {
      if (typeof unregisterBlock === 'function') unregisterBlock(wallBlock);
      wallBlock.parent.remove(wallBlock);
    }
  }
  _witherWallBlocks.length = 0;

  // Reset state
  _witherGravityInverted = false;
  _witherGravityTimer    = 0;
  _witherGravityInterval = 0;
  _witherGravityCooldown = 0;
  _witherShrinkLeft      = 0;
  _witherShrinkRight     = 0;
  _witherShrinkNext      = 'left';
  _witherCorruptedRows.length = 0;

  // Remove visual overlay
  if (_witherInversionOverlay) {
    _witherInversionOverlay.style.display = 'none';
  }
}

/**
 * Returns the current board width reduction from shrink mechanics.
 * Used by game engine to adjust effective board width.
 */
function getWitherBoardShrink() {
  return { left: _witherShrinkLeft, right: _witherShrinkRight };
}
