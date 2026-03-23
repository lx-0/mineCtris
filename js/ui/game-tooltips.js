// game-tooltips.js — Contextual tooltips for first Classic game (v2.0).
// Shows one-time floating tips at key gameplay moments after the tutorial ends.
// Each tooltip fires once per lifetime (LocalStorage). Non-blocking, auto-dismiss.
// Requires: state.js, config.js, gamestate.js, tutorial.js loaded first.

const _GT_STORAGE_PREFIX = 'mineCtris_gt_';
const _GT_DISMISS_MS = 4000; // auto-dismiss after 4 seconds

// Tooltip definitions keyed by event name.
const GAME_TOOLTIPS = {
  inventoryPickup: {
    text: 'Blocks go to your inventory. Use them to fill gaps!',
    key: 'inventoryPickup',
  },
  lineClearOpportunity: {
    text: 'That row is almost complete \u2014 fill the gap!',
    key: 'lineClearOpportunity',
  },
  dangerWarning: {
    text: 'Warning! Mine faster or you will be buried!',
    key: 'dangerWarning',
  },
  lineClear: {
    text: 'Line clear! Keep it up!',
    key: 'lineClear',
  },
  gameOver: {
    text: 'Game over. Your score: {score}. Play again to unlock new modes!',
    key: 'gameOver',
  },
};

let _gtActiveTooltip = null; // { key, timerId }
let _gtEl = null; // cached DOM element

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Fire a game tooltip by event name.
 * Ignored if tutorial is active, tooltip already shown, or another tooltip visible.
 * @param {string} event  One of: 'inventoryPickup', 'lineClearOpportunity',
 *                        'dangerWarning', 'lineClear', 'gameOver'
 * @param {object} [data] Optional data for template substitution (e.g. { score: 1234 })
 */
function gameTooltip(event, data) {
  // Don't show during tutorial
  if (typeof isTutorialActive === 'function' && isTutorialActive()) return;

  const def = GAME_TOOLTIPS[event];
  if (!def) return;

  // Already shown this tooltip lifetime?
  if (_gtHasShown(def.key)) return;

  // Another tooltip currently visible? Skip (don't queue).
  if (_gtActiveTooltip) return;

  _gtMarkShown(def.key);

  let text = def.text;
  if (data) {
    Object.keys(data).forEach(function (k) {
      text = text.replace('{' + k + '}', data[k]);
    });
  }

  _gtShow(text);
}

/**
 * Dismiss the current tooltip immediately (e.g. on player action).
 */
function gameTooltipDismiss() {
  if (_gtActiveTooltip) {
    clearTimeout(_gtActiveTooltip.timerId);
    _gtHide();
  }
}

/**
 * Check if any row is nearly complete (≥90% filled) and fire the tooltip.
 * Call after a piece lands.
 */
function gameTooltipCheckNearlyFull() {
  if (typeof isTutorialActive === 'function' && isTutorialActive()) return;
  if (_gtHasShown('lineClearOpportunity')) return;

  const threshold = Math.floor(
    (typeof getLineClearCellsNeeded === 'function'
      ? getLineClearCellsNeeded()
      : LINE_CLEAR_CELLS_NEEDED) * 0.9
  );

  if (typeof gridOccupancy === 'undefined') return;
  gridOccupancy.forEach(function (layer) {
    if (layer.size >= threshold) {
      gameTooltip('lineClearOpportunity');
    }
  });
}

// ── Internal helpers ────────────────────────────────────────────────────────

function _gtHasShown(key) {
  try {
    return localStorage.getItem(_GT_STORAGE_PREFIX + key) === '1';
  } catch (_e) {
    return true; // localStorage unavailable — skip tooltips
  }
}

function _gtMarkShown(key) {
  try {
    localStorage.setItem(_GT_STORAGE_PREFIX + key, '1');
  } catch (_e) {}
}

function _gtShow(text) {
  if (!_gtEl) _gtEl = document.getElementById('game-tooltip');
  if (!_gtEl) return;

  _gtEl.textContent = text;
  _gtEl.style.display = 'block';
  // Trigger reflow for animation restart
  _gtEl.classList.remove('gt-pulse');
  void _gtEl.offsetWidth;
  _gtEl.classList.add('gt-pulse');

  const timerId = setTimeout(_gtHide, _GT_DISMISS_MS);
  _gtActiveTooltip = { timerId: timerId };
}

function _gtHide() {
  if (!_gtEl) _gtEl = document.getElementById('game-tooltip');
  if (_gtEl) {
    _gtEl.style.display = 'none';
    _gtEl.classList.remove('gt-pulse');
  }
  _gtActiveTooltip = null;
}
