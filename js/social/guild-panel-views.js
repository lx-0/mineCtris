// Guild panel views — cosmetics, manage, browse, create, join requests, perks, challenges.
// Requires: social/guild.js and social/guild-home.js loaded first.

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

// ── Perks tab ─────────────────────────────────────────────────────────────────

function _renderPerksTab(container, guildLevel, memberCount) {
  if (!container) return;
  const boost = getGuildXPBoost(guildLevel);
  const isSmall = memberCount < GUILD_SMALL_SIZE_THRESHOLD;

  let html = `<div class="guild-section-title">GUILD PERKS — Lv.${guildLevel}</div>`;

  if (boost > 0) {
    html += `<div class="guild-perk-active-banner">⚡ Active XP Boost: +${Math.round(boost * 100)}% for all members</div>`;
  }
  if (isSmall) {
    html += `<div class="guild-perk-active-banner">🔥 Small Guild Bonus: ${GUILD_SMALL_SIZE_MULTIPLIER}× XP multiplier active (${memberCount}/${GUILD_SMALL_SIZE_THRESHOLD - 1} members)</div>`;
  }

  html += '<div class="guild-perks-list">';
  GUILD_PERKS.forEach(perk => {
    const unlocked = guildLevel >= perk.level;
    html += `<div class="guild-perk-row guild-perk-row--${unlocked ? 'unlocked' : 'locked'}">
      <span class="guild-perk-icon">${unlocked ? perk.icon : '🔒'}</span>
      <div class="guild-perk-info">
        <div class="guild-perk-label">${_esc(perk.label)}</div>
        <div class="guild-perk-level">Lv.${perk.level} ${unlocked ? '✓ Unlocked' : '— Locked'}</div>
      </div>
    </div>`;
  });
  html += '</div>';

  const dailyState = _getGuildDailyXPState();
  const dailyUsed = dailyState.xp || 0;
  const dailyPct = Math.min(100, Math.round((dailyUsed / GUILD_MEMBER_DAILY_CAP) * 100));
  html += `<div class="guild-section-title" style="margin-top:12px">YOUR DAILY XP CAP</div>
    <div class="guild-daily-cap-info">
      <div class="guild-xp-bar">
        <div class="guild-xp-fill guild-xp-fill--daily" style="width:${dailyPct}%"></div>
      </div>
      <div class="guild-xp-label">${dailyUsed} / ${GUILD_MEMBER_DAILY_CAP} guild XP used today</div>
    </div>`;

  container.innerHTML = html;
}

// ── Challenges tab ────────────────────────────────────────────────────────────

function _renderChallengesTab(container) {
  if (!container) return;
  const state = _loadGuildChallengeState();
  const weekKey = state.weekKey;

  let html = `<div class="guild-section-title">WEEKLY GUILD CHALLENGES</div>
    <div class="guild-challenges-week">Week ${_esc(weekKey)}</div>`;

  const allDone = GUILD_WEEKLY_CHALLENGES.every(c => (state.progress[c.id] || 0) >= c.target);

  if (state.bonusAwarded) {
    html += `<div class="guild-challenges-complete-banner">🎉 All challenges complete! Bonus XP awarded!</div>`;
  } else if (allDone) {
    html += `<div class="guild-challenges-complete-banner">🎯 All objectives met! Bonus XP will be awarded shortly.</div>`;
  }

  html += '<div class="guild-challenges-list">';
  GUILD_WEEKLY_CHALLENGES.forEach(challenge => {
    const progress = state.progress[challenge.id] || 0;
    const pct = Math.min(100, Math.round((progress / challenge.target) * 100));
    const done = progress >= challenge.target;
    html += `<div class="guild-challenge-row guild-challenge-row--${done ? 'done' : 'active'}">
      <span class="guild-challenge-icon">${done ? '✅' : challenge.icon}</span>
      <div class="guild-challenge-info">
        <div class="guild-challenge-label">${_esc(challenge.label)}</div>
        <div class="guild-challenge-progress-row">
          <div class="guild-xp-bar guild-challenge-bar">
            <div class="guild-xp-fill" style="width:${pct}%"></div>
          </div>
          <span class="guild-challenge-count">${progress}/${challenge.target} ${_esc(challenge.unit)}</span>
        </div>
      </div>
    </div>`;
  });
  html += '</div>';

  html += `<div class="guild-challenges-bonus-info">
    Complete all 3 challenges to earn <strong>${GUILD_CHALLENGE_BONUS_XP} bonus guild XP</strong> for your guild!
  </div>`;

  container.innerHTML = html;
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
