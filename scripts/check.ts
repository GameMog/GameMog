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
  const { staticCheckWorld } = await import('../lib/custom-game.ts');
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
  // the size limit: 500KB for every world (owner, 5 Oct 2026)
  const big = ref + '\n' + '//'.padEnd(480_000, '.'), huge = ref + '\n' + '//'.padEnd(520_000, '.');
  ok('a world over 500KB is refused', staticCheckWorld(huge).some((p) => /under 500KB/.test(p)));
  ok('a world up to 500KB passes the size check', !staticCheckWorld(big).some((p) => /KB/.test(p)));
  for (const f of readdirSync('worlds').filter((f) => f.endsWith('.js'))) {
    const problems = staticCheckWorld(readFileSync(`worlds/${f}`, 'utf8'));
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

// 5 Oct, the first Mog of AI Alps: "it was looking good the first few passes, then the third pass screwed up the
// lightening to way overexposed". A world that passed with notes goes back once; the repair ships only if it is no
// worse (lib/look.ts pickPass, used by lib/generate-game.ts). The frames are the saloon's own, driven on the local
// server on 5 Oct: with its original's light (moonlit, exposure 1), as it shipped (golden, exposure 1.7), and between.
console.log('\nthe build keeps the better pass: a repair of a passing world\'s notes ships only if it is no worse');
{
  const { pickPass, lookNotes, lookAdvisories, lookScore } = await import('../lib/look.ts');
  type L = Parameters<typeof lookScore>[0];
  const MOONLIT: L = { entropy: 6.8, dominant: 0.048, edges: 0.134, contrast: 131, mean: 83, clipped: 0, floor: 16, player: 0.0283, seen: 0.79, apart: 14 };
  const MOONLIT2: L = { entropy: 6.8, dominant: 0.053, edges: 0.145, contrast: 114, mean: 76, clipped: 0, floor: 17, player: 0.0365, seen: 1, apart: 31 };
  const SHIPPED: L = { entropy: 7.14, dominant: 0.051, edges: 0.193, contrast: 178, mean: 155, clipped: 0.005, floor: 57, player: 0.0422, seen: 1, apart: 53 };
  const SHIPPED2: L = { entropy: 7.12, dominant: 0.049, edges: 0.17, contrast: 172, mean: 156, clipped: 0.001, floor: 59, player: 0.0369, seen: 0.55, apart: 98 };
  const EXP1: L = { entropy: 6.97, dominant: 0.048, edges: 0.147, contrast: 190, mean: 137, clipped: 0, floor: 41, player: 0.0378, seen: 0.99, apart: 94 };
  const EXP1B: L = { entropy: 7.19, dominant: 0.038, edges: 0.199, contrast: 184, mean: 129, clipped: 0, floor: 34, player: 0.0272, seen: 1, apart: 71 };
  const pass = (look: L, notes = lookAdvisories(look), status = 'passed') => ({ status, look, notes });
  const kinds = (m: L) => lookNotes(m).map((n) => n.kind).join(',');

  const saloon = pickPass(pass(MOONLIT), pass(SHIPPED));
  ok('the over-lit saloon does not ship over the pass before it (a note about the player, answered by relighting the world)', saloon.keep === 'prev' && /brightened/.test(saloon.why), saloon.why);
  ok('which a better score alone would have shipped: washed out is not blown out', lookScore(SHIPPED) > lookScore(MOONLIT) && kinds(SHIPPED) === '', `${lookScore(MOONLIT).toFixed(2)} to ${lookScore(SHIPPED).toFixed(2)}`);
  ok('the moonlit saloon\'s note is about the player, not the light', kinds(MOONLIT) === 'blends', kinds(MOONLIT));
  for (const [name, a, b] of [['moonlit', MOONLIT, MOONLIT2], ['as shipped', SHIPPED, SHIPPED2], ['exposure 1', EXP1, EXP1B], ['exposure 1, the other way', EXP1B, EXP1]] as const) {
    const p = pickPass(pass(a), pass(b));
    ok(`the same code driven twice is never refused as worse (${name})`, p.keep === 'next', p.why);
  }

  const lit = (mean: number, more: Partial<L> = {}): L => ({ ...EXP1, mean, ...more });
  const p1 = pickPass(pass(lit(18)), pass(lit(70)));
  ok('a nearly black world lifted, as its note asked, ships', kinds(lit(18)).startsWith('dark') && p1.keep === 'next', p1.why);
  const p2 = pickPass(pass(lit(18)), pass(lit(215)));
  ok('a nearly black world over-corrected to blown out does not', p2.keep === 'prev' && /blown out/.test(p2.why), p2.why);
  const p3 = pickPass(pass(lit(215)), pass(lit(140)));
  ok('a blown-out world dimmed, as its note asked, ships', p3.keep === 'next', p3.why);
  const p4 = pickPass(pass(EXP1), pass(lit(130, { clipped: 0.08 })));
  ok('a repair that turns the view glare white does not', p4.keep === 'prev' && /glare/.test(p4.why), p4.why);
  const p5 = pickPass(pass(EXP1), pass(lit(80)));
  ok('a repair that darkens the whole view unasked does not', p5.keep === 'prev' && /darkened/.test(p5.why), p5.why);
  const LOUD = 'A PointLight has intensity 80. The runtime uses legacy light units: a sun of 2 to 4, a sky light of 0.4 to 1.5, a lamp of 0.5 to 4 with a distance (it fades to nothing there; without one it never fades). Values over 12 wash the picture out white.';
  const p6 = pickPass(pass(EXP1, [LOUD]), pass(lit(80)));
  ok('the runtime\'s light-units warning asks for less light: dimmed, it ships', p6.keep === 'next', p6.why);
  const p7 = pickPass(pass(EXP1), pass(lit(130, { entropy: 5.4, edges: 0.06 })));
  ok('a repair that looks worse by more than a drive\'s noise does not ship', p7.keep === 'prev' && /looks worse/.test(p7.why), p7.why);
  const p8 = pickPass(pass(EXP1, ['one note']), pass(EXP1B, ['one note', 'and another']));
  ok('nor one that ends with more notes than it was given', p8.keep === 'prev' && /more notes/.test(p8.why), p8.why);
  const p9 = pickPass(pass(EXP1), { problems: ['Runtime error: x is not defined'], status: 'failed' });
  const p10 = pickPass(pass(EXP1), { status: 'unverified', notes: [] });
  ok('a repair with problems, or one never driven, never ships over a pass', p9.keep === 'prev' && p10.keep === 'prev', `${p9.why}; ${p10.why}`);
  const p11 = pickPass({ status: 'passed', notes: ['a note'] }, { status: 'passed', notes: [] });
  ok('with no frames to compare, a passing repair ships', p11.keep === 'next', p11.why);

  const all: L = { entropy: 3, dominant: 0.4, edges: 0.03, contrast: 40, mean: 20, clipped: 0.08, floor: 0, player: 0.03, seen: 0.3, apart: 10 };
  const notes = lookNotes(all);
  ok('the advisories are the notes\' words', JSON.stringify(lookAdvisories(all)) === JSON.stringify(notes.map((n) => n.text)));
  const light = notes.filter((n) => ['dark', 'blown', 'murky', 'glare'].includes(n.kind)).concat(lookNotes({ ...all, mean: 230, edges: 0.2 }).filter((n) => n.kind === 'blown' || n.kind === 'murky'));
  ok('every light note gives the runtime\'s ranges and asks for one change, one step', light.length === 4 && light.every((n) => /never above 1\.5/.test(n.text) && /Change one thing, one step/.test(n.text)), light.map((n) => n.kind).join(','));
  const frame = notes.filter((n) => ['one-colour', 'empty', 'hidden', 'blends'].includes(n.kind));
  ok('every note about what is in the frame says to leave the light as it is', frame.length === 4 && frame.every((n) => /Leave the graphics, the exposure and the lights as they are/.test(n.text)), frame.map((n) => n.kind).join(','));
  ok('the player\'s note changes the hero, not the world\'s light', /Change the hero, not the world's light/.test(notes.find((n) => n.kind === 'blends')?.text ?? ''));
}

// the owner, 6 Oct 2026, "Mogs keep their parent": "A DNA check after each pass: if the map, hero, crews, story or game
// type disappear and the idea didn't ask for that, the builder gets a repair note to put them back". The case: Zcity
// Mogged with the Oaktown idea came back a derby arena with none of Zcity in it (scripts/fixtures/mog-oaktown-derby.js).
// The check is lib/mog-dna.ts, run by lib/generate-game.ts after each pass of a Mog that passes; here on real worlds.
console.log('\na Mog keeps its parent: the DNA check, on real worlds');
{
  const { readFileSync, readdirSync } = await import('node:fs');
  const { dna, compareDna, askedKind, readIdea, pickMogPass, describeDna } = await import('../lib/mog-dna.ts');
  const R = (f: string) => readFileSync(f, 'utf8');
  const ZCITY = R('worlds/zcity.js'), OAKTOWN = R('scripts/fixtures/mog-oaktown-derby.js'), BEACH = R('worlds/zombie-beach.js');
  const ALPS = R('worlds/ai-alps.js'), COUNTRY = R('deploy/migrations/typson-honky-tonk-havoc.js');
  const OAK = 'set it at daytime driving around in a red ferrari testarossa GTA 5 style. city is called "Oaktown"';
  const keys = (v: { dropped: { key: string }[] }) => v.dropped.map((d) => d.key).join(', ');

  const z = dna(ZCITY);
  ok('Zcity\'s DNA: an open world on foot on the city map at night, with the traversal and a patrol SUV',
    z.kind === 'survival' && z.map === 'city' && z.city?.time === 'night' && z.city?.district === 'midtown' && z.traversal && z.patrol === 'suv', JSON.stringify({ kind: z.kind, map: z.map, city: z.city, traversal: z.traversal, patrol: z.patrol }));
  ok('its hero is the OG, a library human, still sick', z.hero.kind === 'human' && z.hero.name === 'The OG' && z.hero.body === 'human-athlete-male' && z.hero.traits.includes('sick'), JSON.stringify(z.hero));
  ok('its four crews are people, with their names', (['thug', 'biker', 'cop', 'boss'] as const).every((k) => z.crews[k]?.as === 'people') && z.crews.thug!.names[0] === 'Infected courier' && z.crews.boss!.names[0] === 'Patient Zero');
  ok('its story: an intro, the goal Cured at 10,000 GM for the Vaccine fund, an outro with Dr. Reyes',
    z.intro?.shots === 7 && z.goal?.title === 'Cured' && z.goal.gm === 10000 && z.fund === 'Vaccine fund' && !!z.outro?.cast.includes('Dr. Reyes'), JSON.stringify({ intro: z.intro, outro: z.outro, goal: z.goal, fund: z.fund }));
  const o = dna(OAKTOWN);
  ok('the Oaktown Mog\'s DNA: a derby with no map, a car for a hero and crews in cars', o.kind === 'derby' && o.map === null && !o.traversal && o.hero.kind === 'car' && Object.values(o.crews).every((c) => c.as === 'cars'), JSON.stringify({ kind: o.kind, hero: o.hero }));
  const a = dna(ALPS);
  ok('AI Alps\'s DNA reads through its variables (crew: MAIN_CREW, intro: INTRO, assets joined from four lists)',
    a.crews.thug?.names[0] === 'Après-ski bro' && a.intro?.shots === 6 && a.beats === 6 && a.assets.includes('heightfield-massif') && a.assets.includes('human-moves-male') && a.places[0] === 'COURCHEVEL 1850', JSON.stringify({ intro: a.intro, beats: a.beats, places: a.places, assets: a.assets.length }));
  ok('and its hero\'s moves: punches only, no jump, no dodge, a tank', a.moves.join(',') === 'kicks: false,jump: false,dodge: false,tank' && a.hero.traits.includes('a chrome endoskeleton'), a.moves.join(','));

  const v = compareDna(ZCITY, OAKTOWN, OAK);
  const must = ['kind', 'map', 'traversal', 'hero', 'crews', 'story'];
  ok('Zcity to the Oaktown derby: the kind, the map, the traversal, the hero, the crews and the story are flagged as dropped', must.every((k) => v.dropped.some((d) => d.key === k)), keys(v));
  ok('and the patrol car too, and nothing the idea asked for (its daytime, its new name)', v.dropped.some((d) => d.key === 'patrol') && !v.dropped.some((d) => d.key === 'time' || d.key === 'places'), keys(v));
  const map = v.dropped.find((d) => d.key === 'map')?.note ?? '';
  ok('the map\'s note says the idea only renamed the city: keep it, "Oaktown" on its signs', /only renames it/.test(map) && /"Oaktown" on its billboards and shop signs/.test(map), map);
  ok('the kind\'s note asks for the original\'s kind back', /Keep an open world on foot/.test(v.dropped.find((d) => d.key === 'kind')?.note ?? ''));
  ok('Zcity next to itself drops nothing', compareDna(ZCITY, ZCITY, OAK).dropped.length === 0, keys(compareDna(ZCITY, ZCITY, OAK)));
  let selfDrops = '';
  for (const f of readdirSync('worlds').filter((f) => f.endsWith('.js'))) { const w = R(`worlds/${f}`), s = compareDna(w, w, 'make it better'); if (s.dropped.length) selfDrops += `${f}: ${keys(s)}; `; }
  ok('every first-party world next to itself drops nothing', !selfDrops, selfDrops);

  // the real first-party Mog: Zombie Beach to Zcity, an idea that takes the outbreak to the city
  const zb = compareDna(BEACH, ZCITY, 'Take the outbreak to the city at night: the OG runs up the towers and swings between them, and the infected climb after him.');
  ok('Zombie Beach to Zcity: the move to the city map is the idea\'s (it names the city), not a drop', !zb.dropped.some((d) => d.key === 'map') && zb.allowed.some((d) => d.key === 'map' && /city/.test(d.why)), keys(zb) || zb.allowed.map((d) => `${d.key}: ${d.why}`).join('; '));
  ok('and nothing else is flagged: the OG, the vaccine story, the scenes are all kept', zb.dropped.length === 0, keys(zb));

  // AI Alps to Country Box: "Put Iron Mike Typson in a country dance club with faster punches and ..."
  const cb = compareDna(ALPS, COUNTRY, 'Put Iron Mike Typson in a country dance club with faster punches and morendevastinf knockout moves that sends opponents across the room. This is peak Mike Tyson');
  ok('AI Alps to Country Box: "a country dance club" is a new place (AI Alps has a club, not a country one), and Iron Mike Typson a new hero', cb.idea.place === 'country dance club' && cb.idea.hero, JSON.stringify({ place: cb.idea.place, hero: cb.idea.hero }));
  ok('so the place, the hero, the crews and the story are the idea\'s', ['hero', 'crews', 'story', 'places', 'scenery'].every((k) => cb.allowed.some((d) => d.key === k)) && !cb.dropped.some((d) => ['map', 'hero', 'crews', 'story', 'kind', 'intro', 'outro'].includes(d.key)), keys(cb));
  ok('what it dropped unasked: the motion pack (human-moves-*), whose crush is the knockout the idea asks for', keys(cb) === 'kits' && /human-moves-male, human-moves-female/.test(cb.dropped[0].note), cb.dropped.map((d) => d.note).join(' | '));
  ok('a kit is minor: recorded, never a reason to send a pass back on its own (the Oaktown drops all are)', cb.dropped[0].minor === true && v.dropped.every((d) => !d.minor));

  // the idea's own words
  ok('the kind of game is asked for only by name', askedKind('turn it into a demolition derby') === 'derby' && askedKind(OAK) === null && askedKind('make it a night race through the swamp') === 'race' && askedKind('make it better') === null);
  const oi = readIdea(OAK, z);
  ok('"city is called Oaktown" is a rename, not a move; "daytime" is a time of day; no new hero', oi.rename === 'Oaktown' && oi.place === null && oi.time && !oi.hero, JSON.stringify(oi));
  ok('a new city, the moon or a forest is a move', !!readIdea('set it in a new city called Oaktown', z).place && readIdea('take it to the moon', z).place === 'moon' && readIdea('Take it somewhere nobody would expect in a forrest', z).place === 'forrest');
  ok('naming the place the parent is already in is not', readIdea('more people in the city at rush hour', z).place === null && readIdea('a party on south beach', dna(BEACH)).place === null
    && readIdea('more guests in the club and a second bar', a).place === null);
  ok('nor a word that only sounds like a place (a club to swing, a sea of zombies, a full moon)', readIdea('give him a club and a bigger health bar', z).place === null && readIdea('a sea of zombies under a full moon', z).place === null);

  // the rules that let a change through, one at a time, on Zcity's own code
  const noSwing = ZCITY.replace("traversal: { line: '#E6F2EA' },", '');
  ok('a Mog that loses the traversal is flagged, unless the idea asks for no swinging', keys(compareDna(ZCITY, noSwing, 'make it rain')) === 'traversal' && compareDna(ZCITY, noSwing, 'no swinging, just street fights').dropped.length === 0);
  const day = ZCITY.replace("time: 'night'", "time: 'day'");
  ok('the city\'s time of day changes only when the idea names one', keys(compareDna(ZCITY, day, 'more looters')) === 'time' && compareDna(ZCITY, day, 'set it at noon').dropped.length === 0);
  const derby = compareDna(ZCITY, OAKTOWN, 'turn it into a demolition derby in Oaktown');
  ok('an idea that asks for a derby lets the kind, the place, the hero and the crews change, never the story', keys(derby) === 'story', keys(derby));
  const vegas = R('worlds/vegas.js');
  ok('a lap world of cars that loses its cars is flagged, unless the idea names a new hero', keys(compareDna(vegas, vegas.replace(/vehicle:\s*true/, 'vehicle: false'), 'make it rain')) === 'play'
    && compareDna(vegas, vegas.replace(/vehicle:\s*true/, 'vehicle: false'), 'the main character is a sprinter').dropped.every((d) => d.key !== 'play'));

  // which pass ships after the repair turn
  const passed = (dropped: number, more = {}) => ({ status: 'passed', notes: [] as string[], dropped, ...more });
  ok('a repair that put the parent back ships', pickMogPass(passed(7), passed(0)).keep === 'next');
  ok('one that broke the world, or was never driven, does not', pickMogPass(passed(7), { problems: ['Runtime error: x'], status: 'failed', dropped: 0 }).keep === 'prev' && pickMogPass(passed(7), { status: 'unverified', dropped: 0 }).keep === 'prev');
  ok('one that dropped more of the parent does not', pickMogPass(passed(2), passed(5)).keep === 'prev');
  ok('one that put nothing back does not', pickMogPass(passed(7), passed(7)).keep === 'prev', pickMogPass(passed(7), passed(7)).why);
  const BLOWN = { entropy: 7, dominant: 0.05, edges: 0.18, contrast: 170, mean: 230, clipped: 0.02, floor: 60, player: 0.04, seen: 1, apart: 60 };
  const FINE = { ...BLOWN, mean: 120, clipped: 0, floor: 30 };
  ok('putting the parent back outranks the look (and says what the look was)', pickMogPass(passed(7, { look: FINE }), passed(0, { look: BLOWN })).keep === 'next' && /though/.test(pickMogPass(passed(7, { look: FINE }), passed(0, { look: BLOWN })).why));
  ok('with nothing dropped, a repair of notes is the look\'s choice, as before', pickMogPass(passed(0, { look: FINE, notes: ['a note'] }), passed(0, { look: BLOWN })).keep === 'prev');

  const said = describeDna(z).join(' ');
  ok('the Mog prompt\'s keep-list names Zcity\'s place, hero, crews, patrol and story', /library map 'city' \(midtown, at night\)/.test(said) && /The OG/.test(said) && /Infected courier/.test(said) && /an SUV/.test(said) && /Dr\. Reyes/.test(said), said);
}

runDifficultyChecks(ok);
runDesignChecks(ok);

console.log(`\n${failures ? `${failures} FAILED` : 'all checks passed'}\n`);
process.exit(failures ? 1 : 0);
