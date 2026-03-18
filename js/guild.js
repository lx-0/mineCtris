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

async function apiTickClanWar(warId) {
  return _apiFetch(`/api/clan-wars/${warId}/tick`, { method: 'POST', body: '{}' });
}

// ── Guild XP award (called by game systems) ───────────────────────────────────

const GUILD_XP_SOURCES = {
  standard_match_win:   10,
  tournament_match_win: 25,
  clan_war_win:         50,
  daily_mission:         5,
};

/**
 * Award guild XP for a game event. Call from match/mission/tournament systems.
 * @param {'standard_match_win'|'tournament_match_win'|'clan_war_win'|'daily_mission'} source
 */
async function awardGuildXP(source) {
  const guildId = _loadMyGuildId();
  if (!guildId) return; // player is not in a guild
  const userId = guildUserId();
  if (!userId) return;
  if (!GUILD_XP_SOURCES[source]) return;

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

// XP needed to go from level N to level N+1 (quadratic curve: N^2 * 500)
function _xpToNextLevel(level) {
  const l = level || 1;
  return l * l * 500;
}

// Cumulative XP needed to reach a given level from level 1
function _xpThresholdForLevel(level) {
  let total = 0;
  for (let i = 1; i < level; i++) total += i * i * 500;
  return total;
}

// Guild level milestone unlocks
const GUILD_LEVEL_MILESTONES = {
  3:  '⚔️ +1 Officer slot',
  5:  '🎨 Banner colors unlock',
  10: '🎮 Board skin slot 1',
  15: '🎮 Board skin slot 2',
  20: '✨ Legendary emblem',
};

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

// ── Home view (my guild) ──────────────────────────────────────────────────────
function _renderHomeView(content) {
  _guildView = 'home';
  const { guild, members } = _myGuild;
  const userId = guildUserId();
  const me = members.find(m => m.userId === userId) || {};
  const isOfficer = me.role === 'officer' || me.role === 'owner';
  const isOwner = me.role === 'owner';

  // Sort: owner first, officers second (by joinedAt asc), members by contributionXP desc
  const roleOrder = { owner: 0, officer: 1, member: 2 };
  const sortedMembers = members.slice().sort((a, b) => {
    const ro = (roleOrder[a.role] || 2) - (roleOrder[b.role] || 2);
    if (ro !== 0) return ro;
    if (a.role === 'member' && b.role === 'member') {
      return (b.contributionXP || 0) - (a.contributionXP || 0);
    }
    return new Date(a.joinedAt || 0) - new Date(b.joinedAt || 0);
  });

  const memberRows = sortedMembers.map(m => {
    const roleLabel = m.role === 'owner' ? 'Owner' : m.role === 'owner' ? 'Owner' : m.role === 'officer' ? 'Officer' : 'Member';
    const roleIcon = m.role === 'owner' ? '👑' : m.role === 'officer' ? '⚔️' : '🔵';
    const weeklyXP = _fmtXP(m.weeklyContributionXP || 0);
    const totalXP = _fmtXP(m.contributionXP || 0);
    const joined = _fmtDate(m.joinedAt);
    const isMe = m.userId === userId;

    return `<div class="guild-member-row guild-member-row--clickable" data-uid="${_esc(m.userId)}" tabindex="0" role="button">
      <div class="guild-member-avatar" style="background:${m.role === 'owner' ? 'rgba(255,170,0,0.2)' : m.role === 'officer' ? 'rgba(100,100,255,0.2)' : 'rgba(255,255,255,0.08)'}">${_avatarChar(m.userId)}</div>
      <div class="guild-member-info">
        <div class="guild-member-name-row">
          <span class="guild-member-name">${_esc(m.userId)}${isMe ? ' <span class="guild-me-badge">(you)</span>' : ''}</span>
          <span class="guild-role-badge guild-role-badge--${_esc(m.role)}">${roleIcon} ${roleLabel}</span>
        </div>
        <div class="guild-member-stats">XP: ${totalXP} · Week: ${weeklyXP} · Joined ${joined}</div>
      </div>
    </div>`;
  }).join('');

  // XP progress bar (cumulative XP model)
  const xpToNext = _xpToNextLevel(guild.level);
  const xpAtCurrentLevel = _xpThresholdForLevel(guild.level);
  const xpProgress = Math.max(0, (guild.xp || 0) - xpAtCurrentLevel);
  const xpPct = guild.level >= 20 ? 100 : Math.min(100, Math.round((xpProgress / xpToNext) * 100));

  // Next milestone display
  const nextMilestoneLevel = Object.keys(GUILD_LEVEL_MILESTONES)
    .map(Number).filter(l => l > guild.level).sort((a, b) => a - b)[0];
  const nextMilestoneHtml = nextMilestoneLevel
    ? `<div class="guild-next-milestone">Next: Lv.${nextMilestoneLevel} — ${GUILD_LEVEL_MILESTONES[nextMilestoneLevel]}</div>`
    : '';

  const manageBtn = isOfficer
    ? `<button id="guild-manage-btn" class="guild-secondary-btn">⚙️ Manage</button>`
    : '';
  const requestsBtn = isOfficer
    ? `<button id="guild-requests-btn" class="guild-secondary-btn">📋 Requests</button>`
    : '';
  const cosmeticsBtn = isOfficer
    ? `<button id="guild-cosmetics-btn" class="guild-secondary-btn">🎨 Cosmetics</button>`
    : '';

  // Description: editable inline for owner/officer
  const descHtml = isOfficer
    ? `<div class="guild-desc-wrap">
        <div class="guild-desc" id="guild-desc-display">${guild.description ? _esc(guild.description) : '<em style="color:#666">No description — click to add</em>'}
          <button class="guild-desc-edit-btn" id="guild-desc-edit-btn" title="Edit description">✏️</button>
        </div>
        <div class="guild-desc-editor" id="guild-desc-editor" style="display:none">
          <textarea class="guild-desc-textarea" id="guild-desc-textarea" maxlength="256" rows="3">${_esc(guild.description || '')}</textarea>
          <div style="display:flex;gap:6px;margin-top:4px">
            <button class="guild-desc-save-btn" id="guild-desc-save-btn">Save</button>
            <button class="guild-desc-cancel-btn" id="guild-desc-cancel-btn">Cancel</button>
          </div>
        </div>
      </div>`
    : (guild.description ? `<div class="guild-desc">${_esc(guild.description)}</div>` : '');

  content.innerHTML = `
    <div class="guild-home">
      <div class="guild-banner" style="background:${_esc(guild.bannerColor || '#1e40af')}">
        <span class="guild-emblem${(guild.level || 1) >= 20 ? ' guild-emblem--legendary' : ''}">${_esc(guild.emblem || '⚔️')}</span>
        <div class="guild-banner-info">
          <div class="guild-name-tag">${_esc(guild.name)} <span class="guild-tag">[${_esc(guild.tag)}]</span></div>
          <div class="guild-meta">Lv.${guild.level} · ${guild.memberCount}/30${guild.isPrivate ? ' · 🔒' : ''}</div>
          <div class="guild-xp-bar" title="${guild.xp} XP · ${xpPct}% to Lv.${guild.level + 1}">
            <div class="guild-xp-fill" style="width:${xpPct}%"></div>
          </div>
          <div class="guild-xp-label">${_fmtXP(guild.xp)} XP · ${guild.level < 20 ? xpPct + '% to Lv.' + (guild.level + 1) : 'MAX LEVEL'}</div>
          ${nextMilestoneHtml}
        </div>
      </div>
      ${descHtml}
      <div class="guild-home-tabs">
        <button class="guild-tab-btn guild-tab-btn--active" id="guild-tab-roster">👥 Roster</button>
        <button class="guild-tab-btn" id="guild-tab-leaderboard">🏆 Leaderboard</button>
        <button class="guild-tab-btn" id="guild-tab-wars">⚔️ Wars</button>
      </div>
      <div id="guild-tab-panel-roster">
        <div class="guild-section-title">MEMBERS (${guild.memberCount}/30)</div>
        <div id="guild-members-list" class="guild-members-list">${memberRows}</div>
      </div>
      <div id="guild-tab-panel-leaderboard" style="display:none">
        <div class="guild-section-title">WEEKLY LEADERBOARD</div>
        <div id="guild-leaderboard-content" class="guild-leaderboard-loading">Loading…</div>
      </div>
      <div id="guild-tab-panel-wars" style="display:none">
        <div id="guild-wars-content"><div class="guild-loading">Loading…</div></div>
      </div>
      <div class="guild-section-title">INVITE</div>
      <div class="guild-invite-row">
        <input id="guild-invite-input" type="text" placeholder="Invite player by name..." maxlength="32">
        <button id="guild-invite-btn">Invite</button>
      </div>
      <div id="guild-invite-status" class="guild-status-msg"></div>
      <div class="guild-actions">
        ${manageBtn}
        ${requestsBtn}
        ${cosmeticsBtn}
        <button id="guild-leave-btn" class="guild-danger-btn">🚪 Leave</button>
      </div>
    </div>
    <div id="guild-member-card-overlay" class="guild-member-card-overlay" style="display:none"></div>`;

  // ── Tab switching
  const rosterTab = document.getElementById('guild-tab-roster');
  const lbTab     = document.getElementById('guild-tab-leaderboard');
  const warsTab   = document.getElementById('guild-tab-wars');
  const rosterPanel = document.getElementById('guild-tab-panel-roster');
  const lbPanel     = document.getElementById('guild-tab-panel-leaderboard');
  const warsPanel   = document.getElementById('guild-tab-panel-wars');

  function _switchToTab(tab) {
    [rosterTab, lbTab, warsTab].forEach(t => t && t.classList.remove('guild-tab-btn--active'));
    [rosterPanel, lbPanel, warsPanel].forEach(p => { if (p) p.style.display = 'none'; });
    if (tab === 'leaderboard') {
      lbTab.classList.add('guild-tab-btn--active');
      lbPanel.style.display = '';
      _loadGuildLeaderboard();
    } else if (tab === 'wars') {
      warsTab.classList.add('guild-tab-btn--active');
      warsPanel.style.display = '';
      _loadWarsTab();
    } else {
      rosterTab.classList.add('guild-tab-btn--active');
      rosterPanel.style.display = '';
    }
  }

  rosterTab.addEventListener('click', () => _switchToTab('roster'));
  lbTab.addEventListener('click',     () => _switchToTab('leaderboard'));
  warsTab.addEventListener('click',   () => _switchToTab('wars'));

  async function _loadGuildLeaderboard() {
    const lbContent = document.getElementById('guild-leaderboard-content');
    if (!lbContent) return;
    lbContent.className = 'guild-leaderboard-loading';
    lbContent.textContent = 'Loading…';

    const res = await apiGetGuildLeaderboard(_loadMyGuildId());
    if (!res.ok) {
      lbContent.className = '';
      lbContent.textContent = '⚠ Could not load leaderboard.';
      return;
    }

    const { leaderboard, lastWeekSnapshot, week } = res.data;
    const myUserId = guildUserId();

    const rankIcon = ['🥇', '🥈', '🥉'];
    const medalTint = [
      'rgba(255,170,0,0.12)',
      'rgba(180,180,180,0.10)',
      'rgba(180,100,40,0.10)',
    ];

    // Last week's heroes
    let heroesHtml = '';
    if (lastWeekSnapshot && lastWeekSnapshot.top3 && lastWeekSnapshot.top3.length > 0) {
      const heroRows = lastWeekSnapshot.top3.map(h =>
        `<div class="guild-lb-hero-row">
          <span class="guild-lb-hero-rank">${rankIcon[h.rank - 1] || `#${h.rank}`}</span>
          <span class="guild-lb-hero-name">${_esc(h.userId)}</span>
          <span class="guild-lb-hero-xp">${_fmtXP(h.weeklyXP)} XP</span>
        </div>`
      ).join('');
      heroesHtml = `<div class="guild-lb-heroes">
        <div class="guild-lb-heroes-title">⚔️ Last Week's Heroes <span class="guild-lb-week">(${_esc(lastWeekSnapshot.week)})</span></div>
        ${heroRows}
      </div>`;
    }

    // Current week rows
    const rowsHtml = leaderboard.length === 0
      ? '<div class="guild-lb-empty">No activity this week yet.</div>'
      : leaderboard.map(entry => {
          const isMe = entry.userId === myUserId;
          const bg = entry.rank <= 3 ? `background:${medalTint[entry.rank - 1]};` : '';
          const rankDisplay = entry.rank <= 3
            ? `<span class="guild-lb-medal">${rankIcon[entry.rank - 1]}</span>`
            : `<span class="guild-lb-rank">#${entry.rank}</span>`;
          const roleIcon = entry.role === 'owner' ? '👑' : entry.role === 'officer' ? '⚔️' : '';
          return `<div class="guild-lb-row${isMe ? ' guild-lb-row--me' : ''}" style="${bg}">
            ${rankDisplay}
            <div class="guild-lb-avatar">${_avatarChar(entry.userId)}</div>
            <div class="guild-lb-info">
              <div class="guild-lb-name">${_esc(entry.userId)}${isMe ? ' <span class="guild-me-badge">(you)</span>' : ''}${roleIcon ? ` <span class="guild-lb-role">${roleIcon}</span>` : ''}</div>
              <div class="guild-lb-stats">Week: <strong>${_fmtXP(entry.weeklyXP)}</strong> · Total: ${_fmtXP(entry.totalXP)}</div>
            </div>
          </div>`;
        }).join('');

    lbContent.className = '';
    lbContent.innerHTML = `
      ${heroesHtml}
      <div class="guild-lb-current-week">
        <div class="guild-lb-week-label">This week <span class="guild-lb-week">(${_esc(week)})</span></div>
        ${rowsHtml}
      </div>`;
  }

  // ── Wars tab ──────────────────────────────────────────────────────────────
  async function _loadWarsTab() {
    const warsContent = document.getElementById('guild-wars-content');
    if (!warsContent) return;
    warsContent.innerHTML = '<div class="guild-loading">Loading…</div>';

    const guildId = _loadMyGuildId();
    const res     = await apiGetGuildClanWars(guildId);
    if (!warsContent) return; // panel may have been closed

    if (!res.ok) {
      warsContent.innerHTML = `<div class="guild-error">⚠ Could not load wars.</div>`;
      return;
    }

    const wars  = res.data || [];
    const myMember = (_myGuild.members || []).find(m => m.userId === guildUserId()) || {};
    const canAct   = myMember.role === 'officer' || myMember.role === 'owner';

    // Active war (pending/scheduled/roster_open/roster_locked/in_progress)
    const active = wars.find(w =>
      ['pending_acceptance', 'roster_open', 'roster_locked', 'in_progress', 'scheduled'].includes(w.status)
    );

    // Past wars
    const past   = wars.filter(w => w.status === 'completed' || w.status === 'cancelled')
                       .sort((a, b) => new Date(b.challengedAt || 0) - new Date(a.challengedAt || 0))
                       .slice(0, 5);

    let html = '';

    if (active) {
      html += _renderWarSummaryCard(active, guildId, true);
    } else if (canAct) {
      html += `<div class="war-challenge-cta">
        <div class="war-challenge-cta-text">No active war. Challenge a rival guild!</div>
        <button id="war-send-challenge-btn" class="guild-primary-btn">⚔️ Send Challenge</button>
      </div>`;
    } else {
      html += `<div class="guild-empty">No active clan war. Officers can send a challenge.</div>`;
    }

    if (past.length > 0) {
      html += `<div class="guild-section-title" style="margin-top:12px">PAST WARS</div>`;
      html += past.map(w => _renderWarSummaryCard(w, guildId, false)).join('');
    }

    warsContent.innerHTML = html;

    // Challenge button
    const challengeBtn = document.getElementById('war-send-challenge-btn');
    if (challengeBtn) {
      challengeBtn.addEventListener('click', () => _renderChallengeSendView(warsContent, guildId));
    }

    // Active war details button
    if (active) {
      const detailBtn = document.getElementById(`war-detail-btn-${active.id}`);
      if (detailBtn) {
        detailBtn.addEventListener('click', () => _renderWarDetailView(warsContent, active.id, guildId));
      }
    }
  }

  function _renderWarSummaryCard(war, myGuildId, withDetailBtn) {
    const isChallenger = war.challengerGuildId === myGuildId;
    const opponentName = isChallenger
      ? (war.defenderGuildName   || war.defenderGuildId)
      : (war.challengerGuildName || war.challengerGuildId);
    const opponentTag  = isChallenger ? (war.defenderGuildTag || '') : (war.challengerGuildTag || '');
    const statusLabel  = _warStatusLabel(war.status);
    const statusClass  = _warStatusClass(war.status);

    let timeHtml = '';
    if (war.windowStart) {
      timeHtml = `<div class="war-card-time">🕐 ${_fmtWarTime(war.windowStart)}</div>`;
    } else if (war.proposedWindowStart) {
      timeHtml = `<div class="war-card-time">📅 Proposed: ${_fmtWarTime(war.proposedWindowStart)}</div>`;
    }

    let winnerHtml = '';
    if (war.status === 'completed' && war.winner) {
      const weWon = war.winner === myGuildId;
      const isDraw = war.winner === 'draw';
      winnerHtml = isDraw
        ? `<div class="war-card-result war-card-result--draw">Draw</div>`
        : weWon
          ? `<div class="war-card-result war-card-result--win">Victory</div>`
          : `<div class="war-card-result war-card-result--loss">Defeat</div>`;
    }

    return `<div class="war-card">
      <div class="war-card-header">
        <div class="war-card-vs">vs <strong>${_esc(opponentName)}</strong> [${_esc(opponentTag)}]</div>
        <span class="war-status-badge war-status-badge--${statusClass}">${statusLabel}</span>
      </div>
      ${timeHtml}
      ${winnerHtml}
      ${withDetailBtn ? `<button class="guild-secondary-btn war-detail-btn" id="war-detail-btn-${_esc(war.id)}">Details →</button>` : ''}
    </div>`;
  }

  function _warStatusLabel(status) {
    return {
      pending_acceptance: 'Awaiting Response',
      scheduled: 'Scheduled',
      roster_open: 'Roster Open',
      roster_locked: 'Roster Locked',
      in_progress: 'IN PROGRESS',
      completed: 'Completed',
      cancelled: 'Cancelled',
    }[status] || status;
  }

  function _warStatusClass(status) {
    return {
      pending_acceptance: 'pending',
      scheduled: 'scheduled',
      roster_open: 'roster',
      roster_locked: 'roster',
      in_progress: 'active',
      completed: 'done',
      cancelled: 'cancelled',
    }[status] || 'pending';
  }

  function _fmtWarTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
    } catch (_) { return iso; }
  }

  // ── Challenge send view
  async function _renderChallengeSendView(container, myGuildId) {
    container.innerHTML = `
      <div class="war-challenge-form">
        <div class="guild-section-title">SEND WAR CHALLENGE</div>
        <div class="guild-search-row">
          <input id="war-target-search" type="text" placeholder="Search guild by name or tag…" maxlength="40">
          <button id="war-target-search-btn">Search</button>
        </div>
        <div id="war-target-results" class="war-target-results"></div>
        <div id="war-selected-guild" class="war-selected-guild" style="display:none">
          <div class="guild-section-title" style="margin-top:10px">PROPOSED WAR WINDOW (UTC)</div>
          <div class="war-time-picker">
            <input id="war-date-input" type="date">
            <select id="war-hour-select">${_generateHourOptions()}</select>
            <select id="war-minute-select">
              <option value="00">:00</option>
              <option value="30">:30</option>
            </select>
          </div>
          <div id="war-challenge-error" class="guild-error" style="display:none"></div>
          <div class="guild-actions" style="margin-top:8px">
            <button id="war-challenge-submit-btn" class="guild-primary-btn" data-target-id="">⚔️ Send Challenge</button>
            <button id="war-challenge-cancel-btn" class="guild-secondary-btn">Cancel</button>
          </div>
        </div>
      </div>`;

    // Pre-fill date to tomorrow UTC
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const yyyy = tomorrow.getUTCFullYear();
    const mm   = String(tomorrow.getUTCMonth() + 1).padStart(2, '0');
    const dd   = String(tomorrow.getUTCDate()).padStart(2, '0');
    document.getElementById('war-date-input').value = `${yyyy}-${mm}-${dd}`;

    document.getElementById('war-challenge-cancel-btn').addEventListener('click', _loadWarsTab);

    document.getElementById('war-target-search-btn').addEventListener('click', async () => {
      const q       = document.getElementById('war-target-search').value.trim();
      const results = document.getElementById('war-target-results');
      results.innerHTML = '<div class="guild-loading">Searching…</div>';
      const res = await apiSearchGuilds(q);
      if (!res.ok) { results.innerHTML = '<div class="guild-error">Search failed.</div>'; return; }
      const guilds = (res.data || []).filter(g => g.id !== myGuildId).slice(0, 10);
      if (!guilds.length) { results.innerHTML = '<div class="guild-empty">No guilds found.</div>'; return; }
      results.innerHTML = guilds.map(g => `
        <div class="war-target-row" data-guild-id="${_esc(g.id)}" data-guild-name="${_esc(g.name)}" data-guild-tag="${_esc(g.tag)}">
          <span class="war-target-emblem">${_esc(g.emblem || '⚔️')}</span>
          <span class="war-target-name">${_esc(g.name)} [${_esc(g.tag)}]</span>
          <span class="war-target-meta">Lv.${g.level} · ${g.memberCount} members</span>
          <button class="guild-secondary-btn war-select-btn">Select</button>
        </div>`).join('');

      results.querySelectorAll('.war-select-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const row = btn.closest('.war-target-row');
          const gid  = row.dataset.guildId;
          const name = row.dataset.guildName;
          const tag  = row.dataset.guildTag;
          document.getElementById('war-selected-guild').style.display = '';
          document.getElementById('war-challenge-submit-btn').dataset.targetId = gid;
          document.getElementById('war-selected-guild').querySelector('.guild-section-title').textContent =
            `PROPOSED WINDOW — vs ${name} [${tag}]`;
          document.getElementById('war-target-results').innerHTML =
            `<div class="war-selected-hint">Challenging: <strong>${_esc(name)} [${_esc(tag)}]</strong></div>`;
        });
      });
    });

    document.getElementById('war-challenge-submit-btn').addEventListener('click', async (e) => {
      const targetId = e.currentTarget.dataset.targetId;
      if (!targetId) { return; }
      const date   = document.getElementById('war-date-input').value;
      const hour   = document.getElementById('war-hour-select').value;
      const minute = document.getElementById('war-minute-select').value;
      const iso    = `${date}T${hour}:${minute}:00.000Z`;
      const errEl  = document.getElementById('war-challenge-error');
      errEl.style.display = 'none';

      e.currentTarget.disabled = true;
      const res = await apiSendWarChallenge(myGuildId, targetId, iso);
      e.currentTarget.disabled = false;

      if (res.ok) {
        _loadWarsTab();
      } else {
        errEl.textContent = res.data.error || 'Failed to send challenge.';
        errEl.style.display = '';
      }
    });
  }

  // ── War detail view
  async function _renderWarDetailView(container, warId, myGuildId) {
    container.innerHTML = '<div class="guild-loading">Loading war details…</div>';
    await apiTickClanWar(warId); // advance state machine
    const res = await apiGetClanWar(warId);
    if (!res.ok) {
      container.innerHTML = `<div class="guild-error">⚠ Could not load war.</div>`;
      return;
    }
    const { war, rosters } = res.data;
    const myMember = (_myGuild.members || []).find(m => m.userId === guildUserId()) || {};
    const canAct   = myMember.role === 'officer' || myMember.role === 'owner';
    const isChallenger = war.challengerGuildId === myGuildId;
    const myRoster    = rosters[myGuildId] || [];
    const opponentId  = isChallenger ? war.defenderGuildId : war.challengerGuildId;
    const opName      = isChallenger
      ? (war.defenderGuildName || war.defenderGuildId)
      : (war.challengerGuildName || war.challengerGuildId);
    const opTag       = isChallenger ? (war.defenderGuildTag || '') : (war.challengerGuildTag || '');

    let html = `
      <div class="war-detail">
        <div class="war-detail-header">
          <button id="war-back-btn" class="guild-secondary-btn">← Back</button>
          <div class="war-detail-title">⚔️ vs ${_esc(opName)} [${_esc(opTag)}]</div>
          <span class="war-status-badge war-status-badge--${_warStatusClass(war.status)}">${_warStatusLabel(war.status)}</span>
        </div>`;

    // Window time
    const timeStr = war.windowStart
      ? `<div class="war-detail-time">War window: <strong>${_fmtWarTime(war.windowStart)}</strong></div>`
      : `<div class="war-detail-time">Proposed: <strong>${_fmtWarTime(war.proposedWindowStart)}</strong></div>`;
    html += timeStr;
    html += `<div class="war-detail-format">Format: ${_esc(war.format)} · Best-of-5 concurrent 1v1s</div>`;

    // State-specific actions
    if (war.status === 'pending_acceptance' && canAct) {
      const needsMyResponse = war.lastProposerId !== myGuildId;
      if (needsMyResponse) {
        html += `<div class="war-response-section">
          <div class="guild-section-title">RESPOND TO CHALLENGE</div>
          <div class="war-time-picker">
            <label>Counter-propose window:</label>
            <input id="war-counter-date" type="date">
            <select id="war-counter-hour">${_generateHourOptions()}</select>
            <select id="war-counter-minute"><option value="00">:00</option><option value="30">:30</option></select>
          </div>
          <div id="war-respond-error" class="guild-error" style="display:none"></div>
          <div class="guild-actions">
            <button id="war-accept-btn" class="guild-primary-btn">✓ Accept Proposed Time</button>
            <button id="war-counter-btn" class="guild-secondary-btn">↔ Counter-Propose</button>
            <button id="war-decline-btn" class="guild-danger-btn">✗ Decline</button>
          </div>
        </div>`;
      } else {
        html += `<div class="guild-status-msg">Waiting for ${_esc(opName)} to respond…</div>`;
      }
    }

    if ((war.status === 'roster_open') && canAct) {
      const members    = _myGuild.members || [];
      const memberOpts = members.map(m =>
        `<option value="${_esc(m.userId)}">${_esc(m.userId)}</option>`
      ).join('');
      html += `<div class="war-roster-section">
        <div class="guild-section-title">NOMINATE ROSTER (${myRoster.length}/${WAR_ROSTER_SIZE})</div>
        <div class="war-roster-list" id="war-my-roster">
          ${myRoster.length === 0
            ? '<div class="guild-empty">No nominees yet.</div>'
            : myRoster.map(uid => `
                <div class="war-roster-row" data-uid="${_esc(uid)}">
                  <span>${_esc(uid)}</span>
                  <button class="war-remove-nominee-btn guild-danger-btn--sm" data-uid="${_esc(uid)}">✗</button>
                </div>`).join('')}
        </div>
        ${myRoster.length < WAR_ROSTER_SIZE ? `
          <div class="war-nominate-row">
            <select id="war-nominee-select">${memberOpts}</select>
            <button id="war-nominate-btn" class="guild-secondary-btn">+ Add</button>
          </div>
          <div id="war-nominate-error" class="guild-error" style="display:none"></div>` : ''}
      </div>`;
    }

    if (['roster_locked', 'in_progress', 'completed'].includes(war.status)) {
      html += `<div class="war-rosters-locked">
        <div class="guild-section-title">ROSTERS</div>
        <div class="war-rosters-grid">
          <div class="war-roster-col">
            <div class="war-roster-col-title">${_esc(war.challengerGuildName || war.challengerGuildId)} [${_esc(war.challengerGuildTag || '')}]</div>
            ${(rosters[war.challengerGuildId] || []).map(uid => `<div class="war-roster-player">${_esc(uid)}</div>`).join('') || '<div class="guild-empty">No nominees</div>'}
          </div>
          <div class="war-roster-col">
            <div class="war-roster-col-title">${_esc(war.defenderGuildName || war.defenderGuildId)} [${_esc(war.defenderGuildTag || '')}]</div>
            ${(rosters[war.defenderGuildId] || []).map(uid => `<div class="war-roster-player">${_esc(uid)}</div>`).join('') || '<div class="guild-empty">No nominees</div>'}
          </div>
        </div>
      </div>`;
    }

    // ── Command center for in_progress wars ──────────────────────────────────
    if (war.status === 'in_progress') {
      html += `<div id="war-command-center-placeholder"><div class="guild-loading">Loading matches…</div></div>`;
    }

    if (war.status === 'completed' && war.winner) {
      const weWon = war.winner === myGuildId;
      const isDraw = war.winner === 'draw';
      html += `<div class="war-result-banner ${isDraw ? 'war-result-banner--draw' : weWon ? 'war-result-banner--win' : 'war-result-banner--loss'}">
        ${isDraw ? '🤝 DRAW' : weWon ? '🏆 VICTORY' : '💀 DEFEAT'}
      </div>`;
    }

    html += `</div>`;
    container.innerHTML = html;

    document.getElementById('war-back-btn').addEventListener('click', () => {
      ClanWarEngine.stopPolling();
      _loadWarsTab();
    });

    // Load and wire command center for in_progress wars
    if (war.status === 'in_progress' && typeof ClanWarEngine !== 'undefined') {
      const ccPlaceholder = container.querySelector('#war-command-center-placeholder');

      const renderCC = async () => {
        if (!ccPlaceholder || !ccPlaceholder.isConnected) { ClanWarEngine.stopPolling(); return; }
        const slotsRes = await ClanWarEngine.getSlots(warId);
        if (!slotsRes.ok) {
          ccPlaceholder.innerHTML = '<div class="guild-error">⚠ Could not load match slots.</div>';
          return;
        }
        const slots = slotsRes.data.slots || [];
        // Auto-forfeit check: if forfeit deadline has passed, fire forfeits server-side
        await ClanWarEngine.checkAutoForfeits(warId, slots, war);

        ccPlaceholder.innerHTML = ClanWarEngine.renderCommandCenter(war, slots, rosters, myGuildId);
        ClanWarEngine.wireCommandCenter(ccPlaceholder, warId, slots, war, renderCC);
      };

      await renderCC();
      ClanWarEngine.startPolling(warId, renderCC);
    }

    // Response handlers
    if (war.status === 'pending_acceptance' && canAct && war.lastProposerId !== myGuildId) {
      // Pre-fill counter date
      const tomorrow2 = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const yy2 = tomorrow2.getUTCFullYear();
      const mo2 = String(tomorrow2.getUTCMonth() + 1).padStart(2, '0');
      const da2 = String(tomorrow2.getUTCDate()).padStart(2, '0');
      const counterDateEl = document.getElementById('war-counter-date');
      if (counterDateEl) counterDateEl.value = `${yy2}-${mo2}-${da2}`;

      const respond = async (action, counterIso) => {
        const errEl = document.getElementById('war-respond-error');
        errEl.style.display = 'none';
        const res2 = await apiRespondClanWar(warId, myGuildId, action, counterIso);
        if (res2.ok) {
          _renderWarDetailView(container, warId, myGuildId);
        } else {
          errEl.textContent = res2.data.error || 'Action failed.';
          errEl.style.display = '';
        }
      };

      document.getElementById('war-accept-btn').addEventListener('click', () => respond('accept'));
      document.getElementById('war-decline-btn').addEventListener('click', () => respond('decline'));
      document.getElementById('war-counter-btn').addEventListener('click', () => {
        const date2   = document.getElementById('war-counter-date').value;
        const hour2   = document.getElementById('war-counter-hour').value;
        const minute2 = document.getElementById('war-counter-minute').value;
        respond('counter', `${date2}T${hour2}:${minute2}:00.000Z`);
      });
    }

    // Roster nomination handlers
    if (war.status === 'roster_open' && canAct) {
      container.querySelectorAll('.war-remove-nominee-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          const res2 = await apiRemoveNomination(warId, myGuildId, btn.dataset.uid);
          if (res2.ok) {
            _renderWarDetailView(container, warId, myGuildId);
          } else {
            btn.disabled = false;
            const errEl = document.getElementById('war-nominate-error');
            if (errEl) { errEl.textContent = res2.data.error || 'Failed to remove.'; errEl.style.display = ''; }
          }
        });
      });

      const nominateBtn = document.getElementById('war-nominate-btn');
      if (nominateBtn) {
        nominateBtn.addEventListener('click', async () => {
          nominateBtn.disabled = true;
          const uid = document.getElementById('war-nominee-select').value;
          const res2 = await apiNominateClanWar(warId, myGuildId, uid);
          nominateBtn.disabled = false;
          if (res2.ok) {
            _renderWarDetailView(container, warId, myGuildId);
          } else {
            const errEl = document.getElementById('war-nominate-error');
            if (errEl) { errEl.textContent = res2.data.error || 'Failed to nominate.'; errEl.style.display = ''; }
          }
        });
      }
    }
  }

  // ── Wire member rows (open member card on click)
  content.querySelectorAll('.guild-member-row--clickable').forEach(row => {
    const handler = () => {
      const targetId = row.dataset.uid;
      const target = members.find(m => m.userId === targetId);
      if (target) _showMemberCard(content, target, _loadMyGuildId(), me, members, guild);
    };
    row.addEventListener('click', handler);
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
  });

  // ── Inline description edit
  if (isOfficer) {
    const editBtn = document.getElementById('guild-desc-edit-btn');
    const display = document.getElementById('guild-desc-display');
    const editor = document.getElementById('guild-desc-editor');
    const textarea = document.getElementById('guild-desc-textarea');
    const saveBtn = document.getElementById('guild-desc-save-btn');
    const cancelBtn = document.getElementById('guild-desc-cancel-btn');

    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        display.style.display = 'none';
        editor.style.display = 'block';
        textarea.focus();
      });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        editor.style.display = 'none';
        display.style.display = '';
      });
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const desc = textarea.value.trim();
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
        const res = await apiUpdateGuild(_loadMyGuildId(), { description: desc });
        if (res.ok) {
          _myGuild = { guild: res.data.guild, members: res.data.members };
          _renderHomeView(content);
        } else {
          _showGuildError(res.data.error || 'Failed to save description');
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save';
        }
      });
    }
  }

  // ── Invite
  document.getElementById('guild-invite-btn').addEventListener('click', async () => {
    const input = document.getElementById('guild-invite-input');
    const name = input.value.trim();
    if (!name) return;
    const status = document.getElementById('guild-invite-status');
    status.textContent = 'Sending...';
    const res = await apiSendInvite(_loadMyGuildId(), name);
    if (res.ok) {
      status.textContent = `✓ Invited ${name}`;
      input.value = '';
    } else {
      status.textContent = `✗ ${res.data.error || 'Failed'}`;
    }
  });

  // ── Manage button
  if (isOfficer) {
    const manageEl = document.getElementById('guild-manage-btn');
    if (manageEl) {
      manageEl.addEventListener('click', () => _renderManageView(content));
    }
  }

  // ── Cosmetics button
  if (isOfficer) {
    const cosmeticsEl = document.getElementById('guild-cosmetics-btn');
    if (cosmeticsEl) {
      cosmeticsEl.addEventListener('click', () => _renderCosmeticsView(content));
    }
  }

  // ── Join requests
  if (isOfficer) {
    const reqBtn = document.getElementById('guild-requests-btn');
    if (reqBtn) {
      reqBtn.addEventListener('click', () => {
        _guildView = 'requests';
        _renderRequestsView(content);
      });
    }
  }

  // ── Leave
  document.getElementById('guild-leave-btn').addEventListener('click', async () => {
    const msg = isOwner && members.length > 1
      ? 'You are the owner. Leaving will transfer ownership to the next senior member. Continue?'
      : 'Leave this guild?';
    if (!confirm(msg)) return;
    const res = await apiLeaveGuild(_loadMyGuildId());
    if (res.ok) {
      _saveMyGuildId(null);
      _myGuild = null;
      _guildView = 'browse';
      _renderGuildPanel();
    } else {
      _showGuildError(res.data.error || 'Could not leave');
    }
  });
}

