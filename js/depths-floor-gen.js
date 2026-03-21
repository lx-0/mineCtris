// Dungeon floor generator for The Depths mode.
// Generates 7-floor sequences with biome assignments, world modifiers,
// and escalating exit conditions (line-clear threshold + time limit).
//
// Requires: worldmodifier.js (WORLD_MODIFIER_DEFS), biome-rules.js (BIOME_RULES)
// Used by: main.js (depths launch), gamestate.js (game-over / floor transition)

// ── Constants ────────────────────────────────────────────────────────────────

const DEPTHS_FLOOR_COUNT = 7;
const DEPTHS_BOARD_WIDTH = 8;  // 8-wide play area (narrower than standard 10)

// LINE_CLEAR_CELLS_NEEDED equivalent for 8-wide board.
// Standard 10-wide = 100 cells; 8-wide = 64 cells.
const DEPTHS_LINE_CLEAR_CELLS = 64;

// ── Biome weights per floor (deeper = harder biomes more likely) ─────────────

const _DEPTHS_BIOME_WEIGHTS = [
  null,  // index 0 unused (floors are 1-based)
  { stone: 5, forest: 3, nether: 1, ice: 1 },  // floor 1
  { stone: 4, forest: 3, nether: 2, ice: 1 },  // floor 2
  { stone: 3, forest: 2, nether: 3, ice: 2 },  // floor 3
  { stone: 2, forest: 2, nether: 3, ice: 3 },  // floor 4
  { stone: 1, forest: 1, nether: 4, ice: 4 },  // floor 5
  { stone: 1, forest: 0, nether: 5, ice: 4 },  // floor 6
  { stone: 0, forest: 0, nether: 5, ice: 5 },  // floor 7
];

// ── Modifier pool ────────────────────────────────────────────────────────────

const _DEPTHS_MODIFIER_POOL = ['ice_world', 'nether', 'ocean'];

// Special combos only available on floor 5+ (two modifiers stacked).
const _DEPTHS_DEEP_COMBOS = [
  ['ice_world', 'nether'],   // Frostburn
  ['ocean',     'nether'],   // Volcanic Sea
  ['ice_world', 'ocean'],    // Frozen Abyss
];

// ── Exit conditions per floor ────────────────────────────────────────────────
// linesNeeded: lines to clear to open the exit.
// timeLimitSecs: seconds before the floor collapses (fail = run over).

const _DEPTHS_EXIT_CONDITIONS = [
  null,  // index 0 unused
  { linesNeeded: 5,  timeLimitSecs: 120 },  // floor 1
  { linesNeeded: 8,  timeLimitSecs: 110 },  // floor 2
  { linesNeeded: 12, timeLimitSecs: 100 },  // floor 3
  { linesNeeded: 15, timeLimitSecs: 90  },  // floor 4
  { linesNeeded: 20, timeLimitSecs: 80  },  // floor 5
  { linesNeeded: 25, timeLimitSecs: 70  },  // floor 6
  { linesNeeded: 10, timeLimitSecs: 90  },  // floor 7 — The Core (fewer lines, but 2× speed)
];

// ── Boss floors ──────────────────────────────────────────────────────────────
// Boss floors have special mechanics that override normal piece spawning.
// Floor 4: "Piece Storm" mini-boss — 3 simultaneous pieces, only one controllable.

const DEPTHS_BOSS_FLOORS = {
  4: {
    id:                'piece_storm',
    name:              'PIECE STORM',
    simultaneousPieces: 3,       // pieces falling at once
    lore:              'The cavern shudders. Pieces rain from every direction.',
  },
  7: {
    id:                'the_core',
    name:              'THE CORE',
    simultaneousPieces: 2,       // 2 pieces at once — intensity from speed, not volume
    forcedBiome:       'nether', // always Nether biome
    fallSpeedOverride: 2.0,      // 2× standard fall speed (overrides biome/modifier stack)
    lore:              'The final chamber. Whatever awaits, there is no turning back.',
  },
};

/**
 * Returns the boss config for a floor number, or null if not a boss floor.
 */
function getDepthsBossConfig(floorNum) {
  return DEPTHS_BOSS_FLOORS[floorNum] || null;
}

