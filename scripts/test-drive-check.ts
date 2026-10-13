/**
 * The test drive in the creator's browser, checked (8 Oct).  Part of `npm run check:platform`, or on its own:
 * node --import ./scripts/ts-resolve.mjs scripts/test-drive-check.ts
 *
 * Production has no Chrome, so a world is test-driven in the creator's own browser (lib/runtime/drive.js, served
 * in the draft at /d/<id>/play?drive=1) and judged by lib/test-drive.ts. Until 8 Oct that drive knew only the
 * endless lap and the open world: a kart race's kart sat on the grid, the level rule failed it, and every honest Mog
 * of Meme Kart failed, paid for three repairs of a fault it did not have, and errored. Checked here: the judge's
 * kart rules (the server's own words, lib/playtest-runtime.ts) and its lap and open verdicts as they were; then the
 * drive itself, played as the creator's page plays it (app/create/generation.tsx TestDrive: the draft in a
 * sandbox="allow-scripts" frame, 1280x720, scaled into the page, the report taken from its message, let go after
 * 200 s) on Meme Kart as a fresh Mog's draft carries it, on the reference lap world and on Zombie Beach; and that
 * what the kart drive counted (report.kart: the lap's length and the track's signature) goes into the draft's
 * stored report, where publishing reads it. Needs the dev server (BASE) and Chrome.
 *
 * A penalty shootout (13 Oct, SHOOTOUT's Mogs) is driven as kicks at the spot, never laps: the judge's shootout rules
 * (one verdict for both drives, lib/playtest-runtime.ts shootVerdict) on made-up reports; then SHOOTOUT itself as a
 * fresh Mog's draft, driven in the creator's frame and by the server's own playtest (three kicks, each to a result, a
 * cover from the set and the key art from behind the goal), and a copy whose keeper is no library human, which fails.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { withBrowser } from '../lib/browser.ts';
import { insertDraft, db } from '../lib/db.ts';
import { judge, testStatus } from '../lib/test-drive.ts';
import { playtestWorld } from '../lib/playtest-runtime.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
type Framed = { raw: Record<string, unknown>; covers?: unknown; artIcon?: unknown; artWide?: unknown; ms: number };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const file = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/**
 * A draft's test drive, played as the creator's page plays it (TestDrive), and what it posted (or timedOut after `limitMs`).
 * A penalty shootout's (13 Oct) is then loaded again in a fresh frame as a phone (#phone), as TestDrive does, and both
 * reports go together (raw.phone; { timedOut: true } after `phoneMs`). ms: the whole drive; phoneMs: its phone load.
 */
export async function frameDrive(base: string, draftId: string, limitMs = 200_000, phoneMs = 100_000): Promise<Framed & { phoneMs?: number }> {
  return withBrowser(async (page) => {
    await page.emulate({ width: 1280, height: 800 });
    // a document of the site's own (a world's policy lets only its own site frame it: frame-ancestors 'self')
    await page.goto(`${base}/favicon.ico`);
    for (let i = 0; i < 50 && (await page.eval<string>('document.readyState').catch(() => '')) !== 'complete'; i++) await sleep(100);
    await page.eval(`(() => {
      document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;background:#111';
      const box = document.createElement('div'); box.style.cssText = 'position:relative;width:960px;height:540px;overflow:hidden;background:#000';
      const make = (hash) => { const f = document.createElement('iframe'); f.src = '/d/${draftId}/play?drive=1' + hash; f.setAttribute('sandbox', 'allow-scripts'); f.title = 'Test drive';
        f.width = '1280'; f.height = '720'; f.tabIndex = -1; f.style.cssText = 'position:absolute;left:0;top:0;border:0;transform-origin:0 0;pointer-events:none;transform:scale(0.75)'; return f; };
      let f = make(''), first = null;
      window.__drive = null; window.__phoneAt = 0;
      addEventListener('message', (e) => {
        if (e.source !== f.contentWindow) return; const d = e.data; if (!d || d.gm !== 'drive' || d.type !== 'report') return;
        if (first) { window.__drive = Object.assign({}, first, { raw: Object.assign({}, first.raw, { phone: d.raw }) }); return; }
        const raw = d.raw || {};
        if (raw.kind === 'shootout' && raw.ready === true && !raw.hidden) { first = d; window.__phoneAt = Date.now(); box.removeChild(f); f = make('#phone'); box.appendChild(f); return; }
        window.__drive = d;
      });
      window.__phoneLate = () => { if (first && !window.__drive) window.__drive = Object.assign({}, first, { raw: Object.assign({}, first.raw, { phone: { timedOut: true } }) }); return 1; };
      box.appendChild(f); document.body.appendChild(box); return 1; })()`);
    const t0 = Date.now();
    let at = 0;
    for (;;) {
      if (await page.eval<boolean>('!!window.__drive').catch(() => false)) break;
      at = await page.eval<number>('window.__phoneAt').catch(() => 0) || 0;
      if (at ? Date.now() - at > phoneMs : Date.now() - t0 > limitMs) { if (at) await page.eval('window.__phoneLate()').catch(() => 0); else break; }
      await sleep(1000);
    }
    const d = await page.eval<{ raw: Record<string, unknown>; covers?: unknown; artIcon?: unknown; artWide?: unknown } | null>('window.__drive');
    const ms = Date.now() - t0, phone = at ? { phoneMs: Date.now() - at } : {};
    return d ? { raw: d.raw ?? {}, covers: d.covers, artIcon: d.artIcon, artWide: d.artWide, ms, ...phone } : { raw: { timedOut: true }, ms };
  }, { width: 1280, height: 800, timeoutMs: limitMs + phoneMs + 40_000 });
}

