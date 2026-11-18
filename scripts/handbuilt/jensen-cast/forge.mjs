// Jensen Heist's forged supporting cast (all invented people, no real likeness): each sheet in
// storykit/handbuilt/jensen-cast/ forged in Node with the forge's own modules (scripts/forge is not changed), Mr. Big's
// shoulder fix on the men (the arm joints in along the clavicles, a little more slope: no pad look, as John's base), then
// the light finish every hand-built person gets: wet eyes, the iris pass (no black-hole irises), the fingers slimmed, the
// daylight skin pass (the story plays in sun). Marge's headset is baked onto her head bone (headset.mjs: props are never
// drawn in game).
//   node scripts/handbuilt/jensen-cast/forge.mjs [id,id,...]      -> storykit/handbuilt/jensen-cast/<id>.glb
import fs from 'node:fs';
import { nodeEnv } from '../../forge/env-node.mjs';
import { compile } from '../../forge/compile.mjs';
import { core } from '../../forge/core.mjs';
import { post } from '../../forge/post.mjs';
import { diet } from '../../forge/diet.mjs';
import { loadFaceKit } from '../../forge/targets.mjs';
import { io, write } from '../young-hero/glb.mjs';
import { eyesPass } from '../young-hero/look.mjs';
import { fingerPass } from '../young-hero/p2.mjs';
import { irisPass } from '../old-boss/eyes.mjs';
import { daylightSkinPass } from '../daylight.mjs';
import { headsetPass } from './headset.mjs';
const DIR = new URL('../../../storykit/handbuilt/jensen-cast/', import.meta.url).pathname;
const want = process.argv[2]?.split(',');
const env = await nodeEnv(); await loadFaceKit(env);
const IRIS = { 'dark-brown': [52, 36, 26], brown: [86, 58, 38], hazel: [110, 86, 52], blue: [70, 96, 126], 'grey-blue': [92, 104, 116] };
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.sheet.json')).sort()) {
  const S = JSON.parse(fs.readFileSync(DIR + f, 'utf8')); if (want && !want.includes(S.id)) continue;
  const t0 = Date.now(), { cfg, log } = compile(S);
  if (S.identity.body === 'male') { cfg.shoulder = 0.76; cfg.slope = { ...(cfg.slope || {}), drop: 0.015 }; }
  const logs = [], env1 = { ...env, log: (...a) => logs.push(a.join(' ')) };
  const a = await core(cfg, env1), b = await post(a.glb, a.lm, env1), glb0 = await diet(b.glb, env1);
  const src = Buffer.from(glb0), doc = await io.readBinary(src); doc.setLogger({ debug() {}, info() {}, warn() {}, error: console.error });
  eyesPass(doc); await irisPass(doc, { base: IRIS[S.face.eyes] || IRIS.brown }); fingerPass(doc, { slim: 0.06 });
  if (S.id === 'marge') headsetPass(doc);
  await daylightSkinPass(doc, {});
  const out = await write(doc, src); fs.writeFileSync(DIR + S.id + '.glb', out);
  console.log(S.id, (out.length / 1048576).toFixed(2), 'MB', ((Date.now() - t0) / 1000).toFixed(1), 's', (log || []).filter((l) => /left off|guard|cap/.test(l)).join(' | '));
}
