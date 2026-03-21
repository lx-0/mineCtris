// Depths Dungeon Leaderboard — All Runs (all-time best) + Daily Seed tabs.
// Depends on: leaderboard.js (LEADERBOARD_WORKER_URL, loadDisplayName, _escHtml, openDisplayNameModal)
//             daily.js (getDailyDateString, formatDailyLabel)
//             daily-depths.js (getDailyDepthsSeed)
//             leveling.js (getPrestigeLevel, getPrestigeStarsHtml, getLevelFromXP, getLevelBadgeLabel, getLevelTitle)
//             depths-upgrades.js (getDepthsChosenUpgradeDefs, DEPTHS_UPGRADE_DEFS)
// Used by: depths-floor-gen.js, depths-transition.js, main.js

// ── Constants ────────────────────────────────────────────────────────────────

const DEPTHS_LB_BEST_KEY = 'mineCtris_depthsAllTimeBest'; // { score, floorReached, runComplete, upgrades, date }

// ── Local all-time best ──────────────────────────────────────────────────────

function loadDepthsAllTimeBest() {
  try {
    return JSON.parse(localStorage.getItem(DEPTHS_LB_BEST_KEY) || 'null');
  } catch (_) { return null; }
}

/**
 * Submit a depths run score locally. Saves only if higher than existing best.
 * Also submits to online leaderboard if display name is set.
 * @returns {boolean} true if new all-time best
 */
function submitDepthsScore(score, floorReached, runComplete, timeSeconds, linesCleared, upgrades) {
  var best = loadDepthsAllTimeBest();
  var isNewBest = !best || score > best.score;

  if (isNewBest) {
    try {
      localStorage.setItem(DEPTHS_LB_BEST_KEY, JSON.stringify({
        score: score,
        floorReached: floorReached,
        runComplete: runComplete,
        timeSeconds: timeSeconds,
        linesCleared: linesCleared,
        upgrades: upgrades || [],
        date: new Date().toISOString(),
      }));
    } catch (_) {}
  }

  // Submit to online leaderboard (always submit — server keeps best)
  var displayName = typeof loadDisplayName === 'function' ? loadDisplayName() : '';
  if (displayName) {
    apiSubmitDepthsScore(displayName, score, floorReached, runComplete, timeSeconds, upgrades);
  }

  return isNewBest;
}

// ── API calls ────────────────────────────────────────────────────────────────

/**
 * Submit a depths run score to the online all-time leaderboard.
 */
async function apiSubmitDepthsScore(displayName, score, floorReached, runComplete, timeSeconds, upgrades) {
  try {
    var resp = await fetch(LEADERBOARD_WORKER_URL + '/api/depths/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: displayName,
        score: score,
        floorReached: floorReached,
        runComplete: runComplete,
        timeSeconds: timeSeconds,
        upgrades: upgrades || [],
        clientTimestamp: Date.now(),
      }),
    });
    return resp.json();
  } catch (_) { return null; }
}

/**
 * Fetch the all-time depths leaderboard.
 */
async function apiFetchDepthsLeaderboard() {
  try {
    var resp = await fetch(LEADERBOARD_WORKER_URL + '/api/depths/leaderboard');
    return resp.json();
  } catch (_) { return { entries: [] }; }
}

/**
 * Fetch the daily depths leaderboard for a given date.
 * Re-exports from daily-depths.js for convenience.
 */
async function apiFetchDepthsDailyLeaderboard(date) {
  if (typeof apiFetchDailyDepthsLeaderboard === 'function') {
    return apiFetchDailyDepthsLeaderboard(date);
  }
  try {
    var resp = await fetch(LEADERBOARD_WORKER_URL + '/api/depths/daily/leaderboard/' + date);
    return resp.json();
  } catch (_) { return { entries: [] }; }
}

// ── Panel state ──────────────────────────────────────────────────────────────

var _depthsLbActiveTab = 'allruns'; // 'allruns' | 'daily'

