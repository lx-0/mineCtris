// World Event Engine — scheduler, event registry, and lifecycle hooks.
// Fires probabilistic in-game events during active Classic/Daily/Survival gameplay.
// Does NOT fire during pause, game-over, tutorial, Puzzle, Sprint, or Blitz modes.
//
// Requires: state.js loaded first (for activeEvent, eventRemainingMs, eventHistory,
//           isPuzzleMode, isSprintMode, isBlitzMode, isPaused, isGameOver).

// ── Event type registry ────────────────────────────────────────────────────────
const EVENT_TYPES = {
  NONE:        "NONE",
  PIECE_STORM: "PIECE_STORM",
  GOLDEN_HOUR: "GOLDEN_HOUR",
  EARTHQUAKE:  "EARTHQUAKE",
};

// ── Event durations (ms) ──────────────────────────────────────────────────────
const EVENT_DURATIONS_MS = {
  [EVENT_TYPES.PIECE_STORM]: 30000,
  [EVENT_TYPES.GOLDEN_HOUR]: 20000,
  [EVENT_TYPES.EARTHQUAKE]:  20000,
};

// ── Scheduler config ──────────────────────────────────────────────────────────
const EVENT_INTERVAL_MIN_MS = 90000;   // earliest a new event can fire
const EVENT_INTERVAL_MAX_MS = 180000;  // latest a new event can fire
const EVENT_COOLDOWN_MS     = 60000;   // mandatory gap after an event ends

// ── Internal scheduler state ──────────────────────────────────────────────────
let _schedulerAccumMs = 0;   // accumulated active-gameplay ms since last reset/end
let _cooldownRemainingMs = 0; // ms remaining in post-event cooldown
let _nextThresholdMs = _pickInterval(); // ms of active gameplay before next event

function _pickInterval() {
  return EVENT_INTERVAL_MIN_MS +
    Math.random() * (EVENT_INTERVAL_MAX_MS - EVENT_INTERVAL_MIN_MS);
}

// ── Guard: returns true only when events may fire ────────────────────────────
function _eventsAllowed() {
  if (isPuzzleMode || isSprintMode || isBlitzMode) return false;
  if (isPaused || isGameOver) return false;
  if (typeof isTutorialActive !== "undefined" && isTutorialActive) return false;
  return true;
}

// ── Public lifecycle functions ────────────────────────────────────────────────

/**
 * Start an event of the given type immediately.
 * Safe to call from debug hook or future event-specific code.
 * @param {string} type  One of EVENT_TYPES (except NONE).
 */
function startEvent(type) {
  if (!EVENT_TYPES[type] || type === EVENT_TYPES.NONE) {
    console.warn("[EventEngine] startEvent: unknown type:", type);
    return;
  }
  // End any currently running event cleanly
  if (activeEvent !== EVENT_TYPES.NONE) {
    _fireOnEnd(activeEvent);
  }

  activeEvent = type;
  eventRemainingMs = EVENT_DURATIONS_MS[type] || 30000;
  eventHistory.push({ type, startedAt: Date.now() });

  _fireOnStart(type);
}

/**
 * Tick the active event by delta seconds. Called from updateEventEngine.
 * @param {number} delta  Seconds since last frame.
 */
function tickEvent(delta) {
  if (activeEvent === EVENT_TYPES.NONE) return;

  eventRemainingMs -= delta * 1000;
  if (eventRemainingMs <= 0) {
    eventRemainingMs = 0;
    endEvent();
  } else {
    _fireOnTick(delta, activeEvent);
  }
}

/**
 * End the currently active event and start the cooldown.
 */
function endEvent() {
  if (activeEvent === EVENT_TYPES.NONE) return;

  const ended = activeEvent;
  activeEvent = EVENT_TYPES.NONE;
  eventRemainingMs = 0;

  _cooldownRemainingMs = EVENT_COOLDOWN_MS;
  _schedulerAccumMs    = 0;
  _nextThresholdMs     = _pickInterval();

  _fireOnEnd(ended);
}

// ── Lifecycle callbacks ────────────────────────────────────────────────────────

function _fireOnStart(type) {
  console.log("[EventEngine] Event started:", type);
  if (type === EVENT_TYPES.PIECE_STORM) _onPieceStormStart();
  if (type === EVENT_TYPES.GOLDEN_HOUR) _onGoldenHourStart();
}

