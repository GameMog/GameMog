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
import { createHash, createHmac } from 'node:crypto';
import { withBrowser } from '../lib/browser.ts';
import { RATE } from '../lib/kart-report.ts';
import { insertDraft, db, getGameBySlug, family, mogOff, topScores, rescoreKart } from '../lib/db.ts';
import { KartScore, kartConstants, type KartConstants } from '../lib/kart-score.ts';
import { runKartScoreTests } from './kart-score/test-score.mjs';
import { setWorldHidden } from '../lib/analytics.ts';
import { worldMode, worldControls, MODE_PAGE, isKartWorld, staticCheckWorld, runtimeSource } from '../lib/custom-game.ts';
import { dna, compareDna, askedKind, describeDna } from '../lib/mog-dna.ts';

const BASE = process.env.BASE ?? 'http://localhost:3939';
let failures = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  if (!cond) failures++;
};
const code = readFileSync(new URL('../lib/runtime/reference-world.js', import.meta.url), 'utf8');
const tag = `Mogcheck ${randomUUID().slice(0, 6)}`;
const made: string[] = [];

async function publish(title: string, parentId: string | null, idea: string | null, world = code) {
  const id = randomUUID();
  insertDraft({ id, prompt: idea ?? 'platform check', format: 'world', code: world, report: { ok: true, ran: true }, parentId, mogPrompt: idea,
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

  // a kart race (Meme Kart, the owner 6 Oct: "3 laps, 8 karts ... bumping + items (contact never ends the run)", its
  // own kind): its mode everywhere, its Mog DNA, and its scores (place, then time, then GM)
  console.log('\nKart races');
  const kartCode = readFileSync(new URL('../lib/runtime/kart-world.js', import.meta.url), 'utf8');
  ok('kart: a world naming kart: {...} among its own keys is a kart race, with its own page and controls', worldMode(kartCode) === 'kart' && worldMode(null, { mode: 'kart' }) === 'kart' && isKartWorld(kartCode) && worldMode(code) === 'race'
    && MODE_PAGE.kart.label === 'Kart race' && /score out of 10,000 \(the time most, then your place, GM and enemies hit\)/.test(MODE_PAGE.kart.how) && worldControls(kartCode).includes('Moon Launch'), MODE_PAGE.kart.label);
  const kd = dna(kartCode);
  ok('kart: its DNA reads the kind, the laps and the racers, the first four the stars', kd.kind === 'kart' && kd.kart?.laps === 3 && kd.kart.roster.slice(0, 4).join() === 'Pepe,Doge,Shiba,Bike Tyson' && kd.kart.roster.length === 8 && describeDna(kd).some((l) => l.includes('3 laps')),
    JSON.stringify(kd.kart));
  // (Meme Kart itself names its racers through a helper, racer(ctx, k), that reads ROSTER: read through it)
  const mk = dna(readFileSync(new URL('../worlds/meme-kart.js', import.meta.url), 'utf8'));
  ok('kart: and Meme Kart\'s, read through its racer() helper', mk.kart?.roster.join() === 'Pepe,Doge,Shiba,Bike Tyson,Bull Run,Big Bear,The Whale,Moon Cat', JSON.stringify(mk.kart));
  ok('kart: "kart race" and "karting" ask for a kart race, no longer the endless lap', askedKind('make it a kart race on the moon') === 'kart' && askedKind('karting in the city') === 'kart' && askedKind('a race with karts') === 'kart' && askedKind('make it a night race through the swamp') === 'race');
  const keys = (v: ReturnType<typeof compareDna>) => v.dropped.map((d) => d.key).join(',');
  const renamed = kartCode.replace("['pepe', 'Pepe']", "['pepe', 'Kermito']").replace("['doge', 'Doge']", "['doge', 'Biscuit']");
  ok('kart: a Mog that drops the stars is flagged, unless the idea names new racers', keys(compareDna(kartCode, renamed, 'make it rain')).includes('kart') && !keys(compareDna(kartCode, renamed, 'replace the rivals with Biscuit and Kermito as the hero')).includes('kart'), keys(compareDna(kartCode, renamed, 'make it rain')));
  ok('kart: laps outside 2 to 4 are flagged, whatever the idea', keys(compareDna(kartCode, kartCode.replace('laps: 3', 'laps: 6'), 'six laps please')) === 'kart' && compareDna(kartCode, kartCode.replace('laps: 3', 'laps: 4'), 'make it rain').dropped.length === 0);
  ok('kart: and a Mog that turns it into another kind is flagged, unless the idea asks for that kind', keys(compareDna(kartCode, code, 'make it rain')).split(',').includes('kind') && !keys(compareDna(kartCode, code, 'make it an endless lap race')).split(',').includes('kind'));
  const kg = await publish(`${tag} Kart`, null, null, kartCode);
  const kp = await page(`/g/${kg.slug}`);
  ok('kart: its page says "Kart race" and how it plays', kp.status === 200 && kp.html.includes('Kart race') && kp.html.includes('Moon Launch'));
  // (the panel under the frame, where a finished race is posted, says the place and the time, not the endless race's
  // "Level 3": the frame is told it holds a kart race, and a lap race's page is told it does not)
  ok('kart: and its post-your-score panel speaks of a place and a time, a lap race\'s of its level', kp.html.includes('\\"kart\\":true') && po.html.includes('\\"kart\\":false'));
  // (a kart: that is not written out among GameMog.world's own keys would be served without the kit: refused)
  const viaConst = kartCode.replace('kart: { laps: 3, course: COURSE }', 'kart: KART_CFG');
  ok('kart: a kart: given as a const (served without the kart kit) is refused by the static check', viaConst !== kartCode && staticCheckWorld(viaConst).some((p) => /kart: \{ \.\.\. \}/.test(p)) && !staticCheckWorld(kartCode).some((p) => /kart/.test(p)));
  // its score (the owner, 8 Oct: lib/runtime/kart-score.js, time 80 / place 10 / GM 5 / hits 5, 10,000 never
  // reached): the formula's own properties first (scripts/kart-score/test-score.mjs, no server needed), then the route
  // and the board
  // its guard (8 Oct, lib/runtime/kart-guard.js): a lost graphics context or a race that throws shows a card instead
  // of a black frame, and the page sends a small report on to /api/kart-report, which only the owner can read
  console.log('\nKart guard and crash reports');
  {
    const kRt = runtimeSource(1, true), pRt = runtimeSource(1, false);
    ok('kart guard: a kart race\'s runtime opens with the guard; no other world\'s carries it', kRt.startsWith(readFileSync(new URL('../lib/runtime/kart-guard.js', import.meta.url), 'utf8')) && !pRt.includes('KartGuard'));
    const UA = 'Mozilla/5.0 (Linux; Android 14; SM-F946B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 gamemog-platform-check';
    const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    const send = (body: string, from = ip) => fetch(`${BASE}/api/kart-report`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': UA, 'x-forwarded-for': from }, body });
    const good = { kind: 'context-lost', slug: kg.slug, step: 'decoding images (48)', t: 9123, tier: 'low', mem: 8, screen: '904x2316', view: '412x915', dpr: 2.63, gpu: 'Adreno (TM) 740', heap: { used: 210, limit: 4096 }, lost: true,
      message: 'boom at https://gamemog.com/g/x/play#me=secret-look', email: 'someone@example.com' };
    const r1 = await send(JSON.stringify(good));
    const row = db.prepare('SELECT * FROM kart_reports WHERE slug = ? ORDER BY id DESC LIMIT 1').get(kg.slug) as { kind: string; device: string; step: string; message: string; data: string } | undefined;
    const data = row ? JSON.parse(row.data) as Record<string, unknown> : {};
    ok('kart report: a report is accepted and kept field by field (device from the browser, no fragment, nothing unasked)', r1.status === 204 && !!row && row.kind === 'context-lost' && row.device === 'phone' && row.step === 'decoding images (48)'
      && data.gpu === 'Adreno (TM) 740' && data.mem === 8 && data.screen === '904x2316' && data.lost === true && !row.message.includes('secret') && !JSON.stringify(row).includes('example.com'), JSON.stringify(row));
    const big = await send(JSON.stringify({ ...good, stack: 'x'.repeat(5000) }), `${ip}9`);
    const junk = await send(JSON.stringify({ kind: 'anything', slug: kg.slug }), `${ip}8`);
    ok('kart report: a body over 4 KB is refused (413), and one that is not a report (400)', big.status === 413 && junk.status === 400, `${big.status} ${junk.status}`);
    const codes: number[] = [];
    for (let i = 0; i < RATE; i++) codes.push((await send(JSON.stringify({ ...good, kind: 'error', message: `rate ${i}` }))).status);
    ok(`kart report: one address sends at most ${RATE} in ten minutes, then 429`, codes.slice(0, RATE - 1).every((c) => c === 204) && codes[RATE - 1] === 429, codes.join(','));
    const anon = await fetch(`${BASE}/api/kart-report`);
    const forgedRead = await fetch(`${BASE}/api/kart-report`, { headers: { cookie: `gm_admin=v1.9999999999.${'a'.repeat(64)}` } });
    ok('kart report: reading them needs the owner\'s session (none, or a forged one: not found)', anon.status === 404 && forgedRead.status === 404 && !(await anon.text()).includes(kg.slug), `${anon.status} ${forgedRead.status}`);
    let pw = process.env.ADMIN_PASSWORD ?? '';
    if (!pw) try { pw = /^ADMIN_PASSWORD=(.*)$/m.exec(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'))?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? ''; } catch {}
    if (pw.length >= 12) {
      const exp = Math.floor(Date.now() / 1000) + 600, sig = createHmac('sha256', `gamemog-admin:${pw}`).update(`v1.${exp}`).digest('hex');
      const own = await fetch(`${BASE}/api/kart-report`, { headers: { cookie: `gm_admin=v1.${exp}.${sig}` } });
      const j = own.ok ? await own.json() as { reports: { slug: string; kind: string }[] } : { reports: [] };
      ok('kart report: the owner reads them, newest first', own.status === 200 && j.reports.some((x) => x.slug === kg.slug && x.kind === 'context-lost'), String(own.status));
    }
    // and in a real browser: the kart race's graphics context lost (WEBGL_lose_context) shows the card and reports it
    const seen = await withBrowser(async (pg) => {
      await pg.preload("addEventListener('message', function (e) { (window.__msgs = window.__msgs || []).push(e.data); });");
      await pg.goto(`${BASE}/g/${kg.slug}/play?preview=1`);
      const until = async (js: string, ms: number) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await new Promise((r) => setTimeout(r, 200))) if (await pg.eval<boolean>(js).catch(() => false)) return true; return false; };
      const gl = await until("!!window.KartGuard && !!document.querySelector('canvas') && KartGuard.state().step !== 'runtime'", 30000);
      const before = await pg.eval<boolean>('KartGuard.state().card');
      await pg.eval("(function () { var c = [].slice.call(document.querySelectorAll('canvas')).map(function (c) { return c.getContext('webgl2') || c.getContext('webgl'); }).filter(Boolean)[0]; c.getExtension('WEBGL_lose_context').loseContext(); return true; })()");
      const card = await until("KartGuard.state().card && /Graphics reset/.test(document.body.innerText) && /Tap to reload/.test(document.body.innerText)", 5000);
      const msgs = await pg.eval<{ type: string; step?: string; report?: { kind: string; lost: boolean; gpu: string | null } }[]>('window.__msgs || []');
      return { gl, before, card, steps: msgs.filter((m) => m && m.type === 'kart-step').map((m) => m.step), rep: msgs.find((m) => m && m.type === 'kart-report')?.report };
    }, { width: 412, height: 800, timeoutMs: 90000 });
    ok('kart guard: losing the graphics context shows "Graphics reset, tap to reload" instead of a black frame, and reports it with the step reached', seen.gl && !seen.before && seen.card && seen.rep?.kind === 'context-lost' && seen.rep.lost === true && seen.steps.includes('graphics'),
      JSON.stringify({ ...seen, steps: seen.steps.slice(0, 6) }));
    db.prepare("DELETE FROM kart_reports WHERE slug = ? OR data LIKE '%gamemog-platform-check%'").run(kg.slug);
  }

  console.log('\nKart score');
  const ks = runKartScoreTests((l: string) => { if (l.startsWith('FAIL')) failures++; console.log(l); });
  void ks;
  const kartRuntime = runtimeSource(1, true), plainRuntime = runtimeSource(1, false);
  ok('kart score: a kart world\'s runtime carries the score (KartScore), every other world\'s runtime is untouched', kartRuntime.includes('var KartScore = (function') && !plainRuntime.includes('KartScore') && createHash('sha256').update(plainRuntime).digest('hex').slice(0, 16) === '55de5bf8cd23555c',
    createHash('sha256').update(plainRuntime).digest('hex').slice(0, 16));
  // Meme Kart's crowd, baked (scripts/kart-crowd-bake.ts, 8 Oct): both sheets in the library, filmed from the looks the
  // world has now (FAN_WORDS ... CROWD_SHEETS), in the layout the world reads them by
  {
    const mkCode = readFileSync(new URL('../worlds/meme-kart.js', import.meta.url), 'utf8'), libJ = JSON.parse(readFileSync(new URL('../public/assets/library.json', import.meta.url), 'utf8'));
    const a0 = mkCode.indexOf('var FAN_WORDS = ['), b0 = mkCode.indexOf('var CROWD_SHEETS'), from = createHash('sha256').update(mkCode.slice(a0, b0)).digest('hex').slice(0, 16);
    const sheets = [['crowd-meme-kart', 12, 96, 216, 24], ['crowd-meme-kart-lo', 10, 64, 144, 20]] as const;
    const bad = sheets.filter(([id, f, px, py, cols]) => { const c = libJ.assets[id]?.meta?.crowd; return !c || c.from !== from || c.frames !== f || c.cell[0] !== px || c.cell[1] !== py || c.cols !== cols || !mkCode.includes(`id: '${id}', frames: ${f}, cell: [${px}, ${py}], cols: ${cols}`); });
    ok('kart: Meme Kart\'s baked crowd sheets are in the library, filmed from the world\'s looks as they are now (else: npm run bake:crowd)', a0 > 0 && b0 > a0 && bad.length === 0 && /lowAssets: \['crowd-meme-kart-lo'\]/.test(mkCode), bad.map((x) => x[0]).join(', ') || from);
  }
  type Posted = { ok?: boolean; score?: number; tier?: { id: string; name: string }; parts?: Record<string, number>; rank?: number | null; best?: boolean; review?: boolean; source?: string; error?: string };
  const score = async (b: Record<string, unknown>, player = 'kartcheck') => { const r = await post('/api/scores', { gameId: kg.id, player, laps: 3, level: 3, ...b }); return { status: r.status, j: await r.json() as Posted }; };
  // (a world published from the site has no measurement yet: the course fallback, flagged, from its written-out lap)
  const Cmin = kartConstants(getGameBySlug(kg.slug)!.meta, kartCode, dna(kartCode).kart);
  const good = await score({ place: 2, timeMs: 141_000, gm: 20, hits: 4, racer: 'pepe' });
  ok('kart score: an unmeasured kart world scores against the course fallback, flagged minimal, the same as the library', good.status === 200 && good.j.source === 'minimal' && Cmin.source === 'minimal' && good.j.score === KartScore.score({ timeMs: 141_000, place: 2, gm: 20, hits: 4, racer: 'pepe' }, Cmin).total, JSON.stringify(good.j));
  const refused = await Promise.all([{ place: 9, timeMs: 141_000, gm: 3 }, { place: 1, timeMs: Cmin.tFloor as number * 1000 - 1, gm: 3 }, { place: 1, timeMs: 141_000, gm: 3, laps: 4, level: 4 }, { place: 1, timeMs: 141_000, gm: 400 }, { place: 1, timeMs: 141_000, gm: 3, hits: 65 }, { place: 1, timeMs: 141_000, gm: 3, assisted: true }, { place: 1, timeMs: 141_000, gm: 3, estimated: true, progress: 1.2 }].map((b) => score(b)));
  ok('kart score: the route refuses a 9th place, a time under the floor, the wrong laps, too much GM, too many hits, an assisted run, a bad progress', refused.every((r) => r.status === 422), refused.map((r) => r.status).join(' '));
  db.prepare('DELETE FROM scores WHERE game_id = ?').run(kg.id);
  // (then measured: Meme Kart's own constants, as publish-world stores them)
  const C = JSON.parse(readFileSync(new URL('../deploy/migrations/meme-kart.meta.json', import.meta.url), 'utf8')).meta.kartScore as KartConstants;
  const km = JSON.parse(getGameBySlug(kg.slug)!.meta ?? '{}');
  db.prepare('UPDATE games SET meta = ? WHERE id = ?').run(JSON.stringify({ ...km, kartScore: C }), kg.id);
  const lib = (b: { timeMs: number; place: number; gm?: number; hits?: number; racer?: string; estimated?: boolean; progress?: number }) => KartScore.score(b, C);
  const ka = await score({ place: 1, timeMs: 126_800, gm: 38, hits: 3, racer: 'pepe', score: 9999 }, 'kc-ana');
  ok('kart score: the server works the score out from the parts (a posted 9,999 is ignored) and equals the library, breakdown and tier', ka.status === 200 && ka.j.score === lib({ timeMs: 126_800, place: 1, gm: 38, hits: 3, racer: 'pepe' }).total && ka.j.score !== 9999
    && ka.j.tier?.id === KartScore.tier(ka.j.score!).id && Object.values(ka.j.parts ?? {}).reduce((x: number, y: number) => x + y, 0) === ka.j.score && ka.j.rank === 1 && ka.j.source === 'measured', JSON.stringify(ka.j));
  const stored = db.prepare('SELECT score, kos, racer, est, score_v, tier, level FROM scores WHERE game_id = ? AND player = ?').get(kg.id, 'kc-ana') as { score: number; kos: number; racer: string; est: number; score_v: number; tier: string; level: number };
  ok('kart score: and stores the score, the hits, the racer, the version and the tier with the run', stored.score === ka.j.score && stored.kos === 3 && stored.racer === 'pepe' && stored.est === 0 && stored.score_v === KartScore.V && stored.tier === ka.j.tier?.id && stored.level === 3, JSON.stringify(stored));
  const bull = await score({ place: 1, timeMs: 126_800, gm: 38, hits: 3, racer: 'bull' }, 'kc-bo');
  ok('kart score: each racer has its own perfect time (the same time in the fastest kart scores less)', bull.status === 200 && bull.j.score! < ka.j.score! && bull.j.score === lib({ timeMs: 126_800, place: 1, gm: 38, hits: 3, racer: 'bull' }).total && bull.j.rank === 2, `${bull.j.score} < ${ka.j.score}`);
  const fast = await score({ place: 1, timeMs: (C.tStar as Record<string, number>).pepe * 1000 - 500, gm: 38, hits: 3, racer: 'pepe' }, 'kc-zoom');
  const floor = await score({ place: 1, timeMs: (C.tFloor as Record<string, number>).pepe * 1000 - 1, gm: 38, hits: 3, racer: 'pepe' }, 'kc-zoom');
  ok('kart score: a run under its racer\'s perfect time is held for review (off the board), one under the floor refused', fast.status === 200 && fast.j.review === true && fast.j.rank === null && floor.status === 422
    && (db.prepare('SELECT hidden FROM scores WHERE game_id = ? AND player = ?').get(kg.id, 'kc-zoom') as { hidden: number }).hidden === 1);
  const dnf = await score({ place: 8, timeMs: 178_000, gm: 30, hits: 4, racer: 'pepe', estimated: true, progress: 0.8 }, 'kc-late');
  ok('kart score: a race called before the finish counts the share driven, and is Rekt', dnf.status === 200 && dnf.j.score === lib({ timeMs: 178_000, place: 8, gm: 30, hits: 4, racer: 'pepe', estimated: true, progress: 0.8 }).total && dnf.j.tier?.id === 'rekt', JSON.stringify(dnf.j));
  // best per player: a worse run, then a better one, from the same name in another case; and a tie on score goes by time
  const worse = await score({ place: 3, timeMs: 140_000, gm: 20, hits: 1, racer: 'pepe' }, 'kc-ana');
  const better = await score({ place: 1, timeMs: 120_000, gm: 60, hits: 8, racer: 'pepe' }, 'KC-Ana');
  // (two runs a second apart, set to the same score: the faster ranks first)
  const t1 = await score({ place: 2, timeMs: 150_000, gm: 10, hits: 0, racer: 'pepe' }, 'kc-tie-slow');
  await score({ place: 2, timeMs: 149_000, gm: 10, hits: 0, racer: 'pepe' }, 'kc-tie-fast');
  db.prepare('UPDATE scores SET score = ? WHERE game_id = ? AND player = ?').run(t1.j.score ?? 0, kg.id, 'kc-tie-fast');
  const board = topScores(kg.id, 10, 'kart').map((r) => `${r.player}:${r.score}`);
  ok('kart score: the board shows each player once, by their best run (any case), by score, a tie by time', board.length === 5 && board[0] === `KC-Ana:${better.j.score}` && board.filter((b) => /^kc-ana:|^KC-Ana:/i.test(b)).length === 1
    && board.indexOf(`kc-tie-fast:${t1.j.score}`) === board.indexOf(`kc-tie-slow:${t1.j.score}`) - 1 && !board.some((b) => b.startsWith('kc-zoom')), board.join(' '));
  ok('kart score: the rank the route gives is the board\'s (a worse run than your best: your best\'s rank, flagged)', better.j.rank === 1 && better.j.best === true && worse.j.rank === 1 && worse.j.best === false, `${worse.j.rank}/${worse.j.best}`);
  const kp2 = await page(`/g/${kg.slug}`);
  // (the board is a tab's panel, sent with the page for the client to show: its rows are in the page's data)
  ok('kart score: the page shows the board by score with its tiers, each player once', kp2.html.includes('Leaderboard (5)') && kp2.html.includes('Ranked by score, out of 10,000') && kp2.html.includes('\\"children\\":\\"KC-Ana\\"') && kp2.html.includes(KartScore.tier(better.j.score!).name) && kp2.html.includes('DNF'));
  // a rescore (after a measurement) puts back what the route stored (the tie's hand-set score included), and is idempotent
  const all = () => JSON.stringify(db.prepare("SELECT id, score, tier FROM scores WHERE game_id = ? AND player <> 'kc-tie-fast' ORDER BY id").all(kg.id));
  const rows0 = all();
  rescoreKart(kg.id, C); const rows1 = all(), fastRow = db.prepare("SELECT score FROM scores WHERE game_id = ? AND player = 'kc-tie-fast'").get(kg.id) as { score: number };
  rescoreKart(kg.id, C);
  ok('kart score: rescoring a board under its constants gives the route\'s scores again, and is idempotent', rows0 === rows1 && rows1 === all() && fastRow.score === lib({ timeMs: 149_000, place: 2, gm: 10, hits: 0, racer: 'pepe' }).total);
  db.prepare('DELETE FROM scores WHERE game_id = ?').run(kg.id);
} finally {
  for (const id of made.reverse()) {
    db.prepare('DELETE FROM mog_picks WHERE child_id = ? OR parent_id = ?').run(id, id);
    db.prepare('DELETE FROM plays WHERE game_id = ?').run(id);
    db.prepare('DELETE FROM games WHERE id = ?').run(id);
  }
}

console.log(`\n${failures ? `${failures} FAILED` : 'all platform checks passed'}\n`);
process.exit(failures ? 1 : 0);
