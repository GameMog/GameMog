// Mog City: the library's sound packs (GameMog's asset library, kind 'sounds': Kenney's CC0 packs, copied as they are
// into assets/library/<id>, CREDITS.md). Each pack is one AAC sheet with a cue table: a sound is a stretch of the sheet
// by name, and a group's name (a name without its variant number: impactPunch_heavy for impactPunch_heavy_000 to _004)
// plays one of its variants at random. They play through the mixer like any of the game's sounds, by the name
//   'pack:<id>/<name>'   e.g. W.audio.play('pack:sounds-impact/footstep_concrete', { pos, vol: 0.8, rate: 0.6 })
// (wagmi/audio/engine.js looks a name up here when the made-on-the-spot SOUNDS do not have it). A pack is fetched and
// decoded the first time one of its sounds is asked for, so that first one is silent: preload(M, ids) beforehand.
const BASE = new URL('../../assets/library/', import.meta.url).href;
const PACKS = new Map();   // id -> { json, buffer } once decoded
const LOADING = new Map(); // id -> Promise

/** Fetch and decode a pack into M's audio context (once). */
export function loadPack(M, id) {
  if (PACKS.has(id)) return Promise.resolve(PACKS.get(id));
  if (LOADING.has(id)) return LOADING.get(id);
  const p = (async () => {
    const J = await (await fetch(BASE + id + '/asset.json')).json();
    if (J.kind !== 'sounds') throw new Error(`${id} is not a sound pack (${J.kind})`);
    const bytes = await (await fetch(BASE + id + '/' + J.file)).arrayBuffer();
    const buffer = await M.ctx.decodeAudioData(bytes);
    const P = { json: J, buffer };
    PACKS.set(id, P);
    return P;
  })();
  p.catch((e) => { console.warn('[library] sounds', id, e.message); LOADING.delete(id); });
  LOADING.set(id, p);
  return p;
}
export function preload(M, ids) { return Promise.all(ids.map((id) => loadPack(M, id).catch(() => null))); }
/** A loaded pack's names and groups, or null. */
export function packInfo(id) { const P = PACKS.get(id); return P ? { names: Object.keys(P.json.cues), groups: Object.keys(P.json.groups || {}) } : null; }

const parse = (name) => { const m = /^pack:([a-z0-9-]+)\/([\w-]+)$/.exec(name || ''); return m ? { id: m[1], cue: m[2] } : null; };

/** For the mixer: the sound function of a 'pack:<id>/<name>' name (fn(M, out, o, t) -> seconds), or null. */
export function packSound(name) {
  const n = parse(name); if (!n) return null;
  return (M, out, o, t) => {
    const P = PACKS.get(n.id);
    if (!P) { loadPack(M, n.id); return 0.05; }
    const G = P.json.groups && P.json.groups[n.cue], key = G ? G[Math.floor(Math.random() * G.length)] : n.cue, cue = P.json.cues[key];
    if (!cue) return 0.05;
    const src = M.ctx.createBufferSource(), rate = Math.max(0.25, Math.min(4, Number(o.rate) || 1));
    src.buffer = P.buffer; src.playbackRate.value = rate; src.connect(out);
    src.start(t, cue.at, cue.dur);
    return cue.dur / rate;
  };
}
