import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_BODY } from './body';
import { compileWorld, type WorldSpec } from '../worldspec';

/**
 * Renders a complete, self-contained game document.
 *
 * Self-contained on purpose: the page is served into a sandboxed iframe with no
 * same-origin access, so it cannot reach our API, read our cookies, or touch
 * the host page. It talks to us through one postMessage carrying a result, and
 * the host decides whether to believe it. The same document is also what a
 * creator downloads — the game they share is byte-for-byte the game they played.
 */

const ENGINE_DIR = join(process.cwd(), 'public/engine');

let cached: { js: string; css: string } | null = null;
function engine() {
  // re-read every request in dev so `npm run build:engine` shows up immediately
  if (cached && process.env.NODE_ENV === 'production') return cached;
  cached = {
    js: readFileSync(join(ENGINE_DIR, 'engine.js'), 'utf8'),
    css: readFileSync(join(ENGINE_DIR, 'engine.css'), 'utf8'),
  };
  return cached;
}

/** Block a closing script tag inside JSON from ending our script element. */
const safeJson = (v: unknown) =>
  JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028|\u2029/g, '');

export const GAME_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/**
 * No card over the game until someone asks to play (the owner, 23 Sep). The
 * engine's start card is hidden, without its blur, so the world is in view;
 * the page's Play button (a message from the host) brings the card back, and
 * Enter joins Space as a start key. A tap on the world still starts the race
 * (the engine's own canvas handler). The finish card sits at the bottom
 * without the wash. The engine is generated from reference/, so this lives
 * here, not in it.
 */
const NO_CARD = `
#title,#finish{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
body:not(.gm-play) #title{background:none!important;pointer-events:none!important}
body:not(.gm-play) #title .card{display:none!important}
#finish{background:none!important;justify-content:flex-end!important;padding-bottom:18px}
body:has(#title:not(.hide)) #hint{visibility:hidden}
`;
const START_KEYS = `(function () {
  var b = document.getElementById('startbtn'), t = document.getElementById('title');
  addEventListener('message', function (e) {
    var d = e.data; if (e.source !== parent || !d || d.source !== 'gamemog-host' || d.type !== 'play') return;
    document.body.classList.add('gm-play');
  });
  addEventListener('keydown', function (e) { if (e.key === 'Enter' && b && t && !t.classList.contains('hide')) b.click(); });
})();`;

export function renderGame(spec: WorldSpec, id: string) {
  const { js, css } = engine();
  const world = compileWorld(spec, id);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title>${escapeHtml(spec.meta.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;700;800&family=Quicksand:wght@500;600;700&display=swap" rel="stylesheet">
<style>${css}</style>
<style>${NO_CARD}</style>
</head>
<body>
${GAME_BODY}
<script>window.__WORLD__ = ${safeJson(world)};</script>
<script>${js}</script>
<script>${START_KEYS}</script>
</body>
</html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
}
