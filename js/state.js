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

// ── Obsidian block shimmer tracking ──────────────────────────────────────────
// Holds all living obsidian world objects for per-frame emissive shimmer update.
let obsidianBlocks = [];

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

// Power-up item counts (separate from blocks and consumables).
// Keys: "row_bomb" | "slow_down" | "shield" | "magnet" | "time_freeze"
//       "sabotage" | "counter" | "fortress"  (battle-only)
let powerUps = { row_bomb: 0, slow_down: 0, shield: 0, magnet: 0, time_freeze: 0,
                 sabotage: 0, counter: 0, fortress: 0 };

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

// ── Battle mode state ─────────────────────────────────────────────────────────
// true while a battle session is active.
let isBattleMode = false;
// Battle result: 'win' | 'loss' | 'draw' | null
let battleResult = null;
// Match mode: 'survival' (last standing) | 'score_race' (highest score in 3 min)
let battleMatchMode = 'survival';
// Score Race: countdown timer in ms (3 minutes)
let battleScoreRaceRemainingMs = 180000;
// Opponent's last known score and lines cleared (updated from battle_board messages)
let battleOpponentScore = 0;
let battleOpponentLines = 0;
// Back-to-back Tetris detection: true after a 4-line clear; reset on any sub-Tetris clear.
let lastClearWasTetris = false;

// ── Co-op mode state ──────────────────────────────────────────────────────────
// true while a co-op session is active; suppresses local random piece generation.
let isCoopMode = false;
// true while the co-op trade offer panel is open (suppresses pause on pointer unlock).
let coopTradePanelOpen = false;
// Last received partner world position (updated from 'pos' messages; used for proximity checks).
let coopPartnerLastPos = null; // { x, y, z } or null
// Pieces received from the Durable Object for co-op play.
// Each entry: { index, spawnX, spawnZ, startRotation: {axis, angle}, rotationInterval, pieceIndex }
let coopPieceQueue = [];
// Position broadcast: last broadcast time (ms) and last sent position snapshot.
let _coopPosBroadcastLastTime = 0;
let _coopPosLastSent = null; // { x, y, z, rotY, rotX }

// ── Co-op shared game state ───────────────────────────────────────────────────
let coopScore = 0;                  // combined team score (local + partner deltas)
let coopMyScore = 0;                // local player's individual contribution
let coopPartnerScore = 0;           // partner's individual contribution
let coopPartnerMaxY = 0;            // last received partner max-block height
let coopHeightBroadcastLastTime = 0; // ms, for 2 s height broadcast interval
let coopPartnerStatus = 'disconnected'; // 'connected' | 'lagging' | 'disconnected'
let coopPartnerLastSeenTime = 0;    // ms, for partner status dot decay

// ── Co-op per-player session stats ───────────────────────────────────────────
let coopMyBlocksMined = 0;
let coopMyLinesTriggered = 0;
let coopMyCraftsMade = 0;
let coopMyTradesCompleted = 0;
let coopPartnerBlocksMined = 0;
let coopPartnerLinesTriggered = 0;
let coopPartnerCraftsMade = 0;
let coopPartnerTradesCompleted = 0;
let coopPartnerName = '';           // partner's display name (from game_end_stats)
let coopStatsReceived = false;      // true once partner's end-of-game stats arrived

// ── Co-op difficulty state ────────────────────────────────────────────────────
let coopDifficulty = 'normal';      // 'casual' | 'normal' | 'challenge'
let coopFallMultiplier = 1.5;       // baseline fall speed multiplier from difficulty
let coopScoreMultiplier = 1.8;      // score multiplier from difficulty
let coopBonusBannerTimer = 0;       // seconds remaining for "CO-OP BONUS" banner

// ── Daily challenge state ─────────────────────────────────────────────────────
let isDailyChallenge = false;
let isDailyCoopChallenge = false; // true when co-op daily challenge sub-mode is active
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

// ── Power-up bank (persistent across runs via localStorage) ──────────────────
const POWERUP_BANK_KEY = "mineCtris_powerups";

