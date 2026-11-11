// Mog City: riding. The hero's ride as a horse: Ranger, a bay in a working western saddle (ranger.js, its tack in
// tack.js, its gaits in gaits.js), in place of the car as the city's car entity, so the game's way of being in a vehicle
// (activeMode 'car') holds while he rides: every story step, the GPS, the autopilot and the test drive go on working.
// wagmi/game.js builds it in its car block when a world names the vehicle 'mogcity/horse' (its car: { model }) or the
// address has ?horse (free roam on horseback), and from then on:
//   rider.js   him astride (the driver's rig's API: game.js's way in and out mounts and dismounts him)
//   drive.js   its way over the ground (in place of the car's physics, js/controllers.js updateCar)
//   saddle.js  fighting from the saddle (a blow with what he holds, or the horse's buck); trample is the fight's own
//              run-down by the car (wagmi/combat carContact), which knows the horse's box
//   hooves.js  its hoofbeats and tack (wagmi/audio/index.js plays them; no engine, no cabin)
// API (window.WAGMI.horse, with the horse only): id, name, rs (its rig), rider, drive, saddle;
//   mounted, gait, speed, walking (Q's walk);
//   give({ x, z, heading } | null)   Ranger standing saddled there (beside him if no place): a world's "here's your horse"
//   mount(quick) / dismount(quick)   as F does (the walk round to his side, or at once)
//   arm(kind)    something in his hand ('bat', 'bottle'): in the saddle at once, or on foot as the fight's pick-up
//   walk(on), jump(), buck(), swing(side)   (the keys' own, for a step, the autopilot or a test)
export { buildRanger } from './ranger.js';
export { createRider } from './rider.js';
export { createDrive } from './drive.js';
import { createSaddle } from './saddle.js';
import { PACKS } from './hooves.js';
import { CREDITS } from '../credits.js';

// the vehicle's name a world gives it (its car: { model: 'mogcity/horse', label? })
export const HORSE_MODEL = 'mogcity/horse';
/** Whether the game's ride is the horse: a world's car names it, or ?horse (free roam on horseback). */
export function wantsHorse(pack) {
  return !!(pack?.ok && pack.modelCar?.model === HORSE_MODEL) || new URLSearchParams(location.search).has('horse');
}
// its line in the pause menu's Credits
export const HORSE_CREDIT = { what: 'Ranger, the horse', who: 'Patch (New Save Labs, Inc.), made with anymove', note: 'from GameMog\'s library; its trot and gallop and its tack are made in code for Mog City', licence: 'CC0 1.0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', src: 'https://patch.gg' };

/** The city's car entity's numbers as a horse's: its box, framing, paces, handling, name (in place of the car's). */
export function fitHorse(car, rs, o = {}) {
  Object.assign(car, {
    kind: 'horse', vclass: 'horse', label: o.label || rs.label,
    body: { ...rs.body }, axle: rs.axle, mass: 0.6,
    // (the chase camera on a horse and rider: a little higher than on the car, the whole of them in the frame from the
    // hooves to his head, looking at the saddle; drawing back a little and the lens widening with speed, a tremble
    // only flat out)
    chaseDistance: 5.0, chaseHeight: 2.15,
    chase: { fov: 56, pull: 0.06, kick: 3.0, boostKick: 3.0, vmax: 12, shake: 0.012, vtop: 13 },
    // (its paces: a trot on W, a gallop with Shift; the drive (drive.js) reads its own, these are what the HUD and the
    // story runner read)
    topSpeed: 4.5, boostSpeed: 12, accel: 3, boostAccel: 4.2, rolling: 0.5, drag: 0, coast: 2.6, brake: 7, boostBrake: 9, noBoost: false,
    handling: { rMin: 1.8, yawMax: 1.9, grip: 11, rampIn: [0.16, 0.28], rampOut: 0.12, vRef: 12 },
    // (the story runner's words for getting on, going and stopping, and its pace for 'stopped')
    words: { board: 'Mount', go: 'Ride', park: 'Halt' }, stopV: 2.2, headY: 2.6,
  });
  // (the look point: js/cameras.js adds 0.52 for the car entity: the saddle, 1.67 m up)
  car.cameraTargetOffset.y = 1.15;
  // (no headlamps on a horse)
  for (const l of car.headLights || []) { l.visible = false; if (l.target) l.target.visible = false; }
  return car;
}

