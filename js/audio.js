// Audio system — Tone.js setup and sound playback.
// Requires: state.js (hitSynth, breakSynth, clearSynth, audioReady)

let rumbleSynth = null;

function initAudio() {
  if (typeof Tone === "undefined") {
    console.warn("Tone.js not loaded! Audio will be disabled.");
    return;
  }
  hitSynth = new Tone.MembraneSynth({
    pitchDecay: 0.01,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.1, sustain: 0 },
  }).toDestination();
  breakSynth = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0 },
  }).toDestination();
  clearSynth = new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.5 },
  }).toDestination();
  clearSynth.volume.value = -8;
  placeSynth = new Tone.Synth({
    oscillator: { type: "square" },
    envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.1 },
  }).toDestination();
  placeSynth.volume.value = -18;
  // Low rumble that plays during the anticipation phase of a line clear.
  rumbleSynth = new Tone.MembraneSynth({
    pitchDecay: 0.15,
    octaves: 4,
    envelope: { attack: 0.005, decay: 0.25, sustain: 0.5, release: 0.2 },
  }).toDestination();
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
