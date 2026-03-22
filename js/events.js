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
function _spawnCreeperMesh() {
  if (typeof scene === "undefined" || !scene) return null;

  var size = typeof BLOCK_SIZE !== "undefined" ? BLOCK_SIZE : 1;
  var worldSize = typeof WORLD_SIZE !== "undefined" ? WORLD_SIZE : 50;
  var halfWorld = worldSize / 2;

  // Pick a random edge: 0=north, 1=south, 2=east, 3=west
  var edge = Math.floor(Math.random() * 4);
  var x, z;
  switch (edge) {
    case 0: x = (Math.random() - 0.5) * worldSize; z = -halfWorld; break;
    case 1: x = (Math.random() - 0.5) * worldSize; z =  halfWorld; break;
    case 2: x =  halfWorld; z = (Math.random() - 0.5) * worldSize; break;
    default: x = -halfWorld; z = (Math.random() - 0.5) * worldSize; break;
  }

  // Scale factor: head should be 2×BLOCK_SIZE → s = BLOCK_SIZE/4
  var s = size / 4;

  // Dimensions in world units
  var headW = 8 * s, headH = 8 * s, headD = 8 * s;       // 2×BLOCK_SIZE cube
  var bodyW = 4 * s, bodyH = 12 * s, bodyD = 8 * s;
  var legW  = 4 * s, legH  = 6 * s,  legD  = 4 * s;

  // Total height = legH + bodyH + headH = 26s = 6.5 * BLOCK_SIZE
  var totalH = legH + bodyH + headH;

  var group = new THREE.Group();
  group.name = "creeperGroup";

  // ── Head (with face texture on front +Z face) ────────────────────────────
  var headFaceTex = _createCreeperFaceTexture();
  var headFaceMat = new THREE.MeshLambertMaterial({ map: headFaceTex, emissive: new THREE.Color(0x003300) });
  var headSideTex = _createMottledGreenTexture(8, 8);
  var headSideMat = new THREE.MeshLambertMaterial({ map: headSideTex, emissive: new THREE.Color(0x003300) });
  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
  var headMats = [headSideMat, headSideMat, headSideMat, headSideMat, headFaceMat, headSideMat];
  var head = _createCreeperPart(headW, headH, headD, headMats);
  head.name = "world_object";
  head.userData.isCreeper = true;
  head.userData.creeperPart = "head";
  head.position.set(0, legH + bodyH + headH / 2, 0);
  group.add(head);

  // ── Body ─────────────────────────────────────────────────────────────────
  var body = _createCreeperPart(bodyW, bodyH, bodyD);
  body.name = "world_object";
  body.userData.isCreeper = true;
  body.userData.creeperPart = "body";
  body.position.set(0, legH + bodyH / 2, 0);
  group.add(body);

  // ── Legs (4 stubby legs) ─────────────────────────────────────────────────
  // In Minecraft the legs sit at the 4 corners, each pair side-by-side making
  // the creature wider than the body. Offset: half body width (center-to-edge).
  var legOffX = bodyW / 2;    // legs sit at ± half body width
  var legOffZ = (bodyD - legD) / 2;  // front/back offset within body depth
  var legNames = ["frontLeftLeg", "frontRightLeg", "backLeftLeg", "backRightLeg"];
  var legPositions = [
    { x: -legOffX, z:  legOffZ },  // front-left
    { x:  legOffX, z:  legOffZ },  // front-right
    { x: -legOffX, z: -legOffZ },  // back-left
    { x:  legOffX, z: -legOffZ },  // back-right
  ];

  for (var li = 0; li < 4; li++) {
    // Pivot at top of leg (geometry offset down so rotation swings from hip)
    var leg = _createCreeperPart(legW, legH, legD, null, { x: 0, y: -legH / 2, z: 0 });
    leg.name = "world_object";
    leg.userData.isCreeper = true;
    leg.userData.creeperPart = legNames[li];
    leg.position.set(legPositions[li].x, legH, legPositions[li].z);
    group.add(leg);
  }

  // Position group at spawn point, sitting on ground (y=0)
  group.position.set(x, 0, z);
  group.userData.isCreeper = true;
  group.userData.totalHeight = totalH;

  // Add to worldGroup so raycasting picks up child meshes
  if (typeof worldGroup !== "undefined" && worldGroup) {
    worldGroup.add(group);
  } else {
    scene.add(group);
  }
  return group;
}

