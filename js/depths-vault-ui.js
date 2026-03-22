// Depths Vault UI — collection screen for viewing all discoverable loot,
// tracking completion, equipping cosmetics, using consumables, and monitoring
// fragment forge progress.
//
// Requires: depths-vault-data.js, depths-loot-config.js, depths-loot.js,
//           loot-tables.js (LOOT_RARITY), cosmetics.js (equipCosmetic, unequipCosmetic, getEquipped)
// Used by:  index.html (vault overlay), main.js (vault button bindings)

// ── State ────────────────────────────────────────────────────────────────────

var _vaultActiveTab   = 'all';
var _vaultActiveSection = 'cosmetics'; // cosmetics | consumables | blueprints | fragments

// ── HTML escape ──────────────────────────────────────────────────────────────

function _escVaultHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Rarity color helper ──────────────────────────────────────────────────────

function _vaultRarityColor(rarity) {
  return (LOOT_RARITY[rarity] && LOOT_RARITY[rarity].color) || '#9ca3af';
}

// ── Open / Close ─────────────────────────────────────────────────────────────

function openDepthsVault() {
  renderDepthsVault();
  var el = document.getElementById('depths-vault-overlay');
  if (el) el.style.display = 'flex';
}

function closeDepthsVault() {
  var el = document.getElementById('depths-vault-overlay');
  if (el) el.style.display = 'none';
}

// ── Main render ──────────────────────────────────────────────────────────────

function renderDepthsVault() {
  var body = document.getElementById('depths-vault-body');
  if (!body) return;

  var html = '';
  html += _renderVaultStats();
  html += _renderVaultSectionTabs();
  html += _renderVaultFilterTabs();
  html += '<div id="depths-vault-grid-wrap"></div>';
  html += '<div id="depths-vault-detail" style="display:none;"></div>';

  body.innerHTML = html;

  // Wire section tabs
  var secBtns = body.querySelectorAll('.vault-section-btn');
  for (var s = 0; s < secBtns.length; s++) {
    secBtns[s].addEventListener('click', _onVaultSectionClick);
  }

  // Wire filter tabs
  var tabBtns = body.querySelectorAll('.vault-tab-btn');
  for (var t = 0; t < tabBtns.length; t++) {
    tabBtns[t].addEventListener('click', _onVaultTabClick);
  }

  // Render initial grid
  _renderVaultGrid();
}

// ── Stats banner ─────────────────────────────────────────────────────────────

function _renderVaultStats() {
  var stats = getVaultCompletionStats();
  var html = '<div class="vault-stats-bar">';
  html += '<div class="vault-stats-total">';
  html += '<span class="vault-stats-label">COLLECTION</span> ';
  html += '<span class="vault-stats-value">' + stats.discovered + ' / ' + stats.total + '</span>';
  html += '</div>';
  html += '<div class="vault-stats-pct-wrap">';
  html += '<div class="vault-stats-pct-track">';
  html += '<div class="vault-stats-pct-fill" style="width:' + stats.percentage + '%"></div>';
  html += '</div>';
  html += '<span class="vault-stats-pct-text">' + stats.percentage + '%</span>';
  html += '</div>';
  html += '</div>';
  return html;
}

// ── Section tabs (Cosmetics | Consumables | Blueprints | Fragments) ─────────

function _renderVaultSectionTabs() {
  var sections = [
    { id: 'cosmetics',   label: 'Cosmetics',   icon: '&#127912;' },
    { id: 'consumables', label: 'Consumables',  icon: '&#9889;' },
    { id: 'blueprints',  label: 'Blueprints',   icon: '&#128220;' },
    { id: 'fragments',   label: 'Fragments',    icon: '&#128293;' },
  ];

  var html = '<div class="vault-section-tabs">';
  for (var i = 0; i < sections.length; i++) {
    var sec = sections[i];
    var active = sec.id === _vaultActiveSection ? ' vault-section-active' : '';
    html += '<button class="vault-section-btn' + active + '" data-vault-section="' + sec.id + '">';
    html += sec.icon + ' ' + sec.label;
    html += '</button>';
  }
  html += '</div>';
  return html;
}

