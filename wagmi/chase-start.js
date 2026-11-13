// Mog City: the chase-first opening (?start=chase), in any city the world contract plays (wagmi/world). No gate, no
// opening, no mission: Dan at the wheel on a through-road (world.throughRoad: a long main road near where the city
// starts him), rolling, and the police already on him at a modest heat (wagmi/pursuit, the game's own chase). Installed
// by wagmi/city.js (free roam) in place of putting him out beside the car; without ?start=chase none of it runs.
//   CHASE_START          true on a ?start=chase page with no ?pack=
//   chaseStart(W)        (city.js, once the city is up) him in the car on the road, then the chase
import { world } from './world/index.js';

const Q = new URLSearchParams(location.search);
export const CHASE_START = Q.get('start') === 'chase' && !Q.has('pack');
// the opening's numbers: the heat (1-5), who chases, his speed rolling off (m/s), the beat before they come (ms)
const OPEN = { heat: 2, kind: 'police', roll: 9, beat: 1500 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function chaseStart(W) {
  const app = W.app, cm = app.controllerManager, car = W.car, P = W.person;
  // (intro.js's placing, loaded only now: this module is imported by game.js on every start)
  const { place: putAt } = await import('./intro.js');
  // the road: the through-road nearest where the city put the car
  const at = car?.position || cm.getActiveEntity()?.position || { x: 0, z: 0 };
  const r = world.throughRoad({ x: at.x, z: at.z });
  if (r) {
    putAt(W, { car: [r.x, r.z, r.heading], dan: [r.x, r.z, r.heading] });
    P.inVehicle = true; P.mesh.visible = false; P.speed = 0; app.selectMode('car');
    car.position.y = world.groundY(r.x, r.z, 'car'); car.mesh.position.y = car.position.y;
    app.cameraSystem.resetForTeleport?.();
    car.speed = OPEN.roll;
  } else {
    console.warn('[chase] no through-road near the start: the chase starts where he is');
    if (cm.activeMode !== 'car') W.ride?.getIn?.(true);
  }
  W.chaseStart = { road: r && { x: +r.x.toFixed(1), z: +r.z.toFixed(1), heading: +r.heading.toFixed(3), len: Math.round(r.edge.len), name: world.streetNameAt(r.x, r.z) } };
  // (a beat on the road, the boot veil gone, then the chase)
  const booted = () => { const v = document.getElementById('wg-boot'); return !v || v.classList.contains('off'); };
  const t0 = performance.now();
  for (let i = 0; i < 300 && (!booted() || performance.now() - t0 < OPEN.beat); i++) await sleep(100);
  if (cm.activeMode !== 'car') { W.ride?.getIn?.(true); await sleep(600); }
  for (let i = 0; i < 100 && !W.pursuit; i++) await sleep(100);
  if (!W.pursuit) { console.warn('[chase] no pursuit system'); return; }
  const ch = W.pursuit.start({ heat: OPEN.heat, kind: OPEN.kind });
  W.chaseStart.chase = ch;
  console.log('[chase] chase-first:', world.id, JSON.stringify(W.chaseStart.road));
}
