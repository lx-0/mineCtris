// Depths Vault collection state management — tracks discovered items, completion stats,
// and "new" badge state for the loot vault UI.
//
// Requires: depths-loot-config.js (DEPTHS_ALL_ITEMS, DEPTHS_FRAGMENTS, DEPTHS_LOOT_CATEGORY,
//             DEPTHS_COSMETIC_CATEGORY, DEPTHS_TIER_ITEMS, DEPTHS_FORGE_RECIPES),
//           depths-loot.js (loadDepthsLootInventory, getDepthsFragmentProgress,
//             getUnlockedBlueprints, isBlueprintUnlocked, getDepthsItemById),
//           loot-tables.js (LOOT_RARITY),
//           cosmetics.js (isCosmeticUnlocked, equipCosmetic, unequipCosmetic, getEquipped)
// Used by:  depths-vault-ui.js

// ── Storage ──────────────────────────────────────────────────────────────────

var VAULT_NEW_ITEMS_KEY  = 'mineCtris_vault_new_items';
var VAULT_LAST_VIEW_KEY  = 'mineCtris_vault_last_view';

// ── "New" badge tracking ─────────────────────────────────────────────────────

function _loadVaultNewItems() {
  try { return JSON.parse(localStorage.getItem(VAULT_NEW_ITEMS_KEY) || '[]'); }
  catch (_) { return []; }
}

function _saveVaultNewItems(ids) {
  try { localStorage.setItem(VAULT_NEW_ITEMS_KEY, JSON.stringify(ids)); }
  catch (_) {}
}

/**
 * Mark an item as newly acquired (called by loot drop system).
 */
function markVaultItemNew(itemId) {
  var items = _loadVaultNewItems();
  if (items.indexOf(itemId) < 0) {
    items.push(itemId);
    _saveVaultNewItems(items);
  }
}

/**
 * Clear the "new" badge for a specific item (called when viewed in vault).
 */
function clearVaultItemNew(itemId) {
  var items = _loadVaultNewItems();
  var idx = items.indexOf(itemId);
  if (idx >= 0) {
    items.splice(idx, 1);
    _saveVaultNewItems(items);
  }
}

/**
 * Check if an item has the "new" badge.
 */
function isVaultItemNew(itemId) {
  return _loadVaultNewItems().indexOf(itemId) >= 0;
}

/**
 * Get count of new items.
 */
function getVaultNewItemCount() {
  return _loadVaultNewItems().length;
}

/**
 * Clear all "new" badges.
 */
function clearAllVaultNew() {
  _saveVaultNewItems([]);
}

// ── Item ownership checks ────────────────────────────────────────────────────

/**
 * Check if a depths item is owned by the player.
 */
function isVaultItemOwned(item) {
  if (!item) return false;
  var inv = loadDepthsLootInventory();

  switch (item.type) {
    case 'cosmetic':
      return typeof isCosmeticUnlocked === 'function'
        ? isCosmeticUnlocked(item.id)
        : (inv.cosmetics && inv.cosmetics.indexOf(item.id) >= 0);

    case 'consumable':
      return inv.consumables && inv.consumables[item.id] > 0;

    case 'blueprint':
      return typeof isBlueprintUnlocked === 'function'
        ? isBlueprintUnlocked(item.id)
        : (inv.blueprints && inv.blueprints.indexOf(item.id) >= 0);

    case 'fragment':
      return inv.fragments && inv.fragments[item.id] > 0;

    default:
      return false;
  }
}

// ── Source hints ──────────────────────────────────────────────────────────────

var _VAULT_TIER_LABELS = {
  shallow: 'Shallow Mines',
  deep:    'Deep Caverns',
  abyssal: 'Abyssal Rift',
};

/**
 * Get a human-readable source hint for where an item drops.
 */
function getVaultSourceHint(item) {
  if (!item) return 'Unknown';

  // Check which tiers contain this item
  var tiers = ['shallow', 'deep', 'abyssal'];
  var sources = [];
  for (var t = 0; t < tiers.length; t++) {
    var pool = DEPTHS_TIER_ITEMS[tiers[t]] || [];
    for (var i = 0; i < pool.length; i++) {
      if (pool[i].id === item.id) {
        sources.push(_VAULT_TIER_LABELS[tiers[t]]);
        break;
      }
    }
  }

  // Check boss first-kill rewards
  var bossKeys = Object.keys(DEPTHS_BOSS_FIRST_KILL_REWARDS);
  for (var b = 0; b < bossKeys.length; b++) {
    if (DEPTHS_BOSS_FIRST_KILL_REWARDS[bossKeys[b]].id === item.id) {
      var bossName = bossKeys[b].replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      return 'First kill: ' + bossName;
    }
  }

  // Check forge targets
  for (var f = 0; f < DEPTHS_FRAGMENTS.length; f++) {
    if (DEPTHS_FRAGMENTS[f].forgeTarget === item.id) {
      return 'Forge from ' + DEPTHS_FRAGMENTS[f].name;
    }
  }

  if (sources.length > 0) return 'Drops in: ' + sources.join(', ');
  return 'Dungeon reward';
}

