// Mog City: the credits, for the pause menu's Credits page (and anything else that lists them). NOTICE is the full
// legal text and assets/CREDITS.md the same list for people reading the repo; this is what the game shows.
//   import { CREDITS, creditsHTML } from '../credits.js';
//   CREDITS        [{ heading, lines: [{ what, who, note, licence, licenceUrl, src }] }], in the order to show them
//   creditsHTML()  CREDITS as HTML for the pause panel (its .t heading and .ln / .mu line classes); empty sections left out
// The music comes from the radio's own list (radio/stations.js: each track's by, lic, src, samples), so a track added
// there is credited here with nothing else to do.
import { STATIONS, LICENCES } from './radio/stations.js';
import { world } from './world/index.js';

// (the city this page plays (wagmi/world: world.id): its own map's credits under 'The city')
const SF = world.id === 'sf';
// (a Hometown package: the place compiled from open data, tools/hometown, on San Francisco's engine; its own name, from
// the package (world.name is the engine's 'Hometown'))
const place = () => { const n = globalThis.window?.NYC?.PKG?.name; return n ? String(n).split(',')[0] : world.name; };
const PKGLINES = () => [
  { what: 'Slop San Francisco', who: 'Kamil (@unable0_) and Mr.doob', note: 'the city engine this place is played on', licence: 'MIT', licenceUrl: 'https://opensource.org/license/mit', src: 'https://github.com/unable12/slop-sanfrancisco' },
  { what: 'Map data', who: '© OpenStreetMap contributors', note: `${place()}'s streets, their names and classes, water and parks (via Overture Maps)`, licence: 'ODbL 1.0', licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/', src: 'https://www.openstreetmap.org/copyright' },
  { what: 'Overture Maps Foundation', who: 'Overture Maps', note: 'the building footprints and heights (from OpenStreetMap, Esri Community Maps contributors (CC BY 4.0) and Microsoft\'s ML building footprints (ODbL)), the land cover and the places', licence: 'ODbL 1.0 / CC BY 4.0 / CDLA Permissive 2.0', licenceUrl: 'https://docs.overturemaps.org/attribution/', src: 'https://overturemaps.org' },
  { what: 'Elevation', who: 'USGS 3D Elevation Program', note: 'the ground: 1/3 arc-second terrain in town, 1 arc-second out to the horizon', licence: 'public domain', licenceUrl: null, src: 'https://www.usgs.gov/3d-elevation-program' },
];
const cityLines = () => world.id === 'pkg' ? PKGLINES() : SF ? [
  { what: 'Slop San Francisco', who: 'Kamil (@unable0_) and Mr.doob', note: 'the city: San Francisco\'s streets, hills, buildings, landmarks and traffic', licence: 'MIT', licenceUrl: 'https://opensource.org/license/mit', src: 'https://github.com/unable12/slop-sanfrancisco' },
  { what: 'Slop New York', who: 'Mr.doob', note: 'the city engine both of Mog City\'s cities are built on', licence: 'MIT', licenceUrl: 'https://opensource.org/license/mit', src: null },
  { what: 'Map data', who: '© OpenStreetMap contributors', note: 'San Francisco\'s piers, water, landmarks\' footprints, bridges, lanes, coast and ferry routes', licence: 'ODbL 1.0', licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/', src: 'https://www.openstreetmap.org/copyright' },
  { what: 'City data', who: 'City and County of San Francisco, DataSF', note: 'the streets, curbs, building footprints, street trees, signals, stop signs, Muni stops and neighbourhoods', licence: 'PDDL / CC0', licenceUrl: 'https://opendatacommons.org/licenses/pddl/1-0/', src: 'https://datasf.org/opendata/' },
  { what: 'Elevation', who: 'USGS 3D Elevation Program', note: 'the hills: San Francisco\'s 1 m terrain', licence: 'public domain', licenceUrl: null, src: 'https://www.usgs.gov/3d-elevation-program' },
] : [
  { what: 'Slop New York', who: 'Mr.doob', note: 'the city this game is built on; some city code is ported from its newer commits', licence: 'MIT', licenceUrl: 'https://opensource.org/license/mit', src: null },
  { what: 'Map data', who: '© OpenStreetMap contributors', note: 'Central Park, the piers, the landmarks\' footprints and the New Jersey shore', licence: 'ODbL 1.0', licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/', src: 'https://www.openstreetmap.org/copyright' },
  { what: 'City data', who: 'NYC Open Data', note: 'the borough line, the street centrelines and the parks (NYC DCP Borough Boundaries, NYC Street Centerline (CSCL), NYC Parks Properties)', licence: null, licenceUrl: null, src: 'https://opendata.cityofnewyork.us' },
];

// (a Hometown town's cars: realistic models, CC BY 4.0, adapted: assets/vehicles/fleet; the game calls each only by its kind)
const FLEET_NOTE = 'a town car: modified (badges, lettering and plate characters removed, repainted, simplified); a look-alike with no connection to any car maker';
const FLEET_LINES = () => [
  { what: '"Saba V12 \'95 - Low poly model"', who: 'Daniel Zhabotinsky', note: FLEET_NOTE, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/3ab977050c334c13b6abb5de078b4957' },
  { what: '"Hazer Turbo \'81 - Low poly model"', who: 'Daniel Zhabotinsky', note: FLEET_NOTE, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/ef6411864cd24046aad6ae75dbdb7ea7' },
  { what: '"JDM Sport \'99 - Low Poly model"', who: 'Daniel Zhabotinsky', note: FLEET_NOTE, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/6dd4ae19c454414d9eed2bc524515d78' },
  { what: '"Tiara GT \'83 - Low Poly model"', who: 'Daniel Zhabotinsky', note: FLEET_NOTE, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/8918b07a427443cd8d1b334d9ad213a5' },
  { what: '"Roadster \'00 - Low poly model"', who: 'Daniel Zhabotinsky', note: FLEET_NOTE, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/82fd2008ce304df688ec4dfcd42d41ce' },
  { what: '"Duke \'69 - Low Poly Model"', who: 'Daniel Zhabotinsky', note: FLEET_NOTE, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/46fed79f600c4fc69e060991f9e3e4f9' },
  { what: '"Kiri \'10 - Low poly model"', who: 'Daniel Zhabotinsky', note: FLEET_NOTE, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/7fd6e15785fa4aa9bfd6e31eb7c97ba6' },
  { what: '"Ace \'11 - Low Poly model"', who: 'Daniel Zhabotinsky', note: FLEET_NOTE, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/055ff8a21b8d4d279debca089e2fafcd' },
  { what: '"Compact \'07 - Low poly model"', who: 'Daniel Zhabotinsky', note: FLEET_NOTE, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/25c6874d173a4f6ca63e150bbd505686' },
  { what: '"Negotiator \'80 - Low poly model"', who: 'Daniel Zhabotinsky', note: FLEET_NOTE, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/892b2684fb37442299bfad9222cf331c' },
  { what: '"Urban \'10 - Low poly model"', who: 'Daniel Zhabotinsky', note: FLEET_NOTE, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/2866efdfa943484391ef8313768e074d' },
  { what: '"Shvan \'92 - Low poly model"', who: 'Daniel Zhabotinsky', note: FLEET_NOTE, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/09d718c9cf72401b8534d265a06a803f' },
  { what: '"Conquer \'89 Pickup - Low poly model"', who: 'Daniel Zhabotinsky', note: FLEET_NOTE, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/6c48c94be8974dc7a5932f697c0ba68f' },
  { what: '"Canyon \'75 Taxi - Low poly model"', who: 'Daniel Zhabotinsky', note: FLEET_NOTE, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/9e8f92a215784f3d8aaaaeab1bef54c4' },
  { what: '"Illinois \'90 Police cruiser - Low poly model"', who: 'Daniel Zhabotinsky', note: FLEET_NOTE, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/dc81625478a744649b210c7f248b0b6a' },
  { what: '"LCT 3000 \'95 - Low poly model"', who: 'Daniel Zhabotinsky', note: FLEET_NOTE, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/663a0953c038434a918cb85725c88ffa' },
  { what: '"Generic civil service vehicles pack"', who: 'Comrade1280', note: FLEET_NOTE, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/8ff2a13f30914932a70c7950cfa58465' },
  { what: '"Generic passenger car pack"', who: 'Comrade1280', note: FLEET_NOTE, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/20f9af9b8a404d5cb022ac6fe87f21f5' },
];

const music = () => {
  // (the car radio's one station: the owner's own songs, media/mog-music; all rights reserved, not MIT)
  const lines = [{ what: 'Mog Music', who: 'the owner\'s own songs', note: 'the car radio: all rights reserved by their owner, not covered by the MIT License', licence: 'All rights reserved', licenceUrl: null, src: null }], seen = new Set();
  for (const s of STATIONS) for (const t of s.tracks) {
    if (seen.has(t.file)) continue; seen.add(t.file);
    if (t.lic === 'original') { lines.push({ what: `"${t.title}"`, who: 'original to Mog City', note: s.name, licence: 'MIT', licenceUrl: null, src: null }); continue; }
    const samples = (t.samples || []).map((x) => `"${x.title}" by ${x.artist}`).join(', ');
    // (by is the author's own wording, '"Full Title" [by] Who': split into the title and the rest)
    const m = /^"(.+?)"\s+(?:by\s+)?(.+)$/.exec(t.by || '');
    lines.push({
      what: `"${m ? m[1] : t.title}"`, who: m ? m[2] : t.by || t.artist,
      note: [s.name, samples && `samples ${samples}`].filter(Boolean).join(' · '),
      licence: t.lic, licenceUrl: LICENCES[t.lic] || null, src: t.src || null,
    });
  }
  return lines;
};

export const CREDITS = [
  { heading: 'Music', lines: music() },
  { heading: 'Characters', lines: [
    { what: 'Dan, Gears, Jane, Fiona and Mr. Big', who: 'built from MakeHuman\'s body, clothes and hair', note: 'original characters for Mog City', licence: 'CC0 1.0', licenceUrl: LICENCES['CC0 1.0'], src: 'http://www.makehuman.org' },
    { what: 'Motion capture', who: 'CMU Graphics Lab Motion Capture Database', note: 'free for all uses (the data may not be resold); created with funding from NSF EIA-0196217', licence: null, licenceUrl: null, src: 'http://mocap.cs.cmu.edu' },
    { what: 'Motion capture', who: 'Bandai Namco Research Motion Dataset, © 2022 Bandai Namco Research Inc.', note: 'the Suits\' idle, walks, runs and gestures, the rally crowd, Dan\'s footwork; retargeted and looped; non-commercial use only (not MIT)', licence: 'CC BY-NC 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-nc/4.0/', src: 'https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset' },
  ] },
  { heading: 'Engine sounds', lines: [
    { what: 'A V8 sports car\'s exhaust (Freesound 465453)', who: 'lmartins', note: 'Dan\'s car: loops cut at five engine speeds', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://freesound.org/people/lmartins/sounds/465453/' },
  ] },
  { heading: 'Horse sounds', lines: [
    { what: 'Ranger\'s voice and the wild herds\' calls', who: 'craigsmith, TheKingOfGeeks360, Forpus_Prod, metaepitome, mrrap4food, bruno.auzet, black_trillium, o_ciz, Kubuzz, foxen10, Salsero_classic, L.Finck, poodaddy69 and stomachache, on Freesound', note: 'recordings of real horses (22 sounds, listed in NOTICE), cut into single calls, cleaned and levelled', licence: 'CC0 1.0', licenceUrl: LICENCES['CC0 1.0'], src: 'https://freesound.org' },
  ] },
  { heading: 'Crowd sounds', lines: [
    { what: '"GameSoundCon2024 Walla XY-AKG214-96k"', who: 'ShangusBurger (Shane Vincent)', note: 'the street crowd\'s walla: five takes (Freesound 763895, 763896, 763898, 763848, 763851), reverb reduced, equalised to sound outdoors, levelled and looped', licence: 'CC0 1.0', licenceUrl: LICENCES['CC0 1.0'], src: 'https://freesound.org/people/ShangusBurger/packs/42098/' },
  ] },
  { heading: 'The city', lines: cityLines() },
  { heading: 'Street combat', lines: [
    { what: 'Spiderbench combat', who: 'Shikhar', note: 'the street fight, the Suits\' rig and the freeflow clips, used with the author\'s permission (not MIT)', licence: null, licenceUrl: null, src: null },
  ] },
  { heading: 'Props', lines: [
    { what: '"Metal Trash Can"', who: 'GurJas Studios, from Poly Haven', note: '', licence: 'CC0 1.0', licenceUrl: LICENCES['CC0 1.0'], src: 'https://polyhaven.com/a/metal_trash_can' },
  ] },
  // (a model a Story Kit world's car wears adds its own line when it is built, wagmi/storyrun/vantor.js: empty, and so
  // left out, in Mog City's own game; a Hometown town: its ready-made cars, assets/vehicles/fleet/CREDITS.md)
  { heading: 'Vehicles', lines: world.id === 'pkg' ? FLEET_LINES() : [] },
  // (a world's UI theme adds its typefaces when it is applied, wagmi/storyrun/theme.js: empty in Mog City's own game)
  { heading: 'Type', lines: [] },
  { heading: 'Voices', lines: [
    { what: 'Dan, Jane, Mr. Big, Knox, Mack, Gears, Fiona, Brick, Dash, Bea and the camp', who: 'synthesised voices', note: 'invented voices; the tools and their licences are in NOTICE', licence: 'Apache-2.0', licenceUrl: 'https://www.apache.org/licenses/LICENSE-2.0', src: null },
  ] },
];
// (a Hometown town: its map's data first, where a player opening the credits sees it: OpenStreetMap's ODbL credit)
if (world.id === 'pkg') CREDITS.unshift(...CREDITS.splice(CREDITS.findIndex((c) => c.heading === 'The city'), 1).map((c) => ({ ...c, heading: `The map: ${place()}` })));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const link = (url, text) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="color:inherit">${esc(text)}</a>` : esc(text));
export function creditsHTML() {
  // (a town: its name, and its lines naming it, as they are now: a GameMog town's package lands after this module is read)
  if (world.id === 'pkg') { const c = CREDITS.find((x) => x.heading.startsWith('The map: ')); if (c) { c.heading = `The map: ${place()}`; c.lines = PKGLINES(); } }
  return CREDITS.filter((c) => c.lines.length).map((c, i) => `<div class="t${i ? ' g' : ''}">${esc(c.heading)}</div>${c.lines.map((l) =>
    `<div class="ln"><b>${esc(l.what)}</b>${esc(l.who)}${l.licence ? ` <span class="mu">· ${link(l.licenceUrl, l.licence)}</span>` : ''}`
    + `${l.note ? `<div class="mu" style="font-size:15px">${esc(l.note)}</div>` : ''}`
    + `${l.src ? `<div class="mu" style="font-size:13px;word-break:break-all">${link(l.src, l.src)}</div>` : ''}</div>`).join('')}`).join('')
    + '<div class="mu" style="margin-top:14px;font-size:14px">All names, companies and events in Mog City are fictional.</div>'
    + '<div class="mu" style="margin-top:6px;font-size:14px">Full notices: NOTICE and assets/CREDITS.md in the game\'s source.</div>';
}
