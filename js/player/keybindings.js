// Central keybinding configuration.
// Loaded before player.js. Provides:
//   getKeyBinding(action)    → current key code for an action
//   _resolveKeyCode(code)    → translates a pressed key code to its canonical
//                              default code so existing switch/case logic works
//                              unchanged after a rebind.
//   setKeyBinding(action, code) → rebind with automatic conflict swap
//   applyKeyPreset(name)     → apply a named preset ('default'|'arrows'|'leftHanded')
//   resetKeyBindings()       → restore factory defaults
//   getAllBindings()         → snapshot of all current bindings

const KEYBINDING_STORAGE_KEY = "mineCtris_keyBindings";

// Human-readable labels used by the settings UI.
const KB_ACTION_LABELS = {
  moveForward:  "Move Forward",
  moveLeft:     "Move Left",
  moveBackward: "Move Back",
  moveRight:    "Move Right",
  jump:         "Jump / Drop",
  nudgeLeft:    "Rotate CCW",
  nudgeRight:   "Rotate CW",
  craft:        "Crafting",
  powerup:      "Use Power-up",
  iceBridge:    "Ice Bridge",
};

// Factory-default key codes (must stay immutable — used as canonical IDs).
const KB_DEFAULTS = {
  moveForward:  "KeyW",
  moveLeft:     "KeyA",
  moveBackward: "KeyS",
  moveRight:    "KeyD",
  jump:         "Space",
  nudgeLeft:    "KeyQ",
  nudgeRight:   "KeyE",
  craft:        "KeyC",
  powerup:      "KeyF",
  iceBridge:    "KeyG",
};

// Named presets.
const KB_PRESETS = {
  default: {
    moveForward:  "KeyW",
    moveLeft:     "KeyA",
    moveBackward: "KeyS",
    moveRight:    "KeyD",
    jump:         "Space",
    nudgeLeft:    "KeyQ",
    nudgeRight:   "KeyE",
    craft:        "KeyC",
    powerup:      "KeyF",
    iceBridge:    "KeyG",
  },
  arrows: {
    moveForward:  "ArrowUp",
    moveLeft:     "ArrowLeft",
    moveBackward: "ArrowDown",
    moveRight:    "ArrowRight",
    jump:         "Space",
    nudgeLeft:    "KeyQ",
    nudgeRight:   "KeyE",
    craft:        "KeyC",
    powerup:      "KeyF",
    iceBridge:    "KeyG",
  },
  leftHanded: {
    moveForward:  "KeyI",
    moveLeft:     "KeyJ",
    moveBackward: "KeyK",
    moveRight:    "KeyL",
    jump:         "Space",
    nudgeLeft:    "KeyU",
    nudgeRight:   "KeyO",
    craft:        "KeyC",
    powerup:      "KeyF",
    iceBridge:    "KeyG",
  },
};

// Live bindings — mutated by setKeyBinding / applyKeyPreset / resetKeyBindings.
let _kbBindings = Object.assign({}, KB_DEFAULTS);

// Reverse map: key code → action name. Rebuilt whenever bindings change.
let _kbReverseMap = {};

function _rebuildReverseMap() {
  _kbReverseMap = {};
  for (const action of Object.keys(_kbBindings)) {
    _kbReverseMap[_kbBindings[action]] = action;
  }
}

function _loadKeyBindings() {
  try {
    const raw = localStorage.getItem(KEYBINDING_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    for (const action of Object.keys(KB_DEFAULTS)) {
      if (typeof saved[action] === "string" && saved[action].length > 0) {
        _kbBindings[action] = saved[action];
      }
    }
  } catch (_) {}
  _rebuildReverseMap();
}

function _saveKeyBindings() {
  try {
    localStorage.setItem(KEYBINDING_STORAGE_KEY, JSON.stringify(_kbBindings));
  } catch (_) {}
}

/** Returns the currently bound key code for an action (falls back to default). */
function getKeyBinding(action) {
  return _kbBindings[action] || KB_DEFAULTS[action] || null;
}

/**
 * Translates a physical key code to the canonical default code for its action.
 * This lets existing switch/case statements (which use default key codes) work
 * unchanged regardless of how keys are rebound.
 *
 * Example: user rebinds moveForward to ArrowUp.
 *   _resolveKeyCode("ArrowUp") → "KeyW"  (the default for moveForward)
 *   Existing `case "KeyW":` fires correctly.
 */
function _resolveKeyCode(code) {
  const action = _kbReverseMap[code];
  if (action && KB_DEFAULTS[action]) {
    return KB_DEFAULTS[action];
  }
  return code;
}

/**
 * Rebind an action to a new key code.
 * If the new code is already bound to another action, the two bindings are swapped.
 * Returns the action that was displaced (if any), or null.
 */
function setKeyBinding(action, newCode) {
  if (!(action in KB_DEFAULTS)) return null;
  const displaced = _kbReverseMap[newCode];
  if (displaced && displaced !== action) {
    // Swap: give the displaced action the old code of the action being rebound.
    _kbBindings[displaced] = _kbBindings[action];
  }
  _kbBindings[action] = newCode;
  _rebuildReverseMap();
  _saveKeyBindings();
  return displaced || null;
}

/** Apply a named preset ('default' | 'arrows' | 'leftHanded'). */
function applyKeyPreset(presetName) {
  const preset = KB_PRESETS[presetName];
  if (!preset) return;
  _kbBindings = Object.assign({}, preset);
  _rebuildReverseMap();
  _saveKeyBindings();
}

/** Reset all bindings to factory defaults. */
function resetKeyBindings() {
  _kbBindings = Object.assign({}, KB_DEFAULTS);
  _rebuildReverseMap();
  _saveKeyBindings();
}

/** Returns a snapshot of all current bindings. */
function getAllBindings() {
  return Object.assign({}, _kbBindings);
}

// Initialise on load.
_loadKeyBindings();
_rebuildReverseMap();
