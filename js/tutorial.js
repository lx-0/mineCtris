// tutorial.js — First-run interactive tutorial (v2.0).
// Shows a ~30-second guided intro on the player's very first visit.
// Teaches mining in context with slowed piece speed and arrow indicators.
// Each step advances on a specific player action; a Skip button is always visible.
// Requires: state.js loaded first (for global flags).

const TUTORIAL_DONE_KEY = 'mineCtris_tutorialDone';
const CRAFT_HINT_KEY    = 'mineCtris_craftHintShown';

// Step definitions — trigger values matched by tutorialNotify(event).
// Steps with autoDelay auto-advance after that many seconds regardless of trigger.
// 'dismiss' steps show a "Got it!" button.
// slowPieces: true → pieces fall at 50% speed during this step.
// suppressSpawn: true → no new pieces spawn during this step.
// arrow: 'down' | 'crosshair' | null → which arrow indicator to show.
const TUTORIAL_STEPS = [
  {
    id: 'falling',
    text: 'A piece is falling!',
    subtext: 'Watch it descend slowly.',
    trigger: 'pieceLand',
    autoDelay: 8,
    slowPieces: true,
    suppressSpawn: true,
    arrow: 'down',
  },
  {
    id: 'mine',
    text: 'Mine this block before it lands!',
    subtext: 'Aim at any block and left-click to break it.',
    trigger: 'blockMine',
    slowPieces: true,
    suppressSpawn: true,
    arrow: 'crosshair',
  },
  {
    id: 'mined',
    text: 'Nice! Mining clears space and gives you resources.',
    subtext: 'Mined blocks go into your inventory.',
    trigger: null,
    autoDelay: 3,
    slowPieces: true,
    suppressSpawn: true,
    arrow: null,
  },
  {
    id: 'lines',
    text: 'Fill gaps to trigger line clears!',
    subtext: 'Place blocks with right-click to complete rows.',
    trigger: 'lineClear',
    autoDelay: 5,
    slowPieces: true,
    suppressSpawn: false,
    arrow: null,
  },
  {
    id: 'done',
    text: 'You are ready. Survive as long as you can!',
    subtext: null,
    trigger: 'dismiss',
    slowPieces: false,
    suppressSpawn: false,
    arrow: null,
  },
];

let _tutorialActive = false;
let _tutorialStep = 0;
let _tutorialStepAge = 0; // seconds spent on current step

// ── Public API ────────────────────────────────────────────────────────────────

/** Call when the game starts (pointer lock acquired for the first time). */
function initTutorial() {
  if (_isTutorialDone()) return;
  _tutorialActive = true;
  _tutorialStep = 0;
  _tutorialStepAge = 0;
  _showStep(0);
}

/**
 * Notify the tutorial that a player action occurred.
 * @param {string} event  One of: 'pieceLand', 'blockMine', 'blockPlace', 'lineClear', 'cameraMove', 'craftingOpen'
 */
function tutorialNotify(event) {
  if (!_tutorialActive) return;
  const step = TUTORIAL_STEPS[_tutorialStep];
  if (step && step.trigger === event) {
    _advanceStep();
  }
}

/**
 * Tick the tutorial. Call every frame during active gameplay.
 * @param {number} delta  Seconds since last frame.
 */
function updateTutorial(delta) {
  if (!_tutorialActive) return;
  _tutorialStepAge += delta;
  const step = TUTORIAL_STEPS[_tutorialStep];
  if (step && step.autoDelay && _tutorialStepAge >= step.autoDelay) {
    _advanceStep();
  }
}

/** Skip the tutorial immediately. */
function skipTutorial() {
  _endTutorial();
}

/** Returns true when tutorial wants pieces to fall at 50% speed. */
function isTutorialSlowActive() {
  if (!_tutorialActive) return false;
  const step = TUTORIAL_STEPS[_tutorialStep];
  return step && step.slowPieces === true;
}

/** Returns true when tutorial wants to suppress new piece spawns. */
function isTutorialSpawnSuppressed() {
  if (!_tutorialActive) return false;
  const step = TUTORIAL_STEPS[_tutorialStep];
  return step && step.suppressSpawn === true;
}

/** Returns true when the tutorial is actively running. */
function isTutorialActive() {
  return _tutorialActive;
}