function loadPowerUpBank() {
  try {
    const raw = localStorage.getItem(POWERUP_BANK_KEY);
    if (!raw) return { row_bomb: 0, slow_down: 0, shield: 0, magnet: 0, time_freeze: 0,
                       sabotage: 0, counter: 0, fortress: 0 };
    const data = JSON.parse(raw);
    return {
      row_bomb:   data.row_bomb   || 0,
      slow_down:  data.slow_down  || 0,
      shield:     data.shield     || 0,
      magnet:     data.magnet     || 0,
      time_freeze: data.time_freeze || 0,
      sabotage:   data.sabotage   || 0,
      counter:    data.counter    || 0,
      fortress:   data.fortress   || 0,
    };
  } catch (_) {
    return { row_bomb: 0, slow_down: 0, shield: 0, magnet: 0, time_freeze: 0,
             sabotage: 0, counter: 0, fortress: 0 };
  }
}

function savePowerUpBank(bank) {
  try { localStorage.setItem(POWERUP_BANK_KEY, JSON.stringify(bank)); } catch (_) {}
}

// Equipped power-up for the current run (chosen on mode select screen).
// null = none equipped.
let equippedPowerUpType = null;

// Slow Down power-up: 50% fall-speed reduction for 60 s.
let slowDownActive = false;
let slowDownTimer  = 0.0;

// Shield power-up: absorb the next game-over event.
let shieldActive = false;

// Magnet power-up: auto-mine nearest block within 5 units, once/s, for 30 s.
let magnetActive      = false;
let magnetTimer       = 0.0;
let magnetLastPullTime = 0.0;

// Time Freeze power-up: freeze all falling pieces for 5 s (re-activation extends by 2 s).
let timeFreezeActive = false;
let timeFreezeTimer  = 0.0;

// Obsidian Pickaxe: passive -1 hit reduction on all blocks (min 1).
let obsidianPickaxeActive = false;

// Battle power-up state ────────────────────────────────────────────────────────
// Counter: true while the player's next incoming attack will be reflected.
let counterActive  = false;
// Fortress: true while all incoming garbage is blocked.
let fortressActive = false;
let fortressTimer  = 0.0;

// ── World event engine state ──────────────────────────────────────────────────
// activeEvent: currently running event type string (see EVENT_TYPES in events.js).
// eventRemainingMs: milliseconds left for the active event (0 when idle).
// eventHistory: array of { type, startedAt } records for the current session.
let activeEvent      = "NONE";
let eventRemainingMs = 0;
let eventHistory     = [];

// ── Piece Storm event state ───────────────────────────────────────────────────
// true while the PIECE_STORM world event is active.
let pieceStormActive = false;

// ── Golden Hour event state ───────────────────────────────────────────────────
// true while the GOLDEN_HOUR world event is active.
let goldenHourActive = false;

// ── Earthquake event state ────────────────────────────────────────────────────
// true while the EARTHQUAKE world event is active (enables mining hit halving).
let earthquakeActive = false;
// Camera shake offset tracking for sinusoidal earthquake shake (applied in main.js).
let _eqShakeOffX = 0;
let _eqShakeOffY = 0;

// ── Survival mode state ───────────────────────────────────────────────────────
// isSurvivalMode: true while a Survival session is active.
// survivalSessionNumber: increments each time the player continues on the same world.
let isSurvivalMode      = false;
let survivalSessionNumber = 1;

// ── Session stats (reset each game, accumulated for lifetime stats on game over) ──
let blocksPlaced = 0;
let sessionCrafts = 0;
let sessionConsumableCrafts = 0;
let sessionHighestComboCount = 0;

// ── Editor mode state ─────────────────────────────────────────────────────────
// Free-fly no-gravity mode accessible via main menu "Create" or ?editor=1 URL param.
let isEditorMode = false;
let moveUp   = false;  // fly upward  (Space in editor mode)
let moveDown = false;  // fly downward (Shift in editor mode)

// ── Custom puzzle mode state (editor-created puzzles) ─────────────────────────
// isCustomPuzzleMode: true when playing a puzzle built with the editor.
// customPuzzleWinCondition: { mode, n } — set before entering game from editor.
// customPuzzleLayout: [{x, y, z, color}] — editor blocks captured at "Test" time.
// customPuzzleMetadata: { name, description, author, difficulty } — set from editor or share code.
// customPieceSequence: { mode: "random"|"fixed", pieces: [1-7, ...] } — piece spawn order.
let isCustomPuzzleMode      = false;
let customPuzzleWinCondition = null;
let customPuzzleLayout       = [];
let customPuzzleMetadata     = { name: "", description: "", author: "", difficulty: 0 };
let customPieceSequence      = { mode: "random", pieces: [] };
// true when the current custom puzzle session was launched from the editor Play button.
// Used to show "Edit Puzzle" on the completion overlay.
let customPlayFromEditor     = false;
