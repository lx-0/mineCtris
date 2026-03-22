// Boss encounter configuration for the Expeditions dungeon system.
// Defines boss definitions, phase configurations, and mechanic descriptors.
// Extensible: add new bosses by appending to BOSS_DEFINITIONS.
//
// Requires: depths-config.js (DUNGEON_TIER_* constants)
// Used by: depths-boss.js (state machine), depths-session.js (boss floor detection)

// ── Boss tier constants (mirror depths-config.js) ────────────────────────────

var BOSS_TIER_SHALLOW = 'shallow';
var BOSS_TIER_DEEP    = 'deep';
var BOSS_TIER_ABYSSAL = 'abyssal';

// ── Boss tier HP scaling ─────────────────────────────────────────────────────

var BOSS_TIER_HP = {
  shallow: 20,
  deep:    40,
  abyssal: 60,
};

// ── Line-clear damage constants ──────────────────────────────────────────────
// Base damage = 1 per line cleared.
// Combo multiplier: 1 line = 1x, 2 lines = 2.5x, 3 lines = 4x, 4 lines = 6x.
// Mining boss-spawned blocks grants bonus damage per block.

var BOSS_LINE_DAMAGE = {
  1: 1,
  2: 2.5,
  3: 4,
  4: 6,
};

var BOSS_MINE_DAMAGE = 0.5;  // per boss-spawned block mined

// ── Phase transition types ───────────────────────────────────────────────────
// 'health_threshold': transitions when boss HP drops below percentage
// 'time':            transitions after N seconds in current phase

var BOSS_PHASE_TRIGGER_HEALTH = 'health_threshold';
var BOSS_PHASE_TRIGGER_TIME   = 'time';

// ── Mechanic types ───────────────────────────────────────────────────────────
// Each mechanic describes a boss behavior applied during a phase.

var BOSS_MECHANIC_TYPES = {
  piece_injection:   'piece_injection',    // inject extra/special pieces
  gravity_shift:     'gravity_shift',      // change gravity multiplier
  block_corruption:  'block_corruption',   // corrupt random board blocks
  row_push:          'row_push',           // push garbage rows from bottom
  speed_ramp:        'speed_ramp',         // gradually increase piece speed
  column_lock:       'column_lock',        // lock columns temporarily
  moss_spawn:        'moss_spawn',         // spawn soft moss on empty cells
  vine_spread:       'vine_spread',        // spread vine from existing moss/vine
  magma_rise:        'magma_rise',         // magma blocks rise from the bottom
  lava_pool:         'lava_pool',          // lava pools form after line-clears (passive, triggered by clear)
};

// ── Boss definitions ─────────────────────────────────────────────────────────
// Each boss has:
//   id, name, tier, hp (overrides tier default if set),
//   introText, defeatText,
//   phases: array of phase configs (at least 1),
//   lootTable: id referencing DUNGEON_LOOT_TABLES,
//   firstKillReward: item id for first-time boss kill (or null),
//   visualTheme: string key for boss arena visuals

