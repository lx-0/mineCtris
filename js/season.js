// Season — fetches current season config from backend, caches for the session.
// Depends on: leaderboard.js (LEADERBOARD_WORKER_URL)

let _seasonConfig = null;       // active season config, or null
let _seasonEndedConfig = null;  // config of a recently-ended season (active:false but seasonId present)
let _seasonUpcomingConfig = null; // config of an upcoming (not-yet-started) season
let _seasonFetched = false;

// ── Season rank tiers (used for season profile badge, separate from battle tiers) ──
// Based on accumulated battle rating at season snapshot.
const SEASON_RANK_TIERS = [
  { name: 'Diamond',  cls: 'season-diamond',  min: 2500 },
  { name: 'Platinum', cls: 'season-platinum', min: 2000 },
  { name: 'Gold',     cls: 'season-gold',     min: 1500 },
  { name: 'Silver',   cls: 'season-silver',   min: 1000 },
  { name: 'Bronze',   cls: 'season-bronze',   min: 0    },
];

/** Returns the season rank tier object for a given rating. */
function getSeasonRankTier(rating) {
  for (let i = 0; i < SEASON_RANK_TIERS.length; i++) {
    if ((rating || 0) >= SEASON_RANK_TIERS[i].min) return SEASON_RANK_TIERS[i];
  }
  return SEASON_RANK_TIERS[SEASON_RANK_TIERS.length - 1];
}

/**
 * Returns an HTML span with the season rank badge (tier name + rating).
 * @param {number} rating
 */
function getSeasonRankBadgeHtml(rating) {
  const tier = getSeasonRankTier(rating);
  return '<span class="season-rank-badge ' + tier.cls + '" title="' + tier.name + ' \u2014 ' + (rating || 0) + ' pts">' +
    tier.name + ' <span class="season-rank-pts">' + (rating || 0) + ' pts</span></span>';
}

// ── Season rating soft-reset ───────────────────────────────────────────────────

const _SEASON_RESET_APPLIED_KEY = 'mineCtris_seasonResetApplied';

/**
 * Apply the between-season rating soft-reset if not already done for this season.
 * new rating = round(oldRating * 0.75 + 375)
 * Idempotent per seasonId — tracks last-reset season in localStorage.
 * @param {string} seasonId  The new (incoming) season's ID.
 * @returns {number|null}  New rating, or null if reset was already applied.
 */
function applySeasonRatingResetIfNeeded(seasonId) {
  if (!seasonId) return null;
  try {
    const lastReset = localStorage.getItem(_SEASON_RESET_APPLIED_KEY);
    if (lastReset === seasonId) return null; // already done
  } catch (_) {}

  let newRating = null;
  if (typeof loadBattleRating === 'function' && typeof saveBattleRating === 'function') {
    const data = loadBattleRating();
    const oldRating = data.rating || 1000;
    newRating = Math.round(oldRating * 0.75 + 375);
    data.rating = newRating;
    saveBattleRating(data);
  }

  try { localStorage.setItem(_SEASON_RESET_APPLIED_KEY, seasonId); } catch (_) {}
  return newRating;
}

/** Returns the upcoming-season config if one was fetched, or null. */
function getUpcomingSeasonConfig() {
  return _seasonUpcomingConfig;
}

const _SEASON_END_SEEN_PREFIX = 'mineCtris_season_end_seen_';
const _SEASON_STATS_PREFIX    = 'mineCtris_season_stats_';

// ── Season battle stats tracking (per-season, stored in localStorage) ─────────

function _loadSeasonBattleStats(seasonId) {
  try {
    return JSON.parse(localStorage.getItem(_SEASON_STATS_PREFIX + seasonId) || 'null') ||
      { wins: 0, losses: 0, draws: 0, tournamentsEntered: 0 };
  } catch (_) {
    return { wins: 0, losses: 0, draws: 0, tournamentsEntered: 0 };
  }
}

function _saveSeasonBattleStats(seasonId, stats) {
  try { localStorage.setItem(_SEASON_STATS_PREFIX + seasonId, JSON.stringify(stats)); } catch (_) {}
}