// ── Member card overlay ───────────────────────────────────────────────────────
function _showMemberCard(content, target, guildId, me, members, guild) {
  const overlay = document.getElementById('guild-member-card-overlay');
  if (!overlay) return;

  const isOwner = me.role === 'owner';
  const isOfficer = me.role === 'officer' || me.role === 'owner';
  const isMe = target.userId === me.userId;

  const roleLabel = target.role === 'owner' ? 'Owner' : target.role === 'officer' ? 'Officer' : 'Member';
  const roleIcon = target.role === 'owner' ? '👑' : target.role === 'officer' ? '⚔️' : '🔵';

  // Determine available actions
  const actions = [];

  if (!isMe && isOfficer) {
    // Kick: officer can kick members only; owner can kick officers/members
    const canKick = (me.role === 'owner' && target.role !== 'owner') ||
                    (me.role === 'officer' && target.role === 'member');
    if (canKick) {
      actions.push(`<button class="guild-card-action-btn guild-danger-btn" id="card-kick-btn">🥾 Kick</button>`);
    }
  }

  if (!isMe && isOwner && target.role !== 'owner') {
    // Promote/demote (owner only)
    if (target.role === 'member') {
      actions.push(`<button class="guild-card-action-btn guild-secondary-btn" id="card-promote-btn">⬆️ Promote to Officer</button>`);
    }
    if (target.role === 'officer') {
      actions.push(`<button class="guild-card-action-btn guild-secondary-btn" id="card-demote-btn">⬇️ Demote to Member</button>`);
    }
    actions.push(`<button class="guild-card-action-btn guild-secondary-btn" id="card-transfer-btn">👑 Transfer Ownership</button>`);
  }

  overlay.innerHTML = `
    <div class="guild-member-card">
      <div class="guild-member-card-avatar">${_avatarChar(target.userId)}</div>
      <div class="guild-member-card-name">${_esc(target.userId)}</div>
      <div class="guild-member-card-meta">
        <span class="guild-role-badge guild-role-badge--${_esc(target.role)}">${roleIcon} ${roleLabel}</span>
      </div>
      <div class="guild-member-card-stats">
        <div class="guild-member-card-stat"><span>Total XP</span><strong>${_fmtXP(target.contributionXP || 0)}</strong></div>
        <div class="guild-member-card-stat"><span>Weekly XP</span><strong>${_fmtXP(target.weeklyContributionXP || 0)}</strong></div>
        <div class="guild-member-card-stat"><span>Joined</span><strong>${_fmtDate(target.joinedAt)}</strong></div>
      </div>
      ${actions.length ? `<div class="guild-member-card-actions">${actions.join('')}</div>` : ''}
      <button class="guild-card-close-btn" id="card-close-btn">✕ Close</button>
      <div id="card-status" class="guild-status-msg" style="margin-top:6px;text-align:center"></div>
    </div>`;

  overlay.style.display = 'flex';

  document.getElementById('card-close-btn').addEventListener('click', () => {
    overlay.style.display = 'none';
  });

  // Kick
  const kickBtn = document.getElementById('card-kick-btn');
  if (kickBtn) {
    kickBtn.addEventListener('click', async () => {
      if (!confirm(`Kick ${target.userId} from the guild?`)) return;
      kickBtn.disabled = true;
      const res = await apiKickMember(guildId, target.userId);
      if (res.ok) {
        _myGuild = { guild: res.data.guild, members: res.data.members };
        overlay.style.display = 'none';
        _renderHomeView(content);
      } else {
        document.getElementById('card-status').textContent = res.data.error || 'Kick failed';
        kickBtn.disabled = false;
      }
    });
  }

  // Promote to officer
  const promoteBtn = document.getElementById('card-promote-btn');
  if (promoteBtn) {
    promoteBtn.addEventListener('click', async () => {
      promoteBtn.disabled = true;
      const res = await apiPromoteMember(guildId, target.userId, 'officer');
      if (res.ok) {
        _myGuild = { guild: res.data.guild, members: res.data.members };
        overlay.style.display = 'none';
        _renderHomeView(content);
      } else {
        document.getElementById('card-status').textContent = res.data.error || 'Promote failed';
        promoteBtn.disabled = false;
      }
    });
  }

  // Demote to member
  const demoteBtn = document.getElementById('card-demote-btn');
  if (demoteBtn) {
    demoteBtn.addEventListener('click', async () => {
      demoteBtn.disabled = true;
      const res = await apiPromoteMember(guildId, target.userId, 'member');
      if (res.ok) {
        _myGuild = { guild: res.data.guild, members: res.data.members };
        overlay.style.display = 'none';
        _renderHomeView(content);
      } else {
        document.getElementById('card-status').textContent = res.data.error || 'Demote failed';
        demoteBtn.disabled = false;
      }
    });
  }

  // Transfer ownership
  const transferBtn = document.getElementById('card-transfer-btn');
  if (transferBtn) {
    transferBtn.addEventListener('click', async () => {
      if (!confirm(`Transfer guild ownership to ${target.userId}? You will become an officer.`)) return;
      transferBtn.disabled = true;
      const res = await apiPromoteMember(guildId, target.userId, 'owner');
      if (res.ok) {
        _myGuild = { guild: res.data.guild, members: res.data.members };
        overlay.style.display = 'none';
        _renderHomeView(content);
      } else {
        document.getElementById('card-status').textContent = res.data.error || 'Transfer failed';
        transferBtn.disabled = false;
      }
    });
  }
}

