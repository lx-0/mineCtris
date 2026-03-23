// Biome visual themes — board skins, sky overrides, and piece palettes for expedition biomes.
// Depends on: config.js (BIOME_*_COLORS, BIOME_*_TRAIL_EMISSIVE, BIOME_BORDER_COLORS,
//                         COLOR_TO_INDEX, NETHER_COLORS),
//             state.js (activeTheme, colorblindMode, worldGroup, fallingPiecesGroup),
//             world.js (createBlockMaterial), shaders.js (createBlockMaterial),
//             settings.js (applyTheme — used for restore only)

// ── Biome sky theme definitions ───────────────────────────────────────────────
// Format identical to _SEASON_SKY_THEMES in sky.js.
// zen/hor are [r,g,b] 0-255; tint is blend strength (0=none, 1=full override).
const _BIOME_SKY_THEMES = {
  stone: {
    zen: [  8,   8,  10], // near-black
    hor: [ 22,  16,  14], // very dark warm (deep cave glow)
    fog: new THREE.Color(0x0c0808),
    tint: 0.95,
  },
  forest: {
    zen: [  8,  28,   8], // dark forest canopy green
    hor: [ 18,  55,  18], // deep canopy green at horizon
    fog: new THREE.Color(0x0a1e08),
    tint: 0.78,
  },
  nether: {
    zen: [ 92,   0,   0], // deep crimson
    hor: [204,  51,   0], // burnt orange
    fog: new THREE.Color(0x7a1500),
    tint: 0.88,
  },
  ice: {
    zen: [160, 210, 240], // pale arctic blue zenith
    hor: [220, 240, 255], // near-white horizon
    fog: new THREE.Color(0xb8d8f0),
    tint: 0.82,
  },
};

// ── State ─────────────────────────────────────────────────────────────────────

let activeBiomeId = null;       // null = not in expedition biome mode
let _preBiomeTheme = 'classic'; // user's cosmetic theme before expedition

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the active biome sky theme object for sky.js to blend in,
 * or null when not in biome mode.
 */
function getActiveBiomeSkyTheme() {
  return activeBiomeId ? (_BIOME_SKY_THEMES[activeBiomeId] || null) : null;
}

/**
 * Apply biome visual theme — swaps piece palette, board skin colors, and sky.
 * Sets activeTheme to 'biome_<id>' so createBlockMesh picks up the biome palette.
 * Does NOT persist to localStorage (cleared on resetGame).
 */
function applyBiomeTheme(biomeId) {
  if (!biomeId) return;
  activeBiomeId = biomeId;

  const palette = _getBiomePalette(biomeId);

  // Swap materials on all existing block meshes
  if (!colorblindMode && palette) {
    [worldGroup, fallingPiecesGroup].forEach(function (group) {
      if (!group) return;
      group.traverse(function (obj) {
        if (!obj.userData || !obj.userData.isBlock) return;
        const canonHex = obj.userData.canonicalColor;
        if (canonHex === undefined) return;
        const idx = COLOR_TO_INDEX[canonHex];
        let newMat;
        if (idx !== undefined && palette[idx] !== null) {
          newMat = createBlockMaterial(palette[idx]);
        } else {
          newMat = createBlockMaterial(canonHex);
        }
        obj.material = newMat;
        obj.userData.originalColor = newMat.color.clone();
      });
    });
  }

  // Apply biome gameplay rules (fall speed, lock delay, board width, etc.)
  if (typeof applyBiomeRules === 'function') applyBiomeRules(biomeId);

  // Set activeTheme so newly spawned pieces and blocks use the biome palette
  activeTheme = 'biome_' + biomeId;

  // Apply CSS body class for HUD accent
  _applyBiomeBodyClass(biomeId);

  // Refresh next-pieces HUD
  if (typeof updateNextPiecesHUD === 'function') updateNextPiecesHUD();
}

/**
 * Restore the user's cosmetic theme after an expedition biome session ends.
 * Called automatically by resetGame() in gamestate.js.
 */
