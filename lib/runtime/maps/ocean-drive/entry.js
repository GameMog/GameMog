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

export const layout = LAYOUT;
export const quality = QUALITY;

/* Traffic on Ocean Drive: two lanes, one each way, cars at their own speeds with gaps between. */
function makeTraffic(count) {
  const { LANES, WORLD_Z } = LAYOUT, span = 2 * 900, cars = [];
  for (let i = 0; i < count; i++) {
    const dir = i % 2 ? -1 : 1;
    cars.push({ id: i + 1, dir, x: dir > 0 ? LANES.centerX - 1.75 : LANES.centerX + 1.75, speed: 9 + (i * 2.3) % 5, s: (i * 0.37 + 0.1) % 1, active: true, progress: 0, z: 0 });
  }
  void WORLD_Z;
  return {
    cars,
    step(dt) {
      for (const c of cars) {
        c.s += c.speed * dt / span;
        if (c.s > 1) c.s -= 1;
        c.z = c.dir > 0 ? -900 + c.s * span : 900 - c.s * span;
        c.progress = Math.min(0.999, Math.max(0.001, c.s));
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
  let elapsed = 0;
  return {
    sky, sun: sky.sun, beach, walk, layout: LAYOUT, quality: QUALITY, traffic: flow.cars,
    update(dt, camera) {
      elapsed += dt;
      sky.update(camera);
      if (updateLod(camera)) requestShadow();
      surf.update(elapsed);
      ocean.update(elapsed, camera);
      beach.update(elapsed, camera);
      palms.update(elapsed);
      birds.update(dt, camera);
      cars.update(dt, flow.step(dt));
      if (shadowWanted && elapsed - shadowAt > 0.2) { renderer.shadowMap.needsUpdate = true; shadowWanted = false; shadowAt = elapsed; }
    },
    requestShadow,
    THREE,
    // a modern car in the district's own style (sedan, suv, hatch, pickup): { object, length, height }
    sedan(paint, type = 'sedan') { const o = makeSedan(paint, scene.environment, type); return { object: o, length: MODERN[type].L, height: MODERN[type].top }; },
  };
}
