// Entry point — scene setup, game loop, and mouse/resize handlers.
// Must be loaded last (after all other modules).

/**
 * Spawn a tree at (tx, tz). Returns an array of all THREE.Mesh objects added.
 * Meshes are added to worldGroup at scale 1; caller can set scale if needed.
 */
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

  for (const layer of leafLayers) {
    const r = layer.radius;
    for (let lx = -r; lx <= r; lx++) {
      for (let lz = -r; lz <= r; lz++) {
        if (layer.cornerCut && Math.abs(lx) === r && Math.abs(lz) === r) continue;
        const leafGeo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
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
  for (let i = 0; i < size; i++) {
    const geo = new THREE.BoxGeometry(1.2, 1, 1.2);
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
      "<h1>Error</h1><p>THREE.js or PointerLockControls could not be loaded. Please reload the page.</p>";
    return;
  }

  initAudio();
  initSettings();
  if (typeof initLeaderboard === "function") initLeaderboard();

  scene = new THREE.Scene();
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
  renderer.shadowMap.enabled = true;

  initSky();

  worldGroup = new THREE.Group();
  scene.add(worldGroup);
  fallingPiecesGroup = new THREE.Group();
  scene.add(fallingPiecesGroup);
  shadowsGroup = new THREE.Group();
  scene.add(shadowsGroup);

  const groundGeometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
  const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x55aa55 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.name = "ground";
  worldGroup.add(ground);

  const spawnedPositions = [];
  for (let i = 0; i < 15; i++) {
    const tx = (Math.random() - 0.5) * WORLD_SIZE * 0.8;
    const tz = (Math.random() - 0.5) * WORLD_SIZE * 0.8;
    spawnTree(tx, tz);
    spawnedPositions.push({ x: tx, z: tz });
  }

  // Rocks: 8–12, scattered, no overlap with trees or other rocks (≥ 3 blocks apart)
  const numRocks = Math.floor(Math.random() * 5) + 8;
  for (let i = 0; i < numRocks; i++) {
    let rx, rz, valid;
    let attempts = 0;
    do {
      rx = (Math.random() - 0.5) * WORLD_SIZE * 0.8;
      rz = (Math.random() - 0.5) * WORLD_SIZE * 0.8;
      valid = true;
      for (const pos of spawnedPositions) {
        const dx = rx - pos.x;
        const dz = rz - pos.z;
        if (Math.sqrt(dx * dx + dz * dz) < 3) {
          valid = false;
          break;
        }
      }
      attempts++;
    } while (!valid && attempts < 50);

    if (valid) {
      const r = Math.random();
      const size = r < 0.4 ? 1 : r < 0.8 ? 2 : 3;
      spawnRock(rx, rz, size);
      spawnedPositions.push({ x: rx, z: rz });
    }
  }

  scoreEl = document.getElementById("score-display");
  nextPiecesEl = document.getElementById("next-pieces-panel");
  lineClearBannerEl = document.getElementById("line-clear-banner");
  comboBannerEl = document.getElementById("combo-banner");
  speedUpBannerEl = document.getElementById("speed-up-banner");

  // Pre-generate the next-piece queue before the first spawn.
  initPieceQueue();

  raycaster = new THREE.Raycaster();

  pickaxeGroup = createPickaxeModel();
  pickaxeGroup.position.set(0.4, -0.3, -0.7);
  pickaxeGroup.rotation.set(0, Math.PI * 0.9, Math.PI / 8);
  camera.add(pickaxeGroup);

  try {
    controls = new THREE.PointerLockControls(camera, renderer.domElement);
    scene.add(controls.getObject());

    blocker.addEventListener("click", function (e) {
      // Daily challenge, settings, stats, achievements, and resume buttons handle their own events — skip here
      if (e.target.id === "daily-challenge-btn") return;
      if (e.target.id === "start-settings-btn") return;
      if (e.target.id === "start-stats-btn") return;
      if (e.target.id === "start-achievements-btn") return;
      if (e.target.id === "start-resume-btn") return;
      // Show mode select screen instead of jumping straight into the game
      showModeSelect();
    });

    const dailyChallengeBtn = document.getElementById("daily-challenge-btn");
    if (dailyChallengeBtn) {
      dailyChallengeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        // Show mode select with Daily highlighted as a shortcut
        showModeSelect("daily");
      });
    }

    // ── Mode select helpers ───────────────────────────────────────────
    function showModeSelect(highlightMode) {
      const modeSelectEl = document.getElementById("mode-select");
      if (!modeSelectEl) return;
      // Populate Classic personal best
      const pbEl = document.getElementById("mode-pb-classic");
      if (pbEl) {
        const scores = loadHighScores();
        if (scores.length > 0) {
          const best = scores[0];
          pbEl.textContent = "Best: " + best.score + " (" + fmtTime(best.timeSurvived) + ")";
        } else {
          pbEl.textContent = "";
        }
      }
      // Populate Sprint personal best
      const sprintPbEl = document.getElementById("mode-pb-sprint");
      if (sprintPbEl) {
        const sprintBest = loadSprintBest();
        sprintPbEl.textContent = sprintBest
          ? "Best: " + fmtSprintTime(sprintBest.timeMs)
          : "";
      }
      // Populate Blitz personal best
      const blitzPbEl = document.getElementById("mode-pb-blitz");
      if (blitzPbEl) {
        const blitzBest = loadBlitzBest();
        blitzPbEl.textContent = blitzBest ? "Best: " + blitzBest.score : "";
      }
      // Populate Daily Challenge personal best
      const dailyPbEl = document.getElementById("mode-pb-daily");
      if (dailyPbEl) {
        const dailyBest = loadDailyBest();
        if (dailyBest) {
          dailyPbEl.textContent = getTodayLabel() + " Best: " + dailyBest.score;
        } else {
          dailyPbEl.textContent = getTodayLabel();
        }
      }
      // Apply highlight to the specified mode card
      ["classic", "sprint", "blitz", "daily"].forEach(function (mode) {
        const cardEl = document.getElementById("mode-card-" + mode);
        if (cardEl) {
          if (mode === highlightMode) {
            cardEl.classList.add("mode-card-highlighted");
          } else {
            cardEl.classList.remove("mode-card-highlighted");
          }
        }
      });
      blocker.style.display = "none";
      modeSelectEl.style.display = "flex";
    }

    function hideModeSelect() {
      const modeSelectEl = document.getElementById("mode-select");
      if (modeSelectEl) modeSelectEl.style.display = "none";
    }

    function requestPointerLock() {
      if (Tone.context.state !== "running") {
        Tone.start().then(() => controls.lock()).catch(() => controls.lock());
      } else {
        controls.lock();
      }
    }

    const classicCardEl = document.getElementById("mode-card-classic");
    if (classicCardEl) {
      classicCardEl.addEventListener("click", function () {
        isDailyChallenge = false;
        gameRng = null;
        try { localStorage.setItem("mineCtris_lastMode", "classic"); } catch (_) {}
        hideModeSelect();
        requestPointerLock();
      });
    }

    const sprintCardEl = document.getElementById("mode-card-sprint");
    if (sprintCardEl) {
      sprintCardEl.addEventListener("click", function () {
        isDailyChallenge = false;
        gameRng = null;
        isSprintMode = true;
        // Fixed speed from the start; difficulty escalation is disabled in sprint
        difficultyMultiplier = SPRINT_FIXED_MULTIPLIER;
        lastDifficultyTier   = 4; // Level 5 display
        try { localStorage.setItem("mineCtris_lastMode", "sprint"); } catch (_) {}
        hideModeSelect();
        requestPointerLock();
      });
    }

    const blitzCardEl = document.getElementById("mode-card-blitz");
    if (blitzCardEl) {
      blitzCardEl.addEventListener("click", function () {
        isDailyChallenge = false;
        gameRng = null;
        isBlitzMode = true;
        difficultyMultiplier = BLITZ_FIXED_MULTIPLIER;
        lastDifficultyTier   = 4; // Level 5 display
        blitzRemainingMs     = BLITZ_DURATION_MS;
        try { localStorage.setItem("mineCtris_lastMode", "blitz"); } catch (_) {}
        hideModeSelect();
        requestPointerLock();
      });
    }

    // Wire up Blitz play-again button
    const blitzPlayAgainBtn = document.getElementById("blitz-play-again-btn");
    if (blitzPlayAgainBtn) {
      blitzPlayAgainBtn.addEventListener("click", function () {
        resetGame();
      });
    }

    // Wire up Blitz main menu button
    const blitzMainMenuBtn = document.getElementById("blitz-main-menu-btn");
    if (blitzMainMenuBtn) {
      blitzMainMenuBtn.addEventListener("click", function () {
        resetGame();
      });
    }

    const dailyCardEl = document.getElementById("mode-card-daily");
    if (dailyCardEl) {
      dailyCardEl.addEventListener("click", function () {
        isDailyChallenge = true;
        gameRng = getDailyPrng();
        // Re-seed the piece queue with today's PRNG
        initPieceQueue();
        // Show daily badge in HUD
        const badgeEl = document.getElementById("daily-challenge-badge");
        if (badgeEl) {
          badgeEl.textContent = "Daily: " + getTodayLabel();
          badgeEl.style.display = "block";
        }
        try { localStorage.setItem("mineCtris_lastMode", "daily"); } catch (_) {}
        hideModeSelect();
        requestPointerLock();
      });
    }

    const modeBackBtn = document.getElementById("mode-select-back");
    if (modeBackBtn) {
      modeBackBtn.addEventListener("click", function () {
        hideModeSelect();
        blocker.style.display = "flex";
        instructions.style.display = "";
      });
    }
    // ─────────────────────────────────────────────────────────────────

    controls.addEventListener("lock", function () {
      console.log("Pointer lock successful ('lock' event fired).");
      if (isPaused) {
        // Resuming from pause — hide pause screen, restore paused state
        isPaused = false;
        const pauseScreenEl = document.getElementById("pause-screen");
        if (pauseScreenEl) pauseScreenEl.style.display = "none";
      } else {
        // Starting from start screen
        instructions.style.display = "none";
        blocker.style.display = "none";
        if (typeof startBgMusic === "function") startBgMusic();
        // First-run tutorial
        if (typeof initTutorial === "function") {
          initTutorial();
          // One-shot mousemove listener to detect first camera movement
          const _onFirstMove = function () {
            if (typeof tutorialNotify === "function") tutorialNotify("cameraMove");
            document.removeEventListener("mousemove", _onFirstMove);
          };
          document.addEventListener("mousemove", _onFirstMove);
          // Wire skip / dismiss buttons
          const skipBtn = document.getElementById("tutorial-skip-btn");
          if (skipBtn && !skipBtn._tutorialBound) {
            skipBtn._tutorialBound = true;
            skipBtn.addEventListener("click", function () {
              if (typeof skipTutorial === "function") skipTutorial();
            });
          }
          const dismissBtn = document.getElementById("tutorial-dismiss-btn");
          if (dismissBtn && !dismissBtn._tutorialBound) {
            dismissBtn._tutorialBound = true;
            dismissBtn.addEventListener("click", function () {
              if (typeof skipTutorial === "function") skipTutorial();
            });
          }
        }
      }
      crosshair.style.display = "block";
      if (scoreEl) scoreEl.style.display = "block";
      if (nextPiecesEl) nextPiecesEl.style.display = "block";
      gameTimerRunning = true;
      // Restore inventory HUD if non-empty
      if (inventoryTotal() > 0) updateInventoryHUD();
    });

    controls.addEventListener("unlock", function () {
      console.log("Pointer lock released ('unlock' event fired).");
      gameTimerRunning = false;
      // If the crafting panel intentionally released the lock, don't show the pause/blocker screen
      if (!craftingPanelOpen) {
        closeCraftingPanel();
        // Don't show start screen if game over — game over overlay handles it
        if (!isGameOver) {
          // Show pause screen (Escape during active gameplay)
          isPaused = true;
          const pauseScreenEl = document.getElementById("pause-screen");
          if (pauseScreenEl) pauseScreenEl.style.display = "flex";
        }
      }
      crosshair.style.display = "none";
      if (scoreEl) scoreEl.style.display = "none";
      if (nextPiecesEl) nextPiecesEl.style.display = "none";
      const nudgeHintEl = document.getElementById("nudge-hint");
      if (nudgeHintEl) nudgeHintEl.style.display = "none";
      if (lineClearBannerEl) lineClearBannerEl.style.display = "none";
      if (comboBannerEl) comboBannerEl.style.display = "none";
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
      "<h1>Error</h1><p>Controls could not be initialized.</p>";
    return;
  }

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousedown", onMouseDown);
  window.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("resize", onWindowResize);
  applyResponsiveHUD(window.innerWidth); // apply on initial load
  renderer.domElement.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });

  const playAgainBtn = document.getElementById("play-again-btn");
  if (playAgainBtn) playAgainBtn.addEventListener("click", resetGame);

  const goMainMenuBtn = document.getElementById("go-main-menu-btn");
  if (goMainMenuBtn) goMainMenuBtn.addEventListener("click", resetGame);

  const sprintPlayAgainBtn = document.getElementById("sprint-play-again-btn");
  if (sprintPlayAgainBtn) sprintPlayAgainBtn.addEventListener("click", resetGame);

  const sprintMainMenuBtn = document.getElementById("sprint-main-menu-btn");
  if (sprintMainMenuBtn) sprintMainMenuBtn.addEventListener("click", resetGame);

  const pauseResumeBtn = document.getElementById("pause-resume-btn");
  if (pauseResumeBtn) pauseResumeBtn.addEventListener("click", function () {
    if (Tone.context.state !== "running") {
      Tone.start().then(() => controls.lock()).catch(() => controls.lock());
    } else {
      controls.lock();
    }
  });

  const pauseRestartBtn = document.getElementById("pause-restart-btn");
  if (pauseRestartBtn) pauseRestartBtn.addEventListener("click", function () {
    const pauseScreenEl = document.getElementById("pause-screen");
    if (pauseScreenEl) pauseScreenEl.style.display = "none";
    isPaused = false;
    resetGame();
  });

  const pauseSettingsBtn = document.getElementById("pause-settings-btn");
  if (pauseSettingsBtn) pauseSettingsBtn.addEventListener("click", function () {
    openSettings();
  });

  const pauseMainMenuBtn = document.getElementById("pause-main-menu-btn");
  if (pauseMainMenuBtn) pauseMainMenuBtn.addEventListener("click", function () {
    const pauseScreenEl = document.getElementById("pause-screen");
    if (pauseScreenEl) pauseScreenEl.style.display = "none";
    isPaused = false;
    resetGame();
  });

  const startResumeBtn = document.getElementById("start-resume-btn");
  if (startResumeBtn) {
    // Show button only if a save exists
    startResumeBtn.style.display = (typeof hasSaveState === "function" && hasSaveState()) ? "block" : "none";
    startResumeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (typeof hasSaveState !== "function" || !hasSaveState()) return;
      if (typeof restoreGameState === "function") restoreGameState();
      if (Tone.context.state !== "running") {
        Tone.start().then(() => controls.lock()).catch(() => controls.lock());
      } else {
        controls.lock();
      }
    });
  }

  const startSettingsBtn = document.getElementById("start-settings-btn");
  if (startSettingsBtn) startSettingsBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    openSettings();
  });

  const startStatsBtn = document.getElementById("start-stats-btn");
  if (startStatsBtn) startStatsBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    openStatsPanel();
  });

  const goStatsBtn = document.getElementById("go-stats-btn");
  if (goStatsBtn) goStatsBtn.addEventListener("click", function () {
    openStatsPanel();
  });

  const statsCloseBtn = document.getElementById("stats-close-btn");
  if (statsCloseBtn) statsCloseBtn.addEventListener("click", function () {
    closeStatsPanel();
  });

  // Also need to block blocker click propagation for achievements button
  const startAchBtn = document.getElementById("start-achievements-btn");
  if (startAchBtn) startAchBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (typeof openAchievementsPanel === "function") openAchievementsPanel();
  });

  const achCloseBtn = document.getElementById("achievements-close-btn");
  if (achCloseBtn) achCloseBtn.addEventListener("click", function () {
    if (typeof closeAchievementsPanel === "function") closeAchievementsPanel();
  });

  initLineClearFragmentPool();
  initTrails();
  initAuras();
  initLandingRingPool();
  initPostProcessing();

  // Lava point-light pool — positioned toward closest lava blocks each frame
  for (let i = 0; i < LAVA_LIGHT_COUNT; i++) {
    const pl = new THREE.PointLight(0xff4400, 0, 8);
    scene.add(pl);
    lavaLights.push(pl);
  }

  renderHighScoresStart();

  console.log("Initialization complete. Starting animation loop.");
  animate();
}

