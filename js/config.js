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
  diamond: { hits: 6, points: 100, effect: null },
  obsidian: { hits: 8, points: 100, effect: null, dropMaterial: "obsidian_shard" },
  rubble:  { hits: 2, points: 5,  effect: null, isRubble: true },
};

// Crafted plank block color (light tan, distinct from all spawned palette colors).
const PLANK_COLOR = "#d4a56a";

// Diamond block color (deep blue — rare, spawns in Classic at Level 7+).
const DIAMOND_COLOR = "#1a237e";

// Obsidian Shard item color — distinct from the block color (#1a0020) so the
// crafting ingredient is clearly identifiable in inventory.
const OBSIDIAN_SHARD_COLOR = "#6600cc";

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
  0x1a237e: "diamond",
  0x1a0020: "obsidian",
  0x6b6b6b: "rubble",
};

// Rubble block color — slate grey, used for battle-mode garbage rows.
const RUBBLE_COLOR = 0x6b6b6b;

// Maps objectType string to material name for world objects.
const OBJECT_TYPE_TO_MATERIAL = {
  trunk:    "wood",
  leaf:     "leaf",
  rock:     "rock",
  obsidian: "obsidian",
};

// Block color palette (index 0 = unused/null).
// Index 8 = diamond (deep blue) — only spawns in Classic at Level 7+.
const COLORS = [
  null,
  0x8b4513,
  0x808080,
  0xffff00,
  0x00ffff,
  0x008000,
  0xff0000,
  0x800080,
  0x1a237e,
];

// Deuteranopia-safe palette — blue/orange/amber/yellow/purple; never relies on red-green.
// Index maps 1:1 with COLORS.
const COLORBLIND_COLORS = [
  null,
  0xee6600, // 1 → deep orange   (was dirt brown)
  0x2277dd, // 2 → bright blue   (was stone grey)
  0xffdd00, // 3 → yellow        (was gold)
  0x55aaff, // 4 → sky blue      (was ice cyan)
  0xff8c00, // 5 → amber         (was moss green)
  0x9933cc, // 6 → violet        (was lava red)
  0x004499, // 7 → dark navy     (was crystal purple)
  0x0066cc, // 8 → medium blue   (was diamond deep blue)
];

// Surface pattern index per color index (makes color never the sole differentiator).
// 0=solid, 1=h-stripes, 2=dots, 3=crosshatch, 4=diagonal, 5=grid, 6=checkerboard
const COLORBLIND_PATTERNS = [
  0, // unused
  1, // orange    - horizontal stripes
  2, // blue      - polka dots
  3, // yellow    - crosshatch
  4, // sky blue  - diagonal stripes
  5, // amber     - grid
  6, // violet    - checkerboard
  0, // dark navy - solid (very dark, clearly distinct)
  3, // medium blue - crosshatch (distinct from polka dots at index 2)
];

// Nether theme palette — dark stone, molten lava emphasis, crimson/obsidian tones.
// Index maps 1:1 with COLORS. canonicalColor (Classic hex) is always preserved.
const NETHER_COLORS = [
  null,
  0x7a1c0a, // 1 → dark red-brown   (was dirt brown)
  0x3d3535, // 2 → dark charcoal    (was stone grey)
  0xff6600, // 3 → molten amber     (was gold yellow)
  0xff4400, // 4 → ember orange     (was ice cyan)
  0x550000, // 5 → dark crimson     (was moss green)
  0xff0000, // 6 → lava red         (same — animated lava shader applies)
  0x2b003f, // 7 → obsidian         (was crystal purple)
  0x0a0a2e, // 8 → void blue        (was diamond deep blue)
];

// Nether trail emissive colors keyed by color index.
const NETHER_TRAIL_EMISSIVE = {
  3: 0xff6600, // molten amber (was gold's warm amber)
  4: 0xff4400, // ember orange (was ice's blue)
  6: 0xff3300, // lava red (same)
};

// Ocean theme palette — blue/teal/coral tones, ice emphasis.
// Index maps 1:1 with COLORS. canonicalColor (Classic hex) is always preserved.
const OCEAN_COLORS = [
  null,
  0x1a4a7a, // 1 → deep ocean blue     (was dirt brown)
  0x4a7a9b, // 2 → slate blue-grey     (was stone grey)
  0xff6b4a, // 3 → coral reef          (was gold yellow)
  0x88e8ff, // 4 → arctic ice blue     (was ice cyan — ice emphasis)
  0x009977, // 5 → seaweed teal        (was moss green)
  0xff4488, // 6 → bioluminescent pink (was lava red)
  0x0a2060, // 7 → deep sea navy       (was crystal purple)
  0x1565c0, // 8 → ocean sapphire      (was diamond deep blue)
];

// Ocean trail emissive colors keyed by color index.
const OCEAN_TRAIL_EMISSIVE = {
  3: 0xff6b4a, // coral (was gold amber)
  4: 0x44ccff, // ice blue (was ice cyan)
  6: 0xff44aa, // bioluminescent (was lava red)
};

