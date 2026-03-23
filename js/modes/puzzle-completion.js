// Puzzle completion logic — win/lose detection, star calculation, overlay.
// Requires: modes/puzzle.js loaded first.

// ── Completion logic ───────────────────────────────────────────────────────────

function _calcStars(piecesTotal, piecesUsed, isFirstAttempt) {
  const remaining = piecesTotal - piecesUsed;
  const pctRemaining = piecesTotal > 0 ? remaining / piecesTotal : 0;

  if (isFirstAttempt && pctRemaining >= 0) {
    // First attempt earns 3 stars
    return 3;
  }
  if (pctRemaining >= 0.2) {
    // Completed with 20%+ pieces remaining
    return 2;
  }
  return 1;
}

function _triggerPuzzleWin() {
  if (puzzleComplete) return;
  puzzleComplete = true;
  isGameOver = true;
  gameTimerRunning = false;

  const puzzle = getPuzzleById(puzzlePuzzleId);
  const piecesTotal = puzzle ? puzzle.pieces.length : 1;
  const stars = _calcStars(piecesTotal, _puzzlePiecesUsed, _puzzleIsFirstAttempt);

  const isNewBest = savePuzzleStars(puzzlePuzzleId, stars);

  // Submit lifetime stats
  if (typeof submitLifetimeStats === "function") {
    submitLifetimeStats({
      score,
      blocksMined,
      linesCleared,
      blocksPlaced,
      totalCrafts:           sessionCrafts,
      highestComboCount:     sessionHighestComboCount,
      highestDifficultyTier: lastDifficultyTier,
      isDailyChallenge:      false,
      isPuzzleMode:          true,
    });
  }

  // Metrics: log session end
  if (typeof metricsSessionEnd === 'function') {
    metricsSessionEnd({ score: score, linesCleared: linesCleared, blocksMined: blocksMined });
  }

  // Award XP (puzzle win)
  if (typeof awardXP === "function") {
    const _pzXpBefore = (typeof loadLifetimeStats === 'function' ? loadLifetimeStats().playerXP || 0 : 0);
    const { xpEarned: _pzXP, streakBonus: _pzStreak } = awardXP(score, 'puzzle');
    const pzXpEl = document.getElementById('puzzle-xp-earned');
    if (pzXpEl) {
      pzXpEl.textContent = '+ ' + _pzXP + ' XP' + (_pzStreak ? '  (Streak Bonus!)' : '');
      pzXpEl.className = 'xp-earned-display' + (_pzStreak ? ' xp-streak' : '');
    }
    if (typeof checkLevelUp === 'function' && typeof loadLifetimeStats === 'function') {
      checkLevelUp(_pzXpBefore, loadLifetimeStats().playerXP || 0);
    }
    if (typeof updateStreakHUD === 'function') updateStreakHUD();
  }

  // Achievements
  if (typeof achOnPuzzleComplete === "function") {
    achOnPuzzleComplete(puzzlePuzzleId, stars);
  }

  // Daily missions: puzzle completed
  if (typeof onMissionPuzzleComplete === "function") onMissionPuzzleComplete();

  _showPuzzleCompleteOverlay(true, stars, isNewBest, puzzle);

  if (typeof stopBgMusic === "function") stopBgMusic();
  if (typeof playGameOverJingle === "function") playGameOverJingle();
  if (controls && controls.isLocked) controls.unlock();
}

function _triggerPuzzleLose(reason) {
  if (puzzleComplete) return;
  puzzleComplete = true;
  isGameOver = true;
  gameTimerRunning = false;

  const pzXpElLose = document.getElementById('puzzle-xp-earned');
  if (pzXpElLose) { pzXpElLose.textContent = ''; pzXpElLose.className = 'xp-earned-display'; }

  _showPuzzleCompleteOverlay(false, 0, false, getPuzzleById(puzzlePuzzleId), reason);

  if (typeof stopBgMusic === "function") stopBgMusic();
  if (typeof playGameOverJingle === "function") playGameOverJingle();
  if (controls && controls.isLocked) controls.unlock();
}

