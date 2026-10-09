import { createHash } from 'node:crypto';
import { chromePath } from './browser';
import type { WorldReport, TestStatus, KartDrive } from './playtest-runtime';
import { lookScore, lookAdvisories, isLook, type Look } from './look';
import { readSoundtrack } from './world-options';

/**
 * The test drive in the creator's browser (the owner, 30 Sep). A server with no
 * graphics card cannot drive a world at speed (lib/browser.ts), so where there
 * is no Chrome to hand, the builder hands the draft to the page that asked for
 * it: the build stream says "drive", the page plays /d/<id>/play?drive=1 in its
 * build show (lib/runtime/drive.js runs the drive inside the sandbox), and posts
 * what it measured to /api/generate/drive. The judging is here, with the same
 * rules and words as lib/playtest-runtime.ts, so the model hears the same notes
 * either way. A drive that never reports is skipped, as one with no Chrome is.
 */
export function drivesInBrowser() {
  return !chromePath() || process.env.GAMEMOG_DRIVE === 'browser';
}

type Pending = { token: string; resolve: (r: WorldReport) => void; timer?: ReturnType<typeof setTimeout>; skip: () => void; until: number };
// one map for the whole process: each route is its own bundle
const G = globalThis as unknown as { __gmDrives?: Map<string, Pending> };
const pending = (G.__gmDrives ??= new Map<string, Pending>());

// skipped is not failed (the world is not held back) and not passed: nobody played it (testStatus says unverified)
const SKIPPED: WorldReport = { ok: true, ran: false, readyMs: null, fps: null, errors: [], problems: [], advisories: [], levelReached: 0 };

/** Which code a report or a cover belongs to: a world is rewritten between passes. */
export const codeHash = (code: string) => createHash('sha256').update(code).digest('hex').slice(0, 16);
/** A report's verdict: passed only when a drive ran and found nothing. */
export const testStatus = (r: { ok?: boolean; ran?: boolean }): TestStatus => (!r.ran ? 'unverified' : r.ok ? 'passed' : 'failed');

// a creator who has switched tabs is waited for, a minute and a half at a time, never longer than this
const HOLD_MAX = 15 * 60_000;

/**
 * Waits for the creator's page to drive the draft; skipped after `ms`, unless the page asks to hold. `signal`: the
 * build's own (app/api/generate/route.ts), which aborts when the creator has left: nobody is there to drive it, so the
 * wait ends at once, skipped, and the build stops (the owner's safety limits, 9 Oct).
 */
export function waitForDrive(draftId: string, token: string, ms = 240_000, signal?: AbortSignal): Promise<WorldReport> {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(p.timer); signal?.removeEventListener('abort', p.skip); if (pending.get(draftId) === p) pending.delete(draftId); };
    const p: Pending = {
      token, until: Date.now() + HOLD_MAX,
      skip: () => { done(); resolve(SKIPPED); },
      resolve: (r) => { done(); resolve(r); },
    };
    if (signal?.aborted) return p.skip();
    p.timer = setTimeout(p.skip, ms);
    pending.set(draftId, p);
    signal?.addEventListener('abort', p.skip, { once: true });
  });
}

/**
 * The creator's page is still open but its tab is in the background, where a
 * browser stops drawing and the drive cannot run (1 Oct: a Mog built in a
 * background tab published with no cover). It asks to be waited for; the
 * drive runs when the tab comes back.
 */
export function holdDrive(draftId: string, token: string) {
  const p = pending.get(draftId);
  if (!p || p.token !== token) return false;
  clearTimeout(p.timer);
  p.timer = setTimeout(p.skip, Math.max(0, Math.min(90_000, p.until - Date.now())));
  return true;
}

const num = (v: unknown, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : null; };
const strs = (v: unknown, n: number) => (Array.isArray(v) ? v : []).filter((x) => typeof x === 'string').slice(0, n).map((s: string) => s.slice(0, 400));
/** A JPEG from the drive, or nothing: the bytes must be one, and not huge. */
function jpeg(v: unknown): Uint8Array | undefined {
  if (typeof v !== 'string' || !v.startsWith('data:image/jpeg;base64,') || v.length > 3_000_000) return undefined;
  const b = Buffer.from(v.slice(23), 'base64');
  return b.length > 2000 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? new Uint8Array(b) : undefined;
}

