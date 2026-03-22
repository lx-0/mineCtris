// Dungeon configuration schema for the Expeditions system.
// Defines dungeon definitions, floor templates, and the modifier registry.
// Extensible: add new dungeons/modifiers by appending to the registries.
//
// Requires: config.js (BLOCK_TYPES, hazard constants)
// Used by: depths-state.js (session management), depths-floor-gen.js (run generation)

// ── Difficulty tiers ─────────────────────────────────────────────────────────
// Each dungeon belongs to one of three tiers that governs baseline difficulty.

var DUNGEON_TIER_SHALLOW = 'shallow';
var DUNGEON_TIER_DEEP    = 'deep';
var DUNGEON_TIER_ABYSSAL = 'abyssal';

var DUNGEON_TIERS = {
  shallow: { label: 'Shallow',  color: '#6ee7b7', baseGravityMult: 1.0, basePieceSpeed: 1.0 },
  deep:    { label: 'Deep',     color: '#fbbf24', baseGravityMult: 1.3, basePieceSpeed: 1.2 },
  abyssal: { label: 'Abyssal',  color: '#ef4444', baseGravityMult: 1.6, basePieceSpeed: 1.5 },
};

// ── Modifier registry ────────────────────────────────────────────────────────
// Each modifier has a unique id, display info, tier compatibility, and
// stacking rules. Modifiers are applied per-floor and affect gameplay.
//
// compatibleTiers: which dungeon tiers can roll this modifier.
// stackable: whether the same modifier can appear on consecutive floors.
// exclusive: array of modifier ids that cannot co-exist on the same floor.

var DUNGEON_MODIFIER_REGISTRY = {
  narrow_corridor: {
    id:              'narrow_corridor',
    name:            'Narrow Corridor',
    description:     'Board width reduced by 2 columns.',
    effect:          'boardWidth',
    effectValue:     -2,
    compatibleTiers: [DUNGEON_TIER_SHALLOW, DUNGEON_TIER_DEEP, DUNGEON_TIER_ABYSSAL],
    stackable:       false,
    exclusive:       [],
  },
  fog_of_war: {
    id:              'fog_of_war',
    name:            'Fog of War',
    description:     'Blocks beyond 5 rows from the bottom are dimmed.',
    effect:          'visibility',
    effectValue:     5,
    compatibleTiers: [DUNGEON_TIER_SHALLOW, DUNGEON_TIER_DEEP, DUNGEON_TIER_ABYSSAL],
    stackable:       false,
    exclusive:       [],
  },
  piece_drought: {
    id:              'piece_drought',
    name:            'Piece Drought',
    description:     'One random piece type is removed from the queue.',
    effect:          'pieceRemoval',
    effectValue:     1,
    compatibleTiers: [DUNGEON_TIER_DEEP, DUNGEON_TIER_ABYSSAL],
    stackable:       false,
    exclusive:       [],
  },
  gravity_flux: {
    id:              'gravity_flux',
    name:            'Gravity Flux',
    description:     'Fall speed oscillates sinusoidally between 0.5x and 2x.',
    effect:          'gravityWave',
    effectValue:     { min: 0.5, max: 2.0, periodSecs: 8 },
    compatibleTiers: [DUNGEON_TIER_DEEP, DUNGEON_TIER_ABYSSAL],
    stackable:       false,
    exclusive:       [],
  },
  obsidian_veins: {
    id:              'obsidian_veins',
    name:            'Obsidian Veins',
    description:     'Random blocks in pieces become obsidian (8 hits to mine).',
    effect:          'blockReplace',
    effectValue:     { material: 'obsidian', chance: 0.15 },
    compatibleTiers: [DUNGEON_TIER_DEEP, DUNGEON_TIER_ABYSSAL],
    stackable:       false,
    exclusive:       [],
  },
  mirror_world: {
    id:              'mirror_world',
    name:            'Mirror World',
    description:     'Horizontal controls are inverted.',
    effect:          'invertControls',
    effectValue:     true,
    compatibleTiers: [DUNGEON_TIER_SHALLOW, DUNGEON_TIER_DEEP, DUNGEON_TIER_ABYSSAL],
    stackable:       false,
    exclusive:       [],
  },
};