function _showPuzzleCompleteOverlay(won, stars, isNewBest, puzzle, loseReason) {
  const overlayEl = document.getElementById("puzzle-complete-screen");
  if (!overlayEl) return;

  const titleEl = document.getElementById("puzzle-complete-title");
  if (titleEl) {
    if (won) {
      titleEl.textContent = "PUZZLE SOLVED!";
    } else if (loseReason === "crafting_used") {
      titleEl.textContent = "CRAFTING USED!";
    } else if (loseReason === "time_up") {
      titleEl.textContent = "TIME'S UP!";
    } else {
      titleEl.textContent = "OUT OF PIECES";
    }
  }

  const nameEl = document.getElementById("puzzle-complete-name");
  if (nameEl && puzzle) nameEl.textContent = "#" + puzzle.id + " — " + puzzle.name;

  const starsEl = document.getElementById("puzzle-complete-stars");
  if (starsEl) {
    if (won) {
      starsEl.textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
      starsEl.className = "puzzle-stars puzzle-stars-" + stars;
    } else {
      starsEl.textContent = "☆☆☆";
      starsEl.className = "puzzle-stars puzzle-stars-0";
    }
  }

  const pbEl = document.getElementById("puzzle-complete-pb");
  if (pbEl) {
    if (won && isNewBest) {
      pbEl.textContent = "NEW BEST!";
      pbEl.className = "puzzle-new-best";
    } else if (won) {
      const best = getPuzzleStars(puzzlePuzzleId);
      pbEl.textContent = "Best: " + "★".repeat(best) + "☆".repeat(3 - best);
      pbEl.className = "puzzle-pb-line";
    } else {
      pbEl.textContent = "";
      pbEl.className = "";
    }
  }

  const remainEl = document.getElementById("puzzle-complete-remain");
  if (remainEl) {
    const wc = (puzzle && puzzle.winCondition) ? puzzle.winCondition : { mode: "mine_all" };
    if (won) {
      if (wc.mode === "clear_lines") {
        remainEl.textContent = linesCleared + " line" + (linesCleared === 1 ? "" : "s") + " cleared!";
      } else if (wc.mode === "no_craft") {
        remainEl.textContent = "All " + _puzzleInitialCount + " blocks cleared without crafting!";
      } else if (wc.mode === "timed_score") {
        remainEl.textContent = "Score: " + score + " / " + wc.scoreTarget + " reached!";
      } else {
        remainEl.textContent = "All " + _puzzleInitialCount + " blocks cleared!";
      }
    } else {
      if (wc.mode === "clear_lines") {
        remainEl.textContent = linesCleared + " / " + wc.n + " lines cleared";
      } else if (wc.mode === "no_craft") {
        remainEl.textContent = "Crafting was used — no-craft condition failed";
      } else if (wc.mode === "timed_score") {
        remainEl.textContent = "Score: " + score + " / " + wc.scoreTarget + " — time ran out";
      } else {
        const remaining = countRemainingPresetBlocks();
        remainEl.textContent = remaining + " block" + (remaining === 1 ? "" : "s") + " remaining";
      }
    }
  }

  // Show/hide next puzzle button
  const nextBtn = document.getElementById("puzzle-next-btn");
  if (nextBtn) {
    const nextId = puzzlePuzzleId + 1;
    const nextPuzzle = getPuzzleById(nextId);
    if (won && nextPuzzle && isPuzzleUnlocked(nextId)) {
      nextBtn.style.display = "";
      nextBtn.textContent = "Next Puzzle ▶";
    } else {
      nextBtn.style.display = "none";
    }
  }

  // Hide vote area for built-in puzzles
  const builtinVoteArea = document.getElementById("puzzle-vote-area");
  if (builtinVoteArea) builtinVoteArea.style.display = "none";

  overlayEl.style.display = "flex";
}

// ── Custom puzzle win ─────────────────────────────────────────────────────────

