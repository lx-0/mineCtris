// Loot rarity system with depth-scaled drop rates for the Expeditions dungeon system.
//
// 5-tier rarity system (Common → Legendary) with drop rates that scale by
// dungeon tier (shallow/deep/abyssal) and floor depth within that tier.
// Boss kills guarantee Rare or better. First boss kill awards a unique cosmetic.
//
// Requires: depths-config.js (DUNGEON_TIERS, getDungeonDef),
//           depths-state.js (getDungeonSession, getDungeonFloorNum, isDungeonBossFloor),
//           depths-rewards.js (awardBonusXP, DEPTHS_DUPLICATE_BONUS_XP),
//           cosmetics.js (_loadUnlockedCosmetics, _saveUnlockedCosmetics)
// Used by:  depths-session.js (floor-clear loot rolls)

// ── Storage ──────────────────────────────────────────────────────────────────

var LOOT_INVENTORY_KEY = 'mineCtris_loot_inventory';
var LOOT_BOSS_FIRST_KILL_KEY = 'mineCtris_loot_boss_first_kills';

// ── Rarity Tiers ─────────────────────────────────────────────────────────────

var LOOT_RARITY = {
  common:    { id: 'common',    label: 'Common',    color: '#9ca3af', order: 0 },
  uncommon:  { id: 'uncommon',  label: 'Uncommon',  color: '#22c55e', order: 1 },
  rare:      { id: 'rare',      label: 'Rare',      color: '#3b82f6', order: 2 },
  epic:      { id: 'epic',      label: 'Epic',      color: '#a855f7', order: 3 },
  legendary: { id: 'legendary', label: 'Legendary', color: '#f97316', order: 4 },
};

// ── Drop Rate Tables ─────────────────────────────────────────────────────────
// Rates per dungeon tier. Values are percentages (must sum to 100).
// Floor depth interpolates between the tier's base rates and a slight boost
// toward rarer drops on deeper floors.

var LOOT_DROP_RATES = {
  shallow: { common: 60, uncommon: 25, rare: 10, epic: 4,  legendary: 1  },
  deep:    { common: 40, uncommon: 30, rare: 20, epic: 8,  legendary: 2  },
  abyssal: { common: 20, uncommon: 25, rare: 30, epic: 18, legendary: 7  },
};

// Boss-kill drop rates: guaranteed Rare or better (redistribute common/uncommon)
var LOOT_BOSS_DROP_RATES = {
  shallow: { common: 0, uncommon: 0, rare: 65, epic: 28, legendary: 7  },
  deep:    { common: 0, uncommon: 0, rare: 50, epic: 35, legendary: 15 },
  abyssal: { common: 0, uncommon: 0, rare: 35, epic: 40, legendary: 25 },
};

// ── Loot Catalog ─────────────────────────────────────────────────────────────
// Items organized by type: cosmetics (permanent unlocks), consumables (single-use),
// and fragments (collect N to forge a Legendary).

