// Hand-built Jensen (Jensen Heist's hero, a parody of a public keynote persona): his forge base. The forge's own modules
// (scripts/forge is not changed) with two changes to the compiled config: the top is MakeHuman's male_casualsuit05 (CC0:
// an open jacket over a shirt, one mesh), worn as it is ('tex') so the hand pass (wear.mjs) can repaint it panel by panel
// as a black leather moto jacket over a black tee; and Mr. Big's shoulder fix (the arm joints in along the clavicles, a
// little more slope from the neck: no shoulder pads), as John's base has.
//   node scripts/handbuilt/jensen/forge-base.mjs <sheet.json> <out.glb>
import fs from 'node:fs';
import { nodeEnv } from '../../forge/env-node.mjs';
import { compile } from '../../forge/compile.mjs';
import { core } from '../../forge/core.mjs';
import { post } from '../../forge/post.mjs';
import { diet } from '../../forge/diet.mjs';
import { loadFaceKit } from '../../forge/targets.mjs';
import { uncoveredGlb } from '../../forge/uncovered.mjs';
const [sheetF, out] = process.argv.slice(2), S = JSON.parse(fs.readFileSync(sheetF, 'utf8'));
const env = await nodeEnv(), { cfg } = compile(S);
// (the sheet's black tee stays, under the jacket: its crew neck shows in the jacket's open front; the jacket's own shirt
// pieces (a striped placket and collar) are taken off in the hand pass)
cfg.wear.push(['male_casualsuit05', 'top', [1, 1, 1], 'tex', { tint: [1, 1, 1] }]);
cfg.shoulder = +(process.env.HB_SHOULDER || 0.76); cfg.slope = { ...(cfg.slope || {}), drop: +(process.env.HB_SLOPE || 0.015) };
console.log('wear', JSON.stringify(cfg.wear), 'lib', JSON.stringify(cfg.lib.map((l) => l.item)));
const logs = [], env1 = { ...env, log: (...a) => logs.push(a.join(' ')) };
await loadFaceKit(env1); const a = await core(cfg, env1); const b = await post(a.glb, a.lm, env1); const glb = await diet(b.glb, env1);
const unc = await uncoveredGlb(glb, env);
fs.writeFileSync(out, glb); fs.writeFileSync(out.replace(/\.glb$/, '.core.log'), logs.join('\n'));
console.log(out, (glb.length / 1048576).toFixed(2), 'MB', 'uncovered', unc.pass, unc.worst, 'hands', JSON.stringify(b.report.hands), 'lm', JSON.stringify({ below: a.lm.below, front: a.lm.front, chin: a.lm.chin, ey: a.lm.ey }));