// ── Floor lore ───────────────────────────────────────────────────────────────

const _DEPTHS_FLOOR_LORE = [
  null,
  'The entrance crumbles behind you. There is only forward.',
  'Dampness seeps from the walls. The stone grows warmer.',
  'Strange ores glint in the dark — this place is not natural.',
  'The cavern shudders. Pieces rain from every direction.',
  'Reality bends here. The rules are different.',
  'Heat and cold war around you. Every second counts.',
  'The final chamber. Whatever awaits, there is no turning back.',
];

// ── RNG helper ───────────────────────────────────────────────────────────────

function _depthsRng() {
  // Daily Depths: use the deterministic daily seed for floor generation.
  if (isDailyDepths && typeof dailyDepthsPrng === 'function') return dailyDepthsPrng();
  // Fallback: seeded RNG if available (daily challenge compat), else Math.random.
  return (typeof gameRng === 'function') ? gameRng() : Math.random();
}

/**
 * Weighted random pick from { key: weight } map.
 * Returns the chosen key string.
 */
function _depthsWeightedPick(weights) {
  const entries = Object.entries(weights).filter(function (e) { return e[1] > 0; });
  let total = 0;
  for (let i = 0; i < entries.length; i++) total += entries[i][1];
  let r = _depthsRng() * total;
  for (let i = 0; i < entries.length; i++) {
    r -= entries[i][1];
    if (r <= 0) return entries[i][0];
  }
  return entries[entries.length - 1][0];
}

// ── Generator ────────────────────────────────────────────────────────────────

/**
 * Generate a complete 7-floor dungeon run.
 * Returns an array of floor descriptors (1-indexed, index 0 is null).
 *
 * Each floor descriptor:
 * {
 *   floor:          number,         // 1–7
 *   biomeId:        string,         // 'stone' | 'forest' | 'nether' | 'ice'
 *   modifiers:      string[],       // 1–2 world modifier ids
 *   linesNeeded:    number,         // lines to clear to exit
 *   timeLimitSecs:  number,         // seconds allowed
 *   lore:           string,         // flavor text for this floor
 *   isDeepCombo:    boolean,        // true if floor 5+ special combo active
 * }
 */
function generateDepthsRun() {
  var floors = [null];  // 1-indexed

  for (var f = 1; f <= DEPTHS_FLOOR_COUNT; f++) {
    var boss = getDepthsBossConfig(f);

    // Boss floors with a forced biome override the random pick
    var biomeId = (boss && boss.forcedBiome)
      ? boss.forcedBiome
      : _depthsWeightedPick(_DEPTHS_BIOME_WEIGHTS[f]);

    var modifiers = _pickFloorModifiers(f);
    var exit = _DEPTHS_EXIT_CONDITIONS[f];
    var isDeepCombo = f >= 5 && modifiers.length === 2;

    floors.push({
      floor:         f,
      biomeId:       biomeId,
      modifiers:     modifiers,
      linesNeeded:   exit.linesNeeded,
      timeLimitSecs: exit.timeLimitSecs,
      lore:          _DEPTHS_FLOOR_LORE[f] || '',
      isDeepCombo:   isDeepCombo,
      isBossFloor:   !!boss,
      boss:          boss,
    });
  }

  return floors;
}

/**
 * Pick 1–2 world modifiers for a floor.
 * Floor 1–4: exactly 1 random modifier.
 * Floor 5+: 60% chance of a deep combo (2 modifiers), 40% single.
 */
function _pickFloorModifiers(floorNum) {
  // The Core (floor 7 boss): force nether modifier for lava block weights
  var boss = getDepthsBossConfig(floorNum);
  if (boss && boss.forcedBiome === 'nether') {
    return ['nether'];
  }

  if (floorNum >= 5 && _depthsRng() < 0.6) {
    // Deep combo: pick one of the special 2-modifier combos
    var idx = Math.floor(_depthsRng() * _DEPTHS_DEEP_COMBOS.length);
    return _DEPTHS_DEEP_COMBOS[idx].slice();  // return copy
  }

  // Single modifier
  var idx2 = Math.floor(_depthsRng() * _DEPTHS_MODIFIER_POOL.length);
  return [_DEPTHS_MODIFIER_POOL[idx2]];
}

