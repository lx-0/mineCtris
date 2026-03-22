// Hazard block mechanics for Depths mode — Crumble, Magma, and Void.
// Requires: config.js, state.js, world.js (unregisterBlock), mining.js (spawnDustParticles)

// ── Active hazard block tracking ──────────────────────────────────────────────
// Each entry: { block, timer }
const _crumbleBlocks = [];  // blocks that decay after CRUMBLE_DECAY_SECS
const _magmaBlocks   = [];  // blocks that damage neighbors every MAGMA_DAMAGE_INTERVAL

/**
 * Register a landed block as a hazard if applicable.
 * Called from registerBlock() in world.js after a block is placed.
 */
function registerHazardBlock(block) {
  if (!block || !block.userData) return;
  var mat = block.userData.materialType;
  if (mat === 'crumble') {
    block.userData.isHazard = true;
    block.userData.hazardType = 'crumble';
    _crumbleBlocks.push({ block: block, timer: CRUMBLE_DECAY_SECS });
    if (typeof depthsTutorialNotify === 'function') depthsTutorialNotify('hazardBlockLanded');
  } else if (mat === 'magma') {
    block.userData.isHazard = true;
    block.userData.hazardType = 'magma';
    _magmaBlocks.push({ block: block, timer: MAGMA_DAMAGE_INTERVAL });
    if (typeof depthsTutorialNotify === 'function') depthsTutorialNotify('hazardBlockLanded');
  } else if (mat === 'void_block') {
    block.userData.isHazard = true;
    block.userData.hazardType = 'void';
    block.userData.isVoid = true;
  } else if (mat === 'soft_moss') {
    block.userData.isHazard = true;
    block.userData.hazardType = 'soft_moss';
  } else if (mat === 'hardened_moss') {
    block.userData.isHazard = true;
    block.userData.hazardType = 'hardened_moss';
    block.userData.isVoid = true;  // permanent obstacle, unmineable
  } else if (mat === 'vine') {
    block.userData.isHazard = true;
    block.userData.hazardType = 'vine';
  } else if (mat === 'furnace_magma') {
    block.userData.isHazard = true;
    block.userData.hazardType = 'furnace_magma';
  } else if (mat === 'furnace_obsidian') {
    block.userData.isHazard = true;
    block.userData.hazardType = 'furnace_obsidian';
  } else if (mat === 'furnace_lava') {
    block.userData.isHazard = true;
    block.userData.hazardType = 'furnace_lava';
    block.userData.isLavaDanger = true;
  } else if (mat === 'furnace_ice') {
    block.userData.isHazard = true;
    block.userData.hazardType = 'furnace_ice';
  } else if (mat === 'wither_void') {
    block.userData.isHazard = true;
    block.userData.hazardType = 'wither_void';
    block.userData.isVoid = true;
  } else if (mat === 'wither_wall') {
    block.userData.isHazard = true;
    block.userData.hazardType = 'wither_wall';
    block.userData.isVoid = true;
  }
}

/**
 * Unregister a hazard block (called when block is removed by line-clear or mining).
 */
function unregisterHazardBlock(block) {
  if (!block || !block.userData || !block.userData.isHazard) return;
  var type = block.userData.hazardType;
  if (type === 'crumble') {
    for (var i = _crumbleBlocks.length - 1; i >= 0; i--) {
      if (_crumbleBlocks[i].block === block) { _crumbleBlocks.splice(i, 1); break; }
    }
  } else if (type === 'magma') {
    for (var j = _magmaBlocks.length - 1; j >= 0; j--) {
      if (_magmaBlocks[j].block === block) { _magmaBlocks.splice(j, 1); break; }
    }
  }
}

/**
 * Clear all tracked hazard blocks (called on game reset).
 */
function clearHazardBlocks() {
  _crumbleBlocks.length = 0;
  _magmaBlocks.length = 0;
  if (typeof cleanupCreepBlocks === 'function') cleanupCreepBlocks();
  if (typeof cleanupFurnaceBlocks === 'function') cleanupFurnaceBlocks();
  if (typeof cleanupWitherBlocks === 'function') cleanupWitherBlocks();
}

// ── Per-frame update ──────────────────────────────────────────────────────────

/**
 * Tick hazard block timers. Called from the main animate() loop.
 * @param {number} delta  Frame delta in seconds
 */
