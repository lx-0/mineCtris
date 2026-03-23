// Audio system — Howler.js for SFX, Tone.js for musical events.
// Requires: state.js (audioReady)

// Volume levels (0–100), applied by applyAudioSettings()
let _volMaster = 80;
let _volSfx    = 100;
let _volMusic  = 60;

// Howler sound instances (populated in initAudio)
const sfx = {};

// Tone.js musical synths (line-clear arpeggio + rumble + game-over jingle)
let clearSynth = null;
let rumbleSynth = null;
let gameOverSynth = null;
let stormSwooshSynth = null;
let goldenChimeSynth = null;
let goldenFanfareSynth = null;
let creeperHissSynth = null;
let creeperBoomSynth = null;
let _creeperHissGain = null;
let crumbleCrackleSynth = null;
let magmaSizzleSynth    = null;
let _magmaSizzleGain    = null;
let voidHumSynth        = null;
let entropySynth        = null;
// ── Enhanced SFX synths ─────────────────────────────────────────────────────
let blockHitSynth       = null;   // Tone.js layer for block hits (musical pitch)
let blockBreakSynth     = null;   // Tone.js layer for block breaks
let blockPlaceSynth     = null;   // tonal click for satisfying placement
let _placeReverb        = null;   // dedicated reverb for placement sound
let levelUpSynth        = null;   // stinger synth for level-up events
let biomeDiscoverSynth  = null;   // stinger synth for new biome discovery
// ── Infinite Depths synths ────────────────────────────────────────────────────
let _depthDroneSynth    = null;   // low drone that darkens with descent number
let _depthDroneGain     = null;
let _depthNoiseSynth    = null;   // filtered noise layer — distortion/tension
let _depthNoiseFilter   = null;
let _depthNoiseGain     = null;
let _descentStingSynth  = null;   // PolySynth for descent completion sting
let _extractSynth       = null;   // PolySynth for extraction success
let _milestoneSynth     = null;   // PolySynth for milestone reach
let _milestoneRumble    = null;   // MembraneSynth rumble accent for milestones
let _bossEscalationSynth = null;  // PolySynth for boss phase escalation hits
let masterCompressor = null;
let masterReverb = null;
let masterLimiter = null;

// ── Environmental soundscape system state ────────────────────────────────────
// Biome-aware ambient layers: wind, drips, drones, biome textures.
// Crossfades smoothly between surface / underground / biome environments.
const _env = {
  gain:       null,   // master environmental gain node
  reverb:     null,   // environmental reverb (adjustable wet for depth)
  // Layers
  windNoise:  null,   // filtered noise for surface wind
  windFilter: null,   // bandpass filter on wind noise
  windGain:   null,
  birdSynth:  null,   // sine synth for bird chirps
  birdGain:   null,
  dripSynth:  null,   // sine synth for cave drip pings
  dripGain:   null,
  droneSynth: null,   // low sine drone for underground
  droneGain:  null,
  biomeGain:  null,   // gain for biome-specific texture layer
  biomeSynth: null,   // synth for biome texture (changes per biome)
  biomeFilter: null,  // filter for biome texture shaping
  // State
  active:      false,
  currentEnv:  'none', // 'surface' | 'underground' | 'none'
  currentBiome: null,  // 'stone' | 'forest' | 'nether' | 'ice' | null
  currentDepth: 0,     // 0 = surface, 1+ = floor depth
  birdLoopId:  null,   // scheduled bird chirp interval
  dripLoopId:  null,   // scheduled drip interval
};

// ── Infinite Depths ambient state ─────────────────────────────────────────────
const _depthAmb = {
  active:         false,
  currentDescent: 0,     // 0 = not in infinite mode
  droneActive:    false,
};

// Milestone Descent numbers where cosmetic rewards unlock
const _INFINITE_MILESTONES = [2, 4, 7, 10, 15]; // Descents ≈ floors 14, 28, 49, 70, 100+

// ── Ambient music system state ───────────────────────────────────────────────
let bgMusicPlaying = false;
const _amb = {
  gain:       null,   // master music gain node
  reverb:     null,   // dedicated music reverb (warmer, longer than SFX)
  piano:      null,   // PolySynth for piano motifs
  pad:        null,   // warm pad layer
  padGain:    null,
  bass:       null,   // low sine drone
  bassGain:   null,
  // Scheduling state
  mood:       'calm', // 'calm' | 'tense' | 'intense' | 'menu'
  nextPhrase: 0,      // Tone.now() time for next phrase
  silenceUntil: 0,    // breathing pause until this time
  loopId:     null,   // Tone.Transport scheduled repeat id
  keyIndex:   0,      // rotate through keys
  phraseCount: 0,     // phrases played since last silence
  _lastMoodChange: 0, // debounce: timestamp of last mood change
};

