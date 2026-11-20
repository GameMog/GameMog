// Hand-built Jensen, his age (owner, round 3: "Jensen looks too young": he is 63). Two passes:
//  shape   MakeHuman's own modelling targets (CC0, the forge's target set, FORGE_MH_TARGETS) baked into the rest shape at
//          modest weights: the cheek mass over the nose-to-mouth fold (mouth-laugh-lines-out), the cheeks and jowls a
//          little lower (cheek-trans-down), fuller lower lids (eye-bag-incr / -height-incr), the upper lid a little
//          hooded (eyefold-down) and the brows a touch lower, thinner lips (upper/lower lip volume down), a softer neck
//          under the jaw (neck-double-incr)
//  skin    painted after John's skin pass, from where each texel is on him (bind space): a height field (creases and the
//          soft bulges beside them) added into the skin's normal map, and the same creases darkened in its colour:
//          four forehead lines, the two frown lines between the brows, crow's feet fanning from each outer corner, a
//          tear-trough under each lower lid, deep nose-to-mouth folds, marionette lines to the chin, fine vertical lines
//          over the upper lip, the jowl's line, rings round the neck; age spots (solar lentigines) on the temples, the
//          upper cheeks, the forehead and the backs of the hands; the face's tone less saturated and less orange (an
//          older man's skin: some redness at the cheeks and nose, a cooler, slightly sallow ground)
// No photograph is used: every line is placed from his own landmarks (./landmarks.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { matOf, rgba, setWebp, fbm, h3, sm, clamp, sharp } from '../young-hero/glb.mjs';
import { texelPos } from '../young-mother/p2.mjs';
import { bakeRest } from '../facekit.mjs';
import { LM } from './landmarks.mjs';

const MHT = () => { const d = process.env.FORGE_MH_TARGETS; if (!d || !fs.existsSync(d)) throw new Error('FORGE_MH_TARGETS: the MakeHuman targets folder'); return d; };

