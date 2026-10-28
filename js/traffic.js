(function () {
// js/traffic.js
// Manhattan traffic and pedestrians on the road graph road-network.js derives from the city as built:
// - 250 cars (taxis, sedans, SUVs, NYPD cruisers) and 32 MTA buses keep to their lanes and follow the vehicle
//   ahead (Intelligent Driver Model), change lanes to overtake or to reach a turn lane, turn into other streets,
//   stop for the signals street-details.js shows, give way to oncoming traffic when turning left, to the avenue at
//   unsignalized corners and to pedestrians on crosswalks, and never enter an intersection they can't clear.
// - 340 pedestrians stroll the sidewalks and cross at signalized crosswalks on the WALK signal.
// - Vehicles and pedestrians are only ever moved while out of the camera's view, so nothing pops in or out (Mog City:
//   or behind a building; far cars are recycled round the player, the roads round the corners ahead first: ported from
//   Slop New York by Mr.doob, MIT, commit 7fdaf15).
// - The player's vehicle or character pushes and is pushed by the traffic (SAT contact, impulses, sparks).

const { THREE, buildRoadNetwork, signalPhase, walkSignal } = window.NYC;
const {
  cityUniforms,
  createContactShadowMaterial,
  createCarFlareMaterial,
  HEADLIGHTS,
  createVehicleHeadlight,
  placeVehicleHeadlight
} = window.NYC;
const {
  CAR_PARTS,
  BODY_SPECS,
  BUS_SPEC,
  buildCarGeometry,
  buildCarProxyGeometry,
  buildSteerableWheelGeo,
  createLoftedCarMaterial,
  buildLightbarGeometry,
  createLightbarMaterial,
  buildLoftedBusBodyGeometry,
  buildBusSignGeometry,
  buildBusWheelGeo,
  createBusWheelMaterial,
  createLoftedBusMaterial
} = window.NYC;
const { PersonCrowd, PersonRig } = window.NYC;
const { mergeGeometries } = window.NYC.Addons;

// (Mog City: these are the high graphics tier's; createTrafficSystem takes the tier's own from window.NYC.quality)
const DEFAULT_NUM_CARS = 250; // (Mog City: was 200, side streets stood empty)
const DEFAULT_NUM_BUSES = 24; // (Mog City: 32 bunched into columns and walls of buses round the player)
const DEFAULT_NUM_PEDS = 340;
const DEFAULT_HEADLIGHTS = 96;

// Intelligent Driver Model: max acceleration, comfortable braking, time headway, standstill gap; and the sideways
// acceleration drivers accept in bends, which sets how fast they take each turn or lane shift
const CAR_DRIVER = { a: 2.0, b: 3.0, T: 1.2, s0: 2.0, aLat: 3.5 };
const BUS_DRIVER = { a: 1.1, b: 2.5, T: 1.5, s0: 2.5, aLat: 2.0 };
const LOOKAHEAD = 70; // metres a driver looks ahead for vehicles, stop lines and signals

// Vehicles further than VEHICLE_RADIUS from the camera and out of its view move to a free lane 100-300 m away,
// also out of view; pedestrians likewise beyond PED_RADIUS, to 60-260 m away. After a teleport, everything
// further than NEAR_RADIUS is placed around the new spot. (Mog City, ported from Slop New York by Mr.doob, MIT, commit
// 7fdaf15: a few vehicles a frame, round the whole pool, so the far ones always come back and the roads ahead of a
// driver don't empty; to 100-350 m away, the roads round the corners ahead first. Out of view here means out of the
// frustum or behind a building; upstream also lets a car be placed in plain view further than FAR_VIEW_SPAWN m from
// the camera (250), which fills the road ahead a little more, but a car can be seen appearing; here never)
const VEHICLE_RADIUS = 380;
const PED_RADIUS = 320;
const NEAR_RADIUS = 350;
const FAR_VIEW_SPAWN = Infinity;
// A vehicle that has stood still this long (s, longer than a red and the queue behind it) is in a jam: out of view it is
// put somewhere else. Buses are placed at least BUS_SPACING m from one another.
const JAM_WAIT = 20; // (Mog City: was 45: a jam out of view clears sooner)
const BUS_SPACING = 110;

function createBusDestinationTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0c0f14';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#0058b8';
  ctx.fillRect(6, 8, 62, 48);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 26px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('M1', 37, 33);
  ctx.fillStyle = '#ff9d1c';
  ctx.font = '800 22px JetBrains Mono, monospace';
  ctx.textAlign = 'left';
  ctx.fillText('5 AV / HARLEM', 78, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function createTrafficSystem(scene, sidewalks, obstacles) {
  // (Mog City) the graphics tier's traffic (main.js): fewer cars, buses, pedestrians and headlight spots on the
  // phone and low tiers, and no pedestrians at all on WebGL2 (their poses are read from a storage buffer per instance)
  const quality = window.NYC.quality || {};
  const NUM_CARS = quality.cars ?? DEFAULT_NUM_CARS;
  const NUM_BUSES = quality.buses ?? DEFAULT_NUM_BUSES;
  const NUM_PEDS = quality.peds ?? DEFAULT_NUM_PEDS;

  const group = new THREE.Group();
  group.name = 'ManhattanTrafficAndPedestrians';

  const dummy = new THREE.Object3D();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const unitPlane = new THREE.PlaneGeometry(1, 1);
  unitPlane.rotateX(-Math.PI * 0.5);
  const contactShadowMat = createContactShadowMaterial();

  // =========================================================================
  // 0. ROAD NETWORK
  // =========================================================================
  const network = buildRoadNetwork(sidewalks, obstacles);
  const { nodes, edges, connector, curvePoint, walkable, onSidewalk } = network;

  // Sides of an intersection (road-network.js step 9): a grid intersection's are 0 east, 1 west, 2 south, 3 north;
  // centreline junctions number their arms from 4. Where lane i of edge e meets a crosswalk, measured along the
  // crosswalk: along its road's lateral axis (x across north-south roads, z across east-west ones)
  const laneCoord = (e, i) => (e.sx + e.rx * e.lanes[i]) * e.clx + (e.sz + e.rz * e.lanes[i]) * e.clz;

  for (const n of nodes) {
    n.box = new Array(n.groupCount).fill(0); // vehicles crossing it from each road (group: on the grid avenue 0, street 1)
    n.crossing = new Array(n.sideCount).fill(0); // vehicles crossing (or about to cross) the crosswalk on each side
    n.approach = new Array(n.sideCount).fill(null); // the edge arriving over each side's crosswalk
    n.road = new Array(n.sideCount).fill(null); // an edge arriving or leaving over each side's crosswalk: the road it spans
    n.walkers = []; // pedestrians on its crosswalks
    n.curb = []; // pedestrians at the curbs of its crosswalks, standing or about to (who to queue behind)
  }
  for (const e of edges) {
    e.occ = e.lanes.map(() => []); // vehicles in each lane, sorted by position
    // e.inSide / e.outSide: the crosswalks crossed on the way into e.to / out of e.from; e.axisIndex: its group at e.to;
    // e.opposite: the oncoming edge of its road there (road-network.js)
    e.to.approach[e.inSide] = e;
    e.to.road[e.inSide] = e.from.road[e.outSide] = e;
    e.through = 0; // vehicles from e crossing e.to straight on or to the right
    e.lefts = 0; // and to the left
    e.mx = e.sx + e.dx * e.len * 0.5;
    e.mz = e.sz + e.dz * e.len * 0.5;
  }
  // Is the intersection box held by vehicles of any road but group g's?
  const boxBusy = (n, g) => {
    for (let k = 0; k < n.box.length; k++) if (k !== g && n.box[k] > 0) return true;
    return false;
  };

  // =========================================================================
  // 1. 3D LOFTED NYC YELLOW TAXIS, SEDANS, SUVS & NYPD CRUISERS (250 VEHICLES)
  // =========================================================================
  function createVehicle(bus, half, halfWidth, axle, driver, v0) {
    return {
      bus, half, halfWidth, axle, driver, v0,
      edge: null, lane: 0, s: 0, speed: 0, acc: 0, gap: Infinity, leaderSpeed: 0,
      move: null, out: 0, conn: null, cs: 0, trail: null, commit: null, claimed: false, yielding: false, yieldAt: 0,
      wait: 0, laneTimer: Math.random() * 0.5, blocked: 0,
      dl: 0, dlv: 0, blink: 0, blinkPhase: Math.random() * 0.8,
      x: 0, z: 0, prevX: 0, prevZ: 0, tx: 0, tz: 1, nose: 0, yaw: 0, yawRate: 0, steer: 0,
      pitch: 0, roll: 0, pitchVel: 0, rollVel: 0, vx: 0, vz: 0, yawOffset: 0, yawVel: 0,
      pAhead: Infinity, pRight: 0, pSpeed: 0, wheelSpin: Math.random() * Math.PI * 2
    };
  }

  // Build 3 distinct 3D LoftGeometry vehicle classes (Taxi, Sedan/NYPD, SUV) with separate spinning 3D wheels
  const taxiGeo = buildCarGeometry(BODY_SPECS.taxi, false);
  const sedanGeo = buildCarGeometry(BODY_SPECS.sedan, false);
  const suvGeo = buildCarGeometry(BODY_SPECS.suv, false);
  const carWheelLeftGeo = buildSteerableWheelGeo(BODY_SPECS.sedan, -1);
  const carWheelRightGeo = buildSteerableWheelGeo(BODY_SPECS.sedan, 1);

  const taxiMat = createLoftedCarMaterial(BODY_SPECS.taxi);
  const sedanMat = createLoftedCarMaterial(BODY_SPECS.sedan);
  const suvMat = createLoftedCarMaterial(BODY_SPECS.suv);
  const carWheelMat = createLoftedCarMaterial(BODY_SPECS.sedan, 0xffbe14);

  const taxiYellow = new THREE.Color(0xffbe14);
  const nypdWhite = new THREE.Color(0xf6f9fc);
  const sedanPalette = [
    new THREE.Color(0x1c2026), // Black Town Car / Uber
    new THREE.Color(0xcfd6de), // Metallic Silver Sedan
    new THREE.Color(0x1d3b6c), // Deep Navy Sedan
    new THREE.Color(0x52575e), // Graphite Grey Sedan
    new THREE.Color(0x6e1f24)  // Burgundy Sedan
  ];
  const suvPalette = [
    new THREE.Color(0x16191e), // Executive Black Escalade/Suburban
    new THREE.Color(0xf0f3f7), // Pearl White SUV
    new THREE.Color(0x3a434d), // Slate Metallic SUV
    new THREE.Color(0x28382e), // Forest Green SUV
    new THREE.Color(0xbec6cf)  // Silver SUV
  ];

  const cars = [];
  let taxiCount = 0;
  let sedanCount = 0;
  let suvCount = 0;
  let nypdCount = 0;

  for (let i = 0; i < NUM_CARS; i++) {
    // (Mog City, after Slop New York 3f5bcda, a1866b7: police 1 in 40, a few in sight, so a siren is an event, and
    // taxis 1 in 5; were 1 in 10 and 4 in 7. Upstream went on to 1 in 100, 7540282)
    const isNYPD = (i % 40) === 6;
    const isTaxi = !isNYPD && (i % 5) === 0;
    const isSUV = !isNYPD && !isTaxi && (i % 2 === 0);

    let bodyType = 'sedan';
    let col;

    if (isTaxi) {
      bodyType = 'taxi';
      taxiCount++;
      col = taxiYellow;
    } else if (isSUV) {
      bodyType = 'suv';
      suvCount++;
      col = suvPalette[i % suvPalette.length];
    } else {
      sedanCount++;
      col = isNYPD ? nypdWhite : sedanPalette[i % sedanPalette.length];
      if (isNYPD) nypdCount++;
    }

    const car = createVehicle(false, isSUV ? 2.3 : 2.25, isSUV ? 0.92 : 0.86, isSUV ? 1.4 : 1.38, CAR_DRIVER, 10 + (i % 5) * 0.9);
    // paint as float32 values, so renderCar() can tell whether an instance slot's paint changes by comparing
    const paint = [Math.fround(col.r), Math.fround(col.g), Math.fround(col.b)];
    Object.assign(car, { isTaxi, isNYPD, isSUV, bodyType, paint });
    cars.push(car);
  }

  // Per body type: the full model (with separately instanced spinning wheels near the camera) and, beyond
  // CAR_PROXY_DISTANCE, the ~250-triangle stand-in. Instance slots are handed out every frame to the cars the camera
  // can see (or whose shadow it may see), see renderCar(). Per-instance paint & lamp / livery state the car material
  // reads: brake lights, left (+x) & right (-x) turn signals, livery (1 = NYPD).
  const bodies = {};
  for (const [kind, geo, count, mat] of [['taxi', taxiGeo, taxiCount, taxiMat], ['sedan', sedanGeo, sedanCount, sedanMat], ['suv', suvGeo, suvCount, suvMat]]) {
    const n = Math.max(1, count);
    const lodMesh = (g) => {
      g.setAttribute('paintColor', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
      g.setAttribute('carState', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
      return new THREE.InstancedMesh(g, mat, n);
    };
    bodies[kind] = { near: lodMesh(geo), far: lodMesh(buildCarProxyGeometry(BODY_SPECS[kind])) };
  }
  const bodyMeshes = Object.values(bodies).flatMap((b) => [b.near, b.far]);

  const carWheelLeftInst = new THREE.InstancedMesh(carWheelLeftGeo, carWheelMat, NUM_CARS * 2);
  const carWheelRightInst = new THREE.InstancedMesh(carWheelRightGeo, carWheelMat, NUM_CARS * 2);

  // 3D Collision Spark & Debris Particle Pool
  const MAX_SPARKS = 120;
  const sparkGeo = new THREE.BoxGeometry(0.038, 0.038, 0.26);
  const sparkMat = new THREE.MeshBasicNodeMaterial({ color: 0xffc438 });
  const sparkInst = new THREE.InstancedMesh(sparkGeo, sparkMat, MAX_SPARKS);
  const sparks = [];
  let sparkCursor = 0;
  for (let s = 0; s < MAX_SPARKS; s++) {
    sparks.push({ x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.4 });
  }
  function spawnCollisionSparks(x, y, z, nx, nz, impactSpeed) {
    const count = Math.min(24, Math.max(8, Math.floor(impactSpeed * 1.4)));
    const tx = -nz;
    const tz = nx;
    for (let k = 0; k < count; k++) {
      const sp = sparks[sparkCursor];
      sparkCursor = (sparkCursor + 1) % MAX_SPARKS;
      const spread = (Math.random() - 0.5) * 2.2;
      const outBoost = (0.3 + Math.random() * 0.9) * Math.min(14.0, impactSpeed * 0.65);
      const tanBoost = spread * Math.min(12.0, impactSpeed * 0.55);
      sp.x = x + (Math.random() - 0.5) * 0.35;
      sp.y = y + (Math.random() - 0.5) * 0.18;
      sp.z = z + (Math.random() - 0.5) * 0.35;
      sp.vx = nx * outBoost + tx * tanBoost;
      sp.vy = 2.4 + Math.random() * 5.4;
      sp.vz = nz * outBoost + tz * tanBoost;
      sp.maxLife = 0.28 + Math.random() * 0.24;
      sp.life = sp.maxLife;
    }
  }

  // NYPD roof light bars (the blue & white livery is painted by the sedan material from the instance's carState)
  const nypdBarInst = new THREE.InstancedMesh(buildLightbarGeometry(BODY_SPECS.sedan), createLightbarMaterial(), Math.max(1, nypdCount));
  const carShadowInst = new THREE.InstancedMesh(unitPlane, contactShadowMat, NUM_CARS);
  carShadowInst.renderOrder = 998;

  for (const m of bodyMeshes) m.castShadow = m.receiveShadow = true;
  nypdBarInst.castShadow = true;
  carWheelLeftInst.castShadow = carWheelLeftInst.receiveShadow = true;
  carWheelRightInst.castShadow = carWheelRightInst.receiveShadow = true;

  group.add(
    ...bodyMeshes,
    carWheelLeftInst,
    carWheelRightInst,
    sparkInst,
    nypdBarInst
  );

  // =========================================================================
  // 2. LOFTED MTA SELECT BUS SERVICE BLUE & WHITE CITY BUSES (32 BUSES)
  // =========================================================================
  const busBodyGeo = buildLoftedBusBodyGeometry();
  // Per-instance lamp state the bus material reads: brake lights, left (+x) & right (-x) turn signals (renderBus)
  const busStates = new THREE.InstancedBufferAttribute(new Float32Array(NUM_BUSES * 4), 4);
  busBodyGeo.setAttribute('busState', busStates);
  // Destination signs above the windshield, by the front door & above the rear window
  const busHeaderGeo = buildBusSignGeometry();

  const busBodyMat = createLoftedBusMaterial();
  const busDestMat = new THREE.MeshBasicNodeMaterial({
    map: createBusDestinationTexture()
  });

  const busWheelMat = createBusWheelMaterial();
  const busBodyInst = new THREE.InstancedMesh(busBodyGeo, busBodyMat, NUM_BUSES);
  const busHeaderInst = new THREE.InstancedMesh(busHeaderGeo, busDestMat, NUM_BUSES);
  const busWheelLeftInst = new THREE.InstancedMesh(buildBusWheelGeo(-1), busWheelMat, NUM_BUSES * 2);
  const busWheelRightInst = new THREE.InstancedMesh(buildBusWheelGeo(1), busWheelMat, NUM_BUSES * 2);
  const busShadowInst = new THREE.InstancedMesh(unitPlane, contactShadowMat, NUM_BUSES);
  busShadowInst.renderOrder = 998;

  busBodyInst.castShadow = busBodyInst.receiveShadow = true;
  busWheelLeftInst.castShadow = busWheelLeftInst.receiveShadow = true;
  busWheelRightInst.castShadow = busWheelRightInst.receiveShadow = true;

  const buses = [];
  for (let i = 0; i < NUM_BUSES; i++) buses.push(createVehicle(true, 6.0, 1.3, 3.6, BUS_DRIVER, 8 + (i % 3)));
  const vehicles = [...cars, ...buses];
  // (the body as drawn, for keeping vehicles out of one another: half length & width)
  vehicles.forEach((v, i) => {
    v.id = i;
    v.bodyL = v.bus ? 5.72 : v.isSUV ? 2.22 : 2.18;
    v.bodyW = v.halfWidth;
  });
  group.add(busBodyInst, busHeaderInst, busWheelLeftInst, busWheelRightInst);

  // =========================================================================
  // 3. SKINNED, PROCEDURALLY ANIMATED SIDEWALK PEDESTRIANS (340 PEDESTRIANS, see pedestrians.js)
  // =========================================================================
  // One instanced draw per level of detail; every pedestrian has a PersonRig that plants its footsteps on the
  // sidewalk (no sliding), with their own build, height, sex, hair, clothes and gait
  const pedCrowd = NUM_PEDS > 0 ? new PersonCrowd(NUM_PEDS) : null;
  const hash = (i, salt) => {
    const v = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const peds = [];
  for (let i = 0; i < NUM_PEDS; i++) {
    const female = hash(i, 1) < 0.48;
    const hairRoll = hash(i, 2);
    peds.push({
      placed: false,
      crossesStreets: i % 6 === 0, // walks back and forth over a signalized crosswalk
      x: 0,
      z: 0,
      ax: 0, // track: start, direction, length; position along it and walking direction
      az: 0,
      ux: 0,
      uz: 1,
      len: 1,
      t: 0,
      dir: 1,
      node: null, // the intersection of its crosswalk, which side of it, where along it
      side: 0,
      coord: 0,
      line: 0, // its line over the crosswalk, off the centre line
      waiting: false,
      speed: 1.22 + (i % 5) * 0.1 + hash(i, 3) * 0.08, // preferred walking speed
      v: 0, // current speed, easing up to it and down to stops
      pause: 0, // turning round at the end of the track
      rig: new PersonRig({
        seed: i * 1.6180339 + 0.13,
        female,
        scale: (female ? 0.91 : 0.97) + hash(i, 4) * 0.1,
        girth: 0.9 + hash(i, 5) * 0.24,
        hair: female ? (hairRoll < 0.68 ? 1 : 0.3 + hairRoll * 0.25) : hairRoll < 0.08 ? 1 : hairRoll * 0.35,
        armSwing: 0.75 + hash(i, 6) * 0.5,
        stride: 0.94 + hash(i, 7) * 0.12
      })
    });
  }
  if (pedCrowd) group.add(...pedCrowd.meshes);

  // Add vehicle contact shadows last + pre-allocated Clustered SpotLight / PointLight pools
  group.add(carShadowInst, busShadowInst);

  const HEADLIGHT_POOL_SIZE = quality.headlights ?? DEFAULT_HEADLIGHTS;
  const NYPD_LIGHT_POOL_SIZE = 6;
  const MAX_LIGHT_DIST = 115;
  const MAX_LIGHT_DIST_SQ = MAX_LIGHT_DIST * MAX_LIGHT_DIST;
  const DUAL_BEAM_DIST_SQ = 96 * 96;
  const DUAL_BEAM_MAX_VEHICLES = 44;

  const trafficLightsGroup = new THREE.Group();
  trafficLightsGroup.name = 'TrafficClusteredLights';
  group.add(trafficLightsGroup);

  const headlightPool = [];
  for (let i = 0; i < HEADLIGHT_POOL_SIZE; i++) {
    const spot = createVehicleHeadlight();
    spot.position.set(0, -1000, 0);
    spot.target.position.set(0, -1001, 0);
    trafficLightsGroup.add(spot, spot.target);
    headlightPool.push(spot);
  }

  const nypdLightPool = [];
  for (let i = 0; i < NYPD_LIGHT_POOL_SIZE; i++) {
    const pt = new THREE.PointLight(0xff1828, 0, 12.0, 1.25);
    pt.position.set(0, -1000, 0);
    trafficLightsGroup.add(pt);
    nypdLightPool.push(pt);
  }

  // Nothing shows until it has been placed
  const carInstances = [...bodyMeshes, carWheelLeftInst, carWheelRightInst, nypdBarInst, carShadowInst];
  const busInstances = [busBodyInst, busHeaderInst, busWheelLeftInst, busWheelRightInst, busShadowInst];
  for (const inst of [...carInstances, ...busInstances, sparkInst]) {
    inst.frustumCulled = false;
    for (let i = 0; i < inst.count; i++) inst.setMatrixAt(i, zero);
  }

  scene.add(group);

  // =========================================================================
  // 4. WHO IS WHERE: LANE OCCUPANCY, INTERSECTIONS, VIEW, PLAYER
  // =========================================================================
  let clock = 0;
  let tick = 0; // (Mog City: update()s so far: place() stamps a vehicle with it, one owner per vehicle per frame)
  let avePhase = 'green';
  let stPhase = 'red';
  let aveWalk = true;
  let stWalk = false;
  const phaseOf = (e) => (e.axisIndex === 0 ? avePhase : stPhase);
  let focusX = 0;
  let focusZ = 140;
  const player = { active: false, entity: null, x: 0, z: 0, vx: 0, vz: 0, halfW: 0.86, halfL: 2.18, push: 0.5 };
  // (Mog City: Dan's car, parked where he left it while he is on foot. The traffic brakes for it, goes round it and
  // is pushed off it like off the player, but never moves it)
  const parked = { active: false, x: 0, z: 0, yaw: 0, halfW: 0.95, halfL: 2.25 };
  // (Mog City: the game's own moving cars, a chase's (wagmi/pursuit): { x, z, yaw, halfW, halfL, vx, vz } kept up to
  // date by the game in trafficSystem.blockers. The traffic brakes for them and goes round them as for the parked car)
  const blockers = [];
  // (Mog City: Dan's car's body for the traffic's moves: never driven into, see blockedAhead and separate)
  const playerBody = { on: false, x: 0, z: 0, yaw: 0, yawOffset: 0, bodyW: 1, bodyL: 2.4 };
  let gapSpeed = 0; // the speed of whatever playerGap() last found nearest ahead (the player, or 0: the parked car)

  // Lane lists hold pooled { v, s } entries sorted by position s along the lane, rebuilt every frame
  const pool = [];
  let poolUsed = 0;
  const filled = [];
  function occupy(list, v, s) {
    let o = pool[poolUsed++];
    if (!o) pool.push((o = { v: null, s: 0 }));
    o.v = v;
    o.s = s;
    if (!list.length) filled.push(list);
    list.push(o);
    for (let k = list.length - 1; k > 0 && list[k - 1].s > s; k--) {
      list[k] = list[k - 1];
      list[k - 1] = o;
    }
  }

  // Half way through a lane change a vehicle still occupies the lane it is leaving (-1 left, 1 right)
  function straddle(v) {
    if (v.conn) return 0;
    if (v.dl > 0.5 && v.lane + 1 < v.edge.lanes.length) return 1;
    if (v.dl < -0.5 && v.lane > 0) return -1;
    return 0;
  }

  // A vehicle crossing an intersection, or committed to crossing it, holds it against crossing traffic and
  // pedestrians on the crosswalks it passes, and its place in the lane it heads for. The counters it raises are reset
  // next frame for just the nodes and edges touched (a few hundred out of thousands)
  const touchedNodes = [];
  const touchedEdges = [];
  const touchNode = (n) => {
    if (!n.touched) {
      n.touched = true;
      touchedNodes.push(n);
    }
    return n;
  };
  const touchEdge = (e) => {
    if (!e.touched) {
      e.touched = true;
      touchedEdges.push(e);
    }
    return e;
  };
  function claim(v) {
    if (v.claimed) return;
    v.claimed = true;
    const e = v.edge;
    const f = v.move.to;
    touchNode(e.to).box[e.axisIndex]++;
    if (!v.conn || v.cs < v.half + 2.5) e.to.crossing[e.inSide]++; // until its tail is past the crosswalk on its way in
    if (v.move.turn !== 'L') touchEdge(e).through++;
    if (!v.yielding) cross(v);
    occupy(f.occ[v.out], v, v.conn ? v.cs - v.conn.len : v.s - e.len - connector(e, v.lane, f, v.out).len);
  }

  // ...and, unless still waiting inside to turn left, the oncoming lanes and the crosswalk on its way out
  function cross(v) {
    const e = v.edge;
    if (v.move.turn === 'L') touchEdge(e).lefts++;
    touchNode(e.to).crossing[v.move.to.outSide]++;
    v.yielding = false;
  }

  function buildOccupancy() {
    for (const list of filled) list.length = 0;
    filled.length = 0;
    poolUsed = 0;
    for (const n of touchedNodes) {
      n.box.fill(0);
      n.crossing.fill(0);
      n.touched = false;
    }
    touchedNodes.length = 0;
    for (const e of touchedEdges) {
      e.through = e.lefts = 0;
      e.touched = false;
    }
    touchedEdges.length = 0;
    for (const v of vehicles) v.claimed = false;
    for (const v of vehicles) {
      const e = v.edge;
      if (!e) continue;
      // (Mog City: a wreck slid clear of its lane, its middle 2.7 m or more to one side of the lane's, no longer holds
      // its place in it: those behind drive on by, blockedAhead keeping them out of it)
      if (v.wreck && !v.conn && Math.abs((v.x - e.sx) * e.rx + (v.z - e.sz) * e.rz - e.lanes[v.lane]) > 2.7) continue;
      if (!v.conn) {
        occupy(e.occ[v.lane], v, v.s);
        const side = straddle(v);
        if (side) occupy(e.occ[v.lane + side], v, v.s);
        if (v.commit === e.to) claim(v);
        if (v.s < v.half) touchNode(e.from).crossing[e.outSide]++; // its tail still over the crosswalk behind it
      } else {
        claim(v);
        occupy(e.occ[v.lane], v, e.len + v.cs); // until it is out of the intersection, still ahead of those behind it
      }
    }
  }

  // The camera's view, to move things only where it can't see
  const frustum = new THREE.Frustum();
  const viewProjection = new THREE.Matrix4();
  let hasView = false;
  let camX = 0;
  let camY = 10;
  let camZ = 140;
  let camFwdX = 0;
  let camFwdZ = 1;
  function updateView(camera) {
    hasView = !!camera;
    if (!camera) return;
    camera.updateMatrixWorld();
    camX = camera.position.x;
    camY = camera.position.y;
    camZ = camera.position.z;
    const me = camera.matrixWorld.elements;
    camFwdX = -me[8];
    camFwdZ = -me[10];
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjection);
  }
  // Could the camera see a sphere of radius r around ground point (x, z)? Side planes only: the near and far
  // planes depend on depth conventions, and the side planes alone already rule out everything behind the camera.
  function visible(x, z, r) {
    if (!hasView) return false;
    for (let k = 0; k < 4; k++) {
      const { normal, constant } = frustum.planes[k];
      if (normal.x * x + normal.y + normal.z * z + constant < -r) return false;
    }
    return true;
  }

  // Edges and signalized intersections around the focus, to place vehicles and pedestrians on
  const nearEdges = [];
  // (Mog City: hold zones, rects { minX, maxX, minZ, maxZ } a cutscene keeps clear: nothing is placed in one, no
  // car turns onto a road through one, a car or pedestrian found in one is put somewhere else out of view, and
  // pedestrians turn back at its edge. hold([...]) sets them, hold([]) lets the traffic back)
  const holds = [];
  let heldEdges = new Set();
  const held = (x, z, m = 0) => {
    for (const r of holds) if (x > r.minX - m && x < r.maxX + m && z > r.minZ - m && z < r.maxZ + m) return true;
    return false;
  };
  function hold(rects = []) {
    holds.length = 0;
    holds.push(...rects);
    heldEdges = new Set();
    if (!holds.length) return;
    // (a road is held when any of its roadway, curb to curb, is in one)
    for (const e of edges) {
      const half = e.half || 3;
      test: for (let s = 0; s <= e.len + 2; s += 3) {
        const t = Math.min(s, e.len);
        for (const lat of [-half, 0, half]) {
          if (held(e.sx + e.dx * t + e.rx * lat, e.sz + e.dz * t + e.rz * lat, 0.5)) { heldEdges.add(e); break test; }
        }
      }
    }
    // (a car not yet committed to its turn onto a held road picks another its lane allows)
    for (const v of vehicles) {
      if (!v.edge || v.conn || v.claimed || v.commit || !v.move || !heldEdges.has(v.move.to)) continue;
      const m = chooseMove(v, true);
      if (m && m.out[v.lane] >= 0) v.move = m;
    }
  }
  const nearSignals = [];
  let nearX = Infinity;
  let nearZ = Infinity;
  // (Mog City, from 7fdaf15) In view and nearer the camera than `distance`
  function nearView(x, z, radius, distance) {
    return hasView && Math.hypot(x - camX, camY, z - camZ) < distance && visible(x, z, radius);
  }

  function refreshNear() {
    if (Math.hypot(focusX - nearX, focusZ - nearZ) < 40) return;
    nearX = focusX;
    nearZ = focusZ;
    nearEdges.length = 0;
    nearSignals.length = 0;
    // (Mog City, from 7fdaf15: a road by its nearest point, so a long one beside the player counts)
    for (const e of edges) {
      const s = clamp((focusX - e.sx) * e.dx + (focusZ - e.sz) * e.dz, 0, e.len);
      const dx = e.sx + e.dx * s - focusX;
      const dz = e.sz + e.dz * s - focusZ;
      if (dx * dx + dz * dz < NEAR_RADIUS * NEAR_RADIUS) nearEdges.push(e);
    }
    for (const n of nodes) if (n.signal && Math.hypot(n.x - focusX, n.z - focusZ) < NEAR_RADIUS) nearSignals.push(n);
    // (Mog City: the side streets feedSideStreets keeps from standing empty: any within FEED_FAR m of anywhere in the
    // next 40 m)
    feedEdges.length = 0;
    for (const e of nearEdges) if (e.axis !== 'ave' && Math.hypot(e.mx - focusX, e.mz - focusZ) < FEED_FAR + 40 + e.len * 0.5) feedEdges.push(e);
  }

  // Where the player is relative to v: metres ahead, metres to the right, and how fast it moves v's way
  function relateToPlayer(v) {
    v.pAhead = Infinity;
    v.kAhead = Infinity;
    const fx = Math.sin(v.yaw);
    const fz = Math.cos(v.yaw);
    // (and to the parked car: ahead, to the right, and its half width & length across & along v's way)
    if (parked.active && Math.abs(parked.x - v.x) < LOOKAHEAD + 10 && Math.abs(parked.z - v.z) < LOOKAHEAD + 10) {
      const dx = parked.x - v.x;
      const dz = parked.z - v.z;
      const c = Math.abs(Math.cos(parked.yaw - v.yaw));
      const sn = Math.abs(Math.sin(parked.yaw - v.yaw));
      v.kAhead = dx * fx + dz * fz;
      v.kRight = dz * fx - dx * fz;
      v.kW = parked.halfW * c + parked.halfL * sn;
      v.kL = parked.halfW * sn + parked.halfL * c;
      v.kSpeed = 0;
    }
    // (and the nearest of the blockers ahead near its lane, and how fast it goes v's way)
    for (const k of blockers) {
      const dx = k.x - v.x;
      const dz = k.z - v.z;
      if (Math.abs(dx) > LOOKAHEAD + 10 || Math.abs(dz) > LOOKAHEAD + 10) continue;
      const ahead = dx * fx + dz * fz;
      const right = dz * fx - dx * fz;
      if (ahead < -8 || Math.abs(right) > 8 || (v.kAhead !== Infinity && Math.abs(ahead) >= Math.abs(v.kAhead))) continue;
      const c = Math.abs(Math.cos(k.yaw - v.yaw));
      const sn = Math.abs(Math.sin(k.yaw - v.yaw));
      v.kAhead = ahead;
      v.kRight = right;
      v.kW = k.halfW * c + k.halfL * sn;
      v.kL = k.halfW * sn + k.halfL * c;
      v.kSpeed = Math.max(0, (k.vx || 0) * fx + (k.vz || 0) * fz);
    }
    if (!player.active) return;
    const dx = player.x - v.x;
    const dz = player.z - v.z;
    if (Math.abs(dx) > LOOKAHEAD + 10 || Math.abs(dz) > LOOKAHEAD + 10) return;
    v.pAhead = dx * fx + dz * fz;
    v.pRight = dz * fx - dx * fz;
    v.pSpeed = Math.max(0, player.vx * fx + player.vz * fz);
    v.pCross = player.vz * fx - player.vx * fz; // (Mog City: and across v's way, + to its right)
  }

  // Gap to the player (or the parked car) if it is ahead in the lane whose centre is `off` metres to the right of v;
  // gapSpeed: how fast that one goes v's way
  function playerGap(v, off) {
    let gap = Infinity;
    if (v.pAhead >= 0 && v.pAhead <= LOOKAHEAD && Math.abs(v.pRight - off) <= v.halfWidth + player.halfW + 0.4) {
      gap = v.pAhead - v.half - player.halfL;
      gapSpeed = v.pSpeed;
    }
    if (v.kAhead >= 0 && v.kAhead <= LOOKAHEAD && Math.abs(v.kRight - off) <= v.halfWidth + v.kW + 0.4 && v.kAhead - v.half - v.kL < gap) {
      gap = v.kAhead - v.half - v.kL;
      gapSpeed = v.kSpeed || 0;
    }
    return gap;
  }

  // =========================================================================
  // 5. DRIVING
  // =========================================================================
  // The lane nearest to `lane` that move m can be made from (m.out[i] is the lane lane i leads to, or -1)
  function nearestLane(m, lane) {
    let best = -1;
    for (let i = 0; i < m.out.length; i++) {
      if (m.out[i] >= 0 && (best < 0 || Math.abs(i - lane) < Math.abs(best - lane))) best = i;
    }
    return best;
  }

  // First vehicle ahead of position s in a lane list
  function ahead(list, s, v) {
    for (const o of list) if (o.s > s && o.v !== v) return o;
    return null;
  }

  // The front-most vehicle still approaching the end of a lane: not crossing at its end yet, though maybe still coming
  // out of the intersection at its start (at s < 0)
  function leadOf(list) {
    for (let k = list.length - 1; k >= 0; k--) if (!list[k].v.conn || list[k].s < 0) return list[k];
    return null;
  }

  // Intelligent Driver Model: acceleration on a free road, and the braking term for an obstacle `gap` metres
  // (bumper to bumper) ahead moving at `speed`
  const freeAcc = (v) => v.driver.a * (1 - (v.speed / v.v0) ** 4);
  function brake(v, gap, speed, s0 = v.driver.s0, T = v.driver.T) {
    const { a, b } = v.driver;
    const desired = s0 + Math.max(0, v.speed * T + (v.speed * (v.speed - speed)) / (2 * Math.sqrt(a * b)));
    return -a * (desired / Math.max(gap, 0.1)) ** 2;
  }
  // ...and for a line d metres ahead to stop s0 short of: no time gap to keep to a line
  const stopAt = (v, d, s0 = 1) => brake(v, d, 0, s0, 0);

  // (Mog City: a wreck that has stood still 15 s or more: one nosing through a jam (v.ghost) may pass it)
  const passable = (o) => !!(o.wreck && o._wreck && o._wreck.still > 15);

  // Braking for the vehicle ahead of position s in a lane list; remembers the nearest one
  function follow(v, list, s) {
    let o = ahead(list, s, v);
    while (o && v.ghost > 0 && passable(o.v)) o = ahead(list, o.s, v);
    if (!o) return 0;
    const gap = o.s - o.v.half - s - v.half;
    if (gap > LOOKAHEAD) return 0;
    if (gap < v.gap) {
      v.gap = gap;
      v.leaderSpeed = o.v.speed;
    }
    return brake(v, gap, o.v.speed);
  }

  // Can v, d metres before a line, still stop at it braking no harder than its driver comfortably does?
  const canStopBefore = (v, d) => freeAcc(v) + stopAt(v, d) > -v.driver.b;

  // Braking for a red (or an amber with room to stop) at the end of edge f, `d` metres ahead
  function signalAhead(v, f, d) {
    if (!f.to.signal || d > LOOKAHEAD) return 0;
    const phase = phaseOf(f);
    if (phase === 'green' || (phase === 'amber' && !canStopBefore(v, d))) return 0;
    return stopAt(v, d);
  }

  // Where to go at the end of the current edge: mostly straight on, sometimes a turn (buses keep to wide roads). With
  // `fromLane`, only moves the current lane allows. (Mog City, from 7fdaf15: no more drifting towards the camera
  // when far from it; far vehicles are recycled instead, and the drift kept them from going far)
  const weights = [];
  function chooseMove(v, fromLane) {
    const e = v.edge;
    let total = 0;
    for (let k = 0; k < e.moves.length; k++) {
      const m = e.moves[k];
      let w = m.turn === 'S' ? (v.bus ? 8 : 3) : 1;
      if (v.bus && m.turn !== 'S' && m.to.lanes.length < 2) w *= 0.05;
      if (v.bus && m.to.axis !== 'ave') w *= 1e-3; // (Mog City: buses keep to the avenues; a side street only when there is no other way)
      if (fromLane) {
        if (m.out[v.lane] < 0) w = 0;
      } else if (Math.abs(nearestLane(m, v.lane) - v.lane) * 22 > e.len - v.s) {
        w *= 0.02; // too little road left to change lanes for it
      }
      if (heldEdges.size && heldEdges.has(m.to)) w *= 1e-6; // (Mog City: a hold zone; only when there is no other way)
      weights[k] = w;
      total += w;
    }
    let r = Math.random() * total;
    let pick = null;
    for (let k = 0; k < e.moves.length; k++) {
      if (weights[k] <= 0) continue;
      pick = e.moves[k];
      r -= weights[k];
      if (r < 0) break;
    }
    // No move from this lane (a lane the road graph couldn't lead anywhere): take any move, changing lanes for it
    if (!pick && fromLane) return chooseMove(v, false);
    return pick || e.moves[0] || null;
  }

  // Could the vehicle of lane entry o, approaching the end of edge a, still stop easily before its line? Vehicles
  // already standing can; drivers who have been waiting a while accept any gap it can still stop for comfortably.
  function canStop(o, a, impatient) {
    const sp = o.v.speed;
    if (sp < 0.5) return true;
    const d = a.len - o.s - o.v.half;
    return impatient ? canStopBefore(o.v, d) : d > (sp * sp) / 5 + sp + 3;
  }

  // A left turn waits for oncoming traffic going straight or right (approach o); vehicles not on o yet haven't picked
  // their way on, and at a red, only those already committed to crossing still come. Waiting to turn at the line, v
  // also takes turns with those waiting at theirs: whoever has waited longer goes first, if it has room to go.
  function yieldOncoming(o, impatient, v = null) {
    if (!o) return false;
    if (o.through > 0) return true;
    if (o.to.signal && phaseOf(o) === 'red') return false;
    for (const list of o.occ) {
      const lead = leadOf(list);
      if (!lead || (lead.v.edge === o && lead.v.move.turn === 'L')) continue;
      if (!canStop(lead, o, impatient)) return true;
      const u = lead.v;
      const j = u.edge === o ? u.move.out[u.lane] : -1;
      if (v && v.wait > 0 && u.wait > v.wait && j >= 0 && o.len - lead.s - u.half < 2 && room(u.move.to, j, u)) return true;
    }
    return false;
  }

  // How far along curve c, out of two-way edge e, v can pull forward before its front corner reaches the
  // oncoming lanes (left of the centre line): where it waits for a gap to turn left
  const corner = { x: 0, z: 0, dx: 0, dz: 1 };
  function yieldPoint(v, c, e) {
    let cs = 0;
    for (; cs < c.len; cs += 0.5) {
      curvePoint(c, cs + v.half, corner);
      const x = corner.x + corner.dz * v.halfWidth;
      const z = corner.z - corner.dx * v.halfWidth;
      if ((x - e.x0) * e.rx + (z - e.z0) * e.rz < 0.3) break;
    }
    return cs - 0.5;
  }

  // At corners without signals, every other road gives way to group 0 (the avenue on the grid, the widest road at a
  // centreline junction)
  function yieldToAvenue(v, n) {
    for (const a of n.in) {
      if (a.axisIndex !== 0) continue;
      for (const list of a.occ) {
        const lead = leadOf(list);
        if (lead && !canStop(lead, a, v.wait > 8)) return true;
        // (Mog City: and to one standing at its line, except in the side road's turn (the courtesy, below): else a
        // steady stream across, each car going while the avenue's stood, kept its box busy and its queue there for good)
        if (lead && !(n.courtesy > clock) && a.len - lead.s - lead.v.half < 3) return true;
      }
    }
    return false;
  }

  // Seconds v takes to cover dist metres from now, speeding up from rest if it has to
  const timeTo = (v, dist) => dist / Math.max(v.speed, Math.sqrt((v.driver.a * dist) / 2), 0.1);

  // Will anyone on crosswalk `side` of n be within reach of the lane meeting it at `coord` between t0 and t1
  // seconds from now? Unless `onIt`, so is anyone waiting at the curb to step off, however far away: on the WALK, they
  // only wait for the vehicles already holding the crosswalk.
  function pedestrianOn(n, side, coord, t0, t1, onIt = false) {
    for (const p of n.walkers) {
      if (p.side !== side || (onIt && p.waiting)) continue;
      const toGo = (coord - p.coord) * p.dir; // metres p still has to walk to get there
      if (p.waiting || ((toGo + 2.6) / p.speed > t0 && (toGo - 2.6) / p.speed < t1)) return true;
    }
    return false;
  }

  // ...on the crosswalk v leaves the intersection over, while v, its front bumper d metres before it, passes? Once v
  // holds that crosswalk (it isn't waiting inside to turn), people at the curb wait for it.
  const pedsOut = (v, d) => d > 0 && pedestrianOn(v.edge.to, v.move.to.outSide, laneCoord(v.move.to, v.out), timeTo(v, d), timeTo(v, d + 3 + 2 * v.half), !v.yielding);

  // Must v, pulled into the intersection to turn, wait there: for people crossing its way out (`peds`) or, turning
  // left, for oncoming traffic?
  const holdsOn = (v, peds) => peds || (v.move.turn === 'L' && yieldOncoming(v.edge.opposite, false));

  // Of two vehicles on the same road headed for the same lane, the one whose front is nearer the line goes first (by
  // the front: a bus waiting at the line goes before the cars that pull up beside it)
  const precedence = (u, s) => s + u.half;

  // Would there be room for v in lane j of edge f if everyone headed there queued bumper to bumper behind its far
  // stop line? (An empty lane always has room, however short.) Vehicles take turns for it: whoever has waited longer
  // to go there from another side, or goes first from v's own road, counts as already in.
  function room(f, j, v) {
    let free = f.len - 1;
    for (const o of f.occ[j]) if (o.v !== v && o.s - o.v.half < f.len) free -= 2 * o.v.half + o.v.driver.s0;
    for (const a of f.from.in) {
      for (const list of a.occ) {
        const o = leadOf(list);
        if (!o || o.v.claimed || !o.v.move || o.v.move.to !== f || o.v.move.out[o.v.lane] !== j) continue;
        if (a === v.edge ? precedence(o.v, o.s) > precedence(v, v.s) : o.v.wait > v.wait) free -= 2 * o.v.half + o.v.driver.s0;
      }
    }
    return free >= Math.min(2 * v.half + 0.5, f.len - 1);
  }

  // Would v, crossing into lane j of f to arrive at position vs, come alongside another vehicle headed there, cut in
  // ahead of one closing in on it, or close in on one ahead in a lane beside (which it doesn't follow)? Turning buses
  // swing wide, so where a bus turns, the lanes either side count too, and for one turning beside v from v's road, so
  // does how far apart they start turning (the outer one has further to go: side by side on f may be one behind the
  // other at the line, and the other way round).
  function alongside(f, j, v, vs, turn) {
    for (let k = Math.max(0, j - 1); k <= Math.min(f.lanes.length - 1, j + 1); k++) {
      for (const o of f.occ[k]) {
        const swing = turn && (v.bus || o.v.bus);
        if (o.v === v || (k !== j && !swing)) continue;
        let lo = o.s - vs; // how far ahead of v o is
        let hi = lo;
        if (swing && o.v.edge === v.edge) {
          const atLine = (o.v.conn ? v.edge.len + o.v.cs : o.v.s) - v.s;
          lo = Math.min(lo, atLine);
          hi = Math.max(hi, atLine);
        }
        const closing = hi < 0 ? o.v.speed - v.speed : lo > 0 && k !== j ? v.speed - o.v.speed : 0;
        const w = o.v.half + v.half + 1 + 2 * Math.max(0, closing);
        if (lo < w && hi > -w) return true;
      }
    }
    return false;
  }

  // Is a bus at the line in the lane on the outside of v's turn? A bus starting to turn swings its tail out over it.
  function besideTail(v) {
    const e = v.edge;
    const k = v.lane + (v.move.turn === 'R' ? -1 : 1);
    const o = v.move.turn !== 'S' && k >= 0 && k < e.lanes.length ? leadOf(e.occ[k]) : null;
    return !!o && o.v.bus && o.v !== v && e.len - o.s - o.v.half < 2;
  }

  // The lead of another of v's lanes that goes first into lane j of f or, turning where a bus is involved, into a lane
  // beside it (turning buses swing wide): v falls in behind it. As an entry { v, s } of f's lane: where it would be on
  // f now.
  const merger = { v: null, s: 0 };
  function mergingAhead(v, f, j) {
    const e = v.edge;
    merger.v = null;
    for (let i = 0; i < e.lanes.length; i++) {
      const o = i === v.lane ? null : leadOf(e.occ[i]);
      if (!o || o.v === v || o.v.claimed || o.v.move.to !== f || precedence(o.v, o.s) <= precedence(v, v.s)) continue;
      if (o.v.bus && besideTail(o.v)) continue; // it waits for the bus beside its tail
      const oj = o.v.move.out[o.v.lane];
      if (oj < 0 || (oj !== j && !(Math.abs(oj - j) === 1 && v.move.turn !== 'S' && (v.bus || o.v.bus)))) continue;
      const s = o.s - e.len - connector(e, o.v.lane, f, oj).len;
      if (!merger.v || s < merger.s) {
        merger.v = o.v;
        merger.s = s;
      }
    }
    return merger.v ? merger : null;
  }

  // (Mog City) Is Dan's car (driving) in junction n's box, or in it or within 4 m of it at any time in the next
  // 2.5 s at the way it goes? Not when he follows v (or leads it) the same way, nor when he comes the other way and v
  // doesn't turn across him: the lane's own following sees to those
  function playerCrossing(v, n) {
    if (!player.car || Math.abs(player.x - n.x) > 80 || Math.abs(player.z - n.z) > 80) return false;
    const sp = Math.hypot(player.vx, player.vz);
    if (sp < 1.5) return false;
    const e = v.edge;
    const along = (player.vx * e.dx + player.vz * e.dz) / sp;
    if (along > 0.7 || (along < -0.7 && v.move.turn !== 'L')) return false;
    const hx = Math.max(n.hx || 0, 6) + 4;
    const hz = Math.max(n.hz || 0, 6) + 4;
    for (let t = 0; t <= 2.5; t += 0.25) {
      if (Math.abs(player.x + player.vx * t - n.x) < hx && Math.abs(player.z + player.vz * t - n.z) < hz) return true;
    }
    return false;
  }

  // May v, its front bumper d metres before the stop line, enter the intersection now? Sets the exit lane.
  // Once too close to stop, v is committed: it goes, and holds the intersection from then on.
  function mayEnter(v, d) {
    const e = v.edge;
    const n = e.to;
    const phase = n.signal ? phaseOf(e) : 'green';
    // Could it still stop? For a light that isn't green, also by crawling up to it, closer than it stops for lines
    const stoppable = canStopBefore(v, d) || (phase !== 'green' && v.speed * v.speed < 2 * v.driver.b * d);
    if (stoppable) v.commit = null; // could stop after all: decide afresh
    if (v.commit === n) return true;
    if (v.move.out[v.lane] < 0) {
      // missed the lane for the planned move: go wherever this lane goes instead
      if (d > 12) return false;
      v.move = chooseMove(v, true);
    }
    const m = v.move;
    const f = m.to;
    const j = m.out[v.lane];
    if (!(j >= 0 && j < f.lanes.length)) {
      if (!mayEnter.warned) {
        mayEnter.warned = true;
        console.warn('[traffic] lane leads nowhere', { lane: v.lane, lanes: e.lanes.length, out: m.out.slice(), moves: e.moves.length, x: Math.round(v.x), z: Math.round(v.z) });
      }
      return false;
    }
    if (phase === 'red' || (phase === 'amber' && stoppable)) return false;
    // (Mog City: Dan's car crossing it, or about to: wait for him)
    if (playerCrossing(v, n)) return false;
    // (Mog City: waited ~18 s at the line for a way in the rules never give it (the Village's diagonal corners, where
    // each arm can be waiting on another): it goes, slowly, its way kept physically clear by blockedAhead, if there is
    // room for it on its way out (else it stood in the box and blocked it for the others): no room, another way its lane
    // allows, every 4 s. Nosing through a jam that has stood 40 s in view (unjam), it goes all the same)
    if (v.wait > 18 && d < 3) {
      if (room(f, j, v) || (v.ghost > 0 && v.wait > 40)) {
        v.out = j;
        v.yielding = false;
        return true;
      }
      if (!(v.rerouteAt > clock)) {
        v.rerouteAt = clock + 4;
        const m2 = chooseMove(v, true);
        if (m2 && m2.out[v.lane] >= 0) v.move = m2;
      }
      return false;
    }
    // (Mog City: at a corner without signals, a side road's driver kept at the line by the avenue's traffic filling
    // the box asks for the avenue's courtesy too (see below), not only one waiting for a gap in it)
    if (!n.signal && e.axisIndex !== 0 && v.wait > 6 && d < 3 && !(n.courtesyNext > clock)) {
      n.courtesy = clock + 8;
      n.courtesyNext = clock + 16;
    }
    if (boxBusy(n, e.axisIndex)) return false; // crossing traffic inside
    const lead = ahead(e.occ[v.lane], v.s, v);
    if (lead && lead.v.yielding) return false; // the vehicle ahead waits inside to turn: wait behind the line
    if (v.bus && besideTail(v)) return false; // its tail would swing out over that bus as it starts to turn
    // At a signal, the first in line to turn pulls into the intersection to wait there for the people crossing the
    // road it turns into (they walk on the same green): short of their crosswalk or, turning left across oncoming
    // traffic, short of the oncoming lanes until there is a gap. The light changing stops both for it at the latest.
    const c = connector(e, v.lane, f, j);
    const first = n.signal && m.turn !== 'S' && !lead;
    const across = m.turn === 'L' && !!e.opposite;
    const wait = first ? (across ? yieldPoint(v, c, e) : c.len - 3 - v.half) : -1; // < 0: no room inside to wait
    if (m.turn === 'L' ? across && wait < 0 && yieldOncoming(e.opposite, v.wait > 8, v) : e.opposite && e.opposite.lefts > 0) return false;
    if (!n.signal && e.axisIndex !== 0 && yieldToAvenue(v, n)) {
      // (waited a while at the line for a gap that doesn't come: the avenue lets it through, see below)
      if (v.wait > 6 && d < 3 && !(n.courtesyNext > clock)) {
        n.courtesy = clock + 8;
        n.courtesyNext = clock + 16;
      }
      return false;
    }
    // At a corner without signals the avenue gives way for a few seconds now and then to a side road's driver who has
    // waited at the line (a steady stream on the avenue kept the side roads waiting for good)
    if (!n.signal && e.axisIndex === 0 && stoppable && n.courtesy > clock) return false;
    // nobody on the crosswalks while it passes over them, on the way in and on the way out, and a free place to
    // clear the intersection to, taking turns with lanes merging into it
    if (pedestrianOn(n, e.inSide, laneCoord(e, v.lane), 0, timeTo(v, d + 2.5 + 2 * v.half))) return false;
    if (wait < 0 && pedestrianOn(n, f.outSide, laneCoord(f, j), timeTo(v, d + c.len - 3), timeTo(v, d + c.len + 2 * v.half))) return false;
    const vs = v.s - e.len - c.len; // where on f it would be now
    if (!room(f, j, v) || alongside(f, j, v, vs, m.turn !== 'S') || mergingAhead(v, f, j)) {
      // (waited a good while at the line for room on its way out: another way this lane allows, now and then)
      if (v.wait > 15 && d < 3 && !(v.rerouteAt > clock)) {
        v.rerouteAt = clock + 4;
        const m2 = chooseMove(v, true);
        if (m2 && m2.out[v.lane] >= 0) v.move = m2;
      }
      return false;
    }
    v.out = j;
    v.yielding = wait >= 0;
    v.yieldAt = wait;
    if (!stoppable) {
      v.commit = n;
      claim(v); // at once, so vehicles and pedestrians deciding later this frame know
    }
    return true;
  }

  // Overtake into an adjacent lane when it is clearly quicker (MOBIL), or work towards a lane the planned turn
  // can be made from; either only if neither v nor its new follower has to brake hard for it. Not while still
  // pulling out of an intersection, nor in the last 12 m before the next.
  function changeLanes(v) {
    const e = v.edge;
    if (v.conn || v.commit || Math.abs(v.dl) > 0.5 || v.s < v.half || e.len - v.s - v.half < 12) return;
    let target = -1;
    if (v.move.out[v.lane] < 0) {
      const t = v.lane + Math.sign(nearestLane(v.move, v.lane) - v.lane);
      if (laneSafe(v, t, -4)) target = t;
    } else if (v.speed > 2 || v.wait > 4) {
      // (stopped a while behind something that doesn't move off, the parked car, the player, a jam: a lane clearly
      // freer beside it is worth pulling out into)
      let best = v.blocked > 1.5 ? -Infinity : laneAcc(v, v.lane) + (v.speed > 2 ? 0.6 : 1.2);
      for (let t = v.lane - 1; t <= v.lane + 1; t += 2) {
        if (t < 0 || t >= e.lanes.length || v.move.out[t] < 0 || !laneSafe(v, t, -3)) continue;
        // (Mog City: a bus keeps to the curb lane, the bus lane, pulling out only round something slow, and never
        // alongside another bus: no wall of buses side by side at a light)
        if (v.bus && e.occ[t].some((o) => o.v.bus && Math.abs(o.s - v.s) < 16)) continue;
        const acc = laneAcc(v, t) + (v.bus ? (t > v.lane ? 0.8 : -0.8) : 0);
        if (acc > best) {
          best = acc;
          target = t;
        }
      }
    }
    if (target < 0) return;
    v.dl += e.lanes[v.lane] - e.lanes[target]; // same spot, now measured from the new lane's centre
    v.lane = target;
    v.trail = null;
  }

  // Can v move into lane t leaving itself and its new follower at least bSafe (negative) acceleration?
  function laneSafe(v, t, bSafe) {
    let lead = null;
    let back = null;
    for (const o of v.edge.occ[t]) {
      if (o.v === v) continue;
      if (o.s > v.s) {
        lead = o;
        break;
      }
      back = o;
    }
    if (lead) {
      const gap = lead.s - lead.v.half - v.s - v.half;
      if (gap < 1.5 || freeAcc(v) + brake(v, gap, lead.v.speed) < bSafe) return false;
    }
    if (back) {
      const f = back.v;
      const gap = v.s - v.half - back.s - f.half;
      if (gap < 1.5 || freeAcc(f) + brake(f, gap, v.speed) < bSafe) return false;
    }
    const off = v.edge.lanes[t] - v.edge.lanes[v.lane] - v.dl;
    // (Mog City: and further from Dan's car the faster it closes on v, from behind or ahead)
    const closing = !player.car ? 0 : v.pAhead < 0 ? v.pSpeed - v.speed : v.speed - v.pSpeed;
    const reach = v.half + player.halfL + 6 + 1.5 * Math.max(0, closing);
    if (v.kAhead < Infinity && Math.abs(v.kRight - off) < v.halfWidth + v.kW + 0.4 && Math.abs(v.kAhead) < v.half + v.kL + 6) return false;
    return !(Math.abs(v.pRight - off) < v.halfWidth + player.halfW + 0.4 && v.pAhead > -reach && v.pAhead < reach);
  }

  // Acceleration v would have in lane t behind the vehicle (or player) ahead there
  function laneAcc(v, t) {
    const o = ahead(v.edge.occ[t], v.s, v);
    let worst = o ? brake(v, o.s - o.v.half - v.s - v.half, o.v.speed) : 0;
    const pg = playerGap(v, v.edge.lanes[t] - v.edge.lanes[v.lane] - v.dl);
    if (pg < LOOKAHEAD) worst = Math.min(worst, brake(v, pg, gapSpeed));
    return freeAcc(v) + worst;
  }

  // Fastest v can take curve c at without exceeding the sideways acceleration its driver accepts
  const bendSpeed = (v, c) => Math.sqrt(v.driver.aLat / Math.max(c.curv, 1e-3));

  // IDM acceleration for vehicles ahead in the lane (and, through the intersection, in the lane it leads to),
  // the stop line while v may not go, a red beyond, the player, and slowing down for turns and give-way lines
  function accelerate(v) {
    const e = v.edge;
    let worst = 0;
    let cap = Infinity;
    v.gap = Infinity;
    if (!v.conn) {
      worst = follow(v, e.occ[v.lane], v.s);
      const side = straddle(v);
      if (side) worst = Math.min(worst, follow(v, e.occ[v.lane + side], v.s));
      const d = e.len - v.s - v.half;
      if (d < LOOKAHEAD) {
        const go = mayEnter(v, d);
        const f = v.move.to;
        const j = v.move.out[v.lane];
        const c = j < 0 ? null : connector(e, v.lane, f, j);
        const vs = c ? v.s - e.len - c.len : 0; // position on f, measured from its start
        if (!go) {
          worst = Math.min(worst, stopAt(v, d));
        } else {
          worst = Math.min(worst, follow(v, f.occ[j], vs), signalAhead(v, f, f.len - vs - v.half));
          // pulling in to wait inside: slow down for that spot already if it will have to wait there
          if (v.yielding && holdsOn(v, pedsOut(v, d + c.len - 3))) worst = Math.min(worst, stopAt(v, d + v.half + v.yieldAt, 0.5));
        }
        // easing off to fall in behind a vehicle from another lane merging ahead into the same lane (unless committed:
        // then the others wait for v)
        const o = c && !v.claimed && mergingAhead(v, f, j);
        if (o) worst = Math.min(worst, Math.max(-v.driver.b, brake(v, o.s - o.v.half - vs - v.half, o.v.speed)));
        let vt = c ? bendSpeed(v, c) : Infinity;
        if (!e.to.signal && e.axisIndex !== 0) vt = Math.min(vt, 5);
        cap = Math.sqrt(vt * vt + 5 * Math.max(0, d));
      }
    } else {
      const f = v.move.to;
      const vs = v.cs - v.conn.len;
      worst = Math.min(follow(v, f.occ[v.out], vs), follow(v, e.occ[v.lane], e.len + v.cs), signalAhead(v, f, f.len - vs - v.half));
      // someone crossing the way out: wait for them inside the intersection, short of the 2.5 m crosswalk
      const d = v.conn.len - 3 - v.cs - v.half;
      // (Mog City: stood inside 25 s already, for walkers who keep coming or a gap that doesn't: it edges on out)
      const peds = v.wait > 25 ? null : pedsOut(v, d);
      if (v.yielding && v.cs < v.yieldAt && v.wait <= 25 && holdsOn(v, peds)) {
        worst = Math.min(worst, stopAt(v, v.yieldAt - v.cs, 0.5)); // waiting inside to turn
      } else {
        if (v.yielding) cross(v);
        if (peds) worst = Math.min(worst, stopAt(v, d, 0.5));
      }
      cap = bendSpeed(v, v.conn);
    }
    const pg = playerGap(v, 0);
    if (pg < LOOKAHEAD) {
      worst = Math.min(worst, brake(v, pg, gapSpeed));
      if (pg < v.gap) {
        v.gap = pg;
        v.leaderSpeed = gapSpeed;
      }
    }
    // (Mog City: Dan's car cutting across its way within 25 m ahead, more than 3 m/s across: it stops short of him)
    if (player.car && v.pAhead > 0 && v.pAhead < 25 && Math.abs(v.pRight) < v.halfWidth + 3 && Math.abs(v.pCross) > 3) {
      worst = Math.min(worst, stopAt(v, Math.max(0.1, v.pAhead - v.half - 4)));
    }
    const acc = Math.min(freeAcc(v) + worst, (cap - v.speed) * 2);
    v.acc = clamp(acc, -9, v.driver.a);
    // (Mog City: stood inside an intersection 25 s with nobody right ahead (a bend its length can't take, a hold that
    // never lets go): it creeps on out of it, at a walk (blockedAhead still keeps it out of anything in its way)
    if (v.conn && v.wait > 25 && v.gap > 4) {
      v.acc = Math.max(v.acc, 0.6);
      v.ghost = Math.max(v.ghost || 0, 0.5);
    }
  }

  // Front bumper at the stop line: cross if allowed, or if going too fast to stop; otherwise wait there
  function enter(v) {
    const e = v.edge;
    if (!mayEnter(v, 0)) {
      const j = v.move.out[v.lane];
      if (v.speed < 4 || j < 0) {
        v.s = e.len - v.half;
        v.speed = 0;
        return;
      }
      v.out = j;
      v.yielding = false;
    }
    v.cs = v.s - e.len;
    v.conn = connector(e, v.lane, v.move.to, v.out);
    claim(v); // at once, so vehicles deciding later this frame know
  }

  function leave(v) {
    v.s = v.cs - v.conn.len;
    v.edge = v.move.to;
    v.lane = v.out;
    v.trail = v.conn; // the rear axle is still on it
    v.conn = null;
    v.commit = null;
    v.move = chooseMove(v, false);
  }

  // Vehicles by 14 m cell (rebuilt every frame), for blockedAhead
  const GRID = 14;
  const grid = new Map();
  const gridKey = (x, z) => (Math.floor(x / GRID) + 2048) * 4096 + Math.floor(z / GRID) + 2048;
  function buildGrid() {
    for (const list of grid.values()) list.length = 0;
    for (const v of vehicles) {
      if (!v.edge) continue;
      const k = gridKey(v.x, v.z);
      let list = grid.get(k);
      if (!list) grid.set(k, (list = []));
      list.push(v);
    }
  }
  // How far two vehicles' bodies (as drawn) reach into each other, with a at (ax, az): 0 apart
  function bodyPen(a, ax, az, b) {
    const ya = a.yaw + a.yawOffset;
    const yb = b.yaw + b.yawOffset;
    const dx = b.x - ax;
    const dz = b.z - az;
    let pen = Infinity;
    for (const y of [ya, yb]) {
      for (let k = 0; k < 2; k++) {
        const nx = k ? Math.sin(y) : Math.cos(y);
        const nz = k ? Math.cos(y) : -Math.sin(y);
        const ra = a.bodyW * Math.abs(Math.cos(ya) * nx - Math.sin(ya) * nz) + a.bodyL * Math.abs(Math.sin(ya) * nx + Math.cos(ya) * nz);
        const rb = b.bodyW * Math.abs(Math.cos(yb) * nx - Math.sin(yb) * nz) + b.bodyL * Math.abs(Math.sin(yb) * nx + Math.cos(yb) * nz);
        const p = ra + rb - Math.abs(dx * nx + dz * nz);
        if (p <= 0) return 0;
        if (p < pen) pen = p;
      }
    }
    return pen;
  }
  // Would moving ds on take v further into a vehicle ahead of it (in front of its nose, within ~55 degrees)? Of two
  // nose to nose, the first in the list goes.
  const inFront = (a, b) => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    return dx * a.tx + dz * a.tz > 0.57 * Math.hypot(dx, dz);
  };
  function blockedAhead(v, ds) {
    const nx = v.x + v.tx * ds;
    const nz = v.z + v.tz * ds;
    const cx = Math.floor(nx / GRID);
    const cz = Math.floor(nz / GRID);
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iz = cz - 1; iz <= cz + 1; iz++) {
        const list = grid.get((ix + 2048) * 4096 + iz + 2048);
        if (!list) continue;
        for (const o of list) {
          if (o === v || Math.abs(o.x - nx) > o.bodyL + v.bodyL + 0.5 || Math.abs(o.z - nz) > o.bodyL + v.bodyL + 0.5) continue;
          // (Mog City: nosing through a deadlock, see drive; and past a wreck that has stood 15 s)
          if (v.ghost > 0 && o.speed < 0.5 && (!o.wreck || passable(o))) continue;
          if (!inFront(v, o) || (inFront(o, v) && v.id < o.id)) continue;
          const after = bodyPen(v, nx, nz, o);
          if (after > 0.02 && after > bodyPen(v, v.x, v.z, o) + 1e-4) return true;
        }
      }
    }
    // (Mog City: nor into Dan's car, driven or parked, whatever its lane thinks: it is never driven into)
    const pb = playerBody;
    if (pb.on && Math.abs(pb.x - nx) < pb.bodyL + v.bodyL + 0.5 && Math.abs(pb.z - nz) < pb.bodyL + v.bodyL + 0.5 && inFront(v, pb)) {
      const after = bodyPen(v, nx, nz, pb);
      if (after > 0.02 && after > bodyPen(v, v.x, v.z, pb) + 1e-4) return true;
    }
    return false;
  }

  // Last of all, any two vehicles found in one another all the same (a wreck handed back across a lane, a knock, a
  // spawn) are eased apart along the line between them, a quarter metre a frame at most (a bus hardly moves). Within
  // sight of the camera; not the wrecks, which wagmi/crash moves itself
  function separate() {
    buildGrid();
    for (const v of vehicles) {
      if (!v.edge || v.wreck || Math.abs(v.x - focusX) + Math.abs(v.z - focusZ) > 350) continue;
      const cx = Math.floor(v.x / GRID);
      const cz = Math.floor(v.z / GRID);
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        for (let iz = cz - 1; iz <= cz + 1; iz++) {
          const list = grid.get((ix + 2048) * 4096 + iz + 2048);
          if (!list) continue;
          for (const o of list) {
            if (o.id <= v.id || o.wreck || Math.abs(o.x - v.x) > o.bodyL + v.bodyL || Math.abs(o.z - v.z) > o.bodyL + v.bodyL) continue;
            const pen = bodyPen(v, v.x, v.z, o);
            if (pen < 0.02) continue;
            const d = Math.hypot(o.x - v.x, o.z - v.z) || 1;
            const ux = (o.x - v.x) / d;
            const uz = (o.z - v.z) / d;
            const step = Math.min(pen, 0.25);
            const mine = v.bus === o.bus ? 0.5 : v.bus ? 0.15 : 0.85; // v's share of the push
            shove(v, -ux * step * mine, -uz * step * mine);
            shove(o, ux * step * (1 - mine), uz * step * (1 - mine));
          }
        }
      }
    }
    // (Mog City) ...and out of Dan's car, driven or parked: it has had its turn (wagmi/crash meets the traffic in
    // its own steps and is moved there), so what the traffic's moves since put into it is eased out of it, the vehicle
    // taking all of it (up to half a metre a frame)
    const pb = playerBody;
    if (pb.on) {
      for (const v of vehicles) {
        if (!v.edge || v.wreck || Math.abs(v.x - pb.x) > v.bodyL + pb.bodyL || Math.abs(v.z - pb.z) > v.bodyL + pb.bodyL) continue;
        const pen = bodyPen(v, v.x, v.z, pb);
        if (pen < 0.03) continue;
        const d = Math.hypot(v.x - pb.x, v.z - pb.z) || 1;
        const step = Math.min(pen, 0.5);
        shove(v, ((v.x - pb.x) / d) * step, ((v.z - pb.z) / d) * step);
        v.speed = Math.min(v.speed, 1);
      }
    }
  }

  // (Mog City) How long v noses through at 3 m/s: its length, the junction's curve it is on or about to take, 4 m more
  // (4 s at the least)
  function ghostFor(v) {
    let c = 0;
    if (v.conn) c = v.conn.len;
    else if (v.move && v.edge.len - v.s - v.half < 20) {
      const j = v.move.out[v.lane];
      if (j >= 0 && j < v.move.to.lanes.length) c = connector(v.edge, v.lane, v.move.to, j).len;
    }
    return Math.max(4, (2 * v.half + c + 4) / 3);
  }
  // (Mog City) A queue that has stood 40 s in view (v one of it): its head, the front one of those standing nose to
  // tail (or the one behind a wreck), noses on through whatever stands in its way, at a crawl. Not at a red light, where
  // it is only waiting for the green. Once every 2 s for a queue at most
  function unjam(v) {
    if (v.unjamAt > clock) return;
    let u = v;
    for (let k = 0; k < 40; k++) {
      const list = u.conn ? u.move.to.occ[u.out] : u.edge.occ[u.lane];
      const s = u.conn ? u.cs - u.conn.len : u.s;
      const o = ahead(list, s, u);
      if (!o || o.v.wreck || o.v.speed > 0.5 || o.s - o.v.half - s - u.half > 10) break;
      u = o.v;
    }
    v.unjamAt = u.unjamAt = clock + 2;
    if (!u.conn && u.edge.to.signal && phaseOf(u.edge) !== 'green' && u.edge.len - u.s - u.half < 8) return;
    u.ghost = Math.max(u.ghost || 0, ghostFor(u));
  }
  // (Mog City) Hidden from the camera behind another vehicle: one across the line of sight to it, in its last 40 m
  function behindAnother(v) {
    const dx = camX - v.x;
    const dz = camZ - v.z;
    const D = Math.hypot(dx, dz) || 1;
    const ux = dx / D;
    const uz = dz / D;
    for (let t = 3; t < Math.min(D - 2, 40); t += 7) {
      const list = grid.get(gridKey(v.x + ux * t, v.z + uz * t));
      if (!list) continue;
      for (const o of list) {
        if (o === v) continue;
        const ox = o.x - v.x;
        const oz = o.z - v.z;
        const a = ox * ux + oz * uz;
        if (a > 2 && a < D - 2 && Math.abs(ox * uz - oz * ux) < o.bodyW * 0.8) return true;
      }
    }
    return false;
  }

  function drive(v, dt) {
    // (Mog City: held 10 s by something in front of it that doesn't move off either (two or more of them nose to nose
    // in a junction, a cycle of queues round the Village's diagonal corners), it noses on through the stopped ones at a
    // crawl for a few seconds (long enough at 3 m/s for its length and the junction's, a bus's too); separate() eases
    // them apart. Never through Dan's car)
    if (v.blocked > 10) { v.ghost = ghostFor(v); v.blocked = 0; }
    if (v.ghost > 0) { v.ghost -= dt; v.speed = Math.min(v.speed, 3); }
    v.laneTimer -= dt;
    if (v.laneTimer <= 0) {
      v.laneTimer = 0.4 + Math.random() * 0.3;
      changeLanes(v);
    }
    accelerate(v);
    const speed = v.speed;
    v.speed = Math.max(0, v.speed + v.acc * dt);
    let ds = v.speed * dt;
    if (ds > v.gap - 0.3) {
      // never into the vehicle ahead
      ds = Math.max(0, v.gap - 0.3);
      v.speed = Math.min(v.speed, v.leaderSpeed);
    }
    // ...nor into any other, whatever lane or turn it is on (a bus swinging wide, a car knocked across the lanes),
    // within sight of the camera (~250 m)
    if (ds > 0 && Math.abs(v.x - focusX) + Math.abs(v.z - focusZ) < 350 && blockedAhead(v, ds)) {
      ds = 0;
      v.speed = 0;
      v.blocked += dt; // (how long, for changeLanes: something its lane doesn't know about stands in the way)
    } else if (ds > 0) v.blocked = 0;
    v.acc = Math.max(-9, (v.speed - speed) / dt); // as driven, for the body to pitch with: none standing still
    v.wait = v.speed < 0.5 ? v.wait + dt : 0;
    if (!v.conn) {
      v.s += ds;
      if (v.s + v.half >= v.edge.len) enter(v);
    } else {
      v.cs += ds;
      if (v.cs >= v.conn.len) leave(v);
    }
    // ease sideways onto the lane centre (after lane changes and knocks), steering the front bumper towards it so the
    // nose doesn't swing on into the next lane, and no faster than the wheels can steer it, though even stopped half
    // way into a lane change a driver edges over
    const maxLat = Math.min(1.7, 0.3 + (v.bus ? 0.1 : 0.22) * v.speed);
    const rate = Math.min(1.8, Math.max(v.speed, 1.5) / (v.axle + v.half));
    const target = clamp(-rate * v.dl, -maxLat, maxLat);
    v.dlv += clamp(target - v.dlv, -2.5 * dt, 2.5 * dt);
    v.dl += v.dlv * dt;
  }

  // Point and direction at distance c along v's path: its lane, the curve through the intersection, and the
  // lane after it (or, just out of an intersection, the curve it came along)
  function lanePoint(e, i, s, out) {
    out.x = e.sx + e.dx * s + e.rx * e.lanes[i];
    out.z = e.sz + e.dz * s + e.rz * e.lanes[i];
    out.dx = e.dx;
    out.dz = e.dz;
    return out;
  }
  function pathPoint(v, c, out) {
    const e = v.edge;
    if (v.conn) {
      if (c < 0) return lanePoint(e, v.lane, e.len + c, out);
      if (c > v.conn.len) return lanePoint(v.move.to, v.out, c - v.conn.len, out);
      return curvePoint(v.conn, c, out);
    }
    if (c < 0 && v.trail) return curvePoint(v.trail, v.trail.len + c, out);
    return lanePoint(e, v.lane, c, out);
  }

  // World position and heading from where v's axles are along its path: the rear axle dl to the right of it, and the
  // body turned `nose` to the right about the rear axle, into a lane change (so the rear axle never slides sideways)
  const front = { x: 0, z: 0, dx: 0, dz: 0 };
  const rear = { x: 0, z: 0, dx: 0, dz: 0 };
  function locate(v) {
    const c = v.conn ? v.cs : v.s;
    pathPoint(v, c + v.axle, front);
    pathPoint(v, c - v.axle, rear);
    const l = Math.hypot(front.x - rear.x, front.z - rear.z) || 1;
    v.tx = (front.x - rear.x) / l;
    v.tz = (front.z - rear.z) / l;
    v.nose = Math.atan2(v.dlv, Math.max(v.speed, 1.5));
    const off = v.dl + v.axle * Math.sin(v.nose);
    v.x = (front.x + rear.x) / 2 - v.tz * off;
    v.z = (front.z + rear.z) / 2 + v.tx * off;
  }

  // Move v along and across its path by (dx, dz), as far as the road allows
  function shove(v, dx, dz) {
    const along = dx * v.tx + dz * v.tz;
    if (v.conn) v.cs = clamp(v.cs + along, -v.half, v.conn.len - 0.01);
    else v.s = clamp(v.s + along, 0, v.edge.len - v.half);
    v.dl = clamp(v.dl + dz * v.tx - dx * v.tz, -2.5, 2.5);
    locate(v);
  }

  // Heading, steering, turn signals, and body pitch & roll from acceleration & turning
  function pose(v, dt) {
    const yaw = Math.atan2(v.tx, v.tz) - v.nose;
    let dYaw = yaw - v.yaw;
    dYaw -= Math.round(dYaw / (Math.PI * 2)) * Math.PI * 2;
    v.yaw = yaw;
    v.yawRate += (dYaw / dt - v.yawRate) * Math.min(1, dt * 8);
    const wheelbase = 2 * v.axle;
    const steer = clamp(Math.atan((wheelbase * v.yawRate) / Math.max(v.speed, 0.5)), -0.6, 0.6);
    v.steer += (steer - v.steer) * Math.min(1, dt * 10);

    const turn = v.move.turn;
    if (Math.abs(v.dl) > 0.3 && Math.abs(v.dlv) > 0.05) v.blink = v.dl > 0 ? -1 : 1;
    else if (turn !== 'S' && (v.conn || v.edge.len - v.s < 35)) v.blink = turn === 'R' ? 1 : -1;
    else v.blink = 0;

    v.pitchVel += ((-0.008 * v.acc - v.pitch) * 68.0 - v.pitchVel * 10.8) * dt;
    v.pitch = clamp(v.pitch + v.pitchVel * dt, -0.22, 0.22);
    v.rollVel += ((0.01 * v.speed * v.yawRate - v.roll) * 68.0 - v.rollVel * 10.8) * dt;
    v.roll = clamp(v.roll + v.rollVel * dt, -0.26, 0.26);
    v.yawOffset += v.yawVel * dt;
    v.yawVel += (-v.yawOffset * 18.0 - v.yawVel * 6.8) * dt;
    v.yawOffset = clamp(v.yawOffset * Math.exp(-4.5 * dt), -0.85, 0.85);
  }

  // Knock velocity from collisions carries v along and across its path, and dies down
  function knock(v, dt) {
    if (v.vx === 0 && v.vz === 0) return;
    shove(v, v.vx * dt, v.vz * dt);
    const damp = Math.exp(-5.5 * dt);
    v.vx *= damp;
    v.vz *= damp;
    if (v.vx * v.vx + v.vz * v.vz < 1e-4) v.vx = v.vz = 0;
  }

  // A knocked vehicle shunts the vehicles it runs into
  function knockOn(v) {
    for (const o of vehicles) {
      if (o === v || !o.edge) continue;
      const dx = o.x - v.x;
      const dz = o.z - v.z;
      const dist = Math.hypot(dx, dz);
      if (dist > v.half + o.half || dist < 0.001) continue;
      if (Math.abs(dz * v.tx - dx * v.tz) > v.halfWidth + o.halfWidth) continue; // side by side
      const nx = dx / dist;
      const nz = dz / dist;
      const relVn = (v.vx - o.vx) * nx + (v.vz - o.vz) * nz;
      if (relVn <= 0.5) continue;
      const transfer = relVn * 0.68;
      o.vx += nx * transfer;
      o.vz += nz * transfer;
      v.vx -= nx * transfer * 0.45;
      v.vz -= nz * transfer * 0.45;
      const across = nz * o.tx - nx * o.tz; // hit from the side spins it
      const along = nx * o.tx + nz * o.tz;
      o.yawVel += across * Math.min(2.8, relVn * 0.22);
      o.rollVel += across * Math.min(8.0, relVn) * 0.18;
      o.pitchVel -= along * Math.min(8.0, relVn) * 0.14;
      if (relVn > 2.2) spawnCollisionSparks((v.x + o.x) * 0.5, 0.56, (v.z + o.z) * 0.5, nx, nz, relVn);
    }
  }

  // (Mog City: a wreck handed back to its lane where it stands, wagmi/crash: along and across the lane by how far it is
  // from where the lane has it, turned by how far it is turned from it; true if that is near enough to drive off from)
  function unwreck(v, x, z, yaw) {
    locate(v);
    shove(v, x - v.x, z - v.z);
    v.yaw = Math.atan2(v.tx, v.tz) - v.nose;
    let d = yaw - v.yaw;
    d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
    v.yawOffset = clamp(d, -0.85, 0.85);
    v.yawVel = v.yawRate = v.vx = v.vz = v.speed = v.acc = 0;
    v.dlv = 0;
    return Math.hypot(v.x - x, v.z - z) < 0.6 && Math.abs(d) < 0.85;
  }

  // Physical 4-axis 2D SAT OBB test between a vehicle (half extents halfW x halfL, heading rotY) and the player.
  // Returns the minimum translation axis (pointing from the vehicle towards the player), or null if they don't overlap.
  const satHit = { nx: 0, nz: 0, pen: 0, localX: 0, localZ: 0, pSin: 0, pCos: 1 };
  function overlapWithPlayer(relX, relZ, rotY, halfW, halfL, pH, pHalfW, pHalfL) {
    const sinY = Math.sin(rotY);
    const cosY = Math.cos(rotY);
    const localX = relX * cosY - relZ * sinY;
    const localZ = relX * sinY + relZ * cosY;
    const pSin = Math.sin(pH);
    const pCos = Math.cos(pH);
    const pLocalX = relX * pCos - relZ * pSin;
    const pLocalZ = relX * pSin + relZ * pCos;
    const alignCos = Math.abs(Math.cos(pH - rotY));
    const alignSin = Math.abs(Math.sin(pH - rotY));

    const extX = halfW + pHalfW * alignCos + pHalfL * alignSin;
    const extZ = halfL + pHalfW * alignSin + pHalfL * alignCos;
    const pExtX = pHalfW + halfW * alignCos + halfL * alignSin;
    const pExtZ = pHalfL + halfW * alignSin + halfL * alignCos;

    const penX = extX - Math.abs(localX);
    const penZ = extZ - Math.abs(localZ);
    const pPenX = pExtX - Math.abs(pLocalX);
    const pPenZ = pExtZ - Math.abs(pLocalZ);
    if (!(penX > 0 && penZ > 0 && pPenX > 0 && pPenZ > 0)) return null;

    let nx, nz, pen;
    if (penX < penZ) {
      const signX = localX >= 0 ? 1 : -1;
      nx = cosY * signX;
      nz = -sinY * signX;
      pen = penX;
    } else {
      const signZ = localZ >= 0 ? 1 : -1;
      nx = sinY * signZ;
      nz = cosY * signZ;
      pen = penZ;
    }
    if (pPenX < pen) {
      const signPX = pLocalX >= 0 ? 1 : -1;
      nx = pCos * signPX;
      nz = -pSin * signPX;
      pen = pPenX;
    }
    if (pPenZ < pen) {
      const signPZ = pLocalZ >= 0 ? 1 : -1;
      nx = pSin * signPZ;
      nz = pCos * signPZ;
      pen = pPenZ;
    }

    satHit.nx = nx;
    satHit.nz = nz;
    satHit.pen = pen;
    satHit.localX = localX;
    satHit.localZ = localZ;
    satHit.pSin = pSin;
    satHit.pCos = pCos;
    return satHit;
  }

  // Player contact: push the player and the vehicle apart (a bus hardly moves) and trade momentum, with spin,
  // suspension kicks and sparks
  function collideWithPlayer(v, rotY, halfW, halfL) {
    const pe = player.entity;
    const relX = pe.position.x - v.x;
    const relZ = pe.position.z - v.z;
    if (Math.abs(relX) > halfL + 3 || Math.abs(relZ) > halfL + 3) return;
    const hit = overlapWithPlayer(relX, relZ, rotY, halfW, halfL, pe.heading || 0, player.halfW, player.halfL);
    if (!hit) return;
    const { nx, nz, pen, localX, localZ, pSin, pCos } = hit;
    const massRatio = v.bus ? 0.15 : v.isSUV ? 0.58 : 1.0 - player.push;
    const pPush = 1.0 - massRatio;
    pe.position.x += nx * pen * pPush;
    pe.position.z += nz * pen * pPush;
    if (pe.mesh) pe.mesh.position.copy(pe.position);
    shove(v, -nx * pen * massRatio, -nz * pen * massRatio);

    const sinY = Math.sin(rotY);
    const cosY = Math.cos(rotY);
    const pSpeed = pe.speed || 0;
    const pvx = pSin * pSpeed + (pe.vx || 0);
    const pvz = pCos * pSpeed + (pe.vz || 0);
    const cvx = v.tx * v.speed + v.vx;
    const cvz = v.tz * v.speed + v.vz;
    const approachSpeed = (pvx - cvx) * (-nx) + (pvz - cvz) * (-nz);
    if (approachSpeed <= 0) return;

    const jImpulse = (1.0 + 0.28) * approachSpeed;
    const cImpulse = v.bus ? approachSpeed * 0.22 : jImpulse * massRatio * 0.92;
    v.vx -= nx * cImpulse;
    v.vz -= nz * cImpulse;
    v.speed *= v.bus ? 0.55 : 0.35;

    const localNx = nx * cosY - nz * sinY;
    const localNz = nx * sinY + nz * cosY;
    if (!v.bus) {
      const torque = localZ * localNx - localX * localNz;
      v.yawVel -= torque * Math.min(4.2, approachSpeed * 0.26);
      v.yawOffset = clamp(v.yawOffset - torque * Math.min(0.35, approachSpeed * 0.025), -0.65, 0.65);
      v.pitchVel -= localNz * Math.min(12.0, approachSpeed) * 0.18;
      v.rollVel += localNx * Math.min(12.0, approachSpeed) * 0.24;
    }

    const contactLocalX = clamp(localX, -halfW, halfW);
    const contactLocalZ = clamp(localZ, -halfL, halfL);
    const contactX = v.x + contactLocalX * cosY + contactLocalZ * sinY;
    const contactZ = v.z - contactLocalX * sinY + contactLocalZ * cosY;

    if (typeof pe.speed === 'number') {
      const headOnDot = Math.abs(pSin * nx + pCos * nz);
      pe.speed *= 1.0 - (v.bus ? 0.68 : 0.50) * headOnDot;
      if (pe.type === 'car') {
        const pImpulse = v.bus ? approachSpeed * 0.65 : jImpulse * pPush * 0.48;
        pe.vx = (pe.vx || 0) + nx * pImpulse;
        pe.vz = (pe.vz || 0) + nz * pImpulse;
        const pLocalNx = nx * pCos - nz * pSin;
        const pLocalNz = nx * pSin + nz * pCos;
        if (!v.bus) {
          const pRelX = (contactX - pe.position.x) * pCos - (contactZ - pe.position.z) * pSin;
          const pRelZ = (contactX - pe.position.x) * pSin + (contactZ - pe.position.z) * pCos;
          const pTorque = pRelZ * pLocalNx - pRelX * pLocalNz;
          pe.angularVel = (pe.angularVel || 0) + pTorque * Math.min(3.0, approachSpeed * 0.18) * pPush;
        }
        const kick = Math.min(v.bus ? 16.0 : 14.0, approachSpeed);
        pe.pitchVel = (pe.pitchVel || 0) + pLocalNz * kick * (v.bus ? 0.22 : 0.18);
        pe.rollVel = (pe.rollVel || 0) - pLocalNx * kick * (v.bus ? 0.28 : 0.24);
        pe.heaveVel = (pe.heaveVel || 0) + Math.min(v.bus ? 1.6 : 1.4, approachSpeed * (v.bus ? 0.14 : 0.11));
      }
    }
    if (approachSpeed > 1.8) spawnCollisionSparks(contactX, v.bus ? 0.65 : 0.58, contactZ, nx, nz, approachSpeed);
  }

  // (Mog City) Pushed off Dan's parked car, which stays put
  function pushOffParked(v, rotY, halfW, halfL) {
    const relX = parked.x - v.x;
    const relZ = parked.z - v.z;
    if (Math.abs(relX) > halfL + 3 || Math.abs(relZ) > halfL + 3) return;
    const hit = overlapWithPlayer(relX, relZ, rotY, halfW, halfL, parked.yaw, parked.halfW, parked.halfL);
    if (!hit) return;
    const { nx, nz, pen } = hit;
    shove(v, -nx * pen, -nz * pen);
    if ((v.tx * v.speed + v.vx) * nx + (v.tz * v.speed + v.vz) * nz > 0) v.speed *= 0.3;
  }

  // =========================================================================
  // 6. PLACING VEHICLES
  // =========================================================================
  // Room at s in a lane list: margin metres to the vehicles either side, and two seconds more for the one behind
  function laneClear(list, s, margin) {
    for (const o of list) if (Math.abs(o.s - s) < o.v.half + margin + (o.s < s ? 2 * o.v.speed : 0)) return false;
    return true;
  }

  function place(v, e, lane, s) {
    v.placedAt = tick; // (Mog City)
    v.edge = e;
    v.lane = lane;
    v.s = s;
    v.conn = null;
    v.trail = null;
    v.commit = null;
    v.yielding = false;
    v.wait = v.blocked = 0;
    v.speed = v.v0 * 0.5;
    v.acc = 0;
    v.dl = v.dlv = 0;
    v.vx = v.vz = v.yawOffset = v.yawVel = v.pitch = v.pitchVel = v.roll = v.rollVel = 0;
    locate(v);
    v.prevX = v.x;
    v.prevZ = v.z;
    v.yaw = Math.atan2(v.tx, v.tz);
    v.yawRate = v.steer = 0;
    v.move = chooseMove(v, false);
    occupy(e.occ[lane], v, s);
  }

  // (Mog City) A car placed round a corner ahead, on a road ending on the road the camera looks down (its far junction
  // 40 m or more ahead, within 20 m of that line), turns into it, either way, 3 times in 4: traffic coming out of the
  // side roads ahead of a driver, not placed in his view
  function turnIn(v) {
    const e = v.edge;
    const f = Math.hypot(camFwdX, camFwdZ) || 1;
    const hx = camFwdX / f;
    const hz = camFwdZ / f;
    const ax = e.to.x - camX;
    const az = e.to.z - camZ;
    if (ax * hx + az * hz < 40 || Math.abs(ax * hz - az * hx) > 20 || Math.abs(e.dx * hx + e.dz * hz) > 0.5 || Math.random() < 0.25) return;
    for (const m of e.moves) {
      if (Math.abs(m.to.dx * hx + m.to.dz * hz) < 0.9 || Math.abs(nearestLane(m, v.lane) - v.lane) * 22 > e.len - v.s) continue;
      if ((heldEdges.size && heldEdges.has(m.to)) || (v.bus && m.to.axis !== 'ave')) continue; // (and no bus off the avenues)
      v.move = m;
      return;
    }
  }

  // Put v in a free spot of a random lane rMin..rMax metres from the focus, out of view if `hidden` (Mog City: or
  // behind a building; in plain view past FAR_VIEW_SPAWN m only after 8 tries); `ahead`, the first 8 tries 60 m or
  // more ahead of the camera. (From 7fdaf15: on a long road, a spot within rMax of the focus along it)
  function spawnVehicle(v, rMin, rMax, hidden, ahead = false) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const e = nearEdges[Math.floor(Math.random() * nearEdges.length)];
      if (!e || (v.bus && e.axis !== 'ave') || e.len < 2 * v.half + 10 || heldEdges.has(e)) continue;
      const lane = v.bus && Math.random() < 0.8 ? e.lanes.length - 1 : Math.floor(Math.random() * e.lanes.length); // (a bus mostly in the curb lane)
      const along = (focusX - e.sx) * e.dx + (focusZ - e.sz) * e.dz;
      const minS = Math.max(v.half + 5, along - rMax);
      const maxS = Math.min(e.len - v.half - 5, along + rMax);
      if (minS > maxS) continue;
      const s = minS + Math.random() * (maxS - minS);
      const x = e.sx + e.dx * s + e.rx * e.lanes[lane];
      const z = e.sz + e.dz * s + e.rz * e.lanes[lane];
      const d = Math.hypot(x - focusX, z - focusZ);
      if (d < rMin || d > rMax) continue;
      if (ahead && attempt < 8 && (x - camX) * camFwdX + (z - camZ) * camFwdZ < 60) continue;
      if (hidden && visible(x, z, v.half + 4) && !occluded(x, z) && (attempt < 8 || nearView(x, z, v.half + 4, FAR_VIEW_SPAWN))) continue;
      if (player.active && Math.hypot(x - player.x, z - player.z) < 25) continue;
      if (parked.active && Math.hypot(x - parked.x, z - parked.z) < 25) continue;
      if (blockers.some((k) => Math.hypot(x - k.x, z - k.z) < 25)) continue; // (Mog City)
      if (v.bus && buses.some((b) => b !== v && b.edge && Math.hypot(b.x - x, b.z - z) < BUS_SPACING)) continue; // (no bus convoys)
      if (!laneClear(e.occ[lane], s, v.half + 8)) continue;
      place(v, e, lane, s);
      if (ahead) turnIn(v);
      return true;
    }
    return false;
  }
  // (Mog City) spawnVehicle for one already on the roads, and a note of it (why, how far from the player, whether the
  // camera could see where it was) in recycleLog, the last 300, for a test
  const recycleLog = [];
  function note(why, x, z, r) {
    const d = Math.hypot(x - player.x, z - player.z);
    recycleLog.push({ t: Math.round(clock * 10) / 10, why, d: Math.round(d), inView: visible(x, z, r) && (d > 150 || !occluded(x, z)) });
    if (recycleLog.length > 300) recycleLog.shift();
  }
  function recycleVehicle(v, why, rMin, rMax, hidden, ahead = false) {
    const on = !!v.edge;
    const x = v.x;
    const z = v.z;
    if (!spawnVehicle(v, rMin, rMax, hidden, ahead)) return false;
    if (on) note(why, x, z, v.half + 2);
    return true;
  }
  // (Mog City) Where v's lane has it nearest (x, z), and its way there: for a wreck backing out to it (wagmi/crash)
  const spot = { x: 0, z: 0, dx: 0, dz: 1 };
  function laneSpot(v, x, z) {
    const e = v.edge;
    if (!e) return null;
    if (v.conn) {
      let best = Infinity;
      let bc = 0;
      for (let c = 0; c <= v.conn.len; c += 1) {
        curvePoint(v.conn, c, spot);
        const d = (spot.x - x) ** 2 + (spot.z - z) ** 2;
        if (d < best) {
          best = d;
          bc = c;
        }
      }
      curvePoint(v.conn, bc, spot);
    } else {
      lanePoint(e, v.lane, clamp((x - e.sx) * e.dx + (z - e.sz) * e.dz, v.half, Math.max(v.half, e.len - v.half)), spot);
    }
    return { x: spot.x, z: spot.z, yaw: Math.atan2(spot.dx, spot.dz) };
  }

  // (Mog City) The side streets round the player kept from standing empty: placed only where the camera can't see,
  // most of a side street off an avenue is out of sight behind the buildings on its corners, never in the frustum's
  // side planes, so the streets ahead of a driver emptied as he drove. Every FEED_TICK s, the side-street roads (both
  // ways) within FEED_FAR m of the player with fewer cars than their length wants (1, 2 from 90 m, 3 from 160, 4 from 230) get
  // one from far off: a car more than FEED_DONOR m away and out of sight, put in a free spot of theirs out of sight
  // too (out of view, or behind a building), FEED_NEAR m or more from him, not by its ends' stop lines
  const FEED_NEAR = 35;
  const FEED_FAR = 170;
  const FEED_DONOR = 230;
  const FEED_TICK = 0.2;
  let feedClock = 0;
  let feedStamp = 0;
  const feedEdges = [];
  const feedStats = { ticks: 0, short: 0, noDonor: 0, noSpot: 0, placed: 0 }; // (for a test)
  const occCount = (e) => {
    let n = 0;
    for (const list of e.occ) n += list.length;
    return n;
  };
  const backOf = (e) => {
    if (e.back === undefined) e.back = e.to.out.find((f) => f.to === e.from && f.axis === e.axis) || null;
    return e.back;
  };
  // Behind a building from the camera: a point of the line to it, 6 m on from the lens to 3 m short of it, inside a
  // block's building lots (5 m in from its curb: past the sidewalk), not a park's or a median's. Not from up high
  function occluded(x, z) {
    if (!hasView || camY > 22) return false;
    const { blockAt } = window.NYC;
    const dx = x - camX;
    const dz = z - camZ;
    const D = Math.hypot(dx, dz);
    for (let t = 6; t < D - 3; t += 4) {
      const px = camX + (dx * t) / D;
      const pz = camZ + (dz * t) / D;
      const b = blockAt(px, pz);
      if (!b || b.median || b.park > 0.4) continue;
      if (b.rect ? Math.min(px - b.minX, b.maxX - px, pz - b.minZ, b.maxZ - pz) > 5 : b.area > 1500) return true;
    }
    return false;
  }
  const unseen = (x, z, r) => !visible(x, z, r) || occluded(x, z);
  function feedSideStreets(dt) {
    if ((feedClock -= dt) > 0 || !hasView) return;
    feedClock = FEED_TICK;
    feedStamp++;
    // the roads short of cars, the ones ahead of the player (or the camera, on foot) first, then the nearer
    const moving = Math.abs(player.vx) + Math.abs(player.vz) > 1;
    const hx = moving ? player.vx : camFwdX;
    const hz = moving ? player.vz : camFwdZ;
    let best = null;
    let bestScore = Infinity;
    for (const e of feedEdges) {
      if (e.fed === feedStamp || heldEdges.has(e) || e.feedHold > clock) continue;
      const b = backOf(e);
      e.fed = feedStamp;
      if (b) b.fed = feedStamp;
      const L = Math.max(e.len, b ? b.len : 0);
      const want = L < 45 ? 0 : L < 90 ? 1 : L < 160 ? 2 : L < 230 ? 3 : 4;
      if (occCount(e) + (b ? occCount(b) : 0) >= want) continue;
      const t = clamp((focusX - e.sx) * e.dx + (focusZ - e.sz) * e.dz, 0, e.len);
      const d = Math.hypot(e.sx + e.dx * t - focusX, e.sz + e.dz * t - focusZ);
      if (d > FEED_FAR) continue;
      const score = d - ((e.mx - focusX) * hx + (e.mz - focusZ) * hz > 0 ? 80 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    feedStats.ticks++;
    if (!best) return;
    feedStats.short++;
    // the donor: the furthest car out of sight past FEED_DONOR m, not wrecked, not crossing or committed to a junction
    let donor = null;
    let donorD = FEED_DONOR;
    for (const v of cars) {
      if (!v.edge || v.wreck || v.conn || v.claimed || v.commit || v.placedAt === tick) continue;
      const d = Math.hypot(v.x - focusX, v.z - focusZ);
      if (d > donorD && unseen(v.x, v.z, v.half + 2)) {
        donorD = d;
        donor = v;
      }
    }
    if (!donor) {
      feedStats.noDonor++;
      return;
    }
    const b = backOf(best);
    for (let attempt = 0; attempt < 8; attempt++) {
      const e = b && Math.random() < 0.5 ? b : best;
      if (!e.lanes.length || e.len < 2 * donor.half + 30) continue;
      const lane = Math.floor(Math.random() * e.lanes.length);
      const s = donor.half + 8 + Math.random() * (e.len - 2 * donor.half - 25);
      const x = e.sx + e.dx * s + e.rx * e.lanes[lane];
      const z = e.sz + e.dz * s + e.rz * e.lanes[lane];
      const d = Math.hypot(x - focusX, z - focusZ);
      // (the near end of a long road first: a car or two to drive round when he turns into it, not one at its far end)
      if (d < FEED_NEAR || (attempt < 5 && d > 110) || !unseen(x, z, donor.half + 3) || held(x, z, donor.half)) continue;
      if (player.active && Math.hypot(x - player.x, z - player.z) < 25) continue;
      if (parked.active && Math.hypot(x - parked.x, z - parked.z) < 25) continue;
      if (blockers.some((k) => Math.hypot(x - k.x, z - k.z) < 25)) continue;
      if (!laneClear(e.occ[lane], s, donor.half + 10)) continue;
      note('feed', donor.x, donor.z, donor.half + 2);
      place(donor, e, lane, s);
      feedStats.placed++;
      return;
    }
    // (nowhere out of sight on it just now: the others first, for a second or two)
    best.feedHold = clock + 1.5;
    if (b) b.feedHold = best.feedHold;
    feedStats.noSpot++;
  }

  // =========================================================================
  // 7. PEDESTRIANS
  // =========================================================================
  const KERB = 1.6; // how far along a crosswalk track pedestrians wait to cross (the curb is 2 m along)
  const track = { ax: 0, az: 0, ux: 0, uz: 1, len: 1, node: null, side: 0, line: 0 };
  const walkable2D = (ax, az, bx, bz) =>
    walkable(Math.min(ax, bx) - 0.4, Math.max(ax, bx) + 0.4, Math.min(az, bz) - 0.4, Math.max(az, bz) + 0.4);

  // Along the sidewalk on either side of edge e, between its crosswalks. Grid edges test the strip in one box against
  // the sidewalk rectangles; centreline streets (any direction, where those rectangles only roughly fill the sidewalks)
  // every 3 m, on the curb island (city-config.js blockAt) and clear of obstacles
  const { blockAt } = window.NYC;
  function sidewalkTrack(e) {
    const off = (Math.random() < 0.5 ? 1 : -1) * (e.half + 1.4 + Math.random() * 2.6);
    const ax = e.sx + e.rx * off;
    const az = e.sz + e.rz * off;
    if (e.general) {
      for (let s = 0; s < e.len + 3; s += 3) {
        const t = Math.min(s, e.len);
        const x = ax + e.dx * t;
        const z = az + e.dz * t;
        if (!walkable(x - 0.4, x + 0.4, z - 0.4, z + 0.4) || !blockAt(x, z)) return false;
      }
    } else {
      if (!walkable2D(ax, az, ax + e.dx * e.len, az + e.dz * e.len)) return false;
      for (let s = 0; s < e.len + 3; s += 3) {
        const t = Math.min(s, e.len);
        if (!onSidewalk(ax + e.dx * t, az + e.dz * t)) return false;
      }
    }
    Object.assign(track, { ax, az, ux: e.dx, uz: e.dz, len: e.len, node: null, side: 0, line: 0 });
    return true;
  }

  // Over one of the crosswalks of intersection n, curb to curb plus 2 m of sidewalk at each end: across the street
  // (side 0 east / 1 west of the avenue) or across the avenue (side 2 south / 3 north of the street). Each walks its
  // own line over the 2.5 m wide crosswalk, clear of its centre line (where the signal poles stand on the corners):
  // across the street on either half, across the avenue on the outer half only, so that on each corner those waiting
  // for one crosswalk stand clear of those waiting for the other. At the curb they queue in their line.
  function crosswalkTrack(n) {
    const side = Math.floor(Math.random() * 4);
    const road = n.road[side];
    if (!road) return false;
    const acrossAvenue = side >= 2;
    const sign = side % 2 === 0 ? 1 : -1;
    const line = (acrossAvenue || Math.random() < 0.5 ? sign : -sign) * (0.5 + Math.random() * 0.55);
    const ax = acrossAvenue ? road.x0 - road.half - 2 : n.x + sign * (n.hx + 1.25) + line;
    const az = acrossAvenue ? n.z + sign * (n.hz + 1.25) + line : road.z0 - road.half - 2;
    const len = 2 * road.half + 4;
    const ux = acrossAvenue ? 1 : 0;
    const uz = acrossAvenue ? 0 : 1;
    if (!walkable2D(ax, az, ax + ux * len, az + uz * len)) return false;
    if (!onSidewalk(ax, az) || !onSidewalk(ax + ux * len, az + uz * len)) return false;
    Object.assign(track, { ax, az, ux, uz, len, node: n, side, line });
    return true;
  }

  // Who is at (or just past) the curbs of each intersection's crosswalks, for whoever comes up behind to queue
  const QUEUE_GAP = 0.62; // m from one person standing in a queue to the next
  const curbNodes = [];
  const curbProgress = (p) => (p.dir > 0 ? p.t : p.len - p.t); // m along its way over (the curb it waits at is KERB)
  function atCurb(p) {
    if (curbProgress(p) > KERB + 0.5) return;
    if (!p.node.curb.length) curbNodes.push(p.node);
    p.node.curb.push(p);
  }
  function gatherCurbs() {
    for (const n of curbNodes) n.curb.length = 0;
    curbNodes.length = 0;
    for (const p of peds) if (p.placed && p.node) atCurb(p);
  }

  // Put p on a random sidewalk or crosswalk rMin..rMax metres from the focus, out of view if `hidden`
  function spawnPed(p, rMin, rMax, hidden) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const crosswalk = p.crossesStreets && nearSignals.length > 0;
      const ok = crosswalk
        ? crosswalkTrack(nearSignals[Math.floor(Math.random() * nearSignals.length)])
        : nearEdges.length > 0 && sidewalkTrack(nearEdges[Math.floor(Math.random() * nearEdges.length)]);
      if (!ok) continue;
      const t = crosswalk ? (Math.random() < 0.5 ? Math.random() * KERB : track.len - Math.random() * KERB) : Math.random() * track.len;
      const x = track.ax + track.ux * t;
      const z = track.az + track.uz * t;
      const d = Math.hypot(x - focusX, z - focusZ);
      if (d < rMin || d > rMax || (hidden && visible(x, z, 2))) continue;
      if (holds.length && held(x, z, 1)) continue; // (Mog City: a hold zone)
      if (crosswalk && track.node.curb.some((q) => Math.hypot(q.x - x, q.z - z) < QUEUE_GAP)) continue;
      Object.assign(p, track);
      p.t = t;
      p.dir = t < track.len * 0.5 ? 1 : -1;
      p.x = x;
      p.z = z;
      p.v = crosswalk ? 0 : p.speed;
      p.pause = 0;
      p.rig.placed = false; // stands afresh where it now is
      p.placed = true;
      if (crosswalk) atCurb(p);
      return true;
    }
    return false;
  }

  // Do people on crosswalk `side` have the WALK? Across the avenue with the cross street's traffic, across the street
  // with the avenue's.
  const walkOn = (side) => (side >= 2 ? stWalk : aveWalk);

  // May p step off the curb onto its crosswalk? On the WALK (early in the parallel traffic's green, so red for the
  // traffic arriving over it), once no vehicle is crossing it or committed to, and none is too close to stop
  function mayCross(p) {
    const n = p.node;
    if (!walkOn(p.side) || n.crossing[p.side] > 0) return false;
    const e = n.approach[p.side];
    if (!e) return true;
    for (const list of e.occ) {
      const lead = leadOf(list);
      if (lead && !canStop(lead, e, true)) return false;
    }
    return true;
  }

  // Walk the track, easing to a stop at its ends and turning round on the spot; on a crosswalk, slow to a stop at the
  // curb until it may cross, or behind whoever stands ahead in its line. Vehicles give way to those on it and, on the
  // WALK, to those waiting at the curb to step off.
  const PED_ACCEL = 1.3; // m/s^2 setting off
  const PED_BRAKE = 1.6; // m/s^2 easing to a stop
  const TURN_TIME = 0.85; // s turning round at the end of the track
  const walkedNodes = [];
  function walk(p, dt) {
    if (p.pause > 0) p.pause = Math.max(0, p.pause - dt);
    const ahead = p.dir > 0 ? p.len - p.t : p.t;
    let vMax = p.pause > 0 ? 0 : Math.min(p.speed, Math.sqrt(2 * PED_BRAKE * ahead));
    if (p.node) {
      // room to walk before standing: up to the curb unless p may cross, and up to the back of whoever is ahead
      const s = curbProgress(p);
      let room = s <= KERB && !mayCross(p) ? KERB - s : Infinity;
      for (const q of p.node.curb) {
        if (q === p || q.node !== p.node || q.side !== p.side || q.dir !== p.dir || Math.abs(q.line - p.line) > 0.55) continue;
        const gap = curbProgress(q) - s;
        if (gap > 0) room = Math.min(room, Math.max(0, gap - QUEUE_GAP));
      }
      vMax = Math.min(vMax, Math.sqrt(2 * PED_BRAKE * room));
    }
    p.v += Math.max(-2 * PED_BRAKE * dt, Math.min(PED_ACCEL * dt, vMax - p.v));
    let t = p.t + p.dir * p.v * dt;
    const stepsOff = !!p.node && (p.dir > 0 ? p.t <= KERB && t > KERB : p.t >= p.len - KERB && t < p.len - KERB);
    p.waiting = stepsOff && !mayCross(p);
    if (p.waiting) {
      t = p.t;
      p.v = 0;
    }
    // (Mog City: ...or at the edge of a hold zone)
    if (holds.length && held(p.ax + p.ux * t, p.az + p.uz * t, 0.5) && !held(p.x, p.z, 0.5)) {
      t = p.t;
      p.dir = -p.dir;
      p.v = 0;
      p.pause = TURN_TIME;
    } else if (p.dir > 0 ? t >= p.len : t <= 0) {
      t = p.dir > 0 ? p.len : 0;
      p.dir = -p.dir;
      p.v = 0;
      p.pause = TURN_TIME;
    }
    p.t = t;
    p.x = p.ax + p.ux * t;
    p.z = p.az + p.uz * t;
    if (p.node && ((t > KERB && t < p.len - KERB) || (p.waiting && walkOn(p.side)))) {
      p.coord = p.side >= 2 ? p.x : p.z;
      if (!p.node.walkers.length) walkedNodes.push(p.node);
      p.node.walkers.push(p);
    }
  }

  // =========================================================================
  // 8. RENDERING
  // =========================================================================
  // Beyond CAR_PROXY_DISTANCE, cars use the ~250-triangle stand-in with built-in wheels instead of the full lofted
  // body + 4 separate wheel instances; vehicles outside the view frustum (with a margin for cast shadows and headlight
  // cones) are skipped altogether.
  const CAR_PROXY_DISTANCE = 90;
  const dirtyPaint = new Set();
  const dirtyState = new Set();
  const litVehicles = [];
  let litVehicleCount = 0;
  let wheelCars = 0;
  let visibleCars = 0;
  let nypdDrawn = 0;
  let visibleBuses = 0;
  let updates = 0;

  function flagRange(attr, n) {
    attr.clearUpdateRanges();
    attr.addUpdateRange(0, n * attr.itemSize);
    attr.needsUpdate = true;
  }

  // 3D spinning alloy wheels & tires (left & right, front & rear), exact 1:1 ground rolling, steering front wheels.
  // The wheel geometry is modelled at baseRadius (the sedan's 0.35 m car wheel), scaled to the vehicle's radius
  function placeWheels(v, i, rotY, roll, radius, halfTrack, halfBase, leftInst, rightInst, baseRadius = 0.35) {
    const sinY = Math.sin(rotY);
    const cosY = Math.cos(rotY);
    const scale = radius / baseRadius;
    dummy.scale.set(scale, scale, scale);
    for (let w = 0; w < 2; w++) {
      const wz = w === 0 ? halfBase : -halfBase;
      dummy.rotation.set(v.wheelSpin + w * 0.55, rotY + (w === 0 ? v.steer : 0), roll, 'YXZ');
      dummy.position.set(v.x - halfTrack * cosY + wz * sinY, radius, v.z + halfTrack * sinY + wz * cosY);
      dummy.updateMatrix();
      leftInst.setMatrixAt(i * 2 + w, dummy.matrix);

      dummy.position.set(v.x + halfTrack * cosY + wz * sinY, radius, v.z - halfTrack * sinY + wz * cosY);
      dummy.updateMatrix();
      rightInst.setMatrixAt(i * 2 + w, dummy.matrix);
    }
  }

  // Lamp state for the car & bus materials: brake lights while slowing down or standing, the turn signal on the side
  // v is heading for (left = +x)
  function writeLampState(v, array, o) {
    const blinkOn = v.blink !== 0 && (clock + v.blinkPhase) % 0.8 <= 0.4;
    array[o] = v.acc < -0.8 || v.speed < 0.3 ? 1 : 0;
    array[o + 1] = blinkOn && v.blink < 0 ? 1 : 0;
    array[o + 2] = blinkOn && v.blink > 0 ? 1 : 0;
  }

  function renderCar(c) {
    const rotY = c.yaw + c.yawOffset;
    const sinY = Math.sin(rotY);
    const cosY = Math.cos(rotY);
    const spec = BODY_SPECS[c.bodyType];
    const forwardDist = (c.x - c.prevX) * sinY + (c.z - c.prevZ) * cosY;
    const rawStep = forwardDist / spec.wheelRadius;
    c.wheelSpin = (c.wheelSpin + Math.sign(rawStep) * Math.min(Math.abs(rawStep), 0.48)) % (Math.PI * 2);
    if (hasView && !visible(c.x, c.z, 18)) return;

    const near = Math.hypot(c.x - focusX, c.z - focusZ) < CAR_PROXY_DISTANCE;
    const bodyInst = near ? bodies[c.bodyType].near : bodies[c.bodyType].far;
    const slot = bodyInst.count++;

    dummy.position.set(c.x, 0.0, c.z);
    dummy.rotation.set(c.pitch, rotY, c.roll, 'YXZ');
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    bodyInst.setMatrixAt(slot, dummy.matrix);
    if (c.isNYPD) nypdBarInst.setMatrixAt(nypdDrawn++, dummy.matrix);

    const attrs = bodyInst.geometry.attributes;
    const paint = attrs.paintColor.array;
    const o3 = slot * 3;
    if (paint[o3] !== c.paint[0] || paint[o3 + 1] !== c.paint[1] || paint[o3 + 2] !== c.paint[2]) {
      paint[o3] = c.paint[0];
      paint[o3 + 1] = c.paint[1];
      paint[o3 + 2] = c.paint[2];
      dirtyPaint.add(bodyInst);
    }
    const state = attrs.carState.array;
    const o4 = slot * 4;
    const blinkOn = c.blink !== 0 && (clock + c.blinkPhase) % 0.8 <= 0.4;
    const b0 = c.acc < -0.8 || c.speed < 0.3 ? 1 : 0;
    const b1 = blinkOn && c.blink < 0 ? 1 : 0;
    const b2 = blinkOn && c.blink > 0 ? 1 : 0;
    const b3 = c.isNYPD ? 1 : 0;
    if (state[o4] !== b0 || state[o4 + 1] !== b1 || state[o4 + 2] !== b2 || state[o4 + 3] !== b3) {
      state[o4] = b0;
      state[o4 + 1] = b1;
      state[o4 + 2] = b2;
      state[o4 + 3] = b3;
      dirtyState.add(bodyInst);
    }

    // Soft Under-Car Contact Shadow (AO) stays flat on the asphalt
    const visIdx = visibleCars++;
    dummy.rotation.set(0, rotY, 0, 'YXZ');
    dummy.position.set(c.x, 0.018, c.z);
    dummy.scale.set(2.22, 1.0, 5.05);
    dummy.updateMatrix();
    carShadowInst.setMatrixAt(visIdx, dummy.matrix);

    const dxCam = c.x - camX;
    const dzCam = c.z - camZ;
    const distSq = dxCam * dxCam + dzCam * dzCam + camY * camY;
    if (distSq < MAX_LIGHT_DIST_SQ) {
      const d = Math.sqrt(distSq);
      const forwardDot = dxCam * camFwdX + dzCam * camFwdZ;
      const effDist = d + Math.max(0, 5.0 - forwardDot) * 3.2;
      if (effDist < MAX_LIGHT_DIST) {
        c._camDistSq = distSq;
        c._effDist = effDist;
        c._sinY = sinY;
        c._cosY = cosY;
        c._braking = b0;
        litVehicles[litVehicleCount++] = c;
      }
    }

    if (near) {
      placeWheels(c, wheelCars++, rotY, c.roll, spec.wheelRadius, spec.wheelX, spec.wheelZ, carWheelLeftInst, carWheelRightInst);
    }
  }

  function renderBus(b) {
    const rotY = b.yaw + b.yawOffset;
    const sinY = Math.sin(rotY);
    const cosY = Math.cos(rotY);
    const forwardDist = (b.x - b.prevX) * sinY + (b.z - b.prevZ) * cosY;
    const rawStep = forwardDist / BUS_SPEC.wheelRadius;
    b.wheelSpin = (b.wheelSpin + Math.sign(rawStep) * Math.min(Math.abs(rawStep), 0.48)) % (Math.PI * 2);
    if (hasView && !visible(b.x, b.z, 22)) return;

    const i = visibleBuses++;
    dummy.position.set(b.x, 0.018, b.z);
    dummy.rotation.set(0, rotY, 0, 'YXZ');
    dummy.scale.set(2.92, 1.0, 12.1);
    dummy.updateMatrix();
    busShadowInst.setMatrixAt(i, dummy.matrix);

    // Lofted Bus Body is defined in ground-relative Y (0.36m skirt to 3.0m roof crown)
    dummy.position.set(b.x, 0.0, b.z);
    dummy.rotation.set(b.pitch, rotY, b.roll, 'YXZ');
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    busBodyInst.setMatrixAt(i, dummy.matrix);
    busHeaderInst.setMatrixAt(i, dummy.matrix);
    writeLampState(b, busStates.array, i * 4);

    const dxCam = b.x - camX;
    const dzCam = b.z - camZ;
    const distSq = dxCam * dxCam + dzCam * dzCam + camY * camY;
    if (distSq < MAX_LIGHT_DIST_SQ) {
      const d = Math.sqrt(distSq);
      const forwardDot = dxCam * camFwdX + dzCam * camFwdZ;
      const effDist = d + Math.max(0, 5.0 - forwardDot) * 3.2;
      if (effDist < MAX_LIGHT_DIST) {
        b._camDistSq = distSq;
        b._effDist = effDist;
        b._sinY = sinY;
        b._cosY = cosY;
        b._braking = b.acc < -0.8 || b.speed < 0.3 ? 1 : 0;
        litVehicles[litVehicleCount++] = b;
      }
    }

    placeWheels(b, i, rotY, 0, BUS_SPEC.wheelRadius, BUS_SPEC.wheelX, BUS_SPEC.wheelZ, busWheelLeftInst, busWheelRightInst, BUS_SPEC.wheelRadius);
  }

  function smoothDistFade(d, start, end) {
    const t = clamp((end - d) / (end - start), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function updateTrafficLights() {
    litVehicles.length = litVehicleCount;
    if (litVehicleCount > 1) {
      litVehicles.sort((a, b) => a._effDist - b._effDist);
    }

    const glow = cityUniforms && cityUniforms.uInteriorGlow ? cityUniforms.uInteriorGlow.value : 0.48;
    // Front headlights are off during Midday (0.24) & Golden Hour (0.48); fade in smoothly for Dusk (1.25) & Night (1.55)
    const beamScale = clamp((glow - 0.60) * 1.45, 0.0, 1.28);
    const tailScale = clamp(0.18 + glow * 0.66, 0.24, 1.22);

    const maxDualVehicles = HEADLIGHT_POOL_SIZE >> 1;
    const vehCutoff = litVehicleCount > maxDualVehicles
      ? Math.min(MAX_LIGHT_DIST, litVehicles[maxDualVehicles]._effDist)
      : MAX_LIGHT_DIST;
    let spotUsed = 0;
    if (beamScale > 0.001) {
      for (let i = 0; i < litVehicleCount && spotUsed + 2 <= HEADLIGHT_POOL_SIZE; i++) {
        const v = litVehicles[i];
        const fade = smoothDistFade(v._effDist, vehCutoff * 0.62, vehCutoff);
        if (fade <= 0.001) continue;
        const spec = v.bus ? BUS_SPEC : BODY_SPECS[v.bodyType];
        const fullReach = HEADLIGHTS.distance;
        let maxReach = fullReach;
        if (player.active && v.pAhead > 0 && v.pAhead < 30) {
          const latWeight = smoothDistFade(Math.abs(v.pRight), 2.2, 5.5);
          const clampedReach = Math.max(4.5, v.pAhead - player.halfL - 1.5);
          maxReach = fullReach + (clampedReach - fullReach) * latWeight;
        }

        const baseInt = (v.bus ? HEADLIGHTS.busIntensity : HEADLIGHTS.intensity) * beamScale * fade;
        // Match the body instance, including suspension and impact rotation.
        dummy.position.set(v.x, 0, v.z);
        dummy.rotation.set(v.pitch, v.yaw + v.yawOffset, v.roll, 'YXZ');
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        for (let side = -1; side <= 1; side += 2) {
          const spot = headlightPool[spotUsed++];
          placeVehicleHeadlight(spot, spec, side, dummy.matrix);
          spot.distance = maxReach;
          spot.intensity = baseInt;
        }
      }
    }
    for (let i = spotUsed; i < HEADLIGHT_POOL_SIZE; i++) {
      const spot = headlightPool[i];
      spot.intensity = 0;
      spot.position.set(0, -1000, 0);
    }

    // 1. NYPD emergency roof lightbar flashes (smoothly pulsing red/blue 360° PointLights on nearby patrol cruisers)
    let nypdUsed = 0;
    for (let i = 0; i < litVehicleCount && nypdUsed < NYPD_LIGHT_POOL_SIZE; i++) {
      const v = litVehicles[i];
      if (!v.isNYPD || v._effDist >= 88) continue;
      const fade = smoothDistFade(v._effDist, 52, 88);
      if (fade <= 0.001) continue;
      const wave = Math.sin((clock + v.blinkPhase) * Math.PI * 6.0);
      const redPhase = wave >= 0;
      const pulse = 0.35 + 0.65 * Math.abs(wave);
      const side = redPhase ? -0.36 : 0.36;
      const pt = nypdLightPool[nypdUsed++];
      pt.color.setHex(redPhase ? 0xff1828 : 0x1868ff);
      pt.position.set(v.x + side * v._cosY - 0.25 * v._sinY, 1.85, v.z - side * v._sinY - 0.25 * v._cosY);
      pt.distance = 12.0;
      pt.intensity = 42.0 * tailScale * fade * pulse;
    }
    for (let i = nypdUsed; i < NYPD_LIGHT_POOL_SIZE; i++) {
      const pt = nypdLightPool[i];
      pt.intensity = 0;
      pt.position.set(0, -1000, 0);
    }
  }

  // Walking surface around a pedestrian: sidewalks are 0.22 m above the road, and crosswalk tracks start and end
  // with 2 m of sidewalk (the rig steps down and up the curbs)
  const SIDEWALK_Y = 0.22;
  const CROSSWALK_Y = 0.012;
  function pedGround(p, x, z) {
    if (!p.node) return SIDEWALK_Y;
    const t = (x - p.ax) * p.ux + (z - p.az) * p.uz;
    return t > 2 && t < p.len - 2 ? CROSSWALK_Y : SIDEWALK_Y;
  }

  // Every rig's gait advances every frame; only those the camera may see (or whose shadow it may see) solve their
  // bone transforms and are drawn, the far ones with the light LOD.
  function renderPed(p, dt) {
    const draw = !hasView || visible(p.x, p.z, 7);
    p.rig.update(dt, p.x, p.z, Math.atan2(p.ux * p.dir, p.uz * p.dir), pedGround, p, 0, draw);
    if (!draw) return;
    pedCrowd.add(p.rig, Math.hypot(p.x - focusX, p.z - focusZ));
  }

  function updateSparks(dt) {
    let count = 0;
    for (let s = 0; s < MAX_SPARKS; s++) {
      const sp = sparks[s];
      if (sp.life > 0) {
        sp.life -= dt;
        sp.vy -= 22.0 * dt;
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.z += sp.vz * dt;
        if (sp.y < 0.03) {
          sp.y = 0.03;
          sp.vy = Math.abs(sp.vy) * 0.45;
          sp.vx *= 0.78;
          sp.vz *= 0.78;
        }
        const tLife = Math.max(0, sp.life / sp.maxLife);
        const spdXZ = Math.hypot(sp.vx, sp.vz) || 0.001;
        const yawSp = Math.atan2(sp.vx, sp.vz);
        const pitchSp = -Math.atan2(sp.vy, spdXZ);
        dummy.position.set(sp.x, sp.y, sp.z);
        dummy.rotation.set(pitchSp, yawSp, 0, 'YXZ');
        dummy.scale.set(tLife, tLife, Math.max(0.4, Math.min(2.2, spdXZ * 0.16)) * tLife);
        dummy.updateMatrix();
        sparkInst.setMatrixAt(count++, dummy.matrix);
      }
    }
    // Keep one degenerate instance for shader warm-up, then hide the empty pool and stop uploading it.
    sparkInst.visible = count > 0 || updates <= 2;
    if (count === 0 && updates <= 2) sparkInst.setMatrixAt(count++, zero);
    sparkInst.count = count;
    if (count > 0) flagRange(sparkInst.instanceMatrix, count);
  }

  // =========================================================================
  // 9. UPDATE
  // =========================================================================
  let lastFocusX = Infinity;
  let lastFocusZ = Infinity;
  let vehicleCursor = 0; // (Mog City, from 7fdaf15)

  function update(dt, elapsed, focusPos = null, playerEntity = null, activeMode = 'car', camera = null) {
    clock = elapsed;
    tick++;
    avePhase = signalPhase(elapsed, true);
    stPhase = signalPhase(elapsed, false);
    aveWalk = walkSignal(elapsed, true);
    stWalk = walkSignal(elapsed, false);
    focusX = focusPos ? focusPos.x : 0;
    focusZ = focusPos ? focusPos.z : 140;
    // a jump of the camera (teleport, first frame): everything far away can be placed anywhere around it
    const jump = Math.hypot(focusX - lastFocusX, focusZ - lastFocusZ) > 140;
    lastFocusX = focusX;
    lastFocusZ = focusZ;
    refreshNear();
    updateView(camera);

    player.active = Boolean(playerEntity && activeMode !== 'helicopter' && playerEntity.position.y < 2.6);
    player.car = player.active && activeMode === 'car'; // (Mog City: the traffic's look-ahead for him, driving only)
    if (playerEntity) {
      const heading = playerEntity.heading || 0;
      const speed = playerEntity.speed || 0;
      player.entity = playerEntity;
      player.x = playerEntity.position.x;
      player.z = playerEntity.position.z;
      player.vx = Math.sin(heading) * speed + (playerEntity.vx || 0);
      player.vz = Math.cos(heading) * speed + (playerEntity.vz || 0);
    }
    // (Mog City: Dan's car, standing where he left it)
    const pc = activeMode !== 'car' && window.__NYC_APP && window.__NYC_APP.controllerManager && window.__NYC_APP.controllerManager.entities.car;
    parked.active = !!(pc && pc.mesh && pc.mesh.visible && pc.position.y < 2.6);
    if (parked.active) {
      parked.x = pc.position.x;
      parked.z = pc.position.z;
      parked.yaw = pc.heading || 0;
      if (pc.body) {
        parked.halfW = pc.body.hx;
        parked.halfL = (pc.body.z1 - pc.body.z0) / 2;
      }
    }
    // (Mog City: Dan's car's body, driven or parked, for blockedAhead and separate: its box round its own middle)
    {
      const qc = activeMode === 'car' ? playerEntity : parked.active ? pc : null;
      const B = qc && qc.body;
      playerBody.on = !!(B && qc.position.y < 2.6 && (activeMode === 'car' || parked.active));
      if (playerBody.on) {
        const h = qc.heading || 0;
        const cz = (B.z1 + B.z0) / 2;
        Object.assign(playerBody, { x: qc.position.x + Math.sin(h) * cz, z: qc.position.z + Math.cos(h) * cz, yaw: h, bodyW: B.hx, bodyL: (B.z1 - B.z0) / 2 });
      }
    }
    // (a car with a body of its own, Dan's: its half width & length)
    const pb = activeMode === 'car' && playerEntity && playerEntity.body;
    player.halfW = activeMode === 'cyclist' ? 0.35 : activeMode === 'person' ? 0.32 : pb ? pb.hx : 0.86;
    player.halfL = activeMode === 'cyclist' ? 0.85 : activeMode === 'person' ? 0.32 : pb ? (pb.z1 - pb.z0) / 2 : 2.18;
    player.push = activeMode === 'cyclist' ? 0.82 : activeMode === 'person' ? 0.88 : 0.50;

    // 1. Cars & buses
    // (Mog City, ported from Slop New York by Mr.doob, MIT, commit 7fdaf15: 4 vehicles a frame, round the pool, further
    // than VEHICLE_RADIUS, put 100..NEAR_RADIUS m away, while he drives the roads round the corners ahead first (standing,
    // that would feed one street until it jammed); not a wreck (wagmi/crash has it), nor one in plain view nearer than
    // 1200 m, which would vanish. After a jump, everything far, anywhere)
    const driving = !jump && Math.hypot(player.vx, player.vz) > 5;
    let recycle = jump ? vehicles.length : 4;
    for (let scanned = 0; scanned < vehicles.length && recycle > 0; scanned++) {
      const v = vehicles[vehicleCursor];
      vehicleCursor = (vehicleCursor + 1) % vehicles.length;
      if (v.wreck) continue;
      const d = v.edge ? Math.hypot(v.x - focusX, v.z - focusZ) : Infinity;
      if (d <= (jump ? NEAR_RADIUS : VEHICLE_RADIUS)) continue;
      if (!jump && d < 1200 && visible(v.x, v.z, v.half + 2) && !occluded(v.x, v.z)) continue;
      recycle--;
      recycleVehicle(v, jump ? 'jump' : 'far', jump ? 0 : 100, NEAR_RADIUS, !jump, driving);
    }
    buildOccupancy();
    for (const m of bodyMeshes) m.count = 0;
    litVehicleCount = 0;
    wheelCars = 0;
    visibleCars = 0;
    nypdDrawn = 0;
    visibleBuses = 0;
    let budget = jump ? Infinity : 4;
    if (!jump && activeMode !== 'helicopter') feedSideStreets(dt); // (Mog City)
    buildGrid();
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      const d = v.edge ? Math.hypot(v.x - focusX, v.z - focusZ) : Infinity;
      if (!v.edge) {
        // (not placed yet: the recycling above places it)
      } else if (heldEdges.size && (heldEdges.has(v.edge) || held(v.x, v.z, v.half + 1))) {
        if (!recycleVehicle(v, 'hold', 120, NEAR_RADIUS, true)) recycleVehicle(v, 'hold', 120, 900, false); // (Mog City: a hold zone)
      } else if (v.placedAt === tick) {
        // (Mog City: placed this frame already)
      } else if (budget > 0 && v.wait > JAM_WAIT && (unseen(v.x, v.z, v.half + 2) || (d > 120 && behindAnother(v))) && recycleVehicle(v, 'jam', 100, 300, true)) {
        budget--; // stuck in a jam out of view (Mog City: or behind a building, or 120 m off behind another vehicle): somewhere else
      } else if (budget > 0 && v.bus && !v.wreck && d > 60 && !visible(v.x, v.z, v.half + 2) &&
        buses.some((b) => b !== v && b.edge && b.id < v.id && Math.abs(b.x - v.x) + Math.abs(b.z - v.z) < 45) && recycleVehicle(v, 'bunch', 100, 300, true)) {
        budget--; // (Mog City) a bus bunched up with another, out of view: somewhere else
      } else if (budget > 0 && v.bus && v.edge.axis !== 'ave' && unseen(v.x, v.z, v.half + 2) && recycleVehicle(v, 'bus', 100, 300, true)) {
        budget--; // (Mog City) a bus on a side street, out of view: back on an avenue
      } else if (v.wait > 40 && !v.wreck) {
        unjam(v); // (Mog City) stood 40 s in view: its queue noses on
      }
      if (!v.edge) continue;

      v.prevX = v.x;
      v.prevZ = v.z;
      // (Mog City: wrecked, wagmi/crash moves it, sliding, spinning, standing there, until it hands it back to its lane;
      // and in the car that crashes itself, playerEntity.crash, the crash meets the traffic, not collideWithPlayer)
      if (v.wreck && !v.wreck(v, dt)) v.wreck = null;
      if (!v.wreck) {
        relateToPlayer(v);
        drive(v, dt);
        locate(v);
        knock(v, dt);
        pose(v, dt);
      }
      if (player.active && !playerEntity.crash) collideWithPlayer(v, v.yaw + v.yawOffset, v.bus ? 1.30 : v.isSUV ? 0.92 : 0.86, v.bus ? 5.72 : v.isSUV ? 2.22 : 2.18);
      if (parked.active) pushOffParked(v, v.yaw + v.yawOffset, v.bodyW, v.bodyL);
      if (v.vx * v.vx + v.vz * v.vz > 0.36) knockOn(v);

      if (v.bus) renderBus(v);
      else renderCar(v);
    }
    separate();
    const hideEmpty = ++updates > 2;
    for (const m of bodyMeshes) {
      const n = m.count;
      m.visible = n > 0 || !hideEmpty;
      if (n === 0) {
        if (!hideEmpty) {
          m.setMatrixAt(0, zero);
          m.count = 1;
          flagRange(m.instanceMatrix, 1);
        }
        continue;
      }
      flagRange(m.instanceMatrix, n);
      if (dirtyPaint.has(m)) flagRange(m.geometry.attributes.paintColor, n);
      if (dirtyState.has(m)) flagRange(m.geometry.attributes.carState, n);
    }
    dirtyPaint.clear();
    dirtyState.clear();
    const syncInst = (inst, n) => {
      inst.visible = n > 0 || !hideEmpty;
      if (n === 0) {
        if (!hideEmpty) {
          inst.setMatrixAt(0, zero);
          inst.count = 1;
          flagRange(inst.instanceMatrix, 1);
        } else {
          inst.count = 0;
        }
        return;
      }
      inst.count = n;
      flagRange(inst.instanceMatrix, n);
    };
    syncInst(carWheelLeftInst, wheelCars * 2);
    syncInst(carWheelRightInst, wheelCars * 2);
    syncInst(nypdBarInst, nypdDrawn);
    syncInst(carShadowInst, visibleCars);
    syncInst(busBodyInst, visibleBuses);
    syncInst(busHeaderInst, visibleBuses);
    syncInst(busWheelLeftInst, visibleBuses * 2);
    syncInst(busWheelRightInst, visibleBuses * 2);
    syncInst(busShadowInst, visibleBuses);
    if (visibleBuses > 0) flagRange(busStates, visibleBuses);
    updateTrafficLights();

    // 2. Pedestrians
    for (const n of walkedNodes) n.walkers.length = 0;
    walkedNodes.length = 0;
    gatherCurbs();
    let pedBudget = jump ? Infinity : 6;
    if (pedCrowd) pedCrowd.begin();
    for (let i = 0; i < NUM_PEDS; i++) {
      const p = peds[i];
      // (Mog City: knocked down by a car, wagmi/street moves and draws them until it hands them back out of view)
      if (p.away) { if (p.away(p)) continue; p.away = null; if (!spawnPed(p, 60, NEAR_RADIUS, true)) spawnPed(p, 60, 900, false); }
      const d = p.placed ? Math.hypot(p.x - focusX, p.z - focusZ) : Infinity;
      if (!p.placed || (jump && d > NEAR_RADIUS)) {
        spawnPed(p, 0, NEAR_RADIUS, false);
      } else if (holds.length && held(p.x, p.z, 0.5)) {
        if (!spawnPed(p, 60, NEAR_RADIUS, true)) spawnPed(p, 60, 900, false); // (Mog City: a hold zone)
      } else if (pedBudget > 0 && (d > 1000 || (d > PED_RADIUS && !visible(p.x, p.z, 2))) && spawnPed(p, 60, 260, true)) {
        pedBudget--;
      }
      if (!p.placed) continue;
      walk(p, dt);
      renderPed(p, dt);
    }
    if (pedCrowd) pedCrowd.end();

    // 3. Collision sparks, including the player's own impacts against buildings
    if (playerEntity && playerEntity.lastCollisionSpark) {
      const bs = playerEntity.lastCollisionSpark;
      spawnCollisionSparks(bs.x, bs.y, bs.z, bs.nx, bs.nz, bs.speed);
      playerEntity.lastCollisionSpark = null;
    }
    updateSparks(dt);
  }

  return {
    group,
    update,
    cars,
    buses,
    peds,
    network,
    hold, // (Mog City)
    unwreck, // (Mog City)
    laneSpot, // (Mog City)
    recycleLog, // (Mog City)
    blockers, // (Mog City)
    feedStats // (Mog City)
  };
}

