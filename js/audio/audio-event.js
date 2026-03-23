// Seasonal event audio — themed ambient layers, stingers, milestone sounds.
// Requires: audio/audio.js loaded first (masterCompressor, _volMusic, audioReady).
// Integration: seasonal event system calls these functions when events activate/deactivate.

// ── Data-driven event audio palettes ────────────────────────────────────────
// Each event theme defines its audio character. Add new events by adding entries.
const EVENT_AUDIO_PALETTES = {
  corruption: {
    name: 'The Corruption Spreads',
    // Ambient drone: low ominous pad
    drone: {
      type: 'sine',
      note: 'D2',
      volume: -24,
      envelope: { attack: 4.0, decay: 2.0, sustain: 0.7, release: 5.0 },
    },
    // Whisper layer: filtered noise for void presence
    whisper: {
      noiseType: 'brown',
      filterType: 'lowpass',
      filterFreq: 300,
      filterQ: 1.5,
      volume: -36,
      gain: 0.2,
    },
    // Minor-key pad chords — dark, unsettling
    padChords: [
      ['D3', 'F3', 'A3'],   // Dm
      ['Bb2', 'D3', 'F3'],  // Bb
      ['A2', 'C3', 'E3'],   // Am
    ],
    padVolume: -26,
    // Stinger: descending minor motif
    stingerNotes: ['D5', 'A4', 'F4', 'D4'],
    stingerSpacing: 0.15,
    // Block sound overrides: deeper, echoey
    blockPitchShift: -0.3,    // semitones down (rate multiplier)
    blockReverbWet: 0.6,      // more reverb on event blocks
    // Banner whoosh + chime
    bannerChimeNotes: ['D4', 'F4', 'A4'],
    // Milestone tier chimes (Bronze, Silver, Gold)
    milestoneTiers: {
      bronze: { notes: ['A4', 'C5', 'E5'], velocity: 0.4 },
      silver: { notes: ['C5', 'E5', 'G5', 'C6'], velocity: 0.5 },
      gold:   { notes: ['E5', 'G5', 'B5', 'E6', 'G6'], velocity: 0.6 },
    },
  },

  // Template for warm/bright events (festivals, celebrations)
  festival: {
    name: 'Festival Template',
    drone: {
      type: 'triangle',
      note: 'C3',
      volume: -22,
      envelope: { attack: 3.0, decay: 1.5, sustain: 0.8, release: 4.0 },
    },
    whisper: {
      noiseType: 'pink',
      filterType: 'bandpass',
      filterFreq: 1200,
      filterQ: 0.6,
      volume: -38,
      gain: 0.15,
    },
    padChords: [
      ['C4', 'E4', 'G4'],   // C
      ['F3', 'A3', 'C4'],   // F
      ['G3', 'B3', 'D4'],   // G
    ],
    padVolume: -24,
    stingerNotes: ['C5', 'E5', 'G5', 'C6'],
    stingerSpacing: 0.12,
    blockPitchShift: 0.1,
    blockReverbWet: 0.35,
    bannerChimeNotes: ['C5', 'E5', 'G5'],
    milestoneTiers: {
      bronze: { notes: ['C5', 'E5', 'G5'], velocity: 0.45 },
      silver: { notes: ['E5', 'G5', 'B5', 'E6'], velocity: 0.55 },
      gold:   { notes: ['G5', 'B5', 'D6', 'G6', 'B6'], velocity: 0.65 },
    },
  },

  // Template for cold/mystical events (winter, ice)
  frost: {
    name: 'Frost Template',
    drone: {
      type: 'sine',
      note: 'E2',
      volume: -26,
      envelope: { attack: 5.0, decay: 2.5, sustain: 0.6, release: 6.0 },
    },
    whisper: {
      noiseType: 'white',
      filterType: 'highpass',
      filterFreq: 4000,
      filterQ: 0.3,
      volume: -40,
      gain: 0.12,
    },
    padChords: [
      ['E3', 'G3', 'B3'],   // Em
      ['C3', 'E3', 'G3'],   // C
      ['A2', 'C3', 'E3'],   // Am
    ],
    padVolume: -28,
    stingerNotes: ['E5', 'B4', 'G4', 'E4', 'B3'],
    stingerSpacing: 0.18,
    blockPitchShift: 0.2,
    blockReverbWet: 0.55,
    bannerChimeNotes: ['E5', 'B5', 'E6'],
    milestoneTiers: {
      bronze: { notes: ['E4', 'B4', 'E5'], velocity: 0.4 },
      silver: { notes: ['B4', 'E5', 'G5', 'B5'], velocity: 0.5 },
      gold:   { notes: ['E5', 'B5', 'E6', 'G6', 'B6'], velocity: 0.6 },
    },
  },
};

