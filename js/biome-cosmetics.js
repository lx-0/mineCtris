// Biome-exclusive Cosmetics — equip system and UI panel.
//
// 8 cosmetics unlock through expedition reward tracks (tiers 14 & 15 per biome):
//   Stone:  Carved Stone Board Skin (tier 14), Ore Vein Piece Theme (tier 15)
//   Forest: Mossy Overgrown Board Skin (tier 14), Leaf Block Piece Theme (tier 15)
//   Nether: Obsidian Forge Board Skin (tier 14), Magma Piece Theme (tier 15)
//   Ice:    Frozen Tundra Board Skin (tier 14), Crystal Piece Theme (tier 15)
//
// Equipping a biome cosmetic sets activeTheme to the cosmetic's ID, which hooks
// into the existing material-swap pipeline in world.js / settings.js.
// Only one biome cosmetic can be equipped at a time.
//
// Depends on: config.js (COSMETIC_* palettes), state.js (activeTheme),
//             world.js (createBlockMesh), settings.js (applyTheme),
//             expedition-reward-tracks.js (BIOME_REWARD_TRACKS, isBiomeRewardClaimed)

// ── Registry ──────────────────────────────────────────────────────────────────

const BIOME_COSMETICS = [
  {
    id:       'cosmetic_carved_stone_board',
    name:     'Carved Stone Board Skin',
    type:     'board_skin',
    biome:    'stone',
    tier:     14,
    icon:     '&#129704;',
    desc:     'Hewn ashlar and chiselled flagstone. Exclusive to Stone tier 14.',
  },
  {
    id:       'cosmetic_ore_vein_theme',
    name:     'Ore Vein Piece Theme',
    type:     'piece_theme',
    biome:    'stone',
    tier:     15,
    icon:     '&#128142;',
    desc:     'Gold, lapis, emerald, redstone, amethyst, diamond — every ore in the vein. Exclusive to Stone tier 15.',
  },
  {
    id:       'cosmetic_mossy_overgrown_board',
    name:     'Mossy Overgrown Board Skin',
    type:     'board_skin',
    biome:    'forest',
    tier:     14,
    icon:     '&#127807;',
    desc:     'Ruins consumed by thick moss and amber resin. Exclusive to Forest tier 14.',
  },
  {
    id:       'cosmetic_leaf_block_theme',
    name:     'Leaf Block Piece Theme',
    type:     'piece_theme',
    biome:    'forest',
    tier:     15,
    icon:     '&#127809;',
    desc:     'Oak, spruce, acacia, birch, jungle, autumn — every leaf block in bloom. Exclusive to Forest tier 15.',
  },
  {
    id:       'cosmetic_obsidian_forge_board',
    name:     'Obsidian Forge Board Skin',
    type:     'board_skin',
    biome:    'nether',
    tier:     14,
    icon:     '&#128293;',
    desc:     'Dark obsidian and forge-fire glow. Exclusive to Nether tier 14.',
  },
  {
    id:       'cosmetic_magma_theme',
    name:     'Magma Piece Theme',
    type:     'piece_theme',
    biome:    'nether',
    tier:     15,
    icon:     '&#127755;',
    desc:     'Cooled crust to lava core — magma in every stage. Exclusive to Nether tier 15.',
  },
  {
    id:       'cosmetic_frozen_tundra_board',
    name:     'Frozen Tundra Board Skin',
    type:     'board_skin',
    biome:    'ice',
    tier:     14,
    icon:     '&#10052;',
    desc:     'Packed ice, blue ice and snowflakes across the tundra. Exclusive to Ice tier 14.',
  },
  {
    id:       'cosmetic_crystal_theme',
    name:     'Crystal Piece Theme',
    type:     'piece_theme',
    biome:    'ice',
    tier:     15,
    icon:     '&#128167;',
    desc:     'Amethyst, sapphire, topaz, aquamarine, emerald, ruby, lavender, ice crystal. Exclusive to Ice tier 15.',
  },
];

// Human-readable biome labels and icons.
const _BIOME_META = {
  stone:  { label: 'Stone',  icon: '&#9935;'  },
  forest: { label: 'Forest', icon: '&#127795;' },
  nether: { label: 'Nether', icon: '&#128293;' },
  ice:    { label: 'Ice',    icon: '&#10052;'  },
};

// ── Storage ───────────────────────────────────────────────────────────────────

var _BC_EQUIPPED_KEY = 'mineCtris_equippedBiomeCosmetic';

function _loadEquippedBiomeCosmetic() {
  try { return localStorage.getItem(_BC_EQUIPPED_KEY) || null; } catch (_) { return null; }
}

function _saveEquippedBiomeCosmetic(id) {
  try {
    if (id) localStorage.setItem(_BC_EQUIPPED_KEY, id);
    else    localStorage.removeItem(_BC_EQUIPPED_KEY);
  } catch (_) {}
}

// ── Unlock check ─────────────────────────────────────────────────────────────

