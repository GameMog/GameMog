(function () {
// cities/pkg/js/pkg-hud.js
// (Mog City, Hometown) A compiled place's words on the markup San Francisco's sf-hud.js has just worded: the loading line,
// the map's title, search and credit line, the teleport list (the package's arrivals, PLACE_DATA.regional) and no
// scenic shots of San Francisco's landmarks. Runs after the package's geodata.js (window.NYC.PKG), before main.js.
const N = window.NYC, P = N && N.PKG;
// pkgCredit(attribution lines) -> { short, full, href }: the short line names each source the lines list (in their
// order: OpenStreetMap, Overture Maps, USGS 3DEP, and any other line as written), the full one is the lines themselves
const pkgCredit = (lines) => {
  const L = Array.isArray(lines) ? lines.map(String) : [];
  const parts = [];
  const add = (s) => { if (!parts.includes(s)) parts.push(s); };
  for (const l of L) {
    if (/OpenStreetMap/i.test(l)) add('© OpenStreetMap contributors');
    else if (/WorldCover|Copernicus/i.test(l)) add('ESA WorldCover');
    else if (/Overture/i.test(l)) add('Overture Maps');
    else if (/USGS|3D Elevation/i.test(l)) add('USGS 3DEP');
    else add(l.replace(/\s*\(.*\)\s*$/, ''));
  }
  if (!parts.length) parts.push('© OpenStreetMap contributors');
  const osm = L.some((l) => /OpenStreetMap/i.test(l)) || !L.length;
  return { short: parts.join(' · '), full: L.length ? L.join('; ') : '© OpenStreetMap contributors (ODbL 1.0)',
    href: osm ? 'https://www.openstreetmap.org/copyright' : 'https://overturemaps.org' };
};
// The words and colours a place's vehicles carry, so a town shows its own and never San Francisco's (the engine's bus
// says "1 CALIFORNIA" in Muni's silver and red, the player's car has a California plate). pkgVehicleSigns(PKG) ->
//   { town: the bus destination, the place's name in capitals ('BAL HARBOUR'); state: the plate's state name, from a
//     US place's two-letter suffix ('Bal Harbour, FL' -> 'Florida'), '' when there is none;
//     accent: the bus stripe's colour (an int), one of a few plain transit colours picked by the place's id, so towns
//     differ and a town's buses stay the same every visit }
// No operator, no brand and no route name: a route number and the place itself.
const US_STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana',
  IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan',
  MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico' };
const ACCENTS = [0x1d5fa6, 0x16805f, 0x0d7f8c, 0x8a2433, 0x5b3f8c, 0xc06a12];
const pkgVehicleSigns = (pkg) => {
  const name = String((pkg && pkg.name) || '').trim();
  const parts = name.split(',').map((s) => s.trim()).filter(Boolean);
  const town = (parts[0] || '').toUpperCase().replace(/\s+/g, ' ');
  const code = parts.length > 1 ? parts[parts.length - 1].toUpperCase() : '';
  let h = 2166136261;
  for (const ch of String((pkg && (pkg.id || pkg.name)) || '')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return { town, state: US_STATES[code] || '', accent: ACCENTS[h % ACCENTS.length] };
};
if (N) Object.assign(N, { pkgCredit, pkgVehicleSigns });
if (typeof module !== 'undefined') module.exports = { pkgCredit, pkgVehicleSigns };
if (!P) return;
const $ = (id) => document.getElementById(id);
const text = (el, s) => { if (el) el.textContent = s; };
const place = String(P.name).split(',')[0];

// (no landmark shots in v0: the camera menu's scenic entries name the place, and cameras.js finds no site for them)
N.SCENIC_CAMERAS = {};
text($('loading-status'), `Loading ${place}…`);
document.querySelector('main#canvas-container')?.setAttribute('aria-label', `MOG CITY: ${place}`);
// the credit under the title: sf-hud.js put "Built on Slop San Francisco" there, which is San Francisco's map, not this
// place's. A package is built from open data, so it credits that data, from the package's own attribution lines
// (PKG.attribution, tools/hometown/compile.py ATTRIBUTION): OpenStreetMap's ODbL asks for its credit where the map is
// shown, and it links to OpenStreetMap's copyright page.
const repo = document.querySelector('.brand .repo-link');
if (repo) {
  const c = N.pkgCredit(P.attribution);
  repo.href = c.href;
  repo.title = c.full;
  repo.setAttribute('aria-label', `${c.full} (opens in a new tab)`);
  repo.firstChild.textContent = c.short + ' ';
  repo.dataset.credit = 'pkg';
}
// ...but the title's line lives in .hud-top-left, which story mode, fights, cutscenes and the pause menu all put away, so
// the map's data is also credited on a line of its own: small, bottom centre, outside every .hud, above the pause menu,
// the full map and the loader, so no HUD toggle hides it (clean view [H] only dims it). ODbL 1.0 §4.3 asks for the
// credit wherever the map is shown; it links to OpenStreetMap's copyright page.
if (!document.getElementById('pkg-map-credit')) {
  const c = N.pkgCredit(P.attribution);
  const line = document.createElement('a');
  line.id = 'pkg-map-credit';
  line.href = 'https://www.openstreetmap.org/copyright';
  line.target = '_blank';
  line.rel = 'noopener noreferrer';
  line.title = c.full;
  line.setAttribute('aria-label', `Map data: ${c.full} (opens in a new tab)`);
  line.textContent = c.short;
  const css = document.createElement('style');
  css.textContent = `#pkg-map-credit{position:fixed;left:50%;bottom:max(3px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:110;
font:500 10px/1.25 Inter,system-ui,sans-serif;color:rgba(255,255,255,.72);text-shadow:0 1px 2px rgba(0,0,0,.9);text-decoration:none;
white-space:nowrap;max-width:calc(100vw - 32px);overflow:hidden;text-overflow:ellipsis;pointer-events:auto;opacity:1!important;visibility:visible!important;display:block!important;transition:opacity .3s}
#pkg-map-credit:hover,#pkg-map-credit:focus-visible{color:#fff;text-decoration:underline}
body.hud-minimized #pkg-map-credit{opacity:.55!important}`;
  document.head.appendChild(css);
  document.body.appendChild(line);
}
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
