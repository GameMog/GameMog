// Mog City story runner: a forged person's body finished for the close lens, at load (r8 people, after the owner's
// "smoother looking characters" on a hometown story's cast; people2, after the director's review of r8: "barely shows",
// the temples' saw-toothed hairline, the white collar shards, waxy skin, crumpled-foil hair). A world's forged people are
// content-addressed GLBs that are never forged again, so what reads rough on them is finished here, for every forged and
// hand-built person the runner draws (cast.js build, pack.js the forged hero); Mog City's own people (Dan, Jane, Gears,
// Fiona, Mr. Big, the Suits) are never passed in. Mr. Big and Dan are the bar:
//   polishBody(inner, opt) -> { cards, skin, hair, eyes, cloth } (what it finished; materials replaced in place, a few
//   attributes added to the hair's and the skin's geometry, the inner cloth's weights near an outer layer's collar)
// What it does, each only where the GLB needs it:
//   - the hair: drawn as hair is, not as a helmet of foil cards. Its light comes from the shape of the head of hair (each
//     card's normal turned most of the way to the hair's volume: a cap over the skull, a fall below it), its sheen from
//     strands (two Kajiya-Kay bands along the hair's flow, a white one and one in the hair's own colour, Dan's soft
//     sheen) instead of a mirror on every card, the source's baked mottle softened, and its cut edges soft (alpha to
//     coverage on the texture's own alpha under the MSAA, the shadow still cut as before).
//   - the brows, lashes and beard: the same soft edges.
//   - the skin, when it has no relief map of its own (a hand-built body has one and keeps it): the forge paints the scalp
//     on the skin, and its line at the temples came out as a saw (the strand noise left long teeth on bare skin); here
//     the line is drawn again, soft, from a blurred copy (the teeth's paint averaged into a graded edge between the hair's
//     and the skin's own colours, read off the same texture), only in the band where skin meets the scalp's paint and
//     never over the brows, eyes or a beard. Then skin, not wax: pores and fine grain (a small tiling relief made here,
//     once), the T-zone a touch glossier than the cheeks and the pores rougher, the specular of skin (F0 ~0.03), light
//     wrapping a little red past the shadow's edge (skin's scatter), the hand-built cast's daylight grade (r8) and Dan's
//     warm sheen.
//   - the eyes: wet, as Mr. Big's (a clear coat, so a set's key and the sky show in them as catchlights).
//   - a jacket or coat the forge cut through before r8's fix (published, never forged again: Mara's): its sleeves kept, its
//     shreds dropped (mendCoat).
//   - the cloth: an inner garment's points within reach of an outer layer's collar or lapels move with that layer's
//     points (their skin weights), so a turned head or a raised arm doesn't open a gap between a shirt's collar and the
//     jacket's over it. (The forge's own cut of a shirt collar under a jacket's leaves a few corner flecks in the GLB's
//     geometry; those stay as forged.)
// opt.msaa: the graphics tier draws with MSAA (the low tier does not: there the alpha test stays a cut)
// (?polish=0: every body as its GLB has it; ?polish=r8: r8's materials only, for a before and after)
import * as THREE from 'three/webgpu';
import {
  Fn, If, materialColor, texture, uv, uniform, attribute, vec2, vec3, vec4, float, dot, smoothstep, max, mix,
  normalize, normalView, normalViewGeometry, positionViewDirection, tangentView, normalMap, BRDF_Lambert, diffuseContribution,
} from 'three/tsl';

/* ------------------------------------------------- the shared detail -- */
// (people4) the scanned tiles every finished body shares (assets/people/detail: RG a normal's x and y, OpenGL's y up, B
// the roughness; the wrinkles a plain normal map on MakeHuman's face uvs). Loaded once, the first body that needs them;
// the graphics tier's high draws the full size, the phone and low tiers half (?detail=0: none, for a before and after)
const DETAIL = new URL('../../assets/people/detail/', import.meta.url).href;
const DMODE = typeof location === 'undefined' ? '' : (/[?&]detail=([a-z0-9]+)/.exec(location.search) || [])[1] || '';
const tiles = new Map(), pending = [];
const bigTier = () => typeof window === 'undefined' || (window.NYC?.quality?.tier || 'high') === 'high';
function tile(name, hi, lo, wrap = true) {
  const f = `${name}-${bigTier() ? hi : lo}.jpg`;
  if (tiles.has(f)) return tiles.get(f);
  let done0; pending.push(new Promise((r) => (done0 = r)));
  const t = new THREE.TextureLoader().load(DETAIL + f, () => done0(), undefined, () => done0());
  Object.assign(t, { flipY: false, colorSpace: THREE.NoColorSpace, anisotropy: 4, name: 'p4-' + name,
    wrapS: wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping, wrapT: wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping });
  tiles.set(f, t);
  return t;
}
// (for a page that waits for its bodies to be drawn as they will be: every tile asked for so far, loaded or failed)
export const polishReady = () => Promise.all(pending);

export const POLISH = {
  // KK: [primary exponent, primary strength, secondary exponent, secondary strength (x the hair's colour), shift]
  hair: { volume: 0.72, mottle: 0.3, crisp: 0.3, kk: [140, 0.03, 30, 0.14, 0.1], strand: 0.8, wrap: 0.3, rough: 0.78, spec: 0.25, soft: 0.2, cut: 0.5,
    // (people7: a light head of hair's: mottle, crisp, the sky's specular, the strands in the sheen, the sheen itself)
    light: { mottle: 0.6, crisp: -0.35, spec: 0.5, strand: 0.25, kk: 0.45 } },
  skin: {
    gain: 0.88, sat: 1.08, warm: [1.025, 0.99, 0.975], dark: 0.03, sheen: [0.06, 0.035, 0.025], sheenRough: 0.75,
    // the hairline: the blur's mip level and reach (texels of a 2048 map), the band's coverage window, the line's place
    line: { lod: 4.2, reach: 14, lo: 0.04, hi: 0.9, edge: [0.3, 0.72], keep: 0.15 },
    pores: { repeat: 15, repeat2: 23.7, scale: 0.3, rough: 0.12 }, spec: 0.72, tzone: 0.16, wrap: [0.36, 0.17, 0.11],
    // (blood under the skin: the cheeks, the nose and the ears a little redder; a faint blotch over all of it)
    flush: [1.05, 0.965, 0.955], blotch: 0.05,
    // (people4: the skin's relief from scans, not made here: a pore tile (Human Materials 1, britdawgmasterfunk, CC BY 4.0)
    // over the whole skin, and the face's wrinkles (Einar's sculpted detail, Blender Studio, CC BY 4.0, baked onto
    // MakeHuman's face uvs: assets/people/detail) by age: none under young, all of them old)
    tile: { repeat: 26, repeat2: 41, scale: 0.55, rough: 0.35 },
    wrinkles: { rect: [0.70, 0.30, 0.99, 0.73], young: 0.2, old: 0.7, min: 0.12, max: 1.05, cavity: 0.07 },
  },
  // (people4: the cloth's weave from scans (Poly Haven, ambientCG; CC0): per garment a tile, its size on the body (m) and
  // its strength over the garment's own relief)
  fabric: {
    wool: [0.05, 3], coat: [0.06, 2.6], poplin: [0.025, 2.2], jersey: [0.035, 3], fleece: [0.05, 2.8], denim: [0.045, 3], leather: [0.1, 1.4], plain: [0.04, 2.6],
    rough: 0.3,
  },
  eyes: { rough: 0.2, coat: 0.03, env: 1.35 },
  // (a cut jacket's pieces kept: those on these bones)
  mend: { arm: '^(upperarm|lowerarm|wrist|finger)' },
};