// ── Active run state ─────────────────────────────────────────────────────────

var _depthsRun      = null;   // result of generateDepthsRun()
var _depthsFloorNum = 0;      // current floor (1–7), 0 = not in run

/**
 * Start a new Depths run. Generates the full 7-floor sequence.
 * Returns the floor-1 descriptor so the caller can set up the first floor.
 */
function startDepthsRun() {
  _depthsRun = generateDepthsRun();
  _depthsFloorNum = 1;
  // Initialize the upgrade pool for this run
  if (typeof initDepthsUpgrades === 'function') initDepthsUpgrades();
  return _depthsRun[1];
}

/**
 * Advance to the next floor. Returns the next floor descriptor,
 * or null if the run is complete (all 7 floors cleared).
 */
function advanceDepthsFloor() {
  if (!_depthsRun) return null;
  _depthsFloorNum++;
  if (_depthsFloorNum > DEPTHS_FLOOR_COUNT) {
    // Run complete — player survived all 7 floors
    return null;
  }
  return _depthsRun[_depthsFloorNum];
}

/**
 * Returns the current floor descriptor, or null if not in a run.
 */
function getDepthsCurrentFloor() {
  if (!_depthsRun || _depthsFloorNum < 1 || _depthsFloorNum > DEPTHS_FLOOR_COUNT) return null;
  return _depthsRun[_depthsFloorNum];
}

/**
 * Returns the current floor number (1–7), or 0 if not in a run.
 */
function getDepthsFloorNum() {
  return _depthsFloorNum;
}

/**
 * Returns the full run array (for UI display of upcoming floors).
 */
function getDepthsRun() {
  return _depthsRun;
}

/**
 * Clear the active run (called on reset / return to lobby).
 */
function clearDepthsRun() {
  _depthsRun = null;
  _depthsFloorNum = 0;
  // Clear upgrade state for this run
  if (typeof clearDepthsUpgrades === 'function') clearDepthsUpgrades();
}

// ── Floor setup helpers ──────────────────────────────────────────────────────

/**
 * Apply a floor's biome and modifier(s) to the active game state.
 * Call this after resetGame() but before starting gameplay for the floor.
 *
 * @param {object} floor  Floor descriptor from generateDepthsRun()
 */
function applyDepthsFloor(floor) {
  if (!floor) return;

  // Boss floor activation
  if (typeof resetBossFloorState === 'function') resetBossFloorState();
  depthsBossActive = !!floor.isBossFloor;
  depthsBossConfig = floor.boss || null;
  depthsActivePieceIndex = -1;  // reset each floor
  if (depthsBossActive) {
    if (depthsBossConfig && depthsBossConfig.id === 'the_core') {
      // The Core: activate lava/nether atmosphere overlay
      if (typeof activateCoreOverlay === 'function') activateCoreOverlay();
    } else {
      // Other boss floors (e.g., Piece Storm): storm overlay
      if (typeof activateBossStormOverlay === 'function') activateBossStormOverlay();
    }
  }

  // Apply biome rules and theme
  if (typeof applyBiomeRules === 'function') applyBiomeRules(floor.biomeId);
  if (typeof applyBiomeTheme === 'function') applyBiomeTheme(floor.biomeId);

  // Apply the primary world modifier (first in the list)
  if (floor.modifiers.length > 0 && typeof setWorldModifier === 'function') {
    setWorldModifier(floor.modifiers[0]);
  }

  // For deep combos (2 modifiers), merge the second modifier's effects
  // on top of the first. This stacks score multipliers and combines
  // block weights / speed multipliers.
  if (floor.modifiers.length > 1) {
    _applySecondaryModifier(floor.modifiers[1]);
  }
}

/**
 * Merge a secondary modifier's effects into the active state.
 * Stacks score multiplier multiplicatively; takes the more extreme
 * value for speed/fall multipliers.
 */
