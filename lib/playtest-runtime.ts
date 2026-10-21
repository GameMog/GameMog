import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withBrowser, chromePath, HostSlept } from './browser';
import { lookScore, lookAdvisories, lookNotes, isLook, type Look } from './look';
import { captureWorldKeyArt, captureShootoutKeyArt, gpArtSpot, captureGpKeyArt, GP_ART_BACK } from './key-art';
import type { DnaReport } from './mog-dna';

/**
 * Playtest a game by playing it.
 *
 * Boots the document in real Chrome at a real frame rate, starts it the ways a
 * title screen usually asks (Enter, Space, a click), then plays for several
 * seconds with the arrow keys, WASD and Space, and records:
 *
 *   - whether GameMog.ready() was ever called, and how fast
 *   - every uncaught exception and console error, with the line it came from
 *   - the frame rate while playing
 *   - whether the screen is blank, or frozen while keys are being pressed
 *   - a screenshot mid-play, which becomes the game's cover
 *
 * Each finding is phrased as an instruction, because it is sent straight back
 * to the model that wrote the game.
 */

export type RuntimeReport = {
  ok: boolean;
  ran: boolean;
  readyMs: number | null;
  fps: number | null;
  errors: string[];
  problems: string[];
  cover?: Uint8Array;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a playtest again when the machine slept through it. Sleep freezes the
 * browser mid-run, and the time-out that follows is the host's, not the game's.
 */
async function awake<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (!(e instanceof HostSlept) || i === 2) throw e; }
  }
}

/** A JPEG this small at 1280x720 is a flat colour, not a scene. */
const BLANK_BYTES = 14_000;

export async function runtimePlaytest(url: string): Promise<RuntimeReport> {
  if (!chromePath()) {
    return { ok: true, ran: false, readyMs: null, fps: null, errors: [], problems: [] };
  }
  try {
    return await awake(() => withBrowser(async (page) => {
      await page.preload(`
        window.__frames = 0;
        (function tick() { window.__frames++; requestAnimationFrame(tick); })();
      `);
      const t0 = Date.now();
      await page.goto(url);

      let readyMs: number | null = null;
      for (let i = 0; i < 100; i++) {
        const ready = await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false);
        if (ready) { readyMs = Date.now() - t0; break; }
        await sleep(200);
      }
      const problems: string[] = [];
      if (readyMs === null) {
        problems.push('GameMog.ready() was never called within 20 seconds of loading. Call it right after the first frame renders, including on the title screen.');
      }

      // start it the ways a title screen asks
      await sleep(600);
      await page.key('Enter'); await sleep(250);
      await page.key('Space'); await sleep(250);
      await page.click(640, 360); await sleep(400);

      // play: steer, hop, go
      const f0 = await page.eval<number>('window.__frames').catch(() => 0);
      const pt0 = Date.now();
      const script: [string, number][] = [
        ['ArrowUp', 500], ['ArrowLeft', 450], ['Space', 120], ['ArrowRight', 500], ['ArrowUp', 300],
        ['Space', 120], ['KeyA', 350], ['KeyD', 350], ['ArrowLeft', 300], ['Space', 120], ['ArrowRight', 400],
        ['ArrowUp', 400], ['KeyW', 300], ['Space', 120], ['ArrowLeft', 350], ['ArrowRight', 350],
      ];
      let midShot: Uint8Array | undefined, earlyShot: Uint8Array | undefined;
      for (let i = 0; i < script.length; i++) {
        const [k, ms] = script[i];
        await page.key(k, 'keyDown'); await sleep(ms); await page.key(k, 'keyUp'); await sleep(60);
        if (i === 3) earlyShot = await page.screenshot(60);
        if (i === 9) midShot = await page.screenshot(78);
      }
      const f1 = await page.eval<number>('window.__frames').catch(() => f0);
      const fps = Math.round((f1 - f0) / ((Date.now() - pt0) / 1000));
      const lateShot = await page.screenshot(60);

      const errors = [...new Set([
        ...page.errors,
        ...(await page.eval<string[]>('(window.__gm && window.__gm.errors) || []').catch(() => [])),
      ])].slice(0, 12);

      for (const e of errors) problems.push(`Runtime error while playing: ${e}`);
      if (fps < 24) problems.push(`The game ran at ${fps} fps on a laptop GPU. Cut draw calls (use InstancedMesh for repeated props), shadow map size and per-frame allocations until it holds 60.`);
      const cover = midShot ?? lateShot;
      if (cover.length < BLANK_BYTES && lateShot.length < BLANK_BYTES) {
        problems.push('The screen is blank or a single flat colour while playing. Check that the renderer is appended to the page, sized to the window, and that the camera is looking at the scene.');
      } else if (earlyShot && Buffer.compare(Buffer.from(earlyShot), Buffer.from(lateShot)) === 0) {
        problems.push('The picture did not change at all over eight seconds of pressing Enter, Space, a click, the arrow keys and WASD. The game should start from one of those and visibly respond.');
      }

      return { ok: problems.length === 0, ran: true, readyMs, fps, errors, problems, cover };
    }, { timeoutMs: 75_000 }));
  } catch (e) {
    return {
      ok: false, ran: true, readyMs: null, fps: null, errors: [], cover: undefined,
      problems: [`The game could not be playtested: ${(e as Error).message}`],
    };
  }
}

/* --------------------------------------------------------- framework worlds -- */
/**
 * Playtest a world on the GameMog Runtime, using the runtime's own test hooks
 * rather than guessing at key presses. The rules are the runtime's and are
 * tested separately (npm run check:runtime); what is tested here is the world:
 * does it build, do its characters and obstacles work, does it hold 60 fps,
 * does a run survive several laps of rivals joining without anything throwing,
 * and does a crash report a result.
 *
 * `problems` block publishing and go back to the model. `advisories` are the
 * runtime's repairs (scenery hidden from the camera, an unfair obstacle row
 * thinned): the world still works, but the model is told once so it can do
 * better.
 */
export type WorldReport = RuntimeReport & { advisories: string[]; levelReached: number; artIcon?: Uint8Array; artWide?: Uint8Array; open?: { kos: number; heat: number; boss: boolean; police: boolean }; look?: Look;
  /** What the test drive found (1 Oct): a drive that never ran is unverified, never a pass; and the code it drove, and the code its cover shows. */
  status?: TestStatus; codeHash?: string; coverHash?: string;
  /** A Mog's DNA against its parent (6 Oct, lib/mog-dna.ts): what it dropped that the idea did not ask for, and what became of the repair. */
  dna?: DnaReport;
  /** A kart race's drive (8 Oct): what the race counted. It is stored with the draft's report, beside status and codeHash. */
  kind?: 'kart' | 'shootout' | 'gp'; kart?: KartDrive;
  /** A penalty shootout's drive (13 Oct): what its kicks counted (levelReached is the kicks driven). Stored the same way. */
  shootout?: ShootDrive;
  /** A Grand Prix's drive (18 Oct): one lap of the race on the autopilot, to its result (levelReached is the laps run). Stored the same way. */
  gp?: GpDrive };