function _triggerCustomPuzzleWin() {
  if (puzzleComplete) return;
  puzzleComplete = true;
  isGameOver = true;
  gameTimerRunning = false;

  // Award XP
  if (typeof awardXP === "function") {
    const _cpXpBefore = (typeof loadLifetimeStats === "function" ? loadLifetimeStats().playerXP || 0 : 0);
    const { xpEarned: _cpXP, streakBonus: _cpStreak } = awardXP(score, "puzzle");
    const cpXpEl = document.getElementById("puzzle-xp-earned");
    if (cpXpEl) {
      cpXpEl.textContent = "+ " + _cpXP + " XP" + (_cpStreak ? "  (Streak Bonus!)" : "");
      cpXpEl.className = "xp-earned-display" + (_cpStreak ? " xp-streak" : "");
    }
    if (typeof checkLevelUp === "function" && typeof loadLifetimeStats === "function") {
      checkLevelUp(_cpXpBefore, loadLifetimeStats().playerXP || 0);
    }
    if (typeof updateStreakHUD === "function") updateStreakHUD();
  }

  _showCustomPuzzleCompleteOverlay(true);

  if (typeof stopBgMusic === "function") stopBgMusic();
  if (typeof playGameOverJingle === "function") playGameOverJingle();
  if (controls && controls.isLocked) controls.unlock();
}

function _formatPuzzleTime(secs) {
  var m = Math.floor(secs / 60);
  var s = Math.floor(secs % 60);
  return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
}

/**
 * Encode the current custom puzzle state (layout, win condition, metadata, piece sequence)
 * into a share URL. Works during and after play (uses customPuzzleLayout, not the live world).
 * Returns a full URL string or null if encoding is unavailable.
 */
function encodeCustomPuzzleShareURL() {
  if (typeof puzzleCodecEncode !== "function") return null;
  if (!Array.isArray(customPuzzleLayout) || customPuzzleLayout.length === 0) return null;
  var blocks = customPuzzleLayout.map(function (b) {
    var hexInt = parseInt((b.color || "#808080").replace("#", ""), 16);
    var paletteIdx = 1; // default stone
    if (typeof EDITOR_PALETTE !== "undefined") {
      for (var i = 0; i < EDITOR_PALETTE.length; i++) {
        if (EDITOR_PALETTE[i].hex === hexInt) { paletteIdx = i; break; }
      }
    }
    return [b.x, b.y, b.z, paletteIdx];
  });
  var code = puzzleCodecEncode({
    winCondition: customPuzzleWinCondition || { mode: "mine_all", n: 10 },
    blocks: blocks,
    metadata: customPuzzleMetadata || { name: "", description: "", author: "", difficulty: 0 },
    pieceSequence: customPieceSequence || { mode: "random", pieces: [] },
  });
  if (!code) return null;
  return location.origin + location.pathname + "?puzzle=" + encodeURIComponent(code);
}

