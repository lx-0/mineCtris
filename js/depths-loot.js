// Loot type definitions, drop tables, and rarity rolls for the Expeditions dungeon system.
//
// Extends the base rarity system (loot-tables.js) with tier-scoped drop pools,
// blueprint unlocks, fragment forging, and consumable activation at the
// extract-or-descend screen.
//
// Requires: depths-loot-config.js (item definitions),
//           loot-tables.js (LOOT_RARITY, LOOT_DROP_RATES, LOOT_BOSS_DROP_RATES, _lootPoolByRarity),
//           depths-state.js (getDungeonSession),
//           cosmetics.js (_loadUnlockedCosmetics, _saveUnlockedCosmetics)
// Used by:  depths-session.js (floor-clear loot rolls, consumable activation)

// ── Storage ────────────────────────────────────────────────────────────────

var DEPTHS_LOOT_INVENTORY_KEY = 'mineCtris_depths_loot_inventory';
var DEPTHS_BLUEPRINTS_KEY     = 'mineCtris_depths_blueprints';
var DEPTHS_LOOT_MAGNET_KEY    = 'mineCtris_depths_loot_magnet';

// ── Rarity-indexed pools built from depths-loot-config ─────────────────────

var _depthsPoolByRarity = {};
var _depthsTierPoolByRarity = {};

(function _buildDepthsPools() {
  var rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  for (var r = 0; r < rarities.length; r++) {
    _depthsPoolByRarity[rarities[r]] = [];
  }
  for (var i = 0; i < DEPTHS_ALL_ITEMS.length; i++) {
    var item = DEPTHS_ALL_ITEMS[i];
    if (_depthsPoolByRarity[item.rarity]) {
      _depthsPoolByRarity[item.rarity].push(item);
    }
  }

  // Build tier-scoped pools
  var tiers = ['shallow', 'deep', 'abyssal'];
  for (var t = 0; t < tiers.length; t++) {
    var tier = tiers[t];
    _depthsTierPoolByRarity[tier] = {};
    for (var r2 = 0; r2 < rarities.length; r2++) {
      _depthsTierPoolByRarity[tier][rarities[r2]] = [];
    }
    var items = DEPTHS_TIER_ITEMS[tier] || [];
    for (var j = 0; j < items.length; j++) {
      var it = items[j];
      if (_depthsTierPoolByRarity[tier][it.rarity]) {
        _depthsTierPoolByRarity[tier][it.rarity].push(it);
      }
    }
  }
})();

// ── Register depths cosmetics in the main cosmetic system ──────────────────