export type TestStatus = 'passed' | 'failed' | 'unverified';
/**
 * What a Grand Prix's test drive counted (18 Oct): the race's first lap on the autopilot at six times speed (debug.gp().go,
 * the lights skipped, the field of twenty racing it) to the result the race posts (GameMog.finish): whether it came and
 * was the player's (a gp result), the place and time, whether the race replays to the same hash (the sim is
 * deterministic: debug.gp().replay()), the parts the runtime built (sim, ai, race, cam, hud, director, intro, audio, and
 * the stage and the car view, which are stand-ins at this release), the longest any car was stuck, the draw calls and
 * triangles of a frame (the 95th percentile of the race's), the frame rate of the demo, and cut: it ran out of its own time.
 */
export type GpDrive = { laps: number; results: number; won: boolean; place: number | null; timeMs: number | null; replayEqual: boolean | null; parts: Record<string, boolean>;
  maxStuck: number; calls: number | null; tris: number | null; fps: number | null; cut: boolean };
/**
 * What a kart race's test drive counted (8 Oct): the creator's browser (lib/runtime/drive.js kartDrive, checked in
 * lib/test-drive.ts judge) or the server's (below), the same fields either way. Publishing a kart world reads it from
 * the draft's report, for the code its codeHash names, to set the score's constants: L, the lap's length in metres as
 * the race built it, and trackSig, the race's signature of its track (kart.js SIM.trackSig; null from a runtime
 * without one). The rest is the race: its laps and how many of them your kart finished, your place, finished
 * (estimated: the race was called before you were home), whether you drifted, the longest any kart was stuck (s), the
 * frame rate, the results reported, the race clock (s) and the share of the race you drove when the drive stopped
 * watching, the time scale it ended at, and cut: the drive ran out of its own time before the race was over.
 */
export type KartDrive = { L: number | null; trackSig: string | null; laps: number; lapsDone: number; place: number | null; finished: boolean; estimated: boolean; drifted: boolean;
  stuck: number; fps: number | null; results: number; time: number | null; share: number; scale: number | null; cut: boolean };

/**
 * What a penalty shootout's test drive counted (13 Oct): the creator's browser (lib/runtime/drive.js shootDrive, read in
 * lib/test-drive.ts) or the server's (below), the same fields either way. kicks: the kicks driven (each a real kick at
 * the spot: the walk, the whistle, the run-up, the strike, the flight); results: the results the runtime posted for
 * them (GameMog.finish, one a kick); goals: the runtime's own tally; outcomes: each kick's ('goal', 'saved', 'over',
 * 'wide', 'post', 'bar', 'miss', or 'none' when it never came to one); parts: the director's parts and whose they were
 * ('own', or 'stand-in': the director's plain stand-in, e.g. a keeper that is no library human); failed: the parts that
 * threw; calls and tris: the most draw calls and triangles a frame seen; the frame rate; and cut: the drive ran out of
 * its own time before its last kick. keys (the server's only): its first kick was a player's keys, not the tapper.
 * lens: the sight lines from the lenses behind the goal to the goal mouth (lib/runtime/shoot-lens.js). phone: the world
 * loaded again as a phone loads it (ctx.quality 'low'), one kick there.
 */
export type ShootDrive = { kicks: number; results: number; goals: number; outcomes: string[]; parts: Record<string, string>; failed: string[];
  calls: number | null; tris: number | null; fps: number | null; cut: boolean; keys?: boolean; lens?: ShootLens | null; phone?: ShootPhone | null };
/**
 * The lenses behind the goal (13 Oct, lib/runtime/shoot-lens.js): `rays` sight lines (each lens to each point of the goal
 * mouth and the spot), `worst` the most blocked from one lens, and the world's objects in the way (`by`: a name, how
 * many lines it blocks, its centre and size in metres). `over`: the room held more than the check reads.
 */
export type ShootLens = { rays: number; targets: number; worst: number; by: { name: string; rays: number; at: number[]; size: number[] }[]; over: boolean };
/**
 * A shootout's phone load (13 Oct): the draft loaded again on ctx.quality 'low' (the server's Chrome as a phone, the
 * creator's frame with a touch screen's pointer), its demo and one kick. loaded: it became ready; errors: what threw
 * there; calls and tris: the most draw calls and triangles a frame seen there; parts and failed as the drive's;
 * kicked and ended: its one kick began, and came to a result; timedOut: the load never reported (unjudged); hidden: the
 * tab went to the background (only what threw is judged).
 */
export type ShootPhone = { loaded: boolean; timedOut: boolean; hidden: boolean; errors: string[]; calls: number | null; tris: number | null;
  parts: Record<string, string>; failed: string[]; kicked: boolean; ended: boolean; results: number };

/**
 * The kicks a shootout's test drive takes, the same on both paths: [aim x, aim y (m, at the goal), taps a second]. A warm
 * low corner, a hot high one (the key art's), and one aimed over the bar (a miss). The first is a player's on the server
 * (its keys), the director's own scripted tapper otherwise (debug.shootout().tap: the press and release a player's keys
 * run). Where each ends is the runtime's (the ball and the keeper are its own); only that each ends, and posts, is judged.
 */
export const SHOOT_KICKS: [number, number, number][] = [[-2.6, 0.5, 8], [2.9, 1.9, 11], [-0.4, 3.6, 9]];

/**
 * The draw calls and triangles a frame on a phone (ctx.quality 'low', counted in the phone load) past which a shootout is
 * told to build lighter (13 Oct): the manual's budget. (Counted on a laptop until a review: the note asked for changes
 * on 'low' that a laptop never draws, and a robot keeper's Mog paid for a repair that could not move it.)
 */
export const SHOOT_HEAVY = { calls: 150, tris: 350_000 };
/** A lens behind the goal with this many of its sight lines blocked is blocked (13 Oct: a thin pole is not). */
export const LENS_BLOCKED = 3;
const PHONE_SAID = 'On a phone (ctx.quality \'low\')';

/** The look notes a shootout's cover is judged by: not 'hidden' or 'blends' (the runtime frames the taker, and his kit is his stands' colour by design). */
export function shootLookNotes(m: Look): string[] {
  return lookNotes(m).filter((n) => n.kind !== 'hidden' && n.kind !== 'blends').map((n) => n.text);
}

/**
 * A penalty shootout's verdict (13 Oct), one function for both test drives, so the model hears the same words either
 * way. The runtime directs the shootout (the kick, the keeper, the ball, the camera, the HUD, the sound, the board), so
 * what is judged is the world round it: that nothing it does throws, that the taker and the keeper are library humans
 * the runtime could rig (the parts it made of them are its own, not its stand-ins), that every kick driven ends with a
 * result, that it runs at speed on a laptop, and that the cover is a scene. Where the ball goes is never judged.
 * timed: the drive's clock ran (not a background tab); a drive cut short before its second kick (`so.cut`), or untimed,
 * judges only what does not need the kicks (what threw, the people, and when timed the frame rate and the cover), and
 * is unverified when that finds nothing (`judged` false). The look notes leave out 'hidden' and 'blends'
 * (shootLookNotes). The lenses behind the goal must see the goal mouth (so.lens), and the phone load is judged by
 * shootPhoneVerdict (so.phone), where a heavy frame is a note, never a failure.
 */
