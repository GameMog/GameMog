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

console.log('\nworlds are 3D: the camera is the runtime\'s');
{
  const { staticCheckWorld, FIRST_PARTY_MAX } = await import('../lib/custom-game.ts');
  const { readFileSync, readdirSync } = await import('node:fs');
  const ref = readFileSync('lib/runtime/reference-world.js', 'utf8');
  const cam = (line: string) => staticCheckWorld(ref.replace('update(ctx, t) {', `update(ctx, t) {\n    ${line}`)).some((p) => /camera/i.test(p));
  ok('the reference world passes the static check', staticCheckWorld(ref).length === 0, staticCheckWorld(ref).join(' | '));
  for (const line of ['new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);', 'ctx.camera.position.set(0, 200, 0);', 'ctx.camera.position.y = 90;',
    'ctx.camera.lookAt(0, 0, 0);', 'ctx.camera.fov = 5;', 'ctx.camera.zoom *= 0.1;', 'ctx.camera.projectionMatrix.makeOrthographic(-1, 1, 1, -1, 0, 1);', 'ctx.camera.add(new THREE.Mesh());']) {
    ok(`refused: ${line}`, cam(line));
  }
  for (const line of ['const p = ctx.camera.position.clone();', 'sprite.lookAt(ctx.camera.position);', 'if (ctx.camera.fov > 60) {}']) {
    ok(`allowed (reading the camera): ${line}`, !cam(line));
  }
  // the size limit: 260KB for a world the builder writes, 360KB for the owner's own (owner, 5 Oct 2026)
  const big = ref + '\n' + '//'.padEnd(340_000, '.');
  ok('a builder world over 260KB is refused', staticCheckWorld(big).some((p) => /under 260KB/.test(p)));
  ok('a first-party world up to 360KB passes the size check', !staticCheckWorld(big, { max: FIRST_PARTY_MAX }).some((p) => /KB/.test(p)));
  for (const f of readdirSync('worlds').filter((f) => f.endsWith('.js'))) {
    const problems = staticCheckWorld(readFileSync(`worlds/${f}`, 'utf8'), { max: FIRST_PARTY_MAX });
    ok(`first-party world ${f} passes the static check`, problems.length === 0, problems.join(' | '));
  }
}

console.log('\nthe asset library: every file licensed, listed and unchanged');
{
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const lib = JSON.parse(readFileSync('public/assets/library.json', 'utf8'));
  // and Spiderbench's city textures, used with its author's written permission (the owner's go-ahead, 2 Oct 2026;
  // lib/runtime/maps/city/LICENSE): GameMog only, non-commercial
  const ALLOWED = new Set(['CC0-1.0', 'LicenseRef-CMU-Mocap', 'LicenseRef-Spiderbench-Permission']);
  const dirs = readdirSync('public/assets').filter((d) => statSync(`public/assets/${d}`).isDirectory());
  ok('every folder in public/assets is a listed asset', dirs.every((d) => lib.assets[d]), dirs.filter((d) => !lib.assets[d]).join(', '));
  for (const [id, a] of Object.entries<any>(lib.assets)) {
    const onDisk = readdirSync(`public/assets/${id}`).sort(), listed = Object.keys(a.files).sort();
    ok(`${id}: the files on disk are exactly the files listed`, JSON.stringify(onDisk) === JSON.stringify(listed), onDisk.filter((f) => !a.files[f]).concat(listed.filter((f) => !onDisk.includes(f))).join(', '));
    const bad = listed.filter((f) => createHash('sha256').update(readFileSync(`public/assets/${id}/${f}`)).digest('hex') !== a.files[f].sha256);
    ok(`${id}: every file matches its SHA-256`, bad.length === 0, bad.join(', '));
    const lic = a.sources.map((s: string) => lib.sources[s]);
    ok(`${id}: built only from sources under an allowed licence`, lic.length > 0 && lic.every((s: any) => s && ALLOWED.has(s.license) && s.licenseUrl && s.author), a.sources.join(', '));
  }
}