export function ageShapePass(doc, K = {}) {
  // (likeness round 1, K.lean: the owner's reference shows a lean, taut face, defined cheekbones and a slightly tapered
  // jaw; round 4's sag, jowls and soft neck read puffy. The lean set: no sag or double chin, less cheek over the fold,
  // lighter bags; and the face drawn in a little: MakeHuman's head-fat-decr, cheek volume down, the cheekbones up, the
  // jaw's width at the chin a touch narrower)
  K = K.lean ? { laugh: 0.15, sag: 0, bag: 0.35, bagH: 0.1, fold: 0.3, brow: 0.15, lipUp: 0.4, lipLow: 0.3, neck: 0, fat: 0.25, vol: 0.25, bones: 0.7, chinW: 0, chinH: 0.6, ...K }
    : { laugh: 0.6, sag: 0.4, bag: 0.75, bagH: 0.35, fold: 0.35, brow: 0.25, lipUp: 0.55, lipLow: 0.45, neck: 0.22, ...K };
  const T = (f) => path.join(MHT(), f + '.target');
  const list = [
    [T('mouth/mouth-laugh-lines-out'), K.laugh],
    [T('cheek/l-cheek-trans-down'), K.sag], [T('cheek/r-cheek-trans-down'), K.sag],
    [T('eyes/l-eye-bag-incr'), K.bag], [T('eyes/r-eye-bag-incr'), K.bag],
    [T('eyes/l-eye-bag-height-incr'), K.bagH], [T('eyes/r-eye-bag-height-incr'), K.bagH],
    [T('eyes/l-eye-eyefold-down'), K.fold], [T('eyes/r-eye-eyefold-down'), K.fold],
    [T('eyebrows/eyebrows-trans-down'), K.brow],
    [T('mouth/mouth-upperlip-volume-decr'), K.lipUp], [T('mouth/mouth-lowerlip-volume-decr'), K.lipLow],
    [T('neck/neck-double-incr'), K.neck],
    [T('head/head-fat-decr'), K.fat || 0],
    [T('cheek/l-cheek-volume-decr'), K.vol || 0], [T('cheek/r-cheek-volume-decr'), K.vol || 0],
    [T('cheek/l-cheek-bones-incr'), K.bones || 0], [T('cheek/r-cheek-bones-incr'), K.bones || 0],
    [T('chin/chin-width-decr'), K.chinW || 0],
    [T('chin/chin-height-decr'), K.chinH || 0],
    // (likeness round 2, the broad face: wider cheekbones and temples, a squarer, more compact midface, a shorter
    // forehead; the mouth's corners level, a fuller upper lip, the cheek's fold over the mouth flatter; narrower, hooded
    // almond eyes (the upper lid lower, its fold down))
    [T('forehead/forehead-temple-incr'), K.temple || 0], [T('forehead/forehead-scale-vert-decr'), K.foreV || 0],
    [T('head/head-scale-horiz-incr'), K.horiz || 0], [T('head/head-scale-vert-decr'), K.vert || 0], [T('head/head-square'), K.square || 0],
    [T('mouth/mouth-angles-up'), K.angUp || 0], [T('mouth/mouth-upperlip-volume-incr'), K.lipUpInc || 0], [T('mouth/mouth-laugh-lines-in'), K.laughIn || 0],
    [T('eyes/l-eye-height2-decr'), K.eyeH || 0], [T('eyes/r-eye-height2-decr'), K.eyeH || 0],
    [T('eyes/l-eye-height1-decr'), K.eyeH1 || 0], [T('eyes/r-eye-height1-decr'), K.eyeH1 || 0],
    [T('eyebrows/eyebrows-angle-down'), K.browAng || 0],
    // (likeness round 2b: the face's outline a diamond (broad at the cheekbones, the forehead and jaw narrower), the
    // cheeks' inner mass beside the mouth lower (no puffy lower cheeks), the neck a little thicker (a long thin column
    // read as a doll's))
    [T('head/head-diamond'), K.diamond || 0], [T('head/head-invertedtriangular'), K.invTri || 0], [T('cheek/l-cheek-inner-decr'), K.cheekIn || 0], [T('cheek/r-cheek-inner-decr'), K.cheekIn || 0],
    [T('neck/neck-scale-horiz-incr'), K.neckW || 0], [T('neck/neck-scale-depth-incr'), K.neckD || 0],
    // (likeness round 3: any further MakeHuman targets by their path under the targets folder, K.extra = [[path, w], ...]:
    // the nose (broad base, wide soft tip, lower bridge), the eyes' lids, the jaw's corners and the chin)
    ...(K.extra || []).map(([f, w]) => [T(f), w]),
  ].filter(([, w]) => w);
  bakeRest(doc, list);
}

