// Dungeon Room Challenge — Phase 2B
// Manages the full lifecycle when a player mines a dungeon entrance block:
//   discovery overlay → 3-second countdown (Escape to bail) →
//   seal entrance → launch single-floor Tetris session → completion/failure flow
//
// Requires: state.js (activeDungeonRoom, isInDungeonChallenge, isSurvivalMode,
//                     survivalFromCaveMouth, camera, controls),
//           dungeon-rooms.js (findRoomByEntrance, markDungeonRoomDiscovered,
//                             markDungeonRoomCompleted),
//           depths-floor-gen.js (setDungeonRoomBoardWidth),
//           depths-session.js  (launchDungeonSession via roomDungeonLaunch event),
//           survival.js (saveSurvivalWorld)

// ── Phase state machine ───────────────────────────────────────────────────────
// idle → discovery → countdown → active
var _dcPhase  = 'idle';
var _dcTimer  = 0;    // seconds remaining in current phase

// ── DOM overlay references ────────────────────────────────────────────────────
var _dcDiscoveryEl  = null;   // discovery banner
var _dcCountdownEl  = null;   // countdown overlay
var _dcVictoryEl    = null;   // victory overlay
var _dcFailureEl    = null;   // failure overlay

// ── Camera dolly ─────────────────────────────────────────────────────────────
var _dcDollyActive     = false;
var _dcDollyTimer      = 0;
var _dcDollyDuration   = 1.0;     // 1-second transition
var _dcDollyStartPos   = null;    // THREE.Vector3
var _dcDollyStartQuat  = null;    // THREE.Quaternion
var _dcDollyTargetPos  = null;    // THREE.Vector3
var _dcDollyTargetQuat = null;    // THREE.Quaternion

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Called from main.js when the player mines the dungeon entrance block.
 * @param {number} ugCol   Underground grid column of the mined block.
 * @param {number} ugRow   Underground grid row.
 * @param {number} ugDepth Underground grid depth.
 */
function onDungeonEntranceMined(ugCol, ugRow, ugDepth) {
  if (_dcPhase !== 'idle') return;  // already in a challenge flow

  var room = (typeof findRoomByEntrance === 'function')
    ? findRoomByEntrance(ugCol, ugRow, ugDepth)
    : null;
  if (!room) return;

  if (room.completed) {
    _dcShowAlreadyCleared();
    return;
  }

  activeDungeonRoom = room;
  if (typeof markDungeonRoomDiscovered === 'function') markDungeonRoomDiscovered(room.id);

  _dcPhase = 'discovery';
  _dcTimer = 2.0;
  _dcShowDiscoveryOverlay(room);
}

/**
 * Per-frame tick. Call from the main.js animate loop.
 * @param {number} delta  Seconds since last frame.
 */
function tickDungeonChallenge(delta) {
  if (_dcPhase === 'idle') return;

  // Tick camera dolly independently of phase
  if (_dcDollyActive) {
    _dcTickDolly(delta);
  }

  _dcTimer -= delta;

  if (_dcPhase === 'discovery') {
    if (_dcTimer <= 0) {
      _dcHideDiscoveryOverlay();
      _dcPhase = 'countdown';
      _dcTimer = 3.0;
      _dcShowCountdownOverlay();
    }
    return;
  }

  if (_dcPhase === 'countdown') {
    _dcUpdateCountdownNumber(Math.ceil(Math.max(0, _dcTimer)));
    if (_dcTimer <= 0) {
      _dcHideCountdownOverlay();
      _dcActivate();
    }
    return;
  }
}

/**
 * Abort the challenge during the countdown phase.
 * Called when player presses Escape in the countdown.
 */
function abortDungeonChallenge() {
  if (_dcPhase !== 'countdown') return;
  _dcHideCountdownOverlay();
  _dcPhase = 'idle';
  _dcTimer = 0;
  activeDungeonRoom = null;
  // Re-lock controls so player can resume exploring
  if (typeof controls !== 'undefined' && controls && !controls.isLocked) {
    if (typeof requestPointerLock === 'function') requestPointerLock();
  }
}

