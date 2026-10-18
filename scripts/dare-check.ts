/**
 * The dare loop's backend, checked (10 Oct).
 *   node --import ./scripts/ts-resolve.mjs scripts/dare-check.ts
 *
 * Runs against a snapshot of data/gamemog.db in a temporary folder (VACUUM INTO, read-only on the real one), so the
 * shared database is never written; the snapshot is removed afterwards. The routes run in this process, called as
 * Next calls them. Checked: names and messages (lib/names.ts); publishing a draft once, with its creator, and the
 * creator's browser id never served; dares made, read and answered through their routes (the sender's id never
 * served; a kart target scored again with the game's constants of the day; assisted and held-for-review runs refused);
 * the funnel's steps and its bot, cross-site and sender rules; better/target/margin on every board; card uploads
 * (JPEG, 350 KB, 1200 x 630) and their route; the rate limit; family() and familyByRoot() with a hidden root.
 * With the dev server (BASE, default http://localhost:3939; NOBROWSER=1 skips it): lib/dare-card.ts drawn in Chrome on
 * a real page, with and without canvas filters and letter spacing (as Safari has them), saved to OUT for a look.
 */
import { register } from 'node:module';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const ROOT = new URL('../', import.meta.url);
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(s, c, next) {
    if (s === 'next/server' || s === 'next/headers') return next(s + '.js', c);
    if (!s.startsWith('@/')) return next(s, c);
    for (const ext of ['', '.ts', '.tsx', '/index.ts']) { try { return await next(${JSON.stringify(ROOT.href)} + s.slice(2) + ext, c); } catch {} }
    return next(s, c);
  }`));

let fails = 0, passes = 0;
const ok = (name: string, cond: boolean, detail?: unknown) => {
  if (cond) passes++; else fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && detail !== undefined ? `  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
};

// the snapshot, and this process's database inside it
const TMP = mkdtempSync(join(tmpdir(), 'gm-dare-'));
mkdirSync(join(TMP, 'data'));
{
  const src = new DatabaseSync(new URL('data/gamemog.db', ROOT).pathname, { readOnly: true });
  src.exec(`VACUUM INTO '${join(TMP, 'data', 'gamemog.db').replace(/'/g, "''")}'`);
  src.close();
}
const HOME = process.cwd();
process.chdir(TMP);

try {
  await run();
} finally {
  process.chdir(HOME);
  rmSync(TMP, { recursive: true, force: true });
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);

