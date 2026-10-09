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
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { withBrowser, type Page } from '../lib/browser.ts';
import { insertDraft, db } from '../lib/db.ts';
import { meFragment, sanitizeMe } from '../lib/me.ts';
import { worldControls, OPEN_CONTROLS, runtimeSource, isKartWorld } from '../lib/custom-game.ts';
import { playtestWorld } from '../lib/playtest-runtime.ts';
import { KartScore, kartConstants, checkKartRun, type KartConstants } from '../lib/kart-score.ts';
import { dna } from '../lib/mog-dna.ts';

const BASE = process.env.BASE ?? 'http://localhost:3939';
let failures = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
  if (!cond) failures++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------ kart items -- */
// The items (mechanics.md section 6; lib/runtime/kart-items.js for their looks), on the kart fixture: each one given
// straight to a kart (debug.kart().give) and used, stepped exactly, with its counterplay; the roulette, the odds by
// bucket, the limits, the rivals using them; then the slot, the keys, the touch kit and the FUD splat in real time.
async function kartItemChecks(page: Page, K: <T>(js: string) => Promise<T>, ks: () => Promise<KartState>) {
  const TOP = 31, STEP = 1 / 120;
  // a fresh race, the rivals off the track, the count skipped
  const fresh = (seed = 5) => `K.solo(true); K.seed(${seed}); K.restart(); K.go(); K.solo(true); K.run(0.05, { gas: true });`;
  // stepped one step at a time, the events read every step: E(name, kart) the step it first happened (or -1)
  const stepper = `const EV = []; const step = (inp, n) => { for (let i = 0; i < (n || 1); i++) { K.run(1 / 120, inp); for (const e of K.events(true)) EV.push([S, ...e]); S++; } }; let S = 0;
    const E = (name, k) => { const e = EV.find((x) => x[1] === name && (k === undefined || x[2] === k)); return e ? e[0] : -1; };`;

  console.log('\nkart: the items');
  // the crates: three rows from the course, driven through: the roulette spins 1.2 s and lands; the crate is back 1.5 s after
  const cr = await K<{ n: number; rows: number; spin: number; back: number; item: string | null; slot: string | null }>(`${fresh()} ${stepper} const I0 = K.items(), c = I0.crates[0];
    K.place(c.d - 8, c.x, 20, 0, 0); K.events(true); step({ gas: true }, 600); const r = E('roll', 0), g = E('got', 0), took = EV.find((x) => x[1] === 'crate' && x[3] === 0);
    return { n: I0.crates.length, rows: new Set(I0.crates.map((q) => q.row)).size, spin: (g - r) / 120, took: took ? took[0] : -1, item: EV.find((x) => x[1] === 'got') ? EV.find((x) => x[1] === 'got')[3] : null, slot: K.items().karts[0].item };`);
  const crBack = await K<number>(`${fresh()} const c = K.items().crates[0]; K.place(c.d - 4, c.x, 20, 0, 0); let off = -1, on = -1; for (let s = 0; s < 400; s++) { K.run(1 / 120, { gas: true }); const q = K.items().crates[0].on; if (!q && off < 0) off = s; if (off >= 0 && q && on < 0) on = s; } return (on - off) / 120;`);
  ok('kart: Airdrop crates stand in rows across the road, from the course (three rows, 14 crates); one driven through spins the roulette 1.2 s, and it lands in the slot', cr.n === 14 && cr.rows === 3 && Math.abs(cr.spin - 1.2) <= STEP * 1.5 && !!cr.item && cr.slot === cr.item, JSON.stringify(cr));
  // (1.5 s until the owner's "more chaotic fun", 7 Oct: items flying all race)
  ok('kart: a crate taken is back 1 s later', Math.abs(crBack - 1.0) <= STEP * 2, `${crBack.toFixed(3)} s`);
  // a tap stops the roulette: at 0.5 s at the soonest (a tap at 0.2 s), at once after it (a tap at 0.8 s)
  const tap = (at: number) => K<number>(`${fresh()} ${stepper} const c = K.items().crates[0]; K.place(c.d - 4, c.x, 20, 0, 0); K.events(true); let r = -1;
    for (let i = 0; i < 300; i++) { const rolling = r >= 0; step({ gas: true, item: rolling && S - r === ${Math.round(at * 120)} }); if (r < 0) r = E('roll', 0); } return (E('got', 0) - r) / 120;`);
  const [t2, t8] = [await tap(0.2), await tap(0.8)];
  ok('kart: a tap stops the roulette: tapped at 0.2 s it lands at 0.5 s; at 0.8 s, there and then', Math.abs(t2 - 0.5) <= STEP * 1.5 && Math.abs(t8 - 0.8) <= STEP * 1.5, `${t2.toFixed(3)} s, ${t8.toFixed(3)} s`);

  // the odds: 6,000 rolls from each bucket against mechanics.md's table (past 20 s, so the WHALE DUMP may come)
  const TABLE = [[30, 35, 20, 10, 5, 0, 0, 0, 0, 0], [15, 25, 15, 25, 15, 0, 5, 0, 0, 0], [8, 18, 10, 28, 22, 6, 8, 0, 0, 0], [4, 12, 6, 26, 26, 14, 10, 2, 0, 0], [0, 8, 2, 24, 22, 22, 10, 4, 8, 0], [0, 4, 0, 16, 18, 29, 10, 5, 12, 6], [0, 0, 0, 12, 12, 28, 9, 5, 18, 16], [0, 0, 0, 8, 8, 27, 6, 5, 22, 24]];
  const IDS = ['gmbag', 'rug', 'wallet', 'laser', 'pump', 'wow', 'fud', 'whale', 'diamond', 'moon'];
  const odds = await K<Record<string, number>[]>(`${fresh()} K.run(20.5, {}); return [1, 2, 3, 4, 5, 6, 7, 8].map((b) => K.odds(b, 6000));`);
  let worst = 0, worstAt = '';
  odds.forEach((o, b) => IDS.forEach((id, i) => { const d = Math.abs(o[id] / 60 - TABLE[b][i]); if (d > worst) { worst = d; worstAt = `bucket ${b + 1} ${id}: ${(o[id] / 60).toFixed(1)}% for ${TABLE[b][i]}%`; } }));
  const zeros = odds.every((o, b) => IDS.every((id, i) => TABLE[b][i] > 0 || o[id] === 0));
  ok('kart: the odds by bucket are the table\'s (6,000 rolls a bucket, within 2.5 points), and what the table never gives never comes', worst < 2.5 && zeros, `worst ${worstAt}`);
  const bk = await K<number[]>(`${fresh()} K.place(200, 0, 0, 0, 0); K.place(260, 2, 0, 0, 1); const a = K.items().karts[0].bucket; K.place(340, 2, 0, 0, 1); const b = K.items().karts[0].bucket; K.place(520, 2, 0, 0, 1); const c = K.items().karts[0].bucket;
    K.place(210, 2, 0, 0, 2); K.place(220, -2, 0, 0, 3); const d = K.items().karts[0].bucket; return [a, b, c, d];`);
  ok('kart: the bucket is your place, one on more than 120 m behind the leader, two more than 300 m', bk.join() === '2,3,4,6', bk.join());
  const w = await K<{ x2: number; base: number; few: unknown }>(`${fresh()} K.run(20.5, {}); const base = K.odds(4, 6000).laser; K.weights({ 'Laser Eyes': 60 }); const x2 = K.odds(4, 6000).laser; const few = K.weights({ gmbag: 30, rug: 30, wallet: 30, laser: 0, pump: 0, wow: 0, fud: 0, whale: 0, diamond: 0, moon: 0 }); K.weights(null); return { base, x2, few };`);
    // (bucket 4: Laser Eyes 26 of 100; weighed double, 52 of 126)
  ok('kart: a world weighs the items (kart.items.weights, 0 to 60 each, 30 as they come): Laser Eyes at 60 in bucket 4 is 52 of 126 (41%, from 26%); fewer than five kinds left in, the weights are not used', Math.abs(w.x2 / 60 - 5200 / 126) < 2.5 && Math.abs(w.base / 60 - 26) < 2.5 && w.few === null, JSON.stringify(w));

  // the limits
  const lim = await K<Record<string, unknown>>(`${fresh()} const early = K.limit('whale').blocked; K.run(20.5, {}); const late = K.limit('whale').blocked;
    K.place(100, 0, 20, 0, 0); K.place(60, 2, 20, 0, 3); K.give('whale', 3); K.use(3); const one = K.limit('whale').blocked; K.run(4, {}); const after = K.limit('whale').blocked; const gone = K.items().whale === null; K.run(26.5, {}); const gap = K.limit('whale').blocked;
    K.give('diamond', 1); K.give('diamond', 2); const d2 = K.limit('diamond'); K.give(null, 2); const d1 = K.limit('diamond');
    K.give('laser', 1); K.give('laser', 2); K.give('laser', 3); const l3 = K.limit('laser'); const noLaser = K.odds(5, 3000).laser; K.give(null, 1); K.give(null, 2); K.give(null, 3);
    K.give('moon', 1); K.give('moon', 2); const m2 = K.limit('moon').blocked; K.give(null, 1); K.give(null, 2); const m0 = K.limit('moon').blocked; K.lap(2); K.place(K.state().L - 150, 0, 0, 0, 0); K.lap(2); const mEnd = K.limit('moon').blocked; const noMoon = K.odds(8, 3000).moon;
    return { early, late, one, after, gone, gap, d2: d2.blocked, d1: d1.blocked, l3: l3.blocked, noLaser, m2, m0, mEnd, noMoon };`);
  ok('kart: no WHALE DUMP in the first 20 s, one at a time, and 30 s between', lim.early === true && lim.late === false && lim.one === true && lim.after === true && lim.gone === true && lim.gap === false, JSON.stringify(lim));
  ok('kart: two Diamond Hands, two To The Moon and three Laser Eyes out at once at most (a roll that would break it rolls again), and no To The Moon within 200 m of the finish', lim.d2 === true && lim.d1 === false && lim.l3 === true && lim.noLaser === 0 && lim.m2 === true && lim.m0 === false && lim.mEnd === true && lim.noMoon === 0, JSON.stringify(lim));

  // GM Bag
  const bag = await K<number>(`${fresh()} K.place(100, 0, 20, 0, 0); K.gm(2); K.give('GM Bag'); K.run(1 / 120, { gas: true, item: true }); K.run(1 / 120, { gas: true }); return K.kart(0).gm;`);
  ok('kart: GM Bag: +3 GM (X uses it)', bag === 5, `${bag} GM`);

  // Rug Pull: dropped behind by a rival, driven onto: a second's spin at 0.35 of the speed, a GM gone, then a second untouchable
  const rug = await K<Record<string, any>>(`${fresh()} ${stepper} K.place(100, 0, 20, 0, 1); K.give('rug', 1); K.use(1, 0); const tr = K.items().traps[0]; K.place(tr.d - 12, tr.x, 20, 0, 0); K.gm(3); K.events(true);
    let v0 = 0, hitAt = -1, after = null; for (let i = 0; i < 300; i++) { const b = K.kart(0).v; step({ gas: true }); if (hitAt < 0 && E('hit', 0) >= 0) { hitAt = S; v0 = b; after = K.kart(0); } }
    const ik = K.items().karts[0]; return { trap: tr, hitAt, ratio: after ? after.v / v0 : 0, stun: after ? after.stun : 0, gm: K.kart(0).gm, kind: (EV.find((e) => e[1] === 'hit') || [])[3], left: K.items().traps.length };`);
  ok('kart: Rug Pull: a rug left on the road (1.6 m wide), driven onto: a second\'s spin, the speed to 0.35, a GM gone, and the rug gone', rug.trap && rug.hitAt > 0 && rug.kind === 'rug' && Math.abs(rug.ratio - 0.35) < 0.02 && Math.abs(rug.stun - 1.0) < 0.02 && rug.gm === 2 && rug.left === 0, JSON.stringify(rug));
  const hop = await K<Record<string, any>>(`${fresh()} ${stepper} K.place(100, 0, 20, 0, 1); K.give('rug', 1); K.use(1, 0); const tr = K.items().traps[0]; K.place(tr.d - 12, tr.x, 20, 0, 0); K.events(true); let hopped = false;
    for (let i = 0; i < 200; i++) { const r = tr.d - K.kart(0).d; const go = !hopped && r < 1.3 + 20 * 0.04; if (go) hopped = true; step({ gas: true, drift: go }); }
    return { hit: E('hit', 0), left: K.items().traps.length, past: K.kart(0).d > tr.d + 3 };`);
  ok('kart: counterplay: hop it (the hop clears it as it passes under) and it stays for the next kart', hop.hit < 0 && hop.left === 1 && hop.past, JSON.stringify(hop));
  // (at the top speed, steady: a kart still gathering speed covers more than its speed at the throw said)
  const lob = await K<Record<string, any>>(`${fresh()} K.place(100, 0, ${TOP}, 0, 0); K.give('rug'); K.use(0, 1); const t0 = K.items().traps[0]; K.run(0.6, { gas: true }); const t1 = K.items().traps[0]; return { fly: t0.fly, ahead: t1.d - K.kart(0).d, landed: t1.fly === 0 };`);
  ok('kart: pushed up (E, or the stick up) it is lobbed, to land 20 m ahead of you', lob.landed && Math.abs(lob.ahead - 20) < 1.5 && lob.fly > 0.5, JSON.stringify(lob));
  const three = await K<Record<string, any>>(`${fresh()} K.place(100, 0, 20, 0, 0); for (let i = 0; i < 4; i++) { K.give('rug'); K.use(0, 0); K.run(0.5, { gas: true }); } const n = K.items().traps.length; K.run(31, {}); return { n, after: K.items().traps.length };`);
  ok('kart: three rugs an owner on the road at most (a fourth takes up the oldest), and each lasts 30 s', three.n === 3 && three.after === 0, JSON.stringify(three));

  // Laser Eyes: at the next kart ahead, fast, homing: a tumble, the speed to 0.30, 3 GM spilled on the road
  const laserRun = (pre: string, during = 'false') => K<Record<string, any>>(`${fresh()} ${stepper} K.place(120, 0, 20, 0, 0); K.gm(5); ${pre} K.place(90, 1.5, 20, 0, 1); K.give('laser', 1); K.events(true); K.use(1, 0);
    const sh = K.items().shots[0]; let v0 = 0, after = null, minGap = 99, hopped = false, gmAt = null;
    for (let i = 0; i < 360; i++) { const s0 = K.items().shots[0], k = K.kart(0); if (s0) minGap = Math.min(minGap, Math.abs(s0.d - k.d)); const b = k.v; const near = !!s0 && k.d - s0.d < 3 && k.d - s0.d > 0;
      const go = ${during} && near && !hopped; if (go) hopped = true; step({ gas: true, drift: go }); if (!after && E('hit', 0) >= 0) { after = K.kart(0); v0 = b; gmAt = K.items().spill; } }
    return { shot: sh, hit: E('hit', 0), ratio: after ? after.v / v0 : 0, stun: after ? after.stun : 0, gm: after ? after.gm : K.kart(0).gm, spill: gmAt === null ? K.items().spill : gmAt, blocked: E('blocked', 0), dodged: E('dodge', 0), shielded: E('shielded', 0), slot: K.items().karts[0].item, shield: K.items().karts[0].shield, end: (EV.find((e) => e[1] === 'laserEnd') || [])[3] };`);
  const lz = await laserRun('');
  ok('kart: Laser Eyes: fired at the next kart ahead at 46.8 m/s at least (40 until 7 Oct\'s faster race), it homes in: a tumble of 0.9 s, the speed to 0.30, and 3 GM spilled on the road for anyone', lz.shot && lz.shot.target === 0 && lz.shot.v >= 46.7 && lz.hit > 0 && Math.abs(lz.ratio - 0.3) < 0.02 && Math.abs(lz.stun - 0.9) < 0.02 && lz.gm === 2 && lz.spill === 3, JSON.stringify(lz));
  const lzW = await laserRun("K.give('wallet'); K.use(0);");
  ok('kart: counterplay: a Cold Wallet blocks a laser (and is spent)', lzW.blocked > 0 && lzW.hit < 0 && lzW.gm === 5 && lzW.shield === 0, JSON.stringify(lzW));
  const lzH = await laserRun('', 'true');
  ok('kart: counterplay: hop as it closes (inside 3 m: 2.5 until the faster laser, 7 Oct) and it passes underneath', lzH.dodged > 0 && lzH.hit < 0, JSON.stringify(lzH));
  // (a laser at a rival twenty times round the lap: a Normal rival hops 35% of them, up as it closes)
  const aiLz = await K<Record<string, any>>(`${fresh(9)} ${stepper} let hits = 0, dodged = 0, passes = 0; for (let i = 0; i < 20; i++) { K.place(150 + i * 50, 0, 22, 0, 1); K.place(120 + i * 50, 0, 22, 0, 2); K.give('laser', 2); K.events(true); EV.length = 0; K.use(2, 0);
    const id = K.items().shots[0].id; for (let s = 0; s < 480 && K.items().shots.length; s++) step({ gas: true }); passes++;
    const e = EV.find((x) => (x[1] === 'hit' && x[2] === 1 && x[3] === 'laser') || (x[1] === 'dodge' && x[2] === 1 && x[3] === id)); if (e && e[1] === 'hit') hits++; else if (e) dodged++; K.place(10, 0, 0, 0, 1); K.place(30, 0, 0, 0, 2); } return { hits, dodged, passes };`);
  ok('kart: a rival with a laser homing on it hops it as it closes when it has the nerve (Normal: 35%), and most are hit (the rest end on what it carries: a rug dragged, a Wallet)', aiLz.dodged >= 3 && aiLz.hits > aiLz.dodged && aiLz.hits + aiLz.dodged >= 12, JSON.stringify(aiLz));
  const drag = await K<Record<string, any>>(`${fresh()} ${stepper} K.place(120, 0, 20, 0, 0); K.give('rug'); step({ gas: true, item: true }); const dragging = K.items().karts[0].drag; K.place(90, 1.5, 20, 0, 1); K.give('laser', 1); K.use(1, 0);
    for (let i = 0; i < 300; i++) step({ gas: true, item: true }); return { dragging, shielded: E('shielded', 0), hit: E('hit', 0), slot: K.items().karts[0].item };`);
  ok('kart: counterplay: something dragged behind (the item button held) takes a laser from behind', drag.dragging && drag.shielded > 0 && drag.hit < 0 && drag.slot === null, JSON.stringify(drag));
  const back = await K<Record<string, any>>(`${fresh()} K.place(100, 0, 20, 0, 0); K.place(140, 0, 20, 0, 1); K.give('laser'); K.use(0, -1); const s0 = K.items().shots[0]; K.run(0.3, { gas: true }); const s1 = K.items().shots[0]; return { dir: s0.dir, target: s0.target, from: s0.d, to: s1 ? s1.d : null };`);
  ok('kart: pulled back (↓, C or the stick down) it is fired behind, straight', back.dir === -1 && back.target === -1 && back.to !== null && back.to < back.from - 8, JSON.stringify(back));
  const wall = await K<Record<string, any>>(`${fresh()} ${stepper} K.place(100, 0, 0, 60, 0); K.give('laser'); K.events(true); K.use(0, -1); step({}, 120); const e = EV.find((x) => x[1] === 'laserEnd'); return { end: e ? e[3] : null, at: e ? e[0] / 120 : -1, left: K.items().shots.length };`);
  ok('kart: a laser fired into a wall ends there', wall.end === 'wall' && wall.at > 0 && wall.at < 0.6 && wall.left === 0, JSON.stringify(wall));

  // Pump and Much Wow
  const pump = await K<Record<string, any>>(`${fresh()} K.place(100, 0, ${TOP}, 0, 0); K.give('pump'); K.use(0); const a = K.kart(0); const tr = K.run(1.5, { gas: true }, 1 / 120); return { src: a.src, cap: a.cap, T: tr.filter((s) => s.src === 'pump' && s.boost > 0).length / 120, peak: Math.max(...tr.map((s) => s.v)) };`);
  ok('kart: Pump: one boost, +32% for 1.2 s', pump.src === 'pump' && pump.cap === 0.32 && Math.abs(pump.T - 1.2) <= STEP * 2 && pump.peak > TOP * 1.25, JSON.stringify(pump));
  const wow = await K<Record<string, any>>(`${fresh()} K.place(100, 0, ${TOP}, 0, 0); K.give('Much Wow'); const c0 = K.items().karts[0].charges; const out = [];
    for (let i = 0; i < 3; i++) { K.run(1 / 120, { gas: true, item: true }); const a = K.kart(0); out.push([a.src, a.cap, K.items().karts[0].charges]); K.run(1.4, { gas: true }); } return { c0, out, slot: K.items().karts[0].item };`);
  ok('kart: Much Wow: three charges, each its own boost (+32% for 1.0 s), the slot empty after the third', wow.c0 === 3 && wow.out.map((o: any[]) => o.join(':')).join() === 'wow:0.32:2,wow:0.32:1,wow:0.32:0' && wow.slot === null, JSON.stringify(wow));

  // FUD Cloud: on everyone ahead: a rival's pace 8% down and its line shaken for 2.5 s; you 8% slower for 2.5 s (a boost
  // clears it twice as fast). (Until the owner's third review, 7 Oct: 3 s on a rival, and on you an ink splat over the
  // middle of your screen for 3.5 s, "it blocks entire view")
  const fud = await K<Record<string, any>>(`${fresh()} K.place(100, 0, 20, 0, 1); K.place(140, 0, 20, 0, 2); K.place(120, 0, 20, 0, 0); K.give('fud'); K.use(0); K.run(0.5, { gas: true }); const r = K.items().karts; const p1 = K.kart(1).pace, p2 = K.kart(2).pace; return { ahead: r[2].fudAI, behind: r[1].fudAI, p1, p2 };`);
  ok('kart: FUD Cloud: everyone ahead of you: a rival\'s pace down 8% and its line shaken, for 2.5 s; nobody behind', fud.ahead > 2.3 && fud.ahead <= 2.5 && fud.behind === 0 && Math.abs(fud.p2 / fud.p1 - 0.92) < 0.06, JSON.stringify(fud));
  const fudMe = await K<Record<string, any>>(`${fresh()} K.place(140, 0, 20, 0, 0); K.place(100, 0, 20, 0, 1); K.give('fud', 1); K.use(1); K.run(0.36, { gas: true }); const t0 = K.items().karts[0].fud; K.run(1, { gas: true }); const plain = K.items().karts[0].fud;
    K.place(140, 0, 20, 0, 0); K.place(100, 0, 20, 0, 1); K.give('fud', 1); K.use(1); K.run(0.36, { gas: true }); K.give('pump'); K.use(0); K.run(1, { gas: true }); const boosted = K.items().karts[0].fud;
    K.place(140, 0, ${TOP}, 0, 0); K.place(100, 0, 20, 0, 1); K.give('fud', 1); K.use(1); K.run(2.2, { gas: true }); const slowed = K.kart(0).v; K.run(1.5, { gas: true }); return { t0, plain, boosted, slowed: +(slowed / ${TOP}).toFixed(3), after: +(K.kart(0).v / ${TOP}).toFixed(3) };`);
  ok('kart: on you, 2.5 s of it, 8% off your speed (a boost clears it twice as fast), then back to the top', Math.abs(fudMe.t0 - 2.5) < 0.05 && Math.abs(fudMe.t0 - fudMe.plain - 1) < 0.03 && Math.abs(fudMe.t0 - fudMe.boosted - 2) < 0.05 && fudMe.slowed < 0.95 && fudMe.slowed > 0.9 && fudMe.after > 0.97, JSON.stringify(fudMe));

  // WHALE DUMP: on the leader; the shadow 2.5 s, the aim locked 0.25 s before; a flip of 1.6 s, the speed to 0.20, 3 GM spilled
  const whale = (pre: string, at = -1) => K<Record<string, any>>(`${fresh()} ${stepper} K.run(20.5, {}); K.place(100, 0, ${TOP}, 0, 0); K.gm(5); ${pre} K.place(40, 2, 20, 0, 3); K.give('whale', 3); K.events(true); K.use(3); const w0 = K.items().whale;
    let v0 = 0, after = null; for (let i = 0; i < 420; i++) { const b = K.kart(0).v; step({ gas: true, item: S === ${Math.round(at * 120)} }); if (!after && E('hit', 0) >= 0) { after = K.kart(0); v0 = b; } }
    return { target: w0.target, lock: E('whaleLock') / 120, slam: E('slam') / 120, hit: E('hit', 0), ratio: after ? after.v / v0 : 0, stun: after ? after.stun : 0, gm: K.kart(0).gm, kind: (EV.find((e) => e[1] === 'hit' && e[2] === 0) || [])[3] };`);
  const wh = await whale('');
  ok('kart: WHALE DUMP: on the leader as it is fired (at the top speed); the aim locks at 2.25 s, the slam at 2.5 s, 8.2 m round it (7 until the faster race, 7 Oct): a 1.6 s flip, the speed to 0.20, 3 GM spilled', wh.target === 0 && Math.abs(wh.lock - 2.25) <= STEP * 1.5 && Math.abs(wh.slam - 2.5) <= STEP * 1.5 && wh.kind === 'whale' && Math.abs(wh.ratio - 0.2) < 0.02 && Math.abs(wh.stun - 1.6) < 0.02 && wh.gm === 2, JSON.stringify(wh));
  const whB = await whale("K.give('pump');", 2.12);
  ok('kart: counterplay: a boost (+20% or more) at the lock and you are out of the 8.2 m before it lands', whB.hit < 0 && whB.slam > 0, JSON.stringify(whB));
  const whW = await whale("K.give('wallet'); K.use(0);");
  ok('kart: and a Cold Wallet does not stop the Whale', whW.kind === 'whale', JSON.stringify(whW));
  const whD = await whale("K.give('diamond'); K.use(0);");
  ok('kart: Diamond Hands does', whD.hit < 0, JSON.stringify(whD));

  // Diamond Hands: 6 s untouchable, +12%, off the road as on it, and it spins whoever it touches
  const dia = await K<Record<string, any>>(`${fresh()} ${stepper} K.place(100, 9.5, 22, 0, 0); K.give('diamond'); K.use(0); const a = K.kart(0); const tr = []; for (let i = 0; i < 120; i++) { step({ gas: true }); tr.push(K.kart(0)); }
    K.place(200, 0, 22, 0, 0); K.place(200, 1.25, 22, 0, 1); K.give('diamond'); K.use(0); K.events(true); EV.length = 0; step({ gas: true }, 30); const touched = (EV.find((e) => e[1] === 'hit' && e[2] === 1) || [])[3];
    K.run(5.5, { gas: true }); const left = K.items().karts[0].diamond; K.run(0.6, { gas: true });
    return { src: a.src, cap: a.cap, off: tr.some((s) => s.off), minV: Math.min(...tr.slice(60).map((s) => s.v)), touched, left, after: K.items().karts[0].diamond };`);
  ok('kart: Diamond Hands: 6 s, +12%, held up by nothing off the road, and whoever it touches spins', dia.src === 'diamond' && dia.cap === 0.12 && dia.off && dia.minV > TOP && dia.touched === 'touch' && dia.left > 0 && dia.after === 0, JSON.stringify(dia));

  // To The Moon: 3.5 s on rails at 40 m/s at least, nothing touches it, over the rugs, then 0.8 s untouchable
  const moon = await K<Record<string, any>>(`${fresh()} ${stepper} K.place(60, 0, 20, 0, 1); K.give('rug', 1); K.use(1, 0); K.place(40, 0, 20, 0, 0); K.give('moon'); K.use(0); const tr = [];
    for (let i = 0; i < 480; i++) { step({ gas: false, steer: -1 }); tr.push(K.kart(0)); if (i === 120) K.hit('laser', 0); }
    // (on the road for the 3.5 s it rides: after it, the stick still hard over at 40 m/s turns the kart off it, since 7 Oct's turn)
    const ik = K.items().karts[0]; return { top: Math.max(...tr.map((s) => s.v)), lat: Math.max(...tr.slice(0, 420).map((s) => Math.abs(s.x))), hit: E('hit', 0), rug: K.items().traps.length, moon: ik.moon, iframe: ik.iframe, end: E('moonEnd', 0) / 120 };`);
  ok('kart: To The Moon: 3.5 s on the rocket at 46.8 m/s and more (40 until 7 Oct\'s faster race), on the road whatever the stick says, over rugs, untouchable, then 0.8 s more untouchable', moon.top >= 46.7 && moon.lat < 8 && moon.hit < 0 && moon.rug === 1 && Math.abs(moon.end - 3.5) <= STEP * 2 && moon.iframe > 0.2 && moon.iframe <= 0.8, JSON.stringify(moon));

  // a second untouchable after every item hit
  const ifr = await K<string[]>(`${fresh()} K.place(100, 0, 20, 0, 0); const a = K.hit('rug', 0); K.run(1.9, { gas: true }); const b = K.hit('laser', 0); K.run(0.2, { gas: true }); const c = K.hit('laser', 0); return [a, b, c];`);
  ok('kart: every item hit is followed by a second untouchable (a rug\'s spin is 1 s: a laser 1.9 s on misses, 2.1 s on hits)', ifr.join() === 'hit,iframe,hit', ifr.join());

  // the rivals: every kind of item used in a race, at karts, with hits, and the race still finishes inside 3:30
  // (four races: the Whale rolls only from mid-pack, 2 to 5% a roll, and the 7 Oct pace and tiers left 3, 17 and 42
  // without a slam between them)
  const races = await K<{ times: (number | null)[]; items: { got: Record<string, number>; used: Record<string, number>; hits: Record<string, number>; blocked: number; dodged: number; crates: number; slams: number } }[]>('return [3, 17, 42, 5].map((s) => K.headless(s, 300, true));');
  const used: Record<string, number> = {}, hits: Record<string, number> = {};
  races.forEach((r) => { for (const [k, v] of Object.entries(r.items.used)) used[k] = (used[k] || 0) + v; for (const [k, v] of Object.entries(r.items.hits)) hits[k] = (hits[k] || 0) + v; });
  ok('kart: the rivals use their items (four races: nine kinds or more used, items hitting karts, a Whale slam), and every race still finishes inside 3:30', Object.keys(used).length >= 9 && Object.values(hits).reduce((a, b) => a + b, 0) >= 10 && races.some((r) => r.items.slams > 0) && races.every((r) => r.times.every((x) => x !== null && x <= 210)),
    `used ${JSON.stringify(used)}, hits ${JSON.stringify(hits)}`);
  // (a rug every 50 m round the lap, each met once, by a rival coming up on it from 34 m)
  const aiHop = await K<Record<string, any>>(`${fresh(9)} ${stepper} let hits = 0, passes = 0; for (let i = 0; i < 20; i++) { K.place(150 + i * 50, 0, 22, 0, 2); K.give('rug', 2); K.use(2, 0); const tr = K.items().traps.slice(-1)[0]; K.place(tr.d - 34, tr.x + 0.3, 22, 0, 1); K.events(true); EV.length = 0;
    step({ gas: true }, 220); passes++; if (EV.some((e) => e[1] === 'hit' && e[2] === 1)) hits++; K.place(10, 0, 0, 0, 1); K.place(30, 0, 0, 0, 2); } return { hits, passes };`);
  ok('kart: a rival meeting a rug on its line mostly gets round it or hops it (Normal: hops 35%)', aiHop.hits < aiHop.passes * 0.5, JSON.stringify(aiHop));

  // the HUD, in real time: the roulette in the slot, X uses it, the touch kit's ITEM, the FUD Cloud on you
  await K(`${fresh()} const c = K.items().crates[1]; K.place(c.d - 30, c.x, 20, 0, 0); K.hold({ gas: true }); return 1;`);
  const seen: { icon: string | null; rolling: boolean; slot: string | null; shown: boolean }[] = [];
  for (let i = 0; i < 70; i++) { const st = await ks(); seen.push({ icon: st.hud.item.icon, rolling: st.hud.item.rolling, slot: st.item.slot, shown: st.hud.item.shown }); await sleep(40); }
  await K('K.hold(null); return 1;');
  const spun = new Set(seen.filter((q) => q.rolling).map((q) => q.icon)), last = seen[seen.length - 1];
  ok('kart: the slot (under the lap) spins the roulette through the items, then shows what landed', seen.every((q) => q.shown) && spun.size >= 4 && !last.rolling && !!last.slot && last.icon === last.slot, `${spun.size} icons spun, landed ${last.slot} (${last.icon})`);
  await K(`K.place(100, 0, 20, 0, 0); K.give('pump'); return 1;`);
  await page.key('KeyX', 'keyDown'); await sleep(120); await page.key('KeyX', 'keyUp'); await sleep(80);
  const kx = await ks();
  ok('kart: X uses the item (Pump: the boost on)', kx.item.slot === null && kx.src === 'pump', `${kx.item.slot} ${kx.src}`);
  // the real keys with a Rug Pull: a tap of E lobs it ahead (E is the button and the aim at once), a tap of X drops it behind
  const rugKey = async (code: string) => {
    await K(`K.place(100, 0, 20, 0, 0); K.give('rug'); return 1;`);
    await page.key(code, 'keyDown'); await sleep(150); await page.key(code, 'keyUp'); await sleep(40);
    const a = await K<{ fly: number; from: number } | null>(`const t = K.items().traps.filter((q) => q.owner === 0).slice(-1)[0]; return t ? { fly: t.fly, from: K.kart(0).d } : null;`);
    await sleep(800);
    const b = await K<{ fly: number; d: number; slot: string | null } | null>(`const t = K.items().traps.filter((q) => q.owner === 0).slice(-1)[0]; return t ? { fly: t.fly, d: t.d, slot: K.items().karts[0].item } : null;`);
    return { fly: a ? a.fly : -1, landed: b ? b.fly === 0 : false, ahead: a && b ? +(b.d - a.from).toFixed(1) : null, slot: b ? b.slot : 'none' };
  };
  const [keE, keX] = [await rugKey('KeyE'), await rugKey('KeyX')];
  ok('kart: keys: a tap of E lobs a Rug Pull ahead (it lands 15 m or more on), a tap of X drops it behind', keE.fly > 0.3 && keE.landed && keE.ahead !== null && keE.ahead > 15 && keE.slot === null && keX.fly === 0 && keX.ahead !== null && keX.ahead < 0, `E ${JSON.stringify(keE)}, X ${JSON.stringify(keX)}`);
  const tk = await page.eval<{ buttons: string[]; itemAbove: boolean; used: string | null }>(`(async () => { const r = document.querySelector('#gm'), had = r.classList.contains('touch'); r.classList.add('touch'); const b = [...document.querySelectorAll('#gm .tpad button')];
    const it = b.find((x) => x.textContent === 'ITEM'), dr = b.find((x) => x.textContent === 'DRIFT'), a = it.getBoundingClientRect(), d = dr.getBoundingClientRect();
    const K = window.__gmRuntime.debug.kart(); K.give('gmbag'); const g0 = K.state().gm; it.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await new Promise((q) => setTimeout(q, 120)); it.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await new Promise((q) => setTimeout(q, 80));
    const used = K.state().gm - g0 === 3 ? 'gmbag' : null; if (!had) r.classList.remove('touch');
    return { buttons: b.map((x) => x.textContent), itemAbove: a.bottom <= d.top + 2 && Math.abs((a.left + a.right) / 2 - (d.left + d.right) / 2) < 4 && a.width === 76, used }; })()`);
  ok('kart: touch: ITEM (76 px) above DRIFT, and a tap on it uses the item', tk.buttons.join() === 'BRAKE,ITEM,DRIFT' && tk.itemAbove && tk.used === 'gmbag', JSON.stringify(tk));
  await K(`K.place(160, 0, 20, 0, 0); K.place(120, 0, 20, 0, 1); K.give('fud', 1); K.use(1); return 1;`);
  await sleep(700);
  const fs = await K<{ mid: number; edge: number; opacity: number; cloud: number[] | null; top: number; clouds: string[] } | null>('return K.fud();');
  ok('kart: the FUD Cloud on you hangs high over your kart (in the middle, its foot above a quarter of the way down the screen) and the edges of the screen darken a little, never the middle: nothing of it over the road ahead (7 Oct: an ink splat over the middle 35%, "it blocks entire view")',
    !!fs && !!fs.cloud && fs.cloud[0] > 0.3 && fs.cloud[1] < 0.7 && fs.cloud[3] <= 0.3 && fs.mid <= 0.02 && fs.edge > 0.05 && fs.opacity > 0.9 && fs.clouds.some((c) => c.startsWith('me:0')), JSON.stringify(fs));
  await sleep(2400);
  const gone = await ks();
  ok('kart: and is gone 2.5 s later', gone.hud.fud === 0 && gone.item.fud === 0, `${gone.hud.fud} ${gone.item.fud}`);
  // the WHALE DUMP on your own kart, seen from your camera: it fades as the camera comes inside it (the road stays on
  // the screen), solid while it is far; and it was made ahead, on the start screen
  const warm = await K<number>('return K.items().warm;');
  await K(`${fresh()} K.run(20.5, {}); K.place(300, 0, 20, 0, 0); K.place(240, 2, 20, 0, 3); K.give('whale', 3); K.use(3); K.hold({ gas: true }); return 1;`);
  const whTarget = await K<number>('return K.items().whale.target;'), wop: number[] = [];
  for (let i = 0; i < 75; i++) { const w = await K<{ opacity: number; shown: boolean; t: number } | null>('return K.items().whale;'); if (w && w.shown) wop.push(w.opacity); await sleep(40); }
  await K('K.hold(null); return 1;');
  ok('kart: the WHALE DUMP slammed on you fades for your camera (to 0.15 or less; 0.3 until 7 Oct) and is solid up in the sky; it and a FUD Cloud were made before the race', warm === 2 && wop.length > 20 && Math.max(...wop.slice(0, 5)) > 0.95 && Math.min(...wop) <= 0.15 && whTarget === 0, `target ${whTarget}, warm ${warm}, opacity ${Math.max(...wop).toFixed(2)} .. ${Math.min(...wop).toFixed(2)} (${wop.length} frames)`);
}

