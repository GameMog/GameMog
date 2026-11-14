// Mog City story runner: a forged person's body finished for the close lens, at load (r8 people, after the owner's
// "smoother looking characters" on a hometown story's cast). A world's forged people are content-addressed GLBs that are
// never forged again, so what reads rough on them is finished here, for every forged and hand-built person the runner
// draws (cast.js build); Mog City's own people (Dan, Jane, Gears, Fiona, Mr. Big, the Suits) are never passed in.
//   polishBody(inner, opt) -> { cards, skin } (how many materials it finished; the body's materials replaced in place)
// Two things, each only where the GLB needs it (materials only: no geometry is touched, so it costs a few material
// copies at load and nothing per frame beyond the shaders' own work):
//   - the hair, brows, lashes and beard: drawn with alpha to coverage under the MSAA (the alpha test's hard cut drew every
//     card's edge as a saw) and their strand relief taken to a third and their sheen softened (it read as crumpled foil
//     under a set's key light).
//   - the skin, when the forge gave it no relief map of its own (a hand-built body has one and keeps it): graded as the
//     hand-built cast's daylight pass grades theirs (storykit scripts/handbuilt/daylight.mjs: the lit side a little
//     darker, the colour round its grey up, a faint warmth in the mid-tones, dark paint left be), in its shader, with a
//     warm sheen at the edges (Dan's numbers) and a faint relief from its own albedo's grain.
// opt.msaa: the graphics tier draws with MSAA (the low tier does not: there the alpha test stays a cut)
import * as THREE from 'three/webgpu';
import { materialColor, vec3, float, dot, smoothstep, max } from 'three/tsl';

export const POLISH = {
  hair: { normal: 0.35, rough: 0.74, spec: 0.55 },
  skin: { gain: 0.88, sat: 1.16, warm: [1.035, 0.985, 0.965], dark: 0.03, bump: 0.6, sheen: [0.06, 0.035, 0.025], sheenRough: 0.75 },
};

const CARD = /^(hair|hairShell|brows|lashes|beard)$/;
const done = new WeakMap();

// (?polish=0: every body as its GLB has it, for a look at the difference)
const OFF = typeof location !== 'undefined' && /[?&]polish=0(&|$)/.test(location.search);

export function polishBody(inner, { msaa = typeof window === 'undefined' || window.NYC?.quality?.antialias !== false, hair = true, skin = true } = {}) {
  const out = { cards: 0, skin: 0 };
  if (OFF) return out;
  const one = (m) => {
    if (!m || m.userData?.polished) return m;
    if (done.has(m)) return done.get(m);
    let n = m;
    if (hair && CARD.test(m.name || '') && m.alphaTest > 0) {
      n = m.clone(); out.cards++;
      if (msaa) n.alphaToCoverage = true;
      if (n.normalMap && n.normalScale) n.normalScale.multiplyScalar(POLISH.hair.normal);
      if (m.name === 'hair' || m.name === 'hairShell') n.roughness = Math.max(n.roughness, POLISH.hair.rough);
      if (n.specularIntensity != null) n.specularIntensity *= POLISH.hair.spec;
    } else if (skin && m.name === 'skin' && !m.normalMap && m.map) {
      n = gradedSkin(m); out.skin++;
    }
    if (n !== m) n.userData = { ...m.userData, polished: true };
    done.set(m, n);
    return n;
  };
  inner.traverse((o) => { if (o.isMesh && o.material) o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material); });
  return out;
}

// the skin as a physical node material: its own maps and numbers, the daylight grade on its colour (face.js shadeMouth
// keeps this colour node under the mouth's shade), the sheen, and the albedo's grain as a faint bump
const SKIN_KEYS = ['name', 'color', 'map', 'roughness', 'roughnessMap', 'metalness', 'metalnessMap', 'emissive', 'emissiveMap', 'emissiveIntensity', 'aoMap', 'aoMapIntensity',
  'alphaMap', 'alphaTest', 'transparent', 'opacity', 'side', 'envMapIntensity', 'vertexColors', 'depthWrite', 'depthTest', 'specularIntensity', 'specularColor'];
function gradedSkin(m) {
  const S = POLISH.skin, n = new THREE.MeshPhysicalNodeMaterial();
  for (const k of SKIN_KEYS) if (m[k] !== undefined && k in n) n[k] = m[k] && m[k].isColor ? m[k].clone() : m[k];
  n.sheen = 1; n.sheenColor = new THREE.Color(...S.sheen); n.sheenRoughness = S.sheenRough;
  if (S.bump > 0) { n.bumpMap = m.map; n.bumpScale = S.bump; }
  const c = materialColor.rgb, Y = dot(c, vec3(0.2126, 0.7152, 0.0722)), t = smoothstep(S.dark, S.dark * 3, Y);
  const gn = t.mul(S.gain - 1).add(1), s = t.mul(S.sat - 1).add(1), Y2 = Y.mul(gn), mid = smoothstep(0.35, 0.7, Y).mul(-0.5).add(1);
  const warm = vec3(...S.warm).sub(1).mul(t.mul(mid)).add(1);
  n.colorNode = max(c.mul(gn).sub(Y2).mul(s).add(Y2), float(0)).mul(warm);
  return n;
}
