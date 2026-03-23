// Mastery System — tracking engine, data model, and challenge definitions.
// 8 modes × 5 tiers (Bronze → Silver → Gold → Diamond → Obsidian) = 40 challenges.
//
// Requires: (none — pure localStorage + optional notification DOM)
// Called by: gamestate.js, sprint.js, blitz.js, main.js, infinite-depths.js,
//            expedition-session.js, depths-transition.js, depths-floor-gen.js
//
// Storage key: mineCtris_mastery
// Schema: { classic: { tier, progress }, sprint: { tier, progress }, … }

const MASTERY_STORAGE_KEY = 'mineCtris_mastery';

// Tier names and point values
const MASTERY_TIER_NAMES  = ['bronze', 'silver', 'gold', 'diamond', 'obsidian'];
const MASTERY_TIER_POINTS = { bronze: 1, silver: 2, gold: 3, diamond: 4, obsidian: 5 };
const MASTERY_TIER_ICONS  = { bronze: '🥉', silver: '🥈', gold: '🥇', diamond: '💎', obsidian: '⬛' };

// All 8 mode keys
const MASTERY_MODES = ['classic', 'sprint', 'blitz', 'daily', 'survival', 'battle', 'expedition', 'depths'];

// ── Challenge definitions ─────────────────────────────────────────────────────
// Each challenge: { mode, tier (1-5), tierName, desc, check(progress) → bool }
// check() is called with the mode's accumulated progress object; returns true if met.
// Tier ordering is enforced externally (must unlock tier N before N+1 is checked).

