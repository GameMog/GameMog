// Mog City: the story pack at run time. Imported first by wagmi/game.js (and by every module that reads the story's
// words); its top-level await holds them all until the pack is in, so nothing is said or drawn before it. The pack is
// the default (assets/story/default.json: Mog City as it is) or a Mog's, from ?story=<url>, accepted only from
// gamemog.com's story routes (see allowed()), checked by validatePack (schema.js), and on any failure the default.
// Never throws: with no pack at all (the default's fetch failed, or ?story=off on a local server) every call returns
// its input, which is the game as written.
//   S.line(speaker, text)   a spoken line by its default words ('Jane', 'Dan. Why is your laptop...') -> the pack's
//                           words; an unchanged line returns the very literal it was given
//   S.t(text)               the same for any other copy (objectives, help, cards, signs, DMs...); objects and arrays
//                           pass through
//   S.name(who)             a cast id ('mrbig') or a speaker id ('Mr. Big') -> the pack's display name; anyone else as is
//   S.title() / S.episode   'MOG CITY: <episode>' / the episode alone
//   S.changed(speaker, text)  the words are a line (or copy) the pack changed, not one of Mog City's lines (so no
//                           recording: the browser speaks them)
//   S.voiceOf(speaker)      { pitch, rate, prefer } for the browser's voice
//   S.look(id) · S.lookChanged(id) · S.dress(id, root) · S.body(man)   a cast member's look, and it put on a model
//                           (wagmi/story/dress.js); which man's body plays a Suit
//   S.knob(name)            a difficulty value (enemyHp, enemyDamage, heroHp, crewExtra, chaseSpeed)
//   S.save(key)             a save's storage key: the game's own for Mog City, its own per Mog
//   S.result(mission, secs)  a mission passed, told to a framing GameMog (below)
//   S.id · S.hash · S.isDefault · S.ok · S.pack
import { validatePack } from './schema.js';
import { dress as dressModel } from './dress.js';
import { makeStory, KNOBS, html } from './make.js';
import { allowed, hostOf, GAMEMOG } from './allow.js';

const q = new URLSearchParams(location.search);
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

