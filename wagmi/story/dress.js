// Mog City: a Mog's looks put on a loaded model, at run time (no asset rebuilt). Called by S.dress(id, root) only when
// the pack's look for that cast member differs from the default's, so Mog City's own models are never touched.
//   skin [r,g,b]    multiplied into the skin and hands materials (as the fights' repeated faces are, combat/index.js)
//   hair            the hair, hair shell, strands, brows and beard materials' colour (multiplied into their texture)
//   outfit          a tint over the clothes (and Fiona's puffer, Gears' cap)
//   suit / shirt    the Suits' clothes texture remapped: its dark, unsaturated texels (the suit) to `suit`, its pale ones
//                   (the shirt) to `shirt`, each keeping its texel's light and shade; once per texture and colours
//   build / height  the root's width (x, z) and height (y), multiplied into whatever scale it has
// Each material is cloned before it is changed (once per model: a material the model shares with others stays theirs).
import * as THREE from 'three/webgpu';

const SKIN = /^(skin|hands)$/, HAIR = /^(hair|hairShell|hairStrands|brows|beard|puff)$/, OUTFIT = /^(clothes|puffer|cap)$/;
const remaps = new Map();

export function dress(id, look, root) {
  if (!root || !look) return false;
  const own = new Map();
  const skin = look.skin && look.skin.some((v) => v !== 1) ? new THREE.Color(...look.skin) : null;
  const change = (m) => {
    const n = m.name || '';
    const wants = (skin && SKIN.test(n)) || (look.hair && HAIR.test(n)) || ((look.outfit || look.suit || look.shirt) && n === 'clothes') || (look.outfit && OUTFIT.test(n));
    if (!wants) return m;
    if (own.has(m)) return own.get(m);
    const c = m.clone(); own.set(m, c);
    if (skin && SKIN.test(n)) c.color.multiply(skin);
    if (look.hair && HAIR.test(n)) c.color.set(look.hair);
    if (look.outfit && OUTFIT.test(n)) c.color.multiply(new THREE.Color(look.outfit));
    if ((look.suit || look.shirt) && n === 'clothes' && c.map?.image) { const t = remap(c.map, look.suit, look.shirt); if (t) { c.map = t; c.needsUpdate = true; } }
    return c;
  };
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    o.material = Array.isArray(o.material) ? o.material.map(change) : change(o.material);
  });
  if ((look.build && look.build !== 1) || (look.height && look.height !== 1)) {
    const b = look.build || 1, h = look.height || 1;
    root.scale.set(root.scale.x * b, root.scale.y * h, root.scale.z * b);
  }
  return true;
}

// the clothes texture with the suit's and the shirt's texels recoloured (dark and unsaturated: the suit; pale and
// unsaturated: the shirt; anything with colour in it, a tie or a badge, left), each texel's lightness kept
function remap(map, suit, shirt) {
  const key = `${map.uuid}|${suit}|${shirt}`;
  if (remaps.has(key)) return remaps.get(key);
  let t = null;
  try {
    const img = map.image, c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height), px = d.data;
    const S = suit ? new THREE.Color(suit) : null, H = shirt ? new THREE.Color(shirt) : null;
    // (the suit's texels are lit around the suit colour by their own lightness against the suit's mean; the same for the shirt)
    let sumS = 0, nS = 0, sumH = 0, nH = 0;
    const cls = new Uint8Array(px.length / 4);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      const r = px[i], g = px[i + 1], b = px[i + 2], hi = Math.max(r, g, b), lo = Math.min(r, g, b), l = (hi + lo) / 2;
      if (hi - lo > 40) continue;
      if (l < 110) { cls[j] = 1; sumS += l; nS++; } else if (l > 150) { cls[j] = 2; sumH += l; nH++; }
    }
    const mS = nS ? sumS / nS : 1, mH = nH ? sumH / nH : 1;
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      const k = cls[j]; if (!k) continue;
      const C = k === 1 ? S : H; if (!C) continue;
      const l = (Math.max(px[i], px[i + 1], px[i + 2]) + Math.min(px[i], px[i + 1], px[i + 2])) / 2, f = l / (k === 1 ? mS : mH);
      // (sRGB bytes from the colour's sRGB components, shaded by the texel's light against its class's mean)
      const sr = C.clone().convertLinearToSRGB();
      px[i] = Math.min(255, sr.r * 255 * f); px[i + 1] = Math.min(255, sr.g * 255 * f); px[i + 2] = Math.min(255, sr.b * 255 * f);
    }
    x.putImageData(d, 0, 0);
    t = new THREE.CanvasTexture(c); t.colorSpace = map.colorSpace; t.flipY = map.flipY; t.wrapS = map.wrapS; t.wrapT = map.wrapT; t.anisotropy = 4;
  } catch (e) { console.warn('[story] suit colours', e); }
  remaps.set(key, t);
  return t;
}
