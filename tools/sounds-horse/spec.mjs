// node spec.mjs out.png pxPerSec file1.wav file2.wav ...  (stacked rows: waveform + spectrogram 0-8k, ticks per second)
import { readWav, fft, png } from './wav.mjs';
const [out, pps, ...files] = process.argv.slice(2); const PPS = +pps;
const rows = files.map((f) => { const [p, a, b] = f.split(':'); const R = readWav(p); if (a) R.x = R.x.subarray(Math.round(+a * R.sr), b ? Math.round(+b * R.sr) : undefined); return R; }); const W = Math.min(1800, Math.ceil(Math.max(...rows.map((r) => r.x.length / r.sr)) * PPS) + 4);
const RH = 60 + 160 + 14, H = RH * rows.length, img = Buffer.alloc(W * H * 3, 20);
const set = (x, y, r, g, b) => { if (x < 0 || x >= W || y < 0 || y >= H) return; const i = (y * W + x) * 3; img[i] = r; img[i + 1] = g; img[i + 2] = b; };
rows.forEach((R, ri) => {
  const y0 = ri * RH, hop = R.sr / PPS, N = 2048;
  let peak = 0; for (const v of R.x) peak = Math.max(peak, Math.abs(v));
  for (let px = 0; px < W; px++) {
    const a = Math.floor(px * hop), b = Math.min(R.x.length, Math.floor((px + 1) * hop)); if (a >= R.x.length) break;
    let mx = 0; for (let i = a; i < b; i++) mx = Math.max(mx, Math.abs(R.x[i])); const hh = Math.round(mx / (peak || 1) * 28);
    for (let y = 30 - hh; y <= 30 + hh; y++) set(px, y0 + y, 120, 200, 255);
    const re = new Float64Array(N), im = new Float64Array(N); const c = Math.floor((a + b) / 2) - N / 2;
    for (let i = 0; i < N; i++) { const v = R.x[c + i] || 0; re[i] = v * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); }
    fft(re, im);
    for (let y = 0; y < 160; y++) { const f = 8000 * (1 - y / 160), k = Math.round(f / R.sr * N); const m = Math.hypot(re[k], im[k]) / (peak || 1); const db = 20 * Math.log10(m + 1e-9); const v = Math.max(0, Math.min(1, (db + 40) / 60)); set(px, y0 + 60 + y, Math.round(255 * Math.min(1, v * 1.5)), Math.round(255 * v * v), Math.round(80 * (1 - v) + 40 * v)); }
  }
  for (let s = 0; s * PPS < W; s++) { const L = s % 5 === 0 ? 12 : 5; for (let y = 0; y < L; y++) set(Math.round(s * PPS), y0 + 220 + y, 255, 255, 255); }
  for (let x = 0; x < W; x++) set(x, y0 + RH - 1, 90, 90, 90);
});
png(out, W, H, img); console.log(out, W, H);
