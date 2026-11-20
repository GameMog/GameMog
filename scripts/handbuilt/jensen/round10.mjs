// Jensen, hair round 1 (caricature round 10, 19 Nov; the critic, stuck at 5/10 for five rounds on the hair: "a sculpted
// shell with grooves, a helmet"): the technique changed from sculpted clumps to alpha-tested hair cards (haircards.mjs).
//   R10.shell   clumps.mjs's dome only (no locks, no wisps), lower (shellK) and a darker cool grey: the mass under the
//               cards, which shows only in the gaps between them (the lowlights underneath) and covers the scalp
//   R10.cards   the card groom (haircards.mjs)
const PARTS = new URL('../../../storykit/handbuilt/jensen/parts/', import.meta.url).pathname;
export const R10 = {
  shell: { back: [], clumps: [], locks: [], flyaways: 0, shellK: 0.55, tone: [0.3, 0.31, 0.35], low: [0.12, 0.13, 0.16], topHi: 0, quiffDark: 0, depthLow: 0, sideLow: 0.3, aniso: 0, rough: 0.8 },
  cards: { atlas: PARTS + 'hair-strands.webp' },
  // (b) the browline: a gentler, visible arch over each lens (the bar's rise 3.4 -> 5 mm at the lens's middle), the
  // frames about 6% larger (the front's scale about the bridge 1.12 -> 1.19)
  glassesBig: { big: 1.19 },
  glasses: { arc: 0.005 },
  // (c) the jacket: a deeper black (the leather's albedo x 0.72), its topstitching kept as made
  leather: { black: 0.72 },
};
// (c) the leather a deeper black: its base colour factor scaled (the texture's grain and stitching untouched)
export function leatherBlackPass(doc, K = {}) {
  K = { ...R10.leather, ...K };
  const m = doc.getRoot().listMaterials().find((q) => q.getName() === 'leather'); if (!m) return;
  const f = m.getBaseColorFactor(); m.setBaseColorFactor([f[0] * K.black, f[1] * K.black, f[2] * K.black, f[3]]);
  console.log('leather black: factor', m.getBaseColorFactor().map((v) => +v.toFixed(3)).join(','));
}

// (a) the critic: a grey-white slab in the "oh" and "ff" visemes. It is the lower teeth: their mesh stands 2 cm tall (the
// teeth and the gum below them), lit as a grey wall once the jaw drops. Its texture (the teeth's own atlas: the lower row
// in v 0.46-0.78) now keeps only the biting edge as tooth (a soft ivory, 3 mm), the rest fading into the mouth's dark warm
// cavity; the material rougher (no grey sheen across it). The upper teeth are untouched.
import { setWebp, sharp } from '../young-hero/glb.mjs';
export async function mouthCavityPass(doc, K = {}) {
  K = { edge: [0.47, 0.52], dark: [0.54, 0.585], tooth: [182, 172, 152], cave: [16, 9, 8], rough: 0.9, ...K };
  const m = doc.getRoot().listMaterials().find((x) => x.getName() === 'teethLow'); if (!m) { console.log('mouth cavity: no teethLow'); return; }
  const tex = m.getBaseColorTexture(), shared = doc.getRoot().listMaterials().filter((x) => x.getBaseColorTexture() === tex).length > 1;
  const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), W = info.width, H = info.height;
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let n = 0;
  for (let y = 0; y < H; y++) { const v = (y + 0.5) / H; if (v < 0.44 || v > 0.8) continue;
    const top = ss(K.edge[0] - 0.02, K.edge[0], v) * (1 - ss(K.edge[1], K.dark[0], v)), cave = ss(K.edge[1], K.dark[1], v);
    for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (data[i + 3] < 8) continue;
      // (the tooth's own shading kept as a ratio on the edge; below it the cavity)
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3 / 70;
      for (let c = 0; c < 3; c++) { const t0 = Math.min(255, K.tooth[c] * Math.min(1.15, 0.75 + 0.3 * lum)); data[i + c] = Math.round(data[i + c] * (1 - top - cave) + t0 * top + K.cave[c] * cave); } n++; } }
  if (shared) { const t2 = doc.createTexture('teethLow-cavity'); m.setBaseColorTexture(t2); await setWebp(t2, data, W, H, 90, 4); } else await setWebp(tex, data, W, H, 90, 4);
  m.setRoughnessFactor(K.rough); m.setMetallicFactor(0);
  console.log('mouth cavity: texels', n, shared ? '(own copy)' : '');
}