export function install(W, { THREE, rs, rider, drive, ride }) {
  const app = W.app, cm = app.controllerManager, car = W.car;
  document.body.classList.add('wg-horse');
  // (no engine or electric badge in the speed panel on a horse, and no car radio's station card)
  { const css = document.createElement('style'); css.textContent = 'body.wg-horse #wg-drive, body.wg-horse .wr-card { display: none !important; }'; document.head.appendChild(css); }
  const saddle = createSaddle(THREE, { W, rs, rider, drive });
  { const sec = CREDITS.find((c) => c.heading === 'Vehicles'); if (sec && !sec.lines.includes(HORSE_CREDIT)) sec.lines.push(HORSE_CREDIT); }
  // (its sounds fetched now, so the first hoofbeat is heard)
  try { const ctx = W.audio?.ctx; if (ctx) import('../library/sounds.js').then((m) => m.preload({ ctx }, PACKS)).catch(() => {}); } catch { /* (no sound) */ }

  // Q in the saddle: W walks instead of trotting (and back)
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;
  const riding = () => cm.activeMode === 'car' && !W.cutscene && !W.directed && !W.paused && !app.mapSystem?.isFullMapOpen;
  addEventListener('keydown', (e) => {
    if (e.repeat || typing(e) || e.ctrlKey || e.metaKey || e.altKey || !riding()) return;
    if (e.code === 'KeyQ') { drive.S.walk = !drive.S.walk; flash(drive.S.walk ? 'Walk' : 'Trot'); }
  });
  // no car radio on a horse: off, and its keys (R, T) do nothing in the saddle
  const radioOff = () => { if (W.radio && W.radio.on) { W.radio.on = false; } };
  radioOff(); const radioT = setInterval(() => { if (W.radio) { radioOff(); clearInterval(radioT); } }, 500);
  addEventListener('keydown', (e) => { if ((e.code === 'KeyR' || e.code === 'KeyT') && cm.activeMode === 'car') e.stopImmediatePropagation(); }, true);

  // a short word by the speed panel (the walk toggle)
  let flashEl = null, flashT = 0;
  function flash(text) {
    if (!flashEl) {
      flashEl = document.createElement('div'); flashEl.id = 'wg-horse-flash';
      Object.assign(flashEl.style, { position: 'fixed', left: '50%', bottom: '168px', transform: 'translateX(-50%)', padding: '6px 14px', borderRadius: '10px', background: 'rgba(10,12,18,0.72)', color: '#fff', font: '700 13px system-ui, sans-serif', letterSpacing: '0.14em', textTransform: 'uppercase', zIndex: 21, pointerEvents: 'none', transition: 'opacity .25s', opacity: '0' });
      document.body.appendChild(flashEl);
    }
    flashEl.textContent = text; flashEl.style.opacity = '1'; clearTimeout(flashT); flashT = setTimeout(() => { flashEl.style.opacity = '0'; }, 900);
  }

  /* ------------------------------------------------------------- the HUD -- */
  // the speed panel: his real mph (a horse's dial: full at 30), not the car's; the controls bar: a rider's keys
  const speedEl = document.getElementById('hud-speed'), meterEl = document.getElementById('hud-speed-meter');
  const fixSpeed = () => {
    if (cm.activeMode !== 'car' || !speedEl) return;
    const mph = String(Math.round(Math.abs(car.speed || 0) * 2.237));
    if (speedEl.textContent !== mph) speedEl.textContent = mph;
    if (meterEl) { const t = `scaleX(${Math.min(1, +mph / 30)})`; if (meterEl.style.transform !== t) meterEl.style.transform = t; }
  };
  if (speedEl) new MutationObserver(fixSpeed).observe(speedEl, { childList: true, characterData: true, subtree: true });
  if (meterEl) new MutationObserver(fixSpeed).observe(meterEl, { attributes: true, attributeFilter: ['style'] });
  const bar = document.getElementById('hud-controls-hint');
  const KEYS = [[['W', 'S'], 'Ride / Halt'], [['A', 'D'], 'Steer'], [['Shift'], 'Gallop'], [['Q'], 'Walk'], [['Space'], 'Jump'], [['J'], 'Swing / Buck'], [['F'], 'Dismount'], [['Drag'], 'Orbit']];
  const PAD = [[['RT', 'LT'], 'Ride / Halt'], [['LS'], 'Steer'], [['X'], 'Gallop'], [['A'], 'Jump'], [['Y'], 'Dismount'], [['RS'], 'Look']];
  const fixHints = () => {
    if (!bar || cm.activeMode !== 'car' || bar.querySelector('.wg-horse-hint')) return;
    const pad = !!bar.querySelector('kbd[data-pad]');
    const items = (pad ? PAD : KEYS).map(([keys, label]) => {
      const item = document.createElement('span'); item.className = 'hint wg-horse-hint';
      for (const k of keys) { const kbd = document.createElement('kbd'); kbd.textContent = k; if (pad) kbd.dataset.pad = k; item.appendChild(kbd); }
      const l = document.createElement('span'); l.className = 'hint-label'; l.textContent = label; item.appendChild(l);
      return item;
    });
    bar.replaceChildren(...items);
  };
  if (bar) new MutationObserver(fixHints).observe(bar, { childList: true });
  fixHints(); fixSpeed();

  /* ------------------------------------------------------------- the API -- */
  const P = W.person;
  function give(at = null) {
    if (cm.activeMode === 'car') return false;
    let x, z, h;
    if (at && Number.isFinite(at.x) && Number.isFinite(at.z)) { x = at.x; z = at.z; h = Number.isFinite(at.heading) ? at.heading : P.heading; }
    else {
      // (beside him, on his right, facing the way he does, clear of the buildings)
      h = P.heading; const rx = -Math.cos(h), rz = Math.sin(h);
      x = P.position.x + rx * 2.4 + Math.sin(h) * 0.8; z = P.position.z + rz * 2.4 + Math.cos(h) * 0.8;
      const v = new THREE.Vector3(x, 0, z); cm.resolveHorizontalCollision(v, 0.9, cm.getGroundHeight(x, z, 'person') + 1.9); x = v.x; z = v.z;
    }
    car.position.set(x, cm.getGroundHeight(x, z, 'person'), z);
    Object.assign(car, { heading: h, speed: 0, vx: 0, vz: 0, angularVel: 0, steerK: 0, halt: 0 });
    drive.S.ground = null; drive.S.air = false; drive.S.jumpY = 0;
    car.chassisPivot.rotation.set(0, 0, 0); car.chassisPivot.position.y = 0;
    car.mesh.position.copy(car.position); car.mesh.rotation.y = h; car.mesh.visible = true;
    W.horseVoice?.greet?.(); // (brought to him: its nicker, wagmi/horse/voice.js)
    return true;
  }
  const api = W.horse = {
    id: HORSE_MODEL, name: rs.label, rs, rider, drive, saddle,
    get mounted() { return cm.activeMode === 'car' && rider.attached && !W.ride?.phase; },
    get gait() { return rs.gait; },
    get speed() { return car.speed || 0; },
    get walking() { return drive.S.walk; },
    give,
    mount(quick = false) { if (cm.activeMode === 'car') return false; if (Math.hypot(P.position.x - car.position.x, P.position.z - car.position.z) > 3) give(); ride.getIn(quick); return true; },
    dismount(quick = false) { if (cm.activeMode !== 'car') return false; ride.getOut(quick); return true; },
    arm(kind = 'bat') {
      if (rider.attached && cm.activeMode === 'car') return !!saddle.arm(kind);
      const g = W.combat?.debug?.give; return g ? !!g(kind) : false;
    },
    walk(on = !drive.S.walk) { drive.S.walk = !!on; return drive.S.walk; },
    jump: () => drive.jump(),
    buck: () => saddle.buck(),
    swing: (side) => saddle.swing(side),
    // (for tests: what it is doing)
    state() {
      const m = rs.mix;
      return { mounted: api.mounted, phase: W.ride?.phase || null, k: +(W.ride?.k ?? 0).toFixed(2), gait: rs.gait, speed: +(car.speed || 0).toFixed(2), walk: drive.S.walk, air: drive.S.air, jumpY: +drive.S.jumpY.toFixed(2),
        one: rs.oneShot?.name || null, striking: rider.striking, weapon: saddle.weapon, pos: [+car.position.x.toFixed(2), +car.position.y.toFixed(2), +car.position.z.toFixed(2)], heading: +car.heading.toFixed(3),
        weights: Object.fromEntries(Object.entries(m.W).map(([k, v]) => [k, +v.toFixed(2)])), cadence: Object.fromEntries(Object.entries(m.F).map(([k, v]) => [k, +v.toFixed(2)])) };
    },
  };
  console.log('[wagmi] riding is in: Ranger');
  return api;
}
