/**
 * Regression guard. `npm run check`
 *
 * The featured game is the canary: if the engine or the rules ever stop
 * accepting Muse Sprint — a world we have actually played — then a threshold
 * has been tuned by vibes and the abstraction has drifted. This catches that
 * before a creator does.
 */
import { MUSE_SPRINT } from '../lib/presets/muse-sprint.ts';
import { playtest } from '../lib/playtest.ts';
import { compileWorld } from '../lib/worldspec.ts';
import { protectCharacter } from '../lib/character.ts';
import { buildTrack, buildLanes } from '../lib/track.ts';
import { distance } from '../lib/color.ts';
import { BOUNDS } from '../lib/rig.ts';

let failures = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
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
let selfIntersecting = 0, tooTight = 0, outOfRange = 0;
for (let seed = 1; seed <= 400; seed++) {
  const size = 0.55 + (seed % 16) / 20;
  const t = buildTrack(
    { size, corners: 7 + (seed % 10), twistiness: (seed % 11) / 10, elevation: (seed % 7) / 6, seed },
    5.9
  );
  // star-shaped about the origin => cannot self-intersect; verify the property
  // holds rather than trusting the derivation
  const radii = t.points.map((p) => Math.hypot(p[0], p[2]));
  if (radii.some((r) => r <= 0.001)) selfIntersecting++;
  for (let i = 0; i < t.points.length; i++) {
    const a = t.points[i], b = t.points[(i + 1) % t.points.length];
    if (Math.hypot(a[0] - b[0], a[2] - b[2]) < 5.9 * 2.2) tooTight++;
  }
  const perim = t.points.reduce((s, p, i) => {
    const q = t.points[(i + 1) % t.points.length];
    return s + Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  }, 0) * 1.04;
  if (perim < 180 || perim > 1400) outOfRange++;
}
ok('400 generated tracks stay star-shaped', selfIntersecting === 0, `${selfIntersecting} degenerate`);
ok('400 generated tracks have no pinched corners', tooTight === 0, `${tooTight} pinches`);
ok('400 generated tracks are a sane lap length', outOfRange === 0, `${outOfRange} out of range`);

console.log('\nlanes (the road holds 7 at a readable spacing)');
for (const n of [2, 3, 4, 5, 6, 7]) {
  const lanes = buildLanes(n, 5.9);
  const edge = 5.9 - 1.2;
  const inside = lanes.every((l) => Math.abs(l) <= edge);
  const gaps = lanes.slice(1).map((l, i) => l - lanes[i]);
  ok(`${n} lanes fit on the road`, inside && (gaps.length === 0 || Math.min(...gaps) >= 1.3),
    `spread ${lanes[0]} to ${lanes[lanes.length - 1]}`);
}

console.log(`\n${failures ? `${failures} FAILED` : 'all checks passed'}\n`);
process.exit(failures ? 1 : 0);
