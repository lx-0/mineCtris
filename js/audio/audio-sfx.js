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

  // Seasonal event audio gain (tracks music volume at 45%)
  if (typeof applyEventAudioVolume === 'function') {
    applyEventAudioVolume(music);
  }
}
