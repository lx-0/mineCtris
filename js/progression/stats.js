// Lifetime player statistics — localStorage persistence and Stats panel.
// Requires: nothing (standalone module).

const STATS_KEY = 'mineCtris_stats';

// Maps comboCount index → multiplier (matches lineclear.js)
const _STATS_COMBO_MULTS = [1.0, 1.0, 1.5, 2.0, 3.0];

function _defaultStats() {
  return {
    gamesPlayed: 0,
    totalScore: 0,
    bestScore: 0,
    totalLinesCleared: 0,
    totalBlocksMined: 0,
    totalBlocksPlaced: 0,
    totalCrafts: 0,
    highestComboMultiplier: 1.0,
    highestLevel: 1,
    dailyChallengesCompleted: 0,
    puzzlesCompleted: 0,
    playerXP: 0,
    lastPlayedDate: null,
    currentStreak: 0,
  };
}

/** Load lifetime stats from localStorage. Returns defaults on any error. */
function loadLifetimeStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? Object.assign(_defaultStats(), JSON.parse(raw)) : _defaultStats();
  } catch (_) {
    return _defaultStats();
  }
}

/** Persist lifetime stats to localStorage. Silently ignores quota/security errors. */
function saveLifetimeStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (_) {}
}

/**
 * Record a completed game into lifetime stats.
 * @param {object} params
 * @param {number} params.score
 * @param {number} params.blocksMined
 * @param {number} params.linesCleared
 * @param {number} params.blocksPlaced
 * @param {number} params.totalCrafts
 * @param {number} params.highestComboCount  raw comboCount peak, not multiplier
 * @param {number} params.highestDifficultyTier  lastDifficultyTier at game end
 * @param {boolean} params.isDailyChallenge
 * @returns {object} updated stats
 */
function submitLifetimeStats({ score, blocksMined, linesCleared, blocksPlaced, totalCrafts, highestComboCount, highestDifficultyTier, isDailyChallenge, isPuzzleMode }) {
  const stats = loadLifetimeStats();
  stats.gamesPlayed++;
  stats.totalScore += score;
  if (score > stats.bestScore) stats.bestScore = score;
  stats.totalLinesCleared += linesCleared;
  stats.totalBlocksMined += blocksMined;
  stats.totalBlocksPlaced += blocksPlaced;
  stats.totalCrafts += totalCrafts;
  const comboMult = _STATS_COMBO_MULTS[Math.min(highestComboCount, 4)];
  if (comboMult > stats.highestComboMultiplier) stats.highestComboMultiplier = comboMult;
  const level = highestDifficultyTier + 1;
  if (level > stats.highestLevel) stats.highestLevel = level;
  if (isDailyChallenge) stats.dailyChallengesCompleted++;
  if (isPuzzleMode) stats.puzzlesCompleted = (stats.puzzlesCompleted || 0) + 1;
  saveLifetimeStats(stats);
  return stats;
}

// XP multipliers per game mode
const XP_MODE_MULTIPLIERS = {
  classic: 1.0,
  sprint:  1.1,
  blitz:   1.2,
  daily:   1.3,
  weekly:  1.5,
  puzzle:  1.0,
};

/**
 * Calculate and award XP for a completed session. Updates playerXP,
 * lastPlayedDate, and currentStreak in lifetime stats.
 * @param {number} finalScore  the session score
 * @param {string} modeKey     one of: classic, sprint, blitz, daily, weekly, puzzle
 * @returns {{ xpEarned: number, streakBonus: boolean, currentStreak: number }}
 */