// ============================================================================
// AMBIENT SHORE-HIGHWAY TRAFFIC (West Side Highway, Henry Hudson Parkway, FDR Drive)
// ============================================================================
// The shore highways city-grid.js lays along both rivers are not part of the road graph, so a lighter model fills
// them: cars follow each lane's centre line and keep their distance with the IDM. Nobody changes lanes, so the order
// in a lane never changes and every car's leader is simply the next one (cyclically: cars dip below the deck at the
// end of a lane as if into an underpass and come back up at its start; West St and the FDR's lanes are joined through
// the Battery Park Underpass, lane points well below ground). Cars queue behind the player standing or
// driving in their lane. Within HWY_NEAR_LOD m of the camera they use the full model with wheels and cast shadows,
// up to HWY_MID_LOD m a wheel-less body, further out a coarse ~250-triangle lofted proxy; beyond HWY_FAR_CULL m (or well behind
// the camera) they aren't drawn.
const HWY_DRIVER = { a: 1.6, b: 2.8, T: 1.3, s0: 3.0 };
const HWY_CAR_LEN = 4.6;
const HWY_NEAR_LOD = 170;
const HWY_MID_LOD = 450;
const HWY_FAR_CULL = 1600;
const HWY_RAMP = 32; // the dip at the lane ends: 2.4 m down over this many metres

