import { NextResponse } from 'next/server';
import { getGameBySlug, insertScore, db } from '@/lib/db';
import { playtest } from '@/lib/playtest';
import type { WorldSpec } from '@/lib/worldspec';

export const runtime = 'nodejs';

/**
 * A score arrives from a sandboxed frame, so it is a claim from an untrusted
 * surface. We cannot verify it properly without replay validation, so we do the
 * cheap sanity checks that catch accidents and casual tampering, and keep the
 * shape that real verification will slot into later.
 */
export async function POST(req: Request) {
  const b = (await req.json()) as Record<string, unknown>;
  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(String(b.gameId ?? '')) as
    | { id: string; slug: string; spec: string }
    | undefined;
  if (!row) return NextResponse.json({ error: 'Unknown game' }, { status: 404 });
  void getGameBySlug;

  const spec = JSON.parse(row.spec) as WorldSpec;
  const { stats } = playtest(spec);

  const timeMs = Number(b.timeMs);
  const place = Number(b.place);
  if (!Number.isFinite(timeMs) || !Number.isFinite(place)) {
    return NextResponse.json({ error: 'Malformed result' }, { status: 400 });
  }
  // Nobody finishes in less than half the physically fastest possible race.
  const floorMs = stats.estRaceSeconds * 1000 * 0.5;
  if (timeMs < floorMs || timeMs > 15 * 60 * 1000) {
    return NextResponse.json({ error: 'Result outside plausible range' }, { status: 422 });
  }
  if (place < 1 || place > spec.racers.length) {
    return NextResponse.json({ error: 'Impossible finishing place' }, { status: 422 });
  }

  insertScore({
    gameId: row.id,
    player: String(b.player ?? 'anon').slice(0, 16).replace(/[^\w \-.]/g, '') || 'anon',
    timeMs: Math.round(timeMs),
    place: Math.round(place),
    tempoReached: Math.max(0, Math.min(3, Math.round(Number(b.tempoReached) || 0))),
    locks: Math.max(0, Math.min(999, Math.round(Number(b.locks) || 0))),
    bestStreak: Math.max(0, Math.min(9999, Math.round(Number(b.bestStreak) || 0))),
  });
  return NextResponse.json({ ok: true });
}
