// Mog City story runner: messages to a framing GameMog, at its own origin only (?host=, one of story/allow.js hostOf's;
// none without it, or with one not allowed; nothing when not framed). Nothing inbound is read.
//   ready         { gameId, hash, story: { v: 2, ok, id, hash, why } }       the world is in (or refused, ok false)
//   result        { game, mission, passed: true, story, secs }              a mission passed, once a session per mission
//                                                                           (only with ?game=)
//   progress      { mission, step, kind, i, n }                             each step as it starts (kind: the step's type)
//   mission-start { id, title } · mission-end { id, how, secs | why } · mission-fail { id, why, step, kind } · story-end { id }
//   keyart        { wide, square }                                          JPEG bytes, transferred ArrayBuffers
import { hostOf } from './allow.js';

const q = new URLSearchParams(location.search);
const framed = typeof window !== 'undefined' && window.parent && window.parent !== window;
const parentAt = hostOf(q.get('host'));
export const log = [];

export function tell(type, data = {}, transfer = []) {
  const msg = { source: 'gamemog', ...data, type };
  log.push({ ...data, type, at: +(performance.now() / 1000).toFixed(2) }); if (log.length > 200) log.shift();
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
