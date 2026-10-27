// Mog City radio build tools (Node, not loaded by the game): WAV in and out, and a few measurements.
import fs from 'node:fs';

// read a PCM16 / float32 WAV: { sr, ch: [Float32Array, ...] }
export function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not a wav: ' + file);
  let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), n = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { tag: b.readUInt16LE(p + 8), chans: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    else if (id === 'data') data = b.subarray(p + 8, p + 8 + Math.min(n, b.length - p - 8));
    p += 8 + n + (n & 1);
  }
  const { chans, sr, bits, tag } = fmt, bps = bits / 8, frames = Math.floor(data.length / (bps * chans));
  const ch = Array.from({ length: chans }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) for (let c = 0; c < chans; c++) {
    const o = (i * chans + c) * bps;
    ch[c][i] = tag === 3 ? data.readFloatLE(o) : bits === 16 ? data.readInt16LE(o) / 32768 : bits === 24 ? (data.readIntLE(o, 3) / 8388608) : data.readInt32LE(o) / 2147483648;
  }
  return { sr, ch };
}

// write PCM16 (dithered)
export function writeWav(file, sr, ch) {
  const n = ch[0].length, chans = ch.length, b = Buffer.alloc(44 + n * chans * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * chans * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(chans, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * chans * 2, 28); b.writeUInt16LE(chans * 2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * chans * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < chans; c++) {
    const d = (Math.random() - Math.random()) / 32768;
    b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((ch[c][i] + d) * 32767))), o); o += 2;
  }
  fs.writeFileSync(file, b);
}

// a biquad (RBJ cookbook), run over a whole buffer in place or sample by sample
export function biquad(type, f, q, sr, gainDb = 0) {
  const w = 2 * Math.PI * f / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q), A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lowpass') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'highpass') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'bandpass') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
  else if (type === 'lowshelf') { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) - (A - 1) * cs + s); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - s); a0 = (A + 1) + (A - 1) * cs + s; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - s; }
  else if (type === 'highshelf') { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cs + s); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s); a0 = (A + 1) - (A - 1) * cs + s; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s; }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const step = (x) => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  step.run = (buf) => { for (let i = 0; i < buf.length; i++) buf[i] = step(buf[i]); return buf; };
  return step;
}

// integrated loudness (ITU-R BS.1770: K-weighting, 400 ms blocks, the -70 and relative -10 gates), true-ish peak
export function lufs(sr, ch) {
  const kw = ch.map((x) => { const y = Float32Array.from(x); biquad('highshelf', 1681.97, 0.7071, sr, 4.0).run(y); biquad('highpass', 38.13, 0.5003, sr).run(y); return y; });
  const blk = Math.round(0.4 * sr), hop = Math.round(0.1 * sr), ms = [];
  for (let s = 0; s + blk <= kw[0].length; s += hop) { let e = 0; for (const y of kw) for (let i = s; i < s + blk; i++) e += y[i] * y[i]; ms.push(e / blk); }
  const L = (m) => -0.691 + 10 * Math.log10(m);
  let g = ms.filter((m) => L(m) > -70); if (!g.length) return { lufs: -Infinity, peak: 0 };
  const rel = L(g.reduce((a, b) => a + b, 0) / g.length) - 10;
  g = g.filter((m) => L(m) > rel);
  let peak = 0; for (const x of ch) for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; }
  return { lufs: L(g.reduce((a, b) => a + b, 0) / g.length), peak, peakDb: 20 * Math.log10(peak) };
}

// median fundamental (Hz) over the voiced 40 ms frames (normalised autocorrelation, 70-400 Hz)
export function pitch(sr, x) {
  const N = Math.round(0.04 * sr), hop = Math.round(0.01 * sr), out = [];
  for (let s = 0; s + N + Math.ceil(sr / 70) < x.length; s += hop) {
    let e = 0; for (let i = s; i < s + N; i++) e += x[i] * x[i]; if (e / N < 1e-4) continue;
    let best = 0, bl = 0;
    for (let l = Math.floor(sr / 400); l <= Math.ceil(sr / 70); l++) { let c = 0, e2 = 0; for (let i = s; i < s + N; i++) { c += x[i] * x[i + l]; e2 += x[i + l] * x[i + l]; } const r = c / Math.sqrt(e * e2 + 1e-12); if (r > best) { best = r; bl = l; } }
    if (best > 0.75) out.push(sr / bl);
  }
  out.sort((a, b) => a - b);
  return { f0: out.length ? out[Math.floor(out.length / 2)] : 0, voiced: out.length * hop / sr };
}

// the time between the first and last sample above -40 dB of the peak
export function speechSpan(sr, x) {
  let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
  const th = pk * 0.01; let a = 0, b = x.length - 1;
  while (a < x.length && Math.abs(x[a]) < th) a++; while (b > a && Math.abs(x[b]) < th) b--;
  return { start: a / sr, end: b / sr, dur: (b - a) / sr };
}
