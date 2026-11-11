// node seg.mjs file.wav [thrDbAboveFloor=12] : events with dur, peak, SNR, voiced fraction and median f0
import { readWav } from './wav.mjs';
const [f, thr = 12, minGap = 0.15] = process.argv.slice(2); const { sr, x } = readWav(f);
const H = Math.round(sr * 0.01), n = Math.floor(x.length / H), e = new Float64Array(n);
for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < H; k++) s += x[i * H + k] ** 2; e[i] = 10 * Math.log10(s / H + 1e-12); }
const sorted = [...e].sort((a, b) => a - b), floor = sorted[Math.floor(n * 0.1)];
const on = e.map((v) => v > floor + +thr);
const ev = []; let s = -1, last = -1;
for (let i = 0; i < n; i++) { if (on[i]) { if (s < 0) s = i; last = i; } else if (s >= 0 && (i - last) * 0.01 > +minGap) { ev.push([s, last]); s = -1; } }
if (s >= 0) ev.push([s, last]);
function f0(a) { // autocorrelation pitch on 40ms frame
  const N = Math.round(sr * 0.04); const fr = x.subarray(a, a + N); let e0 = 0; for (const v of fr) e0 += v * v; if (e0 < 1e-7) return 0;
  let best = 0, bl = 0; for (let l = Math.round(sr / 1500); l < Math.round(sr / 80); l++) { let c = 0; for (let i = 0; i + l < N; i++) c += fr[i] * fr[i + l]; c /= e0; if (c > best) { best = c; bl = l; } }
  return best > 0.5 ? sr / bl : 0; }
console.log(`floor ${floor.toFixed(1)} dB, ${(x.length / sr).toFixed(2)} s`);
for (const [a, b] of ev) { const t0 = a * 0.01, t1 = (b + 1) * 0.01; if (t1 - t0 < 0.08) continue;
  let pk = -200; for (let i = a; i <= b; i++) pk = Math.max(pk, e[i]);
  const fs = []; for (let t = t0; t < t1 - 0.04; t += 0.02) fs.push(f0(Math.round(t * sr)));
  const v = fs.filter((q) => q > 0).sort((p, q) => p - q);
  console.log(`${t0.toFixed(2)}-${t1.toFixed(2)} dur ${(t1 - t0).toFixed(2)} pk ${pk.toFixed(1)} snr ${(pk - floor).toFixed(0)} voiced ${(v.length / (fs.length || 1)).toFixed(2)} f0 ${v.length ? Math.round(v[v.length >> 1]) : '-'}`); }
