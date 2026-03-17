// Falling Tetris pieces — creation, spawning, rotation, and landing.
// Requires: state.js, config.js, world.js (createBlockMesh, registerBlock),
//           lineclear.js (checkLineClear), gamestate.js (checkGameOver)

// ── Landing shockwave ring pool ───────────────────────────────────────────────
const _LANDING_RING_POOL_SIZE = 3;
const _landingRingPool   = [];   // { mesh, active }
const _activeLandingRings = [];  // { entry, age }

const _LANDING_RING_DURATION  = 0.35;   // seconds for full animation
const _LANDING_RING_MAX_SCALE = 8;      // max uniform XZ scale
const _LANDING_RING_OPACITY   = 0.35;   // starting opacity (fades to 0)

function initLandingRingPool() {
  const geo = new THREE.RingGeometry(0.1, 0.5, 32);
  for (let i = 0; i < _LANDING_RING_POOL_SIZE; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo.clone(), mat);
    // Lie flat in XZ plane with a 10° forward tilt for first-person visibility
    mesh.rotation.x = Math.PI / 2 - (10 * Math.PI / 180);
    mesh.visible = false;
    scene.add(mesh);
    _landingRingPool.push({ mesh, active: false });
  }
}

function spawnLandingRing(centerPos) {
  let entry = null;
  for (let i = 0; i < _landingRingPool.length; i++) {
    if (!_landingRingPool[i].active) { entry = _landingRingPool[i]; break; }
  }
  if (!entry) return;
  entry.active = true;
  entry.mesh.position.copy(centerPos);
  entry.mesh.scale.set(0.01, 1, 0.01);
  entry.mesh.material.opacity = _LANDING_RING_OPACITY;
  entry.mesh.visible = true;
  _activeLandingRings.push({ entry, age: 0 });
}

function updateLandingRings(delta) {
  for (let i = _activeLandingRings.length - 1; i >= 0; i--) {
    const r = _activeLandingRings[i];
    r.age += delta;
    if (r.age >= _LANDING_RING_DURATION) {
      r.entry.mesh.visible = false;
      r.entry.active = false;
      _activeLandingRings.splice(i, 1);
      continue;
    }
    const t = r.age / _LANDING_RING_DURATION;
    const s = t * _LANDING_RING_MAX_SCALE;
    r.entry.mesh.scale.set(s, 1, s);
    r.entry.mesh.material.opacity = _LANDING_RING_OPACITY * (1 - t);
    r.entry.mesh.material.needsUpdate = true;
  }
}

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

// ── Next-piece queue ──────────────────────────────────────────────────────────

function _rng() {
  return gameRng ? gameRng() : Math.random();
}

function _randomShapeIndex() {
  // Diamond (index 8) only spawns in Classic mode at Level 7+ (lastDifficultyTier >= 6).
  // Never in Sprint or Blitz modes.
  const diamondEligible = !isSprintMode && !isBlitzMode && lastDifficultyTier >= 6;

  // Ice Age: 60% of pieces are Ice-type (index 4).
  if (weeklyIceAge && _rng() < 0.6) return 4;

  // Gold Rush: gold (index 3) gets 3× the weight of other piece types.
  if (weeklyGoldRush) {
    // Pool: each non-gold type gets 1 slot, gold gets 3 slots.
    const pool = [1, 2, 3, 3, 3, 4, 5, 6, 7];
    if (diamondEligible) pool.push(8);
    return pool[Math.floor(_rng() * pool.length)];
  }

  // World modifier block weights.
  const _wmod = typeof getWorldModifier === 'function' ? getWorldModifier() : null;
  if (_wmod && _wmod.blockWeights) {
    const weights = Object.assign({}, _wmod.blockWeights);
    // Exclude diamond unless eligible.
    if (!diamondEligible) delete weights[8];
    return worldModifierWeightedIndex(weights, _rng);
  }

  // Standard pool is indices 1–7; diamond adds index 8.
  const poolSize = diamondEligible ? SHAPES.length - 1 : 7;
  return Math.floor(_rng() * poolSize) + 1;
}

