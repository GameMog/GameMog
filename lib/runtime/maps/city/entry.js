/*
 * A district of Spiderbench's city as a GameMog runtime map (src/, Shikhar's, used with the author's permission; LICENSE and
 * NOTICE.md beside this file): blocks of buildings with their facades, the rooms seen through their windows and
 * their rooftops, the streets and sidewalks between them, and a skyline of plain masses round it, built into a
 * world's scene, with what an open world needs: where you can walk (the buildings and the rooftop clutter as boxes,
 * the ground's height, the bounds) and one update() a frame. A world gets it with open: { map: 'city' }.
 * This file is GameMog's own.
 */
import * as THREE from 'three';
import { loadCityTextures, setTextureFiles } from './src/world/textures.js';
import { createFacadeMaterial } from './src/world/facade.js';
import { generateBuildings, createDetailMaterial } from './src/world/buildings.js';
import { blocksInRect } from './src/world/layout.js';
import { buildRooftops } from './src/world/rooftops.js';
import { buildDistrictGround, terrainHeight } from './src/world/ground.js';
import { batchTiles } from './src/world/tilebatch.js';
import { KIND, BOX, CYL } from './src/world/collision.js';
import { nightK, tickNightMeshes } from './src/render/daynight.js';
import { installCityLightChunks, cityLights } from './src/render/citylights.js';
import { buildProps } from './src/world/props.js';
import { buildTrees } from './src/world/trees.js';
import { setAdCopy, setSignCopy } from './src/world/adstex.js';
import { loadVehicleModels, buildTraffic } from './src/world/vehicles.js';
import { buildPeds } from './src/world/peds.js';

// the districts the map can build: x east, z south (-z north), metres; edges on the avenues' and streets' centre lines
export const DISTRICTS = {
  midtown: { x0: -250, x1: 250, z0: -480, z1: -80, ring: 260 },
};
// the time of day: the light, the sky and how many windows are lit. The city's own lights (windows, lamps, shop
// fronts, signs) are made for an exposure that rises after dark (x4.5 at night): the map scales the world's exposure
// by `expo` and keeps its sky, moon and fill light low to match (the runtime's map fill: `fill`)
const TIMES = {
  day: { night: 0, expo: 1, sky: '#9CB8D6', fog: '#B4C6D8', sun: '#FFF1DE', sunI: 2.6, hemi: ['#C9DCF0', '#6E6458', 0.9], el: 0.9, fill: 0.45 },
  dusk: { night: 0.55, expo: 2, sky: '#3E4C76', fog: '#4E5878', sun: '#FFB27A', sunI: 0.7, hemi: ['#7E8FC4', '#3A3036', 0.32], el: 0.28, fill: 0.16 },
  night: { night: 1, expo: 4.5, sky: '#0A1022', fog: '#121A2C', sun: '#9FB4E8', sunI: 0.1, hemi: ['#33456E', '#1A1612', 0.12], el: 0.6, fill: 0.05 },
};
// rooftop solids that are worth standing on, climbing or zipping to (water towers, bulkheads, plant)
const KEEP = new Set(['watertower', 'bulkhead', 'equipment', 'spire']);

