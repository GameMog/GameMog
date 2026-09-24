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
 * No card over the game (the owner, 23 Sep). The engine's start card becomes
 * one small prompt along the bottom with the world in view behind it, and a
 * tap on the world (the engine's own canvas handler) or Space starts the race.
 * The finish card keeps its results but sits at the bottom, without the wash.
 * The engine is generated from reference/, so this lives here, not in it.
 */
const NO_CARD = `
#title,#finish{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
#title{background:none!important;justify-content:flex-end!important;padding-bottom:24px;pointer-events:none!important}
#title .card{background:none!important;border:0!important;box-shadow:none!important;padding:0!important;width:auto!important;max-width:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
#title .card>*:not(#startbtn){display:none!important}
#title #startbtn{pointer-events:auto;margin:0!important;padding:10px 20px!important;border-radius:999px!important;font:700 16px system-ui,sans-serif!important;letter-spacing:0!important;text-transform:none!important;box-shadow:none!important;border:0!important;background:rgba(10,12,16,.72)!important;color:#fff!important}
#finish{background:none!important;justify-content:flex-end!important;padding-bottom:18px}
body:has(#title:not(.hide)) #hint{visibility:hidden}
`;
const START_KEYS = `(function () {
  var b = document.getElementById('startbtn'), t = document.getElementById('title');
  if (b) b.textContent = 'Press Space or tap to race';
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
