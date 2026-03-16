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

function _loadTheme() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "nether" || raw === "ocean" || raw === "candy") activeTheme = raw;
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
  document.body.classList.toggle("theme-nether", themeKey === "nether");
  document.body.classList.toggle("theme-ocean",  themeKey === "ocean");
  document.body.classList.toggle("theme-candy",  themeKey === "candy");

  // Resolve theme palette for material swapping.
  const THEME_PALETTE = { nether: NETHER_COLORS, ocean: OCEAN_COLORS, candy: CANDY_COLORS };
  const themePalette = THEME_PALETTE[themeKey] || null;

  // Swap materials on all existing block meshes (unless colorblind mode overrides).
  if (!colorblindMode) {
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
    { key: "classic", btnId: "theme-btn-classic" },
    { key: "nether",  btnId: "theme-btn-nether"  },
    { key: "ocean",   btnId: "theme-btn-ocean"   },
    { key: "candy",   btnId: "theme-btn-candy"   },
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
  document.body.classList.toggle("theme-nether", activeTheme === "nether");
  document.body.classList.toggle("theme-ocean",  activeTheme === "ocean");
  document.body.classList.toggle("theme-candy",  activeTheme === "candy");

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

  const cbToggle = document.getElementById("cb-toggle");
  if (cbToggle) {
    cbToggle.checked = colorblindMode;
    cbToggle.addEventListener("change", function() {
      applyColorblindMode(this.checked);
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
  ["classic", "nether", "ocean", "candy"].forEach(function(key) {
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
