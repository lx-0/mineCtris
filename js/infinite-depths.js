// Infinite Depths mode — cross-Descent run state management and lifecycle.
//
// An Infinite Depths run consists of back-to-back 7-floor Descents. After
// completing all 7 floors of a Descent (including defeating the Wither Storm
// on floor 7), the player chooses to Extract (bank all loot and end the run)
// or Go Deeper (bank current Descent loot and start the next Descent).
//
// Death penalty: dying loses all loot from the *current* Descent only.
//   Previously banked loot (from extracted Descents) is always kept.
//
// Requires: depths-state.js, depths-session.js, depths-config.js
// Used by:  main.js (launch), depths-session.js (hooks), depths-hud.js (HUD)

var INFINITE_DEPTHS_RUN_KEY           = 'mineCtris_infiniteDepths_run';
var INFINITE_DEPTHS_HIGHEST_FLOOR_KEY = 'mineCtris_infiniteDepths_highestFloor';

// In-memory run state. Null when no run is active.
var _infiniteRun = null;

// ── Unlock check ─────────────────────────────────────────────────────────────

/**
 * Returns true if the player has defeated The Wither Storm at least once.
 * Checks both the achievements store and dungeon stats.
 */
function isInfiniteDepthsUnlocked() {
  try {
    var achs = JSON.parse(localStorage.getItem('mineCtris_achievements') || '{}');
    if (achs['depths_wither_slayer']) return true;
  } catch (_) {}
  try {
    var stats = JSON.parse(localStorage.getItem('mineCtris_dungeon_stats') || '{}');
    if (stats.witherStormDefeated) return true;
  } catch (_) {}
  return false;
}

// ── Run lifecycle ─────────────────────────────────────────────────────────────

/**
 * Launch (or resume) an Infinite Depths run.
 * Attempts to resume a saved in-progress run; falls back to fresh start.
 * Returns true on success, false if the dungeon session could not be started.
 */
function launchInfiniteDepthsSession() {
  // Resume saved run if one exists and is still active
  var saved = loadInfiniteRunState();
  if (saved && !saved.extracted && !saved.died) {
    _infiniteRun = saved;
  } else {
    _infiniteRun = {
      descentNum:         1,
      bankedLoot:         [],
      speedMultiplier:    1.0,
      startedAt:          Date.now(),
      extracted:          false,
      died:               false,
    };
  }

  var success = launchDungeonSession('infinite_descent', null);
  if (!success) {
    _infiniteRun = null;
    return false;
  }

  saveInfiniteRunState();

  // Start depth-scaling ambient audio
  if (typeof updateInfiniteDepthsAudio === 'function') {
    updateInfiniteDepthsAudio(_infiniteRun.descentNum);
  }

  return true;
}

/**
 * Returns the active infinite run object, or null if none.
 */
function getInfiniteRun() {
  return _infiniteRun;
}

/**
 * Returns true when an infinite run is active.
 */
function isInfiniteMode() {
  return _infiniteRun !== null;
}

// ── Descent progression ───────────────────────────────────────────────────────

/**
 * Bank the current Descent's loot and start the next Descent.
 * Called when the player chooses "Go Deeper" after completing a Descent.
 * Returns true on success.
 */
function advanceInfiniteDescend() {
  if (!_infiniteRun) return false;

  // Bank all loot collected in this Descent
  var descentLoot = (typeof getDungeonLoot === 'function') ? getDungeonLoot() : [];
  for (var i = 0; i < descentLoot.length; i++) {
    _infiniteRun.bankedLoot.push(descentLoot[i]);
  }

  _infiniteRun.descentNum++;
  _infiniteRun.speedMultiplier = _calcSpeedMult(_infiniteRun.descentNum);

  saveInfiniteRunState();

  // Update depth-scaling ambient audio for new descent
  if (typeof updateInfiniteDepthsAudio === 'function') {
    updateInfiniteDepthsAudio(_infiniteRun.descentNum);
  }

  // Reset the dungeon session and start the next Descent
  if (typeof clearDungeonSession === 'function') clearDungeonSession();
  var success = launchDungeonSession('infinite_descent', null);
  return success;
}