async function run() {
  const D = await import('../lib/db.ts');
  const N = await import('../lib/names.ts');
  const X = await import('../lib/dare.ts');
  const K = await import('../lib/kart-score.ts');
  const games = await import('../app/api/games/route.ts');
  const dares = await import('../app/api/dares/route.ts');
  const one = await import('../app/api/dares/[id]/route.ts');
  const result = await import('../app/api/dares/[id]/result/route.ts');
  const event = await import('../app/api/dares/[id]/event/route.ts');
  const card = await import('../app/g/[slug]/dare/[id]/card/route.ts');
  const upload = await import('../app/api/dares/[id]/card/route.ts');
  const { db } = D;
  ok('the check runs on its own snapshot', db.prepare('PRAGMA database_list').all().some((r) => String((r as { file: string }).file).startsWith(TMP) || String((r as { file: string }).file).includes('gm-dare-')));

  /* ------------------------------------------------------------- names -- */
  const good = ['DuneKing', 'José', 'Zoë', '李小龙', 'Badminton Bob', 'Scunthorpe', 'Therapist', 'Dickens', 'Hancock', 'Cocktail Kid', 'Pakistan', 'Analyst', 'Spicy Joe', 'Team Rocket', 'Ashkenazi', 'Peacock', "O'Neil", 'x_y-z.k'];
  const taken = ['GameMog', 'G4meM0g', 'the gamemog team', 'GameMog Official', 'Site Admin', 'StaffBot', 'Moderator', 'Me', 'Team', 'ＧａｍｅＭｏｇ'];
  const blocked = ['f.u.c.k', 'FuUuCk', 'n1gg3r', 'Ｆｕｃｋ', 'Big D1ck', 'BigDick', 'c o c k', 'nazis', 'kys', 'fυck'];
  for (const n of good) ok(`name passes: ${n}`, N.cleanName(n).ok, N.cleanName(n));
  for (const n of taken) ok(`name taken: ${n}`, (N.cleanName(n) as { error?: string }).error === 'That name is taken.', N.cleanName(n));
  for (const n of blocked) ok(`name blocked: ${n}`, (N.cleanName(n) as { error?: string }).error === 'Pick another name.', N.cleanName(n));
  const cn = (v: unknown) => N.cleanName(v);
  ok('a name is 2 to 20 letters', !cn('x').ok && !cn('A'.repeat(21)).ok && cn('A'.repeat(20)).ok && !cn('12345').ok && !cn('   ').ok && !cn(42).ok);
  ok('a name loses direction overrides and invisible characters', (cn('Mo‮gol​') as { value: string }).value === 'Mogol');
  ok('a name keeps only letters, numbers, spaces and . \' _ -', (cn('Dune<b>King</b>!!') as { value: string }).value === 'DunebKingb');
  const cm = (v: unknown) => N.cleanMessage(v);
  ok('a message may be empty', cm('').ok && cm(null).ok && cm(undefined).ok);
  ok('a message is one line of at most 140', (cm('a\nb\tc') as { value: string }).value === 'a b c' && cm('x'.repeat(140)).ok && !cm('x'.repeat(141)).ok);
  ok('a message has no links', ['visit www.evil.com', 'https://x.y', 'join discord.gg/abc', 'go to example (dot) com', 'evil . com'].every((m) => (cm(m) as { error?: string }).error === 'No links in a dare.'));
  ok('a message is friendly', ['shit', 'kill yourself', 'go kill your self', 'F U C K'].every((m) => !cm(m).ok) && ['this hit hard', 'who rejected it', 'class hit', 'skill yourself up', 'Beat my 8,412 :)', 'I will kill you in this race'].every((m) => cm(m).ok));
  ok('stacked marks are cut to two', [...(cm('Ź̂̃̄̅a') as { value: string }).value.normalize('NFD')].length <= 5);

  /* --------------------------------------------- publish, once, credited -- */
  const WORLD = readFileSync(new URL('lib/runtime/reference-world.js', ROOT), 'utf8');
  const META = { title: 'Dare Check', tagline: 'A check of the dare loop.', blurb: 'Made by the dare check.', genre: 'Test', cast: [{ name: 'Pip', color: '#F2E3C4', role: 'player' }], palette: { sky: '#9CCBEB', ground: '#7DB356', accent: '#F28C28' } };
  const draft = (parentId?: string) => { const id = randomUUID(); D.insertDraft({ id, prompt: 'dare check', meta: META, code: WORLD, report: { ok: true, ran: true }, format: 'world', parentId: parentId ?? null }); return id; };
  const UA = 'Mozilla/5.0 (Macintosh) Chrome/130 Safari/537.36';
  const req = (path: string, body?: unknown, h: Record<string, string> = {}) => new Request(`http://localhost${path}`, {
    method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', 'user-agent': UA, 'sec-fetch-site': 'same-origin', 'x-forwarded-for': '10.0.0.1', ...h },
  });
  const P1 = randomUUID(), P2 = randomUUID(), P3 = randomUUID();
  const publish = async (b: unknown) => { const r = await games.POST(req('/api/games', b)); return { status: r.status, j: await r.json() as { id: string; slug: string; creator?: string | null; again?: boolean; error?: string; field?: string } }; };

  const d1 = draft();
  const a = await publish({ draftId: d1, creator: 'DuneKing', player: P1 });
  const b = await publish({ draftId: d1, creator: 'Someone Else', player: P2 });
  ok('publishing a draft credits its creator', a.status === 200 && a.j.creator === 'DuneKing' && D.getGameById(a.j.id)?.creator === 'DuneKing', a);
  ok('a second publish of the same draft is the first game', b.j.id === a.j.id && b.j.slug === a.j.slug && b.j.again === true && b.j.creator === 'DuneKing', b);
  ok('...and the draft became one game', (db.prepare('SELECT COUNT(*) AS n FROM games WHERE id = ?').get(a.j.id) as { n: number }).n === 1 && D.publishedGame(d1)?.id === a.j.id);
  const d2 = draft();
  const [c1, c2] = await Promise.all([publish({ draftId: d2 }), publish({ draftId: d2 })]);
  ok('two publishes at once make one game', c1.j.id === c2.j.id && (db.prepare("SELECT COUNT(*) AS n FROM games WHERE title = 'Dare Check'").get() as { n: number }).n === 2, [c1, c2]);
  const named = await publish({ draftId: d2, creator: 'LateName', player: P1 });
  ok('a game published unnamed is named by a later publish of its draft', named.j.creator === 'LateName' && D.getGameById(c1.j.id)?.creator === 'LateName');
  const d3 = draft();
  const bad = await publish({ draftId: d3, creator: 'GameMog Official', player: P1 });
  ok('a creator name that does not pass is refused before publishing', bad.status === 400 && bad.j.field === 'creator' && !D.publishedGame(d3), bad);
  ok('publishDraft still says true for a new game and false for a published draft', D.publishDraft(d3, D.slugify('Dare Check'), randomUUID()) === true && D.publishDraft(d3, D.slugify('Dare Check'), randomUUID()) === false);
  const listed = await (await games.GET()).text();
  ok('GET /api/games never carries the creator\'s browser id', !listed.includes(P1) && !listed.includes('creator_player'));
  ok('...and a game row carries its public creator', 'creator' in (D.getGameById(a.j.id) ?? {}) && !('creator_player' in (D.getGameById(a.j.id) ?? {})));
  const test = D.getGameById(a.j.id)!;

  /* -------------------------------------------------------------- boards -- */
  const kart = (db.prepare("SELECT id, slug FROM games WHERE slug = 'meme-kart' AND hidden = 0").get() as { id: string; slug: string } | undefined)
    ?? (db.prepare("SELECT id, slug FROM games WHERE format = 'world' AND hidden = 0 AND code LIKE '%kart:%'").all() as { id: string; slug: string }[]).find((g) => X.boardOf(D.getGameById(g.id)!) === 'kart');
  ok('a kart world is in the snapshot', !!kart);
  if (!kart) return;
  const kg = D.getGameById(kart.id)!;
  ok('boardOf reads a game the way its page does', X.boardOf(kg) === 'kart' && X.boardOf(test) === 'level' && X.boardOf({ format: 'custom', code: null, meta: '{"scoring":"time"}' }) === 'time'
    && X.boardOf({ format: 'custom', code: null, meta: '{"scoring":"survival"}' }) === 'score' && X.boardOf({ format: 'race', code: null, meta: null }) === 'time');
  const C = K.kartConstants(kg.meta, kg.code, (await import('../lib/mog-dna.ts')).dna(kg.code!).kart);
  const racer = 'pepe', tStar = K.KartScore.tStar(C, racer);
  const kRun = (secs: number, place = 2, extra: Record<string, unknown> = {}) => ({ type: 'result', finished: true, kart: true, place, timeMs: Math.round(secs * 1000), laps: C.laps, level: C.laps, gm: 40, hits: 3, karts: C.karts, estimated: false, progress: null, racer, score: 999999, ...extra });
  const slow = kRun(tStar * 1.35, 3), fast = kRun(tStar * 1.15, 1);
  const score = (r: ReturnType<typeof kRun>) => K.KartScore.score({ timeMs: r.timeMs, place: r.place, gm: r.gm, hits: r.hits, estimated: false, progress: null, racer }, C).total;
  const cs = X.checkRun(kg, slow);
  ok('a kart run is scored by the server, never by the client\'s number', cs.ok && cs.run.score === score(slow) && cs.run.score !== 999999, cs);
  ok('a kart run held for review is refused', !X.checkRun(kg, kRun(tStar * 0.97, 1)).ok && (X.checkRun(kg, kRun(tStar * 0.97, 1)) as { error: string }).error === 'That run is being checked.');
  ok('an assisted run is refused', !X.checkRun(kg, { ...slow, assisted: true }).ok && !X.checkRun(test, { level: 3, gm: 10, timeMs: 60000, assisted: true }).ok);
  ok('a run out of range is refused', !X.checkRun(kg, kRun(tStar * 1.2, 99)).ok && !X.checkRun(test, { level: 900, gm: 10, timeMs: 1000 }).ok && !X.checkRun(kg, null).ok);
  // a penalty shootout (12 Oct): the score board, its run the goals (score) from the kicks (level), read as goals
  {
    const { readFileSync: read } = await import('node:fs');
    const sg = { format: 'world' as const, code: read(new URL('worlds/shootout.js', ROOT), 'utf8'), meta: '{"mode":"shootout"}' };
    const c = X.checkRun(sg, { score: 3, level: 4, timeMs: 9000, won: true, place: 1 }), t = c.ok ? X.describeRun(sg, c.run) : null;
    ok('a shootout ranks its goals on the score board: "Goals to beat", from that many kicks', X.boardOf(sg) === 'score' && !!t && t.label === 'Goals to beat' && t.text === '3' && t.sub === 'from 4 kicks' && t.value === 3, t ?? c);
    ok('...and more goals than kicks, no kick, or an assisted run is refused', !X.checkRun(sg, { score: 5, level: 4, timeMs: 9000 }).ok && !X.checkRun(sg, { score: 0, level: 0, timeMs: 9000 }).ok && !X.checkRun(sg, { score: 1, level: 1, timeMs: 9000, assisted: true }).ok);
    ok('...and every other world keeps its board', X.boardOf(test) === 'level' && X.boardOf(kg) === 'kart');
  }
  // a Grand Prix (18 Oct): the fastest finished race first, on the time board; a time counts only over the world's own laps
  {
    const { readFileSync: read } = await import('node:fs');
    const gpw = { format: 'world' as const, code: read(new URL('worlds/artificial1.js', ROOT), 'utf8'), meta: '{"mode":"gp","scoring":"time"}' };
    const gr = (o: Record<string, unknown> = {}) => X.checkRun(gpw, { level: 3, timeMs: 275000, place: 4, gm: 0, kos: 0, gp: true, laps: 3, of: 3, ...o });
    const fast = gr({ timeMs: 260500, place: 1 }), slow = gr(), td = slow.ok ? X.describeRun(gpw, slow.run) : null;
    ok('a Grand Prix ranks the fastest race first, on the time board, not as a survival run', X.boardOf(gpw) === 'time' && fast.ok && slow.ok && X.better('time', fast.run, slow.run) && !X.better('time', slow.run, fast.run), td ?? slow);
    ok('...a run over its three laps counts, with the place it finished in', slow.ok && slow.run.timeMs === 275000 && slow.run.place === 4 && slow.run.level === 3 && slow.run.gm === 0);
    ok('...a run short of its laps, classified without finishing, faster than a lap can be run, outside 1 to 20 or assisted is refused',
      [gr({ level: 1, timeMs: 90000 }), gr({ classified: true }), gr({ timeMs: 100000 }), gr({ place: 21 }), gr({ place: 0 }), gr({ assisted: true }), gr({ timeMs: 4 * 3600 * 1000 })].every((r) => !r.ok));
    const { gpLaps } = await import('../lib/custom-game.ts');
    ok('...and its laps are the ones its own gp: { laps } names (three when it names none)', gpLaps(gpw.code) === 3 && gpLaps('GameMog.world({ gp: { laps: 2, field: 20 } })') === 2 && gpLaps('GameMog.world({ kart: { laps: 4 } })') === 3 && gpLaps(null) === 3);
  }
  const R = (p: Partial<import('../lib/dare.ts').DareRun>): import('../lib/dare.ts').DareRun => ({ timeMs: 60000, place: 0, laps: null, gm: 0, hits: 0, est: false, progress: null, racer: null, level: 1, kos: 0, survival: false, score: null, ...p });
  ok('better: kart by score, then time', X.better('kart', R({ score: 9000, timeMs: 99 }), R({ score: 8000, timeMs: 1 })) && X.better('kart', R({ score: 8000, timeMs: 1 }), R({ score: 8000, timeMs: 2 })) && !X.better('kart', R({ score: 8000 }), R({ score: 8000 })));
  ok('better: survival by time, then GM, then takedowns', X.better('survival', R({ timeMs: 70000 }), R({ timeMs: 60000, gm: 999 })) && X.better('survival', R({ gm: 5 }), R({ gm: 4 })) && X.better('survival', R({ kos: 2 }), R({ kos: 1 })));
  ok('better: level by level, then GM, then the faster', X.better('level', R({ level: 5 }), R({ level: 4, gm: 900 })) && X.better('level', R({ level: 5, gm: 10 }), R({ level: 5, gm: 9 })) && X.better('level', R({ level: 5, timeMs: 1 }), R({ level: 5, timeMs: 2 })));
  ok('better: time by the faster, place by the higher', X.better('time', R({ timeMs: 1 }), R({ timeMs: 2 })) && X.better('place', R({ place: 1 }), R({ place: 2 })) && !X.better('place', R({ place: 0 }), R({ place: 8 })));
  ok('margin and its words', X.margin('kart', R({ score: 7950 }), R({ score: 8412 })) === -462 && X.marginText('kart', -462) === '462' && X.marginText('survival', 12500) === '0:12' && X.marginText('level', 1) === '1 level' && X.marginText('level', 3) === '3 levels');
  ok('headline: a run in a few words', X.headline('kart', R({ score: 8412 })) === '8,412' && X.headline('survival', R({ timeMs: 185000 })) === '3:05' && X.headline('level', R({ level: 12 })) === 'Level 12' && X.headline('place', R({ place: 2 })) === '2nd');

  /* --------------------------------------------------------------- dares -- */
  X.resetRate();
  const OG = new Uint8Array(readFileSync(new URL('public/og.jpg', ROOT)));
  const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
  const send = async (body: Record<string, unknown>, h: Record<string, string> = {}) => { const r = await dares.POST(req('/api/dares', body, h)); return { status: r.status, j: await r.json() as { id: string; url: string; target: import('../lib/dare.ts').Target | null; card: boolean; error?: string; field?: string } }; };
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  const k1 = await send({ gameId: kart.id, sender: P1, name: 'DuneKing', message: 'Beat it.', run: slow, card: b64(OG) });
  ok('a dare is made', k1.status === 200 && X.validDareId(k1.j.id) && k1.j.url === `/g/${kart.slug}/dare/${k1.j.id}` && k1.j.card === true, k1);
  ok('...with its target worked out by the server', k1.j.target?.value === score(slow) && k1.j.target?.label === 'Score to beat' && k1.j.target?.text === score(slow).toLocaleString('en-US') && /^3rd of \d+ · \d+:\d\d\.\d$/.test(k1.j.target?.sub ?? ''), k1.j.target);
  const row = db.prepare('SELECT * FROM dares WHERE id = ?').get(k1.j.id) as Record<string, unknown>;
  ok('...keeping the run\'s parts and the sender privately', row.sender === P1 && row.time_ms === slow.timeMs && row.place === 3 && row.board === 'kart' && row.racer === 'pepe');
  const view = await one.GET(req(`/api/dares/${k1.j.id}`), ctx(k1.j.id));
  const vt = await view.text();
  ok('GET /api/dares/<id> shows the dare', view.status === 200 && JSON.parse(vt).name === 'DuneKing' && JSON.parse(vt).message === 'Beat it.' && JSON.parse(vt).game.slug === kart.slug && JSON.parse(vt).target.value === score(slow) && JSON.parse(vt).hasCard === true);
  ok('...and never the sender\'s id', !vt.includes(P1) && !vt.includes('sender'));
  ok('a dare\'s sent step is recorded', !!db.prepare("SELECT 1 FROM dare_events WHERE dare_id = ? AND visitor = ? AND kind = 'sent'").get(k1.j.id, P1));
  ok('an unknown dare is not found', (await one.GET(req('/api/dares/AAAAAAAAAA'), ctx('AAAAAAAAAA'))).status === 404 && (await one.GET(req('/api/dares/x'), ctx('../x'))).status === 404);

  // the target, scored again with the constants of the day
  const meta0 = kg.meta;
  const setMeta = (m: string | null) => db.prepare('UPDATE games SET meta = ? WHERE id = ?').run(m, kart.id);
  const m = JSON.parse(meta0 ?? '{}') as { kartScore: import('../lib/kart-score.ts').KartConstants };
  const tweak = (f: (c: import('../lib/kart-score.ts').KartConstants) => void) => { const c = structuredClone(m.kartScore); f(c); setMeta(JSON.stringify({ ...m, kartScore: c })); };
  tweak((c) => { c.tStar = typeof c.tStar === 'number' ? c.tStar * 1.1 : Object.fromEntries(Object.entries(c.tStar).map(([k, v]) => [k, v * 1.1])); });
  const re = X.target(X.getDare(k1.j.id)!);
  ok('a kart target is scored with the game\'s constants of today', !!re && re.value !== score(slow), re?.value);
  tweak((c) => { c.tStar = typeof c.tStar === 'number' ? (slow.timeMs / 1000) * 1.2 : Object.fromEntries(Object.entries(c.tStar).map(([k]) => [k, (slow.timeMs / 1000) * 1.2])); });
  ok('...and a run today\'s constants would hold for review is no target', X.target(X.getDare(k1.j.id)!) === null);
  setMeta(meta0);
  ok('...and back', X.target(X.getDare(k1.j.id)!)?.value === score(slow));

  // answering it
  const answer = async (id: string, body: unknown, h: Record<string, string> = {}) => { const r = await result.POST(req(`/api/dares/${id}/result`, body, h), ctx(id)); return { status: r.status, j: await r.json() as { beaten: boolean; margin: number | null; marginText: string | null; you: import('../lib/dare.ts').Target; them: import('../lib/dare.ts').Target | null; error?: string } }; };
  const won = await answer(k1.j.id, { visitor: P2, run: fast });
  ok('a better run beats the dare', won.status === 200 && won.j.beaten === true && won.j.margin === score(fast) - score(slow) && won.j.you.value === score(fast) && won.j.them?.value === score(slow), won);
  const lost = await answer(k1.j.id, { visitor: P3, run: kRun(tStar * 1.6, 6) });
  ok('a worse run does not', lost.j.beaten === false && (lost.j.margin ?? 0) < 0 && lost.j.marginText === String(Math.abs(lost.j.margin ?? 0).toLocaleString('en-US')), lost);
  const tie = await answer(k1.j.id, { visitor: P3, run: slow });
  ok('a tie does not beat it', tie.j.beaten === false && tie.j.margin === 0);
  const ev = (id: string, v: string) => (db.prepare('SELECT kind FROM dare_events WHERE dare_id = ? AND visitor = ? ORDER BY kind').all(id, v) as { kind: string }[]).map((r) => r.kind).join(',');
  ok('finished and beaten are recorded', ev(k1.j.id, P2) === 'beaten,finished' && ev(k1.j.id, P3) === 'finished');
  await answer(k1.j.id, { visitor: P1, run: fast });
  ok('the sender\'s own runs are not', ev(k1.j.id, P1) === 'sent');
  ok('an answer that is assisted, held for review or from elsewhere is refused',
    (await answer(k1.j.id, { visitor: P2, run: { ...fast, assisted: true } })).status === 422 && (await answer(k1.j.id, { visitor: P2, run: kRun(tStar * 0.97, 1) })).status === 422
    && (await answer(k1.j.id, { visitor: 'nope', run: fast })).status === 400 && (await answer(k1.j.id, { visitor: P2, run: fast }, { 'sec-fetch-site': 'cross-site' })).status === 403);

  // the funnel's own steps
  const step = async (id: string, body: unknown, h: Record<string, string> = {}) => (await event.POST(req(`/api/dares/${id}/event`, body, h), ctx(id))).status;
  await step(k1.j.id, { visitor: P2, kind: 'opened' }); await step(k1.j.id, { visitor: P2, kind: 'opened' }); await step(k1.j.id, { visitor: P2, kind: 'played' });
  ok('opened and played are recorded once each', ev(k1.j.id, P2) === 'beaten,finished,opened,played');
  const P4 = randomUUID();
  await step(k1.j.id, { visitor: P4, kind: 'opened' }, { 'user-agent': 'Twitterbot/1.0' });
  await step(k1.j.id, { visitor: P4, kind: 'opened' }, { 'sec-fetch-site': 'cross-site' });
  await step(k1.j.id, { visitor: P4, kind: 'beaten' });
  await step(k1.j.id, { visitor: P4, kind: 'sent' });
  ok('bots, other sites and steps a page cannot claim are dropped', ev(k1.j.id, P4) === '' && (await step(k1.j.id, { visitor: P4, kind: 'opened' }, { 'user-agent': '' })) === 204);
  await step(k1.j.id, { visitor: P1, kind: 'opened' }); await step(k1.j.id, { visitor: P1, kind: 'shared' });
  ok('the sender\'s opens are not counted, their shares are', ev(k1.j.id, P1) === 'sent,shared');

  // mogging it back: a dare on another game that answers this one
  const back = await send({ gameId: test.id, sender: P2, name: 'Rival', parent: k1.j.id }, { 'x-forwarded-for': '10.0.0.2' });
  ok('a dare sent back on another game records mogged_back on the first', back.status === 200 && ev(k1.j.id, P2).includes('mogged_back') && (db.prepare('SELECT parent_dare FROM dares WHERE id = ?').get(back.j.id) as { parent_dare: string }).parent_dare === k1.j.id);
  ok('a dare with no run has no target', back.j.target === null && (await answer(back.j.id, { visitor: P3, run: { level: 3, gm: 20, timeMs: 60000 } })).j.beaten === false);
  const noParent = await send({ gameId: test.id, sender: P2, parent: 'ZZZZZZZZZZ' }, { 'x-forwarded-for': '10.0.0.2' });
  ok('a parent that does not exist is dropped', noParent.status === 200 && (db.prepare('SELECT parent_dare FROM dares WHERE id = ?').get(noParent.j.id) as { parent_dare: string | null }).parent_dare === null);

  // a penalty shootout (13 Oct, its Mogs on): a dare on one reads as goals and can be mogged back, as a dare on any game can
  {
    const sid = randomUUID();
    D.insertDraft({ id: sid, prompt: 'dare check', meta: { ...META, title: 'Dare Check Shootout' }, code: readFileSync(new URL('worlds/shootout.js', ROOT), 'utf8'), report: { ok: true, ran: true }, format: 'world', parentId: null });
    const sp = await publish({ draftId: sid });
    const sd = await send({ gameId: sp.j.id, sender: P2, name: 'Keeperbane', run: { type: 'result', finished: true, score: 3, level: 4, timeMs: 9000, won: true, place: 1 } }, { 'x-forwarded-for': '10.0.0.9' });
    const sv = sd.status === 200 ? X.dareView(sd.j.id) : null;
    ok('a dare on a penalty shootout reads "Goals to beat", and can be mogged back', sp.status === 200 && sd.status === 200 && sv?.board === 'score' && sv.target?.label === 'Goals to beat' && sv.target.text === '3' && sv.game.mog === true, sv ?? sd);
    ok('...as a dare on every other game can', X.dareView(k1.j.id)?.game.mog === true && X.dareView(back.j.id)?.game.mog === true);
    // (the dare landing and the results card show "Mog it back" on game.mog and nothing else; the landing as the dev
    // server draws it is scripts/platform-check.ts's "a dare on it ...")
    const landing = readFileSync(new URL('app/g/[slug]/dare/[id]/page.tsx', ROOT), 'utf8'), overlay = readFileSync(new URL('app/g/[slug]/dare-overlay.tsx', ROOT), 'utf8');
    ok('...and the dare landing and the results card offer "Mog it back" whenever the game can be mogged',
      /\{g\.mog && <Link [^>]*href=\{`\/mog\/\$\{g\.slug\}\?dare=\$\{d\.id\}`\}>Mog it back<\/Link>\}/.test(landing) && /\{view\.game\.mog && <a [^>]*href=\{mogHref\}>Mog it back<\/a>\}/.test(overlay)
      && (landing.match(/Mog it back/g) ?? []).length === 1 && (overlay.match(/Mog it back/g) ?? []).length === 1);
  }

  // naming the creator from a dare: only the browser that published it
  const d4 = draft(); const g4 = await publish({ draftId: d4, player: P3 });
  await send({ gameId: g4.j.id, sender: P2, name: 'NotTheCreator' }, { 'x-forwarded-for': '10.0.0.3' });
  ok('a dare from someone else does not name a game', D.getGameById(g4.j.id)?.creator === null);
  await send({ gameId: g4.j.id, sender: P3, name: 'TheCreator' }, { 'x-forwarded-for': '10.0.0.3' });
  ok('a dare from its creator names an unnamed game', D.getGameById(g4.j.id)?.creator === 'TheCreator');

  // refusals
  ok('a dare\'s name and message are checked', (await send({ gameId: test.id, sender: P2, name: 'Admin' }, { 'x-forwarded-for': '10.0.0.4' })).j.field === 'name'
    && (await send({ gameId: test.id, sender: P2, message: 'see www.spam.com' }, { 'x-forwarded-for': '10.0.0.4' })).j.field === 'message');
  ok('a dare needs a real game, a sender and a run that passes', (await send({ gameId: 'nope', sender: P2 }, { 'x-forwarded-for': '10.0.0.4' })).status === 404
    && (await send({ gameId: test.id, sender: 'x' }, { 'x-forwarded-for': '10.0.0.4' })).status === 400
    && (await send({ gameId: kart.id, sender: P2, run: { ...slow, assisted: true } }, { 'x-forwarded-for': '10.0.0.4' })).j.field === 'run'
    && (await send({ gameId: kart.id, sender: P2, run: kRun(tStar * 0.97, 1) }, { 'x-forwarded-for': '10.0.0.4' })).status === 422);
  ok('a dare from another site or a bot is refused', (await send({ gameId: test.id, sender: P2 }, { 'sec-fetch-site': 'cross-site', 'x-forwarded-for': '10.0.0.5' })).status === 403
    && (await send({ gameId: test.id, sender: P2 }, { 'user-agent': 'curl/8', 'x-forwarded-for': '10.0.0.5' })).status === 403);
  const huge = await dares.POST(req('/api/dares', JSON.stringify({ gameId: test.id, sender: P2, card: 'A'.repeat(700_000) }), { 'x-forwarded-for': '10.0.0.6' }));
  ok('a body far past a card\'s size is refused unread', huge.status === 413);
  const unlisted = db.prepare("SELECT id FROM games WHERE hidden = 1 AND json_extract(meta, '$.unlisted') = 1").get() as { id: string } | undefined;
  if (unlisted) ok('an unlisted game can be dared (its link is open)', (await send({ gameId: unlisted.id, sender: P2 }, { 'x-forwarded-for': '10.0.0.7' })).status === 200);
  const down = await publish({ draftId: draft() });
  db.prepare('UPDATE games SET hidden = 1 WHERE id = ?').run(down.j.id);
  ok('a game taken down cannot be dared', (await send({ gameId: down.j.id, sender: P2 }, { 'x-forwarded-for': '10.0.0.7' })).status === 404);

  /* ---------------------------------------------------------------- card -- */
  ok('og.jpg reads as a 1200 x 630 JPEG', X.jpegSize(OG)?.w === 1200 && X.jpegSize(OG)?.h === 630 && X.checkCard(OG).ok);
  const fake = (w: number, h: number, pad = 0) => { const head = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]; const u = new Uint8Array(head.length + pad + 2); u.set(head); u[u.length - 2] = 0xff; u[u.length - 1] = 0xd9; return u; };
  ok('a card must be 1200 x 630', X.checkCard(fake(1200, 630)).ok && !X.checkCard(fake(1280, 720)).ok && !X.checkCard(fake(630, 1200)).ok);
  ok('a card must be at most 350 KB', X.checkCard(fake(1200, 630, 350 * 1024 - 100)).ok && !X.checkCard(fake(1200, 630, 350 * 1024)).ok);
  const png = new Uint8Array(readFileSync(new URL('app/icon.png', ROOT)));
  ok('a card must be a JPEG', !X.checkCard(png).ok && !X.checkCard(new Uint8Array([0xff, 0xd8, 0xff])).ok && X.decodeCard('not base64!') === null && X.decodeCard(`data:image/jpeg;base64,${b64(OG)}`)?.length === OG.length);
  const wrongCard = await send({ gameId: test.id, sender: P2, card: b64(fake(1280, 720)) }, { 'x-forwarded-for': '10.0.0.8' });
  ok('a dare with a card that does not pass is made without it', wrongCard.status === 200 && wrongCard.j.card === false);
  const get = async (slug: string, id: string) => card.GET(req(`/g/${slug}/dare/${id}/card`), { params: Promise.resolve({ slug, id }) });
  const c200 = await get(kart.slug, k1.j.id);
  ok('the card route serves the card for good', c200.status === 200 && c200.headers.get('content-type') === 'image/jpeg' && /immutable/.test(c200.headers.get('cache-control') ?? '') && Buffer.from(await c200.arrayBuffer()).equals(Buffer.from(OG)));
  const c302 = await get(test.slug, wrongCard.j.id);
  ok('...and the game\'s cover for a dare with none', c302.status === 302 && c302.headers.get('location') === `/g/${test.slug}/cover?plain` && !/immutable/.test(c302.headers.get('cache-control') ?? ''));
  ok('...only under its own game', (await get(test.slug, k1.j.id)).status === 404 && (await get('../x', k1.j.id)).status === 404);
  const later = await send({ gameId: test.id, sender: P2 }, { 'x-forwarded-for': '10.0.0.8' });
  const put = async (id: string, body: unknown) => { const r = await upload.POST(req(`/api/dares/${id}/card`, body), ctx(id)); return { status: r.status, j: await r.json() as { card?: boolean } }; };
  ok('a card can be added after the dare, by its sender only', (await put(later.j.id, { sender: P3, card: b64(OG) })).status === 404 && (await put(later.j.id, { sender: P2, card: b64(fake(1280, 720)) })).j.card === false
    && (await put(later.j.id, { sender: P2, card: b64(OG) })).j.card === true && X.getDare(later.j.id)?.has_card === 1 && (await get(test.slug, later.j.id)).status === 200);
  ok('...and only once', (await put(later.j.id, { sender: P2, card: b64(fake(1200, 630)) })).j.card === true && Buffer.from(await (await get(test.slug, later.j.id)).arrayBuffer()).equals(Buffer.from(OG)));
  X.setDareHidden(wrongCard.j.id, true);
  ok('a hidden dare is gone everywhere', (await get(test.slug, wrongCard.j.id)).status === 404 && (await one.GET(req('/'), ctx(wrongCard.j.id))).status === 404 && (await step(wrongCard.j.id, { visitor: P3, kind: 'opened' })) === 204 && ev(wrongCard.j.id, P3) === '');

  /* ------------------------------------------------------------ the limit -- */
  X.resetRate();
  const many: number[] = [];
  for (let i = 0; i < 11; i++) many.push((await send({ gameId: test.id, sender: P2 }, { 'x-forwarded-for': '10.9.9.9' })).status);
  ok('ten dares in ten minutes from one address, then a pause', many.slice(0, 10).every((s) => s === 200) && many[10] === 429, many);
  ok('...for that address only', (await send({ gameId: test.id, sender: P2 }, { 'x-forwarded-for': '10.9.9.10' })).status === 200);
  ok('...and the pause ends', X.rateOk('10.9.9.9', Date.now() + 10 * 60_000 + 1));
  ok('cards share a daily budget', X.cardBudgetOk(1000, Date.parse('2030-01-01T10:00Z')) && !X.cardBudgetOk(200 * 1024 * 1024, Date.parse('2030-01-01T11:00Z')) && X.cardBudgetOk(1000, Date.parse('2030-01-02T00:00Z')));
  const adm = X.adminDares(200);
  ok('/admin lists dares, hidden ones too, with their steps and never the sender', adm.some((d) => d.id === k1.j.id && d.opened === 1 && d.beaten === 1 && d.finished === 2 && d.has_card === 1) && adm.some((d) => d.id === wrongCard.j.id && d.hidden === 1) && !JSON.stringify(adm).includes(P1));
  const counts = X.dareCounts([kart.id, test.id, 'none']);
  ok('dares are counted per game, hidden ones left out', counts[kart.id] === 1 && counts.none === 0 && counts[test.id] === (db.prepare('SELECT COUNT(*) AS n FROM dares WHERE game_id = ? AND hidden = 0').get(test.id) as { n: number }).n && JSON.stringify(X.dareCounts([])) === '{}');
  const f = X.dareFunnel(0);
  ok('the funnel counts its steps', f.dares >= 5 && f.sent >= 5 && f.beaten >= 1 && f.finished >= 2 && f.opened >= 1 && f.mogged_back >= 1 && f.shared >= 1, f);

  /* -------------------------------------------------------------- family -- */
  const rootDraft = draft(); const root = await publish({ draftId: rootDraft });
  const childDraft = draft(root.j.id); const child = await publish({ draftId: childDraft });
  ok('a Mog joins its root\'s family', D.family(root.j.id).map((g) => g.id).sort().join() === [root.j.id, child.j.id].sort().join());
  db.prepare('UPDATE games SET hidden = 1 WHERE id = ?').run(root.j.id);
  ok('family() of a hidden root is empty, as before', D.family(root.j.id).length === 0);
  ok('familyByRoot() of a hidden root is its listed Mogs', D.familyByRoot(root.j.id).map((g) => g.id).join() === child.j.id && D.family(child.j.id).map((g) => g.id).join() === child.j.id);

  /* -------------------------------------------------------- the card drawn -- */
  if (process.env.NOBROWSER) return;
  const BASE = process.env.BASE ?? 'http://localhost:3939';
  const OUT = process.env.OUT ?? join(tmpdir(), 'gamemog-dare-card');
  let up = false;
  try { up = (await fetch(`${BASE}/terms`)).ok; } catch { /* no server */ }
  if (!up) { ok(`the dev server at ${BASE} (for the drawn card; NOBROWSER=1 skips)`, false); return; }
  const { build } = await import('esbuild');
  const bundle = await build({ entryPoints: [new URL('lib/dare-card.ts', ROOT).pathname], bundle: true, write: false, format: 'iife', globalName: 'DareCard', platform: 'browser', target: 'es2020' });
  const js = bundle.outputFiles[0].text;
  const { withBrowser } = await import('../lib/browser.ts');
  mkdirSync(OUT, { recursive: true });
  const shots = await withBrowser(async (page) => {
    await page.goto(`${BASE}/terms`);
    for (let i = 0; i < 100 && (await page.eval<string>('document.readyState')) !== 'complete'; i++) await new Promise((r) => setTimeout(r, 100));
    await page.eval(js);
    const draw = (args: object, safari: boolean) => page.eval<{ b64: string; ms: number; filter: boolean; spacing: boolean } | { error: string }>(`(async () => {
      try {
        ${safari ? `Object.defineProperty(CanvasRenderingContext2D.prototype, 'filter', { configurable: true, get() { return 'none'; }, set() {} }); delete CanvasRenderingContext2D.prototype.letterSpacing;` : ''}
        const t = performance.now();
        const blob = await DareCard.renderDareCard(${JSON.stringify(args)});
        const c = document.createElement('canvas').getContext('2d');
        return { b64: await DareCard.cardBase64(blob), ms: Math.round(performance.now() - t), filter: (c.filter = 'blur(1px)', c.filter === 'blur(1px)'), spacing: 'letterSpacing' in c };
      } catch (e) { return { error: String(e && e.stack || e) }; }
    })()`);
    const full = await draw({ cover: `/g/${kart.slug}/cover`, title: kg.title, from: 'DuneKing', creator: 'DuneKing', parentTitle: 'Aspen GP', scoreText: '8,412', scoreSub: '2nd of 8 · 2:58.4' }, false);
    const bare = await draw({ cover: `/g/${kart.slug}/cover`, title: 'A Very Long Title For A Game That Keeps Going And Going Past The Panel', from: 'Zoë the Unstoppable', creator: null, parentTitle: null }, false);
    const safari = await draw({ cover: `/g/${kart.slug}/cover`, title: kg.title, from: 'DuneKing', creator: 'DuneKing', parentTitle: 'Aspen GP', scoreText: '3:05', scoreSub: '420 GM', scoreLabel: 'Time to beat' }, true);
    return { full, bare, safari, errors: page.errors };
  }, { width: 1280, height: 800 });
  for (const [name, s] of Object.entries({ full: shots.full, bare: shots.bare, safari: shots.safari })) {
    if ('error' in s) { ok(`the card draws (${name})`, false, s.error); continue; }
    const bytes = new Uint8Array(Buffer.from(s.b64, 'base64'));
    writeFileSync(join(OUT, `${name}.jpg`), bytes);
    ok(`the card draws as a 1200 x 630 JPEG under 350 KB (${name}, ${Math.round(bytes.length / 1024)} KB, ${s.ms} ms${name === 'safari' ? `, filter ${s.filter}, letterSpacing ${s.spacing}` : ''})`, X.checkCard(bytes).ok, X.jpegSize(bytes));
  }
  ok('...with no page errors', shots.errors.length === 0, shots.errors);
  console.log(`(the cards: ${OUT})`);
}