function _showCustomPuzzleCompleteOverlay(won) {
  const overlayEl = document.getElementById("puzzle-complete-screen");
  if (!overlayEl) return;

  const titleEl = document.getElementById("puzzle-complete-title");
  if (titleEl) titleEl.textContent = won ? "PUZZLE COMPLETE!" : "GAME OVER";

  const nameEl = document.getElementById("puzzle-complete-name");
  if (nameEl) {
    var meta = (typeof customPuzzleMetadata !== "undefined") ? customPuzzleMetadata : null;
    var displayName = (meta && meta.name) ? meta.name : "Custom Puzzle";
    nameEl.textContent = displayName;
  }

  // Show author separately (was previously inline; keep for built-in screen compat)
  const pbEl = document.getElementById("puzzle-complete-pb");
  if (pbEl) {
    var meta2 = (typeof customPuzzleMetadata !== "undefined") ? customPuzzleMetadata : null;
    var pbParts = [];
    if (meta2 && meta2.author) pbParts.push("by " + meta2.author);
    if (meta2 && meta2.difficulty > 0) {
      pbParts.push("★".repeat(meta2.difficulty) + "☆".repeat(3 - meta2.difficulty));
    }
    pbEl.textContent = pbParts.join("  ·  ");
    pbEl.className = pbParts.length > 0 ? "puzzle-pb-line" : "";
  }

  const starsEl = document.getElementById("puzzle-complete-stars");
  if (starsEl) {
    starsEl.textContent = won ? "★★★" : "☆☆☆";
    starsEl.className = won ? "puzzle-stars puzzle-stars-3" : "puzzle-stars puzzle-stars-0";
  }

  const remainEl = document.getElementById("puzzle-complete-remain");
  if (remainEl && customPuzzleWinCondition) {
    const wc = customPuzzleWinCondition;
    if (wc.mode === "mine_all") {
      remainEl.textContent = won ? "All blocks cleared!" : countRemainingPresetBlocks() + " blocks remaining";
    } else if (wc.mode === "clear_lines") {
      remainEl.textContent = "Lines cleared: " + linesCleared + " / " + wc.n;
    } else if (wc.mode === "survive_seconds") {
      remainEl.textContent = "Survived: " + Math.floor(gameElapsedSeconds) + "s / " + wc.n + "s";
    } else if (wc.mode === "score_points") {
      remainEl.textContent = "Score: " + score.toLocaleString() + " / " + wc.n.toLocaleString();
    }
  }

  // Time elapsed
  const timeEl = document.getElementById("puzzle-complete-time");
  if (timeEl) {
    timeEl.textContent = "Time: " + _formatPuzzleTime(gameElapsedSeconds);
    timeEl.style.display = "";
  }

  // Score + efficiency (blocks mined / pieces used)
  const scoreDispEl = document.getElementById("puzzle-complete-score");
  if (scoreDispEl) {
    var effText = "";
    if (_puzzlePiecesUsed > 0) {
      var eff = Math.round((blocksMined / _puzzlePiecesUsed) * 10) / 10;
      effText = "  ·  Eff: " + eff.toFixed(1);
    }
    scoreDispEl.textContent = "Score: " + score.toLocaleString() + effText;
    scoreDispEl.style.display = "";
  }

  const nextBtn = document.getElementById("puzzle-next-btn");
  if (nextBtn) nextBtn.style.display = "none";

  // Share button: show if puzzle can be encoded (has a layout)
  const shareBtn = document.getElementById("puzzle-complete-share-btn");
  if (shareBtn) {
    var shareUrl = encodeCustomPuzzleShareURL();
    if (shareUrl) {
      shareBtn.style.display = "";
      shareBtn._puzzleShareUrl = shareUrl;
    } else {
      shareBtn.style.display = "none";
      shareBtn._puzzleShareUrl = null;
    }
  }

  // Edit button: only show when launched from editor
  const editBtn = document.getElementById("puzzle-complete-edit-btn");
  if (editBtn) {
    editBtn.style.display = (typeof customPlayFromEditor !== "undefined" && customPlayFromEditor) ? "" : "none";
  }

  // Vote area: only show for community puzzles
  const voteArea    = document.getElementById("puzzle-vote-area");
  const voteUpBtn   = document.getElementById("puzzle-vote-up");
  const voteDownBtn = document.getElementById("puzzle-vote-down");
  const voteMsg     = document.getElementById("puzzle-vote-msg");
  const communityId = (typeof window !== "undefined") ? window._communityPuzzleId : null;

  if (voteArea && voteUpBtn && voteDownBtn && communityId) {
    voteArea.style.display = "";
    voteUpBtn.disabled   = false;
    voteDownBtn.disabled = false;
    voteUpBtn.classList.remove("voted-active");
    voteDownBtn.classList.remove("voted-active");
    if (voteMsg) voteMsg.textContent = "";

    // Check if already voted this session
    var ssKey = "puzzle_voted_" + communityId;
    var priorVote = (typeof sessionStorage !== "undefined") ? sessionStorage.getItem(ssKey) : null;
    if (priorVote) {
      if (voteMsg) voteMsg.textContent = "Already rated!";
      voteUpBtn.disabled   = true;
      voteDownBtn.disabled = true;
      if (priorVote === "up")   voteUpBtn.classList.add("voted-active");
      if (priorVote === "down") voteDownBtn.classList.add("voted-active");
    } else {
      function _doVote(vote) {
        if (voteUpBtn.disabled) return;
        voteUpBtn.disabled   = true;
        voteDownBtn.disabled = true;
        if (voteMsg) voteMsg.textContent = "Sending\u2026";

        var workerUrl = (typeof window._communityWorkerUrl === "function")
          ? window._communityWorkerUrl()
          : "https://minectris-leaderboard.workers.dev";

        fetch(workerUrl + "/api/puzzles/" + communityId + "/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vote: vote }),
        })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (data.ok) {
              if (typeof sessionStorage !== "undefined") sessionStorage.setItem(ssKey, vote);
              if (vote === "up")   voteUpBtn.classList.add("voted-active");
              if (vote === "down") voteDownBtn.classList.add("voted-active");
              if (voteMsg) {
                voteMsg.textContent = "\uD83D\uDC4D " + (data.thumbsUp || 0) +
                  "  \uD83D\uDC4E " + (data.thumbsDown || 0);
              }
            } else {
              if (voteMsg) voteMsg.textContent = "Error";
              voteUpBtn.disabled   = false;
              voteDownBtn.disabled = false;
            }
          })
          .catch(function () {
            if (voteMsg) voteMsg.textContent = "Error";
            voteUpBtn.disabled   = false;
            voteDownBtn.disabled = false;
          });
      }

      // Clone buttons to remove any prior listeners
      var newUp   = voteUpBtn.cloneNode(true);
      var newDown = voteDownBtn.cloneNode(true);
      voteUpBtn.parentNode.replaceChild(newUp, voteUpBtn);
      voteDownBtn.parentNode.replaceChild(newDown, voteDownBtn);

      newUp.addEventListener("click",   function () { _doVote("up");   });
      newDown.addEventListener("click", function () { _doVote("down"); });
    }
  } else if (voteArea) {
    voteArea.style.display = "none";
  }

  overlayEl.style.display = "flex";
}