// ── Filter tabs (All Items | By Tier | By Boss | By Rarity) ─────────────────

function _renderVaultFilterTabs() {
  // Only show filter tabs for cosmetics section
  if (_vaultActiveSection !== 'cosmetics') return '';

  var tabs = [
    { id: 'all',    label: 'All Items' },
    { id: 'tier',   label: 'By Tier' },
    { id: 'boss',   label: 'By Boss' },
    { id: 'rarity', label: 'By Rarity' },
  ];

  var html = '<div class="vault-filter-tabs">';
  for (var i = 0; i < tabs.length; i++) {
    var tab = tabs[i];
    var active = tab.id === _vaultActiveTab ? ' vault-tab-active' : '';
    html += '<button class="vault-tab-btn' + active + '" data-vault-tab="' + tab.id + '">';
    html += tab.label;
    html += '</button>';
  }
  html += '</div>';
  return html;
}

// ── Section click handler ────────────────────────────────────────────────────

function _onVaultSectionClick(e) {
  var sec = e.currentTarget.getAttribute('data-vault-section');
  if (!sec) return;
  _vaultActiveSection = sec;
  renderDepthsVault();
}

// ── Tab click handler ────────────────────────────────────────────────────────

function _onVaultTabClick(e) {
  var tab = e.currentTarget.getAttribute('data-vault-tab');
  if (!tab) return;
  _vaultActiveTab = tab;

  // Update active styling
  var allTabs = document.querySelectorAll('.vault-tab-btn');
  for (var i = 0; i < allTabs.length; i++) {
    allTabs[i].classList.toggle('vault-tab-active', allTabs[i].getAttribute('data-vault-tab') === tab);
  }

  _renderVaultGrid();
}

// ── Grid render (dispatches by section) ──────────────────────────────────────

function _renderVaultGrid() {
  var wrap = document.getElementById('depths-vault-grid-wrap');
  if (!wrap) return;

  switch (_vaultActiveSection) {
    case 'cosmetics':   wrap.innerHTML = _renderCosmeticsGrid(); break;
    case 'consumables': wrap.innerHTML = _renderConsumablesGrid(); break;
    case 'blueprints':  wrap.innerHTML = _renderBlueprintsGrid(); break;
    case 'fragments':   wrap.innerHTML = _renderFragmentsGrid(); break;
  }

  // Wire item card clicks
  var cards = wrap.querySelectorAll('.vault-item-card');
  for (var i = 0; i < cards.length; i++) {
    cards[i].addEventListener('click', _onVaultItemClick);
  }
}

// ── Cosmetics grid ───────────────────────────────────────────────────────────

function _renderCosmeticsGrid() {
  var items;

  switch (_vaultActiveTab) {
    case 'tier':
      return _renderCosmeticsByTier();
    case 'boss':
      return _renderCosmeticsByBoss();
    case 'rarity':
      return _renderCosmeticsByRarity();
    default:
      items = getVaultItemsByCategory('cosmetic');
      items = sortVaultItemsByRarity(items);
      return _renderItemGrid(items);
  }
}

function _renderCosmeticsByTier() {
  var tiers = [
    { id: 'shallow', label: 'Shallow Mines' },
    { id: 'deep',    label: 'Deep Caverns' },
    { id: 'abyssal', label: 'Abyssal Rift' },
  ];

  var html = '';
  for (var t = 0; t < tiers.length; t++) {
    var tierItems = getVaultItemsByTier(tiers[t].id).filter(function (i) { return i.type === 'cosmetic'; });
    tierItems = sortVaultItemsByRarity(tierItems);
    html += '<div class="vault-group-label">' + _escVaultHtml(tiers[t].label) + '</div>';
    html += _renderItemGrid(tierItems);
  }
  return html;
}