/**
 * Get the player world position (X, Z).
 * Returns { x, z } or null if controls aren't available.
 */
function _getPlayerXZ() {
  if (typeof controls === "undefined" || !controls) return null;
  const obj = controls.getObject();
  if (!obj) return null;
  return { x: obj.position.x, z: obj.position.z };
}

function _onCreeperStart() {
  creeperActive = true;
  _creeperFusing = false;
  _creeperFuseTimer = 0;
  _creeperHP = _CREEPER_HP;
  _creeperDefused = false;
  _creeperBobPhase = 0;
  _creeperApproachTime = 0;
  _creeperHitPulseTime = 0;
  _creeperWalkPhase = 0;
  _creeperFuseParticles = [];
  _creeperExplosionParticles = [];

  // Spawn the creeper mesh
  _creeperMesh = _spawnCreeperMesh();

  // Green atmospheric overlay
  const overlay = document.getElementById("creeper-overlay");
  if (overlay) overlay.style.display = "block";

  // First-encounter explanation toast (one-time, localStorage gated)
  try {
    if (!localStorage.getItem("creeperEncountered")) {
      localStorage.setItem("creeperEncountered", "true");
      _showCreeperFirstEncounterToast();
    }
  } catch (e) { /* localStorage unavailable, skip */ }
}

/**
 * Show a one-time explanatory toast for the player's first Creeper encounter.
 */
var _firstEncounterToastTimeout = null;
function _showCreeperFirstEncounterToast() {
  const toast = document.getElementById("event-end-toast");
  if (!toast) return;

  toast.textContent = "CREEPER INCOMING! Click it to defuse before it explodes!";
  toast.classList.remove("toast-visible");
  void toast.offsetWidth;
  toast.style.display = "block";
  toast.classList.add("toast-visible");

  if (_firstEncounterToastTimeout) clearTimeout(_firstEncounterToastTimeout);
  if (_endToastTimeout) clearTimeout(_endToastTimeout);
  _firstEncounterToastTimeout = setTimeout(function () {
    toast.style.display = "none";
    toast.classList.remove("toast-visible");
    _firstEncounterToastTimeout = null;
  }, 4000);
}

/**
 * Deal 1 hit of damage to the Creeper. Called from the click handler in main.js.
 * Returns true if the Creeper was killed (defused).
 */
function damageCreeperMesh(mesh) {
  if (!mesh || !mesh.userData.isCreeper || _creeperHP <= 0) return false;

  _creeperHP--;

  // Flash ALL child meshes red briefly for juicy hit feedback
  var hitMats = _getAllCreeperMaterials();
  for (var hi = 0; hi < hitMats.length; hi++) {
    hitMats[hi].color.copy(_CREEPER_HIT_RED);
    hitMats[hi].emissive.setHex(0x440000);
    hitMats[hi].needsUpdate = true;
  }
  if (hitMats.length) {
    setTimeout(function () {
      var restoreMats = _getAllCreeperMaterials();
      for (var ri = 0; ri < restoreMats.length; ri++) {
        restoreMats[ri].color.copy(_CREEPER_COLOR);
        restoreMats[ri].emissive.setHex(0x003300);
        restoreMats[ri].needsUpdate = true;
      }
    }, 220);
  }

  // Progressive crack overlay on head mesh (most visible part)
  var headMesh = null;
  if (_creeperMesh) {
    _creeperMesh.traverse(function (child) {
      if (child.userData.creeperPart === "head") headMesh = child;
    });
  }
  if (headMesh) _updateCreeperCracks(headMesh, _creeperHP, _CREEPER_HP);

  // Scale pulse: squish to 90% then bounce back (on whole group)
  _creeperHitPulseTime = _CREEPER_HIT_PULSE_DUR;

  // Spawn dust particles for hit feedback
  if (typeof spawnDustParticles === "function") {
    spawnDustParticles(mesh);
  }

  if (_creeperHP <= 0) {
    // Defused!
    _creeperDefused = true;
    addScore(_CREEPER_DEFUSE_PTS);
    _showCreeperDefusedToast();
    endEvent();
    return true;
  }
  return false;
}

