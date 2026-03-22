// Dungeon cosmetic reward system — weekly rotating Floor 7 rewards.
//
// Completing The Depths (all 7 floors) grants a unique cosmetic reward
// that rotates weekly at midnight UTC Monday. Players can earn each
// reward once; duplicates grant bonus XP consolation.
//
// Requires: cosmetics.js (COSMETIC_REGISTRY, isCosmeticUnlocked),
//           stats.js (awardXP), leveling.js (showXPToast)
// Used by:  depths-transition.js (victory screen), main.js (lobby preview)

// ── Storage ──────────────────────────────────────────────────────────────────

var DEPTHS_REWARDS_KEY = 'mineCtris_depths_rewards';

// ── Reward Pool ──────────────────────────────────────────────────────────────
// 8 unique dungeon-exclusive cosmetics that cycle weekly.

var DEPTHS_REWARD_POOL = [
  {
    id:          'depths_block_crystal',
    category:    'block_skin',
    name:        'Crystal Blocks',
    rarity:      'epic',
    icon:        '\u2728',
    description: 'Translucent crystal block skin forged in the abyss.',
    assets:      { themeKey: 'crystal_depths' },
  },
  {
    id:          'depths_pickaxe_molten',
    category:    'pickaxe_skin',
    name:        'Molten Pickaxe',
    rarity:      'epic',
    icon:        '\u26CF',
    description: 'A pickaxe dripping with liquid fire from The Core.',
    assets:      { meshKey: 'pickaxe_molten' },
  },
  {
    id:          'depths_trail_embers',
    category:    'trail',
    name:        'Ember Trail',
    rarity:      'epic',
    icon:        '\uD83D\uDD25',
    description: 'Falling pieces leave glowing embers in their wake.',
    assets:      { trailKey: 'embers' },
  },
  {
    id:          'depths_border_conqueror',
    category:    'border',
    name:        'Conqueror Frame',
    rarity:      'legendary',
    icon:        '\uD83D\uDC51',
    description: 'A golden frame for those who conquered The Depths.',
    assets:      { borderKey: 'conqueror', animated: true },
  },
  {
    id:          'depths_title_abyssal',
    category:    'title',
    name:        'Abyssal',
    rarity:      'epic',
    icon:        '\uD83C\uDF0C',
    description: 'A title earned in the deepest darkness.',
    assets:      { displayText: 'Abyssal', nameColor: '#7c3aed' },
  },
  {
    id:          'depths_block_obsidian',
    category:    'block_skin',
    name:        'Obsidian Blocks',
    rarity:      'epic',
    icon:        '\u2B1B',
    description: 'Dark obsidian block skin with volcanic veins.',
    assets:      { themeKey: 'obsidian_depths' },
  },
  {
    id:          'depths_trail_void',
    category:    'trail',
    name:        'Void Trail',
    rarity:      'legendary',
    icon:        '\uD83D\uDF36',
    description: 'Pieces leave a trail of swirling void particles.',
    assets:      { trailKey: 'void' },
  },
  {
    id:          'depths_title_core_walker',
    category:    'title',
    name:        'Core Walker',
    rarity:      'legendary',
    icon:        '\uD83D\uDCA0',
    description: 'Only those who walk through The Core earn this title.',
    assets:      { displayText: 'Core Walker', nameColor: '#ef4444' },
  },
];

// ── Register rewards in the main cosmetic system ─────────────────────────────

(function _registerDepthsCosmetics() {
  if (typeof COSMETIC_REGISTRY === 'undefined') return;
  for (var i = 0; i < DEPTHS_REWARD_POOL.length; i++) {
    var reward = DEPTHS_REWARD_POOL[i];
    // Only add if not already registered
    var exists = false;
    for (var j = 0; j < COSMETIC_REGISTRY.length; j++) {
      if (COSMETIC_REGISTRY[j].id === reward.id) { exists = true; break; }
    }
    if (!exists) {
      COSMETIC_REGISTRY.push({
        id:              reward.id,
        category:        reward.category,
        name:            reward.name,
        rarity:          reward.rarity,
        unlockCondition: { type: 'dungeon', value: reward.id },
        assets:          reward.assets,
      });
    }
  }
})();

// ── Week calculation (midnight UTC Monday) ───────────────────────────────────