var LOOT_CATALOG = [
  // ── Cosmetics ──────────────────────────────────────────────────────────────
  // Block skins
  { id: 'loot_block_moss',       type: 'cosmetic', category: 'block_skin',   name: 'Moss Blocks',       rarity: 'common',    icon: '\uD83C\uDF3F', assets: { themeKey: 'moss' } },
  { id: 'loot_block_sandstone',  type: 'cosmetic', category: 'block_skin',   name: 'Sandstone Blocks',  rarity: 'common',    icon: '\uD83C\uDFDC\uFE0F', assets: { themeKey: 'sandstone' } },
  { id: 'loot_block_amethyst',   type: 'cosmetic', category: 'block_skin',   name: 'Amethyst Blocks',   rarity: 'uncommon',  icon: '\uD83D\uDD2E', assets: { themeKey: 'amethyst' } },
  { id: 'loot_block_deepslate',  type: 'cosmetic', category: 'block_skin',   name: 'Deepslate Blocks',  rarity: 'rare',      icon: '\u26AB', assets: { themeKey: 'deepslate' } },
  { id: 'loot_block_prismarine', type: 'cosmetic', category: 'block_skin',   name: 'Prismarine Blocks', rarity: 'epic',      icon: '\uD83D\uDC99', assets: { themeKey: 'prismarine' } },
  { id: 'loot_block_netherite',  type: 'cosmetic', category: 'block_skin',   name: 'Netherite Blocks',  rarity: 'legendary', icon: '\uD83D\uDFE4', assets: { themeKey: 'netherite' } },

  // Pickaxe skins
  { id: 'loot_pick_iron',        type: 'cosmetic', category: 'pickaxe_skin', name: 'Iron Pickaxe',      rarity: 'common',    icon: '\u26CF', assets: { meshKey: 'pickaxe_iron' } },
  { id: 'loot_pick_gold',        type: 'cosmetic', category: 'pickaxe_skin', name: 'Gold Pickaxe',      rarity: 'uncommon',  icon: '\u26CF', assets: { meshKey: 'pickaxe_gold' } },
  { id: 'loot_pick_diamond',     type: 'cosmetic', category: 'pickaxe_skin', name: 'Diamond Pickaxe',   rarity: 'rare',      icon: '\u26CF', assets: { meshKey: 'pickaxe_diamond' } },
  { id: 'loot_pick_emerald',     type: 'cosmetic', category: 'pickaxe_skin', name: 'Emerald Pickaxe',   rarity: 'epic',      icon: '\u26CF', assets: { meshKey: 'pickaxe_emerald' } },
  { id: 'loot_pick_void',        type: 'cosmetic', category: 'pickaxe_skin', name: 'Void Pickaxe',      rarity: 'legendary', icon: '\u26CF', assets: { meshKey: 'pickaxe_void' } },

  // Trails
  { id: 'loot_trail_dust',       type: 'cosmetic', category: 'trail',        name: 'Dust Trail',        rarity: 'common',    icon: '\uD83D\uDCA8', assets: { trailKey: 'dust' } },
  { id: 'loot_trail_sparkle',    type: 'cosmetic', category: 'trail',        name: 'Sparkle Trail',     rarity: 'uncommon',  icon: '\u2728',       assets: { trailKey: 'sparkle' } },
  { id: 'loot_trail_frost',      type: 'cosmetic', category: 'trail',        name: 'Frost Trail',       rarity: 'rare',      icon: '\u2744\uFE0F', assets: { trailKey: 'frost' } },
  { id: 'loot_trail_shadow',     type: 'cosmetic', category: 'trail',        name: 'Shadow Trail',      rarity: 'epic',      icon: '\uD83C\uDF11', assets: { trailKey: 'shadow' } },
  { id: 'loot_trail_cosmic',     type: 'cosmetic', category: 'trail',        name: 'Cosmic Trail',      rarity: 'legendary', icon: '\uD83C\uDF0C', assets: { trailKey: 'cosmic' } },

  // Borders
  { id: 'loot_border_stone',     type: 'cosmetic', category: 'border',       name: 'Stone Frame',       rarity: 'uncommon',  icon: '\uD83E\uDDF1', assets: { borderKey: 'stone_frame' } },
  { id: 'loot_border_gilded',    type: 'cosmetic', category: 'border',       name: 'Gilded Frame',      rarity: 'rare',      icon: '\uD83D\uDDBC\uFE0F', assets: { borderKey: 'gilded' } },
  { id: 'loot_border_infernal',  type: 'cosmetic', category: 'border',       name: 'Infernal Frame',    rarity: 'epic',      icon: '\uD83D\uDD25', assets: { borderKey: 'infernal', animated: true } },
  { id: 'loot_border_celestial', type: 'cosmetic', category: 'border',       name: 'Celestial Frame',   rarity: 'legendary', icon: '\uD83C\uDF1F', assets: { borderKey: 'celestial', animated: true } },

  // ── Consumables (single-use dungeon power-ups) ─────────────────────────────
  { id: 'loot_consumable_extra_life',   type: 'consumable', name: 'Extra Life',   rarity: 'rare',     icon: '\u2764\uFE0F', description: 'Revive once on death during a dungeon run.' },
  { id: 'loot_consumable_floor_skip',   type: 'consumable', name: 'Floor Skip',   rarity: 'epic',     icon: '\u23ED\uFE0F', description: 'Skip the current floor and proceed to the next.' },
  { id: 'loot_consumable_loot_magnet',  type: 'consumable', name: 'Loot Magnet',  rarity: 'uncommon', icon: '\uD83E\uDDF2', description: 'Double loot drops on the next floor.' },

  // ── Fragments (collect N to forge a Legendary) ─────────────────────────────
  { id: 'loot_fragment_void',     type: 'fragment', name: 'Void Fragment',     rarity: 'uncommon', icon: '\uD83D\uDD73\uFE0F', forgeTarget: 'loot_block_netherite', forgeCount: 10 },
  { id: 'loot_fragment_cosmic',   type: 'fragment', name: 'Cosmic Fragment',   rarity: 'uncommon', icon: '\u2B50',             forgeTarget: 'loot_trail_cosmic',    forgeCount: 10 },
  { id: 'loot_fragment_celestial', type: 'fragment', name: 'Celestial Fragment', rarity: 'rare',    icon: '\uD83C\uDF1F',       forgeTarget: 'loot_border_celestial', forgeCount: 8 },
];

