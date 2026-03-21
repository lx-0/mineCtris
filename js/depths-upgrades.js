// Upgrade pool system for The Depths roguelike mode.
// Manages upgrade definitions, rarity-weighted draws, selection persistence,
// and effect application across floor transitions.
//
// Requires: state.js, depths-floor-gen.js, config.js
// Used by: depths-floor-gen.js (floor transitions), main.js (depths launch)

// ── Rarity tiers ────────────────────────────────────────────────────────────

var DEPTHS_RARITY = {
  COMMON: 'common',
  RARE:   'rare',
  EPIC:   'epic',
};

// Base weights per rarity. Deeper floors shift toward rarer upgrades.
// Index = floor number (1-based). Index 0 unused.
var _DEPTHS_RARITY_WEIGHTS = [
  null,
  { common: 70, rare: 25, epic: 5  },  // floor 1→2 transition
  { common: 60, rare: 30, epic: 10 },  // floor 2→3
  { common: 50, rare: 35, epic: 15 },  // floor 3→4
  { common: 35, rare: 40, epic: 25 },  // floor 4→5
  { common: 20, rare: 40, epic: 40 },  // floor 5→6
  { common: 10, rare: 35, epic: 55 },  // floor 6→7
];

// ── Upgrade categories ──────────────────────────────────────────────────────

var DEPTHS_CATEGORY = {
  TOOL:        'tool',
  POWERUP:     'powerup',
  CRAFTING:    'crafting',
  STAT:        'stat',
  RISK_REWARD: 'risk_reward',
};

// ── Upgrade definitions ─────────────────────────────────────────────────────
// Each upgrade has:
//   id:          unique string key
//   name:        display name
//   description: short player-facing description
//   category:    one of DEPTHS_CATEGORY
//   rarity:      one of DEPTHS_RARITY
//   stackable:   boolean — can the player pick this again on a later floor?
//   conflicts:   string[] — upgrade ids that cannot coexist with this one
//   apply:       function(runState) — mutates the run's active upgrade state

