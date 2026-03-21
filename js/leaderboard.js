// Online leaderboard — display name modal, score submission, leaderboard panel.
// Depends on: daily.js (getDailyDateString, formatDailyLabel)

const LEADERBOARD_WORKER_URL = 'https://minectris-leaderboard.workers.dev';
const DISPLAY_NAME_KEY = 'mineCtris_displayName';
const LB_SUBMITTED_KEY = 'mineCtris_lbSubmitted'; // value: "YYYY-MM-DD"

// Season badge labels by rank (top-3 finishers)
const _SEASON_BADGES = {
  1: { label: 'Champion', icon: '🏆' },
  2: { label: 'Veteran',  icon: '🥈' },
  3: { label: 'Contender', icon: '🥉' },
};

// ── Storage helpers ───────────────────────────────────────────────────────────

function loadDisplayName() {
  try { return localStorage.getItem(DISPLAY_NAME_KEY) || ''; } catch (_) { return ''; }
}

function saveDisplayName(name) {
  try { localStorage.setItem(DISPLAY_NAME_KEY, name); } catch (_) {}
}

function hasSubmittedToday() {
  try {
    return localStorage.getItem(LB_SUBMITTED_KEY) === getDailyDateString();
  } catch (_) { return false; }
}

function markSubmittedToday() {
  try { localStorage.setItem(LB_SUBMITTED_KEY, getDailyDateString()); } catch (_) {}
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function apiSubmitScore(displayName, score, linesCleared) {
  const date = getDailyDateString();
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName, score, linesCleared, date, clientTimestamp: Date.now() }),
  });
  return resp.json();
}

async function apiFetchLeaderboard(date) {
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/leaderboard/' + date);
  return resp.json();
}

async function apiFetchSeasonLeaderboard() {
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/leaderboard/season');
  return resp.json();
}

async function apiFetchSeasonArchive(seasonId) {
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/season/archive/' + seasonId);
  return resp.json();
}

async function apiFetchPlayerBadges(displayName) {
  try {
    const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/badges/' + encodeURIComponent(displayName));
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.badges || [];
  } catch (_) { return []; }
}

async function apiFetchSeasonRatings(displayName) {
  const url = LEADERBOARD_WORKER_URL + '/api/season/ratings' +
    (displayName ? '?displayName=' + encodeURIComponent(displayName) : '');
  const resp = await fetch(url);
  return resp.json();
}

async function apiFetchHallOfFame() {
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/season/hall-of-fame');
  return resp.json();
}

async function apiFetchSeasonRatingSnapshot(seasonId) {
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/season/rating-snapshot/' + encodeURIComponent(seasonId));
  return resp.json();
}

async function apiFetchCoopLeaderboard(date, isDaily) {
  const path = isDaily
    ? '/api/leaderboard/coop/daily/' + date
    : '/api/leaderboard/coop/' + date;
  const resp = await fetch(LEADERBOARD_WORKER_URL + path);
  return resp.json();
}

async function apiSubmitCoopScore(player1, player2, score, difficulty, isDaily) {
  const date = getDailyDateString();
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/leaderboard/coop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player1, player2, score, date, difficulty, isDaily: !!isDaily }),
  });
  return resp.json();
}

// ── Display Name Modal ────────────────────────────────────────────────────────

/**
 * Open the display name modal.
 * @param {function} onConfirm  Called with the validated name string.
 */
