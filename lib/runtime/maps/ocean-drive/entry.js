/*
 * Ocean Drive as a GameMog runtime map: the district of StarKnightt/ocean-drive
 * (MIT, Prasenjit; LICENSE beside this file) built into a world's scene, with
 * what an open world needs to play in it: where you can walk (boxes, circles,
 * the ground's height, the bounds), the lanes the traffic drives, and one
 * update() a frame. The first-person walker, the rideable bike and ATV, the
 * people and the page's own renderer are left out; the runtime brings its own.
 * Changes to the original source are listed in NOTICE.md.
 */
import * as THREE from 'three';
import { createSky } from './src/sky.js';
import { buildPlaceholders } from './src/world/placeholders.js';
import { buildHotels } from './src/world/hotels.js';
import { buildPalms, PALM_TREES } from './src/world/palms.js';
import { buildStreet, STREET_COLLIDERS } from './src/world/street.js';
import { buildCars, makeSedan, MODERN } from './src/world/car.js';
import { createOcean } from './src/world/ocean.js';
import { createSurf } from './src/world/surf.js';
import { buildBeach } from './src/world/beach.js';
import * as LAYOUT from './src/world/layout.js';
import { updateLod } from './src/world/lod.js';
import { createBirds } from './src/world/birds.js';
import { QUALITY } from './src/quality.js';
import { buildEdges } from './edges.js';

export const layout = LAYOUT;
export const quality = QUALITY;

/* Traffic on Ocean Drive: two lanes, one each way, cars at their own speeds with gaps between.
 * (GameMog) The district is shut at both ends now (edges.js), so a car drives
 * up to the roadblock, stops behind it (or behind the car ahead), and is
 * taken away only when nobody is looking, to come in again at the other end,
 * also out of sight. */
function makeTraffic(count) {
  const { LANES, DISTRICT } = LAYOUT, END = DISTRICT.zMax - 7, cars = [];
  for (let i = 0; i < count; i++) {
    const dir = i % 2 ? -1 : 1;
    cars.push({ id: i + 1, dir, x: dir > 0 ? LANES.centerX - 1.75 : LANES.centerX + 1.75, cruise: 9 + (i * 2.3) % 5, speed: 0, z: -dir * END * (0.9 - i * 0.35), active: true, progress: 0 });
  }
  const V = new THREE.Vector3(), F = new THREE.Frustum(), PM = new THREE.Matrix4();
  const unseen = (camera, x, z) => {
    if (!camera) return true;
    if (Math.hypot(camera.position.x - x, camera.position.z - z) > 150) return true;
    PM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); F.setFromProjectionMatrix(PM);
    return !F.containsPoint(V.set(x, 0.8, z)) && Math.hypot(camera.position.x - x, camera.position.z - z) > 40;
  };
  let walkers = [];
  return {
    cars,
    // (GameMog) people in the road: a car stops short of anyone in its lane
    yieldTo(list) { walkers = Array.isArray(list) ? list : []; },
    step(dt, camera) {
      for (const c of cars) {
        // stop at the barriers, or a car length behind whoever is stopped there, or short of someone crossing
        let stopAt = END;
        for (const o of cars) if (o !== c && o.dir === c.dir) { const ahead = (o.z - c.z) * c.dir; if (ahead > 0 && ahead < 60) stopAt = Math.min(stopAt, o.z * c.dir - 6.5); }
        for (const w of walkers) if (Math.abs(w.x - c.x) < 1.6) { const ahead = (w.z - c.z) * c.dir; if (ahead > 1 && ahead < 30) stopAt = Math.min(stopAt, w.z * c.dir - 5); }
        const left = stopAt - c.z * c.dir;
        const want = left < 1 ? 0 : Math.min(c.cruise, Math.sqrt(2 * 3.2 * Math.max(0, left - 1)));
        c.speed = Math.max(0, c.speed + Math.max(-7, Math.min(3, (want - c.speed) * 2)) * dt);
        c.z += c.dir * c.speed * dt;
        // at the roadblock and out of sight: round again from the other end, if that is out of sight too
        if (c.z * c.dir > END - 12 && c.speed < 0.5 && unseen(camera, c.x, c.z) && unseen(camera, c.x, -c.dir * END)
          && !cars.some((o) => o !== c && o.dir === c.dir && Math.abs(o.z + c.dir * END) < 12)) { c.z = -c.dir * END; c.speed = c.cruise * 0.8; }
        c.progress = Math.min(0.999, Math.max(0.001, (c.z * c.dir + 900) / 1800));
      }
      return cars;
    },
  };
}