const CARD = /^(hair|hairShell|brows|lashes|beard)$/;
// (the cards of a head of hair; a buzz's shell over the scalp (hairShell: short hairs stippled on the skull, the forged
// captain's under his cap) keeps its own cut and light, soft edges only: eased, its stipple read as coral)
const HAIR = /^hair$/;
const done = new WeakMap(), shaped = new WeakSet();

// (?polish=0: every body as its GLB has it, for a look at the difference; ?polish=r8: r8's finish only)
const MODE = typeof location === 'undefined' ? '' : (/[?&]polish=([a-z0-9]+)/.exec(location.search) || [])[1] || '';
const OFF = MODE === '0';

export function polishBody(inner, { msaa = typeof window === 'undefined' || window.NYC?.quality?.antialias !== false, hair = true, skin = true, eyes = true, cloth = true } = {}) {
  const out = { cards: 0, skin: 0, hair: 0, eyes: 0, cloth: 0, mended: 0, weave: 0 };
  if (OFF) return out;
  const r8 = MODE === 'r8';
  const head = r8 ? null : headFrame(inner);
  if (head && hair) inner.traverse((o) => { if (o.isMesh && HAIR.test(o.material?.name || '') && shapeHair(o, head)) out.hair++; });
  if (head && cloth && !r8) { out.cloth = collarWeights(inner); out.mended = mendCoat(inner); }
  // (the skin's band on every primitive its material draws, and the line's two colours once a material)
  const lines = new Map();
  if (head && skin && !r8) {
    const by = new Map(); inner.traverse((o) => { if (o.isMesh && o.material?.name === 'skin' && !o.material.normalMap && o.material.map && !done.has(o.material)) (by.get(o.material) || by.set(o.material, []).get(o.material)).push(o); });
    // (a body forged since people2 has its scalp's line graded already (extras.scalpLine): its pores and light only)
    for (const [m, list] of by) lines.set(m, m.userData?.scalpLine === 'graded' ? (list.forEach((o) => skinBand(o, head)), null) : skinLine(list, head));
  }
  const one = (m, o) => {
    if (!m || m.userData?.polished) return m;
    if (done.has(m)) return done.get(m);
    let n = m;
    if (hair && CARD.test(m.name || '') && (m.alphaTest > 0 || m.transparent)) {
      n = r8 || m.name === 'hairShell' ? r8Card(m, msaa) : softCard(m, msaa, HAIR.test(m.name) && !!o.geometry.attributes.tangent); out.cards++;
    } else if (skin && m.name === 'skin' && !m.normalMap && m.map) {
      n = r8 ? r8Skin(m) : skinOf(m, lines.get(m) || null, !!head, ageOf(inner, m)); out.skin++;
    } else if (eyes && !r8 && m.name === 'eyes' && m.map && !m.isMeshPhysicalMaterial) {
      n = wetEyes(m); out.eyes++;
    } else if (cloth && !r8 && DMODE !== '0' && fabricOf(m) && sizeOf(o.geometry) > 0.06) {
      n = weave(m, o, fabricOf(m)); out.weave = (out.weave || 0) + 1;
    }
    if (n !== m) n.userData = { ...m.userData, ...n.userData, polished: true };
    done.set(m, n);
    return n;
  };
  inner.traverse((o) => { if (o.isMesh && o.material) o.material = Array.isArray(o.material) ? o.material.map((m) => one(m, o)) : one(o.material, o); });
  return out;
}

/* ------------------------------------------------------------ the head -- */
// the head's frame in the skin's bind space (the space every forged primitive is drawn in): the eyes' middle (from the
// eyes' own points), the front of the eyes, the middle of the skull behind them (the forge's own: core.mjs HC)
function headFrame(inner) {
  let skin = null, eyes = null;
  inner.traverse((o) => { if (!o.isSkinnedMesh) return; const n = o.material?.name; if (n === 'skin' && !skin) skin = o; if (n === 'eyes' && !eyes) eyes = o; });
  if (!skin || !eyes || !eyes.geometry.index) return null;
  const P = eyes.geometry.attributes.position, ix = eyes.geometry.index.array, M = toSkin(eyes, skin);
  const p = new THREE.Vector3(); let n = 0, sx = 0, sy = 0, fz = -Infinity, lo = Infinity, hi = -Infinity;
  const seen = new Set();
  for (const v of ix) { if (seen.has(v)) continue; seen.add(v); p.fromBufferAttribute(P, v); if (M) p.applyMatrix4(M); sx += p.x; sy += p.y; fz = Math.max(fz, p.z); lo = Math.min(lo, p.x); hi = Math.max(hi, p.x); n++; }
  // (two eyes, 5-8 cm apart, in metres: anything else is not a MakeHuman-built head, and nothing here is guessed for it)
  if (n < 20 || !(hi - lo > 0.04 && hi - lo < 0.12)) return null;
  const X = sx / n, EY = sy / n, EZ = fz;
  return { skin, X, EY, EZ, HC: new THREE.Vector3(X, EY + 0.02, EZ - 0.09) };
}
// the matrix from a skinned mesh's geometry space to the skin's (identity on every forged body: null then)
function toSkin(mesh, skin) {
  if (mesh === skin || !mesh.bindMatrix || !skin.bindMatrixInverse) return null;
  const M = skin.bindMatrixInverse.clone().multiply(mesh.bindMatrix);
  return M.equals(new THREE.Matrix4()) ? null : M;
}
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ------------------------------------------------------------ the hair -- */
// the hair's shape: each card's normal turned toward the volume of the hair (a sphere round the skull, a capsule down the
// back for a fall), so a head of hair is lit as one form with soft strands in it, not as a heap of tilted cards; its flow
// (the strands' direction: away from the crown, along the surface) as the tangent, for the strands' sheen
function shapeHair(mesh, head) {
  const g = mesh.geometry;
  if (shaped.has(g)) return !!g.attributes.tangent;
  shaped.add(g);
  const P = g.attributes.position, N0 = g.attributes.normal; if (!P || !N0 || !g.index) return false;
  const M = toSkin(mesh, head.skin), Mi = M ? M.clone().invert() : null, Mn = M ? new THREE.Matrix3().getNormalMatrix(M) : null, Mni = Mn ? Mn.clone().invert() : null;
  const N = new Float32Array(P.count * 3), T = new Float32Array(P.count * 4);
  for (let v = 0; v < P.count; v++) { N[v * 3] = N0.getX(v); N[v * 3 + 1] = N0.getY(v); N[v * 3 + 2] = N0.getZ(v); T[v * 4] = 1; T[v * 4 + 3] = 1; }
  const { HC } = head, crown = new THREE.Vector3(HC.x, HC.y + 0.1, HC.z - 0.02), axisB = new THREE.Vector3(HC.x, HC.y - 0.32, HC.z - 0.03);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Vector3(), vol = new THREE.Vector3(), f = new THREE.Vector3(), AB = axisB.clone().sub(HC), ab2 = AB.lengthSq();
  // (a body forged since people2 has its hair's normals turned already (extras.hairNormals): the flow only)
  const seen = new Uint8Array(P.count), W = mesh.material?.userData?.hairNormals === 'volume' ? 0 : POLISH.hair.volume;
  for (const v of g.index.array) {
    if (seen[v]) continue; seen[v] = 1;
    p.fromBufferAttribute(P, v); if (M) p.applyMatrix4(M);
    n.set(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]); if (Mn) n.applyMatrix3(Mn); n.normalize();
    // (the volume: above the skull's middle a sphere, flattened a little side to side; below it a capsule down the back)
    const t = Math.min(1, Math.max(0, c.copy(p).sub(HC).dot(AB) / ab2));
    c.copy(HC).addScaledVector(AB, t); vol.copy(p).sub(c); vol.x *= 1.15; if (vol.lengthSq() < 1e-8) vol.set(0, 1, 0); vol.normalize();
    // (a card seen from its back faces in: its normal on the outward side first)
    if (n.dot(vol) < 0) n.negate();
    if (W > 0) n.lerp(vol, W).normalize();
    // (the flow: away from the crown along the surface; at the crown itself, back)
    f.copy(p).sub(crown); f.addScaledVector(n, -f.dot(n)); if (f.lengthSq() < 1e-8) f.set(0, 0, -1).addScaledVector(n, -n.z); f.normalize();
    if (Mni) { n.applyMatrix3(Mni).normalize(); f.transformDirection(Mi); }
    N[v * 3] = n.x; N[v * 3 + 1] = n.y; N[v * 3 + 2] = n.z; T[v * 4] = f.x; T[v * 4 + 1] = f.y; T[v * 4 + 2] = f.z;
  }
  // (the hair's own copies: the pack's primitives share one list of points)
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  g.setAttribute('tangent', new THREE.BufferAttribute(T, 4));
  return true;
}