// Boss-exclusive first-kill cosmetics (one-time per boss)
// Extended rewards are defined in depths-loot-config.js (DEPTHS_BOSS_FIRST_KILL_REWARDS).
// This table covers the base catalog bosses; the depths system adds the rest.
var LOOT_BOSS_FIRST_KILL_REWARDS = {
  the_creep:        { id: 'loot_boss_creep_trophy',       type: 'cosmetic', category: 'pickaxe_skin', name: 'Vine-Wrapped Pickaxe', rarity: 'rare',      icon: '\u26CF',       assets: { meshKey: 'pickaxe_creep' } },
  cave_crawler:     { id: 'loot_boss_cave_crawler_trophy', type: 'cosmetic', category: 'title',        name: 'Tunnel Rat',           rarity: 'rare',      icon: '\uD83D\uDC00', assets: { displayText: 'Tunnel Rat', nameColor: '#a3a3a3' } },
  the_furnace:      { id: 'loot_boss_furnace_trophy',      type: 'cosmetic', category: 'pickaxe_skin', name: 'Molten Pickaxe',       rarity: 'epic',      icon: '\u26CF',       assets: { meshKey: 'pickaxe_furnace' } },
  piece_storm:      { id: 'loot_boss_piece_storm_trophy',  type: 'cosmetic', category: 'title',        name: 'Storm Breaker',        rarity: 'epic',      icon: '\u26A1',       assets: { displayText: 'Storm Breaker', nameColor: '#fbbf24' } },
  the_wither_storm: { id: 'loot_boss_wither_storm_trophy', type: 'cosmetic', category: 'pickaxe_skin', name: 'Void Reaver',          rarity: 'legendary', icon: '\u26CF',       assets: { meshKey: 'pickaxe_wither' } },
  the_core:         { id: 'loot_boss_core_trophy',         type: 'cosmetic', category: 'title',        name: 'Core Conqueror',       rarity: 'legendary', icon: '\uD83C\uDF0B', assets: { displayText: 'Core Conqueror', nameColor: '#ef4444' } },
};

// ── Register loot cosmetics in the main cosmetic system ──────────────────────