function _renderCosmeticsByBoss() {
  var bossItems = getVaultBossItems();
  var html = '<div class="vault-group-label">Boss First-Kill Rewards</div>';
  html += '<div class="vault-grid">';
  for (var b = 0; b < bossItems.length; b++) {
    html += _renderItemCard(bossItems[b].item);
  }
  html += '</div>';

  // Also show boss-drop pickaxes
  var pickaxes = DEPTHS_BOSS_PICKAXES;
  if (pickaxes && pickaxes.length > 0) {
    html += '<div class="vault-group-label">Boss Pickaxes</div>';
    html += '<div class="vault-grid">';
    for (var p = 0; p < pickaxes.length; p++) {
      html += _renderItemCard(pickaxes[p]);
    }
    html += '</div>';
  }

  return html;
}

function _renderCosmeticsByRarity() {
  var rarities = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
  var html = '';
  for (var r = 0; r < rarities.length; r++) {
    var items = getVaultItemsByRarity(rarities[r]).filter(function (i) { return i.type === 'cosmetic'; });
    if (items.length === 0) continue;
    var label = LOOT_RARITY[rarities[r]] ? LOOT_RARITY[rarities[r]].label : rarities[r];
    var color = _vaultRarityColor(rarities[r]);
    html += '<div class="vault-group-label" style="color:' + color + '">' + _escVaultHtml(label) + '</div>';
    html += _renderItemGrid(items);
  }
  return html;
}

// ── Consumables grid ─────────────────────────────────────────────────────────

