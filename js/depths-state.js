// Runtime session state management for the Expeditions dungeon system.
// Tracks current dungeon run: floor progression, loot, time, extraction, and boss status.
//
// Requires: depths-config.js (DUNGEON_DEFINITIONS, DUNGEON_FLOOR_TEMPLATES, DUNGEON_MODIFIER_REGISTRY)
// Used by: main.js (dungeon launch/reset), gamestate.js (game over), depths-floor-gen.js (floor setup)

// ── Session state ────────────────────────────────────────────────────────────
// All dungeon session state is held in a single object for clean reset.

var _dungeonSession = null;

/**
 * Start a new dungeon session.
 * Uses the seeded floor generator from depths-floor-gen.js when a seed is
 * provided, falling back to the template-based generation otherwise.
 *
 * @param {string}              dungeonId  Id from DUNGEON_DEFINITIONS (e.g. 'shallow_mines')
 * @param {string|number|null}  seed       Optional seed for deterministic replay
 * @returns {object|null}  The session object, or null if dungeonId is invalid.
 */
function startDungeonSession(dungeonId, seed) {
  var def = getDungeonDef(dungeonId);
  if (!def) return null;

  // Generate a seed if none provided (random, but captured for share codes)
  if (seed == null) seed = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Use the seeded procedural generator when available
  var floors;
  if (typeof generateSeededDungeonRun === 'function') {
    var run = generateSeededDungeonRun(dungeonId, seed);
    if (run) {
      floors = run.floors;
    }
  }

  // Fallback: template-based generation (non-seeded)
  if (!floors) {
    // Pre-compute Infinite Depths scaling for this session
    var infScaling = null;
    if (typeof isInfiniteMode === 'function' && isInfiniteMode() &&
        typeof getInfiniteScaling === 'function') {
      var infRun = (typeof getInfiniteRun === 'function') ? getInfiniteRun() : null;
      if (infRun) infScaling = getInfiniteScaling(infRun.descentNum);
    }

    floors = [];
    for (var i = 0; i < def.floors.length; i++) {
      var tmpl = getDungeonFloorTemplate(def.floors[i]);
      if (!tmpl) continue;

      // Determine effective modifier pool and count
      var effectivePool  = tmpl.modifierPool;
      var effectiveCount = tmpl.modifierCount;
      if (infScaling && tmpl.modifierCount > 0) {
        // At higher Descents, use the full dungeon-level modifier pool so more
        // varied modifiers can appear, then cap at the scaling-derived count.
        var allowedPool = def.allowedModifiers || tmpl.modifierPool;
        effectivePool  = allowedPool;
        effectiveCount = Math.min(allowedPool.length, infScaling.modifierCount);
      }
      var rolledMods = pickDungeonModifiers(effectivePool, effectiveCount);

      // Scale clear conditions by Descent number
      var clearCond = tmpl.clearCondition;
      if (infScaling && infScaling.clearConditionBonus > 0 && clearCond) {
        if (clearCond.type === 'clear_lines' || clearCond.type === 'mine_blocks') {
          clearCond = { type: clearCond.type, count: clearCond.count + infScaling.clearConditionBonus };
        }
      }

      floors.push({
        templateId:           tmpl.id,
        floorNumber:          tmpl.floorNumber,
        tier:                 tmpl.tier,
        modifiers:            rolledMods,
        piecePaletteOverride: tmpl.piecePaletteOverride,
        gravityMultiplier:    tmpl.gravityMultiplier,
        hazardBlockWeights:   tmpl.hazardBlockWeights,
        clearCondition:       clearCond,
        timeLimitSecs:        tmpl.timeLimitSecs,
        cleared:              false,
      });
    }
  }

  _dungeonSession = {
    dungeonId:          dungeonId,
    dungeonName:        def.name,
    tier:               def.tier,
    seed:               seed,
    lootTable:          def.lootTable,
    bossSlot:           def.bossSlot,

    // Floor progression
    floors:             floors,
    currentFloorIndex:  0,
    totalFloors:        floors.length,

    // Loot collected during the run
    loot:               [],

    // Time tracking
    startedAt:          Date.now(),
    floorStartedAt:     Date.now(),
    totalElapsedMs:     0,
    floorElapsedMs:     0,

    // Extraction: player can extract (leave early with loot) at transition screens
    extracted:          false,
    extractionFloor:    -1,

    // Boss encounter
    bossEncountered:    false,
    bossDefeated:       false,

    // Run outcome
    completed:          false,
    died:               false,
  };

  return _dungeonSession;
}

