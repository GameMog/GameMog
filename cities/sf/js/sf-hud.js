(function () {
// cities/sf/js/sf-hud.js
// (Mog City) San Francisco's words on the markup index.html shares with New York, put in before the city's own
// scripts bind it (main.js): the loading line, the credit to the map the city is built on, the full map's title,
// search and credit line, the teleport list (the city's arrivals, city-config.js TELEPORT_LOCATIONS) and the scenic
// cameras (js/cameras.js reads window.NYC.SCENIC_CAMERAS for their names and shots). Real streets and places; no
// company's name on anything (a building known by one gets a plain description instead).
const N = (window.NYC = window.NYC || {});
const $ = (id) => document.getElementById(id);
const text = (el, s) => { if (el) el.textContent = s; };

// The scenic cameras by the ids the camera menu and the number keys use (js/cameras.js CAMERA_PRESETS), each a shot of
// a landmark (GEO.landmarks by its OSM name, read when the shot is taken): the lens `from` [dx, dz] m off the site, `up`
// m over the ground there, looking at `look` m over the site's base (Slop San Francisco's own shots, js/cameras.js)
N.SCENIC_CAMERAS = {
  centralPark: { name: 'Coit Tower & Telegraph Hill', short: 'Coit Tower', site: 'Coit Tower', from: [-100, 220], up: 130, look: 25 },
  fifthAve: { name: 'The Pyramid on Montgomery St', short: 'The Pyramid', site: 'Transamerica Pyramid', from: [-160, 230], up: 90, look: 85 },
  timesSquare: { name: 'Ferry Building & the Bay', short: 'Ferry Building', site: 'San Francisco Ferry Building', from: [-180, 20], up: 55, look: 25 },
  chryslerGCT: { name: 'City Hall & Civic Center', short: 'City Hall', site: 'San Francisco City Hall', from: [0, 240], up: 70, look: 35 },
  observatory: { name: 'Financial District Skyline', short: 'SF Skyline', site: 'Transamerica Pyramid', from: [-450, 400], up: 360, look: 80 },
  bryantPark: { name: 'Lombard Street', short: 'Lombard St', site: 'Lombard Street', from: [0, 160], up: 100, look: 5 },
  waterfront: { name: 'China Basin Ballpark & the Waterfront', short: 'Ballpark', site: 'Oracle Park', from: [170, 190], up: 100, look: 20 }
};

text($('loading-status'), 'Loading San Francisco…');
document.querySelector('main#canvas-container')?.setAttribute('aria-label', 'MOG CITY: San Francisco');

// the credit under the title (the sandbox's: wagmi's story mode puts it away)
const repo = document.querySelector('.brand .repo-link');
if (repo) {
  repo.href = 'https://github.com/unable12/slop-sanfrancisco/';
  repo.setAttribute('aria-label', 'Built on Slop San Francisco, on GitHub (opens in a new tab)');
  repo.firstChild.textContent = 'Built on Slop San Francisco ';
}

// the toolbar's map button, the radar
$('btn-open-map')?.setAttribute('title', 'Full San Francisco street map [M]');
const radar = $('minimap-card');
if (radar) { radar.setAttribute('aria-label', 'Live San Francisco street radar'); radar.title = 'Open the full San Francisco street map [M]'; }

// the full map
const map = $('fullmap-modal');
if (map) {
  map.setAttribute('aria-label', 'Full San Francisco interactive street map');
  text(map.querySelector('.fullmap-title h2'), 'San Francisco Street Map');
  text($('fullmap-player-info'), 'You are at the Embarcadero');
  const search = $('fullmap-search');
  if (search) search.placeholder = 'Search streets & landmarks — Market St, Lombard St, Coit Tower…';
  map.querySelector('.map-compass')?.setAttribute('title', 'True north');
  const all = $('map-view-all');
  if (all) { all.title = 'The whole map'; all.setAttribute('aria-label', 'Fit the whole map'); }
  text($('fullmap-hover-info'), 'Click to set your GPS route · Drag to pan · Scroll to zoom');
  // (the map's data, credited on the map itself, at any width (the legend is put away under 1360 px): OpenStreetMap's
  // ODbL asks for it where the map is shown; NOTICE.md. Bottom left, over the map's scale, clear of the hint line)
  const credit = document.createElement('div');
  credit.className = 'mc-map-credit';
  Object.assign(credit.style, { position: 'absolute', left: '24px', bottom: '38px', zIndex: '2', font: '500 11px/1.3 Inter, system-ui, sans-serif',
    color: 'rgba(255,255,255,0.62)', textShadow: '0 1px 2px rgba(0,0,0,0.8)', whiteSpace: 'nowrap', pointerEvents: 'auto' });
  credit.append('Map data © ');
  const osm = document.createElement('a');
  osm.href = 'https://www.openstreetmap.org/copyright';
  osm.target = '_blank';
  osm.rel = 'noopener noreferrer';
  osm.textContent = 'OpenStreetMap contributors';
  osm.style.color = 'inherit';
  credit.append(osm, ' · DataSF · USGS');
  map.appendChild(credit);
}

// the teleport list: the city's own arrivals (the sandbox's; story mode puts it away)
const pop = $('teleport-popover');
if (pop) {
  const ARRIVALS = [
    ['ferry', 'Ferry Building', 'The Embarcadero'],
    ['market', 'Market & Montgomery', 'Market St · Financial District'],
    ['transamerica', 'The Pyramid', 'Montgomery St · Financial District'],
    ['chinatown', 'Dragon Gate', 'Grant Ave · Chinatown'],
    ['unionsquare', 'Union Square', 'Stockton St · Union Square'],
    ['powell', 'California & Powell', 'California St · Nob Hill'],
    ['nobhill', 'Nob Hill', 'Grace Cathedral · Nob Hill'],
    ['coit', 'Coit Tower', 'Telegraph Hill'],
    ['lombard', 'Lombard Street', 'Lombard & Hyde · Russian Hill'],
    ['wharf', "Fisherman's Wharf", 'Jefferson St · North Beach'],
    ['civiccenter', 'Civic Center', 'City Hall · Civic Center'],
    ['oraclepark', 'China Basin', 'King St · the ballpark']
  ];
  for (const b of pop.querySelectorAll('.tp-btn')) b.remove();
  for (const [key, name, sub] of ARRIVALS) {
    const b = document.createElement('button');
    b.className = 'pop-item tp-btn'; b.type = 'button'; b.dataset.teleport = key;
    const n = document.createElement('span'); n.className = 'pop-name'; n.textContent = name;
    const s = document.createElement('span'); s.className = 'pop-sub'; s.textContent = sub;
    b.append(n, s);
    pop.appendChild(b);
  }
}

// the camera menu's scenic shots
for (const [id, cam] of Object.entries(N.SCENIC_CAMERAS)) text(document.querySelector(`#cam-${id} .pop-name`), cam.name);

// No WebGPU here (main.js asks for an adapter first): the city can't run (its terrain, fog and crowd are WebGPU's), so a
// card in Mog City's own type and gold (wagmi/mission/ui.js) says so and offers New York, which runs on WebGL 2 too
N.showNeedsWebGPU = function showNeedsWebGPU() {
  if (document.getElementById('mc-needs-gpu')) return;
  const css = document.createElement('style');
  css.textContent = `
#mc-needs-gpu { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 16px; color: #fff; font-family: 'Barlow Condensed', system-ui, sans-serif;
  background: radial-gradient(70% 55% at 50% 30%, rgba(255,170,60,.16), rgba(255,170,60,0) 70%), linear-gradient(#262a33, #0d0e12 62%, #060709); }
#mc-needs-gpu .card { max-width: 560px; text-align: center; }
#mc-needs-gpu h2 { margin: 0; font: italic 800 clamp(40px, 8vw, 84px)/.92 'Barlow Condensed', system-ui, sans-serif; letter-spacing: 1px; text-transform: uppercase; text-shadow: 0 6px 30px rgba(0,0,0,.55); }
#mc-needs-gpu h2 b { color: #FFC93C; font-weight: 800; }
#mc-needs-gpu .rule { width: 120px; height: 3px; background: #FFC93C; margin: 14px auto 18px; }
#mc-needs-gpu p { margin: 0 0 10px; font: 600 clamp(17px, 2.2vw, 21px)/1.35 'Barlow Condensed', system-ui, sans-serif; letter-spacing: .5px; color: rgba(255,255,255,.86); }
#mc-needs-gpu .go { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 22px; }
#mc-needs-gpu a, #mc-needs-gpu button { font: 700 18px/1 'Barlow Condensed', system-ui, sans-serif; letter-spacing: 3px; text-transform: uppercase; padding: 13px 22px; border-radius: 4px;
  cursor: pointer; text-decoration: none; border: 1px solid rgba(255,255,255,.35); color: #fff; background: rgba(8,10,14,.62); }
#mc-needs-gpu a.main { background: #FFC93C; border-color: #FFC93C; color: #111; }
#mc-needs-gpu a:focus-visible, #mc-needs-gpu button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }`;
  document.head.appendChild(css);
  const ny = new URL(location.href);
  ny.searchParams.delete('city');
  ny.searchParams.delete('webgpu');
  const el = document.createElement('div');
  el.id = 'mc-needs-gpu';
  el.setAttribute('role', 'alert');
  el.innerHTML = `<div class="card"><h2>San <b>Francisco</b></h2><div class="rule"></div>
    <p>This city runs on WebGPU, and this browser doesn't have it (or has it switched off).</p>
    <p>Open it in a recent Chrome or Edge on a computer, or play New York, which runs right here.</p>
    <div class="go"><a class="main" href="">Play New York</a><button type="button">Try again</button></div></div>`;
  el.querySelector('a.main').href = ny.pathname + ny.search + ny.hash;
  el.querySelector('button').addEventListener('click', () => location.reload());
  document.body.appendChild(el);
  for (const hud of document.querySelectorAll('.hud')) hud.inert = true;
};
})();
