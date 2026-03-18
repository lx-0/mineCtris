// Season Pass — reward tiers, claim/equip pipeline, and Season Pass UI screen.
// Depends on: config.js (DIAMOND_SEASON_COLORS, COLOR_TO_INDEX, createBlockMaterial),
//             season.js (getSeasonConfig, getSeasonRankTier),
//             battle-rating.js (loadBattleRating),
//             state.js (activeTheme, colorblindMode, worldGroup, fallingPiecesGroup)

// ── Tier → reward definitions ─────────────────────────────────────────────────
// Ordered highest → lowest so iteration order matches the visual track (top = best).
const SEASON_PASS_REWARD_TIERS = [
  {
    tierId:  'diamond',
    name:    'Diamond',
    minPts:  2500,
    reward: {
      id:   'diamond_full_skin',
      name: 'Diamond Full Skin',
      desc: 'Diamond block set, board, HUD, piece shadow + animated title.',
      type: 'full_skin',
      icon: '&#128142;',
    },
  },
  {
    tierId:  'platinum',
    name:    'Platinum',
    minPts:  2000,
    reward: {
      id:   'platinum_board_badge',
      name: 'Platinum Board & Badge',
      desc: 'Animated platinum board border + player nameplate badge.',
      type: 'board_badge',
      icon: '&#129398;',
    },
  },
  {
    tierId:  'gold',
    name:    'Gold',
    minPts:  1500,
    reward: {
      id:   'gold_hud_ghost',
      name: 'Gold Frame & Ghost',
      desc: 'Gold HUD frame with gold piece ghost effect.',
      type: 'hud_ghost',
      icon: '&#11088;',
    },
  },
  {
    tierId:  'silver',
    name:    'Silver',
    minPts:  1000,
    reward: {
      id:   'silver_trail',
      name: 'Silver Trail',
      desc: 'Silver particle trail on piece placement.',
      type: 'trail',
      icon: '&#10024;',
    },
  },
  {
    tierId:  'bronze',
    name:    'Bronze',
    minPts:  0,
    reward: {
      id:   'bronze_hud_frame',
      name: 'Bronze HUD Frame',
      desc: 'Animated bronze border on your HUD panel.',
      type: 'hud_frame',
      icon: '&#129353;',
    },
  },
];

// ── Storage keys ──────────────────────────────────────────────────────────────
const _SP_REWARDS_KEY  = 'mineCtris_seasonRewards';
const _SP_COSMETIC_KEY = 'mineCtris_equippedSeasonCosmetic';

// ── Persistence helpers ───────────────────────────────────────────────────────

function _loadSeasonRewards() {
  try { return JSON.parse(localStorage.getItem(_SP_REWARDS_KEY) || '{}'); } catch (_) { return {}; }
}

function _saveSeasonRewards(rewards) {
  try { localStorage.setItem(_SP_REWARDS_KEY, JSON.stringify(rewards)); } catch (_) {}
}

function _loadEquippedCosmetic() {
  try { return localStorage.getItem(_SP_COSMETIC_KEY) || null; } catch (_) { return null; }
}

function _saveEquippedCosmetic(rewardId) {
  try {
    if (rewardId) localStorage.setItem(_SP_COSMETIC_KEY, rewardId);
    else          localStorage.removeItem(_SP_COSMETIC_KEY);
  } catch (_) {}
}

// ── Public queries ────────────────────────────────────────────────────────────

/** Returns true if the player has earned (and optionally claimed) the reward. */
function hasSeasonReward(rewardId) {
  const r = _loadSeasonRewards();
  return !!(r[rewardId]);
}

/** Returns true if the reward has been claimed (moved from earned → inventory). */
function isSeasonRewardClaimed(rewardId) {
  const r = _loadSeasonRewards();
  return !!(r[rewardId] && r[rewardId].claimed);
}

/** Returns the currently equipped season cosmetic ID, or null. */
function getEquippedSeasonCosmetic() {
  return _loadEquippedCosmetic();
}

// ── Grant rewards at season end ───────────────────────────────────────────────

