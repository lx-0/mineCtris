// Audio system — Howler.js for SFX, Tone.js for musical events.
// Requires: state.js (audioReady)

// Howler sound instances (populated in initAudio)
const sfx = {};

// Tone.js musical synths (line-clear arpeggio + rumble + game-over jingle)
let clearSynth = null;
let rumbleSynth = null;
let gameOverSynth = null;
let masterCompressor = null;
let masterReverb = null;
let masterLimiter = null;

// Background music state
let bgGain      = null;
let bgBass      = null;
let bgMelody    = null;
let bgKick      = null;
let bgHihat     = null;
let bgBassSeq   = null;
let bgMelodySeq = null;
let bgKickSeq   = null;
let bgHihatSeq  = null;
let bgMusicPlaying = false;

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

    clearSynth = new Tone.Synth({
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.5 },
    }).connect(masterCompressor);
    clearSynth.volume.value = -8;

    rumbleSynth = new Tone.MembraneSynth({
      pitchDecay: 0.15,
      octaves: 4,
      envelope: { attack: 0.005, decay: 0.25, sustain: 0.5, release: 0.2 },
    }).connect(masterCompressor);
    rumbleSynth.volume.value = -3;

    // Square-wave chiptune synth for the game-over descending fanfare
    gameOverSynth = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.01, decay: 0.35, sustain: 0.0, release: 0.25 },
    }).connect(masterCompressor);
    gameOverSynth.volume.value = -10;

    _initBgMusic();
    console.log("Tone.js musical bus initialized.");
  } else {
    console.warn("Tone.js not loaded — line-clear music disabled.");
  }

  audioReady = true;
}

// ── Background music ──────────────────────────────────────────────────────────

function _initBgMusic() {
  // Master gain node for fade in / fade out — starts silent
  bgGain = new Tone.Gain(0).connect(masterCompressor);

  // Bass — square wave, low register, moderate sustain
  bgBass = new Tone.Synth({
    oscillator: { type: "square" },
    envelope: { attack: 0.05, decay: 0.1, sustain: 0.55, release: 0.3 },
  }).connect(bgGain);
  bgBass.volume.value = -16;

  // Melody — soft triangle wave arpeggio
  bgMelody = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.02, decay: 0.25, sustain: 0.2, release: 0.5 },
  }).connect(bgGain);
  bgMelody.volume.value = -22;

  // Kick drum — punchy but quiet
  bgKick = new Tone.MembraneSynth({
    pitchDecay: 0.08,
    octaves: 3,
    envelope: { attack: 0.005, decay: 0.15, sustain: 0.0, release: 0.08 },
  }).connect(bgGain);
  bgKick.volume.value = -24;

  // Hi-hat — subtle white-noise offbeats
  bgHihat = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.04, sustain: 0.0, release: 0.03 },
  }).connect(bgGain);
  bgHihat.volume.value = -34;

  Tone.Transport.bpm.value = 100;

  // A minor pentatonic bass line — 4 bars × 8 eighth-note steps = 32 steps
  bgBassSeq = new Tone.Sequence(
    (time, note) => { if (note) bgBass.triggerAttackRelease(note, "8n", time); },
    [
      "A2", null, null, "C3", null, null, "G2", null,
      "A2", null, "D3", null, null, "E3", null, null,
      "A2", null, null, "C3", "D3", null, null, null,
      "G2", null, "A2", null, null, "E3", null, null,
    ],
    "8n"
  );

  // Melodic arpeggio — sparse, higher register
  bgMelodySeq = new Tone.Sequence(
    (time, note) => { if (note) bgMelody.triggerAttackRelease(note, "16n", time); },
    [
      "A4", null, "E4", null, "D4", null, "G4", null,
      "A4", null, null, "C4", null, "E4", null, null,
      null, "G4", null, "A4", null, null, "D4", null,
      "E4", null, null, "C4", "A3", null, null, null,
    ],
    "8n"
  );

  // Kick on beat 1 of each bar (every 8 eighth-note steps)
  bgKickSeq = new Tone.Sequence(
    (time, val) => { if (val) bgKick.triggerAttackRelease("C1", "16n", time); },
    [
      1, null, null, null, null, null, null, null,
      1, null, null, null, null, null, null, null,
      1, null, null, null, null, null, null, null,
      1, null, null, null, null, null, null, null,
    ],
    "8n"
  );

  // Hi-hat on offbeats (steps 2, 4, 6 of each bar)
  bgHihatSeq = new Tone.Sequence(
    (time) => { bgHihat.triggerAttackRelease("16n", time); },
    [
      null, null, 1, null, 1, null, 1, null,
      null, null, 1, null, 1, null, 1, null,
      null, null, 1, null, 1, null, 1, null,
      null, null, 1, null, 1, null, 1, null,
    ],
    "8n"
  );
}