// ── No-craft enforcement ──────────────────────────────────────────────────────

/**
 * Called from crafting.js whenever a recipe is crafted during built-in puzzle mode.
 * Immediately fails the puzzle if the win condition requires no crafting.
 */
function _onPuzzleCraftUsed() {
  if (!isPuzzleMode || puzzleComplete) return;
  const puzzle = getPuzzleById(puzzlePuzzleId);
  const wc = puzzle && puzzle.winCondition;
  if (wc && wc.mode === "no_craft") {
    _puzzleNoCraftViolated = true;
    _triggerPuzzleLose("crafting_used");
  }
}

// ── Timed-score tick ──────────────────────────────────────────────────────────

/**
 * Advance the timed_score countdown. Call every frame with delta seconds.
 * Only active for built-in puzzles with mode === "timed_score".
 */
function tickPuzzleTimeLimit(delta) {
  if (!isPuzzleMode || puzzleComplete || _puzzleTimeLimitSecs === 0) return;
  _puzzleTimeElapsed += delta;
  if (_puzzleTimeElapsed >= _puzzleTimeLimitSecs) {
    _puzzleTimeElapsed = _puzzleTimeLimitSecs;
    checkPuzzleConditions();
  }
}

// ── Think mode ────────────────────────────────────────────────────────────────

/** Call from keydown handler when the think-mode key (F) is pressed. */
function setThinkMode(active) {
  if (!isPuzzleMode) return;
  _thinkModeActive = active;
}

/** Returns true when gravity should be suppressed for falling pieces. */
function isThinkModeActive() {
  return isPuzzleMode && _thinkModeActive;
}

// ── HUD helpers ───────────────────────────────────────────────────────────────

