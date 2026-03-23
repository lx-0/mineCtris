// js/community-goals.js — Community Goals: weekly collective challenges with tiered rewards.
// Requires: guild.js loaded first (for GUILD_API / _apiFetch / _loadMyGuildId).

// ── Templates (must match worker) ────────────────────────────────────────────

const CG_TEMPLATES = [
  { id: 'block_breaker',  name: 'Block Breaker',  metric: 'blocksMined',          icon: '⛏️', goldTarget: 500000 },
  { id: 'line_master',    name: 'Line Master',    metric: 'linesCleared',          icon: '🧱', goldTarget: 100000 },
  { id: 'depth_crawler',  name: 'Depth Crawler',  metric: 'depthsFloorsCleared',   icon: '🕳️', goldTarget: 5000   },
  { id: 'boss_slayer',    name: 'Boss Slayer',    metric: 'bossesDefeated',        icon: '☠️', goldTarget: 1000   },
  { id: 'speed_demon',    name: 'Speed Demon',    metric: 'sprintsCompleted',      icon: '⚡', goldTarget: 12000  },
  { id: 'combo_king',     name: 'Combo King',     metric: 'maxComboSum',           icon: '🔥', goldTarget: 120000 },
];

// ── Module state ──────────────────────────────────────────────────────────────

let _cgCache = null;               // last fetched goal state
let _cgTickerInterval = null;      // HUD refresh interval id
let _cgSessionBossesDefeated = 0;  // accumulated for current session
let _cgSessionFloorsCleared  = 0;  // accumulated for current session

// ── Public: session tracking (call from depths systems) ───────────────────────

function cgRecordBossDefeated() {
  _cgSessionBossesDefeated++;
}

function cgRecordFloorCleared() {
  _cgSessionFloorsCleared++;
}

function cgResetSession() {
  _cgSessionBossesDefeated = 0;
  _cgSessionFloorsCleared  = 0;
}

// ── API helpers ───────────────────────────────────────────────────────────────

const CG_API = typeof GUILD_API !== 'undefined' ? GUILD_API : 'https://minectris-leaderboard.workers.dev';

