/**
 * Story Kit: the builder, end to end against a stand-in model (4 Nov 2026; lib/storykit-build.ts, storykit/BUILDER.md).
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-builder-check.ts      (npm run storykit:builder-check)
 *
 * No paid call. Each build runs in this process through the real build route (app/api/generate/route.ts POST), the real
 * build loop (lib/generate-game.ts -> lib/storykit-build.ts) and the real Anthropic SDK, against a stand-in for the
 * Messages API on 127.0.0.1 (ANTHROPIC_BASE_URL and a stand-in key; every other host is refused) that answers each build
 * pass with the next reply of a script and the real-name check with the real names it finds in the texts it was sent.
 * The Story Kit store is a fresh one in a temporary folder; the throwaway rows in data/gamemog.db go after.
 *
 * Checked: the switch (off: a story create and a story Mog are refused before anything is spent), a city not on the list
 * (San Francisco too: every story plays on Mog City's engine, New York only so far), the system prompt (BUILDER.md
 * written for Mog City's runtime, New York's places, Mog City's set pieces, anchors, voices, the three schemas, the
 * rename rule, the Dognapped lessons, Mission 1's payoff), a good Create in New York on mogcity-1, a good Mog of Night
 * Shift (an older storykit-1 world: the Mog moves to mogcity-1; a new person, a new car, Christmas) with its cast,
 * voices and lines inherited by hash and its parent's stored files carried over, and bad replies sent back with the
 * gate's words and then fixed (Chicago labels in New York, a bike called a car, an unknown place, a real person, which
 * consent allows, a Mission 1 with no playable payoff, a step Mog City has no part for), and a Mog that keeps moving the
 * city refused to the end of the pass limit. The hero (5 Nov): a look sent to the builder for the hero's sheet, Dan as
 * the shipped hero (the gate accepts him, he is never forged), and the route refusing a bad hero before anything is spent.
 * The opening (5 Nov): BUILDER.md's chapter and the worked example's opening in the prompt, a Create with none and one
 * that opens on a close-up sent back, and the gate's rule 14 offline (place card, name cards, stage, lines, title,
 * length, a Mog keeping its parent's), the runner's world carrying it.
 */
import { register } from 'node:module';
import { createServer, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = new URL('../', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(s, c, next) {
    if (s === 'next/server') return next('next/server.js', c);
    if (s === 'next/headers') return next('next/headers.js', c);
    if (!s.startsWith('@/')) return next(s, c);
    for (const ext of ['', '.ts', '.tsx', '/index.ts']) { try { return await next(${JSON.stringify(ROOT)} + s.slice(2) + ext, c); } catch {} }
    return next(s, c);
  }`));

const { db, insertDraft, publishDraft, getGameBySlug } = await import('../lib/db.ts');
const { StoryStore } = await import('../lib/storykit-store.ts');
const { gatePack } = await import('../storykit/pack/gate.ts');
const { storykitModule, storykitMeta, inheritance, isStorykitWorld, storykitPackOf, STORY_CLOSED, exampleWorld, storykitTurn, readStoryHero } = await import('../lib/storykit-build.ts');
const { mogBase } = await import('../storykit/pack/gate.ts');
const { voicePlanOf } = await import('../storykit/pack/runner.ts');
const { MOG_SOON } = await import('../lib/custom-game.ts');

let failed = 0, passed = 0;
const ok = (name: string, cond: boolean, detail = '') => { if (cond) passed++; else failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}${!cond && detail ? `\n          ${detail}` : ''}`); };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const R = (p: string) => JSON.parse(readFileSync(new URL(p, ROOT), 'utf8'));
type Ev = { type: string; [k: string]: any };

/* ── the stand-in Messages API ── */
const REAL = ['Taylor Swift', 'Elon Musk'];
const api = { builds: 0, checks: 0, replies: [] as string[], requests: [] as any[], checkTexts: [] as string[] };
const sse = (res: ServerResponse, type: string, data: object) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
const usage = { input_tokens: 30_000, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let j: any = {};
    try { j = JSON.parse(body); } catch { /* */ }
    const msg = { id: `msg_${randomUUID().slice(0, 8)}`, type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_sequence: null };
    if (!j.stream) {
      // the real-name check: the real names its texts hold
      api.checks++;
      const t = JSON.stringify(j.messages ?? ''); api.checkTexts.push(t);
      const people = REAL.filter((n) => t.includes(n));
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ ...msg, content: [{ type: 'text', text: JSON.stringify({ people, brands: [] }) }], stop_reason: 'end_turn', usage: { ...usage, input_tokens: 3000, output_tokens: 40 } }));
    }
    api.builds++; api.requests.push(j);
    const reply = api.replies.shift() ?? 'no reply scripted';
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    sse(res, 'message_start', { message: { ...msg, content: [], stop_reason: null, usage } });
    sse(res, 'content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    for (let i = 0; i < reply.length; i += 4000) sse(res, 'content_block_delta', { index: 0, delta: { type: 'text_delta', text: reply.slice(i, i + 4000) } });
    sse(res, 'content_block_stop', { index: 0 });
    sse(res, 'message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 9000 } });
    sse(res, 'message_stop', {});
    res.end();
  });
});
const reply = (pack: any, meta: Record<string, unknown> = {}) => '```json\n' + JSON.stringify({ tagline: 'One night, one city, one fare', blurb: 'A story on the city\'s own streets. Every person, car and line is new.', people: [], brands: [], ...meta }) + '\n```\n\n```json\n' + JSON.stringify(pack) + '\n```';

