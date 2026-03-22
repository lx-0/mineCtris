// Boss encounter state machine for the Expeditions dungeon system.
// Manages boss lifecycle: intro -> phase play -> transitions -> defeat/death.
// Handles health tracking, phase progression, and mechanic timers.
//
// Requires: depths-boss-config.js (BOSS_DEFINITIONS, getBossDef, calcBossLineDamage, etc.)
//           depths-state.js (getDungeonSession, startBossEncounter, defeatBoss)
//           depths-hud.js (depthsHud — boss health bar updates)
// Used by:  depths-session.js (boss floor setup), main.js (per-frame tick),
//           lineclear.js (damage on line clears)

// ── Boss states ──────────────────────────────────────────────────────────────

var BOSS_STATE_NONE       = 'none';
var BOSS_STATE_INTRO      = 'intro';
var BOSS_STATE_ACTIVE     = 'active';
var BOSS_STATE_TRANSITION = 'transition';
var BOSS_STATE_DEFEAT     = 'defeat';
var BOSS_STATE_DEATH      = 'death';

// ── Runtime state ────────────────────────────────────────────────────────────

var _bossState     = BOSS_STATE_NONE;
var _bossDef       = null;   // current BOSS_DEFINITIONS entry
var _bossHP        = 0;      // current health
var _bossMaxHP     = 0;      // max health
var _bossPhaseIdx  = 0;      // index into _bossDef.phases
var _bossPhaseTime = 0;      // seconds spent in current phase
var _bossIntroTime = 0;      // seconds remaining in intro
var _bossTransTime = 0;      // seconds remaining in phase transition
var _bossDefeatTime = 0;     // seconds remaining in defeat animation
var _bossFirstEncounter = true; // true on first encounter with this boss (skip intro on retry)

// Mechanic timers: keyed by mechanic index within the current phase
var _bossMechanicTimers = {};

// Accumulated speed ramp from speed_ramp mechanics
var _bossSpeedRamp = 0;

// Intro duration (skippable after first encounter)
var BOSS_INTRO_DURATION       = 3.5;  // seconds
var BOSS_TRANSITION_DURATION  = 1.5;
var BOSS_DEFEAT_DURATION      = 3.0;

// Callback for when boss gameplay should pause/resume (set by session)
var _bossPauseCallback  = null;
var _bossResumeCallback = null;
var _bossDefeatCallback = null;
var _bossDeathCallback  = null;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize a boss encounter. Call when a boss floor begins.
 * Sets up the state machine at the INTRO state.
 *
 * @param {string}        bossId       Boss id from BOSS_DEFINITIONS
 * @param {object}        callbacks    { onPause, onResume, onDefeat, onDeath }
 * @param {object|null}   overrideDef  Optional pre-built boss def (e.g. with extra Infinite Depths phases)
 * @returns {boolean} true if boss initialized successfully
 */
function initBossEncounter(bossId, callbacks, overrideDef) {
  var def = overrideDef || getBossDef(bossId);
  if (!def || !def.phases || def.phases.length === 0) return false;

  _bossDef       = def;
  _bossMaxHP     = getBossMaxHP(bossId);
  _bossHP        = _bossMaxHP;
  _bossPhaseIdx  = 0;
  _bossPhaseTime = 0;
  _bossIntroTime = BOSS_INTRO_DURATION;
  _bossTransTime = 0;
  _bossDefeatTime = 0;
  _bossSpeedRamp = 0;
  _bossMechanicTimers = {};
  _bossState     = BOSS_STATE_INTRO;

  _bossPauseCallback  = (callbacks && callbacks.onPause)  || null;
  _bossResumeCallback = (callbacks && callbacks.onResume) || null;
  _bossDefeatCallback = (callbacks && callbacks.onDefeat) || null;
  _bossDeathCallback  = (callbacks && callbacks.onDeath)  || null;

  // Mark encounter started in session state
  if (typeof startBossEncounter === 'function') startBossEncounter();

  // Show intro overlay
  _showBossIntro();

  // Update HUD with initial health
  _updateBossHUD();

  return true;
}

/**
 * Per-frame tick for the boss encounter.
 * Drives the state machine: intro timer, phase mechanics, transitions.
 *
 * @param {number} delta  Seconds since last frame
 */