// hair, brows, lashes and beard: soft cut edges (alpha to coverage on the texture's own alpha, eased round the GLB's cut,
// under the MSAA; the low tier keeps the alpha test), their relief and sheen calmed; the hair lit as strands (hairShaded)
function softCard(m, msaa, strands) {
  const H = POLISH.hair, isHair = HAIR.test(m.name);
  const n = strands ? new HairMaterial() : new THREE.MeshPhysicalNodeMaterial();
  for (const k of ['name', 'color', 'map', 'roughness', 'roughnessMap', 'metalness', 'metalnessMap', 'side', 'vertexColors', 'specularIntensity', 'specularColor', 'envMapIntensity'])
    if (m[k] !== undefined && k in n) n[k] = m[k] && m[k].isColor ? m[k].clone() : m[k];
  n.metalness = 0;
  // (people6: the forge's marks kept (extras: a brow of single hairs, browStrands, which face.js moves with the skin))
  n.userData = { ...m.userData };
  const cut = m.alphaTest > 0 ? m.alphaTest : H.cut;
  if (!m.map) { n.alphaTest = cut; return n; }
  const tex = texture(m.map), a = tex.a, tint = uniform(m.color ? m.color.clone() : new THREE.Color(1, 1, 1));
  // (the colour: the source's broad mottle (its own painted light and shade, the foil's crumple: patches a few
  // centimetres across) taken down, the single strands over it kept a little crisper)
  // (people7: a light head of hair (the forge's hairTone 'light': grey, silver, blond) calmer: more of its mottle taken
  // down, its strands softer against each other, less sheen: the grandmother's silver read as crumpled foil)
  const light = isHair && m.userData?.hairTone === 'light', L7 = POLISH.hair.light;
  let rgb = tex.rgb;
  if (isHair && H.mottle > 0) { const m2 = texture(m.map).level(2).rgb, m5 = texture(m.map).level(5).rgb; rgb = m5.add(m2.sub(m5).mul(1 - (light ? L7.mottle : H.mottle))).add(tex.rgb.sub(m2).mul(1 + (light ? L7.crisp : H.crisp))).max(0); }
  rgb = rgb.mul(tint);
  if (msaa) {
    n.alphaToCoverage = true; n.alphaTest = 0;
    // (the coverage eased over the texture's own alpha round the GLB's cut, so a strand's end fades over a few samples)
    n.colorNode = vec4(rgb, float(1));
    // (people5 r3: a beard's coverage eased over +-0.07, not +-0.2: its mipped strand cards' faint texels (0.25-0.45)
    // came out a dithered translucent ghost round the beard's edge, the old boss's halo)
    const sw = m.name === 'beard' ? Math.min(H.soft, 0.07) : H.soft;
    n.opacityNode = smoothstep(float(cut - sw), float(cut + sw), a);
    n.maskNode = a.greaterThan(Math.max(0.02, cut - sw));
  } else { n.colorNode = vec4(rgb, a); n.alphaTest = cut; }
  // (its shadow cut as before)
  n.maskShadowNode = a.greaterThan(cut);
  if (isHair) { n.roughness = Math.max(m.roughness ?? 0.6, H.rough); n.specularIntensity = (m.specularIntensity ?? 1) * H.spec * (light ? L7.spec : 1); }
  else if (m.specularIntensity != null) n.specularIntensity = m.specularIntensity * 0.7;
  if (strands) {
    n.side = THREE.DoubleSide; n.normalNode = normalViewGeometry;
    // (the strands in the sheen: a strand lighter than the hair round it catches more of it)
    const lum = (c) => dot(c, vec3(0.2126, 0.7152, 0.0722));
    n.strandNode = lum(tex.rgb).add(0.004).div(lum(texture(m.map).level(4).rgb).add(0.004)).clamp(0.3, 2).sub(1).mul(light ? L7.strand : H.strand).add(1).max(0);
    if (light) n.kkScale = L7.kk;
  }
  else if (m.normalMap) { n.normalMap = m.normalMap; n.normalScale = m.normalScale.clone().multiplyScalar(0.35); }
  return n;
}

