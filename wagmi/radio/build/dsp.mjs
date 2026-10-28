// Mog City radio build tools (Node, not loaded by the game): the sample-level tools the voice and music builds share.
import { biquad } from './wav.mjs';

// read x at fractional positions (cubic Hermite)
export function at(x, p) {
  const i = Math.floor(p), f = p - i, n = x.length;
  const xm = x[Math.max(0, i - 1)] || 0, x0 = x[i] || 0, x1 = i + 1 < n ? x[i + 1] : 0, x2 = i + 2 < n ? x[i + 2] : 0;
  const c = (x1 - xm) * 0.5, v = x0 - x1, w = c + v, a = w + v + (x2 - x0) * 0.5, b = w + a;
  return ((a * f - b) * f + c) * f + x0;
}
// play x back at speed k (k < 1: slower, lower, longer)
export function resample(x, k) {
  const n = Math.floor(x.length / k), y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = at(x, i * k);
  return y;
}
// WSOLA time stretch: the same pitch, len * factor long (speech-sized frames)
export function stretch(x, factor, sr) {
  const N = 2 * Math.round(0.016 * sr), Hs = N / 2, Ha = Hs / factor, tol = Math.round(N / 4);
  const outLen = Math.ceil(x.length * factor), out = new Float32Array(outLen + N), wsum = new Float32Array(outLen + N);
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const get = (i) => (i >= 0 && i < x.length ? x[i] : 0);
  let prev = 0;
  for (let k = 0; k * Hs < outLen; k++) {
    const nominal = Math.round(k * Ha);
    let best = nominal;
    if (k > 0) {
      // the frame whose start best continues the last one (its natural next hop)
      let bc = -Infinity; const nat = prev + Hs;
      for (let d = -tol; d <= tol; d += 2) {
        const s = nominal + d; let c = 0;
        for (let i = 0; i < N; i += 4) c += get(s + i) * get(nat + i);
        if (c > bc) { bc = c; best = s; }
      }
    }
    const o = k * Hs;
    for (let i = 0; i < N; i++) { out[o + i] += win[i] * get(best + i); wsum[o + i] += win[i]; }
    prev = best;
  }
  for (let i = 0; i < outLen; i++) if (wsum[i] > 1e-3) out[i] /= wsum[i];
  return out.subarray(0, outLen);
}
// pitch (and formants) shifted by semis, the length kept
export function shift(x, semis, sr) {
  const k = Math.pow(2, semis / 12);
  return fit(stretch(resample(x, k), k, sr), x.length);
}
export function fit(x, n) { if (x.length === n) return x; const y = new Float32Array(n); y.set(x.subarray(0, Math.min(n, x.length))); return y; }

// cut leading and trailing quiet (below -45 dB of the peak), keeping pad seconds each side
export function trim(x, sr, pad = 0.04) {
  let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
  const th = pk * 0.0056, w = Math.round(0.01 * sr);
  const loud = (i) => { let m = 0; for (let j = i; j < Math.min(x.length, i + w); j++) m = Math.max(m, Math.abs(x[j])); return m > th; };
  let a = 0; while (a < x.length && !loud(a)) a += w;
  let b = x.length - w; while (b > a && !loud(b)) b -= w;
  a = Math.max(0, a - Math.round(pad * sr)); b = Math.min(x.length, b + w + Math.round(pad * sr));
  const y = x.slice(a, b);
  const f = Math.round(0.006 * sr); for (let i = 0; i < f && i < y.length; i++) { y[i] *= i / f; y[y.length - 1 - i] *= i / f; }
  return y;
}

export const run = (x, ...filters) => { for (const f of filters) f.run(x); return x; };
export const gainDb = (x, db) => { const g = Math.pow(10, db / 20); for (let i = 0; i < x.length; i++) x[i] *= g; return x; };

// a voice changer (a speaker whose cast has fx 'changer'; nobody's now): the voice dropped and made bigger (pitch and formants down), an octave-down double under it, ring
// modulated, a metal mask resonance, driven a little, the chest pushed (a menacing streamer's voice changer)
export function voiceChanger(x, sr, { semis = -3, octave = 0.42, ring = 0.32, ringHz = 46, drive = 2.4 } = {}) {
  const base = shift(x, semis, sr), low = shift(x, semis - 12, sr), n = x.length, y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = base[i] + octave * low[i];
    const rm = v * Math.sin((2 * Math.PI * ringHz * i) / sr);
    y[i] = v * (1 - ring) + rm * ring * 1.6;
  }
  // the mask: a short comb (a hollow, metallic ring to it)
  const d = Math.round(0.0047 * sr), fb = 0.38;
  for (let i = d; i < n; i++) y[i] += fb * y[i - d] * 0.6;
  // drive
  let pk = 0; for (const v of y) pk = Math.max(pk, Math.abs(v));
  const t = Math.tanh(drive);
  for (let i = 0; i < n; i++) y[i] = Math.tanh((y[i] / (pk || 1)) * drive) / t;
  run(y, biquad('highpass', 70, 0.7, sr), biquad('peak', 150, 0.9, sr, 4), biquad('peak', 900, 1.2, sr, -3), biquad('peak', 2600, 1.4, sr, 3), biquad('lowpass', 7000, 0.7, sr));
  return y;
}
// a call's sound (what the game does live, for renders made here): phone = a handset's band, video = a laptop mic
export function callFx(x, sr, kind = 'phone') {
  if (kind === 'phone') run(x, biquad('highpass', 320, 0.8, sr), biquad('highpass', 320, 0.8, sr), biquad('peak', 1800, 1, sr, 4), biquad('lowpass', 3400, 0.8, sr), biquad('lowpass', 3400, 0.8, sr));
  else run(x, biquad('highpass', 160, 0.7, sr), biquad('peak', 2500, 1, sr, 2), biquad('lowpass', 6500, 0.7, sr));
  return x;
}

