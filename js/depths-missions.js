// Dungeon-specific daily and weekly missions — 5 templates with progress tracking.
//
// Hooks into dungeon session events (depths-session.js) and the existing
// mission display system (missions.js).
//
// Requires: missions.js (renderMissionsPanel, renderMenuMissionsPanel, _showMissionCompleteToast)
//           stats.js (loadLifetimeStats, saveLifetimeStats, checkLevelUp, updateLevelBadgeHUD)
//           depths-state.js (getDungeonSession, getDungeonSessionSummary)
// Used by:  depths-session.js (event hooks)

var DEPTHS_MISSIONS_KEY = 'mineCtris_depths_missions';
var DUNGEON_STATS_KEY_REF = 'mineCtris_dungeon_stats'; // read-only ref

// ── Mission Templates ────────────────────────────────────────────────────────

var DEPTHS_MISSION_TEMPLATES = [
  // Daily — easy
  {
    id:          'dm_clear_3_floors',
    title:       'Clear 3 dungeon floors',
    description: 'Clear 3 floors across any dungeon runs today.',
    difficulty:  'easy',
    period:      'daily',
    metric:      'dungeon_floors_cleared',
    target:      3,
    rewardXP:    50,
    rewardLoot:  { rarity: 'common', count: 1 },
  },
  // Daily — medium
  {
    id:          'dm_defeat_any_boss',
    title:       'Defeat any boss',
    description: 'Defeat a boss encounter in The Depths.',
    difficulty:  'medium',
    period:      'daily',
    metric:      'dungeon_bosses_defeated',
    target:      1,
    rewardXP:    100,
    rewardLoot:  { rarity: 'uncommon', count: 1 },
  },
  // Daily — medium
  {
    id:          'dm_extract_5_items',
    title:       'Extract with 5+ items',
    description: 'Successfully extract from a dungeon run carrying 5 or more loot items.',
    difficulty:  'medium',
    period:      'daily',
    metric:      'dungeon_extract_items_best',
    target:      5,
    rewardXP:    100,
    rewardLoot:  { rarity: 'uncommon', count: 1 },
  },
  // Weekly — hard
  {
    id:          'dm_reach_floor_7',
    title:       'Reach floor 7+',
    description: 'Reach floor 7 or deeper in a single dungeon run this week.',
    difficulty:  'hard',
    period:      'weekly',
    metric:      'dungeon_best_floor_reached',
    target:      7,
    rewardXP:    300,
    rewardLoot:  { rarity: 'rare', count: 1 },
  },
  // Weekly — hard
  {
    id:          'dm_speedrun_8min',
    title:       'Complete a run in under 8 minutes',
    description: 'Complete or extract from a dungeon run in under 8 minutes this week.',
    difficulty:  'hard',
    period:      'weekly',
    metric:      'dungeon_fastest_run_ms',
    target:      480000, // 8 minutes in ms
    rewardXP:    300,
    rewardLoot:  { rarity: 'rare', count: 1 },
  },
];

// ── Date / week helpers ──────────────────────────────────────────────────────

function _dmTodayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function _dmWeekKeyUTC() {
  var now = new Date();
  var d   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  var day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var weekNum   = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + '-W' + weekNum;
}

// ── Storage ──────────────────────────────────────────────────────────────────