export async function ageSkinPass(doc, K = {}) {
  // (likeness round 2: per-feature depths: fore (the forehead's lines), folds (nose-to-mouth), mar (marionette), trough
  // (the dark under the lower lids), jowl)
  K = { depth: 1, spots: 1, desat: 0.14, cool: [0.99, 1.0, 1.025], gain: 6, fore: 1, folds: 1, mar: 1, trough: 1, jowl: 1, neckR: 1, ...K };
  const { EY, EYEFRONT, EZ, EYEX, MOUTHY, CHINY } = LM;
  const { tex, img, S, N2, pos, head } = await texelPos(doc), d = img.data;
  const mat = matOf(doc, 'skin'), nt = mat.getNormalTexture();
  const lin = (c) => Math.pow(c / 255, 2.2), enc = (l) => Math.min(255, Math.max(0, Math.round(255 * Math.pow(Math.max(0, l), 1 / 2.2))));
  const g2 = (dx, dy, sx, sy) => Math.exp(-((dx / sx) ** 2 + (dy / sy) ** 2));
  // a crease along a polyline in (x, y) of the face's front (|x|): depth at distance from it, width w, and a soft bulge on
  // the side `bs` (+1: larger x) of width bw; t0/t1 fade the ends
  const seg = (x, y, P) => { let best = 1e9, tt = 0, side = 0, acc = 0, tot = 0; for (let k = 0; k + 1 < P.length; k++) tot += Math.hypot(P[k + 1][0] - P[k][0], P[k + 1][1] - P[k][1]);
    for (let k = 0; k + 1 < P.length; k++) { const [ax, ay] = P[k], [bx, by] = P[k + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
      const t = clamp(((x - ax) * dx + (y - ay) * dy) / L2), cx = ax + dx * t, cy = ay + dy * t, dd = Math.hypot(x - cx, y - cy);
      if (dd < best) { best = dd; tt = (acc + t * L) / tot; side = Math.sign(dx * (y - ay) - dy * (x - ax)); } acc += L; }
    return { d: best, t: tt, side }; };
  const H = new Float32Array(N2), DK = new Float32Array(N2), SP = new Float32Array(N2);
  let nf = 0;
  for (let i = 0; i < N2; i++) {
    const X = pos[i * 3]; if (Number.isNaN(X)) continue; const y = pos[i * 3 + 1], z = pos[i * 3 + 2], x = Math.abs(X);
    const n1 = fbm(X, y, z, 60) - 0.5, n2 = fbm(X + 3, y, z, 220) - 0.5;
    let h = 0, dk = 0;
    const face = head[i] > 0.4 && z > EZ - 0.075 && y > CHINY - 0.02;
    if (face) { nf++;
      // forehead: four lines, wavy, longest in the middle ones, fading at the temples and toward the hairline
      { const fh = sm(EY + 0.026, EY + 0.034, y) * sm(EY + 0.078, EY + 0.066, y) * (1 - sm(0.042, 0.06, x)) * sm(EZ - 0.035, EZ - 0.012, z);
        if (fh > 0) { const ph = (y - EY - 0.031 - 0.004 * (x / 0.05) ** 2) / 0.0095 + 0.35 * n1, k = Math.round(ph), f = ph - k;
          if (k >= 0 && k <= 2) { const len = 1 - sm(0.03 + 0.008 * (k === 1 || k === 2), 0.052, x + 0.01 * n2); const ln = Math.exp(-((f / 0.075) ** 2)) * len, bump = Math.exp(-(((Math.abs(f) - 0.3) / 0.16) ** 2)) * len;
            h += K.fore * fh * (-0.0002 * ln + 0.00005 * bump); dk += K.fore * fh * 0.09 * ln; } } }
      // the frown lines between the brows
      { const gl = Math.exp(-(((x - 0.0065 - 0.002 * (y - EY - 0.012) / 0.02) / 0.0011) ** 2)) * sm(EY + 0.004, EY + 0.012, y) * sm(EY + 0.04, EY + 0.026, y) * sm(EYEFRONT - 0.03, EYEFRONT - 0.012, z);
        h -= 0.00022 * gl * (K.frown ?? 1); dk += 0.08 * gl * (K.frown ?? 1); } // (likeness round 3, K.frown: they read as a scowl)
      // crow's feet: rays from the outer corner, 4 of them, 5 to 16 mm out
      { const cx = x - (EYEX + 0.019), cy = y - (EY - 0.001); if (cx > -0.002 && cx < 0.022 && Math.abs(cy) < 0.016 && z > EZ - 0.06) {
          const an = Math.atan2(cy, cx), r = Math.hypot(cx, cy), rays = Math.exp(-((Math.sin((an + 0.25 * n1) * 4.2) / 0.16) ** 2)) * (Math.abs(an) < 1.1 ? 1 : 0);
          const fall = sm(0.003, 0.007, r) * sm(0.02, 0.012, r); h -= 0.0002 * rays * fall; dk += 0.07 * rays * fall; } }
      // under-eye: the bag's lower edge (the tear trough), a curved crease 9-11 mm under the eye's centre
      { const t = seg(x, y, [[EYEX - 0.014, EY - 0.009], [EYEX - 0.004, EY - 0.0175], [EYEX + 0.009, EY - 0.0185], [EYEX + 0.02, EY - 0.013]]);
        if (z > EZ - 0.035) { const f = Math.exp(-((t.d / 0.0016) ** 2)) * sm(0, 0.15, t.t) * sm(1, 0.8, t.t), bag = Math.exp(-((t.d / 0.004) ** 2)) * (t.side > 0 ? 1 : 0) * sm(0, 0.2, t.t) * sm(1, 0.7, t.t);
          h += K.trough * (-0.0003 * f + 0.00018 * bag); dk += K.trough * (0.16 * f + 0.1 * Math.exp(-((t.d / 0.006) ** 2)) * (t.side > 0 ? 1 : 0)); } }
      // the nose-to-mouth folds: from the nose's wing down and out past the mouth's corner, the cheek bulging over it
      { const t = seg(x, y, [[0.0175, EY - 0.042], [0.0235, MOUTHY + 0.018], [0.031, MOUTHY + 0.004], [0.037, MOUTHY - 0.01]]);
        if (z > EZ - 0.04) { const end = sm(0, 0.04, t.t) * sm(1, 0.8, t.t), f = Math.exp(-((t.d / 0.0026) ** 2)) * end, bulge = Math.exp(-(((t.d - 0.0045) / 0.0045) ** 2)) * (t.side < 0 ? 1 : 0) * end;
          h += K.folds * (-0.00055 * f + 0.0003 * bulge); dk += K.folds * (0.24 * f + 0.05 * Math.exp(-((t.d / 0.006) ** 2)) * end); } }
      // marionette lines: from the mouth's corners down toward the chin's sides
      { const t = seg(x, y, [[0.029, MOUTHY - 0.012], [0.031, MOUTHY - 0.024], [0.034, CHINY + 0.016]]);
        if (z > EZ - 0.05) { const end = sm(0, 0.15, t.t) * sm(1, 0.55, t.t), f = Math.exp(-((t.d / 0.0032) ** 2)) * end; h -= K.mar * 0.0002 * f; dk += K.mar * 0.05 * f; } }
      // fine vertical lines over the upper lip
      { const a = (1 - sm(0.016, 0.022, x)) * sm(MOUTHY + 0.004, MOUTHY + 0.007, y) * sm(MOUTHY + 0.015, MOUTHY + 0.01, y) * sm(EYEFRONT - 0.01, EYEFRONT, z);
        if (a > 0) { const l = Math.pow(Math.max(0, Math.sin(X * 900 + 3 * n1)), 10); h -= 0.00008 * a * l; dk += 0.04 * a * l; } }
      // the jowl: the jaw's line under the cheek a soft fold
      { const t = seg(x, y, [[0.033, CHINY + 0.004], [0.046, CHINY + 0.014], [0.058, CHINY + 0.03]]);
        const f = Math.exp(-((t.d / 0.0035) ** 2)) * sm(0, 0.2, t.t) * sm(1, 0.7, t.t); h -= K.jowl * 0.0003 * f; dk += K.jowl * 0.06 * f; }
      // a broad softness: low-frequency unevenness of older skin
      h += 0.00005 * (fbm(X, y, z, 140) - 0.5);
    }
    // the neck: three soft rings across its front
    if (y < CHINY - 0.01 && y > CHINY - 0.11 && z > 0.0 && head[i] < 0.95) { const ph = (y - (CHINY - 0.045)) / 0.016 + 0.4 * n1, k = Math.round(ph), f = ph - k;
      if (k >= -1 && k <= 1) { const w = sm(0.055, 0.03, x) * sm(0.0, 0.03, z), ln = Math.exp(-((f / 0.09) ** 2)) * w; h -= K.neckR * 0.00025 * ln; dk += K.neckR * 0.06 * ln; } } // (round 2b: K.neckR, the rings' depth)
    // (no crease right at the mouth's corners: the grin and the talk move them, and a line there read as a cut)
    if (face) { const mc = Math.hypot(x - 0.024, y - MOUTHY), keep = sm(0.004, 0.009, mc); h *= keep; dk *= keep; }
    H[i] = h * K.depth; DK[i] = dk * K.depth;
    // age spots: one candidate per 9 mm cell, a third of the cells, 1.5-4 mm across, soft-edged; on the temples, the
    // upper cheeks, the forehead and the backs of the hands (where the sun falls)
    if (K.spots) { const zone = face ? clamp(sm(EY - 0.04, EY - 0.02, y) * (sm(0.035, 0.05, x) + sm(EY + 0.025, EY + 0.04, y)) + 0.35) : 0;
      let hand = 0; if (!face && y < 1.1 && y > 0.6 && x > 0.15) hand = 0.5;
      const zz = Math.max(zone, hand); if (zz > 0) { const c = 0.009, cx = Math.floor(X / c), cy = Math.floor(y / c), cz = Math.floor(z / c); let sp = 0;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) { const hx = cx + a, hy = cy + b, hz = cz + e; if (h3(hx, hy, hz + 311) > 0.4) continue;
          const px = (hx + h3(hx, hy, hz + 1)) * c, py = (hy + h3(hx, hy, hz + 2)) * c, pz = (hz + h3(hx, hy, hz + 3)) * c, r = 0.0008 + 0.0013 * h3(hx, hy, hz + 4);
          const dd = Math.hypot(X - px, y - py, z - pz) / r; sp = Math.max(sp, (1 - sm(0.6, 1.15, dd + 0.25 * n2)) * (0.45 + 0.55 * h3(hx, hy, hz + 5))); }
        SP[i] = sp * zz; } }
  }
  // the colour: the creases darker, the spots a soft brown, the ground less saturated and less orange on the head and hands
  for (let i = 0; i < N2; i++) { const X = pos[i * 3]; if (Number.isNaN(X)) continue; const y = pos[i * 3 + 1];
    let r = lin(d[i * 4]), g = lin(d[i * 4 + 1]), b = lin(d[i * 4 + 2]); const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b; if (Y < 0.02) continue; // (hair paint)
    const ds = K.desat * (head[i] > 0.3 || y < 1.15 ? 1 : 0.6); r = Y + (r - Y) * (1 - ds); g = Y + (g - Y) * (1 - ds); b = Y + (b - Y) * (1 - ds);
    r *= K.cool[0]; g *= K.cool[1]; b *= K.cool[2];
    const k = 1 - clamp(DK[i], 0, 0.45); r *= k; g *= k * 0.985; b *= k * 0.98;
    const s = SP[i]; if (s > 0) { r *= 1 - 0.28 * s; g *= 1 - 0.38 * s; b *= 1 - 0.48 * s; }
    d[i * 4] = enc(r); d[i * 4 + 1] = enc(g); d[i * 4 + 2] = enc(b); }
  await setWebp(tex, d, S, S, 90);
  // the normal map: the height's slope (metres over the metres between neighbouring texels) added to the map's own
  if (nt) { const { data: nm, w: NW } = await rgba(nt); const k = NW / S; let n = 0;
    const P = (x, y) => { const j = (y * S + x) * 3; return [pos[j], pos[j + 1], pos[j + 2]]; };
    for (let yy = 1; yy < S - 1; yy++) for (let xx = 1; xx < S - 1; xx++) { const i = yy * S + xx; if (!H[i] && !H[i - 1] && !H[i + 1] && !H[i - S] && !H[i + S]) continue;
      const a = P(xx - 1, yy), bq = P(xx + 1, yy), c = P(xx, yy - 1), e = P(xx, yy + 1); if ([a, bq, c, e].some((q) => Number.isNaN(q[0]))) continue;
      const du = Math.hypot(bq[0] - a[0], bq[1] - a[1], bq[2] - a[2]) || 1e-4, dv = Math.hypot(e[0] - c[0], e[1] - c[1], e[2] - c[2]) || 1e-4;
      const sx = ((H[i + 1] - H[i - 1]) / du) * K.gain, sy = ((H[i + S] - H[i - S]) / dv) * K.gain;
      const X0 = Math.floor(xx * k), Y0 = Math.floor(yy * k); if (X0 >= NW || Y0 >= NW) continue; const j = (Y0 * NW + X0) * 4;
      let nx = nm[j] / 127.5 - 1, ny = nm[j + 1] / 127.5 - 1, nz = nm[j + 2] / 127.5 - 1; nx += -sx * nz; ny += sy * nz; const L = Math.hypot(nx, ny, nz) || 1;
      nm[j] = Math.round((nx / L * 0.5 + 0.5) * 255); nm[j + 1] = Math.round((ny / L * 0.5 + 0.5) * 255); nm[j + 2] = Math.round((nz / L * 0.5 + 0.5) * 255); n++; }
    await setWebp(nt, nm, NW, NW, 92); console.log('age: normal texels', n); }
  console.log('age: face texels', nf);
}

