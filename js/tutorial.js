// tutorial.js — First-run tutorial overlay.
// Shows a 7-step guided intro on the player's very first visit.
// Each step advances on a specific player action; a Skip button is always visible.
// Requires: state.js loaded first (for global flags).

const TUTORIAL_DONE_KEY = 'mineCtris_tutorialDone';
const CRAFT_HINT_KEY    = 'mineCtris_craftHintShown';

// Step definitions — trigger values matched by tutorialNotify(event).
// Steps with autoDelay auto-advance after that many seconds regardless of trigger.
// 'dismiss' steps show a "Got it!" button.
const TUTORIAL_STEPS = [
  {
    id: 'look',
    text: 'Move your mouse to look around.',
    subtext: null,
    trigger: 'cameraMove',
  },
  {
    id: 'piece',
    text: 'A piece is falling — it will land here.',
    subtext: 'The shadow shows the landing spot.',
    trigger: 'pieceLand',
  },
  {
    id: 'mine',
    text: 'Mine blocks with left-click.',
    subtext: 'Aim at any block and click to break it.',
    trigger: 'blockMine',
  },
  {
    id: 'place',
    text: 'Place blocks with right-click.',
    subtext: 'Use collected blocks to fill gaps.',
    trigger: 'blockPlace',
  },
  {
    id: 'lines',
    text: 'Fill rows to clear lines and score points!',
    subtext: null,
    trigger: 'lineClear',
    autoDelay: 4,
  },
  {
    id: 'craft',
    text: 'Press C to open the Crafting Panel. Combine materials to build better tools!',
    subtext: null,
    trigger: 'craftingOpen',
    autoDelay: 8,
    showCKey: true,
  },
  {
    id: 'done',
    text: 'Survive as long as you can.',
    subtext: 'Good luck!',
    trigger: 'dismiss',
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
 * @param {string} event  One of: 'cameraMove', 'pieceLand', 'blockMine', 'blockPlace'
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
    if (step.id === 'craft') {
      // Auto-advance with a note that the player can try crafting later
      _showAutoAdvanceNote();
    }
    _advanceStep();
  }
}

/** Skip the tutorial immediately. */
function skipTutorial() {
  _endTutorial();
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

function _showAutoAdvanceNote() {
  const subtextEl = document.getElementById('tutorial-subtext');
  if (subtextEl) {
    subtextEl.textContent = "Try pressing C later!";
    subtextEl.style.display = 'block';
  }
}

function _showStep(idx) {
  if (idx >= TUTORIAL_STEPS.length) { _endTutorial(); return; }

  const overlayEl   = document.getElementById('tutorial-overlay');
  const textEl      = document.getElementById('tutorial-text');
  const subtextEl   = document.getElementById('tutorial-subtext');
  const dismissBtn  = document.getElementById('tutorial-dismiss-btn');
  const stepCountEl = document.getElementById('tutorial-step-count');
  const ckeyEl      = document.getElementById('tutorial-ckey-icon');

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

  // Show pulsing C-key icon on crafting step
  if (ckeyEl) {
    ckeyEl.style.display = step.showCKey ? 'flex' : 'none';
  }

  // Step counter e.g. "3 / 7"
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
  _tutorialActive = false;
  _markTutorialDone();
  const overlayEl = document.getElementById('tutorial-overlay');
  if (overlayEl) overlayEl.style.display = 'none';
}
