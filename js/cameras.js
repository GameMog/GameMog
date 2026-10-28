(function () {
// js/cameras.js
// Multi-camera system supporting Third-Person Chase (with mouse/touch orbit + zoom),
// Low-Angle Action Cam, POV/Cockpit Cam, 7 Iconic NYC Architectural Cameras, and Auto-Director Drone.

const { THREE } = window.NYC;

const CAMERA_PRESETS = [
  { id: 'chase',       name: '3rd-Person Chase',         short: 'Chase',       category: 'follow', fov: 56 },
  { id: 'action',      name: 'Low-Angle Action',         short: 'Action',      category: 'follow', fov: 60 },
  { id: 'pov',         name: 'First-Person / Cockpit',   short: 'POV / Dash',  category: 'follow', fov: 68 },
  { id: 'centralPark', name: 'Central Park Oasis',       short: 'Central Pk',  category: 'scenic', fov: 52 },
  { id: 'fifthAve',    name: '5th Ave & Empire State',   short: '5th Ave',     category: 'scenic', fov: 48 },
  { id: 'timesSquare', name: 'Times Square Crossroads',  short: 'Times Sq',    category: 'scenic', fov: 58 },
  { id: 'chryslerGCT', name: '42nd St · Chrysler & GCT', short: 'Chrysler',    category: 'scenic', fov: 50 },
  { id: 'observatory', name: 'Empire State 86th Deck',   short: '86th Deck',   category: 'scenic', fov: 52 },
  { id: 'bryantPark',  name: 'Bryant Park & NYPL',       short: 'Bryant Pk',   category: 'scenic', fov: 52 },
  { id: 'waterfront',  name: 'East River & Skyline',     short: 'Skyline',     category: 'scenic', fov: 46 },
  { id: 'drone',       name: 'Auto-Director Aerial',     short: 'Director',    category: 'scenic', fov: 50 }
];

// The follow cameras' lens keeps LENS_PAD m off the buildings (the near plane, 0.35 m out, stays clear of a wall); on
// foot, LENS_PAD_FOOT (Mog City: the lens a man's height off the pavement had a facade grazing the frame's edge)
const LENS_PAD = 0.3, LENS_PAD_FOOT = 0.55;
// (Mog City) a wall alongside the lens: probes SIDE_A off the view's way either side (wider on a wider lens), SIDE m
// long, from the lens; a hit edges the view away from it, at most SIDE_MAX rad (keepInView)
const SIDE_A = 70 * Math.PI / 180, SIDE = 2.2, SIDE_MAX = 0.35;
// (Mog City) a car's impact spin ridden through (update(): the view keeps its line while the car spins under it and
// comes round after, at most SPIN_CAP rad behind it, let go at SPIN_BLEED /s but never faster than SPIN_RATE rad/s)
const SPIN_CAP = 1.2, SPIN_BLEED = 2.6, SPIN_RATE = 1.6;
// (Mog City) a low thing in the street across the boom (a parked car, a car in traffic, a can: cs.blockers' boxes
// under OVER_TOP m): the lens rises over it, by the least of these that clears it, before it pulls in or swings round
const OVER_TOP = 3.5, OVER_LIFTS = [0.5, 1.0, 1.5, 2.0, 2.6];
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// (Mog City) a follow offset (from the entity) eased toward another in polar form, its yaw and its length, and its
// height straight: swung round a big turn the boom keeps its length instead of cutting across close to him
function easePolar(cur, want, k) {
  const l0 = Math.hypot(cur.x, cur.z), l1 = Math.hypot(want.x, want.z);
  if (l0 < 0.05 || l1 < 0.05) { cur.lerp(want, k); return; }
  const a0 = Math.atan2(cur.x, cur.z), a = a0 + wrapA(Math.atan2(want.x, want.z) - a0) * k, l = l0 + (l1 - l0) * k;
  cur.x = Math.sin(a) * l; cur.z = Math.cos(a) * l; cur.y += (want.y - cur.y) * k;
}
// (the box the last rayClear stopped at, or null)
let rayHit = null;
// How far a line from p (unit direction ux, uy, uz) runs, up to len, before it comes within LENS_PAD of one of the
// boxes: the controllers' colliders, boxes from the ground up to maxY, some turned (obb); (Mog City) a box with a minY
// starts there instead (a sign, a screen up on its truss). A box the line starts within the pad of counts at its own
// size, one it starts inside not at all. (Mog City: pad, the way off them; buildings: the street's things skipped)
function rayClear(p, ux, uy, uz, len, boxes, pad0 = LENS_PAD, buildings = false) {
  let t = len;
  rayHit = null;
  for (const c of boxes) {
    if (c.carOnly || p.y - pad0 > c.maxY && uy >= 0 || buildings && c.street) continue;
    const y0 = c.minY != null ? c.minY : -1e4;
    let ox = p.x, oz = p.z, dx = ux, dz = uz, x0 = c.minX, x1 = c.maxX, z0 = c.minZ, z1 = c.maxZ;
    if (c.obb) {
      const o = c.obb;
      const rx = p.x - o.cx;
      const rz = p.z - o.cz;
      ox = rx * o.cs - rz * o.sn;
      oz = rx * o.sn + rz * o.cs;
      dx = ux * o.cs - uz * o.sn;
      dz = ux * o.sn + uz * o.cs;
      x0 = -o.hx; x1 = o.hx; z0 = -o.hz; z1 = o.hz;
    }
    const within = (m) => ox > x0 - m && ox < x1 + m && oz > z0 - m && oz < z1 + m && p.y < c.maxY + m && p.y > y0 - m;
    if (within(0)) continue;
    const pad = within(pad0) ? 0 : pad0;
    let t0 = 0;
    let t1 = t;
    for (const [o, d, lo, hi] of [[ox, dx, x0 - pad, x1 + pad], [p.y, uy, y0 - pad, c.maxY + pad], [oz, dz, z0 - pad, z1 + pad]]) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) { t0 = Infinity; break; }
        continue;
      }
      let a = (lo - o) / d;
      let b = (hi - o) / d;
      if (a > b) [a, b] = [b, a];
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 < t) { t = t0; rayHit = c; }
  }
  return t;
}
// Ways round the player a blocked follow camera may swing to (rad off straight behind him)
const SWINGS = [0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.8, -1.8, 2.3, -2.3];

