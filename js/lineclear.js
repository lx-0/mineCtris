// Line-clear mechanic — detection, 4-phase explosion animation, and block removal.
// Requires: state.js, config.js, world.js (unregisterBlock), audio.js,
//           gamestate.js (addScore) — must be loaded before lineclear.js.

// ─── Fragment Pool ─────────────────────────────────────────────────────────────
// Pre-allocated pool of meshes, reused across line-clear events to avoid GC spikes.
const _LC_POOL_SIZE = 200;
const _lcFragPool   = [];  // { mesh, active }
const _lcFragments  = [];  // active: { entry, mesh, vel, angVel, age, maxAge }
const _lcRings      = [];  // active: { mesh, age }
const _lcLights     = [];  // active: { light, age, initialIntensity }
const _lcSpringBlks = [];  // active: { mesh, targetY, offset, vel }

// ─── Phase timing ──────────────────────────────────────────────────────────────
const _LC_ANTICIPATION = 0.20;  // seconds of vibration/ramp before detonation
const _LC_FRAG_MIN     = 0.60;  // fragment minimum lifetime (s)
const _LC_FRAG_MAX     = 0.80;  // fragment maximum lifetime (s)
const _LC_RING_EXPAND  = 0.30;  // seconds for ring to reach full radius
const _LC_RING_LIFE    = 0.65;  // total ring lifetime (s)
const _LC_RING_RADIUS  = 15.0;  // maximum ring radius (world units)
const _LC_RING_FADE    = 0.15;  // ring starts fading at this age (s)
const _LC_LIGHT_LIFE   = 0.20;  // point light fade duration (s)

// ─── Spring constants ──────────────────────────────────────────────────────────
const _LC_K = 180;  // spring stiffness
const _LC_D = 16;   // spring damping

// ─── Camera jolt / shake ──────────────────────────────────────────────────────
let _lcJoltAge  = -1;       // -1 = inactive
const _LC_JOLT     = 0.12;  // jolt duration (s)
const _LC_JOLT_STR = 0.18;  // peak upward jolt strength

let _lcShakeAge = -1;       // -1 = inactive
let _lcShakeDur = 0;
const _LC_SHAKE_STR = 0.10;

// ─── Phase state ──────────────────────────────────────────────────────────────
let _lcPhase    = 0;  // 0=idle, 1=anticipation, 2=aftermath
let _lcPhaseAge = 0;
let _lcNumLines = 0;

// ─── Fragment pool API ────────────────────────────────────────────────────────

/**
 * Call once from init() after scene exists.
 * Pre-allocates 200 fragment meshes using a shared BoxGeometry.
 */
function initLineClearFragmentPool() {
  const geo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  for (let i = 0; i < _LC_POOL_SIZE; i++) {
    const mat = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 1.0,
      roughness: 0.65,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    _lcFragPool.push({ mesh, active: false });
  }
}

function _lcAcquire() {
  for (let i = 0; i < _lcFragPool.length; i++) {
    if (!_lcFragPool[i].active) { _lcFragPool[i].active = true; return _lcFragPool[i]; }
  }
  return null;  // pool exhausted — skip this fragment
}