export async function build({ renderer, scene, frame = () => Promise.resolve(), traffic = 3 } = {}) {
  let shadowWanted = true, shadowAt = -1;
  const requestShadow = () => { shadowWanted = true; };
  const sky = await createSky(renderer, scene, { requestShadow });
  await frame();
  buildPlaceholders(scene);
  const hotels = await buildHotels(scene, frame);
  await frame();
  const palms = buildPalms(scene);
  buildStreet(scene);
  await frame();
  const cars = buildCars(scene);
  const surf = createSurf({});
  const beach = buildBeach(scene, surf);
  await frame();
  const ocean = createOcean(scene, surf);
  const birds = createBirds(scene, { beach, surf, shot: false });
  const flow = makeTraffic(traffic);

  const { HOTEL, DISTRICT } = LAYOUT;
  const walk = {
    heightAt: beach.heightAt,
    boxes: [
      ...STREET_COLLIDERS.filter((c) => c.min), ...cars.colliders, ...beach.colliders,
      ...hotels.userData.footprints.map((f) => ({ min: { x: -80, y: -5, z: f.z0 }, max: { x: f.fx, y: 60, z: f.z1 } })),
    ],
    circles: [
      ...STREET_COLLIDERS.filter((c) => c.r),
      ...PALM_TREES.filter((t) => Math.abs(t.z) < DISTRICT.zMax + 10).map((t) => ({ x: t.x, z: t.z, r: 0.26 })),
    ],
    bounds: { x0: HOTEL.patioX + 0.2, x1: 110, z0: DISTRICT.zMin, z1: DISTRICT.zMax },
  };
  // where the district stops, something you can see stops you (edges.js): the
  // alleys and cross streets open 20 m back to walls and barriers, the ends are
  // fenced, and the sea is yours to the buoys
  const edges = buildEdges(scene, { groundAt: beach.groundAt, footprints: hotels.userData.footprints, requestShadow });
  walk.boxes.push(...edges.boxes); walk.circles.push(...edges.circles); walk.bounds = edges.bounds;
  void HOTEL;
  let elapsed = 0;
  return {
    sky, sun: sky.sun, beach, walk, layout: LAYOUT, quality: QUALITY, traffic: flow.cars, yieldTo: flow.yieldTo,
    // where an open world's weapons may be left, and how deep the sea is (swash included)
    hideouts: edges.hideouts,
    water: { from: LAYOUT.SHORE_X - 14, level: LAYOUT.SEA_LEVEL, depthAt: (x, z) => surf.waterDepthAt(x, z) },
    update(dt, camera) {
      elapsed += dt;
      sky.update(camera);
      if (updateLod(camera)) requestShadow();
      surf.update(elapsed);
      ocean.update(elapsed, camera);
      beach.update(elapsed, camera);
      palms.update(elapsed);
      birds.update(dt, camera);
      cars.update(dt, flow.step(dt, camera));
      edges.update(elapsed);
      if (shadowWanted && elapsed - shadowAt > 0.2) { renderer.shadowMap.needsUpdate = true; shadowWanted = false; shadowAt = elapsed; }
    },
    requestShadow,
    THREE,
    // a modern car in the district's own style (sedan, suv, hatch, pickup): { object, length, height }
    sedan(paint, type = 'sedan') { const o = makeSedan(paint, scene.environment, type); return { object: o, length: MODERN[type].L, height: MODERN[type].top }; },
  };
}
