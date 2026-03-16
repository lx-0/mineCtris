// Blitz mode — personal best tracking, and blitz-complete overlay.
// Requires: state.js (isBlitzMode, blitzTimerActive, blitzRemainingMs, blitzComplete,
//           blitzBonusActive, score, blocksMined, linesCleared, blocksPlaced,
//           sessionCrafts, sessionHighestComboCount, lastDifficultyTier, isGameOver,
//           gameTimerRunning, controls),
//           gamestate.js (submitLifetimeStats)

const BLITZ_STORAGE_KEY = "mineCtris_blitzBest";

/**
 * Load the personal best Blitz score from localStorage.
 * Returns { score: number, date: string } or null if no record exists.
 */
function loadBlitzBest() {
  try {
    const raw = localStorage.getItem(BLITZ_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/**
 * Save a Blitz score if it beats the existing personal best.
 * Returns true if this is a new personal best.
 */
function saveBlitzBest(finalScore) {
  const existing = loadBlitzBest();
  if (existing && existing.score >= finalScore) return false;
  try {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(BLITZ_STORAGE_KEY, JSON.stringify({ score: finalScore, date: today }));
  } catch (_) {}
  return true;
}

/**
 * Freeze gameplay, evaluate the personal best, and show the blitz-complete overlay.
 * Called once when blitzRemainingMs reaches 0.
 */
function triggerBlitzComplete() {
  if (blitzComplete) return;
  blitzComplete    = true;
  blitzTimerActive = false;
  isGameOver       = true;
  gameTimerRunning = false;

  // Hide danger overlay (not expected in Blitz, but be safe)
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

  // Award XP
  const _blitzXpBefore = (loadLifetimeStats().playerXP || 0);
  const { xpEarned: _blitzXP, streakBonus: _blitzStreak } = awardXP(score, 'blitz');
  const blitzXpEl = document.getElementById('blitz-xp-earned');
  if (blitzXpEl) {
    blitzXpEl.textContent = '+ ' + _blitzXP + ' XP' + (_blitzStreak ? '  (Streak Bonus!)' : '');
    blitzXpEl.className = 'xp-earned-display' + (_blitzStreak ? ' xp-streak' : '');
  }
  if (typeof checkLevelUp === 'function') checkLevelUp(_blitzXpBefore, loadLifetimeStats().playerXP || 0);

  const finalScore = score;
  const isNewBest  = saveBlitzBest(finalScore);
  const best       = loadBlitzBest();

  // Achievement: Blitz Bomber
  if (typeof achOnBlitzComplete === "function") achOnBlitzComplete(finalScore);

  // Daily missions: blitz session end
  if (typeof onMissionBlitzEnd === "function") onMissionBlitzEnd(finalScore);

  // Populate blitz-complete overlay
  const overlayEl = document.getElementById("blitz-complete-screen");
  if (overlayEl) {
    const scoreDisplayEl = document.getElementById("blitz-final-score");
    if (scoreDisplayEl) scoreDisplayEl.textContent = finalScore;

    const pbEl = document.getElementById("blitz-personal-best");
    if (pbEl) {
      pbEl.textContent = isNewBest
        ? "NEW PERSONAL BEST!"
        : (best ? "Best: " + best.score : "");
      pbEl.className = isNewBest ? "blitz-new-best" : "blitz-pb-line";
    }

    overlayEl.style.display = "flex";
  }

  // Fade music and play completion jingle
  if (typeof stopBgMusic        === "function") stopBgMusic();
  if (typeof playGameOverJingle === "function") playGameOverJingle();

  // Release pointer lock so buttons are clickable
  if (controls && controls.isLocked) controls.unlock();
}
