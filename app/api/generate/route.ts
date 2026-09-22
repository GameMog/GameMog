import { NextResponse } from 'next/server';
import { generateWorld, offlineWorld } from '@/lib/generate';
import { playtest } from '@/lib/playtest';
import { logGeneration } from '@/lib/db';
import { ImageSchema, type Character } from '@/lib/character';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** Big enough for a 768px JPEG, small enough that nobody posts a video. */
const MAX_IMAGE_BYTES = 2_200_000;

export async function POST(req: Request) {
  let body: { prompt?: string; image?: unknown; hintFur?: string; characterName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  }

  const text = (body.prompt ?? '').trim();
  if (text.length < 8) {
    return NextResponse.json({ error: 'Describe the world in a sentence or two.' }, { status: 400 });
  }

  let image;
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

  // Without a key the whole product still works end to end on a deterministic
  // world — and an upload still sets the character, because the colour is read
  // in the browser rather than by a model.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
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

  const out = await generateWorld({ prompt: text, image, hintFur });
  logGeneration({
    gameId: null,
    prompt: text,
    model: image ? 'claude-opus-5+vision' : 'claude-opus-5',
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
