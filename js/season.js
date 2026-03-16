// Season — fetches current season config from backend, caches for the session.
// Depends on: leaderboard.js (LEADERBOARD_WORKER_URL)

let _seasonConfig = null;
let _seasonFetched = false;

/**
 * Fetch current season config from /api/season. Cached after first call.
 * Returns the season config object or null if no active season.
 */
async function fetchSeasonConfig() {
  if (_seasonFetched) return _seasonConfig;
  _seasonFetched = true;
  try {
    const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/season');
    if (!resp.ok) { _seasonConfig = null; return null; }
    const data = await resp.json();
    if (!data || data.active === false) { _seasonConfig = null; return null; }
    _seasonConfig = data;
    return _seasonConfig;
  } catch (_) {
    _seasonConfig = null;
    return null;
  }
}

/** Returns the cached season config, or null if not yet fetched or no active season. */
function getSeasonConfig() {
  return _seasonConfig;
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
 */
async function initSeasonBanner() {
  const banner = document.getElementById('season-banner');
  if (!banner) return;

  const season = await fetchSeasonConfig();
  if (!season) {
    banner.style.display = 'none';
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
