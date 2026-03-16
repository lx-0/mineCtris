// Daily missions system — date-seeded pool, localStorage tracking, XP rewards.
// Requires: stats.js (loadLifetimeStats, saveLifetimeStats, checkLevelUp)
//           leaderboard.js (LEADERBOARD_WORKER_URL) loaded before this file.

const MISSIONS_KEY = 'mineCtris_missions';

// ── Mission Pool (30 templates, must match worker/src/index.js) ───────────────

const MISSION_POOL = [
  // EASY — 10 missions, 50 XP each
  { id: 1,  difficulty: 'easy',   xp: 50,  text: 'Clear 10 lines in Classic mode',          metric: 'lines_cleared_classic',        target: 10,   condition: 'gte', accumulation: 'cumulative' },
  { id: 2,  difficulty: 'easy',   xp: 50,  text: 'Mine 30 blocks in any mode',               metric: 'blocks_mined_total',           target: 30,   condition: 'gte', accumulation: 'cumulative' },
  { id: 3,  difficulty: 'easy',   xp: 50,  text: 'Play a Daily Challenge run',               metric: 'daily_challenge_runs',         target: 1,    condition: 'gte', accumulation: 'cumulative' },
  { id: 4,  difficulty: 'easy',   xp: 50,  text: 'Complete any Puzzle Mode level',           metric: 'puzzles_completed',            target: 1,    condition: 'gte', accumulation: 'cumulative' },
  { id: 5,  difficulty: 'easy',   xp: 50,  text: 'Score 3,000+ points in Blitz mode',        metric: 'blitz_high_score_session',     target: 3000, condition: 'gte', accumulation: 'best'       },
  { id: 6,  difficulty: 'easy',   xp: 50,  text: 'Survive 2 minutes in Classic mode',        metric: 'classic_survival_seconds',     target: 120,  condition: 'gte', accumulation: 'best'       },
  { id: 7,  difficulty: 'easy',   xp: 50,  text: 'Complete a Sprint run',                    metric: 'sprint_runs_completed',        target: 1,    condition: 'gte', accumulation: 'cumulative' },
  { id: 8,  difficulty: 'easy',   xp: 50,  text: 'Activate a power-up in any run',           metric: 'powerups_activated_total',     target: 1,    condition: 'gte', accumulation: 'cumulative' },
  { id: 9,  difficulty: 'easy',   xp: 50,  text: 'Craft any item',                           metric: 'items_crafted_total',          target: 1,    condition: 'gte', accumulation: 'cumulative' },
  { id: 10, difficulty: 'easy',   xp: 50,  text: 'Share your score',                         metric: 'score_shared',                 target: 1,    condition: 'gte', accumulation: 'flag'       },
  // MEDIUM — 12 missions, 75 XP each
  { id: 11, difficulty: 'medium', xp: 75,  text: 'Clear 25 lines in Classic mode',           metric: 'lines_cleared_classic',        target: 25,   condition: 'gte', accumulation: 'cumulative' },
  { id: 12, difficulty: 'medium', xp: 75,  text: 'Finish a Sprint run in under 5 minutes',  metric: 'sprint_best_time_seconds',     target: 300,  condition: 'lte', accumulation: 'best_lte'   },
  { id: 13, difficulty: 'medium', xp: 75,  text: 'Score 6,000+ points in Blitz mode',        metric: 'blitz_high_score_session',     target: 6000, condition: 'gte', accumulation: 'best'       },
  { id: 14, difficulty: 'medium', xp: 75,  text: 'Complete 2 Puzzle Mode levels',            metric: 'puzzles_completed',            target: 2,    condition: 'gte', accumulation: 'cumulative' },
  { id: 15, difficulty: 'medium', xp: 75,  text: 'Mine 75 blocks in any mode',               metric: 'blocks_mined_total',           target: 75,   condition: 'gte', accumulation: 'cumulative' },
  { id: 16, difficulty: 'medium', xp: 75,  text: 'Play a Weekly Challenge run',              metric: 'weekly_challenge_runs',        target: 1,    condition: 'gte', accumulation: 'cumulative' },
  { id: 17, difficulty: 'medium', xp: 75,  text: 'Pull off a 4-line clear in Classic mode',  metric: 'tetris_clears_classic',        target: 1,    condition: 'gte', accumulation: 'cumulative' },
  { id: 18, difficulty: 'medium', xp: 75,  text: 'Craft 3 items in any session',             metric: 'items_crafted_total',          target: 3,    condition: 'gte', accumulation: 'cumulative' },
  { id: 19, difficulty: 'medium', xp: 75,  text: 'Clear 3 lines at once in Blitz mode',      metric: 'triple_clears_blitz',          target: 1,    condition: 'gte', accumulation: 'cumulative' },
  { id: 20, difficulty: 'medium', xp: 75,  text: 'Score 4,000+ in a Daily Challenge',        metric: 'daily_challenge_high_score',   target: 4000, condition: 'gte', accumulation: 'best'       },
  { id: 21, difficulty: 'medium', xp: 75,  text: 'Activate 3 power-ups in a single run',     metric: 'powerups_activated_session',   target: 3,    condition: 'gte', accumulation: 'best'       },
  { id: 22, difficulty: 'medium', xp: 75,  text: 'Survive 8 minutes in Classic mode',        metric: 'classic_survival_seconds',     target: 480,  condition: 'gte', accumulation: 'best'       },
  // HARD — 8 missions, 100 XP each
  { id: 23, difficulty: 'hard',   xp: 100, text: 'Clear 50 lines in Classic mode',           metric: 'lines_cleared_classic',        target: 50,   condition: 'gte', accumulation: 'cumulative' },
  { id: 24, difficulty: 'hard',   xp: 100, text: 'Finish a Sprint run in under 3 minutes',  metric: 'sprint_best_time_seconds',     target: 180,  condition: 'lte', accumulation: 'best_lte'   },
  { id: 25, difficulty: 'hard',   xp: 100, text: 'Score 10,000+ points in Blitz mode',       metric: 'blitz_high_score_session',     target: 10000,condition: 'gte', accumulation: 'best'       },
  { id: 26, difficulty: 'hard',   xp: 100, text: 'Complete 5 Puzzle Mode levels',            metric: 'puzzles_completed',            target: 5,    condition: 'gte', accumulation: 'cumulative' },
  { id: 27, difficulty: 'hard',   xp: 100, text: 'Score 5,000+ in a Weekly Challenge',       metric: 'weekly_challenge_high_score',  target: 5000, condition: 'gte', accumulation: 'best'       },
  { id: 28, difficulty: 'hard',   xp: 100, text: 'Mine 150 blocks across any modes',         metric: 'blocks_mined_total',           target: 150,  condition: 'gte', accumulation: 'cumulative' },
  { id: 29, difficulty: 'hard',   xp: 100, text: 'Score 8,000+ in a Daily Challenge',        metric: 'daily_challenge_high_score',   target: 8000, condition: 'gte', accumulation: 'best'       },
  { id: 30, difficulty: 'hard',   xp: 100, text: 'Craft 5 different item types in a single run', metric: 'unique_items_crafted_session', target: 5, condition: 'gte', accumulation: 'best' },
];

