// THE CHARACTER FORGE: the strand brows' kit (people6, 14 Nov 2026). Mindfront's fourteen mesh eyebrows (MakeHuman
// community asset pack eyebrows01, CC0 1.0: each hair its own thin triangular tube, 3 to 6 rings of 3 points, its root
// about 1 mm into the head) packed for the forge, so the brows are single hairs fitted to every forged face instead of
// the template's two painted cards (512 px strokes could not show one hair at a close-up's distance).
//   Each hair kept as its rings' middles, root first (its own thin tube is not kept: core.mjs draws each hair again, to
//   its own width and taper). Each middle as MakeHuman fits a proxy (its .mhclo): three of base.obj's points, their
//   weights and an offset in the proxy's scale (x, y, z: base.obj's distance between two named points over a number). The
//   ring's first point's three base points are kept, and its offset made again so the fit lands on the ring's middle on
//   base.obj exactly (a ring's three points share their base points almost always; this makes it exact either way).
//   Out: public/storykit/forge/kit/brow-strands.json + brow-strands.bin.z:
//     json { styles: { '01': { hairs, points, scale: [[v1, v2, value] x3], at: [offset, ...] } }, source, licence }
//     bin  per style: Uint16 hair start points (hairs + 1), Uint16 refs (points x 3), Int16 weights (x 3, of 32000: a few
//          are a little under 0),
//          Int16 offsets (points x 3, in 1/50000 of the scale's unit:
//          2 micrometres)
//   FORGE_MH_BROWS: the pack's eyebrows folder (the approved download, extracted); FORGE_MH_BASE: MakeHuman's base.obj.
//   node scripts/forge/browkit.mjs   (npm run storykit:forge-browkit; run again only when the source changes)
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { MH_BASE } from './paths.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../..');
const OUT = path.join(ROOT, 'public/storykit/forge/kit');
const SRC = process.env.FORGE_MH_BROWS ? path.resolve(process.env.FORGE_MH_BROWS) : path.join(ROOT, '.scratch/storykit/downloads/eyebrows01_cc0/eyebrows');
if (!fs.existsSync(SRC)) throw new Error('browkit: the eyebrows folder is missing (FORGE_MH_BROWS): ' + SRC);

