// Mog City: the game's modules' way to js/net-retry.js (window.mcNet, loaded from index.html's head): a file asked for
// again when the server was only busy (GitHub Pages' 503s for a few minutes after a release). Where the page has no
// mcNet (a lab page, a test) each is the plain call it stands for.
//   fetchRetry(url, init?, cfg?)           fetch, again on a network error or 408/425/429/500/502/503/504 ({ network: false }:
//                                          a network error not asked again)
//   importRetry(() => import('./x.js'))    a dynamic import again when its fetch failed (the same address: no second copy)
//   loadRetry(() => loader.loadAsync(u), label?)   any loader's promise again on a busy answer (three.js's HttpError)
//   textureLoad(loader, url, onLoad?, onError?)    a TextureLoader's load, its image again if it failed
const N = () => globalThis.mcNet;
export const fetchRetry = (url, init, cfg) => (N() ? N().fetchRetry(url, init, cfg) : fetch(url, init));
export const importRetry = (load, label) => (N() || globalThis.mcScriptRetry ? (N() || globalThis.mcScriptRetry).importRetry(load, label) : load());
export const loadRetry = (load, label) => (N() ? N().retry(load, { label }) : load());
export function textureLoad(loader, url, onLoad, onError) {
  const t = loader.load(url, onLoad, undefined, (e) => { if (N()) N().textureRetry(t, url, onLoad, onError); else if (onError) onError(e); });
  return t;
}
