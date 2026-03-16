// Global mutable state shared across all modules.
// Requires: config.js loaded first (for BLOCK_SIZE), Three.js loaded first.

// ── Three.js scene objects ────────────────────────────────────────────────────
let scene, camera, renderer, controls;
let composer; // EffectComposer for post-processing (SSAO)
let worldGroup;
let fallingPiecesGroup;
let raycaster;
let pickaxeGroup;

// ── Sky / lighting ────────────────────────────────────────────────────────────
let skyMesh, skyStars, sunLight, hemisphereLight;
let sunMesh, sunCorona, moonMesh, moonCrescent;

// ── Lava point-light pool ─────────────────────────────────────────────────────
// Max 4 PointLights shared across all lava blocks; positioned toward closest blocks.
const LAVA_LIGHT_COUNT = 4;
let lavaLights = [];

// ── DOM element references (assigned in init()) ───────────────────────────────
let rendererContainer;
let blocker;
let instructions;
let crosshair;

// ── Player movement flags ─────────────────────────────────────────────────────
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;
let playerVelocity = new THREE.Vector3();
let playerOnGround = false;

// ── Timing ────────────────────────────────────────────────────────────────────
let lastTime = performance.now();
let clock = new THREE.Clock();

// ── Falling pieces ────────────────────────────────────────────────────────────
let fallingPieces = [];
let spawnTimer = 0;

// ── Landing shadow/ghost previews ─────────────────────────────────────────────
let shadowsGroup;

// ── Mining state ──────────────────────────────────────────────────────────────
let targetedBlock = null;
let miningProgress = 0;
let originalBlockColor = new THREE.Color();
let isMining = false;
let miningAnimStartTime = 0;

let miningShakeActive = false;
let miningShakeStart = 0;
let miningShakeBlock = null;
let dustParticles = [];

// ── Audio state ───────────────────────────────────────────────────────────────
let audioReady = false;

// ── Grid occupancy ────────────────────────────────────────────────────────────
// Maps integer Y-level → Set of "x,z" strings (one per occupied cell).
const gridOccupancy = new Map();

// ── Line-clear state ──────────────────────────────────────────────────────────
let lineClearInProgress = false;
let lineClearFlashBlocks = [];
let lineClearFlashStart = -1;
let lineClearPendingYs = [];

// ── Score & stats ─────────────────────────────────────────────────────────────
let score = 0;
let blocksMined = 0;
let linesCleared = 0;
let gameElapsedSeconds = 0;
let gameTimerRunning = false;
let lastHudSecond = -1;
let scoreEl = null;
let nextPiecesEl = null;
let lineClearBannerEl = null;
let bannerTimer = 0;

// ── Combo multiplier state ────────────────────────────────────────────────────
let comboCount = 0;       // consecutive line clears within 3s (1 = first clear)
let lastClearTime = -1;   // clock.getElapsedTime() when last clear occurred
let comboBannerEl = null; // DOM reference for combo banner
let comboBannerTimer = 0; // seconds remaining for combo banner display

// ── Difficulty scaling ────────────────────────────────────────────────────────
let difficultyMultiplier = 1.0;  // current fall-speed multiplier
let lastDifficultyTier = 0;      // last tier that triggered a speed-up
let speedUpBannerEl = null;      // DOM reference, assigned in init()
let speedUpBannerTimer = 0;      // seconds remaining for speed-up banner

// ── Game-over flag ────────────────────────────────────────────────────────────
let isGameOver = false;

// ── Pause flag ────────────────────────────────────────────────────────────────
let isPaused = false;

// ── Inventory ─────────────────────────────────────────────────────────────────
// Keys are CSS hex color strings (e.g. "#8b4513"), values are counts.
let inventory = {};

// ── Tree respawn queue ────────────────────────────────────────────────────────
// Each entry: { x, z, timer, growing, growStart, meshes }
let treeRespawnQueue = [];

// ── Block placement state ─────────────────────────────────────────────────────
let selectedBlockColor = null;  // CSS hex color key of selected block type
let targetedFaceNormal = null;  // THREE.Vector3 world-space face normal from last raycast
let groundPlacementPoint = null; // THREE.Vector3 world intersection point on ground (when no block targeted)

// ── Ice friction state ────────────────────────────────────────────────────────
let playerStandingOnIce = false;

// ── Crafting / pickaxe tier ───────────────────────────────────────────────────
// Values: "none" | "stone" | "iron" | "diamond"
let pickaxeTier = "none";

