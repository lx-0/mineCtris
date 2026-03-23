// metrics.js — Player metrics and telemetry system (v2.0).
// Logs structured events to LocalStorage for measuring retention and progression.
// No PII collected. Rolling window of max 1000 events.
// Requires: state.js loaded first (for mode flags).

const METRICS_STORAGE_KEY = 'mineCtris_metrics';
const METRICS_MAX_EVENTS = 1000;

// ── Event logging ────────────────────────────────────────────────────────────

/**
 * Log a metrics event to LocalStorage.
 * @param {string} type   One of the defined event types.
 * @param {object} [data] Optional payload (no PII).
 */
function metricsLog(type, data) {
  try {
    var events = _metricsLoadEvents();
    var entry = {
      t: type,
      ts: Date.now(),
    };
    if (data) entry.d = data;
    events.push(entry);
    // Enforce rolling window
    if (events.length > METRICS_MAX_EVENTS) {
      events = events.slice(events.length - METRICS_MAX_EVENTS);
    }
    localStorage.setItem(METRICS_STORAGE_KEY, JSON.stringify(events));
  } catch (_) {
    // localStorage full or unavailable — silently drop
  }
}

/** Load raw events array from storage. */
function _metricsLoadEvents() {
  try {
    var raw = localStorage.getItem(METRICS_STORAGE_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  return [];
}

// ── Session tracking helpers ─────────────────────────────────────────────────

var _metricsSessionStartTime = null;
var _metricsSessionMode = null;

/**
 * Get current mode key from global state flags.
 * @returns {string}
 */
function _metricsGetCurrentMode() {
  if (typeof isSprintMode !== 'undefined' && isSprintMode) return 'sprint';
  if (typeof isBlitzMode !== 'undefined' && isBlitzMode) return 'blitz';
  if (typeof isSurvivalMode !== 'undefined' && isSurvivalMode) return 'survival';
  if (typeof isDailyChallenge !== 'undefined' && isDailyChallenge) return 'daily';
  if (typeof isWeeklyChallenge !== 'undefined' && isWeeklyChallenge) return 'weekly';
  if (typeof isCoopMode !== 'undefined' && isCoopMode) return 'coop';
  if (typeof isBattleMode !== 'undefined' && isBattleMode) return 'battle';
  if (typeof isPuzzleMode !== 'undefined' && isPuzzleMode) return 'puzzle';
  if (typeof isCustomPuzzleMode !== 'undefined' && isCustomPuzzleMode) return 'custom_puzzle';
  return 'classic';
}

/** Call when a game session begins (pointer lock acquired, mode selected). */
function metricsSessionStart() {
  _metricsSessionStartTime = Date.now();
  _metricsSessionMode = _metricsGetCurrentMode();
  metricsLog('session_start', { mode: _metricsSessionMode });
}

/**
 * Call when a game session ends (game over, quit, mode exit).
 * @param {object} [stats] Optional end-of-session stats.
 */
function metricsSessionEnd(stats) {
  var durationMs = _metricsSessionStartTime
    ? Date.now() - _metricsSessionStartTime
    : 0;
  var mode = _metricsSessionMode || _metricsGetCurrentMode();
  var payload = {
    mode: mode,
    durationMs: durationMs,
  };
  if (stats) {
    if (stats.score !== undefined) payload.score = stats.score;
    if (stats.linesCleared !== undefined) payload.lines = stats.linesCleared;
    if (stats.blocksMined !== undefined) payload.mined = stats.blocksMined;
  }
  metricsLog('session_end', payload);
  _metricsSessionStartTime = null;
  _metricsSessionMode = null;
}

/** Log that a specific mode was played. */
function metricsModePlayed(modeKey) {
  metricsLog('mode_played', { mode: modeKey });
}

/**
 * Log a level-up event.
 * @param {number} newLevel
 */
function metricsLevelUp(newLevel) {
  metricsLog('level_up', { level: newLevel });
}

/**
 * Log a mode unlock event.
 * @param {string} modeKey
 * @param {number} level  Player level at unlock time.
 */
function metricsModeUnlocked(modeKey, level) {
  metricsLog('mode_unlocked', { mode: modeKey, level: level });
}

/**
 * Log a prestige event.
 * @param {number} prestigeLevel
 */
function metricsPrestige(prestigeLevel) {
  metricsLog('prestige', { level: prestigeLevel });
}

/** Log tutorial completion. */
function metricsTutorialComplete() {
  metricsLog('tutorial_complete', {});
}

/** Log tutorial skip. */
function metricsTutorialSkip() {
  metricsLog('tutorial_skip', {});
}

// ── Aggregate stats (computed on demand) ─────────────────────────────────────

/**
 * Compute aggregate metrics from stored events.
 * @returns {object} Aggregated stats object.
 */
function metricsComputeStats() {
  var events = _metricsLoadEvents();
  var stats = {
    totalSessions: 0,
    sessionsByMode: {},
    totalSessionDurationMs: 0,
    sessionDurations: [],
    uniqueDays: {},
    returningPlayer: false,
    secondSessionRate: 0,
    avgSessionsPerWeek: 0,
    levelUps: [],
    modeUnlocks: [],
    prestiges: [],
    tutorialCompleted: false,
    tutorialSkipped: false,
  };

  var sessionStarts = [];

  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    var day = new Date(ev.ts).toISOString().slice(0, 10);

    switch (ev.t) {
      case 'session_start':
        stats.totalSessions++;
        sessionStarts.push(ev.ts);
        stats.uniqueDays[day] = true;
        if (ev.d && ev.d.mode) {
          stats.sessionsByMode[ev.d.mode] = (stats.sessionsByMode[ev.d.mode] || 0) + 1;
        }
        break;

      case 'session_end':
        if (ev.d && ev.d.durationMs) {
          stats.totalSessionDurationMs += ev.d.durationMs;
          stats.sessionDurations.push({
            mode: ev.d.mode || 'unknown',
            durationMs: ev.d.durationMs,
            score: ev.d.score || 0,
          });
        }
        break;

      case 'mode_played':
        if (ev.d && ev.d.mode) {
          stats.sessionsByMode[ev.d.mode] = (stats.sessionsByMode[ev.d.mode] || 0) + 1;
        }
        break;

      case 'level_up':
        if (ev.d) stats.levelUps.push({ level: ev.d.level, ts: ev.ts });
        break;

      case 'mode_unlocked':
        if (ev.d) stats.modeUnlocks.push({ mode: ev.d.mode, level: ev.d.level, ts: ev.ts });
        break;

      case 'prestige':
        if (ev.d) stats.prestiges.push({ level: ev.d.level, ts: ev.ts });
        break;

      case 'tutorial_complete':
        stats.tutorialCompleted = true;
        break;

      case 'tutorial_skip':
        stats.tutorialSkipped = true;
        break;
    }
  }

  // 2nd session rate
  var uniqueDayCount = Object.keys(stats.uniqueDays).length;
  stats.returningPlayer = uniqueDayCount >= 2;
  stats.secondSessionRate = stats.totalSessions >= 2 ? 1 : 0;

  // Average sessions per week
  if (sessionStarts.length >= 2) {
    var firstTs = sessionStarts[0];
    var lastTs = sessionStarts[sessionStarts.length - 1];
    var spanWeeks = Math.max((lastTs - firstTs) / (7 * 24 * 60 * 60 * 1000), 1);
    stats.avgSessionsPerWeek = Math.round((stats.totalSessions / spanWeeks) * 10) / 10;
  } else {
    stats.avgSessionsPerWeek = stats.totalSessions;
  }

  // Level progression rate (time from first session to each level)
  if (sessionStarts.length > 0) {
    var firstSession = sessionStarts[0];
    stats.levelProgressionHours = [];
    for (var li = 0; li < stats.levelUps.length; li++) {
      var lu = stats.levelUps[li];
      stats.levelProgressionHours.push({
        level: lu.level,
        hoursFromStart: Math.round((lu.ts - firstSession) / (60 * 60 * 1000) * 10) / 10,
      });
    }
  }

  // Session length distribution by mode
  stats.sessionLengthByMode = {};
  for (var si = 0; si < stats.sessionDurations.length; si++) {
    var sd = stats.sessionDurations[si];
    if (!stats.sessionLengthByMode[sd.mode]) {
      stats.sessionLengthByMode[sd.mode] = { count: 0, totalMs: 0, minMs: Infinity, maxMs: 0 };
    }
    var bucket = stats.sessionLengthByMode[sd.mode];
    bucket.count++;
    bucket.totalMs += sd.durationMs;
    if (sd.durationMs < bucket.minMs) bucket.minMs = sd.durationMs;
    if (sd.durationMs > bucket.maxMs) bucket.maxMs = sd.durationMs;
  }
  // Compute averages
  var modeKeys = Object.keys(stats.sessionLengthByMode);
  for (var mk = 0; mk < modeKeys.length; mk++) {
    var b = stats.sessionLengthByMode[modeKeys[mk]];
    b.avgMs = Math.round(b.totalMs / b.count);
    if (b.minMs === Infinity) b.minMs = 0;
  }

  // Mode unlock funnel
  stats.unlockFunnel = stats.modeUnlocks.map(function (u) {
    return u.mode + ' (L' + u.level + ')';
  });

  // Prestige conversion: did the player prestige?
  stats.prestigeConverted = stats.prestiges.length > 0;

  return stats;
}

// ── Dashboard rendering ──────────────────────────────────────────────────────

function _metricsFmtMs(ms) {
  if (ms < 60000) return Math.round(ms / 1000) + 's';
  var m = Math.floor(ms / 60000);
  var s = Math.round((ms % 60000) / 1000);
  return m + 'm ' + s + 's';
}

/**
 * Open the metrics dashboard overlay.
 * Computes stats on demand and renders them.
 */
function openMetricsDashboard() {
  var overlay = document.getElementById('metrics-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';

  var content = document.getElementById('metrics-content');
  if (!content) return;

  var s = metricsComputeStats();
  var html = '';

  // Header stats
  html += '<div class="metrics-section">';
  html += '<div class="metrics-section-title">OVERVIEW</div>';
  html += '<div class="metrics-grid">';
  html += '<div class="metrics-stat"><span class="metrics-val">' + s.totalSessions + '</span><span class="metrics-label">Total Sessions</span></div>';
  html += '<div class="metrics-stat"><span class="metrics-val">' + (s.returningPlayer ? 'Yes' : 'No') + '</span><span class="metrics-label">Returning Player</span></div>';
  html += '<div class="metrics-stat"><span class="metrics-val">' + s.avgSessionsPerWeek + '</span><span class="metrics-label">Avg Sessions/Week</span></div>';
  html += '<div class="metrics-stat"><span class="metrics-val">' + _metricsFmtMs(s.totalSessionDurationMs) + '</span><span class="metrics-label">Total Play Time</span></div>';
  html += '</div></div>';

  // Modes played
  html += '<div class="metrics-section">';
  html += '<div class="metrics-section-title">MODES PLAYED</div>';
  var modes = Object.keys(s.sessionsByMode);
  if (modes.length === 0) {
    html += '<div class="metrics-empty">No sessions recorded yet.</div>';
  } else {
    html += '<div class="metrics-table"><div class="metrics-row metrics-header"><span>Mode</span><span>Sessions</span></div>';
    modes.sort(function (a, b) { return s.sessionsByMode[b] - s.sessionsByMode[a]; });
    for (var mi = 0; mi < modes.length; mi++) {
      html += '<div class="metrics-row"><span>' + modes[mi] + '</span><span>' + s.sessionsByMode[modes[mi]] + '</span></div>';
    }
    html += '</div>';
  }
  html += '</div>';

  // Session length by mode
  html += '<div class="metrics-section">';
  html += '<div class="metrics-section-title">SESSION LENGTH (BY MODE)</div>';
  var slModes = Object.keys(s.sessionLengthByMode);
  if (slModes.length === 0) {
    html += '<div class="metrics-empty">No completed sessions yet.</div>';
  } else {
    html += '<div class="metrics-table"><div class="metrics-row metrics-header"><span>Mode</span><span>Avg</span><span>Min</span><span>Max</span></div>';
    for (var sli = 0; sli < slModes.length; sli++) {
      var sl = s.sessionLengthByMode[slModes[sli]];
      html += '<div class="metrics-row"><span>' + slModes[sli] + '</span><span>' + _metricsFmtMs(sl.avgMs) + '</span><span>' + _metricsFmtMs(sl.minMs) + '</span><span>' + _metricsFmtMs(sl.maxMs) + '</span></div>';
    }
    html += '</div>';
  }
  html += '</div>';

  // Level progression
  html += '<div class="metrics-section">';
  html += '<div class="metrics-section-title">LEVEL PROGRESSION</div>';
  if (!s.levelProgressionHours || s.levelProgressionHours.length === 0) {
    html += '<div class="metrics-empty">No level-ups recorded yet.</div>';
  } else {
    html += '<div class="metrics-table"><div class="metrics-row metrics-header"><span>Level</span><span>Hours from Start</span></div>';
    for (var lpi = 0; lpi < s.levelProgressionHours.length; lpi++) {
      var lp = s.levelProgressionHours[lpi];
      html += '<div class="metrics-row"><span>L' + lp.level + '</span><span>' + lp.hoursFromStart + 'h</span></div>';
    }
    html += '</div>';
  }
  html += '</div>';

  // Mode unlock funnel
  html += '<div class="metrics-section">';
  html += '<div class="metrics-section-title">MODE UNLOCK FUNNEL</div>';
  if (s.unlockFunnel.length === 0) {
    html += '<div class="metrics-empty">No modes unlocked yet.</div>';
  } else {
    html += '<div class="metrics-list">';
    for (var fi = 0; fi < s.unlockFunnel.length; fi++) {
      html += '<div class="metrics-list-item">' + s.unlockFunnel[fi] + '</div>';
    }
    html += '</div>';
  }
  html += '</div>';

  // Prestige & Tutorial
  html += '<div class="metrics-section">';
  html += '<div class="metrics-section-title">MILESTONES</div>';
  html += '<div class="metrics-grid">';
  html += '<div class="metrics-stat"><span class="metrics-val">' + s.prestiges.length + '</span><span class="metrics-label">Prestiges</span></div>';
  html += '<div class="metrics-stat"><span class="metrics-val">' + (s.tutorialCompleted ? 'Completed' : s.tutorialSkipped ? 'Skipped' : 'Pending') + '</span><span class="metrics-label">Tutorial</span></div>';
  html += '</div></div>';

  content.innerHTML = html;
}

/** Close the metrics dashboard overlay. */
function closeMetricsDashboard() {
  var overlay = document.getElementById('metrics-overlay');
  if (overlay) overlay.style.display = 'none';
}

/** Clear all metrics data (for debug/reset). */
function metricsClearAll() {
  try { localStorage.removeItem(METRICS_STORAGE_KEY); } catch (_) {}
}
