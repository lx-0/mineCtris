// Expedition Biome Weekly Leaderboard
// Per-biome weekly leaderboards accessible from the world map biome detail card.
// Resets every Monday 00:00 UTC (ISO week boundary). Top 10 players earn +500 XP and a
// weekly title badge. Last 4 weeks are browsable.
//
// Depends on:
//   leaderboard.js  (LEADERBOARD_WORKER_URL, loadDisplayName, _escHtml)
//   weekly.js       (getWeeklyDateString, formatWeeklyLabel, _getLastWeekString)
//   expedition-reward-tracks.js (awardBiomeRunXP — for top-10 XP grant)

// ── Constants ─────────────────────────────────────────────────────────────────

const BIOME_WEEKLY_LB_BEST_KEY = 'mineCtris_biomeWeeklyBest'; // { stone: {week,score}, ... }
const EXPEDITION_WEEKLY_RETURN_MAX = 100; // max entries returned per leaderboard page

const _EXP_LB_BIOMES = [
  { id: 'stone',  name: 'Stone Caverns', icon: '&#9935;',   colors: { border: '#9ca3af', bg: '#374151' } },
  { id: 'forest', name: 'Verdant Grove', icon: '&#127795;', colors: { border: '#34d399', bg: '#065f46' } },
  { id: 'nether', name: 'Nether Depths', icon: '&#128293;', colors: { border: '#f97316', bg: '#7f1d1d' } },
  { id: 'ice',    name: 'Frozen Tundra', icon: '&#10052;',  colors: { border: '#60a5fa', bg: '#0c4a6e' } },
];

const _EXP_LB_TOP10_TITLES = {
  stone:  'Stone Champion',
  forest: 'Forest Champion',
  nether: 'Nether Champion',
  ice:    'Ice Champion',
};

// ── Local best-score tracking ─────────────────────────────────────────────────

function _loadBiomeWeeklyBest() {
  try { return JSON.parse(localStorage.getItem(BIOME_WEEKLY_LB_BEST_KEY) || '{}'); } catch (_) { return {}; }
}

function _saveBiomeWeeklyBest(data) {
  try { localStorage.setItem(BIOME_WEEKLY_LB_BEST_KEY, JSON.stringify(data)); } catch (_) {}
}

/** Returns true if this score beats the stored best for this biome this week. */
function _isBiomeWeeklyBetter(biomeId, score) {
  const week = getWeeklyDateString();
  const all  = _loadBiomeWeeklyBest();
  const prev = all[biomeId];
  return !prev || prev.week !== week || score > prev.score;
}

function _recordBiomeWeeklyBest(biomeId, score) {
  const week = getWeeklyDateString();
  const all  = _loadBiomeWeeklyBest();
  all[biomeId] = { week, score };
  _saveBiomeWeeklyBest(all);
}

// ── API ───────────────────────────────────────────────────────────────────────

/**
 * Submit a biome run score to the weekly leaderboard.
 * Only submits if this is a new personal best for the week.
 * @param {string} biomeId
 * @param {string} displayName
 * @param {number} score
 * @param {number} linesCleared
 * @returns {Promise<{ok,rank,total,improved,weeklyTitle}|null>}
 */
async function apiSubmitBiomeWeeklyScore(biomeId, displayName, score, linesCleared) {
  try {
    const week = getWeeklyDateString();
    const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/scores/expedition/weekly', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, score, linesCleared, biomeId, week, clientTimestamp: Date.now() }),
    });
    return resp.json();
  } catch (_) { return null; }
}

/**
 * Fetch the weekly leaderboard for a biome.
 * @param {string} biomeId
 * @param {string} weekStr  e.g. "2026-W11"
 * @param {string} [displayName]  If provided, own rank is included even outside top 100
 * @returns {Promise<{biomeId,week,entries,total,ownEntry}|null>}
 */