function _dmLoad() {
  try {
    var raw = localStorage.getItem(DEPTHS_MISSIONS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function _dmSave(state) {
  try { localStorage.setItem(DEPTHS_MISSIONS_KEY, JSON.stringify(state)); } catch (_) {}
}

function _dmDefaultProgress() {
  return {
    dungeon_floors_cleared:     0,
    dungeon_bosses_defeated:    0,
    dungeon_extract_items_best: 0,
    dungeon_best_floor_reached: 0,
    dungeon_fastest_run_ms:     null,  // null = no run yet (lower-is-better)
  };
}

// ── Unlock gate ──────────────────────────────────────────────────────────────

/** Dungeon missions unlock after the player has completed at least 1 dungeon run. */
function _dmIsUnlocked() {
  try {
    var stats = JSON.parse(localStorage.getItem(DUNGEON_STATS_KEY_REF) || '{}');
    return (stats.totalRuns || 0) >= 1;
  } catch (_) { return false; }
}

// ── Initialization ───────────────────────────────────────────────────────────

/**
 * Initialize dungeon missions. Resets daily metrics at midnight UTC,
 * weekly metrics on Monday midnight UTC.
 */
function initDepthsMissions() {
  if (!_dmIsUnlocked()) return;

  var today   = _dmTodayUTC();
  var weekKey = _dmWeekKeyUTC();
  var state   = _dmLoad();

  var needsSave = false;

  if (!state) {
    state = {
      date:       today,
      weekKey:    weekKey,
      progress:   _dmDefaultProgress(),
      completed:  [],
      xpEarned:   0,
    };
    needsSave = true;
  }

  // Daily reset: clear daily metrics if the date rolled over
  if (state.date !== today) {
    var oldCompleted = state.completed;
    state.date      = today;
    state.progress.dungeon_floors_cleared     = 0;
    state.progress.dungeon_bosses_defeated    = 0;
    state.progress.dungeon_extract_items_best = 0;
    // Remove completed daily mission ids
    state.completed = oldCompleted.filter(function (id) {
      var tpl = _dmGetTemplate(id);
      return tpl && tpl.period === 'weekly';
    });
    needsSave = true;
  }

  // Weekly reset: clear weekly metrics if the week rolled over
  if (state.weekKey !== weekKey) {
    state.weekKey   = weekKey;
    state.progress.dungeon_best_floor_reached = 0;
    state.progress.dungeon_fastest_run_ms     = null;
    // Remove completed weekly mission ids
    state.completed = state.completed.filter(function (id) {
      var tpl = _dmGetTemplate(id);
      return tpl && tpl.period === 'daily';
    });
    state.xpEarned = 0;
    needsSave = true;
  }

  if (needsSave) _dmSave(state);

  renderDepthsMissionsPanel();
}

// ── Template lookup ──────────────────────────────────────────────────────────

function _dmGetTemplate(id) {
  for (var i = 0; i < DEPTHS_MISSION_TEMPLATES.length; i++) {
    if (DEPTHS_MISSION_TEMPLATES[i].id === id) return DEPTHS_MISSION_TEMPLATES[i];
  }
  return null;
}

// ── Metric update ────────────────────────────────────────────────────────────

/**
 * Update a dungeon mission metric and check for completions.
 * @param {string} metric
 * @param {number} value
 * @param {'add'|'max'|'min_positive'} op
 */
function _dmUpdateMetric(metric, value, op) {
  if (!_dmIsUnlocked()) return;

  var state = _dmLoad();
  if (!state) return;

  var prog    = state.progress;
  var changed = false;

  if (op === 'add') {
    prog[metric] = (prog[metric] || 0) + value;
    changed = true;
  } else if (op === 'max') {
    if ((prog[metric] || 0) < value) {
      prog[metric] = value;
      changed = true;
    }
  } else if (op === 'min_positive') {
    // lower-is-better; null means no run yet
    if (prog[metric] === null || prog[metric] === undefined || value < prog[metric]) {
      prog[metric] = value;
      changed = true;
    }
  }

  if (!changed) return;

  // Check newly completed missions
  for (var i = 0; i < DEPTHS_MISSION_TEMPLATES.length; i++) {
    var tpl = DEPTHS_MISSION_TEMPLATES[i];
    if (state.completed.indexOf(tpl.id) !== -1) continue;
    if (tpl.metric !== metric) continue;

    var met = false;
    if (tpl.id === 'dm_speedrun_8min') {
      // lower-is-better
      met = prog[metric] !== null && prog[metric] <= tpl.target;
    } else {
      met = (prog[metric] || 0) >= tpl.target;
    }

    if (met) {
      state.completed.push(tpl.id);
      state.xpEarned += tpl.rewardXP;
      _dmAwardReward(tpl);
    }
  }

  _dmSave(state);
  renderDepthsMissionsPanel();
}

// ── Reward granting ──────────────────────────────────────────────────────────

function _dmAwardReward(template) {
  // Award XP
  if (typeof loadLifetimeStats === 'function') {
    var stats = loadLifetimeStats();
    var oldXP = stats.playerXP || 0;
    stats.playerXP = oldXP + template.rewardXP;
    if (typeof saveLifetimeStats === 'function') saveLifetimeStats(stats);
    if (typeof checkLevelUp === 'function') checkLevelUp(oldXP, stats.playerXP);
    if (typeof updateLevelBadgeHUD === 'function') updateLevelBadgeHUD();
  }

  // Award bonus loot via dungeon inventory
  if (template.rewardLoot && typeof rollDepthsFloorLoot === 'function') {
    // Roll a single item of the specified rarity from the depths loot pool
    var session = typeof getDungeonSession === 'function' ? getDungeonSession() : null;
    var tier = (session && session.tier) || 'shallow';
    if (typeof _lootPoolByRarity !== 'undefined' && typeof _depthsPoolByRarity !== 'undefined') {
      var pool = _depthsPoolByRarity[template.rewardLoot.rarity] || [];
      if (pool.length > 0) {
        var item = pool[Math.floor(Math.random() * pool.length)];
        if (typeof addDungeonLoot === 'function') addDungeonLoot(item.id, 1);
      }
    }
  }

  // Show toast
  if (typeof _showMissionCompleteToast === 'function') {
    _showMissionCompleteToast(template.title, template.rewardXP, template.difficulty);
  }

  // Award guild XP
  if (typeof awardGuildXP === 'function') {
    awardGuildXP('daily_mission');
  }
}

// ── Event hooks (called from depths-session.js) ──────────────────────────────

/** Called when a dungeon floor is cleared. */
function onDepthsMissionFloorCleared() {
  _dmUpdateMetric('dungeon_floors_cleared', 1, 'add');
}

/** Called when a dungeon boss is defeated. */
function onDepthsMissionBossDefeated() {
  _dmUpdateMetric('dungeon_bosses_defeated', 1, 'add');
}

/**
 * Called when the player extracts from a dungeon. Tracks best single-run loot count.
 * @param {number} itemCount  Number of loot items extracted.
 */
function onDepthsMissionExtract(itemCount) {
  _dmUpdateMetric('dungeon_extract_items_best', itemCount, 'max');
}

/**
 * Called when a floor is cleared. Tracks deepest floor reached.
 * @param {number} floorNum  The floor number just cleared (1-based).
 */
function onDepthsMissionFloorReached(floorNum) {
  _dmUpdateMetric('dungeon_best_floor_reached', floorNum, 'max');
}

/**
 * Called when a dungeon run ends (extract or complete). Tracks fastest completion.
 * @param {number} totalTimeMs  Total run time in milliseconds.
 */
function onDepthsMissionRunComplete(totalTimeMs) {
  _dmUpdateMetric('dungeon_fastest_run_ms', totalTimeMs, 'min_positive');
}

// ── Panel rendering ──────────────────────────────────────────────────────────

/** Render dungeon missions into the mission board (appended after daily missions). */
function renderDepthsMissionsPanel() {
  var section = document.getElementById('depths-missions-section');
  if (!_dmIsUnlocked()) {
    if (section) section.style.display = 'none';
    return;
  }
  if (section) section.style.display = '';

  var el = document.getElementById('depths-missions-body');
  if (!el) return;

  var state = _dmLoad();
  if (!state) {
    el.innerHTML = '';
    return;
  }

  var diffLabel = { easy: 'EASY', medium: 'MED', hard: 'HARD' };
  var diffColor = { easy: '#4ade80', medium: '#facc15', hard: '#f87171' };
  var periodLabel = { daily: 'DAILY', weekly: 'WEEKLY' };

  var html = '';

  for (var i = 0; i < DEPTHS_MISSION_TEMPLATES.length; i++) {
    var tpl    = DEPTHS_MISSION_TEMPLATES[i];
    var isDone = state.completed.indexOf(tpl.id) !== -1;
    var val    = state.progress[tpl.metric];
    var pct    = 0;
    var valDisplay = '';

    if (tpl.id === 'dm_speedrun_8min') {
      // Lower-is-better time display
      if (val !== null && val !== undefined) {
        var totalSecs = Math.floor(val / 1000);
        var m = Math.floor(totalSecs / 60).toString().padStart(2, '0');
        var s = (totalSecs % 60).toString().padStart(2, '0');
        valDisplay = m + ':' + s;
        pct = isDone ? 100 : Math.min(99, Math.max(0, Math.round((1 - (val - tpl.target) / tpl.target) * 100)));
      } else {
        valDisplay = '--:--';
      }
    } else {
      var cur = val || 0;
      pct = isDone ? 100 : Math.min(100, Math.round((cur / tpl.target) * 100));
      valDisplay = cur + ' / ' + tpl.target;
    }

    var doneClass = isDone ? ' mission-card-done' : '';
    var dLabel    = diffLabel[tpl.difficulty] || tpl.difficulty.toUpperCase();
    var dColor    = diffColor[tpl.difficulty] || '#fff';
    var pLabel    = periodLabel[tpl.period] || '';

    html +=
      '<div class="mission-card' + doneClass + '">' +
        '<div class="mission-card-header">' +
          '<span class="mission-diff-badge" style="color:' + dColor + '">' + dLabel + '</span>' +
          '<span class="mission-period-badge">' + pLabel + '</span>' +
          '<span class="mission-xp-badge">+' + tpl.rewardXP + ' XP</span>' +
          (isDone ? '<span class="mission-done-check">&#10003;</span>' : '') +
        '</div>' +
        '<div class="mission-text">' + tpl.title + '</div>' +
        '<div class="mission-progress-row">' +
          '<div class="mission-progress-bar"><div class="mission-progress-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="mission-progress-val">' + valDisplay + '</span>' +
        '</div>' +
      '</div>';
  }

  el.innerHTML = html;
}

// ── Auto-init on page load ───────────────────────────────────────────────────

(function () {
  function _bootDepthsMissions() {
    initDepthsMissions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _bootDepthsMissions);
  } else {
    setTimeout(_bootDepthsMissions, 0);
  }
}());