function _fireOnTick(delta, type) {
  if (type === EVENT_TYPES.PIECE_STORM) _onPieceStormTick();
  if (type === EVENT_TYPES.GOLDEN_HOUR) _onGoldenHourTick();
}

function _fireOnEnd(type) {
  console.log("[EventEngine] Event ended:", type);
  if (type === EVENT_TYPES.PIECE_STORM) _onPieceStormEnd();
  if (type === EVENT_TYPES.GOLDEN_HOUR) _onGoldenHourEnd();
}

// ── Piece Storm implementation ────────────────────────────────────────────────

function _onPieceStormStart() {
  pieceStormActive = true;

  // Red atmospheric tint overlay
  const overlay = document.getElementById("storm-overlay");
  if (overlay) overlay.style.display = "block";

  // Countdown HUD
  const hud = document.getElementById("storm-hud");
  if (hud) {
    hud.textContent = "\u26A1 PIECE STORM \u26A1";
    hud.style.display = "block";
  }

  // Ominous rumble SFX
  if (typeof playStormRumble === "function") playStormRumble();

  // Announcement banner
  if (typeof showCraftedBanner === "function") {
    showCraftedBanner("\u26A1 PIECE STORM! Survive 30s!");
  }
}

function _onPieceStormTick() {
  // Update countdown timer in HUD
  const secs = Math.ceil(eventRemainingMs / 1000);
  const hud = document.getElementById("storm-hud");
  if (hud) hud.textContent = "\u26A1 " + secs + "s";
}

function _onPieceStormEnd() {
  pieceStormActive = false;

  // Hide overlays
  const overlay = document.getElementById("storm-overlay");
  if (overlay) overlay.style.display = "none";
  const hud = document.getElementById("storm-hud");
  if (hud) hud.style.display = "none";

  // Survivor bonus: +500 pts if player is still alive
  if (!isGameOver) {
    if (typeof addScore === "function") addScore(500);
    if (typeof showCraftedBanner === "function") {
      showCraftedBanner("Storm survived! +500");
    }
  }
}

// ── Golden Hour implementation ────────────────────────────────────────────────

const _GOLD_COLOR    = new THREE.Color(0xffd700);
const _GOLD_EMISSIVE = new THREE.Color(0x664400);

/** Apply gold color + emissive shimmer to all block meshes in a piece group. */
function _applyGoldToPiece(pieceGroup) {
  if (!pieceGroup || pieceGroup.userData.goldenHourColored) return;
  pieceGroup.traverse(function (node) {
    if (node.isMesh && node.userData.isBlock) {
      node.userData.goldenHourOriginalColor    = node.material.color.clone();
      node.userData.goldenHourOriginalEmissive = node.material.emissive
        ? node.material.emissive.clone()
        : new THREE.Color(0x000000);
      node.material.color.copy(_GOLD_COLOR);
      node.material.emissive.copy(_GOLD_EMISSIVE);
      node.material.needsUpdate = true;
    }
  });
  pieceGroup.userData.goldenHourColored = true;
}

/** Revert a piece group to its pre-Golden Hour material colors. */
function _revertGoldFromPiece(pieceGroup) {
  if (!pieceGroup || !pieceGroup.userData.goldenHourColored) return;
  pieceGroup.traverse(function (node) {
    if (node.isMesh && node.userData.isBlock) {
      if (node.userData.goldenHourOriginalColor) {
        node.material.color.copy(node.userData.goldenHourOriginalColor);
      }
      if (node.userData.goldenHourOriginalEmissive) {
        node.material.emissive.copy(node.userData.goldenHourOriginalEmissive);
      }
      node.material.needsUpdate = true;
    }
  });
  pieceGroup.userData.goldenHourColored = false;
}

function _onGoldenHourStart() {
  goldenHourActive = true;

  // Golden ambient tint overlay
  const overlay = document.getElementById("golden-hour-overlay");
  if (overlay) overlay.style.display = "block";

  // Countdown HUD
  const hud = document.getElementById("golden-hour-hud");
  if (hud) {
    hud.textContent = "\u2728 GOLDEN HOUR \u2728";
    hud.style.display = "block";
  }

  // Paint all currently active falling pieces gold
  if (typeof fallingPiecesGroup !== "undefined" && fallingPiecesGroup) {
    fallingPiecesGroup.children.forEach(_applyGoldToPiece);
  }

  // Angelic chime SFX
  if (typeof playGoldenHourChime === "function") playGoldenHourChime();

  // Announcement banner
  if (typeof showCraftedBanner === "function") {
    showCraftedBanner("\u2728 GOLDEN HOUR! 3\xd7 score for 20s!");
  }
}

