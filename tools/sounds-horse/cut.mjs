// node cut.mjs <wavDir> <outDir> : denoise each source lightly, cut the cues, high-pass, trim, fade, level to one loudness
import { readWav, writeWav, fft } from './wav.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CUES } from './cues.mjs';
const [wavDir, outDir] = process.argv.slice(2); mkdirSync(outDir, { recursive: true });
const SR = 44100, N = 2048, HOP = 512, TARGET = -18, PEAK = 0.89;
const cache = new Map();
function denoise(x) { // light spectral subtraction against the source's own quietest frames
  const nf = Math.floor((x.length - N) / HOP) + 1, win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  const mags = [], E = [];
  for (let f = 0; f < nf; f++) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = x[f * HOP + i] * win[i]; fft(re, im); const m = new Float32Array(N / 2 + 1); let e = 0; for (let k = 0; k <= N / 2; k++) { m[k] = Math.hypot(re[k], im[k]); e += m[k] * m[k]; } mags.push([re, im, m]); E.push(e); }
  const idx = [...E.keys()].sort((a, b) => E[a] - E[b]).slice(0, Math.max(4, Math.floor(nf * 0.1)));
  const noise = new Float32Array(N / 2 + 1); for (const f of idx) for (let k = 0; k <= N / 2; k++) noise[k] += mags[f][2][k] / idx.length;
  const y = new Float32Array(x.length), wsum = new Float32Array(x.length);
  for (let f = 0; f < nf; f++) { const [re, im, m] = mags[f];
    for (let k = 0; k <= N / 2; k++) { const g = Math.max(0.35, 1 - 1.2 * noise[k] / (m[k] + 1e-12)); re[k] *= g; im[k] *= g; if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; } }
    for (let k = 0; k < N; k++) im[k] = -im[k]; fft(re, im); // inverse via conj
    for (let i = 0; i < N; i++) { y[f * HOP + i] += re[i] / N * win[i]; wsum[f * HOP + i] += win[i] * win[i]; } }
  for (let i = 0; i < y.length; i++) y[i] = wsum[i] > 1e-3 ? y[i] / wsum[i] : 0;
  return y;
}
function hp(x, fc = 70) { const w = 2 * Math.PI * fc / SR, q = 0.707, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al;
  const b0 = (1 + c) / 2 / a0, b1 = -(1 + c) / a0, b2 = b0, a1 = -2 * c / a0, a2 = (1 - al) / a0; let x1 = 0, x2 = 0, y1 = 0, y2 = 0; const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; }
const report = [];
for (const c of CUES) {
  if (!cache.has(c.src)) { const R = readWav(`${wavDir}/${c.src}.wav`); if (R.sr !== SR) throw new Error(c.src + ' sr'); cache.set(c.src, c.clean === false ? R.x : denoise(R.x)); }
  const X = cache.get(c.src); let x = hp(X.subarray(Math.round(c.a * SR), Math.min(X.length, Math.round(c.b * SR))));
  // trim to where it sounds (45 dB under its peak), with a 25 ms lead-in
  const fr = Math.round(SR * 0.01), e = []; for (let i = 0; i + fr <= x.length; i += fr) { let s = 0; for (let k = 0; k < fr; k++) s += x[i + k] ** 2; e.push(10 * Math.log10(s / fr + 1e-12)); }
  const pk = Math.max(...e); let s0 = e.findIndex((v) => v > pk - (c.trim ?? 40)), s1 = e.length - 1 - [...e].reverse().findIndex((v) => v > pk - (c.trim ?? 40));
  if (c.raw) { s0 = 0; s1 = e.length - 1; }
  x = x.slice(Math.max(0, s0 * fr - Math.round(0.025 * SR)), Math.min(x.length, (s1 + 1) * fr + Math.round(0.06 * SR)));
  const fi = Math.round(0.012 * SR), fo = Math.round((c.fo ?? 0.07) * SR);
  for (let i = 0; i < fi && i < x.length; i++) x[i] *= i / fi; for (let i = 0; i < fo && i < x.length; i++) x[x.length - 1 - i] *= i / fo;
  // loudness: RMS of its sounding 10 ms frames (within 20 dB of its loudest) to TARGET dBFS; peaks held under PEAK
  const ee = []; for (let i = 0; i + fr <= x.length; i += fr) { let s = 0; for (let k = 0; k < fr; k++) s += x[i + k] ** 2; ee.push(s / fr); }
  const top = Math.max(...ee), act = ee.filter((v) => v > top / 100), rms = 10 * Math.log10(act.reduce((a, b) => a + b, 0) / act.length);
  let g = 10 ** (((c.level ?? 0) + TARGET - rms) / 20), p = 0; for (const v of x) p = Math.max(p, Math.abs(v));
  if (p * g > PEAK) g = PEAK / p; for (let i = 0; i < x.length; i++) x[i] *= g;
  writeWav(`${outDir}/${c.name}.wav`, x);
  report.push({ name: c.name, src: c.src, a: c.a, b: c.b, dur: +(x.length / SR).toFixed(3), loud: +(rms + 20 * Math.log10(g)).toFixed(1), peak: +(20 * Math.log10(p * g)).toFixed(1) });
}
writeFileSync(`${outDir}/cuts.json`, JSON.stringify(report, null, 1));
for (const r of report) console.log(r.name.padEnd(14), String(r.src).padEnd(7), r.dur, 'loud', r.loud, 'peak', r.peak);
