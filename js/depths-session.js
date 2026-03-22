// Dungeon session lifecycle manager for the Expeditions dungeon system.
// Orchestrates entry, floor play, extract-or-descend, and death.
//
// Bridges depths-config.js (definitions) and depths-state.js (session state)
// into the game loop (main.js, gamestate.js, lineclear.js).
//
// Requires: depths-config.js, depths-state.js, depths-transition.js,
//           depths-floor-gen.js (applyDepthsFloor, helpers), state.js, gamestate.js
// Used by:  main.js (dungeon launch), gamestate.js (game over)

// ── Dungeon mode flag ────────────────────────────────────────────────────────
// Distinct from isDepthsMode (legacy 7-floor). Both share the depths game
// loop hooks, but isDungeonMode uses the Expeditions config/state system.

var isDungeonMode = false;

// ── Per-floor tracking (parallels legacy depthsFloor* vars) ──────────────────
var dungeonFloorLinesCleared = 0;
var dungeonFloorBlocksMined  = 0;
var dungeonFloorElapsedMs    = 0;
var dungeonFloorTimerActive  = false;
var dungeonFloorSurviveMs    = 0; // accumulated survive time for survive_time condition

// ── Stats persistence key ────────────────────────────────────────────────────
var DUNGEON_STATS_KEY = 'mineCtris_dungeon_stats';
var DUNGEON_INVENTORY_KEY = 'mineCtris_dungeon_inventory';

// ── Launch ───────────────────────────────────────────────────────────────────

/**
 * Launch a dungeon session from the menu.
 * Creates a session via depths-state.js, sets up the first floor, and starts play.
 *
 * @param {string} dungeonId  Dungeon id from DUNGEON_DEFINITIONS (e.g. 'shallow_mines')
 * @param {string|null} seed  Optional seed for deterministic runs
 * @returns {boolean} true if launch succeeded
 */
function launchDungeonSession(dungeonId, seed) {
  var session = startDungeonSession(dungeonId, seed);
  if (!session) return false;

  isDungeonMode = true;
  isDepthsMode  = true; // enable shared depths hooks (spawn range, line clear cells, etc.)

  var floor = getDungeonCurrentFloor();
  if (!floor) return false;

  _applyDungeonFloor(floor);
  _updateDungeonFloorHUD(floor);

  // Show the dungeon HUD overlay
  if (typeof depthsHud !== 'undefined' && depthsHud) depthsHud.show();

  // Snapshot starting score for per-floor tracking
  if (typeof snapshotDepthsFloorStart === 'function') snapshotDepthsFloorStart();

  return true;
}

// ── Floor setup ──────────────────────────────────────────────────────────────

/**
 * Apply a dungeon floor's configuration to the active game state.
 * Maps Expeditions floor templates onto the existing depths gameplay hooks.
 */
function _applyDungeonFloor(floor) {
  if (!floor) return;

  // Reset per-floor counters
  dungeonFloorLinesCleared = 0;
  dungeonFloorBlocksMined  = 0;
  dungeonFloorElapsedMs    = 0;
  dungeonFloorTimerActive  = false;
  dungeonFloorSurviveMs    = 0;

  // Also reset legacy counters since shared code reads them
  depthsFloorLinesCleared = 0;
  depthsFloorElapsedMs    = 0;
  depthsFloorTimerActive  = false;
  depthsRunComplete       = false;

  // Apply gravity multiplier from tier + floor
  var session = getDungeonSession();
  var tierDef = session ? DUNGEON_TIERS[session.tier] : null;
  var baseGravity = tierDef ? tierDef.baseGravityMult : 1.0;
  var floorGravity = floor.gravityMultiplier || 1.0;
  // Store combined gravity for piece physics to read
  _dungeonGravityMult = baseGravity * floorGravity;

  // Apply modifiers from the floor's rolled modifier list
  if (floor.modifiers && floor.modifiers.length > 0) {
    for (var i = 0; i < floor.modifiers.length; i++) {
      var modId = floor.modifiers[i];
      var mod = getDungeonModifier(modId);
      if (!mod) continue;
      _applyDungeonModifier(mod, i === 0);
    }
  }

  // Apply hazard block weights
  if (floor.hazardBlockWeights) {
    _dungeonHazardWeights = floor.hazardBlockWeights;
  } else {
    _dungeonHazardWeights = null;
  }

  // Boss floor setup
  var session = getDungeonSession();
  if (session && isDungeonBossFloor()) {
    var bossConfig = getDungeonBossConfig();
    if (bossConfig) {
      startBossEncounter();
      depthsBossActive = true;
      depthsBossConfig = { id: bossConfig.bossId, name: bossConfig.bossId };
    }
  } else {
    depthsBossActive = false;
    depthsBossConfig = null;
  }
}

