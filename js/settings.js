// Audio settings panel — persists to localStorage.
// Requires: audio.js (applyAudioSettings)

const AUDIO_SETTINGS_KEY = "mineCtris_audioSettings";

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

/** Called once during init() — loads persisted settings and wires sliders. */
function initSettings() {
  _loadAudioSettings();
  applyAudioSettings(_audioSettings.master, _audioSettings.sfx, _audioSettings.music);

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
}

/** Show the settings overlay. Optional onClose callback fires when panel is dismissed. */
function openSettings(onClose) {
  _settingsCloseCallback = onClose || null;
  _syncSliders();
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
