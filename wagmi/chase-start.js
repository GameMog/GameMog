// Mog City: the chase-first opening (?start=chase), in any city the world contract plays (wagmi/world). No gate, no
// opening, no mission: Dan at the wheel on a through-road (world.throughRoad: a long main road near where the city
// starts him), rolling, and the police already on him at a modest heat (wagmi/pursuit, the game's own chase). Installed
// by wagmi/city.js (free roam) in place of putting him out beside the car; without ?start=chase none of it runs.
//   CHASE_START          true on a ?start=chase page with no ?pack=
//   chaseStart(W)        (city.js, once the city is up) him in the car on the road, then the chase
import { world } from './world/index.js';

const Q = new URLSearchParams(location.search);
export const CHASE_START = Q.get('start') === 'chase' && !Q.has('pack');
// the opening's numbers: the heat (1-5), who chases, his speed rolling off (m/s), the beat before they come (ms), and
// whether a town's opening puts a cruiser on his road ahead of him (no: they come from behind, wagmi/pursuit start())
// and, in a town, the seconds they hold off him at the start (wagmi/pursuit CALM)
const OPEN = { heat: 2, kind: 'police', roll: 9, beat: 1500, ahead: false, calm: 6 };
// a town's (world.id 'pkg'): the road ahead of him cleared of the traffic while the boot veil is up (the traffic's hold
// zones: nothing is put down in one, and a walker found in one is put somewhere else out of view; the cars and buses
// in them then are taken off their lanes, for the traffic to put down again outside them), from `back` m behind him to
// `ahead` m on down the line he faces, `half` m either side of it (the whole road, both ways), in `step` m pieces, and
// `junction` m round every junction on it (the cross streets' cars that would turn in ahead of him); let go once the
// veil is off, at least `min` ms on, and the traffic has put down again what was taken off, `frames` frames after the
// veil at least (let go as the veil went, the buses taken off came back down anywhere round him, on E Carson St ahead
// of him too), or `cap` ms after the veil whatever. Pittsburgh's start on E Carson St, by the S 14th St lights, ran into
// the queue at the next lights 90-250 m on, or one of the town's buses ahead of him in his lane, in a third of them
const CLEAR = { back: 20, ahead: 450, half: 9, step: 10, junction: 35, min: 300, frames: 10, cap: 3000 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let held = false, taken = [];
// (the hold zones down the line from r { x, z, heading }: axis-aligned boxes round each piece of it)
function clearAhead(TS, r) {
  if (!TS?.hold) return;
  const ux = Math.sin(r.heading), uz = Math.cos(r.heading), a = CLEAR.step / 2, b = CLEAR.half;
  const ex = Math.abs(ux) * a + Math.abs(uz) * b, ez = Math.abs(uz) * a + Math.abs(ux) * b, rects = [];
  for (let d = -CLEAR.back + a; d <= CLEAR.ahead; d += CLEAR.step) {
    const x = r.x + ux * d, z = r.z + uz * d;
    rects.push({ minX: x - ex, maxX: x + ex, minZ: z - ez, maxZ: z + ez });
  }
  // (the junctions along it: a node of the traffic's graph with more than two ways in and out, on the road)
  const J = CLEAR.junction;
  for (const n of TS.network?.nodes || []) {
    if ((n.in?.length || 0) + (n.out?.length || 0) <= 2) continue;
    const dx = n.x - r.x, dz = n.z - r.z, along = dx * ux + dz * uz, across = Math.abs(dx * uz - dz * ux);
    if (along >= -CLEAR.back && along <= CLEAR.ahead && across <= CLEAR.half + 6) rects.push({ minX: n.x - J, maxX: n.x + J, minZ: n.z - J, maxZ: n.z + J });
  }
  TS.hold(rects); held = rects.length;
  // (and what is in them now taken off its lane, for the traffic to put down again round him outside them: its own
  // move out of a hold zone looks for a spot 100-300 m off out of view, and a bus, kept to the avenues, found none in
  // its few tries: three of the town's six were still on E Carson St ahead of him when the veil lifted)
  const inside = (x, z, m) => rects.some((q) => x > q.minX - m && x < q.maxX + m && z > q.minZ - m && z < q.maxZ + m);
  for (const v of [...(TS.cars || []), ...(TS.buses || [])]) if (v.edge && !v.disabled && inside(v.x, v.z, v.half || 2)) { v.edge = null; v.conn = null; v.commit = null; taken.push(v); }
}

export async function chaseStart(W) {
  const app = W.app, cm = app.controllerManager, car = W.car, P = W.person;
  // (intro.js's placing, loaded only now: this module is imported by game.js on every start)
  const { place: putAt } = await import('./intro.js');
  // the road: the through-road nearest where the city put the car
  const at = car?.position || cm.getActiveEntity()?.position || { x: 0, z: 0 };
  // (on the centre of a real lane, the road running on straight ahead of him for 300 m where the city has one)
  const r = world.throughRoad({ x: at.x, z: at.z }, { runway: 300 });
  if (r) {
    putAt(W, { car: [r.x, r.z, r.heading], dan: [r.x, r.z, r.heading] });
    P.inVehicle = true; P.mesh.visible = false; P.speed = 0; app.selectMode('car');
    car.position.y = world.groundY(r.x, r.z, 'car'); car.mesh.position.y = car.position.y;
    app.cameraSystem.resetForTeleport?.();
    car.speed = OPEN.roll;
    if (world.id === 'pkg') clearAhead(app.trafficSystem, r);
  } else {
    console.warn('[chase] no through-road near the start: the chase starts where he is');
    if (cm.activeMode !== 'car') W.ride?.getIn?.(true);
  }
  W.chaseStart = { road: r && { x: +r.x.toFixed(1), z: +r.z.toFixed(1), heading: +r.heading.toFixed(3), len: Math.round(r.edge.len), name: world.streetNameAt(r.x, r.z) }, cleared: held };
  // (a beat on the road, the boot veil gone, then the chase)
  const booted = () => { const v = document.getElementById('wg-boot'); return !v || v.classList.contains('off'); };
  const t0 = performance.now();
  // (the hold zones let go: see CLEAR; the frames counted from the veil's going)
  let tb = 0, frames = 0;
  const count = () => { frames++; if (held) requestAnimationFrame(count); };
  const letGo = () => {
    if (!held || !booted()) return;
    const now = performance.now();
    if (!tb) { tb = now; requestAnimationFrame(count); }
    const down = taken.every((v) => v.edge || v.disabled);
    if (now - t0 >= CLEAR.min && ((frames >= CLEAR.frames && down) || now - tb > CLEAR.cap)) {
      app.trafficSystem.hold?.([]); held = false;
      W.chaseStart.cleared = { zones: W.chaseStart.cleared, taken: taken.length, left: taken.filter((v) => !v.edge && !v.disabled).length, ms: Math.round(now - t0) };
    }
  };
  for (let i = 0; i < 300 && (!booted() || performance.now() - t0 < OPEN.beat); i++) { letGo(); await sleep(100); }
  for (let i = 0; i < 60 && held; i++) { letGo(); await sleep(50); }
  if (held) { app.trafficSystem.hold?.([]); held = false; }
  if (cm.activeMode !== 'car') { W.ride?.getIn?.(true); await sleep(600); }
  for (let i = 0; i < 100 && !W.pursuit; i++) await sleep(100);
  if (!W.pursuit) { console.warn('[chase] no pursuit system'); return; }
  const ch = W.pursuit.start({ heat: OPEN.heat, kind: OPEN.kind, ahead: OPEN.ahead, calm: world.id === 'pkg' ? OPEN.calm : 0 });
  W.chaseStart.chase = ch;
  console.log('[chase] chase-first:', world.id, JSON.stringify(W.chaseStart.road));
}
