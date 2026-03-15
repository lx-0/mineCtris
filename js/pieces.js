// Falling Tetris pieces — creation, spawning, rotation, and landing.
// Requires: state.js, config.js, world.js (createBlockMesh, registerBlock),
//           lineclear.js (checkLineClear), gamestate.js (checkGameOver)

function createPiece3D(shapeData, colorIndex) {
  const pieceGroup = new THREE.Group();
  const color = COLORS[colorIndex];
  shapeData.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value > 0) {
        const blockMesh = createBlockMesh(color);
        blockMesh.position.set(x * BLOCK_SIZE, -y * BLOCK_SIZE, 0);
        pieceGroup.add(blockMesh);
      }
    });
  });
  pieceGroup.userData.pivotOffset = new THREE.Vector3(
    (shapeData[0].length / 2 - 0.5) * BLOCK_SIZE,
    (-shapeData.length / 2 + 0.5) * BLOCK_SIZE,
    0
  );
  pieceGroup.children.forEach((child) =>
    child.position.sub(pieceGroup.userData.pivotOffset)
  );
  pieceGroup.position.add(pieceGroup.userData.pivotOffset);
  return pieceGroup;
}

function spawnFallingPiece() {
  const index = Math.floor(Math.random() * (SHAPES.length - 1)) + 1;
  const shape = SHAPES[index];
  const piece3D = createPiece3D(shape, index);
  const spawnX = (Math.random() - 0.5) * (WORLD_SIZE * 0.8);
  const spawnZ = (Math.random() - 0.5) * (WORLD_SIZE * 0.8);
  const spawnY = WORLD_SIZE * 0.6;
  piece3D.position.set(spawnX, spawnY, spawnZ);
  piece3D.userData.velocity = new THREE.Vector3(0, -(GRAVITY / 4) * difficultyMultiplier, 0);
  piece3D.userData.colorIndex = index;
  piece3D.userData.timeSinceRotation = 0;
  piece3D.userData.rotationInterval =
    Math.random() * (MAX_ROTATION_INTERVAL - MIN_ROTATION_INTERVAL) +
    MIN_ROTATION_INTERVAL;
  piece3D.userData.nudgeOffsetX = 0;
  piece3D.userData.nudgeOffsetZ = 0;
  piece3D.userData.nudgePulseEnd = -1;
  fallingPiecesGroup.add(piece3D);
  fallingPieces.push(piece3D);
  createPieceShadow(piece3D);
  createPieceTrail(piece3D);
}

function applyRandomRotation(piece) {
  const axis = Math.floor(Math.random() * 3);
  const angle = Math.PI / 2;
  if (axis === 0) piece.rotateX(angle);
  else if (axis === 1) piece.rotateY(angle);
  else piece.rotateZ(angle);
}

// Check if the player is close to a landing piece and apply a lateral push.
function checkAndApplyPlayerPush(piece) {
  if (!controls) return;
  const playerPos = controls.getObject().position;

  // Compute horizontal center of the piece from its blocks
  const center = new THREE.Vector3();
  const tempVec = new THREE.Vector3();
  piece.children.forEach((block) => {
    block.getWorldPosition(tempVec);
    center.add(tempVec);
  });
  if (piece.children.length === 0) return;
  center.divideScalar(piece.children.length);

  // Check each block's horizontal distance from the player
  let tooClose = false;
  piece.children.forEach((block) => {
    block.getWorldPosition(tempVec);
    const dx = playerPos.x - tempVec.x;
    const dz = playerPos.z - tempVec.z;
    if (Math.sqrt(dx * dx + dz * dz) < PUSH_DISTANCE_THRESHOLD) {
      tooClose = true;
    }
  });
  if (!tooClose) return;

  // Push direction: horizontal vector from piece center to player
  const pushDir = new THREE.Vector3(
    playerPos.x - center.x,
    0,
    playerPos.z - center.z
  );
  if (pushDir.length() < 0.001) {
    pushDir.set(1, 0, 0); // fallback: push sideways if player is directly over center
  } else {
    pushDir.normalize();
  }

  playerPushVelocity.copy(pushDir.multiplyScalar(PUSH_SPEED));
  screenShakeActive = true;
  screenShakeStart = clock.getElapsedTime();
}

