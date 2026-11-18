// Hand-built cast: MakeHuman face targets (.target: "base-vertex dx dy dz" in decimetres) on a finished forge GLB.
// The forge's body is MakeHuman's base mesh (its 'body' group's faces in base.obj order, each (vertex, uv) pair one
// point), so every skin point of a forged GLB still carries its base.obj corner's uv: the map back to MakeHuman's vertex is
// by uv (no reliance on index order, which the forge's diet, hide lists and the teeth change). The size: a least-squares
// scale of the head's points against base.obj's (the forge shapes the whole body to the sheet's height).
//   bakeRest(doc, [[file, w], ...])     the targets added into the rest shape (an expression the face keeps, e.g. a grin)
//   addMorphs(doc, [[name, file, w?], ...]) the targets as glTF morph targets on every primitive of the skin's point set,
//                                          named in mesh.extras.targetNames (FACE-CONTRACT.md)
// Sources: MakeHuman Faceunits 01 and Visemes 02 by Mika Suominen (CC0, makehumancommunity.org asset packs); base.obj is
// MakeHuman's (CC0; npm run assets:fetch, FORGE_MH_BASE).
import fs from 'node:fs';
import { prim } from './young-hero/glb.mjs';
import { MH_BASE } from '../forge/paths.mjs';

let BASE = null;
function base() {
  if (BASE) return BASE;
  const txt = fs.readFileSync(MH_BASE, 'utf8').split('\n'), V = [], VT = [], uvTo = new Map(); let g = '';
  for (const l of txt) { if (l.startsWith('v ')) { const p = l.split(/\s+/); V.push(+p[1], +p[2], +p[3]); } else if (l.startsWith('vt ')) { const p = l.split(/\s+/); VT.push(+p[1], +p[2]); }
    else if (l.startsWith('g ')) g = l.slice(2).trim();
    else if (l.startsWith('f ') && g === 'body') for (const c of l.trim().split(/\s+/).slice(1)) { const [vi, ti] = c.split('/').map((x) => +x - 1); uvTo.set(`${Math.round(VT[ti * 2] * 2e4)},${Math.round(VT[ti * 2 + 1] * 2e4)}`, vi); } }
  return (BASE = { V: Float32Array.from(V), uvTo });
}
export function readTarget(file) { const m = new Map(); for (const l of fs.readFileSync(file, 'utf8').split('\n')) { const p = l.trim().split(/\s+/); if (p.length < 4 || p[0].startsWith('#')) continue; m.set(+p[0], [+p[1], +p[2], +p[3]]); } return m; }