// Internal: combined gravity multiplier for the current dungeon floor
var _dungeonGravityMult = 1.0;
// Internal: hazard block weights for the current dungeon floor
var _dungeonHazardWeights = null;

/**
 * Returns the gravity multiplier for the current dungeon floor.
 * Called by piece physics when isDungeonMode is true.
 */
function getDungeonGravityMult() {
  return isDungeonMode ? _dungeonGravityMult : 1.0;
}

/**
 * Returns the hazard block weights for the current dungeon floor.
 * Called by piece spawning when isDungeonMode is true.
 */
function getDungeonHazardWeights() {
  return isDungeonMode ? _dungeonHazardWeights : null;
}

/**
 * Apply a single dungeon modifier effect to the game state.
 */
function _applyDungeonModifier(mod, isPrimary) {
  if (!mod) return;

  switch (mod.effect) {
    case 'boardWidth':
      // Narrow corridor: reduce effective board width
      // This is read by spawn range and line clear checks
      _dungeonBoardWidthDelta = mod.effectValue || 0;
      break;
    case 'visibility':
      // Fog of war: set visibility limit (rows from bottom)
      _dungeonFogLimit = mod.effectValue || 0;
      break;
    case 'pieceRemoval':
      // Piece drought: mark a random piece type to skip
      _dungeonDroughtPiece = Math.floor(Math.random() * 7); // 0-6 = standard pieces
      break;
    case 'gravityWave':
      // Gravity flux: sinusoidal fall speed
      _dungeonGravityFlux = mod.effectValue || null;
      break;
    case 'blockReplace':
      // Obsidian veins: chance to replace blocks
      _dungeonBlockReplace = mod.effectValue || null;
      break;
    case 'invertControls':
      // Mirror world: invert horizontal controls
      _dungeonMirrorControls = !!mod.effectValue;
      break;
  }

  // Also apply via world modifier system if available (for primary modifier)
  if (isPrimary && typeof setWorldModifier === 'function') {
    // Map modifier id to world modifier def if one exists
    if (typeof WORLD_MODIFIER_DEFS !== 'undefined' && WORLD_MODIFIER_DEFS[mod.id]) {
      setWorldModifier(mod.id);
    }
  }
}

// Modifier state
var _dungeonBoardWidthDelta = 0;
var _dungeonFogLimit        = 0;
var _dungeonDroughtPiece    = -1;
var _dungeonGravityFlux     = null;
var _dungeonBlockReplace    = null;
var _dungeonMirrorControls  = false;

/**
 * Returns true if horizontal controls should be inverted (Mirror World modifier).
 */
function isDungeonMirrorControls() {
  return isDungeonMode && _dungeonMirrorControls;
}

/**
 * Returns the gravity flux multiplier for the current frame.
 * Oscillates sinusoidally if the gravity_flux modifier is active.
 */
function getDungeonGravityFluxMult() {
  if (!isDungeonMode || !_dungeonGravityFlux) return 1.0;
  var t = dungeonFloorElapsedMs / 1000;
  var period = _dungeonGravityFlux.periodSecs || 8;
  var min = _dungeonGravityFlux.min || 0.5;
  var max = _dungeonGravityFlux.max || 2.0;
  var mid = (min + max) / 2;
  var amp = (max - min) / 2;
  return mid + amp * Math.sin(2 * Math.PI * t / period);
}

/**
 * Returns the drought piece index (-1 if none), for piece queue filtering.
 */
function getDungeonDroughtPiece() {
  return isDungeonMode ? _dungeonDroughtPiece : -1;
}

/**
 * Returns the obsidian vein replacement config, or null.
 */
function getDungeonBlockReplace() {
  return isDungeonMode ? _dungeonBlockReplace : null;
}

// ── Floor clear condition checking ───────────────────────────────────────────

/**
 * Check if the current dungeon floor's clear condition is met.
 * Called after line clears (for clear_lines), after mining (for mine_blocks),
 * and from the floor timer (for survive_time).
 *
 * @param {string} trigger  What triggered the check: 'line_clear', 'mine', 'timer'
 */