function openDepthsLeaderboard(defaultTab) {
  var overlay = document.getElementById('depths-lb-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  _depthsLbActiveTab = defaultTab || 'allruns';
  _depthsLbSyncTabs();
  _depthsLbLoad();
}

function closeDepthsLeaderboard() {
  var overlay = document.getElementById('depths-lb-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ── Tab sync ─────────────────────────────────────────────────────────────────

function _depthsLbSyncTabs() {
  var allBtn = document.getElementById('depths-lb-tab-allruns');
  var dailyBtn = document.getElementById('depths-lb-tab-daily');
  if (allBtn) allBtn.classList.toggle('depths-lb-tab-active', _depthsLbActiveTab === 'allruns');
  if (dailyBtn) dailyBtn.classList.toggle('depths-lb-tab-active', _depthsLbActiveTab === 'daily');
}

// ── Load and render ──────────────────────────────────────────────────────────

async function _depthsLbLoad() {
  var body = document.getElementById('depths-lb-body');
  if (!body) return;
  body.innerHTML = '<div class="depths-lb-loading">Loading&hellip;</div>';

  try {
    if (_depthsLbActiveTab === 'daily') {
      var date = typeof getDailyDateString === 'function' ? getDailyDateString() : new Date().toISOString().slice(0, 10);
      var data = await apiFetchDepthsDailyLeaderboard(date);
      if (!data || !data.entries) throw new Error('bad response');
      var label = typeof formatDailyLabel === 'function' ? formatDailyLabel(date) : date;
      _renderDepthsLeaderboard(body, data.entries, 'Daily Seed \u2014 ' + label, true);
    } else {
      var data = await apiFetchDepthsLeaderboard();
      if (!data || !data.entries) throw new Error('bad response');
      _renderDepthsLeaderboard(body, data.entries, 'All Runs \u2014 All Time', false);
    }
  } catch (_) {
    body.innerHTML = '<div class="depths-lb-error">Could not load leaderboard.</div>';
  }
}

function _renderDepthsLeaderboard(container, entries, label, isDaily) {
  var myName = (typeof loadDisplayName === 'function' ? loadDisplayName() : '').toLowerCase();

  var html = '<div class="depths-lb-label">' +
    (typeof _escHtml === 'function' ? _escHtml(label) : label) + '</div>';

  if (!entries.length) {
    html += '<div class="depths-lb-empty">No scores yet. Be the first to brave The Depths!</div>';
    container.innerHTML = html;
    return;
  }

  html += '<table class="lb-table depths-lb-table"><thead><tr>' +
    '<th>#</th><th>Player</th><th>Score</th><th>Floor</th><th>Upgrades</th>' +
    '</tr></thead><tbody>';

  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var isMe = myName && e.displayName && e.displayName.toLowerCase() === myName;
    var cls = isMe ? ' class="lb-row-me"' : '';

    // Build name cell with prestige stars
    var nameCell = '';
    if (isMe && typeof getPrestigeStarsHtml === 'function') {
      var prestigeHtml = getPrestigeStarsHtml();
      if (prestigeHtml) nameCell += prestigeHtml + ' ';
    }
    nameCell += typeof _escHtml === 'function' ? _escHtml(e.displayName) : e.displayName;
    if (isMe) {
      if (typeof getLevelBadgeLabel === 'function' && typeof getLevelFromXP === 'function' && typeof loadLifetimeStats === 'function') {
        var myLevel = getLevelFromXP((loadLifetimeStats().playerXP || 0));
        nameCell += ' <span class="lb-level-badge">' + getLevelBadgeLabel(myLevel) + '</span>';
      }
      nameCell += ' \u25C0';
    }

    var scoreVal = (e.score || 0).toLocaleString();
    var floorVal = e.runComplete ? '7/7 \u2713' : (e.floorReached || 0) + '/7';

    // Upgrades: show short names or count
    var upgradeVal = '-';
    if (e.upgrades && e.upgrades.length > 0) {
      var upgradeNames = [];
      for (var u = 0; u < e.upgrades.length && u < 3; u++) {
        upgradeNames.push(e.upgrades[u]);
      }
      upgradeVal = upgradeNames.join(', ');
      if (e.upgrades.length > 3) upgradeVal += ' +' + (e.upgrades.length - 3);
    }

    html += '<tr' + cls + '>' +
      '<td>' + (e.rank || (i + 1)) + '</td>' +
      '<td>' + nameCell + '</td>' +
      '<td>' + scoreVal + '</td>' +
      '<td>' + floorVal + '</td>' +
      '<td class="depths-lb-upgrades-cell">' + upgradeVal + '</td>' +
      '</tr>';
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

// ── Init ─────────────────────────────────────────────────────────────────────

function initDepthsLeaderboard() {
  var overlay = document.getElementById('depths-lb-overlay');
  if (!overlay) return;

  // Tab clicks
  var allBtn = document.getElementById('depths-lb-tab-allruns');
  var dailyBtn = document.getElementById('depths-lb-tab-daily');
  if (allBtn) {
    allBtn.addEventListener('click', function () {
      _depthsLbActiveTab = 'allruns';
      _depthsLbSyncTabs();
      _depthsLbLoad();
    });
  }
  if (dailyBtn) {
    dailyBtn.addEventListener('click', function () {
      _depthsLbActiveTab = 'daily';
      _depthsLbSyncTabs();
      _depthsLbLoad();
    });
  }

  // Close button
  var closeBtn = document.getElementById('depths-lb-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeDepthsLeaderboard);

  // Refresh button
  var refreshBtn = document.getElementById('depths-lb-refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', _depthsLbLoad);

  // Click outside panel to close
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeDepthsLeaderboard();
  });

  // Keyboard close
  overlay.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeDepthsLeaderboard();
  });
}

// ── Helper: collect upgrade names from current run ───────────────────────────

function _getDepthsUpgradeNames() {
  if (typeof getDepthsChosenUpgradeDefs !== 'function') return [];
  var defs = getDepthsChosenUpgradeDefs();
  var names = [];
  for (var i = 0; i < defs.length; i++) {
    names.push(defs[i].name);
  }
  return names;
}
