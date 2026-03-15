// Ambient block aura particle system — passive emitters for lava, gold, and ice blocks.
// Requires: state.js (gridOccupancy, scene, clock), config.js
//
// Public API:
//   initAuras()                        — call once after scene is created
//   updateAuras(dt, camera)            — call every frame
//   registerAuraEmitter(x, y, z, mat) — call when an aura-material block is placed
//   removeAuraEmitter(x, y, z)        — call when an aura-material block is removed

const AURA_CULL_DIST = 30; // units — skip emitters beyond this distance from camera

const _AURA_CFG = {
  lava: {
    rateMin:  2.0,
    rateMax:  3.0,
    lifeMin:  0.4,
    lifeMax:  0.4,
    colors:   [0xff6600, 0xffaa00],
    poolSize: 30,
  },
  gold: {
    rateMin:  1.0,
    rateMax:  1.0,
    lifeMin:  0.6,
    lifeMax:  1.2,
    colors:   [0xffee44],
    poolSize: 20,
  },
  ice: {
    rateMin:  0.5,
    rateMax:  0.5,
    lifeMin:  1.2,
    lifeMax:  1.2,
    colors:   [0xaaddff],
    poolSize: 20,
  },
};

// [{ x, y, z, material, nextEmitTime }]
const auraEmitters = [];

// [{ mesh, velocity: Vector3, life, maxLife, active, matKey }]
const auraParticles = [];

let _auraGroup = null;
let _auraGeo   = null; // shared SphereGeometry

function initAuras() {
  _auraGroup = new THREE.Group();
  scene.add(_auraGroup);

  _auraGeo = new THREE.SphereGeometry(0.06, 4, 3);

  for (const [matKey, cfg] of Object.entries(_AURA_CFG)) {
    for (let i = 0; i < cfg.poolSize; i++) {
      const mesh = new THREE.Mesh(
        _auraGeo,
        new THREE.MeshBasicMaterial({
          color:       cfg.colors[0],
          transparent: true,
          opacity:     0.9,
          depthWrite:  false,
        })
      );
      mesh.visible = false;
      _auraGroup.add(mesh);
      auraParticles.push({
        mesh,
        velocity: new THREE.Vector3(),
        life:     0,
        maxLife:  1,
        active:   false,
        matKey,
      });
    }
  }
}

/** Register an emitter when a block with an aura material is placed. */
function registerAuraEmitter(x, y, z, material) {
  if (!_AURA_CFG[material]) return;
  auraEmitters.push({ x, y, z, material, nextEmitTime: 0 });
}

/** Remove an emitter when the corresponding block is removed. */
function removeAuraEmitter(x, y, z) {
  const rx = Math.round(x);
  const rz = Math.round(z);
  const idx = auraEmitters.findIndex(
    e => Math.round(e.x) === rx && e.y === y && Math.round(e.z) === rz
  );
  if (idx !== -1) auraEmitters.splice(idx, 1);
}

/** Pick an inactive particle from the pool that matches the given material key. */
function _claimParticle(matKey) {
  for (const p of auraParticles) {
    if (!p.active && p.matKey === matKey) return p;
  }
  return null;
}

/** Emit one particle from an emitter and schedule its next emission. */
function _emit(emitter, now) {
  const cfg = _AURA_CFG[emitter.material];
  const p   = _claimParticle(emitter.material);
  if (!p) return;

  // Spawn at top-face centre with a small XZ jitter
  p.mesh.position.set(
    emitter.x + (Math.random() - 0.5) * 0.7,
    emitter.y + 0.5,
    emitter.z + (Math.random() - 0.5) * 0.7
  );

  // Per-material velocity
  const mat = emitter.material;
  if (mat === 'lava') {
    p.velocity.set(
      (Math.random() - 0.5) * 0.6,          // ±0.3
      0.8 + Math.random() * 0.5,
      (Math.random() - 0.5) * 0.6           // ±0.3
    );
  } else if (mat === 'gold') {
    p.velocity.set(
      (Math.random() - 0.5) * 0.4,          // ±0.2
      (Math.random() - 0.5) * 0.4,          // ±0.2 gentle drift
      (Math.random() - 0.5) * 0.4           // ±0.2
    );
  } else { // ice
    p.velocity.set(
      (Math.random() - 0.5) * 0.2,          // ±0.1
      0.1 + Math.random() * 0.1,
      (Math.random() - 0.5) * 0.2           // ±0.1
    );
  }

  // Randomise life and color
  p.life    = 0;
  p.maxLife = cfg.lifeMin + Math.random() * (cfg.lifeMax - cfg.lifeMin);
  const hexColor = cfg.colors[Math.floor(Math.random() * cfg.colors.length)];
  p.mesh.material.color.setHex(hexColor);
  p.mesh.material.opacity = 0.9;
  p.active      = true;
  p.mesh.visible = true;

  // Schedule next emission from this emitter
  const rate = cfg.rateMin + Math.random() * (cfg.rateMax - cfg.rateMin);
  emitter.nextEmitTime = now + 1 / rate;
}

/**
 * Advance all aura particles and fire new ones from emitters.
 * @param {number} dt     — seconds since last frame
 * @param {THREE.Camera} camera
 */
function updateAuras(dt, camera) {
  if (!_auraGroup) return;

  const now    = clock.getElapsedTime();
  const camPos = camera.position;

  // ── Advance active particles ───────────────────────────────────────────────
  for (const p of auraParticles) {
    if (!p.active) continue;

    p.life += dt;
    if (p.life >= p.maxLife) {
      p.active       = false;
      p.mesh.visible = false;
      continue;
    }

    p.mesh.position.addScaledVector(p.velocity, dt);

    // Fade out linearly over lifetime
    const t = p.life / p.maxLife;
    p.mesh.material.opacity = 0.9 * (1 - t);
  }

  // ── Emit from active emitters ──────────────────────────────────────────────
  for (const emitter of auraEmitters) {
    // Distance cull
    const dx = emitter.x - camPos.x;
    const dz = emitter.z - camPos.z;
    if (dx * dx + dz * dz > AURA_CULL_DIST * AURA_CULL_DIST) continue;

    // Buried check: skip if the block directly above is occupied
    const gx = Math.round(emitter.x);
    const gy = emitter.y;            // already grid-snapped (0.5, 1.5, …)
    const gz = Math.round(emitter.z);
    const aboveLayer = gridOccupancy.get(gy + 1);
    if (aboveLayer && aboveLayer.has(gx + ',' + gz)) continue;

    if (now >= emitter.nextEmitTime) {
      _emit(emitter, now);
    }
  }
}