function openDisplayNameModal(onConfirm) {
  const overlay = document.getElementById('lb-name-modal');
  const input   = document.getElementById('lb-name-input');
  const errEl   = document.getElementById('lb-name-error');
  const saveBtn = document.getElementById('lb-name-save-btn');
  const cancelBtn = document.getElementById('lb-name-cancel-btn');

  if (!overlay) return;

  // Pre-fill with existing name
  if (input) input.value = loadDisplayName();
  if (errEl) errEl.textContent = '';

  overlay.style.display = 'flex';
  if (input) input.focus();

  function validate() {
    const val = (input ? input.value : '').trim();
    if (!/^[a-zA-Z0-9_]{1,16}$/.test(val)) {
      if (errEl) errEl.textContent = 'Letters, numbers and _ only (max 16)';
      return null;
    }
    if (errEl) errEl.textContent = '';
    return val;
  }

  function onSave() {
    const name = validate();
    if (!name) return;
    saveDisplayName(name);
    overlay.style.display = 'none';
    cleanup();
    onConfirm(name);
  }

  function onCancel() {
    overlay.style.display = 'none';
    cleanup();
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') onSave();
    if (e.key === 'Escape') onCancel();
  }

  function cleanup() {
    if (saveBtn)   saveBtn.removeEventListener('click', onSave);
    if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
    if (input)     input.removeEventListener('keydown', onKeyDown);
  }

  if (saveBtn)   saveBtn.addEventListener('click', onSave);
  if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
  if (input)     input.addEventListener('keydown', onKeyDown);
}

// ── Leaderboard Panel ─────────────────────────────────────────────────────────

let _lbActiveTab = 'today'; // 'today' | 'yesterday' | 'thisweek' | 'lastweek' | 'season' | 'seasonrating' | 'coop' | 'dailycoop' | 'battle'