function _applySecondaryModifier(modId) {
  if (typeof WORLD_MODIFIER_DEFS === 'undefined') return;
  var secondary = WORLD_MODIFIER_DEFS[modId];
  if (!secondary) return;

  var primary = (typeof getWorldModifier === 'function') ? getWorldModifier() : null;
  if (!primary) return;

  // Stack score multiplier
  primary.scoreMultiplier = (primary.scoreMultiplier || 1.0) * (secondary.scoreMultiplier || 1.0);

  // Take the faster fall speed
  if (secondary.fallSpeedMult && secondary.fallSpeedMult > (primary.fallSpeedMult || 1.0)) {
    primary.fallSpeedMult = secondary.fallSpeedMult;
  }

  // Take the slower player speed (harder)
  if (secondary.playerSpeedMult && secondary.playerSpeedMult < (primary.playerSpeedMult || 1.0)) {
    primary.playerSpeedMult = secondary.playerSpeedMult;
  }

  // Ice stacking: if either modifier has iceAllBlocks, enable it
  if (secondary.iceAllBlocks) {
    primary.iceAllBlocks = true;
  }
}

/**
 * Returns the spawn X/Z range for pieces on the current depths floor.
 * 8-wide board = pieces spawn within ±4 blocks of center (vs ±20 standard).
 */
function getDepthsSpawnRange() {
  return DEPTHS_BOARD_WIDTH / 2;  // ±4 blocks from center
}

/**
 * Returns the LINE_CLEAR_CELLS_NEEDED override for 8-wide depths board.
 */
function getDepthsLineClearCells() {
  return DEPTHS_LINE_CLEAR_CELLS;
}

// ── Floor exit condition check ───────────────────────────────────────────────

/**
 * Called after each line clear in Depths mode.
 * Checks if the current floor's exit condition (N lines cleared) is met.
 * If met, either advances to the next floor or completes the run.
 */
function checkDepthsFloorExit() {
  if (!isDepthsMode) return;
  var floor = getDepthsCurrentFloor();
  if (!floor) return;

  if (depthsFloorLinesCleared >= floor.linesNeeded) {
    // Floor cleared! Track achievement before advancing.
    if (typeof achOnDepthsFloorComplete === 'function') achOnDepthsFloorComplete(floor.floor);

    var nextFloor = advanceDepthsFloor();
    if (!nextFloor) {
      // All 7 floors cleared — run complete!
      depthsRunComplete = true;
      if (typeof triggerGameOver === 'function') triggerGameOver();
    } else {
      // Transition to next floor
      _transitionDepthsFloor(nextFloor);
    }
  }
}

/**
 * Called from the per-frame update loop to tick the floor timer.
 * If time runs out, the run ends (permadeath).
 *
 * @param {number} dtMs  Delta time in milliseconds
 */
function updateDepthsFloorTimer(dtMs) {
  if (!isDepthsMode || !depthsFloorTimerActive) return;
  var floor = getDepthsCurrentFloor();
  if (!floor) return;

  depthsFloorElapsedMs += dtMs;

  // Include bonus time from upgrades
  var bonusSecs = (typeof getDepthsBonusTime === 'function') ? getDepthsBonusTime() : 0;
  var totalLimitMs = (floor.timeLimitSecs + bonusSecs) * 1000;

  // Update HUD timer
  var remainMs = Math.max(0, totalLimitMs - depthsFloorElapsedMs);
  _updateDepthsTimerHUD(remainMs, totalLimitMs);

  // Time's up — permadeath
  if (depthsFloorElapsedMs >= totalLimitMs) {
    if (typeof triggerGameOver === 'function') triggerGameOver();
  }
}

/**
 * Transition between floors: show score summary + upgrade pick + descent,
 * then reset board state and start the next floor.
 * @param {object} nextFloor  Floor descriptor
 */
function _transitionDepthsFloor(nextFloor) {
  var completedFloorNum = _depthsFloorNum - 1;  // the floor just completed
  var completedFloor = _depthsRun ? _depthsRun[completedFloorNum] : null;

  // Draw upgrades BEFORE the soft reset (uses the completed floor number for rarity)
  var upgradeChoices = (typeof drawDepthsUpgrades === 'function')
    ? drawDepthsUpgrades(completedFloorNum)
    : [];

  // Use the combined transition screen (score summary → upgrade pick → descent)
  if (typeof showDepthsTransition === 'function') {
    showDepthsTransition(completedFloor, completedFloorNum, upgradeChoices, function () {
      _executeFloorTransition(nextFloor);
    });
  } else {
    // Fallback: old flow (upgrade select only)
    _showDepthsUpgradeSelect(upgradeChoices, function () {
      _executeFloorTransition(nextFloor);
    });
  }
}