// ── Seasonal event audio state ──────────────────────────────────────────────
const _sevt = {
  active:       false,
  themeId:      null,     // key into EVENT_AUDIO_PALETTES
  palette:      null,     // resolved palette object
  gain:         null,     // master event audio gain node
  reverb:       null,     // event-specific reverb (wetter than normal)
  // Layers
  droneSynth:   null,
  droneGain:    null,
  whisperNoise: null,
  whisperFilter:null,
  whisperGain:  null,
  padSynth:     null,
  padGain:      null,
  // Stinger synth (shared)
  stingerSynth: null,
  // Banner synth (shared)
  bannerSynth:  null,
  bannerWhoosh: null,
  // Milestone synth
  milestoneSynth: null,
  // Scheduling
  padLoopId:    null,     // setTimeout id for pad chord cycling
  // Session tracking
  stingerPlayed: false,   // activation stinger plays once per session
};

// ── Initialisation ──────────────────────────────────────────────────────────

/**
 * Initialise seasonal event audio nodes. Called once from initAudio().
 * Creates reusable synths that get reconfigured per-event theme.
 */
function _initEventAudio() {
  if (typeof Tone === 'undefined' || !masterCompressor) return;

  // Event-specific reverb — wetter and longer for atmospheric depth
  _sevt.reverb = new Tone.Reverb({ decay: 4.0, wet: 0.55 });
  _sevt.reverb.connect(masterCompressor);

  // Master event gain — starts silent
  _sevt.gain = new Tone.Gain(0).connect(_sevt.reverb);

  // Drone synth — low sustained tone
  _sevt.droneGain = new Tone.Gain(0).connect(_sevt.gain);
  _sevt.droneSynth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 4.0, decay: 2.0, sustain: 0.7, release: 5.0 },
  }).connect(_sevt.droneGain);
  _sevt.droneSynth.volume.value = -24;

  // Whisper layer — filtered noise for texture
  _sevt.whisperFilter = new Tone.Filter({ type: 'lowpass', frequency: 300, Q: 1.5 });
  _sevt.whisperGain = new Tone.Gain(0).connect(_sevt.gain);
  _sevt.whisperFilter.connect(_sevt.whisperGain);
  _sevt.whisperNoise = new Tone.Noise('brown').connect(_sevt.whisperFilter);
  _sevt.whisperNoise.volume.value = -36;

  // Pad synth — PolySynth for sustained chord washes
  _sevt.padGain = new Tone.Gain(0.5).connect(_sevt.gain);
  _sevt.padSynth = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 4,
    voice: Tone.Synth,
    options: {
      oscillator: { type: 'sine' },
      envelope: { attack: 2.5, decay: 2.0, sustain: 0.5, release: 3.5 },
    },
  }).connect(_sevt.padGain);
  _sevt.padSynth.volume.value = -26;

  // Stinger synth — for activation stinger and banner chime
  _sevt.stingerSynth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.02, decay: 0.5, sustain: 0.15, release: 1.2 },
  }).connect(masterCompressor); // stinger bypasses event gain (plays at SFX level)
  _sevt.stingerSynth.volume.value = -10;

  // Banner whoosh — short noise burst for banner appearance
  _sevt.bannerWhoosh = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.01, decay: 0.15, sustain: 0.0, release: 0.08 },
  }).connect(masterCompressor);
  _sevt.bannerWhoosh.volume.value = -20;

  // Banner chime synth — separate from stinger for layering
  _sevt.bannerSynth = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.03, decay: 0.6, sustain: 0.2, release: 1.0 },
  }).connect(masterCompressor);
  _sevt.bannerSynth.volume.value = -12;

  // Milestone synth — PolySynth for ascending tier chimes
  _sevt.milestoneSynth = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 6,
    voice: Tone.Synth,
    options: {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.04, decay: 0.7, sustain: 0.25, release: 2.0 },
    },
  }).connect(masterCompressor);
  _sevt.milestoneSynth.volume.value = -8;
}

