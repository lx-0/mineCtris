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
// Values: "none" | "stone" | "iron"
let pickaxeTier = "none";

// ── Player push (from landing pieces) ────────────────────────────────────────
let playerPushVelocity = new THREE.Vector3();
let screenShakeActive = false;
let screenShakeStart = 0;

// ── Piece nudge state ─────────────────────────────────────────────────────────
let nudgeCooldown = 0;  // seconds remaining before next nudge is allowed

// ── Next-piece queue ──────────────────────────────────────────────────────────
// Each entry: { index: colorIndex, shape: SHAPES[index] }
let pieceQueue = [];