/* ------------------------------------------------------------ kart chaos -- */
// The owner's review (7 Oct): "needs more chaotic fun, in terms of roads, breaks, jumps and players interacting with
// each other in terms of bumps, road rage etc." On the fixture's chaos (lib/runtime/kart-world.js: three rollers, a
// break with a lip before it and two linked rails over it, a rolling coin, a toppling candle and meteors): the charge
// jump, the rails, the bumps, the break, weight in a bump, the hop-bash and the GM it knocks loose, a rival's rage, the
// hazards and no stun-lock, stepped exactly as the rest; then what it all looks like, in real time.
async function kartChaosChecks(page: Page, K: <T>(js: string) => Promise<T>, ks: () => Promise<KartState>) {
  const STEP = 1 / 120, TOP = 31;
  const fresh = (seed = 5) => `K.solo(true); K.seed(${seed}); K.restart(); K.go(); K.solo(true); K.run(0.05, { gas: true });`;
  const stepper = `const EV = []; const step = (inp, n) => { for (let i = 0; i < (n || 1); i++) { K.run(1 / 120, inp); for (const e of K.events(true)) EV.push([S, ...e]); S++; } }; let S = 0;
    const E = (name, k) => { const e = EV.find((x) => x[1] === name && (k === undefined || x[2] === k)); return e ? e[0] : -1; };`;
  type CS = Sample & { cj: number; cjAir: boolean; grind: number; grindT: number; pit: boolean; airT: number; vy: number; mad: number; madAt: number; calm: number; bashI: number; hit: string; iframe: number };
  console.log('\nkart: the chaos (7 Oct)');
  const C = await K<{ breaks: { d0: number; len: number }[]; rails: { d0: number; len: number; pts: number[][]; next: number; h: number }[]; bumps: { d0: number; kind: string; n: number; len: number }[]; hazards: { kind: string; d: number; every: number; off: number; side: number }[] }>('return K.course();');
  ok('kart: the course reads its chaos (kart.course): a break of 8 m, two rails the first linked to the second, three rollers and a lip, and three hazards (a rolling coin, a candle, meteors)',
    C.breaks.length === 1 && Math.abs(C.breaks[0].len - 8) < 0.01 && C.rails.length === 2 && C.rails[0].next === 1 && C.bumps.length === 2 && C.bumps[0].n === 3 && C.bumps[1].kind === 'lip' && C.hazards.map((h) => h.kind).join() === 'crossing,topple,meteor',
    `break ${C.breaks[0]?.len} m at ${C.breaks[0]?.d0.toFixed(0)}, rails ${C.rails.map((r) => `${r.d0.toFixed(0)}+${r.len.toFixed(0)}`).join(' > ')}, ${C.hazards.map((h) => h.kind).join(', ')}`);
  const B = C.breaks[0], R = C.rails[0];

  // the charge jump: Space held through the hop's landing, no steer, charges; let go, it jumps
  const cj = await K<{ y: number; air: number; hop: number; hopCj: boolean; yHalf: number; drift: boolean }>(`${fresh()} K.place(40, 0, 20); const tr = K.run(1.8, function (t) { return { gas: true, drift: t < 0.95 }; }, 1 / 120);
    K.place(40, 0, 20); const hp = K.run(0.6, function (t) { return { gas: true, drift: t < 0.03 }; }, 1 / 120);
    K.place(40, 0, 20); const half = K.run(1.6, function (t) { return { gas: true, drift: t < 0.58 }; }, 1 / 120);
    return { y: Math.max(...tr.map((s) => s.y)), air: tr.filter((s) => s.cjAir).length / 120, hop: Math.max(...hp.map((s) => s.y)), hopCj: hp.some((s) => s.cjAir), yHalf: Math.max(...half.map((s) => s.y)), drift: tr.some((s) => s.drift) };`);
  ok('kart: Space held driving straight (the stick under a quarter) charges a charge jump once the hop lands: let go after 0.25 s and the kart jumps, 0.63 m at a full charge (0.6 s; twice a hop), less on less, 0.6 s or more in the air (the hang at the top)',
    Math.abs(cj.y - 0.63) < 0.03 && cj.y / cj.hop > 1.85 && cj.y / cj.hop < 2.1 && cj.yHalf > 0.4 && cj.yHalf < cj.y - 0.1 && cj.air >= 0.6 && cj.air < 0.75 && !cj.hopCj && !cj.drift, JSON.stringify(cj));
  const cjD = await K<CS[]>(`K.place(40, 0, 20); return K.run(1.2, function (t) { return { gas: true, drift: true, steer: t > 0.5 ? 1 : 0 }; }, 1 / 120);`);
  ok('kart: and a steer while it charges is a drift that way, as before (no jump)', cjD.some((s) => s.drift === 1) && !cjD.some((s) => s.cjAir), `drift ${[...new Set(cjD.map((s) => s.drift))].join(',')}`);

  // the break: fallen into, the Claw (30 m before it); a charge jump at its edge, over it; the lip, over it
  const brk = await K<{ fall: CS[]; jump: CS[]; lip: CS[] }>(`K.gm(5); K.place(${B.d0 - 30}, 0, 24); const fall = K.run(4.5, { gas: true }, 1 / 120);
    K.place(${B.d0 - 26}, 0, 24); const jump = K.run(2.5, function (t, k) { return { gas: true, drift: k.d < ${B.d0 - 1.2} }; }, 1 / 120);
    K.place(${B.d0 - 30}, 4.5, 24); const lip = K.run(2.5, function (t, k) { return { gas: true, drift: k.air && k.lipT < 0.3 && !k.trick }; }, 1 / 120);
    return { fall, jump, lip };`);
  const called = brk.fall.findIndex((s) => s.rescue >= 0), down = brk.fall.findIndex((s, i) => i > called && s.rescue < 0), dn = brk.fall[down];
  ok('kart: a break in the road: driven into, the kart falls (3 m down) and the Rescue Claw sets it down 30 m before the break, 2 GM lighter',
    brk.fall.some((s) => s.pit) && called > 0 && !!dn && B.d0 - dn.d >= 29.5 && B.d0 - dn.d < 31 && dn.gm === 3, dn ? `fell, the Claw at ${(called / 120).toFixed(2)} s, set down ${(B.d0 - dn.d).toFixed(1)} m before it, GM 5 -> ${dn.gm}` : 'never set down');
  ok('kart: a charge jump at its edge clears it (and the lip before it on the right throws you over it with no Space at all, a trick\'s window open: +15% for 0.5 s)',
    !brk.jump.some((s) => s.pit) && brk.jump[brk.jump.length - 1].d > B.d0 + B.len + 8 && !brk.lip.some((s) => s.pit) && brk.lip.some((s) => s.air) && brk.lip[brk.lip.length - 1].d > B.d0 + B.len + 8 && brk.lip.some((s) => s.src === 'trick' && s.cap === 0.15),
    `jump: ${brk.jump[brk.jump.length - 1].d.toFixed(0)} m, lip: ${brk.lip.filter((s) => s.air).length / 120} s up, ${[...new Set(brk.lip.map((s) => `${s.src}:${s.cap}`))].join(' ')}`);

  // the rails
  const rl = await K<{ tr: CS[]; ev: unknown[][] }>(`K.events(true); K.gm(0); K.place(${R.d0 - 24}, ${R.pts[0][1]}, 23); const tr = K.run(4.5, function (t, k) { return { gas: true, drift: k.d < ${R.d0 - 7} }; }, 1 / 120); return { tr, ev: K.events(true).filter((e) => e[0] === 'grind' || e[0] === 'grindEnd') };`);
  const g0 = rl.tr.findIndex((s) => s.grind === 0), gEnd = rl.tr.findIndex((s, i) => i > g0 && s.grind < 0), onR = rl.tr.filter((s) => s.grind >= 0), after = rl.tr.slice(Math.max(0, gEnd));
  const peakG = onR.length ? Math.max(...onR.map((s) => s.v)) : 0, paid = after.filter((s) => s.src === 'grind' && s.boost > 0).length / 120;
  ok('kart: a charge jump onto a rail grinds it: on across the link to the next rail, the speed rising to +12% over the top (1.03 s; 1.2 until the faster race, 7 Oct), and off the end up into the air (a trick\'s window), the grind paid: +20% for up to 1 s; nothing falls into the break under it',
    g0 > 0 && rl.tr.some((s) => s.grind === 1) && peakG > TOP * 1.1 && peakG < TOP * 1.13 && gEnd > g0 && after.some((s) => s.air) && Math.abs(paid - 1.0) <= STEP * 3 && after.some((s) => s.cap === 0.2) && !rl.tr.some((s) => s.pit) && rl.ev.some((e) => e[0] === 'grindEnd' && e[3] === 1),
    `on at ${(g0 / 120).toFixed(2)} s, rails ${[...new Set(onR.map((s) => s.grind))].join('>')}, ${(onR.length / 120).toFixed(2)} s on them, peak ${(peakG / TOP).toFixed(3)}x, paid ${paid.toFixed(3)} s`);
  const hopOff = await K<{ tr: CS[]; ev: unknown[][] }>(`K.events(true); K.place(${R.d0 - 24}, ${R.pts[0][1]}, 23); const tr = K.run(3, function (t, k) { const off = k.grind >= 0 && k.d > ${R.d0 + R.len + 2}; return { gas: true, drift: k.d < ${R.d0 - 7} || off, steer: off ? -1 : 0 }; }, 1 / 120); return { tr, ev: K.events(true).filter((e) => e[0] === 'grindEnd') };`);
  const ho = hopOff.tr.findIndex((s, i) => i > 0 && hopOff.tr[i - 1].grind >= 0 && s.grind < 0), hoS = hopOff.tr[Math.min(hopOff.tr.length - 1, ho + 72)];
  ok('kart: Space on a rail hops off it, to the side the stick says (out past the rail\'s reach), paid as off its end',
    ho > 0 && hopOff.ev.length === 1 && hopOff.ev[0][2] === -1 && !!hoS && hoS.grind < 0 && !hopOff.tr.slice(ho).some((s) => s.grind >= 0) && hopOff.tr.slice(ho).some((s) => s.src === 'grind') && !hopOff.tr.some((s) => s.pit),
    `off at ${(ho / 120).toFixed(2)} s, ${JSON.stringify(hopOff.ev[0])}, 0.6 s on at x ${hoS?.x}`);
  const rw = await K<CS[]>(`K.place(${R.d0 + 3}, ${R.pts[0][1] + 2.2}, 10, -30); return K.run(0.7, { gas: true, steer: -0.6 }, 1 / 120);`);
  ok('kart: on the ground a rail is a wall: driven into from the side, the kart glances or scrapes along it, never through it, never a bonk',
    rw.every((s) => s.x > R.pts[0][1] + 0.6) && rw.some((s) => s.x < R.pts[0][1] + 0.75) && rw.every((s) => s.stun === 0), `nearest ${Math.min(...rw.map((s) => s.x)).toFixed(2)} (the rail at ${R.pts[0][1]})`);
  const Bm = C.bumps[0];
  const rol = await K<{ fast: CS[]; slow: CS[] }>(`K.place(${Bm.d0 - 20}, 0, 31); const fast = K.run(2.2, function (t, k) { return { gas: true, drift: k.air && k.lipT < 0.3 && !k.trick }; }, 1 / 120);
    K.place(${Bm.d0 - 6}, 0, 14); const slow = K.run(1.6, function (t, k) { return { gas: k.v < 14 }; }, 1 / 120); return { fast, slow };`);
  const ups = (q: CS[]) => q.filter((s, i) => i > 0 && s.air && !q[i - 1].air).length;
  ok('kart: rollers throw the kart up off their crests (at the top speed clean over the rest, slower off each one); Space up there is a trick, +15% for 0.5 s on landing', ups(rol.fast) >= 1 && ups(rol.slow) >= 2 && rol.fast.some((s) => s.src === 'trick' && s.cap === 0.15),
    `${ups(rol.fast)} times up at 31 m/s, ${ups(rol.slow)} at 14; ${[...new Set(rol.fast.map((s) => `${s.src}:${s.cap}`))].join(' ')}`);

  // karts against karts: weight, the hop-bash, the GM it knocks loose, no chain
  const wt = await K<{ bear: number; doge: number }>(`K.place(10, 0, 0, 0, 0); K.place(200, 0.55, 20, 0, 5); K.place(200, -0.55, 20, 0, 1); K.run(1 / 120, { gas: false }); const a = K.kart(5), b = K.kart(1); K.solo(true); return { bear: a.push, doge: b.push };`);
  ok('kart: weight in a bump: side by side, Big Bear (1.35) shoves Doge (0.88) off his line 2.35 times as hard as Doge shoves him (a kart\'s mass squared)',
    Math.abs(wt.doge / wt.bear) > 2.25 && Math.abs(wt.doge / wt.bear) < 2.45, `${wt.doge.toFixed(2)} / ${wt.bear.toFixed(2)} m/s`);
  const bash = await K<Record<string, any>>(`${fresh()} ${stepper} K.place(200, 0, 20, 0, 0); K.place(200, 1.5, 20, 0, 1); K.gm(0); const g0 = K.kart(1).gm; let vic = null;
    for (let i = 0; i < 40; i++) { step({ gas: true, drift: S < 2, steer: 1 }); if (!vic && E('bash') >= 0) vic = K.kart(1); }
    const e = EV.find((x) => x[1] === 'bash'), g1 = K.kart(1).gm;
    // (again, at once: kart 0 alongside it once more and a second hop, inside its 1.2 s)
    const v2 = K.kart(1); K.place(v2.d, v2.x - 1.5, v2.v, 0, 0); for (let i = 0; i < 40; i++) step({ gas: true, drift: i < 2, steer: 1 });
    const again = EV.filter((x) => x[1] === 'bash' && x[2] === 0 && x[3] === 1).length;
    // (and a heavy one: into Big Bear)
    K.place(400, 0, 20, 0, 0); K.place(400, 1.5, 20, 0, 5); for (let i = 0; i < 40; i++) step({ gas: true, drift: i < 2, steer: 1 });
    const bashes = EV.filter((x) => x[1] === 'bash' && x[2] === 0), sn = EV.find((x) => x[1] === 'snatch' && x[2] === 0 && x[3] === 1), took = EV.find((x) => x[1] === 'coin' && x[2] === 0 && x[4] === 1);
    return { e, bashes: bashes.map((x) => x.slice(2)), wob: vic ? vic.wob : 0, bashI: vic ? vic.bashI : 0, g0, g1, again, snatch: sn ? sn[0] : -1, took: took ? took[0] : -1, light: bashes[0] ? bashes[0][4] : 0, heavy: bashes.length > 1 ? bashes[bashes.length - 1][4] : 0 };`);
  ok('kart: a hop-bash (a hop sideways into a kart) shoves it 6.5 m/s across times your mass over its (Pepe on Doge 7.4, on Big Bear 4.8), wobbles it 0.5 s, and knocks a GM out of it, which the basher takes on the way',
    !!bash.e && bash.e[2] === 0 && bash.e[3] === 1 && Math.abs(bash.light - 6.5 / 0.88) < 0.05 && Math.abs(bash.heavy - 6.5 / 1.35) < 0.05 && bash.wob > 0.45 && bash.g1 === bash.g0 - 1 && bash.snatch > 0 && bash.took > bash.snatch && bash.took - bash.snatch < 60,
    JSON.stringify({ bashes: bash.bashes, gm: [bash.g0, bash.g1], wob: bash.wob, snatch: bash.snatch, took: bash.took }));
  ok('kart: no chain: a kart just bashed cannot be bashed again for 1.2 s (nor lose another GM for 2 s)', bash.again === 1 && bash.bashI > 1.1, `${bash.again} bash of Doge in 0.7 s, then ${bash.bashI} s untouchable`);
  const rage = await K<Record<string, any>>(`${fresh()} ${stepper} K.place(200, 0, 20, 0, 0); K.place(200, 1.5, 20, 0, 4);
    for (let i = 0; i < 30; i++) step({ gas: true, drift: S < 2, steer: 1 });
    const ang = EV.find((x) => x[1] === 'angry'); const a0 = S; let near = 0, gap = 0, meet = 0;
    for (let i = 0; i < 600; i++) { step('auto'); const a = K.kart(0), b = K.kart(4); if (Math.abs(a.d - b.d) < 12) { near++; gap += Math.abs(a.x - b.x); } }
    meet = EV.filter((x) => x[0] > a0 && ((x[1] === 'bump' && (x[3] === 0 || x[2] === 0) && (x[3] === 4 || x[2] === 4)) || (x[1] === 'bash' && x[2] === 4))).length;
    const calm = EV.find((x) => x[1] === 'calm' && x[2] === 4);
    // (and bashed again at once, after it calmed: not angry again for 6 s)
    const b = K.kart(4); K.place(b.d, b.x - 1.5, b.v, 0, 0); for (let i = 0; i < 30; i++) step({ gas: true, drift: i < 2, steer: 1 });
    return { ang: ang ? ang.slice(1) : null, at: ang ? ang[0] : -1, calm: calm ? (calm[0] - ang[0]) / 120 : -1, again: EV.filter((x) => x[1] === 'angry').length, meet, gap: near ? gap / near : 99, near: near / 120 };`);
  ok('kart: a rival bashed (or bumped hard, or hit by your item) is angry at you for 4 s (steam off its head, a honk): it hunts you, onto your line and into you, then calms, and is not angry again for 6 s',
    !!rage.ang && rage.ang[1] === 4 && rage.ang[2] === 0 && Math.abs(rage.calm - 4) <= STEP * 2 && rage.again === 1 && (rage.meet >= 1 || rage.gap < 1.6), JSON.stringify(rage));

  // the hazards: each on its clock; and no stun-lock
  const H = C.hazards, hz = (k: string) => H.find((h) => h.kind === k)!;
  const at = (h: { every: number; off: number }, u: number) => 3 * h.every + u - h.off;
  const met = await K<Record<string, any>>(`${fresh()} K.clock(${at(hz('meteor'), 1.5)}); K.run(1 / 120, {}); const h = K.hazards()[2]; K.place(h.d, h.x, 0, 0, 0); const before = K.hazards()[2].phase; const tr = K.run(0.3, {}, 1 / 120); const s = tr.find((q) => q.hit === 'spin');
    return { before, s, rug: K.hit('rug', 0), after: K.hazards()[2].phase, hits: K.hazards()[2].hits };`);
  ok('kart: a meteor: its ring on the road for 1.6 s, then the strike: whoever is in it spins (0.8 s, its speed to 0.45) and goes up; a second untouchable after (a rug then finds it untouchable)',
    met.before === 'warn' && !!met.s && Math.abs(met.s.stun - 0.8) < 0.02 && met.s.vy > 3 && met.rug === 'iframe' && met.hits === 1, JSON.stringify({ before: met.before, stun: met.s?.stun, vy: met.s?.vy, rug: met.rug, hits: met.hits }));
  // (the owner's review drives, 7 Oct: meteors hit somebody once in three races; every other strike is now aimed at
  // where the racer furthest on in its stretch will be when it lands, a few metres either way)
  const mh = hz('meteor'), aimAt = (c: number) => c * mh.every - mh.off + 1 / 240;
  const aim = await K<{ dd: number; dx: number; phase: string }>(`${fresh()} K.place(${mh.d} - 20, 1.5, 20, 0, 0); K.clock(${aimAt(4)}); K.run(1 / 120, { gas: true }); const k = K.kart(0), h = K.hazards()[2];
    const L = K.state().L; let dd = (h.d - (k.d + k.v * 1.6)) % L; if (dd > L / 2) dd -= L; if (dd < -L / 2) dd += L; return { dd: +dd.toFixed(2), dx: +(h.x - k.x).toFixed(2), phase: h.phase };`);
  ok('kart: a meteor\'s every other strike is aimed where the racer furthest on in its stretch will be when it lands (within 3 m along, 1.5 across), its ring up the 1.6 s before',
    aim.phase === 'warn' && Math.abs(aim.dd) <= 3.2 && Math.abs(aim.dx) <= 1.6, JSON.stringify(aim));
  const roll = await K<Record<string, any>>(`${fresh()} const h0 = K.course().hazards[0]; K.clock(${at(hz('crossing'), 2.5)}); K.run(1 / 120, {}); K.place(h0.d, 0, 0, 0, 0); const tr = K.run(0.6, {}, 1 / 120); const s = tr.find((q) => q.hit === 'bonk');
    return { s, side: K.hazards()[0].side, x: tr[tr.length - 1].x };`);
  ok('kart: the rolling GM coin bonks whoever it meets: 0.35 s, its speed to 0.4, and shoved the way it rolls', !!roll.s && Math.abs(roll.s.stun - 0.35) < 0.02 && Math.sign(roll.x) === -Math.sign(roll.side) && Math.abs(roll.x) > 0.3,
    JSON.stringify({ stun: roll.s?.stun, side: roll.side, x: roll.x }));
  // (8 Oct: the warning's second swept it across the road too, three times as fast and touching nobody; a world that
  // draws its own, the swamp's log, flew across the road and under the lens before every roll)
  const cw = await K<[string, number, number][]>(`${fresh()} const out = []; for (const t of [0.1, 0.5, 0.95, 2.5, ${hz('crossing').every - 0.05}]) { K.clock(${at(hz('crossing'), 0)} + t); K.run(1 / 120, {}); const h = K.hazards()[0]; out.push([h.phase, +h.x.toFixed(2), h.side]); } return out;`);
  ok('kart: the rolling GM coin waits at its side of the road through its warning (where it then rolls from), and stays at the far side once across',
    cw.slice(0, 3).every((q) => q[0] === 'warn' && Math.sign(q[1]) === Math.sign(q[2]) && Math.abs(q[1] - cw[0][1]) < 0.01) && cw[3][0] === 'roll' && cw[4][0] === 'idle' && Math.sign(cw[4][1]) === -Math.sign(cw[4][2]),
    JSON.stringify(cw));
  const tp = await K<Record<string, any>>(`${fresh()} ${stepper} const h1 = K.course().hazards[1]; K.clock(${at(hz('topple'), 1.3)}); step({}); const warn = K.hazards()[1].phase; K.place(h1.d, 0, 0, 0, 0); step({}, 60);
    const s = K.kart(0), slam = E('topple'); K.clock(${at(hz('topple'), 2.2)}); K.place(h1.d - 14, 0, 20, 0, 0); const tr = K.run(1.2, { gas: true }, 1 / 120); return { warn, s, slam, lie: K.hazards()[1].phase, air: tr.some((q) => q.air) };`);
  ok('kart: the candle warns 1.4 s (its shadow across the road), falls, spins whoever is under it, and lies across the road 2.5 s, a log a kart jumps off',
    tp.warn === 'warn' && tp.slam > 0 && tp.s.hit === 'spin' && tp.lie === 'lie' && tp.air, JSON.stringify({ warn: tp.warn, slam: tp.slam, hit: tp.s.hit, lie: tp.lie, air: tp.air }));
  const sl = await K<string[]>(`${fresh()} K.place(100, 0, 20); const r = [K.hit('spin', 0), K.hit('rug', 0), K.hit('laser', 0), K.hit('bonk', 0)]; K.run(1.7, { gas: true }); r.push(K.hit('whale', 0)); K.run(0.15, { gas: true }); r.push(K.hit('rug', 0)); return r;`);
  ok('kart: no stun-lock: a meteor\'s spin, then a rug, a laser and the coin at once, land once (the rest find the kart untouchable until 1.8 s on); then it can be hit again',
    sl.join() === 'hit,iframe,iframe,iframe,iframe,hit', sl.join());

  // what it looks like: the charge's glow and the pill, a grind's sparks and its rail lit, an angry rival's steam, the
  // speed lines on a boost
  await K(`K.solo(true); K.place(40, 0, 20, 0, 0); K.hold({ gas: true, drift: true, steer: 0 });`); await sleep(650);
  const v1 = await ks(); await K('K.hold({ gas: true });'); await sleep(200);
  await K(`K.place(${R.d0 - 24}, ${R.pts[0][1]}, 23, 0, 0); K.hold({ gas: true, drift: true, steer: 0 });`); await sleep(780); await K('K.hold({ gas: true });'); await sleep(450);
  const v2 = await ks(); const k2 = await K<CS>('return K.kart(0);');
  await K('K.hold(null); K.place(150, 0, 18, 0, 0); K.place(160, 1, 18, 0, 4); K.rage(4, 0);'); await sleep(500);
  const v3 = await ks(); await K('K.rage(4, -1); K.place(60, 0, 31, 0, 0); K.give("pump"); K.use(0); K.hold({ gas: true, steer: 0 });'); await sleep(450);
  const v4 = await ks(); await K('K.hold(null); K.solo(true);');
  type FX = { charging: number; grinding: number; steaming: number; steam: number; lines: number; rails: number[] };
  const f = (v: KartState) => v.fx as unknown as FX;
  ok('kart: shown: a charge glows under the kart (and the pill says Jump); a grind lights its rail and showers sparks; an angry rival steams; a boost streams speed lines past the camera',
    f(v1).charging >= 1 && /jump/i.test(v1.hud.tier) && k2.grind >= 0 && f(v2).grinding >= 1 && Math.max(...f(v2).rails) > 1 && v2.hud.tier === 'Grind' && f(v3).steaming >= 1 && f(v3).steam > 5 && f(v4).lines > 0.3,
    `charge ${f(v1).charging} "${v1.hud.tier}"; grind ${f(v2).grinding} rails ${f(v2).rails.join('/')} "${v2.hud.tier}"; steam ${f(v3).steaming}/${f(v3).steam}; lines ${f(v4).lines}`);
}

/* ---------------------------------------------------------------- kart -- */
// A kart race (lib/runtime/kart.js; Meme Kart, the owner 6 Oct: "3 laps, 8 karts ... bumping + items (contact never
// ends the run)"), on its fixture (lib/runtime/kart-world.js). Checked first; ONLY=kart runs this section alone.
// The driving is checked twice: through the real keys in real time, and stepped exactly through debug.kart().run(),
// 120 steps a second, so a timing is a timing and not a guess at a frame rate. The numbers are the plan's picks
// (mechanics.md, 6 Oct): a top speed of 26.5 m/s (31 since the owner's third review, 7 Oct), a hop of 0.28 s; tiers at a charge of 0.6, 1.6 and 2.2 (the playtest, 7 Oct).
type KartRow = { n: number; name: string; place: number; lap: number; lapsDone: number; prog: number; v: number; d: number; x: number; fin: boolean; finT: number | null; stuck: number; cap: number; top: number; maxPace: number; parked: boolean; slot: number; visible: boolean; racer: string | null; detail: string; level: string | null };
type KartState = { ready: boolean; phase: string; state: string; demo: boolean; laps: number; lap: number; lapsDone: number; place: number; time: number; count: number; speed: number; top: number; drift: { dir: number; charge: number; tier: number; hop: boolean; name: string | null; most?: { tier: number; charge: number } }; assisted?: boolean; helped?: boolean;
  boost: number; y: number; d: number; x: number; finished: boolean; est: boolean; gm: number; back: boolean; missed: boolean; L: number; hw: number; wall: number; karts: KartRow[]; coins: { laid: number; left: number };
  final: { n: number; name: string; time: number; est: boolean }[] | null; podium: number[] | null; camera: { fov: number; x: number; y: number; z: number };
  fx: { sparks: number; skids: number; flames: number; embers: number; mog: number; smoke: number; confetti: number }; hud: { tier: string; tierColor: string; mog: boolean; launch: boolean; gm: string | null; slip: boolean; item: { shown: boolean; icon: string | null; rolling: boolean; drag: boolean; badge: string }; fud: number };
  src: string; item: { on: boolean; slot: string | null; charges: number; roll: number; drag: boolean; shield: number; diamond: number; moon: number; iframe: number; hit: string; fud: number };
  theme?: { mode: string; playing?: boolean; stopping?: boolean; lap?: number; bar?: number; section?: string; tempo?: number; key?: string; nextBar?: number; duck?: number; stings?: [string, number, string][]; goAt?: number | null; go?: number | null; now?: number | null } | null;
  music: { swapped: boolean; tempo: number; lifted: number; at: { bar: number; nextBar: number; now: number; barDur: number; barDur2: number } | null; energy: number | null; bar: number | null; nextBar: number | null; playing: boolean; ready: boolean } | null;
  pick: { index: number; racer: string | null; name: string; cast: string[]; portraits: number }; roster: { built: number; waiting: number } };