/**
 * Execute the actual floor transition (called after upgrade selection).
 */
function _executeFloorTransition(nextFloor) {
  // Preserve Depths run state across the soft reset
  var savedRun      = _depthsRun;
  var savedFloorNum = _depthsFloorNum;
  var savedDailyDepths = isDailyDepths;
  var savedDailyPrng   = dailyDepthsPrng;
  var savedGameRng     = gameRng;

  // Soft reset: clear the board but keep depths mode flag
  if (typeof resetGame === 'function') resetGame();

  // Restore depths state
  _depthsRun      = savedRun;
  _depthsFloorNum = savedFloorNum;
  isDepthsMode    = true;
  isDailyDepths   = savedDailyDepths;
  dailyDepthsPrng = savedDailyPrng;
  gameRng         = savedGameRng;
  depthsFloorLinesCleared = 0;
  depthsFloorElapsedMs    = 0;
  depthsFloorTimerActive  = false;
  depthsRunComplete       = false;

  // Apply new floor's biome + modifiers
  applyDepthsFloor(nextFloor);

  // Apply persistent upgrade effects after the soft reset
  if (typeof applyDepthsUpgradeEffects === 'function') applyDepthsUpgradeEffects();

  // Update HUD for new floor
  _updateDepthsFloorHUD(nextFloor);

  // Restore daily depths badge if in daily mode
  if (savedDailyDepths) {
    var dailyBadge = document.getElementById('daily-depths-badge');
    if (dailyBadge) dailyBadge.style.display = 'block';
  }

  // Snapshot starting score for per-floor tracking
  if (typeof snapshotDepthsFloorStart === 'function') snapshotDepthsFloorStart();

  // Show floor transition lore, then resume play
  _showDepthsFloorLore(nextFloor, function () {
    depthsFloorTimerActive = true;
    if (typeof requestPointerLock === 'function') requestPointerLock();
  });
}

// ── Depths HUD helpers ───────────────────────────────────────────────────────

function _updateDepthsFloorHUD(floor) {
  var hudEl = document.getElementById('depths-floor-hud');
  if (!hudEl) return;
  hudEl.style.display = 'flex';

  var floorNumEl = hudEl.querySelector('.depths-floor-num');
  if (floorNumEl) floorNumEl.textContent = 'FLOOR ' + floor.floor + '/' + DEPTHS_FLOOR_COUNT;

  var biomeEl = hudEl.querySelector('.depths-biome');
  if (biomeEl) biomeEl.textContent = floor.biomeId.toUpperCase();

  var modEl = hudEl.querySelector('.depths-modifiers');
  if (modEl) {
    if (floor.isBossFloor) {
      modEl.textContent = '⚡ ' + floor.boss.name;
      modEl.classList.add('depths-boss-floor');
      modEl.classList.remove('depths-deep-combo');
    } else {
      modEl.classList.remove('depths-boss-floor');
      var names = floor.modifiers.map(function (id) {
        if (typeof WORLD_MODIFIER_DEFS !== 'undefined' && WORLD_MODIFIER_DEFS[id]) {
          return WORLD_MODIFIER_DEFS[id].name;
        }
        return id;
      });
      modEl.textContent = names.join(' + ');
      if (floor.isDeepCombo) modEl.classList.add('depths-deep-combo');
      else modEl.classList.remove('depths-deep-combo');
    }
  }

  var goalEl = hudEl.querySelector('.depths-goal');
  if (goalEl) goalEl.textContent = '0/' + floor.linesNeeded + ' lines';
}

function updateDepthsGoalHUD() {
  if (!isDepthsMode) return;
  var floor = getDepthsCurrentFloor();
  if (!floor) return;
  var goalEl = document.querySelector('.depths-goal');
  if (goalEl) {
    goalEl.textContent = Math.min(depthsFloorLinesCleared, floor.linesNeeded) +
      '/' + floor.linesNeeded + ' lines';
  }
}