// ── Cosmetics view (owner/officer) ────────────────────────────────────────────
function _renderCosmeticsView(content) {
  _guildView = 'cosmetics';
  const { guild } = _myGuild;
  const level = guild.level || 1;
  const hasColors = level >= 5;
  const isLegendary = level >= 20;
  const allColors = [...GUILD_BANNER_STARTERS, ...GUILD_BANNER_UNLOCKS];
  const activeBanner = guild.bannerColor || GUILD_BANNER_STARTERS[0];
  const activeSkin = guild.activeBoardSkin || 'none';

  // Banner color palette swatches
  const starterSwatches = GUILD_BANNER_STARTERS.map(c => `
    <button class="guild-color-swatch${activeBanner === c ? ' guild-color-swatch--active' : ''}"
      data-color="${_esc(c)}" style="background:${_esc(c)}" title="${_esc(c)}"></button>
  `).join('');
  const unlockedSwatches = GUILD_BANNER_UNLOCKS.map(c => `
    <button class="guild-color-swatch${activeBanner === c ? ' guild-color-swatch--active' : ''}${!hasColors ? ' guild-color-swatch--locked' : ''}"
      data-color="${_esc(c)}" style="background:${_esc(c)}" title="${hasColors ? _esc(c) : 'Unlocks at Level 5'}"
      ${!hasColors ? 'disabled' : ''}></button>
  `).join('');

  // Board skin cards
  const skinCards = GUILD_BOARD_SKINS.map(skin => {
    const locked = level < skin.level;
    const isActive = activeSkin === skin.id;
    return `<div class="guild-skin-card${isActive ? ' guild-skin-card--active' : ''}${locked ? ' guild-skin-card--locked' : ''}"
      data-skin="${_esc(skin.id)}" role="button" tabindex="${locked ? -1 : 0}"
      title="${locked ? 'Unlocks at Level ' + skin.level : skin.label}">
        <div class="guild-skin-preview guild-skin-preview--${_esc(skin.id)}"></div>
        <div class="guild-skin-label">${_esc(skin.label)}</div>
        ${locked ? `<div class="guild-skin-lock">🔒 Lv.${skin.level}</div>` : ''}
        ${isActive ? '<div class="guild-skin-active-badge">✓</div>' : ''}
    </div>`;
  }).join('');

  // Legendary emblem section
  const legendaryHtml = `
    <div class="guild-cosmetics-section">
      <div class="guild-section-title">LEGENDARY EMBLEM</div>
      ${isLegendary
        ? `<div class="guild-legendary-badge">
             <span class="guild-legendary-emblem">${_esc(guild.emblem || '⚔️')}</span>
             <span class="guild-legendary-sparkle">✨ Active — animated sparkle ring unlocked at Level 20</span>
           </div>`
        : `<div class="guild-legendary-locked">🔒 Unlock at Level 20 — animated sparkle ring around your guild tag</div>`
      }
    </div>`;

  content.innerHTML = `
    <div class="guild-cosmetics">
      <div class="guild-section-title">BANNER COLOR</div>
      <div class="guild-color-palette">
        <div class="guild-color-row">
          <span class="guild-palette-label">Starter</span>
          <div class="guild-color-swatches">${starterSwatches}</div>
        </div>
        <div class="guild-color-row">
          <span class="guild-palette-label">Level 5${!hasColors ? ' 🔒' : ''}</span>
          <div class="guild-color-swatches">${unlockedSwatches}</div>
        </div>
      </div>

      <div class="guild-cosmetics-section">
        <div class="guild-section-title">BOARD SKIN</div>
        <div class="guild-skin-grid">${skinCards}</div>
      </div>

      ${legendaryHtml}

      <div class="guild-cosmetics-preview">
        <div class="guild-section-title">PREVIEW</div>
        <div class="guild-cosmetics-preview-card" id="gcosm-preview-card">
          <div class="guild-banner guild-cosmetics-preview-banner" id="gcosm-preview-banner"
               style="background:${_esc(activeBanner)}">
            <span class="guild-emblem${isLegendary ? ' guild-emblem--legendary' : ''}">${_esc(guild.emblem || '⚔️')}</span>
            <div class="guild-banner-info">
              <div class="guild-name-tag">${_esc(guild.name)} <span class="guild-tag">[${_esc(guild.tag)}]</span></div>
              <div class="guild-meta">Lv.${level}</div>
            </div>
          </div>
        </div>
      </div>

      <div id="gcosm-status" class="guild-status-msg"></div>
      <div class="guild-actions">
        <button id="gcosm-save-btn" class="guild-primary-btn">Save Cosmetics</button>
        <button id="gcosm-back-btn" class="guild-secondary-btn">← Back</button>
      </div>
    </div>`;

  // Track selections
  let selectedColor = activeBanner;
  let selectedSkin = activeSkin;

  // Color swatch clicks
  content.querySelectorAll('.guild-color-swatch:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      content.querySelectorAll('.guild-color-swatch').forEach(s => s.classList.remove('guild-color-swatch--active'));
      btn.classList.add('guild-color-swatch--active');
      selectedColor = btn.dataset.color;
      const previewBanner = document.getElementById('gcosm-preview-banner');
      if (previewBanner) previewBanner.style.background = selectedColor;
    });
  });

  // Skin card clicks
  content.querySelectorAll('.guild-skin-card:not(.guild-skin-card--locked)').forEach(card => {
    const handler = () => {
      content.querySelectorAll('.guild-skin-card').forEach(c => {
        c.classList.remove('guild-skin-card--active');
        c.querySelector('.guild-skin-active-badge') && c.querySelector('.guild-skin-active-badge').remove();
      });
      card.classList.add('guild-skin-card--active');
      const badge = document.createElement('div');
      badge.className = 'guild-skin-active-badge';
      badge.textContent = '✓';
      card.appendChild(badge);
      selectedSkin = card.dataset.skin;
    };
    card.addEventListener('click', handler);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
  });

  // Save
  document.getElementById('gcosm-save-btn').addEventListener('click', async () => {
    const saveBtn = document.getElementById('gcosm-save-btn');
    const statusEl = document.getElementById('gcosm-status');
    saveBtn.disabled = true;
    statusEl.textContent = 'Saving...';
    const res = await apiUpdateGuild(_loadMyGuildId(), {
      bannerColor: selectedColor,
      activeBoardSkin: selectedSkin === 'none' ? null : selectedSkin,
    });
    if (res.ok) {
      _myGuild = { guild: res.data.guild, members: res.data.members };
      applyGuildBoardSkin(res.data.guild.activeBoardSkin || null);
      statusEl.textContent = '✓ Cosmetics saved!';
      setTimeout(() => _renderHomeView(content), 800);
    } else {
      statusEl.textContent = res.data.error || 'Failed to save';
      saveBtn.disabled = false;
    }
  });

  document.getElementById('gcosm-back-btn').addEventListener('click', () => _renderHomeView(content));
}

