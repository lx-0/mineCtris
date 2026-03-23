// js/guild-profile.js
// Public guild profile modal — shown when ?guild=TAG is in the URL.
// Also exposes window.openGuildProfileModal(tag) for in-game use.
// Requires: leaderboard.js (loadDisplayName), guild.js (_loadMyGuildId) loaded first.

(function () {
  'use strict';

  var GUILD_API    = 'https://minectris-leaderboard.workers.dev';
  var PROFILE_BASE = 'https://minectris-leaderboard.workers.dev/guilds/';

  // ── Canvas card generation (PNG download) ───────────────────────────────────

  function _drawGuildCard(guild, idx) {
    var W = 1200, H = 630;
    var canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    var bc = guild.bannerColor || '#1e40af';

    // Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    // Banner strips
    ctx.fillStyle = bc;
    ctx.fillRect(0, 0, W, 10);
    ctx.fillRect(0, H - 10, W, 10);

    // Left emblem panel
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 10, 320, H - 20);

    // Divider
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(320, 10);
    ctx.lineTo(320, H - 10);
    ctx.stroke();

    // Emblem (large emoji)
    ctx.font = '96px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(guild.emblem || '⚔️', 160, H / 2);

    // Guild name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(_trunc(guild.name || '', 22), 360, 100);

    // Tag + level
    ctx.fillStyle = bc;
    ctx.font = '28px monospace';
    ctx.fillText('[' + (guild.tag || '') + ']  LV.' + (guild.level || 1), 360, 148);

    // Divider line
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(360, 172); ctx.lineTo(1160, 172); ctx.stroke();

    var rating      = (idx && idx.guildRating) || (guild.guildRating) || 1000;
    var wins        = (idx && idx.wins)        || (guild.wins)        || 0;
    var losses      = (idx && idx.losses)      || (guild.losses)      || 0;
    var draws       = (idx && idx.draws)       || (guild.draws)       || 0;
    var memberCount = guild.memberCount        || 0;
    var slotsOpen   = Math.max(0, 30 - memberCount);

    // Rating
    ctx.fillStyle = '#888888';
    ctx.font = '18px monospace';
    ctx.fillText('RATING', 360, 228);
    ctx.fillStyle = bc;
    ctx.font = 'bold 44px monospace';
    ctx.fillText(String(rating), 360, 272);

    // Season record
    ctx.fillStyle = '#888888';
    ctx.font = '18px monospace';
    ctx.fillText('SEASON', 640, 228);
    ctx.fillStyle = '#ffffff';
    ctx.font = '38px monospace';
    ctx.fillText(wins + 'W  ' + losses + 'L  ' + draws + 'D', 640, 272);

    // Divider
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(360, 300); ctx.lineTo(1160, 300); ctx.stroke();

    // Members
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px monospace';
    ctx.fillText(memberCount + '/30 members  \u00b7  ' + slotsOpen + ' slots open', 360, 350);

    // Description
    var desc = (guild.description || '').slice(0, 80);
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '16px monospace';
    ctx.fillText(desc, 360, 420);

    // Watermark
    ctx.fillStyle = '#555555';
    ctx.font = '14px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('MINETRIS', 1180, 612);

    return canvas;
  }

  function _trunc(str, max) {
    return str && str.length > max ? str.slice(0, max) + '\u2026' : (str || '');
  }

  function _downloadCard(guild, idx) {
    var canvas = _drawGuildCard(guild, idx);
    var link = document.createElement('a');
    link.download = 'minetris-guild-' + (guild.tag || 'card') + '.png';
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // ── HTML helpers ────────────────────────────────────────────────────────────

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _fmtXP(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
    return String(n || 0);
  }

  // ── Modal ───────────────────────────────────────────────────────────────────

  function openGuildProfileModal(tag, prefetchedData) {
    // Remove any existing modal
    var existing = document.getElementById('gp-modal-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'gp-modal-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.88)',
      'z-index:9990', 'display:flex', 'align-items:center',
      'justify-content:center', 'padding:16px', 'overflow-y:auto',
    ].join(';');

    var modal = document.createElement('div');
    modal.id = 'gp-modal';
    modal.style.cssText = [
      'background:#0f0f0f', 'border:1px solid #222',
      'max-width:680px', 'width:100%', 'max-height:88vh',
      'overflow-y:auto', 'position:relative',
      'font-family:"Press Start 2P",monospace',
      'font-size:11px', 'color:#fff',
    ].join(';');

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });

    if (prefetchedData) {
      _renderGuildModal(modal, tag.toUpperCase(), prefetchedData.guild, prefetchedData.members || []);
    } else {
      modal.innerHTML = '<div style="padding:32px;text-align:center;color:#888;font-size:10px">Loading\u2026</div>';
      fetch(GUILD_API + '/api/guilds/by-tag/' + encodeURIComponent(tag.toUpperCase()))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error || !data.guild) {
            modal.innerHTML = '<div style="padding:32px;text-align:center;color:#f44;font-size:10px">Guild not found.</div>';
            return;
          }
          _renderGuildModal(modal, tag.toUpperCase(), data.guild, data.members || []);
        })
        .catch(function () {
          modal.innerHTML = '<div style="padding:32px;text-align:center;color:#f44;font-size:10px">Failed to load guild profile.</div>';
        });
    }

    return overlay;
  }

  function _renderGuildModal(modal, tag, guild, members) {
    var bc         = guild.bannerColor || '#1e40af';
    var profileUrl = PROFILE_BASE + tag;

    // Collect user identity from localStorage
    var userId     = null;
    var userGuildId = null;
    try { userId     = localStorage.getItem('mineCtris_displayName'); } catch (_) {}
    try { userGuildId = localStorage.getItem('mineCtris_guildId');    } catch (_) {}

    // Top 5 by all-time contributionXP
    var top5 = members.slice()
      .sort(function (a, b) { return (b.contributionXP || 0) - (a.contributionXP || 0); })
      .slice(0, 5);

    var memberRowsHtml = top5.length === 0
      ? '<div style="font-size:9px;color:#444;padding:8px 0">No members yet.</div>'
      : top5.map(function (m, i) {
          var roleColor = m.role === 'owner' ? '#ffd700' : m.role === 'officer' ? '#9bbdf9' : '#888';
          return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #111;font-size:9px">' +
            '<span style="width:20px;color:#555;text-align:right">#' + (i + 1) + '</span>' +
            '<span style="flex:1;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(m.userId) + '</span>' +
            '<span style="font-size:7px;padding:2px 5px;background:#1a1a1a;border:1px solid #333;color:' + roleColor + '">' + _esc(m.role) + '</span>' +
            '<span style="color:' + _esc(bc) + ';min-width:56px;text-align:right">' + _fmtXP(m.contributionXP || 0) + ' XP</span>' +
            '</div>';
        }).join('');

    // Join state
    var joinHtml = '';
    var guildId = guild.id;
    if (userId && !userGuildId && !guild.isPrivate) {
      joinHtml = '<button id="gp-join-btn" style="padding:10px 16px;background:' + _esc(bc) +
        ';color:#fff;border:none;font-family:inherit;font-size:9px;cursor:pointer">\uD83D\uDCE9 REQUEST TO JOIN</button>' +
        '<span id="gp-join-msg" style="font-size:9px;margin-left:8px"></span>';
    } else if (userId && userGuildId && userGuildId !== guildId) {
      joinHtml = '<span style="font-size:9px;color:#888">You are already in a guild.</span>';
    }

    // XP progress
    var level = guild.level || 1;
    var xp    = guild.xp    || 0;
    var xpThreshold = 0;
    for (var i = 1; i < level; i++) xpThreshold += i * i * 500;
    var xpCurrent = Math.max(0, xp - xpThreshold);
    var xpNeeded  = level >= 20 ? 0 : level * level * 500;
    var xpPct     = xpNeeded > 0 ? Math.min(100, Math.round(xpCurrent / xpNeeded * 100)) : 100;

    var rating  = guild.guildRating || 1000;
    var wins    = guild.wins        || 0;
    var losses  = guild.losses      || 0;
    var draws   = guild.draws       || 0;
    var mCount  = guild.memberCount || members.length || 0;
    var slots   = Math.max(0, 30 - mCount);

    modal.innerHTML = [
      '<div style="height:6px;background:' + _esc(bc) + '"></div>',
      '<div style="padding:16px 20px">',

      // Header
      '<div style="display:flex;gap:16px;align-items:center;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #222">',
      '<div style="font-size:52px;line-height:1;min-width:60px;text-align:center">' + _esc(guild.emblem || '⚔️') + '</div>',
      '<div style="flex:1;min-width:0">',
      '<div style="font-size:15px;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(guild.name) + '</div>',
      '<div style="color:' + _esc(bc) + ';font-size:11px;margin-bottom:8px">[' + _esc(guild.tag) + ']  Lv.' + level + (guild.isPrivate ? '  \uD83D\uDD12' : '') + '</div>',
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">',
      '<div style="height:8px;background:#1a1a1a;border:1px solid #333;flex:1;overflow:hidden">',
      '<div style="height:100%;background:' + _esc(bc) + ';width:' + xpPct + '%"></div>',
      '</div>',
      '</div>',
      '<div style="font-size:8px;color:#555">' + xpCurrent.toLocaleString() + ' / ' + (xpNeeded > 0 ? xpNeeded.toLocaleString() + ' XP' : 'MAX LEVEL') + '</div>',
      '</div>',
      '<button id="gp-close-btn" style="background:none;border:none;color:#555;font-size:18px;cursor:pointer;font-family:inherit;padding:0;align-self:flex-start;flex-shrink:0">\u2715</button>',
      '</div>',

      // Stats row
      '<div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">',
      _statBox(String(mCount) + '/30', 'MEMBERS', '#fff'),
      _statBox(String(slots), 'OPEN SLOTS', bc),
      _statBox(String(rating), 'RATING', bc),
      _statBox(wins + 'W  ' + losses + 'L  ' + draws + 'D', 'SEASON', '#fff'),
      '</div>',

      // Description
      guild.description
        ? '<div style="padding:10px 0;margin-bottom:14px;border-bottom:1px solid #1a1a1a;font-size:10px;color:#aaa;line-height:2;word-break:break-word">' + _esc(guild.description) + '</div>'
        : '',

      // Top 5
      '<div style="margin-bottom:16px">',
      '<div style="font-size:8px;color:#555;margin-bottom:8px">TOP CONTRIBUTORS</div>',
      memberRowsHtml,
      '</div>',

      // Actions
      '<div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:12px;border-top:1px solid #1a1a1a;align-items:center">',
      joinHtml,
      '<button id="gp-card-btn" style="padding:10px 14px;background:#111;color:' + _esc(bc) + ';border:1px solid ' + _esc(bc) + ';font-family:inherit;font-size:9px;cursor:pointer">\u2b07 PNG CARD</button>',
      '<button id="gp-link-btn" style="padding:10px 14px;background:#1a1a1a;color:#aaa;border:1px solid #333;font-family:inherit;font-size:9px;cursor:pointer">\uD83D\uDD17 COPY LINK</button>',
      '<a href="' + _esc(profileUrl) + '" target="_blank" rel="noopener" style="padding:10px 14px;background:#1a1a1a;color:#aaa;border:1px solid #333;font-family:inherit;font-size:9px;text-decoration:none;display:inline-block">\u2197 FULL PAGE</a>',
      '</div>',

      '</div>',
    ].join('');

    // Wire up close button
    document.getElementById('gp-close-btn').addEventListener('click', function () {
      var ov = document.getElementById('gp-modal-overlay');
      if (ov) ov.remove();
    });

    // Download card
    document.getElementById('gp-card-btn').addEventListener('click', function () {
      _downloadCard(guild, { guildRating: rating, wins: wins, losses: losses, draws: draws });
    });

    // Copy profile link
    document.getElementById('gp-link-btn').addEventListener('click', function () {
      var btn = document.getElementById('gp-link-btn');
      var url = profileUrl;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () {
          btn.textContent = '\u2713 COPIED!';
          setTimeout(function () { btn.textContent = '\uD83D\uDD17 COPY LINK'; }, 2000);
        }).catch(function () { prompt('Copy this link:', url); });
      } else {
        prompt('Copy this link:', url);
      }
    });

    // Request to join
    var joinBtn = document.getElementById('gp-join-btn');
    if (joinBtn) {
      joinBtn.addEventListener('click', function () {
        joinBtn.disabled = true;
        joinBtn.textContent = 'SENDING\u2026';
        fetch(GUILD_API + '/api/guilds/' + guildId + '/join-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: userId }),
        }).then(function (r) { return r.json(); }).then(function (d) {
          var msg = document.getElementById('gp-join-msg');
          if (d.requested) {
            joinBtn.style.display = 'none';
            if (msg) { msg.style.color = '#4d4'; msg.textContent = '\u2713 Request sent!'; }
          } else {
            joinBtn.disabled = false;
            joinBtn.textContent = '\uD83D\uDCE9 REQUEST TO JOIN';
            if (msg) { msg.style.color = '#d44'; msg.textContent = d.error || 'Failed'; }
          }
        }).catch(function () {
          joinBtn.disabled = false;
          joinBtn.textContent = '\uD83D\uDCE9 REQUEST TO JOIN';
          var msg = document.getElementById('gp-join-msg');
          if (msg) { msg.style.color = '#d44'; msg.textContent = 'Network error'; }
        });
      });
    }
  }

  function _statBox(value, label, color) {
    return '<div style="text-align:center;min-width:72px">' +
      '<div style="font-size:16px;color:' + _esc(color) + ';margin-bottom:4px">' + _esc(value) + '</div>' +
      '<div style="font-size:8px;color:#555">' + _esc(label) + '</div>' +
      '</div>';
  }

  // ── URL param detection on page load ────────────────────────────────────────

  function _init() {
    var params = new URLSearchParams(location.search);
    var tag = params.get('guild');
    if (!tag) return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { openGuildProfileModal(tag, null); });
    } else {
      // Small delay so the game UI has time to render first
      setTimeout(function () { openGuildProfileModal(tag, null); }, 200);
    }
  }

  // ── Exports ─────────────────────────────────────────────────────────────────

  window.openGuildProfileModal = openGuildProfileModal;

  _init();
})();
