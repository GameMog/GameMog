import { NextResponse } from 'next/server';
import { generateWorld, offlineWorld, readCatalogue, MODEL } from '@/lib/generate';
import { generateGame, GAME_MODEL, type GameEvent } from '@/lib/generate-game';
import { playtest } from '@/lib/playtest';
import { logGeneration, recentSpecs, getGameBySlug, getGameBySlugForOwner, startBuild, setBuildUsage, endBuild } from '@/lib/db';
import { admit, takeSlot, resting, priceBuild, BUSY, RESTING, type Lease, type PassUsage } from '@/lib/build-limits';

import { ImageSchema, type Character, type CharacterImage } from '@/lib/character';
import { readOptions } from '@/lib/world-options';
import { isOpenWorld, worldMode, canMog, MOG_SOON } from '@/lib/custom-game';
import { isEpisodeParent, readConsent } from '@/lib/episode';
import { isStoryParent, storyParentPack, readCity, readStoryHero, STORY_CLOSED, type StoryHero } from '@/lib/storykit-build';
import { storykitForRequest } from '@/lib/storykit-http';
import { storykitMode } from '@/lib/storykit-switch';
import { storyStore, storeGuard } from '@/lib/storykit-store';

export const runtime = 'nodejs';
// Opus writing a whole game, a real-browser playtest and up to two repairs
export const maxDuration = 1800;

/** Big enough for a 768px JPEG, small enough that nobody posts a video. */
const MAX_IMAGE_BYTES = 2_200_000;

