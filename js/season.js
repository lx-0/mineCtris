// Season — fetches current season config from backend, caches for the session.
// Depends on: leaderboard.js (LEADERBOARD_WORKER_URL)

let _seasonConfig = null;       // active season config, or null
let _seasonEndedConfig = null;  // config of a recently-ended season (active:false but seasonId present)
let _seasonFetched = false;

const _SEASON_END_SEEN_PREFIX = 'mineCtris_season_end_seen_';

/**
 * Fetch current season config from /api/season. Cached after first call.
 * Returns the season config object or null if no active season.
 * Also captures ended-season config in _seasonEndedConfig for summary screen.
 */
async function fetchSeasonConfig() {
  if (_seasonFetched) return _seasonConfig;
  _seasonFetched = true;
  try {
    const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/season');
    if (!resp.ok) { _seasonConfig = null; return null; }
    const data = await resp.json();
    if (!data) { _seasonConfig = null; return null; }
    if (data.active === false && data.seasonId && data.ended) {
      // Season just ended — capture config for summary screen
      _seasonEndedConfig = data;
      _seasonConfig = null;
      return null;
    }
    if (data.active === false) { _seasonConfig = null; return null; }
    _seasonConfig = data;
    return _seasonConfig;
  } catch (_) {
    _seasonConfig = null;
    return null;
  }
}

/** Returns the cached active season config, or null. */
function getSeasonConfig() {
  return _seasonConfig;
}

/** Returns the ended-season config if one was detected this session, or null. */
function getEndedSeasonConfig() {
  return _seasonEndedConfig;
}

/** Calculate days remaining in the season. */
function _getSeasonDaysRemaining(season) {
  if (!season || !season.endDate) return 0;
  const end = new Date(season.endDate + 'T23:59:59Z');
  const now = new Date();
  const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

// Theme → accent color mapping for the season banner border/glow
const _SEASON_THEME_ACCENT = {
  overworld:  '#4A90D9',
  nether:     '#CC3300',
  end:        '#7B2FBE',
  deep_dark:  '#00CED1',
};

/**
 * Populate and show the season banner on the mode-select screen.
 * Fetches season data if not already loaded; hides banner if no active season.
 * Also triggers end-of-season summary screen if applicable.
 */
async function initSeasonBanner() {
  const banner = document.getElementById('season-banner');
  if (!banner) return;

  const season = await fetchSeasonConfig();
  if (!season) {
    banner.style.display = 'none';
    // Check if a season just ended and show summary if not yet seen
    _maybeShowSeasonEndScreen();
    return;
  }

  const daysLeft = _getSeasonDaysRemaining(season);
  const nameEl  = document.getElementById('season-banner-name');
  const daysEl  = document.getElementById('season-banner-days');

  if (nameEl) nameEl.textContent = season.name || 'Active Season';
  if (daysEl) {
    daysEl.textContent = daysLeft > 0
      ? daysLeft + (daysLeft === 1 ? ' day left' : ' days left')
      : 'Final day!';
  }

  // Apply theme accent color
  const accent = _SEASON_THEME_ACCENT[season.theme] || '#00ff88';
  banner.style.borderColor = accent;
  banner.style.setProperty('--season-accent', accent);

  banner.style.display = 'flex';
}

// ── End-of-season summary screen ──────────────────────────────────────────────

function _hasSeenSeasonEnd(seasonId) {
  try { return !!localStorage.getItem(_SEASON_END_SEEN_PREFIX + seasonId); } catch (_) { return true; }
}

function _markSeasonEndSeen(seasonId) {
  try { localStorage.setItem(_SEASON_END_SEEN_PREFIX + seasonId, '1'); } catch (_) {}
}

async function _maybeShowSeasonEndScreen() {
  const ended = getEndedSeasonConfig();
  if (!ended || !ended.seasonId) return;
  if (_hasSeenSeasonEnd(ended.seasonId)) return;

  // Fetch the archive
  try {
    const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/season/archive/' + ended.seasonId);
    if (!resp.ok) return;
    const archive = await resp.json();
    if (!archive || !archive.top10) return;
    _showSeasonEndScreen(archive);
  } catch (_) {
    // Network failure — skip silently; will retry next session
  }
}

function _showSeasonEndScreen(archive) {
  const overlay = document.getElementById('season-end-overlay');
  if (!overlay) return;

  const accent = _SEASON_THEME_ACCENT[archive.theme] || '#00ff88';
  overlay.querySelector('#season-end-panel').style.setProperty('--season-end-accent', accent);

  const nameEl = document.getElementById('season-end-name');
  if (nameEl) nameEl.textContent = archive.name || '';

  // Build rankings table
  const body = document.getElementById('season-end-body');
  const myName = (function() {
    try { return (localStorage.getItem('mineCtris_displayName') || '').toLowerCase(); } catch (_) { return ''; }
  })();

  let myEntry = null;
  let html = '<table class="season-end-table"><thead><tr>' +
    '<th>#</th><th>Player</th><th>Score</th><th>Games</th>' +
    '</tr></thead><tbody>';

  archive.top10.forEach(function(e) {
    const isMe = myName && e.displayName.toLowerCase() === myName;
    if (isMe) myEntry = e;
    const rowCls = isMe ? 'season-end-row-me' : ('season-end-row-' + e.rank);
    let nameCell = _escSeasonHtml(e.displayName);
    if (e.badge) {
      const icons = { Champion: '🏆', Veteran: '🥈', Contender: '🥉' };
      const icon = icons[e.badge] || '';
      nameCell = icon + ' ' + nameCell;
    }
    if (isMe) nameCell += ' ◀';
    html += '<tr class="' + rowCls + '">' +
      '<td>' + e.rank + '</td>' +
      '<td>' + nameCell + '</td>' +
      '<td>' + (e.totalScore || 0).toLocaleString() + '</td>' +
      '<td>' + (e.gamesPlayed || 0) + '</td>' +
      '</tr>';
  });
  html += '</tbody></table>';
  if (body) body.innerHTML = html;

  // Show player's result if they participated but aren't in top-10 display
  const yourResultEl = document.getElementById('season-end-your-result');
  const yourRankEl   = document.getElementById('season-end-your-rank');
  if (myEntry && myEntry.rank > 10 && yourResultEl && yourRankEl) {
    yourRankEl.textContent = 'Your rank: #' + myEntry.rank;
    yourResultEl.style.display = 'block';
  } else if (yourResultEl) {
    yourResultEl.style.display = 'none';
  }

  overlay.style.display = 'flex';

  const closeBtn = document.getElementById('season-end-close-btn');
  if (closeBtn) {
    closeBtn.onclick = function() {
      overlay.style.display = 'none';
      _markSeasonEndSeen(archive.seasonId);
    };
  }
}

function _escSeasonHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
