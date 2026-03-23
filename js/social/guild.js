// js/guild.js — Guild UI: roster, management, invites, discover.
// Requires: leaderboard.js loaded first (for loadDisplayName / LEADERBOARD_WORKER_URL).

const GUILD_API = 'https://minectris-leaderboard.workers.dev';
const GUILD_USER_ID_KEY = 'mineCtris_userId';

// ── User identity ─────────────────────────────────────────────────────────────
function guildUserId() {
  return (typeof loadDisplayName === 'function' ? loadDisplayName() : '').trim();
}

const WAR_ROSTER_SIZE = 5;

function _generateHourOptions() {
  return Array.from({ length: 24 }, (_, i) => {
    const h = String(i).padStart(2, '0');
    return `<option value="${h}">${h}:00</option>`;
  }).join('');
}

// ── Module state ──────────────────────────────────────────────────────────────
let guildPanelOpen = false;
let _guildView = 'home'; // 'home' | 'browse' | 'create' | 'requests' | 'manage'
let _myGuild = null;     // cached guild data { guild, members }
let _myGuildId = null;   // from localStorage mirror (updated after join/leave)

function _saveMyGuildId(id) {
  _myGuildId = id;
  try { localStorage.setItem('mineCtris_guildId', id || ''); } catch (_) {}
}
function _loadMyGuildId() {
  try { return localStorage.getItem('mineCtris_guildId') || null; } catch (_) { return null; }
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function _apiFetch(path, options = {}) {
  try {
    const res = await fetch(GUILD_API + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: 'Network error' } };
  }
}

async function apiGetMyGuild(guildId) {
  return _apiFetch(`/api/guilds/${guildId}`);
}

async function apiSearchGuilds(query) {
  const q = query ? `?search=${encodeURIComponent(query)}` : '';
  return _apiFetch(`/api/guilds${q}`);
}

async function apiCreateGuild(name, tag, description, emblem, bannerColor, isPrivate) {
  const userId = guildUserId();
  return _apiFetch('/api/guilds', {
    method: 'POST',
    body: JSON.stringify({ userId, name, tag, description, emblem, bannerColor, isPrivate }),
  });
}

async function apiUpdateGuild(guildId, updates) {
  const userId = guildUserId();
  return _apiFetch(`/api/guilds/${guildId}`, {
    method: 'PATCH',
    body: JSON.stringify({ userId, ...updates }),
  });
}

async function apiSendInvite(guildId, inviteeUsername) {
  const inviterId = guildUserId();
  return _apiFetch(`/api/guilds/${guildId}/invite`, {
    method: 'POST',
    body: JSON.stringify({ inviterId, inviteeUsername }),
  });
}

async function apiGetMyInvites() {
  const userId = guildUserId();
  return _apiFetch(`/api/guild-invites?userId=${encodeURIComponent(userId)}`);
}