function tickBossEncounter(delta) {
  if (_bossState === BOSS_STATE_NONE) return;

  switch (_bossState) {
    case BOSS_STATE_INTRO:
      _tickIntro(delta);
      break;
    case BOSS_STATE_ACTIVE:
      _tickActive(delta);
      break;
    case BOSS_STATE_TRANSITION:
      _tickTransition(delta);
      break;
    case BOSS_STATE_DEFEAT:
      _tickDefeat(delta);
      break;
    case BOSS_STATE_DEATH:
      // Death state is terminal — no tick needed
      break;
  }
}

/**
 * Deal damage to the boss from a line clear.
 * Call from lineclear.js when lines are cleared during a boss encounter.
 *
 * @param {number} linesCleared  Number of lines cleared simultaneously
 */
function dealBossLineDamage(linesCleared) {
  if (_bossState !== BOSS_STATE_ACTIVE || !_bossDef) return;

  var damage = calcBossLineDamage(linesCleared);

  // Wither Storm: 2x damage during gravity inversion
  if (typeof isWitherGravityInverted === 'function' && isWitherGravityInverted()) {
    damage *= 2;
  }

  _applyBossDamage(damage);
}

/**
 * Deal bonus damage from mining boss-spawned blocks.
 *
 * @param {number} blocksMined  Number of boss blocks mined
 */
function dealBossMineDamage(blocksMined) {
  if (_bossState !== BOSS_STATE_ACTIVE || !_bossDef) return;

  var damage = calcBossMineDamage(blocksMined);
  _applyBossDamage(damage);
}

/**
 * Called when the player's board fills (death during boss).
 * Transitions to DEATH state.
 */
function onBossPlayerDeath() {
  if (_bossState === BOSS_STATE_NONE || _bossState === BOSS_STATE_DEFEAT) return;

  _bossState = BOSS_STATE_DEATH;
  _clearMechanicTimers();

  if (_bossDeathCallback) _bossDeathCallback();
}

/**
 * Skip the boss intro (if allowed). Call on player input during intro.
 */
function skipBossIntro() {
  if (_bossState !== BOSS_STATE_INTRO) return;
  if (_bossFirstEncounter) {
    // First encounter: cannot skip intro
    return;
  }
  _bossIntroTime = 0;
  _endIntro();
}

/**
 * Returns the current boss state string.
 */
function getBossState() {
  return _bossState;
}

/**
 * Returns current boss HP and max HP, or null if no encounter.
 */
function getBossHealth() {
  if (!_bossDef) return null;
  return { current: _bossHP, max: _bossMaxHP };
}

/**
 * Returns the current boss definition, or null.
 */
function getActiveBossDef() {
  return _bossDef;
}

/**
 * Returns the current phase config, or null.
 */
function getBossCurrentPhase() {
  if (!_bossDef || !_bossDef.phases) return null;
  if (_bossPhaseIdx < 0 || _bossPhaseIdx >= _bossDef.phases.length) return null;
  return _bossDef.phases[_bossPhaseIdx];
}

/**
 * Returns the current phase index (0-based).
 */
function getBossPhaseIndex() {
  return _bossPhaseIdx;
}

/**
 * Returns the effective gravity multiplier from the current boss phase.
 */
function getBossGravityMult() {
  if (_bossState !== BOSS_STATE_ACTIVE || !_bossDef) return 1.0;
  var phase = getBossCurrentPhase();
  return phase ? (phase.gravityMult || 1.0) : 1.0;
}

/**
 * Returns the effective piece speed multiplier (including speed ramp).
 */
function getBossPieceSpeedMult() {
  if (_bossState !== BOSS_STATE_ACTIVE || !_bossDef) return 1.0;
  var phase = getBossCurrentPhase();
  var base = phase ? (phase.pieceSpeedMult || 1.0) : 1.0;
  return base + _bossSpeedRamp;
}

/**
 * Clean up boss encounter state. Call when leaving boss floor.
 */
function cleanupBossEncounter() {
  _bossState     = BOSS_STATE_NONE;
  _bossDef       = null;
  _bossHP        = 0;
  _bossMaxHP     = 0;
  _bossPhaseIdx  = 0;
  _bossPhaseTime = 0;
  _bossSpeedRamp = 0;
  _clearMechanicTimers();
  _bossPauseCallback  = null;
  _bossResumeCallback = null;
  _bossDefeatCallback = null;
  _bossDeathCallback  = null;

  _hideBossIntro();
  _hideBossTransition();

  // Clean up boss-specific block tracking
  if (typeof cleanupCreepBlocks === 'function') cleanupCreepBlocks();
  if (typeof cleanupFurnaceBlocks === 'function') cleanupFurnaceBlocks();
  if (typeof cleanupWitherBlocks === 'function') cleanupWitherBlocks();
}

