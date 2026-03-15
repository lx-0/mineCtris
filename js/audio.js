// Audio system — Tone.js setup and sound playback.
// Requires: state.js (hitSynth, breakSynth, clearSynth, audioReady)

let rumbleSynth = null;
// Master effects bus: all synths → compressor → reverb → limiter → Destination
let masterCompressor = null;
let masterReverb = null;
let masterLimiter = null;

function initAudio() {
  if (typeof Tone === "undefined") {
    console.warn("Tone.js not loaded! Audio will be disabled.");
    return;
  }

  // Build master effects chain
  masterCompressor = new Tone.Compressor({ threshold: -20, ratio: 4 });
  masterReverb = new Tone.Reverb({ decay: 0.3, wet: 0.2 });
  masterLimiter = new Tone.Limiter(-1);
  masterCompressor.chain(masterReverb, masterLimiter, Tone.Destination);

  hitSynth = new Tone.MembraneSynth({
    pitchDecay: 0.01,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.1, sustain: 0 },
  }).connect(masterCompressor);
  breakSynth = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0 },
  }).connect(masterCompressor);
  clearSynth = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.5 },
  }).connect(masterCompressor);
  clearSynth.volume.value = -8;
  placeSynth = new Tone.Synth({
    oscillator: { type: "square" },
    envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.1 },
  }).connect(masterCompressor);
  placeSynth.volume.value = -18;
  // Deep wooden thud for trunk hits (lower & more resonant than generic hitSynth)
  trunkHitSynth = new Tone.MembraneSynth({
    pitchDecay: 0.12,
    octaves: 6,
    envelope: { attack: 0.001, decay: 0.35, sustain: 0 },
  }).connect(masterCompressor);
  trunkHitSynth.volume.value = -6;
  // Light airy tap for leaf hits — quiet high-pitched sine
  leafHitSynth = new Tone.Synth({
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.04 },
  }).connect(masterCompressor);
  leafHitSynth.volume.value = -18;
  // Metallic ping for rock hits — clearly distinct from wood/leaf
  rockHitSynth = new Tone.MetalSynth({
    frequency: 220,
    envelope: { attack: 0.001, decay: 0.1, release: 0.08 },
    harmonicity: 5.1,
    modulationIndex: 16,
    resonance: 3000,
    octaves: 1.5,
  }).connect(masterCompressor);
  rockHitSynth.volume.value = -10;
  // Sharp crack for rock breaks: high attack, brief decay
  rockCrackSynth = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.02, decay: 0.06, sustain: 0 },
  }).connect(masterCompressor);
  rockCrackSynth.volume.value = -4;
  // Low rumble that plays during the anticipation phase of a line clear.
  rumbleSynth = new Tone.MembraneSynth({
    pitchDecay: 0.15,
    octaves: 4,
    envelope: { attack: 0.005, decay: 0.25, sustain: 0.5, release: 0.2 },
  }).connect(masterCompressor);
  rumbleSynth.volume.value = -3;
  audioReady = true;
  console.log("Tone.js initialized.");
}

/** Low bass rumble that plays during the anticipation build-up. */
function playLineClearRumble() {
  if (!audioReady || !rumbleSynth) return;
  rumbleSynth.triggerAttackRelease("C1", "4n", Tone.now());
}

/** Play a rising arpeggio when lines are cleared. */
function playLineClearSound(numLines) {
  if (!audioReady || !clearSynth) return;
  const now = Tone.now();
  const notes = ["C4", "E4", "G4", "B4", "C5"];
  const count = Math.min(numLines + 2, 5);
  for (let i = 0; i < count; i++) {
    clearSynth.triggerAttackRelease(notes[i], "8n", now + i * 0.1);
  }
}
