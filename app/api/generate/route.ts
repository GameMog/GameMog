import { NextResponse } from 'next/server';
import { generateWorld, offlineWorld, readCatalogue, MODEL } from '@/lib/generate';
import { generateGame, GAME_MODEL, type GameEvent } from '@/lib/generate-game';
import { playtest } from '@/lib/playtest';
import { logGeneration, recentSpecs, getGameBySlug, startBuild, setBuildUsage, endBuild } from '@/lib/db';
import { takeSlot, priceBuild, BUSY, type PassUsage } from '@/lib/build-limits';

import { ImageSchema, type Character, type CharacterImage } from '@/lib/character';
import { readOptions } from '@/lib/world-options';
import { isOpenWorld } from '@/lib/custom-game';

export const runtime = 'nodejs';
// Opus writing a whole game, a real-browser playtest and up to two repairs
export const maxDuration = 1800;

/** Big enough for a 768px JPEG, small enough that nobody posts a video. */
const MAX_IMAGE_BYTES = 2_200_000;

export async function POST(req: Request) {
  let body: { prompt?: string; image?: unknown; hintFur?: string; characterName?: string; kind?: 'game' | 'race'; mogOf?: string; options?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const text = (body.prompt ?? '').trim();
  // a Mog: the game it challenges, and one line on how to beat it
  const parent = typeof body.mogOf === 'string' ? getGameBySlug(body.mogOf) : undefined;
  if (body.mogOf && !parent) return NextResponse.json({ error: 'The game you are mogging no longer exists.' }, { status: 404 });
  if (parent && (text.length < 4 || text.length > 600)) {
    return NextResponse.json({ error: 'Say in a line how your Mog should beat the original.' }, { status: 400 });
  }
  if (!parent && text.length < 8) {
    return NextResponse.json({ error: 'Describe the world in a sentence or two.' }, { status: 400 });
  }
  if (parent && !(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)) {
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
  // The owner's safety limits (9 Oct, lib/build-limits.ts): a build takes one of the site's slots for as long as its
  // stream runs, test drive included, or is told at once that GameMog is busy, before any model is called, so nothing
  // is spent; it stops when the creator leaves; and it is logged from its start, with what each pass really cost.
  if (body.kind !== 'race' && hasKey) {
    const slot = takeSlot();
    if (!slot) return NextResponse.json({ error: BUSY, busy: true }, { status: 503, headers: { 'retry-after': '60' } });
    const origin = new URL(req.url).origin;
    const started = Date.now();
    const enc = new TextEncoder();
    // the creator has left: Next aborts the request's signal when its connection closes, and the stream is cancelled;
    // either stops the build (lib/generate-game.ts BuildHooks). A tab in the background is still connected: it builds on
    const stop = new AbortController();
    const leave = () => stop.abort();
    if (req.signal.aborted) leave(); else req.signal.addEventListener('abort', leave, { once: true });
    const model = GAME_MODEL + (image ? '+vision' : '') + (parent ? '+mog' : '');
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const send = (e: GameEvent | { type: 'tick' }) => {
          // (a stream that takes no more was cancelled: nobody is reading it)
          if (!closed) try { controller.enqueue(enc.encode(JSON.stringify(e) + '\n')); } catch { closed = true; leave(); }
        };
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
          await generateGame({ prompt: text, image, origin, mog: parent ? { parent, instruction: text } : undefined, options, signal: stop.signal, usage }, (e) => {
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
          // the slot is the next build's however this one ended
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
  // still can, and its calls are the owner's key's too, so it takes one of the same slots or is told GameMog is busy
  // (lib/build-limits.ts 2), and gives it back however it ends
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
