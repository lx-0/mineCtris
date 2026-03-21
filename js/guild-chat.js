// js/guild-chat.js — Guild Chat & Activity Feed real-time client
// Depends on guild.js being loaded first (for GUILD_API, guildUserId, _loadMyGuildId, _esc)

const GUILD_CHAT_WS_BASE       = typeof GUILD_API !== 'undefined'
  ? GUILD_API.replace(/^https?:\/\//, (m) => m === 'https://' ? 'wss://' : 'ws://')
  : 'wss://minectris-leaderboard.workers.dev';
const GUILD_CHAT_POLL_MS       = 30000; // 30s fallback poll
const GUILD_CHAT_MSG_MAX_LEN   = 500;

// ── Module state ───────────────────────────────────────────────────────────────
let _chatWs            = null;
let _chatConnected     = false;
let _chatCurrentGuildId = null;
let _chatUserId        = null;
let _chatMyRole        = 'member';
let _chatMessages      = []; // newest-first
let _chatPinned        = [];
let _chatFeed          = [];
let _chatUnread        = 0;
let _feedUnread        = 0;
let _chatPollTimer     = null;

// ── Local storage helpers ──────────────────────────────────────────────────────
function _chatGetLS(key)      { try { return localStorage.getItem('gc_' + key) || null; } catch { return null; } }
function _chatSetLS(key, val) { try { localStorage.setItem('gc_' + key, val); } catch {} }

function _chatLastSeenKey(type) {
  return type + '_' + (_chatCurrentGuildId || '');
}

function _recomputeUnread() {
  const lastChat = _chatGetLS(_chatLastSeenKey('chat'));
  const lastFeed = _chatGetLS(_chatLastSeenKey('feed'));
  _chatUnread = lastChat
    ? _chatMessages.filter(m => m.ts > lastChat && m.userId !== _chatUserId).length
    : 0;
  _feedUnread = lastFeed
    ? _chatFeed.filter(e => e.ts > lastFeed).length
    : 0;
  _updateGuildBadge();
}

// ── Badge ──────────────────────────────────────────────────────────────────────
function _updateGuildBadge() {
  const total = _chatUnread + _feedUnread;
  const badge = document.getElementById('guild-btn-badge');
  if (!badge) return;
  badge.textContent = total > 99 ? '99+' : String(total);
  badge.style.display = total > 0 ? 'inline-block' : 'none';
}

// ── WebSocket connection ───────────────────────────────────────────────────────
function guildChatConnect(guildId, userId, myRole) {
  _chatCurrentGuildId = guildId;
  _chatUserId         = userId;
  _chatMyRole         = myRole || 'member';

  if (_chatWs) { try { _chatWs.close(); } catch {} _chatWs = null; }
  clearInterval(_chatPollTimer);

  try {
    const wsUrl = `${GUILD_CHAT_WS_BASE}/guild-chat/${encodeURIComponent(guildId)}/ws?userId=${encodeURIComponent(userId)}`;
    _chatWs = new WebSocket(wsUrl);

    _chatWs.addEventListener('open', () => { _chatConnected = true; });

    _chatWs.addEventListener('message', (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      _handleWsMsg(msg);
    });

    _chatWs.addEventListener('close', () => {
      _chatConnected = false; _chatWs = null;
      _chatPollTimer = setInterval(_pollFallback, GUILD_CHAT_POLL_MS);
    });

    _chatWs.addEventListener('error', () => {
      _chatConnected = false; _chatWs = null;
    });
  } catch (_) {
    _chatPollTimer = setInterval(_pollFallback, GUILD_CHAT_POLL_MS);
  }
}

function guildChatDisconnect() {
  clearInterval(_chatPollTimer);
  if (_chatWs) { try { _chatWs.close(); } catch {} _chatWs = null; }
  _chatConnected = false;
  _chatCurrentGuildId = null;
  _chatMessages = []; _chatPinned = []; _chatFeed = [];
}

function _handleWsMsg(msg) {
  switch (msg.type) {
    case 'welcome':
      _chatMessages = msg.messages || [];
      _chatPinned   = msg.pinned   || [];
      _recomputeUnread();
      _rerenderChatIfOpen();
      _rerenderPinned();
      break;
    case 'chat_message': {
      _chatMessages.unshift({ id: msg.id, userId: msg.userId, text: msg.text, ts: msg.ts });
      if (msg.userId !== _chatUserId) { _chatUnread++; _updateGuildBadge(); }
      _appendChatMessage({ id: msg.id, userId: msg.userId, text: msg.text, ts: msg.ts });
      break;
    }
    case 'message_deleted':
      _chatMessages = _chatMessages.filter(m => m.id !== msg.messageId);
      _removeChatMessageEl(msg.messageId);
      break;
    case 'pin_update':
      _chatPinned = msg.pinned || [];
      _rerenderPinned();
      _rerenderChatIfOpen(); // re-render to update pin buttons
      break;
    case 'feed_event':
      _chatFeed.unshift(msg.event);
      _feedUnread++; _updateGuildBadge();
      _prependFeedEvent(msg.event);
      break;
    case 'mention':
      _showMentionToast(msg.fromUserId, msg.text);
      break;
    case 'pong':
      break;
    case 'error':
      _showChatStatus(msg.error, true);
      break;
  }
}

async function _pollFallback() {
  if (!_chatCurrentGuildId) return;
  try {
    const res = await fetch(`${GUILD_API}/api/guild-chat/${encodeURIComponent(_chatCurrentGuildId)}/messages?limit=50`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.messages) {
      _chatMessages = data.messages;
      _chatPinned   = data.pinned || [];
      _recomputeUnread();
      _rerenderChatIfOpen();
      _rerenderPinned();
    }
  } catch (_) {}
}

// ── Send / delete / pin (outgoing) ────────────────────────────────────────────
function guildChatSend(text) {
  if (!text || !text.trim() || !_chatCurrentGuildId) return;
  const payload = JSON.stringify({ type: 'chat_message', text: text.trim() });
  if (_chatWs && _chatWs.readyState === WebSocket.OPEN) {
    _chatWs.send(payload);
  } else {
    // REST fallback
    fetch(`${GUILD_API}/api/guild-chat/${encodeURIComponent(_chatCurrentGuildId)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: _chatUserId, text: text.trim() }),
    }).catch(() => {});
  }
}

function guildChatDelete(messageId) {
  if (!_chatCurrentGuildId) return;
  fetch(`${GUILD_API}/api/guild-chat/${encodeURIComponent(_chatCurrentGuildId)}/messages/${messageId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actorId: _chatUserId, actorRole: _chatMyRole }),
  }).catch(() => {});
}

