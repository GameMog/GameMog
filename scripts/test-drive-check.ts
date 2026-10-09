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
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { withBrowser } from '../lib/browser.ts';
import { insertDraft, db } from '../lib/db.ts';
import { judge, testStatus } from '../lib/test-drive.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
type Framed = { raw: Record<string, unknown>; covers?: unknown; artIcon?: unknown; artWide?: unknown; ms: number };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const file = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** A draft's test drive, played as the creator's page plays it (TestDrive), and what it posted (or timedOut after `limitMs`). */
export async function frameDrive(base: string, draftId: string, limitMs = 200_000): Promise<Framed> {
  return withBrowser(async (page) => {
    await page.emulate({ width: 1280, height: 800 });
    // a document of the site's own (a world's policy lets only its own site frame it: frame-ancestors 'self')
    await page.goto(`${base}/favicon.ico`);
    for (let i = 0; i < 50 && (await page.eval<string>('document.readyState').catch(() => '')) !== 'complete'; i++) await sleep(100);
    await page.eval(`(() => {
      document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;background:#111';
      const box = document.createElement('div'); box.style.cssText = 'position:relative;width:960px;height:540px;overflow:hidden;background:#000';
      const f = document.createElement('iframe'); f.src = '/d/${draftId}/play?drive=1'; f.setAttribute('sandbox', 'allow-scripts'); f.title = 'Test drive';
      f.width = '1280'; f.height = '720'; f.tabIndex = -1; f.style.cssText = 'position:absolute;left:0;top:0;border:0;transform-origin:0 0;pointer-events:none;transform:scale(0.75)';
      window.__drive = null;
      addEventListener('message', (e) => { if (e.source !== f.contentWindow) return; const d = e.data; if (d && d.gm === 'drive' && d.type === 'report') window.__drive = d; });
      box.appendChild(f); document.body.appendChild(box); return 1; })()`);
    const t0 = Date.now();
    while (Date.now() - t0 < limitMs && !(await page.eval<boolean>('!!window.__drive').catch(() => false))) await sleep(1000);
    const d = await page.eval<{ raw: Record<string, unknown>; covers?: unknown; artIcon?: unknown; artWide?: unknown } | null>('window.__drive');
    return d ? { raw: d.raw ?? {}, covers: d.covers, artIcon: d.artIcon, artWide: d.artWide, ms: Date.now() - t0 } : { raw: { timedOut: true }, ms: Date.now() - t0 };
  }, { width: 1280, height: 800, timeoutMs: limitMs + 40_000 });
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
}

/** The drive itself, as the creator's page plays it: Meme Kart as a fresh Mog's draft, a lap world and an open world. */
export async function browserDriveChecks(ok: Ok, base: string) {
  const mk = JSON.parse(file('deploy/migrations/meme-kart.meta.json')).meta as Record<string, unknown>;
  const measured = mk.kartScore as { lap?: number; trackSig?: string } | undefined;
  // (a Mog's draft has no measured constants and no test yet: lib/generate-game.ts stores the model's meta, the mode and the controls)
  const { kartScore: _k, test: _t, ...mogMeta } = mk;
  const plain = (title: string) => ({ title, tagline: 'A test drive check.', blurb: 'Made by the drive check and removed after it.', genre: 'Test', cast: [{ name: 'Pip', color: '#F2E3C4' }], palette: { sky: '#9CCBEB', ground: '#7DB356', accent: '#F28C28' }, runtime: 1 });
  const worlds = [
    { kind: 'kart', code: file('worlds/meme-kart.js'), meta: mogMeta },
    { kind: 'lap', code: file('lib/runtime/reference-world.js'), meta: plain('Drive Check Lap') },
    { kind: 'open', code: file('worlds/zombie-beach.js'), meta: { ...plain('Drive Check Open'), scoring: 'survival' } },
  ];
  const ids = worlds.map(() => randomUUID());
  worlds.forEach((w, i) => insertDraft({ id: ids[i], prompt: 'test drive check', format: 'world', code: w.code, meta: w.meta, report: { pending: true } }));
  try {
    for (let i = 0; i < worlds.length; i++) {
      const w = worlds[i], f = await frameDrive(base, ids[i]);
      const r = judge(f.raw, { covers: f.covers, artIcon: f.artIcon, artWide: f.artWide }), st = testStatus(r), k = r.kart;
      const said = `${st} in ${Math.round(f.ms / 1000)} s${r.problems.length ? `: ${r.problems.join(' | ')}` : ''}`;
      if (w.kind === 'kart') {
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
        const want = w.kind === 'lap' ? 'advisories,errors,fps,hidden,levelReached,looks,mobile,open,ready,readyMs,results,runtime' : 'advisories,boss,errors,fps,heat,hidden,kos,levelReached,looks,mobile,open,police,ready,readyMs,results,runtime';
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
