// Mog City: a story pack made on an older default pack, brought up to this one before it is validated (only
// schema.js beside it, so GameMog can copy it next to its copy of schema.js). validatePack (schema.js) holds a pack to the base's
// exact key sets; when a release rewrites a scene, some line or copy ids are retired and new ones take their place,
// and a pack made before that (on the r16 base, say) would fail it on every one. assets/story/retired.json lists each
// retired id with its successor ('to', or null) and its old words; tools/story/extract.mjs checks it and carries it into
// limits.json as `retired`, which the game already fetches with a pack.
//   upgradePack(pack, base, limits) -> pack   unchanged when it holds no retired id (a current pack, or a broken one:
//                                             validatePack still says what is wrong with it). Otherwise a copy where
//                                             each retired id is dropped, its successor given the Mog's own words when
//                                             they rewrote the old line (the same speaker, within the successor's
//                                             limit; copy is never carried, its fragments do not line up), and every
//                                             id the base has and the pack lacks filled with the base's own entry.
//                                             A line kept under its id for new words (retired.reworded) that the pack
//                                             still has in its old default words gets the new ones
import { render } from './schema.js';

const own = (o, k) => o != null && typeof o === 'object' && Object.hasOwn(o, k);
const isMap = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

export function upgradePack(pack, base, limits = {}) {
  const R = isMap(limits) && isMap(limits.retired) ? limits.retired : null;
  if (!R || !isMap(pack) || !isMap(base)) return pack;
  let out = null;
  for (const sec of ['lines', 'copy']) {
    const P = pack[sec], B = base[sec], RS = R[sec];
    if (!isMap(P) || !isMap(B) || !isMap(RS)) continue;
    const old = Object.keys(RS).filter((id) => own(P, id) && !own(B, id));
    // (an id kept for new words, the pack still holding its old default words: the new ones)
    const RW = sec === 'lines' && isMap(R.reworded) && isMap(R.reworded.lines) ? R.reworded.lines : {};
    const stale = Object.keys(RW).filter((id) => own(B, id) && Array.isArray(P[id]) && Array.isArray(RW[id]) && RW[id].includes(P[id][1]));
    if (!old.length && !stale.length) continue;
    const next = { ...P };
    for (const id of stale) next[id] = [P[id][0], B[id][1]];
    for (const id of old) {
      const v = next[id], r = RS[id] || {}; delete next[id];
      const to = typeof r.to === 'string' && own(B, r.to) ? r.to : null;
      if (sec !== 'lines' || !to || own(P, to) || own(next, to)) continue;
      // (the Mog's words, when they are not the old default's and fit the successor's speaker and limit)
      const max = isMap(limits.lines) && typeof limits.lines[to] === 'number' ? limits.lines[to] : 0;
      if (Array.isArray(v) && v.length === 2 && v[0] === B[to][0] && typeof v[1] === 'string' && v[1] !== r.text && (!max || [...render(v[1], pack)].length <= max)) next[to] = [v[0], v[1]];
    }
    for (const k of Object.keys(B)) if (!own(next, k)) next[k] = Array.isArray(B[k]) ? [...B[k]] : B[k];
    (out ||= { ...pack })[sec] = next;
  }
  return out || pack;
}
