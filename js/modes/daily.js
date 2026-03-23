// Daily challenge — seeded PRNG, date key, and daily best scores.
// Requires: nothing (standalone module).

const DAILY_HS_KEY = 'mineCtris_dailyBest';

/**
 * Simple 32-bit seeded PRNG (mulberry32).
 * Returns a function that yields uniformly distributed floats in [0, 1).
 */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns today's date as "YYYY-MM-DD" in UTC. */
function getDailyDateString() {
  return new Date().toISOString().slice(0, 10);
}

/** Derive a 32-bit unsigned seed from a date string. */
function _hashDate(str) {
  let h = 0x12345678;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x9e3779b9);
    h = ((h << 13) | (h >>> 19)) ^ h;
  }
  return h >>> 0;
}

/** Returns a fresh seeded PRNG function for today's daily challenge. */
function getDailyPrng() {
  return mulberry32(_hashDate(getDailyDateString()));
}

/** Format "YYYY-MM-DD" → "Mar 15" */
function formatDailyLabel(dateStr) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const parts = dateStr.split('-');
  const month = months[parseInt(parts[1], 10) - 1];
  const day   = parseInt(parts[2], 10);
  return month + ' ' + day;
}

/** Today's short label for HUD display, e.g. "Mar 15". */
function getTodayLabel() {
  return formatDailyLabel(getDailyDateString());
}

// ── Daily best score storage ──────────────────────────────────────────────────

/** Load today's daily best entry from localStorage. Returns null if none. */
function loadDailyBest() {
  try {
    const data = JSON.parse(localStorage.getItem(DAILY_HS_KEY) || 'null');
    if (!data || data.date !== getDailyDateString()) return null;
    return data;
  } catch (_) {
    return null;
  }
}

/**
 * Submit today's daily score. Saves only if higher than existing best for today.
 * Returns true if this run is a new daily best.
 */
function submitDailyScore(score, timeSurvived, blocksMined, linesCleared) {
  const today = getDailyDateString();
  let best = null;
  try {
    best = JSON.parse(localStorage.getItem(DAILY_HS_KEY) || 'null');
  } catch (_) {}
  if (!best || best.date !== today || score > best.score) {
    try {
      localStorage.setItem(DAILY_HS_KEY, JSON.stringify({
        date: today,
        score,
        timeSurvived,
        blocksMined,
        linesCleared,
      }));
    } catch (_) {}
    return true;
  }
  return false;
}

/** Render the daily best section on the game-over screen. */
function renderDailyBestGameOver(isNewBest) {
  const el = document.getElementById('daily-go-section');
  if (!el) return;
  const best = loadDailyBest();
  if (!best) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const scoreCls = isNewBest ? 'daily-best-score daily-best-new' : 'daily-best-score';
  el.innerHTML =
    `<div id="daily-go-label">DAILY BEST \u2014 ${formatDailyLabel(best.date)}</div>` +
    `<div class="${scoreCls}">${best.score}</div>`;
}