// ── State tick handlers ──────────────────────────────────────────────────────

function _tickIntro(delta) {
  _bossIntroTime -= delta;
  if (_bossIntroTime <= 0) {
    _endIntro();
  }
}

function _endIntro() {
  _bossState = BOSS_STATE_ACTIVE;
  _bossFirstEncounter = false;
  _hideBossIntro();
  _initPhaseTimers();

  // Resume gameplay
  if (_bossResumeCallback) _bossResumeCallback();
}

function _tickActive(delta) {
  _bossPhaseTime += delta;

  // Run mechanic timers
  var phase = getBossCurrentPhase();
  if (phase && phase.mechanics) {
    for (var i = 0; i < phase.mechanics.length; i++) {
      _tickMechanic(phase.mechanics[i], i, delta);
    }
  }
}

function _tickTransition(delta) {
  _bossTransTime -= delta;
  if (_bossTransTime <= 0) {
    _bossState = BOSS_STATE_ACTIVE;
    _hideBossTransition();
    _initPhaseTimers();

    if (_bossResumeCallback) _bossResumeCallback();
  }
}

function _tickDefeat(delta) {
  _bossDefeatTime -= delta;
  if (_bossDefeatTime <= 0) {
    _bossState = BOSS_STATE_NONE;

    // Mark defeated in session state
    if (typeof defeatBoss === 'function') defeatBoss();

    if (_bossDefeatCallback) _bossDefeatCallback();
  }
}

// ── Damage and phase checks ──────────────────────────────────────────────────

function _applyBossDamage(damage) {
  if (damage <= 0) return;

  _bossHP = Math.max(0, _bossHP - damage);
  _updateBossHUD();

  // Spawn damage number visual
  _showBossDamageNumber(damage);

  if (_bossHP <= 0) {
    // Boss defeated
    _onBossDefeated();
    return;
  }

  // Check phase transitions
  _checkPhaseTransition();
}

function _checkPhaseTransition() {
  if (!_bossDef || !_bossDef.phases) return;

  var nextIdx = _bossPhaseIdx + 1;
  if (nextIdx >= _bossDef.phases.length) return;

  var nextPhase = _bossDef.phases[nextIdx];
  if (!nextPhase || !nextPhase.trigger) return;

  var shouldTransition = false;

  if (nextPhase.trigger.type === BOSS_PHASE_TRIGGER_HEALTH) {
    var hpPct = _bossHP / _bossMaxHP;
    if (hpPct <= nextPhase.trigger.value) {
      shouldTransition = true;
    }
  } else if (nextPhase.trigger.type === BOSS_PHASE_TRIGGER_TIME) {
    if (_bossPhaseTime >= nextPhase.trigger.value) {
      shouldTransition = true;
    }
  }

  if (shouldTransition) {
    _transitionToPhase(nextIdx);
  }
}

function _transitionToPhase(phaseIdx) {
  _bossPhaseIdx  = phaseIdx;
  _bossPhaseTime = 0;
  _bossSpeedRamp = 0;
  _clearMechanicTimers();

  // Brief pause for transition visual
  _bossState     = BOSS_STATE_TRANSITION;
  _bossTransTime = BOSS_TRANSITION_DURATION;

  if (_bossPauseCallback) _bossPauseCallback();

  _showBossTransition();
  _updateBossHUD();
}

function _onBossDefeated() {
  _bossState      = BOSS_STATE_DEFEAT;
  _bossDefeatTime = BOSS_DEFEAT_DURATION;
  _clearMechanicTimers();

  if (_bossPauseCallback) _bossPauseCallback();

  _showBossDefeatOverlay();
  _updateBossHUD();
}

// ── Mechanic tick ────────────────────────────────────────────────────────────