// the hair's light: its diffuse wrapped soft round the volume (hair scatters), its sheen two Kajiya-Kay bands along the
// flow (Marschner's R and TRT, cheaply: a narrow white one shifted toward the root, a broad one in the hair's colour
// toward the tip); the sky's reflection through the physical model's own (its specular turned down)
class HairLighting extends THREE.PhysicalLightingModel {
  direct({ lightDirection: L, lightColor, reflectedLight }, builder) {
    const H = POLISH.hair, [p1, s1, p2, s2, sh] = H.kk, N = normalView, V = positionViewDirection, st = builder.material.strandNode || float(1);
    const ndl = N.dot(L), wrap = ndl.add(H.wrap).div(1 + H.wrap).max(0);
    reflectedLight.directDiffuse.addAssign(wrap.mul(lightColor).mul(BRDF_Lambert({ diffuseColor: diffuseContribution })));
    const Hv = L.add(V).normalize(), Tn = normalize(tangentView);
    const band = (T, p) => { const th = T.dot(Hv); return th.mul(th).oneMinus().max(0.0001).sqrt().pow(p); };
    const t1 = normalize(Tn.add(N.mul(sh))), t2 = normalize(Tn.sub(N.mul(sh * 1.5)));
    // (no sheen on the side away from the light, nor from a light behind (a rim's light through the hair is not a sheen
    // over its top: it greyed a dark head in a set's close shot); none where the strands face away from the eye)
    const lit = smoothstep(0.0, 0.45, ndl).mul(smoothstep(-0.2, 0.25, N.dot(V))).mul(smoothstep(-0.6, 0.0, L.dot(V)));
    const spec = vec3(band(t1, p1).mul(s1)).add(band(t2, p2).mul(s2).mul(diffuseContribution.mul(2.2).min(1))).mul(builder.material.kkScale ?? 1);
    reflectedLight.directSpecular.addAssign(spec.mul(lit).mul(st).mul(lightColor));
  }
}
class HairMaterial extends THREE.MeshPhysicalNodeMaterial {
  static get type() { return 'HairMaterial'; }
  constructor(p) { super(p); this.strandNode = null; this.kkScale = 1; }
  setupLightingModel() { return new HairLighting(); }
}

/* ------------------------------------------------------------ the skin -- */
// the skin's band per point: x, where the scalp's line may be drawn again (the head above the cheekbones, never the face
// in front of the ears under the brows' top: eyes, brows, nose, mouth, a beard); y, the T-zone (the forehead's middle and
// the nose: a little glossier). Every primitive the skin's material draws gets it (cached on its geometry); the two
// colours the line runs between are read off the texture itself, at the body's own points: the bare skin between the
// brows and the scalp's paint at the crown.
function skinBand(mesh, head) {
  const g = mesh.geometry;
  if (g.userData.p2band) return g.userData.p2band;
  const P = g.attributes.position, out = { scalp: [], bare: [], tris: g.index ? g.index.count / 3 : 0 };
  g.userData.p2band = out;
  const A = new Float32Array(P.count * 3);
  if (g.index) {
    const M = toSkin(mesh, head.skin), p = new THREE.Vector3(), { X, EY, EZ } = head;
    const seen = new Uint8Array(P.count);
    for (const v of g.index.array) {
      if (seen[v]) continue; seen[v] = 1;
      p.fromBufferAttribute(P, v); if (M) p.applyMatrix4(M);
      const dx = p.x - X, dy = p.y - EY, dz = p.z - EZ, ax = Math.abs(dx);
      // (where to read the two colours: the top of the scalp either side of the parting, inside its patch of the texture
      // (the crown itself lies on the patch's edge); bare skin between the brows, down the nose's bridge, high on the cheeks)
      if (dy > 0.085 && ax > 0.018 && ax < 0.05 && dz > -0.15 && dz < -0.05) out.scalp.push(v);
      if ((ax < 0.006 && dy > -0.012 && dy < 0.014 && dz > -0.012) || (ax > 0.03 && ax < 0.04 && dy > -0.032 && dy < -0.02 && dz > -0.03)) out.bare.push(v);
      if (dy < -0.12 || Math.hypot(dx, dy - 0.02, dz + 0.09) > 0.17) continue;
      // (the ear's box (MakeHuman's ear: 7.5-8.6 cm out, 9-14 cm behind the eyes' front, from 6 cm under them to 2 cm
      // over): its folds are dark, not hair)
      const above = sm(-0.055, -0.03, dy), front = sm(-0.042, -0.028, dz) * (1 - sm(0.036, 0.05, dy));
      const ear = sm(0.05, 0.06, ax) * sm(-0.15, -0.14, dz) * (1 - sm(-0.088, -0.078, dz)) * sm(-0.07, -0.06, dy) * (1 - sm(0.018, 0.03, dy));
      A[v * 3] = above * (1 - front) * (1 - ear);
      A[v * 3 + 1] = (1 - sm(0.022, 0.045, ax)) * sm(-0.06, -0.035, dy) * (1 - sm(0.075, 0.1, dy)) * sm(-0.03, -0.012, dz);
      // (the flush: the cheeks under the eyes, the nose's tip and wings, the ears)
      const cheek = (1 - sm(0.012, 0.03, Math.hypot(ax - 0.038, dy + 0.035))) * sm(-0.05, -0.025, dz);
      const nose = (1 - sm(0.006, 0.02, Math.hypot(ax, dy + 0.045))) * sm(-0.004, 0.006, dz);
      A[v * 3 + 2] = Math.min(1, cheek + nose + ear * 0.8);
    }
  }
  g.setAttribute('p2skin', new THREE.BufferAttribute(A, 3));
  return out;
}
function skinLine(meshes, head) {
  const bands = meshes.map((o) => [o, skinBand(o, head)]).sort((a, b) => b[1].tris - a[1].tris);
  const [o, b] = bands[0] || []; const U = o?.geometry.attributes.uv;
  if (!o || !U || b.scalp.length < 4 || b.bare.length < 3) return null;
  // (each colour the median of its points', channel by channel: a seam or a stray brow hair among them doesn't move it)
  const uvs = (L) => L.map((v) => [U.getX(v), U.getY(v)]);
  const sc = sampleRefs(o.material.map, uvs(b.scalp)), bc = sampleRefs(o.material.map, uvs(b.bare)); if (!sc || !bc) return null;
  const med = (L) => [0, 1, 2].map((c) => { const a = L.map((x) => x[c]).sort((x, y) => x - y); return a[a.length >> 1]; });
  const hair = med(sc), skinC = med(bc), d = Math.hypot(hair[0] - skinC[0], hair[1] - skinC[1], hair[2] - skinC[2]);
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  // (the scalp's paint must differ from the skin plainly: a bald crown, or a head of hair the colour of its skin, keeps
  // its line as forged)
  if (d < 0.08 || Math.abs(lum(hair) - lum(skinC)) < 0.035) return null;
  return { hair, skin: skinC };
}
// each UV's colour (linear, its pixel with the map drawn at 256 px: 8 x 8 texels averaged) from the map's image, or null where the image
// can't be read
let refCanvas = null;
function sampleRefs(map, uvs) {
  const img = map && map.image; if (!img || !(img.width > 0)) return null;
  try {
    const S = 256;
    refCanvas = refCanvas || (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S }));
    const cx = refCanvas.getContext('2d', { willReadFrequently: true }); cx.clearRect(0, 0, S, S); cx.drawImage(img, 0, 0, S, S);
    const D = cx.getImageData(0, 0, S, S).data, lin = (c) => Math.pow(c / 255, 2.2);
    // (the image as the GLB has it: v down, unflipped; a flipped texture reads its row from the bottom)
    return uvs.map(([u, v]) => { const x = Math.min(S - 1, Math.max(0, Math.floor(u * S))), y = Math.min(S - 1, Math.max(0, Math.floor((map.flipY ? 1 - v : v) * S))), k = (y * S + x) * 4; return [lin(D[k]), lin(D[k + 1]), lin(D[k + 2])]; });
  } catch { return null; }
}