// the skin's point set (shared by the skin family), and each point's MakeHuman vertex (-1: not body: eyes, teeth ...)
export function skinMap(doc) {
  const B = base(), sk = prim(doc, 'skin').sort((a, b) => b.getIndices().getCount() - a.getIndices().getCount())[0], P = sk.getAttribute('POSITION'), U = sk.getAttribute('TEXCOORD_0');
  const n = P.getCount(), map = new Int32Array(n).fill(-1), uv = [0, 0], used = new Set(sk.getIndices().getArray()); let hit = 0;
  for (const v of used) { U.getElement(v, uv); let m = B.uvTo.get(`${Math.round(uv[0] * 2e4)},${Math.round((1 - uv[1]) * 2e4)}`);
    if (m === undefined) for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { m = B.uvTo.get(`${Math.round(uv[0] * 2e4) + du},${Math.round((1 - uv[1]) * 2e4) + dv}`); if (m !== undefined) break; }
    if (m !== undefined) { map[v] = m; hit++; } }
  // the scale (and offset) from MakeHuman's decimetres to this body's metres, fitted on the head (y over the shoulders)
  const pa = P.getArray(); let sx = 0, sxx = 0, sy = 0, sxy = 0, k = 0, ymax = -9; for (let v = 0; v < n; v++) if (map[v] >= 0) ymax = Math.max(ymax, pa[v * 3 + 1]);
  for (let v = 0; v < n; v++) { const m = map[v]; if (m < 0 || pa[v * 3 + 1] < ymax - 0.25) continue; const by = B.V[m * 3 + 1], y = pa[v * 3 + 1]; sx += by; sxx += by * by; sy += y; sxy += by * y; k++; }
  const s = (k * sxy - sx * sy) / (k * sxx - sx * sx);
  return { sk, P, n, map, s, mapped: hit, used: used.size };
}
// the points that ride the face without being body (no MakeHuman vertex): the lashes and brows follow the skin within
// 12 mm of them, the lower teeth and tongue the chin's skin within 30 mm (so jawOpen opens the teeth too); the eyeballs,
// the upper teeth and the hair stay where they are
function riders(doc, M) {
  const out = []; const mesh = doc.getRoot().listMeshes().find((m) => m.listPrimitives().includes(M.sk));
  for (const p of mesh.listPrimitives()) { if (p.getAttribute('POSITION') !== M.P) continue; const nm = p.getMaterial()?.getName() || '';
    const r = /^(lashes|brows|eyebrows|beard)$/.test(nm) ? 0.012 : /^(teethLow|tongue)$/.test(nm) ? 0.03 : 0; if (!r) continue;
    out.push({ r, low: nm !== 'lashes' && nm !== 'brows' && nm !== 'eyebrows' && nm !== 'beard', verts: [...new Set(p.getIndices().getArray())].filter((v) => M.map[v] < 0) }); }
  return out;
}
function carryRiders(M, D, R) {
  const a = M.P.getArray(), cell = 0.012, G = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let v = 0; v < M.n; v++) if (M.map[v] >= 0 && (D[v * 3] || D[v * 3 + 1] || D[v * 3 + 2])) { const k = key(a[v * 3], a[v * 3 + 1], a[v * 3 + 2]); (G.get(k) || G.set(k, []).get(k)).push(v); }
  for (const { r, low, verts } of R) { const k0 = Math.ceil(r / cell);
    for (const v of verts) { const x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell); let w = 0; const s = [0, 0, 0];
      for (let i = -k0; i <= k0; i++) for (let j = -k0; j <= k0; j++) for (let l = -k0; l <= k0; l++) { const L = G.get(`${cx + i},${cy + j},${cz + l}`); if (!L) continue;
        for (const b of L) { if (low && a[b * 3 + 1] > y + 0.004) continue; const d = Math.hypot(a[b * 3] - x, a[b * 3 + 1] - y, a[b * 3 + 2] - z); if (d > r) continue; const q = (1 - d / r) ** 2; w += q; for (let c = 0; c < 3; c++) s[c] += D[b * 3 + c] * q; } }
      if (w > 0) for (let c = 0; c < 3; c++) D[v * 3 + c] = s[c] / w; } }
}
// one target's deltas on our points (metres), weight w; mirrored left/right as MakeHuman's are (its x is ours)
function deltaOf(M, file, w = 1, R = null) { const T = readTarget(file), D = new Float32Array(M.n * 3); let n = 0;
  for (let v = 0; v < M.n; v++) { const m = M.map[v]; if (m < 0) continue; const d = T.get(m); if (!d) continue; D[v * 3] = d[0] * M.s * w; D[v * 3 + 1] = d[1] * M.s * w; D[v * 3 + 2] = d[2] * M.s * w; n++; }
  if (R && n) carryRiders(M, D, R);
  return { D, n }; }
export function bakeRest(doc, list) {
  const M = skinMap(doc), a = M.P.getArray().slice(), R = riders(doc, M); let peak = 0;
  for (const [file, w] of list) { const { D } = deltaOf(M, file, w, R); for (let i = 0; i < a.length; i++) a[i] += D[i]; for (let i = 0; i < D.length; i += 3) peak = Math.max(peak, Math.hypot(D[i], D[i + 1], D[i + 2])); }
  M.P.setArray(a); console.log('face rest: points mapped', M.mapped, 'of', M.used, 'scale', M.s.toFixed(4), 'targets', list.length, 'peak mm', (peak * 1000).toFixed(2));
}
export function addMorphs(doc, list) {
  const M = skinMap(doc), mesh = doc.getRoot().listMeshes().find((m) => m.listPrimitives().includes(M.sk)), fam = mesh.listPrimitives().filter((p) => p.getAttribute('POSITION') === M.P);
  const buf = M.P.getBuffer(), names = [], R = riders(doc, M);
  for (const [name, file, w = 1] of list) { const { D, n } = deltaOf(M, file, w, R); if (!n) { console.log('face morph: no points', name); continue; }
    const acc = doc.createAccessor(name).setType('VEC3').setArray(D).setBuffer(buf);
    for (const p of fam) p.addTarget(doc.createPrimitiveTarget(name).setAttribute('POSITION', acc)); names.push(name); }
  // (every other primitive of the mesh (garments drawn from another point set, the glasses) needs the same number of
  // targets to be valid glTF: zero targets of its own point count)
  const zeros = new Map(); for (const p of mesh.listPrimitives()) { if (fam.includes(p)) continue; const cnt = p.getAttribute('POSITION').getCount(), z = zeros.get(cnt) || zeros.set(cnt, doc.createAccessor().setType('VEC3').setArray(new Float32Array(cnt * 3)).setBuffer(buf)).get(cnt);
    for (const nm of names) p.addTarget(doc.createPrimitiveTarget(nm).setAttribute('POSITION', z)); }
  mesh.setWeights(names.map(() => 0)); mesh.setExtras({ ...(mesh.getExtras() || {}), targetNames: names });
  console.log('face morphs:', names.length, 'on', fam.length, 'primitives; scale', M.s.toFixed(4), 'mapped', M.mapped);
  return names;
}
