/**
 * Build a realistic human for the asset library from MakeHuman's CC0 assets.
 *
 * - The body is MakeHuman's base mesh, shaped by its macro targets into a
 *   young athlete, with five morph targets a world can dial at runtime
 *   (muscle, lean, and the three ethnic face/body blends).
 * - The skeleton is MakeHuman's default rig reduced to the 66 bones that
 *   matter at game distance; every dropped bone's weights move to its
 *   nearest kept ancestor.
 * - Hair, eyebrows, eyelashes and eyes are MakeHuman proxies, fitted to the
 *   shaped body the way MakeHuman fits them, and skinned from the body.
 * - The kit is a thin layer over the body (singlet or crop top, shorts,
 *   spikes), plus two maps that give every texel of the kit its body-space
 *   position, normal and region, so the runtime can paint any colours,
 *   stripes and a bib with a name and number, in body space.
 */
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { applyTarget, convertImage, fitMhclo, Packer, parseMhclo, parseObj, parseTarget, read, writeOut, type Obj } from './lib.ts';

type Gender = 'male' | 'female';
const DM = 0.1; // MakeHuman works in decimetres

const KEEP = new Set<string>(['root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03', 'head']);
for (const s of ['L', 'R']) {
  for (const b of ['clavicle', 'shoulder01', 'upperarm01', 'upperarm02', 'lowerarm01', 'lowerarm02', 'wrist', 'pelvis', 'upperleg01', 'upperleg02', 'lowerleg01', 'lowerleg02', 'foot']) KEEP.add(`${b}.${s}`);
  for (let f = 1; f <= 5; f++) for (let j = 1; j <= 3; j++) KEEP.add(`finger${f}-${j}.${s}`);
}

export type HumanBuild = {
  id: string; gender: Gender; dir: string;
  skeleton: { name: string; parent: number; head: number[]; tail: number[] }[];
  asset: Record<string, unknown>;
  files: string[];
};