/**
 * Returns the active dungeon session, or null if no run is active.
 */
function getDungeonSession() {
  return _dungeonSession;
}

/**
 * Returns the current floor config from the active session, or null.
 */
function getDungeonCurrentFloor() {
  if (!_dungeonSession) return null;
  var idx = _dungeonSession.currentFloorIndex;
  if (idx < 0 || idx >= _dungeonSession.floors.length) return null;
  return _dungeonSession.floors[idx];
}

/**
 * Returns the current floor number (1-based), or 0 if no session.
 */
function getDungeonFloorNum() {
  if (!_dungeonSession) return 0;
  return _dungeonSession.currentFloorIndex + 1;
}

// ── Floor advancement ────────────────────────────────────────────────────────

/**
 * Mark the current floor as cleared and advance to the next.
 * Returns the next floor config, or null if the dungeon is complete.
 */
function advanceDungeonFloor() {
  if (!_dungeonSession) return null;

  var idx = _dungeonSession.currentFloorIndex;
  if (idx >= 0 && idx < _dungeonSession.floors.length) {
    _dungeonSession.floors[idx].cleared = true;
  }

  // Snapshot floor elapsed time into total
  _dungeonSession.totalElapsedMs += Date.now() - _dungeonSession.floorStartedAt;

  _dungeonSession.currentFloorIndex++;
  if (_dungeonSession.currentFloorIndex >= _dungeonSession.totalFloors) {
    // All floors cleared
    _dungeonSession.completed = true;
    return null;
  }

  _dungeonSession.floorStartedAt = Date.now();
  _dungeonSession.floorElapsedMs = 0;
  return getDungeonCurrentFloor();
}

// ── Extraction ───────────────────────────────────────────────────────────────

/**
 * Extract from the dungeon (leave early, keeping collected loot).
 * Can only extract between floors (not mid-floor).
 */
function extractFromDungeon() {
  if (!_dungeonSession) return false;
  _dungeonSession.extracted = true;
  _dungeonSession.extractionFloor = _dungeonSession.currentFloorIndex + 1;
  _dungeonSession.totalElapsedMs += Date.now() - _dungeonSession.floorStartedAt;
  return true;
}

/**
 * Returns true if the player has extracted from the current run.
 */
function isDungeonExtracted() {
  return _dungeonSession ? _dungeonSession.extracted : false;
}

// ── Death ────────────────────────────────────────────────────────────────────

/**
 * Mark the current run as ended by death. Loot is forfeited.
 */
function dungeonDeath() {
  if (!_dungeonSession) return;
  _dungeonSession.died = true;
  _dungeonSession.totalElapsedMs += Date.now() - _dungeonSession.floorStartedAt;
}

// ── Loot management ──────────────────────────────────────────────────────────

/**
 * Add a loot drop to the session. Each drop: { item, amount, floorNum }.
 */
function addDungeonLoot(item, amount) {
  if (!_dungeonSession) return;
  _dungeonSession.loot.push({
    item:     item,
    amount:   amount,
    floorNum: _dungeonSession.currentFloorIndex + 1,
  });
}

/**
 * Returns the collected loot array. Empty array if no session or no loot.
 */
function getDungeonLoot() {
  return _dungeonSession ? _dungeonSession.loot : [];
}

/**
 * Roll a loot drop from the dungeon's loot table.
 * Returns { item, amount } or null if no loot table.
 */