var MASTERY_CHALLENGES = {

  classic: [
    {
      tier: 1, tierName: 'bronze',
      desc: 'Clear 50 lines in a single game',
      check: function (p) { return p.bestLines >= 50; },
    },
    {
      tier: 2, tierName: 'silver',
      desc: 'Score 25,000+ in a single game',
      check: function (p) { return p.bestScore >= 25000; },
    },
    {
      tier: 3, tierName: 'gold',
      desc: 'Achieve a 10+ combo chain',
      check: function (p) { return p.bestCombo >= 10; },
    },
    {
      tier: 4, tierName: 'diamond',
      desc: 'Score 50,000+ with Diamond Pickaxe crafted in-game',
      check: function (p) { return p.bestScoreWithDiamond >= 50000; },
    },
    {
      tier: 5, tierName: 'obsidian',
      desc: 'Survive 10+ difficulty tiers (10 minutes at escalating speed)',
      check: function (p) { return p.bestTier >= 10 && p.bestTimeSeconds >= 600; },
    },
  ],

  sprint: [
    {
      tier: 1, tierName: 'bronze',
      desc: 'Complete 10 Sprint games',
      check: function (p) { return p.completions >= 10; },
    },
    {
      tier: 2, tierName: 'silver',
      desc: 'Finish under 2:00',
      check: function (p) { return p.bestTimeMs > 0 && p.bestTimeMs <= 120000; },
    },
    {
      tier: 3, tierName: 'gold',
      desc: 'Finish under 1:30',
      check: function (p) { return p.bestTimeMs > 0 && p.bestTimeMs <= 90000; },
    },
    {
      tier: 4, tierName: 'diamond',
      desc: 'Finish under 1:15',
      check: function (p) { return p.bestTimeMs > 0 && p.bestTimeMs <= 75000; },
    },
    {
      tier: 5, tierName: 'obsidian',
      desc: 'Finish under 1:00',
      check: function (p) { return p.bestTimeMs > 0 && p.bestTimeMs <= 60000; },
    },
  ],

  blitz: [
    {
      tier: 1, tierName: 'bronze',
      desc: 'Complete 10 Blitz games',
      check: function (p) { return p.completions >= 10; },
    },
    {
      tier: 2, tierName: 'silver',
      desc: 'Score 10,000+ in a single Blitz',
      check: function (p) { return p.bestScore >= 10000; },
    },
    {
      tier: 3, tierName: 'gold',
      desc: 'Score 15,000+ in a single Blitz',
      check: function (p) { return p.bestScore >= 15000; },
    },
    {
      tier: 4, tierName: 'diamond',
      desc: 'Score 20,000+ with at least 5 combos',
      check: function (p) { return p.bestScoreWithCombos >= 20000; },
    },
    {
      tier: 5, tierName: 'obsidian',
      desc: 'Score 25,000+ in a single Blitz',
      check: function (p) { return p.bestScore >= 25000; },
    },
  ],

  daily: [
    {
      tier: 1, tierName: 'bronze',
      desc: 'Complete 7 daily challenges',
      check: function (p) { return p.completions >= 7; },
    },
    {
      tier: 2, tierName: 'silver',
      desc: 'Complete 14 daily challenges with top-50% score',
      check: function (p) { return p.top50Count >= 14; },
    },
    {
      tier: 3, tierName: 'gold',
      desc: 'Achieve #1 on any daily leaderboard',
      check: function (p) { return p.firstPlaceCount >= 1; },
    },
    {
      tier: 4, tierName: 'diamond',
      desc: 'Complete 30 daily challenges',
      check: function (p) { return p.completions >= 30; },
    },
    {
      tier: 5, tierName: 'obsidian',
      desc: 'Achieve #1 on 5 different daily leaderboards',
      check: function (p) { return p.firstPlaceCount >= 5; },
    },
  ],

  survival: [
    {
      tier: 1, tierName: 'bronze',
      desc: 'Survive 5 minutes in Survival mode',
      check: function (p) { return p.bestTimeSeconds >= 300; },
    },
    {
      tier: 2, tierName: 'silver',
      desc: 'Build a world with 100+ placed blocks',
      check: function (p) { return p.bestBlocksPlaced >= 100; },
    },
    {
      tier: 3, tierName: 'gold',
      desc: 'Survive 15 minutes in a single session',
      check: function (p) { return p.bestTimeSeconds >= 900; },
    },
    {
      tier: 4, tierName: 'diamond',
      desc: 'Craft a Diamond Pickaxe in Survival',
      check: function (p) { return p.diamondPickaxeCrafted === true; },
    },
    {
      tier: 5, tierName: 'obsidian',
      desc: 'Survive 30 minutes with 200+ placed blocks',
      check: function (p) { return p.bestTimeSeconds >= 1800 && p.bestBlocksPlaced >= 200; },
    },
  ],

  battle: [
    {
      tier: 1, tierName: 'bronze',
      desc: 'Win 5 Battle matches',
      check: function (p) { return p.wins >= 5; },
    },
    {
      tier: 2, tierName: 'silver',
      desc: 'Reach Iron rank (1000 rating)',
      check: function (p) { return p.peakRating >= 1000; },
    },
    {
      tier: 3, tierName: 'gold',
      desc: 'Reach Gold rank (1200 rating)',
      check: function (p) { return p.peakRating >= 1200; },
    },
    {
      tier: 4, tierName: 'diamond',
      desc: 'Reach Diamond rank (1400 rating)',
      check: function (p) { return p.peakRating >= 1400; },
    },
    {
      tier: 5, tierName: 'obsidian',
      desc: 'Reach Obsidian rank (1600+ rating)',
      check: function (p) { return p.peakRating >= 1600; },
    },
  ],

  expedition: [
    {
      tier: 1, tierName: 'bronze',
      desc: 'Complete one expedition run in each biome',
      check: function (p) {
        return p.biomesCompleted && p.biomesCompleted.stone && p.biomesCompleted.forest &&
               p.biomesCompleted.nether && p.biomesCompleted.ice;
      },
    },
    {
      tier: 2, tierName: 'silver',
      desc: 'Reach tier 5 in any biome reward track',
      check: function (p) { return p.maxBiomeTier >= 5; },
    },
    {
      tier: 3, tierName: 'gold',
      desc: 'Reach tier 10 in any biome reward track',
      check: function (p) { return p.maxBiomeTier >= 10; },
    },
    {
      tier: 4, tierName: 'diamond',
      desc: 'Reach tier 10 in 2+ biome reward tracks',
      check: function (p) { return p.biomesAtTier10 >= 2; },
    },
    {
      tier: 5, tierName: 'obsidian',
      desc: 'Reach tier 15 (Master) in any biome',
      check: function (p) { return p.maxBiomeTier >= 15; },
    },
  ],

  depths: [
    {
      tier: 1, tierName: 'bronze',
      desc: 'Complete Shallow tier (Shallow Mines)',
      check: function (p) { return p.shallowComplete === true; },
    },
    {
      tier: 2, tierName: 'silver',
      desc: 'Complete Deep tier (Deep Caverns)',
      check: function (p) { return p.deepComplete === true; },
    },
    {
      tier: 3, tierName: 'gold',
      desc: 'Complete Abyssal tier (Abyssal Rift)',
      check: function (p) { return p.abyssalComplete === true; },
    },
    {
      tier: 4, tierName: 'diamond',
      desc: 'Defeat all 3 bosses (Creep, Furnace, Wither Storm) in clean runs',
      check: function (p) {
        return p.bossesBeatenClean && p.bossesBeatenClean.the_creep &&
               p.bossesBeatenClean.the_furnace && p.bossesBeatenClean.the_wither_storm;
      },
    },
    {
      tier: 5, tierName: 'obsidian',
      desc: 'Reach floor 28 in Infinite Depths (Descent 4 complete)',
      check: function (p) { return p.maxDescentCompleted >= 4; },
    },
  ],
};

