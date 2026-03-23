// Dungeon session lifecycle manager for the Expeditions dungeon system.
// Orchestrates entry, floor play, extract-or-descend, and death.
//
// Bridges depths-config.js (definitions) and depths-state.js (session state)
// into the game loop (main.js, gamestate.js, lineclear.js).
//
// Requires: depths-config.js, depths-state.js, depths-transition.js,
//           depths-floor-gen.js (applyDepthsFloor, helpers), state.js, gamestate.js
// Used by:  main.js (dungeon launch), gamestate.js (game over)

// gameDepthsMode is declared in state.js and serves as the single source of truth
// for which depths-like system is active ('depths' | 'dungeon' | null).

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

  gameDepthsMode = 'dungeon';

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

  // Apply gravity multiplier from tier + floor + Infinite Descent scaling
  var session = getDungeonSession();
  var tierDef = session ? DUNGEON_TIERS[session.tier] : null;
  var baseGravity = tierDef ? tierDef.baseGravityMult : 1.0;
  var floorGravity = floor.gravityMultiplier || 1.0;
  var infiniteSpeedMult = (typeof isInfiniteMode === 'function' && isInfiniteMode() && typeof getInfiniteSpeedMult === 'function')
    ? getInfiniteSpeedMult() : 1.0;
  // Store combined gravity for piece physics to read
  _dungeonGravityMult = baseGravity * floorGravity * infiniteSpeedMult;

  // Reset per-floor modifier state
  _dungeonEntropyActive = false;

  // Apply modifiers from the floor's rolled modifier list
  if (floor.modifiers && floor.modifiers.length > 0) {
    for (var i = 0; i < floor.modifiers.length; i++) {
      var modId = floor.modifiers[i];
      var mod = getDungeonModifier(modId);
      if (!mod) continue;
      _applyDungeonModifier(mod, i === 0);
    }
  }

  // Apply hazard block weights, with Infinite Depths density bonus
  if (floor.hazardBlockWeights) {
    var hazardWeights = floor.hazardBlockWeights;
    if (typeof isInfiniteMode === 'function' && isInfiniteMode() &&
        typeof getInfiniteScaling === 'function') {
      var _infRunH = (typeof getInfiniteRun === 'function') ? getInfiniteRun() : null;
      if (_infRunH) {
        var _hScaling = getInfiniteScaling(_infRunH.descentNum);
        if (_hScaling.hazardDensityBonus > 0) {
          var _hMult = 1.0 + _hScaling.hazardDensityBonus;
          var _scaledWeights = {};
          var _hKeys = Object.keys(hazardWeights);
          for (var _hi = 0; _hi < _hKeys.length; _hi++) {
            _scaledWeights[_hKeys[_hi]] = hazardWeights[_hKeys[_hi]] * _hMult;
          }
          hazardWeights = _scaledWeights;
        }
      }
    }
    _dungeonHazardWeights = hazardWeights;
  } else {
    _dungeonHazardWeights = null;
  }

  // Boss floor setup — use the boss encounter framework if available
  var session = getDungeonSession();
  if (session && isDungeonBossFloor()) {
    var bossConfig = getDungeonBossConfig();
    if (bossConfig) {
      depthsBossActive = true;
      depthsBossConfig = { id: bossConfig.bossId, name: bossConfig.bossId };

      // Initialize the boss state machine (depths-boss.js)
      if (typeof initBossEncounter === 'function') {
        var bossDef = (typeof getBossDef === 'function') ? getBossDef(bossConfig.bossId) : null;
        if (bossDef) {
          depthsBossConfig.name = bossDef.name;
          depthsBossConfig.simultaneousPieces = 3;
          depthsBossConfig.fallSpeedOverride = bossDef.phases[0].pieceSpeedMult || null;
        }

        // Apply Infinite Depths boss phase escalation
        var initBossDef = bossDef;
        if (bossDef && typeof isInfiniteMode === 'function' && isInfiniteMode() &&
            typeof getInfiniteScaling === 'function') {
          var _infRunB = (typeof getInfiniteRun === 'function') ? getInfiniteRun() : null;
          if (_infRunB) {
            var _bScaling = getInfiniteScaling(_infRunB.descentNum);
            if (_bScaling.bossPhaseBonus > 0) {
              initBossDef = _buildInfiniteBossDef(bossDef, _bScaling.bossPhaseBonus);
            }
          }
        }

        initBossEncounter(bossConfig.bossId, {
          onPause:  function () { dungeonFloorTimerActive = false; },
          onResume: function () { dungeonFloorTimerActive = true; },
          onDefeat: function () { _onDungeonFloorCleared(); },
          onDeath:  function () { _handleDungeonDeath(); },
        }, initBossDef);
      } else {
        // Fallback: legacy boss encounter
        startBossEncounter();
      }
    }
  } else {
    depthsBossActive = false;
    depthsBossConfig = null;
    // Clean up any lingering boss state
    if (typeof cleanupBossEncounter === 'function') cleanupBossEncounter();
  }
}

