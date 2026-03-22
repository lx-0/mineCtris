// Mining mechanics — targeting, damage, shake, dust particles, and pickaxe model.
// Requires: state.js, config.js, world.js (unregisterBlock)

// Shared geometry for all dust particles (0.07-unit cube). Never disposed at runtime.
const _DUST_PARTICLE_GEO = new THREE.BoxGeometry(0.07, 0.07, 0.07);

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
  if (block.userData.defaultEmissive) {
    block.material.emissive.copy(block.userData.defaultEmissive);
  } else {
    block.material.emissive = new THREE.Color(0x000000);
  }
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
  const intersects = raycaster.intersectObjects(worldGroup.children, true);
  let newTarget = null;
  let newFaceNormal = null;
  let newGroundPoint = null;
  for (const intersection of intersects) {
    if (intersection.distance > MINING_RANGE) break;
    const name = intersection.object.name;
    if (name === "landed_block" || name === "trunk_block" || name === "leaf_block" || name === "world_object") {
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
      break;
    } else if (name === "ground") {
      newGroundPoint = intersection.point.clone();
      break;
    }
  }
  groundPlacementPoint = newGroundPoint;
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
      // Reset trunk tilt applied at hit 3/4
      if (targetedBlock.userData.isTilted) {
        targetedBlock.rotation.set(0, 0, 0);
        targetedBlock.userData.isTilted = false;
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
  updateMaterialTooltip();
}

function applyMineDamage(block, hits, effectiveMax) {
  if (!block || !block.material) return;
  const orig = block.userData.originalColor;
  if (!orig) return;
  const maxClicks = effectiveMax || block.userData.miningClicks || MINING_CLICKS_NEEDED;
  if (maxClicks >= 8) {
    // 3 visual crack stages for very hard blocks (obsidian):
    // Stage 1 (hits 1–3): light cracks, Stage 2 (hits 4–6): medium, Stage 3 (hits 7+): heavy
    if (hits <= 3) {
      block.material.color.setRGB(orig.r * 0.65, orig.g * 0.65, orig.b * 0.65);
    } else if (hits <= 6) {
      block.material.color.setRGB(orig.r * 0.38, orig.g * 0.38, orig.b * 0.38);
    } else {
      block.material.color.setRGB(
        Math.min(orig.r * 0.2 + 0.04, 1),
        orig.g * 0.15,
        orig.b * 0.15
      );
    }
  } else if (maxClicks > 2 && hits === 1) {
    // First hit on multi-hit block: light cracks — darken slightly
    block.material.color.setRGB(orig.r * 0.65, orig.g * 0.65, orig.b * 0.65);
  } else if (hits >= 1) {
    // 2-click blocks go straight to heavy on hit 1; others at hit 2+
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
  block.userData.fractured = false;
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

function spawnDustParticles(block, opts) {
  if (!block) return;
  opts = opts || {};
  const wp = new THREE.Vector3();
  block.getWorldPosition(wp);

  const objType = block.userData.objectType; // "trunk", "leaf", "rock", or undefined
  let count, dustColor, velocityFn, lifetime;

  // Rubble (garbage) blocks get distinct orange crack particles
  if (block.userData.isRubble) {
    count = opts.breakBurst
      ? Math.floor(Math.random() * 4) + 8  // 8–11 on break
      : Math.floor(Math.random() * 2) + 4; // 4–5 per hit
    // Orange-amber crack colour, brighter on break burst
    dustColor = opts.breakBurst
      ? new THREE.Color(0xff6600)  // bright orange burst
      : new THREE.Color(0xcc4400); // darker orange crack on hit
    lifetime = 0.3;
    velocityFn = () => {
      const speed = 2.5 + Math.random() * 2;
      return new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.2 + 0.3,
        (Math.random() - 0.5) * 2
      ).normalize().multiplyScalar(speed);
    };
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshLambertMaterial({
        color: dustColor,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(_DUST_PARTICLE_GEO, mat);
      mesh.position.copy(wp);
      scene.add(mesh);
      dustParticles.push({ mesh, velocity: velocityFn(), startTime: clock.getElapsedTime(), lifetime });
    }
    return;
  }

  if (objType === "trunk") {
    count = opts.breakBurst
      ? Math.floor(Math.random() * 3) + 8   // 8–10 on break
      : Math.floor(Math.random() * 3) + 4;  // 4–6 per hit
    dustColor = new THREE.Color(0x8b4513);
    lifetime = 0.35;
    velocityFn = () => new THREE.Vector3(
      (Math.random() - 0.5) * 4,
      Math.random() * 2.5 + 0.5,
      (Math.random() - 0.5) * 4
    );
  } else if (objType === "leaf") {
    count = Math.floor(Math.random() * 3) + 6; // 6–8
    dustColor = opts.breakBurst
      ? new THREE.Color(0x55cc55)  // lighter green pop on break
      : new THREE.Color(0x2d8a2d); // leaf green on hit
    lifetime = 0.35;
    velocityFn = () => new THREE.Vector3(
      (Math.random() - 0.5) * 6,  // ±3 wider spread
      Math.random() * 2.5 + 0.5,
      (Math.random() - 0.5) * 6
    );
  } else if (objType === "rock") {
    count = opts.breakBurst
      ? Math.floor(Math.random() * 3) + 10  // 10–12 on break
      : Math.floor(Math.random() * 3) + 5;  // 5–7 per hit
    dustColor = new THREE.Color(0xdddddd);
    lifetime = 0.2; // short — spark feel
    velocityFn = () => {
      const speed = 3 + Math.random() * 2; // 3–5 units/sec
      return new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 0.8 + 0.2,
        (Math.random() - 0.5) * 2
      ).normalize().multiplyScalar(speed);
    };
  } else if (objType === "obsidian") {
    count = opts.breakBurst
      ? Math.floor(Math.random() * 4) + 12  // 12–15 on break
      : Math.floor(Math.random() * 3) + 4;  // 4–6 per hit
    dustColor = new THREE.Color(0x3d0066);   // deep purple shard particles
    lifetime = 0.4;
    velocityFn = () => {
      const speed = 2 + Math.random() * 3;
      return new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.5 + 0.3,
        (Math.random() - 0.5) * 2
      ).normalize().multiplyScalar(speed);
    };
  } else if (block.userData.hazardType === 'crumble') {
    // Crumble: sandy dust cloud
    count = opts.breakBurst
      ? Math.floor(Math.random() * 4) + 10
      : Math.floor(Math.random() * 2) + 5;
    dustColor = new THREE.Color(0xc4a35a);
    lifetime = 0.5;
    velocityFn = () => new THREE.Vector3(
      (Math.random() - 0.5) * 5,
      Math.random() * 2 + 0.5,
      (Math.random() - 0.5) * 5
    );
  } else if (block.userData.hazardType === 'magma') {
    // Magma: fiery sparks
    count = opts.breakBurst
      ? Math.floor(Math.random() * 4) + 12
      : Math.floor(Math.random() * 2) + 6;
    dustColor = opts.breakBurst
      ? new THREE.Color(0xffaa00)
      : new THREE.Color(0xff4400);
    lifetime = 0.4;
    velocityFn = () => {
      var speed = 3 + Math.random() * 3;
      return new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 2 + 1,
        (Math.random() - 0.5) * 2
      ).normalize().multiplyScalar(speed);
    };
  } else {
    // Default: landed_block — unchanged behavior
    count = 4;
    dustColor = block.userData.originalColor
      ? block.userData.originalColor.clone()
      : block.material.color.clone();
    dustColor.multiplyScalar(0.7);
    lifetime = 0.35;
    velocityFn = () => new THREE.Vector3(
      (Math.random() - 0.5) * 4,
      Math.random() * 2.5 + 0.5,
      (Math.random() - 0.5) * 4
    );
  }

  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshLambertMaterial({
      color: dustColor,
      transparent: true,
      opacity: 0.85,
    });
    const mesh = new THREE.Mesh(_DUST_PARTICLE_GEO, mat);
    mesh.position.copy(wp);
    scene.add(mesh);
    dustParticles.push({
      mesh,
      velocity: velocityFn(),
      startTime: clock.getElapsedTime(),
      lifetime,
    });
  }
}

