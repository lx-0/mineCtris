// Expedition Codex — gallery screen for collected story fragments.
//
// Organised into 4 biome tabs (Stone, Forest, Nether, Ice).
// Collected fragments show as full cards; uncollected appear as locked
// silhouettes. Biome completion % is shown at the top of each tab.
// Tapping a collected card opens a full detail view.
// Legendary fragments have a golden border / glow treatment.
// Newly collected fragments show a NEW badge until the tab is opened.
//
// Load order: after story-fragments.js, before main.js.

// ── Constants ─────────────────────────────────────────────────────────────────

var _CODEX_BIOMES = [
  { id: 'stone',  name: 'Stone',  icon: '&#9935;'   },
  { id: 'forest', name: 'Forest', icon: '&#127795;' },
  { id: 'nether', name: 'Nether', icon: '&#128293;' },
  { id: 'ice',    name: 'Ice',    icon: '&#10052;'  },
];

var _CODEX_RARITY_LABEL = { common: 'Common', rare: 'Rare', legendary: 'Legendary' };

// ── State ─────────────────────────────────────────────────────────────────────

var _codexActiveTab = 'stone';

// ── Helpers ───────────────────────────────────────────────────────────────────

function _escHtmlCodex(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/** Build and inject the tab bar. */
function _renderCodexTabs() {
  var tabsEl = document.getElementById('expedition-codex-tabs');
  if (!tabsEl) return;

  var collected = getCollectedFragmentIds();
  var newIds    = getNewFragmentIds();
  var html = '';

  _CODEX_BIOMES.forEach(function (biome) {
    var all   = STORY_FRAGMENTS.filter(function (f) { return f.biomeId === biome.id; });
    var col   = all.filter(function (f) { return collected.has(f.id); }).length;
    var hasNew = all.some(function (f) { return newIds.has(f.id); });
    var active = biome.id === _codexActiveTab ? ' codex-tab-active' : '';
    var badge  = hasNew ? '<span class="codex-tab-new-dot"></span>' : '';
    html +=
      '<button class="codex-tab' + active + '" data-biome="' + biome.id + '" ' +
        'role="tab" aria-selected="' + (biome.id === _codexActiveTab ? 'true' : 'false') + '">' +
        badge +
        '<span class="codex-tab-icon">' + biome.icon + '</span>' +
        '<span class="codex-tab-name">' + _escHtmlCodex(biome.name) + '</span>' +
        '<span class="codex-tab-pct">' + col + '/' + all.length + '</span>' +
      '</button>';
  });

  tabsEl.innerHTML = html;

  tabsEl.querySelectorAll('.codex-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      _codexActiveTab = btn.dataset.biome;
      _renderCodexTabs();
      _renderCodexGrid();
    });
  });
}

/** Build and inject the fragment grid for the active tab. */
function _renderCodexGrid() {
  var biomeId   = _codexActiveTab;
  var collected = getCollectedFragmentIds();
  var newIds    = getNewFragmentIds();

  var biomeMeta = _CODEX_BIOMES.find(function (b) { return b.id === biomeId; });
  var all       = STORY_FRAGMENTS.filter(function (f) { return f.biomeId === biomeId; });
  var colCount  = all.filter(function (f) { return collected.has(f.id); }).length;
  var pct       = all.length > 0 ? Math.round((colCount / all.length) * 100) : 0;

  // Mark all fragments in this tab as viewed (clears NEW badges)
  var tabNewIds = all.filter(function (f) { return newIds.has(f.id); }).map(function (f) { return f.id; });
  if (tabNewIds.length > 0) {
    markFragmentsViewed(tabNewIds);
    // Refresh tabs so the new-dot disappears
    _renderCodexTabs();
  }

  // Biome header with completion bar
  var headerEl = document.getElementById('expedition-codex-biome-header');
  if (headerEl) {
    headerEl.innerHTML =
      '<div class="codex-biome-row">' +
        '<span class="codex-biome-icon">' + (biomeMeta ? biomeMeta.icon : '') + '</span>' +
        '<span class="codex-biome-name">' + _escHtmlCodex(biomeMeta ? biomeMeta.name : biomeId) + ' Biome</span>' +
        '<span class="codex-biome-pct">' + pct + '% complete</span>' +
      '</div>' +
      '<div class="codex-progress-bar-wrap">' +
        '<div class="codex-progress-bar-fill" style="width:' + pct + '%"></div>' +
      '</div>';
  }

  // Fragment grid
  var gridEl = document.getElementById('expedition-codex-grid');
  if (!gridEl) return;

  var html = '';
  all.forEach(function (frag) {
    var isCollected = collected.has(frag.id);
    var isNew       = newIds.has(frag.id);
    var isLegendary = frag.rarity === 'legendary';
    var isRare      = frag.rarity === 'rare';

    if (isCollected) {
      var cardClass = 'codex-card codex-card-collected codex-card-' + frag.rarity;
      html +=
        '<div class="' + cardClass + '" data-frag-id="' + _escHtmlCodex(frag.id) + '" ' +
          'role="button" tabindex="0" aria-label="' + _escHtmlCodex(frag.title) + '">' +
          (isNew ? '<span class="codex-new-badge">NEW</span>' : '') +
          '<div class="codex-card-rarity codex-rarity-' + frag.rarity + '">' +
            _escHtmlCodex(_CODEX_RARITY_LABEL[frag.rarity] || frag.rarity) +
          '</div>' +
          (isLegendary ? '<div class="codex-card-legendary-star">&#11088;</div>' : '') +
          '<div class="codex-card-title">' + _escHtmlCodex(frag.title) + '</div>' +
          '<div class="codex-card-lore-preview">' +
            _escHtmlCodex(frag.lore.slice(0, 80)) + (frag.lore.length > 80 ? '&hellip;' : '') +
          '</div>' +
          '<div class="codex-card-tap-hint">Tap to read &#8250;</div>' +
        '</div>';
    } else {
      html +=
        '<div class="codex-card codex-card-locked" aria-label="Undiscovered fragment" aria-disabled="true">' +
          '<div class="codex-locked-icon">&#128274;</div>' +
          '<div class="codex-locked-label">???</div>' +
        '</div>';
    }
  });

  gridEl.innerHTML = html;

  // Attach click / keyboard handlers to collected cards
  gridEl.querySelectorAll('.codex-card-collected').forEach(function (card) {
    card.addEventListener('click', function () {
      _openFragmentDetail(card.dataset.fragId);
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        _openFragmentDetail(card.dataset.fragId);
      }
    });
  });
}

