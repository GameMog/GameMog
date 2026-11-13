(function () {
// cities/pkg/js/pkg-hud.js
// (Mog City, Hometown) A compiled place's words on the markup San Francisco's sf-hud.js has just worded: the loading line,
// the map's title, search and credit line, the teleport list (the package's arrivals, PLACE_DATA.regional) and no
// scenic shots of San Francisco's landmarks. Runs after the package's geodata.js (window.NYC.PKG), before main.js.
const N = window.NYC, P = N.PKG;
if (!P) return;
const $ = (id) => document.getElementById(id);
const text = (el, s) => { if (el) el.textContent = s; };
const place = String(P.name).split(',')[0];

// (no landmark shots in v0: the camera menu's scenic entries name the place, and cameras.js finds no site for them)
N.SCENIC_CAMERAS = {};
text($('loading-status'), `Loading ${place}…`);
document.querySelector('main#canvas-container')?.setAttribute('aria-label', `MOG CITY: ${place}`);
$('btn-open-map')?.setAttribute('title', `Full ${place} street map [M]`);
const radar = $('minimap-card');
if (radar) { radar.setAttribute('aria-label', `Live ${place} street radar`); radar.title = `Open the full ${place} street map [M]`; }
const map = $('fullmap-modal');
if (map) {
  map.setAttribute('aria-label', `Full ${place} interactive street map`);
  text(map.querySelector('.fullmap-title h2'), `${place} Street Map`);
  text($('fullmap-player-info'), `You are in ${place}`);
  const search = $('fullmap-search');
  if (search) search.placeholder = 'Search streets & places…';
  // the credit line (sf-hud.js put San Francisco's in): OpenStreetMap's ODbL asks for it where the map is shown
  const credit = map.querySelector('.mc-map-credit');
  if (credit) {
    const last = credit.lastChild;
    if (last && last.nodeType === 3) last.textContent = ' · Overture Maps · USGS';
  }
}
const pop = $('teleport-popover');
if (pop) {
  for (const b of pop.querySelectorAll('.tp-btn')) b.remove();
  for (const [key, s] of Object.entries(N.PLACE_DATA?.regional || {})) {
    const b = document.createElement('button');
    b.className = 'pop-item tp-btn'; b.type = 'button'; b.dataset.teleport = key;
    const n = document.createElement('span'); n.className = 'pop-name'; n.textContent = s.name;
    const sub = document.createElement('span'); sub.className = 'pop-sub'; sub.textContent = place;
    b.append(n, sub);
    pop.appendChild(b);
  }
}
})();
