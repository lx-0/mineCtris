// Audio + accessibility settings panel — persists to localStorage.
// Requires: audio.js (applyAudioSettings), state.js (colorblindMode, activeTheme),
//           world.js (createBlockMesh), shaders.js (createBlockMaterialColorblind),
//           achievements.js (loadAchievements)

const AUDIO_SETTINGS_KEY = "mineCtris_audioSettings";
const COLORBLIND_KEY = "mineCtris_colorblindMode";
const THEME_STORAGE_KEY = "mineCtris_theme";

let _audioSettings = { master: 80, sfx: 100, music: 60 };
let _settingsCloseCallback = null;

function _loadAudioSettings() {
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      _audioSettings = {
        master: typeof p.master === "number" ? p.master : 80,
        sfx:    typeof p.sfx   === "number" ? p.sfx   : 100,
        music:  typeof p.music === "number" ? p.music :  60,
      };
    }
  } catch (_) {}
}

function _saveAudioSettings() {
  try {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(_audioSettings));
  } catch (_) {}
}

function _syncSliders() {
  const ids = [
    ["vol-master", "vol-master-val", "master"],
    ["vol-sfx",    "vol-sfx-val",    "sfx"],
    ["vol-music",  "vol-music-val",  "music"],
  ];
  for (const [sliderId, valId, key] of ids) {
    const slider = document.getElementById(sliderId);
    const label  = document.getElementById(valId);
    if (slider) slider.value = _audioSettings[key];
    if (label)  label.textContent = _audioSettings[key];
  }
}

// ── Colorblind mode ───────────────────────────────────────────────────────────

function _loadColorblindMode() {
  try {
    const raw = localStorage.getItem(COLORBLIND_KEY);
    if (raw !== null) colorblindMode = (raw === "true");
  } catch (_) {}
}

function _saveColorblindMode() {
  try {
    localStorage.setItem(COLORBLIND_KEY, String(colorblindMode));
  } catch (_) {}
}

/**
 * Apply colorblind mode globally: swap materials on all existing block meshes
 * and refresh the next-piece preview.
 */
function applyColorblindMode(enabled) {
  colorblindMode = enabled;
  _saveColorblindMode();

  // Update all existing block meshes in the world and falling groups.
  [worldGroup, fallingPiecesGroup].forEach(function(group) {
    if (!group) return;
    group.traverse(function(obj) {
      if (!obj.userData || !obj.userData.isBlock) return;
      const canonHex = obj.userData.canonicalColor;
      if (canonHex === undefined) return;

      let newMat;
      if (enabled) {
        const cbIdx = COLOR_TO_INDEX[canonHex];
        if (cbIdx !== undefined && COLORBLIND_COLORS[cbIdx] !== null) {
          newMat = createBlockMaterialColorblind(COLORBLIND_COLORS[cbIdx], COLORBLIND_PATTERNS[cbIdx]);
        } else {
          newMat = createBlockMaterial(canonHex);
        }
      } else {
        newMat = createBlockMaterial(canonHex);
        // Re-apply lava emissive for standard mode.
        const matName = COLOR_TO_MATERIAL[canonHex];
        if (matName && BLOCK_TYPES[matName] && BLOCK_TYPES[matName].effect === "lava_glow") {
          const lavaEmissive = new THREE.Color(0x220800);
          newMat.emissive = lavaEmissive;
          newMat.needsUpdate = true;
          obj.userData.defaultEmissive = lavaEmissive.clone();
        }
      }

      obj.material = newMat;
      // Update originalColor so mining damage tinting reflects the new display color.
      obj.userData.originalColor = newMat.color.clone();
    });
  });

  // Refresh next-pieces HUD colors.
  if (typeof updateNextPiecesHUD === 'function') updateNextPiecesHUD();

  // Sync toggle checkbox visual state.
  const toggle = document.getElementById("cb-toggle");
  if (toggle) toggle.checked = enabled;
}

// ── Theme system ───────────────────────────────────────────────────────────────

const _ALL_THEMES = ["classic", "nether", "ocean", "candy", "fossil", "storm", "void", "legendary"];

function _loadTheme() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (_ALL_THEMES.includes(raw)) activeTheme = raw;
    else activeTheme = "classic";
  } catch (_) {}
}

function _saveTheme() {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, activeTheme);
  } catch (_) {}
}

