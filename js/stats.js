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
 * Calculate and award XP for a completed session. Updates playerXP and
 * lastPlayedDate in lifetime stats.
 * @param {number} finalScore  the session score
 * @param {string} modeKey     one of: classic, sprint, blitz, daily, weekly, puzzle
 * @returns {{ xpEarned: number, streakBonus: boolean }}
 */
function awardXP(finalScore, modeKey) {
  const stats = loadLifetimeStats();
  const today = new Date().toISOString().slice(0, 10);

  // Streak bonus: +10% if last session was yesterday
  let streakBonus = false;
  if (stats.lastPlayedDate) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (stats.lastPlayedDate === yesterday.toISOString().slice(0, 10)) {
      streakBonus = true;
    }
  }

  const multiplier = XP_MODE_MULTIPLIERS[modeKey] || 1.0;
  const baseXP = Math.floor(finalScore / 50);
  let xpEarned = Math.floor(baseXP * multiplier);
  if (streakBonus) xpEarned = Math.floor(xpEarned * 1.1);

  stats.playerXP = (stats.playerXP || 0) + xpEarned;
  stats.lastPlayedDate = today;
  saveLifetimeStats(stats);

  return { xpEarned, streakBonus };
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
  ];
  el.innerHTML = rows.map(([label, val]) =>
    `<div class="stats-row">` +
    `<span class="stats-label">${label}</span>` +
    `<span class="stats-value">${val}</span>` +
    `</div>`
  ).join('');
}

/** Open the stats overlay and populate it. */
function openStatsPanel() {
  renderStatsPanel();
  const el = document.getElementById('stats-overlay');
  if (el) el.style.display = 'flex';
}

/** Close the stats overlay. */
function closeStatsPanel() {
  const el = document.getElementById('stats-overlay');
  if (el) el.style.display = 'none';
}