function updateDustParticles(delta) {
  const now = clock.getElapsedTime();
  for (let i = dustParticles.length - 1; i >= 0; i--) {
    const p = dustParticles[i];
    const age = now - p.startTime;
    if (age >= p.lifetime) {
      p.mesh.material.dispose();
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

function updateMaterialTooltip() {
  const tooltip = document.getElementById("material-tooltip");
  if (!tooltip) return;

  if (!targetedBlock) {
    tooltip.classList.remove("visible");
    return;
  }

  const matType = targetedBlock.userData.materialType ||
    (targetedBlock.userData.objectType ? OBJECT_TYPE_TO_MATERIAL[targetedBlock.userData.objectType] : null);
  if (!matType) {
    tooltip.classList.remove("visible");
    return;
  }

  // Void blocks: show special tooltip
  if (typeof isVoidBlock === 'function' && isVoidBlock(targetedBlock)) {
    tooltip.innerHTML = '<span style="color:#8844cc;">VOID</span> — Line-clear only';
    tooltip.classList.add("visible");
    return;
  }

  let totalHits = targetedBlock.userData.miningClicks || MINING_CLICKS_NEEDED;
  if (pickaxeTier === "stone") totalHits = Math.min(totalHits, 2);
  else if (pickaxeTier === "iron" || pickaxeTier === "diamond") totalHits = 1;
  if (obsidianPickaxeActive) totalHits = Math.max(1, totalHits - 1);
  if (earthquakeActive) totalHits = Math.max(1, Math.floor(totalHits / 2));

  const hitsDealt = miningProgress;
  const hitsRemaining = Math.max(0, totalHits - hitsDealt);

  let barStr = "";
  for (let i = 0; i < totalHits; i++) {
    barStr += i < hitsRemaining ? "█" : "░";
  }

  const _dropMat = BLOCK_TYPES[matType] && BLOCK_TYPES[matType].dropMaterial;
  const _displayKey = _dropMat || matType;
  const displayName = _displayKey.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const hitsLabel = hitsRemaining === 1 ? "1 hit remaining" : `${hitsRemaining} hits remaining`;

  const nameEl = document.getElementById("material-tooltip-name");
  const barEl = document.getElementById("material-tooltip-bar");
  const hitsEl = document.getElementById("material-tooltip-hits");
  const pickaxeEl = document.getElementById("material-tooltip-pickaxe");

  if (nameEl) nameEl.textContent = displayName;
  if (barEl) barEl.textContent = barStr;
  if (hitsEl) hitsEl.textContent = hitsLabel;
  if (pickaxeEl) {
    if (pickaxeTier !== "none") {
      const tierLabels = { stone: "Stone Pickaxe", iron: "Iron Pickaxe", diamond: "Diamond Pickaxe (AOE)", obsidian: "Obsidian Pickaxe (-1 hit)" };
      pickaxeEl.textContent = "[" + (tierLabels[pickaxeTier] || pickaxeTier) + "]";
      pickaxeEl.style.display = "";
    } else {
      pickaxeEl.style.display = "none";
    }
  }

  tooltip.classList.add("visible");
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
