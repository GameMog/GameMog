// Mog City creatures (wagmi/creatures): the proof in real Chrome, on New York's Sheep Meadow (?nointro&dev=creatures).
// Run from a GameMog checkout (its lib/browser.ts drives Chrome), with this repo served:
//   node --import ./scripts/ts-resolve.mjs <this repo>/tools/creatures/proof.mts <base url> <out dir> [scene ...]
// Scenes (all by default):
//   knights   Dan against three knights and a centaur, fought by the bot below: he must win
//   ogre      the ogre's ground slam: the bot stays in its ring, Dan must go down; then he wins; a frame strip of the slam
//   trex      the T-rex boss: its bar across the top; Dan stands until its first bite lands (a frame strip of the bite),
//             then the bot fights it to its knockout (a frame strip of the knockout)
//   scorpion  one held in its lair: it must not move while Dan is far, wake when he comes within its wake, then fight
//   herd      four horses: grazing (a close look), then Dan runs at them: they must scatter, faster than he runs
//   perf      fps and the JS heap during a fight of five creatures and a boss (after 30 s)
//   ny        the default URL: New York's own game boots and plays, 0 errors, no creature code loaded
// The bot (the page's own input, W.combat.debug.press): strikes the nearest creature, counters a yellow cue when it
// opens, rolls out of a red one in its last moment, sprints out of a red ring and rolls at its edge (each can be off).
// Prints a line per check and FAIL lines; JPEGs (shots and strips) into <out dir>; exits 1 on any failure.
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { withBrowser } = await import(new URL('lib/browser.ts', pathToFileURL((process.env.GAMEMOG_DIR || process.cwd()) + '/')).href);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const [BASE = 'http://127.0.0.1:4622/', OUT = '.scratch/creatures', ...ONLY] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const SCENES = ['knights', 'ogre', 'trex', 'scorpion', 'herd', 'perf', 'ny'].filter((s) => !ONLY.length || ONLY.includes(s));
const DEV = `${BASE}?nointro&trailer=0&dev=creatures`;
const fails: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };

const BOT = `window.__bot = (opts = {}) => {
  const W = window.WAGMI, C = W.combat, c = C.debug.c, cm = W.app.controllerManager;
  const st = { on: true, last: 0, log: [], counters: 0, dodges: 0, rings: 0, hits: 0, presses: 0, lastHp: c.me.hp, t0: c.time };
  const stick = (dx, dz) => { const y = c.camYaw(), f = dx * Math.sin(y) + dz * Math.cos(y), s = -dx * Math.cos(y) + dz * Math.sin(y);
    cm.setTouchInput('forward', Math.max(0, f)); cm.setTouchInput('backward', Math.max(0, -f)); cm.setTouchInput('right', Math.max(0, s)); cm.setTouchInput('left', Math.max(0, -s)); };
  const release = () => { for (const k of ['forward', 'backward', 'left', 'right', 'boost']) cm.setTouchInput(k, 0); };
  let runT = -9;
  const tick = () => {
    if (!st.on) { release(); return; }
    requestAnimationFrame(tick);
    if (W.paused || W.cutscene) return;
    const now = c.time, me = c.me, P = W.person.position;
    if (me.hp < st.lastHp - 0.5) { st.hits++; st.log.push(['hurt', +(now - st.t0).toFixed(2), Math.round(st.lastHp - me.hp)]); }
    st.lastHp = me.hp;
    if (now - runT > 0.5) release();
    if (me.down()) return;
    for (const t of c.threats) {
      if (t.item) continue; const r = t.at - now;
      if (t.quake && opts.quake !== false && !t._r && r < t.lead - 0.15) { t._r = true; t._run = true; st.rings++; st.log.push(['ring', +(now - st.t0).toFixed(2)]); }
      if (t._run) { const dx = P.x - t.e.pos.x, dz = P.z - t.e.pos.z, L = Math.hypot(dx, dz) || 1; stick(dx / L, dz / L); cm.setTouchInput('boost', 1); runT = now; if (r < 0.3 && !t._d) { t._d = true; C.debug.press('dodge'); } if (r < -0.05) t._run = false; }
      else if (t.kind === 'dodge' && !t.quake && !t._d && r < 0.3 && r > -0.05) { t._d = true; if (Math.random() < (opts.dodgeP ?? 1)) { C.debug.press('dodge'); st.dodges++; st.log.push(['dodge', +(now - st.t0).toFixed(2)]); } }
      else if (t.kind === 'counter' && !t._c && c.cueOpen(t) && r < 0.3) { t._c = true; if (opts.counter !== false) { C.debug.press('counter'); st.counters++; } }
    }
    if (now - runT < 0.6 || now - st.last < 0.34) return;
    st.last = now;
    const live = c.enemies.filter((e) => e.alive && e.state !== 'idle'); if (!live.length) return;
    let n = live[0], nd = Infinity; for (const e of live) { const d = Math.hypot(e.pos.x - P.x, e.pos.z - P.z) - (e.footR || 0); if (d < nd) { nd = d; n = e; } }
    if (nd > 6.5) { const dx = n.pos.x - P.x, dz = n.pos.z - P.z, L = Math.hypot(dx, dz) || 1; stick(dx / L, dz / L); runT = now - 0.2; return; }
    C.debug.press(n.grounded || Math.random() < 0.3 ? 'heavy' : 'strike'); st.presses++;
  };
  tick();
  return st;
};`;

