// Profile page — showcases prestige, equipped cosmetics, mastery badges, and wardrobe.
// Requires: stats.js, leveling.js, achievements.js, cosmetics.js

// ── Category display metadata ─────────────────────────────────────────────────

var PROFILE_COSMETIC_CATEGORIES = [
  { key: 'block_skin',     label: 'Block Skins',     icon: '\uD83E\uDDF1' },
  { key: 'pickaxe_skin',   label: 'Pickaxe Skins',   icon: '\u26CF\uFE0F' },
  { key: 'trail',          label: 'Trails',           icon: '\u2728' },
  { key: 'landing_effect', label: 'Landing Effects',  icon: '\uD83D\uDCA5' },
  { key: 'border',         label: 'Borders',          icon: '\uD83D\uDDBC\uFE0F' },
  { key: 'title',          label: 'Titles',           icon: '\uD83C\uDFF7\uFE0F' },
];

var RARITY_COLORS = {
  common:    '#aaa',
  rare:      '#4fc3f7',
  epic:      '#ce93d8',
  legendary: '#ffd740',
};

var _profileActiveTab = 'block_skin';

// ── Render helpers ────────────────────────────────────────────────────────────

function _escProfileHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _renderProfileHeader() {
  var stats = loadLifetimeStats();
  var level = typeof getPlayerLevel === 'function' ? getPlayerLevel() : 1;
  var prestigeLevel = typeof getPrestigeLevel === 'function' ? getPrestigeLevel() : 0;
  var prestigeStars = typeof getPrestigeStarsHtml === 'function' ? getPrestigeStarsHtml() : '';

  // Equipped title
  var equippedTitle = typeof getEquipped === 'function' ? getEquipped('title') : null;
  var titleText = equippedTitle ? equippedTitle.name : '';

  // Equipped border
  var equippedBorder = typeof getEquipped === 'function' ? getEquipped('border') : null;
  var borderClass = equippedBorder && equippedBorder.assets && equippedBorder.assets.animated
    ? ' profile-header-border-animated' : '';

  var html = '<div class="profile-header' + borderClass + '">';
  html += '<div class="profile-name-row">';
  html += '<span class="profile-player-name">PLAYER</span>';
  if (prestigeStars) html += '<span class="profile-prestige-stars">' + prestigeStars + '</span>';
  html += '</div>';
  if (titleText) {
    html += '<div class="profile-title">' + _escProfileHtml(titleText) + '</div>';
  }
  html += '</div>';
  return html;
}

function _renderProfileStats() {
  var stats = loadLifetimeStats();
  var level = typeof getPlayerLevel === 'function' ? getPlayerLevel() : 1;
  var totalXP = stats.playerXP || 0;
  var prestigeLevel = typeof getPrestigeLevel === 'function' ? getPrestigeLevel() : 0;
  var xpProgress = typeof getXPProgress === 'function' ? getXPProgress(totalXP) : null;

  // Season rank
  var seasonRank = '';
  if (typeof loadBattleRating === 'function') {
    var rating = loadBattleRating().rating;
    if (typeof getSeasonRankBadgeHtml === 'function') {
      seasonRank = getSeasonRankBadgeHtml(rating);
    } else {
      seasonRank = rating + ' pts';
    }
  }

  var items = [
    { label: 'LEVEL', value: level },
    { label: 'TOTAL XP', value: totalXP.toLocaleString() },
    { label: 'PRESTIGE', value: prestigeLevel > 0 ? '\u2B50'.repeat(Math.min(prestigeLevel, 10)) + ' (' + prestigeLevel + ')' : 'None' },
  ];
  if (seasonRank) items.push({ label: 'SEASON RANK', value: seasonRank });

  var html = '<div class="profile-stats-row">';
  for (var i = 0; i < items.length; i++) {
    html += '<div class="profile-stat-item">' +
      '<div class="profile-stat-label">' + items[i].label + '</div>' +
      '<div class="profile-stat-value">' + items[i].value + '</div>' +
    '</div>';
  }
  html += '</div>';

  // XP progress bar
  if (xpProgress && xpProgress.needed > 0) {
    var pct = Math.min(100, Math.round((xpProgress.current / xpProgress.needed) * 100));
    html += '<div class="profile-xp-bar-wrap">' +
      '<div class="profile-xp-bar-label">Level ' + level + ' \u2192 ' + (level + 1) + '</div>' +
      '<div class="profile-xp-bar-track">' +
        '<div class="profile-xp-bar-fill" style="width:' + pct + '%"></div>' +
      '</div>' +
      '<div class="profile-xp-bar-text">' + xpProgress.current + ' / ' + xpProgress.needed + ' XP</div>' +
    '</div>';
  } else if (xpProgress && xpProgress.needed === 0) {
    html += '<div class="profile-xp-bar-wrap">' +
      '<div class="profile-xp-bar-label">MAX LEVEL</div>' +
      '<div class="profile-xp-bar-track"><div class="profile-xp-bar-fill" style="width:100%"></div></div>' +
      '<div class="profile-xp-bar-text">Level 50 reached!</div>' +
    '</div>';
  }

  return html;
}