type POST = (req: Request) => Promise<Response>;
async function build(POST: POST, body: Record<string, unknown>) {
  const res = await POST(new Request('http://127.0.0.1:3939/api/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const events: Ev[] = [];
  if (!(res.headers.get('content-type') ?? '').includes('ndjson')) return { status: res.status, json: await res.json() as any, events };
  const reader = res.body!.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl); buf = buf.slice(nl + 1); if (line.trim()) events.push(JSON.parse(line)); }
  }
  return { status: res.status, json: null as any, events };
}
const doneOf = (b: { events: Ev[] }) => b.events.find((e) => e.type === 'done');
const sentBack = (b: { events: Ev[] }) => b.events.filter((e) => e.type === 'problems').flatMap((e) => e.problems as string[]);

/* ── the packs ── */
// a good Create in New York on Mog City's engine: Night Shift as the builder's worked example (mogcity-1, no step Mog City
// has no part for), its three missions played twice over as six (Night Rounds)
function nyStory() {
  const p = clone(exampleWorld());
  p.id = 'anything'; p.title = 'Night Rounds'; delete p.voices;
  const more = p.acts.flatMap((a: any) => a.missions).map((m: any, i: number) => ({ ...clone(m), id: `NR-${i + 4}`, title: `${m.title} Again` }));
  p.acts.at(-1).missions.push(...more);
  return p;
}
// the same story played as Dan (the creator ticked "Play as Dan"): the hero is the shipped Dan, no sheet
function danStory() {
  const p = nyStory();
  const dez = p.cast.find((c: any) => c.id === p.hero);
  const q = JSON.parse(JSON.stringify(p).replaceAll('"dez"', '"dan"').replaceAll('{dez}', '{dan}'));
  q.cast[q.cast.findIndex((c: any) => c.id === 'dan')] = { id: 'dan', model: 'mogcity/dan', color: dez.color };
  return q;
}
// a good Mog of Night Shift: a new person (a chestnut seller), a new car (the hero's own sedan) and Christmas
function holly(ns: any) {
  const p = clone(ns);
  // (Night Shift was written for the older engine: its Mog plays on Mog City's, the base the request gives)
  p.base = mogBase(ns.base);
  p.title = 'Holly Night'; p.tagline = 'One cab, one fare, one Christmas Eve'; p.dressing.holiday = ['christmas'];
  const kwon = p.cast.find((c: any) => c.id === 'kwon');
  const nell = clone(kwon);
  nell.id = 'nell'; nell.anchor = 'street-vendor'; nell.color = '#7FB069';
  nell.voice = { id: 'nell-v1', kokoro: 'bf_emma', speed: 1.04, pitch: -0.6, description: 'a woman in her fifties, warm low alto, quick and teasing' };
  Object.assign(nell.sheet, { id: 'nell', name: 'Nell Brady', role: 'chestnut seller', logline: 'Twenty winters on the same corner with the same cart.' });
  nell.sheet.identity.age = 54; nell.sheet.voice = { ...nell.sheet.voice, id: 'nell-v1' };
  p.cast.push(nell);
  const sedan = clone(R('storykit/vehicles/sheets/black-sedan.json'));
  sedan.id = 'rides.holly-sedan'; sedan.label = 'Holly Sedan';
  if (sedan.story) sedan.story.nickname = 'Holly';
  p.vehicles.push(sedan);
  p.ride = 'rides.holly-sedan';
  const ns3 = p.acts[0].missions.find((m: any) => m.id === 'NS-3');
  ns3.vehicle = 'rides.holly-sedan';
  ns3.steps.splice(ns3.steps.length - 1, 0, { type: 'say', who: 'nell', text: 'Chestnuts, still warm. Merry Christmas, driver.', secs: 3 });
  return p;
}

