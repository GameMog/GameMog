// Mog City: a face with its morphs baked in (18 Nov, the talk track; the contract: docs/FACE-CONTRACT.md). A cast GLB
// may carry ARKit-style morph targets by the MakeHuman Faceunits 01 / Visemes 02 names (CC0): eyeBlinkLeft/Right,
// jawOpen, mouthSmileLeft/Right, cheekSquint*, eyeSquint*, browInnerUp, browOuterUp*, mouthClose, eyeLook*, and the 15
// visemes viseme_sil .. viseme_U. face.js then drives those instead of making its own from the geometry (which would
// throw the GLB's away). Pure: no three.js here, only meshes with morphTargetDictionary / morphTargetInfluences.
//   bakedMeshes(root)              the model's meshes with any of the names, when one of them has jawOpen or
//                                  eyeBlinkLeft (a baked face); else null (face.js makes its own, as before)
//   visemeAt(text, k)              the viseme of the line's words k of the way through it (0..1): letters to the 15
//                                  shapes (digraphs th, ch, sh; a space or a stop is sil), spread evenly over the line
//   createBakedFace(meshes, opt)   -> { has, set, jaw(k), blink(b), brow(b), look(x, y), frame(o) }: frame() each frame
//                                  with { dt, mouth 0..1, blink, brow, lookX, lookY, how, talking, text, t, dur };
//                                  opt { smile: resting smile 0..0.4, open: the jaw's scale }
export const FACE_NAMES = ['eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen', 'mouthClose', 'mouthSmileLeft', 'mouthSmileRight', 'cheekSquintLeft', 'cheekSquintRight',
  'eyeSquintLeft', 'eyeSquintRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight', 'eyeLookUpLeft', 'eyeLookUpRight', 'eyeLookDownLeft', 'eyeLookDownRight',
  'eyeLookInLeft', 'eyeLookInRight', 'eyeLookOutLeft', 'eyeLookOutRight', 'eyeWideLeft', 'eyeWideRight', 'mouthFrownLeft', 'mouthFrownRight', 'mouthPucker', 'mouthFunnel'];
export const VISEMES = ['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U'];
const ALL = new Set([...FACE_NAMES, ...VISEMES.map((v) => 'viseme_' + v)]);
// (a smile on a line said so; 'warm' the grin)
export const SMILE_HOW = { warm: 0.45, tease: 0.38, smug: 0.32 };
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

export function bakedMeshes(root) {
  const out = []; let key = false;
  const visit = (o) => {
    const d = o.morphTargetDictionary;
    if (d && o.morphTargetInfluences && Object.keys(d).some((k) => ALL.has(k))) { out.push(o); if ('jawOpen' in d || 'eyeBlinkLeft' in d) key = true; }
    for (const c of o.children || []) visit(c);
  };
  if (root) visit(root);
  return key ? out : null;
}

// letters to visemes (English spelling, roughly: good enough to shape the lips in time with the words)
const ONE = { p: 'PP', b: 'PP', m: 'PP', f: 'FF', v: 'FF', t: 'DD', d: 'DD', k: 'kk', g: 'kk', c: 'kk', q: 'kk', x: 'kk', j: 'CH', s: 'SS', z: 'SS',
  n: 'nn', l: 'nn', r: 'RR', a: 'aa', e: 'E', i: 'I', y: 'I', o: 'O', u: 'U', w: 'U', h: 'sil' };
