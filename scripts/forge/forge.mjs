// THE CHARACTER FORGE: sheet -> GLB. compile (clamped config) -> core (body, face, clothes, teeth, headwear, made
// garments) -> post (skeleton fitted to the body, hands sized, upright frame, on the floor) -> diet (WebP + meshopt).
// The clips are one shared pack (clips.mjs), not baked; gates.mjs grades the result.
// FB (browser port): the forge is pipeline.mjs on a platform; this CLI is its thin Node wrapper (env-node.mjs). A
// creator's browser runs the same modules (public/storykit/forge/forge.js, built by build-web.mjs). Prints one JSON
// line per character: times, sizes, clamps, landmarks, checks.
//   node forge.mjs <out-dir> <sheet.json> [<sheet.json> ...]
import fs from 'node:fs';
import path from 'node:path';
import { nodeEnv } from './env-node.mjs';
import { forgeSheet } from './pipeline.mjs';

const [outDir0, ...sheets] = process.argv.slice(2), outDir = path.resolve(outDir0);
fs.mkdirSync(outDir + '/work', { recursive: true });
const env = await nodeEnv();
for (const f of sheets) {
  const S = JSON.parse(fs.readFileSync(f, 'utf8')), w = `${outDir}/work/${S.id}`;
  const r = await forgeSheet(S, env);
  // (the work files the studio, the gates and the sweeps read, as before)
  fs.writeFileSync(`${w}.cfg.json`, JSON.stringify(r.cfg, null, 1));
  fs.writeFileSync(`${w}.core.log`, r.coreLog + '\n');
  fs.writeFileSync(`${w}-raw.glb`, r.raw);
  fs.writeFileSync(`${w}-raw.forge.json`, JSON.stringify(r.lm));
  fs.writeFileSync(`${w}-post.glb`, r.postGlb);
  fs.writeFileSync(`${outDir}/${S.id}.glb`, r.glb);
  const rec = { ...r.rec, peakMB: Math.round(process.resourceUsage().maxRSS / 1024) };
  fs.writeFileSync(`${outDir}/${S.id}.forge.json`, JSON.stringify(rec, null, 1));
  console.log(JSON.stringify(rec));
}