var DEPTHS_UPGRADE_DEFS = [
  // ── Tools ───────────────────────────────────────────────────────────────
  {
    id: 'tool_stone_pickaxe',
    name: 'Stone Pickaxe',
    description: 'Start each floor with a Stone Pickaxe (max 2 hits per block).',
    category: DEPTHS_CATEGORY.TOOL,
    rarity: DEPTHS_RARITY.COMMON,
    stackable: false,
    conflicts: ['tool_iron_pickaxe', 'tool_diamond_pickaxe'],
    apply: function (st) { if (_depthsToolRank(st.pickaxe) < 1) st.pickaxe = 'stone'; },
  },
  {
    id: 'tool_iron_pickaxe',
    name: 'Iron Pickaxe',
    description: 'Start each floor with an Iron Pickaxe (1-hit mining).',
    category: DEPTHS_CATEGORY.TOOL,
    rarity: DEPTHS_RARITY.RARE,
    stackable: false,
    conflicts: ['tool_stone_pickaxe', 'tool_diamond_pickaxe'],
    apply: function (st) { if (_depthsToolRank(st.pickaxe) < 2) st.pickaxe = 'iron'; },
  },
  {
    id: 'tool_diamond_pickaxe',
    name: 'Diamond Pickaxe',
    description: 'Start each floor with a Diamond Pickaxe (1-hit + AOE cross).',
    category: DEPTHS_CATEGORY.TOOL,
    rarity: DEPTHS_RARITY.EPIC,
    stackable: false,
    conflicts: ['tool_stone_pickaxe', 'tool_iron_pickaxe'],
    apply: function (st) { st.pickaxe = 'diamond'; },
  },

  // ── Power-ups ───────────────────────────────────────────────────────────
  {
    id: 'powerup_row_bomb',
    name: 'Row Bomb Kit',
    description: 'Begin each floor with 1 Row Bomb equipped.',
    category: DEPTHS_CATEGORY.POWERUP,
    rarity: DEPTHS_RARITY.COMMON,
    stackable: true,
    conflicts: [],
    apply: function (st) { st.rowBombs = (st.rowBombs || 0) + 1; },
  },
  {
    id: 'powerup_time_freeze',
    name: 'Chrono Shard',
    description: 'Begin each floor with 1 Time Freeze equipped.',
    category: DEPTHS_CATEGORY.POWERUP,
    rarity: DEPTHS_RARITY.RARE,
    stackable: true,
    conflicts: [],
    apply: function (st) { st.timeFreezes = (st.timeFreezes || 0) + 1; },
  },
  {
    id: 'powerup_shield',
    name: 'Guardian Amulet',
    description: 'Begin each floor with Shield active (absorb one death).',
    category: DEPTHS_CATEGORY.POWERUP,
    rarity: DEPTHS_RARITY.EPIC,
    stackable: false,
    conflicts: ['risk_no_shield'],
    apply: function (st) { st.shield = true; },
  },

  // ── Crafting ────────────────────────────────────────────────────────────
  {
    id: 'crafting_auto_bench',
    name: 'Portable Workbench',
    description: 'Start each floor with a Crafting Bench already built.',
    category: DEPTHS_CATEGORY.CRAFTING,
    rarity: DEPTHS_RARITY.COMMON,
    stackable: false,
    conflicts: [],
    apply: function (st) { st.autoBench = true; },
  },
  {
    id: 'crafting_reduced_cost',
    name: 'Efficient Crafting',
    description: 'All crafting recipes cost 1 fewer of each ingredient (min 1).',
    category: DEPTHS_CATEGORY.CRAFTING,
    rarity: DEPTHS_RARITY.RARE,
    stackable: false,
    conflicts: [],
    apply: function (st) { st.reducedCost = true; },
  },
  {
    id: 'crafting_double_yield',
    name: 'Master Crafter',
    description: 'Crafting consumables and power-ups yields double quantity.',
    category: DEPTHS_CATEGORY.CRAFTING,
    rarity: DEPTHS_RARITY.EPIC,
    stackable: false,
    conflicts: [],
    apply: function (st) { st.doubleYield = true; },
  },

  // ── Stats ───────────────────────────────────────────────────────────────
  {
    id: 'stat_mining_speed',
    name: 'Miner\'s Focus',
    description: '+20% mining speed (reduces time between hits).',
    category: DEPTHS_CATEGORY.STAT,
    rarity: DEPTHS_RARITY.COMMON,
    stackable: true,
    conflicts: [],
    apply: function (st) { st.miningSpeedBonus = (st.miningSpeedBonus || 0) + 0.2; },
  },
  {
    id: 'stat_inventory_bonus',
    name: 'Deep Pockets',
    description: '+1 block collected per mine action.',
    category: DEPTHS_CATEGORY.STAT,
    rarity: DEPTHS_RARITY.COMMON,
    stackable: true,
    conflicts: [],
    apply: function (st) { st.inventoryBonus = (st.inventoryBonus || 0) + 1; },
  },
  {
    id: 'stat_slow_fall',
    name: 'Featherfall',
    description: 'Pieces fall 15% slower.',
    category: DEPTHS_CATEGORY.STAT,
    rarity: DEPTHS_RARITY.RARE,
    stackable: true,
    conflicts: ['risk_fast_fall'],
    apply: function (st) { st.fallSpeedReduction = (st.fallSpeedReduction || 0) + 0.15; },
  },
  {
    id: 'stat_extra_time',
    name: 'Temporal Expansion',
    description: '+15 seconds added to each floor\'s time limit.',
    category: DEPTHS_CATEGORY.STAT,
    rarity: DEPTHS_RARITY.RARE,
    stackable: true,
    conflicts: [],
    apply: function (st) { st.bonusTimeSecs = (st.bonusTimeSecs || 0) + 15; },
  },
  {
    id: 'stat_combo_boost',
    name: 'Chain Reaction',
    description: 'Combo multiplier builds 50% faster.',
    category: DEPTHS_CATEGORY.STAT,
    rarity: DEPTHS_RARITY.EPIC,
    stackable: false,
    conflicts: [],
    apply: function (st) { st.comboBoost = true; },
  },

  // ── Risk/Reward ─────────────────────────────────────────────────────────
  {
    id: 'risk_fast_fall',
    name: 'Adrenaline Rush',
    description: '2x score multiplier — but pieces fall 25% faster.',
    category: DEPTHS_CATEGORY.RISK_REWARD,
    rarity: DEPTHS_RARITY.RARE,
    stackable: false,
    conflicts: ['stat_slow_fall'],
    apply: function (st) {
      st.scoreMultiplier = (st.scoreMultiplier || 1) * 2;
      st.fallSpeedIncrease = (st.fallSpeedIncrease || 0) + 0.25;
    },
  },
  {
    id: 'risk_no_shield',
    name: 'Glass Cannon',
    description: '1.5x score multiplier + bonus XP — but Shield is disabled.',
    category: DEPTHS_CATEGORY.RISK_REWARD,
    rarity: DEPTHS_RARITY.RARE,
    stackable: false,
    conflicts: ['powerup_shield'],
    apply: function (st) {
      st.scoreMultiplier = (st.scoreMultiplier || 1) * 1.5;
      st.xpMultiplier = (st.xpMultiplier || 1) * 1.5;
      st.noShield = true;
      st.shield = false;
    },
  },
  {
    id: 'risk_fragile_miner',
    name: 'Fragile Miner',
    description: '3x mining speed — but block stack height limit drops by 2 rows.',
    category: DEPTHS_CATEGORY.RISK_REWARD,
    rarity: DEPTHS_RARITY.EPIC,
    stackable: false,
    conflicts: [],
    apply: function (st) {
      st.miningSpeedBonus = (st.miningSpeedBonus || 0) + 2.0;
      st.heightPenalty = (st.heightPenalty || 0) + 2;
    },
  },
];

