// node pack.mjs <cutDir> <outDir> : the cut cues on one mono sheet (as GameMog's scripts/assets/sounds.ts lays Kenney's),
// a click marker first, AAC 96 kb/s by afconvert, the marker re-measured after decoding to place every cue
import { readWav, writeWav } from './wav.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { CUES } from './cues.mjs';
const [cutDir, outDir] = process.argv.slice(2); mkdirSync(outDir, { recursive: true });
const SR = 44100, MARKER = 0.05, FIRST = 0.25, GAP = 0.12, tmp = outDir + '/../.pack-tmp'; mkdirSync(tmp, { recursive: true });
const pcm = CUES.map((c) => ({ name: c.name, x: readWav(`${cutDir}/${c.name}.wav`).x }));
const at = []; let t = FIRST; for (const p of pcm) { at.push(t); t += p.x.length / SR + GAP; }
const sheet = new Float32Array(Math.ceil(t * SR)); sheet[Math.round(MARKER * SR)] = 0.9; pcm.forEach((p, k) => sheet.set(p.x, Math.round(at[k] * SR)));
writeWav(tmp + '/sheet.wav', sheet);
execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '96000', '-q', '127', tmp + '/sheet.wav', outDir + '/sounds.m4a']);
execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEF32', outDir + '/sounds.m4a', tmp + '/dec.wav']);
const D = readWav(tmp + '/dec.wav').x; let m = 0, mi = 0; for (let i = 0; i < Math.round((MARKER + 0.15) * SR); i++) if (Math.abs(D[i]) > m) { m = Math.abs(D[i]); mi = i; }
const off = mi / SR - MARKER; if (Math.abs(off) > 0.06) throw new Error('marker moved ' + off);
const r4 = (v) => +v.toFixed(4), cues = {}, groups = {};
pcm.forEach((p, k) => { cues[p.name] = { at: r4(at[k] + off), dur: r4(p.x.length / SR) }; const g = p.name.replace(/_\d+$/, ''); if (g !== p.name) (groups[g] ||= []).push(p.name); });
writeFileSync(outDir + '/asset.json', JSON.stringify({ format: 'gmasset/1', kind: 'sounds', file: 'sounds.m4a', sampleRate: SR, channels: 1, duration: r4(sheet.length / SR), cues, groups }));
rmSync(tmp, { recursive: true, force: true });
console.log(`${pcm.length} sounds, ${Object.keys(groups).length} groups, sheet ${(sheet.length / SR).toFixed(1)} s, ${(readFileSync(outDir + '/sounds.m4a').length / 1024).toFixed(0)} KB, marker ${(off * 1000).toFixed(2)} ms`);
