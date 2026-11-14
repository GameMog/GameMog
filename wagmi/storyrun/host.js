// Mog City story runner: messages to a framing GameMog, at its own origin only (?host=, one of story/allow.js hostOf's;
// none without it, or with one not allowed; nothing when not framed). Nothing inbound is read.
//   ready         { gameId, hash, story: { v: 2, ok, id, hash, why } }       the world is in (or refused, ok false)
//   result        { game, mission, passed: true, story, secs }              a mission passed, once a session per mission
//                                                                           (only with ?game=)
//   progress      { mission, step, kind, i, n }                             each step as it starts (kind: the step's type)
//   mission-start { id, title } · mission-end { id, how, secs | why } · mission-fail { id, why, step, kind } · story-end { id }
//   keyart        { wide, square }                                          JPEG bytes, transferred ArrayBuffers
//   hidden        { hidden }                                                the page went behind (true: Chrome stops
//                                                                           drawing it, the drive is paused) or came back
//   error         { kind, message, where? }                                 kind: 'page' (an uncaught error), 'rejection'
//                                                                           (an unhandled rejection), 'load' (a script,
//                                                                           image, model or sound that did not load, or
//                                                                           the world itself); each distinct one once, 40
//                                                                           at most a session (watch(), from pack.js)
import { hostOf } from './allow.js';

const q = new URLSearchParams(location.search);
const framed = typeof window !== 'undefined' && window.parent && window.parent !== window;
const parentAt = hostOf(q.get('host'));
export const log = [];

export function tell(type, data = {}, transfer = []) {
  const msg = { source: 'gamemog', ...data, type };
  const shown = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v instanceof ArrayBuffer ? { bytes: v.byteLength } : v]));
  log.push({ ...shown, type, at: +(performance.now() / 1000).toFixed(2) }); if (log.length > 200) log.shift();
  // (in the page too: a growing town swaps to the whole town at a mission's end, wagmi/world/growing.js)
  try { window.dispatchEvent(new CustomEvent('mc:tell', { detail: { ...shown, type } })); } catch {}
  if (!framed || !parentAt) return false;
  try { window.parent.postMessage(msg, parentAt, transfer); return true; } catch { return false; }
}
const told = new Set();
export function result(world, mission, secs) {
  const game = q.get('game');
  if (!game || told.has(mission)) return false;
  told.add(mission);
  return tell('result', { game, mission, passed: true, story: world.hash, secs: Math.max(0, Math.round(secs)) });
}

// what goes wrong on the page, and the page going behind: watched from the world's load on (pack.js load(), the first
// thing under ?pack=), so a world that never gets in still says why
let watching = false, errorsSent = 0;
const errorsSeen = new Set();
export function error(kind, message, where) {
  const m = String(message || kind).replace(/\s+/g, ' ').trim().slice(0, 200), key = `${kind}|${m}|${where || ''}`;
  if (errorsSeen.has(key) || errorsSent >= 40) return false;
  errorsSeen.add(key); errorsSent++;
  return tell('error', { kind, message: m, ...(where ? { where: String(where).slice(0, 200) } : {}) });
}
export function watch() {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  addEventListener('error', (e) => {
    const t = e.target;
    // (a resource's failed load reaches the window only in the capture phase, with no message: named by its tag and address)
    if (t && t !== window && t.tagName) { error('load', `${t.tagName.toLowerCase()} did not load`, t.currentSrc || t.src || t.href || ''); return; }
    error('page', e.message || e.error?.message || 'error', e.filename ? `${e.filename.replace(location.origin, '')}:${e.lineno}:${e.colno}` : '');
  }, true);
  addEventListener('unhandledrejection', (e) => { const r = e.reason; error('rejection', (r && (r.message || r.name)) || String(r)); });
  document.addEventListener('visibilitychange', () => tell('hidden', { hidden: document.hidden }));
}