// ads / signs: a world's own copy for the billboards and the shop signs (adstex.js; e.g. an outbreak's notices).
// traffic / people: the cars on the streets and the crowd on the sidewalks (false: empty streets; a number: how many, 1 as made)
export async function build({ renderer, scene, frame = () => Promise.resolve(), district = 'midtown', time = 'dusk', assets = '/assets/city-midtown/', ads = null, signs = null, traffic: wantCars = true, people: wantPeople = true } = {}) {
  const R = typeof district === 'object' ? district : DISTRICTS[district] || DISTRICTS.midtown;
  const L = TIMES[time] || TIMES.dusk;
  const manifest = await (await fetch(assets + 'asset.json')).json();
  setTextureFiles(assets, manifest.files);
  nightK.value = L.night;
  if (ads) setAdCopy(ads);
  if (signs) setSignCopy(signs);
  // the night's own lights (street lamps, lit shop windows, signs) light every lit material: one patch to the
  // shader chunks, before the district's materials are made
  installCityLightChunks(renderer, scene);
  const T = await loadCityTextures(renderer);
  await frame();
  const facadeMat = createFacadeMaterial(T), detailMat = createDetailMaterial(T);
  const root = new THREE.Group(); root.name = 'city'; scene.add(root);

  // the district, in full: buildings, their rooftops (written into the same tiles), then the tiles as meshes
  const blocks = blocksInRect(R);
  const gen = generateBuildings(blocks, 1234, {});
  await frame();
  const rooftops = await buildRooftops({ scene: root, gen, facadeMat, T, renderer });
  await frame();
  const facG = [], detG = [], ctr = [];
  for (const t of gen.tiles.values()) { facG.push(t.fac.build()); detG.push(t.det.v ? t.det.build({ part: true }) : null); ctr.push([t.cx, t.cz]); t.fac = t.lod = t.det = null; }
  for (const b of [batchTiles(facG, facadeMat, 'facade', { castShadow: true, receiveShadow: true, merge: false }, ctr), batchTiles(detG, detailMat, 'detail', { castShadow: true, receiveShadow: true, merge: false }, ctr)])
    for (const m of b.meshes) root.add(m);
  await frame();
  // the skyline round it: the same city's blocks out to `ring` metres, as their plain far-off masses
  const Rout = { x0: R.x0 - R.ring, x1: R.x1 + R.ring, z0: R.z0 - R.ring, z1: R.z1 + R.ring };
  const inner = new Set(blocks);
  const ringBlocks = blocksInRect(Rout).filter((b) => !inner.has(b) && !blocks.some((q) => q.x0 === b.x0 && q.z0 === b.z0));
  const far = generateBuildings(ringBlocks, 1234, {});
  const lodG = [], lctr = [];
  for (const t of far.tiles.values()) { lodG.push(t.lod.build()); lctr.push([t.cx, t.cz]); t.fac = t.lod = t.det = null; }
  for (const m of batchTiles(lodG, facadeMat, 'skyline', { castShadow: false, receiveShadow: true }, lctr).meshes) root.add(m);
  await frame();
  // the streets and sidewalks of the district and the ring
  buildDistrictGround({ scene: root, T, blocks: [...blocks, ...ringBlocks], R: Rout });
  await frame();
  // the street furniture of the district: lamps (each a real light at night), signals, hydrants, trash cans,
  // newsboxes, sidewalk sheds, blade signs, bus shelters, the rooftop clutter; their solids join the buildings'
  const nSolids0 = gen.solids.count;
  const props = await buildProps({ scene: root, blocks, parkPaths: null, T, solids: gen.solids, buildings: gen.buildings, clip: R });
  await frame();
  // the street trees in their pits (and the trunks' collision with the props')
  const inR = (t) => t.x > R.x0 && t.x < R.x1 && t.z > R.z0 && t.z < R.z1;
  const trees = buildTrees({ scene: root, T, spots: (props.treeSpots || []).filter(inR), parkPaths: [] });
  await frame();
  // the life on the streets: cars on the district's streets (in from the skyline round it, off into it), stopping at its
  // lights, for the player and for the world's own people; the crowd on its sidewalks and crosswalks; pigeons
  const traffic = wantCars ? buildTraffic({ scene: root, phase: props.phase, models: await loadVehicleModels(renderer), clip: R }) : null;
  if (traffic && typeof wantCars === 'number') traffic.sim.setDensity(Math.max(0, Math.min(2, wantCars)));
  await frame();
  const peds = wantPeople ? await buildPeds({ scene: root, blocks, parkPaths: [], props, traffic, clip: R, density: typeof wantPeople === 'number' ? Math.max(0, Math.min(2, wantPeople)) : 1 }) : null;
  await frame();
  let shadowT = 0, time0 = 0;
  // the player as the street sees them: cars brake and honk, people turn to look, film, step back when they land close
  const me = { pos: new THREE.Vector3(1e9, 0, 0), vel: new THREE.Vector3(), ground: 0, air: false, landT: -9, landPos: null, t: 0, airT: 0, prevVy: 0 };
  const setPlayer = (pos, vel) => {
    const gy = terrainHeight(pos.x, pos.z), air = pos.y - gy > 0.6, dt = Math.min(0.1, Math.max(0, time0 - me.t));
    me.t = time0;
    if (air) me.airT += dt || 1 / 60;
    else { if (me.airT > 0.35 && (me.prevVy < -6 || me.airT > 1)) { me.landT = time0; me.landPos = pos.clone(); } me.airT = 0; }
    me.prevVy = vel ? vel.y : 0; me.pos.copy(pos); if (vel) me.vel.copy(vel); me.ground = gy; me.air = air;
    traffic?.sim.setPlayer(pos, vel, gy); peds?.crowd?.setPlayer(me); peds?.pigeons?.setPlayer?.(me);
  };

  // the light
  scene.background = new THREE.Color(L.sky);
  scene.fog = new THREE.Fog(L.fog, 90, R.ring + 220);
  const hemi = new THREE.HemisphereLight(L.hemi[0], L.hemi[1], L.hemi[2]); root.add(hemi);
  const sun = new THREE.DirectionalLight(L.sun, L.sunI);
  // the moon's shadows are too faint to see under the lamps: no sun shadows at night (the whole city would draw twice)
  sun.castShadow = L.night < 0.9; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 10; sc.far = 600; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  root.add(sun); root.add(sun.target);
  const SUN_DIR = new THREE.Vector3(-0.55, L.el, 0.42).normalize();

  // where you can walk: the buildings' masses and the rooftop clutter worth climbing, as boxes
  const box = (b) => ({ min: { x: b.min[0], y: b.min[1], z: b.min[2] }, max: { x: b.max[0], y: b.max[1], z: b.max[2] } });
  const boxes = gen.boxes.map(box);
  const S = gen.solids;
  for (let i = 0; i < S.count; i++) {
    if (S.f[i] & 4) continue;   // removed
    const k = KIND[S.k[i]], j = i * 6, b = S.b;
    // big enough to stand on, climb or zip to; up on a roof (the street's own clutter is the ground's)
    if (!KEEP.has(k) || b[j + 1] < 3 || b[j + 4] - b[j + 1] < 1.5 || Math.min(b[j + 3] - b[j], b[j + 5] - b[j + 2]) < 2) continue;
    boxes.push({ min: { x: b[j], y: b[j + 1], z: b[j + 2] }, max: { x: b[j + 3], y: b[j + 4], z: b[j + 5] } });
  }
  // the street's own furniture, where people walk: posts and hydrants as circles, kiosks and sheds' legs as boxes
  const circles = [];
  for (let i = nSolids0; i < S.count; i++) {
    if (S.f[i] & 4) continue;
    const j = i * 6, b = S.b, y0 = b[j + 1], y1 = b[j + 4];
    if (y0 > 1 || y1 - y0 < 0.4) continue;
    const w = b[j + 3] - b[j], d = b[j + 5] - b[j + 2];
    if (S.t[i] === CYL || (S.t[i] === BOX && Math.max(w, d) < 0.7)) circles.push({ x: (b[j] + b[j + 3]) / 2, z: (b[j + 2] + b[j + 5]) / 2, r: Math.max(0.12, Math.max(w, d) / 2) });
    else if (S.t[i] === BOX && Math.min(w, d) > 0.15) boxes.push({ min: { x: b[j], y: y0, z: b[j + 2] }, max: { x: b[j + 3], y: y1, z: b[j + 5] } });
  }
  const walk = { heightAt: (x, z) => terrainHeight(x, z), boxes, circles, bounds: { x0: R.x0 + 1, x1: R.x1 - 1, z0: R.z0 + 1, z1: R.z1 - 1 } };

  // the sun's shadows follow the camera; drawn again when it has moved or someone has
  const focus = new THREE.Vector3();
  return {
    walk, sun, district: R, time, debug: { cityLights, root },
    stats: () => ({ lights: cityLights.stats.lights, clMs: +(cityLights.stats.ms || 0).toFixed(2), calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
      cars: traffic ? traffic.sim.stats().cars : 0, people: peds?.crowd ? peds.crowd.stats().people : 0, peopleDrawn: peds?.crowd ? peds.crowd.stats().peopleDrawn : 0 }),
    buildings: gen.buildings.length, masses: gen.boxes.length, hideouts: [], fill: L.fill, exposure: L.expo,
    life: { traffic: traffic?.sim || null, crowd: peds?.crowd || null, pigeons: peds?.pigeons || null },
    // the runtime's hooks: where the player is (each frame), its own people on foot (cars stop for them), a body pushed
    // out of the cars ({push, grounded, groundY, velocity} or null), and danger (people flee, cars stop and honk)
    setPlayer,
    yieldTo(list) { traffic?.sim.yieldTo(list); },
    collide(pos, r = 0.4, h = 1.8) { return traffic ? traffic.sim.collideDynamic(pos, r, h) : null; },
    alarm(pos, r = 25) { traffic?.sim.alarm(pos, r); peds?.crowd?.alarm(pos, r); peds?.pigeons?.alarm?.(pos, r); },
    update(dt, camera) {
      shadowT += dt; time0 += dt;
      props.update(dt, camera.position, time0);
      traffic?.update(Math.min(dt, 0.1), camera, time0);
      peds?.update(Math.min(dt, 0.1), camera);
      trees?.update?.(dt, camera.position);
      rooftops?.update?.(camera);
      cityLights.build(camera);
      tickNightMeshes();
      camera.getWorldDirection(focus).multiplyScalar(25).add(camera.position); focus.y = 0;
      sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(SUN_DIR, 300);
      if (sun.castShadow && shadowT > 1 / 30) { renderer.shadowMap.needsUpdate = true; shadowT = 0; }
    },
  };
}