// the pores: a small tiling relief made once (256 px, a jittered grid of dimples ~2 mm apart on the face, fine grain over
// it); RGB its normal, A its cavity (where the pores are, for the roughness)
let poreTex = null;
function pores() {
  if (poreTex) return poreTex;
  const S = 256, H = new Float32Array(S * S), cell = 8;
  let s = 1234567; const R = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  // (dimples: one per cell, jittered, 0.9-1.9 px across, of their own depth)
  for (let gy = 0; gy < S / cell; gy++) for (let gx = 0; gx < S / cell; gx++) {
    const cx = (gx + 0.15 + 0.7 * R()) * cell, cy = (gy + 0.15 + 0.7 * R()) * cell, r = 0.9 + R(), dep = 0.5 + 0.5 * R();
    for (let y = Math.floor(cy - 4); y <= cy + 4; y++) for (let x = Math.floor(cx - 4); x <= cx + 4; x++) {
      const d2 = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r); if (d2 > 9) continue;
      H[((y + S) % S) * S + ((x + S) % S)] -= dep * Math.exp(-d2);
    }
  }
  // (fine grain: value noise at 3 px and 11 px, wrapped)
  const vn = (per) => { const n = S / per, L = new Float32Array(n * n); for (let i = 0; i < n * n; i++) L[i] = R();
    return (x, y) => { const fx = x / per, fy = y / per, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, at = (i, j) => L[((j % n + n) % n) * n + ((i % n + n) % n)];
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty); return (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy; }; };
  const n1 = vn(4), n2 = vn(16);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) H[y * S + x] += 0.35 * (n1(x, y) - 0.5) + 0.25 * (n2(x, y) - 0.5);
  const D = new Uint8Array(S * S * 4), at = (x, y) => H[((y + S) % S) * S + ((x + S) % S)];
  let lo = Infinity, hi = -Infinity; for (const h of H) { lo = Math.min(lo, h); hi = Math.max(hi, h); }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 1.6, dy = (at(x, y + 1) - at(x, y - 1)) * 1.6, l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
    D[i] = Math.round((-dx / l * 0.5 + 0.5) * 255); D[i + 1] = Math.round((dy / l * 0.5 + 0.5) * 255); D[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
    D[i + 3] = Math.round(255 * (1 - (at(x, y) - lo) / (hi - lo)));
  }
  poreTex = new THREE.DataTexture(D, S, S, THREE.RGBAFormat);
  Object.assign(poreTex, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, magFilter: THREE.LinearFilter, minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true, anisotropy: 4, colorSpace: THREE.NoColorSpace, name: 'p2-pores' });
  poreTex.needsUpdate = true;
  return poreTex;
}

// skin's light: the physical model's, its diffuse wrapped a little past the shadow's edge, more in red than in blue
// (light scattered under the skin comes out redder and further on), and as much taken off the lit side as the wrap
// adds at the edge (energy-conserving wrap: (n.l + w) / (1 + w)^2), so the face is no brighter, only softer
class SkinLighting extends THREE.PhysicalLightingModel {
  direct(input, builder) {
    super.direct(input, builder);
    const { lightDirection: L, lightColor, reflectedLight } = input, w = vec3(...POLISH.skin.wrap);
    const ndl = normalView.dot(L), wrapped = vec3(ndl).add(w).div(w.add(1).mul(w.add(1))).max(0), extra = wrapped.sub(ndl.max(0));
    reflectedLight.directDiffuse.addAssign(extra.mul(lightColor).mul(BRDF_Lambert({ diffuseColor: diffuseContribution })));
  }
}
class SkinMaterial extends THREE.MeshPhysicalNodeMaterial {
  static get type() { return 'SkinMaterial'; }
  setupLightingModel() { return new SkinLighting(this.useClearcoat, this.useSheen, this.useIridescence, this.useAnisotropy, this.useTransmission, this.useDispersion); }
}

const SKIN_KEYS = ['name', 'color', 'map', 'roughness', 'roughnessMap', 'metalness', 'metalnessMap', 'emissive', 'emissiveMap', 'emissiveIntensity', 'aoMap', 'aoMapIntensity',
  'alphaMap', 'alphaTest', 'transparent', 'opacity', 'side', 'envMapIntensity', 'vertexColors', 'depthWrite', 'depthTest', 'specularIntensity', 'specularColor'];
