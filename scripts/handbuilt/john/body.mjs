// Hand-built John, the torso (owner: "john stomach and torso are protruding way too much"; Mog City's standard: slim,
// a natural body). The forge base at weight 'slim' still carried the elegant suit's jacket a hand's width out in front
// at the belly (its buttoned front at 18 cm before the spine's line at 1.05 m, the chest only 16.8). Here the front of
// the torso is taken in toward the spine, height by height, so the front line falls straight from the chest to a flat
// stomach (14.6 cm at the belt): every point in front of the spine's plane scaled toward it by that height's factor, on
// the suit and on the body's points under it alike (so the cloth keeps its own offset over the body), the arms' points
// left alone, the factor eased in and out over 6 cm at the band's ends.
import { prim, sm, clamp } from '../young-hero/glb.mjs';
const T = [[0.88, null], [0.95, 0.128], [1.05, 0.128], [1.15, 0.136], [1.25, 0.15], [1.36, null]];
export function bellyPass(doc, K = {}) {
  K = { zc: 0.0, ...K };
  const c = prim(doc, 'clothes')[0], ca = c.getAttribute('POSITION').getArray(), cv = [...new Set(c.getIndices().getArray())];
  // the suit's front line by height (2 cm bands, the middle 16 cm)
  const front = (y) => { let z = -9; for (const v of cv) if (Math.abs(ca[v * 3 + 1] - y) < 0.01 && Math.abs(ca[v * 3]) < 0.08) z = Math.max(z, ca[v * 3 + 2]); return z; };
  const kAt = new Map(); for (let y = 0.86; y <= 1.36; y += 0.01) { const yy = +y.toFixed(2); let t = null;
    for (let i = 0; i < T.length - 1; i++) if (yy >= T[i][0] && yy <= T[i + 1][0]) { const a = T[i], b = T[i + 1], f = front(yy), ta = a[1] ?? f, tb = b[1] ?? f, u = (yy - a[0]) / (b[0] - a[0]); t = ta + (tb - ta) * u; }
    const f = front(yy); kAt.set(yy, t == null || f < 0 ? 1 : clamp((t - K.zc) / (f - K.zc), 0.65, 1)); }
  const kOf = (y) => { if (y < 0.86 || y > 1.36) return 1; const y0 = Math.floor(y * 100) / 100, y1 = y0 + 0.01, u = (y - y0) / 0.01; return (kAt.get(+y0.toFixed(2)) ?? 1) * (1 - u) + (kAt.get(+y1.toFixed(2)) ?? 1) * u; };
  console.log('belly k', [0.95, 1.05, 1.15, 1.25].map((y) => kOf(y).toFixed(3)).join(' '));
  const done = new Set(); let n = 0;
  for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) { const P = p.getAttribute('POSITION'); if (done.has(P)) continue; done.add(P);
    const nm = p.getMaterial()?.getName() || ''; if (/sneakers|eyes|teeth|hair|brows|lashes|beard/.test(nm)) continue;
    const a = P.getArray().slice(), J = p.getAttribute('JOINTS_0')?.getArray(), Wt = p.getAttribute('WEIGHTS_0'), W = Wt?.getArray(), sc = Wt?.getNormalized() ? (W instanceof Uint8Array ? 255 : 65535) : 1;
    const names = doc.getRoot().listSkins()[0].listJoints().map((j) => j.getName()), arm = new Set(names.map((s, i) => (/^(upperarm|lowerarm|wrist|finger|shoulder)/.test(s) ? i : -1)).filter((i) => i >= 0));
    for (let v = 0; v < P.getCount(); v++) { const y = a[v * 3 + 1], z = a[v * 3 + 2]; if (z <= K.zc || y < 0.86 || y > 1.36) continue; const k = kOf(y); if (k >= 0.999) continue;
      let wa = 0; if (J) for (let q = 0; q < 4; q++) if (arm.has(J[v * 4 + q])) wa += W[v * 4 + q] / sc; const keepArm = sm(0.15, 0.4, wa); if (keepArm >= 1) continue;
      a[v * 3 + 2] = K.zc + (z - K.zc) * (k + (1 - k) * keepArm); n++; }
    P.setArray(a); }
  console.log('belly points taken in', n);
}

