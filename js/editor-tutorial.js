// editor-tutorial.js — First-time editor onboarding tutorial.
// 4-step spotlight overlay that guides new creators through the editor.
// Progress persists across refreshes so the user continues from where they left off.
// Requires: state.js loaded first.

const EDITOR_TUTORIAL_SEEN_KEY = 'mineCtris_editorTutorialSeen';
const EDITOR_TUTORIAL_STEP_KEY = 'mineCtris_editorTutorialStep';

const EDITOR_TUTORIAL_STEPS = [
  {
    id:       'place',
    title:    'Place Blocks',
    text:     'Left-click to place a block in the world.\nUse keys 1–9 to switch block types.',
    targetId: 'editor-palette',
    trigger:  'blocksPlaced',
  },
  {
    id:       'win',
    title:    'Set Win Condition',
    text:     'Choose how the player wins your puzzle.',
    targetId: 'editor-win-condition',
    trigger:  'click',
  },
  {
    id:       'preview',
    title:    'Preview Your Puzzle',
    text:     'Click Play to test it!',
    targetId: 'editor-test-btn',
    trigger:  'click',
  },
  {
    id:       'share',
    title:    'Share It!',
    text:     'Click Share to share with a friend.',
    targetId: 'editor-share-btn',
    trigger:  'click',
  },
];

let _edTutActive       = false;
let _edTutStep         = 0;
let _edTutBlocksPlaced = 0;
let _edTutListeners    = []; // { el, event, handler } entries for cleanup

// ── Public API ────────────────────────────────────────────────────────────────

/** Call after initEditorMode() — starts the tutorial on first editor open only. */
function initEditorTutorial() {
  if (_isEditorTutorialDone()) return;
  _edTutActive       = true;
  _edTutBlocksPlaced = 0;
  _edTutStep         = _loadEditorTutorialStep();
  _showEditorTutorialStep(_edTutStep);
}

/** Call from editorPlaceBlock() each time a block is successfully placed. */
function editorTutorialNotifyBlockPlaced() {
  if (!_edTutActive || _edTutStep !== 0) return;
  _edTutBlocksPlaced++;
  _updateEdTutSubtext();
  if (_edTutBlocksPlaced >= 3) {
    _advanceEditorTutorial();
  }
}

/** Skip the entire tutorial immediately. */
function skipEditorTutorial() {
  _endEditorTutorial();
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _isEditorTutorialDone() {
  try { return localStorage.getItem(EDITOR_TUTORIAL_SEEN_KEY) === 'true'; }
  catch (_) { return true; }
}

function _markEditorTutorialDone() {
  try { localStorage.setItem(EDITOR_TUTORIAL_SEEN_KEY, 'true'); }
  catch (_) {}
}

function _loadEditorTutorialStep() {
  try {
    const v = parseInt(localStorage.getItem(EDITOR_TUTORIAL_STEP_KEY), 10);
    return isNaN(v) ? 0 : Math.min(v, EDITOR_TUTORIAL_STEPS.length - 1);
  } catch (_) { return 0; }
}

function _saveEditorTutorialStep(idx) {
  try { localStorage.setItem(EDITOR_TUTORIAL_STEP_KEY, String(idx)); }
  catch (_) {}
}

function _showEditorTutorialStep(idx) {
  _cleanupEdTutListeners();

  if (idx >= EDITOR_TUTORIAL_STEPS.length) {
    _endEditorTutorial();
    return;
  }

  _saveEditorTutorialStep(idx);

  const step        = EDITOR_TUTORIAL_STEPS[idx];
  const panelEl     = document.getElementById('editor-tutorial-panel');
  const spotlightEl = document.getElementById('editor-tutorial-spotlight');
  const titleEl     = document.getElementById('editor-tut-title');
  const textEl      = document.getElementById('editor-tut-text');
  const subtextEl   = document.getElementById('editor-tut-subtext');
  const countEl     = document.getElementById('editor-tut-count');

  if (!panelEl || !spotlightEl) return;

  if (titleEl)  titleEl.textContent = step.title;
  if (textEl)   textEl.textContent  = step.text;

  const subtext = _getStepSubtext(idx);
  if (subtextEl) {
    subtextEl.textContent   = subtext;
    subtextEl.style.display = subtext ? 'block' : 'none';
  }

  if (countEl) countEl.textContent = (idx + 1) + ' / ' + EDITOR_TUTORIAL_STEPS.length;

  panelEl.style.display = 'flex';

  // Position spotlight ring over target element
  const targetEl = document.getElementById(step.targetId);
  if (targetEl) {
    const r   = targetEl.getBoundingClientRect();
    const pad = 8;
    spotlightEl.style.left    = (r.left   - pad) + 'px';
    spotlightEl.style.top     = (r.top    - pad) + 'px';
    spotlightEl.style.width   = (r.width  + pad * 2) + 'px';
    spotlightEl.style.height  = (r.height + pad * 2) + 'px';
    spotlightEl.style.display = 'block';
  } else {
    spotlightEl.style.display = 'none';
  }

  // Attach one-time click listener for click-triggered steps
  if (step.trigger === 'click' && targetEl) {
    const handler = function () { _advanceEditorTutorial(); };
    targetEl.addEventListener('click', handler, { once: true });
    _edTutListeners.push({ el: targetEl, event: 'click', handler });
  }
}

function _getStepSubtext(idx) {
  if (idx === 0) {
    const remaining = Math.max(0, 3 - _edTutBlocksPlaced);
    if (remaining === 0) return '';
    return 'Place ' + remaining + ' block' + (remaining === 1 ? '' : 's') + ' to continue.';
  }
  return '';
}

function _updateEdTutSubtext() {
  const subtextEl = document.getElementById('editor-tut-subtext');
  if (!subtextEl) return;
  const text = _getStepSubtext(_edTutStep);
  subtextEl.textContent   = text;
  subtextEl.style.display = text ? 'block' : 'none';
}

function _advanceEditorTutorial() {
  _edTutStep++;
  _showEditorTutorialStep(_edTutStep);
}

function _endEditorTutorial() {
  _edTutActive = false;
  _markEditorTutorialDone();
  _cleanupEdTutListeners();
  try { localStorage.removeItem(EDITOR_TUTORIAL_STEP_KEY); } catch (_) {}

  const panelEl     = document.getElementById('editor-tutorial-panel');
  const spotlightEl = document.getElementById('editor-tutorial-spotlight');
  if (panelEl)     panelEl.style.display     = 'none';
  if (spotlightEl) spotlightEl.style.display = 'none';
}

function _cleanupEdTutListeners() {
  _edTutListeners.forEach(function (item) {
    item.el.removeEventListener(item.event, item.handler);
  });
  _edTutListeners = [];
}
