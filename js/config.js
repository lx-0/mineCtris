// Game constants — all pure values, no DOM or Three.js needed.

const BLOCK_SIZE = 1;
const WORLD_SIZE = 50;
const PLAYER_HEIGHT = 1.8 * BLOCK_SIZE;
const PLAYER_RADIUS = 0.4 * BLOCK_SIZE;
const GRAVITY = 9.8 * BLOCK_SIZE;
const JUMP_VELOCITY = 4.0 * BLOCK_SIZE;
const MOVEMENT_SPEED = 5.0 * BLOCK_SIZE;
const MIN_ROTATION_INTERVAL = 1.5;
const MAX_ROTATION_INTERVAL = 4.0;
const MINING_RANGE = 4.5 * BLOCK_SIZE;
const MINING_CLICKS_NEEDED = 3;
const PICKAXE_ANIMATION_DURATION = 0.15;
const PICKAXE_ANIMATION_ANGLE = Math.PI / 6;

const INV_MAX_PER_TYPE = 64;
const INV_MAX_TOTAL = 256;

const SPAWN_INTERVAL = 2;

const MINING_SHAKE_DURATION = 0.1;
const MINING_SHAKE_AMOUNT = 0.05;

const LINE_CLEAR_CELLS_NEEDED = 100;
const LINE_CLEAR_FLASH_SECS = 0.5;

const GAME_OVER_HEIGHT = 19.5; // block top face reaches Y=20
const DANGER_ZONE_HEIGHT = GAME_OVER_HEIGHT - 3; // 16.5

const SHADOW_APPEAR_DIST = 20; // blocks of fall distance before shadow appears

const PUSH_DISTANCE_THRESHOLD = 1.5 * BLOCK_SIZE; // horizontal distance to trigger push
const PUSH_SPEED = 10.0 * BLOCK_SIZE;              // initial lateral push speed
const PUSH_DECAY = 0.05;                           // velocity multiplier per second (fast decay)
const SCREEN_SHAKE_DURATION = 0.08;               // seconds of screen shake on push

const DIFFICULTY_INTERVAL = 60;               // seconds between speed tiers
const DIFFICULTY_MULTIPLIER_PER_TIER = 1.1;   // 10% faster each tier
const DIFFICULTY_MAX_MULTIPLIER = 3.0;         // cap at 3x starting speed

// Next-piece preview queue size (how many upcoming pieces to show)
const NEXT_QUEUE_SIZE = 3;

// Piece directional nudge constants
const NUDGE_PROXIMITY_BLOCKS = 10;     // blocks above ground to activate nudge zone
const NUDGE_MAX_OFFSET = 3;            // max cumulative nudge per piece, per axis (blocks)
const NUDGE_COOLDOWN_SECS = 0.5;       // seconds between nudges
const NUDGE_EMISSIVE_PULSE_SECS = 0.2; // seconds of emissive boost after a nudge

// Material properties keyed by material name.
const BLOCK_TYPES = {
  dirt:    { hits: 2, points: 5,  effect: null },
  stone:   { hits: 4, points: 15, effect: null },
  gold:    { hits: 2, points: 50, effect: null },
  ice:     { hits: 1, points: 5,  effect: "ice" },
  moss:    { hits: 3, points: 8,  effect: null },
  lava:    { hits: 3, points: 25, effect: "lava_glow" },
  crystal: { hits: 2, points: 35, effect: null },
  wood:    { hits: 3, points: 10, effect: null },
  leaf:    { hits: 1, points: 2,  effect: null },
  rock:    { hits: 5, points: 20, effect: null },
  plank:   { hits: 4, points: 15, effect: null },
};

// Crafted plank block color (light tan, distinct from all spawned palette colors).
const PLANK_COLOR = "#d4a56a";

// Maps color hex integer (from COLORS array) to material name.
const COLOR_TO_MATERIAL = {
  0x8b4513: "dirt",
  0x808080: "stone",
  0xffff00: "gold",
  0x00ffff: "ice",
  0x008000: "moss",
  0xff0000: "lava",
  0x800080: "crystal",
  0xd4a56a: "plank",
};

// Maps objectType string to material name for world objects.
const OBJECT_TYPE_TO_MATERIAL = {
  trunk: "wood",
  leaf:  "leaf",
  rock:  "rock",
};

// Block color palette (index 0 = unused/null).
const COLORS = [
  null,
  0x8b4513,
  0x808080,
  0xffff00,
  0x00ffff,
  0x008000,
  0xff0000,
  0x800080,
];

// Tetromino shape definitions (row-major, value = color index).
const SHAPES = [
  [],
  [
    [0, 1, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 2],
    [2, 2, 2],
  ],
  [
    [3, 3],
    [3, 3],
  ],
  [[4, 4, 4, 4]],
  [
    [0, 5, 5],
    [5, 5, 0],
  ],
  [
    [6, 6, 0],
    [0, 6, 6],
  ],
  [
    [7, 0, 0],
    [7, 7, 7],
  ],
];

// Crafting recipes. inputs use CSS hex color strings matching inventory keys.
const RECIPES = [
  {
    id: "wood_plank",
    name: "Wood Plank",
    description: "Durable wall block (4 hits to mine)",
    inputs: [
      { cssColor: "#8b4513", label: "Wood", count: 1 },
    ],
    outputType: "block",
    outputCssColor: PLANK_COLOR,
    outputCount: 2,
  },
  {
    id: "stone_pickaxe",
    name: "Stone Pickaxe",
    description: "All blocks mine in max 2 hits",
    inputs: [
      { cssColor: "#808080", label: "Rock/Stone", count: 3 },
      { cssColor: "#8b4513", label: "Wood", count: 2 },
    ],
    outputType: "tool",
    toolTier: "stone",
    outputCount: 1,
  },
  {
    id: "iron_pickaxe",
    name: "Iron Pickaxe",
    description: "All blocks mine in 1 hit (instant)",
    inputs: [
      { cssColor: "#808080", label: "Rock/Stone", count: 5 },
      { cssColor: "#8b4513", label: "Wood", count: 3 },
    ],
    outputType: "tool",
    toolTier: "iron",
    outputCount: 1,
  },
];
