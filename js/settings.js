// Audio + accessibility settings panel — persists to localStorage.
// Requires: audio.js (applyAudioSettings), state.js (colorblindMode),
//           world.js (createBlockMesh), shaders.js (createBlockMaterialColorblind)

const AUDIO_SETTINGS_KEY = "mineCtris_audioSettings";
const COLORBLIND_KEY = "mineCtris_colorblindMode";

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

/** Called once during init() — loads persisted settings and wires sliders. */
function initSettings() {
  _loadAudioSettings();
  applyAudioSettings(_audioSettings.master, _audioSettings.sfx, _audioSettings.music);
  _loadColorblindMode();

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
}

/** Show the settings overlay. Optional onClose callback fires when panel is dismissed. */
function openSettings(onClose) {
  _settingsCloseCallback = onClose || null;
  _syncSliders();
  const cbToggle = document.getElementById("cb-toggle");
  if (cbToggle) cbToggle.checked = colorblindMode;
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
