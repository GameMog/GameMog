// THE CHARACTER FORGE: sheet -> GLB, in memory, on a platform (FB, browser port). The same function runs in Node
// (forge.mjs, the CLI: env-node.mjs) and in a creator's browser (public/storykit/forge/forge.js: env-browser.mjs).
//   forgeSheet(sheet, env) -> { glb: Uint8Array, rec (times, size, clamps, landmarks, checks), cfg, lm, coreInfo, raw, postGlb }
import { compile } from './compile.mjs';
import { core } from './core.mjs';
import { post } from './post.mjs';
import { diet } from './diet.mjs';
import { loadFaceKit } from './targets.mjs';

const now = () => (globalThis.performance ? performance.now() : Date.now());
export async function forgeSheet(S, env) {
  const t0 = now(); const { cfg, log } = compile(S); const tc = now() - t0;
  const logs = []; const env1 = { ...env, log: (...a) => { logs.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); if (env.verbose) env.log(...a); } };
  const t1 = now(); await loadFaceKit(env1); const a = await core(cfg, env1); const ta = now() - t1;
  const t2 = now(); const b = await post(a.glb, a.lm, env1); const tb = now() - t2;
  const t3 = now(); const glb = await diet(b.glb, env1); const td = now() - t3;
  const lm = a.lm, coreLog = logs.join('\n');
  // checks the rules promise: teeth built, hands in band, the lips found (or carried: landmarks), shoulders inside their
  // band, no stray clamps
  const checks = { teeth: /teeth \d+ points/.test(coreLog), lipsFound: !!lm.below, lids: lm.lids, landmarks: lm.source || null, hands: b.report.hands, shoulder: cfg.shoulder, rootScale: b.report.clips.rootScale, armSplay: b.report.clips.armSplay, groundFixMm: b.report.clips.groundFixMm, clips: b.report.clips.clips, clipPack: b.report.clips.pack, tris: a.info.tris, face: a.info.face };
  const ms = { compile: Math.round(tc), core: Math.round(ta), post: Math.round(tb), diet: Math.round(td) }; ms.total = ms.compile + ms.core + ms.post + ms.diet;
  const rec = { id: S.id, name: S.name, platform: env.name, ms, sizeMB: +(glb.length / 1048576).toFixed(2), clamps: log, mouth: { below: lm.below, front: lm.front, chin: lm.chin }, checks };
  return { glb, rec, cfg, lm, coreInfo: a.info, coreLog, raw: a.glb, postGlb: b.glb, postReport: b.report };
}