function _updateDepthsTimerHUD(remainMs, totalMs) {
  var timerEl = document.querySelector('.depths-timer');
  if (!timerEl) return;
  var secs = Math.ceil(remainMs / 1000);
  var mm = Math.floor(secs / 60).toString().padStart(2, '0');
  var ss = (secs % 60).toString().padStart(2, '0');
  timerEl.textContent = mm + ':' + ss;

  // Danger coloring when < 25% time remains
  if (remainMs < totalMs * 0.25) {
    timerEl.classList.add('depths-timer-danger');
  } else {
    timerEl.classList.remove('depths-timer-danger');
  }
}

// ── Floor lore overlay ───────────────────────────────────────────────────────

function _showDepthsFloorLore(floor, onReady) {
  var overlay = document.getElementById('depths-floor-lore-overlay');
  if (!overlay) { if (onReady) onReady(); return; }

  var titleEl = overlay.querySelector('.depths-lore-title');
  if (titleEl) titleEl.textContent = 'FLOOR ' + floor.floor;

  var bodyEl = overlay.querySelector('.depths-lore-body');
  if (bodyEl) bodyEl.textContent = floor.lore || '';

  var biomeEl = overlay.querySelector('.depths-lore-biome');
  if (biomeEl) {
    var biomeText = floor.biomeId.toUpperCase();
    if (floor.isBossFloor) biomeText += ' — ⚡ ' + floor.boss.name;
    else if (floor.isDeepCombo) biomeText += ' — DEEP COMBO';
    biomeEl.textContent = biomeText;
  }

  overlay.style.display = 'flex';
  overlay.setAttribute('tabindex', '-1');
  overlay.focus();

  // Auto-dismiss after 3s or on click/keypress
  var dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    overlay.style.display = 'none';
    overlay.removeEventListener('click', dismiss);
    overlay.removeEventListener('keydown', dismiss);
    clearTimeout(autoTimer);
    if (onReady) onReady();
  }
  overlay.addEventListener('click', dismiss);
  overlay.addEventListener('keydown', dismiss);
  var autoTimer = setTimeout(dismiss, 3000);
}

// ── Depths results screen ────────────────────────────────────────────────────

/**
 * Show the end-of-run results overlay (called from triggerGameOver).
 * @param {object} data  { score, linesCleared, blocksMined, timeSeconds, floorReached, runComplete }
 */