/** The judge on reports made up for it: the kart rules, and the lap and open verdicts as they were before them. */
export function judgeChecks(ok: Ok) {
  const jpeg = (n: number) => { const b = Buffer.alloc(n, 0x55); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; return 'data:image/jpeg;base64,' + b.toString('base64'); };
  const covers = [jpeg(60_000), jpeg(60_000), jpeg(60_000)];
  const base = { ready: true, runtime: true, readyMs: 2100, mobile: false, hidden: false, fps: 60, errors: [] as string[], advisories: [] as string[], results: 1 };
  const full = { L: 1574.9, trackSig: 'd90450e9fd3eddee', laps: 3, lapsDone: 3, place: 4, finished: true, estimated: false, drifted: true, stuck: 0.4, fps: 60, results: 1, time: 148.8, share: 1, scale: 3, cut: false };
  const kart = (k: Record<string, unknown>, more: Record<string, unknown> = {}) => ({ ...base, open: false, kind: 'kart', levelReached: Number(k.lapsDone ?? 3), ...more, kart: { ...full, ...k } });
  const v = (raw: Record<string, unknown>, imgs: Record<string, unknown> = { covers }) => { const r = judge(raw, imgs); return { st: testStatus(r), p: r.problems, r }; };

  const done = v(kart({}));
  ok('drive judge: a kart race driven three laps to the results, drifting, at 60 fps, passes; its level is its laps, and the race\'s count goes with it', done.st === 'passed' && done.r.levelReached === 3 && done.r.kind === 'kart' && done.r.kart?.L === 1574.9 && done.r.kart.trackSig === 'd90450e9fd3eddee',
    `${done.st} ${done.p.join(' | ')}`);
  const parked = v(kart({ lapsDone: 0, finished: false, drifted: false, results: 0, share: 0, time: 312 }, { results: 0 }));
  ok('drive judge: a kart that never left the grid (the old drive) fails, in the server\'s words: the laps, the drift, the results', parked.st === 'failed' && parked.p.length === 3 && parked.p[0].startsWith('On the autopilot your kart finished only 0 of 3 laps')
    && parked.p[1].startsWith('Your kart never drifted') && parked.p[2].startsWith('The race did not end in the results'), parked.p.join(' | '));
  const noRes = v(kart({ results: 0 }, { results: 0 })), stuck = v(kart({ stuck: 5 })), slow = v(kart({ fps: 15 }, { fps: 15 }));
  ok('drive judge: no results, a kart stuck 5 s, or 15 fps on a laptop each fail it, as the server says them', noRes.st === 'failed' && noRes.p.length === 1 && stuck.st === 'failed' && /stuck for 5\.0 s/.test(stuck.p[0]) && slow.st === 'failed' && /kart race ran at 15 fps/.test(slow.p[0]));
  ok('drive judge: no level rule for a kart race (three laps is not "level 3 of 4")', !done.p.concat(parked.p).some((p) => /reached only level/.test(p)));
  const hidden = v(kart({ lapsDone: 0, drifted: false, results: 0 }, { hidden: true, results: 0, fps: 4 }), {}), hiddenErr = v(kart({}, { hidden: true, errors: ['TypeError: q is undefined'] }));
  ok('drive judge: a kart drive in a tab that went to the background is unverified, never a pass (and what threw still fails it)', hidden.st === 'unverified' && hidden.p.length === 0 && hiddenErr.st === 'failed' && hiddenErr.p.length === 1,
    `${hidden.st}, ${hiddenErr.st}`);
  const cut = v(kart({ lapsDone: 1, finished: false, results: 0, share: 0.4, scale: 8, cut: true }, { results: 0 })), cutSlow = v(kart({ lapsDone: 1, results: 0, cut: true }, { fps: 12, results: 0 }));
  const gone = v({ timedOut: true }, {});
  ok('drive judge: a kart drive out of its time before the finish (cut) is unverified, and so is one the page let go; its frame rate still counts', cut.st === 'unverified' && gone.st === 'unverified' && cutSlow.st === 'failed' && cutSlow.p.length === 1,
    `${cut.st} ${gone.st} ${cutSlow.st}`);
  const odd = judge(kart({ trackSig: 'NOT-HEX', L: 'x', extra: 1 }), { covers });
  const unloaded = testStatus(judge({ ready: false, kind: 'kart', errors: [] }, {})), unloadedErr = testStatus(judge({ ready: false, kind: 'kart', errors: ['boom'] }, {})), unloadedLap = testStatus(judge({ ready: false, errors: [] }, {}));
  ok('drive judge: a kart race not loaded in its minute with nothing thrown is unverified (no repairs on a slow line); one that threw, or a lap world, still fails', unloaded === 'unverified' && unloadedErr === 'failed' && unloadedLap === 'failed');
  ok('drive judge: the count is read field by field (a bad signature or lap is null; nothing unasked is kept)', odd.kart?.trackSig === null && odd.kart.L === null && !('extra' in odd.kart));

  // the endless lap and the open world, as they were judged before the kart branch (hidden: only what threw counts)
  const lap = (m: Record<string, unknown>) => v({ ...base, open: false, levelReached: 5, ...m });
  const open = (m: Record<string, unknown>) => v({ ...base, open: true, kos: 4, heat: 3, boss: true, police: true, levelReached: 3, ...m });
  const l = [lap({}), lap({ levelReached: 1 }), lap({ hidden: true, levelReached: 0, results: 0, fps: 0 }), lap({ results: 0 }), lap({ mobile: true, fps: 9 })];
  const o = [open({}), open({ kos: 0 }), open({ boss: false }), open({ hidden: true, kos: 0, boss: false, results: 0 })];
  ok('drive judge: lap worlds as before (passes; level 1 fails on the level rule; hidden passes on what threw; no crash result fails; a phone\'s frame rate is not held against it)',
    l.map((x) => x.st).join() === 'passed,failed,passed,failed,passed' && /reached only level 1/.test(l[1].p[0]) && l.every((x) => !x.r.kind && !x.r.kart), l.map((x) => x.st).join());
  ok('drive judge: open worlds as before (passes; no knockouts or no boss fails; hidden passes on what threw)', o.map((x) => x.st).join() === 'passed,failed,failed,passed' && o.every((x) => !x.r.kind && !x.r.kart), o.map((x) => x.st).join());
  shootJudgeChecks(ok);
}

