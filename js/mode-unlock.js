// Progressive mode unlock system — gates game modes behind XP level thresholds.
// Requires: leveling.js (getPlayerLevel, checkLevelUp)

// ── Unlock table ────────────────────────────────────────────────────────────
// Maps mode keys (matching data-mode on cards or element IDs) to unlock levels.
// Level 0 = unlocked from the start.

const MODE_UNLOCK_TABLE = {
  classic:    0,
  sprint:     2,
  blitz:      2,
  puzzle:     4,
  daily:      6,
  weekly:     6,
  survival:   8,
  battle:     10,
  expedition: 12,
  depths:     14,
  coop:       16,
  tournament: 18,
  clan_wars:  18,
  editor:     20,
};

// Ordered list for unlock notification lookups
const MODE_UNLOCK_LIST = Object.entries(MODE_UNLOCK_TABLE)
  .sort(function (a, b) { return a[1] - b[1]; })
  .map(function (pair) { return { mode: pair[0], level: pair[1] }; });

// ── "Show all modes" toggle ───────────────────────────────────────────────
// When enabled, all modes are visible and playable regardless of level.

const SHOW_ALL_MODES_KEY = 'mineCtris_showAllModes';

function isShowAllModesEnabled() {
  try { return localStorage.getItem(SHOW_ALL_MODES_KEY) === 'true'; } catch (_) { return false; }
}

function setShowAllModes(enabled) {
  try { localStorage.setItem(SHOW_ALL_MODES_KEY, String(!!enabled)); } catch (_) {}
  if (typeof applyModeUnlockState === 'function') applyModeUnlockState();
}

// ── Returning player detection ────────────────────────────────────────────
// On first load with progressive unlock, check if the player has existing data.
// If so, auto-enable "Show all modes" and grant XP credit for prior progress.

const _RETURNING_PLAYER_CHECKED_KEY = 'mineCtris_returningPlayerChecked';

/**
 * Detect returning players by checking for meaningful play history.
 * Called once during init. Requires 5+ games, 5000+ total score, or any
 * mode-specific high score. Qualifying players get "Show all modes" enabled
 * and XP credit for existing progress.
 */
function detectReturningPlayer() {
  try {
    // Only run this check once ever
    if (localStorage.getItem(_RETURNING_PLAYER_CHECKED_KEY) === 'true') return;

    // Check for meaningful play history — not just any localStorage key.
    // Require 5+ games, 5000+ total score, or any mode-specific high score.
    var isReturningPlayer = false;
    if (typeof loadLifetimeStats === 'function') {
      var stats = loadLifetimeStats();
      if ((stats.gamesPlayed || 0) >= 5 || (stats.totalScore || 0) >= 5000) {
        isReturningPlayer = true;
      }
    }
    if (!isReturningPlayer) {
      // Check for any mode-specific high score > 0
      var bestKeys = [
        'mineCtris_dailyBest', 'mineCtris_weeklyBest',
        'mineCtris_sprintBest', 'mineCtris_blitzBest',
      ];
      for (var i = 0; i < bestKeys.length; i++) {
        var raw = localStorage.getItem(bestKeys[i]);
        if (raw !== null) {
          try {
            var parsed = JSON.parse(raw);
            var score = typeof parsed === 'number' ? parsed : (parsed && parsed.score) || 0;
            if (score > 0) { isReturningPlayer = true; break; }
          } catch (_) {
            // Non-JSON value — treat as evidence if non-empty
            if (raw && raw !== '0') { isReturningPlayer = true; break; }
          }
        }
      }
    }

    if (isReturningPlayer) {
      // Auto-enable "Show all modes" for returning players
      localStorage.setItem(SHOW_ALL_MODES_KEY, 'true');

      // Grant XP credit for existing progress if they have no XP yet
      if (typeof loadLifetimeStats === 'function' && typeof saveLifetimeStats === 'function') {
        var stats = loadLifetimeStats();
        if ((stats.playerXP || 0) === 0 && stats.gamesPlayed > 0) {
          // Estimate XP from historical stats: score-based + game count bonus
          var estimatedXP = Math.floor((stats.totalScore || 0) / 50)
                          + (stats.gamesPlayed || 0) * 10
                          + (stats.dailyChallengesCompleted || 0) * 50
                          + (stats.puzzlesCompleted || 0) * 30;
          if (estimatedXP > 0) {
            stats.playerXP = estimatedXP;
            saveLifetimeStats(stats);
          }
        }
      }
    }

    // Mark detection as done so it never runs again
    localStorage.setItem(_RETURNING_PLAYER_CHECKED_KEY, 'true');
  } catch (_) {}
}

// ── LocalStorage cache ──────────────────────────────────────────────────────
// Cache the last-known player level so the UI can render lock states immediately
// before stats finish loading.

const _UNLOCK_CACHE_KEY = 'mineCtris_unlockedLevel';

function _getCachedUnlockLevel() {
  try {
    var v = parseInt(localStorage.getItem(_UNLOCK_CACHE_KEY), 10);
    return isNaN(v) ? 0 : v;
  } catch (_) { return 0; }
}

function _setCachedUnlockLevel(level) {
  try { localStorage.setItem(_UNLOCK_CACHE_KEY, String(level)); } catch (_) {}
}

// ── Query helpers ───────────────────────────────────────────────────────────

/** Check if a mode is unlocked at the given player level. */
function isModeUnlocked(modeKey, playerLevel) {
  if (isShowAllModesEnabled()) return true;
  var required = MODE_UNLOCK_TABLE[modeKey];
  if (required === undefined) return true; // unknown mode = unlocked
  return playerLevel >= required;
}