function skinOf(m, line, banded, age = 0.35) {
  const S = POLISH.skin, n = new SkinMaterial();
  for (const k of SKIN_KEYS) if (m[k] !== undefined && k in n) n[k] = m[k] && m[k].isColor ? m[k].clone() : m[k];
  n.metalness = 0; n.sheen = 1; n.sheenColor = new THREE.Color(...S.sheen); n.sheenRoughness = S.sheenRough;
  n.specularIntensity = S.spec;
  const band = banded ? attribute('p2skin', 'vec3') : vec3(0, 0, 0), P = pores(), pt = texture(P, uv().mul(S.pores.repeat));
  // (a second, finer and turned, so the pores' grid never shows)
  const pt2 = texture(P, vec2(uv().x.mul(0.8).add(uv().y.mul(0.6)), uv().y.mul(0.8).sub(uv().x.mul(0.6))).mul(S.pores.repeat2));
  // (the colour: the scalp's line drawn again in its band, then r8's daylight grade)
  let c = materialColor.rgb;
  if (line) {
    const L = S.line, map = m.map, r = L.reach / 2048, lod = float(L.lod), at = (dx, dy) => texture(map, uv().add(vec2(dx, dy))).level(lod).rgb;
    const tint = uniform(m.color ? m.color.clone() : new THREE.Color(1, 1, 1));
    const hairC = uniform(new THREE.Vector3(...line.hair)), skinC = uniform(new THREE.Vector3(...line.skin)), axis = hairC.sub(skinC);
    const cov = (x) => dot(x.sub(skinC), axis).div(dot(axis, axis)).clamp(0, 1);
    const c0 = c;
    // (only in the band: the rest of the skin never takes the blur's eight samples)
    c = Fn(() => {
      const out = c0.toVar();
      If(band.x.greaterThan(0.002), () => {
        const blur = at(r, 0).add(at(-r, 0)).add(at(0, r)).add(at(0, -r)).add(at(r * 0.7, r * 0.7)).add(at(-r * 0.7, -r * 0.7)).add(at(r * 0.7, -r * 0.7)).add(at(-r * 0.7, r * 0.7)).mul(0.125).mul(tint);
        const tb = cov(blur), ts = cov(c0);
        // (the band: where the blurred paint is neither bare skin nor the scalp's full paint; there the line is the
        // blurred coverage, eased into a soft edge at the body of the paint (the teeth fall short of it), with a little of
        // the sharp texture's own strands kept)
        const k = band.x.mul(smoothstep(L.lo, L.lo + 0.12, tb)).mul(smoothstep(L.hi - 0.05, L.hi + 0.08, tb).oneMinus());
        const t = smoothstep(L.edge[0], L.edge[1], mix(tb, ts, L.keep));
        const drawn = mix(skinC.mul(blur.add(0.02).div(mix(skinC, hairC, tb).add(0.02)).clamp(0.75, 1.3)), hairC, t);
        out.assign(mix(c0, drawn, k));
      });
      return out;
    })();
  }
  // (the flush and the blotch: a large, soft variation read off the pores' own relief far down its mips)
  const blot = texture(P, uv().mul(2.3)).level(5).a.sub(0.5).mul(S.blotch * 2).add(1);
  c = c.mul(mix(vec3(1), vec3(...S.flush), band.z)).mul(blot);
  const Y = dot(c, vec3(0.2126, 0.7152, 0.0722)), tt = smoothstep(S.dark, S.dark * 3, Y);
  const gn = tt.mul(S.gain - 1).add(1), sat = tt.mul(S.sat - 1).add(1), Y2 = Y.mul(gn), mid = smoothstep(0.35, 0.7, Y).mul(-0.5).add(1);
  const warm = vec3(...S.warm).sub(1).mul(tt.mul(mid)).add(1);
  n.colorNode = vec4(max(c.mul(gn).sub(Y2).mul(sat).add(Y2), float(0)).mul(warm), materialColor.a);
  const rough0 = m.roughnessMap ? texture(m.roughnessMap).g.mul(m.roughness ?? 1) : float(m.roughness ?? 0.6);
  if (DMODE === '0') {
    // (the relief: the pores over the geometry's own normal)
    n.normalNode = normalMap(pt.rgb.add(pt2.rgb).mul(0.5), vec2(S.pores.scale, S.pores.scale));
    // (the roughness: the map's, the pores rougher, the T-zone glossier)
    n.roughnessNode = rough0.mul(pt.a.add(pt2.a).mul(0.5 * S.pores.rough).add(1 - S.pores.rough / 2)).mul(band.y.mul(-S.tzone).add(1)).clamp(0.3, 1);
    return n;
  }
  // (people4: the scanned pores, two turned copies so the tile never shows, and the face's wrinkles by age, laid over
  // each other (their slopes added) on the geometry's own normal; the wrinkles' creases a little darker)
  const T = S.tile, Wk = S.wrinkles, PT = tile('skin-pores', 512, 256), WT = tile('skin-wrinkles', 1024, 512, false);
  const q1 = texture(PT, uv().mul(T.repeat)), q2 = texture(PT, vec2(uv().x.mul(0.8).add(uv().y.mul(0.6)), uv().y.mul(0.8).sub(uv().x.mul(0.6))).mul(T.repeat2));
  const R = Wk.rect, wuv = uv().sub(vec2(R[0], R[1])).div(vec2(R[2] - R[0], R[3] - R[1])), wr = texture(WT, wuv).rgb.mul(2).sub(1);
  const wk = Wk.min + (Wk.max - Wk.min) * sm(Wk.young, Wk.old, age);
  const xy = q1.rg.add(q2.rg).sub(1).mul(T.scale).add(wr.xy.mul(wk));
  n.normalNode = normalMap(vec3(xy, 1).normalize().mul(0.5).add(0.5), vec2(1, -1));
  n.colorNode = vec4(n.colorNode.rgb.mul(float(1).sub(wr.xy.length().mul(Wk.cavity * wk)).max(0.7)), materialColor.a);
  n.roughnessNode = rough0.mul(q1.b.add(q2.b).mul(0.5).sub(0.5).mul(T.rough).add(1)).mul(band.y.mul(-S.tzone).add(1)).clamp(0.3, 1);
  n.userData.age = age;
  return n;
}

// (people4) a body's age, 0 young .. 1 old: the forge's own (extras.age on the skin, since people4), else read off the
// brows: a body forged before it with grey or white brows is old, any other middle-aged
const ages = new WeakMap();
function ageOf(inner, skinM) {
  if (ages.has(inner)) return ages.get(inner);
  let a = Number.isFinite(skinM.userData?.age) ? skinM.userData.age : null;
  if (a == null) {
    let brows = null; inner.traverse((o) => { if (!brows && o.isMesh && o.material?.name === 'brows' && o.material.map) brows = o.material; });
    const c = brows ? browColour(brows.map) : null;
    a = c && c.lum > 0.3 && c.sat < 0.25 ? 0.85 : 0.4;
  }
  ages.set(inner, a);
  return a;
}
// the brows' mean colour where they are drawn (alpha over a half), in linear light: { lum, sat }, or null
function browColour(map) {
  const img = map && map.image; if (!img || !(img.width > 0)) return null;
  try {
    const S = 64, cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : Object.assign(document.createElement('canvas'), { width: S, height: S });
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, S, S);
    const D = cx.getImageData(0, 0, S, S).data, lin = (c) => Math.pow(c / 255, 2.2); let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < D.length; i += 4) if (D[i + 3] > 128) { r += lin(D[i]); g += lin(D[i + 1]); b += lin(D[i + 2]); n++; }
    if (n < 8) return null; r /= n; g /= n; b /= n;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return { lum: 0.2126 * r + 0.7152 * g + 0.0722 * b, sat: mx > 0 ? (mx - mn) / mx : 0 };
  } catch { return null; }
}

/* ---------------------------------------------------------- the weave -- */
// (people4) a garment's fabric, by the forge's garment (extras.garment) or the pack's outfit it was cut from
const FABRIC = [
  [/^(suit-jacket|suit-jacket-db|blazer)|elegantsuit|suit-trousers/, 'wool'], [/^(overcoat|doorman-coat|peacoat|trench)/, 'coat'],
  [/^(uniform-jacket|loose-trousers)|worksuit/, 'plain'], [/^chef-jacket|shirt/, 'poplin'], [/^(hoodie|hood-up)/, 'jersey'],
  [/^puffer/, 'plain'], [/^scarf|beanie|knit/, 'fleece'], [/jeans|denim/, 'denim'], [/leather/, 'leather'], [/casualsuit|sportsuit|tee|top/, 'jersey'],
];
// (shoes, boots and caps keep their own surfaces: leather, rubber and a cap's peak are not woven)
const NOT_CLOTH = /boots|sneakers|shoes|peaked|cap|hat|helmet|glasses|button/;
function fabricOf(m) {
  const u = m.userData || {}; if (u.kind !== 'cloth' && !u.garment) return null;
  const g = String(u.garment || m.name || ''); if (u.kind === 'shoes' || NOT_CLOTH.test(g)) return null; for (const [re, f] of FABRIC) if (re.test(g)) return f;
  return u.kind === 'cloth' ? 'plain' : null;
}
// a piece's size (its bounding box's longest side, m): a button or a rivet is not woven
function sizeOf(g) { if (!g.boundingBox) g.computeBoundingBox(); const b = g.boundingBox; return Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z); }
// metres of the body per unit of a mesh's uvs (its edges' lengths over their lengths in uv, the median of a sample)
function metresPerUv(g) {
  if (g.userData.p4mpu) return g.userData.p4mpu;
  const P = g.attributes.position, U = g.attributes.uv, ix = g.index?.array; if (!P || !U || !ix) return 1;
  const r = []; for (let t = 0; t < ix.length && r.length < 4000; t += 3 * Math.max(1, Math.floor(ix.length / 3 / 4000))) {
    const a = ix[t], b = ix[t + 1], du = Math.hypot(U.getX(a) - U.getX(b), U.getY(a) - U.getY(b)); if (du < 1e-6) continue;
    r.push(Math.hypot(P.getX(a) - P.getX(b), P.getY(a) - P.getY(b), P.getZ(a) - P.getZ(b)) / du); }
  r.sort((x, y) => x - y); return (g.userData.p4mpu = r.length ? r[r.length >> 1] : 1);
}
const CLOTH_KEYS = ['name', 'color', 'map', 'normalMap', 'normalScale', 'roughness', 'roughnessMap', 'metalness', 'metalnessMap', 'aoMap', 'aoMapIntensity', 'alphaMap', 'alphaTest',
  'transparent', 'opacity', 'side', 'envMapIntensity', 'vertexColors', 'specularIntensity', 'specularColor', 'emissive', 'emissiveMap', 'sheen', 'sheenColor', 'sheenRoughness'];