async function apiAcceptInvite(inviteId) {
  const userId = guildUserId();
  return _apiFetch(`/api/guild-invites/${inviteId}/accept`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

async function apiDeclineInvite(inviteId) {
  const userId = guildUserId();
  return _apiFetch(`/api/guild-invites/${inviteId}/decline`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

async function apiRequestToJoin(guildId) {
  const userId = guildUserId();
  return _apiFetch(`/api/guilds/${guildId}/join-requests`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

async function apiGetJoinRequests(guildId) {
  const actorId = encodeURIComponent(guildUserId());
  return _apiFetch(`/api/guilds/${guildId}/join-requests?actorId=${actorId}`);
}

async function apiActOnJoinRequest(guildId, requesterId, action) {
  const actorId = guildUserId();
  return _apiFetch(`/api/guilds/${guildId}/join-requests/${encodeURIComponent(requesterId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ actorId, action }),
  });
}

async function apiLeaveGuild(guildId) {
  const userId = guildUserId();
  return _apiFetch(`/api/guilds/${guildId}/leave`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

async function apiKickMember(guildId, targetUserId) {
  const actorId = guildUserId();
  return _apiFetch(`/api/guilds/${guildId}/kick`, {
    method: 'POST',
    body: JSON.stringify({ actorId, targetUserId }),
  });
}

async function apiPromoteMember(guildId, targetUserId, newRole) {
  const actorId = guildUserId();
  return _apiFetch(`/api/guilds/${guildId}/promote`, {
    method: 'POST',
    body: JSON.stringify({ actorId, targetUserId, newRole }),
  });
}

async function apiPostGuildXp(guildId, userId, source) {
  return _apiFetch(`/api/guilds/${guildId}/xp`, {
    method: 'POST',
    body: JSON.stringify({ userId, source }),
  });
}

async function apiGetGuildXpLog(guildId, limit = 50, offset = 0) {
  return _apiFetch(`/api/guilds/${guildId}/xp-log?limit=${limit}&offset=${offset}`);
}

async function apiGetGuildLeaderboard(guildId) {
  return _apiFetch(`/api/guilds/${guildId}/leaderboard?period=weekly`);
}

async function apiGetWeeklyNotification(guildId, userId) {
  return _apiFetch(`/api/guilds/${guildId}/weekly-notification?userId=${encodeURIComponent(userId)}`);
}

// ── Clan War API ──────────────────────────────────────────────────────────────

async function apiSendWarChallenge(challengerGuildId, targetGuildId, proposedWindowStart) {
  const actorId = guildUserId();
  return _apiFetch('/api/clan-wars', {
    method: 'POST',
    body: JSON.stringify({ actorId, challengerGuildId, targetGuildId, proposedWindowStart }),
  });
}

async function apiGetClanWar(warId) {
  return _apiFetch(`/api/clan-wars/${warId}`);
}

async function apiRespondClanWar(warId, actorGuildId, action, counterWindowStart) {
  const actorId = guildUserId();
  return _apiFetch(`/api/clan-wars/${warId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ actorId, actorGuildId, action, counterWindowStart }),
  });
}

async function apiNominateClanWar(warId, actorGuildId, nomineeUserId) {
  const actorId = guildUserId();
  return _apiFetch(`/api/clan-wars/${warId}/nominate`, {
    method: 'POST',
    body: JSON.stringify({ actorId, actorGuildId, nomineeUserId }),
  });
}

async function apiRemoveNomination(warId, actorGuildId, nomineeUserId) {
  const actorId = guildUserId();
  return _apiFetch(`/api/clan-wars/${warId}/nominate/${encodeURIComponent(nomineeUserId)}`, {
    method: 'DELETE',
    body: JSON.stringify({ actorId, actorGuildId }),
  });
}

async function apiGetGuildClanWars(guildId) {
  return _apiFetch(`/api/guilds/${guildId}/clan-wars`);
}

async function apiGetGuildWarHistory(guildId, page = 1) {
  return _apiFetch(`/api/guilds/${guildId}/wars?page=${page}`);
}

async function apiFinalizeWar(warId) {
  return _apiFetch(`/api/wars/${warId}/finalize`, { method: 'POST', body: '{}' });
}

async function apiGetGuildRating(guildId) {
  return _apiFetch(`/api/guilds/${guildId}/rating`);
}

async function apiGetGuildStandings(page = 1) {
  return _apiFetch(`/api/guild-standings?season=current&page=${page}`);
}

async function apiGetGuildHallOfFame() {
  return _apiFetch('/api/season/guild-hall-of-fame');
}

async function apiTickClanWar(warId) {
  return _apiFetch(`/api/clan-wars/${warId}/tick`, { method: 'POST', body: '{}' });
}

// ── Guild XP award (called by game systems) ───────────────────────────────────

const GUILD_XP_SOURCES = {
  game_completion:      5,
  daily_mission:       10,
  mastery_unlock:      25,
  clan_war_win:       100,
  community_goal:    null, // proportional — pass xpAmount directly
  // Legacy sources kept for backward API compat
  standard_match_win:  10,
  tournament_match_win: 25,
};

// Per-member daily XP cap (anti-alt-farming)
const GUILD_MEMBER_DAILY_CAP = 50;

function _getGuildDailyXPState() {
  try {
    const raw = localStorage.getItem('mineCtris_guild_daily_xp');
    const data = raw ? JSON.parse(raw) : null;
    const today = new Date().toISOString().slice(0, 10);
    if (data && data.date === today) return data;
    return { date: today, xp: 0 };
  } catch (_) { return { date: new Date().toISOString().slice(0, 10), xp: 0 }; }
}

function _consumeGuildDailyXP(amount) {
  // Returns actual XP to award (capped), and persists updated state.
  const state = _getGuildDailyXPState();
  const remaining = Math.max(0, GUILD_MEMBER_DAILY_CAP - (state.xp || 0));
  const actual = Math.min(amount, remaining);
  if (actual > 0) {
    state.xp = (state.xp || 0) + actual;
    try { localStorage.setItem('mineCtris_guild_daily_xp', JSON.stringify(state)); } catch (_) {}
  }
  return actual;
}

/**
 * Award guild XP for a game event. Call from match/mission/tournament systems.
 * @param {'game_completion'|'daily_mission'|'mastery_unlock'|'clan_war_win'|'community_goal'|string} source
 * @param {number} [xpAmount] Override amount (required for community_goal)
 */
async function awardGuildXP(source, xpAmount) {
  const guildId = _loadMyGuildId();
  if (!guildId) return;
  const userId = guildUserId();
  if (!userId) return;

  const baseXP = xpAmount != null ? xpAmount : (GUILD_XP_SOURCES[source] || 0);
  if (baseXP <= 0) return;

  // Apply small guild bonus before the daily cap
  const memberCount = (_myGuild && _myGuild.members) ? _myGuild.members.length : 0;
  const adjustedXP = Math.round(baseXP * getSmallGuildMultiplier(memberCount));

  // Enforce per-member daily cap
  const actual = _consumeGuildDailyXP(adjustedXP);
  if (actual <= 0) return;

  // Track for weekly challenges
  _recordGuildChallengeActivity(source);

  try {
    await apiPostGuildXp(guildId, userId, source);
  } catch (_) {
    // Fire-and-forget; don't surface errors to the player
  }
}

// ── Getter for battle/match integration ──────────────────────────────────────

function getMyGuildCosmetics() {
  if (!_myGuild || !_myGuild.guild) return null;
  const g = _myGuild.guild;
  return {
    emblem:         g.emblem || null,
    bannerColor:    g.bannerColor || null,
    activeBoardSkin: g.activeBoardSkin || null,
    isLegendary:    (g.level || 1) >= 20,
    xpBoost:        getGuildXPBoost(g.level || 1),
  };
}

// ── Panel open / close ────────────────────────────────────────────────────────
function openGuildPanel() {
  const userId = guildUserId();
  if (!userId) {
    _showGuildError('Set a display name first (open Leaderboard to register your name).');
    return;
  }
  guildPanelOpen = true;
  if (typeof controls !== 'undefined' && controls && controls.isLocked) controls.unlock();
  const panel = document.getElementById('guild-panel');
  if (!panel) return;
  panel.style.display = 'flex';
  _renderGuildPanel();
  _checkWeeklySummaryNotification(userId);
}

function closeGuildPanel() {
  guildPanelOpen = false;
  const panel = document.getElementById('guild-panel');
  if (panel) panel.style.display = 'none';
  // Disconnect chat WebSocket to save resources
  if (typeof guildChatDisconnect === 'function') guildChatDisconnect();
  if (typeof controls !== 'undefined' && controls && !controls.isLocked &&
      typeof isGameOver !== 'undefined' && !isGameOver) {
    controls.lock();
  }
}

function _showGuildError(msg) {
  const el = document.getElementById('guild-error-toast');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(_showGuildError._t);
  _showGuildError._t = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ── Render dispatcher ─────────────────────────────────────────────────────────
async function _renderGuildPanel() {
  const content = document.getElementById('guild-panel-content');
  if (!content) return;
  content.innerHTML = '<div class="guild-loading">Loading...</div>';

  const userId = guildUserId();
  const localGuildId = _loadMyGuildId();

  if (localGuildId) {
    const res = await apiGetMyGuild(localGuildId);
    if (res.ok) {
      const memberInGuild = (res.data.members || []).some(m => m.userId === userId);
      if (memberInGuild) {
        _myGuild = res.data;
        _saveMyGuildId(localGuildId);
        _renderHomeView(content);
        return;
      }
    }
    _saveMyGuildId(null);
    _myGuild = null;
  }

  if (_guildView === 'create') {
    _renderCreateView(content);
  } else {
    _guildView = 'browse';
    _renderBrowseView(content, '');
  }
}

// ── Utility helpers ───────────────────────────────────────────────────────────
function _esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _fmtDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (_) { return ''; }
}

function _fmtXP(n) {
  if (!n) return '0';
  return Number(n).toLocaleString();
}

function _avatarChar(userId) {
  return (userId || '?')[0].toUpperCase();
}

// XP needed to go from level N to level N+1 (exponential: 100 * 1.3^(N-1))
// L1→L2: 100, L19→L20: ~11,260, cumulative L20: ~48,400
function _xpToNextLevel(level) {
  const l = Math.max(1, level || 1);
  return Math.round(100 * Math.pow(1.3, l - 1));
}

// Cumulative XP needed to reach a given level from level 1
function _xpThresholdForLevel(level) {
  let total = 0;
  for (let i = 1; i < level; i++) total += _xpToNextLevel(i);
  return total;
}

// ── Guild perks ────────────────────────────────────────────────────────────────

const GUILD_PERKS = [
  { level: 3,  id: 'xp_boost_5',      label: '+5% XP boost for all members',                    icon: '⚡' },
  { level: 5,  id: 'emblem_anim',     label: 'Guild emblem animation',                          icon: '✨' },
  { level: 8,  id: 'xp_boost_10',     label: '+10% XP boost + guild chat emotes',               icon: '⚡' },
  { level: 10, id: 'block_skin',      label: 'Guild-exclusive block skin',                      icon: '🎮' },
  { level: 12, id: 'xp_boost_15',     label: '+15% XP boost for all members',                   icon: '⚡' },
  { level: 15, id: 'trail_effect',    label: 'Guild trail effect',                              icon: '🌟' },
  { level: 18, id: 'landing_effect',  label: 'Guild landing effect',                            icon: '💥' },
  { level: 20, id: 'legendary',       label: '"Legendary Guild" title + animated banner + 20% XP boost', icon: '👑' },
];

/**
 * Returns the XP boost multiplier granted by the guild's current perks (0–0.20).
 * Uses the guild in _myGuild cache; pass an explicit level to override.
 */
function getGuildXPBoost(levelOverride) {
  const level = levelOverride != null ? levelOverride
    : (_myGuild && _myGuild.guild ? (_myGuild.guild.level || 1) : 1);
  if (level >= 20) return 0.20;
  if (level >= 12) return 0.15;
  if (level >= 8)  return 0.10;
  if (level >= 3)  return 0.05;
  return 0;
}

/** Returns array of GUILD_PERKS entries unlocked at or below the given level. */
function getUnlockedGuildPerks(level) {
  return GUILD_PERKS.filter(p => p.level <= level);
}

// Guild level milestone unlocks (matches perk unlock levels)
const GUILD_LEVEL_MILESTONES = {
  3:  '⚡ +5% XP boost',
  5:  '✨ Emblem animation',
  8:  '⚡ +10% XP boost + emotes',
  10: '🎮 Exclusive block skin',
  12: '⚡ +15% XP boost',
  15: '🌟 Guild trail effect',
  18: '💥 Guild landing effect',
  20: '👑 Legendary Guild status',
};

// ── Small guild multiplier ────────────────────────────────────────────────────

const GUILD_SMALL_SIZE_THRESHOLD = 10;
const GUILD_SMALL_SIZE_MULTIPLIER = 1.5;

/**
 * Returns the small-guild XP multiplier if the guild has fewer than 10 members.
 * @param {number} memberCount
 */
function getSmallGuildMultiplier(memberCount) {
  return (memberCount > 0 && memberCount < GUILD_SMALL_SIZE_THRESHOLD)
    ? GUILD_SMALL_SIZE_MULTIPLIER : 1.0;
}

// ── Weekly guild challenges ───────────────────────────────────────────────────

const GUILD_WEEKLY_CHALLENGES = [
  { id: 'games_played',   label: 'Play games this week',       target: 15, unit: 'games',   icon: '🎮' },
  { id: 'missions_done',  label: 'Complete daily missions',    target: 5,  unit: 'missions', icon: '📋' },
  { id: 'mastery_unlock', label: 'Unlock mastery tiers',       target: 1,  unit: 'tiers',    icon: '🏅' },
];

const GUILD_CHALLENGE_BONUS_XP = 50; // Bonus guild XP for completing all 3 challenges

function _getGuildChallengeWeekKey() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function _loadGuildChallengeState() {
  try {
    const raw = localStorage.getItem('mineCtris_guild_challenges');
    const data = raw ? JSON.parse(raw) : null;
    const weekKey = _getGuildChallengeWeekKey();
    if (data && data.weekKey === weekKey) return data;
    // New week — reset
    return {
      weekKey,
      progress: { games_played: 0, missions_done: 0, mastery_unlock: 0 },
      bonusAwarded: false,
    };
  } catch (_) {
    return {
      weekKey: _getGuildChallengeWeekKey(),
      progress: { games_played: 0, missions_done: 0, mastery_unlock: 0 },
      bonusAwarded: false,
    };
  }
}

function _saveGuildChallengeState(state) {
  try { localStorage.setItem('mineCtris_guild_challenges', JSON.stringify(state)); } catch (_) {}
}

/**
 * Record an activity event towards weekly guild challenges.
 * Called by awardGuildXP after each qualifying event.
 * @param {string} source - XP source key
 */
function _recordGuildChallengeActivity(source) {
  const state = _loadGuildChallengeState();
  let changed = false;

  if (source === 'game_completion') {
    state.progress.games_played = (state.progress.games_played || 0) + 1;
    changed = true;
  } else if (source === 'daily_mission') {
    state.progress.missions_done = (state.progress.missions_done || 0) + 1;
    changed = true;
  } else if (source === 'mastery_unlock') {
    state.progress.mastery_unlock = (state.progress.mastery_unlock || 0) + 1;
    changed = true;
  }

  if (!changed) return;

  // Check if all 3 challenges are now complete
  const allDone = GUILD_WEEKLY_CHALLENGES.every(
    c => (state.progress[c.id] || 0) >= c.target
  );

  if (allDone && !state.bonusAwarded) {
    state.bonusAwarded = true;
    _saveGuildChallengeState(state);
    // Award bonus guild XP (bypasses daily cap — it's a weekly reward)
    const guildId = _loadMyGuildId();
    const userId = guildUserId();
    if (guildId && userId) {
      apiPostGuildXp(guildId, userId, 'community_goal').catch(() => {});
    }
    _showGuildChallengesCompleteToast();
  } else {
    _saveGuildChallengeState(state);
  }
}

function _showGuildChallengesCompleteToast() {
  const toast = document.getElementById('guild-joined-toast');
  if (!toast) return;
  toast.textContent = '🎯 All weekly guild challenges complete! Bonus XP awarded!';
  toast.style.display = 'block';
  clearTimeout(_showGuildChallengesCompleteToast._t);
  _showGuildChallengesCompleteToast._t = setTimeout(() => { toast.style.display = 'none'; }, 5000);
}

// ── Guild cosmetics constants ─────────────────────────────────────────────────

// 3 starter banner colors always available + 8 unlocked at level 5
const GUILD_BANNER_STARTERS = ['#1e40af', '#047857', '#7c3aed'];
const GUILD_BANNER_UNLOCKS  = ['#b91c1c', '#92400e', '#065f46', '#1e3a8a',
                                '#312e81', '#5b21b6', '#831843', '#134e4a'];

const GUILD_BOARD_SKINS = [
  { id: 'none',         label: 'None',         level: 0,  preview: null },
  { id: 'stone_brick',  label: 'Stone Brick',  level: 10, preview: 'stone_brick' },
  { id: 'nether_brick', label: 'Nether Brick', level: 15, preview: 'nether_brick' },
];

// ── Board skin overlay (in-match) ─────────────────────────────────────────────

function applyGuildBoardSkin(skinId) {
  let el = document.getElementById('guild-board-skin-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'guild-board-skin-overlay';
    document.body.appendChild(el);
  }
  if (!skinId || skinId === 'none') {
    el.className = 'guild-board-skin-overlay';
    el.style.display = 'none';
    return;
  }
  el.className = 'guild-board-skin-overlay guild-board-skin--' + skinId;
  el.style.display = '';
}

function initGuildBoardSkin() {
  const guildId = _loadMyGuildId();
  if (!guildId) { applyGuildBoardSkin(null); return; }
  if (_myGuild && _myGuild.guild) {
    applyGuildBoardSkin(_myGuild.guild.activeBoardSkin || null);
    return;
  }
  apiGetMyGuild(guildId).then(res => {
    if (res.ok && res.data && res.data.guild) {
      applyGuildBoardSkin(res.data.guild.activeBoardSkin || null);
    }
  });
}

// ── Expedition tab ─────────────────────────────────────────────────────────────

const _BIOME_DISPLAY = {
  stone:  { icon: '⛏', name: 'Stone Caverns' },
  forest: { icon: '🌳', name: 'Verdant Grove' },
  nether: { icon: '🔥', name: 'Nether Depths' },
  ice:    { icon: '❄', name: 'Frozen Tundra' },
};

async function _renderExpeditionTab(container, isOfficer, guildId) {
  container.innerHTML = '<div class="guild-loading">Loading…</div>';

  const history = (typeof apiGetGuildExpeditionHistory === 'function')
    ? await apiGetGuildExpeditionHistory(guildId)
    : [];

  let html = '';

  if (typeof guildExpedition !== 'undefined' && guildExpedition.isActive()) {
    html += `<div class="gexp-active-banner">⚔️ Guild Expedition in progress!</div>`;
  }

  html += `<div class="guild-section-title">GUILD EXPEDITION</div>`;
  html += `<div class="gexp-rules">
    <div>▸ <strong>2–5 guild members</strong> play the same biome simultaneously</div>
    <div>▸ Collective target: <strong>50,000 pts × participants</strong></div>
    <div>▸ Success: <strong>+50% XP bonus</strong> + Guild Expedition Badge</div>
    <div>▸ One expedition per biome per day · Officer+ can start</div>
  </div>`;

  if (isOfficer) {
    html += `<div class="gexp-start-section">
      <div class="gexp-biome-row">
        <label class="gexp-biome-label">Biome:</label>
        <select id="gexp-biome-select" class="gexp-biome-select">
          <option value="stone">⛏ Stone Caverns</option>
          <option value="forest">🌳 Verdant Grove</option>
          <option value="nether">🔥 Nether Depths</option>
          <option value="ice">❄ Frozen Tundra</option>
        </select>
      </div>
      <button id="gexp-start-btn" class="guild-primary-btn gexp-start-btn">⚔️ Start Guild Expedition</button>
      <div id="gexp-start-error" class="gexp-start-error" style="display:none"></div>
    </div>`;
  } else {
    html += `<div class="guild-empty">Officers can start a guild expedition from this tab.</div>`;
  }

  html += `<div class="guild-section-title" style="margin-top:14px">EXPEDITION HISTORY <span class="gexp-hist-sub">(last 7 days)</span></div>`;
  if (history.length === 0) {
    html += `<div class="guild-empty">No guild expeditions completed yet this week.</div>`;
  } else {
    html += history.map(r => _renderExpeditionHistoryCard(r)).join('');
  }

  container.innerHTML = html;

  if (isOfficer) {
    const startBtn = document.getElementById('gexp-start-btn');
    const errEl    = document.getElementById('gexp-start-error');
    if (startBtn) {
      startBtn.addEventListener('click', async () => {
        const biomeId = document.getElementById('gexp-biome-select')?.value || 'stone';
        startBtn.disabled = true;
        startBtn.textContent = 'Starting…';
        if (errEl) errEl.style.display = 'none';
        try {
          await guildExpedition.startExpedition(guildId, biomeId);
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message || 'Failed to start expedition.';
            errEl.style.display = 'block';
          }
          startBtn.disabled = false;
          startBtn.textContent = '⚔️ Start Guild Expedition';
        }
      });
    }
  }
}

function _renderExpeditionHistoryCard(r) {
  const biome   = _BIOME_DISPLAY[r.biomeId] || { icon: '🌍', name: r.biomeId || 'Unknown' };
  const date    = _fmtDate(r.completedAt);
  const success = r.success;
  const pct     = r.collectiveTarget > 0
    ? Math.min(100, Math.round(r.collectiveScore / r.collectiveTarget * 100))
    : 0;
  const players = (r.players || []).map(p =>
    `<span class="gexp-hist-player gexp-hist-player--${_esc(p.status || 'done')}">${_esc((p.userId || '').slice(0, 12))}: ${(p.score || 0).toLocaleString()}</span>`
  ).join('');
  return `<div class="gexp-hist-card gexp-hist-card--${success ? 'success' : 'fail'}">
    <div class="gexp-hist-header">
      <span class="gexp-hist-biome">${biome.icon} ${_esc(biome.name)}</span>
      <span class="gexp-hist-result">${success ? '🏆 SUCCESS' : '💀 FAILED'}</span>
      <span class="gexp-hist-date">${date}</span>
    </div>
    <div class="gexp-hist-score">
      ${(r.collectiveScore || 0).toLocaleString()} / ${(r.collectiveTarget || 0).toLocaleString()} pts
      <span class="gexp-hist-pct">(${pct}%)</span>
    </div>
    <div class="gexp-hist-bar-wrap"><div class="gexp-hist-bar-fill" style="width:${pct}%"></div></div>
    <div class="gexp-hist-players">${players}</div>
  </div>`;
}

