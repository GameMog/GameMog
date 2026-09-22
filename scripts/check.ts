/**
 * Regression guard. `npm run check`
 *
 * The featured game is the canary: if the engine or the rules ever stop
 * accepting Muse Sprint, a world we have actually played, then a threshold has
 * been tuned by vibes and the abstraction has drifted. This catches that
 * before a creator does.
 *
 * The design contract runs here too, for the same reason: a rule that only
 * lives in a brief is a rule that lasts until the next hurried component.
 */
import { MUSE_SPRINT } from '../lib/presets/muse-sprint.ts';
import { playtest } from '../lib/playtest.ts';
import { compileWorld } from '../lib/worldspec.ts';
import { protectCharacter } from '../lib/character.ts';
import { buildTrack, buildLanes } from '../lib/track.ts';
import { distance } from '../lib/color.ts';
import { BOUNDS } from '../lib/rig.ts';
import { runDesignChecks } from './design-check.ts';
import { runDifficultyChecks } from './difficulty-check.ts';

let failures = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  if (!cond) failures++;
};

console.log('\nfeatured game');
const base = playtest(MUSE_SPRINT);
ok('Muse Sprint passes its own playtest', base.ok,
  base.findings.filter((f) => f.level === 'error').map((f) => f.code).join(', ') || `${base.findings.length} warnings`);
ok('lap is the 538m we shipped', Math.abs(base.stats.lapMetres - 538) < 12, `${base.stats.lapMetres}m`);
ok('compiles to a 3-level ladder', compileWorld(MUSE_SPRINT, 'x').tempi.length === 3);
ok('player fur compiles to an integer (the HUD renders it as hex)',
  typeof compileWorld(MUSE_SPRINT, 'x').racers[0].fur === 'number');

console.log('\nthresholds are calibrated against a cast we have played');
const me = MUSE_SPRINT.racers.find((r) => r.you)!;
const closest = Math.min(...MUSE_SPRINT.racers.filter((r) => !r.you).map((r) => distance(r.fur, me.fur)));
ok('no verified-good pair is flagged as confusable', closest >= 34, `closest pair is ${closest.toFixed(0)}`);
const toGround = Math.min(...MUSE_SPRINT.racers.map((r) => distance(r.fur, MUSE_SPRINT.palette.terrain.moss)));
ok('no verified-good racer is flagged as camouflaged', toGround >= 90, `closest to ground is ${toGround.toFixed(0)}`);

console.log('\ncharacter protection');
const cream = { name: 'Muse', fur: '#F0DEBD', source: 'upload' as const };
const hostile = structuredClone(MUSE_SPRINT);
hostile.palette.terrain.moss = '#F0DEBD';   // ground wearing the character
hostile.racers[1].fur = '#F0DEBD';          // rival wearing the character
ok('a camouflaged player is rejected before repair', !playtest(hostile).ok);
const { spec: fixed, moved } = protectCharacter(hostile, cream);
ok('repair makes it publishable', playtest(fixed).ok,
  playtest(fixed).findings.filter((f) => f.level === 'error').map((f) => f.message).join('; '));
ok('the character kept its exact colour', fixed.racers.find((r) => r.you)!.fur === '#F0DEBD');
ok('the world is what moved, and said so', moved.length > 0, `${moved.length} adjustments`);
ok('protection is idempotent', protectCharacter(fixed, cream).moved.length === 0);

console.log('\ncharacter rigs');
{
  const { DEFAULT_RIG, coerceRig, varyRig } = await import('../lib/rig.ts');
  ok('every shipped racer carries the identity rig',
    MUSE_SPRINT.racers.every((r) => r.rig.height === 1 && r.rig.girth === 1 && r.rig.topper === 'none'));
  // a rig is only safe if nothing can escape its envelope
  const wild = coerceRig({ height: 99, girth: -5, furLength: NaN, topper: 'dragon', eye: 'nonsense' });
  ok('absurd input is clamped, not rejected',
    wild.height === 1.22 && wild.girth === 0.78 && wild.furLength === 1 && wild.topper === 'none' && wild.eye === '#0E0C0B');
  let escaped = 0;
  for (let s = 1; s <= 300; s++) {
    const r = varyRig(DEFAULT_RIG, s, s % 6);
    for (const [k, [lo, hi]] of Object.entries(BOUNDS)) {
      const v = (r as unknown as Record<string, number>)[k];
      if (typeof v === 'number' && (v < lo - 1e-9 || v > hi + 1e-9)) escaped++;
    }
  }
  ok('300 sibling rigs stay inside the envelope', escaped === 0, `${escaped} escapes`);
  const sib = varyRig(DEFAULT_RIG, 42, 1);
  ok('siblings differ from the player', sib.height !== 1 || sib.girth !== 1);
  ok('siblings keep the species topper and eye', sib.topper === DEFAULT_RIG.topper && sib.eye === DEFAULT_RIG.eye);
}

