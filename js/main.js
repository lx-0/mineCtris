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
  if (typeof initSeasonBanner === "function") initSeasonBanner();
  if (typeof updateLevelBadgeHUD === "function") updateLevelBadgeHUD();
  if (typeof updateStreakHUD === "function") updateStreakHUD();

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

  // Restore last equipped power-up selection from localStorage
  try {
    const _savedEquip = localStorage.getItem("mineCtris_equippedPowerUp");
    if (_savedEquip) {
      const _bank = loadPowerUpBank();
      equippedPowerUpType = (_bank[_savedEquip] || 0) > 0 ? _savedEquip : null;
    }
  } catch (_) {}

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
      if (e.target.id === "start-missions-btn") return;
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
      // Populate Weekly Challenge — show modifier name and personal best
      const weeklyMod = getCurrentWeeklyModifier();
      const weeklyDescEl = document.getElementById("mode-weekly-modifier-desc");
      if (weeklyDescEl && weeklyMod) weeklyDescEl.textContent = weeklyMod.name + ": " + weeklyMod.description;
      const weeklyPbEl = document.getElementById("mode-pb-weekly");
      if (weeklyPbEl) {
        const weeklyBest = loadWeeklyBest();
        if (weeklyBest) {
          weeklyPbEl.textContent = getCurrentWeekLabel() + " Best: " + weeklyBest.score;
        } else {
          weeklyPbEl.textContent = getCurrentWeekLabel();
        }
      }
      // Populate Puzzle personal best
      const puzzlePbEl = document.getElementById("mode-pb-puzzle");
      if (puzzlePbEl && typeof countCompletedPuzzles === "function") {
        const completed = countCompletedPuzzles();
        const threeStars = typeof countThreeStarPuzzles === "function" ? countThreeStarPuzzles() : 0;
        if (completed > 0) {
          puzzlePbEl.textContent = completed + "/" + (typeof PUZZLES !== "undefined" ? PUZZLES.length : 10) + " solved" +
            (threeStars > 0 ? " | " + threeStars + " \u2605\u2605\u2605" : "");
        } else {
          puzzlePbEl.textContent = "";
        }
      }
      // Populate Survival personal best
      const survivalPbEl = document.getElementById("mode-pb-survival");
      if (survivalPbEl && typeof loadSurvivalStats === "function") {
        const survStats = loadSurvivalStats();
        if (survStats.totalRuns > 0) {
          const aliveMin = Math.floor(survStats.bestTimeAlive / 60).toString().padStart(2, "0");
          const aliveSec = (Math.floor(survStats.bestTimeAlive) % 60).toString().padStart(2, "0");
          survivalPbEl.textContent = "Best: " + survStats.bestScore + " (" + aliveMin + ":" + aliveSec + ")";
          if (typeof hasSurvivalWorld === "function" && hasSurvivalWorld()) {
            survivalPbEl.textContent += " \u2022 World saved";
          }
        } else {
          survivalPbEl.textContent = typeof hasSurvivalWorld === "function" && hasSurvivalWorld()
            ? "World in progress"
            : "";
        }
      }
      // Render World Card stats panel
      if (typeof renderWorldCard === "function") renderWorldCard();
      // Apply highlight to the specified mode card
      ["classic", "sprint", "blitz", "daily", "weekly", "puzzle", "survival"].forEach(function (mode) {
        const cardEl = document.getElementById("mode-card-" + mode);
        if (cardEl) {
          if (mode === highlightMode) {
            cardEl.classList.add("mode-card-highlighted");
          } else {
            cardEl.classList.remove("mode-card-highlighted");
          }
        }
      });
      // Populate power-up equip slot from the persistent bank
      const pickerEl = document.getElementById("mode-powerup-picker");
      if (pickerEl) {
        pickerEl.innerHTML = "";
        const puDefs = [
          { type: "row_bomb",  icon: "\uD83D\uDCA3", name: "Row Bomb"  },
          { type: "slow_down", icon: "\u23F1",        name: "Slow Down" },
          { type: "shield",    icon: "\uD83D\uDEE1",  name: "Shield"    },
          { type: "magnet",    icon: "\uD83E\uDDF2",  name: "Magnet"    },
        ];
        const bank = loadPowerUpBank();
        const owned = puDefs.filter(function (d) { return (bank[d.type] || 0) > 0; });
        if (owned.length === 0) {
          pickerEl.innerHTML = '<div class="powerup-pick-none">No power-ups owned.<br>Craft some in Classic mode!</div>';
          // Unequip if previously equipped something no longer available
          equippedPowerUpType = null;
        } else {
          // Ensure the currently equipped type is still owned, otherwise clear
          if (equippedPowerUpType && (bank[equippedPowerUpType] || 0) === 0) {
            equippedPowerUpType = null;
          }
          owned.forEach(function (def) {
            const btn = document.createElement("button");
            btn.className = "powerup-pick-btn" + (equippedPowerUpType === def.type ? " pu-equipped" : "");
            btn.dataset.type = def.type;
            btn.innerHTML =
              '<div class="ppu-icon">' + def.icon + '</div>' +
              '<div class="ppu-name">' + def.name + '</div>' +
              '<div class="ppu-qty">\xD7' + (bank[def.type] || 0) + '</div>';
            btn.addEventListener("click", function (e) {
              e.stopPropagation();
              equippedPowerUpType = (equippedPowerUpType === def.type) ? null : def.type;
              try { localStorage.setItem("mineCtris_equippedPowerUp", equippedPowerUpType || ""); } catch (_) {}
              // Re-render picker to reflect new selection
              pickerEl.querySelectorAll(".powerup-pick-btn").forEach(function (b) {
                b.classList.toggle("pu-equipped", b.dataset.type === equippedPowerUpType);
                b.querySelector(".ppu-name").style.cssText =
                  b.dataset.type === equippedPowerUpType
                    ? "color:#ffd700;text-shadow:0 0 6px #ffd700"
                    : "";
              });
            });
            pickerEl.appendChild(btn);
          });
        }
      }

      // Populate world modifier picker
      const wmodPickerEl = document.getElementById("mode-worldmod-picker");
      if (wmodPickerEl && typeof WORLD_MODIFIER_DEFS !== 'undefined') {
        // Restore last-used modifier from localStorage on first open
        if (!activeWorldModifierId) {
          try {
            const saved = localStorage.getItem("mineCtris_lastWorldMod");
            if (saved && saved in WORLD_MODIFIER_DEFS) {
              if (typeof setWorldModifier === 'function') setWorldModifier(saved);
            }
          } catch (_) {}
        }
        wmodPickerEl.innerHTML = "";
        Object.values(WORLD_MODIFIER_DEFS).forEach(function (def) {
          const btn = document.createElement("button");
          const isSelected = (activeWorldModifierId || 'normal') === def.id;
          btn.className = "worldmod-pick-btn" + (isSelected ? " wm-selected" : "");
          btn.dataset.id = def.id;
          const swatchStyle = def.swatchColor
            ? ' style="background:' + def.swatchColor + '"'
            : ' style="background:#888"';
          btn.innerHTML =
            '<div class="wm-swatch"' + swatchStyle + '></div>' +
            '<div class="wm-icon">' + def.icon + '</div>' +
            '<div class="wm-name">' + def.name + '</div>' +
            (def.scoreMultiplier !== 1.0 ? '<div class="wm-mult">\xD7' + def.scoreMultiplier + '</div>' : '');
          btn.title = def.description;
          btn.addEventListener("click", function (e) {
            e.stopPropagation();
            if (typeof setWorldModifier === 'function') setWorldModifier(def.id);
            try { localStorage.setItem("mineCtris_lastWorldMod", def.id); } catch (_) {}
            wmodPickerEl.querySelectorAll(".worldmod-pick-btn").forEach(function (b) {
              b.classList.toggle("wm-selected", b.dataset.id === def.id);
            });
          });
          wmodPickerEl.appendChild(btn);
        });
      }

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

    // Show world modifier HUD badge if a non-normal modifier is active.
    function applyWorldModifierHUD() {
      const badgeEl = document.getElementById('world-modifier-badge');
      if (!badgeEl || typeof getWorldModifier !== 'function') return;
      const mod = getWorldModifier();
      if (mod && mod.id !== 'normal') {
        badgeEl.textContent = mod.icon + ' ' + mod.name + ' \xD7' + mod.scoreMultiplier;
        badgeEl.style.display = 'block';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    const classicCardEl = document.getElementById("mode-card-classic");
    if (classicCardEl) {
      classicCardEl.addEventListener("click", function () {
        isDailyChallenge = false;
        gameRng = null;
        applyWorldModifierHUD();
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
        applyWorldModifierHUD();
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
        applyWorldModifierHUD();
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
        applyWorldModifierHUD();
        try { localStorage.setItem("mineCtris_lastMode", "daily"); } catch (_) {}
        hideModeSelect();
        requestPointerLock();
      });
    }

    const weeklyCardEl = document.getElementById("mode-card-weekly");
    if (weeklyCardEl) {
      weeklyCardEl.addEventListener("click", function () {
        const mod = getCurrentWeeklyModifier();
        isWeeklyChallenge = true;
        weeklyModifier = mod;
        // Apply the modifier (sets flags and adjusts difficulty if needed)
        if (mod && typeof mod.applyFn === "function") mod.applyFn();
        // Seed the piece queue with this week's PRNG
        gameRng = getWeeklyPrng();
        initPieceQueue();
        // Show weekly badge in HUD
        const badgeEl = document.getElementById("weekly-challenge-badge");
        if (badgeEl) {
          badgeEl.textContent = getCurrentWeekLabel() + (mod ? ": " + mod.name : "");
          badgeEl.style.display = "block";
        }
        applyWorldModifierHUD();
        try { localStorage.setItem("mineCtris_lastMode", "weekly"); } catch (_) {}
        hideModeSelect();
        requestPointerLock();
      });
    }

    const puzzleCardEl = document.getElementById("mode-card-puzzle");
    if (puzzleCardEl) {
      puzzleCardEl.addEventListener("click", function () {
        isPuzzleMode = true;
        puzzleComplete = false;
        // Fixed slow speed for puzzle mode (half normal)
        difficultyMultiplier = 0.5;
        lastDifficultyTier = 0;
        hideModeSelect();
        if (typeof showPuzzleSelect === "function") showPuzzleSelect();
      });
    }

    // Survival mode card
    const survivalCardEl = document.getElementById("mode-card-survival");
    if (survivalCardEl) {
      survivalCardEl.addEventListener("click", function () {
        isSurvivalMode = true;
        isDailyChallenge = false;
        gameRng = null;
        // If a survival world is saved, restore it; otherwise start fresh
        if (typeof hasSurvivalWorld === "function" && hasSurvivalWorld()) {
          if (typeof restoreSurvivalWorld === "function") restoreSurvivalWorld();
          survivalSessionNumber++;
        } else {
          survivalSessionNumber = 1;
          if (typeof initWorldStats === "function") initWorldStats();
        }
        // Show survival HUD badge
        const survBadgeEl = document.getElementById("survival-badge");
        if (survBadgeEl) survBadgeEl.style.display = "block";
        hideModeSelect();
        requestPointerLock();
      });
    }

    // Survival: Reset World button + confirmation dialog
    const survivalResetBtn = document.getElementById("survival-reset-btn");
    const survivalResetConfirm = document.getElementById("survival-reset-confirm");
    const survivalResetYes = document.getElementById("survival-reset-confirm-yes");
    const survivalResetNo = document.getElementById("survival-reset-confirm-no");

    if (survivalResetBtn && survivalResetConfirm) {
      survivalResetBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        survivalResetConfirm.style.display = "flex";
      });
      survivalResetYes.addEventListener("click", function () {
        if (typeof clearSurvivalWorld === "function") clearSurvivalWorld();
        if (typeof resetWorldStats === "function") resetWorldStats();
        survivalResetConfirm.style.display = "none";
        if (typeof renderWorldCard === "function") renderWorldCard();
        // Refresh the survival PB text
        const survivalPbEl = document.getElementById("mode-pb-survival");
        if (survivalPbEl) survivalPbEl.textContent = "";
      });
      survivalResetNo.addEventListener("click", function () {
        survivalResetConfirm.style.display = "none";
      });
    }

    // Puzzle select back button
    const puzzleSelectBackBtn = document.getElementById("puzzle-select-back");
    if (puzzleSelectBackBtn) {
      puzzleSelectBackBtn.addEventListener("click", function () {
        if (typeof hidePuzzleSelect === "function") hidePuzzleSelect();
        isPuzzleMode = false;
        difficultyMultiplier = 1.0;
        lastDifficultyTier = 0;
        showModeSelect("puzzle");
      });
    }

    // Puzzle complete screen buttons
    const puzzleNextBtn = document.getElementById("puzzle-next-btn");
    if (puzzleNextBtn) {
      puzzleNextBtn.addEventListener("click", function () {
        const nextId = puzzlePuzzleId + 1;
        resetGame();
        // Re-enter puzzle mode for next puzzle (must set puzzlePuzzleId AFTER resetGame
        // since resetGame resets it to 1)
        if (nextId <= PUZZLES.length) puzzlePuzzleId = nextId;
        isPuzzleMode = true;
        puzzleComplete = false;
        difficultyMultiplier = 0.5;
        lastDifficultyTier = 0;
        if (typeof hidePuzzleSelect === "function") hidePuzzleSelect();
        requestPointerLock();
      });
    }
    const puzzleRetryBtn = document.getElementById("puzzle-retry-btn");
    if (puzzleRetryBtn) {
      puzzleRetryBtn.addEventListener("click", function () {
        const currentPuzzleId = puzzlePuzzleId;
        resetGame();
        isPuzzleMode = true;
        puzzlePuzzleId = currentPuzzleId;
        puzzleComplete = false;
        difficultyMultiplier = 0.5;
        lastDifficultyTier = 0;
        requestPointerLock();
      });
    }
    const puzzleSelectBtn = document.getElementById("puzzle-select-btn");
    if (puzzleSelectBtn) {
      puzzleSelectBtn.addEventListener("click", function () {
        resetGame();
      });
    }
    const puzzleMainMenuBtn = document.getElementById("puzzle-main-menu-btn");
    if (puzzleMainMenuBtn) {
      puzzleMainMenuBtn.addEventListener("click", function () {
        resetGame();
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

      // Puzzle mode: place preset blocks and init fixed piece queue
      if (isPuzzleMode) {
        if (typeof resetPuzzleState === "function") resetPuzzleState();
        if (typeof setupPuzzleLayout === "function") setupPuzzleLayout();
        if (typeof initPuzzlePieceQueue === "function") initPuzzlePieceQueue();
        const badgeEl = document.getElementById("puzzle-badge");
        if (badgeEl) {
          badgeEl.style.display = "block";
          if (typeof updatePuzzleHUD === "function") updatePuzzleHUD();
        }
      }
      // Show equipped power-up HUD badge if applicable
      updatePowerupHUD();
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
      const puzzleBadgeEl = document.getElementById("puzzle-badge");
      if (puzzleBadgeEl) puzzleBadgeEl.style.display = "none";
      const powerupHudEl = document.getElementById("powerup-hud");
      if (powerupHudEl) powerupHudEl.style.display = "none";
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

  const startMissionsBtn = document.getElementById("start-missions-btn");
  if (startMissionsBtn) startMissionsBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (typeof openMissionsPanel === "function") openMissionsPanel();
  });

  const missionsCloseBtn = document.getElementById("missions-close-btn");
  if (missionsCloseBtn) missionsCloseBtn.addEventListener("click", function () {
    if (typeof closeMissionsPanel === "function") closeMissionsPanel();
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
    else if (pickaxeTier === "iron" || pickaxeTier === "diamond") clicksNeeded = 1;
    // Earthquake bonus: halve all hit requirements (rounded down, minimum 1)
    if (earthquakeActive) clicksNeeded = Math.max(1, Math.floor(clicksNeeded / 2));
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
      if (typeof onMissionBlockMined === "function") onMissionBlockMined();
      // Save grid pos for diamond AOE (before block is removed from world)
      const _brokenBlock = pickaxeTier === "diamond" ? (targetedBlock.userData.gridPos
        ? { x: targetedBlock.userData.gridPos.x, y: targetedBlock.userData.gridPos.y, z: targetedBlock.userData.gridPos.z }
        : null) : null;

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
      // Diamond Pickaxe AOE — mine up to 4 adjacent blocks in a cross pattern
      if (pickaxeTier === "diamond" && _brokenBlock) {
        _applyDiamondAOE(_brokenBlock);
      }
      // Puzzle mode: check win/lose after every mined block
      if (isPuzzleMode && typeof checkPuzzleConditions === "function") {
        checkPuzzleConditions();
      }
      targetedBlock = null;
      miningProgress = 0;
      crosshair.classList.remove("target-locked");
      isMining = false;
      if (pickaxeGroup) pickaxeGroup.rotation.z = Math.PI / 8;
    }
  }
}