type Sample = { t: number; v: number; d: number; x: number; y: number; h: number; steer: number; w: number; drift: number; charge: number; tier: number; boost: number; mul: number; src: string; cap: number; stun: number; off: boolean; surf: number; wrong: boolean; lap: number; place: number; hop: boolean;
  air: boolean; trick: boolean; push: number; prog: number; gate: number; missed: boolean; gm: number; rescue: number; ghost: number; wet: number; slip: number; lane: number; wob: number; spin: number; launch: string; pace: number; fin: boolean };
/* -------------------------------------------------------- kart opt-ins -- */
// Aspen GP's opt-ins (9 Oct; lib/runtime/API.md "Kart races": breaks look and clear, kart.driftAssist, kart.fx, four
// laps), each off unless a world names it: checked in node on the race's own sim (scripts/kart-score/sim.mjs reads
// lib/runtime/kart.js), Meme Kart's race first: its track's signature and a seeded race as they were.
async function kartOptInChecks() {
  // @ts-ignore (plain JS module)
  const { load } = await import('./kart-score/sim.mjs');
  const { kartHow, MODE_PAGE } = await import('../lib/custom-game.ts');
  console.log('\nkart: the opt-ins (Aspen GP), and Meme Kart as it was');
  const rd = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const mk = load({ world: 'worlds/meme-kart.js', hooks: false });
  const race = (W: any, o: any) => { const S = W.make(o); if (o.human === 0) S.karts[0].auto = true; S.start(3); for (let i = 0; i < 120 * 400 && S.finishers < 8; i++) { S.step(); S.events.length = 0; } return S; };
  const R = race(mk, { seed: 42, pick: 'doge', human: 0, items: true });
  ok('kart: Meme Kart names none of the opt-ins: its track\'s signature is d90450e9fd3eddee, its breaks void and not cleared, and a seeded race (42, Doge, items on) ends as it did before them (e8957f6, 18,642 steps)',
    R.trackSig === 'd90450e9fd3eddee' && (mk.TR.course as any).breaks.every((B: any) => B.look === 'void' && B.clear === false) && R.hash() === 'e8957f6' && R.steps === 18642 && !/driftAssist|\bfx\s*:|breakLook|breakClear|clear\s*:\s*true/.test(rd('worlds/meme-kart.js')),
    `${R.trackSig}, ${R.hash()}, ${R.steps} steps`);
  // the fixture with its break cleared (and iced), and with it as it is
  const fx0 = rd('lib/runtime/kart-world.js'), fxC = fx0.replace("breaks: [{ from: 0.576, len: 8 }]", "breaks: [{ from: 0.576, len: 8, clear: true, look: 'ice' }]");
  const W0 = load({ code: fx0, hooks: false }), WC = load({ code: fxC, hooks: false }), BC = (WC.TR.course as any).breaks[0], wrap = (d: number) => ((d % WC.L) + WC.L) % WC.L;
  ok('kart: a break with clear: true (and look: \'ice\') is read as such, and the track\'s signature counts the clear (not the look)', BC.clear === true && BC.look === 'ice' && (W0.TR.course as any).breaks[0].clear === false
    && WC.make({}).trackSig !== W0.make({}).trackSig && load({ code: fx0.replace("breaks: [{ from: 0.576, len: 8 }]", "breaks: [{ from: 0.576, len: 8, look: 'ice' }]"), hooks: false }).make({}).trackSig === W0.make({}).trackSig, `${WC.make({}).trackSig} vs ${W0.make({}).trackSig}`);
  // every kart over it: placed 0.5 to 30 m before it anywhere across the corridor, shoulders too, 2 to 42 m/s, turned
  // up to 29 degrees, some hit before the edge and some in the air
  let rnd = 7; const rand = () => ((rnd = (rnd * 1103515245 + 12345) >>> 0) / 4294967296);
  const S = WC.make({ seed: 5, pick: 0, human: 0, items: false }); S.start(0);
  let tr = 0, falls = 0, cleared = 0;
  for (let t = 0; t < 400; t++) {
    S.karts.forEach((q: any, n: number) => { if (n) { q.parked = true; S.putOn(q, BC.d0 + 300, 0, 0); } });
    const k = S.karts[0]; Object.assign(k, { auto: true, human: true, rescue: -1, air: false, y: 0, vy: 0, hop: -1, ramp: -1, grind: -1, pit: false, abyss: false, stun: 0, clr: -1, dDir: 0, iframe: 0, ghost: 0, cj: -1 });
    S.putOn(k, BC.d0 - 0.5 - rand() * 30, (rand() * 2 - 1) * (WC.TR.wall - 0.8), (rand() * 2 - 1) * 0.5); k.v = 2 + rand() * 40;
    const mode = t % 3; if (mode === 1) S.hit(k, rand() < 0.5 ? 'whale' : 'laser');
    let fell = false, hit = false, done = false;
    for (let s = 0; s < 120 * 8 && !done && !fell; s++) {
      if (mode === 2 && !hit && k.air && k.airT > 0.15) { k.iframe = 0; S.hit(k, 'whale'); hit = true; }
      S.step(); for (const e of S.events) if (e[0] === 'fall' && e[1] === 0) fell = true; S.events.length = 0;
      const past = wrap(k.d - (BC.d0 + BC.len)); if (!k.air && past > 0.3 && past < 30) done = true;
    }
    tr++; if (fell) falls++; else if (done) cleared++;
  }
  ok('kart: no kart falls into a clear break: 400 placed (0.5 to 30 m before it, anywhere across the corridor, 2 to 42 m/s, a third hit before the edge and a third in the air), all past it and none fallen',
    falls === 0 && cleared === tr, `${cleared}/${tr} past, ${falls} fell`);
  const races = [1, 2, 3].map((seed) => { const Sx = WC.make({ seed, human: 0, items: true }); Sx.karts[0].auto = true; Sx.start(3); let f = 0; for (let i = 0; i < 120 * 400 && Sx.finishers < 8; i++) { Sx.step(); for (const e of Sx.events) if (e[0] === 'fall') f++; Sx.events.length = 0; } return [Sx.finishers, f]; });
  ok('kart: three whole races on it (items on): every kart home, no falls', races.every((r) => r[0] === 8 && r[1] === 0), JSON.stringify(races));
  // a break without it: a kart driven in slowly falls, and the Claw comes (as ever)
  const S0 = W0.make({ seed: 3, pick: 0, human: 0, items: false }); S0.start(0); S0.karts.forEach((q: any, n: number) => { if (n) q.parked = true; });
  const k0 = S0.karts[0], B0 = (W0.TR.course as any).breaks[0]; S0.putOn(k0, B0.d0 - 3, 0, 0); k0.v = 6; k0.inp.gas = true;
  const ev0: string[] = []; for (let i = 0; i < 120 * 2; i++) { S0.step(); for (const e of S0.events) if (e[1] === 0 && (e[0] === 'fall' || e[0] === 'rescue')) ev0.push(e[0]); S0.events.length = 0; }
  ok('kart: a break without clear still drops a kart driven into it, and the Rescue Claw comes', ev0[0] === 'fall' && ev0.includes('rescue'), ev0.join(' '));
  // the drift assist: on the fixture's hairpin, a driver holding the racing line (an analog stick on its heading and
  // offset), Space tapped for 0.1 s as the bend begins (the steer at least half into it through the hop) and again
  // 1.9 s on; against the same driver holding Space those 1.9 s, with the assist and without
  const wrapA = (a: number) => { a = (a + Math.PI) % (2 * Math.PI); return (a < 0 ? a + 2 * Math.PI : a) - Math.PI; };
  const tap = (assist: boolean, held: boolean) => {
    const Sd = W0.make({ seed: 1, pick: 0, human: 0, items: false, solo: true, driftAssist: assist }); Sd.start(0);
    const k = Sd.karts[0], T = W0.TR; k.auto = false; Sd.putOn(k, 290, Sd.line.off[290], 0); k.v = 24;
    const out = { drift: 0, tier: 0, fired: 0, walls: 0 }; let t0 = -1;
    for (let i = 0; i < 120 * 4; i++) {
      const j = (Math.max(0, k.i) + 5) % T.n, hD = Math.atan2(T.tx[j], T.tz[j]) - 0.08 * (Sd.line.off[Math.max(0, k.i)] - k.lat);
      let st = Math.max(-1, Math.min(1, -2.5 * wrapA(hD - k.h)));
      if (t0 < 0 && k.d >= 318) t0 = i / 120;
      const u = t0 < 0 ? -1 : i / 120 - t0;
      if (u >= 0 && u < 0.3 && Math.abs(st) < 0.5) st = Math.sign(st || 1) * 0.5;
      k.inp.gas = true; k.inp.analog = true; k.inp.steer = st;
      k.inp.drift = held ? u >= 0 && u < 1.9 : (u >= 0 && u < 0.1) || (u >= 1.9 && u < 2.0);
      Sd.step(); for (const e of Sd.events) if (e[1] === 0) { if (e[0] === 'drift') out.drift++; if (e[0] === 'tier') out.tier = Math.max(out.tier, e[2]); if (e[0] === 'boost' && e[2] === 'drift') out.fired = e[3]; if (e[0] === 'bonk' || e[0] === 'scrape') out.walls++; } Sd.events.length = 0;
    }
    return { ...out, hash: Sd.hash() };
  };
  const on = tap(true, false), off = tap(false, false), h1 = tap(true, true), h0 = tap(false, true);
  ok('kart: kart.driftAssist: two 0.1 s taps of Space 1.9 s apart, the steer into the hairpin, drift between them as Space held those 1.9 s does, step for step (Green Candle charged and fired, no wall); without it the taps are hops and no drift; held, the same with it or without',
    on.drift === 1 && on.tier >= 1 && on.fired >= 1 && on.walls === 0 && on.hash === h1.hash && off.drift === 0 && h1.hash === h0.hash,
    `taps+assist ${JSON.stringify(on)}, taps ${JSON.stringify(off)}, held ${h1.hash}/${h0.hash}`);
  // (11:40, the tappers' walls) a tap with a steer on the straight is a hop, no bend that way ahead to drift into
  // (assist.need); a latched drift turning in onto the inside wall with the steer held against it lets go short of it
  // (assist.wall); each against the same input with that rule off
  const assistRun = (o: { need?: boolean, wall?: boolean, d0: number, steer: (u: number) => number, T: number }) => {
    const Sd = W0.make({ seed: 1, pick: 0, human: 0, items: false, solo: true, driftAssist: true }); Sd.start(0);
    if (o.need === false) Sd.rules.assist.need = 0; if (o.wall === false) Sd.rules.assist.wall = null;
    const k = Sd.karts[0]; k.auto = false; Sd.putOn(k, o.d0, 0, 0); k.v = 24;
    const ev: string[] = []; let endAt = -1;
    for (let i = 0; i < 120 * o.T; i++) {
      const u = i / 120, had = k.dDir; k.inp.gas = true; k.inp.analog = true; k.inp.steer = o.steer(u); k.inp.drift = u < 0.1;
      Sd.step(); if (had && !k.dDir && endAt < 0) endAt = u;
      for (const e of Sd.events) if (e[1] === 0 && ['hop', 'drift', 'bonk', 'scrape'].includes(e[0])) ev.push(e[0] === 'bonk' || e[0] === 'scrape' ? (k.lat * (had || 1) > 0 ? 'in' : 'out') + '-' + e[0] : e[0]); Sd.events.length = 0;
    }
    return { ev: ev.join(' '), endAt: +endAt.toFixed(2) };
  };
  const st1 = assistRun({ d0: 100, steer: (u) => (u < 0.33 ? 0.6 : 0), T: 1.5 }), st0 = assistRun({ need: false, d0: 100, steer: (u) => (u < 0.33 ? 0.6 : 0), T: 1.5 });
  const in1 = assistRun({ need: false, d0: 60, steer: (u) => (u < 0.35 ? 1 : -1), T: 1.2 }), in0 = assistRun({ need: false, wall: false, d0: 60, steer: (u) => (u < 0.35 ? 1 : -1), T: 1.2 });
  ok('kart: kart.driftAssist and the tappers\' walls: a 0.1 s tap with a steer on the straight is a hop (no bend that way ahead; with that rule off it latched a drift); a latched drift turning in onto the inside wall, the steer held against it, lets go short of the wall (with that rule off it ran into it)',
    st1.ev === 'hop' && /^hop drift/.test(st0.ev) && !/in-/.test(in1.ev) && in1.endAt > 0 && in1.endAt < 0.75 && /drift.*in-(scrape|bonk)/.test(in0.ev),
    `straight ${st1.ev} / rule off ${st0.ev}; inside wall: let go at ${in1.endAt} s, ${in1.ev} / rule off ${in0.ev}`);
  // a faster drift charge (kart.driftCharge): every kart's drift, and another track to the score; and a snowy hazard
  const WD = load({ code: fx0.replace('kart: { laps: 3, course: COURSE }', 'kart: { laps: 3, course: COURSE, driftCharge: 1.5 }'), hooks: false });
  const charged = (W: any) => { const Sx = W.make({ seed: 1, human: 0, solo: true, items: false }); Sx.karts[0].auto = true; Sx.start(0); let most = 0; for (let i = 0; i < 120 * 60; i++) { Sx.step(); Sx.events.length = 0; most = Math.max(most, Sx.karts[0].charge); } return most; };
  const c1 = charged(W0), c15 = charged(WD);
  const WS = load({ code: fx0.replace("{ kind: 'meteor', from: 0.87, to: 0.95 }", "{ kind: 'meteor', from: 0.87, to: 0.95, look: 'snow' }"), hooks: false });
  ok('kart: kart.driftCharge: 1.5 charges a drift half as fast again (the most a lap of the autopilot\'s drifts reached, against the fixture as it is) and signs another track; a hazard\'s look: \'snow\' is read, and is the picture\'s only (the same signature)',
    WD.make({}).trackSig !== W0.make({}).trackSig && c15 > c1 * 1.2 && W0.make({}).dcMul === 1 && (WS.TR.course as any).hazards.some((H: any) => H.look === 'snow') && WS.make({}).trackSig === W0.make({}).trackSig,
    `most charge ${c1.toFixed(2)} -> ${c15.toFixed(2)}`);
  // (engine v2, 9 Oct) bigger air: course.air lifts every ramp, bump and clear pop and floats the top; a ramp's own lift
  // beats it; both sign another track; clear breaks still never let a kart fall; the land event carries the flight's
  // top over the road and how far it came down; Meme Kart's course has none of it (air null, every ramp's lift 1)
  const airOf = (W: any, seeds: number[]) => { let most = 0, top = 0, falls = 0, fin = 0, fields = true; for (const seed of seeds) { const Sx = W.make({ seed, human: 0, items: true }); Sx.karts[0].auto = true; Sx.start(3); for (let i = 0; i < 120 * 400 && Sx.finishers < 8; i++) { Sx.step(); for (const e of Sx.events) { if (e[0] === 'fall') falls++; if (e[0] === 'land' && e.length > 3) { most = Math.max(most, e[2]); top = Math.max(top, e[4]); if (typeof e[4] !== 'number' || typeof e[5] !== 'number') fields = false; } } Sx.events.length = 0; } fin += Sx.finishers; } return { most: +most.toFixed(2), top: +top.toFixed(2), falls, fin, fields }; };
  const fxA = fxC.replace("breaks: [{ from: 0.576, len: 8, clear: true, look: 'ice' }]", "breaks: [{ from: 0.576, len: 8, clear: true, look: 'ice' }], air: { lift: 1.5, hang: 0.4 }");
  const WA = load({ code: fxA, hooks: false }), WL = load({ code: fxC.replace("size: 'small' }]", "size: 'small', lift: 1.8 }]"), hooks: false });
  const aC = airOf(WC, [1, 2]), aA = airOf(WA, [1, 2]);
  ok('kart: course.air { lift: 1.5, hang: 0.4 } flies higher and longer (the longest air and the highest top over the road, two races, against the same course without it), every kart home and none fallen into the clear break; it and a ramp\'s own lift: 1.8 each sign another track; the land event says the top and the drop; Meme Kart names none of it',
    aA.most > aC.most * 1.15 && aA.top > aC.top * 1.3 && aA.falls === 0 && aA.fin === 16 && aA.fields && (WA.TR.course as any).air && (WA.TR.course as any).air.lift === 1.5 && (WL.TR.course as any).ramps[0].lift === 1.8
    && WA.make({}).trackSig !== WC.make({}).trackSig && WL.make({}).trackSig !== WC.make({}).trackSig && (mk.TR.course as any).air === null && (mk.TR.course as any).ramps.every((q: any) => q.lift === 1) && !/\bair\s*:|lift\s*:/.test(rd('worlds/meme-kart.js')),
    `air ${aC.most} s / top ${aC.top} m -> ${aA.most} s / ${aA.top} m, falls ${aA.falls}, ${aA.fin}/16 home`);
  // four laps: the race, the signature and the page say four
  const W4 = load({ code: fx0.replace('kart: { laps: 3, course: COURSE }', 'kart: { laps: 4, course: COURSE }'), hooks: false });
  ok('kart: kart.laps: 4 races four (the sim, its signature) and the page says "four laps"; three laps is the page as it was', W4.laps === 4 && W4.make({}).trackSig !== W0.make({}).trackSig
    && kartHow(4).startsWith('A kart race: four laps, eight karts.') && kartHow(3) === MODE_PAGE.kart.how && kartHow(null) === MODE_PAGE.kart.how, kartHow(4).slice(0, 40));
}