export function shootVerdict(so: ShootDrive, m: { errors: string[]; fps: number | null; fpsCounts: boolean; timed: boolean; cover?: Uint8Array; look?: Look }) {
  const problems: string[] = [], advisories: string[] = [];
  for (const e of m.errors) problems.push(`Runtime error: ${e}`);
  const read = Object.keys(so.parts).length > 0, own = (k: string) => so.parts[k] === 'own';
  if (read && !own('people')) problems.push('player() must return the library human itself (ctx.assets.human(...)), as it comes: the taker was moved as a box, with no run-up and no kick. Build him on shootout.body and return him.');
  if (read && (!own('keeper rig') || !own('keeper'))) problems.push('rival(ctx, 1, o) must return a library human built on o.body (ctx.assets.human(o.body, ...)), as it comes: the keeper was moved as a box, with no dive.');
  const judged = m.timed && !(so.cut && so.kicks < 2);
  if (judged && so.results < so.kicks) problems.push(`Kick ${so.results + 1} of ${so.kicks} did not end with a result. Nothing in update() or a ctx.on handler may stall or throw; the runtime ends every kick and posts it.`);
  if (m.fpsCounts && m.fps !== null && m.fps < 30) problems.push(`The shootout ran at ${m.fps} fps on a laptop GPU. The stadium is the cost: seat the crowd as one InstancedMesh a side, merge the boards, the lines and the stands by material, keep one shadow-casting light, until it holds 60.`);
  if (m.timed && (!m.cover || m.cover.length < BLANK_BYTES)) problems.push('The screen is nearly a flat colour at the penalty spot. Check that build() lays the turf and its lines, the stands and the lights at the runtime\'s pitch (the goal line at z = -52.5) and that fog does not swallow them.');
  const lens = lensProblem(so.lens);
  if (lens) problems.push(lens);
  if (m.look) advisories.push(...shootLookNotes(m.look));
  const ph = shootPhoneVerdict(so.phone, m.errors, so.parts);
  problems.push(...ph.problems); advisories.push(...ph.advisories);
  return { problems, advisories, judged: judged || ph.problems.length > 0 };
}

/** What stands in the lenses' sight lines behind the goal, as the builder is told it (null when they see the goal mouth). */
export function lensProblem(l: ShootLens | null | undefined): string | null {
  if (!l || !(l.worst >= LENS_BLOCKED)) return null;
  const who = l.by.length ? l.by.map((b) => `'${b.name}' (${b.size[1]} m tall, ${b.size[0]} m wide, centred at x ${b.at[0]}, y ${b.at[1]}, z ${b.at[2]})`).join(', ') : 'something the world built';
  return `The runtime's cameras behind the goal (the keeper's shot, every replay and the key art) cannot see the goal: ${who} stands in the way, blocking ${l.worst} of the ${l.targets} sight lines from one of them to the goal mouth and the spot. Behind the goal shot at nothing may be taller than 1 m from its line (z = -52.5) back to 6 m behind it, 5 m either side of the middle: move it back or lower it.`;
}

/**
 * A shootout's phone load, judged (13 Oct), one function for both drives: what threw there (a world that throws only on
 * 'low' never loads on a phone), the taker and the keeper still the runtime's own there, and the frame's cost there
 * against the phone's budget (a note, never a failure). `seen`: what the drive itself already reported as thrown, and
 * `desk` its parts (what it already said was a stand-in is not said twice). A load that never reported, or one in a
 * background tab that threw nothing, is not judged.
 */
export function shootPhoneVerdict(ph: ShootPhone | null | undefined, seen: string[] = [], desk: Record<string, string> = {}) {
  const problems: string[] = [], advisories: string[] = [];
  if (!ph || ph.timedOut || (ph.hidden && !ph.errors.length)) return { problems, advisories };
  // (each error as the builder reads it: its first line, without the console's and the runtime's prefixes, once)
  const said = (e: string) => e.replace(/^console\.error: /, '').replace(/^\[gamemog\] /, '').split(/\n| \| /)[0].trim();
  const was = new Set(seen.map(said)), all = [...new Set(ph.errors.map(said))].filter(Boolean), errors = all.filter((e) => !was.has(e));
  if (!ph.loaded) {
    if (all.length) problems.push(`${PHONE_SAID} the world never finished loading: ${all.join(' | ')}. Check the code that runs only on 'low' (fewer crowd looks, flags, tape or flakes, a lighter keeper): every name it uses must be declared and set there too.`);
    return { problems, advisories };
  }
  for (const e of errors) problems.push(`${PHONE_SAID}, a runtime error: ${e}`);
  // (a taker or a keeper the drive already found a box is said there, once)
  const read = Object.keys(ph.parts).length > 0, own = (k: string) => ph.parts[k] === 'own', deskRead = Object.keys(desk).length > 0, deskOwn = (k: string) => desk[k] === 'own';
  const deskTaker = deskRead && !deskOwn('people'), deskKeeper = deskRead && (!deskOwn('keeper rig') || !deskOwn('keeper'));
  if (read && !own('people') && !deskTaker) problems.push(`${PHONE_SAID} the taker was moved as a box: player() must return the library human itself on 'low' too.`);
  if (read && (!own('keeper rig') || !own('keeper')) && !deskKeeper) problems.push(`${PHONE_SAID} the keeper was moved as a box: rival(ctx, 1, o) must return a library human built on o.body on 'low' too.`);
  if ((ph.calls ?? 0) > SHOOT_HEAVY.calls || (ph.tris ?? 0) > SHOOT_HEAVY.tris) advisories.push(`${PHONE_SAID} the shootout drew up to ${ph.calls} draw calls and ${(ph.tris ?? 0).toLocaleString('en-US')} triangles a frame. Hold it to ${SHOOT_HEAVY.calls} calls and ${SHOOT_HEAVY.tris.toLocaleString('en-US')} triangles there: fewer crowd looks, flags and tape on 'low', the stands, boards and lines merged by material.`);
  return { problems, advisories };
}

/** The cover: the best of three frames by how they look (lib/look.ts), and how that frame measured. */
async function bestCover(page: Parameters<Parameters<typeof withBrowser>[0]>[0]) {
  let best: { cover: Uint8Array; look: Look | undefined; score: number } | null = null;
  for (let k = 0; k < 3; k++) {
    if (k) await sleep(450);
    const look = await page.eval<unknown>('window.__gmRuntime.debug.look ? window.__gmRuntime.debug.look() : null').catch(() => null);
    const cover = await page.screenshot(80);
    const m = isLook(look) ? look : undefined, score = m ? lookScore(m) : 0;
    if (!best || score > best.score) best = { cover, look: m, score };
  }
  return best!;
}

type GpSt = { phase: string | null; done: boolean; you: number; parts: Record<string, boolean> | null; cars: { d: number; lap: number; fin: boolean; place: number; stuck: number }[] };
const GP_ST = `(() => { const g = window.__gmRuntime.state().gp; return g && g.ready ? { phase: g.phase, done: !!g.done, you: g.you, parts: g.parts,
  cars: (g.cars || []).map((c) => ({ d: +c.d || 0, lap: c.lap | 0, fin: !!c.fin, place: c.place | 0, stuck: +c.stuck || 0 })) } : null; })()`;
/** The parts a Grand Prix cannot race without; the rest (the stage, the car view, the kit) may be stand-ins. */
const GP_NEEDED = ['sim', 'ai', 'race', 'cam', 'hud'];

type RtState = { state: string; level: number; gm: number; alive: boolean; rivals: { ahead: number; x: number }[]; lap: number; obstacles: number; coins: number; crashedInto: string };

type Pg = Parameters<Parameters<typeof withBrowser>[0]>[0];
type ShootSt = { phase: string; outcome: { kind: string } | null; tally: { kicks: number; goals: number } | null; render: { calls: number; tris: number } | null;
  parts: Record<string, string> | null; failed: Record<string, string> | null };