// Whether the player has crafted a Crafting Bench (gates advanced recipes).
let hasCraftingBench = false;

// Consumable item counts. Keys: "lava_flask" | "ice_bridge".
let consumables = { lava_flask: 0, ice_bridge: 0 };

// Ice Bridge slow — reduces falling piece speed by 20% for a duration.
let iceBridgeSlowActive = false;
let iceBridgeSlowTimer  = 0.0;

// ── Player push (from landing pieces) ────────────────────────────────────────
let playerPushVelocity = new THREE.Vector3();
let screenShakeActive = false;
let screenShakeStart = 0;

// ── Piece nudge state ─────────────────────────────────────────────────────────
let nudgeCooldown = 0;  // seconds remaining before next nudge is allowed

// ── Next-piece queue ──────────────────────────────────────────────────────────
// Each entry: { index: colorIndex, shape: SHAPES[index] }
let pieceQueue = [];

// ── Daily challenge state ─────────────────────────────────────────────────────
let isDailyChallenge = false;
// null → use Math.random(); function → seeded daily PRNG from daily.js
let gameRng = null;

// ── Puzzle mode state ─────────────────────────────────────────────────────────
// Fixed-sequence puzzles with pre-placed block layouts and a win/lose condition.
let isPuzzleMode    = false;
let puzzlePuzzleId  = 1;     // Which puzzle (1–10) is currently active
let puzzleComplete  = false;

// ── Weekly challenge state ────────────────────────────────────────────────────
let isWeeklyChallenge = false;
let weeklyModifier = null; // { id, name, description, applyFn }

// Per-modifier effect flags (set by modifier.applyFn, cleared on resetGame)
let weeklyNoIron = false;          // No Iron Week: crafting disabled
let weeklyGoldRush = false;        // Gold Rush: gold 3× more likely, 2× line-clear score
let weeklyIceAge = false;          // Ice Age: 60% ice pieces, Level 3 start
let weeklyDoubleOrNothing = false; // Double or Nothing: 3× combo mult, −25% score on break
let weeklyBlindDrop = false;       // Blind Drop: next-piece preview hidden

// ── Sprint mode state ─────────────────────────────────────────────────────────
// Target: clear exactly 40 lines as fast as possible.
// Fixed fall speed = Classic Level 5 (tier 4 multiplier).
// Crafting disabled; mining enabled; no lose condition.
let isSprintMode       = false;
let sprintTimerActive  = false;   // becomes true on first piece drop
let sprintElapsedMs    = 0;       // milliseconds since sprint timer started
let sprintComplete     = false;
const SPRINT_LINE_TARGET        = 40;
const SPRINT_FIXED_MULTIPLIER   = Math.pow(1.1, 4); // ≈ 1.4641 (Level 5)

// ── Blitz mode state ──────────────────────────────────────────────────────────
// Target: score as many points as possible in 2 minutes.
// Fixed fall speed = Classic Level 5. Crafting disabled; mining enabled.
// No lose condition. Blitz bonus: final 30s → 1.5x multiplier on line clears.
let isBlitzMode        = false;
let blitzTimerActive   = false;   // becomes true on first piece drop
let blitzRemainingMs   = 120000;  // milliseconds remaining (counts down)
let blitzComplete      = false;
let blitzBonusActive   = false;   // true when ≤ 30s remaining
const BLITZ_DURATION_MS        = 120000; // 2 minutes
const BLITZ_BONUS_THRESHOLD_MS = 30000;  // final 30 seconds
const BLITZ_BONUS_MULTIPLIER   = 1.5;
const BLITZ_FIXED_MULTIPLIER   = Math.pow(1.1, 4); // ≈ 1.4641 (same as Sprint)

// ── Accessibility ─────────────────────────────────────────────────────────────
// true = deuteranopia-safe palette + surface patterns are used for block rendering.
let colorblindMode = false;

// ── Visual theme ──────────────────────────────────────────────────────────────
// "classic" = default Minecraft-inspired palette (always unlocked).
// "nether"  = dark stone/lava palette (unlocked via "Iron Will" achievement).
let activeTheme = "classic";

// ── Session stats (reset each game, accumulated for lifetime stats on game over) ──
let blocksPlaced = 0;
let sessionCrafts = 0;
let sessionConsumableCrafts = 0;
let sessionHighestComboCount = 0;
