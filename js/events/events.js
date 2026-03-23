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
  CREEPER:     "CREEPER",
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
  [EVENT_TYPES.CREEPER]: {
    icon:        "💥",
    name:        "CREEPER",
    description: "A Creeper is approaching...",
    bg:          "rgba(20,100,20,0.93)",
    accent:      "#00ff00",
    glow:        "rgba(50,255,50,0.7)",
  },
};

// ── Event durations (ms) ──────────────────────────────────────────────────────
const EVENT_DURATIONS_MS = {
  [EVENT_TYPES.PIECE_STORM]: 30000,
  [EVENT_TYPES.GOLDEN_HOUR]: 20000,
  [EVENT_TYPES.EARTHQUAKE]:  10000,
  [EVENT_TYPES.CREEPER]:     25000,
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
  if (typeof isTutorialActive === "function" && isTutorialActive()) return false;
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
  // Always update creeper explosion particles (they outlive the event)
  if (_creeperExplosionParticles.length > 0) {
    _updateCreeperExplosionParticles(delta);
  }

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
  if (type === EVENT_TYPES.CREEPER)     _onCreeperStart();
  _showEventAnnouncement(type);
  _showEventCountdownHud(type);
}

function _fireOnTick(delta, type) {
  if (type === EVENT_TYPES.PIECE_STORM) _onPieceStormTick();
  if (type === EVENT_TYPES.GOLDEN_HOUR) _onGoldenHourTick();
  if (type === EVENT_TYPES.EARTHQUAKE)  _onEarthquakeTick();
  if (type === EVENT_TYPES.CREEPER)     _onCreeperTick(delta);
  _updateEventCountdownHud();
}

