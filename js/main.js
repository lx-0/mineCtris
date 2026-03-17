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

  // Obsidian: 1–2 blocks per world, rare, partially buried, spaced from other objects
  const numObsidian = Math.floor(Math.random() * 2) + 1;
  for (let i = 0; i < numObsidian; i++) {
    let ox, oz, valid;
    let attempts = 0;
    do {
      ox = (Math.random() - 0.5) * WORLD_SIZE * 0.8;
      oz = (Math.random() - 0.5) * WORLD_SIZE * 0.8;
      valid = true;
      for (const pos of spawnedPositions) {
        const dx = ox - pos.x;
        const dz = oz - pos.z;
        if (Math.sqrt(dx * dx + dz * dz) < 3) { valid = false; break; }
      }
      attempts++;
    } while (!valid && attempts < 50);
    if (valid) {
      spawnObsidian(ox, oz);
      spawnedPositions.push({ x: ox, z: oz });
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
      if (e.target.id === "start-create-btn") return;
      if (e.target.id === "start-community-btn") return;
      // If ?editor=1 URL param preset editor mode, go straight into editor
      if (isEditorMode) { requestPointerLock(); return; }
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
      // Update co-op achievement count on mode card
      if (typeof updateCoopModeCardAch === 'function') updateCoopModeCardAch();
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
      ["classic", "sprint", "blitz", "daily", "weekly", "puzzle", "survival", "coop", "battle"].forEach(function (mode) {
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

    function _showCustomPuzzleLoadScreen() {
      const screen = document.getElementById("custom-puzzle-load-screen");
      if (!screen) return;
      const meta = (typeof customPuzzleMetadata !== "undefined") ? customPuzzleMetadata : null;

      const nameEl = document.getElementById("cpls-name");
      if (nameEl) nameEl.textContent = (meta && meta.name) ? meta.name : "Custom Puzzle";

      const descEl = document.getElementById("cpls-desc");
      if (descEl) descEl.textContent = (meta && meta.description) ? meta.description : "";

      const authorEl = document.getElementById("cpls-author");
      if (authorEl) {
        authorEl.textContent = (meta && meta.author) ? "by " + meta.author : "";
        authorEl.style.display = (meta && meta.author) ? "" : "none";
      }

      const diffEl = document.getElementById("cpls-difficulty");
      if (diffEl) {
        var diff = (meta && meta.difficulty) ? meta.difficulty : 0;
        if (diff > 0) {
          diffEl.textContent = "★".repeat(diff) + "☆".repeat(3 - diff);
          diffEl.style.display = "";
        } else {
          diffEl.style.display = "none";
        }
      }

      screen.style.display = "flex";
    }

    function _showPuzzleDecodeError(versionMismatch) {
      const screen = document.getElementById("custom-puzzle-load-screen");
      if (!screen) return;
      const nameEl = document.getElementById("cpls-name");
      if (nameEl) nameEl.textContent = versionMismatch ? "Newer Version" : "Invalid Puzzle";
      const descEl = document.getElementById("cpls-desc");
      if (descEl) descEl.textContent = versionMismatch
        ? "This puzzle was created with a newer version of the editor. Update to play it."
        : "This share code is corrupted or cannot be read. The link may be broken.";
      const authorEl = document.getElementById("cpls-author");
      if (authorEl) { authorEl.textContent = ""; authorEl.style.display = "none"; }
      const diffEl = document.getElementById("cpls-difficulty");
      if (diffEl) diffEl.style.display = "none";
      const playBtn = document.getElementById("cpls-play-btn");
      if (playBtn) playBtn.style.display = "none";
      screen.style.display = "flex";
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

    // ── Co-op mode card + lobby overlay ──────────────────────────────────────
    (function () {
      var coopOverlay     = document.getElementById("coop-overlay");
      var coopChoiceView  = document.getElementById("coop-choice-view");
      var coopCreateView  = document.getElementById("coop-create-view");
      var coopJoinView    = document.getElementById("coop-join-view");
      var coopReadyView   = document.getElementById("coop-ready-view");

      if (!coopOverlay || typeof coop === "undefined") return;

      function showCoopView(name) {
        [coopChoiceView, coopCreateView, coopJoinView, coopReadyView].forEach(function (v) {
          if (v) v.style.display = "none";
        });
        var target = {
          choice: coopChoiceView,
          create: coopCreateView,
          join:   coopJoinView,
          ready:  coopReadyView,
        }[name];
        if (target) target.style.display = "";
      }

      function openCoopOverlay(initialView) {
        hideModeSelect();
        blocker.style.display = "none";
        showCoopView(initialView || "choice");
        coopOverlay.style.display = "flex";
      }

      function closeCoopOverlay() {
        coopOverlay.style.display = "none";
        coop.disconnect();
        isDailyCoopChallenge = false;
        // Return to menu
        blocker.style.display = "flex";
        instructions.style.display = "";
      }

      // Co-op mode card click
      var coopCardEl = document.getElementById("mode-card-coop");
      if (coopCardEl) {
        coopCardEl.addEventListener("click", function () {
          openCoopOverlay("choice");
        });
      }

      // ── Register coop state-change handler once ──
      coop.on("state_change", function (data) {
        if (data.state === "ready") {
          var readyCodeEl = document.getElementById("coop-ready-code");
          if (readyCodeEl) readyCodeEl.textContent = "Room: " + (data.roomCode || "");
          // Reset ready state for both players
          _coopHostReady = false;
          _coopGuestReady = false;
          _updateReadyIndicators();
          // Show correct difficulty UI based on role
          _initReadyViewForRole();
          showCoopView("ready");
        } else if (data.state === "disconnected") {
          var statusEl = document.getElementById("coop-status-msg");
          if (statusEl) statusEl.textContent = "Disconnected.";
          closeCoopOverlay();
        }
      });

      coop.on("timeout", function () {
        var statusEl = document.getElementById("coop-status-msg");
        if (statusEl) statusEl.textContent = "No one joined. Room closed.";
        setTimeout(function () { closeCoopOverlay(); }, 2000);
      });

      coop.on("partner_left", function () {
        // Partner left after game started — handled by game layer; ignore here
      });

      // ── Choice view buttons ──
      var createBtn = document.getElementById("coop-create-btn");
      if (createBtn) {
        createBtn.addEventListener("click", function () {
          showCoopView("create");
          var roomCodeEl   = document.getElementById("coop-room-code");
          var statusMsg    = document.getElementById("coop-status-msg");
          var copyFeedback = document.getElementById("coop-copy-feedback");
          if (roomCodeEl) roomCodeEl.textContent = "…";
          if (statusMsg)  statusMsg.textContent   = "";
          if (copyFeedback) copyFeedback.textContent = "";

          coop.createRoom().then(function (code) {
            if (roomCodeEl) roomCodeEl.textContent = code;
          }).catch(function () {
            if (statusMsg) statusMsg.textContent = "Failed to create room.";
          });
        });
      }

      var joinBtnChoice = document.getElementById("coop-join-btn-choice");
      if (joinBtnChoice) {
        joinBtnChoice.addEventListener("click", function () {
          showCoopView("join");
          var joinStatusEl = document.getElementById("coop-join-status-msg");
          if (joinStatusEl) joinStatusEl.textContent = "";
          var codeInput = document.getElementById("coop-code-input");
          if (codeInput) { codeInput.value = ""; codeInput.focus(); }
        });
      }

      // ── Daily Co-op Challenge button ──
      var coopDailyBtn = document.getElementById("coop-daily-btn");
      if (coopDailyBtn) {
        // Show previous daily coop best if available
        var coopDailyBestDisplay = document.getElementById("coop-daily-best-display");
        if (coopDailyBestDisplay) {
          var _coopDailyBestRaw = null;
          try { _coopDailyBestRaw = JSON.parse(localStorage.getItem('mineCtris_coopDailyBest') || 'null'); } catch (_e) {}
          var _today = typeof getDailyDateString === 'function' ? getDailyDateString() : '';
          if (_coopDailyBestRaw && _coopDailyBestRaw.date === _today) {
            coopDailyBestDisplay.textContent = 'Your best today: ' + _coopDailyBestRaw.score.toLocaleString() +
              ' (with ' + _coopDailyBestRaw.partner + ')';
            coopDailyBestDisplay.style.display = 'block';
          }
        }

        coopDailyBtn.addEventListener("click", function () {
          isDailyCoopChallenge = true;
          // Open lobby as normal — same room flow, just with daily seed
          showCoopView("create");
          var roomCodeEl   = document.getElementById("coop-room-code");
          var statusMsg    = document.getElementById("coop-status-msg");
          var copyFeedback = document.getElementById("coop-copy-feedback");
          if (roomCodeEl) roomCodeEl.textContent = "…";
          if (statusMsg)  statusMsg.textContent   = "";
          if (copyFeedback) copyFeedback.textContent = "";
          coop.createRoom().then(function (code) {
            if (roomCodeEl) roomCodeEl.textContent = code;
          }).catch(function () {
            if (statusMsg) statusMsg.textContent = "Failed to create room.";
          });
        });
      }

      var choiceCancelBtn = document.getElementById("coop-choice-cancel-btn");
      if (choiceCancelBtn) {
        choiceCancelBtn.addEventListener("click", function () {
          closeCoopOverlay();
        });
      }

      // ── Create view buttons ──
      var copyLinkBtn = document.getElementById("coop-copy-link-btn");
      if (copyLinkBtn) {
        copyLinkBtn.addEventListener("click", function () {
          var code = coop.roomCode;
          if (!code) return;
          var url = window.location.origin + window.location.pathname + "?room=" + code;
          var feedbackEl = document.getElementById("coop-copy-feedback");
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function () {
              if (feedbackEl) {
                feedbackEl.textContent = "\u2713 Copied!";
                setTimeout(function () { feedbackEl.textContent = ""; }, 2000);
              }
            }).catch(function () { window.prompt("Copy invite link:", url); });
          } else {
            window.prompt("Copy invite link:", url);
          }
        });
      }

      var createCancelBtn = document.getElementById("coop-create-cancel-btn");
      if (createCancelBtn) {
        createCancelBtn.addEventListener("click", function () { closeCoopOverlay(); });
      }

      // ── Join view buttons & code input ──
      var codeInput = document.getElementById("coop-code-input");
      if (codeInput) {
        codeInput.addEventListener("input", function () {
          this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
        });
        codeInput.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            var confirmBtn = document.getElementById("coop-join-confirm-btn");
            if (confirmBtn) confirmBtn.click();
          }
        });
      }

      var joinConfirmBtn = document.getElementById("coop-join-confirm-btn");
      if (joinConfirmBtn) {
        joinConfirmBtn.addEventListener("click", function () {
          var code = codeInput ? codeInput.value.trim().toUpperCase() : "";
          var joinStatusEl = document.getElementById("coop-join-status-msg");
          if (!code || code.length !== 4) {
            if (joinStatusEl) joinStatusEl.textContent = "Enter a 4-character code.";
            return;
          }
          if (joinStatusEl) joinStatusEl.textContent = "Joining\u2026";
          coop.joinRoom(code).then(function () {
            if (joinStatusEl) joinStatusEl.textContent = "";
            showCoopView("create");
            var roomCodeEl = document.getElementById("coop-room-code");
            if (roomCodeEl) roomCodeEl.textContent = code;
            var waitingEl = document.getElementById("coop-waiting-spinner");
            if (waitingEl) waitingEl.textContent = "\u9696 Connected \u2014 waiting for host\u2026";
          }).catch(function (err) {
            if (joinStatusEl) joinStatusEl.textContent = (err && err.message) ? err.message : "Failed to join.";
          });
        });
      }

      var joinCancelBtn = document.getElementById("coop-join-cancel-btn");
      if (joinCancelBtn) {
        joinCancelBtn.addEventListener("click", function () {
          coop.disconnect();
          showCoopView("choice");
        });
      }

      // ── Ready view state ──
      var _coopHostReady = false;
      var _coopGuestReady = false;

      function _updateReadyIndicators() {
        var hostEl = document.getElementById('coop-host-ready-indicator');
        var guestEl = document.getElementById('coop-guest-ready-indicator');
        if (hostEl) {
          hostEl.textContent = (_coopHostReady ? '\u2611' : '\u2633') + ' Host';
          hostEl.className = _coopHostReady ? 'ready' : '';
        }
        if (guestEl) {
          guestEl.textContent = (_coopGuestReady ? '\u2611' : '\u2633') + ' Guest';
          guestEl.className = _coopGuestReady ? 'ready' : '';
        }
      }

      function _applyCoopDifficulty(level) {
        var settings = typeof COOP_DIFFICULTY_SETTINGS !== 'undefined' ? COOP_DIFFICULTY_SETTINGS : null;
        if (!settings || !settings[level]) return;
        coopDifficulty = level;
        coopFallMultiplier = settings[level].fallMult;
        coopScoreMultiplier = settings[level].scoreMult;
      }

      function _initReadyViewForRole() {
        var diffBtns   = document.getElementById('coop-diff-btns');
        var guestDisp  = document.getElementById('coop-diff-guest-display');
        var guestLabel = document.getElementById('coop-diff-guest-label');
        if (coop.isHost) {
          // Host: show interactive buttons, hide guest read-only label
          if (diffBtns)  diffBtns.style.display = 'flex';
          if (guestDisp) guestDisp.style.display = 'none';
          // Set default selection highlight
          _setDiffButtonSelected('normal');
          _applyCoopDifficulty('normal');
        } else {
          // Guest: hide buttons, show read-only label
          if (diffBtns)  diffBtns.style.display = 'none';
          if (guestDisp) guestDisp.style.display = '';
          if (guestLabel) guestLabel.textContent = 'NORMAL';
          _applyCoopDifficulty('normal');
        }
      }

      function _setDiffButtonSelected(level) {
        var btns = document.querySelectorAll('.coop-diff-btn');
        btns.forEach(function (btn) {
          if (btn.dataset.level === level) {
            btn.classList.add('coop-diff-selected');
          } else {
            btn.classList.remove('coop-diff-selected');
          }
        });
      }

      // Difficulty button clicks (host only — buttons are hidden for guest)
      document.querySelectorAll('.coop-diff-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (!coop.isHost) return;
          var level = btn.dataset.level;
          _setDiffButtonSelected(level);
          _applyCoopDifficulty(level);
          coop.send({ type: 'difficulty', level: level });
        });
      });

      function _startCoopGame() {
        isCoopMode = true;
        isDailyChallenge = false;
        // isDailyCoopChallenge is set BEFORE calling _startCoopGame; preserve it here
        gameRng = isDailyCoopChallenge ? getDailyPrng() : null;
        coopPieceQueue.length = 0;
        applyWorldModifierHUD();
        _initCoopHUD();
        camera.position.set(0, PLAYER_HEIGHT, 0);
        if (typeof coopAvatar !== 'undefined') coopAvatar.init('Partner');
        if (typeof coopTrade !== 'undefined') coopTrade.showFirstRunHint();
        if (typeof coopEmote !== 'undefined') coopEmote.showHud(true);
        coop.startGame();
        coopOverlay.style.display = "none";
        setTimeout(function () { requestPointerLock(); }, 500);
      }

      // ── Ready view buttons ──
      var startBtn = document.getElementById("coop-start-btn");
      if (startBtn) {
        startBtn.addEventListener("click", function () {
          if (coop.isHost) {
            _coopHostReady = true;
            _updateReadyIndicators();
            coop.send({ type: 'player_ready' });
            startBtn.disabled = true;
            startBtn.textContent = '\u2611 Ready!';
            // If guest already marked ready, start immediately
            if (_coopGuestReady) {
              coop.send({ type: 'game_start', difficulty: coopDifficulty, isDaily: isDailyCoopChallenge });
              _startCoopGame();
            }
          } else {
            // Guest
            _coopGuestReady = true;
            _updateReadyIndicators();
            coop.send({ type: 'player_ready' });
            startBtn.disabled = true;
            startBtn.textContent = '\u2611 Ready!';
            // Guest waits for host to send game_start
          }
        });
      }

      // ── Co-op in-game HUD helpers ──
      function _initCoopHUD() {
        // Reset co-op score state
        coopScore = 0; coopMyScore = 0; coopPartnerScore = 0;
        coopPartnerMaxY = 0; coopHeightBroadcastLastTime = 0;
        coopPartnerStatus = 'connected'; coopPartnerLastSeenTime = performance.now();
        // Show CO-OP badge with difficulty label (and DAILY marker if applicable)
        var coopBadgeEl = document.getElementById('coop-mode-badge');
        if (coopBadgeEl) {
          coopBadgeEl.style.display = 'flex';
          var diffLabelEl = document.getElementById('coop-difficulty-label');
          if (diffLabelEl) {
            var diffKey = coopDifficulty.toUpperCase();
            diffLabelEl.textContent = isDailyCoopChallenge ? ' DAILY \u00b7 ' + diffKey : ' ' + diffKey;
          }
        }
        // Show co-op score HUD; hide solo score
        var coopHudEl = document.getElementById('coop-score-display');
        if (coopHudEl) coopHudEl.style.display = 'block';
        // Show partner status indicator
        var partnerStatusEl = document.getElementById('coop-partner-status');
        if (partnerStatusEl) partnerStatusEl.style.display = 'flex';
        if (typeof updateCoopScoreHUD === 'function') updateCoopScoreHUD();
        if (typeof updateCoopPartnerStatus === 'function') updateCoopPartnerStatus();
        // Show co-op bonus banner (fades out after 3s)
        var bonusEl = document.getElementById('coop-bonus-overlay');
        if (bonusEl) {
          var settings = typeof COOP_DIFFICULTY_SETTINGS !== 'undefined' ? COOP_DIFFICULTY_SETTINGS : null;
          var mult = settings && settings[coopDifficulty] ? settings[coopDifficulty].scoreMult : coopScoreMultiplier;
          bonusEl.textContent = mult + 'x CO-OP BONUS';
          bonusEl.style.display = 'block';
          bonusEl.style.opacity = '1';
          coopBonusBannerTimer = 3.0;
        }
      }

      function _showCoopPartnerLeftDialog() {
        var dialogEl = document.getElementById('coop-partner-left-dialog');
        if (!dialogEl) return;
        dialogEl.style.display = 'flex';
        var countdownEl = dialogEl.querySelector('#coop-partner-left-countdown');
        var remaining = 10;
        if (countdownEl) countdownEl.textContent = remaining;
        var timerHandle = setInterval(function () {
          remaining--;
          if (countdownEl) countdownEl.textContent = remaining;
          if (remaining <= 0) {
            clearInterval(timerHandle);
            dialogEl.style.display = 'none';
            // Default: continue solo
          }
        }, 1000);
        var continueBtn = dialogEl.querySelector('#coop-partner-left-continue');
        var quitBtn = dialogEl.querySelector('#coop-partner-left-quit');
        if (continueBtn) {
          continueBtn.onclick = function () {
            clearInterval(timerHandle);
            dialogEl.style.display = 'none';
            isCoopMode = false;
          };
        }
        if (quitBtn) {
          quitBtn.onclick = function () {
            clearInterval(timerHandle);
            dialogEl.style.display = 'none';
            if (typeof resetGame === 'function') resetGame();
            else location.reload();
          };
        }
      }

      // ── Handle pieces from DO ──
      coop.on('piece', function (data) {
        if (isCoopMode) {
          coopPieceQueue.push(data);
        }
      });

      // ── Incoming difficulty change from host ──
      coop.on('difficulty', function (msg) {
        if (!msg || !msg.level) return;
        _applyCoopDifficulty(msg.level);
        // Update guest read-only display
        var guestLabel = document.getElementById('coop-diff-guest-label');
        if (guestLabel) guestLabel.textContent = msg.level.toUpperCase();
        // Also update host's selected button (in case message was echoed back)
        if (coop.isHost) _setDiffButtonSelected(msg.level);
      });

      // ── Incoming ready signal from partner ──
      coop.on('player_ready', function () {
        if (coop.isHost) {
          _coopGuestReady = true;
          _updateReadyIndicators();
          // If host already clicked Ready, start the game now
          if (_coopHostReady) {
            coop.send({ type: 'game_start', difficulty: coopDifficulty, isDaily: isDailyCoopChallenge });
            _startCoopGame();
          }
        } else {
          _coopHostReady = true;
          _updateReadyIndicators();
          // Guest waits — host will send game_start
        }
      });

      // ── Guest: start game when DO relays host's game_start ──
      coop.on('game_start', function (msg) {
        if (coop.state !== CoopState.IN_GAME) {
          // Apply difficulty sent by host
          if (msg && msg.difficulty) _applyCoopDifficulty(msg.difficulty);
          isCoopMode = true;
          isDailyChallenge = false;
          isDailyCoopChallenge = !!(msg && msg.isDaily);
          gameRng = isDailyCoopChallenge ? getDailyPrng() : null;
          coopPieceQueue.length = 0;
          _initCoopHUD();
          // Guest spawns 3 blocks away from host, both facing +Z
          camera.position.set(3, PLAYER_HEIGHT, 0);
          if (typeof coopAvatar !== 'undefined') coopAvatar.init('Partner');
          if (typeof coopTrade !== 'undefined') coopTrade.showFirstRunHint();
          if (typeof coopEmote !== 'undefined') coopEmote.showHud(true);
          coop.startGame();
          if (coopOverlay) coopOverlay.style.display = "none";
          applyWorldModifierHUD();
          setTimeout(function () { requestPointerLock(); }, 500);
        }
      });

      // ── Incoming partner position broadcasts ──
      coop.on('pos', function (data) {
        // Track raw partner position for proximity checks (e.g. trade)
        coopPartnerLastPos = { x: data.x, y: data.y, z: data.z };
        if (isCoopMode && typeof coopAvatar !== 'undefined') {
          coopAvatar.receivePosition(
            data.x, data.y, data.z, data.rotY, data.rotX
          );
        }
      });

      // ── Incoming emotes from partner ──
      coop.on('emote', function (data) {
        if (!isCoopMode) return;
        if (typeof coopEmote !== 'undefined') coopEmote.receiveEmote(data);
      });

      // ── Destroy avatar when partner disconnects ──
      coop.on('partner_left', function () {
        if (typeof coopAvatar !== 'undefined') coopAvatar.destroy();
        if (typeof coopEmote !== 'undefined') { coopEmote.reset(); coopEmote.showHud(false); }
      });
      coop.on('disconnected', function () {
        if (typeof coopAvatar !== 'undefined') coopAvatar.destroy();
        if (typeof coopEmote !== 'undefined') { coopEmote.reset(); coopEmote.showHud(false); }
      });

      // ── Incoming world-state mutations from partner ──
      coop.on('world', function (msg) {
        if (!isCoopMode) return;
        if (msg.action === 'break') {
          var _wb = _findBlockAtGrid(msg.pos[0], msg.pos[1], msg.pos[2]);
          if (!_wb) return;
          spawnDustParticles(_wb, { breakBurst: true });
          unregisterBlock(_wb);
          worldGroup.remove(_wb);
          var _obIdx = obsidianBlocks.indexOf(_wb);
          if (_obIdx !== -1) obsidianBlocks.splice(_obIdx, 1);
        } else if (msg.action === 'place') {
          var _px = msg.pos[0], _py = msg.pos[1], _pz = msg.pos[2];
          var _layer = gridOccupancy.get(_py);
          if (_layer && _layer.has(_px + ',' + _pz)) return; // already occupied
          var _pb = createBlockMesh(new THREE.Color(msg.color));
          _pb.name = 'landed_block';
          _pb.position.set(_px, _py, _pz);
          worldGroup.add(_pb);
          registerBlock(_pb);
          checkLineClear([_pb]);
        } else if (msg.action === 'land') {
          // Reconciliation: add any blocks the partner landed that we're missing
          if (!Array.isArray(msg.blocks)) return;
          msg.blocks.forEach(function (b) {
            var _lx = b.pos[0], _ly = b.pos[1], _lz = b.pos[2];
            var _ll = gridOccupancy.get(_ly);
            if (_ll && _ll.has(_lx + ',' + _lz)) return; // already exists locally
            var _lb = createBlockMesh(new THREE.Color(b.color));
            _lb.name = 'landed_block';
            _lb.position.set(_lx, _ly, _lz);
            worldGroup.add(_lb);
            registerBlock(_lb);
          });
        }
      });

      // ── Incoming line-clear events from partner ──
      coop.on('line_clear', function (msg) {
        if (!isCoopMode) return;
        // Achievement: sync line-clear (track partner timestamp regardless of guard)
        if (typeof achOnCoopPartnerLineClear === 'function') achOnCoopPartnerLineClear(Date.now());
        // Guard: if local detection already processed these rows, skip
        if (typeof _coopLineClearGuardHas === 'function' && _coopLineClearGuardHas(msg.rows)) return;
        // Fallback: local detection didn't fire, so score the partner's line clear
        if (typeof addScore === 'function' && typeof msg.score === 'number') {
          addScore(msg.score);
        }
      });

      // ── Incoming score delta from partner ──
      coop.on('score', function (msg) {
        if (!isCoopMode) return;
        if (typeof msg.delta !== 'number') return;
        coopScore += msg.delta;
        coopPartnerScore += msg.delta;
        if (typeof updateCoopScoreHUD === 'function') updateCoopScoreHUD();
      });

      // ── Incoming height broadcast from partner ──
      coop.on('height', function (msg) {
        if (!isCoopMode) return;
        if (typeof msg.maxY === 'number') {
          coopPartnerMaxY = msg.maxY;
          coopPartnerLastSeenTime = performance.now();
          coopPartnerStatus = 'connected';
          if (typeof updateCoopPartnerStatus === 'function') updateCoopPartnerStatus();
        }
      });

      // ── Incoming game_over broadcast from partner ──
      coop.on('game_over', function () {
        if (!isCoopMode) return;
        if (typeof coopEmote !== 'undefined') coopEmote.showHud(false);
        if (!isGameOver && typeof triggerGameOver === 'function') {
          triggerGameOver();
        }
      });

      // ── Incoming game_end_stats from partner ──
      coop.on('game_end_stats', function (msg) {
        if (!isCoopMode) return;
        coopPartnerBlocksMined    = (typeof msg.blocksMined    === 'number') ? msg.blocksMined    : 0;
        coopPartnerLinesTriggered = (typeof msg.linesTriggered === 'number') ? msg.linesTriggered : 0;
        coopPartnerCraftsMade     = (typeof msg.craftsMade     === 'number') ? msg.craftsMade     : 0;
        coopPartnerTradesCompleted= (typeof msg.tradesCompleted=== 'number') ? msg.tradesCompleted: 0;
        coopPartnerName           = msg.name || 'Partner';
        coopStatsReceived = true;
        // If guest, reply with our own stats now
        if (!coop.isHost) {
          coop.send({
            type: 'game_end_stats',
            blocksMined:     coopMyBlocksMined,
            linesTriggered:  coopMyLinesTriggered,
            craftsMade:      coopMyCraftsMade,
            tradesCompleted: coopMyTradesCompleted,
            name: typeof loadDisplayName === 'function' ? (loadDisplayName() || 'You') : 'You',
          });
        }
        // Refresh the summary screen now that we have full data
        if (typeof _refreshCoopGameOver === 'function') _refreshCoopGameOver();

        // Auto-submit co-op score if both players have display names set
        var _myDisplayName = typeof loadDisplayName === 'function' ? loadDisplayName() : '';
        var _partnerDisplayName = coopPartnerName && coopPartnerName !== 'Partner' ? coopPartnerName : '';
        if (_myDisplayName && _partnerDisplayName && typeof apiSubmitCoopScore === 'function') {
          var _lbFeedbackEl = document.getElementById('coop-go-lb-feedback');
          var _rankEl = document.getElementById('coop-go-rank');
          if (_lbFeedbackEl) { _lbFeedbackEl.textContent = 'Submitting score…'; _lbFeedbackEl.style.display = 'block'; }
          apiSubmitCoopScore(_myDisplayName, _partnerDisplayName, coopScore, coopDifficulty, isDailyCoopChallenge)
            .then(function (result) {
              if (result && result.ok) {
                if (_rankEl) {
                  _rankEl.textContent = 'You are #' + result.rank + ' today!';
                  _rankEl.style.display = 'block';
                }
                if (_lbFeedbackEl) _lbFeedbackEl.style.display = 'none';
                // Save daily coop best locally
                if (isDailyCoopChallenge) {
                  try {
                    var _today = typeof getDailyDateString === 'function' ? getDailyDateString() : '';
                    var _existing = JSON.parse(localStorage.getItem('mineCtris_coopDailyBest') || 'null');
                    if (!_existing || _existing.date !== _today || coopScore > _existing.score) {
                      localStorage.setItem('mineCtris_coopDailyBest', JSON.stringify({
                        date: _today,
                        score: coopScore,
                        partner: _partnerDisplayName,
                      }));
                    }
                  } catch (_e) {}
                }
              } else {
                var _msg = (result && result.error) || 'Could not submit score';
                if (_lbFeedbackEl) { _lbFeedbackEl.textContent = _msg; _lbFeedbackEl.style.display = 'block'; }
              }
            })
            .catch(function () {
              if (_lbFeedbackEl) { _lbFeedbackEl.textContent = 'Network error'; _lbFeedbackEl.style.display = 'block'; }
            });
        }
      });

      // ── Incoming trade messages ──
      coop.on('trade_offer', function (msg) {
        if (!isCoopMode) return;
        if (typeof coopTrade !== 'undefined') coopTrade.onTradeOffer(msg);
      });
      coop.on('trade_accept', function (msg) {
        if (!isCoopMode) return;
        if (typeof coopTrade !== 'undefined') coopTrade.onTradeAccept(msg);
      });
      coop.on('trade_cancel', function () {
        if (!isCoopMode) return;
        if (typeof coopTrade !== 'undefined') coopTrade.onTradeCancel();
      });

      // ── Partner left mid-game: show continue/quit choice ──
      coop.on('partner_left', function () {
        if (!isCoopMode || isGameOver) return;
        _showCoopPartnerLeftDialog();
      });

      var readyCancelBtn = document.getElementById("coop-ready-cancel-btn");
      if (readyCancelBtn) {
        readyCancelBtn.addEventListener("click", function () { closeCoopOverlay(); });
      }

      // ── Auto-show join dialog if ?room=CODE in URL ──
      (function () {
        var params = new URLSearchParams(window.location.search);
        var roomParam = params.get("room");
        if (roomParam && /^[A-Z0-9]{4}$/i.test(roomParam)) {
          // Wait for DOM to settle then open join dialog pre-filled
          setTimeout(function () {
            openCoopOverlay("join");
            var ci = document.getElementById("coop-code-input");
            if (ci) ci.value = roomParam.toUpperCase();
            var joinStatusEl = document.getElementById("coop-join-status-msg");
            if (joinStatusEl) joinStatusEl.textContent = "Code from invite link — press Join!";
          }, 200);
        }
      })();

      // ── Co-op game-over screen buttons ──
      (function () {
        function _resetForCoopReplay() {
          // Reset game world and state but keep the WebSocket alive
          _coopHostReady = false;
          _coopGuestReady = false;
          resetGame();
          // resetGame() shows the start blocker — override to show coop ready view
          var startScreen = document.getElementById('blocker');
          if (startScreen) startScreen.style.display = 'none';
          var startBtnEl = document.getElementById('coop-start-btn');
          if (startBtnEl) { startBtnEl.disabled = false; startBtnEl.textContent = 'Ready!'; }
          _updateReadyIndicators();
          coopOverlay.style.display = 'flex';
          showCoopView('ready');
        }

        var playAgainBtn = document.getElementById('coop-go-play-again-btn');
        if (playAgainBtn) {
          playAgainBtn.addEventListener('click', function () {
            _resetForCoopReplay();
          });
        }

        var changeDiffBtn = document.getElementById('coop-go-change-diff-btn');
        if (changeDiffBtn) {
          changeDiffBtn.addEventListener('click', function () {
            _resetForCoopReplay();
          });
        }

        var mainMenuBtn = document.getElementById('coop-go-main-menu-btn');
        if (mainMenuBtn) {
          mainMenuBtn.addEventListener('click', function () {
            coop.disconnect();
            resetGame();
          });
        }

        var shareBtn = document.getElementById('coop-go-share-btn');
        if (shareBtn) {
          shareBtn.addEventListener('click', function () {
            var myName = (typeof loadDisplayName === 'function' ? loadDisplayName() : '') || 'You';
            var partnerName = coopPartnerName || 'Partner';
            var totalSecs = Math.floor(gameElapsedSeconds);
            var mm = Math.floor(totalSecs / 60).toString().padStart(2, '0');
            var ss = (totalSecs % 60).toString().padStart(2, '0');
            var mvpCol = typeof _getCoopMVP === 'function' ? _getCoopMVP(myName, partnerName) : 'tie';
            var mvpName = mvpCol === 'me' ? myName : mvpCol === 'partner' ? partnerName : null;
            var shareText = 'MineCtris Co-op\n' +
              myName + ' + ' + partnerName + '\n' +
              'Combined Score: ' + coopScore.toLocaleString() + '\n' +
              (mvpName ? 'MVP: ' + mvpName + '\n' : 'Perfect Partnership!\n') +
              'Survived: ' + mm + ':' + ss;
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(shareText).then(function () {
                shareBtn.textContent = 'Copied!';
                setTimeout(function () { shareBtn.textContent = 'Share Run'; }, 1500);
              }).catch(function () {
                prompt('Copy your share card:', shareText);
              });
            } else {
              prompt('Copy your share card:', shareText);
            }
          });
        }
      })();
    })();
    // ── End co-op setup ────────────────────────────────────────────────────────

    // ── Battle mode card + lobby overlay ──────────────────────────────────────
    (function () {
      var battleOverlay    = document.getElementById("battle-overlay");
      var battleChoiceView = document.getElementById("battle-choice-view");
      var battleCreateView = document.getElementById("battle-create-view");
      var battleJoinView   = document.getElementById("battle-join-view");
      var battleReadyView  = document.getElementById("battle-ready-view");

      if (!battleOverlay || typeof battle === "undefined") return;

      function showBattleView(name) {
        [battleChoiceView, battleCreateView, battleJoinView, battleReadyView].forEach(function (v) {
          if (v) v.style.display = "none";
        });
        var target = {
          choice: battleChoiceView,
          create: battleCreateView,
          join:   battleJoinView,
          ready:  battleReadyView,
        }[name];
        if (target) target.style.display = "";
      }

      function openBattleOverlay(initialView) {
        hideModeSelect();
        blocker.style.display = "none";
        showBattleView(initialView || "choice");
        battleOverlay.style.display = "flex";
      }

      function closeBattleOverlay() {
        battleOverlay.style.display = "none";
        battle.disconnect();
        blocker.style.display = "flex";
        instructions.style.display = "";
      }

      // Battle mode card click
      var battleCardEl = document.getElementById("mode-card-battle");
      if (battleCardEl) {
        battleCardEl.addEventListener("click", function () {
          openBattleOverlay("choice");
        });
      }

      // ── Ready state tracking ──
      var _battleHostReady  = false;
      var _battleGuestReady = false;
      // Match mode selected by host (default: survival)
      var _battleSelectedMode = 'survival';

      function _updateBattleReadyIndicators() {
        var hostEl  = document.getElementById("battle-host-ready-indicator");
        var guestEl = document.getElementById("battle-guest-ready-indicator");
        var label   = battle.isHost ? "You" : "Opponent";
        var otherLabel = battle.isHost ? "Opponent" : "You";
        if (hostEl) {
          hostEl.textContent  = (_battleHostReady  ? "\u2611" : "\u2633") + " " + label;
          hostEl.className    = _battleHostReady  ? "ready" : "";
        }
        if (guestEl) {
          guestEl.textContent = (_battleGuestReady ? "\u2611" : "\u2633") + " " + otherLabel;
          guestEl.className   = _battleGuestReady ? "ready" : "";
        }
      }

      // ── Register battle state-change handler ──
      battle.on("state_change", function (data) {
        if (data.state === "ready") {
          var readyCodeEl = document.getElementById("battle-ready-code");
          if (readyCodeEl) readyCodeEl.textContent = "Room: " + (data.roomCode || "");
          _battleHostReady  = false;
          _battleGuestReady = false;
          _setBattleMode('survival');
          _updateBattleReadyIndicators();
          _setupReadyViewModeUI();
          showBattleView("ready");
        } else if (data.state === "disconnected") {
          // If battle result screen is showing, let it handle the return-to-lobby flow
          var resultEl = document.getElementById("battle-result-screen");
          if (resultEl && resultEl.style.display !== "none") return;
          closeBattleOverlay();
        }
      });

      battle.on("timeout", function () {
        var statusEl = document.getElementById("battle-status-msg");
        if (statusEl) statusEl.textContent = "No one joined. Room closed.";
        setTimeout(function () { closeBattleOverlay(); }, 2000);
      });

      battle.on("opponent_left", function () {
        // If mid-game, surviving player wins automatically
        if (battle.state === BattleState.IN_GAME && !isGameOver) {
          if (typeof triggerBattleResult === 'function') triggerBattleResult('win');
        }
        if (typeof battleHud !== 'undefined') battleHud.setConnectionStatus('red');
      });

      // ── Choice view buttons ──
      var battleCreateBtn = document.getElementById("battle-create-btn");
      if (battleCreateBtn) {
        battleCreateBtn.addEventListener("click", function () {
          showBattleView("create");
          var roomCodeEl   = document.getElementById("battle-room-code");
          var statusMsg    = document.getElementById("battle-status-msg");
          var copyFeedback = document.getElementById("battle-copy-feedback");
          if (roomCodeEl)   roomCodeEl.textContent   = "\u2026";
          if (statusMsg)    statusMsg.textContent    = "";
          if (copyFeedback) copyFeedback.textContent = "";
          battle.createRoom().then(function (code) {
            if (roomCodeEl) roomCodeEl.textContent = code;
          }).catch(function () {
            if (statusMsg) statusMsg.textContent = "Failed to create room.";
          });
        });
      }

      var battleJoinBtnChoice = document.getElementById("battle-join-btn-choice");
      if (battleJoinBtnChoice) {
        battleJoinBtnChoice.addEventListener("click", function () {
          showBattleView("join");
          var joinStatusEl = document.getElementById("battle-join-status-msg");
          if (joinStatusEl) joinStatusEl.textContent = "";
          var codeInput = document.getElementById("battle-code-input");
          if (codeInput) { codeInput.value = ""; codeInput.focus(); }
        });
      }

      var battleQmBtn = document.getElementById("battle-quickmatch-btn");
      if (battleQmBtn) {
        battleQmBtn.addEventListener("click", function () {
          showBattleView("create");
          var roomCodeEl   = document.getElementById("battle-room-code");
          var statusMsg    = document.getElementById("battle-status-msg");
          var waitingEl    = document.getElementById("battle-waiting-spinner");
          if (roomCodeEl) roomCodeEl.textContent = "\u2026";
          if (statusMsg)  statusMsg.textContent  = "";
          battle.quickMatch().then(function (data) {
            if (data.waiting) {
              // We are host waiting for an opponent
              if (roomCodeEl) roomCodeEl.textContent = data.roomCode;
              if (waitingEl) waitingEl.textContent = "\u9696 Quick match \u2014 waiting for opponent\u2026";
            } else {
              // Joining opponent's room as guest
              if (roomCodeEl) roomCodeEl.textContent = data.roomCode;
              if (waitingEl) waitingEl.textContent = "\u9696 Found opponent \u2014 connecting\u2026";
            }
          }).catch(function () {
            if (statusMsg) statusMsg.textContent = "Quick match failed. Try again.";
          });
        });
      }

      var battleChoiceCancelBtn = document.getElementById("battle-choice-cancel-btn");
      if (battleChoiceCancelBtn) {
        battleChoiceCancelBtn.addEventListener("click", function () {
          closeBattleOverlay();
        });
      }

      // ── Create view buttons ──
      var battleCopyLinkBtn = document.getElementById("battle-copy-link-btn");
      if (battleCopyLinkBtn) {
        battleCopyLinkBtn.addEventListener("click", function () {
          var code = battle.roomCode;
          if (!code) return;
          var url = window.location.origin + window.location.pathname + "?battle=" + code;
          var feedbackEl = document.getElementById("battle-copy-feedback");
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function () {
              if (feedbackEl) {
                feedbackEl.textContent = "\u2713 Copied!";
                setTimeout(function () { feedbackEl.textContent = ""; }, 2000);
              }
            }).catch(function () { window.prompt("Copy invite link:", url); });
          } else {
            window.prompt("Copy invite link:", url);
          }
        });
      }

      var battleCreateCancelBtn = document.getElementById("battle-create-cancel-btn");
      if (battleCreateCancelBtn) {
        battleCreateCancelBtn.addEventListener("click", function () { closeBattleOverlay(); });
      }

      // ── Join view ──
      var battleCodeInput = document.getElementById("battle-code-input");
      if (battleCodeInput) {
        battleCodeInput.addEventListener("input", function () {
          this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
        });
        battleCodeInput.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            var confirmBtn = document.getElementById("battle-join-confirm-btn");
            if (confirmBtn) confirmBtn.click();
          }
        });
      }

      var battleJoinConfirmBtn = document.getElementById("battle-join-confirm-btn");
      if (battleJoinConfirmBtn) {
        battleJoinConfirmBtn.addEventListener("click", function () {
          var code = battleCodeInput ? battleCodeInput.value.trim().toUpperCase() : "";
          var joinStatusEl = document.getElementById("battle-join-status-msg");
          if (!code || code.length !== 4) {
            if (joinStatusEl) joinStatusEl.textContent = "Enter a 4-character code.";
            return;
          }
          if (joinStatusEl) joinStatusEl.textContent = "Joining\u2026";
          battle.joinRoom(code).then(function () {
            if (joinStatusEl) joinStatusEl.textContent = "";
            showBattleView("create");
            var roomCodeEl = document.getElementById("battle-room-code");
            if (roomCodeEl) roomCodeEl.textContent = code;
            var waitingEl = document.getElementById("battle-waiting-spinner");
            if (waitingEl) waitingEl.textContent = "\u9696 Connected \u2014 waiting for opponent\u2026";
          }).catch(function (err) {
            if (joinStatusEl) joinStatusEl.textContent = (err && err.message) ? err.message : "Failed to join.";
          });
        });
      }

      var battleJoinCancelBtn = document.getElementById("battle-join-cancel-btn");
      if (battleJoinCancelBtn) {
        battleJoinCancelBtn.addEventListener("click", function () {
          battle.disconnect();
          showBattleView("choice");
        });
      }

      // ── Ready view ──
      var battleStartBtn = document.getElementById("battle-start-btn");
      if (battleStartBtn) {
        battleStartBtn.addEventListener("click", function () {
          battleStartBtn.disabled = true;
          battleStartBtn.textContent = "Waiting\u2026";
          if (battle.isHost) {
            _battleHostReady = true;
          } else {
            _battleGuestReady = true;
          }
          _updateBattleReadyIndicators();
          battle.send({ type: "battle_ready" });
        });
      }

      // Opponent signals ready
      battle.on("battle_ready", function () {
        if (battle.isHost) {
          _battleGuestReady = true;
        } else {
          _battleHostReady = true;
        }
        _updateBattleReadyIndicators();
        // If both ready, host starts the game
        if (_battleHostReady && _battleGuestReady && battle.isHost) {
          battle.send({ type: "battle_start", matchMode: _battleSelectedMode });
          battleMatchMode = _battleSelectedMode;
          _startBattleGame();
        }
      });

      // Guest receives battle_start from host (includes match mode)
      battle.on("battle_start", function (msg) {
        if (!battle.isHost) {
          battleMatchMode = msg.matchMode || 'survival';
          _startBattleGame();
        }
      });

      // Handle opponent's game-over broadcast → this player wins
      battle.on("battle_game_over", function (msg) {
        if (msg && msg.stats) battleOpponentStats = msg.stats;
        if (!isGameOver && isBattleMode) {
          if (typeof triggerBattleResult === 'function') triggerBattleResult('win');
        }
      });

      function _runBattleCountdown(onComplete) {
        var countdownEl = document.getElementById("battle-countdown-overlay");
        var numberEl    = document.getElementById("battle-countdown-number");
        if (!countdownEl || !numberEl) { onComplete(); return; }

        var steps = ["3", "2", "1", "GO!"];
        var idx   = 0;

        countdownEl.style.display = "flex";

        function _showStep() {
          if (idx >= steps.length) {
            countdownEl.style.display = "none";
            onComplete();
            return;
          }
          var txt = steps[idx++];
          numberEl.textContent = txt;
          numberEl.className   = (txt === "GO!") ? "go" : "";
          // Re-trigger CSS animation each step
          numberEl.style.animation = "none";
          void numberEl.offsetWidth;
          numberEl.style.animation = "";
          setTimeout(_showStep, 900);
        }
        _showStep();
      }

      function _startBattleGame() {
        var _mode = battleMatchMode; // capture before resetGame clears it
        battle.startGame();
        battleOverlay.style.display = "none";

        // Reset world and set battle mode flags before the countdown
        resetGame();
        isBattleMode = true;
        battleMatchMode = _mode; // restore after resetGame reset it to 'survival'
        battleScoreRaceRemainingMs = 180000;
        battleOpponentScore = 0;
        battleOpponentLines = 0;
        // Start at Level 3 equivalent speed; escalates via updateDifficulty offset
        difficultyMultiplier = BATTLE_START_MULTIPLIER;
        lastDifficultyTier   = BATTLE_START_TIER;

        // Show battle HUD badge and opponent mini-map
        var battleBadgeEl = document.getElementById("battle-mode-badge");
        if (battleBadgeEl) battleBadgeEl.style.display = "block";
        if (typeof battleHud !== 'undefined') {
          battleHud.show();
          battleHud.setConnectionStatus('green');
        }

        // Show Score Race timer HUD if needed
        var srHudEl = document.getElementById("battle-score-race-hud");
        if (srHudEl) srHudEl.style.display = (battleMatchMode === 'score_race') ? '' : 'none';
        if (battleMatchMode === 'score_race' && typeof _updateScoreRaceTimerHud === 'function') {
          _updateScoreRaceTimerHud();
        }

        // Run 3-2-1-GO! then hand control to the player
        _runBattleCountdown(function () {
          requestPointerLock();
        });
      }

      // ── Opponent mini-map event handlers ──
      battle.on("battle_board", function (msg) {
        if (typeof battleHud !== 'undefined') {
          battleHud.update(msg.cols, msg.score, msg.level);
        }
        // Cache opponent's latest score/lines for Score Race comparison
        if (typeof msg.score === 'number') battleOpponentScore = msg.score;
        if (typeof msg.linesCleared === 'number') battleOpponentLines = msg.linesCleared;
      });

      battle.on("battle_attack", function (msg) {
        // Counter power-up: absorb and reflect at 50% (min 1 row)
        if (counterActive) {
          counterActive = false;
          const reflectRows = Math.max(1, Math.ceil((msg.lines || 1) * 0.5));
          const reflectSeed = Math.floor(Math.random() * 0xffffffff) >>> 0;
          battle.send({ type: 'battle_attack', lines: reflectRows, gapSeed: reflectSeed });
          battleGarbageSent += reflectRows;
          if (typeof battleHud !== 'undefined') {
            battleHud.showOutgoingAttack(reflectRows);
          }
          showCraftedBanner("Counter! Reflected " + reflectRows + " row(s).");
          if (typeof updatePowerupHUD === 'function') updatePowerupHUD();
          return; // do not queue the incoming garbage
        }
        if (typeof battleHud !== 'undefined') {
          battleHud.flashLineClear();
          battleHud.showGarbage();
        }
        // Queue the incoming garbage rows for delivery on the next piece spawn.
        battleGarbageReceived += (msg.lines || 1);
        if (typeof queueGarbage === 'function') {
          queueGarbage(msg.lines || 1, msg.gapSeed || 1);
        }
        // Incoming attack vignette flash + thud SFX
        if (typeof battleFx !== 'undefined') battleFx.showIncomingAttack(msg.lines || 1);
      });

      var battleReadyCancelBtn = document.getElementById("battle-ready-cancel-btn");
      if (battleReadyCancelBtn) {
        battleReadyCancelBtn.addEventListener("click", function () { closeBattleOverlay(); });
      }

      // ── Mode toggle (host only in ready view) ──
      var _battleModeSurvivalBtn  = document.getElementById("battle-mode-survival-btn");
      var _battleModeScoreRaceBtn = document.getElementById("battle-mode-score-race-btn");
      var _battleModeToggleHost   = document.getElementById("battle-mode-toggle-host");
      var _battleModeDisplayGuest = document.getElementById("battle-mode-display-guest");

      function _setBattleMode(mode) {
        _battleSelectedMode = mode;
        if (_battleModeSurvivalBtn)  _battleModeSurvivalBtn.classList.toggle('active',  mode === 'survival');
        if (_battleModeScoreRaceBtn) _battleModeScoreRaceBtn.classList.toggle('active', mode === 'score_race');
        if (_battleModeDisplayGuest) {
          _battleModeDisplayGuest.textContent = mode === 'score_race' ? '\u23f1 Score Race' : '\u2694 Survival';
        }
      }

      if (_battleModeSurvivalBtn) {
        _battleModeSurvivalBtn.addEventListener("click", function () {
          _setBattleMode('survival');
          battle.send({ type: 'battle_mode', mode: 'survival' });
        });
      }
      if (_battleModeScoreRaceBtn) {
        _battleModeScoreRaceBtn.addEventListener("click", function () {
          _setBattleMode('score_race');
          battle.send({ type: 'battle_mode', mode: 'score_race' });
        });
      }

      // Guest receives live mode updates from host
      battle.on("battle_mode", function (msg) {
        if (battle.isHost) return;
        _battleSelectedMode = msg.mode || 'survival';
        if (_battleModeDisplayGuest) {
          _battleModeDisplayGuest.textContent = _battleSelectedMode === 'score_race' ? '\u23f1 Score Race' : '\u2694 Survival';
        }
      });

      // When entering ready view, show appropriate mode controls
      function _setupReadyViewModeUI() {
        if (battle.isHost) {
          if (_battleModeToggleHost)   _battleModeToggleHost.style.display   = '';
          if (_battleModeDisplayGuest) _battleModeDisplayGuest.style.display = 'none';
        } else {
          if (_battleModeToggleHost)   _battleModeToggleHost.style.display   = 'none';
          if (_battleModeDisplayGuest) _battleModeDisplayGuest.style.display = '';
          _battleSelectedMode = 'survival';
          if (_battleModeDisplayGuest) _battleModeDisplayGuest.textContent = '\u2694 Survival';
        }
      }

      // Opponent score race end: opponent's timer expired; resolve if ours hasn't
      battle.on("battle_score_race_end", function (msg) {
        if (isGameOver || battleMatchMode !== 'score_race') return;
        battleOpponentScore = msg.score || 0;
        battleOpponentLines = msg.linesCleared || 0;
        if (msg && msg.stats) battleOpponentStats = msg.stats;
        if (battleScoreRaceRemainingMs > 0) {
          // Freeze our timer and resolve now
          battleScoreRaceRemainingMs = 0;
          if (typeof _updateScoreRaceTimerHud === 'function') _updateScoreRaceTimerHud();
          if (typeof _resolveScoreRace === 'function') {
            _resolveScoreRace(score, linesCleared, battleOpponentScore, battleOpponentLines);
          }
        }
        // If our timer already hit 0, triggerBattleResult was already called — no-op
      });

    })();
    // ── End battle setup ───────────────────────────────────────────────────────

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

    // Custom puzzle load screen play button
    const cplsPlayBtn = document.getElementById("cpls-play-btn");
    if (cplsPlayBtn) {
      cplsPlayBtn.addEventListener("click", function () {
        const screen = document.getElementById("custom-puzzle-load-screen");
        if (screen) screen.style.display = "none";
        requestPointerLock();
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
        if (isCustomPuzzleMode) {
          // Retry custom puzzle — preserve layout, win condition, and piece sequence
          const savedLayout = customPuzzleLayout.slice();
          const savedWC = customPuzzleWinCondition ? Object.assign({}, customPuzzleWinCondition) : null;
          const savedPS = customPieceSequence ? { mode: customPieceSequence.mode, pieces: customPieceSequence.pieces.slice() } : { mode: "random", pieces: [] };
          resetGame();
          customPuzzleLayout = savedLayout;
          customPuzzleWinCondition = savedWC;
          customPieceSequence = savedPS;
          isCustomPuzzleMode = true;
          puzzleComplete = false;
          difficultyMultiplier = 0.5;
          lastDifficultyTier = 0;
          requestPointerLock();
        } else {
          const currentPuzzleId = puzzlePuzzleId;
          resetGame();
          isPuzzleMode = true;
          puzzlePuzzleId = currentPuzzleId;
          puzzleComplete = false;
          difficultyMultiplier = 0.5;
          lastDifficultyTier = 0;
          requestPointerLock();
        }
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

    // Custom puzzle completion overlay — Share button (copies share URL to clipboard)
    const puzzleCompleteShareBtn = document.getElementById("puzzle-complete-share-btn");
    if (puzzleCompleteShareBtn) {
      puzzleCompleteShareBtn.addEventListener("click", function () {
        var url = this._puzzleShareUrl;
        if (!url && typeof encodeCustomPuzzleShareURL === "function") {
          url = encodeCustomPuzzleShareURL();
        }
        if (!url) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () {
            puzzleCompleteShareBtn.textContent = "\u2713 Copied!";
            setTimeout(function () { puzzleCompleteShareBtn.textContent = "\uD83D\uDD17 Copy Link"; }, 2000);
          }).catch(function () { window.prompt("Copy puzzle link:", url); });
        } else {
          window.prompt("Copy puzzle link:", url);
        }
      });
    }

    // Custom puzzle completion overlay — Edit button (return to editor with current layout)
    const puzzleCompleteEditBtn = document.getElementById("puzzle-complete-edit-btn");
    if (puzzleCompleteEditBtn) {
      puzzleCompleteEditBtn.addEventListener("click", function () {
        // Build a draft from the current custom puzzle layout so the editor restores it
        if (typeof customPuzzleLayout !== "undefined" && customPuzzleLayout.length > 0) {
          _pendingEditorDraft = {
            blocks: customPuzzleLayout.map(function (b) {
              return { x: b.x, y: b.y, z: b.z, color: parseInt((b.color || "#808080").replace("#", ""), 16) };
            }),
            winCondition: customPuzzleWinCondition ? Object.assign({}, customPuzzleWinCondition) : { mode: "mine_all", n: 10 },
            metadata: customPuzzleMetadata ? Object.assign({}, customPuzzleMetadata) : { name: "", description: "", author: "", difficulty: 0 },
            pieceSequence: customPieceSequence ? { mode: customPieceSequence.mode, pieces: customPieceSequence.pieces.slice() } : { mode: "random", pieces: [] },
          };
        }
        resetGame();
        isEditorMode = true;
        // Blocker is now visible; user clicks to re-enter editor with draft loaded
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

      // ── Editor mode: show editor HUD only, skip game setup ───────────────
      if (isEditorMode) {
        instructions.style.display = "none";
        blocker.style.display = "none";
        crosshair.style.display = "block";
        const editorHudEl = document.getElementById("editor-hud");
        if (editorHudEl) editorHudEl.style.display = "flex";
        if (typeof initEditorMode === "function") initEditorMode();
        if (typeof startBgMusic === "function") startBgMusic();
        return;
      }
      // ─────────────────────────────────────────────────────────────────────

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

      // Custom puzzle mode: place editor-built preset blocks, init piece queue
      if (isCustomPuzzleMode) {
        if (typeof resetPuzzleState === "function") resetPuzzleState();
        if (typeof setupCustomPuzzleLayout === "function") setupCustomPuzzleLayout();
        if (typeof initCustomPuzzlePieceQueue === "function") initCustomPuzzlePieceQueue();
        const badgeEl = document.getElementById("puzzle-badge");
        if (badgeEl) {
          badgeEl.style.display = "block";
          if (typeof updatePuzzleHUD === "function") updatePuzzleHUD();
        }
        // Reset the start button label if it was changed
        const startBtnEl = document.getElementById("start-random-btn");
        if (startBtnEl && startBtnEl.textContent.indexOf("Custom") !== -1) {
          startBtnEl.textContent = "Click to Start";
        }
      }

      // Built-in puzzle mode: place preset blocks and init fixed piece queue
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

      // ── Editor mode: hide editor HUD and return to main menu (or test puzzle) ─
      if (isEditorMode) {
        const editorHudEl = document.getElementById("editor-hud");
        if (editorHudEl) editorHudEl.style.display = "none";
        if (typeof cleanupEditorMode === "function") cleanupEditorMode();
        isEditorMode = false;
        moveUp = false;
        moveDown = false;
        crosshair.style.display = "none";
        if (_editorToCustomPuzzle) {
          _editorToCustomPuzzle = false;
          // Clear the world (resetGame does this) then launch custom puzzle
          resetGame();
          isCustomPuzzleMode = true;
          customPlayFromEditor = true;
          puzzleComplete = false;
          difficultyMultiplier = 0.5;
          lastDifficultyTier = 0;
          // The blocker is now visible — user clicks to start (requestPointerLock via blocker click)
          const startBtn = document.getElementById("start-random-btn");
          if (startBtn) startBtn.textContent = "\u25BA Play Custom Puzzle";
        } else {
          resetGame();
        }
        return;
      }
      // ─────────────────────────────────────────────────────────────────────

      // If the crafting panel or co-op trade panel intentionally released the lock, don't pause
      if (!craftingPanelOpen && !coopTradePanelOpen) {
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

  // ── Editor mode ────────────────────────────────────────────────────────────
  // "Create" button on main menu
  const startCreateBtn = document.getElementById("start-create-btn");
  if (startCreateBtn) {
    startCreateBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      isEditorMode = true;
      const draft = typeof loadEditorDraft === "function" ? loadEditorDraft() : null;
      if (draft && Array.isArray(draft.blocks) && draft.blocks.length > 0) {
        // Show draft prompt overlay; defer pointer lock until user responds
        const promptEl = document.getElementById("editor-draft-prompt");
        if (promptEl) promptEl.style.display = "flex";
      } else {
        blocker.style.display = "none";
        requestPointerLock();
      }
    });
  }

  // Community browser button
  const startCommunityBtn = document.getElementById("start-community-btn");
  if (startCommunityBtn) {
    startCommunityBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      blocker.style.display = "none";
      if (typeof openCommunityBrowser === "function") openCommunityBrowser();
    });
  }

  // Draft prompt — Load button
  const editorDraftLoadBtn = document.getElementById("editor-draft-load-btn");
  if (editorDraftLoadBtn) {
    editorDraftLoadBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      const promptEl = document.getElementById("editor-draft-prompt");
      if (promptEl) promptEl.style.display = "none";
      if (typeof loadEditorDraft === "function") {
        _pendingEditorDraft = loadEditorDraft();
      }
      blocker.style.display = "none";
      requestPointerLock();
    });
  }

  // Draft prompt — Start Fresh button
  const editorDraftFreshBtn = document.getElementById("editor-draft-fresh-btn");
  if (editorDraftFreshBtn) {
    editorDraftFreshBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      const promptEl = document.getElementById("editor-draft-prompt");
      if (promptEl) promptEl.style.display = "none";
      if (typeof clearEditorDraft === "function") clearEditorDraft();
      blocker.style.display = "none";
      requestPointerLock();
    });
  }

  // Clear Draft button (inside editor HUD)
  const editorClearDraftBtn = document.getElementById("editor-clear-draft-btn");
  if (editorClearDraftBtn) {
    editorClearDraftBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (typeof clearEditorDraft === "function") clearEditorDraft();
      editorClearDraftBtn.textContent = "\u2713 Cleared";
      setTimeout(function () { editorClearDraftBtn.textContent = "\uD83D\uDDD1 Clear Draft"; }, 1500);
    });
  }

  // Editor exit button (inside HUD)
  const editorExitBtn = document.getElementById("editor-exit-btn");
  if (editorExitBtn) {
    editorExitBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      controls.unlock(); // triggers unlock handler which resets editor mode
    });
  }

  // Editor "Test Puzzle" button — capture layout, exit editor, start custom puzzle
  let _editorToCustomPuzzle = false;
  const editorTestBtn = document.getElementById("editor-test-btn");
  if (editorTestBtn) {
    editorTestBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      // Capture current editor blocks as custom puzzle layout
      customPuzzleLayout = [];
      if (typeof worldGroup !== "undefined") {
        worldGroup.children.forEach(function (child) {
          if (child.name === "landed_block") {
            const wp = new THREE.Vector3();
            child.getWorldPosition(wp);
            let hexColor = "#808080";
            if (child.material && child.material.color) {
              hexColor = "#" + child.material.color.getHexString();
            }
            customPuzzleLayout.push({ x: wp.x, y: wp.y, z: wp.z, color: hexColor });
          }
        });
      }
      if (customPuzzleLayout.length === 0) {
        // Nothing to test — flash button
        editorTestBtn.textContent = "Place blocks first!";
        setTimeout(function () { editorTestBtn.textContent = "\u25BA Test Puzzle"; }, 1500);
        return;
      }
      customPuzzleWinCondition = {
        mode: (typeof editorWinCondition !== "undefined") ? editorWinCondition.mode : "mine_all",
        n:    (typeof editorWinCondition !== "undefined") ? editorWinCondition.n    : 10,
      };
      customPuzzleMetadata = (typeof editorPuzzleMetadata !== "undefined")
        ? { name: editorPuzzleMetadata.name, description: editorPuzzleMetadata.description,
            author: editorPuzzleMetadata.author, difficulty: editorPuzzleMetadata.difficulty }
        : { name: "", description: "", author: "", difficulty: 0 };
      customPieceSequence = (typeof editorPieceSequence !== "undefined")
        ? { mode: editorPieceSequence.mode, pieces: editorPieceSequence.pieces.slice() }
        : { mode: "random", pieces: [] };
      _editorToCustomPuzzle = true;
      controls.unlock();
    });
  }

  // Editor "Share" button — opens share modal with QR code + copy link
  const editorShareBtn = document.getElementById("editor-share-btn");
  if (editorShareBtn) {
    editorShareBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (typeof encodePuzzleShareCode !== "function") return;
      const code = encodePuzzleShareCode();
      if (!code) {
        editorShareBtn.textContent = "Nothing to share!";
        setTimeout(function () { editorShareBtn.textContent = "\uD83D\uDD17 Share"; }, 1500);
        return;
      }
      const url = location.origin + location.pathname + "?puzzle=" + encodeURIComponent(code);
      _openPuzzleShareModal(url);
    });
  }

  // Wire share modal close + copy + publish buttons
  (function () {
    var modal = document.getElementById("puzzle-share-modal");
    var closeBtn = document.getElementById("psm-close-btn");
    var copyBtn = document.getElementById("psm-copy-btn");
    var feedback = document.getElementById("psm-copy-feedback");
    if (closeBtn) closeBtn.addEventListener("click", function () { if (modal) modal.style.display = "none"; });
    if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) modal.style.display = "none"; });
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var input = document.getElementById("psm-url-input");
        if (!input) return;
        var url = input.value;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () {
            copyBtn.textContent = "\u2713 Copied!";
            if (feedback) feedback.textContent = "Link copied to clipboard!";
            setTimeout(function () {
              copyBtn.textContent = "\uD83D\uDD17 Copy Link";
              if (feedback) feedback.textContent = "";
            }, 2000);
          }).catch(function () {
            window.prompt("Copy puzzle link:", url);
          });
        } else {
          window.prompt("Copy puzzle link:", url);
        }
      });
    }

    // Publish to Community button
    var publishBtn = document.getElementById("psm-publish-btn");
    var publishFeedback = document.getElementById("psm-publish-feedback");
    if (publishBtn) {
      publishBtn.addEventListener("click", function () {
        var input = document.getElementById("psm-url-input");
        if (!input) return;
        var puzzleParam;
        try {
          puzzleParam = new URL(input.value).searchParams.get("puzzle");
        } catch (_) { return; }
        if (!puzzleParam) return;
        var code = decodeURIComponent(puzzleParam);

        // Get or generate creator ID
        var creatorId = localStorage.getItem("mineCtris_creatorId");
        if (!creatorId) {
          creatorId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
          });
          localStorage.setItem("mineCtris_creatorId", creatorId);
        }

        publishBtn.textContent = "Publishing\u2026";
        publishBtn.disabled = true;
        if (publishFeedback) publishFeedback.textContent = "";

        var workerUrl = (typeof LEADERBOARD_WORKER_URL !== "undefined")
          ? LEADERBOARD_WORKER_URL
          : "https://minectris-leaderboard.workers.dev";

        fetch(workerUrl + "/api/puzzles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: code }),
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.id) {
            // Track this puzzle ID so we can check play count achievements later
            var published;
            try { published = JSON.parse(localStorage.getItem("mineCtris_publishedPuzzles") || "[]"); } catch (_) { published = []; }
            if (published.indexOf(data.id) === -1) {
              published.push(data.id);
              localStorage.setItem("mineCtris_publishedPuzzles", JSON.stringify(published));
            }
            // Unlock Workshop Owner achievement
            if (typeof achOnPuzzlePublished === "function") achOnPuzzlePublished();
            publishBtn.textContent = "\u2713 Published!";
            if (publishFeedback) publishFeedback.textContent = "Your puzzle is live in the community!";
          } else {
            throw new Error(data.error || "Publish failed");
          }
        })
        .catch(function (err) {
          publishBtn.textContent = "\u{1F310} Publish to Community";
          publishBtn.disabled = false;
          if (publishFeedback) publishFeedback.textContent = "Could not publish. " + (err.message || "Try again.");
        });
      });
    }
  })();

  function _openPuzzleShareModal(url) {
    var modal = document.getElementById("puzzle-share-modal");
    if (!modal) return;
    var input = document.getElementById("psm-url-input");
    if (input) input.value = url;
    var copyBtn = document.getElementById("psm-copy-btn");
    if (copyBtn) copyBtn.textContent = "\uD83D\uDD17 Copy Link";
    var feedback = document.getElementById("psm-copy-feedback");
    if (feedback) feedback.textContent = "";
    // Reset publish button state
    var publishBtn = document.getElementById("psm-publish-btn");
    if (publishBtn) { publishBtn.textContent = "\u{1F310} Publish to Community"; publishBtn.disabled = false; }
    var publishFeedback = document.getElementById("psm-publish-feedback");
    if (publishFeedback) publishFeedback.textContent = "";
    // Render QR code
    var qrCanvas = document.getElementById("psm-qr-canvas");
    if (qrCanvas && typeof QRCanvas !== "undefined") {
      QRCanvas.draw(qrCanvas, url, { scale: 4, margin: 3 });
    }
    modal.style.display = "flex";
  }

  // Pre-set editor mode if ?editor=1 URL param is present
  const _urlParams = new URLSearchParams(window.location.search);
  if (_urlParams.get("editor") === "1") {
    isEditorMode = true;
  }

  // Load custom puzzle from ?puzzle= URL param
  const _puzzleParam = _urlParams.get("puzzle");
  if (_puzzleParam) {
    // Show loading indicator immediately while decoding
    (function () {
      var screen = document.getElementById("custom-puzzle-load-screen");
      var spinner = document.getElementById("cpls-spinner");
      var nameEl = document.getElementById("cpls-name");
      var playBtn = document.getElementById("cpls-play-btn");
      if (screen) screen.style.display = "flex";
      if (spinner) spinner.style.display = "";
      if (nameEl) nameEl.textContent = "";
      if (playBtn) playBtn.style.display = "none";
    })();

    // Use rich decoder for proper error messages when available, fall back to simple decoder.
    const _rawCode = decodeURIComponent(_puzzleParam);
    const _decodeResult = (typeof puzzleCodecDecode === "function")
      ? puzzleCodecDecode(_rawCode)
      : (typeof decodePuzzleShareCode === "function" && decodePuzzleShareCode(_rawCode)
          ? { ok: true, ...(decodePuzzleShareCode(_rawCode)) }
          : { ok: false, error: "Could not load puzzle.", versionMismatch: false });

    // Hide spinner
    (function () {
      var spinner = document.getElementById("cpls-spinner");
      if (spinner) spinner.style.display = "none";
      var screen = document.getElementById("custom-puzzle-load-screen");
      if (screen) screen.style.display = "none";
    })();

    if (_decodeResult.ok) {
      customPuzzleWinCondition = _decodeResult.winCondition;
      customPuzzleMetadata = _decodeResult.metadata || { name: "", description: "", author: "", difficulty: 0 };
      customPieceSequence = _decodeResult.pieceSequence || { mode: "random", pieces: [] };
      // Convert share code blocks [x, y, z, paletteIdx] to layout format
      customPuzzleLayout = _decodeResult.blocks.map(function (b) {
        let hexColor = "#808080";
        if (typeof EDITOR_PALETTE !== "undefined" && b[3] !== undefined) {
          const pi = b[3];
          if (pi >= 0 && pi < EDITOR_PALETTE.length) {
            hexColor = "#" + EDITOR_PALETTE[pi].hex.toString(16).padStart(6, "0");
          }
        }
        return { x: b[0], y: b[1], z: b[2], color: hexColor };
      });
      isCustomPuzzleMode = true;
      puzzleComplete = false;
      difficultyMultiplier = 0.5;
      lastDifficultyTier = 0;
      // Show puzzle load screen (skips main menu)
      _showCustomPuzzleLoadScreen();
    } else {
      // Show a friendly error instead of silently failing
      _showPuzzleDecodeError(_decodeResult.versionMismatch);
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

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
    if (typeof coopAvatar !== 'undefined') coopAvatar.onResize();
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
  // Co-op: broadcast block placement to partner
  if (isCoopMode && typeof coop !== 'undefined' && coop.state === CoopState.IN_GAME) {
    const _coopGp = block.userData.gridPos;
    if (_coopGp) {
      coop.send({ type: 'world', action: 'place', pos: [_coopGp.x, _coopGp.y, _coopGp.z], color: block.userData.canonicalColor });
    }
  }

  // Update HUD and check line-clear
  updateInventoryHUD();
  checkLineClear([block]);

  // Placement sound
  playPlaceSound();
  if (typeof tutorialNotify === "function") tutorialNotify("blockPlace");
}

function onMouseDown(event) {
  if (!controls || !controls.isLocked || isGameOver) return;
  // ── Editor mode: left-click places, right-click erases ───────────────────
  if (isEditorMode) {
    if (event.button === 0) {
      if (typeof editorPlaceBlock === "function") editorPlaceBlock();
    } else if (event.button === 2) {
      if (typeof editorEraseBlock === "function") editorEraseBlock();
    }
    return;
  }
  // ─────────────────────────────────────────────────────────────────────────
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
    // Obsidian Pickaxe: -1 hit to all blocks (min 1), stacks with Earthquake
    if (obsidianPickaxeActive) clicksNeeded = Math.max(1, clicksNeeded - 1);
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
    if (targetedBlock.userData.isRubble) {
      playRubbleHitSound();
    } else {
      playHitSound(objType);
    }

    if (!isBreak) {
      // Normal hit particles (rubble gets orange crack particles)
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

      const _isRubble = targetedBlock.userData.isRubble;

      // Per-material break sound
      if (_isRubble) {
        playRubbleBreakSound();
      } else {
        playBreakSound(objType);
      }
      // Break burst particles (rubble gets orange crack burst)
      spawnDustParticles(targetedBlock, { breakBurst: true });
      blocksMined++;
      if (isCoopMode) coopMyBlocksMined++;
      if (isBattleMode && _isRubble) battleRubbleMined++;
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

      // ── Rubble mining drop: 50/50 stone or dirt ─────────────────────────────
      if (_isRubble) {
        const _rubbleDropColor = Math.random() < 0.5 ? '#808080' : '#8b4513';
        const collected = addToInventory(_rubbleDropColor);
        if (!collected) {
          console.log("Inventory full — rubble drop discarded.");
        }
      } else {
        const blockColor =
          targetedBlock.userData.originalColor ||
          targetedBlock.material.color;
        const cssColor = threeColorToCss(blockColor);
        // Use the dropMaterial color if defined (e.g. obsidian → obsidian_shard)
        const _matType = targetedBlock.userData.materialType;
        const _dropMat = _matType && BLOCK_TYPES[_matType] && BLOCK_TYPES[_matType].dropMaterial;
        const _invColor = _dropMat === "obsidian_shard" ? OBSIDIAN_SHARD_COLOR : cssColor;
        const crumbles = targetedBlock.name === "leaf_block" && Math.random() < 0.2;
        if (!crumbles) {
          const collected = addToInventory(_invColor);
          if (!collected) {
            console.log("Inventory full — block discarded.");
          }
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

      // Co-op: broadcast block break to partner (capture gridPos before unregister clears it)
      if (isCoopMode && typeof coop !== 'undefined' && coop.state === CoopState.IN_GAME) {
        const _coopGp = targetedBlock.userData.gridPos;
        if (_coopGp) {
          coop.send({ type: 'world', action: 'break', pos: [_coopGp.x, _coopGp.y, _coopGp.z] });
        }
      }

      // Save rubble row Y before unregistering (used for full-row check below)
      const _rubbleRowY = _isRubble && targetedBlock.userData.gridPos
        ? targetedBlock.userData.gridPos.y : null;

      unregisterBlock(targetedBlock);
      worldGroup.remove(targetedBlock);
      // Remove from obsidian shimmer tracking if applicable
      const _obIdx = obsidianBlocks.indexOf(targetedBlock);
      if (_obIdx !== -1) obsidianBlocks.splice(_obIdx, 1);

      // ── Rubble row fully cleared → cancel one pending garbage attack ────────
      if (isBattleMode && _isRubble && _rubbleRowY !== null
          && typeof cancelOnePendingGarbage === 'function') {
        // Check if any rubble blocks remain at this Y level
        const _rubbleRemaining = worldGroup.children.some(function (obj) {
          return obj.name === 'landed_block'
            && obj.userData.isRubble
            && obj.userData.gridPos
            && obj.userData.gridPos.y === _rubbleRowY;
        });
        if (!_rubbleRemaining) {
          cancelOnePendingGarbage();
          console.log('Rubble row fully mined — cancelled one pending garbage attack.');
        }
      }

      // Diamond Pickaxe AOE — mine up to 4 adjacent blocks in a cross pattern
      if (pickaxeTier === "diamond" && _brokenBlock) {
        _applyDiamondAOE(_brokenBlock);
      }
      // Puzzle / custom puzzle mode: check win/lose after every mined block
      if ((isPuzzleMode || isCustomPuzzleMode) && typeof checkPuzzleConditions === "function") {
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
    if (isCoopMode) coopMyBlocksMined++;
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
    if (isCoopMode) coopMyBlocksMined++;
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
 * @param {"row-bomb"|"slow-down"|"shield"|"magnet"|"time-freeze"} type
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

/**
 * Apply or remove blue-white emissive glow on all currently falling pieces.
 * Called when Time Freeze activates or expires.
 * @param {boolean} on  true = apply glow, false = restore default emissive
 */
function _applyTimeFreezeGlow(on) {
  fallingPieces.forEach(function (piece) {
    piece.children.forEach(function (block) {
      if (!block.material) return;
      if (on) {
        block.material.emissive.setRGB(0.55, 0.85, 1.0);
      } else {
        block.material.emissive.setRGB(0, 0, 0);
      }
      block.material.needsUpdate = true;
    });
  });
}

/** Show/hide persistent power-up overlays based on current effect state. */
function updatePowerupOverlays() {
  const sdEl = document.getElementById("slowdown-overlay");
  const shEl = document.getElementById("shield-overlay");
  const mgEl = document.getElementById("magnet-overlay");
  const tfEl = document.getElementById("time-freeze-overlay");
  if (sdEl) sdEl.style.display = (!isGameOver && slowDownActive) ? "block" : "none";
  if (shEl && !shEl.classList.contains("absorb")) {
    shEl.style.display = (!isGameOver && shieldActive) ? "block" : "none";
  }
  if (mgEl) mgEl.style.display = (!isGameOver && magnetActive) ? "block" : "none";
  if (tfEl) tfEl.style.display = (!isGameOver && timeFreezeActive) ? "block" : "none";
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
    row_bomb:   { icon: "\uD83D\uDCA3", name: "Row Bomb"    },
    slow_down:  { icon: "\u23F1",        name: "Slow Down"  },
    shield:     { icon: "\uD83D\uDEE1",  name: "Shield"     },
    magnet:     { icon: "\uD83E\uDDF2",  name: "Magnet"     },
    time_freeze: { icon: "\u2744",       name: "Time Freeze" },
    sabotage:   { icon: "\uD83D\uDCA5",  name: "Sabotage"   },
    counter:    { icon: "\uD83D\uDEE1\u2194",  name: "Counter"    },
    fortress:   { icon: "\uD83D\uDEE1\u26EA", name: "Fortress"   },
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
        if (isCoopMode) coopMyBlocksMined++;
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
    case "time_freeze": {
      if (timeFreezeActive) {
        // Re-activation while active extends by 2s (no full reset)
        timeFreezeTimer += 2.0;
        showCraftedBanner("Time Freeze extended! +" + timeFreezeTimer.toFixed(0) + "s remaining.");
        // Don't consume from bank for extend — refund the decrement above
        bank[equippedPowerUpType]++;
        savePowerUpBank(bank);
        if (powerUps[equippedPowerUpType] < (bank[equippedPowerUpType] || 0)) powerUps[equippedPowerUpType]++;
      } else {
        timeFreezeActive = true;
        timeFreezeTimer  = 5.0;
        showCraftedBanner("Time Freeze! Pieces frozen for 5s.");
        _applyTimeFreezeGlow(true);
        _triggerPowerupFlash("time-freeze");
      }
      break;
    }
    case "sabotage": {
      // Send 2 extra garbage rows to opponent immediately
      if (isBattleMode && typeof battle !== 'undefined' && battle.state === BattleState.IN_GAME) {
        const _saboSeed = Math.floor(Math.random() * 0xffffffff) >>> 0;
        battle.send({ type: 'battle_attack', lines: 2, gapSeed: _saboSeed });
        battleGarbageSent += 2;
        if (typeof battleHud !== 'undefined') battleHud.showOutgoingAttack(2);
      }
      showCraftedBanner("Sabotage! 2 garbage rows sent.");
      _triggerPowerupFlash("sabotage");
      // Red edge-flash on local screen
      (function () {
        const el = document.getElementById("lc-flash-overlay");
        if (el) {
          el.style.backgroundColor = "#ff2200";
          el.style.transition = "none";
          el.style.opacity = "0.35";
          void el.offsetHeight;
          el.style.transition = "opacity 0.5s ease-out";
          el.style.opacity = "0";
        }
      }());
      break;
    }
    case "counter": {
      counterActive = true;
      showCraftedBanner("Counter active! Next attack reflected.");
      _triggerPowerupFlash("counter");
      break;
    }
    case "fortress": {
      fortressActive = true;
      fortressTimer  = 5.0;
      showCraftedBanner("Fortress! Garbage blocked for 5s.");
      _triggerPowerupFlash("fortress");
      break;
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
            if (isCoopMode) coopMyBlocksMined++;
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

    // Tick Time Freeze power-up timer
    if (timeFreezeActive) {
      timeFreezeTimer -= delta;
      if (timeFreezeTimer <= 0) {
        timeFreezeActive = false;
        timeFreezeTimer  = 0;
        _applyTimeFreezeGlow(false);
        if (typeof updatePowerupHUD === "function") updatePowerupHUD();
      }
    }

    // Tick Fortress power-up timer
    if (fortressActive) {
      fortressTimer -= delta;
      if (fortressTimer <= 0) {
        fortressActive = false;
        fortressTimer  = 0;
        showCraftedBanner("Fortress expired.");
        if (typeof updatePowerupHUD === "function") updatePowerupHUD();
      }
    }

    // Suppress piece spawning in editor mode
    if (!isEditorMode) {
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
        if ((isPuzzleMode || isCustomPuzzleMode) && typeof updatePuzzleHUD === "function") updatePuzzleHUD();
      }
      updateLineClear(delta);
      updateFallingPieces(delta);
      if (isBattleMode && typeof battleHud !== 'undefined') battleHud.tick(delta);
      if (isBattleMode && typeof checkBattleScoreRace === 'function') checkBattleScoreRace(delta);
      updateLandingRings(delta);
      updateTrails(delta, elapsedTime);
      updateAuras(delta, camera);
      updateDifficulty(delta);
      updateTreeRespawn(delta, elapsedTime);
      if (typeof updateEventEngine === "function") updateEventEngine(delta);
      if (typeof updateTutorial === "function") updateTutorial(delta);
    }
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
        // Custom puzzle: check time/score-based win conditions each second
        if (isCustomPuzzleMode && typeof checkPuzzleConditions === "function") {
          checkPuzzleConditions();
          if (typeof updatePuzzleHUD === "function") updatePuzzleHUD();
        }
      }
    }

    const playerPosition = controls.getObject().position;
    if (isEditorMode) {
      // Free-fly: vertical velocity driven by Space (up) / Shift (down) keys
      playerVelocity.y = moveUp ? MOVEMENT_SPEED : (moveDown ? -MOVEMENT_SPEED : 0);
    } else {
      if (!playerOnGround) playerVelocity.y -= GRAVITY * delta;
    }
    const _movWmod = typeof getWorldModifier === 'function' ? getWorldModifier() : null;
    const _modSpeedMult = _movWmod ? _movWmod.playerSpeedMult : 1.0;
    const _iceEffect = playerStandingOnIce || (_movWmod && _movWmod.iceAllBlocks);
    const speedDelta = MOVEMENT_SPEED * _modSpeedMult * (_iceEffect ? 1.2 : 1.0) * delta;
    if (moveForward) controls.moveForward(speedDelta);
    if (moveBackward) controls.moveForward(-speedDelta);
    if (moveLeft) controls.moveRight(-speedDelta);
    if (moveRight) controls.moveRight(speedDelta);
    playerPosition.y += playerVelocity.y * delta;
    // Prevent flying below ground in editor mode
    if (isEditorMode && playerPosition.y < PLAYER_HEIGHT) {
      playerPosition.y = PLAYER_HEIGHT;
      if (playerVelocity.y < 0) playerVelocity.y = 0;
    }

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

    if (!isEditorMode) checkPlayerCollision(playerVelocity.y * delta);
    updateTargeting();
    if (isEditorMode && typeof updateEditorGhost === "function") updateEditorGhost();
    if (isEditorMode && typeof tickEditorAutosave === "function") tickEditorAutosave(delta);

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
    // Tick co-op bonus banner fade-out
    if (coopBonusBannerTimer > 0) {
      coopBonusBannerTimer -= delta;
      if (coopBonusBannerTimer <= 0) {
        coopBonusBannerTimer = 0;
        var _bonusEl = document.getElementById('coop-bonus-overlay');
        if (_bonusEl) { _bonusEl.style.opacity = '0'; }
        setTimeout(function () {
          var _bEl = document.getElementById('coop-bonus-overlay');
          if (_bEl) _bEl.style.display = 'none';
        }, 1100);
      } else if (coopBonusBannerTimer < 1.0) {
        // Start fading in the last second
        var _bonusEl2 = document.getElementById('coop-bonus-overlay');
        if (_bonusEl2) _bonusEl2.style.opacity = String(coopBonusBannerTimer);
      }
    }
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

  // Animate obsidian shimmer: subtle emissive purple pulse at ~0.8 Hz
  for (let _oi = 0; _oi < obsidianBlocks.length; _oi++) {
    const _ob = obsidianBlocks[_oi];
    if (!_ob.material) continue;
    const _t = Math.sin(elapsedTime * 1.6 + _ob.userData.shimmerOffset) * 0.5 + 0.5;
    _ob.material.emissive.setRGB(
      (0x3d / 255) * _t * 0.35,
      0,
      (0x66 / 255) * _t * 0.35
    );
    _ob.material.needsUpdate = true;
  }

  updatePowerupOverlays();
  updatePostProcessing(delta);

  // Co-op: broadcast local max block height every 2 s
  if (isCoopMode && !isGameOver && typeof coop !== 'undefined' && coop.state === CoopState.IN_GAME) {
    if (time - coopHeightBroadcastLastTime >= 2000) {
      coopHeightBroadcastLastTime = time;
      const _localMaxY = typeof getMaxBlockHeight === 'function' ? getMaxBlockHeight() : 0;
      coop.send({ type: 'height', maxY: _localMaxY });
    }
    // Decay partner status dot: lagging after 3 s, disconnected after 6 s
    const _partnerAge = time - coopPartnerLastSeenTime;
    const _newStatus = _partnerAge > 6000 ? 'disconnected' : _partnerAge > 3000 ? 'lagging' : 'connected';
    if (_newStatus !== coopPartnerStatus) {
      coopPartnerStatus = _newStatus;
      if (typeof updateCoopPartnerStatus === 'function') updateCoopPartnerStatus();
    }
  }

  // Co-op: broadcast local position every ~100 ms (rAF-aligned, skip if unchanged)
  if (isCoopMode && typeof coop !== 'undefined' && coop.state === CoopState.IN_GAME) {
    if (time - _coopPosBroadcastLastTime >= 100) {
      const _camObj = controls ? controls.getObject() : null;
      if (_camObj) {
        const _bx = _camObj.position.x;
        const _by = _camObj.position.y;
        const _bz = _camObj.position.z;
        const _bRotY = _camObj.rotation.y;
        const _bRotX = camera.rotation.x;
        const _prev  = _coopPosLastSent;
        if (!_prev || _prev.x !== _bx || _prev.y !== _by || _prev.z !== _bz ||
            _prev.rotY !== _bRotY || _prev.rotX !== _bRotX) {
          coop.send({ type: 'pos', x: _bx, y: _by, z: _bz, rotY: _bRotY, rotX: _bRotX });
          _coopPosLastSent = { x: _bx, y: _by, z: _bz, rotY: _bRotY, rotX: _bRotX };
        }
        _coopPosBroadcastLastTime = time;
      }
    }
  }

  // Co-op: interpolate remote avatar
  if (typeof coopAvatar !== 'undefined') coopAvatar.tick();

  if (composer) {
    composer.render(delta);
  } else {
    renderer.render(scene, camera);
  }

  // Co-op: render CSS2D nameplate layer on top
  if (typeof coopAvatar !== 'undefined') coopAvatar.renderLabels();

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
