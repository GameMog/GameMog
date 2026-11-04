// Mog City: the story calls over a pack and its base (a plain module: wagmi/story/index.js makes the game's S with it,
// the tests make theirs). See index.js for what each call does.
import { CAST, SPEAKER, render, voiceKey } from './schema.js';

// a pack's words made safe for innerHTML: & < > " ' (every sink that writes them as HTML goes through it)
export const html = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const KNOBS = { enemyHp: 1, enemyDamage: 1, heroHp: 100, crewExtra: 0, chaseSpeed: 1 };

export function makeStory(pack, base, { id = 'default', ok = true, why = null, hash = null, dress = () => false } = {}) {
  const isDefault = pack === base;
  // the lines by their default words (the voice's key: the same words with any case and punctuation are one line), and
  // what each now says: null while unchanged (the literal stands)
  const lineOf = new Map(), lineNow = new Map(), defaults = new Set(), fresh = new Set();
  for (const [lid, [who, t]] of Object.entries(base.lines)) {
    const was = render(t, base), k = voiceKey(CAST[who], was);
    lineOf.set(k, lid); defaults.add(k);
    const now = pack.lines[lid] ? render(pack.lines[lid][1], pack) : was;
    lineNow.set(lid, now === was ? null : now);
    if (now !== was) fresh.add(voiceKey(CAST[who], now));
  }
  const copyOf = new Map(), copyNow = new Map();
  for (const [cid, t] of Object.entries(base.copy)) {
    const was = render(t, base); copyOf.set(was, cid);
    const now = pack.copy[cid] != null ? render(pack.copy[cid], pack) : was;
    copyNow.set(cid, now === was ? null : now);
    if (now !== was) fresh.add(voiceKey('', now));
  }
  const own = (o, k) => o != null && typeof k === 'string' && Object.hasOwn(o, k);
  const idOf = (who) => (own(pack.cast, who) ? who : own(SPEAKER, who) ? SPEAKER[who] : null);
  const S = {
    ok, why, id: isDefault ? 'default' : id, hash, isDefault, pack, html,
    episode: pack.title.episode,
    line(speaker, text) {
      if (typeof text !== 'string' || !text) return text;
      const lid = lineOf.get(voiceKey(speaker, text)); if (!lid) return text;
      return lineNow.get(lid) ?? text;
    },
    t(text) {
      if (typeof text !== 'string' || !text) return text;
      const cid = copyOf.get(text); if (!cid) return text;
      return copyNow.get(cid) ?? text;
    },
    name(who) { const id = idOf(who); return id ? pack.cast[id].name : who; },
    title: () => `MOG CITY: ${pack.title.episode}`,
    // (words the pack changed: a line's (by its speaker) or any copy a speaker is given (the trailer's); never one of Mog
    // City's lines, and never words the pack doesn't have)
    changed: (speaker, text) => !isDefault && !!text && !defaults.has(voiceKey(speaker, text)) && (fresh.has(voiceKey(speaker, text)) || fresh.has(voiceKey('', text))),
    voiceOf: (speaker) => pack.cast[idOf(speaker)]?.voice || null,
    look: (who) => pack.cast[idOf(who)]?.look || null,
    lookChanged: (who) => JSON.stringify(pack.cast[idOf(who)]?.look) !== JSON.stringify(base.cast[idOf(who)]?.look),
    dress: (who, root) => (S.lookChanged(who) ? dress(idOf(who), pack.cast[idOf(who)].look, root) : false),
    // (the car's paint when the pack changed it, else null: the car's own)
    paint: pack.car?.paint && pack.car.paint !== base.car?.paint ? pack.car.paint : null,
    body: (man) => (own(pack.cast, man) && pack.cast[man].body) || man,
    knob: (k) => (own(pack.difficulty, k) ? pack.difficulty[k] : KNOBS[k]),
    save: (k) => (isDefault ? k : `${k}:${id}`),
  };
  return S;
}
