// THE CHARACTER FORGE: the talking-frame gate (FC). A forged face is graded in its talking close-ups next to Mr. Big's, so
// this measures what those close-ups showed wrong (round 3, GR), on the GLB with the morphs the engine gives it: Story
// Kit's copy of Mog City's face.js (scripts/forge/face.js, the morphs part unchanged, loaded here on Node's three),
// its jaw and lip opened as the engine opens them for a line (jaw up to 0.75, lip 1.2x the jaw):
//   tongue    the tongue's tip >= 2 mm behind the lower incisors and its top >= 1.5 mm under their biting edge in every
//             open frame (round 3 showed it pushed out between the teeth mid-word: young mother, office worker, mechanic)
//   corners   the open mouth seen from in front: its corner tips' height no lower than 0.58 of the opening's height from
//             its top (a lens is 0.5; Mr. Big 0.44, Gears 0.44, Fiona 0.49; round 3's mechanic, cop, veteran 0.63-0.66:
//             the grimace)
//   scowl     the brows as seen (the painted brow on the skin and the cards over it): the line from the head to the arch
//             rises >= 3 deg going out, and the head is no heavier than 1.15x the arch (Mr. Big 0.93-1.04, round 3's
//             mechanic 1.19)
//   node talkgate.mjs <character.glb>   (any GLB built on the MakeHuman body: Mr. Big's shipped one too, for the bar)
import { createRequire } from 'module';
import fs from 'node:fs';
import { TOOLBOX, GAMEMOG } from './paths.mjs';
const require = createRequire(TOOLBOX);
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { MeshoptDecoder } = require('meshoptimizer');
const T3 = createRequire(GAMEMOG + '/package.json')('three');
const FACE_JS = new URL('./face.js', import.meta.url).pathname;

export const TALK_LIMITS = { jaws: [0.32, 0.55, 0.75], tongueBehindMm: 2.0, tongueUnderMm: 1.5, cornerShare: 0.58, browRiseDeg: 3, browHeadWeight: 1.15 };

// (the engine's face.js on Node: its three/webgpu and three/tsl imports swapped for Node's three, the node material
// bits it never reaches here stubbed)
let faceMod = null;
async function face() {
  if (faceMod) return faceMod;
  globalThis.__FORGE_T3 = T3;
  const src = fs.readFileSync(FACE_JS, 'utf8').replace(/import \* as THREE from 'three\/webgpu';/, 'const THREE = globalThis.__FORGE_T3;').replace(/import \{[^}]*\} from 'three\/tsl';/, 'const attribute = () => null, materialColor = null;');
  faceMod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
  return faceMod;
}