const SHOOT_ST = `(() => { const s = window.__gmRuntime.state().shootout; return s ? { phase: s.phase, outcome: s.outcome, tally: s.tally, render: s.render, parts: s.parts, failed: s.failed } : null; })()`;
/** The phases a kick has reached its outcome in: the result, its replay, and Kick again. */
const SHOOT_DONE = new Set(['result', 'replay', 'retry']);
/** What the shootout's parts and failures say, as plain strings (stored with the draft). */
const partsOf = (p: unknown) => Object.fromEntries(Object.entries(p && typeof p === 'object' ? p as Record<string, unknown> : {}).slice(0, 24).map(([k, v]) => [String(k).slice(0, 24), String(v).slice(0, 24)]));

/** lib/runtime/shoot-lens.js, as the creator's drive page carries it (read fresh outside production). */
let LENS_JS = '';
const lensJs = () => (LENS_JS && process.env.NODE_ENV === 'production' ? LENS_JS : (LENS_JS = readFileSync(join(process.cwd(), 'lib', 'runtime', 'shoot-lens.js'), 'utf8')));
/** The lens check in this page: the world as built, the runtime's people left out (they are not the world's). */
const LENS_RUN = () => `(() => { ${lensJs()}
  const I = window.__gmRuntime.debug.internals(), P = window.__gmRuntime.debug.shootout().people() || {};
  return window.GameMogShootLens(I.THREE || window.THREE, I.scene, [P.taker, P.keeper, P.ref].filter(Boolean).map((e) => e.object)); })()`;

