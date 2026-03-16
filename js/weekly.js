// Weekly Challenge — ISO week seeding, rotating modifiers, and weekly best scores.
// Requires: daily.js (mulberry32, _hashDate) loaded first, state.js loaded first.

const WEEKLY_HS_KEY = 'mineCtris_weeklyBest';
const WEEKLY_LB_SUBMITTED_KEY = 'mineCtris_weeklyLbSubmitted';

// ── ISO week utilities ────────────────────────────────────────────────────────

/** Returns ISO week string "YYYY-Www" for the current UTC date. */
function getWeeklyDateString() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // ISO: Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday of ISO week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

/** Returns ISO week string for the previous week. */
function _getLastWeekString() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return d.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

/** Format "YYYY-Www" → "Week 12, 2026" */
function formatWeeklyLabel(weekStr) {
  const parts = weekStr.split('-W');
  return 'Week ' + parseInt(parts[1], 10) + ', ' + parts[0];
}

/** Short label for the current week, e.g. "W11". */
function getCurrentWeekLabel() {
  return 'W' + getWeeklyDateString().split('-W')[1];
}

/** Returns a fresh seeded PRNG for the current week (reuses mulberry32/_hashDate from daily.js). */
function getWeeklyPrng() {
  return mulberry32(_hashDate(getWeeklyDateString()));
}

// ── Modifier definitions ──────────────────────────────────────────────────────

const WEEKLY_MODIFIERS = [
  {
    id: 'no_iron',
    name: 'No Iron Week',
    description: 'Crafting is disabled. Score with bare hands only.',
    applyFn: function () { weeklyNoIron = true; },
  },
  {
    id: 'gold_rush',
    name: 'Gold Rush',
    description: 'Gold blocks fall 3\u00d7 more often. 2\u00d7 score on line clears.',
    applyFn: function () { weeklyGoldRush = true; },
  },
  {
    id: 'ice_age',
    name: 'Ice Age',
    description: '60% of pieces are Ice-type. Fall speed starts at Level 3.',
    applyFn: function () {
      weeklyIceAge = true;
      // Start at Level 3: tier index 2 → multiplier = 1.1^2
      difficultyMultiplier = Math.min(
        DIFFICULTY_MAX_MULTIPLIER,
        Math.pow(DIFFICULTY_MULTIPLIER_PER_TIER, 2)
      );
      lastDifficultyTier = 2;
    },
  },
  {
    id: 'double_or_nothing',
    name: 'Double or Nothing',
    description: 'Combos give 3\u00d7 score, but breaking a combo resets score by 25%.',
    applyFn: function () { weeklyDoubleOrNothing = true; },
  },
  {
    id: 'blind_drop',
    name: 'Blind Drop',
    description: 'Next-piece preview is hidden. Only the current piece is visible.',
    applyFn: function () { weeklyBlindDrop = true; },
  },
];

/**
 * Returns the modifier for the current ISO week.
 * Deterministic worldwide — same week always yields the same modifier.
 */
function getCurrentWeeklyModifier() {
  const seed = _hashDate(getWeeklyDateString());
  return WEEKLY_MODIFIERS[seed % WEEKLY_MODIFIERS.length];
}

// ── Weekly best score storage ─────────────────────────────────────────────────

/** Load this week's best entry from localStorage. Returns null if none or stale. */
function loadWeeklyBest() {
  try {
    const data = JSON.parse(localStorage.getItem(WEEKLY_HS_KEY) || 'null');
    if (!data || data.week !== getWeeklyDateString()) return null;
    return data;
  } catch (_) {
    return null;
  }
}

/**
 * Submit this week's score. Saves only if it beats the current weekly best.
 * Returns true if this run is a new weekly best.
 */
function submitWeeklyScore(score, timeSurvived, blocksMined, linesCleared) {
  const week = getWeeklyDateString();
  let best = null;
  try {
    best = JSON.parse(localStorage.getItem(WEEKLY_HS_KEY) || 'null');
  } catch (_) {}
  if (!best || best.week !== week || score > best.score) {
    try {
      localStorage.setItem(WEEKLY_HS_KEY, JSON.stringify({
        week, score, timeSurvived, blocksMined, linesCleared,
      }));
    } catch (_) {}
    return true;
  }
  return false;
}

