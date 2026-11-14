// the DZ shared texture kit: one base-colour atlas and one ORM atlas for every Daniel Zhabotinsky car (all of them share
// the same kit textures), cleaned (no maker-like lettering), plus the two liveries (taxi, police) cleaned
import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';

// the kit's textures by the sha1 (10 hex) of their image
export const KIT = {
  lights: { base: 'e49253c255', orm: null },
  bottom: { base: '70ace1e46c', orm: '5e4c4c4968' },
  bottomLT: { base: '168074e172', orm: '4ba1725102' },
  int1: { base: '505b38d0ff', orm: '1ed083fb47' },
  int2: { base: 'd76a87ecbc', orm: 'd799a07bdb' },
  tire: { base: '25848d5dde', orm: '6633bed69f' },
  plate: { base: '2cdae8eccd', orm: null },
};
export const LIVERY = { taxi: 'e5a4e019d2', police: '8ac753b829' };
// the atlas: 2048 x 1024 (hi) and 1024 x 512 (lo), tiles in hi pixels; ORM at half the base's size
export const ATLAS = { W: 2048, H: 1024 };
export const TILES = {
  lights: { x: 0, y: 0, w: 1024, h: 1024 },
  bottom: { x: 1024, y: 0, w: 512, h: 512 },
  bottomLT: { x: 1536, y: 0, w: 512, h: 512 },
  tire: { x: 1024, y: 512, w: 512, h: 512 },
  int1: { x: 1536, y: 512, w: 256, h: 256 },
  int2: { x: 1792, y: 512, w: 256, h: 256 },
  plate: { x: 1536, y: 768, w: 256, h: 64 },     // (the blank plate backings: the plate texture's lowest quarter)
  white: { x: 1792, y: 768, w: 256, h: 256 },    // (paint: its colour is the car's own)
};
export const PAD = 4;
// a uv in a tile -> the atlas uv (inset by PAD px so filtering stays inside the tile)
export function atlasUV(tile, u, v) {
  const t = TILES[tile];
  return [(t.x + PAD + u * (t.w - 2 * PAD)) / ATLAS.W, (t.y + PAD + v * (t.h - 2 * PAD)) / ATLAS.H];
}

const raw = async (file, w, h) => {
  const img = sharp(file).removeAlpha().resize(w, h, { fit: 'fill', kernel: 'lanczos3' });
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  return data;   // RGB
};
const rawFull = async (file) => { const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };

// fill rects [x0, y0, x1, y1] (in the image's own pixels) with the median colour of a ring round each, plus a soft edge
export function fillRects(img, rects, ring = 6) {
  const { data, w, h } = img;
  for (const [x0, y0, x1, y1, force] of rects) {
    let col = force;
    if (!col) {
      const rs = [], gs = [], bs = [];
      for (let y = Math.max(0, y0 - ring); y < Math.min(h, y1 + ring); y++) for (let x = Math.max(0, x0 - ring); x < Math.min(w, x1 + ring); x++) {
        if (x >= x0 && x < x1 && y >= y0 && y < y1) continue;
        const o = (y * w + x) * 3; rs.push(data[o]); gs.push(data[o + 1]); bs.push(data[o + 2]);
      }
      const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
      col = [med(rs), med(gs), med(bs)];
    }
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * w + x) * 3; data[o] = col[0]; data[o + 1] = col[1]; data[o + 2] = col[2]; }
  }
}
// the tyre's sidewall: each ring between r0 and r1 round (cx, cy) replaced by its median colour (the raised lettering,
// a maker-like name, gone; the sidewall's shading by radius kept)
export function cleanSidewall(img, cx, cy, r0, r1) {
  const { data, w } = img;
  for (let r = r0; r <= r1; r++) {
    const n = Math.max(16, Math.round(2 * Math.PI * r)), vals = [[], [], []];
    for (let k = 0; k < n; k++) { const a = (k / n) * 2 * Math.PI, x = Math.round(cx + r * Math.cos(a)), y = Math.round(cy + r * Math.sin(a)); const o = (y * w + x) * 3; for (let c = 0; c < 3; c++) vals[c].push(data[o + c]); }
    const med = vals.map((a) => a.sort((p, q) => p - q)[Math.floor(a.length * 0.4)]);
    for (let k = 0; k < n * 2; k++) { const a = (k / (n * 2)) * 2 * Math.PI; for (const dr of [-0.5, 0, 0.5]) { const x = Math.round(cx + (r + dr) * Math.cos(a)), y = Math.round(cy + (r + dr) * Math.sin(a)); const o = (y * w + x) * 3; for (let c = 0; c < 3; c++) data[o + c] = med[c]; } }
  }
}
const toSharp = (img) => sharp(img.data, { raw: { width: img.w, height: img.h, channels: 3 } });