(function _registerLootCosmetics() {
  if (typeof COSMETIC_REGISTRY === 'undefined') return;
  var allCosmetics = LOOT_CATALOG.filter(function (item) { return item.type === 'cosmetic'; });
  // Also add boss first-kill rewards
  var bossKeys = Object.keys(LOOT_BOSS_FIRST_KILL_REWARDS);
  for (var b = 0; b < bossKeys.length; b++) {
    allCosmetics.push(LOOT_BOSS_FIRST_KILL_REWARDS[bossKeys[b]]);
  }
  for (var i = 0; i < allCosmetics.length; i++) {
    var item = allCosmetics[i];
    var exists = false;
    for (var j = 0; j < COSMETIC_REGISTRY.length; j++) {
      if (COSMETIC_REGISTRY[j].id === item.id) { exists = true; break; }
    }
    if (!exists) {
      COSMETIC_REGISTRY.push({
        id:              item.id,
        category:        item.category,
        name:            item.name,
        rarity:          item.rarity,
        unlockCondition: { type: 'dungeon', value: item.id },
        assets:          item.assets || {},
      });
    }
  }
})();

// ── Loot pool by rarity ──────────────────────────────────────────────────────
// Build lookup tables so we can quickly pick items of a given rarity.

var _lootPoolByRarity = {};
(function _buildLootPools() {
  var rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  for (var r = 0; r < rarities.length; r++) {
    _lootPoolByRarity[rarities[r]] = [];
  }
  for (var i = 0; i < LOOT_CATALOG.length; i++) {
    var item = LOOT_CATALOG[i];
    if (_lootPoolByRarity[item.rarity]) {
      _lootPoolByRarity[item.rarity].push(item);
    }
  }
})();

// ── Drop rate calculation ────────────────────────────────────────────────────

/**
 * Get interpolated drop rates for a given dungeon tier and floor number.
 * Deeper floors within a tier shift rates slightly toward rarer drops.
 *
 * @param {string}  tier      Dungeon tier: 'shallow', 'deep', 'abyssal'
 * @param {number}  floorNum  Current floor number (1-based)
 * @param {boolean} isBoss    Whether this is a boss floor
 * @returns {object} { common, uncommon, rare, epic, legendary } percentages
 */
function getLootDropRates(tier, floorNum, isBoss) {
  var baseRates = isBoss
    ? (LOOT_BOSS_DROP_RATES[tier] || LOOT_BOSS_DROP_RATES.shallow)
    : (LOOT_DROP_RATES[tier] || LOOT_DROP_RATES.shallow);

  // Depth scaling: each floor beyond 1 shifts 2% from common → higher rarities
  var depthBonus = Math.max(0, (floorNum - 1)) * 2;
  if (depthBonus === 0 || isBoss) return _copyRates(baseRates);

  var rates = _copyRates(baseRates);
  // Take from common (can't go below 0)
  var taken = Math.min(rates.common, depthBonus);
  rates.common -= taken;
  // Distribute evenly to uncommon, rare, epic, legendary
  var perSlot = taken / 4;
  rates.uncommon  += perSlot;
  rates.rare      += perSlot;
  rates.epic      += perSlot;
  rates.legendary += perSlot;

  return rates;
}

function _copyRates(rates) {
  return {
    common:    rates.common,
    uncommon:  rates.uncommon,
    rare:      rates.rare,
    epic:      rates.epic,
    legendary: rates.legendary,
  };
}

// ── Roll rarity ──────────────────────────────────────────────────────────────

/**
 * Roll a rarity tier based on the given drop rates.
 * @param {object} rates  Drop rate percentages
 * @returns {string} Rarity id
 */
function _rollRarity(rates) {
  var roll = Math.random() * 100;
  var cumulative = 0;
  var rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  for (var i = 0; i < rarities.length; i++) {
    cumulative += rates[rarities[i]];
    if (roll < cumulative) return rarities[i];
  }
  return 'common'; // fallback
}

// ── Roll loot ────────────────────────────────────────────────────────────────

/**
 * Roll a single loot drop from the catalog.
 *
 * @param {string}  tier      Dungeon tier
 * @param {number}  floorNum  Current floor number
 * @param {boolean} isBoss    Whether this is a boss kill
 * @returns {object} { item: catalogEntry, rarity: string, isDuplicate: boolean, bonusXP: number }
 */
