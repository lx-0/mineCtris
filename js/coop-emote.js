// js/coop-emote.js — Co-op emote system (Z/X/C-hold/V keybindings).
// Requires: coop.js, coop-avatar.js
// Loaded after coop-avatar.js, before main.js.

const coopEmote = (function () {
  const EMOTES = {
    wave:     { emoji: '👋', label: 'waved' },
    point:    { emoji: '👉', label: 'pointed' },
    thumbsup: { emoji: '👍', label: 'gave a thumbs up' },
    alert:    { emoji: '⚠️', label: 'sent an alert' },
  };

  const COOLDOWN_MS = 1000;
  let _lastEmoteAt = 0;

  function _getMyName() {
    try { return localStorage.getItem('mineCtris_displayName') || 'Player'; } catch (_) { return 'Player'; }
  }

  function _showLocalFeedback(emoteId) {
    const def = EMOTES[emoteId];
    if (!def) return;
    const el = document.getElementById('coop-emote-feedback');
    if (!el) return;
    el.textContent = def.emoji;
    el.classList.remove('coop-emote-bounce');
    void el.offsetWidth; // reflow to restart animation
    el.style.display = 'block';
    el.classList.add('coop-emote-bounce');
    clearTimeout(el._hideTimeout);
    el._hideTimeout = setTimeout(function () {
      el.style.display = 'none';
    }, 600);
  }

  function _showToast(msg) {
    const el = document.getElementById('coop-emote-toast');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(el._hideTimeout);
    el._hideTimeout = setTimeout(function () {
      el.style.display = 'none';
    }, 3000);
  }

  return {
    sendEmote: function (emoteId) {
      if (!EMOTES[emoteId]) return;
      const now = performance.now();
      if (now - _lastEmoteAt < COOLDOWN_MS) return;
      _lastEmoteAt = now;
      if (typeof coop !== 'undefined') {
        coop.send({ type: 'emote', emoteId: emoteId, fromName: _getMyName() });
      }
      _showLocalFeedback(emoteId);
    },

    receiveEmote: function (data) {
      const def = EMOTES[data.emoteId];
      if (!def) return;
      const fromName = data.fromName || 'Partner';
      if (typeof coopAvatar !== 'undefined') {
        coopAvatar.showEmote(def.emoji);
      }
      _showToast(fromName + ' ' + def.label);
    },

    showHud: function (visible) {
      const el = document.getElementById('coop-emote-hud');
      if (el) el.style.display = visible ? 'flex' : 'none';
    },

    reset: function () {
      _lastEmoteAt = 0;
    },
  };
})();