// pauses inside a line held to at most gap seconds (the speech voices stop too long at every full stop)
export function squeeze(x, sr, gap = 0.2) {
  let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
  const w = Math.round(0.01 * sr), th = pk * 0.01, quiet = [];
  for (let i = 0; i < x.length; i += w) { let m = 0; for (let j = i; j < Math.min(x.length, i + w); j++) m = Math.max(m, Math.abs(x[j])); quiet.push(m < th); }
  const keep = Math.round(gap * sr), parts = []; let cut = 0, i = 0;
  while (i < quiet.length) {
    if (!quiet[i]) { i++; continue; }
    let j = i; while (j < quiet.length && quiet[j]) j++;
    const a = i * w, b = Math.min(x.length, j * w);
    if (i > 0 && j < quiet.length && b - a > keep) { parts.push([cut, a + keep / 2]); cut = b - keep / 2; }
    i = j;
  }
  parts.push([cut, x.length]);
  const n = parts.reduce((s, [a, b]) => s + Math.round(b - a), 0), y = new Float32Array(n);
  let o = 0; const f = Math.round(0.004 * sr);
  for (const [a, b] of parts) { const seg = x.subarray(Math.round(a), Math.round(b)); y.set(seg, o); for (let k = 0; k < f && k < seg.length; k++) { y[o + k] *= k / f; y[o + seg.length - 1 - k] *= k / f; } o += seg.length; }
  return y;
}

// a whisper made of a voiced line (the 'whisper' register: Jane on the phone on a tail): every 25 ms frame's spectral
// envelope (LPC, the mouth) driven by noise instead of the voice (the same words, no pitch), with a trace of the voice
// left under it (keep) so it stays clear through the phone's band. Seeded: the same line gives the same whisper.
export function whisper(x, sr, { order = 20, keep = 0.12, pre = 0.95, seed = 1 } = {}) {
  const N = 2 * Math.round(0.0125 * sr), H = N / 2, n = x.length, P = order * 4;
  const e = new Float32Array(n); for (let i = 0; i < n; i++) e[i] = x[i] - pre * (i ? x[i - 1] : 0);
  const win = new Float32Array(N); let w2 = 0; for (let i = 0; i < N; i++) { win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N); w2 += win[i] * win[i]; }
  // (a seeded gaussian noise)
  let s = seed >>> 0 || 1; const u = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (((t ^ (t >>> 14)) >>> 0) + 0.5) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  const y = new Float32Array(n + N), f = new Float64Array(N), r = new Float64Array(order + 1), a = new Float64Array(order + 1), tmp = new Float64Array(order + 1), buf = new Float64Array(P + N);
  for (let st = -H; st < n; st += H) {
    for (let i = 0; i < N; i++) { const j = st + i; f[i] = (j >= 0 && j < n ? e[j] : 0) * win[i]; }
    for (let k = 0; k <= order; k++) { let c = 0; for (let i = k; i < N; i++) c += f[i] * f[i - k]; r[k] = c * (k ? Math.exp(-0.5 * Math.pow((2 * Math.PI * 60 * k) / sr, 2)) : 1 + 1e-6); }
    if (r[0] < 1e-9) continue;
    // Levinson-Durbin: a[1..order], the prediction error power err
    a.fill(0); a[0] = 1; let err = r[0];
    for (let i = 1; i <= order; i++) {
      let acc = r[i]; for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
      const k = -acc / err; tmp.set(a); for (let j = 1; j < i; j++) a[j] = tmp[j] + k * tmp[i - j]; a[i] = k; err *= 1 - k * k; if (err <= 0) break;
    }
    const g = Math.sqrt(Math.max(err, 0) / w2);
    // noise through 1/A(z) (a short run-in first, so the frame starts in step), windowed, overlap-added
    for (let i = 0; i < P + N; i++) { let v = g * gauss(); for (let j = 1; j <= order && i - j >= 0; j++) v -= a[j] * buf[i - j]; buf[i] = v; }
    for (let i = 0; i < N; i++) { const j = st + i; if (j >= 0 && j < n) y[j] += buf[P + i] * win[i]; }
  }
  // de-emphasis, then the voice's trace under it, at the voice's own level
  for (let i = 1; i < n; i++) y[i] += pre * y[i - 1];
  let ex = 0, ey = 0; for (let i = 0; i < n; i++) { ex += x[i] * x[i]; ey += y[i] * y[i]; }
  const gy = ey > 0 ? Math.sqrt(ex / ey) : 0, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (1 - keep) * gy * y[i] + keep * x[i];
  return run(out, biquad('highpass', 120, 0.7, sr));
}
