// Story Kit forge: a copy of the Character Forge's runtime side (scripts/forge/clips-runtime.mjs, unchanged below its header), served
// beside portrait.html (the creator's browser's headshots). The check (scripts/storykit-pack-check.ts) keeps the two the same.
// THE CHARACTER FORGE, runtime side: the shared clip pack (cast-clips.glb, clips.mjs) bound to one forged character.
// Every forged person has the cast's 66-bone rig with the same bone names, so a pack clip drives them by name; two
// things differ per person and travel in the character's asset extras (forge.post.clips, written by post.mjs):
//   rootScale  the root's travel scaled by leg length (a short woman's stride is not Dan's)
//   armSplay   a heavier body's upper arms carried out from the sides (deg about the forward axis, in the shoulder's frame)
// The clips are retargeted once per (rootScale, armSplay) and cached, so a crowd of the same build shares them.
//   import { castClips } from './clips-runtime.mjs';
//   const clips = castClips(THREE, pack.animations, gltf.parser.json.asset.extras.forge);   // AnimationClip[]
const cache = new Map();
export function castClips(THREE, packClips, forge = {}) {
  const c = forge.post?.clips || {}, rootScale = c.rootScale ?? 1, splay = c.armSplay ?? forge.landmarks?.armSplay ?? 0;
  if (c.baked) return null; // (an older character with its own clips: use gltf.animations)
  const key = rootScale.toFixed(4) + '|' + splay.toFixed(2);
  let byPack = cache.get(packClips); if (!byPack) cache.set(packClips, (byPack = new Map()));
  if (byPack.has(key)) return byPack.get(key);
  const q = new THREE.Quaternion(), qa = { L: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), splay * Math.PI / 180), R: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -splay * Math.PI / 180) };
  const out = packClips.map((clip) => {
    const k = clip.clone();
    for (const t of k.tracks) {
      if (rootScale !== 1 && /^root\.position$/.test(t.name)) { t.values = Float32Array.from(t.values, (x) => x * rootScale); continue; }
      const side = splay && /^upperarm01_(L|R)\.quaternion$/.exec(t.name)?.[1];
      if (side) { const v = Float32Array.from(t.values); for (let i = 0; i < v.length; i += 4) { q.fromArray(v, i).premultiply(qa[side]).toArray(v, i); } t.values = v; }
    }
    return k;
  });
  byPack.set(key, out);
  return out;
}