const base = []; for (const l of fs.readFileSync(MH_BASE, 'utf8').split('\n')) if (l.startsWith('v ')) base.push(l.trim().split(/\s+/).slice(1, 4).map(Number));
const J = { source: 'MakeHuman community asset pack eyebrows01 (Mindfront), CC0 1.0: https://static.makehumancommunity.org/assets/assetpacks/eyebrows01.html', styles: {} };
const parts = []; let off = 0;
for (const dir of fs.readdirSync(SRC).filter((d) => /^mindfront_eyebrows_\d\d$/.test(d)).sort()) {
  const id = dir.slice(-2), files = fs.readdirSync(path.join(SRC, dir));
  const objF = files.find((f) => f.endsWith('.obj')), cloF = files.find((f) => f.endsWith('.mhclo'));
  const obj = fs.readFileSync(path.join(SRC, dir, objF), 'utf8').split('\n'), clo = fs.readFileSync(path.join(SRC, dir, cloF), 'utf8').split('\n');
  const V = [], VT = [], F = [];
  for (const l of obj) { const p = l.trim().split(/\s+/); if (p[0] === 'v') V.push(p.slice(1, 4).map(Number)); else if (p[0] === 'vt') VT.push(p.slice(1, 3).map(Number)); else if (p[0] === 'f') F.push(p.slice(1).map((s) => s.split('/').map((x) => +x - 1))); }
  // the proxy's fit: its scales and one line per obj point
  const scale = {}, recs = []; let inV = false;
  for (const l of clo) { const p = l.trim().split(/\s+/);
    if (/^[xyz]_scale$/.test(p[0])) scale[p[0][0]] = [+p[1], +p[2], +p[3]];
    else if (p[0] === 'verts') inV = true;
    else if (inV && p.length === 9 && !isNaN(+p[0])) recs.push({ r: p.slice(0, 3).map(Number), w: p.slice(3, 6).map(Number), o: p.slice(6, 9).map(Number) });
    else if (inV && p.length === 1 && p[0] !== '' && !isNaN(+p[0])) recs.push({ r: [+p[0], +p[0], +p[0]], w: [1, 0, 0], o: [0, 0, 0] });   // (a point pinned to one base point)
    else if (inV && p[0] && isNaN(+p[0])) inV = false; }
  if (recs.length !== V.length) throw new Error(`browkit ${id}: ${recs.length} fit lines for ${V.length} points`);
  const S = ['x', 'y', 'z'].map((k, c) => Math.abs(base[scale[k][0]][c] - base[scale[k][1]][c]) / scale[k][2]);
  // (the fit read back on base.obj against the obj itself: how far off, at most)
  let err = 0; recs.forEach((R, i) => { const q = [0, 1, 2].map((c) => R.w[0] * base[R.r[0]][c] + R.w[1] * base[R.r[1]][c] + R.w[2] * base[R.r[2]][c] + R.o[c] * S[c]); err = Math.max(err, Math.hypot(q[0] - V[i][0], q[1] - V[i][1], q[2] - V[i][2])); });
  // the hairs: the faces' connected points; each hair's rings by their uv's v (roots at v = 0, the pack's own note)
  const par = V.map((_, i) => i), find = (i) => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  const vtOf = new Int32Array(V.length).fill(-1);
  for (const f of F) { for (const c of f) if (c[1] >= 0) vtOf[c[0]] = c[1]; for (let k = 1; k < f.length; k++) par[find(f[k][0])] = find(f[0][0]); }
  const comp = new Map(); V.forEach((_, i) => { const r = find(i); (comp.get(r) || comp.set(r, []).get(r)).push(i); });
  const hairs = [];
  for (const pts of comp.values()) {
    if (pts.length % 3) continue;
    // (the obj lists a hair's rings in order, 3 points each; root at the ring with the lowest v)
    const rings = []; const sorted = pts.slice().sort((a, b) => a - b); for (let k = 0; k < sorted.length; k += 3) rings.push(sorted.slice(k, k + 3));
    const vOf = (ring) => ring.reduce((a, i) => a + (vtOf[i] >= 0 ? VT[vtOf[i]][1] : 0), 0) / 3;
    if (vOf(rings[0]) > vOf(rings[rings.length - 1])) rings.reverse();
    hairs.push(rings.map((ring) => { const m = [0, 1, 2].map((c) => ring.reduce((a, i) => a + V[i][c], 0) / 3), R = recs[ring[0]];
      const fit = [0, 1, 2].map((c) => R.w[0] * base[R.r[0]][c] + R.w[1] * base[R.r[1]][c] + R.w[2] * base[R.r[2]][c]);
      return { r: R.r, w: R.w, o: [0, 1, 2].map((c) => (m[c] - fit[c]) / S[c]) }; }));
  }
  // (hairs in a stable order: by their root's place, inner end first)
  hairs.sort((a, b) => { const ka = a[0].r[0] * 4 + a[0].w[0], kb = b[0].r[0] * 4 + b[0].w[0]; return ka - kb; });
  const nP = hairs.reduce((a, h) => a + h.length, 0), start = new Uint16Array(hairs.length + 1), refs = new Uint16Array(nP * 3), wts = new Int16Array(nP * 3), offs = new Int16Array(nP * 3);
  let k = 0; hairs.forEach((h, i) => { start[i] = k; for (const p of h) { for (let c = 0; c < 3; c++) { refs[k * 3 + c] = p.r[c]; const ws = p.w[0] + p.w[1] + p.w[2]; wts[k * 3 + c] = Math.round(p.w[c] / ws * 32000); const q = Math.round(p.o[c] * 50000); if (Math.abs(q) > 32767) throw new Error('browkit: offset out of range in ' + id); offs[k * 3 + c] = q; } k++; } }); start[hairs.length] = k;
  if (nP > 65535) throw new Error('browkit: too many points in ' + id);
  const chunk = [start, refs, wts, offs].map((a) => Buffer.from(a.buffer));
  J.styles[id] = { hairs: hairs.length, points: nP, scale: ['x', 'y', 'z'].map((a) => scale[a]), at: [off, off + start.byteLength, off + start.byteLength + refs.byteLength, off + start.byteLength + refs.byteLength + wts.byteLength] };
  for (const c of chunk) { parts.push(c); off += c.length; }
  console.log('brows', id, hairs.length, 'hairs,', nP, 'points; fit on base.obj within', (err * 100).toFixed(3), 'mm');
}
fs.mkdirSync(OUT, { recursive: true });
const bin = zlib.deflateSync(Buffer.concat(parts), { level: 9 });
fs.writeFileSync(path.join(OUT, 'brow-strands.bin.z'), bin);
fs.writeFileSync(path.join(OUT, 'brow-strands.json'), JSON.stringify(J) + '\n');
console.log('brow kit:', Object.keys(J.styles).length, 'styles,', (off / 1e6).toFixed(2), 'MB raw,', (bin.length / 1e6).toFixed(2), 'MB deflated');
