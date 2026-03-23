// js/coop-trade.js — Co-op resource trading system.
// Allows players to offer and transfer inventory items while playing co-op.
// Requires: state.js (inventory, isCoopMode, coopTradePanelOpen, coopPartnerLastPos),
//           inventory.js (addToInventory, updateInventoryHUD),
//           coop.js, config.js (COLOR_TO_MATERIAL)
// Loaded after coop-avatar.js, before main.js.

var COOP_TRADE_HINT_KEY = 'mineCtris_coopTradeHintSeen';
var TRADE_OFFER_TIMEOUT_MS = 8000;

var coopTrade = (function () {
  // Pending outgoing offer (set when we send trade_offer, cleared on accept/cancel/timeout)
  var _outgoing = null; // { material, quantity, timeoutId }
  // Pending incoming offer (set when we receive trade_offer)
  var _incoming = null; // { material, quantity, fromName, timeoutId }
  var _selectedMaterial = null;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function _getMyPos() {
    if (typeof controls !== 'undefined' && controls && controls.getObject) {
      var pos = controls.getObject().position;
      return { x: pos.x, y: pos.y, z: pos.z };
    }
    return null;
  }

  function _distToPartner() {
    var mine = _getMyPos();
    var partner = typeof coopPartnerLastPos !== 'undefined' ? coopPartnerLastPos : null;
    if (!mine || !partner) return Infinity;
    var dx = mine.x - partner.x;
    var dy = mine.y - partner.y;
    var dz = mine.z - partner.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function _getMaterialLabel(cssColor) {
    if (typeof COLOR_TO_MATERIAL !== 'undefined') {
      var hex = parseInt(cssColor.replace('#', ''), 16);
      var mat = COLOR_TO_MATERIAL[hex];
      if (mat) return mat.charAt(0).toUpperCase() + mat.slice(1);
    }
    return cssColor;
  }

  function _getMyName() {
    try { return localStorage.getItem('mineCtris_displayName') || 'You'; } catch (_) { return 'You'; }
  }

  // ── Trade panel UI ───────────────────────────────────────────────────────

  function _openPanel() {
    coopTradePanelOpen = true;
    if (typeof controls !== 'undefined' && controls && controls.isLocked) {
      controls.unlock();
    }
    _renderPanel();
    var panel = document.getElementById('coop-trade-panel');
    if (panel) panel.style.display = 'flex';
  }

  function _closePanel() {
    coopTradePanelOpen = false;
    var panel = document.getElementById('coop-trade-panel');
    if (panel) panel.style.display = 'none';
    _selectedMaterial = null;
    if (typeof controls !== 'undefined' && controls && !controls.isLocked &&
        typeof isGameOver !== 'undefined' && !isGameOver) {
      controls.lock();
    }
  }

  function _renderPanel() {
    var grid = document.getElementById('coop-trade-grid');
    if (!grid) return;
    grid.innerHTML = '';
    var entries = Object.entries(inventory).filter(function (e) { return e[1] > 0; });
    entries.forEach(function (entry) {
      var color = entry[0];
      var count = entry[1];
      var slot = document.createElement('div');
      slot.className = 'trade-inv-slot' + (color === _selectedMaterial ? ' selected' : '');
      slot.title = _getMaterialLabel(color) + ' \xd7' + count;
      var swatch = document.createElement('div');
      swatch.className = 'trade-inv-swatch';
      swatch.style.backgroundColor = color;
      var countEl = document.createElement('div');
      countEl.className = 'trade-inv-count';
      countEl.textContent = count;
      slot.appendChild(swatch);
      slot.appendChild(countEl);
      slot.addEventListener('click', function () {
        _selectedMaterial = color;
        _renderPanel();
        _renderQtyRow();
      });
      grid.appendChild(slot);
    });
    _renderQtyRow();
  }

  function _renderQtyRow() {
    var row = document.getElementById('coop-trade-qty-row');
    var swatchEl = document.getElementById('coop-trade-selected-swatch');
    var labelEl = document.getElementById('coop-trade-selected-label');
    var qtyInput = document.getElementById('coop-trade-qty-input');
    var offerBtn = document.getElementById('coop-trade-offer-btn');
    if (!row) return;
    if (!_selectedMaterial) {
      row.style.display = 'none';
      if (offerBtn) offerBtn.disabled = true;
      return;
    }
    var available = inventory[_selectedMaterial] || 0;
    row.style.display = 'flex';
    if (swatchEl) swatchEl.style.backgroundColor = _selectedMaterial;
    if (labelEl) labelEl.textContent = _getMaterialLabel(_selectedMaterial) + ' (\xd7' + available + ' owned)';
    if (qtyInput) {
      qtyInput.max = available;
      if (!qtyInput._tradeBound) {
        qtyInput._tradeBound = true;
        qtyInput.addEventListener('keydown', function (e) {
          if (e.code === 'Enter') _publicAPI.sendOffer();
        });
      }
      // Set default quantity: min(5, available)
      var cur = parseInt(qtyInput.value, 10);
      if (!cur || cur < 1 || cur > available) qtyInput.value = Math.min(5, available);
    }
    if (offerBtn) offerBtn.disabled = false;
  }

  // ── Toast helpers ────────────────────────────────────────────────────────

  function _showIncomingToast(material, quantity, fromName) {
    var label = _getMaterialLabel(material);
    var toast = document.getElementById('coop-incoming-trade-toast');
    var msgEl = document.getElementById('coop-incoming-trade-msg');
    var timerEl = document.getElementById('coop-incoming-trade-timer');
    if (!toast) return;
    if (msgEl) msgEl.textContent = fromName + ' is offering ' + quantity + 'x ' + label;
    if (timerEl) {
      var secondsLeft = Math.ceil(TRADE_OFFER_TIMEOUT_MS / 1000);
      timerEl.textContent = secondsLeft + 's';
      if (timerEl._countdownInterval) clearInterval(timerEl._countdownInterval);
      timerEl._countdownInterval = setInterval(function () {
        secondsLeft--;
        if (timerEl) timerEl.textContent = secondsLeft > 0 ? secondsLeft + 's' : '';
        if (secondsLeft <= 0) {
          clearInterval(timerEl._countdownInterval);
          timerEl._countdownInterval = null;
        }
      }, 1000);
    }
    toast.style.display = 'flex';
  }

  function _hideIncomingToast() {
    var toast = document.getElementById('coop-incoming-trade-toast');
    if (toast) toast.style.display = 'none';
    var timerEl = document.getElementById('coop-incoming-trade-timer');
    if (timerEl && timerEl._countdownInterval) {
      clearInterval(timerEl._countdownInterval);
      timerEl._countdownInterval = null;
    }
  }

  function _showStatusToast(msg) {
    var el = document.getElementById('coop-partner-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'coop-partner-toast';
      el.style.cssText = [
        'position:fixed', 'bottom:80px', 'left:50%', 'transform:translateX(-50%)',
        'background:rgba(0,0,0,0.78)', 'color:#00ffff',
        'font-family:"Press Start 2P",monospace', 'font-size:9px',
        'padding:7px 14px', 'border-radius:4px', 'z-index:9999',
        'pointer-events:none', 'display:none',
      ].join(';');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
    if (el._hideTimeout) clearTimeout(el._hideTimeout);
    el._hideTimeout = setTimeout(function () { el.style.display = 'none'; }, 3500);
  }

  // ── Public API ───────────────────────────────────────────────────────────

  var _publicAPI = {
    /**
     * Try to open the trade offer panel.
     * Called from F key handler. Returns true if the keypress was consumed.
     */
    tryOpenPanel: function () {
      if (typeof isCoopMode === 'undefined' || !isCoopMode) return false;
      if (typeof isGameOver !== 'undefined' && isGameOver) return false;
      if (_outgoing) {
        _showStatusToast('Trade already pending...');
        return true;
      }
      var dist = _distToPartner();
      if (dist > 3) {
        _showStatusToast('Too far away to trade');
        return true;
      }
      var entries = Object.entries(inventory).filter(function (e) { return e[1] > 0; });
      if (!entries.length) {
        _showStatusToast('No items to trade');
        return true;
      }
      // Pre-select first item
      _selectedMaterial = entries[0][0];
      _openPanel();
      return true;
    },

    /** Close the offer panel, cancel any pending outgoing offer. */
    closePanel: function () {
      if (_outgoing) {
        clearTimeout(_outgoing.timeoutId);
        if (typeof coop !== 'undefined') coop.send({ type: 'trade_cancel' });
        _outgoing = null;
        _showStatusToast('Trade cancelled');
      }
      _closePanel();
    },

    /** Send the trade offer for the currently selected material/quantity. */
    sendOffer: function () {
      if (!_selectedMaterial) return;
      var qtyInput = document.getElementById('coop-trade-qty-input');
      var qty = qtyInput ? parseInt(qtyInput.value, 10) : 5;
      if (!qty || qty < 1) return;
      var available = inventory[_selectedMaterial] || 0;
      qty = Math.min(qty, available);
      if (qty < 1) return;
      var fromName = _getMyName();
      if (typeof coop !== 'undefined') {
        coop.send({ type: 'trade_offer', material: _selectedMaterial, quantity: qty, fromName: fromName });
      }
      var mat = _selectedMaterial;
      var timeoutId = setTimeout(function () {
        if (_outgoing && _outgoing.timeoutId === timeoutId) {
          _outgoing = null;
          _showStatusToast('No response \u2014 offer expired');
        }
      }, TRADE_OFFER_TIMEOUT_MS);
      _outgoing = { material: mat, quantity: qty, timeoutId: timeoutId };
      _closePanel();
      _showStatusToast('Offer sent! Waiting for partner...');
    },

    /** Accept the pending incoming offer (called when receiver presses E). */
    acceptIncomingOffer: function () {
      if (!_incoming) return false;
      var mat = _incoming.material;
      var qty = _incoming.quantity;
      clearTimeout(_incoming.timeoutId);
      _incoming = null;
      _hideIncomingToast();
      // Add items to own inventory (capped by INV limits)
      var added = 0;
      for (var i = 0; i < qty; i++) {
        if (typeof addToInventory === 'function') {
          if (addToInventory(mat)) added++;
          else break;
        }
      }
      if (typeof coop !== 'undefined') {
        coop.send({ type: 'trade_accept', material: mat, quantity: added });
      }
      var label = _getMaterialLabel(mat);
      _showStatusToast('+' + added + 'x ' + label + ' received!');
      if (typeof coopMyTradesCompleted !== 'undefined') {
        coopMyTradesCompleted++;
        if (typeof achOnCoopTradeComplete === 'function') achOnCoopTradeComplete(coopMyTradesCompleted);
      }
      return true;
    },

    hasPendingIncomingOffer: function () { return _incoming !== null; },

    // ── Incoming message handlers (wired in main.js) ─────────────────────

    onTradeOffer: function (msg) {
      // Reject if we already have one pending
      if (_incoming) {
        if (typeof coop !== 'undefined') coop.send({ type: 'trade_cancel' });
        return;
      }
      var mat = msg.material;
      var qty = msg.quantity;
      var fromName = msg.fromName || 'Partner';
      var timeoutId = setTimeout(function () {
        if (_incoming && _incoming.timeoutId === timeoutId) {
          _incoming = null;
          _hideIncomingToast();
        }
      }, TRADE_OFFER_TIMEOUT_MS);
      _incoming = { material: mat, quantity: qty, fromName: fromName, timeoutId: timeoutId };
      _showIncomingToast(mat, qty, fromName);
    },

    onTradeAccept: function (msg) {
      if (!_outgoing) return; // late accept, ignore
      clearTimeout(_outgoing.timeoutId);
      var mat = _outgoing.material;
      var qty = _outgoing.quantity;
      _outgoing = null;
      // Deduct from own inventory
      var available = inventory[mat] || 0;
      var deducted = Math.min(qty, available);
      if (deducted > 0) {
        inventory[mat] -= deducted;
        if (inventory[mat] <= 0) delete inventory[mat];
        if (typeof updateInventoryHUD === 'function') updateInventoryHUD();
      }
      var label = _getMaterialLabel(mat);
      _showStatusToast('\u2713 ' + deducted + 'x ' + label + ' sent to partner!');
      if (typeof coopMyTradesCompleted !== 'undefined') {
        coopMyTradesCompleted++;
        if (typeof achOnCoopTradeComplete === 'function') achOnCoopTradeComplete(coopMyTradesCompleted);
      }
    },

    onTradeCancel: function () {
      if (_incoming) {
        clearTimeout(_incoming.timeoutId);
        _incoming = null;
        _hideIncomingToast();
        _showStatusToast('Partner cancelled trade');
      }
    },

    /** Reject a pending incoming offer (called when receiver presses Q). */
    rejectIncomingOffer: function () {
      if (!_incoming) return false;
      clearTimeout(_incoming.timeoutId);
      _incoming = null;
      _hideIncomingToast();
      if (typeof coop !== 'undefined') coop.send({ type: 'trade_cancel' });
      _showStatusToast('Trade declined');
      return true;
    },

    /** Show the one-time first-run co-op trade hint. */
    showFirstRunHint: function () {
      try {
        if (localStorage.getItem(COOP_TRADE_HINT_KEY)) return;
        localStorage.setItem(COOP_TRADE_HINT_KEY, '1');
      } catch (_) {}
      var hint = document.getElementById('coop-trade-hint');
      if (!hint) return;
      hint.style.display = 'block';
      setTimeout(function () { if (hint) hint.style.display = 'none'; }, 6000);
    },

    /** Reset all trade state (called on game reset / partner disconnect). */
    reset: function () {
      if (_outgoing) { clearTimeout(_outgoing.timeoutId); _outgoing = null; }
      _closePanel();
      if (_incoming) { clearTimeout(_incoming.timeoutId); _incoming = null; }
      _hideIncomingToast();
    },

    /** Wire up the offer/cancel button click handlers. Called once on DOMContentLoaded. */
    init: function () {
      var offerBtn = document.getElementById('coop-trade-offer-btn');
      if (offerBtn) {
        offerBtn.addEventListener('click', function () {
          _publicAPI.sendOffer();
        });
      }
      var cancelBtn = document.getElementById('coop-trade-cancel-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function () {
          _publicAPI.closePanel();
        });
      }
    },
  };

  return _publicAPI;
})();

// Wire up buttons once DOM is ready.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { coopTrade.init(); });
} else {
  coopTrade.init();
}
