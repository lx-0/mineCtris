// All loot item definitions for the Expeditions dungeon system, organized by category.
//
// Four loot categories: cosmetics (permanent unlocks), consumables (single-use),
// blueprints (workshop unlocks), fragments (collect N to forge Legendary).
//
// Requires: (none — pure data)
// Used by:  depths-loot.js (drop tables), loot-tables.js (catalog merge)

// ── Loot Categories ────────────────────────────────────────────────────────

var DEPTHS_LOOT_CATEGORY = {
  cosmetic:   'cosmetic',
  consumable: 'consumable',
  blueprint:  'blueprint',
  fragment:   'fragment',
};

// ── Cosmetic Sub-Categories ────────────────────────────────────────────────

var DEPTHS_COSMETIC_CATEGORY = {
  board_skin:   'board_skin',
  piece_theme:  'piece_theme',
  pickaxe_skin: 'pickaxe_skin',
  trail:        'trail',
  aura:         'aura',
  border:       'border',
  title:        'title',
  block_skin:   'block_skin',
};

// ── Board Skins (4 dungeon-themed) ─────────────────────────────────────────

var DEPTHS_BOARD_SKINS = [
  { id: 'depths_board_stone',      type: 'cosmetic', category: 'board_skin', name: 'Stone Cavern',      rarity: 'common',   icon: '\uD83E\uDEA8', description: 'Rough-hewn stone walls frame your board.',       assets: { boardKey: 'stone_cavern' } },
  { id: 'depths_board_magma',      type: 'cosmetic', category: 'board_skin', name: 'Magma Chamber',     rarity: 'rare',     icon: '\uD83C\uDF0B', description: 'Molten cracks glow between obsidian slabs.',     assets: { boardKey: 'magma_chamber' } },
  { id: 'depths_board_void',       type: 'cosmetic', category: 'board_skin', name: 'Void Rift',         rarity: 'epic',     icon: '\uD83D\uDD73\uFE0F', description: 'The board floats above an endless abyss.',       assets: { boardKey: 'void_rift' } },
  { id: 'depths_board_overgrowth', type: 'cosmetic', category: 'board_skin', name: 'Overgrowth Hollow', rarity: 'uncommon', icon: '\uD83C\uDF3F', description: 'Moss and vines creep along the board edges.',    assets: { boardKey: 'overgrowth_hollow' } },
];

// ── Piece Themes (3 sets matching dungeon tiers) ───────────────────────────

var DEPTHS_PIECE_THEMES = [
  { id: 'depths_pieces_shallow', type: 'cosmetic', category: 'piece_theme', name: 'Earthen Pieces',  rarity: 'uncommon', icon: '\uD83E\uDEA8', description: 'Stone and dirt textured pieces for shallow mines.', assets: { pieceThemeKey: 'earthen' } },
  { id: 'depths_pieces_deep',    type: 'cosmetic', category: 'piece_theme', name: 'Molten Pieces',   rarity: 'rare',     icon: '\uD83D\uDD25', description: 'Magma-veined pieces that glow from within.',       assets: { pieceThemeKey: 'molten' } },
  { id: 'depths_pieces_abyssal', type: 'cosmetic', category: 'piece_theme', name: 'Abyssal Pieces',  rarity: 'epic',     icon: '\uD83D\uDC9C', description: 'Void-touched pieces that shimmer with darkness.',   assets: { pieceThemeKey: 'abyssal' } },
];

// ── Pickaxe Skins (3 boss-drop exclusives) ─────────────────────────────────

