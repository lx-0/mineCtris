// Expedition Session — lore intro overlay, results screen, and biome reward track.
//
// Depends on:
//   expedition-reward-tracks.js (awardBiomeRunXP, autoClaimBiomeRewards, buildBiomeTrackHtml)
//   expedition-map.js           (recordExpeditionScore, openExpeditionMap)
//   gamestate.js                (resetGame — called from results button handlers)
//
// Load order: after expedition-reward-tracks.js, expedition-map.js, and biome-themes.js,
//             before main.js.

// ── Biome lore ────────────────────────────────────────────────────────────────

const _BIOME_LORE = {
  stone: [
    'Deep beneath the surface, ancient caverns hold memories of the world.',
    'Mineral veins pulse faintly in the dark — iron, coal, and forgotten ore.',
    'The walls shift here. Gravity feels heavier. Place each piece wisely.',
    'What falls from above may never rise again.',
    'Mine what you can. Leave nothing behind.',
  ],
  forest: [
    'Roots older than memory wind between the stone.',
    'The forest biome stretches wide — wider than it has any right to be.',
    'Each cleared row feeds the canopy above with light.',
    'Creatures stir in the undergrowth when blocks pile high.',
    'Work with the forest. It will outlast you regardless.',
  ],
  nether: [
    'Heat distorts distance here. Everything falls faster.',
    'The Nether does not forgive hesitation — pieces fall at 1.5× speed.',
    'Lava remembers every block that sinks into it.',
    'Scoring burns bright in these depths — 1.2× score multiplier active.',
    'Stay ahead of the rise. There is no second chance below.',
  ],
  ice: [
    'A frozen stillness lies beneath the surface here.',
    'Pieces land but slide — a 500 ms lock delay gives you room to adjust.',
    'The ice preserves everything. Including your mistakes.',
    'Patience is rewarded. Rushing cracks the surface.',
    'Cold amplifies precision. Chaos will be your undoing.',
  ],
};

const _BIOME_ICONS = {
  stone:  '&#9935;',    // ⛏
  forest: '&#127795;',  // 🌳
  nether: '&#128293;',  // 🔥
  ice:    '&#10052;',   // ❄
};

// ── Reward track ──────────────────────────────────────────────────────────────
// 15-tier per-biome lifetime reward tracks.
// Delegate entirely to expedition-reward-tracks.js which owns all XP state.
// XP formula: min(500, floor(score / 100)) — handled by awardBiomeRunXP().

/**
 * Returns compact reward track info for a biome node (used by expedition-map.js info panel).
 * Delegates to the per-biome system; nodeId is only used for legacy call-site compatibility.
 *
 * @param {string} biomeId
 * @returns {{ tier: number, label: string, pct: number, xp: number }}
 */
function getExpeditionNodeTrackInfo(biomeId) {
  if (typeof getBiomeTrackInfo !== 'function') return { tier: 1, label: 'Explorer', pct: 0, xp: 0 };
  var info = getBiomeTrackInfo(biomeId);
  if (!info) return { tier: 1, label: 'Explorer', pct: 0, xp: 0 };
  return { tier: info.currentTier.tier, label: info.currentTier.label, pct: info.pct, xp: info.xp };
}

// ── Session state ─────────────────────────────────────────────────────────────

let _currentExpNode = null;  // Set when a biome is launched; cleared on return-to-map.

/** Clear session after returning to world map. */
function clearExpeditionSession() {
  _currentExpNode = null;
  try { sessionStorage.removeItem('mineCtris_expeditionNode'); } catch (_) {}
}

// ── Lore intro overlay ────────────────────────────────────────────────────────

let _loreTimer   = null;
let _loreBeginCb = null;

/**
 * Show the biome lore overlay before starting a game session.
 * After 3 s the progress bar fills and the button changes to "Enter Biome ▶".
 * The user must click/press to proceed — pointer lock requires a user gesture.
 *
 * @param {object}   node      Expedition node object (biomeId, biomeName, nodeId).
 * @param {function} onBegin   Callback invoked when the player confirms (Enter button / key).
 */