/** Populate pieceQueue with NEXT_QUEUE_SIZE entries from scratch. */
function initPieceQueue() {
  pieceQueue.length = 0;
  for (let i = 0; i < NEXT_QUEUE_SIZE; i++) {
    const idx = _randomShapeIndex();
    pieceQueue.push({ index: idx, shape: SHAPES[idx] });
  }
  updateNextPiecesHUD();
}

/** Render the queue as mini piece grids inside #next-pieces-panel. */
function updateNextPiecesHUD() {
  if (!nextPiecesEl) nextPiecesEl = document.getElementById('next-pieces-panel');
  if (!nextPiecesEl) return;
  // Blind Drop: hide next-piece preview.
  if (weeklyBlindDrop) {
    nextPiecesEl.innerHTML = '<div class="np-label">NEXT</div><div class="np-pieces-row"><div class="np-piece np-blind">?</div></div>';
    return;
  }
  let html = '<div class="np-label">NEXT</div><div class="np-pieces-row">';
  pieceQueue.forEach(({ index, shape }) => {
    let palette;
    if (colorblindMode && COLORBLIND_COLORS[index] !== null) {
      palette = COLORBLIND_COLORS[index];
    } else {
      const THEME_PALETTE = { nether: NETHER_COLORS, ocean: OCEAN_COLORS, candy: CANDY_COLORS };
      const tp = THEME_PALETTE[activeTheme];
      palette = (tp && tp[index] !== null) ? tp[index] : COLORS[index];
    }
    const hex = '#' + palette.toString(16).padStart(6, '0');
    html += '<div class="np-piece">';
    shape.forEach(row => {
      html += '<div class="np-row">';
      row.forEach(v => {
        html += v
          ? `<div class="np-cell" style="background:${hex};box-shadow:0 0 3px ${hex};"></div>`
          : '<div class="np-cell np-empty"></div>';
      });
      html += '</div>';
    });
    html += '</div>';
  });
  html += '</div>';
  nextPiecesEl.innerHTML = html;
}