// ── Deterministic date-seeded selection (mirrors worker algorithm) ────────────

function _lcg(seed) {
  return ((seed * 1664525 + 1013904223) & 0xffffffff) >>> 0;
}

function _missionsForDate(dateStr) {
  let seed = 0;
  for (let i = 0; i < dateStr.length; i++) {
    seed = _lcg(seed ^ dateStr.charCodeAt(i));
  }
  const easy   = MISSION_POOL.filter(m => m.difficulty === 'easy');
  const medium = MISSION_POOL.filter(m => m.difficulty === 'medium');
  const hard   = MISSION_POOL.filter(m => m.difficulty === 'hard');
  seed = _lcg(seed); const ei = seed % easy.length;
  seed = _lcg(seed); const mi = seed % medium.length;
  seed = _lcg(seed); const hi = seed % hard.length;
  return [easy[ei], medium[mi], hard[hi]];
}

// ── LocalStorage helpers ──────────────────────────────────────────────────────

function _defaultMissionProgress() {
  return {
    lines_cleared_classic: 0,
    blocks_mined_total: 0,
    daily_challenge_runs: 0,
    daily_challenge_high_score: 0,
    puzzles_completed: 0,
    blitz_high_score_session: 0,
    classic_survival_seconds: 0,
    sprint_runs_completed: 0,
    sprint_best_time_seconds: null, // null = no run yet (lower-is-better)
    powerups_activated_total: 0,
    powerups_activated_session: 0,
    items_crafted_total: 0,
    unique_items_crafted_session: 0,
    score_shared: 0,
    tetris_clears_classic: 0,
    triple_clears_blitz: 0,
    weekly_challenge_runs: 0,
    weekly_challenge_high_score: 0,
  };
}

