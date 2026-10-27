// Mog City: the credits, for the pause menu's Credits page (and anything else that lists them). NOTICE is the full
// legal text and assets/CREDITS.md the same list for people reading the repo; this is what the game shows.
//   import { CREDITS, creditsHTML } from '../credits.js';
//   CREDITS        [{ heading, lines: [{ what, who, note, licence, licenceUrl, src }] }], in the order to show them
//   creditsHTML()  CREDITS as HTML for the pause panel (its .t heading and .ln / .mu line classes); empty sections left out
// The music comes from the radio's own list (radio/stations.js: each track's by, lic, src, samples), so a track added
// there is credited here with nothing else to do.
import { STATIONS, LICENCES } from './radio/stations.js';

const music = () => {
  const lines = [], seen = new Set();
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
    { what: '"Maserati GranTurismo S Exhaust"', who: 'lmartins', note: 'Dan\'s car: loops cut at five engine speeds', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://commons.wikimedia.org/wiki/File:Maserati_GranTurismo_S_Exhaust.ogg' },
  ] },
  { heading: 'Crowd sounds', lines: [
    { what: '"GameSoundCon2024 Walla XY-AKG214-96k"', who: 'ShangusBurger (Shane Vincent)', note: 'the street crowd\'s walla: five takes (Freesound 763895, 763896, 763898, 763848, 763851), reverb reduced, equalised to sound outdoors, levelled and looped', licence: 'CC0 1.0', licenceUrl: LICENCES['CC0 1.0'], src: 'https://freesound.org/people/ShangusBurger/packs/42098/' },
  ] },
  { heading: 'The city', lines: [
    { what: 'Slop New York', who: 'Mr.doob', note: 'the city this game is built on; some city code is ported from its newer commits', licence: 'MIT', licenceUrl: 'https://opensource.org/license/mit', src: null },
    { what: 'Map data', who: '© OpenStreetMap contributors', note: 'Central Park, the piers, the landmarks\' footprints and the New Jersey shore', licence: 'ODbL 1.0', licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/', src: 'https://www.openstreetmap.org/copyright' },
    { what: 'City data', who: 'NYC Open Data', note: 'the borough line, the street centrelines and the parks (NYC DCP Borough Boundaries, NYC Street Centerline (CSCL), NYC Parks Properties)', licence: null, licenceUrl: null, src: 'https://opendata.cityofnewyork.us' },
  ] },
  { heading: 'Street combat', lines: [
    { what: 'Spiderbench combat', who: 'Shikhar', note: 'the street fight, the Suits\' rig and the freeflow clips, used with the author\'s permission (not MIT)', licence: null, licenceUrl: null, src: null },
  ] },
  { heading: 'Props', lines: [
    { what: '"Metal Trash Can"', who: 'GurJas Studios, from Poly Haven', note: '', licence: 'CC0 1.0', licenceUrl: LICENCES['CC0 1.0'], src: 'https://polyhaven.com/a/metal_trash_can' },
  ] },
  { heading: 'Voices', lines: [
    { what: 'Dan, Jane, Mr. Big, Knox, Mack, Gears, Fiona, Brick and Dash', who: 'synthesised voices', note: 'invented voices; the tools and their licences are in NOTICE', licence: 'Apache-2.0', licenceUrl: 'https://www.apache.org/licenses/LICENSE-2.0', src: null },
  ] },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const link = (url, text) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" style="color:inherit">${esc(text)}</a>` : esc(text));
export function creditsHTML() {
  return CREDITS.filter((c) => c.lines.length).map((c, i) => `<div class="t${i ? ' g' : ''}">${esc(c.heading)}</div>${c.lines.map((l) =>
    `<div class="ln"><b>${esc(l.what)}</b>${esc(l.who)}${l.licence ? ` <span class="mu">· ${link(l.licenceUrl, l.licence)}</span>` : ''}`
    + `${l.note ? `<div class="mu" style="font-size:15px">${esc(l.note)}</div>` : ''}`
    + `${l.src ? `<div class="mu" style="font-size:13px;word-break:break-all">${link(l.src, l.src)}</div>` : ''}</div>`).join('')}`).join('')
    + '<div class="mu" style="margin-top:14px;font-size:14px">All names, companies and events in Mog City are fictional.</div>'
    + '<div class="mu" style="margin-top:6px;font-size:14px">Full notices: NOTICE and assets/CREDITS.md in the game\'s source.</div>';
}