/** Return true if the given theme key is currently unlocked. */
function isThemeUnlocked(themeKey) {
  if (themeKey === "classic") return true;
  // Level-gated skins (fossil, storm, void, legendary)
  if (typeof isLevelThemeUnlocked === 'function') {
    const levelThemes = ["fossil", "storm", "void", "legendary"];
    if (levelThemes.includes(themeKey)) return isLevelThemeUnlocked(themeKey);
  }
  try {
    const achs = loadAchievements ? loadAchievements() : {};
    if (themeKey === "nether") return !!achs["iron_will"];
    if (themeKey === "ocean")  return !!achs["architect"];
    if (themeKey === "candy")  return !!achs["sprinter"];
  } catch (_) {}
  return false;
}

/**
 * Apply a theme globally: swap materials on all existing block meshes,
 * refresh next-piece HUD, and update HUD accent CSS class on <body>.
 */
function applyTheme(themeKey) {
  if (!isThemeUnlocked(themeKey)) return;
  activeTheme = themeKey;
  _saveTheme();

  // Update HUD accent classes on body.
  document.body.classList.toggle("theme-nether",    themeKey === "nether");
  document.body.classList.toggle("theme-ocean",     themeKey === "ocean");
  document.body.classList.toggle("theme-candy",     themeKey === "candy");
  document.body.classList.toggle("theme-fossil",    themeKey === "fossil");
  document.body.classList.toggle("theme-storm",     themeKey === "storm");
  document.body.classList.toggle("theme-void",      themeKey === "void");
  document.body.classList.toggle("theme-legendary", themeKey === "legendary");

  // Resolve theme palette for material swapping.
  const THEME_PALETTE = {
    nether:         NETHER_COLORS,
    ocean:          OCEAN_COLORS,
    candy:          CANDY_COLORS,
    fossil:         FOSSIL_COLORS,
    storm:          STORM_COLORS,
    void:           VOID_COLORS,
    legendary:      LEGENDARY_COLORS,
    diamond_season: (typeof DIAMOND_SEASON_COLORS !== 'undefined' ? DIAMOND_SEASON_COLORS : null),
    cosmetic_carved_stone_board:   (typeof COSMETIC_CARVED_STONE_COLORS   !== 'undefined' ? COSMETIC_CARVED_STONE_COLORS   : null),
    cosmetic_ore_vein_theme:       (typeof COSMETIC_ORE_VEIN_COLORS       !== 'undefined' ? COSMETIC_ORE_VEIN_COLORS       : null),
    cosmetic_mossy_overgrown_board:(typeof COSMETIC_MOSSY_OVERGROWN_COLORS !== 'undefined' ? COSMETIC_MOSSY_OVERGROWN_COLORS : null),
    cosmetic_leaf_block_theme:     (typeof COSMETIC_LEAF_BLOCK_COLORS     !== 'undefined' ? COSMETIC_LEAF_BLOCK_COLORS     : null),
    cosmetic_obsidian_forge_board: (typeof COSMETIC_OBSIDIAN_FORGE_COLORS !== 'undefined' ? COSMETIC_OBSIDIAN_FORGE_COLORS : null),
    cosmetic_magma_theme:          (typeof COSMETIC_MAGMA_COLORS          !== 'undefined' ? COSMETIC_MAGMA_COLORS          : null),
    cosmetic_frozen_tundra_board:  (typeof COSMETIC_FROZEN_TUNDRA_COLORS  !== 'undefined' ? COSMETIC_FROZEN_TUNDRA_COLORS  : null),
    cosmetic_crystal_theme:        (typeof COSMETIC_CRYSTAL_COLORS        !== 'undefined' ? COSMETIC_CRYSTAL_COLORS        : null),
  };
  const themePalette = THEME_PALETTE[themeKey] || null;

  // Swap materials on all existing block meshes (unless colorblind mode or block skin overrides).
  // When a block skin is active, the skin owns all material colors — skip theme swaps.
  if (!colorblindMode && !(activeBlockSkin && typeof BLOCK_SKIN_PALETTES !== 'undefined' && BLOCK_SKIN_PALETTES[activeBlockSkin])) {
    [worldGroup, fallingPiecesGroup].forEach(function(group) {
      if (!group) return;
      group.traverse(function(obj) {
        if (!obj.userData || !obj.userData.isBlock) return;
        const canonHex = obj.userData.canonicalColor;
        if (canonHex === undefined) return;

        let newMat;
        if (themePalette) {
          const idx = COLOR_TO_INDEX[canonHex];
          if (idx !== undefined && themePalette[idx] !== null) {
            newMat = createBlockMaterial(themePalette[idx]);
          } else {
            newMat = createBlockMaterial(canonHex);
          }
        } else {
          // Classic — restore canonical color material.
          newMat = createBlockMaterial(canonHex);
          // Re-apply lava emissive for classic mode.
          const matName = COLOR_TO_MATERIAL[canonHex];
          if (matName && BLOCK_TYPES[matName] && BLOCK_TYPES[matName].effect === "lava_glow") {
            const lavaEmissive = new THREE.Color(0x220800);
            newMat.emissive = lavaEmissive;
            newMat.needsUpdate = true;
            obj.userData.defaultEmissive = lavaEmissive.clone();
          }
        }

        obj.material = newMat;
        obj.userData.originalColor = newMat.color.clone();
      });
    });
  }

  // Refresh next-pieces HUD colors.
  if (typeof updateNextPiecesHUD === 'function') updateNextPiecesHUD();

  // Sync theme button visual state.
  _syncThemeButtons();
}

