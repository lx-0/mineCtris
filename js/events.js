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

// ── Event metadata: icon, display name, description, color scheme ─────────────
const EVENT_META = {
  [EVENT_TYPES.PIECE_STORM]: {
    icon:        "⚡",
    name:        "PIECE STORM",
    description: "Survive 30s of rapid piece spawns!",
    bg:          "rgba(160,0,0,0.93)",
    accent:      "#ff4444",
    glow:        "rgba(255,30,0,0.7)",
  },
  [EVENT_TYPES.GOLDEN_HOUR]: {
    icon:        "✨",
    name:        "GOLDEN HOUR",
    description: "3× score multiplier for 20s!",
    bg:          "rgba(110,70,0,0.93)",
    accent:      "#ffd700",
    glow:        "rgba(255,180,0,0.7)",
  },
  [EVENT_TYPES.EARTHQUAKE]: {
    icon:        "🌋",
    name:        "EARTHQUAKE",
    description: "The ground is shaking!",
    bg:          "rgba(110,55,0,0.93)",
    accent:      "#ff8c00",
    glow:        "rgba(200,100,0,0.7)",
  },
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

// ── Announcement state ────────────────────────────────────────────────────────
let _announcementDismissTimeout = null;
let _announceDismissHandler     = null;

/**
 * Show the full-screen event announcement card for the given event type.
 * Skipped silently if the game is paused.
 */
function _showEventAnnouncement(type) {
  if (isPaused) return;

  const meta = EVENT_META[type];
  if (!meta) return;

  const el = document.getElementById("event-announcement");
  const card = document.getElementById("event-announcement-card");
  if (!el || !card) return;

  // Apply color variables
  card.style.setProperty("--event-bg",     meta.bg);
  card.style.setProperty("--event-accent", meta.accent);
  card.style.setProperty("--event-glow",   meta.glow);

  // Set content
  document.getElementById("event-announcement-icon").textContent = meta.icon;
  document.getElementById("event-announcement-name").textContent = meta.name;
  document.getElementById("event-announcement-desc").textContent = meta.description;

  // Show (reset any lingering dismiss animation)
  el.classList.remove("dismissing");
  el.style.display = "flex";

  // Auto-dismiss after 2 seconds
  if (_announcementDismissTimeout) clearTimeout(_announcementDismissTimeout);
  _announcementDismissTimeout = setTimeout(_dismissEventAnnouncement, 2000);

  // Keyboard dismiss: Escape or Space
  if (_announceDismissHandler) {
    document.removeEventListener("keydown", _announceDismissHandler);
  }
  _announceDismissHandler = function (e) {
    if (e.key === "Escape" || e.key === " ") {
      _dismissEventAnnouncement();
    }
  };
  document.addEventListener("keydown", _announceDismissHandler);
}

/** Animate-out and hide the announcement card. */
function _dismissEventAnnouncement() {
  if (_announcementDismissTimeout) {
    clearTimeout(_announcementDismissTimeout);
    _announcementDismissTimeout = null;
  }
  if (_announceDismissHandler) {
    document.removeEventListener("keydown", _announceDismissHandler);
    _announceDismissHandler = null;
  }
  const el = document.getElementById("event-announcement");
  if (!el || el.style.display === "none") return;

  el.classList.add("dismissing");
  setTimeout(function () {
    el.style.display = "none";
    el.classList.remove("dismissing");
  }, 380);
}

/**
 * Show the corner countdown HUD for the given event type.
 */
function _showEventCountdownHud(type) {
  const meta = EVENT_META[type];
  if (!meta) return;
  const hud = document.getElementById("event-countdown-hud");
  if (!hud) return;

  document.getElementById("event-countdown-icon").textContent = meta.icon;
  hud.classList.remove("timer-green", "timer-yellow", "timer-red");
  hud.classList.add("timer-green");
  hud.style.display = "flex";
  _updateEventCountdownHud();
}

/**
 * Update the corner countdown HUD timer text and color class.
 * Called each tick while an event is active.
 */
function _updateEventCountdownHud() {
  const hud = document.getElementById("event-countdown-hud");
  if (!hud || hud.style.display === "none") return;

  const totalMs = EVENT_DURATIONS_MS[activeEvent] || 1;
  const pct     = eventRemainingMs / totalMs;
  const totalSec = Math.ceil(eventRemainingMs / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  document.getElementById("event-countdown-timer").textContent = mm + ":" + ss;

  hud.classList.remove("timer-green", "timer-yellow", "timer-red");
  if (pct > 0.5) {
    hud.classList.add("timer-green");
  } else if (pct > 0.25) {
    hud.classList.add("timer-yellow");
  } else {
    hud.classList.add("timer-red");
  }
}

/** Hide the corner countdown HUD. */
function _hideEventCountdownHud() {
  const hud = document.getElementById("event-countdown-hud");
  if (hud) hud.style.display = "none";
}

let _endToastTimeout = null;

/**
 * Show a small toast notification: "[Event Name] ended".
 */
function _showEventEndToast(type) {
  const meta = EVENT_META[type];
  if (!meta) return;
  const toast = document.getElementById("event-end-toast");
  if (!toast) return;

  toast.textContent = meta.icon + " " + meta.name + " ended";
  toast.classList.remove("toast-visible");
  // Force reflow so the animation restarts
  void toast.offsetWidth;
  toast.style.display = "block";
  toast.classList.add("toast-visible");

  if (_endToastTimeout) clearTimeout(_endToastTimeout);
  _endToastTimeout = setTimeout(function () {
    toast.style.display = "none";
    toast.classList.remove("toast-visible");
    _endToastTimeout = null;
  }, 3100);
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
  if (type === EVENT_TYPES.EARTHQUAKE)  _onEarthquakeStart();
  _showEventAnnouncement(type);
  _showEventCountdownHud(type);
}

function _fireOnTick(delta, type) {
  if (type === EVENT_TYPES.PIECE_STORM) _onPieceStormTick();
  if (type === EVENT_TYPES.GOLDEN_HOUR) _onGoldenHourTick();
  if (type === EVENT_TYPES.EARTHQUAKE)  _onEarthquakeTick();
  _updateEventCountdownHud();
}

function _fireOnEnd(type) {
  console.log("[EventEngine] Event ended:", type);
  if (type === EVENT_TYPES.PIECE_STORM) _onPieceStormEnd();
  if (type === EVENT_TYPES.GOLDEN_HOUR) _onGoldenHourEnd();
  if (type === EVENT_TYPES.EARTHQUAKE)  _onEarthquakeEnd();
  _hideEventCountdownHud();
  _dismissEventAnnouncement();
  _showEventEndToast(type);
}

// ── Piece Storm implementation ────────────────────────────────────────────────

function _onPieceStormStart() {
  pieceStormActive = true;

  // Red atmospheric tint overlay
  const overlay = document.getElementById("storm-overlay");
  if (overlay) overlay.style.display = "block";

  // Ominous rumble SFX
  if (typeof playStormRumble === "function") playStormRumble();
}

function _onPieceStormTick() {
  // (countdown handled by shared _updateEventCountdownHud)
}

function _onPieceStormEnd() {
  pieceStormActive = false;

  // Hide atmospheric overlay
  const overlay = document.getElementById("storm-overlay");
  if (overlay) overlay.style.display = "none";

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

  // Paint all currently active falling pieces gold
  if (typeof fallingPiecesGroup !== "undefined" && fallingPiecesGroup) {
    fallingPiecesGroup.children.forEach(_applyGoldToPiece);
  }

  // Angelic chime SFX
  if (typeof playGoldenHourChime === "function") playGoldenHourChime();
}

function _onGoldenHourTick() {
  // (countdown handled by shared _updateEventCountdownHud)

  // Paint any newly spawned pieces gold (those without goldenHourColored flag)
  if (typeof fallingPiecesGroup !== "undefined" && fallingPiecesGroup) {
    fallingPiecesGroup.children.forEach(_applyGoldToPiece);
  }
}

function _onGoldenHourEnd() {
  goldenHourActive = false;

  // Hide atmospheric overlay
  const overlay = document.getElementById("golden-hour-overlay");
  if (overlay) overlay.style.display = "none";

  // Revert all falling pieces to their original materials
  if (typeof fallingPiecesGroup !== "undefined" && fallingPiecesGroup) {
    fallingPiecesGroup.children.forEach(_revertGoldFromPiece);
  }

  // Triumphant fanfare SFX
  if (typeof playGoldenHourFanfare === "function") playGoldenHourFanfare();
}

// ── Earthquake implementation ─────────────────────────────────────────────────

function _onEarthquakeStart() {
  // Orange-brown atmospheric overlay
  const overlay = document.getElementById("earthquake-overlay");
  if (overlay) overlay.style.display = "block";

  // Trigger screen shake
  if (typeof screenShakeActive !== "undefined") {
    screenShakeActive = true;
    screenShakeStart  = performance.now();
  }
}

function _onEarthquakeTick() {
  // Periodic screen shake bursts
  if (typeof screenShakeActive !== "undefined" && !screenShakeActive) {
    if (Math.random() < 0.02) {
      screenShakeActive = true;
      screenShakeStart  = performance.now();
    }
  }
}

function _onEarthquakeEnd() {
  const overlay = document.getElementById("earthquake-overlay");
  if (overlay) overlay.style.display = "none";
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
  }

  // Clean up any active Golden Hour visuals before clearing state
  if (activeEvent === EVENT_TYPES.GOLDEN_HOUR) {
    const overlay = document.getElementById("golden-hour-overlay");
    if (overlay) overlay.style.display = "none";
  }

  // Clean up any active Earthquake visuals before clearing state
  if (activeEvent === EVENT_TYPES.EARTHQUAKE) {
    const overlay = document.getElementById("earthquake-overlay");
    if (overlay) overlay.style.display = "none";
  }

  // Clean up shared HUD/announcement elements
  _dismissEventAnnouncement();
  _hideEventCountdownHud();
  const toast = document.getElementById("event-end-toast");
  if (toast) {
    toast.style.display = "none";
    toast.classList.remove("toast-visible");
  }
  if (_endToastTimeout) {
    clearTimeout(_endToastTimeout);
    _endToastTimeout = null;
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