/**
 * Called by the roomDungeonLaunch event handler in main.js after the session is
 * running. Marks the challenge as active, kicks off the camera dolly.
 * @param {object} room  The room object passed from the launch event.
 */
function onDungeonChallengeSessionStarted(room) {
  isInDungeonChallenge = true;
  _dcSealEntrance(room);
  _dcStartDolly(room);
}

/**
 * Called when the dungeon session ends (completion or failure).
 * Wires into the existing returnToSurvival path.
 * @param {'victory'|'failure'} outcome
 */
function onDungeonChallengeComplete(outcome) {
  if (!isInDungeonChallenge) return;
  isInDungeonChallenge = false;

  var room = activeDungeonRoom;

  if (outcome === 'victory' && room) {
    if (typeof markDungeonRoomCompleted === 'function') markDungeonRoomCompleted(room.id);
    _dcShowVictoryOverlay(room);
  } else {
    _dcShowFailureOverlay(room);
  }

  activeDungeonRoom = null;
  _dcPhase = 'idle';

  // Reset board-width override
  if (typeof setDungeonRoomBoardWidth === 'function') setDungeonRoomBoardWidth(0);
}

// ── Internal — activation ─────────────────────────────────────────────────────

function _dcActivate() {
  var room = activeDungeonRoom;
  if (!room) { _dcPhase = 'idle'; return; }

  _dcPhase = 'active';
  _dcTimer = 0;

  // Configure board width for this room
  var boardWidth = room.boardWidth || Math.max(7, room.width);
  if (typeof setDungeonRoomBoardWidth === 'function') setDungeonRoomBoardWidth(boardWidth);

  // Save survival world then hand off to the depths session machinery
  if (typeof saveSurvivalWorld === 'function') saveSurvivalWorld();
  survivalFromCaveMouth = true;

  document.dispatchEvent(new CustomEvent('roomDungeonLaunch', {
    detail: { room: room, dungeonId: 'shallow_mines' }
  }));
}

// ── Internal — entrance sealing ───────────────────────────────────────────────

/**
 * Restore the entrance block mesh so the player is "sealed in" during the challenge.
 * Placed at the entrance's world position with a bright warm emissive to make it obvious.
 */
function _dcSealEntrance(room) {
  if (typeof THREE === 'undefined' || typeof worldGroup === 'undefined' || !worldGroup) return;

  var geo = new THREE.BoxGeometry(1, 1, 1);
  var mat = new THREE.MeshLambertMaterial({
    color: 0x7a4028,
    emissive: new THREE.Color(0x3a1808),
  });
  var mesh = new THREE.Mesh(geo, mat);
  // Entrance is at (centerCol, centerRow, depthMin) in grid space
  mesh.position.set(
    room.centerCol - 9.5,
    -room.depthMin - 0.5,
    room.centerRow - 9.5
  );
  mesh.name = 'dungeon_seal';
  mesh.userData.isDungeonSeal = true;
  mesh.userData.roomId = room.id;
  worldGroup.add(mesh);
}

/**
 * Remove the entrance seal after the challenge ends.
 * @param {string} roomId
 */
function removeDungeonSeal(roomId) {
  if (typeof worldGroup === 'undefined' || !worldGroup) return;
  var toRemove = [];
  worldGroup.children.forEach(function (obj) {
    if (obj.name === 'dungeon_seal' && obj.userData.roomId === roomId) toRemove.push(obj);
  });
  toRemove.forEach(function (obj) { worldGroup.remove(obj); });
}

// ── Internal — camera dolly ───────────────────────────────────────────────────