// ── Manage view (owner/officer) ───────────────────────────────────────────────
function _renderManageView(content) {
  _guildView = 'manage';
  const { guild } = _myGuild;
  const userId = guildUserId();
  const me = (_myGuild.members || []).find(m => m.userId === userId) || {};
  const isOwner = me.role === 'owner';

  content.innerHTML = `
    <div class="guild-manage">
      <div class="guild-section-title">MANAGE GUILD</div>
      <div class="guild-form-row">
        <label>Guild Name <span class="guild-hint">(2–32 chars)</span></label>
        <input id="gm-name" type="text" maxlength="32" value="${_esc(guild.name)}">
      </div>
      <div class="guild-form-row">
        <label>Description <span class="guild-hint">(≤256 chars)</span></label>
        <textarea id="gm-desc" maxlength="256" rows="3">${_esc(guild.description || '')}</textarea>
      </div>
      <div class="guild-form-row guild-form-inline">
        <div class="guild-form-col">
          <label>Emblem</label>
          <input id="gm-emblem" type="text" maxlength="4" value="${_esc(guild.emblem || '⚔️')}" style="font-size:18px;width:54px;text-align:center">
        </div>
        <div class="guild-form-col guild-form-col--wide">
          <label>Banner Color <span class="guild-hint">(use 🎨 Cosmetics for full palette)</span></label>
          <input id="gm-banner" type="color" value="${_esc(guild.bannerColor || '#1e40af')}" style="width:54px;height:32px;cursor:pointer">
        </div>
        <div class="guild-form-col">
          <label>Private</label>
          <input id="gm-private" type="checkbox" ${guild.isPrivate ? 'checked' : ''}>
        </div>
      </div>
      <div id="gm-status" class="guild-status-msg"></div>
      <div class="guild-actions">
        <button id="gm-save-btn" class="guild-primary-btn">Save Changes</button>
        <button id="gm-back-btn" class="guild-secondary-btn">← Back</button>
      </div>
      ${isOwner ? `
      <div class="guild-manage-danger-zone">
        <div class="guild-section-title" style="color:#f55">DANGER ZONE</div>
        <button id="gm-disband-btn" class="guild-disband-btn">💀 Disband Guild</button>
      </div>` : ''}
    </div>`;

  document.getElementById('gm-back-btn').addEventListener('click', () => {
    _renderHomeView(content);
  });

  document.getElementById('gm-save-btn').addEventListener('click', async () => {
    const name = document.getElementById('gm-name').value.trim();
    const desc = document.getElementById('gm-desc').value.trim();
    const emblem = document.getElementById('gm-emblem').value.trim() || '⚔️';
    const bannerColor = document.getElementById('gm-banner').value;
    const isPrivate = document.getElementById('gm-private').checked;
    const statusEl = document.getElementById('gm-status');

    if (name.length < 2) { statusEl.textContent = 'Name must be at least 2 characters.'; return; }

    const saveBtn = document.getElementById('gm-save-btn');
    saveBtn.disabled = true;
    statusEl.textContent = 'Saving...';

    const res = await apiUpdateGuild(_loadMyGuildId(), { name, description: desc, emblem, bannerColor, isPrivate });
    if (res.ok) {
      _myGuild = { guild: res.data.guild, members: res.data.members };
      applyGuildBoardSkin(res.data.guild.activeBoardSkin || null);
      statusEl.textContent = '✓ Saved';
      setTimeout(() => _renderHomeView(content), 800);
    } else {
      statusEl.textContent = res.data.error || 'Failed to save changes.';
      saveBtn.disabled = false;
    }
  });

  if (isOwner) {
    document.getElementById('gm-disband-btn').addEventListener('click', async () => {
      if (!confirm(`Disband "${guild.name}"? This cannot be undone.`)) return;
      if (!confirm('Are you sure? All members will be removed.')) return;
      const res = await _apiFetch(`/api/guilds/${_loadMyGuildId()}`, {
        method: 'DELETE',
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        _saveMyGuildId(null);
        _myGuild = null;
        _guildView = 'browse';
        _renderGuildPanel();
      } else {
        document.getElementById('gm-status').textContent = res.data.error || 'Disband failed.';
      }
    });
  }
}

// ── Browse view ───────────────────────────────────────────────────────────────
async function _renderBrowseView(content, query) {
  _guildView = 'browse';
  content.innerHTML = `
    <div class="guild-browse">
      <div class="guild-search-row">
        <input id="guild-search-input" type="text" placeholder="Search guilds..." value="${_esc(query)}" maxlength="32">
        <button id="guild-search-btn">🔍</button>
      </div>
      <div id="guild-search-results" class="guild-search-results">
        <div class="guild-loading">Searching...</div>
      </div>
      <div class="guild-actions">
        <button id="guild-create-switch-btn" class="guild-secondary-btn">＋ Create Guild</button>
      </div>
    </div>`;

  document.getElementById('guild-search-btn').addEventListener('click', () => {
    const q = document.getElementById('guild-search-input').value.trim();
    _doSearch(q);
  });
  document.getElementById('guild-search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('guild-search-btn').click();
  });
  document.getElementById('guild-create-switch-btn').addEventListener('click', () => {
    _guildView = 'create';
    _renderCreateView(content);
  });

  _doSearch(query);

  async function _doSearch(q) {
    const resultsEl = document.getElementById('guild-search-results');
    if (!resultsEl) return;
    resultsEl.innerHTML = '<div class="guild-loading">Searching...</div>';
    const res = await apiSearchGuilds(q);
    if (!res.ok) {
      resultsEl.innerHTML = `<div class="guild-error">Error: ${_esc(res.data.error || 'Failed to load')}</div>`;
      return;
    }
    const guilds = res.data;
    if (!guilds.length) {
      resultsEl.innerHTML = '<div class="guild-empty">No guilds found.</div>';
      return;
    }
    resultsEl.innerHTML = guilds.map(g => `
      <div class="guild-result-card">
        <span class="guild-result-emblem">${_esc(g.emblem || '⚔️')}</span>
        <div class="guild-result-info">
          <div class="guild-result-name">${_esc(g.name)} <span class="guild-tag">[${_esc(g.tag)}]</span></div>
          <div class="guild-result-meta">Lv.${g.level} · ${g.memberCount}/30${g.isPrivate ? ' · 🔒' : ''}</div>
        </div>
        ${!g.isPrivate
          ? `<button class="guild-join-req-btn" data-gid="${_esc(g.id)}">Request</button>`
          : `<span class="guild-private-badge">Invite only</span>`}
      </div>`).join('');

    resultsEl.querySelectorAll('.guild-join-req-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '...';
        const res = await apiRequestToJoin(btn.dataset.gid);
        if (res.ok) {
          btn.textContent = '✓ Requested';
        } else {
          btn.textContent = 'Request';
          btn.disabled = false;
          _showGuildError(res.data.error || 'Failed to request');
        }
      });
    });
  }
}