/**
 * Record a battle result for the active season.
 * Call this after every ranked battle match.
 * @param {'win'|'loss'|'draw'} result
 */
function recordSeasonBattleResult(result) {
  const season = getSeasonConfig();
  if (!season || !season.seasonId) return;
  const stats = _loadSeasonBattleStats(season.seasonId);
  if (result === 'win')       stats.wins   = (stats.wins   || 0) + 1;
  else if (result === 'loss') stats.losses = (stats.losses || 0) + 1;
  else                        stats.draws  = (stats.draws  || 0) + 1;
  _saveSeasonBattleStats(season.seasonId, stats);
}

/**
 * Record that the player entered a tournament during the active season.
 */
function recordSeasonTournamentEntered() {
  const season = getSeasonConfig();
  if (!season || !season.seasonId) return;
  const stats = _loadSeasonBattleStats(season.seasonId);
  stats.tournamentsEntered = (stats.tournamentsEntered || 0) + 1;
  _saveSeasonBattleStats(season.seasonId, stats);
}

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
    if (data.active === false && data.seasonId && data.upcoming) {
      // Season not yet started — capture for upcoming display
      _seasonUpcomingConfig = data;
      _seasonConfig = null;
      return null;
    }
    if (data.active === false) { _seasonConfig = null; return null; }
    _seasonConfig = data;
    // Apply soft-reset if a new season just became active
    if (_seasonConfig && _seasonConfig.seasonId) {
      applySeasonRatingResetIfNeeded(_seasonConfig.seasonId);
    }
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

/**
 * Returns the featured biome ID for the current season, or null if none is set.
 * The featured biome grants 2x expedition XP and hosts exclusive season pass cosmetics.
 */
function getFeaturedBiomeId() {
  return _seasonConfig ? (_seasonConfig.featuredBiomeId || null) : null;
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

  // Fetch the score archive and rating snapshot in parallel
  try {
    const [archiveResp, snapshotResp] = await Promise.all([
      fetch(LEADERBOARD_WORKER_URL + '/api/season/archive/' + ended.seasonId),
      fetch(LEADERBOARD_WORKER_URL + '/api/season/rating-snapshot/' + ended.seasonId),
    ]);
    if (!archiveResp.ok) return;
    const archive = await archiveResp.json();
    if (!archive || !archive.top10) return;
    const snapshot = snapshotResp.ok ? await snapshotResp.json() : null;
    const seasonStats = _loadSeasonBattleStats(ended.seasonId);
    _showSeasonEndScreen(archive, snapshot, seasonStats);
  } catch (_) {
    // Network failure — skip silently; will retry next session
  }
}