var DEPTHS_BOSS_PICKAXES = [
  { id: 'depths_pick_creep',   type: 'cosmetic', category: 'pickaxe_skin', name: 'Vine-Wrapped Pickaxe', rarity: 'rare',      icon: '\u26CF', description: 'A pickaxe bound in living vines from The Creep.',      assets: { meshKey: 'pickaxe_creep' } },
  { id: 'depths_pick_furnace', type: 'cosmetic', category: 'pickaxe_skin', name: 'Molten Pickaxe',       rarity: 'epic',      icon: '\u26CF', description: 'Forged in The Furnace\'s heart. Drips with magma.',    assets: { meshKey: 'pickaxe_furnace' } },
  { id: 'depths_pick_wither',  type: 'cosmetic', category: 'pickaxe_skin', name: 'Void Reaver',          rarity: 'legendary', icon: '\u26CF', description: 'Torn from the Wither Storm. Warps reality around it.', assets: { meshKey: 'pickaxe_wither' } },
];

// ── Trail Effects (2 per tier = 6 total) ───────────────────────────────────

var DEPTHS_TRAILS = [
  // Shallow tier
  { id: 'depths_trail_pebble',  type: 'cosmetic', category: 'trail', name: 'Pebble Trail',  rarity: 'common',   icon: '\uD83E\uDEA8', description: 'Small stones scatter in your wake.',        assets: { trailKey: 'pebble' } },
  { id: 'depths_trail_moss',    type: 'cosmetic', category: 'trail', name: 'Moss Trail',    rarity: 'uncommon', icon: '\uD83C\uDF3F', description: 'A living carpet of moss follows each piece.', assets: { trailKey: 'moss' } },
  // Deep tier
  { id: 'depths_trail_ember',   type: 'cosmetic', category: 'trail', name: 'Ember Trail',   rarity: 'rare',     icon: '\uD83D\uDD25', description: 'Glowing embers drift behind each placement.', assets: { trailKey: 'ember' } },
  { id: 'depths_trail_magma',   type: 'cosmetic', category: 'trail', name: 'Magma Trail',   rarity: 'rare',     icon: '\uD83C\uDF0B', description: 'Molten droplets trail from every piece.',     assets: { trailKey: 'magma' } },
  // Abyssal tier
  { id: 'depths_trail_void',    type: 'cosmetic', category: 'trail', name: 'Void Trail',    rarity: 'epic',     icon: '\uD83D\uDD73\uFE0F', description: 'Reality tears briefly where pieces pass.',    assets: { trailKey: 'void' } },
  { id: 'depths_trail_wither',  type: 'cosmetic', category: 'trail', name: 'Wither Trail',  rarity: 'epic',     icon: '\uD83D\uDC80', description: 'Dark particles swirl and decay in your path.',  assets: { trailKey: 'wither' } },
];

// ── Aura Effects (1 Legendary per boss) ────────────────────────────────────

var DEPTHS_AURAS = [
  { id: 'depths_aura_creep',   type: 'cosmetic', category: 'aura', name: 'Overgrowth Aura',   rarity: 'legendary', icon: '\uD83C\uDF3F', description: 'Vines and spores orbit your board. The Creep\'s essence.',          assets: { auraKey: 'overgrowth', animated: true } },
  { id: 'depths_aura_furnace', type: 'cosmetic', category: 'aura', name: 'Inferno Aura',      rarity: 'legendary', icon: '\uD83D\uDD25', description: 'Flames and heat shimmer surround your board. The Furnace lives on.', assets: { auraKey: 'inferno', animated: true } },
  { id: 'depths_aura_wither',  type: 'cosmetic', category: 'aura', name: 'Void Corruption Aura', rarity: 'legendary', icon: '\uD83D\uDC9C', description: 'Void tendrils writhe at the edges. The Storm is never truly gone.',  assets: { auraKey: 'void_corruption', animated: true } },
];

// ── Consumables (single-use, usable at extract-or-descend screen) ──────────

var DEPTHS_CONSUMABLES = [
  { id: 'depths_consumable_extra_life',  type: 'consumable', name: 'Extra Life',  rarity: 'rare',     icon: '\u2764\uFE0F',  description: 'Revive once on board-fill death during a dungeon run.',                    useAt: 'extraction' },
  { id: 'depths_consumable_floor_skip',  type: 'consumable', name: 'Floor Skip',  rarity: 'epic',     icon: '\u23ED\uFE0F',  description: 'Skip the current floor and proceed to the next. Unlocked after 5 clears.', useAt: 'extraction' },
  { id: 'depths_consumable_loot_magnet', type: 'consumable', name: 'Loot Magnet', rarity: 'uncommon', icon: '\uD83E\uDDF2',  description: 'Double loot drops on the next floor.',                                      useAt: 'extraction' },
];