function spawnFallingPiece() {
  // In Sprint mode, start the timer on the very first piece drop
  if (isSprintMode && !sprintTimerActive && !sprintComplete) {
    sprintTimerActive = true;
  }
  // In Blitz mode, start the countdown on the very first piece drop
  if (isBlitzMode && !blitzTimerActive && !blitzComplete) {
    blitzTimerActive = true;
  }

  // World modifier fall speed multiplier (1.0 for Normal/Ice World/Ocean; 1.35 for Nether).
  const _wmodSpawn = typeof getWorldModifier === 'function' ? getWorldModifier() : null;
  const _fallMult = _wmodSpawn ? _wmodSpawn.fallSpeedMult : 1.0;

  // Co-op mode: use server-authoritative piece from the shared queue.
  if (isCoopMode) {
    if (coopPieceQueue.length === 0) return; // wait for next piece from DO
    const cp = coopPieceQueue.shift();
    // Host replenishes the queue when it drops low
    if (typeof coop !== 'undefined' && coop.isHost && coopPieceQueue.length < 2) {
      coop.send({ type: 'piece_request' });
    }
    const piece3D = createPiece3D(SHAPES[cp.index], cp.index);
    piece3D.position.set(cp.spawnX, WORLD_SIZE * 0.6, cp.spawnZ);
    piece3D.userData.velocity = new THREE.Vector3(0, -(GRAVITY / 4) * difficultyMultiplier * _fallMult, 0);
    piece3D.userData.colorIndex = cp.index;
    piece3D.userData.timeSinceRotation = 0;
    piece3D.userData.rotationInterval = cp.rotationInterval;
    piece3D.userData.nudgeOffsetX = 0;
    piece3D.userData.nudgeOffsetZ = 0;
    piece3D.userData.nudgePulseEnd = -1;
    const r = cp.startRotation;
    if (r.axis === 'x') piece3D.rotateX(r.angle);
    else if (r.axis === 'y') piece3D.rotateY(r.angle);
    else piece3D.rotateZ(r.angle);
    if (timeFreezeActive) {
      piece3D.children.forEach(function (block) {
        if (block.material) {
          block.material.emissive.setRGB(0.55, 0.85, 1.0);
          block.material.needsUpdate = true;
        }
      });
    }
    fallingPiecesGroup.add(piece3D);
    fallingPieces.push(piece3D);
    createPieceShadow(piece3D);
    createPieceTrail(piece3D);
    return;
  }

  // In Puzzle mode, draw from the fixed queue; stop spawning when exhausted.
  if (isPuzzleMode) {
    const next = typeof drawPuzzlePiece === "function" ? drawPuzzlePiece() : null;
    if (!next) {
      // No pieces left — check lose condition after current pieces finish landing
      return;
    }
    const piece3D = createPiece3D(next.shape, next.index);
    const spawnX = (_rng() - 0.5) * (WORLD_SIZE * 0.8);
    const spawnZ = (_rng() - 0.5) * (WORLD_SIZE * 0.8);
    const spawnY = WORLD_SIZE * 0.6;
    piece3D.position.set(spawnX, spawnY, spawnZ);
    piece3D.userData.velocity = new THREE.Vector3(0, -(GRAVITY / 4) * difficultyMultiplier * _fallMult, 0);
    piece3D.userData.colorIndex = next.index;
    piece3D.userData.timeSinceRotation = 0;
    piece3D.userData.rotationInterval =
      _rng() * (MAX_ROTATION_INTERVAL - MIN_ROTATION_INTERVAL) + MIN_ROTATION_INTERVAL;
    piece3D.userData.nudgeOffsetX = 0;
    piece3D.userData.nudgeOffsetZ = 0;
    piece3D.userData.nudgePulseEnd = -1;
    fallingPiecesGroup.add(piece3D);
    fallingPieces.push(piece3D);
    createPieceShadow(piece3D);
    createPieceTrail(piece3D);
    return;
  }

  // In Custom Puzzle mode with a fixed piece sequence, draw from the looping queue.
  if (isCustomPuzzleMode &&
      typeof customPieceSequence !== "undefined" &&
      customPieceSequence.mode === "fixed" &&
      customPieceSequence.pieces && customPieceSequence.pieces.length > 0) {
    const next = typeof drawCustomPuzzlePiece === "function" ? drawCustomPuzzlePiece() : null;
    if (next) {
      const piece3D = createPiece3D(next.shape, next.index);
      const spawnX = (_rng() - 0.5) * (WORLD_SIZE * 0.8);
      const spawnZ = (_rng() - 0.5) * (WORLD_SIZE * 0.8);
      const spawnY = WORLD_SIZE * 0.6;
      piece3D.position.set(spawnX, spawnY, spawnZ);
      piece3D.userData.velocity = new THREE.Vector3(0, -(GRAVITY / 4) * difficultyMultiplier * _fallMult, 0);
      piece3D.userData.colorIndex = next.index;
      piece3D.userData.timeSinceRotation = 0;
      piece3D.userData.rotationInterval =
        _rng() * (MAX_ROTATION_INTERVAL - MIN_ROTATION_INTERVAL) + MIN_ROTATION_INTERVAL;
      piece3D.userData.nudgeOffsetX = 0;
      piece3D.userData.nudgeOffsetZ = 0;
      piece3D.userData.nudgePulseEnd = -1;
      fallingPiecesGroup.add(piece3D);
      fallingPieces.push(piece3D);
      createPieceShadow(piece3D);
      createPieceTrail(piece3D);
      return;
    }
  }

  // Draw the next piece from the pre-generated queue; refill to keep it at NEXT_QUEUE_SIZE.
  if (pieceQueue.length === 0) initPieceQueue();
  const { index, shape } = pieceQueue.shift();
  const newIdx = _randomShapeIndex();
  pieceQueue.push({ index: newIdx, shape: SHAPES[newIdx] });
  updateNextPiecesHUD();
  const piece3D = createPiece3D(shape, index);
  const spawnX = (_rng() - 0.5) * (WORLD_SIZE * 0.8);
  const spawnZ = (_rng() - 0.5) * (WORLD_SIZE * 0.8);
  const spawnY = WORLD_SIZE * 0.6;
  piece3D.position.set(spawnX, spawnY, spawnZ);
  piece3D.userData.velocity = new THREE.Vector3(0, -(GRAVITY / 4) * difficultyMultiplier * _fallMult, 0);
  piece3D.userData.colorIndex = index;
  piece3D.userData.timeSinceRotation = 0;
  piece3D.userData.rotationInterval =
    _rng() * (MAX_ROTATION_INTERVAL - MIN_ROTATION_INTERVAL) +
    MIN_ROTATION_INTERVAL;
  piece3D.userData.nudgeOffsetX = 0;
  piece3D.userData.nudgeOffsetZ = 0;
  piece3D.userData.nudgePulseEnd = -1;
  fallingPiecesGroup.add(piece3D);
  fallingPieces.push(piece3D);
  // Apply freeze glow immediately if Time Freeze is active when this piece spawns
  if (timeFreezeActive) {
    piece3D.children.forEach(function (block) {
      if (block.material) {
        block.material.emissive.setRGB(0.55, 0.85, 1.0);
        block.material.needsUpdate = true;
      }
    });
  }
  createPieceShadow(piece3D);
  createPieceTrail(piece3D);
}

