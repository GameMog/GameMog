// Jensen Heist: Jensen himself held to the owner's hard rules (the finalize, step B, 20 Nov). The rules were first given
// about him: rule 1, a FLAT, near-VERTICAL jacket front from the chest to the belt (no mound, no belly, no slant), and 1c
// (the belt at most 15 mm ahead of the sternum); rule 2, an upright seat (the ears over the shoulders). Measured with the
// cast's own rules (jensen-cast/rules.mjs), the same numbers for every body. Before this pass he failed all three: front
// 30.7 mm standing / 35.8 mm seated, belt 43 / 51.5 mm ahead of the sternum, the seated head 3.6 cm forward.
// A post-process on the built jensen.glb (his face, hair, glasses, skin texture, height and proportions untouched; the
// jacket's zip, chest zip pocket, band collar, snaps, quilted shoulders and leather all move with the front, never cut):
//   1. seatUprightPass (jensen-cast/castpass5.mjs): his own 'sit' and 'sitTalk' with the chest a rigid board on the waist
//      and the ears over the shoulders by the upper neck (the head's world turn kept: the gaze and the chin as they were).
//   2. vertFrontPass (jensen-cast/castpass6.mjs): the jacket front (and the shirt and the skin under it, together) pulled
//      BACK toward a near-vertical line dropped from the sternum, never forward; the collar's ring round the neck left.
//   3. the skin's sheen: the GLB's KHR_materials_sheen colour was an orange-red [0.2, 0.07, 0.045]; under the stage's hard
//      key (ST-8, a 120-unit spot) that broad warm lobe stacked on the warm base and read orange. Taken to a near-neutral
//      faint sheen (SHEEN), so the face keeps round 9's light-medium tone in every set; the texture is not touched.
//   node scripts/handbuilt/jensen/rules-b.mjs <in.glb> <out.glb> [K json]
// Original procedural work, CC0.
import fs from 'node:fs';
import { read, write, io } from '../young-hero/glb.mjs';
import { seatUprightPass } from '../jensen-cast/castpass5.mjs';
import { vertFrontPass } from '../jensen-cast/castpass6.mjs';
import { measureBody, verdict } from '../jensen-cast/rules.mjs';

// his own seated clips from Dan's (the game's hero plays Dan's: MogCity storyrun/pack.js heroGLTF puts dan.glb's clips
// first, and every cast double of him shares that cached GLB): his GLB's own sit and sitTalk had decoded to a torso laid flat
// (spine05 [0, .707, .707, 0], idle and talk too; three.js reads them so), so they are taken again from Dan's, as floats,
// every channel whose bone he has, before the upright pass solves them
export function danSeatClips(doc, dan, names = ['sit', 'sitTalk']) {
  const R = doc.getRoot(), buf = R.listBuffers()[0], byName = new Map(R.listNodes().map((n) => [n.getName(), n]));
  for (const a of R.listAnimations()) if (names.includes(a.getName())) a.dispose();
  for (const src of dan.getRoot().listAnimations()) { if (!names.includes(src.getName())) continue;
    const an = doc.createAnimation(src.getName());
    for (const ch of src.listChannels()) { const node = byName.get(ch.getTargetNode()?.getName()); if (!node) continue; const s = ch.getSampler(), o = s.getOutput(), n = o.getCount(), es = o.getElementSize(), F = new Float32Array(n * es), e = new Array(es);
      for (let i = 0; i < n; i++) { o.getElement(i, e); if (es === 4) { const l = Math.hypot(...e) || 1; for (let q = 0; q < 4; q++) e[q] /= l; } F.set(e, i * es); }
      const smp = doc.createAnimationSampler().setInput(doc.createAccessor().setType('SCALAR').setArray(Float32Array.from(s.getInput().getArray())).setBuffer(buf)).setOutput(doc.createAccessor().setType(o.getType()).setArray(F).setBuffer(buf)).setInterpolation(s.getInterpolation());
      an.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(ch.getTargetPath()).setSampler(smp)); } }
}

export const SHEEN = { color: [0.045, 0.036, 0.032], rough: 0.6 };

export function sheenPass(doc, S = SHEEN) {
  const m = doc.getRoot().listMaterials().find((x) => x.getName() === 'skin'); if (!m) return null;
  const e = m.listExtensions().find((x) => x.extensionName === 'KHR_materials_sheen'); if (!e) return null;
  const was = e.getSheenColorFactor(); e.setSheenColorFactor(S.color).setSheenRoughnessFactor(S.rough); return was;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const [inp, out, kj] = process.argv.slice(2), K = kj ? JSON.parse(kj) : {};
  const pack = await io.read(new URL('../../../public/storykit/cast/cast-clips.glb', import.meta.url).pathname);
  const { doc, src } = await read(inp);
  const dan = await io.read((process.env.FORGE_MOGCITY || '/Users/sheed/Desktop/GameMog/MogCity') + '/assets/characters/dan.glb');
  if (!K.noClips) danSeatClips(doc, dan, K.clips || ['sit', 'sitTalk']);
  // (his own idle, talk, phone and arms decode the same way, a torso laid flat: dropped, so any player of his own clips falls
  // back to Dan's (MogCity storyrun/cast.js adds Dan's for every name a body lacks), which is what the game plays today)
  if (!K.keepStanding) for (const a of doc.getRoot().listAnimations()) if (['idle', 'talk', 'phone', 'arms'].includes(a.getName())) { for (const s of a.listSamplers()) { const i = s.getInput(), o = s.getOutput(); s.dispose(); if (i && !i.listParents().some((p) => p.propertyType !== 'Root')) i.dispose(); if (o && !o.listParents().some((p) => p.propertyType !== 'Root')) o.dispose(); } a.dispose(); }
  if (K.measureDan) { const m = measureBody(doc, pack); console.log(`Dan's own seated clips as the game plays them (before any pass): seat bulge ${(m.seat.dev * 1000).toFixed(1)} mm @${m.seat.clip}@${m.seat.t}, sink ${(m.seatSink.sink * 1000).toFixed(1)}, 1c seat ${(m.seatAhead.ahead * 1000).toFixed(1)} mm, ears ${(m.head.o * 100).toFixed(1)} .. ${(m.headMin.o * 100).toFixed(1)} cm`); }
  if (!K.noSeat) seatUprightPass(doc, { pack, ...(K.seat || {}) });
  if (!K.noFront) vertFrontPass(doc, K.front || {});
  if (!K.noSheen) console.log('skin sheen', JSON.stringify(sheenPass(doc)), '->', JSON.stringify(SHEEN));
  const glb = await write(doc, src); fs.writeFileSync(out, glb);
  const m = measureBody(doc, pack), v = verdict(m, glb.length, 'jensen'), mm = (x) => (x * 1000).toFixed(1);
  console.log(`${out} ${glb.length} bytes | front ${mm(m.st.dev)} / seat ${mm(m.seat.dev)} mm (sink ${mm(m.st.sink)} / ${mm(m.seatSink.sink)}), below belt ${mm(m.low.dev)} | 1c ahead ${mm(m.st.ahead)} / ${mm(m.seatAhead.ahead)} mm | ears ${(m.head.o * 100).toFixed(1)} .. ${(m.headMin.o * 100).toFixed(1)} cm | ${JSON.stringify(v)}`);
}