// ── Blueprints (workshop integration, 5 tiers) ────────────────────────────

var DEPTHS_BLUEPRINTS = [
  { id: 'depths_blueprint_reinforced_pick', type: 'blueprint', name: 'Reinforced Pickaxe Blueprint', rarity: 'common',    icon: '\uD83D\uDCDC', description: 'Craft a pickaxe that mines 20% faster.',                      workshopRecipe: { material: 'stone', cost: 50 } },
  { id: 'depths_blueprint_lucky_charm',     type: 'blueprint', name: 'Lucky Charm Blueprint',        rarity: 'uncommon',  icon: '\uD83D\uDCDC', description: 'Craft a charm that boosts rare drop rates by 5%.',            workshopRecipe: { material: 'iron', cost: 100 } },
  { id: 'depths_blueprint_depth_lantern',   type: 'blueprint', name: 'Depth Lantern Blueprint',      rarity: 'rare',      icon: '\uD83D\uDCDC', description: 'Craft a lantern that reveals hidden loot on floors.',         workshopRecipe: { material: 'gold', cost: 200 } },
  { id: 'depths_blueprint_magma_shield',    type: 'blueprint', name: 'Magma Shield Blueprint',       rarity: 'epic',      icon: '\uD83D\uDCDC', description: 'Craft a shield that blocks one boss mechanic per encounter.', workshopRecipe: { material: 'diamond', cost: 400 } },
  { id: 'depths_blueprint_void_compass',    type: 'blueprint', name: 'Void Compass Blueprint',       rarity: 'legendary', icon: '\uD83D\uDCDC', description: 'Craft a compass that guarantees a Legendary fragment drop.', workshopRecipe: { material: 'netherite', cost: 800 } },
];

// ── Fragments (collect N to forge a Legendary, 1 per boss) ─────────────────

var DEPTHS_FRAGMENTS = [
  { id: 'depths_frag_creep',   type: 'fragment', name: 'Overgrowth Fragment',  rarity: 'uncommon', icon: '\uD83C\uDF3F', description: 'A shard of living wood pulsing with green energy.', forgeTarget: 'depths_aura_creep',   forgeCount: 10 },
  { id: 'depths_frag_furnace', type: 'fragment', name: 'Molten Fragment',      rarity: 'uncommon', icon: '\uD83D\uDD25', description: 'A glowing ember that never cools.',                forgeTarget: 'depths_aura_furnace', forgeCount: 10 },
  { id: 'depths_frag_wither',  type: 'fragment', name: 'Void Fragment',        rarity: 'rare',     icon: '\uD83D\uDD73\uFE0F', description: 'A splinter of the void, humming with dark power.', forgeTarget: 'depths_aura_wither',  forgeCount: 8 },
];

// ── Boss First-Kill Rewards (unique cosmetic per boss, one-time) ───────────