// (Mog City) a phone held upright. three's fov is the height of the view, so on a screen taller than wide the view
// across closes right in (a 56 degree lens on a 393 x 852 phone sees 27 degrees across). Narrower than PORT (width /
// height) the lens opens out to keep a useful width, the follow cameras stand a little further back and higher, and
// look down the street more (the tall frame's top half is the road ahead, not the sky); all of it by portK, 0 at PORT
// and above (landscape and every desktop window: today's numbers exactly) to 1 at PORT_FULL and below (a phone).
const PORT = 1.3, PORT_FULL = 0.6;
// how much of the lost width the lens wins back (1: all of it, the width of a PORT screen), and its most (deg)
const PORT_WIDEN = 0.78, PORT_FOV_MAX = 102;
// the follow camera upright (at portK 1): its boom longer by PULL, higher by LIFT m and looking DROP m lower (on foot;
// a car's own below)
const PORT_RIG = { person: { pull: 0.06, lift: 0.75, drop: 1.05 }, car: { pull: 0.08, lift: 0.85, drop: 0.35 } };
function portK(aspect) {
  if (!(aspect < PORT)) return 0;
  const k = Math.min(1, (PORT - aspect) / (PORT - PORT_FULL));
  return k * k * (3 - 2 * k);
}
// the lens (vertical fov, deg) that sees about as wide on this screen as `fov` does on a PORT one (upright only)
function portFov(fov, aspect) {
  const k = portK(aspect);
  if (!k) return fov;
  const t = Math.tan(fov * Math.PI / 360) * Math.pow(PORT / aspect, PORT_WIDEN);
  return Math.min(PORT_FOV_MAX, Math.max(fov, Math.atan(t) * 360 / Math.PI));
}

class CameraSystem {
  constructor(domElement, controllerManager) {
    this.domElement = domElement;
    this.controllerManager = controllerManager;

    this.camera = new THREE.PerspectiveCamera(
      56,
      window.innerWidth / window.innerHeight,
      0.35,
      60000 // at 1:1 the boroughs & harbor run out ~20-40 km to the fogged horizon (reversed float depth keeps precision)
    );

    this.activePresetId = 'chase';
    this.orbitYawOffset = 0.0;
    this.orbitPitchOffset = 0.09;
    this.zoomMultiplier = 1.0;
    this.isDragging = false;
    this.userOrbitTimer = 0;

    this.currentPos = new THREE.Vector3(0, 10, 380);
    this.currentLookAt = new THREE.Vector3(0, 8, 440);
    this.initialized = false;

    // Follow cameras (chase / action) are smoothed relative to the followed entity, see update()
    this.followEntity = null;
    this.followOffset = new THREE.Vector3();
    this.followLookOffset = new THREE.Vector3();
    this.followBaseY = 0;
    this.smoothedSpeed = 0;
    // A car's own lens (entity.chase, see update()): on, how far its speed has widened it, and the fov it makes (null:
    // the preset's), for whatever else sets the fov over the camera's (wagmi/combat/camera.js)
    this._lens = false;
    this._kick = 0;
    this.lensFov = null;
    this._desiredPos = new THREE.Vector3();
    this._desiredLook = new THREE.Vector3();
    // Clear view of the player (keepInView): the lens's boom, swing round him and lift, and where it looks
    this._view = null;
    this._pivot = new THREE.Vector3();
    this._look = new THREE.Vector3();
    // (Mog City) what else stands in the street, for keepInView: blockers(x, z, r, entity) -> boxes in the colliders'
    // form (the traffic, a parked car, a mission's van or stage screen: wagmi/combat/camera.js createBlockers), or null
    this.blockers = null;
    // (Mog City) the shore highways' traffic too (js/traffic.js createHighwayTraffic, set by wagmi/game.js): its cars
    // are boxes like the city's cars in createBlockers (highwayBoxes)
    this.highway = null;
    this._hwNear = [];
    this._hwBoxes = [];
    this._hwPool = [];

    this.bindPointerControls();
  }

