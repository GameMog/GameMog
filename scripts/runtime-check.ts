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
import { worldControls, OPEN_CONTROLS } from '../lib/custom-game.ts';

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
      const mm = wat.models as unknown as { cans: number; cafe: number; drum: number; canAt: number[]; lidH: number };
      ok('the CC0 batch loads: a kit\'s parts each stand on their own spot (a can at x = z = 0 on the ground, its lid lying flat), a cafe set, a drum', mm.cans === 4 && mm.cafe === 3 && mm.drum === 1 && mm.lidH < 0.15 && Math.abs(mm.canAt[0]) < 0.05 && Math.abs(mm.canAt[1]) < 0.02 && Math.abs(mm.canAt[2]) < 0.05, JSON.stringify(wat.models));
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
      // freeflow (the owner, 3 Oct: Spiderbench's combat, "more style and speed, including kicks"): bare-handed, the hero
      // dashes at a man 4.9 m off (the leaping kick is for the longest dashes, from 4.4 m) and the blow is the leaping kick
      {
        const pp = (await os()).player;
        await page.eval(`(() => { const O = window.__gmRuntime.debug.open(); O.clear(); O.place(${pp.x}, ${pp.z}, null, null, false, 0); O.spawn('thug', ${pp.x}, ${pp.z + 4.9}); return true; })()`);
        await sleep(150); await page.eval('window.__gmRuntime.debug.open().punch()');
        let dashed = false, blow = '';
        for (let i = 0; i < 14; i++) { await sleep(80); const f = await page.eval<{ dash: unknown; last: string | null }>('window.__gmRuntime.debug.open().flow()'); dashed = dashed || !!f.dash; if (f.last) blow = f.last; }
        ok('bare-handed, the hero dashes at a man 4.9 m off and throws the leaping kick', dashed && blow === 'leap', `dash ${dashed}, blow ${blow || 'none'}`);
      }
      // dodge and counter (stage 2 of Spiderbench's combat; no icon over his head since 3 Oct): a man winds up; a dodge in
      // the last 0.3 s before his blow takes no harm, is perfect, and the next blow is a counter; a dodge long before is plain
      {
        type FW = { warn: { r: number } | null; counter: boolean; countered: number; last: string | null; power: number };
        const flow = () => page.eval<FW>('window.__gmRuntime.debug.open().flow()');
        const stand = async () => { const pp = (await os()).player; await page.eval(`(() => { const O = window.__gmRuntime.debug.open(); O.clear(); O.place(${pp.x}, ${pp.z}, null, null, false, 0); O.spawn('thug', ${pp.x}, ${pp.z + 1.25}); return true; })()`); await sleep(450); };
        await page.eval('window.__gmRuntime.debug.invincible(false)');
        await stand();
        const hp0 = (await os()).player.hp; await page.eval('window.__gmRuntime.debug.open().attack()');
        let f = await flow(), seen = false, dodged: { perfect: boolean } | null = null;
        for (let i = 0; i < 80 && !dodged; i++) { f = await flow(); seen = seen || !!f.warn; if (f.warn && f.warn.r <= 0.22) dodged = await page.eval<{ perfect: boolean } | null>('window.__gmRuntime.debug.open().dodge()'); else await sleep(20); }
        // the counter thrown at once, out of the flip (as a player does when the slow motion says so): the dodged blow
        // still finds nobody to hurt
        f = await flow(); const ready = f.counter;
        for (let i = 0; i < 25 && !f.countered; i++) { await sleep(80); await page.eval('window.__gmRuntime.debug.open().punch()'); f = await flow(); }
        await sleep(900); f = await flow(); const hp1 = (await os()).player.hp;
        ok('a man winds up, and a dodge just before his blow lands is perfect and takes no harm', seen && !!dodged?.perfect && ready && hp1 >= hp0, `wind-up seen ${seen}, dodge ${JSON.stringify(dodged)}, counter ready ${ready}, hp ${hp0} -> ${hp1}`);
        ok('the blow out of the flip is a counter: an ender, 1.6 times as hard', f.countered >= 1 && f.power >= 4.7, `blow ${f.last}, power ${f.power}`);
        await stand();
        await page.eval('window.__gmRuntime.debug.open().attack()');
        let plain: { perfect: boolean } | null = null;
        for (let i = 0; i < 80 && !plain; i++) { f = await flow(); if (f.warn && f.warn.r <= 0.7) plain = await page.eval<{ perfect: boolean } | null>('window.__gmRuntime.debug.open().dodge()'); else await sleep(20); }
        await sleep(900); f = await flow();
        ok('a dodge long before the blow is a plain one: no counter', !!plain && !plain.perfect && !f.counter, `dodge ${JSON.stringify(plain)}, counter ${f.counter}`);
        await page.eval('window.__gmRuntime.debug.invincible(true)');
      }
      // focus, the finisher and the heal, and the air game (stage 3 of Spiderbench's combat): the finisher needs focus and
      // with it puts a man down for good; a held attack launches him, the hero rises with him, two blows in the air and a
      // slam, whose landing knocks down the man close by; a heal spends focus on health
      {
        type F3 = { focus: number; fin: unknown; hang: { seg: number; t: number; air: number } | null; slamDown: boolean; launches: number; heals: number; knocked: number };
        const f3 = () => page.eval<F3>('window.__gmRuntime.debug.open().flow()');
        const O3 = 'window.__gmRuntime.debug.open()';
        const pp = (await os()).player;
        await page.eval(`(() => { const O = ${O3}; O.clear(); O.place(${pp.x}, ${pp.z}, null, null, false, 0); O.spawn('thug', ${pp.x}, ${pp.z + 2.5}); O.focus(0); return true; })()`); await sleep(400);
        const none = await page.eval(`${O3}.finisher()`);
        await page.eval(`${O3}.focus(1.1)`);
        const k0 = (await os()).kos, fin = await page.eval(`${O3}.finisher()`);
        let g = await f3(); for (let i = 0; i < 50 && g.fin; i++) { await sleep(100); g = await f3(); }
        const k1 = (await os()).kos;
        ok('the finisher needs focus, and with it the man goes down for good', none === null && !!fin && k1 - k0 === 1 && g.focus < 0.2, `without focus ${JSON.stringify(none)}, with ${JSON.stringify(fin)}: ${k1 - k0} down, focus left ${g.focus}`);
        const two = await page.eval<boolean>(`(() => { const O = ${O3}; O.clear(); O.place(${pp.x}, ${pp.z}, 0, null, false, 0); return O.spawn('thug', ${pp.x}, ${pp.z + 1.3}) && O.spawn('thug', ${pp.x + 1.6}, ${pp.z + 1.9}); })()`); await sleep(400);
        // a real held J: the press throws a jab, the hold (past 220 ms) the launcher
        const k2 = (await os()).kos, l0 = (await f3()).launches, n0 = (await f3()).knocked;
        // (held until the launch shows: the hold is timed in real time, and a slow frame must not let go of it first)
        await page.key('KeyJ', 'keyDown'); await sleep(240);
        for (let i = 0; i < 40 && (g = await f3()).launches === l0; i++) await sleep(30);
        await page.key('KeyJ', 'keyUp');
        const la = g.launches - l0 === 1, segs = new Set<number>(); let slam = false, high = 0;
        for (let i = 0; i < 45; i++) { await sleep(90); g = await f3(); if (g.hang) { segs.add(g.hang.seg); high = Math.max(high, g.hang.air); if (g.hang.t > 0.42) await page.eval(`${O3}.punch()`); } if (g.slamDown) slam = true; if (slam && !g.slamDown && !g.hang) break; }
        await sleep(600);
        const st3 = (await os()).enemies as unknown as { ko: boolean; hp: number; max: number }[], by = st3.filter((q) => !q.ko), k3 = (await os()).kos;
        ok('a held attack launches him and the hero rises with him: two blows in the air, then a slam', two && la && segs.has(0) && segs.has(1) && segs.has(2) && slam && high > 1.5, `launched ${la}, blows ${[...segs].join(',')}, slam ${slam}, up to ${high.toFixed(2)} m`);
        const n1 = (await f3()).knocked;
        ok('the slam puts him down, and its landing knocks down the man close by', k3 - k2 === 1 && by.length === 1 && by[0].hp <= by[0].max - 1.4 && n1 - n0 === 1, `${k3 - k2} out, ${n1 - n0} knocked down, standing ${JSON.stringify(by.map((q) => [q.hp, q.max]))}`);
        await page.eval('window.__gmRuntime.debug.invincible(false)'); await page.eval(`${O3}.clear()`); await page.eval('window.__gmRuntime.debug.open().hurt(40)');
        const hpA = (await os()).player.hp; await page.eval(`${O3}.focus(1)`); const healed = await page.eval<boolean>(`${O3}.heal()`); const hpB = (await os()).player.hp; g = await f3();
        await page.eval('window.__gmRuntime.debug.invincible(true)');
        ok('a heal spends a bar of focus on 35 health', healed && hpB - hpA >= 34 && g.focus < 0.05, `hp ${hpA} -> ${hpB}, focus ${g.focus}`);
      }
      // fewer kicks (the owner, 3 Oct: "it should kick much less"): over a run of chains a kick is the odd blow; and a fight
      // one on one brings the camera in close over the shoulder ("more close up fighting")
      {
        type FK = { thrown: Record<string, number>; duel: number; camD: number };
        const fk = () => page.eval<FK>('window.__gmRuntime.debug.open().flow()');
        const O4 = 'window.__gmRuntime.debug.open()';
        const pp = (await os()).player;
        await page.eval(`(() => { const O = ${O4}; O.clear(); O.place(${pp.x}, ${pp.z}, 0, null, false, 0); return true; })()`); await sleep(2600);
        const far = (await fk()).camD, t0 = (await fk()).thrown;
        let near = 99, duel = 0;
        for (let r = 0; r < 9; r++) {
          await page.eval(`(() => { const O = ${O4}; O.clear(); O.spawn('thug', ${pp.x}, ${pp.z + 1.2}); return true; })()`); await sleep(250);
          for (let i = 0; i < 14; i++) { await page.eval(`${O4}.punch()`); await sleep(120); if (i > 8) { const f = await fk(); near = Math.min(near, f.camD); duel = Math.max(duel, f.duel); } }
        }
        const t1 = (await fk()).thrown, n = (k: string) => (t1[k] || 0) - (t0[k] || 0);
        const all = Object.keys(t1).reduce((m, k) => m + n(k), 0), kicks = n('kick') + n('roundhouse') + n('leap');
        ok('kicks are the odd blow: one in five or fewer, over many chains', all >= 36 && kicks / all <= 0.2, `${kicks} kicks in ${all} blows (${JSON.stringify(Object.fromEntries(Object.keys(t1).map((k) => [k, n(k)])))})`);
        ok('a fight one on one brings the camera in close', duel > 0.6 && near < far * 0.8, `camera ${far.toFixed(2)} m off alone, ${near.toFixed(2)} m in the fight (duel ${duel})`);
      }
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
      // a weapon hits like one (the owner, 3 Oct: "the weapons should pack way more punch and destruction"): a swing
      // drops a street thug and sends him flying, into the man behind him
      {
        const pp = (await ow2()).player;
        await page.eval(`(() => { const O = window.__gmRuntime.debug.open(); O.clear(); O.place(${pp.x}, ${pp.z}, null, null, false, 0); O.spawn('thug', ${pp.x}, ${pp.z + 1.2}); O.spawn('thug', ${pp.x + 0.1}, ${pp.z + 3.4}); return true; })()`);
        type FL = { flown: number[]; bowled: number };
        let fl = await page.eval<FL>('window.__gmRuntime.debug.open().flown()');
        for (let i = 0; i < 8 && !fl.flown.length; i++) { await page.eval('window.__gmRuntime.debug.open().punch()'); await sleep(380); fl = await page.eval<FL>('window.__gmRuntime.debug.open().flown()'); }
        await sleep(1000); fl = await page.eval<FL>('window.__gmRuntime.debug.open().flown()');
        ok('an armed knockout sends him flying, and down goes the man behind him', fl.flown.some((d) => d > 2) && fl.bowled >= 1, `flew ${fl.flown.join(', ')} m, bowled ${fl.bowled}`);
      }
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

  // the punches-only tank (AI Alps, the owner 4 Oct: "no kicks. just an array of punches", "no jumping", and the choice
  // "Tank: no dodge. He never flips or rolls. He walks through hits and blocks with his forearms. The finisher is a
  // skull-crushing overhead punch."): open.kicks, open.jump and open.dodge: false and open.tank, on their own fixture
  console.log('\nopen worlds: a hero who only punches, never jumps or dodges, and walks through blows');
  const tkid = randomUUID(), tkcode = readFileSync(new URL('../lib/runtime/tank-world.js', import.meta.url), 'utf8');
  insertDraft({ id: tkid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: tkcode,
    meta: { title: 'Tank Check', tagline: 'Punches only', blurb: 'Runtime check.', genre: 'Open World', cast: [{ name: 'Tester', color: '#FF7A3D' }], palette: { sky: '#9CB4D0', ground: '#A79C88', accent: '#FF7A3D' }, runtime: 1, scoring: 'survival' } });
  try {
    await withBrowser(async (page) => {
      type TF = { thrown: Record<string, number>; can: { kicks: boolean; jump: boolean; dodge: boolean; tank: number | null }; finPlayed: string[] | null; blocked: number; heavies: number; act: string | null; fin: unknown;
        focus: number; dash: { leap: boolean } | null; dashes: number; last: string | null; launches: number; dodges: number; slow: number; power: number; repeats: number; punching: number; clip: string | null; heldAfter: string | null };
      type TS = { kos: number; player: { x: number; z: number; y: number; hp: number; max: number; act: string | null; stance: string }; enemies: { ko: boolean; hp: number }[] };
      const O = 'window.__gmRuntime.debug.open()';
      const tf = () => page.eval<TF>(`${O}.flow()`), ts = () => page.eval<TS>('window.__gmRuntime.state().open');
      const key = (code: string) => page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}', bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code: '${code}', bubbles: true }))`);
      await page.goto(`${BASE}/d/${tkid}/play`);
      for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
      const e0 = await page.eval<string[]>('window.__gm.errors');
      // the title card, and the page: only what he can do
      await page.key('Enter'); await sleep(500);
      const card = await page.eval<string>('(document.querySelector("#gm .screen .how") || {}).textContent || ""');
      const pageLine = worldControls(tkcode), zbLine = worldControls(readFileSync(new URL('../worlds/zombie-beach.js', import.meta.url), 'utf8'));
      ok('the controls (the card and the game page) name only what he can do: punches, a haymaker, no kick, jump or dodge',
        e0.length === 0 && /haymaker/.test(card) && /forearms/.test(card) && !/kick|jump|dodge/i.test(card) && /haymaker/.test(pageLine) && !/kick|jump|dodge/i.test(pageLine) && zbLine === OPEN_CONTROLS,
        `card "${card.slice(0, 220)}…", page "${pageLine}"${e0.length ? ', ' + e0.join(' | ') : ''}`);
      await page.eval('window.__gmRuntime.debug.audio(); window.__gmRuntime.debug.start()'); await sleep(600);
      const btns = await page.eval<string[]>('[...document.querySelectorAll("#gm .tpad button")].map((b) => b.textContent)');
      await page.eval('window.__gmRuntime.debug.invincible(true)');
      // no kicks: many chains on a man in front, and charges at a man out of reach
      const pp = (await ts()).player, t0 = (await tf()).thrown, r0 = (await tf()).repeats;
      for (let r = 0; r < 9; r++) {
        await page.eval(`(() => { const O = ${O}; O.clear(); O.place(${pp.x}, ${pp.z}, 0, null, false, 0); O.spawn('thug', ${pp.x}, ${pp.z + 1.2}); return true; })()`); await sleep(250);
        for (let i = 0; i < 14; i++) { await page.eval(`${O}.punch()`); await sleep(120); }
      }
      let leapt = 0, charges = '';
      const c0 = (await tf()).dashes;
      for (let r = 0; r < 3; r++) {
        await sleep(700);
        await page.eval(`(() => { const O = ${O}; O.clear(); O.place(${pp.x}, ${pp.z}, null, null, false, 0); O.spawn('thug', ${pp.x}, ${pp.z + 4.9}); return true; })()`);
        await sleep(150); await page.eval(`${O}.punch()`);
        let blow = '';
        for (let i = 0; i < 14; i++) { await sleep(80); const f = await tf(); if (f.dash && f.dash.leap) leapt++; if (f.last) blow = f.last; }
        charges += `${blow} `;
      }
      const charged = (await tf()).dashes - c0;
      const t1 = (await tf()).thrown, n = (k: string) => (t1[k] || 0) - (t0[k] || 0);
      const all = Object.keys(t1).reduce((m, k) => m + n(k), 0), kicks = n('kick') + n('roundhouse') + n('leap') + n('riser');
      const kinds = ['jab', 'cross', 'hook', 'body', 'upperL', 'uppercut', 'haymaker'].filter((k) => n(k) > 0), twice = (await tf()).repeats - r0;
      ok('no kicks, just an array of punches: over many chains not one kick, five kinds of punch or more, and never one motion twice running (the hook and the haymaker are one)',
        all >= 36 && kicks === 0 && kinds.length >= 5 && twice === 0, `${all} blows, ${kicks} kicks, ${twice} motions twice running (${JSON.stringify(Object.fromEntries(Object.keys(t1).map((k) => [k, n(k)])))})`);
      ok('a man out of reach is charged and punched, never leapt at with a kick', charged === 3 && leapt === 0 && !/leap/.test(charges), `${charged} charges, ${leapt} leaps, blows ${charges.trim()}`);
      // a held attack: the haymaker with everything behind it, and nobody launched (open.impact, on here: the boxer's slow
      // hook, or after a hook, the chain's or a held one, his rear uppercut, so never the motion just thrown)
      {
        await page.eval(`(() => { const O = ${O}; O.clear(); O.place(${pp.x}, ${pp.z}, 0, null, false, 0); O.spawn('thug', ${pp.x}, ${pp.z + 1.3}); return true; })()`); await sleep(400);
        const h0 = await tf();
        await page.key('KeyJ', 'keyDown'); await sleep(240);
        let g = await tf(); for (let i = 0; i < 40 && g.heavies === h0.heavies; i++) { await sleep(30); g = await tf(); }
        await page.key('KeyJ', 'keyUp'); await sleep(900);
        const g2 = await tf();
        ok('a held attack throws the haymaker with everything behind it (the boxer\'s slow hook, or after a hook his rear uppercut: never the motion just thrown), and launches nobody',
          g.heavies - h0.heavies === 1 && g.last === 'heavy' && !!g.heldAfter && g.act === (g.heldAfter === 'hook' ? 'uppercut' : 'hook') && g.act !== g.heldAfter && g.power >= 5 && g2.launches === h0.launches && (await page.eval(`${O}.launch()`)) === null,
          `heavies ${h0.heavies} -> ${g.heavies}, blow ${g.last} (${g.act}) after ${g.heldAfter} at ${g.power}, launches ${h0.launches} -> ${g2.launches}`);
      }
      // no jumping: Space, K and the jump itself leave him on the ground
      {
        await page.eval(`${O}.clear()`); await sleep(300);
        const y0 = (await ts()).player.y;
        let top = 0;
        for (const how of ['space', 'k', 'jump']) {
          if (how === 'space') await page.key('Space'); else if (how === 'k') await key('KeyK'); else await page.eval(`${O}.jump()`);
          for (let i = 0; i < 12; i++) { await sleep(40); top = Math.max(top, Math.abs((await ts()).player.y - y0)); }
        }
        ok('no jumping: Space, K and the jump itself leave him on the ground, and there is no JUMP button', top < 0.02 && !btns.includes('JUMP') && btns.includes('PUNCH'), `rose ${top.toFixed(3)} m, buttons ${btns.join(' ')}`);
      }
      // no dodge: C, L and the dodge itself do nothing (not even a jump), the warning never says to dodge
      {
        await page.eval(`(() => { const O = ${O}; O.clear(); O.place(${pp.x}, ${pp.z}, 0, null, false, 0); O.spawn('thug', ${pp.x}, ${pp.z + 1.25}); return true; })()`); await sleep(450);
        const d0 = await tf(), y0 = (await ts()).player.y, p0 = (await ts()).player;
        const r1 = await page.eval(`${O}.dodge()`); await key('KeyC'); await key('KeyL');
        await page.eval(`${O}.attack()`);
        let slow = 0, top = 0, said = '';
        for (let i = 0; i < 30; i++) { await sleep(40); const f = await tf(); slow = Math.max(slow, f.slow); const s = await ts(); top = Math.max(top, Math.abs(s.player.y - y0)); said = said || await page.eval<string>('(document.querySelector("#gm .feed") || {}).textContent || ""'); }
        const d1 = await tf(), p1 = (await ts()).player;
        ok('no dodge: C, L and the dodge do nothing (not a jump either), no warning slows time or says to dodge, and no DODGE button',
          r1 === null && d1.dodges === d0.dodges && top < 0.02 && slow === 0 && !/dodge/i.test(said) && !btns.includes('DODGE') && Math.hypot(p1.x - p0.x, p1.z - p0.z) < 0.3,
          `dodge ${JSON.stringify(r1)}, dodges ${d0.dodges} -> ${d1.dodges}, rose ${top.toFixed(3)}, slow ${slow}, feed "${said}"`);
      }
      // the finisher is a punch: the haymaker drops him and the fist comes down on him, straight out of the haymaker (no
      // beat stood still between them) and onto his head (read every frame in the page: the fists against his head)
      {
        await page.eval(`(() => { const O = ${O}; O.clear(); O.place(${pp.x}, ${pp.z}, null, null, false, 0); O.spawn('thug', ${pp.x}, ${pp.z + 2.5}); O.focus(1.1); return true; })()`); await sleep(400);
        const k0 = (await ts()).kos;
        const fin = await page.eval(`(() => {
          const I = window.__gmRuntime.debug.internals(), O = ${O}, v = new I.THREE.Vector3(), me = window.__gmRuntime.state().open.player, heads = [];
          I.scene.traverse((o) => { if (o.isBone && o.name === 'head') { let r = o; while (r.parent && r.parent !== I.scene) r = r.parent; r.getWorldPosition(v); heads.push({ bone: o, root: r, d: Math.hypot(v.x - me.x, v.z - me.z) }); } });
          heads.sort((a, b) => a.d - b.d);
          const hero = heads[0].root, foe = heads[1], wr = [hero.getObjectByName('wrist_R'), hero.getObjectByName('wrist_L')], at = (o) => o.getWorldPosition(new I.THREE.Vector3());
          const F = { frames: [] }; window.__finRec = F;
          const step = () => { const f = O.flow(); if (!f.fin) return; const h = at(foe.bone); F.frames.push({ ms: performance.now(), act: f.act, fist: Math.min(...wr.map((w) => at(w).distanceTo(h))) }); requestAnimationFrame(step); };
          const r = O.finisher(); requestAnimationFrame(step); return r; })()`);
        let g = await tf(); const clips = new Set<string>(); for (let i = 0; i < 60 && g.fin; i++) { await sleep(60); g = await tf(); if (g.act) clips.add(g.act); }
        const k1 = (await ts()).kos, fr = await page.eval<{ ms: number; act: string | null; fist: number }[]>('window.__finRec.frames');
        // the longest he stands still (no blow playing) inside the finisher, and the nearest his fist comes to the head in the slam
        let still = 0, run0 = -1; fr.forEach((q, i) => { if (!q.act) { if (run0 < 0) run0 = i; still = Math.max(still, q.ms - fr[run0].ms + (fr[i + 1] ? fr[i + 1].ms - q.ms : 0)); } else run0 = -1; });
        const fist = Math.min(...fr.filter((q) => q.act === 'ffSlamLand').map((q) => q.fist));
        // (open.kicks: false brings the impact, whose haymaker is the boxer's looping hook: the freeflow hook's fist never
        // reached the face)
        ok('the finisher is a punch: a haymaker drops him and the fist comes down on him, down for good', !!fin && k1 - k0 === 1 && JSON.stringify(g.finPlayed) === JSON.stringify(['hook', 'ffSlamLand']) && !clips.has('ffFinisher') && g.focus < 0.2,
          `${k1 - k0} down, finisher played ${JSON.stringify(g.finPlayed)}, seen ${[...clips].join(',')}, focus left ${g.focus}`);
        ok('the fist comes down straight out of the haymaker, with no beat stood still between them, and lands on his head', fr.length > 20 && still < 200 && fist < 0.4,
          `${fr.length} frames, stood still ${Math.round(still)} ms at most, the fist ${fist.toFixed(2)} m from his head at the nearest`);
      }
      // the tank: a blow from in front lands on his forearms, one from behind does its full harm; neither shoves him or
      // makes him flinch; a heavy one rocks him
      {
        await page.eval('window.__gmRuntime.debug.invincible(false)');
        const blow = async (face: number) => {
          await page.eval(`(() => { const O = ${O}; O.clear(); O.pose('fight'); O.place(${pp.x}, ${pp.z}, 0, null, false, ${face}); O.spawn('thug', ${pp.x}, ${pp.z + 1.25}); return true; })()`); await sleep(600);
          const s0 = (await ts()).player, b0 = (await tf()).blocked; await page.eval(`${O}.attack()`);
          let s1 = s0, acts = new Set<string>();
          for (let i = 0; i < 40 && s1.hp >= s0.hp; i++) { await sleep(30); s1 = (await ts()).player; }
          for (let i = 0; i < 8; i++) { await sleep(30); const f = await tf(); if (f.act) acts.add(f.act); }
          const s2 = (await ts()).player, b1 = (await tf()).blocked;
          await page.eval(`${O}.clear()`); await page.eval(`${O}.pose(null)`);
          return { lost: s0.hp - s1.hp, moved: Math.hypot(s2.x - s0.x, s2.z - s0.z), acts: [...acts], blocked: b1 - b0 };
        };
        const front = await blow(0), back = await blow(Math.PI);
        ok('a blow from in front lands on his forearms: 45% of its harm or less, no shove, no flinch', front.lost > 0 && back.lost > 0 && front.lost <= back.lost * 0.45 && front.blocked === 1 && front.moved < 0.15 && !front.acts.some((a) => /^hit/.test(a)),
          `front ${JSON.stringify(front)}, behind ${JSON.stringify(back)}`);
        ok('a blow from behind does its full harm, and still neither shoves him nor makes him flinch', back.blocked === 0 && back.moved < 0.15 && !back.acts.some((a) => /^hit/.test(a)), JSON.stringify(back));
        const hp0 = (await ts()).player.hp; await page.eval(`${O}.hurt(16, 0)`); await sleep(60);
        const hv = await tf(), hp1 = (await ts()).player.hp;
        ok('a heavy blow (a boss\'s) is still blocked in part, and still rocks him', hv.act === 'hitChest' && hp0 - hp1 <= 16 * 0.45, `${hp0.toFixed(1)} -> ${hp1.toFixed(1)}, act ${hv.act}`);
      }
      // heavy by who struck, not by what the heat has made of it: at heat 8 a biker's blow (10, 14.9 with the heat) from in
      // front neither rocks him nor cuts off the punch he is throwing
      {
        await page.eval(`${O}.heat(8)`);
        // (a man told to strike now and then circles off instead: up to three tries for one blow that lands)
        let s0 = (await ts()).player, s1 = s0, s2 = s0, b0 = 0, b1 = 0; const acts = new Set<string>();
        for (let r = 0; r < 3 && !(s1.hp < s0.hp); r++) {
          await page.eval(`(() => { const O = ${O}; O.clear(); O.pose('fight'); O.place(${pp.x}, ${pp.z}, 0, null, false, 0); O.spawn('biker', ${pp.x}, ${pp.z + 1.4}); return true; })()`); await sleep(600);
          s0 = (await ts()).player; s1 = s0; b0 = (await tf()).blocked; await page.eval(`${O}.attack()`);
          for (let i = 0; i < 50 && s1.hp >= s0.hp; i++) { await sleep(30); s1 = (await ts()).player; }
          for (let i = 0; i < 8; i++) { await sleep(30); const f = await tf(); if (f.act) acts.add(f.act); }
          s2 = (await ts()).player; b1 = (await tf()).blocked;
        }
        await page.eval(`${O}.clear(); ${O}.pose(null)`); await sleep(400);
        // the same harm landing while he punches the air: 0.06 s in (its wind-up, full harm) and 0.3 s in (its strike is
        // past and his guard is back up: on his forearms); the punch goes on through both
        const into = (ms: number) => page.eval<{ blocked: number; punching: number; act: string | null; lost: number }>(`new Promise((done) => { const O = ${O}; O.punch();
          setTimeout(() => { const b = O.flow().blocked, hp = window.__gmRuntime.state().open.player.hp; O.hurt(14.9, 0); const f = O.flow();
            done({ blocked: f.blocked - b, punching: f.punching, act: f.act, lost: +(hp - window.__gmRuntime.state().open.player.hp).toFixed(2) }); }, ${ms}); })`);
        const early = await into(60); await sleep(900); const late = await into(300); await sleep(600);
        ok('at heat 8 a biker\'s blow from in front neither rocks him nor cuts off his punch', s1.hp < s0.hp && b1 - b0 === 1 && !acts.has('hitChest') && Math.hypot(s2.x - s0.x, s2.z - s0.z) < 0.15
          && early.punching > 0 && late.punching > 0 && early.act !== 'hitChest' && late.act !== 'hitChest',
          `biker ${(s0.hp - s1.hp).toFixed(1)} harm, blocked ${b1 - b0}, acts ${[...acts].join(',')}, moved ${Math.hypot(s2.x - s0.x, s2.z - s0.z).toFixed(2)}; mid-punch ${JSON.stringify({ early, late })}`);
        ok('a blow from in front while he punches lands on his forearms once his punch has struck, and in full while he winds it up',
          early.blocked === 0 && late.blocked === 1 && late.lost > 0 && late.lost <= early.lost * 0.45, JSON.stringify({ early, late }));
      }
      const e1 = await page.eval<string[]>('window.__gm.errors');
      ok('a run with the punches-only tank raises no error', e1.length === 0, e1.join(' | '));
    }, { timeoutMs: 200_000 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(tkid); }
  // the finisher's overhead punch (the owner 4 Oct: "a skull-crushing overhead punch"; 5 Oct, the slam's touchdown read
  // as a dive onto him): the same hero with the motion pack listed, as AI Alps lists it, follows the haymaker with the
  // pack's crush: down on one knee, the right fist high overhead, then driven straight down onto the head of the man on
  // the ground (without the pack, the slam above). Read every frame in the page: the fist, the man's skull, the hips
  {
    const crid = randomUUID(), crcode = tkcode.replace("assets: ['human-athlete-male'],", "assets: ['human-athlete-male', 'human-moves-male'],");
    insertDraft({ id: crid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: crcode,
      meta: { title: 'Crush Check', tagline: 'Punches only', blurb: 'Runtime check.', genre: 'Open World', cast: [{ name: 'Tester', color: '#FF7A3D' }], palette: { sky: '#9CB4D0', ground: '#A79C88', accent: '#FF7A3D' }, runtime: 1, scoring: 'survival' } });
    try {
      await withBrowser(async (page) => {
        const O = 'window.__gmRuntime.debug.open()';
        await page.goto(`${BASE}/d/${crid}/play`);
        for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
        await page.eval('window.__gmRuntime.debug.start(); window.__gmRuntime.debug.invincible(true)'); await sleep(700);
        await page.eval(`(() => { const O = ${O}; O.clear(); O.place(0, 0, null, null, false, 0); O.spawn('thug', 0, 2.2); O.focus(1.1); return true; })()`); await sleep(600);
        const k0 = await page.eval<number>('window.__gmRuntime.state().open.kos');
        await page.eval(`(() => {
          const I = window.__gmRuntime.debug.internals(), O = ${O}, V = I.THREE.Vector3, me = window.__gmRuntime.state().open.player, heads = [];
          I.scene.traverse((o) => { if (o.isBone && o.name === 'head') { let r = o; while (r.parent && r.parent !== I.scene) r = r.parent; const p = r.getWorldPosition(new V()); heads.push({ bone: o, root: r, d: Math.hypot(p.x - me.x, p.z - me.z) }); } });
          heads.sort((a, b) => a.d - b.d);
          const hero = heads[0].root, foe = heads[1].root, at = (o) => o.getWorldPosition(new V());
          const fist = hero.getObjectByName('finger3-1_R'), myHead = hero.getObjectByName('head'), hips = hero.getObjectByName('root'), head = foe.getObjectByName('head'), neck = foe.getObjectByName('neck03');
          const F = { frames: [] }; window.__crushRec = F;
          const step = () => { const f = O.flow(); if (!f.fin) return;
            // (the middle of his skull: 9 cm on from the head bone, the way his neck runs into it)
            const h = at(head), s = h.clone().add(h.clone().sub(at(neck)).setLength(0.09)), k = at(fist);
            F.frames.push({ ms: performance.now(), act: f.act, fist: +k.distanceTo(s).toFixed(3), y: +k.y.toFixed(3), over: +(k.y - at(myHead).y).toFixed(3), hips: +at(hips).y.toFixed(3), kos: window.__gmRuntime.state().open.kos });
            requestAnimationFrame(step); };
          O.finisher(); requestAnimationFrame(step); return true; })()`);
        let g = await page.eval<{ fin: unknown; finPlayed: string[] | null }>(`${O}.flow()`);
        for (let i = 0; i < 80 && g.fin; i++) { await sleep(60); g = await page.eval(`${O}.flow()`); }
        const k1 = await page.eval<number>('window.__gmRuntime.state().open.kos');
        const fr = await page.eval<{ ms: number; act: string | null; fist: number; y: number; over: number; hips: number; kos: number }[]>('window.__crushRec.frames');
        const ko = fr.findIndex((q) => q.kos > k0), at = ko >= 0 ? fr[ko] : null, before = fr.slice(0, Math.max(0, ko)).filter((q) => q.act === 'crush');
        const over = before.length ? Math.max(...before.map((q) => q.over)) : 0;
        let still = 0, run0 = -1; fr.forEach((q, i) => { if (!q.act) { if (run0 < 0) run0 = i; still = Math.max(still, q.ms - fr[run0].ms + (fr[i + 1] ? fr[i + 1].ms - q.ms : 0)); } else run0 = -1; });
        ok('with the motion pack, the finisher\'s fist comes down from overhead, on one knee, onto the head of the man on the ground: down for good',
          k1 - k0 === 1 && JSON.stringify(g.finPlayed) === JSON.stringify(['hook', 'crush']) && !!at && at.act === 'crush' && over > 0.15 && at.hips < 0.65 && at.fist < 0.25 && at.y > 0.12 && at.y < 0.32 && still < 200,
          `${k1 - k0} down, played ${JSON.stringify(g.finPlayed)}; before it lands the fist rises ${over.toFixed(2)} m over his own head; as it lands: ${at ? `${at.act}, the fist ${at.fist.toFixed(2)} m from the middle of the man's skull, ${at.y.toFixed(2)} m up, his hips ${at.hips.toFixed(2)} m up` : 'never'}; stood still ${Math.round(still)} ms at most`);
        const e = await page.eval<string[]>('window.__gm.errors');
        ok('a finisher with the motion pack raises no error', e.length === 0, e.join(' | '));
      }, { timeoutMs: 120_000 });
    } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(crid); }
  }

  // a party's weapons (AI Alps, the owner 4 Oct: "he can pick up bottles, glasses and beat club goers over the head"):
  // the bottle, magnum, glass and bucket kinds and open.weapons.spots (stand, every), on their own fixture; then the
  // fixture again without them, for the street's mix
  console.log('\nopen worlds: bottles, glasses and an ice bucket on a table, broken over heads');
  const btid = randomUUID(), btcode = readFileSync(new URL('../lib/runtime/bottles-world.js', import.meta.url), 'utf8');
  const btmeta = { title: 'Bottles Check', tagline: 'Glass', blurb: 'Runtime check.', genre: 'Open World', cast: [{ name: 'Tester', color: '#FF7A3D' }], palette: { sky: '#3A4660', ground: '#8E8678', accent: '#FF7A3D' }, runtime: 1, scoring: 'survival' };
  insertDraft({ id: btid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: btcode, meta: btmeta });
  try {
    await withBrowser(async (page) => {
      type TG = { shards: number; drops: number; junk: number; smashes: number; knocks: number; clangs: number; shattered: number; last: { kind: string; x: number; y: number; z: number; on: number | null } | null;
        dent: number | null; stance: string; stood: { kind: string; x: number; foot: number; tall: number; glint: boolean }[]; armed: { kind: string; held: string | null; stance: string; act: string | null; state: string; d: number }[] };
      type TS = { kos: number; weapon: { kind: string; hits: number; max: number } | null; player: { x: number; z: number; y: number; hp: number }; pickups: { kind: string; x: number; z: number; dropped: boolean }[]; enemies: { ko: boolean; hp: number; state: string }[] };
      const O = 'window.__gmRuntime.debug.open()';
      const gl = () => page.eval<TG>(`${O}.glass()`), ts = () => page.eval<TS>('window.__gmRuntime.state().open');
      const feed = () => page.eval<string>('(document.querySelector("#gm .feed") || {}).textContent || ""');
      await page.goto(`${BASE}/d/${btid}/play`);
      for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
      await page.eval('window.__gmRuntime.debug.audio(); window.__gmRuntime.debug.start()'); await sleep(800);
      await page.eval(`window.__gmRuntime.debug.invincible(true); ${O}.clear()`);
      // the table: each spot its own kind (two left to the world's mix), stood upright on the top, not glinting
      const g0 = await gl(), named = ['bottle', 'magnum', 'glass', 'bottle', 'glass', 'bucket'], xs = [-2.1, -1.4, -0.7, 0, 0.7, 1.4, 2.1, 2.8];
      const at = (x: number) => g0.stood.find((q) => Math.abs(q.x - x) < 0.01);
      ok('the table holds what the world put on it: each spot its own kind, the rest from its mix, all stood upright on the top and none glinting',
        g0.stood.length === 8 && named.every((k, i) => at(xs[i])?.kind === k) && g0.stood.every((q) => ['bottle', 'magnum', 'glass', 'bucket'].includes(q.kind) && Math.abs(q.foot - 0.76) < 0.01 && !q.glint)
          && ['bottle', 'magnum'].every((k) => g0.stood.filter((q) => q.kind === k).every((q) => q.tall > 3)),
        JSON.stringify(g0.stood));
      // bare hands take a bottle off the table
      const take = async (x: number, kind: string) => {
        await page.eval(`${O}.place(${x}, 5.05, null, null, false, 0)`);
        let s = await ts(); for (let i = 0; i < 40 && !(s.weapon && s.weapon.kind === kind); i++) { await sleep(60); s = await ts(); }
        return s;
      };
      const n0 = (await ts()).pickups.length, tb = await take(-2.1, 'bottle'); await sleep(300);
      ok('bare hands take a bottle off the table', !!tb.weapon && tb.weapon.kind === 'bottle' && tb.weapon.hits === 1 && tb.pickups.length === n0 - 1,
        `${JSON.stringify(tb.weapon)}, pickups ${n0} -> ${tb.pickups.length}`);
      // one blow: it breaks on his head
      const swing = async () => {
        await page.eval(`(() => { const O = ${O}; O.clear(); O.place(0, -8, null, null, false, 0); O.spawn('thug', 0, -6.9); return true; })()`); await sleep(350);
        const a = await gl(), s0 = await ts(); await page.eval(`${O}.punch()`);
        let s = await ts(); const hit = () => s.weapon === null || (s0.weapon && s.weapon && s.weapon.hits < s0.weapon.hits);
        for (let i = 0; i < 30 && !hit(); i++) { await sleep(40); s = await ts(); }
        await sleep(80);
        return { a, b: await gl(), s0, s: await ts(), said: await feed() };
      };
      const h = await swing();
      const foe = h.s.enemies[0], last = h.b.last;
      ok('with a man in front of him he squares up with the bottle as a boxer does, not in the sword\'s guard', h.a.stance === 'fight', `stance ${h.a.stance}`);
      ok('one bottle over a man\'s head: it shatters on his head as the blow lands, shards and a spray of wine in the air, the smash heard, and his hand is empty',
        h.s.weapon === null && h.b.shattered - h.a.shattered === 1 && h.b.smashes - h.a.smashes === 1 && h.b.shards >= 12 && h.b.drops > 0 && !!last && last.kind === 'bottle' && last.y > 1.4 && last.y < 2.1 && last.z > -8 && Math.hypot(last.x, last.z + 8) < 2.4 && /bottle shattered/i.test(h.said),
        `weapon ${JSON.stringify(h.s.weapon)}, ${JSON.stringify({ shattered: h.b.shattered - h.a.shattered, smashes: h.b.smashes - h.a.smashes, shards: h.b.shards, drops: h.b.drops, last })}, feed "${h.said}"`);
      ok('the man it broke on goes down (or reels), and a knockout is said in the same line as the smash', !!foe && (h.s.kos - h.s0.kos === 1 || foe.ko || foe.hp < 3) && (h.s.kos === h.s0.kos || /bottle shattered\. Knockout \+\d+ GM/i.test(h.said)),
        `kos ${h.s0.kos} -> ${h.s.kos}, ${JSON.stringify(foe)}, feed "${h.said}"`);
      // the ice bucket: it dents and clangs on two heads and gives out on the third
      await sleep(400);
      const tk = await take(1.4, 'bucket');
      const rounds: { hits: number | null; dent: number | null; clangs: number; junk: number; smashes: number; shattered: number }[] = [];
      for (let r = 0; r < 3; r++) { const w = await swing(); rounds.push({ hits: w.s.weapon ? w.s.weapon.hits : null, dent: w.b.dent, clangs: w.b.clangs - w.a.clangs, junk: w.b.junk, smashes: w.b.smashes - w.a.smashes, shattered: w.b.shattered - w.a.shattered }); await sleep(250); }
      const said = await feed();
      ok('the ice bucket dents and clangs on each of two heads and gives out on the third (its ice spills, it lies crumpled), never shattering like glass',
        !!tk.weapon && tk.weapon.kind === 'bucket' && rounds[0].hits === 2 && rounds[1].hits === 1 && rounds[2].hits === null && rounds[0].dent! < 1 && rounds[1].dent! < rounds[0].dent!
          && rounds.every((q) => q.clangs === 1 && q.smashes === 0) && rounds[2].shattered === 1 && rounds[2].junk === 1 && /ice bucket gave out/i.test(said),
        `${JSON.stringify(tk.weapon)}, ${JSON.stringify(rounds)}, feed "${said}"`);
      // a biker carries a bottle: in his right hand, a boxer's stance, and he swings it
      {
        await page.eval(`(() => { const O = ${O}; O.clear(); O.place(0, -8, null, null, false, 0); O.spawn('biker', 0, -6.8); return true; })()`); await sleep(500);
        await page.eval(`${O}.attack()`);
        let g = await gl(), acts = new Set<string>(); for (let i = 0; i < 30; i++) { await sleep(40); g = await gl(); if (g.armed[0] && g.armed[0].act) acts.add(g.armed[0].act); }
        const b = g.armed[0];
        ok('a biker carries his bottle in his right hand, squares up as a boxer does and swings it', !!b && b.kind === 'bottle' && b.held === 'bottle' && b.stance === 'fight' && (acts.has('ffCross') || acts.has('cross')),
          `${JSON.stringify(g.armed)}, moves ${[...acts].join(',')}`);
      }
      // the table restocked while he stays at the party: one taken, and he stands 3 m from the table
      {
        await page.eval(`${O}.clear()`); await sleep(300);
        const g0 = await gl(), q = g0.stood[0], tq = q ? await take(q.x, q.kind) : null, n1 = (await gl()).stood.length;
        await page.eval(`(() => { const O = ${O}; O.clear(); O.place(0.35, 2.75, null, null, false, 0); return true; })()`);
        const t0 = Date.now(); let n2 = n1;
        while (Date.now() - t0 < 13_000 && n2 < g0.stood.length) { await sleep(500); await page.eval(`${O}.clear()`); n2 = (await gl()).stood.length; }
        const waited = (Date.now() - t0) / 1000;
        ok('a bottle taken off the table is put back within every (12 s) and a second, while he stands 3 m from the table',
          !!tq && !!tq.weapon && n1 === g0.stood.length - 1 && n2 === g0.stood.length && waited <= 13.5, `${g0.stood.length} stood, took a ${tq && tq.weapon ? tq.weapon.kind : 'nothing'}: ${n1}, then ${n2} after ${waited.toFixed(1)} s`);
      }
      const e1 = await page.eval<string[]>('window.__gm.errors');
      ok('a run with bottles, glasses and an ice bucket raises no error', e1.length === 0, e1.join(' | '));
    }, { timeoutMs: 200_000 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(btid); }
  // the same world naming none of them: the street's own mix, hidden about
  {
    const bsid = randomUUID(), bscode = btcode.replace(/weapons: \{[\s\S]*?\] \},/, 'weapons: { count: 8 },');
    insertDraft({ id: bsid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: bscode, meta: btmeta });
    try {
      await withBrowser(async (page) => {
        await page.goto(`${BASE}/d/${bsid}/play`);
        for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
        await page.eval('window.__gmRuntime.debug.start()'); await sleep(800);
        const p = await page.eval<{ kind: string }[]>('window.__gmRuntime.state().open.pickups'), street = ['bat', 'pipe', 'chain', 'baton', 'sword'];
        ok('a world that names none of them keeps the street\'s weapons: eight about the place, every one a bat, pipe, chain, baton or katana', bscode !== btcode && p.length === 8 && p.every((q) => street.includes(q.kind)),
          p.map((q) => q.kind).join(','));
      }, { timeoutMs: 90_000 });
    } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(bsid); }
  }

  // a story told as the GM comes in (AI Alps, the owner 4 Oct: "with a Cut scene explaining the next level mission every
  // 1500 GM", and "One party, rising stakes"): open.story's beats on their own fixture (a goal of 400, beats at 100 and
  // 200), the machine's view a shot may set (shot.vision), the run going on after a beat, and none of it while the
  // autopilot drives; then the fixture without a story, and Zombie Beach, for the GM as it was
  console.log('\nopen worlds: a story scene at each beat of GM, the run going on after it, and a machine\'s view');
  const sgid = randomUUID(), sgcode = readFileSync(new URL('../lib/runtime/story-world.js', import.meta.url), 'utf8');
  const sgmeta = { title: 'Story Check', tagline: 'Beats', blurb: 'Runtime check.', genre: 'Open World', cast: [{ name: 'Tester', color: '#FF7A3D' }], palette: { sky: '#1C2234', ground: '#6E7480', accent: '#FF7A3D' }, runtime: 1, scoring: 'survival' };
  insertDraft({ id: sgid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: sgcode, meta: sgmeta });
  type SS = { chapter: number; next: number | null; objective: string; due: boolean; beats: number } | null;
  type SO = { state: string; heat: number; time: number; kos: number; gm: number; boss: { name: string } | null; player: { x: number; z: number; hp: number; max: number }; enemies: { kind: string; name: string; ko: boolean }[]; story: SS };
  type SV = { on: boolean; tint: string; text: string; track: string | null; box: { x: number; y: number; size: number } | null } | null;
  // what is on the screen: the machine's layers over the canvas and its overlay, the objective line, the banner
  type SD = { layers: { cls: string; shown: boolean; blend: string }[]; overlay: boolean; objective: string | null; banner: string };
  const SD_JS = `(() => { const v = (e) => !!e && getComputedStyle(e).display !== 'none'; const o = document.querySelector('#gm .owo'), w = document.querySelector('#gm .owv');
    return { layers: [...document.querySelectorAll('body > .gmvis')].map((e) => ({ cls: e.className, shown: v(e), blend: getComputedStyle(e).mixBlendMode })), overlay: v(w),
      objective: v(o) ? o.textContent : null, banner: [...document.querySelectorAll('#gm .banner b, #gm .banner span')].map((e) => e.textContent).join(' / ') }; })()`;
  try {
    await withBrowser(async (page) => {
      const O = 'window.__gmRuntime.debug.open()';
      const so = async () => { const s = await page.eval<{ state: string; open: Omit<SO, 'state'> }>('window.__gmRuntime.state()'); return { ...s.open, state: s.state } as SO; };
      const sd = () => page.eval<SD>(SD_JS), sv = () => page.eval<SV>(`${O}.vision()`), ix = () => page.eval<{ shot: number; cast: string[] } | null>(`${O}.introState()`);
      await page.goto(`${BASE}/d/${sgid}/play`);
      for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
      await page.eval('window.__gmRuntime.debug.audio(); window.__gmRuntime.debug.start()'); await sleep(900);
      const d0 = await sd(), s0 = await so();
      ok('a story world shows its first objective under the GM board, and nothing of the machine\'s view exists before a shot asks for it',
        d0.objective === 'ObjectiveGet 100 GM' && d0.layers.length === 0 && !d0.overlay && !!s0.story && s0.story.chapter === 1 && s0.story.next === 100,
        `${JSON.stringify(d0)}, ${JSON.stringify(s0.story)}`);
      // a fight first, so there is something to keep: a knockout, the heat at 2, a blow taken
      await page.eval(`(() => { const O = ${O}; O.clear(); O.place(0, -8, null, null, false, 0); O.spawn('thug', 0, -6.9); return true; })()`); await sleep(350);
      let s1 = await so();
      for (let i = 0; i < 30 && s1.kos < 1; i++) { await page.eval(`${O}.punch()`); await sleep(220); s1 = await so(); }
      await page.eval(`(() => { const O = ${O}; O.clear(); O.heat(2); O.hurt(150); return true; })()`);
      await sleep(1600);
      // past 100 GM, as coins would bring it, with nobody driving: the scene plays as soon as the fight allows
      const pre = await so(), gIn = await page.eval<number>(`${O}.gm(${Math.max(1, 100 - pre.gm + 10)})`);
      let x0 = await ix(); for (let i = 0; i < 20 && !x0; i++) { await sleep(50); x0 = await ix(); }
      const sIn = await so();
      ok('passing 100 GM plays the first beat\'s scene as soon as the fight allows: the run stops for it, letterboxed, the next chapter begun',
        s1.kos >= 1 && gIn >= 100 && !!x0 && sIn.state === 'intro' && !!sIn.story && sIn.story.chapter === 2 && sIn.story.objective === 'Find the DJ',
        `kos ${s1.kos}, gm ${pre.gm} -> ${gIn}, ${JSON.stringify(x0)}, ${sIn.state}, ${JSON.stringify(sIn.story)}`);
      // its first shot through the machine's eyes
      await sleep(1500);
      const v1 = await sv(), d1 = await sd(), vw = await page.eval<{ w: number; h: number }>('({ w: innerWidth, h: innerHeight })');
      ok('a shot that sets vision is seen through the machine\'s eyes: its colour blended over the frame, the overlay with its lines typed out, and a box on the DJ\'s head in the frame',
        !!v1 && v1.on && v1.tint === '#FF1A1A' && /TARGET: DJ VOLT\nTHREAT: LOW/.test(v1.text) && v1.track === 'dj' && !!v1.box && v1.box.x > 0 && v1.box.x < vw.w && v1.box.y > 0 && v1.box.y < vw.h && v1.box.size >= 26 && v1.box.size < vw.h / 2
          && d1.layers.length === 3 && d1.layers.every((l) => l.shown) && ['color', 'multiply', 'screen'].every((b) => d1.layers.some((l) => l.blend === b)) && d1.overlay,
        `${JSON.stringify(v1)}, ${JSON.stringify(d1.layers)}, overlay ${d1.overlay}`);
      // the next shot sets none
      let x1 = await ix(); for (let i = 0; i < 40 && !(x1 && x1.shot === 1); i++) { await sleep(60); x1 = await ix(); }
      await sleep(200);
      const v2 = await sv(), d2 = await sd();
      ok('the next shot, which sets no vision, is the ordinary frame again', !!x1 && x1.shot === 1 && !!v2 && !v2.on && !v2.box && d2.layers.every((l) => !l.shown) && !d2.overlay,
        `${JSON.stringify(x1)}, ${JSON.stringify(v2)}, ${JSON.stringify(d2.layers)}`);
      const sMid = await so();
      await page.key('Enter'); await sleep(350);
      const x2 = await ix(), s2 = await so(), d3 = await sd();
      const dj = s2.enemies.find((e) => e.name === 'DJ Volt' && !e.ko);
      ok('Enter skips it, and the run goes on as it was: the GM, the heat, the knockouts, the time and his health kept, the DJ there to fight, the chapter\'s banner and its objective under the GM board',
        !x2 && s2.state === 'race' && s2.gm === sMid.gm && s2.gm >= gIn && s2.heat === 2 && s2.kos === pre.kos && Math.abs(s2.player.hp - pre.player.hp) < 0.5 && s2.player.hp < s2.player.max
          && s2.time >= pre.time && s2.time < pre.time + 1.5 && !!dj && /Chapter 2/.test(d3.banner) && /Find the DJ/.test(d3.banner) && d3.objective === 'ObjectiveFind the DJ' && !!s2.story && s2.story.next === 200,
        `gm ${pre.gm}/${sMid.gm} -> ${s2.gm}, heat ${pre.heat} -> ${s2.heat}, kos ${pre.kos} -> ${s2.kos}, hp ${pre.player.hp} -> ${s2.player.hp}, time ${pre.time} -> ${s2.time}, DJ ${!!dj}, banner "${d3.banner}", objective "${d3.objective}"`);
      const heard = await page.eval<{ chapter: number[]; knockout: number; heat: number }>('self.__story');
      ok('a world that tells a story hears the open world\'s moments through ctx.on: the chapter begun, the knockout, the heat',
        JSON.stringify(heard.chapter) === '[2]' && heard.knockout >= 1 && heard.heat >= 1, JSON.stringify(heard));
      // the autopilot passes the next beat's GM: no scene
      await page.eval(`window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.autopilot(true); ${O}.gm(100)`);
      let seen = false; for (let i = 0; i < 25; i++) { await sleep(80); if (await ix()) seen = true; }
      const s3 = await so();
      ok('with the autopilot driving, passing the next beat\'s GM plays no scene: the fight (and a playtest\'s boss) goes on, the beat waiting',
        !seen && s3.state === 'race' && s3.gm >= 200 && !!s3.story && s3.story.chapter === 2 && s3.story.due, `scene ${seen}, ${s3.state}, gm ${s3.gm}, ${JSON.stringify(s3.story)}`);
      // a check may still ask for it; Esc skips it
      const forced = await page.eval<boolean>(`${O}.beat(1)`); await sleep(900);
      const v4 = await sv(), x4 = await ix();
      await page.key('Escape'); await sleep(300);
      const s4 = await so(), x5 = await ix();
      let boss = s4.boss; for (let i = 0; i < 30 && !boss; i++) { await sleep(150); boss = (await so()).boss; }
      ok('a check can still ask for a beat; Esc skips it, the heat is at least the beat\'s, and its boss, by name, is on his way',
        forced && !!x4 && !!v4 && v4.on && v4.tint === '#22E0FF' && !x5 && s4.state === 'race' && s4.heat === 3 && !!s4.story && s4.story.chapter === 3 && s4.story.next === 300 && !!boss && boss.name === 'The Promoter',
        `forced ${forced}, ${JSON.stringify(x4)}, vision ${v4 && v4.tint}, ${s4.state}, heat ${s4.heat}, ${JSON.stringify(s4.story)}, boss ${JSON.stringify(boss)}`);
      // the third beat takes the heat from 3 to 6 and names no boss: what the heat brings as it rises comes all the same
      await page.eval(`${O}.clear()`);
      const forced2 = await page.eval<boolean>(`${O}.beat(2)`); await sleep(900); await page.key('Escape'); await sleep(300);
      let s4b = await so(); for (let i = 0; i < 30 && !(s4b.boss && s4b.boss.name === 'Big Lou'); i++) { await sleep(150); s4b = await so(); }
      ok('a beat that takes the heat past a third level brings that level\'s boss though it names none, and from heat 3 the police',
        forced2 && s4b.heat === 6 && !!s4b.story && s4b.story.chapter === 4 && s4b.story.next === null && !!s4b.boss && s4b.boss.name === 'Big Lou' && s4b.enemies.some((e) => e.kind === 'cop'),
        `forced ${forced2}, heat ${s4b.heat}, ${JSON.stringify(s4b.story)}, boss ${JSON.stringify(s4b.boss)}, ${s4b.enemies.map((e) => e.kind).join(',')}`);
      // a new run is chapter 1 again; a beat's GM and the goal passed at once end the run won, the goal first
      await page.eval('window.__gmRuntime.debug.invincible(false); window.__gmRuntime.debug.autopilot(false)');
      await page.eval(`${O}.hurt(99999)`); await sleep(3300); await page.key('Enter'); await sleep(900);
      const s5 = await so(), d5 = await sd();
      await page.eval(`${O}.gm(450)`); await sleep(400);
      const s6 = await so(), x6 = await ix(), res = await page.eval<{ won?: boolean; goal?: boolean; gm: number }[]>('window.__gm.results || []'), won = res[res.length - 1];
      ok('a new run is the story\'s first chapter again; passing a beat\'s GM and the goal at once ends the run won, with no beat\'s scene: the goal comes first',
        s5.state === 'race' && !!s5.story && s5.story.chapter === 1 && s5.story.objective === 'Get 100 GM' && d5.objective === 'ObjectiveGet 100 GM'
          && !x6 && s6.state === 'results' && !!won && won.won === true && won.goal === true && won.gm >= 400 && !!s6.story && s6.story.chapter === 1,
        `${s5.state}, ${JSON.stringify(s5.story)}, "${d5.objective}" -> ${s6.state}, ${JSON.stringify(s6.story)}, ${JSON.stringify(won)}`);
      // only invincible, into a new run (which counts it unassisted for the board): still no scene; then, in a run nobody
      // has driven, a boss on him: the beat waits for him; with him gone, it plays
      await page.eval('window.__gmRuntime.debug.invincible(true)'); await page.key('Enter'); await sleep(900);
      await page.eval(`(() => { const O = ${O}; O.clear(); O.gm(150); return true; })()`);
      let seen7 = false; for (let i = 0; i < 15; i++) { await sleep(80); if (await ix()) seen7 = true; }
      const s7 = await so();
      ok('a run that is only invincible plays no beat, a new run too (the drivers themselves are asked, not the board\'s flag)',
        !seen7 && s7.state === 'race' && !!s7.story && s7.story.chapter === 1 && s7.story.due, `scene ${seen7}, ${s7.state}, ${JSON.stringify(s7.story)}`);
      await page.eval('window.__gmRuntime.debug.invincible(false)'); await page.eval(`${O}.hurt(99999)`); await sleep(3300); await page.key('Enter'); await sleep(900);
      await page.eval(`(() => { const O = ${O}; O.clear(); O.boss(); return true; })()`);
      let s8 = await so(); for (let i = 0; i < 20 && !s8.boss; i++) { await sleep(100); s8 = await so(); }
      await page.eval(`${O}.gm(150)`);
      let seen8 = false; for (let i = 0; i < 18; i++) { await sleep(80); if (await ix()) seen8 = true; }
      const s9 = await so();
      await page.eval(`${O}.clear()`);
      let x9 = await ix(); for (let i = 0; i < 20 && !x9; i++) { await sleep(60); x9 = await ix(); }
      ok('a beat waits while a boss is on him (the scene would take him away), and plays once he is gone',
        !!s8.boss && !seen8 && s9.state === 'race' && !!s9.boss && !!s9.story && s9.story.due && !!x9,
        `boss ${JSON.stringify(s8.boss)}, scene while he was on ${seen8}, ${s9.state}, ${JSON.stringify(s9.story)}, then ${JSON.stringify(x9)}`);
      await page.key('Escape'); await sleep(300);
      const e1 = await page.eval<string[]>('window.__gm.errors');
      ok('a run told as a story, with its scenes and the machine\'s view, raises no error', e1.length === 0, e1.join(' | '));
    }, { timeoutMs: 180_000 });
    // on a phone held sideways (touch): a beat breaks into a fight, so a thumb still on PUNCH must not skip it; the pad
    // is put away for the scene and Skip is not under the thumb; and the objective clears the boss's bar and the pause
    await withBrowser(async (page) => {
      const O = 'window.__gmRuntime.debug.open()', W = 844, H = 390;
      await page.emulate({ width: W, height: H, mobile: true, dpr: 1 });
      await page.goto(`${BASE}/d/${sgid}/play`);
      for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
      await page.eval('window.__gmRuntime.debug.start()'); await sleep(900);
      const rect = (sel: string) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        return { x: r.x, y: r.y, w: r.width, h: r.height, vis: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && +cs.opacity > 0.05 && !!e.offsetParent }; })()`;
      type RB = { x: number; y: number; w: number; h: number; vis: boolean } | null;
      const over = (a: RB, b: RB) => !!a && !!b && a.vis && b.vis && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      const punch = await page.eval<RB>(`(() => { const b = [...document.querySelectorAll('#gm .tpad button')].find((x) => x.textContent === 'PUNCH'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, vis: true }; })()`);
      // a boss on him and the objective up: neither under the other, nor under the pause button
      await page.eval(`(() => { const O = ${O}; O.clear(); O.boss(); return true; })()`);
      for (let i = 0; i < 30 && !(await page.eval('window.__gmRuntime.state().open.boss')); i++) await sleep(150);
      await sleep(2800);
      const ob = await page.eval<RB>(rect('#gm .owo')), bb = await page.eval<RB>(rect('#gm .boss')), pb = await page.eval<RB>(rect('#gm .pause'));
      // the beat, with the thumb on PUNCH a fifth of a second in
      await page.eval(`(() => { const O = ${O}; O.clear(); O.gm(110); return true; })()`);
      let x0 = null; for (let i = 0; i < 40 && !x0; i++) { await sleep(25); x0 = await page.eval(`${O}.introState()`); }
      await sleep(150);
      const at = { x: punch ? punch.x + punch.w / 2 : W - 66, y: punch ? punch.y + punch.h / 2 : H - 70 };
      const under = await page.eval<string>(`(() => { const e = document.elementFromPoint(${at.x}, ${at.y}); return e ? (e.className || e.tagName) : 'none'; })()`);
      await page.touch('touchStart', [at]); await sleep(40); await page.touch('touchEnd', []); await sleep(250);
      const x1 = await page.eval(`${O}.introState()`), pad = await page.eval<RB>(rect('#gm .tpad')), sk = await page.eval<RB>(rect('#gm .owi .skip'));
      // after the grace, Skip is a tap away
      await sleep(600);
      await page.touch('touchStart', [{ x: sk ? sk.x + sk.w / 2 : 0, y: sk ? sk.y + sk.h / 2 : 0 }]); await sleep(40); await page.touch('touchEnd', []); await sleep(400);
      const x2 = await page.eval(`${O}.introState()`), st2 = await page.eval<string>('window.__gmRuntime.state().state'), pad2 = await page.eval<RB>(rect('#gm .tpad'));
      ok('on a phone a tap on the PUNCH spot 0.2 s into a beat does not end the scene: the pad is put away, Skip is not under the thumb, and a tap on Skip later ends it',
        !!punch && !!x0 && !!x1 && !pad?.vis && !!sk && sk.vis && !over(sk, punch) && !/skip/.test(under) && !x2 && st2 === 'race' && !!pad2 && pad2.vis,
        `PUNCH ${JSON.stringify(punch)}, under the thumb "${under}", scene ${JSON.stringify(x0)} -> after the tap ${JSON.stringify(x1)}, pad ${JSON.stringify(pad)}, skip ${JSON.stringify(sk)}, after Skip ${JSON.stringify(x2)} ${st2}, pad ${pad2 && pad2.vis}`);
      ok('on a phone held sideways the objective clears the boss\'s bar and the pause button', !!ob && ob.vis && !!bb && bb.vis && !over(ob, bb) && !over(ob, pb),
        `objective ${JSON.stringify(ob)}, boss ${JSON.stringify(bb)}, pause ${JSON.stringify(pb)}`);
      const e2 = await page.eval<string[]>('window.__gm.errors');
      ok('a story told on a phone raises no error', e2.length === 0, e2.join(' | '));
    }, { timeoutMs: 120_000, width: 844, height: 390 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(sgid); }
  // the same world without its story, and Zombie Beach: GM comes in as it did, no scene, no objective, no machine's view
  {
    const nsid = randomUUID(), a = sgcode.indexOf('      story: {'), b = sgcode.indexOf('      crew: {'), nscode = sgcode.slice(0, a) + sgcode.slice(b);
    insertDraft({ id: nsid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: nscode, meta: sgmeta });
    try {
      await withBrowser(async (page) => {
        const O = 'window.__gmRuntime.debug.open()';
        await page.goto(`${BASE}/d/${nsid}/play`);
        for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
        await page.eval('window.__gmRuntime.debug.start()'); await sleep(800);
        await page.eval(`${O}.gm(150)`); await sleep(300); await page.eval(`${O}.gm(100)`);
        let seen = false; for (let i = 0; i < 12; i++) { await sleep(80); if (await page.eval(`${O}.introState()`)) seen = true; }
        const s = await page.eval<{ gm: number; story: unknown }>('window.__gmRuntime.state().open'), d = await page.eval<SD>(SD_JS);
        ok('a world without a story plays no scene as its GM passes 100 and 200, and has no objective line and no machine\'s view',
          a > 0 && b > a && !seen && s.gm === 250 && s.story === null && d.objective === null && d.layers.length === 0 && !d.overlay, `scene ${seen}, gm ${s.gm}, story ${JSON.stringify(s.story)}, ${JSON.stringify(d)}`);
        // (and, asking for none, it hears none of the open world's moments through ctx.on, as no world did before)
        await page.eval(`${O}.heat(2)`); await sleep(200);
        const heard = await page.eval<{ chapter: number[]; knockout: number; heat: number }>('self.__story'), hs = await page.eval<number>('window.__gmRuntime.state().open.heat');
        ok('a world that tells no story (and sets no open.events) hears none of the open world\'s moments through ctx.on, as before', hs === 2 && heard.heat === 0 && heard.chapter.length === 0,
          `heat ${hs}, heard ${JSON.stringify(heard)}`);
      }, { timeoutMs: 90_000 });
    } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(nsid); }
    const zbid = randomUUID();
    insertDraft({ id: zbid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: readFileSync(new URL('../worlds/zombie-beach.js', import.meta.url), 'utf8'),
      meta: { title: 'Open Check', tagline: 'Survive', blurb: 'Runtime check.', genre: 'Open World', cast: [{ name: 'OG', color: '#FF3D7F' }], palette: { sky: '#F2A36B', ground: '#C8B48A', accent: '#FF3D7F' }, runtime: 1, scoring: 'survival' } });
    try {
      await withBrowser(async (page) => {
        const O = 'window.__gmRuntime.debug.open()';
        await page.goto(`${BASE}/d/${zbid}/play`);
        for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
        for (let i = 0; i < 150; i++) { if (await page.eval<boolean>('!!(window.__gmRuntime.state().open || {}).ready').catch(() => false)) break; await sleep(200); }
        await page.eval('window.__gmRuntime.debug.start()'); await sleep(700);
        const p = await page.eval<{ x: number; z: number }>('window.__gmRuntime.state().open.player');
        await page.eval(`(() => { const O = ${O}; window.__gmRuntime.debug.invincible(true); O.clear(); O.place(${p.x}, ${p.z}, null, null, false, 0); O.spawn('thug', ${p.x}, ${p.z + 1.1}); return true; })()`); await sleep(300);
        let o = await page.eval<{ kos: number; gm: number; story: unknown }>('window.__gmRuntime.state().open');
        for (let i = 0; i < 60 && (o.kos < 1 || o.gm < 1); i++) { await page.eval(`${O}.punch()`); await sleep(240); o = await page.eval('window.__gmRuntime.state().open'); }
        const d = await page.eval<SD>(SD_JS), e = await page.eval<string[]>('window.__gm.errors');
        ok('Zombie Beach, which tells no story: a knockout\'s GM still comes to you by the coin, with no scene, no objective line and no error',
          o.kos >= 1 && o.gm >= 1 && o.story === null && d.objective === null && d.layers.length === 0 && e.length === 0, `${o.kos} knockouts, ${o.gm} GM, ${JSON.stringify(d)}${e.length ? ', ' + e.join(' | ') : ''}`);
      }, { timeoutMs: 120_000 });
    } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(zbid); }
  }

  {
    // a dressed party crowd that dances where the world puts it (AI Alps, the owner 4 Oct: "he can pick up bottles, glasses
    // and beat club goers over the head", and "One party, rising stakes: all the action stays at the DJ party"):
    // open.civilians as an object on its own fixture (a dance floor facing the booth, a bar and a lounge, a party look, the
    // crowd turning on him, snow underfoot); then the fixture with `civilians: 12`, the street's people as they always
    // were, and with a crowd that names no look of its own (crew.civ's) and does not turn
    console.log('\nopen worlds: a party crowd dressed and placed by the world, dancing out of step, turning on him, and snow underfoot');
    const cwSrc = readFileSync(new URL('../lib/runtime/crowd-world.js', import.meta.url), 'utf8');
    type CP = { kind: string; state: string; turned: boolean; ko: boolean; x: number; z: number; yaw: number; speed: number; flee: number; d: number; body: string; stance: string;
      zone: number | null; home: [number, number] | null; rate: number | null; rest: boolean | null; late: boolean | null; dress: { shirt: number; jacket: number; pants: number; color: string; coat: string } | null;
      asked: { body: string | null; clothes: { jacket?: { kind: string } } | null; gear: unknown } | null; arm: number[] | null; hip: number[] | null };
    type CR = { on: boolean; turned: number; refills: number; breaks: number; waiting: number; people: CP[] };
    type CO = { state: string; civilians: number; player: { x: number; z: number }; enemies: { kind: string; name: string; ko: boolean; state: string }[] };
    const CZ = [{ x: 0, z: 2, r: 4.5 }, { x: -11, z: 2, r: 2.5 }, { x: 11, z: 2, r: 2.5 }], BOOTH = [0, 9];
    const cwWorld = async <T>(code: string, drive: (page: Parameters<Parameters<typeof withBrowser>[0]>[0], O: string) => Promise<T>): Promise<T> => {
      const cid = randomUUID();
      insertDraft({ id: cid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code,
        meta: { title: 'Crowd Check', tagline: 'A party', blurb: 'Runtime check.', genre: 'Open World', cast: [{ name: 'Tester', color: '#FF7A3D' }], palette: { sky: '#141A2A', ground: '#E6EAF0', accent: '#FF7A3D' }, runtime: 1, scoring: 'survival' } });
      try {
        return await withBrowser(async (page) => {
          await page.goto(`${BASE}/d/${cid}/play`);
          for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready && window.__gmRuntime.state().open && window.__gmRuntime.state().open.ready)').catch(() => false)) break; await sleep(200); }
          await page.eval('window.__gmRuntime.debug.audio(); window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.start()');
          return await drive(page, 'window.__gmRuntime.debug.open()');
        }, { timeoutMs: 150_000 });
      } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(cid); }
    };
    // the turn between two of a bone's poses, in degrees
    const turnOf = (a: number[] | null, b: number[] | null) => !a || !b ? NaN : 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) * 180 / Math.PI;
    const inZone = (p: CP) => p.zone != null && p.zone >= 0 && Math.hypot(p.x - CZ[p.zone].x, p.z - CZ[p.zone].z) <= CZ[p.zone].r + 0.6;
    const yawGap = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
    const party = (c: CR) => c.people.filter((p) => p.kind === 'civ' && !p.ko);

    await cwWorld(cwSrc, async (page, O) => {
      const cr = () => page.eval<CR>(`${O}.crowd()`), co = () => page.eval<CO>('window.__gmRuntime.state().open');
      // far from the party (no one within 30 m of him, so nobody turns yet), with nobody else about
      await page.eval(`(() => { const O = ${O}; O.clear(); O.place(0, -36, null, null, false, 0); return true; })()`);
      await sleep(2200);
      const c0 = await cr(), p0 = party(c0);
      const byZone = [0, 1, 2].map((z) => p0.filter((p) => p.zone === z).length);
      ok('a crowd stands where the world puts it: all 18 in their zones (10 on the dance floor, 4 at the bar, the lounge the rest), the floor facing the booth',
        c0.on && p0.length === 18 && byZone.join() === '10,4,4' && p0.every(inZone) && p0.filter((p) => p.zone === 0 && /^dance/.test(p.stance)).every((p) => yawGap(p.yaw, Math.atan2(BOOTH[0] - p.x, BOOTH[1] - p.z)) < 0.6),
        `${p0.length} people, by zone ${byZone.join('/')}, out of their zone ${p0.filter((p) => !inZone(p)).length}, floor facing off ${p0.filter((p) => p.zone === 0).map((p) => yawGap(p.yaw, Math.atan2(BOOTH[0] - p.x, BOOTH[1] - p.z)).toFixed(2)).join(' ')}`);
      ok('they wear what the world\'s look gives them, puffers over turtlenecks (not crew.civ\'s coat, nor the beach\'s tees and shorts), on men and women',
        p0.every((p) => !!p.dress && p.dress.jacket === 4 && p.dress.shirt === 11 && p.dress.pants === 2 && p.asked?.clothes?.jacket?.kind === 'puffer') && p0.some((p) => /female/.test(p.body)) && p0.some((p) => !/female/.test(p.body)),
        p0.map((p) => p.dress ? `${p.dress.shirt}/${p.dress.jacket}/${p.dress.pants}` : 'none').join(' '));
      // the dance floor, a quarter of a second apart: everyone dancing, and no two of a body in the same pose at once
      const fl0 = p0.filter((p) => p.zone === 0 && p.stance === 'dance');
      await sleep(250);
      const fl1 = party(await cr()).filter((p) => p.zone === 0 && p.stance === 'dance');
      const moved = fl1.map((p) => { const q = fl0.find((r) => r.home && p.home && r.home[0] === p.home[0] && r.home[1] === p.home[1]); return q ? turnOf(q.arm, p.arm) + turnOf(q.hip, p.hip) : NaN; }).filter((n) => !isNaN(n));
      // two of a body in step would hold the same pose at both moments; a chance likeness at one of them is not a step
      const same = (p: CP) => fl0.find((r) => r.home && p.home && r.home[0] === p.home[0] && r.home[1] === p.home[1]);
      const pairs: number[] = []; let inStep = 0;
      for (let i = 0; i < fl1.length; i++) for (let j = i + 1; j < fl1.length; j++) {
        if (fl1[i].body !== fl1[j].body) continue;
        const d1 = turnOf(fl1[i].arm, fl1[j].arm) + turnOf(fl1[i].hip, fl1[j].hip), a = same(fl1[i]), b = same(fl1[j]);
        pairs.push(d1);
        if (a && b && d1 < 2 && turnOf(a.arm, b.arm) + turnOf(a.hip, b.hip) < 2) inStep++;
      }
      pairs.sort((a, b) => a - b);
      const rates = p0.map((p) => p.rate ?? 0), med = pairs.length ? pairs[pairs.length >> 1] : 0;
      ok('the floor dances out of step: each at a pace of their own (0.85 to 1.15), every dancer moving, and no two of a body in the same pose',
        fl1.length >= 5 && rates.every((r) => r >= 0.85 && r <= 1.15) && Math.max(...rates) - Math.min(...rates) > 0.1 && new Set(rates.map((r) => r.toFixed(2))).size >= rates.length * 0.6
          && moved.length >= 4 && moved.every((m) => m > 2) && pairs.length >= 3 && med > 8 && inStep === 0,
        `${fl1.length} dancing, paces ${Math.min(...rates).toFixed(2)} to ${Math.max(...rates).toFixed(2)}, moved in 0.25 s ${moved.map((m) => m.toFixed(0)).join(' ')} deg, pairs apart ${pairs.map((d) => d.toFixed(0)).join(' ')} deg, ${inStep} in step`);
      // twenty seconds of the party (at four times), with nobody about
      await page.eval('window.__gmRuntime.debug.timeScale(4)');
      const seen = new Map<string, Set<string>>();
      for (let i = 0; i < 12; i++) {
        await sleep(450); await page.eval(`${O}.clear()`);
        party(await cr()).filter((p) => p.zone === 0 && p.home).forEach((p) => { const k = p.home!.join(); if (!seen.has(k)) seen.set(k, new Set()); seen.get(k)!.add(p.stance); });
      }
      await page.eval('window.__gmRuntime.debug.timeScale(1)');
      const c1 = await cr(), p1 = party(c1), stepped = [...seen.values()].filter((s) => [...s].some((n) => /^dance/.test(n)) && [...s].some((n) => ['talk', 'arms', 'shift'].includes(n))).length;
      ok('now and then a dancer steps off the floor to talk, fold their arms or shift their weight, and back; and with wander: false nobody leaves their zone',
        c1.breaks >= 1 && stepped >= 1 && p1.length === 18 && p1.every(inZone),
        `${c1.breaks} breaks, ${stepped} dancers seen off the floor and on it, ${p1.filter((p) => !inZone(p)).length} out of their zone`);
      // ten metres from the floor, with nobody after him: the next one the director wants comes out of the crowd
      await page.eval(`(() => { const O = ${O}; O.clear(); O.place(0, -8, null, null, false, 0); return true; })()`);
      let c2 = await cr();
      for (let i = 0; i < 40 && c2.turned < 1; i++) { await sleep(250); c2 = await cr(); }
      await sleep(600);
      c2 = await cr();
      const s2 = await co(), tn = c2.people.filter((p) => p.turned && !p.ko);
      ok('the next one the director wants turns from the party near him (dressed as they were, coming at him) instead of arriving out of sight',
        c2.turned >= 1 && tn.length >= 1 && tn.every((p) => p.kind === 'thug' && p.state !== 'idle' && !!p.dress && p.dress.jacket === 4 && p.dress.shirt === 11) && s2.enemies.filter((e) => !e.ko).length === tn.length,
        `${c2.turned} turned, ${JSON.stringify(tn.map((p) => ({ kind: p.kind, state: p.state, d: p.d, dress: p.dress })))}, enemies ${s2.enemies.filter((e) => !e.ko).length}`);
      // one of them knocked out on the dance floor, the hero in the middle of it: those near back off from the fight and
      // watch it (never run off to the edge of the map, as the street's people do), then come back to their spots: half
      // the floor within 8 s with him gone (38 m off, too far for anyone to turn on him); then all of them (at four times)
      await page.eval(`${O}.place(0, 0.4, null, null, false, 0)`);
      let s3 = await co(), kos0 = s3.enemies.filter((e) => e.ko).length;
      for (let i = 0; i < 80 && s3.enemies.filter((e) => e.ko).length <= kos0; i++) { await page.eval(`${O}.punch()`); await sleep(200); s3 = await co(); }
      await sleep(700);
      const c3 = await cr(), fled = party(c3).filter((p) => p.flee > 0 && p.home), off = fled.map((p) => Math.hypot(p.x - p.home![0], p.z - p.home![1]));
      await page.eval(`(() => { const O = ${O}; O.clear(); O.place(0, -36, null, null, false, 0); return true; })()`);
      for (let i = 0; i < 8; i++) { await sleep(1000); await page.eval(`${O}.clear()`); }
      const c8 = await cr(), fl8 = party(c8).filter((p) => p.zone === 0 && p.home), back8 = fl8.filter((p) => Math.hypot(p.x - p.home![0], p.z - p.home![1]) < 1.0).length;
      await page.eval('window.__gmRuntime.debug.timeScale(4)');
      let c4 = await cr();
      for (let i = 0; i < 60; i++) { await sleep(500); await page.eval(`${O}.clear()`); c4 = await cr(); if (party(c4).every((p) => p.home && Math.hypot(p.x - p.home[0], p.z - p.home[1]) < 1.0 && p.flee === 0)) break; }
      await page.eval('window.__gmRuntime.debug.timeScale(1)');
      const p4 = party(c4).filter((p) => p.zone != null && p.zone >= 0), home4 = p4.map((p) => Math.hypot(p.x - p.home![0], p.z - p.home![1]));
      ok('a knockout on the floor sends the party near it backing off from the fight, and then they come back to their own spots',
        s3.enemies.some((e) => e.ko) && fled.length >= 4 && off.filter((d) => d > 1.5).length >= 3 && Math.max(...off) < 12 && p4.length >= 15 && home4.every((d) => d < 1.0) && p4.every(inZone),
        `${fled.length} backed off (${off.map((d) => d.toFixed(1)).join(' ')} m off their spots), then ${p4.length} back, furthest ${Math.max(...home4).toFixed(2)} m`);
      ok('after a knockout on the floor, at least half the dancers are back on their spots within 8 s', fl8.length >= 6 && back8 >= fl8.length / 2,
        `${back8} of ${fl8.length} on the floor back on their spots 8 s after`);
      const late = p4.filter((p) => p.late);
      ok('a spot left by one who turned is taken again by a newcomer, dressed for the party, who walks in to it from out of sight',
        c4.refills >= 1 && late.length >= 1 && late.every((p) => !!p.dress && p.dress.jacket === 4 && inZone(p)) && p4.every((p) => !!p.dress && p.dress.jacket === 4),
        `${c4.refills} came in, ${late.length} of them at their spots, ${p4.length} at their spots in all, ${c4.waiting} spots waiting`);
      // snow underfoot: two seconds walking, then the steps heard
      await page.eval(`(() => { const O = ${O}; O.clear(); O.place(0, -25, 0, null, false); return true; })()`); await sleep(300);
      const f0 = await page.eval<{ kind: string; hero: number; near: number }>(`${O}.steps()`), a0 = (await co()).player;
      await page.key('KeyW', 'keyDown'); await sleep(2400); await page.key('KeyW', 'keyUp');
      const f1 = await page.eval<{ kind: string; hero: number; near: number }>(`${O}.steps()`), a1 = (await co()).player;
      const walked = Math.hypot(a1.x - a0.x, a1.z - a0.z), v = walked / 2.4, want = walked / Math.min(1.9, Math.max(0.7, 0.55 + 0.2 * v)), heard = f1.hero - f0.hero;
      ok('snow underfoot: his steps crunch at the stride for his pace, and others\' near him are heard too',
        f1.kind === 'snow' && walked > 2 && heard >= 3 && heard >= want * 0.6 && heard <= want * 1.4 + 1 && f1.near >= 1,
        `${walked.toFixed(1)} m walked (${v.toFixed(2)} m/s), ${heard} steps heard for about ${want.toFixed(1)}, ${f1.near} near him`);
      const e = await page.eval<string[]>('window.__gm.errors');
      ok('a party crowd raises no error', e.concat(page.errors).length === 0, e.concat(page.errors).join(' | '));
    });

    // a plain number: the street's people as they always were (crew.civ's look is not theirs), and nothing underfoot
    const ring = cwSrc.replace('civilians: CROWD,', 'civilians: 12,').replace("steps: 'snow',", '');
    await cwWorld(ring, async (page, O) => {
      const sp = await page.eval<{ x: number; z: number }>('window.__gmRuntime.state().open.player');
      const c = await page.eval<CR>(`${O}.crowd()`), civ = c.people.filter((p) => p.kind === 'civ');
      const steps = await page.eval<unknown>(`${O}.steps()`), e = await page.eval<string[]>('window.__gm.errors');
      ok('a world with civilians: 12 still has the street\'s 12 people about the place, 8 m or more from him, in the beach\'s clothes, and hears no steps',
        !c.on && civ.length === 12 && ring !== cwSrc && civ.every((p) => p.zone === null && p.rate === null && Math.hypot(p.x - sp.x, p.z - sp.z) > 7.5) && civ.every((p) => !!p.dress && p.dress.jacket === 0 && [1, 2, 4, 6].includes(p.dress.shirt)) && steps === null && e.length === 0,
        `${civ.length} people, nearest ${Math.min(...civ.map((p) => Math.hypot(p.x - sp.x, p.z - sp.z))).toFixed(1)} m, ${civ.map((p) => p.dress ? `${p.dress.shirt}/${p.dress.jacket}` : 'none').join(' ')}, steps ${JSON.stringify(steps)}`);
    });

    // a crowd with no look of its own and no turn, the motion pack listed: crew.civ's look dresses it, the floor dances the
    // pack's dances as well as the library's, and the trouble arrives out of sight
    const own = cwSrc.replace('civilians: CROWD,', 'civilians: { count: 6, zones: CROWD.zones, wander: false },')
      .replace("assets: ['human-athlete-male', 'human-athlete-female'],", "assets: ['human-athlete-male', 'human-athlete-female', 'human-moves-male', 'human-moves-female'],");
    await cwWorld(own, async (page, O) => {
      await page.eval(`(() => { const O = ${O}; O.clear(); O.place(0, -8, null, null, false, 0); return true; })()`);
      await sleep(500);
      const c0 = await page.eval<CR>(`${O}.crowd()`), p0 = party(c0), danced = new Set(p0.map((p) => p.stance));
      let s = await page.eval<CO>('window.__gmRuntime.state().open');
      for (let i = 0; i < 40 && s.enemies.length < 1; i++) { await sleep(250); s = await page.eval<CO>('window.__gmRuntime.state().open'); party(await page.eval<CR>(`${O}.crowd()`)).forEach((p) => danced.add(p.stance)); }
      const c1 = await page.eval<CR>(`${O}.crowd()`), e = await page.eval<string[]>('window.__gm.errors');
      ok('a crowd that names no look wears crew.civ\'s (a camel coat), and without turn the trouble arrives from out of sight, nobody from the party',
        c0.on && own.includes('human-moves-female') && p0.length === 6 && p0.every(inZone) && p0.every((p) => !!p.dress && p.dress.jacket === 3 && p.dress.shirt === 8) && s.enemies.length >= 1 && c1.turned === 0 && party(c1).length === 6,
        `${p0.length} people, ${p0.map((p) => p.dress ? `${p.dress.shirt}/${p.dress.jacket}` : 'none').join(' ')}, ${s.enemies.length} enemies, ${c1.turned} turned`);
      ok('with the motion pack listed, the dance floor dances its dances too', [...danced].some((n) => /^dance[A-Z]/.test(n)) && e.concat(page.errors).length === 0,
        `${[...danced].join(', ')}${e.length ? ': ' + e.join(' | ') : ''}`);
    });
  }

  {
    // a DJ set heard from the booth (music.source; AI Alps, the owner 4 Oct, picking "Funky House": "It would play from
    // the DJ booth: loud and full at the party, muffled and distant across the rest of the resort"), with, for a world
    // on its own ground, shadows and live reflections that follow the hero (graphics.shadows.follow / reflections:
    // 'hero') and everything compiled before it is ready (open.warm), on its own fixture; then the fixture without the
    // source, with plain follow and reflections and without the warm-up, which must be as every world was before
    console.log('\nopen worlds: a DJ set heard from the booth, shadows that follow the hero on his own ground, and a warm-up');
    const vnSrc = readFileSync(new URL('../lib/runtime/venue-world.js', import.meta.url), 'utf8');
    type VN = { at: number[]; on: boolean; d: number; gain: number; cutoff: number; pan: number; sub: number; wet: number; inside: boolean; crowd: number; cheers: number; close: boolean; hero: boolean; from: number[]; echo: boolean } | null;
    type VT = { id: string; lufs: number; playing: boolean; energy: number | null; gain: number; position: number | null; duck: number | null } | null;
    type VS = { state: string; venue: VN; track: VT; open: { player: { x: number; z: number; y: number; hp: number } } };
    type VM = { db: number; hi: number };
    const vnWorld = async (code: string, drive: (page: Parameters<Parameters<typeof withBrowser>[0]>[0], O: string) => Promise<void>) => {
      const vid = randomUUID();
      insertDraft({ id: vid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code,
        meta: { title: 'Venue Check', tagline: 'A set', blurb: 'Runtime check.', genre: 'Open World', cast: [{ name: 'Tester', color: '#FF7A3D' }], palette: { sky: '#141A2A', ground: '#E6EAF0', accent: '#FF7A3D' }, runtime: 1, scoring: 'survival' } });
      try {
        await withBrowser(async (page) => {
          await page.goto(`${BASE}/d/${vid}/play`);
          for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready && window.__gmRuntime.state().open && window.__gmRuntime.state().open.ready)').catch(() => false)) break; await sleep(200); }
          await page.eval('window.__gmRuntime.debug.audio()');
          // a meter on the master (before the limiter): the level in dB over a stretch, and the share of it above 3 kHz
          await page.eval(`window.__vnMeter = function (ms) {
            const A = window.__gmRuntime.debug.internals().audio, ac = A.ctx;
            if (!window.__vnAn) { const an = ac.createAnalyser(); an.fftSize = 4096; an.smoothingTimeConstant = 0; const z = ac.createGain(); z.gain.value = 0; A.master.connect(an); an.connect(z); z.connect(ac.destination); window.__vnAn = an; }
            const an = window.__vnAn, td = new Float32Array(an.fftSize), fd = new Float32Array(an.frequencyBinCount), hz = ac.sampleRate / an.fftSize;
            return new Promise((res) => { let n = 0, ss = 0, hi = 0, all = 0; const t = setInterval(() => {
              an.getFloatTimeDomainData(td); let s = 0; for (let i = 0; i < td.length; i++) s += td[i] * td[i]; ss += s / td.length;
              an.getFloatFrequencyData(fd); for (let i = 1; i < fd.length; i++) { const p = Math.pow(10, fd[i] / 10); all += p; if (i * hz > 3000) hi += p; }
              if (++n >= ms / 50) { clearInterval(t); res({ db: +(10 * Math.log10(ss / n + 1e-12)).toFixed(1), hi: +(hi / (all || 1)).toFixed(5) }); } }, 50); });
          }; true`);
          await drive(page, 'window.__gmRuntime.debug.open()');
        }, { timeoutMs: 180_000 });
      } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(vid); }
    };
    const vst = (page: Parameters<Parameters<typeof withBrowser>[0]>[0]) => page.eval<VS>('(() => { const s = window.__gmRuntime.state(); return { state: s.state, venue: s.venue, track: s.track, open: s.open }; })()');
    const meter = (page: Parameters<Parameters<typeof withBrowser>[0]>[0], ms = 1200) => page.eval<VM>(`window.__vnMeter(${ms})`);
    // the shadow-casting sun's target, its shadow map's drawn share, the live cube's camera, and the shader programs built
    const SUNQ = `(() => { const I = window.__gmRuntime.debug.internals(); let sun = null; I.scene.traverse((o) => { if (!sun && o.isDirectionalLight && o.castShadow) sun = o; });
      const sm = sun && sun.shadow.map; let drawn = null;
      if (sm) { const w = sm.width, h = sm.height, b = new Uint8Array(w * h * 4); I.renderer.readRenderTargetPixels(sm, 0, 0, w, h, b); let n = 0; for (let i = 0; i < w * h; i++) if (b[i * 4] < 250 || b[i * 4 + 1] < 250 || b[i * 4 + 2] < 250) n++; drawn = n / (w * h); }
      return { target: sun ? sun.target.position.toArray() : null, extent: sun ? sun.shadow.camera.right : null, drawn: drawn, live: I.live ? I.live.cam.position.toArray() : null, programs: I.renderer.info.programs.length }; })()`;
    type SQ = { target: number[] | null; extent: number | null; drawn: number | null; live: number[] | null; programs: number };
    // a bottle taken and broken over a man's head (the first in the run): the shader programs built before and after
    const smashOne = async (page: Parameters<Parameters<typeof withBrowser>[0]>[0], O: string) => {
      await page.eval(`(() => { const O = ${O}; O.clear(); O.place(0, -8, null, null, false, 0); O.weapon('bottle'); return true; })()`);
      let s = await page.eval<{ weapon: { kind: string } | null }>('window.__gmRuntime.state().open');
      for (let i = 0; i < 40 && !s.weapon; i++) { await sleep(60); s = await page.eval('window.__gmRuntime.state().open'); }
      await sleep(600);
      const before = (await page.eval<SQ>(SUNQ)).programs, held = s.weapon ? s.weapon.kind : null;
      for (let k = 0; k < 6 && s.weapon; k++) {
        await page.eval(`(() => { const O = ${O}; O.clear(); O.place(0, -8, null, null, false, 0); O.spawn('thug', 0, -6.9); return true; })()`); await sleep(350);
        await page.eval(`${O}.punch()`);
        for (let i = 0; i < 30 && s.weapon; i++) { await sleep(40); s = await page.eval('window.__gmRuntime.state().open'); }
      }
      await sleep(800);
      const g = await page.eval<{ shattered: number; shards: number }>(`${O}.glass()`);
      return { held, before, after: (await page.eval<SQ>(SUNQ)).programs, shattered: g.shattered, shards: g.shards };
    };

    await vnWorld(vnSrc, async (page, O) => {
      // the demo is silent; a key brings the start screen, and the set starts behind it from its intro, quietly
      const s0 = await vst(page);
      await page.key('Enter'); await sleep(1200);
      const s1 = await vst(page);
      ok('a set heard from the booth starts behind the start screen from its intro, quietly, the crowd under it; the demo before it was silent',
        !!s0.venue && !s0.track!.playing && s0.venue.crowd === 0 && s1.state === 'title' && s1.track!.playing && s1.track!.energy === 0 && s1.venue!.crowd === 0.4 && s1.venue!.on,
        `demo: playing ${s0.track!.playing}, crowd ${s0.venue?.crowd}; ${s1.state}: playing ${s1.track!.playing}, energy ${s1.track!.energy}, crowd ${s1.venue!.crowd}`);
      // the opening scene: shot by the booth, then from down the valley (the set heard from the camera)
      await page.key('Enter'); await sleep(2600);
      const i1 = await vst(page), m1 = await meter(page, 1000);
      await sleep(6400);
      const i2 = await vst(page), m2 = await meter(page, 1000);
      ok('in the opening scene the set plays on (keep), heard from the camera: loud by the booth, then quieter and duller from down the valley',
        i1.state === 'intro' && i2.state === 'intro' && i1.track!.playing && i2.track!.playing && i1.track!.energy === 1 && !i1.venue!.hero && !i2.venue!.hero
          && i1.venue!.d < 16 && i2.venue!.d > 90 && i1.venue!.gain > 0.9 && i2.venue!.gain < 0.2 && i2.venue!.cutoff < 1500 && m2.db < m1.db - 10,
        `${i1.state} ${i1.venue!.d} m: gain ${i1.venue!.gain}, ${m1.db} dB; ${i2.state} ${i2.venue!.d} m: gain ${i2.venue!.gain}, cutoff ${i2.venue!.cutoff} Hz, ${m2.db} dB; playing ${i1.track!.playing}/${i2.track!.playing}`);
      // the run: the set came out of its intro into the body of the track on the way (the drop)
      let r = await vst(page);
      for (let i = 0; i < 40 && (r.state !== 'race' || (r.track!.position ?? 0) < 17.6); i++) { await sleep(250); r = await vst(page); }
      ok('the floor cheers on the drop, the set coming out of its intro, and the set was never stopped on the way into the run',
        r.state === 'race' && r.track!.playing && (r.track!.position ?? 0) > 16.5 && r.venue!.cheers >= 1,
        `${r.state}, position ${r.track!.position} s, cheers ${r.venue!.cheers}`);
      await page.eval(`window.__gmRuntime.debug.invincible(true); ${O}.clear(); ${O}.place(0, 5, null, null, false, 0)`); await sleep(1500);
      const near = await vst(page), mn = await meter(page);
      await page.eval(`${O}.place(0, -91, null, null, false, 0)`); await sleep(1800);
      const far = await vst(page), mf = await meter(page);
      ok('by the booth it is loud and full: the booth\'s level (1.6 over the platform\'s), all its top end and the sub, on the master',
        near.venue!.hero && near.venue!.d < 5 && near.venue!.gain === 1.6 && near.venue!.cutoff === 20000 && near.venue!.sub > 0.4 && mn.db > -22,
        `${near.venue!.d} m: gain ${near.venue!.gain}, cutoff ${near.venue!.cutoff} Hz, sub ${near.venue!.sub}; ${mn.db} dB, ${(mn.hi * 100).toFixed(2)}% above 3 kHz`);
      ok('100 m off it is quiet and muffled: a tenth of the level, the top gone under 1.5 kHz, no sub, the valley\'s slap on it, and measured on the master 15 dB down with its top end gone',
        far.venue!.d > 99 && far.venue!.gain < 0.2 && far.venue!.cutoff < 1500 && far.venue!.sub === 0 && far.venue!.wet > 0 && far.venue!.echo && mf.db < mn.db - 15 && mf.hi < mn.hi / 10,
        `${far.venue!.d} m: gain ${far.venue!.gain}, cutoff ${far.venue!.cutoff} Hz, wet ${far.venue!.wet}; ${mf.db} dB, ${(mf.hi * 100).toFixed(3)}% above 3 kHz`);
      // a chalet's room, against the open at the same distance on the other side
      await page.eval(`${O}.place(-36, -15, null, null, false, 0)`); await sleep(1500);
      const rin = await vst(page), mi = await meter(page);
      await page.eval(`${O}.place(36, -15, null, null, false, 0)`); await sleep(1500);
      const rout = await vst(page), mo = await meter(page);
      ok('through a chalet\'s walls it is duller and quieter than in the open the same distance away',
        rin.venue!.inside && !rout.venue!.inside && Math.abs(rin.venue!.d - rout.venue!.d) < 0.1 && rin.venue!.gain < rout.venue!.gain * 0.5 && mi.db < mo.db - 4,
        `in ${rin.venue!.gain} (${mi.db} dB), out ${rout.venue!.gain} (${mo.db} dB) at ${rin.venue!.d} m`);
      // the side it is on: the camera turned round, the pan turns over
      const side = `(() => { const I = window.__gmRuntime.debug.internals(), v = window.__gmRuntime.state().venue, f = I.camera.getWorldDirection(new I.THREE.Vector3());
        return { pan: v.pan, side: Math.sign((v.at[0] - v.from[0]) * -f.z + (v.at[2] - v.from[2]) * f.x) }; })()`;
      await page.eval(`${O}.place(30, 9, 0, null, false, 0)`); await sleep(900);
      const pa = await page.eval<{ pan: number; side: number }>(side);
      await page.eval(`${O}.place(30, 9, ${Math.PI}, null, false, 0)`); await sleep(900);
      const pb = await page.eval<{ pan: number; side: number }>(side);
      ok('it is heard on the side of him the booth is on, from the camera\'s right: turn the camera round and it moves to the other ear',
        Math.abs(pa.pan) > 0.3 && Math.abs(pb.pan) > 0.3 && Math.sign(pa.pan) === pa.side && Math.sign(pb.pan) === pb.side && pa.side !== pb.side,
        `pan ${pa.pan} (booth to the ${pa.side > 0 ? 'right' : 'left'}), turned round ${pb.pan} (${pb.side > 0 ? 'right' : 'left'})`);
      // a man knocked out by the booth: the floor cheers, and the blow ducks the set a little
      await page.eval(`(() => { const O = ${O}; O.clear(); O.place(0, 3, null, null, false, 0); O.spawn('thug', 0, 4.2); return true; })()`); await sleep(400);
      const c0 = (await vst(page)).venue!.cheers;
      let duck = 1, k = await vst(page);
      for (let i = 0; i < 6 && k.venue!.cheers === c0; i++) {
        await page.eval(`${O}.punch()`);
        for (let j = 0; j < 14; j++) { await sleep(35); k = await vst(page); duck = Math.min(duck, k.track!.duck ?? 1); }
        if (k.venue!.cheers === c0) { await page.eval(`(() => { const O = ${O}; O.clear(); O.place(0, 3, null, null, false, 0); O.spawn('thug', 0, 4.2); return true; })()`); await sleep(350); }
      }
      ok('a man knocked out by the booth draws a cheer from the floor, and the blow cuts through the set a little (ducked, not stopped)',
        k.venue!.cheers > c0 && duck < 0.92 && duck > 0.5 && k.track!.playing, `cheers ${c0} -> ${k.venue!.cheers}, duck ${duck.toFixed(3)}`);
      // a blow he takes by the booth leaves the set alone (only his own duck it, at most every 0.4 s: a fight's every blow
      // kept it pumping)
      {
        // (away from the knockout's coins: a coin taken ducks the set too)
        await page.eval(`(() => { const O = ${O}; O.clear(); O.place(-7, 6, null, null, false, 0); return true; })()`); await sleep(1400);
        const k0 = await vst(page); await page.eval(`window.__gmRuntime.debug.invincible(false); ${O}.hurt(3)`);
        let dk = 1; for (let j = 0; j < 10; j++) { await sleep(30); dk = Math.min(dk, (await vst(page)).track!.duck ?? 1); }
        const k1 = await vst(page); await page.eval('window.__gmRuntime.debug.invincible(true)');
        ok('a blow he takes by the booth does not cut through the set', k1.open.player.hp < k0.open.player.hp && !!k1.venue && k1.venue.close && (k0.track!.duck ?? 1) > 0.97 && dk > 0.97,
          `hp ${k0.open.player.hp} -> ${k1.open.player.hp}, by the booth ${k1.venue && k1.venue.close}, duck ${(k0.track!.duck ?? 1).toFixed(3)} -> ${dk.toFixed(3)}`);
      }
      // the shadows and the live cube round the hero, on his own ground
      await page.eval(`(() => { const O = ${O}; O.clear(); O.place(20, -40, 0, null, false, 0); return true; })()`); await sleep(900);
      const sq = await page.eval<SQ>(SUNQ), hp = (await vst(page)).open.player;
      const off = sq.target ? Math.hypot(sq.target[0] - hp.x, sq.target[2] - hp.z) : 99;
      ok('with shadows.follow: \'hero\' the sun\'s shadows follow the hero on his own ground: the shadow camera a few metres ahead of him at his height, and drawn into',
        !!sq.target && off < sq.extent! * 0.5 && Math.abs(sq.target[1] - hp.y) < 2 && (sq.drawn ?? 0) > 0.0002,
        `target ${sq.target?.map((v) => v.toFixed(1)).join(', ')} against the hero at ${hp.x}, ${hp.y}, ${hp.z} (${off.toFixed(1)} m, extent ${sq.extent}); drawn ${((sq.drawn ?? 0) * 100).toFixed(2)}%`);
      ok('with reflections: \'hero\' the live cube is filmed from his chest', !!sq.live && Math.hypot(sq.live[0] - hp.x, sq.live[1] - hp.y - 1.1, sq.live[2] - hp.z) < 0.6,
        `cube at ${sq.live?.map((v) => v.toFixed(2)).join(', ')}`);
      // open.warm: the first bottle broken compiles nothing new
      const w = await smashOne(page, O);
      ok('with open.warm everything is compiled before the world is ready: the first bottle broken over a head (its shards and its spray) builds no new shader',
        w.held === 'bottle' && w.shattered === 1 && w.shards > 0 && w.after === w.before, `programs ${w.before} -> ${w.after}, shattered ${w.shattered}, shards ${w.shards}`);
      // knocked out, and the results: the set plays on
      await page.eval(`${O}.clear(); window.__gmRuntime.debug.invincible(false); ${O}.hurt(9999)`); await sleep(400);
      const kd = await vst(page); await sleep(3200);
      const rs = await vst(page), e = await page.eval<string[]>('window.__gm.errors');
      ok('it plays on through his knockout and the results (keep)', kd.state === 'crashed' && rs.state === 'results' && kd.track!.playing && rs.track!.playing && rs.track!.energy === 1,
        `${kd.state}: playing ${kd.track!.playing}; ${rs.state}: playing ${rs.track!.playing}, energy ${rs.track!.energy}`);
      ok('no errors in the venue world', e.length === 0 && page.errors.length === 0, e.concat(page.errors).join(' | '));
    });

    // the same world without the source, with plain follow and reflections, and no warm-up: as every world was before
    const plain = vnSrc.replace(/music: \{ track: 'music-funky-house', source: .*\n/, "music: { track: 'music-funky-house' },\n").replace("shadows: { follow: 'hero', extent: 30 }, reflections: 'hero'", 'shadows: { extent: 30 }, reflections: true').replace('      warm: true,\n', '');
    await vnWorld(plain, async (page, O) => {
      await page.eval(`window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.start()`); await sleep(1500);
      const s = await vst(page), noVenue = await page.eval<boolean>('!window.__gmRuntime.debug.internals().audio.venue');
      await page.eval(`(() => { const O = ${O}; O.clear(); O.place(20, -40, 0, null, false, 0); return true; })()`); await sleep(900);
      const sq = await page.eval<SQ>(SUNQ);
      ok('a world whose music names no source plays it as it always has: no venue, straight to the master, opened up for the run at the platform\'s loudness',
        !/source: \{/.test(plain) && s.venue === null && noVenue && s.state === 'race' && s.track!.playing && s.track!.energy === 1 && Math.abs(s.track!.lufs + 20 * Math.log10(s.track!.gain) + 16) < 0.2,
        `venue ${JSON.stringify(s.venue)}, ${s.state}: ${JSON.stringify(s.track)}`);
      ok('plain shadows.follow and reflections are unchanged: they keep to the lap the runtime keeps under the ground',
        plain.includes('shadows: { extent: 30 }, reflections: true') && !!sq.target && sq.target[1] < -2000 && !!sq.live && sq.live[1] < -2000, `sun target y ${sq.target?.[1].toFixed(0)}, cube y ${sq.live?.[1].toFixed(0)}`);
      const w = await smashOne(page, O);
      ok('without open.warm the first bottle broken builds its shaders then, as before', !/warm: true/.test(plain) && w.shattered === 1 && w.after > w.before,
        `programs ${w.before} -> ${w.after}, shattered ${w.shattered}`);
      await page.eval(`${O}.clear(); ${O}.intro()`); await sleep(2400);
      const i = await vst(page), e = await page.eval<string[]>('window.__gm.errors');
      ok('and its music falls away in a scene, as it always has', i.state === 'intro' && !i.track!.playing && e.length === 0 && page.errors.length === 0,
        `${i.state}: playing ${i.track!.playing}${e.length ? '; ' + e.join(' | ') : ''}`);
    });
  }

  // AI Alps' polish (5 Oct; the tune pass: the heat ran away with the takedowns and two bosses came at once at heat 12, a
  // boss nobody could put down held the story back for good, holding J out-hit every combo, the coins flew up into the
  // camera as a man dropped, the touch pad stood over the scenes' subtitles, and 437 draw calls at heat 3): open.heat's
  // kos, max, bosses, police, escort and room, story.wait, the held haymaker back to back, open.coinFly, the pad put away
  // in any scene, and the people culled, merged, freed and (open.lod) simplified far off, on their own fixture; then the
  // tank fixture and Zombie Beach without the options, as they were
  console.log('\nopen worlds: the heat held, a beat that waits only so long for a boss, the haymaker, low coins, the pad in a scene, and the people\'s cost');
  const plid = randomUUID(), plcode = readFileSync(new URL('../lib/runtime/polish-world.js', import.meta.url), 'utf8');
  const plmeta = { title: 'Polish Check', tagline: 'Polish', blurb: 'Runtime check.', genre: 'Open World', cast: [{ name: 'Tester', color: '#FF7A3D' }], palette: { sky: '#1C2234', ground: '#6E7480', accent: '#FF7A3D' }, runtime: 1, scoring: 'survival' };
  insertDraft({ id: plid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: plcode, meta: plmeta });
  type PP = { kind: string; hero: boolean; ko: boolean; fade: number; x: number; z: number; cam: number; skinned: { culled: boolean; r: number | null }[]; gear: number; face: boolean | null; weapon: { kind: string; opacity: number; transparent: boolean } | null };
  type PS = { state: string; heat: number; time: number; kos: number; gm: number; boss: { name: string; hp: number; max: number } | null; bosses?: boolean; player: { x: number; z: number; y: number; hp: number }; police: string[];
    enemies: { kind: string; name: string; hp: number; max: number; ko: boolean; d: number }[]; story: { chapter: number; due: boolean; waiting: number; waited: number; held: string | null; next: number | null } | null };
  const PO = 'window.__gmRuntime.debug.open()';
  // the coins as drawn: each live one's place (the coin mesh is the 80-instance mesh of three materials)
  const COINS = `(() => { const I = window.__gmRuntime.debug.internals(); let cm = null; I.scene.traverse((m) => { if (!cm && m.isInstancedMesh && m.count === 80 && Array.isArray(m.material) && m.material.length === 3) cm = m; });
    const a = cm.instanceMatrix.array, out = []; for (let i = 0; i < 80; i++) if (a[i * 16 + 13] > -900) out.push([a[i * 16 + 12], a[i * 16 + 13], a[i * 16 + 14]]);
    const c = I.camera.position; return { coins: out, cam: [c.x, c.y, c.z] }; })()`;
  try {
    await withBrowser(async (page) => {
      const so = async () => { const s = await page.eval<{ state: string; open: Omit<PS, 'state'> }>('window.__gmRuntime.state()'); return { ...s.open, state: s.state } as PS; };
      const people = () => page.eval<PP[]>(`${PO}.people()`);
      await page.goto(`${BASE}/d/${plid}/play`);
      for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
      // no person's body is skinned on the CPU to bound it as the run starts (a party of 22 stalled AI Alps' first frame
      // 140 ms): count three.js's own bounding of a skinned mesh through the start
      await page.eval('window.__cbs = 0; (() => { const SM = THREE.SkinnedMesh.prototype, f = SM.computeBoundingSphere; SM.computeBoundingSphere = function () { window.__cbs++; return f.apply(this, arguments); }; })(); true');
      await page.eval('window.__gmRuntime.debug.audio(); window.__gmRuntime.debug.start()'); await sleep(1500);
      const cbs = await page.eval<number>('window.__cbs'), pp0 = await people();
      const others = pp0.filter((p) => !p.hero), hero = pp0.find((p) => p.hero);
      ok('every person but the hero is drawn only where some of them could be seen: a bound round the whole body on each of their skinned meshes, and none of them skinned on the CPU as the run starts',
        cbs === 0 && others.length >= 9 && others.every((p) => p.skinned.length > 0 && p.skinned.every((k) => k.culled && (k.r || 0) > 1.6)) && !!hero && hero.skinned.every((k) => !k.culled),
        `${cbs} bounded on the CPU, ${others.length} people: ${JSON.stringify(others.slice(0, 2).map((p) => p.skinned))}, hero ${JSON.stringify(hero && hero.skinned)}`);
      const shades = others.filter((p) => p.kind === 'civ' && p.gear === 2), beanies = others.filter((p) => p.kind === 'civ' && p.gear === 3);
      ok('a person\'s gear is a draw per material: sunglasses are two (the lenses, the frame), not seven; a beanie with its pom three', shades.length >= 3 && beanies.length >= 3 && others.filter((p) => p.kind === 'civ').every((p) => p.gear === 2 || p.gear === 3),
        others.filter((p) => p.kind === 'civ').map((p) => p.gear).join(','));
      // every clip of both bodies, lying knocked out too, inside the bound
      const bm = await page.eval<{ worst: number; clip: string; clips: number; body: string }>(`${PO}.bound('thug', 9)`), bf = await page.eval<{ worst: number; clip: string; clips: number; body: string }>(`(() => { const O = ${PO}; let r = null; for (let i = 0; i < 4 && !(r && r.body === 'human-athlete-female'); i++) r = O.bound('civ', 9); return r; })()`);
      ok('every clip of the library\'s bodies, man and woman, and lying knocked out, keeps every vertex inside that bound', !!bm && !!bf && bm.clips > 40 && bf.body === 'human-athlete-female' && bm.worst < 0.95 && bf.worst < 0.95,
        `${JSON.stringify(bm)}, ${JSON.stringify(bf)}`);
      // the same picture with the culling as without it: rendered twice in one moment, nothing moving between
      await page.eval(`(() => { const O = ${PO}; O.clear(); O.place(0, 9, Math.PI, 0.15, false, 0); return true; })()`); await sleep(1200);
      const px = await page.eval<{ diff: number; a: number; b: number; lit: number; culled: number }>(`(() => {
        const I = window.__gmRuntime.debug.internals(), R = I.renderer, sc = I.scene, cam = I.camera, W = 480, H = 270;
        const rt = new THREE.WebGLRenderTarget(W, H), shoot = () => { R.setRenderTarget(rt); R.shadowMap.needsUpdate = true; R.info.reset(); const au = R.info.autoReset; R.info.autoReset = false; R.render(sc, cam); const n = R.info.render.calls; R.info.autoReset = au; const p = new Uint8Array(W * H * 4); R.readRenderTargetPixels(rt, 0, 0, W, H, p); R.setRenderTarget(null); return { p, n }; };
        const A = shoot(), flip = []; sc.traverse((m) => { if (m.isMesh && m.frustumCulled && m.isSkinnedMesh) { m.frustumCulled = false; flip.push(m); } });
        const F = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
        const out = flip.filter((m) => !F.intersectsObject(m)).length;
        const B = shoot(); flip.forEach((m) => { m.frustumCulled = true; }); rt.dispose();
        let diff = 0, lit = 0; for (let i = 0; i < A.p.length; i += 4) { if (Math.abs(A.p[i] - B.p[i]) + Math.abs(A.p[i + 1] - B.p[i + 1]) + Math.abs(A.p[i + 2] - B.p[i + 2]) > 0) diff++; if (A.p[i] + A.p[i + 1] + A.p[i + 2] > 30) lit++; }
        return { diff, a: A.n, b: B.n, lit, culled: out }; })()`);
      ok('culling draws the same picture: rendered with it and without it at the same moment, not a pixel differs, in fewer draws', px.diff === 0 && px.culled >= 2 && px.a < px.b && px.lit > 1000, JSON.stringify(px));
      // open.lod: far off, no eyeballs, brows or lashes; near, all of them
      await page.eval(`(() => { const O = ${PO}; O.place(0, -6, Math.PI, 0.15, false, 0); return true; })()`); await sleep(800);
      const far = (await people()).filter((p) => p.kind === 'civ' && p.cam > 12);
      await page.eval(`(() => { const O = ${PO}; O.place(0, 18.5, Math.PI, 0.15, false, 0); return true; })()`); await sleep(800);
      const near = (await people()).filter((p) => p.kind === 'civ' && p.cam < 8);
      ok('with open.lod a person far from the camera is drawn without the face\'s small parts, one near with them', far.length >= 3 && far.every((p) => p.face === false) && near.length >= 2 && near.every((p) => p.face === true),
        `far ${far.map((p) => `${p.cam}:${p.face}`).join(' ')}, near ${near.map((p) => `${p.cam}:${p.face}`).join(' ')}`);
      // open.heat.kos: 0, ten takedowns raise nothing
      await page.eval(`(() => { const O = ${PO}; O.clear(); O.place(0, 0, Math.PI, 0.2, false, 0); for (let i = 0; i < 10; i++) O.spawn('thug', -3 + (i % 5) * 1.5, 4 + Math.floor(i / 5) * 1.5); return true; })()`); await sleep(400);
      const h0 = await so(); const tk = await page.eval<number>(`${PO}.takedown(10)`); await sleep(500); const h1 = await so();
      ok('with open.heat.kos: 0 the heat rises by the clock alone: ten takedowns raise none', tk === 10 && h1.kos - h0.kos === 10 && h1.heat === h0.heat && h0.heat === 1, `takedowns ${tk}, kos ${h0.kos} -> ${h1.kos}, heat ${h0.heat} -> ${h1.heat}`);
      // open.coinFly: 'low': out low, away from the camera, then to him at his waist, never between him and the camera
      // (their coins taken first: he walks over them)
      await page.eval(`${PO}.place(0, 4.7, Math.PI, 0.2, false, 0)`); await sleep(3000);
      await page.eval(`(() => { const O = ${PO}; O.clear(); O.place(0, 0, Math.PI, 0.2, false, 0); O.spawn('thug', 0, 3.2); return true; })()`); await sleep(900);
      const g0 = (await so()).gm, foe = (await so()).enemies.find((e) => !e.ko), vp = (await people()).find((p) => p.kind === 'thug' && !p.ko);
      await page.eval(`${PO}.takedown(1)`);
      const stale = (await page.eval<{ coins: number[][] }>(COINS)).coins.length;
      let maxY = 0, worstDot = 1, nearer = 0, waist: number[] = [], firstSeen = -1; const t0 = Date.now();
      for (let i = 0; i < 40; i++) {
        const c = await page.eval<{ coins: number[][]; cam: number[] }>(COINS), hp = (await so()).player, at = Date.now() - t0;
        const fx = (vp?.x ?? 0) - c.cam[0], fz = (vp?.z ?? 3.2) - c.cam[2], fn = Math.hypot(fx, fz) || 1, heroD = Math.hypot(hp.x - c.cam[0], hp.z - c.cam[2]);
        if (c.coins.length && firstSeen < 0) firstSeen = at;
        c.coins.forEach(([x, y, z]) => {
          const dh = Math.hypot(x - hp.x, z - hp.z), ox = x - (vp?.x ?? 0), oz = z - (vp?.z ?? 3.2), on = Math.hypot(ox, oz);
          // the burst (before they are pulled to him, 0.45 s after they fly): low, and out the far side of him from the camera
          if (at - firstSeen < 420) { maxY = Math.max(maxY, y); if (on > 0.25) worstDot = Math.min(worstDot, (ox * fx + oz * fz) / (on * fn)); }
          else if (dh < 1.6) waist.push(y - hp.y);
          if (Math.hypot(x - c.cam[0], z - c.cam[2]) < heroD - 0.3) nearer++;
        });
        await sleep(45);
      }
      await sleep(1200); const g1 = (await so()).gm;
      ok('with open.coinFly: \'low\' a knockout\'s coins come a quarter second after he drops, out low along the ground away from the camera, then to the hero at his waist, never between him and the camera, and the GM is his',
        !!foe && stale === 0 && firstSeen >= 200 && maxY < 0.9 && worstDot > -0.05 && nearer === 0 && waist.length > 0 && Math.min(...waist) > 0.55 && Math.max(...waist) < 1.45 && g1 - g0 >= 6,
        `${stale} coins about before, first seen ${firstSeen} ms, highest ${maxY.toFixed(2)} m, worst heading ${worstDot.toFixed(2)}, ${nearer} nearer the camera than him, at him ${waist.length ? Math.min(...waist).toFixed(2) + '-' + Math.max(...waist).toFixed(2) : '-'} m, gm ${g0} -> ${g1}`);
      // the held haymaker back to back: 5, 3, 2, 2; a chain blow landing makes the next a full one
      await page.eval(`(() => { const O = ${PO}; O.clear(); O.place(0, 0, Math.PI, 0.2, false, 0); O.spawn('boss', 0, 1.3); return true; })()`); await sleep(500);
      type FL = { heavies: number; heavyK: number | null; power: number; last: string | null; act: string | null };
      const fl = () => page.eval<FL>(`${PO}.flow()`);
      // thrown through the debug hook (a hold of J, without the key timing: a press during a blow is queued as a chain
      // blow, and a landed chain blow rightly resets the run), each as soon as the last is over
      const idle = async () => { for (let i = 0; i < 160; i++) { const f = await fl() as FL & { punching?: number; dash?: unknown }; if (!(f.punching! > 0) && !f.dash) return; await sleep(20); } };
      const heavy = async () => { await idle(); const h = (await fl()).heavies; await page.eval(`${PO}.heavy()`); const f = await fl(); return f.heavies === h + 1 ? f : { ...f, power: NaN }; };
      const pw: number[] = [];
      for (let i = 0; i < 4; i++) { const f = await heavy(); pw.push(+(f.power).toFixed(2)); }
      await idle(); await page.eval(`${PO}.punch()`); await sleep(100); await idle();
      const f5 = await heavy(); await idle();
      ok('a held haymaker thrown back to back hits for less each time (5, 3, 2, 2), and one after a blow of the chain has landed is a full 5 again', JSON.stringify(pw) === '[5,3,2,2]' && f5.power === 5, `${JSON.stringify(pw)}, then ${f5.power}`);
      // (over six seconds on a boss, holding J again and again against the chain: in the game's own time, on a sparring
      // ground of its own, after Zombie Beach below)
      // a man fading out after a knockout fades alone: another's baton stays solid
      await page.eval(`(() => { const O = ${PO}; O.clear(); O.place(0, 0, Math.PI, 0.2, false, 0); O.spawn('cop', 1.6, 2.4); O.spawn('cop', -9, 9); return true; })()`); await sleep(500);
      await page.eval(`${PO}.takedown(1)`);
      let fading: PP | undefined, other: PP | undefined;
      for (let i = 0; i < 60; i++) { await sleep(150); const pl = await people(); fading = pl.find((p) => p.kind === 'cop' && p.ko); other = pl.find((p) => p.kind === 'cop' && !p.ko); if (fading && fading.fade < 0.6) break; }
      ok('a man fading out after a knockout fades alone: the baton in another man\'s hand stays solid (it shared his baton\'s material, and faded with it to nothing)',
        !!fading && fading.fade < 0.6 && !!fading.weapon && fading.weapon.opacity < 0.7 && !!other && !!other.weapon && other.weapon.opacity === 1 && !other.weapon.transparent,
        `fading ${JSON.stringify(fading && { fade: fading.fade, w: fading.weapon })}, other ${JSON.stringify(other && other.weapon)}`);
      // what people leave on the graphics card when they go: nothing
      const MEM = `(() => { const r = window.__gmRuntime.debug.internals().renderer; return { geo: r.info.memory.geometries, tex: r.info.memory.textures }; })()`;
      await page.eval(`${PO}.clear()`); await sleep(9000);
      const m0 = await page.eval<{ geo: number; tex: number }>(MEM);
      for (let r = 0; r < 3; r++) { await page.eval(`(() => { const O = ${PO}; O.clear(); for (let i = 0; i < 10; i++) O.spawn(['thug', 'cop', 'boss', 'biker'][i % 4], 8 + (i % 5), 8 + Math.floor(i / 5)); return true; })()`); await sleep(1200); await page.eval(`${PO}.clear()`); await sleep(400); }
      const m1 = await page.eval<{ geo: number; tex: number }>(MEM);
      ok('thirty people made and removed leave nothing behind on the graphics card (each took four shapes and a texture for good)', m1.geo - m0.geo <= 2 && m1.tex - m0.tex <= 1, `geometries ${m0.geo} -> ${m1.geo}, textures ${m0.tex} -> ${m1.tex}`);
      // open.heat.max: 4, the clock never takes it past; bosses and police: false, the heat sends neither
      await page.eval(`(() => { const O = ${PO}; O.clear(); O.heat(4); window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.timeScale(8); return true; })()`); await sleep(5000);
      const hm = await so();
      await page.eval(`(() => { const O = ${PO}; window.__gmRuntime.debug.timeScale(1); O.clear(); O.heat(6); return true; })()`); await sleep(2500);
      const h6 = await so();
      ok('with open.heat.max: 4 the clock never takes the heat past 4; with bosses and police: false, heat 6 sends no boss and no police',
        hm.heat === 4 && hm.time > 30 && h6.heat === 6 && !h6.boss && !h6.enemies.some((e) => (e.kind === 'boss' || e.kind === 'cop') && !e.ko) && h6.police.length === 0,
        `heat ${hm.heat} at ${hm.time.toFixed(0)} s, then ${h6.heat}: boss ${JSON.stringify(h6.boss)}, ${h6.enemies.filter((e) => !e.ko).map((e) => e.kind).join(',')}, police ${h6.police.length}`);
      // the publish gate's autopilot plays no beat, so a world whose heat sends no boss is asked for one directly: the state
      // says the heat sends none, and debug boss() still sends one (lib/playtest-runtime.ts)
      ok('a world whose heat sends no boss says so (state().open.bosses false), for the publish gate to ask for its boss directly',
        h6.bosses === false, `bosses ${JSON.stringify(h6.bosses)}`);
      // escort 1, room: a boss's men only into room under maxEnemies (3)
      await page.eval(`(() => { const O = ${PO}; O.clear(); O.spawn('thug', 6, 6); O.boss(); return true; })()`); await sleep(3500);
      const e1 = await so(), live1 = e1.enemies.filter((e) => !e.ko);
      await page.eval(`${PO}.boss()`); await sleep(3500);
      const e2 = await so(), live2 = e2.enemies.filter((e) => !e.ko);
      ok('with open.heat.escort: 1 and room: true a boss brings one man, and only into room under maxEnemies: with the house full, the next comes alone',
        live1.length === 3 && live1.filter((e) => e.kind === 'boss').length === 1 && live2.filter((e) => e.kind === 'boss').length === 2 && live2.length === 4,
        `${live1.map((e) => e.kind).join(',')} then ${live2.map((e) => e.kind).join(',')}`);
      const er = await page.eval<string[]>('window.__gm.errors');
      ok('a run with the polish options raises no error', er.length === 0, er.join(' | '));
    }, { timeoutMs: 300_000 });
    // story.wait: a beat waits 3 s for a boss on him, then plays; he is set aside for a scene that brings no boss of its
    // own and is back after it as hurt as he was, and goes with one that brings its own
    await withBrowser(async (page) => {
      const so = async () => { const s = await page.eval<{ state: string; open: Omit<PS, 'state'> }>('window.__gmRuntime.state()'); return { ...s.open, state: s.state } as PS; };
      await page.goto(`${BASE}/d/${plid}/play`);
      for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
      await page.eval('window.__gmRuntime.debug.start()'); await sleep(1000);
      await page.eval(`(() => { const O = ${PO}; O.clear(); O.place(0, 0, Math.PI, 0.2, false, 0); O.boss(); return true; })()`);
      // (he comes to the hero, and takes a few blows first, so his hurt can be seen to last)
      let s = await so(); for (let i = 0; i < 80 && !(s.boss && s.enemies.some((e) => e.kind === 'boss' && e.d < 2.4)); i++) { await sleep(250); s = await so(); }
      for (let i = 0; i < 6; i++) { await page.key('KeyJ'); await sleep(260); }
      await sleep(400);
      await page.eval(`${PO}.gm(110)`); await sleep(1500);
      const w1 = await so(), x1 = await page.eval(`${PO}.introState()`);
      let x2 = null, s2 = w1; for (let i = 0; i < 40 && !x2; i++) { await sleep(100); x2 = await page.eval(`${PO}.introState()`); s2 = await so(); }
      const lou = w1.boss;
      await sleep(900); await page.key('Enter'); await sleep(600);
      const s3 = await so(), back = s3.enemies.find((e) => e.kind === 'boss' && !e.ko);
      ok('a beat due with a boss on him waits for him only so long (story.wait 3 s) and then plays; a beat that brings no boss of its own sets him aside for the scene, and he is back after it, as hurt as he was, after the hero again',
        !!lou && lou.name === 'Big Lou' && lou.hp < lou.max && !x1 && !!w1.story && w1.story.due && w1.story.waiting > 0.5 && !!x2 && !!s2.story && s2.story.held === 'Big Lou'
          && s3.state === 'race' && !!s3.boss && s3.boss.name === 'Big Lou' && Math.abs(s3.boss.hp - lou.hp) < 0.01 && !!back && back.d < 16 && !!s3.story && s3.story.chapter === 2 && s3.story.held === null && s3.story.waited === 1,
        `boss ${JSON.stringify(lou)}, after 1.5 s ${JSON.stringify(x1)} waiting ${w1.story && w1.story.waiting}, scene ${JSON.stringify(x2)} held ${s2.story && s2.story.held}, after: ${s3.state} boss ${JSON.stringify(s3.boss)} at ${back && back.d} m, ${JSON.stringify(s3.story)}`);
      // the next names its own boss: Big Lou goes with the scene, the Promoter comes
      await page.eval(`${PO}.gm(100)`);
      let x4 = null; for (let i = 0; i < 60 && !x4; i++) { await sleep(100); x4 = await page.eval(`${PO}.introState()`); }
      await sleep(900); await page.key('Enter'); await sleep(400);
      let s4 = await so(); for (let i = 0; i < 30 && !(s4.boss && s4.boss.name === 'The Promoter'); i++) { await sleep(200); s4 = await so(); }
      ok('a beat that brings its own boss takes the one still standing away with its scene: one boss at a time',
        !!x4 && s4.state === 'race' && !!s4.boss && s4.boss.name === 'The Promoter' && !s4.enemies.some((e) => e.name === 'Big Lou' && !e.ko) && !!s4.story && s4.story.chapter === 3 && s4.story.waited === 2,
        `scene ${JSON.stringify(x4)}, ${s4.state}, boss ${JSON.stringify(s4.boss)}, ${s4.enemies.filter((e) => !e.ko).map((e) => e.name).join(',')}, ${JSON.stringify(s4.story)}`);
      const er = await page.eval<string[]>('window.__gm.errors');
      ok('a story whose beats wait for a boss raises no error', er.length === 0, er.join(' | '));
    }, { timeoutMs: 120_000 });
    // a phone: the touch pad put away in the intro and the outro, back for the run
    await withBrowser(async (page) => {
      const W = 390, H = 844;
      await page.emulate({ width: W, height: H, mobile: true, dpr: 1 });
      await page.goto(`${BASE}/d/${plid}/play`);
      for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
      await page.eval('window.__gmRuntime.debug.start()'); await sleep(800);
      const vis = (sel: string) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0; })()`;
      const run0 = await page.eval<boolean>(vis('#gm .tpad'));
      await page.eval(`${PO}.intro()`); await sleep(1600);
      const inIntro = { pad: await page.eval<boolean>(vis('#gm .tpad')), stick: await page.eval<boolean>(vis('#gm .stick')), say: await page.eval<boolean>(vis('#gm .owi .say')), state: await page.eval<string>('window.__gmRuntime.state().state') };
      await page.key('Enter'); await sleep(700);
      const run1 = { pad: await page.eval<boolean>(vis('#gm .tpad')), state: await page.eval<string>('window.__gmRuntime.state().state') };
      await page.eval(`${PO}.ending()`); await sleep(1200);
      const inOutro = { pad: await page.eval<boolean>(vis('#gm .tpad')), state: await page.eval<string>('window.__gmRuntime.state().state') };
      ok('on a phone the touch pad is put away for the intro and the outro (nothing on it works in a scene, and it stood over the subtitles), and is back for the run',
        run0 && inIntro.state === 'intro' && !inIntro.pad && !inIntro.stick && inIntro.say && run1.state === 'race' && run1.pad && inOutro.state === 'intro' && !inOutro.pad,
        `run ${run0}, intro ${JSON.stringify(inIntro)}, run ${JSON.stringify(run1)}, outro ${JSON.stringify(inOutro)}`);
    }, { timeoutMs: 90_000, width: 390, height: 844 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(plid); }
  // without the options (the tank fixture): the heat by every 8 takedowns, the coins' old arc, a boss's men on top of
  // maxEnemies, every face drawn however far, as they were
  {
    const tdid = randomUUID();
    insertDraft({ id: tdid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: readFileSync(new URL('../lib/runtime/tank-world.js', import.meta.url), 'utf8'), meta: { ...plmeta, title: 'Tank Check' } });
    try {
      await withBrowser(async (page) => {
        const so = async () => { const s = await page.eval<{ state: string; open: Omit<PS, 'state'> }>('window.__gmRuntime.state()'); return { ...s.open, state: s.state } as PS; };
        await page.goto(`${BASE}/d/${tdid}/play`);
        for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
        await page.eval('window.__gmRuntime.debug.start()'); await sleep(800);
        await page.eval(`(() => { const O = ${PO}; O.clear(); O.place(0, 0, Math.PI, 0.2, false, 0); for (let i = 0; i < 8; i++) O.spawn('thug', -3 + (i % 4) * 2, 5 + Math.floor(i / 4) * 2); return true; })()`); await sleep(300);
        const h0 = await so(); await page.eval(`${PO}.takedown(8)`); await sleep(400); const h1 = await so();
        await sleep(1500);
        await page.eval(`(() => { const O = ${PO}; O.clear(); O.place(0, 0, Math.PI, 0.2, false, 0); O.spawn('thug', 0, 3.2); return true; })()`); await sleep(700);
        await page.eval(`${PO}.takedown(1)`);
        let maxY = 0, first = -1; const t0 = Date.now();
        for (let i = 0; i < 25; i++) { const c = await page.eval<{ coins: number[][] }>(COINS); c.coins.forEach(([, y]) => { maxY = Math.max(maxY, y); if (first < 0) first = Date.now() - t0; }); await sleep(40); }
        await page.eval(`(() => { const O = ${PO}; O.clear(); O.spawn('thug', 6, 6); O.boss(); return true; })()`); await sleep(3000); await page.eval(`${PO}.boss()`); await sleep(3500);
        const e2 = await so(), live = e2.enemies.filter((e) => !e.ko);
        await page.eval(`(() => { const O = ${PO}; O.spawn('thug', 0, 26); return true; })()`); await sleep(600);
        const faces = (await page.eval<PP[]>(`${PO}.people()`)).filter((p) => !p.hero);
        ok('without the options (the tank fixture) it is as it was: 8 takedowns raise the heat, a knockout\'s coins arc up high at once, a boss\'s men come on top of maxEnemies, and every face is drawn however far (and its heat sends bosses, so the publish gate waits for its own)',
          h0.bosses === true && h1.heat === h0.heat + 1 && maxY > 1.5 && first < 200 && live.filter((e) => e.kind === 'boss').length === 2 && live.length > 3 && faces.some((p) => p.cam > 20) && faces.every((p) => p.face !== false),
          `bosses ${h0.bosses}, heat ${h0.heat} -> ${h1.heat}, coins up to ${maxY.toFixed(2)} m, first at ${first} ms, ${live.map((e) => e.kind).join(',')}, faces ${faces.map((p) => `${p.cam}:${p.face}`).join(' ')}`);
        const er = await page.eval<string[]>('window.__gm.errors');
        ok('the tank fixture raises no error', er.length === 0, er.join(' | '));
      }, { timeoutMs: 120_000 });
    } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(tdid); }
  }
  // Zombie Beach on a phone: its intro without the pad over it too (a bug fix for every world), and its people culled
  {
    const zpid = randomUUID();
    insertDraft({ id: zpid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: readFileSync(new URL('../worlds/zombie-beach.js', import.meta.url), 'utf8'),
      meta: { title: 'Open Check', tagline: 'Survive', blurb: 'Runtime check.', genre: 'Open World', cast: [{ name: 'OG', color: '#FF3D7F' }], palette: { sky: '#F2A36B', ground: '#C8B48A', accent: '#FF3D7F' }, runtime: 1, scoring: 'survival' } });
    try {
      await withBrowser(async (page) => {
        await page.emulate({ width: 844, height: 390, mobile: true, dpr: 1 });
        await page.goto(`${BASE}/d/${zpid}/play`);
        for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
        for (let i = 0; i < 150; i++) { if (await page.eval<boolean>('!!(window.__gmRuntime.state().open || {}).ready').catch(() => false)) break; await sleep(200); }
        const vis = (sel: string) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0; })()`;
        await page.eval(`${PO}.intro()`); await sleep(2500);
        const st = await page.eval<string>('window.__gmRuntime.state().state'), pad = await page.eval<boolean>(vis('#gm .tpad'));
        await page.key('Enter'); await sleep(900);
        const st2 = await page.eval<string>('window.__gmRuntime.state().state'), pad2 = await page.eval<boolean>(vis('#gm .tpad'));
        const pl = (await page.eval<PP[]>(`${PO}.people()`)).filter((p) => !p.hero);
        const er = await page.eval<string[]>('window.__gm.errors');
        ok('Zombie Beach on a phone: its intro plays without the touch pad over it, the pad is back for the run, its people are culled by their bounds, and nothing errs',
          st === 'intro' && !pad && st2 === 'race' && pad2 && pl.length >= 6 && pl.every((p) => p.skinned.every((k) => k.culled)) && er.length === 0,
          `intro ${st} pad ${pad}, run ${st2} pad ${pad2}, ${pl.length} people culled ${pl.every((p) => p.skinned.every((k) => k.culled))}${er.length ? ', ' + er.join(' | ') : ''}`);
      }, { timeoutMs: 150_000, width: 844, height: 390 });
    } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(zpid); }
  }
  // Over six seconds on a boss, J held again and again against the chain, in the game's own time: the check holds the
  // page's clock (performance.now, and every frame asked for, with debug fixedStep 60: each frame is 1/60 s however long
  // it took to draw) and its dice (Math.random, seeded afresh every frame and every key press, so nothing drawn elsewhere
  // shifts the fight's), and presses J as key events between frames, so a busy machine changes nothing (it timed 6 s of
  // real time, with taps 110 ms apart, and the chain came out 21.5 to 23 against a bar of 22.1). On a sparring ground of
  // its own: the punches-only tank (open.kicks: false), a boss of 55 who barely hits back, nobody else about (a crowd's
  // moods draw on the same dice as the boss) and the heat held at 1. Three rolls of the dice, each fought both ways: held,
  // J kept down until the haymaker comes, let go, and pressed again the next frame; the chain, J tapped every 7 frames.
  {
    const SPARRING = `(function () {
      GameMog.world({
        assets: ['human-athlete-male'],
        theme: { sky: '#1C2234', fog: '#3A4258', ink: '#FFFFFF', accent: '#FF7A3D', font: 'Oxanium' },
        camera: { distance: 5.2, height: 1.6, fov: 54 },
        open: {
          bounds: { x: [-40, 40], z: [-40, 40] }, spawn: [0, 0, 0],
          health: 1000, maxEnemies: 2, weapons: false, civilians: 0,
          kicks: false, jump: false, dodge: false, tank: true,
          heat: { kos: 0, max: 1, bosses: false, police: false },
          crew: { boss: { hp: 60, damage: 1, names: ['Big Lou'] } },
          hud: { gm: 'Fund', banner: 'A spar.' },
        },
        build: function (ctx) {
          var T = ctx.THREE;
          ctx.scene.add(new T.HemisphereLight('#C8D4EC', '#3A3630', 1.2));
          ctx.scene.add(new T.Mesh(new T.PlaneGeometry(90, 90).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: '#6E7480', roughness: 0.9 })));
        },
        player: function (ctx) {
          return ctx.assets.human('human-athlete-male', { name: 'Tester', color: '#FF7A3D', skin: 'caucasian', hair: 'short04', height: 1.95, build: { muscle: 1, lean: 0.4 } });
        },
      });
    })();`;
    type BOUT = { harm: number | null; heavies: number; blows: number; ko: boolean };
    const SEEDS = [1, 2, 3];
    const SPAR = `(async () => {
      const R = window.__gmRuntime, O = ${PO}, now0 = performance.now.bind(performance), raf0 = window.requestAnimationFrame, rnd0 = Math.random;
      const DT = 1000 / 60, SETTLE = 90, W = 360, TAIL = 36, TAP = 7, SEEDS = ${JSON.stringify(SEEDS)}, V = { t: 0, q: [], f: 0, n: 0, seed: 0 }, out = [];
      R.debug.fixedStep(60);
      window.requestAnimationFrame = (cb) => { V.q.push(cb); return 0; };
      // (the frame already asked for comes, and asks for the next: from here every frame is the check's)
      await new Promise((r) => setTimeout(r, 150));
      // (the page's clock runs behind the real one, so it never runs backwards when it is handed back)
      V.t = now0() - SEEDS.length * 2 * (SETTLE + W + TAIL) * DT - 5000; performance.now = () => V.t;
      let s = 0; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
      const dice = () => { s = (Math.imul(V.seed, 0x9E3779B1) ^ Math.imul(++V.f, 0x85EBCA77)) >>> 0; };
      const J = (type) => (document.activeElement || document.body).dispatchEvent(new KeyboardEvent(type, { code: 'KeyJ', key: 'j', keyCode: 74, bubbles: true, cancelable: true }));
      const key = (type) => { dice(); J(type); };
      const step = async (k) => { for (let i = 0; i < k; i++) { dice(); V.t += DT; const q = V.q; V.q = []; q.forEach((cb) => cb(V.t)); if (++V.n % 40 === 0) await new Promise((r) => setTimeout(r, 0)); } };
      const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0), boss = () => R.state().open.enemies.find((e) => e.kind === 'boss');
      const bout = async (how) => {
        V.f = 0;
        O.clear(); O.place(0, 0, Math.PI, 0.2, false, 0); O.spawn('boss', 0, 1.3);
        await step(SETTLE);
        const b0 = boss(), h0 = O.flow().heavies, n0 = sum(O.flow().thrown);
        if (how === 'hold') for (let i = 0; i < W;) { const h = O.flow().heavies; key('keydown'); while (i < W && O.flow().heavies === h) { await step(1); i++; } key('keyup'); if (i < W) { await step(1); i++; } }
        else for (let i = 0; i < W; i += TAP) { key('keydown'); key('keyup'); await step(Math.min(TAP, W - i)); }
        await step(TAIL);
        const b1 = boss(), f1 = O.flow();
        return { harm: b0 && b1 ? +(b0.hp - b1.hp).toFixed(2) : null, heavies: f1.heavies - h0, blows: sum(f1.thrown) - n0, ko: !b1 || b1.ko };
      };
      try { for (const sd of SEEDS) { V.seed = sd; out.push({ seed: sd, hold: await bout('hold'), tap: await bout('tap') }); } }
      finally {
        J('keyup'); Math.random = rnd0;
        delete performance.now; if (typeof performance.now !== 'function') performance.now = now0;
        window.requestAnimationFrame = raf0; R.debug.fixedStep(0);
        const q = V.q; V.q = []; q.forEach((cb) => raf0.call(window, cb));
      }
      return out;
    })()`;
    const spid = randomUUID();
    insertDraft({ id: spid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: SPARRING, meta: { ...plmeta, title: 'Spar Check' } });
    try {
      await withBrowser(async (page) => {
        await page.goto(`${BASE}/d/${spid}/play`);
        for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
        await page.eval('window.__gmRuntime.debug.audio(); window.__gmRuntime.debug.start()');
        for (let i = 0; i < 60 && (await page.eval<string>('window.__gmRuntime.state().state')) !== 'race'; i++) await sleep(100);
        const sp = await page.eval<{ seed: number; hold: BOUT; tap: BOUT }[]>(SPAR);
        const er = (await page.eval<string[]>('window.__gm.errors')).concat(page.errors);
        ok('over six seconds on a boss, holding J again and again does clearly less harm than the chain',
          sp.length === SEEDS.length && sp.every((r) => r.hold.harm != null && r.tap.harm != null && r.hold.harm > 0 && r.hold.heavies >= 4 && r.tap.heavies === 0 && r.tap.harm > r.hold.harm * 1.3 && !r.hold.ko && !r.tap.ko) && er.length === 0,
          `${sp.map((r) => `dice ${r.seed}: held haymakers ${r.hold.harm} (${r.hold.heavies} thrown), the chain ${r.tap.harm} (${r.tap.blows} blows)`).join('; ')}${er.length ? '; ' + er.join(' | ') : ''}`);
      }, { timeoutMs: 120_000 });
    } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(spid); }
  }

  // Every punch lands (open.impact; the owner, 5 Oct, on the first Mog of AI Alps: "punches don't feel satisfying like are
  // connecting and giving me the feeling of a hit"). On for a hero who only punches (open.kicks: false) or a world that
  // asks, off everywhere else. On its own fixture: every blow of a chain lands with the fist on the face (the chin, the
  // ribs), the man's head turned on the frame it lands, a stop held and eased, the camera kicked and its lens narrowed, a
  // flash, a ring and sweat at the fist; a hook and then a hold are two motions (the held haymaker after the boxer's hook
  // is his rear uppercut), both landing; the hit is the prior thud, louder (the owner, 5 Oct, of a crack that replaced it:
  // "u downgraded punch sound effect to sound like a tap, go back to prior sound effect just make it louder and
  // experience more dramatic"), a sub under a heavy blow and a dark room after a knockout; a heavy blow stops longer and
  // kicks the camera harder, a knockout longer still, in a longer slow motion, the camera punched in, and the crowd near
  // it lets out an "ooh"; the jab, the cross and the hook stop as they did. Then as a boxer (the Typson Mog's fight),
  // where a man out of reach is still missed; with impact: false (the runtime as it was); and Zombie Beach (it kicks:
  // none of it)
  console.log('\nopen worlds: every punch lands (open.impact): the magnetism, the snap, the stop, the camera, the flash and the hit');
  {
    const imcode = readFileSync(new URL('../lib/runtime/impact-world.js', import.meta.url), 'utf8');
    const immeta = { title: 'Impact Check', tagline: 'Every punch lands', blurb: 'Runtime check.', genre: 'Open World', cast: [{ name: 'Tester', color: '#FF7A3D' }], palette: { sky: '#1A2236', ground: '#8E8676', accent: '#FF7A3D' }, runtime: 1, scoring: 'survival' };
    type IL = { clip: string | null; kind: string; power: number; ko: boolean; gap: number | null; on: string | null; magnet: boolean | null; moved: number; aim: number; pitch: number; d: number | null;
      stop: number[]; fx: boolean; react: number | null; reactAfter: number | null; froze: { real: number; game: number; held: number } | null; lens: number; time: number; kick: number; slow: number; push: number };
    type IS = { on: boolean; H: number; hits: number; blow: { clip: string; magnet: boolean | null; moved: number; done: boolean } | null; snaps: number; sounds: number; oohs: number; last: IL | null; stop: number | null; camera: unknown; fx: { flashes: number; rings: number; sweat: number; made: boolean } | null; snapping: number; lean: number };
    const IO = 'window.__gmRuntime.debug.open()';
    const imp = (p: { eval<T>(e: string): Promise<T> }) => p.eval<IS>(`${IO}.impact()`);
    // the sound measured: RBJ biquads for the bands (under 400 Hz, over 2 kHz, under 60 Hz, over 1 kHz), shares of the
    // energy, the peak (dB), the loudest 50 ms (dB), the tone's pitch (zero crossings of the part under 400 Hz, 5-30 ms and
    // 60-110 ms after the blow), the sub (RMS under 60 Hz 0.2-0.4 s after it, when the tone is over), the room (RMS 0.3-0.8 s
    // after it, and its share over 1 kHz)
    const bq = (x: ArrayLike<number>, sr: number, hp: boolean, f: number) => {
      const w = 2 * Math.PI * f / sr, c = Math.cos(w), al = Math.sin(w) / (2 * Math.SQRT1_2), b0 = hp ? (1 + c) / 2 : (1 - c) / 2, b1 = hp ? -(1 + c) : 1 - c, a0 = 1 + al, a1 = -2 * c, a2 = 1 - al, y = new Float64Array(x.length);
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = (b0 * x[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y;
    };
    const dB = (v: number) => +(20 * Math.log10(Math.max(1e-9, v))).toFixed(2);
    const hear = (r: { sr: number; at: number; samples: number[] }) => {
      const s = r.samples, sr = r.sr, i0 = Math.round(r.at * sr), lp = (f: number) => bq(bq(s, sr, false, f), sr, false, f), hp = (f: number) => bq(bq(s, sr, true, f), sr, true, f);
      const lo = lp(400), hi = hp(2000), sub = lp(60), hk = hp(1000);
      let E = 0, El = 0, Eh = 0, pk = 0; for (let i = 0; i < s.length; i++) { E += s[i] * s[i]; El += lo[i] * lo[i]; Eh += hi[i] * hi[i]; pk = Math.max(pk, Math.abs(s[i])); }
      const n50 = Math.round(0.05 * sr); let e = 0, m = 0; for (let i = 0; i < s.length; i++) { e += s[i] * s[i]; if (i >= n50) e -= s[i - n50] * s[i - n50]; m = Math.max(m, e); }
      const win = (a: ArrayLike<number>, m0: number, m1: number) => { let v = 0, n = 0; for (let i = i0 + Math.round(m0 * sr); i < Math.min(a.length, i0 + Math.round(m1 * sr)); i++) { v += a[i] * a[i]; n++; } return Math.sqrt(v / Math.max(1, n)); };
      const zc = (m0: number, m1: number) => { let n = 0; for (let i = i0 + Math.round(m0 * sr) + 1; i < i0 + Math.round(m1 * sr); i++) if ((lo[i - 1] < 0) !== (lo[i] < 0)) n++; return Math.round(n / 2 / (m1 - m0)); };
      const room = win(s, 0.3, 0.8);
      return { peak: dB(pk), rms50: dB(Math.sqrt(m / n50)), low: +(El / (E || 1)).toFixed(3), bright: +(Eh / (E || 1)).toFixed(4), pitch: [zc(0.005, 0.03), zc(0.06, 0.11)], sub: dB(win(sub, 0.2, 0.4)), room: dB(room), roomBright: +((win(hk, 0.3, 0.8) / (room || 1)) ** 2).toFixed(3) };
    };
    // the prior thud, as open.js plays it on a punch where the impact is off (thud(min(4, power)): a sine falling from
    // 120 + 30 x power Hz to 45 Hz and noiseBand(0.09, 0.35 + 0.2 x power, 2400, 500)), rendered as impactAudio renders
    // the impact's (raw, or through a copy of the game's master)
    const PRIOR = (power: number, chain: boolean) => `((power, chain) => {
      const A = window.__gmRuntime.debug.internals().audio, sr = 48000, at = chain ? 0.5 : 0.01, oc = new OfflineAudioContext(1, Math.round(sr * (at + 1)), sr), out = oc.createGain(); let end = out;
      if (chain) { const mg = oc.createGain(), lim = oc.createDynamicsCompressor(); mg.gain.value = A.master.gain.value; for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) lim[k].value = A.limiter[k].value; out.connect(mg); mg.connect(lim); end = lim; }
      end.connect(oc.destination);
      const o = oc.createOscillator(), g = oc.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(120 + power * 30, at); o.frequency.exponentialRampToValueAtTime(45, at + 0.16);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.5 + power * 0.25, at + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
      o.connect(g); g.connect(out); o.start(at); o.stop(at + 0.22);
      const dur = 0.09, n = Math.floor(sr * dur), buf = oc.createBuffer(1, n, sr), ch = buf.getChannelData(0);
      for (let i = 0; i < n; i++) { const u = i / n; ch[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * u) * (1 - u); }
      const s = oc.createBufferSource(), ng = oc.createGain(), f = oc.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(2400, at); f.frequency.exponentialRampToValueAtTime(500, at + dur);
      ng.gain.value = 0.35 + power * 0.2; s.buffer = buf; s.connect(f); f.connect(ng); ng.connect(out); s.start(at);
      return oc.startRendering().then((b) => ({ sr, at, samples: Array.from(b.getChannelData(0)) }));
    })(${Math.min(4, power)}, ${chain})`;
    // a chain thrown at a man (a thug, who takes it) dist metres in front, and what each blow that landed did; while
    // each lands, whether the flash, the ring, the sweat and the camera's kick were seen
    const CHAIN = (dist: number, n: number) => `(async () => { const O = ${IO}, wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const p = window.__gmRuntime.state().open.player; O.clear(); O.place(p.x, p.z, Math.PI, 0.12, false); O.spawn('thug', p.x, p.z + ${dist}); await wait(250);
      const out = [], seen = { flash: 0, ring: 0, sweat: 0, camera: 0, snapping: 0, lean: 0 }; let t = O.impact().last ? O.impact().last.time : -1;
      for (let i = 0; i < ${n}; i++) { O.punch();
        for (let k = 0; k < 11; k++) { await wait(30); const s = O.impact(); if (s.fx) { seen.flash = Math.max(seen.flash, s.fx.flashes); seen.ring = Math.max(seen.ring, s.fx.rings); seen.sweat = Math.max(seen.sweat, s.fx.sweat); }
          if (s.camera) seen.camera++; seen.snapping = Math.max(seen.snapping, s.snapping); seen.lean = Math.max(seen.lean, Math.abs(s.lean)); }
        const l = O.impact().last; if (l && l.time !== t) { t = l.time; out.push(l); } }
      await wait(400); const l = O.impact().last; if (out.length && l && l.time === out[out.length - 1].time) out[out.length - 1] = l;
      return { blows: out, seen, flow: O.flow() }; })()`;
    type CH = { blows: IL[]; seen: { flash: number; ring: number; sweat: number; camera: number; snapping: number; lean: number }; flow: { last: string | null } };
    const boot = async (page: { goto(u: string): Promise<void>; eval<T>(e: string): Promise<T>; key(k: string, t?: 'keyDown' | 'keyUp'): Promise<void> }, id: string) => {
      await page.goto(`${BASE}/d/${id}/play`);
      for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
      await page.key('Enter'); await sleep(400);
      await page.eval('window.__gmRuntime.debug.audio(); window.__gmRuntime.debug.start()'); await sleep(700);
      await page.eval('window.__gmRuntime.debug.invincible(true)');
    };
    const imid = randomUUID();
    insertDraft({ id: imid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: imcode, meta: immeta });
    try {
      await withBrowser(async (page) => {
        await boot(page, imid);
        const s0 = await imp(page);
        ok('a hero who only punches (open.kicks: false) has the impact on, its flash, ring and sweat made with the world', s0.on && !!s0.fx && s0.fx.made && s0.hits === 0, JSON.stringify({ on: s0.on, fx: s0.fx }));
        const c = await page.eval<CH>(CHAIN(1.45, 5));
        const B = c.blows, fmt = (l: IL) => `${l.clip} gap ${l.gap} m (${l.on}), pulled ${l.moved} m, aim ${l.aim}°, lean ${l.pitch}°, head ${l.react}° after ${l.reactAfter} s`;
        // (the face and the chin are aimed at a little over the head's joint; the ribs at the spine, deeper in him)
        ok('every blow of a chain lands: the fist within a quarter metre of what it was aimed at (the face, the chin; 0.3 m of the spine for the ribs), the two pulled together no more than they needed',
          B.length >= 4 && B.every((l) => l.magnet === true && l.gap != null && l.gap <= (l.on === 'body' ? 0.3 : 0.25) && l.moved <= 0.95) && new Set(B.map((l) => l.clip)).size >= 3, B.map(fmt).join('; '));
        ok('the man reacts on the frame it lands: his head turned 8 degrees or more on the first frame drawn after it, over his own flinch',
          B.length >= 4 && B.every((l) => l.react != null && l.react >= 8 && l.reactAfter != null && l.reactAfter <= 0.02) && c.seen.snapping >= 1, B.map((l) => `${l.clip} ${l.react}° after ${l.reactAfter} s`).join(', '));
        ok('the stop is held and eased (the game at under a third of its pace through it), the camera kicked, its lens narrowed, and a flash, a ring and sweat at the fist',
          B.every((l) => !!l.froze && l.froze.real >= 0.06 && l.froze.held >= 2 && l.froze.game / l.froze.real <= 0.34 && l.lens >= 0.8) && c.seen.flash >= 1 && c.seen.ring >= 1 && c.seen.sweat > 0 && c.seen.camera > 0,
          `${B.map((l) => `${l.clip}: ${l.froze ? `${l.froze.game} s of game in ${l.froze.real} s, ${l.froze.held} frames still` : 'no stop'}, lens -${l.lens}°`).join('; ')}; seen ${JSON.stringify(c.seen)}`);
        // (the drama raised on a heavy blow and a knockout only: the chain's blows stop and kick as they did, so it stays quick)
        const lite = B.filter((l) => !l.ko && l.power < 3);
        ok('the chain\'s blows stop and kick the camera as they did (a jab or a cross 55 ms, a hook or a body shot 70 ms, eased 35 ms; the kick 0.048 m, 0.06 m for the hook), so it stays quick',
          lite.length >= 3 && lite.every((l) => l.stop[0] === (l.power >= 1.5 ? 0.07 : 0.055) && l.stop[1] === 0.035 && Math.abs(l.kick - (l.power >= 1.5 ? 0.06 : 0.048)) < 1e-4 && l.slow === 0 && l.push === 0),
          lite.map((l) => `${l.clip} (${l.power}): stop ${l.stop.join('+')} s, kick ${l.kick} m`).join('; '));
        // a hook and then a hold (J pressed as the chain's hook is thrown, and kept down): the hook is the boxer's here
        // (FFPI), and so is the held haymaker, so the hold throws his rear uppercut instead; both land with the man's
        // reaction (a fresh man, in reach, for each blow until the chain throws its hook)
        const hh = await page.eval<{ blows: IL[]; after: string | null; act: string | null; heavies: number; tries: number }>(`(async () => { const O = ${IO}, wait = (ms) => new Promise((r) => setTimeout(r, ms));
          const S = () => window.__gmRuntime.state().open, key = (t) => window.dispatchEvent(new KeyboardEvent(t, { code: 'KeyJ', bubbles: true })), h0 = O.flow().heavies;
          let tries = 0;
          for (; tries < 14; tries++) {
            const p = S().player, f0 = O.foes()[0];
            if (!f0 || f0.ko || f0.hp < 30 || Math.hypot(f0.x - p.x, f0.z - p.z) > 1.7) { O.clear(); O.place(p.x, p.z, Math.PI, 0.12, false); O.spawn('thug', p.x, p.z + 1.45); await wait(250); }
            // tap only when nothing is playing, so the tap is thrown at once and not queued behind a blow
            for (let w = 0; w < 80 && (O.flow().punching > 0 || O.flow().dash); w++) await wait(25);
            O.punch(); const f = O.flow(); if (f.last === 'hook' && f.clip === 'hook' && f.punching > 0) break; await wait(450);
          }
          const t0 = S().time; key('keydown');
          const seen = new Map(); let act = null;
          for (let i = 0; i < 80; i++) { await wait(20); const l = O.impact().last; if (l && l.time >= t0) seen.set(l.time, l); const f = O.flow(); if (f.heavies > h0 && f.last === 'heavy' && f.act) act = act || f.act; }
          key('keyup'); await wait(200); const l = O.impact().last; if (l && seen.has(l.time)) seen.set(l.time, l);
          const f = O.flow(); return { blows: [...seen.values()], after: f.heldAfter, act, heavies: f.heavies - h0, tries }; })()`);
        const [hk, hv] = hh.blows, lands = (l: IL | undefined) => !!l && l.magnet === true && l.gap != null && l.gap <= 0.25 && (l.react || 0) >= 8 && l.reactAfter != null && l.reactAfter <= 0.02;
        ok('a hook and then a hold are two blows: the held haymaker after the chain\'s hook (the boxer\'s, as the held one is) is his rear uppercut, and both land with the man\'s reaction',
          hh.tries < 14 && hh.heavies === 1 && hh.after === 'hook' && hh.act === 'uppercut' && hh.blows.length === 2 && hk.clip === 'hook' && hk.kind !== 'heavy' && hv.clip === 'uppercut' && hv.kind === 'heavy' && hv.power >= 5 && lands(hk) && lands(hv),
          `${hh.tries + 1} taps to the hook; the hold threw ${hh.act} after ${hh.after}; ${hh.blows.map((l) => `${l.clip} (${l.kind}, ${l.power}) gap ${l.gap} m, head ${l.react}° after ${l.reactAfter} s`).join('; ')}`);
        ok('a held haymaker lands with more drama: its stop held 110 ms (90 before), the camera kicked 30% harder (0.0975 m, from 0.075)',
          !!hv && (hv.ko ? hv.stop[0] === 0.15 : hv.stop[0] === 0.11 && hv.stop[1] === 0.05) && Math.abs(hv.kick - (hv.ko ? 0.1248 : 0.0975)) < 1e-4 && !!hv.froze && hv.froze.real >= 0.11,
          hv ? `${hv.clip} (${hv.power}${hv.ko ? ', a knockout' : ''}): stop ${hv.stop.join('+')} s, ${hv.froze ? `${hv.froze.game} s of game in ${hv.froze.real} s` : 'no stop'}, kick ${hv.kick} m` : 'no held blow');
        // the hit, as heard: rendered offline as the game plays it (raw, into the effects' bus, and through a copy of the
        // master: its gain and its limiter), against the prior thud at the same power rendered the same way
        const kinds: [string, number, boolean][] = [['jab', 1, false], ['cross', 1, false], ['hook', 1.5, false], ['upper', 1, false], ['body', 1.5, false], ['heavy', 3, false], ['heavy', 5, false], ['heavy', 5, true]];
        const H: Record<string, ReturnType<typeof hear>> = {}, HC: Record<string, ReturnType<typeof hear>> = {}, P: Record<string, ReturnType<typeof hear>> = {}, PC: Record<string, ReturnType<typeof hear>> = {};
        for (const [k, p, ko] of kinds) {
          const n = k + (k === 'heavy' ? p : '') + (ko ? 'KO' : '');
          H[n] = hear(await page.eval<{ sr: number; at: number; samples: number[] }>(`${IO}.impactAudio('${k}', ${p}, ${ko}, false, false)`));
          HC[n] = hear(await page.eval<{ sr: number; at: number; samples: number[] }>(`${IO}.impactAudio('${k}', ${p}, ${ko}, false, true)`));
          P[n] = hear(await page.eval<{ sr: number; at: number; samples: number[] }>(PRIOR(p, false)));
          PC[n] = hear(await page.eval<{ sr: number; at: number; samples: number[] }>(PRIOR(p, true)));
        }
        const s1 = await imp(page), light = ['jab', 'cross', 'hook', 'upper', 'body'], all = Object.keys(H), up = (n: string, k: 'peak' | 'rms50', C = false) => +((C ? HC : H)[n][k] - (C ? PC : P)[n][k]).toFixed(2);
        // (the prior thud, measured the same way: 83-94% of its energy under 400 Hz, about 1% over 2 kHz, its tone falling
        // from about 120-200 Hz to 80-100 Hz; the crack it was replaced by had half its energy or more over 2 kHz)
        ok('the hit is the prior thud: its energy mostly low (80% or more under 400 Hz), nothing bright (3% or less over 2 kHz, no crack), its tone falling (at least a fifth lower 60-110 ms after the blow than in its first 30 ms); one sound for every blow landed',
          all.every((n) => H[n].low >= 0.8 && H[n].bright <= 0.03 && H[n].pitch[1] > 0 && H[n].pitch[0] >= H[n].pitch[1] * 1.2) && s1.sounds === s1.hits,
          `${all.map((n) => `${n}: ${Math.round(H[n].low * 100)}% low, ${(H[n].bright * 100).toFixed(1)}% bright, ${H[n].pitch[0]} -> ${H[n].pitch[1]} Hz (the prior ${Math.round(P[n].low * 100)}%, ${(P[n].bright * 100).toFixed(1)}%, ${P[n].pitch[0]} -> ${P[n].pitch[1]} Hz)`).join('; ')}; ${s1.sounds} sounds for ${s1.hits} blows`);
        // (the prior heavy blow, thud(4), already reached the master's limiter: a higher peak there would only be squashed,
        // so a heavy blow's peak is held at it and it is louder by its weight: a fuller, longer tone and the sub)
        ok('louder than the prior thud: 4 dB or more at its peak for the chain\'s blows (a heavy blow 1.5 dB or more, its peak held at the limiter\'s ceiling, 1 dB over full scale at most), and through the game\'s master every blow 4 dB or more louder over its loudest 50 ms',
          light.every((n) => up(n, 'peak') >= 4) && all.every((n) => up(n, 'peak') >= 1.5 && up(n, 'rms50', true) >= 4 && HC[n].peak <= 1),
          all.map((n) => `${n}: peak ${up(n, 'peak') >= 0 ? '+' : ''}${up(n, 'peak')} dB, through the master peak ${HC[n].peak} dBFS (the prior ${PC[n].peak}), loudest 50 ms +${up(n, 'rms50', true)} dB (${HC[n].rms50} dBFS)`).join('; '));
        ok('a heavy blow and a knockout carry a sub (20 dB or more over a jab\'s under 60 Hz, 0.2-0.4 s after the blow); a knockout a room after it, dark (5% or less of it over 1 kHz), and no other blow one',
          ['heavy3', 'heavy5', 'heavy5KO'].every((n) => H[n].sub >= H.jab.sub + 20) && light.every((n) => H[n].sub < H.heavy3.sub - 20) && H.heavy5KO.room >= H.heavy5.room + 30 && H.heavy5KO.room >= -40 && H.heavy5KO.roomBright <= 0.05 && all.filter((n) => n !== 'heavy5KO').every((n) => H[n].room < -60),
          `sub (dB): ${all.map((n) => `${n} ${H[n].sub}`).join(', ')}; room (dB): ${all.map((n) => `${n} ${H[n].room}`).join(', ')}; the knockout's room ${Math.round(H.heavy5KO.roomBright * 100)}% over 1 kHz`);
        // a knockout: a man who drops at the first blow, the crowd at the bar ten metres off (the "ooh" is at most one
        // every 1.6 s: the chain's uppercut may have had one)
        await sleep(1800);
        const k0 = await imp(page);
        await page.eval(`(() => { const O = ${IO}, p = window.__gmRuntime.state().open.player; O.clear(); O.place(p.x, p.z, Math.PI, 0.12, false); O.spawn('biker', p.x, p.z + 1.4); return true; })()`); await sleep(300);
        await page.key('KeyJ', 'keyDown'); await sleep(260);
        let ko: IL | null = null, slow = 0;
        for (let i = 0; i < 40; i++) { await sleep(25); const s = await imp(page); if (s.last && s.last.ko && (!k0.last || s.last.time !== k0.last.time)) ko = s.last; slow = Math.max(slow, (await page.eval<{ slow: number }>(`${IO}.flow()`)).slow); if (ko && i > 20) break; }
        await page.key('KeyJ', 'keyUp'); await sleep(500);
        const k1 = await imp(page);
        ok('a knockout lands harder: its stop held 150 ms (120 before), 0.7 s of slow motion as he goes down (0.5 before), the camera kicked 30% harder and punched in toward him a moment, and the crowd near him lets out an "ooh"',
          !!ko && ko.stop[0] === 0.15 && ko.slow === 0.7 && slow >= 0.55 && Math.abs(ko.kick - 0.1248) < 1e-4 && ko.push >= 0.15 && k1.oohs > k0.oohs,
          `${ko ? `${ko.clip} at ${ko.power}, stop ${ko.stop.join('+')} s, gap ${ko.gap}, kick ${ko.kick} m, punched in ${ko.push} m` : 'no knockout'}, slow motion ${slow} s, oohs ${k0.oohs} -> ${k1.oohs}`);
        const e = await page.eval<string[]>('window.__gm.errors');
        ok('the impact raises no error', e.length === 0, e.join(' | '));
      }, { timeoutMs: 150_000 });
    } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(imid); }
    // as a boxer (fight: 'boxing', the Typson Mog's): the jab, the cross and the hook land; a man out of reach is missed
    const bxid = randomUUID();
    insertDraft({ id: bxid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: imcode.replace('kicks: false, jump: false,', "fight: 'boxing', kicks: false, jump: false,"), meta: immeta });
    try {
      await withBrowser(async (page) => {
        await boot(page, bxid);
        const c = await page.eval<CH>(CHAIN(1.45, 3));
        ok('a boxer (the Typson Mog\'s fight): the jab, the cross and the hook land on the face, and the man reacts on the frame',
          c.blows.length === 3 && c.blows.every((l) => l.gap != null && l.gap <= 0.25 && (l.react || 0) >= 8) && c.blows.map((l) => l.clip).join() === 'jab,cross,hook', c.blows.map((l) => `${l.clip} gap ${l.gap} m, head ${l.react}°`).join('; '));
        const m0 = await imp(page);
        const far = await page.eval<{ hp0: number; hp1: number; d0: number; d1: number }>(`(async () => { const O = ${IO}, p = window.__gmRuntime.state().open.player; O.clear(); O.place(p.x, p.z, Math.PI, 0.12, false); O.spawn('thug', p.x, p.z + 2.7);
          await new Promise((r) => setTimeout(r, 200)); const f0 = O.foes()[0], d0 = Math.hypot(f0.x - p.x, f0.z - p.z); O.punch(); await new Promise((r) => setTimeout(r, 650));
          const q = window.__gmRuntime.state().open.player, f1 = O.foes()[0]; return { hp0: f0.hp, hp1: f1.hp, d0, d1: Math.hypot(f1.x - q.x, f1.z - q.z) }; })()`);
        const m1 = await imp(page);
        ok('a man out of reach is not pulled in: the blow still misses him', far.hp1 === far.hp0 && m1.hits === m0.hits && !!m1.blow && m1.blow.magnet !== true && m1.blow.moved === 0,
          `hp ${far.hp0} -> ${far.hp1}, ${far.d0.toFixed(2)} m away when thrown, hits ${m0.hits} -> ${m1.hits}, the blow ${JSON.stringify(m1.blow)}`);
      }, { timeoutMs: 120_000 });
    } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(bxid); }
    // impact: false (the runtime as it was), and Zombie Beach (a hero who kicks): none of it
    const ofid = randomUUID(), zbid2 = randomUUID();
    insertDraft({ id: ofid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: imcode.replace('kicks: false, jump: false,', 'kicks: false, jump: false, impact: false,'), meta: immeta });
    insertDraft({ id: zbid2, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: readFileSync(new URL('../worlds/zombie-beach.js', import.meta.url), 'utf8'), meta: { ...immeta, title: 'Open Check' } });
    try {
      await withBrowser(async (page) => {
        await boot(page, ofid);
        const c = await page.eval<CH & { hp: number }>(`(async () => { const r = await ${CHAIN(1.45, 4)}; r.hp = window.__gmRuntime.state().open.enemies[0].hp; return r; })()`);
        const s = await imp(page);
        ok('open.impact: false keeps the runtime as it was: blows land as they did (the freeflow hook), with no snap, no stop curve, no flash and no new sound', !s.on && s.fx === null && s.hits === 0 && s.snaps === 0 && s.sounds === 0 && c.blows.length === 0 && c.hp < 40,
          `${JSON.stringify({ on: s.on, fx: s.fx, hits: s.hits, sounds: s.sounds })}, his hp ${c.hp}`);
        await boot(page, zbid2);
        const z = await imp(page);
        ok('Zombie Beach (a hero who kicks): no impact, and nothing of it made', !z.on && z.fx === null, JSON.stringify({ on: z.on, fx: z.fx }));
      }, { timeoutMs: 150_000 });
    } finally { db.prepare('DELETE FROM drafts WHERE id = ? OR id = ?').run(ofid, zbid2); }
  }

  // the traversal (the owner, 2 Oct: Spiderbench's, with its author's permission): a library hero
  // swings, zips, runs up walls and dives on a crowd; his clips play through its animation; the
  // crews climb after him; a knockout hands him back to the open world
  console.log('\nthe traversal: swinging, zips, wall runs, dives, and the crews who climb');
  const twid = randomUUID();
  insertDraft({ id: twid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: readFileSync(new URL('../lib/runtime/open-traversal-world.js', import.meta.url), 'utf8'),
    meta: { title: 'Traversal Check', tagline: 'Swing', blurb: 'Runtime check.', genre: 'Open World', cast: [{ name: 'Tester', color: '#FF7A3D' }], palette: { sky: '#8FB4D8', ground: '#7E7A74', accent: '#FF7A3D' }, runtime: 1, scoring: 'survival' } });
  try {
    await withBrowser(async (page) => {
      type TS = { live: boolean; mode: string; sub: string; feet: number; speed: number; anchor: number[] | null; zipTarget: string | null };
      const O = 'window.__gmRuntime.debug.open()', T = O + '.traversal';
      const ts = () => page.eval<TS>(`${T}.state()`);
      const kos = async () => (await page.eval<{ kos: number }>('window.__gmRuntime.state().open')).kos;
      const until = async (f: (s: TS) => boolean, ms: number) => { let s = await ts(); for (const t0 = Date.now(); !f(s) && Date.now() - t0 < ms; s = await ts()) await sleep(100); return s; };
      await page.goto(`${BASE}/d/${twid}/play`);
      for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
      const loaded = await page.eval<boolean>('!!window.GameMogTraversal');
      await page.eval('window.__gmRuntime.debug.start()'); await sleep(1200);
      await page.eval(`window.__gmRuntime.debug.invincible(true); ${O}.clear()`);
      const s0 = await ts(), a0 = await page.eval<{ clips: number }>(`${T}.anim()`);
      ok('the traversal loads and takes the hero, with his own clips, when the run starts', loaded && s0.live && s0.mode === 'ground' && a0.clips > 20, `${JSON.stringify(s0)} ${JSON.stringify(a0)}`);
      await page.eval(`${O}.place(0, 30, 0, 0.15)`); await sleep(400);
      await page.key('KeyW', 'keyDown'); await sleep(1200);
      const run = await ts(), ra = await page.eval<{ clip: string }>(`${T}.anim()`);
      ok('he runs on the street, on the motion-capture run', run.mode === 'ground' && run.speed > 6 && /run|jog|sprint/.test(ra.clip), `${run.speed} m/s, ${ra.clip}`);
      await page.eval(`${T}.tap('Space', 150)`); await sleep(350); await page.eval(`${T}.press('MouseRight')`);
      const sw = await until((s) => s.mode === 'swing', 2000);
      ok('a held line swings him from a roof edge', sw.mode === 'swing' && !!sw.anchor && sw.anchor[1] > 6, JSON.stringify(sw));
      await sleep(1200); await page.eval(`${T}.release('MouseRight')`); await page.key('KeyW', 'keyUp');
      await until((s) => s.mode === 'ground', 6000);
      await page.eval(`${O}.place(0, -30, 0, 0.2)`); await sleep(300); await page.eval(`${T}.look(0, -260)`); await sleep(700);
      const aim = await ts(); await page.eval(`${T}.tap('KeyE', 150)`);
      const perch = await until((s) => s.mode === 'perch' || (s.mode === 'ground' && s.feet > 20), 3000);
      ok('looking up marks a roof edge, and E zips him up to it', !!aim.zipTarget && perch.feet > 20, `${aim.zipTarget} -> ${perch.mode} at ${perch.feet} m`);
      await page.eval(`${O}.place(3, 7, -Math.PI / 2, 0.2)`); await sleep(400);
      await page.key('ShiftLeft', 'keyDown'); await page.key('KeyW', 'keyDown');
      const wall = await until((s) => s.mode === 'wall', 3000), top = await until((s) => s.mode === 'ground' && s.feet > 15, 6000);
      await page.key('KeyW', 'keyUp'); await page.key('ShiftLeft', 'keyUp');
      ok('running at a wall runs him up it and onto the roof', wall.mode === 'wall' && top.feet > 17.5, `${wall.mode} -> ${top.feet} m`);
      await page.eval(`${O}.clear(); ${O}.place(0, -50, Math.PI, 0.3)`); await sleep(200);
      await page.eval(`${O}.spawn("biker"); ${O}.spawn("biker"); ${O}.spawn("biker")`); await sleep(1200);
      const k0 = await kos();
      await page.eval(`${O}.place(0, -56.8, Math.PI, 0.45)`); await sleep(300);
      await page.key('KeyW', 'keyDown'); await sleep(450); await page.key('KeyW', 'keyUp'); await sleep(200);
      await page.eval(`${T}.press('KeyC')`); await until((s) => s.mode === 'ground', 3000); await page.eval(`${T}.release('KeyC')`); await sleep(400);
      const k1 = await kos();
      ok('a dive off the tower lands on the crowd below as a takedown', k1 - k0 >= 2, `${k1 - k0} knocked out`);
      await page.eval(`${O}.clear(); ${O}.place(0, 20, 0, 0.2); ${O}.spawn("thug")`); await sleep(1200);
      for (let i = 0; i < 40 && (await kos()) === k1; i++) { await page.key('KeyJ', 'keyDown'); await sleep(60); await page.key('KeyJ', 'keyUp'); await sleep(300); }
      const shot = await page.eval<{ shot: string | null }>(`${T}.anim()`);
      ok('and on the ground he still fights, his punches played over the traversal', (await kos()) > k1, `${(await kos()) - k1} knocked out, last move ${shot.shot}`);
      await page.eval(`${O}.clear(); ${O}.place(4, -31, Math.PI / 2, 0.35); ${O}.spawn("thug"); ${O}.spawn("thug")`); await sleep(300);
      await page.eval(`${O}.place(10.5, -31, Math.PI / 2, 0.35)`);
      let fs: Array<{ y: number }> = [];
      // (the two placed beside the wall; the director may send more meanwhile, from further off)
      for (let i = 0; i < 40; i++) { await sleep(250); fs = await page.eval<Array<{ y: number }>>(`${O}.foes()`); if (fs.filter((f) => f.y > 11).length >= 2) break; }
      ok('crews who climb come up the wall after him onto his 12 m roof', fs.filter((f) => f.y > 11).length >= 2, fs.map((f) => f.y.toFixed(1)).join(' '));
      await page.eval('window.__gmRuntime.debug.invincible(false)'); await page.eval(`${O}.hurt(1000)`); await sleep(1200);
      const end = await ts(), st = await page.eval<string>('window.__gmRuntime.state().state');
      ok('a knockout ends the run and hands him back to the open world', !end.live && st === 'crashed', `${st}, live ${end.live}`);
      const e1 = await page.eval<string[]>('window.__gm.errors');
      ok('no errors', e1.length === 0 && page.errors.length === 0, e1.concat(page.errors).join(' | '));
    }, { timeoutMs: 180_000 });
    // the attract demo shows him off on his own, and on a phone a finger turns the camera
    await withBrowser(async (page) => {
      await page.emulate({ width: 390, height: 844, mobile: true, dpr: 3 });
      await page.goto(`${BASE}/d/${twid}/play`);
      for (let i = 0; i < 200; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) break; await sleep(200); }
      const seen = new Set<string>(); let top = 0;
      for (let i = 0; i < 60 && !(seen.has('swing') && top > 8); i++) { await sleep(250); const s = await page.eval<{ mode: string; feet: number } | null>('window.__gmRuntime.debug.open().traversal.state()'); if (s) { seen.add(s.mode); top = Math.max(top, s.feet); } }
      ok('the attract demo shows him off: off the street on the line, high over it', seen.has('swing') && top > 8, `${[...seen].join(', ')}; ${top.toFixed(1)} m up`);
      await page.eval('window.__gmRuntime.debug.start()'); await sleep(1200);
      const yaw = () => page.eval<number>('window.__ctx.player.cam.yaw');
      const y0 = await yaw();
      await page.touch('touchStart', [{ x: 330, y: 200 }]);
      for (let i = 1; i <= 10; i++) { await page.touch('touchMove', [{ x: 330 - i * 26, y: 200 }]); await sleep(16); }
      await page.touch('touchEnd', []); await sleep(400);
      const y1 = await yaw();
      ok('on a phone, a finger dragged across the screen turns the camera', Math.abs(y1 - y0) > 1, `${(y1 - y0).toFixed(2)} rad for a 260 px swipe`);
    }, { timeoutMs: 120_000 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(twid); }

  // the city map (the owner, 2 Oct: Spiderbench's city, with its author's permission): a midtown district with its
  // buildings, rooftops, street furniture and trees, lit at night by its own lamps and windows, with the traversal
  console.log('\nthe city map: a midtown district at night, with its traffic and people, and the traversal');
  const cwid = randomUUID();
  insertDraft({ id: cwid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: readFileSync(new URL('../lib/runtime/open-city-world.js', import.meta.url), 'utf8'),
    meta: { title: 'City Check', tagline: 'Night', blurb: 'Runtime check.', genre: 'Open World', cast: [{ name: 'Tester', color: '#FF7A3D' }], palette: { sky: '#0A1022', ground: '#555555', accent: '#FF7A3D' }, runtime: 1, scoring: 'survival' } });
  try {
    await withBrowser(async (page) => {
      type CO = { ready: boolean; map: string; colliders: { boxes: number; circles: number }; player: { x: number; z: number } };
      const co = () => page.eval<CO>('window.__gmRuntime.state().open');
      const M = 'window.__gmRuntime.debug.open().map()', O = 'window.__gmRuntime.debug.open()', T = O + '.traversal';
      const t0 = Date.now();
      await page.goto(`${BASE}/d/${cwid}/play`);
      for (let i = 0; i < 400; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready && window.__gmRuntime.state().open && window.__gmRuntime.state().open.ready)').catch(() => false)) break; await sleep(250); }
      const secs = (Date.now() - t0) / 1000, o = await co(), e0 = await page.eval<string[]>('window.__gm.errors');
      const info = await page.eval<{ buildings: number; time: string; fill: number; exposure: number }>(`(function(){var m=${M};return {buildings:m.buildings,time:m.time,fill:m.fill,exposure:m.exposure}})()`);
      ok('the district builds, with its buildings, rooftop clutter and street furniture as colliders, and no errors', o.ready && o.map === 'city' && info.buildings > 500 && o.colliders.boxes > 3000 && o.colliders.circles > 300 && e0.length === 0,
        `${secs.toFixed(1)} s, ${info.buildings} buildings, ${o.colliders.boxes} boxes, ${o.colliders.circles} circles${e0.length ? ' ' + e0.join(' | ') : ''}`);
      await page.eval('window.__gmRuntime.debug.start()'); await sleep(1500);
      await page.eval(`window.__gmRuntime.debug.invincible(true); ${O}.clear()`);
      const st = await page.eval<{ lights: number }>(`${M}.stats()`);
      ok('at night it lights itself: lamps, lit shops and signs as real lights, the exposure raised for them', info.time === 'night' && st.lights > 100 && info.exposure > 3 && info.fill < 0.1, `${st.lights} lights near the camera, exposure x${info.exposure}`);
      const ad = await page.eval<number>(`(function(){var c=${M}.debug.root;var n=0;c.traverse(function(m){if(m.material&&m.material.map&&m.material.map.isCanvasTexture)n++;});return n})()`);
      ok('its billboards and blade signs carry GameMog\'s own drawn atlases', ad > 0, `${ad} meshes`);
      // its life (2 Oct): Spiderbench's traffic and crowd, kept to the district (cars come in from beyond it and drive off
      // into it), stopping at its lights and for the player
      await sleep(1500);
      const life = await page.eval<{ cars: number; edge: number; people: number; drawn: number }>(`(function(){var m=${M},s=m.stats(),e=0;m.life.traffic.cars().forEach(function(c){if(!c.parked&&c.link&&c.link.clipEdge)e++;});return {cars:s.cars,edge:e,people:s.people,drawn:s.peopleDrawn}})()`);
      ok('its streets are alive: cars on them and in from beyond the district, people on the sidewalks', life.cars > 150 && life.edge > 0 && life.people > 800 && life.drawn > 100,
        `${life.cars} cars (${life.edge} coming or going at the edge), ${life.people} people, ${life.drawn} drawn`);
      const lane = await page.eval<{ x: number; z: number; yaw: number } | null>(`(function(){var sim=${M}.life.traffic,p=window.__gmRuntime.state().open.player;
        var cs=sim.cars().filter(function(c){return !c.parked&&!c.conn&&c.v>5&&c.link&&!c.link.clipEdge&&(c.link.len-c.s)>40;});
        cs.sort(function(a,b){return Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z);});var c=cs[0];if(!c)return null;
        var fx=Math.cos(c.ry),fz=-Math.sin(c.ry);window.__lifeCar=c;return {x:c.x+fx*22,z:c.z+fz*22,yaw:Math.atan2(-fx,-fz)};})()`);
      if (lane) await page.eval(`${O}.place(${lane.x}, ${lane.z}, ${lane.yaw}, 0.1, true)`);
      // braking from its speed takes a few seconds (faster cars longer): watched until it stands, up to 8 s
      let car: { v: number; gap: number; dead: boolean } | null = null;
      for (let i = 0; lane && i < 16; i++) { await sleep(500); car = await page.eval(`(function(){var c=window.__lifeCar,p=window.__gmRuntime.state().open.player;return {v:c.v,gap:Math.hypot(c.x-p.x,c.z-p.z),dead:!!c.dead}})()`); if (car && (car.dead || car.v < 0.3)) break; }
      ok('a car in its lane stops short of the player standing in its path', !!car && !car.dead && car.v < 1 && car.gap > 4, car ? `${car.v.toFixed(2)} m/s, ${car.gap.toFixed(1)} m away` : 'no moving car found');
      // into a building's wall on the avenue's sidewalk: stopped at its face
      // west from 6th Avenue's west sidewalk into the block's frontage (about x = -16)
      await page.eval(`${O}.place(-13, -300, Math.PI / 2, 0.15, false, -Math.PI / 2)`); await sleep(300);
      let p1 = (await co()).player, wallUp = await page.eval<{ mode: string; feet: number }>(`${T}.state()`), deepest = p1.x;
      await page.key('KeyW', 'keyDown');
      for (let i = 0; i < 25; i++) { await sleep(100); p1 = (await co()).player; wallUp = await page.eval(`${T}.state()`); deepest = Math.min(deepest, p1.x); if (wallUp.mode === 'wall') break; }
      await page.key('KeyW', 'keyUp'); await sleep(200);
      ok('the buildings are solid: walking at a frontage stops you at its face, or takes you up it', wallUp.mode === 'wall' || (deepest > -17.5 && deepest < -14), `furthest x ${deepest.toFixed(2)}, ${wallUp.mode}`);
      await page.eval(`${O}.place(0, -280, 0, 0.15)`); await sleep(400);
      await page.key('KeyW', 'keyDown'); await sleep(900); await page.eval(`${T}.tap('Space', 150)`); await sleep(300); await page.eval(`${T}.press('MouseRight')`);
      let sw: { mode: string; anchor: number[] | null } = { mode: '', anchor: null };
      for (let i = 0; i < 20 && sw.mode !== 'swing'; i++) { await sleep(100); sw = await page.eval(`${T}.state()`); }
      await page.eval(`${T}.release('MouseRight')`); await page.key('KeyW', 'keyUp');
      ok('the line bites on a real building\'s edge, high over the street', sw.mode === 'swing' && !!sw.anchor && sw.anchor[1] > 10, JSON.stringify(sw.anchor));
      // an opening scene staged on a roof (a mark with a height): the hero stands up there, and the run begins there
      await page.eval(`${O}.intro()`); await sleep(1200);
      const upIn = (await co()).player as unknown as { y: number };
      await page.key('Enter'); await sleep(900);
      const upRun = (await co()).player as unknown as { y: number }, upTrav = await page.eval<{ feet: number; level: string }>(`${T}.state()`);
      ok('an opening scene can stand the hero on a roof, and the run starts up there', upIn.y > 30 && upRun.y > 30 && upTrav.feet > 30, `scene ${upIn.y.toFixed(1)} m, run ${upRun.y.toFixed(1)} m, ${upTrav.level}`);
      const fps = await page.eval<number>('(async () => { let n = 0; const t0 = performance.now(); await new Promise((r) => { const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(0); }; requestAnimationFrame(f); }); return n / 3; })()');
      ok('a night city with the cinematic renderer holds its frame rate', fps >= 40, `${Math.round(fps)} fps`);
      // the police (the owner, 3 Oct: a patrol car for Zcity's troopers): one of the street's own vehicles comes down
      // the avenue's centre line with its bar flashing, parks short of the player, and its officers get out
      await page.eval(`${O}.place(-12.2, -292, 0, 0.15)`); await sleep(300);
      await page.eval(`${O}.police()`);
      let pat: { state: string; x: number; z: number; vehicle: boolean }[] = [];
      for (let i = 0; i < 70; i++) { await sleep(300); pat = await page.eval(`${O}.patrol()`); if (pat[0] && pat[0].state === 'parked') break; }
      await sleep(2500);
      const cops = (await page.eval<{ kind: string; ko: boolean }[]>('window.__gmRuntime.state().open.enemies')).filter((e) => e.kind === 'cop' && !e.ko).length;
      ok('a patrol car brings the officers down the avenue and parks short of the player', !!pat[0] && pat[0].vehicle && pat[0].state === 'parked' && Math.abs(pat[0].x) < 0.5 && Math.abs(pat[0].z + 292) < 20 && cops >= 2,
        `${JSON.stringify(pat[0])}, ${cops} officers`);
      const e1 = await page.eval<string[]>('window.__gm.errors');
      ok('no errors', e1.length === 0 && page.errors.length === 0, e1.concat(page.errors).join(' | '));
    }, { timeoutMs: 180_000 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(cwid); }

  // light (1 Oct): presets are opt-in, so a world without one is drawn exactly as before; under
  // one, a photographed sky is exposed to the preset's brightness whatever the photograph; lamps
  // in physical units are told about, never changed; and the look measures the player and the glare
  // the wardrobe (the owner, 3 Oct: widen the human kit): every shirt, trousers, coat, glove, boot and piece of
  // gear the runtime paints or hangs on a person, worn by two rows of seven in an opening scene
  console.log('\nthe wardrobe: hoodies to hazmat suits, on people');
  const wdid = randomUUID();
  insertDraft({ id: wdid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: readFileSync(new URL('../lib/runtime/wardrobe-world.js', import.meta.url), 'utf8'),
    meta: { title: 'Wardrobe Check', tagline: 'Clothes', blurb: 'Runtime check.', genre: 'Open World', cast: [{ name: 'Tester', color: '#FF7A3D' }], palette: { sky: '#BFD6EE', ground: '#B9B4A8', accent: '#FF7A3D' }, runtime: 1, scoring: 'survival' } });
  try {
    await withBrowser(async (page) => {
      const O = 'window.__gmRuntime.debug.open()';
      await page.goto(`${BASE}/d/${wdid}/play`);
      for (let i = 0; i < 300; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready && window.__gmRuntime.state().open && window.__gmRuntime.state().open.ready)').catch(() => false)) break; await sleep(250); }
      await page.eval('window.__gmRuntime.debug.start()'); await sleep(300);
      await page.eval(`${O}.intro()`); await sleep(2500);
      const a = await page.eval<{ cast: string[] } | null>(`${O}.introState()`);
      for (let i = 0; i < 80; i++) { const st = await page.eval<{ shot: number } | null>(`${O}.introState()`); if (st && st.shot === 1) break; await sleep(500); }
      await sleep(2000);
      const b = await page.eval<{ cast: string[] } | null>(`${O}.introState()`);
      const e = await page.eval<string[]>('window.__gm.errors');
      ok('every garment and piece of gear builds on a person, and every shader compiles', !!a && !!b && a.cast.length === 7 && b.cast.length === 14 && e.length === 0 && page.errors.length === 0,
        `${a ? a.cast.length : 0} then ${b ? b.cast.length : 0} dressed${e.length || page.errors.length ? ': ' + e.concat(page.errors).join(' | ') : ''}`);
    }, { timeoutMs: 120_000 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(wdid); }

  // the people pack (the owner, 3 Oct: humans that look like people, not zombies): garments fitted to the body, more
  // hair, the middle-aged and old skins and the age and weight shapes, from two assets only the worlds that list them load
  console.log('\nthe people pack: clothes, hair and older people');
  const ppid = randomUUID();
  insertDraft({ id: ppid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: readFileSync(new URL('../lib/runtime/people-pack-world.js', import.meta.url), 'utf8'),
    meta: { title: 'People Pack Check', tagline: 'People', blurb: 'Runtime check.', genre: 'Open World', cast: [{ name: 'Tester', color: '#FF7A3D' }], palette: { sky: '#BFD6EE', ground: '#B9B4A8', accent: '#FF7A3D' }, runtime: 1, scoring: 'survival' } });
  try {
    await withBrowser(async (page) => {
      const O = 'window.__gmRuntime.debug.open()';
      await page.goto(`${BASE}/d/${ppid}/play`);
      for (let i = 0; i < 300; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready && window.__gmRuntime.state().open && window.__gmRuntime.state().open.ready)').catch(() => false)) break; await sleep(250); }
      await page.eval('window.__gmRuntime.debug.start()'); await sleep(300);
      await page.eval(`${O}.intro()`); await sleep(2500);
      for (let i = 0; i < 80; i++) { const st = await page.eval<{ shot: number } | null>(`${O}.introState()`); if (st && st.shot === 1) break; await sleep(500); }
      await sleep(2000);
      const b = await page.eval<{ cast: string[] } | null>(`${O}.introState()`);
      const m = await page.eval<{ pack: number; worn: number; shaped: number; aged: number }>(`(() => { let pack = 0, worn = 0, shaped = 0, aged = 0;
        window.__gmRuntime.debug.internals().scene.traverse((o) => {
          if (!o.isSkinnedMesh) return;
          if (o.name === 'pack') { pack++; if (o.material.some((x) => x.visible && x.map)) worn++; }
          else if (o.morphTargetInfluences && o.morphTargetInfluences.length === 7) { shaped++; if (o.morphTargetInfluences[5] > 0.5) aged++; }
        });
        return { pack, worn, shaped, aged }; })()`);
      const e = await page.eval<string[]>('window.__gm.errors');
      ok('fourteen people dressed from the pack: garments and hair on each body\'s own skeleton', !!b && b.cast.length === 14 && m.pack === 14 && m.worn === 14 && e.length === 0 && page.errors.length === 0,
        `${b ? b.cast.length : 0} cast, ${m.pack} pack meshes, ${m.worn} dressed${e.length || page.errors.length ? ': ' + e.concat(page.errors).join(' | ') : ''}`);
      ok('the bodies gain the pack\'s two shapes, age and weight, and the old are aged', m.shaped >= 14 && m.aged === 4, `${m.shaped} bodies with 7 shapes, ${m.aged} aged past 0.5`);
      // the eyes (3 Oct): every human's eyes had rendered blank white, the cornea's opaque white over the iris. Seen
      // from the front, the front-most point of each eye must be see-through and the front-most point drawn the pupil
      const eyes = await page.eval<{ eyes: number; bad: string[] }>(`(() => { let eyes = 0; const bad = [], T = window.__gmRuntime.debug.internals().THREE;
        window.__gmRuntime.debug.internals().scene.traverse((o) => {
          if (!o.isSkinnedMesh || o.name === 'pack' || !Array.isArray(o.material)) return;
          const mi = o.material.findIndex((x) => x.clearcoat === 1 && x.map); if (mi < 0) return;
          const g = o.geometry, grp = g.groups.find((x) => x.materialIndex === mi), m = o.material[mi], img = m.map.image;
          if (!img.getContext) { bad.push('the eye texture is not cut'); return; }
          const W = img.width, H = img.height, px = img.getContext('2d').getImageData(0, 0, W, H).data, P = g.attributes.position, U = g.attributes.uv, I = g.index;
          m.map.updateMatrix(); const uv = new T.Vector2(), fr = (x) => x - Math.floor(x);
          for (const side of [1, -1]) {
            let a0 = -1, z0 = -9, lum = -1, z1 = -9;
            for (let i = grp.start; i < grp.start + grp.count; i++) {
              const v = I.getX(i); if (Math.sign(P.getX(v)) !== side) continue;
              uv.set(U.getX(v), U.getY(v)).applyMatrix3(m.map.matrix);
              const k = (Math.min(H - 1, Math.floor(fr(uv.y) * H)) * W + Math.min(W - 1, Math.floor(fr(uv.x) * W))) * 4, z = P.getZ(v);
              if (z > z0) { z0 = z; a0 = px[k + 3]; }
              if (px[k + 3] > 127 && z > z1) { z1 = z; lum = (px[k] + px[k + 1] + px[k + 2]) / 3; }
            }
            eyes++; if (a0 > 127) bad.push('cornea drawn'); if (!(lum >= 0 && lum < 100)) bad.push('front of the eye ' + Math.round(lum));
          }
        });
        return { eyes, bad }; })()`);
      ok('every eye shows its iris: the cornea is see-through and the front of the eye is the pupil', eyes.eyes >= 30 && eyes.bad.length === 0, `${eyes.eyes} eyes${eyes.bad.length ? ': ' + [...new Set(eyes.bad)].join(', ') : ''}`);
      // hairDye (AI Alps, 5 Oct: Vasseur's silver-white hair drew black, a white tint over a near-black texture): the
      // fixture's old man (hairColor '#C8C4BC', hairDye) has his hair in that colour itself, its shading from the
      // texture over the texture's own mean; every other head of hair keeps the tint (hairColor x 2.2 over the texture)
      const hair = await page.eval<{ all: number; dyed: { pack: boolean; hex: string; k: number }[] }>(`(() => { const out = { all: 0, dyed: [] };
        window.__gmRuntime.debug.internals().scene.traverse((o) => {
          if (!o.isSkinnedMesh || !Array.isArray(o.material)) return;
          o.material.forEach((m) => { if (!m.visible || !m.map || !m.alphaToCoverage) return; out.all++;
            if (m.customProgramCacheKey && m.customProgramCacheKey() === 'gm-hair-dye') out.dyed.push({ pack: o.name === 'pack', hex: m.color.getHexString(), k: +(m.map.userData.gmDyeK || 0).toFixed(1) }); });
        });
        return out; })()`);
      const dy = hair.dyed[0];
      ok('a person given hairDye draws the hair in hairColor itself; every other keeps the tint', hair.dyed.length === 1 && !!dy && dy.pack && dy.hex === 'c8c4bc' && dy.k > 4 && hair.all >= 10,
        `${hair.all} heads of hair, ${hair.dyed.length} dyed${dy ? ` (#${dy.hex}, the texture's mean brightness 1/${dy.k})` : ''}`);
    }, { timeoutMs: 120_000 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(ppid); }

  // the motion pack (AI Alps, 4 Oct): human-moves-<gender> adds its clips to its human, played by the runtime under
  // their own names, only in a world that lists it; the base human is the same file either way
  console.log('\nthe motion pack: dances, a drunk and a bar, only where it is listed');
  const movesSrc = readFileSync(new URL('../lib/runtime/moves-world.js', import.meta.url), 'utf8');
  const PACK = (JSON.parse(readFileSync(new URL('../public/assets/human-moves-male/asset.json', import.meta.url), 'utf8')).clips.list as { name: string }[]).map((c) => c.name);
  type Body = { x: number; z: number; hips: number; head: number };
  type Moves = { clips: string[]; bodies: Body[]; errors: string[] };
  const movesOf = async (code: string) => {
    const mid = randomUUID();
    insertDraft({ id: mid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code,
      meta: { title: 'Moves Check', tagline: 'Moves', blurb: 'Runtime check.', genre: 'Open World', cast: [{ name: 'Tester', color: '#FF7A3D' }], palette: { sky: '#BFD6EE', ground: '#B9B4A8', accent: '#FF7A3D' }, runtime: 1, scoring: 'survival' } });
    try {
      return await withBrowser(async (page) => {
        const O = 'window.__gmRuntime.debug.open()';
        await page.goto(`${BASE}/d/${mid}/play`);
        for (let i = 0; i < 300; i++) { if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready && window.__gmRuntime.state().open && window.__gmRuntime.state().open.ready)').catch(() => false)) break; await sleep(250); }
        await page.eval('window.__gmRuntime.debug.start()'); await sleep(300);
        await page.eval(`${O}.intro()`);
        for (let i = 0; i < 80; i++) { const st = await page.eval<{ shot: number } | null>(`${O}.introState()`); if (st && st.shot === 0) break; await sleep(250); }
        await sleep(4000);
        // every person's hips and head (the root and head bones, in the world)
        const bodies = await page.eval<Body[]>(`(() => { const I = window.__gmRuntime.debug.internals(), T = I.THREE, seen = new Set(), out = [];
          I.scene.updateMatrixWorld(true);
          I.scene.traverse((o) => {
            if (!o.isSkinnedMesh || seen.has(o.skeleton)) return; seen.add(o.skeleton);
            const r = o.skeleton.bones.find((b) => b.name === 'root'), h = o.skeleton.bones.find((b) => b.name === 'head'); if (!r || !h) return;
            const p = r.getWorldPosition(new T.Vector3()), q = h.getWorldPosition(new T.Vector3());
            out.push({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), hips: +p.y.toFixed(2), head: +q.y.toFixed(2) });
          });
          return out; })()`);
        const e = await page.eval<string[]>('window.__gm.errors');
        return { clips: await page.eval<string[]>('(self.__moves && self.__moves.clips) || []'), bodies, errors: e.concat(page.errors) };
      }, { timeoutMs: 120_000 });
    } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(mid); }
  };
  const at = (m: Moves, x: number) => m.bodies.filter((b) => Math.abs(b.z) < 0.8).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0] ?? { x, z: 0, hips: NaN, head: NaN };
  const listed = await movesOf(movesSrc), unlisted = await movesOf(movesSrc.replace("assets: ['human-athlete-male', 'human-moves-male'],", "assets: ['human-athlete-male'],"));
  const ls = at(listed, 0), ll = at(listed, 2), us = at(unlisted, 0), ul = at(unlisted, 2);
  ok('listed, the pack\'s clips join the human\'s own (the base keeps every one of its own)', PACK.length >= 12 && PACK.every((n) => listed.clips.includes(n)) && listed.clips.length === unlisted.clips.length + PACK.length && listed.errors.length === 0,
    `${listed.clips.length} clips with it, ${unlisted.clips.length} without${listed.errors.length ? ': ' + listed.errors.join(' | ') : ''}`);
  ok('and the runtime plays them by name: the talker sits, the drinker leans on the bar', ls.hips < 0.72 && ll.head < 1.55 && at(listed, -4).hips > 0.6,
    `sitTalk hips ${ls.hips} m, leanBar head ${ll.head} m, the Macarena's hips ${at(listed, -4).hips} m`);
  ok('not listed, none of them is there, and those stances stand as the plain idle', PACK.every((n) => !unlisted.clips.includes(n)) && us.hips > 0.85 && ul.head > 1.6 && unlisted.errors.length === 0,
    `hips ${us.hips} m, head ${ul.head} m${unlisted.errors.length ? ': ' + unlisted.errors.join(' | ') : ''}`);

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