(function _registerDepthsCosmetics() {
  if (typeof COSMETIC_REGISTRY === 'undefined') return;

  var allCosmetics = DEPTHS_ALL_ITEMS.filter(function (item) { return item.type === 'cosmetic'; });
  // Also register boss first-kill rewards
  var bossKeys = Object.keys(DEPTHS_BOSS_FIRST_KILL_REWARDS);
  for (var b = 0; b < bossKeys.length; b++) {
    allCosmetics.push(DEPTHS_BOSS_FIRST_KILL_REWARDS[bossKeys[b]]);
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

// ── Drop rate calculation (tier + depth interpolation) ─────────────────────

/**
 * Get interpolated drop rates for a dungeon tier and floor number.
 * Deeper floors shift rates toward rarer drops. Boss floors use boss rates.
 *
 * @param {string}  tier      'shallow', 'deep', 'abyssal'
 * @param {number}  floorNum  Current floor number (1-based)
 * @param {boolean} isBoss    Whether this is a boss floor
 * @returns {object} { common, uncommon, rare, epic, legendary }
 */
function getDepthsDropRates(tier, floorNum, isBoss) {
  var baseTable = isBoss ? LOOT_BOSS_DROP_RATES : LOOT_DROP_RATES;
  var base = baseTable[tier] || baseTable.shallow;
  var rates = {
    common:    base.common,
    uncommon:  base.uncommon,
    rare:      base.rare,
    epic:      base.epic,
    legendary: base.legendary,
  };

  // Depth bonus: each floor beyond 1 shifts 2% from common → higher rarities
  if (!isBoss) {
    var depthBonus = Math.max(0, (floorNum - 1)) * 2;
    if (depthBonus > 0) {
      var taken = Math.min(rates.common, depthBonus);
      rates.common -= taken;
      var perSlot = taken / 4;
      rates.uncommon  += perSlot;
      rates.rare      += perSlot;
      rates.epic      += perSlot;
      rates.legendary += perSlot;
    }
  }

  return rates;
}

// ── Roll rarity ────────────────────────────────────────────────────────────

function _rollDepthsRarity(rates) {
  var roll = Math.random() * 100;
  var cumulative = 0;
  var rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  for (var i = 0; i < rarities.length; i++) {
    cumulative += rates[rarities[i]];
    if (roll < cumulative) return rarities[i];
  }
  return 'common';
}

// ── Roll a single depths loot drop ─────────────────────────────────────────

/**
 * Roll a single loot drop from the depths catalog, scoped to dungeon tier.
 *
 * @param {string}  tier      Dungeon tier
 * @param {number}  floorNum  Current floor number
 * @param {boolean} isBoss    Whether this is a boss kill
 * @returns {object|null} { item, rarity, isDuplicate, bonusXP }
 */
function rollDepthsLootDrop(tier, floorNum, isBoss) {
  var rates = getDepthsDropRates(tier, floorNum, isBoss);
  var rarity = _rollDepthsRarity(rates);

  // Pick from tier-scoped pool first, fall back to global pool
  var pool = (_depthsTierPoolByRarity[tier] && _depthsTierPoolByRarity[tier][rarity])
    ? _depthsTierPoolByRarity[tier][rarity]
    : _depthsPoolByRarity[rarity];

  if (!pool || pool.length === 0) {
    // Fallback: try lower rarities
    var fallback = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
    for (var f = 0; f < fallback.length; f++) {
      pool = (_depthsTierPoolByRarity[tier] && _depthsTierPoolByRarity[tier][fallback[f]])
        ? _depthsTierPoolByRarity[tier][fallback[f]]
        : _depthsPoolByRarity[fallback[f]];
      if (pool && pool.length > 0) { rarity = fallback[f]; break; }
    }
  }
  if (!pool || pool.length === 0) return null;

  var item = pool[Math.floor(Math.random() * pool.length)];

  // Duplicate check for cosmetics
  var isDuplicate = false;
  var bonusXP = 0;
  if (item.type === 'cosmetic') {
    isDuplicate = _isDepthsCosmeticOwned(item.id);
    if (isDuplicate) {
      bonusXP = _getDepthsDuplicateXP(rarity);
      if (typeof awardBonusXP === 'function') awardBonusXP(bonusXP);
    }
  }

  return { item: item, rarity: rarity, isDuplicate: isDuplicate, bonusXP: bonusXP };
}

// ── Roll loot for a floor clear ────────────────────────────────────────────

/**
 * Roll loot for a floor clear event. Returns 1-3 items based on depth.
 * If Loot Magnet is active, doubles the drop count.
 *
 * @param {string}  tier      Dungeon tier
 * @param {number}  floorNum  Current floor
 * @param {boolean} isBoss    Boss defeated on this floor
 * @returns {object[]} Array of { item, rarity, isDuplicate, bonusXP }
 */
function rollDepthsFloorLoot(tier, floorNum, isBoss) {
  var dropCount = Math.min(3, 1 + Math.floor(floorNum / 2));

  // Loot Magnet doubles drops
  if (_isLootMagnetActive()) {
    dropCount *= 2;
    _clearLootMagnet();
  }

  var drops = [];
  for (var i = 0; i < dropCount; i++) {
    var drop = rollDepthsLootDrop(tier, floorNum, isBoss && i === 0);
    if (drop) drops.push(drop);
  }

  return drops;
}

// ── Boss first-kill reward (depths version) ────────────────────────────────

/**
 * Check and award the first-kill boss cosmetic from the depths system.
 *
 * @param {string} bossId  Boss identifier
 * @returns {object|null} Boss reward item or null if already claimed
 */
function checkDepthsBossFirstKill(bossId) {
  if (!bossId) return null;
  var reward = DEPTHS_BOSS_FIRST_KILL_REWARDS[bossId];
  if (!reward) return null;

  var claimed = _loadDepthsBossFirstKills();
  if (claimed.indexOf(bossId) >= 0) return null;

  // Claim it
  claimed.push(bossId);
  _saveDepthsBossFirstKills(claimed);

  // Unlock the cosmetic
  _unlockDepthsCosmetic(reward.id);

  return reward;
}

var DEPTHS_BOSS_FK_KEY = 'mineCtris_depths_boss_first_kills';

function _loadDepthsBossFirstKills() {
  try { return JSON.parse(localStorage.getItem(DEPTHS_BOSS_FK_KEY) || '[]'); }
  catch (_) { return []; }
}

function _saveDepthsBossFirstKills(kills) {
  try { localStorage.setItem(DEPTHS_BOSS_FK_KEY, JSON.stringify(kills)); }
  catch (_) {}
}

// ── Save depths loot drops ─────────────────────────────────────────────────

/**
 * Save earned depths loot to the player's persistent inventory.
 * Cosmetics unlock, consumables increment, blueprints unlock in workshop,
 * fragments track progress toward forging.
 *
 * @param {object[]} drops  Array of { item, rarity, isDuplicate }
 */
function saveDepthsLootDrops(drops) {
  if (!drops || drops.length === 0) return;
  var inv = _loadDepthsInventory();

  for (var i = 0; i < drops.length; i++) {
    var drop = drops[i];
    var item = drop.item;

    switch (item.type) {
      case 'cosmetic':
        if (!drop.isDuplicate) {
          _unlockDepthsCosmetic(item.id);
          if (!inv.cosmetics) inv.cosmetics = [];
          if (inv.cosmetics.indexOf(item.id) < 0) inv.cosmetics.push(item.id);
        }
        break;

      case 'consumable':
        if (!inv.consumables) inv.consumables = {};
        inv.consumables[item.id] = (inv.consumables[item.id] || 0) + 1;
        break;

      case 'blueprint':
        if (!inv.blueprints) inv.blueprints = [];
        if (inv.blueprints.indexOf(item.id) < 0) {
          inv.blueprints.push(item.id);
          _unlockBlueprint(item.id);
        } else {
          // Duplicate blueprint: award consolation XP
          var bpXP = _getDepthsDuplicateXP(drop.rarity);
          if (typeof awardBonusXP === 'function') awardBonusXP(bpXP);
        }
        break;

      case 'fragment':
        if (!inv.fragments) inv.fragments = {};
        inv.fragments[item.id] = (inv.fragments[item.id] || 0) + 1;
        // Check if we can forge the target
        if (item.forgeTarget && inv.fragments[item.id] >= item.forgeCount) {
          inv.fragments[item.id] -= item.forgeCount;
          _unlockDepthsCosmetic(item.forgeTarget);
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

  _saveDepthsInventory(inv);
}

// ── Consumable management ──────────────────────────────────────────────────

/**
 * Get count of a depths consumable.
 */
function getDepthsConsumableCount(consumableId) {
  var inv = _loadDepthsInventory();
  return (inv.consumables && inv.consumables[consumableId]) || 0;
}

/**
 * Use a depths consumable (decrement count). Returns true if consumed.
 */
function useDepthsConsumable(consumableId) {
  var inv = _loadDepthsInventory();
  if (!inv.consumables || !inv.consumables[consumableId] || inv.consumables[consumableId] <= 0) {
    return false;
  }
  inv.consumables[consumableId]--;
  _saveDepthsInventory(inv);
  return true;
}

/**
 * Activate Loot Magnet for the next floor.
 */
function activateLootMagnet() {
  if (!useDepthsConsumable('depths_consumable_loot_magnet')) return false;
  try { localStorage.setItem(DEPTHS_LOOT_MAGNET_KEY, '1'); } catch (_) {}
  return true;
}

function _isLootMagnetActive() {
  try { return localStorage.getItem(DEPTHS_LOOT_MAGNET_KEY) === '1'; }
  catch (_) { return false; }
}

function _clearLootMagnet() {
  try { localStorage.removeItem(DEPTHS_LOOT_MAGNET_KEY); } catch (_) {}
}

/**
 * Activate Extra Life for the current run.
 * Sets a flag that depths-session.js reads on death.
 */
function activateExtraLife() {
  if (!useDepthsConsumable('depths_consumable_extra_life')) return false;
  _depthsExtraLifeActive = true;
  return true;
}

var _depthsExtraLifeActive = false;

/**
 * Check if extra life is active and consume it.
 * Returns true if the player should be revived instead of dying.
 */
function consumeExtraLife() {
  if (!_depthsExtraLifeActive) return false;
  _depthsExtraLifeActive = false;
  return true;
}

/**
 * Check if extra life is currently active.
 */
function isExtraLifeActive() {
  return _depthsExtraLifeActive;
}

// ── Fragment progress ──────────────────────────────────────────────────────

/**
 * Get fragment count for a given fragment id.
 */
function getDepthsFragmentCount(fragmentId) {
  var inv = _loadDepthsInventory();
  return (inv.fragments && inv.fragments[fragmentId]) || 0;
}

/**
 * Get all fragment progress (for UI display).
 * Returns array of { fragment, current, needed, targetItem }
 */
function getDepthsFragmentProgress() {
  var inv = _loadDepthsInventory();
  var progress = [];
  for (var i = 0; i < DEPTHS_FRAGMENTS.length; i++) {
    var frag = DEPTHS_FRAGMENTS[i];
    var current = (inv.fragments && inv.fragments[frag.id]) || 0;
    var targetItem = getDepthsItemById(frag.forgeTarget);
    progress.push({
      fragment:   frag,
      current:    current,
      needed:     frag.forgeCount,
      targetItem: targetItem,
    });
  }
  return progress;
}

// ── Blueprint management ───────────────────────────────────────────────────

/**
 * Get all unlocked blueprint ids.
 */
function getUnlockedBlueprints() {
  try { return JSON.parse(localStorage.getItem(DEPTHS_BLUEPRINTS_KEY) || '[]'); }
  catch (_) { return []; }
}

/**
 * Check if a blueprint is unlocked.
 */
function isBlueprintUnlocked(blueprintId) {
  return getUnlockedBlueprints().indexOf(blueprintId) >= 0;
}

function _unlockBlueprint(blueprintId) {
  var unlocked = getUnlockedBlueprints();
  if (unlocked.indexOf(blueprintId) < 0) {
    unlocked.push(blueprintId);
    try { localStorage.setItem(DEPTHS_BLUEPRINTS_KEY, JSON.stringify(unlocked)); }
    catch (_) {}
  }
}

// ── Item lookup ────────────────────────────────────────────────────────────

/**
 * Look up a depths loot item by id.
 */
function getDepthsItemById(id) {
  for (var i = 0; i < DEPTHS_ALL_ITEMS.length; i++) {
    if (DEPTHS_ALL_ITEMS[i].id === id) return DEPTHS_ALL_ITEMS[i];
  }
  // Check boss first-kill rewards
  var bossKeys = Object.keys(DEPTHS_BOSS_FIRST_KILL_REWARDS);
  for (var b = 0; b < bossKeys.length; b++) {
    if (DEPTHS_BOSS_FIRST_KILL_REWARDS[bossKeys[b]].id === id) {
      return DEPTHS_BOSS_FIRST_KILL_REWARDS[bossKeys[b]];
    }
  }
  return null;
}

// ── Duplicate XP ───────────────────────────────────────────────────────────

var DEPTHS_DUPLICATE_XP = {
  common:    100,
  uncommon:  200,
  rare:      350,
  epic:      500,
  legendary: 1000,
};

function _getDepthsDuplicateXP(rarity) {
  return DEPTHS_DUPLICATE_XP[rarity] || 100;
}

// ── Cosmetic ownership ─────────────────────────────────────────────────────

function _isDepthsCosmeticOwned(cosmeticId) {
  if (typeof _loadUnlockedCosmetics !== 'function') return false;
  return _loadUnlockedCosmetics().indexOf(cosmeticId) >= 0;
}

function _unlockDepthsCosmetic(cosmeticId) {
  if (typeof _loadUnlockedCosmetics !== 'function' ||
      typeof _saveUnlockedCosmetics !== 'function') return;
  var unlocked = _loadUnlockedCosmetics();
  if (unlocked.indexOf(cosmeticId) < 0) {
    unlocked.push(cosmeticId);
    _saveUnlockedCosmetics(unlocked);
  }
}

// ── Internal persistence ───────────────────────────────────────────────────

function _loadDepthsInventory() {
  try { return JSON.parse(localStorage.getItem(DEPTHS_LOOT_INVENTORY_KEY) || '{}'); }
  catch (_) { return {}; }
}

function _saveDepthsInventory(inv) {
  try { localStorage.setItem(DEPTHS_LOOT_INVENTORY_KEY, JSON.stringify(inv)); }
  catch (_) {}
}

/**
 * Load the full depths loot inventory (public accessor).
 */
function loadDepthsLootInventory() {
  return _loadDepthsInventory();
}
