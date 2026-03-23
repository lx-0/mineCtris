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

}