// the brows: an older man's, thinner and greyer (dark grey with silver through it, not a young man's dark brown), and
// the lashes a little sparser in tone
export async function browAgePass(doc, K = {}) {
  K = { col: [70, 68, 66], mix: 0.35, alpha: 0.9, ...K };
  const m = matOf(doc, 'brows'); if (!m) return; const t = m.getBaseColorTexture();
  if (t) { const { data, w, h } = await rgba(t); for (let i = 0; i < w * h; i++) { for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(data[i * 4 + c] * (1 - K.mix) + K.col[c] * K.mix); data[i * 4 + 3] = Math.round(data[i * 4 + 3] * K.alpha); }
    // (likeness round 3, K.grow: fuller brows: each hair's alpha spread K.grow texels across (vertically in the strip's
    // texture), at K.growK of its own strength, so the brow reads thicker and denser without new hairs' shapes)
    if (K.grow) { const A = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) A[i] = data[i * 4 + 3];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = A[y * w + x]; for (let d = -K.grow; d <= K.grow; d++) { const yy = y + d, xx = x + Math.round(d * 0.3); if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue; m = Math.max(m, A[yy * w + xx] * (K.growK ?? 0.8) * (1 - Math.abs(d) / (K.grow + 1) * 0.4)); }
        data[(y * w + x) * 4 + 3] = Math.min(255, Math.round(m)); } }
    await setWebp(t, data, w, h, 92); }
  const l = matOf(doc, 'lashes'); if (l) l.setBaseColorFactor([0.5, 0.49, 0.48, 1]);
  console.log('brows: greyer, thinner');
}