function showExpeditionLore(node, onBegin) {
  _currentExpNode = node;
  _loreBeginCb    = onBegin || null;

  const overlay = document.getElementById('expedition-lore-overlay');
  if (!overlay) { if (onBegin) onBegin(); return; }

  const biomeId   = node.biomeId   || 'stone';
  const biomeName = node.biomeName || biomeId;
  const lines     = _BIOME_LORE[biomeId] || _BIOME_LORE.stone;
  const icon      = _BIOME_ICONS[biomeId] || '&#127758;';

  const iconEl    = document.getElementById('exp-lore-biome-icon');
  const nameEl    = document.getElementById('exp-lore-biome-name');
  const bodyEl    = document.getElementById('exp-lore-body');
  const beginBtn  = document.getElementById('exp-lore-begin-btn');

  if (iconEl)   iconEl.innerHTML     = icon;
  if (nameEl)   nameEl.textContent   = biomeName.toUpperCase();
  if (bodyEl)   bodyEl.innerHTML     = lines.map(function (l) { return '<p>' + l + '</p>'; }).join('');
  if (beginBtn) {
    beginBtn.textContent = 'Skip \u25ba';
    beginBtn.classList.remove('exp-lore-ready');
  }

  overlay.style.display = 'flex';
  overlay.setAttribute('tabindex', '-1');
  overlay.focus();

  // Animate the progress bar over 3 s; after that prompt the user to confirm.
  _loreFillBar(3000);
  clearTimeout(_loreTimer);
  _loreTimer = setTimeout(function () {
    if (beginBtn) {
      beginBtn.textContent = 'Enter Biome \u25ba';
      beginBtn.classList.add('exp-lore-ready');
    }
    overlay.addEventListener('keydown', _loreKeyHandler);
    // Also make the whole overlay clickable as a shortcut
    overlay.addEventListener('click', _loreOverlayClick);
  }, 3000);
}

function _loreKeyHandler(e) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    _confirmLore();
  }
}

function _loreOverlayClick(e) {
  // Only fire if user clicks outside the panel (backdrop click)
  if (e.target === document.getElementById('expedition-lore-overlay')) {
    _confirmLore();
  }
}

function _loreFillBar(durationMs) {
  const fill = document.getElementById('exp-lore-progress-fill');
  if (!fill) return;
  fill.style.transition = 'none';
  fill.style.width      = '0%';
  void fill.offsetWidth; // force reflow
  fill.style.transition = 'width ' + (durationMs / 1000) + 's linear';
  fill.style.width      = '100%';
}

/** Called when the player actively confirms — must happen inside a user-gesture. */
function _confirmLore() {
  clearTimeout(_loreTimer);
  const overlay = document.getElementById('expedition-lore-overlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlay.removeEventListener('keydown',  _loreKeyHandler);
    overlay.removeEventListener('click',    _loreOverlayClick);
  }
  // Apply any pending material bonus pack rewards into the starting inventory
  if (typeof loadAndClearMaterialStash === 'function') {
    loadAndClearMaterialStash();
  }
  const cb    = _loreBeginCb;
  _loreBeginCb = null;
  if (cb) cb();
}

// ── Results screen ────────────────────────────────────────────────────────────

/**
 * Show the expedition results overlay after game over.
 *
 * @param {{ score: number, linesCleared: number, blocksMined: number, timeSeconds: number }} data
 */