/**
 * Grant all season rewards earned at or below the player's rating tier.
 * Idempotent — only grants rewards not already recorded.
 * @param {string} seasonId   The season that just ended.
 * @param {number} rating     Player's final season rating (0 for unranked).
 * @returns {Array}  Array of newly-granted tier definition objects.
 */
function grantSeasonRewards(seasonId, rating) {
  if (!seasonId) return [];
  const rewards  = _loadSeasonRewards();
  const newTiers = [];

  for (const tier of SEASON_PASS_REWARD_TIERS) {
    if ((rating || 0) >= tier.minPts) {
      const rid = tier.reward.id;
      if (!rewards[rid]) {
        rewards[rid] = { seasonId: seasonId, earnedAt: new Date().toISOString(), claimed: false };
        newTiers.push(tier);
      }
    }
  }

  _saveSeasonRewards(rewards);
  return newTiers;
}

// ── Claim & equip ─────────────────────────────────────────────────────────────

/** Mark an earned reward as claimed. Re-renders pass panel if open. */
function claimSeasonReward(rewardId) {
  const rewards = _loadSeasonRewards();
  if (!rewards[rewardId]) return;
  rewards[rewardId].claimed = true;
  _saveSeasonRewards(rewards);
  _renderSeasonPassPanel();
}

/**
 * Equip or toggle off a season cosmetic.
 * Only one cosmetic is active at a time.
 * Calling with the already-equipped ID unequips it.
 * @param {string|null} rewardId
 */
function equipSeasonCosmetic(rewardId) {
  const prev = _loadEquippedCosmetic();

  // Remove all cosmetic body classes
  document.body.classList.remove(
    'season-cosmetic-bronze',
    'season-cosmetic-silver',
    'season-cosmetic-gold',
    'season-cosmetic-platinum',
    'season-cosmetic-diamond'
  );
  document.body.classList.remove('theme-diamond-season');

  // Restore the base block theme if diamond skin was active
  if (prev === 'diamond_full_skin') {
    _restoreBaseTheme();
  }

  if (!rewardId || rewardId === prev) {
    // Toggle off — unequip
    _saveEquippedCosmetic(null);
    _renderSeasonPassPanel();
    return;
  }

  const tierDef = SEASON_PASS_REWARD_TIERS.find(function(t) { return t.reward.id === rewardId; });
  if (!tierDef || !isSeasonRewardClaimed(rewardId)) return;

  _saveEquippedCosmetic(rewardId);
  document.body.classList.add('season-cosmetic-' + tierDef.tierId);

  if (rewardId === 'diamond_full_skin') {
    _applyDiamondSeasonTheme();
  }

  _renderSeasonPassPanel();
}

/**
 * Re-apply the equipped season cosmetic on page load (after the 3-D scene is ready).
 * Call this from main.js after initWorld() / initGame().
 */
function restoreSeasonCosmetic() {
  const equipped = _loadEquippedCosmetic();
  if (!equipped) return;
  if (!isSeasonRewardClaimed(equipped)) {
    _saveEquippedCosmetic(null);
    return;
  }
  const tierDef = SEASON_PASS_REWARD_TIERS.find(function(t) { return t.reward.id === equipped; });
  if (!tierDef) return;
  document.body.classList.add('season-cosmetic-' + tierDef.tierId);
  if (equipped === 'diamond_full_skin') {
    _applyDiamondSeasonTheme();
  }
}

// ── Diamond season theme (hooks into existing block-material pipeline) ─────────

function _applyDiamondSeasonTheme() {
  // Mark activeTheme so new blocks are rendered with the diamond palette.
  activeTheme = 'diamond_season';
  document.body.classList.add('theme-diamond-season');

  // Swap materials on all existing block meshes.
  if (!colorblindMode && typeof createBlockMaterial === 'function') {
    [worldGroup, fallingPiecesGroup].forEach(function(group) {
      if (!group) return;
      group.traverse(function(obj) {
        if (!obj.userData || !obj.userData.isBlock) return;
        const canonHex = obj.userData.canonicalColor;
        if (canonHex === undefined) return;
        const idx = COLOR_TO_INDEX[canonHex];
        const palette = DIAMOND_SEASON_COLORS;
        const newMat = (idx !== undefined && palette[idx] != null)
          ? createBlockMaterial(palette[idx])
          : createBlockMaterial(canonHex);
        obj.material = newMat;
        obj.userData.originalColor = newMat.color.clone();
      });
    });
  }

  if (typeof updateNextPiecesHUD === 'function') updateNextPiecesHUD();
}