// crops for the owner (before / after), each region of an image
export async function crops(beforeFile, afterImg, regions, outDir, tag) {
  mkdirSync(outDir, { recursive: true });
  for (const [i, [x0, y0, x1, y1]] of regions.entries()) {
    const w = x1 - x0, h = y1 - y0;
    const a = await sharp(beforeFile).removeAlpha().extract({ left: x0, top: y0, width: w, height: h }).png().toBuffer();
    const b = await toSharp(afterImg).extract({ left: x0, top: y0, width: w, height: h }).png().toBuffer();
    const s = Math.min(3, 700 / w);
    const W = Math.round(w * s), H = Math.round(h * s);
    const ra = await sharp(a).resize(W, H, { kernel: 'nearest' }).toBuffer(), rb = await sharp(b).resize(W, H, { kernel: 'nearest' }).toBuffer();
    await sharp({ create: { width: W * 2 + 10, height: H, channels: 3, background: '#ff00ff' } }).composite([{ input: ra, left: 0, top: 0 }, { input: rb, left: W + 10, top: 0 }]).jpeg({ quality: 88 }).toFile(`${outDir}/${tag}-${i}.jpg`);
  }
}

// ---- the kit atlases -------------------------------------------------------------------------------------------
// texDir: the extracted kit images (<sha>.png|jpg); out: the atlas files; cropDir: before/after crops
export async function buildKit(texDir, out, cropDir, find) {
  mkdirSync(out, { recursive: true });
  const f = (sha) => find(texDir, sha);
  // cleaned sources at full size
  const lights = await rawFull(f(KIT.lights.base));
  // (the glass templates' labels, top left: FRONT DOOR, REAR DOOR, C-PILLAR, GLASS REAR, GLASS FRONT; harmless, gone)
  const labels = [[10, 4, 140, 28], [425, 4, 545, 28], [840, 4, 935, 28], [10, 334, 140, 358], [10, 666, 145, 692]];
  fillRects(lights, labels.map((r) => [...r, [0, 0, 0]]));
  await crops(f(KIT.lights.base), lights, [[0, 0, 1024, 40], [0, 330, 400, 362], [0, 660, 400, 696]], cropDir, 'kit-lights-labels');
  const tire = await rawFull(f(KIT.tire.base));
  // (the sidewall's maker-like name and lettering: the tyre's rings, centre found below, median per ring)
  cleanSidewall(tire, TIRE_C[0], TIRE_C[1], TIRE_R[0], TIRE_R[1]);
  await crops(f(KIT.tire.base), tire, [[0, 180, 860, 1024]], cropDir, 'kit-tyre-sidewall');
  const bottomLT = await rawFull(f(KIT.bottomLT.base));
  // ('Void' lettering on a panel, left middle)
  fillRects(bottomLT, [[0, 380, 60, 410, [0, 0, 0]]]);
  await crops(f(KIT.bottomLT.base), bottomLT, [[0, 360, 120, 420]], cropDir, 'kit-bottomlt-void');
  const plate = await rawFull(f(KIT.plate.base));
  const clean = { lights, tire, bottomLT };
  for (const [tag, scale] of [['', 1], ['-lo', 0.5]]) {
    const W = ATLAS.W * scale, H = ATLAS.H * scale, comp = [];
    const tileBuf = async (name, img, region = null) => {
      const t = TILES[name], w = Math.round(t.w * scale), h = Math.round(t.h * scale), p = Math.round(PAD * scale);
      let s = toSharp(img); if (region) s = toSharp(img).extract(region);
      // (the inner part scaled to fit, its edge pixels repeated into the pad)
      const inner = await s.resize(w - 2 * p, h - 2 * p, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
      const padded = await sharp(inner).extend({ top: p, bottom: p, left: p, right: p, extendWith: 'copy' }).png().toBuffer();
      comp.push({ input: padded, left: Math.round(t.x * scale), top: Math.round(t.y * scale) });
    };
    await tileBuf('lights', clean.lights);
    await tileBuf('bottom', await rawFull(f(KIT.bottom.base)));
    await tileBuf('bottomLT', clean.bottomLT);
    await tileBuf('tire', clean.tire);
    await tileBuf('int1', await rawFull(f(KIT.int1.base)));
    await tileBuf('int2', await rawFull(f(KIT.int2.base)));
    await tileBuf('plate', plate, { left: 0, top: 384, width: 512, height: 128 });
    comp.push({ input: { create: { width: Math.round(256 * scale), height: Math.round(256 * scale), channels: 3, background: '#ffffff' } }, left: Math.round(1792 * scale), top: Math.round(768 * scale) });
    await sharp({ create: { width: W, height: H, channels: 3, background: '#202020' } }).composite(comp).webp({ quality: 86, effort: 6 }).toFile(`${out}/kit${tag}.webp`);
    // ORM at half the base's size: R occlusion, G roughness, B metalness
    const oS = scale * 0.5, oW = ATLAS.W * oS, oH = ATLAS.H * oS, ocomp = [];
    const ormTile = async (name, sha, constant = null) => {
      const t = TILES[name], w = Math.round(t.w * oS), h = Math.round(t.h * oS);
      let buf;
      if (sha) buf = await sharp(f(sha)).removeAlpha().resize(w, h, { fit: 'fill' }).png().toBuffer();
      else buf = await sharp({ create: { width: w, height: h, channels: 3, background: { r: constant[0], g: constant[1], b: constant[2] } } }).png().toBuffer();
      ocomp.push({ input: buf, left: Math.round(t.x * oS), top: Math.round(t.y * oS) });
    };
    await ormTile('lights', null, [255, 30, 0]);
    await ormTile('bottom', KIT.bottom.orm);
    { // (its metal channel carries the same 'Void' lettering: cleared to plain black there too)
      const t = TILES.bottomLT, w = Math.round(t.w * oS), h = Math.round(t.h * oS);
      const img = await rawFull(f(KIT.bottomLT.orm)); fillRects(img, [[0, 380, 60, 410, [255, 255, 0]]]);
      ocomp.push({ input: await toSharp(img).resize(w, h, { fit: 'fill' }).png().toBuffer(), left: Math.round(t.x * oS), top: Math.round(t.y * oS) });
    }
    await ormTile('tire', KIT.tire.orm);
    await ormTile('int1', KIT.int1.orm);
    await ormTile('int2', KIT.int2.orm);
    await ormTile('plate', null, [255, 110, 0]);
    await ormTile('white', null, [255, 70, 140]);
    await sharp({ create: { width: oW, height: oH, channels: 3, background: { r: 255, g: 200, b: 0 } } }).composite(ocomp).webp({ quality: 88, effort: 6 }).toFile(`${out}/kit-orm${tag}.webp`);
  }
}
// (the tyre texture's wheel: measured below in findTire, set before buildKit)
export let TIRE_C = [420, 612], TIRE_R = [286, 412];
export function setTire(c, r) { TIRE_C = c; TIRE_R = r; }

// ---- the liveries --------------------------------------------------------------------------------------------------
export async function buildLiveries(texDir, out, cropDir, find) {
  // the taxi: every sticker off its doors and flanks (a company name, slogans, ads); the fare card and checks kept
  const taxi = await rawFull(find(texDir, LIVERY.taxi));
  const TAXI_RECTS = [
    [1108, 786, 1292, 868], [384, 408, 470, 452], [636, 396, 806, 472], [800, 1118, 900, 1162], [1950, 1392, 2000, 1486], [1110, 1786, 1292, 1866],
  ];
  fillRects(taxi, TAXI_RECTS, 8);
  await crops(find(texDir, LIVERY.taxi), taxi, TAXI_RECTS.map(([a, b, c, d]) => [Math.max(0, a - 40), Math.max(0, b - 30), Math.min(2048, c + 40), Math.min(2048, d + 30)]), cropDir, 'livery-taxi');
  // the police: a plain POLICE livery: the unit number, the slogan, the flags, the 911 panel and the tag line off
  const pol = await rawFull(find(texDir, LIVERY.police));
  const POL_RECTS = [
    [384, 92, 490, 120], [810, 730, 910, 768], [930, 694, 1046, 734], [570, 816, 630, 858], [1562, 810, 1678, 870],
    [570, 1788, 630, 1830], [820, 1890, 916, 1930], [934, 1918, 1070, 1962], [1572, 1780, 1688, 1836],
  ];
  fillRects(pol, POL_RECTS, 6);
  await crops(find(texDir, LIVERY.police), pol, POL_RECTS.map(([a, b, c, d]) => [Math.max(0, a - 40), Math.max(0, b - 30), Math.min(2048, c + 40), Math.min(2048, d + 30)]), cropDir, 'livery-police');
  for (const [name, img] of [['taxi', taxi], ['police', pol]]) {
    await toSharp(img).resize(1024, 1024, { kernel: 'lanczos3' }).webp({ quality: 86, effort: 6 }).toFile(`${out}/livery-${name}.webp`);
    await toSharp(img).resize(512, 512, { kernel: 'lanczos3' }).webp({ quality: 84, effort: 6 }).toFile(`${out}/livery-${name}-lo.webp`);
  }
}
