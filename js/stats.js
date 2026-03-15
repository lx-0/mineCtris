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
function submitLifetimeStats({ score, blocksMined, linesCleared, blocksPlaced, totalCrafts, highestComboCount, highestDifficultyTier, isDailyChallenge }) {
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
  saveLifetimeStats(stats);
  return stats;
}

/** Render lifetime stats rows into #stats-panel-body. */
function renderStatsPanel() {
  const el = document.getElementById('stats-panel-body');
  if (!el) return;
  const stats = loadLifetimeStats();
  const comboStr = stats.highestComboMultiplier === 1.0 ? '1x'
    : stats.highestComboMultiplier + 'x';
  const rows = [
    ['GAMES PLAYED',      stats.gamesPlayed],
    ['BEST SCORE',        stats.bestScore],
    ['TOTAL SCORE',       stats.totalScore],
    ['LINES CLEARED',     stats.totalLinesCleared],
    ['BLOCKS MINED',      stats.totalBlocksMined],
    ['BLOCKS PLACED',     stats.totalBlocksPlaced],
    ['TOTAL CRAFTS',      stats.totalCrafts],
    ['BEST COMBO',        comboStr],
    ['HIGHEST LEVEL',     stats.highestLevel],
    ['DAILY CHALLENGES',  stats.dailyChallengesCompleted],
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