function _renderEquippedCosmetics() {
  var equipped = typeof getAllEquipped === 'function' ? getAllEquipped() : {};
  var displayCats = [
    { key: 'block_skin',     label: 'Block Skin',     icon: '\uD83E\uDDF1' },
    { key: 'pickaxe_skin',   label: 'Pickaxe',        icon: '\u26CF\uFE0F' },
    { key: 'trail',          label: 'Trail',           icon: '\u2728' },
    { key: 'landing_effect', label: 'Landing Effect',  icon: '\uD83D\uDCA5' },
  ];

  var html = '<div class="profile-section-title">EQUIPPED COSMETICS</div>';
  html += '<div class="profile-equipped-grid">';
  for (var i = 0; i < displayCats.length; i++) {
    var cat = displayCats[i];
    var cos = equipped[cat.key];
    var name = cos ? cos.name : 'Default';
    var rarity = cos ? cos.rarity : 'common';
    var color = RARITY_COLORS[rarity] || '#aaa';
    html += '<div class="profile-equipped-item">' +
      '<div class="profile-equipped-icon">' + cat.icon + '</div>' +
      '<div class="profile-equipped-name" style="color:' + color + '">' + _escProfileHtml(name) + '</div>' +
      '<div class="profile-equipped-cat">' + cat.label + '</div>' +
    '</div>';
  }
  html += '</div>';
  return html;
}

function _renderMasteryBadges() {
  var html = '<div class="profile-section-title">MASTERY BADGES</div>';
  html += '<div class="profile-mastery-placeholder">' +
    '<div class="profile-mastery-icon">\uD83C\uDFC5</div>' +
    '<div class="profile-mastery-text">Coming in Phase 3</div>' +
    '<div class="profile-mastery-sub">Per-mode mastery tiers: Bronze \u2022 Silver \u2022 Gold \u2022 Diamond \u2022 Master</div>' +
  '</div>';
  return html;
}

function _renderWardrobeTabs() {
  var html = '<div class="profile-section-title">COSMETIC WARDROBE</div>';
  html += '<div class="profile-wardrobe-tabs">';
  for (var i = 0; i < PROFILE_COSMETIC_CATEGORIES.length; i++) {
    var cat = PROFILE_COSMETIC_CATEGORIES[i];
    var active = cat.key === _profileActiveTab ? ' profile-tab-active' : '';
    html += '<button class="profile-tab-btn' + active + '" data-profile-tab="' + cat.key + '">' +
      cat.icon + ' ' + cat.label +
    '</button>';
  }
  html += '</div>';
  html += '<div id="profile-wardrobe-content"></div>';
  return html;
}