// ── Helper: tool tier ranking ───────────────────────────────────────────────

function _depthsToolRank(tier) {
  if (tier === 'diamond')  return 3;
  if (tier === 'iron')     return 2;
  if (tier === 'stone')    return 1;
  return 0;
}

// ── Run-level upgrade state ─────────────────────────────────────────────────
// Persists across floors within a single Depths run.

var _depthsUpgradeState = null;  // { chosenIds: [], ... computed effect fields }

/**
 * Initialize upgrade state for a new Depths run.
 */
function initDepthsUpgrades() {
  _depthsUpgradeState = {
    chosenIds: [],          // upgrade ids the player has selected so far
    // Effect fields (accumulated by upgrade apply() functions)
    pickaxe: 'none',
    rowBombs: 0,
    timeFreezes: 0,
    shield: false,
    autoBench: false,
    reducedCost: false,
    doubleYield: false,
    miningSpeedBonus: 0,    // additive: 0.2 = 20% faster
    inventoryBonus: 0,      // +N blocks per mine
    fallSpeedReduction: 0,  // 0.15 = 15% slower
    fallSpeedIncrease: 0,   // 0.25 = 25% faster (risk/reward)
    bonusTimeSecs: 0,       // extra seconds per floor
    comboBoost: false,
    scoreMultiplier: 1,
    xpMultiplier: 1,
    noShield: false,
    heightPenalty: 0,
  };
}

/**
 * Get the current depths upgrade state (for reading in other modules).
 */
function getDepthsUpgradeState() {
  return _depthsUpgradeState;
}

/**
 * Clear upgrade state (called on run end / lobby return).
 */
function clearDepthsUpgrades() {
  _depthsUpgradeState = null;
}

// ── Upgrade pool draw ───────────────────────────────────────────────────────

/**
 * Draw 3 unique upgrade choices for a floor transition.
 *
 * @param {number} fromFloor  The floor just completed (1–6). Used for rarity weighting.
 * @returns {object[]}  Array of 3 upgrade definition objects.
 */
function drawDepthsUpgrades(fromFloor) {
  if (!_depthsUpgradeState) initDepthsUpgrades();

  var weights = _DEPTHS_RARITY_WEIGHTS[fromFloor] || _DEPTHS_RARITY_WEIGHTS[1];
  var chosen = _depthsUpgradeState.chosenIds;

  // Build the eligible pool: exclude non-stackable already-chosen, and conflicting
  var pool = [];
  for (var i = 0; i < DEPTHS_UPGRADE_DEFS.length; i++) {
    var u = DEPTHS_UPGRADE_DEFS[i];
    // Skip non-stackable upgrades already chosen
    if (!u.stackable && chosen.indexOf(u.id) >= 0) continue;
    // Skip if conflicts with any chosen upgrade
    var blocked = false;
    for (var c = 0; c < u.conflicts.length; c++) {
      if (chosen.indexOf(u.conflicts[c]) >= 0) { blocked = true; break; }
    }
    if (blocked) continue;
    pool.push(u);
  }

  // If pool has fewer than 3, just return what we have
  if (pool.length <= 3) return pool.slice();

  // Weighted draw without replacement
  var result = [];
  var used = [];
  for (var pick = 0; pick < 3; pick++) {
    // Build weighted candidates from pool (excluding already picked this draw)
    var candidates = [];
    var totalWeight = 0;
    for (var j = 0; j < pool.length; j++) {
      if (used.indexOf(j) >= 0) continue;
      var w = weights[pool[j].rarity] || weights.common;
      candidates.push({ idx: j, weight: w });
      totalWeight += w;
    }
    if (candidates.length === 0) break;

    var r = _depthsRng() * totalWeight;
    var picked = candidates[candidates.length - 1].idx;
    for (var k = 0; k < candidates.length; k++) {
      r -= candidates[k].weight;
      if (r <= 0) { picked = candidates[k].idx; break; }
    }
    result.push(pool[picked]);
    used.push(picked);
  }

  return result;
}

/**
 * Player selects an upgrade. Applies it to the run state.
 *
 * @param {string} upgradeId  The id of the chosen upgrade.
 * @returns {boolean}  true if applied successfully.
 */
