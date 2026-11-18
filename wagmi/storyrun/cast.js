// Mog City story runner: a world's people on the street. A cast member (by display name, the world's cast) is a body,
// a face, a voice and a colour:
//   - Mog City's own people (registry 'mogcity/*') are native: Jane, Gears and Fiona through their own builders
//     (mission/jane.js, m3-set.js), Mr. Big and the Suits from their shipped models (assets/characters); Dan is the
//     player's own body (W.dan) and never spawned twice. The registry's copies of these GLBs are never fetched.
//   - forged people are their world's GLB (allowed URLs only: pack.js asset()), on Dan's 66-bone rig: Dan's clips under
//     their own, the export's armature turn taken out as Dan's is, their surfaces finished for the close lens (polish.js),
//     and a face from face.js (its jaw, lips and lids found from the geometry: any MakeHuman-built body) that moves with
//     their voice.
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
import { relaxArms } from '../combat/suitarms.js';
import { unhang } from './pack.js';
import { polishBody } from './polish.js'; import { importRetry } from '../net.js';

// (8: a set's cutscene stands up to seven at once, the hero's double besides: sets.js)
const MAX = 8;
// the registry's people this repo ships, by model key: [builder, file]
const NATIVE = {
  'mogcity/jane': ['jane'], 'mogcity/gears': ['gears'], 'mogcity/fiona': ['fiona'],
  'mogcity/mrbig': ['glb', 'assets/characters/mrbig.glb'],
};
const SUIT = /^mogcity\/suit(-[a-z]+)?$/;
// a Suit's clip for one of Dan's names (wagmi/game.js), from the Suits' pack (assets/anim/suits-dan.glb)
const SUIT_CLIP = { idle: 'suitIdle', talk: 'suitIdle', phone: 'suitIdle', walk: 'suitWalk', walkCool: 'suitWalk2', walkHeavy: 'suitWalk', walkF: 'suitWalk',
  walkBack: 'suitBack', jog: 'jog', run: 'suitRun', sprint: 'suitDash', dash: 'suitDash', arms: 'suitIdleGuide', wave: 'suitTauntBye', shrug: 'suitTauntByebye',
  argue: 'suitIdleGuide', fight: 'guard', guardF: 'guard', guardL: 'suitLeft', guardR: 'suitRight', guardB: 'suitBack', jab: 'thugPunch1', cross: 'thugPunch2',
  hook: 'bruteSlam', hit: 'hitReact', hitChest: 'hitReact', hitHead: 'hitReact', fall: 'thugKnockdown', death: 'thugKnockdown', getup: 'thugGetUp' };
// a placeholder voice's pitch (Hz) for a line with no clip: the registry's where known, else by the cast's sheet
const F0 = { 'mogcity/dan': 110, 'mogcity/jane': 205, 'mogcity/mrbig': 95, 'mogcity/gears': 92, 'mogcity/fiona': 230 };

