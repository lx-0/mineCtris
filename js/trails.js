// Glow trails for falling tetrominos — ghost copies behind each block + emissive pulse.
// Requires: state.js (fallingPieces, scene), config.js (BLOCK_SIZE, GRAVITY, COLORS).
//
// Public API:
//   initTrails()              — call once after scene is created
//   createPieceTrail(piece)   — call on spawn
//   updateTrails(delta, t)    — call every frame
//   disposePieceTrail(piece)  — call just before piece lands

const TRAIL_SEGMENTS    = 8;    // ghost copies per block
const TRAIL_MAX_OPACITY = 0.30; // opacity at the segment closest to the piece
const TRAIL_SCALE_NEAR  = 0.88; // scale of the nearest segment
const TRAIL_SCALE_FAR   = 0.42; // scale of the farthest segment

let trailsGroup = null;
let _trailGeo   = null; // shared BoxGeometry — never disposed while game runs

function initTrails() {
  trailsGroup = new THREE.Group();
  scene.add(trailsGroup);
  _trailGeo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
}

/**
 * Allocate trail data for a newly spawned piece.
 * Call immediately after spawnFallingPiece adds the piece to the scene.
 */
function createPieceTrail(piece) {
  const colorIndex = piece.userData.colorIndex;
  const color      = new THREE.Color(COLORS[colorIndex]);
  const blockCount = piece.children.length;

  // posHistory[blockIdx][slotIdx] = Vector3 — ring buffer of world positions
  const posHistory = [];
  for (let b = 0; b < blockCount; b++) {
    const slots = [];
    for (let s = 0; s < TRAIL_SEGMENTS; s++) slots.push(new THREE.Vector3());
    posHistory.push(slots);
  }

  // One lightweight mesh per (block × segment)
  const segmentMeshes = [];
  for (let b = 0; b < blockCount; b++) {
    const blockSegs = [];
    for (let s = 0; s < TRAIL_SEGMENTS; s++) {
      const mat = new THREE.MeshBasicMaterial({
        color:       color,
        transparent: true,
        opacity:     0,
        depthWrite:  false,
      });
      const mesh = new THREE.Mesh(_trailGeo, mat);
      mesh.visible = false;
      trailsGroup.add(mesh);
      blockSegs.push(mesh);
    }
    segmentMeshes.push(blockSegs);
  }

  piece.userData.trail = {
    posHistory,
    segmentMeshes,
    historyHead:   0,  // next slot to write
    historyFilled: 0,  // how many slots contain valid data
    blockCount,
  };
}

/**
 * Update all active trails and block emissive glows.
 * @param {number} delta       — frame delta-time seconds
 * @param {number} elapsedTime — total elapsed seconds (from THREE.Clock)
 */
function updateTrails(delta, elapsedTime) {
  if (!trailsGroup) return;

  const _tv = new THREE.Vector3();

  fallingPieces.forEach((piece) => {
    const trail = piece.userData.trail;
    if (!trail) return;

    const { posHistory, segmentMeshes, blockCount } = trail;
    const actualBlocks = Math.min(blockCount, piece.children.length);
    if (actualBlocks === 0) return;

    // ── Fall speed → visible trail length ──────────────────────────────────
    const speed      = Math.abs(piece.userData.velocity.y);
    const baseSpeed  = GRAVITY / 4; // starting speed (difficultyMultiplier = 1)
    const speedRatio = THREE.MathUtils.clamp(speed / baseSpeed, 1, 3);
    // 4 segments at base speed, 8 segments at 3× speed
    const visSegments = Math.round(THREE.MathUtils.lerp(4, TRAIL_SEGMENTS, (speedRatio - 1) / 2));

    // ── Ground proximity → emissive glow pulse ──────────────────────────────
    let lowestY = Infinity;
    for (let b = 0; b < actualBlocks; b++) {
      piece.children[b].getWorldPosition(_tv);
      if (_tv.y < lowestY) lowestY = _tv.y;
    }
    // heightAboveLand ≈ 0 when the bottom face is about to touch the ground
    const heightAboveLand = Math.max(lowestY - BLOCK_SIZE / 2, 0);
    // proximity goes from 0 (far) to 1 (1 block above ground)
    const proximity  = THREE.MathUtils.clamp(1 - heightAboveLand / 5, 0, 1);
    // ramp from 40 % far away to 100 % near ground, then sinusoidal pulse at ~1 Hz
    const pulseBase  = THREE.MathUtils.lerp(0.4, 1.0, proximity);
    const pulse      = pulseBase * (0.5 + 0.5 * Math.abs(Math.sin(elapsedTime * Math.PI)));

    const inNudgePulse = elapsedTime < (piece.userData.nudgePulseEnd || -1);
    for (let b = 0; b < actualBlocks; b++) {
      const mat = piece.children[b].material;
      if (mat && mat.emissive) {
        const c = mat.color;
        mat.emissive.setRGB(c.r * 0.6, c.g * 0.6, c.b * 0.6);
        mat.emissiveIntensity = inNudgePulse ? Math.min(pulse * 3, 3.0) : pulse;
      }
    }

    // ── Record current block world positions into ring buffer ───────────────
    const head = trail.historyHead;
    for (let b = 0; b < actualBlocks; b++) {
      piece.children[b].getWorldPosition(posHistory[b][head]);
    }
    trail.historyHead   = (head + 1) % TRAIL_SEGMENTS;
    trail.historyFilled = Math.min(trail.historyFilled + 1, TRAIL_SEGMENTS);

    // ── Position and show/hide segment meshes ──────────────────────────────
    const filled = trail.historyFilled;
    for (let b = 0; b < actualBlocks; b++) {
      for (let s = 0; s < TRAIL_SEGMENTS; s++) {
        const mesh = segmentMeshes[b][s];

        if (s >= visSegments || s >= filled) {
          mesh.visible = false;
          continue;
        }

        // s = 0  → most recent position (closest to piece)
        // s = N  → oldest position in buffer (farthest, far end of trail)
        const histIdx = (head - s + TRAIL_SEGMENTS) % TRAIL_SEGMENTS;
        mesh.position.copy(posHistory[b][histIdx]);
        mesh.visible = true;

        const t     = s / Math.max(visSegments - 1, 1);        // 0 near, 1 far
        const scale = THREE.MathUtils.lerp(TRAIL_SCALE_NEAR, TRAIL_SCALE_FAR, t);
        mesh.scale.setScalar(scale);
        mesh.material.opacity = TRAIL_MAX_OPACITY * (1 - t) * (speedRatio / 3);
      }
    }
  });
}

/**
 * Remove trail data and segment meshes when a piece lands.
 * Call BEFORE moving blocks to worldGroup so we can still reset their emissive.
 */
function disposePieceTrail(piece) {
  const trail = piece.userData.trail;
  if (!trail) return;

  // Reset emissive on piece blocks before they become static world blocks
  for (let b = 0; b < Math.min(trail.blockCount, piece.children.length); b++) {
    const mat = piece.children[b].material;
    if (mat && mat.emissive) {
      mat.emissive.setRGB(0, 0, 0);
      mat.emissiveIntensity = 0;
    }
  }

  // Remove trail meshes from scene and free their materials
  for (let b = 0; b < trail.blockCount; b++) {
    for (let s = 0; s < TRAIL_SEGMENTS; s++) {
      const mesh = trail.segmentMeshes[b][s];
      trailsGroup.remove(mesh);
      mesh.material.dispose();
    }
  }

  piece.userData.trail = null;
}