// ── Filtering ────────────────────────────────────────────────────────────────

var VAULT_TABS = {
  all:      { id: 'all',      label: 'All Items' },
  tier:     { id: 'tier',     label: 'By Dungeon Tier' },
  boss:     { id: 'boss',     label: 'By Boss' },
  rarity:   { id: 'rarity',   label: 'By Rarity' },
};

/**
 * Get all vault items (the full depths catalog).
 */
function getVaultAllItems() {
  return DEPTHS_ALL_ITEMS;
}

/**
 * Get vault items filtered by loot category.
 */
function getVaultItemsByCategory(category) {
  return DEPTHS_ALL_ITEMS.filter(function (item) { return item.type === category; });
}

/**
 * Get vault items filtered by dungeon tier.
 */
function getVaultItemsByTier(tier) {
  return DEPTHS_TIER_ITEMS[tier] || [];
}

/**
 * Get vault items filtered by rarity.
 */
function getVaultItemsByRarity(rarity) {
  return DEPTHS_ALL_ITEMS.filter(function (item) { return item.rarity === rarity; });
}

/**
 * Get boss-associated items (first-kill rewards + boss pickaxes).
 */
function getVaultBossItems() {
  var items = [];
  // Boss first-kill rewards
  var bossKeys = Object.keys(DEPTHS_BOSS_FIRST_KILL_REWARDS);
  for (var b = 0; b < bossKeys.length; b++) {
    items.push({
      boss: bossKeys[b],
      item: DEPTHS_BOSS_FIRST_KILL_REWARDS[bossKeys[b]],
    });
  }
  return items;
}

// ── Completion stats ─────────────────────────────────────────────────────────

/**
 * Get completion stats for the vault.
 * Returns { total, discovered, percentage, byCategory, byRarity }
 */
function getVaultCompletionStats() {
  var total = 0;
  var discovered = 0;
  var byCategory = {};
  var byRarity = {};

  for (var i = 0; i < DEPTHS_ALL_ITEMS.length; i++) {
    var item = DEPTHS_ALL_ITEMS[i];

    // Skip consumables from completion tracking (they're expendable)
    if (item.type === 'consumable') continue;

    total++;
    var owned = isVaultItemOwned(item);
    if (owned) discovered++;

    // By category
    var catKey = item.type === 'cosmetic' ? item.category : item.type;
    if (!byCategory[catKey]) byCategory[catKey] = { total: 0, discovered: 0 };
    byCategory[catKey].total++;
    if (owned) byCategory[catKey].discovered++;

    // By rarity
    if (!byRarity[item.rarity]) byRarity[item.rarity] = { total: 0, discovered: 0 };
    byRarity[item.rarity].total++;
    if (owned) byRarity[item.rarity].discovered++;
  }

  return {
    total:      total,
    discovered: discovered,
    percentage: total > 0 ? Math.round((discovered / total) * 100) : 0,
    byCategory: byCategory,
    byRarity:   byRarity,
  };
}

/**
 * Get consumable counts for display.
 * Returns array of { item, count }
 */
function getVaultConsumableCounts() {
  var inv = loadDepthsLootInventory();
  var consumables = getVaultItemsByCategory('consumable');
  var result = [];
  for (var i = 0; i < consumables.length; i++) {
    var item = consumables[i];
    var count = (inv.consumables && inv.consumables[item.id]) || 0;
    result.push({ item: item, count: count });
  }
  return result;
}

/**
 * Sort items by rarity (highest first), then by name.
 */
function sortVaultItemsByRarity(items) {
  return items.slice().sort(function (a, b) {
    var ra = LOOT_RARITY[a.rarity] ? LOOT_RARITY[a.rarity].order : 0;
    var rb = LOOT_RARITY[b.rarity] ? LOOT_RARITY[b.rarity].order : 0;
    if (rb !== ra) return rb - ra;
    return a.name.localeCompare(b.name);
  });
}
