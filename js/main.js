// Entry point — scene setup, game loop, and mouse/resize handlers.
// Must be loaded last (after all other modules).

function init() {
  console.log("Initializing game...");

  // Assign DOM references (DOM is ready since script runs after </body>)
  rendererContainer = document.getElementById("renderer-container");
  blocker = document.getElementById("blocker");
  instructions = document.getElementById("instructions");
  crosshair = document.getElementById("crosshair");

  if (
    typeof THREE === "undefined" ||
    typeof THREE.PointerLockControls === "undefined"
  ) {
    console.error("THREE.js or PointerLockControls not loaded!");
    instructions.innerHTML =
      "<h1>Fehler</h1><p>THREE.js oder PointerLockControls konnten nicht geladen werden. Bitte Seite neu laden.</p>";
    return;
  }

  initAudio();

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 0, WORLD_SIZE * 1.5);
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.y = PLAYER_HEIGHT;
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  rendererContainer.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(50, 100, 75);
  directionalLight.castShadow = true;
  scene.add(directionalLight);

  worldGroup = new THREE.Group();
  scene.add(worldGroup);
  fallingPiecesGroup = new THREE.Group();
  scene.add(fallingPiecesGroup);

  const groundGeometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
  const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x55aa55 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.name = "ground";
  worldGroup.add(ground);

  for (let i = 0; i < 15; i++) {
    const treeHeight = Math.random() * 5 + 3;
    const treeGeo = new THREE.BoxGeometry(BLOCK_SIZE, treeHeight, BLOCK_SIZE);
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x8b4513 });
    const tree = new THREE.Mesh(treeGeo, treeMat);
    tree.position.set(
      (Math.random() - 0.5) * WORLD_SIZE * 0.8,
      treeHeight / 2,
      (Math.random() - 0.5) * WORLD_SIZE * 0.8
    );
    tree.name = "world_object";
    worldGroup.add(tree);
  }

  scoreEl = document.getElementById("score-display");
  lineClearBannerEl = document.getElementById("line-clear-banner");

  raycaster = new THREE.Raycaster();

  pickaxeGroup = createPickaxeModel();
  pickaxeGroup.position.set(0.4, -0.3, -0.7);
  pickaxeGroup.rotation.set(0, Math.PI * 0.9, Math.PI / 8);
  camera.add(pickaxeGroup);

  try {
    controls = new THREE.PointerLockControls(camera, renderer.domElement);
    scene.add(controls.getObject());

    blocker.addEventListener("click", function () {
      console.log("Blocker clicked. Requesting pointer lock...");
      if (Tone.context.state !== "running") {
        Tone.start()
          .then(() => {
            console.log("Audio context started.");
            controls.lock();
          })
          .catch((e) => {
            console.error("Failed to start audio context:", e);
            controls.lock();
          });
      } else {
        controls.lock();
      }
    });

    controls.addEventListener("lock", function () {
      console.log("Pointer lock successful ('lock' event fired).");
      instructions.style.display = "none";
      blocker.style.display = "none";
      crosshair.style.display = "block";
      if (scoreEl) scoreEl.style.display = "block";
      gameTimerRunning = true;
      // Restore inventory HUD if non-empty
      if (inventoryTotal() > 0) updateInventoryHUD();
    });

    controls.addEventListener("unlock", function () {
      console.log("Pointer lock released ('unlock' event fired).");
      gameTimerRunning = false;
      // Don't show start screen if game over — game over overlay handles it
      if (!isGameOver) {
        blocker.style.display = "flex";
        instructions.style.display = "";
      }
      crosshair.style.display = "none";
      if (scoreEl) scoreEl.style.display = "none";
      if (lineClearBannerEl) lineClearBannerEl.style.display = "none";
      document.getElementById("inventory-hud").style.display = "none";
      const dangerEl = document.getElementById("danger-overlay");
      const dangerTextEl = document.getElementById("danger-text");
      if (dangerEl) dangerEl.style.display = "none";
      if (dangerTextEl) dangerTextEl.style.display = "none";
      unhighlightTarget();
      targetedBlock = null;
      miningProgress = 0;
    });
  } catch (error) {
    console.error("Failed to initialize PointerLockControls:", error);
    instructions.innerHTML =
      "<h1>Fehler</h1><p>Steuerung konnte nicht initialisiert werden.</p>";
    return;
  }

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousedown", onMouseDown);
  window.addEventListener("resize", onWindowResize);

  const playAgainBtn = document.getElementById("play-again-btn");
  if (playAgainBtn) playAgainBtn.addEventListener("click", resetGame);

  console.log("Initialization complete. Starting animation loop.");
  animate();
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseDown(event) {
  if (!controls || !controls.isLocked || isGameOver || event.button !== 0)
    return;
  if (targetedBlock) {
    miningProgress++;
    console.log(
      `Mining progress on block: ${miningProgress}/${MINING_CLICKS_NEEDED}`
    );
    isMining = true;
    miningAnimStartTime = clock.getElapsedTime();
    if (audioReady && hitSynth)
      hitSynth.triggerAttackRelease("C2", "8n", Tone.now());
    applyMineDamage(targetedBlock, miningProgress);
    startMiningShake(targetedBlock);
    spawnDustParticles(targetedBlock);
    if (miningProgress >= MINING_CLICKS_NEEDED) {
      console.log("Block broken!");
      if (audioReady && breakSynth)
        breakSynth.triggerAttackRelease("4n", Tone.now());
      blocksMined++;
      addScore(10);

      const blockColor =
        targetedBlock.userData.originalColor ||
        targetedBlock.material.color;
      const cssColor = threeColorToCss(blockColor);
      const collected = addToInventory(cssColor);
      if (!collected) {
        console.log("Inventory full — block discarded.");
      }

      if (miningShakeBlock === targetedBlock) {
        miningShakeActive = false;
        miningShakeBlock = null;
      }
      unregisterBlock(targetedBlock);
      worldGroup.remove(targetedBlock);
      targetedBlock = null;
      miningProgress = 0;
      crosshair.classList.remove("target-locked");
      isMining = false;
      if (pickaxeGroup) pickaxeGroup.rotation.z = Math.PI / 8;
    }
  }
}