/**
 * Return true if the player has claimed the reward that grants this cosmetic.
 * Looks up the matching tier in BIOME_REWARD_TRACKS and checks isBiomeRewardClaimed.
 */
function isBiomeCosmeticUnlocked(cosmeticId) {
  var def = BIOME_COSMETICS.find(function(c) { return c.id === cosmeticId; });
  if (!def) return false;
  if (typeof isBiomeRewardClaimed !== 'function') return false;
  return isBiomeRewardClaimed(def.biome, def.tier);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns the currently equipped biome cosmetic ID, or null. */
function getEquippedBiomeCosmetic() {
  return _loadEquippedBiomeCosmetic();
}

/**
 * Equip a biome cosmetic (or toggle it off if already equipped).
 * Hooks into activeTheme so all block materials update immediately.
 * @param {string|null} cosmeticId
 */
function equipBiomeCosmetic(cosmeticId) {
  var prev = _loadEquippedBiomeCosmetic();

  // If toggling off or swapping away from current, restore the player's saved theme first.
  if (prev) {
    _restoreSavedTheme();
  }

  if (!cosmeticId || cosmeticId === prev) {
    _saveEquippedBiomeCosmetic(null);
    _renderBiomeCosmeticsPanel();
    return;
  }

  if (!isBiomeCosmeticUnlocked(cosmeticId)) return;

  _saveEquippedBiomeCosmetic(cosmeticId);

  // Apply via the material-swap pipeline — same mechanism as diamond_season theme.
  _applyBiomeCosmeticTheme(cosmeticId);
  _renderBiomeCosmeticsPanel();
}

/**
 * Re-apply the equipped biome cosmetic after scene init (call from main.js).
 */
function restoreBiomeCosmetic() {
  var equipped = _loadEquippedBiomeCosmetic();
  if (!equipped) return;
  if (!isBiomeCosmeticUnlocked(equipped)) {
    _saveEquippedBiomeCosmetic(null);
    return;
  }
  _applyBiomeCosmeticTheme(equipped);
}

// ── Internal ──────────────────────────────────────────────────────────────────

function _applyBiomeCosmeticTheme(cosmeticId) {
  // Map cosmetic IDs to the matching COSMETIC_* palette constants.
  var PALETTE_MAP = {
    cosmetic_carved_stone_board:   (typeof COSMETIC_CARVED_STONE_COLORS   !== 'undefined' ? COSMETIC_CARVED_STONE_COLORS   : null),
    cosmetic_ore_vein_theme:       (typeof COSMETIC_ORE_VEIN_COLORS       !== 'undefined' ? COSMETIC_ORE_VEIN_COLORS       : null),
    cosmetic_mossy_overgrown_board:(typeof COSMETIC_MOSSY_OVERGROWN_COLORS !== 'undefined' ? COSMETIC_MOSSY_OVERGROWN_COLORS : null),
    cosmetic_leaf_block_theme:     (typeof COSMETIC_LEAF_BLOCK_COLORS     !== 'undefined' ? COSMETIC_LEAF_BLOCK_COLORS     : null),
    cosmetic_obsidian_forge_board: (typeof COSMETIC_OBSIDIAN_FORGE_COLORS !== 'undefined' ? COSMETIC_OBSIDIAN_FORGE_COLORS : null),
    cosmetic_magma_theme:          (typeof COSMETIC_MAGMA_COLORS          !== 'undefined' ? COSMETIC_MAGMA_COLORS          : null),
    cosmetic_frozen_tundra_board:  (typeof COSMETIC_FROZEN_TUNDRA_COLORS  !== 'undefined' ? COSMETIC_FROZEN_TUNDRA_COLORS  : null),
    cosmetic_crystal_theme:        (typeof COSMETIC_CRYSTAL_COLORS        !== 'undefined' ? COSMETIC_CRYSTAL_COLORS        : null),
  };

  var palette = PALETTE_MAP[cosmeticId];
  if (!palette) return;

  // Set the global activeTheme — new blocks will pick this up via createBlockMesh.
  activeTheme = cosmeticId;

  // Swap materials on all existing block meshes (skip when colorblind mode is on).
  if (!colorblindMode && typeof createBlockMaterial === 'function') {
    var groups = [];
    if (typeof worldGroup !== 'undefined' && worldGroup) groups.push(worldGroup);
    if (typeof fallingPiecesGroup !== 'undefined' && fallingPiecesGroup) groups.push(fallingPiecesGroup);
    groups.forEach(function(group) {
      group.traverse(function(obj) {
        if (!obj.userData || !obj.userData.isBlock) return;
        var canonHex = obj.userData.canonicalColor;
        if (canonHex === undefined) return;
        var idx = typeof COLOR_TO_INDEX !== 'undefined' ? COLOR_TO_INDEX[canonHex] : undefined;
        var newMat = (idx !== undefined && palette[idx] != null)
          ? createBlockMaterial(palette[idx])
          : createBlockMaterial(canonHex);
        obj.material = newMat;
        obj.userData.originalColor = newMat.color.clone();
      });
    });
  }

  if (typeof updateNextPiecesHUD === 'function') updateNextPiecesHUD();
}

function _restoreSavedTheme() {
  var savedTheme = 'classic';
  try {
    var raw = localStorage.getItem('mineCtris_theme');
    if (raw) savedTheme = raw;
  } catch (_) {}
  if (typeof applyTheme === 'function') applyTheme(savedTheme);
}

// ── Panel UI ──────────────────────────────────────────────────────────────────

function openBiomeCosmeticsPanel() {
  var overlay = document.getElementById('biome-cosmetics-overlay');
  if (overlay) overlay.style.display = 'flex';
  _renderBiomeCosmeticsPanel();
}

function closeBiomeCosmeticsPanel() {
  var overlay = document.getElementById('biome-cosmetics-overlay');
  if (overlay) overlay.style.display = 'none';
}

function _renderBiomeCosmeticsPanel() {
  var panel = document.getElementById('biome-cosmetics-panel-body');
  if (!panel) return;

  var equipped = _loadEquippedBiomeCosmetic();
  var html = '';

  // Group by biome.
  var biomes = ['stone', 'forest', 'nether', 'ice'];
  biomes.forEach(function(biomeId) {
    var meta  = _BIOME_META[biomeId] || { label: biomeId, icon: '' };
    var items = BIOME_COSMETICS.filter(function(c) { return c.biome === biomeId; });

    html += '<div class="bc-biome-section">';
    html += '<div class="bc-biome-header">' + meta.icon + ' ' + meta.label + ' Biome</div>';

    items.forEach(function(cosmetic) {
      var unlocked   = isBiomeCosmeticUnlocked(cosmetic.id);
      var isEquipped = equipped === cosmetic.id;

      // Tier requirement info for tooltip / locked display.
      var tierTrack = (typeof BIOME_REWARD_TRACKS !== 'undefined' && BIOME_REWARD_TRACKS[biomeId])
        ? BIOME_REWARD_TRACKS[biomeId].find(function(t) { return t.tier === cosmetic.tier; })
        : null;
      var xpRequired = tierTrack ? tierTrack.xpRequired : '?';
      var tierLabel  = tierTrack ? tierTrack.label : ('Tier ' + cosmetic.tier);
      var currentXP  = (typeof getBiomeXP === 'function') ? getBiomeXP(biomeId) : 0;

      var rowCls = 'bc-cosmetic-row';
      if (unlocked)   rowCls += ' bc-cosmetic-unlocked';
      if (isEquipped) rowCls += ' bc-cosmetic-equipped';
      if (!unlocked)  rowCls += ' bc-cosmetic-locked';

      var typeLabel = cosmetic.type === 'board_skin' ? 'Board Skin' : 'Piece Theme';
      var typeCls   = cosmetic.type === 'board_skin' ? 'bc-type-board' : 'bc-type-piece';

      html += '<div class="' + rowCls + '" title="' + _escBc(cosmetic.desc) + '">';

      // Icon + name column
      html += '<div class="bc-cosmetic-icon">' + cosmetic.icon + '</div>';
      html += '<div class="bc-cosmetic-info">';
      html += '<div class="bc-cosmetic-name">' + _escBc(cosmetic.name) + '</div>';
      html += '<div class="bc-cosmetic-meta">';
      html += '<span class="bc-type-badge ' + typeCls + '">' + typeLabel + '</span>';
      if (!unlocked) {
        var xpLeft = Math.max(0, xpRequired - currentXP);
        html += '<span class="bc-lock-hint">&#128274; ' +
          meta.label + ' Tier ' + cosmetic.tier + ' (' + _escBc(tierLabel) + ')' +
          (xpLeft > 0 ? ' &mdash; ' + xpLeft + ' XP needed' : '') + '</span>';
      }
      html += '</div>';
      html += '<div class="bc-cosmetic-desc">' + _escBc(cosmetic.desc) + '</div>';
      html += '</div>'; // .bc-cosmetic-info

      // Action column
      html += '<div class="bc-cosmetic-actions">';
      if (unlocked) {
        html += '<button class="bc-equip-btn' + (isEquipped ? ' bc-equip-btn-active' : '') +
          '" onclick="equipBiomeCosmetic(\'' + cosmetic.id + '\')">' +
          (isEquipped ? 'Equipped &#10003;' : 'Equip') +
          '</button>';
      } else {
        html += '<span class="bc-locked-label">&#128274; Locked</span>';
      }
      html += '</div>'; // .bc-cosmetic-actions

      html += '</div>'; // .bc-cosmetic-row
    });

    html += '</div>'; // .bc-biome-section
  });

  panel.innerHTML = html;
}

function _escBc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────

function initBiomeCosmeticsPanel() {
  var closeBtn = document.getElementById('biome-cosmetics-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeBiomeCosmeticsPanel);

  var openBtn = document.getElementById('mode-biome-cosmetics-btn');
  if (openBtn) openBtn.addEventListener('click', openBiomeCosmeticsPanel);
}
