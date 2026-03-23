// Season mission tracks — two weekly tracks that drive engagement throughout the season.
// Requires: stats.js (loadLifetimeStats, saveLifetimeStats, checkLevelUp, updateLevelBadgeHUD)

const SEASON_MISSIONS_KEY      = 'mineCtris_season_missions';
const SEASON_MISSIONS_BONUS_XP = 500;

// ── Track & mission definitions ───────────────────────────────────────────────

const SEASON_MISSION_TRACKS = [
  {
    id:   'grind',
    name: 'The Grind',
    icon: '\u2694\uFE0F',
    desc: 'Ranked & tournament challenges',
    missions: [
      { id: 'g1', text: 'Play 10 ranked matches',              metric: 'ranked_played',      target: 10, flag: false },
      { id: 'g2', text: 'Win 5 ranked matches',                metric: 'ranked_won',         target: 5,  flag: false },
      { id: 'g3', text: 'Reach a new personal rating high',    metric: 'new_rating_high',    target: 1,  flag: true  },
      { id: 'g4', text: 'Enter a tournament',                  metric: 'tournament_entered', target: 1,  flag: true  },
      { id: 'g5', text: 'Achieve Gold tier or higher',         metric: 'gold_tier_reached',  target: 1,  flag: true  },
    ],
  },
  {
    id:   'showtime',
    name: 'Showtime',
    icon: '\uD83C\uDFAD',
    desc: 'Spectator & tournament challenges',
    missions: [
      { id: 's1', text: 'Watch 3 live matches as a spectator', metric: 'matches_watched',      target: 3,  flag: false },
      { id: 's2', text: 'Send 20 hype reactions',              metric: 'hype_reactions',       target: 20, flag: false },
      { id: 's3', text: 'Play in a tournament',                metric: 'tournament_played',    target: 1,  flag: true  },
      { id: 's4', text: 'Win a tournament match',              metric: 'tournament_match_won', target: 1,  flag: true  },
      { id: 's5', text: 'Have spectators watch your match',    metric: 'spectator_watched_you',target: 1,  flag: true  },
    ],
  },
];

// ── Week key helpers ──────────────────────────────────────────────────────────

/** Returns ISO week string 'YYYY-WN' for today (UTC). Weeks start Monday. */
function _smWeekKey() {
  var now = new Date();
  var d   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  var day = d.getUTCDay() || 7;           // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // shift to nearest Thursday
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var weekNum   = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + '-W' + weekNum;
}

/** Returns ms until next Monday 00:00 UTC. */
function _smMsUntilWeekReset() {
  var now          = new Date();
  var day          = now.getUTCDay();             // 0=Sun … 6=Sat
  var daysUntilMon = (8 - day) % 7 || 7;         // 1..7
  var nextMon      = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMon
  ));
  return nextMon - now;
}

// ── Storage ───────────────────────────────────────────────────────────────────

