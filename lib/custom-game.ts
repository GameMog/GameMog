import { readOptions, type WorldOptions } from './world-options';
import { z } from 'zod';
import { Script } from 'node:vm';
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
export const KART_CONTROLS = 'W or the up arrow: gas (hit it as the 1 lands for a Moon Launch). S or the down arrow: brake, then reverse. A D or the left and right arrows: steer. Space: hop, and hold it through a turn to drift (let go for a boost); off a ramp, a trick. X (or J, K, Shift): use your item, held to drag a Rug Pull or Laser Eyes behind you as a shield; E throws it ahead; with S or the down arrow, behind. C: look back. P: pause. On touch screens, a stick to steer and DRIFT, ITEM and BRAKE buttons (the gas is automatic; hold DRIFT on the grid to launch; the stick up or down aims an item); a gamepad works too.';
// a derby (open.vehicle): car combat in an arena
export const DERBY_CONTROLS = 'W A S D or the arrow keys: drive (S brakes, then reverses). Space: handbrake. Shift: boost. J, F or a held click: the roof guns. Drag: look around. P: pause. On touch screens, a stick to drive and BOOST, BRAKE and FIRE.';
/**
 * What kind of world a game is (1 Oct): a lap race, an open world you survive in, or a
 * derby (cars in an arena). The runtime decides it from the code, so the code is the
 * truth; meta.mode records it when a world is stored, and a game stored before that
 * is read from what it did store (scoring 'survival', options.open).
 */
export const WORLD_MODES = ['race', 'survival', 'derby', 'kart'] as const;
export type WorldMode = (typeof WORLD_MODES)[number];
export function worldMode(code?: string | null, meta?: string | null | Record<string, unknown>): WorldMode {
  // (a kart race, 6 Oct: kart: {...} among GameMog.world's own keys; read first, so a kart world that names a
  // vehicle or an "open" anywhere inside it stays a kart race)
  if (code) return isKartWorld(code) ? 'kart' : isOpenWorld(code) ? (/\bvehicle\s*:\s*\{/.test(code) ? 'derby' : 'survival') : 'race';
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
export function kartHow(laps?: number | null) {
  const n = laps == null || !Number.isFinite(laps) ? 3 : Math.max(1, Math.min(5, Math.round(laps)));
  return MODE_PAGE.kart.how.replace('three laps', n === 1 ? 'one lap' : `${['two', 'three', 'four', 'five'][n - 2]} laps`);
}
/** An open world with no GM (the creator's option, or open.coins: false) explains itself without coins. */
export const NO_GM_HOW = 'An open world to roam, with no GM to chase. Crews come for you, more of them and tougher as the heat rises: it climbs with time and with every few knockouts, and a boss arrives at every third heat. Get knocked out and the run is over. The leaderboard ranks the time survived, then the takedowns.';
export function worldControls(code: string) {
  if (isKartWorld(code)) return KART_CONTROLS;
  const mode = worldMode(code);
  if (mode !== 'race') return mode === 'derby' ? DERBY_CONTROLS : openControls(code);
  return /\bplay\s*:\s*\{[\s\S]{0,400}?\bcombat\s*:/.test(code)
    ? 'Arrow keys or WASD: left and right steer, up is faster, down is slower. X (or J) swings your sword. Space: jump. P: pause. On-screen buttons, a JUMP and a sword button, on touch screens.'
    : WORLD_CONTROLS;
}

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
function hostScript(id: string, title: string, tagline = '', options?: WorldOptions, kartScore?: unknown) {
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
      }
      gm.results.push(out);
      post(out);
    }
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
const OPEN_STUB = '    var OW = null;\n    function openWorld() {}\n';
export function runtimeSource(version: number, kart = false) {
  const key = `${version}${kart ? ':kart' : ''}`;
  if (!RUNTIMES[key] || process.env.NODE_ENV !== 'production') {
    // the platform's score engine and car kit ride in front of the runtime that uses them
    const read = (f: string) => readFileSync(join(process.cwd(), 'lib', 'runtime', f), 'utf8');
    const v = read(`v${version}.js`);
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

export function renderWorldGame(world: string, meta: Pick<GameMeta, 'title' | 'tagline'> & { options?: unknown; kartScore?: unknown }, id: string, runtime = 1, drive = false) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title>${escapeHtml(meta.title)}</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000;touch-action:none;-webkit-user-select:none;user-select:none}canvas{display:block}</style>
<script>${hostScript(id, meta.title, meta.tagline, meta.options === undefined ? undefined : readOptions(meta.options), isKartWorld(world) ? meta.kartScore : undefined)}</script>
${drive ? `<script>
${inert(driveSource())}
</script>` : ''}
<script src="https://cdn.jsdelivr.net/npm/three@0.157.0/build/three.min.js"></script>
<script>window.THREE || document.write('<script src="https://cdn.jsdelivr.net/npm/three@0.157.0/build/three.js"><\\/script>');</script>
</head>
<body>
${mapScripts(world)}${endoScript(world)}
<script>
${inert(runtimeSource(runtime, isKartWorld(world)))}
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

// The most code a world module may hold, the same for every world: the
// builder's, a Mog and the owner's own (the owner, 5 Oct 2026: "keep things
// simple, raise everything to 500 KB").
export const WORLD_MAX = 500_000;

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
  try { new Script(code, { filename: 'world.js' }); }
  catch (e) { problems.push(`Syntax error: ${(e as Error).message}`); }
  return problems;
}
