// Hand-built Jensen (Jensen Heist's hero, a parody of a public keynote persona): his forge base. The forge's own modules
// (scripts/forge is not changed) with changes to the compiled config only:
//  - round 4 (owner: "the jacket reads as a sleeveless vest", "can't see arms"): the jacket is now the forge library's
//    own tailored jacket, cut from his body (natural shoulders, full sleeves to the wrist that bend with his arms, a
//    turned collar and lapels; library.mjs), registered here as 'moto-jacket': the double-breasted cut, whose front
//    edge runs off to one side (a moto jacket's asymmetric closure), hemmed short at the belt, its cloth leather
//    (FABRIC 'leather': the library's pebbled grain and a leather's roughness); the hand pass (moto.mjs) paints it as
//    black leather with the zips. Its buttons are taken off in the hand pass.
//    Its collar sits close on the neck and the shoulders' tops are stiff (the library's snug option, collarGap): in the
//    talk clip the loose collar and lapels stood up beside the neck as leather shards.
//  - the sheet's black tee stays under it, and its dark jeans
//  - Mr. Big's shoulder fix (the arm joints in along the clavicles, a little more slope from the neck: no shoulder pads),
//    as John's base has.
//   node scripts/handbuilt/jensen/forge-base.mjs <sheet.json> <out.glb>
import fs from 'node:fs';
import { nodeEnv } from '../../forge/env-node.mjs';
import { compile } from '../../forge/compile.mjs';
import { core } from '../../forge/core.mjs';
import { post } from '../../forge/post.mjs';
import { diet } from '../../forge/diet.mjs';
import { loadFaceKit } from '../../forge/targets.mjs';
import { uncoveredGlb } from '../../forge/uncovered.mjs';
import { GARMENTS, FABRIC } from '../../forge/library.mjs';
const [sheetF, out] = process.argv.slice(2), S = JSON.parse(fs.readFileSync(sheetF, 'utf8'));
// (the moto jacket: the library's double-breasted jacket on a body whose 'crotch' (the jacket's hem reference: the hem is
// 5 cm over it) is moved up to just over the hips, so it ends at the belt)
const HEM = +(process.env.JH_HEM ?? 0.015);
GARMENTS['moto-jacket'] = (ctx, o) => { const c2 = Object.create(ctx); c2.crotch = ctx.hip + HEM; return GARMENTS['suit-jacket-db'](c2, o); };
FABRIC['moto-jacket'] = 'leather';
const env = await nodeEnv(), { cfg } = compile(S);
cfg.lib = [...(cfg.lib || []), { item: 'moto-jacket', color: '#141416', accent: null, accent2: '#141416', layer: 5, collarGap: +(process.env.JH_COLLAR ?? 0.006) }];
cfg.shoulder = +(process.env.HB_SHOULDER || 0.76); cfg.slope = { ...(cfg.slope || {}), drop: +(process.env.HB_SLOPE || 0.015) };
console.log('wear', JSON.stringify(cfg.wear), 'lib', JSON.stringify(cfg.lib.map((l) => l.item)));
const logs = [], env1 = { ...env, log: (...a) => logs.push(a.join(' ')) };
await loadFaceKit(env1); const a = await core(cfg, env1); const b = await post(a.glb, a.lm, env1); const glb = await diet(b.glb, env1);
const unc = await uncoveredGlb(glb, env);
fs.writeFileSync(out, glb); fs.writeFileSync(out.replace(/\.glb$/, '.core.log'), logs.join('\n'));
console.log(out, (glb.length / 1048576).toFixed(2), 'MB', 'uncovered', unc.pass, unc.worst, 'hands', JSON.stringify(b.report.hands), 'lm', JSON.stringify({ below: a.lm.below, front: a.lm.front, chin: a.lm.chin, ey: a.lm.ey }));
