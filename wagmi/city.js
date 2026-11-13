// Mog City: the city this page plays, and free roam in a city with no story told there yet.
//   CITY            'sf' in San Francisco (cities/sf, Slop San Francisco by Kamil (@unable0_) and Mr.doob, MIT), else
//                   'ny' (New York, as ever): the world contract's city (wagmi/world: world.id), which index.html
//                   picks its scripts by; one city a page.
//   install(W)      (game.js, off New York and without ?pack=, or with ?start=chase in any city: chase-start.js, the
//                   opening a chase; in place of New York's opening and missions, which are
//                   set on Manhattan's streets) free roam: Dan on foot by his car where the city puts them (San
//                   Francisco: the Embarcadero by the Ferry Building, cities/sf/js/main.js), with Mog City's own HUD
//                   (mission/ui.js in story mode: the radar, the speed panel, the map and the pause menu), the GPS for
//                   the player's own waypoint (a click on the full map), and Dan's face. The fight, the car, the street,
//                   the crashes, the chases, the radio and the pad are installed by game.js as in New York; ?fight
//                   puts a crew in front of him here too (combat/index.js).
// A story told in another city comes through ?pack= (wagmi/storyrun), with ?city= naming its city.
import { createUI } from './mission/ui.js';
import { createAudio } from './mission/audio.js';
import { createGPS } from './mission/gps.js';
import { createFace } from './face.js';
import { outBesideCar } from './intro.js';
import { world } from './world/index.js';
import { CHASE_START, chaseStart } from './chase-start.js';

const Q = new URLSearchParams(location.search);
export const CITY = world.id;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function install(W) {
  if (CITY === 'ny' && !CHASE_START) return;
  const app = W.app;
  if (W.dan && !W.dan.face) W.dan.face = createFace(W, { speaker: 'Dan', inner: W.dan.body, bones: W.dan.bones, hair: true, open: 0.42 });
  const ui = (W.ui = createUI()), sfx = (W.sfx = createAudio());
  // (the mission sounds' context woken by the first key or click, as New York's straight-in starts do: mission/m2.js boot)
  const unlock = () => { sfx.unlock(); removeEventListener('keydown', unlock, true); removeEventListener('pointerdown', unlock, true); };
  addEventListener('keydown', unlock, true); addEventListener('pointerdown', unlock, true);
  // (the sandbox's mode keys 1-4 are the developers', ?sandbox: F gets in and out of the car)
  addEventListener('keydown', (e) => { if (/^Digit[1-4]$/.test(e.code) && !Q.has('sandbox') && !document.body.classList.contains('wg-offering')) e.stopImmediatePropagation(); }, true);
  // story mode: the sandbox's toolbar, telemetry and route put away; a click on the full map sets a waypoint (the GPS)
  ui.story(true); ui.bootOff();
  app.mapSystem.waypoint = null; app.mapSystem.onTeleport = null;
  W.gps = W.gps || createGPS(W);
  for (let i = 0; i < 1800 && !app.ready; i++) await sleep(100);
  // (the city starts the player in the car: out beside it, on foot; ?start=chase: at the wheel on a through-road, the
  // police on him, chase-start.js)
  if (CHASE_START) chaseStart(W).catch((e) => console.warn('[city] chase', e));
  else if (app.controllerManager.activeMode !== 'person') outBesideCar(W);
  // every frame, as the missions do: the GPS route followed, the HUD told whether he is on foot
  (function frame() {
    requestAnimationFrame(frame);
    if (W.paused) return;
    try { W.gps.update(); } catch (e) { console.warn('[city] gps', e); }
    document.body.classList.toggle('wg-onfoot', app.controllerManager.activeMode !== 'car');
  })();
  // (?beasts: a playtest of SF 2040's creatures before its missions exist: a wild herd on the green by the Ferry
  // Building, knights and a centaur up the Embarcadero, and The Matriarch asleep in her lair further on)
  if (CITY === 'sf' && Q.has('beasts')) {
    for (let i = 0; i < 600 && !W.creatures; i++) await sleep(100);
    const P = W.person.position, fx = 0.59, fz = 0.81, at = (d, s) => ({ x: P.x + fx * d - fz * s, z: P.z + fz * d + fx * s });
    try {
      W.creatures.herd('creature-horse', { at: at(30, 12), count: 5, radius: 9 });
      W.creatures.fight({ foes: [{ id: 'creature-knight', count: 2 }, { id: 'creature-centaur', count: 1 }], at: at(45, -2), aggro: true });
      W.creatures.spawn('creature-trex', { at: at(130, 0), boss: { name: 'The Matriarch', phases: [0.66, 0.33] }, hold: { wake: 35, leash: 60 } });
    } catch (e) { console.warn('[city] beasts', e); }
  }
  // (?apocalypse[=dusk|day|night]: SF 2040's San Francisco after Erebus, wagmi/apocalypse; loaded only when asked for)
  if (CITY === 'sf' && Q.has('apocalypse')) {
    try { const A = await import('./apocalypse/index.js'); await A.createApocalypse(W, { time: Q.get('apocalypse') || 'dusk' }); } catch (e) { console.warn('[city] apocalypse', e); }
  }
  console.log(`[wagmi] free roam in ${CITY === 'sf' ? 'San Francisco' : CITY === 'pkg' ? world.name + ' (package ' + world.pkg + ')' : CITY}`);
}
