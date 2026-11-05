// Mog City story runner: a world's own title on the instant title (index.html #wg-boot), the start gate (mission/ui.js
// .wg-gtitle) and the tab. Mog City is the engine, never the world's name (the owner, 4 Nov): under ?pack= the lockup is
// the world's title alone, in the lockup's lettering (its last word in the gold, as CITY is), and the tag line under it
// the world's kicker (none: no tag). index.html keeps its MOG CITY lockup out of sight under ?pack= (html.wg-pk) until
// this has put the world's in (html.wg-pk-t), or until the world was refused and the game is Mog City as it is.
//   showTitle(def)        the instant title and the tab, as soon as the world is in (pack.js load())
//   showTitle(def, gate)  the start gate's lockup too (index.js install(), gate = the .wg-gtitle element)
//   plainTitle()          a refused world: Mog City's own lockup shown again (the game is Mog City as it is)
// Mog City's own story as a world (packs/mog-city.json from the game's own origin, the parity world) is Mog City's own
// game: it keeps MOG CITY's lockup with its episode under it, as the shipped game has it (isOwn).

// (a world from before the title rule, 'Mog City: Night Shift', shows its own part only)
export const ownTitle = (t) => String(t || '').replace(/^\s*mog\s*city\s*[:·\-–—]?\s*/i, '').trim() || 'Untitled';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// the letters a box each, --x their place from the middle spread over -5..5 (the slam's stagger, as MOG CITY's)
function letters(text) {
  const chars = [...text.toUpperCase()], n = chars.length, mid = (n - 1) / 2;
  const box = (c, i) => (c === ' ' ? ' ' : `<span style="--x:${n > 1 ? Math.round(((i - mid) / Math.max(mid, 1)) * 5) : 0}">${esc(c)}</span>`);
  const cut = chars.lastIndexOf(' ');
  if (cut <= 0) return chars.map(box).join('');
  return `${chars.slice(0, cut).map(box).join('')} <b>${chars.slice(cut + 1).map((c, j) => box(c, cut + 1 + j)).join('')}</b>`;
}

// a long title steps down and may take two lines, so it never runs off a phone's width
function size(el, text) {
  const n = [...text].length;
  el.style.fontSize = `min(clamp(40px, 10vw, 136px), ${(n <= 14 ? 170 / n : 300 / n).toFixed(2)}vw)`;
  el.style.whiteSpace = n <= 14 ? 'nowrap' : 'normal';
  if (n > 14) { el.style.maxWidth = '92vw'; el.style.margin = '0 auto'; el.style.lineHeight = '1'; }
}

function fill(logo, tag, def) {
  const title = ownTitle(def.title), kicker = String(def.kicker || '').trim();
  if (logo) { logo.innerHTML = letters(title); logo.setAttribute('data-t', title.toUpperCase()); size(logo, title); }
  if (tag) {
    if (kicker) { const k = [...kicker], mid = Math.floor((k.length - 1) / 2); tag.innerHTML = k.map((c, i) => (c === ' ' ? ' ' : `<span style="--x:${i - mid}">${esc(c)}</span>`)).join(''); tag.style.display = ''; }
    else { tag.textContent = ''; tag.style.display = 'none'; }
  }
}

export const isOwn = (world) => {
  try { return world?.def?.id === 'mog-city' && new URL(world.url).origin === location.origin && new URL(world.url).pathname === '/packs/mog-city.json'; } catch { return false; }
};

export function showTitle(def, gate = null, own = false) {
  if (typeof document === 'undefined' || !def) return;
  if (own) {
    // (Mog City's own: its lockup, the episode on the tag line and the tab, as before)
    const ep = String(def.title || '');
    try { document.title = `MOG CITY: ${ep}`; } catch {}
    try { const tag = document.querySelector('#wg-boot .wg-boot-tag'); if (tag) tag.textContent = ep; const g = gate?.querySelector('.tag'); if (g) g.textContent = ep; } catch {}
    document.documentElement.classList.add('wg-pk-t');
    return;
  }
  const title = ownTitle(def.title);
  try { document.title = title; } catch {}
  try { const boot = document.querySelector('#wg-boot .wg-boot-title'); if (boot) fill(boot.querySelector('.wg-boot-logo'), boot.querySelector('.wg-boot-tag'), def); } catch {}
  if (gate) try { fill(gate.querySelector('.logo'), gate.querySelector('.tag'), def); gate.setAttribute('aria-label', title); } catch {}
  document.documentElement.classList.add('wg-pk-t');
}

export function plainTitle() {
  if (typeof document !== 'undefined') document.documentElement.classList.add('wg-pk-t');
}