function applyRandomRotation(piece) {
  const axis = Math.floor(_rng() * 3);
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
  // Think Mode (puzzle): zero gravity while F is held.
  if (typeof isThinkModeActive === "function" && isThinkModeActive()) return;

  // Time Freeze: all pieces stop falling (player can mine/reposition freely).
  if (timeFreezeActive) return;

  // Apply fall-speed modifiers: Slow Down power-up (0.5×) or Ice Bridge (0.8×).
  const effectiveDelta = slowDownActive ? delta * 0.5 : iceBridgeSlowActive ? delta * 0.8 : delta;

  const landedPieces = [];
  fallingPieces.forEach((piece, i) => {
    piece.userData.timeSinceRotation += delta;
    if (
      piece.userData.timeSinceRotation >= piece.userData.rotationInterval
    ) {
      applyRandomRotation(piece);
      piece.userData.timeSinceRotation = 0;
      piece.userData.rotationInterval =
        _rng() * (MAX_ROTATION_INTERVAL - MIN_ROTATION_INTERVAL) +
        MIN_ROTATION_INTERVAL;
    }
    piece.position.y += piece.userData.velocity.y * effectiveDelta;
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

    // ── Shockwave ring + chromatic aberration on landing ─────────────────────
    {
      const _rc = new THREE.Vector3();
      const _rv = new THREE.Vector3();
      let _lowestY = Infinity;
      const _blockCount = pieceToLand.children.length;
      pieceToLand.children.forEach((block) => {
        block.getWorldPosition(_rv);
        _rc.add(_rv);
        if (_rv.y < _lowestY) _lowestY = _rv.y;
      });
      if (_blockCount > 0) {
        _rc.divideScalar(_blockCount);
        _rc.y = _lowestY - BLOCK_SIZE / 2;  // bottom face of lowest block
        spawnLandingRing(_rc);
        // Hard landing: 4+ blocks in piece OR speed level > 5
        if (_blockCount >= 4 || lastDifficultyTier > 5) {
          if (typeof triggerChromaticAberration === 'function') {
            triggerChromaticAberration(0.006, 0.2);
          }
        }
      }
    }

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
    if (isPuzzleMode || isCustomPuzzleMode) {
      if (typeof checkPuzzleConditions === "function") checkPuzzleConditions();
      if (!isPuzzleMode) checkGameOver(); // custom puzzle: still check game-over (blocks too high)
    } else {
      checkGameOver();
    }
    if (typeof saveGameState === "function") saveGameState();
    if (isSurvivalMode && typeof saveSurvivalWorld === "function") saveSurvivalWorld();
    if (typeof tutorialNotify === "function") tutorialNotify("pieceLand");
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