// the garment's own relief (its normal map, the forge's weave and folds) with the scanned weave laid over it, the tile at
// its size on the body; its roughness varied by the weave's
function weave(m, mesh, fab) {
  const F = POLISH.fabric, [size, k] = F[fab] || F.plain, n = new THREE.MeshPhysicalNodeMaterial();
  for (const key of CLOTH_KEYS) if (m[key] !== undefined && key in n) n[key] = m[key] && (m[key].isColor || m[key].isVector2) ? m[key].clone() : m[key];
  const rep = metresPerUv(mesh.geometry) / size, d = texture(tile('fabric-' + fab, 512, 256), uv().mul(rep));
  const dxy = d.rg.mul(2).sub(1).mul(k);
  if (m.normalMap) { const b = texture(m.normalMap).rgb.mul(2).sub(1); n.normalNode = normalMap(vec3(b.xy.add(dxy), b.z).normalize().mul(0.5).add(0.5), m.normalScale.clone()); }
  else n.normalNode = normalMap(vec3(dxy, 1).normalize().mul(0.5).add(0.5), vec2(1, -1));
  const r0 = m.roughnessMap ? texture(m.roughnessMap).g.mul(m.roughness ?? 1) : float(m.roughness ?? 0.9);
  n.roughnessNode = r0.mul(d.b.sub(0.5).mul(F.rough).add(1)).clamp(0.2, 1);
  n.userData = { ...m.userData, fabric: fab, weaveRepeat: +rep.toFixed(2) };
  return n;
}

/* ------------------------------------------------------------ the eyes -- */
// wet, as Mr. Big's (wagmi/mission/mrbig.js): a clear coat over the map, so a key light and the sky show as catchlights
function wetEyes(m) {
  const E = POLISH.eyes, n = new THREE.MeshPhysicalNodeMaterial();
  for (const k of ['name', 'color', 'map', 'alphaTest', 'side', 'transparent', 'vertexColors']) if (m[k] !== undefined) n[k] = m[k] && m[k].isColor ? m[k].clone() : m[k];
  n.roughness = E.rough; n.metalness = 0; n.clearcoat = 1; n.clearcoatRoughness = E.coat; n.envMapIntensity = E.env;
  return n;
}

/* ----------------------------------------------------------- the cloth -- */
// an inner garment's points within reach of an outer layer (the forge's layers: a shirt under a jacket, extras.layer)
// move as that layer's nearest point does (its four bones and weights), near the neck and the lapels only, so the
// pose can't open a gap the inner one shows through. The forge lays each garment over the body by its own nearest
// body points; a jacket's collar and a shirt's collar took different neck points and parted when the head turned.
function collarWeights(inner) {
  const meshes = []; inner.traverse((o) => { if (o.isSkinnedMesh && o.material?.userData?.kind === 'cloth' && o.geometry.index) meshes.push(o); });
  if (meshes.length < 2) return 0;
  const layer = (o) => +o.material.userData.layer || 0;
  // (the cloth's points on a 2 cm grid, with their layer: an inner garment's point looks only at the layers over it)
  const cell = 0.02, G = new Map(), key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const pts = [];
  for (const o of meshes) {
    const P = o.geometry.attributes.position, I = o.geometry.attributes.skinIndex, Wt = o.geometry.attributes.skinWeight, seen = new Uint8Array(P.count), L = layer(o);
    for (const v of o.geometry.index.array) { if (seen[v]) continue; seen[v] = 1; const x = P.getX(v), y = P.getY(v), z = P.getZ(v), k = key(x, y, z); (G.get(k) || G.set(k, []).get(k)).push(pts.length); pts.push([x, y, z, I, Wt, v, L]); }
  }
  const top = Math.max(...meshes.map(layer)), inside = meshes.filter((o) => layer(o) < top), outer = meshes.filter((o) => layer(o) > Math.min(...meshes.map(layer)));
  const neck = inner.getObjectByName('neck01') || inner.getObjectByName('neck') || inner.getObjectByName('head');
  if (!neck) return 0;
  const nb = new THREE.Vector3(); neck.updateWorldMatrix(true, false);
  // (the neck's bind position: its inverse bind matrix's, in the bind space, then into the garments' own (bindMatrixInverse))
  const sk = (outer[0] || meshes[0]).skeleton, bi = sk.bones.indexOf(neck); if (bi < 0) return 0;
  nb.setFromMatrixPosition(sk.boneInverses[bi].clone().invert()).applyMatrix4((outer[0] || meshes[0]).bindMatrixInverse);
  let moved = 0;
  for (const o of inside) {
    const g = o.geometry, P = g.attributes.position, I0 = g.attributes.skinIndex, W0 = g.attributes.skinWeight, Lo = layer(o);
    if (!P || !I0 || !W0 || g.userData.p2collar) continue;
    // (the inner garment's own copies: the pack's primitives share one list)
    const I = I0.clone(), Wt = W0.clone(); let n = 0;
    const seen = new Uint8Array(P.count);
    for (const v of g.index.array) {
      if (seen[v]) continue; seen[v] = 1;
      const x = P.getX(v), y = P.getY(v), z = P.getZ(v);
      // (the collar's reach: within 16 cm of the neck's base, above the chest's middle)
      if (y < nb.y - 0.2 || Math.hypot(x - nb.x, y - nb.y, z - nb.z) > 0.16) continue;
      let best = -1, bd = 0.025;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) for (const q of G.get(`${cx + i},${cy + j},${cz + k}`) || []) {
        const p = pts[q]; if (p[6] <= Lo) continue; const d = Math.hypot(p[0] - x, p[1] - y, p[2] - z); if (d < bd) { bd = d; best = q; } }
      if (best < 0) continue;
      const [, , , Io, Wo, vo] = pts[best], w = 1 - sm(0.012, 0.025, bd);
      if (w >= 0.999) { for (let c = 0; c < 4; c++) { I.setComponent(v, c, Io.getComponent(vo, c)); Wt.setComponent(v, c, Wo.getComponent(vo, c)); } n++; }
      else if (w > 0.01) {
        // (between: the two sets of weights blended, the strongest four kept)
        const acc = new Map();
        for (let c = 0; c < 4; c++) { const a = I0.getComponent(v, c), b = Io.getComponent(vo, c); acc.set(a, (acc.get(a) || 0) + W0.getComponent(v, c) * (1 - w)); acc.set(b, (acc.get(b) || 0) + Wo.getComponent(vo, c) * w); }
        const four = [...acc.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4), sum = four.reduce((s, e) => s + e[1], 0) || 1;
        for (let c = 0; c < 4; c++) { I.setComponent(v, c, four[c] ? four[c][0] : 0); Wt.setComponent(v, c, four[c] ? four[c][1] / sum : 0); } n++;
      }
    }
    if (n) { g.setAttribute('skinIndex', I); g.setAttribute('skinWeight', Wt); moved += n; }
    g.userData.p2collar = n;
  }
  return moved;
}

