// Expedition Reward Tracks — per-biome 15-tier progression system.
//
// Each of the 4 biomes (stone, forest, nether, ice) has a 15-tier lifetime
// reward track. XP is earned from expedition runs: Math.min(500, floor(score/100)).
// Progress persists across season resets (stored under a lifetime key).
//
// Tier structure:
//   Tiers  1–5 : small XP boosts
//   Tiers  6–9 : common cosmetics (cell style or piece skin)
//   Tiers 10–13: larger XP boosts + title badge
//   Tiers 14–15: biome-exclusive cosmetics (board skin or piece theme)
//
// Load order: before expedition-session.js and expedition-map.js.

// ── Tier definitions ─────────────────────────────────────────────────────────
// xpRequired is cumulative (lifetime biome XP needed to REACH this tier).

const BIOME_REWARD_TRACKS = {
  stone: [
    { tier:  1, xpRequired:     0, label: 'Wanderer',     rewardType: null,               rewardLabel: null },
    { tier:  2, xpRequired:   300, label: 'Spelunker',    rewardType: 'xp_boost',         rewardLabel: '+5% Expedition XP',         rewardValue: 5   },
    { tier:  3, xpRequired:   700, label: 'Delver',       rewardType: 'xp_boost',         rewardLabel: '+5% Expedition XP',         rewardValue: 5   },
    { tier:  4, xpRequired:  1300, label: 'Excavator',    rewardType: 'xp_boost',         rewardLabel: '+10% Expedition XP',        rewardValue: 10  },
    { tier:  5, xpRequired:  2100, label: 'Tunneler',     rewardType: 'xp_boost',         rewardLabel: '+10% Expedition XP',        rewardValue: 10  },
    { tier:  6, xpRequired:  3200, label: 'Miner',        rewardType: 'cosmetic_common',  rewardLabel: 'Iron Cell Style',           rewardValue: 'stone_iron_cell'     },
    { tier:  7, xpRequired:  4500, label: 'Quarrier',     rewardType: 'cosmetic_common',  rewardLabel: 'Cobblestone Piece Skin',    rewardValue: 'stone_cobble_skin'   },
    { tier:  8, xpRequired:  6000, label: 'Prospector',   rewardType: 'cosmetic_common',  rewardLabel: 'Ore Vein Cell Style',       rewardValue: 'stone_ore_cell'      },
    { tier:  9, xpRequired:  7800, label: 'Shaft Delver', rewardType: 'cosmetic_common',  rewardLabel: 'Ancient Stone Piece Skin',  rewardValue: 'stone_ancient_skin'  },
    { tier: 10, xpRequired:  9900, label: 'Deep Diver',   rewardType: 'xp_boost_badge',   rewardLabel: '+15% Expedition XP + "Deep Diver" Badge', rewardValue: { boost: 15, badge: 'Deep Diver' }  },
    { tier: 11, xpRequired: 12300, label: 'Core Seeker',  rewardType: 'xp_boost_badge',   rewardLabel: '+15% Expedition XP + "Core Seeker" Badge', rewardValue: { boost: 15, badge: 'Core Seeker' } },
    { tier: 12, xpRequired: 15000, label: 'Vein Cracker', rewardType: 'xp_boost_badge',   rewardLabel: '+20% Expedition XP + "Vein Cracker" Badge', rewardValue: { boost: 20, badge: 'Vein Cracker' } },
    { tier: 13, xpRequired: 18000, label: 'Stonewright',  rewardType: 'xp_boost_badge',   rewardLabel: '+20% Expedition XP + "Stonewright" Badge', rewardValue: { boost: 20, badge: 'Stonewright' }  },
    { tier: 14, xpRequired: 21500, label: 'Bedrock Ward', rewardType: 'cosmetic_exclusive', rewardLabel: 'Carved Stone Board Skin', rewardValue: 'cosmetic_carved_stone_board' },
    { tier: 15, xpRequired: 25500, label: 'Obsidian Lord', rewardType: 'cosmetic_exclusive', rewardLabel: 'Ore Vein Piece Theme',    rewardValue: 'cosmetic_ore_vein_theme'    },
  ],

  forest: [
    { tier:  1, xpRequired:     0, label: 'Seedling',     rewardType: null,               rewardLabel: null },
    { tier:  2, xpRequired:   300, label: 'Sapling',      rewardType: 'xp_boost',         rewardLabel: '+5% Expedition XP',         rewardValue: 5   },
    { tier:  3, xpRequired:   700, label: 'Forager',      rewardType: 'xp_boost',         rewardLabel: '+5% Expedition XP',         rewardValue: 5   },
    { tier:  4, xpRequired:  1300, label: 'Tracker',      rewardType: 'xp_boost',         rewardLabel: '+10% Expedition XP',        rewardValue: 10  },
    { tier:  5, xpRequired:  2100, label: 'Ranger',       rewardType: 'xp_boost',         rewardLabel: '+10% Expedition XP',        rewardValue: 10  },
    { tier:  6, xpRequired:  3200, label: 'Woodcutter',   rewardType: 'cosmetic_common',  rewardLabel: 'Leaf Cell Style',           rewardValue: 'forest_leaf_cell'    },
    { tier:  7, xpRequired:  4500, label: 'Pathfinder',   rewardType: 'cosmetic_common',  rewardLabel: 'Bark Piece Skin',           rewardValue: 'forest_bark_skin'    },
    { tier:  8, xpRequired:  6000, label: 'Warden',       rewardType: 'cosmetic_common',  rewardLabel: 'Vine Cell Style',           rewardValue: 'forest_vine_cell'    },
    { tier:  9, xpRequired:  7800, label: 'Grove Keeper', rewardType: 'cosmetic_common',  rewardLabel: 'Mossy Piece Skin',          rewardValue: 'forest_mossy_skin'   },
    { tier: 10, xpRequired:  9900, label: 'Canopy Scout', rewardType: 'xp_boost_badge',   rewardLabel: '+15% Expedition XP + "Canopy Scout" Badge', rewardValue: { boost: 15, badge: 'Canopy Scout' }  },
    { tier: 11, xpRequired: 12300, label: 'Root Walker',  rewardType: 'xp_boost_badge',   rewardLabel: '+15% Expedition XP + "Root Walker" Badge',  rewardValue: { boost: 15, badge: 'Root Walker' }   },
    { tier: 12, xpRequired: 15000, label: 'Elder Bough',  rewardType: 'xp_boost_badge',   rewardLabel: '+20% Expedition XP + "Elder Bough" Badge',  rewardValue: { boost: 20, badge: 'Elder Bough' }   },
    { tier: 13, xpRequired: 18000, label: 'Forest Sage',  rewardType: 'xp_boost_badge',   rewardLabel: '+20% Expedition XP + "Forest Sage" Badge',  rewardValue: { boost: 20, badge: 'Forest Sage' }   },
    { tier: 14, xpRequired: 21500, label: 'Heartwood',    rewardType: 'cosmetic_exclusive', rewardLabel: 'Mossy Overgrown Board Skin', rewardValue: 'cosmetic_mossy_overgrown_board' },
    { tier: 15, xpRequired: 25500, label: 'World Tree',   rewardType: 'cosmetic_exclusive', rewardLabel: 'Leaf Block Piece Theme',      rewardValue: 'cosmetic_leaf_block_theme'     },
  ],

  nether: [
    { tier:  1, xpRequired:     0, label: 'Ember',        rewardType: null,               rewardLabel: null },
    { tier:  2, xpRequired:   300, label: 'Ignis',        rewardType: 'xp_boost',         rewardLabel: '+5% Expedition XP',         rewardValue: 5   },
    { tier:  3, xpRequired:   700, label: 'Blazer',       rewardType: 'xp_boost',         rewardLabel: '+5% Expedition XP',         rewardValue: 5   },
    { tier:  4, xpRequired:  1300, label: 'Inferno',      rewardType: 'xp_boost',         rewardLabel: '+10% Expedition XP',        rewardValue: 10  },
    { tier:  5, xpRequired:  2100, label: 'Pyromancer',   rewardType: 'xp_boost',         rewardLabel: '+10% Expedition XP',        rewardValue: 10  },
    { tier:  6, xpRequired:  3200, label: 'Lava Walker',  rewardType: 'cosmetic_common',  rewardLabel: 'Magma Cell Style',          rewardValue: 'nether_magma_cell'   },
    { tier:  7, xpRequired:  4500, label: 'Ash Drifter',  rewardType: 'cosmetic_common',  rewardLabel: 'Blaze Piece Skin',          rewardValue: 'nether_blaze_skin'   },
    { tier:  8, xpRequired:  6000, label: 'Soul Burner',  rewardType: 'cosmetic_common',  rewardLabel: 'Hellfire Cell Style',       rewardValue: 'nether_hellfire_cell' },
    { tier:  9, xpRequired:  7800, label: 'Netherbane',   rewardType: 'cosmetic_common',  rewardLabel: 'Crimson Piece Skin',        rewardValue: 'nether_crimson_skin'  },
    { tier: 10, xpRequired:  9900, label: 'Lava Diver',   rewardType: 'xp_boost_badge',   rewardLabel: '+15% Expedition XP + "Lava Diver" Badge',   rewardValue: { boost: 15, badge: 'Lava Diver' }    },
    { tier: 11, xpRequired: 12300, label: 'Char Fiend',   rewardType: 'xp_boost_badge',   rewardLabel: '+15% Expedition XP + "Char Fiend" Badge',   rewardValue: { boost: 15, badge: 'Char Fiend' }    },
    { tier: 12, xpRequired: 15000, label: 'Flame Warden', rewardType: 'xp_boost_badge',   rewardLabel: '+20% Expedition XP + "Flame Warden" Badge', rewardValue: { boost: 20, badge: 'Flame Warden' }  },
    { tier: 13, xpRequired: 18000, label: 'Infernal Lord', rewardType: 'xp_boost_badge',  rewardLabel: '+20% Expedition XP + "Infernal Lord" Badge', rewardValue: { boost: 20, badge: 'Infernal Lord' } },
    { tier: 14, xpRequired: 21500, label: 'Magma Throne',    rewardType: 'cosmetic_exclusive', rewardLabel: 'Obsidian Forge Board Skin', rewardValue: 'cosmetic_obsidian_forge_board' },
    { tier: 15, xpRequired: 25500, label: 'Lava Sovereign',  rewardType: 'cosmetic_exclusive', rewardLabel: 'Magma Piece Theme',          rewardValue: 'cosmetic_magma_theme'         },
  ],

  ice: [
    { tier:  1, xpRequired:     0, label: 'Frost Touched', rewardType: null,              rewardLabel: null },
    { tier:  2, xpRequired:   300, label: 'Snowdrifter',   rewardType: 'xp_boost',        rewardLabel: '+5% Expedition XP',         rewardValue: 5   },
    { tier:  3, xpRequired:   700, label: 'Glacier Born',  rewardType: 'xp_boost',        rewardLabel: '+5% Expedition XP',         rewardValue: 5   },
    { tier:  4, xpRequired:  1300, label: 'Permafrost',    rewardType: 'xp_boost',        rewardLabel: '+10% Expedition XP',        rewardValue: 10  },
    { tier:  5, xpRequired:  2100, label: 'Ice Fisher',    rewardType: 'xp_boost',        rewardLabel: '+10% Expedition XP',        rewardValue: 10  },
    { tier:  6, xpRequired:  3200, label: 'Frost Carver',  rewardType: 'cosmetic_common', rewardLabel: 'Frost Cell Style',          rewardValue: 'ice_frost_cell'       },
    { tier:  7, xpRequired:  4500, label: 'Tundra Seeker', rewardType: 'cosmetic_common', rewardLabel: 'Crystal Piece Skin',        rewardValue: 'ice_crystal_skin'     },
    { tier:  8, xpRequired:  6000, label: 'Glacier Scout', rewardType: 'cosmetic_common', rewardLabel: 'Aurora Cell Style',         rewardValue: 'ice_aurora_cell'      },
    { tier:  9, xpRequired:  7800, label: 'Blizzard Ward', rewardType: 'cosmetic_common', rewardLabel: 'Snowflake Piece Skin',      rewardValue: 'ice_snowflake_skin'   },
    { tier: 10, xpRequired:  9900, label: 'Cryo Scout',    rewardType: 'xp_boost_badge',  rewardLabel: '+15% Expedition XP + "Cryo Scout" Badge',   rewardValue: { boost: 15, badge: 'Cryo Scout' }    },
    { tier: 11, xpRequired: 12300, label: 'Ice Warden',    rewardType: 'xp_boost_badge',  rewardLabel: '+15% Expedition XP + "Ice Warden" Badge',   rewardValue: { boost: 15, badge: 'Ice Warden' }    },
    { tier: 12, xpRequired: 15000, label: 'Frost Sovereign', rewardType: 'xp_boost_badge', rewardLabel: '+20% Expedition XP + "Frost Sovereign" Badge', rewardValue: { boost: 20, badge: 'Frost Sovereign' } },
    { tier: 13, xpRequired: 18000, label: 'Absolute Zero', rewardType: 'xp_boost_badge',  rewardLabel: '+20% Expedition XP + "Absolute Zero" Badge', rewardValue: { boost: 20, badge: 'Absolute Zero' }  },
    { tier: 14, xpRequired: 21500, label: 'Glacier Throne', rewardType: 'cosmetic_exclusive', rewardLabel: 'Frozen Tundra Board Skin', rewardValue: 'cosmetic_frozen_tundra_board' },
    { tier: 15, xpRequired: 25500, label: 'Eternal Winter', rewardType: 'cosmetic_exclusive', rewardLabel: 'Crystal Piece Theme',       rewardValue: 'cosmetic_crystal_theme'      },
  ],
};

