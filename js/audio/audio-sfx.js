// Sound effects — block hits/breaks, line clears, jingles, game events.
// Requires: audio/audio.js loaded first.

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

  // Seasonal event audio gain (tracks music volume at 45%)
  if (typeof applyEventAudioVolume === 'function') {
    applyEventAudioVolume(music);
  }
}