/**
 * Speed multiplier: Base speed × (1 + 0.15 × N), capped at 3.0x.
 * Descent 1 = 1.15x, Descent 5 = 1.75x, Descent 10 = 2.5x.
 */
function _calcSpeedMult(descentNum) {
  return Math.min(3.0, 1.0 + descentNum * 0.15);
}

/**
 * Returns the current gravity multiplier bonus from Descent scaling.
 * Applied on top of the floor's base gravity multiplier.
 */
function getInfiniteSpeedMult() {
  return _infiniteRun ? _infiniteRun.speedMultiplier : 1.0;
}

/**
 * Returns the complete difficulty scaling parameters for a given Descent number.
 * All Infinite Depths scaling rules are consolidated here.
 *
 * @param {number} descentNum  1-based Descent number
 * @returns {object} {
 *   speedMultiplier,      — gravity mult on top of floor base (1.15x at D1, cap 3.0x)
 *   modifierCount,        — number of modifiers to roll per non-boss floor (2 at D1, cap 7)
 *   hazardDensityBonus,   — fractional bonus on hazard weights (0.05 at D1, cap 1.0 = +100%)
 *   bossPhaseBonus,       — extra phases added to boss beyond default (0 at D1, cap 2)
 *   clearConditionBonus,  — extra lines/blocks added to clear conditions (0 at D1, +1/descent)
 * }
 */
function getInfiniteScaling(descentNum) {
  var n = Math.max(1, descentNum | 0);
  return {
    speedMultiplier:     Math.min(3.0, 1.0 + n * 0.15),
    modifierCount:       Math.min(7, n + 1),
    hazardDensityBonus:  Math.min(1.0, n * 0.05),
    bossPhaseBonus:      Math.min(2, n - 1),
    clearConditionBonus: n - 1,
  };
}

// ── Extraction ────────────────────────────────────────────────────────────────

/**
 * Extract from the entire run: bank current Descent loot + mark run extracted.
 * Called when the player chooses "Extract" at any inter-floor or inter-Descent screen.
 */
function extractInfiniteRun() {
  if (!_infiniteRun) return;

  var descentLoot = (typeof getDungeonLoot === 'function') ? getDungeonLoot() : [];
  for (var i = 0; i < descentLoot.length; i++) {
    _infiniteRun.bankedLoot.push(descentLoot[i]);
  }

  _infiniteRun.extracted = true;
  _infiniteRun.extractedAt = Date.now();
  saveInfiniteRunState();

  // Extraction success audio + stop depth ambient
  if (typeof playExtractionSuccess === 'function') playExtractionSuccess();
  if (typeof stopInfiniteDepthsAudio === 'function') stopInfiniteDepthsAudio();
  if (typeof stopEntropyAmbient === 'function') stopEntropyAmbient();
}

/**
 * Returns all loot banked from previously completed Descents.
 */
function getInfiniteBankedLoot() {
  return _infiniteRun ? _infiniteRun.bankedLoot : [];
}

// ── Death handling ────────────────────────────────────────────────────────────

/**
 * Mark the run as ended by death. The current Descent's loot is forfeited.
 * Banked loot from previous Descents is already persisted and is never lost.
 */
function onInfiniteDescentDeath() {
  if (!_infiniteRun) return;
  _infiniteRun.died = true;
  saveInfiniteRunState();
  // Note: current session loot is forfeit (never banked); only _infiniteRun.bankedLoot is safe.

  // Stop depth ambient audio on death
  if (typeof stopInfiniteDepthsAudio === 'function') stopInfiniteDepthsAudio();
  if (typeof stopEntropyAmbient === 'function') stopEntropyAmbient();
}

// ── Persistence ───────────────────────────────────────────────────────────────

function saveInfiniteRunState() {
  if (!_infiniteRun) return;
  try {
    localStorage.setItem(INFINITE_DEPTHS_RUN_KEY, JSON.stringify(_infiniteRun));
  } catch (_) {}
}

