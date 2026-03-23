// World object spawning helpers — trees, rocks, obsidian.
// Loaded before main.js.

function spawnTree(tx, tz) {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
  const leafMat  = new THREE.MeshLambertMaterial({ color: 0x2d8a2d });
  const trunkHeight = Math.floor(Math.random() * 3) + 4; // 4–6 blocks

  const meshes = [];

  // Trunk: individual stacked cubes, each independently mineable
  const trunkGeo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  for (let ty = 0; ty < trunkHeight; ty++) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat.clone());
    trunk.position.set(tx, BLOCK_SIZE / 2 + ty * BLOCK_SIZE, tz);
    trunk.name = "trunk_block";
    trunk.userData.miningClicks = BLOCK_TYPES.wood.hits;
    trunk.userData.objectType = "trunk";
    worldGroup.add(trunk);
    meshes.push(trunk);
  }

  // Minecraft-style leaf canopy: 3 layers
  const leafTopY = trunkHeight * BLOCK_SIZE;
  const leafLayers = [
    { y: leafTopY,                  radius: 2, cornerCut: true  },
    { y: leafTopY + BLOCK_SIZE,     radius: 1, cornerCut: false },
    { y: leafTopY + BLOCK_SIZE * 2, radius: 0, cornerCut: false },
  ];

  const leafGeo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  for (const layer of leafLayers) {
    const r = layer.radius;
    for (let lx = -r; lx <= r; lx++) {
      for (let lz = -r; lz <= r; lz++) {
        if (layer.cornerCut && Math.abs(lx) === r && Math.abs(lz) === r) continue;
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.set(
          tx + lx * BLOCK_SIZE,
          layer.y + BLOCK_SIZE / 2,
          tz + lz * BLOCK_SIZE
        );
        leaf.name = "leaf_block";
        leaf.userData.miningClicks = BLOCK_TYPES.leaf.hits;
        leaf.userData.objectType = "leaf";
        worldGroup.add(leaf);
        meshes.push(leaf);
      }
    }
  }

  return meshes;
}

/**
 * Spawn a rock at (rx, rz) with the given number of stacked blocks (1–3).
 * Rocks do not respawn when destroyed.
 */
function spawnRock(rx, rz, size) {
  const geo = new THREE.BoxGeometry(1.2, 1, 1.2);
  for (let i = 0; i < size; i++) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x808080 });
    const block = new THREE.Mesh(geo, mat);
    block.position.set(rx, BLOCK_SIZE / 2 + i * BLOCK_SIZE, rz);
    block.name = "world_object";
    block.userData.miningClicks = BLOCK_TYPES.rock.hits;
    block.userData.objectType = "rock";
    worldGroup.add(block);
  }
}

/**
 * Spawn a single obsidian block at (ox, oz), partially buried in the ground.
 * Obsidian does NOT respawn when destroyed.
 */
function spawnObsidian(ox, oz) {
  const geo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  const mat = new THREE.MeshLambertMaterial({
    color: 0x1a0020,
    emissive: new THREE.Color(0x000000),
  });
  const block = new THREE.Mesh(geo, mat);
  // Partially bury: y center between 0.1 (mostly buried) and BLOCK_SIZE/2 (surface)
  const buryY = Math.random() * (BLOCK_SIZE / 2 - 0.1) + 0.1;
  block.position.set(ox, buryY, oz);
  block.name = "world_object";
  block.userData.miningClicks = BLOCK_TYPES.obsidian.hits;
  block.userData.objectType   = "obsidian";
  block.userData.materialType = "obsidian";
  block.userData.shimmerOffset = Math.random() * Math.PI * 2;
  worldGroup.add(block);
  obsidianBlocks.push(block);
  return block;
}

/**
 * Return the player to Survival mode. Restores the survival world and repositions the player.
 */
function returnToSurvival() {
  if (typeof resetGame === 'function') resetGame();

  isSurvivalMode = true;
  if (typeof hasSurvivalWorld === 'function' && hasSurvivalWorld()) {
    if (typeof restoreSurvivalWorld === 'function') restoreSurvivalWorld();
    survivalSessionNumber++;
  } else {
    survivalSessionNumber = 1;
    if (typeof initWorldStats === 'function') initWorldStats();
    if (typeof generateUnderground === 'function') generateUnderground();
  }

  var survBadgeEl = document.getElementById('survival-badge');
  if (survBadgeEl) survBadgeEl.style.display = 'block';

  // Spawn at grid center
  if (typeof controls !== 'undefined' && controls) {
    controls.getObject().position.set(0, PLAYER_HEIGHT, 0);
  }

  if (typeof requestPointerLock === 'function') requestPointerLock();
}

/**
 * Tick tree respawn queue. Call every frame while game is active.
 * @param {number} delta        Seconds since last frame.
 * @param {number} elapsedTime  Total elapsed time (for grow animation).
 */
function updateTreeRespawn(delta, elapsedTime) {
  for (let i = treeRespawnQueue.length - 1; i >= 0; i--) {
    const entry = treeRespawnQueue[i];

    if (entry.growing) {
      // Animate scale 0 → 1 over 1.5 seconds
      const t = Math.min((elapsedTime - entry.growStart) / 1.5, 1);
      entry.meshes.forEach(m => m.scale.setScalar(t));
      if (t >= 1) {
        treeRespawnQueue.splice(i, 1); // done growing
      }
    } else {
      entry.timer -= delta;
      if (entry.timer <= 0) {
        // Grow a new tree at original position ± 0–2 block random offset
        const ox = (Math.floor(Math.random() * 5) - 2) * BLOCK_SIZE;
        const oz = (Math.floor(Math.random() * 5) - 2) * BLOCK_SIZE;
        const meshes = spawnTree(entry.x + ox, entry.z + oz);
        meshes.forEach(m => m.scale.setScalar(0));
        entry.growing  = true;
        entry.growStart = elapsedTime;
        entry.meshes   = meshes;
      }
    }
  }
}