function guildChatPin(messageId) {
  if (!_chatCurrentGuildId) return;
  fetch(`${GUILD_API}/api/guild-chat/${encodeURIComponent(_chatCurrentGuildId)}/pin/${messageId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actorId: _chatUserId, actorRole: _chatMyRole }),
  }).catch(() => {});
}

function guildChatUnpin(messageId) {
  if (!_chatCurrentGuildId) return;
  fetch(`${GUILD_API}/api/guild-chat/${encodeURIComponent(_chatCurrentGuildId)}/pin/${messageId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actorId: _chatUserId, actorRole: _chatMyRole }),
  }).catch(() => {});
}

// ── Rendering helpers ──────────────────────────────────────────────────────────
function _fmtChatTime(ts) {
  try {
    const d   = new Date(ts);
    const now = new Date();
    return d.toDateString() === now.toDateString()
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (_) { return ''; }
}

function _renderMsgHtml(msg) {
  const isOfficer = _chatMyRole === 'officer' || _chatMyRole === 'owner';
  const isOwn     = msg.userId === _chatUserId;
  const isPinned  = _chatPinned.some(p => p.id === msg.id);
  const canDelete = isOwn || isOfficer;
  const canPin    = isOfficer && !isPinned && _chatPinned.length < 3;
  const canUnpin  = isOfficer && isPinned;

  // Highlight @mentions
  const text = _esc(msg.text).replace(/@([A-Za-z0-9_-]{1,32})/g,
    (_, u) => `<span class="chat-mention">@${_esc(u)}</span>`);

  return `<div class="chat-msg${isOwn ? ' chat-msg--own' : ''}" data-msg-id="${_esc(msg.id)}">
    <div class="chat-msg-header">
      <span class="chat-msg-user">${_esc(msg.userId)}</span>
      <span class="chat-msg-time">${_fmtChatTime(msg.ts)}</span>
      <span class="chat-msg-actions">
        ${canPin    ? `<button class="chat-pin-btn"   data-mid="${_esc(msg.id)}" title="Pin">📌</button>` : ''}
        ${canUnpin  ? `<button class="chat-unpin-btn" data-mid="${_esc(msg.id)}" title="Unpin">📌✕</button>` : ''}
        ${canDelete ? `<button class="chat-del-btn"   data-mid="${_esc(msg.id)}" title="Delete">🗑</button>` : ''}
      </span>
    </div>
    <div class="chat-msg-text">${text}</div>
  </div>`;
}

function _bindMsgActions(container) {
  container.addEventListener('click', (e) => {
    const del = e.target.closest('.chat-del-btn');
    if (del) { if (confirm('Delete this message?')) guildChatDelete(del.dataset.mid); return; }
    const pin = e.target.closest('.chat-pin-btn');
    if (pin) { guildChatPin(pin.dataset.mid); return; }
    const unpin = e.target.closest('.chat-unpin-btn');
    if (unpin) { guildChatUnpin(unpin.dataset.mid); return; }
  });
}

function _rerenderChatIfOpen() {
  const list = document.getElementById('guild-chat-messages');
  if (!list) return;
  // Display: oldest at top, newest at bottom
  const displayed = _chatMessages.slice().reverse();
  list.innerHTML = displayed.length === 0
    ? '<div class="chat-empty">No messages yet. Say hello!</div>'
    : displayed.map(_renderMsgHtml).join('');
  _bindMsgActions(list);
  list.scrollTop = list.scrollHeight;
}

function _appendChatMessage(msg) {
  const list = document.getElementById('guild-chat-messages');
  if (!list) return;
  // Remove "no messages" placeholder if present
  const empty = list.querySelector('.chat-empty');
  if (empty) empty.remove();
  const div = document.createElement('div');
  div.innerHTML = _renderMsgHtml(msg);
  list.appendChild(div.firstElementChild);
  _bindMsgActions(list);
  list.scrollTop = list.scrollHeight;
}

function _removeChatMessageEl(msgId) {
  const el = document.querySelector(`[data-msg-id="${CSS.escape(msgId)}"]`);
  if (el) el.remove();
}

function _rerenderPinned() {
  const el = document.getElementById('guild-chat-pinned');
  if (!el) return;
  if (_chatPinned.length === 0) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = '';
  el.innerHTML = `<div class="chat-pin-header">📌 Pinned</div>` +
    _chatPinned.map(p =>
      `<div class="chat-pin-item" title="${_esc(p.userId)}: ${_esc(p.text)}">
        <span class="chat-pin-user">${_esc(p.userId)}</span>: <span class="chat-pin-text">${_esc(p.text.slice(0, 80))}${p.text.length > 80 ? '…' : ''}</span>
      </div>`
    ).join('');
}

function _prependFeedEvent(event) {
  const list = document.getElementById('guild-feed-events');
  if (!list) return;
  const empty = list.querySelector('.chat-empty');
  if (empty) empty.remove();
  const div = document.createElement('div');
  div.innerHTML = _renderFeedEventHtml(event);
  list.insertBefore(div.firstElementChild, list.firstChild);
}

function _renderFeedEventHtml(event) {
  const icons = {
    member_joined:          '👋',
    member_left:            '🚪',
    guild_leveled_up:       '⬆️',
    weekly_top_contributor: '🏆',
    war_challenge_sent:     '⚔️',
    war_challenge_accepted: '✅',
    war_challenge_declined: '❌',
    war_started:            '🔥',
    war_completed:          '🎖️',
  };
  const icon = icons[event.type] || '📣';
  const desc = _feedDesc(event.type, event.data || {});
  return `<div class="feed-event">
    <span class="feed-event-icon">${icon}</span>
    <div class="feed-event-body">
      <div class="feed-event-desc">${_esc(desc)}</div>
      <div class="feed-event-time">${_fmtChatTime(event.ts)}</div>
    </div>
  </div>`;
}

function _feedDesc(type, d) {
  switch (type) {
    case 'member_joined':          return `${d.userId} joined the guild`;
    case 'member_left':            return d.kicked ? `${d.userId} was kicked` : `${d.userId} left the guild`;
    case 'guild_leveled_up':       return `Guild reached Level ${d.level}! 🎉`;
    case 'weekly_top_contributor': return `${d.userId} was top contributor this week (${d.weeklyXP} XP)`;
    case 'war_challenge_sent':     return `War challenge sent to ${d.defenderGuildName || 'a guild'}`;
    case 'war_challenge_accepted': return `${d.defenderGuildName || 'Defender'} accepted the war challenge!`;
    case 'war_challenge_declined': return `${d.defenderGuildName || 'Defender'} declined the war challenge`;
    case 'war_started':            return `Clan war vs ${d.opponentName || 'opponents'} has started!`;
    case 'war_completed':          return `Clan war ended — ${d.resultDesc || 'result recorded'}`;
    default:                       return type;
  }
}

function _showChatStatus(msg, isError) {
  const el = document.getElementById('guild-chat-status');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? '#f87171' : '#6ee7b7';
  clearTimeout(_showChatStatus._t);
  _showChatStatus._t = setTimeout(() => { el.textContent = ''; }, 3500);
}

function _showMentionToast(fromUserId, text) {
  const el = document.getElementById('guild-mention-toast');
  if (!el) return;
  el.innerHTML = `<strong>@mention from ${_esc(fromUserId)}</strong><br>${_esc((text || '').slice(0, 80))}`;
  el.style.display = 'block';
  clearTimeout(_showMentionToast._t);
  _showMentionToast._t = setTimeout(() => { el.style.display = 'none'; }, 5000);
}

// ── Render Chat Tab Panel ──────────────────────────────────────────────────────
function renderGuildChatPanel(container, myRole) {
  _chatMyRole = myRole || 'member';

  // Mark chat as seen
  if (_chatCurrentGuildId) {
    _chatSetLS(_chatLastSeenKey('chat'), new Date().toISOString());
    _chatUnread = 0;
    _updateGuildBadge();
  }

  const displayed = _chatMessages.slice().reverse();
  container.innerHTML = `
    <div id="guild-chat-pinned" class="guild-chat-pinned" style="display:none"></div>
    <div id="guild-chat-messages" class="guild-chat-messages">
      ${displayed.length === 0
        ? '<div class="chat-empty">No messages yet. Say hello!</div>'
        : displayed.map(_renderMsgHtml).join('')}
    </div>
    <div id="guild-chat-status" class="guild-chat-status"></div>
    <div class="guild-chat-input-row">
      <input id="guild-chat-input" type="text" placeholder="Message guild… (Enter to send)" maxlength="${GUILD_CHAT_MSG_MAX_LEN}" autocomplete="off">
      <button id="guild-chat-send-btn" class="guild-primary-btn">Send</button>
    </div>`;

  _rerenderPinned();
  _bindMsgActions(container);

  const msgs = container.querySelector('#guild-chat-messages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;

  const input   = document.getElementById('guild-chat-input');
  const sendBtn = document.getElementById('guild-chat-send-btn');

  function _doSend() {
    const text = (input.value || '').trim();
    if (!text) return;
    guildChatSend(text);
    input.value = '';
  }

  if (sendBtn) sendBtn.addEventListener('click', _doSend);
  if (input)   input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _doSend(); }
  });
}

// ── Render Feed Tab Panel ──────────────────────────────────────────────────────
async function renderGuildFeedPanel(container, guildId) {
  // Mark feed as seen
  if (_chatCurrentGuildId) {
    _chatSetLS(_chatLastSeenKey('feed'), new Date().toISOString());
    _feedUnread = 0;
    _updateGuildBadge();
  }

  container.innerHTML = '<div class="guild-loading">Loading activity feed…</div>';

  try {
    const res  = await fetch(`${GUILD_API}/api/guild-chat/${encodeURIComponent(guildId)}/feed?limit=50`);
    const data = res.ok ? await res.json() : { feed: [] };
    _chatFeed = data.feed || [];
  } catch (_) {
    container.innerHTML = '<div class="guild-error">⚠ Could not load activity feed.</div>';
    return;
  }

  if (_chatFeed.length === 0) {
    container.innerHTML = '<div class="chat-empty">No guild activity yet.</div>';
    return;
  }

  container.innerHTML = `<div id="guild-feed-events" class="guild-feed-events">${_chatFeed.map(_renderFeedEventHtml).join('')}</div>`;
}