function _fireOnEnd(type) {
  console.log("[EventEngine] Event ended:", type);
  if (type === EVENT_TYPES.PIECE_STORM) _onPieceStormEnd();
  if (type === EVENT_TYPES.GOLDEN_HOUR) _onGoldenHourEnd();
  if (type === EVENT_TYPES.EARTHQUAKE)  _onEarthquakeEnd();
  if (type === EVENT_TYPES.CREEPER)     _onCreeperEnd();
  // Survival: record survived event for stats tracking and journal
  if (!isGameOver && typeof isSurvivalMode !== "undefined" && isSurvivalMode &&
      typeof recordSurvivedEvent === "function") {
    recordSurvivedEvent(type);
  }
  _hideEventCountdownHud();
  _dismissEventAnnouncement();
  // Skip the default "CREEPER ended" toast if the player defused it
  // (the defuse toast is already visible from damageCreeperMesh).
  if (!(type === EVENT_TYPES.CREEPER && _creeperDefused)) {
    _showEventEndToast(type);
  }
  // Safe to reset defused flag now that _fireOnEnd has checked it
  if (type === EVENT_TYPES.CREEPER) _creeperDefused = false;
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
    if (typeof achOnSurvivalEventEnd === "function") achOnSurvivalEventEnd("PIECE_STORM");
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

// Pulsing red ambient light added to scene during earthquake.
let _earthquakeAmbient = null;

function _onEarthquakeStart() {
  earthquakeActive = true;

  // Orange-brown atmospheric overlay
  const overlay = document.getElementById("earthquake-overlay");
  if (overlay) overlay.style.display = "block";

  // Mining bonus HUD notification
  const hud = document.getElementById("earthquake-hud");
  if (hud) hud.style.display = "block";

  // Red ambient light pulse
  if (typeof THREE !== "undefined" && typeof scene !== "undefined" && scene) {
    _earthquakeAmbient = new THREE.AmbientLight(0xff2200, 0.2);
    scene.add(_earthquakeAmbient);
  }

  // Crack particle burst from ground level
  _spawnEarthquakeCracks();

  // Seismic rumble SFX
  if (typeof playEarthquakeRumble === "function") playEarthquakeRumble();
}

function _onEarthquakeTick() {
  // Pulse red ambient light intensity
  if (_earthquakeAmbient) {
    const t = performance.now() / 1000;
    _earthquakeAmbient.intensity = 0.10 + 0.12 * Math.abs(Math.sin(t * Math.PI * 2.8));
  }

  // Occasional crumbling stone SFX
  if (Math.random() < 0.012) {
    if (typeof playEarthquakeCrumble === "function") playEarthquakeCrumble();
  }
}

function _onEarthquakeEnd() {
  earthquakeActive = false;

  const overlay = document.getElementById("earthquake-overlay");
  if (overlay) overlay.style.display = "none";

  const hud = document.getElementById("earthquake-hud");
  if (hud) hud.style.display = "none";

  // Remove red ambient light
  if (_earthquakeAmbient) {
    if (typeof scene !== "undefined" && scene) scene.remove(_earthquakeAmbient);
    _earthquakeAmbient = null;
  }

  if (!isGameOver && typeof achOnSurvivalEventEnd === "function") {
    achOnSurvivalEventEnd("EARTHQUAKE");
  }
}

/** Spawn a burst of dark crack particles from ground level around the player. */
function _spawnEarthquakeCracks() {
  if (typeof scene === "undefined" || !scene) return;
  if (typeof dustParticles === "undefined" || typeof clock === "undefined") return;

  const cx = (typeof camera !== "undefined" && camera) ? camera.position.x : 0;
  const cz = (typeof camera !== "undefined" && camera) ? camera.position.z : 0;
  const crackColor = new THREE.Color(0x2a1a0a);

  for (let i = 0; i < 22; i++) {
    const angle  = Math.random() * Math.PI * 2;
    const radius = 1.5 + Math.random() * 5.5;
    const x = cx + Math.cos(angle) * radius;
    const z = cz + Math.sin(angle) * radius;

    const geo = new THREE.BoxGeometry(0.07, 0.05, 0.07);
    const mat = new THREE.MeshLambertMaterial({
      color:       crackColor,
      transparent: true,
      opacity:     0.9,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    dustParticles.push({
      mesh,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 3.5,
        Math.random() * 4.5 + 1.0,
        (Math.random() - 0.5) * 3.5
      ),
      startTime: clock.getElapsedTime(),
      lifetime:  0.45 + Math.random() * 0.35,
    });
  }
}

// ── Creeper implementation ────────────────────────────────────────────────────

const _CREEPER_SPEED       = 1.5;  // grid units per second (base approach speed)
const _CREEPER_ACCEL_DELAY = 15;   // seconds before acceleration kicks in
const _CREEPER_ACCEL_RATE  = 0.1;  // speed increase per second after delay
const _CREEPER_MAX_SPEED   = 3.0;  // max approach speed cap
const _CREEPER_FUSE_RANGE  = 5.0;  // grid units — enter fuse state at this distance
const _CREEPER_FUSE_TIME   = 2.5;  // seconds of fusing before event ends
const _CREEPER_BLAST_RADIUS = 4;   // grid units — blocks within this radius are destroyed
const _CREEPER_HP          = 4;    // clicks to defuse (kill) the creeper
const _CREEPER_DEFUSE_PTS  = 750;  // bonus points for defusing
const _CREEPER_COLOR       = new THREE.Color(0x00cc00);
const _CREEPER_FUSE_WHITE  = new THREE.Color(0xffffff);
const _CREEPER_HIT_RED     = new THREE.Color(0xff2222);
const _CREEPER_HIT_PULSE_DUR = 0.25; // seconds for squish-bounce pulse

/**
 * Update the on-screen directional indicator pointing toward the Creeper.
 * Shows a green chevron at the screen edge when the Creeper is off-screen;
 * hides it when on-screen or during fuse state.
 */
function _updateCreeperDirection() {
  var el = document.getElementById("creeper-direction");
  if (!el) return;

  // Hide during fuse (player is close enough to see it)
  if (_creeperFusing || !_creeperMesh) {
    el.style.display = "none";
    return;
  }

  // Project creeper world position to NDC (-1..1) — use visual center height
  if (typeof camera === "undefined" || !camera) { el.style.display = "none"; return; }
  var pos = _creeperMesh.position.clone();
  var midH = (_creeperMesh.userData.totalHeight || 1) / 2;
  pos.y += midH;
  pos.project(camera);

  // Check if creeper is on-screen (NDC within -1..1 and in front of camera)
  var onScreen = pos.z < 1 && pos.x > -0.85 && pos.x < 0.85 && pos.y > -0.85 && pos.y < 0.85;
  if (onScreen) {
    el.style.display = "none";
    return;
  }

  // Creeper is off-screen — compute direction from screen center
  // If behind camera, flip the direction
  var sx = pos.x;
  var sy = pos.y;
  if (pos.z >= 1) { sx = -sx; sy = -sy; }

  // Angle from center of screen toward the creeper
  var angle = Math.atan2(sy, sx);

  // Place the indicator at the edge of the viewport with margin
  var margin = 40;
  var hw = window.innerWidth / 2;
  var hh = window.innerHeight / 2;

  // Compute edge intersection
  var cos = Math.cos(angle);
  var sin = Math.sin(angle);
  var edgeX, edgeY;

  // Scale to hit the screen edge (aspect-aware)
  var absC = Math.abs(cos);
  var absS = Math.abs(sin);
  if (absC * hh > absS * hw) {
    // Hit left/right edge
    var scale = (hw - margin) / absC;
    edgeX = hw + cos * scale;
    edgeY = hh - sin * scale;
  } else {
    // Hit top/bottom edge
    var scale = (hh - margin) / absS;
    edgeX = hw + cos * scale;
    edgeY = hh - sin * scale;
  }

  // Clamp to viewport bounds
  edgeX = Math.max(margin, Math.min(window.innerWidth - margin, edgeX));
  edgeY = Math.max(margin, Math.min(window.innerHeight - margin, edgeY));

  // Rotation: the triangle character ▲ points up, so 0° = up.
  // angle is from +X axis; rotate so arrow points toward creeper.
  var rotDeg = -(angle * 180 / Math.PI) + 90;

  el.style.display = "block";
  el.style.left = edgeX + "px";
  el.style.top = edgeY + "px";
  el.style.setProperty("--arrow-rot", rotDeg + "deg");
  el.style.transform = "translate(-50%, -50%) rotate(" + rotDeg + "deg)";
}

/**
 * Build crack-line vertices for a given damage stage (1-4).
 * Each stage adds a new set of jagged lines across cube faces.
 * Coords are in local mesh space for a 2×blockSize cube centred at origin.
 */
function _buildCrackLines(stage, halfS) {
  const h = halfS;
  // Deterministic "random" offsets per stage for visual variety
  const cracks = [];
  if (stage >= 1) {
    // Front face diagonal crack
    cracks.push(
      -h * 0.3, h * 0.9, h + 0.01,  h * 0.1, h * 0.4, h + 0.01,
      h * 0.1, h * 0.4, h + 0.01,   h * 0.4, -h * 0.1, h + 0.01,
      h * 0.4, -h * 0.1, h + 0.01,  h * 0.15, -h * 0.6, h + 0.01,
    );
  }
  if (stage >= 2) {
    // Right face crack
    cracks.push(
      h + 0.01, h * 0.7, h * 0.2,   h + 0.01, h * 0.2, -h * 0.1,
      h + 0.01, h * 0.2, -h * 0.1,  h + 0.01, -h * 0.3, -h * 0.4,
    );
    // Top face crack
    cracks.push(
      -h * 0.5, h + 0.01, h * 0.3,  h * 0.1, h + 0.01, -h * 0.1,
      h * 0.1, h + 0.01, -h * 0.1,  h * 0.5, h + 0.01, -h * 0.5,
    );
  }
  if (stage >= 3) {
    // Back face crack
    cracks.push(
      h * 0.4, h * 0.8, -h - 0.01,   -h * 0.05, h * 0.3, -h - 0.01,
      -h * 0.05, h * 0.3, -h - 0.01,  -h * 0.35, -h * 0.2, -h - 0.01,
      -h * 0.35, -h * 0.2, -h - 0.01, -h * 0.15, -h * 0.7, -h - 0.01,
    );
    // Left face crack
    cracks.push(
      -h - 0.01, h * 0.5, -h * 0.3,  -h - 0.01, -h * 0.1, h * 0.2,
      -h - 0.01, -h * 0.1, h * 0.2,  -h - 0.01, -h * 0.5, h * 0.05,
    );
  }
  return new Float32Array(cracks);
}

/**
 * Update the crack overlay on the Creeper mesh based on damage taken.
 * Adds dark line segments that progressively cover more faces.
 */
function _updateCreeperCracks(mesh, currentHP, maxHP) {
  if (!mesh) return;
  // Remove previous crack overlay if any
  const old = mesh.getObjectByName("creeperCracks");
  if (old) {
    mesh.remove(old);
    if (old.geometry) old.geometry.dispose();
    if (old.material) old.material.dispose();
  }

  const stage = maxHP - currentHP; // 0=no cracks, 4=fully cracked
  if (stage <= 0) return;

  const size = typeof BLOCK_SIZE !== "undefined" ? BLOCK_SIZE : 1;
  const halfS = size; // half of 2×size cube

  const verts = _buildCrackLines(stage, halfS);
  if (verts.length === 0) return;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x111111, linewidth: 2 });
  const lines = new THREE.LineSegments(geo, mat);
  lines.name = "creeperCracks";
  mesh.add(lines);
}

