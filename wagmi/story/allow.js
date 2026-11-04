// Mog City: which ?story= addresses the game reads, and which parent a frame tells it is ready (a plain module, for
// the loader, wagmi/story/index.js, and the tests).
//   allowed(raw, here, host)   the story's address, or null (the default pack): gamemog.com's story routes,
//                              /g/<slug>/story.json and /d/<draft>/story.json, with nothing but an optional ?v=<hash>.
//                              On a local server (mc itself on localhost) also the same routes on a dev host (host: a
//                              localhost or 127.0.0.1 origin, any port; GameMog's dev server, 3939, by default) and the
//                              test packs here (/tools/story/test-packs/<name>.json)
//   hostOf(raw)                ?host=: the parent's origin a frame posts 'ready' to, if it is one of gamemog.com,
//                              www.gamemog.com, http://localhost:<port>, http://127.0.0.1:<port>; else null
export const GAMEMOG = 'https://gamemog.com', DEV = 'http://localhost:3939';
const DEV_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/;
export function hostOf(raw) {
  if (!raw) return null;
  let u; try { u = new URL(raw); } catch { return null; }
  if (u.origin === GAMEMOG || u.origin === 'https://www.gamemog.com' || DEV_ORIGIN.test(u.origin)) return u.origin;
  return null;
}
export function allowed(raw, here = location, host = null) {
  let u; try { u = new URL(raw, here.href); } catch { return null; }
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(here.hostname);
  const route = /^\/(g\/[a-z0-9][a-z0-9-]{0,63}|d\/[A-Za-z0-9_-]{1,64})\/story\.json$/.test(u.pathname);
  const plain = !u.username && !u.password && !u.hash && (!u.search || /^\?v=[A-Za-z0-9_-]{1,80}$/.test(u.search));
  const dev = local && (u.origin === DEV || (host && DEV_ORIGIN.test(host) && u.origin === host));
  if (plain && route && (u.origin === GAMEMOG || dev)) return u.href;
  if (plain && local && u.origin === here.origin && /^\/tools\/story\/test-packs\/[a-z0-9-]+\.json$/.test(u.pathname)) return u.href;
  return null;
}