function _tickMechanic(mechanic, idx, delta) {
  if (!mechanic) return;

  switch (mechanic.type) {
    case 'speed_ramp':
      _bossSpeedRamp = Math.min(
        _bossSpeedRamp + (mechanic.rampPerSec || 0.01) * delta,
        (mechanic.maxMult || 2.0) - 1.0
      );
      break;

    case 'gravity_shift':
      // Gravity shift is applied via getBossGravityMult() reading phase config
      // No timer needed — it's a persistent effect
      break;

    default:
      // Interval-based mechanics (piece_injection, block_corruption, row_push, column_lock)
      if (!mechanic.interval) break;
      if (!_bossMechanicTimers[idx]) _bossMechanicTimers[idx] = 0;
      _bossMechanicTimers[idx] += delta;

      if (_bossMechanicTimers[idx] >= mechanic.interval) {
        _bossMechanicTimers[idx] -= mechanic.interval;
        _fireMechanic(mechanic);
      }
      break;
  }
}

function _fireMechanic(mechanic) {
  switch (mechanic.type) {
    case 'piece_injection':
      // Inject extra pieces into the queue
      if (typeof spawnBossFloorPieces === 'function') {
        // Reuse existing multi-piece system for injected boss pieces
        // The count is handled by the boss piece spawner
      }
      break;

    case 'block_corruption':
      // Corrupt random blocks on the board
      _corruptBlocks(mechanic.count || 3, mechanic.blockType || 'magma');
      break;

    case 'row_push':
      // Push garbage rows from the bottom
      _pushGarbageRows(mechanic.rows || 1);
      break;

    case 'column_lock':
      // Lock random columns temporarily
      // Placeholder for column lock implementation
      break;

    case 'moss_spawn':
      // Spawn soft moss blocks on empty cells (The Creep)
      if (typeof spawnCreepMoss === 'function') {
        spawnCreepMoss(mechanic.count || 3, mechanic.hardenSecs || 3);
      }
      break;

    case 'vine_spread':
      // Spread vine from existing moss/vine blocks (The Creep)
      if (typeof spreadCreepVines === 'function') {
        spreadCreepVines(mechanic.count || 1);
      }
      break;

    case 'magma_rise':
      // Spawn magma blocks from the bottom (The Furnace)
      if (typeof spawnFurnaceMagma === 'function') {
        spawnFurnaceMagma(mechanic.count || 3);
      }
      break;

    case 'gravity_inversion':
      // Flip gravity for a duration (The Wither Storm)
      if (typeof triggerWitherGravityInversion === 'function') {
        triggerWitherGravityInversion(mechanic.duration || 5);
      }
      break;

    case 'void_spawn':
      // Spawn void block clusters (The Wither Storm)
      if (typeof spawnWitherVoidBlocks === 'function') {
        spawnWitherVoidBlocks(mechanic.count || 2);
      }
      break;

    case 'board_shrink':
      // Shrink board width from alternating sides (The Wither Storm)
      if (typeof shrinkWitherBoard === 'function') {
        shrinkWitherBoard();
      }
      break;

    case 'corruption_wave':
      // Convert a random row of blocks to void (The Wither Storm)
      if (typeof witherCorruptionWave === 'function') {
        witherCorruptionWave();
      }
      break;
  }
}

// ── Mechanic effects ─────────────────────────────────────────────────────────

/**
 * Corrupt N random occupied cells on the board to a given block type.
 */
function _corruptBlocks(count, blockType) {
  if (typeof board === 'undefined' || !board) return;

  var occupiedCells = [];
  for (var y = 0; y < board.length; y++) {
    for (var x = 0; x < (board[y] ? board[y].length : 0); x++) {
      if (board[y][x]) {
        occupiedCells.push({ x: x, y: y });
      }
    }
  }

  for (var i = 0; i < count && occupiedCells.length > 0; i++) {
    var idx = Math.floor(Math.random() * occupiedCells.length);
    var cell = occupiedCells.splice(idx, 1)[0];
    // Mark cell as corrupted — visual change handled by renderer
    if (board[cell.y] && board[cell.y][cell.x]) {
      board[cell.y][cell.x].corrupted = true;
      board[cell.y][cell.x].corruptType = blockType;
    }
  }
}

/**
 * Push N garbage rows from the bottom of the board.
 */
function _pushGarbageRows(count) {
  if (typeof board === 'undefined' || !board) return;
  if (typeof BOARD_WIDTH === 'undefined') return;

  var width = BOARD_WIDTH;

  for (var r = 0; r < count; r++) {
    // Shift all rows up
    board.shift();

    // Add garbage row at bottom with one random gap
    var gapCol = Math.floor(Math.random() * width);
    var newRow = [];
    for (var x = 0; x < width; x++) {
      if (x === gapCol) {
        newRow.push(null);
      } else {
        newRow.push({ color: 8, garbage: true, bossRow: true });
      }
    }
    board.push(newRow);
  }

  // Trigger board render refresh if available
  if (typeof refreshBoardMeshes === 'function') refreshBoardMeshes();
}