const real = (x: unknown, lo: number, hi: number, dp = 2) => { const n = Number(x); return x !== null && x !== '' && Number.isFinite(n) ? +Math.max(lo, Math.min(hi, n)).toFixed(dp) : null; };
const int = (x: unknown, lo: number, hi: number) => { const n = real(x, lo, hi, 0); return n === null ? null : Math.round(n); };
/** A lens check's report (lib/runtime/shoot-lens.js), each field read for what it must be (it comes from a page). */
export function readLens(v: unknown): ShootLens | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>, rays = int(o.rays, 0, 10_000), targets = int(o.targets, 0, 1000), worst = int(o.worst, 0, 1000);
  if (rays === null || targets === null || worst === null) return null;
  const xyz = (a: unknown) => (Array.isArray(a) ? a.slice(0, 3).map((x) => real(x, -1e4, 1e4) ?? 0) : [0, 0, 0]);
  const by = (Array.isArray(o.by) ? o.by : []).slice(0, 4).filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
    .map((b) => ({ name: String(b.name ?? 'a mesh').replace(/[^\w .:/'()-]/g, '').slice(0, 80) || 'a mesh', rays: int(b.rays, 0, 10_000) ?? 0, at: xyz(b.at), size: xyz(b.size) }));
  return { rays, targets, worst, by, over: o.over === true };
}
/** A phone load's report (the creator's frame, lib/runtime/drive.js phoneDrive), each field read for what it must be. */
export function readPhone(v: unknown): ShootPhone | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>, word = (x: unknown) => typeof x === 'string' && /^[a-z][a-z .-]{0,23}$/i.test(x) ? x : null;
  const parts: Record<string, string> = {};
  if (o.parts && typeof o.parts === 'object' && !Array.isArray(o.parts)) for (const [k, x] of Object.entries(o.parts as Record<string, unknown>).slice(0, 24)) { const a = word(k), b = word(x); if (a && b) parts[a] = b; }
  return { loaded: o.ready === true && o.runtime !== false && o.shootout !== false, timedOut: o.timedOut === true, hidden: o.hidden === true,
    errors: (Array.isArray(o.errors) ? o.errors : []).filter((x): x is string => typeof x === 'string').slice(0, 12).map((x) => x.slice(0, 400)),
    calls: int(o.calls, 0, 100_000), tris: int(o.tris, 0, 100_000_000), parts, failed: (Array.isArray(o.failed) ? o.failed : []).map(word).filter((x): x is string => !!x).slice(0, 24),
    kicked: o.kicked === true, ended: o.ended === true, results: int(o.results, 0, 99) ?? 0 };
}

/**
 * A shootout's phone load on the server (13 Oct): the same page in a Chrome of its own as a phone (844 x 390, a touch
 * screen, so the runtime builds the world on 'low'), the demo for four seconds and one kick through the director's
 * tapper to its result, as the creator's frame does it (lib/runtime/drive.js phoneDrive). Its own browser and time
 * (the drive's has 90 s and is spent); a load the browser gave up on is unjudged (timedOut).
 */
export async function shootPhoneLoad(url: string): Promise<ShootPhone> {
  const none: ShootPhone = { loaded: false, timedOut: true, hidden: false, errors: [], calls: null, tris: null, parts: {}, failed: [], kicked: false, ended: false, results: 0 };
  try {
    return await awake(() => withBrowser(async (page) => {
      await page.emulate({ width: 844, height: 390, mobile: true, dpr: 2 });
      await page.goto(url);
      let ready = false;
      // (a world that failed to build never will: said at once, not after the minute)
      for (let i = 0; i < 300 && !ready; i++) {
        ready = await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false);
        if (!ready && i >= 10 && await page.eval<boolean>('!!(window.__gm && (window.__gm.errors || []).some((e) => /failed to build/.test(e)))').catch(() => false)) break;
        if (!ready) await sleep(200);
      }
      const errs = async () => [...new Set([...page.errors, ...(await page.eval<string[]>('(window.__gm && window.__gm.errors) || []').catch(() => []))])].slice(0, 12);
      if (!ready) return { ...none, timedOut: false, errors: await errs() };
      const S = () => page.eval<ShootSt | null>(SHOOT_ST).catch(() => null);
      const D = (js: string) => page.eval(`(() => { const D = window.__gmRuntime.debug.shootout(); ${js} })()`).catch(() => null);
      let calls = 0, tris = 0, kicked = false, ended = false, s = await S();
      const see = (q: ShootSt | null) => { if (q && q.render) { calls = Math.max(calls, Math.round(+q.render.calls) || 0); tris = Math.max(tris, Math.round(+q.render.tris) || 0); } return q; };
      for (let i = 0; i < 16; i++) { await sleep(250); s = see(await S()); }
      if (s) {
        await D('return D.start();');
        for (let i = 0; i < 250; i++) { s = see(await S()); if (!s || s.phase === 'set') break; await sleep(100); }
        if (s && s.phase === 'set') {
          kicked = true;
          await sleep(400); see(await S());
          await D(`D.aim(${SHOOT_KICKS[0][0]}, ${SHOOT_KICKS[0][1]}); return D.tap(${SHOOT_KICKS[0][2]}, 1.6, { releaseMs: 0 });`);
          for (let i = 0; i < 300; i++) { s = see(await S()); if (s && SHOOT_DONE.has(s.phase)) { ended = true; break; } if (i >= 40 && s && s.phase === 'set' && !s.outcome) break; await sleep(100); }
          for (let i = 0; i < 150 && ended && s && s.phase !== 'retry'; i++) { if (s.phase === 'result' || s.phase === 'replay') await D('D.skip(); return 1;'); await sleep(150); s = see(await S()); }
        }
      }
      await sleep(300); s = see(await S());
      const results = await page.eval<unknown[]>('window.__gm.results || []').catch(() => []);
      return { loaded: true, timedOut: false, hidden: false, errors: await errs(), calls: calls || null, tris: tris || null, parts: partsOf(s?.parts), failed: Object.keys(partsOf(s?.failed)),
        kicked, ended, results: results.length };
    }, { width: 844, height: 390, timeoutMs: 120_000 }));
  } catch { return none; }
}

/** A shootout's report with its phone load judged in (the server's: its drive judged first, its phone load after). */
export function withPhone(r: WorldReport, phone: ShootPhone): WorldReport {
  if (!r.shootout) return r;
  const v = shootPhoneVerdict(phone, r.errors, r.shootout.parts), problems = [...r.problems, ...v.problems];
  return { ...r, ok: problems.length === 0, problems, advisories: [...r.advisories, ...v.advisories], shootout: { ...r.shootout, phone } };
}

/**
 * A penalty shootout, played (13 Oct): no laps, no rivals and no crash to end it. The runtime's director runs the
 * shootout (lib/runtime/shootout.js), so this drives it as a player would and judges the world round it (shootVerdict).
 * The demo's frame rate at real speed; then three kicks (SHOOT_KICKS). The first is a player's: Enter (and Enter again
 * on the rules), the walk to the spot and the whistle, the cover from the set (the taker on his mark, the keeper on his
 * line, the ball on the spot; HUD hidden), then Space tapped fourteen times and the last tap held, the auto strike, its
 * result and its replay, to Kick again. The other two through the director's own scripted tapper (the same press and
 * release), the second shot for the key art at its strike (captureShootoutKeyArt), their results and replays skipped.
 * A kick the keys did not start (back at the set with nothing kicked) is taken again by the tapper, so the drive's own
 * keys never fail a world.
 */
/**
 * A Grand Prix's drive (18 Oct): the demo's frame rate, then lap one of the race on the autopilot at six times speed to its
 * result, the key art and cover shot as the car comes down the start/finish straight (gpArtSpot), then the race's replay
 * (the same hash: the sim is deterministic) and the frame's cost. It never plays the whole race: a lap shows the kit,
 * the field, the rules and the result in the drive's time (a 3-lap race at six times is the checks' own).
 */
async function gpPlaytest(page: Pg, readyMs: number, errs: () => Promise<string[]>): Promise<WorldReport> {
  const S = () => page.eval<GpSt | null>(GP_ST).catch(() => null);
  const D = (js: string) => page.eval<any>(`(() => { const d = window.__gmRuntime.debug.gp(); return ${js}; })()`);
  await page.eval(`(() => { const t = window.__gmRuntime.debug.art().theme || {}; return document.fonts ? document.fonts.load('900 100px ' + (t.font || 'Figtree')).then(() => 1, () => 0) : 0; })()`).catch(() => 0);
  // the frame rate: the demo at real speed, once it has settled
  await sleep(2500);
  const f0 = await page.eval<number>('window.__frames');
  await sleep(2500);
  const fps = Math.round(((await page.eval<number>('window.__frames')) - f0) / 2.5);
  const parts = ((await S())?.parts ?? {}) as Record<string, boolean>;
  const L = await page.eval<number | null>('(() => { const g = window.__gmRuntime.state().gp; return g && g.L ? +g.L : null; })()').catch(() => null);
  const near = L ? L - GP_ART_BACK - 350 : 4950;
  await D("d.go({ seed: 11, autopilot: true, skipLights: true, laps: 1 })");
  await page.eval('window.__gmRuntime.debug.timeScale(6)');
  let s = await S(), maxStuck = 0, picked: Awaited<ReturnType<typeof bestCover>> | undefined, art: { icon: Uint8Array; wide: Uint8Array } | undefined, cut = true;
  for (let i = 0; i < 400; i++) {
    s = await S();
    if (s) maxStuck = Math.max(maxStuck, ...s.cars.map((c) => c.stuck));
    if (s?.done) { cut = false; break; }
    // the last stretch of the lap at real speed, the frame shot on the straight, then back to speed
    if (!art && s && s.cars[s.you] && s.cars[s.you].d >= near && s.cars[s.you].lap === 0) {
      if (await gpArtSpot(page)) { picked = await bestCover(page); art = await captureGpKeyArt(page).catch(() => undefined); }
      else await page.eval('window.__gmRuntime.debug.cinematic(false)').catch(() => undefined);
      await page.eval('window.__gmRuntime.debug.timeScale(6)');
    }
    await sleep(150);
  }
  await page.eval('window.__gmRuntime.debug.timeScale(1)');
  await sleep(500);
  const results = await page.eval<any[]>('window.__gm.results').catch(() => []);
  const rep = await D('d.replay()').catch(() => null) as { equal?: boolean } | null;
  const rend = await D('d.render()').catch(() => null) as { p95?: { calls?: number; tris?: number } } | null;
  if (!picked) picked = await bestCover(page);
  const errors = await errs();
  const advisories: string[] = await page.eval<string[]>('window.__gm.warnings || []').catch(() => []);
  if (picked.look) advisories.push(...lookAdvisories(picked.look));
  const first = results[0] ?? null, me = s && s.cars[s.you] ? s.cars[s.you] : null;
  const gd: GpDrive = { laps: me ? me.lap : 0, results: results.length, won: !!(first && first.gp === true), place: first && Number.isFinite(+first.place) ? Math.round(+first.place) : null,
    timeMs: first && Number.isFinite(+first.timeMs) ? Math.round(+first.timeMs) : null, replayEqual: rep && typeof rep.equal === 'boolean' ? rep.equal : null, parts,
    maxStuck: Math.round(maxStuck * 10) / 10, calls: int(rend?.p95?.calls, 0, 100_000), tris: int(rend?.p95?.tris, 0, 100_000_000), fps, cut };
  const v = gpVerdict(gd, { errors, fps, cover: picked.cover, art: !!art, cutFails: true });
  return { ok: v.problems.length === 0, ran: true, readyMs, fps, errors, problems: v.problems, advisories: [...advisories, ...v.advisories], levelReached: gd.laps, cover: picked.cover, artIcon: art?.icon, artWide: art?.wide, look: picked.look, kind: 'gp', gp: gd };
}

/**
 * A Grand Prix's drive, judged (21 Oct): one function for the server's drive (gpPlaytest) and the creator's
 * (lib/runtime/drive.js gpDrive, judged in lib/test-drive.ts), so the builder hears the same notes either way. `timed`
 * false (a background tab) judges only what threw; a drive out of its time before the lap was home (cut) is not the
 * world's fault when nothing else is wrong, and is unverified.
 */
export function gpVerdict(gd: GpDrive, o: { errors: string[]; fps: number | null; cover?: Uint8Array; art: boolean; timed?: boolean; fpsCounts?: boolean; cutFails?: boolean }) {
  const timed = o.timed !== false, fpsCounts = o.fpsCounts !== false && timed, parts = gd.parts;
  const problems: string[] = o.errors.map((e) => `Runtime error: ${e}`), advisories: string[] = [];
  const missing = GP_NEEDED.filter((p) => !parts[p]);
  if (missing.length) problems.push(`The Grand Prix's runtime parts did not all start (missing: ${missing.join(', ')}).`);
  if (gd.replayEqual === false) problems.push('The race did not replay to the same hash: the sim is not deterministic.');
  if (timed) {
    if (fpsCounts && o.fps !== null && o.fps < 30) problems.push(`The Grand Prix ran at ${o.fps} fps on a laptop GPU. Cut draw calls and lights until it holds 60.`);
    if (gd.cut && o.cutFails) problems.push('The first lap of the race was not finished in the time it should take at six times speed.');
    else if (gd.cut) { if (!problems.length) advisories.push('The test drive ran out of time before the first lap of the race was home, so it did not judge the race.'); }
    else if (!gd.won) problems.push('The race ended without a Grand Prix result for the player.');
    if ((gd.maxStuck ?? 0) > 8) problems.push(`A car was stuck for ${gd.maxStuck} s in the race.`);
    if (!o.cover || o.cover.length < 14_000) problems.push('The screen is nearly a flat colour in the Grand Prix. Check the circuit, the lights and the camera.');
    if (!o.art) advisories.push('No key art could be shot on the start/finish straight (the race was over before the car reached it).');
  }
  const stand = Object.keys(parts).filter((p) => !parts[p]).filter((p) => !GP_NEEDED.includes(p));
  if (stand.length) advisories.push(`Stand-ins in this Grand Prix: ${stand.join(', ')}.`);
  return { problems, advisories, judged: problems.length > 0 || (timed && (!gd.cut || !!o.cutFails)) };
}

async function shootPlaytest(page: Pg, readyMs: number, errs: () => Promise<string[]>): Promise<WorldReport> {
  const S = () => page.eval<ShootSt>(SHOOT_ST);
  const D = (js: string) => page.eval(`(() => { const D = window.__gmRuntime.debug.shootout(); ${js} })()`);
  let calls = 0, tris = 0, s = await S();
  const see = (q: ShootSt) => { if (q && q.render) { calls = Math.max(calls, Math.round(+q.render.calls) || 0); tris = Math.max(tris, Math.round(+q.render.tris) || 0); } return q; };
  see(s);
  // the title's face, ready before the key art
  await page.eval(`(() => { const t = window.__gmRuntime.debug.art().theme || {}; return document.fonts ? document.fonts.load('900 100px ' + (t.font || 'Figtree')).then(() => 1, () => 0) : 0; })()`).catch(() => 0);
  // the frame rate: the demo at real speed, once it has settled
  await sleep(2500);
  const f0 = await page.eval<number>('window.__frames');
  await sleep(2500);
  const fps = Math.round(((await page.eval<number>('window.__frames')) - f0) / 2.5);
  see(await S());
  // the lenses behind the goal (lib/runtime/shoot-lens.js, as the creator's drive reads them)
  const lens = readLens(await page.eval(LENS_RUN()).catch(() => null));
  const outcomes: string[] = [];
  let kicks = 0, keys = false, picked: Awaited<ReturnType<typeof bestCover>> | undefined, art: { icon: Uint8Array; wide: Uint8Array } | undefined;
  const tapped = (k: number) => D(`D.aim(${SHOOT_KICKS[k][0]}, ${SHOOT_KICKS[k][1]}); return D.tap(${SHOOT_KICKS[k][2]}, 1.6, { releaseMs: 0 });`);
  // to the kick's outcome (the key art at the second kick's strike); back at the set with nothing kicked, false
  const toOutcome = async (k: number) => {
    for (let i = 0; i < 300; i++) {
      s = see(await S());
      if (k === 1 && !art && (s.phase === 'strike' || s.phase === 'flight')) { art = await captureShootoutKeyArt(page).catch(() => undefined); s = see(await S()); }
      if (SHOOT_DONE.has(s.phase)) return true;
      if (i >= 40 && s.phase === 'set' && !s.outcome) return false;
      await sleep(100);
    }
    return false;
  };
  for (let k = 0; k < SHOOT_KICKS.length; k++) {
    if (k === 0) {
      await page.key('Enter'); await sleep(700);
      if ((await S()).phase === 'start') { await page.key('Enter'); await sleep(500); }
      // (keys that did not start it, the drive's and not the world's fault: the director's own start)
      if (/^(demo|start)$/.test((await S()).phase)) await D('return D.start();');
    } else await D('return D.start();');
    s = await S();
    for (let i = 0; i < 250 && s.phase !== 'set'; i++) { await sleep(100); s = await S(); }
    kicks++;
    if (s.phase !== 'set') { outcomes.push('none'); break; }
    see(s);
    let done: boolean;
    if (k === 0) {
      await D('D.film(true); return 1;'); await sleep(120);
      picked = await bestCover(page);
      await D('D.film(false); return 1;');
      for (let i = 0; i < 14; i++) { await page.key('Space', 'keyDown'); await sleep(45); await page.key('Space', 'keyUp'); await sleep(65); }
      await page.key('Space', 'keyDown');
      done = keys = await toOutcome(k);
      await page.key('Space', 'keyUp');
      if (!done && (await S()).phase === 'set') { await tapped(k); done = await toOutcome(k); }
    } else { await tapped(k); done = await toOutcome(k); }
    outcomes.push(s.outcome && typeof s.outcome.kind === 'string' ? s.outcome.kind.slice(0, 12) : 'none');
    if (!done) break;
    // the first kick's result and replay play out; the others are skipped. Kick again is where its result is posted
    for (let i = 0; i < 150 && s.phase !== 'retry'; i++) {
      if (k > 0 && (s.phase === 'result' || s.phase === 'replay')) await D('D.skip(); return 1;');
      await sleep(150); s = see(await S());
    }
  }
  await sleep(300);
  s = see(await S());
  const results = await page.eval<unknown[]>('window.__gm.results').catch(() => []);
  const errors = await errs();
  const advisories: string[] = await page.eval<string[]>('window.__gm.warnings || []').catch(() => []);
  const so: ShootDrive = { kicks, results: results.length, goals: Math.max(0, Math.round(Number(s?.tally?.goals) || 0)), outcomes, parts: partsOf(s?.parts), failed: Object.keys(partsOf(s?.failed)),
    calls: calls || null, tris: tris || null, fps, cut: false, keys, lens };
  const v = shootVerdict(so, { errors, fps, fpsCounts: true, timed: true, cover: picked?.cover, look: picked?.look });
  return { ok: v.problems.length === 0, ran: true, readyMs, fps, errors, problems: v.problems, advisories: [...advisories, ...v.advisories], levelReached: kicks,
    cover: picked?.cover, artIcon: art?.icon, artWide: art?.wide, look: picked?.look, kind: 'shootout', shootout: so };
}

export async function playtestWorld(url: string): Promise<WorldReport> {
  const empty = { ok: true, ran: false, readyMs: null, fps: null, errors: [], problems: [], advisories: [], levelReached: 0 };
  if (!chromePath()) return empty;
  try {
    const report: WorldReport = await awake(() => withBrowser(async (page) => {
      await page.emulate({ width: 1280, height: 720 });
      await page.preload('window.__frames = 0; (function tick() { window.__frames++; requestAnimationFrame(tick); })();');
      const t0 = Date.now();
      await page.goto(url);
      let readyMs: number | null = null;
      for (let i = 0; i < 100; i++) {
        if (await page.eval<boolean>('!!(window.__gm && window.__gm.ready)').catch(() => false)) { readyMs = Date.now() - t0; break; }
        await sleep(200);
      }
      const problems: string[] = [];
      const errs = async () => [...new Set([...page.errors, ...(await page.eval<string[]>('(window.__gm && window.__gm.errors) || []').catch(() => []))])].slice(0, 12);
      if (readyMs === null) {
        const e = await errs();
        problems.push('The world never finished loading.' + (e.length ? ' Errors: ' + e.join(' | ') : ' GameMog.world() may never have been called.'));
        return { ok: false, ran: true, readyMs, fps: null, errors: e, problems, advisories: [], levelReached: 0 };
      }
      const hasRuntime = await page.eval<boolean>('!!window.__gmRuntime').catch(() => false);
      if (!hasRuntime) {
        const e = await errs();
        problems.push('The runtime did not start the world. ' + (e.join(' | ') || 'Check that GameMog.world({...}) is called with track, build, player, rival and obstacles.'));
        return { ok: false, ran: true, readyMs, fps: null, errors: e, problems, advisories: [], levelReached: 0 };
      }
      const st = () => page.eval<RtState>('window.__gmRuntime.state()');

      // an open world: no laps. It must run at speed, its people must come and
      // fight and go down, the heat must bring the police and a boss, and a
      // knockout of the player must end the run with a result.
      type OpenState = { heat: number; time: number; kos: number; gm: number; boss: { name: string } | null; bosses?: boolean; player: { hp: number; ko: boolean } | null; enemies: { ko: boolean }[]; civilians: number; police: string[]; ready: boolean };
      const open = await page.eval<OpenState | null>('window.__gmRuntime.state().open').catch(() => null);
      if (open) {
        const os = () => page.eval<OpenState>('window.__gmRuntime.state().open');
        // a library map (the city) builds after the page is ready: drive the world it makes, not the build
        for (let i = 0; i < 150 && !(await os()).ready; i++) await sleep(200);
        await page.eval('window.__gmRuntime.debug.start()');
        await page.eval('window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.autopilot(true)');
        // the frame rate of play once it has settled: the first seconds build the first people and let the runtime
        // find the resolution the card holds (v1.js adapt), and a big map (the city) is still sending itself over
        await sleep(4000);
        const f0 = await page.eval<number>('window.__frames');
        await sleep(2500);
        const fps = Math.round(((await page.eval<number>('window.__frames')) - f0) / 2.5);
        await page.eval('window.__gmRuntime.debug.timeScale(4)');
        let o = await os();
        for (let i = 0; i < 60 && o.kos < 4; i++) { await sleep(400); o = await os(); }
        const kos = o.kos;
        // the heat: police by patrol car, and a boss at level 3
        await page.eval('window.__gmRuntime.debug.open().heat(3)');
        let sawBoss = false, sawPolice = false;
        for (let i = 0; i < 40; i++) { await sleep(300); o = await os(); sawBoss = sawBoss || !!o.boss; sawPolice = sawPolice || o.police.length > 0; if (sawBoss && sawPolice) break; }
        // a world whose heat sends no boss (open.heat.bosses: false: its story's beats bring them, and no beat plays under
        // the autopilot) is asked for one directly, so its boss is still seen to come
        if (!sawBoss && o.bosses === false) {
          await page.eval('window.__gmRuntime.debug.open().boss()');
          for (let i = 0; i < 40 && !sawBoss; i++) { await sleep(300); o = await os(); sawBoss = !!o.boss; }
        }
        await page.eval('window.__gmRuntime.debug.timeScale(1)');
        await sleep(1500);
        const art = await captureWorldKeyArt(page).catch(() => undefined);
        await page.eval('window.__gmRuntime.debug.cinematic(true); window.__gmRuntime.debug.film(null)');
        await sleep(600);
        const { cover, look } = await bestCover(page);
        await page.eval('window.__gmRuntime.debug.cinematic(false)');
        await page.eval('window.__gmRuntime.debug.invincible(false); window.__gmRuntime.debug.autopilot(false); window.__gmRuntime.debug.open().hurt(9999)');
        await sleep(3200);
        const results = await page.eval<unknown[]>('window.__gm.results').catch(() => []);
        const errors = await errs();
        const advisories: string[] = await page.eval<string[]>('window.__gm.warnings || []').catch(() => []);
        if (look) advisories.push(...lookAdvisories(look));
        for (const e of errors) problems.push(`Runtime error: ${e}`);
        if (fps < 30) problems.push(`The open world ran at ${fps} fps on a laptop GPU. Instance repeated scenery, cut draw calls and lights, keep the crowd modest, until it holds 60.`);
        if (kos < 2) problems.push(`In the time a few fights should take, only ${kos} people were knocked out. Check that the map leaves open ground to stand and fight on, and that nothing blocks the people from reaching the player.`);
        if (!sawBoss) problems.push(o.bosses === false ? 'Asked for a boss (the heat sends none: open.heat.bosses is false), none came. Check open.crew.boss.' : 'Raising the heat to 3 brought no boss. Check open.crew.boss.');
        if (!results.length) problems.push('A knockout of the player did not end the run with a result.');
        if (cover.length < 14_000) problems.push('The screen is nearly a flat colour in the open world. Check the map or the ground, the lights and the camera.');
        return { ok: problems.length === 0, ran: true, readyMs, fps, errors, problems, advisories, levelReached: o.heat, cover, artIcon: art?.icon, artWide: art?.wide, open: { kos, heat: o.heat, boss: sawBoss, police: sawPolice }, look } as WorldReport;
      }

      // a penalty shootout (13 Oct): kicks at the spot, not laps (shootPlaytest)
      if (await page.eval<ShootSt | null>(SHOOT_ST).catch(() => null)) return await shootPlaytest(page, readyMs, errs);
      // a Grand Prix (18 Oct): one lap of the race to its result (gpPlaytest)
      if (await page.eval<GpSt | null>(GP_ST).catch(() => null)) return await gpPlaytest(page, readyMs, errs);

      // a kart race (6 Oct): no endless lap and no crash to end it. Eight karts must race three laps on the
      // autopilot (at 3x) with the laps going by and nobody stuck, at a real frame rate, and the finish must bring
      // the podium and a result; the cover is taken mid-drift
      type KartSt = { state: string; lapsDone: number; laps: number; place: number; drift: { dir: number; tier: number; charge: number; most?: { tier: number; charge: number } }; karts: { name: string; stuck: number; lapsDone: number; fin: boolean; prog: number }[];
        L: number; trackSig?: string; time: number; finished: boolean; est: boolean };
      const kart = await page.eval<KartSt | null>('window.__gmRuntime.state().kart').catch(() => null);
      if (kart) {
        const ks = () => page.eval<KartSt>('window.__gmRuntime.state().kart');
        const K = (js: string) => page.eval(`(() => { const K = window.__gmRuntime.debug.kart(); ${js} })()`);
        await page.eval('window.__gmRuntime.debug.start()');
        await K('K.autopilot(true); K.go();');
        await sleep(2500);
        const f0 = await page.eval<number>('window.__frames');
        await sleep(2500);
        const fps = Math.round(((await page.eval<number>('window.__frames')) - f0) / 2.5);
        // the cover: mid-drift, at real speed (a drift well under way, its first tier reached or near it, looked for ten
        // times a second). Whether your kart drifted at all is the race's own count, step by step (drift.most: the most
        // charge and tier any drift of yours reached this race), read after the race: 8 Oct, judged from the looks
        // alone, a drift through a short bend could reach its tier and end between two of them, and the check failed now
        // and then on a track that drifts every lap
        let k = await ks(), drifting = false;
        const drifted = (q: KartSt) => !!q.drift.most && (q.drift.most.tier >= 1 || q.drift.most.charge >= 0.4);
        for (let i = 0; i < 300 && !drifting; i++) { await sleep(100); k = await ks(); drifting = k.drift.tier >= 1 || (k.drift.dir !== 0 && k.drift.charge >= 0.4); }
        await page.eval('window.__gmRuntime.debug.cinematic(true)');
        const picked = await bestCover(page);
        await page.eval('window.__gmRuntime.debug.cinematic(false)');
        await K('K.timeScale(3);');
        for (let i = 0; i < 260 && k.state !== 'finish' && k.state !== 'podium' && k.state !== 'results'; i++) { await sleep(400); k = await ks(); }
        const stuck = Math.max(...k.karts.map((q) => q.stuck)), laps = k.lapsDone, drifts = drifting || drifted(k);
        // the key art, from in front of your kart (the platform's title over it)
        await K('K.timeScale(1); K.film({ mode: "front", distance: 7.5, height: 1.5, fov: 46 });');
        const art = await captureWorldKeyArt(page, { kart: true }).catch(() => undefined);
        await K('K.film(null); K.timeScale(8);');
        for (let i = 0; i < 60 && k.state !== 'results'; i++) { await sleep(300); k = await ks(); }
        const results = await page.eval<unknown[]>('window.__gm.results').catch(() => []);
        const errors = await errs();
        const advisories: string[] = await page.eval<string[]>('window.__gm.warnings || []').catch(() => []);
        if (picked.look) advisories.push(...lookAdvisories(picked.look));
        for (const e of errors) problems.push(`Runtime error: ${e}`);
        if (fps < 30) problems.push(`The kart race ran at ${fps} fps on a laptop GPU with eight karts. Instance repeated scenery with ctx.instanced, merge the karts' meshes by material, keep one shadow-casting light, until it holds 60.`);
        if (laps < k.laps) problems.push(`On the autopilot your kart finished only ${laps} of ${k.laps} laps in the time a race takes. Check the track: a loop the karts can drive (no hairpin tighter than 14 m on the racing line), nothing in update() or animate() stalling the game.`);
        if (stuck > 3) problems.push(`A kart was stuck for ${stuck.toFixed(1)} s. Check that nothing the world builds stands on the road or between the walls (kart.course.shoulder).`);
        if (!drifts) problems.push('Your kart never drifted on the autopilot. Give the track at least one hairpin (16 to 22 m) and two sweepers.');
        if (!results.length) problems.push('The race did not end in the results: the finish, the podium and the result never came.');
        if (picked.cover.length < 14_000) problems.push('The screen is nearly a flat colour while racing. Check that build() adds the ground, the road and lights, and that the sky and fog do not swallow everything.');
        // what the race counted, as the browser's drive reports it (KartDrive): publishing reads the lap and the track's signature
        const all = k.laps * k.L, kartDrive: KartDrive = { L: k.L, trackSig: typeof k.trackSig === 'string' ? k.trackSig : null, laps: k.laps, lapsDone: laps, place: k.place, finished: !!k.finished, estimated: !!k.est,
          drifted: drifts, stuck: +stuck.toFixed(2), fps, results: results.length, time: k.time, share: all > 0 ? +Math.max(0, Math.min(1, (k.karts[0]?.prog ?? 0) / all)).toFixed(3) : 0, scale: 3, cut: false };
        return { ok: problems.length === 0, ran: true, readyMs, fps, errors, problems, advisories, levelReached: laps, cover: picked.cover, artIcon: art?.icon, artWide: art?.wide, look: picked.look, kind: 'kart', kart: kartDrive };
      }

      await page.eval('window.__gmRuntime.debug.start()');
      await sleep(3600);
      // real speed, driven, collisions off: the frame rate a player would get
      await page.eval('window.__gmRuntime.debug.invincible(true); window.__gmRuntime.debug.autopilot(true)');
      const f0 = await page.eval<number>('window.__frames');
      await sleep(2500);
      const fps = Math.round(((await page.eval<number>('window.__frames')) - f0) / 2.5);

      // Reach lap 3 quickly. This is the first frame with a small field around
      // the player, and the best moment for the world's permanent key art.
      await page.eval('window.__gmRuntime.debug.timeScale(6)');
      let s = await st();
      for (let i = 0; i < 70 && s.level < 3; i++) { await sleep(400); s = await st(); }
      const art = s.level >= 3 ? await captureWorldKeyArt(page).catch(() => undefined) : undefined;

      // Continue through several laps to exercise rival joins and world code.
      await page.eval('window.__gmRuntime.debug.timeScale(6)');
      for (let i = 0; i < 70 && s.level < 5; i++) { await sleep(400); s = await st(); }
      const levelReached = s.level;

      // the cover: real speed, a rival in frame ahead
      await page.eval('window.__gmRuntime.debug.timeScale(1)');
      let cover: Uint8Array | undefined;
      for (let i = 0; i < 40; i++) {
        s = await st();
        if (s.rivals.some((r) => r.ahead > 6 && r.ahead < 22)) break;
        await sleep(150);
      }
      await page.eval('window.__gmRuntime.debug.cinematic(true)');
      await sleep(60);
      const picked = await bestCover(page);
      cover = picked.cover;
      await page.eval('window.__gmRuntime.debug.cinematic(false)');

      // a crash must end the run and report a result
      await page.eval('window.__gmRuntime.debug.invincible(false); window.__gmRuntime.debug.autopilot(false); window.__gmRuntime.debug.crashInto()');
      await sleep(2400);
      const results = await page.eval<{ level: number }[]>('window.__gm.results').catch(() => []);
      const errors = await errs();
      const advisories: string[] = await page.eval<string[]>('window.__gm.warnings || []').catch(() => []);
      if (picked.look) advisories.push(...lookAdvisories(picked.look));

      for (const e of errors) problems.push(`Runtime error: ${e}`);
      if (levelReached < 4) problems.push(`A run reached only level ${levelReached} in the time several laps should take. Check that the track loop is sensible and nothing in update() or animate() stalls the game.`);
      if (fps < 30) problems.push(`The world ran at ${fps} fps on a laptop GPU. Instance repeated scenery with ctx.instanced, reduce geometry detail, use at most one shadow-casting light, until it holds 60.`);
      if (!results.length) problems.push('A crash did not end the run with a result. Do not interfere with the runtime; make sure nothing throws in animate().');
      if (cover.length < 14_000) problems.push('The screen is nearly a flat colour while racing. Check that build() adds the ground, the track surface and lights, and that the sky and fog do not swallow everything.');

      return { ok: problems.length === 0, ran: true, readyMs, fps, errors, problems, advisories, levelReached, cover, artIcon: art?.icon, artWide: art?.wide, look: picked.look };
    }, { width: 1280, height: 807, timeoutMs: 90_000 }));
    // a penalty shootout that loaded (13 Oct): then its phone load, in a Chrome of its own, judged in
    return report.kind === 'shootout' && report.shootout && report.readyMs !== null ? withPhone(report, await shootPhoneLoad(url)) : report;
  } catch (e) {
    return { ...empty, ok: false, ran: true, problems: [`The world could not be playtested: ${(e as Error).message}`] };
  }
}
