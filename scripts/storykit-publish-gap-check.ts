/**
 * Publishing a story world, cut short anywhere (16 Nov; ported from the review's repro). The real publish route
 * (app/api/games/route.ts POST) and the real upload route, against a throwaway Story Kit store in the system's temp
 * folder (lib/storykit-store.ts storyStore() is pointed at it for the run, then put back); its GameMog drafts and games go
 * in this checkout's database and are removed afterwards. Checked: the store draft is kept with the game BEFORE the
 * catalog commit (a kill right after the commit leaves a kept world); a keep that fails or throws publishes nothing; a
 * commit that fails hands the keep back and a retry publishes; no interruption leaves a listed game with an unkept draft;
 * a game published by the old order (sealed, never kept) turns kept on a repeat POST; an upload in flight across a
 * publish is refused 409 and the world stays served; the boot's reconcile (deploy/reconcile.mjs) keeps an unkept draft a
 * published game names; the owner's reconcile report (storyReconcile) lists an unkept draft, a missing world file and a
 * kept draft with no game.
 */
import { register } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { db, insertDraft, publishDraft, slugify, listGames } from '../lib/db.ts';
import { StoryStore } from '../lib/storykit-store.ts';
import { voicePlanOf } from '../storykit/pack/runner.ts';
import { tinyGlb } from './storykit-store-check.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const ROOT = new URL('../', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(s, c, next) {
    if (s === 'next/headers' || s === 'next/server') return next(s + '.js', c);
    if (!s.startsWith('@/')) return next(s, c);
    for (const ext of ['', '.ts', '.tsx', '/index.ts']) { try { return await next(${JSON.stringify(ROOT)} + s.slice(2) + ext, c); } catch {} }
    return next(s, c);
  }`));

const ogg = (tag: string, n = 200) => { const b = new Uint8Array(n); b.set(new TextEncoder().encode('OggS')); b.set(new TextEncoder().encode(tag), 8); return b; };
const jpg = (tag: string, n = 300) => { const b = new Uint8Array(n); b.set([0xff, 0xd8, 0xff, 0xe0]); b.set(new TextEncoder().encode(tag), 8); return b; };
const G = globalThis as unknown as { __storykitStore?: StoryStore };

export async function runPublishGapChecks(ok: Ok) {
  console.log('\nStory Kit: publishing a story world cut short anywhere (app/api/games/route.ts, deploy/reconcile.mjs)');
  const tmp = mkdtempSync(path.join(tmpdir(), 'storykit-publish-gap-'));
  const was = { store: G.__storykitStore, mode: process.env.STORYKIT };
  const store = new StoryStore(path.join(tmp, 'storykit'));
  G.__storykitStore = store;
  process.env.STORYKIT = 'on';
  const drafts: string[] = [], games: string[] = [];
  const NY = JSON.parse(readFileSync(new URL('../storykit/pack/fixtures/good-ny.json', import.meta.url), 'utf8'));
  const realExec = db.exec.bind(db);
  const real = { keep: store.keep.bind(store), seal: store.seal.bind(store) };
  try {
    const { POST } = await import('../app/api/games/route.ts');
    const { PUT } = await import('../app/api/storykit/drafts/[id]/files/[kind]/[name]/route.ts');
    const PUB = await import('../lib/storykit-publish.ts');
    const { keepPublishedStoryDrafts } = await import('../deploy/reconcile.mjs') as { keepPublishedStoryDrafts: (d: string, l?: unknown, f?: { catalog?: string; store?: string }) => { storeId: string }[] };

    /** A story world as the build route leaves it: a store draft with files, and the GameMog draft whose meta names it. */
    const mkWorld = (tag: string) => {
      const o = store.open(NY);
      if (!o.ok) throw new Error(`open: ${o.error}`);
      const d = store.auth(o.id, o.token)!;
      const plan = voicePlanOf(JSON.parse(d.pack), '');
      for (const r of [store.put(d, 'glb', 'nico', tinyGlb(`nico ${tag}`)), store.put(store.auth(o.id, o.token)!, 'voice', `${plan.lines[0].clip}.ogg`, ogg(tag)), store.put(store.auth(o.id, o.token)!, 'art', 'key-wide.jpg', jpg(tag))]) if (!r.ok) throw new Error(`put: ${r.error}`);
      const pack = JSON.parse(d.pack), draftId = randomUUID();
      const meta = { title: `Gap Check ${tag} ${draftId.slice(0, 4)}`, tagline: 'A check of the publish order.', blurb: 'Made by the publish gap check and removed after it.', genre: 'Story world', cast: [], mode: 'storykit', scoring: 'none', runtime: 1,
        options: { hazards: 'same', music: null, open: true, coins: false }, storykit: { city: pack.base.city, pack: o.id, packId: pack.id, base: pack.base, parent: null } };
      insertDraft({ id: draftId, prompt: `gap check ${tag}`, meta, code: `GameMog.world({ storykit: ${JSON.stringify(pack)} });\n`, report: { ok: true, problems: [], kind: 'storykit', status: 'unverified' }, format: 'world' });
      drafts.push(draftId);
      return { storeId: o.id, token: o.token, draftId, meta };
    };
    const row = (id: string) => store.db.prepare('SELECT state, game_id, world FROM drafts WHERE id = ?').get(id) as { state: string; game_id: string | null; world: string | null } | undefined;
    const gameOf = (draftId: string) => db.prepare('SELECT g.id, g.slug, g.meta FROM drafts d JOIN games g ON g.id = d.published_id WHERE d.id = ?').get(draftId) as { id: string; slug: string; meta: string } | undefined;
    const listed = (id: string) => listGames().some((g: { id: string }) => g.id === id);
    const served = (w: string | null | undefined) => !!w && !!store.stat(`${w}.json`);
    const publish = async (draftId: string) => {
      try {
        const res = await POST(new Request('http://127.0.0.1:3939/api/games', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId }) }));
        const body = await res.json() as { id?: string; again?: boolean; error?: string };
        if (body.id) games.push(body.id);
        return { status: res.status, body };
      } catch (e) { return { status: 500, body: {} as { id?: string; again?: boolean; error?: string }, threw: String((e as Error).message) }; }
    };
    const noUnkeptListed = () => (db.prepare("SELECT id, meta FROM games WHERE meta LIKE '%storykit%'").all() as { id: string; meta: string }[])
      .filter((g) => games.includes(g.id) || drafts.some((d) => gameOf(d)?.id === g.id))
      .every((g) => { const sid = PUB.storeDraftOf(g.meta); return !sid || !listed(g.id) || row(sid)?.state === 'kept'; });

    // 1. a normal publish: kept before the commit
    {
      const w = mkWorld('normal');
      let atCommit: string | undefined;
      (db as { exec: (s: string) => void }).exec = (sql: string) => { if (sql === 'COMMIT' && atCommit === undefined) atCommit = JSON.stringify(row(w.storeId)); return realExec(sql); };
      const r = await publish(w.draftId);
      (db as { exec: (s: string) => void }).exec = realExec;
      const g = gameOf(w.draftId), st = row(w.storeId);
      ok('the store draft is kept with the game\'s id BEFORE the catalog commit (a kill right after the commit leaves a kept world)', !!atCommit && JSON.parse(atCommit).state === 'kept' && JSON.parse(atCommit).game_id === r.body.id, atCommit);
      ok('the publish lists the game, its draft kept with it, its world served', r.status === 200 && !!g && listed(g.id) && st?.state === 'kept' && st.game_id === g.id && served(st.world) && PUB.sealedWorldOf(g.meta) === st.world);
      const again = await publish(w.draftId);
      ok('a repeat publish is the same game ("again"), still kept', again.body.again === true && again.body.id === g?.id && row(w.storeId)?.state === 'kept');
    }
    // 2. the keep fails: nothing published (fail closed)
    {
      const w = mkWorld('keep-false');
      store.keep = () => false;
      const r = await publish(w.draftId);
      store.keep = real.keep;
      ok('a keep the store refuses publishes nothing (503), the draft is not kept for any game', r.status === 503 && !gameOf(w.draftId) && row(w.storeId)?.state !== 'kept', `${r.status} ${r.body.error}`);
      const retry = await publish(w.draftId);
      ok('...and a retry publishes and keeps it', retry.status === 200 && row(w.storeId)?.state === 'kept' && row(w.storeId)?.game_id === retry.body.id);
    }
    // 3. the keep throws (the request dies at the keep)
    {
      const w = mkWorld('keep-throws');
      store.keep = () => { throw new Error('SIMULATED: the request died at the keep'); };
      const r = await publish(w.draftId);
      store.keep = real.keep;
      ok('a request that dies at the keep publishes no game', !!r.threw && !gameOf(w.draftId) && noUnkeptListed(), r.threw);
    }
    // 4. the catalog commit fails after the keep
    {
      const w = mkWorld('commit-fails');
      let once = true;
      (db as { exec: (s: string) => void }).exec = (sql: string) => { if (sql === 'COMMIT' && once) { once = false; throw new Error('SIMULATED: the catalog commit failed'); } return realExec(sql); };
      const r = await publish(w.draftId);
      (db as { exec: (s: string) => void }).exec = realExec;
      ok('a catalog commit that fails after the keep: no game, and the keep handed back to the sweep', !!r.threw && !gameOf(w.draftId) && row(w.storeId)?.state === 'draft' && row(w.storeId)?.game_id === null, `${r.threw} ${JSON.stringify(row(w.storeId))}`);
      const retry = await publish(w.draftId);
      ok('...and a retry publishes and keeps it', retry.status === 200 && row(w.storeId)?.state === 'kept' && row(w.storeId)?.game_id === retry.body.id && served(row(w.storeId)?.world));
    }
    ok('no interruption above left a listed game with an unkept draft', noUnkeptListed());

    // 5. a game the old order left listed with a sealed, unkept draft
    const orphan = mkWorld('old-order');
    {
      const story = PUB.sealStoryDraft({ meta: JSON.stringify(orphan.meta) }, true);
      const id = randomUUID();
      if (!story || !story.ok || !publishDraft(orphan.draftId, slugify(orphan.meta.title), id, undefined, story.meta, {})) throw new Error('could not make the old order\'s orphan');
      games.push(id);
      ok('(the old order: a listed game whose draft is sealed, not kept)', listed(id) && row(orphan.storeId)?.state === 'sealed');
      const rec = PUB.storyReconcile().filter((x: { storeId: string }) => x.storeId === orphan.storeId);
      ok('the owner\'s reconcile report lists it as not kept', rec.some((x: { kind: string; gameId: string | null }) => x.kind === 'unkept' && x.gameId === id), JSON.stringify(rec));
      const again = await publish(orphan.draftId);
      ok('a repeat POST of it ("again") turns sealed into kept, with its game', again.body.again === true && again.body.id === id && row(orphan.storeId)?.state === 'kept' && row(orphan.storeId)?.game_id === id && served(row(orphan.storeId)?.world));
    }
    // 6. the boot's reconcile keeps one too
    {
      const w = mkWorld('boot');
      const story = PUB.sealStoryDraft({ meta: JSON.stringify(w.meta) }, true);
      const id = randomUUID();
      if (!story || !story.ok || !publishDraft(w.draftId, slugify(w.meta.title), id, undefined, story.meta, {})) throw new Error('could not make the boot\'s orphan');
      games.push(id);
      const kept = keepPublishedStoryDrafts('data', { log: () => {} }, { catalog: path.join(process.cwd(), 'data', 'gamemog.db'), store: path.join(tmp, 'storykit', 'store.db') });
      ok('the boot\'s reconcile keeps an unkept draft a published game names, with that game', kept.some((k) => k.storeId === w.storeId) && row(w.storeId)?.state === 'kept' && row(w.storeId)?.game_id === id, JSON.stringify(kept));
      // its world file gone, and a kept draft with no game: both on the owner's report
      const world = row(w.storeId)!.world!;
      rmSync(store.blobPath(world, 'json'), { force: true });
      const lone = mkWorld('lone');
      real.keep(lone.storeId, randomUUID());
      const rec = PUB.storyReconcile();
      ok('the owner\'s report lists a missing world file and a kept draft whose game is not in the catalog', rec.some((x: { kind: string; storeId: string }) => x.kind === 'no-world' && x.storeId === w.storeId) && rec.some((x: { kind: string; storeId: string }) => x.kind === 'orphan' && x.storeId === lone.storeId),
        rec.filter((x: { storeId: string }) => [w.storeId, lone.storeId].includes(x.storeId)).map((x: { kind: string }) => x.kind).join(', '));
    }
    // 7. an upload in flight across a publish
    {
      const w = mkWorld('in-flight');
      let push!: (b: Uint8Array) => void, end!: () => void;
      const body = new ReadableStream<Uint8Array>({ start(c) { push = (b) => c.enqueue(b); end = () => c.close(); } });
      const bytes = jpg('in-flight', 400);
      const pending = PUT(new Request(`http://127.0.0.1:3939/api/storykit/drafts/${w.storeId}/files/art/avatar.jpg`, { method: 'PUT', body, headers: { authorization: `Bearer ${w.token}`, 'content-type': 'image/jpeg' }, duplex: 'half' } as RequestInit),
        { params: Promise.resolve({ id: w.storeId, kind: 'art', name: 'avatar.jpg' }) });
      push(bytes.subarray(0, 100));
      await new Promise((r) => setTimeout(r, 30));
      const r = await publish(w.draftId);
      const world = row(w.storeId)?.world;
      push(bytes.subarray(100)); end();
      const res = await pending;
      ok('an upload in flight across the publish is refused 409; the draft stays kept and its world served', r.status === 200 && res.status === 409 && row(w.storeId)?.state === 'kept' && row(w.storeId)?.world === world && served(world), `publish ${r.status}, PUT ${res.status}, ${JSON.stringify(row(w.storeId))}`);
    }
  } finally {
    (db as { exec: (s: string) => void }).exec = realExec;
    store.keep = real.keep; store.seal = real.seal;
    for (const id of games) db.prepare('DELETE FROM games WHERE id = ?').run(id);
    for (const id of drafts) db.prepare('DELETE FROM drafts WHERE id = ?').run(id);
    store.db.close();
    if (was.store) G.__storykitStore = was.store; else delete G.__storykitStore;
    if (was.mode === undefined) delete process.env.STORYKIT; else process.env.STORYKIT = was.mode;
    rmSync(tmp, { recursive: true, force: true });
  }
}