async function _cgFetch(path, options = {}) {
  try {
    const res  = await fetch(CG_API + path, { headers: { 'Content-Type': 'application/json' }, ...options });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch (_) {
    return { ok: false, data: {} };
  }
}

// ── Fetch current goal ────────────────────────────────────────────────────────

async function fetchCurrentCommunityGoal() {
  const { ok, data } = await _cgFetch('/api/community-goals/current');
  if (!ok) return null;
  _cgCache = data;
  return data;
}

async function fetchCommunityGoalLeaderboard() {
  const { ok, data } = await _cgFetch('/api/community-goals/leaderboard');
  return ok ? data : null;
}

async function fetchPastCommunityGoal(weekStr) {
  const { ok, data } = await _cgFetch(`/api/community-goals/week/${encodeURIComponent(weekStr)}`);
  return ok ? data : null;
}

// ── Submit contribution ───────────────────────────────────────────────────────

/**
 * Called at game end. Submits whatever metric the current goal needs.
 * @param {object} stats  { blocksMined, linesCleared, maxCombo, sprintCompleted }
 */
async function submitCommunityGoalContribution(stats) {
  const guildId   = typeof _loadMyGuildId  === 'function' ? _loadMyGuildId()  : null;
  const guildName = (typeof _myGuild !== 'undefined' && _myGuild && _myGuild.guild)
    ? _myGuild.guild.name : null;
  const displayName = typeof loadDisplayName === 'function' ? loadDisplayName() : '';

  const body = {
    blocksMined:         Math.max(0, stats.blocksMined        || 0),
    linesCleared:        Math.max(0, stats.linesCleared       || 0),
    depthsFloorsCleared: Math.max(0, _cgSessionFloorsCleared),
    bossesDefeated:      Math.max(0, _cgSessionBossesDefeated),
    sprintsCompleted:    stats.sprintCompleted ? 1 : 0,
    maxComboSum:         Math.max(0, stats.maxCombo            || 0),
    displayName,
    guildId,
    guildName,
  };

  const { ok, data } = await _cgFetch('/api/community-goals/contribute', {
    method: 'POST',
    body:   JSON.stringify(body),
  });

  // Reset session trackers
  cgResetSession();

  if (!ok || !data.contribution) return null;

  // Refresh cache
  _cgCache = null;
  _refreshCgTicker();

  return data;
}

// ── HUD Ticker ────────────────────────────────────────────────────────────────

function _cgProgressBar(progress, goldTarget) {
  const pct = Math.min(100, Math.round((progress / goldTarget) * 100));
  // Bronze 40%, Silver 70%, Gold 100%
  return `<div class="cg-ticker-bar-wrap">` +
    `<div class="cg-ticker-bar-fill" style="width:${pct}%"></div>` +
    `<div class="cg-ticker-bar-marker cg-marker-bronze" title="Bronze 40%"></div>` +
    `<div class="cg-ticker-bar-marker cg-marker-silver" title="Silver 70%"></div>` +
    `</div>`;
}

function _cgTierBadge(tierReached) {
  if (!tierReached) return '';
  const colors = { Bronze: '#cd7f32', Silver: '#c0c0c0', Gold: '#ffd700' };
  const c = colors[tierReached] || '#fff';
  return `<span class="cg-tier-badge" style="color:${c}">✦ ${tierReached}</span>`;
}

async function _refreshCgTicker() {
  const el = document.getElementById('cg-ticker');
  if (!el) return;

  const data = _cgCache || await fetchCurrentCommunityGoal();
  if (!data || !data.goal) {
    el.style.display = 'none';
    return;
  }
  _cgCache = data;

  const pct = Math.min(100, Math.round((data.progress / data.goldTarget) * 100));
  const label = `${data.goal.icon} ${data.goal.name}`;
  const progressText = `${_cgFmt(data.progress)} / ${_cgFmt(data.goldTarget)}`;
  const tierBadge = _cgTierBadge(data.tierReached);

  el.innerHTML =
    `<div class="cg-ticker-inner">` +
      `<span class="cg-ticker-label">${label}</span>` +
      `<span class="cg-ticker-progress">${progressText}</span>` +
      `${tierBadge}` +
      `<span class="cg-ticker-pct">${pct}%</span>` +
      _cgProgressBar(data.progress, data.goldTarget) +
      `<span class="cg-ticker-players">👥 ${data.activePlayerCount || 0}</span>` +
    `</div>`;
  el.style.display = 'block';
}

function _cgFmt(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

/** Call once after DOM ready. Starts periodic refresh. */
function initCommunityGoalsTicker() {
  _refreshCgTicker();
  if (_cgTickerInterval) clearInterval(_cgTickerInterval);
  // Refresh every 5 minutes passively; game-end contribution triggers an immediate refresh
  _cgTickerInterval = setInterval(_refreshCgTicker, 5 * 60 * 1000);
}

// ── Guild panel: Community Goals tab ─────────────────────────────────────────

/**
 * Render community goals content into the given container element.
 * @param {HTMLElement} container
 */
async function renderCommunityGoalsTab(container) {
  container.innerHTML = '<div class="guild-loading">Loading community goal…</div>';

  const [goalData, lbData] = await Promise.all([
    fetchCurrentCommunityGoal(),
    fetchCommunityGoalLeaderboard(),
  ]);

  if (!goalData || !goalData.goal) {
    container.innerHTML = '<div class="cg-panel-error">Could not load community goal.</div>';
    return;
  }

  const { goal, progress, goldTarget, tierReached, tiers, activePlayerCount, week } = goalData;
  const pct = Math.min(100, Math.round((progress / goldTarget) * 100));

  // Tier rows
  const tierRows = (tiers || []).map(t => {
    const reachedClass = t.reached ? ' cg-tier-reached' : '';
    const colors = { Bronze: '#cd7f32', Silver: '#c0c0c0', Gold: '#ffd700' };
    const c = colors[t.name] || '#aaa';
    return `<div class="cg-tier-row${reachedClass}">` +
      `<span class="cg-tier-name" style="color:${c}">✦ ${t.name}</span>` +
      `<span class="cg-tier-target">${_cgFmt(t.target)}</span>` +
      `<span class="cg-tier-reward">${t.reward || ''}</span>` +
      `<span class="cg-tier-status">${t.reached ? '✔ Unlocked' : `${t.pct}%`}</span>` +
    `</div>`;
  }).join('');

  // Guild leaderboard rows (top 3 get banner element)
  const lbRows = lbData && lbData.entries && lbData.entries.length
    ? lbData.entries.slice(0, 10).map(e => {
        const medal = e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : `#${e.rank}`;
        const bannerBadge = e.rank <= 3 ? ' <span class="cg-lb-banner-badge">+Banner</span>' : '';
        return `<div class="cg-lb-row">` +
          `<span class="cg-lb-rank">${medal}</span>` +
          `<span class="cg-lb-name">${_cgEsc(e.guildName)}</span>` +
          `<span class="cg-lb-score">${_cgFmt(e.contribution)}${bannerBadge}</span>` +
        `</div>`;
      }).join('')
    : '<div class="cg-lb-empty">No guild contributions yet this week.</div>';

  container.innerHTML = `
    <div class="cg-panel">
      <div class="cg-panel-header">
        <span class="cg-panel-icon">${goal.icon}</span>
        <div class="cg-panel-title-wrap">
          <div class="cg-panel-title">${_cgEsc(goal.name)}</div>
          <div class="cg-panel-week">Week ${week}</div>
        </div>
        <div class="cg-panel-players">👥 ${activePlayerCount}</div>
      </div>

      <div class="cg-panel-progress-wrap">
        <div class="cg-panel-progress-text">
          <span>${_cgFmt(progress)}</span>
          <span>${pct}%</span>
          <span>${_cgFmt(goldTarget)}</span>
        </div>
        <div class="cg-panel-bar-wrap">
          <div class="cg-panel-bar-fill" style="width:${pct}%"></div>
          <div class="cg-panel-bar-marker cg-marker-bronze" title="Bronze (40%)"></div>
          <div class="cg-panel-bar-marker cg-marker-silver" title="Silver (70%)"></div>
        </div>
        ${tierReached ? `<div class="cg-panel-tier-reached">✦ ${tierReached} tier unlocked!</div>` : ''}
      </div>

      <div class="cg-panel-section-title">TIERS & REWARDS</div>
      <div class="cg-tier-list">${tierRows}</div>

      <div class="cg-panel-section-title" style="margin-top:14px">GUILD LEADERBOARD</div>
      <div class="cg-lb-list">${lbRows}</div>
    </div>`;
}

function _cgEsc(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
