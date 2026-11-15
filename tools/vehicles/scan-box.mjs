// scan-box.mjs <glb> <x0,y0,z0,x1,y1,z1 (source frame)> [maxSize]: connected pieces whose centre is in the box
import { io, extract } from './lib.mjs';
const [f, box, ms] = process.argv.slice(2);
const [x0, y0, z0, x1, y1, z1] = box.split(',').map(Number), MAX = Number(ms || 0.3);
function pieces(p) {
  const n = p.pos.length / 3, key = new Map(), weld = new Int32Array(n);
  for (let i = 0; i < n; i++) { const k = `${Math.round(p.pos[i * 3] * 4000)},${Math.round(p.pos[i * 3 + 1] * 4000)},${Math.round(p.pos[i * 3 + 2] * 4000)}`; let w = key.get(k); if (w === undefined) { w = i; key.set(k, w); } weld[i] = w; }
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let t = 0; t < p.idx.length; t += 3) { const a = find(weld[p.idx[t]]), b = find(weld[p.idx[t + 1]]), c = find(weld[p.idx[t + 2]]); parent[a] = c; parent[b] = c; }
  const comps = new Map();
  for (let t = 0; t < p.idx.length / 3; t++) { const r = find(weld[p.idx[t * 3]]); let c = comps.get(r); if (!c) comps.set(r, (c = { n: 0, lo: [9, 9, 9], hi: [-9, -9, -9], ulo: [9, 9], uhi: [-9, -9] })); c.n++; for (let k = 0; k < 3; k++) { const v = p.idx[t * 3 + k]; for (let a = 0; a < 3; a++) { const x = p.pos[v * 3 + a]; c.lo[a] = Math.min(c.lo[a], x); c.hi[a] = Math.max(c.hi[a], x); } if (p.uv) for (let a = 0; a < 2; a++) { const u = p.uv[v * 2 + a]; c.ulo[a] = Math.min(c.ulo[a], u); c.uhi[a] = Math.max(c.uhi[a], u); } } }
  return [...comps.values()];
}
const doc = await io.read(f);
for (const p of extract(doc)) for (const c of pieces(p)) {
  const ce = c.lo.map((v, a) => (v + c.hi[a]) / 2), size = Math.max(...c.hi.map((v, a) => v - c.lo[a]));
  if (ce[0] > x0 && ce[0] < x1 && ce[1] > y0 && ce[1] < y1 && ce[2] > z0 && ce[2] < z1 && size < MAX)
    console.log(p.path[0].replace(/_0$/, ''), 'tris', c.n, 'size', size.toFixed(3), 'c', ce.map((v) => v.toFixed(2)).join(','), 'uv', c.ulo.map((v) => v.toFixed(3)).join(','), '..', c.uhi.map((v) => v.toFixed(3)).join(','));
}