// ── Floor templates ──────────────────────────────────────────────────────────
// Templates define per-floor configuration. Dungeons reference templates by id.
// Each template specifies modifier pool, piece palette, gravity, hazards,
// and a clear condition (the goal to advance).
//
// clearCondition types:
//   { type: 'clear_lines', count: N }
//   { type: 'survive_time', seconds: N }
//   { type: 'mine_blocks', count: N }

var DUNGEON_FLOOR_TEMPLATES = {
  // ── Shallow tier floors ────────────────────────────────────────────────────
  shallow_1: {
    id:                   'shallow_1',
    floorNumber:          1,
    tier:                 DUNGEON_TIER_SHALLOW,
    modifierPool:         ['narrow_corridor', 'fog_of_war', 'mirror_world'],
    modifierCount:        0,
    piecePaletteOverride: null,
    gravityMultiplier:    1.0,
    hazardBlockWeights:   { crumble: 1 },
    clearCondition:       { type: 'clear_lines', count: 5 },
    timeLimitSecs:        120,
  },
  shallow_2: {
    id:                   'shallow_2',
    floorNumber:          2,
    tier:                 DUNGEON_TIER_SHALLOW,
    modifierPool:         ['narrow_corridor', 'fog_of_war', 'mirror_world'],
    modifierCount:        1,
    piecePaletteOverride: null,
    gravityMultiplier:    1.0,
    hazardBlockWeights:   { crumble: 2 },
    clearCondition:       { type: 'clear_lines', count: 8 },
    timeLimitSecs:        110,
  },
  shallow_3: {
    id:                   'shallow_3',
    floorNumber:          3,
    tier:                 DUNGEON_TIER_SHALLOW,
    modifierPool:         ['narrow_corridor', 'fog_of_war', 'mirror_world'],
    modifierCount:        1,
    piecePaletteOverride: null,
    gravityMultiplier:    1.1,
    hazardBlockWeights:   { crumble: 3 },
    clearCondition:       { type: 'clear_lines', count: 12 },
    timeLimitSecs:        100,
  },

  // ── Deep tier floors ───────────────────────────────────────────────────────
  deep_1: {
    id:                   'deep_1',
    floorNumber:          1,
    tier:                 DUNGEON_TIER_DEEP,
    modifierPool:         ['narrow_corridor', 'fog_of_war', 'piece_drought', 'gravity_flux', 'mirror_world'],
    modifierCount:        1,
    piecePaletteOverride: null,
    gravityMultiplier:    1.3,
    hazardBlockWeights:   { crumble: 3, magma: 1 },
    clearCondition:       { type: 'clear_lines', count: 10 },
    timeLimitSecs:        100,
  },
  deep_2: {
    id:                   'deep_2',
    floorNumber:          2,
    tier:                 DUNGEON_TIER_DEEP,
    modifierPool:         ['narrow_corridor', 'fog_of_war', 'piece_drought', 'gravity_flux', 'obsidian_veins', 'mirror_world'],
    modifierCount:        1,
    piecePaletteOverride: null,
    gravityMultiplier:    1.4,
    hazardBlockWeights:   { crumble: 3, magma: 2 },
    clearCondition:       { type: 'clear_lines', count: 15 },
    timeLimitSecs:        90,
  },
  deep_3: {
    id:                   'deep_3',
    floorNumber:          3,
    tier:                 DUNGEON_TIER_DEEP,
    modifierPool:         ['piece_drought', 'gravity_flux', 'obsidian_veins', 'mirror_world'],
    modifierCount:        2,
    piecePaletteOverride: null,
    gravityMultiplier:    1.5,
    hazardBlockWeights:   { crumble: 4, magma: 3 },
    clearCondition:       { type: 'mine_blocks', count: 20 },
    timeLimitSecs:        80,
  },
  deep_4: {
    id:                   'deep_4',
    floorNumber:          4,
    tier:                 DUNGEON_TIER_DEEP,
    modifierPool:         ['piece_drought', 'gravity_flux', 'obsidian_veins'],
    modifierCount:        2,
    piecePaletteOverride: ['stone', 'lava', 'obsidian'],
    gravityMultiplier:    1.6,
    hazardBlockWeights:   { crumble: 4, magma: 3, void_block: 1 },
    clearCondition:       { type: 'survive_time', seconds: 60 },
    timeLimitSecs:        90,
  },

  // ── Abyssal tier floors ────────────────────────────────────────────────────
  abyssal_1: {
    id:                   'abyssal_1',
    floorNumber:          1,
    tier:                 DUNGEON_TIER_ABYSSAL,
    modifierPool:         ['narrow_corridor', 'fog_of_war', 'piece_drought', 'gravity_flux', 'obsidian_veins', 'mirror_world'],
    modifierCount:        2,
    piecePaletteOverride: null,
    gravityMultiplier:    1.6,
    hazardBlockWeights:   { crumble: 4, magma: 3, void_block: 1 },
    clearCondition:       { type: 'clear_lines', count: 20 },
    timeLimitSecs:        80,
  },
  abyssal_2: {
    id:                   'abyssal_2',
    floorNumber:          2,
    tier:                 DUNGEON_TIER_ABYSSAL,
    modifierPool:         ['piece_drought', 'gravity_flux', 'obsidian_veins', 'mirror_world'],
    modifierCount:        2,
    piecePaletteOverride: ['lava', 'obsidian', 'crystal'],
    gravityMultiplier:    1.8,
    hazardBlockWeights:   { crumble: 4, magma: 4, void_block: 2 },
    clearCondition:       { type: 'clear_lines', count: 25 },
    timeLimitSecs:        70,
  },
  abyssal_3: {
    id:                   'abyssal_3',
    floorNumber:          3,
    tier:                 DUNGEON_TIER_ABYSSAL,
    modifierPool:         ['piece_drought', 'gravity_flux', 'obsidian_veins', 'mirror_world'],
    modifierCount:        2,
    piecePaletteOverride: ['lava', 'obsidian', 'crystal'],
    gravityMultiplier:    2.0,
    hazardBlockWeights:   { crumble: 5, magma: 4, void_block: 2 },
    clearCondition:       { type: 'mine_blocks', count: 30 },
    timeLimitSecs:        70,
  },
  abyssal_boss: {
    id:                   'abyssal_boss',
    floorNumber:          4,
    tier:                 DUNGEON_TIER_ABYSSAL,
    modifierPool:         [],
    modifierCount:        0,
    piecePaletteOverride: ['lava', 'obsidian'],
    gravityMultiplier:    2.0,
    hazardBlockWeights:   { crumble: 4, magma: 4, void_block: 3 },
    clearCondition:       { type: 'survive_time', seconds: 90 },
    timeLimitSecs:        120,
  },
};

