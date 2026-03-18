// Featured Season Pass — seasonal biome progression with exclusive cosmetics.
//
// Each season designates a featured biome. Playing expedition runs in the
// featured biome earns Featured Pass XP (separate from lifetime biome XP).
// The pass has 50 tiers at 200 XP each (10,000 XP total); three exclusive
// cosmetics are unlocked at tiers 20, 35, and 50.
//
// Featured Pass XP is per-season and resets when a new season starts.
// Cosmetics become unobtainable (locked) after the season ends for non-owners.
//
// Depends on:
//   season.js (getSeasonConfig, getFeaturedBiomeId)

// ── Constants ─────────────────────────────────────────────────────────────────

const FEATURED_PASS_TIERS_TOTAL  = 50;
const FEATURED_PASS_XP_PER_TIER  = 200;   // linear: tier N requires N * 200 XP

// Tiers that grant exclusive cosmetics.
const FEATURED_PASS_COSMETIC_TIERS = [20, 35, 50];

// Biome display metadata (mirrors expedition-map.js and biome-cosmetics.js).
const _FP_BIOME_META = {
  stone:  { label: 'Stone',  icon: '&#9935;',   color: '#9ca3af' },
  forest: { label: 'Forest', icon: '&#127795;',  color: '#34d399' },
  nether: { label: 'Nether', icon: '&#128293;',  color: '#f97316' },
  ice:    { label: 'Ice',    icon: '&#10052;',   color: '#60a5fa' },
};

// Cosmetic definitions per tier — names/descriptions reference the featured biome.
const _FP_TIER_COSMETICS = {
  20: {
    name:   function(biomeName) { return biomeName + ' Pathfinder Banner'; },
    desc:   function(biomeName) { return 'Earned by exploring the ' + biomeName + ' biome. Seasonal exclusive — banner badge cosmetic.'; },
    icon:   '&#127884;',  // 🎌
    type:   'banner',
  },
  35: {
    name:   function(biomeName) { return biomeName + ' Expedition Trail'; },
    desc:   function(biomeName) { return 'Awarded to seasoned ' + biomeName + ' explorers. Seasonal exclusive — trail cosmetic.'; },
    icon:   '&#10024;',  // ✨
    type:   'trail',
  },
  50: {
    name:   function(biomeName) { return biomeName + ' Master Aura'; },
    desc:   function(biomeName) { return 'Granted only to ' + biomeName + ' masters. Seasonal exclusive — aura cosmetic.'; },
    icon:   '&#127775;',  // 🌟
    type:   'aura',
  },
};

// ── Storage keys ──────────────────────────────────────────────────────────────

function _fpXpKey(seasonId)      { return 'mineCtris_featuredPassXP_'      + seasonId; }
function _fpClaimedKey(seasonId) { return 'mineCtris_featuredPassClaimed_' + seasonId; }

// ── Persistence helpers ───────────────────────────────────────────────────────

function _loadFpXP(seasonId) {
  try { return parseInt(localStorage.getItem(_fpXpKey(seasonId)) || '0', 10) || 0; } catch (_) { return 0; }
}

function _saveFpXP(seasonId, xp) {
  try { localStorage.setItem(_fpXpKey(seasonId), String(xp)); } catch (_) {}
}

function _loadFpClaimed(seasonId) {
  try { return JSON.parse(localStorage.getItem(_fpClaimedKey(seasonId)) || '{}'); } catch (_) { return {}; }
}

function _saveFpClaimed(seasonId, claimed) {
  try { localStorage.setItem(_fpClaimedKey(seasonId), JSON.stringify(claimed)); } catch (_) {}
}

// ── XP and tier helpers ───────────────────────────────────────────────────────

/**
 * Returns the tier number reached for a given total XP (1–50).
 * Tier 1 starts at 0 XP; each additional tier costs FEATURED_PASS_XP_PER_TIER.
 */
function _fpTierForXP(xp) {
  return Math.min(
    FEATURED_PASS_TIERS_TOTAL,
    1 + Math.floor((xp || 0) / FEATURED_PASS_XP_PER_TIER)
  );
}

/** XP required to reach the START of a given tier. */
function _fpXpForTier(tier) {
  return Math.max(0, (tier - 1)) * FEATURED_PASS_XP_PER_TIER;
}