function updateHazardBlocks(delta) {
  if (!isDepthsMode) return;

  _updateCrumbleBlocks(delta);
  _updateMagmaBlocks(delta);
  // Tick The Creep moss/vine mechanics (hardening timers, vine visuals)
  if (typeof updateCreepBlocks === 'function') updateCreepBlocks(delta);
  // Tick The Furnace magma/obsidian/lava/ice mechanics
  if (typeof updateFurnaceBlocks === 'function') updateFurnaceBlocks(delta);
  // Tick The Wither Storm void/inversion mechanics
  if (typeof updateWitherBlocks === 'function') updateWitherBlocks(delta);
}

// ── Crumble ──────────────────────────────────────────────────────────────────

function _updateCrumbleBlocks(delta) {
  for (var i = _crumbleBlocks.length - 1; i >= 0; i--) {
    var entry = _crumbleBlocks[i];
    var block = entry.block;
    entry.timer -= delta;

    // Visual decay: increase transparency as timer counts down
    var progress = 1 - (entry.timer / CRUMBLE_DECAY_SECS);
    if (block.material) {
      // Pulse opacity and darken as block crumbles
      var pulse = Math.sin(progress * Math.PI * 4) * 0.08;
      block.material.opacity = Math.max(0.3, 1 - progress * 0.7 + pulse);
      block.material.transparent = true;
      // Subtle shake in the last second
      if (entry.timer < 1.0 && block.userData.gridPos) {
        var shake = Math.sin(performance.now() * 0.03) * 0.02;
        block.position.x = block.userData.gridPos.x + shake;
        block.position.z = block.userData.gridPos.z + shake;
      }
    }

    if (entry.timer <= 0) {
      // Crumble away: spawn dust particles and remove
      if (typeof spawnDustParticles === 'function') {
        spawnDustParticles(block, { breakBurst: true });
      }
      if (typeof unregisterBlock === 'function') unregisterBlock(block);
      if (typeof worldGroup !== 'undefined') worldGroup.remove(block);
      _crumbleBlocks.splice(i, 1);
    }
  }
}

// ── Magma ────────────────────────────────────────────────────────────────────

function _updateMagmaBlocks(delta) {
  for (var i = _magmaBlocks.length - 1; i >= 0; i--) {
    var entry = _magmaBlocks[i];
    var block = entry.block;

    // Check if this magma block was already removed (line-clear, etc.)
    if (!block.parent || !block.userData.gridPos) {
      _magmaBlocks.splice(i, 1);
      continue;
    }

    entry.timer -= delta;

    // Emissive pulse effect
    if (block.material) {
      var pulse = 0.3 + Math.sin(performance.now() * 0.004) * 0.15;
      block.material.emissive.setRGB(pulse, pulse * 0.3, 0);
      block.material.needsUpdate = true;
    }

    if (entry.timer <= 0) {
      entry.timer = MAGMA_DAMAGE_INTERVAL;
      _magmaDamageAdjacent(block);
    }
  }
}

/**
 * Destroy one random adjacent non-hazard block.
 */
function _magmaDamageAdjacent(magmaBlock) {
  var gp = magmaBlock.userData.gridPos;
  if (!gp) return;

  // Check 6 cardinal neighbors (±x, ±y, ±z)
  var offsets = [
    { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
  ];

  var candidates = [];
  if (typeof worldGroup === 'undefined') return;

  for (var c = 0; c < worldGroup.children.length; c++) {
    var obj = worldGroup.children[c];
    if (obj.name !== 'landed_block' || !obj.userData.gridPos) continue;
    if (obj.userData.isHazard) continue; // don't damage other hazard blocks

    var op = obj.userData.gridPos;
    for (var o = 0; o < offsets.length; o++) {
      if (op.x === gp.x + offsets[o].x &&
          Math.abs(op.y - (gp.y + offsets[o].y)) < 0.1 &&
          op.z === gp.z + offsets[o].z) {
        candidates.push(obj);
        break;
      }
    }
  }

  if (candidates.length === 0) return;

  // Pick one random adjacent block to destroy
  var victim = candidates[Math.floor(Math.random() * candidates.length)];

  // Spawn fire particles
  if (typeof spawnDustParticles === 'function') {
    spawnDustParticles(victim, { breakBurst: true });
  }

  // Score for the destroyed block
  var mName = victim.userData.materialType;
  if (mName && typeof BLOCK_TYPES !== 'undefined' && BLOCK_TYPES[mName]) {
    if (typeof addScore === 'function') addScore(BLOCK_TYPES[mName].points);
  }

  if (typeof unregisterBlock === 'function') unregisterBlock(victim);
  if (typeof worldGroup !== 'undefined') worldGroup.remove(victim);
}

// ── Void helpers ──────────────────────────────────────────────────────────────

/**
 * Returns true if the given block is a Void hazard (cannot be mined).
 */
function isVoidBlock(block) {
  return block && block.userData && block.userData.isVoid === true;
}