// (likeness round 3, the critic: round 2b's hand sculpt left hard kinks at the outer cheek and the zygoma and a pointed
// chin. It is gone; the outline now comes from MakeHuman's own targets alone, and this pass irons the face's broad
// planes: Taubin smoothing (a shrink-free Laplacian: lambda in, mu out) of the skin's points over the cheeks, the jaw,
// the temples and under the chin, masked off the eyes, the nose, the mouth and the ears, the mask itself soft-edged)
export function smoothFacePass(doc, K = {}) {
  K = { iters: 10, lam: 0.5, mu: -0.53, ...K };
  const { EY, EZ, EYEX, MOUTHY, CHINY } = LM;
  const sk = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getMaterial()?.getName() === 'skin');
  const P = sk[0].getAttribute('POSITION'), a = P.getArray().slice(), n = a.length / 3;
  // the points welded by position (uv seams split them)
  const key = new Map(), rep = new Int32Array(n); for (let v = 0; v < n; v++) { const k = `${Math.round(a[v * 3] * 1e5)},${Math.round(a[v * 3 + 1] * 1e5)},${Math.round(a[v * 3 + 2] * 1e5)}`; if (!key.has(k)) key.set(k, v); rep[v] = key.get(k); }
  const mask = new Float32Array(n);
  for (let v = 0; v < n; v++) { if (rep[v] !== v) continue; const x = a[v * 3], y = a[v * 3 + 1], z = a[v * 3 + 2], ax = Math.abs(x);
    if (y < CHINY - 0.05 || y > EY + 0.03 || z < EZ - 0.14) continue;
    let m = sm(CHINY - 0.05, CHINY - 0.02, y) * sm(EY + 0.03, EY + 0.012, y) * sm(EZ - 0.14, EZ - 0.1, z) * sm(0.075, 0.066, ax);
    const de = Math.hypot(ax - EYEX, y - EY, (z - EZ) * 0.7); m *= sm(0.018, 0.03, de);
    m *= 1 - (1 - sm(0.016, 0.026, ax)) * sm(MOUTHY + 0.004, MOUTHY + 0.012, y) * sm(EY, EY - 0.01, y); // the nose
    m *= 1 - (1 - sm(0.026, 0.036, ax)) * (1 - sm(0.012, 0.02, Math.abs(y - MOUTHY))); // the mouth
    mask[v] = m; }
  const nb = new Map(); for (const p of sk) { const I = p.getIndices().getArray(); for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const A = rep[I[t + e]], B = rep[I[t + (e + 1) % 3]]; if (!mask[A] && !mask[B]) continue;
    for (const [u, w] of [[A, B], [B, A]]) (nb.get(u) || nb.set(u, new Set()).get(u)).add(w); } }
  const step = (f) => { const o = a.slice(); for (const [v, s] of nb) { const m = mask[v]; if (!m) continue; let cx = 0, cy = 0, cz = 0; for (const w of s) { cx += o[w * 3]; cy += o[w * 3 + 1]; cz += o[w * 3 + 2]; } const k = s.size;
      for (const [c, q] of [[0, cx], [1, cy], [2, cz]]) a[v * 3 + c] = o[v * 3 + c] + f * m * (q / k - o[v * 3 + c]); } };
  const a0 = a.slice(); for (let i = 0; i < K.iters; i++) { step(K.lam); step(K.mu); }
  let peak = 0, moved = 0; for (let v = 0; v < n; v++) { const r = rep[v]; if (r !== v) for (let c = 0; c < 3; c++) a[v * 3 + c] = a[r * 3 + c]; const d = Math.hypot(a[v * 3] - a0[v * 3], a[v * 3 + 1] - a0[v * 3 + 1], a[v * 3 + 2] - a0[v * 3 + 2]); if (d > 1e-6) { moved++; peak = Math.max(peak, d); } }
  P.setArray(a); console.log('face smooth: points', moved, 'peak mm', (peak * 1000).toFixed(2));
}