// ── Mechanic timer management ────────────────────────────────────────────────

function _initPhaseTimers() {
  _bossMechanicTimers = {};
  _bossSpeedRamp = 0;
}

function _clearMechanicTimers() {
  _bossMechanicTimers = {};
}

// ── Visual overlays ──────────────────────────────────────────────────────────

function _showBossIntro() {
  var overlay = _getOrCreateBossOverlay();
  if (!overlay) return;

  var name = _bossDef ? _bossDef.name : 'BOSS';
  var text = _bossDef ? (_bossDef.introText || '') : '';

  overlay.innerHTML =
    '<div class="boss-intro-panel">' +
      '<div class="boss-intro-name">' + name + '</div>' +
      '<div class="boss-intro-text">' + text + '</div>' +
    '</div>';
  overlay.style.display = 'flex';
  overlay.className = 'boss-overlay boss-overlay-intro';
}

function _hideBossIntro() {
  var overlay = document.getElementById('boss-encounter-overlay');
  if (overlay) overlay.style.display = 'none';
}

function _showBossTransition() {
  var overlay = _getOrCreateBossOverlay();
  if (!overlay) return;

  var phase = getBossCurrentPhase();
  var phaseName = phase ? phase.name : 'Phase ' + (_bossPhaseIdx + 1);
  var phaseVisual = phase ? (phase.visualShift || '') : '';

  overlay.innerHTML =
    '<div class="boss-transition-panel">' +
      '<div class="boss-transition-phase">' + phaseName + '</div>' +
      (phaseVisual ? '<div class="boss-transition-visual">' + phaseVisual + '</div>' : '') +
    '</div>';
  overlay.style.display = 'flex';
  overlay.className = 'boss-overlay boss-overlay-transition';
}

function _hideBossTransition() {
  var overlay = document.getElementById('boss-encounter-overlay');
  if (overlay && overlay.classList.contains('boss-overlay-transition')) {
    overlay.style.display = 'none';
  }
}

function _showBossDefeatOverlay() {
  var overlay = _getOrCreateBossOverlay();
  if (!overlay) return;

  var name = _bossDef ? _bossDef.name : 'BOSS';
  var text = _bossDef ? (_bossDef.defeatText || 'Boss defeated!') : 'Boss defeated!';

  overlay.innerHTML =
    '<div class="boss-defeat-panel">' +
      '<div class="boss-defeat-name">' + name + ' DEFEATED</div>' +
      '<div class="boss-defeat-text">' + text + '</div>' +
    '</div>';
  overlay.style.display = 'flex';
  overlay.className = 'boss-overlay boss-overlay-defeat';
}

function _showBossDamageNumber(damage) {
  // Create a floating damage number element
  var el = document.createElement('div');
  el.className = 'boss-damage-number';
  el.textContent = '-' + damage.toFixed(1);
  el.style.position = 'fixed';
  el.style.top = '80px';
  el.style.left = (40 + Math.random() * 20) + '%';
  el.style.color = '#ef4444';
  el.style.fontWeight = 'bold';
  el.style.fontSize = damage >= 4 ? '2em' : '1.4em';
  el.style.pointerEvents = 'none';
  el.style.zIndex = '9999';
  el.style.transition = 'transform 1s ease-out, opacity 1s ease-out';
  document.body.appendChild(el);

  // Animate upward and fade
  requestAnimationFrame(function () {
    el.style.transform = 'translateY(-60px)';
    el.style.opacity = '0';
  });

  setTimeout(function () {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 1100);
}

function _getOrCreateBossOverlay() {
  var overlay = document.getElementById('boss-encounter-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'boss-encounter-overlay';
    overlay.className = 'boss-overlay';
    overlay.style.display = 'none';
    document.body.appendChild(overlay);
  }
  return overlay;
}

// ── HUD updates ──────────────────────────────────────────────────────────────

function _updateBossHUD() {
  if (typeof depthsHud !== 'undefined' && depthsHud && typeof depthsHud.updateBossHealth === 'function') {
    depthsHud.updateBossHealth(_bossHP, _bossMaxHP, _bossPhaseIdx, _bossDef);
  }
}