/**
 * Find a landed block at the given grid coordinates (integer X/Y/Z).
 * Only searches blocks that have a valid gridPos.
 */
function _findBlockAtGrid(gx, gy, gz) {
  for (let i = 0; i < worldGroup.children.length; i++) {
    const child = worldGroup.children[i];
    const gp = child.userData.gridPos;
    if (gp && gp.x === gx && gp.y === gy && gp.z === gz) return child;
  }
  return null;
}

/**
 * Mine up to 4 adjacent blocks (N/S/E/W same Y) when diamond pickaxe breaks a block.
 * @param {{ x:number, y:number, z:number }} origin  The grid position of the primary broken block.
 */
function _applyDiamondAOE(origin) {
  const offsets = [[-1,0],[1,0],[0,-1],[0,1]];
  offsets.forEach(([dx, dz]) => {
    const neighbor = _findBlockAtGrid(origin.x + dx, origin.y, origin.z + dz);
    if (!neighbor) return;
    spawnDustParticles(neighbor, { breakBurst: true });
    blocksMined++;
    const nobjType = neighbor.userData.objectType;
    const nmatName = neighbor.userData.materialType ||
      (nobjType ? OBJECT_TYPE_TO_MATERIAL[nobjType] : null);
    addScore(nmatName && BLOCK_TYPES[nmatName] ? BLOCK_TYPES[nmatName].points : 10);
    if (typeof achOnBlockMined === "function") achOnBlockMined(blocksMined, nobjType);
    if (typeof onMissionBlockMined === "function") onMissionBlockMined();
    const nColor = neighbor.userData.originalColor || neighbor.material.color;
    addToInventory(threeColorToCss(nColor));
    unregisterBlock(neighbor);
    worldGroup.remove(neighbor);
  });
}