// (owner, 2nd look) the waist a little narrower (x toward the middle, 1.0-1.2 m, arms left alone), the jacket's back vent
// closed (its two flaps 1-2 cm apart showed the tan chinos as a skin-coloured slit from behind), the upper back's hump
// under the jacket taken down (a straighter back in profile), and the chinos slimmer (each leg's points toward its own
// axis below the hip, most at the shin)
export function fitPass(doc, K = {}) {
  K = { waist: 0.06, hump: 0.4, leg: 0.12, ...K };
  const names = doc.getRoot().listSkins()[0].listJoints().map((j) => j.getName()), idx = (re) => new Set(names.map((s, i) => (re.test(s) ? i : -1)).filter((i) => i >= 0));
  const arm = idx(/^(upperarm|lowerarm|wrist|finger)/), legB = idx(/^(upperleg|lowerleg)/);
  const c = prim(doc, 'clothes')[0], ca = c.getAttribute('POSITION').getArray(), cv = [...new Set(c.getIndices().getArray())];
  // the back's line: the suit's backmost z by height; the hump's target a straight line from the shoulder blades' line at 1.42 to the waist at 1.08
  const back = (y) => { let z = 9; for (const v of cv) if (Math.abs(ca[v * 3 + 1] - y) < 0.01 && Math.abs(ca[v * 3]) < 0.1) z = Math.min(z, ca[v * 3 + 2]); return z; };
  const b0 = back(1.08), b1 = back(1.44), line = (y) => b0 + (b1 - b0) * (y - 1.08) / 0.36;
  const hump = new Map(); for (let y = 1.08; y <= 1.445; y += 0.01) { const yy = +y.toFixed(2), z = back(yy), L = line(yy); hump.set(yy, z < L ? (L - z) : 0); }
  console.log('back hump mm', [...hump].filter(([, d]) => d > 0.002).map(([y, d]) => y + ':' + (d * 1000).toFixed(0)).join(' '));
  const done = new Set(); let nw = 0, nh = 0, nv = 0, nl = 0;
  const legAxis = {}; // per side: x and z of the leg's middle at a height, from the clothes' own points
  for (const s of [1, -1]) { legAxis[s] = new Map(); for (let y = 0.1; y <= 0.86; y += 0.02) { let sx = 0, sz = 0, n = 0, lo = 9, hi = -9, zl = 9, zh = -9; for (const v of cv) if (Math.sign(ca[v * 3]) === s && Math.abs(ca[v * 3 + 1] - y) < 0.012 && Math.abs(ca[v * 3]) < 0.2) { lo = Math.min(lo, ca[v * 3]); hi = Math.max(hi, ca[v * 3]); zl = Math.min(zl, ca[v * 3 + 2]); zh = Math.max(zh, ca[v * 3 + 2]); n++; } if (n) legAxis[s].set(+y.toFixed(2), [(lo + hi) / 2, (zl + zh) / 2]); } }
  const axisAt = (s, y) => { const yy = Math.min(0.86, Math.max(0.1, Math.round(y * 50) / 50)); return legAxis[s].get(+yy.toFixed(2)); };
  for (const p of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) { const P = p.getAttribute('POSITION'); if (done.has(P)) continue; done.add(P);
    const nm = p.getMaterial()?.getName() || ''; if (/sneakers|eyes|teeth|hair|brows|lashes|beard/.test(nm)) continue; const isC = nm === 'clothes';
    const a = P.getArray().slice(), J = p.getAttribute('JOINTS_0')?.getArray(), Wt = p.getAttribute('WEIGHTS_0'), W = Wt?.getArray(), sc = Wt?.getNormalized() ? (W instanceof Uint8Array ? 255 : 65535) : 1;
    const wOf = (v, set) => { let w = 0; if (J) for (let q = 0; q < 4; q++) if (set.has(J[v * 4 + q])) w += W[v * 4 + q] / sc; return w; };
    for (let v = 0; v < P.getCount(); v++) { const x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], wa = wOf(v, arm);
      // waist
      const fw = sm(0.95, 1.03, y) * sm(1.26, 1.16, y) * (1 - sm(0.15, 0.4, wa)); if (fw > 0 && Math.abs(x) < 0.2) { a[v * 3] = x * (1 - K.waist * fw); nw++; }
      // the back's hump (the jacket and the body under it, alike)
      if (z < 0 && y > 1.08 && y < 1.45 && wa < 0.5) { const d = hump.get(+(Math.round(y * 100) / 100).toFixed(2)) || 0; if (d > 0) { const f = K.hump * sm(0.2, 0.08, Math.abs(x)) * (1 - sm(0.15, 0.4, wa)); a[v * 3 + 2] = z + d * f; nh++; } }
      // the vent
      if (isC && z < -0.03 && y > 0.82 && y < 1.2 && Math.abs(x) < 0.035) { const f = sm(0.035, 0.018, Math.abs(x)) * sm(1.2, 1.12, y); a[v * 3] = x * (1 - f); nv++; }
      // the legs (the chinos only: the body's legs keep their shape)
      if (isC && y < 0.86 && y > 0.1 && wOf(v, legB) > 0.5) { const s = Math.sign(x) || 1, ax = axisAt(s, y); if (ax) { const f = K.leg * sm(0.86, 0.6, y) * sm(0.1, 0.2, y); a[v * 3] = ax[0] + (x - ax[0]) * (1 - f); a[v * 3 + 2] = ax[1] + (z - ax[1]) * (1 - f); nl++; } }
    }
    P.setArray(a); }
  console.log('fit: waist', nw, 'back', nh, 'vent', nv, 'legs', nl);
}
// (owner: "more vertical", the neck stacked over the shoulders) the head and neck drawn a little further back over the
// shoulders in every pose: their inverse binds moved (the drawn geometry shifts 0.5-1.2 cm back from the bones the clips
// drive; the mesh, its landmarks and face.js's morphs are unchanged)
export function postureCarriage(doc, K = {}) {
  K = { head: 0.012, neck02: 0.009, neck01: 0.005, neck03: 0.011, ...K };
  const skin = doc.getRoot().listSkins()[0], names = skin.listJoints().map((j) => j.getName()), acc = skin.getInverseBindMatrices(), m = acc.getArray().slice();
  for (const [bn, dz] of Object.entries({ head: K.head, neck01: K.neck01, neck02: K.neck02, neck03: K.neck03 })) { const i = names.indexOf(bn); if (i < 0) continue;
    // IBM' = IBM * T(0, 0, -dz): a bind point v is drawn where v - dz (dz further back) would have been
    const o = i * 16; for (let r = 0; r < 3; r++) m[o + 12 + r] -= m[o + 8 + r] * dz; }
  acc.setArray(m); console.log('carriage: head/neck drawn back', JSON.stringify(K));
}
// the suit's fold-overs: where the elegant suit's sleeve and back panels crease (behind the shoulder, the upper arm, the
// lower back) a few of its triangles lie flipped over their neighbours, so from behind their back faces showed as dark
// red-brown flecks in daylight. Each flipped triangle (its face normal against its corners' averaged normals) has its
// points relaxed toward their welded neighbours a few rounds, until it lies flat again
export function unfoldPass(doc, K = {}) {
  K = { rounds: 6, lam: 0.5, ...K };
  const p = prim(doc, 'clothes')[0], P = p.getAttribute('POSITION'), a = P.getArray().slice(), I = p.getIndices().getArray(), cnt = P.getCount();
  const key = (v) => `${a[v * 3].toFixed(5)},${a[v * 3 + 1].toFixed(5)},${a[v * 3 + 2].toFixed(5)}`, rep = new Int32Array(cnt), km = new Map();
  for (let v = 0; v < cnt; v++) { const k = key(v); if (!km.has(k)) km.set(k, v); rep[v] = km.get(k); }
  const nb = new Map(), add = (u, v) => { if (u === v) return; if (!nb.has(u)) nb.set(u, new Set()); nb.get(u).add(v); };
  for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const u = rep[I[t + e]], v = rep[I[t + (e + 1) % 3]]; add(u, v); add(v, u); }
  const fn = (t) => { const [A, B, C] = [I[t], I[t + 1], I[t + 2]].map((v) => rep[v]); const ux = a[B * 3] - a[A * 3], uy = a[B * 3 + 1] - a[A * 3 + 1], uz = a[B * 3 + 2] - a[A * 3 + 2], vx = a[C * 3] - a[A * 3], vy = a[C * 3 + 1] - a[A * 3 + 1], vz = a[C * 3 + 2] - a[A * 3 + 2]; return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; };
  let total = 0, first = -1;
  for (let r = 0; r < K.rounds; r++) {
    const vn = new Float32Array(cnt * 3); for (let t = 0; t < I.length; t += 3) { const n = fn(t); for (let e = 0; e < 3; e++) { const v = rep[I[t + e]]; vn[v * 3] += n[0]; vn[v * 3 + 1] += n[1]; vn[v * 3 + 2] += n[2]; } }
    const bad = new Set(); for (let t = 0; t < I.length; t += 3) { const n = fn(t), L = Math.hypot(...n); if (L < 1e-12) continue; let d = 0; for (let e = 0; e < 3; e++) { const v = rep[I[t + e]], m = [vn[v * 3], vn[v * 3 + 1], vn[v * 3 + 2]], ml = Math.hypot(...m) || 1; d += (n[0] * m[0] + n[1] * m[1] + n[2] * m[2]) / (L * ml); } if (d / 3 < 0) for (let e = 0; e < 3; e++) bad.add(rep[I[t + e]]); }
    if (first < 0) first = bad.size; if (!bad.size) break;
    // (the flipped points and their neighbours relaxed)
    const zone = new Set(bad); for (const v of bad) for (const u of nb.get(v) || []) zone.add(u);
    const upd = []; for (const v of zone) { const N = nb.get(v); if (!N) continue; const s = [0, 0, 0]; for (const u of N) for (let c = 0; c < 3; c++) s[c] += a[u * 3 + c]; upd.push([v, s.map((q, c) => (q / N.size - a[v * 3 + c]) * K.lam * (bad.has(v) ? 1 : 0.5))]); }
    for (const [v, d] of upd) for (let c = 0; c < 3; c++) a[v * 3 + c] += d[c]; total += upd.length; }
  for (let v = 0; v < cnt; v++) if (rep[v] !== v) for (let c = 0; c < 3; c++) a[v * 3 + c] = a[rep[v] * 3 + c];
  P.setArray(a); console.log('unfold: flipped points at first', first, 'relaxed', total);
}
