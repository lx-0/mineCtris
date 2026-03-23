// Mode selection screen — show/hide and populate the mode card panel.
// Requires: state.js, progression/*, modes/* loaded first.

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
      ["classic", "sprint", "blitz", "daily", "weekly", "puzzle", "survival", "expedition", "coop", "battle", "tournament"].forEach(function (mode) {
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

      // Apply progressive mode unlock gates
      if (typeof applyModeUnlockState === 'function') applyModeUnlockState();

      blocker.style.display = "none";
      modeSelectEl.style.display = "flex";

      // Start ambient music in ultra-sparse menu mood for the mode-select screen
      if (typeof Tone !== 'undefined' && Tone.context && Tone.context.state !== 'running') {
        Tone.context.resume();
      }
      if (typeof startBgMusic === 'function' && typeof setAmbientMood === 'function') {
        startBgMusic();
        setAmbientMood('menu');
      }
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
        if (typeof metricsModePlayed === 'function') metricsModePlayed('classic');
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
        if (typeof metricsModePlayed === 'function') metricsModePlayed('sprint');
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
        if (typeof metricsModePlayed === 'function') metricsModePlayed('blitz');
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
        if (typeof metricsModePlayed === 'function') metricsModePlayed('daily');
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
        if (typeof metricsModePlayed === 'function') metricsModePlayed('weekly');
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
        if (typeof metricsModePlayed === 'function') metricsModePlayed('puzzle');
        hideModeSelect();
        if (typeof showPuzzleSelect === "function") showPuzzleSelect();
      });
    }

    // Show the one-time Survival tutorial prompt; auto-dismisses after 6s
    function _showSurvivalTutorialPrompt() {
      var el = document.getElementById("survival-tutorial-prompt");
      if (!el) return;
      localStorage.setItem("mineCtris_tutorialShown", "1");
      el.style.display = "block";
      // Fade in
      requestAnimationFrame(function () { el.style.opacity = "1"; });
      var tutTimer = setTimeout(function () { _dismissSurvivalTutorialPrompt(); }, 6000);
      el._tutTimer = tutTimer;
    }

    // Fade out and hide the tutorial prompt (also called from mining.js on first mine)
    window._dismissSurvivalTutorialPrompt = function _dismissSurvivalTutorialPrompt() {
      var el = document.getElementById("survival-tutorial-prompt");
      if (!el || el.style.display === "none") return;
      if (el._tutTimer) { clearTimeout(el._tutTimer); el._tutTimer = null; }
      el.style.opacity = "0";
      setTimeout(function () { el.style.display = "none"; }, 500);
    };

    // Survival mode card
    const survivalCardEl = document.getElementById("mode-card-survival");
    if (survivalCardEl) {
      survivalCardEl.addEventListener("click", function () {
        isSurvivalMode = true;
        isDailyChallenge = false;
        gameRng = null;
        if (typeof metricsModePlayed === 'function') metricsModePlayed('survival');
        // If a survival world is saved, restore it; otherwise start fresh
        if (typeof hasSurvivalWorld === "function" && hasSurvivalWorld()) {
          if (typeof restoreSurvivalWorld === "function") restoreSurvivalWorld();
          survivalSessionNumber++;
        } else {
          survivalSessionNumber = 1;
          if (typeof initWorldStats === "function") initWorldStats();
          if (typeof spawnMineableSurfaceGrid === "function") spawnMineableSurfaceGrid();
        }
        // Hide ground plane in Survival mode — the mineable surface grid replaces it
        // visually, and visible=false also excludes it from raycasting so mining works.
        const _survGround = worldGroup.children.find(c => c.name === "ground");
        if (_survGround) _survGround.visible = false;

        // Spawn player at grid center
        if (controls) controls.getObject().position.set(0, PLAYER_HEIGHT, 0);
        // Show survival HUD badge
        const survBadgeEl = document.getElementById("survival-badge");
        if (survBadgeEl) survBadgeEl.style.display = "block";
        hideModeSelect();
        requestPointerLock();
        // Show one-time tutorial prompt on first-ever Survival session
        if (!localStorage.getItem("mineCtris_tutorialShown")) {
          _showSurvivalTutorialPrompt();
        }
      });
    }