// ── Dungeon definitions ──────────────────────────────────────────────────────
// Each dungeon is a named sequence of floor templates with loot and boss info.

var DUNGEON_DEFINITIONS = {
  shallow_mines: {
    id:               'shallow_mines',
    name:             'Shallow Mines',
    tier:             DUNGEON_TIER_SHALLOW,
    floorCount:       3,
    floors:           ['shallow_1', 'shallow_2', 'shallow_3'],
    allowedModifiers: ['narrow_corridor', 'fog_of_war', 'mirror_world'],
    lootTable:        'shallow_loot',
    bossSlot:         { floor: 3, bossId: 'the_creep' },
  },
  deep_caverns: {
    id:               'deep_caverns',
    name:             'Deep Caverns',
    tier:             DUNGEON_TIER_DEEP,
    floorCount:       4,
    floors:           ['deep_1', 'deep_2', 'deep_3', 'deep_4'],
    allowedModifiers: ['narrow_corridor', 'fog_of_war', 'piece_drought', 'gravity_flux', 'obsidian_veins', 'mirror_world'],
    lootTable:        'deep_loot',
    bossSlot:         { floor: 4, bossId: 'the_furnace' },
  },
  abyssal_rift: {
    id:               'abyssal_rift',
    name:             'Abyssal Rift',
    tier:             DUNGEON_TIER_ABYSSAL,
    floorCount:       4,
    floors:           ['abyssal_1', 'abyssal_2', 'abyssal_3', 'abyssal_boss'],
    allowedModifiers: ['narrow_corridor', 'fog_of_war', 'piece_drought', 'gravity_flux', 'obsidian_veins', 'mirror_world'],
    lootTable:        'abyssal_loot',
    bossSlot:         { floor: 4, bossId: 'the_core' },
  },
};

