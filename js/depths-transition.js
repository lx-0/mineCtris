// Floor transition screen for The Depths roguelike mode.
// Shows score summary, upgrade selection, and descent animation between floors.
// Also handles the Floor 7 victory screen with cosmetic reward.
//
// Requires: state.js, depths-floor-gen.js, depths-upgrades.js, gamestate.js
// Used by: depths-floor-gen.js (floor transition flow)

// ── Per-floor score tracking ───────────────────────────────────────────────
// Snapshot the cumulative score at floor start so we can compute per-floor delta.

var _depthsFloorStartScore = 0;
var _depthsFloorStartLines = 0;

/**
 * Call at the beginning of each floor to snapshot the starting score/lines.
 * Must be called AFTER applyDepthsFloor and before gameplay resumes.
 */
function snapshotDepthsFloorStart() {
  _depthsFloorStartScore = score || 0;
  _depthsFloorStartLines = linesCleared || 0;
}

// ── Transition screen ──────────────────────────────────────────────────────

/**
 * Show the full floor transition screen:
 *   1. Score summary for the completed floor
 *   2. Upgrade selection (pick 1 of 3)
 *   3. Descent animation
 *
 * @param {object}   completedFloor  Floor descriptor just completed
 * @param {number}   completedFloorNum  Floor number just completed (1-6)
 * @param {object[]} upgradeChoices  Array of upgrade defs from drawDepthsUpgrades
 * @param {function} onDone  Callback after the full transition completes
 */
function showDepthsTransition(completedFloor, completedFloorNum, upgradeChoices, onDone) {
  // Capture floor stats before they get reset
  var floorStats = {
    floorNum: completedFloorNum,
    linesCleared: depthsFloorLinesCleared || 0,
    timeTaken: depthsFloorElapsedMs || 0,
    scoreEarned: Math.max(0, (score || 0) - _depthsFloorStartScore),
    biome: completedFloor ? completedFloor.biomeId : 'stone',
  };
  // XP estimate: score / 50 (simplified — actual XP awarded at run end)
  floorStats.xpEstimate = Math.floor(floorStats.scoreEarned / 50);

  // Create or reuse the transition overlay
  var overlay = document.getElementById('depths-transition-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'depths-transition-overlay';
    overlay.className = 'depths-transition-overlay';
    document.body.appendChild(overlay);
  }

  // Phase 1: Score summary
  _showTransitionSummary(overlay, floorStats, function () {
    // Phase 2: Upgrade selection
    _showTransitionUpgrades(overlay, upgradeChoices, completedFloorNum, function () {
      // Phase 3: Descent animation
      _showDescentAnimation(overlay, completedFloorNum, function () {
        overlay.style.display = 'none';
        if (onDone) onDone();
      });
    });
  });
}

// ── Phase 1: Score Summary ─────────────────────────────────────────────────

function _showTransitionSummary(overlay, stats, onNext) {
  var timeSecs = Math.floor(stats.timeTaken / 1000);
  var mm = Math.floor(timeSecs / 60).toString().padStart(2, '0');
  var ss = (timeSecs % 60).toString().padStart(2, '0');

  var html = '<div class="dt-panel dt-summary-panel">';
  html += '<div class="dt-header">FLOOR ' + stats.floorNum + ' CLEARED</div>';
  html += '<div class="dt-biome">' + stats.biome.toUpperCase() + '</div>';
  html += '<div class="dt-stats">';
  html += _statRow('LINES CLEARED', stats.linesCleared);
  html += _statRow('TIME', mm + ':' + ss);
  html += _statRow('SCORE', stats.scoreEarned.toLocaleString());
  html += _statRow('XP EARNED', '+' + stats.xpEstimate);
  html += '</div>';
  html += '<div class="dt-continue-hint">Press any key or click to continue</div>';
  html += '</div>';

  overlay.innerHTML = html;
  overlay.style.display = 'flex';
  overlay.setAttribute('tabindex', '-1');
  overlay.focus();

  // Animate stat counters in
  var statEls = overlay.querySelectorAll('.dt-stat');
  for (var i = 0; i < statEls.length; i++) {
    statEls[i].style.animationDelay = (i * 0.15) + 's';
  }

  var dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    overlay.removeEventListener('click', dismiss);
    overlay.removeEventListener('keydown', dismiss);
    if (onNext) onNext();
  }
  overlay.addEventListener('click', dismiss);
  overlay.addEventListener('keydown', dismiss);
}

