// Online leaderboard — display name modal, score submission, leaderboard panel.
// Depends on: daily.js (getDailyDateString, formatDailyLabel)

const LEADERBOARD_WORKER_URL = 'https://minectris-leaderboard.workers.dev';
const DISPLAY_NAME_KEY = 'mineCtris_displayName';
const LB_SUBMITTED_KEY = 'mineCtris_lbSubmitted'; // value: "YYYY-MM-DD"

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

let _lbActiveTab = 'today'; // 'today' | 'yesterday' | 'thisweek' | 'lastweek'

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
  const todayBtn    = document.getElementById('lb-tab-today');
  const yestBtn     = document.getElementById('lb-tab-yesterday');
  const thisWeekBtn = document.getElementById('lb-tab-thisweek');
  const lastWeekBtn = document.getElementById('lb-tab-lastweek');
  if (todayBtn)    todayBtn.classList.toggle('lb-tab-active',    _lbActiveTab === 'today');
  if (yestBtn)     yestBtn.classList.toggle('lb-tab-active',     _lbActiveTab === 'yesterday');
  if (thisWeekBtn) thisWeekBtn.classList.toggle('lb-tab-active', _lbActiveTab === 'thisweek');
  if (lastWeekBtn) lastWeekBtn.classList.toggle('lb-tab-active', _lbActiveTab === 'lastweek');
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
    if (tab === 'thisweek' || tab === 'lastweek') {
      const weekStr = tab === 'thisweek' ? getWeeklyDateString() : _getLastWeekString();
      const data = await apiFetchWeeklyLeaderboard(weekStr);
      if (!data || !data.entries) throw new Error('bad response');
      const label = formatWeeklyLabel(weekStr) +
        (typeof formatWeeklyDateRange === 'function'
          ? ' \u00b7 ' + formatWeeklyDateRange(weekStr)
          : '');
      _renderLeaderboard(body, data.entries, null, label);
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

function _renderLeaderboard(container, entries, date, labelOverride) {
  const myName = loadDisplayName().toLowerCase();
  const dateLabel = labelOverride || formatDailyLabel(date);

  if (!entries.length) {
    container.innerHTML = '<div class="lb-empty">No scores yet for ' + dateLabel + '.</div>';
    return;
  }

  let html = '<table class="lb-table"><thead><tr>' +
    '<th>#</th><th>Name</th><th>Score</th><th>Lines</th>' +
    '</tr></thead><tbody>';

  entries.forEach(function(e) {
    const isMe = myName && e.displayName.toLowerCase() === myName;
    const cls  = isMe ? ' class="lb-row-me"' : '';
    html += '<tr' + cls + '>' +
      '<td>' + e.rank + '</td>' +
      '<td>' + _escHtml(e.displayName) + (isMe ? ' ◀' : '') + '</td>' +
      '<td>' + e.score.toLocaleString() + '</td>' +
      '<td>' + e.linesCleared + '</td>' +
      '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function _escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

  // Hide submit btn by default (shown only by initLeaderboardSubmitBtn)
  hideLeaderboardSubmitBtn();
}