// a frame strip: the JPEGs side by side (cols across), each labelled, composed on a canvas in the page itself
async function strip(page: any, frames: Uint8Array[], labels: string[], file: string, cols = 4) {
  const b64 = frames.map((f) => Buffer.from(f).toString('base64'));
  const out = await page.eval(`(async () => {
    const srcs = ${JSON.stringify(b64)}, labels = ${JSON.stringify(labels)}, cols = ${cols}, w = 480, h = 270, rows = Math.ceil(srcs.length / cols);
    const cv = document.createElement('canvas'); cv.width = cols * w; cv.height = rows * h; const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < srcs.length; i++) {
      const im = new Image(); im.src = 'data:image/jpeg;base64,' + srcs[i]; await im.decode();
      const x = (i % cols) * w, y = Math.floor(i / cols) * h; g.drawImage(im, x + 2, y + 2, w - 4, h - 4);
      if (labels[i]) { g.font = '600 17px sans-serif'; const tw = g.measureText(labels[i]).width; g.fillStyle = 'rgba(0,0,0,0.62)'; g.fillRect(x + 8, y + 8, tw + 14, 26); g.fillStyle = '#fff'; g.fillText(labels[i], x + 15, y + 27); }
    }
    return cv.toDataURL('image/jpeg', 0.86).split(',')[1];
  })()`);
  writeFileSync(file, Buffer.from(out as string, 'base64'));
  console.log(`     strip ${file}`);
}
const shot = async (page: any, name: string) => { const f = `${OUT}/${name}.jpg`; writeFileSync(f, await page.screenshot(80)); console.log(`     shot ${f}`); };
async function boot(page: any, url = DEV) {
  await page.goto(url);
  for (let i = 0; i < 300; i++) { if (await page.eval('!!(window.__NYC_APP && window.__NYC_APP.ready && window.WAGMI && window.WAGMI.creatures && window.WAGMI.creatures.dev)').catch(() => false)) break; await sleep(250); }
  await sleep(1500);
  await page.key('KeyW', 'keyDown'); await sleep(60); await page.key('KeyW', 'keyUp'); // (sound: the browser wants a key first)
  await page.eval(BOT);
}
const C = (expr: string) => `(() => { const W = window.WAGMI, c = W.combat.debug.c, P = W.person.position; return ${expr}; })()`;
const played = (page: any) => page.eval(`(() => { const p = window.WAGMI.audio.debug()?.played || {}; const o = {}; for (const [k, v] of Object.entries(p)) if (k.startsWith('pack:')) o[k] = v; return o; })()`);
// the fight's state, for the log
const brief = (page: any) => page.eval(C(`({ t: +c.time.toFixed(1), hp: Math.round(c.me.hp), move: c.me.moveName(), en: c.enemies.filter((e) => e.creature).map((e) => e.model.slice(9) + ':' + e.state + ':' + Math.max(0, Math.round(e.hp))).join(' ') })`));

