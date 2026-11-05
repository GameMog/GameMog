// Mog City story runner: a world's people on the street. A cast member (by display name, the world's cast) is a body,
// a face, a voice and a colour:
//   - Mog City's own people (registry 'mogcity/*') are native: Jane, Gears and Fiona through their own builders
//     (mission/jane.js, m3-set.js), Mr. Big and the Suits from their shipped models (assets/characters); Dan is the
//     player's own body (W.dan) and never spawned twice. The registry's copies of these GLBs are never fetched.
//   - forged people are their world's GLB (allowed URLs only: pack.js asset()), on Dan's 66-bone rig: Dan's clips under
//     their own, the export's armature turn taken out as Dan's is, and a face from face.js (its jaw, lips and lids found
//     from the geometry: any MakeHuman-built body) that moves with their voice.
//   - the voice: each line of the world's voice plan with a clip is given to W.voice (radio/voices.js clip), so it plays
//     through the same chain as Mog City's own lines (subtitle, ducking, the phone filter, the mouth); a line with no
//     clip is its subtitle and Mog City's mumble at the speaker's pitch.
//   createCast(W, world) -> { color(name), f0(name), spawn(name, { x, z, heading }) -> figure, get(name), clear(),
//                             registerVoices(), isHero(name), native(name) }
//   figure: { name, root, head(v) (their eyes' world point), heading, at(x, z, h), dispose() }
// At most MAX bodies are kept (the oldest let go past it: geometry and textures disposed).
import * as THREE from 'three/webgpu';
import { loadGLB } from '../glb.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { createFace, dropFace } from '../face.js';

const MAX = 6;
// the registry's people this repo ships, by model key: [builder, file]
const NATIVE = {
  'mogcity/jane': ['jane'], 'mogcity/gears': ['gears'], 'mogcity/fiona': ['fiona'],
  'mogcity/mrbig': ['glb', 'assets/characters/mrbig.glb'],
};
const SUIT = /^mogcity\/suit(-[a-z]+)?$/;
// a placeholder voice's pitch (Hz) for a line with no clip: the registry's where known, else by the cast's sheet
const F0 = { 'mogcity/dan': 110, 'mogcity/jane': 205, 'mogcity/mrbig': 95, 'mogcity/gears': 92, 'mogcity/fiona': 230 };

