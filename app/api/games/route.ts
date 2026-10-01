import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { insertGame, slugify, listGames, getDraft, publishDraft } from '@/lib/db';
import { playtest } from '@/lib/playtest';
import { codeHash, testStatus } from '@/lib/test-drive';
import type { WorldSpec } from '@/lib/worldspec';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ games: listGames().map(({ spec, ...g }) => ({ ...g, spec: JSON.parse(spec) })) });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { spec?: unknown; prompt?: string; draftId?: string };

  // A written game publishes from its draft: exactly the code that passed the
  // runtime playtest, never code resent by the client.
  if (body.draftId) {
    const d = getDraft(body.draftId);
    if (!d) return NextResponse.json({ error: 'That draft no longer exists.' }, { status: 404 });
    const report = JSON.parse(d.report) as { ok?: boolean; ran?: boolean; status?: string; codeHash?: string; coverHash?: string };
    if (!report.ok) return NextResponse.json({ error: 'This game did not pass playtesting.' }, { status: 400 });
    // a drive that never ran, or ran on other code, publishes as unverified: honest, not held back
    const hash = codeHash(d.code), status = !report.codeHash ? testStatus(report) : report.codeHash === hash ? report.status ?? testStatus(report) : 'unverified';
    const test = d.format === 'world' ? { status, codeHash: hash, cover: !report.coverHash ? 'none' : report.coverHash === hash ? 'current' : 'earlier' } : undefined;
    const id = randomUUID();
    const slug = slugify(JSON.parse(d.meta).title);
    publishDraft(d.id, slug, id, test);
    return NextResponse.json({ id, slug });
  }

  // Publishing revalidates. A client can send anything; nothing reaches the
  // database until it passes the same gate a generation did.
  const report = playtest(body.spec);
  if (!report.ok) {
    return NextResponse.json({ error: 'This world did not pass playtesting.', report }, { status: 400 });
  }

  const spec = body.spec as WorldSpec;
  const id = randomUUID();
  const slug = slugify(spec.meta.title);
  insertGame({ id, slug, spec, prompt: body.prompt ?? null });
  return NextResponse.json({ id, slug, report });
}
