// Mog City: render an original track to assets/music/<id>.m4a (Node, macOS afconvert).
//   node wagmi/radio/build/music/render.mjs theme [pump glide]   (writes the WAV next to the build log in --wav <dir>)
// Each track is set to -14 LUFS integrated with its peaks under -1 dBTP, and measured: loudness, peak, and the share of
// energy per band in each section (to see the mix: sub, bass, low-mid, mid, high, air).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeWav, lufs, biquad } from '../wav.mjs';
import { SR } from './synth.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../..');
const args = process.argv.slice(2), wavDir = args.includes('--wav') ? args[args.indexOf('--wav') + 1] : null;
const names = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--wav');
const TARGET = -14, CEIL = Math.pow(10, -1.2 / 20);

for (const name of names) {
  const mod = await import(`./${name}.mjs`), t0 = Date.now();
  const m = mod.build(), raw = [m.L, m.R];
  // gain to the target loudness through the limiter, a few passes
  let g = 1, out = null, meas = null;
  for (let k = 0; k < 4; k++) {
    out = raw.map((ch) => ch.map((v) => v * g));
    m.limit(out, CEIL);
    meas = lufs(SR, out);
    const err = TARGET - meas.lufs; if (Math.abs(err) < 0.1) break;
    if (k === 0) { const pre = lufs(SR, raw); g = Math.pow(10, (TARGET - pre.lufs) / 20); } else g *= Math.pow(10, err / 20);
  }
  const id = mod.meta.id, dur = out[0].length / SR;
  const wav = path.join(wavDir || '/tmp', `${id}.wav`);
  writeWav(wav, SR, out);
  const m4a = path.join(ROOT, 'assets/music', `${id}.m4a`);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '192000', wav, m4a]);
  console.log(`${id}: ${dur.toFixed(2)} s, ${meas.lufs.toFixed(2)} LUFS, peak ${meas.peakDb.toFixed(2)} dBFS, gain ${(20 * Math.log10(g)).toFixed(1)} dB, limiter max ${out.gr.max.toFixed(1)} dB (mean ${out.gr.mean.toFixed(1)} dB over ${(out.gr.share * 100).toFixed(0)}% of it), ${((Date.now() - t0) / 1000).toFixed(1)} s to render -> ${path.relative(ROOT, m4a)} (${(fs.statSync(m4a).size / 1e6).toFixed(2)} MB)`);
  // the mix by section: bands' share of the energy (dB relative to the section's total)
  const bands = [['sub', 20, 60], ['bass', 60, 250], ['lowmid', 250, 1000], ['mid', 1000, 4000], ['high', 4000, 10000], ['air', 10000, 20000]];
  const mono = out[0].map((v, i) => (v + out[1][i]) / 2);
  const split = bands.map(([, lo, hi]) => { const x = Float32Array.from(mono); biquad('highpass', lo, 0.707, SR).run(x); biquad('highpass', lo, 0.707, SR).run(x); biquad('lowpass', hi, 0.707, SR).run(x); biquad('lowpass', hi, 0.707, SR).run(x); return x; });
  const secs = mod.meta.sections || [];
  const bar = 60 / mod.meta.bpm * 4;
  const rows = (secs.length ? secs : [['all', 0, dur / bar]]).map(([n, a, z]) => {
    const i0 = Math.round(a * bar * SR), i1 = Math.min(mono.length, Math.round(z * bar * SR));
    const e = split.map((x) => { let s = 0; for (let i = i0; i < i1; i++) s += x[i] * x[i]; return s / (i1 - i0); });
    const tot = e.reduce((p, q) => p + q, 0), l = lufs(SR, out.map((ch) => ch.subarray(i0, i1)));
    return `  ${n.padEnd(8)} ${l.lufs.toFixed(1).padStart(6)} LUFS  ` + bands.map(([b], j) => `${b} ${(10 * Math.log10(e[j] / tot)).toFixed(1).padStart(6)}`).join('  ');
  });
  console.log(rows.join('\n'));
  if (mod.meta && mod.meta.id) fs.writeFileSync(path.join(wavDir || '/tmp', `${id}.json`), JSON.stringify({ id, dur: +dur.toFixed(3), lufs: +meas.lufs.toFixed(2), peak: +meas.peakDb.toFixed(2) }));
}
