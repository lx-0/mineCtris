// Cosmetic data model and unlock system — foundation for all cosmetic categories.
//
// Categories: block_skin, pickaxe_skin, trail, landing_effect, border, title
// Rarities:   common, rare, epic, legendary
// Unlock conditions: level, prestige, achievement, mastery, season, dungeon
//
// Depends on: stats.js (loadLifetimeStats), leveling.js (getLevelFromXP),
//             achievements.js (loadAchievements)

// ── Storage keys ────────────────────────────────────────────────────────────────

const COSMETICS_UNLOCKED_KEY = 'mineCtris_cosmetics_unlocked';
const COSMETICS_EQUIPPED_KEY = 'mineCtris_cosmetics_equipped';

// ── Registry ────────────────────────────────────────────────────────────────────

const COSMETIC_REGISTRY = [
  // ── Block Skins ───────────────────────────────────────────────────────────
  {
    id:              'block_skin_default',
    category:        'block_skin',
    name:            'Default',
    rarity:          'common',
    unlockCondition: null, // always unlocked
    assets:          { themeKey: 'default' },
  },
  {
    id:              'block_skin_neon',
    category:        'block_skin',
    name:            'Neon',
    rarity:          'rare',
    unlockCondition: { type: 'level', value: 5 },
    assets:          { themeKey: 'neon' },
  },
  {
    id:              'block_skin_lava',
    category:        'block_skin',
    name:            'Lava',
    rarity:          'epic',
    unlockCondition: { type: 'level', value: 15 },
    assets:          { themeKey: 'lava' },
  },

  // ── Pickaxe Skins ─────────────────────────────────────────────────────────
  {
    id:              'pickaxe_skin_default',
    category:        'pickaxe_skin',
    name:            'Default',
    rarity:          'common',
    unlockCondition: null,
    assets:          { meshKey: 'pickaxe_default' },
  },
  {
    id:              'pickaxe_skin_obsidian',
    category:        'pickaxe_skin',
    name:            'Obsidian',
    rarity:          'epic',
    unlockCondition: { type: 'achievement', value: 'geologist' },
    assets:          { meshKey: 'pickaxe_obsidian' },
  },

  // ── Titles ────────────────────────────────────────────────────────────────
  {
    id:              'title_newcomer',
    category:        'title',
    name:            'Newcomer',
    rarity:          'common',
    unlockCondition: null,
    assets:          { displayText: 'Newcomer' },
  },
  {
    id:              'title_veteran',
    category:        'title',
    name:            'Veteran',
    rarity:          'rare',
    unlockCondition: { type: 'level', value: 30 },
    assets:          { displayText: 'Veteran' },
  },

  // ── Prestige Cosmetics ──────────────────────────────────────────────────
  {
    id:              'title_prestige_1',
    category:        'title',
    name:            'Prestigious',
    rarity:          'epic',
    unlockCondition: { type: 'prestige', value: 1 },
    assets:          { displayText: 'Prestigious', nameColor: '#FFD700' },
  },
  {
    id:              'trail_prestige_2',
    category:        'trail',
    name:            'Diamond Trail',
    rarity:          'epic',
    unlockCondition: { type: 'prestige', value: 2 },
    assets:          { trailKey: 'diamond', nameColor: '#B9F2FF' },
  },
  {
    id:              'block_skin_prestige_3',
    category:        'block_skin',
    name:            'Grandmaster',
    rarity:          'legendary',
    unlockCondition: { type: 'prestige', value: 3 },
    assets:          { themeKey: 'grandmaster' },
  },
  {
    id:              'title_grandmaster',
    category:        'title',
    name:            'Grandmaster',
    rarity:          'legendary',
    unlockCondition: { type: 'prestige', value: 3 },
    assets:          { displayText: 'Grandmaster' },
  },
  {
    id:              'border_prestige_5',
    category:        'border',
    name:            'Legendary Aura',
    rarity:          'legendary',
    unlockCondition: { type: 'prestige', value: 5 },
    assets:          { borderKey: 'legendary_aura', animated: true },
  },
  {
    id:              'title_legend',
    category:        'title',
    name:            'Legend',
    rarity:          'legendary',
    unlockCondition: { type: 'prestige', value: 5 },
    assets:          { displayText: 'Legend' },
  },
  {
    id:              'title_prestige_10',
    category:        'title',
    name:            'Crown',
    rarity:          'legendary',
    unlockCondition: { type: 'prestige', value: 10 },
    assets:          { displayText: 'Crown', leaderboardIcon: '\uD83D\uDC51' },
  },
];

// ── Persistence helpers ─────────────────────────────────────────────────────────

