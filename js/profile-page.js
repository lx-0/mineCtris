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

var _MASTERY_MODE_META = [
  { key: 'classic',    label: 'Classic',    icon: '\uD83C\uDFAE' },
  { key: 'sprint',     label: 'Sprint',     icon: '\u26A1' },
  { key: 'blitz',      label: 'Blitz',      icon: '\uD83D\uDCA5' },
  { key: 'daily',      label: 'Daily',      icon: '\uD83D\uDCC5' },
  { key: 'survival',   label: 'Survival',   icon: '\uD83C\uDF32' },
  { key: 'battle',     label: 'Battle',     icon: '\u2694\uFE0F' },
  { key: 'expedition', label: 'Expedition', icon: '\uD83D\uDDFA\uFE0F' },
  { key: 'depths',     label: 'Depths',     icon: '\u26CF\uFE0F' },
];

var _MASTERY_TIER_BORDER_COLORS = {
  0: 'rgba(255,255,255,0.12)',
  1: '#cd7f32',
  2: '#c0c0c0',
  3: '#ffd700',
  4: '#b9f2ff',
  5: '#7c3aed',
};

var _MASTERY_TIER_LABELS = ['None', 'Bronze', 'Silver', 'Gold', 'Diamond', 'Obsidian'];
var _MASTERY_TIER_ICONS_PROFILE  = ['\u25CB', '\uD83E\uDD49', '\uD83E\uDD48', '\uD83E\uDD47', '\uD83D\uDCAE', '\u2B1B'];

function _renderMasteryBadges() {
  var hasMastery = typeof getMasteryTier === 'function';
  var hasChallenges = typeof MASTERY_CHALLENGES !== 'undefined';
  var totalScore = (typeof getMasteryScore === 'function') ? getMasteryScore() : 0;

  var html = '<div class="profile-section-title">MASTERY</div>';
  html += '<div class="profile-mastery-score">Total Mastery Score: <span class="profile-mastery-score-val">' + totalScore + ' / 40</span></div>';
  html += '<div class="profile-mastery-grid">';

  for (var i = 0; i < _MASTERY_MODE_META.length; i++) {
    var meta = _MASTERY_MODE_META[i];
    var tier = hasMastery ? getMasteryTier(meta.key) : 0;
    var borderColor = _MASTERY_TIER_BORDER_COLORS[tier] || _MASTERY_TIER_BORDER_COLORS[0];
    var tierLabel   = _MASTERY_TIER_LABELS[tier] || 'None';
    var tierIcon    = _MASTERY_TIER_ICONS_PROFILE[tier] || '\u25CB';

    // Next challenge description
    var nextDesc = '';
    if (hasChallenges && tier < 5) {
      var challenges = MASTERY_CHALLENGES[meta.key];
      if (challenges && challenges[tier]) {
        nextDesc = challenges[tier].desc;
      }
    }

    var tooltip = meta.label + '\nTier: ' + tierLabel + (nextDesc ? '\nNext: ' + nextDesc : '\nMax tier reached!');

    html += '<div class="profile-mastery-card" style="border-color:' + borderColor + '" title="' + _escProfileHtml(tooltip) + '" data-mode="' + meta.key + '">';
    html += '<div class="profile-mastery-card-icon">' + meta.icon + '</div>';
    html += '<div class="profile-mastery-card-tier-icon">' + tierIcon + '</div>';
    html += '<div class="profile-mastery-card-name">' + _escProfileHtml(meta.label) + '</div>';
    html += '</div>';
  }

  html += '</div>';

  // Detail panel (shown on click)
  html += '<div id="profile-mastery-detail" class="profile-mastery-detail" style="display:none"></div>';

  return html;
}

function _renderMasteryDetail(modeKey) {
  var detailEl = document.getElementById('profile-mastery-detail');
  if (!detailEl) return;

  var meta = null;
  for (var i = 0; i < _MASTERY_MODE_META.length; i++) {
    if (_MASTERY_MODE_META[i].key === modeKey) { meta = _MASTERY_MODE_META[i]; break; }
  }
  if (!meta) return;

  var tier = (typeof getMasteryTier === 'function') ? getMasteryTier(modeKey) : 0;
  var tierLabel = _MASTERY_TIER_LABELS[tier] || 'None';
  var borderColor = _MASTERY_TIER_BORDER_COLORS[tier] || _MASTERY_TIER_BORDER_COLORS[0];

  var html = '<div class="pmd-header" style="color:' + borderColor + '">' +
    meta.icon + ' ' + _escProfileHtml(meta.label) + ' &mdash; ' + tierLabel +
  '</div>';

  // Show all 5 challenges with check/lock
  if (typeof MASTERY_CHALLENGES !== 'undefined' && MASTERY_CHALLENGES[modeKey]) {
    var challenges = MASTERY_CHALLENGES[modeKey];
    html += '<div class="pmd-challenges">';
    for (var j = 0; j < challenges.length; j++) {
      var ch = challenges[j];
      var done = tier >= ch.tier;
      var isNext = ch.tier === tier + 1;
      var cls = done ? 'pmd-ch pmd-ch-done' : (isNext ? 'pmd-ch pmd-ch-next' : 'pmd-ch pmd-ch-locked');
      var statusIcon = done ? '\u2705' : (isNext ? '\u25B6' : '\uD83D\uDD12');
      var tierIco = _MASTERY_TIER_ICONS_PROFILE[ch.tier] || '';
      html += '<div class="' + cls + '">' +
        '<span class="pmd-ch-status">' + statusIcon + '</span>' +
        '<span class="pmd-ch-tier">' + tierIco + ' ' + _MASTERY_TIER_LABELS[ch.tier] + '</span>' +
        '<span class="pmd-ch-desc">' + _escProfileHtml(ch.desc) + '</span>' +
      '</div>';
    }
    html += '</div>';
  }

  detailEl.innerHTML = html;
  detailEl.style.display = 'block';
  detailEl.setAttribute('data-active-mode', modeKey);
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
    case 'mastery': {
      var tierLabel = cond.tier ? cond.tier.charAt(0).toUpperCase() + cond.tier.slice(1) : '';
      var modeLabel = cond.mode ? cond.mode.charAt(0).toUpperCase() + cond.mode.slice(1) : '';
      return modeLabel + ' ' + tierLabel + ' Mastery';
    }
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

  // Wire mastery card clicks
  var masteryCards = body.querySelectorAll('.profile-mastery-card');
  for (var mi = 0; mi < masteryCards.length; mi++) {
    masteryCards[mi].addEventListener('click', function (e) {
      var modeKey = e.currentTarget.getAttribute('data-mode');
      if (!modeKey) return;
      var detailEl = document.getElementById('profile-mastery-detail');
      var isOpen = detailEl && detailEl.style.display !== 'none' &&
                   detailEl.getAttribute('data-active-mode') === modeKey;
      if (isOpen) {
        if (detailEl) detailEl.style.display = 'none';
      } else {
        _renderMasteryDetail(modeKey);
      }
      // Toggle active state
      var allCards = document.querySelectorAll('.profile-mastery-card');
      for (var k = 0; k < allCards.length; k++) {
        allCards[k].classList.toggle('profile-mastery-card-active', allCards[k].getAttribute('data-mode') === modeKey && !isOpen);
      }
    });
  }

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