export function createCast(W, world) {
  const def = world.def, live = new Map(), order = [], doubles = new Map();
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
        // (fx: a line heard down a phone, a call's caller or a voicemail, plays through Mog City's phone band: the car phone too)
        if (url && V.clip(l.who, l.text, url, { dur: c?.secs || 0, fx: l.fx === 'phone' ? 'phone' : null })) n++;
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
      // (a world may stand someone a little shorter or taller: its cast's `scale`, 0.7 to 1.15; a stand-in teenager)
      if (typeof c.scale === 'number' && c.scale >= 0.7 && c.scale <= 1.15) f.root.scale.setScalar(c.scale);
      f.root.visible = true;
      return f;
    },
    // the hero's double: his own body as the cast's (his GLB on the clip pack, with a face), for a set's cutscene
    // (sets.js), where Dan's body (the player's, with the car) can't go; built once, kept
    async double(name) {
      if (doubles.has(name)) { const f = doubles.get(name); f.root.visible = true; return f; }
      const c = entry(name); if (!c || !(c.glb || c.model)) return null;
      let f = null; try { f = await build(name, c); } catch (err) { console.warn('[storyrun] double', name, err); return null; }
      if (f) doubles.set(name, f); return f;
    },
    remove(name) { const f = live.get(name); if (!f) return; f.dispose(); live.delete(name); const i = order.indexOf(name); if (i >= 0) order.splice(i, 1); },
    hide(name) { const f = live.get(name); if (f) f.root.visible = false; },
    clear() { for (const f of live.values()) f.dispose(); live.clear(); order.length = 0; },
    get live() { return [...live.keys()]; },
  };

  async function build(name, c) {
    const nat = c.model ? (SUIT.test(c.model) ? ['glb', 'assets/characters/thug.glb', true] : NATIVE[c.model]) : null;
    if (nat && nat[0] !== 'glb') {
      const m = nat[0] === 'jane' ? await importRetry(() => import('../mission/jane.js')).then((x) => x.buildJane(W)) : await importRetry(() => import('../mission/m3-set.js')).then((x) => (nat[0] === 'gears' ? x.buildGears(W) : x.buildFiona(W)));
      // (a stand-in's face answers to the world's name: Jane's body as Nina moves with Nina's lines, face.js face.speaker)
      if (m.face) m.face.speaker = name;
      return figureOf(name, m.root, m.mixer, m.bones, m.clips ? null : null, m.face, () => { scene.remove(m.root); }, m);
    }
    const url = nat ? nat[1] : world.asset(c.glb);
    if (!url) { console.warn('[storyrun] no allowed body for', name); return null; }
    const g = await loadGLB(url);
    const root = new THREE.Group(); root.name = 'storyrun-' + name.replace(/[^A-Za-z0-9]+/g, '-');
    const inner = skClone(g.scene); root.add(inner);
    // (a hand-built body's arm-hang bones levelled, as the hero's: pack.js unhang)
    unhang(inner);
    // (the export's armature turn out, as Dan's: wagmi/game.js)
    const arm = inner.getObjectByName('root')?.parent;
    if (arm && arm !== inner) { arm.quaternion.identity(); arm.position.y += c.model ? 0 : 0.02; }
    inner.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    // (a forged or hand-built body finished for the close lens: its cloth laid under the layer over it, soft hair edges,
    // its skin graded: polish.js; Mog City's own people as they shipped)
    if (!nat) try { polishBody(inner); } catch (err) { console.warn('[storyrun] polish', name, err); }
    if (nat && nat[2]) try { W.combat?.dressSuit?.(inner, 'a'); } catch {}
    const bones = {}; inner.traverse((o) => { if (o.isBone) bones[o.name] = o; });
    const mixer = new THREE.AnimationMixer(inner);
    const own = g.animations.slice(), names = new Set(own.map((a) => a.name)), suit = !!(nat && nat[2]);
    // (a Suit moves as the fight's Suits do: their pack, Dan's clips retargeted onto thug.glb's rig (combat/index.js),
    // a name of Dan's played as its Suit clip, standing by default: Dan's own clips only move a Suit's head (the rigs share
    // no other bone name), which left him in the rig's bind pose)
    if (suit) {
      const pack = await loadGLB('assets/anim/suits-dan.glb').catch(() => null);
      for (const a of pack?.animations || []) { const i = own.findIndex((x) => x.name === a.name); if (i >= 0) own[i] = a; else own.push(a); names.add(a.name); }
      try { relaxArms(own, g.scene); } catch {}
    } else for (const a of await clipsOfDan()) if (!names.has(a.name)) own.push(a);
    const find = (n) => (n ? THREE.AnimationClip.findByName(own, n) : null);
    const clip = suit ? (n) => find(n) || find(SUIT_CLIP[n]) : find;
    const idle = clip(c.idle) || (suit && find('suitIdle')) || clip('idle') || clip('thugIdle');
    if (idle) {
      const a = mixer.clipAction(idle); a.play();
      // (a forged person's idle from their own moment in it and at their own pace, by their name: two people on one set
      // no longer shift their weight in step, a still figure doesn't read as a clip on a loop)
      if (!nat) { let h = 2166136261; for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; a.time = (h % 997) / 997 * idle.duration; a.timeScale = 0.92 + ((h >>> 10) % 160) / 1000; }
    }
    let face = null;
    try { face = createFace(W, { speaker: name, inner, bones, head: true, open: 0.45 }); } catch (err) { console.warn('[storyrun] face', name, err.message); }
    scene.add(root);
    const f = figureOf(name, root, mixer, bones, own, face, () => {
      scene.remove(root);
      if (face) try { dropFace(W, face); } catch {}
      inner.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); for (const m of [].concat(o.material || [])) { for (const k of Object.keys(m)) if (m[k]?.isTexture) m[k].dispose(); m.dispose?.(); } } });
    });
    // (its clips by name, Dan's under its own: a fight's puppet (runner.js STEPS.fight) crossfades them itself)
    f.clip = clip;
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
    // (a body held still: an opening's name card freezes its frame on them, runner.js openCard)
    // (then a set's arms over the clip: a hug, a hand held: sets.js post)
    for (const f of [...live.values(), ...doubles.values()]) if (!f.hold) try { f.update(dt); f.post?.(dt); gazeStep(f, dt); } catch {}
  })();
  return cast;
}

