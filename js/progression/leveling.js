// Player leveling system — 50 levels, milestone skin unlocks, level badge, prestige.
// Requires: stats.js (loadLifetimeStats, saveLifetimeStats)

// ── Level curve ───────────────────────────────────────────────────────────────
// Early curve (L1–L6): flat 50–75 XP per level for fast first-session unlocks.
// Target: a new player reaches L6-7 within ~15 minutes of play.
// Late curve (L7+): each level requires ~15% more than the previous, starting
// from a 100 XP base at L7.
//
// ── XP sources (first session, ~15 min) ──────────────────────────────────────
// Tutorial completion:       50 XP  (one-time, via awardTutorialXP)
// First game completion:    100 XP  (one-time, via awardXP first-game bonus)
// Classic game completion:   50–100 XP per game (score / 50)
// Lines cleared:             variable (included in score)
// Daily mission:             50 XP (if completed)
// Streak bonus:              +10% after 2+ consecutive days
//
// Cumulative XP to reach level N is stored in CUMULATIVE_XP[N-1] (0-indexed).
// CUMULATIVE_XP[0] = 0 (starting XP for level 1).

const MAX_LEVEL = 50;

// ── Prestige system ──────────────────────────────────────────────────────────
// At level 50, players can prestige: reset XP/level to 0 for permanent bonuses.

const PRESTIGE_KEY = 'mineCtris_prestige';
const PRESTIGE_TOTAL_XP_KEY = 'mineCtris_prestigeTotalXP';

/** Prestige reward table — each entry defines what a prestige tier grants. */
const PRESTIGE_REWARDS = [
  { prestige: 1,  xpBonus: 0.05, cosmetic: 'Gold name color',                         cosmeticId: 'title_prestige_1' },
  { prestige: 2,  xpBonus: 0.10, cosmetic: 'Diamond name color + unique pickaxe trail', cosmeticId: 'trail_prestige_2' },
  { prestige: 3,  xpBonus: 0.15, cosmetic: '"Grandmaster" title + exclusive block skin', cosmeticId: 'block_skin_prestige_3' },
  { prestige: 5,  xpBonus: 0.25, cosmetic: 'Animated profile border + "Legend" title',  cosmeticId: 'border_prestige_5' },
  { prestige: 10, xpBonus: 0.50, cosmetic: 'Crown leaderboard icon',                   cosmeticId: 'title_prestige_10' },
];

/** Load prestige level from localStorage (0 = never prestiged). */
function getPrestigeLevel() {
  try {
    var v = parseInt(localStorage.getItem(PRESTIGE_KEY), 10);
    return isNaN(v) ? 0 : v;
  } catch (_) { return 0; }
}

/** Save prestige level to localStorage. */
function _savePrestigeLevel(level) {
  try { localStorage.setItem(PRESTIGE_KEY, String(level)); } catch (_) {}
}

/** Load total lifetime XP earned across all prestiges. */
function getPrestigeTotalXP() {
  try {
    var v = parseInt(localStorage.getItem(PRESTIGE_TOTAL_XP_KEY), 10);
    return isNaN(v) ? 0 : v;
  } catch (_) { return 0; }
}

function _savePrestigeTotalXP(xp) {
  try { localStorage.setItem(PRESTIGE_TOTAL_XP_KEY, String(xp)); } catch (_) {}
}

/**
 * Get the XP bonus multiplier from prestige (e.g. 0.05 for prestige 1).
 * Returns the highest applicable bonus from the rewards table.
 */
function getPrestigeXPBonus() {
  var pLevel = getPrestigeLevel();
  if (pLevel <= 0) return 0;
  var bonus = 0;
  for (var i = 0; i < PRESTIGE_REWARDS.length; i++) {
    if (pLevel >= PRESTIGE_REWARDS[i].prestige) {
      bonus = PRESTIGE_REWARDS[i].xpBonus;
    }
  }
  return bonus;
}

/**
 * Get the reward info for the next prestige tier (what you'll earn).
 * Returns null if at max prestige or not eligible.
 */
function getNextPrestigeReward() {
  var pLevel = getPrestigeLevel();
  for (var i = 0; i < PRESTIGE_REWARDS.length; i++) {
    if (PRESTIGE_REWARDS[i].prestige > pLevel) {
      return PRESTIGE_REWARDS[i];
    }
  }
  return null; // at or beyond max reward tier
}

/**
 * Execute prestige: reset XP to 0, increment prestige counter.
 * Mode unlocks are NOT reset. Returns new prestige level.
 */
