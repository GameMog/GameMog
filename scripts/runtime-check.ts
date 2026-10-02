/**
 * GameMog Runtime contract, checked in real Chrome.  `npm run check:runtime`
 *
 * The runtime is the part of every future world the platform guarantees, so
 * its rules are asserted against the real thing rather than read off the
 * source: the reference world is published as a draft, booted in Chrome, and
 * driven through the keyboard, the pause key, the autopilot and a forced
 * crash. Needs the dev server (BASE, default http://localhost:3939).
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { withBrowser } from '../lib/browser.ts';
import { insertDraft, db } from '../lib/db.ts';
import { meFragment, sanitizeMe } from '../lib/me.ts';

const BASE = process.env.BASE ?? 'http://localhost:3939';
let failures = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  if (!cond) failures++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const id = randomUUID();
insertDraft({
  id, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true },
  code: readFileSync(new URL('../lib/runtime/reference-world.js', import.meta.url), 'utf8'),
  meta: { title: 'Clover Loop', tagline: 'The reference world', blurb: 'Runtime check.', genre: 'Test', cast: [{ name: 'Pip', color: '#F2E3C4' }], palette: { sky: '#9CCBEB', ground: '#7DB356', accent: '#F28C28' }, runtime: 1 },
});

type State = { demo?: boolean; state: string; level: number; gm: number; alive: boolean; pace: number; cruise: number; rivals: { k: number; ratio: number; aggro: number; ahead: number; x: number; joinedFromLine: number }[]; lap: number; obstacles: number; coins: number; x: number; d: number; speed: number; paused: boolean; crashedInto: string };

try {
  await withBrowser(async (page) => {
    await page.preload('window.__frames=0;(function t(){window.__frames++;requestAnimationFrame(t)})();');
    await page.goto(`${BASE}/d/${id}/play`);
    let ready = false;
    for (let i = 0; i < 80 && !ready; i++) { ready = await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false); if (!ready) await sleep(200); }
    const st = () => page.eval<State>('window.__gmRuntime.state()');
    const errors = () => page.eval<string[]>('window.__gm.errors');

    console.log('\nboot');
    ok('the world boots and reports ready', ready);
    ok('no errors building the world', (await errors()).length === 0, (await errors()).join(' | '));
    const s0 = await st();
    ok('the lap is within 320-900m', s0.lap >= 320 && s0.lap <= 900, `${Math.round(s0.lap)}m`);
    ok('golden GM coins are laid', s0.coins > 10, `${s0.coins}`);
    // the owner, 23 Sep: no card over the game before you start
    ok('before anyone asks to play, the world races itself with nothing over it', !!s0.demo && s0.state === 'race' && (await page.eval<number>('document.querySelectorAll("#gm .screen, #gm .prompt").length')) === 0);
    await sleep(2000);
    const sd = await st();
    ok('the demo run moves on its own and is never scored', !!sd.demo && sd.d > s0.d + 5 && (await page.eval<unknown[]>('window.__gm.results')).length === 0, `${Math.round(sd.d - s0.d)}m in 2s`);
    const warnings = await page.eval<string[]>('window.__gm.warnings');
    console.log(`        runtime repairs reported: ${warnings.length ? warnings.join(' | ') : 'none'}`);

    console.log('\nthe rules');
    // the page's Play button
    await page.eval(`window.postMessage({ source: 'gamemog-host', type: 'play' }, '*')`);
    await sleep(500);
    const t0 = await st(), tr = t0.rivals[0];
    ok('Play brings up the start screen: you and one rival on the line, waiting', !t0.demo && t0.state === 'title' && (await page.eval<number>('document.querySelectorAll("#gm .screen").length')) === 1 && t0.rivals.length === 1 && Math.abs(tr.ahead) < 0.5 && Math.abs(tr.x - t0.x) > 1.2, tr ? `${t0.state}, ${tr.ahead.toFixed(1)}m ahead, ${Math.abs(tr.x - t0.x).toFixed(1)}m across` : 'none');
    await page.key('Enter');
    await sleep(500);
    const c0 = await st(), r0 = c0.rivals[0];
    ok('Enter starts the countdown, the rival still beside you on the line', !c0.demo && c0.state === 'countdown' && c0.rivals.length === 1 && Math.abs(r0.ahead) < 0.5 && Math.abs(r0.x - c0.x) > 1.2, r0 ? `${c0.state}, ${r0.ahead.toFixed(1)}m ahead` : 'none');
    await sleep(2900);
    let s = await st();
    ok('then the race', s.state === 'race', s.state);
    await sleep(1500); s = await st();
    ok('lap 1 has exactly one rival', s.rivals.length === 1 && s.level === 1, `${s.rivals.length} at level ${s.level}`);
    ok('the first rival is slower than your cruising speed', s.rivals[0].ratio < 1, `${s.rivals[0].ratio}x`);
    ok('the player moves forward without any key held', s.speed > 15, `${s.speed.toFixed(1)} m/s`);
    // the demo drives with the same controls; none of its steering carries into your run
    ok('and runs straight: the demo leaves no steering behind', Math.abs(s.x - c0.x) < 0.3, `${c0.x.toFixed(2)} -> ${s.x.toFixed(2)}`);

    const x0 = s.x; await page.key('ArrowRight', 'keyDown'); await sleep(400);
    const x1 = (await st()).x; await page.key('ArrowRight', 'keyUp'); await sleep(200);
    await page.key('ArrowLeft', 'keyDown'); await sleep(700);
    const x2 = (await st()).x; await page.key('ArrowLeft', 'keyUp');
    ok('the arrow keys steer', x1 > x0 + 1 && x2 < x1 - 1, `${x0.toFixed(1)} -> ${x1.toFixed(1)} -> ${x2.toFixed(1)}`);
    await page.key('ArrowUp', 'keyDown'); await sleep(900); const fast = (await st()).speed; await page.key('ArrowUp', 'keyUp');
    await page.key('ArrowDown', 'keyDown'); await sleep(1100); const slow = (await st()).speed; await page.key('ArrowDown', 'keyUp');
    ok('up is faster and down is slower', fast > 24 && slow < 16, `up ${fast.toFixed(1)}, down ${slow.toFixed(1)} m/s`);

    await page.key('KeyP'); await sleep(300);
    const p1 = await st(); await sleep(700); const p2 = await st();
    ok('P pauses (Space jumps now), and a paused race does not move', p1.paused && p2.d === p1.d, `paused=${p1.paused}`);
    await page.key('Space'); await sleep(400);
    ok('Space resumes', !(await st()).paused);

    // the touch kit every world shares (Zombie Beach's, the owner, 30 Sep): a
    // stick, and round buttons on the right with the main one last and big
    const kit = await page.eval<{ stick: number; buttons: string[]; bigLast: boolean; pause: number }>(`(() => {
      const b = [...document.querySelectorAll('#gm .tpad button')];
      return { stick: document.querySelectorAll('#gm .stick').length, buttons: b.map((x) => x.textContent), bigLast: !!b.length && b[b.length - 1].classList.contains('big'), pause: document.querySelectorAll('#gm .pause').length };
    })()`);
    ok('touch controls exist: a stick, buttons on the right with the main one big and last, and a pause button',
      kit.stick === 1 && kit.buttons.length >= 2 && kit.bigLast && kit.pause === 1, JSON.stringify(kit));

    console.log('\nendless laps (rules, with collisions off so the test does not depend on a bot surviving)');
    // frame rate at real speed, driving, before speeding things up
    await page.eval('window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.autopilot(true)');
    const f0 = await page.eval<number>('window.__frames'); await sleep(2000); const fps = ((await page.eval<number>('window.__frames')) - f0) / 2;
    ok('holds a playable frame rate', fps >= 40, `${Math.round(fps)} fps`);
    await page.eval('window.__gmRuntime.debug.timeScale(6)');
    const seen: State[] = [];
    for (let i = 0; i < 120; i++) {
      await sleep(500);
      s = await st(); seen.push(s);
      if (s.level >= 8) break;
    }
    const top = seen[seen.length - 1];
    ok('there is no final lap: level 8 and counting', top.level >= 8, `reached level ${top.level}`);
    ok('one new rival per lap, every lap', seen.every((x) => x.rivals.length === x.level), seen.map((x) => `${x.level}:${x.rivals.length}`).filter((v, i, a) => a.indexOf(v) === i).join(' '));
    const r = top.rivals;
    ok('each new rival is faster than the last', r.every((v, i) => i === 0 || v.ratio > r[i - 1].ratio), r.map((v) => v.ratio.toFixed(2)).join(' < '));
    ok('and more aggressive than the last', r.every((v, i) => i === 0 || v.aggro > r[i - 1].aggro), r.map((v) => v.aggro.toFixed(2)).join(' < '));
    ok('every rival joined at the start line (in view, a few metres past it)', r.every((v) => v.joinedFromLine < 8), r.map((v) => v.joinedFromLine.toFixed(1)).join(' '));
    const byLevel = new Map<number, State>(); seen.forEach((x) => byLevel.set(x.level, x));
    const levels = [...byLevel.keys()].sort((a, b) => a - b), paces = levels.map((l) => byLevel.get(l)!.pace);
    ok('your pace rises every lap', paces.every((p, i) => i === 0 || p > paces[i - 1]), paces.map((p) => p.toFixed(2)).join(' < '));
    const first = levels.map((l) => byLevel.get(l)!.rivals.find((x) => x.k === 1)!);
    ok('and the rivals already racing gain on you and hunt harder every lap', first.every((x, i) => i === 0 || (x.ratio > first[i - 1].ratio && x.aggro > first[i - 1].aggro)), `rival 1: ${first.map((x) => x.ratio.toFixed(3)).join(' < ')}`);
    ok('GM coins are collected', top.gm > 0, `${top.gm} GM`);
    ok('no errors during the run', (await errors()).length === 0, (await errors()).join(' | '));

    console.log('\ndying');
    await page.eval('window.__gmRuntime.debug.invincible(false); window.__gmRuntime.debug.timeScale(1); window.__gmRuntime.debug.autopilot(false)');
    await page.eval('window.__gmRuntime.debug.crashInto()');
    await sleep(2600);
    s = await st();
    ok('touching an obstacle or rival ends the run', !s.alive && s.state === 'results', s.state);
    const results = await page.eval<{ level: number; gm: number; assisted: boolean }[]>('window.__gm.results');
    const last = results[results.length - 1];
    ok('the result reaches the platform with level and GM', !!last && last.level >= 1 && last.gm >= 0, last ? `level ${last.level}, ${last.gm} GM` : 'none');
    ok('a run that used the test autopilot is marked assisted', !!last?.assisted);
    ok('the results are a bar along the bottom, with the world still in view', (await page.eval<number>('document.querySelectorAll("#gm .screen.bar").length')) === 1);
    await page.key('Enter'); await sleep(3400);
    s = await st();
    ok('Enter starts a fresh run at level 1 with one rival', s.state === 'race' && s.level === 1 && s.rivals.length === 1, `${s.state}, level ${s.level}`);
    await page.eval('window.__gmRuntime.debug.crashInto()'); await sleep(2600 + 12500);
    s = await st();
    ok('left alone, the results give way to the world racing itself again', !!s.demo && s.state === 'race', `${s.state}${s.demo ? ', demo' : ''}`);
    await page.key('ArrowLeft'); await sleep(400);
    s = await st();
    ok('a key on the demo also brings up the start screen, and does not start a run', s.state === 'title' && !s.demo && (await page.eval<number>('document.querySelectorAll("#gm .screen").length')) === 1, s.state);
    await page.eval('window.__gmRuntime.debug.start()'); await sleep(3400);

    // the jump (the owner, 1 Oct: the roll retired; hurdles and obstacles cleared, the height uniformly useful)
    console.log('\nthe jump');
    type J = { top: number; v: number; H: number; T: number } | null;
    const jk = await page.eval<{ H: number; T: number; low: number; obstacles: number[] }>('window.__gmRuntime.state().jump');
    ok('the jump is sized to the world: it clears its tallest jumpable obstacle by a third', jk.obstacles.filter((h) => h <= jk.low).every((h) => jk.H >= h * 1.3), `${jk.H} m apex, ${jk.T} s, jumpable up to ${jk.low} m: ${[...new Set(jk.obstacles)].join('/')}`);
    // timed so the top of the jump is over it: cleared, the run goes on
    await sleep(2500);   // at the race's pace, as a jump is taken
    const lu = await page.eval<J>('(() => { const D = window.__gmRuntime.debug, s = window.__gmRuntime.state(), v = s.speed; const r = D.lineUp(v * ' + jk.T + ' / 2); D.jump(); return r; })()');
    await sleep(1600); s = await st();
    ok('Space over a low obstacle clears it, and the run goes on', !!lu && s.alive && s.state === 'race', `${JSON.stringify(lu)} -> ${s.state}`);
    const peak = await page.eval<number>('(async () => { const D = window.__gmRuntime.debug; D.jump(); let m = 0; for (let i = 0; i < 30; i++) { await new Promise((r) => setTimeout(r, 30)); m = Math.max(m, window.__gmRuntime.state().y); } return m; })()');
    ok('the jump goes up to its height and comes down', peak > jk.H * 0.85 && peak <= jk.H + 0.05, `peak ${peak.toFixed(2)} of ${jk.H} m`);
    await sleep(800);
    // the same obstacle without a jump: the run is over
    await page.eval('window.__gmRuntime.debug.lineUp(6)'); await sleep(1800); s = await st();
    ok('without the jump, the same obstacle ends the run', !s.alive, s.state);
    await sleep(1200); await page.key('Enter'); await sleep(3500);

    console.log('\nhow far a bot gets (reported, not asserted)');
    const reached: number[] = [];
    for (let run = 0; run < 3; run++) {
      await page.eval('window.__gmRuntime.debug.autopilot(true); window.__gmRuntime.debug.timeScale(6)');
      for (let i = 0; i < 90; i++) { await sleep(400); s = await st(); if (!s.alive || s.level >= 20) break; }
      reached.push(s.level);
      console.log(`        run ${run + 1}: level ${s.level}${s.alive ? ' (still going)' : `, then hit ${s.crashedInto}`}`);
      await sleep(2600); await page.key('Enter'); await sleep(3500);
    }
  }, { timeoutMs: 300_000 });

  // the asset library, through the same runtime: a realistic athlete as the
  // player, a library sky for the light, and a missing id that must fall back
  console.log('\nthe asset library');
  const ref = readFileSync(new URL('../lib/runtime/reference-world.js', import.meta.url), 'utf8');
  const withLibrary = (ids: string[]) => ref
    .replace('GameMog.world({', `GameMog.world({\n  assets: ${JSON.stringify(ids)},\n  graphics: { environment: { hdri: 'hdri-sunset-city' } },`)
    .replace("return critter(ctx, '#F2E3C4', 'Pip');", "return ctx.assets.human('human-athlete-female', { skin: 'african', hair: 'afro01', outfit: { top: '#1F9D55', trim: '#F9D71C', shorts: '#111111', shoes: '#F9D71C', pattern: 'sash', bib: { name: 'TEST', number: '7' } } }) || critter(ctx, '#F2E3C4', 'Pip');");
  for (const [label, ids, expectHuman] of [['library athlete and sky', ['human-athlete-female', 'hdri-sunset-city'], true], ['an id that is not in the library', ['no-such-asset'], false]] as const) {
    const lid = randomUUID();
    insertDraft({ id: lid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: withLibrary([...ids]), meta: { title: 'Library Loop', tagline: 'Library check', blurb: 'Runtime check.', genre: 'Test', cast: [{ name: 'Test', color: '#1F9D55' }], palette: { sky: '#9CCBEB', ground: '#7DB356', accent: '#F28C28' }, runtime: 1 } });
    try {
      await withBrowser(async (page) => {
        await page.goto(`${BASE}/d/${lid}/play`);
        let ready = false;
        for (let i = 0; i < 150 && !ready; i++) { ready = await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false); if (!ready) await sleep(200); }
        const errs = await page.eval<string[]>('window.__gm.errors').catch(() => ['no page']);
        const warns = await page.eval<string[]>('window.__gm.warnings').catch(() => []);
        const s0 = await page.eval<{ assets: string[]; playerSkinned: boolean }>('window.__gmRuntime.state()');
        if (expectHuman) {
          ok(`${label}: boots, hash-checks and builds`, ready && errs.length === 0, errs.join(' | '));
          ok(`${label}: both assets are loaded`, s0.assets.length === 2, s0.assets.join(', '));
          ok(`${label}: the player is the skinned library athlete`, s0.playerSkinned);
          await page.eval('window.__gmRuntime.debug.start()'); await sleep(4500);
          await page.eval('window.__gmRuntime.debug.crashInto()'); await sleep(2600);
          const e2 = await page.eval<string[]>('window.__gm.errors');
          ok(`${label}: runs, sprints and falls without an error`, e2.length === 0, e2.join(' | '));
        } else {
          ok(`${label}: the world still boots`, ready && errs.length === 0, errs.join(' | '));
          ok(`${label}: it is reported, and the world's own fallback is used`, warns.some((w) => /not in the library/.test(w)) && !s0.playerSkinned, warns.join(' | '));
        }
      }, { timeoutMs: 90_000 });
    } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(lid); }
  }

  // cycling: banked tracks and the cyclist kit (a library athlete on a bike,
  // posed by IK), on a velodrome-shaped oval banked 42 degrees in the bends
  console.log('\ncycling: banking and the cyclist kit');
  const cid = randomUUID();
  const cycMeta = { title: 'Cycling Check', tagline: 'Banking and cyclists', blurb: 'Runtime check.', genre: 'Test', cast: [{ name: 'Lab', color: '#15264F' }], palette: { sky: '#9BC4E6', ground: '#7C8B6A', accent: '#E4002B' }, runtime: 1 };
  insertDraft({ id: cid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: readFileSync(new URL('../lib/runtime/cycling-world.js', import.meta.url), 'utf8'), meta: cycMeta });
  try {
    await withBrowser(async (page) => {
      const boot = async (url: string) => {
        await page.goto(url);
        for (let i = 0; i < 150; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready && window.__cyc)').catch(() => false)) break; await sleep(200); }
      };
      await boot(`${BASE}/d/${cid}/play`);
      const errs = await page.eval<string[]>('window.__gm.errors');
      const s0 = await page.eval<{ playerSkinned: boolean; lap: number }>('window.__gmRuntime.state()');
      ok('a banked world boots with cyclists and no errors', errs.length === 0 && s0.playerSkinned, errs.join(' | '));
      // the fourth value of a point banks the track: the frame's right-hand side climbs
      const banks = await page.eval<number[]>(`(() => { const t = window.__cyc.track, out = []; for (let d = 0; d < t.length; d += 4) out.push(t.frameAt(d).bank * 180 / Math.PI); return out; })()`);
      ok('the track banks to 42 degrees in the bends and about 12 on the straights', Math.max(...banks) > 40 && Math.max(...banks) < 44 && Math.min(...banks) > 10 && Math.min(...banks) < 14, `${Math.min(...banks).toFixed(1)} to ${Math.max(...banks).toFixed(1)}`);
      await page.eval('window.__gmRuntime.debug.start()'); await sleep(3800);
      await page.eval('window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.autopilot(true)');
      // measure every rider through a lap: the tilt from vertical where the track banks 40+
      const tilts: number[] = [], feet: number[] = [], hands: number[] = [];
      for (let i = 0; i < 30; i++) {
        await sleep(350);
        const m = await page.eval<{ tilt: number[]; foot: number[]; hand: number[] }>(`(() => {
          const out = { tilt: [], foot: [], hand: [] }, q = new THREE.Quaternion(), v = new THREE.Vector3(), w = new THREE.Vector3();
          window.__cyc.scene.children.forEach((c) => {
            const root = c.children && c.children[0], lean = root && root.children[0];
            if (!lean || !lean.children || lean.children.length !== 2) return;
            let pedal = null, foot = null, wrist = null;
            lean.traverse((o) => { if (o.isBone && o.name === 'foot_L') foot = o; if (o.isBone && o.name === 'wrist_L') wrist = o; if (o.isMesh && o.geometry.parameters && o.geometry.parameters.width === 0.075 && !pedal) pedal = o; });
            if (!foot || !pedal) return;
            c.getWorldQuaternion(q); const left = new THREE.Vector3(1, 0, 0).applyQuaternion(q), bank = Math.asin(-left.y) * 180 / Math.PI;
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(lean.getWorldQuaternion(new THREE.Quaternion()));
            if (bank > 40) out.tilt.push(Math.acos(up.y) * 180 / Math.PI);
            out.foot.push(foot.getWorldPosition(v).distanceTo(pedal.getWorldPosition(w)));
          });
          return out; })()`);
        tilts.push(...m.tilt); feet.push(...m.foot);
      }
      const maxTilt = Math.max(...tilts), minTilt = Math.min(...tilts);
      ok('riders lean into the banked bends like the boards, and no further', tilts.length > 3 && minTilt > 25 && maxTilt < 60, `${minTilt.toFixed(0)} to ${maxTilt.toFixed(0)} degrees over ${tilts.length} samples`);
      ok('feet stay on the pedals through the stroke', feet.length > 10 && Math.max(...feet) < 0.2, `within ${Math.max(...feet).toFixed(3)}m`);
      const e2 = await page.eval<string[]>('window.__gm.errors');
      ok('a lap of pedalling, leaning and sprinting raises no error', e2.length === 0, e2.join(' | '));
      // your own character rides the world's bike
      await boot(`${BASE}/d/${cid}/play?you=1${meFragment(sanitizeMe({ name: 'Rider', body: 'b', tone: '#C98E6B', hair: 'short02', build: 'slim', kit: { top: '#8B1E3F', trim: '#F4C542', pattern: 'band', number: '9' } }))}`);
      const sy = await page.eval<{ me: boolean; playerSkinned: boolean }>('window.__gmRuntime.state()');
      const bikes = await page.eval<number>(`(() => { let n = 0; window.__cyc.scene.traverse((o) => { if (o.isMesh && o.geometry.parameters && o.geometry.parameters.width === 0.075) n++; }); return n; })()`);
      ok('in a cycling world, you ride the bike too', sy.me && sy.playerSkinned && bikes >= 4, `me=${sy.me}, ${bikes / 2} bikes`);
    }, { timeoutMs: 150_000 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(cid); }

  // skating: mirror ice, the live broadcast, and the skater kit on its blades
  console.log('\nskating: mirror ice, the broadcast and the skater kit');
  const sid = randomUUID();
  const skMeta = { title: 'Skating Check', tagline: 'Mirror ice and skaters', blurb: 'Runtime check.', genre: 'Test', cast: [{ name: 'Lab', color: '#15264F' }], palette: { sky: '#9BC4E6', ground: '#EEF2F6', accent: '#E4002B' }, runtime: 1 };
  insertDraft({ id: sid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: readFileSync(new URL('../lib/runtime/skating-world.js', import.meta.url), 'utf8'), meta: skMeta });
  try {
    await withBrowser(async (page) => {
      const boot = async (url: string) => {
        await page.goto(url);
        for (let i = 0; i < 150; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready && window.__skate)').catch(() => false)) break; await sleep(200); }
      };
      await boot(`${BASE}/d/${sid}/play`);
      await sleep(1500);
      const errs = await page.eval<string[]>('window.__gm.errors');
      type R = { playerSkinned: boolean; render: { mirror: { on: boolean; frames: number; materials: number } | null; broadcast: { frames: number } | null } };
      const s0 = await page.eval<R>('window.__gmRuntime.state()');
      ok('a skating world boots with skaters and no errors', errs.length === 0 && s0.playerSkinned, errs.join(' | '));
      ok('the ice is a mirror: the scene is rendered again from under it every frame', !!s0.render.mirror && s0.render.mirror.on && s0.render.mirror.frames > 20 && s0.render.mirror.materials >= 1, JSON.stringify(s0.render.mirror));
      ok('the broadcast camera films the race for the big screens', !!s0.render.broadcast && s0.render.broadcast.frames > 10, JSON.stringify(s0.render.broadcast));
      await page.eval('window.__gmRuntime.debug.start()'); await sleep(3800);
      await page.eval('window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.autopilot(true)');
      // every skater, sampled through a lap: its lowest blade, each ankle's
      // distance to its boot's hinge, and the lean where the track bends
      const low: number[] = [], sink: number[] = [], ankles: number[] = [], tilts: number[] = [];
      for (let i = 0; i < 36; i++) {
        await sleep(300);
        const m = await page.eval<{ low: number[]; sink: number[]; ank: number[]; tilt: number[] }>(`(() => {
          const out = { low: [], sink: [], ank: [], tilt: [] }, b = new THREE.Box3(), v = new THREE.Vector3(), w = new THREE.Vector3();
          window.__skate.scene.children.forEach((c) => {
            const root = c.children && c.children[0];
            if (!root || !root.children || !root.children.some((k) => k.isPoints)) return;
            const skates = root.children.filter((k) => k.type === 'Group' && k.children.length === 2 && k.children[0].isMesh);
            let lowest = 9;
            skates.forEach((k, i) => {
              b.setFromObject(k.children[0], true); lowest = Math.min(lowest, b.min.y); out.sink.push(b.min.y);
              let foot = null; root.traverse((o) => { if (o.isBone && o.name === (i ? 'foot_R' : 'foot_L')) foot = o; });
              if (foot) out.ank.push(foot.getWorldPosition(v).distanceTo(k.children[1].getWorldPosition(w)));
            });
            out.low.push(lowest);
            const lean = root.children[0], up = new THREE.Vector3(0, 1, 0).applyQuaternion(lean.getWorldQuaternion(new THREE.Quaternion()));
            const p = c.getWorldPosition(v); if (Math.abs(p.x) > 60) out.tilt.push(Math.acos(Math.min(1, up.y)) * 180 / Math.PI);
          });
          return out; })()`);
        low.push(...m.low); sink.push(...m.sink); ankles.push(...m.ank); tilts.push(...m.tilt);
      }
      ok('a skater always has a blade on the ice', low.length > 20 && Math.max(...low) < 0.02, `highest lowest blade ${Math.max(...low).toFixed(3)}m over ${low.length} samples`);
      ok('and no blade sinks into it', Math.min(...sink) > -0.02, `${Math.min(...sink).toFixed(3)}m`);
      const ak = ankles.map((d) => Math.abs(d - ankles[0]));
      ok('ankles stay in their boots through the stroke', ankles.length > 20 && Math.max(...ak) < 0.03, `within ${Math.max(...ak).toFixed(3)}m`);
      ok('skaters lean into the bends', tilts.length > 3 && Math.max(...tilts) > 25 && Math.max(...tilts) < 55, `${tilts.length ? Math.min(...tilts).toFixed(0) : '-'} to ${tilts.length ? Math.max(...tilts).toFixed(0) : '-'} degrees`);
      const e2 = await page.eval<string[]>('window.__gm.errors');
      ok('a lap of skating raises no error', e2.length === 0, e2.join(' | '));
      await boot(`${BASE}/d/${sid}/play?you=1${meFragment(sanitizeMe({ name: 'Skater', body: 'b', tone: '#C98E6B', hair: 'short02', build: 'slim', kit: { top: '#8B1E3F', trim: '#F4C542', pattern: 'band', number: '9' } }))}`);
      const sy = await page.eval<{ me: boolean; playerSkinned: boolean }>('window.__gmRuntime.state()');
      const skaters = await page.eval<number>(`(() => { let n = 0; window.__skate.scene.traverse((o) => { if (o.isPoints && o.parent && o.parent.children.some((k) => k.type === 'Group' && k.children.length === 2)) n++; }); return n; })()`);
      ok('in a skating world, you skate too', sy.me && sy.playerSkinned && skaters >= 2, `me=${sy.me}, ${skaters} skaters`);
    }, { timeoutMs: 150_000 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(sid); }

  // combat and the bounty (the owner's platform options, 25 Sep): no coins,
  // a GM bounty for every lap, a sword that cuts rivals down, rivals who come
  // back from the line, and a touch that still ends a run
  console.log('\ncombat: the sword, the fallen, the bounty');
  const kid = randomUUID();
  const kMeta = { title: 'Combat Check', tagline: 'Swords out', blurb: 'Runtime check.', genre: 'Test', cast: [{ name: 'Kage', color: '#1C2230' }], palette: { sky: '#C9B8A6', ground: '#B9AE9F', accent: '#B8322A' }, runtime: 1 };
  insertDraft({ id: kid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: readFileSync(new URL('../lib/runtime/combat-world.js', import.meta.url), 'utf8'), meta: kMeta });
  try {
    await withBrowser(async (page) => {
      await page.goto(`${BASE}/d/${kid}/play`);
      for (let i = 0; i < 150; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready && window.__combat)').catch(() => false)) break; await sleep(200); }
      await sleep(1000);
      type K = { play: { coins: boolean; bounty: { base: number; step: number } | null; combat: boolean }; coins: number; slain: number; fallen: number; alive: boolean; level: number; gm: number; playerSword: boolean; crashedInto: string; x: number; d: number; lap: number;
        rivals: { k: number; out: boolean; inReach: boolean; mark: number | null; name: string; joinedFromLine: number }[] };
      const st = () => page.eval<K>('window.__gmRuntime.state()');
      const errs = await page.eval<string[]>('window.__gm.errors');
      await page.eval('window.__gmRuntime.debug.start()'); await sleep(3700);
      // the attract demo fights too; count only this run's moments
      await page.eval('Object.keys(window.__combat.seen).forEach((k) => { window.__combat.seen[k].length = 0; })');
      const s0 = await st();
      ok('a combat world boots with no errors and reads its options', errs.length === 0 && s0.play.combat && !s0.play.coins && s0.play.bounty?.base === 100, errs.join(' | ') || JSON.stringify(s0.play));
      ok('with coins off, no GM is laid on the track', s0.coins === 0, `${s0.coins} coins`);
      ok('the runner carries a sword', s0.playerSword);
      await page.eval('window.__gmRuntime.debug.rivalAt(1, 1.6, window.__gmRuntime.state().x + 1.2)'); await sleep(250);
      const s1 = await st();
      ok('a rival in reach wears the mark', s1.rivals[0].inReach && (s1.rivals[0].mark ?? 0) > 0.5, JSON.stringify(s1.rivals[0]));
      await page.eval('window.__gmRuntime.debug.swing()'); await sleep(450);
      const s2 = await st(), seen = await page.eval<{ slay: unknown[]; swing: unknown[] }>('window.__combat.seen');
      ok('a swing cuts it down, and the world hears both', s2.slain === 1 && s2.rivals[0].out && seen.slay.length === 1 && seen.swing.length === 1, `slain ${s2.slain}, out ${s2.rivals[0].out}, events ${seen.swing.length}/${seen.slay.length}`);
      await page.eval('window.__gmRuntime.debug.rivalAt(1, 0, window.__gmRuntime.state().x)'); await sleep(400);
      ok('a rival cut down cannot end your run', (await st()).alive);
      // a lap at speed: the bounty is paid and the fallen run again from the
      // line (the autopilot lets go before the line, or it would cut them again)
      await page.eval('window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.autopilot(true); window.__gmRuntime.debug.timeScale(8)');
      for (let i = 0; i < 200; i++) { const q = await st(); if (q.d % q.lap > q.lap - 70) break; await sleep(60); }
      await page.eval('window.__gmRuntime.debug.autopilot(false); window.__gmRuntime.debug.timeScale(2)');
      for (let i = 0; i < 200; i++) { if ((await st()).level >= 2) break; await sleep(30); }
      const s3 = await st(), laps = await page.eval<{ lap: number; bounty: number }[]>('window.__combat.seen.lap');
      await page.eval('window.__gmRuntime.debug.timeScale(1)');
      ok('each finished lap pays the bounty in GM', s3.level >= 2 && s3.gm >= 100 && laps[0]?.bounty === 100, `level ${s3.level}, gm ${s3.gm}, ${JSON.stringify(laps[0])}`);
      const back = s3.rivals.find((r) => r.k === 1);
      ok('rivals cut down run again from the line next lap', !!back && !back.out && back.joinedFromLine < 12 && s3.rivals.some((r) => r.k === 2), JSON.stringify(s3.rivals.map((r) => [r.k, r.out, Math.round(r.joinedFromLine)])));
      // a rival still standing ends the run on touch, sword or no sword
      await page.eval('window.__gmRuntime.debug.invincible(false)');
      const standing = (await st()).rivals.find((r) => !r.out);
      if (standing) await page.eval(`window.__gmRuntime.debug.rivalAt(${standing.k}, 0, window.__gmRuntime.state().x)`);
      await sleep(500);
      const s4 = await st();
      ok('touching a rival still standing ends the run', !!standing && !s4.alive && s4.crashedInto === standing.name, `${standing?.name} / ${s4.crashedInto}`);
      const e2 = await page.eval<string[]>('window.__gm.errors');
      ok('a run of cuts and laps raises no error', e2.length === 0, e2.join(' | '));
    }, { timeoutMs: 150_000 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(kid); }

  // the platform's score (lib/runtime/music.js): a world names a style, the
  // runtime composes a song, measures it, plays it at one loudness, builds it
  // with the race, ducks it under the effects and stops it at the end
  console.log('\nmusic: the platform score');
  const mid = randomUUID();
  const mCode = readFileSync(new URL('../lib/runtime/reference-world.js', import.meta.url), 'utf8').replace('GameMog.world({', "GameMog.world({ music: { style: 'anthem' },");
  insertDraft({ id: mid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: mCode, meta: { title: 'Score Check', tagline: 'Music', blurb: 'Runtime check.', genre: 'Test', cast: [{ name: 'Pip', color: '#F2E3C4' }], palette: { sky: '#9CCBEB', ground: '#7DB356', accent: '#F28C28' }, runtime: 1 } });
  try {
    await withBrowser(async (page) => {
      type Mu = { style: string; key: string; mode: string; tempo: number; measured: { lufs: number; peak: number } | null; gain: number | null; playing: boolean; energy: number | null; bar: number | null; duck: number | null };
      const mst = () => page.eval<{ music: Mu; state: string; level: number }>('window.__gmRuntime.state()');
      await page.goto(`${BASE}/d/${mid}/play`);
      for (let i = 0; i < 100; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
      let m = (await mst()).music;
      for (let i = 0; i < 25 && m && !m.measured; i++) { await sleep(200); m = (await mst()).music; }
      ok('a world that names a style gets a song in it', !!m && m.style === 'anthem' && m.key === 'D' && m.mode === 'major' && m.tempo === 128, m ? `${m.style}, ${m.key} ${m.mode}, ${m.tempo} bpm` : 'none');
      ok('its loudness is measured before anyone presses a key', !!m?.measured && isFinite(m.measured.lufs) && m.measured.lufs > -40 && m.measured.lufs < 0, m?.measured ? `${m.measured.lufs.toFixed(1)} LUFS` : 'not measured');
      // the tune: in the scale, and on the chord where the beat falls
      const sc = await page.eval<{ beat: number; scale: number[]; bars: { chord: number[]; lead: number[][] }[] }>('window.__gmRuntime.debug.musicScore()');
      let notes = 0, out = 0, strong = 0, fit = 0;
      sc.bars.forEach((b) => { const pcs = b.chord.map((x) => x % 12); b.lead.forEach((e) => { notes++; if (!sc.scale.includes(e[2] % 12)) out++; if (e[0] % sc.beat === 0) { strong++; if (pcs.includes(e[2] % 12)) fit++; } }); });
      ok('it is a tune: every note in the key, most beats on the chord', notes > 60 && out === 0 && fit / strong >= 0.8, `${notes} notes, ${out} outside the key, ${Math.round(fit / strong * 100)}% of beats on the chord`);
      ok('the tune comes back: an eight-bar A restated', JSON.stringify(sc.bars[4].lead) === JSON.stringify(sc.bars[12].lead) && JSON.stringify(sc.bars[4].lead) === JSON.stringify(sc.bars[8].lead));
      // every style composes and measures
      const styles = await page.eval<{ style: string; lufs: number | null; out: number }[]>(`(async () => { const r = []; for (const st of GameMogMusic.styles) { const S = GameMogMusic.read({ style: st }, 'check'), m = await GameMogMusic.measure(S), sc = GameMogMusic.score(S); let out = 0; sc.bars.forEach((b) => b.lead.forEach((e) => { if (!sc.scale.includes(e[2] % 12)) out++; })); r.push({ style: st, lufs: m ? m.lufs : null, out }); } return r; })()`);
      ok('every style composes in its key and measures', styles.length >= 9 && styles.every((x) => x.lufs !== null && isFinite(x.lufs) && x.out === 0), styles.map((x) => `${x.style} ${x.lufs?.toFixed(1)}`).join(', '));
      // play
      await page.eval(`window.postMessage({ source: 'gamemog-host', type: 'play' }, '*')`); await sleep(300);
      await page.eval('window.__gmRuntime.debug.audio()'); await sleep(1500);
      let s = await mst();
      const gdb = 20 * Math.log10(s.music.gain || 1e-9);
      ok('it plays at the platform level: measured loudness plus its gain is -16 LUFS', Math.abs(gdb + (s.music.measured?.lufs ?? 0) + 16) < 0.1, `${s.music.measured?.lufs.toFixed(1)} + ${gdb.toFixed(1)} dB`);
      ok('the start screen hears it quietly', s.state === 'title' && s.music.playing && s.music.energy === 0, `${s.state}, energy ${s.music.energy}`);
      await page.eval('window.__gmRuntime.debug.start(); window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.autopilot(true)'); await sleep(4200);
      s = await mst(); const bar0 = s.music.bar;
      ok('the race plays it louder', s.state === 'race' && s.music.playing && (s.music.energy ?? 0) >= 1, `energy ${s.music.energy}`);
      await page.eval("window.__gmRuntime.debug.sfx('coin')"); await sleep(30);
      const ducked = (await mst()).music.duck ?? 1; await sleep(700); const back = (await mst()).music.duck ?? 0;
      ok('it ducks under an effect and comes back', ducked < 0.9 && back > 0.95, `${ducked.toFixed(2)} -> ${back.toFixed(2)}`);
      await page.eval('window.__gmRuntime.debug.timeScale(6)');
      for (let i = 0; i < 120; i++) { s = await mst(); if (s.level >= 3) break; await sleep(200); }
      await page.eval('window.__gmRuntime.debug.timeScale(1)'); await sleep(4000); s = await mst();
      ok('every lap adds weight: flat out by lap 3', s.music.energy === 3 && s.music.bar !== bar0, `level ${s.level}, energy ${s.music.energy}, bar ${bar0} -> ${s.music.bar}`);
      await page.eval('window.__gmRuntime.debug.invincible(false); window.__gmRuntime.debug.autopilot(false); window.__gmRuntime.debug.crashInto()'); await sleep(2400);
      s = await mst();
      ok('a crash lets it fall away', !s.music.playing, `${s.state}, playing ${s.music.playing}`);
      const me = await page.eval<string[]>('window.__gm.errors');
      ok('a scored run raises no error', me.length === 0 && page.errors.length === 0, me.concat(page.errors).join(' | '));
      // a world with no music option plays no score
      await page.goto(`${BASE}/d/${id}/play`);
      for (let i = 0; i < 100; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
      ok('a world that asks for no music gets none', (await mst()).music === null);
    }, { timeoutMs: 150_000 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(mid); }

  // cars (play.vehicle, the owner's "car speeds, same rhythm", 25 Sep): the
  // car kit, speeds and distances 2.2 times a runner's, a car's hitbox, the
  // dash, live reflections, engines, and a recorded track from the library
  console.log('\ncars: play.vehicle, the car kit, live reflections, a recorded track');
  const vid = randomUUID();
  const vMeta = { title: 'Car Check', tagline: 'Cars on the platform', blurb: 'Runtime check.', genre: 'Test', cast: [{ name: 'Lab', color: '#BCC1C7' }], palette: { sky: '#101424', ground: '#16161A', accent: '#00D1C1' }, runtime: 1 };
  insertDraft({ id: vid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: readFileSync(new URL('../lib/runtime/vehicle-world.js', import.meta.url), 'utf8'), meta: vMeta });
  try {
    await withBrowser(async (page) => {
      type V = State & { scale: number; playerRadius: number; playerHalf: number; vehicle: { kind: string; kmh: number; gear: number; rpm: number; engine: boolean } | null;
        track: { id: string; lufs: number | null; loaded: boolean; playing: boolean; energy: number | null; gain: number | null; position: number | null } | null; render: { live: { on: boolean; frames: number } | null };
        rivals: (State['rivals'][number] & { name: string })[] };
      const vst = () => page.eval<V>('window.__gmRuntime.state()');
      await page.goto(`${BASE}/d/${vid}/play`);
      for (let i = 0; i < 150; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready && window.__veh)').catch(() => false)) break; await sleep(200); }
      await sleep(1200);
      const errs = await page.eval<string[]>('window.__gm.errors');
      const v0 = await vst();
      ok('a car world boots with its cars and no errors', errs.length === 0 && !!v0.vehicle && v0.vehicle.kind === 'hypercar', errs.join(' | '));
      ok('a library texture arrives as colour, normal and roughness maps', !!(await page.eval<{ texture: { map: boolean; normal: boolean; rough: boolean } | null }>('({ texture: window.__veh.texture })')).texture?.rough);
      ok('speeds and distances are 2.2 times a runner\'s (lap 1 cruises at 44 m/s)', v0.scale === 2.2 && Math.abs(v0.cruise - 44) < 0.01, `scale ${v0.scale}, cruise ${v0.cruise}`);
      ok('a lap of 1.4 km is a legal car lap (laps may run to 1,980 m)', v0.lap > 1300 && v0.lap < 1500, `${Math.round(v0.lap)}m`);
      ok('a car\'s hitbox is its footprint: long along the track, narrow across', v0.playerHalf > v0.playerRadius * 2, `half-length ${v0.playerHalf.toFixed(2)}, half-width ${v0.playerRadius.toFixed(2)}`);
      await page.eval('window.__gmRuntime.debug.audio(); window.__gmRuntime.debug.start()'); await sleep(3900);
      await page.eval('window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.autopilot(true)'); await sleep(2500);
      const v1 = await vst();
      ok('the dash shows speed and gear in the race', v1.vehicle!.kmh > 100 && v1.vehicle!.gear >= 2 && (await page.eval<boolean>('!!document.querySelector("#gm .speed") && document.querySelector("#gm .speed").style.display !== "none"')), `${v1.vehicle!.kmh} km/h in gear ${v1.vehicle!.gear}`);
      ok('the engine sings with the revs', v1.vehicle!.engine && v1.vehicle!.rpm > 4000, `${v1.vehicle!.rpm} rpm`);
      ok('live reflections render the street round the car, frame by frame', !!v1.render.live && v1.render.live.on && v1.render.live.frames > 10, JSON.stringify(v1.render.live));
      const nan = await page.eval<number>(`(() => { const I = window.__gmRuntime.debug.internals(), L = I.live, r = I.renderer, T = I.THREE, S = 256, buf = new Uint16Array(4 * S * S); let n = 0; for (let f = 0; f < 6; f++) { r.readRenderTargetPixels(L.rt, 0, 0, S, S, buf, f); for (let i = 0; i < buf.length; i++) { const v = T.DataUtils.fromHalfFloat(buf[i]); if (v !== v || !isFinite(v)) n++; } } return n; })()`);
      ok('the reflection cube holds no bad pixels (one would black out every car)', nan === 0, `${nan} NaN or infinite`);
      ok('the recorded track plays, opened up for the race, at the platform\'s loudness (its measured loudness plus its gain is -16 LUFS)', !!v1.track && v1.track.loaded && v1.track.playing && v1.track.energy! >= 1 && Math.abs(v1.track.lufs! + 20 * Math.log10(v1.track.gain!) + 16) < 0.2, JSON.stringify(v1.track));
      // the box, not a circle: alongside at 2.8 m (half-widths sum to 1.8) is clear; at 1.0 m it is contact
      await page.eval('window.__gmRuntime.debug.autopilot(false); window.__gmRuntime.debug.invincible(false)');
      const r1 = v1.rivals[0];
      const side = `(window.__gmRuntime.state().x > 0 ? -1 : 1)`;
      await page.eval(`window.__gmRuntime.debug.rivalAt(${r1.k}, 1.0, window.__gmRuntime.state().x + ${side} * 2.8)`);
      await sleep(80);
      const beside = await vst();
      ok('a car alongside, not touching, is not a crash', beside.alive, beside.crashedInto);
      // a rival right where the camera is: not drawn
      // (a first rival is slower than you: placed just ahead of the camera, it drifts back into it)
      await page.eval(`window.__gmRuntime.debug.rivalAt(${r1.k}, -5.8, window.__gmRuntime.state().x)`);
      await sleep(50);
      const near = await page.eval<{ dist: number; vis: boolean }>(`(() => { const I = window.__gmRuntime.debug.internals(), cam = I.camera.position; let best = null; I.scene.children.forEach((c) => { const m = c.children && c.children[0]; if (m && m.userData && m.userData.gmVehicle && c !== I.player.object) { const d = c.position.distanceTo(cam); if (!best || d < best.dist) best = { dist: +d.toFixed(2), vis: c.visible }; } }); return best; })()`);
      ok('a rival the camera would be inside is not drawn', !!near && near.dist < 2.8 && !near.vis, JSON.stringify(near));
      await page.eval(`window.__gmRuntime.debug.rivalAt(${r1.k}, 0.5, window.__gmRuntime.state().x + ${side} * 1.0)`);
      await sleep(200);
      const hit = await vst();
      ok('a car touching yours ends the run', !hit.alive && hit.crashedInto === r1.name, hit.crashedInto);
      await sleep(2200);
      const after = await vst();
      ok('the music stops with the run', !!after.track && !after.track.playing);
      // the field cycles the classes
      await page.eval('window.__gmRuntime.debug.start()'); await sleep(3900);
      await page.eval('window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.autopilot(true); window.__gmRuntime.debug.timeScale(6)');
      let v2 = await vst();
      for (let i = 0; i < 80 && v2.level < 5; i++) { await sleep(400); v2 = await vst(); }
      const kinds = await page.eval<string[]>(`(() => { const out = []; window.__veh.scene.children.forEach((c) => { const m = c.children[0]; if (m && m.userData && m.userData.gmVehicle && c !== window.__gmRuntime.debug.internals().player.object) out.push(m.children.length); }); return out.map(String); })()`);
      const e3 = await page.eval<string[]>('window.__gm.errors');
      ok('laps of cars racing (a single-seater, a stock car, a monster truck, a hypercar) raise no error', v2.level >= 5 && kinds.length >= 4 && e3.length === 0, `level ${v2.level}, ${kinds.length} rival cars${e3.length ? ', ' + e3.join(' | ') : ''}`);
    }, { timeoutMs: 180_000 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(vid); }

  // daylight and the library (the owner, 26 Sep: "lean into assets, AAA and
  // hyperrealism"): a photographed sky turned to the world's sea, scanned
  // surfaces at true scale, scanned models, the sea with its beach and surf,
  // an open roadster with one of the library's people at the wheel
  console.log('\ndaylight: a photographed sky, scanned surfaces and models, the sea, a person at the wheel');
  const did = randomUUID();
  const dMeta = { title: 'Daylight Check', tagline: 'The coast', blurb: 'Runtime check.', genre: 'Test', cast: [{ name: 'Lab', color: '#B01C22' }], palette: { sky: '#8EC3E8', ground: '#C8B48A', accent: '#FF5A36' }, runtime: 1 };
  insertDraft({ id: did, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: readFileSync(new URL('../lib/runtime/daylight-world.js', import.meta.url), 'utf8'), meta: dMeta });
  try {
    await withBrowser(async (page) => {
      await page.goto(`${BASE}/d/${did}/play`);
      for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready && window.__day)').catch(() => false)) break; await sleep(200); }
      await sleep(1500);
      const errs = await page.eval<string[]>('window.__gm.errors');
      ok('a coast world of library skies, surfaces, models and water boots with no errors', errs.length === 0, errs.join(' | '));
      const sky = await page.eval<{ view: number; rot: number; sun: number[]; haze: string | null }>(`(async () => { const I = window.__gmRuntime.debug.internals(), j = await fetch('/assets/sky-beach/asset.json').then((r) => r.json()); const m = I.skies.filter((k) => k.userData.gmSky)[0]; return { view: j.view, rot: m.rotation.y, sun: m.userData.sun.toArray(), haze: window.__day.haze }; })()`);
      const vphi = 2 * Math.PI * sky.view, vaz = Math.atan2(-Math.cos(vphi), Math.sin(vphi)), faced = Math.atan2(Math.sin(vaz + sky.rot - Math.PI / 2), Math.cos(vaz + sky.rot - Math.PI / 2));
      ok('a photographed beach is turned so its sea lies where the world\'s sea is (face: east)', Math.abs(faced) < 0.01, `off by ${faced.toFixed(3)} rad`);
      ok('the world is lit from the photograph\'s own sun, and fogged with its horizon', sky.sun[1] > 0.3 && !!sky.haze && sky.haze !== '#000000', `sun ${sky.sun.map((v) => v.toFixed(2))}, haze ${sky.haze}`);
      const surf = await page.eval<{ n: number; bad: number; sand: number; grass: number }>(`(() => { const I = window.__gmRuntime.debug.internals(); let n = 0, bad = 0, sand = -1, grass = -1; I.scene.traverse((m) => { const g = m.material && m.material.userData && m.material.userData.gmSurface; if (!g) return; n++; const p = I.renderer.properties.get(m.material).currentProgram; if (p && p.diagnostics && !p.diagnostics.runnable) bad++; if (g.id === 'texture-sand') sand = g.lean; if (g.id === 'texture-grass') grass = g.lean; }); return { n, bad, sand, grass }; })()`);
      ok('scanned surfaces laid on at true scale compile and draw (ground, beach, walls)', surf.n >= 3 && surf.bad === 0, JSON.stringify(surf));
      ok('a scan that leans (the sand, about 9 degrees) is measured and set level', surf.sand > 0.1 && surf.grass >= 0 && surf.grass < 0.05, `sand ${surf.sand}, grass ${surf.grass}`);
      const wat = await page.eval<{ water: boolean; beach: boolean; foam: boolean; models: Record<string, number> }>(`(() => { const W = window.__gmRuntime.debug.internals().water; return { water: !!W, beach: !!(W && W.beach), foam: !!(W && W.foam), models: window.__day.models }; })()`);
      ok('the sea has its beach and surf along the whole shore', wat.water && wat.beach && wat.foam, JSON.stringify(wat));
      ok('scanned models load as their parts (lamps, rocks, ferns)', wat.models.lamp >= 1 && wat.models.rocks === 6 && wat.models.fern === 4, JSON.stringify(wat.models));
      const drv = await page.eval<{ seated: boolean; kind: string; person: boolean; grip: number[]; beams: number }>(`(() => { const I = window.__gmRuntime.debug.internals(), P = window.__day.car, T = I.THREE, cp = P.cockpit; cp.body.updateMatrixWorld(true); const c = new T.Vector3().setFromMatrixPosition(cp.wheel.matrixWorld); const grip = ['L', 'R'].map((s) => +(P.driver.bones['wrist_' + s].getWorldPosition(new T.Vector3()).distanceTo(c) - cp.rimR).toFixed(3)); let beams = 0; I.scene.traverse((m) => { if (m.isMesh && m.geometry && m.geometry.type === 'ConeGeometry' && m.material && m.material.type === 'ShaderMaterial') beams++; }); return { seated: !!P.driver, kind: P.vehicle.kind, person: cp.person.every((m) => !m.visible), grip, beams }; })()`);
      ok('an open roadster takes one of the library\'s people at the wheel, in place of the helmeted driver', drv.seated && drv.kind === 'roadster' && drv.person, JSON.stringify(drv));
      ok('the driver\'s hands hold the rim of the wheel', drv.grip.every((d) => Math.abs(d) < 0.1), `wrists ${drv.grip.join(', ')} m off the rim`);
      ok('by day the headlights throw no beams', drv.beams === 0, `${drv.beams} beams`);
      await page.eval('window.__gmRuntime.debug.audio(); window.__gmRuntime.debug.start()'); await sleep(3900);
      await page.eval('window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.autopilot(true); window.__gmRuntime.debug.timeScale(4)');
      let d2 = await page.eval<State>('window.__gmRuntime.state()');
      for (let i = 0; i < 60 && d2.level < 3; i++) { await sleep(400); d2 = await page.eval<State>('window.__gmRuntime.state()'); }
      const e2 = await page.eval<string[]>('window.__gm.errors');
      ok('laps along the coast (roadsters, a single-seater, a stock car, a truck) raise no error', d2.level >= 3 && e2.length === 0, `level ${d2.level}${e2.length ? ', ' + e2.join(' | ') : ''}`);
      // a material whose shader cannot compile is reported, not silently invisible
      await page.eval(`(() => { const I = window.__gmRuntime.debug.internals(), T = I.THREE; const m = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.ShaderMaterial({ fragmentShader: 'void main() { gl_FragColor = vec4( notDeclared ); }' })); m.position.copy(I.camera.position).add(new T.Vector3(0, 0, -3).applyQuaternion(I.camera.quaternion)); m.frustumCulled = false; I.scene.add(m); })()`);
      await sleep(500);
      const e3 = await page.eval<string[]>('window.__gm.errors');
      ok('a shader that will not compile is reported as an error', e3.some((e) => /did not compile/.test(e)), e3.join(' | '));
      // a shore walked the wrong way round (the sea on the track's side) is turned
      // round, and the road is never under water, however close the shore
      const dayCode = readFileSync(new URL('../lib/runtime/daylight-world.js', import.meta.url), 'utf8');
      const wrong = dayCode.replace('shore.reverse(); // walked north to south, the water lies on the line\'s left', '// walked south to north: the sea on the right (wrong way round)');
      ok('the check\'s coast can be walked the wrong way round', wrong !== dayCode);
      db.prepare('UPDATE drafts SET code = ? WHERE id = ?').run(wrong, did);
      await page.goto(`${BASE}/d/${did}/play`);
      for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready && window.__day)').catch(() => false)) break; await sleep(200); }
      await sleep(800);
      const turned = await page.eval<{ warned: boolean; road: number; sea: number; errors: string[] }>(`(() => { const I = window.__gmRuntime.debug.internals(), W = I.water, U = W.U, img = U.uMask.value.image, g = img.getContext('2d'); const px = (x, z) => { const u = (x - U.uMaskMin.value.x) / U.uMaskSize.value * img.width, v = (z - U.uMaskMin.value.y) / U.uMaskSize.value * img.height; return g.getImageData(Math.floor(u), Math.floor(v), 1, 1).data[0]; }; return { warned: window.__gm.warnings.some((w) => /turned round/.test(w)), road: px(70, 0), sea: px(300, 0), errors: window.__gm.errors }; })()`);
      ok('a shore walked with the sea on the track\'s side is turned round: the road is land, the sea lies beyond the beach', turned.warned && turned.road < 40 && turned.sea > 215 && turned.errors.length === 0, JSON.stringify(turned));
    }, { timeoutMs: 260_000 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(did); }

  // open worlds (the owner, 27 Sep: "a GTA blueprint game builder"): Miami OG on
  // the Ocean Drive map, roamed on foot, people who come and fight, the heat,
  // the police and a boss, and a knockout that ends the run with the time survived
  console.log('\nopen worlds: the Ocean Drive map, the fight, the heat, survival');
  const owid = randomUUID();
  insertDraft({ id: owid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: readFileSync(new URL('../worlds/zombie-beach.js', import.meta.url), 'utf8'),
    meta: { title: 'Open Check', tagline: 'Survive', blurb: 'Runtime check.', genre: 'Open World', cast: [{ name: 'OG', color: '#FF3D7F' }], palette: { sky: '#F2A36B', ground: '#C8B48A', accent: '#FF3D7F' }, runtime: 1, scoring: 'survival' } });
  try {
    await withBrowser(async (page) => {
      type OS = { heat: number; time: number; kos: number; gm: number; boss: { name: string } | null; player: { x: number; z: number; hp: number; max: number; ko: boolean }; enemies: { kind: string; ko: boolean; d: number }[]; civilians: number; police: string[]; map: string; ready: boolean; colliders: { boxes: number; circles: number } };
      const os = () => page.eval<OS>('window.__gmRuntime.state().open');
      await page.goto(`${BASE}/d/${owid}/play`);
      for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
      const e0 = await page.eval<string[]>('window.__gm.errors');
      let o = await os();
      ok('an open world builds on its library map, with its colliders and its street crowd, and no errors', o.ready && o.map === 'ocean-drive' && o.colliders.boxes > 300 && o.civilians > 0 && e0.length === 0, `${o.colliders.boxes} boxes, ${o.colliders.circles} circles, ${o.civilians} people${e0.length ? ', ' + e0.join(' | ') : ''}`);
      await page.eval('window.__gmRuntime.debug.audio(); window.__gmRuntime.debug.start()'); await sleep(600);
      const p0 = (await os()).player;
      await page.key('KeyW', 'keyDown'); await sleep(1200); await page.key('KeyW', 'keyUp');
      const p1 = (await os()).player;
      ok('W walks you across the street, the way the camera looks', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 2.5, `${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1)} m`);
      // the jump on foot (it replaced the roll): up to three quarters of the hero's height, and down again
      const jp = await page.eval<{ g: number; top: number; end: number }>('(async () => { const O = window.__gmRuntime.debug.open(), y0 = window.__gmRuntime.state().open.player.y; O.jump(); let m = 0; for (let i = 0; i < 34; i++) { await new Promise((r) => setTimeout(r, 30)); m = Math.max(m, window.__gmRuntime.state().open.player.y - y0); } return { g: y0, top: m, end: window.__gmRuntime.state().open.player.y - y0 }; })()');
      ok('Space jumps (no roll): up most of a metre and more, and back down', jp.top > 1.0 && jp.top < 1.8 && Math.abs(jp.end) < 0.05, JSON.stringify(jp));
      // they come for you, and they hit
      await page.eval('window.__gmRuntime.debug.open().spawn("thug"); window.__gmRuntime.debug.open().spawn("thug")');
      let hurt = false;
      for (let i = 0; i < 40 && !hurt; i++) { await sleep(250); o = await os(); hurt = o.player.hp < o.player.max; }
      ok('the people who come for you fight: their punches take your health', hurt, `${o.player.hp}/${o.player.max}`);
      // you hit back: a knockout spills GM, and you pick it up
      await page.eval('window.__gmRuntime.debug.invincible(true)');
      for (let i = 0; i < 60 && (o.kos < 1 || o.gm < 1); i++) { await page.eval('window.__gmRuntime.debug.open().punch()'); await sleep(260); o = await os(); }
      ok('punches knock them out, and their GM comes to you', o.kos >= 1 && o.gm >= 1, `${o.kos} knockouts, ${o.gm} GM`);
      // hidden weapons (the owner, 28 Sep): about the map, taken by walking over one, worn down by use
      type OW2 = OS & { weapon: { kind: string; hits: number; max: number } | null; pickups: { kind: string; dropped: boolean }[]; player: { x: number; z: number; wet: number; stance: string } };
      const ow2 = () => page.eval<OW2>('window.__gmRuntime.state().open');
      let w2 = await ow2();
      ok('weapons are hidden about the map', w2.pickups.filter((q) => !q.dropped).length >= 6, w2.pickups.map((q) => q.kind).join(', '));
      await page.eval('window.__gmRuntime.debug.open().weapon("pipe")');
      for (let i = 0; i < 20 && !(w2 = await ow2()).weapon; i++) await sleep(100);
      ok('walking over one puts it in your hand', w2.weapon?.kind === 'pipe', JSON.stringify(w2.weapon));
      await page.eval('window.__gmRuntime.debug.open().spawn("thug")');
      const h0 = w2.weapon?.hits ?? 0;
      for (let i = 0; i < 40 && ((w2 = await ow2()).weapon?.hits ?? 0) >= h0; i++) { await page.eval('window.__gmRuntime.debug.open().punch()'); await sleep(260); }
      ok('an armed swing lands and wears the weapon down', (w2.weapon?.hits ?? 0) < h0, `${h0} -> ${w2.weapon?.hits}`);
      // the edges are walls: an alley runs back to one; the sea is yours to the buoys
      const walk = async (x: number, z: number, yaw: number, ms: number) => { await page.eval(`window.__gmRuntime.debug.open().place(${x}, ${z}, ${yaw}, 0.3)`); await page.key('KeyW', 'keyDown'); await sleep(ms); await page.key('KeyW', 'keyUp'); return (await ow2()).player; };
      await page.eval('window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.open().clear()');
      const al = await walk(-36, 25.9, Math.PI / 2, 3600);
      // (it failed about one run in three: after the big fight the camera kept turning to where the fight had been,
      // and W follows the camera, so the walk turned back; 2 Oct, the camera lets a finished fight go)
      ok('an alley runs back to a wall, and the wall stops you', al.x < -49.3 && al.x > -50.2, `stopped at x ${al.x.toFixed(2)}`);
      await page.eval('window.__gmRuntime.debug.open().clear()');
      const sea = await walk(97, 150, -Math.PI / 2, 4200);
      ok('you can wade into the sea, as far as the buoys', sea.wet > 0.3 && sea.x < 104.2 && sea.x > 102, `x ${sea.x.toFixed(2)}, ${sea.wet} m deep`);
      // the heat: the police by patrol car and a boss
      await page.eval('window.__gmRuntime.debug.open().heat(3)');
      let boss = false, police = false;
      for (let i = 0; i < 40 && !(boss && police); i++) { await sleep(300); o = await os(); boss = boss || !!o.boss; police = police || o.police.length > 0; }
      ok('heat 3 brings a patrol car and a named boss', boss && police, `boss ${o.boss ? o.boss.name : 'none'}, police ${JSON.stringify(o.police)}`);
      const f0 = await page.eval<number>('performance.now()'), n0 = await page.eval<number>('new Promise((r) => { let n = 0, t = performance.now(); (function f(now) { n++; if (now - t < 2000) requestAnimationFrame(f); else r(n); })(t); })');
      void f0;
      ok('a street fight at heat 3 holds its frame rate', n0 / 2 >= 45, `${Math.round(n0 / 2)} fps`);
      // knocked out: the run ends with the time survived
      await page.eval('window.__gmRuntime.debug.invincible(false); window.__gmRuntime.debug.open().hurt(9999)');
      await sleep(3200);
      const res = await page.eval<{ survival?: boolean; timeMs: number; level: number }[]>('window.__gm.results || []');
      const last = res[res.length - 1];
      ok('a knockout ends the run with the time survived', !!last && !!last.survival && last.timeMs > 3000 && last.level >= 3, JSON.stringify(last));
      // the opening scene (the owner, 28 Sep): letterboxed, skippable, and the crew it shows is there when the run begins
      await page.eval('window.__gmRuntime.debug.open().intro()');
      await sleep(1500);
      const ix = await page.eval<{ shot: number } | null>('window.__gmRuntime.debug.open().introState()');
      await page.key('Enter'); await sleep(600);
      const after = await page.eval<{ ix: unknown; enemies: number; boards: string }>('({ ix: window.__gmRuntime.debug.open().introState(), enemies: window.__gmRuntime.state().open.enemies.filter((e) => !e.ko).length, boards: [...document.querySelectorAll(".board small")].map((e) => e.textContent).join(",") })');
      ok('an opening scene plays before the run, and Enter skips it into the run with its crew', !!ix && after.ix === null && after.enemies >= 3 && /Vaccine fund/.test(after.boards), `${JSON.stringify(ix)} -> ${JSON.stringify(after)}`);
      // the goal (the owner, 28 Sep): 10,000 GM buys the vaccine; the doctor's scene plays and the run ends won
      await page.eval('window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.open().ending()');
      await sleep(1200);
      const endScene = await page.eval<unknown>('window.__gmRuntime.debug.open().introState()');
      await page.key('Enter'); await sleep(900);
      const won = await page.eval<{ won?: boolean; goal?: boolean; gm: number }[]>('window.__gm.results || []');
      const lastWon = won[won.length - 1];
      ok('reaching the goal plays the closing scene and ends the run won', !!endScene && !!lastWon && lastWon.won === true && lastWon.goal === true && lastWon.gm >= 10000, JSON.stringify(lastWon));
      const e1 = await page.eval<string[]>('window.__gm.errors');
      ok('a whole open-world run raises no error', e1.length === 0, e1.join(' | '));
    }, { timeoutMs: 200_000 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(owid); }

  // the derby (the owner, 1 Oct: Mog Derby): an open world on wheels, car combat in an arena
  console.log('\nthe derby: Mog Derby, a truck, rams, guns, spins and wrecks');
  const dwid = randomUUID();
  insertDraft({ id: dwid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: readFileSync(new URL('../worlds/mog-derby.js', import.meta.url), 'utf8'),
    meta: { title: 'Derby Check', tagline: 'Wreck them', blurb: 'Runtime check.', genre: 'Open World', cast: [{ name: 'Scoops', color: '#F0468C' }], palette: { sky: '#0E1428', ground: '#8A6A4A', accent: '#F0468C' }, runtime: 1, scoring: 'survival' } });
  try {
    await withBrowser(async (page) => {
      type DC = { kind: string; name: string; armor: number; wreck: boolean; x: number; z: number; mode: string | null };
      type DS = { heat: number; kos: number; gm: number; boss: { name: string } | null; ready: boolean; player: { x: number; z: number; ko: boolean };
        derby: { speed: number; armor: number; guns: number; hot: boolean; spins: number; wrecks: number; log: string[]; cars: DC[] } };
      const ds = () => page.eval<DS>('window.__gmRuntime.state().open');
      const dbg = (js: string) => page.eval(`(() => { const D = window.__gmRuntime.debug, O = D.open(); ${js} })()`);
      await page.goto(`${BASE}/d/${dwid}/play`);
      for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
      const e0 = await page.eval<string[]>('window.__gm.errors');
      let d = await ds();
      ok('a derby builds: you drive a truck in an arena, with no errors', d.ready && !!d.derby && e0.length === 0, `${JSON.stringify(d.derby && { armor: d.derby.armor, guns: d.derby.guns })}${e0.length ? ', ' + e0.join(' | ') : ''}`);
      await page.eval('window.__gmRuntime.debug.audio(); window.__gmRuntime.debug.start()'); await sleep(500);
      await dbg('D.invincible(true); O.clear();');
      // W drives, S brakes and then reverses
      const p0 = (await ds()).player;
      await page.key('KeyW', 'keyDown'); await sleep(2200); d = await ds(); await page.key('KeyW', 'keyUp');
      const p1 = d.player, fwd = d.derby.speed;
      ok('W drives the truck: it gathers speed and covers ground', fwd > 6 && Math.hypot(p1.x - p0.x, p1.z - p0.z) > 6, `${fwd} m/s, ${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1)} m`);
      await page.key('KeyS', 'keyDown'); await sleep(3200); d = await ds(); await page.key('KeyS', 'keyUp');
      ok('S brakes, then backs up', d.derby.speed < -1, `${d.derby.speed} m/s`);
      // a crew car rams you: your armour goes down
      await dbg('D.invincible(false); O.clear(); O.place(-20, 0, -Math.PI / 2, 0.2, false, Math.PI / 2); O.car("thug", 22, 0, Math.PI);');
      let rammed = false;
      for (let i = 0; i < 50 && !rammed; i++) { await sleep(250); d = await ds(); rammed = d.derby.armor < 100; }
      ok('a crew car comes at you and its hits dent your armour', rammed, `armor ${d.derby.armor}`);
      // your guns: held, they fire, the rounds hit, the guns heat
      await dbg('D.invincible(true); O.clear(); O.place(-20, 0, -Math.PI / 2, 0.2, false, Math.PI / 2); O.car("thug", 16, 0, Math.PI / 2, true);');
      await sleep(300);
      const a0 = (await ds()).derby.cars[0]?.armor ?? 0;
      await page.key('KeyJ', 'keyDown'); await sleep(1600); d = await ds(); await page.key('KeyJ', 'keyUp');
      const a1 = d.derby.cars[0]?.armor ?? 0;
      ok('J fires the roof guns: rounds hit the car ahead, and the guns heat', a1 < a0 && d.derby.guns > 0.2, `armor ${a0} -> ${a1}, heat ${d.derby.guns}`);
      // a hit on a car's back corner spins it, and a spin you cause pays
      await dbg('O.clear(); O.place(-30, 0, -Math.PI / 2, 0.2, false, Math.PI / 2); O.car("biker", 16, -2.6, Math.PI / 2, true);');
      const g0 = (await ds()).gm;
      await page.key('KeyW', 'keyDown'); await sleep(3000); await page.key('KeyW', 'keyUp'); await sleep(2500);
      d = await ds();
      const spun = d.derby.log.filter((s) => /^you>/.test(s)).map((s) => +s.split(':')[1]);
      ok('ramming a car\'s back corner spins it, and the spin pays GM', d.derby.spins >= 1 && d.gm > g0, `${JSON.stringify(spun)}, ${d.derby.spins} spins, ${g0} -> ${d.gm} GM`);
      // wrecks: the pilot rams and shoots until one is done; the wreck pays and spills GM
      await dbg('O.clear(); D.autopilot(true); D.timeScale(3);');
      for (let i = 0; i < 80 && (d.derby.wrecks < 1); i++) { await sleep(400); d = await ds(); }
      ok('wrecking a car pays GM and counts', d.derby.wrecks >= 1 && d.kos >= 1 && d.gm > 0, `${d.derby.wrecks} wrecks, ${d.kos} out, ${d.gm} GM`);
      await dbg('D.timeScale(1);');
      // the heat: the sheriff's cruisers and a monster truck with a name
      await dbg('O.heat(3);');
      let bossOn = false, copOn = false;
      for (let i = 0; i < 40 && !(bossOn && copOn); i++) { await sleep(300); d = await ds(); bossOn = bossOn || !!d.boss; copOn = copOn || d.derby.cars.some((c) => c.kind === 'cop'); }
      ok('heat 3 brings the sheriff and a monster truck with a name', bossOn && copOn, `boss ${d.boss ? d.boss.name : 'none'}, cars ${d.derby.cars.map((c) => c.kind).join(',')}`);
      const n0 = await page.eval<number>('new Promise((r) => { let n = 0, t = performance.now(); (function f(now) { n++; if (now - t < 2000) requestAnimationFrame(f); else r(n); })(t); })');
      ok('a derby at heat 3 holds its frame rate', n0 / 2 >= 45, `${Math.round(n0 / 2)} fps`);
      // wrecked: the run ends with the time survived
      await dbg('D.autopilot(false); D.invincible(false); O.hurt(9999);');
      await sleep(3400);
      const res = await page.eval<{ survival?: boolean; timeMs: number; kos: number }[]>('window.__gm.results || []');
      const last = res[res.length - 1];
      const words = await page.eval<string>('document.querySelector("#gm .screen") ? document.querySelector("#gm .screen").textContent : ""');
      ok('your truck wrecked ends the run, in the derby\'s words', !!last && !!last.survival && /Wrecked/.test(words) && /Wrecks/.test(words), `${JSON.stringify(last)} ${words.slice(0, 60)}`);
      // the opening scene, its cars driving in, skipped into the run with them; then the goal and the closing scene
      await dbg('O.intro();'); await sleep(14000);
      const ixs = await page.eval<{ shot: number; cast: string[] } | null>('window.__gmRuntime.debug.open().introState()');
      await page.key('Enter'); await sleep(700);
      d = await ds();
      ok('the opening scene drives the derby\'s cars in, and Enter starts the run with them', !!ixs && ixs.cast.length >= 3 && d.derby.cars.filter((c) => !c.wreck).length >= 3, `${JSON.stringify(ixs)} -> ${d.derby.cars.length} cars`);
      await dbg('D.invincible(true); O.ending();'); await sleep(1200);
      const endIx = await page.eval<unknown>('window.__gmRuntime.debug.open().introState()');
      await page.key('Enter'); await sleep(900);
      const won = await page.eval<{ won?: boolean; goal?: boolean; gm: number }[]>('window.__gm.results || []');
      const lastWon = won[won.length - 1];
      ok('10,000 GM plays the closing scene and the run ends won', !!endIx && !!lastWon && lastWon.won === true && lastWon.gm >= 10000, JSON.stringify(lastWon));
      const e1 = await page.eval<string[]>('window.__gm.errors');
      ok('a whole derby raises no error', e1.length === 0, e1.join(' | '));
    }, { timeoutMs: 240_000 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(dwid); }

  // an open world on its own ground registers its colliders while it builds (the API's
  // word); they reached the open world's collision only after it started (1 Oct)
  console.log('\nopen worlds on their own ground: colliders registered while building');
  const swid = randomUUID();
  insertDraft({ id: swid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: readFileSync(new URL('../lib/runtime/open-solid-world.js', import.meta.url), 'utf8'),
    meta: { title: 'Solid Check', tagline: 'Walls', blurb: 'Runtime check.', genre: 'Open World', cast: [{ name: 'Tester', color: '#FF7A3D' }], palette: { sky: '#9CC0E0', ground: '#A79C88', accent: '#FF7A3D' }, runtime: 1, scoring: 'survival' } });
  try {
    await withBrowser(async (page) => {
      type SO = { kos: number; ready: boolean; player: { x: number; z: number }; colliders: { boxes: number; circles: number; early: number } };
      const so = () => page.eval<SO>('window.__gmRuntime.state().open');
      await page.goto(`${BASE}/d/${swid}/play`);
      for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
      const e0 = await page.eval<string[]>('window.__gm.errors'), built = await page.eval<{ open: boolean; heat: number }>('self.__solids');
      let o = await so();
      ok('ctx.solid and ctx.open are there while the world builds, and no error', !!built && built.open && built.heat === 1 && e0.length === 0, `${JSON.stringify(built)}${e0.length ? ' ' + e0.join(' | ') : ''}`);
      ok('a box, a circle and an object registered while building all reach the collision', o.colliders.early === 3 && o.colliders.boxes >= 2 && o.colliders.circles >= 1, JSON.stringify(o.colliders));
      await page.eval('window.__gmRuntime.debug.start()'); await sleep(500);
      await page.eval('window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.open().clear()');
      const walk = async (x: number, z: number, cam: number, face: number, ms: number) => { await page.eval(`window.__gmRuntime.debug.open().clear(); window.__gmRuntime.debug.open().place(${x}, ${z}, ${cam}, 0.2, false, ${face})`); await page.key('KeyW', 'keyDown'); await sleep(ms); await page.key('KeyW', 'keyUp'); await sleep(150); return (await so()).player; };
      const east = await walk(0, 0, -Math.PI / 2, Math.PI / 2, 2600);
      ok('walking into the wall (a box) stops you at its face', east.x > 5.3 && east.x < 5.8 && Math.abs(east.z) < 0.6, `x ${east.x.toFixed(2)} (face at 6)`);
      const west = await walk(0, 0, Math.PI / 2, -Math.PI / 2, 2600);
      ok('walking into the post (a circle) stops you at its edge', west.x < -4.2 && west.x > -4.7, `x ${west.x.toFixed(2)} (edge at -4.8)`);
      const north = await walk(0, 0, 0, Math.PI, 2600);
      ok('walking into the crate (an object, measured) stops you at its side', north.z < -5.9 && north.z > -6.4, `z ${north.z.toFixed(2)} (side at -6.5)`);
      const edge = await walk(12, -10, 0, Math.PI, 5000);
      ok('the edge of the world still holds', edge.z > -29.9 && edge.z < -29.4, `z ${edge.z.toFixed(2)} (edge at -30)`);
      await page.eval('window.__gmRuntime.debug.open().clear(); window.__gmRuntime.debug.open().place(12, 0, -Math.PI / 2, 0.2, false, Math.PI / 2); window.__gmRuntime.debug.open().spawn("thug")');
      for (let i = 0; i < 60 && (o = await so()).kos < 1; i++) { await page.eval('window.__gmRuntime.debug.open().punch()'); await sleep(260); }
      ok('and a fight still works among them', o.kos >= 1, `${o.kos} knockouts`);
      const e1 = await page.eval<string[]>('window.__gm.errors');
      ok('no errors', e1.length === 0, e1.join(' | '));
    }, { timeoutMs: 120_000 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(swid); }

  // light (1 Oct): presets are opt-in, so a world without one is drawn exactly as before; under
  // one, a photographed sky is exposed to the preset's brightness whatever the photograph; lamps
  // in physical units are told about, never changed; and the look measures the player and the glare
  console.log('\nlight: opt-in presets, light units, and what the look measures');
  const solidSrc = readFileSync(new URL('../lib/runtime/open-solid-world.js', import.meta.url), 'utf8');
  const lit = (extra: string, graphics: string) => solidSrc
    .replace("assets: ['human-athlete-male'],", `assets: ['human-athlete-male', 'sky-overcast'],${graphics}`)
    .replace('self.__solids =', `${extra} self.__solids =`);
  type Lit = { sky: number; env: number | null; exposure: number; warnings: string[]; look: Record<string, number> | null };
  const litOf = async (code: string) => {
    const lid = randomUUID();
    insertDraft({ id: lid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code,
      meta: { title: 'Light Check', tagline: 'Light', blurb: 'Runtime check.', genre: 'Open World', cast: [{ name: 'Tester', color: '#FF7A3D' }], palette: { sky: '#9CC0E0', ground: '#A79C88', accent: '#FF7A3D' }, runtime: 1, scoring: 'survival' } });
    try {
      return await withBrowser(async (page) => {
        await page.goto(`${BASE}/d/${lid}/play`);
        for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
        await page.eval('window.__gmRuntime.debug.start()'); await sleep(1200);
        return page.eval<Lit>(`(() => { const I = window.__gmRuntime.debug.internals(), sk = I.skies[I.skies.length - 1];
          return { sky: sk && sk.material.color ? +sk.material.color.r.toFixed(3) : -1, env: I.scene.environment ? 1 : null, exposure: +I.renderer.toneMappingExposure.toFixed(2),
            warnings: window.__gm.warnings || [], look: window.__gmRuntime.debug.look() }; })()`);
      }, { timeoutMs: 120_000 });
    } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(lid); }
  };
  const sky = "ctx.sky({ hdri: 'sky-overcast', sun: [0.4, 0.6, 0.3] });";
  const plain = await litOf(lit(sky, ' graphics: { environment: true },'));
  ok('without a preset, a photographed sky is drawn as it always was (exposure 1)', plain.sky === 1 && plain.exposure === 1, `sky ${plain.sky}, exposure ${plain.exposure}`);
  const day = await litOf(lit(sky, " graphics: { preset: 'daylight' },"));
  ok('under a preset, the overcast sky (it washes out at 1) is exposed down to the preset\'s brightness', day.sky > 0.3 && day.sky < 0.65 && day.env === 1, `sky ${day.sky} (its 90th percentile is 1.84; daylight wants 0.85)`);
  const set = await litOf(lit("ctx.sky({ hdri: 'sky-overcast', sun: [0.4, 0.6, 0.3], exposure: 0.8 });", " graphics: { preset: 'daylight', exposure: 1.3 },"));
  ok('what a world sets itself wins over its preset', set.sky === 0.8 && set.exposure === 1.3, `sky ${set.sky}, exposure ${set.exposure}`);
  const bad = await litOf(lit(sky, " graphics: { preset: 'sunrise' },"));
  ok('an unknown preset is ignored, and the builder is told', bad.sky === 1 && bad.warnings.some((w) => /graphics.preset "sunrise"/.test(w)), bad.warnings.join(' | ').slice(0, 120));
  const loud = await litOf(lit(sky + " var lamp = new T.PointLight('#FFD9A0', 380); lamp.position.set(0, 3, 4); ctx.scene.add(lamp);", ' graphics: { environment: true },'));
  ok('a lamp in physical units is told about (and left as it is)', loud.warnings.some((w) => /PointLight has intensity 380/.test(w)) && !plain.warnings.some((w) => /legacy light units/.test(w)), loud.warnings.join(' | ').slice(0, 120));
  const lk = day.look ?? {};
  ok('the look measures the glare and the player: how much shows, and how far it stands from its background', ['clipped', 'floor', 'player', 'seen', 'apart'].every((k) => Number.isFinite(lk[k])) && lk.player > 0.001 && lk.seen > 0.9 && lk.apart > 0, JSON.stringify(lk));

  // the creator's options (Create and Mog, the owner, 26 Sep): obstacles each
  // lap fewer, the same or more, and music, enforced by the runtime from the
  // page, whatever the world's code says
  console.log('\nthe creator\'s options: obstacles each lap, music');
  const refWorld = readFileSync(new URL('../lib/runtime/reference-world.js', import.meta.url), 'utf8');
  const optMeta = (options: unknown) => ({ title: 'Options Check', tagline: 'Options', blurb: 'Runtime check.', genre: 'Test', cast: [{ name: 'Pip', color: '#F2E3C4' }], palette: { sky: '#9CCBEB', ground: '#7DB356', accent: '#F28C28' }, runtime: 1, options });
  const oids: string[] = [];
  try {
    await withBrowser(async (page) => {
      type O = State & { hazards: { mode: string; base: number; copies: number }; track: { id: string; playing: boolean } | null };
      const boot = async (options: unknown) => {
        const oid = randomUUID(); oids.push(oid);
        insertDraft({ id: oid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: refWorld, meta: optMeta(options) });
        await page.goto(`${BASE}/d/${oid}/play`);
        for (let i = 0; i < 100; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
        await page.eval('window.__gmRuntime.debug.start()'); await sleep(3800);
        await page.eval('window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.autopilot(true); window.__gmRuntime.debug.timeScale(6)');
      };
      const upTo = async (lvl: number) => { let s = await page.eval<O>('window.__gmRuntime.state()'); for (let i = 0; i < 90 && s.level < lvl; i++) { await sleep(300); s = await page.eval<O>('window.__gmRuntime.state()'); } await sleep(300); return page.eval<O>('window.__gmRuntime.state()'); };
      // no two obstacles in one row: the gap a player needs is always there
      const rows = () => page.eval<number>(`(() => { const I = window.__gmRuntime.debug.internals(), o = I.obstacles.slice().sort((a, b) => a.d - b.d); let n = 0; for (let i = 1; i < o.length; i++) { if (o[i].copy || o[i - 1].copy) { if (o[i].d - o[i - 1].d < 3.5 + o[i].half + o[i - 1].half) n++; } } return n; })()`);
      await boot({ hazards: 'more', music: null });
      const m1 = await page.eval<O>('window.__gmRuntime.state()');
      const m4 = await upTo(4);
      ok('"More": the obstacles grow every lap (about 15% a lap), from the world\'s own set', m1.hazards.mode === 'more' && m4.obstacles > m1.obstacles && m4.obstacles <= m1.hazards.base * 2, `${m1.obstacles} on lap 1, ${m4.obstacles} on lap ${m4.level}`);
      ok('"More" never puts a copy in a row with another obstacle', (await rows()) === 0);
      await boot({ hazards: 'fewer', music: null });
      const f1 = await page.eval<O>('window.__gmRuntime.state()');
      const f5 = await upTo(5);
      ok('"Fewer": obstacles thin every lap, never below a third', f5.obstacles < f1.obstacles && f5.obstacles >= Math.ceil(f1.obstacles / 3), `${f1.obstacles} on lap 1, ${f5.obstacles} on lap ${f5.level}`);
      await boot({ hazards: 'same', music: 'music-dance-field' });
      await page.eval('window.__gmRuntime.debug.audio()'); await sleep(1500);
      const s3 = await upTo(3);
      ok('"The same": the obstacles stay as the world laid them', s3.obstacles === s3.hazards.base, `${s3.obstacles} of ${s3.hazards.base}`);
      ok('music ticked on the page plays in a world that never asked for it', !!s3.track && s3.track.id === 'music-dance-field' && s3.track.playing, JSON.stringify(s3.track));
      const e = await page.eval<string[]>('window.__gm.errors');
      ok('laps under every option raise no error', e.length === 0, e.join(' | '));
    }, { timeoutMs: 180_000 });
  } finally { oids.forEach((x) => db.prepare('DELETE FROM drafts WHERE id = ?').run(x)); }

  // "You are the main character" (docs/PRODUCT.md): the player's own
  // character, passed in the frame's URL fragment, replaces the world's
  // player() in any world, and can change mid-run
  console.log('\nyou are the main character');
  const you = sanitizeMe({ name: 'Check', body: 'a', tone: '#7E4E33', hair: 'short02', build: 'athletic', kit: { top: '#0B6E4F', trim: '#F4C542', pattern: 'band', number: '23' } });
  await withBrowser(async (page) => {
    type Me = { me: boolean; playerSkinned: boolean; assets: string[]; state: string; level: number; alive: boolean };
    const boot = async (url: string) => {
      await page.goto(url);
      for (let i = 0; i < 150; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready && window.__gmRuntime)').catch(() => false)) break; await sleep(200); }
      return page.eval<Me>('window.__gmRuntime.state()');
    };
    const plain = await boot(`${BASE}/d/${id}/play`);
    ok('without a character, the world\'s own hero plays', !plain.me && !plain.playerSkinned);
    // a new document, not a fragment change on the same one (which does not reload)
    const s1 = await boot(`${BASE}/d/${id}/play?you=1${meFragment(you)}`);
    ok('with one, you play: a library human in the world\'s place', s1.me && s1.playerSkinned, `me=${s1.me} skinned=${s1.playerSkinned}`);
    ok('your body is loaded even though the world never asked for it', s1.assets.includes('human-athlete-male'), s1.assets.join(', '));
    await page.eval(`window.postMessage({ source: 'gamemog-host', type: 'view', view: 'portrait' }, '*')`); await sleep(300);
    const sp = await page.eval<Me & { demo: boolean }>('window.__gmRuntime.state()');
    ok('the /me close-up stands you still on the start line', sp.state === 'title' && !sp.demo, sp.state);
    await page.eval(`window.postMessage({ source: 'gamemog-host', type: 'view', view: 'play' }, '*')`); await sleep(300);
    ok('and after it, the world races itself again', (await page.eval<{ demo: boolean }>('window.__gmRuntime.state()')).demo);
    await page.eval(`window.postMessage({ source: 'gamemog-host', type: 'me', me: ${JSON.stringify({ ...you, body: 'b', hair: 'afro01' })} }, '*')`);
    await sleep(2500);
    const s2 = await page.eval<Me>('window.__gmRuntime.state()');
    ok('a new look from the page rebuilds you in place', s2.me && s2.playerSkinned && s2.assets.includes('human-athlete-female'), s2.assets.join(', '));
    await page.eval('window.__gmRuntime.debug.start()'); await sleep(3800);
    await page.eval('window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.autopilot(true); window.__gmRuntime.debug.timeScale(6)');
    let s3 = s2;
    for (let i = 0; i < 75; i++) { await sleep(400); s3 = await page.eval<Me>('window.__gmRuntime.state()'); if (s3.level >= 3) break; }
    const errs = await page.eval<string[]>('window.__gm.errors');
    ok('and the race runs with you in it, by the same rules', s3.state === 'race' && s3.level >= 3 && errs.length === 0, `level ${s3.level}${errs.length ? ', ' + errs.join(' | ') : ''}`);
  }, { timeoutMs: 120_000 });
} finally {
  db.prepare('DELETE FROM drafts WHERE id = ?').run(id);
}

console.log(`\n${failures ? `${failures} FAILED` : 'all runtime checks passed'}\n`);
process.exit(failures ? 1 : 0);