const env = { key: process.env.ANTHROPIC_API_KEY, token: process.env.ANTHROPIC_AUTH_TOKEN, base: process.env.ANTHROPIC_BASE_URL, usd: process.env.BUILD_DAILY_USD, sk: process.env.STORYKIT };
const realFetch = globalThis.fetch;
const tag = `skbuild-${randomUUID().slice(0, 6)}`;
const storeDir = mkdtempSync(path.join(tmpdir(), 'storykit-builder-'));
(globalThis as any).__storykitStore = new StoryStore(storeDir);
const store = (globalThis as any).__storykitStore as InstanceType<typeof StoryStore>;
const drafts: string[] = [], games: string[] = [];
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const port = (server.address() as { port: number }).port;
try {
  process.env.ANTHROPIC_API_KEY = 'stand-in-key-for-the-local-check'; delete process.env.ANTHROPIC_AUTH_TOKEN;
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.BUILD_DAILY_USD = '1000000';
  // nothing leaves this machine
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith(`http://127.0.0.1:${port}/`)) return Promise.reject(new Error(`the builder check refused a call to ${url}`));
    return realFetch(input, init);
  }) as typeof fetch;
  const { POST } = await import('../app/api/generate/route.ts') as { POST: POST };

  // the parent: Night Shift, published as a story world (a kept store draft with one stored clip and Dez's GLB)
  const nsSrc = R('storykit/packs/test-night-shift.json');
  const ns = gatePack(nsSrc).pack;
  const opened = store.open(ns);
  if (!opened.ok) throw new Error(`Night Shift did not open in the store: ${opened.error}`);
  const row = store.auth(opened.id, opened.token)!;
  const plan = voicePlanOf(ns, '');
  const clip = plan.lines.find((l: any) => l.who === 'Dez Amaro')!;
  const ogg = new Uint8Array(256); ogg.set([0x4f, 0x67, 0x67, 0x53]);
  const putClip = store.put(row, 'voice', `${clip.clip}.ogg`, ogg, { secs: 2 });
  const putGlb = store.put(store.auth(opened.id, opened.token)!, 'glb', 'dez', new Uint8Array(readFileSync(new URL('public/storykit/cast/test-night-shift/dez.glb', ROOT))));
  const nsDraft = randomUUID(), nsGame = randomUUID(), nsSlug = `night-shift-${tag}`;
  const nsInherit = inheritance(ns, gatePack(ns).lines, null);
  insertDraft({ id: nsDraft, prompt: `Night Shift ${tag}`, meta: storykitMeta(ns, { tagline: ns.tagline, blurb: 'A cab driver, one fare and a snowy New York night.', people: [], brands: [] }, nsInherit, opened.id), code: storykitModule(ns), report: { ok: true }, format: 'world' });
  drafts.push(nsDraft);
  publishDraft(nsDraft, nsSlug, nsGame); games.push(nsGame);
  store.keep(opened.id, nsGame);
  console.log('\nStory Kit builder: the parent');
  ok('Night Shift stands as a published story world: format world, its module a pack, mode storykit, its store draft kept with a clip and a GLB',
    !!getGameBySlug(nsSlug) && isStorykitWorld(getGameBySlug(nsSlug)!.code) && putClip.ok && putGlb.ok, JSON.stringify([putClip, putGlb].map((x: any) => x.ok || x.error)));

  console.log('\nStory Kit builder: the switch (STORYKIT off, the default)');
  delete process.env.STORYKIT;
  const calls0 = api.builds + api.checks;
  const offCreate = await build(POST, { prompt: `A cab driver works the night ${tag}`, storykit: { city: 'ny' } });
  const offMog = await build(POST, { mogOf: nsSlug, prompt: `Make it Christmas ${tag}` });
  ok('off: a story create is refused (404, closed) and a story Mog is refused (409, coming soon), before anything is spent',
    offCreate.status === 404 && offCreate.json?.error === STORY_CLOSED && offMog.status === 409 && offMog.json?.error === MOG_SOON && api.builds + api.checks === calls0, JSON.stringify([offCreate.status, offCreate.json, offMog.status, offMog.json]));

  process.env.STORYKIT = 'on';
  console.log('\nStory Kit builder: on (STORYKIT=on)');
  const chicago = await build(POST, { prompt: `A courier races the fog ${tag}`, storykit: { city: 'chicago' } });
  ok('a city not on the list is refused before anything is spent (400, field city)', chicago.status === 400 && chicago.json?.field === 'city' && api.builds + api.checks === calls0, JSON.stringify(chicago.json));
  const sf = await build(POST, { prompt: `A courier races the fog ${tag}`, storykit: { city: 'sf' } });
  ok('San Francisco is refused too (400, field city): stories play on Mog City\'s engine, New York only so far', sf.status === 400 && sf.json?.field === 'city' && api.builds + api.checks === calls0, JSON.stringify(sf.json));

  /* 1. a good Create in New York, on Mog City's engine */
  console.log('\n  a good Create in New York (mogcity-1)');
  api.replies = [reply(nyStory(), { tagline: 'Six fares before sunrise' })];
  const create = await build(POST, { prompt: `A cab driver works six fares across New York before sunrise ${tag}`, storykit: { city: 'ny' } });
  const cd = doneOf(create);
  const sys = api.requests.at(-1)?.system as string ?? '';
  const turn = JSON.stringify(api.requests.at(-1)?.messages ?? '');
  ok('the build model is STORY_MODEL (claude-opus-5-5) at high effort, streamed with the system prompt cached', api.requests.at(-1)?.model === 'claude-opus-5-5' && (api.requests.at(-1) as any)?.output_config?.effort === 'high' && !!api.requests.at(-1)?.cache_control);
  ok('the system prompt carries BUILDER.md (the rename rule, the Dognapped lessons, voice design), the anchors and the voice table',
    sys.includes('# Writing a Story Kit world') && sys.includes('## Never rename one kind of thing into another') && sys.includes('## Lessons: the Dognapped Mog') && sys.includes('## Voices')
      && sys.includes('`old-boss`') && sys.includes('| af_heart |'));
  ok('BUILDER.md is written for Mog City\'s runtime (its HUD, calls, cutscenes, fights, chases, free roam), with Mission 1\'s playable payoff and the kinds Mog City has no part for',
    sys.includes('## How Mog City plays your story') && sys.includes('**Free roam between missions.**') && sys.includes('## Mission 1: a payoff the player plays') && sys.includes('## What Mog City has no part for yet') && sys.includes('"engine": "mogcity-1"'));
  ok('BUILDER.md has the opening chapter (place card, name cards for the hero and the antagonist, the premise, the title; the Velvet Run lesson), and the worked example opens with one',
    sys.includes('## The opening: where we are, who they are, what tonight is') && sys.includes('"is": "antagonist"') && sys.includes('Never open on a close-up of one person') && sys.includes('Never leave the premise for a later call or voicemail')
      && /"opening":\{"place":"@bowery"/.test(sys.slice(sys.indexOf('## Worked example'))) && turn.includes('an opening (BUILDER.md, The opening)'));
  ok('the system prompt carries Mog City\'s set pieces (the scene step) and the shipped cast',
    sys.includes("## Mog City's set pieces (the scene step)") && sys.includes('| `m1.arrival` |') && sys.includes('## The shipped cast'));
  ok('the system prompt carries the three schemas (pack v2 with mogcity-1 and the scene kind, the Character Forge sheet, the vehicle sheet) and Night Shift on Mog City\'s engine as the worked example',
    sys.includes('story-pack.v2.json') && sys.includes('"mogcity-1"') && sys.includes('"const":"scene"') && sys.includes('character-sheet.v2.json') && sys.includes('vehicle-sheet.schema.json')
      && sys.includes('"id":"test-night-shift"') && sys.includes('"cityBuild":"ny-mogcity-1"') && !/"type":"passenger"/.test(sys.slice(sys.indexOf('## Worked example'))));
  ok('a Create reads New York\'s place list (Mog City\'s), none of San Francisco\'s',
    sys.includes("## New York: Mog City's place list") && sys.includes('- @les: Orchard St') && !sys.includes('- @pier48'));
  ok('its first turn names New York and the base to copy (mogcity-1)', turn.includes('CREATE A WORLD in New York') && turn.includes('ny-mogcity-1'));
  const cRow = cd ? db.prepare('SELECT code, meta, report, parent_id FROM drafts WHERE id = ?').get(cd.draftId) as any : null;
  const cPack = cRow ? storykitPackOf(cRow.code) : null, cMeta = cRow ? JSON.parse(cRow.meta) : null, cRep = cRow ? JSON.parse(cRow.report) : null;
  if (cd) drafts.push(cd.draftId);
  ok('it passes on the first pass: a draft whose module is the gated pack (the platform\'s id, Mog City\'s base for New York), meta mode storykit in ny',
    !!cd && cd.attempts === 1 && !!cPack && /^sk-[0-9a-f]{8}$/.test(cPack.id) && cPack.base.engine === 'mogcity-1' && cPack.base.city === 'ny' && cPack.base.cityBuild === 'ny-mogcity-1' && cMeta.mode === 'storykit' && cMeta.storykit.city === 'ny' && !cRow.parent_id,
    JSON.stringify(create.events.filter((e) => e.type !== 'tick').slice(-3)).slice(0, 600));
  ok('the done event names where it plays: Mog City (mc)', /^https?:\/\//.test(cd?.mc ?? ''), String(cd?.mc));
  ok('the real-name check read every text it wrote (once), and found nobody', api.checks === 1 && api.checkTexts[0].includes('Dez Amaro') && api.checkTexts[0].includes('Six fares before sunrise'));
  const cStore = cd?.story ? store.auth(cd.story.draft, cd.story.token) : null;
  ok('its store draft is open for the creator\'s browser (id and write token in the done event, the token works), and the meta names it',
    !!cStore && cMeta.storykit.pack === cd?.story?.draft && JSON.parse(cStore.pack).id === cPack.id);
  ok('nothing inherited, everything to make in the browser: forge Dez, Mrs. Kwon, Ray and Vic, voice every line; the show hears the cast',
    cRep?.inherit?.todo?.forge?.join() === 'dez,kwon,ray,vic' && cRep.inherit.lines.inherited === 0 && cd?.story?.forge?.join() === 'dez,kwon,ray,vic' && create.events.some((e) => e.type === 'story' && e.cast?.[0]?.id === 'dez' && e.city === 'ny') && cRep.status === 'unverified',
    JSON.stringify(cRep?.inherit?.todo));

  /* 1b. the hero: "Your hero" (a look) and "Play as Dan" (5 Nov) */
  console.log('\n  the hero: a look, or Dan');
  const LOOK = 'Late 40s, broad shoulders, close-cropped grey beard, navy work jacket, tired eyes, walks like his knees hurt.';
  const bare = storykitTurn('A cab driver works the night', { city: 'ny' });
  ok('no hero (nothing, null or blank) is today\'s build exactly: the same first turn, no hero section',
    bare === storykitTurn('A cab driver works the night', { city: 'ny', hero: null }) && !/THE HERO/.test(bare)
      && [undefined, null, '', '   '].every((v) => { const r = readStoryHero(v); return r.ok && r.hero === null; }));
  const spent0 = api.builds + api.checks;
  const refusals = await Promise.all([
    { prompt: `A cab driver works the night ${tag}`, storykit: { city: 'ny', hero: 'x'.repeat(401) } },
    { prompt: `A cab driver works the night ${tag}`, storykit: { city: 'ny', hero: { model: 'jane' } } },
    { prompt: `A cab driver works the night ${tag}`, storykit: { city: 'ny', hero: { model: 'dan', look: 'tall' } } },
    { prompt: `A cab driver works the night ${tag}`, storykit: { city: 'ny', hero: 42 } },
    { prompt: `A cab driver works the night ${tag}`, storykit: { city: 'ny', hero: ['dan'] } },
    { prompt: `A cab driver works the night ${tag}`, storykit: { city: 'ny', hero: 'Tall, and looks like Brad Pitt in a navy coat' } },
  ].map((b) => build(POST, b)));
  ok('the route refuses a 401-character hero, an unknown model, an extra key, a number, a list and a real person\'s likeness (400, field hero), before anything is spent',
    refusals.every((r) => r.status === 400 && r.json?.field === 'hero') && api.builds + api.checks === spent0 && /400 characters/.test(refusals[0].json?.error ?? ''),
    JSON.stringify(refusals.map((r) => [r.status, r.json])));
  const r400 = readStoryHero('x'.repeat(400)), dan = readStoryHero({ model: 'dan' });
  ok('400 characters is the cap (accepted), and { model: "dan" } is read as Dan', r400.ok && !!r400.hero && dan.ok && (dan.hero as any)?.model === 'dan');

  api.replies = [reply(nyStory())];
  const looked = await build(POST, { prompt: `A cab driver works six fares across New York before sunrise ${tag}`, storykit: { city: 'ny', hero: LOOK } });
  const ld = doneOf(looked); if (ld) drafts.push(ld.draftId);
  const lturn = JSON.stringify(api.requests.at(-1)?.messages ?? '');
  ok('a look: the first turn carries the creator\'s words as the hero\'s look for the Character Forge sheet (appearance only, never story text, never a real person)',
    lturn.includes(LOOK) && lturn.includes("THE HERO'S LOOK") && lturn.includes('never story text') && lturn.includes('Character Forge sheet') && lturn.includes('real-person rules') && !lturn.includes('THE HERO IS DAN'));
  ok('... and the build passes with a forged hero (Dez, with a sheet, to forge)', !!ld && ld.attempts === 1 && ld.story?.forge?.includes('dez'), JSON.stringify(looked.events.filter((e) => e.type === 'problems' || e.type === 'error')).slice(0, 400));

  ok('the gate accepts a pack whose hero is the shipped Dan (no sheet, his registry voice, name and anchor filled in)',
    (() => { const g = gatePack(danStory()); const d = g.pack?.cast.find((c: any) => c.id === 'dan'); return g.ok && g.pack.hero === 'dan' && d?.model === 'mogcity/dan' && !d.sheet && d.name === 'Dan' && d.voice?.id === 'mogcity-dan'; })(),
    JSON.stringify(gatePack(danStory()).problems.slice(0, 4)));
  api.replies = [reply(nyStory()), reply(danStory())];
  const n1 = api.requests.length;
  const asDan = await build(POST, { prompt: `A cab driver works six fares across New York before sunrise ${tag}`, storykit: { city: 'ny', hero: { model: 'dan' } } });
  const dd = doneOf(asDan); if (dd) drafts.push(dd.draftId);
  const dturn = JSON.stringify(api.requests[n1]?.messages ?? '');
  ok('Dan: the first turn tells the builder the hero is the shipped Dan ({ id dan, model mogcity/dan }, no sheet, his voice), the rest a new story',
    dturn.includes('THE HERO IS DAN') && dturn.includes('\\"model\\": \\"mogcity/dan\\"') && dturn.includes('no sheet') && dturn.includes('recorded lines') && !dturn.includes("THE HERO'S LOOK"), dturn.slice(-900));
  ok('Dan: a pass with a forged hero is sent back, the pass with Dan passes; Dan is never forged (not in the forge list, done in the show)',
    sentBack(asDan).some((p) => /plays this story as Dan/.test(p)) && !!dd && dd.attempts === 2 && !dd.story?.forge?.includes('dan') && dd.story?.forge?.join() === 'kwon,ray,vic'
      && asDan.events.some((e) => e.type === 'story' && e.cast?.find((c: any) => c.id === 'dan')?.state === 'done'),
    JSON.stringify([sentBack(asDan).slice(0, 2), dd?.story?.forge]));
  const dRow = dd ? db.prepare('SELECT code FROM drafts WHERE id = ?').get(dd.draftId) as any : null;
  const dPack = dRow ? storykitPackOf(dRow.code) : null;
  ok('Dan: the stored pack plays Dan as the hero (model mogcity/dan, no sheet)', dPack?.hero === 'dan' && dPack.cast.find((c: any) => c.id === 'dan')?.model === 'mogcity/dan' && !dPack.cast.find((c: any) => c.id === 'dan')?.sheet);

  /* 2. a good Mog of Night Shift */
  console.log('\n  a good Mog of Night Shift (a new person, a new car, Christmas)');
  api.replies = [reply(holly(nsSrc), { tagline: 'Christmas Eve, one more fare' })];
  const mog = await build(POST, { mogOf: nsSlug, prompt: `Make it Christmas Eve: add a chestnut seller on the corner and give Dez his own black sedan ${tag}` });
  const md = doneOf(mog);
  const msys = api.requests.at(-1)?.system as string ?? '', mturn = JSON.stringify(api.requests.at(-1)?.messages ?? '');
  ok('a Mog reads its parent\'s city (New York) and its pack whole, told the city is locked and that it moves to Mog City\'s engine',
    msys.includes("## New York: Mog City's place list") && msys.includes('- @les: Orchard St') && !msys.includes('- @pier48') && mturn.includes('MOG.') && mturn.includes('keeps that city') && mturn.includes('Mrs. Kwon') && mturn.includes('ny-mogcity-1') && mturn.includes('older engine'));
  const mRow = md ? db.prepare('SELECT code, meta, report, parent_id FROM drafts WHERE id = ?').get(md.draftId) as any : null;
  const mPack = mRow ? storykitPackOf(mRow.code) : null, mRep = mRow ? JSON.parse(mRow.report) : null, mMeta = mRow ? JSON.parse(mRow.meta) : null;
  if (md) drafts.push(md.draftId);
  ok('it passes: the base locked to its city (New York, now on Mog City\'s engine), its parent named, its own id, the parent game as its draft\'s parent',
    !!md && md.attempts === 1 && JSON.stringify(mPack?.base) === JSON.stringify(mogBase(ns.base)) && mPack.base.engine === 'mogcity-1' && mPack.parent === ns.id && mPack.id !== ns.id && mRow.parent_id === nsGame && mMeta.storykit.parent === ns.id,
    JSON.stringify(mog.events.filter((e) => e.type === 'problems' || e.type === 'error')).slice(0, 600));
  const byId = (id: string) => mRep?.inherit?.cast?.find((c: any) => c.id === id);
  ok('inherited by hash: Dez, Mrs. Kwon and Ray keep their sheets and voices; Nell is new (to forge)',
    ['dez', 'kwon', 'ray'].every((id) => byId(id)?.sheet === 'inherited' && byId(id)?.voice === 'inherited') && byId('nell')?.sheet === 'new' && byId('nell')?.voice === 'new' && mRep.inherit.todo.forge.join() === 'nell',
    JSON.stringify(mRep?.inherit?.cast));
  const nsLines = plan.lines.length;
  ok(`every Night Shift line keeps its clip (${nsLines} inherited by text hash and voice key), only Nell's new line is to voice`,
    mRep?.inherit?.lines?.inherited === nsLines && mRep.inherit.lines.render === 1 && mRep.inherit.lines.clips.find((c: any) => c.from === null)?.id?.startsWith('NS-3.'),
    JSON.stringify({ total: mRep?.inherit?.lines?.total, inherited: mRep?.inherit?.lines?.inherited, render: mRep?.inherit?.lines?.render }));
  ok('the Night Cab is inherited, the Holly Sedan is new; Christmas is in the dressing', mRep?.inherit?.vehicles?.map((v: any) => `${v.id}:${v.state}`).join() === 'rides.night-cab:inherited,rides.holly-sedan:new' && mPack.dressing.holiday[0] === 'christmas');
  const mFiles = md?.story ? store.db.prepare('SELECT kind, name, inherited FROM files WHERE draft_id = ? ORDER BY kind').all(md.story.draft) as any[] : [];
  ok('its store draft carries the parent\'s stored files over by hash (Dez\'s GLB and his clip, no bytes copied)',
    md?.story?.inherited === 2 && mFiles.length === 2 && mFiles.every((f) => f.inherited === 1) && mFiles.some((f) => f.kind === 'glb' && f.name === 'dez'), JSON.stringify(mFiles));
  ok('the real-name check read only what the Mog wrote (Nell and her line, not Night Shift\'s inherited texts)', api.checkTexts.at(-1)!.includes('Chestnuts, still warm') && !api.checkTexts.at(-1)!.includes('Last fare, then home'));

  /* 3. bad replies, sent back with the gate's words, then fixed */
  console.log('\n  bad replies: sent back, then fixed');
  const bad = async (name: string, body: Record<string, unknown>, first: string, second: string, re: RegExp) => {
    const n0 = api.requests.length;
    api.replies = [first, second];
    const b = await build(POST, body);
    const d = doneOf(b); if (d) drafts.push(d.draftId);
    const back = sentBack(b), turn2 = JSON.stringify(api.requests[n0 + 1]?.messages?.at(-1) ?? '');
    ok(`refused: ${name}`, back.some((p) => re.test(p)) && re.test(JSON.parse(turn2).content ?? '') && !!d && d.attempts === 2, back.slice(0, 3).join(' | ') || JSON.stringify(b.events.at(-1)).slice(0, 300));
    return back;
  };
  const good = reply(holly(nsSrc));
  const chi = holly(nsSrc); chi.acts[0].missions[0].title = 'Christmas in Chicago'; chi.places['kwon-corner'].name = 'the gate at Wrigley Field';
  await bad('Chicago labels in New York (a mission title, a place name)', { mogOf: nsSlug, prompt: `Set it at a Chicago Christmas ${tag}` }, reply(chi), good, /names Chicago .*but the story is set in New York/);
  const bike = holly(nsSrc); const hs = bike.vehicles.find((v: any) => v.id === 'rides.holly-sedan'); hs.label = 'Snow Bike';
  bike.acts[0].missions[2].steps[2].objective = 'Pedal **Mrs. Kwon** home to **Bank St**';
  const backBike = await bad('a bike called a car (a car sheet labelled Snow Bike, "pedal" on a car mission)', { mogOf: nsSlug, prompt: `She rides a bike through the snow ${tag}` }, reply(bike), good, /calls a car a "Bike"/);
  ok('  ... and the pedalling is refused too, never faked', backBike.some((p) => /says "Pedal"/.test(p)) && backBike.some((p) => /"pedal" .*can't be done/.test(p)), backBike.join(' | ').slice(0, 400));
  const lost = nyStory(); lost.acts[0].missions[5].steps.find((x: any) => x.type === 'drive').to = '@brooklyn-bridge';
  await bad('an unknown place (a drive to "@brooklyn-bridge")', { prompt: `A cab driver crosses to Brooklyn ${tag}`, storykit: { city: 'ny' } }, reply(lost), reply(nyStory()), /"@brooklyn-bridge" is not a place in New York/);
  const star = nyStory(); star.cast[0].sheet.name = 'Taylor Swift';
  const backStar = await bad('a real person (the hero named Taylor Swift, left off its own list; the check finds her)', { prompt: `Taylor Swift as a cab driver ${tag}`, storykit: { city: 'ny' } }, reply(star), reply(nyStory()), /Real people are never named in a story world without their consent.*"Taylor Swift"/);
  void backStar;
  // the creator's consent for a real person lets that person be named (as an episode's)
  api.replies = [reply(star, { people: ['Taylor Swift'] })];
  const consented = await build(POST, { prompt: `Me as a cab driver ${tag}`, storykit: { city: 'ny' }, consent: { names: ['Taylor Swift'], basis: 'self', adult: true } });
  const cdn = doneOf(consented); if (cdn) drafts.push(cdn.draftId);
  ok('with the creator\'s consent for that person, the same pack passes (and the draft records the consent)', !!cdn && cdn.attempts === 1 && JSON.parse((db.prepare('SELECT meta FROM drafts WHERE id = ?').get(cdn.draftId) as any).meta).consent?.names?.[0] === 'Taylor Swift');
  // Mission 1 ends on a payoff the player plays (the owner's review, 4 Nov): a first mission that ends on a choice is sent back
  const flat = nyStory(); flat.acts[0].missions[0].steps.push({ type: 'choice', who: 'kwon', prompt: 'Tip?', timeout: 6, default: 0, options: [{ text: 'Keep the change' }, { text: 'No tip' }] });
  await bad('a Mission 1 with no playable payoff (it ends on a choice)', { prompt: `A cab driver works the night ${tag}`, storykit: { city: 'ny' } }, reply(flat), reply(nyStory()), /Mission 1\): it ends on a 'choice' step; end Mission 1 on a payoff the player plays/);
  // a new story never writes a kind Mog City has no part for (it would pass unplayed)
  const ride = nyStory(); ride.acts[0].missions[1].steps.unshift({ type: 'passenger', who: 'kwon', seat: 'rear' });
  await bad('a step Mog City has no part for yet (a passenger)', { prompt: `A cab driver and his fare ${tag}`, storykit: { city: 'ny' } }, reply(ride), reply(nyStory()), /'passenger': Mog City has no part for this yet/);
  // a search of the hero's own car says so (on: "ride", held at the car wherever he parks it): one written at the place
  // is sent back, and the same search with on: "ride" passes the gate (the Velvet Run, 5 Nov: the trunk at First Avenue)
  const trunkOf = (on: boolean) => { const p = nyStory(); p.acts[0].missions[1].steps.unshift({ type: 'search', at: '@un', label: 'search the trunk', secs: 2, objective: 'Search the **trunk**.', ...(on ? { on: 'ride', part: 'trunk' } : {}) }); return p; };
  await bad('a search of the hero\'s own car written at the place (no on: "ride"); with it, the same pack passes', { prompt: `A cab driver checks his trunk ${tag}`, storykit: { city: 'ny' } }, reply(trunkOf(false)), reply(trunkOf(true)), /the search "search the trunk" is of the hero's own car: write "on": "ride"/);

  // the opening (5 Nov, the owner after The Velvet Run): a Create with none is sent back; with one, it passes
  const bare0 = nyStory(); delete bare0.opening;
  await bad('a Create with no opening (the premise and the villain left for later)', { prompt: `A cab driver works the night ${tag}`, storykit: { city: 'ny' } }, reply(bare0), reply(nyStory()), /opening: a new story opens with an opening before Mission 1/);
  const closeUp = nyStory(); closeUp.opening.shots.unshift({ cam: { rel: 'kwon', fwd: 1.05, up: 0.03, right: 0.22 }, look: { rel: 'kwon' }, fov: 30, dur: 4, say: 'kwon', line: 'Your father\'s car, kid.' });
  await bad('an opening that opens on a close-up of one person (the Velvet Run\'s Aunt Rosa)', { prompt: `A cab driver works the night ${tag}`, storykit: { city: 'ny' } }, reply(closeUp), reply(nyStory()), /never opens on a close-up of one person/);

  /* 4. a Mog that keeps moving the city: refused to the end of the pass limit */
  const moved = holly(nsSrc); moved.base = { engine: 'mogcity-1', city: 'sf', cityBuild: 'ny-mogcity-1' };
  api.replies = [reply(moved), reply(moved), reply(moved)];
  const n0 = api.builds;
  const lock = await build(POST, { mogOf: nsSlug, prompt: `Move it to San Francisco ${tag}` });
  const err = lock.events.find((e) => e.type === 'error');
  ok('a Mog that moves the city is sent back every pass and ends after the pass limit (3) with the lock named, no draft',
    api.builds - n0 === 3 && !doneOf(lock) && !!err && /after 3 attempts/.test(err.error) && (err.problems as string[]).some((p) => /keeps its parent's city and build exactly/.test(p)), JSON.stringify(err).slice(0, 400));

  /* 5. the opening's rules (storykit/pack/gate.ts rule 14), offline */
  console.log('\n  the opening (gate rule 14)');
  {
    const { toRunnerPack } = await import('../storykit/pack/gate.ts');
    const gOk = gatePack(nyStory());
    const rp = gOk.ok ? toRunnerPack(gOk.pack) : null, plan = gOk.ok ? voicePlanOf(gOk.pack, '') : null;
    ok('a good opening passes: its lines are voiced (OPEN.c<shot>), and the runner\'s world carries it with display names (cards, stage, a line under its shot)',
      gOk.ok && gOk.lines.filter((l: any) => /^OPEN\.c\d+$/.test(l.id)).length === 3 && !!plan && plan.lines.some((l: any) => l.id === 'OPEN.c3' && l.who === 'Vic Lasko')
        && rp.opening?.place === '@bowery' && rp.opening.stage[1].who === 'Vic Lasko' && rp.opening.shots[3].card.who === 'Vic Lasko' && rp.opening.shots[3].look.rel === 'Vic Lasko'
        && rp.opening.shots[1].sub[0] === 'Dez Amaro' && !('say' in rp.opening.shots[1]) && rp.opening.shots[4].title === true, JSON.stringify(gOk.problems.slice(0, 3)));
    const refusedBy = (name: string, edit: (o: any, p: any) => void, re: RegExp, opts: any = {}) => {
      const p = nyStory(); edit(p.opening, p); const r = gatePack(p, opts);
      ok(`opening refused: ${name}`, !r.ok && r.problems.some((x) => re.test(x)), (r.problems.join(' | ') || 'passed').slice(0, 400));
    };
    refusedBy('no place card on the first shot', (o) => { delete o.shots[0].where; }, /opens on the city with the place card/);
    refusedBy('no name card for the hero', (o) => { delete o.shots[1].card; }, /the hero \("dez"\) gets a name card/);
    refusedBy('no antagonist (the villain left for a later voicemail)', (o) => { o.shots[3].card.is = 'ally'; }, /who is in the hero's way gets a name card too/);
    refusedBy('a hero card for someone else', (o) => { o.shots[2].card.is = 'hero'; }, /the hero's card is the pack's hero, "dez", not "kwon"/);
    refusedBy('a name card not framed on its person', (o) => { o.shots[3].look = 'player'; }, /a name card is framed on its person: the shot looks at "vic"/);
    refusedBy('a carded person nobody stood on the street', (o) => { o.stage = o.stage.filter((s: any) => s.who !== 'vic'); }, /"vic" is not on the street for the opening/);
    refusedBy('one person carded twice', (o) => { o.shots[5 - 1].card = { who: 'kwon', is: 'ally' }; o.shots[4].look = { rel: 'kwon' }; }, /"kwon" already has a name card/);
    refusedBy('a voice-only person in it', (o, p) => { p.cast.push({ id: 'desk', anchor: 'none', color: '#999999', voiceOnly: true, voice: { id: 'desk-v1', kokoro: 'bf_emma', description: 'a night desk' } }); o.stage.push({ who: 'desk', at: '@ludlow' }); }, /"desk" is voiceOnly/);
    refusedBy('one spoken line (the premise is 2 to 4)', (o) => { for (const sh of o.shots.slice(2)) { delete sh.say; delete sh.line; } }, /1 spoken line; the premise is said in 2 to 4/);
    refusedBy('five spoken lines', (o) => { o.shots[0].say = 'dez'; o.shots[0].line = 'Snow on the Bowery.'; o.shots[4].say = 'dez'; o.shots[4].line = 'Last fare.'; }, /5 spoken lines/);
    refusedBy('no title', (o) => { delete o.shots[4].title; }, /the world's title is shown once/);
    refusedBy('too short (under 30 s)', (o) => { for (const sh of o.shots) sh.dur = 3; }, /an opening is 30 to 75 s/);
    refusedBy('too long (over 75 s)', (o) => { for (const sh of o.shots) sh.dur = 12; o.shots.push({ cam: 'player', look: 'player', dur: 12 }, { cam: 'player', look: 'player', dur: 12 }); }, /an opening is 30 to 75 s/);
    refusedBy('a place the city does not have', (o) => { o.stage[1].at = '@brooklyn-bridge'; }, /"@brooklyn-bridge" is not a place in New York/);
    refusedBy('Chicago on its place card', (o) => { o.shots[0].where.name = 'The Chicago Loop'; }, /names Chicago/);
    // a Mog keeps its parent's opening (or writes its own by the same rules)
    const parent = gatePack(nyStory()).pack;
    const mogOf = (edit: (p: any) => void) => { const p = clone(parent); p.id = 'night-rounds-mog'; p.parent = parent.id; p.title = 'Night Rounds Again'; edit(p); return gatePack(p, { parent }); };
    const kept = mogOf(() => {}), dropped = mogOf((p) => { delete p.opening; }), own = mogOf((p) => { p.opening.shots[1].line = 'Christmas Eve, and still one more fare before home.'; });
    ok('a Mog that keeps its parent\'s opening passes, one that drops it is refused, one that writes its own (by the rules) passes',
      kept.ok && !dropped.ok && dropped.problems.some((x) => /A Mog keeps it: copy the original's "opening" exactly/.test(x)) && own.ok, JSON.stringify([kept.problems, dropped.problems, own.problems]).slice(0, 400));
    ok('a world from before openings (no opening, no parent) still passes the gate (the store re-gates older worlds)', gatePack(R('storykit/packs/test-night-shift.json')).ok);
  }
} catch (e) {
  failed++; console.log('  FAIL  the check threw:', (e as Error).stack);
} finally {
  globalThis.fetch = realFetch;
  server.close();
  for (const [k, v] of [['ANTHROPIC_API_KEY', env.key], ['ANTHROPIC_AUTH_TOKEN', env.token], ['ANTHROPIC_BASE_URL', env.base], ['BUILD_DAILY_USD', env.usd], ['STORYKIT', env.sk]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  for (const id of games) db.prepare('DELETE FROM games WHERE id = ?').run(id);
  for (const id of drafts) db.prepare('DELETE FROM drafts WHERE id = ?').run(id);
  db.prepare('DELETE FROM drafts WHERE prompt LIKE ?').run(`%${tag}%`);
  db.prepare('DELETE FROM generations WHERE prompt LIKE ?').run(`%${tag}%`);
  store.db.close();
  rmSync(storeDir, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed (${api.builds} build passes and ${api.checks} name checks against the stand-in, no paid call)`);
process.exit(failed ? 1 : 0);