// ── Persistence ───────────────────────────────────────────────────────────────

function loadMastery() {
  try {
    var raw = localStorage.getItem(MASTERY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function saveMastery(state) {
  try {
    localStorage.setItem(MASTERY_STORAGE_KEY, JSON.stringify(state));
  } catch (_) {}
}

/** Returns the mastery state for a mode, creating default if missing. */
function _getModeState(state, mode) {
  if (!state[mode]) {
    state[mode] = { tier: 0, progress: {} };
  }
  return state[mode];
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Returns the total mastery score across all modes.
 * Bronze=1, Silver=2, Gold=3, Diamond=4, Obsidian=5 per mode.
 */
function getMasteryScore() {
  var state = loadMastery();
  var total = 0;
  for (var i = 0; i < MASTERY_MODES.length; i++) {
    var mode = MASTERY_MODES[i];
    var ms = state[mode];
    if (ms && ms.tier > 0) {
      total += MASTERY_TIER_POINTS[MASTERY_TIER_NAMES[ms.tier - 1]] || 0;
    }
  }
  return total;
}

/**
 * Returns current tier number (0=none, 1=bronze…5=obsidian) for a mode.
 */
function getMasteryTier(mode) {
  var state = loadMastery();
  return state[mode] ? (state[mode].tier || 0) : 0;
}

// ── Unlock ────────────────────────────────────────────────────────────────────

/**
 * Unlock a mastery tier for a mode. Persists and shows notification.
 * No-ops if tier already unlocked or tier is not the next sequential tier.
 *
 * @param {string} mode      Mode key (e.g. 'classic')
 * @param {number} tier      Tier number 1-5
 */
function unlockMasteryTier(mode, tier) {
  var state = loadMastery();
  var ms = _getModeState(state, mode);

  // Must be the next sequential tier
  if (ms.tier >= tier) return;
  if (tier !== ms.tier + 1) return;

  ms.tier = tier;
  saveMastery(state);

  var tierName = MASTERY_TIER_NAMES[tier - 1] || '';
  var modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);

  // Unlock the cosmetic reward for this tier
  var cosmeticId = 'mastery_' + mode + '_' + tierName;
  if (typeof processUnlocks === 'function') processUnlocks();

  _showMasteryUnlockOverlay(modeLabel, tierName, cosmeticId);

  // Award guild XP for mastery tier unlock
  if (typeof awardGuildXP === 'function') {
    awardGuildXP('mastery_unlock');
  }

  // Submit updated mastery score to leaderboard worker
  _submitMasteryToLeaderboard();
}

// ── Notification ──────────────────────────────────────────────────────────────

// Mode icons for display
var MASTERY_MODE_ICONS = {
  classic:    '\uD83C\uDFAE',
  sprint:     '\u26A1',
  blitz:      '\uD83D\uDCA5',
  daily:      '\uD83D\uDCC5',
  survival:   '\uD83C\uDF32',
  battle:     '\u2694\uFE0F',
  expedition: '\uD83D\uDDFA\uFE0F',
  depths:     '\u26CF\uFE0F',
};

// Tier accent colors
var MASTERY_TIER_COLORS = {
  bronze:   '#cd7f32',
  silver:   '#c0c0c0',
  gold:     '#ffd700',
  diamond:  '#b9f2ff',
  obsidian: '#7c3aed',
};

function _showMasteryUnlockOverlay(modeLabel, tierName, cosmeticId) {
  var tierIcon  = MASTERY_TIER_ICONS[tierName] || '\u2B50';
  var tierLabel = tierName.charAt(0).toUpperCase() + tierName.slice(1);
  var tierColor = MASTERY_TIER_COLORS[tierName] || '#ffd700';
  var modeLower = modeLabel.toLowerCase();
  var modeIcon  = MASTERY_MODE_ICONS[modeLower] || '\uD83C\uDFAE';

  // Find cosmetic reward name
  var rewardName = '';
  if (typeof getCosmeticById === 'function' && cosmeticId) {
    var cos = getCosmeticById(cosmeticId);
    if (cos) rewardName = cos.name + ' (' + cos.category.replace('_', ' ') + ')';
  }

  // Build or reuse overlay
  var overlay = document.getElementById('mastery-unlock-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mastery-unlock-overlay';
    overlay.innerHTML =
      '<div class="muo-backdrop"></div>' +
      '<div class="muo-panel">' +
        '<div class="muo-mode-icon"></div>' +
        '<div class="muo-tier-icon"></div>' +
        '<div class="muo-header">MASTERY UNLOCKED</div>' +
        '<div class="muo-tier-label"></div>' +
        '<div class="muo-mode-label"></div>' +
        '<div class="muo-reward"></div>' +
        '<button class="muo-dismiss-btn">TAP TO CONTINUE</button>' +
      '</div>';
    document.body.appendChild(overlay);

    // Dismiss on button or backdrop click
    overlay.querySelector('.muo-dismiss-btn').addEventListener('click', function () {
      _hideMasteryUnlockOverlay();
    });
    overlay.querySelector('.muo-backdrop').addEventListener('click', function () {
      _hideMasteryUnlockOverlay();
    });
  }

  overlay.querySelector('.muo-mode-icon').textContent  = modeIcon;
  overlay.querySelector('.muo-tier-icon').textContent  = tierIcon;
  overlay.querySelector('.muo-tier-label').textContent = tierLabel;
  overlay.querySelector('.muo-mode-label').textContent = modeLabel + ' Mastery';
  overlay.querySelector('.muo-reward').textContent     = rewardName ? '\uD83C\uDF81 ' + rewardName : '';

  var panel = overlay.querySelector('.muo-panel');
  if (panel) panel.style.borderColor = tierColor;
  var header = overlay.querySelector('.muo-header');
  if (header) header.style.color = tierColor;

  // Play ascending chime
  _playMasteryChime(tierName);

  overlay.classList.remove('muo-visible');
  void overlay.offsetWidth;
  overlay.classList.add('muo-visible');

  // Auto-dismiss after 3 seconds
  clearTimeout(overlay._hideTimer);
  overlay._hideTimer = setTimeout(function () {
    _hideMasteryUnlockOverlay();
  }, 3000);
}

function _hideMasteryUnlockOverlay() {
  var overlay = document.getElementById('mastery-unlock-overlay');
  if (overlay) {
    clearTimeout(overlay._hideTimer);
    overlay.classList.remove('muo-visible');
  }
}

function _playMasteryChime(tierName) {
  try {
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    var ctx = new AudioCtx();

    // Ascending scale — more notes for higher tiers
    var tierIndex = ['bronze', 'silver', 'gold', 'diamond', 'obsidian'].indexOf(tierName);
    var noteCount = 3 + tierIndex; // 3-7 notes
    var baseFreq = 440;
    var scale    = [1, 1.125, 1.25, 1.333, 1.5, 1.667, 1.875, 2]; // major scale ratios
    var noteDur  = 0.12;
    var now = ctx.currentTime;

    for (var i = 0; i < noteCount; i++) {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = baseFreq * scale[i % scale.length];
      var t = now + i * noteDur;
      gain.gain.setValueAtTime(0.28, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + noteDur * 0.9);
      osc.start(t);
      osc.stop(t + noteDur);
    }
  } catch (_) {}
}

// ── Core progress checker ─────────────────────────────────────────────────────

/**
 * Check and unlock any newly-met mastery tiers for a mode.
 * Respects sequential ordering: only checks the next tier above the current one.
 *
 * @param {string} mode      Mode key
 * @param {object} gameStats Stats from the just-ended game/run (see mode hooks below)
 */
function checkMasteryProgress(mode, gameStats) {
  var challenges = MASTERY_CHALLENGES[mode];
  if (!challenges) return;

  var state = loadMastery();
  var ms = _getModeState(state, mode);

  // Merge incoming gameStats into persistent progress
  _mergeProgress(mode, ms.progress, gameStats);
  saveMastery(state);

  // Check challenges sequentially — stop at first unmet tier
  for (var i = 0; i < challenges.length; i++) {
    var challenge = challenges[i];
    if (challenge.tier <= ms.tier) continue; // already unlocked
    if (challenge.tier !== ms.tier + 1) break; // not the next sequential tier

    if (challenge.check(ms.progress)) {
      unlockMasteryTier(mode, challenge.tier);
      // Re-read state after potential unlock to continue checking next tier
      state = loadMastery();
      ms = _getModeState(state, mode);
    } else {
      break; // Sequential — stop checking once a tier fails
    }
  }
}

/**
 * Merge a gameStats snapshot into the persistent progress for a mode.
 * Only ever updates with better/higher values (best-of tracking).
 */
function _mergeProgress(mode, progress, stats) {
  if (!stats) return;

  if (mode === 'classic') {
    if (stats.linesCleared > (progress.bestLines || 0))         progress.bestLines = stats.linesCleared;
    if (stats.score > (progress.bestScore || 0))                progress.bestScore = stats.score;
    if (stats.maxCombo > (progress.bestCombo || 0))             progress.bestCombo = stats.maxCombo;
    if (stats.tier > (progress.bestTier || 0))                  progress.bestTier = stats.tier;
    if (stats.timeSeconds > (progress.bestTimeSeconds || 0))    progress.bestTimeSeconds = stats.timeSeconds;
    if (stats.diamondPickaxe && stats.score >= 50000) {
      if (stats.score > (progress.bestScoreWithDiamond || 0))   progress.bestScoreWithDiamond = stats.score;
    }
  }

  if (mode === 'sprint') {
    progress.completions = (progress.completions || 0) + 1;
    if (!progress.bestTimeMs || stats.timeMs < progress.bestTimeMs) progress.bestTimeMs = stats.timeMs;
  }

  if (mode === 'blitz') {
    progress.completions = (progress.completions || 0) + 1;
    if (stats.score > (progress.bestScore || 0))                progress.bestScore = stats.score;
    if (stats.score >= 20000 && stats.combos >= 5) {
      if (stats.score > (progress.bestScoreWithCombos || 0))    progress.bestScoreWithCombos = stats.score;
    }
  }

  if (mode === 'daily') {
    if (stats.completed) {
      progress.completions = (progress.completions || 0) + 1;
    }
    if (stats.isTop50) {
      progress.top50Count = (progress.top50Count || 0) + 1;
    }
    if (stats.isFirstPlace) {
      progress.firstPlaceCount = (progress.firstPlaceCount || 0) + 1;
    }
  }

  if (mode === 'survival') {
    if (stats.timeSeconds > (progress.bestTimeSeconds || 0))    progress.bestTimeSeconds = stats.timeSeconds;
    if (stats.blocksPlaced > (progress.bestBlocksPlaced || 0))  progress.bestBlocksPlaced = stats.blocksPlaced;
    if (stats.diamondPickaxe)                                   progress.diamondPickaxeCrafted = true;
  }

  if (mode === 'battle') {
    if (stats.wins !== undefined && stats.wins > (progress.wins || 0))        progress.wins = stats.wins;
    if (stats.rating !== undefined && stats.rating > (progress.peakRating || 0)) progress.peakRating = stats.rating;
  }

  if (mode === 'expedition') {
    if (!progress.biomesCompleted) progress.biomesCompleted = {};
    if (stats.biomeId) progress.biomesCompleted[stats.biomeId] = true;
    if (stats.maxBiomeTier > (progress.maxBiomeTier || 0))      progress.maxBiomeTier = stats.maxBiomeTier;
    if (stats.biomesAtTier10 > (progress.biomesAtTier10 || 0))  progress.biomesAtTier10 = stats.biomesAtTier10;
  }

  if (mode === 'depths') {
    if (stats.shallowComplete)                                  progress.shallowComplete = true;
    if (stats.deepComplete)                                     progress.deepComplete = true;
    if (stats.abyssalComplete)                                  progress.abyssalComplete = true;
    if (stats.bossId && stats.cleanRun) {
      if (!progress.bossesBeatenClean) progress.bossesBeatenClean = {};
      progress.bossesBeatenClean[stats.bossId] = true;
    }
    if (stats.descentCompleted > (progress.maxDescentCompleted || 0)) {
      progress.maxDescentCompleted = stats.descentCompleted;
    }
  }
}

// ── Mode-specific hooks ───────────────────────────────────────────────────────
// Call these from each mode's game-end handler.

/**
 * Call at the end of a classic, survival, or daily game (from gamestate.js showGameOver).
 * @param {object} opts  {
 *   score, linesCleared, maxCombo, difficultyTier, timeSeconds,
 *   pickaxeTier, isSurvivalMode, isDailyChallenge, blocksPlaced
 * }
 */
function masteryOnClassicEnd(opts) {
  var score        = opts.score        || 0;
  var linesCleared = opts.linesCleared || 0;
  var maxCombo     = opts.maxCombo     || 0;
  var tier         = opts.difficultyTier || 0;
  var timeSeconds  = opts.timeSeconds  || 0;
  var pickaxeTier  = opts.pickaxeTier  || 'none';
  var blocksPlaced = opts.blocksPlaced || 0;
  var hasDiamond   = (pickaxeTier === 'diamond' || pickaxeTier === 'obsidian');

  if (opts.isSurvivalMode) {
    checkMasteryProgress('survival', {
      timeSeconds:  timeSeconds,
      blocksPlaced: blocksPlaced,
      diamondPickaxe: hasDiamond,
    });
    return;
  }

  if (opts.isDailyChallenge) {
    checkMasteryProgress('daily', {
      completed:    true,
      isTop50:      false, // updated later by masteryOnDailyLeaderboardRank
      isFirstPlace: false,
    });
    return;
  }

  // Pure classic
  checkMasteryProgress('classic', {
    score:          score,
    linesCleared:   linesCleared,
    maxCombo:       maxCombo,
    tier:           tier,
    timeSeconds:    timeSeconds,
    diamondPickaxe: hasDiamond,
  });
}

/**
 * Call when sprint is completed (from sprint.js).
 * @param {number} finalTimeMs  Sprint finish time in milliseconds
 */
function masteryOnSprintComplete(finalTimeMs) {
  checkMasteryProgress('sprint', { timeMs: finalTimeMs });
}

/**
 * Call when blitz is completed (from blitz.js).
 * @param {number} finalScore  Final blitz score
 * @param {number} combos      Number of combos achieved this game
 */
function masteryOnBlitzComplete(finalScore, combos) {
  checkMasteryProgress('blitz', { score: finalScore || 0, combos: combos || 0 });
}

/**
 * Call when a battle result is received (from gamestate.js).
 * Reads current rating from loadBattleRating() directly.
 */
function masteryOnBattleResult() {
  if (typeof loadBattleRating !== 'function') return;
  var ratingData = loadBattleRating();
  checkMasteryProgress('battle', {
    wins:   ratingData.wins   || 0,
    rating: ratingData.rating || 1000,
  });
}

/**
 * Call when a daily leaderboard rank comes back from the server.
 * @param {number} rank         Player's rank (1 = first place)
 * @param {number} totalPlayers Total players on the leaderboard
 */
function masteryOnDailyLeaderboardRank(rank, totalPlayers) {
  var isTop50      = rank > 0 && totalPlayers > 0 && rank <= Math.ceil(totalPlayers / 2);
  var isFirstPlace = rank === 1;

  var state   = loadMastery();
  var ms      = _getModeState(state, 'daily');
  var prog    = ms.progress;

  if (isTop50)      prog.top50Count      = (prog.top50Count      || 0) + 1;
  if (isFirstPlace) prog.firstPlaceCount = (prog.firstPlaceCount || 0) + 1;

  saveMastery(state);
  checkMasteryProgress('daily', {}); // re-evaluate without changing counters again
}

/**
 * Call when an expedition run ends (from expedition-session.js showExpeditionResults).
 * @param {string} biomeId    The biome that was run (stone, forest, nether, ice)
 * @param {object} trackInfo  getBiomeTrackInfo(biomeId) result
 */
function masteryOnExpeditionEnd(biomeId, trackInfo) {
  if (!biomeId) return;

  // Collect current tier info for all 4 biomes to compute maxBiomeTier & biomesAtTier10
  var biomes = ['stone', 'forest', 'nether', 'ice'];
  var maxTier = 0;
  var tier10Count = 0;
  for (var i = 0; i < biomes.length; i++) {
    var info = (typeof getBiomeTrackInfo === 'function') ? getBiomeTrackInfo(biomes[i]) : null;
    var t = info ? (info.currentTier ? info.currentTier.tier : 1) : 1;
    if (t > maxTier) maxTier = t;
    if (t >= 10) tier10Count++;
  }

  checkMasteryProgress('expedition', {
    biomeId:       biomeId,
    maxBiomeTier:  maxTier,
    biomesAtTier10: tier10Count,
  });
}

/**
 * Call when a depths run ends (win or loss) — from depths-transition.js and depths-floor-gen.js.
 * @param {object} data  { score, linesCleared, blocksMined, timeSeconds, floorReached, runComplete }
 */
function masteryOnDepthsEnd(data) {
  if (!data) return;

  // Get session tier from getDungeonSessionSummary if available
  var summary = (typeof getDungeonSessionSummary === 'function') ? getDungeonSessionSummary() : null;
  var tier    = summary ? (summary.tier || '') : '';
  var died    = summary ? (summary.died || false) : false;
  var bossDefeated = summary ? (summary.bossDefeated || false) : false;

  // Which tier-level boss was defeated?
  var bossId = null;
  if (summary && summary.bossDefeated) {
    var dungeonDef = (typeof getDungeonDef === 'function') ? getDungeonDef(summary.dungeonId) : null;
    if (dungeonDef && dungeonDef.bossSlot) bossId = dungeonDef.bossSlot.bossId;
  }

  var cleanRun = data.runComplete && !died;

  checkMasteryProgress('depths', {
    shallowComplete: (tier === 'shallow' && data.runComplete === true),
    deepComplete:    (tier === 'deep'    && data.runComplete === true),
    abyssalComplete: (tier === 'abyssal' && data.runComplete === true),
    bossId:          bossId,
    cleanRun:        cleanRun,
    descentCompleted: 0, // infinite handled separately
  });
}

/**
 * Call when an Infinite Depths descent completes (from infinite-depths.js showInfiniteDescentScreen).
 * @param {number} descentNum  The Descent number just completed (1-based)
 */
function masteryOnInfiniteDescentComplete(descentNum) {
  checkMasteryProgress('depths', {
    descentCompleted: descentNum,
  });
}

/**
 * Call when a survival session ends (alias for masteryOnClassicEnd with isSurvivalMode=true).
 * Convenience hook for callers that track survival separately.
 * @param {object} opts  { timeSeconds, blocksPlaced, pickaxeTier }
 */
function masteryOnSurvivalEnd(opts) {
  var pickaxeTier = opts.pickaxeTier || 'none';
  checkMasteryProgress('survival', {
    timeSeconds:   opts.timeSeconds  || 0,
    blocksPlaced:  opts.blocksPlaced || 0,
    diamondPickaxe: (pickaxeTier === 'diamond' || pickaxeTier === 'obsidian'),
  });
}

// ── Leaderboard submission ─────────────────────────────────────────────────────

/**
 * Submit current mastery state to the global mastery leaderboard worker.
 * Called automatically on tier unlock. Requires loadDisplayName() from leaderboard.js.
 */
function _submitMasteryToLeaderboard() {
  if (typeof loadDisplayName !== 'function') return;
  var displayName = loadDisplayName();
  if (!displayName) return;

  var state = loadMastery();
  var totalScore = 0;
  var obsidianCount = 0;
  var tiers = {};

  for (var i = 0; i < MASTERY_MODES.length; i++) {
    var mode = MASTERY_MODES[i];
    var ms = state[mode];
    var tier = ms ? (ms.tier || 0) : 0;
    tiers[mode] = tier;
    if (tier > 0) {
      totalScore += MASTERY_TIER_POINTS[MASTERY_TIER_NAMES[tier - 1]] || 0;
      if (tier === 5) obsidianCount++;
    }
  }

  var workerUrl = (typeof LEADERBOARD_WORKER_URL !== 'undefined') ? LEADERBOARD_WORKER_URL : '';
  if (!workerUrl) return;

  fetch(workerUrl + '/api/mastery/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName:  displayName,
      totalScore:   totalScore,
      tiers:        tiers,
      obsidianCount: obsidianCount,
      timestamp:    new Date().toISOString(),
    }),
  }).catch(function () {}); // fire-and-forget
}
