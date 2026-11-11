/**
 * A pack of short sounds for the library (Kenney's CC0 sound packs, approved by the owner 10 Nov 2026): every
 * sound of the pack, as published, laid one after another on one mono sheet and encoded once as AAC, with a cue
 * table saying where each one starts and how long it is. A world plays them by name (ctx.assets.sound).
 *
 * - The sounds are read as audio data only: afconvert (the system's converter) decodes each Ogg Vorbis file to
 *   44.1 kHz float and folds it to mono; nothing in the pack is executed.
 * - Levels stay as Kenney made them; a sound that would clip is brought under full scale.
 * - A click at the start of the sheet marks where the audio begins once decoded (an AAC encoder adds a little
 *   delay), and every cue's place is measured from it, as the shootout crowd's sheets are (crowd-audio.ts).
 * - Variants (impactBell_heavy_000 to _004) form a group under their shared name, which plays one of them at random.
 *
 * Output: sounds.m4a and the cue table in asset.json.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { CACHE } from './lib.ts';
import { readWav } from './music.ts';

const SR = 44100, KBPS = 96, MARKER = 0.05, FIRST = 0.25, GAP = 0.12;
type Cue = { at: number; dur: number };

function writeWavF32(path: string, x: Float32Array) {
  const n = x.length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0, 'ascii'); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8, 'ascii');
  b.write('fmt ', 12, 'ascii'); b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(32, 34);
  b.write('data', 36, 'ascii'); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) b.writeFloatLE(x[i], 44 + i * 4);
  writeFileSync(path, b);
}
const r4 = (v: number) => +v.toFixed(4);
// a sound's name from its file: letters, digits, - and _ (Kenney's own names, which already are)
const nameOf = (f: string) => basename(f).replace(/\.ogg$/i, '').replace(/[^A-Za-z0-9_-]+/g, '_');
// its group: the name without a trailing variant number (impactBell_heavy_003 -> impactBell_heavy, click4 -> click)
const groupOf = (n: string) => n.replace(/[_-]?\d+$/, '');

/** Every .ogg under `srcDir` (a pack's folder in the cache), except the pack's own demos (Preview*.ogg). */
export function buildSounds(srcDir: string, outDir: string, opts: { groups?: boolean } = {}) {
  // [path, name]: a sound in a folder of its own other than Audio (the voiceover's Male and Female) is named with it
  const files: [string, string][] = [];
  (function walk(d: string, pre: string) { for (const f of readdirSync(join(CACHE, d)).sort()) { const p = join(d, f); if (statSync(join(CACHE, p)).isDirectory()) walk(p, /^audio$/i.test(f) ? pre : `${pre}${f.toLowerCase()}_`); else if (/\.ogg$/i.test(f) && !/^preview\b/i.test(f)) files.push([p, pre + nameOf(f)]); } })(srcDir, '');
  if (!files.length) throw new Error(`${srcDir}: no sounds`);
  const tmp = join(tmpdir(), `gm-sounds-${process.pid}-${basename(outDir)}`); mkdirSync(tmp, { recursive: true }); mkdirSync(outDir, { recursive: true });
  try {
    const pcm = files.map(([f, name], i) => {
      const to = join(tmp, `${i}.wav`);
      execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEF32@${SR}`, '-c', '1', '-r', '127', join(CACHE, f), to]);
      const w = readWav(to); if (w.sr !== SR) throw new Error(`${f}: ${w.sr} Hz after conversion`);
      const x = w.ch[0]; let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
      if (pk > 0.97) for (let k = 0; k < x.length; k++) x[k] *= 0.97 / pk;
      return { name, x };
    });
    const names = new Set<string>(); for (const p of pcm) { if (names.has(p.name)) throw new Error(`${srcDir}: two sounds named ${p.name}`); names.add(p.name); }
    // the sheet: the marker, then each sound with a gap after it
    const at: number[] = []; let t = FIRST;
    for (const p of pcm) { at.push(t); t += p.x.length / SR + GAP; }
    const sheet = new Float32Array(Math.ceil(t * SR));
    sheet[Math.round(MARKER * SR)] = 0.9;
    pcm.forEach((p, k) => sheet.set(p.x, Math.round(at[k] * SR)));
    writeWavF32(join(tmp, 'sheet.wav'), sheet);
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', String(KBPS * 1000), '-q', '127', join(tmp, 'sheet.wav'), join(outDir, 'sounds.m4a')]);
    // decoded again, as a player would: where the marker landed is how far every cue moved
    execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEF32', join(outDir, 'sounds.m4a'), join(tmp, 'dec.wav')]);
    const D = readWav(join(tmp, 'dec.wav')).ch[0];
    let m = 0, mi = 0; for (let i = 0; i < Math.round((MARKER + 0.15) * SR); i++) if (Math.abs(D[i]) > m) { m = Math.abs(D[i]); mi = i; }
    const off = mi / SR - MARKER;
    if (Math.abs(off) > 0.06) throw new Error(`${srcDir}: the marker moved ${(off * 1000).toFixed(1)} ms in encoding`);
    const cues: Record<string, Cue> = {}, groups: Record<string, string[]> = {};
    pcm.forEach((p, k) => { cues[p.name] = { at: r4(at[k] + off), dur: r4(p.x.length / SR) }; (groups[groupOf(p.name)] ||= []).push(p.name); });
    // a group is worth naming only when it holds more than one sound, or names one differently
    // (an announcer's lines are each their own: male_1 to male_10 are numbers, not takes of one line)
    for (const g of Object.keys(groups)) if (opts.groups === false || !g || groups[g].length < 2 && groups[g][0] === g) delete groups[g];
    const bytes = readFileSync(join(outDir, 'sounds.m4a')).length;
    return {
      asset: { format: 'gmasset/1', kind: 'sounds', file: 'sounds.m4a', sampleRate: SR, channels: 1, duration: r4(sheet.length / SR), cues, groups },
      meta: { sounds: pcm.length, groups: Object.keys(groups).length, duration: r4(pcm.reduce((a, p) => a + p.x.length / SR, 0)), names: Object.keys(cues), groupNames: Object.keys(groups) },
      check: `${pcm.length} sounds, ${Object.keys(groups).length} groups, sheet ${(sheet.length / SR).toFixed(1)} s, ${(bytes / 1024).toFixed(0)} KB, marker ${(off * 1000).toFixed(2)} ms`,
    };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
