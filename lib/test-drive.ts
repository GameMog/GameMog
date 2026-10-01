import { chromePath } from './browser';
import type { WorldReport } from './playtest-runtime';
import { lookScore, lookAdvisories, isLook, type Look } from './look';

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

const SKIPPED: WorldReport = { ok: true, ran: false, readyMs: null, fps: null, errors: [], problems: [], advisories: [], levelReached: 0 };

// a creator who has switched tabs is waited for, a minute and a half at a time, never longer than this
const HOLD_MAX = 15 * 60_000;

/** Waits for the creator's page to drive the draft; skipped after `ms`, unless the page asks to hold. */
export function waitForDrive(draftId: string, token: string, ms = 240_000): Promise<WorldReport> {
  return new Promise((resolve) => {
    const p: Pending = {
      token, until: Date.now() + HOLD_MAX,
      skip: () => { pending.delete(draftId); resolve(SKIPPED); },
      resolve: (r) => { clearTimeout(p.timer); pending.delete(draftId); resolve(r); },
    };
    p.timer = setTimeout(p.skip, ms);
    pending.set(draftId, p);
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

/** What the drive measured, judged as the server's own test drive would. */
export function judge(raw: Record<string, unknown>, images: { cover?: unknown; covers?: unknown; artIcon?: unknown; artWide?: unknown }): WorldReport {
  if (raw.timedOut) return SKIPPED;
  const errors = strs(raw.errors, 12), advisories = strs(raw.advisories, 12), problems: string[] = [];
  const readyMs = num(raw.readyMs, 0, 600_000);
  if (raw.crashed) return { ...SKIPPED, ok: false, ran: true, readyMs, errors, problems: [`The world could not be playtested: ${String(raw.crashed).slice(0, 300)}`] };
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
  p.resolve(judge(raw && typeof raw === 'object' ? raw : {}, images));
  return true;
}
