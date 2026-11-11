// node demo.mjs <packDir> <out.m4a> : the pack's cues in sequence, decoded from the shipped sheet (what the game plays)
import { readWav, writeWav } from './wav.mjs'; import { execFileSync } from 'node:child_process'; import { readFileSync } from 'node:fs';
const [dir, out] = process.argv.slice(2); const J = JSON.parse(readFileSync(dir + '/asset.json'));
execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEF32', '-c', '1', dir + '/sounds.m4a', out + '.sheet.wav']); const S = readWav(out + '.sheet.wav').x, SR = 44100;
const parts = []; const add = (name, gap = 0.5, vol = 1) => { const c = J.cues[name]; parts.push([S.subarray(Math.round(c.at * SR), Math.round((c.at + c.dur) * SR)), gap, vol]); };
for (const g of ['nicker', 'snort', 'blow', 'whinny', 'neigh', 'scream', 'pain', 'herd']) { for (const n of J.groups[g]) add(n, 0.45, g === 'herd' ? 0.5 : 1); parts.push([new Float32Array(0), 1.0, 1]); }
for (let i = 0; i < 16; i++) add(J.groups.breath[i % 7], -0.08, 0.8);   // the gallop breathing, back to back
const len = parts.reduce((a, [x, g]) => a + x.length + Math.round(g * SR), 0), y = new Float32Array(len + SR); let o = Math.round(0.3 * SR);
for (const [x, g, v] of parts) { for (let i = 0; i < x.length; i++) y[o + i] += x[i] * v; o += x.length + Math.round(g * SR); }
writeWav(out + '.wav', y); execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '128000', out + '.wav', out]); console.log(out, (o / SR).toFixed(1), 's');
