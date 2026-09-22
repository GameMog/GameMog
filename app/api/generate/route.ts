import { NextResponse } from 'next/server';
import { generateWorld, offlineWorld, readCatalogue, MODEL } from '@/lib/generate';
import { generateGame, GAME_MODEL, type GameEvent } from '@/lib/generate-game';
import { playtest } from '@/lib/playtest';
import { logGeneration, recentSpecs } from '@/lib/db';

import { ImageSchema, type Character, type CharacterImage } from '@/lib/character';

export const runtime = 'nodejs';
// Opus writing a whole game, a real-browser playtest and up to two repairs
export const maxDuration = 1800;

/** Big enough for a 768px JPEG, small enough that nobody posts a video. */
const MAX_IMAGE_BYTES = 2_200_000;

export async function POST(req: Request) {
  let body: { prompt?: string; image?: unknown; hintFur?: string; characterName?: string; kind?: 'game' | 'race' };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const text = (body.prompt ?? '').trim();
  if (text.length < 8) {
    return NextResponse.json({ error: 'Describe the world in a sentence or two.' }, { status: 400 });
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
  if (body.kind !== 'race' && hasKey) {
    const origin = new URL(req.url).origin;
    const started = Date.now();
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const send = (e: GameEvent | { type: 'tick' }) => {
          if (!closed) try { controller.enqueue(enc.encode(JSON.stringify(e) + '\n')); } catch { closed = true; }
        };
        // the model can think for minutes before its first word; keep the
        // connection visibly alive
        const beat = setInterval(() => send({ type: 'tick' }), 10_000);
        let result: GameEvent | undefined;
        try {
          await generateGame({ prompt: text, image, origin }, (e) => {
            if (e.type === 'done' || e.type === 'error') result = e;
            send(e);
          });
        } catch (e) {
          send({ type: 'error', error: (e as Error).message });
        } finally {
          clearInterval(beat);
          logGeneration({
            gameId: null, prompt: text, model: GAME_MODEL + (image ? '+vision' : ''),
            attempts: result?.type === 'done' ? result.attempts : 0, ok: result?.type === 'done',
            findings: result?.type === 'error' ? result.problems ?? [result.error] : [],
            ms: Date.now() - started,
          });
          closed = true;
          controller.close();
        }
      },
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

  // Balance against what is already on the shelf, not against nothing.
  const catalogue = readCatalogue(recentSpecs(24));
  const out = await generateWorld({ prompt: text, image, hintFur, catalogue });
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