function initAudio() {
  // ── Howler.js SFX ──────────────────────────────────────────────────────────
  if (typeof Howl !== "undefined") {
    sfx.woodHit   = new Howl({ src: ["sounds/wood_hit.wav"],   volume: 0.7, preload: true });
    sfx.woodBreak  = new Howl({ src: ["sounds/wood_break.wav"],  volume: 0.85, preload: true });
    sfx.stoneHit  = new Howl({ src: ["sounds/stone_hit.wav"],  volume: 0.8, preload: true });
    sfx.stoneBreak = new Howl({ src: ["sounds/stone_break.wav"], volume: 0.95, preload: true });
    sfx.leafHit   = new Howl({ src: ["sounds/leaf_hit.wav"],   volume: 0.55, preload: true });
    sfx.leafBreak  = new Howl({ src: ["sounds/leaf_break.wav"],  volume: 0.65, preload: true });
    sfx.place     = new Howl({ src: ["sounds/place.wav"],      volume: 0.65, preload: true });
    console.log("Howler.js SFX preloaded.");
  } else {
    console.warn("Howler.js not loaded — SFX disabled.");
  }

  // ── Tone.js musical bus (arpeggio + rumble only) ───────────────────────────
  if (typeof Tone !== "undefined") {
    masterCompressor = new Tone.Compressor({ threshold: -20, ratio: 4 });
    masterReverb     = new Tone.Reverb({ decay: 0.3, wet: 0.2 });
    masterLimiter    = new Tone.Limiter(-1);
    masterCompressor.chain(masterReverb, masterLimiter, Tone.Destination);

    // Line-clear arpeggio — warm sine with piano-like envelope (C418 warmth)
    clearSynth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.015, decay: 0.5, sustain: 0.08, release: 1.0 },
    }).connect(masterCompressor);
    clearSynth.volume.value = -8;

    rumbleSynth = new Tone.MembraneSynth({
      pitchDecay: 0.15,
      octaves: 4,
      envelope: { attack: 0.005, decay: 0.25, sustain: 0.5, release: 0.2 },
    }).connect(masterCompressor);
    rumbleSynth.volume.value = -3;

    // Game-over — soft sine with piano-like decay for melancholic descent
    gameOverSynth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.03, decay: 0.7, sustain: 0.05, release: 1.2 },
    }).connect(masterCompressor);
    gameOverSynth.volume.value = -10;

    // Sawtooth stab for Piece Storm per-spawn swoosh
    stormSwooshSynth = new Tone.Synth({
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.005, decay: 0.09, sustain: 0.0, release: 0.06 },
    }).connect(masterCompressor);
    stormSwooshSynth.volume.value = -18;

    // Golden Hour angelic chime — sine for warmth, longer sustain for glow
    goldenChimeSynth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.02, decay: 0.6, sustain: 0.25, release: 1.5 },
    }).connect(masterCompressor);
    goldenChimeSynth.volume.value = -12;

    // Golden Hour fanfare — warm sine with piano-like sustain
    goldenFanfareSynth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.03, decay: 0.5, sustain: 0.35, release: 1.0 },
    }).connect(masterCompressor);
    goldenFanfareSynth.volume.value = -10;

    // Creeper hiss — filtered white noise with gain ramp, connected through its own gain node
    _creeperHissGain = new Tone.Gain(0).connect(masterCompressor);
    creeperHissSynth = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.3, decay: 0, sustain: 1.0, release: 0.1 },
    }).connect(_creeperHissGain);
    creeperHissSynth.volume.value = -8;

    // Creeper explosion boom — deep membrane hit
    creeperBoomSynth = new Tone.MembraneSynth({
      pitchDecay: 0.2,
      octaves: 5,
      envelope: { attack: 0.001, decay: 0.4, sustain: 0.0, release: 0.3 },
    }).connect(masterCompressor);
    creeperBoomSynth.volume.value = -2;

    // Crumble crackle — short burst of white noise for cracking stone
    crumbleCrackleSynth = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.08, sustain: 0.0, release: 0.04 },
    }).connect(masterCompressor);
    crumbleCrackleSynth.volume.value = -14;

    // Magma sizzle — filtered pink noise for hissing sizzle
    _magmaSizzleGain = new Tone.Gain(0.7).connect(masterCompressor);
    magmaSizzleSynth = new Tone.NoiseSynth({
      noise: { type: "pink" },
      envelope: { attack: 0.01, decay: 0.25, sustain: 0.0, release: 0.15 },
    }).connect(_magmaSizzleGain);
    magmaSizzleSynth.volume.value = -12;

    // Void hum — low sine drone on spawn
    voidHumSynth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.05, decay: 0.4, sustain: 0.1, release: 0.6 },
    }).connect(masterCompressor);
    voidHumSynth.volume.value = -16;

    // Entropy dissolve — ethereal triangle chime on block decay
    entropySynth = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.4, sustain: 0.0, release: 0.5 },
    }).connect(masterCompressor);
    entropySynth.volume.value = -18;

    // ── Enhanced SFX synths ────────────────────────────────────────────────
    // Block hit layer — sine with short decay, pitched per block type
    blockHitSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.003, decay: 0.12, sustain: 0.0, release: 0.08 },
    }).connect(masterCompressor);
    blockHitSynth.volume.value = -20;

    // Block break layer — triangle burst with longer release for shatter feel
    blockBreakSynth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.2, sustain: 0.0, release: 0.3 },
    }).connect(masterCompressor);
    blockBreakSynth.volume.value = -16;

    // Placement tonal click — sine with dedicated reverb tail for satisfaction
    _placeReverb = new Tone.Reverb({ decay: 1.8, wet: 0.45 });
    _placeReverb.connect(masterCompressor);
    blockPlaceSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.002, decay: 0.08, sustain: 0.0, release: 0.4 },
    }).connect(_placeReverb);
    blockPlaceSynth.volume.value = -14;

    // Level-up stinger — warm sine PolySynth for short ascending phrase
    levelUpSynth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 4,
      voice: Tone.Synth,
      options: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.02, decay: 0.4, sustain: 0.15, release: 0.8 },
      },
    }).connect(masterCompressor);
    levelUpSynth.volume.value = -10;

    // Biome discovery stinger — triangle with long reverb for wonder/awe
    biomeDiscoverSynth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 4,
      voice: Tone.Synth,
      options: {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.05, decay: 0.6, sustain: 0.2, release: 1.5 },
      },
    }).connect(masterCompressor);
    biomeDiscoverSynth.volume.value = -10;

    // ── Infinite Depths synths ────────────────────────────────────────────────
    // Depth drone — low sine that deepens with descent number
    _depthDroneGain = new Tone.Gain(0).connect(masterCompressor);
    _depthDroneSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 3.0, decay: 2.0, sustain: 0.8, release: 4.0 },
    }).connect(_depthDroneGain);
    _depthDroneSynth.volume.value = -20;

    // Depth noise — filtered brown noise, increasing presence with descent
    _depthNoiseFilter = new Tone.Filter({ type: 'lowpass', frequency: 200, Q: 1.5 });
    _depthNoiseGain = new Tone.Gain(0).connect(masterCompressor);
    _depthNoiseFilter.connect(_depthNoiseGain);
    _depthNoiseSynth = new Tone.Noise('brown').connect(_depthNoiseFilter);
    _depthNoiseSynth.volume.value = -28;

    // Descent completion sting — warm sine PolySynth
    _descentStingSynth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 5,
      voice: Tone.Synth,
      options: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.03, decay: 0.5, sustain: 0.2, release: 1.2 },
      },
    }).connect(masterCompressor);
    _descentStingSynth.volume.value = -8;

    // Extraction success — bright triangle PolySynth with relief
    _extractSynth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 6,
      voice: Tone.Synth,
      options: {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.04, decay: 0.6, sustain: 0.25, release: 2.0 },
      },
    }).connect(masterCompressor);
    _extractSynth.volume.value = -8;

    // Milestone reach — ethereal sine with long decay
    _milestoneSynth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 6,
      voice: Tone.Synth,
      options: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.06, decay: 0.8, sustain: 0.3, release: 2.5 },
      },
    }).connect(masterCompressor);
    _milestoneSynth.volume.value = -6;

    // Milestone rumble accent — deep membrane for weight
    _milestoneRumble = new Tone.MembraneSynth({
      pitchDecay: 0.25,
      octaves: 4,
      envelope: { attack: 0.01, decay: 0.5, sustain: 0.0, release: 0.4 },
    }).connect(masterCompressor);
    _milestoneRumble.volume.value = -4;

    // Boss escalation hit — percussive sine stab for phase transitions
    _bossEscalationSynth = new Tone.PolySynth(Tone.Synth, {
      maxPolyphony: 4,
      voice: Tone.Synth,
      options: {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.005, decay: 0.3, sustain: 0.0, release: 0.4 },
      },
    }).connect(masterCompressor);
    _bossEscalationSynth.volume.value = -12;

    _initBgMusic();
    _initEnvironmentalAudio();
    console.log("Tone.js musical bus initialized.");
  } else {
    console.warn("Tone.js not loaded — line-clear music disabled.");
  }

  audioReady = true;
}

// ── Ambient music system ─────────────────────────────────────────────────────
// C418-inspired: sparse piano motifs, warm pads, low drones, breathing silences.
// Two mood states (calm / tense) with smooth crossfading between them.

// Key centres — rotate for emotional variety
const _AMB_KEYS = [
  { root: 'A',  scale: ['A3','B3','C4','D4','E4','G4','A4','C5','D5','E5'] },       // Am natural
  { root: 'C',  scale: ['C4','D4','E4','F4','G4','A4','B4','C5','D5','E5'] },       // C major
  { root: 'E',  scale: ['E3','F#3','G3','A3','B3','D4','E4','G4','A4','B4'] },      // Em natural
  { root: 'D',  scale: ['D3','E3','F3','G3','A3','C4','D4','F4','G4','A4'] },       // Dm natural
];

