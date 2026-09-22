import { NextResponse } from 'next/server';
import { generateWorld, offlineWorld } from '@/lib/generate';
import { playtest } from '@/lib/playtest';
import { logGeneration } from '@/lib/db';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: Request) {
  const { prompt } = (await req.json()) as { prompt?: string };
  const text = (prompt ?? '').trim();
  if (text.length < 8) {
    return NextResponse.json({ error: 'Describe the world in a sentence or two.' }, { status: 400 });
  }

  // Without a key the whole product still works end to end on a deterministic
  // world, so the platform can be demoed and tested with no spend.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    const spec = offlineWorld(text);
    const report = playtest(spec);
    logGeneration({ gameId: null, prompt: text, model: 'offline', attempts: 0, ok: report.ok, findings: report.findings, ms: 0 });
    return NextResponse.json({ spec, report, offline: true });
  }

  const out = await generateWorld(text);
  logGeneration({
    gameId: null, prompt: text, model: 'claude-opus-5',
    attempts: out.attempts, ok: out.ok, findings: out.report?.findings ?? [], ms: out.ms,
  });

  if (!out.ok || !out.spec) {
    return NextResponse.json({ error: out.error ?? 'Generation failed', report: out.report }, { status: 502 });
  }
  return NextResponse.json({ spec: out.spec, report: out.report, attempts: out.attempts, ms: out.ms });
}