export async function POST(req: Request) {
  let body: { prompt?: string; image?: unknown; hintFur?: string; characterName?: string; kind?: 'game' | 'race'; mogOf?: string; options?: unknown; consent?: unknown; storykit?: unknown; story?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const text = (body.prompt ?? '').trim();
  // a Mog: the game it challenges, and one line on how to beat it
  // (STORYKIT=owner: the owner's story worlds are published hidden, so the owner's session also finds a hidden story world
  // to Mog; nobody else's lookup changes: lib/storykit-switch.ts)
  const ownerStory = (g: ReturnType<typeof getGameBySlug>) => (g && isStoryParent(g) ? g : undefined);
  const parent = typeof body.mogOf === 'string'
    ? getGameBySlug(body.mogOf) ?? (storykitMode() === 'owner' && storykitForRequest(req) ? ownerStory(getGameBySlugForOwner(body.mogOf)) : undefined)
    : undefined;
  if (body.mogOf && !parent) return NextResponse.json({ error: 'The game you are mogging no longer exists.' }, { status: 404 });
  // a Story Kit world (STORYKIT=on, lib/storykit-site.ts): its create ({ storykit: { city } }) or a Mog of one. Closed while
  // the switch is off, refused here before a slot is taken or anything is spent; on, the story writer builds it
  // (lib/storykit-build.ts: a create in its city, a Mog in its parent's, locked). No other kind of build ever starts
  // from a story request
  const storyMog = isStoryParent(parent);
  let storyCity: ReturnType<typeof readCity> = null;
  let storyHero: StoryHero | null = null;
  const storyAsk = (body.storykit ?? body.story) as { city?: unknown; hero?: unknown } | null | undefined;
  if ((storyAsk != null && !parent) || storyMog) {
    if (!storykitForRequest(req)) return NextResponse.json({ error: storyMog ? MOG_SOON : STORY_CLOSED }, { status: storyMog ? 409 : 404 });
    // (the store's size guard, lib/storykit-store.ts storeGuard: refused here too, before a slot is taken or anything is spent)
    const full = storeGuard(storyStore());
    if (full) return NextResponse.json({ error: full }, { status: 507 });
    if (storyMog) { if (!storyParentPack(parent!)) return NextResponse.json({ error: 'The story world you are mogging could not be read.' }, { status: 409 }); }
    else {
      storyCity = readCity(storyAsk?.city);
      if (!storyCity) return NextResponse.json({ error: 'Pick a city for the story world: New York (story worlds play on Mog City\'s engine, which plays New York so far).', field: 'city' }, { status: 400 });
      // the hero (5 Nov, optional): the creator's words for how they look (up to 400 characters), or Mog City's Dan
      // ({ model: 'dan' }); read strictly here, before a slot is taken or anything is spent (lib/storykit-build.ts readStoryHero)
      const hero = readStoryHero(storyAsk?.hero);
      if (!hero.ok) return NextResponse.json({ error: hero.error, field: 'hero' }, { status: 400 });
      storyHero = hero.hero;
    }
  }
  // (a kind of game that cannot be mogged yet, lib/custom-game.ts canMog, is refused here, before a slot is taken or
  // anything is spent; every kind can be today, a penalty shootout too since 13 Oct)
  if (parent && !canMog(parent)) return NextResponse.json({ error: MOG_SOON }, { status: 409 });
  if (parent && (text.length < 4 || text.length > 600)) {
    return NextResponse.json({ error: 'Say in a line how your Mog should beat the original (up to 600 characters).' }, { status: 400 });
  }
  // a Create (a world or a story world): at most 2000 characters, as the counter under /create's box shows
  if (!parent && text.length > 2000) {
    return NextResponse.json({ error: 'Keep it to 2,000 characters.', field: 'prompt' }, { status: 400 });
  }
  if (!parent && text.length < 8) {
    return NextResponse.json({ error: 'Describe the world in a sentence or two.' }, { status: 400 });
  }
  // a Mog of a Mog City episode (3 Nov): the creator's consent for any real person it names, read before anything is
  // spent (lib/episode.ts readConsent); every other Mog ignores the field
  // (and a story world's create or Mog, 4 Nov: the same consent step, lib/storykit-build.ts)
  const episode = isEpisodeParent(parent);
  const consent = episode || storyMog || storyCity ? readConsent(body.consent) : { ok: true as const, consent: null };
  if (!consent.ok) return NextResponse.json({ error: consent.error, field: 'consent' }, { status: 400 });
  if ((parent || storyCity) && !(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)) {
    return NextResponse.json({ error: 'Mogging needs the model: set ANTHROPIC_API_KEY.' }, { status: 503 });
  }

  let image: CharacterImage | undefined;
  if (body.image) {
    const parsed = ImageSchema.safeParse(body.image);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'That image could not be read. PNG, JPEG, WebP or GIF, under 2MB once resized.' },
        { status: 400 }
      );
    }
    if (parsed.data.data.length > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'That image is too large even after resizing.' }, { status: 413 });
    }
    image = parsed.data;
  }

  const hintFur =
    typeof body.hintFur === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.hintFur)
      ? body.hintFur.toUpperCase()
      : undefined;

  const hasKey = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

  // The default: Opus writes the whole game. Progress streams back as NDJSON,
  // one event per line, because a game takes minutes and the creator should
  // see it being written, checked and played rather than a spinner.
  //
  // The owner's safety limits (9 and 10 Oct, lib/build-limits.ts): no build starts once the day's spend is at its
  // ceiling; a build takes one of the site's slots for as long as its stream runs, test drive included, or waits in
  // line for one, told its place as it moves, or (the line full) is told at once that GameMog is busy; nothing is spent
  // before its slot; it stops when the creator leaves, in line or building; and it is logged from its start, with what
  // each pass really cost.
  if (body.kind !== 'race' && hasKey) {
    let moved = () => {};
    const door = admit(() => moved());
    if (door.kind === 'resting') return NextResponse.json({ error: RESTING, resting: true }, { status: 503 });
    if (door.kind === 'busy') return NextResponse.json({ error: BUSY, busy: true }, { status: 503, headers: { 'retry-after': '60' } });
    const origin = new URL(req.url).origin;
    const enc = new TextEncoder();
    // the creator has left: Next aborts the request's signal when its connection closes, and the stream is cancelled;
    // either takes them out of the line, or stops the build (lib/generate-game.ts BuildHooks). A tab in the background
    // is still connected: it waits, and builds, on
    const stop = new AbortController();
    const leave = () => stop.abort();
    if (door.kind === 'queued') stop.signal.addEventListener('abort', door.ticket.leave, { once: true });
    if (req.signal.aborted) leave(); else req.signal.addEventListener('abort', leave, { once: true });
    const model = GAME_MODEL + (image ? '+vision' : '') + (parent ? '+mog' : '') + (storyMog || storyCity ? '+storykit' : '');
    type Line = { type: 'tick' } | { type: 'queued'; position: number; etaMin: number } | { type: 'admitted' } | { type: 'error'; error: string; resting: true };
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const send = (e: GameEvent | Line) => {
          // (a stream that takes no more was cancelled: nobody is reading it)
          if (!closed) try { controller.enqueue(enc.encode(JSON.stringify(e) + '\n')); } catch { closed = true; leave(); }
        };
        const end = () => { closed = true; req.signal.removeEventListener('abort', leave); try { controller.close(); } catch { /* cancelled: nobody is reading */ } };
        // in line: where, and the wait, now, on every move and every few seconds (which keeps the connection alive),
        // until a slot is free; a creator who left, or a line let go at the day's ceiling, ends here, nothing spent
        let slot: Lease;
        if (door.kind === 'queued') {
          const t = door.ticket;
          moved = () => { const position = t.position(); if (position) send({ type: 'queued', position, etaMin: t.etaMin() }); };
          moved();
          const turn = await t.turn;
          moved = () => {};
          stop.signal.removeEventListener('abort', t.leave);
          if ('refused' in turn) {
            if (turn.refused === 'resting') send({ type: 'error', error: RESTING, resting: true });
            return end();
          }
          slot = turn.lease;
          if (stop.signal.aborted) { slot.release(); return end(); }
          send({ type: 'admitted' });
        } else slot = door.lease;
        const started = Date.now();
        // the model can think for minutes before its first word; keep the
        // connection visibly alive
        const beat = setInterval(() => send({ type: 'tick' }), 10_000);
        let result: GameEvent | undefined, thrown: string | undefined, draftId: string | null = null, attempts = 0, row: number | null = null;
        const passes: PassUsage[] = [];
        // the build's row, from its start (lib/db.ts startBuild): a log that cannot be written never stops a build
        try {
          row = slot.slot.row = startBuild({ prompt: parent ? `[mog of ${parent.slug}] ${text}` : text, model, kind: parent ? 'mog' : 'create',
            parentSlug: parent?.slug ?? null, parentChars: parent?.code?.length ?? null, promptChars: text.length, photo: !!image }, started);
        } catch (e) { console.error('builds: the start of a build could not be logged', e); }
        // what each pass used, priced and kept as it ends, so a build the server stops under still shows its spend
        const usage = (p: PassUsage) => {
          passes.push(p);
          if (row !== null) try { const c = priceBuild(passes); setBuildUsage(row, c.usage, c.usd, p.attempt); } catch (e) { console.error('builds: a pass\'s usage could not be logged', e); }
        };
        try {
          // a Mog keeps its original's kind, whatever the request says: an open world stays open and a lap race a lap
          // race (the owner, 1 Oct). Within an open world, on foot or a derby (the owner, 6 Oct: "a tighter game-type
          // lock"), the builder is told the original's kind and keeps it unless the idea names the other
          // (lib/mog-dna.ts askedKind), and a pass that changed it unasked goes back once (lib/generate-game.ts)
          const options = readOptions(body.options);
          if (parent) options.open = parent.format === 'world' && !!parent.code && isOpenWorld(parent.code);
          // a Mog of a penalty shootout (13 Oct) has no obstacles to add or clear and no music, whatever the page sent: the
          // crowd is its sound (the shootout's recorded crowd), and no track or score is laid over it
          // (and a Grand Prix's, 21 Oct: its engines and its crowd are its sound)
          // (and a Mog City episode's, 3 Nov: the city's own sound and none of a world's options)
          if (parent && parent.format === 'world' && (worldMode(parent.code, parent.meta) === 'shootout' || worldMode(parent.code, parent.meta) === 'gp' || episode)) {
            options.hazards = 'same'; options.music = null; delete options.soundtrack;
          }
          await generateGame({ prompt: text, image, origin, mog: parent ? { parent, instruction: text } : undefined, options, consent: consent.consent, ...(storyCity ? { storykit: { city: storyCity, hero: storyHero } } : {}), signal: stop.signal, usage }, (e) => {
            if (e.type === 'stage') attempts = Math.max(attempts, e.attempt);
            if (e.type === 'drive' || e.type === 'done') draftId = e.draftId;
            if (e.type === 'done' || e.type === 'error') result = e;
            send(e);
          });
        } catch (e) {
          thrown = (e as Error).message;
          if (!stop.signal.aborted) send({ type: 'error', error: thrown });
        } finally {
          clearInterval(beat);
          // the slot is the next build's (the line's first) however this one ended
          slot.release();
          req.signal.removeEventListener('abort', leave);
          // how it ended came first: a world or an error, even to a creator who left as it came; else abandoned if they left
          if (row !== null) try {
            const c = passes.length ? priceBuild(passes) : null;
            endBuild(row, {
              status: result ? (result.type === 'done' ? 'done' : 'error') : stop.signal.aborted ? 'abandoned' : 'error',
              attempts: result?.type === 'done' ? result.attempts : attempts,
              findings: result?.type === 'error' ? result.problems ?? [result.error] : thrown && !stop.signal.aborted ? [thrown] : [],
              ms: Date.now() - started, draftId, usage: c?.usage, usd: c?.usd,
            });
          } catch (e) { console.error('builds: the end of a build could not be logged', e); }
          closed = true;
          try { controller.close(); } catch { /* cancelled: nobody is reading */ }
        }
      },
      cancel() { leave(); },
    });
    return new Response(stream, {
      headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
    });
  }

  // Without a key the whole product still works end to end on a deterministic
  // world, and an upload still sets the character, because the colour is read
  // in the browser rather than by a model.
  if (!hasKey) {
    const locked: Character | undefined = hintFur
      ? {
          name: (body.characterName || 'You').slice(0, 12),
          fur: hintFur,
          source: image ? 'upload' : 'manual',
        }
      : undefined;
    const { spec, character, adjustments } = offlineWorld(text, locked);
    const report = playtest(spec);
    logGeneration({ gameId: null, prompt: text, model: 'offline', attempts: 0, ok: report.ok, findings: report.findings, ms: 0 });
    return NextResponse.json({ spec, report, character, adjustments, offline: true });
  }

  // The race brief: no page sends it since every world became a written one (app/create/page.tsx), but a request
  // still can, and its calls are the owner's key's too, so it is held to the day's ceiling, and takes one of the same
  // slots or is told GameMog is busy (it does not wait in line; lib/build-limits.ts), and gives it back however it ends
  if (resting()) return NextResponse.json({ error: RESTING, resting: true }, { status: 503 });
  const slot = takeSlot();
  if (!slot) return NextResponse.json({ error: BUSY, busy: true }, { status: 503, headers: { 'retry-after': '60' } });
  let out: Awaited<ReturnType<typeof generateWorld>>;
  try {
    // Balance against what is already on the shelf, not against nothing.
    const catalogue = readCatalogue(recentSpecs(24));
    out = await generateWorld({ prompt: text, image, hintFur, catalogue });
  } finally { slot.release(); }
  logGeneration({
    gameId: null,
    prompt: text,
    model: image ? `${MODEL}+vision` : MODEL,
    attempts: out.attempts,
    ok: out.ok,
    findings: out.report?.findings ?? [],
    ms: out.ms,
  });

  if (!out.ok || !out.spec) {
    return NextResponse.json({ error: out.error ?? 'Generation failed', report: out.report }, { status: 502 });
  }
  return NextResponse.json({
    spec: out.spec,
    report: out.report,
    character: out.character,
    adjustments: out.adjustments,
    attempts: out.attempts,
    ms: out.ms,
  });
}