// ── Create view ───────────────────────────────────────────────────────────────
function _renderCreateView(content) {
  _guildView = 'create';
  content.innerHTML = `
    <div class="guild-create">
      <div class="guild-create-title">CREATE GUILD</div>
      <div class="guild-form-row">
        <label>Name <span class="guild-hint">(2–32 chars)</span></label>
        <input id="gc-name" type="text" maxlength="32" placeholder="Void Miners">
      </div>
      <div class="guild-form-row">
        <label>Tag <span class="guild-hint">(3–5 alphanumeric)</span></label>
        <input id="gc-tag" type="text" maxlength="5" placeholder="VOID" style="text-transform:uppercase">
      </div>
      <div class="guild-form-row">
        <label>Description <span class="guild-hint">(optional, ≤256)</span></label>
        <textarea id="gc-desc" maxlength="256" rows="2" placeholder="We mine the void..."></textarea>
      </div>
      <div class="guild-form-row guild-form-inline">
        <div class="guild-form-col">
          <label>Emblem</label>
          <input id="gc-emblem" type="text" maxlength="4" value="⚔️" style="font-size:18px;width:54px;text-align:center">
        </div>
        <div class="guild-form-col">
          <label>Banner</label>
          <input id="gc-banner" type="color" value="#1e40af" style="width:54px;height:32px;cursor:pointer">
        </div>
        <div class="guild-form-col">
          <label>Private</label>
          <input id="gc-private" type="checkbox">
        </div>
      </div>
      <div id="gc-error" class="guild-status-msg"></div>
      <div class="guild-actions">
        <button id="gc-submit-btn" class="guild-primary-btn">Create Guild</button>
        <button id="gc-back-btn" class="guild-secondary-btn">← Browse</button>
      </div>
    </div>`;

  document.getElementById('gc-tag').addEventListener('input', function() {
    this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  });

  document.getElementById('gc-back-btn').addEventListener('click', () => {
    _guildView = 'browse';
    _renderBrowseView(content, '');
  });

  document.getElementById('gc-submit-btn').addEventListener('click', async () => {
    const name = document.getElementById('gc-name').value.trim();
    const tag = document.getElementById('gc-tag').value.trim().toUpperCase();
    const desc = document.getElementById('gc-desc').value.trim();
    const emblem = document.getElementById('gc-emblem').value.trim() || '⚔️';
    const banner = document.getElementById('gc-banner').value;
    const isPrivate = document.getElementById('gc-private').checked;
    const errEl = document.getElementById('gc-error');

    if (name.length < 2) { errEl.textContent = 'Name must be at least 2 characters.'; return; }
    if (!/^[A-Z0-9]{3,5}$/.test(tag)) { errEl.textContent = 'Tag must be 3–5 uppercase alphanumeric.'; return; }

    const btn = document.getElementById('gc-submit-btn');
    btn.disabled = true;
    errEl.textContent = 'Creating...';

    const res = await apiCreateGuild(name, tag, desc, emblem, banner, isPrivate);
    if (res.ok) {
      const guildId = res.data.guild.id;
      _saveMyGuildId(guildId);
      _myGuild = { guild: res.data.guild, members: res.data.members };
      _guildView = 'home';
      _renderHomeView(content);
    } else {
      errEl.textContent = res.data.error || 'Failed to create guild.';
      btn.disabled = false;
    }
  });
}