function rollDungeonLoot() {
  if (!_dungeonSession) return null;
  var table = getDungeonLootTable(_dungeonSession.lootTable);
  if (!table || !table.drops || table.drops.length === 0) return null;

  // Weighted random pick
  var totalWeight = 0;
  for (var i = 0; i < table.drops.length; i++) totalWeight += table.drops[i].weight;
  var r = Math.random() * totalWeight;
  for (var j = 0; j < table.drops.length; j++) {
    r -= table.drops[j].weight;
    if (r <= 0) {
      var drop = table.drops[j];
      var amount = drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
      return { item: drop.item, amount: amount };
    }
  }
  return null;
}

// ── Boss encounter ───────────────────────────────────────────────────────────

/**
 * Mark that the boss encounter has started on the current floor.
 */
function startBossEncounter() {
  if (!_dungeonSession) return;
  _dungeonSession.bossEncountered = true;
}

/**
 * Mark the boss as defeated.
 */
function defeatBoss() {
  if (!_dungeonSession) return;
  _dungeonSession.bossDefeated = true;
}

/**
 * Returns true if the current floor is a boss floor.
 */
function isDungeonBossFloor() {
  if (!_dungeonSession || !_dungeonSession.bossSlot) return false;
  return (_dungeonSession.currentFloorIndex + 1) === _dungeonSession.bossSlot.floor;
}

/**
 * Returns the boss config for the current dungeon, or null.
 */
function getDungeonBossConfig() {
  if (!_dungeonSession || !_dungeonSession.bossSlot) return null;
  return _dungeonSession.bossSlot;
}

// ── Time tracking ────────────────────────────────────────────────────────────

/**
 * Update the floor elapsed time. Call each frame with delta ms.
 */
function updateDungeonFloorTime(deltaMs) {
  if (!_dungeonSession) return;
  _dungeonSession.floorElapsedMs += deltaMs;
}

/**
 * Returns total run elapsed time in milliseconds.
 */
function getDungeonTotalTimeMs() {
  if (!_dungeonSession) return 0;
  var running = _dungeonSession.completed || _dungeonSession.died || _dungeonSession.extracted
    ? 0
    : Date.now() - _dungeonSession.floorStartedAt;
  return _dungeonSession.totalElapsedMs + running;
}

/**
 * Returns the current floor elapsed time in milliseconds.
 */
function getDungeonFloorTimeMs() {
  return _dungeonSession ? _dungeonSession.floorElapsedMs : 0;
}

// ── Session summary ──────────────────────────────────────────────────────────

/**
 * Returns a summary of the completed/ended dungeon session.
 * Useful for results screens and leaderboard submission.
 */
function getDungeonSessionSummary() {
  if (!_dungeonSession) return null;

  var floorsCleared = 0;
  for (var i = 0; i < _dungeonSession.floors.length; i++) {
    if (_dungeonSession.floors[i].cleared) floorsCleared++;
  }

  return {
    dungeonId:       _dungeonSession.dungeonId,
    dungeonName:     _dungeonSession.dungeonName,
    tier:            _dungeonSession.tier,
    seed:            _dungeonSession.seed,
    floorsCleared:   floorsCleared,
    totalFloors:     _dungeonSession.totalFloors,
    loot:            _dungeonSession.loot.slice(),
    totalTimeMs:     getDungeonTotalTimeMs(),
    completed:       _dungeonSession.completed,
    extracted:       _dungeonSession.extracted,
    extractionFloor: _dungeonSession.extractionFloor,
    died:            _dungeonSession.died,
    bossEncountered: _dungeonSession.bossEncountered,
    bossDefeated:    _dungeonSession.bossDefeated,
  };
}

// ── Session reset ────────────────────────────────────────────────────────────

/**
 * Clear the active dungeon session. Call on return to lobby or game reset.
 */
function clearDungeonSession() {
  _dungeonSession = null;
}