function createHighwayTraffic(scene, lanes) {
  const group = new THREE.Group();
  group.name = 'HighwayTraffic';
  scene.add(group);
  const KINDS = ['taxi', 'sedan', 'suv'];
  const PALETTES = {
    taxi: [0xffbe14],
    sedan: [0x1c2026, 0xcfd6de, 0x1d3b6c, 0x52575e, 0x6e1f24, 0x8a8f96, 0xe9ecef],
    suv: [0x16191e, 0xf0f3f7, 0x3a434d, 0x28382e, 0xbec6cf, 0x5b2a2a]
  };
  let seed = 20240917;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // Lanes: arc length and heading at every centre-line vertex, bounds for the player test, cars every 24-74 m
  const cars = [];
  const counts = { taxi: 0, sedan: 0, suv: 0 };
  for (const lane of lanes) {
    const P = lane.pts;
    lane.cum = [0];
    for (let i = 1; i < P.length; i++) lane.cum.push(lane.cum[i - 1] + P[i].distanceTo(P[i - 1]));
    lane.len = lane.cum[P.length - 1];
    lane.yaw = P.map((p, i) => {
      const a = P[Math.max(0, i - 1)];
      const b = P[Math.min(P.length - 1, i + 1)];
      return Math.atan2(b.x - a.x, b.z - a.z);
    });
    lane.box = [Infinity, -Infinity, Infinity, -Infinity];
    for (const p of P) lane.box = [Math.min(lane.box[0], p.x), Math.max(lane.box[1], p.x), Math.min(lane.box[2], p.z), Math.max(lane.box[3], p.z)];
    lane.cars = [];
    for (let u = rand() * 30; u < lane.len - 12; u += 24 + rand() * 50) {
      const h = rand();
      const kind = h < 0.20 ? 'taxi' : h < 0.65 ? 'sedan' : 'suv'; // (Mog City, after Slop New York a1866b7: was 0.32 / 0.72)
      const col = new THREE.Color(PALETTES[kind][Math.floor(rand() * PALETTES[kind].length)]);
      // (float32 values, so update() can tell whether an instance slot's paint changes by comparing with the buffer)
      const car = { lane, kind, u, v: lane.speed, acc: 0, seg: 0, col: [Math.fround(col.r), Math.fround(col.g), Math.fround(col.b)] };
      lane.cars.push(car);
      cars.push(car);
      counts[kind]++;
    }
  }

  // Per body type: [near (with wheels, casts shadows), mid (wheel-less), far (lofted proxy)] instanced meshes sharing
  // the traffic's cached car material (per-instance paintColor & carState)
  const meshes = {};
  for (const kind of KINDS) {
    const spec = BODY_SPECS[kind];
    const n = Math.max(1, counts[kind]);
    meshes[kind] = [0, 1, 2].map((lod) => {
      const geo = lod === 2 ? buildCarProxyGeometry(spec) : buildCarGeometry(spec, lod === 0);
      geo.setAttribute('paintColor', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute('carState', new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4));
      const mesh = new THREE.InstancedMesh(geo, createLoftedCarMaterial(spec), n);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = lod === 0;
      mesh.receiveShadow = true;
      group.add(mesh);
      return mesh;
    });
  }

  // Night lamp flares: a soft glow on every head- and tail-lamp, at least a couple of pixels wide, so the highways read
  // as streams of white and red lights from across the river once the lamp geometry shrinks below a pixel.
  // (flareCol is rgb + an unused w: 3-component attributes get re-padded to 4 on every upload)
  const flarePos = new Float32Array(cars.length * 4 * 4); // x, y, z, size
  const flareCol = new Float32Array(cars.length * 4 * 4); // r, g, b, -
  const flareGeo = new THREE.PlaneGeometry(1, 1);
  flareGeo.setAttribute('flarePos', new THREE.InstancedBufferAttribute(flarePos, 4));
  flareGeo.setAttribute('flareCol', new THREE.InstancedBufferAttribute(flareCol, 4));
  const flares = new THREE.Mesh(flareGeo, createCarFlareMaterial());
  flares.name = 'HighwayLampFlares';
  flares.frustumCulled = false;
  flares.visible = false;
  flares.renderOrder = 2;
  group.add(flares);
  let flareCount = 0;

  // Clustered SpotLight pool for nearby highway cars (within 105 m)
  const HWY_SPOT_POOL = 28;
  const HWY_LIGHT_DIST = 105;
  const HWY_LIGHT_DIST_SQ = HWY_LIGHT_DIST * HWY_LIGHT_DIST;
  const hwyLightsGroup = new THREE.Group();
  hwyLightsGroup.name = 'HighwayClusteredLights';
  group.add(hwyLightsGroup);

  const hwySpotPool = [];
  for (let i = 0; i < HWY_SPOT_POOL; i++) {
    const spot = createVehicleHeadlight();
    spot.position.set(0, -1000, 0);
    spot.target.position.set(0, -1001, 0);
    hwyLightsGroup.add(spot, spot.target);
    hwySpotPool.push(spot);
  }
  const hwyLitCars = [];
  let hwyLitCount = 0;
  function addFlare(px, py, pz, size, r, g, b) {
    const o = flareCount * 4;
    flarePos[o] = px;
    flarePos[o + 1] = py;
    flarePos[o + 2] = pz;
    flarePos[o + 3] = size;
    const k = flareCount * 4;
    flareCol[k] = r;
    flareCol[k + 1] = g;
    flareCol[k + 2] = b;
    flareCount++;
  }
  const flareFacing = (f) => { const t = Math.min(1, Math.max(0, (f + 0.3) / 0.9)); return t * t * (3 - 2 * t); };

  const D = HWY_DRIVER;
  const brakeTerm = 2 * Math.sqrt(D.a * D.b);
  const ease = (x) => { const t = Math.min(1, Math.max(0, x / HWY_RAMP)); return t * t * (3 - 2 * t); };
  const easeSlope = (x) => { if (x <= 0 || x >= HWY_RAMP) return 0; const t = x / HWY_RAMP; return (6 * t * (1 - t)) / HWY_RAMP; };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const pos = new THREE.Vector3();
  const ONE = new THREE.Vector3(1, 1, 1);
  const fwd = new THREE.Vector3();
  const dirtyPaint = new Set();
  const dirtyState = new Set();
  let updates = 0;
  // Flags the first n items of an attribute for upload (static usage: once per frame, not once per render pass)
  function flagRange(attr, n) {
    attr.clearUpdateRanges();
    attr.addUpdateRange(0, n * attr.itemSize);
    attr.needsUpdate = true;
  }

  // The player's arc position and speed along `lane` if they are in it (within 2 m of the centre line and near
  // its road height, not on its underground stretches), else null
  function playerInLane(lane, pl) {
    const [x0, x1, z0, z1] = lane.box;
    if (pl.x < x0 - 3 || pl.x > x1 + 3 || pl.z < z0 - 3 || pl.z > z1 + 3) return null;
    const P = lane.pts;
    for (let i = 0; i + 1 < P.length; i++) {
      if (P[i].y < -1 && P[i + 1].y < -1) continue;
      const ax = P[i].x, az = P[i].z;
      const sx = P[i + 1].x - ax, sz = P[i + 1].z - az;
      const horizontalLengthSq = sx * sx + sz * sz;
      if (horizontalLengthSq === 0) continue;
      const L = lane.cum[i + 1] - lane.cum[i];
      const t = ((pl.x - ax) * sx + (pl.z - az) * sz) / horizontalLengthSq;
      if (t < 0 || t > 1) continue;
      const y = P[i].y + (P[i + 1].y - P[i].y) * t;
      if (Math.abs(pl.y - y) >= 2.6) continue;
      if (Math.abs((pl.z - az) * sx - (pl.x - ax) * sz) / Math.sqrt(horizontalLengthSq) < 2.0) {
        // Convert horizontal progress to distance along the sloped lane, as with u above.
        return { u: lane.cum[i] + t * L, v: Math.max(0, ((pl.vx * sx + pl.vz * sz) / horizontalLengthSq) * L) };
      }
    }
    return null;
  }

  function update(dt, camera, entity, mode) {
    // 1. Car following (IDM) in every lane, the player counting as a leader
    const pl = entity && mode !== 'helicopter' ? {
      x: entity.position.x, y: entity.position.y, z: entity.position.z,
      vx: Math.sin(entity.heading || 0) * (entity.speed || 0) + (entity.vx || 0),
      vz: Math.cos(entity.heading || 0) * (entity.speed || 0) + (entity.vz || 0)
    } : null;
    for (const lane of lanes) {
      const list = lane.cars;
      const n = list.length;
      const pIn = pl ? playerInLane(lane, pl) : null;
      for (let k = 0; k < n; k++) {
        const c = list[k];
        let gap = Infinity;
        let dv = 0;
        if (n > 1) {
          const lead = list[(k + 1) % n];
          gap = lead.u - c.u;
          if (gap < 0) gap += lane.len;
          gap -= HWY_CAR_LEN;
          dv = c.v - lead.v;
        }
        if (pIn && pIn.u > c.u && pIn.u - c.u - HWY_CAR_LEN < gap) {
          gap = pIn.u - c.u - HWY_CAR_LEN;
          dv = c.v - pIn.v;
        }
        const sStar = D.s0 + Math.max(0, c.v * D.T + (c.v * dv) / brakeTerm);
        c.acc = Math.max(-9, D.a * (1 - (c.v / lane.speed) ** 4 - (sStar / Math.max(gap, 0.1)) ** 2));
      }
      for (const c of list) {
        c.v = Math.max(0, c.v + c.acc * dt);
        c.u += c.v * dt;
        if (c.u >= lane.len) {
          c.u -= lane.len;
          c.seg = 0;
        }
      }
    }
    // (Mog City) Never into Dan's car (wagmi/crash meets these in its own steps): one its move put into it since is
    // set back (or on) along its lane out of it, at the car's pace along it
    const qb = entity && mode === 'car' && entity.body;
    if (qb) {
      const h = entity.heading || 0;
      const cz = (qb.z1 + qb.z0) / 2;
      const qx = entity.position.x + Math.sin(h) * cz;
      const qz = entity.position.z + Math.cos(h) * cz;
      const qhl = (qb.z1 - qb.z0) / 2;
      for (const p of near(qx, qz, 12, hwyNear)) {
        const pen = boxPen(p.x, p.z, p.yaw, p.hw, p.hl, qx, qz, h, qb.hx, qhl);
        if (pen <= 0.02) continue;
        const fx = Math.sin(p.yaw);
        const fz = Math.cos(p.yaw);
        const ahead = (qx - p.x) * fx + (qz - p.z) * fz > 0;
        p.c.u = Math.max(0, Math.min(p.c.lane.len - 0.01, p.c.u + (ahead ? -1 : 1) * (pen + 0.05)));
        const along = (pl ? pl.vx * fx + pl.vz * fz : 0);
        if (ahead) p.c.v = Math.max(0, Math.min(p.c.v, along));
      }
    }

    // 2. Instances: LOD by distance, far cars well behind the camera skipped; lamp flares at dusk & night
    const cam = camera.position;
    camera.getWorldDirection(fwd);
    for (const kind of KINDS) for (const mesh of meshes[kind]) mesh.count = 0;
    const flaresOn = cityUniforms.uInteriorGlow.value > 0.65;
    const pxAt1m = (2 * Math.tan(((camera.fov || 55) * Math.PI) / 360)) / Math.max(360, window.innerHeight || 800);
    flareCount = 0;
    hwyLitCount = 0;
    for (const c of cars) {
      const lane = c.lane;
      const cum = lane.cum;
      while (c.seg < cum.length - 2 && cum[c.seg + 1] < c.u) c.seg++;
      const i = c.seg;
      const segLen = cum[i + 1] - cum[i];
      const t = Math.min(1, Math.max(0, (c.u - cum[i]) / segLen));
      const a = lane.pts[i];
      const b = lane.pts[i + 1];
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const toEnd = lane.len - c.u;
      const dip = c.u < toEnd ? c.u : toEnd;
      const y = a.y + (b.y - a.y) * t - 2.4 * (1 - ease(dip));
      const dx = x - cam.x;
      const dz = z - cam.z;
      const dy = y - cam.y;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > HWY_FAR_CULL * HWY_FAR_CULL) continue;
      const lod = d2 < HWY_NEAR_LOD * HWY_NEAR_LOD ? 0 : d2 < HWY_MID_LOD * HWY_MID_LOD ? 1 : 2;
      if (lod > 0 && dx * fwd.x + dz * fwd.z < -40) continue;
      if (y < -3.6) continue; // in the Battery Park Underpass, out of sight behind the portals' screens
      const slope = (b.y - a.y) / segLen + 2.4 * easeSlope(dip) * (c.u < toEnd ? 1 : -1);
      let dYaw = lane.yaw[i + 1] - lane.yaw[i];
      if (dYaw > Math.PI) dYaw -= Math.PI * 2;
      else if (dYaw < -Math.PI) dYaw += Math.PI * 2;
      const yaw = lane.yaw[i] + dYaw * t;
      euler.set(-Math.atan(slope), yaw, 0);
      q.setFromEuler(euler);
      m4.compose(pos.set(x, y, z), q, ONE);
      const mesh = meshes[c.kind][lod];
      const slot = mesh.count++;
      m4.toArray(mesh.instanceMatrix.array, slot * 16);
      // Paint & brake lights change only when a slot changes hands or a car brakes: flagged for upload just then
      const attrs = mesh.geometry.attributes;
      const paint = attrs.paintColor.array;
      const o3 = slot * 3;
      if (paint[o3] !== c.col[0] || paint[o3 + 1] !== c.col[1] || paint[o3 + 2] !== c.col[2]) {
        paint.set(c.col, o3);
        dirtyPaint.add(mesh);
      }
      const brake = c.acc < -1.2 ? 1 : 0; // brake lights
      if (attrs.carState.array[slot * 4] !== brake) {
        attrs.carState.array[slot * 4] = brake;
        dirtyState.add(mesh);
      }

      if (d2 < HWY_LIGHT_DIST_SQ && dip > 1) {
        const d = Math.sqrt(d2);
        const forwardDot = dx * fwd.x + dz * fwd.z;
        const effDist = d + Math.max(0, 5.0 - forwardDot) * 3.2;
        if (effDist < HWY_LIGHT_DIST) {
          c._d2 = d2;
          c._effDist = effDist;
          c._mesh = mesh;
          c._slot = slot;
          c._brake = brake;
          hwyLitCars[hwyLitCount++] = c;
        }
      }

      // Flares (from 40 m out, full by 120 m): sprites just off the lamp faces, white at the front and red at the back,
      // brightest seen head-on / from behind, dimmed by haze
      if (!flaresOn || d2 < 1600 || dip < 1) continue;
      const d = Math.sqrt(d2);
      const sy = Math.sin(yaw);
      const cy = Math.cos(yaw);
      const facing = -(dx * sy + dz * cy) / d;
      const k = (Math.min(1, (d - 40) / 80) / (1 + (d / 2000) ** 2)) * ease(dip);
      const size = Math.max(0.6, d * pxAt1m * 3);
      const spec = BODY_SPECS[c.kind];
      for (let e = 0; e < 2; e++) {
        const front = e === 0;
        const w = k * (0.3 + 0.7 * flareFacing(front ? facing : -facing));
        const lz = front ? spec.zFront + 0.3 : spec.zRear - 0.3;
        const ly = y + (front ? spec.lamps[0] : spec.lamps[1]);
        for (let s = -1; s <= 1; s += 2) {
          const lx = s * spec.lampX[front ? 0 : 1];
          if (front) addFlare(x + lx * cy + lz * sy, ly, z - lx * sy + lz * cy, size, 4.4 * w, 4.1 * w, 3.6 * w);
          else addFlare(x + lx * cy + lz * sy, ly, z - lx * sy + lz * cy, size, 3.4 * w, 0.16 * w, 0.1 * w);
        }
      }
    }
    // Upload just the instances in use (the buffers hold every car of the kind), and nothing for empty meshes, which
    // are hidden too (an empty instanced mesh still costs a render object update in every pass). They stay visible
    // for the first couple of frames so that the shader precompile & warm-up frame (main.js) see all of them.
    const hideEmpty = ++updates > 2;
    for (const kind of KINDS) {
      for (const mesh of meshes[kind]) {
        const n = mesh.count;
        mesh.visible = n > 0 || !hideEmpty;
        if (n === 0) continue;
        flagRange(mesh.instanceMatrix, n);
        if (dirtyPaint.has(mesh)) flagRange(mesh.geometry.attributes.paintColor, n);
        if (dirtyState.has(mesh)) flagRange(mesh.geometry.attributes.carState, n);
      }
    }
    dirtyPaint.clear();
    dirtyState.clear();
    flares.visible = flareCount > 0;
    flares.count = flareCount;
    if (flareCount > 0) {
      flagRange(flareGeo.attributes.flarePos, flareCount);
      flagRange(flareGeo.attributes.flareCol, flareCount);
    }

    // Update clustered highway SpotLights (dual left/right beams for nearby cars)
    hwyLitCars.length = hwyLitCount;
    if (hwyLitCount > 1) {
      hwyLitCars.sort((a, b) => a._effDist - b._effDist);
    }
    const glow = cityUniforms && cityUniforms.uInteriorGlow ? cityUniforms.uInteriorGlow.value : 0.48;
    const beamScale = clamp((glow - 0.60) * 1.45, 0.0, 1.28);
    const maxHwyVeh = HWY_SPOT_POOL >> 1;
    const hwyCutoff = hwyLitCount > maxHwyVeh
      ? Math.min(HWY_LIGHT_DIST, hwyLitCars[maxHwyVeh]._effDist)
      : HWY_LIGHT_DIST;
    let spotUsed = 0;
    if (beamScale > 0.001) {
      for (let i = 0; i < hwyLitCount && spotUsed + 2 <= HWY_SPOT_POOL; i++) {
        const c = hwyLitCars[i];
        const t = clamp((hwyCutoff - c._effDist) / Math.max(1, hwyCutoff * 0.38), 0, 1);
        const fade = (t * t * (3 - 2 * t)) * ease(Math.min(c.u, c.lane.len - c.u));
        if (fade <= 0.001) continue;
        const spec = BODY_SPECS[c.kind];
        const baseInt = HEADLIGHTS.intensity * beamScale * fade;
        // Reuse the exact rendered transform, including the road slope and underpass dip.
        c._mesh.getMatrixAt(c._slot, m4);
        for (let side = -1; side <= 1; side += 2) {
          const spot = hwySpotPool[spotUsed++];
          placeVehicleHeadlight(spot, spec, side, m4);
          spot.intensity = baseInt;
        }
      }
    }
    for (let i = spotUsed; i < HWY_SPOT_POOL; i++) {
      const spot = hwySpotPool[i];
      spot.intensity = 0;
      spot.position.set(0, -1000, 0);
    }
  }

  // (Mog City) For what runs into them, Dan's car (wagmi/crash): where a car is, { x, y, z, yaw, hw, hl, c } (its
  // body's half width & length), or null down in the underpass; the cars within r of (x, z); knock(c, dv): a blow along
  // its lane, its speed changed by dv (never below 0: it stops, and the IDM brings it back up)
  function place(c, out = {}) {
    const lane = c.lane;
    const cum = lane.cum;
    let i = Math.min(c.seg, cum.length - 2);
    while (i < cum.length - 2 && cum[i + 1] < c.u) i++;
    while (i > 0 && cum[i] > c.u) i--;
    const t = Math.min(1, Math.max(0, (c.u - cum[i]) / ((cum[i + 1] - cum[i]) || 1)));
    const a = lane.pts[i];
    const b = lane.pts[i + 1];
    const y = a.y + (b.y - a.y) * t;
    if (y < -1) return null;
    out.x = a.x + (b.x - a.x) * t;
    out.y = y;
    out.z = a.z + (b.z - a.z) * t;
    out.yaw = Math.atan2(b.x - a.x, b.z - a.z);
    out.hw = bodyHalf[c.kind][0];
    out.hl = bodyHalf[c.kind][1];
    out.c = c;
    return out;
  }
  const bodyHalf = {};
  for (const kind of KINDS) {
    const spec = BODY_SPECS[kind];
    bodyHalf[kind] = [spec.halfWidth ? Math.max(...spec.halfWidth.map((p) => p[1])) : 0.93, spec.zFront ?? HWY_CAR_LEN / 2];
  }
  const hwyNear = [];
  // the least overlap of two boxes on the ground (middle, yaw, half width, half length), 0 apart
  function boxPen(ax, az, ay, aw, al, bx, bz, by, bw, bl) {
    const ca = Math.cos(ay), sa = Math.sin(ay), cb = Math.cos(by), sb = Math.sin(by);
    let pen = Infinity;
    for (const [nx, nz] of [[ca, -sa], [sa, ca], [cb, -sb], [sb, cb]]) {
      const ra = aw * Math.abs(nx * ca - nz * sa) + al * Math.abs(nx * sa + nz * ca);
      const rb = bw * Math.abs(nx * cb - nz * sb) + bl * Math.abs(nx * sb + nz * cb);
      const p = ra + rb - Math.abs((ax - bx) * nx + (az - bz) * nz);
      if (p <= 0) return 0;
      if (p < pen) pen = p;
    }
    return pen;
  }
  // (a lane runs for miles: only the cars along the stretch of it that comes within r are placed)
  function near(x, z, r, out = []) {
    out.length = 0;
    for (const lane of lanes) {
      const [x0, x1, z0, z1] = lane.box;
      if (x < x0 - r || x > x1 + r || z < z0 - r || z > z1 + r) continue;
      const P = lane.pts;
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i + 1 < P.length; i++) {
        const a = P[i];
        const b = P[i + 1];
        if (Math.min(a.x, b.x) > x + r || Math.max(a.x, b.x) < x - r || Math.min(a.z, b.z) > z + r || Math.max(a.z, b.z) < z - r) continue;
        if (lane.cum[i] < lo) lo = lane.cum[i];
        if (lane.cum[i + 1] > hi) hi = lane.cum[i + 1];
      }
      if (lo > hi) continue;
      for (const c of lane.cars) {
        if (c.u < lo || c.u > hi) continue;
        const p = place(c);
        if (p && Math.abs(p.x - x) < r && Math.abs(p.z - z) < r) out.push(p);
      }
    }
    return out;
  }
  const knock = (c, dv) => { c.v = Math.max(0, c.v + dv); };

  return { group, update, cars, lanes, place, near, knock };
}

Object.assign(window.NYC, { createTrafficSystem, createHighwayTraffic });
})();