function initPostProcessing() {
  if (
    typeof THREE.EffectComposer === 'undefined' ||
    typeof THREE.SSAOPass === 'undefined'
  ) {
    console.warn("Post-processing scripts not loaded — skipping SSAO.");
    return;
  }

  composer = new THREE.EffectComposer(renderer);

  const renderPass = new THREE.RenderPass(scene, camera);
  composer.addPass(renderPass);

  const ssaoPass = new THREE.SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
  ssaoPass.kernelRadius = 6;
  ssaoPass.minDistance  = 0.004;
  ssaoPass.maxDistance  = 0.08;
  composer.addPass(ssaoPass);

  // Bloom + color grade + vignette
  initBloomPasses(composer);
}

let _resizeTimer = null;
function onWindowResize() {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (composer) composer.setSize(w, h);
    resizePostProcessing(w, h);
    applyResponsiveHUD(w);
  }, 100);
}

function applyResponsiveHUD(width) {
  const root = document.documentElement;
  // Remove previous responsive classes
  document.body.classList.remove("vp-small", "vp-xs");
  if (width < 480) {
    document.body.classList.add("vp-small", "vp-xs");
  } else if (width < 600) {
    document.body.classList.add("vp-small");
  }
  // Scale HUD font sizes proportionally below 600px
  if (width < 600) {
    const scale = Math.max(0.55, width / 600);
    root.style.setProperty("--hud-scale", scale.toFixed(3));
  } else {
    root.style.setProperty("--hud-scale", "1");
  }
}