// ── Event lifecycle ─────────────────────────────────────────────────────────

/**
 * Start seasonal event audio for a given theme.
 * Configures synths from the palette and fades in the ambient layer.
 * @param {string} themeId  Key into EVENT_AUDIO_PALETTES (e.g. 'corruption')
 */
function startSeasonalEventAudio(themeId) {
  if (!audioReady || !_sevt.gain) return;
  var palette = EVENT_AUDIO_PALETTES[themeId];
  if (!palette) {
    console.warn('Event audio: unknown theme "' + themeId + '"');
    return;
  }

  // Stop any existing event audio first
  if (_sevt.active) stopSeasonalEventAudio();

  _sevt.active = true;
  _sevt.themeId = themeId;
  _sevt.palette = palette;

  var cfg = palette;
  var fade = 5.0; // slow atmospheric fade-in

  // Configure drone from palette
  _sevt.droneSynth.oscillator.type = cfg.drone.type;
  _sevt.droneSynth.volume.value = cfg.drone.volume;
  _sevt.droneSynth.envelope.attack = cfg.drone.envelope.attack;
  _sevt.droneSynth.envelope.decay = cfg.drone.envelope.decay;
  _sevt.droneSynth.envelope.sustain = cfg.drone.envelope.sustain;
  _sevt.droneSynth.envelope.release = cfg.drone.envelope.release;
  _sevt.droneGain.gain.rampTo(0.4, fade);
  try { _sevt.droneSynth.triggerAttackRelease(cfg.drone.note, 60, Tone.now()); } catch (_e) {}

  // Configure whisper noise from palette
  try { _sevt.whisperNoise.stop(); } catch (_e) {}
  _sevt.whisperNoise = new Tone.Noise(cfg.whisper.noiseType).connect(_sevt.whisperFilter);
  _sevt.whisperNoise.volume.value = cfg.whisper.volume;
  _sevt.whisperFilter.type = cfg.whisper.filterType;
  _sevt.whisperFilter.frequency.value = cfg.whisper.filterFreq;
  _sevt.whisperFilter.Q.value = cfg.whisper.filterQ;
  _sevt.whisperGain.gain.rampTo(cfg.whisper.gain, fade);
  try { _sevt.whisperNoise.start(); } catch (_e) {}

  // Configure pad
  _sevt.padSynth.volume.value = cfg.padVolume;

  // Fade in master event gain
  _sevt.gain.gain.rampTo(_volMusic / 100 * 0.45, fade);

  // Start pad chord cycling
  _startEventPadLoop();

  // Play activation stinger (once per session)
  if (!_sevt.stingerPlayed) {
    _sevt.stingerPlayed = true;
    // Slight delay so ambient starts first
    setTimeout(function () {
      playSeasonalEventStinger();
    }, 800);
  }
}

/**
 * Stop seasonal event audio. Fades out all layers gracefully.
 */
