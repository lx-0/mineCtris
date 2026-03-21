// Daily Depths — deterministic dungeon seed that all players share each day.
// Requires: daily.js (mulberry32, _hashDate, getDailyDateString, formatDailyLabel)
// Requires: depths-floor-gen.js (generateDepthsRun)
// Used by: main.js (daily depths launch), depths-floor-gen.js (seeded RNG)

// ── Constants ────────────────────────────────────────────────────────────────

const DAILY_DEPTHS_BEST_KEY   = 'mineCtris_dailyDepthsBest';
const DAILY_DEPTHS_HIST_KEY   = 'mineCtris_dailyDepthsHistory';
const DAILY_DEPTHS_MAX_HISTORY = 30; // keep last 30 days of history

// ── Daily Depths PRNG ────────────────────────────────────────────────────────

/**
 * Returns a seeded PRNG for today's daily depths run.
 * Uses a different namespace than the regular daily challenge so the
 * floor sequences are independent from piece sequences.
 */
function getDailyDepthsPrng() {
  return mulberry32(_hashDate('depths-' + getDailyDateString()));
}

/**
 * Returns the seed integer for today's daily depths (for display / sharing).
 */
function getDailyDepthsSeed() {
  return _hashDate('depths-' + getDailyDateString());
}

// ── Attempt tracking ─────────────────────────────────────────────────────────
// First attempt each day submits to leaderboard; subsequent are "practice".

const DAILY_DEPTHS_ATTEMPT_KEY = 'mineCtris_dailyDepthsAttempt';

/**
 * Returns true if the player has already submitted a leaderboard-eligible
 * attempt for today's daily depths.
 */
function hasDailyDepthsAttemptToday() {
  try {
    var data = JSON.parse(localStorage.getItem(DAILY_DEPTHS_ATTEMPT_KEY) || 'null');
    return data && data.date === getDailyDateString();
  } catch (_) { return false; }
}

/**
 * Mark today's daily depths first attempt as used.
 */
function markDailyDepthsAttempt() {
  try {
    localStorage.setItem(DAILY_DEPTHS_ATTEMPT_KEY, JSON.stringify({
      date: getDailyDateString()
    }));
  } catch (_) {}
}

/**
 * Returns true if the current daily depths run is a practice run
 * (i.e. not the first attempt today).
 */
function isDailyDepthsPractice() {
  return hasDailyDepthsAttemptToday();
}

// ── Daily Depths best score ──────────────────────────────────────────────────

/**
 * Load today's daily depths best from localStorage.
 * Returns null if no entry for today.
 */
function loadDailyDepthsBest() {
  try {
    var data = JSON.parse(localStorage.getItem(DAILY_DEPTHS_BEST_KEY) || 'null');
    if (!data || data.date !== getDailyDateString()) return null;
    return data;
  } catch (_) { return null; }
}

/**
 * Submit a daily depths score. Saves only if higher than existing best for today.
 * Also records to seed history.
 * Returns true if this is a new daily best.
 */
function submitDailyDepthsScore(score, floorReached, runComplete, timeSeconds, linesCleared) {
  var today = getDailyDateString();
  var best = null;
  try {
    best = JSON.parse(localStorage.getItem(DAILY_DEPTHS_BEST_KEY) || 'null');
  } catch (_) {}

  var isNewBest = !best || best.date !== today || score > best.score;
  if (isNewBest) {
    try {
      localStorage.setItem(DAILY_DEPTHS_BEST_KEY, JSON.stringify({
        date: today,
        score: score,
        floorReached: floorReached,
        runComplete: runComplete,
        timeSeconds: timeSeconds,
        linesCleared: linesCleared,
      }));
    } catch (_) {}
  }

  // Record in history
  _recordDailyDepthsHistory(today, score, floorReached, runComplete);

  return isNewBest;
}

// ── Seed history ─────────────────────────────────────────────────────────────

/**
 * Load daily depths history (past seeds and scores).
 * Returns an array of { date, seed, score, floorReached, runComplete }
 * sorted newest first.
 */