// Bass roots per key (low register drones)
const _AMB_BASS = {
  'A': ['A1','E2','A2'],  'C': ['C2','G2','C3'],
  'E': ['E1','B1','E2'],  'D': ['D2','A1','D3'],
};

// Pad chords per key
const _AMB_CHORDS = {
  'A': [['A3','C4','E4'],['D3','F3','A3'],['E3','G3','B3']],
  'C': [['C4','E4','G4'],['F3','A3','C4'],['G3','B3','D4']],
  'E': [['E3','G3','B3'],['A3','C4','E4'],['B3','D4','F#4']],
  'D': [['D3','F3','A3'],['G3','Bb3','D4'],['A3','C4','E4']],
};

function _initBgMusic() {
  // Dedicated warm reverb for music — longer decay, higher wet than SFX bus
  _amb.reverb = new Tone.Reverb({ decay: 3.5, wet: 0.5 });
  _amb.gain   = new Tone.Gain(0); // starts silent for fade-in
  _amb.reverb.connect(masterCompressor);
  _amb.gain.connect(_amb.reverb);

  // Piano — PolySynth with triangle oscillators, soft attack, long release
  _amb.piano = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 6,
    voice: Tone.Synth,
    options: {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.08, decay: 1.2, sustain: 0.15, release: 2.5 },
    },
  }).connect(_amb.gain);
  _amb.piano.volume.value = -10;

  // Pad — filtered sawtooth, very slow attack for swells
  _amb.padGain = new Tone.Gain(0.6).connect(_amb.gain);
  _amb.pad = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 4,
    voice: Tone.Synth,
    options: {
      oscillator: { type: 'sine' },
      envelope: { attack: 2.0, decay: 1.5, sustain: 0.6, release: 3.0 },
    },
  }).connect(_amb.padGain);
  _amb.pad.volume.value = -20;

  // Bass drone — deep sine, very gentle
  _amb.bassGain = new Tone.Gain(0.4).connect(_amb.gain);
  _amb.bass = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 1.5, decay: 1.0, sustain: 0.7, release: 3.0 },
  }).connect(_amb.bassGain);
  _amb.bass.volume.value = -18;

  Tone.Transport.bpm.value = 72; // slow, contemplative tempo
}

/**
 * Generate and schedule a piano phrase — sparse, C418-style motif.
 * Returns the duration of the phrase in seconds.
 */
function _ambPlayPhrase(startTime) {
  var key = _AMB_KEYS[_amb.keyIndex % _AMB_KEYS.length];
  var scale = key.scale;
  var root  = key.root;

  // --- Piano motif: note count and character varies by mood ---
  var baseNoteCount = 3 + Math.floor(Math.random() * 4);
  // Menu: fewer notes (1–3), intense: more notes (4–7)
  if (_amb.mood === 'menu') baseNoteCount = 1 + Math.floor(Math.random() * 3);
  if (_amb.mood === 'intense') baseNoteCount = 4 + Math.floor(Math.random() * 4);
  var noteCount = baseNoteCount;
  var t = startTime;
  for (var i = 0; i < noteCount; i++) {
    var note = scale[Math.floor(Math.random() * scale.length)];
    var vel  = 0.25 + Math.random() * 0.35; // soft dynamics
    var dur  = 0.8 + Math.random() * 1.5;   // hold notes
    var gap  = 0.4 + Math.random() * 1.8;   // space between notes

    // Menu mood: very quiet, very spacious
    if (_amb.mood === 'menu') {
      vel *= 0.5;
      gap *= 1.8;
      dur *= 1.3;
    }
    // In tense mood, slightly shorter gaps, more notes
    if (_amb.mood === 'tense') {
      gap *= 0.6;
      vel += 0.1;
    }
    // Intense mood: tighter gaps, louder, more urgent
    if (_amb.mood === 'intense') {
      gap *= 0.45;
      vel += 0.15;
      dur *= 0.7;
    }

    try {
      _amb.piano.triggerAttackRelease(note, dur, t, vel);
    } catch (_e) { /* polyphony limit — graceful skip */ }
    t += gap;
  }
  var phraseDur = t - startTime;

  // --- Pad chord swell (calm mood only, ~60% chance) ---
  if (_amb.mood === 'calm' && Math.random() < 0.6) {
    var chords = _AMB_CHORDS[root] || _AMB_CHORDS['A'];
    var chord  = chords[Math.floor(Math.random() * chords.length)];
    try {
      _amb.pad.triggerAttackRelease(chord, phraseDur * 0.8, startTime + 0.3, 0.2);
    } catch (_e) {}
  }
  // In tense mood, pad plays dissonant cluster at lower volume
  if (_amb.mood === 'tense' && Math.random() < 0.4) {
    var chords = _AMB_CHORDS[root] || _AMB_CHORDS['A'];
    var chord  = chords[Math.floor(Math.random() * chords.length)];
    try {
      _amb.pad.triggerAttackRelease(chord, phraseDur * 0.5, startTime + 0.5, 0.12);
    } catch (_e) {}
  }
  // Intense mood: short, tense pad stabs — dissonant, percussive feel
  if (_amb.mood === 'intense' && Math.random() < 0.5) {
    var chords = _AMB_CHORDS[root] || _AMB_CHORDS['A'];
    var chord  = chords[Math.floor(Math.random() * chords.length)];
    try {
      _amb.pad.triggerAttackRelease(chord, phraseDur * 0.3, startTime + 0.2, 0.15);
    } catch (_e) {}
  }
  // Menu mood: rare, whisper-quiet pad — mostly silence
  if (_amb.mood === 'menu' && Math.random() < 0.2) {
    var chords = _AMB_CHORDS[root] || _AMB_CHORDS['A'];
    var chord  = chords[Math.floor(Math.random() * chords.length)];
    try {
      _amb.pad.triggerAttackRelease(chord, phraseDur * 1.2, startTime + 0.5, 0.08);
    } catch (_e) {}
  }

  // --- Bass drone (every other phrase) ---
  if (_amb.phraseCount % 2 === 0) {
    var bassNotes = _AMB_BASS[root] || _AMB_BASS['A'];
    var bassNote  = bassNotes[Math.floor(Math.random() * bassNotes.length)];
    try {
      _amb.bass.triggerAttackRelease(bassNote, phraseDur * 0.7, startTime + 0.2);
    } catch (_e) {}
  }

  return phraseDur;
}

/**
 * Main ambient loop — called by Tone.Transport.scheduleRepeat.
 * Manages phrase scheduling, key rotation, and breathing silences.
 */
function _ambLoop(time) {
  if (!bgMusicPlaying) return;
  var now = time || Tone.now();

  // Still in a silence window? Skip.
  if (now < _amb.silenceUntil) return;

  // After N phrases, insert a breathing silence — duration varies by mood
  var _silenceThreshold = 3 + Math.floor(Math.random() * 3);
  if (_amb.mood === 'menu') _silenceThreshold = 1 + Math.floor(Math.random() * 2); // more silence
  if (_amb.mood === 'intense') _silenceThreshold = 5 + Math.floor(Math.random() * 3); // less silence
  if (_amb.phraseCount > 0 && _amb.phraseCount % _silenceThreshold === 0) {
    var silenceDur = 4 + Math.random() * 4;
    if (_amb.mood === 'menu') silenceDur = 6 + Math.random() * 8; // long pauses
    if (_amb.mood === 'intense') silenceDur = 2 + Math.random() * 2; // brief pauses
    _amb.silenceUntil = now + silenceDur;
    // Rotate key during silence for variety
    _amb.keyIndex = (_amb.keyIndex + 1) % _AMB_KEYS.length;
    return;
  }

  // Play a phrase
  var dur = _ambPlayPhrase(now);
  _amb.phraseCount++;

  // Add a small gap after the phrase
  var postGap = 1.0 + Math.random() * 2.0;
  _amb.nextPhrase = now + dur + postGap;
}