async function sha256(text) {
  try {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}
// (no redirects followed: the address checked is the address read; and the response's own url checked again)
const getText = async (url) => { const r = await fetch(url, { credentials: 'omit', redirect: 'error' }); if (!r.ok) throw new Error(`${r.status} ${url}`); if (r.url && r.url !== String(url)) throw new Error('redirected'); const t = await r.text(); if (t.length > 400000) throw new Error('too large'); return t; };

// the story calls with no pack: everything as written
function passThrough(why) {
  const same = (_, t) => t;
  return {
    ok: false, why, id: 'off', hash: null, isDefault: true, pack: null, html, episode: 'Unfinished Business',
    line: same, t: (t) => t, name: (w) => w, title: () => 'MOG CITY: Unfinished Business', changed: () => false,
    voiceOf: () => null, look: () => null, lookChanged: () => false, dress: () => false, body: (m) => m, knob: (k) => KNOBS[k], save: (k) => k,
  };
}

async function loadStory() {
  if (q.get('story') === 'off' && LOCAL) return passThrough('off');
  let base, baseText;
  try { baseText = await getText(new URL('../../assets/story/default.json', import.meta.url)); base = JSON.parse(baseText); } catch (err) { console.warn('[story] no default pack:', err.message); return passThrough('no default'); }
  let pack = base, text = baseText, id = 'default', ok = true, why = null;
  const raw = q.get('story');
  if (raw && raw !== 'off') {
    const url = allowed(raw, location, hostOf(q.get('host')));
    if (!url) { ok = false; why = 'address not allowed'; }
    else {
      try {
        const [t, lim] = await Promise.all([getText(url), getText(new URL('../../assets/story/limits.json', import.meta.url)).then(JSON.parse)]);
        const p = JSON.parse(t), v = validatePack(p, base, lim);
        if (v.ok) { pack = p; text = t; id = new URL(url).pathname.replace(/^\/|\/story\.json$/g, '').replace(/^tools\/story\/test-packs\//, 'test/').replace(/\.json$/, ''); }
        else { ok = false; why = 'invalid: ' + v.errors.slice(0, 3).join('; '); }
      } catch (err) { ok = false; why = err.message; }
    }
    if (!ok) console.warn('[story] the default pack instead:', why);
  }
  return makeStory(pack, base, { id, ok, why, hash: await sha256(text), dress: dressModel });
}

export const S = await loadStory();

// a Mog: its title on the tab and the instant title, and its words on every canvas the game draws (signs, screens,
// the phone, the map's labels): fillText / strokeText take S.t of their text, squeezed to the default's width (or a
// quarter more) when the Mog's is longer. Mog City's own pack touches none of it
if (!S.isDefault && S.pack) {
  try { document.title = S.title(); } catch {}
  const tag = typeof document !== 'undefined' && document.querySelector('#wg-boot .wg-boot-tag');
  if (tag) tag.textContent = S.episode;
  for (const C of [globalThis.CanvasRenderingContext2D, globalThis.OffscreenCanvasRenderingContext2D]) {
    if (!C) continue;
    for (const fn of ['fillText', 'strokeText']) {
      const orig = C.prototype[fn];
      C.prototype[fn] = function (text, x, y, maxWidth) {
        const t = typeof text === 'string' ? S.t(text) : text;
        if (t === text) return maxWidth === undefined ? orig.call(this, text, x, y) : orig.call(this, text, x, y, maxWidth);
        const w0 = this.measureText(text).width * 1.25, w1 = this.measureText(t).width;
        const fit = maxWidth === undefined ? (w1 > w0 && w0 > 0 ? w0 : undefined) : maxWidth;
        return fit === undefined ? orig.call(this, t, x, y) : orig.call(this, t, x, y, fit);
      };
    }
  }
}
// the instant title's 'continue' state (index.html wg-t-save, guessed from the address before the pack was read) put
// right by the save this story actually uses (S.save: Mog City's own key when a pack was refused)
try {
  const H = document.documentElement;
  if (H.classList.contains('wg-t')) { const s = JSON.parse(localStorage.getItem(S.save('wagmi.save.v1')) || 'null'); H.classList.toggle('wg-t-save', !!(s && Array.isArray(s.done) && s.done.length)); }
} catch {}
// for the classic scripts (stats.js): which story this is
try { window.__mcStory = { id: S.id, hash: S.hash, isDefault: S.isDefault, ok: S.ok }; } catch {}

// in a frame (GameMog's play page), messages to the parent at its own origin only: ?host= (one of allow.js hostOf's),
// else gamemog.com; a ?host= that is not allowed, none at all; nothing when not framed
//   ready    the pack is in: { source: 'gamemog', type: 'ready', gameId, hash, story: { ok, id, hash } }
//   result   S.result(mission, secs): a mission passed (Mission 1's counts as played in a Mog-off), once a session per
//            mission, only with ?game=: { source: 'gamemog', type: 'result', game, mission, passed: true, story: hash, secs }
const framed = typeof window !== 'undefined' && window.parent && window.parent !== window;
const parentAt = q.has('host') ? hostOf(q.get('host')) : GAMEMOG;
const tell = (msg) => { if (framed && parentAt) try { window.parent.postMessage(msg, parentAt); } catch {} };
// (with ?pack= the story runner tells it instead, about its world: wagmi/storyrun/host.js)
if (!q.has('pack')) tell({ source: 'gamemog', type: 'ready', gameId: q.get('game') || null, hash: S.hash, story: { ok: S.ok, id: S.id, hash: S.hash } });
const told = new Set();
S.result = (mission, secs) => {
  const game = q.get('game');
  if (!framed || !parentAt || !game || told.has(mission)) return false;
  told.add(mission);
  tell({ source: 'gamemog', type: 'result', game, mission, passed: true, story: S.hash, secs: Math.max(0, Math.round(secs)) });
  return true;
};
if (!S.isDefault || !S.ok) console.log('[story]', S.id, S.ok ? 'in' : `default (${S.why})`, S.hash?.slice(0, 12));