/** Restore the player's saved (non-season) theme after unequipping the diamond skin. */
function _restoreBaseTheme() {
  // Re-read the saved theme from storage and apply it via the normal pipeline.
  let savedTheme = 'classic';
  try {
    const raw = localStorage.getItem('mineCtris_theme');
    if (raw) savedTheme = raw;
  } catch (_) {}
  if (typeof applyTheme === 'function') applyTheme(savedTheme);
}

// ── Season Pass UI panel ───────────────────────────────────────────────────────

/**
 * Open the Season Pass panel (re-renders contents on each open so data is fresh).
 */
async function openSeasonPassPanel() {
  const overlay = document.getElementById('season-pass-overlay');
  if (overlay) overlay.style.display = 'flex';
  await _renderSeasonPassPanel();
}

/** Close the Season Pass panel. */
function closeSeasonPassPanel() {
  const overlay = document.getElementById('season-pass-overlay');
  if (overlay) overlay.style.display = 'none';
}

/** Build and inject the tier-track HTML into the panel body. */
async function _renderSeasonPassPanel() {
  const headerEl = document.getElementById('season-pass-header-info');
  const panel    = document.getElementById('season-pass-panel-body');
  if (!panel) return;

  const season  = (typeof getSeasonConfig === 'function') ? getSeasonConfig() : null;
  const rewards = _loadSeasonRewards();
  const equipped = _loadEquippedCosmetic();

  // Player's current battle rating (used for live progress display during an active season)
  let playerRating = 0;
  try {
    if (typeof loadBattleRating === 'function') {
      const bd = loadBattleRating();
      playerRating = bd.rating || 0;
    }
  } catch (_) {}

  // --- Header ---
  if (headerEl) {
    let hHtml = '';
    if (season) {
      const daysLeft = _spDaysRemaining(season);
      const tierObj  = (typeof getSeasonRankTier === 'function') ? getSeasonRankTier(playerRating) : null;
      hHtml += '<div class="sp-season-name">' + _escSp(season.name || 'Active Season') + '</div>';
      hHtml += '<div class="sp-season-meta">';
      if (tierObj) {
        hHtml += '<span class="season-rank-badge ' + tierObj.cls + '">' +
          tierObj.name + ' &mdash; ' + playerRating + ' pts</span> &nbsp;';
      }
      hHtml += '<span class="sp-days-left">' +
        (daysLeft > 0 ? daysLeft + (daysLeft === 1 ? ' day left' : ' days left') : 'Final day!') +
        '</span>';
      hHtml += '</div>';
    } else {
      hHtml = '<div class="sp-no-season">No active season. Rewards from past seasons are still claimable below.</div>';
    }
    headerEl.innerHTML = hHtml;
  }

  // --- Tier track ---
  let html = '';
  for (const tier of SEASON_PASS_REWARD_TIERS) {
    const rid         = tier.reward.id;
    const earned      = !!rewards[rid];
    const claimed     = !!(rewards[rid] && rewards[rid].claimed);
    const isEquipped  = equipped === rid;
    const reachable   = (playerRating >= tier.minPts) && !!season;

    let rowCls = 'sp-tier-row';
    if (reachable && !earned) rowCls += ' sp-tier-reachable';
    if (earned)               rowCls += ' sp-tier-earned';
    if (isEquipped)           rowCls += ' sp-tier-equipped';

    // Lock/unlock state icon
    const lockIcon = earned
      ? '&#9989;'    // green check — earned
      : (reachable ? '&#128197;' : '&#128274;'); // calendar or padlock

    html += '<div class="' + rowCls + '">';

    // Status column
    html += '<div class="sp-tier-status">' + lockIcon + '</div>';

    // Tier info column
    html += '<div class="sp-tier-info">';
    html += '<div class="sp-tier-name-badge season-rank-badge season-' + tier.tierId + '">' +
      tier.name + ' &mdash; ' + tier.minPts + ' pts</div>';
    html += '<div class="sp-reward-line">';
    html += '<span class="sp-reward-icon">' + tier.reward.icon + '</span>';
    html += '<span class="sp-reward-name">' + tier.reward.name + '</span>';
    html += '</div>';
    html += '<div class="sp-reward-desc">' + tier.reward.desc + '</div>';
    html += '</div>'; // .sp-tier-info

    // Action column
    html += '<div class="sp-tier-actions">';
    if (claimed) {
      html += '<button class="sp-equip-btn' + (isEquipped ? ' sp-equip-btn-active' : '') +
        '" onclick="equipSeasonCosmetic(\'' + rid + '\')">' +
        (isEquipped ? 'Equipped &#10003;' : 'Equip') + '</button>';
    } else if (earned) {
      html += '<button class="sp-claim-btn" onclick="claimSeasonReward(\'' + rid + '\')">Claim!</button>';
    } else if (reachable) {
      html += '<span class="sp-pending-label">Awarded at season end</span>';
    } else {
      html += '<span class="sp-locked-label">' +
        (season ? 'Reach ' + tier.minPts + ' pts' : 'Locked') + '</span>';
    }
    html += '</div>'; // .sp-tier-actions

    html += '</div>'; // .sp-tier-row
  }

  panel.innerHTML = html;

  // ── Featured Biome Pass section ───────────────────────────────────────────
  // Appended below the battle-rating tiers when a featured biome is set.
  const fpContainer = document.getElementById('season-pass-featured-body');
  if (fpContainer && typeof buildFeaturedPassPanelHtml === 'function') {
    fpContainer.innerHTML = buildFeaturedPassPanelHtml();
    fpContainer.style.display = fpContainer.innerHTML.trim() ? 'block' : 'none';
  }
}

