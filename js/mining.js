// Mining mechanics — targeting, damage, shake, dust particles, and pickaxe model.
// Requires: state.js, config.js, world.js (unregisterBlock)

function highlightBlock(block) {
  if (!block || !block.material) return;
  if (!block.userData.originalColor) {
    block.userData.originalColor = block.material.color.clone();
  }
  block.material.emissive = new THREE.Color(0x555555);
  block.material.needsUpdate = true;
}

function unhighlightBlock(block) {
  if (!block || !block.material || !block.userData.originalColor) return;
  block.material.emissive = new THREE.Color(0x000000);
  block.material.needsUpdate = true;
}

function unhighlightTarget() {
  if (targetedBlock) {
    unhighlightBlock(targetedBlock);
  }
}

function updateTargeting() {
  if (!controls || !camera || !raycaster) return;
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const intersects = raycaster.intersectObjects(worldGroup.children);
  let newTarget = null;
  let newFaceNormal = null;
  if (intersects.length > 0) {
    const intersection = intersects[0];
    if (
      (intersection.object.name === "landed_block" || intersection.object.name === "trunk_block") &&
      intersection.distance <= MINING_RANGE
    ) {
      newTarget = intersection.object;
      if (intersection.face) {
        newFaceNormal = intersection.face.normal.clone()
          .transformDirection(intersection.object.matrixWorld);
        // Snap to nearest axis
        const ax = Math.abs(newFaceNormal.x);
        const ay = Math.abs(newFaceNormal.y);
        const az = Math.abs(newFaceNormal.z);
        if (ax >= ay && ax >= az) {
          newFaceNormal.set(Math.sign(newFaceNormal.x), 0, 0);
        } else if (ay >= ax && ay >= az) {
          newFaceNormal.set(0, Math.sign(newFaceNormal.y), 0);
        } else {
          newFaceNormal.set(0, 0, Math.sign(newFaceNormal.z));
        }
      }
    }
  }
  // Always keep face normal in sync with current target
  targetedFaceNormal = newFaceNormal;
  if (newTarget !== targetedBlock) {
    if (targetedBlock) {
      resetMineDamage(targetedBlock);
      if (miningShakeBlock === targetedBlock) {
        if (targetedBlock.userData.basePosition) {
          targetedBlock.position.copy(targetedBlock.userData.basePosition);
          targetedBlock.userData.basePosition = null;
        }
        miningShakeActive = false;
        miningShakeBlock = null;
      }
    }
    unhighlightTarget();
    if (newTarget) {
      highlightBlock(newTarget);
      crosshair.classList.add("target-locked");
    } else {
      crosshair.classList.remove("target-locked");
    }
    targetedBlock = newTarget;
    miningProgress = 0;
  }
}

function applyMineDamage(block, hits) {
  if (!block || !block.material) return;
  const orig = block.userData.originalColor;
  if (!orig) return;
  if (hits === 1) {
    // Hit 1: light cracks — darken slightly
    block.material.color.setRGB(orig.r * 0.65, orig.g * 0.65, orig.b * 0.65);
  } else if (hits === 2) {
    // Hit 2: heavy cracks — dark with red tint
    block.material.color.setRGB(
      Math.min(orig.r * 0.35 + 0.08, 1),
      orig.g * 0.2,
      orig.b * 0.2
    );
  }
  block.material.needsUpdate = true;
}

function resetMineDamage(block) {
  if (!block || !block.material || !block.userData.originalColor) return;
  block.material.color.copy(block.userData.originalColor);
  block.material.needsUpdate = true;
}

function startMiningShake(block) {
  if (!block) return;
  if (!block.userData.basePosition) {
    block.userData.basePosition = block.position.clone();
  }
  miningShakeBlock = block;
  miningShakeStart = clock.getElapsedTime();
  miningShakeActive = true;
}

function spawnDustParticles(block) {
  if (!block) return;
  const wp = new THREE.Vector3();
  block.getWorldPosition(wp);
  const dustColor = block.userData.originalColor
    ? block.userData.originalColor.clone()
    : block.material.color.clone();
  dustColor.multiplyScalar(0.7);
  for (let i = 0; i < 4; i++) {
    const geo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
    const mat = new THREE.MeshLambertMaterial({
      color: dustColor,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(wp);
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 4,
      Math.random() * 2.5 + 0.5,
      (Math.random() - 0.5) * 4
    );
    scene.add(mesh);
    dustParticles.push({
      mesh,
      velocity: vel,
      startTime: clock.getElapsedTime(),
      lifetime: 0.35,
    });
  }
}

function updateDustParticles(delta) {
  const now = clock.getElapsedTime();
  for (let i = dustParticles.length - 1; i >= 0; i--) {
    const p = dustParticles[i];
    const age = now - p.startTime;
    if (age >= p.lifetime) {
      scene.remove(p.mesh);
      dustParticles.splice(i, 1);
      continue;
    }
    p.velocity.y -= GRAVITY * delta;
    p.mesh.position.addScaledVector(p.velocity, delta);
    p.mesh.material.opacity = 0.85 * (1 - age / p.lifetime);
    p.mesh.material.needsUpdate = true;
  }
}

function createPickaxeModel() {
  const group = new THREE.Group();

  const handleMaterial = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
  const headMaterial = new THREE.MeshLambertMaterial({ color: 0x808080 });

  const handleGeometry = new THREE.BoxGeometry(0.1, 0.8, 0.1);
  const handle = new THREE.Mesh(handleGeometry, handleMaterial);
  handle.position.y = -0.3;
  group.add(handle);

  const headGeometry = new THREE.BoxGeometry(0.6, 0.15, 0.12);
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = 0.1;
  group.add(head);

  const handleEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(handleGeometry),
    new THREE.LineBasicMaterial({ color: 0x000000 })
  );
  handleEdges.position.copy(handle.position);
  group.add(handleEdges);

  const headEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(headGeometry),
    new THREE.LineBasicMaterial({ color: 0x000000 })
  );
  headEdges.position.copy(head.position);
  group.add(headEdges);

  return group;
}