// a jacket or a coat the forge cut through its own body (before r8 fixed it in the forge, 461b8423: on MakeHuman's
// woman at full lean the library found no crotch, every garment hemmed at it lost its whole torso, and The Courtesy Lane's
// hero wore two sleeves and a shredded collar floating over her top, white shards at her shoulders). A published GLB is
// never forged again, so here: a jacket or coat with almost nothing left over the chest keeps its sleeves (its triangles
// on the arms' bones) and drops the shreds (its collar, lapels, hem, buttons and whatever else rides the spine, the
// neck or the shoulders), so she reads as a top over long sleeves, not as a torn one. A whole jacket is left alone.
const COAT = /^(suit-jacket|suit-jacket-db|overcoat|doorman-coat|blazer|trench|peacoat|coat)/;
function mendCoat(inner) {
  const parts = new Map(); inner.traverse((o) => { const g = o.isSkinnedMesh && o.material?.userData?.garment; if (g && COAT.test(g) && o.geometry.index) (parts.get(g) || parts.set(g, []).get(g)).push(o); });
  if (!parts.size) return 0;
  const bone = (o, i) => o.skeleton.bones[i]?.name || '', arm = new RegExp(POLISH.mend.arm);
  const neck = inner.getObjectByName('neck01'); let mended = 0;
  for (const list of parts.values()) {
    const sk = list[0].skeleton, bi = neck ? sk.bones.indexOf(neck) : -1; if (bi < 0) continue;
    const nb = new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[bi].clone().invert()).applyMatrix4(list[0].bindMatrixInverse);
    // (its body (the garment's biggest piece: not its collar, lapels, hem or buttons) over the chest and the back, between
    // the arms: a whole jacket's has hundreds of points there, a cut one none)
    const count = (o) => { const P = o.geometry.attributes.position, seen = new Uint8Array(P.count); let torso = 0, all = 0;
      for (const v of o.geometry.index.array) { if (seen[v]) continue; seen[v] = 1; all++; if (Math.abs(P.getX(v) - nb.x) < 0.09 && P.getY(v) < nb.y - 0.1 && P.getY(v) > nb.y - 0.38) torso++; }
      return { torso, all }; };
    const body = list.map((o) => ({ o, ...count(o) })).sort((a, b) => b.all - a.all)[0];
    if (!body || body.all < 300 || body.torso > body.all * 0.02) continue;
    for (const o of list) {
      const g = o.geometry, I = g.attributes.skinIndex, W = g.attributes.skinWeight, ix = g.index.array;
      if (!I || !W || g.userData.p2mended) continue; g.userData.p2mended = true;
      const onArm = (v) => { let a = 0; for (let c = 0; c < 4; c++) if (arm.test(bone(o, I.getComponent(v, c)))) a += W.getComponent(v, c); return a > 0.6; };
      const keep = []; for (let t = 0; t < ix.length; t += 3) if (onArm(ix[t]) && onArm(ix[t + 1]) && onArm(ix[t + 2])) keep.push(ix[t], ix[t + 1], ix[t + 2]);
      if (keep.length) g.setIndex(keep); else o.visible = false;
      mended++;
    }
  }
  return mended;
}

/* ------------------------------------------------------------- r8 only -- */
// (r8's finish, for ?polish=r8: the alpha test's cut under alpha to coverage, relief at a third, a graded skin)
function r8Card(m, msaa) {
  const n = m.clone();
  if (msaa) n.alphaToCoverage = true;
  // (people5: a crop forged as a soft shell (extras.coverage 'soft': every texel some alpha, 0.3 between the hairs) drawn
  // by its coverage alone under the MSAA, its cut down to 0.12: under the forge's 0.42 cut only single texels passed, the
  // veteran's blue-white specks)
  // (people5 r2: and since round 2 such a crop is forged blended (alpha BLEND): drawn so on every tier, its texels' alpha
  // as it is, no cut and no coverage (alpha to coverage over a cut made every texel past it opaque: a camouflage cap with
  // a torn edge))
  if (m.name === 'hairShell' && m.userData?.coverage === 'soft' && m.transparent) { n.alphaToCoverage = false; n.alphaTest = 0; n.depthWrite = false; }
  else if (msaa && m.name === 'hairShell' && m.userData?.coverage === 'soft') n.alphaTest = 0.12;
  if (n.normalMap && n.normalScale) n.normalScale.multiplyScalar(0.35);
  if (m.name === 'hair' || m.name === 'hairShell') n.roughness = Math.max(n.roughness, 0.74);
  if (n.specularIntensity != null) n.specularIntensity *= 0.55;
  return n;
}
function r8Skin(m) {
  const S = POLISH.skin, n = new THREE.MeshPhysicalNodeMaterial();
  for (const k of SKIN_KEYS) if (m[k] !== undefined && k in n) n[k] = m[k] && m[k].isColor ? m[k].clone() : m[k];
  n.sheen = 1; n.sheenColor = new THREE.Color(...S.sheen); n.sheenRoughness = S.sheenRough;
  n.bumpMap = m.map; n.bumpScale = 0.6;
  const c = materialColor.rgb, Y = dot(c, vec3(0.2126, 0.7152, 0.0722)), t = smoothstep(S.dark, S.dark * 3, Y);
  const gn = t.mul(S.gain - 1).add(1), s = t.mul(S.sat - 1).add(1), Y2 = Y.mul(gn), mid = smoothstep(0.35, 0.7, Y).mul(-0.5).add(1);
  const warm = vec3(...S.warm).sub(1).mul(t.mul(mid)).add(1);
  n.colorNode = max(c.mul(gn).sub(Y2).mul(s).add(Y2), float(0)).mul(warm);
  return n;
}
