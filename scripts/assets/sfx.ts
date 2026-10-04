/**
 * A bank of short recorded sounds for the runtime (the fight's impacts), from
 * a pack of Ogg Vorbis files: each decoded by the system's own afconvert
 * (which reads Ogg on macOS), made mono (the pack is dual-mono), cleaned (DC
 * blocked, so nothing clicks; the silence before the hit cut, a 2 ms fade in,
 * the tail cut below -50 dB with a short fade out), brought to the same peak,
 * then laid one after another with a gap of silence into a single sprite,
 * encoded as AAC in an MP4 (every browser decodes it, as the music does).
 * The sprite is decoded back to check that its length survived the encoder,
 * so the start and length of each sound in asset.json can be trusted.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CACHE } from './lib.ts';
import { readWav, writeWav } from './music.ts';

const SR = 44100, LEAD = 0.05, GAP = 0.06, PEAK = 0.89;

function clean(x: Float32Array) {
  // DC blocked (a one-pole high-pass near 30 Hz): the pack's punches start on an offset that clicks
  const y = new Float32Array(x.length), R = 1 - (2 * Math.PI * 30) / SR;
  let px = 0, py = 0;
  for (let i = 0; i < x.length; i++) { const v = x[i] - px + R * py; y[i] = v; px = x[i]; py = v; }
  let peak = 0; for (const v of y) peak = Math.max(peak, Math.abs(v));
  // the silence before the hit, and the tail under -50 dB (on a 5 ms envelope)
  const on = y.findIndex((v) => Math.abs(v) > peak * 0.02), from = Math.max(0, on - Math.round(0.003 * SR));
  const win = Math.round(0.005 * SR), floor = peak * Math.pow(10, -50 / 20);
  let to = y.length, acc = 0;
  for (let i = y.length - 1; i >= from; i--) { acc += Math.abs(y[i]); if (i + win < y.length) acc -= Math.abs(y[i + win]); if (acc / win > floor) { to = Math.min(y.length, i + win); break; } }
  const out = y.slice(from, to), fi = Math.round(0.002 * SR), fo = Math.min(Math.round(0.012 * SR), out.length >> 2);
  for (let i = 0; i < fi && i < out.length; i++) out[i] *= i / fi;
  for (let i = 0; i < fo; i++) out[out.length - 1 - i] *= i / fo;
  // the same peak for every sound, measured on what is kept (after its fades)
  let kept = 0; for (const v of out) kept = Math.max(kept, Math.abs(v));
  const k = kept > 0 ? PEAK / kept : 1; for (let i = 0; i < out.length; i++) out[i] *= k;
  return out;
}

export function buildSfx(src: string, families: Record<string, string[]>, outDir: string, opts: { kbps?: number; file?: string } = {}) {
  const tmp = join(tmpdir(), `gm-sfx-${process.pid}`); mkdirSync(tmp, { recursive: true }); mkdirSync(outDir, { recursive: true });
  const parts: Float32Array[] = [new Float32Array(Math.round(LEAD * SR))], sounds: Record<string, [number, number][]> = {};
  let at = parts[0].length;
  for (const [fam, names] of Object.entries(families)) {
    sounds[fam] = [];
    for (const n of names) {
      const wav = join(tmp, `${n}.wav`);
      execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEF32', join(CACHE, src, 'Audio', `${n}.ogg`), wav]);
      const pcm = readWav(wav);
      if (pcm.sr !== SR) throw new Error(`${n}: ${pcm.sr} Hz, the bank is ${SR} Hz`);
      const x = clean(pcm.ch[0]);
      sounds[fam].push([+(at / SR).toFixed(5), +(x.length / SR).toFixed(5)]);
      parts.push(x, new Float32Array(Math.round(GAP * SR))); at += x.length + Math.round(GAP * SR);
    }
  }
  const all = new Float32Array(at); let p = 0; for (const a of parts) { all.set(a, p); p += a.length; }
  const file = opts.file ?? 'impacts.m4a', wav = join(tmp, 'bank.wav');
  writeWav(wav, { sr: SR, ch: [all] });
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', String((opts.kbps ?? 96) * 1000), '-q', '127', wav, join(outDir, file)]);
  // decoded back: the encoder's priming must be trimmed, or every start would be late
  const back = join(tmp, 'back.wav');
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEF32', join(outDir, file), back]);
  const frames = readWav(back).ch[0].length;
  if (Math.abs(frames - all.length) > 64) throw new Error(`sfx: the encoded bank is ${frames} frames, the source ${all.length}: its sounds would play off their marks`);
  rmSync(tmp, { recursive: true, force: true });
  const count = Object.values(sounds).reduce((s, v) => s + v.length, 0);
  return { file, sampleRate: SR, channels: 1, frames: all.length, duration: +(all.length / SR).toFixed(3), sounds, count };
}