var BOSS_DEFINITIONS = {

  // ── Shallow boss: The Creep ────────────────────────────────────────────────
  the_creep: {
    id:              'the_creep',
    name:            'The Creep',
    tier:            BOSS_TIER_SHALLOW,
    hp:              20,
    introText:       'Roots crack through the stone as moss surges upward...',
    defeatText:      'The overgrowth withers and crumbles away!',
    visualTheme:     'the_creep',
    lootTable:       'shallow_loot',
    firstKillReward: null,
    phases: [
      {
        id:            'phase_1',
        name:          'Overgrowth',
        trigger:       { type: BOSS_PHASE_TRIGGER_HEALTH, value: 1.0 },  // starts at 100%
        mechanics: [
          { type: BOSS_MECHANIC_TYPES.moss_spawn, interval: 10, count: 3, hardenSecs: 3 },
          { type: BOSS_MECHANIC_TYPES.vine_spread, interval: 8, count: 1 },
        ],
        gravityMult:   1.0,
        pieceSpeedMult: 1.0,
        visualShift:   null,
      },
      {
        id:            'phase_2',
        name:          'Infestation',
        trigger:       { type: BOSS_PHASE_TRIGGER_HEALTH, value: 0.5 },  // at 50% HP
        mechanics: [
          { type: BOSS_MECHANIC_TYPES.moss_spawn, interval: 7, count: 5, hardenSecs: 2 },
          { type: BOSS_MECHANIC_TYPES.vine_spread, interval: 5, count: 1 },
        ],
        gravityMult:   1.1,
        pieceSpeedMult: 1.1,
        visualShift:   'overgrowth_intensify',
      },
    ],
  },

  // ── Shallow boss: Cave Crawler ─────────────────────────────────────────────
  cave_crawler: {
    id:              'cave_crawler',
    name:            'Cave Crawler',
    tier:            BOSS_TIER_SHALLOW,
    hp:              20,
    introText:       'The ground trembles as the Cave Crawler emerges...',
    defeatText:      'The Cave Crawler collapses into rubble!',
    visualTheme:     'cave_crawler',
    lootTable:       'shallow_loot',
    firstKillReward: null,
    phases: [
      {
        id:            'phase_1',
        name:          'Tunnel Shake',
        trigger:       { type: BOSS_PHASE_TRIGGER_HEALTH, value: 1.0 },  // starts at 100%
        mechanics: [
          { type: BOSS_MECHANIC_TYPES.row_push, interval: 12, rows: 1 },
        ],
        gravityMult:   1.0,
        pieceSpeedMult: 1.0,
        visualShift:   null,
      },
      {
        id:            'phase_2',
        name:          'Frenzy',
        trigger:       { type: BOSS_PHASE_TRIGGER_HEALTH, value: 0.4 },  // at 40% HP
        mechanics: [
          { type: BOSS_MECHANIC_TYPES.row_push, interval: 8, rows: 1 },
          { type: BOSS_MECHANIC_TYPES.speed_ramp, rampPerSec: 0.01, maxMult: 1.4 },
        ],
        gravityMult:   1.2,
        pieceSpeedMult: 1.2,
        visualShift:   'shake',
      },
    ],
  },

  // ── Deep boss: The Furnace ──────────────────────────────────────────────────
  the_furnace: {
    id:              'the_furnace',
    name:            'The Furnace',
    tier:            BOSS_TIER_DEEP,
    hp:              40,
    introText:       'The walls glow red-hot as magma surges from below...',
    defeatText:      'The Furnace cools and cracks. The heat fades to silence.',
    visualTheme:     'the_furnace',
    lootTable:       'deep_loot',
    firstKillReward: null,
    phases: [
      {
        id:            'phase_1',
        name:          'Rising Heat',
        trigger:       { type: BOSS_PHASE_TRIGGER_HEALTH, value: 1.0 },  // starts at 100%
        mechanics: [
          { type: BOSS_MECHANIC_TYPES.magma_rise, interval: 12, count: 3 },
          { type: BOSS_MECHANIC_TYPES.speed_ramp, rampPerSec: 0.006, maxMult: 2.0 },
        ],
        gravityMult:   1.5,
        pieceSpeedMult: 1.0,
        visualShift:   null,
      },
      {
        id:            'phase_2',
        name:          'Meltdown',
        trigger:       { type: BOSS_PHASE_TRIGGER_HEALTH, value: 0.6 },  // at 60% HP
        mechanics: [
          { type: BOSS_MECHANIC_TYPES.magma_rise, interval: 8, count: 4 },
          { type: BOSS_MECHANIC_TYPES.speed_ramp, rampPerSec: 0.008, maxMult: 2.5 },
        ],
        gravityMult:   2.0,
        pieceSpeedMult: 1.3,
        visualShift:   'furnace_intensify',
      },
    ],
  },

  // ── Deep boss: Piece Storm ─────────────────────────────────────────────────
  piece_storm: {
    id:              'piece_storm',
    name:            'Piece Storm',
    tier:            BOSS_TIER_DEEP,
    hp:              40,
    introText:       'A vortex of stone tears through the cavern!',
    defeatText:      'The storm subsides... silence returns.',
    visualTheme:     'piece_storm',
    lootTable:       'deep_loot',
    firstKillReward: null,
    phases: [
      {
        id:            'phase_1',
        name:          'Gathering Winds',
        trigger:       { type: BOSS_PHASE_TRIGGER_HEALTH, value: 1.0 },
        mechanics: [
          { type: BOSS_MECHANIC_TYPES.piece_injection, interval: 10, count: 1, pieceType: 'random' },
        ],
        gravityMult:   1.3,
        pieceSpeedMult: 1.2,
        visualShift:   null,
      },
      {
        id:            'phase_2',
        name:          'Full Gale',
        trigger:       { type: BOSS_PHASE_TRIGGER_HEALTH, value: 0.5 },
        mechanics: [
          { type: BOSS_MECHANIC_TYPES.piece_injection, interval: 6, count: 2, pieceType: 'random' },
          { type: BOSS_MECHANIC_TYPES.gravity_shift, gravityMult: 1.8 },
        ],
        gravityMult:   1.6,
        pieceSpeedMult: 1.5,
        visualShift:   'storm_intensify',
      },
    ],
  },

  // ── Abyssal boss: The Core ─────────────────────────────────────────────────
  the_core: {
    id:              'the_core',
    name:            'The Core',
    tier:            BOSS_TIER_ABYSSAL,
    hp:              60,
    introText:       'The earth splits open to reveal a molten heart...',
    defeatText:      'The Core fractures and goes dark. The abyss is conquered.',
    visualTheme:     'the_core',
    lootTable:       'abyssal_loot',
    firstKillReward: 'depths_border_conqueror',
    phases: [
      {
        id:            'phase_1',
        name:          'Ignition',
        trigger:       { type: BOSS_PHASE_TRIGGER_HEALTH, value: 1.0 },
        mechanics: [
          { type: BOSS_MECHANIC_TYPES.block_corruption, interval: 15, count: 3, blockType: 'magma' },
        ],
        gravityMult:   1.6,
        pieceSpeedMult: 1.5,
        visualShift:   null,
      },
      {
        id:            'phase_2',
        name:          'Eruption',
        trigger:       { type: BOSS_PHASE_TRIGGER_HEALTH, value: 0.55 },
        mechanics: [
          { type: BOSS_MECHANIC_TYPES.block_corruption, interval: 10, count: 5, blockType: 'magma' },
          { type: BOSS_MECHANIC_TYPES.row_push, interval: 10, rows: 2 },
        ],
        gravityMult:   1.8,
        pieceSpeedMult: 1.7,
        visualShift:   'lava_glow',
      },
      {
        id:            'phase_3',
        name:          'Meltdown',
        trigger:       { type: BOSS_PHASE_TRIGGER_HEALTH, value: 0.25 },
        mechanics: [
          { type: BOSS_MECHANIC_TYPES.block_corruption, interval: 6, count: 6, blockType: 'magma' },
          { type: BOSS_MECHANIC_TYPES.row_push, interval: 7, rows: 2 },
          { type: BOSS_MECHANIC_TYPES.speed_ramp, rampPerSec: 0.02, maxMult: 2.0 },
        ],
        gravityMult:   2.0,
        pieceSpeedMult: 2.0,
        visualShift:   'meltdown',
      },
    ],
  },
};