async function apiFetchBiomeWeeklyLeaderboard(biomeId, weekStr, displayName) {
  try {
    const dn  = displayName ? '?displayName=' + encodeURIComponent(displayName) : '';
    const url = LEADERBOARD_WORKER_URL + '/api/leaderboard/expedition/weekly/' +
                encodeURIComponent(biomeId) + '/' + encodeURIComponent(weekStr) + dn;
    const resp = await fetch(url);
    return resp.json();
  } catch (_) { return null; }
}

// ── Weekly score submission (called from expedition-session.js) ───────────────

/**
 * Submit biome run score if it's a new weekly best. Returns submission result.
 * Silently no-ops if no display name is set or submission is not an improvement.
 *
 * @param {string} biomeId
 * @param {number} score
 * @param {number} linesCleared
 * @returns {Promise<{rank,weeklyTitle}|null>}
 */
async function submitBiomeWeeklyScoreIfBest(biomeId, score, linesCleared) {
  const displayName = (typeof loadDisplayName === 'function') ? loadDisplayName() : '';
  if (!displayName) return null;
  if (!_isBiomeWeeklyBetter(biomeId, score)) return null;

  _recordBiomeWeeklyBest(biomeId, score);
  const result = await apiSubmitBiomeWeeklyScore(biomeId, displayName, score, linesCleared);
  if (!result || !result.ok) return null;
  return { rank: result.rank, total: result.total, weeklyTitle: result.weeklyTitle || null };
}

// ── Week navigation helpers ───────────────────────────────────────────────────

/** Return an array of the last N week strings (most recent first). */
function _getRecentWeeks(n) {
  const weeks = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i * 7));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    weeks.push(d.getUTCFullYear() + '-W' + String(week).padStart(2, '0'));
  }
  return weeks;
}

// ── Panel state ───────────────────────────────────────────────────────────────

let _biomeLbActiveBiome = 'stone';
let _biomeLbActiveWeek  = '';    // set on open

function openBiomeLeaderboard(biomeId) {
  const overlay = document.getElementById('biome-lb-overlay');
  if (!overlay) return;
  _biomeLbActiveBiome = biomeId || 'stone';
  _biomeLbActiveWeek  = getWeeklyDateString();
  overlay.style.display = 'flex';
  _biomeLbSyncBiomeTabs();
  _biomeLbSyncWeekTabs();
  _biomeLbLoad();
}

