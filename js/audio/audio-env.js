// Environmental audio — biome ambience and birds.
// Requires: audio/audio.js loaded first.

function _initEnvironmentalAudio() {
  _env.reverb = new Tone.Reverb({ decay: 2.5, wet: 0.3 });
  _env.gain   = new Tone.Gain(0); // starts silent
  _env.reverb.connect(masterCompressor);
  _env.gain.connect(_env.reverb);

  // ── Surface wind — bandpass-filtered white noise ──
  _env.windFilter = new Tone.Filter({ type: 'bandpass', frequency: 800, Q: 0.5 });
  _env.windGain   = new Tone.Gain(0).connect(_env.gain);
  _env.windFilter.connect(_env.windGain);
  _env.windNoise = new Tone.Noise('white').connect(_env.windFilter);
  _env.windNoise.volume.value = -28;

  // ── Bird chirps — soft sine pings at randomised pitches ──
  _env.birdGain = new Tone.Gain(0).connect(_env.gain);
  _env.birdSynth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 0.08, sustain: 0.0, release: 0.12 },
  }).connect(_env.birdGain);
  _env.birdSynth.volume.value = -22;

  // ── Biome texture layer — noise synth through variable filter ──
  _env.biomeFilter = new Tone.Filter({ type: 'lowpass', frequency: 1200, Q: 1.0 });
  _env.biomeGain   = new Tone.Gain(0).connect(_env.gain);
  _env.biomeFilter.connect(_env.biomeGain);
  _env.biomeSynth = new Tone.Noise('pink').connect(_env.biomeFilter);
  _env.biomeSynth.volume.value = -30;
}

// Bird chirp notes — high register, mimicking distant songbird calls
var _ENV_BIRD_NOTES = ['E6', 'G6', 'A6', 'B6', 'D7', 'E7'];

/**
 * Schedule random bird chirps for surface ambience.
 * Fires 1–3 chirps every 3–8 seconds.
 */
function _envStartBirds() {
  if (_env.birdLoopId !== null) return;
  function chirp() {
    if (!_env.active || _env.currentEnv !== 'surface') return;
    var count = 1 + Math.floor(Math.random() * 3);
    var now = Tone.now();
    for (var i = 0; i < count; i++) {
      var note = _ENV_BIRD_NOTES[Math.floor(Math.random() * _ENV_BIRD_NOTES.length)];
      try {
        _env.birdSynth.triggerAttackRelease(note, 0.06, now + i * (0.1 + Math.random() * 0.15));
      } catch (_e) {}
    }
    // Schedule next chirp group
    var nextDelay = 3 + Math.random() * 5;
    _env.birdLoopId = setTimeout(chirp, nextDelay * 1000);
  }
  var initialDelay = 1 + Math.random() * 3;
  _env.birdLoopId = setTimeout(chirp, initialDelay * 1000);
}

function _envStopBirds() {
  if (_env.birdLoopId !== null) {
    clearTimeout(_env.birdLoopId);
    _env.birdLoopId = null;
  }
}

/**
 * Configure biome-specific texture. Adjusts filter and noise type.
 *   stone:  lowpass 600Hz, white noise — distant gravel rattle
 *   forest: bandpass 1400Hz, pink noise — rustling leaves
 *   nether: lowpass 400Hz, brown noise — deep magma hiss
 *   ice:    highpass 3000Hz, white noise — crystalline shimmer
 */
function _envApplyBiomeTexture(biomeId) {
  if (!_env.biomeSynth || !_env.biomeFilter) return;
  var fadeTime = 2.0;

  if (!biomeId) {
    // No biome — fade out texture layer
    _env.biomeGain.gain.rampTo(0, fadeTime);
    _env.currentBiome = null;
    return;
  }

  _env.currentBiome = biomeId;

  // Stop and reconfigure noise type
  try { _env.biomeSynth.stop(); } catch (_e) {}

  if (biomeId === 'stone') {
    _env.biomeSynth = new Tone.Noise('white').connect(_env.biomeFilter);
    _env.biomeSynth.volume.value = -32;
    _env.biomeFilter.type = 'lowpass';
    _env.biomeFilter.frequency.rampTo(600, fadeTime);
    _env.biomeFilter.Q.value = 0.8;
    _env.biomeGain.gain.rampTo(0.3, fadeTime);
  } else if (biomeId === 'forest') {
    _env.biomeSynth = new Tone.Noise('pink').connect(_env.biomeFilter);
    _env.biomeSynth.volume.value = -30;
    _env.biomeFilter.type = 'bandpass';
    _env.biomeFilter.frequency.rampTo(1400, fadeTime);
    _env.biomeFilter.Q.value = 0.6;
    _env.biomeGain.gain.rampTo(0.35, fadeTime);
  } else if (biomeId === 'nether') {
    _env.biomeSynth = new Tone.Noise('brown').connect(_env.biomeFilter);
    _env.biomeSynth.volume.value = -28;
    _env.biomeFilter.type = 'lowpass';
    _env.biomeFilter.frequency.rampTo(400, fadeTime);
    _env.biomeFilter.Q.value = 1.2;
    _env.biomeGain.gain.rampTo(0.4, fadeTime);
  } else if (biomeId === 'ice') {
    _env.biomeSynth = new Tone.Noise('white').connect(_env.biomeFilter);
    _env.biomeSynth.volume.value = -34;
    _env.biomeFilter.type = 'highpass';
    _env.biomeFilter.frequency.rampTo(3000, fadeTime);
    _env.biomeFilter.Q.value = 0.4;
    _env.biomeGain.gain.rampTo(0.25, fadeTime);
  }

  if (_env.active) {
    try { _env.biomeSynth.start(); } catch (_e) {}
  }
}