  bindPointerControls() {
    const canvas = this.domElement;
    const pointers = new Map();
    canvas.style.touchAction = 'none';

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || pointers.size >= 2) return;
      // Only two touch pointers may share a gesture; mouse and pen drags stay independent.
      if (pointers.size && (e.pointerType !== 'touch' || pointers.values().next().value.type !== 'touch')) return;
      e.preventDefault();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      canvas.setPointerCapture(e.pointerId);
      this.isDragging = true;
      this.userOrbitTimer = 4.0;
    });

    canvas.addEventListener('pointermove', (e) => {
      const pointer = pointers.get(e.pointerId);
      if (!pointer) return;
      e.preventDefault();
      const dx = e.clientX - pointer.x;
      const dy = e.clientY - pointer.y;
      const pair = pointers.size === 2 ? [...pointers.values()] : null;
      const previousDistance = pair ? Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y) : 0;
      pointer.x = e.clientX;
      pointer.y = e.clientY;

      if (pair) {
        const distance = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
        if (previousDistance > 1 && distance > 1) {
          this.zoomMultiplier = Math.max(0.45, Math.min(2.4, this.zoomMultiplier * previousDistance / distance));
        }
      } else {
        this.orbitYawOffset -= dx * 0.0065;
        this.orbitPitchOffset = Math.max(-0.32, Math.min(0.68, this.orbitPitchOffset + dy * 0.005));
      }
      this.userOrbitTimer = 4.0;
    });

    const releasePointer = (id) => {
      if (!pointers.delete(id)) return;
      this.isDragging = pointers.size > 0;
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(type, (e) => releasePointer(e.pointerId));
    }
    const clearPointers = () => {
      for (const id of pointers.keys()) releasePointer(id);
    };
    this._clearPointers = clearPointers;
    window.addEventListener('blur', clearPointers);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearPointers();
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomMultiplier = Math.max(0.45, Math.min(2.4, this.zoomMultiplier + e.deltaY * 0.001));
    }, { passive: false });
  }

  setCameraPreset(presetId, snapImmediately = false) {
    const preset = CAMERA_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    this.activePresetId = preset.id;
    this.camera.fov = this.portK() ? portFov(preset.fov, this.camera.aspect) : preset.fov;
    this.camera.updateProjectionMatrix();
    if (snapImmediately) {
      this.initialized = false;
    }
  }

  applyGamepadInput(lookX, lookY, zoom, dt) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    if (this.activePresetId !== 'chase' && this.activePresetId !== 'pov') return;
    // POV uses the orbit angles, but only chase renders a zoomed camera distance.
    if (this.activePresetId !== 'chase') zoom = 0;
    if (!lookX && !lookY && !zoom) return;
    this.orbitYawOffset -= lookX * 2.0 * dt;
    this.orbitPitchOffset = Math.max(-0.32, Math.min(0.68, this.orbitPitchOffset + lookY * 1.25 * dt));
    this.zoomMultiplier = Math.max(0.45, Math.min(2.4, this.zoomMultiplier + zoom * 0.9 * dt));
    this.userOrbitTimer = 4.0;
  }

  resetOrbit() {
    this.orbitYawOffset = 0;
    this.orbitPitchOffset = 0.09;
    this.zoomMultiplier = 1;
    this.userOrbitTimer = 0;
  }

  resetForTeleport() {
    // Arrive with a fresh chase view, without carrying a previous drive or gesture into the destination.
    this._clearPointers();
    this.isDragging = false;
    this.resetOrbit();
    this.smoothedSpeed = 0;
    this.followEntity = null;
    this.followOffset.set(0, 0, 0);
    this.followLookOffset.set(0, 0, 0);
    this.followBaseY = 0;
    this._view = null;
    this.setCameraPreset('chase', true);
  }

  getActivePreset() {
    return CAMERA_PRESETS.find((p) => p.id === this.activePresetId) || CAMERA_PRESETS[0];
  }

  onResize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  // (Mog City) how upright the screen is (0: landscape or wider than PORT; 1: a phone held upright), and the lens the
  // follow cameras use for a preset's fov on it (wagmi/mission/cine.js: a cutscene's hand-back glides to it)
  portK() { return portK(this.camera.aspect); }
  fitFov(fov) { return portFov(fov, this.camera.aspect); }
  viewFov() { return this._port ? (this.lensFov ?? this.fitFov(this.getActivePreset().fov)) : this.getActivePreset().fov; }
  // (the follow camera's boom upright: longer, higher, looking lower; all 0 in landscape)
  portRig(entity, k = this.portK()) {
    const r = entity && (entity.type === 'car' ? PORT_RIG.car : entity.type === 'person' ? PORT_RIG.person : null);
    return { pull: r ? r.pull * k : 0, lift: r ? r.lift * k : 0, drop: r ? r.drop * k : 0 };
  }

  update(dt, elapsed) {
    const entity = this.controllerManager.getActiveEntity();
    const desiredPos = this._desiredPos;
    const desiredLook = this._desiredLook;

    if (this.userOrbitTimer > 0 && !this.isDragging) {
      this.userOrbitTimer = Math.max(0, this.userOrbitTimer - dt);
    }

    if (!this.isDragging && this.userOrbitTimer <= 0 && Math.abs(entity.speed) > 0.5) {
      this.orbitYawOffset -= Math.round(this.orbitYawOffset / (Math.PI * 2)) * (Math.PI * 2);
      this.orbitYawOffset += (0.0 - this.orbitYawOffset) * (1 - Math.exp(-dt * 2.2));
    }

    // The follow cameras pull back with speed, eased so that they drift back as the entity speeds up (and in as it
    // slows down); speedLag is about how far their former world-space smoothing left them trailing at 60 FPS
    this.smoothedSpeed += (Math.abs(entity.speed) - this.smoothedSpeed) * (1 - Math.exp(-dt * 3.0));
    const speedLag = this.smoothedSpeed * 0.1;

    // (Mog City) a car spun by a hit (angularVel: only a contact writes it, never the steering): the view rides through
    // it, keeping its line while the car turns under it, and comes round behind it after (SPIN_*); a teleport, a new
    // preset or another entity starts it afresh
    if (entity.type === 'car' && this.initialized && this.followEntity === entity && this.activePresetId === 'chase') {
      let s = (this._spin || 0) + (entity.angularVel || 0) * dt;
      s -= Math.sign(s) * Math.min(Math.abs(s) * (1 - Math.exp(-dt * SPIN_BLEED)), SPIN_RATE * dt);
      this._spin = Math.max(-SPIN_CAP, Math.min(SPIN_CAP, s));
    } else this._spin = 0;
    const totalYaw = entity.heading - this._spin + this.orbitYawOffset;
    // (Mog City: the screen upright, pk > 0: see PORT. Turned back to landscape: the lens as it was, at once)
    const pk = this.portK();
    if (!pk && this._port) {
      this._port = false;
      if (!this._lens) this.lensFov = null;
      this.camera.fov = this._lens && this.lensFov != null ? this.lensFov : this.getActivePreset().fov;
      this.camera.updateProjectionMatrix();
    }
    // (the quality tier's view distance: wagmi's phone and low tiers draw less of the far city, js/main.js)
    const farScale = window.NYC.quality?.farScale;
    if (farScale > 0 && farScale !== this._farScale) {
      this._farScale = farScale;
      this.camera.far = 60000 * farScale;
      this.camera.updateProjectionMatrix();
    }
    // (out of a car that sets its own lens: the preset's back)
    if (this._lens && !(this.activePresetId === 'chase' && entity.chase)) {
      this._lens = false;
      this._kick = 0;
      this.lensFov = null;
      this.camera.fov = this.getActivePreset().fov;
      this.camera.updateProjectionMatrix();
    }

    switch (this.activePresetId) {
      case 'chase': {
        // (Mog City: a car that frames itself, entity.chase: its own lens, a short pull back with speed instead of the
        // long one, and the lens widening with speed and more on the boost, so the car stays big and speed still reads;
        // its shake flat out, below)
        const ch = entity.chase;
        let dist = ch
          ? entity.chaseDistance * this.zoomMultiplier + ch.pull * this.smoothedSpeed
          : entity.chaseDistance * this.zoomMultiplier * (1 + Math.min(0.25, this.smoothedSpeed * 0.01));
        // (upright: a longer boom, higher, looking lower)
        const rig = pk ? this.portRig(entity, pk) : null;
        if (rig) dist *= 1 + rig.pull;
        let height = entity.chaseHeight * this.zoomMultiplier + Math.sin(this.orbitPitchOffset) * dist * 0.85;
        if (rig) height += rig.lift * this.zoomMultiplier;
        const horizDist = Math.cos(this.orbitPitchOffset) * dist + (ch ? 0 : speedLag);
        if (ch) {
          const kick = ch.kick * Math.min(1, this.smoothedSpeed / ch.vmax) + (entity.boosting ? ch.boostKick : 0);
          this._kick += (kick - this._kick) * (1 - Math.exp(-dt * (kick > this._kick ? 3.0 : 1.4)));
          this.lensFov = ch.fov + this._kick;
          this.camera.fov = this.lensFov;
          this.camera.updateProjectionMatrix();
          this._lens = true;
        }

        desiredPos.set(
          entity.position.x - Math.sin(totalYaw) * horizDist,
          Math.max(0.65, entity.position.y + height),
          entity.position.z - Math.cos(totalYaw) * horizDist
        );

        // (Mog City: ahead the way the camera faces round him, not the way he faces: dragged round to his front or
        // side, he stays in the middle of the frame)
        const lookUpBias = entity.type === 'helicopter' ? 0.2 : (entity.type === 'car' ? 0.52 : 1.55);
        desiredLook.set(
          entity.position.x + Math.sin(totalYaw) * 5.2,
          entity.position.y + entity.cameraTargetOffset.y + lookUpBias,
          entity.position.z + Math.cos(totalYaw) * 5.2
        );
        if (rig) desiredLook.y -= rig.drop;
        break;
      }

      case 'action': {
        const sideOffset = entity.type === 'car' ? 2.65 : (entity.type === 'helicopter' ? 4.2 : 0.95);
        const backDist = (entity.type === 'car' ? 3.6 : (entity.type === 'helicopter' ? 8.5 : 2.8)) + speedLag;
        const lowY = entity.type === 'helicopter' ? entity.position.y + 1.2 : entity.position.y + 0.92;

        desiredPos.set(
          entity.position.x - Math.sin(entity.heading) * backDist + Math.cos(entity.heading) * sideOffset,
          Math.max(0.55, lowY),
          entity.position.z - Math.cos(entity.heading) * backDist - Math.sin(entity.heading) * sideOffset
        );
        desiredLook.set(
          entity.position.x + Math.sin(entity.heading) * 3.2,
          entity.position.y + 1.05,
          entity.position.z + Math.cos(entity.heading) * 3.2
        );
        break;
      }

      case 'pov': {
        let fwdOffset = 0.35;
        let eyeY = 1.68;
        if (entity.type === 'car') {
          fwdOffset = 0.55;
          eyeY = 1.52;
        } else if (entity.type === 'cyclist') {
          fwdOffset = 0.35;
          eyeY = 1.55;
        } else if (entity.type === 'helicopter') {
          fwdOffset = 1.65;
          eyeY = 1.65;
        }

        desiredPos.set(
          entity.position.x + Math.sin(entity.heading) * fwdOffset,
          entity.position.y + eyeY,
          entity.position.z + Math.cos(entity.heading) * fwdOffset
        );
        desiredLook.set(
          entity.position.x + Math.sin(totalYaw) * 40.0,
          entity.position.y + eyeY + Math.sin(-this.orbitPitchOffset) * 18.0 + 1.5,
          entity.position.z + Math.cos(totalYaw) * 40.0
        );
        break;
      }

      case 'centralPark': {
        // Inside Central Park South looking across The Pond, Gapstow Bridge, The Mall, Sheep Meadow & UWS/UES Skylines
        const sway = Math.sin(elapsed * 0.22) * 3.5;
        desiredPos.set(-70.0 + sway, 14.0, -1425.0);
        desiredLook.set(-250.0, 6.5, -1690.0);
        break;
      }

      case 'fifthAve': {
        // 5th Avenue & 42nd St looking South down the 5th Ave canyon toward the Empire State Building
        const sway = Math.sin(elapsed * 0.25) * 1.8;
        desiredPos.set(0.0 + sway, 6.5, -20.0);
        desiredLook.set(-60.0, 150.0, 686.0);
        break;
      }

      case 'timesSquare': {
        // Times Square & Broadway looking across Duffy Square red steps and One Times Square billboards
        const sway = Math.sin(elapsed * 0.3) * 3.0;
        desiredPos.set(-603.0 + sway, 5.5, -290.0);
        desiredLook.set(-566.0, 40.0, -40.0);
        break;
      }

      case 'chryslerGCT': {
        // Park Ave & 42nd St intersection looking straight at Grand Central, MetLife, and Chrysler Building Crown
        const sway = Math.cos(elapsed * 0.22) * 2.5;
        desiredPos.set(300.0 + sway, 9.5, 95.0);
        desiredLook.set(470.0, 120.0, -50.0);
        break;
      }

      case 'observatory': {
        // Empire State Building 86th Floor Deck looking North-East across Midtown skyline
        const pan = Math.sin(elapsed * 0.18) * 80.0;
        desiredPos.set(-58.0, 322.0, 660.0);
        desiredLook.set(420.0 + pan, 150.0, -200.0);
        break;
      }

      case 'bryantPark': {
        // Inside Bryant Park Great Lawn looking East toward NYPL portico, One Vanderbilt & Chrysler Building
        const sway = Math.sin(elapsed * 0.25) * 1.5;
        const lawn = window.NYC.bryantParkLawn || { minX: -260, maxX: -150, minZ: 40, maxZ: 120, top: 1.3 };
        const lz = (lawn.minZ + lawn.maxZ) * 0.5;
        desiredPos.set(lawn.minX + 18.0, lawn.top + 1.7, lz + sway);
        desiredLook.set(lawn.maxX + 260.0, 70.0, lz - 60.0);
        break;
      }

      case 'waterfront': {
        // Over the shimmering East River looking across the FDR Drive, Queensboro Bridge & Midtown Skyline
        const drift = Math.sin(elapsed * 0.15) * 40.0;
        desiredPos.set(1640.0, 60.0, 60.0 + drift);
        desiredLook.set(150.0, 150.0, -150.0);
        break;
      }

      case 'drone': {
        const angle = elapsed * 0.07 + 0.65;
        const radius = 720.0 + Math.sin(elapsed * 0.23) * 140.0;
        const alt = 330.0 + Math.cos(elapsed * 0.19) * 90.0;
        desiredPos.set(
          Math.cos(angle) * radius + 60.0,
          alt,
          Math.sin(angle) * radius + 250.0
        );
        desiredLook.set(60.0, 160.0, 250.0);
        break;
      }
    }

    // (upright: the lens opened out, PORT; it is the lens for whatever sets the fov over the camera's too, lensFov:
    // wagmi/combat/camera.js)
    if (pk) {
      const f = portFov(this._lens && entity.chase ? entity.chase.fov + this._kick : this.getActivePreset().fov, this.camera.aspect);
      this.lensFov = f;
      this._port = true;
      if (Math.abs(this.camera.fov - f) > 1e-4) {
        this.camera.fov = f;
        this.camera.updateProjectionMatrix();
      }
    }

    if (!this.initialized || this.activePresetId === 'pov') {
      this.currentPos.copy(desiredPos);
      this.currentLookAt.copy(desiredLook);
      this.initialized = true;
      this.followEntity = null; // the follow cameras re-anchor from here
    } else if (this.activePresetId === 'chase' || this.activePresetId === 'action') {
      // Smoothed in the followed entity's frame rather than in world space. A world-space follower trails a moving
      // target by a distance that depends on the frame time (about speed x dt), so with uneven frame times the camera
      // surged back and forth behind an accelerating or fast car. Relative to the entity a steady drive keeps the
      // camera steady, while turns, orbit drags, zoom & the speed pull-back are still eased. The entity's height is
      // eased in world space (curbs, park lawns, jumps, the helicopter climbing).
      if (this.followEntity !== entity) {
        // preset or mode switch: start from where the camera is and glide over to the new framing
        this.followEntity = entity;
        this.followBaseY = entity.position.y;
        this.followOffset.subVectors(this.currentPos, entity.position);
        this.followLookOffset.subVectors(this.currentLookAt, entity.position);
      }
      const k = 1 - Math.exp(-dt * 8.5);
      this.followBaseY += (entity.position.y - this.followBaseY) * k;
      // (Mog City: eased round him in polar form, so a big swing keeps the boom's length)
      easePolar(this.followOffset, desiredPos.sub(entity.position), k);
      easePolar(this.followLookOffset, desiredLook.sub(entity.position), k);
      this.currentPos.set(entity.position.x, this.followBaseY, entity.position.z).add(this.followOffset);
      this.currentLookAt.set(entity.position.x, this.followBaseY, entity.position.z).add(this.followLookOffset);
      this.currentPos.y = Math.max(0.55, this.currentPos.y);
    } else {
      this.followEntity = null;
      const k = 1 - Math.exp(-dt * 8.5);
      this.currentPos.lerp(desiredPos, k);
      this.currentLookAt.lerp(desiredLook, k);
    }

    this.camera.position.copy(this.currentPos);
    this._look.copy(this.currentLookAt);
    if ((this.activePresetId === 'chase' || this.activePresetId === 'action') && this.followEntity === entity) this.keepInView(entity, dt);
    else this._view = null;
    // (Mog City: a car's own lens trembles a little flat out, from about its top speed up to its boost's: the speed
    // reads without the camera dropping back off it)
    const ch = this._lens && entity.chase;
    if (ch && ch.shake) {
      const k = Math.max(0, Math.min(1, (this.smoothedSpeed - ch.vmax * 0.7) / ((ch.vtop || ch.vmax * 1.6) - ch.vmax * 0.7)));
      if (k > 0) {
        const a = ch.shake * k * k, t = elapsed ?? performance.now() / 1000;
        this.camera.position.x += a * (Math.sin(t * 71.3) + 0.6 * Math.sin(t * 43.1)) * Math.cos(totalYaw);
        this.camera.position.z -= a * (Math.sin(t * 71.3) + 0.6 * Math.sin(t * 43.1)) * Math.sin(totalYaw);
        this.camera.position.y += a * (Math.sin(t * 59.7) + 0.5 * Math.sin(t * 97.9));
      }
    }
    this.camera.lookAt(this._look);
  }

  // The follow cameras never look at the player through a building nor sit inside one. The boom from his chest (the
  // car's roof) out to the lens is cut short where it would come within LENS_PAD of a building's collision box: in at
  // once, eased back out after. Cut down to next to nothing (backed against a wall, turning round in a corner), it
  // swings round him to the clearest way within reach, no faster than ~140 degrees a second, and back once straight
  // behind him is clear again; with no clear way at all it rises over him, looking down. (Only the camera moves: the
  // follow and orbit state are left as they are.)
  // the buildings' collision boxes within r of p, and (Mog City) the street's other things (this.blockers) and the
  // highways' cars (this.highway)
  nearBoxes(p, r, entity) {
    const near = this.controllerManager.nearColliders(p.x, p.z, r);
    const more = this.blockers ? this.blockers(p.x, p.z, r, entity) : null;
    const hwy = this.highway ? this.highwayBoxes(p.x, p.z, r) : null;
    // (the street's things marked: keepInView rises over the low ones, and its side probes look at the buildings only)
    if (more) for (const b of more) b.street = true;
    if (hwy) for (const b of hwy) b.street = true;
    const all = more && more.length ? near.concat(more) : near;
    return hwy && hwy.length ? all.concat(hwy) : all;
  }

  // (Mog City) the shore highways' cars within r of (x, z), as the city's cars are in createBlockers: on foot every
  // one, its box a little over its roof; driving, only one the lens is in or right at (else every car passing behind
  // him would pull the view in and let it out again). One up on the viaduct stands from its wheels, not the ground.
  highwayBoxes(x, z, r) {
    const out = this._hwBoxes;
    out.length = 0;
    const list = this.highway.near(x, z, r + 7, this._hwNear);
    if (!list.length) return out;
    const onFoot = this.controllerManager.activeMode !== 'car';
    const L = this.camera.position;
    for (const v of list) {
      const cs = Math.cos(v.yaw), sn = Math.sin(v.yaw), hx = v.hw, hz = v.hl;
      if (!onFoot) {
        const dx = L.x - v.x, dz = L.z - v.z;
        if (Math.abs(dx * cs - dz * sn) > hx + 1 || Math.abs(dx * sn + dz * cs) > hz + 1) continue;
      }
      const o = this._hwPool[out.length] || (this._hwPool[out.length] = { obb: { cx: 0, cz: 0, cs: 1, sn: 0, hx: 0, hz: 0 }, minX: 0, maxX: 0, minZ: 0, maxZ: 0, minY: 0, maxY: 0 });
      const b = o.obb;
      b.cx = v.x; b.cz = v.z; b.cs = cs; b.sn = sn; b.hx = hx; b.hz = hz;
      const ex = Math.abs(cs) * hx + Math.abs(sn) * hz, ez = Math.abs(sn) * hx + Math.abs(cs) * hz;
      o.minX = v.x - ex; o.maxX = v.x + ex; o.minZ = v.z - ez; o.maxZ = v.z + ez;
      o.minY = v.y - 0.3;
      o.maxY = v.y + (v.c ? v.c.roof || (v.c.kind === 'suv' ? 1.76 : 1.45) : 1.45) + (onFoot ? 0.6 : 0.1);
      out.push(o);
    }
    return out;
  }

  // (Mog City) how much of the line from p to q is clear of the buildings and the street's things (0 to 1; 1: all of
  // it): a cutscene's hand-back glides only while the line from him to the lens stays clear (wagmi/mission/cine.js)
  segClear(p, q, entity) {
    const x = q.x - p.x, y = q.y - p.y, z = q.z - p.z, L = Math.hypot(x, y, z);
    if (L < 1e-3) return 1;
    return rayClear(p, x / L, y / L, z / L, L, this.nearBoxes(p, L + 1, entity)) / L;
  }

  // (Mog City) the turn of the player (rad: the least there is) that puts the view behind him clear of all round him
  // at its full length; 0 when straight behind him already is, or in a car. A cutscene's hand-back turns him by it (a
  // van, a wall or the stage right at his back would have the view in it): wagmi/mission/cine.js release(). With face
  // (a world yaw: where he goes next), the clear way nearest it instead
  clearTurn(entity, face = null) {
    if (!entity || entity.type === 'car' || entity.type === 'helicopter') return 0;
    // (upright, the boom as update() makes it: see PORT)
    const rig = this.portK() ? this.portRig(entity) : null;
    const dist = entity.chaseDistance * (rig ? 1 + rig.pull : 1), height = entity.chaseHeight + Math.sin(0.09) * dist * 0.85 + (rig ? rig.lift : 0), horiz = Math.cos(0.09) * dist;
    const P = this._pivot.set(entity.position.x, entity.position.y + 1.45, entity.position.z);
    const near = this.nearBoxes(P, dist + 1, entity);
    const clearAt = (yaw) => {
      const h = entity.heading + yaw, x = -Math.sin(h) * horiz, y = entity.position.y + height - P.y, z = -Math.cos(h) * horiz, L = Math.hypot(x, y, z);
      return rayClear(P, x / L, y / L, z / L, L, near, LENS_PAD_FOOT) / L;
    };
    if (face != null && Number.isFinite(face)) {
      const t0 = wrapA(face - entity.heading);
      for (const o of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.35, -1.35]) if (clearAt(t0 + o) > 0.97) return wrapA(t0 + o);
    }
    let best = 0, bk = -1;
    for (const yaw of [0, ...SWINGS, Math.PI]) {
      const k = clearAt(yaw);
      if (k > 0.97) return yaw;
      if (k > bk + 0.05) { bk = k; best = yaw; }
    }
    return best;
  }

  keepInView(entity, dt) {
    const car = entity.type === 'car';
    const P = this._pivot.set(entity.position.x, entity.position.y + (car ? 1.15 : entity.type === 'helicopter' ? 1.0 : 1.45), entity.position.z);
    const cam = this.camera.position;
    const hx = cam.x - P.x;
    const hy = cam.y - P.y;
    const hz = cam.z - P.z;
    const L = Math.hypot(hx, hy, hz);
    if (L < 0.05) return;
    const v = this._view || (this._view = { boom: L, swing: 0, want: 0, lift: 0, over: 0, side: 0 });
    const minBoom = car ? 3.2 : 1.8;
    const pad = car ? LENS_PAD : LENS_PAD_FOOT;
    const near = this.nearBoxes(P, L + 3, entity);
    // the boom turned `yaw` about him (at the same height), and how far it is clear
    const dirAt = (yaw, out) => {
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      out.x = (hx * c + hz * s) / L;
      out.y = hy / L;
      out.z = (-hx * s + hz * c) / L;
      return out;
    };
    const d = this._desiredLook; // (free by now: a scratch vector)
    // (Mog City: and its far end lifted `up` m; how far along it is clear, as m of a boom L long)
    const clearAt = (yaw, up = 0) => {
      dirAt(yaw, d);
      if (!up) return rayClear(P, d.x, d.y, d.z, L, near, pad);
      const x = d.x * L, y = d.y * L + up, z = d.z * L, n = Math.hypot(x, y, z);
      return rayClear(P, x / n, y / n, z / n, n, near, pad) / n * L;
    };

    let free = clearAt(v.swing);
    // (Mog City) a low thing of the street's across the boom (a parked car, a car in traffic, a can: OVER_TOP): up
    // over it, by the least lift that clears it, rather than in close to him or round him
    let over = 0;
    const hb = rayHit;
    let overFree = L;
    if (free < L - 0.05 && hb && hb.street && hb.maxY - entity.position.y < OVER_TOP) {
      let bu = 0, bc = free;
      for (const up of OVER_LIFTS) { const c = clearAt(v.swing, up); if (c >= L - 0.05) { over = up; break; } if (c > bc) { bc = c; bu = up; } }
      // (none clears it all the way: the lift that gets furthest, coming in a little, if that beats pulling right in)
      if (!over && bu && bc >= minBoom + 0.5 && bc > free + 0.5) { over = bu; overFree = bc; }
    }
    v.over += (over - v.over) * (1 - Math.exp(-dt * (over > v.over ? 7 : 2)));
    if (over) free = overFree;
    // (Mog City) a wall alongside the lens, the boom clear but a facade filling a side of the frame: the view edges
    // away from it (on foot, or a car all but stopped: driving, it never swings round)
    let bias = 0;
    if (!car || Math.abs(entity.speed) < 4) {
      dirAt(v.swing, d);
      const lens = this._side || (this._side = new THREE.Vector3());
      lens.set(P.x + d.x * v.boom, P.y + d.y * v.boom + v.lift + v.over, P.z + d.z * v.boom);
      const va = Math.atan2(-d.x, -d.z);
      const half = Math.atan(Math.tan(this.camera.fov * Math.PI / 360) * this.camera.aspect);
      const A = Math.max(SIDE_A, half + 15 * Math.PI / 180);
      for (const s of [1, -1]) {
        const a = va + s * A, t = rayClear(lens, Math.sin(a), 0, Math.cos(a), SIDE, near, 0, true);
        if (t < SIDE) bias += s * SIDE_MAX * Math.sqrt(1 - t / SIDE);
      }
    }
    v.side += (Math.max(-SIDE_MAX, Math.min(SIDE_MAX, bias)) - v.side) * (1 - Math.exp(-dt * 4));
    let best = free; // (the clearest way there is: with none, it may rise right over him)
    if (over || (v.swing === v.side ? free >= minBoom : clearAt(v.side) >= Math.min(L, minBoom + 0.6))) v.want = v.side;
    else if (free < minBoom && (!car || Math.abs(entity.speed) < 4)) { // (driving, it only pulls in: no swinging round)
      let top = -Infinity;
      for (const yaw of SWINGS) {
        const clear = Math.min(clearAt(yaw), L);
        const score = clear - 0.35 * Math.abs(yaw - v.swing);
        if (clear > best) best = clear;
        if (score > top) { top = score; v.want = yaw; }
      }
    }
    if (v.want !== v.swing) {
      v.swing += Math.max(-2.4 * dt, Math.min(2.4 * dt, v.want - v.swing));
      if (Math.abs(v.swing) < 1e-3) v.swing = 0;
      free = over ? Math.max(clearAt(v.swing, over), Math.min(L, v.boom)) : clearAt(v.swing);
    }
    const reach = Math.min(free, L);
    v.boom = reach < v.boom ? reach : v.boom + (reach - v.boom) * (1 - Math.exp(-dt * 2.5));
    // (over his head while it swings round; right up over him only when there is no clear way round at all)
    const lift = v.boom < minBoom ? Math.min(best < minBoom ? 2.4 : 0.9, (minBoom - v.boom) * 1.25) : 0;
    v.lift += (lift - v.lift) * (1 - Math.exp(-dt * (lift > v.lift ? 6 : 2)));

    dirAt(v.swing, d);
    cam.set(P.x + d.x * v.boom, P.y + d.y * v.boom + v.lift + v.over, P.z + d.z * v.boom);
    // ...looking more at him the further round and up it has gone (risen over him: down at his feet); on foot, and pulled
    // in close, more at him than past him too (else his head drops out of the bottom of the frame)
    // (risen over a car: down at him, so he stays in the frame's middle, not its bottom edge)
    const turn = Math.max(Math.min(1, Math.abs(v.swing) / 1.2) * 0.85, car ? 0 : Math.min(0.75, Math.max(0, 1 - v.boom / L) * 1.3), Math.min(0.8, v.over * 0.32));
    if (turn > 0) this._look.lerp(P, turn);
    if (v.over > 0.05) this._look.y -= Math.min(0.6, v.over * 0.25);
    const up = Math.min(1, v.lift / 1.6);
    if (up > 0) {
      const fx = Math.sin(entity.heading);
      const fz = Math.cos(entity.heading);
      this._look.lerp(d.set(P.x + fx * 0.8, entity.position.y + 0.2, P.z + fz * 0.8), up * 0.85);
    }
  }
}

Object.assign(window.NYC, { CAMERA_PRESETS, CameraSystem });
})();
