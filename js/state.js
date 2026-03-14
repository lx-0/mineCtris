// Global mutable state shared across all modules.
// Requires: config.js loaded first (for BLOCK_SIZE), Three.js loaded first.

// ── Three.js scene objects ────────────────────────────────────────────────────
let scene, camera, renderer, controls;
let worldGroup;
let fallingPiecesGroup;
let raycaster;
let pickaxeGroup;

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

// ── Audio handles (assigned in initAudio()) ───────────────────────────────────
let hitSynth = null;
let breakSynth = null;
let clearSynth = null;
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

// ── Game-over flag ────────────────────────────────────────────────────────────
let isGameOver = false;

// ── Inventory ─────────────────────────────────────────────────────────────────
// Keys are CSS hex color strings (e.g. "#8b4513"), values are counts.
let inventory = {};

// ── Block placement state ─────────────────────────────────────────────────────
let selectedBlockColor = null;  // CSS hex color key of selected block type
let targetedFaceNormal = null;  // THREE.Vector3 world-space face normal from last raycast
let placeSynth = null;          // Tone.js synth for placement sound

// ── Player push (from landing pieces) ────────────────────────────────────────
let playerPushVelocity = new THREE.Vector3();
let screenShakeActive = false;
let screenShakeStart = 0;