// (likeness round 3, the critic: the head read too small and narrow for his shoulders. The head bone's scale (the forge's
// own headScale, kept for children at 1.015): everything it carries (skin, eyes, teeth, brows, hair, glasses) grows
// about the neck's top together, so the eyes stay in their sockets and the glasses on the nose)
export function headSizePass(doc, s = 1.08) {
  const h = doc.getRoot().listNodes().find((n) => n.getName() === 'head'); if (!h) throw new Error('no head node');
  const s0 = h.getScale()[0]; h.setScale([s, s, s]); console.log('head scale', s0, '->', s);
}

// (likeness round 3, the critic: the face read flat and waxy, no depth under the surface. glTF has no subsurface
// scattering; KHR_materials_sheen gives the skin a faint warm-red glow toward the light's grazing edge (where light
// scattered in skin comes back out reddened), the wrap-lighting tint Mog City's three.js draws natively; and the
// roughness map's spread widened a little round its own middle (skin is shinier on the nose and forehead, drier on the
// cheeks), so the sheen breaks up instead of a plastic sheet)
export async function skinScatterPass(doc, K = {}) {
  K = { col: [0.2, 0.07, 0.045], rough: 0.55, spread: 1.35, ...K };
  const { require } = await import('../young-hero/glb.mjs'); const { KHRMaterialsSheen } = require('@gltf-transform/extensions');
  const mat = matOf(doc, 'skin'), ext = doc.createExtension(KHRMaterialsSheen);
  mat.setExtension('KHR_materials_sheen', ext.createSheen().setSheenColorFactor(K.col).setSheenRoughnessFactor(K.rough));
  const mr = mat.getMetallicRoughnessTexture(); if (mr && K.spread !== 1) { const { data, w, h } = await rgba(mr); let s = 0, n = 0; for (let i = 0; i < w * h; i++) { s += data[i * 4 + 1]; n++; } const m = s / n;
    for (let i = 0; i < w * h; i++) data[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(m + (data[i * 4 + 1] - m) * K.spread))); await setWebp(mr, data, w, h, 90); }
  console.log('skin scatter: sheen', K.col.join(','), 'rough spread', K.spread);
}