// Candy theme palette — pastel pink/purple/mint, no dark tones.
// Index maps 1:1 with COLORS. canonicalColor (Classic hex) is always preserved.
const CANDY_COLORS = [
  null,
  0xffb3d1, // 1 → pastel pink    (was dirt brown)
  0xd4a8ff, // 2 → pastel lavender (was stone grey)
  0xfff5a0, // 3 → pastel lemon   (was gold yellow)
  0xa8ffe8, // 4 → pastel mint    (was ice cyan)
  0xb8ffcc, // 5 → pastel green   (was moss green)
  0xff99cc, // 6 → bubblegum pink (was lava red)
  0xe0a8ff, // 7 → pastel lilac   (was crystal purple)
  0xa0c4ff, // 8 → pastel sky blue (was diamond deep blue)
];

// Candy trail emissive colors keyed by color index.
const CANDY_TRAIL_EMISSIVE = {
  3: 0xffee44, // pastel lemon glow (was gold)
  4: 0x55ffcc, // mint glow (was ice)
  6: 0xff77bb, // bubblegum glow (was lava)
};

// Fossil theme palette (L5 unlock) — earthy sandstone, amber, ancient stone.
const FOSSIL_COLORS = [
  null,
  0x8b6914, // 1 → amber earth    (was dirt brown)
  0x7a6a50, // 2 → fossil stone   (was stone grey)
  0xd4952e, // 3 → burnished gold (was gold yellow)
  0xc8e0d0, // 4 → pale bone      (was ice cyan)
  0x5a7a3a, // 5 → fern green     (was moss green)
  0xb03c10, // 6 → terra cotta    (was lava red)
  0x4a3060, // 7 → dark amethyst  (was crystal purple)
  0x1a3a6a, // 8 → slate navy     (was diamond deep blue)
];
const FOSSIL_TRAIL_EMISSIVE = {
  3: 0xd4952e, // burnished gold glow
  6: 0xb03c10, // terra cotta glow
};

// Storm theme palette (L15 unlock) — electric blue/grey/lightning.
const STORM_COLORS = [
  null,
  0x2a3a4a, // 1 → storm slate     (was dirt brown)
  0x4a5a6a, // 2 → cloud grey      (was stone grey)
  0xf0d060, // 3 → lightning gold  (was gold yellow)
  0x88bbff, // 4 → electric ice    (was ice cyan)
  0x2a6040, // 5 → storm teal      (was moss green)
  0xff4422, // 6 → crimson bolt    (was lava red)
  0x3a2a80, // 7 → thunder violet  (was crystal purple)
  0x0066cc, // 8 → storm sapphire  (was diamond deep blue)
];
const STORM_TRAIL_EMISSIVE = {
  3: 0xf0d060, // lightning glow
  4: 0x66aaff, // electric ice glow
  6: 0xff4422, // bolt glow
};

// Void theme palette (L30 unlock) — deep space, obsidian, cosmic purple.
const VOID_COLORS = [
  null,
  0x1a0a2e, // 1 → void indigo    (was dirt brown)
  0x2a1a3e, // 2 → space grey     (was stone grey)
  0xbb88ff, // 3 → nebula violet  (was gold yellow)
  0x44ddff, // 4 → cosmic cyan    (was ice cyan)
  0x0d4040, // 5 → abyss teal     (was moss green)
  0x9900cc, // 6 → void purple    (was lava red)
  0x220044, // 7 → deep void      (was crystal purple)
  0x000820, // 8 → event horizon  (was diamond deep blue)
];
const VOID_TRAIL_EMISSIVE = {
  3: 0xbb88ff, // nebula glow
  4: 0x44ddff, // cosmic cyan glow
  6: 0xaa00ff, // void glow
};

// Legendary theme palette (L50 unlock) — gold-trimmed, dark base, radiant golds.
const LEGENDARY_COLORS = [
  null,
  0x3a2800, // 1 → dark mahogany   (was dirt brown)
  0x282828, // 2 → charcoal black  (was stone grey)
  0xffd700, // 3 → pure gold       (was gold yellow)
  0xffe8a0, // 4 → pale champagne  (was ice cyan)
  0x2a4a00, // 5 → dark jade       (was moss green)
  0xff8c00, // 6 → gilded amber    (was lava red)
  0x600090, // 7 → royal amethyst  (was crystal purple)
  0x003060, // 8 → midnight sapph. (was diamond deep blue)
];
const LEGENDARY_TRAIL_EMISSIVE = {
  3: 0xffd700, // pure gold glow
  4: 0xffe040, // champagne glow
  6: 0xff8c00, // gilded amber glow
};

// Reverse lookup: COLORS hex integer → color index (used for live material swapping).
const COLOR_TO_INDEX = {};
(function () {
  for (let _i = 1; _i < COLORS.length; _i++) {
    if (COLORS[_i] !== null) COLOR_TO_INDEX[COLORS[_i]] = _i;
  }
}());

// Co-op crafting discount multiplier — applied to recipe input quantities >= 4.
const COOP_CRAFT_DISCOUNT = 0.8;

