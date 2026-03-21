// Biome gameplay rules — per-biome physics and board modifiers for Expedition mode.
// Applies ONLY when activeBiomeId is set (i.e., inside an expedition run).
// Cleared on game reset via clearBiomeRules(), which is called from gamestate.js.
//
// Requires: config.js (LINE_CLEAR_CELLS_NEEDED)
// Used by: pieces.js (fall speed, lock delay, drift), lineclear.js (cell threshold),
//          biome-themes.js (apply/clear lifecycle), gamestate.js (reset)

// ── Biome rule definitions ─────────────────────────────────────────────────────

const BIOME_RULES = {
  // Stone — baseline reference, no gameplay changes.
  stone: {
    fallSpeedMult:        1.0,   // standard fall speed
    lockDelayMs:          0,     // no lock delay
    lockDrift:            false, // no lateral drift
    lineClearCellsNeeded: null,  // null = use global LINE_CLEAR_CELLS_NEEDED (100)
    scoreMultiplier:      1.0,
  },

  // Forest — wider board (12-column equivalent vs standard 10).
  // More cells needed to clear a line; pieces must fill a larger area.
  forest: {
    fallSpeedMult:        1.0,
    lockDelayMs:          0,
    lockDrift:            false,
    lineClearCellsNeeded: 144,   // 12×12 vs default 10×10 = 100
    scoreMultiplier:      1.0,
  },

  // Nether — 1.5× gravity. Combined with difficultyMultiplier, intensity grows
  // naturally at higher levels without any extra logic.
  nether: {
    fallSpeedMult:        1.5,
    lockDelayMs:          0,
    lockDrift:            false,
    lineClearCellsNeeded: null,
    scoreMultiplier:      1.2,
  },

  // Ice — 500 ms lock delay after landing; small lateral drift during delay.
  // Lock delay must not allow score manipulation (scoring fires on actual lock).
  ice: {
    fallSpeedMult:        1.0,
    lockDelayMs:          500,
    lockDrift:            true,
    lineClearCellsNeeded: null,
    scoreMultiplier:      1.1,
  },
};

// ── Active rule state ──────────────────────────────────────────────────────────

let _activeBiomeRules = null;  // null when not in expedition mode

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Apply gameplay rules for the given biome.
 * Called alongside applyBiomeTheme() when an expedition run starts.
 */
function applyBiomeRules(biomeId) {
  _activeBiomeRules = (biomeId && BIOME_RULES[biomeId]) ? BIOME_RULES[biomeId] : null;
}

/**
 * Clear biome rules after an expedition run ends.
 * Called alongside clearBiomeTheme() in gamestate.js resetGame().
 */
function clearBiomeRules() {
  _activeBiomeRules = null;
}

/**
 * Returns the active BIOME_RULES entry, or null when not in expedition mode.
 */
function getActiveBiomeRules() {
  return _activeBiomeRules;
}

/**
 * Returns the effective LINE_CLEAR_CELLS_NEEDED for the current run.
 * Uses the biome override when set, otherwise the global constant.
 */
function getLineClearCellsNeeded() {
  if (_activeBiomeRules && _activeBiomeRules.lineClearCellsNeeded !== null) {
    return _activeBiomeRules.lineClearCellsNeeded;
  }
  return LINE_CLEAR_CELLS_NEEDED;
}

/**
 * Returns the biome fall-speed multiplier (1.0 if no active biome rule).
 * Stacks multiplicatively with world-modifier and co-op fall multipliers.
 */
function getBiomeFallSpeedMult() {
  return _activeBiomeRules ? (_activeBiomeRules.fallSpeedMult || 1.0) : 1.0;
}

/**
 * Returns the lock delay in seconds (0 = no delay) for the active biome.
 */
function getBiomeLockDelaySecs() {
  return _activeBiomeRules && _activeBiomeRules.lockDelayMs > 0
    ? _activeBiomeRules.lockDelayMs / 1000
    : 0;
}

/**
 * Returns true if lateral drift should be applied during Ice lock delay.
 */
function getBiomeLockDrift() {
  return _activeBiomeRules ? !!_activeBiomeRules.lockDrift : false;
}