function awardXP(finalScore, modeKey) {
  const stats = loadLifetimeStats();
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  let isNewStreakDay = false;
  if (stats.lastPlayedDate !== today) {
    // First session of a new calendar day
    if (stats.lastPlayedDate === yesterdayStr) {
      // Consecutive day — extend the streak
      stats.currentStreak = (stats.currentStreak || 0) + 1;
    } else {
      // Missed a day (or first ever session) — reset streak
      stats.currentStreak = 1;
    }
    isNewStreakDay = true;
    stats.lastPlayedDate = today;
  }

  const streak = stats.currentStreak || 1;
  // Streak bonus (+10% XP) applies on every session once you have 2+ consecutive days
  const streakBonus = streak >= 2;

  const multiplier = XP_MODE_MULTIPLIERS[modeKey] || 1.0;
  const baseXP = Math.floor(finalScore / 50);
  let xpEarned = Math.floor(baseXP * multiplier);
  if (streakBonus) xpEarned = Math.floor(xpEarned * 1.1);
  // Prestige XP bonus (multiplicative)
  if (typeof getPrestigeXPBonus === 'function') {
    const prestigeBonus = getPrestigeXPBonus();
    if (prestigeBonus > 0) xpEarned = Math.floor(xpEarned * (1 + prestigeBonus));
  }

  // Guild XP boost perk (multiplicative)
  if (typeof getGuildXPBoost === 'function') {
    const guildBoost = getGuildXPBoost();
    if (guildBoost > 0) xpEarned = Math.floor(xpEarned * (1 + guildBoost));
  }

  // First-game completion bonus (one-time 100 XP)
  if (typeof _awardFirstGameBonus === 'function') {
    xpEarned += _awardFirstGameBonus();
  }

  stats.playerXP = (stats.playerXP || 0) + xpEarned;
  saveLifetimeStats(stats);

  // Award guild XP for game completion
  if (typeof awardGuildXP === 'function') {
    awardGuildXP('game_completion');
  }

  // Fire milestone toast on new streak days only (3, 7, 30)
  if (isNewStreakDay && (streak === 3 || streak === 7 || streak === 30)) {
    if (typeof showStreakMilestoneToast === 'function') {
      showStreakMilestoneToast(streak);
    }
  }

  return { xpEarned, streakBonus, currentStreak: streak };
}

/** Render lifetime stats rows into #stats-panel-body. */
function renderStatsPanel() {
  const el = document.getElementById('stats-panel-body');
  if (!el) return;
  const stats = loadLifetimeStats();
  const comboStr = stats.highestComboMultiplier === 1.0 ? '1x'
    : stats.highestComboMultiplier + 'x';
  const sprintBest = loadSprintBest();
  const sprintBestStr = sprintBest ? fmtSprintTime(sprintBest.timeMs) : '--';
  const rows = [
    ['GAMES PLAYED',      stats.gamesPlayed],
    ['BEST SCORE',        stats.bestScore],
    ['SPRINT BEST',       sprintBestStr],
    ['TOTAL SCORE',       stats.totalScore],
    ['LINES CLEARED',     stats.totalLinesCleared],
    ['BLOCKS MINED',      stats.totalBlocksMined],
    ['BLOCKS PLACED',     stats.totalBlocksPlaced],
    ['TOTAL CRAFTS',      stats.totalCrafts],
    ['BEST COMBO',        comboStr],
    ['HIGHEST LEVEL',     stats.highestLevel],
    ['DAILY CHALLENGES',  stats.dailyChallengesCompleted],
    ['PUZZLES COMPLETED', stats.puzzlesCompleted || 0],
    ['TOTAL XP',          stats.playerXP || 0],
    ['PLAYER LEVEL',      typeof getLevelFromXP === 'function' ? getLevelFromXP(stats.playerXP || 0) : 1],
    ['CURRENT STREAK',    (stats.currentStreak || 0) + ' day' + ((stats.currentStreak || 0) === 1 ? '' : 's')],
  ];
  // Prestige stats
  if (typeof getPrestigeLevel === 'function') {
    var pLevel = getPrestigeLevel();
    if (pLevel > 0) {
      rows.push(['PRESTIGE', '\u2B50'.repeat(Math.min(pLevel, 10)) + ' (' + pLevel + ')']);
      rows.push(['XP BONUS', '+' + Math.round(getPrestigeXPBonus() * 100) + '%']);
      rows.push(['LIFETIME XP', getPrestigeTotalXP() + (stats.playerXP || 0)]);
    }
  }
  el.innerHTML = rows.map(([label, val]) =>
    `<div class="stats-row">` +
    `<span class="stats-label">${label}</span>` +
    `<span class="stats-value">${val}</span>` +
    `</div>`
  ).join('');

  // Prestige button (only visible at level 50)
  if (typeof canPrestige === 'function' && canPrestige()) {
    var nextReward = typeof getNextPrestigeReward === 'function' ? getNextPrestigeReward() : null;
    var rewardPreview = nextReward
      ? 'Next reward: +' + Math.round(nextReward.xpBonus * 100) + '% XP, ' + nextReward.cosmetic
      : 'Max prestige rewards reached — prestige for glory!';
    el.innerHTML +=
      '<div class="stats-prestige-section">' +
        '<button id="prestige-btn" class="prestige-btn" onclick="_openPrestigeConfirm()">' +
          '\u2B50 PRESTIGE \u2B50' +
        '</button>' +
        '<div class="prestige-reward-preview">' + rewardPreview + '</div>' +
      '</div>';
  }

  // Tournament history section
  if (typeof tournamentLobby !== 'undefined' &&
      typeof tournamentLobby.getTournamentStats === 'function') {
    var ts = tournamentLobby.getTournamentStats();
    if (ts.entered > 0) {
      var winsLabel = ts.wins > 0
        ? ts.wins + ' <span class="tourn-win-badge">&#127942; Champion</span>'.repeat(ts.wins)
        : '0';
      var bestFinishVal = ts.bestFinish || '—';
      el.innerHTML +=
        '<div class="stats-section-title">TOURNAMENTS</div>' +
        '<div class="stats-row"><span class="stats-label">ENTERED</span>' +
          '<span class="stats-value">' + ts.entered + '</span></div>' +
        '<div class="stats-row"><span class="stats-label">WINS</span>' +
          '<span class="stats-value">' + winsLabel + '</span></div>' +
        '<div class="stats-row"><span class="stats-label">BEST FINISH</span>' +
          '<span class="stats-value">' + bestFinishVal + '</span></div>';
    }
  }
}

