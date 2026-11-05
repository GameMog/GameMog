// Mog City story runner: which ?pack= addresses the game reads, and which files a pack may name (a plain module, for
// the loader and the tests). As strict as wagmi/story/allow.js is for ?story=.
//   packUrl(raw, here, host)   the world's address, or null (refused):
//                              - gamemog.com's sealed worlds, content-addressed: /storykit/f/<64 hex>.json (the
//                                runtime checks SHA-256(body) against the name: packHash)
//                              - on a local server (mc itself on localhost): the same route on a dev host (?host= a
//                                localhost / 127.0.0.1 origin, any port), a draft's world on the dev host
//                                (/api/storykit/drafts/<uuid>/pack), and this repo's test worlds
//                                (/tools/storyrun/test-packs/<name>.json or /tools/storyrun/test-packs/<name>/world.json)
//   assetUrl(raw, packAt)      a file the world names (a GLB, a voice clip, a headshot, key art), or null: on the
//                              world's own origin, /storykit/f/<64 hex>.<ext>; a local test world's own folder; or one
//                              of Mog City's own shipped files (assets/...), which are never fetched from a pack's origin
//   packHash(url)              the 64-hex name of a content-addressed world, or null
import { hostOf } from '../story/allow.js';

export const GAMEMOG = 'https://gamemog.com';
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/;
const LOCAL = (h) => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(h);
const BLOB_JSON = /^\/storykit\/f\/([0-9a-f]{64})\.json$/;
const BLOB_FILE = /^\/storykit\/f\/[0-9a-f]{64}\.(glb|ogg|wav|jpg|webp|png)$/;
const DRAFT = /^\/api\/storykit\/drafts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/pack$/;
const TEST = /^\/tools\/storyrun\/test-packs\/([a-z0-9-]+)(\.json|\/world\.json)$/;
const OWN = /^\/packs\/[a-z0-9-]+\.json$/;

export { hostOf };
const plain = (u) => !u.username && !u.password && !u.hash && !u.search;

export function packUrl(raw, here = location, host = null) {
  let u; try { u = new URL(raw, here.href); } catch { return null; }
  if (!plain(u) || !/^https?:$/.test(u.protocol)) return null;
  if (u.origin === GAMEMOG && BLOB_JSON.test(u.pathname)) return u.href;
  // (Mog City's own story as a world, this repo's packs/: served by the game itself, on any host)
  if (u.origin === here.origin && OWN.test(u.pathname)) return u.href;
  if (!LOCAL(here.hostname)) return null;
  const dev = host && DEV_ORIGIN.test(host) && u.origin === host;
  if (dev && (BLOB_JSON.test(u.pathname) || DRAFT.test(u.pathname))) return u.href;
  if (u.origin === here.origin && TEST.test(u.pathname)) return u.href;
  return null;
}

export function packHash(url) {
  try { const m = BLOB_JSON.exec(new URL(url).pathname); return m ? m[1] : null; } catch { return null; }
}

export function assetUrl(raw, packAt, here = location) {
  if (typeof raw !== 'string' || !raw || raw.length > 300) return null;
  let base, u; try { base = new URL(packAt); u = new URL(raw, base.href); } catch { return null; }
  if (!plain(u)) return null;
  if (u.origin === base.origin && BLOB_FILE.test(u.pathname)) return u.href;
  // a local test world's own files, beside it
  const t = TEST.exec(base.pathname);
  if (t && u.origin === base.origin && LOCAL(here.hostname) && u.pathname.startsWith(`/tools/storyrun/test-packs/${t[1]}/`) && /^[\w/.-]+\.(glb|ogg|wav|jpg|webp|png)$/.test(u.pathname) && !u.pathname.includes('..')) return u.href;
  return null;
}
