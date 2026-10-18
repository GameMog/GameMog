/**
 * The Grand Prix engine sound (ARTIFICIAL1 M2, lane D): the library asset audio-a1-engine-v4, the voice the owner chose on
 * 15 Oct 2026 ("v4", docs/RULES.md §1f), which lib/runtime/gp-audio.js plays.
 *
 * - the voice: our own renders of our own engine script (a 1.6 L 90-degree V6 turbo hybrid) and our own impulse response,
 *   made with engine-sim (AngeTheGreat, MIT; the program is credited, its licence covers the program, not what it
 *   renders) and dedicated to the public domain under CC0 1.0 as GameMog's own work. 16 rpm points x 3 loads at 48 kHz
 *   (desktop), and the off and on loads at 32 kHz (phones). Each loop is a seamless whole number of engine cycles.
 * - the one-shots: six overrun bangs and a turbo blow-off cut from three CC0-1.0 Freesound recordings, from Freesound's
 *   lossy previews (the originals need a login), kept as 32-bit float WAVs exactly as the v4 renders played them.
 * - the garage set: the fire-up (its cranking spikes cleaned) and the idle loop, both tiers; the revs, the pit limiter
 *   loop and the release and pull-away at 48 kHz only (desktop: the phone memory budget).
 * - derived renders, when present (the X07 ripple, the grid and field beds, the launch): rendered from this bank by the
 *   runtime's own sound code (scripts/.scratch/gp/m2/audio).
 *
 * The build reads only the prepared files in assets-src/cache/a1-engine-v4/ (written by the lane's derive script from
 * the v4 bank and the garage lane's stems), each refused unless it matches its SHA-256 in sources.lock.json, and checks
 * that the three Freesound previews the one-shots were cut from are the pinned ones. Loops and stems are encoded to FLAC
 * (afconvert, lossless: no encoder priming or padding, so loops stay seamless) and decoded again to check every sample.
 * Run directly: node --import ./scripts/ts-resolve.mjs scripts/assets/engine-audio.ts <out dir>
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CACHE, sha256 } from './lib.ts';

export const ENGINE_ID = 'audio-a1-engine-v4';
export const ENGINE_SOURCE = 'a1-engine-v4';
/** The Freesound recordings the one-shots were cut from (their previews, pinned in sources.json and its lock). */
export const ENGINE_SHOT_SOURCES: Record<number, { source: string; file: string }> = {
  350673: { source: 'freesound-350673', file: '350673__Dominik_W-hq.mp3' },
  478756: { source: 'freesound-478756', file: '478756__richwise-hq.mp3' },
  659544: { source: 'freesound-659544', file: '659544__EwanPenman11-hq.mp3' },
};