/** Render the season rank section into #stats-season-rank (if it exists). */
function renderSeasonRankSection() {
  const el = document.getElementById('stats-season-rank');
  if (!el) return;
  const season = (typeof getSeasonConfig === 'function') ? getSeasonConfig() : null;
  if (!season) { el.style.display = 'none'; return; }
  const rating = (typeof loadBattleRating === 'function') ? loadBattleRating().rating : 0;
  const badgeHtml = (typeof getSeasonRankBadgeHtml === 'function')
    ? getSeasonRankBadgeHtml(rating) : rating + ' pts';
  el.innerHTML =
    '<div class="stats-season-rank-label">' + _escStatsHtml(season.name || 'Season') + '</div>' +
    '<div class="stats-season-rank-badge">' + badgeHtml + '</div>';
  el.style.display = '';
}

function _escStatsHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Open the stats overlay and populate it. */
function openStatsPanel() {
  renderStatsPanel();
  renderSeasonRankSection();
  if (typeof renderSeasonRecapSection === 'function') {
    renderSeasonRecapSection('stats-season-cards');
  }
  const el = document.getElementById('stats-overlay');
  if (el) el.style.display = 'flex';
}

/** Close the stats overlay. */
function closeStatsPanel() {
  const el = document.getElementById('stats-overlay');
  if (el) el.style.display = 'none';
}

// ── Prestige confirmation dialog ─────────────────────────────────────────────

function _openPrestigeConfirm() {
  var overlay = document.getElementById('prestige-confirm-overlay');
  if (!overlay) return;
  var nextPrestige = (typeof getPrestigeLevel === 'function' ? getPrestigeLevel() : 0) + 1;
  var nextReward = typeof getNextPrestigeReward === 'function' ? getNextPrestigeReward() : null;
  var rewardHtml = '';
  if (nextReward) {
    rewardHtml = '<div class="prestige-confirm-reward">' +
      '<strong>You will earn:</strong><br>' +
      '+' + Math.round(nextReward.xpBonus * 100) + '% XP gain<br>' +
      nextReward.cosmetic +
    '</div>';
  }
  var body = document.getElementById('prestige-confirm-body');
  if (body) {
    body.innerHTML =
      '<p>Reset to <strong>Level 1</strong>?</p>' +
      '<p>Your XP will be reset to 0, but all mode unlocks and cosmetics remain.</p>' +
      rewardHtml +
      '<p class="prestige-confirm-warning">This cannot be undone!</p>';
  }
  overlay.style.display = 'flex';
}

function _closePrestigeConfirm() {
  var overlay = document.getElementById('prestige-confirm-overlay');
  if (overlay) overlay.style.display = 'none';
}

function _confirmPrestige() {
  if (typeof performPrestige === 'function') {
    performPrestige();
  }
  _closePrestigeConfirm();
  // Refresh stats panel to show new state
  renderStatsPanel();
}