function _dcStartDolly(room) {
  if (typeof camera === 'undefined' || !camera) return;
  if (typeof THREE === 'undefined') return;

  _dcDollyActive = true;
  _dcDollyTimer  = 0;

  // Capture current camera world position / quaternion
  _dcDollyStartPos  = camera.position.clone();
  _dcDollyStartQuat = camera.quaternion.clone();

  // Target: pull back from the room center and look inward at the Tetris board.
  // Position the camera at room-center Z-axis offset, slightly above, looking at the board.
  var roomCenterX = room.centerCol - 9.5;
  var roomCenterY = -room.depthMin - (room.height / 2) - 0.5;
  var roomCenterZ = room.centerRow - 9.5;

  // Side view: camera offset 8 units to the side of the room center, slightly elevated
  _dcDollyTargetPos = new THREE.Vector3(
    roomCenterX - 8,
    roomCenterY + 2,
    roomCenterZ
  );

  // Look at room center
  var lookDir = new THREE.Vector3(
    roomCenterX - _dcDollyTargetPos.x,
    roomCenterY - _dcDollyTargetPos.y,
    roomCenterZ - _dcDollyTargetPos.z
  ).normalize();

  var m = new THREE.Matrix4().lookAt(
    _dcDollyTargetPos,
    new THREE.Vector3(roomCenterX, roomCenterY, roomCenterZ),
    new THREE.Vector3(0, 1, 0)
  );
  _dcDollyTargetQuat = new THREE.Quaternion().setFromRotationMatrix(m);
}

function _dcTickDolly(delta) {
  if (!_dcDollyActive || !_dcDollyStartPos) return;

  _dcDollyTimer += delta;
  var t = Math.min(_dcDollyTimer / _dcDollyDuration, 1);
  // Smooth ease-in-out
  var ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

  camera.position.lerpVectors(_dcDollyStartPos, _dcDollyTargetPos, ease);
  camera.quaternion.slerpQuaternions(_dcDollyStartQuat, _dcDollyTargetQuat, ease);

  if (t >= 1) {
    _dcDollyActive = false;
  }
}

// ── Internal — overlays ───────────────────────────────────────────────────────

function _dcEnsureOverlays() {
  if (_dcDiscoveryEl) return;

  // Discovery banner
  _dcDiscoveryEl = document.createElement('div');
  _dcDiscoveryEl.id = 'dungeon-discovery-overlay';
  _dcDiscoveryEl.style.cssText = [
    'position:fixed', 'top:50%', 'left:50%',
    'transform:translate(-50%,-50%)',
    'text-align:center',
    'padding:24px 40px',
    'background:rgba(10,6,2,0.88)',
    'border:2px solid #c87a28',
    'border-radius:8px',
    'font-family:monospace',
    'pointer-events:none',
    'z-index:3000',
    'display:none',
  ].join(';');
  document.body.appendChild(_dcDiscoveryEl);

  // Countdown overlay
  _dcCountdownEl = document.createElement('div');
  _dcCountdownEl.id = 'dungeon-countdown-overlay';
  _dcCountdownEl.style.cssText = [
    'position:fixed', 'top:50%', 'left:50%',
    'transform:translate(-50%,-50%)',
    'text-align:center',
    'padding:24px 40px',
    'background:rgba(10,6,2,0.88)',
    'border:2px solid #e05a00',
    'border-radius:8px',
    'font-family:monospace',
    'pointer-events:none',
    'z-index:3000',
    'display:none',
  ].join(';');
  document.body.appendChild(_dcCountdownEl);

  // Victory overlay
  _dcVictoryEl = document.createElement('div');
  _dcVictoryEl.id = 'dungeon-victory-overlay';
  _dcVictoryEl.style.cssText = [
    'position:fixed', 'top:50%', 'left:50%',
    'transform:translate(-50%,-50%)',
    'text-align:center',
    'padding:32px 48px',
    'background:rgba(2,12,6,0.92)',
    'border:2px solid #44dd88',
    'border-radius:8px',
    'font-family:monospace',
    'z-index:3100',
    'display:none',
  ].join(';');
  document.body.appendChild(_dcVictoryEl);

  // Failure overlay
  _dcFailureEl = document.createElement('div');
  _dcFailureEl.id = 'dungeon-failure-overlay';
  _dcFailureEl.style.cssText = [
    'position:fixed', 'top:50%', 'left:50%',
    'transform:translate(-50%,-50%)',
    'text-align:center',
    'padding:32px 48px',
    'background:rgba(12,2,2,0.92)',
    'border:2px solid #dd4444',
    'border-radius:8px',
    'font-family:monospace',
    'z-index:3100',
    'display:none',
  ].join(';');
  document.body.appendChild(_dcFailureEl);
}