/** Fade-in and start background music loop at game start. */
function startBgMusic() {
  if (!audioReady || !bgGain || bgMusicPlaying) return;
  bgMusicPlaying = true;
  // Stop/reset transport before (re-)starting to allow clean restarts
  Tone.Transport.stop();
  Tone.Transport.position = 0;
  bgBassSeq.start(0);
  bgMelodySeq.start(0);
  bgKickSeq.start(0);
  bgHihatSeq.start(0);
  Tone.Transport.start();
  bgGain.gain.rampTo(1, 2); // 2 s fade in
}

/** Fade-out background music on game over. */
function stopBgMusic() {
  if (!audioReady || !bgGain || !bgMusicPlaying) return;
  bgMusicPlaying = false;
  bgGain.gain.rampTo(0, 2); // 2 s fade out
  setTimeout(() => {
    if (!bgMusicPlaying) {
      bgBassSeq.stop();
      bgMelodySeq.stop();
      bgKickSeq.stop();
      bgHihatSeq.stop();
      Tone.Transport.stop();
    }
  }, 2500);
}

/** Immediately silence background music on game reset (no fade). */
function resetBgMusic() {
  if (!audioReady || !bgGain) return;
  bgMusicPlaying = false;
  bgGain.gain.cancelScheduledValues(Tone.now());
  bgGain.gain.setValueAtTime(0, Tone.now());
  try { bgBassSeq.stop();   } catch (_) {}
  try { bgMelodySeq.stop(); } catch (_) {}
  try { bgKickSeq.stop();   } catch (_) {}
  try { bgHihatSeq.stop();  } catch (_) {}
  Tone.Transport.stop();
}

// ── SFX helpers ───────────────────────────────────────────────────────────────

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
  } else if (objType === "leaf") {
    _playSfx("leafHit", 0.9, 1.2);
  } else if (objType === "rock") {
    _playSfx("stoneHit", 0.88, 1.12);
  } else {
    // Generic landed_block — use stone hit at slightly lower pitch
    _playSfx("stoneHit", 0.75, 1.0);
  }
}

/** Play the appropriate break sound for a block's object type. */
function playBreakSound(objType) {
  if (!audioReady) return;
  if (objType === "trunk") {
    _playSfx("woodBreak", 0.85, 1.1);
  } else if (objType === "leaf") {
    _playSfx("leafBreak", 0.9, 1.2);
  } else if (objType === "rock") {
    _playSfx("stoneBreak", 0.88, 1.05);
  } else {
    _playSfx("woodBreak", 0.75, 1.0);
  }
}

/** Play block placement thud. */
function playPlaceSound() {
  if (!audioReady) return;
  _playSfx("place", 0.88, 1.12);
}

// ── Musical events (Tone.js) ──────────────────────────────────────────────────

/** Low bass rumble during line-clear anticipation build-up. */
function playLineClearRumble() {
  if (!audioReady || !rumbleSynth) return;
  rumbleSynth.triggerAttackRelease("C1", "4n", Tone.now());
}

/** Short descending fanfare on game over — minor key, ~2.5 s, chiptune feel. */
function playGameOverJingle() {
  if (!audioReady || !gameOverSynth) return;
  const now = Tone.now();
  // Descending C-minor arpeggio: C5 → Bb4 → G4 → Eb4 → C4
  const notes   = ["C5", "Bb4", "G4", "Eb4", "C4"];
  const spacing = 0.3; // 300 ms between each note
  for (let i = 0; i < notes.length; i++) {
    gameOverSynth.triggerAttackRelease(notes[i], "8n", now + i * spacing);
  }
  // Low drum thud for finality (~1.5 s in)
  if (rumbleSynth) {
    rumbleSynth.triggerAttackRelease("C2", "4n", now + notes.length * spacing);
  }
}

/** Rising arpeggio when lines are cleared. */
function playLineClearSound(numLines) {
  if (!audioReady || !clearSynth) return;
  const now = Tone.now();
  const notes = ["C4", "E4", "G4", "B4", "C5"];
  const count = Math.min(numLines + 2, 5);
  for (let i = 0; i < count; i++) {
    clearSynth.triggerAttackRelease(notes[i], "8n", now + i * 0.1);
  }
}