function rollLootDrop(tier, floorNum, isBoss) {
  var rates = getLootDropRates(tier, floorNum, isBoss);
  var rarity = _rollRarity(rates);

  // Pick a random item from the pool for this rarity
  var pool = _lootPoolByRarity[rarity];
  if (!pool || pool.length === 0) {
    // Fallback: try one tier lower
    var fallbackOrder = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
    for (var f = 0; f < fallbackOrder.length; f++) {
      pool = _lootPoolByRarity[fallbackOrder[f]];
      if (pool && pool.length > 0) { rarity = fallbackOrder[f]; break; }
    }
  }
  if (!pool || pool.length === 0) return null;

  var item = pool[Math.floor(Math.random() * pool.length)];

  // Check duplicate for cosmetics
  var isDuplicate = false;
  var bonusXP = 0;
  if (item.type === 'cosmetic') {
    isDuplicate = _isLootCosmeticOwned(item.id);
    if (isDuplicate) {
      // Award consolation XP based on rarity
      bonusXP = _getDuplicateXP(rarity);
      if (typeof awardBonusXP === 'function') awardBonusXP(bonusXP);
    }
  }

  return { item: item, rarity: rarity, isDuplicate: isDuplicate, bonusXP: bonusXP };
}

/**
 * Roll loot for a floor clear event.
 * Returns an array of loot drops (1-3 items based on floor depth).
 *
 * @param {string}  tier      Dungeon tier
 * @param {number}  floorNum  Current floor number
 * @param {boolean} isBoss    Whether boss was defeated on this floor
 * @returns {object[]} Array of { item, rarity, isDuplicate, bonusXP }
 */
function rollFloorLoot(tier, floorNum, isBoss) {
  var dropCount = Math.min(3, 1 + Math.floor(floorNum / 2));
  var drops = [];

  for (var i = 0; i < dropCount; i++) {
    var drop = rollLootDrop(tier, floorNum, isBoss && i === 0);
    if (drop) drops.push(drop);
  }

  return drops;
}

/**
 * Check and award the first-kill boss cosmetic if applicable.
 * Returns the reward object or null if already claimed.
 *
 * @param {string} bossId  Boss identifier (e.g. 'piece_storm', 'the_core')
 * @returns {object|null} Boss reward item or null
 */
function checkBossFirstKillReward(bossId) {
  if (!bossId) return null;
  var reward = LOOT_BOSS_FIRST_KILL_REWARDS[bossId];
  if (!reward) return null;

  // Check if already claimed
  var claimed = _loadBossFirstKills();
  if (claimed.indexOf(bossId) >= 0) return null;

  // Claim it
  claimed.push(bossId);
  _saveBossFirstKills(claimed);

  // Unlock the cosmetic
  _unlockLootCosmetic(reward.id);

  return reward;
}

// ── Duplicate XP consolation ─────────────────────────────────────────────────

var LOOT_DUPLICATE_XP = {
  common:    100,
  uncommon:  200,
  rare:      350,
  epic:      500,
  legendary: 1000,
};

function _getDuplicateXP(rarity) {
  return LOOT_DUPLICATE_XP[rarity] || 100;
}

// ── Cosmetic ownership check ─────────────────────────────────────────────────

function _isLootCosmeticOwned(cosmeticId) {
  if (typeof _loadUnlockedCosmetics !== 'function') return false;
  var unlocked = _loadUnlockedCosmetics();
  return unlocked.indexOf(cosmeticId) >= 0;
}

// ── Cosmetic unlock ──────────────────────────────────────────────────────────

function _unlockLootCosmetic(cosmeticId) {
  if (typeof _loadUnlockedCosmetics !== 'function' ||
      typeof _saveUnlockedCosmetics !== 'function') return;
  var unlocked = _loadUnlockedCosmetics();
  if (unlocked.indexOf(cosmeticId) < 0) {
    unlocked.push(cosmeticId);
    _saveUnlockedCosmetics(unlocked);
  }
}

// ── Loot persistence ─────────────────────────────────────────────────────────

/**
 * Save earned loot to the player's persistent inventory.
 * Cosmetics are stored as unlocked. Consumables increment counts.
 * Fragments track progress toward forging.
 *
 * @param {object[]} drops  Array of { item, rarity, isDuplicate }
 */