// ── Detail view ───────────────────────────────────────────────────────────────

function _openFragmentDetail(fragmentId) {
  var frag = STORY_FRAGMENTS.find(function (f) { return f.id === fragmentId; });
  if (!frag) return;

  var detailEl = document.getElementById('expedition-codex-detail');
  if (!detailEl) return;

  var biome = _CODEX_BIOMES.find(function (b) { return b.id === frag.biomeId; });

  detailEl.innerHTML =
    '<div class="codex-detail-inner">' +
      '<div class="codex-detail-header">' +
        '<div class="codex-detail-meta">' +
          '<span class="codex-detail-biome">' + (biome ? biome.icon + ' ' + _escHtmlCodex(biome.name) : '') + '</span>' +
          '<span class="codex-card-rarity codex-rarity-' + frag.rarity + '">' +
            _escHtmlCodex(_CODEX_RARITY_LABEL[frag.rarity] || frag.rarity) +
          '</span>' +
        '</div>' +
        '<button class="codex-detail-close-btn" aria-label="Close detail">&#10005;</button>' +
      '</div>' +
      (frag.rarity === 'legendary' ? '<div class="codex-detail-legendary-bar"></div>' : '') +
      '<div class="codex-detail-title">' + _escHtmlCodex(frag.title) + '</div>' +
      '<div class="codex-detail-art-wrap">' +
        '<div class="codex-detail-art codex-detail-art-' + frag.rarity + '">' +
          '<span class="codex-detail-art-placeholder">' +
            (frag.rarity === 'legendary' ? '&#11088;' : (frag.rarity === 'rare' ? '&#10024;' : '&#128444;')) +
          '</span>' +
        '</div>' +
      '</div>' +
      '<div class="codex-detail-lore">' + _escHtmlCodex(frag.lore) + '</div>' +
    '</div>';

  detailEl.style.display = 'flex';

  var closeBtn = detailEl.querySelector('.codex-detail-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', _closeFragmentDetail);
  }

  detailEl.setAttribute('tabindex', '-1');
  detailEl.focus();
}

function _closeFragmentDetail() {
  var detailEl = document.getElementById('expedition-codex-detail');
  if (detailEl) detailEl.style.display = 'none';
}

// ── Keyboard handling ─────────────────────────────────────────────────────────

function _codexKeyHandler(e) {
  var detailEl = document.getElementById('expedition-codex-detail');
  if (detailEl && detailEl.style.display !== 'none') {
    if (e.key === 'Escape') { e.preventDefault(); _closeFragmentDetail(); }
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    closeExpeditionCodex();
  }
}

// ── Open / Close ──────────────────────────────────────────────────────────────

function openExpeditionCodex() {
  var overlay = document.getElementById('expedition-codex-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  _codexActiveTab = 'stone';
  _renderCodexTabs();
  _renderCodexGrid();
  overlay.setAttribute('tabindex', '-1');
  overlay.focus();
  overlay.addEventListener('keydown', _codexKeyHandler);
}

function closeExpeditionCodex() {
  var overlay = document.getElementById('expedition-codex-overlay');
  if (!overlay) return;
  overlay.style.display = 'none';
  overlay.removeEventListener('keydown', _codexKeyHandler);
  _closeFragmentDetail();
}

// ── Init ──────────────────────────────────────────────────────────────────────

function initExpeditionCodex() {
  var closeBtn = document.getElementById('expedition-codex-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeExpeditionCodex);

  var openBtn = document.getElementById('expedition-codex-open-btn');
  if (openBtn) openBtn.addEventListener('click', openExpeditionCodex);

  var overlay = document.getElementById('expedition-codex-overlay');
  if (overlay) {
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeExpeditionCodex();
    });
  }
}
