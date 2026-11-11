// SF 2040: San Francisco after Erebus. One switchable layer over San Francisco (?city=sf) that New York and the plain
// ?city=sf never load: imported only when it is asked for, by
//   ?apocalypse[=dusk|day|night] on a ?city=sf page (free roam: wagmi/city.js), or
//   a Story Kit world for city 'sf' whose dressing says apocalypse: true | 'dusk' | 'day' | 'night'
//   (wagmi/storyrun/pack.js asksApocalypse; storyrun/index.js), so the missions inherit it.
// What it does:
//   look.js    the ash sky, the copper sun low in the west, the red glow over the Presidio, the heavy warm haze and
//              grade; the power out (windows and street lights dark)
//   fx.js      falling ash and embers, fires with their smoke, the great plumes over the skyline
//   debris.js  the broken streets round the camera: rubble, barriers, drums, tyres, sheets of metal, fallen poles, the
//              dead lawns' mounds, shrubs and litter; the big pieces solid (colliders)
//   corridor.js the GPS route kept rideable: wrecks pushed to the kerb or put away, no heap laid across it
//   burning.js windows burning in some of the old fronts (soot up the wall over them), burnt-out cars still alight
//   camps.js   tent camps and food lines on the plazas and squares, people round barrel fires
//   sound.js   wind, rumble, crackle, far sirens and booms, a far roar; the living city's bed turned down (no music)
//   and here:  the traffic left where it stood (cities/sf/js/traffic.js abandon: no driving, askew, burnt out, doors
//              open, solid and never shoved, no lamps lit (NYC.carLampPower 0), no buses; the freeways and the
//              streetcars stopped), the lawns dead (cityUniforms.uDeadGround), far fewer people out and those in drab, dusty clothes,
//              and wild horses grazing on the open green near the camera (W.creatures.herd)
//   createApocalypse(W, { time, clear: [[x, z, r]] (kept clear of the camps) }) -> W.apocalypse { look, fx, debris, camps, sound, setTime(id), stats() }
import { installLook, PRESETS, lookOf } from './look.js';
import { createFX } from './fx.js';
import { createDebris } from './debris.js';
import { createCamps, CAMPS } from './camps.js';
import { createSound } from './sound.js';
import { createBurning } from './burning.js';
import { createCorridor } from './corridor.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// how many of the city's walkers (of 340) and the street crowd's (of 560) are still out
const WALKERS = 50, CROWD = 36;
// the open green the wild horses graze on (the camps' plazas left to the people)
const PASTURES = [[520, -740], [-2322, -402], [-2062, 871], [-699, -1347], [-333, -1573], [-345, 1300], [-644, 2602], [-1663, -1737], [-884, -1527]];