function _dcShowDiscoveryOverlay(room) {
  _dcEnsureOverlays();
  var tier = room.tier ? room.tier.charAt(0).toUpperCase() + room.tier.slice(1) : 'Shallow';
  _dcDiscoveryEl.innerHTML =
    '<div style="color:#c87a28;font-size:13px;letter-spacing:3px;text-transform:uppercase;margin-bottom:6px">DUNGEON DISCOVERED</div>' +
    '<div style="color:#ffd080;font-size:22px;font-weight:bold;letter-spacing:1px">' + tier + ' Mine</div>' +
    '<div style="color:#888;font-size:11px;margin-top:8px">Prepare yourself...</div>';
  _dcDiscoveryEl.style.display = 'block';
}

function _dcHideDiscoveryOverlay() {
  if (_dcDiscoveryEl) _dcDiscoveryEl.style.display = 'none';
}

function _dcShowCountdownOverlay() {
  _dcEnsureOverlays();
  _dcCountdownEl.style.display = 'block';
  _dcUpdateCountdownNumber(3);
}

function _dcUpdateCountdownNumber(n) {
  if (!_dcCountdownEl) return;
  _dcCountdownEl.innerHTML =
    '<div style="color:#e05a00;font-size:13px;letter-spacing:3px;margin-bottom:10px">DUNGEON CHALLENGE STARTING IN</div>' +
    '<div style="color:#ffa040;font-size:56px;font-weight:bold;line-height:1">' + n + '</div>' +
    '<div style="color:#aaa;font-size:11px;margin-top:10px">Press [Esc] to back out</div>';
}

function _dcHideCountdownOverlay() {
  if (_dcCountdownEl) _dcCountdownEl.style.display = 'none';
}

function _dcShowAlreadyCleared() {
  _dcEnsureOverlays();
  // Brief flash letting the player know this room is done
  _dcDiscoveryEl.innerHTML =
    '<div style="color:#44cc88;font-size:14px;letter-spacing:2px">DUNGEON CLEARED</div>' +
    '<div style="color:#888;font-size:11px;margin-top:6px">This room has already been completed.</div>';
  _dcDiscoveryEl.style.display = 'block';
  setTimeout(function () {
    if (_dcDiscoveryEl) _dcDiscoveryEl.style.display = 'none';
  }, 2000);
}

function _dcShowVictoryOverlay(room) {
  _dcEnsureOverlays();
  // Roll a basic loot drop for display
  var lootLine = '';
  if (typeof rollDungeonLoot === 'function') {
    var drop = rollDungeonLoot();
    if (drop) lootLine = '<div style="color:#ffd700;font-size:12px;margin-top:6px">Loot: +' + drop.amount + ' ' + drop.item + '</div>';
  }
  _dcVictoryEl.innerHTML =
    '<div style="color:#44dd88;font-size:20px;font-weight:bold;letter-spacing:2px">DUNGEON CLEARED!</div>' +
    lootLine +
    '<div style="color:#aaa;font-size:11px;margin-top:14px">Returning to surface...</div>';
  _dcVictoryEl.style.display = 'block';
  setTimeout(function () {
    if (_dcVictoryEl) _dcVictoryEl.style.display = 'none';
    if (room) removeDungeonSeal(room.id);
    if (typeof returnToSurvival === 'function') returnToSurvival();
  }, 2500);
}

function _dcShowFailureOverlay(room) {
  _dcEnsureOverlays();
  _dcFailureEl.innerHTML =
    '<div style="color:#dd4444;font-size:20px;font-weight:bold;letter-spacing:2px">DUNGEON FAILED</div>' +
    '<div style="color:#ff8888;font-size:13px;margin-top:8px">Try Again?</div>' +
    '<div style="color:#aaa;font-size:11px;margin-top:14px">Returning to entrance...</div>';
  _dcFailureEl.style.display = 'block';
  setTimeout(function () {
    if (_dcFailureEl) _dcFailureEl.style.display = 'none';
    // Reset room to undiscovered so player can retry
    if (room) {
      room.discovered = false;
      room.completed  = false;
    }
    if (typeof returnToSurvival === 'function') returnToSurvival();
  }, 2500);
}
