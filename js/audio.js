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

    console.log("Tone.js musical bus initialized.");
  } else {
    console.warn("Tone.js not loaded — line-clear music disabled.");
  }

  audioReady = true;
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