/** Render the weekly best section on the game-over screen. */
function renderWeeklyBestGameOver(isNewBest) {
  const el = document.getElementById('weekly-go-section');
  if (!el) return;
  const best = loadWeeklyBest();
  if (!best) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const scoreCls = isNewBest ? 'daily-best-score daily-best-new' : 'daily-best-score';
  const modLabel = weeklyModifier ? ' \u2014 ' + weeklyModifier.name : '';
  el.innerHTML =
    `<div id="weekly-go-label">WEEKLY BEST \u2014 ${formatWeeklyLabel(best.week)}${modLabel}</div>` +
    `<div class="${scoreCls}">${best.score}</div>`;
}

// ── Weekly leaderboard submission tracking ────────────────────────────────────

function hasSubmittedThisWeek() {
  try {
    return localStorage.getItem(WEEKLY_LB_SUBMITTED_KEY) === getWeeklyDateString();
  } catch (_) { return false; }
}

function markSubmittedThisWeek() {
  try { localStorage.setItem(WEEKLY_LB_SUBMITTED_KEY, getWeeklyDateString()); } catch (_) {}
}

// ── Weekly leaderboard API calls ──────────────────────────────────────────────

async function apiSubmitWeeklyScore(displayName, score, linesCleared) {
  const week = getWeeklyDateString();
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/scores/weekly', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName, score, linesCleared, week, clientTimestamp: Date.now() }),
  });
  return resp.json();
}

async function apiFetchWeeklyLeaderboard(weekStr) {
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/leaderboard/week/' + weekStr);
  return resp.json();
}

// ── Weekly submit button (game-over screen) ───────────────────────────────────

function initWeeklyLeaderboardSubmitBtn(score, linesCleared) {
  const btn      = document.getElementById('lb-submit-btn');
  const feedback = document.getElementById('lb-submit-feedback');
  if (!btn) return;

  btn.style.display = 'inline-block';

  if (hasSubmittedThisWeek()) {
    btn.textContent = 'Already Submitted';
    btn.disabled    = true;
    if (feedback) feedback.textContent = '';
    return;
  }

  btn.textContent = 'Submit to Weekly Board';
  btn.disabled    = false;

  btn.onclick = function () {
    const name = loadDisplayName();
    if (!name) {
      openDisplayNameModal(function (confirmedName) {
        _doWeeklySubmit(confirmedName, score, linesCleared, btn, feedback);
      });
    } else {
      _doWeeklySubmit(name, score, linesCleared, btn, feedback);
    }
  };
}

async function _doWeeklySubmit(name, score, linesCleared, btn, feedback) {
  btn.disabled    = true;
  btn.textContent = 'Submitting...';
  if (feedback) feedback.textContent = '';

  try {
    const result = await apiSubmitWeeklyScore(name, score, linesCleared);
    if (result.ok) {
      markSubmittedThisWeek();
      btn.textContent = 'Submitted!';
      if (feedback) {
        feedback.textContent = 'Rank #' + result.rank + ' of ' + result.total;
        feedback.className   = 'lb-submit-feedback lb-submit-ok';
      }
    } else {
      const msg = result.error || 'Submission failed';
      btn.disabled    = false;
      btn.textContent = 'Submit to Weekly Board';
      if (feedback) {
        feedback.textContent = msg;
        feedback.className   = 'lb-submit-feedback lb-submit-err';
      }
      if (result.error === 'Already submitted this week') {
        markSubmittedThisWeek();
        btn.textContent = 'Already Submitted';
        btn.disabled    = true;
      }
    }
  } catch (_) {
    btn.disabled    = false;
    btn.textContent = 'Submit to Weekly Board';
    if (feedback) {
      feedback.textContent = 'Network error \u2014 try again';
      feedback.className   = 'lb-submit-feedback lb-submit-err';
    }
  }
}
