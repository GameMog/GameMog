/**
 * The platform loop, checked against the running site.  `npm run check:platform`
 *
 * Mog v1 (docs/RULES.md section 2): a Mog publishes with its lineage, the
 * pages credit the original and list the challengers, a Mog-off pick counts
 * only once that player has finished a run in both games, and a family is
 * ranked by the counted picks. Uses throwaway games built from the reference
 * world and removes them afterwards. Needs the dev server (BASE).
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { insertDraft, db, getGameBySlug, family, mogOff } from '../lib/db.ts';

const BASE = process.env.BASE ?? 'http://localhost:3939';
let failures = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  if (!cond) failures++;
};
const code = readFileSync(new URL('../lib/runtime/reference-world.js', import.meta.url), 'utf8');
const tag = `Mogcheck ${randomUUID().slice(0, 6)}`;
const made: string[] = [];

async function publish(title: string, parentId: string | null, idea: string | null) {
  const id = randomUUID();
  insertDraft({ id, prompt: idea ?? 'platform check', format: 'world', code, report: { ok: true, ran: true }, parentId, mogPrompt: idea,
    meta: { title, tagline: 'A platform check.', blurb: 'Made by the platform check and removed after it.', genre: 'Test', cast: [{ name: 'Pip', color: '#F2E3C4' }], palette: { sky: '#9CCBEB', ground: '#7DB356', accent: '#F28C28' }, runtime: 1 } });
  const r = await fetch(`${BASE}/api/games`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId: id }) });
  const j = await r.json() as { slug: string };
  db.prepare('DELETE FROM drafts WHERE id = ?').run(id);
  const g = getGameBySlug(j.slug)!;
  made.push(g.id);
  return g;
}
const post = (path: string, body: unknown) => fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
// React marks text boundaries with empty comments; read the page as a person would
const page = async (path: string) => { const r = await fetch(`${BASE}${path}`); return { status: r.status, html: (await r.text()).replaceAll('<!-- -->', '') }; };
const voter = () => randomUUID();

try {
  console.log('\nMog: lineage');
  const original = await publish(`${tag} Original`, null, null);
  const mog = await publish(`${tag} Storm`, original.id, 'Set it at night in a thunderstorm');
  const mog2 = await publish(`${tag} Toy`, mog.id, 'Make it look like a toy set');
  ok('an original has no parent and is generation 0', !original.parent_id && original.generation === 0);
  ok('a Mog records its parent, its family and generation 1', mog.parent_id === original.id && mog.root_id === original.id && mog.generation === 1 && mog.mog_prompt === 'Set it at night in a thunderstorm');
  ok('a Mog of a Mog stays in the same family, generation 2', mog2.parent_id === mog.id && mog2.root_id === original.id && mog2.generation === 2);

  console.log('\nMog: the pages');
  const pm = await page(`/g/${mog.slug}`), po = await page(`/g/${original.slug}`), pc = await page(`/mog/${original.slug}`), p2 = await page(`/g/${mog2.slug}`);
  ok('a Mog\'s page credits the game it mogged', pm.html.includes('Mogged from') && pm.html.includes(original.title));
  ok('a Mog of a Mog also credits the original', p2.html.includes('Original:') && p2.html.includes(original.title));
  ok('a Mog\'s page has a Mog-off against its parent', pm.html.includes('aria-label="Mog-off"'));
  ok('the original\'s page lists its challengers', po.html.includes('Challenged by 1 Mog') && po.html.includes('Mogs (1)'));
  ok('every game page has a Mog button to the composer', po.html.includes(`href="/mog/${original.slug}"`) && pm.html.includes(`href="/mog/${mog.slug}"`));
  ok('the Mog composer opens on the game it challenges', pc.status === 200 && pc.html.includes(`Mog ${original.title}`));
  const bad = await post('/api/generate', { mogOf: 'no-such-game-anywhere', prompt: 'make it better' });
  ok('mogging a game that does not exist is refused', bad.status === 404);

  console.log('\nMog-off: humans select');
  const a = voter(), b = voter(), c = voter();
  await post('/api/mogs', { child: mog.id, voter: a, winner: mog.id });
  let m = mogOff(mog.id)!;
  ok('a pick from someone who has not played both does not count', m.child === 0 && m.uncounted === 1);
  await post('/api/plays', { gameId: mog.id, player: a, level: 3 });
  m = mogOff(mog.id)!;
  ok('nor after playing only one side', m.child === 0 && m.uncounted === 1);
  await post('/api/plays', { gameId: original.id, player: a, level: 2 });
  m = mogOff(mog.id, a)!;
  ok('it counts once they have finished a run in both', m.child === 1 && m.uncounted === 0 && m.played.child && m.played.parent);
  for (const [v, w] of [[b, original.id], [c, mog.id]] as const) {
    await post('/api/plays', { gameId: mog.id, player: v }); await post('/api/plays', { gameId: original.id, player: v });
    await post('/api/mogs', { child: mog.id, voter: v, winner: w });
  }
  m = mogOff(mog.id)!;
  ok('one counted pick per player', m.child === 2 && m.parent === 1, `${m.child}-${m.parent}`);
  await post('/api/mogs', { child: mog.id, voter: a, winner: original.id });
  m = mogOff(mog.id)!;
  ok('a player can change their pick', m.child === 1 && m.parent === 2, `${m.child}-${m.parent}`);
  await post('/api/mogs', { child: mog.id, voter: a, winner: mog.id });
  const notMog = await post('/api/mogs', { child: original.id, voter: a, winner: original.id });
  const wrongWinner = await post('/api/mogs', { child: mog.id, voter: a, winner: mog2.id });
  ok('an original has no Mog-off, and a pick must be one of the two', notMog.status === 404 && wrongWinner.status === 404);

  console.log('\nThe family, ranked');
  const fam = family(mog2.id);
  ok('the family is the original and every Mog under it', fam.length === 3 && fam.every((f) => [original.id, mog.id, mog2.id].includes(f.id)));
  ok('ranked by counted Mog-off picks: the Mog that won 2 to 1 leads', fam[0].id === mog.id && fam[0].elo > 1000 && fam.find((f) => f.id === original.id)!.elo < 1000, fam.map((f) => `${f.title.slice(tag.length + 1)} ${f.elo}`).join(', '));
  ok('distinct players are counted from finished runs', fam.find((f) => f.id === mog.id)!.players === 3);
  const leader = await page(`/g/${mog.slug}`);
  ok('the leader says so on its page', leader.html.includes('Leads its family'));
} finally {
  for (const id of made.reverse()) {
    db.prepare('DELETE FROM mog_picks WHERE child_id = ? OR parent_id = ?').run(id, id);
    db.prepare('DELETE FROM plays WHERE game_id = ?').run(id);
    db.prepare('DELETE FROM games WHERE id = ?').run(id);
  }
}

console.log(`\n${failures ? `${failures} FAILED` : 'all platform checks passed'}\n`);
process.exit(failures ? 1 : 0);
