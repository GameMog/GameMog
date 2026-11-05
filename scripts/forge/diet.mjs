// THE CHARACTER FORGE: the download diet (FB, browser port of the gltf toolbox's diet/build.mjs, the part a forged
// person uses), on a platform (env-node.mjs / env-browser.mjs), no Node API.
//  - nodes, names, the scene graph and skins kept as they are, materials and meshes untouched, positions at full float
//    precision (face.js finds the lips and lids by geometry)
//  - dedup of identical clip accessors, resample of redundant keyframes (tolerance 1e-4)
//  - textures: PNG / JPEG to WebP (normal maps at qn, the rest at q), sizes kept: env.toWebP (sharp in Node, the
//    browser's own WebP encoder in a creator's browser)
//  - EXT_meshopt_compression, filter mode; index buffers in the order-keeping INDICES mode (face.js picks triangles by
//    their first corner)
//  - (B6) a size budget under the store's 3 MB a person (lib/storykit-store.ts LIMITS.glb.each): while the GLB is over
//    it, the texture that saves most is halved once (from its PNG / JPEG source, then WebP again), cloth normal maps first,
//    then other normal maps, then colours, hair after cloth, never under 512 px and never the face's (skin, eyes, brows,
//    lashes, teeth, mouth); the old boss's suit and the chef's jacket and trousers (2048 px cloth normal maps) took them over the cap
//   diet(glb: Uint8Array, env, { q = 85, qn = 90, budget = BUDGET }) -> Uint8Array
export const BUDGET = Math.round(2.9 * 1048576);
export async function diet(srcGlb, env, { q = 85, qn = 90, resample: RESAMPLE = true, budget = BUDGET } = {}) {
  const { PropertyType } = env.gltf.core, { ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization } = env.gltf.extensions;
  const { resample, prune } = env.gltf.functions, { MeshoptEncoder, MeshoptDecoder } = env.meshopt;
  await MeshoptEncoder.ready; await MeshoptDecoder.ready;
  const encoder = Object.assign(Object.create(MeshoptEncoder), { encodeGltfBuffer: (a, n, s, mode) => MeshoptEncoder.encodeGltfBuffer(a, n, s, mode === 'TRIANGLES' ? 'INDICES' : mode) });
  const io = new env.IO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': encoder });
  const doc = await io.readBinary(srcGlb);
  doc.setLogger({ debug() {}, info() {}, warn: (m) => env.log('warn', m), error: (m) => env.log('err', m) });
  const shareClipAccessors = () => {
    const keep = new Map(); let n = 0;
    const key = (a) => { const v = a.getArray(), b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength); let h = 2166136261 >>> 0; for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 16777619) >>> 0; }
      return [a.getType(), a.getComponentType(), a.getNormalized(), b.length, h].join('|'); };
    const same = (a, c) => { const x = a.getArray(), y = c.getArray(); if (x.byteLength !== y.byteLength) return false; const p = new Uint8Array(x.buffer, x.byteOffset, x.byteLength), r = new Uint8Array(y.buffer, y.byteOffset, y.byteLength); for (let i = 0; i < p.length; i++) if (p[i] !== r[i]) return false; return true; };
    for (const anim of doc.getRoot().listAnimations()) for (const s of anim.listSamplers()) for (const [get, set] of [['getInput', 'setInput'], ['getOutput', 'setOutput']]) {
      const a = s[get](); if (a.listParents().some((p) => p.propertyType !== PropertyType.ANIMATION_SAMPLER && p.propertyType !== PropertyType.ROOT)) continue;
      const k = key(a), had = keep.get(k);
      if (!had) keep.set(k, a); else if (had !== a && same(had, a)) { s[set](had); n++; }
    }
    return n;
  };
  shareClipAccessors();
  if (RESAMPLE) { await doc.transform(resample({ tolerance: 1e-4, cleanup: false })); shareClipAccessors(); }
  await doc.transform(prune({ propertyTypes: [PropertyType.ACCESSOR], keepAttributes: true, keepIndices: true, keepLeaves: true, keepSolidTextures: true, keepExtras: true }));
  const src = new Map(doc.getRoot().listTextures().filter((t) => /^image\/(png|jpeg)$/.test(t.getMimeType())).map((t) => [t, { img: t.getImage(), mime: t.getMimeType(), uri: t.getURI() }]));
  await env.toWebP(doc, { q, qn });
  doc.createExtension(KHRMeshQuantization).setRequired(true);
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  let glb = await io.writeBinary(doc);
  // (B6: the size budget: halve the texture that saves most until the GLB fits)
  const uses = (t) => t.listParents().filter((m) => m.propertyType === PropertyType.MATERIAL);
  const FACE = /^(skin|eyes?|iris|lashes|brows|teeth|tongue|mouth)/i, HAIR = /hair|beard|curls|braids|locs|twists|stubble|moustache/i;
  const weight = (t) => { const ms = uses(t); if (!ms.length || ms.some((m) => FACE.test(m.getName()))) return 0;
    const normal = ms.some((m) => m.getNormalTexture() === t), cloth = ms.some((m) => m.getExtras()?.kind === 'cloth'), hair = ms.some((m) => HAIR.test(m.getName()));
    return (normal ? 2 : 1) * (cloth ? 1.5 : 1) * (hair ? 0.6 : 1); };
  // (each texture halved once at most; and not at all when halving every one it may halve could not fit: a GLB over by
  // its geometry stays as it is, and the store refuses it, rather than losing every texture for nothing)
  const can = async () => { let save = 0; for (const [t, s] of src) { if (!s.w) { const { info } = await env.sharp(s.img).raw().toBuffer({ resolveWithObject: true }); s.w = info.width; s.h = info.height; } if (!s.half && s.w > 512 && weight(t)) save += t.getImage().byteLength * 0.7; } return save; };
  if (budget && glb.length > budget && glb.length - (await can()) > budget) env.log(`diet: ${(glb.length / 1048576).toFixed(2)} MB is over the budget by its geometry; textures kept`);
  else for (let n = 0; budget && glb.length > budget && n < 24; n++) {
    let best = null, bs = 0;
    for (const [t, s] of src) { const sc = !s.half && s.w > 512 ? t.getImage().byteLength * weight(t) : 0; if (sc > bs) { bs = sc; best = t; } }
    if (!best) break;
    const s = src.get(best), W = Math.max(512, s.w >> 1), H = Math.max(1, Math.round(s.h * W / s.w)), im = env.sharp(s.img).resize(W, H);
    s.img = await (s.mime === 'image/jpeg' ? im.jpeg({ quality: 92 }) : im.png()).toBuffer(); env.log(`diet: budget ${(glb.length / 1048576).toFixed(2)} MB, ${uses(best).map((m) => m.getName()).join('+')} ${uses(best).some((m) => m.getNormalTexture() === best) ? 'normal map' : 'texture'} ${s.w} -> ${W} px`); s.w = W; s.h = H; s.half = true;
    best.setImage(s.img).setMimeType(s.mime).setURI(s.uri);
    await env.toWebP(doc, { q, qn });
    glb = await io.writeBinary(doc);
  }
  const json = readJson(glb), sj = readJson(srcGlb);
  for (const bv of json.bufferViews) { const e = bv.extensions?.EXT_meshopt_compression; if (e && e.mode === 'TRIANGLES') e.mode = 'INDICES'; }
  // every node's transform as the source had it (the writer drops a scale or turn within 1e-5 of identity)
  if (sj.nodes.length !== json.nodes.length || sj.nodes.some((nd, i) => (nd.name ?? '') !== (json.nodes[i].name ?? ''))) throw new Error('diet: node order changed');
  json.nodes.forEach((nd, i) => { for (const k of ['translation', 'rotation', 'scale', 'matrix']) { delete nd[k]; if (sj.nodes[i][k]) nd[k] = sj.nodes[i][k]; } });
  return writeJson(glb, json);
}

const u32 = (b, o) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(o, true);
function readJson(buf) { const len = u32(buf, 12); return JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + len))); }
function writeJson(buf, json) {
  const len = u32(buf, 12), rest = buf.subarray(20 + len), t = new TextEncoder().encode(JSON.stringify(json)), pad = (4 - (t.length % 4)) % 4;
  const out = new Uint8Array(20 + t.length + pad + rest.length), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.length, true); dv.setUint32(12, t.length + pad, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(t, 20); out.fill(0x20, 20 + t.length, 20 + t.length + pad); out.set(rest, 20 + t.length + pad);
  return out;
}