function _statRow(label, value) {
  return '<div class="dt-stat"><span class="dt-stat-label">' + label +
    '</span><span class="dt-stat-value">' + value + '</span></div>';
}

// ── Phase 2: Upgrade Selection ─────────────────────────────────────────────

function _showTransitionUpgrades(overlay, choices, fromFloorNum, onNext) {
  if (!choices || choices.length === 0) {
    if (onNext) onNext();
    return;
  }

  var nextFloorNum = fromFloorNum + 1;
  var rarityColors = { common: '#9ca3af', rare: '#3b82f6', epic: '#a855f7' };
  var rarityLabels = { common: 'COMMON', rare: 'RARE', epic: 'EPIC' };

  // Notify depths tutorial: transition/upgrade screen shown
  if (typeof depthsTutorialNotify === 'function') depthsTutorialNotify('transitionScreen');

  var html = '<div class="dt-panel dt-upgrade-panel">';
  html += '<div class="dt-header" style="color:#fbbf24;">CHOOSE AN UPGRADE</div>';
  html += '<div class="dt-subtitle">Floor ' + nextFloorNum + ' awaits below</div>';
  html += '<div class="dt-upgrade-cards">';
  for (var i = 0; i < choices.length; i++) {
    var u = choices[i];
    var rc = rarityColors[u.rarity] || rarityColors.common;
    var rl = rarityLabels[u.rarity] || 'COMMON';
    html += '<div class="dt-upgrade-card" data-upgrade-id="' + u.id + '" tabindex="0" ' +
      'style="border-color: ' + rc + ';">';
    html += '<div class="dt-upgrade-rarity" style="color: ' + rc + ';">' + rl + '</div>';
    html += '<div class="dt-upgrade-name">' + u.name + '</div>';
    html += '<div class="dt-upgrade-desc">' + u.description + '</div>';
    html += '<div class="dt-upgrade-cat">' + u.category.replace('_', '/') + '</div>';
    html += '</div>';
  }
  html += '</div>';
  html += '<div class="dt-upgrade-hints">';
  html += '<span class="dt-hint">Click a card or press 1 / 2 / 3</span>';
  html += '<button class="dt-skip-btn" tabindex="0">SKIP (random) [S]</button>';
  html += '</div>';
  html += '</div>';

  overlay.innerHTML = html;
  overlay.style.display = 'flex';
  overlay.setAttribute('tabindex', '-1');
  overlay.focus();

  var selected = false;

  function pick(upgradeId) {
    if (selected) return;
    selected = true;
    if (typeof selectDepthsUpgrade === 'function') selectDepthsUpgrade(upgradeId);
    // Notify depths tutorial: player picked an upgrade
    if (typeof depthsTutorialNotify === 'function') depthsTutorialNotify('upgradePick');

    // Flash the selected card
    var cards = overlay.querySelectorAll('.dt-upgrade-card');
    for (var c = 0; c < cards.length; c++) {
      if (cards[c].getAttribute('data-upgrade-id') === upgradeId) {
        cards[c].classList.add('dt-upgrade-selected');
      } else {
        cards[c].style.opacity = '0.3';
      }
    }

    setTimeout(function () {
      if (onNext) onNext();
    }, 500);
  }

  function skipPick() {
    if (selected) return;
    // Auto-pick a random upgrade
    var idx = Math.floor(Math.random() * choices.length);
    pick(choices[idx].id);
  }

  // Click handlers on cards
  var cards = overlay.querySelectorAll('.dt-upgrade-card');
  for (var j = 0; j < cards.length; j++) {
    (function (card) {
      card.addEventListener('click', function () {
        pick(card.getAttribute('data-upgrade-id'));
      });
    })(cards[j]);
  }

  // Skip button
  var skipBtn = overlay.querySelector('.dt-skip-btn');
  if (skipBtn) {
    skipBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      skipPick();
    });
  }

  // Keyboard: 1/2/3 to pick, S to skip
  function keyHandler(e) {
    var num = parseInt(e.key, 10);
    if (num >= 1 && num <= choices.length) {
      e.preventDefault();
      pick(choices[num - 1].id);
    }
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault();
      skipPick();
    }
  }
  overlay.addEventListener('keydown', keyHandler);
}