// ── Lookup helpers ───────────────────────────────────────────────────────────

/**
 * Look up a boss definition by id. Returns null if not found.
 */
function getBossDef(bossId) {
  return BOSS_DEFINITIONS[bossId] || null;
}

/**
 * Returns all boss ids, sorted by tier (shallow -> deep -> abyssal).
 */
function getAllBossIds() {
  var tierOrder = [BOSS_TIER_SHALLOW, BOSS_TIER_DEEP, BOSS_TIER_ABYSSAL];
  var ids = Object.keys(BOSS_DEFINITIONS);
  ids.sort(function (a, b) {
    var ta = tierOrder.indexOf(BOSS_DEFINITIONS[a].tier);
    var tb = tierOrder.indexOf(BOSS_DEFINITIONS[b].tier);
    return ta - tb;
  });
  return ids;
}

/**
 * Returns the HP for a boss. Uses boss-specific HP if set, otherwise tier default.
 */
function getBossMaxHP(bossId) {
  var def = getBossDef(bossId);
  if (!def) return 0;
  if (def.hp) return def.hp;
  return BOSS_TIER_HP[def.tier] || 20;
}

/**
 * Calculate line-clear damage dealt to a boss.
 * @param {number} linesCleared  Number of lines cleared simultaneously (1-4)
 * @returns {number} Damage dealt
 */
function calcBossLineDamage(linesCleared) {
  var n = Math.min(Math.max(linesCleared, 1), 4);
  return BOSS_LINE_DAMAGE[n] || n;
}

/**
 * Calculate bonus damage from mining boss-spawned blocks.
 * @param {number} blocksMined  Number of boss blocks mined
 * @returns {number} Bonus damage
 */
function calcBossMineDamage(blocksMined) {
  return blocksMined * BOSS_MINE_DAMAGE;
}
