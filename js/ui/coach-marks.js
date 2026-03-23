// coach-marks.js — Post-tutorial contextual coach marks for first 3 games.
// Shows one-time non-blocking toasts at key gameplay moments to bridge
// the gap between tutorial completion and mastery.
// Requires: stats.js (loadLifetimeStats), leveling.js, mode-unlock.js, state.js

const _CM_STORAGE_PREFIX = 'mineCtris_cm_';
const _CM_GAMES_LIMIT = 3; // only show coach marks during first 3 games
const _CM_DISMISS_MS = 4500; // auto-dismiss after 4.5 seconds

let _cmActiveToast = null; // { timerId }
let _cmEl = null; // cached DOM element
let _cmQueue = []; // queued messages (show sequentially, not overlapping)

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Fire the "first combo" coach mark.
 * Call from lineclear.js when comboCount reaches 2 for the first time.
 * @param {number} comboCount
 */
function coachMarkCombo(comboCount) {
  if (comboCount < 2) return;
  _cmShow('firstCombo', 'COMBO! Chain line clears for bonus points.');
}

/**
 * Fire the "first speed increase" coach mark.
 * Call from gamestate.js when a new difficulty tier is reached.
 * @param {number} tier
 */
function coachMarkSpeedUp(tier) {
  if (tier < 1) return;
  _cmShow('firstSpeedUp', 'Getting faster! The longer you survive, the harder it gets.');
}

/**
 * Fire the "first game over" coach mark — highlights XP and leveling.
 * Call from gamestate.js triggerGameOver.
 */
function coachMarkGameOver() {
  _cmShow('firstGameOver', 'Earn XP to unlock new modes! Check the XP bar above.');
}

/**
 * Fire the "first block placement" coach mark.
 * Call from main.js placeBlock() after a successful placement outside the tutorial.
 */
function coachMarkBlockPlacement() {
  _cmShow('blockPlacement', 'Nice! Place blocks to fill gaps and set up line clears.');
}

/**
 * Fire the "level 2 unlock" coach mark — Sprint mode unlocked.
 * Call from leveling.js checkLevelUp or mode-unlock.js.
 * @param {number} newLevel
 */
function coachMarkModeUnlock(newLevel) {
  if (newLevel < 2) return;
  _cmShow('level2Unlock', 'NEW MODE UNLOCKED! Sprint \u2014 clear 40 lines as fast as you can.');
}

// ── Internal helpers ────────────────────────────────────────────────────────

/** Check if we're within the first N games. */
function _cmWithinGameLimit() {
  if (typeof loadLifetimeStats !== 'function') return false;
  var stats = loadLifetimeStats();
  return (stats.gamesPlayed || 0) < _CM_GAMES_LIMIT;
}

/** Check if this coach mark has already been shown. */
function _cmHasShown(key) {
  try {
    return localStorage.getItem(_CM_STORAGE_PREFIX + key) === '1';
  } catch (_) {
    return true; // localStorage unavailable — skip
  }
}

/** Mark a coach mark as shown. */
function _cmMarkShown(key) {
  try {
    localStorage.setItem(_CM_STORAGE_PREFIX + key, '1');
  } catch (_) {}
}

/** Attempt to show a coach mark toast. */
function _cmShow(key, text) {
  // Don't show during tutorial
  if (typeof isTutorialActive === 'function' && isTutorialActive()) return;
  // Only during first N games (game-over coach mark checks after stats submit,
  // so use <= to include the game that just ended)
  if (key !== 'firstGameOver' && !_cmWithinGameLimit()) return;
  if (key === 'firstGameOver') {
    // For game-over, check gamesPlayed <= limit (just incremented by submitLifetimeStats)
    if (typeof loadLifetimeStats === 'function') {
      var stats = loadLifetimeStats();
      if ((stats.gamesPlayed || 0) > _CM_GAMES_LIMIT) return;
    }
  }
  // Already shown?
  if (_cmHasShown(key)) return;

  _cmMarkShown(key);

  // Queue the toast (don't overlap with other coach marks or game tooltips)
  _cmQueue.push(text);
  if (!_cmActiveToast) _cmDrainQueue();
}

function _cmDrainQueue() {
  if (!_cmQueue.length) { _cmActiveToast = null; return; }

  // Wait briefly if a game tooltip is active (avoid visual overlap)
  if (typeof _gtActiveTooltip !== 'undefined' && _gtActiveTooltip) {
    setTimeout(_cmDrainQueue, 500);
    return;
  }

  var text = _cmQueue.shift();
  _cmDisplayToast(text);
}

function _cmDisplayToast(text) {
  if (!_cmEl) _cmEl = document.getElementById('coach-mark-toast');
  if (!_cmEl) { _cmActiveToast = null; _cmDrainQueue(); return; }

  _cmEl.textContent = text;
  _cmEl.style.display = 'block';
  _cmEl.classList.remove('cm-slide-in');
  void _cmEl.offsetWidth; // force reflow
  _cmEl.classList.add('cm-slide-in');

  var timerId = setTimeout(function () {
    _cmEl.classList.remove('cm-slide-in');
    _cmEl.style.display = 'none';
    _cmActiveToast = null;
    // Drain next queued coach mark after a short gap
    setTimeout(_cmDrainQueue, 400);
  }, _CM_DISMISS_MS);

  _cmActiveToast = { timerId: timerId };
}
