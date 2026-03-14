// Audio system — Tone.js setup and sound playback.
// Requires: state.js (hitSynth, breakSynth, clearSynth, audioReady)

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
  audioReady = true;
  console.log("Tone.js initialized.");
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