// ── Phase 3: Descent Animation ─────────────────────────────────────────────

function _showDescentAnimation(overlay, fromFloorNum, onDone) {
  var nextFloor = fromFloorNum + 1;

  var html = '<div class="dt-panel dt-descent-panel">';
  html += '<div class="dt-descent-shaft">';
  // Animated rock layers scrolling up to simulate descent
  for (var i = 0; i < 12; i++) {
    html += '<div class="dt-rock-layer"></div>';
  }
  html += '</div>';
  html += '<div class="dt-descent-text">';
  html += '<div class="dt-descent-from">Floor ' + fromFloorNum + '</div>';
  html += '<div class="dt-descent-arrow">&#9660; &#9660; &#9660;</div>';
  html += '<div class="dt-descent-to">Floor ' + nextFloor + '</div>';
  html += '</div>';
  html += '</div>';

  overlay.innerHTML = html;
  overlay.style.display = 'flex';

  // Auto-advance after the descent animation plays (1.8s)
  var dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    overlay.removeEventListener('click', dismiss);
    overlay.removeEventListener('keydown', dismiss);
    clearTimeout(autoTimer);
    if (onDone) onDone();
  }
  overlay.addEventListener('click', dismiss);
  overlay.addEventListener('keydown', dismiss);
  var autoTimer = setTimeout(dismiss, 1800);
}

// ── Floor 7 Victory Screen ─────────────────────────────────────────────────

/**
 * Show the victory screen after clearing all 7 floors.
 * Displays final stats and weekly cosmetic reward.
 *
 * @param {object} data  { score, linesCleared, blocksMined, timeSeconds, floorReached, runComplete }
 */