function performPrestige() {
  if (typeof loadLifetimeStats !== 'function') return 0;
  var stats = loadLifetimeStats();
  var currentLevel = getLevelFromXP(stats.playerXP || 0);
  if (currentLevel < MAX_LEVEL) return getPrestigeLevel(); // not eligible

  // Track total XP across all prestiges
  var totalXP = getPrestigeTotalXP() + (stats.playerXP || 0);
  _savePrestigeTotalXP(totalXP);

  // Reset XP to 0
  stats.playerXP = 0;
  saveLifetimeStats(stats);

  // Increment prestige counter
  var newPrestige = getPrestigeLevel() + 1;
  _savePrestigeLevel(newPrestige);

  // Process cosmetic unlocks for new prestige level
  if (typeof processUnlocks === 'function') {
    processUnlocks();
  }

  // Update HUD
  updateLevelBadgeHUD();
  if (typeof applyModeUnlockState === 'function') {
    // Mode unlocks persist — showAllModes is enabled at prestige
    try { localStorage.setItem('mineCtris_showAllModes', 'true'); } catch (_) {}
  }

  // Show prestige toast
  _showPrestigeToast(newPrestige);

  // Metrics: log prestige
  if (typeof metricsPrestige === 'function') metricsPrestige(newPrestige);

  return newPrestige;
}

/** Check if the player can prestige right now. */
function canPrestige() {
  return getPlayerLevel() >= MAX_LEVEL;
}

function _showPrestigeToast(prestigeLevel) {
  _levelUpToastQueue.push({ type: 'prestige', prestigeLevel: prestigeLevel });
  if (!_levelUpToastRunning) _drainLevelUpQueue();
}

// Early-level XP requirements (L1→L2 through L6→L7): flat, low values.
// These ensure levels 1-6 are achievable in ~15 minutes of first-session play.
const EARLY_LEVEL_XP = [50, 50, 60, 60, 75, 75]; // indices 0-5 → levels 1→2 through 6→7

/** XP required to go from level N to level N+1 (1-indexed, so level 1 = L1→L2). */
function _xpForLevelUp(level) {
  if (level <= EARLY_LEVEL_XP.length) return EARLY_LEVEL_XP[level - 1];
  // L7+ uses 15% exponential growth from a 100 XP base
  return Math.round(100 * Math.pow(1.15, level - 7));
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
  var pLevel = getPrestigeLevel();
  if (pLevel >= 5) return 'Legend';
  if (pLevel >= 3) return 'Grandmaster';
  if (level >= MAX_LEVEL) return 'Master';
  if (level >= 25)         return 'Veteran';
  return '';
}

/** Return a short badge label, e.g. "L12" or "L50". */
function getLevelBadgeLabel(level) {
  return 'L' + level;
}

/** Return prestige star indicators for display (empty string if no prestige). */
function getPrestigeStarsHtml() {
  var pLevel = getPrestigeLevel();
  if (pLevel <= 0) return '';
  if (pLevel >= 10) return '<span class="lb-prestige-crown" title="Prestige ' + pLevel + '">\uD83D\uDC51</span>';
  return '<span class="lb-prestige-stars" title="Prestige ' + pLevel + '">' +
    '\u2B50'.repeat(pLevel) + '</span>';
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
    // Metrics: log each level-up
    if (typeof metricsLevelUp === 'function') metricsLevelUp(lvl);
  }

  // Check milestone skin unlocks
  for (const m of LEVEL_SKIN_MILESTONES) {
    if (m.level > oldLevel && m.level <= newLevel) {
      _showSkinUnlockToast(m);
    }
  }

  // Show mode unlock notifications for newly available modes
  if (typeof showModeUnlockToasts === 'function') {
    showModeUnlockToasts(oldLevel, newLevel);
  }

  // Coach mark: level 2 unlock (Sprint mode)
  if (oldLevel < 2 && newLevel >= 2 && typeof coachMarkModeUnlock === 'function') {
    coachMarkModeUnlock(newLevel);
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
  if (typeof playLevelUpStinger === 'function') playLevelUpStinger();
}

function _showSkinUnlockToast(milestone) {
  _levelUpToastQueue.push({ type: 'skin', milestone });
  if (!_levelUpToastRunning) _drainLevelUpQueue();
}

/**
 * Show a streak milestone toast (called from stats.js awardXP at 3, 7, 30 days).
 * @param {number} streak
 */