export function buildHuman(opts: { id: string; gender: Gender; outDir: string; hair: string[]; brows: string; skins: Record<string, string> }): HumanBuild {
  const { gender, outDir } = opts;
  const base = parseObj(read('makehuman/3dobjs/base.obj'));
  const P0 = new Float64Array(base.v.flat());
  const T = (p: string) => parseTarget(read(`makehuman/targets/macrodetails/${p}.target`));
  const g = gender;

  // the shape every instance starts from: a young athlete, half-way to full muscle
  const ETH = ['african', 'asian', 'caucasian'] as const;
  const eth = Object.fromEntries(ETH.map((e) => [e, T(`${e}-${g}-young`)]));
  const maxMuscle = T(`universal-${g}-young-maxmuscle-averageweight`);
  const lean = T(`universal-${g}-young-maxmuscle-minweight`);
  const ideal = T(`proportions/${g}-young-maxmuscle-averageweight-idealproportions`);
  const tall = T(`height/${g}-young-maxmuscle-averageweight-maxheight`);
  const S = new Float64Array(P0);
  for (const e of ETH) applyTarget(S, eth[e], 1 / 3);
  applyTarget(S, maxMuscle, 0.5);
  applyTarget(S, ideal, 0.8);
  applyTarget(S, tall, g === 'male' ? 0.15 : 0.1);

  // morph targets, as deltas from S
  const delta = (fn: (p: Float64Array) => void) => { const q = new Float64Array(S); fn(q); for (let i = 0; i < q.length; i++) q[i] -= S[i]; return q; };
  const morphs: Record<string, Float64Array> = {
    muscle: delta((q) => applyTarget(q, maxMuscle, 0.5)),
    lean: delta((q) => { applyTarget(q, lean, 0.7); applyTarget(q, maxMuscle, -0.35); }),
    african: delta((q) => { applyTarget(q, eth.african, 2 / 3); applyTarget(q, eth.asian, -1 / 3); applyTarget(q, eth.caucasian, -1 / 3); }),
    asian: delta((q) => { applyTarget(q, eth.asian, 2 / 3); applyTarget(q, eth.african, -1 / 3); applyTarget(q, eth.caucasian, -1 / 3); }),
    caucasian: delta((q) => { applyTarget(q, eth.caucasian, 2 / 3); applyTarget(q, eth.asian, -1 / 3); applyTarget(q, eth.african, -1 / 3); }),
  };
  const morphNames = Object.keys(morphs);

  // body faces, and where the floor is
  const bodyFaces = base.faces.filter((f) => f.group === 'body');
  const bodyVerts = new Set<number>(); bodyFaces.forEach((f) => f.v.forEach((i) => bodyVerts.add(i)));
  let minY = Infinity; for (const i of bodyVerts) minY = Math.min(minY, S[i * 3 + 1]);
  const W = (P: Float64Array, i: number) => [P[i * 3] * DM, (P[i * 3 + 1] - minY) * DM, P[i * 3 + 2] * DM];

  // skeleton: joints are the mean of their vertex groups on the shaped mesh
  const mh = JSON.parse(read('makehuman/rigs/default.mhskel'));
  const joint = (n: string) => { const ids: number[] = mh.joints[n]; const p = [0, 0, 0]; ids.forEach((i) => { const w = W(S, i); p[0] += w[0]; p[1] += w[1]; p[2] += w[2]; }); return p.map((v) => v / ids.length); };
  const collapse = (b: string): string => (KEEP.has(b) ? b : collapse(mh.bones[b].parent));
  const order: string[] = [];
  const visit = (b: string) => { if (KEEP.has(b)) order.push(b); for (const [k, v] of Object.entries<any>(mh.bones)) if (v.parent === b) visit(k); };
  visit('root');
  const index = new Map(order.map((b, i) => [b, i]));
  const skeleton = order.map((b) => {
    const parent = mh.bones[b].parent ? index.get(collapse(mh.bones[b].parent))! : -1;
    return { name: b, parent, head: joint(mh.bones[b].head), tail: joint(mh.bones[b].tail) };
  });

  // weights: every dropped bone's weight moves to its nearest kept ancestor
  const mhw = JSON.parse(read('makehuman/rigs/default_weights.mhw')).weights as Record<string, [number, number][]>;
  const vw = new Map<number, Map<number, number>>();
  for (const [bone, list] of Object.entries(mhw)) {
    const k = index.get(collapse(bone))!;
    for (const [v, w] of list) { let m = vw.get(v); if (!m) vw.set(v, (m = new Map())); m.set(k, (m.get(k) ?? 0) + w); }
  }
  const weightsOf = (v: number) => vw.get(v) ?? new Map([[0, 1]]);
  const top4 = (m: Map<number, number>) => {
    const e = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), s = e.reduce((a, b) => a + b[1], 0) || 1;
    return e.map(([b, w]) => [b, w / s] as [number, number]);
  };
  const dominant = (v: number) => top4(weightsOf(v))[0][0];

  // welded normals of the shaped body
  const bodyNormal = new Float64Array(S.length);
  for (const f of bodyFaces) {
    const tri = f.v.length === 4 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 2]];
    for (const [a, b, c] of tri) {
      const A = W(S, f.v[a]), B = W(S, f.v[b]), C = W(S, f.v[c]);
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      for (const i of [f.v[a], f.v[b], f.v[c]]) { bodyNormal[i * 3] += n[0]; bodyNormal[i * 3 + 1] += n[1]; bodyNormal[i * 3 + 2] += n[2]; }
    }
  }
  for (let i = 0; i < bodyNormal.length; i += 3) { const l = Math.hypot(bodyNormal[i], bodyNormal[i + 1], bodyNormal[i + 2]) || 1; bodyNormal[i] /= l; bodyNormal[i + 1] /= l; bodyNormal[i + 2] /= l; }

  /* ------------------------------------------------ assemble parts -- */
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], si: number[] = [], sw: number[] = [];
  const morphOut: number[][] = morphNames.map(() => []);
  const idx: number[] = [];
  const groups: { name: string; start: number; count: number }[] = [];
  const push = (p: number[], n: number[], t: number[], w: [number, number][], md: number[][]) => {
    pos.push(...p); nor.push(...n); uv.push(t[0], t[1]);
    for (let k = 0; k < 4; k++) { si.push(w[k]?.[0] ?? 0); sw.push(w[k]?.[1] ?? 0); }
    md.forEach((d, m) => morphOut[m].push(...d));
    return pos.length / 3 - 1;
  };
  function addPart(name: string, faces: { v: number[]; t: number[] }[], vt: number[][], vertex: (v: number) => { p: number[]; n: number[]; w: [number, number][]; md: number[][] }) {
    const start = idx.length, seen = new Map<string, number>();
    const id = (v: number, t: number) => { const key = v + '/' + t; let i = seen.get(key); if (i === undefined) { const d = vertex(v); i = push(d.p, d.n, vt[t] ?? [0, 0], d.w, d.md); seen.set(key, i); } return i; };
    for (const f of faces) {
      const tri = f.v.length === 4 ? [[0, 1, 2], [0, 2, 3]] : f.v.length === 3 ? [[0, 1, 2]] : [];
      for (const [a, b, c] of tri) idx.push(id(f.v[a], f.t[a]), id(f.v[b], f.t[b]), id(f.v[c], f.t[c]));
    }
    groups.push({ name, start, count: idx.length - start });
  }
  const bodyVertex = (v: number, offset = 0) => {
    const p = W(S, v), n = [bodyNormal[v * 3], bodyNormal[v * 3 + 1], bodyNormal[v * 3 + 2]];
    return { p: [p[0] + n[0] * offset, p[1] + n[1] * offset, p[2] + n[2] * offset], n, w: top4(weightsOf(v)), md: morphNames.map((m) => [morphs[m][v * 3] * DM, morphs[m][v * 3 + 1] * DM, morphs[m][v * 3 + 2] * DM]) };
  };
  addPart('body', bodyFaces, base.vt, (v) => bodyVertex(v));

  // the kit: regions of the body, lifted a few millimetres
  const J = (b: string) => skeleton[index.get(b)!];
  const hipY = J('upperleg01.L').head[1], kneeY = J('lowerleg01.L').head[1], ankleY = J('foot.L').head[1];
  const shoulderY = J('upperarm01.L').head[1], neckY = J('neck01').head[1];
  const armpitY = shoulderY - 0.075, waistY = hipY + (gender === 'male' ? 0.12 : 0.1);
  const TORSO = new Set(['root', 'spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'clavicle.L', 'clavicle.R', 'pelvis.L', 'pelvis.R', 'neck01'].map((b) => index.get(b)!));
  const LEGS = new Set(['upperleg01.L', 'upperleg01.R', 'upperleg02.L', 'upperleg02.R', 'pelvis.L', 'pelvis.R', 'root', 'spine05'].map((b) => index.get(b)!));
  const FEET = new Set(['foot.L', 'foot.R'].map((b) => index.get(b)!));
  const region = (f: { v: number[] }) => {
    const c = [0, 0, 0], n = [0, 0, 0];
    f.v.forEach((v) => { const p = W(S, v); for (let k = 0; k < 3; k++) { c[k] += p[k] / f.v.length; n[k] += bodyNormal[v * 3 + k] / f.v.length; } });
    const bone = dominant(f.v[0]), ax = Math.abs(c[0]);
    if (f.v.every((v) => FEET.has(dominant(v)) || W(S, v)[1] < ankleY + 0.02) && c[1] < ankleY + 0.035) return 3; // spikes
    const topLo = gender === 'male' ? waistY - 0.015 : armpitY - 0.17;
    if (c[1] > topLo && c[1] < neckY - 0.02 && TORSO.has(bone)) {
      if (c[1] > armpitY - 0.02 && ax > (gender === 'male' ? 0.115 : 0.105)) return 0;   // armholes
      if (n[2] > 0.3 && c[1] > neckY - (gender === 'male' ? 0.1 : 0.12)) return 0;       // front neckline
      if (n[2] < -0.3 && c[1] > neckY - 0.05) return 0;                                  // back neckline
      return 1;                                                                           // singlet or crop top
    }
    const shortsLo = gender === 'male' ? hipY - 0.2 : hipY - 0.06, shortsHi = gender === 'male' ? waistY : hipY + 0.085;
    if (c[1] > shortsLo && c[1] < shortsHi + 0.005 && (LEGS.has(bone) || TORSO.has(bone))) return 2; // shorts
    return 0;
  };
  const THICK = [0, 0.0035, 0.004, 0.006];
  const kitFaces: { v: number[]; t: number[]; r: number }[] = [];
  for (const f of bodyFaces) { const r = region(f); if (r) kitFaces.push({ ...f, r }); }
  if (process.env.KIT_DEBUG) console.log(gender, 'kit faces', [1, 2, 3].map((r) => kitFaces.filter((f) => f.r === r).length), { hipY, waistY, armpitY, neckY, shoulderY, ankleY });
  const kitStart = pos.length / 3;
  for (const r of [1, 2, 3]) {
    addPart(['', 'top', 'shorts', 'shoes'][r], kitFaces.filter((f) => f.r === r), base.vt, (v) => bodyVertex(v, THICK[r]));
  }
  const kitEnd = pos.length / 3;

  // proxies: eyes, eyebrows, eyelashes, hair
  const proxy = (name: string, dir: string) => {
    const obj: Obj = parseObj(read(`makehuman-system/${dir}/${name}.obj`));
    const m = parseMhclo(read(`makehuman-system/${dir}/${name}.mhclo`));
    const fit = fitMhclo(m, S), fitM = morphNames.map((mn) => { const q = new Float64Array(S); for (let i = 0; i < q.length; i++) q[i] += morphs[mn][i]; return fitMhclo(m, q); });
    // welded normals of the proxy
    const pn = new Float64Array(fit.length);
    for (const f of obj.faces) {
      const tri = f.v.length === 4 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 2]];
      for (const [a, b, c] of tri) {
        const [ia, ib, ic] = [f.v[a], f.v[b], f.v[c]];
        const u = [0, 1, 2].map((k) => fit[ib * 3 + k] - fit[ia * 3 + k]), w = [0, 1, 2].map((k) => fit[ic * 3 + k] - fit[ia * 3 + k]);
        const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        for (const i of [ia, ib, ic]) for (let k = 0; k < 3; k++) pn[i * 3 + k] += n[k];
      }
    }
    return { obj, vertex: (v: number) => {
      const r = m.refs[v], acc = new Map<number, number>();
      r.v.forEach((bv, k) => { for (const [b, w] of weightsOf(bv)) acc.set(b, (acc.get(b) ?? 0) + w * r.w[k]); });
      const l = Math.hypot(pn[v * 3], pn[v * 3 + 1], pn[v * 3 + 2]) || 1;
      return {
        p: [fit[v * 3] * DM, (fit[v * 3 + 1] - minY) * DM, fit[v * 3 + 2] * DM],
        n: [pn[v * 3] / l, pn[v * 3 + 1] / l, pn[v * 3 + 2] / l],
        w: top4(acc),
        md: fitM.map((q) => [(q[v * 3] - fit[v * 3]) * DM, (q[v * 3 + 1] - fit[v * 3 + 1]) * DM, (q[v * 3 + 2] - fit[v * 3 + 2]) * DM]),
      };
    } };
  };
  const eyes = proxy('high-poly', 'eyes/high-poly'); addPart('eyes', eyes.obj.faces, eyes.obj.vt, eyes.vertex);
  const brows = proxy(opts.brows, `eyebrows/${opts.brows}`); addPart('brows', brows.obj.faces, brows.obj.vt, brows.vertex);
  const lashes = proxy('eyelashes01', 'eyelashes/eyelashes01'); addPart('lashes', lashes.obj.faces, lashes.obj.vt, lashes.vertex);
  for (const h of opts.hair) { const hp = proxy(h, `hair/${h}`); addPart(`hair:${h}`, hp.obj.faces, hp.obj.vt, hp.vertex); }

  /* ----------------------------------------------- the kit's paint maps -- */
  // every texel of the kit gets its body-space position, normal and region
  const N = 1024, posMap = new Uint8Array(N * N * 4), norMap = new Uint8Array(N * N * 4);
  const bbMin = [Infinity, Infinity, Infinity], bbMax = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { bbMin[k] = Math.min(bbMin[k], pos[i + k]); bbMax[k] = Math.max(bbMax[k], pos[i + k]); }
  const rect = [1, 1, 0, 0];
  for (const f of kitFaces) {
    const tri = f.v.length === 4 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 2]];
    for (const [a, b, c] of tri) {
      const T3 = [f.t[a], f.t[b], f.t[c]].map((t) => base.vt[t]), V3 = [f.v[a], f.v[b], f.v[c]];
      const px = T3.map((t) => [t[0] * N, (1 - t[1]) * N]);
      const x0 = Math.max(0, Math.floor(Math.min(...px.map((p) => p[0]))) - 1), x1 = Math.min(N - 1, Math.ceil(Math.max(...px.map((p) => p[0]))) + 1);
      const y0 = Math.max(0, Math.floor(Math.min(...px.map((p) => p[1]))) - 1), y1 = Math.min(N - 1, Math.ceil(Math.max(...px.map((p) => p[1]))) + 1);
      const d = (px[1][1] - px[2][1]) * (px[0][0] - px[2][0]) + (px[2][0] - px[1][0]) * (px[0][1] - px[2][1]);
      if (Math.abs(d) < 1e-9) continue;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const sx = x + 0.5, sy = y + 0.5;
        let l0 = ((px[1][1] - px[2][1]) * (sx - px[2][0]) + (px[2][0] - px[1][0]) * (sy - px[2][1])) / d;
        let l1 = ((px[2][1] - px[0][1]) * (sx - px[2][0]) + (px[0][0] - px[2][0]) * (sy - px[2][1])) / d;
        let l2 = 1 - l0 - l1;
        const e = -1.5 / N * 3; // grow each triangle a little so seams do not show
        if (l0 < e || l1 < e || l2 < e) continue;
        l0 = Math.max(0, l0); l1 = Math.max(0, l1); l2 = Math.max(0, l2); const s = l0 + l1 + l2; l0 /= s; l1 /= s; l2 /= s;
        const q = (y * N + x) * 4, P = V3.map((v) => W(S, v)), Nn = V3.map((v) => [bodyNormal[v * 3], bodyNormal[v * 3 + 1], bodyNormal[v * 3 + 2]]);
        for (let k = 0; k < 3; k++) {
          const pv = P[0][k] * l0 + P[1][k] * l1 + P[2][k] * l2, nv = Nn[0][k] * l0 + Nn[1][k] * l1 + Nn[2][k] * l2;
          posMap[q + k] = Math.round(((pv - bbMin[k]) / (bbMax[k] - bbMin[k])) * 255);
          norMap[q + k] = Math.round((Math.max(-1, Math.min(1, nv)) * 0.5 + 0.5) * 255);
        }
        posMap[q + 3] = f.r * 60; norMap[q + 3] = 255;
        rect[0] = Math.min(rect[0], x / N); rect[1] = Math.min(rect[1], y / N); rect[2] = Math.max(rect[2], (x + 1) / N); rect[3] = Math.max(rect[3], (y + 1) / N);
      }
    }
  }

  /* ------------------------------------------------------ write out -- */
  const vcount = pos.length / 3;
  const pk = new Packer();
  pk.add('position', new Float32Array(pos), 3);
  pk.add('normal', new Int8Array(nor.map((v) => Math.round(Math.max(-1, Math.min(1, v)) * 127))), 3);
  pk.add('uv', new Uint16Array(uv.map((v, i) => Math.round(Math.max(0, Math.min(1, i % 2 ? v : v)) * 65535))), 2);
  pk.add('skinIndex', new Uint8Array(si), 4);
  const swq = new Uint8Array(sw.length);
  for (let i = 0; i < sw.length; i += 4) { let rest = 255; for (let k = 0; k < 3; k++) { swq[i + k] = Math.round(sw[i + k] * 255); rest -= swq[i + k]; } swq[i + 3] = Math.max(0, rest); }
  pk.add('skinWeight', swq, 4);
  const morphMeta: Record<string, number> = {};
  morphNames.forEach((m, k) => {
    const d = morphOut[k], max = Math.max(1e-6, ...d.map(Math.abs));
    morphMeta[m] = max / 32767;
    pk.add(`morph:${m}`, new Int16Array(d.map((v) => Math.round(v / max * 32767))), 3);
  });
  pk.add('index', vcount < 65536 ? new Uint16Array(idx) : new Uint32Array(idx), 1);
  writeOut(outDir, 'body.bin', pk.buffer());
  // raw bytes, not PNG: a browser canvas would premultiply the region byte
  // into the colour channels and lose the positions' precision
  const kitRaw = new Uint8Array(N * N * 8); kitRaw.set(posMap, 0); kitRaw.set(norMap, N * N * 4);
  writeOut(outDir, 'kit.bin.z', deflateSync(kitRaw, { level: 9 }));

  // textures
  const files = ['body.bin', 'kit.bin.z'];
  const skins: Record<string, { hi: string; lo: string }> = {};
  for (const [name, src] of Object.entries(opts.skins)) {
    convertImage(src, join(outDir, `skin-${name}.jpg`), { max: 2048, format: 'jpeg', quality: 84 });
    convertImage(src, join(outDir, `skin-${name}-lo.jpg`), { max: 1024, format: 'jpeg', quality: 80 });
    skins[name] = { hi: `skin-${name}.jpg`, lo: `skin-${name}-lo.jpg` }; files.push(skins[name].hi, skins[name].lo);
  }
  const hairTex: Record<string, string> = {};
  const hairSrc: Record<string, string> = { short02: 'hair/short02/short02_diffuse.png', short04: 'hair/short04/short04_diffuse.png', afro01: 'hair/afro01/afro_diffuse.png' };
  for (const h of opts.hair) { convertImage(`makehuman-system/${hairSrc[h]}`, join(outDir, `hair-${h}.png`), { max: 1024, format: 'png' }); hairTex[h] = `hair-${h}.png`; files.push(hairTex[h]); }
  convertImage(`makehuman-system/eyebrows/${opts.brows}/${opts.brows}.png`, join(outDir, 'brows.png'), { max: 512, format: 'png' });
  convertImage('makehuman-system/eyelashes/eyelashes01/eyelashes01.png', join(outDir, 'lashes.png'), { max: 512, format: 'png' });
  const eyes2: Record<string, string> = {};
  for (const e of ['brown', 'brownlight', 'blue']) { convertImage(`makehuman-system/eyes/materials/${e}_eye.png`, join(outDir, `eye-${e}.jpg`), { max: 512, format: 'jpeg', quality: 85 }); eyes2[e] = `eye-${e}.jpg`; files.push(eyes2[e]); }
  files.push('brows.png', 'lashes.png');

  const height = bbMax[1];
  const asset = {
    format: 'gmasset/1', kind: 'human', gender, units: 'metres', height: +height.toFixed(3),
    vertexCount: vcount, layout: pk.layout, groups, morphs: morphMeta,
    skeleton: skeleton.map((b) => ({ name: b.name, parent: b.parent, head: b.head.map((v) => +v.toFixed(5)), tail: b.tail.map((v) => +v.toFixed(5)) })),
    landmarks: { hip: +hipY.toFixed(4), knee: +kneeY.toFixed(4), ankle: +ankleY.toFixed(4), shoulder: +shoulderY.toFixed(4), neck: +neckY.toFixed(4), armpit: +armpitY.toFixed(4), waist: +waistY.toFixed(4) },
    kit: { file: 'kit.bin.z', size: N, rect: rect.map((v) => +v.toFixed(4)), bounds: { min: bbMin.map((v) => +v.toFixed(4)), max: bbMax.map((v) => +v.toFixed(4)) }, regions: { top: 60, shorts: 120, shoes: 180 }, vertices: [kitStart, kitEnd] },
    textures: { skins, hair: hairTex, brows: 'brows.png', lashes: 'lashes.png', eyes: eyes2 },
  };
  return { id: opts.id, gender, dir: outDir, skeleton, asset, files };
}
