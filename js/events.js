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
  [EVENT_TYPES.GOLDEN_HOUR]: 45000,
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

// ── Lifecycle callbacks (extend here when implementing individual events) ──────

function _fireOnStart(type) {
  console.log("[EventEngine] Event started:", type);
  // Future event modules call their own onStart here, e.g.:
  // if (type === EVENT_TYPES.PIECE_STORM && typeof onPieceStormStart === "function") onPieceStormStart();
}

function _fireOnTick(delta, type) {
  // Future per-event tick logic:
  // if (type === EVENT_TYPES.EARTHQUAKE && typeof onEarthquakeTick === "function") onEarthquakeTick(delta);
}

function _fireOnEnd(type) {
  console.log("[EventEngine] Event ended:", type);
  // Future event modules clean up here.
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
  activeEvent          = EVENT_TYPES.NONE;
  eventRemainingMs     = 0;
  eventHistory         = [];
  _cooldownRemainingMs = 0;
  _schedulerAccumMs    = 0;
  _nextThresholdMs     = _pickInterval();
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