/**
 * Show a brief "Creeper Defused! +750" toast using the event-end-toast element.
 */
function _showCreeperDefusedToast() {
  const toast = document.getElementById("event-end-toast");
  if (!toast) return;

  toast.textContent = "\uD83D\uDEE1\uFE0F Creeper Defused! +" + _CREEPER_DEFUSE_PTS;
  toast.classList.remove("toast-visible");
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

/**
 * Collect all MeshLambertMaterial instances from every child mesh in the creeper group.
 */
function _getAllCreeperMaterials() {
  var allMats = [];
  if (!_creeperMesh) return allMats;
  _creeperMesh.traverse(function (child) {
    if (child.isMesh && child.userData.isCreeper) {
      var cm = Array.isArray(child.material) ? child.material : (child.material ? [child.material] : []);
      for (var i = 0; i < cm.length; i++) {
        if (allMats.indexOf(cm[i]) === -1) allMats.push(cm[i]);
      }
    }
  });
  return allMats;
}

/**
 * Animate leg walk cycle. Front-left/back-right swing together (pair A),
 * front-right/back-left swing together (pair B) — classic Minecraft mob walk.
 */
function _animateCreeperLegs(delta) {
  if (!_creeperMesh) return;
  _creeperWalkPhase += delta * 8; // ~1.3 full cycles/sec
  var swing = Math.sin(_creeperWalkPhase) * (15 * Math.PI / 180); // ±15°
  _creeperMesh.traverse(function (child) {
    if (!child.userData.creeperPart) return;
    var part = child.userData.creeperPart;
    if (part === "frontLeftLeg" || part === "backRightLeg") {
      child.rotation.x = swing;
    } else if (part === "frontRightLeg" || part === "backLeftLeg") {
      child.rotation.x = -swing;
    }
  });
}

/**
 * Reset all leg rotations to 0 (standing still).
 */
function _resetCreeperLegs() {
  if (!_creeperMesh) return;
  _creeperMesh.traverse(function (child) {
    if (child.userData.creeperPart && child.userData.creeperPart.indexOf("Leg") !== -1) {
      child.rotation.x = 0;
    }
  });
}

function _onCreeperTick(delta) {
  if (!_creeperMesh) return;

  const player = _getPlayerXZ();
  if (!player) return;

  const dx = player.x - _creeperMesh.position.x;
  const dz = player.z - _creeperMesh.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  // Group sits at y=0; bobbing offsets the whole group
  const baseY = 0;

  // Rotate creeper to face the player (face is +Z in local space)
  _creeperMesh.rotation.y = Math.atan2(dx, dz);

  if (!_creeperFusing) {
    // Approach phase: walk toward player with bobbing + leg animation
    if (dist <= _CREEPER_FUSE_RANGE) {
      // Enter fuse state
      _creeperFusing = true;
      _creeperFuseTimer = _CREEPER_FUSE_TIME;
      _resetCreeperLegs();
      if (typeof startCreeperHiss === "function") startCreeperHiss();
    } else {
      // Move toward player — accelerate after delay to guarantee fuse
      _creeperApproachTime += delta;
      var speed = _CREEPER_SPEED;
      if (_creeperApproachTime > _CREEPER_ACCEL_DELAY) {
        speed += _CREEPER_ACCEL_RATE * (_creeperApproachTime - _CREEPER_ACCEL_DELAY);
        speed = Math.min(speed, _CREEPER_MAX_SPEED);
      }
      const step = speed * delta;
      const nx = dx / dist;
      const nz = dz / dist;
      _creeperMesh.position.x += nx * step;
      _creeperMesh.position.z += nz * step;

      // Walk cycle leg animation
      _animateCreeperLegs(delta);

      // Bobbing animation — sinusoidal Y offset, ~3 bobs/sec
      _creeperBobPhase += delta * 6 * Math.PI;
      _creeperMesh.position.y = baseY + Math.sin(_creeperBobPhase) * 0.1;
    }
  } else {
    // Fuse phase: refined flash with exponential frequency ramp
    _creeperFuseTimer -= delta;

    const fuseProgress = 1 - Math.max(0, _creeperFuseTimer) / _CREEPER_FUSE_TIME; // 0→1
    const flashRate = 4 + 20 * fuseProgress * fuseProgress;
    const t = Math.sin(performance.now() / 1000 * Math.PI * 2 * flashRate);
    const whiteAmount = 0.3 + 0.7 * fuseProgress;
    // Flash all materials across all child meshes
    var mats = _getAllCreeperMaterials();
    for (var mi = 0; mi < mats.length; mi++) {
      if (t > 0) {
        mats[mi].color.lerpColors(_CREEPER_COLOR, _CREEPER_FUSE_WHITE, whiteAmount);
        mats[mi].emissive.setHex(0x444444);
      } else {
        mats[mi].color.copy(_CREEPER_COLOR);
        mats[mi].emissive.setHex(0x003300);
      }
      mats[mi].needsUpdate = true;
    }

    // Reset bob to base during fuse (creeper stands still and swells)
    var swell = 1.0 + 0.05 * Math.sin(performance.now() / 1000 * Math.PI * flashRate * 0.5);
    _creeperMesh.scale.set(swell, swell, swell);
    _creeperMesh.position.y = baseY;

    // Spawn fizzing particles on top of creeper during fuse
    _spawnCreeperFuseParticle();

    if (_creeperFuseTimer <= 0) {
      endEvent();
    }
  }

  // Update directional indicator (arrow at screen edge when off-screen)
  _updateCreeperDirection();

  // Hit-pulse scale animation (squish to 90% then bounce back)
  if (_creeperHitPulseTime > 0) {
    _creeperHitPulseTime = Math.max(0, _creeperHitPulseTime - delta);
    var p = 1 - _creeperHitPulseTime / _CREEPER_HIT_PULSE_DUR;
    var pulseScale;
    if (p < 0.3) {
      pulseScale = 1.0 - 0.1 * (p / 0.3);
    } else if (p < 0.7) {
      pulseScale = 0.9 + 0.15 * ((p - 0.3) / 0.4);
    } else {
      pulseScale = 1.05 - 0.05 * ((p - 0.7) / 0.3);
    }
    var cur = _creeperMesh.scale.x;
    _creeperMesh.scale.set(cur * pulseScale, cur * pulseScale, cur * pulseScale);
  }

  // Update fuse particles
  _updateCreeperFuseParticles(delta);
}

/** Spawn a small fizzing particle above the Creeper during fuse. */
function _spawnCreeperFuseParticle() {
  if (!_creeperMesh || typeof scene === "undefined") return;
  // ~2 particles per frame at 60fps → throttle by random chance
  if (Math.random() > 0.4) return;

  const pos = _creeperMesh.position;
  const size = typeof BLOCK_SIZE !== "undefined" ? BLOCK_SIZE : 1;
  var topY = _creeperMesh.userData.totalHeight || (size * 2);
  const geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
  // Random green/yellow/white spark color
  const colors = [0x00ff00, 0x88ff00, 0xffff44, 0xffffff];
  const mat = new THREE.MeshBasicMaterial({
    color: colors[Math.floor(Math.random() * colors.length)],
    transparent: true,
    opacity: 1.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(
    pos.x + (Math.random() - 0.5) * size * 0.8,
    pos.y + topY + Math.random() * 0.3,
    pos.z + (Math.random() - 0.5) * size * 0.8
  );
  scene.add(mesh);

  _creeperFuseParticles.push({
    mesh: mesh,
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 1.5,
      1.5 + Math.random() * 2.0,
      (Math.random() - 0.5) * 1.5
    ),
    age: 0,
    maxAge: 0.3 + Math.random() * 0.25,
  });
}

function _updateCreeperFuseParticles(delta) {
  for (let i = _creeperFuseParticles.length - 1; i >= 0; i--) {
    const p = _creeperFuseParticles[i];
    p.age += delta;
    if (p.age >= p.maxAge) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      _creeperFuseParticles.splice(i, 1);
      continue;
    }
    p.mesh.position.addScaledVector(p.velocity, delta);
    p.velocity.y -= 3.0 * delta; // light gravity
    p.mesh.material.opacity = 1.0 - p.age / p.maxAge;
  }
}

/** Spawn explosion particle burst at a world position. */
function _spawnCreeperExplosionParticles(center) {
  if (typeof scene === "undefined") return;
  const count = 40;
  for (let i = 0; i < count; i++) {
    const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    // Green + brown + gray fragments
    const palette = [0x00cc00, 0x008800, 0x664422, 0x553311, 0x999999, 0x00ff44];
    const mat = new THREE.MeshLambertMaterial({
      color: palette[Math.floor(Math.random() * palette.length)],
      transparent: true,
      opacity: 1.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(center.x, center.y, center.z);
    scene.add(mesh);

    // Radial burst velocity
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.5;
    const speed = 4 + Math.random() * 6;
    _creeperExplosionParticles.push({
      mesh: mesh,
      velocity: new THREE.Vector3(
        Math.cos(theta) * Math.cos(phi) * speed,
        Math.sin(phi) * speed * 0.8 + 2,
        Math.sin(theta) * Math.cos(phi) * speed
      ),
      age: 0,
      maxAge: 0.5 + Math.random() * 0.4,
    });
  }
}

function _updateCreeperExplosionParticles(delta) {
  for (let i = _creeperExplosionParticles.length - 1; i >= 0; i--) {
    const p = _creeperExplosionParticles[i];
    p.age += delta;
    if (p.age >= p.maxAge) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      _creeperExplosionParticles.splice(i, 1);
      continue;
    }
    p.mesh.position.addScaledVector(p.velocity, delta);
    p.velocity.y -= 12.0 * delta; // strong gravity for arcing fragments
    p.mesh.material.opacity = 1.0 - (p.age / p.maxAge);
    // Tumble rotation
    p.mesh.rotation.x += delta * 8;
    p.mesh.rotation.z += delta * 5;
  }
}

/** Trigger screen shake for creeper explosion via CSS class. */
function _creeperScreenShake() {
  const gc = document.getElementById("game-container");
  if (!gc) return;
  gc.classList.remove("bfx-shake-light", "bfx-shake-medium", "bfx-shake-strong", "creeper-shake");
  void gc.offsetWidth;
  gc.classList.add("creeper-shake");
  gc.addEventListener("animationend", function cb() {
    gc.classList.remove("creeper-shake");
    gc.removeEventListener("animationend", cb);
  }, { once: true });
}

function _onCreeperEnd() {
  // If the player defused the creeper, skip the explosion entirely
  const defused = _creeperDefused;

  // Capture whether fuse completed (explosion) vs event timer expired (no explosion)
  const fuseCompleted = !defused && _creeperFusing && _creeperFuseTimer <= 0;

  // Capture blast center before removing mesh (use mid-height of group)
  let blastCenter = null;
  if (fuseCompleted && _creeperMesh) {
    var bSize = typeof BLOCK_SIZE !== "undefined" ? BLOCK_SIZE : 1;
    var midY = (_creeperMesh.userData.totalHeight || (bSize * 2)) / 2;
    blastCenter = {
      x: _creeperMesh.position.x,
      y: _creeperMesh.position.y + midY,
      z: _creeperMesh.position.z,
    };
  }

  // Stop hiss audio regardless of outcome
  if (typeof stopCreeperHiss === "function") stopCreeperHiss();

  creeperActive = false;
  _creeperFusing = false;
  _creeperFuseTimer = 0;
  _creeperHP = 0;
  _creeperHitPulseTime = 0;
  // Note: _creeperDefused is NOT reset here — _fireOnEnd reads it to suppress
  // the default "CREEPER ended" toast when the player defused. It resets in
  // _onCreeperStart and resetEventEngine.

  // Remove creeper group from scene/worldGroup and dispose all resources
  if (_creeperMesh) {
    _creeperMesh.scale.set(1, 1, 1);
    if (typeof worldGroup !== "undefined" && worldGroup) worldGroup.remove(_creeperMesh);
    if (typeof scene !== "undefined" && scene) scene.remove(_creeperMesh);
    // Recursively dispose all child meshes, geometries, and materials
    _creeperMesh.traverse(function (child) {
      if (child.geometry) child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach(function (m) { m.dispose(); });
      } else if (child.material) {
        child.material.dispose();
      }
    });
    _creeperMesh = null;
  }

  // Clean up remaining fuse particles
  for (let i = _creeperFuseParticles.length - 1; i >= 0; i--) {
    const p = _creeperFuseParticles[i];
    if (typeof scene !== "undefined" && scene) scene.remove(p.mesh);
    p.mesh.geometry.dispose();
    p.mesh.material.dispose();
  }
  _creeperFuseParticles = [];

  // Hide overlay and directional indicator
  const overlay = document.getElementById("creeper-overlay");
  if (overlay) overlay.style.display = "none";
  var dirEl = document.getElementById("creeper-direction");
  if (dirEl) dirEl.style.display = "none";

  // Trigger crater + explosion VFX if the fuse actually completed
  if (blastCenter) {
    _creeperExplode(blastCenter);
    _spawnCreeperExplosionParticles(blastCenter);
    _creeperScreenShake();
    if (typeof playCreeperBoom === "function") playCreeperBoom();
  }

  if (!isGameOver && typeof achOnSurvivalEventEnd === "function") {
    achOnSurvivalEventEnd("CREEPER");
  }
}

/**
 * Destroy all landed blocks within the blast radius, then settle any
 * floating blocks above the crater and persist the world.
 */
function _creeperExplode(center) {
  if (typeof worldGroup === "undefined" || !worldGroup) return;

  const r2 = _CREEPER_BLAST_RADIUS * _CREEPER_BLAST_RADIUS;
  const destroyed = [];

  // Collect blocks within blast radius (iterate a copy since we modify children)
  const children = worldGroup.children.slice();
  for (let i = 0; i < children.length; i++) {
    const obj = children[i];
    if (obj.name !== "landed_block" || !obj.userData.isBlock || !obj.userData.gridPos) continue;

    const gp = obj.userData.gridPos;
    const dx = gp.x - center.x;
    const dy = gp.y - center.y;
    const dz = gp.z - center.z;
    if (dx * dx + dy * dy + dz * dz <= r2) {
      destroyed.push(obj);
    }
  }

  // Destroy collected blocks
  for (let i = 0; i < destroyed.length; i++) {
    const block = destroyed[i];
    // Spawn dust particles for visual feedback
    if (typeof spawnDustParticles === "function") {
      spawnDustParticles(block, { breakBurst: true });
    }
    unregisterBlock(block);
    worldGroup.remove(block);
    if (block.geometry) block.geometry.dispose();
    if (block.material) block.material.dispose();
  }

  // Settle any floating blocks above the crater
  if (destroyed.length > 0) {
    _settleFloatingBlocks();

    // Persist damage in Survival mode
    if (typeof isSurvivalMode !== "undefined" && isSurvivalMode &&
        typeof saveSurvivalWorld === "function") {
      saveSurvivalWorld();
    }
  }
}

/**
 * Gravity pass: find blocks with no support below and drop them down
 * until they rest on the ground (y = 0.5) or another block.
 * Iterates bottom-up so lower blocks settle first.
 */
function _settleFloatingBlocks() {
  if (typeof worldGroup === "undefined" || !worldGroup) return;

  // Collect all landed blocks sorted by Y ascending (settle from bottom up)
  const blocks = [];
  for (let i = 0; i < worldGroup.children.length; i++) {
    const obj = worldGroup.children[i];
    if (obj.name === "landed_block" && obj.userData.isBlock && obj.userData.gridPos) {
      blocks.push(obj);
    }
  }
  blocks.sort(function (a, b) { return a.userData.gridPos.y - b.userData.gridPos.y; });

  let anyMoved = true;
  let passes = 0;
  // Iterate until no blocks move (handles cascading falls)
  while (anyMoved && passes < 50) {
    anyMoved = false;
    passes++;
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const gp = block.userData.gridPos;
      if (!gp) continue;

      // Already on the ground
      if (gp.y <= 0.5) continue;

      // Check if there is support directly below
      const belowY = gp.y - 1;
      const belowKey = gp.x + "," + gp.z;
      const belowLayer = gridOccupancy.get(belowY);
      const hasSupport = (belowY < 0.5) || (belowLayer && belowLayer.has(belowKey));

      if (!hasSupport) {
        // Move block down one grid unit
        unregisterBlock(block);
        block.position.y -= 1;
        block.userData.gridPos = { x: gp.x, y: belowY, z: gp.z };
        // Re-register at new position
        if (!gridOccupancy.has(belowY)) gridOccupancy.set(belowY, new Set());
        gridOccupancy.get(belowY).add(belowKey);
        anyMoved = true;
      }
    }
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
        EVENT_TYPES.CREEPER,
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
    const hud = document.getElementById("earthquake-hud");
    if (hud) hud.style.display = "none";
    if (_earthquakeAmbient) {
      if (typeof scene !== "undefined" && scene) scene.remove(_earthquakeAmbient);
      _earthquakeAmbient = null;
    }
  }

  // Clean up any active Creeper visuals before clearing state
  if (activeEvent === EVENT_TYPES.CREEPER) {
    const overlay = document.getElementById("creeper-overlay");
    if (overlay) overlay.style.display = "none";
    if (_creeperMesh) {
      if (typeof worldGroup !== "undefined" && worldGroup) worldGroup.remove(_creeperMesh);
      if (typeof scene !== "undefined" && scene) scene.remove(_creeperMesh);
      _creeperMesh.traverse(function (child) {
        if (child.geometry) child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(function (m) { m.dispose(); });
        } else if (child.material) {
          child.material.dispose();
        }
      });
      _creeperMesh = null;
    }
    if (typeof stopCreeperHiss === "function") stopCreeperHiss();
  }

  // Clean up any lingering creeper particles (fuse + explosion)
  for (let i = _creeperFuseParticles.length - 1; i >= 0; i--) {
    const p = _creeperFuseParticles[i];
    if (typeof scene !== "undefined" && scene) scene.remove(p.mesh);
    p.mesh.geometry.dispose(); p.mesh.material.dispose();
  }
  _creeperFuseParticles = [];
  for (let i = _creeperExplosionParticles.length - 1; i >= 0; i--) {
    const p = _creeperExplosionParticles[i];
    if (typeof scene !== "undefined" && scene) scene.remove(p.mesh);
    p.mesh.geometry.dispose(); p.mesh.material.dispose();
  }
  _creeperExplosionParticles = [];

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
  earthquakeActive     = false;
  _eqShakeOffX         = 0;
  _eqShakeOffY         = 0;
  creeperActive        = false;
  _creeperFusing       = false;
  _creeperFuseTimer    = 0;
  _creeperHP           = 0;
  _creeperDefused      = false;
  _creeperApproachTime = 0;
  _creeperWalkPhase    = 0;
  _creeperMesh         = null;
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