function _smLoad() {
  try {
    var raw = localStorage.getItem(SEASON_MISSIONS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function _smSave(state) {
  try { localStorage.setItem(SEASON_MISSIONS_KEY, JSON.stringify(state)); } catch (_) {}
}

function _smDefaultProgress() {
  return {
    grind:    { ranked_played: 0, ranked_won: 0, new_rating_high: 0, tournament_entered: 0, gold_tier_reached: 0 },
    showtime: { matches_watched: 0, hype_reactions: 0, tournament_played: 0, tournament_match_won: 0, spectator_watched_you: 0 },
  };
}

/** Ensure the state is initialized for the current week. Returns the state object. */
function _smEnsure() {
  var week  = _smWeekKey();
  var state = _smLoad();
  if (!state || state.weekKey !== week) {
    state = {
      weekKey:      week,
      progress:     _smDefaultProgress(),
      completed:    { grind: [], showtime: [] },
      bonusAwarded: { grind: false, showtime: false },
    };
    _smSave(state);
  }
  return state;
}

// ── Internal metric update ────────────────────────────────────────────────────

/**
 * @param {string} trackId   'grind' | 'showtime'
 * @param {string} metric    metric key
 * @param {number} value     value to apply
 * @param {'add'|'flag'|'max'} op
 */
function _smUpdateMetric(trackId, metric, value, op) {
  var state    = _smEnsure();
  var progress = state.progress[trackId];
  if (!progress) return;

  var changed = false;
  if (op === 'add') {
    progress[metric] = (progress[metric] || 0) + value;
    changed = true;
  } else if (op === 'flag') {
    if (!progress[metric]) { progress[metric] = 1; changed = true; }
  } else if (op === 'max') {
    if ((progress[metric] || 0) < value) { progress[metric] = value; changed = true; }
  }
  if (!changed) return;

  var track     = SEASON_MISSION_TRACKS.find(function (t) { return t.id === trackId; });
  var newlyDone = [];
  track.missions.forEach(function (m) {
    if (state.completed[trackId].indexOf(m.id) !== -1) return;
    var val = progress[m.metric] || 0;
    if (val >= m.target) {
      state.completed[trackId].push(m.id);
      newlyDone.push(m);
    }
  });

  newlyDone.forEach(function (m) { _smShowMissionToast(track.name, m.text); });

  if (!state.bonusAwarded[trackId] && state.completed[trackId].length >= track.missions.length) {
    state.bonusAwarded[trackId] = true;
    _smAwardBonus(track.name);
  }

  _smSave(state);
  renderSeasonMissionsPanel();
}

// ── XP bonus ─────────────────────────────────────────────────────────────────

function _smAwardBonus(trackName) {
  if (typeof loadLifetimeStats !== 'function') return;
  var stats = loadLifetimeStats();
  var oldXP = stats.playerXP || 0;
  stats.playerXP = oldXP + SEASON_MISSIONS_BONUS_XP;
  if (typeof saveLifetimeStats === 'function') saveLifetimeStats(stats);
  if (typeof checkLevelUp === 'function') checkLevelUp(oldXP, stats.playerXP);
  if (typeof updateLevelBadgeHUD === 'function') updateLevelBadgeHUD();
  _smShowBonusToast(trackName, SEASON_MISSIONS_BONUS_XP);
}

// ── Toasts ────────────────────────────────────────────────────────────────────

function _smShowMissionToast(trackName, missionText) {
  var el = document.getElementById('mission-complete-toast');
  if (!el) return;
  el.querySelector('.mct-title').textContent = trackName.toUpperCase() + ' \u2014 MISSION COMPLETE';
  el.querySelector('.mct-text').textContent  = missionText;
  el.querySelector('.mct-xp').textContent    = 'Weekly progress!';
  el.classList.remove('mct-visible');
  void el.offsetWidth;
  el.classList.add('mct-visible');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(function () { el.classList.remove('mct-visible'); }, 3200);
}

function _smShowBonusToast(trackName, xp) {
  var el = document.getElementById('mission-complete-toast');
  if (!el) return;
  el.querySelector('.mct-title').textContent = '\u2B50 TRACK COMPLETE \u2014 ' + trackName.toUpperCase();
  el.querySelector('.mct-text').textContent  = 'All 5 weekly missions finished!';
  el.querySelector('.mct-xp').textContent    = '+' + xp + ' Season XP';
  el.classList.remove('mct-visible');
  void el.offsetWidth;
  el.classList.add('mct-visible');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(function () { el.classList.remove('mct-visible'); }, 4000);
}

// ── Public hook functions (called from other modules) ─────────────────────────

/** Call after every ranked (battle) match ends. */
function onSeasonMissionRankedMatchEnd(won) {
  _smUpdateMetric('grind', 'ranked_played', 1, 'add');
  if (won) _smUpdateMetric('grind', 'ranked_won', 1, 'add');
}

/** Call when the player's battle rating reaches a new all-time high. */
function onSeasonMissionRatingHigh() {
  _smUpdateMetric('grind', 'new_rating_high', 1, 'flag');
}

/** Call when the player's rating reaches Gold tier (≥ 1500) for the first time this week. */
function onSeasonMissionGoldTierReached() {
  _smUpdateMetric('grind', 'gold_tier_reached', 1, 'flag');
}

/** Call when the player registers for a tournament. */
function onSeasonMissionTournamentEntered() {
  _smUpdateMetric('grind',    'tournament_entered', 1, 'flag');
  _smUpdateMetric('showtime', 'tournament_played',  1, 'flag');
}

/** Call when a spectator session ends after watching any match result. */
function onSeasonMissionMatchWatched() {
  _smUpdateMetric('showtime', 'matches_watched', 1, 'add');
}

/** Call each time the player sends a hype reaction as a spectator. */
function onSeasonMissionHypeReactionSent() {
  _smUpdateMetric('showtime', 'hype_reactions', 1, 'add');
}

/** Call when the player wins a tournament match. */
function onSeasonMissionTournamentMatchWon() {
  _smUpdateMetric('showtime', 'tournament_match_won', 1, 'flag');
}

/** Call when at least one spectator joins while the player is playing (not spectating). */
function onSeasonMissionSpectatorWatchedYourMatch() {
  _smUpdateMetric('showtime', 'spectator_watched_you', 1, 'flag');
}

// ── Panel rendering ───────────────────────────────────────────────────────────

function renderSeasonMissionsPanel() {
  var container = document.getElementById('season-missions-tracks');
  if (!container) return;

  var state = _smEnsure();
  container.innerHTML = '';

  SEASON_MISSION_TRACKS.forEach(function (track) {
    var progress  = state.progress[track.id]  || {};
    var completed = state.completed[track.id] || [];
    var bonusDone = state.bonusAwarded[track.id];

    var trackEl = document.createElement('div');
    trackEl.className = 'sm-track' + (bonusDone ? ' sm-track-complete' : '');

    var headerEl = document.createElement('div');
    headerEl.className = 'sm-track-header';
    headerEl.innerHTML =
      '<span class="sm-track-icon">' + track.icon + '</span>' +
      '<span class="sm-track-name">' + track.name + '</span>' +
      '<span class="sm-track-count">' + completed.length + '/5</span>';
    trackEl.appendChild(headerEl);

    var descEl = document.createElement('div');
    descEl.className = 'sm-track-desc';
    descEl.textContent = track.desc;
    trackEl.appendChild(descEl);

    if (bonusDone) {
      var bonusEl = document.createElement('div');
      bonusEl.className = 'sm-bonus-badge';
      bonusEl.textContent = '\u2B50 +' + SEASON_MISSIONS_BONUS_XP + ' Season XP Earned!';
      trackEl.appendChild(bonusEl);
    }

    track.missions.forEach(function (m) {
      var isDone = completed.indexOf(m.id) !== -1;
      var val    = progress[m.metric] || 0;
      var pct    = isDone ? 100 : Math.min(100, Math.round((val / m.target) * 100));
      var valStr = m.flag ? (isDone ? '1/1' : '0/1') : (val + '/' + m.target);

      var mEl = document.createElement('div');
      mEl.className = 'sm-mission' + (isDone ? ' sm-mission-done' : '');
      mEl.innerHTML =
        '<div class="sm-mission-row">' +
          '<span class="sm-mission-text">' + m.text + '</span>' +
          (isDone ? '<span class="sm-mission-check">&#10003;</span>' : '') +
        '</div>' +
        '<div class="sm-mission-progress-row">' +
          '<div class="sm-mission-bar"><div class="sm-mission-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="sm-mission-val">' + valStr + '</span>' +
        '</div>';
      trackEl.appendChild(mEl);
    });

    container.appendChild(trackEl);
  });
}

// ── Panel open / close ────────────────────────────────────────────────────────

function openSeasonMissionsPanel() {
  renderSeasonMissionsPanel();
  var el = document.getElementById('season-missions-overlay');
  if (el) el.style.display = 'flex';
  _smStartWeekCountdown();
}

function closeSeasonMissionsPanel() {
  var el = document.getElementById('season-missions-overlay');
  if (el) el.style.display = 'none';
  if (_smCountdownInterval) { clearInterval(_smCountdownInterval); _smCountdownInterval = null; }
}

// ── Weekly reset countdown ────────────────────────────────────────────────────

var _smCountdownInterval = null;

function _smStartWeekCountdown() {
  var el = document.getElementById('season-missions-reset');
  if (!el) return;

  function _tick() {
    var ms = _smMsUntilWeekReset();
    if (ms <= 0) {
      _smEnsure();
      renderSeasonMissionsPanel();
      return;
    }
    var h = Math.floor(ms / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    var s = Math.floor((ms % 60000)   / 1000);
    el.textContent = 'Resets in ' + h + 'h ' +
      String(m).padStart(2, '0') + 'm ' +
      String(s).padStart(2, '0') + 's';
  }

  _tick();
  if (_smCountdownInterval) clearInterval(_smCountdownInterval);
  _smCountdownInterval = setInterval(_tick, 1000);
}

// ── Auto-init ─────────────────────────────────────────────────────────────────

(function () {
  function _boot() {
    _smEnsure();
    var openBtn  = document.getElementById('start-season-missions-btn');
    var closeBtn = document.getElementById('season-missions-close-btn');
    if (openBtn)  openBtn.addEventListener('click',  openSeasonMissionsPanel);
    if (closeBtn) closeBtn.addEventListener('click', closeSeasonMissionsPanel);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    setTimeout(_boot, 0);
  }
}());