export function visemeSeq(text) {
  const s = String(text || '').toLowerCase(), out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if (c === 't' && n === 'h') { out.push('TH'); i++; continue; }
    if ((c === 'c' || c === 's') && n === 'h') { out.push('CH'); i++; continue; }
    if (/[a-z]/.test(c)) out.push(ONE[c] || 'sil');
    else if (/[0-9]/.test(c)) out.push('E');
    else if (/[\s,.;:!?'"’\-]/.test(c)) { if (out[out.length - 1] !== 'sil') out.push('sil'); }
  }
  return out.length ? out : ['sil'];
}
const seqCache = new Map();
export function visemeAt(text, k) {
  let q = seqCache.get(text); if (!q) { q = visemeSeq(text); seqCache.set(text, q); if (seqCache.size > 200) seqCache.delete(seqCache.keys().next().value); }
  return q[Math.min(q.length - 1, Math.max(0, Math.floor(clamp(k) * q.length)))];
}

export function createBakedFace(meshes, { smile = 0, open = 0.45 } = {}) {
  const idx = new Map();
  for (const m of meshes) for (const [k, i] of Object.entries(m.morphTargetDictionary)) if (ALL.has(k)) (idx.get(k) || idx.set(k, []).get(k)).push([m, i]);
  const has = (k) => idx.has(k);
  const set = (k, x) => { const l = idx.get(k); if (l) for (const [m, i] of l) m.morphTargetInfluences[i] = x; };
  const vis = VISEMES.filter((v) => has('viseme_' + v)), lips = vis.length >= 3;
  const w = Object.fromEntries(vis.map((v) => [v, 0]));
  const S = { smile: clamp(smile, 0, 0.4), smileNow: clamp(smile, 0, 0.4), jaw: 0 };
  const F = {
    has, set, visemes: vis,
    // the mouth, 0..1 (face.js's jaw: the voice's envelope times the cap): jawOpen, half of it when the lips shape the words
    jaw(k) { S.jaw = clamp(k, 0, 1); set('jawOpen', clamp(S.jaw * (0.55 / Math.max(0.2, open)) * (lips ? 0.55 : 1), 0, 0.6)); set('mouthClose', S.jaw < 0.04 ? 0.08 : 0); },
    blink(b) { set('eyeBlinkLeft', clamp(b)); set('eyeBlinkRight', clamp(b)); },
    brow(b) { set('browInnerUp', clamp(b) * 0.8); set('browOuterUpLeft', clamp(b) * 0.4); set('browOuterUpRight', clamp(b) * 0.4); },
    // the eyes: x toward their left (-1 .. 1), y up; a body without the look morphs keeps them still (dark glasses)
    look(x, y) {
      x = clamp(x, -1, 1); y = clamp(y, -1, 1);
      set('eyeLookOutLeft', Math.max(0, x)); set('eyeLookInRight', Math.max(0, x)); set('eyeLookInLeft', Math.max(0, -x)); set('eyeLookOutRight', Math.max(0, -x));
      set('eyeLookUpLeft', Math.max(0, y)); set('eyeLookUpRight', Math.max(0, y)); set('eyeLookDownLeft', Math.max(0, -y)); set('eyeLookDownRight', Math.max(0, -y));
    },
    smileTo(x) { S.smile = clamp(x, 0, 0.6); },
    get state() { return { smile: S.smileNow, jaw: S.jaw, visemes: { ...w } }; },
    // each frame: the smile (a warm line's grin, eased in a quarter second; the resting one else), the lips' shape
    frame({ dt = 0.016, mouth = 0, how = null, talking = false, text = '', t = 0, dur = 0 } = {}) {
      const want = Math.max(S.smile, talking && SMILE_HOW[how] ? SMILE_HOW[how] : 0) * (talking && mouth > 0.6 ? 0.8 : 1);
      S.smileNow += (want - S.smileNow) * (1 - Math.exp(-dt / 0.25));
      const sm = S.smileNow;
      set('mouthSmileLeft', sm); set('mouthSmileRight', sm); set('cheekSquintLeft', sm * 0.55); set('cheekSquintRight', sm * 0.55); set('eyeSquintLeft', sm * 0.3); set('eyeSquintRight', sm * 0.3);
      const sad = talking && how === 'sad' ? 0.35 : 0, scared = talking && how === 'scared' ? 0.4 : 0;
      set('mouthFrownLeft', sad); set('mouthFrownRight', sad); set('eyeWideLeft', scared); set('eyeWideRight', scared);
      if (lips) {
        const v = talking && mouth > 0.02 && dur > 0 ? visemeAt(text, t / dur) : 'sil', k = 1 - Math.exp(-dt / 0.045);
        for (const x of vis) { w[x] += ((x === v ? (x === 'sil' ? 0.3 : clamp(0.35 + mouth * 0.75)) : 0) - w[x]) * k; set('viseme_' + x, w[x]); }
      }
    },
  };
  return F;
}