function checkDungeonFloorClear(trigger) {
  if (!isDungeonMode) return;
  var floor = getDungeonCurrentFloor();
  if (!floor || !floor.clearCondition) return;

  var condition = floor.clearCondition;
  var cleared = false;

  switch (condition.type) {
    case 'clear_lines':
      if (trigger === 'line_clear' && dungeonFloorLinesCleared >= condition.count) {
        cleared = true;
      }
      break;
    case 'mine_blocks':
      if (trigger === 'mine' && dungeonFloorBlocksMined >= condition.count) {
        cleared = true;
      }
      break;
    case 'survive_time':
      if (trigger === 'timer' && dungeonFloorSurviveMs >= condition.seconds * 1000) {
        cleared = true;
      }
      break;
  }

  if (cleared) {
    _onDungeonFloorCleared();
  }
}

/**
 * Called when the current floor's clear condition is met.
 * Rolls loot and shows the extract/descend transition.
 */
function _onDungeonFloorCleared() {
  var session = getDungeonSession();
  if (!session) return;

  var floorNum = getDungeonFloorNum();

  // Determine dungeon tier and boss status for loot rolling
  var isBoss = isDungeonBossFloor();

  // Check if boss floor was defeated
  if (isBoss) {
    defeatBoss();
  }

  // Roll loot using the rarity system (loot-tables.js) if available,
  // otherwise fall back to the simple loot table roll.
  var floorLoot = [];
  var rarityDrops = null;
  if (typeof rollFloorLoot === 'function') {
    var tier = session.tier || 'shallow';
    rarityDrops = rollFloorLoot(tier, floorNum, isBoss);
    for (var i = 0; i < rarityDrops.length; i++) {
      var rd = rarityDrops[i];
      addDungeonLoot(rd.item.id, 1);
      floorLoot.push({ item: rd.item.id, amount: 1, rarity: rd.rarity, lootDrop: rd });
    }
    // Save loot drops to persistent inventory
    if (typeof saveLootDrops === 'function') saveLootDrops(rarityDrops);
    // Check boss first-kill reward
    if (isBoss && typeof checkBossFirstKillReward === 'function') {
      var bossConfig = getDungeonBossConfig();
      if (bossConfig) {
        var bossReward = checkBossFirstKillReward(bossConfig.bossId);
        if (bossReward) {
          addDungeonLoot(bossReward.id, 1);
          floorLoot.push({ item: bossReward.id, amount: 1, rarity: bossReward.rarity, isBossReward: true, lootDrop: { item: bossReward, rarity: bossReward.rarity, isDuplicate: false, bonusXP: 0 } });
        }
      }
    }
  } else {
    // Fallback: simple loot table roll
    var dropCount = Math.min(3, 1 + Math.floor(floorNum / 2));
    for (var i = 0; i < dropCount; i++) {
      var drop = rollDungeonLoot();
      if (drop) {
        addDungeonLoot(drop.item, drop.amount);
        floorLoot.push(drop);
      }
    }
  }

  // Pause gameplay
  dungeonFloorTimerActive = false;
  depthsFloorTimerActive  = false;

  // Update dungeon HUD loot display
  if (typeof depthsHud !== 'undefined' && depthsHud) depthsHud.updateLoot();

  // Advance session state (marks current floor cleared, moves index)
  var nextFloor = advanceDungeonFloor();

  if (session.completed) {
    // All floors cleared — show victory/extraction with all loot
    _showDungeonExtractionScreen(floorNum, floorLoot, true);
  } else {
    // Show extract-or-descend choice
    _showDungeonExtractionScreen(floorNum, floorLoot, false, nextFloor);
  }
}

// ── Extract / Descend choice ─────────────────────────────────────────────────

/**
 * Show the extraction choice screen between floors.
 * Displays loot from the just-cleared floor and offers Extract or Descend.
 *
 * @param {number}   clearedFloorNum  Floor number just cleared (1-based)
 * @param {object[]} floorLoot        Loot drops from the cleared floor
 * @param {boolean}  isComplete       True if all floors cleared (no descend option)
 * @param {object}   [nextFloor]      Next floor config (if not complete)
 */
