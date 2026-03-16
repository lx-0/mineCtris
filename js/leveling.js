// Player leveling system — 50 levels, milestone skin unlocks, level badge.
// Requires: stats.js (loadLifetimeStats, saveLifetimeStats)

// ── Level curve ───────────────────────────────────────────────────────────────
// L1 requires 100 XP; each subsequent level requires ~15% more than the previous.
// Cumulative XP to reach level N is stored in LEVEL_XP_TABLE[N-1] (0-indexed).
// LEVEL_XP_TABLE[0] = 0 (starting XP for level 1), LEVEL_XP_TABLE[1] = 100 (reach L2), etc.

const MAX_LEVEL = 50;

/** XP required to go from level N to level N+1 (1-indexed, so index 0 = L1→L2). */
function _xpForLevelUp(level) {
  return Math.round(100 * Math.pow(1.15, level - 1));
}

/** Build cumulative XP thresholds. CUMULATIVE_XP[n] = total XP needed to reach level n+1. */
const CUMULATIVE_XP = (function () {
  const arr = [0]; // arr[0] = 0 means 0 XP needed to be L1
  for (let i = 1; i <= MAX_LEVEL; i++) {
    arr[i] = arr[i - 1] + _xpForLevelUp(i);
  }
  return arr; // arr[n] = total XP to reach level n+1 (arr[49] = XP to reach L50)
})();

/**
 * Given total lifetime XP, return the player's current level (1–50).
 * @param {number} totalXP
 * @returns {number} level 1–50
 */
function getLevelFromXP(totalXP) {
  if (!totalXP || totalXP < 0) return 1;
  for (let lvl = MAX_LEVEL; lvl >= 1; lvl--) {
    if (totalXP >= CUMULATIVE_XP[lvl - 1]) return lvl;
  }
  return 1;
}

/**
 * Return the cumulative XP required to have reached the given level.
 * @param {number} level  1–50
 * @returns {number}
 */
function getXPThresholdForLevel(level) {
  const idx = Math.max(1, Math.min(level, MAX_LEVEL));
  return CUMULATIVE_XP[idx - 1];
}

/**
 * Return XP needed to reach the next level from current totalXP.
 * Returns 0 if already at max level.
 * @param {number} totalXP
 * @returns {{ current: number, needed: number, nextLevelXP: number }}
 */
function getXPProgress(totalXP) {
  const level = getLevelFromXP(totalXP);
  if (level >= MAX_LEVEL) {
    return { current: 0, needed: 0, nextLevelXP: CUMULATIVE_XP[MAX_LEVEL - 1] };
  }
  const currentThreshold = CUMULATIVE_XP[level - 1];
  const nextThreshold    = CUMULATIVE_XP[level];
  return {
    current: totalXP - currentThreshold,
    needed:  nextThreshold - currentThreshold,
    nextLevelXP: nextThreshold,
  };
}

/** Load the player's current level from saved stats. */
function getPlayerLevel() {
  if (typeof loadLifetimeStats !== 'function') return 1;
  const stats = loadLifetimeStats();
  return getLevelFromXP(stats.playerXP || 0);
}

// ── Title helpers ─────────────────────────────────────────────────────────────

/**
 * Return the title suffix for a level ("Veteran" / "Master" / "").
 * Used on leaderboard entries.
 */
function getLevelTitle(level) {
  if (level >= MAX_LEVEL) return 'Master';
  if (level >= 25)         return 'Veteran';
  return '';
}

/** Return a short badge label, e.g. "L12" or "L50". */
function getLevelBadgeLabel(level) {
  return 'L' + level;
}

// ── Milestone skins ───────────────────────────────────────────────────────────

const LEVEL_SKIN_MILESTONES = [
  { level: 5,  themeKey: 'fossil',    name: 'Fossil',    icon: '\u{1FAB4}', desc: 'Reach Level 5'  },
  { level: 15, themeKey: 'storm',     name: 'Storm',     icon: '\u26A1',    desc: 'Reach Level 15' },
  { level: 30, themeKey: 'void',      name: 'Void',      icon: '\u{1F300}', desc: 'Reach Level 30' },
  { level: 50, themeKey: 'legendary', name: 'Legendary', icon: '\u{1F947}', desc: 'Reach Level 50 (Max!)' },
];