function stopSeasonalEventAudio() {
  if (!_sevt.gain) return;
  _sevt.active = false;

  var fade = 3.0;

  // Fade out all gains
  _sevt.gain.gain.rampTo(0, fade);
  _sevt.droneGain.gain.rampTo(0, fade);
  _sevt.whisperGain.gain.rampTo(0, fade);

  // Stop pad loop
  _stopEventPadLoop();

  // Stop noise after fade
  setTimeout(function () {
    if (!_sevt.active) {
      try { _sevt.whisperNoise.stop(); } catch (_e) {}
    }
  }, (fade + 0.5) * 1000);

  _sevt.themeId = null;
  _sevt.palette = null;
}

/**
 * Reset seasonal event audio immediately (no fade). For game reset.
 */
function resetSeasonalEventAudio() {
  if (!_sevt.gain) return;
  _sevt.active = false;
  _sevt.gain.gain.cancelScheduledValues(Tone.now());
  _sevt.gain.gain.setValueAtTime(0, Tone.now());
  _sevt.droneGain.gain.cancelScheduledValues(Tone.now());
  _sevt.droneGain.gain.setValueAtTime(0, Tone.now());
  _sevt.whisperGain.gain.cancelScheduledValues(Tone.now());
  _sevt.whisperGain.gain.setValueAtTime(0, Tone.now());
  _stopEventPadLoop();
  try { _sevt.whisperNoise.stop(); } catch (_e) {}
  _sevt.themeId = null;
  _sevt.palette = null;
  _sevt.stingerPlayed = false;
}

// ── Pad chord loop ──────────────────────────────────────────────────────────

function _startEventPadLoop() {
  _stopEventPadLoop();
  var _chordIndex = 0;

  function playNextChord() {
    if (!_sevt.active || !_sevt.palette) return;
    var chords = _sevt.palette.padChords;
    var chord = chords[_chordIndex % chords.length];
    _chordIndex++;

    try {
      _sevt.padSynth.triggerAttackRelease(chord, 4.0, Tone.now(), 0.2);
    } catch (_e) {}

    // Next chord in 6-10 seconds — slow, breathing, C418-style
    var delay = 6000 + Math.random() * 4000;
    _sevt.padLoopId = setTimeout(playNextChord, delay);
  }

  // First chord after a brief pause
  _sevt.padLoopId = setTimeout(playNextChord, 2000);
}

function _stopEventPadLoop() {
  if (_sevt.padLoopId !== null) {
    clearTimeout(_sevt.padLoopId);
    _sevt.padLoopId = null;
  }
}

// ── Event activation stinger ────────────────────────────────────────────────

/**
 * Play the event activation stinger — short musical phrase (1-2 seconds).
 * Plays once per session when the event first loads.
 */
function playSeasonalEventStinger() {
  if (!audioReady || !_sevt.stingerSynth) return;
  var palette = _sevt.palette;
  if (!palette) return;

  var now = Tone.now();
  var notes = palette.stingerNotes;
  var spacing = palette.stingerSpacing;

  for (var i = 0; i < notes.length; i++) {
    try {
      _sevt.stingerSynth.triggerAttackRelease(
        notes[i], '8n', now + i * spacing, 0.4 + i * 0.05
      );
    } catch (_e) {}
  }
}

// ── Community goal milestone sounds ─────────────────────────────────────────

/**
 * Play community goal tier milestone sound.
 * Ascending chime sequence that gets grander with each tier.
 * @param {'bronze'|'silver'|'gold'} tier  The tier just reached
 */
function playEventMilestoneSound(tier) {
  if (!audioReady || !_sevt.milestoneSynth) return;

  // Use active event palette if available, otherwise default corruption
  var palette = _sevt.palette || EVENT_AUDIO_PALETTES.corruption;
  var tierCfg = palette.milestoneTiers[tier];
  if (!tierCfg) return;

  var now = Tone.now();
  var notes = tierCfg.notes;
  var vel = tierCfg.velocity;

  // Ascending arpeggio — each note slightly louder, wider spacing for gold
  var spacing = tier === 'gold' ? 0.18 : tier === 'silver' ? 0.15 : 0.12;

  for (var i = 0; i < notes.length; i++) {
    try {
      _sevt.milestoneSynth.triggerAttackRelease(
        notes[i], '4n', now + i * spacing, vel + i * 0.03
      );
    } catch (_e) {}
  }

  // Gold tier gets a bonus low rumble for weight
  if (tier === 'gold' && typeof rumbleSynth !== 'undefined' && rumbleSynth) {
    try {
      rumbleSynth.triggerAttackRelease('C1', '2n', now + 0.1);
    } catch (_e) {}
  }
}