function _showDungeonExtractionScreen(clearedFloorNum, floorLoot, isComplete, nextFloor) {
  // Unlock pointer
  if (typeof controls !== 'undefined' && controls && controls.isLocked) controls.unlock();

  var session = getDungeonSession();
  var allLoot = getDungeonLoot();

  var overlay = document.getElementById('depths-transition-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'depths-transition-overlay';
    overlay.className = 'depths-transition-overlay';
    document.body.appendChild(overlay);
  }

  // Build loot reveal + choice UI
  var html = '<div class="dt-panel dt-extract-panel">';
  html += '<div class="dt-header" style="color:#6ee7b7;">FLOOR ' + clearedFloorNum + ' CLEARED</div>';

  // Floor loot
  if (floorLoot.length > 0) {
    html += '<div class="dt-loot-reveal">';
    html += '<div class="dt-loot-title">LOOT FOUND</div>';
    for (var i = 0; i < floorLoot.length; i++) {
      var drop = floorLoot[i];
      // Use rarity-aware display if lootDrop metadata is available
      if (drop.lootDrop && drop.lootDrop.item) {
        var ld = drop.lootDrop;
        var rarityColor = (typeof LOOT_RARITY !== 'undefined' && LOOT_RARITY[ld.rarity])
          ? LOOT_RARITY[ld.rarity].color : '#9ca3af';
        var rarityLabel = (typeof LOOT_RARITY !== 'undefined' && LOOT_RARITY[ld.rarity])
          ? LOOT_RARITY[ld.rarity].label : '';
        html += '<div class="dt-loot-item" style="border-left: 3px solid ' + rarityColor + '; padding-left: 8px;">';
        html += '<span class="dt-loot-icon">' + (ld.item.icon || '\uD83D\uDCE6') + '</span> ';
        html += '<span class="dt-loot-name" style="color:' + rarityColor + ';">' + ld.item.name + '</span> ';
        html += '<span class="dt-loot-rarity" style="color:' + rarityColor + '; font-size:0.75em;">(' + rarityLabel + ')</span>';
        if (ld.isDuplicate) {
          html += ' <span class="dt-loot-dupe" style="color:#fbbf24; font-size:0.75em;">OWNED +' + ld.bonusXP + ' XP</span>';
        }
        if (drop.isBossReward) {
          html += ' <span class="dt-loot-boss" style="color:#ef4444; font-size:0.75em;">\u2605 BOSS REWARD</span>';
        }
        html += '</div>';
      } else {
        // Fallback: simple display
        var icon = _getLootIcon(drop.item);
        html += '<div class="dt-loot-item">' +
          '<span class="dt-loot-icon">' + icon + '</span> ' +
          '<span class="dt-loot-name">' + drop.item + '</span> ' +
          '<span class="dt-loot-amount">x' + drop.amount + '</span>' +
          '</div>';
      }
    }
    html += '</div>';
  }

  // Total loot summary
  if (allLoot.length > 0) {
    html += '<div class="dt-loot-total">';
    html += '<div class="dt-loot-total-title">CARRIED LOOT (' + allLoot.length + ' items)</div>';
    // Aggregate by item
    var totals = {};
    for (var j = 0; j < allLoot.length; j++) {
      var key = allLoot[j].item;
      totals[key] = (totals[key] || 0) + allLoot[j].amount;
    }
    var keys = Object.keys(totals);
    for (var k = 0; k < keys.length; k++) {
      html += '<span class="dt-loot-total-entry">' +
        _getLootIcon(keys[k]) + ' ' + keys[k] + ' x' + totals[keys[k]] +
        '</span> ';
    }
    html += '</div>';
  }

  // Choice buttons
  html += '<div class="dt-extract-choices">';
  html += '<button class="dt-extract-btn dt-extract-keep" id="dungeon-extract-btn">' +
    '&#x2191; EXTRACT<br><span class="dt-extract-sub">Keep all loot, end run</span></button>';

  if (!isComplete) {
    var nextFloorNum = clearedFloorNum + 1;
    html += '<button class="dt-extract-btn dt-extract-descend" id="dungeon-descend-btn">' +
      '&#x2193; DESCEND TO FLOOR ' + nextFloorNum +
      '<br><span class="dt-extract-sub">Risk loot for greater rewards</span></button>';
  }
  html += '</div>';

  if (isComplete) {
    html += '<div class="dt-complete-msg">All floors conquered!</div>';
  }

  html += '</div>';

  overlay.innerHTML = html;
  overlay.style.display = 'flex';
  overlay.setAttribute('tabindex', '-1');
  overlay.focus();

  // Wire extract button
  var extractBtn = document.getElementById('dungeon-extract-btn');
  if (extractBtn) {
    extractBtn.onclick = function () {
      overlay.style.display = 'none';
      _handleDungeonExtract();
    };
  }

  // Wire descend button
  if (!isComplete) {
    var descendBtn = document.getElementById('dungeon-descend-btn');
    if (descendBtn) {
      descendBtn.onclick = function () {
        overlay.style.display = 'none';
        _handleDungeonDescend(nextFloor);
      };
    }
  }

  // Keyboard: E to extract, D to descend
  function keyHandler(e) {
    if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      overlay.removeEventListener('keydown', keyHandler);
      overlay.style.display = 'none';
      _handleDungeonExtract();
    }
    if (!isComplete && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      overlay.removeEventListener('keydown', keyHandler);
      overlay.style.display = 'none';
      _handleDungeonDescend(nextFloor);
    }
  }
  overlay.addEventListener('keydown', keyHandler);
}