/**
 * Create a procedural mottled green canvas texture.
 * Randomizes pixel colors from the Creeper palette for organic look.
 * @param {number} w - texture width in pixels
 * @param {number} h - texture height in pixels
 * @returns {THREE.CanvasTexture}
 */
function _createMottledGreenTexture(w, h) {
  var greens = ["#0DA70B", "#4CBD46", "#6FD168", "#1A8B1A"];
  var canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext("2d");
  for (var py = 0; py < h; py++) {
    for (var px = 0; px < w; px++) {
      ctx.fillStyle = greens[Math.floor(Math.random() * greens.length)];
      ctx.fillRect(px, py, 1, 1);
    }
  }
  var tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

/**
 * Create a canvas texture with the iconic Creeper face pattern on mottled green.
 * 8×8 pixel grid: dark pixels for eyes and frown on mottled green background.
 */
function _createCreeperFaceTexture() {
  var greens = ["#0DA70B", "#4CBD46", "#6FD168", "#1A8B1A"];
  var canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  var ctx = canvas.getContext("2d");

  // Fill mottled green background
  for (var py = 0; py < 8; py++) {
    for (var px = 0; px < 8; px++) {
      ctx.fillStyle = greens[Math.floor(Math.random() * greens.length)];
      ctx.fillRect(px, py, 1, 1);
    }
  }

  // Draw face in dark green/black
  ctx.fillStyle = "#003300";

  // Eyes (2×2 each): left eye at (1,1), right eye at (5,1)
  ctx.fillRect(1, 1, 2, 2);
  ctx.fillRect(5, 1, 2, 2);

  // Nose/mouth: vertical bridge (3,3)-(4,3) then (3,4)-(4,4)
  ctx.fillRect(3, 3, 2, 1);
  ctx.fillRect(3, 4, 2, 1);

  // Frown: wide bottom row (2,5)-(5,5) then corners (2,6) and (5,6)
  ctx.fillRect(2, 5, 4, 1);
  ctx.fillRect(2, 6, 1, 1);
  ctx.fillRect(5, 6, 1, 1);

  var texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

/**
 * Helper: create a body-part mesh with mottled green texture and edge lines.
 * @param {number} w - width (X)
 * @param {number} h - height (Y)
 * @param {number} d - depth (Z)
 * @param {THREE.Material[]|null} overrideMats - optional material array (6 faces)
 * @param {{ x: number, y: number, z: number }|null} geoOffset - optional geometry translate (for pivot adjustment)
 * @returns {THREE.Mesh}
 */
function _createCreeperPart(w, h, d, overrideMats, geoOffset) {
  var geo = new THREE.BoxGeometry(w, h, d);
  if (geoOffset) geo.translate(geoOffset.x, geoOffset.y, geoOffset.z);
  var mats;
  if (overrideMats) {
    mats = overrideMats;
  } else {
    var tex = _createMottledGreenTexture(8, 8);
    var mat = new THREE.MeshLambertMaterial({ map: tex, emissive: new THREE.Color(0x003300) });
    mats = [mat, mat, mat, mat, mat, mat];
  }
  var mesh = new THREE.Mesh(geo, mats);
  // Edge lines for Minecraft-style look
  var edges = new THREE.EdgesGeometry(geo);
  var lineMat = new THREE.LineBasicMaterial({ color: 0x001100 });
  var lineSegs = new THREE.LineSegments(edges, lineMat);
  lineSegs.name = "edgeLine";
  mesh.add(lineSegs);
  return mesh;
}

/**
 * Spawn a multi-part Creeper mesh at a random edge of the grid.
 * Minecraft proportions: head 8×8×8, body 4×12×8 (W×H×D), legs 4×6×4.
 * Head is scaled to ~2×BLOCK_SIZE (matching previous visual footprint).
 * Returns a THREE.Group containing head, body, and 4 leg meshes.
 */