function _loadMissionState() {
  try {
    const raw = localStorage.getItem(MISSIONS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function _saveMissionState(state) {
  try { localStorage.setItem(MISSIONS_KEY, JSON.stringify(state)); } catch (_) {}
}

/** Return today UTC as YYYY-MM-DD. */
function _todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

// ── Session-scoped in-memory state (reset on each game start) ─────────────────

let _sessionPowerupsActivated = 0;
let _sessionUniqueCraftIds    = new Set();

/** Call at the start of each new game session. */
function resetMissionSession() {
  _sessionPowerupsActivated = 0;
  _sessionUniqueCraftIds    = new Set();
}

// ── Initialization ────────────────────────────────────────────────────────────

/**
 * Initialize missions for today. Tries worker first, falls back to local.
 * Returns the state object.
 */
async function initDailyMissions() {
  const today = _todayUTC();
  let state   = _loadMissionState();

  // If we already have today's missions loaded, keep them
  if (state && state.date === today && Array.isArray(state.missions) && state.missions.length === 3) {
    return state;
  }

  // Fresh day — try to fetch from worker
  let missions = null;
  try {
    const workerBase = typeof LEADERBOARD_WORKER_URL !== 'undefined'
      ? LEADERBOARD_WORKER_URL
      : 'https://minectris-leaderboard.workers.dev';
    const res = await fetch(workerBase + '/api/missions/' + today);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.missions) && data.missions.length === 3) {
        missions = data.missions;
      }
    }
  } catch (_) { /* fall through to local */ }

  // Fallback: compute locally (same deterministic algorithm)
  if (!missions) {
    missions = _missionsForDate(today);
  }

  state = {
    date: today,
    missions,
    progress: _defaultMissionProgress(),
    completed: [],
    xpFromMissions: 0,
  };
  _saveMissionState(state);
  renderMissionsPanel();
  return state;
}

// ── Metric update helpers ─────────────────────────────────────────────────────

/**
 * Check if a mission's completion condition is met given current progress.
 */
function _isMissionMet(mission, progress) {
  const val = progress[mission.metric];
  if (val === null || val === undefined) return false;
  if (mission.condition === 'lte') {
    return val !== null && val <= mission.target;
  }
  return val >= mission.target;
}

/**
 * Update a metric and check for newly completed missions.
 * @param {string} metric  - metric key
 * @param {number|null} value  - new value
 * @param {'set'|'add'|'max'|'min'} op - how to combine with existing
 */
function _updateMetric(metric, value, op) {
  const today = _todayUTC();
  const state = _loadMissionState();
  if (!state || state.date !== today) return; // not initialized yet

  const progress = state.progress;
  let changed = false;

  if (op === 'set') {
    if (progress[metric] !== value) { progress[metric] = value; changed = true; }
  } else if (op === 'add') {
    progress[metric] = (progress[metric] || 0) + value;
    changed = true;
  } else if (op === 'max') {
    if ((progress[metric] || 0) < value) { progress[metric] = value; changed = true; }
  } else if (op === 'min') {
    // lower-is-better (sprint time); null means "no run yet"
    if (progress[metric] === null || progress[metric] > value) {
      progress[metric] = value;
      changed = true;
    }
  }

  if (!changed) return;

  // Check newly completed missions
  let xpGained = 0;
  for (const mission of state.missions) {
    if (state.completed.includes(mission.id)) continue;
    if (_isMissionMet(mission, progress)) {
      state.completed.push(mission.id);
      state.xpFromMissions += mission.xp;
      xpGained += mission.xp;
      _awardMissionXP(mission.xp, mission.text, mission.difficulty);
    }
  }

  _saveMissionState(state);
  renderMissionsPanel();
}

// ── XP award ─────────────────────────────────────────────────────────────────

function _awardMissionXP(amount, missionText, difficulty) {
  if (typeof loadLifetimeStats !== 'function') return;
  const stats  = loadLifetimeStats();
  const oldXP  = stats.playerXP || 0;
  stats.playerXP = oldXP + amount;
  if (typeof saveLifetimeStats === 'function') saveLifetimeStats(stats);
  if (typeof checkLevelUp === 'function') checkLevelUp(oldXP, stats.playerXP);
  if (typeof updateLevelBadgeHUD === 'function') updateLevelBadgeHUD();
  _showMissionCompleteToast(missionText, amount, difficulty);
}