// Who they look at in a cutscene (the owner's bar, 17 Nov: Colter Land's OF-2 close-up on Wade framed the crown of his
// cap: his idle hangs his head 25-45 degrees, so a lens at his eyes saw the top of it). While a cutscene runs and the
// runner has given a body someone to look at (f.gaze = () => a world point, their head: runner.js shotGaze), the head
// and neck are turned over the clip toward them, the head's lean taken out: the face comes up and round to who they
// talk to, within GAZE.yaw of the way the body faces and GAZE.pitch up or down, eased in and out (GAZE.ease /s); the
// neck takes GAZE.neck of the turn, the head the rest. Every forged body is on Dan's rig, whose head bone faces +Z; a rig
// whose head's +Z is not ahead of its body (a native body of another make) is left as its clip has it.
export const GAZE = { yaw: 1.15, pitch: 0.32, weight: 0.88, neck: 0.45, ease: 3.5 };
const _gq = [0, 1, 2, 3, 4].map(() => new THREE.Quaternion()), _gv = [0, 1, 2, 3].map(() => new THREE.Vector3()), _gm = new THREE.Matrix4();
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// the head's way for a body at heading h looking from its head (hp) to P: [yaw, pitch], held within GAZE's reach
export function gazeAim(hp, P, h) {
  const dx = P.x - hp.x, dy = P.y - hp.y, dz = P.z - hp.z;
  const yaw = h + Math.max(-GAZE.yaw, Math.min(GAZE.yaw, wrapA(Math.atan2(dx, dz) - h)));
  const pitch = Math.max(-GAZE.pitch, Math.min(GAZE.pitch, Math.atan2(dy, Math.hypot(dx, dz) || 1e-6)));
  return [yaw, pitch];
}
function gazeStep(f, dt) {
  const want = f.gaze && !f.noGaze && f.root.visible && globalThis.window?.WAGMI?.cutscene ? GAZE.weight : 0;
  f._gw = (f._gw || 0) + (want - (f._gw || 0)) * Math.min(1, dt * GAZE.ease);
  if (f._gw < 0.01 || !f.gaze) return;
  const hb = f.bones?.head, nb = f.bones?.neck01 || f.bones?.neck;
  if (!hb || !nb || !nb.parent || !hb.parent) { f.noGaze = true; return; }
  let P = null; try { P = f.gaze(); } catch { P = null; }
  if (!P) return;
  f.root.updateMatrixWorld(true);
  const hp = hb.getWorldPosition(_gv[0]), hq = hb.getWorldQuaternion(_gq[0]);
  const h = f.root.rotation.y;
  // (the rig's own way, once: the head's +Z ahead of the body, or this body is left alone)
  if (f._gok == null) { const z = _gv[1].set(0, 0, 1).applyQuaternion(hq); const n = Math.hypot(z.x, z.z) || 1; f._gok = (z.x * Math.sin(h) + z.z * Math.cos(h)) / n > 0.2; if (!f._gok) { f.noGaze = true; return; } }
  const [yaw, pitch] = gazeAim(hp, P, h);
  const d = _gv[1].set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const up = _gv[2].set(0, 1, 0).addScaledVector(d, -d.y).normalize(), x = _gv[3].crossVectors(up, d).normalize();
  const want_ = _gq[1].setFromRotationMatrix(_gm.makeBasis(x, up, d));
  // (the turn in the world, from where the clip has the head, by the weight; the neck's share first)
  const full = _gq[2].copy(want_).multiply(_gq[3].copy(hq).invert());
  full.copy(_gq[4].identity().slerp(full, f._gw));
  const half = _gq[3].identity().slerp(full, GAZE.neck);
  const nq = nb.getWorldQuaternion(_gq[1]).premultiply(half);
  nb.quaternion.copy(nb.parent.getWorldQuaternion(_gq[4]).invert().multiply(nq)); nb.updateMatrixWorld(true);
  const hq2 = _gq[1].copy(full).multiply(hq);
  hb.quaternion.copy(hb.parent.getWorldQuaternion(_gq[4]).invert().multiply(hq2)); hb.updateMatrixWorld(true);
}
