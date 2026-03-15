// tools/generate-sounds.js
// Generates synthetic but physically-plausible game SFX WAV files.
// Run: node tools/generate-sounds.js
// Output: sounds/*.wav

const fs = require("fs");
const path = require("path");

const SAMPLE_RATE = 44100;

// ── WAV writer ────────────────────────────────────────────────────────────────

function writeWav(filename, samples) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (SAMPLE_RATE * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * 2;

  const buf = Buffer.alloc(44 + dataSize);
  let o = 0;
  buf.write("RIFF", o); o += 4;
  buf.writeUInt32LE(36 + dataSize, o); o += 4;
  buf.write("WAVE", o); o += 4;
  buf.write("fmt ", o); o += 4;
  buf.writeUInt32LE(16, o); o += 4;
  buf.writeUInt16LE(1, o); o += 2;   // PCM
  buf.writeUInt16LE(numChannels, o); o += 2;
  buf.writeUInt32LE(SAMPLE_RATE, o); o += 4;
  buf.writeUInt32LE(byteRate, o); o += 4;
  buf.writeUInt16LE(blockAlign, o); o += 2;
  buf.writeUInt16LE(bitsPerSample, o); o += 2;
  buf.write("data", o); o += 4;
  buf.writeUInt32LE(dataSize, o); o += 4;

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), o);
    o += 2;
  }
  fs.writeFileSync(filename, buf);
}

// ── DSP helpers ───────────────────────────────────────────────────────────────

function silence(len) {
  return new Array(len).fill(0);
}

function whiteNoise(len) {
  return Array.from({ length: len }, () => Math.random() * 2 - 1);
}

function sine(freq, len) {
  return Array.from({ length: len }, (_, i) =>
    Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE)
  );
}

// Exponential AR envelope: attack then exponential decay
function envAR(samples, attackSec, halflifeSec) {
  const attackN = Math.floor(attackSec * SAMPLE_RATE);
  return samples.map((s, i) => {
    const amp =
      i < attackN
        ? i / Math.max(attackN, 1)
        : Math.exp((-Math.LN2 * (i - attackN)) / (halflifeSec * SAMPLE_RATE));
    return s * amp;
  });
}

// One-pole lowpass filter
function lowpass(samples, cutoffHz) {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / SAMPLE_RATE;
  const alpha = dt / (rc + dt);
  let prev = 0;
  return samples.map((s) => {
    prev += alpha * (s - prev);
    return prev;
  });
}

// One-pole highpass filter
function highpass(samples, cutoffHz) {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / SAMPLE_RATE;
  const alpha = rc / (rc + dt);
  let prevIn = 0, prevOut = 0;
  return samples.map((s) => {
    const out = alpha * (prevOut + s - prevIn);
    prevIn = s;
    prevOut = out;
    return out;
  });
}

// Sum multiple arrays, pad with zeros, peak-normalize to targetPeak
function mixNorm(arrays, targetPeak = 0.88) {
  const len = Math.max(...arrays.map((a) => a.length));
  const out = silence(len);
  for (const arr of arrays) {
    for (let i = 0; i < arr.length; i++) out[i] += arr[i];
  }
  const peak = Math.max(...out.map(Math.abs), 1e-9);
  return out.map((s) => (s / peak) * targetPeak);
}

// ── Sound recipes ─────────────────────────────────────────────────────────────

const soundsDir = path.join(__dirname, "..", "sounds");
if (!fs.existsSync(soundsDir)) fs.mkdirSync(soundsDir);

// wood_hit — mid-freq thump with woody resonance
{
  const dur = Math.floor(0.22 * SAMPLE_RATE);
  const body = lowpass(whiteNoise(dur), 350);
  const knock = sine(110, dur).map(
    (s, i) => s * Math.exp((-i / SAMPLE_RATE) * 22)
  );
  const tap = sine(55, dur).map(
    (s, i) => s * Math.exp((-i / SAMPLE_RATE) * 35)
  );
  const samples = mixNorm([
    envAR(body, 0.002, 0.06),
    knock,
    tap,
  ]);
  writeWav(path.join(soundsDir, "wood_hit.wav"), samples);
  console.log("  wood_hit.wav");
}

// wood_break — heavier, lower, with splintering crunch
{
  const dur = Math.floor(0.38 * SAMPLE_RATE);
  const body = lowpass(whiteNoise(dur), 250);
  const splinter = highpass(lowpass(whiteNoise(dur), 1800), 400);
  const thud = sine(70, dur).map(
    (s, i) => s * Math.exp((-i / SAMPLE_RATE) * 14)
  );
  const samples = mixNorm([
    envAR(body, 0.003, 0.1).map((s) => s * 0.9),
    envAR(splinter, 0.001, 0.08).map((s) => s * 0.5),
    thud,
  ]);
  writeWav(path.join(soundsDir, "wood_break.wav"), samples);
  console.log("  wood_break.wav");
}

// stone_hit — sharp click + low knock
{
  const dur = Math.floor(0.18 * SAMPLE_RATE);
  const click = highpass(whiteNoise(dur), 700);
  const knock = sine(95, dur).map(
    (s, i) => s * Math.exp((-i / SAMPLE_RATE) * 40)
  );
  const samples = mixNorm([
    envAR(click, 0.001, 0.04),
    knock,
  ]);
  writeWav(path.join(soundsDir, "stone_hit.wav"), samples);
  console.log("  stone_hit.wav");
}

// stone_break — gritty crunch
{
  const dur = Math.floor(0.28 * SAMPLE_RATE);
  const grit = highpass(lowpass(whiteNoise(dur), 3000), 500);
  const boom = sine(75, dur).map(
    (s, i) => s * Math.exp((-i / SAMPLE_RATE) * 18)
  );
  const crack = sine(180, dur).map(
    (s, i) => s * Math.exp((-i / SAMPLE_RATE) * 55)
  );
  const samples = mixNorm([
    envAR(grit, 0.004, 0.09),
    boom,
    crack.map((s) => s * 0.4),
  ]);
  writeWav(path.join(soundsDir, "stone_break.wav"), samples);
  console.log("  stone_break.wav");
}

// leaf_hit — soft high-freq rustle
{
  const dur = Math.floor(0.12 * SAMPLE_RATE);
  const rustle = highpass(whiteNoise(dur), 3500);
  const samples = envAR(rustle, 0.002, 0.04).map((s) => s * 0.55);
  writeWav(path.join(soundsDir, "leaf_hit.wav"), samples);
  console.log("  leaf_hit.wav");
}

// leaf_break — brief papery burst
{
  const dur = Math.floor(0.18 * SAMPLE_RATE);
  const burst = highpass(lowpass(whiteNoise(dur), 6000), 2000);
  const samples = envAR(burst, 0.001, 0.06).map((s) => s * 0.6);
  writeWav(path.join(soundsDir, "leaf_break.wav"), samples);
  console.log("  leaf_break.wav");
}

// place — satisfying short thud
{
  const dur = Math.floor(0.16 * SAMPLE_RATE);
  const body = lowpass(whiteNoise(dur), 450);
  const thud = sine(105, dur).map(
    (s, i) => s * Math.exp((-i / SAMPLE_RATE) * 30)
  );
  const samples = mixNorm([
    envAR(body, 0.002, 0.055),
    thud.map((s) => s * 0.6),
  ]);
  writeWav(path.join(soundsDir, "place.wav"), samples);
  console.log("  place.wav");
}

console.log("\nDone. Files written to sounds/");