// ── Mission complete toast ────────────────────────────────────────────────────

function _showMissionCompleteToast(missionText, xp, difficulty) {
  const el = document.getElementById('mission-complete-toast');
  if (!el) return;
  const diffLabel = { easy: 'EASY', medium: 'MEDIUM', hard: 'HARD' }[difficulty] || difficulty.toUpperCase();
  el.querySelector('.mct-title').textContent = 'MISSION COMPLETE  [' + diffLabel + ']';
  el.querySelector('.mct-text').textContent  = missionText;
  el.querySelector('.mct-xp').textContent    = '+' + xp + ' XP';

  el.classList.remove('mct-visible');
  void el.offsetWidth;
  el.classList.add('mct-visible');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(function () {
    el.classList.remove('mct-visible');
  }, 3200);
}

// ── Game event hooks (called from game modules) ───────────────────────────────

/** Called every time any block is mined (in any mode). */
function onMissionBlockMined() {
  _updateMetric('blocks_mined_total', 1, 'add');
}

/**
 * Called on every line-clear event.
 * @param {number} count  number of lines cleared at once
 */
function onMissionLineClear(count) {
  // Classic mode: not sprint, not blitz, not puzzle
  // isDailyChallenge and isWeeklyChallenge are classic-style so they don't count here
  const isClassicOnly = typeof isSprintMode !== 'undefined' && !isSprintMode
    && typeof isBlitzMode !== 'undefined' && !isBlitzMode
    && typeof isPuzzleMode !== 'undefined' && !isPuzzleMode
    && typeof isDailyChallenge !== 'undefined' && !isDailyChallenge
    && typeof isWeeklyChallenge !== 'undefined' && !isWeeklyChallenge;

  if (isClassicOnly) {
    _updateMetric('lines_cleared_classic', count, 'add');
    if (count >= 4) _updateMetric('tetris_clears_classic', 1, 'add');
  }

  const isBlitz = typeof isBlitzMode !== 'undefined' && isBlitzMode;
  if (isBlitz && count >= 3) {
    _updateMetric('triple_clears_blitz', 1, 'add');
  }
}

/**
 * Called at the end of a Blitz session.
 * @param {number} finalScore
 */
function onMissionBlitzEnd(finalScore) {
  _updateMetric('blitz_high_score_session', finalScore, 'max');
}

/**
 * Called at the end of a Classic game (game over).
 * @param {number} survivedSeconds
 */
function onMissionClassicEnd(survivedSeconds) {
  _updateMetric('classic_survival_seconds', Math.floor(survivedSeconds), 'max');
}

/**
 * Called when a Daily Challenge run ends.
 * @param {number} finalScore
 */
function onMissionDailyEnd(finalScore) {
  _updateMetric('daily_challenge_runs', 1, 'add');
  _updateMetric('daily_challenge_high_score', finalScore, 'max');
}

/**
 * Called when a Weekly Challenge run ends.
 * @param {number} finalScore
 */
function onMissionWeeklyEnd(finalScore) {
  _updateMetric('weekly_challenge_runs', 1, 'add');
  _updateMetric('weekly_challenge_high_score', finalScore, 'max');
}

/**
 * Called when a Sprint run completes.
 * @param {number} timeMs  sprint time in milliseconds
 */
function onMissionSprintEnd(timeMs) {
  const secs = Math.floor(timeMs / 1000);
  _updateMetric('sprint_runs_completed', 1, 'add');
  _updateMetric('sprint_best_time_seconds', secs, 'min');
}

/**
 * Called when a Puzzle level is completed.
 */
function onMissionPuzzleComplete() {
  _updateMetric('puzzles_completed', 1, 'add');
}

/**
 * Called whenever any item is crafted.
 * @param {string} recipeId  e.g. "stone_pickaxe", "wood_plank"
 */
function onMissionItemCrafted(recipeId) {
  _updateMetric('items_crafted_total', 1, 'add');
  // Track unique item types in current session
  _sessionUniqueCraftIds.add(recipeId);
  _updateMetric('unique_items_crafted_session', _sessionUniqueCraftIds.size, 'max');
}

/**
 * Called when a consumable power-up is activated (lava flask, ice bridge).
 */