/**
 * Set the ambient music mood. Crossfades layer volumes.
 * Debounced: ignores changes within 1.5s to prevent rapid flickering.
 * @param {'calm'|'tense'|'intense'|'menu'} mood
 */
function setAmbientMood(mood) {
  if (!_amb.gain) return;
  if (mood !== 'calm' && mood !== 'tense' && mood !== 'intense' && mood !== 'menu') return;
  if (mood === _amb.mood) return; // no-op if already in this mood

  // Debounce: prevent rapid mood flicker (1.5s minimum between changes)
  var now = performance.now();
  if (now - _amb._lastMoodChange < 1500) return;
  _amb._lastMoodChange = now;
  _amb.mood = mood;

  var fadeTime = 3.0; // 3 second crossfade
  if (mood === 'menu') {
    // Ultra-sparse: very quiet piano, no pad, no bass — mostly silence
    _amb.piano.volume.rampTo(-16, fadeTime);
    _amb.padGain.gain.rampTo(0.1, fadeTime);
    _amb.bassGain.gain.rampTo(0.0, fadeTime);
  } else if (mood === 'tense') {
    // Louder piano, quieter pad, slightly louder bass
    _amb.piano.volume.rampTo(-6, fadeTime);
    _amb.padGain.gain.rampTo(0.25, fadeTime);
    _amb.bassGain.gain.rampTo(0.6, fadeTime);
  } else if (mood === 'intense') {
    // Boss fight: prominent bass, louder piano, minimal pad for tension
    _amb.piano.volume.rampTo(-4, fadeTime);
    _amb.padGain.gain.rampTo(0.15, fadeTime);
    _amb.bassGain.gain.rampTo(0.8, fadeTime);
  } else {
    // Default calm levels
    _amb.piano.volume.rampTo(-10, fadeTime);
    _amb.padGain.gain.rampTo(0.6, fadeTime);
    _amb.bassGain.gain.rampTo(0.4, fadeTime);
  }
}

/**
 * Force-set ambient mood, bypassing debounce.
 * Use for intentional lifecycle transitions (menu→calm on game start).
 * @param {'calm'|'tense'|'intense'|'menu'} mood
 */
function forceAmbientMood(mood) {
  _amb._lastMoodChange = 0; // reset debounce
  _amb.mood = ''; // force through same-mood guard
  setAmbientMood(mood);
}

/** Fade-in and start ambient music at game start. */
function startBgMusic() {
  if (!audioReady || !_amb.gain || bgMusicPlaying) return;
  bgMusicPlaying = true;

  // Reset scheduling state
  _amb.phraseCount  = 0;
  _amb.silenceUntil = 0;
  _amb.mood         = 'calm';
  _amb.keyIndex     = Math.floor(Math.random() * _AMB_KEYS.length); // random starting key

  // Stop/reset transport before (re-)starting
  Tone.Transport.stop();
  Tone.Transport.position = 0;

  // Schedule the ambient loop — fires every 2 seconds to check if it's time for a new phrase
  _amb.loopId = Tone.Transport.scheduleRepeat(_ambLoop, '2n');

  Tone.Transport.start();

  // Fade in over 3 seconds
  _amb.gain.gain.rampTo(_volMusic / 100, 3);

  // Start environmental soundscapes alongside music
  startEnvironmentalAudio();
}

/** Fade-out ambient music on game over. */
function stopBgMusic() {
  if (!audioReady || !_amb.gain || !bgMusicPlaying) return;
  bgMusicPlaying = false;

  // 3 second fade out
  _amb.gain.gain.rampTo(0, 3);
  setTimeout(() => {
    if (!bgMusicPlaying) {
      if (_amb.loopId !== null) {
        Tone.Transport.clear(_amb.loopId);
        _amb.loopId = null;
      }
      Tone.Transport.stop();
    }
  }, 3500);

  // Stop environmental audio alongside music
  stopEnvironmentalAudio();
}

/** Immediately silence ambient music on game reset (no fade). */
function resetBgMusic() {
  if (!audioReady || !_amb.gain) return;
  bgMusicPlaying = false;
  _amb.gain.gain.cancelScheduledValues(Tone.now());
  _amb.gain.gain.setValueAtTime(0, Tone.now());
  if (_amb.loopId !== null) {
    try { Tone.Transport.clear(_amb.loopId); } catch (_e) {}
    _amb.loopId = null;
  }
  Tone.Transport.stop();
  _amb.phraseCount  = 0;
  _amb.silenceUntil = 0;
  _amb.mood         = 'calm';

  // Reset environmental audio alongside music
  resetEnvironmentalAudio();

  // Reset Infinite Depths audio layers
  stopInfiniteDepthsAudio();
  stopEntropyAmbient();
}

// ── Environmental soundscape system ──────────────────────────────────────────
// Procedural ambient layers that respond to biome, depth, and game context.
// Surface: filtered wind noise + occasional bird chirps (sine pings).
// Underground: cave drips (random sine pings) + deep rumble drone + heavy reverb.
// Biome textures: stone (gravel crunch noise), forest (rustling), nether (lava hiss), ice (crystalline shimmer).

function _initEnvironmentalAudio() {
  // Dedicated reverb — starts moderate, gets wetter with depth
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

  // ── Cave drips — short sine pings with random timing ──
  _env.dripGain = new Tone.Gain(0).connect(_env.gain);
  _env.dripSynth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 0.15, sustain: 0.0, release: 0.2 },
  }).connect(_env.dripGain);
  _env.dripSynth.volume.value = -18;

  // ── Underground rumble drone — deep sine ──
  _env.droneGain = new Tone.Gain(0).connect(_env.gain);
  _env.droneSynth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 2.0, decay: 1.0, sustain: 0.8, release: 3.0 },
  }).connect(_env.droneGain);
  _env.droneSynth.volume.value = -24;

  // ── Biome texture layer — noise synth through variable filter ──
  _env.biomeFilter = new Tone.Filter({ type: 'lowpass', frequency: 1200, Q: 1.0 });
  _env.biomeGain   = new Tone.Gain(0).connect(_env.gain);
  _env.biomeFilter.connect(_env.biomeGain);
  _env.biomeSynth = new Tone.Noise('pink').connect(_env.biomeFilter);
  _env.biomeSynth.volume.value = -30;
}

// Bird chirp notes — high register, mimicking distant songbird calls
var _ENV_BIRD_NOTES = ['E6', 'G6', 'A6', 'B6', 'D7', 'E7'];
// Cave drip notes — mid-high pings with natural echo feel
var _ENV_DRIP_NOTES = ['C5', 'E5', 'G5', 'A5', 'C6', 'D6'];
// Drone roots per depth tier
var _ENV_DRONE_NOTES = ['A1', 'F1', 'D1', 'B0'];

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
 * Schedule random cave drip pings for underground ambience.
 * Single ping every 1.5–5 seconds with randomised pitch and velocity.
 */