function showExpeditionResults(data) {
  const node = _currentExpNode;
  if (!node) return;

  const overlay = document.getElementById('expedition-results-overlay');
  if (!overlay) return;

  const biomeId   = node.biomeId   || 'stone';
  const biomeName = node.biomeName || biomeId;
  const icon      = _BIOME_ICONS[biomeId] || '&#127758;';

  // Stats derived from the run
  const fragments = Math.floor((data.linesCleared || 0) * 3 + (data.blocksMined || 0) / 5);

  // Check if this biome is the season's featured biome — grants 2× biome XP.
  const featuredBiomeId = (typeof getFeaturedBiomeId === 'function') ? getFeaturedBiomeId() : null;
  const isFeaturedRun   = !!featuredBiomeId && featuredBiomeId === biomeId;
  const xpMult          = isFeaturedRun ? 2 : 1;

  // Reward track: award XP via per-biome system, then auto-claim unlocked rewards.
  // Featured-biome runs get 2× XP (still capped at 500 per awardBiomeRunXP).
  const runResult   = (typeof awardBiomeRunXP === 'function')
    ? awardBiomeRunXP(biomeId, data.score || 0, xpMult)
    : { xpEarned: 0, xpBefore: 0, xpAfter: 0, tiersUnlocked: [] };
  const xpEarned    = runResult.xpEarned;
  const tiersUp     = runResult.tiersUnlocked;
  const newlyClaimed = (typeof autoClaimBiomeRewards === 'function')
    ? autoClaimBiomeRewards(biomeId)
    : [];

  // Featured Pass: also award XP to the seasonal featured pass track.
  let fpResult = null;
  if (isFeaturedRun && typeof awardFeaturedPassXP === 'function') {
    fpResult = awardFeaturedPassXP(xpEarned);
  }

  // Current track state after awarding XP
  const trackInfo = (typeof getBiomeTrackInfo === 'function')
    ? getBiomeTrackInfo(biomeId)
    : null;
  const tierAfter   = trackInfo ? trackInfo.currentTier : { tier: 1, label: 'Explorer' };
  const nextTier    = trackInfo ? trackInfo.nextTier    : null;
  const pct         = trackInfo ? trackInfo.pct         : 0;
  const xpAfter     = trackInfo ? trackInfo.xp          : 0;

  // Time display
  const totalSecs = Math.floor(data.timeSeconds || 0);
  const mm = Math.floor(totalSecs / 60).toString().padStart(2, '0');
  const ss = (totalSecs % 60).toString().padStart(2, '0');

  // Populate header
  const resIconEl   = document.getElementById('exp-results-biome-icon');
  const resNameEl   = document.getElementById('exp-results-biome-name');
  const resFeatEl   = document.getElementById('exp-results-featured-badge');
  if (resIconEl) resIconEl.innerHTML    = icon;
  if (resNameEl) resNameEl.textContent  = biomeName.toUpperCase();
  if (resFeatEl) {
    resFeatEl.style.display = isFeaturedRun ? 'inline-block' : 'none';
  }

  // Stats grid
  const statsEl = document.getElementById('exp-results-stats');
  if (statsEl) {
    statsEl.innerHTML =
      '<div class="exp-res-stat"><span class="exp-res-label">SCORE</span>'         + '<span class="exp-res-val">'  + (data.score || 0).toLocaleString() + '</span></div>' +
      '<div class="exp-res-stat"><span class="exp-res-label">LINES CLEARED</span>' + '<span class="exp-res-val">'  + (data.linesCleared || 0)           + '</span></div>' +
      '<div class="exp-res-stat"><span class="exp-res-label">FRAGMENTS</span>'     + '<span class="exp-res-val">+' + fragments                           + '</span></div>' +
      '<div class="exp-res-stat"><span class="exp-res-label">TIME</span>'          + '<span class="exp-res-val">'  + mm + ':' + ss                      + '</span></div>';
  }

  // Reward track — full 15-tier per-biome display
  const trackEl = document.getElementById('exp-results-track');
  if (trackEl && trackInfo) {
    // Tier-up announcements
    var tierUpHtml = '';
    for (var i = 0; i < tiersUp.length; i++) {
      tierUpHtml +=
        '<div class="exp-res-tier-up">&#9650; ' + tiersUp[i].label +
        ' (Tier ' + tiersUp[i].tier + '/' + trackInfo.totalTiers + ')</div>';
    }

    // Newly claimed reward announcements
    var claimedHtml = '';
    for (var j = 0; j < newlyClaimed.length; j++) {
      claimedHtml +=
        '<div class="exp-res-reward-claim">&#127873; ' + newlyClaimed[j].rewardLabel + '</div>';
      if (newlyClaimed[j].materialBonus) {
        var mb = newlyClaimed[j].materialBonus;
        claimedHtml +=
          '<div class="exp-res-reward-claim exp-res-material-bonus">' +
            '<span class="exp-res-material-swatch" style="background:' + mb.color + '"></span>' +
            '&#129656; +' + mb.count + ' ' + mb.label + ' added to next session' +
          '</div>';
      }
    }

    const nextLabel = nextTier
      ? 'Next: ' + nextTier.label + ' &mdash; ' + (nextTier.xpRequired - xpAfter) + ' XP to go'
      : '&#9733; Reward track complete!';

    trackEl.innerHTML =
      '<div class="exp-res-track-header">' +
        '<span class="exp-res-tier-name">' + tierAfter.label + '</span>' +
        '<span class="exp-res-tier-count">Tier ' + tierAfter.tier + '/' + trackInfo.totalTiers + '</span>' +
        '<span class="exp-res-xp-delta">+' + xpEarned + ' XP</span>' +
      '</div>' +
      tierUpHtml +
      claimedHtml +
      '<div class="exp-res-track-bar-wrap">' +
        '<div class="exp-res-track-bar-fill" style="width:' + pct + '%"></div>' +
      '</div>' +
      '<div class="exp-res-track-next' + (nextTier ? '' : ' exp-res-track-max') + '">' + nextLabel + '</div>';
  }

  // Featured Pass results section (shown when this was a featured-biome run)
  var fpResultsEl = document.getElementById('exp-results-featured-pass');
  if (fpResultsEl) {
    if (isFeaturedRun && fpResult && typeof buildFeaturedPassResultsHtml === 'function') {
      fpResultsEl.innerHTML = buildFeaturedPassResultsHtml(
        fpResult.xpEarned,
        fpResult.tiersUp,
        fpResult.newlyClaimed
      );
      fpResultsEl.style.display = fpResultsEl.innerHTML ? 'block' : 'none';
    } else {
      fpResultsEl.style.display = 'none';
    }
  }

  // Story fragment drop
  var fragEl = document.getElementById('exp-results-fragment');
  if (fragEl && typeof rollStoryFragment === 'function') {
    var drop = rollStoryFragment(biomeId);
    if (drop) {
      var frag     = drop.fragment;
      var rarity   = frag.rarity;
      var progress = typeof getFragmentProgress === 'function' ? getFragmentProgress(biomeId) : null;
      var progText = progress ? (progress.collected + ' / ' + progress.total + ' fragments') : '';

      fragEl.className = 'fragment-' + rarity;
      fragEl.innerHTML =
        '<div class="exp-frag-header">' +
          '<span class="exp-frag-label">&#9670; Story Fragment</span>' +
          '<span class="exp-frag-rarity exp-frag-rarity-' + rarity + '">' + rarity + '</span>' +
        '</div>' +
        '<div class="exp-frag-title">' + frag.title + '</div>' +
        '<div class="exp-frag-lore">' + frag.lore + '</div>' +
        (progText ? '<div class="exp-frag-progress">' + biomeName.toUpperCase() + ': ' + progText + '</div>' : '');
      fragEl.style.display = 'flex';

      // Re-trigger animation
      fragEl.style.animation = 'none';
      void fragEl.offsetWidth;
      fragEl.style.animation = '';
    } else {
      fragEl.style.display = 'none';
    }
  }

  overlay.style.display = 'flex';
  overlay.setAttribute('tabindex', '-1');
  overlay.focus();

  // Persist the score to the expedition map (server + local cache)
  if (typeof recordExpeditionScore === 'function') {
    recordExpeditionScore(node.nodeId, data.score || 0);
  }

  // Mastery tracking — pass biomeId and fresh track info (XP already awarded above)
  if (typeof masteryOnExpeditionEnd === 'function') {
    var _masterTrackInfo = (typeof getBiomeTrackInfo === 'function') ? getBiomeTrackInfo(biomeId) : null;
    masteryOnExpeditionEnd(biomeId, _masterTrackInfo);
  }

  // Submit to biome weekly leaderboard (async, best-score only)
  if (typeof submitBiomeWeeklyScoreIfBest === 'function') {
    submitBiomeWeeklyScoreIfBest(biomeId, data.score || 0, data.linesCleared || 0)
      .then(function(result) {
        if (!result) return;
        // Show top-10 reward notification in results if applicable
        var rankEl = document.getElementById('exp-results-weekly-rank');
        if (rankEl) {
          var rankHtml = '';
          if (result.rank && result.rank <= 10 && result.weeklyTitle) {
            // Award +500 XP for top-10 weekly finish
            if (typeof awardBiomeRunXP === 'function') {
              awardBiomeRunXP(biomeId, 50000); // triggers +500 XP cap via min(500, score/100)
            }
            rankHtml =
              '<div class="exp-res-weekly-top10">' +
                '&#127942; Weekly Top 10! Rank #' + result.rank +
                ' &mdash; <em>' + result.weeklyTitle + '</em>' +
              '</div>' +
              '<div class="exp-res-weekly-xp">+500 XP weekly bonus awarded</div>';
          } else if (result.rank) {
            rankHtml =
              '<div class="exp-res-weekly-rank">' +
                'Weekly rank: #' + result.rank + ' of ' + (result.total || '?') +
              '</div>';
          }
          rankEl.innerHTML = rankHtml;
          if (rankHtml) rankEl.style.display = 'block';
        }
      })
      .catch(function() {});
  }
}