// the owner, 3 Oct: hands looked like claws. Motion capture has no fingers, so the build poses them: a relaxed hand
// with its fingers together (the library hand rests splayed, 16 degrees between index and middle finger), a fighter's
// hand closed into a fist
console.log('\nthe library humans\' hands: together when relaxed, closed in a fist');
{
  const { readFileSync } = await import('node:fs');
  const { inflateSync } = await import('node:zlib');
  type Q4 = [number, number, number, number]; type V = [number, number, number];
  const qmul = (a: Q4, b: Q4): Q4 => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  const qrot = (q: Q4, v: V): V => { const p = qmul(qmul(q, [v[0], v[1], v[2], 0]), [-q[0], -q[1], -q[2], q[3]]); return [p[0], p[1], p[2]]; };
  const unit = (a: V): V => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const deg = (a: V, b: V) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI;
  const FISTS = new Set(['fight', 'guardF', 'guardB', 'guardL', 'guardR', 'jab', 'cross', 'hook', 'upperL', 'uppercut', 'body']);
  for (const id of ['human-athlete-male', 'human-athlete-female']) {
    const J = JSON.parse(readFileSync(`public/assets/${id}/asset.json`, 'utf8')), buf = inflateSync(readFileSync(`public/assets/${id}/${J.clips.file}`));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), sk = J.skeleton as { name: string; parent: number; head: V; tail: V }[];
    const bi = (n: string) => sk.findIndex((b) => b.name === n), dir = (n: string) => { const b = sk[bi(n)]; return unit([b.tail[0] - b.head[0], b.tail[1] - b.head[1], b.tail[2] - b.head[2]]); };
    const splayed: string[] = [], open: string[] = [];
    for (const c of J.clips.list as { name: string; frames: number }[]) {
      if (!/CMU/.test(J.clips.credits[c.name] || '')) continue;           // the captures without fingers
      const L = J.clips.layout[`${c.name}:q`], q16 = new Int16Array(ab, L.offset, L.length), f = Math.floor(c.frames / 2), W: Q4[] = [];
      sk.forEach((b, i) => { const o = (f * sk.length + i) * 4, q: Q4 = [q16[o] / 32767, q16[o + 1] / 32767, q16[o + 2] / 32767, q16[o + 3] / 32767]; W[i] = b.parent < 0 ? q : qmul(W[b.parent], q); });
      const world = (n: string) => qrot(W[bi(n)], dir(n));
      for (const s of ['L', 'R']) {
        const gap = Math.max(deg(world(`finger2-1.${s}`), world(`finger3-1.${s}`)), deg(world(`finger5-1.${s}`), world(`finger3-1.${s}`)));
        if (gap > (FISTS.has(c.name) ? 7 : 10)) splayed.push(`${c.name}.${s} ${gap.toFixed(0)}°`);
        // a fist: the middle fingertip folded in near the middle of the palm (under half its open distance)
        if (FISTS.has(c.name)) {
          const chain = [`wrist.${s}`, `finger3-1.${s}`, `finger3-2.${s}`, `finger3-3.${s}`].map(bi), P: V[] = [[0, 0, 0]];
          for (let k = 1; k < chain.length; k++) { const a = sk[chain[k - 1]], b = sk[chain[k]], r = qrot(W[chain[k - 1]], [b.head[0] - a.head[0], b.head[1] - a.head[1], b.head[2] - a.head[2]]); P.push([P[k - 1][0] + r[0], P[k - 1][1] + r[1], P[k - 1][2] + r[2]]); }
          const last = sk[chain[3]], t = qrot(W[chain[3]], [last.tail[0] - last.head[0], last.tail[1] - last.head[1], last.tail[2] - last.head[2]]), tip: V = [P[3][0] + t[0], P[3][1] + t[1], P[3][2] + t[2]];
          const w = sk[chain[0]].head, m1 = sk[chain[1]].head, rest = Math.hypot(last.tail[0] - (w[0] + m1[0]) / 2, last.tail[1] - (w[1] + m1[1]) / 2, last.tail[2] - (w[2] + m1[2]) / 2);
          const now = Math.hypot(tip[0] - P[1][0] / 2, tip[1] - P[1][1] / 2, tip[2] - P[1][2] / 2);
          if (now / rest > 0.5) open.push(`${c.name}.${s} ${(now / rest).toFixed(2)}`);
        }
      }
    }
    ok(`${id}: relaxed fingers lie together, a fighter's too (the library hand rests 16 degrees apart)`, splayed.length === 0, splayed.slice(0, 6).join(', '));
    ok(`${id}: a fighter's hand is closed in a fist`, open.length === 0, open.slice(0, 6).join(', '));
  }
}

runDifficultyChecks(ok);
runDesignChecks(ok);

console.log(`\n${failures ? `${failures} FAILED` : 'all checks passed'}\n`);
process.exit(failures ? 1 : 0);