/** Progress % within the current tier (0–100). */
function _fpPctInTier(xp) {
  var tier    = _fpTierForXP(xp);
  if (tier >= FEATURED_PASS_TIERS_TOTAL) return 100;
  var tierStart = _fpXpForTier(tier);
  return Math.min(100, Math.floor(((xp - tierStart) / FEATURED_PASS_XP_PER_TIER) * 100));
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns the current Featured Pass XP for the active season.
 * Returns 0 when there is no active season.
 */
function getFeaturedPassXP() {
  var season = (typeof getSeasonConfig === 'function') ? getSeasonConfig() : null;
  if (!season || !season.seasonId) return 0;
  return _loadFpXP(season.seasonId);
}

/**
 * Returns the current Featured Pass tier (1–50) for the active season.
 */
function getFeaturedPassTier() {
  return _fpTierForXP(getFeaturedPassXP());
}

/**
 * Award Featured Pass XP from a featured-biome expedition run.
 * Uses the same base formula as awardBiomeRunXP (min(500, floor(score/100))),
 * but with the featured-biome 2× multiplier already factored in by the caller.
 * Idempotent XP is just additive; auto-claims newly unlocked cosmetic tiers.
 *
 * @param {number} xpToAward  Raw XP to award (already multiplied by 2 if featured).
 * @returns {{ xpEarned: number, tiersUp: number[], newlyClaimed: number[] }}
 */
function awardFeaturedPassXP(xpToAward) {
  var season = (typeof getSeasonConfig === 'function') ? getSeasonConfig() : null;
  if (!season || !season.seasonId) return { xpEarned: 0, tiersUp: [], newlyClaimed: [] };

  var seasonId  = season.seasonId;
  var xpBefore  = _loadFpXP(seasonId);
  var tierBefore = _fpTierForXP(xpBefore);

  var xpAfter = xpBefore + Math.max(0, xpToAward || 0);
  _saveFpXP(seasonId, xpAfter);

  var tierAfter = _fpTierForXP(xpAfter);

  // Collect newly reached tiers
  var tiersUp = [];
  for (var t = tierBefore + 1; t <= tierAfter; t++) {
    tiersUp.push(t);
  }

  // Auto-claim cosmetics at tier milestones
  var newlyClaimed = _autoClaimFpCosmetics(seasonId, tierAfter);

  return { xpEarned: xpToAward, tiersUp: tiersUp, newlyClaimed: newlyClaimed };
}

/** Auto-claim all unclaimed cosmetic tiers up to currentTier. */
function _autoClaimFpCosmetics(seasonId, currentTier) {
  var claimed    = _loadFpClaimed(seasonId);
  var newClaims  = [];
  for (var i = 0; i < FEATURED_PASS_COSMETIC_TIERS.length; i++) {
    var tier = FEATURED_PASS_COSMETIC_TIERS[i];
    if (currentTier >= tier && !claimed[tier]) {
      claimed[tier] = true;
      newClaims.push(tier);
    }
  }
  if (newClaims.length) _saveFpClaimed(seasonId, claimed);
  return newClaims;
}

/**
 * Returns true if the cosmetic for the given tier was claimed during the active season.
 * @param {string} seasonId
 * @param {number} tierNum  20, 35, or 50.
 */
function isFeaturedPassCosmeticClaimed(seasonId, tierNum) {
  if (!seasonId) return false;
  var claimed = _loadFpClaimed(seasonId);
  return !!claimed[tierNum];
}

/**
 * Returns compact Featured Pass state for the active season.
 * Used by the season pass panel and expedition results screen.
 *
 * @returns {{
 *   seasonId:     string|null,
 *   featuredBiomeId: string|null,
 *   biomeName:    string,
 *   biomeIcon:    string,
 *   biomeColor:   string,
 *   xp:           number,
 *   tier:         number,
 *   pct:          number,
 *   isMaxTier:    boolean,
 *   active:       boolean,
 *   ended:        boolean,
 *   cosmetics:    Array<{ tier, name, desc, icon, type, claimed, locked }>
 * }}
 */
function getFeaturedPassState() {
  var season        = (typeof getSeasonConfig === 'function') ? getSeasonConfig() : null;
  var endedSeason   = (typeof getEndedSeasonConfig === 'function') ? getEndedSeasonConfig() : null;
  var effectiveSeason = season || endedSeason;

  if (!effectiveSeason || !effectiveSeason.seasonId) {
    return {
      seasonId: null, featuredBiomeId: null,
      biomeName: 'Unknown', biomeIcon: '&#127758;', biomeColor: '#888',
      xp: 0, tier: 1, pct: 0, isMaxTier: false,
      active: false, ended: false, cosmetics: [],
    };
  }

  var seasonId       = effectiveSeason.seasonId;
  var featuredBiomeId = effectiveSeason.featuredBiomeId || null;
  var biomeMeta      = _FP_BIOME_META[featuredBiomeId] || { label: 'Unknown', icon: '&#127758;', color: '#888' };
  var biomeName      = biomeMeta.label;

  var xp      = _loadFpXP(seasonId);
  var tier    = _fpTierForXP(xp);
  var pct     = _fpPctInTier(xp);
  var active  = !!season;
  var ended   = !season && !!endedSeason;

  var cosmetics = FEATURED_PASS_COSMETIC_TIERS.map(function(tierNum) {
    var def     = _FP_TIER_COSMETICS[tierNum];
    var claimed = isFeaturedPassCosmeticClaimed(seasonId, tierNum);
    // Locked = season ended AND not claimed (can no longer earn it)
    var locked  = ended && !claimed;
    return {
      tier:    tierNum,
      name:    def.name(biomeName),
      desc:    def.desc(biomeName),
      icon:    def.icon,
      type:    def.type,
      claimed: claimed,
      locked:  locked,
      xpNeeded: _fpXpForTier(tierNum),
    };
  });

  return {
    seasonId:       seasonId,
    featuredBiomeId: featuredBiomeId,
    biomeName:      biomeName,
    biomeIcon:      biomeMeta.icon,
    biomeColor:     biomeMeta.color,
    xp:             xp,
    tier:           tier,
    pct:            pct,
    isMaxTier:      tier >= FEATURED_PASS_TIERS_TOTAL,
    active:         active,
    ended:          ended,
    cosmetics:      cosmetics,
  };
}

// ── Results screen snippet ───────────────────────────────────────────────────

/**
 * Build an HTML snippet showing Featured Pass progress for the expedition
 * results screen. Returns empty string if not applicable.
 *
 * @param {number}   xpEarned     XP awarded this run.
 * @param {number[]} tiersUp      Tier numbers newly reached.
 * @param {number[]} newlyClaimed Cosmetic tier numbers newly claimed.
 * @returns {string} HTML
 */
function buildFeaturedPassResultsHtml(xpEarned, tiersUp, newlyClaimed) {
  var state = getFeaturedPassState();
  if (!state.seasonId || !state.featuredBiomeId || !state.active) return '';

  var html = '<div class="fp-results-section">';
  html += '<div class="fp-results-header">';
  html += '<span class="fp-results-icon">&#11088;</span>';
  html += '<span class="fp-results-label">FEATURED PASS &mdash; ' +
    state.biomeIcon + ' ' + _escFp(state.biomeName) + '</span>';
  html += '<span class="fp-results-xp-delta">+' + xpEarned + ' XP</span>';
  html += '</div>';

  // Tier-up announcements
  for (var i = 0; i < tiersUp.length; i++) {
    html += '<div class="fp-results-tier-up">&#9650; Featured Pass Tier ' + tiersUp[i] + '</div>';
  }

  // Cosmetic claim announcements
  for (var j = 0; j < newlyClaimed.length; j++) {
    var def = _FP_TIER_COSMETICS[newlyClaimed[j]];
    if (def) {
      html += '<div class="fp-results-cosmetic-claim">&#127873; ' + def.icon + ' ' +
        _escFp(def.name(state.biomeName)) + ' unlocked!</div>';
    }
  }

  // Progress bar
  html += '<div class="fp-results-progress-row">';
  html += '<span class="fp-results-tier">Tier ' + state.tier + ' / ' + FEATURED_PASS_TIERS_TOTAL + '</span>';
  html += '</div>';
  html += '<div class="fp-results-bar-wrap">';
  html += '<div class="fp-results-bar-fill" style="width:' + state.pct + '%;background:' + _escFp(state.biomeColor) + '"></div>';
  html += '</div>';

  html += '</div>';
  return html;
}

// ── Season Pass panel section ────────────────────────────────────────────────

/**
 * Build HTML for the Featured Biome Pass section in the Season Pass panel.
 * Shows the 3 cosmetic tiers with progress/claim status.
 * Returns empty string when there is no featured biome set.
 *
 * @returns {string} HTML
 */
function buildFeaturedPassPanelHtml() {
  var state = getFeaturedPassState();
  if (!state.seasonId || !state.featuredBiomeId) return '';

  var html = '<div class="fp-panel-section">';

  // Header
  html += '<div class="fp-panel-header">';
  html += '<span class="fp-panel-biome-icon">' + state.biomeIcon + '</span>';
  html += '<span class="fp-panel-title">Featured Biome Pass &mdash; ' + _escFp(state.biomeName) + '</span>';
  if (state.ended) {
    html += '<span class="fp-panel-ended-badge">Season Ended</span>';
  }
  html += '</div>';

  if (!state.featuredBiomeId) {
    html += '<div class="fp-panel-no-biome">No featured biome set for this season.</div>';
    html += '</div>';
    return html;
  }

  // XP progress bar
  var xpToNext = !state.isMaxTier
    ? (FEATURED_PASS_XP_PER_TIER - (state.xp % FEATURED_PASS_XP_PER_TIER)) + ' XP to next tier'
    : 'Pass complete!';

  html += '<div class="fp-panel-progress">';
  html += '<div class="fp-panel-progress-row">';
  html += '<span class="fp-panel-xp-label">Tier ' + state.tier + ' / ' + FEATURED_PASS_TIERS_TOTAL + '</span>';
  html += '<span class="fp-panel-xp-val">' + state.xp.toLocaleString() + ' XP</span>';
  html += '</div>';
  html += '<div class="fp-panel-bar-wrap">';
  html += '<div class="fp-panel-bar-fill" style="width:' + state.pct + '%;background:' + _escFp(state.biomeColor) + '"></div>';
  html += '</div>';
  html += '<div class="fp-panel-xp-next">' + _escFp(xpToNext) + '</div>';
  html += '</div>';

  if (!state.active && !state.ended) {
    html += '<div class="fp-panel-inactive-note">Play expedition runs in the featured biome to earn Featured Pass XP.</div>';
  }

  // Cosmetic tiers
  html += '<div class="fp-panel-cosmetics">';
  for (var i = 0; i < state.cosmetics.length; i++) {
    var c = state.cosmetics[i];
    var reached = state.tier >= c.tier || c.claimed;

    var rowCls = 'fp-tier-row';
    if (c.claimed)  rowCls += ' fp-tier-claimed';
    if (c.locked)   rowCls += ' fp-tier-locked';
    if (reached && !c.claimed && !c.locked) rowCls += ' fp-tier-reachable';

    var lockIcon = c.claimed ? '&#9989;' : (c.locked ? '&#128683;' : (reached ? '&#127873;' : '&#128274;'));

    html += '<div class="' + rowCls + '">';
    html += '<div class="fp-tier-status">' + lockIcon + '</div>';
    html += '<div class="fp-tier-info">';
    html += '<div class="fp-tier-number-badge">Tier ' + c.tier + '</div>';
    html += '<div class="fp-tier-name">' + c.icon + ' ' + _escFp(c.name) + '</div>';
    html += '<div class="fp-tier-desc">' + _escFp(c.desc) + '</div>';
    if (!c.claimed && !c.locked) {
      var xpLeft = Math.max(0, c.xpNeeded - state.xp);
      html += xpLeft > 0
        ? '<div class="fp-tier-xp-needed">' + xpLeft.toLocaleString() + ' XP needed</div>'
        : '<div class="fp-tier-xp-needed fp-tier-ready">Ready to claim! Complete more runs to auto-claim.</div>';
    }
    html += '</div>';
    html += '<div class="fp-tier-state">';
    if (c.claimed) {
      html += '<span class="fp-claimed-label">Claimed &#10003;</span>';
    } else if (c.locked) {
      html += '<span class="fp-expired-label">Expired</span>';
    } else if (reached) {
      html += '<span class="fp-pending-label">Awarded on completion</span>';
    } else {
      html += '<span class="fp-locked-label">Reach tier ' + c.tier + '</span>';
    }
    html += '</div>';
    html += '</div>'; // .fp-tier-row
  }
  html += '</div>'; // .fp-panel-cosmetics

  html += '<div class="fp-panel-note">Play expedition runs in the ' +
    state.biomeIcon + ' ' + _escFp(state.biomeName) + ' biome to earn XP (2× bonus runs).</div>';

  html += '</div>'; // .fp-panel-section
  return html;
}

function _escFp(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