/** Returns the falling piece with the lowest point, if it's within the nudge activation zone. */
function getNudgeTargetPiece() {
  let closestPiece = null;
  let closestLowest = Infinity;
  const _tv = new THREE.Vector3();
  fallingPieces.forEach((piece) => {
    let lowestY = Infinity;
    piece.children.forEach((block) => {
      block.getWorldPosition(_tv);
      if (_tv.y < lowestY) lowestY = _tv.y;
    });
    if (lowestY < closestLowest) {
      closestLowest = lowestY;
      closestPiece = piece;
    }
  });
  // Activate when bottom face is within NUDGE_PROXIMITY_BLOCKS blocks of ground (Y=0)
  const heightAboveGround = closestLowest - BLOCK_SIZE / 2;
  if (closestPiece && heightAboveGround <= NUDGE_PROXIMITY_BLOCKS * BLOCK_SIZE) {
    return closestPiece;
  }
  return null;
}

/** Spawn a directional swoosh burst of particles from the piece center in the nudge direction. */
function spawnNudgeSwoosh(center, dx, dz, colorIndex) {
  const col = COLORS[colorIndex];
  if (!col) return;
  const swooshColor = new THREE.Color(col);
  swooshColor.r = Math.min(swooshColor.r * 1.6 + 0.15, 1);
  swooshColor.g = Math.min(swooshColor.g * 1.6 + 0.15, 1);
  swooshColor.b = Math.min(swooshColor.b * 1.6 + 0.15, 1);
  const count = 7;
  for (let i = 0; i < count; i++) {
    const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const mat = new THREE.MeshBasicMaterial({ color: swooshColor, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      center.x + (Math.random() - 0.5) * 1.5,
      center.y + (Math.random() - 0.5) * 1.5,
      center.z + (Math.random() - 0.5) * 1.5
    );
    scene.add(mesh);
    const baseSpeed = 5 + Math.random() * 3;
    dustParticles.push({
      mesh,
      velocity: new THREE.Vector3(
        dx * baseSpeed + (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 1.5,
        dz * baseSpeed + (Math.random() - 0.5) * 2
      ),
      startTime: clock.getElapsedTime(),
      lifetime: 0.25,
    });
  }
}

/**
 * Nudge the piece closest to the ground by (dx, dz) blocks on the X/Z axes.
 * Called from key handlers (Q/E/Z/X).
 */
function applyNudge(dx, dz) {
  if (nudgeCooldown > 0) return;
  const piece = getNudgeTargetPiece();
  if (!piece) return;

  const newOffsetX = piece.userData.nudgeOffsetX + dx;
  const newOffsetZ = piece.userData.nudgeOffsetZ + dz;

  // Enforce per-axis cumulative limit
  if (dx !== 0 && Math.abs(newOffsetX) > NUDGE_MAX_OFFSET) return;
  if (dz !== 0 && Math.abs(newOffsetZ) > NUDGE_MAX_OFFSET) return;

  // World boundary guard (1-block buffer inside world edge)
  const newX = piece.position.x + dx * BLOCK_SIZE;
  const newZ = piece.position.z + dz * BLOCK_SIZE;
  if (Math.abs(newX) > WORLD_SIZE / 2 - BLOCK_SIZE) return;
  if (Math.abs(newZ) > WORLD_SIZE / 2 - BLOCK_SIZE) return;

  // Apply the nudge
  piece.position.x = newX;
  piece.position.z = newZ;
  piece.userData.nudgeOffsetX = newOffsetX;
  piece.userData.nudgeOffsetZ = newOffsetZ;

  // Start cooldown and emissive pulse
  nudgeCooldown = NUDGE_COOLDOWN_SECS;
  piece.userData.nudgePulseEnd = clock.getElapsedTime() + NUDGE_EMISSIVE_PULSE_SECS;

  // Swoosh particles from piece center
  const center = new THREE.Vector3();
  const _tv = new THREE.Vector3();
  piece.children.forEach((block) => {
    block.getWorldPosition(_tv);
    center.add(_tv);
  });
  if (piece.children.length > 0) {
    center.divideScalar(piece.children.length);
    spawnNudgeSwoosh(center, dx, dz, piece.userData.colorIndex);
  }
}

function updateFallingPieces(delta) {
  const landedPieces = [];
  fallingPieces.forEach((piece, i) => {
    piece.userData.timeSinceRotation += delta;
    if (
      piece.userData.timeSinceRotation >= piece.userData.rotationInterval
    ) {
      applyRandomRotation(piece);
      piece.userData.timeSinceRotation = 0;
      piece.userData.rotationInterval =
        Math.random() * (MAX_ROTATION_INTERVAL - MIN_ROTATION_INTERVAL) +
        MIN_ROTATION_INTERVAL;
    }
    piece.position.y += piece.userData.velocity.y * delta;
    updatePieceShadow(piece);
    let lowestPoint = Infinity;
    piece.children.forEach((block) => {
      block.getWorldPosition(
        (block.userData.tempVec =
          block.userData.tempVec || new THREE.Vector3())
      );
      lowestPoint = Math.min(lowestPoint, block.userData.tempVec.y);
    });
    let landed = false;
    if (lowestPoint <= BLOCK_SIZE / 2) {
      piece.position.y += BLOCK_SIZE / 2 - lowestPoint;
      landed = true;
    } else {
      piece.children.forEach((block) => {
        if (landed) return;
        block.getWorldPosition(block.userData.tempVec);
        const blockBottomY = block.userData.tempVec.y - BLOCK_SIZE / 2;
        worldGroup.children.forEach((staticObj) => {
          if (landed || staticObj.name === "ground") return;
          const staticBox = (staticObj.userData.boundingBox =
            staticObj.userData.boundingBox ||
            new THREE.Box3().setFromObject(staticObj));
          const fallingBlockWorldBox = (block.userData.worldBox =
            block.userData.worldBox || new THREE.Box3());
          fallingBlockWorldBox.setFromCenterAndSize(
            block.userData.tempVec,
            (block.userData.sizeVec =
              block.userData.sizeVec ||
              new THREE.Vector3(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE))
          );
          if (fallingBlockWorldBox.intersectsBox(staticBox)) {
            if (blockBottomY <= staticBox.max.y + 0.01) {
              piece.position.y +=
                staticBox.max.y +
                BLOCK_SIZE / 2 -
                block.userData.tempVec.y;
              landed = true;
            }
          }
        });
      });
    }
    if (landed) landedPieces.push(i);
  });
  for (let i = landedPieces.length - 1; i >= 0; i--) {
    const index = landedPieces[i];
    const pieceToLand = fallingPieces[index];
    checkAndApplyPlayerPush(pieceToLand);
    playPlaceSound();
    disposePieceTrail(pieceToLand);
    const newBlocks = [];
    while (pieceToLand.children.length > 0) {
      const block = pieceToLand.children[0];
      block.getWorldPosition(block.userData.tempVec);
      block.getWorldQuaternion(
        (block.userData.tempQuat =
          block.userData.tempQuat || new THREE.Quaternion())
      );
      worldGroup.attach(block);
      block.position.copy(block.userData.tempVec);
      block.quaternion.copy(block.userData.tempQuat);
      block.name = "landed_block";
      registerBlock(block);
      newBlocks.push(block);
    }
    removePieceShadow(pieceToLand);
    fallingPiecesGroup.remove(pieceToLand);
    fallingPieces.splice(index, 1);
    checkLineClear(newBlocks);
    checkGameOver();
  }

  // Tick nudge cooldown
  nudgeCooldown = Math.max(0, nudgeCooldown - delta);

  // Update nudge hint visibility
  const nudgeHintEl = document.getElementById("nudge-hint");
  if (nudgeHintEl) {
    const showHint = controls && controls.isLocked && !isGameOver && getNudgeTargetPiece() !== null;
    nudgeHintEl.style.display = showHint ? "block" : "none";
  }
}