console.log('\nprocedural tracks');
{
  const { TRACK_LENGTHS, TRACK_SHAPES } = await import('../lib/track.ts');
  const TARGET: Record<string, number> = { sprint: 340, short: 520, standard: 740, long: 1000, epic: 1280 };
  let degenerate = 0, pinched = 0, offLength = 0;
  const lobings: number[] = [];
  for (const length of TRACK_LENGTHS) {
    for (const shape of TRACK_SHAPES) {
      for (let s = 1; s <= 12; s++) {
        const t = buildTrack({ length, shape, elevation: (s % 7) / 6, seed: s * 7919 }, 5.9);
        const rad = t.points.map((p) => Math.hypot(p[0], p[2]));
        // star-shaped about the origin => cannot self-intersect
        if (rad.some((r) => r <= 0.001)) degenerate++;
        for (let i = 0; i < t.points.length; i++) {
          const a = t.points[i], b = t.points[(i + 1) % t.points.length];
          if (Math.hypot(a[0] - b[0], a[2] - b[2]) < 5.9 * 2.2) pinched++;
        }
        let per = 0;
        for (let i = 0; i < t.points.length; i++) {
          const a = t.points[i], b = t.points[(i + 1) % t.points.length];
          per += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        }
        per *= 1.04;
        // the pinch repair can only lengthen a loop, so allow headroom above
        if (per < TARGET[length] * 0.88 || per > TARGET[length] * 1.35) offLength++;
        lobings.push((Math.max(...rad) - Math.min(...rad)) / Math.max(...rad));
      }
    }
  }
  const n = TRACK_LENGTHS.length * TRACK_SHAPES.length * 12;
  ok(`${n} tracks across every shape stay star-shaped`, degenerate === 0, `${degenerate} degenerate`);
  ok(`${n} tracks have no pinched corners`, pinched === 0, `${pinched} pinches`);
  ok(`${n} tracks land near their requested length`, offLength === 0, `${offLength} off target`);
  // the whole point of named shapes: the gallery must not be one oval repeated
  const spread = Math.max(...lobings) - Math.min(...lobings);
  ok('shapes differ enough to tell apart', spread > 0.35,
    `lobing spans ${(Math.min(...lobings) * 100).toFixed(0)}%-${(Math.max(...lobings) * 100).toFixed(0)}%`);
}

console.log('\ncatalogue diversity');
{
  const { debias } = await import('../lib/diversity.ts');
  const SH = ['oval', 'lobed', 'serpentine', 'hairpins', 'sprawling'] as const;
  const saturated = { serpentine: 8, sprawling: 1 };
  ok('a saturated favourite is rotated away', debias('serpentine', SH, saturated, 's').value !== 'serpentine');
  ok('it rotates to a genuinely unused option',
    ['oval', 'lobed', 'hairpins'].includes(debias('serpentine', SH, saturated, 's').value as string));
  ok('an under-used pick is left alone', debias('oval', SH, saturated, 's').value === 'oval');
  ok('a thin catalogue is not second-guessed',
    debias('serpentine', SH, { serpentine: 1, lobed: 1 }, 's').value === 'serpentine');
  ok('an override is reported, never silent', !!debias('serpentine', SH, saturated, 's').note);
  // feeding the rule its own output must converge, not oscillate
  const counts: Record<string, number> = { serpentine: 8, sprawling: 1 };
  for (let i = 0; i < 20; i++) {
    const v = debias('serpentine', SH, counts, 's').value as string;
    counts[v] = (counts[v] ?? 0) + 1;
  }
  const share = Math.max(...SH.map((o) => counts[o] ?? 0)) / Object.values(counts).reduce((a, b) => a + b, 0);
  ok('20 saturated picks in a row still spread out', share < 0.45, `top option ends at ${Math.round(share * 100)}%`);
}

console.log('\nlanes (the road holds 7 at a readable spacing)');
for (const n of [2, 3, 4, 5, 6, 7]) {
  const lanes = buildLanes(n, 5.9);
  const edge = 5.9 - 1.2;
  const inside = lanes.every((l) => Math.abs(l) <= edge);
  const gaps = lanes.slice(1).map((l, i) => l - lanes[i]);
  ok(`${n} lanes fit on the road`, inside && (gaps.length === 0 || Math.min(...gaps) >= 1.3),
    `spread ${lanes[0]} to ${lanes[lanes.length - 1]}`);
}

runDifficultyChecks(ok);
runDesignChecks(ok);

console.log(`\n${failures ? `${failures} FAILED` : 'all checks passed'}\n`);
process.exit(failures ? 1 : 0);