function _renderConsumablesGrid() {
  var consumables = getVaultConsumableCounts();
  var html = '<div class="vault-grid">';
  for (var i = 0; i < consumables.length; i++) {
    var c = consumables[i];
    var color = _vaultRarityColor(c.item.rarity);
    var owned = c.count > 0;
    var cls = 'vault-item-card vault-consumable-card' + (owned ? '' : ' vault-item-empty');

    html += '<div class="' + cls + '" data-vault-item-id="' + c.item.id + '">';
    html += '<div class="vault-item-icon">' + (c.item.icon || '?') + '</div>';
    html += '<div class="vault-item-name" style="color:' + color + '">' + _escVaultHtml(c.item.name) + '</div>';
    html += '<div class="vault-item-rarity" style="color:' + color + '">' + c.item.rarity.toUpperCase() + '</div>';
    html += '<div class="vault-consumable-count">x' + c.count + '</div>';
    if (c.item.description) {
      html += '<div class="vault-item-desc">' + _escVaultHtml(c.item.description) + '</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

// ── Blueprints grid ──────────────────────────────────────────────────────────

function _renderBlueprintsGrid() {
  var blueprints = getVaultItemsByCategory('blueprint');
  blueprints = sortVaultItemsByRarity(blueprints);

  var html = '<div class="vault-grid">';
  for (var i = 0; i < blueprints.length; i++) {
    var bp = blueprints[i];
    var owned = isVaultItemOwned(bp);
    var color = _vaultRarityColor(bp.rarity);
    var cls = 'vault-item-card vault-blueprint-card' + (owned ? ' vault-item-owned' : ' vault-item-locked');

    html += '<div class="' + cls + '" data-vault-item-id="' + bp.id + '">';
    html += '<div class="vault-item-icon">' + (bp.icon || '?') + '</div>';
    html += '<div class="vault-item-name" style="color:' + color + '">' + _escVaultHtml(bp.name) + '</div>';
    html += '<div class="vault-item-rarity" style="color:' + color + '">' + bp.rarity.toUpperCase() + '</div>';

    if (owned) {
      html += '<div class="vault-blueprint-status">UNLOCKED</div>';
      if (bp.workshopRecipe) {
        html += '<div class="vault-blueprint-recipe">Recipe: ' +
          bp.workshopRecipe.cost + ' ' + _escVaultHtml(bp.workshopRecipe.material) + '</div>';
      }
    } else {
      html += '<div class="vault-blueprint-status vault-locked-label">LOCKED</div>';
      html += '<div class="vault-item-hint">' + _escVaultHtml(getVaultSourceHint(bp)) + '</div>';
    }

    if (bp.description) {
      html += '<div class="vault-item-desc">' + _escVaultHtml(bp.description) + '</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

// ── Fragments grid ───────────────────────────────────────────────────────────

function _renderFragmentsGrid() {
  var progress = typeof getDepthsFragmentProgress === 'function'
    ? getDepthsFragmentProgress() : [];

  var html = '<div class="vault-fragments-list">';
  for (var i = 0; i < progress.length; i++) {
    var p = progress[i];
    var frag = p.fragment;
    var target = p.targetItem;
    var pct = p.needed > 0 ? Math.min(100, Math.round((p.current / p.needed) * 100)) : 0;
    var complete = p.current >= p.needed;
    var fragColor = _vaultRarityColor(frag.rarity);
    var targetColor = target ? _vaultRarityColor(target.rarity) : '#f97316';

    html += '<div class="vault-fragment-row">';
    html += '<div class="vault-fragment-icon">' + (frag.icon || '?') + '</div>';
    html += '<div class="vault-fragment-info">';
    html += '<div class="vault-fragment-name" style="color:' + fragColor + '">' + _escVaultHtml(frag.name) + '</div>';
    html += '<div class="vault-fragment-target">Forges: <span style="color:' + targetColor + '">' +
      _escVaultHtml(target ? target.name : frag.forgeTarget) + '</span></div>';
    html += '<div class="vault-fragment-bar-wrap">';
    html += '<div class="vault-fragment-bar-track">';
    html += '<div class="vault-fragment-bar-fill' + (complete ? ' vault-fragment-complete' : '') +
      '" style="width:' + pct + '%"></div>';
    html += '</div>';
    html += '<span class="vault-fragment-bar-text">' + p.current + ' / ' + p.needed + '</span>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

// ── Generic item grid ────────────────────────────────────────────────────────

function _renderItemGrid(items) {
  var html = '<div class="vault-grid">';
  for (var i = 0; i < items.length; i++) {
    html += _renderItemCard(items[i]);
  }
  if (items.length === 0) {
    html += '<div class="vault-empty">No items in this category.</div>';
  }
  html += '</div>';
  return html;
}

function _renderItemCard(item) {
  var owned = isVaultItemOwned(item);
  var isNew = isVaultItemNew(item.id);
  var color = _vaultRarityColor(item.rarity);
  var cls = 'vault-item-card';
  if (!owned) cls += ' vault-item-silhouette';
  if (isNew) cls += ' vault-item-new';

  var html = '<div class="' + cls + '" data-vault-item-id="' + item.id + '" style="border-color:' + color + '">';

  if (isNew) {
    html += '<div class="vault-new-badge">NEW</div>';
  }

  html += '<div class="vault-item-icon">' + (owned ? (item.icon || '?') : '?') + '</div>';
  html += '<div class="vault-item-name" style="color:' + (owned ? color : '#555') + '">';
  html += owned ? _escVaultHtml(item.name) : '???';
  html += '</div>';
  html += '<div class="vault-item-rarity" style="color:' + color + '">' + item.rarity.toUpperCase() + '</div>';

  if (!owned) {
    html += '<div class="vault-item-hint">' + _escVaultHtml(getVaultSourceHint(item)) + '</div>';
  }

  html += '</div>';
  return html;
}

// ── Item detail view ─────────────────────────────────────────────────────────

function _onVaultItemClick(e) {
  var card = e.currentTarget;
  var itemId = card.getAttribute('data-vault-item-id');
  if (!itemId) return;

  // Clear "new" badge on view
  clearVaultItemNew(itemId);

  var item = getDepthsItemById(itemId);
  if (!item) {
    // Try depths-loot-config arrays directly
    for (var i = 0; i < DEPTHS_ALL_ITEMS.length; i++) {
      if (DEPTHS_ALL_ITEMS[i].id === itemId) { item = DEPTHS_ALL_ITEMS[i]; break; }
    }
  }
  if (!item) return;

  _showVaultDetail(item);
}

function _showVaultDetail(item) {
  var detail = document.getElementById('depths-vault-detail');
  if (!detail) return;

  var owned = isVaultItemOwned(item);
  var color = _vaultRarityColor(item.rarity);
  var source = getVaultSourceHint(item);

  var html = '<div class="vault-detail-card">';
  html += '<button class="vault-detail-close" id="vault-detail-close-btn">&times;</button>';
  html += '<div class="vault-detail-icon">' + (owned ? (item.icon || '?') : '?') + '</div>';
  html += '<div class="vault-detail-name" style="color:' + color + '">' +
    (owned ? _escVaultHtml(item.name) : '???') + '</div>';
  html += '<div class="vault-detail-rarity" style="color:' + color + '">' +
    item.rarity.toUpperCase() + '</div>';

  if (item.description && owned) {
    html += '<div class="vault-detail-desc">' + _escVaultHtml(item.description) + '</div>';
  }

  html += '<div class="vault-detail-source">' + _escVaultHtml(source) + '</div>';

  // Equip button for owned cosmetics
  if (owned && item.type === 'cosmetic' && item.category) {
    var equipped = typeof getEquipped === 'function' ? getEquipped(item.category) : null;
    var isEquipped = equipped && equipped.id === item.id;

    if (isEquipped) {
      html += '<button class="vault-detail-equip vault-detail-equipped" data-vault-equip="' +
        item.id + '" data-vault-cat="' + item.category + '">EQUIPPED (click to unequip)</button>';
    } else {
      html += '<button class="vault-detail-equip" data-vault-equip="' +
        item.id + '" data-vault-cat="' + item.category + '">EQUIP</button>';
    }
  }

  // Blueprint recipe
  if (owned && item.type === 'blueprint' && item.workshopRecipe) {
    html += '<div class="vault-detail-recipe">Workshop Recipe: ' +
      item.workshopRecipe.cost + ' ' + _escVaultHtml(item.workshopRecipe.material) + '</div>';
  }

  html += '</div>';
  detail.innerHTML = html;
  detail.style.display = 'flex';

  // Wire close button
  var closeBtn = document.getElementById('vault-detail-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      detail.style.display = 'none';
      // Refresh grid to clear "new" badge
      _renderVaultGrid();
    });
  }

  // Wire equip button
  var equipBtn = detail.querySelector('.vault-detail-equip');
  if (equipBtn) {
    equipBtn.addEventListener('click', function (ev) {
      var cosId = ev.currentTarget.getAttribute('data-vault-equip');
      var catKey = ev.currentTarget.getAttribute('data-vault-cat');
      if (!cosId || !catKey) return;

      var eq = typeof getEquipped === 'function' ? getEquipped(catKey) : null;
      if (eq && eq.id === cosId) {
        if (typeof unequipCosmetic === 'function') unequipCosmetic(catKey);
      } else {
        if (typeof equipCosmetic === 'function') equipCosmetic(cosId);
      }

      // Re-render detail to update button state
      var updatedItem = getDepthsItemById(cosId);
      if (updatedItem) _showVaultDetail(updatedItem);
    });
  }
}

// ── Init (wire close button and entry points) ───────────────────────────────

function initDepthsVault() {
  // Close button
  var closeBtn = document.getElementById('depths-vault-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeDepthsVault);
  }

  // Vault button in depths mode card
  var vaultBtn = document.getElementById('depths-vault-btn');
  if (vaultBtn) {
    vaultBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openDepthsVault();
    });
  }

  // Vault button in profile
  var profileVaultBtn = document.getElementById('profile-vault-btn');
  if (profileVaultBtn) {
    profileVaultBtn.addEventListener('click', function () {
      closeProfilePage();
      openDepthsVault();
    });
  }

  // Close on overlay background click
  var overlay = document.getElementById('depths-vault-overlay');
  if (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeDepthsVault();
    });
  }

  // Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var ol = document.getElementById('depths-vault-overlay');
      if (ol && ol.style.display !== 'none') {
        // Close detail first if open
        var detail = document.getElementById('depths-vault-detail');
        if (detail && detail.style.display !== 'none') {
          detail.style.display = 'none';
          _renderVaultGrid();
        } else {
          closeDepthsVault();
        }
      }
    }
  });
}

// Auto-init when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDepthsVault);
} else {
  initDepthsVault();
}
