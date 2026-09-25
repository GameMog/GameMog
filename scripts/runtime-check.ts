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

    await page.key('Space'); await sleep(300);
    const p1 = await st(); await sleep(700); const p2 = await st();
    ok('Space pauses, and a paused race does not move', p1.paused && p2.d === p1.d, `paused=${p1.paused}`);
    await page.key('Space'); await sleep(400);
    ok('Space resumes', !(await st()).paused);

    const pads = await page.eval<number>("document.querySelectorAll('#gm .pad button').length");
    const pauseBtn = await page.eval<number>("document.querySelectorAll('#gm .pause').length");
    ok('touch controls exist: four direction buttons and a pause button', pads === 4 && pauseBtn === 1, `${pads} + ${pauseBtn}`);

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