/**
 * Handle the player choosing to extract (leave with loot).
 */
function _handleDungeonExtract() {
  extractFromDungeon();

  // Hide dungeon HUD overlay
  if (typeof depthsHud !== 'undefined' && depthsHud) depthsHud.hide();

  // Save loot to inventory
  var loot = getDungeonLoot();
  _saveDungeonLootToInventory(loot);

  // Persist run stats
  var summary = getDungeonSessionSummary();
  _persistDungeonRunStats(summary);

  // Show extraction results screen
  _showDungeonResultsScreen(summary);
}

/**
 * Handle the player choosing to descend to the next floor.
 */
function _handleDungeonDescend(nextFloor) {
  if (!nextFloor) return;

  // Soft-reset the board for the new floor
  var session = getDungeonSession();
  var savedSession = session; // depths-state.js holds the session globally

  if (typeof resetGame === 'function') resetGame();

  // Restore dungeon mode flags (resetGame clears them)
  isDungeonMode = true;
  isDepthsMode  = true;

  // Apply new floor
  _applyDungeonFloor(nextFloor);
  _updateDungeonFloorHUD(nextFloor);

  // Refresh dungeon HUD for new floor
  if (typeof depthsHud !== 'undefined' && depthsHud) depthsHud.onFloorChange();

  // Snapshot starting score
  if (typeof snapshotDepthsFloorStart === 'function') snapshotDepthsFloorStart();

  // Show descent animation, then resume play
  var floorNum = getDungeonFloorNum();
  _showDungeonDescentLore(nextFloor, floorNum, function () {
    dungeonFloorTimerActive = true;
    depthsFloorTimerActive  = true;
    if (typeof requestPointerLock === 'function') requestPointerLock();
  });
}

// ── Death handling ───────────────────────────────────────────────────────────

/**
 * Handle dungeon death. Called from triggerGameOver when isDungeonMode is true.
 * Un-extracted loot is lost. XP and first-clear bonuses are kept.
 */
function handleDungeonDeath() {
  dungeonDeath();

  // Hide dungeon HUD overlay
  if (typeof depthsHud !== 'undefined' && depthsHud) depthsHud.hide();

  var summary = getDungeonSessionSummary();

  // Persist run stats (without loot — it's forfeited)
  summary.lootForfeited = true;
  _persistDungeonRunStats(summary);

  // Show defeat screen
  _showDungeonResultsScreen(summary);
}

// ── Floor timer ──────────────────────────────────────────────────────────────

/**
 * Tick the dungeon floor timer. Called per-frame from the game loop.
 * Handles time limit enforcement and survive_time condition tracking.
 *
 * @param {number} dtMs  Delta time in milliseconds
 */
function updateDungeonFloorTimer(dtMs) {
  if (!isDungeonMode || !dungeonFloorTimerActive) return;

  var floor = getDungeonCurrentFloor();
  if (!floor) return;

  dungeonFloorElapsedMs += dtMs;
  dungeonFloorSurviveMs += dtMs;

  // Also update legacy vars (shared code reads them)
  depthsFloorElapsedMs = dungeonFloorElapsedMs;

  // Update session time tracking
  updateDungeonFloorTime(dtMs);

  // Update HUD timer
  var totalLimitMs = (floor.timeLimitSecs || 120) * 1000;
  var remainMs = Math.max(0, totalLimitMs - dungeonFloorElapsedMs);
  _updateDungeonTimerHUD(remainMs, totalLimitMs);

  // Check survive_time clear condition
  if (floor.clearCondition && floor.clearCondition.type === 'survive_time') {
    checkDungeonFloorClear('timer');
  }

  // Time's up — death
  if (dungeonFloorElapsedMs >= totalLimitMs) {
    if (typeof triggerGameOver === 'function') triggerGameOver();
  }
}

// ── Line clear hook ──────────────────────────────────────────────────────────

/**
 * Called when lines are cleared in dungeon mode.
 * Updates floor line count and checks clear condition.
 *
 * @param {number} lineCount  Number of lines cleared in this event
 */
function onDungeonLinesClear(lineCount) {
  if (!isDungeonMode) return;
  dungeonFloorLinesCleared += lineCount;
  depthsFloorLinesCleared = dungeonFloorLinesCleared; // sync legacy var
  checkDungeonFloorClear('line_clear');
}

// ── Mine block hook ──────────────────────────────────────────────────────────

/**
 * Called when a block is mined in dungeon mode.
 * Updates floor mine count and checks clear condition.
 */