// run the bot until every creature is down (or secs); true when they all are
async function fightOut(page: any, secs: number, opts = '{}', every = 0, tag = '') {
  await page.eval(`window.__b = window.__bot(${opts})`);
  const t0 = Date.now(); let i = 0;
  while (Date.now() - t0 < secs * 1000) {
    await sleep(1000); i++;
    const done = await page.eval(C(`c.enemies.filter((e) => e.creature).every((e) => !e.alive)`));
    if (i % 4 === 0) console.log('     ' + JSON.stringify(await brief(page)));
    if (every && i % every === 0) await shot(page, `${tag}-${String(i).padStart(3, '0')}`);
    if (done) return true;
  }
  return false;
}

await withBrowser(async (page: any) => {
  await page.emulate({ width: 1280, height: 720 });
  for (const scene of SCENES) {
    console.log(`== ${scene}`);
    const e0 = page.errors.length;
    if (scene === 'knights') {
      await boot(page);
      const r = await page.eval(`(async () => { const h = window.WAGMI.creatures.dev.knights(); window.__h = h; window.__kos = []; window.__downs = 0; window.WAGMI.combat.player.onDown(() => window.__downs++); h.on('ko', (e) => window.__kos.push(e.name)); h.on('allDown', () => { window.__all = true; }); const f = await h.ready; return f.map((x) => x.name + ' ' + x.hp + 'hp ' + x.height.toFixed(2) + 'm' + (x.heavy ? ' heavy' : '')).join(', '); })()`);
      console.log('     ' + r);
      await sleep(2500); await shot(page, 'knights-0-start');
      const won = await fightOut(page, 120, '{}', 4, 'knights');
      await sleep(1200); await shot(page, 'knights-9-won');
      const s = await page.eval(C(`({ kos: window.__kos, all: !!window.__all, downs: window.__downs, hp: Math.round(c.me.hp), bot: { counters: window.__b.counters, dodges: window.__b.dodges, rings: window.__b.rings, hitsTaken: window.__b.hits } })`));
      console.log('     ' + JSON.stringify(s));
      check(won && s.all && s.kos.length === 4, `knights: three knights and a centaur all knocked out (${s.kos.join(', ')})`);
      check(s.downs === 0 && s.hp > 0, `knights: Dan won on his feet (${s.hp} hp left, knocked out ${s.downs} times)`);
      console.log('     sounds ' + JSON.stringify(await played(page)));
    }
    if (scene === 'ogre') {
      await boot(page);
      await page.eval(`(async () => { const h = window.WAGMI.creatures.dev.ogre(); window.__h = h; const f = await h.ready; window.__o = f[0]; })()`);
      await page.eval(`window.__b = window.__bot({ quake: false, dodgeP: 0, counter: false })`);
      // the slam: from its swing to Dan on the ground, slowed to see it
      let frames: Uint8Array[] = [], labels: string[] = [], downed = false;
      for (let i = 0; i < 400 && !downed; i++) {
        const s = await page.eval(C(`({ st: window.__o.state, atk: window.__o.atk, t: window.__o.st, move: c.me.moveName() })`));
        if (s.st === 'attack' && s.atk === 'slam') {
          await page.eval('window.WAGMI.combat.debug.slow(0.4)');
          for (let k = 0; k < 10; k++) {
            const q = await page.eval(C(`({ t: +window.__o.st.toFixed(2), move: c.me.moveName(), hp: Math.round(c.me.hp) })`));
            frames.push(await page.screenshot(78)); labels.push(`slam +${q.t.toFixed(2)} s · Dan ${q.move} ${q.hp} hp`);
            if (q.move === 'down') downed = true;
            await sleep(520);
          }
          await page.eval('window.WAGMI.combat.debug.slow(1)');
          break;
        }
        await sleep(60);
      }
      if (frames.length) await strip(page, frames, labels, `${OUT}/ogre-slam-strip.jpg`, 5);
      check(downed, 'ogre: its ground slam put Dan down');
      await page.eval(`window.__b.on = false`);
      const won = await fightOut(page, 90, '{}');
      await sleep(1000); await shot(page, 'ogre-9-after');
      check(won, 'ogre: and Dan knocked it out');
    }
    if (scene === 'trex') {
      await boot(page);
      await page.eval(`(async () => { const h = window.WAGMI.creatures.dev.trex(); window.__h = h; window.__kos = []; window.__downs = 0; window.WAGMI.combat.player.onDown(() => window.__downs++); h.on('ko', (e) => window.__kos.push(e.name)); const f = await h.ready; window.__t = f[0]; })()`);
      await sleep(2500);
      const bar = await page.eval(`(() => { const el = document.querySelector('#wf .wf-boss'); return el ? { on: el.classList.contains('wf-on'), name: el.querySelector('.wf-bn').textContent, kind: el.querySelector('.wf-bk').textContent, ticks: el.querySelectorAll('.wf-bb b').length } : null; })()`);
      console.log('     boss bar ' + JSON.stringify(bar));
      await shot(page, 'trex-0-bar');
      check(!!bar && bar.on && bar.name === 'The Matriarch' && bar.ticks === 2, 'trex: the boss bar shows its name and its phases');
      // its first bite, Dan standing: a strip from its swing to him on the ground
      const frames: Uint8Array[] = [], labels: string[] = []; let bit = false, hp0 = 100;
      for (let i = 0; i < 500 && !frames.length; i++) {
        const s = await page.eval(C(`({ st: window.__t.state, atk: window.__t.atk, hp: c.me.hp })`));
        if (s.st === 'attack' && s.atk === 'bite') {
          hp0 = s.hp; await page.eval('window.WAGMI.combat.debug.slow(0.35)');
          for (let k = 0; k < 10; k++) {
            const q = await page.eval(C(`({ t: +window.__t.st.toFixed(2), move: c.me.moveName(), hp: Math.round(c.me.hp), jaw: +((window.__t.body.caps.find((x) => x.name === 'jaw')?.b.y ?? 0) - window.__t.pos.y).toFixed(2) })`));
            frames.push(await page.screenshot(78)); labels.push(`bite +${q.t.toFixed(2)} s · jaw ${q.jaw} m · Dan ${q.hp} hp`);
            if (q.hp < hp0) bit = true;
            await sleep(560);
          }
          await page.eval('window.WAGMI.combat.debug.slow(1)');
        }
        await sleep(60);
      }
      if (frames.length) await strip(page, frames, labels, `${OUT}/trex-bite-strip.jpg`, 5);
      check(bit, `trex: its bite landed (Dan ${Math.round(hp0)} hp before it)`);
      // then the fight, to its knockout (a strip of it going down)
      await page.eval(`window.__b = window.__bot({ dodgeP: 0.85 })`);
      const ko: Uint8Array[] = [], kl: string[] = []; const t0 = Date.now(); let out = false, n = 0;
      while (Date.now() - t0 < 200000 && !out) {
        await sleep(200); n++;
        const s = await page.eval(C(`({ st: window.__t.state, hp: Math.round(window.__t.hp), t: +window.__t.st.toFixed(2) })`));
        if (n % 25 === 0) console.log('     ' + JSON.stringify(await brief(page)));
        if (n % 40 === 0) await shot(page, `trex-fight-${String(n / 40).padStart(2, '0')}`);
        if (s.st === 'dying') {
          await page.eval('window.WAGMI.combat.debug.slow(0.35)');
          for (let k = 0; k < 10; k++) { const q = await page.eval(C(`({ st: window.__t.state, t: +window.__t.st.toFixed(2) })`)); ko.push(await page.screenshot(78)); kl.push(`knockout · ${q.st} +${q.t.toFixed(2)} s`); await sleep(520); }
          await page.eval('window.WAGMI.combat.debug.slow(1)');
          out = true;
        }
        if (s.st === 'out') out = true;
      }
      if (ko.length) await strip(page, ko, kl, `${OUT}/trex-ko-strip.jpg`, 5);
      await sleep(1500); await shot(page, 'trex-9-ko');
      const s = await page.eval(C(`({ kos: window.__kos, downs: window.__downs, hp: Math.round(c.me.hp), bot: { dodges: window.__b.dodges, rings: window.__b.rings, hitsTaken: window.__b.hits } })`));
      console.log('     ' + JSON.stringify(s));
      check(out && s.kos.includes('The Matriarch'), `trex: Dan knocked it out (${s.hp} hp left, knocked out ${s.downs} times)`);
      console.log('     sounds ' + JSON.stringify(await played(page)));
    }
    if (scene === 'scorpion') {
      await boot(page);
      await page.eval(`(async () => { const h = window.WAGMI.creatures.dev.scorpion(); window.__h = h; const f = await h.ready; window.__s = f[0]; window.__s0 = f[0].pos.clone(); h.on('wake', () => { const P = window.WAGMI.person.position; window.__woke = +Math.hypot(P.x - f[0].pos.x, P.z - f[0].pos.z).toFixed(2); }); })()`);
      const S = C(`({ st: window.__s.state, d: +Math.hypot(P.x - window.__s.pos.x, P.z - window.__s.pos.z).toFixed(2), moved: +Math.hypot(window.__s.pos.x - window.__s0.x, window.__s.pos.z - window.__s0.z).toFixed(2), woke: window.__woke ?? null, wake: window.__s.lair.wake })`);
      await sleep(5000);
      const a = await page.eval(S); console.log('     waiting ' + JSON.stringify(a));
      await shot(page, 'scorpion-0-waiting');
      check(a.st === 'idle' && a.moved < 0.05 && a.d > a.wake, `scorpion: held in its lair while Dan is ${a.d} m off (moved ${a.moved} m)`);
      await page.eval(`window.WAGMI.app.controllerManager.setTouchInput('forward', 1)`);
      let w: any = null;
      for (let i = 0; i < 60 && !w; i++) { await sleep(150); const s = await page.eval(S); if (s.st !== 'idle') w = s; }
      await page.eval(`window.WAGMI.app.controllerManager.setTouchInput('forward', 0)`);
      console.log('     woke ' + JSON.stringify(w));
      await sleep(900); await shot(page, 'scorpion-1-woke');
      check(!!w && w.woke != null && w.woke <= w.wake + 0.6 && w.woke > w.wake - 2, `scorpion: woke as Dan came within its ${w?.wake} m (at ${w?.woke} m)`);
      const won = await fightOut(page, 100, '{}', 6, 'scorpion');
      await sleep(1200); await shot(page, 'scorpion-9-after');
      check(won, 'scorpion: then fought, and Dan knocked it out');
    }
    if (scene === 'herd') {
      await boot(page);
      await page.eval(`(async () => { const h = window.WAGMI.creatures.dev.herd(); window.__h = h; await h.ready; })()`);
      const S = C(`window.__h.animals.map((h) => ({ s: h.state, d: +Math.hypot(P.x - h.pos.x, P.z - h.pos.z).toFixed(1), v: +h.spd.toFixed(1), g: +h.graze.toFixed(2) }))`);
      await sleep(5500);
      const g = await page.eval(S); console.log('     ' + JSON.stringify(g));
      // a close look at them grazing (a still camera beside the herd), then the view back to Dan
      await page.eval(`(() => { const a = window.__h.animals; let x = 0, z = 0; for (const h of a) { x += h.pos.x / a.length; z += h.pos.z / a.length; } window.WAGMI.combat.debug.view({ target: { pos: new window.WAGMI.person.position.constructor(x, 0, z) }, mid: 1, deg: 60, dist: 9, h: 0.6, at: 1.2 }); })()`);
      await sleep(900); await shot(page, 'herd-0-grazing');
      await page.eval(`window.WAGMI.combat.debug.view(null)`); await sleep(600);
      check(g.filter((x: any) => x.s === 'graze' && x.g > 0.6).length >= 2 && g.every((x: any) => x.v < 1.5), `herd: grazing (${g.map((x: any) => x.s).join(', ')})`);
      await page.eval(`(() => { const cm = window.WAGMI.app.controllerManager; cm.setTouchInput('forward', 1); cm.setTouchInput('boost', 1); })()`);
      let fled: any = null, far: any = null;
      for (let i = 0; i < 16; i++) {
        await sleep(500); const s = await page.eval(S);
        if (i === 4 || i === 8 || i === 12) await shot(page, `herd-${i}-run`);
        if (!fled && s.filter((x: any) => x.s === 'flee').length >= 3) fled = s;
        if (i === 15) far = s;
      }
      await page.eval(`(() => { const cm = window.WAGMI.app.controllerManager; cm.setTouchInput('forward', 0); cm.setTouchInput('boost', 0); })()`);
      console.log('     fled ' + JSON.stringify(fled)); console.log('     after 8 s ' + JSON.stringify(far));
      check(!!fled, 'herd: scattered as Dan ran in');
      check(!!far && far.filter((x: any) => x.d > 8).length >= 3, 'herd: and outran him (three or more over 8 m off after 8 s of his sprint)');
    }
    if (scene === 'perf') {
      await boot(page);
      await page.eval(`(async () => { const C = window.WAGMI.creatures, P = window.WAGMI.person; const at = (d, a) => ({ x: P.position.x + Math.sin(P.heading + a) * d, z: P.position.z + Math.cos(P.heading + a) * d });
        const a = C.fight({ foes: [{ id: 'creature-knight', count: 3 }, 'creature-centaur', 'creature-ogre'], at: at(10, 0) }), b = C.fight({ boss: { id: 'creature-trex', name: 'The Matriarch' }, at: at(22, 0.4) });
        await Promise.all([a.ready, b.ready]); window.WAGMI.combat.player.autoGetUp = true; })()`);
      await page.eval(`window.__b = window.__bot({})`);
      await sleep(30000);
      const r = await page.eval(`new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else res({ fps: +(n / ((performance.now() - t0) / 1000)).toFixed(1), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, creatures: window.WAGMI.creatures.list().length, cost: window.WAGMI.combat.debug.cost() }); }; requestAnimationFrame(f); })`);
      console.log('     ' + JSON.stringify(r));
      await shot(page, 'perf-fight');
      check(r.fps > 20, `perf: ${r.fps} fps with ${r.creatures} creatures fighting after 30 s (heap ${r.heapMB} MB)`);
    }
    if (scene === 'ny') {
      await page.goto(BASE);
      for (let i = 0; i < 300; i++) { if (await page.eval('!!(window.__NYC_APP && window.__NYC_APP.ready && window.WAGMI && window.WAGMI.combat)').catch(() => false)) break; await sleep(250); }
      await sleep(2500); await shot(page, 'ny-0-title');
      await page.key('Enter', 'keyDown'); await sleep(60); await page.key('Enter', 'keyUp');
      await sleep(9000); await shot(page, 'ny-1-playing');
      const r = await page.eval(`({ creatures: typeof window.WAGMI.creatures, loaded: performance.getEntriesByType('resource').filter((e) => /wagmi\\/creatures\\/|assets\\/library\\//.test(e.name)).length, bossBar: !!document.querySelector('#wf .wf-boss'), cutscene: !!window.WAGMI.cutscene })`);
      console.log('     ' + JSON.stringify(r));
      check(r.creatures === 'undefined' && r.loaded === 0 && !r.bossBar, 'ny: New York loads no creature code or asset');
    }
    const errs = page.errors.slice(e0);
    check(errs.length === 0, `${scene}: 0 errors${errs.length ? ' (' + errs.slice(0, 3).join(' | ') + ')' : ''}`);
  }
}, { width: 1280, height: 720, timeoutMs: 20 * 60 * 1000 });
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
process.exit(fails.length ? 1 : 0);
