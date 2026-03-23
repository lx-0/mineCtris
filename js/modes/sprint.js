// Sprint mode — personal best tracking, time formatting, and sprint-complete overlay.
// Requires: state.js (isSprintMode, sprintTimerActive, sprintElapsedMs, sprintComplete,
//           linesCleared, blocksPlaced, sessionCrafts, sessionHighestComboCount,
//           lastDifficultyTier, score, blocksMined, isGameOver, gameTimerRunning, controls),
//           gamestate.js (submitLifetimeStats)

const SPRINT_STORAGE_KEY = "mineCtris_sprintBest";

/**
 * Load the personal best sprint time from localStorage.
 * Returns { timeMs: number, date: string } or null if no record exists.
 */
function loadSprintBest() {
  try {
    const raw = localStorage.getItem(SPRINT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/**
 * Save a sprint time if it beats the existing personal best.
 * Returns true if this is a new personal best.
 */
function saveSprintBest(timeMs) {
  const existing = loadSprintBest();
  if (existing && existing.timeMs <= timeMs) return false;
  try {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(SPRINT_STORAGE_KEY, JSON.stringify({ timeMs, date: today }));
  } catch (_) {}
  return true;
}

/**
 * Format milliseconds as MM:SS.cc (centiseconds).
 * Example: 75432 ms → "01:15.43"
 */
function fmtSprintTime(ms) {
  const totalCs = Math.floor(ms / 10);
  const cs      = totalCs % 100;
  const totalSecs = Math.floor(ms / 1000);
  const secs      = totalSecs % 60;
  const mins      = Math.floor(totalSecs / 60);
  return (
    mins.toString().padStart(2, "0") + ":" +
    secs.toString().padStart(2, "0") + "." +
    cs.toString().padStart(2, "0")
  );
}

/**
 * Freeze gameplay, evaluate the personal best, and show the sprint-complete overlay.
 * Called once when linesCleared reaches SPRINT_LINE_TARGET (40).
 */
function triggerSprintComplete() {
  if (sprintComplete) return;
  sprintComplete    = true;
  sprintTimerActive = false;
  isGameOver        = true;
  gameTimerRunning  = false;

  // Hide danger overlay (not expected in sprint, but be safe)
  const dangerEl     = document.getElementById("danger-overlay");
  const dangerTextEl = document.getElementById("danger-text");
  if (dangerEl)     dangerEl.style.display     = "none";
  if (dangerTextEl) dangerTextEl.style.display = "none";

  // Record lifetime stats
  submitLifetimeStats({
    score,
    blocksMined,
    linesCleared,
    blocksPlaced,
    totalCrafts:           sessionCrafts,
    highestComboCount:     sessionHighestComboCount,
    highestDifficultyTier: lastDifficultyTier,
    isDailyChallenge:      false,
  });

  // Metrics: log session end
  if (typeof metricsSessionEnd === 'function') {
    metricsSessionEnd({ score: score, linesCleared: linesCleared, blocksMined: blocksMined });
  }

  // Award XP
  const _sprintXpBefore = (loadLifetimeStats().playerXP || 0);
  const { xpEarned: _sprintXP, streakBonus: _sprintStreak } = awardXP(score, 'sprint');
  const sprintXpEl = document.getElementById('sprint-xp-earned');
  if (sprintXpEl) {
    sprintXpEl.textContent = '+ ' + _sprintXP + ' XP' + (_sprintStreak ? '  (Streak Bonus!)' : '');
    sprintXpEl.className = 'xp-earned-display' + (_sprintStreak ? ' xp-streak' : '');
  }
  if (typeof checkLevelUp === 'function') checkLevelUp(_sprintXpBefore, loadLifetimeStats().playerXP || 0);
  if (typeof updateStreakHUD === 'function') updateStreakHUD();

  const finalTimeMs = sprintElapsedMs;
  const isNewBest   = saveSprintBest(finalTimeMs);
  const best        = loadSprintBest();

  // Achievements: Sprinter, Speed Sprinter
  if (typeof achOnSprintComplete === "function") achOnSprintComplete(finalTimeMs);

  // Mastery tracking
  if (typeof masteryOnSprintComplete === 'function') masteryOnSprintComplete(finalTimeMs);

  // Daily missions: sprint session end
  if (typeof onMissionSprintEnd === "function") onMissionSprintEnd(finalTimeMs);

  // Populate sprint-complete overlay
  const overlayEl = document.getElementById("sprint-complete-screen");
  if (overlayEl) {
    const timeEl = document.getElementById("sprint-final-time");
    if (timeEl) timeEl.textContent = fmtSprintTime(finalTimeMs);

    const pbEl = document.getElementById("sprint-personal-best");
    if (pbEl) {
      pbEl.textContent = isNewBest
        ? "NEW PERSONAL BEST!"
        : (best ? "Best: " + fmtSprintTime(best.timeMs) : "");
      pbEl.className = isNewBest ? "sprint-new-best" : "sprint-pb-line";
    }

    overlayEl.style.display = "flex";
  }

  // Fade music and play completion jingle
  if (typeof stopBgMusic       === "function") stopBgMusic();
  if (typeof playGameOverJingle === "function") playGameOverJingle();

  // Release pointer lock so buttons are clickable
  if (controls && controls.isLocked) controls.unlock();
}