function onWheel(event) {
  if (!controls || !controls.isLocked || isGameOver) return;
  cycleSelectedBlock(event.deltaY > 0 ? 1 : -1);
}

function placeBlock() {
  const selectedColor = getSelectedColor();
  if (!selectedColor) return;

  let placeX, placeY, placeZ;
  if (targetedBlock && targetedFaceNormal) {
    // Place adjacent to the targeted block face
    const blockPos = new THREE.Vector3();
    targetedBlock.getWorldPosition(blockPos);
    placeX = snapGrid(blockPos.x + targetedFaceNormal.x * BLOCK_SIZE);
    placeY = snapGridY(blockPos.y + targetedFaceNormal.y * BLOCK_SIZE);
    placeZ = snapGrid(blockPos.z + targetedFaceNormal.z * BLOCK_SIZE);
  } else if (groundPlacementPoint) {
    // Place directly on the ground at the aimed point
    placeX = snapGrid(groundPlacementPoint.x);
    placeY = 0.5;
    placeZ = snapGrid(groundPlacementPoint.z);
  } else {
    return;
  }

  // Cannot place underground
  if (placeY < 0.5) return;

  // Cannot place on occupied cell
  const layer = gridOccupancy.get(placeY);
  if (layer && layer.has(placeX + "," + placeZ)) return;

  // Cannot place inside the player
  if (controls) {
    const pp = controls.getObject().position;
    const dx = Math.abs(placeX - pp.x);
    const dz = Math.abs(placeZ - pp.z);
    const dy = Math.abs(placeY - pp.y);
    if (
      dx < PLAYER_RADIUS + 0.5 &&
      dz < PLAYER_RADIUS + 0.5 &&
      dy < PLAYER_HEIGHT / 2 + 0.5
    )
      return;
  }

  // Consume one block from inventory
  inventory[selectedColor]--;
  if (inventory[selectedColor] <= 0) {
    delete inventory[selectedColor];
    selectedBlockColor = null; // getSelectedColor() will auto-pick next
  }

  // Create and register the placed block
  const threeColor = new THREE.Color(selectedColor);
  const block = createBlockMesh(threeColor);
  block.name = "landed_block";
  block.position.set(placeX, placeY, placeZ);
  worldGroup.add(block);
  registerBlock(block);
  blocksPlaced++;
  if (typeof achOnBlockPlaced === "function") achOnBlockPlaced(blocksPlaced);

  // Update HUD and check line-clear
  updateInventoryHUD();
  checkLineClear([block]);

  // Placement sound
  playPlaceSound();
  if (typeof tutorialNotify === "function") tutorialNotify("blockPlace");
}