function showDepthsResults(data) {
  // Notify depths tutorial: player died (non-victory)
  if (!data.runComplete && typeof depthsTutorialNotify === 'function') depthsTutorialNotify('depthsDeath');

  var overlay = document.getElementById('depths-results-overlay');
  if (!overlay) return;

  var titleEl = overlay.querySelector('.depths-results-title');
  if (titleEl) {
    titleEl.textContent = data.runComplete
      ? 'THE DEPTHS CONQUERED'
      : 'FALLEN ON FLOOR ' + data.floorReached;
  }

  var statsEl = overlay.querySelector('.depths-results-stats');
  if (statsEl) {
    var totalSecs = Math.floor(data.timeSeconds || 0);
    var mm = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    var ss = (totalSecs % 60).toString().padStart(2, '0');
    statsEl.innerHTML =
      '<div class="depths-stat"><span>SCORE</span><span>' + (data.score || 0).toLocaleString() + '</span></div>' +
      '<div class="depths-stat"><span>LINES CLEARED</span><span>' + (data.linesCleared || 0) + '</span></div>' +
      '<div class="depths-stat"><span>FLOOR REACHED</span><span>' + data.floorReached + '/' + DEPTHS_FLOOR_COUNT + '</span></div>' +
      '<div class="depths-stat"><span>TIME</span><span>' + mm + ':' + ss + '</span></div>';
  }

  // Show the floor map summary (which floors were cleared)
  var mapEl = overlay.querySelector('.depths-results-map');
  if (mapEl && typeof getDepthsRun === 'function') {
    var run = getDepthsRun();
    var html = '';
    for (var i = 1; i <= DEPTHS_FLOOR_COUNT; i++) {
      var f = run ? run[i] : null;
      var cleared = i < data.floorReached || (i === data.floorReached && data.runComplete);
      html += '<div class="depths-map-floor' + (cleared ? ' cleared' : '') +
        (i === data.floorReached && !data.runComplete ? ' failed' : '') + '">' +
        '<span class="depths-map-num">F' + i + '</span>' +
        '<span class="depths-map-biome">' + (f ? f.biomeId : '?') + '</span>' +
        '</div>';
    }
    mapEl.innerHTML = html;
  }

  // Show chosen upgrades summary
  var upgradesEl = overlay.querySelector('.depths-results-upgrades');
  if (upgradesEl && typeof getDepthsChosenUpgradeDefs === 'function') {
    var upgrades = getDepthsChosenUpgradeDefs();
    if (upgrades.length > 0) {
      var uHtml = '<div class="depths-upgrades-title">UPGRADES</div>';
      var _rc = { common: '#9ca3af', rare: '#3b82f6', epic: '#a855f7' };
      for (var u = 0; u < upgrades.length; u++) {
        uHtml += '<span class="depths-results-upgrade" style="color:' +
          (_rc[upgrades[u].rarity] || '#9ca3af') + ';">' + upgrades[u].name + '</span>';
      }
      upgradesEl.innerHTML = uHtml;
    } else {
      upgradesEl.innerHTML = '';
    }
  }

  overlay.style.display = 'flex';
  overlay.setAttribute('tabindex', '-1');
  overlay.focus();

  // Depths achievements: run-complete and run-end tracking
  if (typeof achOnDepthsRunComplete === 'function') achOnDepthsRunComplete(data);
  if (typeof achOnDepthsRunEnd === 'function') achOnDepthsRunEnd();

  // Daily Depths: record score, show daily-specific UI, submit to leaderboard
  if (isDailyDepths) {
    var isPractice = typeof isDailyDepthsPractice === 'function' && isDailyDepthsPractice();
    data.isPractice = isPractice;

    // Submit local score
    var isNewBest = false;
    if (typeof submitDailyDepthsScore === 'function') {
      isNewBest = submitDailyDepthsScore(
        data.score || 0, data.floorReached, data.runComplete,
        data.timeSeconds || 0, data.linesCleared || 0
      );
    }

    // Mark first attempt used (for leaderboard eligibility)
    if (!isPractice && typeof markDailyDepthsAttempt === 'function') {
      markDailyDepthsAttempt();
    }

    // Submit to online leaderboard (first attempt only)
    if (!isPractice && typeof apiSubmitDailyDepthsScore === 'function') {
      var name = typeof loadDisplayName === 'function' ? loadDisplayName() : '';
      if (name) {
        apiSubmitDailyDepthsScore(name, data.score || 0, data.floorReached, data.runComplete);
      }
    }

    // Render daily-specific elements on the results screen
    if (typeof renderDailyDepthsResults === 'function') {
      renderDailyDepthsResults(data, isNewBest);
    }
  }

  // Submit to all-time depths leaderboard (all runs, not just daily)
  if (typeof submitDepthsScore === 'function') {
    var upgradeNames = typeof _getDepthsUpgradeNames === 'function' ? _getDepthsUpgradeNames() : [];
    submitDepthsScore(
      data.score || 0, data.floorReached, data.runComplete,
      data.timeSeconds || 0, data.linesCleared || 0, upgradeNames
    );
  }

  // Button handlers
  var retryBtn = overlay.querySelector('.depths-results-retry');
  if (retryBtn) {
    retryBtn.onclick = function () {
      overlay.style.display = 'none';
      if (typeof resetGame === 'function') resetGame();
      // Dispatch appropriate launch event
      if (isDailyDepths) {
        document.dispatchEvent(new CustomEvent('dailyDepthsLaunch'));
      } else {
        document.dispatchEvent(new CustomEvent('depthsLaunch'));
      }
    };
  }

  var lobbyBtn = overlay.querySelector('.depths-results-lobby');
  if (lobbyBtn) {
    lobbyBtn.onclick = function () {
      overlay.style.display = 'none';
      if (typeof resetGame === 'function') resetGame();
    };
  }

  // Leaderboard button
  var lbBtn = overlay.querySelector('.depths-results-leaderboard');
  if (lbBtn) {
    lbBtn.onclick = function () {
      if (typeof openDepthsLeaderboard === 'function') {
        openDepthsLeaderboard(isDailyDepths ? 'daily' : 'allruns');
      }
    };
  }

  // Keyboard: Enter = retry, L = leaderboard, Escape = lobby
  overlay.addEventListener('keydown', function (e) {
    if (e.key === 'Enter')  { e.preventDefault(); if (retryBtn) retryBtn.click(); }
    if (e.key === 'l' || e.key === 'L') { e.preventDefault(); if (lbBtn) lbBtn.click(); }
    if (e.key === 'Escape') { e.preventDefault(); if (lobbyBtn) lobbyBtn.click(); }
  });
}