// ── Join requests view (officer/owner) ────────────────────────────────────────
async function _renderRequestsView(content) {
  _guildView = 'requests';
  content.innerHTML = `
    <div class="guild-requests">
      <div class="guild-section-title">JOIN REQUESTS</div>
      <div id="guild-req-list" class="guild-req-list"><div class="guild-loading">Loading...</div></div>
      <div class="guild-actions">
        <button id="guild-req-back-btn" class="guild-secondary-btn">← Back</button>
      </div>
    </div>`;

  document.getElementById('guild-req-back-btn').addEventListener('click', () => {
    _renderHomeView(content);
  });

  const guildId = _loadMyGuildId();
  const res = await apiGetJoinRequests(guildId);
  const listEl = document.getElementById('guild-req-list');
  if (!listEl) return;

  if (!res.ok) {
    listEl.innerHTML = `<div class="guild-error">${_esc(res.data.error || 'Failed to load')}</div>`;
    return;
  }

  const requests = res.data;
  if (!requests.length) {
    listEl.innerHTML = '<div class="guild-empty">No pending requests.</div>';
    return;
  }

  listEl.innerHTML = requests.map(r => `
    <div class="guild-req-row" data-uid="${_esc(r.userId)}">
      <div class="guild-member-avatar" style="background:rgba(255,255,255,0.08)">${_avatarChar(r.userId)}</div>
      <span class="guild-req-name">${_esc(r.userId)}</span>
      <span class="guild-req-date">${_fmtDate(r.requestedAt)}</span>
      <button class="guild-approve-btn" data-uid="${_esc(r.userId)}">✓ Approve</button>
      <button class="guild-deny-btn" data-uid="${_esc(r.userId)}">✗ Deny</button>
    </div>`).join('');

  listEl.querySelectorAll('.guild-approve-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const res = await apiActOnJoinRequest(guildId, btn.dataset.uid, 'approve');
      if (res.ok) {
        _myGuild = { guild: res.data.guild, members: res.data.members };
        btn.closest('.guild-req-row').remove();
        if (!listEl.querySelector('.guild-req-row')) {
          listEl.innerHTML = '<div class="guild-empty">No pending requests.</div>';
        }
      } else {
        _showGuildError(res.data.error || 'Approve failed');
        btn.disabled = false;
      }
    });
  });

  listEl.querySelectorAll('.guild-deny-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const res = await apiActOnJoinRequest(guildId, btn.dataset.uid, 'deny');
      if (res.ok) {
        btn.closest('.guild-req-row').remove();
        if (!listEl.querySelector('.guild-req-row')) {
          listEl.innerHTML = '<div class="guild-empty">No pending requests.</div>';
        }
      } else {
        _showGuildError(res.data.error || 'Deny failed');
        btn.disabled = false;
      }
    });
  });
}