// ── Info panel reward track (called from expedition-map.js _updateInfoPanel) ──

/**
 * Build HTML for the compact reward track bar in the biome detail card.
 * Uses the per-biome 15-tier system from expedition-reward-tracks.js.
 * @param {string} biomeId
 * @returns {string}
 */
function buildInfoPanelTrack(biomeId) {
  if (typeof buildBiomeTrackHtml !== 'function') return '';
  return buildBiomeTrackHtml(biomeId, 'exp-info');
}

// ── Init ──────────────────────────────────────────────────────────────────────

function initExpeditionSession() {
  // Lore: skip/begin button
  const beginBtn = document.getElementById('exp-lore-begin-btn');
  if (beginBtn) {
    beginBtn.addEventListener('click', function () {
      _confirmLore();
    });
  }

  // Results: play again
  const playAgainBtn = document.getElementById('exp-results-play-again-btn');
  if (playAgainBtn) {
    playAgainBtn.addEventListener('click', function () {
      const node    = _currentExpNode;
      const overlay = document.getElementById('expedition-results-overlay');
      if (overlay) overlay.style.display = 'none';
      if (typeof resetGame === 'function') resetGame();
      // Re-dispatch expeditionLaunch so main.js shows lore and starts game
      if (node) {
        setTimeout(function () {
          document.dispatchEvent(new CustomEvent('expeditionLaunch', { detail: { node: node } }));
        }, 60);
      }
    });
  }

  // Results: return to map
  const mapBtn = document.getElementById('exp-results-map-btn');
  if (mapBtn) {
    mapBtn.addEventListener('click', function () {
      const overlay = document.getElementById('expedition-results-overlay');
      if (overlay) overlay.style.display = 'none';
      clearExpeditionSession();
      if (typeof resetGame === 'function') resetGame();
      setTimeout(function () {
        if (typeof openExpeditionMap === 'function') openExpeditionMap();
      }, 100);
    });
  }

  // Results: keyboard nav
  const resOverlay = document.getElementById('expedition-results-overlay');
  if (resOverlay) {
    resOverlay.addEventListener('keydown', function (e) {
      if (e.key === 'Enter')  { e.preventDefault(); if (playAgainBtn) playAgainBtn.click(); }
      if (e.key === 'Escape') { e.preventDefault(); if (mapBtn)       mapBtn.click();       }
    });
  }

  // Results: basic gamepad polling (A = play again, B = return to map)
  let _resGamepadInterval = null;
  let _resLastInput = 0;

  function _pollResultsGamepad() {
    const resEl = document.getElementById('expedition-results-overlay');
    if (!resEl || resEl.style.display === 'none') return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad  = Array.from(pads).find(function (p) { return p && p.connected; });
    if (!pad) return;
    const now = Date.now();
    if (now - _resLastInput < 300) return;
    if (pad.buttons[0]?.pressed) { _resLastInput = now; if (playAgainBtn) playAgainBtn.click(); }
    if (pad.buttons[1]?.pressed) { _resLastInput = now; if (mapBtn)       mapBtn.click();       }
  }

  _resGamepadInterval = setInterval(_pollResultsGamepad, 100);
  // (interval runs indefinitely; it self-gates on overlay visibility)
}
