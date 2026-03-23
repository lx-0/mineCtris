// Entry point — scene setup and init() bootstrapper.
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
      "<h1>Error</h1><p>THREE.js or PointerLockControls could not be loaded. Please reload the page.</p>";
    return;
  }

  initAudio();
  initSettings();
  if (typeof detectReturningPlayer === "function") detectReturningPlayer();
  if (typeof initLeaderboard === "function") initLeaderboard();
  if (typeof initGuild === "function") initGuild();
  if (typeof initSeasonBanner === "function") initSeasonBanner();
  if (typeof initSeasonHUD === "function") initSeasonHUD();
  if (typeof initSeasonPassPanel === "function") initSeasonPassPanel();
  if (typeof initBiomeCosmeticsPanel === "function") initBiomeCosmeticsPanel();
  if (typeof initBiomeLeaderboard === "function") initBiomeLeaderboard();

  if (typeof initExpeditionMap === "function") initExpeditionMap();
  if (typeof initExpeditionCodex === "function") initExpeditionCodex();
  if (typeof initExpeditionSession === "function") initExpeditionSession();
  if (typeof initRecapFromUrl === "function") initRecapFromUrl();
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

    // ── First-launch minimal menu ──
    var _isFirstLaunch = false;
    var _firstLaunchGameActive = false;
    try { _isFirstLaunch = !localStorage.getItem('mineCtris_tutorialDone'); } catch (_) {}
    if (_isFirstLaunch) {
      var instrEl = document.getElementById("instructions");
      if (instrEl) instrEl.classList.add("first-launch");
    }

    // First-launch Settings button opens settings panel
    var flSettingsBtn = document.getElementById("first-launch-settings-btn");
    if (flSettingsBtn) {
      flSettingsBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (typeof openSettings === 'function') openSettings();
      });
    }

    // ── First-game-over teaser (globally accessible callback) ──
    window.onFirstGameOver = function () {
      var teaserEl = document.getElementById("first-game-teaser");
      if (_firstLaunchGameActive && teaserEl) {
        teaserEl.style.display = "block";
        // Flip first-launch off so subsequent plays use mode select
        _isFirstLaunch = false;
        _firstLaunchGameActive = false;
      } else if (teaserEl) {
        teaserEl.style.display = "none";
      }
    };

    // ── "More" toggle for secondary menu ──
    var menuMoreToggle = document.getElementById("menu-more-toggle");
    var menuSecondary = document.getElementById("menu-secondary");
    if (menuMoreToggle && menuSecondary) {
      menuMoreToggle.addEventListener("click", function (e) {
        e.stopPropagation();
        var isOpen = menuSecondary.classList.toggle("open");
        menuMoreToggle.classList.toggle("open", isOpen);
        menuMoreToggle.textContent = isOpen ? "\u2716 Less" : "\u2630 More";
      });
    }

    blocker.addEventListener("click", function (e) {
      // Only the CTA "Click to Start" triggers mode select; all other buttons inside .start-buttons handle their own events
      if (e.target.closest('.start-buttons') && e.target.id !== 'start-random-btn' && !e.target.closest('#start-random-btn')) return;
      // Also skip clicks on menu group labels/separators
      if (e.target.closest('.menu-group-label')) return;
      // Skip clicks on the more toggle
      if (e.target.closest('#menu-more-toggle')) return;
      // If ?editor=1 URL param preset editor mode, go straight into editor
      if (isEditorMode) { requestPointerLock(); return; }
      // First-launch: skip mode select, launch Classic directly
      if (_isFirstLaunch) {
        _firstLaunchGameActive = true;
        isDailyChallenge = false;
        gameRng = null;
        try { localStorage.setItem("mineCtris_lastMode", "classic"); } catch (_) {}
        if (typeof metricsModePlayed === 'function') metricsModePlayed('classic');
        requestPointerLock();
        return;
      }
      // Show mode select screen instead of jumping straight into the game
      showModeSelect();
    });


    // ── Mode select helpers ───────────────────────────────────────────
    // showModeSelect / hideModeSelect defined in js/ui/mode-select.js


    // ── Co-op mode card + lobby overlay ──────────────────────────────────────
    _initCoopHandlers();
    // ── End co-op setup ──────────────────────────────────────────────────────

    // ── Battle mode card + lobby overlay ──────────────────────────────────────
    _initBattleHandlers();
    // ── End battle setup ───────────────────────────────────────────────────────

    // ── Tournament lobby ──────────────────────────────────────────────────────
    _initTournamentHandlers();
    // ── End tournament setup ───────────────────────────────────────────────────

    // ── End tournament setup ──────────────────────────────────────────────────

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
        // Transition from menu mood → calm when gameplay begins
        if (typeof forceAmbientMood === "function") forceAmbientMood("calm");
        // First-run tutorial (v2.0 — starts immediately with falling piece)
        if (typeof initTutorial === "function") {
          initTutorial();
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
      // Metrics: log session start
      if (typeof metricsSessionStart === 'function') metricsSessionStart();
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
        if (typeof initPuzzleWinCondition === "function") initPuzzleWinCondition();
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

  // First-game teaser: "Explore Modes" button on game-over screen
  var firstGameExploreBtn = document.getElementById("first-game-explore-btn");
  if (firstGameExploreBtn) {
    firstGameExploreBtn.addEventListener("click", function () {
      resetGame();
      showModeSelect();
    });
  }

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

  // Profile page button
  const startProfileBtn = document.getElementById("start-profile-btn");
  if (startProfileBtn) startProfileBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (typeof openProfilePage === "function") openProfilePage();
  });

  const profileCloseBtn = document.getElementById("profile-close-btn");
  if (profileCloseBtn) profileCloseBtn.addEventListener("click", function () {
    if (typeof closeProfilePage === "function") closeProfilePage();
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
  _initShareModal();

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

  // Restore equipped season cosmetic (scene objects now exist for material swapping).
  if (typeof restoreSeasonCosmetic === "function") restoreSeasonCosmetic();
  // Restore equipped biome cosmetic — runs after restoreSeasonCosmetic so biome cosmetic takes priority.
  if (typeof restoreBiomeCosmetic === "function") restoreBiomeCosmetic();

  // ── Expedition launch handler ──────────────────────────────────────────────
  // Triggered when the player clicks "Enter Biome" in the expedition world map.
  // Runs inside a user-gesture callchain (the original click), so pointer-lock
  // requests from the lore overlay's "Enter Biome" button will succeed.
  document.addEventListener('expeditionLaunch', function (e) {
    var node = e.detail && e.detail.node;
    hideModeSelect();
    if (node && typeof showExpeditionLore === 'function') {
      showExpeditionLore(node, function () { requestPointerLock(); });
    } else {
      requestPointerLock();
    }
  });

  console.log("Initialization complete. Starting animation loop.");
  animate();
}
// initPostProcessing() defined in js/rendering/postprocessing.js
// onWindowResize() and applyResponsiveHUD() defined in js/rendering/resize.js

function onWheel(event) {
  if (!controls || !controls.isLocked || isGameOver) return;
  cycleSelectedBlock(event.deltaY > 0 ? 1 : -1);
}

// Input handlers defined in js/player/input.js
// Power-up functions defined in js/player/powerups.js
// animate() defined in js/core/game-loop.js

function hideLoadingScreen() {
  var ls = document.getElementById('loading-screen');
  if (ls) {
    ls.style.transition = 'opacity 0.4s ease';
    ls.style.opacity = '0';
    setTimeout(function() { ls.remove(); }, 400);
  }
  if (window.__minetrisLoadingObserver) {
    window.__minetrisLoadingObserver.disconnect();
    delete window.__minetrisLoadingObserver;
  }
}

try {
  init();
  window.__MINETRIS_INIT_DONE = true;
  clearTimeout(window.__MINETRIS_INIT_TIMER);
  hideLoadingScreen();
} catch (error) {
  console.error("Error during initialization:", error);
  window.__MINETRIS_INIT_DONE = true;
  clearTimeout(window.__MINETRIS_INIT_TIMER);
  hideLoadingScreen();
  var el = document.createElement('div');
  el.id = 'init-error-screen';
  el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#111;color:#fff;font-family:monospace,sans-serif;text-align:center;padding:2rem;';
  el.innerHTML = '<div><h1 style="font-size:1.5rem;margin-bottom:1rem;">Something went wrong</h1><p style="margin-bottom:1.5rem;">An error occurred during initialization. Please reload the page.</p><button onclick="location.reload()" style="padding:0.75rem 2rem;font-size:1rem;background:#e74c3c;color:#fff;border:none;cursor:pointer;font-family:inherit;">Reload</button></div>';
  document.body.appendChild(el);
}