/**
 * Crossfade to surface environment.
 * Wind noise up, birds on.
 */
function _envTransitionToSurface() {
  var fade = 3.0;
  _env.currentEnv = 'surface';

  // Wind up
  _env.windGain.gain.rampTo(0.5, fade);
  try { _env.windNoise.start(); } catch (_e) {}

  // Birds on
  _env.birdGain.gain.rampTo(0.4, fade);
  _envStartBirds();

  // Reverb — light for surface
  _env.reverb.decay = 2.0;
  _env.reverb.wet.rampTo(0.2, fade);

  // Wind filter — broader for open air
  _env.windFilter.frequency.rampTo(800, fade);
  _env.windFilter.Q.value = 0.5;
}

/**
 * Public API — update environmental audio based on current game state.
 * @param {string|null} biomeId — 'stone'|'forest'|'nether'|'ice'|null
 */
function updateEnvironmentalAudio(biomeId) {
  if (!_env.gain || !_env.active) return;

  // Ensure surface environment
  if (_env.currentEnv !== 'surface') {
    _envTransitionToSurface();
  }

  // Biome texture update — play discovery stinger on new biome transitions
  if (biomeId !== _env.currentBiome) {
    if (biomeId && _env.currentBiome !== null) {
      if (typeof playBiomeDiscoveryStinger === 'function') playBiomeDiscoveryStinger();
    }
    _envApplyBiomeTexture(biomeId);
  }
}

/** Start environmental audio — called alongside startBgMusic(). */
function startEnvironmentalAudio() {
  if (!audioReady || !_env.gain || _env.active) return;
  _env.active = true;
  _env.currentEnv = 'none';
  _env.currentBiome = null;
  _env.currentDepth = 0;

  // Fade in master environmental gain
  _env.gain.gain.rampTo(_volMusic / 100 * 0.5, 3); // 50% of music volume

  // Start noise generators
  try { _env.windNoise.start(); } catch (_e) {}

  // Default to surface
  _envTransitionToSurface();
}

/** Stop environmental audio — called alongside stopBgMusic(). */
function stopEnvironmentalAudio() {
  if (!_env.gain || !_env.active) return;
  _env.active = false;

  // Fade out
  _env.gain.gain.rampTo(0, 3);
  _envStopBirds();

  setTimeout(function() {
    if (!_env.active) {
      try { _env.windNoise.stop(); } catch (_e) {}
      try { _env.biomeSynth.stop(); } catch (_e) {}
    }
  }, 3500);
}

/** Immediately silence environmental audio on game reset. */
function resetEnvironmentalAudio() {
  if (!_env.gain) return;
  _env.active = false;
  _env.gain.gain.cancelScheduledValues(Tone.now());
  _env.gain.gain.setValueAtTime(0, Tone.now());
  _envStopBirds();
  try { _env.windNoise.stop(); } catch (_e) {}
  try { _env.biomeSynth.stop(); } catch (_e) {}
  _env.currentEnv   = 'none';
  _env.currentBiome = null;
}

// ── SFX helpers ───────────────────────────────────────────────────────────────

// Block-type pitch tables — 3 variations each, musically tuned to harmonise
// with the ambient music key centres (A, C, E, D natural minor roots).
const _BLOCK_HIT_PITCHES = {
  wood:   ['G4', 'A4', 'D4'],
  stone:  ['E3', 'G3', 'A3'],
  leaf:   ['C5', 'E5', 'G5'],
  rubble: ['D3', 'E3', 'F3'],
  generic:['A3', 'C4', 'E4'],
};
const _BLOCK_BREAK_PITCHES = {
  wood:   ['B4', 'D5', 'G4'],
  stone:  ['A3', 'C4', 'E3'],
  leaf:   ['E5', 'G5', 'A5'],
  rubble: ['F3', 'G3', 'A3'],
  generic:['C4', 'E4', 'G4'],
};

/** Pick a random element from an array. */