// (likeness round 3, the critic: a dark spot on the neck in the webcam's 3/4 talk and the back views. It is the inside of
// the skin seen through two small holes each side of the neck behind the ears (4 and 7 points round), left where the
// forge's diet cut the skin under its stand collar. Each small boundary loop of the skin there (welded by position)
// closed with a fan, wound as its neighbours are)
export function neckHolesPass(doc, K = {}) {
  K = { y0: 1.45, y1: 1.58, maxLoop: 12, ...K };
  const ps = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).filter((p) => p.getMaterial()?.getName() === 'skin');
  const main = ps.sort((a, b) => b.getIndices().getCount() - a.getIndices().getCount())[0], a = main.getAttribute('POSITION').getArray(), n = a.length / 3;
  const key = new Map(), rep = new Int32Array(n); for (let v = 0; v < n; v++) { const k = `${Math.round(a[v * 3] * 1e5)},${Math.round(a[v * 3 + 1] * 1e5)},${Math.round(a[v * 3 + 2] * 1e5)}`; if (!key.has(k)) key.set(k, v); rep[v] = key.get(k); }
  const cnt = new Map(), dir = new Map(); for (const p of ps) { const I = p.getIndices().getArray(); for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) { const A = rep[I[t + e]], B = rep[I[t + (e + 1) % 3]], k = A < B ? A + ',' + B : B + ',' + A; cnt.set(k, (cnt.get(k) || 0) + 1); dir.set(k, [A, B]); } }
  const next = new Map(); for (const [k, c] of cnt) if (c === 1) { const [A, B] = dir.get(k); next.set(B, A); } // (the fill runs each open edge backwards)
  const seen = new Set(), add = []; let loops = 0;
  for (const s of next.keys()) { if (seen.has(s)) continue; const L = []; let v = s; while (v != null && !seen.has(v) && L.length < 400) { seen.add(v); L.push(v); v = next.get(v); }
    if (v !== s || L.length > K.maxLoop || L.length < 3) continue; const cy = L.reduce((q, w) => q + a[w * 3 + 1], 0) / L.length; if (cy < K.y0 || cy > K.y1) continue;
    for (let i = 1; i + 1 < L.length; i++) add.push(L[0], L[i], L[i + 1]); loops++; }
  if (add.length) { const I = main.getIndices(), old = I.getArray(), out = new old.constructor(old.length + add.length); out.set(old); out.set(add, old.length); I.setArray(out); }
  console.log('neck holes: loops closed', loops, 'triangles', add.length / 3);
}