// ── Loot table stubs ─────────────────────────────────────────────────────────
// Placeholder loot tables referenced by dungeon definitions.
// Each entry: { id, drops: [{ item, weight, min, max }] }

var DUNGEON_LOOT_TABLES = {
  shallow_loot: {
    id: 'shallow_loot',
    drops: [
      { item: 'gold',          weight: 5, min: 1, max: 3 },
      { item: 'crystal',       weight: 2, min: 1, max: 1 },
      { item: 'xp',            weight: 8, min: 50, max: 150 },
    ],
  },
  deep_loot: {
    id: 'deep_loot',
    drops: [
      { item: 'gold',          weight: 4, min: 2, max: 5 },
      { item: 'crystal',       weight: 3, min: 1, max: 2 },
      { item: 'diamond',       weight: 1, min: 1, max: 1 },
      { item: 'xp',            weight: 6, min: 100, max: 300 },
    ],
  },
  abyssal_loot: {
    id: 'abyssal_loot',
    drops: [
      { item: 'gold',            weight: 3, min: 3, max: 8 },
      { item: 'crystal',         weight: 3, min: 2, max: 4 },
      { item: 'diamond',         weight: 2, min: 1, max: 2 },
      { item: 'obsidian_shard',  weight: 1, min: 1, max: 1 },
      { item: 'xp',              weight: 5, min: 200, max: 500 },
    ],
  },
};

// ── Lookup helpers ───────────────────────────────────────────────────────────

/**
 * Look up a dungeon definition by id. Returns null if not found.
 */
function getDungeonDef(dungeonId) {
  return DUNGEON_DEFINITIONS[dungeonId] || null;
}

/**
 * Look up a floor template by id. Returns null if not found.
 */
function getDungeonFloorTemplate(templateId) {
  return DUNGEON_FLOOR_TEMPLATES[templateId] || null;
}

/**
 * Look up a modifier from the registry by id. Returns null if not found.
 */
function getDungeonModifier(modifierId) {
  return DUNGEON_MODIFIER_REGISTRY[modifierId] || null;
}

/**
 * Look up a loot table by id. Returns null if not found.
 */
function getDungeonLootTable(tableId) {
  return DUNGEON_LOOT_TABLES[tableId] || null;
}

/**
 * Returns all modifier ids compatible with a given tier.
 */
function getModifiersForTier(tier) {
  var result = [];
  var keys = Object.keys(DUNGEON_MODIFIER_REGISTRY);
  for (var i = 0; i < keys.length; i++) {
    var mod = DUNGEON_MODIFIER_REGISTRY[keys[i]];
    if (mod.compatibleTiers.indexOf(tier) !== -1) {
      result.push(mod.id);
    }
  }
  return result;
}

/**
 * Pick N non-conflicting modifiers from a pool, respecting exclusion rules.
 * Returns an array of modifier ids.
 */
function pickDungeonModifiers(pool, count) {
  if (!pool || pool.length === 0 || count <= 0) return [];
  var available = pool.slice();
  var chosen = [];
  for (var i = 0; i < count && available.length > 0; i++) {
    var idx = Math.floor(Math.random() * available.length);
    var modId = available.splice(idx, 1)[0];
    var mod = DUNGEON_MODIFIER_REGISTRY[modId];
    chosen.push(modId);
    // Remove exclusive modifiers from the remaining pool
    if (mod && mod.exclusive.length > 0) {
      available = available.filter(function (id) {
        return mod.exclusive.indexOf(id) === -1;
      });
    }
  }
  return chosen;
}

/**
 * Returns all dungeon definition ids, sorted by tier (shallow → deep → abyssal).
 */
function getAllDungeonIds() {
  var tierOrder = [DUNGEON_TIER_SHALLOW, DUNGEON_TIER_DEEP, DUNGEON_TIER_ABYSSAL];
  var ids = Object.keys(DUNGEON_DEFINITIONS);
  ids.sort(function (a, b) {
    var ta = tierOrder.indexOf(DUNGEON_DEFINITIONS[a].tier);
    var tb = tierOrder.indexOf(DUNGEON_DEFINITIONS[b].tier);
    return ta - tb;
  });
  return ids;
}
