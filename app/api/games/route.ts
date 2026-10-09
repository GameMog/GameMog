import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { insertGame, slugify, listGames, getDraft, publishDraft, db } from '@/lib/db';
import { playtest } from '@/lib/playtest';
import { codeHash, testStatus } from '@/lib/test-drive';
import { isKartWorld } from '@/lib/custom-game';
import { publishedKartConstants, type KartDriveTrack } from '@/lib/kart-score';
import { dna } from '@/lib/mog-dna';
import { publishedSoundtrack, type Soundtrack, type WorldOptions } from '@/lib/world-options';
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
    const report = JSON.parse(d.report) as { ok?: boolean; ran?: boolean; status?: string; codeHash?: string; coverHash?: string; kart?: KartDriveTrack; soundtrack?: unknown };
    if (!report.ok) return NextResponse.json({ error: 'This game did not pass playtesting.' }, { status: 400 });
    // a drive that never ran, or ran on other code, publishes as unverified: honest, not held back
    const hash = codeHash(d.code), status = !report.codeHash ? testStatus(report) : report.codeHash === hash ? report.status ?? testStatus(report) : 'unverified';
    const test = d.format === 'world' ? { status, codeHash: hash, cover: !report.coverHash ? 'none' : report.coverHash === hash ? 'current' : 'earlier' } : undefined;
    // a kart race's score constants (8 Oct, lib/kart-score.ts publishedKartConstants): its parent's measured ones when
    // its drive raced the parent's track, else the course's from the lap its drive measured, else none stored (the
    // route's fallback; and never any the draft's meta brought). Only a drive of exactly this code says what this code's
    // track is; one that ran out of time before the finish (unverified) still read the track as it loaded
    let add: { kartScore?: ReturnType<typeof publishedKartConstants>; options?: WorldOptions; soundtrack?: Soundtrack } | undefined;
    if (d.format === 'world' && isKartWorld(d.code)) {
      const parent = d.parent_id ? db.prepare('SELECT id, code, meta FROM games WHERE id = ?').get(d.parent_id) as { id: string; code: string | null; meta: string | null } | undefined : undefined;
      add = { kartScore: publishedKartConstants({
        code: d.code, kart: dna(d.code).kart, drive: report.codeHash === hash ? report.kart : null,
        parent: parent ? { id: parent.id, meta: parent.meta, kart: parent.code ? dna(parent.code).kart : null } : null,
      }) ?? undefined };
    }
    // a Mog that kept its original's soundtrack (9 Oct, lib/world-options.ts publishedSoundtrack): the original's as the
    // database has it, in its options and, when this code plays it, as its own (meta.soundtrack: a Mog of it offers it
    // too); every other draft publishes its music as it was built, with none of its own
    const dm = JSON.parse(d.meta) as { title: string; options?: unknown };
    if (d.format === 'world' && dm.options !== undefined) {
      const parentMeta = d.parent_id ? (db.prepare('SELECT meta FROM games WHERE id = ?').get(d.parent_id) as { meta: string | null } | undefined)?.meta : null;
      const s = publishedSoundtrack({ options: dm.options, parentMeta, kart: isKartWorld(d.code), drive: report.codeHash === hash && 'soundtrack' in report ? { soundtrack: report.soundtrack } : null });
      add = { ...add, ...(s.options ? { options: s.options } : {}), soundtrack: s.soundtrack ?? undefined };
    }
    const id = randomUUID();
    const slug = slugify(dm.title);
    publishDraft(d.id, slug, id, test, add);
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