function _onGoldenHourTick() {
  // Update countdown timer in HUD
  const secs = Math.ceil(eventRemainingMs / 1000);
  const hud = document.getElementById("golden-hour-hud");
  if (hud) hud.textContent = "\u2728 " + secs + "s";

  // Paint any newly spawned pieces gold (those without goldenHourColored flag)
  if (typeof fallingPiecesGroup !== "undefined" && fallingPiecesGroup) {
    fallingPiecesGroup.children.forEach(_applyGoldToPiece);
  }
}

function _onGoldenHourEnd() {
  goldenHourActive = false;

  // Hide overlays
  const overlay = document.getElementById("golden-hour-overlay");
  if (overlay) overlay.style.display = "none";
  const hud = document.getElementById("golden-hour-hud");
  if (hud) hud.style.display = "none";

  // Revert all falling pieces to their original materials
  if (typeof fallingPiecesGroup !== "undefined" && fallingPiecesGroup) {
    fallingPiecesGroup.children.forEach(_revertGoldFromPiece);
  }

  // Triumphant fanfare SFX
  if (typeof playGoldenHourFanfare === "function") playGoldenHourFanfare();

  if (typeof showCraftedBanner === "function") {
    showCraftedBanner("Golden Hour over!");
  }
}

// ── Main update — called from game loop each frame ────────────────────────────

/**
 * Update the event scheduler and active event. Call from main.js animate()
 * inside the `if (!isGameOver && !isPaused)` block, every frame.
 * @param {number} delta  Seconds since last frame.
 */
function updateEventEngine(delta) {
  if (!_eventsAllowed()) return;

  // Tick cooldown
  if (_cooldownRemainingMs > 0) {
    _cooldownRemainingMs -= delta * 1000;
    if (_cooldownRemainingMs < 0) _cooldownRemainingMs = 0;
  }

  // If event is active, tick it and return
  if (activeEvent !== EVENT_TYPES.NONE) {
    tickEvent(delta);
    return;
  }

  // Accumulate active-gameplay time toward next event trigger
  if (_cooldownRemainingMs <= 0) {
    _schedulerAccumMs += delta * 1000;

    if (_schedulerAccumMs >= _nextThresholdMs) {
      // Pick a random event type (excluding NONE)
      const candidates = [
        EVENT_TYPES.PIECE_STORM,
        EVENT_TYPES.GOLDEN_HOUR,
        EVENT_TYPES.EARTHQUAKE,
      ];
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      startEvent(chosen);
      _schedulerAccumMs = 0;
    }
  }
}

// ── Reset — call from resetGame() ─────────────────────────────────────────────

/**
 * Reset all event engine state. Must be called whenever a game session resets.
 */
function resetEventEngine() {
  // Clean up any active Piece Storm visuals before clearing state
  if (activeEvent === EVENT_TYPES.PIECE_STORM) {
    const overlay = document.getElementById("storm-overlay");
    if (overlay) overlay.style.display = "none";
    const hud = document.getElementById("storm-hud");
    if (hud) hud.style.display = "none";
  }

  // Clean up any active Golden Hour visuals before clearing state
  if (activeEvent === EVENT_TYPES.GOLDEN_HOUR) {
    const overlay = document.getElementById("golden-hour-overlay");
    if (overlay) overlay.style.display = "none";
    const hud = document.getElementById("golden-hour-hud");
    if (hud) hud.style.display = "none";
  }

  activeEvent          = EVENT_TYPES.NONE;
  eventRemainingMs     = 0;
  eventHistory         = [];
  _cooldownRemainingMs = 0;
  _schedulerAccumMs    = 0;
  _nextThresholdMs     = _pickInterval();
  pieceStormActive     = false;
  goldenHourActive     = false;
}

// ── Debug hook ────────────────────────────────────────────────────────────────

/**
 * Manually trigger a world event by type string for testing.
 * Usage (browser console): window._debugTriggerEvent("PIECE_STORM")
 */
window._debugTriggerEvent = function (type) {
  if (!EVENT_TYPES[type] || type === EVENT_TYPES.NONE) {
    console.warn(
      "[EventEngine] _debugTriggerEvent: unknown type '" + type + "'.",
      "Valid types:", Object.keys(EVENT_TYPES).filter(t => t !== "NONE")
    );
    return;
  }
  console.log("[EventEngine] Debug trigger:", type);
  startEvent(type);
};