// ── Event-specific block sounds ─────────────────────────────────────────────

/**
 * Get pitch rate multiplier for event-themed blocks.
 * Returns 1.0 if no event is active. Caller multiplies Howler rate by this.
 * @returns {number} Rate multiplier (< 1 = deeper, > 1 = higher)
 */
function getEventBlockPitchRate() {
  if (!_sevt.active || !_sevt.palette) return 1.0;
  var shift = _sevt.palette.blockPitchShift || 0;
  // Convert semitone shift to rate multiplier
  return Math.pow(2, shift / 12);
}

/**
 * Get reverb wet amount for event-themed block sounds.
 * Returns 0 if no event is active (use default reverb).
 * @returns {number} Wet amount (0-1), 0 means use default
 */
function getEventBlockReverbWet() {
  if (!_sevt.active || !_sevt.palette) return 0;
  return _sevt.palette.blockReverbWet || 0;
}

/**
 * Check if a block type is event-themed and should use modified sounds.
 * Called by playHitSound/playBreakSound to decide whether to apply event audio.
 * @param {string} objType  Block object type
 * @returns {boolean}
 */
function isEventThemedBlock(objType) {
  if (!_sevt.active) return false;
  // Corruption event: void blocks get special treatment
  if (_sevt.themeId === 'corruption') {
    return objType === 'void' || objType === 'corrupted';
  }
  // Frost event: ice blocks
  if (_sevt.themeId === 'frost') {
    return objType === 'ice' || objType === 'frost';
  }
  return false;
}

// ── Event banner audio ──────────────────────────────────────────────────────

/**
 * Play subtle whoosh + chime when the event banner appears on main menu.
 * Short and unobtrusive — a gentle notification, not a fanfare.
 */
function playEventBannerAudio() {
  if (!audioReady) return;

  var now = Tone.now();

  // Whoosh — soft pink noise burst
  if (_sevt.bannerWhoosh) {
    try {
      _sevt.bannerWhoosh.triggerAttackRelease('16n', now);
    } catch (_e) {}
  }

  // Chime — theme-specific or default
  if (_sevt.bannerSynth) {
    var palette = _sevt.palette || EVENT_AUDIO_PALETTES.corruption;
    var notes = palette.bannerChimeNotes;

    for (var i = 0; i < notes.length; i++) {
      try {
        _sevt.bannerSynth.triggerAttackRelease(
          notes[i], '8n', now + 0.08 + i * 0.1, 0.3
        );
      } catch (_e) {}
    }
  }
}

// ── Volume integration ──────────────────────────────────────────────────────

/**
 * Update seasonal event audio gain when volume settings change.
 * Called from applyAudioSettings(). Tracks music volume at 45%.
 * @param {number} musicVol  Music volume 0-100
 */
function applyEventAudioVolume(musicVol) {
  if (!_sevt.gain || !_sevt.active) return;
  _sevt.gain.gain.rampTo(musicVol / 100 * 0.45, 0.1);
}

// ── Query API ───────────────────────────────────────────────────────────────

/** Check if seasonal event audio is currently active. */
function isSeasonalEventAudioActive() {
  return _sevt.active;
}

/** Get current event theme ID, or null. */
function getSeasonalEventThemeId() {
  return _sevt.themeId;
}

/** Get list of available event audio theme IDs. */
function getAvailableEventThemes() {
  return Object.keys(EVENT_AUDIO_PALETTES);
}
