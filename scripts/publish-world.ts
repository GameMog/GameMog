/**
 * Publish a first-party world from worlds/<name>.js and worlds/<name>.json.
 * `npm run publish:world -- la-olympics-2028`   (needs the dev server: BASE)
 *
 * A world written by hand goes through exactly the gate a generated one does:
 * the static check, then a real-Chrome playtest on the runtime. Only a world
 * that passes is published. Publishing again updates the game in place, so
 * its URL and leaderboard survive.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { WorldMetaSchema, worldControls, staticCheckWorld, isOpenWorld, worldMode } from '../lib/custom-game.ts';
import { playtestWorld } from '../lib/playtest-runtime.ts';
import { insertDraft, publishDraft, slugify, db } from '../lib/db.ts';

const BASE = process.env.BASE ?? 'http://localhost:3939';
const name = process.argv[2];
if (!name) { console.error('usage: npm run publish:world -- <name>'); process.exit(1); }
const code = readFileSync(`worlds/${name}.js`, 'utf8');
const parsed = WorldMetaSchema.safeParse(JSON.parse(readFileSync(`worlds/${name}.json`, 'utf8')));
if (!parsed.success) { console.error('meta:', parsed.error.issues); process.exit(1); }
const meta = parsed.data;

const problems = staticCheckWorld(code);
if (problems.length) { console.error('static check:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log(`static check: clean (${Math.round(code.length / 1000)}KB)`);

const draftId = randomUUID();
const stored = { ...meta, mode: worldMode(code), controls: worldControls(code), scoring: isOpenWorld(code) ? 'survival' : 'level', runtime: 1 };
insertDraft({ id: draftId, prompt: `first-party world: ${name}`, format: 'world', report: { pending: true }, code, meta: stored });
console.log('playtesting in Chrome...');
const report = await playtestWorld(`${BASE}/d/${draftId}/play`);
const { cover, artIcon, artWide, ...rest } = report;
db.prepare('UPDATE drafts SET cover = ?, art_icon = ?, art_wide = ?, report = ? WHERE id = ?').run(cover ?? null, artIcon ?? null, artWide ?? null, JSON.stringify(rest), draftId);
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
  console.log(`updated ${BASE}/g/${slug}`);
} else {
  publishDraft(draftId, slug, randomUUID());
  console.log(`published ${BASE}/g/${slug}`);
}