// ── Storage ───────────────────────────────────────────────────────────────────
// Lifetime keys — intentionally NOT tied to season so progress never resets.

var _BIOME_XP_KEY      = 'mineCtris_biomeRewardXP';      // { stone: 1200, forest: 0, ... }
var _BIOME_CLAIMED_KEY = 'mineCtris_biomeRewardClaimed';  // { stone: [1,2,3], forest: [], ... }

function _loadBiomeXP() {
  try { return JSON.parse(localStorage.getItem(_BIOME_XP_KEY) || '{}'); } catch (_) { return {}; }
}

function _saveBiomeXP(obj) {
  try { localStorage.setItem(_BIOME_XP_KEY, JSON.stringify(obj)); } catch (_) {}
}

function _loadClaimed() {
  try { return JSON.parse(localStorage.getItem(_BIOME_CLAIMED_KEY) || '{}'); } catch (_) { return {}; }
}

function _saveClaimed(obj) {
  try { localStorage.setItem(_BIOME_CLAIMED_KEY, JSON.stringify(obj)); } catch (_) {}
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function _getTierForXP(biomeId, totalXP) {
  var tiers = BIOME_REWARD_TRACKS[biomeId];
  if (!tiers) return null;
  var current = tiers[0];
  for (var i = 0; i < tiers.length; i++) {
    if (totalXP >= tiers[i].xpRequired) current = tiers[i];
  }
  return current;
}

function _getNextTier(biomeId, currentTierNum) {
  var tiers = BIOME_REWARD_TRACKS[biomeId];
  if (!tiers) return null;
  var idx = tiers.findIndex(function (t) { return t.tier === currentTierNum; });
  return (idx >= 0 && idx < tiers.length - 1) ? tiers[idx + 1] : null;
}

function _getTiersUnlocked(biomeId, xpBefore, xpAfter) {
  var tiers = BIOME_REWARD_TRACKS[biomeId];
  if (!tiers) return [];
  return tiers.filter(function (t) {
    return t.tier > 1 && xpBefore < t.xpRequired && xpAfter >= t.xpRequired;
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get current lifetime XP for a biome.
 * @param {string} biomeId
 * @returns {number}
 */
function getBiomeXP(biomeId) {
  var data = _loadBiomeXP();
  return data[biomeId] || 0;
}

/**
 * Award XP from an expedition run. XP formula: min(500, floor(score/100)).
 * An optional xpMultiplier (e.g. 2 for the featured biome bonus) is applied
 * after the base calculation, still capped at 500.
 * Returns an object describing what changed.
 *
 * @param {string} biomeId
 * @param {number} score
 * @param {number} [xpMultiplier=1]  Multiplier applied to base XP (capped at 500).
 * @returns {{ xpEarned: number, xpBefore: number, xpAfter: number, tiersUnlocked: Array }}
 */
function awardBiomeRunXP(biomeId, score, xpMultiplier) {
  var mult = (xpMultiplier && xpMultiplier > 0) ? xpMultiplier : 1;
  var baseXP = Math.min(500, Math.max(1, Math.floor((score || 0) / 100)));
  var xpEarned = Math.min(500, Math.round(baseXP * mult));
  var data     = _loadBiomeXP();
  var key      = String(biomeId);
  var xpBefore = data[key] || 0;
  var xpAfter  = xpBefore + xpEarned;
  data[key]    = xpAfter;
  _saveBiomeXP(data);

  var tiersUnlocked = _getTiersUnlocked(biomeId, xpBefore, xpAfter);

  return {
    xpEarned:      xpEarned,
    xpBefore:      xpBefore,
    xpAfter:       xpAfter,
    tiersUnlocked: tiersUnlocked,
  };
}

/**
 * Returns compact track state for a biome — used by results screen and info panel.
 *
 * @param {string} biomeId
 * @returns {{
 *   xp: number,
 *   currentTier: object,
 *   nextTier: object|null,
 *   pct: number,
 *   totalTiers: number,
 *   isMaxTier: boolean
 * }}
 */
function getBiomeTrackInfo(biomeId) {
  var xp          = getBiomeXP(biomeId);
  var currentTier = _getTierForXP(biomeId, xp);
  if (!currentTier) return null;
  var nextTier    = _getNextTier(biomeId, currentTier.tier);
  var pct = nextTier
    ? Math.min(100, Math.floor(((xp - currentTier.xpRequired) / (nextTier.xpRequired - currentTier.xpRequired)) * 100))
    : 100;
  return {
    xp:          xp,
    currentTier: currentTier,
    nextTier:    nextTier,
    pct:         pct,
    totalTiers:  (BIOME_REWARD_TRACKS[biomeId] || []).length,
    isMaxTier:   !nextTier,
  };
}

/**
 * Claim a reward for reaching a tier. Idempotent — safe to call multiple times.
 * Returns true if the reward was newly claimed, false if already claimed or invalid.
 *
 * @param {string} biomeId
 * @param {number} tierNum
 * @returns {boolean}
 */
function claimBiomeReward(biomeId, tierNum) {
  var tiers = BIOME_REWARD_TRACKS[biomeId];
  if (!tiers) return false;
  var tierDef = tiers.find(function (t) { return t.tier === tierNum; });
  if (!tierDef || !tierDef.rewardType) return false;

  // Check XP requirement
  var xp = getBiomeXP(biomeId);
  if (xp < tierDef.xpRequired) return false;

  // Idempotency check
  var claimed = _loadClaimed();
  var key = String(biomeId);
  if (!claimed[key]) claimed[key] = [];
  if (claimed[key].indexOf(tierNum) !== -1) return false; // already claimed

  claimed[key].push(tierNum);
  _saveClaimed(claimed);
  return true;
}

/**
 * Check if a tier's reward has been claimed.
 * @param {string} biomeId
 * @param {number} tierNum
 * @returns {boolean}
 */
function isBiomeRewardClaimed(biomeId, tierNum) {
  var claimed = _loadClaimed();
  var list = claimed[String(biomeId)] || [];
  return list.indexOf(tierNum) !== -1;
}

/**
 * Returns list of unlocked-but-unclaimed tier objects for a biome.
 * @param {string} biomeId
 * @returns {Array}
 */
function getPendingBiomeClaims(biomeId) {
  var xp    = getBiomeXP(biomeId);
  var tiers = BIOME_REWARD_TRACKS[biomeId] || [];
  return tiers.filter(function (t) {
    return t.rewardType && xp >= t.xpRequired && !isBiomeRewardClaimed(biomeId, t.tier);
  });
}

/**
 * Auto-claim all pending rewards for a biome. Called after awarding run XP.
 * Returns array of newly claimed tier objects.
 * @param {string} biomeId
 * @returns {Array}
 */
function autoClaimBiomeRewards(biomeId) {
  var pending = getPendingBiomeClaims(biomeId);
  var claimed = [];
  for (var i = 0; i < pending.length; i++) {
    if (claimBiomeReward(biomeId, pending[i].tier)) {
      claimed.push(pending[i]);
    }
  }
  return claimed;
}

// ── Compact track HTML (shared between results screen and map info panel) ─────

/**
 * Build the compact reward track bar HTML for a biome.
 * Shows tier name, XP, progress bar, and tier count.
 *
 * @param {string} biomeId
 * @param {string} [cssPrefix='exp-info'] — CSS class prefix for map info panel
 * @returns {string} HTML string
 */
function buildBiomeTrackHtml(biomeId, cssPrefix) {
  var info = getBiomeTrackInfo(biomeId);
  if (!info) return '';
  var p = cssPrefix || 'exp-info';
  var tierLabel = info.currentTier.label;
  var tierNum   = info.currentTier.tier;
  var total     = info.totalTiers;
  var nextLabel = info.nextTier
    ? 'Next: ' + info.nextTier.label + ' &mdash; ' + (info.nextTier.xpRequired - info.xp) + ' XP'
    : '&#9733; Track complete!';
  var rewardHtml = '';
  if (info.currentTier.rewardType && info.currentTier.rewardLabel) {
    rewardHtml =
      '<div class="' + p + '-track-reward">&#127873; ' + info.currentTier.rewardLabel + '</div>';
  }

  return (
    '<div class="' + p + '-track">' +
      '<div class="' + p + '-track-row">' +
        '<span class="' + p + '-tier-label">' + tierLabel + '</span>' +
        '<span class="' + p + '-tier-count">Tier ' + tierNum + '/' + total + '</span>' +
        '<span class="' + p + '-tier-xp">' + info.xp + ' XP</span>' +
      '</div>' +
      rewardHtml +
      '<div class="' + p + '-track-bar-wrap">' +
        '<div class="' + p + '-track-bar-fill" style="width:' + info.pct + '%"></div>' +
      '</div>' +
      '<div class="' + p + '-track-next' + (info.isMaxTier ? ' ' + p + '-track-max' : '') + '">' + nextLabel + '</div>' +
    '</div>'
  );
}
