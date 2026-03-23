// Guild home view — _renderHomeView and _showMemberCard.
// Requires: social/guild.js loaded first.

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
  const shareBtn = `<button id="guild-share-btn" class="guild-secondary-btn">🔗 Share Profile</button>`;

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
          ${getGuildXPBoost(guild.level) > 0 ? `<div class="guild-active-boost">⚡ +${Math.round(getGuildXPBoost(guild.level) * 100)}% XP Boost Active</div>` : ''}
          ${nextMilestoneHtml}
        </div>
      </div>
      ${descHtml}
      <div class="guild-home-tabs">
        <button class="guild-tab-btn guild-tab-btn--active" id="guild-tab-roster">👥 Roster</button>
        <button class="guild-tab-btn" id="guild-tab-leaderboard">🏆 Leaderboard</button>
        <button class="guild-tab-btn" id="guild-tab-perks">⭐ Perks</button>
        <button class="guild-tab-btn" id="guild-tab-challenges">🎯 Challenges</button>
        <button class="guild-tab-btn" id="guild-tab-wars">⚔️ Wars</button>
        <button class="guild-tab-btn guild-tab-btn--chat" id="guild-tab-chat">💬 Chat</button>
        <button class="guild-tab-btn" id="guild-tab-feed">📣 Feed</button>
        <button class="guild-tab-btn" id="guild-tab-expedition">🌍 Expedition</button>
        <button class="guild-tab-btn" id="guild-tab-goals">🌐 Goals</button>
      </div>
      <div id="guild-tab-panel-roster">
        <div class="guild-section-title">MEMBERS (${guild.memberCount}/30)</div>
        <div id="guild-members-list" class="guild-members-list">${memberRows}</div>
      </div>
      <div id="guild-tab-panel-leaderboard" style="display:none">
        <div class="guild-section-title">WEEKLY LEADERBOARD</div>
        <div id="guild-leaderboard-content" class="guild-leaderboard-loading">Loading…</div>
      </div>
      <div id="guild-tab-panel-perks" style="display:none">
        <div id="guild-perks-content"></div>
      </div>
      <div id="guild-tab-panel-challenges" style="display:none">
        <div id="guild-challenges-content"></div>
      </div>
      <div id="guild-tab-panel-wars" style="display:none">
        <div id="guild-wars-content"><div class="guild-loading">Loading…</div></div>
      </div>
      <div id="guild-tab-panel-chat" style="display:none">
        <div id="guild-chat-panel-content"><div class="guild-loading">Connecting to chat…</div></div>
      </div>
      <div id="guild-tab-panel-feed" style="display:none">
        <div id="guild-feed-panel-content"><div class="guild-loading">Loading…</div></div>
      </div>
      <div id="guild-tab-panel-expedition" style="display:none">
        <div id="guild-expedition-panel-content"><div class="guild-loading">Loading…</div></div>
      </div>
      <div id="guild-tab-panel-goals" style="display:none">
        <div id="guild-goals-panel-content"><div class="guild-loading">Loading…</div></div>
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
        ${shareBtn}
        <button id="guild-leave-btn" class="guild-danger-btn">🚪 Leave</button>
      </div>
    </div>
    <div id="guild-member-card-overlay" class="guild-member-card-overlay" style="display:none"></div>`;

  // ── Tab switching
  const rosterTab      = document.getElementById('guild-tab-roster');
  const lbTab          = document.getElementById('guild-tab-leaderboard');
  const perksTab       = document.getElementById('guild-tab-perks');
  const challengesTab  = document.getElementById('guild-tab-challenges');
  const warsTab        = document.getElementById('guild-tab-wars');
  const chatTab        = document.getElementById('guild-tab-chat');
  const feedTab        = document.getElementById('guild-tab-feed');
  const expeditionTab  = document.getElementById('guild-tab-expedition');
  const goalsTab       = document.getElementById('guild-tab-goals');
  const rosterPanel    = document.getElementById('guild-tab-panel-roster');
  const lbPanel        = document.getElementById('guild-tab-panel-leaderboard');
  const perksPanel     = document.getElementById('guild-tab-panel-perks');
  const challengesPanel = document.getElementById('guild-tab-panel-challenges');
  const warsPanel      = document.getElementById('guild-tab-panel-wars');
  const chatPanel      = document.getElementById('guild-tab-panel-chat');
  const feedPanel      = document.getElementById('guild-tab-panel-feed');
  const expeditionPanel = document.getElementById('guild-tab-panel-expedition');
  const goalsPanel     = document.getElementById('guild-tab-panel-goals');

  function _switchToTab(tab) {
    [rosterTab, lbTab, perksTab, challengesTab, warsTab, chatTab, feedTab, expeditionTab, goalsTab]
      .forEach(t => t && t.classList.remove('guild-tab-btn--active'));
    [rosterPanel, lbPanel, perksPanel, challengesPanel, warsPanel, chatPanel, feedPanel, expeditionPanel, goalsPanel]
      .forEach(p => { if (p) p.style.display = 'none'; });
    if (tab === 'leaderboard') {
      lbTab.classList.add('guild-tab-btn--active');
      lbPanel.style.display = '';
      _loadGuildLeaderboard();
    } else if (tab === 'perks') {
      perksTab.classList.add('guild-tab-btn--active');
      perksPanel.style.display = '';
      _renderPerksTab(document.getElementById('guild-perks-content'), guild.level || 1, guild.memberCount || 1);
    } else if (tab === 'challenges') {
      challengesTab.classList.add('guild-tab-btn--active');
      challengesPanel.style.display = '';
      _renderChallengesTab(document.getElementById('guild-challenges-content'));
    } else if (tab === 'wars') {
      warsTab.classList.add('guild-tab-btn--active');
      warsPanel.style.display = '';
      _loadWarsTab();
    } else if (tab === 'chat') {
      chatTab.classList.add('guild-tab-btn--active');
      chatPanel.style.display = '';
      const chatContent = document.getElementById('guild-chat-panel-content');
      if (chatContent && typeof renderGuildChatPanel === 'function') {
        renderGuildChatPanel(chatContent, isOfficer ? (isOwner ? 'owner' : 'officer') : 'member');
      }
    } else if (tab === 'feed') {
      feedTab.classList.add('guild-tab-btn--active');
      feedPanel.style.display = '';
      const feedContent = document.getElementById('guild-feed-panel-content');
      if (feedContent && typeof renderGuildFeedPanel === 'function') {
        renderGuildFeedPanel(feedContent, _loadMyGuildId());
      }
    } else if (tab === 'expedition') {
      expeditionTab.classList.add('guild-tab-btn--active');
      expeditionPanel.style.display = '';
      const expContent = document.getElementById('guild-expedition-panel-content');
      if (expContent) _renderExpeditionTab(expContent, isOfficer, _loadMyGuildId());
    } else if (tab === 'goals') {
      goalsTab && goalsTab.classList.add('guild-tab-btn--active');
      if (goalsPanel) {
        goalsPanel.style.display = '';
        const goalsContent = document.getElementById('guild-goals-panel-content');
        if (goalsContent && typeof renderCommunityGoalsTab === 'function') {
          renderCommunityGoalsTab(goalsContent);
        }
      }
    } else {
      rosterTab.classList.add('guild-tab-btn--active');
      rosterPanel.style.display = '';
    }
  }

  rosterTab.addEventListener('click',     () => _switchToTab('roster'));
  lbTab.addEventListener('click',         () => _switchToTab('leaderboard'));
  if (perksTab)      perksTab.addEventListener('click',      () => _switchToTab('perks'));
  if (challengesTab) challengesTab.addEventListener('click', () => _switchToTab('challenges'));
  warsTab.addEventListener('click',       () => _switchToTab('wars'));
  if (chatTab)       chatTab.addEventListener('click',       () => _switchToTab('chat'));
  if (feedTab)       feedTab.addEventListener('click',       () => _switchToTab('feed'));
  if (expeditionTab) expeditionTab.addEventListener('click', () => _switchToTab('expedition'));
  if (goalsTab)      goalsTab.addEventListener('click',      () => _switchToTab('goals'));

  // Start guild chat WebSocket connection when the home panel loads
  const guildId = _loadMyGuildId();
  if (guildId && typeof guildChatConnect === 'function') {
    guildChatConnect(guildId, guildUserId(), isOfficer ? (isOwner ? 'owner' : 'officer') : 'member');
  }

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
  async function _loadWarsTab(page = 1) {
    const warsContent = document.getElementById('guild-wars-content');
    if (!warsContent) return;
    warsContent.innerHTML = '<div class="guild-loading">Loading…</div>';

    const guildId = _loadMyGuildId();
    const myMember = (_myGuild.members || []).find(m => m.userId === guildUserId()) || {};
    const canAct   = myMember.role === 'officer' || myMember.role === 'owner';

    // Fetch active wars (legacy endpoint) + paginated history + rating in parallel
    const [activeRes, histRes, ratingRes] = await Promise.all([
      apiGetGuildClanWars(guildId),
      apiGetGuildWarHistory(guildId, page),
      apiGetGuildRating(guildId),
    ]);
    if (!warsContent) return;

    if (!activeRes.ok && !histRes.ok) {
      warsContent.innerHTML = `<div class="guild-error">⚠ Could not load wars.</div>`;
      return;
    }

    const allActive = (activeRes.data || []);
    const active = allActive.find(w =>
      ['pending_acceptance', 'roster_open', 'roster_locked', 'in_progress', 'scheduled'].includes(w.status)
    );

    const histData   = histRes.ok ? histRes.data : { wars: [], total: 0, page: 1, pageSize: 20 };
    const pastWars   = (histData.wars || []).filter(w => w.status === 'completed' || w.status === 'cancelled');
    const totalWars  = histData.total || 0;
    const pageSize   = histData.pageSize || 20;
    const totalPages = Math.max(1, Math.ceil(totalWars / pageSize));

    const rating     = ratingRes.ok ? (ratingRes.data.rating || 1000) : 1000;
    const warsPlayed = ratingRes.ok ? (ratingRes.data.warsPlayed || 0) : 0;
    const wins       = ratingRes.ok ? (ratingRes.data.wins || 0) : 0;
    const losses     = ratingRes.ok ? (ratingRes.data.losses || 0) : 0;
    const draws      = ratingRes.ok ? (ratingRes.data.draws || 0) : 0;

    let html = '';

    // Rating header
    html += `<div class="war-rating-header">
      <div class="war-rating-val">⚔️ ${rating} <span class="war-rating-label">Guild Rating</span></div>
      <div class="war-rating-stats">${wins}W / ${losses}L / ${draws}D · ${warsPlayed} wars</div>
      <button id="war-standings-btn" class="guild-secondary-btn war-standings-btn">🏆 Season Standings</button>
    </div>`;

    // Active war section
    if (active) {
      html += `<div class="guild-section-title">ACTIVE WAR</div>`;
      html += _renderWarSummaryCard(active, guildId, true);
    } else if (canAct) {
      html += `<div class="war-challenge-cta">
        <div class="war-challenge-cta-text">No active war. Challenge a rival guild!</div>
        <button id="war-send-challenge-btn" class="guild-primary-btn">⚔️ Send Challenge</button>
      </div>`;
    } else {
      html += `<div class="guild-empty">No active clan war. Officers can send a challenge.</div>`;
    }

    // War history
    if (pastWars.length > 0) {
      html += `<div class="guild-section-title" style="margin-top:12px">WAR HISTORY</div>`;
      html += pastWars.map(w => _renderWarHistoryCard(w, guildId)).join('');
    } else if (page === 1 && !active) {
      html += `<div class="guild-empty" style="margin-top:10px">No completed wars yet.</div>`;
    }

    // Pagination
    if (totalPages > 1) {
      html += `<div class="war-pagination">`;
      if (page > 1) html += `<button class="guild-secondary-btn" id="war-prev-page" data-page="${page - 1}">← Prev</button>`;
      html += `<span class="war-page-label">Page ${page}/${totalPages}</span>`;
      if (page < totalPages) html += `<button class="guild-secondary-btn" id="war-next-page" data-page="${page + 1}">Next →</button>`;
      html += `</div>`;
    }

    warsContent.innerHTML = html;

    // Wire: challenge btn
    const challengeBtn = document.getElementById('war-send-challenge-btn');
    if (challengeBtn) {
      challengeBtn.addEventListener('click', () => _renderChallengeSendView(warsContent, guildId));
    }

    // Wire: active war details btn
    if (active) {
      const detailBtn = document.getElementById(`war-detail-btn-${active.id}`);
      if (detailBtn) {
        detailBtn.addEventListener('click', () => _renderWarDetailView(warsContent, active.id, guildId));
      }
    }

    // Wire: slot expansion on past wars
    warsContent.querySelectorAll('.war-history-card[data-war-id]').forEach(card => {
      card.addEventListener('click', () => {
        const slots = card.querySelector('.war-slots-detail');
        if (slots) slots.style.display = slots.style.display === 'none' ? '' : 'none';
      });
    });

    // Wire: pagination
    const prevBtn = document.getElementById('war-prev-page');
    const nextBtn = document.getElementById('war-next-page');
    if (prevBtn) prevBtn.addEventListener('click', () => _loadWarsTab(parseInt(prevBtn.dataset.page, 10)));
    if (nextBtn) nextBtn.addEventListener('click', () => _loadWarsTab(parseInt(nextBtn.dataset.page, 10)));

    // Wire: standings btn
    const standingsBtn = document.getElementById('war-standings-btn');
    if (standingsBtn) standingsBtn.addEventListener('click', () => ClanWarStandings.open());
  }

  /** Render a completed/cancelled war card with expandable slot grid. */
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
      const weWon  = war.winner === myGuildId;
      const isDraw = war.winner === 'draw';
      html += `<div class="war-result-banner ${isDraw ? 'war-result-banner--draw' : weWon ? 'war-result-banner--win' : 'war-result-banner--loss'}">
        ${isDraw ? '🤝 DRAW' : weWon ? '🏆 VICTORY' : '💀 DEFEAT'}
      </div>`;
      // Guild rating block (populated async after render)
      html += `<div id="war-rating-display" class="war-rating-display"><span class="guild-loading" style="font-size:9px">Loading ratings…</span></div>`;
      html += `<div style="text-align:center;margin-top:4px"><button class="guild-secondary-btn" id="war-view-result-btn">📊 Full Result Screen</button></div>`;
    }

    html += `</div>`;
    container.innerHTML = html;

    document.getElementById('war-back-btn').addEventListener('click', () => {
      ClanWarEngine.stopPolling();
      _loadWarsTab();
    });

    // Load ratings + wire full result screen for completed wars
    if (war.status === 'completed' && typeof ClanWarResults !== 'undefined') {
      const ratingDisplay = container.querySelector('#war-rating-display');
      if (ratingDisplay) {
        ClanWarResults.apiGetGuildRating(myGuildId).then(res => {
          if (!res.ok || !res.data.rating) { ratingDisplay.innerHTML = ''; return; }
          const history = (res.data.history || []).slice(0, 5);
          const histHtml = history.length
            ? history.map(h => {
                const sign = h.change >= 0 ? '+' : '';
                const cls  = h.change >= 0 ? 'war-rating-hist-up' : 'war-rating-hist-down';
                return `<span class="${cls}">${sign}${h.change}</span>`;
              }).join('  ')
            : '';
          ratingDisplay.innerHTML = `
            <div class="war-rating-row-inline">
              <span class="war-rating-label-sm">Guild Rating:</span>
              <strong class="war-rating-value">${res.data.rating}</strong>
              ${histHtml ? `<span class="war-rating-hist">${histHtml}</span>` : ''}
            </div>`;
        }).catch(() => { if (ratingDisplay) ratingDisplay.innerHTML = ''; });
      }

      const viewResultBtn = container.querySelector('#war-view-result-btn');
      if (viewResultBtn) {
        viewResultBtn.addEventListener('click', async () => {
          viewResultBtn.disabled = true;
          viewResultBtn.textContent = 'Loading…';
          // Fetch slots for the completed war so we can show the full result screen
          let slots = [];
          if (typeof ClanWarEngine !== 'undefined') {
            const slotsRes = await ClanWarEngine.getSlots(warId);
            if (slotsRes.ok) slots = slotsRes.data.slots || [];
          }
          await ClanWarResults.showResultScreen(war, slots, myGuildId);
          viewResultBtn.disabled = false;
          viewResultBtn.textContent = '📊 Full Result Screen';
        });
      }
    }

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

  // ── Share profile
  const shareEl = document.getElementById('guild-share-btn');
  if (shareEl) {
    shareEl.addEventListener('click', () => {
      const url = 'https://minectris-leaderboard.workers.dev/guilds/' + guild.tag;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => {
          shareEl.textContent = '✓ Link Copied!';
          setTimeout(() => { shareEl.textContent = '🔗 Share Profile'; }, 2000);
        }).catch(() => { prompt('Share this guild profile:', url); });
      } else {
        prompt('Share this guild profile:', url);
      }
    });
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