function saveLootDrops(drops) {
  if (!drops || drops.length === 0) return;
  var inv = _loadLootInventory();

  for (var i = 0; i < drops.length; i++) {
    var drop = drops[i];
    var item = drop.item;

    switch (item.type) {
      case 'cosmetic':
        if (!drop.isDuplicate) {
          _unlockLootCosmetic(item.id);
          if (!inv.cosmetics) inv.cosmetics = [];
          if (inv.cosmetics.indexOf(item.id) < 0) inv.cosmetics.push(item.id);
        }
        break;
      case 'consumable':
        if (!inv.consumables) inv.consumables = {};
        inv.consumables[item.id] = (inv.consumables[item.id] || 0) + 1;
        break;
      case 'fragment':
        if (!inv.fragments) inv.fragments = {};
        inv.fragments[item.id] = (inv.fragments[item.id] || 0) + 1;
        // Check if we can forge the target
        if (item.forgeTarget && inv.fragments[item.id] >= item.forgeCount) {
          inv.fragments[item.id] -= item.forgeCount;
          _unlockLootCosmetic(item.forgeTarget);
          if (!inv.cosmetics) inv.cosmetics = [];
          if (inv.cosmetics.indexOf(item.forgeTarget) < 0) {
            inv.cosmetics.push(item.forgeTarget);
          }
          if (!inv.forged) inv.forged = [];
          inv.forged.push(item.forgeTarget);
        }
        break;
    }
  }

  _saveLootInventory(inv);
}

/**
 * Load the loot inventory from localStorage.
 */
function loadLootInventory() {
  return _loadLootInventory();
}

/**
 * Get the count of a consumable in inventory.
 */
function getConsumableCount(consumableId) {
  var inv = _loadLootInventory();
  return (inv.consumables && inv.consumables[consumableId]) || 0;
}

/**
 * Use a consumable (decrement count). Returns true if consumed.
 */
function useConsumable(consumableId) {
  var inv = _loadLootInventory();
  if (!inv.consumables || !inv.consumables[consumableId] || inv.consumables[consumableId] <= 0) {
    return false;
  }
  inv.consumables[consumableId]--;
  _saveLootInventory(inv);
  return true;
}

/**
 * Get fragment count for a given fragment id.
 */
function getFragmentCount(fragmentId) {
  var inv = _loadLootInventory();
  return (inv.fragments && inv.fragments[fragmentId]) || 0;
}

// ── Internal persistence ─────────────────────────────────────────────────────

function _loadLootInventory() {
  try {
    return JSON.parse(localStorage.getItem(LOOT_INVENTORY_KEY) || '{}');
  } catch (_) { return {}; }
}

function _saveLootInventory(inv) {
  try {
    localStorage.setItem(LOOT_INVENTORY_KEY, JSON.stringify(inv));
  } catch (_) {}
}

function _loadBossFirstKills() {
  try {
    return JSON.parse(localStorage.getItem(LOOT_BOSS_FIRST_KILL_KEY) || '[]');
  } catch (_) { return []; }
}

function _saveBossFirstKills(kills) {
  try {
    localStorage.setItem(LOOT_BOSS_FIRST_KILL_KEY, JSON.stringify(kills));
  } catch (_) {}
}

// ── Lookup helper ────────────────────────────────────────────────────────────

/**
 * Look up a loot catalog item by id.
 */
function getLootItemById(id) {
  for (var i = 0; i < LOOT_CATALOG.length; i++) {
    if (LOOT_CATALOG[i].id === id) return LOOT_CATALOG[i];
  }
  // Check boss rewards
  var bossKeys = Object.keys(LOOT_BOSS_FIRST_KILL_REWARDS);
  for (var b = 0; b < bossKeys.length; b++) {
    if (LOOT_BOSS_FIRST_KILL_REWARDS[bossKeys[b]].id === id) {
      return LOOT_BOSS_FIRST_KILL_REWARDS[bossKeys[b]];
    }
  }
  return null;
}