/**
 * Lava Flask activation: removes all blocks on the lowest occupied Y layer.
 * Activated via keyboard shortcut F.
 */
function activateLavaFlask() {
  if (!controls || !controls.isLocked || isGameOver) return;
  if (!consumables.lava_flask || consumables.lava_flask <= 0) return;
  // Find the lowest non-empty Y layer
  let lowestY = Infinity;
  for (const gy of gridOccupancy.keys()) {
    if (gy < lowestY) lowestY = gy;
  }
  if (!isFinite(lowestY)) return;

  consumables.lava_flask--;
  showCraftedBanner("Lava Flask! Layer destroyed.");

  // Collect all blocks at lowestY and remove them
  const toRemove = worldGroup.children.filter(c => {
    const gp = c.userData.gridPos;
    return gp && gp.y === lowestY;
  });
  toRemove.forEach(block => {
    spawnDustParticles(block, { breakBurst: true });
    blocksMined++;
    const oType = block.userData.objectType;
    const mName = block.userData.materialType || (oType ? OBJECT_TYPE_TO_MATERIAL[oType] : null);
    addScore(mName && BLOCK_TYPES[mName] ? BLOCK_TYPES[mName].points : 10);
    unregisterBlock(block);
    worldGroup.remove(block);
  });
  if (typeof achOnBlockMined === "function") achOnBlockMined(blocksMined, undefined);
  // Mission: count lava-flask-destroyed blocks
  if (typeof onMissionBlockMined === "function") {
    for (let _i = 0; _i < toRemove.length; _i++) onMissionBlockMined();
  }
  if (typeof onMissionPowerupActivated === "function") onMissionPowerupActivated();
}