// Internal: combined gravity multiplier for the current dungeon floor
var _dungeonGravityMult = 1.0;
// Internal: hazard block weights for the current dungeon floor
var _dungeonHazardWeights = null;

/**
 * Build an escalated boss definition for Infinite Depths by appending extra
 * phases beyond the default set. Extra phases represent "Oblivion" (phase 4)
 * and "Void Collapse" (phase 5), triggering at very low HP thresholds with
 * intensified mechanics.
 *
 * @param {object} baseDef     Original boss definition from BOSS_DEFINITIONS
 * @param {number} extraPhases Number of extra phases to append (1 or 2)
 * @returns {object}  Shallow-cloned boss def with escalated phases array
 */
function _buildInfiniteBossDef(baseDef, extraPhases) {
  // Shallow clone
  var def = {};
  var k;
  for (k in baseDef) {
    if (Object.prototype.hasOwnProperty.call(baseDef, k)) def[k] = baseDef[k];
  }

  var escalated = [
    {
      id:            'phase_4',
      name:          'Oblivion',
      trigger:       { type: BOSS_PHASE_TRIGGER_HEALTH, value: 0.1 },
      mechanics: [
        { type: BOSS_MECHANIC_TYPES.gravity_inversion, interval: 7, duration: 10 },
        { type: BOSS_MECHANIC_TYPES.void_spawn,        interval: 5, count: 5 },
        { type: BOSS_MECHANIC_TYPES.board_shrink,      interval: 30 },
        { type: BOSS_MECHANIC_TYPES.corruption_wave,   interval: 12 },
      ],
      gravityMult:    2.2,
      pieceSpeedMult: 2.3,
      visualShift:    'wither_annihilation',
    },
    {
      id:            'phase_5',
      name:          'Void Collapse',
      trigger:       { type: BOSS_PHASE_TRIGGER_HEALTH, value: 0.03 },
      mechanics: [
        { type: BOSS_MECHANIC_TYPES.gravity_inversion, interval: 5, duration: 12 },
        { type: BOSS_MECHANIC_TYPES.void_spawn,        interval: 4, count: 6 },
        { type: BOSS_MECHANIC_TYPES.board_shrink,      interval: 20 },
        { type: BOSS_MECHANIC_TYPES.corruption_wave,   interval: 8 },
      ],
      gravityMult:    2.5,
      pieceSpeedMult: 2.5,
      visualShift:    'wither_annihilation',
    },
  ];

  var phases = baseDef.phases.slice();
  var toAdd = Math.min(extraPhases, escalated.length);
  for (var i = 0; i < toAdd; i++) {
    phases.push(escalated[i]);
  }
  def.phases = phases;
  return def;
}

/**
 * Returns the gravity multiplier for the current dungeon floor.
 * Called by piece physics when gameDepthsMode is 'dungeon'.
 */
function getDungeonGravityMult() {
  return gameDepthsMode === 'dungeon' ? _dungeonGravityMult : 1.0;
}

/**
 * Returns the hazard block weights for the current dungeon floor.
 * Called by piece spawning when gameDepthsMode is 'dungeon'.
 */