function _lcRelease(entry) {
  entry.mesh.visible = false;
  entry.active = false;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Called after each piece lands with the array of newly landed blocks.
 * Detects complete Y-levels and starts the explosion sequence.
 */
function checkLineClear(newBlocks) {
  if (lineClearInProgress) return;
  const ySet = new Set();
  newBlocks.forEach((b) => { if (b.userData.gridPos) ySet.add(b.userData.gridPos.y); });

  const completeLevels = [];
  ySet.forEach((gy) => {
    const layer = gridOccupancy.get(gy);
    if (layer && layer.size >= LINE_CLEAR_CELLS_NEEDED) completeLevels.push(gy);
  });
  if (!completeLevels.length) return;

  completeLevels.sort((a, b) => a - b);

  // Collect all blocks on complete levels and save their state.
  lineClearFlashBlocks = [];
  worldGroup.children.forEach((obj) => {
    if (obj.name !== "landed_block" || !obj.userData.gridPos) return;
    if (!completeLevels.includes(obj.userData.gridPos.y)) return;
    obj.userData._savedColor = obj.material.color.clone();
    obj.userData._basePos    = obj.position.clone();
    lineClearFlashBlocks.push(obj);
  });

  lineClearPendingYs  = completeLevels;
  lineClearFlashStart = clock.getElapsedTime();
  lineClearInProgress = true;
  _lcPhase            = 1;  // anticipation
  _lcPhaseAge         = 0;
  _lcNumLines         = completeLevels.length;

  // Audio: rumble + arpeggio
  playLineClearRumble();
  playLineClearSound(completeLevels.length);

  // Score
  const LINE_SCORES = [0, 100, 300, 500, 800];
  linesCleared += completeLevels.length;
  addScore(LINE_SCORES[Math.min(completeLevels.length, 4)]);

  // Banner
  if (lineClearBannerEl) {
    const labels = ["", "LINE CLEAR!", "DOUBLE!", "TRIPLE!", "TETRIS!"];
    lineClearBannerEl.textContent = labels[Math.min(completeLevels.length, 4)];
    lineClearBannerEl.style.display = "block";
    bannerTimer = 1.5;
  }
}

/**
 * Must be called every frame. Drives all phases of the explosion animation.
 */
function updateLineClear(delta) {
  // Banner countdown
  if (bannerTimer > 0) {
    bannerTimer -= delta;
    if (bannerTimer <= 0 && lineClearBannerEl) lineClearBannerEl.style.display = "none";
  }

  // ── Camera jolt (upward impulse, decays over ~120 ms) ──────────────────────
  if (_lcJoltAge >= 0) {
    _lcJoltAge += delta;
    if (_lcJoltAge < _LC_JOLT) {
      const t = _lcJoltAge / _LC_JOLT;
      camera.position.y += _LC_JOLT_STR * Math.sin(t * Math.PI) * delta * 6;
    } else {
      _lcJoltAge = -1;
    }
  }

  // ── Camera shake (Tetris only, 300 ms) ────────────────────────────────────
  if (_lcShakeAge >= 0) {
    _lcShakeAge += delta;
    if (_lcShakeAge < _lcShakeDur) {
      const strength = _LC_SHAKE_STR * (1 - _lcShakeAge / _lcShakeDur);
      camera.position.x += (Math.random() - 0.5) * strength;
      camera.position.y += (Math.random() - 0.5) * strength;
    } else {
      _lcShakeAge = -1;
    }
  }

  // ── Fragments ──────────────────────────────────────────────────────────────
  for (let i = _lcFragments.length - 1; i >= 0; i--) {
    const f = _lcFragments[i];
    f.age += delta;
    if (f.age >= f.maxAge) { _lcRelease(f.entry); _lcFragments.splice(i, 1); continue; }
    const t = f.age / f.maxAge;
    f.vel.y -= 9.8 * delta;  // gravity
    f.mesh.position.x += f.vel.x * delta;
    f.mesh.position.y += f.vel.y * delta;
    f.mesh.position.z += f.vel.z * delta;
    f.mesh.rotation.x += f.angVel.x * delta;
    f.mesh.rotation.y += f.angVel.y * delta;
    f.mesh.rotation.z += f.angVel.z * delta;
    f.mesh.material.opacity = Math.max(0, 1 - t);
    f.mesh.material.needsUpdate = true;
  }

  // ── Shockwave rings ────────────────────────────────────────────────────────
  for (let i = _lcRings.length - 1; i >= 0; i--) {
    const r = _lcRings[i];
    r.age += delta;
    if (r.age >= _LC_RING_LIFE) {
      scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
      _lcRings.splice(i, 1);
      continue;
    }
    const expandT = Math.min(r.age / _LC_RING_EXPAND, 1.0);
    r.mesh.scale.set(expandT, 1, expandT);
    const fadeT = Math.max(0, (r.age - _LC_RING_FADE) / (_LC_RING_LIFE - _LC_RING_FADE));
    r.mesh.material.opacity = Math.max(0, 1 - fadeT);
    r.mesh.material.needsUpdate = true;
  }

  // ── Point lights ───────────────────────────────────────────────────────────
  for (let i = _lcLights.length - 1; i >= 0; i--) {
    const l = _lcLights[i];
    l.age += delta;
    if (l.age >= _LC_LIGHT_LIFE) { scene.remove(l.light); _lcLights.splice(i, 1); continue; }
    l.light.intensity = l.initialIntensity * (1 - l.age / _LC_LIGHT_LIFE);
  }

  // ── Spring blocks ──────────────────────────────────────────────────────────
  for (let i = _lcSpringBlks.length - 1; i >= 0; i--) {
    const sb = _lcSpringBlks[i];
    const acc = -_LC_K * sb.offset - _LC_D * sb.vel;
    sb.vel    += acc * delta;
    sb.offset += sb.vel * delta;
    sb.mesh.position.y = sb.targetY + sb.offset;
    sb.mesh.userData.boundingBox = null;  // keep bbox fresh during spring motion
    if (Math.abs(sb.offset) < 0.005 && Math.abs(sb.vel) < 0.005) {
      sb.mesh.position.y = sb.targetY;
      _lcSpringBlks.splice(i, 1);
    }
  }

  if (!lineClearInProgress) return;

  _lcPhaseAge += delta;

  if (_lcPhase === 1) {
    // ── Phase 1: Anticipation (0 → 0.2 s) ─────────────────────────────────
    // Blocks vibrate ±0.03 at 20 Hz; emissive ramps from 0 → 1.5.
    const t = Math.min(_lcPhaseAge / _LC_ANTICIPATION, 1.0);
    lineClearFlashBlocks.forEach((b) => {
      if (!b.userData._basePos) return;
      const vib = Math.sin(_lcPhaseAge * Math.PI * 2 * 20) * 0.03;
      b.position.x = b.userData._basePos.x + vib;
      b.position.z = b.userData._basePos.z + vib * 0.7;
      const emv = t * 1.5;
      b.material.emissive.setRGB(Math.min(emv, 1), Math.min(emv, 1), Math.min(emv, 1));
      b.material.emissiveIntensity = emv;
      b.material.needsUpdate = true;
    });

    if (_lcPhaseAge >= _LC_ANTICIPATION) {
      _lcDetonate();
      _lcPhase    = 2;  // aftermath
      _lcPhaseAge = 0;
    }

  } else if (_lcPhase === 2) {
    // ── Phase 2: Aftermath — wait for all effects to finish ────────────────
    const allDone = (
      _lcFragments.length === 0 &&
      _lcRings.length     === 0 &&
      _lcLights.length    === 0 &&
      _lcSpringBlks.length === 0
    );
    if (allDone && _lcPhaseAge > 0.1) {
      worldGroup.children.forEach((o) => { o.userData.boundingBox = null; });
      lineClearInProgress = false;
      _lcPhase = 0;
    }
  }
}

// ─── Internal: detonation ─────────────────────────────────────────────────────

function _lcDetonate() {
  const numLines = _lcNumLines;

  // Per-clear-type scaling
  let fragMult = 1.0, numRings = 1, doFlash = false, flashAmt = 0, doShake = false;
  if      (numLines === 2) { fragMult = 1.5; numRings = 1; }
  else if (numLines === 3) { fragMult = 2.0; numRings = 2; doFlash = true; flashAmt = 0.45; }
  else if (numLines >= 4)  { fragMult = 3.0; numRings = 3; doFlash = true; flashAmt = 1.0; doShake = true; }

  const fragsPerBlock = Math.round(8 * fragMult);

  // Dominant block color
  const colorCounts = new Map();
  lineClearFlashBlocks.forEach((b) => {
    if (!b.userData._savedColor) return;
    const hex = b.userData._savedColor.getHex();
    colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
  });
  let dominantColor = 0xffffff, maxCount = 0;
  colorCounts.forEach((cnt, hex) => { if (cnt > maxCount) { maxCount = cnt; dominantColor = hex; } });

  // Cleared Y levels in world space
  const clearedYs = lineClearPendingYs;
  const worldYs   = clearedYs.map((gy) => gy * BLOCK_SIZE);
  const midWorldY = worldYs.reduce((a, b) => a + b, 0) / worldYs.length;

  // 1. Spawn fragments ──────────────────────────────────────────────────────
  lineClearFlashBlocks.forEach((b) => {
    const bPos   = b.userData._basePos ? b.userData._basePos.clone() : b.position.clone();
    const bColor = b.userData._savedColor || new THREE.Color(0xffffff);
    for (let f = 0; f < fragsPerBlock; f++) {
      const entry = _lcAcquire();
      if (!entry) break;
      const m  = entry.mesh;
      const sz = 0.3 + Math.random() * 0.2;
      m.scale.setScalar(sz);
      m.position.copy(bPos);
      m.material.color.copy(bColor);
      m.material.emissive.copy(bColor);
      m.material.emissiveIntensity = 0.8;
      m.material.opacity = 1.0;
      m.visible = true;
      const speed = 3 + Math.random() * 5;
      const ang   = Math.random() * Math.PI * 2;
      const elev  = (Math.random() * 0.7 - 0.2) * Math.PI;  // slightly upward bias
      _lcFragments.push({
        entry, mesh: m,
        vel: {
          x: Math.cos(ang) * Math.cos(elev) * speed,
          y: Math.sin(elev) * speed + 2.5,
          z: Math.sin(ang) * Math.cos(elev) * speed,
        },
        angVel: {
          x: (Math.random() - 0.5) * 12,
          y: (Math.random() - 0.5) * 12,
          z: (Math.random() - 0.5) * 12,
        },
        age: 0,
        maxAge: _LC_FRAG_MIN + Math.random() * (_LC_FRAG_MAX - _LC_FRAG_MIN),
      });
    }
  });

  // 2. Remove cleared blocks from scene and grid ────────────────────────────
  lineClearFlashBlocks.forEach((b) => {
    if (b.userData._basePos) b.position.copy(b.userData._basePos);
    unregisterBlock(b);
    worldGroup.remove(b);
  });
  lineClearFlashBlocks = [];

  // 3. Apply gravity to blocks above, with spring bounce ────────────────────
  const toShift = [];
  worldGroup.children.forEach((obj) => {
    if (obj.name !== "landed_block" || !obj.userData.gridPos) return;
    const origY = obj.userData.gridPos.y;
    const drop  = clearedYs.filter((y) => y < origY).length;
    if (drop) toShift.push({ obj, origY, drop });
  });
  toShift.forEach(({ obj, origY, drop }) => {
    const newY     = origY - drop;
    const targetWY = newY * BLOCK_SIZE;
    const key = obj.userData.gridPos.x + "," + obj.userData.gridPos.z;
    const old = gridOccupancy.get(origY);
    if (old) { old.delete(key); if (!old.size) gridOccupancy.delete(origY); }
    if (!gridOccupancy.has(newY)) gridOccupancy.set(newY, new Set());
    gridOccupancy.get(newY).add(key);
    obj.userData.gridPos.y = newY;
    obj.userData.boundingBox = null;
    // Start the block above its target — spring will pull it down with a bounce
    obj.position.y = targetWY + drop * BLOCK_SIZE;
    _lcSpringBlks.push({ mesh: obj, targetY: targetWY, offset: drop * BLOCK_SIZE, vel: 0 });
  });

  // 4. Shockwave rings ──────────────────────────────────────────────────────
  for (let r = 0; r < numRings; r++) {
    const ringY     = midWorldY + (r - (numRings - 1) / 2) * BLOCK_SIZE;
    // First ring uses dominant block color; additional rings are white
    const ringColor = (r === 0) ? dominantColor : 0xffffff;
    const ringGeo   = new THREE.TorusGeometry(_LC_RING_RADIUS, 0.25, 8, 64);
    const ringMat   = new THREE.MeshBasicMaterial({
      color: ringColor, transparent: true, opacity: 1.0, side: THREE.DoubleSide,
    });
    const ringMesh  = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;  // lie flat in XZ plane
    ringMesh.position.set(0, ringY, 0);
    ringMesh.scale.set(0.01, 1, 0.01);   // starts near-zero, expands via update
    scene.add(ringMesh);
    _lcRings.push({ mesh: ringMesh, age: 0 });
  }

  // 5. Point light flash at cleared level ───────────────────────────────────
  const ptLight = new THREE.PointLight(new THREE.Color(dominantColor), 5.0, 25);
  ptLight.position.set(0, midWorldY, 0);
  scene.add(ptLight);
  _lcLights.push({ light: ptLight, age: 0, initialIntensity: 5.0 });

  // 6. Camera upward jolt ───────────────────────────────────────────────────
  _lcJoltAge = 0;

  // 7. Screen flash for triple / Tetris ─────────────────────────────────────
  if (doFlash) {
    const el = document.getElementById("lc-flash-overlay");
    if (el) {
      el.style.transition = "none";
      el.style.opacity = flashAmt;
      void el.offsetHeight;  // force reflow so CSS transition fires from flashAmt
      el.style.transition = "opacity 0.45s ease-out";
      el.style.opacity = "0";
    }
  }

  // 8. Score-slam animation for Tetris ──────────────────────────────────────
  if (numLines >= 4 && scoreEl) {
    scoreEl.classList.remove("score-slam");
    void scoreEl.offsetHeight;
    scoreEl.classList.add("score-slam");
  }

  // 9. Extended screen shake for Tetris ─────────────────────────────────────
  if (doShake) {
    _lcShakeAge = 0;
    _lcShakeDur = 0.30;
  }

  // Clear pending Ys (gravity already applied above)
  lineClearPendingYs = [];
}