// ── Public API (context-sensitive crafting hint) ───────────────────────────────

/**
 * Check if the context-sensitive crafting hint should fire.
 * Call after any wood block is added to inventory.
 * @param {object} inv  The current inventory map (cssColor → count).
 */
function craftHintCheck(inv) {
  if (_isCraftHintShown()) return;
  // '#8b4513' is the CSS color for Wood blocks
  if ((inv['#8b4513'] || 0) < 1) return;
  _markCraftHintShown();
  _showCraftHintToast();
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _isTutorialDone() {
  try {
    return localStorage.getItem(TUTORIAL_DONE_KEY) === '1';
  } catch (_e) {
    return true; // localStorage unavailable — skip tutorial
  }
}

function _markTutorialDone() {
  try {
    localStorage.setItem(TUTORIAL_DONE_KEY, '1');
  } catch (_e) {}
}

function _isCraftHintShown() {
  try {
    return localStorage.getItem(CRAFT_HINT_KEY) === '1';
  } catch (_e) {
    return true;
  }
}

function _markCraftHintShown() {
  try {
    localStorage.setItem(CRAFT_HINT_KEY, '1');
  } catch (_e) {}
}

function _showCraftHintToast() {
  const toast = document.getElementById('craft-hint-toast');
  if (!toast) return;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

function _showStep(idx) {
  if (idx >= TUTORIAL_STEPS.length) { _endTutorial(); return; }

  const overlayEl   = document.getElementById('tutorial-overlay');
  const textEl      = document.getElementById('tutorial-text');
  const subtextEl   = document.getElementById('tutorial-subtext');
  const dismissBtn  = document.getElementById('tutorial-dismiss-btn');
  const stepCountEl = document.getElementById('tutorial-step-count');
  const ckeyEl      = document.getElementById('tutorial-ckey-icon');
  const arrowDown   = document.getElementById('tutorial-arrow-down');
  const arrowCross  = document.getElementById('tutorial-arrow-crosshair');

  if (!overlayEl || !textEl) return;

  const step = TUTORIAL_STEPS[idx];

  textEl.textContent = step.text;

  if (subtextEl) {
    subtextEl.textContent = step.subtext || '';
    subtextEl.style.display = step.subtext ? 'block' : 'none';
  }

  // Show dismiss button only on the final step
  if (dismissBtn) {
    dismissBtn.style.display = step.trigger === 'dismiss' ? 'inline-block' : 'none';
  }

  // Hide C-key icon (not used in v2.0 steps but element may still exist)
  if (ckeyEl) {
    ckeyEl.style.display = step.showCKey ? 'flex' : 'none';
  }

  // Arrow indicators
  if (arrowDown) {
    arrowDown.style.display = step.arrow === 'down' ? 'block' : 'none';
  }
  if (arrowCross) {
    arrowCross.style.display = step.arrow === 'crosshair' ? 'block' : 'none';
  }

  // Step counter e.g. "2 / 5"
  if (stepCountEl) {
    stepCountEl.textContent = (idx + 1) + ' / ' + TUTORIAL_STEPS.length;
  }

  overlayEl.style.display = 'flex';
}

function _advanceStep() {
  _tutorialStep++;
  _tutorialStepAge = 0;
  _showStep(_tutorialStep);
}

function _endTutorial() {
  // Metrics: distinguish between completing all steps vs skipping early
  var reachedFinalStep = _tutorialStep >= TUTORIAL_STEPS.length - 1;
  if (reachedFinalStep) {
    if (typeof metricsTutorialComplete === 'function') metricsTutorialComplete();
  } else {
    if (typeof metricsTutorialSkip === 'function') metricsTutorialSkip();
  }
  _tutorialActive = false;
  _markTutorialDone();
  // Award one-time tutorial completion XP
  if (typeof awardTutorialXP === 'function') awardTutorialXP();
  const overlayEl = document.getElementById('tutorial-overlay');
  if (overlayEl) overlayEl.style.display = 'none';
  // Hide arrows
  const arrowDown = document.getElementById('tutorial-arrow-down');
  const arrowCross = document.getElementById('tutorial-arrow-crosshair');
  if (arrowDown) arrowDown.style.display = 'none';
  if (arrowCross) arrowCross.style.display = 'none';
}
