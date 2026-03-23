// Landing shadow/ghost preview for falling pieces.
// Requires: state.js (shadowsGroup, worldGroup, fallingPieces),
//           config.js (BLOCK_SIZE, COLORS, SHADOW_APPEAR_DIST)

const _shadowRaycaster = new THREE.Raycaster();
const _shadowDownDir = new THREE.Vector3(0, -1, 0);
const _shadowWP = new THREE.Vector3();

/**
 * Create flat semi-transparent ghost meshes for a newly spawned piece and
 * attach them to shadowsGroup.  Called once per piece at spawn time.
 */
function createPieceShadow(piece) {
  const color = COLORS[piece.userData.colorIndex] || 0xffffff;
  const shadowGroup = new THREE.Group();

  piece.children.forEach(() => {
    const geo = new THREE.BoxGeometry(
      BLOCK_SIZE * 0.9,
      BLOCK_SIZE * 0.08,
      BLOCK_SIZE * 0.9
    );
    const mat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    shadowGroup.add(new THREE.Mesh(geo, mat));
  });

  shadowsGroup.add(shadowGroup);
  piece.userData.shadowGroup = shadowGroup;
}

/**
 * Update shadow positions every frame.  Called from updateFallingPieces()
 * after the piece has moved.
 */
function updatePieceShadow(piece) {
  const shadowGroup = piece.userData.shadowGroup;
  if (!shadowGroup) return;

  const targets = worldGroup.children; // includes ground plane and landed blocks

  // Gather world positions and surface hit for each block in one pass.
  const blockData = piece.children.map((block) => {
    block.getWorldPosition(_shadowWP);
    const wp = _shadowWP.clone();

    _shadowRaycaster.set(wp, _shadowDownDir);
    const hits = _shadowRaycaster.intersectObjects(targets, false);

    // Default to ground plane at y = 0 (block center lands at BLOCK_SIZE/2).
    const surfaceY = hits.length > 0 ? hits[0].point.y : 0;
    return { wp, surfaceY };
  });

  // The piece stops when the *first* block hits a surface, which is the block
  // that needs the smallest downward shift.  landingDeltaY is the piece-level
  // Y offset needed (negative = still falling).
  let landingDeltaY = -Infinity;
  blockData.forEach(({ wp, surfaceY }) => {
    const deltaY = surfaceY + BLOCK_SIZE / 2 - wp.y;
    if (deltaY > landingDeltaY) landingDeltaY = deltaY;
  });

  const distToLanding = -landingDeltaY; // positive distance still to fall

  // Hide shadow when too far away or already landed.
  if (distToLanding > SHADOW_APPEAR_DIST || distToLanding <= 0) {
    shadowGroup.visible = false;
    return;
  }

  shadowGroup.visible = true;

  // Fade in as the piece approaches: opacity ranges 0.08 → 0.40.
  const t = 1 - distToLanding / SHADOW_APPEAR_DIST;
  const opacity = 0.08 + t * 0.32;

  blockData.forEach(({ wp, surfaceY }, i) => {
    if (i >= shadowGroup.children.length) return;
    const shadowMesh = shadowGroup.children[i];
    // Place shadow flat on the surface directly below this block.
    shadowMesh.position.set(wp.x, surfaceY + 0.05, wp.z);
    shadowMesh.material.opacity = opacity;
  });
}

/**
 * Remove and dispose shadow geometry when a piece lands.
 */
function removePieceShadow(piece) {
  const shadowGroup = piece.userData.shadowGroup;
  if (!shadowGroup) return;
  shadowsGroup.remove(shadowGroup);
  shadowGroup.children.forEach((m) => {
    m.geometry.dispose();
    m.material.dispose();
  });
  piece.userData.shadowGroup = null;
}