// ── Weekly summary notification ───────────────────────────────────────────────
async function _checkWeeklySummaryNotification(userId) {
  const guildId = _loadMyGuildId();
  if (!guildId || !userId) return;

  const res = await apiGetWeeklyNotification(guildId, userId);
  if (!res.ok || !res.data.notification) return;

  const n = res.data.notification;
  const toast = document.getElementById('guild-weekly-toast');
  if (!toast) return;

  document.getElementById('gwt-rank').textContent = `#${n.rank} of ${n.totalMembers}`;
  document.getElementById('gwt-guild').textContent = n.guildName;
  document.getElementById('gwt-xp').textContent = `${_fmtXP(n.weeklyXP)} XP`;
  document.getElementById('gwt-week').textContent = n.week;
  toast.style.display = 'flex';

  document.getElementById('gwt-close-btn').onclick = () => { toast.style.display = 'none'; };
  setTimeout(() => { toast.style.display = 'none'; }, 12000);
}

// ── Invite notification (on startup) ─────────────────────────────────────────
let _pendingInvites = [];
let _inviteToastIdx = 0;

async function checkGuildInvites() {
  const userId = guildUserId();
  if (!userId) return;
  if (_loadMyGuildId()) return;

  const res = await apiGetMyInvites();
  if (!res.ok || !res.data.length) return;

  _pendingInvites = res.data;
  _inviteToastIdx = 0;
  _showNextInviteToast();
}

