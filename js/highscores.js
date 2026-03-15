// High score table — localStorage persistence, top 10 entries.
// Requires: nothing (standalone module).

const HS_KEY = 'mineCtris_highScores';
const HS_MAX = 10;

/** Load scores array from localStorage. Returns [] on any error. */
function loadHighScores() {
  try {
    return JSON.parse(localStorage.getItem(HS_KEY) || '[]');
  } catch (_) {
    return [];
  }
}

/** Persist scores array to localStorage. Silently ignores quota/security errors. */
function saveHighScores(scores) {
  try {
    localStorage.setItem(HS_KEY, JSON.stringify(scores));
  } catch (_) {}
}

/**
 * Submit a new score. Sorts, trims to top 10, and saves.
 * Returns the 1-based rank if the entry made the table, or null otherwise.
 */
function submitHighScore(score, timeSurvived, blocksMined, linesCleared) {
  const entry = {
    score,
    timeSurvived,
    blocksMined,
    linesCleared,
    date: new Date().toISOString().slice(0, 10),
  };
  const scores = loadHighScores();
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const rank = scores.indexOf(entry) + 1; // 1-based
  if (rank <= HS_MAX) {
    saveHighScores(scores.slice(0, HS_MAX));
    return rank;
  }
  return null;
}

/** Format seconds as mm:ss. */
function fmtTime(secs) {
  const s = Math.floor(secs);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

/** Render top-3 scores into #hs-start-panel on the start screen. */
function renderHighScoresStart() {
  const el = document.getElementById('hs-start-panel');
  if (!el) return;
  const scores = loadHighScores().slice(0, 3);
  if (scores.length === 0) {
    el.innerHTML = '<span class="hs-none">No scores yet</span>';
    return;
  }
  el.innerHTML = scores
    .map((e, i) =>
      `<div class="hs-start-row">` +
      `<span class="hs-start-rank">#${i + 1}</span>` +
      `<span class="hs-start-score">${e.score}</span>` +
      `<span class="hs-start-time">${fmtTime(e.timeSurvived)}</span>` +
      `</div>`
    )
    .join('');
}

/**
 * Render the full top-10 table into #hs-go-table on the game-over screen.
 * @param {number|null} highlightRank  1-based rank to highlight (new entry), or null.
 */
function renderHighScoresGameOver(highlightRank) {
  const el = document.getElementById('hs-go-table');
  if (!el) return;
  const scores = loadHighScores();
  if (scores.length === 0) {
    el.innerHTML = '<div class="hs-none">No scores yet</div>';
    return;
  }
  el.innerHTML = scores
    .map((e, i) => {
      const rank = i + 1;
      const cls = rank === highlightRank ? 'hs-go-row hs-go-new' : 'hs-go-row';
      return (
        `<div class="${cls}">` +
        `<span class="hs-go-rank">#${rank}</span>` +
        `<span class="hs-go-score">${e.score}</span>` +
        `<span class="hs-go-time">${fmtTime(e.timeSurvived)}</span>` +
        `<span class="hs-go-date">${e.date}</span>` +
        `</div>`
      );
    })
    .join('');
}
