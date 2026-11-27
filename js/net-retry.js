// Mog City: a file the game asks for again when the server was only busy (window.mcNet). Shared by both engines
// (js/ for New York, cities/sf/js/ for San Francisco and the towns) and the game's modules (wagmi/net.js); loaded from
// index.html's head before either, as a plain script, as js/gfx-auto.js is.
//
// Why: for a few minutes after each release GitHub Pages (mc.gamemog.com) answers some of a page load's burst of
// requests with HTTP 503 while its cache fills; one by one they all succeed. A city's data, a module or a voice clip
// lost that way was lost for the whole visit (a city that never came up, combat missing, a silent line).
//
//   mcNet.fetchRetry(url, init?, cfg?) -> Promise<Response>  fetch, tried again on a network error or a busy answer
//                                       (408 425 429 500 502 503 504) after 0.4, 1, 2 and 4 s (5 tries in all), a small
//                                       Retry-After honoured; never on 403, 404 or any other answer, which is returned
//                                       as it came. The caller's abort signal is kept (an abort ends the waiting too).
//                                       The last busy answer is returned as it came, so the caller's !res.ok still reads it.
//                                       cfg.network === false: a network error thrown at once, not asked again (a fetch
//                                       made with redirect: 'error', or one a CORS refusal ends: the same TypeError)
//   mcNet.retry(fn, cfg?) -> Promise    any loading step, fn() again while cfg.shouldRetry(err) (default: a network
//                                       error or an error carrying a busy status: three.js's HttpError, err.status)
//   mcNet.importRetry(() => import(u), label?) -> Promise<module>
//                                       a dynamic import again when its fetch failed (never when the module ran and
//                                       threw), the tries counted per file of its tree (index.html's head). The same address every time: the browser keeps no failed fetch in its
//                                       module map (Chrome 157, headless, checked: a 503'd module and a module whose
//                                       static child was 503'd are both fetched again, and the parent's record and
//                                       every module that loaded are not), so a module is never loaded twice.
//   mcNet.imageRetry(url, crossOrigin?) -> Promise<HTMLImageElement>   an image (a three.js TextureLoader's), again
//                                       unless the server says it is not there (a HEAD of it: 403, 404, 410)
//   mcNet.textureRetry(texture, url, onLoad?, onError?)  a TextureLoader texture that failed: its image again, put in
//                                       the same texture (needsUpdate), then onLoad(texture), or onError(err)
//
// A file got on a second (or later) try is logged once, console.info('[net] recovered ...'): not a warning, nothing
// went wrong that the player sees. A file that is still busy after the last try fails as it did before.
(() => {
  const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
  const GONE = new Set([403, 404, 410]);
  const DELAYS = [400, 1000, 2000, 4000];
  const RETRY_AFTER_MAX = 8000;
  const retryable = (status) => RETRY_STATUS.has(status);

  const abortError = (signal) => (signal && signal.reason) || (typeof DOMException === 'function' ? new DOMException('The operation was aborted.', 'AbortError') : Object.assign(new Error('aborted'), { name: 'AbortError' }));
  // (a wait the caller's signal ends early)
  const sleep = (ms, signal) => new Promise((res, rej) => {
    if (signal && signal.aborted) { rej(abortError(signal)); return; }
    const t = setTimeout(() => { if (signal) signal.removeEventListener('abort', off); res(); }, ms);
    const off = () => { clearTimeout(t); rej(abortError(signal)); };
    if (signal) signal.addEventListener('abort', off, { once: true });
  });
  // (each wait 0.8-1.2 x its step, so the tabs a release hit at once don't all come back at the same moment)
  const delayOf = (i, cfg) => { const d = (cfg.delays || DELAYS)[i]; return Math.round(d * (0.8 + 0.4 * (cfg.random || Math.random)())); };
  // Retry-After in seconds or as a date, in ms; null when absent, unreadable or too long to wait for
  const retryAfterMs = (res, now = Date.now()) => {
    const v = res && res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null;
    if (v == null || v === '') return null;
    let ms = /^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) * 1000 : Date.parse(v) - now;
    if (!Number.isFinite(ms)) return null;
    ms = Math.max(0, ms);
    return ms <= RETRY_AFTER_MAX ? ms : null;
  };
  const isAbort = (e) => !!e && (e.name === 'AbortError' || e.name === 'TimeoutError');
  const nameOf = (u) => { try { return String(u && u.url ? u.url : u); } catch (e) { return '?'; } };
  const recovered = (what, label, tries, why) => {
    try { console.info('[net] recovered', what, label, 'on try', tries + (why ? ` (was ${why})` : '')); } catch (e) { /* never in the way */ }
  };

  async function fetchRetry(url, init, cfg = {}) {
    const F = cfg.fetch || ((u, i) => fetch(u, i));
    const signal = init && init.signal;
    const tries = 1 + (cfg.delays || DELAYS).length;
    let why = '';
    for (let i = 0; ; i++) {
      if (signal && signal.aborted) throw abortError(signal);
      // (the second and later tries past the HTTP cache: a busy answer the cache kept is not handed back again)
      const opts = i && !(init && init.cache) ? { ...(init || {}), cache: 'reload' } : init;
      let res, err;
      try { res = await F(url, opts); } catch (e) { if (isAbort(e) || (signal && signal.aborted) || cfg.network === false) throw e; err = e; }
      if (res && !retryable(res.status)) {
        if (i) recovered('file', nameOf(url), i + 1, why);
        return res;
      }
      if (i + 1 >= tries) { if (err) throw err; return res; }
      why = res ? String(res.status) : 'network error';
      const wait = Math.max(delayOf(i, cfg), (res && retryAfterMs(res)) || 0);
      // (the busy answer's body let go, so the connection is free for the next try)
      try { if (res && res.body && typeof res.body.cancel === 'function') res.body.cancel().catch(() => {}); } catch (e) { /* (fine) */ }
      await (cfg.sleep || sleep)(wait, signal);
    }
  }

  // the busy status an error carries: three.js's FileLoader HttpError (err.response), err.status, or its message
  const statusOf = (e) => {
    if (!e) return 0;
    if (e.response && typeof e.response.status === 'number') return e.response.status;
    if (typeof e.status === 'number') return e.status;
    const m = /(?:responded with|HTTP|status(?: of)?)\s*:?\s*(\d{3})\b/i.exec(String(e.message || ''));
    return m ? +m[1] : 0;
  };
  // a network error: fetch's TypeError ('Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed')
  const isNetworkError = (e) => !!e && e.name === 'TypeError' && /fetch|network|load failed/i.test(String(e.message || ''));
  const loadFailed = (e) => !isAbort(e) && (isNetworkError(e) || retryable(statusOf(e)));
  // a dynamic import whose fetch failed (its own file or one it imports), in Chrome, Firefox and Safari's words; not a
  // module that was fetched and threw (a SyntaxError, its own TypeError at run time): that one would only throw again
  const importFailed = (e) => !!e && e.name === 'TypeError' && /dynamically imported module|importing a module script failed|error loading dynamically imported module|failed to fetch/i.test(String(e.message || ''));

  async function retry(fn, cfg = {}) {
    const should = cfg.shouldRetry || loadFailed;
    const tries = 1 + (cfg.delays || DELAYS).length;
    let why = '';
    for (let i = 0; ; i++) {
      try {
        const v = await fn(i);
        if (i) recovered(cfg.what || 'file', cfg.label || '', i + 1, why);
        return v;
      } catch (e) {
        if (i + 1 >= tries || !should(e)) throw e;
        why = statusOf(e) ? String(statusOf(e)) : 'load error';
        await (cfg.sleep || sleep)(delayOf(i, cfg), cfg.signal);
      }
    }
  }

  // (the module's address, for the log, from the thunk itself: () => import('./combat/index.js'))
  const specOf = (load) => { const m = /import\(\s*(['"`])([^'"`]+)\1/.exec(String(load)); return m ? m[2] : 'module'; };
  // (the head's (index.html mcScriptRetry.importRetry): its tries counted per file of the import's tree, from the
  // page's resource timing. Without it (a lab page, a test): up to 10 tries, waits up to 4 s, stopped when a HEAD of the
  // module the error names says it is not there)
  const BLIND = [400, 1000, 2000, 4000, 4000, 4000, 4000, 4000, 4000];
  const urlIn = (e) => (/(https?:\/\/[^\s'"]+)/.exec(String((e && e.message) || '')) || [])[1];
  const importRetry = (load, label, cfg = {}) => {
    const H = globalThis.mcScriptRetry;
    if (H && H.importRetry && !cfg.sleep) return H.importRetry(load, label || specOf(load));
    let stop = false;
    return retry(async (i) => {
      try { return await load(i); } catch (e) { if (importFailed(e) && urlIn(e) && !(await worthAgain(urlIn(e), cfg))) stop = true; throw e; }
    }, { what: 'module', label: label || specOf(load), delays: BLIND, ...cfg, shouldRetry: (e) => !stop && importFailed(e) });
  };

  // is it worth asking again? A HEAD of it: not when the server says it is not there; yes on a busy answer or no answer
  const worthAgain = async (url, cfg = {}) => {
    try { const r = await (cfg.fetch || ((u, i) => fetch(u, i)))(url, { method: 'HEAD', cache: 'no-store' }); return !GONE.has(r.status); } catch (e) { return true; }
  };
  const loadImage = (url, crossOrigin) => new Promise((res, rej) => {
    const im = new Image();
    if (crossOrigin !== null) im.crossOrigin = crossOrigin || 'anonymous';
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = () => rej(Object.assign(new Error('image ' + url), { url }));
    im.src = url;
  });
  async function imageRetry(url, crossOrigin, cfg = {}) {
    const tries = (cfg.delays || DELAYS).length;
    let last;
    for (let i = 0; i < tries; i++) {
      await (cfg.sleep || sleep)(delayOf(i, cfg));
      if (!(await worthAgain(url, cfg))) break;
      try { const im = await (cfg.load || loadImage)(url, crossOrigin); recovered('image', url, i + 2, 'load error'); return im; } catch (e) { last = e; }
    }
    throw last || Object.assign(new Error('image ' + url), { url });
  }
  // a three.js TextureLoader's texture whose image did not load: the image again, into the same texture
  function textureRetry(texture, url, onLoad, onError) {
    imageRetry(url, 'anonymous').then((im) => {
      texture.image = im; texture.needsUpdate = true;
      if (onLoad) onLoad(texture);
    }, (e) => { if (onError) onError(e); else console.warn('[net] image', url, e && e.message); });
    return texture;
  }

  window.mcNet = { fetchRetry, retry, importRetry, imageRetry, textureRetry, retryable, retryAfterMs, statusOf, loadFailed, importFailed, sleep, RETRY_STATUS, DELAYS };
})();