function _envStartDrips() {
  if (_env.dripLoopId !== null) return;
  function drip() {
    if (!_env.active || _env.currentEnv !== 'underground') return;
    var note = _ENV_DRIP_NOTES[Math.floor(Math.random() * _ENV_DRIP_NOTES.length)];
    var vel  = 0.15 + Math.random() * 0.3;
    try {
      _env.dripSynth.triggerAttackRelease(note, 0.1, Tone.now(), vel);
    } catch (_e) {}
    var nextDelay = 1.5 + Math.random() * 3.5;
    _env.dripLoopId = setTimeout(drip, nextDelay * 1000);
  }
  var initialDelay = 0.5 + Math.random() * 2;
  _env.dripLoopId = setTimeout(drip, initialDelay * 1000);
}

function _envStopDrips() {
  if (_env.dripLoopId !== null) {
    clearTimeout(_env.dripLoopId);
    _env.dripLoopId = null;
  }
}

/**
 * Start or restart the underground drone at a pitch based on depth.
 */
function _envStartDrone(depth) {
  if (!_env.droneSynth) return;
  var noteIndex = Math.min(depth, _ENV_DRONE_NOTES.length - 1);
  var note = _ENV_DRONE_NOTES[noteIndex];
  try {
    _env.droneSynth.triggerAttackRelease(note, 8, Tone.now());
  } catch (_e) {}
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
 * Wind noise up, birds on. Drips off, drone off.
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

  // Drips off
  _env.dripGain.gain.rampTo(0, fade);
  _envStopDrips();

  // Drone off
  _env.droneGain.gain.rampTo(0, fade);

  // Reverb — light for surface
  _env.reverb.decay = 2.0;
  _env.reverb.wet.rampTo(0.2, fade);

  // Wind filter — broader for open air
  _env.windFilter.frequency.rampTo(800, fade);
  _env.windFilter.Q.value = 0.5;
}

/**
 * Crossfade to underground environment.
 * Drips on, drone on, heavy reverb. Wind fades, birds stop.
 * @param {number} depth — floor depth (1+), affects reverb wet and drone pitch
 */
function _envTransitionToUnderground(depth) {
  var fade = 3.0;
  _env.currentEnv = 'underground';
  _env.currentDepth = depth;

  // Wind down (not fully off — distant echo of surface)
  _env.windGain.gain.rampTo(0.08, fade);
  _env.windFilter.frequency.rampTo(400, fade); // muffled
  _env.windFilter.Q.value = 1.5;

  // Birds off
  _env.birdGain.gain.rampTo(0, fade);
  _envStopBirds();

  // Drips on
  _env.dripGain.gain.rampTo(0.5, fade);
  _envStartDrips();

  // Drone on — pitch deepens with depth
  _env.droneGain.gain.rampTo(0.35 + Math.min(depth * 0.05, 0.25), fade);
  _envStartDrone(depth);

  // Depth-based reverb: more reverb deeper (wet 0.35 → 0.7, decay 3 → 6)
  var depthFactor = Math.min(depth / 7, 1.0);
  var targetWet   = 0.35 + depthFactor * 0.35;
  var targetDecay = 3.0 + depthFactor * 3.0;
  _env.reverb.wet.rampTo(targetWet, fade);
  _env.reverb.decay = targetDecay;
}

/**
 * Public API — update environmental audio based on current game state.
 * Call from the game loop or on biome/depth transitions.
 * @param {string|null} biomeId — 'stone'|'forest'|'nether'|'ice'|null
 * @param {number} depth — 0 for surface, 1+ for underground floors
 */