/** Update the puzzle HUD badge: shows puzzle #, pieces left, blocks remaining. */
function updatePuzzleHUD() {
  const badgeEl = document.getElementById("puzzle-badge");
  if (!badgeEl) return;

  if (isCustomPuzzleMode && customPuzzleWinCondition) {
    const wc = customPuzzleWinCondition;
    let objective = "";
    if (wc.mode === "mine_all") {
      objective = "Blocks: " + countRemainingPresetBlocks() + "/" + _puzzleInitialCount;
    } else if (wc.mode === "clear_lines") {
      objective = "Lines: " + linesCleared + "/" + wc.n;
    } else if (wc.mode === "survive_seconds") {
      objective = "Survive: " + Math.floor(gameElapsedSeconds) + "/" + wc.n + "s";
    } else if (wc.mode === "score_points") {
      objective = "Score: " + score + "/" + wc.n;
    }
    badgeEl.textContent = "Custom Puzzle | " + objective;
    return;
  }

  const puzzle = getPuzzleById(puzzlePuzzleId);
  const piecesLeft = puzzleFixedQueue.length + pieceQueue.length + fallingPieces.length;
  const prefix = "Puzzle " + (puzzle ? puzzle.id : "?") + "/" + PUZZLES.length;
  const thinkSuffix = isThinkModeActive() ? " | THINK MODE" : "";

  const wc = (puzzle && puzzle.winCondition) ? puzzle.winCondition : { mode: "mine_all" };
  let objective = "";
  if (wc.mode === "clear_lines") {
    objective = "Lines: " + linesCleared + "/" + wc.n + " | Pieces: " + piecesLeft;
  } else if (wc.mode === "no_craft") {
    const blocksLeft = countRemainingPresetBlocks();
    objective = "Blocks: " + blocksLeft + "/" + _puzzleInitialCount +
      " | No Crafting" + (_puzzleNoCraftViolated ? " ✗" : " ✓") +
      " | Pieces: " + piecesLeft;
  } else if (wc.mode === "timed_score") {
    const timeLeft = Math.max(0, Math.ceil(_puzzleTimeLimitSecs - _puzzleTimeElapsed));
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    const timeStr = (mins < 10 ? "0" : "") + mins + ":" + (secs < 10 ? "0" : "") + secs;
    objective = "Score: " + score + "/" + wc.scoreTarget + " | Time: " + timeStr;
  } else {
    const blocksLeft = countRemainingPresetBlocks();
    objective = "Blocks: " + blocksLeft + "/" + _puzzleInitialCount + " | Pieces: " + piecesLeft;
  }

  badgeEl.textContent = prefix + " | " + objective + thinkSuffix;
}

// ── Puzzle selector ───────────────────────────────────────────────────────────

/** Render the puzzle-select list inside #puzzle-select-list. */
function renderPuzzleSelectList() {
  const listEl = document.getElementById("puzzle-select-list");
  if (!listEl) return;

  listEl.innerHTML = "";
  PUZZLES.forEach(puzzle => {
    const unlocked = isPuzzleUnlocked(puzzle.id);
    const stars = getPuzzleStars(puzzle.id);

    const item = document.createElement("div");
    item.className = "puzzle-list-item" + (unlocked ? "" : " puzzle-locked");

    const starsStr = unlocked
      ? ("★".repeat(stars) + "☆".repeat(3 - stars))
      : "🔒";

    item.innerHTML =
      '<div class="puzzle-list-num">' + puzzle.id + '</div>' +
      '<div class="puzzle-list-info">' +
        '<div class="puzzle-list-name">' + puzzle.name + '</div>' +
        '<div class="puzzle-list-diff puzzle-diff-' + puzzle.difficulty + '">' + puzzle.difficulty + '</div>' +
      '</div>' +
      '<div class="puzzle-list-stars">' + starsStr + '</div>';

    if (unlocked) {
      item.addEventListener("click", function () {
        puzzlePuzzleId = puzzle.id;
        hidePuzzleSelect();
        // Lock pointer (mirrors requestPointerLock in main.js)
        if (typeof Tone !== "undefined" && Tone.context.state !== "running") {
          Tone.start().then(() => controls.lock()).catch(() => controls.lock());
        } else if (controls) {
          controls.lock();
        }
      });
    }
    listEl.appendChild(item);
  });
}

function showPuzzleSelect() {
  const el = document.getElementById("puzzle-select-screen");
  if (el) {
    renderPuzzleSelectList();
    el.style.display = "flex";
  }
}

function hidePuzzleSelect() {
  const el = document.getElementById("puzzle-select-screen");
  if (el) el.style.display = "none";
}