function closeBiomeLeaderboard() {
  const overlay = document.getElementById('biome-lb-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ── Tab sync ──────────────────────────────────────────────────────────────────

function _biomeLbSyncBiomeTabs() {
  _EXP_LB_BIOMES.forEach(function(b) {
    const btn = document.getElementById('biome-lb-tab-' + b.id);
    if (btn) btn.classList.toggle('biome-lb-tab-active', _biomeLbActiveBiome === b.id);
  });
}

function _biomeLbSyncWeekTabs() {
  const weeks = _getRecentWeeks(4);
  weeks.forEach(function(w, i) {
    const btn = document.getElementById('biome-lb-week-tab-' + i);
    if (btn) btn.classList.toggle('biome-lb-tab-active', _biomeLbActiveWeek === w);
  });
}

// ── Load and render ───────────────────────────────────────────────────────────

async function _biomeLbLoad() {
  const body = document.getElementById('biome-lb-body');
  if (!body) return;
  body.innerHTML = '<div class="biome-lb-loading">Loading&hellip;</div>';

  _biomeLbRebuildWeekTabs();

  const displayName = (typeof loadDisplayName === 'function') ? loadDisplayName() : '';
  const data = await apiFetchBiomeWeeklyLeaderboard(_biomeLbActiveBiome, _biomeLbActiveWeek, displayName);

  if (!data || !data.entries) {
    body.innerHTML = '<div class="biome-lb-error">Could not load leaderboard.</div>';
    return;
  }

  _biomeLbRender(body, data, displayName);
}

function _biomeLbRebuildWeekTabs() {
  const container = document.getElementById('biome-lb-week-tabs');
  if (!container) return;
  const weeks = _getRecentWeeks(4);
  container.innerHTML = '';
  weeks.forEach(function(w, i) {
    const btn = document.createElement('button');
    btn.id = 'biome-lb-week-tab-' + i;
    btn.className = 'biome-lb-week-tab' + (w === _biomeLbActiveWeek ? ' biome-lb-tab-active' : '');
    btn.textContent = i === 0 ? 'This Week' : formatWeeklyLabel(w);
    btn.addEventListener('click', function() {
      _biomeLbActiveWeek = w;
      _biomeLbSyncWeekTabs();
      _biomeLbLoad();
    });
    container.appendChild(btn);
  });
}

function _biomeLbRender(container, data, myDisplayName) {
  const myName = (myDisplayName || '').toLowerCase();
  const biome  = _EXP_LB_BIOMES.find(function(b) { return b.id === data.biomeId; }) || _EXP_LB_BIOMES[0];
  const weekLabel = typeof formatWeeklyLabel === 'function'
    ? formatWeeklyLabel(data.week)
    : data.week;

  let html = '<div class="biome-lb-week-label">' + _escHtml(weekLabel) + '</div>';

  if (!data.entries.length) {
    html += '<div class="biome-lb-empty">No scores yet this week. Be the first!</div>';
  } else {
    html += '<table class="lb-table biome-lb-table"><thead><tr>' +
      '<th>#</th><th>Player</th><th>Score</th><th>Lines</th>' +
      '</tr></thead><tbody>';

    data.entries.forEach(function(e) {
      const isMe  = myName && e.displayName.toLowerCase() === myName;
      const cls   = isMe ? ' class="lb-row-me"' : '';
      const top10 = e.rank <= 10;

      let nameCell = '';
      if (top10) {
        const title = _EXP_LB_TOP10_TITLES[data.biomeId] || '';
        nameCell += '<span class="biome-lb-top10-badge" title="' + _escHtml(title) + '">&#127942;</span> ';
      }
      nameCell += _escHtml(e.displayName);
      if (isMe) nameCell += ' &#9668;';

      html += '<tr' + cls + '>' +
        '<td>' + e.rank + '</td>' +
        '<td>' + nameCell + '</td>' +
        '<td>' + (e.score || 0).toLocaleString() + '</td>' +
        '<td>' + (e.linesCleared != null ? e.linesCleared : '-') + '</td>' +
        '</tr>';
    });

    html += '</tbody></table>';
  }

  // Show own rank even if outside top 100
  if (data.ownEntry && data.ownEntry.rank > EXPEDITION_WEEKLY_RETURN_MAX) {
    html +=
      '<div class="biome-lb-own-rank">Your rank: <strong>#' + data.ownEntry.rank +
      '</strong> of ' + data.total + ' players — score: ' +
      data.ownEntry.score.toLocaleString() + '</div>';
  } else if (!myName) {
    html += '<div class="biome-lb-own-rank biome-lb-own-rank-hint">Set a display name to track your rank.</div>';
  } else if (data.entries.length && !data.ownEntry) {
    html += '<div class="biome-lb-own-rank biome-lb-own-rank-hint">You haven\'t played this biome this week.</div>';
  }

  container.innerHTML = html;
}

// ── Init ──────────────────────────────────────────────────────────────────────

function initBiomeLeaderboard() {
  const overlay = document.getElementById('biome-lb-overlay');
  if (!overlay) return;

  // Biome tab clicks
  _EXP_LB_BIOMES.forEach(function(b) {
    const btn = document.getElementById('biome-lb-tab-' + b.id);
    if (btn) {
      btn.addEventListener('click', function() {
        _biomeLbActiveBiome = b.id;
        _biomeLbSyncBiomeTabs();
        _biomeLbLoad();
      });
    }
  });

  // Close button
  const closeBtn = document.getElementById('biome-lb-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeBiomeLeaderboard);

  // Refresh button
  const refreshBtn = document.getElementById('biome-lb-refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', _biomeLbLoad);

  // Click outside panel to close
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeBiomeLeaderboard();
  });

  // Keyboard close
  overlay.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeBiomeLeaderboard();
  });
}