function selectDepthsUpgrade(upgradeId) {
  if (!_depthsUpgradeState) return false;

  var def = null;
  for (var i = 0; i < DEPTHS_UPGRADE_DEFS.length; i++) {
    if (DEPTHS_UPGRADE_DEFS[i].id === upgradeId) { def = DEPTHS_UPGRADE_DEFS[i]; break; }
  }
  if (!def) return false;

  _depthsUpgradeState.chosenIds.push(upgradeId);
  def.apply(_depthsUpgradeState);

  // Check depths upgrade-related achievements
  if (typeof achOnDepthsUpgradeSelected === 'function') achOnDepthsUpgradeSelected();

  return true;
}

// ── Effect application ──────────────────────────────────────────────────────
// Called at the start of each floor (after soft reset) to apply persistent
// upgrade effects to the live game state.

/**
 * Apply all accumulated upgrade effects to the active game state.
 * Call after resetGame() and before gameplay starts on each floor.
 */
function applyDepthsUpgradeEffects() {
  var st = _depthsUpgradeState;
  if (!st) return;

  // Tool tier
  if (st.pickaxe !== 'none') {
    pickaxeTier = st.pickaxe;
  }

  // Power-ups: grant at floor start
  if (st.rowBombs > 0) {
    powerUps.row_bomb = (powerUps.row_bomb || 0) + st.rowBombs;
  }
  if (st.timeFreezes > 0) {
    powerUps.time_freeze = (powerUps.time_freeze || 0) + st.timeFreezes;
  }
  if (st.shield && !st.noShield) {
    shieldActive = true;
  }

  // Crafting bench
  if (st.autoBench) {
    hasCraftingBench = true;
  }

  // Stats are read dynamically by the game systems:
  // - miningSpeedBonus: read by mining.js via getDepthsMiningSpeedMult()
  // - inventoryBonus: read by mining.js via getDepthsInventoryBonus()
  // - fallSpeedReduction/Increase: read by pieces.js via getDepthsFallSpeedMult()
  // - bonusTimeSecs: read by depths-floor-gen.js via getDepthsBonusTime()
  // - comboBoost: read by lineclear.js via isDepthsComboBoost()
  // - scoreMultiplier: read by gamestate.js via getDepthsScoreMultiplier()
  // - heightPenalty: read by gamestate.js via getDepthsHeightPenalty()
  // - reducedCost: read by crafting.js via isDepthsReducedCost()
  // - doubleYield: read by crafting.js via isDepthsDoubleYield()
}

// ── Query functions for other modules ───────────────────────────────────────
// These are called by game systems to check if an upgrade effect is active.

function getDepthsMiningSpeedMult() {
  if (!_depthsUpgradeState) return 1;
  return 1 + (_depthsUpgradeState.miningSpeedBonus || 0);
}

function getDepthsInventoryBonus() {
  if (!_depthsUpgradeState) return 0;
  return _depthsUpgradeState.inventoryBonus || 0;
}

function getDepthsFallSpeedMult() {
  if (!_depthsUpgradeState) return 1;
  var reduction = _depthsUpgradeState.fallSpeedReduction || 0;
  var increase = _depthsUpgradeState.fallSpeedIncrease || 0;
  return Math.max(0.1, 1 - reduction + increase);
}

function getDepthsBonusTime() {
  if (!_depthsUpgradeState) return 0;
  return _depthsUpgradeState.bonusTimeSecs || 0;
}

function isDepthsComboBoost() {
  return _depthsUpgradeState ? !!_depthsUpgradeState.comboBoost : false;
}

function getDepthsScoreMultiplier() {
  if (!_depthsUpgradeState) return 1;
  return _depthsUpgradeState.scoreMultiplier || 1;
}

function getDepthsHeightPenalty() {
  if (!_depthsUpgradeState) return 0;
  return _depthsUpgradeState.heightPenalty || 0;
}

function isDepthsReducedCost() {
  return _depthsUpgradeState ? !!_depthsUpgradeState.reducedCost : false;
}

function isDepthsDoubleYield() {
  return _depthsUpgradeState ? !!_depthsUpgradeState.doubleYield : false;
}

function getDepthsChosenUpgrades() {
  if (!_depthsUpgradeState) return [];
  return _depthsUpgradeState.chosenIds.slice();
}

/**
 * Get full upgrade definitions for a list of chosen ids (for results screen display).
 */
function getDepthsChosenUpgradeDefs() {
  if (!_depthsUpgradeState) return [];
  var result = [];
  var ids = _depthsUpgradeState.chosenIds;
  for (var i = 0; i < ids.length; i++) {
    for (var j = 0; j < DEPTHS_UPGRADE_DEFS.length; j++) {
      if (DEPTHS_UPGRADE_DEFS[j].id === ids[i]) {
        result.push(DEPTHS_UPGRADE_DEFS[j]);
        break;
      }
    }
  }
  return result;
}