/** Sync theme selector button states (locked/selected). */
function _syncThemeButtons() {
  const themes = [
    { key: "classic",   btnId: "theme-btn-classic"   },
    { key: "nether",    btnId: "theme-btn-nether"    },
    { key: "ocean",     btnId: "theme-btn-ocean"     },
    { key: "candy",     btnId: "theme-btn-candy"     },
    { key: "fossil",    btnId: "theme-btn-fossil"    },
    { key: "storm",     btnId: "theme-btn-storm"     },
    { key: "void",      btnId: "theme-btn-void"      },
    { key: "legendary", btnId: "theme-btn-legendary" },
  ];
  themes.forEach(function(t) {
    const btn = document.getElementById(t.btnId);
    if (!btn) return;
    const unlocked = isThemeUnlocked(t.key);
    btn.classList.toggle("theme-btn-selected", activeTheme === t.key);
    btn.classList.toggle("theme-btn-locked", !unlocked);
    btn.disabled = !unlocked;
  });
}

/** Called once during init() — loads persisted settings and wires sliders. */
function initSettings() {
  _loadAudioSettings();
  applyAudioSettings(_audioSettings.master, _audioSettings.sfx, _audioSettings.music);
  _loadColorblindMode();
  _loadTheme();
  // Apply persisted theme body class without triggering a material swap on init
  // (blocks don't exist yet — createBlockMesh will pick up activeTheme directly).
  document.body.classList.toggle("theme-nether",    activeTheme === "nether");
  document.body.classList.toggle("theme-ocean",     activeTheme === "ocean");
  document.body.classList.toggle("theme-candy",     activeTheme === "candy");
  document.body.classList.toggle("theme-fossil",    activeTheme === "fossil");
  document.body.classList.toggle("theme-storm",     activeTheme === "storm");
  document.body.classList.toggle("theme-void",      activeTheme === "void");
  document.body.classList.toggle("theme-legendary", activeTheme === "legendary");

  function makeHandler(key, valId) {
    return function () {
      const v = parseInt(this.value, 10);
      const label = document.getElementById(valId);
      if (label) label.textContent = v;
      _audioSettings[key] = v;
      _saveAudioSettings();
      applyAudioSettings(_audioSettings.master, _audioSettings.sfx, _audioSettings.music);
    };
  }

  const masterSlider = document.getElementById("vol-master");
  const sfxSlider    = document.getElementById("vol-sfx");
  const musicSlider  = document.getElementById("vol-music");
  if (masterSlider) masterSlider.addEventListener("input", makeHandler("master", "vol-master-val"));
  if (sfxSlider)    sfxSlider.addEventListener("input",    makeHandler("sfx",    "vol-sfx-val"));
  if (musicSlider)  musicSlider.addEventListener("input",  makeHandler("music",  "vol-music-val"));

  const closeBtn = document.getElementById("settings-close-btn");
  if (closeBtn) closeBtn.addEventListener("click", closeSettings);

  // Wire up metrics dashboard button
  const metricsBtn = document.getElementById("settings-metrics-btn");
  if (metricsBtn) {
    metricsBtn.addEventListener("click", function () {
      if (typeof openMetricsDashboard === 'function') openMetricsDashboard();
    });
  }

  // Wire up replay tutorial button
  const replayTutBtn = document.getElementById("settings-replay-tutorial-btn");
  if (replayTutBtn) {
    replayTutBtn.addEventListener("click", function () {
      try { localStorage.setItem('mineCtris_tutorialDone', ''); } catch (_e) {}
      try { localStorage.setItem('mineCtris_craftHintShown', ''); } catch (_e) {}
      // Show confirmation via event-end-toast (reusable toast element)
      var toast = document.getElementById("event-end-toast");
      if (toast) {
        toast.textContent = "\uD83C\uDF93 Tutorial will play on your next game.";
        toast.classList.remove("toast-visible");
        void toast.offsetWidth;
        toast.style.display = "block";
        toast.classList.add("toast-visible");
        clearTimeout(toast._tutReplayTimer);
        toast._tutReplayTimer = setTimeout(function () {
          toast.classList.remove("toast-visible");
          setTimeout(function () { toast.style.display = "none"; }, 400);
        }, 3100);
      }
      closeSettings();
    });
  }
  var metricsCloseBtn = document.getElementById("metrics-close-btn");
  if (metricsCloseBtn) {
    metricsCloseBtn.addEventListener("click", function () {
      if (typeof closeMetricsDashboard === 'function') closeMetricsDashboard();
    });
  }
  var metricsClearBtn = document.getElementById("metrics-clear-btn");
  if (metricsClearBtn) {
    metricsClearBtn.addEventListener("click", function () {
      if (typeof metricsClearAll === 'function') metricsClearAll();
      if (typeof openMetricsDashboard === 'function') openMetricsDashboard();
    });
  }

  const cbToggle = document.getElementById("cb-toggle");
  if (cbToggle) {
    cbToggle.checked = colorblindMode;
    cbToggle.addEventListener("change", function() {
      applyColorblindMode(this.checked);
    });
  }

  // Wire up "Show all modes" toggle.
  const samToggle = document.getElementById("show-all-modes-toggle");
  if (samToggle) {
    samToggle.checked = (typeof isShowAllModesEnabled === "function") && isShowAllModesEnabled();
    samToggle.addEventListener("change", function() {
      if (typeof setShowAllModes === "function") setShowAllModes(this.checked);
    });
  }

  // Wire up display name field.
  const dnInput    = document.getElementById("settings-displayname-input");
  const dnSaveBtn  = document.getElementById("settings-displayname-save-btn");
  const dnFeedback = document.getElementById("settings-displayname-feedback");
  if (dnSaveBtn && dnInput) {
    dnSaveBtn.addEventListener("click", function() {
      const val = dnInput.value.trim();
      if (!/^[a-zA-Z0-9_]{1,16}$/.test(val)) {
        if (dnFeedback) { dnFeedback.textContent = "Letters, numbers and _ only (max 16)"; dnFeedback.style.color = "#f55"; }
        return;
      }
      if (typeof saveDisplayName === "function") saveDisplayName(val);
      if (dnFeedback) {
        dnFeedback.textContent = "Saved!";
        dnFeedback.style.color = "#0f0";
        clearTimeout(dnFeedback._t);
        dnFeedback._t = setTimeout(function() { dnFeedback.textContent = ""; }, 1500);
      }
    });
  }

  // Wire up theme buttons.
  ["classic", "nether", "ocean", "candy", "fossil", "storm", "void", "legendary"].forEach(function(key) {
    const btn = document.getElementById("theme-btn-" + key);
    if (!btn) return;
    btn.addEventListener("click", function() {
      if (isThemeUnlocked(key)) applyTheme(key);
    });
  });
}

function _syncDisplayNameField() {
  const input = document.getElementById("settings-displayname-input");
  if (input && typeof loadDisplayName === "function") input.value = loadDisplayName();
}

/** Show the settings overlay. Optional onClose callback fires when panel is dismissed. */
function openSettings(onClose) {
  _settingsCloseCallback = onClose || null;
  _syncSliders();
  const cbToggle = document.getElementById("cb-toggle");
  if (cbToggle) cbToggle.checked = colorblindMode;
  const samToggleSync = document.getElementById("show-all-modes-toggle");
  if (samToggleSync) samToggleSync.checked = (typeof isShowAllModesEnabled === "function") && isShowAllModesEnabled();
  _syncThemeButtons();
  _syncDisplayNameField();
  const overlay = document.getElementById("settings-overlay");
  if (overlay) overlay.style.display = "flex";
}

/** Hide the settings overlay and invoke the close callback if any. */
function closeSettings() {
  const overlay = document.getElementById("settings-overlay");
  if (overlay) overlay.style.display = "none";
  if (_settingsCloseCallback) {
    const cb = _settingsCloseCallback;
    _settingsCloseCallback = null;
    cb();
  }
}
