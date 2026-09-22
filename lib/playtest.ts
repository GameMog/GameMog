import { WorldSpecSchema, type WorldSpec, LADDERS, loopLength } from './worldspec';

/**
 * Static playtest.
 *
 * The schema proves a world is well-typed. This proves it is *playable* — the
 * checks a human would otherwise find by loading the game and discovering the
 * lanes hang off the road, or the pack is invisible against the ground, or the
 * track is so short a lap ends before the tempo banner clears.
 *
 * It is deliberately cheap and deterministic so it can run on every generation
 * and gate publishing. It does not tell you whether a game is fun. Nothing
 * automatic does.
 */

export type Finding = {
  level: 'error' | 'warn';
  code: string;
  message: string;
};

export type PlaytestReport = {
  ok: boolean;
  findings: Finding[];
  stats: {
    lapMetres: number;
    estLapSeconds: number;
    estRaceSeconds: number;
    propBudget: number;
    laneSpread: number;
  };
};

import { contrast, distance } from './color';

/** Catmull-Rom is longer than its control polygon; ~4% is a good approximation. */
export function playtest(input: unknown): PlaytestReport {
  const findings: Finding[] = [];
  const err = (code: string, message: string) => findings.push({ level: 'error', code, message });
  const warn = (code: string, message: string) => findings.push({ level: 'warn', code, message });

  const parsed = WorldSpecSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      err('schema', `${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    return {
      ok: false,
      findings,
      stats: { lapMetres: 0, estLapSeconds: 0, estRaceSeconds: 0, propBudget: 0, laneSpread: 0 },
    };
  }

  const w: WorldSpec = parsed.data;
  const ladder = LADDERS[w.difficulty];

  /* ---- the field fits on the road ------------------------------------- */
  if (w.racers.length !== w.track.lanes.length) {
    err('lane_count', `${w.racers.length} racers but ${w.track.lanes.length} lanes — every racer needs its own lane.`);
  }
  const usedLanes = new Set<number>();
  for (const r of w.racers) {
    if (r.lane >= w.track.lanes.length) {
      err('lane_index', `${r.name} is assigned lane ${r.lane}, which does not exist.`);
    } else if (usedLanes.has(r.lane)) {
      err('lane_clash', `Lane ${r.lane} is assigned to more than one racer.`);
    }
    usedLanes.add(r.lane);
  }
  const edge = w.track.roadHalf - 1.2;
  for (const [i, lane] of w.track.lanes.entries()) {
    if (Math.abs(lane) > edge) {
      err('lane_offroad', `Lane ${i} sits at ${lane.toFixed(2)}m but the racing surface ends at ${edge.toFixed(2)}m.`);
    }
  }
  const sorted = [...w.track.lanes].sort((a, b) => a - b);
  let minGap = Infinity;
  for (let i = 1; i < sorted.length; i++) minGap = Math.min(minGap, sorted[i] - sorted[i - 1]);
  if (minGap < 1.3) warn('lane_tight', `Lanes are ${minGap.toFixed(2)}m apart; racers are ~1.5m wide and will overlap.`);

  /* ---- exactly one player ---------------------------------------------- */
  const players = w.racers.filter((r) => r.you);
  if (players.length !== 1) {
    err('player_count', `Exactly one racer must be the player; found ${players.length}.`);
  }

  /* ---- the race is the right length ------------------------------------ */
  const lapMetres = loopLength(w.track.points, w.track.scale);
  // Measured, not guessed: a competent (16ms) player averages this across the
  // rebuilt ladder in scripts/difficulty-sim.ts. It used to say 26, which was
  // the speed of a player exploiting the old wide windows.
  const paceGuess = 24.5;
  const estLapSeconds = lapMetres / paceGuess;
  const estRaceSeconds = estLapSeconds * ladder.length;
  if (lapMetres < 180) err('track_short', `A lap is only ${lapMetres.toFixed(0)}m — the tempo banner alone covers most of it.`);
  if (lapMetres > 1400) warn('track_long', `A lap is ${lapMetres.toFixed(0)}m (~${estLapSeconds.toFixed(0)}s). Races over two minutes lose people.`);

  /* ---- the track does not cross itself or fold back -------------------- */
  const pts = w.track.points;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const d = Math.hypot(a[0] - b[0], a[2] - b[2]) * w.track.scale;
    if (d < w.track.roadHalf * 2.2) {
      warn('track_kink', `Control points ${i} and ${(i + 1) % pts.length} are ${d.toFixed(1)}m apart — tighter than the road is wide, which pinches the corner.`);
      break;
    }
  }
  const climb = Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
  if (climb > 30) warn('track_steep', `${climb.toFixed(0)}m of elevation change will read as a wall at racing speed.`);

  /* ---- you can see the racers, and tell yourself apart from them -------- */
  for (const r of w.racers) {
    const d = distance(r.fur, w.palette.terrain.moss);
    if (d < 90 || contrast(r.fur, w.palette.terrain.moss) < 1.18) {
      // The player vanishing is not a matter of taste — it is the one thing the
      // creator brought, so it blocks. A rival vanishing is a warning.
      const msg = `${r.name} (${r.fur}) is nearly the same tone as the ground and will vanish mid-race.`;
      r.you ? err('player_camouflage', msg) : warn('racer_camouflage', msg);
    }
  }
  const me = w.racers.find((r) => r.you);
  if (me) {
    for (const r of w.racers) {
      if (r === me) continue;
      // 34 is calibrated below the closest pair in Muse Sprint (49), which is
      // verified readable in play. Above that is a style choice, not a defect.
      if (distance(r.fur, me.fur) < 34) {
        err('racer_confusable', `${r.name} (${r.fur}) is too close to your own colour (${me.fur}) to tell apart at speed.`);
      }
    }
  }
  if (contrast(w.palette.terrain.sand, w.palette.terrain.moss) < 1.15) {
    warn('track_camouflage', 'The path and the surrounding ground are the same tone; the racing line will be hard to read.');
  }

  /* ---- it will hold frame rate on a phone ------------------------------ */
  const propBudget =
    w.props.caps.count * 3 + w.props.tufts.count * 0.35 + w.props.spores.count * 0.02 + w.props.islets.count * 6;
  if (propBudget > 1800) {
    err('perf_budget', `Scene budget ${propBudget.toFixed(0)} is past what a mid-range phone holds at 60fps. Reduce cap or tuft counts.`);
  } else if (propBudget > 1300) {
    warn('perf_budget', `Scene budget ${propBudget.toFixed(0)} is heavy; expect frame drops on older phones.`);
  }
  const lanternCount = Math.floor(lapMetres / w.props.lanterns.spacing) * 2;
  if (lanternCount > 160) warn('lantern_count', `${lanternCount} lanterns is a lot of additive sprites; widen the spacing.`);

  /* ---- the atmosphere does not swallow the track ----------------------- */
  const visibility = 1 / w.palette.fogDensity;
  if (visibility < 170) {
    warn('fog_thick', `Fog closes in at ~${visibility.toFixed(0)}m; the corner ahead will be invisible.`);
  }

  return {
    ok: !findings.some((f) => f.level === 'error'),
    findings,
    stats: {
      lapMetres: +lapMetres.toFixed(1),
      estLapSeconds: +estLapSeconds.toFixed(1),
      estRaceSeconds: +estRaceSeconds.toFixed(1),
      propBudget: +propBudget.toFixed(0),
      laneSpread: +(Math.max(...w.track.lanes) - Math.min(...w.track.lanes)).toFixed(2),
    },
  };
}