export async function talkGate(doc) {
  const R = doc.getRoot(), forged = R.getAsset().extras?.forge?.landmarks || null;
  // (the body: every primitive drawing from the skin's list of points, as the engine's morphFace takes it)
  const prims = []; for (const m of R.listMeshes()) for (const p of m.listPrimitives()) prims.push(p);
  const skinPr = prims.find((p) => p.getMaterial()?.getName() === 'skin'); if (!skinPr) return { pass: true, note: 'no skin' };
  const acc = skinPr.getAttribute('POSITION'), n = acc.getCount(), P = new Float32Array(n * 3), t = [];
  for (let i = 0; i < n; i++) { acc.getElement(i, t); P[i * 3] = t[0]; P[i * 3 + 1] = t[1]; P[i * 3 + 2] = t[2]; }
  const uvA = skinPr.getAttribute('TEXCOORD_0'), UV = new Float32Array(n * 2); if (uvA) for (let i = 0; i < n; i++) { uvA.getElement(i, t); UV[i * 2] = t[0]; UV[i * 2 + 1] = t[1]; }
  const posAttr = new T3.BufferAttribute(P, 3), meshes = [];
  for (const p of prims) { if (p.getAttribute('POSITION') !== acc) continue; const g = new T3.BufferGeometry(); g.setAttribute('position', posAttr); g.setIndex(new T3.BufferAttribute(Uint32Array.from(p.getIndices().getArray()), 1)); meshes.push({ material: { name: p.getMaterial()?.getName() || '' }, geometry: g }); }
  const { faceMorphs } = await face(), fm = faceMorphs(meshes, { forged });
  if (!fm) return { pass: true, note: 'no face (no skin or eyes)' };
  const by = Object.fromEntries(meshes.slice().reverse().map((m) => [m.material.name, m])), mo = (m, k) => m?.geometry.morphAttributes.position?.find((a) => a.name === k)?.array;
  const J = mo(by.skin, 'jaw'), L = mo(by.skin, 'lip'), verts = (m) => (m ? [...new Set(m.geometry.index.array)] : []);
  const at = (v, jaw, lip) => [P[v * 3] + (J ? J[v * 3] * jaw + L[v * 3] * lip : 0), P[v * 3 + 1] + (J ? J[v * 3 + 1] * jaw + L[v * 3 + 1] * lip : 0), P[v * 3 + 2] + (J ? J[v * 3 + 2] * jaw + L[v * 3 + 2] * lip : 0)];
  const ey = fm.eyes[0].c.y, eyeFront = fm.eyes[0].c.z + fm.eyes[0].r, F = fm.found, partY = ey - F.parting[0][1] / 1000, lipZ = eyeFront + F.lipZ / 1000;
  const out = { found: { partingMm: F.parting[0][1], lipZMm: F.lipZ } }; let pass = true;

  /* tongue: the lower list's points on the tongue's band of the teeth texture (its rows 416-512 of 512: v >= 0.8) */
  { const lo = verts(by.teethLow);
    if (!lo.length) out.tongue = { pass: true, note: 'no built teeth' };
    else { const tongue = lo.filter((v) => UV[v * 2 + 1] >= 0.8), teeth = lo.filter((v) => UV[v * 2 + 1] > 0.4 && UV[v * 2 + 1] < 0.8);
      const inc = teeth.filter((v) => Math.abs(P[v * 3]) < 0.005);
      let worst = { behindMm: 99, underMm: 99 };
      for (const j of TALK_LIMITS.jaws) { const lip = Math.min(1, j * 1.2);
        // (the incisors' front and biting edge, and the tongue's frontmost and topmost points within the incisors' span)
        let iz = -9, iy = -9; for (const v of inc) { const q = at(v, j, lip); iz = Math.max(iz, q[2]); iy = Math.max(iy, q[1]); }
        let tz = -9, ty = -9; for (const v of tongue) { const q = at(v, j, lip); if (Math.abs(q[0]) > 0.012) continue; tz = Math.max(tz, q[2]); ty = Math.max(ty, q[1]); }
        const behind = (iz - tz) * 1000, under = (iy - ty) * 1000; 
        if (behind < worst.behindMm) worst.behindMm = +behind.toFixed(2), worst.atJaw = j; if (under < worst.underMm) worst.underMm = +under.toFixed(2); }
      const ok = worst.behindMm >= TALK_LIMITS.tongueBehindMm && worst.underMm >= TALK_LIMITS.tongueUnderMm; if (!ok) pass = false;
      out.tongue = { pass: ok, ...worst, tonguePoints: tongue.length }; } }

  /* the mouth's corners: the open mouth seen from in front (the skin and the teeth drawn into 0.4 mm cells, the frontmost
     surface kept): the opening is where that surface is the mouth's inside (face.js's mouthShade < 0.6), the teeth or the
     tongue. Its corner tips' height as a share of the opening's height at its middle, from the top: 0.5 a lens (the
     corners level with the opening's middle), less a smile, near 1 the grimace (corners down at the opening's bottom) */
  { const shade = by.skin.geometry.attributes.mouthShade?.array, C = 0.0004, NX = 180, NY = 110, x0 = -NX / 2 * C, y0 = partY - 0.03;
    const tris = []; for (const m of meshes) { const nm = m.material.name; if (nm !== 'skin' && !/^teeth/.test(nm)) continue; const ix = m.geometry.index.array;
      for (let i = 0; i < ix.length; i += 3) { const a = ix[i], b = ix[i + 1], c = ix[i + 2]; if (Math.abs(P[a * 3]) > 0.04 || Math.abs(P[a * 3 + 1] - partY) > 0.035 || P[a * 3 + 2] < lipZ - 0.06) continue;
        const inside = nm !== 'skin' ? 1 : ((shade?.[a] ?? 1) + (shade?.[b] ?? 1) + (shade?.[c] ?? 1)) / 3 < 0.6 ? 1 : 0; tris.push(a, b, c, inside); } }
    const open = (jaw, lip) => { const zb = new Float32Array(NX * NY).fill(-9), cls = new Uint8Array(NX * NY);
      for (let i = 0; i < tris.length; i += 4) { const A = at(tris[i], jaw, lip), B2 = at(tris[i + 1], jaw, lip), C2 = at(tris[i + 2], jaw, lip);
        const det = (B2[1] - C2[1]) * (A[0] - C2[0]) + (C2[0] - B2[0]) * (A[1] - C2[1]); if (Math.abs(det) < 1e-12) continue;
        const gx0 = Math.max(0, Math.floor((Math.min(A[0], B2[0], C2[0]) - x0) / C)), gx1 = Math.min(NX - 1, Math.ceil((Math.max(A[0], B2[0], C2[0]) - x0) / C));
        const gy0 = Math.max(0, Math.floor((Math.min(A[1], B2[1], C2[1]) - y0) / C)), gy1 = Math.min(NY - 1, Math.ceil((Math.max(A[1], B2[1], C2[1]) - y0) / C));
        for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) { const x = x0 + (gx + 0.5) * C, y = y0 + (gy + 0.5) * C;
          const l1 = ((B2[1] - C2[1]) * (x - C2[0]) + (C2[0] - B2[0]) * (y - C2[1])) / det, l2 = ((C2[1] - A[1]) * (x - C2[0]) + (A[0] - C2[0]) * (y - C2[1])) / det, l3 = 1 - l1 - l2;
          if (l1 < 0 || l2 < 0 || l3 < 0) continue; const z = l1 * A[2] + l2 * B2[2] + l3 * C2[2], k = gy * NX + gx; if (z > zb[k]) { zb[k] = z; cls[k] = tris[i + 3]; } } }
      // (the opening: the inside cells joined to the middle column's, so a nostril or an ear is never counted)
      // (a cell with nothing drawn in it looks into the dark behind the teeth: the opening too)
      for (let k = 0; k < NX * NY; k++) if (zb[k] <= -9) cls[k] = 1;
      const mid = NX / 2; let seed = -1; for (let gy = NY - 1; gy >= 0 && seed < 0; gy--) if (cls[gy * NX + mid] && Math.abs(y0 + gy * C - partY) < 0.02) seed = gy * NX + mid;
      if (seed < 0) return null; const seen = new Uint8Array(NX * NY), st = [seed]; seen[seed] = 1; let xl = mid, xr = mid;
      while (st.length) { const k = st.pop(), gx = k % NX; xl = Math.min(xl, gx); xr = Math.max(xr, gx); for (const d of [1, -1, NX, -NX]) { const q = k + d; if (q < 0 || q >= NX * NY || seen[q] || !cls[q] || (Math.abs(d) === 1 && Math.floor(q / NX) !== Math.floor(k / NX))) continue; seen[q] = 1; st.push(q); } }
      const col = (gx) => { let t = -1, b = -1; for (let gy = 0; gy < NY; gy++) if (seen[gy * NX + gx]) { if (b < 0) b = gy; t = gy; } return t < 0 ? null : [t, b]; };
      const c0 = col(mid); if (!c0 || c0[0] - c0[1] < 2) return null; const h = c0[0] - c0[1] + 1;
      // (each tip: the outer tenth of the opening's half-width on its side, its cells' mean height)
      const tip = (side) => { const xe = side > 0 ? xr : xl, w = Math.abs(xe - mid), n0 = Math.max(1, Math.round(w * 0.1)); let s2 = 0, n = 0; for (let k = 0; k < n0; k++) { const c = col(xe - side * k); if (c) { s2 += (c[0] + c[1]) / 2; n++; } } return n ? s2 / n : null; };
      const f = [1, -1].map((s2) => { const y = tip(s2); return y == null ? 0 : (c0[0] - y) / h; });
      return { share: +Math.max(...f).toFixed(2), heightMm: +(h * C * 1000).toFixed(1), halfWidthMm: +((xr - xl) / 2 * C * 1000).toFixed(1) }; };
    const frames = TALK_LIMITS.jaws.map((j) => ({ jaw: j, ...(open(j, Math.min(1, j * 1.2)) || { share: null }) })), worst = Math.max(...frames.map((f) => f.share ?? 0));
    const ok = frames.every((f) => f.share != null) && worst <= TALK_LIMITS.cornerShare; if (!ok) pass = false;
    out.corners = { pass: ok, worstShare: worst, frames }; }

  /* the brows as seen: the skin's texture (the painted brow) and the brows' cards (their texture where it passes its
     alpha cut) drawn from in front into 0.5 mm cells, each cell's darkness against the forehead's skin. Per side, along
     the brow (1 mm columns from its inner end), each column's dark mass and its centre's height. A scowl: the brow's
     weight at its inner head (the heavier inner third, pulled down toward the nose) or a line that falls going out from
     the head to the arch. Calibrated on Mr. Big's shipped brows (cards alone) and the GR anchors */
  { const B = verts(by.brows), skTex = skinPr.getMaterial()?.getBaseColorTexture(), brPr = prims.find((p) => p.getMaterial()?.getName() === 'brows'), brTex = brPr?.getMaterial()?.getBaseColorTexture();
    if (!B.length || !skTex) out.scowl = { pass: true, note: 'no brows or skin texture' };
    else { const sharp = require('sharp'), dec = async (t) => { const { data, info } = await sharp(Buffer.from(t.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, W: info.width, H: info.height }; };
      const ST = await dec(skTex), BT = brTex ? await dec(brTex) : null, cut = brPr?.getMaterial()?.getAlphaCutoff() ?? 0.5, bf = brPr?.getMaterial()?.getBaseColorFactor() || [1, 1, 1, 1];
      const lum = (T, u, v, f = [1, 1, 1]) => { const x = Math.min(T.W - 1, Math.max(0, Math.floor(u * T.W))), y = Math.min(T.H - 1, Math.max(0, Math.floor(v * T.H))), i = (y * T.W + x) * 4; return [0.2126 * Math.pow(T.data[i] / 255, 2.2) * f[0] + 0.7152 * Math.pow(T.data[i + 1] / 255, 2.2) * f[1] + 0.0722 * Math.pow(T.data[i + 2] / 255, 2.2) * f[2], T.data[i + 3] / 255]; };
      const bUV = brPr.getAttribute('TEXCOORD_0'), bIdx = brPr.getIndices().getArray(), bUVa = new Float32Array(n * 2); for (const v of B) { bUV.getElement(v, t); bUVa[v * 2] = t[0]; bUVa[v * 2 + 1] = t[1]; }
      const sides = []; for (const s of [1, -1]) {
        let a0 = 9, a1 = 0, yLo = 9, yHi = -9, zMax = -9; for (const v of B) { const x = P[v * 3] * s; if (x <= 0) continue; a0 = Math.min(a0, x); a1 = Math.max(a1, x); yLo = Math.min(yLo, P[v * 3 + 1]); yHi = Math.max(yHi, P[v * 3 + 1]); zMax = Math.max(zMax, P[v * 3 + 2]); }
        const C = 0.0005, X0 = a0 - 0.006, NX = Math.ceil((a1 + 0.004 - X0) / C), Y0 = yLo - 0.01, NY = Math.ceil((yHi + 0.012 - Y0) / C), skinL = new Float32Array(NX * NY).fill(-1), cardL = new Float32Array(NX * NY).fill(-1), fore = [];
        const draw = (ix, uvOf, sample, into) => { for (let i = 0; i < ix.length; i += 3) { const T = [ix[i], ix[i + 1], ix[i + 2]], Q = T.map((v) => [P[v * 3] * s, P[v * 3 + 1], P[v * 3 + 2]]);
          if (Q.every((q) => q[0] < X0 - 0.004 || q[0] > a1 + 0.008) || Q.every((q) => q[1] < Y0 - 0.004 || q[1] > Y0 + NY * C + 0.01) || Q.some((q) => q[2] < zMax - 0.04)) continue;
          for (let a = 0; a <= 8; a++) for (let b = 0; a + b <= 8; b++) { const l1 = a / 8, l2 = b / 8, l3 = 1 - l1 - l2, x = l1 * Q[0][0] + l2 * Q[1][0] + l3 * Q[2][0], y = l1 * Q[0][1] + l2 * Q[1][1] + l3 * Q[2][1];
            const u = l1 * uvOf(T[0])[0] + l2 * uvOf(T[1])[0] + l3 * uvOf(T[2])[0], w = l1 * uvOf(T[0])[1] + l2 * uvOf(T[1])[1] + l3 * uvOf(T[2])[1], [L, al] = sample(u, w);
            if (y > yHi + 0.006 && y < yHi + 0.016 && x > a0 && x < a1) fore.push(L);
            const gx = Math.floor((x - X0) / C), gy = Math.floor((y - Y0) / C); if (gx < 0 || gy < 0 || gx >= NX || gy >= NY) continue; const k = gy * NX + gx;
            if (into === cardL) { if (al >= cut) cardL[k] = cardL[k] < 0 ? L : Math.min(cardL[k], L); } else skinL[k] = skinL[k] < 0 ? L : (skinL[k] + L) / 2; } } };
        const sIdx = by.skin.geometry.index.array, uvS = (v) => [UV[v * 2], UV[v * 2 + 1]];
        draw(sIdx, uvS, (u, w) => lum(ST, u, w), skinL); if (BT) draw(bIdx, (v) => [bUVa[v * 2], bUVa[v * 2 + 1]], (u, w) => lum(BT, u, w, bf), cardL);
        fore.sort((p, q) => p - q); const Lref = fore[Math.floor(fore.length / 2)] || 0.3;
        const cols = []; for (let gx = 0; gx < NX; gx++) { let m = 0, my = 0; for (let gy = 0; gy < NY; gy++) { const k = gy * NX + gx, L = cardL[k] >= 0 ? Math.min(cardL[k], skinL[k] >= 0 ? skinL[k] : 9) : skinL[k]; if (L < 0) continue; const d = Math.max(0, (Lref - L) / Lref - 0.08); m += d; my += d * (Y0 + (gy + 0.5) * C); }
          cols.push({ x: X0 + (gx + 0.5) * C, m, y: m > 0 ? my / m : null }); }
        const span = a1 - a0, seg = (t0, t1) => { const L = cols.filter((c) => c.x >= a0 + t0 * span && c.x < a0 + t1 * span && c.m > 0); const m = L.reduce((q, c) => q + c.m, 0); return { m: m / Math.max(1, L.length), y: L.length ? L.reduce((q, c) => q + c.y * c.m, 0) / Math.max(1e-9, m) : null, x: a0 + (t0 + t1) / 2 * span }; };
        const head = seg(0.04, 0.22), arch = seg(0.4, 0.62);
        const rise = head.y != null && arch.y != null ? Math.atan2(arch.y - head.y, arch.x - head.x) * 180 / Math.PI : null, heavy = arch.m > 0 ? head.m / arch.m : 9;
        sides.push({ riseDeg: rise != null ? +rise.toFixed(1) : null, headWeight: +heavy.toFixed(2), headMass: +head.m.toFixed(2), archMass: +arch.m.toFixed(2), headOverEyeMm: head.y != null ? +((head.y - ey) * 1000).toFixed(1) : null, archOverEyeMm: arch.y != null ? +((arch.y - ey) * 1000).toFixed(1) : null }); }
      const ok = sides.every((d) => d.riseDeg != null && d.riseDeg >= TALK_LIMITS.browRiseDeg && d.headWeight <= TALK_LIMITS.browHeadWeight); if (!ok) pass = false;
      out.scowl = { pass: ok, L: sides[0], R: sides[1] }; } }

  return { pass, ...out, limit: `jaw ${TALK_LIMITS.jaws} (lip 1.2x): tongue tip >= ${TALK_LIMITS.tongueBehindMm} mm behind the lower incisors and its top >= ${TALK_LIMITS.tongueUnderMm} mm under their edge; the open mouth's corner tips no lower than ${TALK_LIMITS.cornerShare} of its height from the top; each brow as seen (skin paint and cards) rises >= ${TALK_LIMITS.browRiseDeg} deg from its head to its arch, its head no heavier than ${TALK_LIMITS.browHeadWeight}x the arch` };
}

if (process.argv[1]?.endsWith('talkgate.mjs')) {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  for (const f of process.argv.slice(2)) { const r = await talkGate(await io.read(f)); console.log(f.split('/').pop().padEnd(32), r.pass ? 'PASS' : 'FAIL', JSON.stringify({ found: r.found, tongue: r.tongue, corners: r.corners, scowl: r.scowl })); }
}
