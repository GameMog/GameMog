import { NextResponse } from 'next/server';
import { getGameBySlug, insertScore, db } from '@/lib/db';
import { playtest } from '@/lib/playtest';
import type { WorldSpec } from '@/lib/worldspec';
import { worldMode } from '@/lib/custom-game';

export const runtime = 'nodejs';

/**
 * A score arrives from a sandboxed frame, so it is a claim from an untrusted
 * surface. We cannot verify it properly without replay validation, so we do the
 * cheap sanity checks that catch accidents and casual tampering, and keep the
 * shape that real verification will slot into later.
 */
export async function POST(req: Request) {
  const b = (await req.json()) as Record<string, unknown>;
  const row = db.prepare('SELECT id, slug, spec, format, meta, code FROM games WHERE id = ?').get(String(b.gameId ?? '')) as
    | { id: string; slug: string; spec: string; format: string; meta: string | null; code: string | null }
    | undefined;
  if (!row) return NextResponse.json({ error: 'Unknown game' }, { status: 404 });
  void getGameBySlug;

  // A world on the runtime reports the level reached and the GM collected.
  // The runtime marks a run that used its test autopilot or time controls, and
  // those never reach a leaderboard.
  if (row.format === 'world') {
    const level = Number(b.level) || 0, gm = Number(b.gm) || 0, timeMs = Number(b.timeMs) || 0;
    if (b.assisted) return NextResponse.json({ error: 'Assisted runs are not ranked.' }, { status: 422 });
    // an open world ranks the time survived: the heat reached rises with time
    // (at most a level every few seconds, even knocking people out) and GM comes
    // a few coins a knockout
    const survival = worldMode(row.code, row.meta) !== 'race';
    if (survival) {
      const secs = timeMs / 1000;
      // (a world with a goal pays big: Zombie Beach's 10,000 GM vaccine; no run makes more than 60 GM a second)
      if (!Number.isInteger(level) || level < 1 || level > 2 + secs / 4 || gm < 0 || gm > 60 + secs * 60 || timeMs < 1000 || timeMs > 6 * 60 * 60 * 1000) {
        return NextResponse.json({ error: 'Result outside plausible range' }, { status: 422 });
      }
      insertScore({
        gameId: row.id,
        player: String(b.player ?? 'anon').slice(0, 16).replace(/[^\w \-.]/g, '') || 'anon',
        timeMs: Math.round(timeMs), place: 0, score: Math.round(timeMs), level, gm,
        tempoReached: 0, locks: 0, bestStreak: 0,
      });
      return NextResponse.json({ ok: true });
    }
    // a lap takes at least 320m at the top speed of 28 m/s
    // the fastest a level can be reached: every lap at the shortest lap
    // length, holding up, at that lap's pace (the runtime's rules)
    let floorMs = 0;
    for (let l = 1; l < Math.min(level, 1000); l++) floorMs += (320 / (28 * Math.min(1.6, 1 + 0.05 * (l - 1)))) * 1000 * 0.9;
    if (!Number.isInteger(level) || level < 1 || level > 999 || gm < 0 || gm > level * 90 ||
        timeMs < floorMs || timeMs > 6 * 60 * 60 * 1000) {
      return NextResponse.json({ error: 'Result outside plausible range' }, { status: 422 });
    }
    insertScore({
      gameId: row.id,
      player: String(b.player ?? 'anon').slice(0, 16).replace(/[^\w \-.]/g, '') || 'anon',
      timeMs: Math.round(timeMs), place: 0, score: level * 1000 + gm, level, gm,
      tempoReached: 0, locks: 0, bestStreak: 0,
    });
    return NextResponse.json({ ok: true });
  }

  // A written game reports its own score, time and place. There is no model of
  // its physics to check them against, so the bounds are only sanity bounds.
  if (row.format === 'custom') {
    const timeMs = Number(b.timeMs) || 0, score = Number(b.score) || 0, place = Number(b.place) || 0;
    const meta = JSON.parse(row.meta ?? '{}') as { cast?: unknown[] };
    if (![timeMs, score, place].every(Number.isFinite) || timeMs < 0 || timeMs > 60 * 60 * 1000 ||
        Math.abs(score) > 1e9 || place < 0 || place > (meta.cast?.length ?? 8) + 1) {
      return NextResponse.json({ error: 'Result outside plausible range' }, { status: 422 });
    }
    insertScore({
      gameId: row.id,
      player: String(b.player ?? 'anon').slice(0, 16).replace(/[^\w \-.]/g, '') || 'anon',
      timeMs: Math.round(timeMs), place: Math.round(place), score: Math.round(score),
      tempoReached: 0, locks: 0, bestStreak: 0,
    });
    return NextResponse.json({ ok: true });
  }

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
