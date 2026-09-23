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

type State = { state: string; level: number; gm: number; alive: boolean; pace: number; cruise: number; rivals: { k: number; ratio: number; aggro: number; ahead: number; x: number; joinedFromLine: number }[]; lap: number; obstacles: number; coins: number; x: number; d: number; speed: number; paused: boolean; crashedInto: string };

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
    ok('the title screen waits for the player', s0.state === 'title');
    const r0 = s0.rivals[0];
    ok('one rival stands on the start line beside you before the gun', s0.rivals.length === 1 && Math.abs(r0.ahead) < 0.5 && Math.abs(r0.x - s0.x) > 1.2, r0 ? `${r0.ahead.toFixed(1)}m ahead, ${Math.abs(r0.x - s0.x).toFixed(1)}m across` : 'none');
    const warnings = await page.eval<string[]>('window.__gm.warnings');
    console.log(`        runtime repairs reported: ${warnings.length ? warnings.join(' | ') : 'none'}`);

    console.log('\nthe rules');
    await page.key('Enter');
    await sleep(3400);
    let s = await st();
    ok('Enter starts a countdown, then the race', s.state === 'race', s.state);
    await sleep(1500); s = await st();
    ok('lap 1 has exactly one rival', s.rivals.length === 1 && s.level === 1, `${s.rivals.length} at level ${s.level}`);
    ok('the first rival is slower than your cruising speed', s.rivals[0].ratio < 1, `${s.rivals[0].ratio}x`);
    ok('the player moves forward without any key held', s.speed > 15, `${s.speed.toFixed(1)} m/s`);

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
    await page.key('Enter'); await sleep(3400);
    s = await st();
    ok('Enter starts a fresh run at level 1 with one rival', s.state === 'race' && s.level === 1 && s.rivals.length === 1, `${s.state}, level ${s.level}`);

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
} finally {
  db.prepare('DELETE FROM drafts WHERE id = ?').run(id);
}

console.log(`\n${failures ? `${failures} FAILED` : 'all runtime checks passed'}\n`);
process.exit(failures ? 1 : 0);
