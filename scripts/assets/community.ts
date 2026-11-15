/**
 * people4 (14 Nov 2026, the owner's approved sources 1 and 2): two small library assets the Character Forge reads, built
 * apart from the people pack so the pack and the base humans stay exactly as they are.
 *
 * - human-skins-community: the MakeHuman community's middle-aged and old skins (CC0), on MakeHuman's own body uvs, a
 *   drop-in beside the pack's: OnlyTheGhosts' old and middle-aged Eurasian woman and old Eurasian man, Mindfront's
 *   middle-aged African man, jartur69's old and middle-aged Slavic man (both painted with a beard: the forge takes them
 *   only for a bearded man). Each 2048 px, as the pack's. Only these six are taken from the two packs (the packs also hold
 *   young, made-up and tattooed skins, which are not approved for use).
 * - hair-strand-cards: PolytricityLtd's "Hair Cards_FBX" strand atlas (CC BY 4.0), its 4K maps resampled into the
 *   forge's card strip (8 columns, two cells each, root at each cell's top): A the strands' mask, R their tone
 *   variation, G the root, B the depth. The atlas's printed tool credit (below the strips) is not taken.
 */
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const CACHE = 'assets-src/cache';

export const COMMUNITY_SKINS: Record<string, { source: string; file: string; fill?: boolean; note: string }> = {
  'eurasian-old-f': { source: 'makehuman-community-skins01', file: 'old_eurasian_female_diffuse.png', note: 'OnlyTheGhosts, old Eurasian female' },
  'eurasian-middle-f': { source: 'makehuman-community-skins01', file: 'middleage_eurasian_female_diffuse.png', note: 'OnlyTheGhosts, middle-aged Eurasian female' },
  'eurasian-old-m': { source: 'makehuman-community-skins02', file: 'old_eurasian_male_diffuse.png', note: 'OnlyTheGhosts, old Eurasian male' },
  // (its texture is opaque black outside the body's islands: filled with the skin's own colour, so a mip never bleeds
  // a dark line along a seam)
  'african-middle-m': { source: 'makehuman-community-skins02', file: 'skin_male_african_middleage.png', fill: true, note: 'Mindfront, middle-aged African male' },
  'slavic-old-m': { source: 'makehuman-community-skins02', file: 'Jartur_old_Slavic_Male_with_Genitals_and_beard_lsdif.png', note: 'jartur69, old Slavic male (painted beard)' },
  'slavic-middle-m': { source: 'makehuman-community-skins02', file: 'Jartur_mid_old_Slavic_Male_with_Genitals_and_Beard_lsdif_lighter.png', note: 'jartur69, middle-aged Slavic male (painted beard)' },
};

export async function buildCommunitySkins(dir: string) {
  const sharp = (await import('sharp')).default;
  mkdirSync(dir, { recursive: true });
  const out: Record<string, string> = {};
  for (const [k, s] of Object.entries(COMMUNITY_SKINS)) {
    const src = join(CACHE, s.source, s.file);
    let img = sharp(src).resize(2048, 2048).removeAlpha();
    if (s.fill) {
      // (push-pull: the skin's mean colour at 64 px over the masked-out texels, the body's own texels kept)
      const { data, info } = await sharp(src).resize(2048, 2048).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const N = info.width * info.height, M = new Uint8Array(N), P = Buffer.alloc(N * 3);
      for (let i = 0; i < N; i++) { const on = data[i * 3] + data[i * 3 + 1] + data[i * 3 + 2] > 24; M[i] = on ? 255 : 0; for (let c = 0; c < 3; c++) P[i * 3 + c] = on ? data[i * 3 + c] : 0; }
      const S = 64, ps = await sharp(P, { raw: { width: 2048, height: 2048, channels: 3 } }).resize(S, S, { kernel: 'cubic' }).raw().toBuffer();
      const ms = await sharp(Buffer.from(M), { raw: { width: 2048, height: 2048, channels: 1 } }).resize(S, S, { kernel: 'cubic' }).raw().toBuffer();
      let mr = 0, mg = 0, mb = 0, mn = 0; for (let i = 0; i < N; i++) if (M[i]) { mr += data[i * 3]; mg += data[i * 3 + 1]; mb += data[i * 3 + 2]; mn++; }
      const mean = [mr / mn, mg / mn, mb / mn], F = Buffer.alloc(S * S * 3);
      for (let i = 0; i < S * S; i++) { const w = ms[i] / 255; for (let c = 0; c < 3; c++) F[i * 3 + c] = w > 0.05 ? Math.min(255, ps[i * 3 + c] / w) : mean[c]; }
      const fill = await sharp(F, { raw: { width: S, height: S, channels: 3 } }).resize(2048, 2048, { kernel: 'cubic' }).raw().toBuffer();
      for (let i = 0; i < N; i++) if (!M[i]) for (let c = 0; c < 3; c++) data[i * 3 + c] = fill[i * 3 + c];
      img = sharp(data, { raw: { width: 2048, height: 2048, channels: 3 } });
    }
    await img.jpeg({ quality: 84, mozjpeg: true }).toFile(join(dir, `skin-${k}.jpg`));
    out[k] = `skin-${k}.jpg`;
  }
  writeFileSync(join(dir, 'asset.json'), JSON.stringify({ format: 'gmasset/1', kind: 'human-skins', uv: 'makehuman-hm08', skins: out, notes: Object.fromEntries(Object.entries(COMMUNITY_SKINS).map(([k, s]) => [k, s.note])) }));
  return Object.keys(out);
}

