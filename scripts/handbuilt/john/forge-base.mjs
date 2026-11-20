// Hand-built John: his forge base, made the way Mr. Big's suit was (one layer): the forge's own modules (compile, core,
// post, diet and the uncovered gate; scripts/forge is not changed) with one change to the compiled config: the
// library's suit jacket (its separate suit, hem, collar and lapel shells read as jagged, torn edges in daylight) left
// out, so the base suit (MakeHuman's male_elegantsuit01: jacket, shirt, tie and trousers in one mesh, CC0) is worn whole.
//   node scripts/handbuilt/john/forge-base.mjs <sheet.json> <out.glb>
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
cfg.lib = (cfg.lib || []).filter((l) => !/^suit-jacket/.test(l.item));
// (and Mr. Big's shoulder fix (build-mrbig: shoulders brought in along the clavicles, binds moved to match) and a
// little more slope from the neck: the elegant suit's jacket otherwise reads as square pads from behind)
cfg.shoulder = +(process.env.HB_SHOULDER || 0.76); cfg.slope = { ...(cfg.slope || {}), drop: +(process.env.HB_SLOPE || 0.015) };
console.log('wear', JSON.stringify(cfg.wear), 'lib', JSON.stringify(cfg.lib.map((l) => l.item)), 'suit', JSON.stringify(cfg.suit));
const logs = [], env1 = { ...env, log: (...a) => logs.push(a.join(' ')) };
await loadFaceKit(env1); const a = await core(cfg, env1); const b = await post(a.glb, a.lm, env1); const glb = await diet(b.glb, env1);
const unc = await uncoveredGlb(glb, env);
fs.writeFileSync(out, glb); fs.writeFileSync(out.replace(/\.glb$/, '.core.log'), logs.join('\n'));
console.log(out, (glb.length / 1048576).toFixed(2), 'MB', 'uncovered', unc.pass, unc.worst, 'hands', JSON.stringify(b.report.hands), 'lm', JSON.stringify({ below: a.lm.below, front: a.lm.front, chin: a.lm.chin, ey: a.lm.ey }));
