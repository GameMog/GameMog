import { readOptions, type WorldOptions } from './world-options';
import { z } from 'zod';
import { Script, runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Games the model writes itself.
 *
 * The race engine takes data and nothing else, which is safe and was also the
 * ceiling: no prompt could change the controls, the mechanics or the creature,
 * so "a frog hopping through a swamp on the arrow keys" came back as a rhythm
 * race with swamp colours. A custom game is code, and the safety moves from
 * "the model cannot write code" to "the code cannot reach anything":
 *
 *   - it runs in a sandboxed frame on an opaque origin: no cookies, no storage,
 *     no access to this site or its API
 *   - the document's own CSP carries `sandbox`, so the same holds when the game
 *     is opened in a tab of its own rather than in our frame
 *   - connect-src is 'none' and images and media are data:/blob: only, so the
 *     game cannot send anything anywhere, not even as an image request
 *   - the only channel out is postMessage, whose results the host treats as
 *     claims
 *
 * What a game can still do is burn its own tab's CPU. The runtime playtest
 * catches the games that do that before anyone sees them.
 */

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const GameMetaSchema = z.object({
  title: z.string().min(2).max(40),
  tagline: z.string().min(2).max(140),
  blurb: z.string().min(10).max(600),
  genre: z.string().min(2).max(32),
  controls: z.string().min(4).max(220),
  /** How the leaderboard ranks a finished run. */
  scoring: z.enum(['time', 'score', 'place']),
  cast: z.array(z.object({
    name: z.string().min(1).max(24),
    color: Hex,
    role: z.string().max(80).optional(),
  })).min(1).max(8),
  palette: z.object({ sky: Hex, ground: Hex, accent: Hex }),
});
export type GameMeta = z.infer<typeof GameMetaSchema>;

/** A framework world's metadata. Controls and scoring are the runtime's, not the model's. */
export const WorldMetaSchema = GameMetaSchema.omit({ controls: true, scoring: true });
export type WorldMeta = z.infer<typeof WorldMetaSchema>;
export const WORLD_CONTROLS = 'Arrow keys or WASD: left and right steer, up is faster, down is slower. Space: jump (anything lower than you). P: pause. On-screen buttons, and a JUMP button, on touch screens.';
/** The controls line for a world, with the sword key when the world turns combat on (play.combat). */
/** An open world (open: {...} in GameMog.world): free roam and survival, ranked by the time survived. */
export function isOpenWorld(code?: string) { return !!code && /\bopen\s*:\s*\{/.test(code); }
export const OPEN_CONTROLS = 'W A S D or the arrow keys: move. Shift: run. J, F or a click: punch (jab, cross, hook). Space: jump. Drag: look around. P: pause. On touch screens, a stick and buttons.';
/**
 * An open world whose hero has fewer moves (AI Alps, the owner 4 Oct: "no kicks. just an array of punches", "no
 * jumping", "He never flips or rolls. He walks through hits and blocks with his forearms"): open.kicks, open.jump or
 * open.dodge: false, or open.tank. Its page names only what he can do, from these lines; any other open world keeps
 * OPEN_CONTROLS word for word. (With open.traversal, Space is the traversal's, so jump: false changes nothing there.)
 */
export const OPEN_HERO_CONTROLS = {
  move: 'W A S D or the arrow keys: move. Shift: run.',
  punch: 'J, F or a click: punch (jab, cross, hook).',
  punches: 'J, F or a click: punch (jab, cross, hook, body shot, uppercut; hold: a haymaker).',
  jump: 'Space: jump.',
  tank: 'Blows from in front land on his forearms.',
  rest: 'Drag: look around. P: pause. On touch screens, a stick and buttons.',
};
/**
 * The open: { ... } object's own keys, as text: what its top level says, with everything nested in it (a crew, a
 * hazard, a helper object), every string and every comment left out, so `jump: false` said of anything but the hero
 * is not read as his. Found the way isOpenWorld finds an open world.
 */
function openTop(code: string) {
  const m = /\bopen\s*:\s*\{/.exec(code);
  if (!m) return '';
  return topOf(code, m.index + m[0].length);
}
/** An object literal's own top level, as text, from just inside its opening brace (strings emptied, comments and everything nested left out). */
function topOf(code: string, from: number) {
  let out = '', depth = 1, i = from;
  while (i < code.length && depth > 0) {
    const c = code[i], n = code[i + 1];
    if (c === '/' && n === '/') { const e = code.indexOf('\n', i); i = e < 0 ? code.length : e; continue; }
    if (c === '/' && n === '*') { const e = code.indexOf('*/', i + 2); i = e < 0 ? code.length : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1; while (j < code.length && code[j] !== c) j += code[j] === '\\' ? 2 : 1;
      if (depth === 1) out += c + c;
      i = j + 1; continue;
    }
    if (c === '{' || c === '[' || c === '(') { if (depth === 1) out += c; depth++; i++; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; if (depth === 1) out += c; i++; continue; }
    if (depth === 1) out += c;
    i++;
  }
  return out;
}
function openControls(code: string) {
  // (the hero's options are read where the runtime reads them, the open object's own keys; and a tank is true or an
  // object, as the runtime takes it)
  const top = openTop(code);
  const kicks = !/\bkicks\s*:\s*false\b/.test(top), dodge = !/\bdodge\s*:\s*false\b/.test(top), tank = /\btank\s*:\s*(true\b|\{)/.test(top);
  const jump = /\btraversal\s*:/.test(top) || !/\bjump\s*:\s*false\b/.test(top);
  if (kicks && jump && dodge && !tank) return OPEN_CONTROLS;
  const L = OPEN_HERO_CONTROLS;
  return [L.move, kicks ? L.punch : L.punches, jump ? L.jump : '', tank ? L.tank : '', L.rest].filter(Boolean).join(' ');
}
/**
 * A kart race (Meme Kart, the owner 6 Oct: "3 laps, 8 karts ... bumping + items"): kart: { ... } among
 * GameMog.world's own top-level keys, read the way openTop reads the open object, so a kart named inside a crew, a
 * helper or a string is not one. Its runtime carries the kart kit (lib/runtime/kart.js); no other world's does.
 */
export function isKartWorld(code?: string | null) {
  if (!code) return false;
  const m = /\bGameMog\s*\.\s*world\s*\(\s*\{/.exec(code);
  if (!m) return false;
  // (an open world that also names a kart is an open world, as the runtime reads it: KART needs !OPEN)
  const top = topOf(code, m.index + m[0].length);
  return /(?:^|[\s,{])kart\s*:\s*\{/.test(top) && !/(?:^|[\s,{])open\s*:\s*\{/.test(top);
}
/**
 * A penalty shootout (SHOOTOUT, the owner 11 Oct 2026): shootout: { ... } among GameMog.world's own top-level keys, read
 * as isKartWorld reads a kart, and never with open or kart there. Its runtime carries the shootout (lib/runtime/shootout.js)
 * and no other world's does.
 */
export function isShootoutWorld(code?: string | null) {
  if (!code) return false;
  const m = /\bGameMog\s*\.\s*world\s*\(\s*\{/.exec(code);
  if (!m) return false;
  const top = topOf(code, m.index + m[0].length);
  return /(?:^|[\s,{])shootout\s*:\s*\{/.test(top) && !/(?:^|[\s,{])(?:open|kart)\s*:\s*\{/.test(top);
}
/**
 * A Grand Prix (ARTIFICIAL1, the owner 14 Oct 2026: "all recommended"): gp: { ... } among GameMog.world's own top-level
 * keys, read as isShootoutWorld reads a shootout, and never with open, kart or shootout there. Its runtime carries the
 * Grand Prix (lib/runtime/gp.js and its parts, gp-*.js) and no other world's does.
 */
export function isGpWorld(code?: string | null) {
  if (!code) return false;
  const m = /\bGameMog\s*\.\s*world\s*\(\s*\{/.exec(code);
  if (!m) return false;
  const top = topOf(code, m.index + m[0].length);
  return /(?:^|[\s,{])gp\s*:\s*\{/.test(top) && !/(?:^|[\s,{])(?:open|kart|shootout)\s*:\s*\{/.test(top);
}
export const KART_CONTROLS = 'W or the up arrow: gas (hit it as the 1 lands for a Moon Launch). S or the down arrow: brake, then reverse. A D or the left and right arrows: steer. Space: hop, and hold it through a turn to drift (let go for a boost); off a ramp, a trick. X (or J, K, Shift): use your item, held to drag a Rug Pull or Laser Eyes behind you as a shield; E throws it ahead; with S or the down arrow, behind. C: look back. P: pause. On touch screens, a stick to steer and DRIFT, ITEM and BRAKE buttons (the gas is automatic; hold DRIFT on the grid to launch; the stick up or down aims an item); a gamepad works too.';
/**
 * A kart race's controls as its own race has them (18 Oct, Wonderwake: kart.items: false, and the page still told of
 * an item key, an ITEM button and aiming an item): with the items off (kart.items: false, or a course with
 * airdrops: false, which leaves no crates, as the runtime's ITEMS_ON reads it), none of the item's keys or buttons.
 */
export function kartControls(items = true) {
  if (items) return KART_CONTROLS;
  return KART_CONTROLS.replace(/ X \(or J, K, Shift\): use your item[^.]*\./, '').replace('DRIFT, ITEM and BRAKE buttons', 'DRIFT and BRAKE buttons').replace('; the stick up or down aims an item', '');
}
// a penalty shootout (12 Oct): the owner's mechanic, TAP, aim, HOLD and RELEASE (lib/runtime/shootout.js)
export const SHOOTOUT_CONTROLS = 'Space or a click: tap to run up (tap faster for more power). The arrow keys or W A S D: aim. Hold the last tap when the ring glows and let go as the gold ring closes. Enter: start, skip the replay and kick again. P: pause. On touch screens, a stick to aim and a KICK button; a gamepad works too (A to tap, the left stick to aim).';
// a Grand Prix (14 Oct): the player's car is the same car the AI drives; braking and steering assists are on by default
// on every screen and Pro (in the pause menu) turns them off; one launch on every device (lib/runtime/gp.js)
// (18 Oct) the shortest lap a Grand Prix's race can plausibly be run in, for the scores route and the dares: the circuit's
// 5.36 km in 50 s is a 386 km/h average, past anything its cars do (the AI laps it in about 1:29)
export const GP_MIN_LAP_MS = 50_000;
// (18 Oct) the laps a Grand Prix races, as its own gp: { laps: N } says (1 to 5, three when it names none): a time is only
// a time over all of them
export function gpLaps(code?: string | null) {
  const m = code ? /(?:^|[\s,{])gp\s*:\s*\{[^}]*?\blaps\s*:\s*(\d+)/.exec(code) : null, n = m ? Number(m[1]) : 3;
  return n >= 1 && n <= 5 ? n : 3;
}
export const GP_CONTROLS = 'W or the up arrow: throttle. S or the down arrow: brake. A D or the left and right arrows: steer. Space: open the Flap where it is armed. E and Q: shift up and down, in Manual. V: the camera (chase, T-cam, cockpit); C: look back. P: pause, where Pro turns the driving aids off. Hold the brake on the grid and let go when the five red lights go out. On touch screens, a stick to steer with the throttle automatic, and BRAKE, FLAP and CAM buttons; a gamepad works too. Braking and steering aids are on to begin with.';
// a derby (open.vehicle): car combat in an arena
export const DERBY_CONTROLS = 'W A S D or the arrow keys: drive (S brakes, then reverses). Space: handbrake. Shift: boost. J, F or a held click: the roof guns. Drag: look around. P: pause. On touch screens, a stick to drive and BOOST, BRAKE and FIRE.';
/**
 * What kind of world a game is (1 Oct): a lap race, an open world you survive in, or a
 * derby (cars in an arena). The runtime decides it from the code, so the code is the
 * truth; meta.mode records it when a world is stored, and a game stored before that
 * is read from what it did store (scoring 'survival', options.open).
 */
export const WORLD_MODES = ['race', 'survival', 'derby', 'kart', 'shootout', 'gp'] as const;
export type WorldMode = (typeof WORLD_MODES)[number];
export function worldMode(code?: string | null, meta?: string | null | Record<string, unknown>): WorldMode {
  // (a kart race, 6 Oct: kart: {...} among GameMog.world's own keys; read first, so a kart world that names a
  // vehicle or an "open" anywhere inside it stays a kart race)
  // (a penalty shootout, 12 Oct: shootout: {...} among its own keys, read first; it never has open or kart there)
  // (a Grand Prix, 14 Oct: gp: {...} among its own keys, read first of all; it never has open, kart or shootout there)
  if (code) return isGpWorld(code) ? 'gp' : isShootoutWorld(code) ? 'shootout' : isKartWorld(code) ? 'kart' : isOpenWorld(code) ? (/\bvehicle\s*:\s*\{/.test(code) ? 'derby' : 'survival') : 'race';
  let m: { mode?: unknown; scoring?: unknown; options?: { open?: unknown } } = {};
  try { m = (typeof meta === 'string' ? JSON.parse(meta) : meta) ?? {}; } catch { /* a race */ }
  if (WORLD_MODES.includes(m.mode as WorldMode)) return m.mode as WorldMode;
  return m.scoring === 'survival' || m.options?.open === true ? 'survival' : 'race';
}
/** How each kind of world reads on its page: what it is, who comes for you, and how it plays. */
export const MODE_PAGE: Record<WorldMode, { label: string; rivals: string; how: string }> = {
  race: {
    label: 'Endless laps',
    rivals: 'One more each lap',
    how: 'Endless laps. One rival lines up beside you at the start, and every lap another joins at the line, faster and more aggressive than the last. Every lap everyone runs faster: you, the whole field and the moving obstacles. Touch a rival or an obstacle and the run is over. Collect the golden GM on the way. The leaderboard ranks the highest level reached, then GM.',
  },
  survival: {
    label: 'Open world',
    rivals: 'More as the heat rises',
    how: 'An open world to roam. Crews come for you, more of them and tougher as the heat rises: it climbs with time and with every few knockouts, and a boss arrives at every third heat. Fight them off and collect the GM they drop. Get knocked out and the run is over. The leaderboard ranks the time survived, then GM.',
  },
  kart: {
    label: 'Kart race',
    rivals: 'Seven on the grid',
    how: 'A kart race: three laps, eight karts. Hit the gas as the 1 lands for a Moon Launch, hop into a drift to charge a boost (Green Candle, Gold, then MOG), tail a rival for the slipstream, and trick off the ramps. Drive through the Airdrop crates for an item: Rug Pull, Laser Eyes, Cold Wallet, Pump, Much Wow, FUD Cloud, WHALE DUMP, Diamond Hands, To The Moon or a GM Bag. Bump all you like: contact never ends your run, and the Rescue Claw puts you back if you fall. Each GM you grab adds a little top speed. The leaderboard ranks your score out of 10,000 (the time most, then your place, GM and enemies hit), each player by their best run.',
  },
  shootout: {
    label: 'Penalty shootout',
    rivals: 'One keeper',
    how: 'A penalty in a final, one kick at a time. Tap to run up: the faster you tap, the faster he runs and the harder he strikes it, and the gauge climbs from COLD through WARM and HOT to ON FIRE. Steer the aim with the stick or the arrow keys: aim anywhere you like, but over the bar or past a post is a miss. Hold the last tap as the ring glows, and let go as the gold ring closes on the plant foot: early scuffs it, late leans back and can sail it over. Then the keeper\'s guess and his reach decide. Score, kick again, and every goal counts. The leaderboard ranks the goals you score in a sitting.',
  },
  gp: {
    label: 'Grand Prix',
    rivals: 'Nineteen on the grid',
    how: 'A Grand Prix at night: twenty cars, three laps of a harbour street circuit, five red lights and a random hold before they go out. Race nineteen AI drivers at their real pace: brake late, take the line, tuck into a slipstream and open the Flap on the straights once you are close enough to arm it. Contact never ends your race. Cut a corner and that lap is deleted from your times; three strikes add five seconds. The race ends a minute after the winner crosses the line.',
  },
  derby: {
    label: 'Car combat arena',
    rivals: 'More cars as the heat rises',
    how: 'A car combat arena. Ram rivals, spin them out and open up with the roof guns; every spin and every wreck pays GM, and more cars come as the heat rises. Get your car wrecked and the run is over. The leaderboard ranks the time survived, then GM.',
  },
};
/**
 * A kart race's page text with its own lap count (9 Oct, Aspen GP races four): laps as the runtime reads kart.laps (1 to
 * 5, three when it names none; the page passes dna(code).kart.laps), in words. Three laps is MODE_PAGE.kart.how, word
 * for word.
 */
export function kartHow(laps?: number | null, items = true) {
  const n = laps == null || !Number.isFinite(laps) ? 3 : Math.max(1, Math.min(5, Math.round(laps)));
  const how = MODE_PAGE.kart.how.replace('three laps', n === 1 ? 'one lap' : `${['two', 'three', 'four', 'five'][n - 2]} laps`);
  // (and no crates or items named when the race has none: kartControls)
  return items ? how : how.replace(/ Drive through the Airdrop crates for an item:[^.]*\./, '');
}
/** An open world with no GM (the creator's option, or open.coins: false) explains itself without coins. */
export const NO_GM_HOW = 'An open world to roam, with no GM to chase. Crews come for you, more of them and tougher as the heat rises: it climbs with time and with every few knockouts, and a boss arrives at every third heat. Get knocked out and the run is over. The leaderboard ranks the time survived, then the takedowns.';
export function worldControls(code: string, o: { kartItems?: boolean } = {}) {
  if (isGpWorld(code)) return GP_CONTROLS;
  if (isShootoutWorld(code)) return SHOOTOUT_CONTROLS;
  if (isKartWorld(code)) return kartControls(o.kartItems !== false);
  const mode = worldMode(code);
  if (mode !== 'race') return mode === 'derby' ? DERBY_CONTROLS : openControls(code);
  return /\bplay\s*:\s*\{[\s\S]{0,400}?\bcombat\s*:/.test(code)
    ? 'Arrow keys or WASD: left and right steer, up is faster, down is slower. X (or J) swings your sword. Space: jump. P: pause. On-screen buttons, a JUMP and a sword button, on touch screens.'
    : WORLD_CONTROLS;
}

/**
 * Which kinds of world can be mogged (12 Oct: a penalty shootout could not until the builder had its docs; 13 Oct, M3:
 * it can, with its chapter in lib/runtime/API.md, its Mog DNA, its test drive and its static check). One entry closes a
 * kind again: its page, its dares and /mog/<slug> then say so (MOG_SOON), and the build route refuses a Mog of it
 * before anything is spent.
 */
// (a Grand Prix, 14 Oct: closed until its M3, when the builder gets its chapter, its DNA, its test drive and its check)
export const MOGGABLE: Record<WorldMode, boolean> = { race: true, survival: true, derby: true, kart: true, shootout: true, gp: false };
/** Whether a game can be mogged: every game but a world of a kind MOGGABLE closes. */
export function canMog(game: { format: string; code?: string | null; meta?: string | null }) {
  return game.format !== 'world' || MOGGABLE[worldMode(game.code, game.meta)];
}
export const MOG_SOON = 'Mogs of this kind of game are coming soon. Play it free in the meantime.';

export const CUSTOM_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com data:',
  'img-src data: blob:',
  'media-src data: blob:',
  "connect-src 'none'",
  'worker-src blob:',
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  'sandbox allow-scripts allow-pointer-lock',
].join('; ');

/**
 * A framework world may also read the platform's asset library, and only
 * that: its runtime fetches /assets/ on this site (licensed, hash-checked
 * files). Everything else stays shut. World code itself still cannot call
 * fetch; the static check refuses it.
 */
export function worldCsp(origin: string) {
  return CUSTOM_CSP.replace("connect-src 'none'", `connect-src ${origin}/assets/`);
}

/**
 * The address the player's browser used, for worldCsp. Behind a host's proxy
 * (Render) `req.url` carries the server's own address, https://localhost:10000
 * on 30 Sep, and a world allowed to read only that could fetch no assets at
 * all. The proxy's forwarded host and scheme are what the browser sees; the
 * host is checked before it goes into a header.
 */
export function publicOrigin(req: Request) {
  const url = new URL(req.url), h = req.headers;
  const host = (h.get('x-forwarded-host') ?? h.get('host') ?? '').split(',')[0].trim();
  const proto = (h.get('x-forwarded-proto') ?? '').split(',')[0].trim() || url.protocol.slice(0, -1);
  return /^[a-z0-9.-]+(:\d+)?$/i.test(host) && /^https?$/.test(proto) ? `${proto}://${host}` : url.origin;
}

/**
 * The host side of the contract, injected before the game's own code.
 *
 * GameMog.ready() once the first frame is on screen; GameMog.finish(result)
 * once per run. The host also answers the embedding page's "hello", which is
 * what makes the ready signal impossible to miss: the page asks when it is
 * listening, rather than hoping it was listening when the game spoke.
 *
 * Every AudioContext the game creates is tracked and suspended while the tab is
 * hidden. That guarantee lives here rather than in each game, because the one
 * time it lived in a game it was forgotten.
 *
 * The options (9 Oct) can carry the original's soundtrack, read for what it
 * must be (lib/world-options.ts readSoundtrack); like the kart score, no '<'
 * in them can end this script (no other option has one, so no other page changes).
 */
function hostScript(id: string, title: string, tagline = '', options?: WorldOptions, kartScore?: unknown, gp = false) {
  return `(function () {
  var id = ${JSON.stringify(id)}, isReady = false, finished = 0;
  var gm = window.__gm = { ready: false, results: [], errors: [] };
  function post(m) { m.source = 'gamemog'; m.gameId = id; try { parent.postMessage(m, '*'); } catch (e) {} }
  function note(msg) { msg = String(msg).slice(0, 400); if (gm.errors.length < 20) gm.errors.push(msg); post({ type: 'error', message: msg }); }
  addEventListener('error', function (e) { note((e.message || 'error') + (e.lineno ? ' (line ' + e.lineno + ')' : '')); });
  addEventListener('unhandledrejection', function (e) { note('unhandled rejection: ' + (e.reason && e.reason.message || e.reason)); });
  addEventListener('message', function (e) {
    var d = e.data;
    if (d && d.source === 'gamemog-host' && d.type === 'hello' && isReady) post({ type: 'ready' });
  });

  var contexts = [], Native = window.AudioContext || window.webkitAudioContext;
  if (Native) {
    var Tracked = function (opts) { var c = new Native(opts); contexts.push(c); return c; };
    Tracked.prototype = Native.prototype;
    window.AudioContext = window.webkitAudioContext = Tracked;
  }
  function park(off) { contexts.forEach(function (c) { try { off ? c.suspend() : c.resume(); } catch (e) {} }); }
  document.addEventListener('visibilitychange', function () { park(document.hidden); });
  addEventListener('pagehide', function () { park(true); });

  window.GameMog = {
    id: id,
    title: ${JSON.stringify(title)},
    meta: { title: ${JSON.stringify(title)}, tagline: ${JSON.stringify(tagline)} },
    // the creator's platform options (lib/world-options.ts), enforced by the runtime
    options: ${JSON.stringify(options ?? null).replace(/</g, '\\u003c')},${kartScore ? `
    // a kart race's score constants (meta.kartScore, or the course's when it has none; lib/kart-score.ts): the results
    // screen scores the race with them exactly as the scores route will
    kartScore: ${JSON.stringify(kartScore).replace(/</g, '\\u003c')},` : ''}
    ready: function () {
      if (isReady) return;
      isReady = gm.ready = true;
      post({ type: 'ready' });
    },
    finish: function (r) {
      r = r || {};
      var out = {
        type: 'result', finished: true, run: ++finished,
        won: !!r.won,
        place: Math.max(0, Math.round(Number(r.place) || 0)),
        timeMs: Math.max(0, Math.round(Number(r.timeMs) || 0)),
        score: Math.round(Number(r.score) || 0),
        level: Math.max(0, Math.round(Number(r.level) || 0)),
        gm: Math.max(0, Math.round(Number(r.gm) || 0)),
        // an open world's run: the time survived is what ranks, knockouts beside it
        survival: !!r.survival, kos: Math.max(0, Math.round(Number(r.kos) || 0)), goal: !!r.goal,
        assisted: !!r.assisted,
      };
      // a kart race's own parts (8 Oct, the race's score): what the scores route scores, passed on as they are
      if (r.kart) {
        out.kart = true; out.laps = Math.max(0, Math.round(Number(r.laps) || 0));
        out.hits = Math.max(0, Math.round(Number(r.hits) || 0)); out.karts = Math.max(0, Math.round(Number(r.karts) || 0));
        out.estimated = r.estimated === true; out.progress = r.progress == null || !isFinite(Number(r.progress)) ? null : Math.max(0, Math.min(1, Number(r.progress)));
        out.racer = typeof r.racer === 'string' ? r.racer.slice(0, 24) : null; out.scoreV = Math.round(Number(r.scoreV) || 0);
      }${gp ? `
      // a Grand Prix's own parts (15 Oct, the owner's D3): the driving aids are tagged aids 'on', 'off' or 'pro' and are
      // never 'assisted' (which stays the test controls' and is refused), so an aided run reaches the board and dares;
      // and the race's facts, passed on as they are (the board that ranks them is M3's)
      if (r.gp) {
        out.gp = true; out.aids = r.aids === 'off' || r.aids === 'pro' ? r.aids : 'on'; out.field = r.field === 'club' ? 'club' : 'real';
        var gi = function (v, hi) { return Math.max(0, Math.min(hi, Math.round(Number(v) || 0))); };
        out.grid = gi(r.grid, 99); out.laps = gi(r.laps, 99); out.of = gi(r.of, 99); out.bestLapMs = gi(r.bestLapMs, 3600000);
        out.strikes = gi(r.strikes, 999); out.penaltyMs = gi(r.penaltyMs, 3600000); out.contacts = gi(r.contacts, 9999); out.passes = gi(r.passes, 9999);
        out.seed = gi(r.seed, 4294967295); out.classified = r.classified === true;
      }` : ''}
      gm.results.push(out);
      post(out);
    }${gp ? `,
    // a Grand Prix's moments for the page (INTERFACES 8, the M2 amendment): { type: 'gp', e, ... }, plain values only;
    // the page forwards them to first-party analytics in M3 and ignores them until then
    gpEvent: function (m) {
      if (!m || typeof m.e !== 'string') return;
      var o = { type: 'gp' };
      for (var k in m) { var v = m[k]; if (k !== 'type' && k !== 'source' && k !== 'gameId' && (v == null || typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 40))) o[k] = v; }
      post(o);
    }` : ''}
  };
})();`;
}

/** Stop a `</script>` or `<!--` inside the game from ending our script element. */
const inert = (code: string) => code.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function renderCustomGame(code: string, meta: Pick<GameMeta, 'title'>, id: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title>${escapeHtml(meta.title)}</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000;touch-action:none;-webkit-user-select:none;user-select:none}canvas{display:block}</style>
<script>${hostScript(id, meta.title)}</script>
<script src="https://cdn.jsdelivr.net/npm/three@0.157.0/build/three.min.js"></script>
<script>window.THREE || document.write('<script src="https://cdn.jsdelivr.net/npm/three@0.157.0/build/three.js"><\\/script>');</script>
</head>
<body>
<script>
${inert(code)}
</script>
</body>
</html>`;
}

/* ------------------------------------------------------ framework worlds -- */
/**
 * A world built on the GameMog Runtime: the platform's rules (lib/runtime) run
 * first, then the world module, which only describes the world. Pinned to the
 * runtime version the world was written against, so a later runtime can change
 * without changing a game that already shipped.
 */
const RUNTIMES: Record<string, string> = {};
// the kart race's parts of the runtime (between /*@kart*/ and /*@/kart*/ in v1.js): kept, markers and all removed,
// for a kart world; cut out whole for every other, which then gets exactly the text it always did
const KART_PART = /\/\*@kart\*\/[\s\S]*?\/\*@\/kart\*\//g, KART_MARK = /\/\*@\/?kart\*\//g;
// the shootout's parts (between /*@shootout*/ and /*@/shootout*/ in v1.js, 11 Oct): kept, markers removed, for a
// shootout world; cut out whole, before anything else, for every other world (a kart race's too), which then gets
// exactly the text it always did
const SHOOT_PART = /\/\*@shootout\*\/[\s\S]*?\/\*@\/shootout\*\//g, SHOOT_MARK = /\/\*@\/?shootout\*\//g;
const OPEN_STUB = '    var OW = null;\n    function openWorld() {}\n';
// the Grand Prix's parts (between /*@gp*/ and /*@/gp*/ in v1.js, 14 Oct): kept, markers removed, for a Grand Prix; cut
// out whole, FIRST, for every other world, which then gets exactly the text it always did
const GP_PART = /\/\*@gp\*\/[\s\S]*?\/\*@\/gp\*\//g, GP_MARK = /\/\*@\/?gp\*\//g;
// (its parts, in gp.js's /*@include*/ order, one file and one binding each: ARTIFICIAL1 INTERFACES.md 1.2 and its M2
// amendment, EXPERIENCE.md 6.1. The ones the director cannot race without: missing, a console warning and its stand-in;
// the rest are later parts (or stubs), missing quietly until they are built. An include of any other name is a comment)
const GP_PARTS = ['gp-track.js', 'gp-sim.js', 'gp-ai.js', 'gp-race.js', 'gp-cam.js', 'gp-director.js', 'gp-car.js', 'gp-stage.js', 'gp-kit.js', 'gp-hud.js', 'gp-intro.js', 'gp-audio.js'];
const GP_REQUIRED = new Set(['gp-track.js', 'gp-sim.js', 'gp-ai.js', 'gp-race.js', 'gp-cam.js', 'gp-hud.js']);
export function runtimeSource(version: number, kart = false, shootout = false, gp = false) {
  const key = `${version}${kart ? ':kart' : shootout ? ':shootout' : gp ? ':gp' : ''}`;
  if (!RUNTIMES[key] || process.env.NODE_ENV !== 'production') {
    // the platform's score engine and car kit ride in front of the runtime that uses them
    const read = (f: string) => readFileSync(join(process.cwd(), 'lib', 'runtime', f), 'utf8');
    const v1src = read(`v${version}.js`);
    // (a Grand Prix runs no kart race, no shootout and no open world: their parts cut out, a stub for open.js, and
    // lib/runtime/gp.js at its own marker inside the runtime's closure, its parts pasted at its /*@include gp-<name>.js*/
    // markers, one file a part)
    if (gp && !kart && !shootout) {
      const part = (f: string) => { if (!GP_PARTS.includes(f)) return `/* ${f}: not a Grand Prix part */\n`; try { return read(f); } catch { return GP_REQUIRED.has(f) ? `/* ${f}: not in this tree */ console.warn('[gp] lib/runtime/${f} is not in this tree');\n` : `/* ${f}: not in this tree */\n`; } };
      const gpSrc = read('gp.js').replace(/\/\*@include (gp-[a-z]+\.js)\*\//g, (_: string, f: string) => part(f));
      const core = v1src.replace(KART_PART, '').replace(SHOOT_PART, '').replace(GP_MARK, '').replace('/*@include open.js*/', () => OPEN_STUB).replace('/*@include gp.js*/', () => gpSrc);
      return (RUNTIMES[key] = [read('music.js'), read('vehicle.js'), read('creature.js'), core].join('\n'));
    }
    const v0 = v1src.replace(GP_PART, '');
    // (a shootout runs no kart race and no open world: the kart parts cut out, a stub for open.js, as a kart race has,
    // and lib/runtime/shootout.js at its own marker, inside the runtime's closure)
    // (and shootout.js's own parts, one file a part, pasted in place at its /*@include shootout-<name>.js*/ markers, so
    // in the same closure; a part not on disk yet is a warning in the console, not a failed page: M1 is built in
    // parallel, and the director stands in for a part whose binding is undefined)
    if (shootout && !kart) {
      const part = (f: string) => { try { return read(f); } catch { return `/* ${f}: not in this tree */ console.warn('[shoot] lib/runtime/${f} is not in this tree');\n`; } };
      const shoot = read('shootout.js').replace(/\/\*@include (shootout-[a-z]+\.js)\*\//g, (_: string, f: string) => part(f));
      const core = v0.replace(KART_PART, '').replace(SHOOT_MARK, '').replace('/*@include open.js*/', () => OPEN_STUB).replace('/*@include shootout.js*/', () => shoot);
      return (RUNTIMES[key] = [read('music.js'), read('vehicle.js'), read('creature.js'), core].join('\n'));
    }
    const v = v0.replace(SHOOT_PART, '');
    // (a kart world runs no open world: a stub stands in for open.js and the derby, climbing and traversal it
    // carries, 389 KB a phone does not parse)
    // (and the kart kit carries the roster, the eight racers a kart world names: lib/runtime/kart-roster.js; the
    // items, the race's own: lib/runtime/kart-items.js; and the race's own score, for a world that asks for it:
    // lib/runtime/kart-music.js)
    // (and the race's score, 8 Oct: lib/runtime/kart-score.js, the file the scores route and the page also load; at
    // kart.js's /*@include kart-score.js*/ if it has one, else in front of the runtime, a global KartScore either way)
    const kartSrc = kart ? read('kart.js') : '', scoreAt = kartSrc.includes('/*@include kart-score.js*/');
    const own = kart ? v.replace('/*@include kart.js*/', () => kartSrc.replace('/*@include kart-roster.js*/', () => read('kart-roster.js')).replace('/*@include kart-items.js*/', () => read('kart-items.js')).replace('/*@include kart-music.js*/', () => read('kart-music.js')).replace('/*@include kart-score.js*/', () => read('kart-score.js'))).replace(KART_MARK, '').replace('/*@include open.js*/', () => OPEN_STUB) : v.replace(KART_PART, '');
    // open worlds (open.js) run inside the runtime's own closure, at its marker
    // and a derby (derby.js), climbing (climb.js) and the traversal (trav.js) inside the open world's, at their own
    const core = own.replace('/*@include open.js*/', () => read('open.js').replace('/*@include derby.js*/', () => read('derby.js')).replace('/*@include climb.js*/', () => read('climb.js')).replace('/*@include trav.js*/', () => read('trav.js')));
    // (and a kart race's guard, 8 Oct: lib/runtime/kart-guard.js, first of all, so it sees every error the race throws
    // and the graphics context it makes)
    RUNTIMES[key] = [...(kart ? [read('kart-guard.js')] : []), read('music.js'), read('vehicle.js'), read('creature.js'), ...(kart && !scoreAt ? [read('kart-score.js')] : []), core].join('\n');
  }
  return RUNTIMES[key];
}

/**
 * The runtime's library maps (lib/runtime/maps, built by scripts/runtime/build-maps.mjs):
 * a world that asks for one (open: { map: 'ocean-drive' }) gets its script ahead of the runtime,
 * and a world that asks for the traversal (open: { traversal: ... }) gets that one.
 */
const MAPS: Record<string, string> = {};
function mapScripts(world: string) {
  const ids = [...new Set([...world.matchAll(/\bmap\s*:\s*['"]([a-z0-9-]{2,40})['"]/g)].map((m) => m[1]).concat(/\btraversal\s*:/.test(world) ? ['traversal'] : []))];
  return ids.map((id) => {
    const f = join(process.cwd(), 'lib', 'runtime', 'maps', `${id}.js`);
    if (!MAPS[id] || process.env.NODE_ENV !== 'production') { try { MAPS[id] = readFileSync(f, 'utf8'); } catch { MAPS[id] = ''; } }
    return MAPS[id] ? `<script>\n${inert(MAPS[id])}\n</script>` : '';
  }).join('\n');
}

/**
 * The endoskeleton a library person can be (lib/runtime/endo.js, ctx.assets.human(id, { endo: ... })): only a world
 * whose source asks for one gets its script, ahead of the runtime like a map, so no other world carries or parses it.
 */
let ENDO = '';
function endoScript(world: string) {
  if (!/\bendo['"]?\s*:/.test(world)) return '';
  if (!ENDO || process.env.NODE_ENV !== 'production') { try { ENDO = readFileSync(join(process.cwd(), 'lib', 'runtime', 'endo.js'), 'utf8'); } catch { ENDO = ''; } }
  return ENDO ? `<script>\n${inert(ENDO)}\n</script>\n` : '';
}

/** The test drive that runs in the creator's browser (lib/runtime/drive.js). */
let DRIVE = '';
function driveSource() {
  if (!DRIVE || process.env.NODE_ENV !== 'production') DRIVE = readFileSync(join(process.cwd(), 'lib', 'runtime', 'drive.js'), 'utf8');
  return DRIVE;
}
/** A penalty shootout's sight lines from the lenses behind the goal (lib/runtime/shoot-lens.js), read by both test drives. */
let LENS = '';
export function shootLensSource() {
  if (!LENS || process.env.NODE_ENV !== 'production') LENS = readFileSync(join(process.cwd(), 'lib', 'runtime', 'shoot-lens.js'), 'utf8');
  return LENS;
}

/**
 * A world's play document. A test drive's (`drive`, the creator's browser) also carries drive.js and, ahead of it, the
 * world's kind as window.__gmKind (13 Oct: the drive waits longer for a shootout's 28 MB, as for a kart race's), and a
 * shootout's the check of its lenses behind the goal (lib/runtime/shoot-lens.js); every other page is exactly as it was.
 */
export function renderWorldGame(world: string, meta: Pick<GameMeta, 'title' | 'tagline'> & { options?: unknown; kartScore?: unknown }, id: string, runtime = 1, drive = false) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title>${escapeHtml(meta.title)}</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000;touch-action:none;-webkit-user-select:none;user-select:none}canvas{display:block}</style>
<script>${hostScript(id, meta.title, meta.tagline, meta.options === undefined ? undefined : readOptions(meta.options), isKartWorld(world) ? meta.kartScore : undefined, isGpWorld(world))}</script>
${drive ? `<script>window.__gmKind = ${JSON.stringify(worldMode(world))};</script>
${isShootoutWorld(world) ? `<script>
${inert(shootLensSource())}
</script>
` : ''}<script>
${inert(driveSource())}
</script>` : ''}
<script src="https://cdn.jsdelivr.net/npm/three@0.157.0/build/three.min.js"></script>
<script>window.THREE || document.write('<script src="https://cdn.jsdelivr.net/npm/three@0.157.0/build/three.js"><\\/script>');</script>
</head>
<body>
${mapScripts(world)}${endoScript(world)}
<script>
${inert(runtimeSource(runtime, isKartWorld(world), isShootoutWorld(world), isGpWorld(world)))}
</script>
<script>
${inert(world)}
</script>
</body>
</html>`;
}

/* ----------------------------------------------------------- static check -- */
/**
 * Read before it runs. Most of what is refused here would be blocked by the
 * sandbox anyway, but blocked at runtime means a game that throws on a player;
 * refused here means the model is told and fixes it.
 */
const FORBIDDEN: [RegExp, string][] = [
  [/\bfetch\s*\(/, 'fetch() is blocked: the game has no network access. Generate everything procedurally.'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest is blocked: the game has no network access.'],
  [/\b(WebSocket|EventSource)\b/, 'WebSocket and EventSource are blocked: the game has no network access.'],
  [/sendBeacon/, 'navigator.sendBeacon is blocked: the game has no network access.'],
  [/\b(localStorage|sessionStorage|indexedDB)\b/, 'Browser storage throws in the sandbox. Keep state in memory.'],
  [/document\.cookie/, 'Cookies are unavailable in the sandbox.'],
  [/\beval\s*\(|\bnew\s+Function\s*\(/, 'eval and new Function are blocked by the content security policy.'],
  [/\bimport\s*\(|^\s*import\s[^(]/m, 'Modules cannot be imported. THREE is already a global (r157); use it directly.'],
  [/\bimportScripts\b/, 'importScripts is blocked.'],
  [/\bwindow\.open\s*\(|\b(alert|confirm|prompt)\s*\(/, 'Popups and dialogs are blocked in the sandbox. Draw UI in the page instead.'],
  [/\b(top|parent)\.location\b/, 'The game cannot navigate its host.'],
  [/https?:\/\/(?!fonts\.(googleapis|gstatic)\.com)[\w.-]+\.[a-z]{2,}\/[\w./%-]*\.(png|jpe?g|gif|webp|glb|gltf|obj|fbx|mp3|ogg|wav|m4a|json)/i,
    'External assets cannot load (images, models and sounds are blocked). Build them procedurally.'],
];

export function staticCheck(code: string): string[] {
  const problems: string[] = [];
  if (code.length < 2500) problems.push('The game is too short to be a complete game. Write the whole thing.');
  if (code.length > 450_000) problems.push(`The game is ${Math.round(code.length / 1000)}KB; keep it under 450KB.`);
  if (!/GameMog\.ready\s*\(/.test(code)) problems.push('The game never calls GameMog.ready(). Call it right after the first frame renders.');
  if (!/GameMog\.finish\s*\(/.test(code)) problems.push('The game never calls GameMog.finish(). Call it once when each run ends.');
  if (!/THREE\.WebGLRenderer/.test(code)) problems.push('The game must render with THREE.WebGLRenderer.');
  for (const [re, why] of FORBIDDEN) if (re.test(code)) problems.push(why);
  try { new Script(code, { filename: 'game.js' }); }
  catch (e) { problems.push(`Syntax error: ${(e as Error).message}`); }
  return problems;
}

/* ------------------------------------------------------------- parsing -- */
/**
 * The model answers with one ```json block (metadata) and one ```javascript
 * block (the game). Fenced blocks rather than structured output: a 20k-token
 * program as an escaped JSON string is harder for the model to write well and
 * harder for us to diagnose when it goes wrong.
 */
export function parseGameResponse<S extends z.ZodTypeAny = typeof GameMetaSchema>(text: string, schema?: S): { meta?: z.infer<S>; code?: string; problems: string[] } {
  const problems: string[] = [];
  const blocks = [...text.matchAll(/```([a-zA-Z]*)[^\n]*\n([\s\S]*?)```/g)].map((m) => ({ lang: m[1].toLowerCase(), body: m[2] }));
  const jsonBlock = blocks.find((b) => b.lang === 'json');
  const codeBlock = blocks.filter((b) => ['javascript', 'js'].includes(b.lang)).sort((a, b) => b.body.length - a.body.length)[0];

  let meta: z.infer<S> | undefined;
  if (!jsonBlock) problems.push('No ```json metadata block was found.');
  else {
    try {
      const parsed = (schema ?? GameMetaSchema).safeParse(JSON.parse(jsonBlock.body));
      if (parsed.success) meta = parsed.data as z.infer<S>;
      else problems.push('The metadata did not match the schema: ' + parsed.error.issues.slice(0, 6).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    } catch (e) { problems.push('The metadata block is not valid JSON: ' + (e as Error).message); }
  }
  if (!codeBlock) problems.push('No ```javascript block with the game was found.');
  return { meta, code: codeBlock?.body, problems };
}

/**
 * Read a world module before it runs. On top of the sandbox rules, a world
 * must leave the runtime's jobs to the runtime: the loop, the input, the page,
 * the contract and the coins.
 */
const WORLD_FORBIDDEN: [RegExp, string][] = [
  [/GameMog\.(ready|finish)\s*\(/, 'Do not call GameMog.ready or GameMog.finish; the runtime does.'],
  [/new\s+THREE\.WebGLRenderer/, 'Do not create a renderer; the runtime owns it.'],
  [/\brequestAnimationFrame\b/, 'Do not run your own loop; animate in update(ctx, t, dt) and in animate(t, dt, s).'],
  [/\b(setTimeout|setInterval)\s*\(/, 'Do not use timers; time things from t in update() and animate().'],
  [/\baddEventListener\s*\(/, 'Do not listen for input; the runtime owns the controls.'],
  [/document\.body|\.innerHTML|\.appendChild\s*\(|document\.querySelector/, 'Do not touch the page; the runtime owns the HUD and screens. Draw textures with ctx.textures.canvas.'],
  // 3D only: the chase camera is the runtime's, so a world cannot flatten it
  // into a 2D, top-down or side-on view
  [/\bOrthographicCamera\b|\bnew\s+THREE\.PerspectiveCamera\b/, 'GameMog worlds are 3D and seen through the runtime\'s chase camera. Do not create cameras.'],
  [/\bcamera\s*\.\s*(position|rotation|quaternion|up|scale|matrix\w*|projectionMatrix\w*)\s*\.\s*(set|copy|add\w*|sub\w*|lerp\w*|multiply\w*|apply\w*|setFrom\w*|make\w*|identity|normalize|negate)\s*\(|\bcamera\s*\.\s*(position|rotation|quaternion|up|fov|zoom|near|far|aspect|filmGauge|filmOffset|matrix\w*|projectionMatrix\w*|view)\s*(\.\s*[xyzw]\s*)?[-+*/]?=(?!=)|\bcamera\s*\.\s*(lookAt|rotate[XYZ]|rotateOnAxis|translate[XYZ]|translateOnAxis|setViewOffset|setFocalLength|setLens|updateProjectionMatrix|add|attach)\s*\(/,
    'The camera belongs to the runtime: every world is 3D, seen from behind the player. Read ctx.camera (for example its position, to face a billboard at it) but never move, re-aim, re-project or attach things to it.'],
];

/* ------------------------------------------------- a penalty shootout's own check (13 Oct, SHOOTOUT Mogs, M3) -- */
/**
 * A shootout is moggable only if the builder cannot hand the runtime something it cannot run: a second kind beside it,
 * sides it cannot read, a body without its football moves, a sound or a pitch of the world's own, or a real
 * competition's or player's name. These are refused here, so the builder is told and fixes it before a test drive is
 * spent on it. They read only a world whose shootout: { ... } is written among GameMog.world's own keys (isShootoutWorld),
 * and SC2 any world that writes one beside open or kart; no other world is touched. The messages are the platform
 * check's (scripts/platform-check.ts).
 */
export const SHOOTOUT_CHECK = {
  SC2: 'A world is one kind: shootout: { ... } never sits beside open: { ... } or kart: { ... }.',
  SC3: 'A penalty shootout lists \'human-moves-football-male\' and \'human-moves-football-female\' in its assets, with its body (\'human-athlete-male\' or \'human-athlete-female\'): the run-up, the strike and the keeper\'s dives are in them.',
  SC4: 'Write shootout.teams out inline as exactly two sides, each { name: \'...\', short: \'ABC\' (2 to 4 capitals), color: \'#RRGGBB\' }: the HUD\'s chips and tally read them.',
  SC5: 'shootout.taker is 0 or 1: the side taking the kicks.',
  body: 'shootout.body is written out as \'human-athlete-male\' or \'human-athlete-female\': the match\'s body, which the taker, the keeper and the referee are built on and rigged for.',
  SC7: 'ctx.broadcast() and ctx.kart are not for a penalty shootout: draw your own screen picture.',
  mirror: 'ctx.mirror() is not for a penalty shootout: it draws the whole bowl a second time every frame. Give a wet pitch its shine with a lower roughness and the floodlights in graphics.environment.extras.',
  owned: 'A penalty shootout\'s sound and pitch are the runtime\'s: write no music, no ambient() and no track among GameMog.world\'s keys (the crowd is its sound; draw the pitch and its lines in build()).',
  people: 'A penalty shootout writes player(ctx) (the taker) and rival(ctx, k, o) (k 1 the keeper, k 2 the referee) among GameMog.world\'s own keys, each returning a library human (ctx.assets.human(...)) as it comes: the runtime rigs them to kick and to dive.',
} as const;
/** SC6, with the name it found. */
export const shootoutDeniedSaid = (word: string) => `A penalty shootout names no real competition, federation, league or player (found: "${word}"): give the match, the boards and the people names of the world's own. Country names and colours are fine.`;
// competitions, federations, leagues and players a shootout never names (word-bounded, any case; a word next to a
// letter of any alphabet is not one, so "café" is not CAF); the short acronyms only in capitals, as a board writes them
const DENY_ANY = new RegExp(`(?<![\\p{L}\\p{N}])(?:${[
  'fifa', 'f\\.i\\.f\\.a\\.?', 'world[ -]?cup', 'uefa', 'conmebol', 'concacaf', 'champions league', 'europa league', 'conference league', 'nations league',
  'copa am[eé]rica', 'copa libertadores', 'libertadores', 'copa del rey', 'copa del mundo', 'copa do mundo', 'coupe du monde', 'weltmeisterschaft', 'mundial',
  'euro[ -]?20\\d\\d', 'the euros', 'afcon', 'africa cup of nations', 'asian cup', 'gold cup', 'jules rimet', 'olympics?', 'olympiad', 'socceroos',
  'premier league', 'la ?liga', 'bundesliga', 'serie a', 'ligue 1', 'eredivisie', 'ballon d[\'’]or',
  'messi', 'ronaldo', 'ronaldinho', 'cristiano', 'cr7', 'mbapp[eé]', 'neymar', 'haaland', 'modri[cć]', 'lewandowski', 'bellingham',
  'vin[ií]cius', 'yamal', 'pelé', 'maradona', 'zidane', 'beckham', 'buffon', 'courtois', 'lloris', 'de bruyne', 'griezmann',
  'son heung', 'yashin', 'ibrahimovi[cć]', 'zlatan', 'totti', 'cantona', 'cruyff', 'puskas', 'kroos',
  // (the shootouts' own, 13 Oct review: the famous takers and keepers of famous shootouts)
  'baggio', 'southgate', 'rashford', 'trezeguet', 'montiel', 'dybala', 'casillas', 'pirlo', 'dibu', 'emiliano mart[ií]nez',
  // (Iceland's and Norway's, 13 Oct: the integration Mog's taker was named after one; the Mog page offers Reykjavik)
  'sigur[dð]sson', 'halld[oó]rsson', 'gu[dð]johnsen', 'finnbogason', '[oø]degaard', 'solskj[aæ]e?r',
  // (the sponsors a final's boards are hung with: the boards speak the world's own words)
  'adidas', 'nike', 'fly emirates', 'qatar airways', 'coca[ -]?cola', 'heineken', 'mastercard', 'pepsi',
].join('|')})(?![\\p{L}\\p{N}])`, 'iu');
const DENY_CAPS = /(?<![\p{L}\p{N}])(?:CAF|AFC|MLS)(?![\p{L}\p{N}])/u;
// players' names that are also everyday words (German "neuer", Portuguese "pele", Malay "salah", Italian "grosso"): refused
// only where they name someone (a name: in the code, the title and the cast), never on a board that means the word
const DENY_NAMES = new RegExp(`(?<![\\p{L}\\p{N}])(?:${['neuer', 'pele', 'salah', 'kane', 'saka', 'pearce', 'waddle', 'sancho', 'grosso', 'panenka'].join('|')})(?![\\p{L}\\p{N}])`, 'iu');
/**
 * The real competition, federation, league or player a text names (as a penalty shootout may not), or null. `named`: the
 * text names someone (a name: in the code, the title or the cast), where the players' names that are everyday words count too.
 */
export function shootoutDenied(text: string, named = false): string | null {
  const m = DENY_ANY.exec(text) ?? DENY_CAPS.exec(text) ?? (named ? DENY_NAMES.exec(text) : null);
  return m ? m[0] : null;
}

/**
 * The code with its comments blanked, and the insides of its strings and regular expressions, index for index: its
 * brackets and keys are read from this, and a string's own text from the code at the same place. With every string
 * literal's span and text.
 */
function maskCode(code: string) {
  const b = code.split(''), strings: { s: number; e: number; text: string }[] = [];
  const blank = (s: number, e: number) => { for (let k = s; k < e && k < b.length; k++) if (b[k] !== '\n') b[k] = ' '; };
  // (a slash starts a regular expression where a value is expected: after an operator, an opening bracket or a keyword)
  const valueAt = (i: number) => {
    let p = i - 1; while (p >= 0 && /\s/.test(code[p])) p--;
    if (p < 0) return true;
    if (/[(,=:[!&|?{};~+\-*%<>^]/.test(code[p])) return true;
    if (!/[\w$]/.test(code[p])) return false;
    let q = p; while (q >= 0 && /[\w$]/.test(code[q])) q--;
    return /^(?:return|typeof|case|in|of|void|delete|new|else|do|throw|yield|await)$/.test(code.slice(q + 1, p + 1));
  };
  let i = 0;
  while (i < code.length) {
    const c = code[i], n = code[i + 1];
    if (c === '/' && n === '/') { const e = code.indexOf('\n', i), end = e < 0 ? code.length : e; blank(i, end); i = end; continue; }
    if (c === '/' && n === '*') { const e = code.indexOf('*/', i + 2), end = e < 0 ? code.length : e + 2; blank(i, end); i = end; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1; while (j < code.length && code[j] !== c) j += code[j] === '\\' ? 2 : 1;
      strings.push({ s: i, e: Math.min(j + 1, code.length), text: code.slice(i + 1, Math.min(j, code.length)).replace(/\\(.)/g, '$1') });
      blank(i + 1, j); i = j + 1; continue;
    }
    if (c === '/' && valueAt(i)) {
      let j = i + 1, cls = false, ok = false;
      while (j < code.length && code[j] !== '\n') {
        const d = code[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) { ok = true; break; }
        j++;
      }
      if (ok) { blank(i + 1, j); i = j + 1; continue; }
    }
    i++;
  }
  return { bare: b.join(''), strings };
}
/**
 * An object literal's own entries, read from the masked code from just inside its opening brace: each key with the
 * span of its value (after the colon; a method's or a shorthand's, the text after its name), and the object's end.
 */
function entriesOf(bare: string, code: string, from: number) {
  const out = new Map<string, { s: number; e: number; colon: boolean }>();
  let depth = 1, i = from, start = from;
  const take = (end: number) => {
    let k = start; while (k < end && /\s/.test(bare[k])) k++;
    if (k >= end) return;
    let key = '', after = k;
    if (bare[k] === '"' || bare[k] === "'") { const z = bare.indexOf(bare[k], k + 1); if (z < 0 || z >= end) return; key = code.slice(k + 1, z); after = z + 1; }
    else { const id = /^[A-Za-z_$][\w$]*/.exec(bare.slice(k, end)); if (!id) return; key = id[0]; after = k + id[0].length; }
    let v = after; while (v < end && /\s/.test(bare[v])) v++;
    const colon = bare[v] === ':';
    out.set(key, { s: colon ? v + 1 : v, e: end, colon });
  };
  while (i < bare.length) {
    const c = bare[i];
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') { if (--depth === 0) break; }
    else if (c === ',' && depth === 1) { take(i); start = i + 1; }
    i++;
  }
  take(i);
  return { entries: out, end: i };
}
/** An array literal's items, read from the masked code from just inside its opening bracket: each item's span. */
function itemsOf(bare: string, from: number) {
  const out: { s: number; e: number }[] = [];
  let depth = 1, i = from, start = from;
  const take = (end: number) => { if (bare.slice(start, end).trim()) out.push({ s: start, e: end }); };
  while (i < bare.length) {
    const c = bare[i];
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') { if (--depth === 0) break; }
    else if (c === ',' && depth === 1) { take(i); start = i + 1; }
    i++;
  }
  take(i);
  return out;
}
/** A value written as one string literal (its text), or null. */
function literalOf(bare: string, code: string, span: { s: number; e: number }) {
  const t = bare.slice(span.s, span.e), lead = t.length - t.trimStart().length, body = t.trim();
  const q = body[0];
  if (!body || !(q === '"' || q === "'" || q === '`') || body[body.length - 1] !== q || body.length < 2) return null;
  const raw = code.slice(span.s + lead + 1, span.s + lead + body.length - 1);
  if (bare.slice(span.s + lead + 1, span.s + lead + body.length - 1).includes(q) || (q === '`' && raw.includes('${'))) return null;
  return raw.replace(/\\(.)/g, '$1');
}
const falsy = (bare: string, span: { s: number; e: number }) => /^(?:false|null|undefined|0)?$/.test(bare.slice(span.s, span.e).trim());

/** What a world that writes shootout: { ... } among GameMog.world's own keys gets wrong for its runtime (none for any other). */
function shootoutProblems(code: string, from: number): string[] {
  const top = topOf(code, from);
  if (!/(?:^|[\s,{])shootout\s*:\s*\{/.test(top)) return [];
  const { bare, strings } = maskCode(code), W = entriesOf(bare, code, from).entries;
  const so = W.get('shootout');
  // SC2: the runtime reads open first, then kart; a shootout beside either is not served or not run as one
  const other = ['open', 'kart'].some((k) => { const v = W.get(k); return v && (!v.colon || !falsy(bare, v)); });
  if (other) return [SHOOTOUT_CHECK.SC2];
  if (!so || !isShootoutWorld(code)) return [];
  const problems: string[] = [];
  const brace = bare.indexOf('{', so.s);
  const S = entriesOf(bare, code, brace + 1).entries;
  // SC3: the match's body and both football packs among its assets (the list as written, or every string when the
  // list is a name)
  const assets = W.get('assets'), listed = assets && bare.slice(assets.s, assets.e).trim().startsWith('[')
    ? strings.filter((x) => x.s >= assets.s && x.e <= assets.e).map((x) => x.text) : strings.map((x) => x.text);
  const bodySpan = S.get('body'), body = bodySpan ? literalOf(bare, code, bodySpan) : 'human-athlete-male';
  const bodies = ['human-athlete-male', 'human-athlete-female'];
  if (!listed.includes('human-moves-football-male') || !listed.includes('human-moves-football-female')
    || (body && bodies.includes(body) ? !listed.includes(body) : !bodies.some((b) => listed.includes(b)))) problems.push(SHOOTOUT_CHECK.SC3);
  if (bodySpan && !(body && bodies.includes(body))) problems.push(SHOOTOUT_CHECK.body);
  // SC4: exactly two sides, written out, each a name, a short name in capitals and a colour; two different sides
  const teams = S.get('teams'), tt = teams ? bare.slice(teams.s, teams.e) : '', open = teams ? teams.s + tt.indexOf('[') : -1;
  const sides = teams && /^\s*\[/.test(tt) && /\]\s*$/.test(tt) ? itemsOf(bare, open + 1).map((it) => {
    const t = bare.slice(it.s, it.e).trim();
    if (!t.startsWith('{') || !t.endsWith('}')) return null;
    const E = entriesOf(bare, code, bare.indexOf('{', it.s) + 1).entries, f = (k: string) => { const v = E.get(k); return v ? literalOf(bare, code, v) : null; };
    const name = f('name')?.trim() ?? '', short = f('short') ?? '', color = f('color') ?? '';
    return name.length >= 1 && name.length <= 24 && /^[A-Z]{2,4}$/.test(short) && /^#[0-9a-fA-F]{6}$/.test(color) ? { name: name.toLowerCase(), short } : null;
  }) : [];
  if (sides.length !== 2 || !sides[0] || !sides[1] || sides[0].name === sides[1].name || sides[0].short === sides[1].short) problems.push(SHOOTOUT_CHECK.SC4);
  // SC5: the side taking the kicks, as the number the runtime reads (taker === 1, else 0)
  const taker = S.get('taker');
  if (taker && !/^[01]$/.test(bare.slice(taker.s, taker.e).trim())) problems.push(SHOOTOUT_CHECK.SC5);
  // SC6: never a real competition, federation, league or player, in any string (never a comment)
  // (a string that is a name: name: '...', or .name = '...')
  for (const x of strings) { const w = shootoutDenied(x.text, /(?:\bname\s*:|\.name\s*=)\s*$/.test(bare.slice(Math.max(0, x.s - 32), x.s))); if (w) { problems.push(shootoutDeniedSaid(w)); break; } }
  // SC7, and the mirror: the TV picture is v1's lap camera, a kart's kit is not there, a mirror is a second render
  if (/\b\w*ctx\w*\s*\.\s*(?:broadcast\s*\(|kart\b)/i.test(bare)) problems.push(SHOOTOUT_CHECK.SC7);
  if (/\b\w*ctx\w*\s*\.\s*mirror\s*\(/i.test(bare)) problems.push(SHOOTOUT_CHECK.mirror);
  // the runtime's: the sound (no score, no world sound) and the pitch (a lap's track would hide the stands it crosses)
  if (['music', 'ambient', 'track'].some((k) => { const v = W.get(k); return v && (!v.colon || !falsy(bare, v)); })) problems.push(SHOOTOUT_CHECK.owned);
  // the taker, the keeper and the referee, as library humans
  if (!W.has('player') || !W.has('rival') || !/\bassets\s*\.\s*human\s*\(/.test(bare)) problems.push(SHOOTOUT_CHECK.people);
  return problems;
}

/* ------------------------------------------------------- a Grand Prix's own check (14 Oct, ARTIFICIAL1 M1) -- */
/**
 * A Grand Prix is served only if its runtime can run it: one kind, its lap written as a literal the runtime's own track
 * code accepts (the check runs lib/runtime/gp-track.js on it, so the check and the game judge the same lap), no real
 * series' marks, its cars and sound left to the runtime, and a field it can line up. Read only for a world whose gp: {...}
 * is among GameMog.world's own keys, and GP2 for any world that writes one beside another kind; no other world is touched.
 */
export const GP_CHECK = {
  GP1: 'Write the Grand Prix inline, gp: { ... }, among GameMog.world\'s own keys (not gp: SOME_CONST): only then is it served as a Grand Prix.',
  GP2: 'A world is one kind: gp: { ... } never sits beside open: { ... }, kart: { ... } or shootout: { ... }, and a Grand Prix writes no play.vehicle (its cars are the runtime\'s).',
  GP3: 'A Grand Prix writes its lap inline as track: { start, width, segments, elevation, widths, bank, verge, runoff }, in numbers, strings, true, false, null, arrays and objects only (no names, calls, sums or template strings), so the check and the game build the same lap.',
  GP5: 'A Grand Prix\'s cars and sound are the runtime\'s: write no player(), rival() or music among GameMog.world\'s keys (ambient() is fine).',
  GP6: 'ctx.broadcast(), ctx.mirror(), ctx.kart and ctx.shootout are not for a Grand Prix: its cameras are the runtime\'s, and a mirror draws the whole lap a second time every frame.',
  GP7: 'gp.laps is 1 to 5 and gp.field 2 to 20; gp.teams and gp.drivers are written inline, at least gp.field drivers, each with its own id, a team listed in gp.teams (by id) and a tla of 3 capitals.',
} as const;
/** GP4, with the name it found. */
export const gpDeniedSaid = (word: string) => `A Grand Prix never names a real racing series, its governing body or its marks (found: "${word}"): the race, its teams, its drivers, its circuit and its overtake aid (the Flap) have names of the world's own.`;
// a series' and its governing body's names and marks (word-bounded: a hex colour's F1 is not one); the acronyms that are
// everyday letters elsewhere only in capitals, as a board writes them
const GP_DENY_ANY = /(?<![\p{L}\p{N}])(?:f1|formula[ -]?(?:one|1)|formula|paddock club|f1 ?studio|f1\.glb)(?![\p{L}\p{N}])/iu;
const GP_DENY_CAPS = /(?<![\p{L}\p{N}])(?:FIA|FOM|DRS)(?![\p{L}\p{N}])/u;
/** The series' name or mark a text uses (as a Grand Prix may not), or null. */
export function gpDenied(text: string): string | null {
  const m = GP_DENY_ANY.exec(text) ?? GP_DENY_CAPS.exec(text);
  return m ? m[0] : null;
}
// lib/runtime/gp-track.js, loaded once per file version into a realm of its own: the runtime's own lap builder
let GP_TRACK: { src: string; fn: ((src: unknown, lim: unknown, warn: (m: string) => void) => unknown) | null } = { src: '', fn: null };
function gpTrackFn() {
  let src = '';
  try { src = readFileSync(join(process.cwd(), 'lib', 'runtime', 'gp-track.js'), 'utf8'); } catch { return null; }
  if (src !== GP_TRACK.src) GP_TRACK = { src, fn: runInNewContext(`${src}\n;gpTrack`, {}, { timeout: 2000 }) as typeof GP_TRACK.fn };
  return GP_TRACK.fn;
}
/** Whether a value, read from the masked code, is a plain literal: objects, arrays, numbers, strings, true, false, null, unary minus. */
function plainLiteral(bare: string, code: string, s: number, e: number) {
  if (code.slice(s, e).includes('`')) return false;
  let i = s;
  while (i < e) {
    const c = bare[i];
    if (/\s/.test(c)) { i++; continue; }
    if ('{}[],:'.includes(c)) { i++; continue; }
    if (c === '"' || c === "'") { const z = bare.indexOf(c, i + 1); if (z < 0 || z >= e) return false; i = z + 1; continue; }
    const num = /^-?\s*(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(bare.slice(i, Math.min(e, i + 64)));
    if (num) { i += num[0].length; continue; }
    const id = /^[A-Za-z_$][\w$]*/.exec(bare.slice(i, Math.min(e, i + 64)));
    if (!id) return false;
    let k = i + id[0].length; while (k < e && /\s/.test(bare[k])) k++;
    if (bare[k] !== ':' && !/^(?:true|false|null)$/.test(id[0])) return false;
    i += id[0].length;
  }
  return true;
}
/** What a world that writes gp: { ... } among GameMog.world's own keys gets wrong for its runtime (none for any other). */
function gpProblems(code: string, from: number): string[] {
  const top = topOf(code, from);
  if (!/(?:^|[\s,{])gp\s*:\s*\{/.test(top)) return [];
  const { bare, strings } = maskCode(code), W = entriesOf(bare, code, from).entries;
  // GP2: one kind (the runtime reads open, then kart, then shootout, and a Grand Prix only without all three)
  const other = ['open', 'kart', 'shootout'].some((k) => { const v = W.get(k); return v && (!v.colon || !falsy(bare, v)); });
  const play = W.get('play'), playBrace = play && play.colon ? bare.indexOf('{', play.s) : -1;
  const vehicle = playBrace >= 0 && playBrace < play!.e ? entriesOf(bare, code, playBrace + 1).entries.get('vehicle') : undefined;
  if (other || (vehicle && (!vehicle.colon || !falsy(bare, vehicle)))) return [GP_CHECK.GP2];
  const gpE = W.get('gp');
  if (!gpE || !isGpWorld(code)) return [];
  const problems: string[] = [];
  // GP3: the lap, a literal, then built by the runtime's own code: every refusal and every issue it raises
  const tr = W.get('track');
  const trText = tr ? bare.slice(tr.s, tr.e) : '', lead = trText.length - trText.trimStart().length;
  if (!tr || !tr.colon || !/^\s*\{/.test(trText) || !/\}\s*$/.test(trText) || !plainLiteral(bare, code, tr.s, tr.e)) problems.push(GP_CHECK.GP3);
  else {
    const fn = gpTrackFn();
    if (!fn) problems.push('The Grand Prix runtime (lib/runtime/gp-track.js) is not in this tree, so the lap cannot be checked.');
    else {
      try {
        // (from its opening brace to its closing one, so a comment after it cannot swallow the bracket around it)
        const value = runInNewContext(`(${code.slice(tr.s + lead, tr.s + trText.lastIndexOf('}') + 1)})`, Object.create(null), { timeout: 500 });
        const issues: string[] = [];
        // (built under a time limit of its own as well: the lap code bounds its work, and a lap it cannot build in a second
        // and a half is refused, never left to hold the server)
        runInNewContext('fn(value, null, warn)', { fn, value, warn: (m: string) => { if (!issues.includes(m)) issues.push(m); } }, { timeout: 1500 });
        problems.push(...issues);
      } catch (e) { problems.push(`The lap (track): ${String((e as Error)?.message ?? e)}`); }
    }
  }
  // GP4: no series' name or mark in any string (never a comment)
  for (const x of strings) { const w = gpDenied(x.text); if (w) { problems.push(gpDeniedSaid(w)); break; } }
  // GP5: the cars and the sound are the runtime's
  if (['player', 'rival', 'music'].some((k) => W.has(k))) problems.push(GP_CHECK.GP5);
  // GP6: no TV picture, no mirror, no other kind's kit
  if (/\b\w*ctx\w*\s*\.\s*(?:broadcast\s*\(|mirror\s*\(|kart\b|shootout\b)/i.test(bare)) problems.push(GP_CHECK.GP6);
  // GP7: the field it lines up
  const gpBrace = gpE.colon ? bare.indexOf('{', gpE.s) : -1;
  const G = gpBrace >= 0 ? entriesOf(bare, code, gpBrace + 1).entries : new Map<string, { s: number; e: number; colon: boolean }>();
  const numOf = (k: string, d: number) => { const v = G.get(k); if (!v) return d; const t = bare.slice(v.s, v.e).trim(); return /^-?\d+(?:\.\d+)?$/.test(t) ? Number(t) : NaN; };
  const listOf = (k: string) => {
    const v = G.get(k), t = v ? bare.slice(v.s, v.e) : '';
    if (!v || !/^\s*\[/.test(t) || !/\]\s*$/.test(t)) return null;
    return itemsOf(bare, v.s + t.indexOf('[') + 1).map((it) => {
      const s = bare.slice(it.s, it.e).trim();
      if (!s.startsWith('{') || !s.endsWith('}')) return null;
      const E = entriesOf(bare, code, bare.indexOf('{', it.s) + 1).entries, f = (key: string) => { const x = E.get(key); return x ? literalOf(bare, code, x) : null; };
      return { id: f('id'), team: f('team'), tla: f('tla') };
    });
  };
  const laps = numOf('laps', 3), field = numOf('field', 20), teams = listOf('teams'), drivers = listOf('drivers');
  const teamIds = new Set((teams ?? []).map((x) => x?.id).filter(Boolean));
  const ids = (drivers ?? []).map((x) => x?.id);
  const ok7 = Number.isInteger(laps) && laps >= 1 && laps <= 5 && Number.isInteger(field) && field >= 2 && field <= 20 && !!teams && !!drivers
    && teams.every((x) => !!x?.id) && drivers.length >= field && drivers.every((x) => !!x && !!x.id && !!x.team && teamIds.has(x.team) && /^[A-Z]{3}$/.test(x.tla ?? ''))
    && new Set(ids).size === ids.length;
  if (!ok7) problems.push(GP_CHECK.GP7);
  return problems;
}

// The most code a world module may hold, the same for every world: the
// builder's, a Mog and the owner's own (the owner, 5 Oct 2026: "keep things
// simple, raise everything to 500 KB"; 15 Oct 2026, for Artificial1: "raise
// to 750 KB").
export const WORLD_MAX = 750_000;

export function staticCheckWorld(code: string, opts: { max?: number } = {}): string[] {
  const problems: string[] = [], max = opts.max ?? WORLD_MAX;
  if (code.length < 1500) problems.push('The world module is too short to be a real world. Build the whole thing.');
  if (code.length > max) problems.push(`The world module is ${Math.round(code.length / 1000)}KB; keep it under ${Math.round(max / 1000)}KB.`);
  if (!/GameMog\.world\s*\(/.test(code)) problems.push('The module never calls GameMog.world({...}).');
  for (const [re, why] of [...FORBIDDEN, ...WORLD_FORBIDDEN]) if (re.test(code)) problems.push(why);
  // a kart race is known by the text kart: { among GameMog.world's own keys, which is how its runtime gets the kart
  // kit; a kart: named any other way (a const, a call, the shorthand) would be served without it and race the endless laps
  const m = /\bGameMog\s*\.\s*world\s*\(\s*\{/.exec(code), top = m ? topOf(code, m.index + m[0].length) : '';
  if (/(?:^|[\s,{])kart\s*(?::\s*(?!(?:false|null|undefined)\b)[\w$(]|,|$)/.test(top) && !isKartWorld(code) && !/(?:^|[\s,{])open\s*:\s*\{/.test(top))
    problems.push('Write the kart race inline, kart: { ... }, among GameMog.world\'s own keys (not kart: SOME_CONST): only then is it served as a kart race.');
  // (and a penalty shootout the same way, 12 Oct: shootout: { ... } inline is what gets it its runtime)
  if (/(?:^|[\s,{])shootout\s*(?::\s*(?!(?:false|null|undefined)\b)[\w$(]|,|$)/.test(top) && !isShootoutWorld(code) && !/(?:^|[\s,{])(?:open|kart)\s*:\s*\{/.test(top))
    problems.push('Write the penalty shootout inline, shootout: { ... }, among GameMog.world\'s own keys (not shootout: SOME_CONST): only then is it served as a shootout.');
  // (and a shootout is one kind, written as its runtime reads it, 13 Oct: lib/runtime/API.md "Penalty shootouts")
  if (m) problems.push(...shootoutProblems(code, m.index + m[0].length));
  // (and a Grand Prix the same way, 14 Oct: gp: { ... } inline is what gets it its runtime, and it is one kind, written as
  // its runtime reads it, its lap judged by the runtime's own track code)
  if (/(?:^|[\s,{])gp\s*(?::\s*(?!(?:false|null|undefined)\b)[\w$(]|,|$)/.test(top) && !isGpWorld(code) && !/(?:^|[\s,{])(?:open|kart|shootout)\s*:\s*\{/.test(top))
    problems.push(GP_CHECK.GP1);
  if (m) problems.push(...gpProblems(code, m.index + m[0].length));
  try { new Script(code, { filename: 'world.js' }); }
  catch (e) { problems.push(`Syntax error: ${(e as Error).message}`); }
  return problems;
}