async function kartChecks() {
  const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);
  const rt = (f: string) => readFileSync(new URL(`../lib/runtime/${f}`, import.meta.url), 'utf8');
  const assemble = (v1: string) => [rt('music.js'), rt('vehicle.js'), rt('creature.js'), v1.replace('/*@include open.js*/', () => rt('open.js').replace('/*@include derby.js*/', () => rt('derby.js')).replace('/*@include climb.js*/', () => rt('climb.js')).replace('/*@include trav.js*/', () => rt('trav.js')))].join('\n');
  const fixture = rt('kart-world.js');

  console.log('\nkart: the runtime each world receives');
  const plain = runtimeSource(1), kart = runtimeSource(1, true);
  const cut = rt('v1.js').replace(/\/\*@kart\*\/[\s\S]*?\/\*@\/kart\*\//g, '');
  ok('kart: every other world gets the runtime it got before the kart kit, byte for byte (the kart parts cut out whole)', plain === assemble(cut) && !/@kart|kartWorld|\bKART\b/.test(plain), `${sha(plain)}, ${plain.length} bytes`);
  let head = '';
  try { head = execFileSync('git', ['show', 'HEAD:lib/runtime/v1.js'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { head = ''; }
  if (head && !head.includes('/*@kart*/')) ok('kart: and it is the committed runtime (HEAD), byte for byte', plain === assemble(head), `${sha(plain)} vs ${sha(assemble(head))}`);
  const nested = 'GameMog.world({ track: { points: [] }, crew: { kart: { paint: 1 } }, build() { const o = { kart: {} }; } });';
  const both = 'GameMog.world({ open: { map: "city" }, kart: { laps: 3 } });';
  ok('kart: only a world that names kart: {...} among its own keys (and is not an open world) gets the kart kit', isKartWorld(fixture) && !isKartWorld(rt('reference-world.js')) && !isKartWorld(nested) && !isKartWorld(both) && kart.includes('function kartWorld') && !kart.includes('/*@kart*/'),
    `${Math.abs(kart.length - plain.length)} bytes ${kart.length < plain.length ? 'fewer' : 'more'} than another world's (the kit in, the open world stubbed out)`);
  // (its roster, the eight racers' recipes, and its items' models and effects are the kart runtime's own weight: the
  // rest is less than another world's)
  // (and its score, kart-music.js, 7 Oct: the race's own, for a world that asks for it; and the race's points,
  // kart-score.js, 8 Oct. Since 8 Oct the measure is the runtime without the kit's own files, the race (kart.js)
  // included, against another world's without open.js: the kit grows with the race, the stub is what is checked)
  const roster = rt('kart-roster.js'), itemsLib = rt('kart-items.js'), theme = rt('kart-music.js'), points = rt('kart-score.js'), kitJs = rt('kart.js'), openJs = rt('open.js');
  ok('kart: a kart world gets a stub for the open world (no open.js, derby, climbing or traversal to parse)', /var OW = null;\n\s*function openWorld\(\) \{\}/.test(kart) && !kart.includes('function derbyWorld') && !kart.includes(rt('open.js').slice(0, 400)) && kart.includes(roster) && kart.includes(itemsLib) && kart.includes(theme) && kart.includes(points) && !plain.includes('kartMusic') && !plain.includes('var KartScore') && kart.length - kitJs.length - roster.length - itemsLib.length - theme.length - points.length < plain.length - openJs.length,
    `${Math.round((kart.length - kitJs.length - roster.length - itemsLib.length - theme.length - points.length) / 1000)} KB without the kit (the race's ${Math.round(kitJs.length / 1000)} KB, the roster's ${Math.round(roster.length / 1000)} KB, the items' ${Math.round(itemsLib.length / 1000)} KB, the score's ${Math.round(theme.length / 1000)} KB, the points' ${Math.round(points.length / 1000)} KB), against ${Math.round((plain.length - openJs.length) / 1000)} KB for another world's without open.js`);
  ok('kart: the kart page names its own controls', worldControls(fixture).includes('drift') && worldControls(fixture).includes('Moon Launch'));

  const kid = randomUUID();
  insertDraft({ id: kid, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code: fixture,
    meta: { title: 'Greybox Ring', tagline: 'The kart fixture', blurb: 'Runtime check.', genre: 'Racing', cast: [{ name: 'Pepe', color: '#4FA03A' }], palette: { sky: '#A9D3F2', ground: '#86B05A', accent: '#7CFF4F' }, runtime: 1 } });
  try {
    await withBrowser(async (page) => {
      await page.preload('window.__frames=0;(function t(){window.__frames++;requestAnimationFrame(t)})();window.__kartTold=[];addEventListener("message",function(e){var d=e.data;if(d&&d.source==="gamemog"&&d.type==="kart-racer")window.__kartTold.push({racer:d.racer});});');
      await page.goto(`${BASE}/d/${kid}/play`);
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) { ready = await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false); if (!ready) await sleep(200); }
      const ks = () => page.eval<KartState>('window.__gmRuntime.state().kart');
      const K = <T>(js: string) => page.eval<T>(`(() => { const K = window.__gmRuntime.debug.kart(), D = window.__gmRuntime.debug; ${js} })()`);
      const errs = () => page.eval<string[]>('window.__gm.errors');
      // (31 m/s since the owner's third review, 7 Oct: "karting is slightly too slow"; 26.5 until then. P: the share
      // every speed and turn rate went up by (PACE), so a check of a bend or a drift at a speed is made at the same share
      // of the top speed as before, and comes out as it did)
      const TOP = 31, PACE = 31 / 26.5;

      console.log('\nkart: boot');
      ok('kart: the fixture boots with no errors', ready && (await errs()).length === 0 && page.errors.length === 0, [...(await errs()), ...page.errors].join(' | '));
      const s0 = await ks(); await sleep(2000); const s1 = await ks();
      const moved = s1.karts.map((q, i) => q.prog - s0.karts[i].prog);
      ok('kart: until someone plays, eight karts race the demo by themselves, silent and unscored', s0.demo && s1.demo && s1.karts.length === 8 && moved.every((m) => m > 10) && (await page.eval<unknown[]>('window.__gm.results')).length === 0, moved.map((m) => m.toFixed(0)).join(' '));
      const f0 = await page.eval<number>('window.__frames'); await sleep(2000); const fps = ((await page.eval<number>('window.__frames')) - f0) / 2;
      let batt = ''; try { batt = (execFileSync('pmset', ['-g', 'batt'], { encoding: 'utf8' }).match(/(\d+)%/) ?? [])[1] ?? ''; } catch { batt = ''; }
      ok('kart: the demo holds the frame rate (desktop, eight karts)', fps >= 55, `${Math.round(fps)} fps${batt ? `, battery ${batt}%` : ''}`);
      const line = await K<{ minRadius: number; slowest: number; length: number }>('return K.line();');
      ok('kart: the racing line bends as little as it can (no radius under 14 m on a 20 m hairpin), on a lap of 1,050 to 1,300 m', line.minRadius >= 14 && line.length >= 1050 && line.length <= 1300, JSON.stringify(line));
      const course = await K<{ pads: unknown[]; ramps: { h: number }[]; off: { kind: string; mul: number }[]; gaps: { water: boolean }[]; gm: number }>('return K.course();');
      ok('kart: the course is read from kart.course: two pads, a ramp, mud, a gap in the wall over water, and eight lines of GM', course.pads.length === 2 && course.ramps.length === 1 && course.off.length === 1 && course.off[0].mul === 0.4 && course.gaps.length === 1 && course.gaps[0].water && course.gm === 8 && s1.coins.laid === 40,
      `${JSON.stringify(course).slice(0, 160)}...`);

      // the racers: the roster's eight (lib/runtime/kart-roster.js), each at three levels of detail
      console.log('\nkart: the racers');
      type Build = { id: string; level: string; tris: number; draws: number; ms: number; nan: number };
      const ros = await K<{ ms: number; builds: Build[]; near: string }>('return K.roster();');
      const IDS = ['pepe', 'doge', 'shiba', 'bike', 'bull', 'bear', 'whale', 'mooncat'];
      // (the plan's budgets, a racer and its kart: near 30k triangles on a desktop, 15k on a phone; 6k mid; 1.5k far)
      const BUD: Record<string, [number, number]> = { desktop: [30000, 11], phone: [15000, 11], mid: [6000, 5], far: [1500, 2] };
      const every = IDS.every((id) => ['far', 'mid', ros.near].every((lv) => ros.builds.some((b) => b.id === id && b.level === lv)));
      const over = ros.builds.filter((b) => b.nan || !BUD[b.level] || b.tris > BUD[b.level][0] || b.draws > BUD[b.level][1]);
      const sumBy = (lv: string) => ros.builds.filter((b) => b.level === lv).reduce((a, b) => a + b.ms, 0);
      ok('kart: all eight racers build at every level of detail (near, mid, far), no NaN, each within its budget of triangles and draw calls', every && over.length === 0 && ros.builds.length === 24,
        over.length ? JSON.stringify(over) : IDS.map((id) => `${id} ${ros.builds.filter((b) => b.id === id).map((b) => `${b.level[0]}${(b.tris / 1000).toFixed(1)}k/${b.draws}`).join(' ')}`).join('; '));
      const total = ros.builds.reduce((a, b) => a + b.ms, 0), slowB = ros.builds.reduce((a, b) => (b.ms > a.ms ? b : a));
      ok('kart: and all eight, every level, are built in under 0.9 s (a racer\'s level at a time, between frames)', total < 900,
        `${total} ms: near ${sumBy(ros.near)}, mid ${sumBy('mid')}, far ${sumBy('far')}; the slowest ${slowB.id} ${slowB.level} ${slowB.ms} ms`);
      // levels of detail: from 400 m up, only the kart the camera follows is near, the rest far; from the chase camera,
      // each racer drawn at the level its distance asks for
      await K('K.film({ mode: "free", k: 2, at: [0, 400, 1], look: [0, 0, 0] });'); await sleep(400);
      const high = await ks();
      await K('K.film({ mode: "chase", k: 0 });'); await sleep(400);
      const low = await ks(); await K('K.film(null);');
      const lvOf = (d: string | null) => (d === 'near' ? ros.near : d);
      ok('kart: each racer is drawn at the level its distance asks: from 400 m up, the one followed near and the rest far; behind a kart, it near', high.karts[2].detail === 'near' && high.karts[2].level === ros.near && high.karts.every((q, n) => n === 2 || (q.detail === 'far' && q.level === 'far'))
        && low.karts[0].detail === 'near' && low.karts.every((q) => q.level === lvOf(q.detail)) && low.karts.filter((q) => q.detail === 'near').length <= 3,
        `${high.karts.map((q) => q.detail).join(',')} / ${low.karts.map((q) => `${q.detail}:${q.level}`).join(',')}`);
      // what the race says moves them: the steering, a drift, a hit, a look back, the podium; Bike Tyson leans and pulls
      // a wheelie
      type Pose = { racer: string; level: string; face: Record<string, number>; head: { yaw: number; roll: number } | null; seat: number; rig: { lean: number; wheelie: number } | null };
      const P = await K<Record<string, Pose>>(`const P = (s, f) => K.pose(0, s, f);
        return { right: P({ steer: 1, speed: 20 }, 40), left: P({ steer: -1, speed: 20 }, 40), drift: P({ drift: 1, tier: 2, steer: 0.5, speed: 20 }, 40), hit: P({ hit: true, speed: 10 }, 25), back: P({ back: true, speed: 20 }, 40), cheer: P({ celebrate: true }, 30), calm: P({ speed: 20 }, 60) };`);
      ok('kart: steering turns the racer\'s head into the turn and leans it in its seat (right one way, left the other)', P.right.head!.yaw < -0.1 && P.left.head!.yaw > 0.1 && P.right.seat > 0.02 && P.left.seat < -0.02,
        `head ${P.right.head!.yaw} / ${P.left.head!.yaw}, seat ${P.right.seat} / ${P.left.seat}`);
      ok('kart: a drift rolls the body into it and puts on its drift face; a hit the hit face; C turns the head to look back; the podium a celebration',
        P.drift.seat > 0.1 && (P.drift.face.smug ?? 0) > 0.8 && (P.hit.face.sad ?? 0) > 0.8 && P.back.head!.yaw > 0.8 && (P.cheer.face.celebrate ?? 0) > 0.8 && (P.calm.face.sad ?? 0) < 0.05,
        `drift ${P.drift.seat} ${JSON.stringify(P.drift.face)}; hit ${JSON.stringify(P.hit.face)}; back ${P.back.head!.yaw}; cheer ${JSON.stringify(P.cheer.face)}`);
      const bki = (await ks()).karts.findIndex((q) => q.racer === 'bike');
      const B = await K<Record<string, Pose>>(`return { lean: K.pose(${bki}, { steer: 1, speed: 22 }, 90), drift: K.pose(${bki}, { steer: 1, drift: 1, tier: 1, speed: 22 }, 90), cheer: K.pose(${bki}, { celebrate: true, speed: 0 }, 20), hit: K.pose(${bki}, { hit: true, speed: 12 }, 20) };`);
      ok('kart: Bike Tyson leans his bike 30 degrees into a turn (35 in a drift), and on the podium pulls a wheelie, punching the sky', bki > 0 && Math.abs(Math.abs(B.lean.rig!.lean) - 30 * Math.PI / 180) < 0.06 && Math.abs(Math.abs(B.drift.rig!.lean) - 35 * Math.PI / 180) < 0.06 && Math.sign(B.lean.rig!.lean) === Math.sign(B.drift.rig!.lean)
        && B.cheer.rig!.wheelie > 0.3 && (B.cheer.face.celebrate ?? 0) > 0.8 && (B.hit.face.hit ?? 0) > 0.8,
        `lean ${B.lean.rig?.lean} drift ${B.drift.rig?.lean} wheelie ${B.cheer.rig?.wheelie}`);

      console.log('\nkart: the start');
      await page.eval(`window.postMessage({ source: 'gamemog-host', type: 'play' }, '*')`); await sleep(500);
      const g = await ks();
      const slots = g.karts.slice().sort((a, b) => a.slot - b.slot);
      const onGrid = slots.every((q, s) => Math.abs(Math.abs(q.x) - 1.6) < 0.05 && Math.abs(q.prog + (5 + Math.floor(s / 2) * 6 + (s % 2) * 3)) < 0.15 && (s % 2 ? q.x < 0 : q.x > 0));
      ok('kart: Play brings up the start screen: eight karts on a staggered grid, two columns, you sixth', !g.demo && g.state === 'title' && g.phase === 'grid' && (await page.eval<number>('document.querySelectorAll("#gm .screen").length')) === 1 && onGrid && g.karts[0].slot === 5 && g.place === 6,
        slots.map((q) => `${q.prog.toFixed(1)}/${q.x}`).join(' '));
      // the racer pick: the eight in a row, yours lit; right picks the next, a tap any, and it is remembered
      const row = () => page.eval<{ n: number; on: number; imgs: number; names: string[] }>('(() => { const b = [...document.querySelectorAll("#gm .kpick button")]; return { n: b.length, on: b.findIndex((x) => x.classList.contains("on")), imgs: b.filter((x) => x.querySelector("img")).length, names: b.map((x) => x.textContent) }; })()');
      await sleep(300); const r0 = await row();
      ok('kart: the start screen has the eight racers in a row, each with its portrait, yours (Pepe) lit', r0.n === 8 && r0.on === 0 && r0.imgs === 8 && r0.names[0] === 'Pepe' && r0.names[3] === 'Bike Tyson', JSON.stringify(r0));
      await page.key('ArrowRight'); await page.key('ArrowRight', 'keyUp'); await sleep(250);
      const pk1 = await ks(), rw1 = await row();
      ok('kart: right picks the next racer: Doge drives your kart (sixth on the grid, his handling), and Pepe one of the others', pk1.state === 'title' && pk1.pick.racer === 'doge' && pk1.karts[0].racer === 'doge' && pk1.karts[0].slot === 5 && pk1.karts.some((q) => q.racer === 'pepe') && Math.abs(pk1.top - TOP * 0.985) < 0.01 && rw1.on === 1,
        `${pk1.karts.map((q) => q.racer).join(',')}, top ${pk1.top}`);
      const box = await page.eval<{ x: number; y: number }>('(() => { const r = document.querySelectorAll("#gm .kpick button")[3].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()');
      await page.click(box.x, box.y); await sleep(250);
      const pk2 = await ks();
      ok('kart: a tap on a racer picks it (and does not start the race)', pk2.state === 'title' && pk2.pick.racer === 'bike' && pk2.karts[0].racer === 'bike', `${pk2.state} ${pk2.pick.racer}`);
      await page.eval(`navigator.getGamepads = () => [{ connected: true, axes: [-0.9, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }]`); await sleep(250);
      await page.eval('navigator.getGamepads = () => []'); await sleep(100);
      const pk3 = await ks();
      ok('kart: and the pad\'s stick picks too (left: back one)', pk3.state === 'title' && pk3.pick.racer === 'shiba', String(pk3.pick.racer));
      // remembered: the game runs on an opaque origin (it may keep nothing), so it hands each pick to the page round
      // it, which keeps it and hands it back when the game is up (app/g/[slug]/play-frame.tsx); here, this page is both
      const told = await page.eval<{ racer: string }[]>('window.__kartTold');
      await page.goto(`${BASE}/d/${kid}/play`);
      for (let i = 0; i < 100 && !(await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)); i++) await sleep(200);
      await page.eval(`window.postMessage({ source: 'gamemog-host', type: 'play' }, '*')`); await sleep(400);
      const pk4a = await ks();
      await page.eval(`window.postMessage({ source: 'gamemog-host', type: 'kart-racer', racer: ${JSON.stringify(told[told.length - 1]?.racer ?? '')} }, '*')`); await sleep(400);
      const pk4 = await ks(), r4 = await row();
      ok('kart: the pick is remembered: each is told to the page round the game, and the one it hands back on a new load is yours', told.map((m) => m.racer).join() === 'doge,bike,shiba' && pk4a.pick.racer === 'pepe'
        && pk4.state === 'title' && pk4.pick.racer === 'shiba' && pk4.karts[0].racer === 'shiba' && r4.on === 2, `told ${told.map((m) => m.racer).join()}; then ${pk4.pick.racer}, lit ${r4.on}`);
      await page.key('ArrowLeft'); await page.key('ArrowLeft', 'keyUp'); await page.key('ArrowLeft'); await page.key('ArrowLeft', 'keyUp'); await sleep(250);
      const pk5 = await ks();
      ok('kart: and left goes back down the row, to Pepe', pk5.pick.racer === 'pepe' && pk5.karts[0].racer === 'pepe' && pk5.top === TOP, String(pk5.pick.racer));
      // (the camera's distance from your kart, and how high over it)
      const camOff = () => page.eval<{ dist: number; up: number }>(`(() => { const R = window.__gmRuntime, I = R.debug.internals(), o = I.scene.getObjectByName('racer-' + R.state().kart.karts[0].racer).parent, c = I.camera.position; const p = new THREE.Vector3(); o.getWorldPosition(p); return { dist: +c.distanceTo(p).toFixed(2), up: +(c.y - p.y).toFixed(2) }; })()`);
      await page.key('Enter'); await sleep(400);
      const fly = await ks(), flyCam0 = await camOff();
      const flyUi = await page.eval<{ hint: string; hud: boolean }>('(() => { const e = document.querySelector("#gm .kskip span"); return { hint: e && getComputedStyle(e).display !== "none" ? e.textContent : "", hud: getComputedStyle(document.querySelector("#gm .kpl")).display !== "none" }; })()');
      await sleep(500); const flyCam1 = await camOff();
      ok('kart: Enter first flies the camera down the last of the lap toward the grid, high over the road (the karts waiting, no count, the HUD away, how to skip it at the bottom)', fly.state === 'flyover' && fly.phase === 'grid' && fly.count === 0 && flyCam0.dist > 60 && flyCam0.up > 8 && flyCam1.dist < flyCam0.dist - 10 && !flyUi.hud && /skip/i.test(flyUi.hint),
        `${fly.state}: ${flyCam0.dist} m off, ${flyCam0.up} m up; 0.5 s later ${flyCam1.dist} m; "${flyUi.hint}", HUD ${flyUi.hud}`);
      await page.key('Space'); await page.key('Space', 'keyUp'); await sleep(120);
      const skipped = await ks();
      ok('kart: a key skips the flyover: the count at once', skipped.state === 'countdown' && skipped.count > 2.7, `${skipped.state} ${skipped.count}`);
      const seen = new Set<string>(); let phase = '', tGo = 0, meter = false; const t0 = Date.now();
      for (let i = 0; i < 60; i++) { const c = await page.eval<string>('document.querySelector("#gm .count").textContent'); if (c) seen.add(c); const st = await ks(); phase = st.phase; meter = meter || st.hud.launch; if (phase === 'race' && !tGo) tGo = Date.now() - t0; if (tGo && seen.has('GO')) break; await sleep(80); }
      ok('kart: Enter counts 3, 2, 1, GO, then the race, with the Moon Launch needle across the count', ['3', '2', '1', 'GO'].every((c) => seen.has(c)) && phase === 'race' && tGo > 2600 && tGo < 3600 && meter, `${[...seen].join(',')} after ${tGo} ms, needle ${meter}`);

      console.log('\nkart: driving, through the keys');
      await page.key('KeyW', 'keyDown'); await sleep(1500);
      const a1 = await ks();
      ok('kart: W is the gas', a1.speed > 15, `${a1.speed} m/s after 1.5 s`);
      const hd = () => K<Sample>('return K.kart(0);').then((q) => q.h);
      const h1 = await hd(); await page.key('KeyD', 'keyDown'); await sleep(500); const h2 = await hd(); await page.key('KeyD', 'keyUp');
      await page.key('KeyA', 'keyDown'); await sleep(900); const h3 = await hd(); await page.key('KeyA', 'keyUp');
      ok('kart: D steers right and A left', h2 < h1 - 0.05 && h3 > h2 + 0.05, `heading ${h1.toFixed(2)} -> ${h2.toFixed(2)} -> ${h3.toFixed(2)} rad`);
      await page.key('Space', 'keyDown'); let air = 0; for (let i = 0; i < 6; i++) { air = Math.max(air, (await ks()).y); await sleep(25); } await page.key('Space', 'keyUp');
      ok('kart: Space hops', air > 0.05, `${air} m`);
      const cb0 = await ks(); await page.key('KeyC', 'keyDown'); await sleep(150); const cb1 = await ks(); await page.key('KeyC', 'keyUp'); await sleep(150);
      ok('kart: C looks back (the camera goes round to the front of the kart while it is held)', cb1.back && !cb0.back && Math.hypot(cb1.camera.x - cb0.camera.x, cb1.camera.z - cb0.camera.z) > 6, `camera moved ${Math.hypot(cb1.camera.x - cb0.camera.x, cb1.camera.z - cb0.camera.z).toFixed(1)} m`);
      await page.key('KeyW', 'keyUp');
      await page.key('KeyP'); await sleep(200); const p1 = await ks(); await sleep(600); const p2 = await ks();
      ok('kart: P pauses the race', p1.state === 'paused' && p2.time === p1.time, `${p1.state} ${p1.time} ${p2.time}`);
      await page.key('KeyP'); await sleep(200);
      ok('kart: and P carries on', (await ks()).state === 'race');
      const kit = await page.eval<{ buttons: string[]; bigLast: boolean; stick: number }>(`(() => { const b = [...document.querySelectorAll('#gm .tpad button')]; return { buttons: b.map((x) => x.textContent), bigLast: !!b.length && b[b.length - 1].classList.contains('big'), stick: document.querySelectorAll('#gm .stick').length }; })()`);
      ok('kart: touch: the stick, BRAKE, ITEM, and DRIFT big and last', kit.stick === 1 && kit.buttons.join(',') === 'BRAKE,ITEM,DRIFT' && kit.bigLast, JSON.stringify(kit));
      await K('K.place(40, 0, 12);'); await sleep(50);
      const b0 = await ks(), g0 = await hd();
      await page.eval(`navigator.getGamepads = () => [{ connected: true, axes: [0.8, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === 0, value: i === 0 ? 1 : 0 })) }]`);
      await sleep(700); const b1 = await ks(), g1 = await hd();
      await page.eval('navigator.getGamepads = () => []'); await sleep(100);
      ok('kart: a gamepad drives: A is the gas, the stick steers', b1.speed > b0.speed + 1 && g1 < g0 - 0.05, `${b0.speed} -> ${b1.speed} m/s, heading ${g0.toFixed(2)} -> ${g1.toFixed(2)} rad`);

      console.log('\nkart: the physics, stepped exactly (120 steps a second, the rivals off the track)');
      // (and no GM in your pocket: since 7 Oct a bump from a rival in the race above can knock one of its own loose
      // for you to take, and each one is 0.6% more top speed)
      await K('K.solo(true); K.gm(0);');
      const run = (setup: string, sec: number, inp: string) => K<Sample[]>(`${setup}; return K.run(${sec}, ${inp}, 1 / 120);`);
      const at = (tr: Sample[], tt: number) => tr.reduce((p, q) => (Math.abs(q.t - tt) < Math.abs(p.t - tt) ? q : p));
      const first = (tr: Sample[], f: (s: Sample) => boolean) => tr.find(f);
      const peak = (tr: Sample[]) => Math.max(...tr.map((s) => s.v));
      const STEP = 1 / 120 + 1e-6;
      let tr = await run('K.place(10, 0, 0)', 6, '{ gas: true }');
      const t95 = first(tr, (s) => s.v >= 0.95 * TOP)?.t ?? 99;
      ok('kart: the gas reaches 95% of top speed in 1.9 s (rate 1.6), and the top is 31 m/s (26.5 until the owner\'s "slightly too slow", 7 Oct)', Math.abs(t95 - Math.log(20) / 1.6) <= STEP && Math.abs(at(tr, 6).v - TOP) <= 0.25, `95% at ${t95.toFixed(3)} s, ${at(tr, 6).v} m/s at 6 s`);
      tr = await run('K.place(10, 0, 31)', 3, '{ brake: true }');
      const tStop = first(tr, (s) => s.v <= 0.5)?.t ?? 99;
      ok('kart: the brake pulls toward 8 m/s in reverse (rate 3): stopped from top speed in half a second, then reversing at 8 m/s', tStop > 0.44 && tStop < 0.52 && Math.abs(at(tr, 3).v + 8) < 0.05, `stopped at ${tStop.toFixed(3)} s, ${at(tr, 3).v} m/s at 3 s`);
      tr = await run('K.place(10, 0, 20)', 0.6, 'function (t) { return { gas: true, drift: t < 0.03 }; }');
      const airT = tr.filter((s) => s.hop).length / 120, top = Math.max(...tr.map((s) => s.y));
      ok('kart: Space is a hop of 0.28 s, 0.32 m high, and a tap is no drift', Math.abs(airT - 0.28) <= STEP * 1.5 && Math.abs(top - 0.32) <= 0.05 && tr.every((s) => !s.drift), `${airT.toFixed(3)} s, ${top} m`);
      // a drift: steer in, hold Space through the landing, keep steering in (the kart circles on the road at 15.9 m/s,
      // over the 0.45 of top speed a drift needs; a light steer before it, since 7 Oct's turn: full lock there turns
      // the kart so far before the hop that its circle runs off the road). (13.6 m/s and 1.0 a second until the faster
      // race, 7 Oct: the same share of the top, and the same circle)
      const vd = +(13.6 * PACE).toFixed(2), pre = `K.place(20, -7.6, ${vd}); K.run(0.4, function (t, k) { return { gas: k.v < ${vd}, steer: 0.3 }; })`;
      tr = await run(pre, 3.2, `function (t, k) { return { gas: k.v < ${vd}, drift: true, steer: 1 }; }`);
      const d0 = first(tr, (s) => s.drift === 1)?.t ?? 99;
      const tiers = [1, 2, 3].map((n) => (first(tr, (s) => s.tier >= n)?.t ?? 99) - d0);
      ok('kart: steering into a drift (1.17 a second), its tiers come at a charge of 0.6, 1.6 and 2.2 (0.51, 1.37 and 1.88 s): Green Candle, Gold, MOG', d0 < 0.35 && tiers.every((x, i) => Math.abs(x - [0.6, 1.6, 2.2][i] / PACE) <= STEP * 1.5) && tr.every((s) => !s.off),
        `drift from ${d0.toFixed(3)} s, tiers at ${tiers.map((x) => x.toFixed(3)).join(', ')}`);
      // the most of your drifts, kept by the race step by step (the platform playtest's "your kart drifted": 8 Oct, judged
      // from looks ten times a second of real time, it now and then missed a drift that reached its tier between two)
      const most = await K<{ tier: number; charge: number }>('return K.state().drift.most;');
      ok('kart: the race keeps the most of your drifts, step by step: after that one, MOG and its charge (2.2 and more)', most.tier === 3 && most.charge >= 2.2, JSON.stringify(most));
      // (from the left edge: the neutral drift's circle, 14 m at 16.4 m/s since 7 Oct, kept on the road)
      const vn = +(14 * PACE).toFixed(2);
      tr = await run(`K.place(20, -7.6, ${vn}); K.run(0.3, function (t, k) { return { gas: k.v < ${vn} }; })`, 1.5, `function (t, k) { return { gas: k.v < ${vn}, drift: true, steer: t < 0.1 ? 1 : t < 0.7 ? 0 : -1 }; }`);
      const slope = (a: number, b: number) => (at(tr, b).charge - at(tr, a).charge) / (b - a);
      const neutral = slope(0.4, 0.65), outside = slope(0.95, 1.25);
      ok('kart: neutral, a drift charges 0.88 a second; counter-steered, 0.64 (0.75 and 0.55 at the old speed)', Math.abs(neutral - 0.75 * PACE) < 0.02 && Math.abs(outside - 0.55 * PACE) < 0.03 && tr.every((s) => !s.off), `${neutral.toFixed(3)}, ${outside.toFixed(3)}`);
      ok('kart: the direction is locked at the hop: counter-steering never flips it', tr.filter((s) => s.t > 0.35).every((s) => s.drift === 1), [...new Set(tr.map((s) => s.drift))].join(','));
      tr = await run(pre, 0.8, `function (t, k) { return { gas: k.v < ${vd}, drift: t < 0.55, steer: 1 }; }`);
      ok('kart: let go before Green Candle and there is no boost', tr.some((s) => s.drift === 1) && tr.every((s) => s.tier === 0 && s.boost === 0), `max charge ${Math.max(...tr.map((s) => s.charge)).toFixed(2)}`);
      tr = await run(`K.place(20, 0, ${vn}); K.setDrift(1, 0.5)`, 0.6, '{ brake: true, drift: true }');
      const cancel = first(tr, (s) => s.drift === 0);
      ok('kart: a drift ends below 0.35 of top speed (0.40 until 7 Oct), with no boost', !!cancel && (cancel?.v ?? 0) < 0.35 * TOP && (cancel?.v ?? 0) > 0.35 * TOP - 1.0 && tr.every((s) => s.boost === 0), `ended at ${cancel?.v} m/s`);
      const lens: string[] = []; let boostOk = true;
      for (const [n, ch, len] of [[1, 0.8, 0.6], [2, 1.7, 1.1], [3, 2.8, 1.8]] as const) {
        tr = await run(`K.place(20, 0, 31); K.setDrift(1, ${ch})`, 2.6, '{ gas: true }');
        const on = tr.filter((s) => s.boost > 0), last = on.length ? on[on.length - 1].t : 0, pk = peak(tr);
        lens.push(`tier ${n}: ${(last + 1 / 120).toFixed(3)} s, ${pk.toFixed(1)} m/s`);
        if (Math.abs(last + 1 / 120 - len) > STEP * 1.5 || pk > 1.2 * TOP + 0.01 || (n === 3 && pk < 1.19 * TOP) || on[0]?.src !== 'drift') boostOk = false;
      }
      ok('kart: released, the drift fires a boost of +20% for 0.6, 1.1 and 1.8 s by tier', boostOk, lens.join('; '));
      // boosts never add up: a pad (+28%) under a running drift boost (+20%) is +28%, never +48%
      // (the boost's own multiplier: a GM line on the pad's line, taken on the way, would lift the speed 0.6% a coin)
      tr = await run('K.gm(0); K.place(154, -2.5, 31); K.setDrift(1, 2.8)', 2.4, '{ gas: true }');
      const both = Math.max(...tr.map((s) => s.mul)), bothV = peak(tr) / TOP / (1 + 0.006 * Math.min(10, tr[tr.length - 1].gm));
      ok('kart: boosts never add up: a pad under a running drift boost tops out at +28%', both > 1.25 && both < 1.2805 && bothV < 1.2805 && tr.some((s) => s.src === 'pad'), `${both.toFixed(3)}x boost, ${bothV.toFixed(3)}x the top (GM ${tr[tr.length - 1].gm} taken)`);

      // the handling (the owner, 7 Oct: "the handling of kart could DRAMATICALLY improve. when doing corners it is too
      // stiff ... turning is tough to control", "turning is SOOO tough and not smooth"): until then a key reached full
      // lock 0.25 s behind it and the kart turned no tighter than 31 m at the top speed. Every speed held each step
      console.log('\nkart: the handling (7 Oct)');
      const keyRun = (v: number, f: string, sec: number, setup = 'K.place(60, -6, 0)') => run(setup, sec, `function (t, k) { k.v = ${v}; const I = (${f})(t); I.gas = true; return I; }`);
      tr = await keyRun(25, '(t) => ({ steer: t < 0.4 ? 1 : 0, analog: false })', 0.6);
      const kIn = tr[0].steer, k90 = first(tr, (s) => s.steer >= 0.9)?.t ?? 9, k95 = first(tr, (s) => s.steer >= 0.95)?.t ?? 9, kOut = (first(tr, (s) => s.t > 0.4 && s.steer <= 0.05)?.t ?? 9) - 0.4;
      const fl = await keyRun(25, '(t) => ({ steer: t < 0.3 ? 1 : -1, analog: false })', 0.45), kFlip = (first(fl, (s) => s.t > 0.3 && s.steer < 0)?.t ?? 9) - 0.3;
      ok('kart: a key steers at once: nearly half lock (0.45) the step it goes down, 90% by 0.15 s and all of it by 0.2 s; let go, straight in 0.12 s; the other key, the other way inside 0.08 s (until 7 Oct: 0.25 s behind the key, half again after it was let go)',
        kIn >= 0.45 && k90 <= 0.15 && k95 <= 0.2 && kOut <= 0.12 && kFlip <= 0.08, `first step ${kIn}, 90% at ${k90.toFixed(3)} s, 95% at ${k95.toFixed(3)} s, straight ${kOut.toFixed(3)} s after, the other way ${kFlip.toFixed(3)} s after`);
      tr = await keyRun(25, '(t) => ({ steer: 1, analog: true })', 0.3);
      const s90 = first(tr, (s) => s.steer >= 0.9)?.t ?? 9;
      ok('kart: a stick (touch, a pad) is followed closely: 90% of a step in 0.15 s (10 a second until 7 Oct: 0.23 s)', s90 <= 0.15, `${s90.toFixed(3)} s`);
      // the turn: full lock, the speed held, its radius once the steer is all in
      const radius = async (kmh: number, drift = 0, steer = 1) => {
        const v = kmh / 3.6, q = await keyRun(v, `(t) => ({ steer: ${steer}, drift: ${drift ? 'true' : 'false'}, analog: true })`, 0.5, `K.place(60, -6, ${v}); ${drift ? `K.setDrift(${drift}, 0)` : ''}`);
        return v / Math.abs(q[q.length - 1].w);
      };
      // (7 Oct, round 3: each at the same share of the new top speed as before, 1.17 times the speed: the same radius)
      const Rs = [await radius(30 * PACE), await radius(60 * PACE), await radius(90 * PACE), await radius(110 * PACE)], Rwant = [3.9, 8.7, 16.5, 23.4];
      ok('kart: full lock turns tight at every speed: a radius of 3.9 m at 35 km/h, 8.7 at 70, 16.5 at 105 and 23.4 at 129 (within 6%; until 7 Oct 16, 21, 31 and 40 at 30, 60, 90 and 110, then these at those speeds; the race 1.17 times as fast since the owner\'s third review)', Rs.every((r, i) => Math.abs(r / Rwant[i] - 1) < 0.06), Rs.map((r) => `${r.toFixed(1)} m`).join(', '));
      const Rd = [await radius(90 * PACE, 1, 1), await radius(90 * PACE, 1, 0), await radius(90 * PACE, 1, -1)], Rdw = [12.5, 25, 75];
      ok('kart: a drift at 105 km/h runs 12.5 m steering in, 25 m neutral and 75 m counter-steering, smoothly between (within 6%; until 7 Oct 13, 22 and 78 at 90 km/h, a key\'s three states and nothing between)', Rd.every((r, i) => Math.abs(r / Rdw[i] - 1) < 0.06), Rd.map((r) => `${r.toFixed(1)} m`).join(', '));
      tr = await keyRun(25 * PACE, '(t) => ({ steer: t < 0.2 ? 1 : 0, drift: true, analog: false })', 0.3, `K.place(60, -6, ${25 * PACE}); K.setDrift(1, 0)`);
      ok('kart: in a drift a key moves the steer 4.1 a second either way (3.5 at the old speed), so a tap tightens the line a little (0.2 s: 0.82 of the way in) and the kart is never thrown wide', Math.abs(at(tr, 0.2).steer - 0.7 * PACE) < 0.03 && tr.every((s) => s.drift === 1), `${at(tr, 0.2).steer} at 0.2 s`);
      // a tap at 105 km/h (90 at the old speed): how far it turns the kart, and how much of that comes after the key is up
      tr = await keyRun(25 * PACE, '(t) => ({ steer: t < 0.1 ? 1 : 0, analog: false })', 1.0);
      const yawAll = Math.abs(tr[tr.length - 1].h - tr[0].h) * 180 / Math.PI, yawOn = Math.abs(at(tr, 0.1).h - tr[0].h) * 180 / Math.PI, after = 1 - yawOn / Math.max(1e-6, yawAll);
      ok('kart: a 0.1 s tap of a key at 105 km/h turns the kart 5 to 10 degrees, no more than 35% of it after the key is up (until 7 Oct 4.7 degrees, 78% after)', yawAll >= 5 && yawAll <= 10 && after <= 0.35, `${yawAll.toFixed(1)} degrees, ${(after * 100).toFixed(0)}% after`);
      // full lock at the top speed scrubs a little of it (toward 6% off, at the rate a boost fades; 0.6 s of it from the
      // left edge, before the circle meets the right-hand wall)
      // (with an empty pocket: GM picked up by the runs before raise the top speed it is measured against)
      tr = await run('K.gm(0); K.place(60, -6, 31)', 0.6, '{ gas: true, steer: 1 }');
      ok('kart: full lock at the top speed scrubs a little of it (toward 6% off; nothing until 7 Oct, when holding the gas through a bend braked only on the walls)', tr[tr.length - 1].v > 0.95 * TOP && tr[tr.length - 1].v < 0.985 * TOP && tr.every((s) => !s.off), `${tr[tr.length - 1].v} m/s after 0.6 s (${tr[tr.length - 1].gm} GM)`);
      // a wall met badly, then steered away from as a person does (the gas held, the far key): one bonk at most, never a
      // second (until 7 Oct: up to 4, a crawl that could not turn off the wall it had just met)
      const rec: number[] = [];
      for (const ang of [45, 60, 75]) {
        // (a person: 0.18 s to react, then the key away from the wall until the kart points down the road again, and
        // straight; the road's heading here read first)
        const q = await run(`const H0 = K.place(60, 9.5, 15, 0).h; K.place(60, 9.5, 15, ${ang})`, 3, 'function (t, k) { const e = Math.atan2(Math.sin(k.h - H0), Math.cos(k.h - H0)); return { gas: true, steer: t < 0.18 ? 0 : e < -0.15 ? -1 : e > 0.15 ? 1 : 0, analog: false }; }');
        rec.push(q.filter((s, i) => i > 0 && s.stun > 0 && q[i - 1].stun === 0).length);
      }
      ok('kart: into a wall at 45, 60 and 75 degrees (15 m/s) and steered away: one bonk at most, never a second', rec.every((b) => b <= 1), rec.join(', '));

      console.log('\nkart: the course');
      tr = await run('K.place(150, -2.5, 31)', 2, '{ gas: true }');
      ok('kart: a Green Candle pad is +28% for a second (at least 1.27x top speed)', peak(tr) / TOP >= 1.27 && tr.some((s) => s.src === 'pad'), `${(peak(tr) / TOP).toFixed(3)}x`);
      tr = await run('K.place(700, 0, 31)', 3, 'function (t, k) { return { gas: true, drift: k.air && k.y > 0.4 }; }');
      const airS = tr.filter((s) => s.air).length / 120, landed = tr.findIndex((s, i) => i > 0 && tr[i - 1].air && !s.air), trickB = tr.slice(Math.max(0, landed)).filter((s) => s.src === 'trick' && s.boost > 0).length / 120;
      ok('kart: off the small ramp\'s lip, over 0.6 s in the air; Space in the air is a trick, +20% for 0.7 s on landing', airS >= 0.6 && tr.some((s) => s.trick) && Math.abs(trickB - 0.7) <= STEP * 2, `${airS.toFixed(3)} s up, trick boost ${trickB.toFixed(3)} s`);
      tr = await run('K.place(700, 0, 31)', 2.2, 'function (t, k) { return { gas: true, drift: k.air && k.vy < -4 }; }');
      ok('kart: a press after the 0.35 s window is no trick', !tr.some((s) => s.trick || s.src === 'trick'), `${tr.some((s) => s.air)}`);
      tr = await run('K.place(60, 10, 31)', 3, '{ gas: true }');
      ok('kart: on the grass past the kerb it settles at 0.55 of top speed', tr[tr.length - 1].off && Math.abs(tr[tr.length - 1].v - 0.55 * TOP) < 0.3, `${tr[tr.length - 1].v} m/s`);
      tr = await run('K.place(540, -6, 20)', 2, '{ gas: true }');
      ok('kart: in the mud, 0.40', tr[tr.length - 1].surf === 0.4 && Math.abs(tr[tr.length - 1].v - 0.4 * TOP) < 0.3, `${tr[tr.length - 1].v} m/s`);
      tr = await run('K.place(60, 10, 17.05); K.setDrift(1, 1.7)', 1.0, '{ gas: true }');
      ok('kart: a drift\'s boost halves the grass\'s penalty (0.775 of top speed)', Math.abs(peak(tr) - 0.775 * TOP) < 0.5, `${peak(tr).toFixed(2)} m/s`);
      // the walls stand 12 m out (8 m of road and 4 of grass); a kart's edge meets them at 11.35
      tr = await run('K.place(60, 8, 22, 10)', 1.2, '{ gas: true }');
      let hi = tr.findIndex((s) => s.x >= 11.34);
      ok('kart: a wall met at a glance (10 degrees) keeps over 90% of the speed, and slides along it', hi > 0 && tr[hi].v / tr[hi - 1].v > 0.9 && tr.every((s) => s.stun === 0) && tr.slice(hi + 20).every((s) => Math.abs(s.x - 11.35) < 0.06),
        hi > 0 ? `${tr[hi - 1].v.toFixed(2)} -> ${tr[hi].v.toFixed(2)} m/s (${(tr[hi].v / tr[hi - 1].v).toFixed(3)})` : 'never met');
      tr = await run('K.place(60, 10.9, 22, 3); K.setDrift(1, 1.0)', 0.8, '{ gas: true, drift: true }');
      hi = tr.findIndex((s) => s.x >= 11.34);
      ok('kart: and a drift that glances a wall keeps going, its charge kept', hi > 0 && tr.every((s) => s.stun === 0) && tr[tr.length - 1].drift === 1 && tr[tr.length - 1].charge >= tr[hi].charge && tr[hi].charge >= 1,
        hi > 0 ? `charge ${tr[hi].charge} -> ${tr[tr.length - 1].charge}, drift ${tr[tr.length - 1].drift}` : 'never met');
      tr = await run('K.place(60, 8, 22, 40)', 1.0, '{ gas: true }');
      hi = tr.findIndex((s) => s.x >= 11.34);
      const ratio = hi > 0 ? tr[hi].v / tr[hi - 1].v : 0;
      ok('kart: met at 30 to 60 degrees it scrapes: 0.85 along the wall and a quarter off it (0.67 of the speed at 40), no stun (7 Oct: 25 to 55, 0.8)', Math.abs(ratio - Math.hypot(0.85 * Math.cos(40 * Math.PI / 180), 0.25 * Math.sin(40 * Math.PI / 180))) < 0.03 && tr.every((s) => s.stun === 0) && tr[tr.length - 1].x < 11.3,
        `${ratio.toFixed(3)} kept, away to ${tr[tr.length - 1].x}`);
      tr = await run('K.place(60, 8, 22, 70); K.setDrift(1, 1.0)', 1.2, '{ gas: true, drift: true }');
      const bi = tr.findIndex((s) => s.stun > 0), bk = tr.findIndex((s, i) => i > bi && s.stun === 0);
      // (the nose turned toward the wall's line the step it bonks: 70 degrees off it, turned 25)
      const turned = bi > 0 ? Math.abs(Math.atan2(Math.sin(tr[bi].h - tr[bi - 1].h), Math.cos(tr[bi].h - tr[bi - 1].h))) * 180 / Math.PI : 0;
      ok('kart: square on (over 60 degrees) it bonks: back at 0.3 of the speed (6 m/s at most), its nose turned 25 degrees toward the wall\'s line, the drift lost, control again after 0.25 s (7 Oct: over 55, a quarter, 7 m/s, no turn, 0.4 s)',
        bi > 0 && Math.abs(-tr[bi].v - Math.min(6, 0.3 * tr[bi - 1].v)) < 0.25 && Math.abs(turned - 25) < 1.5 && tr[bi].drift === 0 && Math.abs((bk - bi) / 120 - 0.25) <= STEP * 1.5,
        bi > 0 ? `${tr[bi - 1].v.toFixed(2)} -> ${tr[bi].v.toFixed(2)} m/s, turned ${turned.toFixed(1)} degrees, ${((bk - bi) / 120).toFixed(3)} s` : 'never met');
      // wedged against a wall head on, the gas held: each bounce takes the control away, so steering alone never
      // got out; after 1.2 s it is nudged back onto the road (a wall is never sticky), you and the rivals alike
      const freed = (q: Sample[]) => q.find((s) => s.x > -7 && s.v > 5)?.t ?? 99;
      const wedge = await Promise.all([1, 0].map(async (steer) => freed(await run('K.place(150, -10, 6, -60)', 2.5, `{ gas: true, steer: ${steer} }`))));
      const rival = await K<Sample[]>('K.place(150, -10, 6, -85, 1); K.place(10, 0, 0, 0, 0); const out = []; for (let s = 0; s < 25; s++) { K.run(0.1, {}); out.push(K.kart(1)); } K.solo(true); return out;');
      const rt0 = freed(rival.map((s, i) => ({ ...s, t: (i + 1) / 10 })));
      ok('kart: wedged at a wall with the gas held, you or a rival is nudged back onto the road and rolling inside 2 s', wedge.every((t) => t < 2) && rt0 < 2,
        `you (steering away, and not) out at ${wedge.map((t) => t.toFixed(2)).join(' and ')} s, a rival at ${rt0.toFixed(1)} s`);
      // the Rescue Claw: into the pond past the gap in the wall (after the ramp), with 5 GM
      const claw: { tr: Sample[]; line?: { off: number } } = await K<{ tr: Sample[] }>('K.place(772, -9, 14, -40); K.gm(5); return { tr: K.run(3.5, { gas: true }, 1 / 120) };');
      const called = claw.tr.findIndex((s) => s.rescue >= 0), down = claw.tr.findIndex((s, i) => i > called && s.rescue < 0), wetT = claw.tr.filter((s) => s.wet > 0 && s.rescue < 0).length / 120, dn = claw.tr[down];
      Object.assign(claw, { line: dn ? await K<{ off: number }>(`return K.lineAt(${dn.d});`) : { off: 99 } });
      ok('kart: in the deep water 0.4 s and the Rescue Claw comes: set down on the racing line, 12 m back or more, inside 2 s, rolling at 0.4 of top speed, a ghost for a second, 2 GM lighter',
        called > 0 && down > called && (down - called) / 120 <= 2 && Math.abs(wetT - 0.4) <= STEP * 1.5 && !!dn && Math.abs(dn.v - 0.4 * TOP) < 0.4 && dn.ghost > 0.9 && dn.gm === 3 && claw.tr[called].d - dn.d >= 12 && Math.abs(dn.x - (claw.line?.off ?? 99)) < 0.6,
        dn ? `wet ${wetT.toFixed(3)} s, claw ${((down - called) / 120).toFixed(2)} s, back ${(claw.tr[called].d - dn.d).toFixed(1)} m, x ${dn.x} (line ${claw.line?.off}), ${dn.v} m/s, GM 5 -> ${dn.gm}` : 'never set down');
      // GM: the pocket, and the coins
      const pocket = await Promise.all([3, 25].map(async (n) => { const q = await run(`K.place(10, 0, 0); K.gm(${n})`, 8, '{ gas: true }'); return q[q.length - 1].v / TOP; }));
      await K('K.gm(0);');
      ok('kart: each GM in your pocket is +0.6% top speed, capped at +6%', Math.abs(pocket[0] - 1.018) < 0.002 && Math.abs(pocket[1] - 1.06) < 0.002, pocket.map((x) => x.toFixed(4)).join(', '));
      const coin = await K<{ before: number; after: number; line: { d: number; x: number; on: boolean }[] }>(`const C = K.coins(); let l = 0; while (l < C.length - 5 && !C.slice(l, l + 5).every((c) => c.on)) l += 5;
        const c = C[l]; K.place(c.d - 6, c.x, 20); K.gm(0); K.run(1.2, { gas: true }); const after = K.kart(0).gm; return { before: 0, after, line: K.coins().slice(l, l + 5) };`);
      ok('kart: a line of five GM, driven through, is five GM', coin.after === 5 && coin.line.every((c) => !c.on), `${coin.after} GM`);

      console.log('\nkart: the race rules');
      // places, the moment you pass
      const pass = await K<{ when: number; wrong: number; then: number[] }>(`const r = K.kart(1); K.place(60, K.lineAt(60).off + r.lane, 8, 0, 1); const b0 = K.kart(1); K.place(50, b0.x + (b0.x > 0 ? -3 : 3), 26.5, 0, 0); let when = -1, wrong = 0, then = [];
        for (let s = 0; s < 240; s++) { K.run(1 / 120, { gas: true }); const a = K.kart(0), b = K.kart(1); if (Math.abs(a.prog - b.prog) > 0.02 && (a.prog > b.prog) !== (a.place < b.place)) wrong++; if (when < 0 && a.prog > b.prog + 0.02) { when = s; then = [a.place, b.place]; } } K.solo(true); return { when, wrong, then };`);
      ok('kart: places are right the step you pass (every step, the one further on is placed ahead)', pass.when > 0 && pass.wrong === 0 && pass.then[0] < pass.then[1], JSON.stringify(pass));
      tr = await run('K.place(60, 0, 10, 180)', 1.6, '{ gas: true }');
      const tr2 = await run('K.place(60, 0, 10, 100)', 1.6, '{ gas: true }');
      ok('kart: facing more than 110 degrees off the track for a second is wrong way (100 is not)', !at(tr, 0.6).wrong && tr[tr.length - 1].wrong && tr2.every((s) => !s.wrong));
      // a checkpoint skipped (a warp 150 m on, two of sixteen) voids the lap: past the line, no lap
      const skip = await K<Sample>(`K.solo(true); K.seed(7); K.restart(); K.go(); K.run(3, 'auto'); K.warp(150); K.run(45, 'auto'); return K.kart(0);`);
      ok('kart: skip a checkpoint and the lap is void: past the line, no lap, and the banner says go back', skip.lap === 0 && skip.prog > 1150 && skip.missed && (await ks()).missed, `lap ${skip.lap} at ${skip.prog} m, missed ${skip.missed}`);
      const back2 = await K<{ a: Sample; d: Sample; xs0: string; xs1: string; on: number }>(`K.seed(8); K.restart(); K.go(); const xs = () => K.coins().filter((c, i) => i % 5 === 0).map((c) => c.x).join(','); const xs0 = xs();
        K.run(3, 'auto'); K.warp(150); K.run(0.1, 'auto'); const a = K.kart(0); K.warp(-150); for (let i = 0; i < 400 && K.kart(0).lap < 1; i++) K.run(0.1, 'auto'); const d = K.kart(0); return { a, d, xs0, xs1: xs(), on: K.coins().filter((c) => c.on).length };`);
      ok('kart: go back through the checkpoint and the lap counts again', back2.a.missed && back2.d.lap === 1 && !back2.d.missed, `missed ${back2.a.missed}, then lap ${back2.d.lap} at ${back2.d.prog} m`);
      ok('kart: the GM lines are laid again for each lap you start (all forty, in new places)', back2.on === 40 && back2.xs0 !== back2.xs1, `${back2.xs0} -> ${back2.xs1}`);
      // the slipstream: 9 m behind a rival on its line
      const draft = await K<{ fill: number; first: number; boost: number; peak: number }>(`const ln = K.lineAt(20).off + K.kart(1).lane; K.place(20, ln, 20, 0, 1); K.place(11, ln, 20, 0, 0); let first = -1, fill = 0, boost = 0, peak = 0;
        for (let s = 0; s < 300; s++) { const r = K.kart(1); K.run(1 / 120, function (t, k) { return { gas: true, analog: true, steer: Math.max(-1, Math.min(1, (r.x - k.lat) * 0.35 + (k.h - Math.PI / 2) * 3)) }; }); const a = K.kart(0);
          if (s === 60) fill = a.slip; if (first < 0 && a.src === 'draft') { first = s; boost = a.cap; } peak = Math.max(peak, a.v / 31); }
        K.solo(true); return { fill, first: (first + 1) / 120, boost, peak };`);
      ok('kart: 4 to 14 m behind a kart on its line, the slipstream fills in 1.1 s, then fires +15% for a second', Math.abs(draft.first - 1.1) <= STEP * 2 && draft.boost === 0.15 && draft.fill > 0.45, JSON.stringify(draft));
      const bump = await K<{ a0: Sample; b0: Sample; a: Sample; b: Sample }>('K.place(60, 0, 26.5, 0, 0); K.place(63, 0, 14, 0, 1); const a0 = K.kart(0), b0 = K.kart(1); K.run(0.4, { gas: true }); const a = K.kart(0), b = K.kart(1); K.solo(true); return { a0, b0, a, b };');
      const gap = Math.hypot(bump.a.d - bump.b.d, bump.a.x - bump.b.x);
      ok('kart: karts bump: the one behind slows, the one ahead is shoved on, and neither run ends', bump.a.v < 24 && bump.b.v > 16 && gap >= 1.3 && bump.a.stun === 0 && bump.b.stun === 0, `behind ${bump.a0.v} -> ${bump.a.v}, ahead ${bump.b0.v} -> ${bump.b.v} m/s, ${gap.toFixed(2)} m apart`);
      const side = await K<{ wob: number[]; yaw: number[]; apart: number; ev: unknown[] }>(`K.events(true); K.place(60, 2, 20, 0, 1); K.place(59.5, -1, 20, 32, 0); let wob = [0, 0]; const h0 = [K.kart(0).h, K.kart(1).h];
        for (let s = 0; s < 36; s++) { K.run(1 / 120, { gas: true }); wob = [Math.max(wob[0], K.kart(0).wob), Math.max(wob[1], K.kart(1).wob)]; }
        const a = K.kart(0), b = K.kart(1), ev = K.events(true).filter((e) => e[0] === 'bump'); K.solo(true); return { wob, yaw: [a.h - h0[0], b.h - h0[1]], apart: Math.abs(a.x - b.x), ev };`);
      ok('kart: a hard knock from the side (over 8 m/s across) wobbles both for 0.35 s, and spins nobody', side.wob.every((w) => Math.abs(w - 0.35) < 0.02) && side.yaw.every((y) => Math.abs(y) < 0.8) && side.ev.length >= 1, JSON.stringify(side));
      const shove = await K<{ push: number; apart: number }>('K.place(60, 0.55, 20, 0, 1); K.place(60, -0.55, 20, 0, 0); K.run(1 / 120, { gas: true }); const a = K.kart(0), b = K.kart(1); K.run(0.3, { gas: true }); const a2 = K.kart(0), b2 = K.kart(1); K.solo(true); return { push: +(b.push - a.push).toFixed(2), apart: +(b2.x - a2.x).toFixed(2) };');
      ok('kart: side by side and touching, they are shoved apart at 3 m/s at least, never riding along locked', Math.abs(shove.push) >= 2.95 && Math.abs(shove.apart) > 1.3, `${shove.push} m/s across between them, ${shove.apart} m apart 0.3 s on`);
      // a rival comes up behind a slow kart on its own line: it goes round, by its side, without touching
      const avoid = await K<{ passed: boolean; minGap: number; slowest: number; bumps: number; lat: number }>(`K.events(true); const L0 = K.lineAt(100).off; K.place(100, L0, 6, 0, 0); K.place(70, K.lineAt(70).off, 25, 0, 1); let minGap = 99, slowest = 99, lat = 0;
        for (let s = 0; s < 480; s++) { K.run(1 / 120, { gas: false }); const a = K.kart(0), b = K.kart(1); const g = Math.hypot(a.d - b.d, a.x - b.x); if (g < minGap) { minGap = g; lat = Math.abs(a.x - b.x); } slowest = Math.min(slowest, b.v); }
        const bumps = K.events(true).filter((e) => e[0] === 'bump').length; const passed = K.kart(1).d > K.kart(0).d + 5; K.solo(true); return { passed, minGap: +minGap.toFixed(2), slowest: +slowest.toFixed(1), bumps, lat: +lat.toFixed(2) };`);
      ok('kart: a rival closing on a slow kart swerves round it (not only its lane), and gets by without a bump', avoid.passed && avoid.bumps === 0 && avoid.lat >= 1.4 && avoid.slowest > 18, JSON.stringify(avoid));

      console.log('\nkart: the Moon Launch');
      const launch = (press: string, touch = false) => K<Sample[]>(`K.solo(true); K.restart(); K.solo(true); return K.run(4.4, function (t) { return { gas: ${press}, touch: ${touch} }; }, 1 / 120);`);
      tr = await launch('t >= 2.25');
      const lp = tr[tr.length - 1], lbo = tr.filter((s) => s.src === 'launch' && s.boost > 0).length / 120;
      ok('kart: the gas going down as the 1 lands (0.75 s before GO) is a perfect Moon Launch: +20% for 1.2 s', lp.launch === 'perfect' && Math.abs(lbo - 1.2) <= STEP * 2 && peak(tr) > TOP, `${lp.launch}, ${lbo.toFixed(3)} s of boost, ${peak(tr).toFixed(1)} m/s`);
      tr = await launch('t >= 2.55');
      ok('kart: 0.45 s before GO, a good one: +20% for 0.5 s', tr[tr.length - 1].launch === 'good' && Math.abs(tr.filter((s) => s.src === 'launch' && s.boost > 0).length / 120 - 0.5) <= STEP * 2, tr[tr.length - 1].launch);
      tr = await launch('true');
      const gi = tr.findIndex((s) => s.spin > 0), moving = tr.findIndex((s, i) => i > gi && s.v > 0.05);
      ok('kart: held since before 1.4 s floods it: a stall puff and 0.6 s of wheelspin', tr[tr.length - 1].launch === 'flood' && gi >= 0 && Math.abs((moving - gi) / 120 - 0.6) <= STEP * 2.5, `${tr[tr.length - 1].launch}, still for ${((moving - gi) / 120).toFixed(3)} s`);
      const [early, earlyTouch] = [await launch('t >= 2.05'), await launch('t >= 2.05', true)];
      ok('kart: on touch the windows are half again as wide (0.95 s before GO: nothing on keys, perfect on touch)', early[early.length - 1].launch === '' && earlyTouch[earlyTouch.length - 1].launch === 'perfect', `${early[early.length - 1].launch || 'none'} / ${earlyTouch[earlyTouch.length - 1].launch}`);

      await kartItemChecks(page, K, ks);
      await K('K.hold(null); K.timeScale(1); K.solo(false); K.weights(null);');
      await kartChaosChecks(page, K, ks);
      await K('K.hold(null); K.timeScale(1); K.solo(false); K.film(null);');
      await kartHitsChecks(K);
      await K('K.hold(null); K.timeScale(1); K.solo(false); K.film(null);');

      console.log('\nkart: the same race twice');
      const r1 = await K<{ hash: string; times: (number | null)[] }>('return K.headless(11, 300);'), r2 = await K<{ hash: string }>('return K.headless(11, 300);');
      ok('kart: a race run again from the same seed ends the same', r1.hash === r2.hash && r1.times.every((x) => x !== null), `${r1.hash} ${r2.hash}`);
      const rep = await K<{ live: string; replay: string; steps: number; bytes: number }>(`K.solo(false); K.seed(99); K.restart(); K.run(3.5, function (t) { return { gas: t > 2.3 }; });
        K.run(40, function (t, k) { return { gas: true, steer: Math.sin(t * 0.9) * 0.8 + (k.lat > 5 ? -0.6 : k.lat < -5 ? 0.6 : 0), drift: (t % 4) > 2.6, analog: true }; }); return K.replay();`);
      ok('kart: a race run again from its seed and your logged inputs (2 bytes a step) ends the same, to the bit', rep.live === rep.replay && rep.steps > 5000, `${rep.live} / ${rep.replay}, ${rep.steps} steps, ${rep.bytes} bytes`);

      console.log('\nkart: the field (eight rivals alone, stepped, from three seeds)');
      const fields = await K<{ time: number; times: (number | null)[]; stuck: number; pace: number; spread: [number, number][]; chaos: Record<string, number[]> }[]>('return [3, 17, 42].map((s) => K.headless(s, 300, true));');
      const slowest = Math.max(...fields.flatMap((f) => f.times.map((x) => x ?? Infinity))), spreads = fields.map((f) => Math.max(...f.times.map((x) => x ?? 0)) - Math.min(...f.times.map((x) => x ?? 0)));
      ok('kart: all eight finish three laps inside 3:30 of race time, nobody stuck for 3 s', fields.every((f) => f.times.every((x) => x !== null)) && slowest <= 210 && fields.every((f) => f.stuck < 3), fields.map((f) => `${f.times.map((x) => x?.toFixed(0)).join('/')} stuck ${f.stuck}`).join('; '));
      ok('kart: a real field: finishes spread over more than a second, and no rival ever past 1.06x its top speed without an item', spreads.every((s) => s > 1) && fields.every((f) => f.pace <= 1.06 + 1e-9), `spreads ${spreads.map((s) => s.toFixed(1)).join(', ')} s, highest pace ${Math.max(...fields.map((f) => f.pace))}`);
      // the pack and the chaos (7 Oct): the field held together mid-race, and the rivals in the thick of it
      const mids = fields.map((f) => f.spread.filter((p) => p[0] > 0.12 && p[0] < 0.75).map((p) => p[1])), midMax = mids.map((m) => Math.max(...m)), midMean = mids.map((m) => m.reduce((a, b) => a + b, 0) / m.length);
      ok('kart: the pack: from 12% to 75% of the race the field is 140 m first to last on average (250 at the most: a fall into the break and the Claw\'s run-up), three races of it (the playtest of 7 Oct: 100 to 280 m)', midMax.every((m) => m < 250) && midMean.every((m) => m < 140),
        `most ${midMax.map((m) => m.toFixed(0)).join(', ')} m, on average ${midMean.map((m) => m.toFixed(0)).join(', ')} m`);
      const sum = (k: string) => fields.reduce((a, f) => a + f.chaos[k].reduce((x, y) => x + y, 0), 0), worstFalls = Math.max(...fields.flatMap((f) => f.chaos.fall));
      ok('kart: the rivals race the chaos: they grind the rails and charge-jump the break (falling in seldom: under 1.5 times a kart a race, 4 at most), bash, and get angry; and still all finish',
        sum('grind') >= 6 && sum('cjump') >= 10 && sum('fall') / 24 < 1.5 && worstFalls <= 4 && sum('bash') >= 15 && sum('angry') >= 10 && sum('snatch') >= 3,
        ['grind', 'cjump', 'fall', 'bash', 'angry', 'snatch'].map((k) => `${k} ${sum(k)}`).join(', ') + `; the most falls a kart ${worstFalls}`);

      console.log('\nkart: a whole race (you on autopilot with seven rivals, at 4x), to the podium and the results');
      // (the score's lap stings counted, on the song as it is and the faster one it hands the last lap to)
      await page.eval('(() => { const A = window.__gmRuntime.debug.internals().audio; window.__stings = []; if (A && A.music) { const f = A.music.sting; A.music.sting = function (k) { window.__stings.push([k, this === A.music ? 1 : 0]); return f.apply(this, arguments); }; } return 1; })()');
      const most0 = await K<{ tier: number; charge: number }>('K.solo(false); K.autopilot(true); K.seed(1234); K.restart(); const m = K.state().drift.most; K.go(); K.timeScale(4); return m;');
      let s = await ks(), placesOk = true, placeNote = '', lapsSeen = 0, sawFinish = false, sawPodium: KartState | null = null;
      const energies: number[] = []; let lifted: KartState['music'] = null, before: KartState['music'] = null;
      const wall0 = Date.now();
      while (Date.now() - wall0 < 120_000) {
        await sleep(250); s = await ks();
        lapsSeen = Math.max(lapsSeen, s.lapsDone);
        // (the energy each lap settles at: a change lands on the next bar line)
        if (s.state === 'race' && s.music && s.music.energy != null) energies[s.lapsDone] = s.music.energy;
        if (s.state === 'race' && s.music && !s.music.swapped) before = s.music;
        if (s.state === 'race' && s.music && s.music.swapped && !lifted) lifted = s.music;
        if (s.state === 'race') {
          const racing = s.karts.filter((q) => !q.fin).sort((a, b) => a.place - b.place);
          for (let i = 1; i < racing.length; i++) if (racing[i].prog > racing[i - 1].prog + 0.5) { placesOk = false; placeNote = `${racing[i - 1].name} ${racing[i - 1].prog} ahead of ${racing[i].name} ${racing[i].prog}`; }
        }
        if (s.state === 'finish') sawFinish = true;
        if (s.state === 'podium' && !sawPodium) { await sleep(300); sawPodium = await ks(); }
        if (s.state === 'results') break;
      }
      await K('K.timeScale(1);');
      ok('kart: the laps go by, and the places always agree with how far each kart has got', lapsSeen === 3 && placesOk, placeNote || `${lapsSeen} laps`);
      ok('kart: and the most of your drifts is the race\'s own: none at the start of a race, a tier or more by its end on the autopilot (what the playtest asks)', most0.tier === 0 && most0.charge === 0 && !!s.drift.most && s.drift.most.tier >= 1, `${JSON.stringify(most0)} at the start, ${JSON.stringify(s.drift.most)} at the end`);
      const fin = s.final ?? [];
      // (a rival home in the same step as you, a dead heat, finished too: placed after you, its time yours; 7 Oct)
      const meFin = fin.findIndex((r) => r.n === 0) + 1;
      ok('kart: your finish: the rest\'s times estimated where they are, in order', sawFinish && fin.length === 8 && fin.every((r, i) => i === 0 || r.time >= fin[i - 1].time - 1e-6) && fin.slice(meFin).every((r) => r.est || r.time <= fin[meFin - 1].time + 1e-6),
        fin.map((r) => `${r.name} ${r.time}${r.est ? '*' : ''}`).join(', '));
      ok('kart: then the podium: the top three on the blocks, the rest away, confetti', !!sawPodium && JSON.stringify(sawPodium.podium) === JSON.stringify(fin.slice(0, 3).map((r) => r.n)) && sawPodium.karts.filter((q) => q.visible).map((q) => q.n).sort().join() === fin.slice(0, 3).map((r) => r.n).sort().join() && sawPodium.fx.confetti > 20,
        sawPodium ? `podium ${JSON.stringify(sawPodium.podium)}, ${sawPodium.fx.confetti} confetti` : 'no podium');
      const res = await page.eval<{ place?: number; won?: boolean; assisted?: boolean; timeMs?: number; gm?: number; level?: number }[]>('window.__gm.results || []'), last = res[res.length - 1];
      ok('kart: then the results bar, and the result: your place, time and GM, the laps as the level, marked assisted', s.state === 'results' && !!last && last.place === meFin && last.won === (meFin === 1) && Math.abs((last.timeMs ?? 0) / 1000 - (s.karts[0].finT ?? 0)) < 0.01 && last.gm === ((s as unknown as { run?: { gm: number } }).run?.gm ?? s.gm) && last.level === 3 && last.assisted === true && (await page.eval<number>('document.querySelectorAll("#gm .screen.bar").length')) === 1,
        JSON.stringify(last));
      // the score: louder each lap, a sting on each new lap, and the last lap the same song at 168 BPM from the next bar
      const score = await K<{ same: boolean; bars: number; tempo: number[]; at: { nextBar: number; barDur: number; barDur2: number } | null } | null>('return K.score();');
      const stings = await page.eval<[string, number][]>('window.__stings || []');
      ok('kart: the score follows the laps: energy 1, 2, then 3 on the final lap, with a sting as each new lap starts', energies.join() === '1,2,3' && stings.filter((x) => x[0] === 'lap').length === 2, `energy ${energies.join(' -> ')}, stings ${JSON.stringify(stings)}`);
      const barsOn = lifted && lifted.at && lifted.nextBar != null ? (lifted.nextBar - lifted.at.nextBar) / lifted.at.barDur2 : -1;
      ok('kart: the final lap speeds the score up, 160 to 168 BPM: the same notes, handed over on the next bar line, in time', !!before && before.tempo === 160 && !!lifted && lifted.tempo === 168 && !!score && score.same && score.tempo.join() === '160,168' && barsOn >= 0 && Math.abs(barsOn - Math.round(barsOn)) < 1e-3,
        `${before?.tempo} -> ${lifted?.tempo} BPM at bar ${lifted?.at?.nextBar}, ${barsOn.toFixed(3)} bars of ${lifted?.at?.barDur2} s on; same notes ${score?.same}`);
      // the race's score (8 Oct): the result carries the parts the scores route scores; the results screen counts up to
      // the score kart-score.js gives them against the constants the host handed the game, which are the route's for
      // this world (here the course's, the fixture being unmeasured), and the route's own recompute agrees
      await sleep(2000);
      const R = await page.eval<{ C: KartConstants | null; total: string | null; tier: string | null; shown: string | null; on: number; chip: boolean; st: { score: { total: number; done: boolean } | null; hits: number } }>(`(() => { const q = (s) => document.querySelector(s), k = q('#gm .kscore');
        return { C: window.GameMog.kartScore || null, total: k ? k.dataset.total : null, tier: k ? k.dataset.tier : null, shown: q('#gm .ksn') ? q('#gm .ksn').textContent : null, on: document.querySelectorAll('#gm .ksparts div.on').length, chip: !!q('#gm .ktier.on'), st: window.__gmRuntime.state().kart }; })()`);
      const lr = last as Record<string, unknown> | undefined, Cw = kartConstants({}, fixture, dna(fixture).kart);
      const lib = R.C && lr ? KartScore.score({ timeMs: Number(lr.timeMs), place: Number(lr.place), gm: Number(lr.gm), hits: Number(lr.hits), estimated: lr.estimated === true, progress: lr.progress as number, racer: lr.racer as string }, R.C) : null;
      const chk = R.C && lr ? checkKartRun({ ...lr, assisted: false }, R.C, 3) : null, route = chk && chk.ok ? KartScore.score(chk.run, R.C!) : null;
      ok('kart: the result carries the score\'s parts: your enemies hit (as the race counted them), the share of the race driven (1, home), your racer, the karts and the score\'s version',
        !!lr && lr.kart === true && lr.hits === R.st.hits && typeof lr.hits === 'number' && lr.progress === 1 && lr.estimated === false && typeof lr.racer === 'string' && lr.karts === 8 && lr.scoreV === 1 && lr.laps === 3,
        JSON.stringify({ hits: lr?.hits, progress: lr?.progress, racer: lr?.racer, karts: lr?.karts, scoreV: lr?.scoreV, estimated: lr?.estimated }));
      ok('kart: the results count up to the score (kart-score.js on the result, against the constants the host gave the game: the route\'s own for this world) and the route\'s recompute is the same; every part lit, the tier stamped',
        !!R.C && JSON.stringify(R.C) === JSON.stringify(Cw) && !!lib && !!route && Number(R.total) === lib.total && route.total === lib.total && R.tier === lib.tier.id && R.shown === lib.total.toLocaleString('en-US') && R.on === 4 && R.chip && !!R.st.score?.done,
        `shown ${R.shown}, lib ${lib?.total} (${lib?.time}/${lib?.finish}/${lib?.gm}/${lib?.hits}, ${lib?.tier.name}), route ${route?.total}, constants ${R.C?.source}`);
      const e1 = [...(await errs()), ...page.errors];
      ok('kart: a whole kart race raises no error', e1.length === 0, e1.join(' | '));
    }, { timeoutMs: 420_000 });

    console.log('\nkart: the platform\'s playtest drives it');
    const report = await playtestWorld(`${BASE}/d/${kid}/play`);
    ok('kart: the playtest races it on the autopilot: three laps, nobody stuck, at speed, a cover mid-drift, and a result', report.ok && report.levelReached === 3 && (report.fps ?? 0) >= 30 && !!report.cover && report.cover.length > 14_000,
      `${report.fps} fps, ${report.levelReached} laps${report.problems.length ? `: ${report.problems.join(' | ')}` : ''}`);
    // assisted (8 Oct: the flag was set afresh at each count from the autopilot and the time scale as they stood then, so
    // a slow motion switched on and off again before the race went unmarked): any test control used at any point of a
    // session marks that race and every later one, until the page is loaded again
    console.log('\nkart: a test control marks the session, until a reload');
    await withBrowser(async (page) => {
      const ks = () => page.eval<KartState>('window.__gmRuntime.state().kart');
      const K = <T>(js: string) => page.eval<T>(`(() => { const K = window.__gmRuntime.debug.kart(); ${js} })()`);
      const fresh = async () => {
        await page.goto(`${BASE}/d/${kid}/play`);
        for (let i = 0; i < 100 && !(await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)); i++) await sleep(200);
        await page.eval(`window.postMessage({ source: 'gamemog-host', type: 'play' }, '*')`); await sleep(400);
      };
      // (a race begun the player's way: Enter, and a key past the flyover)
      const begin = async () => { let q = await ks(); for (let i = 0; i < 8 && q.state !== 'flyover' && q.state !== 'countdown'; i++) { await page.key('Enter'); await sleep(450); q = await ks(); } await page.key('Space'); await sleep(250); return ks(); };
      await fresh(); const clean = await begin();
      await fresh();
      await page.eval('window.__gmRuntime.debug.timeScale(4); window.__gmRuntime.debug.timeScale(1); 1');
      const slowed = await begin();
      // (on to that race's results, by test controls: the session is marked already; then the next race the player's way)
      await K('K.go(); K.lap(2); K.place(K.state().L - 6, 0, 30, 0, 0); return 1;');
      let q = await ks(); for (let i = 0; i < 200 && q.state !== 'results'; i++) { await sleep(200); q = await ks(); }
      const res = await page.eval<{ assisted?: boolean }[]>('window.__gm.results || []'), first = res[res.length - 1];
      const next = await begin();
      ok('kart: a test control used at any point marks every later race as assisted, until a reload: a race begun on the keys on a fresh page is not; a slow motion switched on and off again before the race marks it (8 Oct: unmarked), its result too; and the next race begun on the keys after it is marked as well',
        clean.state === 'countdown' && clean.assisted === false && slowed.state === 'countdown' && slowed.assisted === true && q.state === 'results' && first?.assisted === true && next.state === 'countdown' && next.assisted === true,
        `fresh: ${clean.state}, assisted ${clean.assisted}; slowed and let go before it: ${slowed.state}, assisted ${slowed.assisted}, result assisted ${first?.assisted}; the next race: ${next.state}, assisted ${next.assisted}`);
    }, { timeoutMs: 180_000 });
    await kartPolishChecks(kid);
    await kartThemeChecks(fixture);
    await kartScoreRaceChecks();
    await kartScoreAheadChecks();
    await kartFeelChecks();
    await kartPhoneLoadChecks();
    await kartDiagChecks();
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(kid); }
}