/** A kart race's count from the drive (lib/runtime/drive.js kartDrive), each field read for what it must be: it is stored with the draft. */
function kartOf(v: unknown): KartDrive {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const real = (x: unknown, lo: number, hi: number, dp: number) => { const n = Number(x); return x !== null && x !== '' && Number.isFinite(n) ? +Math.max(lo, Math.min(hi, n)).toFixed(dp) : null; };
  return { L: real(o.L, 0, 100_000, 1), trackSig: typeof o.trackSig === 'string' && /^[0-9a-f]{8,64}$/.test(o.trackSig) ? o.trackSig : null,
    laps: num(o.laps, 0, 99) ?? 0, lapsDone: num(o.lapsDone, 0, 99) ?? 0, place: num(o.place, 1, 99), finished: o.finished === true, estimated: o.estimated === true, drifted: o.drifted === true,
    stuck: real(o.stuck, 0, 100_000, 2) ?? 0, fps: num(o.fps, 0, 500), results: num(o.results, 0, 99) ?? 0, time: real(o.time, 0, 100_000, 1), share: real(o.share, 0, 1, 3) ?? 0,
    scale: num(o.scale, 1, 8), cut: o.cut === true };
}

/** What the drive measured, judged as the server's own test drive would. */
export function judge(raw: Record<string, unknown>, images: { cover?: unknown; covers?: unknown; artIcon?: unknown; artWide?: unknown }): WorldReport {
  if (raw.timedOut) return SKIPPED;
  const errors = strs(raw.errors, 12), advisories = strs(raw.advisories, 12), problems: string[] = [];
  const readyMs = num(raw.readyMs, 0, 600_000);
  if (raw.crashed) return { ...SKIPPED, ok: false, ran: true, readyMs, errors, problems: [`The world could not be playtested: ${String(raw.crashed).slice(0, 300)}`] };
  // (a kart race that has not loaded in the minute its drive waits, with nothing thrown, is unverified, not failed:
  // it downloads its racers over the creator's own line, about 40 MB inside the frame, which caches nothing, and a
  // failure here would pay for repairs of a fault the world does not have. Anything thrown still fails it)
  if (!raw.ready && raw.kind === 'kart' && !errors.length) return { ...SKIPPED, errors, advisories: ['The kart race took longer than a minute to load in this browser, so the test drive did not judge it.'] };
  if (!raw.ready) {
    problems.push('The world never finished loading.' + (errors.length ? ' Errors: ' + errors.join(' | ') : ' GameMog.world() may never have been called.'));
    return { ...SKIPPED, ok: false, ran: true, errors, problems };
  }
  if (!raw.runtime) {
    problems.push('The runtime did not start the world. ' + (errors.join(' | ') || 'Check that GameMog.world({...}) is called with track, build, player, rival and obstacles.'));
    return { ...SKIPPED, ok: false, ran: true, readyMs, errors, problems };
  }
  const fps = num(raw.fps, 0, 500), levelReached = num(raw.levelReached, 0, 99) ?? 0, results = num(raw.results, 0, 99) ?? 0;
  const artIcon = jpeg(images.artIcon), artWide = jpeg(images.artWide);
  // the cover: the best-looking of the frames the drive measured (lib/look.ts)
  let cover = jpeg(images.cover), look: Look | undefined, best = -Infinity;
  const covers = Array.isArray(images.covers) ? images.covers.slice(0, 3) : [], looks = Array.isArray(raw.looks) ? raw.looks : [];
  covers.forEach((c, i) => {
    const img = jpeg(c); if (!img) return;
    const m = isLook(looks[i]) ? looks[i] as Look : undefined, sc = m ? lookScore(m) : -1e9;
    if (sc > best) { best = sc; cover = img; look = m; }
  });
  if (look) advisories.push(...lookAdvisories(look));
  // a hidden tab stops the world's clock, so only what threw counts; a phone is
  // not the laptop the frame-rate rule was written for
  const timed = !raw.hidden, fpsCounts = timed && !raw.mobile;
  for (const e of errors) problems.push(`Runtime error: ${e}`);
  // a kart race (8 Oct): three laps to a finish, never the endless lap's levels, judged by the server's kart rules and
  // words (lib/playtest-runtime.ts). A hidden tab stops the race's clock, and a drive out of its own time before the
  // race was home (cut: a machine too slow for the 200 s the page gives it) never saw the race end: neither is the
  // world's fault and neither is a pass. What threw still fails it, and a cut drive's frame rate and cover (taken at
  // real speed before the race ran on) still count; with nothing found, the drive is unverified (ran: false). Only
  // dropping the level rule would have passed a kart that never left the grid.
  if (raw.kind === 'kart') {
    const kart = kartOf(raw.kart), seen = { levelReached: kart.lapsDone, cover, artIcon, artWide, look, kind: 'kart' as const, kart };
    const slow = fpsCounts && fps !== null && fps < 30, flat = timed && (!cover || cover.length < 14_000);
    const SLOW = `The kart race ran at ${fps} fps on a laptop GPU with eight karts. Instance repeated scenery with ctx.instanced, merge the karts' meshes by material, keep one shadow-casting light, until it holds 60.`;
    const FLAT = 'The screen is nearly a flat colour while racing. Check that build() adds the ground, the road and lights, and that the sky and fog do not swallow everything.';
    if (!timed || kart.cut) {
      if (slow) problems.push(SLOW);
      if (flat) problems.push(FLAT);
      return { ok: problems.length === 0, ran: problems.length > 0, readyMs, fps, errors, problems, advisories, ...seen };
    }
    if (slow) problems.push(SLOW);
    if (!kart.laps || kart.lapsDone < kart.laps) problems.push(`On the autopilot your kart finished only ${kart.lapsDone} of ${kart.laps || 'its'} laps in the time a race takes. Check the track: a loop the karts can drive (no hairpin tighter than 14 m on the racing line), nothing in update() or animate() stalling the game.`);
    if (kart.stuck > 3) problems.push(`A kart was stuck for ${kart.stuck.toFixed(1)} s. Check that nothing the world builds stands on the road or between the walls (kart.course.shoulder).`);
    if (!kart.drifted) problems.push('Your kart never drifted on the autopilot. Give the track at least one hairpin (16 to 22 m) and two sweepers.');
    if (!results) problems.push('The race did not end in the results: the finish, the podium and the result never came.');
    if (flat) problems.push(FLAT);
    return { ok: problems.length === 0, ran: true, readyMs, fps, errors, problems, advisories, ...seen };
  }
  if (raw.open) {
    const kos = num(raw.kos, 0, 999) ?? 0;
    if (fpsCounts && fps !== null && fps < 30) problems.push(`The open world ran at ${fps} fps on a laptop GPU. Instance repeated scenery, cut draw calls and lights, keep the crowd modest, until it holds 60.`);
    if (timed && kos < 2) problems.push(`In the time a few fights should take, only ${kos} people were knocked out. Check that the map leaves open ground to stand and fight on, and that nothing blocks the people from reaching the player.`);
    if (timed && !raw.boss) problems.push('Raising the heat to 3 brought no boss. Check open.crew.boss.');
    if (timed && !results) problems.push('A knockout of the player did not end the run with a result.');
    if (timed && (!cover || cover.length < 14_000)) problems.push('The screen is nearly a flat colour in the open world. Check the map or the ground, the lights and the camera.');
    return { ok: problems.length === 0, ran: true, readyMs, fps, errors, problems, advisories, levelReached, cover, artIcon, artWide, open: { kos, heat: levelReached, boss: !!raw.boss, police: !!raw.police }, look };
  }
  if (timed && levelReached < 4) problems.push(`A run reached only level ${levelReached} in the time several laps should take. Check that the track loop is sensible and nothing in update() or animate() stalls the game.`);
  if (fpsCounts && fps !== null && fps < 30) problems.push(`The world ran at ${fps} fps on a laptop GPU. Instance repeated scenery with ctx.instanced, reduce geometry detail, use at most one shadow-casting light, until it holds 60.`);
  if (timed && !results) problems.push('A crash did not end the run with a result. Do not interfere with the runtime; make sure nothing throws in animate().');
  if (timed && (!cover || cover.length < 14_000)) problems.push('The screen is nearly a flat colour while racing. Check that build() adds the ground, the track surface and lights, and that the sky and fog do not swallow everything.');
  return { ok: problems.length === 0, ran: true, readyMs, fps, errors, problems, advisories, levelReached, cover, artIcon, artWide, look };
}

/** The page's report for a draft it was asked to drive. */
export function submitDrive(draftId: string, token: string, raw: Record<string, unknown>, images: { cover?: unknown; covers?: unknown; artIcon?: unknown; artWide?: unknown }) {
  const p = pending.get(draftId);
  if (!p || p.token !== token) return false;
  const r = raw && typeof raw === 'object' ? raw : {}, report = judge(r, images);
  // and what it heard the world play as its own (9 Oct, lib/runtime/drive.js), read for what it must be: kept with the
  // draft for its publish (lib/world-options.ts publishedSoundtrack); a report without one says nothing either way
  p.resolve('soundtrack' in r ? { ...report, soundtrack: readSoundtrack(r.soundtrack) } as WorldReport : report);
  return true;
}