/** The judge's shootout rules (13 Oct) on reports made up for them. */
export function shootJudgeChecks(ok: Ok) {
  const jpeg = (n: number) => { const b = Buffer.alloc(n, 0x55); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; return 'data:image/jpeg;base64,' + b.toString('base64'); };
  const covers = [jpeg(60_000), jpeg(60_000), jpeg(60_000)];
  // SHOOTOUT's own cover frame as the runtime measured it (13 Oct): the taker's kit is his stands' colour, apart 18
  const set = { entropy: 6.47, dominant: 0.114, edges: 0.305, contrast: 165, mean: 83, clipped: 0, floor: 1, player: 0.0208, seen: 0.99, apart: 18 };
  const own = { sim: 'own', brain: 'own', taker: 'own', goal: 'own', people: 'own', 'keeper rig': 'own', keeper: 'own', blobs: 'own', camera: 'own', audio: 'own', hud: 'own' };
  const full = { kicks: 3, results: 3, goals: 2, outcomes: ['goal', 'goal', 'over'], parts: own, failed: [], calls: 54, tris: 286_134, fps: 60, cut: false };
  const base = { ready: true, runtime: true, readyMs: 1900, mobile: false, hidden: false, fps: 60, errors: [] as string[], advisories: [] as string[], results: 3, looks: [set, set, set] };
  const shoot = (k: Record<string, unknown> = {}, more: Record<string, unknown> = {}) => ({ ...base, open: false, kind: 'shootout', levelReached: Number(k.kicks ?? 3), ...more, shootout: { ...full, ...k } });
  const v = (raw: Record<string, unknown>, imgs: Record<string, unknown> = { covers }) => { const r = judge(raw, imgs); return { st: testStatus(r), p: r.problems, a: r.advisories, r }; };

  const done = v(shoot());
  ok('drive judge (shootout): three kicks, each to a result, the people the runtime\'s own, at 60 fps, passes; its level is its kicks, and the count goes with it',
    done.st === 'passed' && done.r.kind === 'shootout' && done.r.levelReached === 3 && done.r.shootout?.results === 3 && done.r.shootout.parts.keeper === 'own' && !done.r.kart, `${done.st} ${done.p.join(' | ')}`);
  ok('drive judge (shootout): its cover\'s "blends" note (the taker in his stands\' colour, by design) is not sent, so a clean shootout buys no repair; a lap world with the same frame still gets it',
    done.a.length === 0 && v({ ...base, open: false, levelReached: 5, results: 1 }).a.some((a) => a.startsWith('The player is hard to tell')), done.a.join(' | '));
  const taker = v(shoot({ parts: { ...own, people: 'stand-in' } })), keeper = v(shoot({ parts: (({ 'keeper rig': _r, ...p }) => ({ ...p, keeper: 'stand-in' }))(own) }));
  ok('drive judge (shootout): a taker or a keeper the runtime had to move as a box (not a library human) fails, saying which and how to build him',
    taker.st === 'failed' && taker.p.length === 1 && taker.p[0].startsWith('player() must return the library human itself') && keeper.st === 'failed' && keeper.p.length === 1 && keeper.p[0].startsWith('rival(ctx, 1, o) must return a library human built on o.body'),
    `${taker.p.join(' | ')} || ${keeper.p.join(' | ')}`);
  const short = v(shoot({ results: 2 }, { results: 2 })), slow = v(shoot({ fps: 15 }, { fps: 15 })), flat = v(shoot(), { covers: [jpeg(9000)] }), threw = v(shoot({}, { errors: ['A goal handler threw: x is undefined'] }));
  ok('drive judge (shootout): a kick with no result, 15 fps on a laptop, a flat cover, or anything thrown each fail it, in the server\'s words',
    short.st === 'failed' && /^Kick 3 of 3 did not end with a result/.test(short.p[0]) && slow.st === 'failed' && /shootout ran at 15 fps/.test(slow.p[0]) && flat.st === 'failed' && /flat colour at the penalty spot/.test(flat.p[0])
      && threw.st === 'failed' && threw.p[0] === 'Runtime error: A goal handler threw: x is undefined', [short, slow, flat, threw].map((x) => x.p.join(' | ')).join(' || '));
  ok('drive judge (shootout): no lap rule, no crash rule', ![done, short, slow, flat].some((x) => x.p.some((p) => /reached only level|crash did not end/.test(p))));
  // the phone load (13 Oct review: the laptop's count was held to the phone's budget, and its note asked for changes on
  // 'low' that the laptop never drew; a robot keeper's Mog paid for a repair that could not move it)
  const phone = { ready: true, runtime: true, shootout: true, readyMs: 2400, coarse: true, hidden: false, errors: [] as string[], advisories: [] as string[], calls: 56, tris: 311_492, parts: own, failed: [], kicked: true, ended: true, results: 1 };
  const withPhone = (ph: Record<string, unknown>, k: Record<string, unknown> = {}, more: Record<string, unknown> = {}) => v({ ...shoot(k, more), phone: { ...phone, ...ph } });
  const laptopHeavy = v(shoot({ calls: 210, tris: 520_000 })), phoneOk = withPhone({}), heavy = withPhone({ calls: 160, tris: 452_000 });
  ok('drive judge (shootout): a heavy frame on the laptop is no note (the phone\'s budget is never held against the laptop\'s count); the phone load\'s own count under it passes clean',
    laptopHeavy.st === 'passed' && laptopHeavy.a.length === 0 && phoneOk.st === 'passed' && phoneOk.a.length === 0 && phoneOk.r.shootout?.phone?.loaded === true && phoneOk.r.shootout.phone.tris === 311_492, `${laptopHeavy.a.join(' | ')} ${phoneOk.a.join(' | ')}`);
  ok('drive judge (shootout): over 150 calls or 350,000 triangles in the phone load is a note to build lighter on \'low\', in the phone\'s numbers, never a failure',
    heavy.st === 'passed' && heavy.a.length === 1 && /^On a phone \(ctx\.quality 'low'\) the shootout drew up to 160 draw calls and 452,000 triangles a frame\. Hold it to 150 calls and 350,000 triangles there/.test(heavy.a[0]), heavy.a.join(' | '));
  const lowThrew = withPhone({ ready: false, runtime: undefined, shootout: undefined, errors: ['console.error: [gamemog] The world failed to build: SNOW is not defined', 'ReferenceError: SNOW is not defined | at Object.build (x:1:1)'], calls: null, tris: null, parts: {}, kicked: false, ended: false, results: 0 });
  const lowErr = withPhone({ errors: ['TypeError: flakes is undefined', 'A goal handler threw'] }, {}, { errors: ['A goal handler threw'] });
  ok('drive judge (shootout): a world that throws only on \'low\' (it never loads on a phone) fails, saying so in the phone\'s words; an error the drive already reported is said once',
    lowThrew.st === 'failed' && lowThrew.p.length === 1 && lowThrew.p[0].startsWith("On a phone (ctx.quality 'low') the world never finished loading: The world failed to build: SNOW is not defined | ReferenceError: SNOW is not defined. Check the code that runs only on 'low'")
      && lowErr.st === 'failed' && lowErr.p.length === 2 && lowErr.p[0] === 'Runtime error: A goal handler threw' && lowErr.p[1] === "On a phone (ctx.quality 'low'), a runtime error: TypeError: flakes is undefined", [...lowThrew.p, ...lowErr.p].join(' || '));
  // (a box keeper has no rig: its parts say keeper 'stand-in' and no 'keeper rig' at all, as the director reports them)
  const boxParts = (({ 'keeper rig': _r, ...p }) => ({ ...p, keeper: 'stand-in' }))(own);
  const lowBox = withPhone({ parts: boxParts }), bothBox = withPhone({ parts: boxParts }, { parts: boxParts });
  ok('drive judge (shootout): a keeper that is a box only on \'low\' fails in the phone\'s words; one that is a box in the drive too is said once',
    lowBox.st === 'failed' && lowBox.p.length === 1 && lowBox.p[0].startsWith("On a phone (ctx.quality 'low') the keeper was moved as a box") && bothBox.p.length === 1 && bothBox.p[0].startsWith('rival(ctx, 1, o) must return'), [...lowBox.p, ...bothBox.p].join(' || '));
  const late = v({ ...shoot(), phone: { timedOut: true } }), slowLine = withPhone({ ready: false, runtime: undefined, shootout: undefined, errors: [], parts: {} }), away = withPhone({ hidden: true, calls: 400, tris: 900_000 });
  ok('drive judge (shootout): a phone load that never reported, one that did not load in its minute with nothing thrown, or one sent to the background, is judged without (the drive passes)',
    late.st === 'passed' && late.r.shootout?.phone?.timedOut === true && slowLine.st === 'passed' && slowLine.p.length === 0 && away.st === 'passed' && away.a.length === 0, `${late.st} ${slowLine.st} ${away.st} ${away.a.join(' | ')}`);
  // the lenses behind the goal (13 Oct review: a 3 m fence 2.7 m behind the goal passed every check and blanked the key art)
  const lens = (worst: number, by: unknown[] = []) => ({ rays: 96, targets: 16, worst, blocked: [worst, 0, 0, 0, 0, 0], by, tris: 12, over: false, ms: 40 });
  const fence = v(shoot({ lens: lens(16, [{ name: 'scenery / ball-stop', rays: 64, at: [0, 1.5, -55.2], size: [16, 3, 0.3] }]) })), pole = v(shoot({ lens: lens(2, [{ name: 'flag', rays: 2, at: [1, 1, -55], size: [0.05, 3, 0.05] }]) })), clear = v(shoot({ lens: lens(0) }));
  ok('drive judge (shootout): something standing in the lenses behind the goal fails, naming it, where it stands and the rule; a thin pole (two sight lines) and a clear room pass',
    fence.st === 'failed' && fence.p.length === 1 && fence.p[0].startsWith("The runtime's cameras behind the goal (the keeper's shot, every replay and the key art) cannot see the goal: 'scenery / ball-stop' (3 m tall, 16 m wide, centred at x 0, y 1.5, z -55.2) stands in the way, blocking 16 of the 16 sight lines")
      && /nothing may be taller than 1 m from its line \(z = -52\.5\) back to 6 m behind it/.test(fence.p[0]) && pole.st === 'passed' && clear.st === 'passed' && clear.r.shootout?.lens?.worst === 0, fence.p.join(' | '));
  const oddLens = judge({ ...shoot({ lens: { rays: 'x', worst: 4 } }), phone: { ready: true, errors: [7, 'boom'], tris: 'many', parts: { '<b>': 'own' }, extra: 1 } }, { covers });
  ok('drive judge (shootout): the lens check and the phone load are read field by field (a lens report without its numbers is dropped; odd phone fields are dropped)',
    oddLens.shootout?.lens === null && oddLens.shootout?.phone?.tris === null && oddLens.shootout.phone.errors.join() === 'boom' && !('<b>' in oddLens.shootout.phone.parts) && !('extra' in oddLens.shootout.phone)
      && oddLens.problems.length === 1 && oddLens.problems[0] === "On a phone (ctx.quality 'low'), a runtime error: boom", JSON.stringify(oddLens.shootout?.phone));
  const hidden = v(shoot({ kicks: 1, results: 0 }, { hidden: true, results: 0, fps: 3 }), {}), hiddenErr = v(shoot({}, { hidden: true, errors: ['boom'] })), hiddenBox = v(shoot({ parts: { ...own, people: 'stand-in' } }, { hidden: true }));
  ok('drive judge (shootout): a drive in a tab sent to the background is unverified, never a pass (what threw, or a taker moved as a box, still fails it)',
    hidden.st === 'unverified' && hidden.p.length === 0 && hiddenErr.st === 'failed' && hiddenBox.st === 'failed', `${hidden.st} ${hiddenErr.st} ${hiddenBox.st}`);
  const cut1 = v(shoot({ kicks: 1, results: 0, cut: true }, { results: 0 })), cut2 = v(shoot({ kicks: 2, results: 2, cut: true }, { results: 2 })), cut2short = v(shoot({ kicks: 2, results: 1, cut: true }, { results: 1 }));
  ok('drive judge (shootout): out of time before its second kick (cut) is unverified; cut after two kicks is judged on the two',
    cut1.st === 'unverified' && cut2.st === 'passed' && cut2short.st === 'failed' && /^Kick 2 of 2/.test(cut2short.p[0]), `${cut1.st} ${cut2.st} ${cut2short.st}`);
  const unloaded = testStatus(judge({ ready: false, kind: 'shootout', errors: [] }, {})), unloadedErr = testStatus(judge({ ready: false, kind: 'shootout', errors: ['boom'] }, {}));
  ok('drive judge (shootout): not loaded in its minute with nothing thrown is unverified (no repairs on a slow line); one that threw still fails', unloaded === 'unverified' && unloadedErr === 'failed', `${unloaded} ${unloadedErr}`);
  const odd = judge(shoot({ parts: { ...own, '<b>': 'own', people: 42 }, outcomes: ['goal', '<script>', 7], failed: ['audio.load', { x: 1 }], tris: 'many', extra: 1 }), { covers });
  ok('drive judge (shootout): the count is read field by field (odd parts, outcomes and numbers are dropped or "none"; nothing unasked is kept)',
    !!odd.shootout && !('<b>' in odd.shootout.parts) && !('people' in odd.shootout.parts) && odd.shootout.outcomes.join() === 'goal,none,none' && odd.shootout.failed.join() === 'audio.load' && odd.shootout.tris === null && !('extra' in odd.shootout)
      && testStatus(odd) === 'failed' && odd.problems[0].startsWith('player() must return'), JSON.stringify(odd.shootout));
}