function showDepthsVictoryScreen(data) {
  // Mark depths tutorial done after first completed run (don't replay)
  if (typeof markDepthsTutorialDone === 'function') markDepthsTutorialDone();

  var overlay = document.getElementById('depths-results-overlay');
  if (!overlay) return;

  var totalSecs = Math.floor(data.timeSeconds || 0);
  var mm = Math.floor(totalSecs / 60).toString().padStart(2, '0');
  var ss = (totalSecs % 60).toString().padStart(2, '0');

  // Determine the weekly cosmetic reward
  var cosmetic = _getWeeklyDepthsCosmetic();

  var panel = overlay.querySelector('.depths-results-panel');
  if (!panel) return;

  // Build victory HTML
  var html = '';
  html += '<div class="depths-results-title dt-victory-title">THE DEPTHS CONQUERED</div>';
  html += '<div class="dt-victory-subtitle">You have mastered the abyss</div>';

  // Stats
  html += '<div class="depths-results-stats">';
  html += '<div class="depths-stat"><span>FINAL SCORE</span><span>' + (data.score || 0).toLocaleString() + '</span></div>';
  html += '<div class="depths-stat"><span>TOTAL LINES</span><span>' + (data.linesCleared || 0) + '</span></div>';
  html += '<div class="depths-stat"><span>BLOCKS MINED</span><span>' + (data.blocksMined || 0) + '</span></div>';
  html += '<div class="depths-stat"><span>TIME</span><span>' + mm + ':' + ss + '</span></div>';
  html += '</div>';

  // Floor map
  html += '<div class="depths-results-map">';
  for (var i = 1; i <= DEPTHS_FLOOR_COUNT; i++) {
    var run = (typeof getDepthsRun === 'function') ? getDepthsRun() : null;
    var f = run ? run[i] : null;
    html += '<div class="depths-map-floor cleared">';
    html += '<span class="depths-map-num">F' + i + '</span>';
    html += '<span class="depths-map-biome">' + (f ? f.biomeId : '?') + '</span>';
    html += '</div>';
  }
  html += '</div>';

  // Cosmetic reward
  html += '<div class="dt-victory-reward">';
  html += '<div class="dt-reward-label">WEEKLY REWARD UNLOCKED</div>';
  html += '<div class="dt-reward-item">' + cosmetic.icon + ' ' + cosmetic.name + '</div>';
  html += '<div class="dt-reward-desc">' + cosmetic.description + '</div>';
  html += '</div>';

  // Upgrades summary
  html += '<div class="depths-results-upgrades"></div>';

  // Actions
  html += '<div class="depths-results-actions">';
  html += '<button class="depths-results-retry">&#9654; Try Again <span class="key-hint">[Enter]</span></button>';
  html += '<button class="depths-results-leaderboard">&#127942; Leaderboard <span class="key-hint">[L]</span></button>';
  html += '<button class="depths-results-lobby">&#8592; Return to Lobby <span class="key-hint">[Esc]</span></button>';
  html += '</div>';

  panel.innerHTML = html;

  // Fill upgrades summary
  var upgradesEl = panel.querySelector('.depths-results-upgrades');
  if (upgradesEl && typeof getDepthsChosenUpgradeDefs === 'function') {
    var upgrades = getDepthsChosenUpgradeDefs();
    if (upgrades.length > 0) {
      var rc = { common: '#9ca3af', rare: '#3b82f6', epic: '#a855f7' };
      var uHtml = '<div class="depths-upgrades-title">UPGRADES COLLECTED</div>';
      for (var u = 0; u < upgrades.length; u++) {
        uHtml += '<span class="depths-results-upgrade" style="color:' +
          (rc[upgrades[u].rarity] || '#9ca3af') + ';">' + upgrades[u].name + '</span>';
      }
      upgradesEl.innerHTML = uHtml;
    }
  }

  // Save cosmetic reward
  _awardWeeklyDepthsCosmetic(cosmetic);

  // Depths achievements: run-complete and run-end tracking
  if (typeof achOnDepthsRunComplete === 'function') achOnDepthsRunComplete(data);
  if (typeof achOnDepthsRunEnd === 'function') achOnDepthsRunEnd();

  // Play victory fanfare for The Core
  if (typeof playCoreVictoryFanfare === 'function') playCoreVictoryFanfare();

  // Daily Depths: record score + submit to leaderboard (same as showDepthsResults)
  if (isDailyDepths) {
    var isPractice = typeof isDailyDepthsPractice === 'function' && isDailyDepthsPractice();
    data.isPractice = isPractice;
    if (typeof submitDailyDepthsScore === 'function') {
      submitDailyDepthsScore(
        data.score || 0, data.floorReached, data.runComplete,
        data.timeSeconds || 0, data.linesCleared || 0
      );
    }
    if (!isPractice && typeof markDailyDepthsAttempt === 'function') {
      markDailyDepthsAttempt();
    }
    if (!isPractice && typeof apiSubmitDailyDepthsScore === 'function') {
      var name = typeof loadDisplayName === 'function' ? loadDisplayName() : '';
      if (name) {
        apiSubmitDailyDepthsScore(name, data.score || 0, data.floorReached, data.runComplete);
      }
    }
    if (typeof renderDailyDepthsResults === 'function') {
      renderDailyDepthsResults(data, false);
    }
  }

  // Submit to all-time depths leaderboard
  if (typeof submitDepthsScore === 'function') {
    var upgradeNames = typeof _getDepthsUpgradeNames === 'function' ? _getDepthsUpgradeNames() : [];
    submitDepthsScore(
      data.score || 0, data.floorReached, data.runComplete,
      data.timeSeconds || 0, data.linesCleared || 0, upgradeNames
    );
  }

  overlay.style.display = 'flex';
  overlay.setAttribute('tabindex', '-1');
  overlay.focus();

  // Wire up buttons (same as showDepthsResults)
  var retryBtn = overlay.querySelector('.depths-results-retry');
  if (retryBtn) {
    retryBtn.onclick = function () {
      overlay.style.display = 'none';
      if (typeof resetGame === 'function') resetGame();
      if (isDailyDepths) {
        document.dispatchEvent(new CustomEvent('dailyDepthsLaunch'));
      } else {
        document.dispatchEvent(new CustomEvent('depthsLaunch'));
      }
    };
  }

  var lobbyBtn = overlay.querySelector('.depths-results-lobby');
  if (lobbyBtn) {
    lobbyBtn.onclick = function () {
      overlay.style.display = 'none';
      if (typeof resetGame === 'function') resetGame();
    };
  }

  // Leaderboard button
  var lbBtn = overlay.querySelector('.depths-results-leaderboard');
  if (lbBtn) {
    lbBtn.onclick = function () {
      if (typeof openDepthsLeaderboard === 'function') {
        openDepthsLeaderboard(isDailyDepths ? 'daily' : 'allruns');
      }
    };
  }

  overlay.addEventListener('keydown', function (e) {
    if (e.key === 'Enter')  { e.preventDefault(); if (retryBtn) retryBtn.click(); }
    if (e.key === 'l' || e.key === 'L') { e.preventDefault(); if (lbBtn) lbBtn.click(); }
    if (e.key === 'Escape') { e.preventDefault(); if (lobbyBtn) lobbyBtn.click(); }
  });
}