/**
 * Get the Monday-based week number for a given date.
 * Week resets at midnight UTC every Monday.
 * Returns { weekIndex, resetTime } where resetTime is the Date of last Monday 00:00 UTC.
 */
function _getDepthsWeekInfo(date) {
  var d = date || new Date();
  // Find the most recent Monday 00:00 UTC
  var dayOfWeek = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  var daysSinceMonday = (dayOfWeek + 6) % 7; // Mon=0, Tue=1, ..., Sun=6
  var monday = new Date(Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday
  ));
  // Week index: days since epoch Monday (1970-01-05) divided by 7
  var epochMonday = Date.UTC(1970, 0, 5); // First Monday of epoch
  var weekIndex = Math.floor((monday.getTime() - epochMonday) / (7 * 86400000));
  return { weekIndex: weekIndex, resetTime: monday };
}

/**
 * Get the current week's reward from the rotation pool.
 * @param {Date} [date] Optional date override for testing
 * @returns {object} Reward object from DEPTHS_REWARD_POOL
 */
function getWeeklyDepthsReward(date) {
  var info = _getDepthsWeekInfo(date);
  var idx = ((info.weekIndex % DEPTHS_REWARD_POOL.length) + DEPTHS_REWARD_POOL.length) % DEPTHS_REWARD_POOL.length;
  return DEPTHS_REWARD_POOL[idx];
}

/**
 * Get upcoming rewards for the next N weeks (for the calendar).
 * @param {number} [count=3] Number of upcoming weeks
 * @returns {object[]} Array of { reward, weekStart } objects
 */
function getUpcomingDepthsRewards(count) {
  count = count || 3;
  var now = new Date();
  var result = [];
  for (var w = 1; w <= count; w++) {
    var futureDate = new Date(now.getTime() + w * 7 * 86400000);
    var reward = getWeeklyDepthsReward(futureDate);
    var info = _getDepthsWeekInfo(futureDate);
    result.push({ reward: reward, weekStart: info.resetTime });
  }
  return result;
}

// ── Persistence ──────────────────────────────────────────────────────────────

function _loadDepthsRewards() {
  try {
    var data = JSON.parse(localStorage.getItem(DEPTHS_REWARDS_KEY) || '[]');
    // Migrate from old 'depths_cosmetics' key if present
    var oldKey = 'depths_cosmetics';
    var oldData = JSON.parse(localStorage.getItem(oldKey) || '[]');
    if (oldData.length > 0) {
      var merged = data.slice();
      for (var i = 0; i < oldData.length; i++) {
        if (merged.indexOf(oldData[i]) < 0) merged.push(oldData[i]);
      }
      if (merged.length > data.length) {
        localStorage.setItem(DEPTHS_REWARDS_KEY, JSON.stringify(merged));
        data = merged;
      }
      localStorage.removeItem(oldKey);
    }
    return data;
  } catch (_) { return []; }
}

function _saveDepthsRewards(ids) {
  try {
    localStorage.setItem(DEPTHS_REWARDS_KEY, JSON.stringify(ids));
  } catch (_) {}
}

/**
 * Check if the player already owns a specific depths reward.
 */
function hasDepthsReward(rewardId) {
  return _loadDepthsRewards().indexOf(rewardId) >= 0;
}

// ── Reward granting ──────────────────────────────────────────────────────────

/** Bonus XP granted when player already owns this week's reward. */
var DEPTHS_DUPLICATE_BONUS_XP = 500;

/**
 * Grant the weekly depths reward on Floor 7 completion.
 * Returns { awarded: bool, reward: object, isDuplicate: bool, bonusXP: number }
 */
function awardWeeklyDepthsReward() {
  var reward = getWeeklyDepthsReward();
  var owned = hasDepthsReward(reward.id);

  if (owned) {
    // Duplicate: grant consolation XP
    if (typeof awardBonusXP === 'function') {
      awardBonusXP(DEPTHS_DUPLICATE_BONUS_XP);
    }
    return { awarded: false, reward: reward, isDuplicate: true, bonusXP: DEPTHS_DUPLICATE_BONUS_XP };
  }

  // New reward: unlock it
  var ids = _loadDepthsRewards();
  ids.push(reward.id);
  _saveDepthsRewards(ids);

  // Also unlock in the main cosmetics system
  if (typeof _loadUnlockedCosmetics === 'function' && typeof _saveUnlockedCosmetics === 'function') {
    var unlocked = _loadUnlockedCosmetics();
    if (unlocked.indexOf(reward.id) < 0) {
      unlocked.push(reward.id);
      _saveUnlockedCosmetics(unlocked);
    }
  }

  return { awarded: true, reward: reward, isDuplicate: false, bonusXP: 0 };
}