/**
 * Return true if the given theme key is unlocked by the player's level.
 * @param {string} themeKey
 * @returns {boolean}
 */
function isLevelThemeUnlocked(themeKey) {
  const milestone = LEVEL_SKIN_MILESTONES.find(m => m.themeKey === themeKey);
  if (!milestone) return false;
  return getPlayerLevel() >= milestone.level;
}

// ── Level-up detection & celebration ─────────────────────────────────────────

/** Last known level — used to detect level-up between XP awards. */
let _lastKnownLevel = null;

/**
 * Call after awarding XP. Detects level-ups, shows toast for each new level,
 * and handles milestone skin unlocks.
 * @param {number} oldXP  XP total before the award
 * @param {number} newXP  XP total after the award
 */
function checkLevelUp(oldXP, newXP) {
  const oldLevel = getLevelFromXP(oldXP);
  const newLevel = getLevelFromXP(newXP);
  if (newLevel <= oldLevel) return;

  // Fire a toast for each level gained (usually just one)
  for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
    _showLevelUpToast(lvl);
  }

  // Check milestone skin unlocks
  for (const m of LEVEL_SKIN_MILESTONES) {
    if (m.level > oldLevel && m.level <= newLevel) {
      _showSkinUnlockToast(m);
    }
  }

  // Update HUD badge
  updateLevelBadgeHUD();
  // Re-sync theme buttons in settings (unlock new options)
  if (typeof _syncThemeButtons === 'function') {
    _syncThemeButtons();
  }
}

let _levelUpToastQueue = [];
let _levelUpToastRunning = false;

function _showLevelUpToast(level) {
  _levelUpToastQueue.push({ type: 'levelup', level });
  if (!_levelUpToastRunning) _drainLevelUpQueue();
}

function _showSkinUnlockToast(milestone) {
  _levelUpToastQueue.push({ type: 'skin', milestone });
  if (!_levelUpToastRunning) _drainLevelUpQueue();
}

function _drainLevelUpQueue() {
  if (!_levelUpToastQueue.length) { _levelUpToastRunning = false; return; }
  _levelUpToastRunning = true;
  const item = _levelUpToastQueue.shift();
  _displayLevelUpToast(item, function () {
    setTimeout(_drainLevelUpQueue, 300);
  });
}

function _displayLevelUpToast(item, done) {
  const el = document.getElementById('level-up-toast');
  if (!el) { done(); return; }

  const iconEl  = el.querySelector('.lu-toast-icon');
  const titleEl = el.querySelector('.lu-toast-title');
  const bodyEl  = el.querySelector('.lu-toast-body');

  if (item.type === 'levelup') {
    const title = getLevelTitle(item.level);
    if (iconEl)  iconEl.textContent  = item.level >= MAX_LEVEL ? '\u{1F947}' : '\u2B06';
    if (titleEl) titleEl.textContent = 'LEVEL UP!  ' + getLevelBadgeLabel(item.level);
    if (bodyEl)  bodyEl.textContent  = title ? 'Title unlocked: ' + title : '';
  } else {
    // skin unlock
    const m = item.milestone;
    if (iconEl)  iconEl.textContent  = m.icon;
    if (titleEl) titleEl.textContent = 'SKIN UNLOCKED';
    if (bodyEl)  bodyEl.textContent  = m.name + ' theme — check Settings!';
  }

  el.classList.remove('lu-toast-visible');
  void el.offsetWidth;
  el.classList.add('lu-toast-visible');

  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(function () {
    el.classList.remove('lu-toast-visible');
    done();
  }, 2800);
}

// ── HUD badge ─────────────────────────────────────────────────────────────────

/** Update the in-game HUD level badge element. */
function updateLevelBadgeHUD() {
  const el = document.getElementById('hud-player-level-badge');
  if (!el) return;
  if (typeof loadLifetimeStats !== 'function') return;
  const stats = loadLifetimeStats();
  const level = getLevelFromXP(stats.playerXP || 0);
  el.textContent = getLevelBadgeLabel(level);
  // Give the badge a special class at milestone levels
  el.className = 'level-badge' + (level >= MAX_LEVEL ? ' level-badge-legendary' : level >= 30 ? ' level-badge-void' : level >= 15 ? ' level-badge-storm' : level >= 5 ? ' level-badge-fossil' : '');
}
