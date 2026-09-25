/**
 * The platform loop, checked against the running site.  `npm run check:platform`
 *
 * Mog v1 (docs/RULES.md section 2): a Mog publishes with its lineage, the
 * pages credit the original and list the challengers, a Mog-off pick counts
 * only once that player has finished a run in both games, and a family is
 * ranked by the counted picks. Also the owner's controls (25 Sep): a world
 * taken down from /admin disappears everywhere and comes back whole, /admin
 * shows nothing without a session, and the site's own visit counts keep no
 * address and skip bots. Uses throwaway games built from the reference world
 * and removes them afterwards. Needs the dev server (BASE).
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { insertDraft, db, getGameBySlug, family, mogOff } from '../lib/db.ts';
import { setWorldHidden } from '../lib/analytics.ts';

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

  console.log('\nYou are the main character');
  const playsOf = (id: string) => (db.prepare('SELECT plays FROM games WHERE id = ?').get(id) as { plays: number }).plays;
  const before = playsOf(original.id);
  await fetch(`${BASE}/g/${original.slug}/play?preview=1`);
  ok('a preview of a world (the /me start line, films, key art) is not a play', playsOf(original.id) === before);
  await fetch(`${BASE}/g/${original.slug}/play`);
  ok('opening the game to play it is', playsOf(original.id) === before + 1);
  const me = await page('/me');
  ok('the character page opens on the line', me.status === 200 && me.html.includes('You are the main character'));
  const selfie = (body: unknown) => post('/api/me/selfie', body);
  ok('a selfie needs the 13-or-older confirmation', (await selfie({ image: 'data:image/jpeg;base64,AAAA' })).status === 403);
  ok('and has to be a photo', (await selfie({ image: 'not a photo', age13: true })).status === 400);
  const route = readFileSync(new URL('../app/api/me/selfie/route.ts', import.meta.url), 'utf8');
  ok('the selfie route cannot store a photo: it touches no database and no file system', !/lib\/db|node:fs|from 'fs'|writeFile|localStorage/.test(route));

  console.log('\nThe owner can take a world down');
  setWorldHidden(mog2.id, true);
  ok('an unpublished world is a 404, not a page', (await page(`/g/${mog2.slug}`)).status === 404);
  ok('it leaves the charts, the sitemap and its family',
    !(await page('/charts/new-mogs')).html.includes(`/g/${mog2.slug}"`) && !(await page('/sitemap.xml')).html.includes(mog2.slug) && !family(mog.id).some((f) => f.id === mog2.id));
  ok('and nobody can Mog it', (await page(`/mog/${mog2.slug}`)).status === 404);
  setWorldHidden(mog2.id, false);
  ok('restoring it brings the page back', (await page(`/g/${mog2.slug}`)).status === 200 && family(mog.id).some((f) => f.id === mog2.id));

  console.log('\nOwner only');
  const admin = await page('/admin');
  ok('/admin without a session is a sign-in (or absent), never the numbers', (admin.status === 404 || admin.html.includes('Owner sign in')) && !admin.html.includes('Est. API spend'));
  const forged = await fetch(`${BASE}/admin`, { headers: { cookie: `gm_admin=v1.9999999999.${'a'.repeat(64)}` } });
  ok('a forged session cookie is only a sign-in too', !(await forged.text()).includes('Est. API spend'));
  ok('the admin page asks search engines to stay out', /noindex/.test(admin.html) || admin.status === 404);

  console.log('\nThe site counts its own visits');
  const v = `check-${randomUUID()}`, phone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
  const hit = (body: unknown, ua = phone) => fetch(`${BASE}/api/hit`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': ua }, body: JSON.stringify(body) });
  await hit({ v, k: 'view', p: `/g/${original.slug}`, r: 'www.Reddit.com' });
  const row = db.prepare('SELECT * FROM events WHERE visitor = ?').get(v) as Record<string, unknown> | undefined;
  ok('a page view keeps its page, the device kind and the referring site', row?.path === `/g/${original.slug}` && row.device === 'phone' && row.ref === 'reddit.com');
  ok('and no address of any kind', !!row && !Object.keys(row).some((k) => /ip|addr|agent/i.test(k)));
  await hit({ v, k: 'view', p: '/' }, 'Twitterbot/1.0');
  await hit({ v, k: 'view', p: '/admin' });
  await hit({ v, k: 'download', p: '/' });
  ok('link unfurlers, the admin pages and junk are not counted', (db.prepare('SELECT COUNT(*) AS n FROM events WHERE visitor = ?').get(v) as { n: number }).n === 1);
  db.prepare('DELETE FROM events WHERE visitor = ?').run(v);
} finally {
  for (const id of made.reverse()) {
    db.prepare('DELETE FROM mog_picks WHERE child_id = ? OR parent_id = ?').run(id, id);
    db.prepare('DELETE FROM plays WHERE game_id = ?').run(id);
    db.prepare('DELETE FROM games WHERE id = ?').run(id);
  }
}

console.log(`\n${failures ? `${failures} FAILED` : 'all platform checks passed'}\n`);
process.exit(failures ? 1 : 0);