// the strips taken (x from, x to, y root, y tip, in the 4096 px atlas, found by its mask: the strips' columns, each
// strip's own rows, the tool credit below them left out) into the forge's 16 cells: column c, half h
const STRIPS: [number, number, number, number][] = [
  [81, 467, 120, 3898], [524, 835, 132, 3834], [888, 1197, 137, 3850], [1254, 1547, 132, 3905], [1615, 1896, 160, 3876],
  [1986, 2255, 151, 3756], [2337, 2573, 150, 2600], [2700, 2968, 141, 2500], [3070, 3343, 168, 2300], [3436, 3681, 173, 2100],
];
const CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 2, 3, 4, 5, 6, 7, 8, 9];

export async function buildHairStrandCards(dir: string) {
  const sharp = (await import('sharp')).default;
  mkdirSync(dir, { recursive: true });
  const src = (f: string) => join(CACHE, 'polytricity-hair-cards', f);
  const W = 512, H = 2048, CW = W / 8, CH = H / 2, out = Buffer.alloc(W * H * 4);
  const read = async (f: string, ch: number) => { const { data, info } = await sharp(src(f)).raw().toBuffer({ resolveWithObject: true }); return { data, W: info.width, C: info.channels, ch }; };
  const mask = await read('HSD_Skecthfab_Mask.png', 0), rgb = await read('HSD_Skecthfab_RGBMask.png', 0), depth = await read('HSD_Skecthfab_Depth.png', 0);
  // (a box filter over the source texels a cell texel covers: the strands are finer than a cell texel)
  const box = (m: { data: Buffer; W: number; C: number }, c: number, x0: number, x1: number, y0: number, y1: number) => {
    let s = 0, n = 0; for (let y = Math.floor(y0); y < Math.max(Math.floor(y0) + 1, Math.ceil(y1)); y++) for (let x = Math.floor(x0); x < Math.max(Math.floor(x0) + 1, Math.ceil(x1)); x++) { s += m.data[(y * m.W + x) * m.C + c]; n++; } return s / n; };
  CELLS.forEach((si, cell) => {
    const [sx0, sx1, sy0, sy1] = STRIPS[si], c = cell % 8, h = Math.floor(cell / 8);
    // (the cell's own margins, as the cards' uvs keep them: 0.4 % of a column either side, 1 % of a half at the root)
    const cx0 = c * CW + 1, cx1 = (c + 1) * CW - 1, cy0 = h * CH + Math.round(0.02 * CH), cy1 = (h + 1) * CH - 2;
    for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) {
      const u0 = sx0 + (x - cx0) / (cx1 - cx0) * (sx1 - sx0), u1 = sx0 + (x + 1 - cx0) / (cx1 - cx0) * (sx1 - sx0);
      const v0 = sy0 + (y - cy0) / (cy1 - cy0) * (sy1 - sy0), v1 = sy0 + (y + 1 - cy0) / (cy1 - cy0) * (sy1 - sy0), i = (y * W + x) * 4;
      out[i] = Math.round(box(rgb, 0, u0, u1, v0, v1)); out[i + 1] = Math.round(box(rgb, 1, u0, u1, v0, v1)); out[i + 2] = Math.round(box(depth, 0, u0, u1, v0, v1));
      out[i + 3] = Math.round(box(mask, 0, u0, u1, v0, v1));
    }
  });
  await sharp(out, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(join(dir, 'strands.png'));
  writeFileSync(join(dir, 'asset.json'), JSON.stringify({ format: 'gmasset/1', kind: 'hair-cards', file: 'strands.png', width: W, height: H, columns: 8, halves: 2,
    channels: { r: 'tone variation', g: 'root (1 at the root)', b: 'depth', a: 'strand mask' } }));
}