// Co-op difficulty settings: fall speed baseline multiplier and score multiplier.
const COOP_DIFFICULTY_SETTINGS = {
  casual:    { fallMult: 1.0, scoreMult: 1.2, label: 'Just vibing' },
  normal:    { fallMult: 1.5, scoreMult: 1.8, label: 'Working together' },
  challenge: { fallMult: 2.0, scoreMult: 2.5, label: 'We came to win' },
};

// Tetromino shape definitions (row-major, value = color index).
// Index 8 = diamond — only used when eligible (Classic Level 7+).
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
  // Diamond: compact 2-block vertical pair (rare, hard to mine)
  [
    [8, 8],
    [8, 0],
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
  {
    id: "crafting_bench",
    name: "Crafting Bench",
    description: "Unlocks advanced recipes (Diamond Pickaxe, consumables)",
    inputs: [
      { cssColor: PLANK_COLOR, label: "Plank", count: 4 },
    ],
    outputType: "bench",
    outputCount: 1,
  },
  {
    id: "diamond_pickaxe",
    name: "Diamond Pickaxe",
    description: "1-hit mine + AOE: cross-pattern blast (requires Crafting Bench)",
    inputs: [
      { cssColor: DIAMOND_COLOR, label: "Diamond", count: 7 },
      { cssColor: "#8b4513", label: "Wood", count: 2 },
    ],
    outputType: "tool",
    toolTier: "diamond",
    requiresBench: true,
    outputCount: 1,
  },
  {
    id: "lava_flask",
    name: "Lava Flask",
    description: "Consumable: destroys the lowest block layer (requires Crafting Bench)",
    inputs: [
      { cssColor: "#ff0000", label: "Lava", count: 3 },
      { cssColor: "#800080", label: "Crystal", count: 1 },
    ],
    outputType: "consumable",
    consumableType: "lava_flask",
    requiresBench: true,
    outputCount: 1,
  },
  {
    id: "ice_bridge",
    name: "Ice Bridge",
    description: "Consumable: slows falling pieces 20% for 10s (requires Crafting Bench)",
    inputs: [
      { cssColor: "#00ffff", label: "Ice", count: 4 },
    ],
    outputType: "consumable",
    consumableType: "ice_bridge",
    requiresBench: true,
    outputCount: 1,
  },
  {
    id: "row_bomb",
    name: "Row Bomb",
    description: "Power-up: instantly clears the lowest occupied row (requires Crafting Bench)",
    inputs: [
      { cssColor: DIAMOND_COLOR, label: "Diamond", count: 3 },
      { cssColor: "#ff0000",     label: "Lava",    count: 2 },
    ],
    outputType: "powerup",
    powerUpType: "row_bomb",
    requiresBench: true,
    outputCount: 1,
  },
  {
    id: "slow_down",
    name: "Slow Down",
    description: "Power-up: reduces piece fall speed by 50% for 30s (requires Crafting Bench)",
    inputs: [
      { cssColor: "#808080", label: "Stone", count: 5 },
      { cssColor: "#8b4513", label: "Wood",  count: 1 },
    ],
    outputType: "powerup",
    powerUpType: "slow_down",
    requiresBench: true,
    outputCount: 1,
  },
  {
    id: "shield",
    name: "Shield",
    description: "Power-up: survive one death without ending the run (requires Crafting Bench)",
    inputs: [
      { cssColor: "#808080", label: "Stone", count: 8 },
      { cssColor: "#ffff00", label: "Gold",  count: 3 },
    ],
    outputType: "powerup",
    powerUpType: "shield",
    requiresBench: true,
    outputCount: 1,
  },
  {
    id: "magnet",
    name: "Magnet",
    description: "Power-up: pulls all minable blocks within 3 units to player for 20s (requires Crafting Bench)",
    inputs: [
      { cssColor: "#ffff00",   label: "Gold",    count: 4 },
      { cssColor: DIAMOND_COLOR, label: "Diamond", count: 2 },
    ],
    outputType: "powerup",
    powerUpType: "magnet",
    requiresBench: true,
    outputCount: 1,
  },
  {
    id: "obsidian_pickaxe",
    name: "Obsidian Pickaxe",
    description: "Reduces all block hit counts by 1 (min 1); stacks with Earthquake (requires Crafting Bench)",
    inputs: [
      { cssColor: OBSIDIAN_SHARD_COLOR, label: "Obsidian Shard", count: 4 },
    ],
    outputType: "tool",
    toolTier: "obsidian",
    requiresBench: true,
    outputCount: 1,
  },
  {
    id: "time_freeze",
    name: "Time Freeze",
    description: "Power-up: freeze all falling pieces for 5s; re-activate while active extends by 2s (requires Crafting Bench)",
    inputs: [
      { cssColor: OBSIDIAN_SHARD_COLOR, label: "Obsidian Shard", count: 3 },
    ],
    outputType: "powerup",
    powerUpType: "time_freeze",
    requiresBench: true,
    outputCount: 1,
  },
];