export async function createApocalypse(W, { time = 'dusk', clear = [] } = {}) {
  if (W.apocalypse) return W.apocalypse;
  const app = W.app, N = window.NYC;
  for (let i = 0; i < 1800 && !app.ready; i++) await sleep(100);
  const out = (W.apocalypse = { ready: false });
  document.documentElement.dataset.apocalypse = '1';

  // the light
  const look = installLook(W, lookOf(time));
  const fx = createFX(W);
  const lookNow = () => PRESETS[app.lightingSystem.activePresetId] || PRESETS['ash-dusk'];
  fx.setLook(lookNow());
  // (a mission's own time later: the effects follow the look)
  const apply1 = app.lightingSystem.applyPreset;
  app.lightingSystem.applyPreset = (id, force) => { const r = apply1(id, force); try { fx.setLook(lookNow()); } catch {} return r; };

  // the traffic left standing, the people fewer and worn
  const tr = app.trafficSystem;
  const charred = [Math.fround(0.035), Math.fround(0.031), Math.fround(0.028)];
  // (years of ash on them: the paint dulled most of the way to a grey-brown dust, a little of its colour left)
  const dust = (v) => { const p = v.paint0; const g = 0.6 + Math.random() * 0.25, k = 0.55 + Math.random() * 0.3; return [Math.fround((p[0] * (1 - g) * 0.7 + 0.17 * g) * k), Math.fround((p[1] * (1 - g) * 0.7 + 0.15 * g) * k), Math.fround((p[2] * (1 - g) * 0.7 + 0.125 * g) * k)]; };
  tr?.abandon?.(true, { burnt: 0.34, paint: (v, burnt) => (burnt ? charred : dust(v)) });
  tr?.setPeds?.(WALKERS);
  if (W.street?.crowd && 'limit' in W.street.crowd) W.street.crowd.limit = CROWD;
  if (N.peopleWorn) N.peopleWorn.value = 1;
  // (the power is out: the signals dark, no car's lamps lit)
  if (N.signalPower) N.signalPower.value = 0;
  if (N.carLampPower) N.carLampPower.value = 0;
  // (the lawns dead: trampled straw, bare dirt, tracks and ash; cities/sf/js/tsl-materials.js deadGround)
  if (N.cityUniforms?.uDeadGround) N.cityUniforms.uDeadGround.value = 1;

  // the streets, the camps
  const debris = createDebris(W, fx, { clear });
  const camps = createCamps(W, fx, { clear });
  const sound = createSound(W, fx);
  const burning = createBurning(W, fx);
  // (the GPS's way kept rideable: no wreck or heap across it)
  const corridor = createCorridor(W, debris);
  debris.keep = (x, z, r) => corridor.near(x, z, r);
  tr?.avoid?.((x, z) => corridor.near(x, z, 1.2));

  // the wild horses: a herd on the nearest open green within reach, two at most, gone when left far behind
  const herds = new Map();
  let herdT = 3;
  function herdsUpdate(dt, c) {
    if (!W.creatures?.herd || (herdT -= dt) > 0) return;
    herdT = 2;
    const p = c.position;
    for (const [k, h] of herds) { const [x, z] = PASTURES[k]; if (Math.hypot(x - p.x, z - p.z) > 600) { try { h.remove(); } catch {} herds.delete(k); } }
    if (herds.size >= 2) return;
    let best = -1, bd = 360;
    PASTURES.forEach(([x, z], k) => { const d = Math.hypot(x - p.x, z - p.z); if (!herds.has(k) && d < bd) { bd = d; best = k; } });
    if (best < 0) return;
    const [x, z] = PASTURES[best];
    try { herds.set(best, W.creatures.herd('creature-horse', { at: { x, z }, count: 3 + (best % 3), radius: 14 })); } catch (e) { console.warn('[apocalypse] herd', e); herds.set(best, { remove() {} }); }
  }

  // every frame (after the city's own update, before the next render)
  let last = performance.now(), warned = false;
  (function frame() {
    requestAnimationFrame(frame);
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (W.paused) return;
    const c = app.cameraSystem?.camera; if (!c) return;
    try {
      fx.update(dt, c);
      debris.update(c);
      burning.update(c, dt);
      corridor.update(dt);
      camps.update(dt, c);
      sound?.update(dt, c);
      herdsUpdate(dt, c);
    } catch (e) { if (!warned) { warned = true; console.warn('[apocalypse] frame', e); } }
  })();

  Object.assign(out, {
    look, fx, debris, camps, sound, burning, corridor, herds, CAMPS,
    setTime(id) { const r = look.set(id); fx.setLook(lookNow()); return r; },
    stats: () => ({ look: app.lightingSystem.activePresetId, fires: fx.fires, debris: debris.count(), burning: burning.count(), solids: debris.solids.length, corridor: corridor.stats(), campPeople: camps.people.length, herds: [...herds.keys()], abandoned: !!tr?.abandoned, sound: !!sound?.built }),
    ready: true,
  });
  console.log('[apocalypse] San Francisco after Erebus:', look?.base);
  return out;
}