function loadInfiniteRunState() {
  try {
    var raw = localStorage.getItem(INFINITE_DEPTHS_RUN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function clearInfiniteRunState() {
  _infiniteRun = null;
  try { localStorage.removeItem(INFINITE_DEPTHS_RUN_KEY); } catch (_) {}
}

// ── Milestone cosmetic tracking ───────────────────────────────────────────────

/**
 * Returns the all-time highest Infinite Depths floor reached (persistent).
 * Each completed Descent contributes descentNum × 7 floors.
 * @returns {number}
 */
function getInfiniteHighestFloor() {
  try {
    return parseInt(localStorage.getItem(INFINITE_DEPTHS_HIGHEST_FLOOR_KEY) || '0', 10);
  } catch (_) {
    return 0;
  }
}

/**
 * Update persistent highest floor if the new value is greater.
 * @param {number} floor
 */
function _updateInfiniteHighestFloor(floor) {
  try {
    var prev = getInfiniteHighestFloor();
    if (floor > prev) {
      localStorage.setItem(INFINITE_DEPTHS_HIGHEST_FLOOR_KEY, String(floor));
    }
  } catch (_) {}
}

/**
 * Check for newly unlocked Infinite Depths milestone cosmetics and award them.
 * Shows an unlock notification for each newly awarded cosmetic.
 * Idempotent — already-unlocked cosmetics are skipped by processUnlocks().
 */
function checkInfiniteDepthsMilestones() {
  if (typeof processUnlocks !== 'function') return;
  var newlyUnlocked = processUnlocks();
  for (var i = 0; i < newlyUnlocked.length; i++) {
    if (newlyUnlocked[i].source === 'free_progression') {
      _showInfiniteDepthsCosmeticUnlock(newlyUnlocked[i]);
    }
  }
}

/**
 * Show a cosmetic unlock notification for an Infinite Depths milestone reward.
 * Uses the achievement toast element if available, otherwise creates a simple overlay.
 * @param {object} cosmetic — a COSMETIC_REGISTRY entry
 */
function _showInfiniteDepthsCosmeticUnlock(cosmetic) {
  var rarityColors = {
    common:    '#9ca3af',
    rare:      '#60a5fa',
    epic:      '#a78bfa',
    legendary: '#fbbf24',
  };
  var categoryLabels = {
    block_skin:     'Block Skin',
    trail:          'Trail',
    landing_effect: 'Landing Effect',
    border:         'Border',
    title:          'Title',
  };

  var color = rarityColors[cosmetic.rarity] || '#fbbf24';
  var catLabel = categoryLabels[cosmetic.category] || cosmetic.category;

  // Reuse or create a dedicated depths-cosmetic-unlock overlay
  var overlay = document.getElementById('infinite-depths-cosmetic-unlock');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'infinite-depths-cosmetic-unlock';
    overlay.style.cssText = [
      'position:fixed',
      'top:50%',
      'left:50%',
      'transform:translate(-50%,-50%)',
      'background:rgba(10,10,20,0.97)',
      'border:2px solid #fbbf24',
      'border-radius:12px',
      'padding:32px 40px',
      'text-align:center',
      'z-index:9999',
      'pointer-events:none',
      'opacity:0',
      'transition:opacity 0.4s ease',
      'min-width:280px',
    ].join(';');
    document.body.appendChild(overlay);
  }

  overlay.style.borderColor = color;
  overlay.innerHTML =
    '<div style="font-size:2em;margin-bottom:8px">&#8734;</div>' +
    '<div style="font-size:0.65em;letter-spacing:0.15em;color:#6ee7b7;margin-bottom:6px">INFINITE DEPTHS MILESTONE</div>' +
    '<div style="font-size:0.75em;letter-spacing:0.12em;color:#d1d5db;margin-bottom:10px">COSMETIC UNLOCKED</div>' +
    '<div style="font-size:1.1em;font-weight:bold;color:' + color + ';margin-bottom:4px">' + cosmetic.name + '</div>' +
    '<div style="font-size:0.6em;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em">' +
      cosmetic.rarity + ' &bull; ' + catLabel +
    '</div>';

  // Fade in, hold, fade out
  overlay.style.opacity = '0';
  void overlay.offsetWidth;
  overlay.style.opacity = '1';
  clearTimeout(overlay._hideTimer);
  overlay._hideTimer = setTimeout(function () {
    overlay.style.opacity = '0';
  }, 3500);

  // Play a short chime
  try {
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      var ctx = new AudioCtx();
      var freqs = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
      var now = ctx.currentTime;
      for (var j = 0; j < freqs.length; j++) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freqs[j];
        var t = now + j * 0.13;
        gain.gain.setValueAtTime(0.22, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.start(t);
        osc.stop(t + 0.25);
      }
    }
  } catch (_) {}
}

// ── Extraction results screen ─────────────────────────────────────────────────

/**
 * Show the full run extraction results after the player extracts or dies.
 * Shows banked loot, total Descents reached, and a return-to-lobby button.
 *
 * @param {boolean} isDeath  True if triggered by death (vs. voluntary extract)
 */
function showInfiniteRunResults(isDeath) {
  if (typeof controls !== 'undefined' && controls && controls.isLocked) controls.unlock();

  var run = _infiniteRun;
  var descentNum  = run ? run.descentNum : 1;
  var bankedLoot  = run ? run.bankedLoot : [];

  // Overlay reuses the standard depths-results-overlay
  var overlay = document.getElementById('depths-results-overlay');
  if (!overlay) {
    // Fallback: return to menu directly
    if (typeof hideModeSelect !== 'undefined') {
      var blocker = document.getElementById('blocker');
      if (blocker) blocker.style.display = 'flex';
    }
    clearInfiniteRunState();
    if (typeof clearDungeonSession === 'function') clearDungeonSession();
    return;
  }

  var titleEl   = overlay.querySelector('.depths-results-title');
  var statsEl   = overlay.querySelector('.depths-results-stats');
  var upgradesEl = overlay.querySelector('.depths-results-upgrades');

  var title = isDeath
    ? 'FALLEN \u2014 DESCENT ' + descentNum
    : 'EXTRACTED \u2014 DESCENT ' + descentNum;
  var titleColor = isDeath ? '#ef4444' : '#6ee7b7';

  if (titleEl) {
    titleEl.textContent = title;
    titleEl.style.color = titleColor;
  }

  // Stats
  var html = '';
  html += '<div class="drw-stat"><span class="drw-stat-label">DESCENTS REACHED</span><span class="drw-stat-value">' + descentNum + '</span></div>';

  if (bankedLoot.length > 0) {
    html += '<div class="drw-stat" style="flex-direction:column;align-items:flex-start;gap:4px;">';
    html += '<span class="drw-stat-label">BANKED LOOT (' + bankedLoot.length + ' items)</span>';
    var totals = {};
    for (var i = 0; i < bankedLoot.length; i++) {
      var key = bankedLoot[i].item;
      totals[key] = (totals[key] || 0) + (bankedLoot[i].amount || 1);
    }
    var keys = Object.keys(totals);
    html += '<span class="drw-stat-value" style="font-size:0.6em;color:#a3e635;">';
    for (var k = 0; k < keys.length; k++) {
      html += keys[k] + ' x' + totals[keys[k]];
      if (k < keys.length - 1) html += ' &nbsp;';
    }
    html += '</span>';
    html += '</div>';
  } else {
    html += '<div class="drw-stat"><span class="drw-stat-label">BANKED LOOT</span><span class="drw-stat-value" style="color:#6b7280;">None</span></div>';
  }

  if (isDeath) {
    html += '<div class="drw-stat"><span class="drw-stat-label">CURRENT DESCENT LOOT</span><span class="drw-stat-value" style="color:#ef4444;">FORFEITED</span></div>';
  }

  if (statsEl) statsEl.innerHTML = html;
  if (upgradesEl) upgradesEl.innerHTML = '';

  // Save banked loot to inventory
  if (bankedLoot.length > 0 && typeof _saveDungeonLootToInventory === 'function') {
    _saveDungeonLootToInventory(bankedLoot);
  }

  // Check milestone cosmetics on run end (covers extraction and death paths)
  checkInfiniteDepthsMilestones();

  // Persist stats
  if (typeof _persistDungeonRunStats === 'function') {
    var summary = (typeof getDungeonSessionSummary === 'function') ? getDungeonSessionSummary() : {};
    if (summary) {
      summary.infiniteDescentNum = descentNum;
      summary.infiniteBankedLoot = bankedLoot.slice();
      _persistDungeonRunStats(summary);
    }
  }

  // Wire action buttons
  var retryBtn = overlay.querySelector('.depths-results-retry');
  var lobbyBtn = overlay.querySelector('.depths-results-lobby');

  if (retryBtn) {
    retryBtn.textContent = '\u25B6 Play Again';
    retryBtn.onclick = function () {
      overlay.style.display = 'none';
      clearInfiniteRunState();
      if (typeof clearDungeonSession === 'function') clearDungeonSession();
      launchInfiniteDepthsSession();
    };
  }
  if (lobbyBtn) {
    lobbyBtn.onclick = function () {
      overlay.style.display = 'none';
      clearInfiniteRunState();
      if (typeof clearDungeonSession === 'function') clearDungeonSession();
      if (typeof resetGame === 'function') resetGame();
      var blocker = document.getElementById('blocker');
      if (blocker) blocker.style.display = 'flex';
      var instructions = document.getElementById('instructions');
      if (instructions) instructions.style.display = '';
    };
  }

  // Hide leaderboard button (no leaderboard for infinite yet)
  var lbBtn = overlay.querySelector('.depths-results-leaderboard');
  if (lbBtn) lbBtn.style.display = 'none';

  overlay.style.display = 'flex';

  // Clean up run state
  clearInfiniteRunState();
  if (typeof clearDungeonSession === 'function') clearDungeonSession();
  if (typeof depthsHud !== 'undefined' && depthsHud) depthsHud.hide();
}

// ── Inter-Descent extraction screen ──────────────────────────────────────────

/**
 * Show the inter-Descent screen after completing all 7 floors of a Descent.
 * Offers "Extract" (end run, bank all loot) or "Go Deeper" (next Descent).
 *
 * @param {number}   descentNum  The Descent just completed (1-based)
 * @param {object[]} floorLoot   Loot dropped on the boss floor
 */
function showInfiniteDescentScreen(descentNum, floorLoot) {
  if (typeof controls !== 'undefined' && controls && controls.isLocked) controls.unlock();

  var run       = _infiniteRun;
  var allLoot   = (typeof getDungeonLoot === 'function') ? getDungeonLoot() : [];
  var banked    = run ? run.bankedLoot : [];
  var nextDescent = descentNum + 1;

  var overlay = document.getElementById('depths-transition-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'depths-transition-overlay';
    overlay.className = 'depths-transition-overlay';
    document.body.appendChild(overlay);
  }

  var html = '<div class="dt-panel dt-extract-panel dt-infinite-panel">';
  html += '<div class="dt-header dt-infinite-header">&#8734; DESCENT ' + descentNum + ' COMPLETE</div>';
  html += '<div class="dt-infinite-sub">The Wither Storm is defeated. You stand at the threshold.</div>';

  // Current Descent loot
  if (allLoot.length > 0) {
    html += '<div class="dt-loot-reveal">';
    html += '<div class="dt-loot-title">THIS DESCENT\'S LOOT</div>';
    var lootTotals = {};
    for (var i = 0; i < allLoot.length; i++) {
      lootTotals[allLoot[i].item] = (lootTotals[allLoot[i].item] || 0) + (allLoot[i].amount || 1);
    }
    var lootKeys = Object.keys(lootTotals);
    for (var k = 0; k < lootKeys.length; k++) {
      html += '<div class="dt-loot-item"><span class="dt-loot-name">' + lootKeys[k] + '</span> <span class="dt-loot-amount">x' + lootTotals[lootKeys[k]] + '</span></div>';
    }
    html += '</div>';
  }

  // Banked loot from previous Descents
  if (banked.length > 0) {
    html += '<div class="dt-loot-total">';
    html += '<div class="dt-loot-total-title">PREVIOUSLY BANKED (' + banked.length + ' items — safe)</div>';
    html += '</div>';
  }

  // Choices
  html += '<div class="dt-extract-choices dt-infinite-choices">';
  html += '<button class="dt-extract-btn dt-extract-keep" id="infinite-extract-btn">' +
    '&#x2191; EXTRACT<br><span class="dt-extract-sub">Bank all loot. End the run.</span></button>';
  html += '<button class="dt-extract-btn dt-extract-descend dt-go-deeper-btn" id="infinite-deeper-btn">' +
    '&#8734; DESCENT ' + nextDescent +
    '<br><span class="dt-extract-sub">Bank loot. Dive deeper. Storm awaits.</span></button>';
  html += '</div>';

  html += '<div class="dt-infinite-warning">&#9888; Death on Descent ' + nextDescent + ' forfeits its loot. Banked loot is always safe.</div>';
  html += '</div>';

  overlay.innerHTML = html;
  overlay.style.display = 'flex';
  overlay.setAttribute('tabindex', '-1');
  overlay.focus();

  // Track highest floor reached: each Descent has 7 floors
  _updateInfiniteHighestFloor(descentNum * 7);

  // Mastery tracking — record this completed descent
  if (typeof masteryOnInfiniteDescentComplete === 'function') {
    masteryOnInfiniteDescentComplete(descentNum);
  }

  // Descent completion sting + audio milestone check
  if (typeof playDescentCompleteSting === 'function') playDescentCompleteSting(descentNum);
  if (typeof checkAndPlayMilestone === 'function') checkAndPlayMilestone(descentNum);

  // Award any newly reached cosmetic milestones
  checkInfiniteDepthsMilestones();

  // Wire Extract button
  var extractBtn = document.getElementById('infinite-extract-btn');
  if (extractBtn) {
    extractBtn.onclick = function () {
      overlay.style.display = 'none';
      extractInfiniteRun();
      showInfiniteRunResults(false);
    };
  }

  // Wire Go Deeper button
  var deeperBtn = document.getElementById('infinite-deeper-btn');
  if (deeperBtn) {
    deeperBtn.onclick = function () {
      overlay.style.display = 'none';
      var ok = advanceInfiniteDescend();
      if (!ok) {
        // Fallback if session start failed
        extractInfiniteRun();
        showInfiniteRunResults(false);
        return;
      }
      // Show next Descent intro lore
      var floor = (typeof getDungeonCurrentFloor === 'function') ? getDungeonCurrentFloor() : null;
      if (floor && typeof _showDungeonDescentLore === 'function') {
        _showDungeonDescentLore(floor, 1, function () {
          dungeonFloorTimerActive = true;
          depthsFloorTimerActive  = true;
          if (typeof requestPointerLock === 'function') requestPointerLock();
        });
      } else {
        dungeonFloorTimerActive = true;
        depthsFloorTimerActive  = true;
      }
    };
  }

  // Keyboard: E = extract, D = go deeper
  function keyHandler(e) {
    if (e.key === 'e' || e.key === 'E') {
      e.preventDefault();
      overlay.removeEventListener('keydown', keyHandler);
      overlay.style.display = 'none';
      extractInfiniteRun();
      showInfiniteRunResults(false);
    }
    if (e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      overlay.removeEventListener('keydown', keyHandler);
      overlay.style.display = 'none';
      var ok = advanceInfiniteDescend();
      if (!ok) { extractInfiniteRun(); showInfiniteRunResults(false); return; }
      var floor = (typeof getDungeonCurrentFloor === 'function') ? getDungeonCurrentFloor() : null;
      if (floor && typeof _showDungeonDescentLore === 'function') {
        _showDungeonDescentLore(floor, 1, function () {
          dungeonFloorTimerActive = true;
          depthsFloorTimerActive  = true;
          if (typeof requestPointerLock === 'function') requestPointerLock();
        });
      } else {
        dungeonFloorTimerActive = true;
        depthsFloorTimerActive  = true;
      }
    }
  }
  overlay.addEventListener('keydown', keyHandler);
}