function _showSeasonEndScreen(archive, ratingSnapshot, seasonStats) {
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

  // ── Player's final rating notification ──────────────────────────────────
  // Find the player in the rating snapshot and build a personalised summary.
  let playerRatingEntry = null;
  if (ratingSnapshot && ratingSnapshot.top100 && myName) {
    for (let i = 0; i < ratingSnapshot.top100.length; i++) {
      if (ratingSnapshot.top100[i].displayName.toLowerCase() === myName) {
        playerRatingEntry = ratingSnapshot.top100[i];
        break;
      }
    }
  }

  // Grant season rewards based on player's final rating, and collect the new ones for display.
  let newlyGrantedTiers = [];
  if (typeof grantSeasonRewards === 'function' && playerRatingEntry) {
    newlyGrantedTiers = grantSeasonRewards(archive.seasonId, playerRatingEntry.rating || 0);
  }

  if (playerRatingEntry || (seasonStats && (seasonStats.wins + seasonStats.losses + seasonStats.draws) > 0)) {
    html += '<div class="season-end-your-summary">';
    if (playerRatingEntry) {
      const tier = (typeof getSeasonRankTier === 'function')
        ? getSeasonRankTier(playerRatingEntry.rating || 0)
        : null;
      const tierHtml = tier
        ? '<span class="season-rank-badge ' + tier.cls + '">' + tier.name + '</span>'
        : '';
      html += '<div class="season-end-your-summary-title">Your Final Standing</div>';
      html += '<div class="season-end-your-rating">' +
        'Rank <strong>#' + playerRatingEntry.rank + '</strong> &nbsp;' +
        tierHtml + '&nbsp; <strong>' + playerRatingEntry.rating + '</strong> pts' +
        '</div>';
    }
    if (seasonStats) {
      const matches = (seasonStats.wins || 0) + (seasonStats.losses || 0) + (seasonStats.draws || 0);
      if (matches > 0) {
        html += '<div class="season-end-your-record">' +
          'Season record: ' +
          '<strong>' + (seasonStats.wins || 0) + 'W</strong> / ' +
          '<strong>' + (seasonStats.losses || 0) + 'L</strong> / ' +
          '<strong>' + (seasonStats.draws || 0) + 'D</strong>' +
          ' (' + matches + ' matches)';
        if (seasonStats.tournamentsEntered > 0) {
          html += ' &nbsp;·&nbsp; ' + seasonStats.tournamentsEntered + ' tournament' +
            (seasonStats.tournamentsEntered !== 1 ? 's' : '') + ' entered';
        }
        html += '</div>';
      }
    }
    // Reward unlock notification
    if (newlyGrantedTiers.length && typeof buildRewardNotificationHtml === 'function') {
      html += buildRewardNotificationHtml(newlyGrantedTiers);
    }
    html += '</div>';
  }

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

  // ── Season Recap Card ──────────────────────────────────────────────────────
  // Generate and show a recap card for the player if they played >= 5 matches.
  if (typeof generateAndSaveSeasonRecap === 'function') {
    const displayName = (function() {
      try { return (localStorage.getItem('mineCtris_displayName') || ''); } catch (_) { return ''; }
    })();
    const tournStats = (typeof tournamentLobby !== 'undefined' &&
        typeof tournamentLobby.getTournamentStats === 'function')
      ? tournamentLobby.getTournamentStats() : null;
    // archiveEntry for the player (may be null if outside top-10)
    const myArchiveEntry = playerRatingEntry ? null : null; // rating snapshot is the better source
    const recapCard = generateAndSaveSeasonRecap(
      archive.seasonId,
      archive.name,
      archive.theme,
      displayName,
      playerRatingEntry,
      seasonStats,
      myEntry,   // from archive top-10 (has totalScore); null if player isn't in top-10
      tournStats
    );
    if (recapCard) {
      const viewRecapBtn = document.getElementById('season-end-view-recap-btn');
      if (viewRecapBtn) {
        viewRecapBtn.style.display = 'inline-block';
        viewRecapBtn.onclick = function() { showSeasonRecapModal(recapCard); };
      }
      // Show push notification after a short delay so the end-screen renders first
      setTimeout(function() { showRecapReadyNotification(recapCard); }, 1200);
    }
  }
}

function _escSeasonHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── In-game season HUD (shows season name + days remaining when < 14 days) ────

/**
 * Update the in-game season HUD badge.
 * Shows the season name and countdown only when ≤ 14 days remain.
 * Safe to call even if season data hasn't loaded yet.
 */
function updateSeasonHUD() {
  const el = document.getElementById('season-game-hud');
  if (!el) return;
  const season = getSeasonConfig();
  if (!season) { el.style.display = 'none'; return; }

  const daysLeft = _getSeasonDaysRemaining(season);
  if (daysLeft > 14) { el.style.display = 'none'; return; }

  const nameEl = el.querySelector('.season-game-hud-name');
  const daysEl = el.querySelector('.season-game-hud-days');
  if (nameEl) nameEl.textContent = season.name || 'Season';
  if (daysEl) {
    daysEl.textContent = daysLeft > 0
      ? daysLeft + (daysLeft === 1 ? ' day left' : ' days left')
      : 'Final day!';
  }
  el.style.display = 'flex';
}

/**
 * Initialise the in-game season HUD: fetch season data then render.
 * Call once when the game starts (e.g. from startGame / resetGame).
 */
async function initSeasonHUD() {
  await fetchSeasonConfig();
  updateSeasonHUD();
}