function _renderWardrobeContent(categoryKey) {
  var el = document.getElementById('profile-wardrobe-content');
  if (!el) return;

  var allInCat = typeof getCosmeticsByCategory === 'function'
    ? getCosmeticsByCategory(categoryKey) : [];
  var equipped = typeof getEquipped === 'function' ? getEquipped(categoryKey) : null;
  var equippedId = equipped ? equipped.id : null;

  var html = '<div class="profile-wardrobe-grid">';
  for (var i = 0; i < allInCat.length; i++) {
    var cos = allInCat[i];
    var unlocked = typeof isCosmeticUnlocked === 'function' ? isCosmeticUnlocked(cos.id) : false;
    var isEquipped = cos.id === equippedId;
    var color = RARITY_COLORS[cos.rarity] || '#aaa';

    var cls = 'profile-wardrobe-card';
    if (!unlocked) cls += ' profile-wardrobe-locked';
    if (isEquipped) cls += ' profile-wardrobe-equipped';

    html += '<div class="' + cls + '" data-cosmetic-id="' + cos.id + '" data-cosmetic-cat="' + categoryKey + '">';
    html += '<div class="profile-wardrobe-card-name" style="color:' + color + '">' + _escProfileHtml(cos.name) + '</div>';
    html += '<div class="profile-wardrobe-card-rarity">' + cos.rarity.toUpperCase() + '</div>';

    if (!unlocked) {
      var hint = _getUnlockHint(cos);
      html += '<div class="profile-wardrobe-card-lock">\uD83D\uDD12 ' + _escProfileHtml(hint) + '</div>';
    } else if (isEquipped) {
      html += '<div class="profile-wardrobe-card-badge">EQUIPPED</div>';
    } else {
      html += '<div class="profile-wardrobe-card-equip">Click to equip</div>';
    }

    html += '</div>';
  }

  if (allInCat.length === 0) {
    html += '<div class="profile-wardrobe-empty">No cosmetics in this category yet.</div>';
  }

  html += '</div>';
  el.innerHTML = html;

  // Wire click handlers for equip/unequip
  var cards = el.querySelectorAll('.profile-wardrobe-card:not(.profile-wardrobe-locked)');
  for (var j = 0; j < cards.length; j++) {
    cards[j].addEventListener('click', _onWardrobeCardClick);
  }
}

function _getUnlockHint(cosmetic) {
  if (!cosmetic.unlockCondition) return 'Default';
  var cond = cosmetic.unlockCondition;
  switch (cond.type) {
    case 'level':       return 'Reach Level ' + cond.value;
    case 'prestige':    return 'Prestige ' + cond.value;
    case 'achievement': return 'Achievement: ' + cond.value;
    case 'mastery':     return 'Mastery (Phase 3)';
    case 'season':      return 'Season reward';
    case 'dungeon':     return 'Dungeon reward';
    default:            return 'Locked';
  }
}

function _onWardrobeCardClick(e) {
  var card = e.currentTarget;
  var cosId = card.getAttribute('data-cosmetic-id');
  var catKey = card.getAttribute('data-cosmetic-cat');
  if (!cosId || !catKey) return;

  // If already equipped, unequip
  var equipped = typeof getEquipped === 'function' ? getEquipped(catKey) : null;
  if (equipped && equipped.id === cosId) {
    if (typeof unequipCosmetic === 'function') unequipCosmetic(catKey);
  } else {
    if (typeof equipCosmetic === 'function') equipCosmetic(cosId);
  }

  // Re-render wardrobe and equipped section
  _renderWardrobeContent(catKey);
  var equippedEl = document.getElementById('profile-equipped-section');
  if (equippedEl) equippedEl.innerHTML = _renderEquippedCosmetics();
}

// ── Main render + open/close ──────────────────────────────────────────────────

function renderProfilePage() {
  var body = document.getElementById('profile-page-body');
  if (!body) return;

  var html = '';
  html += _renderProfileHeader();
  html += _renderProfileStats();
  html += '<div id="profile-equipped-section">' + _renderEquippedCosmetics() + '</div>';
  html += _renderMasteryBadges();
  html += _renderWardrobeTabs();

  body.innerHTML = html;

  // Render initial wardrobe tab
  _renderWardrobeContent(_profileActiveTab);

  // Wire tab clicks
  var tabs = body.querySelectorAll('.profile-tab-btn');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function (e) {
      var tabKey = e.currentTarget.getAttribute('data-profile-tab');
      if (!tabKey) return;
      _profileActiveTab = tabKey;
      // Update active tab styling
      var allTabs = document.querySelectorAll('.profile-tab-btn');
      for (var j = 0; j < allTabs.length; j++) {
        allTabs[j].classList.toggle('profile-tab-active', allTabs[j].getAttribute('data-profile-tab') === tabKey);
      }
      _renderWardrobeContent(tabKey);
    });
  }
}

function openProfilePage() {
  renderProfilePage();
  var el = document.getElementById('profile-overlay');
  if (el) el.style.display = 'flex';
}

function closeProfilePage() {
  var el = document.getElementById('profile-overlay');
  if (el) el.style.display = 'none';
}