function getDungeonHazardWeights() {
  return gameDepthsMode === 'dungeon' ? _dungeonHazardWeights : null;
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
    case 'entropy':
      // Entropy: random block decay — Infinite Depths Descent 3+ only
      if (typeof isInfiniteMode === 'function' && isInfiniteMode() &&
          typeof getInfiniteRun === 'function') {
        var _entropyRun = getInfiniteRun();
        if (_entropyRun && _entropyRun.descentNum >= 3) {
          _dungeonEntropyActive = true;
        }
      }
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
var _dungeonEntropyActive   = false;

/**
 * Returns true if horizontal controls should be inverted (Mirror World modifier).
 */
function isDungeonMirrorControls() {
  return gameDepthsMode === 'dungeon' && _dungeonMirrorControls;
}

/**
 * Returns true if the Entropy modifier is active on the current floor.
 */
function isDungeonEntropyActive() {
  return gameDepthsMode === 'dungeon' && _dungeonEntropyActive;
}

/**
 * Returns the gravity flux multiplier for the current frame.
 * Oscillates sinusoidally if the gravity_flux modifier is active.
 */
function getDungeonGravityFluxMult() {
  if (!gameDepthsMode === 'dungeon' || !_dungeonGravityFlux) return 1.0;
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
  return gameDepthsMode === 'dungeon' ? _dungeonDroughtPiece : -1;
}

/**
 * Returns the obsidian vein replacement config, or null.
 */
function getDungeonBlockReplace() {
  return gameDepthsMode === 'dungeon' ? _dungeonBlockReplace : null;
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
  if (!gameDepthsMode === 'dungeon') return;
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
    // Track boss-specific achievements
    var bossConfig = getDungeonBossConfig();
    if (bossConfig && typeof achOnDepthsBossDefeated === 'function') {
      achOnDepthsBossDefeated(bossConfig.bossId);
    }
  }

  // Roll loot using the depths loot system (depths-loot.js) if available,
  // then fall back to base rarity system (loot-tables.js), then simple roll.
  var floorLoot = [];
  var rarityDrops = null;
  var tier = session.tier || 'shallow';

  if (typeof rollDepthsFloorLoot === 'function') {
    // Preferred path: full depths loot system with tier-scoped pools
    rarityDrops = rollDepthsFloorLoot(tier, floorNum, isBoss);
    for (var i = 0; i < rarityDrops.length; i++) {
      var rd = rarityDrops[i];
      addDungeonLoot(rd.item.id, 1);
      floorLoot.push({ item: rd.item.id, amount: 1, rarity: rd.rarity, lootDrop: rd });
    }
    if (typeof saveDepthsLootDrops === 'function') saveDepthsLootDrops(rarityDrops);
    // Also save to base inventory for backward compat
    if (typeof saveLootDrops === 'function') saveLootDrops(rarityDrops);
    // Check boss first-kill reward (depths version first, then base)
    if (isBoss) {
      var bossConfig = getDungeonBossConfig();
      if (bossConfig) {
        var bossReward = null;
        if (typeof checkDepthsBossFirstKill === 'function') {
          bossReward = checkDepthsBossFirstKill(bossConfig.bossId);
        }
        if (!bossReward && typeof checkBossFirstKillReward === 'function') {
          bossReward = checkBossFirstKillReward(bossConfig.bossId);
        }
        if (bossReward) {
          addDungeonLoot(bossReward.id, 1);
          floorLoot.push({ item: bossReward.id, amount: 1, rarity: bossReward.rarity, isBossReward: true, lootDrop: { item: bossReward, rarity: bossReward.rarity, isDuplicate: false, bonusXP: 0 } });
        }
      }
    }
  } else if (typeof rollFloorLoot === 'function') {
    // Fallback: base rarity system
    rarityDrops = rollFloorLoot(tier, floorNum, isBoss);
    for (var i = 0; i < rarityDrops.length; i++) {
      var rd = rarityDrops[i];
      addDungeonLoot(rd.item.id, 1);
      floorLoot.push({ item: rd.item.id, amount: 1, rarity: rd.rarity, lootDrop: rd });
    }
    if (typeof saveLootDrops === 'function') saveLootDrops(rarityDrops);
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

  // Track dungeon mission progress
  if (typeof onDepthsMissionFloorCleared === 'function') onDepthsMissionFloorCleared();
  if (typeof onDepthsMissionFloorReached === 'function') onDepthsMissionFloorReached(floorNum);
  if (isBoss && typeof onDepthsMissionBossDefeated === 'function') onDepthsMissionBossDefeated();

  // Track loot collection for achievements
  if (floorLoot.length > 0 && typeof achOnDepthsLootCollected === 'function') {
    achOnDepthsLootCollected(floorLoot.length);
  }
  // Check vault completion after new loot is saved
  if (typeof achCheckVaultCompletion === 'function') achCheckVaultCompletion();

  // Pause gameplay
  dungeonFloorTimerActive = false;
  depthsFloorTimerActive  = false;

  // Update dungeon HUD loot display
  if (typeof depthsHud !== 'undefined' && depthsHud) depthsHud.updateLoot();

  // Advance session state (marks current floor cleared, moves index)
  var nextFloor = advanceDungeonFloor();

  if (session.completed) {
    // Infinite Depths: after floor 7, show inter-Descent screen instead
    if (typeof isInfiniteMode === 'function' && isInfiniteMode() && typeof showInfiniteDescentScreen === 'function') {
      var infRun = (typeof getInfiniteRun === 'function') ? getInfiniteRun() : null;
      var descentNum = infRun ? infRun.descentNum : 1;
      showInfiniteDescentScreen(descentNum, floorLoot);
    } else {
      // Standard dungeon: all floors cleared
      _showDungeonExtractionScreen(floorNum, floorLoot, true);
    }
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

  // Consumables (usable at extraction screen)
  if (typeof getDepthsConsumableCount === 'function' && !isComplete) {
    var hasConsumables = false;
    var consumableHtml = '<div class="dt-consumables">';
    consumableHtml += '<div class="dt-consumables-title">USE CONSUMABLE</div>';

    // Extra Life
    var extraLifeCount = getDepthsConsumableCount('depths_consumable_extra_life');
    if (extraLifeCount > 0) {
      hasConsumables = true;
      consumableHtml += '<button class="dt-consumable-btn" id="dungeon-use-extra-life" title="Revive once on death">' +
        '\u2764\uFE0F Extra Life <span class="dt-consumable-count">x' + extraLifeCount + '</span></button>';
    }

    // Loot Magnet
    var lootMagnetCount = getDepthsConsumableCount('depths_consumable_loot_magnet');
    if (lootMagnetCount > 0) {
      hasConsumables = true;
      consumableHtml += '<button class="dt-consumable-btn" id="dungeon-use-loot-magnet" title="Double loot on next floor">' +
        '\uD83E\uDDF2 Loot Magnet <span class="dt-consumable-count">x' + lootMagnetCount + '</span></button>';
    }

    // Floor Skip
    var floorSkipCount = getDepthsConsumableCount('depths_consumable_floor_skip');
    if (floorSkipCount > 0) {
      hasConsumables = true;
      consumableHtml += '<button class="dt-consumable-btn" id="dungeon-use-floor-skip" title="Skip the next floor">' +
        '\u23ED\uFE0F Floor Skip <span class="dt-consumable-count">x' + floorSkipCount + '</span></button>';
    }

    consumableHtml += '</div>';
    if (hasConsumables) html += consumableHtml;
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

  // Wire consumable buttons
  var extraLifeBtn = document.getElementById('dungeon-use-extra-life');
  if (extraLifeBtn) {
    extraLifeBtn.onclick = function () {
      if (typeof activateExtraLife === 'function' && activateExtraLife()) {
        extraLifeBtn.disabled = true;
        extraLifeBtn.textContent = '\u2764\uFE0F Extra Life ACTIVE';
        extraLifeBtn.classList.add('dt-consumable-used');
      }
    };
  }

  var lootMagnetBtn = document.getElementById('dungeon-use-loot-magnet');
  if (lootMagnetBtn) {
    lootMagnetBtn.onclick = function () {
      if (typeof activateLootMagnet === 'function' && activateLootMagnet()) {
        lootMagnetBtn.disabled = true;
        lootMagnetBtn.textContent = '\uD83E\uDDF2 Loot Magnet ACTIVE';
        lootMagnetBtn.classList.add('dt-consumable-used');
      }
    };
  }

  var floorSkipBtn = document.getElementById('dungeon-use-floor-skip');
  if (floorSkipBtn && nextFloor) {
    floorSkipBtn.onclick = function () {
      if (typeof useDepthsConsumable === 'function' && useDepthsConsumable('depths_consumable_floor_skip')) {
        floorSkipBtn.disabled = true;
        floorSkipBtn.textContent = '\u23ED\uFE0F Skipping...';
        floorSkipBtn.classList.add('dt-consumable-used');
        // Skip the next floor: advance again and descend to the one after
        var skippedFloor = advanceDungeonFloor();
        if (skippedFloor) {
          setTimeout(function () {
            overlay.style.display = 'none';
            _handleDungeonDescend(skippedFloor);
          }, 500);
        }
      }
    };
  }

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
  // Infinite Depths: mid-Descent extract ends the entire run
  if (typeof isInfiniteMode === 'function' && isInfiniteMode()) {
    extractFromDungeon();
    if (typeof depthsHud !== 'undefined' && depthsHud) depthsHud.hide();
    if (typeof extractInfiniteRun === 'function') extractInfiniteRun();
    if (typeof showInfiniteRunResults === 'function') showInfiniteRunResults(false);
    return;
  }

  extractFromDungeon();

  // Hide dungeon HUD overlay
  if (typeof depthsHud !== 'undefined' && depthsHud) depthsHud.hide();

  // Save loot to inventory
  var loot = getDungeonLoot();

  // Full Extract achievement: extract with 3+ loot items
  if (typeof achOnDepthsExtract === 'function') achOnDepthsExtract(loot.length);
  _saveDungeonLootToInventory(loot);

  // Track dungeon mission progress for extraction
  if (typeof onDepthsMissionExtract === 'function') onDepthsMissionExtract(loot.length);

  // Persist run stats
  var summary = getDungeonSessionSummary();
  _persistDungeonRunStats(summary);

  // Track speedrun mission (extract counts as completion)
  if (summary.totalTimeMs && typeof onDepthsMissionRunComplete === 'function') {
    onDepthsMissionRunComplete(summary.totalTimeMs);
  }

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

  // Restore dungeon mode (resetGame clears it)
  gameDepthsMode = 'dungeon';

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
 * Internal death handler for boss encounter callback.
 * Wraps handleDungeonDeath for use as a callback from the boss state machine.
 */
function _handleDungeonDeath() {
  handleDungeonDeath();
}

/**
 * Handle dungeon death. Called from triggerGameOver when gameDepthsMode is 'dungeon'.
 * If Extra Life is active, revive instead of dying. Otherwise,
 * un-extracted loot is lost. XP and first-clear bonuses are kept.
 */
function handleDungeonDeath() {
  // Check for Extra Life consumable
  if (typeof consumeExtraLife === 'function' && consumeExtraLife()) {
    // Revive: reset the board but keep session state and loot
    if (typeof resetGame === 'function') resetGame();
    gameDepthsMode = 'dungeon';
    var floor = getDungeonCurrentFloor();
    if (floor) {
      _applyDungeonFloor(floor);
      _updateDungeonFloorHUD(floor);
    }
    if (typeof depthsHud !== 'undefined' && depthsHud) depthsHud.show();
    if (typeof snapshotDepthsFloorStart === 'function') snapshotDepthsFloorStart();
    dungeonFloorTimerActive = true;
    depthsFloorTimerActive  = true;
    return;
  }

  dungeonDeath();

  // Hide dungeon HUD overlay
  if (typeof depthsHud !== 'undefined' && depthsHud) depthsHud.hide();

  // Infinite Depths: current Descent loot is forfeited; banked loot is kept
  if (typeof isInfiniteMode === 'function' && isInfiniteMode()) {
    if (typeof onInfiniteDescentDeath === 'function') onInfiniteDescentDeath();
    if (typeof showInfiniteRunResults === 'function') showInfiniteRunResults(true);
    return;
  }

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
  if (!gameDepthsMode === 'dungeon' || !dungeonFloorTimerActive) return;

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
  if (!gameDepthsMode === 'dungeon') return;
  dungeonFloorLinesCleared += lineCount;
  depthsFloorLinesCleared = dungeonFloorLinesCleared; // sync legacy var

  // Deal line-clear damage to boss if active
  if (depthsBossActive && typeof dealBossLineDamage === 'function') {
    dealBossLineDamage(lineCount);
  }

  checkDungeonFloorClear('line_clear');
}

// ── Mine block hook ──────────────────────────────────────────────────────────

/**
 * Called when a block is mined in dungeon mode.
 * Updates floor mine count and checks clear condition.
 */
function onDungeonBlockMined() {
  if (!gameDepthsMode === 'dungeon') return;
  dungeonFloorBlocksMined++;

  // Deal mine damage to boss if active
  if (depthsBossActive && typeof dealBossMineDamage === 'function') {
    dealBossMineDamage(1);
  }

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
  if (floorNumEl) {
    if (typeof isInfiniteMode === 'function' && isInfiniteMode() && typeof getInfiniteRun === 'function') {
      var infRun = getInfiniteRun();
      if (infRun) {
        floorNumEl.textContent = 'DESCENT ' + infRun.descentNum + ' \u2014 FLOOR ' + getDungeonFloorNum();
      } else {
        floorNumEl.textContent = 'FLOOR ' + getDungeonFloorNum() + '/' + totalFloors;
      }
    } else {
      floorNumEl.textContent = 'FLOOR ' + getDungeonFloorNum() + '/' + totalFloors;
    }
  }

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
  if (!gameDepthsMode === 'dungeon') return;
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
  var titleClass = 'drw-title-victory';
  if (isDeath) {
    title = 'FALLEN ON FLOOR ' + (summary.floorsCleared + 1);
    titleClass = 'drw-title-death';
  } else if (isExtract) {
    title = 'EXTRACTED ON FLOOR ' + summary.extractionFloor;
    titleClass = 'drw-title-extract';
  }

  var totalSecs = Math.floor((summary.totalTimeMs || 0) / 1000);
  var mm = Math.floor(totalSecs / 60).toString().padStart(2, '0');
  var ss = (totalSecs % 60).toString().padStart(2, '0');
  var runScore = score || 0;
  var runLines = linesCleared || 0;
  var runBlocks = blocksMined || 0;

  var panel = overlay.querySelector('.depths-results-panel');
  if (!panel) return;

  // -- Load personal bests for comparison --
  var dungeonId = summary.dungeonId || 'unknown';
  var prevStats = {};
  try { prevStats = JSON.parse(localStorage.getItem(DUNGEON_STATS_KEY) || '{}'); } catch (_) {}
  var prevBestFloor = (prevStats.bestFloors && prevStats.bestFloors[dungeonId]) || 0;
  var prevBestScore = (prevStats.bestScores && prevStats.bestScores[dungeonId]) || 0;
  var prevBestTime  = (prevStats.bestTimes  && prevStats.bestTimes[dungeonId])  || 0;

  var isNewBestFloor = summary.floorsCleared > prevBestFloor;
  var isNewBestScore = runScore > prevBestScore;
  var isNewBestTime  = (isExtract || isVictory) && (prevBestTime === 0 || (summary.totalTimeMs || 0) < prevBestTime);

  // -- Resolve loot items with catalog data --
  var lootItems = [];
  if ((isExtract || isVictory) && summary.loot && summary.loot.length > 0) {
    for (var li = 0; li < summary.loot.length; li++) {
      var lootEntry = summary.loot[li];
      var catalogItem = (typeof getLootItemById === 'function') ? getLootItemById(lootEntry.item) : null;
      lootItems.push({
        id:     lootEntry.item,
        amount: lootEntry.amount,
        name:   catalogItem ? catalogItem.name : lootEntry.item,
        icon:   catalogItem ? catalogItem.icon : _getLootIcon(lootEntry.item),
        rarity: catalogItem ? catalogItem.rarity : 'common',
      });
    }
    // Sort by rarity (highest last for dramatic reveal)
    var rarityOrder = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
    lootItems.sort(function (a, b) { return (rarityOrder[a.rarity] || 0) - (rarityOrder[b.rarity] || 0); });
  }

  // -- Build HTML --
  var html = '';

  // Title
  html += '<div class="drw-title ' + titleClass + '">' + title + '</div>';
  html += '<div class="drw-dungeon-name">' + (summary.dungeonName || '') + ' &mdash; ' + (summary.tier || '') + '</div>';

  // Section 1: Run Stats
  html += '<div class="drw-section drw-stats">';
  html += '<div class="drw-section-title">RUN STATS</div>';
  html += '<div class="drw-stat-grid">';
  html += '<div class="drw-stat" style="animation-delay:0.1s"><span class="drw-stat-label">FLOORS</span><span class="drw-stat-value">' + summary.floorsCleared + '/' + summary.totalFloors + '</span></div>';
  html += '<div class="drw-stat" style="animation-delay:0.2s"><span class="drw-stat-label">TIME</span><span class="drw-stat-value">' + mm + ':' + ss + '</span></div>';
  html += '<div class="drw-stat" style="animation-delay:0.3s"><span class="drw-stat-label">SCORE</span><span class="drw-stat-value">' + runScore.toLocaleString() + '</span></div>';
  html += '<div class="drw-stat" style="animation-delay:0.4s"><span class="drw-stat-label">LINES</span><span class="drw-stat-value">' + runLines + '</span></div>';
  html += '<div class="drw-stat" style="animation-delay:0.5s"><span class="drw-stat-label">BLOCKS MINED</span><span class="drw-stat-value">' + runBlocks + '</span></div>';
  html += '<div class="drw-stat" style="animation-delay:0.6s"><span class="drw-stat-label">BOSS DEFEATED</span><span class="drw-stat-value">' + (summary.bossDefeated ? 'YES' : 'NO') + '</span></div>';
  html += '</div></div>';

  // Section 2: Loot Reveal
  if (lootItems.length > 0) {
    html += '<div class="drw-section drw-loot-section">';
    html += '<div class="drw-section-title">LOOT SECURED</div>';
    html += '<div class="drw-loot-grid" id="drw-loot-grid">';
    for (var lk = 0; lk < lootItems.length; lk++) {
      var li2 = lootItems[lk];
      var rarityColor = LOOT_RARITY[li2.rarity] ? LOOT_RARITY[li2.rarity].color : '#9ca3af';
      var rarityLabel = LOOT_RARITY[li2.rarity] ? LOOT_RARITY[li2.rarity].label : 'Common';
      // Start hidden; JS will reveal them one by one
      html += '<div class="drw-loot-orb drw-rarity-' + li2.rarity + '" data-rarity="' + li2.rarity + '" style="--rarity-color:' + rarityColor + '">';
      html += '<div class="drw-orb-shell">&#11044;</div>';
      html += '<div class="drw-orb-reveal">';
      html += '<span class="drw-loot-icon">' + li2.icon + '</span>';
      html += '<span class="drw-loot-name">' + li2.name + '</span>';
      if (li2.amount > 1) html += '<span class="drw-loot-amount">x' + li2.amount + '</span>';
      html += '<span class="drw-loot-rarity" style="color:' + rarityColor + '">' + rarityLabel + '</span>';
      html += '</div></div>';
    }
    html += '</div></div>';
  } else if (isDeath) {
    html += '<div class="drw-section drw-loot-lost">';
    html += '<div class="drw-section-title">LOOT LOST</div>';
    html += '<div class="drw-loot-lost-text">All un-extracted loot has been lost.</div>';
    html += '</div>';
  }

  // Section 3: Personal Best
  html += '<div class="drw-section drw-personal-best">';
  html += '<div class="drw-section-title">PERSONAL BEST</div>';
  html += '<div class="drw-pb-grid">';

  // Floors
  html += '<div class="drw-pb-row">';
  html += '<span class="drw-pb-label">FLOORS</span>';
  html += '<span class="drw-pb-this">' + summary.floorsCleared + '</span>';
  html += '<span class="drw-pb-vs">vs</span>';
  html += '<span class="drw-pb-best">' + prevBestFloor + '</span>';
  if (isNewBestFloor) html += '<span class="drw-pb-new">NEW!</span>';
  html += '</div>';

  // Score
  html += '<div class="drw-pb-row">';
  html += '<span class="drw-pb-label">SCORE</span>';
  html += '<span class="drw-pb-this">' + runScore.toLocaleString() + '</span>';
  html += '<span class="drw-pb-vs">vs</span>';
  html += '<span class="drw-pb-best">' + prevBestScore.toLocaleString() + '</span>';
  if (isNewBestScore) html += '<span class="drw-pb-new">NEW!</span>';
  html += '</div>';

  // Time (only if completed/extracted)
  if (isExtract || isVictory) {
    var prevBestTimeSecs = Math.floor(prevBestTime / 1000);
    var pbMM = Math.floor(prevBestTimeSecs / 60).toString().padStart(2, '0');
    var pbSS = (prevBestTimeSecs % 60).toString().padStart(2, '0');
    html += '<div class="drw-pb-row">';
    html += '<span class="drw-pb-label">TIME</span>';
    html += '<span class="drw-pb-this">' + mm + ':' + ss + '</span>';
    html += '<span class="drw-pb-vs">vs</span>';
    html += '<span class="drw-pb-best">' + (prevBestTime > 0 ? pbMM + ':' + pbSS : '--:--') + '</span>';
    if (isNewBestTime) html += '<span class="drw-pb-new">NEW!</span>';
    html += '</div>';
  }
  html += '</div></div>';

  // Section 4: XP Earned
  var xpEarned = Math.floor(runScore / 50);
  html += '<div class="drw-section drw-xp-section">';
  html += '<div class="drw-xp-bar">';
  html += '<span class="drw-xp-label">XP EARNED</span>';
  html += '<span class="drw-xp-value" id="drw-xp-counter">+0</span>';
  html += '</div></div>';

  // Section 5: Action Buttons
  html += '<div class="drw-actions">';
  html += '<button class="drw-btn drw-btn-retry">&#9654; Run Again <span class="key-hint">[Enter]</span></button>';
  html += '<button class="drw-btn drw-btn-lobby">&#8592; Back to Menu <span class="key-hint">[Esc]</span></button>';
  html += '<button class="drw-btn drw-btn-share">&#9993; Share Result <span class="key-hint">[S]</span></button>';
  html += '</div>';

  panel.innerHTML = html;

  // -- Award XP --
  if (typeof awardXP === 'function') {
    awardXP(runScore, 'dungeon');
  }
  // -- Submit lifetime stats --
  if (typeof submitLifetimeStats === 'function') {
    submitLifetimeStats({
      score:       runScore,
      blocksMined: runBlocks,
      linesCleared: runLines,
    });
  }

  // -- Show overlay --
  overlay.style.display = 'flex';
  overlay.setAttribute('tabindex', '-1');
  overlay.focus();

  // -- Animate loot reveal --
  _animateLootReveal(lootItems, xpEarned);

  // -- Wire buttons --
  var retryBtn = overlay.querySelector('.drw-btn-retry');
  if (retryBtn) {
    retryBtn.onclick = function () {
      overlay.style.display = 'none';
      var session = getDungeonSession();
      var did = session ? session.dungeonId : 'shallow_mines';
      if (typeof resetGame === 'function') resetGame();
      document.dispatchEvent(new CustomEvent('dungeonLaunch', { detail: { dungeonId: did } }));
    };
  }

  var lobbyBtn = overlay.querySelector('.drw-btn-lobby');
  if (lobbyBtn) {
    // If the dungeon was launched from the survival cave mouth, offer a direct return
    if (typeof survivalFromCaveMouth !== 'undefined' && survivalFromCaveMouth) {
      lobbyBtn.textContent = '⛏ Return to Surface';
      lobbyBtn.onclick = function () {
        if (typeof returnToSurvival === 'function') returnToSurvival();
      };
    } else {
      lobbyBtn.onclick = function () {
        overlay.style.display = 'none';
        if (typeof resetGame === 'function') resetGame();
      };
    }
  }

  var shareBtn = overlay.querySelector('.drw-btn-share');
  if (shareBtn) {
    shareBtn.onclick = function () {
      _shareDungeonResult(summary, runScore, runLines, mm + ss);
    };
  }

  // -- Keyboard handlers --
  overlay.addEventListener('keydown', function (e) {
    if (e.key === 'Enter')  { e.preventDefault(); if (retryBtn) retryBtn.click(); }
    if (e.key === 'Escape') { e.preventDefault(); if (lobbyBtn) lobbyBtn.click(); }
    if (e.key === 's' || e.key === 'S') { e.preventDefault(); if (shareBtn) shareBtn.click(); }
  });
}

/**
 * Animate loot orbs revealing one by one with escalating pauses for rarer items.
 * Then count up the XP earned.
 */
function _animateLootReveal(lootItems, xpEarned) {
  var orbs = document.querySelectorAll('.drw-loot-orb');
  var baseDelay = 600; // ms per common item

  var rarityDelays = {
    common: 600, uncommon: 800, rare: 1000, epic: 1300, legendary: 1800
  };

  var cumulativeDelay = 800; // initial pause before first reveal
  for (var i = 0; i < orbs.length; i++) {
    (function (orb, delay) {
      setTimeout(function () {
        orb.classList.add('drw-orb-revealed');
      }, delay);
    })(orbs[i], cumulativeDelay);
    var rarity = lootItems[i] ? lootItems[i].rarity : 'common';
    cumulativeDelay += (rarityDelays[rarity] || baseDelay);
  }

  // XP count-up animation after all loot is revealed
  var xpDelay = cumulativeDelay + 400;
  var xpEl = document.getElementById('drw-xp-counter');
  if (xpEl && xpEarned > 0) {
    setTimeout(function () {
      var duration = 1200;
      var start = performance.now();
      function tick(now) {
        var elapsed = now - start;
        var progress = Math.min(elapsed / duration, 1);
        // Ease-out
        var eased = 1 - Math.pow(1 - progress, 3);
        xpEl.textContent = '+' + Math.floor(xpEarned * eased).toLocaleString();
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }, xpDelay);
  } else if (xpEl) {
    xpEl.textContent = '+' + xpEarned;
  }
}

/**
 * Generate a share URL and copy it to clipboard (or open share dialog).
 */
function _shareDungeonResult(summary, runScore, runLines, mmss) {
  var mode = 'Dungeon';
  var shareStr = mode + '-' + runScore + '-' + runLines + '-' + mmss;
  var url = location.origin + location.pathname + '?share=' + encodeURIComponent(shareStr);

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(function () {
      var shareBtn = document.querySelector('.drw-btn-share');
      if (shareBtn) {
        shareBtn.textContent = 'Copied!';
        setTimeout(function () { shareBtn.innerHTML = '&#9993; Share Result <span class="key-hint">[S]</span>'; }, 2000);
      }
    });
  } else if (navigator.share) {
    navigator.share({ title: 'MineCtris Dungeon Run', text: 'I scored ' + runScore.toLocaleString() + ' in a dungeon run!', url: url });
  }
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

    // Best score per dungeon
    if (!stats.bestScores) stats.bestScores = {};
    var runScore = score || 0;
    if (runScore > (stats.bestScores[dungeonId] || 0)) {
      stats.bestScores[dungeonId] = runScore;
    }

    // Best time (fastest completion) per dungeon — only for completed/extracted runs
    if (summary.completed || summary.extracted) {
      if (!stats.bestTimes) stats.bestTimes = {};
      var runTime = summary.totalTimeMs || 0;
      var prevBest = stats.bestTimes[dungeonId] || 0;
      if (prevBest === 0 || runTime < prevBest) {
        stats.bestTimes[dungeonId] = runTime;
      }
    }

    stats.lastRunAt = Date.now();

    localStorage.setItem(DUNGEON_STATS_KEY, JSON.stringify(stats));
  } catch (_) {}
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
  gameDepthsMode = null;
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