function loadDailyDepthsHistory() {
  try {
    var data = JSON.parse(localStorage.getItem(DAILY_DEPTHS_HIST_KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch (_) { return []; }
}

/**
 * Record a daily depths run in the history log.
 * Only keeps the best score per day and caps at MAX_HISTORY entries.
 */
function _recordDailyDepthsHistory(date, score, floorReached, runComplete) {
  var history = loadDailyDepthsHistory();

  // Find existing entry for this date
  var existing = null;
  for (var i = 0; i < history.length; i++) {
    if (history[i].date === date) { existing = history[i]; break; }
  }

  if (existing) {
    if (score > existing.score) {
      existing.score = score;
      existing.floorReached = floorReached;
      existing.runComplete = runComplete;
    }
  } else {
    history.unshift({
      date: date,
      seed: getDailyDepthsSeed(),
      score: score,
      floorReached: floorReached,
      runComplete: runComplete,
    });
  }

  // Cap history length
  if (history.length > DAILY_DEPTHS_MAX_HISTORY) {
    history = history.slice(0, DAILY_DEPTHS_MAX_HISTORY);
  }

  try {
    localStorage.setItem(DAILY_DEPTHS_HIST_KEY, JSON.stringify(history));
  } catch (_) {}
}

// ── Leaderboard submission ───────────────────────────────────────────────────

/**
 * Submit a daily depths score to the online leaderboard.
 * Only submits if this is the first attempt today and the player has a display name.
 */
async function apiSubmitDailyDepthsScore(displayName, score, floorReached, runComplete) {
  var date = getDailyDateString();
  try {
    var resp = await fetch(LEADERBOARD_WORKER_URL + '/api/depths/daily/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: displayName,
        score: score,
        floorReached: floorReached,
        runComplete: runComplete,
        date: date,
        clientTimestamp: Date.now(),
      }),
    });
    return resp.json();
  } catch (_) { return null; }
}

/**
 * Fetch the daily depths leaderboard for a given date.
 */
async function apiFetchDailyDepthsLeaderboard(date) {
  try {
    var resp = await fetch(LEADERBOARD_WORKER_URL + '/api/depths/daily/leaderboard/' + date);
    return resp.json();
  } catch (_) { return { entries: [] }; }
}

// ── History overlay ──────────────────────────────────────────────────────────

/**
 * Populate and show the daily depths history overlay.
 */
function showDailyDepthsHistory() {
  var overlay = document.getElementById('daily-depths-history-overlay');
  if (!overlay) return;

  var listEl = overlay.querySelector('.daily-depths-history-list');
  if (!listEl) return;

  var history = loadDailyDepthsHistory();
  if (history.length === 0) {
    listEl.innerHTML = '<div class="daily-depths-history-empty">No daily runs yet. Play today\'s daily to get started!</div>';
  } else {
    var html = '';
    for (var i = 0; i < history.length; i++) {
      var entry = history[i];
      var label = formatDailyLabel(entry.date);
      var status = entry.runComplete ? 'CONQUERED' : 'Floor ' + entry.floorReached + '/7';
      html += '<div class="daily-depths-history-row">' +
        '<span class="daily-depths-history-date">' + label + '</span>' +
        '<span class="daily-depths-history-status">' + status + '</span>' +
        '<span class="daily-depths-history-score">' + (entry.score || 0).toLocaleString() + '</span>' +
        '</div>';
    }
    listEl.innerHTML = html;
  }

  overlay.style.display = 'flex';
  overlay.setAttribute('tabindex', '-1');
  overlay.focus();

  // Close handlers
  var closeBtn = overlay.querySelector('.daily-depths-history-close');
  function close() {
    overlay.style.display = 'none';
  }
  if (closeBtn) closeBtn.onclick = close;
  overlay.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      overlay.removeEventListener('keydown', handler);
    }
  });
}

// ── Results screen integration ───────────────────────────────────────────────

/**
 * Add daily depths info to the depths results overlay.
 * Called from showDepthsResults when isDailyDepths is true.
 */
function renderDailyDepthsResults(data, isNewBest) {
  var overlay = document.getElementById('depths-results-overlay');
  if (!overlay) return;

  // Update title to indicate daily run
  var titleEl = overlay.querySelector('.depths-results-title');
  if (titleEl) {
    var prefix = 'DAILY DEPTHS — ' + getTodayLabel().toUpperCase();
    if (data.runComplete) {
      titleEl.textContent = prefix + ' — CONQUERED';
    } else {
      titleEl.textContent = prefix + ' — FLOOR ' + data.floorReached;
    }
  }

  // Add practice / daily best badge
  var badgeArea = overlay.querySelector('.daily-depths-badge');
  if (!badgeArea) {
    badgeArea = document.createElement('div');
    badgeArea.className = 'daily-depths-badge';
    var statsEl = overlay.querySelector('.depths-results-stats');
    if (statsEl) statsEl.parentNode.insertBefore(badgeArea, statsEl);
  }

  if (data.isPractice) {
    badgeArea.innerHTML = '<span class="daily-depths-practice-tag">PRACTICE RUN</span>';
  } else if (isNewBest) {
    badgeArea.innerHTML = '<span class="daily-depths-best-tag">NEW DAILY BEST!</span>';
  } else {
    badgeArea.innerHTML = '';
  }

  // Add history button
  var histBtn = overlay.querySelector('.daily-depths-hist-btn');
  if (!histBtn) {
    histBtn = document.createElement('button');
    histBtn.className = 'daily-depths-hist-btn';
    histBtn.textContent = 'Seed History';
    var lobbyBtn = overlay.querySelector('.depths-results-lobby');
    if (lobbyBtn) lobbyBtn.parentNode.insertBefore(histBtn, lobbyBtn);
  }
  histBtn.onclick = function () {
    showDailyDepthsHistory();
  };
}