function showStreakMilestoneToast(streak) {
  _levelUpToastQueue.push({ type: 'streak', streak });
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
    el.classList.remove('streak-toast', 'lu-toast-mode-unlock');
    const title = getLevelTitle(item.level);
    if (iconEl)  iconEl.textContent  = item.level >= MAX_LEVEL ? '\u{1F947}' : '\u2B06';
    if (titleEl) titleEl.textContent = 'LEVEL UP!  ' + getLevelBadgeLabel(item.level);
    if (bodyEl)  bodyEl.textContent  = title ? 'Title unlocked: ' + title : '';
  } else if (item.type === 'streak') {
    el.classList.remove('lu-toast-mode-unlock');
    el.classList.add('streak-toast');
    if (iconEl)  iconEl.textContent  = '\uD83D\uDD25';
    if (titleEl) titleEl.textContent = item.streak + '-DAY STREAK!';
    if (bodyEl)  bodyEl.textContent  = '+10% XP bonus active!';
  } else if (item.type === 'mode_unlock') {
    el.classList.remove('streak-toast');
    el.classList.add('lu-toast-mode-unlock');
    if (iconEl)  iconEl.textContent  = '\uD83D\uDD13';
    if (titleEl) titleEl.textContent = 'MODE UNLOCKED!';
    if (bodyEl)  bodyEl.textContent  = item.modeName + ' is now available!';
  } else if (item.type === 'prestige') {
    el.classList.remove('streak-toast', 'lu-toast-mode-unlock');
    if (iconEl)  iconEl.textContent  = '\u2B50';
    if (titleEl) titleEl.textContent = 'PRESTIGE ' + item.prestigeLevel + '!';
    var nextReward = getNextPrestigeReward();
    var rewardText = nextReward ? nextReward.cosmetic : 'Max prestige reached!';
    // Show current tier reward
    var currentReward = null;
    for (var ri = 0; ri < PRESTIGE_REWARDS.length; ri++) {
      if (PRESTIGE_REWARDS[ri].prestige === item.prestigeLevel) {
        currentReward = PRESTIGE_REWARDS[ri];
        break;
      }
    }
    if (bodyEl) bodyEl.textContent = currentReward
      ? '+' + Math.round(currentReward.xpBonus * 100) + '% XP bonus unlocked!'
      : 'Prestige ' + item.prestigeLevel + ' achieved!';
  } else {
    // skin unlock
    el.classList.remove('streak-toast', 'lu-toast-mode-unlock');
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

/** Update the in-game HUD streak badge element. */
function updateStreakHUD() {
  const el = document.getElementById('hud-streak-badge');
  if (!el) return;
  if (typeof loadLifetimeStats !== 'function') return;
  const stats = loadLifetimeStats();
  const streak = stats.currentStreak || 0;
  if (streak >= 2) {
    el.textContent = '\uD83D\uDD25 ' + streak + 'x';
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

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

// ── Tutorial & first-game XP bonuses ─────────────────────────────────────────

const TUTORIAL_XP_KEY = 'mineCtris_tutorialXPAwarded';
const FIRST_GAME_XP_KEY = 'mineCtris_firstGameXPAwarded';
const TUTORIAL_XP_AMOUNT = 50;
const FIRST_GAME_XP_AMOUNT = 100;

/**
 * Award one-time XP for completing the tutorial (50 XP).
 * Safe to call multiple times — only awards once.
 */
function awardTutorialXP() {
  try { if (localStorage.getItem(TUTORIAL_XP_KEY)) return 0; } catch (_) {}
  if (typeof loadLifetimeStats !== 'function') return 0;
  const stats = loadLifetimeStats();
  const oldXP = stats.playerXP || 0;
  stats.playerXP = oldXP + TUTORIAL_XP_AMOUNT;
  saveLifetimeStats(stats);
  try { localStorage.setItem(TUTORIAL_XP_KEY, '1'); } catch (_) {}
  if (typeof checkLevelUp === 'function') checkLevelUp(oldXP, stats.playerXP);
  return TUTORIAL_XP_AMOUNT;
}

/**
 * Award one-time first-game completion bonus (100 XP).
 * Called from awardXP on the player's very first completed game.
 * Safe to call multiple times — only awards once.
 * @returns {number} bonus XP awarded (0 if already claimed)
 */
function _awardFirstGameBonus() {
  try { if (localStorage.getItem(FIRST_GAME_XP_KEY)) return 0; } catch (_) {}
  try { localStorage.setItem(FIRST_GAME_XP_KEY, '1'); } catch (_) {}
  return FIRST_GAME_XP_AMOUNT;
}