/**
 * Award bonus XP directly (for duplicate reward consolation).
 * Uses the leveling system's XP add if available.
 */
function awardBonusXP(amount) {
  if (typeof loadLifetimeStats !== 'function') return;
  var stats = loadLifetimeStats();
  var prevLevel = typeof getLevelFromXP === 'function' ? getLevelFromXP(stats.xp) : 0;
  stats.xp = (stats.xp || 0) + amount;
  if (typeof saveLifetimeStats === 'function') saveLifetimeStats(stats);
  // Check for level up
  var newLevel = typeof getLevelFromXP === 'function' ? getLevelFromXP(stats.xp) : 0;
  if (newLevel > prevLevel && typeof showLevelUpToast === 'function') {
    showLevelUpToast(newLevel);
  }
}

// ── Lobby UI: Reward Preview ─────────────────────────────────────────────────

/**
 * Render the weekly reward preview on the Depths mode card.
 * Call this from the mode select initialization.
 */
function renderDepthsRewardPreview() {
  var card = document.getElementById('mode-card-depths');
  if (!card) return;

  // Remove old preview if present
  var old = card.querySelector('.depths-reward-preview');
  if (old) old.remove();

  var reward = getWeeklyDepthsReward();
  var owned = hasDepthsReward(reward.id);

  var preview = document.createElement('div');
  preview.className = 'depths-reward-preview';
  preview.innerHTML =
    '<div class="depths-reward-preview-label">This week\'s reward:</div>' +
    '<div class="depths-reward-preview-item">' +
      '<span class="depths-reward-preview-icon">' + reward.icon + '</span> ' +
      '<span class="depths-reward-preview-name">' + reward.name + '</span>' +
      (owned ? ' <span class="depths-reward-preview-owned">\u2713 Owned</span>' : '') +
    '</div>';

  card.appendChild(preview);

  // Add calendar toggle button
  var calBtn = document.createElement('button');
  calBtn.className = 'depths-reward-calendar-btn';
  calBtn.textContent = '\uD83D\uDCC5 Upcoming';
  calBtn.onclick = function (e) {
    e.stopPropagation();
    _toggleDepthsRewardCalendar(card);
  };
  preview.appendChild(calBtn);
}

/**
 * Toggle the upcoming reward calendar dropdown.
 */
function _toggleDepthsRewardCalendar(card) {
  var existing = card.querySelector('.depths-reward-calendar');
  if (existing) {
    existing.remove();
    return;
  }

  var upcoming = getUpcomingDepthsRewards(3);
  var cal = document.createElement('div');
  cal.className = 'depths-reward-calendar';

  var html = '<div class="depths-reward-calendar-title">UPCOMING REWARDS</div>';
  for (var i = 0; i < upcoming.length; i++) {
    var entry = upcoming[i];
    var dateStr = _formatWeekDate(entry.weekStart);
    var owned = hasDepthsReward(entry.reward.id);
    html += '<div class="depths-reward-calendar-row">' +
      '<span class="depths-reward-calendar-date">' + dateStr + '</span>' +
      '<span class="depths-reward-calendar-icon">' + entry.reward.icon + '</span> ' +
      '<span class="depths-reward-calendar-name">' + entry.reward.name + '</span>' +
      (owned ? ' <span class="depths-reward-preview-owned">\u2713</span>' : '') +
      '</div>';
  }
  cal.innerHTML = html;
  card.appendChild(cal);

  // Close on outside click
  function closeCalendar(e) {
    if (!cal.contains(e.target) && e.target !== card.querySelector('.depths-reward-calendar-btn')) {
      cal.remove();
      document.removeEventListener('click', closeCalendar);
    }
  }
  setTimeout(function () {
    document.addEventListener('click', closeCalendar);
  }, 0);
}

function _formatWeekDate(date) {
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[date.getUTCMonth()] + ' ' + date.getUTCDate();
}