/**
 * Ice Bridge activation: slows all falling pieces by 20% for 10 seconds.
 * Activated via keyboard shortcut G.
 */
function activateIceBridge() {
  if (!controls || !controls.isLocked || isGameOver) return;
  if (!consumables.ice_bridge || consumables.ice_bridge <= 0) return;
  consumables.ice_bridge--;
  iceBridgeSlowActive = true;
  iceBridgeSlowTimer  = 10.0;
  showCraftedBanner("Ice Bridge! 20% slow for 10s.");
  if (typeof onMissionPowerupActivated === "function") onMissionPowerupActivated();
}

/**
 * Trigger a one-shot activation flash for the given power-up type.
 * @param {"row-bomb"|"slow-down"|"shield"|"magnet"} type
 */
function _triggerPowerupFlash(type) {
  const el = document.getElementById("powerup-flash");
  if (!el) return;
  // Reset animation by forcing reflow
  el.style.display = "none";
  el.className = "";
  void el.offsetWidth; // reflow
  el.className = type + " active";
  el.style.display = "block";
  el.addEventListener("animationend", function onEnd() {
    el.style.display = "none";
    el.className = "";
    el.removeEventListener("animationend", onEnd);
  }, { once: true });
}

/**
 * Trigger a brief red lightning-strike flash on piece spawn during Piece Storm.
 * Resets the CSS animation each call by forcing a reflow.
 */