/** The drive itself, as the creator's page plays it: Meme Kart as a fresh Mog's draft, a lap world and an open world. */
export async function browserDriveChecks(ok: Ok, base: string) {
  const mk = JSON.parse(file('deploy/migrations/meme-kart.meta.json')).meta as Record<string, unknown>;
  const measured = mk.kartScore as { lap?: number; trackSig?: string } | undefined;
  // (a Mog's draft has no measured constants and no test yet: lib/generate-game.ts stores the model's meta, the mode and the controls)
  const { kartScore: _k, test: _t, ...mogMeta } = mk;
  const plain = (title: string) => ({ title, tagline: 'A test drive check.', blurb: 'Made by the drive check and removed after it.', genre: 'Test', cast: [{ name: 'Pip', color: '#F2E3C4' }], palette: { sky: '#9CCBEB', ground: '#7DB356', accent: '#F28C28' }, runtime: 1 });
  // SHOOTOUT as a fresh Mog's draft carries it, a copy of it whose keeper is no library human (a box), and (13 Oct
  // review) a copy with what no drive saw before: a line that throws only on 'low' (fewer flakes, as the manual invites),
  // a 3 m fence 2.7 m behind the goal shot at (the lenses' room), and a 1.45 m keeper (an easier keeper, before the
  // runtime sized him)
  const { test: _st, ...shootMeta } = JSON.parse(file('deploy/migrations/shootout.meta.json')).meta as Record<string, unknown>;
  const shootCode = file('worlds/shootout.js'), KEEPER = 'h = keeper ? person(id, KEEPER_LOOK, KEEPER_KIT, false) :';
  const BUILD = "      var THREE = T3, S = ctx.scene;\n", LOOK = "var KEEPER_LOOK = { skin: 'caucasian', hair: 'short02', height: 1.90,";
  const broken = shootCode.includes(BUILD) && shootCode.includes(LOOK) ? shootCode.replace(LOOK, LOOK.replace('1.90', '1.45')).replace(BUILD, BUILD
    + "      if (LOWQ) { FLAKES_ON_LOW.count = 600; }\n"
    + "      var fence = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 0.3), new THREE.MeshStandardMaterial({ color: '#0A1020', emissive: '#E9C46A', emissiveIntensity: 0.6 })); fence.name = 'ball-stop fence'; fence.position.set(0, 1.5, GZ - 2.7); S.add(fence);\n") : '';
  const worlds = [
    { kind: 'kart', code: file('worlds/meme-kart.js'), meta: mogMeta },
    { kind: 'lap', code: file('lib/runtime/reference-world.js'), meta: plain('Drive Check Lap') },
    { kind: 'open', code: file('worlds/zombie-beach.js'), meta: { ...plain('Drive Check Open'), scoring: 'survival' } },
    { kind: 'shootout', code: shootCode, meta: shootMeta },
    { kind: 'shootout-box', code: shootCode.includes(KEEPER) ? shootCode.replace(KEEPER, 'h = keeper ? null :') : '', meta: shootMeta },
    { kind: 'shootout-broken', code: broken, meta: shootMeta },
  ];
  const ids = worlds.map(() => randomUUID());
  worlds.forEach((w, i) => insertDraft({ id: ids[i], prompt: 'test drive check', format: 'world', code: w.code, meta: w.meta, report: { pending: true } }));
  try {
    for (let i = 0; i < worlds.length; i++) {
      const w = worlds[i], f = await frameDrive(base, ids[i]);
      const r = judge(f.raw, { covers: f.covers, artIcon: f.artIcon, artWide: f.artWide }), st = testStatus(r), k = r.kart;
      const said = `${st} in ${Math.round(f.ms / 1000)} s${r.problems.length ? `: ${r.problems.join(' | ')}` : ''}`;
      if (w.kind === 'shootout') {
        const so = r.shootout, own = (p: string) => so?.parts[p] === 'own';
        ok('drive: SHOOTOUT, driven in the creator\'s frame as a fresh Mog of it, passes (before 13 Oct its Mogs were switched off: no drive could play a penalty)', st === 'passed', said);
        ok('drive: it is reported as a penalty shootout and kicked: three kicks, each to a result, the taker, the keeper\'s rig and the keeper the runtime\'s own, at speed, with a cover from the set and the key art (wide and icon)',
          f.raw.kind === 'shootout' && !!so && so.kicks === 3 && so.results === 3 && so.outcomes.length === 3 && !so.outcomes.includes('none') && own('people') && own('keeper rig') && own('keeper') && (so.fps ?? 0) >= 30 && !so.cut
            && !!r.cover && !!r.artWide && !!r.artIcon && r.levelReached === 3 && f.ms - (f.phoneMs ?? 0) < 200_000, `${Math.round(f.ms / 1000)} s; ${JSON.stringify(so)}`);
        ok('drive: its lenses behind the goal see the goal mouth, and it is loaded again as a phone (on \'low\'): it loads, nothing throws, its people are the runtime\'s, one kick to its result, under the phone\'s budget, in its 100 s',
          !!so?.lens && so.lens.rays === 96 && so.lens.worst === 0 && !!so.phone && so.phone.loaded && !so.phone.timedOut && !so.phone.errors.length && so.phone.parts.keeper === 'own' && so.phone.parts.people === 'own'
            && so.phone.kicked && so.phone.ended && so.phone.results >= 1 && (so.phone.tris ?? 1e9) <= 350_000 && (so.phone.calls ?? 1e9) <= 150 && (f.phoneMs ?? 1e9) < 100_000 && !r.advisories.length,
          `${Math.round((f.phoneMs ?? 0) / 1000)} s; lens ${JSON.stringify(so?.lens)}; phone ${JSON.stringify(so?.phone)}; ${r.advisories.join(' | ')}`);
        ok('drive: its cover\'s blends note is not sent (no repair pass on a clean shootout)', !r.advisories.some((a) => a.startsWith('The player is hard to tell')), r.advisories.join(' | '));
        // stored as the builder stores a pass, where the build show reads it (report.kind, report.shootout)
        const { cover: _c, artIcon: _i, artWide: _w, ...rest } = { ...r, status: st, codeHash: 'x' };
        db.prepare('UPDATE drafts SET report = ? WHERE id = ?').run(JSON.stringify(rest), ids[i]);
        const back = JSON.parse((db.prepare('SELECT report FROM drafts WHERE id = ?').get(ids[i]) as { report: string }).report) as typeof rest;
        ok('drive: what the shootout drive counted is kept in the draft\'s report beside its status (report.kind, report.shootout)', back.kind === 'shootout' && back.status === 'passed' && back.shootout?.kicks === 3 && back.shootout.results === 3);
        // and the server's own playtest of the same draft (where there is Chrome): the same verdict and the same count
        const sv = await playtestWorld(`${base}/d/${ids[i]}/play`), sst = testStatus(sv), ss = sv.shootout;
        ok('drive: the server\'s playtest of the same draft passes it too: the first kick a player\'s keys (Enter, Space tapped, the last tap held), three kicks to three results, a cover and the key art',
          sst === 'passed' && sv.kind === 'shootout' && !!ss && ss.kicks === 3 && ss.results === 3 && ss.keys === true && !!sv.cover && !!sv.artWide && !!sv.artIcon && sv.levelReached === 3,
          `${sst}${sv.problems.length ? `: ${sv.problems.join(' | ')}` : ''}; ${JSON.stringify(ss)}`);
        ok('drive: and the server reads the same lenses and loads it as a phone too (its own Chrome, 844 x 390, touch): clear, loaded, nothing thrown, under the phone\'s budget',
          !!ss?.lens && ss.lens.worst === 0 && !!ss.phone && ss.phone.loaded && !ss.phone.errors.length && ss.phone.kicked && ss.phone.ended && (ss.phone.tris ?? 1e9) <= 350_000 && !sv.advisories.length,
          `lens ${JSON.stringify(ss?.lens)}; phone ${JSON.stringify(ss?.phone)}`);
      } else if (w.kind === 'shootout-broken') {
        const lensSaid = r.problems.find((p) => p.startsWith("The runtime's cameras behind the goal")), lowSaid = r.problems.find((p) => p.startsWith("On a phone (ctx.quality 'low') the world never finished loading"));
        ok('drive: the copy with a fence behind the goal and a line that throws only on \'low\' fails in the creator\'s frame, naming the fence and the phone\'s error (both passed every drive before)',
          !!w.code && st === 'failed' && !!lensSaid && lensSaid.includes("'ball-stop fence' (3 m tall, 16 m wide") && !!lowSaid && lowSaid.includes('FLAKES_ON_LOW is not defined') && r.problems.length === 2
            && r.shootout?.results === 3 && r.shootout.phone?.loaded === false, said);
        const sv = await playtestWorld(`${base}/d/${ids[i]}/play`), sp = sv.problems;
        ok('drive: and the server\'s playtest fails it with the same two notes', testStatus(sv) === 'failed' && sp.length === 2 && sp.some((p) => p === lensSaid) && sp.some((p) => p.startsWith("On a phone (ctx.quality 'low') the world never finished loading") && p.includes('FLAKES_ON_LOW is not defined')),
          sp.join(' | '));
        // the keeper's size is the runtime's: the 1.45 m keeper stands, reaches and saves as SHOOTOUT's (the same kicks, the same hashes)
        const kept = await withBrowser(async (page) => {
          const read = async (id: string) => {
            await page.goto(`${base}/d/${id}/play`);
            for (let j = 0; j < 400 && !(await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)); j++) await sleep(200);
            return page.eval<{ height: number; hash: string[] } | null>(`(() => { const D = window.__gmRuntime.debug.shootout(), k = D.people().keeper; let b = null; k.model.traverse((o) => { if (!b && o.isSkinnedMesh) b = o.skeleton.bones[0]; });
              const v = new THREE.Vector3(); b.parent.getWorldScale(v);
              return { height: +(v.y * 1.869).toFixed(3), hash: [D.sim({ seed: 12345, aim: [-2.6, 0.5], releaseMs: 0 }).hash, D.sim({ seed: 777, aim: [2.9, 1.9], releaseMs: 0 }).hash, D.sim({ seed: 4242, aim: [0.4, 2.2], releaseMs: 40 }).hash] }; })()`).catch(() => null);
          };
          return { shootout: await read(ids[worlds.findIndex((x) => x.kind === 'shootout')]), small: await read(ids[i]) };
        }, { width: 1280, height: 720, timeoutMs: 200_000 });
        ok('drive: a keeper the world made 1.45 m tall stands 1.90 m, as SHOOTOUT\'s does, and saves the same kicks the same way (his size is the runtime\'s, so a Mog cannot make him easier)',
          !!kept.shootout && !!kept.small && kept.shootout.height === 1.9 && kept.small.height === 1.9 && kept.small.hash.every((h, j) => !!h && h === kept.shootout!.hash[j]), JSON.stringify(kept));
      } else if (w.kind === 'shootout-box') {
        ok('drive: a copy of SHOOTOUT whose keeper is no library human fails in the creator\'s frame, with the keeper\'s note and nothing else (the kicks still end)',
          !!w.code && st === 'failed' && r.problems.length === 1 && r.problems[0].startsWith('rival(ctx, 1, o) must return a library human') && r.shootout?.parts.keeper === 'stand-in' && r.shootout.results === 3, said);
      } else if (w.kind === 'kart') {
        ok('drive: Meme Kart, driven in the creator\'s frame as a fresh Mog of it, passes (it failed every drive before 8 Oct)', st === 'passed', said);
        ok('drive: it is reported as a kart race and raced: three laps of three, home (not called), drifting, nobody stuck over 3 s, at speed, with a result, the key art and a cover',
          f.raw.kind === 'kart' && !!k && k.laps === 3 && k.lapsDone === 3 && k.finished && !k.estimated && k.drifted && k.stuck <= 3 && (k.fps ?? 0) >= 30 && k.results >= 1 && !k.cut && !!r.artWide && !!r.cover && r.levelReached === 3,
          JSON.stringify(k));
        ok('drive: inside the page\'s 200 s, and the lap and the track\'s signature it reports are the ones the node measurement gives (deploy/migrations/meme-kart.meta.json)',
          f.ms < 200_000 && !!k?.L && k.L > 300 && /^[0-9a-f]{16}$/.test(k.trackSig ?? '') && (!measured?.lap || Math.abs(measured.lap - k.L) < 0.05) && (!measured?.trackSig || measured.trackSig === k.trackSig),
          `${Math.round(f.ms / 1000)} s; L ${k?.L} (measured ${measured?.lap}), trackSig ${k?.trackSig} (measured ${measured?.trackSig})`);
        // stored as the builder stores a pass (lib/generate-game.ts: the report less its pictures, with its verdict and code), where publishing reads it
        const gen = file('lib/generate-game.ts'), { cover: _c, artIcon: _i, artWide: _w, ...rest } = { ...r, status: st, codeHash: 'x' };
        db.prepare('UPDATE drafts SET report = ? WHERE id = ?').run(JSON.stringify(rest), ids[i]);
        const back = JSON.parse((db.prepare('SELECT report FROM drafts WHERE id = ?').get(ids[i]) as { report: string }).report) as typeof rest;
        ok('drive: what the kart drive counted is kept in the draft\'s report beside its status (report.kind, report.kart), as the builder stores every pass',
          /const \{ cover, artIcon, artWide, \.\.\.rest \} = report;/.test(gen) && /report = \? WHERE id = \?'\)\.run\([^)]*JSON\.stringify\(rest\)/.test(gen) && back.kind === 'kart' && back.status === 'passed' && back.kart?.L === k?.L && back.kart?.trackSig === k?.trackSig);
      } else {
        // the lap and open drives report what they always have: no kind, no kart, and the same keys
        const keys = Object.keys(f.raw).sort().join();
        // (and, 9 Oct, the world's own soundtrack as the runtime plays it, for a Mog's publish: scripts/soundtrack-check.ts)
        const want = w.kind === 'lap' ? 'advisories,errors,fps,hidden,levelReached,looks,mobile,open,ready,readyMs,results,runtime,soundtrack' : 'advisories,boss,errors,fps,heat,hidden,kos,levelReached,looks,mobile,open,police,ready,readyMs,results,runtime,soundtrack';
        ok(`drive: the ${w.kind === 'lap' ? 'endless lap (the reference world)' : 'open world (Zombie Beach)'} is driven and judged as before: it passes, and reports what it always did`,
          st === 'passed' && keys === want && !r.kind && !r.kart && (w.kind === 'lap' ? f.raw.open === false && r.levelReached >= 4 : f.raw.open === true && !!r.open?.boss), `${said}; ${keys}`);
      }
    }
  } finally { ids.forEach((id) => db.prepare('DELETE FROM drafts WHERE id = ?').run(id)); }
}

export async function testDriveChecks(ok: Ok, base: string) {
  judgeChecks(ok);
  await browserDriveChecks(ok, base);
}

// on its own
if (import.meta.url === `file://${process.argv[1]}`) {
  const BASE = process.env.BASE ?? 'http://localhost:3939';
  let failures = 0;
  const ok: Ok = (name, cond, detail = '') => { console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${detail ? `: ${detail}` : ''}`); if (!cond) failures++; };
  console.log('\nThe test drive in the creator\'s browser');
  await testDriveChecks(ok, BASE);
  console.log(`\n${failures ? `${failures} FAILED` : 'all test drive checks passed'}\n`);
  process.exit(failures ? 1 : 0);
}