/** Days remaining helper (mirrors private fn in season.js). */
function _spDaysRemaining(season) {
  if (!season || !season.endDate) return 0;
  const end  = new Date(season.endDate + 'T23:59:59Z');
  const diff = Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function _escSp(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Notification banner (shown in the end-of-season screen) ───────────────────

/**
 * Build an HTML snippet listing newly granted rewards.
 * Inserted into the season-end-screen by season.js after calling grantSeasonRewards().
 * @param {Array} newTiers  Array of tier definition objects returned by grantSeasonRewards().
 * @returns {string} HTML string, or empty string if nothing new.
 */
function buildRewardNotificationHtml(newTiers) {
  if (!newTiers || !newTiers.length) return '';
  let html = '<div class="season-reward-notification">';
  html += '<div class="season-reward-notif-title">&#127873; Season Rewards Unlocked!</div>';
  html += '<div class="season-reward-notif-body">';
  for (const tier of newTiers) {
    html += '<div class="season-reward-notif-item">' +
      '<span class="season-rank-badge season-' + tier.tierId + '">' + tier.name + '</span> ' +
      tier.reward.icon + ' ' + tier.reward.name +
      '</div>';
  }
  html += '<div class="season-reward-notif-hint">Open <strong>Season Pass</strong> on the main menu to claim &amp; equip your rewards.</div>';
  html += '</div></div>';
  return html;
}

// ── Init ───────────────────────────────────────────────────────────────────────

/**
 * Wire up the Season Pass button and close button.
 * Call once during page init (before game starts, no scene required).
 */
function initSeasonPassPanel() {
  const closeBtn = document.getElementById('season-pass-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeSeasonPassPanel);

  const openBtn = document.getElementById('mode-season-pass-btn');
  if (openBtn) openBtn.addEventListener('click', openSeasonPassPanel);

  // Apply earned cosmetic body class early (full 3-D restore happens in restoreSeasonCosmetic()).
  const equipped = _loadEquippedCosmetic();
  if (equipped && isSeasonRewardClaimed(equipped)) {
    const tierDef = SEASON_PASS_REWARD_TIERS.find(function(t) { return t.reward.id === equipped; });
    if (tierDef) document.body.classList.add('season-cosmetic-' + tierDef.tierId);
  }
}