function openLeaderboardPanel(defaultTab) {
  const overlay = document.getElementById('lb-panel-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  _lbActiveTab = defaultTab || 'today';
  _syncLbTabs();
  _loadLbTab(_lbActiveTab);
}

function closeLeaderboardPanel() {
  const overlay = document.getElementById('lb-panel-overlay');
  if (overlay) overlay.style.display = 'none';
}

function _syncLbTabs() {
  const todayBtn     = document.getElementById('lb-tab-today');
  const yestBtn      = document.getElementById('lb-tab-yesterday');
  const thisWeekBtn  = document.getElementById('lb-tab-thisweek');
  const lastWeekBtn  = document.getElementById('lb-tab-lastweek');
  const seasonBtn       = document.getElementById('lb-tab-season');
  const seasonRatingBtn = document.getElementById('lb-tab-seasonrating');
  const coopBtn         = document.getElementById('lb-tab-coop');
  const dailyCoopBtn    = document.getElementById('lb-tab-dailycoop');
  const battleBtn       = document.getElementById('lb-tab-battle');
  if (todayBtn)        todayBtn.classList.toggle('lb-tab-active',        _lbActiveTab === 'today');
  if (yestBtn)         yestBtn.classList.toggle('lb-tab-active',         _lbActiveTab === 'yesterday');
  if (thisWeekBtn)     thisWeekBtn.classList.toggle('lb-tab-active',     _lbActiveTab === 'thisweek');
  if (lastWeekBtn)     lastWeekBtn.classList.toggle('lb-tab-active',     _lbActiveTab === 'lastweek');
  if (seasonBtn)       seasonBtn.classList.toggle('lb-tab-active',       _lbActiveTab === 'season');
  if (seasonRatingBtn) seasonRatingBtn.classList.toggle('lb-tab-active', _lbActiveTab === 'seasonrating');
  if (coopBtn)         coopBtn.classList.toggle('lb-tab-active',         _lbActiveTab === 'coop');
  if (dailyCoopBtn)    dailyCoopBtn.classList.toggle('lb-tab-active',    _lbActiveTab === 'dailycoop');
  if (battleBtn)       battleBtn.classList.toggle('lb-tab-active',       _lbActiveTab === 'battle');
}

function _getYesterdayString() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function _loadLbTab(tab) {
  const body = document.getElementById('lb-panel-body');
  if (!body) return;
  body.innerHTML = '<div class="lb-loading">Loading...</div>';

  try {
    if (tab === 'season') {
      // Try active season first; fall back to ended-season archive
      let rendered = false;

      const activeSeason = typeof getSeasonConfig === 'function' ? getSeasonConfig() : null;
      const endedSeason  = typeof getEndedSeasonConfig === 'function' ? getEndedSeasonConfig() : null;

      if (activeSeason && activeSeason.seasonId) {
        // Active season — show live leaderboard
        const data = await apiFetchSeasonLeaderboard();
        if (data && data.entries) {
          const label = data.seasonName || 'Current Season';
          _renderLeaderboard(body, data.entries, null, label, true);
          rendered = true;
        }
      }

      if (!rendered && endedSeason && endedSeason.seasonId) {
        // Season just ended — show archive
        const archive = await apiFetchSeasonArchive(endedSeason.seasonId);
        if (archive && archive.top10) {
          const entries = archive.top10.map(function(e) {
            return {
              rank: e.rank,
              displayName: e.displayName,
              totalScore: e.totalScore,
              gamesPlayed: e.gamesPlayed,
              _archiveBadge: e.badge,
            };
          });
          _renderLeaderboard(body, entries, null, (archive.name || 'Season') + ' — Final', true);
          rendered = true;
        }
      }

      if (!rendered) {
        // Fallback: try the live endpoint anyway (operator may not have set ended flag yet)
        const data = await apiFetchSeasonLeaderboard();
        if (!data || !data.entries) throw new Error('bad response');
        const label = data.seasonName || 'Season';
        _renderLeaderboard(body, data.entries, null, label, true);
      }
    } else if (tab === 'thisweek' || tab === 'lastweek') {
      const weekStr = tab === 'thisweek' ? getWeeklyDateString() : _getLastWeekString();
      const data = await apiFetchWeeklyLeaderboard(weekStr);
      if (!data || !data.entries) throw new Error('bad response');
      const label = formatWeeklyLabel(weekStr) +
        (typeof formatWeeklyDateRange === 'function'
          ? ' \u00b7 ' + formatWeeklyDateRange(weekStr)
          : '');
      _renderLeaderboard(body, data.entries, null, label);
    } else if (tab === 'coop' || tab === 'dailycoop') {
      const isDaily = tab === 'dailycoop';
      const date = getDailyDateString();
      const data = await apiFetchCoopLeaderboard(date, isDaily);
      if (!data || !data.entries) throw new Error('bad response');
      const label = (isDaily ? 'Daily Co-op \u2014 ' : 'Co-op \u2014 ') + formatDailyLabel(date);
      _renderCoopLeaderboard(body, data.entries, label);
    } else if (tab === 'seasonrating') {
      const myName = loadDisplayName();
      const data = await apiFetchSeasonRatings(myName);
      if (!data || !data.entries) throw new Error('bad response');
      _renderSeasonRatingLeaderboard(body, data);
    } else if (tab === 'battle') {
      const data = await apiFetchBattleLeaderboard();
      if (!data || !data.entries) throw new Error('bad response');
      _renderBattleLeaderboard(body, data.entries);
    } else {
      const date = tab === 'today' ? getDailyDateString() : _getYesterdayString();
      const data = await apiFetchLeaderboard(date);
      if (!data || !data.entries) throw new Error('bad response');
      _renderLeaderboard(body, data.entries, date);
    }
  } catch (_) {
    body.innerHTML = '<div class="lb-error">Could not load leaderboard.</div>';
  }
}

function _renderLeaderboard(container, entries, date, labelOverride, isSeason) {
  const myName = loadDisplayName().toLowerCase();
  const dateLabel = labelOverride || formatDailyLabel(date);

  if (!entries.length) {
    container.innerHTML = '<div class="lb-empty">No scores yet for ' + _escHtml(dateLabel) + '.</div>';
    return;
  }

  // Season tab: entries have totalScore + gamesPlayed instead of score + linesCleared
  const scoreKey = isSeason ? 'totalScore' : 'score';
  const col2Label = isSeason ? 'Games' : 'Lines';
  const col2Key   = isSeason ? 'gamesPlayed' : 'linesCleared';

  let html = '<table class="lb-table"><thead><tr>' +
    '<th>#</th><th>Name</th><th>Score</th><th>' + col2Label + '</th>' +
    '</tr></thead><tbody>';

  // Compute local player's level for their own row badge
  const _myLevel = (function() {
    if (typeof getLevelFromXP !== 'function' || typeof loadLifetimeStats !== 'function') return 1;
    return getLevelFromXP(loadLifetimeStats().playerXP || 0);
  })();
  const _myTitle = typeof getLevelTitle === 'function' ? getLevelTitle(_myLevel) : '';

  entries.forEach(function(e) {
    const isMe = myName && e.displayName.toLowerCase() === myName;
    const cls  = isMe ? ' class="lb-row-me"' : '';
    let nameCell = _escHtml(e.displayName);

    // Season top-3 badges
    if (isSeason && _SEASON_BADGES[e.rank]) {
      const b = _SEASON_BADGES[e.rank];
      nameCell = '<span class="lb-season-badge lb-season-badge-' + e.rank + '" title="' + b.label + '">' +
        b.icon + '</span> ' + nameCell;
    }

    if (isMe) {
      const badgeLabel = typeof getLevelBadgeLabel === 'function' ? getLevelBadgeLabel(_myLevel) : 'L' + _myLevel;
      nameCell += ' <span class="lb-level-badge">' + badgeLabel + '</span>';
      if (_myTitle) nameCell += ' <span class="lb-level-title">' + _myTitle + '</span>';
      // Show guild emblem if in a guild
      const _guildCosmetics = (typeof getMyGuildCosmetics === 'function') ? getMyGuildCosmetics() : null;
      if (_guildCosmetics && _guildCosmetics.emblem) {
        const _legendaryClass = _guildCosmetics.isLegendary ? ' lb-guild-emblem--legendary' : '';
        nameCell += ' <span class="lb-guild-emblem' + _legendaryClass + '" title="Guild Emblem">' + _guildCosmetics.emblem + '</span>';
      }
      nameCell += ' ◀';
    }
    const scoreVal = (e[scoreKey] || 0).toLocaleString();
    const col2Val  = e[col2Key] != null ? e[col2Key] : '-';
    html += '<tr' + cls + '>' +
      '<td>' + e.rank + '</td>' +
      '<td>' + nameCell + '</td>' +
      '<td>' + scoreVal + '</td>' +
      '<td>' + col2Val + '</td>' +
      '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function _renderBattleLeaderboard(container, entries) {
  const myName = loadDisplayName().toLowerCase();

  if (!entries.length) {
    container.innerHTML = '<div class="lb-empty">No battle rankings yet.</div>';
    return;
  }

  let html = '<table class="lb-table"><thead><tr>' +
    '<th>#</th><th>Name</th><th>Rating</th><th>W/L/D</th>' +
    '</tr></thead><tbody>';

  entries.forEach(function(e) {
    const isMe = myName && e.displayName.toLowerCase() === myName;
    const cls  = isMe ? ' class="lb-row-me"' : '';
    const tier = (typeof getBattleRankTier === 'function') ? getBattleRankTier(e.rating || 0) : null;
    const tierBadge = tier
      ? '<span class="battle-rank-badge battle-rank-' + tier.cls + '" title="' + tier.name + '">' + tier.icon + '</span> '
      : '';
    let nameCell = tierBadge + _escHtml(e.displayName) + (isMe ? ' &#9668;' : '');
    const wld = (e.wins || 0) + 'W/' + (e.losses || 0) + 'L/' + (e.draws || 0) + 'D';
    html += '<tr' + cls + '>' +
      '<td>' + e.rank + '</td>' +
      '<td>' + nameCell + '</td>' +
      '<td>' + (e.rating || 0) + '</td>' +
      '<td class="lb-wld">' + wld + '</td>' +
      '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

/**
 * Render the season battle-rating leaderboard.
 * data: { seasonName, entries: [{rank, displayName, rating, wins, losses, draws}],
 *         playerEntry: {rank, displayName, rating, wins, losses, draws} | null }
 */
function _renderSeasonRatingLeaderboard(container, data) {
  const myName = loadDisplayName().toLowerCase();
  const entries = data.entries || [];
  const seasonName = data.seasonName || 'Current Season';
  const playerEntry = data.playerEntry || null;

  if (!entries.length) {
    container.innerHTML = '<div class="lb-empty">No season rating entries yet for ' + _escHtml(seasonName) + '.</div>';
    return;
  }

  let html = '<div class="lb-season-rating-header">' + _escHtml(seasonName) + ' — Rating Standings</div>';
  html += '<table class="lb-table"><thead><tr>' +
    '<th>#</th><th>Name</th><th>Rating</th><th>W/L/D</th><th>Win%</th>' +
    '</tr></thead><tbody>';

  // Check if player is in the top-100 list
  let myRankInList = -1;
  entries.forEach(function(e, i) {
    if (myName && e.displayName.toLowerCase() === myName) myRankInList = i;
  });

  entries.forEach(function(e) {
    const isMe = myName && e.displayName.toLowerCase() === myName;
    const cls  = isMe ? ' class="lb-row-me"' : '';
    const tier = (typeof getSeasonRankTier === 'function') ? getSeasonRankTier(e.rating || 0) : null;
    const tierBadge = tier
      ? '<span class="season-rank-badge ' + tier.cls + '" title="' + tier.name + '">' + tier.name + '</span> '
      : '';
    const total = (e.wins || 0) + (e.losses || 0) + (e.draws || 0);
    const winPct = total > 0 ? Math.round((e.wins || 0) / total * 100) + '%' : '-';
    const wld = (e.wins || 0) + 'W/' + (e.losses || 0) + 'L/' + (e.draws || 0) + 'D';
    let nameCell = tierBadge + _escHtml(e.displayName) + (isMe ? ' &#9668;' : '');
    html += '<tr' + cls + '>' +
      '<td>' + e.rank + '</td>' +
      '<td>' + nameCell + '</td>' +
      '<td>' + (e.rating || 0) + '</td>' +
      '<td class="lb-wld">' + wld + '</td>' +
      '<td>' + winPct + '</td>' +
      '</tr>';
  });

  // If player is outside top-100, pin their row at the bottom
  if (myName && myRankInList < 0 && playerEntry && playerEntry.rank != null) {
    const e = playerEntry;
    const tier = (typeof getSeasonRankTier === 'function') ? getSeasonRankTier(e.rating || 0) : null;
    const tierBadge = tier
      ? '<span class="season-rank-badge ' + tier.cls + '" title="' + tier.name + '">' + tier.name + '</span> '
      : '';
    const total = (e.wins || 0) + (e.losses || 0) + (e.draws || 0);
    const winPct = total > 0 ? Math.round((e.wins || 0) / total * 100) + '%' : '-';
    const wld = (e.wins || 0) + 'W/' + (e.losses || 0) + 'L/' + (e.draws || 0) + 'D';
    html += '<tr class="lb-row-me lb-row-me-pinned">' +
      '<td>' + e.rank + '</td>' +
      '<td>' + tierBadge + _escHtml(e.displayName || loadDisplayName()) + ' &#9668;</td>' +
      '<td>' + (e.rating || 0) + '</td>' +
      '<td class="lb-wld">' + wld + '</td>' +
      '<td>' + winPct + '</td>' +
      '</tr>';
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

function _escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const _COOP_DIFF_BADGE = {
  casual:    { label: 'Casual',    cls: 'lb-diff-casual' },
  normal:    { label: 'Normal',    cls: 'lb-diff-normal' },
  challenge: { label: 'Challenge', cls: 'lb-diff-challenge' },
};

function _renderCoopLeaderboard(container, entries, label) {
  const myName = loadDisplayName().toLowerCase();

  if (!entries.length) {
    container.innerHTML = '<div class="lb-empty">No co-op scores yet for ' + _escHtml(label) + '.</div>';
    return;
  }

  let html = '<div class="lb-coop-label">' + _escHtml(label) + '</div>' +
    '<table class="lb-table"><thead><tr>' +
    '<th>#</th><th>Player 1</th><th>Player 2</th><th>Score</th><th>Mode</th>' +
    '</tr></thead><tbody>';

  entries.forEach(function(e) {
    const isMe = myName && (
      e.player1.toLowerCase() === myName || e.player2.toLowerCase() === myName
    );
    const cls = isMe ? ' class="lb-row-me"' : '';
    const p1 = _escHtml(e.player1) + (e.player1.toLowerCase() === myName ? ' ◀' : '');
    const p2 = _escHtml(e.player2) + (e.player2.toLowerCase() === myName ? ' ◀' : '');
    const scoreVal = (e.score || 0).toLocaleString();
    const diff = _COOP_DIFF_BADGE[e.difficulty] || { label: e.difficulty || '?', cls: 'lb-diff-normal' };
    const badge = '<span class="lb-diff-badge ' + diff.cls + '">' + diff.label + '</span>';
    html += '<tr' + cls + '>' +
      '<td>' + e.rank + '</td>' +
      '<td>' + p1 + '</td>' +
      '<td>' + p2 + '</td>' +
      '<td>' + scoreVal + '</td>' +
      '<td>' + badge + '</td>' +
      '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

// ── Submit Button (game-over screen) ─────────────────────────────────────────

/**
 * Wire up the "Submit to Leaderboard" button on the game-over screen.
 * Call from triggerGameOver() when isDailyChallenge is true.
 */
function initLeaderboardSubmitBtn(score, linesCleared) {
  const btn      = document.getElementById('lb-submit-btn');
  const feedback = document.getElementById('lb-submit-feedback');
  if (!btn) return;

  // Only show for daily challenge
  btn.style.display = 'inline-block';

  if (hasSubmittedToday()) {
    btn.textContent  = 'Already Submitted';
    btn.disabled     = true;
    if (feedback) feedback.textContent = '';
    return;
  }

  btn.textContent = 'Submit to Leaderboard';
  btn.disabled    = false;

  btn.onclick = function () {
    const name = loadDisplayName();
    if (!name) {
      openDisplayNameModal(function(confirmedName) {
        _doSubmit(confirmedName, score, linesCleared, btn, feedback);
      });
    } else {
      _doSubmit(name, score, linesCleared, btn, feedback);
    }
  };
}

async function _doSubmit(name, score, linesCleared, btn, feedback) {
  btn.disabled    = true;
  btn.textContent = 'Submitting...';
  if (feedback) feedback.textContent = '';

  try {
    const result = await apiSubmitScore(name, score, linesCleared);
    if (result.ok) {
      markSubmittedToday();
      btn.textContent = 'Submitted!';
      if (feedback) {
        feedback.textContent = 'Rank #' + result.rank + ' of ' + result.total;
        feedback.className   = 'lb-submit-feedback lb-submit-ok';
      }
    } else {
      const msg = result.error || 'Submission failed';
      btn.disabled    = false;
      btn.textContent = 'Submit to Leaderboard';
      if (feedback) {
        feedback.textContent = msg;
        feedback.className   = 'lb-submit-feedback lb-submit-err';
      }
      // If already submitted from another device:
      if (result.error === 'Already submitted today') {
        markSubmittedToday();
        btn.textContent = 'Already Submitted';
        btn.disabled    = true;
      }
    }
  } catch (_) {
    btn.disabled    = false;
    btn.textContent = 'Submit to Leaderboard';
    if (feedback) {
      feedback.textContent = 'Network error — try again';
      feedback.className   = 'lb-submit-feedback lb-submit-err';
    }
  }
}

// ── Hide submit button when not in daily mode ─────────────────────────────────

function hideLeaderboardSubmitBtn() {
  const btn      = document.getElementById('lb-submit-btn');
  const feedback = document.getElementById('lb-submit-feedback');
  if (btn)      btn.style.display = 'none';
  if (feedback) feedback.textContent = '';
}

// ── Init (called once from main.js / init()) ──────────────────────────────────

function initLeaderboard() {
  // Leaderboard panel close button
  const closeBtn = document.getElementById('lb-panel-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeLeaderboardPanel);

  // Leaderboard panel tab buttons
  const todayBtn    = document.getElementById('lb-tab-today');
  const yestBtn     = document.getElementById('lb-tab-yesterday');
  const thisWeekBtn = document.getElementById('lb-tab-thisweek');
  const lastWeekBtn = document.getElementById('lb-tab-lastweek');
  if (todayBtn) {
    todayBtn.addEventListener('click', function() {
      _lbActiveTab = 'today';
      _syncLbTabs();
      _loadLbTab('today');
    });
  }
  if (yestBtn) {
    yestBtn.addEventListener('click', function() {
      _lbActiveTab = 'yesterday';
      _syncLbTabs();
      _loadLbTab('yesterday');
    });
  }
  if (thisWeekBtn) {
    thisWeekBtn.addEventListener('click', function() {
      _lbActiveTab = 'thisweek';
      _syncLbTabs();
      _loadLbTab('thisweek');
    });
  }
  if (lastWeekBtn) {
    lastWeekBtn.addEventListener('click', function() {
      _lbActiveTab = 'lastweek';
      _syncLbTabs();
      _loadLbTab('lastweek');
    });
  }

  const seasonBtn = document.getElementById('lb-tab-season');
  if (seasonBtn) {
    seasonBtn.addEventListener('click', function() {
      _lbActiveTab = 'season';
      _syncLbTabs();
      _loadLbTab('season');
    });
  }

  const seasonRatingTabBtn = document.getElementById('lb-tab-seasonrating');
  if (seasonRatingTabBtn) {
    seasonRatingTabBtn.addEventListener('click', function() {
      _lbActiveTab = 'seasonrating';
      _syncLbTabs();
      _loadLbTab('seasonrating');
    });
  }

  const coopTabBtn = document.getElementById('lb-tab-coop');
  if (coopTabBtn) {
    coopTabBtn.addEventListener('click', function() {
      _lbActiveTab = 'coop';
      _syncLbTabs();
      _loadLbTab('coop');
    });
  }

  const dailyCoopTabBtn = document.getElementById('lb-tab-dailycoop');
  if (dailyCoopTabBtn) {
    dailyCoopTabBtn.addEventListener('click', function() {
      _lbActiveTab = 'dailycoop';
      _syncLbTabs();
      _loadLbTab('dailycoop');
    });
  }

  const battleTabBtn = document.getElementById('lb-tab-battle');
  if (battleTabBtn) {
    battleTabBtn.addEventListener('click', function() {
      _lbActiveTab = 'battle';
      _syncLbTabs();
      _loadLbTab('battle');
    });
  }

  // Leaderboard panel refresh button
  const refreshBtn = document.getElementById('lb-panel-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function() {
      _loadLbTab(_lbActiveTab);
    });
  }

  // Leaderboard button on mode-select screen
  const modeSelectLbBtn = document.getElementById('mode-select-lb-btn');
  if (modeSelectLbBtn) {
    modeSelectLbBtn.addEventListener('click', openLeaderboardPanel);
  }

  // Leaderboard button on game-over screen — open weekly tab if in weekly mode
  const goLbBtn = document.getElementById('go-lb-btn');
  if (goLbBtn) {
    goLbBtn.addEventListener('click', function () {
      openLeaderboardPanel(isWeeklyChallenge ? 'thisweek' : 'today');
    });
  }

  // Co-op leaderboard button on coop game-over screen
  const coopGoLbBtn = document.getElementById('coop-go-lb-btn');
  if (coopGoLbBtn) {
    coopGoLbBtn.addEventListener('click', function () {
      openLeaderboardPanel(isDailyCoopChallenge ? 'dailycoop' : 'coop');
    });
  }

  // Hide submit btn by default (shown only by initLeaderboardSubmitBtn)
  hideLeaderboardSubmitBtn();

  // Hall of Fame button (opens the HoF overlay)
  const hofBtn = document.getElementById('hof-open-btn');
  if (hofBtn) {
    hofBtn.addEventListener('click', openHallOfFamePanel);
  }

  // Hall of Fame close button
  const hofCloseBtn = document.getElementById('hof-close-btn');
  if (hofCloseBtn) {
    hofCloseBtn.addEventListener('click', closeHallOfFamePanel);
  }
}

// ── Hall of Fame ──────────────────────────────────────────────────────────────

let _hofSeasons = null; // cached season list from hall-of-fame endpoint

async function openHallOfFamePanel() {
  const overlay = document.getElementById('hof-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';

  const body    = document.getElementById('hof-body');
  const select  = document.getElementById('hof-season-select');
  if (body) body.innerHTML = '<div class="lb-loading">Loading...</div>';

  try {
    if (!_hofSeasons) {
      const data = await apiFetchHallOfFame();
      _hofSeasons = (data && data.seasons) ? data.seasons : [];
    }

    if (!_hofSeasons.length) {
      if (body) body.innerHTML = '<div class="lb-empty">No past seasons yet.</div>';
      if (select) select.style.display = 'none';
      return;
    }

    // Populate dropdown
    if (select) {
      select.innerHTML = '';
      _hofSeasons.forEach(function(s) {
        const opt = document.createElement('option');
        opt.value = s.seasonId;
        opt.textContent = s.name + ' (' + (s.endDate || '') + ')';
        select.appendChild(opt);
      });
      select.style.display = 'block';
      select.onchange = function() {
        _loadHofSeason(select.value, body);
      };
    }

    // Load the first (most recent) season by default
    _loadHofSeason(_hofSeasons[0].seasonId, body);
  } catch (_) {
    if (body) body.innerHTML = '<div class="lb-error">Could not load Hall of Fame.</div>';
  }
}

async function _loadHofSeason(seasonId, body) {
  if (!body) return;
  body.innerHTML = '<div class="lb-loading">Loading...</div>';
  try {
    const snapshot = await apiFetchSeasonRatingSnapshot(seasonId);
    if (!snapshot || !snapshot.top100) {
      body.innerHTML = '<div class="lb-empty">No data for this season.</div>';
      return;
    }

    const myName = loadDisplayName().toLowerCase();
    const entries = snapshot.top100.slice(0, 10); // Top 10 for Hall of Fame display
    const accent = { overworld: '#4A90D9', nether: '#CC3300', end: '#7B2FBE', deep_dark: '#00CED1' };
    const borderColor = accent[snapshot.theme] || '#00ff88';

    let html = '<div class="hof-season-title" style="--hof-accent:' + borderColor + '">' +
      _escHtml(snapshot.name || '') +
      '<span class="hof-season-date"> — ' + _escHtml(snapshot.endDate || '') + '</span>' +
      '</div>';
    html += '<table class="lb-table"><thead><tr>' +
      '<th>#</th><th>Champion</th><th>Rating</th><th>W/L/D</th>' +
      '</tr></thead><tbody>';

    entries.forEach(function(e) {
      const isMe = myName && e.displayName.toLowerCase() === myName;
      const cls  = isMe ? ' class="lb-row-me"' : '';
      const tier = (typeof getSeasonRankTier === 'function') ? getSeasonRankTier(e.rating || 0) : null;
      const tierBadge = tier
        ? '<span class="season-rank-badge ' + tier.cls + '" title="' + tier.name + '">' + tier.name + '</span> '
        : '';
      const championIcon = e.rank === 1 ? '<span class="hof-champion-icon" title="Season Champion">&#127942;</span> ' : '';
      const wld = (e.wins || 0) + 'W/' + (e.losses || 0) + 'L/' + (e.draws || 0) + 'D';
      let nameCell = championIcon + tierBadge + _escHtml(e.displayName) + (isMe ? ' &#9668;' : '');
      html += '<tr' + cls + '>' +
        '<td>' + e.rank + '</td>' +
        '<td>' + nameCell + '</td>' +
        '<td>' + (e.rating || 0) + '</td>' +
        '<td class="lb-wld">' + wld + '</td>' +
        '</tr>';
    });

    html += '</tbody></table>';
    body.innerHTML = html;
  } catch (_) {
    body.innerHTML = '<div class="lb-error">Could not load season data.</div>';
  }
}

function closeHallOfFamePanel() {
  const overlay = document.getElementById('hof-overlay');
  if (overlay) overlay.style.display = 'none';
}