type Pcm = { sr: number; ch: number; bits: number; tag: number; n: number; data: Buffer };
function readPcm(p: string): Pcm {
  const b = readFileSync(p);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${p}: not a WAV`);
  let o = 12, fmt: { tag: number; ch: number; sr: number; bits: number } | null = null, data: Buffer | null = null;
  while (o + 8 <= b.length) {
    const id = b.toString('ascii', o, o + 4), sz = b.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { tag: b.readUInt16LE(o + 8), ch: b.readUInt16LE(o + 10), sr: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    if (id === 'data') data = b.subarray(o + 8, o + 8 + Math.min(sz, b.length - o - 8));
    o += 8 + sz + (sz & 1);
  }
  if (!fmt || !data) throw new Error(`${p}: no fmt or data chunk`);
  return { ...fmt, n: data.length / (fmt.bits / 8) / fmt.ch, data };
}

export function buildEngineAudio(outDir: string) {
  const src = join(CACHE, ENGINE_SOURCE), tmp = join(tmpdir(), `gm-engine-${process.pid}`);
  const lock = JSON.parse(readFileSync('assets-src/sources.lock.json', 'utf8')) as Record<string, { sha256: string; bytes: number }>;
  const B = JSON.parse(readFileSync(join(src, 'bank.json'), 'utf8'));
  const checks: string[] = []; let bad = 0, flacBytes = 0, wavBytes = 0;
  mkdirSync(outDir, { recursive: true }); mkdirSync(tmp, { recursive: true });
  // a prepared file is used only when it is the pinned one
  function pinned(file: string) {
    const key = `${ENGINE_SOURCE}/${file}`, data = readFileSync(join(src, file)), h = sha256(data);
    if (!lock[key]) throw new Error(`${key} is not pinned in sources.lock.json`);
    if (lock[key].sha256 !== h) throw new Error(`${key}: its SHA-256 is ${h}, not the pinned ${lock[key].sha256}`);
    return data;
  }
  pinned('bank.json');
  // the previews the one-shots were cut from: present and pinned
  for (const [id, s] of Object.entries(ENGINE_SHOT_SOURCES)) {
    const key = `${s.source}/${s.file}`, h = sha256(readFileSync(join(CACHE, key)));
    if (!lock[key] || lock[key].sha256 !== h) throw new Error(`${key} (Freesound ${id}) is not the pinned preview`);
  }
  // a 16-bit WAV to FLAC, decoded again and compared sample for sample
  function flac(file: string, out: string) {
    const data = pinned(file), w = readPcm(join(src, file));
    if (w.tag !== 1 || w.bits !== 16) throw new Error(`${file}: expected 16-bit PCM`);
    execFileSync('afconvert', ['-f', 'flac', '-d', 'flac', join(src, file), join(outDir, out)]);
    execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16', join(outDir, out), join(tmp, 'back.wav')]);
    const back = readPcm(join(tmp, 'back.wav')), same = back.n === w.n && back.sr === w.sr && back.data.equals(w.data);
    if (!same) { bad++; checks.push(`FAIL ${out}: the decoded FLAC differs from ${file} (${back.n} vs ${w.n} samples at ${back.sr})`); }
    flacBytes += readFileSync(join(outDir, out)).length; wavBytes += data.length;
    return { file: out, sr: w.sr, channels: w.ch, samples: w.n };
  }
  try {
    const loops = (tier: 'hi' | 'lo') => (B[tier] as any[]).map((L) => {
      const f = flac(L.file, L.file.replace(/\.wav$/, '.flac'));
      return { file: f.file, rpm: L.rpm, load: L.load, native: L.native, ncyc: L.ncyc, coh: L.coh, samples: f.samples, gain: L.gain };
    });
    const hi = loops('hi'), lo = loops('lo');
    // the one-shots: copied byte for byte
    const shot = (s: any) => { const data = pinned(s.file); writeFileSync(join(outDir, s.file), data); const w = readPcm(join(outDir, s.file)); return { file: s.file, sr: w.sr, samples: w.n, source: s.source }; };
    const bangs = (B.shots.bangs as any[]).map(shot), whoosh = shot(B.shots.whoosh);
    // the garage set
    const G = B.garage, garage: Record<string, any> = {};
    for (const [key, g] of Object.entries<any>(G)) {
      const e: any = { loop: !!g.loop };
      for (const tier of ['hi', 'lo']) if (g[tier]) e[tier] = flac(g[tier].file, g[tier].file.replace(/\.wav$/, '.flac'));
      if (g.rpm) e.rpm = g.rpm; if (g.catchAt != null) { e.catchAt = g.catchAt; e.settleAt = g.settleAt; e.idleRpm = g.idleRpm; }
      // (the garage stems share one level: the gain that brings them to the voice's, measured by the lane at the idle)
      if (g.gain != null) e.gain = g.gain;
      if (g.rpm100) e.rpm100 = g.rpm100;
      garage[key] = e;
    }
    // the derived renders, when the lane has made them
    const derived: Record<string, any> = {};
    for (const [key, d] of Object.entries<any>(B.derived || {})) {
      const e: any = { ...d.meta };
      for (const tier of ['hi', 'lo']) if (d[tier]) e[tier] = { ...flac(d[tier].file, d[tier].file.replace(/\.wav$/, '.flac')), gain: d[tier].gain ?? 1 };
      derived[key] = e;
    }
    if (bad) throw new Error(`${ENGINE_ID}: ${bad} check(s) failed\n${checks.join('\n')}`);
    const asset = {
      format: 'gmasset/1', kind: 'engine', voice: 'v4', rpms: B.rpms, level: B.level,
      tiers: { hi: { sr: 48000, loads: ['off', 'part', 'on'], loops: hi }, lo: { sr: 32000, loads: ['off', 'on'], loops: lo } },
      shots: { bangs, whoosh }, garage, derived,
    };
    const sec = (t: any[]) => t.reduce((a, L) => a + L.samples, 0);
    const meta = {
      voice: 'v4', rpms: B.rpms.length, loops: { hi: hi.length, lo: lo.length }, seconds: { hi: +(sec(hi) / 48000).toFixed(2), lo: +(sec(lo) / 32000).toFixed(2) },
      shots: bangs.length + 1, garage: Object.keys(garage), derived: Object.keys(derived),
      previews: Object.keys(ENGINE_SHOT_SOURCES).map((id) => `https://freesound.org/s/${id}/`),
    };
    checks.push(`${hi.length} + ${lo.length} loops and ${Object.keys(garage).length + Object.keys(derived).length} stems: FLAC ${(flacBytes / 1e6).toFixed(2)} MB from ${(wavBytes / 1e6).toFixed(2)} MB of 16-bit WAV, every sample decoded back identical`);
    return { asset, meta, checks };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// run directly: build into a folder and print the checks
if (process.argv[1] && process.argv[1].endsWith('engine-audio.ts')) {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: engine-audio.ts <out dir>');
  rmSync(dir, { recursive: true, force: true });
  const r = buildEngineAudio(dir);
  writeFileSync(join(dir, 'asset.json'), JSON.stringify(r.asset));
  console.log(r.checks.join('\n'));
  console.log(JSON.stringify(r.meta));
}
