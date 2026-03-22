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

  // ── Mastery Cosmetics (40 total: 8 modes × 5 tiers) ──────────────────────
  // Bronze → title, Silver → block_skin, Gold → trail,
  // Diamond → landing_effect, Obsidian → border

  // Classic
  { id: 'mastery_classic_bronze',   category: 'title',          name: 'Classic Runner',      rarity: 'common',    unlockCondition: { type: 'mastery', mode: 'classic',    tier: 'bronze'   }, assets: { displayText: 'Classic Runner' } },
  { id: 'mastery_classic_silver',   category: 'block_skin',     name: 'Classic Stone',       rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'classic',    tier: 'silver'   }, assets: { themeKey: 'classic_stone' } },
  { id: 'mastery_classic_gold',     category: 'trail',          name: 'Classic Glow',        rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'classic',    tier: 'gold'     }, assets: { trailKey: 'classic_glow' } },
  { id: 'mastery_classic_diamond',  category: 'landing_effect', name: 'Classic Shatter',     rarity: 'epic',      unlockCondition: { type: 'mastery', mode: 'classic',    tier: 'diamond'  }, assets: { effectKey: 'classic_shatter' } },
  { id: 'mastery_classic_obsidian', category: 'border',         name: 'Classic Obsidian',    rarity: 'legendary', unlockCondition: { type: 'mastery', mode: 'classic',    tier: 'obsidian' }, assets: { borderKey: 'classic_obsidian', animated: true } },

  // Sprint
  { id: 'mastery_sprint_bronze',    category: 'title',          name: 'Sprint Initiate',     rarity: 'common',    unlockCondition: { type: 'mastery', mode: 'sprint',     tier: 'bronze'   }, assets: { displayText: 'Sprint Initiate' } },
  { id: 'mastery_sprint_silver',    category: 'block_skin',     name: 'Sprint Flash',        rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'sprint',     tier: 'silver'   }, assets: { themeKey: 'sprint_flash' } },
  { id: 'mastery_sprint_gold',      category: 'trail',          name: 'Speed Trail',         rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'sprint',     tier: 'gold'     }, assets: { trailKey: 'speed_trail' } },
  { id: 'mastery_sprint_diamond',   category: 'landing_effect', name: 'Sprint Burst',        rarity: 'epic',      unlockCondition: { type: 'mastery', mode: 'sprint',     tier: 'diamond'  }, assets: { effectKey: 'sprint_burst' } },
  { id: 'mastery_sprint_obsidian',  category: 'border',         name: 'Sprint Obsidian',     rarity: 'legendary', unlockCondition: { type: 'mastery', mode: 'sprint',     tier: 'obsidian' }, assets: { borderKey: 'sprint_obsidian', animated: true } },

  // Blitz
  { id: 'mastery_blitz_bronze',     category: 'title',          name: 'Blitz Initiate',      rarity: 'common',    unlockCondition: { type: 'mastery', mode: 'blitz',      tier: 'bronze'   }, assets: { displayText: 'Blitz Initiate' } },
  { id: 'mastery_blitz_silver',     category: 'block_skin',     name: 'Blitz Neon',          rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'blitz',      tier: 'silver'   }, assets: { themeKey: 'blitz_neon' } },
  { id: 'mastery_blitz_gold',       category: 'trail',          name: 'Blitz Flare',         rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'blitz',      tier: 'gold'     }, assets: { trailKey: 'blitz_flare' } },
  { id: 'mastery_blitz_diamond',    category: 'landing_effect', name: 'Blitz Impact',        rarity: 'epic',      unlockCondition: { type: 'mastery', mode: 'blitz',      tier: 'diamond'  }, assets: { effectKey: 'blitz_impact' } },
  { id: 'mastery_blitz_obsidian',   category: 'border',         name: 'Blitz Halo',          rarity: 'legendary', unlockCondition: { type: 'mastery', mode: 'blitz',      tier: 'obsidian' }, assets: { borderKey: 'blitz_halo', animated: true } },

  // Daily
  { id: 'mastery_daily_bronze',     category: 'title',          name: 'Daily Runner',        rarity: 'common',    unlockCondition: { type: 'mastery', mode: 'daily',      tier: 'bronze'   }, assets: { displayText: 'Daily Runner' } },
  { id: 'mastery_daily_silver',     category: 'block_skin',     name: 'Daily Amber',         rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'daily',      tier: 'silver'   }, assets: { themeKey: 'daily_amber' } },
  { id: 'mastery_daily_gold',       category: 'trail',          name: 'Daily Star',          rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'daily',      tier: 'gold'     }, assets: { trailKey: 'daily_star' } },
  { id: 'mastery_daily_diamond',    category: 'landing_effect', name: 'Daily Shimmer',       rarity: 'epic',      unlockCondition: { type: 'mastery', mode: 'daily',      tier: 'diamond'  }, assets: { effectKey: 'daily_shimmer' } },
  { id: 'mastery_daily_obsidian',   category: 'border',         name: 'Daily Legend',        rarity: 'legendary', unlockCondition: { type: 'mastery', mode: 'daily',      tier: 'obsidian' }, assets: { borderKey: 'daily_legend', animated: true } },

  // Survival
  { id: 'mastery_survival_bronze',   category: 'title',          name: 'Survivor',            rarity: 'common',    unlockCondition: { type: 'mastery', mode: 'survival',   tier: 'bronze'   }, assets: { displayText: 'Survivor' } },
  { id: 'mastery_survival_silver',   category: 'block_skin',     name: 'Forest Green',        rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'survival',   tier: 'silver'   }, assets: { themeKey: 'forest_green' } },
  { id: 'mastery_survival_gold',     category: 'trail',          name: 'Jungle Trail',        rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'survival',   tier: 'gold'     }, assets: { trailKey: 'jungle_trail' } },
  { id: 'mastery_survival_diamond',  category: 'landing_effect', name: 'Nature Bloom',        rarity: 'epic',      unlockCondition: { type: 'mastery', mode: 'survival',   tier: 'diamond'  }, assets: { effectKey: 'nature_bloom' } },
  { id: 'mastery_survival_obsidian', category: 'border',         name: 'Survivor Halo',       rarity: 'legendary', unlockCondition: { type: 'mastery', mode: 'survival',   tier: 'obsidian' }, assets: { borderKey: 'survivor_halo', animated: true } },

  // Battle
  { id: 'mastery_battle_bronze',    category: 'title',          name: 'Battle Initiate',     rarity: 'common',    unlockCondition: { type: 'mastery', mode: 'battle',     tier: 'bronze'   }, assets: { displayText: 'Battle Initiate' } },
  { id: 'mastery_battle_silver',    category: 'block_skin',     name: 'Battle Scarlet',      rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'battle',     tier: 'silver'   }, assets: { themeKey: 'battle_scarlet' } },
  { id: 'mastery_battle_gold',      category: 'trail',          name: 'Combat Trail',        rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'battle',     tier: 'gold'     }, assets: { trailKey: 'combat_trail' } },
  { id: 'mastery_battle_diamond',   category: 'landing_effect', name: 'Battle Shockwave',    rarity: 'epic',      unlockCondition: { type: 'mastery', mode: 'battle',     tier: 'diamond'  }, assets: { effectKey: 'battle_shockwave' } },
  { id: 'mastery_battle_obsidian',  category: 'border',         name: 'Battle Crown',        rarity: 'legendary', unlockCondition: { type: 'mastery', mode: 'battle',     tier: 'obsidian' }, assets: { borderKey: 'battle_crown', animated: true } },

  // Expedition
  { id: 'mastery_expedition_bronze',   category: 'title',          name: 'Explorer',            rarity: 'common',    unlockCondition: { type: 'mastery', mode: 'expedition', tier: 'bronze'   }, assets: { displayText: 'Explorer' } },
  { id: 'mastery_expedition_silver',   category: 'block_skin',     name: 'Expedition Mossy',    rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'expedition', tier: 'silver'   }, assets: { themeKey: 'expedition_mossy' } },
  { id: 'mastery_expedition_gold',     category: 'trail',          name: 'Explorer Trail',      rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'expedition', tier: 'gold'     }, assets: { trailKey: 'explorer_trail' } },
  { id: 'mastery_expedition_diamond',  category: 'landing_effect', name: 'Expedition Burst',    rarity: 'epic',      unlockCondition: { type: 'mastery', mode: 'expedition', tier: 'diamond'  }, assets: { effectKey: 'expedition_burst' } },
  { id: 'mastery_expedition_obsidian', category: 'border',         name: 'Explorer Wreath',     rarity: 'legendary', unlockCondition: { type: 'mastery', mode: 'expedition', tier: 'obsidian' }, assets: { borderKey: 'explorer_wreath', animated: true } },

  // Depths
  { id: 'mastery_depths_bronze',    category: 'title',          name: 'Depth Diver',         rarity: 'common',    unlockCondition: { type: 'mastery', mode: 'depths',     tier: 'bronze'   }, assets: { displayText: 'Depth Diver' } },
  { id: 'mastery_depths_silver',    category: 'block_skin',     name: 'Depths Dark',         rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'depths',     tier: 'silver'   }, assets: { themeKey: 'depths_dark' } },
  { id: 'mastery_depths_gold',      category: 'trail',          name: 'Depths Void',         rarity: 'rare',      unlockCondition: { type: 'mastery', mode: 'depths',     tier: 'gold'     }, assets: { trailKey: 'depths_void' } },
  { id: 'mastery_depths_diamond',   category: 'landing_effect', name: 'Depths Explosion',    rarity: 'epic',      unlockCondition: { type: 'mastery', mode: 'depths',     tier: 'diamond'  }, assets: { effectKey: 'depths_explosion' } },
  { id: 'mastery_depths_obsidian',  category: 'border',         name: 'Depths Abyss',        rarity: 'legendary', unlockCondition: { type: 'mastery', mode: 'depths',     tier: 'obsidian' }, assets: { borderKey: 'depths_abyss', animated: true } },
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
      if (typeof getMasteryTier !== 'function') return false;
      var tierOrder = ['bronze', 'silver', 'gold', 'diamond', 'obsidian'];
      var requiredIdx = tierOrder.indexOf(cond.tier);
      var currentTier = getMasteryTier(cond.mode); // returns 0-5
      return currentTier >= requiredIdx + 1;
    }
    case 'season': {
      // Season unlock — not yet wired
      return false;
    }
    case 'dungeon': {
      // Dungeon reward — check if the player owns this depths reward
      if (typeof hasDepthsReward === 'function') return hasDepthsReward(cond.value);
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