function triggerLightningFlash() {
  const el = document.getElementById("lightning-flash");
  if (!el) return;
  el.style.display = "none";
  el.classList.remove("active");
  void el.offsetWidth; // force reflow to restart animation
  el.classList.add("active");
  el.style.display = "block";
  el.addEventListener("animationend", function onEnd() {
    el.style.display = "none";
    el.classList.remove("active");
    el.removeEventListener("animationend", onEnd);
  }, { once: true });
}

/** Show/hide persistent power-up overlays based on current effect state. */
function updatePowerupOverlays() {
  const sdEl = document.getElementById("slowdown-overlay");
  const shEl = document.getElementById("shield-overlay");
  const mgEl = document.getElementById("magnet-overlay");
  if (sdEl) sdEl.style.display = (!isGameOver && slowDownActive) ? "block" : "none";
  if (shEl && !shEl.classList.contains("absorb")) {
    shEl.style.display = (!isGameOver && shieldActive) ? "block" : "none";
  }
  if (mgEl) mgEl.style.display = (!isGameOver && magnetActive) ? "block" : "none";
}

/** Update the equipped power-up HUD badge visibility and used state. */
function updatePowerupHUD() {
  const hudEl = document.getElementById("powerup-hud");
  if (!hudEl) return;
  if (!equippedPowerUpType) {
    hudEl.style.display = "none";
    return;
  }
  const puDefs = {
    row_bomb:  { icon: "\uD83D\uDCA3", name: "Row Bomb"  },
    slow_down: { icon: "\u23F1",        name: "Slow Down" },
    shield:    { icon: "\uD83D\uDEE1",  name: "Shield"    },
    magnet:    { icon: "\uD83E\uDDF2",  name: "Magnet"    },
  };
  const def = puDefs[equippedPowerUpType];
  if (!def) { hudEl.style.display = "none"; return; }
  const bank = loadPowerUpBank();
  const qty  = bank[equippedPowerUpType] || 0;
  hudEl.style.display = "flex";
  const iconEl = document.getElementById("powerup-hud-icon");
  const nameEl = document.getElementById("powerup-hud-name");
  if (iconEl) {
    iconEl.textContent = def.icon;
    iconEl.classList.toggle("pu-used", qty <= 0);
  }
  if (nameEl) nameEl.textContent = def.name + (qty > 0 ? " \xD7" + qty : " (used)");
}