var DEPTHS_BOSS_FIRST_KILL_REWARDS = {
  the_creep:        { id: 'depths_fk_creep',        type: 'cosmetic', category: 'pickaxe_skin', name: 'Vine-Wrapped Pickaxe', rarity: 'rare',      icon: '\u26CF',       assets: { meshKey: 'pickaxe_creep' } },
  cave_crawler:     { id: 'depths_fk_cave_crawler',  type: 'cosmetic', category: 'title',        name: 'Tunnel Rat',           rarity: 'rare',      icon: '\uD83D\uDC00', assets: { displayText: 'Tunnel Rat', nameColor: '#a3a3a3' } },
  the_furnace:      { id: 'depths_fk_furnace',       type: 'cosmetic', category: 'pickaxe_skin', name: 'Molten Pickaxe',       rarity: 'epic',      icon: '\u26CF',       assets: { meshKey: 'pickaxe_furnace' } },
  piece_storm:      { id: 'depths_fk_piece_storm',   type: 'cosmetic', category: 'title',        name: 'Storm Breaker',        rarity: 'epic',      icon: '\u26A1',       assets: { displayText: 'Storm Breaker', nameColor: '#fbbf24' } },
  the_wither_storm: { id: 'depths_fk_wither_storm',  type: 'cosmetic', category: 'pickaxe_skin', name: 'Void Reaver',          rarity: 'legendary', icon: '\u26CF',       assets: { meshKey: 'pickaxe_wither' } },
  the_core:         { id: 'depths_fk_core',           type: 'cosmetic', category: 'title',        name: 'Core Conqueror',       rarity: 'legendary', icon: '\uD83C\uDF0B', assets: { displayText: 'Core Conqueror', nameColor: '#ef4444' } },
};

// ── Tier-scoped drop pools ─────────────────────────────────────────────────
// Items available per dungeon tier. Higher tiers include lower-tier items.

var DEPTHS_TIER_ITEMS = {
  shallow: [].concat(
    DEPTHS_BOARD_SKINS.filter(function (i) { return i.rarity === 'common' || i.rarity === 'uncommon'; }),
    DEPTHS_PIECE_THEMES.filter(function (i) { return i.rarity === 'uncommon'; }),
    DEPTHS_TRAILS.filter(function (i) { return i.rarity === 'common' || i.rarity === 'uncommon'; }),
    DEPTHS_CONSUMABLES,
    DEPTHS_BLUEPRINTS.filter(function (i) { return i.rarity === 'common' || i.rarity === 'uncommon'; }),
    DEPTHS_FRAGMENTS.filter(function (i) { return i.rarity === 'uncommon'; })
  ),
  deep: [].concat(
    DEPTHS_BOARD_SKINS.filter(function (i) { return i.rarity !== 'legendary'; }),
    DEPTHS_PIECE_THEMES,
    DEPTHS_BOSS_PICKAXES.filter(function (i) { return i.rarity === 'rare' || i.rarity === 'epic'; }),
    DEPTHS_TRAILS,
    DEPTHS_CONSUMABLES,
    DEPTHS_BLUEPRINTS.filter(function (i) { return i.rarity !== 'legendary'; }),
    DEPTHS_FRAGMENTS
  ),
  abyssal: [].concat(
    DEPTHS_BOARD_SKINS,
    DEPTHS_PIECE_THEMES,
    DEPTHS_BOSS_PICKAXES,
    DEPTHS_TRAILS,
    DEPTHS_AURAS,
    DEPTHS_CONSUMABLES,
    DEPTHS_BLUEPRINTS,
    DEPTHS_FRAGMENTS
  ),
};

// ── Full item list (all items across all categories) ───────────────────────

var DEPTHS_ALL_ITEMS = [].concat(
  DEPTHS_BOARD_SKINS,
  DEPTHS_PIECE_THEMES,
  DEPTHS_BOSS_PICKAXES,
  DEPTHS_TRAILS,
  DEPTHS_AURAS,
  DEPTHS_CONSUMABLES,
  DEPTHS_BLUEPRINTS,
  DEPTHS_FRAGMENTS
);

// ── Fragment forge recipes (lookup by target) ──────────────────────────────

var DEPTHS_FORGE_RECIPES = {};
(function _buildForgeRecipes() {
  for (var i = 0; i < DEPTHS_FRAGMENTS.length; i++) {
    var frag = DEPTHS_FRAGMENTS[i];
    DEPTHS_FORGE_RECIPES[frag.forgeTarget] = {
      fragmentId:   frag.id,
      fragmentName: frag.name,
      targetId:     frag.forgeTarget,
      count:        frag.forgeCount,
    };
  }
})();
