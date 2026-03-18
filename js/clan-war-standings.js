// js/clan-war-standings.js — Global clan war season standings + Hall of Fame.
// Requires: guild.js (apiGetGuildStandings, apiGetGuildHallOfFame, _loadMyGuildId, guildUserId)

const ClanWarStandings = (() => {
  const PAGE_SIZE = 50;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _overlay() { return document.getElementById('war-standings-screen'); }
  function _content() { return document.getElementById('war-standings-content'); }

  // ── Tabs ──────────────────────────────────────────────────────────────────────

  let _currentTab  = 'standings';
  let _currentPage = 1;

  function _renderTabBar(activeTab) {
    return `<div class="wss-tab-bar">
      <button class="wss-tab-btn${activeTab === 'standings' ? ' wss-tab-btn--active' : ''}" id="wss-tab-standings">📊 Season Standings</button>
      <button class="wss-tab-btn${activeTab === 'hof' ? ' wss-tab-btn--active' : ''}" id="wss-tab-hof">🏅 Hall of Fame</button>
      <button class="wss-close-btn" id="wss-close-btn">✕</button>
    </div>`;
  }

  // ── Standings tab ─────────────────────────────────────────────────────────────

  async function _loadStandings(page = 1) {
    _currentPage = page;
    const content = _content();
    if (!content) return;

    content.innerHTML = _renderTabBar('standings') + '<div class="wss-loading">Loading standings…</div>';
    _wireTabBar();

    const res = await apiGetGuildStandings(page);
    const inner = _content();
    if (!inner) return;

    if (!res.ok) {
      inner.innerHTML = _renderTabBar('standings') + '<div class="wss-error">⚠ Could not load standings.</div>';
      _wireTabBar();
      return;
    }

    const { rows = [], total = 0, pageSize = PAGE_SIZE } = res.data;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const myGuildId  = typeof _loadMyGuildId === 'function' ? _loadMyGuildId() : null;

    let html = _renderTabBar('standings');
    html += `<div class="wss-season-label">Season Standings · ${total} guilds ranked</div>`;

    if (rows.length === 0) {
      html += '<div class="wss-empty">No guilds have played clan wars yet this season.</div>';
    } else {
      html += '<table class="wss-table"><thead><tr>';
      html += '<th>#</th><th>Guild</th><th>Rating</th><th>W</th><th>L</th><th>D</th><th>Win%</th>';
      html += '</tr></thead><tbody>';

      for (const row of rows) {
        const isMe = myGuildId && row.guildId === myGuildId;
        const crownMap = { 1: '🥇', 2: '🥈', 3: '🥉' };
        const rankDisplay = crownMap[row.rank] || `#${row.rank}`;

        html += `<tr class="wss-row${isMe ? ' wss-row--mine' : ''}">`;
        html += `<td class="wss-rank">${rankDisplay}</td>`;
        html += `<td class="wss-guild-cell">
          <span class="wss-emblem">${_esc(row.emblem || '⚔️')}</span>
          <span class="wss-guild-name">${_esc(row.name)}</span>
          <span class="wss-guild-tag">[${_esc(row.tag)}]</span>
          <span class="wss-guild-level">Lv.${row.level || 1}</span>
        </td>`;
        html += `<td class="wss-rating">${row.guildRating}</td>`;
        html += `<td class="wss-wins">${row.wins}</td>`;
        html += `<td class="wss-losses">${row.losses}</td>`;
        html += `<td class="wss-draws">${row.draws}</td>`;
        html += `<td class="wss-winrate">${row.winRate}%</td>`;
        html += '</tr>';
      }

      html += '</tbody></table>';
    }

    // Pagination
    if (totalPages > 1) {
      html += '<div class="wss-pagination">';
      if (page > 1) html += `<button class="guild-secondary-btn" id="wss-prev-page" data-page="${page - 1}">← Prev</button>`;
      html += `<span class="wss-page-label">Page ${page}/${totalPages}</span>`;
      if (page < totalPages) html += `<button class="guild-secondary-btn" id="wss-next-page" data-page="${page + 1}">Next →</button>`;
      html += '</div>';
    }

    inner.innerHTML = html;
    _wireTabBar();

    const prevBtn = document.getElementById('wss-prev-page');
    const nextBtn = document.getElementById('wss-next-page');
    if (prevBtn) prevBtn.addEventListener('click', () => _loadStandings(parseInt(prevBtn.dataset.page, 10)));
    if (nextBtn) nextBtn.addEventListener('click', () => _loadStandings(parseInt(nextBtn.dataset.page, 10)));
  }

  // ── Hall of Fame tab ─────────────────────────────────────────────────────────

  async function _loadHallOfFame() {
    const content = _content();
    if (!content) return;

    content.innerHTML = _renderTabBar('hof') + '<div class="wss-loading">Loading Hall of Fame…</div>';
    _wireTabBar();

    const res = await apiGetGuildHallOfFame();
    const inner = _content();
    if (!inner) return;

    if (!res.ok) {
      inner.innerHTML = _renderTabBar('hof') + '<div class="wss-error">⚠ Could not load Hall of Fame.</div>';
      _wireTabBar();
      return;
    }

    const seasons = res.data || [];
    let html = _renderTabBar('hof');
    html += '<div class="wss-season-label">Guild Hall of Fame — Past Season Champions</div>';

    if (seasons.length === 0) {
      html += '<div class="wss-empty">No seasons completed yet. Be the first champion!</div>';
    } else {
      for (const season of seasons) {
        const champion = season.champion;
        html += `<div class="wss-hof-entry">
          <div class="wss-hof-season">${_esc(season.seasonName || season.seasonId)}</div>
          <div class="wss-hof-date">${season.archivedAt ? new Date(season.archivedAt).toLocaleDateString() : ''}</div>`;
        if (champion) {
          html += `<div class="wss-hof-champion">
            <span class="wss-hof-crown">👑</span>
            <span class="wss-hof-emblem">${_esc(champion.emblem || '⚔️')}</span>
            <span class="wss-hof-name">${_esc(champion.name)}</span>
            <span class="wss-hof-tag">[${_esc(champion.tag)}]</span>
            <span class="wss-hof-rating">${champion.guildRating} pts</span>
          </div>`;
        }
        html += `<button class="guild-secondary-btn wss-hof-expand-btn" data-season-id="${_esc(season.seasonId)}">View Top 10 ▾</button>`;
        html += `<div class="wss-hof-top10" id="hof-top10-${_esc(season.seasonId)}" style="display:none"></div>`;
        html += '</div>';
      }
    }

    inner.innerHTML = html;
    _wireTabBar();

    // Wire expand buttons
    inner.querySelectorAll('.wss-hof-expand-btn').forEach(btn => {
      btn.addEventListener('click', () => _toggleHofTop10(btn.dataset.seasonId, btn));
    });
  }

  async function _toggleHofTop10(seasonId, btn) {
    const el = document.getElementById(`hof-top10-${seasonId}`);
    if (!el) return;
    if (el.style.display !== 'none') {
      el.style.display = 'none';
      btn.textContent = 'View Top 10 ▾';
      return;
    }
    el.innerHTML = '<div class="wss-loading">Loading…</div>';
    el.style.display = '';
    btn.textContent = 'Hide ▴';

    try {
      const res = await fetch(`${typeof GUILD_API !== 'undefined' ? GUILD_API : 'https://minectris-leaderboard.workers.dev'}/api/season/guild-hof/${encodeURIComponent(seasonId)}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || !data.top10) {
        el.innerHTML = '<div class="wss-error">Could not load top 10.</div>';
        return;
      }
      const rows = data.top10.map(g => `
        <div class="wss-hof-row">
          <span class="wss-rank">${{ 1: '🥇', 2: '🥈', 3: '🥉' }[g.rank] || `#${g.rank}`}</span>
          <span class="wss-emblem">${_esc(g.emblem || '⚔️')}</span>
          <span class="wss-guild-name">${_esc(g.name)}</span>
          <span class="wss-guild-tag">[${_esc(g.tag)}]</span>
          <span class="wss-rating">${g.guildRating}</span>
          <span class="wss-record">${g.wins}W/${g.losses}L/${g.draws}D</span>
        </div>`).join('');
      el.innerHTML = rows || '<div class="wss-empty">No ranked guilds.</div>';
    } catch (_) {
      el.innerHTML = '<div class="wss-error">Network error.</div>';
    }
  }

  // ── Tab wiring ────────────────────────────────────────────────────────────────

  function _wireTabBar() {
    const standingsTab = document.getElementById('wss-tab-standings');
    const hofTab       = document.getElementById('wss-tab-hof');
    const closeBtn     = document.getElementById('wss-close-btn');
    if (standingsTab) standingsTab.addEventListener('click', () => { _currentTab = 'standings'; _loadStandings(1); });
    if (hofTab)       hofTab.addEventListener('click',       () => { _currentTab = 'hof'; _loadHallOfFame(); });
    if (closeBtn)     closeBtn.addEventListener('click', close);
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  function open(tab = 'standings') {
    const overlay = _overlay();
    if (!overlay) return;
    overlay.style.display = 'flex';
    _currentTab = tab;
    if (tab === 'hof') _loadHallOfFame();
    else _loadStandings(1);

    // Close on backdrop click
    overlay.onclick = e => { if (e.target === overlay) close(); };
  }

  function close() {
    const overlay = _overlay();
    if (overlay) overlay.style.display = 'none';
  }

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const overlay = _overlay();
      if (overlay && overlay.style.display !== 'none') close();
    }
  });

  return { open, close };
})();