function onMissionPowerupActivated() {
  _sessionPowerupsActivated++;
  _updateMetric('powerups_activated_total', 1, 'add');
  _updateMetric('powerups_activated_session', _sessionPowerupsActivated, 'max');
}

/**
 * Called when the player shares their score.
 */
function onMissionScoreShared() {
  _updateMetric('score_shared', 1, 'set');
}

// ── Panel rendering ───────────────────────────────────────────────────────────

/** Render (or refresh) the missions overlay panel. */
function renderMissionsPanel() {
  const el = document.getElementById('missions-panel-body');
  if (!el) return;

  const today = _todayUTC();
  const state = _loadMissionState();

  if (!state || state.date !== today || !Array.isArray(state.missions)) {
    el.innerHTML = '<div class="missions-loading">Loading today\'s missions\u2026</div>';
    return;
  }

  const progress  = state.progress;
  const completed = state.completed;
  const xpTotal   = state.xpFromMissions || 0;
  const diffLabel = { easy: 'EASY', medium: 'MED', hard: 'HARD' };
  const diffColor = { easy: '#4ade80', medium: '#facc15', hard: '#f87171' };

  let html = '<div class="missions-date">Daily Missions \u2014 ' + today + '</div>';
  html += '<div class="missions-xp-summary">XP earned today: <strong>' + xpTotal + '</strong> / 225</div>';

  for (const mission of state.missions) {
    const isDone = completed.includes(mission.id);
    const val    = progress[mission.metric];
    let pct = 0;
    let valDisplay = '';

    if (mission.condition === 'lte') {
      // Sprint time: progress increases as time decreases toward target
      if (val !== null && val !== undefined) {
        const best = val;
        const m = Math.floor(best / 60).toString().padStart(2, '0');
        const s = (best % 60).toString().padStart(2, '0');
        valDisplay = m + ':' + s;
        // pct: 0% when no improvement, 100% when at or below target
        // We show full bar only when done
        pct = isDone ? 100 : Math.min(99, Math.max(0, Math.round((1 - (best - mission.target) / mission.target) * 100)));
      }
    } else if (mission.accumulation === 'flag') {
      pct = isDone ? 100 : 0;
      valDisplay = isDone ? '1 / 1' : '0 / 1';
    } else {
      const cur = val || 0;
      pct = isDone ? 100 : Math.min(100, Math.round((cur / mission.target) * 100));
      if (mission.metric === 'classic_survival_seconds' || mission.metric === 'sprint_best_time_seconds') {
        const mm = Math.floor(cur / 60).toString().padStart(2, '0');
        const ss = (cur % 60).toString().padStart(2, '0');
        valDisplay = mm + ':' + ss + ' / ' + Math.floor(mission.target / 60) + ':' + String(mission.target % 60).padStart(2, '0');
      } else {
        valDisplay = cur + ' / ' + mission.target;
      }
    }

    const doneClass = isDone ? ' mission-card-done' : '';
    const dLabel    = diffLabel[mission.difficulty] || mission.difficulty.toUpperCase();
    const dColor    = diffColor[mission.difficulty] || '#fff';

    html +=
      '<div class="mission-card' + doneClass + '">' +
        '<div class="mission-card-header">' +
          '<span class="mission-diff-badge" style="color:' + dColor + '">' + dLabel + '</span>' +
          '<span class="mission-xp-badge">+' + mission.xp + ' XP</span>' +
          (isDone ? '<span class="mission-done-check">&#10003;</span>' : '') +
        '</div>' +
        '<div class="mission-text">' + mission.text + '</div>' +
        '<div class="mission-progress-row">' +
          '<div class="mission-progress-bar"><div class="mission-progress-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="mission-progress-val">' + valDisplay + '</span>' +
        '</div>' +
      '</div>';
  }

  el.innerHTML = html;
}

// ── Panel open/close ──────────────────────────────────────────────────────────

function openMissionsPanel() {
  renderMissionsPanel();
  const el = document.getElementById('missions-overlay');
  if (el) el.style.display = 'flex';
}

function closeMissionsPanel() {
  const el = document.getElementById('missions-overlay');
  if (el) el.style.display = 'none';
}

// ── Auto-init on page load ────────────────────────────────────────────────────

(function () {
  // Delay slightly so LEADERBOARD_WORKER_URL is available
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initDailyMissions(); });
  } else {
    setTimeout(initDailyMissions, 0);
  }
}());