function onDungeonBlockMined() {
  if (!isDungeonMode) return;
  dungeonFloorBlocksMined++;
  checkDungeonFloorClear('mine');
}

// ── HUD helpers ──────────────────────────────────────────────────────────────

function _updateDungeonFloorHUD(floor) {
  var hudEl = document.getElementById('depths-floor-hud');
  if (!hudEl) return;
  hudEl.style.display = 'flex';

  var session = getDungeonSession();
  var totalFloors = session ? session.totalFloors : '?';

  var floorNumEl = hudEl.querySelector('.depths-floor-num');
  if (floorNumEl) floorNumEl.textContent = 'FLOOR ' + getDungeonFloorNum() + '/' + totalFloors;

  var biomeEl = hudEl.querySelector('.depths-biome');
  if (biomeEl) {
    var tierLabel = session ? (DUNGEON_TIERS[session.tier] || {}).label || '' : '';
    biomeEl.textContent = (session ? session.dungeonName : '').toUpperCase();
  }

  // Show modifiers
  var modEl = hudEl.querySelector('.depths-modifiers');
  if (modEl && floor.modifiers) {
    var names = [];
    for (var i = 0; i < floor.modifiers.length; i++) {
      var mod = getDungeonModifier(floor.modifiers[i]);
      names.push(mod ? mod.name : floor.modifiers[i]);
    }
    modEl.textContent = names.join(' + ');
  }

  // Show goal based on clear condition
  var goalEl = hudEl.querySelector('.depths-goal');
  if (goalEl && floor.clearCondition) {
    goalEl.textContent = _formatClearCondition(floor.clearCondition, 0);
  }
}

/**
 * Update the dungeon goal HUD during play.
 */
function updateDungeonGoalHUD() {
  if (!isDungeonMode) return;
  var floor = getDungeonCurrentFloor();
  if (!floor || !floor.clearCondition) return;

  var goalEl = document.querySelector('.depths-goal');
  if (!goalEl) return;

  var condition = floor.clearCondition;
  switch (condition.type) {
    case 'clear_lines':
      goalEl.textContent = Math.min(dungeonFloorLinesCleared, condition.count) +
        '/' + condition.count + ' lines';
      break;
    case 'mine_blocks':
      goalEl.textContent = Math.min(dungeonFloorBlocksMined, condition.count) +
        '/' + condition.count + ' blocks mined';
      break;
    case 'survive_time':
      var survived = Math.floor(dungeonFloorSurviveMs / 1000);
      goalEl.textContent = Math.min(survived, condition.seconds) +
        '/' + condition.seconds + 's survived';
      break;
  }
}

function _formatClearCondition(condition, current) {
  switch (condition.type) {
    case 'clear_lines':
      return current + '/' + condition.count + ' lines';
    case 'mine_blocks':
      return current + '/' + condition.count + ' blocks mined';
    case 'survive_time':
      return '0/' + condition.seconds + 's survived';
    default:
      return '';
  }
}

function _updateDungeonTimerHUD(remainMs, totalMs) {
  var timerEl = document.querySelector('.depths-timer');
  if (!timerEl) return;
  var secs = Math.ceil(remainMs / 1000);
  var mm = Math.floor(secs / 60).toString().padStart(2, '0');
  var ss = (secs % 60).toString().padStart(2, '0');
  timerEl.textContent = mm + ':' + ss;

  if (remainMs < totalMs * 0.25) {
    timerEl.classList.add('depths-timer-danger');
  } else {
    timerEl.classList.remove('depths-timer-danger');
  }
}

// ── Descent lore screen ──────────────────────────────────────────────────────