function animate() {
  requestAnimationFrame(animate);

  const time = performance.now();
  const delta = clock.getDelta();
  const elapsedTime = clock.getElapsedTime();

  if (!isGameOver) {
    spawnTimer += delta;
    if (spawnTimer > SPAWN_INTERVAL) {
      spawnFallingPiece();
      spawnTimer = 0;
    }
    updateLineClear(delta);
    updateFallingPieces(delta);
  }
  updateDangerWarning();

  if (controls && controls.isLocked === true && !isGameOver) {
    // Tick survival timer and refresh HUD once per second
    if (gameTimerRunning) {
      gameElapsedSeconds += delta;
      const currentSecond = Math.floor(gameElapsedSeconds);
      if (currentSecond !== lastHudSecond) {
        lastHudSecond = currentSecond;
        updateScoreHUD();
      }
    }

    const playerPosition = controls.getObject().position;
    if (!playerOnGround) playerVelocity.y -= GRAVITY * delta;
    const speedDelta = MOVEMENT_SPEED * delta;
    if (moveForward) controls.moveForward(speedDelta);
    if (moveBackward) controls.moveForward(-speedDelta);
    if (moveLeft) controls.moveRight(-speedDelta);
    if (moveRight) controls.moveRight(speedDelta);
    playerPosition.y += playerVelocity.y * delta;
    checkPlayerCollision(playerVelocity.y * delta);
    updateTargeting();

    if (pickaxeGroup) {
      const defaultRotationZ = Math.PI / 8;
      if (isMining) {
        const animElapsedTime = elapsedTime - miningAnimStartTime;
        if (animElapsedTime < PICKAXE_ANIMATION_DURATION) {
          const swingPhase =
            (animElapsedTime / PICKAXE_ANIMATION_DURATION) * Math.PI;
          pickaxeGroup.rotation.z =
            defaultRotationZ -
            Math.sin(swingPhase) * PICKAXE_ANIMATION_ANGLE;
        } else {
          isMining = false;
          pickaxeGroup.rotation.z = defaultRotationZ;
        }
      } else {
        pickaxeGroup.rotation.z = defaultRotationZ;
      }
    }

    // Mining shake update
    if (miningShakeActive && miningShakeBlock) {
      const shakeAge = elapsedTime - miningShakeStart;
      if (shakeAge < MINING_SHAKE_DURATION) {
        if (!miningShakeBlock.userData.basePosition) {
          miningShakeBlock.userData.basePosition =
            miningShakeBlock.position.clone();
        }
        const phase = (shakeAge / MINING_SHAKE_DURATION) * Math.PI;
        const offset = Math.sin(phase) * MINING_SHAKE_AMOUNT;
        miningShakeBlock.position.x =
          miningShakeBlock.userData.basePosition.x + offset;
        miningShakeBlock.position.z =
          miningShakeBlock.userData.basePosition.z + offset * 0.5;
      } else {
        if (miningShakeBlock.userData.basePosition) {
          miningShakeBlock.position.copy(
            miningShakeBlock.userData.basePosition
          );
          miningShakeBlock.userData.basePosition = null;
        }
        miningShakeActive = false;
        miningShakeBlock = null;
      }
    }

    updateDustParticles(delta);
  } else {
    playerVelocity.x = 0;
    playerVelocity.z = 0;
    unhighlightTarget();
    targetedBlock = null;
    miningProgress = 0;
    crosshair.classList.remove("target-locked");
    isMining = false;
    if (pickaxeGroup) pickaxeGroup.rotation.z = Math.PI / 8;
  }

  renderer.render(scene, camera);
  lastTime = time;
}

try {
  init();
} catch (error) {
  console.error("Error during initialization:", error);
  const instructionsEl = document.getElementById("instructions");
  if (instructionsEl) {
    instructionsEl.innerHTML = `<h1>Fehler</h1><p>Ein Fehler ist während der Initialisierung aufgetreten: ${error.message}</p>`;
  }
}
