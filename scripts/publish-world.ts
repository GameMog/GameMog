/**
 * Publish a first-party world from worlds/<name>.js and worlds/<name>.json.
 * `npm run publish:world -- la-olympics-2028`   (needs the dev server: BASE)
 *
 * A world written by hand goes through exactly the gate a generated one does:
 * the static check, then a real-Chrome playtest on the runtime. Only a world
 * that passes is published. Publishing again updates the game in place, so
 * its URL and leaderboard survive.
 *
 * A first-party Mog joins its parent's family as a creator's Mog does:
 * `npm run publish:world -- zcity --mog zombie-beach --prompt "what it changes"`
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { WorldMetaSchema, worldControls, staticCheckWorld, isOpenWorld, worldMode } from '../lib/custom-game.ts';
import { playtestWorld } from '../lib/playtest-runtime.ts';
import { insertDraft, publishDraft, slugify, db, rescoreKart } from '../lib/db.ts';
import { courseConstants, kartConstants, type KartConstants } from '../lib/kart-score.ts';
import { dna } from '../lib/mog-dna.ts';
import { measure, courseFromSim } from './kart-score/measure.mjs';
import { codeHash, testStatus } from '../lib/test-drive.ts';
import { ownSoundtrack } from '../lib/world-options.ts';

const BASE = process.env.BASE ?? 'http://localhost:3939';
const name = process.argv[2];
if (!name) { console.error('usage: npm run publish:world -- <name> [--mog <parent slug> --prompt "<what the Mog changes>"]'); process.exit(1); }
const flag = (f: string) => { const i = process.argv.indexOf(f); return i > 2 ? process.argv[i + 1] : undefined; };
const mogOf = flag('--mog'), mogPrompt = flag('--prompt');
const parent = mogOf ? db.prepare('SELECT id, root_id, generation FROM games WHERE slug = ?').get(mogOf) as { id: string; root_id: string | null; generation: number } | undefined : undefined;
if (mogOf && !parent) { console.error(`--mog: no game with the slug ${mogOf}`); process.exit(1); }
if (mogOf && !mogPrompt) { console.error('--mog needs --prompt: what the Mog changes, as its family shows it'); process.exit(1); }
const code = readFileSync(`worlds/${name}.js`, 'utf8');
const parsed = WorldMetaSchema.safeParse(JSON.parse(readFileSync(`worlds/${name}.json`, 'utf8')));
if (!parsed.success) { console.error('meta:', parsed.error.issues); process.exit(1); }
const meta = parsed.data;

const problems = staticCheckWorld(code);
if (problems.length) { console.error('static check:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log(`static check: clean (${Math.round(code.length / 1000)}KB)`);

// a kart race's score constants (8 Oct; docs/RULES.md "Kart score"): the perfect time of each racer and the floor
// under it, measured on this world's own track with the kit's own rules (scripts/kart-score/measure.mjs, ~15 s), so
// a Mog gets its own and never its parent's; if the measurement fails, the course fallback (every number low)
let kartScore: KartConstants | undefined;
if (worldMode(code) === 'kart') {
  console.log('measuring the kart score\'s constants...');
  try { kartScore = await measure({ world: `worlds/${name}.js` }) as KartConstants; }
  catch (e) {
    console.warn(`kart score: the measurement failed (${(e as Error).message}); storing the course fallback`);
    try { const c = courseFromSim({ world: `worlds/${name}.js` }); kartScore = courseConstants({ L: c.L, laps: c.laps, cls: c.cls, gmLines: c.gmLines }); }
    catch { kartScore = kartConstants(null, code, dna(code).kart); }
  }
  console.log(`kart score: ${kartScore.source}, T* ${JSON.stringify(kartScore.tStar)}, floor ${JSON.stringify(kartScore.tFloor)}, GM cap ${kartScore.gmCap}`);
}

// the world's own soundtrack (9 Oct, lib/world-options.ts ownSoundtrack): its kart theme, library track or score, read
// from its definition as the runtime plays a world without options, so its Mog page starts on "Original soundtrack
// (...)" and a Mog keeps it by default (the live first-party worlds got theirs by migration 2026-10-09-own-soundtracks)
let def: unknown = null;
try { new Function('GameMog', 'window', code)({ world: (d: unknown) => { def = d; } }, { devicePixelRatio: 1 }); }
catch (e) { console.warn(`soundtrack: the module could not be read here (${(e as Error).message}); none stored`); }
const soundtrack = ownSoundtrack(def, meta.title, worldMode(code) === 'kart');
console.log(`soundtrack: ${soundtrack ? JSON.stringify(soundtrack) : 'none of its own'}`);

const draftId = randomUUID();
const stored = { ...meta, mode: worldMode(code), controls: worldControls(code), scoring: worldMode(code) === 'kart' ? 'score' : isOpenWorld(code) ? 'survival' : 'level', runtime: 1, ...(kartScore ? { kartScore } : {}), ...(soundtrack ? { soundtrack } : {}) };
insertDraft({ id: draftId, prompt: `first-party world: ${name}`, format: 'world', report: { pending: true }, code, meta: stored, parentId: parent?.id ?? null, mogPrompt: parent ? mogPrompt : null });
console.log('playtesting in Chrome...');
const report = await playtestWorld(`${BASE}/d/${draftId}/play`);
const { cover, artIcon, artWide, ...rest } = report;
// what the drive found, and the code it drove, kept with the world (as a creator's publish keeps it)
const hash = codeHash(code), test = { status: testStatus(report), codeHash: hash, cover: cover ? 'current' : 'none' };
db.prepare('UPDATE drafts SET cover = ?, art_icon = ?, art_wide = ?, report = ?, meta = ? WHERE id = ?').run(cover ?? null, artIcon ?? null, artWide ?? null, JSON.stringify({ ...rest, status: test.status, codeHash: hash }), JSON.stringify({ ...stored, test }), draftId);
console.log(`ready in ${report.readyMs}ms, ${report.fps} fps, reached ${report.open ? `heat ${report.levelReached}, ${report.open.kos} knockouts, boss ${report.open.boss}, police ${report.open.police}` : `level ${report.levelReached}`}`);
if (report.advisories.length) console.log('runtime repairs:\n- ' + report.advisories.join('\n- '));
if (!report.ok) { console.error('playtest failed:\n- ' + report.problems.join('\n- ')); process.exit(1); }

// the world's own slug, before slugify() would suffix it to dodge itself
const base = meta.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'world';
const existing = db.prepare('SELECT id FROM games WHERE slug = ?').get(base) as { id: string } | undefined;
const slug = existing ? base : slugify(meta.title);
if (existing) {
  db.prepare('UPDATE games SET title = ?, tagline = ?, blurb = ?, code = ?, meta = (SELECT meta FROM drafts WHERE id = ?), cover = ?, art_icon = ?, art_wide = ?, format = ? WHERE id = ?')
    .run(meta.title, meta.tagline, meta.blurb, code, draftId, cover ?? null, artIcon ?? null, artWide ?? null, 'world', existing.id);
  if (parent) db.prepare('UPDATE games SET parent_id = ?, root_id = ?, generation = ?, mog_prompt = ? WHERE id = ?').run(parent.id, parent.root_id ?? parent.id, parent.generation + 1, mogPrompt ?? null, existing.id);
  // (its board scored again under the constants just measured)
  if (kartScore) console.log(`kart score: rescored ${rescoreKart(existing.id, kartScore)} runs`);
  console.log(`updated ${BASE}/g/${slug}`);
} else {
  publishDraft(draftId, slug, randomUUID());
  console.log(`published ${BASE}/g/${slug}`);
}