function onMouseDown(event) {
  if (!controls || !controls.isLocked || isGameOver) return;
  if (event.button === 2) {
    placeBlock();
    return;
  }
  if (event.button !== 0) return;
  if (targetedBlock) {
    miningProgress++;
    console.log(
      `Mining progress on block: ${miningProgress}/${MINING_CLICKS_NEEDED}`
    );
    let clicksNeeded = targetedBlock.userData.miningClicks || MINING_CLICKS_NEEDED;
    if (pickaxeTier === "stone") clicksNeeded = Math.min(clicksNeeded, 2);
    else if (pickaxeTier === "iron") clicksNeeded = 1;
    isMining = true;
    miningAnimStartTime = clock.getElapsedTime();
    updateMaterialTooltip();
    applyMineDamage(targetedBlock, miningProgress, clicksNeeded);
    startMiningShake(targetedBlock);
    const objType = targetedBlock.userData.objectType;
    const isBreak = miningProgress >= clicksNeeded;

    // Per-material hit sound (played even on the breaking hit)
    playHitSound(objType);

    if (!isBreak) {
      // Normal hit particles
      spawnDustParticles(targetedBlock);
      // Trunk: tilt toward player on hit 3 of 4
      if (objType === "trunk" && miningProgress === 3) {
        const camPos = new THREE.Vector3();
        camera.getWorldPosition(camPos);
        const blkPos = new THREE.Vector3();
        targetedBlock.getWorldPosition(blkPos);
        const blockToPlayer = new THREE.Vector3(
          camPos.x - blkPos.x, 0, camPos.z - blkPos.z
        ).normalize();
        const tiltAxis = new THREE.Vector3()
          .crossVectors(new THREE.Vector3(0, 1, 0), blockToPlayer)
          .normalize();
        const tiltAngle = (5 + Math.random() * 3) * Math.PI / 180;
        targetedBlock.rotateOnWorldAxis(tiltAxis, tiltAngle);
        targetedBlock.userData.isTilted = true;
      }
      // Rock: show fracture emissive on hit 3 of 5
      if (objType === "rock" && miningProgress === 3 && targetedBlock.material) {
        targetedBlock.material.emissive = new THREE.Color(0x220000);
        targetedBlock.material.needsUpdate = true;
        targetedBlock.userData.fractured = true;
      }
    }

    if (isBreak) {
      console.log("Block broken!");
      if (typeof tutorialNotify === "function") tutorialNotify("blockMine");
      // Per-material break sound
      playBreakSound(objType);
      // Break burst particles
      spawnDustParticles(targetedBlock, { breakBurst: true });
      blocksMined++;
      const _objType = targetedBlock.userData.objectType;
      const _matName = targetedBlock.userData.materialType ||
        (_objType ? OBJECT_TYPE_TO_MATERIAL[_objType] : null);
      addScore(_matName && BLOCK_TYPES[_matName] ? BLOCK_TYPES[_matName].points : 10);
      if (typeof achOnBlockMined === "function") achOnBlockMined(blocksMined, _objType);

      const blockColor =
        targetedBlock.userData.originalColor ||
        targetedBlock.material.color;
      const cssColor = threeColorToCss(blockColor);
      const crumbles = targetedBlock.name === "leaf_block" && Math.random() < 0.2;
      if (!crumbles) {
        const collected = addToInventory(cssColor);
        if (!collected) {
          console.log("Inventory full — block discarded.");
        }
      }

      if (miningShakeBlock === targetedBlock) {
        miningShakeActive = false;
        miningShakeBlock = null;
      }

      // Queue tree respawn when a trunk is felled
      if (targetedBlock.name === "trunk_block" && treeRespawnQueue.length < 15) {
        treeRespawnQueue.push({
          x: targetedBlock.position.x,
          z: targetedBlock.position.z,
          timer: 90,
          growing: false,
          growStart: 0,
          meshes: null,
        });
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

  updateSky(elapsedTime, delta);

  if (!isGameOver && !isPaused) {
    // Tick the sprint timer (starts only once the first piece begins falling)
    if (isSprintMode && sprintTimerActive && !sprintComplete) {
      sprintElapsedMs += delta * 1000;
    }

    // Tick the blitz countdown timer
    if (isBlitzMode && blitzTimerActive && !blitzComplete) {
      blitzRemainingMs -= delta * 1000;
      if (blitzRemainingMs <= 0) {
        blitzRemainingMs = 0;
        if (typeof triggerBlitzComplete === "function") triggerBlitzComplete();
      } else if (!blitzBonusActive && blitzRemainingMs <= BLITZ_BONUS_THRESHOLD_MS) {
        // Activate Blitz bonus for final 30 seconds
        blitzBonusActive = true;
        // Show visual cue via speed-up banner
        if (speedUpBannerEl) {
          speedUpBannerEl.textContent = "⚡ BLITZ BONUS! 1.5×";
          speedUpBannerEl.style.color = "#ffd700";
          speedUpBannerEl.style.display = "block";
          speedUpBannerTimer = 2.5;
        }
        updateScoreHUD();
      }
    }

    spawnTimer += delta;
    if (spawnTimer > SPAWN_INTERVAL) {
      spawnFallingPiece();
      spawnTimer = 0;
    }
    updateLineClear(delta);
    updateFallingPieces(delta);
    updateLandingRings(delta);
    updateTrails(delta, elapsedTime);
    updateAuras(delta, camera);
    updateDifficulty(delta);
    updateTreeRespawn(delta, elapsedTime);
    if (typeof updateTutorial === "function") updateTutorial(delta);
  }
  updateDangerWarning();

  if (controls && controls.isLocked === true && !isGameOver) {
    // Tick survival timer and refresh HUD once per second
    if (gameTimerRunning) {
      gameElapsedSeconds += delta;
      const currentSecond = isBlitzMode
        ? Math.ceil(blitzRemainingMs / 1000)
        : isSprintMode
          ? Math.floor(sprintElapsedMs / 1000)
          : Math.floor(gameElapsedSeconds);
      if (currentSecond !== lastHudSecond) {
        lastHudSecond = currentSecond;
        updateScoreHUD();
        if (typeof achOnSurvivalTime === "function") achOnSurvivalTime(gameElapsedSeconds);
      }
    }

    const playerPosition = controls.getObject().position;
    if (!playerOnGround) playerVelocity.y -= GRAVITY * delta;
    const speedDelta = MOVEMENT_SPEED * (playerStandingOnIce ? 1.2 : 1.0) * delta;
    if (moveForward) controls.moveForward(speedDelta);
    if (moveBackward) controls.moveForward(-speedDelta);
    if (moveLeft) controls.moveRight(-speedDelta);
    if (moveRight) controls.moveRight(speedDelta);
    playerPosition.y += playerVelocity.y * delta;

    // Apply lateral push impulse from nearby landing pieces
    if (playerPushVelocity.lengthSq() > 0.01) {
      playerPosition.x += playerPushVelocity.x * delta;
      playerPosition.z += playerPushVelocity.z * delta;
      playerPushVelocity.multiplyScalar(Math.pow(PUSH_DECAY, delta));
      if (playerPushVelocity.lengthSq() < 0.01) playerPushVelocity.set(0, 0, 0);
    }

    // Screen shake when pushed
    if (screenShakeActive) {
      const shakeAge = elapsedTime - screenShakeStart;
      if (shakeAge < SCREEN_SHAKE_DURATION) {
        const intensity = (1 - shakeAge / SCREEN_SHAKE_DURATION) * 0.12;
        camera.position.x += (Math.random() - 0.5) * intensity;
        camera.position.y += (Math.random() - 0.5) * intensity;
      } else {
        screenShakeActive = false;
      }
    }

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
    updateCraftingBanner(delta);
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

  // Animate lava/ice: update shared time uniforms
  lavaUniforms.uTime.value = elapsedTime;
  iceUniforms.uTime.value  = elapsedTime;
  {
    const camPos = camera.position;
    const lavaBlocks = [];
    worldGroup.children.forEach(child => {
      if (child.userData && child.userData.materialType === 'lava') {
        lavaBlocks.push(child);
      }
    });
    lavaBlocks.sort((a, b) =>
      a.position.distanceToSquared(camPos) - b.position.distanceToSquared(camPos)
    );
    const pulse = 1.2 * (0.85 + 0.30 * Math.sin(elapsedTime * 4.4));
    for (let i = 0; i < LAVA_LIGHT_COUNT; i++) {
      if (i < lavaBlocks.length) {
        const p = lavaBlocks[i].position;
        lavaLights[i].position.set(p.x, p.y + 1, p.z);
        lavaLights[i].intensity = pulse;
      } else {
        lavaLights[i].intensity = 0;
      }
    }
  }

  updatePostProcessing(delta);

  if (composer) {
    composer.render(delta);
  } else {
    renderer.render(scene, camera);
  }
  lastTime = time;
}

try {
  init();
} catch (error) {
  console.error("Error during initialization:", error);
  const instructionsEl = document.getElementById("instructions");
  if (instructionsEl) {
    instructionsEl.innerHTML = `<h1>Error</h1><p>An error occurred during initialization: ${error.message}</p>`;
  }
}
