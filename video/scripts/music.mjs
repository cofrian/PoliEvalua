// Música original del vídeo, sintetizada desde cero (sin muestras ni derechos de terceros).
// 120 BPM, progresión La m · Fa · Do · Sol. Genera public/music.wav.
import { mkdirSync, writeFileSync } from "node:fs";

const RATE = 44100;
const BPM = 120;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
export const BARS = 25;
const SECONDS = BARS * BAR + 2;
const L = new Float32Array(Math.ceil(SECONDS * RATE));
const R = new Float32Array(L.length);

const midi = (note) => 440 * 2 ** ((note - 69) / 12);
const CHORDS = [
  [57, 60, 64], // La m
  [53, 57, 60], // Fa
  [48, 52, 55], // Do
  [55, 59, 62], // Sol
];
let seed = 7;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

function add(start, length, fn, gain = 1, pan = 0) {
  const from = Math.floor(start * RATE);
  const count = Math.floor(length * RATE);
  for (let i = 0; i < count && from + i < L.length; i++) {
    const v = fn(i / RATE, i / count) * gain;
    L[from + i] += v * (1 - Math.max(0, pan));
    R[from + i] += v * (1 + Math.min(0, pan));
  }
}

const kick = (t) => {
  add(t, 0.45, (s) => Math.sin(2 * Math.PI * (45 * s + 90 * (1 - Math.exp(-s * 30)) / 30)) * Math.exp(-s * 7), 0.9);
};
const clap = (t) => add(t, 0.25, (s) => noise() * Math.exp(-s * 18) * (s < 0.01 ? 0.6 : 1), 0.28);
const hat = (t, open = false) => {
  let last = 0;
  add(t, open ? 0.18 : 0.05, (s) => {
    const n = noise();
    const hp = n - last;
    last = n;
    return hp * Math.exp(-s * (open ? 18 : 70));
  }, 0.14, 0.3);
};
const bass = (t, note, len) => {
  const f = midi(note - 24);
  add(t, len, (s, p) => {
    const saw = 2 * ((s * f) % 1) - 1;
    return (saw * 0.5 + Math.sin(2 * Math.PI * f * s)) * Math.min(1, s * 200) * (1 - p) ** 0.6;
  }, 0.22);
};
const pad = (t, notes, len, gain = 0.06) => {
  for (const [k, note] of notes.entries()) {
    for (const detune of [-0.12, 0.12]) {
      const f = midi(note + detune);
      add(t, len, (s, p) => {
        const env = Math.min(1, s / 0.6) * Math.min(1, (1 - p) / 0.3);
        return (2 * ((s * f) % 1) - 1) * 0.35 * env;
      }, gain, detune < 0 ? -0.5 : 0.5 - k * 0.1);
    }
  }
};
const pluck = (t, note, gain = 0.12) => {
  const f = midi(note + 12);
  add(t, 0.4, (s) => (Math.sin(2 * Math.PI * f * s) + 0.3 * Math.sin(4 * Math.PI * f * s)) * Math.exp(-s * 9), gain, ((note % 5) - 2) * 0.2);
};

for (let bar = 0; bar < BARS; bar++) {
  const t0 = bar * BAR;
  const chord = CHORDS[bar % 4];
  const intro = bar < 4;
  const outro = bar >= BARS - 3;
  pad(t0, chord, BAR + 0.3, intro || outro ? 0.075 : 0.05);
  // Arpegio de corcheas en todo menos el final.
  if (!outro) {
    const arp = [chord[0], chord[1], chord[2], chord[1] + 12, chord[2], chord[1], chord[0] + 12, chord[2]];
    arp.forEach((note, i) => pluck(t0 + i * BEAT / 2, note, intro ? 0.07 : 0.1));
  }
  for (let beat = 0; beat < 4; beat++) {
    const t = t0 + beat * BEAT;
    if (!intro && !outro) {
      kick(t);
      if (beat % 2 === 1) clap(t);
      bass(t + BEAT / 2, chord[0], BEAT / 2 - 0.02);
      bass(t, chord[0], BEAT / 2 - 0.05);
    }
    if (!outro || bar === BARS - 3) {
      hat(t + BEAT / 2, beat === 3 && bar % 2 === 1);
      if (!intro) hat(t + BEAT / 4);
    }
  }
  // Redoble antes de que entre el ritmo.
  if (bar === 3) for (let i = 0; i < 8; i++) clap(t0 + 2 * BEAT + i * BEAT / 4);
}
// Golpe final.
kick((BARS - 3) * BAR);
pad((BARS - 3) * BAR, [45, 57, 60, 64], BAR * 3, 0.06);

// Eco estéreo y masterizado suave.
const delay = Math.floor(BEAT * 0.75 * RATE);
for (let i = delay; i < L.length; i++) {
  L[i] += R[i - delay] * 0.22;
  R[i] += L[i - delay] * 0.22;
}
let peak = 0;
for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
const buffer = Buffer.alloc(44 + L.length * 4);
buffer.write("RIFF", 0);
buffer.writeUInt32LE(36 + L.length * 4, 4);
buffer.write("WAVEfmt ", 8);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(2, 22);
buffer.writeUInt32LE(RATE, 24);
buffer.writeUInt32LE(RATE * 4, 28);
buffer.writeUInt16LE(4, 32);
buffer.writeUInt16LE(16, 34);
buffer.write("data", 36);
buffer.writeUInt32LE(L.length * 4, 40);
const soft = (v) => Math.tanh((v / peak) * 1.4) / Math.tanh(1.4);
for (let i = 0; i < L.length; i++) {
  const fade = Math.min(1, (L.length - i) / (RATE * 1.5));
  buffer.writeInt16LE(Math.round(soft(L[i]) * fade * 30000), 44 + i * 4);
  buffer.writeInt16LE(Math.round(soft(R[i]) * fade * 30000), 46 + i * 4);
}
mkdirSync("public", { recursive: true });
writeFileSync("public/music.wav", buffer);
console.log(`music.wav: ${SECONDS.toFixed(1)} s`);