function clearBiomeTheme() {
  if (!activeBiomeId) return;
  activeBiomeId = null;

  // Clear biome gameplay rules
  if (typeof clearBiomeRules === 'function') clearBiomeRules();

  // Remove biome body classes
  _applyBiomeBodyClass(null);

  // Restore user's theme (applyTheme handles material swap + HUD refresh + save)
  if (typeof applyTheme === 'function') {
    applyTheme(_preBiomeTheme || 'classic');
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _getBiomePalette(biomeId) {
  switch (biomeId) {
    case 'stone':  return BIOME_STONE_COLORS;
    case 'forest': return BIOME_FOREST_COLORS;
    case 'nether': return NETHER_COLORS;
    case 'ice':    return BIOME_ICE_COLORS;
    default:       return null;
  }
}

function _applyBiomeBodyClass(biomeId) {
  ['stone', 'forest', 'nether', 'ice'].forEach(function (b) {
    document.body.classList.toggle('biome-' + b, b === biomeId);
  });
}

// ── CSS transition overlay ────────────────────────────────────────────────────
// Fades the screen to black, swaps the theme, then fades back — total < 1s.

function _runBiomeTransition(callback) {
  let overlay = document.getElementById('biome-transition-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'biome-transition-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;' +
      'transition:opacity 0.35s ease;z-index:9999;';
    document.body.appendChild(overlay);
  }

  // Fade in to black
  overlay.style.pointerEvents = 'all';
  requestAnimationFrame(function () {
    overlay.style.opacity = '1';
    setTimeout(function () {
      // Execute theme switch at peak opacity
      callback();
      // Fade back out
      requestAnimationFrame(function () {
        overlay.style.opacity = '0';
        setTimeout(function () {
          overlay.style.pointerEvents = 'none';
        }, 380);
      });
    }, 370); // wait for fade-in (350ms + 20ms buffer)
  });
}

// ── Biome entry banner ────────────────────────────────────────────────────────
// Brief centered banner shown when entering a biome (< 2s).

const _BIOME_BANNER_ICONS = {
  stone:  '&#9935;',   // ⛏
  forest: '&#127795;', // 🌳
  nether: '&#128293;', // 🔥
  ice:    '&#10052;',  // ❄
};

function _showBiomeBanner(biomeName, biomeId) {
  let banner = document.getElementById('biome-entry-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'biome-entry-banner';
    const icon = document.createElement('span');
    icon.className = 'biome-banner-icon';
    const name = document.createElement('span');
    name.className = 'biome-banner-name';
    banner.appendChild(icon);
    banner.appendChild(name);
    document.body.appendChild(banner);
  }
  banner.querySelector('.biome-banner-icon').innerHTML = _BIOME_BANNER_ICONS[biomeId] || '&#127758;';
  banner.querySelector('.biome-banner-name').textContent = biomeName || biomeId;
  banner.style.borderColor = _getBiomeBorderHex(biomeId);
  banner.classList.add('visible');
  clearTimeout(banner._hideTimer);
  banner._hideTimer = setTimeout(function () {
    banner.classList.remove('visible');
  }, 1800);
}

function _getBiomeBorderHex(biomeId) {
  const map = { stone: '#666', forest: '#2d6b22', nether: '#cc2200', ice: '#4499dd' };
  return map[biomeId] || '#fff';
}

// ── Expedition launch listener ────────────────────────────────────────────────

document.addEventListener('expeditionLaunch', function (e) {
  const node = e.detail && e.detail.node;
  if (!node || !node.biomeId) return;

  // Snapshot user's cosmetic theme before entering the biome
  _preBiomeTheme = (typeof activeTheme !== 'undefined') ? (activeTheme || 'classic') : 'classic';

  const biomeId = node.biomeId;
  const biomeName = node.biomeName || biomeId;

  _runBiomeTransition(function () {
    applyBiomeTheme(biomeId);
    // Show banner after theme is applied (visible against new background)
    setTimeout(function () { _showBiomeBanner(biomeName, biomeId); }, 150);
  });
});