// ── Weekly cosmetic rewards ────────────────────────────────────────────────

var _DEPTHS_COSMETICS = [
  { id: 'pickaxe_obsidian',  icon: '⛏', name: 'Obsidian Pickaxe',   description: 'A dark pickaxe forged in the deepest fires.' },
  { id: 'trail_embers',      icon: '🔥', name: 'Ember Trail',        description: 'Falling pieces leave glowing embers.' },
  { id: 'aura_depths',       icon: '💎', name: 'Abyssal Aura',       description: 'A shimmering aura surrounds your blocks.' },
  { id: 'frame_conqueror',   icon: '👑', name: 'Conqueror Frame',    description: 'A golden frame for your profile.' },
  { id: 'sound_depths',      icon: '🎵', name: 'Depths Melody',      description: 'Unlock the Depths soundtrack for other modes.' },
  { id: 'block_crystal',     icon: '✨', name: 'Crystal Blocks',     description: 'Translucent crystal block skin.' },
  { id: 'bg_abyss',          icon: '🌌', name: 'Abyssal Background', description: 'A swirling void background theme.' },
];

function _getWeeklyDepthsCosmetic() {
  // Rotate weekly based on ISO week number
  var now = new Date();
  var start = new Date(now.getFullYear(), 0, 1);
  var weekNum = Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
  var idx = weekNum % _DEPTHS_COSMETICS.length;
  return _DEPTHS_COSMETICS[idx];
}

function _awardWeeklyDepthsCosmetic(cosmetic) {
  try {
    var key = 'depths_cosmetics';
    var stored = JSON.parse(localStorage.getItem(key) || '[]');
    if (stored.indexOf(cosmetic.id) < 0) {
      stored.push(cosmetic.id);
      localStorage.setItem(key, JSON.stringify(stored));
    }
  } catch (e) { /* localStorage unavailable */ }
}