// ── Upgrade selection overlay ─────────────────────────────────────────────

/**
 * Show the upgrade selection screen between floors.
 * Player picks 1 of 3 upgrades, then onDone() fires.
 *
 * @param {object[]} choices  Array of upgrade definitions (from drawDepthsUpgrades)
 * @param {function} onDone   Callback after player selects
 */
function _showDepthsUpgradeSelect(choices, onDone) {
  if (!choices || choices.length === 0) {
    // No upgrades available (shouldn't happen, but graceful fallback)
    if (onDone) onDone();
    return;
  }

  // Create or reuse the overlay
  var overlay = document.getElementById('depths-upgrade-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'depths-upgrade-overlay';
    overlay.className = 'depths-upgrade-overlay';
    document.body.appendChild(overlay);
  }

  // Rarity colors
  var rarityColors = { common: '#9ca3af', rare: '#3b82f6', epic: '#a855f7' };
  var rarityLabels = { common: 'COMMON', rare: 'RARE', epic: 'EPIC' };

  // Build HTML
  var html = '<div class="depths-upgrade-title">CHOOSE AN UPGRADE</div>';
  html += '<div class="depths-upgrade-subtitle">Floor ' + (_depthsFloorNum) + ' awaits</div>';
  html += '<div class="depths-upgrade-cards">';
  for (var i = 0; i < choices.length; i++) {
    var u = choices[i];
    var rc = rarityColors[u.rarity] || rarityColors.common;
    var rl = rarityLabels[u.rarity] || 'COMMON';
    html += '<div class="depths-upgrade-card" data-upgrade-id="' + u.id + '" tabindex="0" ' +
      'style="border-color: ' + rc + ';">';
    html += '<div class="depths-upgrade-rarity" style="color: ' + rc + ';">' + rl + '</div>';
    html += '<div class="depths-upgrade-name">' + u.name + '</div>';
    html += '<div class="depths-upgrade-desc">' + u.description + '</div>';
    html += '<div class="depths-upgrade-category">' + u.category.replace('_', '/') + '</div>';
    html += '</div>';
  }
  html += '</div>';
  html += '<div class="depths-upgrade-hint">Click a card or press 1 / 2 / 3</div>';

  overlay.innerHTML = html;
  overlay.style.display = 'flex';
  overlay.setAttribute('tabindex', '-1');
  overlay.focus();

  var selected = false;

  function pick(upgradeId) {
    if (selected) return;
    selected = true;
    if (typeof selectDepthsUpgrade === 'function') selectDepthsUpgrade(upgradeId);

    // Flash the selected card
    var cards = overlay.querySelectorAll('.depths-upgrade-card');
    for (var c = 0; c < cards.length; c++) {
      if (cards[c].getAttribute('data-upgrade-id') === upgradeId) {
        cards[c].classList.add('depths-upgrade-selected');
      } else {
        cards[c].style.opacity = '0.3';
      }
    }

    // Brief delay for visual feedback, then proceed
    setTimeout(function () {
      overlay.style.display = 'none';
      overlay.removeEventListener('keydown', keyHandler);
      if (onDone) onDone();
    }, 400);
  }

  // Click handlers on cards
  var cards = overlay.querySelectorAll('.depths-upgrade-card');
  for (var j = 0; j < cards.length; j++) {
    (function (card) {
      card.addEventListener('click', function () {
        pick(card.getAttribute('data-upgrade-id'));
      });
    })(cards[j]);
  }

  // Keyboard: 1/2/3 to pick
  function keyHandler(e) {
    var num = parseInt(e.key, 10);
    if (num >= 1 && num <= choices.length) {
      e.preventDefault();
      pick(choices[num - 1].id);
    }
  }
  overlay.addEventListener('keydown', keyHandler);
}