/** Return the level required to unlock a mode (or 0 if always unlocked). */
function getModeUnlockLevel(modeKey) {
  return MODE_UNLOCK_TABLE[modeKey] || 0;
}

/** Return list of modes newly unlocked between oldLevel and newLevel. */
function getNewlyUnlockedModes(oldLevel, newLevel) {
  var result = [];
  for (var i = 0; i < MODE_UNLOCK_LIST.length; i++) {
    var entry = MODE_UNLOCK_LIST[i];
    if (entry.level > oldLevel && entry.level <= newLevel && entry.level > 0) {
      result.push(entry);
    }
  }
  return result;
}

// ── UI: apply lock/unlock state to mode select screen ───────────────────────

/** Human-readable mode names for tooltips. */
var _MODE_DISPLAY_NAMES = {
  classic: 'Classic', sprint: 'Sprint', blitz: 'Blitz', puzzle: 'Puzzle',
  daily: 'Daily Challenge', weekly: 'Weekly Challenge', survival: 'Survival',
  battle: 'Battle', expedition: 'Expeditions', depths: 'The Depths',
  coop: 'Co-op', tournament: 'Tournament', clan_wars: 'Clan Wars',
  editor: 'Editor',
};

/**
 * Apply lock/unlock state to all mode cards and buttons.
 * Call this from showModeSelect() and on level-up.
 */
function applyModeUnlockState() {
  var level = (typeof getPlayerLevel === 'function') ? getPlayerLevel() : _getCachedUnlockLevel();
  _setCachedUnlockLevel(level);

  // Mode cards (have data-mode attribute)
  var cards = document.querySelectorAll('#mode-cards .mode-card[data-mode]');
  for (var i = 0; i < cards.length; i++) {
    var card = cards[i];
    var mode = card.getAttribute('data-mode');
    var unlocked = isModeUnlocked(mode, level);
    _applyLockToElement(card, mode, level, unlocked);
  }

  // Special buttons — use ID-based mapping (expedition is now a standard mode card)
  var buttonMap = {};
  for (var btnId in buttonMap) {
    var btn = document.getElementById(btnId);
    if (btn) {
      var bMode = buttonMap[btnId];
      var bUnlocked = isModeUnlocked(bMode, level);
      _applyLockToButton(btn, bMode, level, bUnlocked);
    }
  }
}

function _applyLockToElement(el, mode, playerLevel, unlocked) {
  if (unlocked) {
    el.classList.remove('mode-card-locked');
    el.removeAttribute('data-lock-tooltip');
    // Remove lock overlay if present
    var overlay = el.querySelector('.mode-lock-overlay');
    if (overlay) overlay.remove();
  } else {
    el.classList.add('mode-card-locked');
    var reqLevel = getModeUnlockLevel(mode);
    var tooltip = 'Unlocks at Level ' + reqLevel;
    el.setAttribute('data-lock-tooltip', tooltip);
    // Add lock overlay if not present
    if (!el.querySelector('.mode-lock-overlay')) {
      var overlay = document.createElement('div');
      overlay.className = 'mode-lock-overlay';
      overlay.innerHTML = '<span class="mode-lock-icon">&#128274;</span><span class="mode-lock-text">Level ' + reqLevel + '</span>';
      el.appendChild(overlay);
    }
  }
}

function _applyLockToButton(btn, mode, playerLevel, unlocked) {
  if (unlocked) {
    btn.classList.remove('mode-btn-locked');
    btn.disabled = false;
    btn.title = '';
  } else {
    btn.classList.add('mode-btn-locked');
    btn.disabled = true;
    btn.title = 'Unlocks at Level ' + getModeUnlockLevel(mode);
  }
}

// ── Unlock notification (toast) ─────────────────────────────────────────────

/**
 * Show unlock toasts for newly available modes.
 * Called from checkLevelUp in leveling.js.
 */
function showModeUnlockToasts(oldLevel, newLevel) {
  var newModes = getNewlyUnlockedModes(oldLevel, newLevel);
  for (var i = 0; i < newModes.length; i++) {
    _queueModeUnlockToast(newModes[i]);
    // Metrics: log mode unlock
    if (typeof metricsModeUnlocked === 'function') metricsModeUnlocked(newModes[i].mode, newModes[i].level);
  }
}

function _queueModeUnlockToast(entry) {
  var name = _MODE_DISPLAY_NAMES[entry.mode] || entry.mode;
  // Reuse the leveling toast queue system
  if (typeof _levelUpToastQueue !== 'undefined') {
    _levelUpToastQueue.push({ type: 'mode_unlock', modeName: name, modeKey: entry.mode });
    if (!_levelUpToastRunning && typeof _drainLevelUpQueue === 'function') {
      _drainLevelUpQueue();
    }
  }
}

// ── Click gate ──────────────────────────────────────────────────────────────
// Intercept clicks on locked mode cards to prevent launching the mode.

function _initModeUnlockClickGate() {
  var container = document.getElementById('mode-cards');
  if (!container) return;
  // Use capture phase to intercept before individual card handlers
  container.addEventListener('click', function (e) {
    var card = e.target.closest('.mode-card[data-mode]');
    if (!card) return;
    if (card.classList.contains('mode-card-locked')) {
      e.stopImmediatePropagation();
      e.preventDefault();
      // Brief shake animation
      card.classList.remove('mode-lock-shake');
      void card.offsetWidth;
      card.classList.add('mode-lock-shake');
    }
  }, true); // capture phase
}

// Initialize click gate on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initModeUnlockClickGate);
} else {
  _initModeUnlockClickGate();
}
