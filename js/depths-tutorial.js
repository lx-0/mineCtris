// depths-tutorial.js — First-run contextual tutorial for The Depths dungeon mode.
// Shows non-blocking overlay tooltips at key moments during the player's first dungeon run.
// Each tooltip appears at a natural pause and auto-dismisses after a few seconds.
// Skippable via dismiss button. Doesn't replay after first completed run or first skip.
// Persists state in localStorage.
// Requires: state.js, tutorial.js, depths-upgrades.js loaded first.

var DEPTHS_TUTORIAL_DONE_KEY = 'mineCtris_depthsTutorialDone';

// Step definitions. Each step triggers at a specific moment in the dungeon flow.
// trigger values are matched by depthsTutorialNotify(event).
var DEPTHS_TUTORIAL_STEPS = [
  {
    id: 'entry',
    text: 'This is a dungeon run. Survive 7 floors to reach The Core.',
    subtext: 'Each floor gets harder. Choose your upgrades wisely.',
    trigger: 'depthsEntry',
    autoDismissMs: 5000,
  },
  {
    id: 'floor_goal',
    text: 'Clear lines before time runs out to advance.',
    subtext: 'Check the floor HUD for your target and timer.',
    trigger: 'floorStart',
    autoDismissMs: 4500,
  },
  {
    id: 'transition',
    text: 'Choose an upgrade. It lasts for the rest of your run.',
    subtext: 'Click a card or press 1 / 2 / 3 to pick.',
    trigger: 'transitionScreen',
    autoDismissMs: 0, // Don't auto-dismiss — player interacts with upgrade cards
  },
  {
    id: 'upgrade_pick',
    text: 'Upgrades come in categories: Tools, Power-ups, Stats, and Risk/Reward.',
    subtext: 'Rarer upgrades are stronger but appear less often on deeper floors.',
    trigger: 'upgradePick',
    autoDismissMs: 5000,
  },
  {
    id: 'death',
    text: 'Runs end on death. Try again — your XP is kept.',
    subtext: 'Each run teaches you more about the depths.',
    trigger: 'depthsDeath',
    autoDismissMs: 0, // Stays until results screen interaction
  },
];

var _depthsTutActive = false;
var _depthsTutStep = 0;
var _depthsTutDismissTimer = null;

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start the depths tutorial if not already completed.
 * Call when a Depths run begins (depthsLaunch / dailyDepthsLaunch).
 */
function initDepthsTutorial() {
  if (_isDepthsTutorialDone()) return;
  _depthsTutActive = true;
  _depthsTutStep = 0;
  // Immediately fire the entry tooltip
  _showDepthsTutStep(0);
}

/**
 * Notify the depths tutorial that a game event occurred.
 * @param {string} event  One of: 'depthsEntry', 'floorStart', 'transitionScreen',
 *                        'upgradePick', 'depthsDeath'
 */
function depthsTutorialNotify(event) {
  if (!_depthsTutActive) return;
  var step = DEPTHS_TUTORIAL_STEPS[_depthsTutStep];
  if (step && step.trigger === event) {
    _showDepthsTutStep(_depthsTutStep);
  }
}

/**
 * Skip the depths tutorial. Marks it as done and hides current tooltip.
 */
function skipDepthsTutorial() {
  if (!_depthsTutActive) return;
  _endDepthsTutorial();
}

/**
 * Returns true when the depths tutorial is actively running.
 */
function isDepthsTutorialActive() {
  return _depthsTutActive;
}

/**
 * Mark depths tutorial done externally (e.g. after a completed run).
 * Safe to call even if tutorial is not active.
 */
function markDepthsTutorialDone() {
  _markDepthsTutorialDone();
  if (_depthsTutActive) {
    _depthsTutActive = false;
    _hideDepthsTutTooltip();
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _isDepthsTutorialDone() {
  try {
    return localStorage.getItem(DEPTHS_TUTORIAL_DONE_KEY) === '1';
  } catch (_e) {
    return true; // localStorage unavailable — skip tutorial
  }
}

function _markDepthsTutorialDone() {
  try {
    localStorage.setItem(DEPTHS_TUTORIAL_DONE_KEY, '1');
  } catch (_e) {}
}

function _showDepthsTutStep(idx) {
  if (idx >= DEPTHS_TUTORIAL_STEPS.length) {
    _endDepthsTutorial();
    return;
  }

  var step = DEPTHS_TUTORIAL_STEPS[idx];

  var el = document.getElementById('depths-tutorial-tooltip');
  if (!el) return;

  var textEl = el.querySelector('.dtt-text');
  var subtextEl = el.querySelector('.dtt-subtext');
  var stepEl = el.querySelector('.dtt-step-count');

  if (textEl) textEl.textContent = step.text;
  if (subtextEl) {
    subtextEl.textContent = step.subtext || '';
    subtextEl.style.display = step.subtext ? 'block' : 'none';
  }
  if (stepEl) {
    stepEl.textContent = (idx + 1) + ' / ' + DEPTHS_TUTORIAL_STEPS.length;
  }

  el.style.display = 'flex';

  // Clear any existing auto-dismiss timer
  if (_depthsTutDismissTimer) {
    clearTimeout(_depthsTutDismissTimer);
    _depthsTutDismissTimer = null;
  }

  // Auto-dismiss if configured
  if (step.autoDismissMs > 0) {
    _depthsTutDismissTimer = setTimeout(function () {
      _advanceDepthsTutStep();
    }, step.autoDismissMs);
  }
}

function _advanceDepthsTutStep() {
  _hideDepthsTutTooltip();
  _depthsTutStep++;
  // Don't auto-show the next step — it will be triggered by depthsTutorialNotify
}

function _hideDepthsTutTooltip() {
  if (_depthsTutDismissTimer) {
    clearTimeout(_depthsTutDismissTimer);
    _depthsTutDismissTimer = null;
  }
  var el = document.getElementById('depths-tutorial-tooltip');
  if (el) el.style.display = 'none';
}

function _endDepthsTutorial() {
  _depthsTutActive = false;
  _markDepthsTutorialDone();
  _hideDepthsTutTooltip();
}

// Dismiss button handler — wired up once on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function () {
  var skipBtn = document.getElementById('depths-tutorial-skip');
  if (skipBtn) {
    skipBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      skipDepthsTutorial();
    });
  }
  // Also allow clicking the tooltip itself to advance
  var el = document.getElementById('depths-tutorial-tooltip');
  if (el) {
    el.addEventListener('click', function (e) {
      if (e.target.id === 'depths-tutorial-skip') return;
      if (_depthsTutActive) _advanceDepthsTutStep();
    });
  }
});