function _loadUnlockedCosmetics() {
  try {
    const raw = localStorage.getItem(COSMETICS_UNLOCKED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function _saveUnlockedCosmetics(ids) {
  try {
    localStorage.setItem(COSMETICS_UNLOCKED_KEY, JSON.stringify(ids));
  } catch (_) {}
}

function _loadEquippedCosmetics() {
  try {
    const raw = localStorage.getItem(COSMETICS_EQUIPPED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function _saveEquippedCosmetics(map) {
  try {
    localStorage.setItem(COSMETICS_EQUIPPED_KEY, JSON.stringify(map));
  } catch (_) {}
}

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Look up a cosmetic definition by id.
 * @param {string} id
 * @returns {object|undefined}
 */
function getCosmeticById(id) {
  return COSMETIC_REGISTRY.find(c => c.id === id);
}

/**
 * Return all unlocked cosmetic objects.
 * Always includes cosmetics with no unlock condition (defaults).
 * @returns {object[]}
 */
function getUnlockedCosmetics() {
  const unlockedIds = new Set(_loadUnlockedCosmetics());
  return COSMETIC_REGISTRY.filter(
    c => c.unlockCondition === null || unlockedIds.has(c.id)
  );
}

/**
 * Check if a specific cosmetic is unlocked.
 * @param {string} id
 * @returns {boolean}
 */
function isCosmeticUnlocked(id) {
  const cosmetic = getCosmeticById(id);
  if (!cosmetic) return false;
  if (cosmetic.unlockCondition === null) return true;
  return _loadUnlockedCosmetics().includes(id);
}

/**
 * Equip a cosmetic in its category slot. The cosmetic must be unlocked.
 * Pass null as id to unequip the category.
 * @param {string|null} id
 * @returns {boolean} true if equipped successfully
 */
function equipCosmetic(id) {
  if (id === null) return false;

  const cosmetic = getCosmeticById(id);
  if (!cosmetic) return false;
  if (!isCosmeticUnlocked(id)) return false;

  const equipped = _loadEquippedCosmetics();
  equipped[cosmetic.category] = id;
  _saveEquippedCosmetics(equipped);
  return true;
}

/**
 * Unequip the cosmetic in a given category.
 * @param {string} category
 */
function unequipCosmetic(category) {
  const equipped = _loadEquippedCosmetics();
  delete equipped[category];
  _saveEquippedCosmetics(equipped);
}

/**
 * Get the currently equipped cosmetic object for a category, or null.
 * @param {string} category
 * @returns {object|null}
 */
function getEquipped(category) {
  const equipped = _loadEquippedCosmetics();
  const id = equipped[category];
  if (!id) return null;
  const cosmetic = getCosmeticById(id);
  // If the cosmetic was removed from registry, clean up
  if (!cosmetic) {
    delete equipped[category];
    _saveEquippedCosmetics(equipped);
    return null;
  }
  return cosmetic;
}

/**
 * Return the full equipped map: { category: cosmeticObject }.
 * @returns {object}
 */
function getAllEquipped() {
  const equipped = _loadEquippedCosmetics();
  const result = {};
  for (const [category, id] of Object.entries(equipped)) {
    const cosmetic = getCosmeticById(id);
    if (cosmetic) result[category] = cosmetic;
  }
  return result;
}

/**
 * Evaluate whether a cosmetic's unlock condition is met.
 * @param {object} cosmetic — a COSMETIC_REGISTRY entry
 * @returns {boolean}
 */
function checkUnlockCondition(cosmetic) {
  if (!cosmetic || cosmetic.unlockCondition === null) return true;

  const cond = cosmetic.unlockCondition;

  switch (cond.type) {
    case 'level': {
      if (typeof getPlayerLevel !== 'function') return false;
      return getPlayerLevel() >= cond.value;
    }
    case 'achievement': {
      if (typeof loadAchievements !== 'function') return false;
      const achs = loadAchievements();
      return !!achs[cond.value];
    }
    case 'prestige': {
      if (typeof getPrestigeLevel !== 'function') return false;
      return getPrestigeLevel() >= cond.value;
    }
    case 'mastery': {
      // Mastery system not yet implemented — always false
      return false;
    }
    case 'season': {
      // Season unlock — not yet wired
      return false;
    }
    case 'dungeon': {
      // Dungeon unlock — not yet wired
      return false;
    }
    default:
      return false;
  }
}

/**
 * Check all locked cosmetics, unlock any whose conditions are now met.
 * @returns {object[]} array of newly unlocked cosmetic objects
 */
function processUnlocks() {
  const unlockedIds = _loadUnlockedCosmetics();
  const unlockedSet = new Set(unlockedIds);
  const newlyUnlocked = [];

  for (const cosmetic of COSMETIC_REGISTRY) {
    // Skip already-unlocked and always-unlocked
    if (cosmetic.unlockCondition === null) continue;
    if (unlockedSet.has(cosmetic.id)) continue;

    if (checkUnlockCondition(cosmetic)) {
      unlockedIds.push(cosmetic.id);
      unlockedSet.add(cosmetic.id);
      newlyUnlocked.push(cosmetic);
    }
  }

  if (newlyUnlocked.length > 0) {
    _saveUnlockedCosmetics(unlockedIds);
  }

  return newlyUnlocked;
}

/**
 * Return all cosmetics in a given category.
 * @param {string} category
 * @returns {object[]}
 */
function getCosmeticsByCategory(category) {
  return COSMETIC_REGISTRY.filter(c => c.category === category);
}