export function createCast(W, world) {
  const def = world.def, live = new Map(), order = [];
  const scene = W.app.scene, cm = W.app.controllerManager;
  let danClips = null;
  const clipsOfDan = () => danClips || (danClips = loadGLB('assets/characters/dan.glb').then((g) => g.animations).catch(() => []));
  const entry = (name) => world.castOf(name);
  const cast = {
    color(name) { const c = entry(name); return (c && c.color) || '#FFFFFF'; },
    f0(name) { const c = entry(name); if (c?.model && F0[c.model]) return F0[c.model]; const v = def.voice?.cast?.[name]?.block; const fem = v && /^[ab]f_/.test(v.base || ''); return (fem ? 205 : 118) * Math.pow(2, (v?.pitch || 0) / 12); },
    isHero: (name) => !!name && name === world.heroName,
    native: (name) => !!entry(name)?.model,
    get: (name) => live.get(name) || null,
    // the voice plan's clips into W.voice (a recorded registry line needs nothing: its words find its recording)
    registerVoices() {
      const V = W.voice, plan = def.voice; if (!V?.clip || !plan) return 0;
      let n = 0;
      for (const l of plan.lines || []) {
        if (l.rec) continue;
        const c = plan.clips?.[l.clip];
        const raw = c?.url || (plan.dir != null && l.clip ? `${plan.dir}${l.clip}.ogg` : null);
        const url = raw && world.asset(raw);
        if (url && V.clip(l.who, l.text, url, { dur: c?.secs || 0 })) n++;
      }
      return n;
    },
    async spawn(name, at = null) {
      if (live.has(name)) { const f = live.get(name); if (at) f.at(at.x, at.z, at.heading ?? f.heading); f.root.visible = true; return f; }
      const c = entry(name);
      if (!c || c.voiceOnly || c.pet) return null;
      if (cast.isHero(name)) return null;
      let f = null;
      try { f = await build(name, c); } catch (err) { console.warn('[storyrun] cast', name, err); return null; }
      if (!f) return null;
      live.set(name, f); order.push(name);
      while (order.length > MAX) { const old = order.shift(); live.get(old)?.dispose(); live.delete(old); }
      if (at) f.at(at.x, at.z, at.heading ?? 0);
      f.root.visible = true;
      return f;
    },
    remove(name) { const f = live.get(name); if (!f) return; f.dispose(); live.delete(name); const i = order.indexOf(name); if (i >= 0) order.splice(i, 1); },
    hide(name) { const f = live.get(name); if (f) f.root.visible = false; },
    clear() { for (const f of live.values()) f.dispose(); live.clear(); order.length = 0; },
    get live() { return [...live.keys()]; },
  };

  async function build(name, c) {
    const nat = c.model ? (SUIT.test(c.model) ? ['glb', 'assets/characters/thug.glb', true] : NATIVE[c.model]) : null;
    if (nat && nat[0] !== 'glb') {
      const m = nat[0] === 'jane' ? await import('../mission/jane.js').then((x) => x.buildJane(W)) : await import('../mission/m3-set.js').then((x) => (nat[0] === 'gears' ? x.buildGears(W) : x.buildFiona(W)));
      return figureOf(name, m.root, m.mixer, m.bones, m.clips ? null : null, m.face, () => { scene.remove(m.root); }, m);
    }
    const url = nat ? nat[1] : world.asset(c.glb);
    if (!url) { console.warn('[storyrun] no allowed body for', name); return null; }
    const g = await loadGLB(url);
    const root = new THREE.Group(); root.name = 'storyrun-' + name.replace(/[^A-Za-z0-9]+/g, '-');
    const inner = skClone(g.scene); root.add(inner);
    // (the export's armature turn out, as Dan's: wagmi/game.js)
    const arm = inner.getObjectByName('root')?.parent;
    if (arm && arm !== inner) { arm.quaternion.identity(); arm.position.y += c.model ? 0 : 0.02; }
    inner.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    if (nat && nat[2]) try { W.combat?.dressSuit?.(inner, 'a'); } catch {}
    const bones = {}; inner.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    const mixer = new THREE.AnimationMixer(inner);
    const own = g.animations.slice(), names = new Set(own.map((a) => a.name));
    for (const a of await clipsOfDan()) if (!names.has(a.name)) own.push(a);
    const clip = (n) => THREE.AnimationClip.findByName(own, n);
    const idle = clip(c.idle) || clip('idle') || clip('thugIdle');
    if (idle) { const a = mixer.clipAction(idle); a.play(); }
    let face = null;
    try { face = createFace(W, { speaker: name, inner, bones, head: true, open: 0.45 }); } catch (err) { console.warn('[storyrun] face', name, err.message); }
    scene.add(root);
    const f = figureOf(name, root, mixer, bones, own, face, () => {
      scene.remove(root);
      if (face) try { dropFace(W, face); } catch {}
      inner.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); for (const m of [].concat(o.material || [])) { for (const k of Object.keys(m)) if (m[k]?.isTexture) m[k].dispose(); m.dispose?.(); } } });
    });
    f.play = (n, loop = true) => { const cl = clip(n); if (!cl) return false; mixer.stopAllAction(); const a = mixer.clipAction(cl); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = !loop; a.play(); return true; };
    return f;
  }
  function figureOf(name, root, mixer, bones, clips, face, dispose, nativeP = null) {
    const f = {
      name, root, mixer, bones, face, heading: 0, native: nativeP,
      at(x, z, h = f.heading) { f.heading = h; root.position.set(x, cm.getGroundHeight(x, z, 'person'), z); root.rotation.y = h; root.visible = true; },
      head(v = new THREE.Vector3()) { const b = bones.head; if (b) { b.getWorldPosition(v); return v; } return v.copy(root.position).setY(root.position.y + 1.6); },
      lookAt(p) { if (!p) return; f.heading = Math.atan2(p.x - root.position.x, p.z - root.position.z); root.rotation.y = f.heading; },
      update(dt) { if (root.visible && mixer && !nativeP?.rig?.active) mixer.update(dt); },
      dispose,
    };
    if (nativeP && nativeP.rig && !f.play) {
      const have = nativeP.clips || [];
      const pick = have.includes('idle') ? 'idle' : have.includes('thugIdle') ? 'thugIdle' : have[0];
      if (pick) try { nativeP.rig.set([[0, pick]]); } catch {}
      let t = 0; f.update = (dt) => { if (!root.visible) return; t += dt; try { nativeP.rig.pose(t); } catch { mixer?.update(dt); } };
    }
    return f;
  }
  // every live body's clips each frame (the pause holds them)
  let last = performance.now();
  (function tick() {
    requestAnimationFrame(tick);
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (W.paused) return;
    for (const f of live.values()) try { f.update(dt); } catch {}
  })();
  return cast;
}