/* ------------------------------------------------------ kart: the diagnostic switches -- */
// Chrome for Android still crashed on the owner's Fold 5 where Firefox ran (8 Oct): ?kdiag= switches on the game page
// (app/g/[slug]/kart-diag.tsx) ride into the play frame, where lib/runtime/kart-guard.js reads them and each takes a part
// of the race out whole. Each one here, on Meme Kart as a phone loads it: the race boots, races, throws nothing, and the
// part is not there (what the page made, counted underneath it: the sound contexts, the shaders' defines, the
// multisampled buffers); and the guard's trail of steps reaches the page
async function kartDiagChecks() {
  const code = readFileSync(new URL('../worlds/meme-kart.js', import.meta.url), 'utf8'), meta = JSON.parse(readFileSync(new URL('../worlds/meme-kart.json', import.meta.url), 'utf8'));
  const id = randomUUID();
  insertDraft({ id, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code, meta: { ...meta, mode: 'kart', runtime: 1 } } as never);
  console.log('\nkart: the diagnostic switches (?kdiag=, Meme Kart as a phone loads it)');
  const PRE = `(() => {
    const mm = window.matchMedia.bind(window); window.matchMedia = (q) => { const r = mm(q); if (!/pointer:\\s*coarse/.test(q)) return r; const o = Object.create(r); Object.defineProperty(o, 'matches', { value: true }); Object.defineProperty(o, 'media', { value: q }); return o; };
    const D = window.__diag = { ac: 0, oac: 0, shadow: 0, morph: 0, msaa: 0, steps: [], frames: 0 };
    ['AudioContext', 'webkitAudioContext', 'OfflineAudioContext'].forEach((n) => { const C = window[n]; if (!C) return; window[n] = class extends C { constructor(...a) { super(...a); D[n === 'OfflineAudioContext' ? 'oac' : 'ac']++; } }; });
    const ss = WebGL2RenderingContext.prototype.shaderSource;
    WebGL2RenderingContext.prototype.shaderSource = function (sh, src) { if (/#define USE_SHADOWMAP/.test(src)) D.shadow++; if (/#define USE_MORPHTARGETS/.test(src)) D.morph++; return ss.apply(this, arguments); };
    const rm = WebGL2RenderingContext.prototype.renderbufferStorageMultisample;
    WebGL2RenderingContext.prototype.renderbufferStorageMultisample = function (t, n) { if (n > 0) D.msaa++; return rm.apply(this, arguments); };
    addEventListener('message', (e) => { if (e.data && e.data.type === 'kart-step') D.steps.push(e.data.step); });
    (function t() { D.frames++; requestAnimationFrame(t); })();
  })();`;
  type Got = { ready: boolean; errors: string[]; state: string | null; frames: number; ac: number; oac: number; shadow: number; morph: number; msaa: number; theme: unknown; items: boolean; prep: { done: boolean; of: number };
    levels: string[]; built: number; cinematic: boolean; pr: number; ka: boolean; gpu: string | null; native: boolean; diag: string | null; steps: string[]; trail: string[] };
  const boot = async (page: Page, sw: string): Promise<Got> => {
    await page.goto(`${BASE}/d/${id}/play?preview=1${sw ? `&kdiag=${sw}` : ''}`);
    let ready = false;
    for (let i = 0; i < 300 && !ready; i++) { ready = await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false); if (!ready) await sleep(200); }
    // (the start screen's preparations done, or none to do; then a key, which wakes the sound, and a race)
    for (let i = 0; i < 200 && ready; i++) { const d = await page.eval<boolean>('!!window.__gmRuntime.state().kart.prep.done').catch(() => false); if (d) break; await sleep(100); }
    await page.key('Enter'); await sleep(300);
    await page.eval('(() => { const K = window.__gmRuntime.debug.kart(); K.restart(); K.go(); return 1; })()').catch(() => 0);
    const f0 = await page.eval<number>('window.__diag.frames').catch(() => 0);
    await sleep(3000);
    return page.eval<Got>(`(() => {
      const s = window.__gmRuntime.state(), k = s.kart, D = window.__diag, K = window.__gmRuntime.debug.kart(), g = window.KartGuard ? window.KartGuard.state() : {};
      return { ready: !!window.__gm.ready, errors: window.__gm.errors.slice(), state: k ? k.state : null, frames: D.frames - ${f0}, ac: D.ac, oac: D.oac, shadow: D.shadow, morph: D.morph, msaa: D.msaa,
        theme: k.theme, items: k.item.on, prep: { done: k.prep.done, of: k.prep.of }, levels: k.karts.map((q) => q.level), built: k.roster.built, cinematic: s.render.cinematic, pr: s.render.pixelRatio,
        ka: !!K.audio(), gpu: g.gpu || null, native: /native code/.test(String(window.fetch)), diag: g.diag || null, steps: D.steps.slice(), trail: g.trail || [] };
    })()`);
  };
  try {
    await withBrowser(async (page) => {
      await page.emulate({ width: 390, height: 844, mobile: true, dpr: 2.625 });
      await page.preload(PRE);
      const base = await boot(page, '');
      const races = (g: Got) => g.ready && g.errors.length === 0 && g.state === 'race' && g.frames > 20;
      const sum = (g: Got) => `${g.state}, ${g.frames} frames, ${g.errors.length} errors; ac ${g.ac}, oac ${g.oac}, theme ${g.theme ? 'on' : 'off'}, sfx ${g.ka}, items ${g.items}, prep ${g.prep.done}/${g.prep.of}, levels ${[...new Set(g.levels)].join('/')} (${g.built} built), post ${g.cinematic}, msaa ${g.msaa}, shadow ${g.shadow}, morph ${g.morph}, dpr ${g.pr}, gpu ${g.gpu ? 'read' : 'none'}, fetch ${g.native ? 'native' : 'wrapped'}, switches ${g.diag}${g.errors.length ? `; ${g.errors.join(' | ')}` : ''}`;
      ok('kart diag: with no switch, the race has every part: score (offline renders), engines, items, preparations, near levels, post, shadows, expressions, the guard', races(base) && base.oac > 0 && !!base.theme && base.ka && base.items && base.prep.of > 0 && base.levels.some((l) => l !== 'far') && base.cinematic && base.shadow > 0 && base.morph > 0 && !!base.gpu && !base.native && base.diag === null, sum(base));
      ok('kart diag: the guard\'s steps reach the page, boot phase by phase (renderer, world, racers, race, prep, first frame), and its trail keeps the last ones with their times', ['renderer: making', 'world: building', 'race: made', 'first frame'].every((s) => base.steps.some((x) => x.startsWith(s))) && base.steps.some((x) => /^racer \w+ far: built/.test(x)) && base.steps.some((x) => /^prep: (next )?compile/.test(x)) && base.trail.length >= 8 && base.trail.every((x) => / @\d+/.test(x)), `${base.steps.length} steps; trail: ${base.trail.slice(-4).join(' | ')}`);
      const want: [string, string, (g: Got) => boolean][] = [
        ['nomusic', 'no score and no OfflineAudioContext', (g) => !g.theme && g.oac === 0 && g.ka],
        ['nosfx', 'no engines or effects, the score still on', (g) => !g.ka && !!g.theme && g.ac > 0],
        ['noaudio', 'no AudioContext and no OfflineAudioContext at all', (g) => g.ac === 0 && g.oac === 0 && !g.theme && !g.ka],
        ['noprep', 'nothing prepared on the start screen', (g) => g.prep.done && g.prep.of === 0],
        ['noitems', 'no items', (g) => !g.items],
        ['lowlod', 'every racer at its far level, nothing else built', (g) => g.levels.every((l) => l === 'far') && g.built === 8],
        ['nopost', 'no post target, no multisampled buffer', (g) => !g.cinematic && g.msaa === 0],
        ['noshadow', 'no shadow-mapped shader', (g) => g.shadow === 0],
        ['nomorph', 'no morph-target shader', (g) => g.morph === 0],
        ['noguard', 'none of the guard\'s wrappers (its steps still reach the page)', (g) => g.native && !g.gpu && g.steps.includes('first frame') && g.trail.length > 0],
        ['lowdpr', 'one pixel a point', (g) => g.pr === 1],
      ];
      for (const [sw, what, gone] of want) {
        const g = await boot(page, sw);
        ok(`kart diag: ?kdiag=${sw} boots and races with ${what}`, races(g) && gone(g) && g.diag === sw, sum(g));
      }
      const all = await boot(page, 'noaudio,noprep,noitems,lowlod,nopost,noshadow,nomorph,lowdpr');
      ok('kart diag: every switch at once still boots and races', races(all) && all.ac === 0 && !all.items && all.levels.every((l) => l === 'far') && !all.cinematic && all.shadow === 0 && all.morph === 0 && all.pr === 1, sum(all));
    }, { width: 1280, height: 800, timeoutMs: 400_000 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(id); }
}

/* ------------------------------------------------------ kart: a phone's load -- */
// Meme Kart crashed while loading on the owner's Galaxy Z Fold 5 (8 Oct): its crowd was built and filmed on the device
// (six people packs, 96 pictures decoded, ~350 MB of textures). The crowd is baked now (scripts/kart-crowd-bake.ts):
// on the phone path (Android, a touch screen, the Fold's cover screen) the world must load only its baked sheet, start
// without the multisampled target and with a 1024 shadow map, let its decoded pictures go once they are up, and send
// up no more than 120 MB of textures by the end of the start screen's preparations
async function kartPhoneLoadChecks() {
  const code = readFileSync(new URL('../worlds/meme-kart.js', import.meta.url), 'utf8'), meta = JSON.parse(readFileSync(new URL('../worlds/meme-kart.json', import.meta.url), 'utf8'));
  const id = randomUUID();
  insertDraft({ id, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code, meta: { ...meta, mode: 'kart', runtime: 1 } } as never);
  console.log('\nkart: a phone\'s load (Meme Kart, as a Fold 5\'s cover screen)');
  const PRE = `(() => {
    try { Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => 'Mozilla/5.0 (Linux; Android 14; SM-F946B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36' }); } catch (e) {}
    const mm = window.matchMedia.bind(window); window.matchMedia = (q) => { const r = mm(q); if (/pointer:\\s*coarse/.test(q)) return Object.assign(Object.create(r), { matches: true, media: q }); return r; };
    const P = window.__load = { tex: 0, bm: 0, urls: [] };
    const f0 = window.fetch; window.fetch = function (u) { P.urls.push(String(u && u.url || u).replace(/^.*\\/assets\\//, '').replace(/\\?.*$/, '')); return f0.apply(this, arguments); };
    const cib = window.createImageBitmap; window.createImageBitmap = function () { return cib.apply(this, arguments).then((b) => { P.bm += b.width * b.height * 4; return b; }); };
    const px = (internal, type) => (type === 0x140B || internal === 0x881A || internal === 0x8C3A ? 8 : type === 0x1406 || internal === 0x8814 ? 16 : 4);
    [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype].forEach((pr) => {
      const tI = pr.texImage2D, tS = pr.texStorage2D, tS3 = pr.texStorage3D;
      pr.texImage2D = function (t, l, internal, a, b, c, d, e) { if (l === 0) { let w, h, ty; if (arguments.length >= 8) { w = a; h = b; ty = e; } else { const src = d || c; w = src && src.width || 0; h = src && src.height || 0; ty = b; } P.tex += w * h * px(internal, ty); } return tI.apply(this, arguments); };
      if (tS) pr.texStorage2D = function (t, lv, internal, w, h) { P.tex += w * h * px(internal) * (lv > 1 ? 1.33 : 1) * (t === 0x8513 ? 6 : 1); return tS.apply(this, arguments); };
      if (tS3) pr.texStorage3D = function (t, lv, internal, w, h, dd) { P.tex += w * h * dd * px(internal); return tS3.apply(this, arguments); };
    });
    document.addEventListener('DOMContentLoaded', () => {
      const T = window.THREE; if (!T) return; const R0 = T.WebGLRenderer;
      T.WebGLRenderer = function (o) { const r = new R0(o); const rd = r.render; r.render = function (sc) { if (sc && sc.isScene && sc.fog && !window.__scene) window.__scene = sc; return rd.apply(this, arguments); }; return r; };
      T.WebGLRenderer.prototype = R0.prototype;
    });
  })();`;
  try {
    await withBrowser(async (page) => {
      await page.emulate({ width: 344, height: 882, mobile: true, dpr: 2.625 });
      await page.preload(PRE);
      await page.goto(`${BASE}/d/${id}/play?preview=1`);
      for (let i = 0; i < 300 && !(await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)); i++) await sleep(200);
      let st: any = null;
      for (let i = 0; i < 300 && !(st && st.kart && st.kart.prep && st.kart.prep.done); i++) { await sleep(100); st = await page.eval<any>('window.__gmRuntime.state()').catch(() => null); }
      const L = await page.eval<{ tex: number; bm: number; urls: string[] }>('window.__load');
      const crowd = await page.eval<any>('(() => { let c = null, sh = 0; window.__scene.traverse((q) => { if (q.userData && q.userData.crowd) c = q.userData.crowd; if (q.isDirectionalLight && q.castShadow) sh = q.shadow.mapSize.x; }); return c && Object.assign({ shadow: sh }, c); })()').catch(() => null);
      const libs = [...new Set(L.urls.filter((u) => /\//.test(u)).map((u) => u.split('/')[0]))];
      const texMB = Math.round(L.tex / 1048576), bmMB = Math.round(L.bm / 1048576);
      ok('kart: a phone loads Meme Kart\'s crowd as its one baked sheet (crowd-meme-kart-lo), and not a human pack or body', libs.length === 1 && libs[0] === 'crowd-meme-kart-lo' && crowd && crowd.baked === true, `${libs.join(', ')}${crowd ? `; crowd ${JSON.stringify(crowd)}` : ''}`);
      ok('kart: a phone starts without the multisampled target, with a 1024 shadow map, and lets its decoded pictures go once they are up', st && st.render && st.render.quality === 'low' && st.render.msaa === false && crowd && crowd.shadow === 1024 && st.kart.prep.closed >= 1, JSON.stringify({ msaa: st?.render?.msaa, shadow: crowd?.shadow, quality: st?.render?.quality, closed: st?.kart?.prep?.closed }));
      ok('kart: a phone sends up at most 120 MB of textures by the end of the start screen\'s preparations (it was 351 MB when the crowd was filmed on it)', texMB <= 120 && bmMB <= 16, `${texMB} MB of textures, ${bmMB} MB of pictures decoded`);
    }, { width: 1280, height: 800, timeoutMs: 180_000 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(id); }
}

/* -------------------------------------------------------- kart: enemies hit -- */
// The race's score counts the enemies you hit (the owner, 8 Oct; lib/runtime/kart-score.js): every bash you land and
// every item or trap of yours that lands on a rival (a laser, a rug, the WHALE DUMP, a touch of Diamond Hands or To
// The Moon); never one a rival shrugs off (a Cold Wallet, its second untouchable), never your own. In the sim, so a
// race run again counts the same.
async function kartHitsChecks(K: <T>(js: string) => Promise<T>) {
  const fresh = (seed = 5) => `K.solo(true); K.seed(${seed}); K.restart(); K.go(); K.solo(true); K.run(0.05, { gas: true });`;
  const stepper = `const EV = []; const step = (inp, n) => { for (let i = 0; i < (n || 1); i++) { K.run(1 / 120, inp); for (const e of K.events(true)) EV.push([S, ...e]); S++; } }; let S = 0;
    const mine = () => EV.filter((x) => (x[1] === 'bash' && x[2] === 0) || (x[1] === 'hit' && x[4] === 0 && x[2] !== 0)).length;`;
  console.log('\nkart: enemies hit (the score\'s hits)');
  const sc = await K<Record<string, { dealt: number; events: number; hits: string[] }>>(`const out = {};
    const done = (name, d0, EV, n) => { out[name] = { dealt: K.kart(0).dealt - d0, events: n, hits: EV.filter((x) => x[1] === 'hit').map((x) => x[3] + '>' + x[2] + ' by ' + x[4]) }; };
    { ${fresh()} ${stepper} K.place(120, 0, 20, 0, 1); K.place(90, 1.5, 20, 0, 0); const d0 = K.kart(0).dealt; K.give('laser', 0); K.events(true); K.use(0, 0); step({ gas: true }, 360); done('laser', d0, EV, mine()); }
    { ${fresh()} ${stepper} K.place(120, 0, 20, 0, 1); K.give('wallet', 1); K.use(1); K.place(90, 1.5, 20, 0, 0); const d0 = K.kart(0).dealt; K.give('laser', 0); K.events(true); K.use(0, 0); step({ gas: true }, 360); done('laserWallet', d0, EV, mine()); }
    { ${fresh()} ${stepper} K.place(100, 0, 20, 0, 0); const d0 = K.kart(0).dealt; K.give('rug', 0); K.use(0, 0); const tr = K.items().traps[0]; K.place(300, 0, 20, 0, 0); K.place(tr.d - 3, tr.x, 25, 0, 1); K.events(true); step({ gas: true }, 300); done('rug', d0, EV, mine()); }
    { ${fresh()} ${stepper} K.run(20.5, {}); K.place(100, 0, 31, 0, 1); K.place(101, 2.5, 31, 0, 2); K.place(40, 2, 20, 0, 0); const d0 = K.kart(0).dealt; K.give('whale', 0); K.events(true); K.use(0); step({ gas: true }, 420); done('whale', d0, EV, mine()); }
    { ${fresh()} ${stepper} K.place(200, 0, 20, 0, 0); K.place(200, 1.5, 20, 0, 1); const d0 = K.kart(0).dealt; K.events(true); step({ gas: true, drift: true, steer: 1 }, 2); step({ gas: true, steer: 1 }, 38); done('bash', d0, EV, mine()); }
    { ${fresh()} ${stepper} K.place(200, 0, 20, 0, 0); K.place(203, 0.3, 12, 0, 1); const d0 = K.kart(0).dealt; K.give('diamond', 0); K.use(0); K.events(true); step({ gas: true }, 240); done('touch', d0, EV, mine()); }
    { ${fresh()} ${stepper} K.place(100, 0, 20, 0, 0); const d0 = K.kart(0).dealt; K.give('rug', 0); K.use(0, 0); const tr = K.items().traps[0]; K.run(2, {}); K.place(tr.d - 12, tr.x, 20, 0, 0); K.events(true); step({ gas: true }, 300); done('ownRug', d0, EV, mine()); }
    return out;`);
  const want: Record<string, number> = { laser: 1, laserWallet: 0, rug: 1, whale: 2, bash: 1, touch: 1, ownRug: 0 };
  ok('kart: enemies hit: one for a laser of yours that lands, none when a Cold Wallet blocks it; one for your rug a rival drives onto, none for your own; one for each kart your WHALE DUMP flips (two); one for a bash; one for a touch of Diamond Hands; and the count is the events\', bash and hit by you, exactly',
    Object.entries(want).every(([k, n]) => sc[k] && sc[k].dealt === n && sc[k].events === n), Object.entries(sc).map(([k, v]) => `${k} ${v.dealt}/${v.events} (${v.hits.join(', ') || 'no hit'})`).join('; '));
  // whole races of the field (the rivals bash and use every item at each other): each kart's count is its bashes and
  // its hits on rivals, read off the events; and the same seed counts the same
  const races = await K<{ dealt: number[]; byEv: number[]; kinds: Record<string, number> }[]>('return [21, 22, 23, 24].map((s) => { const r = K.headless(s, 300, true); return { dealt: r.dealt, byEv: r.hitsByEvents, kinds: r.hitKinds }; });');
  const again = await K<number[]>('return K.headless(21, 300, true).dealt;');
  const kinds: Record<string, number> = {}; races.forEach((r) => Object.entries(r.kinds).forEach(([k, n]) => { kinds[k] = (kinds[k] ?? 0) + n; }));
  ok('kart: in four whole races of eight karts every kart\'s enemies hit equals its bashes and its hits on rivals in the events, and a race run again from its seed counts the same',
    races.every((r) => r.dealt.join() === r.byEv.join()) && races.flatMap((r) => r.dealt).reduce((a, b) => a + b, 0) > 40 && again.join() === races[0].dealt.join() && Object.keys(kinds).length >= 4,
    `${races.map((r) => r.dealt.join(' ')).join(' | ')}; by kind ${JSON.stringify(kinds)}; again ${again.join(' ')}`);
}

/* ----------------------------------------------------------- kart score -- */
// The race's own score (kart.score, lib/runtime/kart-music.js; the owner, 7 Oct: "music is too generic, needs to feel
// upbeat and FUN"): the fixture again with kart.score and no music. The start screen's groove, the intro under the count
// landing its downbeat on GO, the laps lifting it, the final lap in B at 168 BPM with its sting, the finish's sting, the
// podium's fanfare or shrug, the groove again on the results; the engines under it and a hit ducking it.
async function kartThemeChecks(fixture: string) {
  const code = fixture.replace(/\n\s*music: \{[^\n]*\},\n/, '\n').replace(/kart: \{ laps: 3,/, 'kart: { score: true, laps: 3,');
  const id = randomUUID();
  insertDraft({ id, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code,
    meta: { title: 'Greybox Ring', tagline: 'The kart fixture, its own score', blurb: 'Runtime check.', genre: 'Racing', cast: [{ name: 'Pepe', color: '#4FA03A' }], palette: { sky: '#A9D3F2', ground: '#86B05A', accent: '#7CFF4F' }, runtime: 1 } });
  try {
    await withBrowser(async (page) => {
      await page.goto(`${BASE}/d/${id}/play`);
      for (let i = 0; i < 100 && !(await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)); i++) await sleep(200);
      const ks = () => page.eval<KartState>('window.__gmRuntime.state().kart');
      const K = <T>(js: string) => page.eval<T>(`(() => { const K = window.__gmRuntime.debug.kart(), D = window.__gmRuntime.debug; ${js} })()`);
      const errs = async () => [...(await page.eval<string[]>('window.__gm.errors')), ...page.errors];
      console.log('\nkart: the race\'s own score (kart.score)');
      ok('kart: kart.score asks for the race\'s own score, and only the kart runtime carries it', !code.includes('music: {') && code.includes('score: true') && (await ks()).music === null && (await errs()).length === 0, (await errs()).join(' | '));
      // the start screen: its groove, the drums thinned and quieter, as soon as there is sound
      await page.eval(`window.postMessage({ source: 'gamemog-host', type: 'play' }, '*')`); await sleep(400);
      await K('D.audio();'); await sleep(1200);
      const t0 = (await ks()).theme;
      ok('kart: kart.score plays the race\'s own score: the start screen hears its groove (lap 0, Bb, 160 BPM), standing in for the platform\'s player',
        !!t0 && t0.mode === 'groove' && !!t0.playing && t0.lap === 0 && t0.key === 'Bb' && t0.tempo === 160 && (await page.eval<boolean>('!!window.__gmRuntime.debug.internals().audio.music.kart')), JSON.stringify(t0));
      // the count: the intro, its last bar line GO
      await K('K.seed(7); K.restart();'); await sleep(200);
      const tc = (await ks()).theme;
      for (let i = 0; i < 100 && (await ks()).phase !== 'race'; i++) await sleep(50);
      await sleep(300);
      const tg = (await ks()).theme;
      ok('kart: the count is the score\'s intro, two bars, so the verse\'s first downbeat lands on GO (within 60 ms), with the go sting on it',
        tc?.mode === 'count' && tc.section === 'intro' && tg?.goAt != null && tg.go != null && Math.abs(tg.go - tg.goAt) < 0.06 && !!tg.stings?.some((x) => x[0] === 'go'),
        `count ${tc?.mode}/${tc?.section}; GO heard at ${tg?.go}, the downbeat at ${tg?.goAt}: ${tg?.go != null && tg?.goAt != null ? ((tg.go - tg.goAt) * 1000).toFixed(0) : '?'} ms; ${JSON.stringify(tg?.stings)}`);
      // the mix: the engines under it, a hit ducks it
      await K('K.autopilot(true);'); await sleep(1500);
      const mix = await page.eval<{ master: number; peak: number; eng: number; duck: number }>(`new Promise((res) => {
        const A = window.__gmRuntime.debug.internals().audio, ac = A.ctx, tap = (n) => { const a = ac.createAnalyser(); a.fftSize = 2048; n.connect(a); return a; }, m = tap(A.master), e = tap(A.engines), b = new Float32Array(2048);
        let sm = 0, se = 0, n = 0, pk = 0, duck = 1;
        const t = setInterval(() => { m.getFloatTimeDomainData(b); for (let i = 0; i < b.length; i++) { sm += b[i] * b[i]; pk = Math.max(pk, Math.abs(b[i])); } e.getFloatTimeDomainData(b); for (let i = 0; i < b.length; i++) se += b[i] * b[i] * 0.3025; n += b.length; duck = Math.min(duck, A.music.duckLevel()); }, 50);
        window.__gmRuntime.debug.kart().hit('laser', 0);
        setTimeout(() => { clearInterval(t); res({ master: 10 * Math.log10(sm / n), peak: 20 * Math.log10(pk), eng: 10 * Math.log10(se / n), duck }); }, 4000); })`);
      ok('kart: and under it the engines (at least 4 dB under the master), the master\'s peaks under -3 dBFS before its limiter, the score ducked for a hit', mix.eng < mix.master - 4 && mix.peak < -3 && mix.duck < 0.9,
        `master ${mix.master.toFixed(1)} dB RMS, engines ${mix.eng.toFixed(1)}, peak ${mix.peak.toFixed(1)} dBFS, duck ${mix.duck.toFixed(2)}`);
      // the race on, at 4x: the laps lift it, the final lap in B at 168, then the finish, the podium, the results
      await K('K.timeScale(4);');
      const laps: number[] = []; let fin: KartState['theme'] = null, pod: KartState['theme'] = null, res: KartState['theme'] = null, s = await ks();
      const wall0 = Date.now();
      while (Date.now() - wall0 < 150_000) {
        await sleep(250); s = await ks();
        if (s.state === 'race' && s.theme?.lap != null && laps[laps.length - 1] !== s.theme.lap) laps.push(s.theme.lap);
        // (the finish, the podium and the results at 1x, as they are heard)
        if (s.state === 'finish' && !fin) { await K('K.timeScale(1);'); await sleep(400); fin = (await ks()).theme; }
        if (s.state === 'podium' && !pod) { await sleep(400); pod = (await ks()).theme; }
        if (s.state === 'results') { await sleep(1500); res = (await ks()).theme; break; }
      }
      await K('K.timeScale(1);');
      const st = res?.stings ?? [], names = st.map((x) => x[0]);
      ok('kart: the laps lift it (1, 2, then 3), a lap sting, and the final lap\'s: up a semitone to B at 168 BPM', laps.join() === '1,2,3' && names.filter((n) => n === 'lap').length === 1 && names.includes('final') && !!fin && fin.key === 'B' && fin.tempo === 168,
        `laps ${laps.join(' -> ')}; at the finish ${fin?.key} ${fin?.tempo} BPM; ${names.join(', ')}`);
      ok('kart: your finish has its sting over the score, the podium a fanfare or a shrug over the score faded out (then the start screen\'s groove as it ends), and the results that groove on',
        names.includes('finish') && !!fin?.playing && (names.includes('win') || names.includes('lose')) && !!pod && (pod.duck ?? 1) < 0.1 && !!res && res.mode === 'results' && !!res.playing && res.lap === 0,
        `finish ${fin?.mode} playing ${fin?.playing}; podium ${pod?.mode} duck ${pod?.duck}; results ${res?.mode} playing ${res?.playing} lap ${res?.lap}`);
      const e = await errs();
      ok('kart: a whole race to its own score raises no error', e.length === 0, e.join(' | '));
    }, { timeoutMs: 300_000 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(id); }
}

/* ------------------------------------------------------ kart score race -- */
// The owner, 7 Oct (round 3): "does the music stop randomly around 0:44". The score's notes are made on the page's
// main thread ahead of the audio clock, and a main thread busy for longer than what was scheduled ahead left it silent,
// then played every missed note at once. A whole race's score rendered offline (kart-music.js alone, 24 kHz), driven
// the way the race drives it: the start screen's groove, the count's intro, GO, three laps of 44 s with the lap and
// final stings and the lifts on their bar lines, a duck for a hit every 2.3 s, the finish's sting, the podium (the score
// stopped under its sting, by design, and the groove back in as it ends), the results' groove; and the page "stalled" (no update(), so nothing scheduled)
// for 0.9 s mid-lap, 0.8 s across lap 1's line and 2 s on the final lap. A dropout is a 50 ms slot 18 dB under the
// race's median (the plate's tail alone). (In an OfflineAudioContext the score plays note by note, its old way: the mix
// and the form are checked here; rendered ahead, as a page plays it, at real time in kartScoreAheadChecks.)
async function kartScoreRaceChecks() {
  const theme = readFileSync(new URL('../lib/runtime/kart-music.js', import.meta.url), 'utf8');
  const GO = 9, LAP = 44, FIN = GO + 3 * LAP, POD = FIN + 2.5, RES = POD + 5.5, LONG: [number, number] = [GO + 2 * LAP + 12, 2];
  type Race = { median: number; dropouts: [number, number][]; burst: number[]; skipped: number; laps: number[]; end: { lap: number; key: string; playing: boolean } };
  const r = await withBrowser(async (page) => {
    await page.goto('about:blank');
    return page.eval<Race>(`(async () => {
      ${theme}
      const sr = 24000, END = 160, ac = new OfflineAudioContext(2, END * sr, sr), M = kartMusic.create(ac, ac.destination, { timer: false, seed: 1607 });
      const GO = ${GO}, LAP = ${LAP}, FIN = ${FIN}, POD = ${POD}, RES = ${RES}, STALLS = [[GO + 21, 0.9], [GO + LAP - 0.05, 0.8], ${JSON.stringify(LONG)}];
      const DUCKS = [[4, 0.25], [9, 0.12], [6, 0.25], [3, 0.12], [3, 0.25], [4, 0.25]], ev = [], laps = [];
      const at = (t, f) => ev.push([t, f]);
      at(0.05, () => { M.setLap(0); M.start(0.05, 'loop'); });
      at(GO - 3, () => { M.setLap(1); M.start(GO - 3, 'intro'); });
      at(GO, () => M.sting('go'));
      at(GO + LAP, () => { M.sting('lap'); M.setLap(2); });
      at(GO + 2 * LAP, () => { M.setLap(3); M.sting('final'); });
      for (let t = GO + 1.3, i = 0; t < FIN - 0.5; t += 2.3, i++) at(t, () => M.duck(DUCKS[i % 6][0], DUCKS[i % 6][1]));
      at(FIN, () => M.sting('finish'));
      let after = 0;
      at(POD, () => { M.stop(0.5); after = POD + M.sting('lose'); M.setLap(0); M.start(after, 'loop'); });
      at(RES, () => { M.setLap(0); if (!M.state.playing || M.state.stopping) M.start(Math.max(RES + 0.05, after), 'loop'); });
      ev.sort((a, b) => a[0] - b[0]);
      const stalled = (t) => STALLS.some(([s, d]) => t >= s && t < s + d);
      for (let t = 0.05; t < END - 0.1; t = +(t + 0.05).toFixed(3)) (function (tt) {
        ac.suspend(tt).then(() => {
          // (in a stall nothing on the page runs: what the race asks waits for its end, as a frame does)
          if (!stalled(tt)) { while (ev.length && ev[0][0] <= tt + 1e-6) ev.shift()[1](); M.update(null); if (laps[laps.length - 1] !== M.state.lap) laps.push(M.state.lap); }
          ac.resume();
        });
      })(+t.toFixed(3));
      const buf = await ac.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1), n = sr / 20, slots = [];
      for (let i = 0; i + n <= L.length; i += n) { let s = 0; for (let j = i; j < i + n; j++) s += L[j] * L[j] + R[j] * R[j]; slots.push(10 * Math.log10(Math.max(1e-20, s / (2 * n)))); }
      const race = slots.filter((x, i) => i * 0.05 > GO && i * 0.05 < FIN).sort((a, b) => a - b), med = race[race.length >> 1], runs = [];
      let cur = null;
      slots.forEach((db, i) => { const t = i * 0.05; if (db < med - 18) { if (!cur) cur = [t, t + 0.05]; else cur[1] = t + 0.05; } else if (cur) { runs.push(cur); cur = null; } });
      if (cur) runs.push(cur);
      // (the loudest slot in the 2 s after each stall, over the median: the missed notes played at once is a burst)
      const burst = STALLS.map(([s, d]) => { let m = -200; for (let i = Math.floor((s + d) / 0.05); i < Math.floor((s + d + 2) / 0.05); i++) m = Math.max(m, slots[i]); return +(m - med).toFixed(1); });
      return { median: +med.toFixed(1), dropouts: runs.filter((x) => x[1] - x[0] > 0.4).map((x) => [+x[0].toFixed(2), +x[1].toFixed(2)]), burst, skipped: M.state.skipped, laps, end: { lap: M.state.lap, key: M.state.key, playing: M.state.playing } };
    })()`);
  }, { width: 400, height: 300, timeoutMs: 240_000 });
  console.log('\nkart: the score through a whole race (owner round 3: "does the music stop randomly around 0:44")');
  const inLong = (x: [number, number]) => x[0] >= LONG[0] && x[1] <= LONG[0] + LONG[1] + 0.3;
  const bad = r.dropouts.filter((x) => !inLong(x)), long = r.dropouts.filter(inLong);
  ok('kart: the score never drops out for over 0.4 s from the start screen to the results (the count, GO, three laps and the 48 s loop\'s wrap, the lap and final stings, a duck every 2.3 s, the finish, the podium\'s sting and the groove back in after it), not through the page busy for 0.9 s mid-lap or 0.8 s across lap 1\'s line either',
    bad.length === 0 && r.laps.join() === '0,1,2,3,0' && r.end.playing, `dropouts ${JSON.stringify(r.dropouts)} (median ${r.median} dB); laps ${r.laps.join(' -> ')}`);
  ok('kart: played note by note (the way it plays in an OfflineAudioContext, or where a page has none), the page busy for 2 s: the score holds a second of it, then comes back in on the beat it has reached (the missed steps skipped, not played at once: no slot over 6 dB above the median after any stall)',
    r.skipped > 0 && long.every((x) => x[1] - x[0] <= 1.1) && r.burst.every((b) => b < 6), `${r.skipped} steps skipped; dropout ${JSON.stringify(long)}; after each stall the loudest slot ${r.burst.join(', ')} dB over the median`);
}

/* ------------------------------------------------------ kart score ahead -- */
// The owner, 8 Oct, after a longer lookahead: "music fix isn't working. music stops randomly in game" (his Mac busy with
// other Chrome sessions). On a page the score is now rendered ahead (kart-music.js: each bar made into an AudioBuffer by
// an OfflineAudioContext from a graph built a few milliseconds at a time, started on the audio clock seconds before it
// sounds; the plate, the tone, the duck and the limiter live after it). Here kart-music.js alone in a real-time
// AudioContext, at real time, driven the way the race drives it (the start screen's groove, the count's intro, GO, three
// laps with the lap and final stings, a duck every couple of seconds, the finish, the podium's stop, sting and groove back
// in), with the page's main thread held busy on purpose: 1.5 s mid-lap, 3 s just after the lap changes, 0.4 s six times
// on the final lap. Its output is tapped after its limiter (with copies through delays, so a stall loses nothing); a
// dropout is a 50 ms slot 18 dB under the race's median, for over 0.3 s.
async function kartScoreAheadChecks() {
  const theme = readFileSync(new URL('../lib/runtime/kart-music.js', import.meta.url), 'utf8');
  type Ahead = { mode: string; low: number | null; skipped: number; late: number; renders: number; laps: number[]; end: { key: string; tempo: number }; go: number; fin: number; slots: [number, number][]; nodes: number; secs: number; p99: number; worst: number; mb: number };
  const r = await withBrowser(async (page) => {
    await page.goto('about:blank');
    return page.eval<Ahead>(`(async () => {
      ${theme}
      const ac = new AudioContext(); await ac.resume();
      // (every node made on the page's context from here on counted: the score's live load)
      let nodes = 0; const P = BaseAudioContext.prototype;
      ['createOscillator', 'createGain', 'createBiquadFilter', 'createBufferSource', 'createConstantSource', 'createStereoPanner'].forEach((m) => { const f = P[m]; P[m] = function () { if (this === ac) nodes++; return f.apply(this, arguments); }; });
      const out = ac.createGain(); out.connect(ac.destination);
      const taps = [0, 0.8, 1.6, 2.4, 3.2].map((d) => { const an = ac.createAnalyser(); an.fftSize = 32768; if (d) { const dl = ac.createDelay(4); dl.delayTime.value = d; out.connect(dl); dl.connect(an); } else out.connect(an); return { d, an, buf: new Float32Array(32768) }; });
      const rms = {}, n = Math.round(ac.sampleRate * 0.05);
      const poll = () => { const now = ac.currentTime; taps.forEach((A) => { A.an.getFloatTimeDomainData(A.buf); for (let b = 0; b < Math.floor(A.buf.length / n); b++) { const end = A.buf.length - b * n; let s = 0; for (let i = end - n; i < end; i++) s += A.buf[i] * A.buf[i]; const k = Math.round((now - A.d - b * 0.05) / 0.05); if (!A.d || !(k in rms)) rms[k] = Math.sqrt(s / n); } }); };
      const pt = setInterval(poll, 100);
      const M = kartMusic.create(ac, out, { seed: 1607 }), S = M.state, laps = [], cost = [];
      let raf = true; (function fr() { if (!raf) return; const t = performance.now(); M.update(null); cost.push(performance.now() - t); if (laps[laps.length - 1] !== S.lap) laps.push(S.lap); requestAnimationFrame(fr); })();
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), busy = (ms) => { const e = performance.now() + ms; while (performance.now() < e) {} };
      M.setLap(0); M.start(null, 'loop'); await sleep(3000);
      M.setLap(1); const go = ac.currentTime + 3.1; M.start(go - M.introSeconds, 'intro'); await sleep(3100); M.sting('go');
      const n0 = nodes, t0 = ac.currentTime;
      await sleep(4000); busy(1500); await sleep(6000);
      M.sting('lap'); M.setLap(2); await sleep(200); busy(3000); await sleep(8000);
      M.setLap(3); M.sting('final'); await sleep(1500);
      for (let i = 0; i < 6; i++) { await sleep(1700); M.duck(4, 0.25); busy(400); }
      const fin = ac.currentTime, end = { key: S.key, tempo: S.tempo }; M.sting('finish'); await sleep(2000);
      const secs = ac.currentTime - t0, made = nodes - n0;
      M.stop(0.5); const after = ac.currentTime + M.sting('lose'); M.setLap(0); M.start(after, 'loop'); await sleep(6000);
      raf = false; poll(); clearInterval(pt);
      const res = { mode: S.mode, low: S.low, skipped: S.skipped, late: S.late, renders: S.renders, laps, end, go, fin, nodes: made, secs: +secs.toFixed(1), mb: +(S.bytes / 1048576).toFixed(1),
        slots: Object.keys(rms).map((k) => [+(k * 0.05).toFixed(2), +(20 * Math.log10(Math.max(1e-9, rms[k]))).toFixed(1)]).sort((a, b) => a[0] - b[0]) };
      cost.sort((a, b) => a - b); res.p99 = +cost[Math.floor(cost.length * 0.99)].toFixed(2); res.worst = +cost[cost.length - 1].toFixed(2);
      M.stop(0.2); await sleep(300); await ac.close();
      return res;
    })()`);
  }, { width: 400, height: 300, timeoutMs: 180_000 });
  console.log('\nkart: the score rendered ahead, at real time, through a busy page (owner, 8 Oct: "music stops randomly in game")');
  const race = r.slots.filter(([t]) => t > r.go + 0.5 && t < r.fin + 1.5), med = race.map((x) => x[1]).sort((a, b) => a - b)[race.length >> 1];
  const runs: [number, number][] = []; let cur: [number, number] | null = null;
  for (const [t, db] of r.slots) { if (t < r.go - 3 || t > r.fin + 12) continue; if (db < med - 18) { if (!cur) cur = [t, t + 0.05]; else cur[1] = t + 0.05; } else if (cur) { runs.push(cur); cur = null; } }
  if (cur) runs.push(cur);
  const holes = runs.filter((x) => x[1] - x[0] > 0.3);
  ok('kart: on a page the score is rendered ahead, and never drops out for over 0.3 s from the count to the podium\'s groove, through the page held busy 1.5 s mid-lap, 3 s just after a lap is asked for and 0.4 s six times on the final lap (no step skipped, no bar started late)',
    r.mode === 'render' && holes.length === 0 && race.length > 400 && r.skipped === 0 && r.late === 0,
    `${r.mode}; dropouts ${JSON.stringify(holes)} (race median ${med} dB over ${race.length} slots); skipped ${r.skipped}, late ${r.late}, ${r.renders} renders`);
  ok('kart: the score kept made and started at least 2.5 s ahead of the audio clock all race (its floor), the laps landing (1, 2, then the final lap in B at 168)',
    r.low != null && r.low >= 2.5 && r.laps.join().includes('1,2,3') && r.end.key === 'B' && r.end.tempo === 168,
    `the least ahead ${r.low?.toFixed(2)} s; laps ${r.laps.join(' -> ')}; at the finish ${r.end.key} ${r.end.tempo}`);
  ok('kart: and light on the page: a frame\'s update() 4 ms at most at the 99th percentile, the audio thread\'s live nodes under 15 a second (it was about 290), the bars kept under 40 MB',
    r.p99 <= 4 && r.nodes / r.secs < 15 && r.mb < 40, `update() p99 ${r.p99} ms, worst ${r.worst} ms; ${(r.nodes / r.secs).toFixed(1)} live nodes a second; ${r.mb} MB of bars`);
}

/* ---------------------------------------------------------- kart polish -- */
// The 7 Oct pass (Meme Kart M8): the GM at a kart's scale, the race graded the way the racers were drawn, nothing made
// once Play is pressed, levels of detail that hold, a phone at 1.25 pixels a point, the pick asked for by the race,
// the rocket on its kart, the engines and the crowd under the score, and the look back over the shoulder.
async function kartPolishChecks(kid: string) {
  type Audio = { voices: { kart: number; rpm: number; thr: number; level: number }[]; drift: number; crowd: number; cheer: number } | null;
  await withBrowser(async (page) => {
    // (frame times kept; and, as the page round a draft's preview does, the race's "kart-hello" answered with a racer)
    await page.preload('window.__ftl=[];(function t(n){window.__ftl.push(n);if(window.__ftl.length>3000)window.__ftl.shift();requestAnimationFrame(t)})(0);window.__hello=0;addEventListener("message",function(e){var d=e.data;if(d&&d.source==="gamemog"&&d.type==="kart-hello"){window.__hello++;postMessage({source:"gamemog-host",type:"kart-racer",racer:"shiba"},"*");}});');
    await page.goto(`${BASE}/d/${kid}/play`);
    for (let i = 0; i < 100 && !(await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)); i++) await sleep(200);
    const ks = () => page.eval<KartState & { prep: { done: boolean; inRace: number; programs: number; ms: number; of: number }; grade: { preset: string | null; curve: string } | null }>('window.__gmRuntime.state().kart');
    const K = <T>(js: string) => page.eval<T>(`(() => { const K = window.__gmRuntime.debug.kart(), D = window.__gmRuntime.debug; ${js} })()`);
    let st = await ks();
    for (let i = 0; i < 150 && !(st.prep.done && st.roster.waiting === 0); i++) { await sleep(100); st = await ks(); }

    console.log('\nkart: polish (7 Oct)');
    ok('kart: the race asks the page round it for the racer it kept ("kart-hello", so a draft\'s preview remembers too), and the one handed back is yours', (await page.eval<number>('window.__hello')) === 1 && st.pick.racer === 'shiba' && st.karts[0].racer === 'shiba',
      `${await page.eval<number>('window.__hello')} asked; ${st.pick.racer}`);
    await K('K.pick("pepe");');
    // the grade: a kart world gets the neutral curve (the fixture names the toy preset and no curve)
    ok('kart: a kart world is graded with the Khronos PBR Neutral curve where it names no other (and its own preset kept)', st.grade?.curve === 'neutral' && st.grade.preset === 'toy', JSON.stringify(st.grade));
    const plain = runtimeSource(1), kartRt = runtimeSource(1, true);
    ok('kart: the kart preset and the neutral curve ride only in the kart runtime', !plain.includes('vec3 neutral(') && !/kart: \{ exposure/.test(plain) && kartRt.includes('vec3 neutral(') && /kart: \{ exposure: 1\.05/.test(kartRt));
    // made ahead: everything a race shows, in the demo
    ok('kart: in the demo, everything a race shows is made ahead (the roster\'s levels, the items on every racer, the pools, the programs, the portraits, the sound)', st.prep.done && st.roster.waiting === 0 && st.pick.portraits === 8 && !!(await page.eval('window.__gmRuntime.debug.internals().audio')),
      `${st.prep.of} pieces in ${st.prep.ms} ms; ${st.roster.built} levels; ${st.pick.portraits} portraits`);

    // the To The Moon rocket on every racer's kart: its front strap's bracket on the deck (within 4 cm)
    const gaps = await K<Record<string, number | null>>('return K.mountGaps();');
    ok('kart: the To The Moon rocket sits on every racer\'s kart: its front bracket within 4 cm of the deck, the bed, the cage or the wing under it (Bike Tyson\'s saddle, his legs pedalling under it: 6 cm)', Object.keys(gaps).length === 8 && Object.entries(gaps).every(([r, g]) => g !== null && Math.abs(g) <= (r === 'bike' ? 0.06 : 0.04)), JSON.stringify(gaps));

    // a race: Play, Enter, and the frames from Enter to 6 s into the race; nothing made in it
    await page.eval(`window.postMessage({ source: 'gamemog-host', type: 'play' }, '*')`); await sleep(600);
    await K('K.seed(99);');
    const tEnter = await page.eval<number>('performance.now()');
    await page.key('Enter');
    // (the flyover, left to run: about 4 s, and the count begins where it lands, behind your kart)
    let fs = await ks(); const tFly = Date.now();
    for (let i = 0; i < 300 && fs.state === 'flyover'; i++) { await sleep(20); fs = await ks(); }
    const flyMs = Date.now() - tFly, landed = await page.eval<{ dist: number; up: number }>(`(() => { const R = window.__gmRuntime, I = R.debug.internals(), o = I.scene.getObjectByName('racer-' + R.state().kart.karts[0].racer).parent, c = I.camera.position; const p = new THREE.Vector3(); o.getWorldPosition(p); return { dist: +c.distanceTo(p).toFixed(2), up: +(c.y - p.y).toFixed(2) }; })()`);
    ok('kart: left alone, the flyover lasts about 4 s and lands where the race\'s camera stands behind your kart, then the count', fs.state === 'countdown' && flyMs > 3500 && flyMs < 4700 && landed.dist > 4 && landed.dist < 7.5 && landed.up > 1 && landed.up < 3,
      `${(flyMs / 1000).toFixed(2)} s, then ${fs.state}; the camera ${landed.dist} m from your kart, ${landed.up} m up`);
    for (let i = 0; i < 200 && (await ks()).phase !== 'race'; i++) await sleep(30);
    const p0 = (await ks()).prep;
    await K('K.autopilot(true);'); await sleep(6000);
    const ft = await page.eval<number[]>(`window.__ftl.filter((n) => n >= ${tEnter})`);
    const dts = ft.slice(1).map((n, i) => n - ft[i]), worst = Math.max(...dts);
    const p1 = (await ks()).prep;
    ok('kart: from Enter (the flyover, the count) to 6 s into the race nothing is made (no racer level, no item model), and no frame takes over 50 ms', p1.inRace === 0 && worst < 50,
      `${dts.length} frames, the longest ${worst.toFixed(1)} ms, ${dts.filter((x) => x > 33.4).length} over 33 ms; programs ${p0.programs} -> ${p1.programs}`);

    // the mix, measured at the master for 4 s: the score on top, nothing near clipping, the score ducked under a hit
    const mix = await page.eval<{ master: number; peak: number; eng: number; duck: number }>(`new Promise((res) => {
      const A = window.__gmRuntime.debug.internals().audio, ac = A.ctx, tap = (n) => { const a = ac.createAnalyser(); a.fftSize = 2048; n.connect(a); return a; }, m = tap(A.master), e = tap(A.engines), b = new Float32Array(2048);
      let sm = 0, se = 0, n = 0, pk = 0, duck = 1;
      const t = setInterval(() => { m.getFloatTimeDomainData(b); for (let i = 0; i < b.length; i++) { sm += b[i] * b[i]; pk = Math.max(pk, Math.abs(b[i])); } e.getFloatTimeDomainData(b); for (let i = 0; i < b.length; i++) se += b[i] * b[i] * 0.3025; n += b.length; duck = Math.min(duck, A.music ? A.music.duckLevel() : 1); }, 50);
      window.__gmRuntime.debug.kart().hit('laser', 0);
      setTimeout(() => { clearInterval(t); res({ master: 10 * Math.log10(sm / n), peak: 20 * Math.log10(pk), eng: 10 * Math.log10(se / n), duck }); }, 4000); })`);
    ok('kart: the mix: the engines under the score (at least 4 dB under the master), the master\'s peaks under -3 dBFS before its limiter, the score ducked for a hit', mix.eng < mix.master - 4 && mix.peak < -3 && mix.duck < 0.9,
      `master ${mix.master.toFixed(1)} dB RMS, engines ${mix.eng.toFixed(1)}, peak ${mix.peak.toFixed(1)} dBFS, duck ${mix.duck.toFixed(2)}`);

    // the engines and the crowd: your voice and the two nearest, revs from the speed; a boost revs, a hit drops it
    await sleep(1500);
    const a0 = await K<Audio>('return K.audio();'), sp0 = (await ks()).speed;
    const others = a0 ? a0.voices.slice(1).map((v) => v.kart) : [];
    await K('K.place(400, 0, 14, 0, 0);'); await sleep(300);
    const ab = await K<Audio>('return K.audio();');
    await K('K.give("pump"); K.use(0);'); await sleep(300);
    const a1 = await K<Audio>('return K.audio();');
    await K('K.hit("rug", 0);'); await sleep(450);
    const a2 = await K<Audio>('return K.audio();');
    ok('kart: the engines: yours (its revs from the speed: over 9,000 at 20 m/s) and the two karts nearest it, each heard; a boost revs it, a hit drops it toward idle',
      !!a0 && a0.voices[0].kart === 0 && a0.voices[0].level > 0.3 && (sp0 < 20 || a0.voices[0].rpm > 9000) && others.every((n) => n > 0) && new Set(others).size === 2 && !!ab && !!a1 && a1.voices[0].rpm > ab.voices[0].rpm + 1000 && !!a2 && a2.voices[0].rpm < 5000,
      `${sp0} m/s: ${JSON.stringify(a0?.voices)}; pump ${ab?.voices[0].rpm} -> ${a1?.voices[0].rpm} rpm; hit ${a2?.voices[0].rpm} rpm`);
    // the look back: over the racer's right shoulder, ahead of it, looking back down the road
    // (the hits above spun the kart: the look is judged once it is straight again, on its heading)
    await sleep(1200); await K('K.hold({ steer: "auto", gas: true, back: true });'); await sleep(300);
    const lb = await page.eval<{ ahead: number; side: number; look: number }>(`(() => { const R = window.__gmRuntime, I = R.debug.internals(), o = I.scene.getObjectByName('racer-' + R.state().kart.karts[0].racer).parent, c = I.camera; const y = R.debug.kart().kart(0).h, fx = Math.sin(y), fz = Math.cos(y), dx = c.position.x - o.position.x, dz = c.position.z - o.position.z; const v = new THREE.Vector3(); c.getWorldDirection(v); return { ahead: dx * fx + dz * fz, side: -(dx * Math.cos(y) - dz * Math.sin(y)), look: v.x * fx + v.z * fz }; })()`);
    await K('K.hold(null);');
    ok('kart: C looks back over the racer\'s shoulder: the camera ahead of the kart and out to its right, looking back down the road (no longer square in front, face to face)', lb.ahead > 1 && lb.ahead < 4 && lb.side > 1 && lb.look < -0.7, JSON.stringify(lb));

    // the GM: 0.45 of the lap's coin, half a metre up; driven past with the kart's middle 1.2 m from the line, still taken
    const cm = await page.eval<{ s: number; y: number } | null>(`(() => { const I = window.__gmRuntime.debug.internals(); let cm = null; I.scene.traverse((o) => { if (o.isInstancedMesh && Array.isArray(o.material) && o.material.length === 3 && o.geometry.type === 'CylinderGeometry') cm = o; }); if (!cm || !cm.count) return null; const M = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); cm.getMatrixAt(0, M); M.decompose(p, q, s); return { s: +s.x.toFixed(3), y: +p.y.toFixed(3) }; })()`);
    // (two lines of five, untouched, well along the lap: one for each pass)
    // (and clear of the meteors' stretches: since 7 Oct a strike is aimed at a racer in its stretch, and a lone kart is the one)
    const mz = (await K<{ kind: string; d: number; zone: number }[]>('return K.course().hazards;')).filter((h) => h.kind === 'meteor');
    const lines = (await K<{ d: number; x: number; on: boolean }[]>('return K.coins();')).filter((c, i) => i % 5 === 0 && c.on && c.d > 100 && c.d < 900 && mz.every((h) => Math.abs(c.d - h.d) > h.zone + 40));
    const [c0, c1] = lines;
    // (driven along the line, held off it by the steering)
    const pass = async (c: { d: number; x: number }, off: number) => K<number>(`K.solo(true); K.autopilot(false); K.place(${c.d - 12}, ${c.x + off}, 14, 0, 0); const g0 = K.kart(0).gm; K.run(2.2, (t, k) => ({ gas: true, steer: Math.max(-1, Math.min(1, (${c.x + off} - k.lat) * 0.8)) })); return K.kart(0).gm - g0;`);
    const near = await pass(c0, 1.2), wide = await pass(c1, -1.5);
    ok('kart: GM coins are 0.45 of the lap\'s (0.56 m across), floating about half a metre up, and a kart whose middle passes 1.2 m from a line still takes it (1.5 m: no)', !!cm && Math.abs(cm.s - 0.45) < 0.01 && near === 5 && wide === 0,
      `scale ${cm?.s}, ${near} GM at 1.2 m, ${wide} at 1.5 m`);
    await K('K.solo(false);');

    // levels of detail held: a rival moved back and forth across the near line every 0.2 s for 3 s never goes from
    // one level to another and back inside a second
    await K('K.solo(true); K.autopilot(false); K.hold({ gas: false }); K.place(300, 0, 0, 0, 0); K.lodLog(true);');
    for (let i = 0; i < 15; i++) { await K(`K.place(${i % 2 ? 315 : 307}, 3, 0, 0, 3);`); await sleep(200); }
    const lg = (await K<[number, number, string, string][]>('return K.lodLog();')).filter((r) => r[1] === 3);
    const back = lg.filter((r, i) => i > 0 && r[3] === lg[i - 1][2] && r[0] - lg[i - 1][0] < 1);
    ok('kart: a racer\'s level of detail is held a second at least (and by 3 m across the near line): moved across it five times a second, it changes at most once a second, never there and back inside one', lg.length >= 1 && lg.length <= 4 && back.length === 0,
      lg.map((r) => `${r[0]}:${r[2]}>${r[3]}`).join(' '));
    await K('K.hold(null); K.solo(false);');
    const e1 = [...(await page.eval<string[]>('window.__gm.errors')), ...page.errors];
    ok('kart: the polish raises no error', e1.length === 0, e1.join(' | '));
  }, { timeoutMs: 240_000 });

  // a phone: 1.25 pixels a point at most
  await withBrowser(async (page) => {
    await page.emulate({ width: 390, height: 844, mobile: true, dpr: 3 });
    await page.goto(`${BASE}/d/${kid}/play`);
    for (let i = 0; i < 100 && !(await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)); i++) await sleep(200);
    await sleep(1500);
    const r = await page.eval<{ quality: string; pixelRatio: number }>('window.__gmRuntime.state().render');
    ok('kart: on a phone (390 x 844 at 3x) a kart race draws at 1.25 pixels a point at most', r.quality === 'low' && r.pixelRatio <= 1.25 && r.pixelRatio >= 1, JSON.stringify(r));
  }, { width: 390, height: 844, timeoutMs: 120_000 });
}
/* ------------------------------------------------------------ kart feel -- */
// The owner's second review (7 Oct: "the camera view loses the rider and kart when he drops and dips down on the
// course", "turning is SOOO tough and not smooth"), on Meme Kart's own To The Moon (worlds/meme-kart.js, a local
// draft): a person on the keys (binary keys, 0.18 or 0.25 s to react, steering at the racing line ahead, round the
// mud, the rails and the holes, never braking) over flying laps, stepped exactly; and the race's camera, frame by
// frame in real time, the kart's box (its visible meshes, carried by its own matrix) projected through it on a
// desktop and on a phone held upright, down Buy the Dip, over Gap Up, up the Candle Climb and through a Claw.
const KART_DRIVER = String.raw`(function () {
  var D = window.__gmRuntime.debug.kart(), S0 = D.state(), L = S0.L, top = S0.top, RU = D.rules(), HD = RU.hd, CO = D.course();
  var N = Math.ceil(L), HE = new Float64Array(N), OFF = new Float64Array(N), RAD = new Float64Array(N);
  for (var i = 0; i < N; i++) { HE[i] = D.place(i, 0, 0, 0, 7).h; var ln = D.lineAt(i); OFF[i] = ln.off; RAD[i] = ln.r; }
  D.solo(true);
  function wrap(a) { a = (a + Math.PI) % (2 * Math.PI); return (a < 0 ? a + 2 * Math.PI : a) - Math.PI; }
  function md(d) { return ((d % L) + L) % L; }
  function at(T, d) { d = md(d); var i = Math.floor(d) % N, j = (i + 1) % N, u = d - Math.floor(d); return T[i] + (T[j] - T[i]) * u; }
  function hAt(d) { d = md(d); var i = Math.floor(d) % N, j = (i + 1) % N, u = d - Math.floor(d); return HE[i] + wrap(HE[j] - HE[i]) * u; }
  function rAt(d) { return RAD[Math.round(md(d)) % N]; }
  function railX(R0, d) { var u = md(d - R0.d0); if (u > R0.len) return NaN; var P = R0.pts; for (var q = 1; q < P.length; q++) if (u <= P[q][0]) { var f = (u - P[q - 1][0]) / Math.max(1e-6, P[q][0] - P[q - 1][0]); return P[q - 1][1] + (P[q][1] - P[q - 1][1]) * f; } return P[P.length - 1][1]; }
  function wmax(v) { return Math.max(0.2, Math.min(HD.wPeak, v / (HD.R0 + HD.Rc * v * v))); }
  function round(target, d, la) {
    var f, F, lo, hi;
    for (f = 0; f < CO.off.length; f++) { F = CO.off[f]; var rd = md(d + la - F.d0); if (rd > F.len + 4 && rd < L - 8) continue; if (target < F.x0 - 1.2 || target > F.x1 + 1.2) continue; lo = F.x0 - 1.4; hi = F.x1 + 1.4; target = (Math.abs(target - lo) < Math.abs(target - hi) && lo > -S0.hw + 0.8) || hi > S0.hw - 0.8 ? lo : hi; }
    for (f = 0; f < CO.rails.length; f++) { var xr = railX(CO.rails[f], d + la); if (xr !== xr) xr = railX(CO.rails[f], d + 4); if (xr !== xr || Math.abs(target - xr) > 1.6) continue; target = xr + (Math.abs(xr) > 0.5 ? -Math.sign(xr) : 1) * 1.7; }
    for (f = 0; f < CO.breaks.length; f++) { var B = CO.breaks[f]; if (B.x0 <= -S0.hw && B.x1 >= S0.hw) continue; var rb = md(B.d0 - d); if (rb > 40 && rb < L - B.len - 2) continue; if (target < B.x0 - 1.6 || target > B.x1 + 1.6) continue; lo = B.x0 - 1.8; hi = B.x1 + 1.8; target = (Math.abs(target - lo) < Math.abs(target - hi) && lo > -S0.hw + 0.8) || hi > S0.hw - 0.8 ? lo : hi; }
    return target;
  }
  // the person on the keys, reacting in react seconds: a function of the time and the live kart (lapsDone, lat, hop
  // -1 when not hopping) to its controls; st counts its reversals out of a stall (revs) and its key changes
  function person(react, st) {
    var Q = [], key = 0, P = { rev: 0, slow: 0 };
    return function (t, k) {
      var v = Math.max(0, k.v), d = k.d, la = Math.max(8, Math.min(22, 0.65 * v));
      var target = round(Math.max(-S0.hw + 1.2, Math.min(S0.hw - 1.2, at(OFF, d + la))), d, la);
      if (P.rev > 0) { P.rev -= 1 / 120; return { steer: P.revS, brake: true, analog: false }; }
      if (v < 2 && k.stun <= 0 && k.rescue < 0 && t > 2) { P.slow += 1 / 120; if (P.slow > 1) { P.slow = 0; P.rev = 0.8; P.revS = k.lat > 0 ? 1 : -1; st.revs++; } } else P.slow = 0;
      var e = wrap(k.h - hAt(d)), ed = -Math.atan2(target - k.lat, la), rl = rAt(d + 0.15 * v), ff = Math.abs(rl) < 5e5 ? v / rl : 0;
      var want = Math.max(-1.5, Math.min(1.5, -(ff + 2.6 * (ed - e)) / (wmax(v) * (k.hop >= 0 ? RU.hopTurn : 1))));
      var dec = want > 0.4 ? 1 : want < -0.4 ? -1 : Math.abs(want) < 0.2 ? 0 : key;
      Q.push([t, dec]); var out = null; while (Q.length && t - Q[0][0] >= react - 1e-9) out = Q.shift();
      if (out && out[1] !== key) { key = out[1]; st.changes++; }
      return { steer: key, gas: true, analog: false };
    };
  }
  // opt: { mode: 'keys' | 'auto', react, laps, secs }: flying laps (all but the first), the walls met, the key changes
  window.__drv = function (opt) {
    var react = opt.react || 0.18, laps = opt.laps || 3, st = { lapT: [], lapStart: 0, done: 0, revs: 0, changes: 0 }, drive = person(react, st);
    D.place(4, at(OFF, 4), 0.85 * top, 0, 0); D.lap(0); D.events(true);
    // (the walls counted up to the last lap's line: after it the kart brakes and backs off down the road, and at the
    // longer lap of 8 Oct (To The Moon at 1,570 m) the seconds left over were a minute of reversing into walls)
    var walls = { glance: 0, scrape: 0, bonk: 0 }, t1 = 0, counted = false, claws = [], inR = false;
    function count() { D.events(true).forEach(function (x) { if (x[1] === 0 && walls[x[0]] != null) walls[x[0]]++; }); counted = true; }
    D.run(opt.secs || 200, function (t, k) {
      if (k.lapsDone > st.done) { st.lapT.push(t - st.lapStart); st.lapStart = t; st.done = k.lapsDone; if (st.done === 1) { D.events(true); t1 = t; } }
      // (every Claw up to the last lap's line, the time it came, off the kart itself)
      if (k.rescue >= 0 && !inR && st.done < laps) claws.push(t); inR = k.rescue >= 0;
      if (st.done >= laps) { if (!counted) count(); return { brake: true, analog: true }; }
      if (opt.mode === 'auto') return 'auto';
      return drive(t, k);
    }, 60);
    if (!counted) count();
    var fly = Math.max(1, st.done - 1);
    return { laps: st.lapT.map(function (x) { return +x.toFixed(2); }), done: st.done, walls: +((walls.glance + walls.scrape + walls.bonk) / fly).toFixed(2), bonks: +(walls.bonk / fly).toFixed(2), revs: st.revs, keys: +(st.changes / Math.max(1, st.done)).toFixed(0),
      claws: claws.length, claw3: claws.reduce(function (m, t0) { return Math.max(m, claws.filter(function (t2) { return t2 >= t0 && t2 < t0 + 20; }).length); }, 0) };
  };
  // a whole race from the grid (just after GO), the field racing, you on the keys reacting in opt.react s (or on the
  // autopilot), opt.secs of it a quarter second at a time: every Rescue Claw, [kart, the race's time to a quarter
  // second, where], read off the race's own events, and who finished
  window.__field = function (opt) {
    var st = { revs: 0, changes: 0 }, drive = opt.react ? person(opt.react, st) : null, T = 0, claws = [];
    D.events(true);
    for (var c = 0; c < (opt.secs || 240) * 4; c++) {
      D.run(0.25, function (t, k) { return k.fin ? 'auto' : drive ? drive(T + t, k) : 'auto'; }, 0.25); T += 0.25;
      D.events(true).forEach(function (x) { if (x[0] === 'rescue') claws.push([x[1], T, Math.round(D.kart(x[1]).d)]); });
    }
    var S1 = D.state();
    return { claws: claws, fin: S1.karts.map(function (q) { return q.fin; }), revs: st.revs };
  };
  return { L: L, top: top };
})()`;
// the kart's box on the screen, every rendered frame (page side): [t, x0, x1, y0, y1, on-screen share, kart d, air,
// rescue, the kart's height, the camera's height over the road behind and its lag behind the road under the kart,
// the kart's height over the road (and 1 more hopping or on a rail)]
const KART_FRAME = String.raw`(function () {
  var R = window.__gmRuntime, I = R.debug.internals(), D = R.debug.kart(), THREE = I.THREE, cam = I.camera, obj = I.player.object;
  var p0 = obj.position.clone(), r0 = obj.rotation.clone(); obj.position.set(0, 0, 0); obj.rotation.set(0, 0, 0); obj.updateMatrixWorld(true);
  var LB = new THREE.Box3(), tmp = new THREE.Box3();
  obj.traverseVisible(function (o) { if (o.isMesh && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); LB.union(tmp); } });
  obj.position.copy(p0); obj.rotation.copy(r0); obj.updateMatrixWorld(true);
  var C8 = []; for (var c = 0; c < 8; c++) C8.push(new THREE.Vector3(c & 1 ? LB.max.x : LB.min.x, c & 2 ? LB.max.y : LB.min.y, c & 4 ? LB.max.z : LB.min.z));
  var V = new THREE.Vector3(), P = window.__kf = { rows: [], on: false, pad: 1 };
  P.pad = Array.prototype.reduce.call(document.querySelectorAll('#gm .tpad button'), function (m, b) { var r = b.getBoundingClientRect(); return r.width > 2 && getComputedStyle(b).display !== 'none' ? Math.min(m, r.top / innerHeight) : m; }, 1);
  (function frame(now) {
    requestAnimationFrame(frame);
    if (!P.on) return;
    var st = D.state(); if (st.state !== 'race') return;
    var k = D.kart(0); obj.updateMatrixWorld(true); cam.updateMatrixWorld(true);
    var x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (var c = 0; c < 8; c++) { V.copy(C8[c]).applyMatrix4(obj.matrixWorld).project(cam); var sx = (V.x + 1) / 2, sy = (1 - V.y) / 2; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
    var area = Math.max(1e-6, (x1 - x0) * (y1 - y0)), vis = Math.max(0, Math.min(1, x1) - Math.max(0, x0)) * Math.max(0, Math.min(1, y1) - Math.max(0, y0)) / area;
    P.rows.push([now / 1000, x0, x1, y0, y1, vis, k.d, k.air ? 1 : 0, k.rescue, obj.position.y, st.camera.over, st.camera.lag, k.y + (k.hop ? 1 : 0) + (k.grind >= 0 ? 1 : 0)]);
  })(0);
  return [LB.min.toArray(), LB.max.toArray()];
})()`;
// the crates (the owner's second review, 7 Oct: "before or shortly after grabbing the box, the kart starts to suddenly
// and unexplainably stutter"): your kart steered at a crate (page side, a frame at a time, through K.hold), and every
// rendered frame of it as drawn: [frame time, x, y, z, v, d, air, hop, stun, the item rolling or held, its y on the
// screen]. Until 7 Oct it was drawn on the nearest metre of road (a 11 to 65 cm staircase up the Candle Climb and down
// Buy the Dip, where two of the six Airdrop rows are), moved on by when the runtime's callback came and not by the
// frame's own time (4 to 8% too far or too short a frame), and shaken by a fresh random offset every frame
// the effects against the picture (the owner's third review, 7 Oct: "sometimes a giant blue cloud appears with red down
// arrows, not sure why but it blocks entire view, that shouldn't happen"): every rendered frame (page side), what
// debug.kart().cover() says the effects hide (all but what a racer carries, the Cold Wallet's dome round your kart
// see-through glass you are seen in, 12 s of it, not an effect in the way; a kart's own boost flame and the glow under
// it, the kart's exhaust, a hand's width out of its tail; and the speed lines, hairlines a pixel across that the small
// picture cover() draws makes eight times as wide as they are): [frame time, the share of the road-ahead band (x 0.2 to 0.8, y 0.3 down
// to the kart's foot) and of your kart's own box the effects change past a quarter of the full scale, and the screen's
// overlay over the band]
const KART_COVER = String.raw`(function () {
  var D = window.__gmRuntime.debug.kart(), P = window.__kcov = { rows: [], on: false };
  // (a frame where something hides the picture: which kinds of effect, each hidden alone, give back most of it)
  var KINDS = ['sparks', 'flames', 'smoke', 'confetti', 'flash', 'ifx', 'clouds', 'bags', 'whale', 'claw', 'shots', 'rugs', 'meteor'];
  (function frame(now) {
    requestAnimationFrame(frame); if (!P.on || D.state().state !== 'race') return;
    var c = D.cover('-kit,lines,boost'), who = '';
    if (c.band > 0.1 || c.kart > 0.25) who = KINDS.filter(function (q) { var r = D.cover(q); return r.band > c.band * 0.4 || r.kart > c.kart * 0.4; }).join('+');
    P.rows.push([now / 1000, c.band, c.kart, c.overlay, who]);
  })(0);
  return 1;
})()`;
// each effect set going, from your own camera, the rivals left out unless the effect needs one: [name, setup, ms]
// (the hazards and the crates on the way are met as they come: an effect of theirs counts as much as the item's)
const KART_COVER_TAKES: [string, string, number][] = [
  ['a FUD Cloud sent at you from 38 m behind (it flies up the road over the camera, then hangs over you)', 'K.place(300, 0, 31, 0, 0); K.place(262, 0, 31, 0, 1); K.give("fud", 1); K.use(1);', 3200],
  ['a FUD Cloud you send at a rival 9 m ahead', 'K.place(300, 0, 31, 0, 0); K.place(309, 1, 29, 0, 1); K.give("fud", 0); K.use(0);', 3000],
  ['the WHALE DUMP slammed on you', 'K.clock(40); K.place(300, 0, 31, 0, 0); K.place(250, 0, 28, 0, 1); K.give("whale", 1); K.use(1);', 3800],
  ['the WHALE DUMP slammed on a rival 10 m ahead', 'K.clock(80); K.place(300, 0, 31, 0, 0); K.place(310, 0, 29, 0, 1); K.give("whale", 0); K.use(0);', 3800],
  ['a hop-bash into a rival beside you', 'K.place(300, -1.6, 31, 0, 0); K.place(300.5, 1.0, 31, 0, 1); K.hold({ gas: true, steer: 1, drift: true }); setTimeout(() => K.hold({ gas: true, steer: 0 }), 400);', 1600],
  ['Laser Eyes on you', 'K.place(300, 0, 31, 0, 0); K.place(280, 0, 31, 0, 1); K.give("laser", 1); K.use(1);', 2500],
  // (8 Oct, the review film: a laser from behind and to the left as you went over Buy the Dip's first drop, the lens
  // low behind you, its beam laid back past the lens across the left of the road for 0.3 s)
  ['Laser Eyes on you from behind and to the left, over Buy the Dip\'s first drop', 'K.place(800, 1.5, 33, 0, 0); K.place(782, -3.5, 33, 0, 1); K.give("laser", 1); K.use(1);', 2500],
  ['To The Moon, and a Cold Wallet', 'K.place(300, 0, 31, 0, 0); K.give("moon", 0); K.use(0); setTimeout(() => { K.give("wallet", 0); K.use(0); }, 1500);', 4000],
  ['into the break, and the Rescue Claw', 'const B = K.course().breaks.filter((b) => b.x1 - b.x0 > 6)[0] || K.course().breaks[0]; K.place(B.d0 - 30, (B.x0 + B.x1) / 2, 31, 0, 0);', 3800],
];
const KART_CRATES = String.raw`(function () {
  var R = window.__gmRuntime, I = R.debug.internals(), D = R.debug.kart(), cam = I.camera, obj = I.player.object, V = new I.THREE.Vector3();
  var S0 = D.state(), L = S0.L, HD = D.rules().hd, N = Math.ceil(L), HE = new Float64Array(N);
  for (var i = 0; i < N; i++) HE[i] = D.place(i, 0, 0, 0, 7).h;
  D.solo(true);
  function wrap(a) { a = (a + Math.PI) % (2 * Math.PI); return (a < 0 ? a + 2 * Math.PI : a) - Math.PI; }
  function hAt(d) { d = ((d % L) + L) % L; var i = Math.floor(d) % N, j = (i + 1) % N, u = d - Math.floor(d); return HE[i] + wrap(HE[j] - HE[i]) * u; }
  function wmax(v) { return Math.max(0.2, Math.min(HD.wPeak, v / (HD.R0 + HD.Rc * v * v))); }
  var P = window.__kc = { rows: [], on: false, x: 0, err: null };
  (function frame(now) {
    requestAnimationFrame(frame);
    if (!P.on) return;
    try {
      var k = D.kart(0), v = Math.max(0, k.v), la = Math.max(4, Math.min(14, 0.5 * v)), e = wrap(k.h - hAt(k.d)), ed = -Math.atan2(P.x - k.x, la);
      D.hold({ steer: Math.max(-1, Math.min(1, -2.6 * (ed - e) / wmax(v))), gas: true, analog: true });
      var it = D.items().karts[0]; V.copy(obj.position).project(cam);
      P.rows.push([now, obj.position.x, obj.position.y, obj.position.z, v, k.d, k.air ? 1 : 0, k.hop ? 1 : 0, k.stun, it.roll > 0 || it.item ? 1 : 0, (1 - V.y) / 2]);
    } catch (err) { P.err = String(err && err.message || err); }
  })(0);
  return D.items().crates.map(function (c) { return [c.row, c.d, c.x]; });
})()`;
async function kartFeelChecks() {
  const code = readFileSync(new URL('../worlds/meme-kart.js', import.meta.url), 'utf8'), meta = JSON.parse(readFileSync(new URL('../worlds/meme-kart.json', import.meta.url), 'utf8'));
  const id = randomUUID();
  insertDraft({ id, prompt: 'runtime check', format: 'world', report: { runtimeCheck: true }, code, meta: { ...meta, mode: 'kart', runtime: 1 } } as never);
  type Frame = [number, number, number, number, number, number, number, number, number, number, number, number, number];
  const boot = async (page: Page) => {
    await page.goto(`${BASE}/d/${id}/play?preview=1`);
    for (let i = 0; i < 300 && !(await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)); i++) await sleep(200);
    const ks = () => page.eval<KartState & { prep: { done: boolean } }>('window.__gmRuntime.state().kart');
    let st = await ks();
    for (let i = 0; i < 600 && !(st.prep.done && st.roster.waiting === 0); i++) { await sleep(100); st = await ks(); }
    const K = <T>(js: string) => page.eval<T>(`(() => { const K = window.__gmRuntime.debug.kart(); ${js} })()`);
    await page.eval(`window.postMessage({ source: 'gamemog-host', type: 'play' }, '*')`); await sleep(400);
    await K('K.seed(7); K.restart(); return 1;');
    for (let i = 0; i < 100 && (await ks()).state !== 'countdown'; i++) await sleep(50);
    await K('K.go(); return 1;');
    for (let i = 0; i < 200 && (await ks()).state !== 'race'; i++) await sleep(30);
    return { K, ks };
  };
  // the camera through the places it lost the kart: real time, the autopilot driving; each place skipped 0.6 s in
  const camera = async (page: Page, K: <T>(js: string) => Promise<T>) => {
    await page.eval(KART_FRAME);
    await K('K.autopilot(true); return 1;');
    const out: { name: string; rows: Frame[] }[] = [];
    for (const [name, setup, ms] of [['Buy the Dip', 'K.place(745, 0, 26)', 12_000], ['Gap Up', 'K.place(330, 0, 28)', 6000], ['the Candle Climb', 'K.place(262, 0, 22)', 5000],
      ['a Claw at the brink', 'K.hold({ gas: false }); K.place(756, 0, 3)', 4000]] as const) {
      await K(`${setup}; return 1;`); await sleep(600);
      await page.eval('window.__kf.rows.length = 0; window.__kf.on = true; 1'); await sleep(ms);
      out.push({ name, rows: await page.eval<Frame[]>('(window.__kf.on = false, window.__kf.rows.slice())') });
      await K('K.hold(null); return 1;');
    }
    return { scen: out, pad: await page.eval<number>('window.__kf.pad') };
  };
  const judge = (lay: string, R: { scen: { name: string; rows: Frame[] }[]; pad: number }, H: number, foot: number, mid: number) => {
    const all = R.scen.flatMap((q) => q.rows), race = all;
    const outs = R.scen.map((q) => `${q.name} ${q.rows.filter((r) => r[1] < 0.05 || r[2] > 0.95 || r[3] < 0.10 || r[4] > foot).length}/${q.rows.length}`);
    const inside = race.every((r) => r[1] >= 0.05 && r[2] <= 0.95 && r[3] >= 0.10 && r[4] <= foot), worst = Math.min(...race.map((r) => r[5]));
    ok(`kart: ${lay}: the kart and its rider stay in the frame (x 0.05 to 0.95, y 0.10 to ${foot.toFixed(2)}) every race frame down Buy the Dip, over Gap Up, up the Candle Climb and through a Claw, all of the box on the screen (7 Oct: off the frame's foot down every drop, gone for up to 0.9 s)`,
      inside && worst >= 0.999 && race.length > 600, `${race.length} frames; outside ${outs.join(', ')}; the least on screen ${(worst * 100).toFixed(1)}%; foot at most ${Math.max(...race.map((r) => r[4])).toFixed(3)}, top at least ${Math.min(...race.map((r) => r[3])).toFixed(3)}`);
    // on the flat (the kart's height steady half a second either side, on the ground): where it sits, as before
    const flat = all.filter((r, i) => r[7] === 0 && r[8] < 0 && all.slice(Math.max(0, i - 30), i + 30).every((q) => Math.abs(q[9] - r[9]) < 0.2 && q[7] === 0)).map((r) => (r[3] + r[4]) / 2).sort((a, b) => a - b);
    const med = flat[Math.floor(flat.length / 2)] ?? 0;
    ok(`kart: ${lay}: on the flat the view is as it was, the kart's box centred ${mid} of the way down the screen (within 0.03)`, flat.length > 60 && Math.abs(med - mid) <= 0.03, `${med.toFixed(3)} over ${flat.length} frames`);
    // (on the ground, within a metre of its usual height over the road under the kart, unless the road behind it
    // rises: down a drop the lens is held a metre over the road under it, as it should be)
    const grounded = all.filter((r) => r[7] === 0 && r[8] < 0), over = Math.min(...all.filter((r) => r[8] < 0).map((r) => r[10])), lag = Math.max(...grounded.filter((r) => r[10] > 1.05).map((r) => Math.abs(r[11])));
    ok(`kart: ${lay}: the lens 0.6 m over the road under it at least, and on the ground within 1.25 m of its usual height over the road under the kart wherever the road behind lets it be (7 Oct: 0.45 m over it up the climb, 6.5 m too high down the Dip)`, over >= 0.6 && lag <= 1.25, `${over.toFixed(2)} m over at least, ${lag.toFixed(2)} m off at most`);
    // the climb: the kart steady on the screen (until 7 Oct it stepped 11 to 25 cm a metre: the stutter at the crates)
    // (on the road: the autopilot's hops and the rail on the way move it, as they should)
    const cl = R.scen.find((q) => q.name === 'the Candle Climb')!.rows, dy = cl.slice(1).map((r, i) => [r, cl[i]]).filter(([r, q]) => r[12] === 0 && q[12] === 0).map(([r, q]) => Math.abs((r[3] + r[4]) / 2 - (q[3] + q[4]) / 2) * H).sort((x, y) => x - y), p95 = dy[Math.floor(dy.length * 0.95)] ?? 99;
    ok(`kart: ${lay}: up the Candle Climb the kart holds still on the screen, frame to frame 2 px at most (95% of the frames it is on the road; 7 Oct: 16 to 18, the road read a metre at a time)`, dy.length >= 60 && p95 <= 2, `${p95.toFixed(2)} px over ${dy.length} frames`);
  };
  // each take, from your camera: the longest the effects hide a tenth of the road-ahead band or a quarter of your kart
  // (in seconds of frames running), and the most of either they hide at once; then a lap and a half of the race
  // (the field, the hazards, the crates, the items as they come, you on the autopilot)
  const cover = async (page: Page, K: <T>(js: string) => Promise<T>) => {
    await page.eval(KART_COVER);
    const out: { name: string; band: number; kart: number; longest: number; over: number; frames: number; who: string }[] = [];
    const takes: [string, string, number][] = [...KART_COVER_TAKES, ['a lap and a half of the race, the field and its items about you (you on the autopilot)', 'K.solo(false); K.autopilot(true); K.clock(30); K.place(40, 0, 25, 0, 0);', 45_000]];
    for (const [name, setup, ms] of takes) {
      await K('K.hold(null); K.give(null); K.give(null, 1); K.solo(true); K.autopilot(false); K.clock(30); K.place(200, 0, 31, 0, 0); return 1;'); await sleep(500);
      await K(`${setup} ${setup.includes('autopilot') || setup.includes('K.hold(') ? '' : 'K.hold({ gas: true, steer: 0 });'} return 1;`);
      await page.eval('window.__kcov.rows.length = 0; window.__kcov.on = true; 1'); await sleep(ms);
      const rows = await page.eval<[number, number, number, number, string][]>('(window.__kcov.on = false, window.__kcov.rows.slice())');
      let longest = 0, from = -1;
      for (const r of rows) { const hid = r[1] > 0.1 || r[2] > 0.25; if (hid && from < 0) from = r[0]; if (!hid) from = -1; if (from >= 0) longest = Math.max(longest, r[0] - from + 1 / 60); }
      out.push({ name, band: Math.max(0, ...rows.map((r) => r[1])), kart: Math.max(0, ...rows.map((r) => r[2])), longest, over: Math.max(0, ...rows.map((r) => r[3])), frames: rows.length, who: [...new Set(rows.map((r) => r[4]).filter(Boolean))].join(', ') });
    }
    await K('K.hold(null); K.autopilot(false); K.solo(true); return 1;');
    return out;
  };
  const judgeCover = (lay: string, R: { name: string; band: number; kart: number; longest: number; over: number; frames: number; who: string }[]) => {
    ok(`kart: ${lay}: no effect hides the road ahead or your kart for more than a few frames: a tenth of the road-ahead band (x 0.2 to 0.8, y 0.3 to the kart's foot) or a quarter of your kart's box, 0.12 s at the longest, and no overlay over the band at all, through a FUD Cloud on you and on a rival ahead, a WHALE DUMP on you and on a rival ahead, a bash, Laser Eyes, To The Moon and a Cold Wallet, the Claw, and a lap and a half of the race (7 Oct: an ink splat over the middle 35% of the screen for 3.5 s, and a cloud through the lens)`,
      R.every((r) => r.frames >= 20 && r.longest <= 0.12 && r.over === 0), R.map((r) => `${r.name.split(' (')[0]}: ${r.longest.toFixed(3)} s, most ${(r.band * 100).toFixed(0)}% of the band / ${(r.kart * 100).toFixed(0)}% of the kart (${r.frames} frames${r.who ? `; ${r.who}` : ''})`).join('; '));
  };
  try {
    await withBrowser(async (page) => {
      await page.emulate({ width: 1600, height: 900, dpr: 1 });
      const { K } = await boot(page);
      console.log('\nkart: the feel on To The Moon (the owner\'s second review, 7 Oct)');
      await page.eval(KART_DRIVER);
      const auto = await page.eval<{ laps: number[]; done: number; walls: number; bonks: number }>('window.__drv({ mode: "auto", laps: 4, secs: 260 })');
      // (four laps each, three flying: two flying laps a driver let one wall more or less swing a check; 7 Oct, round 3,
      // the faster race: 0.12, 0.15 and 0.18 s at 5, 5.3 and 6 walls a lap, the same drivers on the round-2 runtime 4.7,
      // 5.7 and 5.7; at 0.25 s 8.3, against 9)
      // (and 0.22 and 0.28 s, after them: 8 Oct, from 0.22 to 0.28 s each one stuck in the Claw's loop at the crater
      // gap or the bayou's channel, set down where it fell straight back in)
      type Drv = { laps: number[]; done: number; walls: number; bonks: number; revs: number; keys: number; claws: number; claw3: number };
      const drivers: Drv[] = [], RX = [0.12, 0.15, 0.18, 0.25, 0.22, 0.28];
      // (the two after them given 400 s: at 0.28 s a lap is 70 to 80 s)
      for (const react of RX) drivers.push(await page.eval(`window.__drv({ mode: 'keys', react: ${react}, laps: 4, secs: ${drivers.length < 4 ? 300 : 400} })`));
      const fly = (r: { laps: number[] }) => r.laps.slice(1), med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)], autoLap = med(fly(auto));
      const quick = drivers.slice(0, 3), slow = drivers[3], quickLap = med(quick.flatMap(fly)), quickWalls = quick.reduce((a, r) => a + r.walls, 0) / quick.length;
      ok('kart: a person on the keys laps To The Moon cleanly: reacting in 0.12 to 0.18 s, their flying laps within 1.15 times the autopilot\'s, 6 walls a lap on average (7 at most) and half a bonk; in 0.25 s, 12 walls and half a bonk; nobody stuck, and 0.22 and 0.28 s too: four laps (in 400 s), never reversing out of a stall, never the Claw three times in 20 s (7 Oct, the 0.18 s driver: 60.5 s against 48.3, 27 walls a lap, 13 bonks, three of seven drivers stuck; 8 Oct, 0.22 to 0.28 s: set down where they fell, back in, 59 times running)',
        drivers.every((r) => r.done >= 4 && r.revs === 0 && r.claw3 < 3) && drivers.slice(0, 4).every((r) => r.bonks <= 0.5) && quickWalls <= 6 && quick.every((r) => r.walls <= 7) && slow.walls <= 12 && quickLap <= 1.15 * autoLap,
        `autopilot ${fly(auto).join(', ')} s; ${drivers.map((r, i) => `${RX[i]} s: ${fly(r).join(', ')} s, ${r.walls} walls and ${r.bonks} bonks a lap, ${r.keys} key changes a lap, the Claw ${r.claws} times (${r.claw3} in 20 s at most)`).join('; ')}`);
      ok('kart: and the autopilot (the rivals\' driving) laps it with no bonk (7 Oct: the chicane\'s exit wall twice a lap, hopping the wrong way)', auto.done >= 4 && auto.bonks === 0, `${auto.walls} walls and ${auto.bonks} bonks a lap`);
      // the Claw never loops (8 Oct: a person on the keys reacting in 0.22 to 0.28 s was set down 30 m before the crater
      // gap, the key held from the fall still held, and fell straight back in, 59 times running): whole races from the
      // grid, the field racing, eight seeds, you on the autopilot and on the keys reacting in 0.18, 0.25 and 0.28 s, every
      // Claw read off the race's own events; and twenty more races off screen, the rivals and you on the autopilot
      {
        let worst = 0, races = 0, claws = 0, mine = 0, unfinished = 0, at = '';
        for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) for (const react of [0, 0.18, 0.25, 0.28]) {
          await K(`K.solo(false); K.seed(${seed}); K.restart(); return 1;`);
          for (let i = 0; i < 100 && (await page.eval<string>('window.__gmRuntime.state().kart.state')) !== 'countdown'; i++) await sleep(50);
          await K('K.go(); return 1;');
          const r = await page.eval<{ claws: [number, number, number][]; fin: boolean[] }>(`window.__field({ react: ${react}, secs: 240 })`);
          races++; claws += r.claws.length; mine += r.claws.filter((q) => q[0] === 0).length; unfinished += r.fin.filter((f) => !f).length;
          for (const [n, t, d] of r.claws) { const c = r.claws.filter((q) => q[0] === n && q[1] >= t && q[1] < t + 20).length; if (c > worst) { worst = c; at = `seed ${seed}, ${react ? `you on the keys at ${react} s` : 'you on the autopilot'}, kart ${n} from ${t} s at ${d} m`; } }
        }
        const off = await K<{ claw3: number[]; times: (number | null)[] }[]>('const out = []; for (let s = 101; s <= 120; s++) { const h = K.headless(s, 300, true); out.push({ claw3: h.claw3, times: h.times }); } return out;');
        const offWorst = Math.max(...off.flatMap((h) => h.claw3)), offOut = off.reduce((a, h) => a + h.times.filter((x) => x === null).length, 0);
        ok('kart: the Rescue Claw never loops: no kart is set down by it three times in 20 s, in 32 whole races (eight seeds; you on the autopilot and on the keys reacting in 0.18, 0.25 and 0.28 s) and 20 more off screen, and every kart finishes every race (8 Oct: 59 times running at the crater gap)',
          races === 32 && worst < 3 && offWorst < 3 && unfinished === 0 && offOut === 0,
          `${claws} Claws in ${races} races (${mine} of them yours), ${worst} in 20 s at most${at ? ` (${at})` : ''}; off screen ${offWorst} in 20 s at most; unfinished ${unfinished} and ${offOut}`);
      }
      await K('K.solo(false); K.seed(7); K.restart(); return 1;');
      for (let i = 0; i < 100 && (await page.eval<string>('window.__gmRuntime.state().kart.state')) !== 'countdown'; i++) await sleep(50);
      await K('K.go(); return 1;'); await sleep(300);
      judge('desktop', await camera(page, K), 900, 0.88, 0.62);
      // the crates on the climb (row 1, 11 to 25% up) and at the foot of the first drop (row 4): a crate taken in each,
      // and the kart as drawn through them steady
      {
        const crates = await page.eval<[number, number, number][]>(KART_CRATES);
        await K('K.autopilot(false); return 1;');
        type CR = [number, number, number, number, number, number, number, number, number, number, number];
        const runs: { row: number; rows: CR[] }[] = [];
        for (const row of [1, 4]) {
          const inRow = crates.filter((c) => c[0] === row), c = inRow.sort((a, b) => Math.abs(a[2]) - Math.abs(b[2]))[0];
          await K(`K.give(null); K.place(${c[1] - 34}, ${c[2]}, 24); return 1;`);
          await page.eval(`window.__kc.x = ${c[2]}; window.__kc.rows.length = 0; window.__kc.on = true; 1`); await sleep(2800);
          // (the first 0.6 s left out: the camera settling after the kart is put down)
          const got = await page.eval<CR[]>('(window.__kc.on = false, window.__kc.rows.slice())');
          runs.push({ row, rows: got.filter((r) => r[0] >= got[0][0] + 600) });
          await K('K.hold(null); return 1;');
        }
        const q95 = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.95)] ?? 99;
        const yy: number[] = [], adv: number[] = [], sy: number[] = [];
        for (const { rows } of runs) for (let i = 2; i < rows.length; i++) {
          const [a, b, c] = [rows[i - 2], rows[i - 1], rows[i]], d1 = b[0] - a[0], d2 = c[0] - b[0];
          if (c[4] > 5 && d2 > 0 && !c[8] && !b[8]) adv.push(Math.hypot(c[1] - b[1], c[3] - b[3]) / (((b[4] + c[4]) / 2) * d2 / 1000));
          // (on the ground, nothing lifting it, two equal frames)
          if ([a, b, c].some((r) => r[6] || r[7] || r[8] > 0) || Math.abs(d1 - d2) > 2) continue;
          yy.push(Math.abs(c[2] - 2 * b[2] + a[2])); sy.push(Math.abs(c[10] - 2 * b[10] + a[10]) * 900);
        }
        adv.sort((x, y) => x - y);
        const took = runs.map((r) => r.rows.some((x) => x[9])), err = await page.eval<string | null>('window.__kc.err');
        ok('kart: through the crates on the Candle Climb and at the foot of Buy the Dip\'s first drop, a crate taken in each, the kart drawn steady: its height frame to frame 3 cm off a straight line at most (95% of frames on the ground), its advance each frame its speed times the frame\'s own time within 3% (5 to 95%), and steady on the screen (7 Oct: steps of 11 to 65 cm a metre, 4 to 8% a frame either way, a camera shaken at random every frame: "the kart starts to suddenly and unexplainably stutter")',
          took.every(Boolean) && !err && yy.length >= 120 && q95(yy) <= 0.03 && adv.length >= 200 && adv[Math.floor(adv.length * 0.05)] >= 0.97 && adv[Math.floor(adv.length * 0.95)] <= 1.03 && q95(sy) <= 3,
          `crates taken ${took.join(', ')}; height off a line p95 ${q95(yy).toFixed(4)} m, max ${Math.max(...yy).toFixed(3)} over ${yy.length} frames; advance against v x the frame ${adv[Math.floor(adv.length * 0.05)]?.toFixed(3)} to ${adv[Math.floor(adv.length * 0.95)]?.toFixed(3)} over ${adv.length}; on the screen p95 ${q95(sy).toFixed(2)} px a frame's change of step${err ? `; ${err}` : ''}`);
        await K('K.solo(false); return 1;');
      }
      console.log('\nkart: the effects against the picture (the owner\'s third review, 7 Oct)');
      judgeCover('desktop', await cover(page, K));
      // the breaks, fair (8 Oct: in the integration's real-key races a kart that had fallen into the crater gap was set
      // down on the line square behind it, and a driver holding the gas fell in nine times running; and To The Moon run
      // out 2 to 15 m short of a break dropped its kart in, 9 times in 30): the Claw sets a kart down clear of a break
      // across part of the road (holding that lane, it is past), and the rocket never runs out over a break or short of it
      {
        type Brk = { sets: { at: number; x: number[]; full: boolean; setX: number | null; fell: boolean }[]; moon: [number, number, number | null][] };
        const r = await K<Brk>(`K.hold(null); K.autopilot(false); K.solo(true); K.give(null);
          const S0 = K.state(), L = S0.L, CO = K.course(), N = Math.ceil(L), md = (d) => ((d % L) + L) % L, HE = [];
          for (let i = 0; i < N; i++) HE.push(K.place(i, 0, 0, 0, 7).h);
          const wrap = (a) => { a = (a + Math.PI) % (2 * Math.PI); return (a < 0 ? a + 2 * Math.PI : a) - Math.PI; };
          const sets = [], moon = [];
          for (const B of CO.breaks) {
            const full = B.x0 <= -S0.hw && B.x1 >= S0.hw, mid = full ? 0 : Math.max(-S0.hw + 1, Math.min(S0.hw - 1, (B.x0 + B.x1) / 2));
            K.place(md(B.d0 + B.len / 2), mid, 20, 0, 0);
            const tr = K.run(4, { gas: false }, 1 / 120), dn = tr.find((q, i) => i > 0 && tr[i - 1].rescue >= 0 && q.rescue < 0);
            let fell = true;
            if (dn) { const x0 = dn.x, keep = (t, k) => { const la = 6 + Math.max(0, k.v) * 0.35, u = -Math.atan2(x0 - k.lat, la) - wrap(k.h - HE[Math.floor(md(k.d)) % N]); return { gas: true, steer: u < -0.03 ? 1 : u > 0.03 ? -1 : 0 }; };
              K.place(dn.d, dn.x, dn.v, 0, 0); fell = K.run(3, keep, 0.25).some((q) => q.rescue >= 0); }
            sets.push({ at: +B.d0.toFixed(1), x: [B.x0, B.x1], full, setX: dn ? dn.x : null, fell });
            for (const short of [2, 8, 14]) {
              const d0 = md(B.d0 - short - 3.5 * 1.5 * S0.top); K.place(d0, K.lineAt(d0).off, S0.top, 0, 0); K.give('moon'); K.use(0);
              const f = K.run(4.5, { gas: true, steer: 0 }, 1 / 120).find((q) => q.rescue >= 0); let fd = f ? f.d - B.d0 : null; if (fd !== null) fd = ((fd + L / 2) % L + L) % L - L / 2;
              moon.push([+B.d0.toFixed(0), short, fd !== null && fd > -6 && fd < B.len + 6 ? +fd.toFixed(1) : null]);
            }
          }
          K.give(null); K.solo(false); return { sets, moon };`);
        const part = r.sets.filter((q) => !q.full), dropped = r.moon.filter((m) => m[2] !== null);
        ok('kart: the breaks are fair: after a fall into a break across part of the road the Claw sets the kart down clear of it (1.3 m or more), and holding that lane it is past; and To The Moon never runs out over a break or just short of it (2, 8 or 14 m: none dropped in) (8 Oct: set down square behind the crater gap, a kart holding the gas fell in nine times running; a rocket out short of a break dropped its kart in 9 times in 30)',
          part.length > 0 && part.every((q) => q.setX !== null && (q.setX < q.x[0] - 1.3 || q.setX > q.x[1] + 1.3)) && r.sets.every((q) => !q.fell) && r.moon.length >= 3 * r.sets.length && dropped.length === 0,
          `set down ${r.sets.map((q) => `${q.at} ${q.full ? 'full' : `[${q.x.join(', ')}]`} at x ${q.setX}${q.fell ? ' FELL' : ''}`).join('; ')}; rockets dropped in ${dropped.length ? JSON.stringify(dropped) : 'none'} of ${r.moon.length}`);
      }
      const e = [...(await page.eval<string[]>('window.__gm.errors')), ...page.errors];
      ok('kart: the feel checks raise no error', e.length === 0, e.join(' | '));
    }, { width: 1600, height: 900, timeoutMs: 420_000 });
    await withBrowser(async (page) => {
      await page.emulate({ width: 390, height: 844, mobile: true, dpr: 3 });
      const { K } = await boot(page);
      const R = await camera(page, K);
      judge('a phone held upright', R, 844, Math.min(0.88, R.pad - 0.02), 0.57);
      judgeCover('a phone held upright', await cover(page, K));
    }, { width: 390, height: 844, timeoutMs: 320_000 });
  } finally { db.prepare('DELETE FROM drafts WHERE id = ?').run(id); }
}
// (ONLY=kart-diag: the diagnostic switches alone, a few minutes)
if (process.env.ONLY === 'kart-diag') {
  await kartDiagChecks();
  console.log(`\n${failures ? `${failures} FAILED` : 'all kart diag checks passed'}\n`);
  process.exit(failures ? 1 : 0);
}
// (ONLY=kart-feel: the feel on To The Moon alone, a few minutes)
if (process.env.ONLY === 'kart-feel') {
  await kartFeelChecks();
  console.log(`\n${failures ? `${failures} FAILED` : 'all kart feel checks passed'}\n`);
  process.exit(failures ? 1 : 0);
}
// (ONLY=kart-optin: the opt-ins alone, in node, a few seconds)
if (process.env.ONLY === 'kart-optin') {
  await kartOptInChecks();
  console.log(`\n${failures ? `${failures} FAILED` : 'all kart opt-in checks passed'}\n`);
  process.exit(failures ? 1 : 0);
}
await kartOptInChecks();
await kartChecks();
if (process.env.ONLY === 'kart') {
  console.log(`\n${failures ? `${failures} FAILED` : 'all kart checks passed'}\n`);
  process.exit(failures ? 1 : 0);
}

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
