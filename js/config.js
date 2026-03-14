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

const GAME_OVER_HEIGHT = 20;
const DANGER_ZONE_HEIGHT = GAME_OVER_HEIGHT - 3;

const SHADOW_APPEAR_DIST = 20; // blocks of fall distance before shadow appears

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