function updateEnvironmentalAudio(biomeId, depth) {
  if (!_env.gain || !_env.active) return;

  var targetEnv = depth > 0 ? 'underground' : 'surface';

  // Environment transition (surface <-> underground)
  if (targetEnv !== _env.currentEnv) {
    if (targetEnv === 'surface') {
      _envTransitionToSurface();
    } else {
      _envTransitionToUnderground(depth);
    }
  } else if (targetEnv === 'underground' && depth !== _env.currentDepth) {
    // Same environment but depth changed — update reverb and drone
    _envTransitionToUnderground(depth);
  }

  // Biome texture update — play discovery stinger on new biome transitions
  if (biomeId !== _env.currentBiome) {
    if (biomeId && _env.currentBiome !== null) {
      // Only stinger when transitioning between biomes (not on initial load)
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
  _envStopDrips();

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
  _envStopDrips();
  try { _env.windNoise.stop(); } catch (_e) {}
  try { _env.biomeSynth.stop(); } catch (_e) {}
  _env.currentEnv   = 'none';
  _env.currentBiome = null;
  _env.currentDepth = 0;
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
function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/** Play Tone.js hit layer — subtle pitched sine alongside the Howler sample. */
function _playBlockHitTone(blockCategory) {
  if (!blockHitSynth) return;
  var pitches = _BLOCK_HIT_PITCHES[blockCategory] || _BLOCK_HIT_PITCHES.generic;
  try {
    blockHitSynth.triggerAttackRelease(_pick(pitches), '32n', Tone.now());
  } catch (_e) {}
}

/** Play Tone.js break layer — slightly longer burst for satisfying shatter. */
function _playBlockBreakTone(blockCategory) {
  if (!blockBreakSynth) return;
  var pitches = _BLOCK_BREAK_PITCHES[blockCategory] || _BLOCK_BREAK_PITCHES.generic;
  try {
    blockBreakSynth.triggerAttackRelease(_pick(pitches), '16n', Tone.now());
  } catch (_e) {}
}

/** Play a Howler sound with randomised pitch for variety. */
function _playSfx(key, rateMin, rateMax) {
  const h = sfx[key];
  if (!h) return;
  const id = h.play();
  h.rate(rateMin + Math.random() * (rateMax - rateMin), id);
}

/** Play the appropriate hit sound for a block's object type. */
function playHitSound(objType) {
  if (!audioReady) return;
  if (objType === "trunk") {
    _playSfx("woodHit", 0.85, 1.15);
    _playBlockHitTone('wood');
  } else if (objType === "leaf") {
    _playSfx("leafHit", 0.9, 1.2);
    _playBlockHitTone('leaf');
  } else if (objType === "rock") {
    _playSfx("stoneHit", 0.88, 1.12);
    _playBlockHitTone('stone');
  } else {
    _playSfx("stoneHit", 0.75, 1.0);
    _playBlockHitTone('generic');
  }
}

/** Play the appropriate break sound for a block's object type. */
function playBreakSound(objType) {
  if (!audioReady) return;
  if (objType === "trunk") {
    _playSfx("woodBreak", 0.85, 1.1);
    _playBlockBreakTone('wood');
  } else if (objType === "leaf") {
    _playSfx("leafBreak", 0.9, 1.2);
    _playBlockBreakTone('leaf');
  } else if (objType === "rock") {
    _playSfx("stoneBreak", 0.88, 1.05);
    _playBlockBreakTone('stone');
  } else {
    _playSfx("woodBreak", 0.75, 1.0);
    _playBlockBreakTone('generic');
  }
}

/** Play rubble hit sound — lower pitch stoneHit for a crunchier feel. */
function playRubbleHitSound() {
  if (!audioReady) return;
  _playSfx("stoneHit", 0.55, 0.70);
  _playBlockHitTone('rubble');
}

/** Play rubble break sound — low-pitch stone break for a heavy crunch. */
function playRubbleBreakSound() {
  if (!audioReady) return;
  _playSfx("stoneBreak", 0.50, 0.65);
  _playBlockBreakTone('rubble');
}

// Placement click pitches — warm mid-register tones with subtle variety
const _PLACE_PITCHES = ['C4', 'D4', 'E4', 'G4', 'A4'];

/** Play block placement thud + tonal click with reverb tail. */
function playPlaceSound() {
  if (!audioReady) return;
  _playSfx("place", 0.88, 1.12);
  // Tonal click layer — sine through dedicated reverb for satisfying weight
  if (blockPlaceSynth) {
    try {
      blockPlaceSynth.triggerAttackRelease(_pick(_PLACE_PITCHES), '32n', Tone.now());
    } catch (_e) {}
  }
}

// ── Musical events (Tone.js) ──────────────────────────────────────────────────

/** Low bass rumble during line-clear anticipation build-up. */
function playLineClearRumble() {
  if (!audioReady || !rumbleSynth) return;
  rumbleSynth.triggerAttackRelease("C1", "4n", Tone.now());
}

/** Descending melancholic phrase on game over — soft, piano-like, ~3.5 s. */
function playGameOverJingle() {
  if (!audioReady || !gameOverSynth) return;
  const now = Tone.now();
  // Descending A-minor phrase — melancholic, unhurried, like a sigh
  const notes   = ["E5", "C5", "A4", "G4", "E4", "C4"];
  const spacing = 0.45; // slower spacing for weight and sadness
  for (let i = 0; i < notes.length; i++) {
    gameOverSynth.triggerAttackRelease(notes[i], "4n", now + i * spacing);
  }
  // Soft low thud for finality — gentle, not jarring
  if (rumbleSynth) {
    rumbleSynth.triggerAttackRelease("A1", "4n", now + notes.length * spacing + 0.2);
  }
}

/** Rising arpeggio when lines are cleared — warm, piano-like, C418-inspired. */
function playLineClearSound(numLines) {
  if (!audioReady || !clearSynth) return;
  const now = Tone.now();
  // Pentatonic-friendly voicings — warmer than straight major arpeggio
  const notes = ["A3", "C4", "E4", "G4", "A4", "C5"];
  const count = Math.min(numLines + 2, notes.length);
  for (let i = 0; i < count; i++) {
    // Wider spacing (140ms) for a more deliberate, melodic feel
    clearSynth.triggerAttackRelease(notes[i], "8n", now + i * 0.14);
  }
}

// ── Piece Storm sounds ────────────────────────────────────────────────────────

/** Deep ominous rumble played when Piece Storm begins. */
function playStormRumble() {
  if (!audioReady || !rumbleSynth) return;
  const now = Tone.now();
  rumbleSynth.triggerAttackRelease("A1", "4n", now);
  rumbleSynth.triggerAttackRelease("C1", "4n", now + 0.35);
  rumbleSynth.triggerAttackRelease("E1", "4n", now + 0.7);
}

/** Short sawtooth swoosh played on each piece spawn during Piece Storm. */
function playStormSwoosh() {
  if (!audioReady || !stormSwooshSynth) return;
  stormSwooshSynth.triggerAttackRelease("E4", "32n", Tone.now());
}

// ── The Core (Floor 7 Boss) sounds ────────────────────────────────────────────

/** Deep menacing rumble when The Core activates — lower and more intense than storm. */
function playCoreRumble() {
  if (!audioReady || !rumbleSynth) return;
  const now = Tone.now();
  rumbleSynth.triggerAttackRelease("E1", "2n", now);
  rumbleSynth.triggerAttackRelease("A0", "2n", now + 0.4);
  rumbleSynth.triggerAttackRelease("D1", "2n", now + 0.8);
  rumbleSynth.triggerAttackRelease("A0", "4n", now + 1.3);
}

/** Victory fanfare when The Core is defeated — ascending triumphant notes. */
function playCoreVictoryFanfare() {
  if (!audioReady || !clearSynth) return;
  const now = Tone.now();
  var fanfare = ["C4", "E4", "G4", "C5", "E5", "G5", "C6"];
  for (var i = 0; i < fanfare.length; i++) {
    clearSynth.triggerAttackRelease(fanfare[i], "8n", now + i * 0.12);
  }
}

// ── Golden Hour sounds ────────────────────────────────────────────────────────

/** Ascending angelic chime arpeggio played when Golden Hour begins. */
function playGoldenHourChime() {
  if (!audioReady || !goldenChimeSynth) return;
  const now = Tone.now();
  const notes = ["C5", "E5", "G5", "B5", "C6"];
  notes.forEach((note, i) => {
    goldenChimeSynth.triggerAttackRelease(note, "8n", now + i * 0.12);
  });
}

/** Triumphant fanfare played when Golden Hour ends. */
function playGoldenHourFanfare() {
  if (!audioReady || !goldenFanfareSynth) return;
  const now = Tone.now();
  const notes = ["G4", "C5", "E5", "G5", "C6"];
  notes.forEach((note, i) => {
    goldenFanfareSynth.triggerAttackRelease(note, "4n", now + i * 0.18);
  });
}

// ── Earthquake sounds ─────────────────────────────────────────────────────────

/** Deep seismic rumble sequence played when Earthquake begins. */
function playEarthquakeRumble() {
  if (!audioReady || !rumbleSynth) return;
  const now = Tone.now();
  rumbleSynth.triggerAttackRelease("D1", "4n", now);
  rumbleSynth.triggerAttackRelease("G1", "4n", now + 0.5);
  rumbleSynth.triggerAttackRelease("B1", "4n", now + 1.0);
}

/** Short crumbling stone pulse played during Earthquake shake bursts. */
function playEarthquakeCrumble() {
  if (!audioReady || !rumbleSynth) return;
  rumbleSynth.triggerAttackRelease("E1", "16n", Tone.now());
}

// ── Event stingers ─────────────────────────────────────────────────────────

/** Short ascending phrase on level up — warm, hopeful, 4-note motif. */
function playLevelUpStinger() {
  if (!audioReady || !levelUpSynth) return;
  const now = Tone.now();
  // Quick ascending Am pentatonic motif — bright but not harsh
  const notes = ['A4', 'C5', 'E5', 'A5'];
  for (let i = 0; i < notes.length; i++) {
    try {
      levelUpSynth.triggerAttackRelease(notes[i], '8n', now + i * 0.12, 0.4 + i * 0.1);
    } catch (_e) {}
  }
}

/** Gentle awe chord on biome discovery — open voicing, sustained wash. */
function playBiomeDiscoveryStinger() {
  if (!audioReady || !biomeDiscoverSynth) return;
  const now = Tone.now();
  // Open fifth chord that swells in — wonder and discovery
  try {
    biomeDiscoverSynth.triggerAttackRelease(['E4', 'B4', 'E5'], '2n', now, 0.35);
  } catch (_e) {}
  // Second chord a moment later for movement
  try {
    biomeDiscoverSynth.triggerAttackRelease(['A4', 'C5', 'E5'], '2n', now + 0.8, 0.3);
  } catch (_e) {}
}

// ── Creeper sounds ───────────────────────────────────────────────────────────

/** Start the escalating hiss when fuse begins. Ramps volume over the fuse duration. */
function startCreeperHiss() {
  if (!audioReady || !creeperHissSynth || !_creeperHissGain) return;
  _creeperHissGain.gain.cancelScheduledValues(Tone.now());
  _creeperHissGain.gain.setValueAtTime(0.15, Tone.now());
  _creeperHissGain.gain.linearRampToValueAtTime(1.0, Tone.now() + 2.5);
  creeperHissSynth.triggerAttack(Tone.now());
}

/** Stop the hiss immediately (on defuse or explosion). */
function stopCreeperHiss() {
  if (!audioReady || !creeperHissSynth || !_creeperHissGain) return;
  creeperHissSynth.triggerRelease(Tone.now());
  _creeperHissGain.gain.cancelScheduledValues(Tone.now());
  _creeperHissGain.gain.setValueAtTime(0, Tone.now());
}

/** Deep boom + thud on creeper explosion. */
function playCreeperBoom() {
  if (!audioReady || !creeperBoomSynth) return;
  const now = Tone.now();
  creeperBoomSynth.triggerAttackRelease("C1", "4n", now);
  if (rumbleSynth) {
    rumbleSynth.triggerAttackRelease("E1", "4n", now + 0.05);
  }
}

// ── Hazard block sounds ──────────────────────────────────────────────────────

/** Short crack burst played as crumble blocks decay and on final break. */
let _lastCrumbleCrackleTime = 0;
function playCrumbleCrackle() {
  if (!audioReady || !crumbleCrackleSynth) return;
  // Throttle to avoid overlap when many crumble blocks are active
  var now = performance.now();
  if (now - _lastCrumbleCrackleTime < 120) return;
  _lastCrumbleCrackleTime = now;
  crumbleCrackleSynth.triggerAttackRelease("32n", Tone.now());
}

/** Sizzle sound played when magma deals damage to an adjacent block. */
let _lastMagmaSizzleTime = 0;
function playMagmaSizzle() {
  if (!audioReady || !magmaSizzleSynth) return;
  var now = performance.now();
  if (now - _lastMagmaSizzleTime < 200) return;
  _lastMagmaSizzleTime = now;
  magmaSizzleSynth.triggerAttackRelease("16n", Tone.now());
}

/** Low eerie hum played when a void block spawns. */
let _lastVoidHumTime = 0;
function playVoidHum() {
  if (!audioReady || !voidHumSynth) return;
  var now = performance.now();
  if (now - _lastVoidHumTime < 300) return;
  _lastVoidHumTime = now;
  voidHumSynth.triggerAttackRelease("D2", "8n", Tone.now());
}

/** Soft crystalline chime played when Entropy decays a block. */
const _ENTROPY_NOTES = ['E5', 'G5', 'A5', 'B5', 'D6'];
let _lastEntropyDissolveTime = 0;
function playEntropyDissolve() {
  if (!audioReady || !entropySynth) return;
  var now = performance.now();
  if (now - _lastEntropyDissolveTime < 300) return;
  _lastEntropyDissolveTime = now;
  var note = _ENTROPY_NOTES[Math.floor(Math.random() * _ENTROPY_NOTES.length)];
  entropySynth.triggerAttackRelease(note, "8n", Tone.now());
}

// ── Infinite Depths audio ─────────────────────────────────────────────────────

// Drone pitch table — descends chromatically into the abyss
var _DEPTH_DRONE_NOTES = ['A1', 'G1', 'F1', 'E1', 'D1', 'C1', 'B0', 'A0'];

/**
 * Start or update the Infinite Depths ambient layer.
 * Called when entering Infinite Depths mode or advancing to a new Descent.
 * @param {number} descentNum  Current Descent number (1-based)
 */
function updateInfiniteDepthsAudio(descentNum) {
  if (!audioReady || !_depthDroneSynth) return;
  if (descentNum < 1) { stopInfiniteDepthsAudio(); return; }

  _depthAmb.currentDescent = descentNum;
  var fade = 3.0;

  // Depth factor: 0.0 at D1 → 1.0 at D10+
  var depthFactor = Math.min(1.0, (descentNum - 1) / 9);

  // Drone: gets louder and deeper with descent
  var droneNote = _DEPTH_DRONE_NOTES[Math.min(descentNum - 1, _DEPTH_DRONE_NOTES.length - 1)];
  _depthDroneGain.gain.rampTo(0.15 + depthFactor * 0.35, fade);
  try { _depthDroneSynth.triggerAttackRelease(droneNote, 30, Tone.now()); } catch (_e) {}

  // Noise layer: filter opens and volume rises with depth
  if (!_depthAmb.active) {
    try { _depthNoiseSynth.start(); } catch (_e) {}
    _depthAmb.active = true;
  }
  _depthNoiseFilter.frequency.rampTo(200 + depthFactor * 600, fade);
  _depthNoiseGain.gain.rampTo(0.05 + depthFactor * 0.25, fade);

  // Push ambient music toward tense/intense at deeper descents
  if (descentNum >= 5) {
    setAmbientMood('intense');
  } else if (descentNum >= 3) {
    setAmbientMood('tense');
  }
}

/** Stop Infinite Depths ambient layer. */
function stopInfiniteDepthsAudio() {
  if (!_depthDroneGain) return;
  _depthAmb.active = false;
  _depthAmb.currentDescent = 0;
  _depthDroneGain.gain.rampTo(0, 2.0);
  _depthNoiseGain.gain.rampTo(0, 2.0);
  setTimeout(function () {
    if (!_depthAmb.active) {
      try { _depthNoiseSynth.stop(); } catch (_e) {}
    }
  }, 2500);
}

/**
 * Descent completion sting — plays when a 7-floor Descent is completed.
 * Triumphant at low descents, increasingly ominous at higher ones.
 * @param {number} descentNum  The Descent just completed
 */
function playDescentCompleteSting(descentNum) {
  if (!audioReady || !_descentStingSynth) return;
  var now = Tone.now();
  var d = Math.min(descentNum || 1, 10);

  // Base: ascending C major triumph
  // Higher descents: shift to minor, add lower octave weight
  if (d <= 2) {
    // Bright, triumphant — C major ascending
    try {
      _descentStingSynth.triggerAttackRelease('C4', '8n', now, 0.5);
      _descentStingSynth.triggerAttackRelease('E4', '8n', now + 0.12, 0.5);
      _descentStingSynth.triggerAttackRelease('G4', '8n', now + 0.24, 0.55);
      _descentStingSynth.triggerAttackRelease('C5', '4n', now + 0.36, 0.6);
    } catch (_e) {}
  } else if (d <= 5) {
    // Mixed — Am ascending, hint of darkness
    try {
      _descentStingSynth.triggerAttackRelease('A3', '8n', now, 0.5);
      _descentStingSynth.triggerAttackRelease('C4', '8n', now + 0.12, 0.5);
      _descentStingSynth.triggerAttackRelease('E4', '8n', now + 0.24, 0.5);
      _descentStingSynth.triggerAttackRelease('A4', '4n', now + 0.38, 0.55);
    } catch (_e) {}
    // Low rumble accent
    if (rumbleSynth) {
      try { rumbleSynth.triggerAttackRelease('A1', '4n', now + 0.3); } catch (_e) {}
    }
  } else {
    // Ominous — Dm descending into darkness
    try {
      _descentStingSynth.triggerAttackRelease('D4', '8n', now, 0.45);
      _descentStingSynth.triggerAttackRelease('A3', '8n', now + 0.15, 0.45);
      _descentStingSynth.triggerAttackRelease('F3', '8n', now + 0.30, 0.5);
      _descentStingSynth.triggerAttackRelease('D3', '4n', now + 0.48, 0.55);
    } catch (_e) {}
    // Heavy rumble
    if (rumbleSynth) {
      try {
        rumbleSynth.triggerAttackRelease('D1', '2n', now + 0.2);
        rumbleSynth.triggerAttackRelease('A0', '4n', now + 0.6);
      } catch (_e) {}
    }
  }
}

/**
 * Extraction success — relief + reward. Ascending bright arpeggio with
 * open voicing, long tails. The sound of surfacing safely.
 */
function playExtractionSuccess() {
  if (!audioReady || !_extractSynth) return;
  var now = Tone.now();
  // Ascending C major → bright, open, relieved
  var notes = ['E4', 'G4', 'C5', 'E5', 'G5', 'C6'];
  for (var i = 0; i < notes.length; i++) {
    try {
      _extractSynth.triggerAttackRelease(notes[i], '4n', now + i * 0.15, 0.35 + i * 0.05);
    } catch (_e) {}
  }
  // Warm low pad underneath
  if (_descentStingSynth) {
    try {
      _descentStingSynth.triggerAttackRelease('C3', '2n', now + 0.1, 0.25);
      _descentStingSynth.triggerAttackRelease('G3', '2n', now + 0.1, 0.2);
    } catch (_e) {}
  }
}

/**
 * Milestone Descent reached — rare, epic audio cue.
 * Layered chord wash + deep rumble. Feels like unlocking something ancient.
 * @param {number} descentNum  The milestone Descent reached
 */
function playMilestoneReached(descentNum) {
  if (!audioReady || !_milestoneSynth) return;
  var now = Tone.now();

  // Ethereal open-fifth chord wash
  try {
    _milestoneSynth.triggerAttackRelease(['E4', 'B4', 'E5'], '2n', now, 0.4);
  } catch (_e) {}
  // Second chord — movement and awe
  try {
    _milestoneSynth.triggerAttackRelease(['A4', 'E5', 'A5'], '2n', now + 0.6, 0.45);
  } catch (_e) {}
  // Third chord — resolution
  try {
    _milestoneSynth.triggerAttackRelease(['C5', 'G5', 'C6'], '1n', now + 1.3, 0.5);
  } catch (_e) {}

  // Deep rumble underneath for weight
  if (_milestoneRumble) {
    try {
      _milestoneRumble.triggerAttackRelease('E1', '2n', now + 0.1);
      _milestoneRumble.triggerAttackRelease('C1', '2n', now + 0.8);
    } catch (_e) {}
  }
}

/**
 * Check if a completed Descent number is a milestone and play the cue.
 * Called from showInfiniteDescentScreen after Descent completion.
 * @param {number} descentNum  Descent just completed
 */
function checkAndPlayMilestone(descentNum) {
  for (var i = 0; i < _INFINITE_MILESTONES.length; i++) {
    if (_INFINITE_MILESTONES[i] === descentNum) {
      playMilestoneReached(descentNum);
      return;
    }
  }
}

/**
 * Boss escalation audio — plays when extra boss phases activate in Infinite Depths.
 * Intense percussive stab that signals escalating danger.
 * @param {number} phaseNum  The new phase number (4 = Oblivion, 5 = Void Collapse)
 */
function playBossEscalation(phaseNum) {
  if (!audioReady || !_bossEscalationSynth) return;
  var now = Tone.now();

  if (phaseNum >= 5) {
    // Void Collapse — dissonant, heavy
    try {
      _bossEscalationSynth.triggerAttackRelease(['D3', 'Ab3', 'D4'], '8n', now, 0.6);
    } catch (_e) {}
    if (rumbleSynth) {
      try {
        rumbleSynth.triggerAttackRelease('D1', '2n', now + 0.05);
        rumbleSynth.triggerAttackRelease('Ab0', '2n', now + 0.3);
      } catch (_e) {}
    }
  } else {
    // Oblivion phase — tense, menacing
    try {
      _bossEscalationSynth.triggerAttackRelease(['E3', 'Bb3', 'E4'], '8n', now, 0.5);
    } catch (_e) {}
    if (rumbleSynth) {
      try { rumbleSynth.triggerAttackRelease('E1', '4n', now + 0.05); } catch (_e) {}
    }
  }
}

/**
 * Enhanced entropy ambient — continuous subtle unease when Entropy modifier is active.
 * Adds a quiet high-frequency shimmer on top of the existing dissolve sounds.
 * Call once when Entropy activates; it layers onto existing environmental audio.
 */
var _entropyAmbientActive = false;
var _entropyAmbientSynth  = null;
var _entropyAmbientGain   = null;
function startEntropyAmbient() {
  if (!audioReady || _entropyAmbientActive) return;
  if (typeof Tone === 'undefined') return;
  _entropyAmbientActive = true;

  if (!_entropyAmbientGain) {
    _entropyAmbientGain = new Tone.Gain(0).connect(masterCompressor);
    _entropyAmbientSynth = new Tone.Noise('white');
    var filter = new Tone.Filter({ type: 'highpass', frequency: 6000, Q: 0.3 });
    _entropyAmbientSynth.connect(filter);
    filter.connect(_entropyAmbientGain);
    _entropyAmbientSynth.volume.value = -38;
  }

  try { _entropyAmbientSynth.start(); } catch (_e) {}
  _entropyAmbientGain.gain.rampTo(0.15, 3.0);
}

function stopEntropyAmbient() {
  if (!_entropyAmbientActive || !_entropyAmbientGain) return;
  _entropyAmbientActive = false;
  _entropyAmbientGain.gain.rampTo(0, 2.0);
  setTimeout(function () {
    if (!_entropyAmbientActive) {
      try { _entropyAmbientSynth.stop(); } catch (_e) {}
    }
  }, 2500);
}

// ── Volume settings ───────────────────────────────────────────────────────────

/**
 * Apply master / SFX / music volume settings (each 0–100).
 *   master → Tone.js Destination volume (dB) + Howler global (× sfx factor)
 *   sfx    → Howler global (× master factor)
 *   music  → ambient music gain level (relative to Tone Destination)
 */
function applyAudioSettings(master, sfx, music) {
  _volMaster = master;
  _volSfx    = sfx;
  _volMusic  = music;

  // Howler global: effective SFX = master × sfx
  if (typeof Howler !== "undefined") {
    Howler.volume((master / 100) * (sfx / 100));
  }

  // Tone.js Destination: master level in dB (affects all Tone synths)
  if (typeof Tone !== "undefined") {
    Tone.Destination.volume.value = master > 0
      ? 20 * Math.log10(master / 100)
      : -100;
  }

  // Ambient music gain (relative within Tone, controlled by music slider)
  if (_amb.gain && bgMusicPlaying) {
    _amb.gain.gain.rampTo(music / 100, 0.1);
  }

  // Environmental soundscape gain (tracks music volume at 50%)
  if (_env.gain && _env.active) {
    _env.gain.gain.rampTo(music / 100 * 0.5, 0.1);
  }

  // Infinite Depths ambient gain (tracks music volume at 40%)
  if (_depthAmb.active && _depthDroneGain) {
    var depthFactor = Math.min(1.0, (_depthAmb.currentDescent - 1) / 9);
    _depthDroneGain.gain.rampTo((music / 100) * (0.15 + depthFactor * 0.35), 0.1);
    _depthNoiseGain.gain.rampTo((music / 100) * (0.05 + depthFactor * 0.25), 0.1);
  }
}