function _showDungeonDescentLore(floor, floorNum, onReady) {
  var overlay = document.getElementById('depths-floor-lore-overlay');
  if (!overlay) { if (onReady) onReady(); return; }

  var session = getDungeonSession();

  var titleEl = overlay.querySelector('.depths-lore-title');
  if (titleEl) titleEl.textContent = 'FLOOR ' + floorNum;

  var bodyEl = overlay.querySelector('.depths-lore-body');
  if (bodyEl) {
    var condition = floor.clearCondition;
    var goalText = '';
    if (condition) {
      switch (condition.type) {
        case 'clear_lines': goalText = 'Clear ' + condition.count + ' lines to advance.'; break;
        case 'mine_blocks': goalText = 'Mine ' + condition.count + ' blocks to advance.'; break;
        case 'survive_time': goalText = 'Survive for ' + condition.seconds + ' seconds.'; break;
      }
    }
    bodyEl.textContent = goalText;
  }

  var biomeEl = overlay.querySelector('.depths-lore-biome');
  if (biomeEl) {
    biomeEl.textContent = session ? session.dungeonName.toUpperCase() : '';
  }

  // Hide reward hint (only relevant for legacy depths floor 1)
  var rewardHintEl = overlay.querySelector('.depths-lore-reward');
  if (rewardHintEl) rewardHintEl.style.display = 'none';

  overlay.style.display = 'flex';
  overlay.setAttribute('tabindex', '-1');
  overlay.focus();

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

// ── Results screen ───────────────────────────────────────────────────────────

/**
 * Show the dungeon results screen (extraction or death).
 */
function _showDungeonResultsScreen(summary) {
  if (typeof controls !== 'undefined' && controls && controls.isLocked) controls.unlock();

  var overlay = document.getElementById('depths-results-overlay');
  if (!overlay) return;

  var isVictory  = summary.completed;
  var isDeath    = summary.died;
  var isExtract  = summary.extracted;

  var title = 'DUNGEON COMPLETE';
  if (isDeath) title = 'FALLEN ON FLOOR ' + (summary.floorsCleared + 1);
  else if (isExtract) title = 'EXTRACTED ON FLOOR ' + summary.extractionFloor;

  var totalSecs = Math.floor((summary.totalTimeMs || 0) / 1000);
  var mm = Math.floor(totalSecs / 60).toString().padStart(2, '0');
  var ss = (totalSecs % 60).toString().padStart(2, '0');

  var panel = overlay.querySelector('.depths-results-panel');
  if (!panel) return;

  var html = '';
  html += '<div class="depths-results-title">' + title + '</div>';
  html += '<div class="dt-dungeon-name">' + (summary.dungeonName || '') + ' (' + (summary.tier || '') + ')</div>';

  // Stats
  html += '<div class="depths-results-stats">';
  html += '<div class="depths-stat"><span>FLOORS CLEARED</span><span>' + summary.floorsCleared + '/' + summary.totalFloors + '</span></div>';
  html += '<div class="depths-stat"><span>TIME</span><span>' + mm + ':' + ss + '</span></div>';
  html += '<div class="depths-stat"><span>SCORE</span><span>' + (score || 0).toLocaleString() + '</span></div>';
  html += '<div class="depths-stat"><span>LINES CLEARED</span><span>' + (linesCleared || 0) + '</span></div>';
  html += '</div>';

  // Loot section
  if (isExtract || isVictory) {
    var loot = summary.loot;
    if (loot.length > 0) {
      html += '<div class="dt-results-loot">';
      html += '<div class="dt-results-loot-title">LOOT SECURED</div>';
      var totals = {};
      for (var i = 0; i < loot.length; i++) {
        var key = loot[i].item;
        totals[key] = (totals[key] || 0) + loot[i].amount;
      }
      var keys = Object.keys(totals);
      for (var k = 0; k < keys.length; k++) {
        html += '<div class="dt-results-loot-item">' +
          _getLootIcon(keys[k]) + ' ' + keys[k] + ' x' + totals[keys[k]] +
          '</div>';
      }
      html += '</div>';
    }
  } else if (isDeath) {
    html += '<div class="dt-results-loot-lost">All un-extracted loot has been lost.</div>';
  }

  // XP earned
  var xpEarned = Math.floor((score || 0) / 50);
  html += '<div class="dt-results-xp">XP EARNED: +' + xpEarned + '</div>';

  // Actions
  html += '<div class="depths-results-actions">';
  html += '<button class="depths-results-retry">&#9654; Try Again <span class="key-hint">[Enter]</span></button>';
  html += '<button class="depths-results-lobby">&#8592; Return to Lobby <span class="key-hint">[Esc]</span></button>';
  html += '</div>';

  panel.innerHTML = html;

  // Award XP
  if (typeof awardXP === 'function') {
    awardXP(score || 0, 'dungeon');
  }
  // Submit lifetime stats
  if (typeof submitLifetimeStats === 'function') {
    submitLifetimeStats({
      score:       score || 0,
      blocksMined: blocksMined || 0,
      linesCleared: linesCleared || 0,
    });
  }

  overlay.style.display = 'flex';
  overlay.setAttribute('tabindex', '-1');
  overlay.focus();

  // Wire buttons
  var retryBtn = overlay.querySelector('.depths-results-retry');
  if (retryBtn) {
    retryBtn.onclick = function () {
      overlay.style.display = 'none';
      var session = getDungeonSession();
      var dungeonId = session ? session.dungeonId : 'shallow_mines';
      if (typeof resetGame === 'function') resetGame();
      document.dispatchEvent(new CustomEvent('dungeonLaunch', { detail: { dungeonId: dungeonId } }));
    };
  }

  var lobbyBtn = overlay.querySelector('.depths-results-lobby');
  if (lobbyBtn) {
    lobbyBtn.onclick = function () {
      overlay.style.display = 'none';
      if (typeof resetGame === 'function') resetGame();
    };
  }

  // Keyboard handlers
  overlay.addEventListener('keydown', function (e) {
    if (e.key === 'Enter')  { e.preventDefault(); if (retryBtn) retryBtn.click(); }
    if (e.key === 'Escape') { e.preventDefault(); if (lobbyBtn) lobbyBtn.click(); }
  });
}

// ── Loot persistence ─────────────────────────────────────────────────────────

/**
 * Save collected loot to the player's dungeon inventory (localStorage).
 */
function _saveDungeonLootToInventory(loot) {
  if (!loot || loot.length === 0) return;
  try {
    var inv = JSON.parse(localStorage.getItem(DUNGEON_INVENTORY_KEY) || '{}');
    for (var i = 0; i < loot.length; i++) {
      var key = loot[i].item;
      inv[key] = (inv[key] || 0) + loot[i].amount;
    }
    localStorage.setItem(DUNGEON_INVENTORY_KEY, JSON.stringify(inv));
  } catch (_) {}
}

/**
 * Load the player's dungeon inventory.
 */
function loadDungeonInventory() {
  try {
    return JSON.parse(localStorage.getItem(DUNGEON_INVENTORY_KEY) || '{}');
  } catch (_) { return {}; }
}

// ── Run stats persistence ────────────────────────────────────────────────────

/**
 * Persist a dungeon run summary to localStorage for stats tracking.
 */
function _persistDungeonRunStats(summary) {
  try {
    var stats = JSON.parse(localStorage.getItem(DUNGEON_STATS_KEY) || '{}');
    stats.totalRuns    = (stats.totalRuns || 0) + 1;
    stats.totalFloors  = (stats.totalFloors || 0) + (summary.floorsCleared || 0);

    if (summary.completed) {
      stats.completions = (stats.completions || 0) + 1;
    }
    if (summary.extracted) {
      stats.extractions = (stats.extractions || 0) + 1;
    }
    if (summary.died) {
      stats.deaths = (stats.deaths || 0) + 1;
    }

    // Best floor reached per dungeon
    if (!stats.bestFloors) stats.bestFloors = {};
    var dungeonId = summary.dungeonId || 'unknown';
    var bestFloor = stats.bestFloors[dungeonId] || 0;
    if (summary.floorsCleared > bestFloor) {
      stats.bestFloors[dungeonId] = summary.floorsCleared;
    }

    // Track runs per dungeon
    if (!stats.runsPerDungeon) stats.runsPerDungeon = {};
    stats.runsPerDungeon[dungeonId] = (stats.runsPerDungeon[dungeonId] || 0) + 1;

    stats.lastRunAt = Date.now();

    localStorage.setItem(DUNGEON_STATS_KEY, JSON.stringify(stats));
  } catch (_) {}
}

/**
 * Load dungeon run stats.
 */
function loadDungeonStats() {
  try {
    return JSON.parse(localStorage.getItem(DUNGEON_STATS_KEY) || '{}');
  } catch (_) { return {}; }
}

// ── Loot icon helper ─────────────────────────────────────────────────────────

function _getLootIcon(item) {
  var icons = {
    gold:           '\uD83E\uDE99',
    crystal:        '\uD83D\uDC8E',
    diamond:        '\uD83D\uDC8E',
    obsidian_shard: '\u26AB',
    xp:             '\u2B50',
  };
  return icons[item] || '\uD83D\uDCE6';
}

// ── Session reset ────────────────────────────────────────────────────────────

/**
 * Clean up dungeon session state. Called by resetGame().
 */
function resetDungeonSession() {
  isDungeonMode = false;
  dungeonFloorLinesCleared = 0;
  dungeonFloorBlocksMined  = 0;
  dungeonFloorElapsedMs    = 0;
  dungeonFloorTimerActive  = false;
  dungeonFloorSurviveMs    = 0;
  _dungeonGravityMult      = 1.0;
  _dungeonHazardWeights    = null;
  _dungeonBoardWidthDelta  = 0;
  _dungeonFogLimit         = 0;
  _dungeonDroughtPiece     = -1;
  _dungeonGravityFlux      = null;
  _dungeonBlockReplace     = null;
  _dungeonMirrorControls   = false;
  clearDungeonSession();
}