/**
 * Activate the currently equipped power-up.
 * Called via the F key (when a power-up is equipped) or directly.
 */
function activateEquippedPowerup() {
  if (!controls || !controls.isLocked || isGameOver) return;
  if (!equippedPowerUpType) return;
  const bank = loadPowerUpBank();
  if ((bank[equippedPowerUpType] || 0) <= 0) return;

  // Consume one from the bank
  bank[equippedPowerUpType]--;
  savePowerUpBank(bank);
  // Also decrement in-session inventory (kept in sync)
  if (powerUps[equippedPowerUpType] > 0) powerUps[equippedPowerUpType]--;

  switch (equippedPowerUpType) {
    case "row_bomb": {
      let lowestY = Infinity;
      for (const gy of gridOccupancy.keys()) {
        if (gy < lowestY) lowestY = gy;
      }
      if (!isFinite(lowestY)) break;
      showCraftedBanner("Row Bomb! Row cleared.");
      const toRemove = worldGroup.children.filter(function (c) {
        const gp = c.userData.gridPos;
        return gp && gp.y === lowestY;
      });
      toRemove.forEach(function (block) {
        spawnDustParticles(block, { breakBurst: true });
        blocksMined++;
        const oType = block.userData.objectType;
        const mName = block.userData.materialType || (oType ? OBJECT_TYPE_TO_MATERIAL[oType] : null);
        addScore(mName && BLOCK_TYPES[mName] ? BLOCK_TYPES[mName].points : 10);
        unregisterBlock(block);
        worldGroup.remove(block);
      });
      if (typeof achOnBlockMined === "function") achOnBlockMined(blocksMined, undefined);
      _triggerPowerupFlash("row-bomb");
      triggerChromaticAberration(0.008, 0.45);
      break;
    }
    case "slow_down": {
      slowDownActive = true;
      slowDownTimer  = 60.0;
      showCraftedBanner("Slow Down! 50% speed for 60s.");
      _triggerPowerupFlash("slow-down");
      break;
    }
    case "shield": {
      shieldActive = true;
      showCraftedBanner("Shield active! Next death absorbed.");
      _triggerPowerupFlash("shield");
      break;
    }
    case "magnet": {
      magnetActive      = true;
      magnetTimer       = 30.0;
      magnetLastPullTime = 0.0;
      showCraftedBanner("Magnet! Auto-mining nearby blocks for 30s.");
      _triggerPowerupFlash("magnet");
      break;
    }
  }

  updatePowerupHUD();
  if (typeof onMissionPowerupActivated === "function") onMissionPowerupActivated();
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

    // Tick ice bridge slow timer
    if (iceBridgeSlowActive) {
      iceBridgeSlowTimer -= delta;
      if (iceBridgeSlowTimer <= 0) {
        iceBridgeSlowActive = false;
        iceBridgeSlowTimer  = 0;
      }
    }

    // Tick Slow Down power-up timer
    if (slowDownActive) {
      slowDownTimer -= delta;
      if (slowDownTimer <= 0) {
        slowDownActive = false;
        slowDownTimer  = 0;
      }
    }

    // Tick Magnet power-up: auto-mine nearest block within 5 units, once per second
    if (magnetActive) {
      magnetTimer -= delta;
      if (magnetTimer <= 0) {
        magnetActive      = false;
        magnetTimer       = 0;
        magnetLastPullTime = 0;
      } else if (controls && controls.isLocked) {
        magnetLastPullTime += delta;
        if (magnetLastPullTime >= 1.0) {
          magnetLastPullTime = 0;
          const playerPos = controls.getObject().position;
          const MAGNET_RANGE = 5;
          let nearestDist = Infinity;
          let nearestBlock = null;
          worldGroup.children.forEach(function (obj) {
            if (!obj.userData.isBlock || !obj.userData.gridPos) return;
            const dx = playerPos.x - obj.position.x;
            const dy = playerPos.y - obj.position.y;
            const dz = playerPos.z - obj.position.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < MAGNET_RANGE && dist < nearestDist) {
              nearestDist  = dist;
              nearestBlock = obj;
            }
          });
          if (nearestBlock) {
            spawnDustParticles(nearestBlock, { breakBurst: true });
            blocksMined++;
            const oType = nearestBlock.userData.objectType;
            const mName = nearestBlock.userData.materialType || (oType ? OBJECT_TYPE_TO_MATERIAL[oType] : null);
            if (mName) addToInventory(nearestBlock.material.color.getStyle());
            addScore(mName && BLOCK_TYPES[mName] ? BLOCK_TYPES[mName].points : 10);
            unregisterBlock(nearestBlock);
            worldGroup.remove(nearestBlock);
            if (typeof achOnBlockMined === "function") achOnBlockMined(blocksMined, undefined);
          }
        }
      }
    }

    const _stormSpawnInterval = pieceStormActive ? SPAWN_INTERVAL * 0.5 : SPAWN_INTERVAL;
    spawnTimer += delta;
    if (spawnTimer > _stormSpawnInterval) {
      spawnFallingPiece();
      if (pieceStormActive) {
        triggerLightningFlash();
        if (typeof playStormSwoosh === "function") playStormSwoosh();
      }
      spawnTimer = 0;
      // Update puzzle HUD after each spawn
      if (isPuzzleMode && typeof updatePuzzleHUD === "function") updatePuzzleHUD();
    }
    updateLineClear(delta);
    updateFallingPieces(delta);
    updateLandingRings(delta);
    updateTrails(delta, elapsedTime);
    updateAuras(delta, camera);
    updateDifficulty(delta);
    updateTreeRespawn(delta, elapsedTime);
    if (typeof updateEventEngine === "function") updateEventEngine(delta);
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
    const _movWmod = typeof getWorldModifier === 'function' ? getWorldModifier() : null;
    const _modSpeedMult = _movWmod ? _movWmod.playerSpeedMult : 1.0;
    const _iceEffect = playerStandingOnIce || (_movWmod && _movWmod.iceAllBlocks);
    const speedDelta = MOVEMENT_SPEED * _modSpeedMult * (_iceEffect ? 1.2 : 1.0) * delta;
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

  updatePowerupOverlays();
  updatePostProcessing(delta);

  if (composer) {
    composer.render(delta);
  } else {
    renderer.render(scene, camera);
  }

  // Earthquake camera shake: sinusoidal position offset applied post-render
  // to avoid post-processing (SSAO) conflicts. Max ±0.15 units on X/Y.
  if (earthquakeActive) {
    const t   = clock.getElapsedTime();
    const newX = Math.sin(t * 18.3) * 0.15;
    const newY = Math.sin(t * 23.7 + 1.2) * 0.15;
    camera.position.x += newX - _eqShakeOffX;
    camera.position.y += newY - _eqShakeOffY;
    _eqShakeOffX = newX;
    _eqShakeOffY = newY;
  } else if (_eqShakeOffX !== 0 || _eqShakeOffY !== 0) {
    // Undo last offset when earthquake just ended
    camera.position.x -= _eqShakeOffX;
    camera.position.y -= _eqShakeOffY;
    _eqShakeOffX = 0;
    _eqShakeOffY = 0;
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