function _showNextInviteToast() {
  if (_inviteToastIdx >= _pendingInvites.length) return;
  const invite = _pendingInvites[_inviteToastIdx];
  const toast = document.getElementById('guild-invite-toast');
  if (!toast) return;

  document.getElementById('git-guild-name').textContent =
    `${invite.guildName} [${invite.guildTag}]`;
  document.getElementById('git-guild-meta').textContent =
    `Lv.${invite.guildLevel} · ${invite.guildMemberCount}/30 members`;
  document.getElementById('git-inviter').textContent = `Invited by: ${invite.inviterId}`;

  toast.style.display = 'flex';

  document.getElementById('git-accept-btn').onclick = async () => {
    toast.style.display = 'none';
    const res = await apiAcceptInvite(invite.id);
    if (res.ok) {
      _saveMyGuildId(invite.guildId);
      _myGuild = { guild: res.data.guild, members: res.data.members };
      _showGuildJoinedToast(invite.guildName);
    } else {
      _showGuildError(res.data.error || 'Could not accept invite');
      _inviteToastIdx++;
      _showNextInviteToast();
    }
  };

  document.getElementById('git-decline-btn').onclick = async () => {
    toast.style.display = 'none';
    await apiDeclineInvite(invite.id);
    _inviteToastIdx++;
    _showNextInviteToast();
  };
}

function _showGuildJoinedToast(guildName) {
  const toast = document.getElementById('guild-joined-toast');
  if (!toast) return;
  toast.textContent = `⚔️ Joined ${guildName}!`;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

// ── Init ──────────────────────────────────────────────────────────────────────
function initGuild() {
  _myGuildId = _loadMyGuildId();
  setTimeout(checkGuildInvites, 2000);
  setTimeout(initGuildBoardSkin, 1000);

  const btn = document.getElementById('start-guild-btn');
  if (btn) btn.addEventListener('click', openGuildPanel);

  const closeBtn = document.getElementById('guild-panel-close');
  if (closeBtn) closeBtn.addEventListener('click', closeGuildPanel);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && guildPanelOpen) closeGuildPanel();
  });
}
