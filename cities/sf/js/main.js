(function () {
// js/main.js
// Main entry point for San Francisco in Three.js WebGPURenderer & TSL (three.js dev, see index.html)
// (Mog City: San Francisco on Mog City's engine, ?city=sf. The city as Slop San Francisco builds it, with Mog City's
// game on top (wagmi/): its HUD and pause menu, its game pad (js/gamepad-controls.js), Dan's car for the robotaxi.
// Not here: the fork's settings dialog (Mog City's pause menu has the graphics and the sound) and its robotaxi ride)

const { THREE } = window.NYC;
const {
  pass,
  mrt,
  output,
  normalView,
  positionView,
  metalness,
  roughness,
  vec2,
  vec4,
  smoothstep
} = window.NYC.TSL;
const { ssr } = window.NYC.PostFX;
const { createPostProcessing } = window.NYC;
const { ClusteredLighting } = window.NYC.Addons;

const { getLocationLabel, isTypingInField } = window.NYC;
const { buildSFRegion } = window.NYC;
const { buildLandmarks } = window.NYC;
const { buildCityBlocks } = window.NYC;
const { createTrafficSystem, createHighwayTraffic } = window.NYC;
const { buildRoadPaint } = window.NYC;
const { ThirdPersonControllerManager } = window.NYC;
const { TouchControls } = window.NYC;
const { GamepadControls } = window.NYC;
const { CameraSystem, CAMERA_PRESETS } = window.NYC;
const { LightingSystem } = window.NYC;
const { NYCMapSystem } = window.NYC;
const { setupSceneCulling, updateSceneCulling } = window.NYC;
const { loadCityData, buildSFGround, buildRoadNetwork, buildSFStreetDetails, buildGradeSeparation } = window.NYC;

// Scripted camera paths for ?bench=name: keyframes [x, y, z, yawDeg, pitchDeg] spread evenly over BENCH_SECONDS
// (yaw 0 looks north, -z). Coordinates are in the current city's world frame.
const BENCH_SECONDS = new URLSearchParams(location.search).has('fogCompare') ? 40 : 20;
// San Francisco slice: street = up Grant Ave through Chinatown, car = along California St from Nob Hill to the Financial
// District, heli = a loop around the slice, hill = a turn on the spot at Nob Hill; the core (P3.6): russian-hill-view = a
// turn on the spot on Russian Hill's summit (Vallejo & Florence St, 110 m), across the whole core and the bay. The y of the
// paths in BENCH_ON_GROUND is height above the ground (Terrain.groundAt), the others' absolute
const BENCH_ON_GROUND = new Set(['street', 'car', 'hill', 'russian-hill-view', 'twin-peaks-view']);
const BENCH_PATHS = {
  'twin-peaks-view': [[-4020, 20, 3810, 0, -6], [-4020, 20, 3810, 360, -6]],
  'heli-city': [[-7000, 650, 4500, 15, -25], [-6000, 650, 0, 90, -25], [-2000, 650, -1500, 180, -25], [-1000, 650, 4000, 270, -25]],
  street: [[-391, 1.7, -727, 9, 0], [-446, 1.7, -1073, 9, 0]],
  car: [[-902, 1.4, -325, -99, -2], [-612, 1.4, -371, -99, -2], [400, 1.4, -531, -99, -2]],
  heli: [[-300, 300, 400, 0, -25], [500, 320, -400, 90, -25], [-300, 340, -1200, 180, -25], [-1100, 320, -400, 270, -25], [-300, 300, 400, 360, -25]],
  hill: [[-950, 8, -330, 0, -4], [-950, 8, -330, 360, -4]],
  'russian-hill-view': [[-1116, 8, -1052, 0, -4], [-1116, 8, -1052, 360, -4]]
};
// (Mog City) The fork's quality presets (its settings.js): low, medium and high set the region's and the trees' draw
// distance, the reflections and the shadows. The choice is Mog City's graphics row (wagmi/mission/pause.js, saved for the
// next load in 'wagmi.gfx', ?gfx= for this load): High or Low as they say, Auto the fork's own: high, then the frame
// times of the first 3 s pick (chooseQuality). window.NYC.quality is what the pause menu reads; San Francisco runs on
// WebGPU only, so there is no phone tier (Mog City's New York has one)
const QUALITY_PRESETS = {
  low: { distance: 3000, trees: 2500, reflections: false, shadows: false, reflectionScale: 0.25 },
  medium: { distance: 5000, trees: 4000, reflections: true, shadows: true, reflectionScale: 0.25 },
  high: { distance: 8500, trees: 6000, reflections: true, shadows: true, reflectionScale: 0.5 }
};
function chooseQuality(frameTimes) {
  const sorted = frameTimes.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 'medium';
  const median = sorted[Math.floor(sorted.length / 2)];
  return median > 24 ? 'low' : median > 14 ? 'medium' : 'high';
}
const GFX_KEY = 'wagmi.gfx';
// (perf) The tier from the machine (js/gfx-auto.js: window.mcGfx.probe, then pick, at the start of initApp): ?tier= /
// ?gfx= for this load, the saved choice, else Auto: low, never above it by itself on a computer, and never above low on
// WebGL 2 (no phone tier here: New York's is a low one). Before the probe (and without gfx-auto.js) the rule as it was
function createQuality(probe) {
  const G = window.mcGfx;
  let pk = null;
  try { pk = G && probe ? G.pick(probe, ['low', 'medium', 'high']) : null; } catch (e) { console.warn('[gfx] pick', e); }
  const asTier = (v) => (v === 'high' || v === 'medium' ? v : v === 'low' || v === 'phone' ? 'low' : null);
  if (!pk) {
    let override = null, saved = null;
    try { override = new URLSearchParams(location.search).get('tier') || new URLSearchParams(location.search).get('gfx'); } catch (e) { /* no URL */ }
    try { saved = localStorage.getItem(GFX_KEY); } catch (e) { /* private mode */ }
    override = asTier(override);
    const choice = asTier(saved) || 'auto';
    // (QA, 15 Nov: high was unplayable on a desktop workstation, low smooth) Auto is the low tier
    pk = { tier: override || (choice === 'auto' ? 'low' : choice), choice, override, auto: 'low', why: 'rule' };
  }
  const q = {
    tier: pk.tier, choice: pk.choice, auto: pk.auto, why: pk.why, override: pk.override, learned: pk.learned || null, probe: probe || null,
    tiers: ['high', 'medium', 'low'],
    backend: probe ? (probe.webgpu ? 'webgpu' : 'webgl2') : navigator.gpu ? 'webgpu' : 'webgl2', next: pk.tier, scale: 1,
    // (no measuring from high any more: Auto stays low on a computer, gfx-auto.js only records what it would earn)
    measuring: false,
    // (loadfix) once the renderer is up: on three's WebGL 2 backend Auto is the low tier, and stays it; a chosen tier is kept
    settle(isWebGPU) {
      q.backend = isWebGPU ? 'webgpu' : 'webgl2';
      if (isWebGPU) return;
      q.measuring = false;
      if (!q.override && q.choice === 'auto') { q.tier = q.auto = q.next = 'low'; q.why = 'webgl2'; }
    },
    set(c) {
      const v = c === 'auto' ? 'auto' : c === 'phone' ? 'low' : asTier(c) || 'auto';
      if (G) G.setChoice(v);
      else { try { if (v === 'auto') localStorage.removeItem(GFX_KEY); else localStorage.setItem(GFX_KEY, v); } catch (e) { /* private mode */ } }
      q.choice = v;
      q.next = q.override || (v === 'auto' ? q.auto : v);
      return q.next;
    },
    resetLearned() { try { G && G.resetLearned(); } catch (e) { /* none */ } q.learned = null; q.learnedSlow = false; }
  };
  return q;
}
window.NYC.quality = createQuality(null);

function samplePath(keys, u) {
  const f = u * (keys.length - 1);
  const i = Math.min(keys.length - 2, Math.floor(f));
  const t = f - i;
  const [a, b] = [keys[i], keys[i + 1]];
  const mix = (k) => a[k] + (b[k] - a[k]) * t;
  return { x: mix(0), y: mix(1), z: mix(2), yaw: mix(3), pitch: mix(4) };
}

async function initApp() {
  const container = document.getElementById('canvas-container');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingStatus = document.getElementById('loading-status');
  const loadingTrack = loadingOverlay ? loadingOverlay.querySelector('.loader-track') : null;
  const loadingFill = document.getElementById('loading-progress');
  // The loading bar sweeps while the city is being built (the main thread is busy) and fills as the shaders compile
  const setLoadingProgress = (p) => {
    // (Mog City: the start gate's instant title, index.html, draws the same as a thin line: --wg-load, wg-load-fill)
    const k = Math.min(1, Math.max(0, p));
    document.documentElement.style.setProperty('--wg-load', k.toFixed(3));
    document.documentElement.classList.add('wg-load-fill');
    if (!loadingFill) return;
    if (loadingTrack) loadingTrack.classList.remove('is-indeterminate');
    loadingFill.style.transform = `scaleX(${k})`;
  };
  // (Mog City: plain words for the player while it loads, not the engine's steps)
  // (a Hometown package: its own place's name, cities/pkg)
  const LOADING_TEXT = window.NYC.PKG ? `Loading ${String(window.NYC.PKG.name).split(',')[0]}…` : 'Loading San Francisco…';

  if (loadingStatus) {
    loadingStatus.textContent = LOADING_TEXT;
  }

  // (loadfix) The backend: WebGPU where the browser has it and hands out an adapter, three's WebGL 2 backend everywhere
  // else, so the city always runs: no WebGPU (an older browser, a blocked GPU), Firefox (its WebGPU's stricter shader
  // checks reject the shadow and reflection shaders, so it draws WebGL 2 unless ?webgpu=1), and a page reloaded after
  // the WebGPU device was lost (sessionStorage mc.gpu.lost, see onDeviceLost below). ?webgpu=0 forces WebGL 2, ?webgpu=1
  // WebGPU. On WebGL 2 the graphics are the low tier (no shadows, no reflections, no sidewalk crowd: its poses live in a
  // storage buffer). Only a browser with neither shows the card (sf-hud.js showNeedsWebGPU)
  const gpuParam = new URLSearchParams(location.search).get('webgpu');
  const isFirefox = /\bFirefox\//.test(navigator.userAgent);
  let lostBefore = false;
  try { lostBefore = sessionStorage.getItem('mc.gpu.lost') === '1'; } catch { /* storage blocked */ }
  // (perf) the machine probed once (js/gfx-auto.js, the same rule as here, and the one adapter request), and the tier
  // picked from it before anything is built
  let probe = null;
  try { probe = window.mcGfx ? await window.mcGfx.probe() : null; } catch (e) { console.warn('[gfx] probe', e); }
  let gpuOk;
  if (probe && !probe.error) gpuOk = !!probe.webgpu;
  else {
    gpuOk = !!navigator.gpu && gpuParam !== '0' && (gpuParam === '1' || (!isFirefox && !lostBefore));
    if (gpuOk) { try { gpuOk = !!(await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })); } catch { gpuOk = false; } }
  }
  if (probe) window.NYC.quality = createQuality(probe);
  const quality0 = window.NYC.quality;
  if (!gpuOk) quality0.backend = 'webgl2';

  // 1. Initialize Three.js WebGPURenderer with 32-bit float reversedDepthBuffer
  const renderer = new THREE.WebGPURenderer({
    antialias: gpuOk,
    powerPreference: 'high-performance',
    reversedDepthBuffer: true,
    forceWebGL: !gpuOk,
    trackTimestamp: new URLSearchParams(location.search).has('gpuTiming')
  });
  renderer.setPixelRatio(1.0);
  const benchmarkResolution = ['bench', 'capture', 'showcase'].some(key => new URLSearchParams(location.search).has(key)) || new URLSearchParams(location.search).get('debug')==='collisions';
  const renderSize = () => benchmarkResolution ? [1280, 720] : [window.innerWidth, window.innerHeight];
  renderer.setSize(...renderSize());
  if (benchmarkResolution) { renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; renderer.domElement.style.objectFit = 'contain'; }
  renderer.shadowMap.enabled = true;
  if (ClusteredLighting) {
    renderer.lighting = new ClusteredLighting(256, 32, 28, 48);
  }
  container.appendChild(renderer.domElement);

  // Start-up phase timings (logged once as "[init] ...") to keep load-time regressions traceable
  let initTimings = [];
  let initMark = performance.now();
  const markInit = (label) => {
    const now = performance.now();
    initTimings.push(`${label} ${Math.round(now - initMark)}ms`);
    initMark = now;
  };
  // (loadfix) The build gives the browser the main thread back between its steps: the loading screen and the title
  // gate keep animating, a tap on them is taken, and no browser calls the page unresponsive ("page is slowing down",
  // whose Stop left the HUD over no city). The terrain's regional patches are on while it waits, as anything else
  // running then expects (they are off only while the street network is built on the core's own terrain)
  const breathe = async () => {
    const T = window.NYC.Terrain, was = T.patchesEnabled;
    T.patchesEnabled = true;
    await (globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((r) => setTimeout(r, 0)));
    T.patchesEnabled = was;
  };

  try {
    await renderer.init();
  } catch (e) {
    // (loadfix) neither WebGPU nor WebGL 2: the one case the city can't run
    console.error('[gfx] no renderer', e);
    window.__MC_NO_WEBGPU = true;
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
    window.NYC.showNeedsWebGPU('none');
    return;
  }
  markInit('renderer');
  // (loadfix) the backend it got (three falls back to WebGL 2 by itself when the WebGPU device can't be had): on WebGL 2
  // the low tier, set before anything is built (traffic.js's crowd and trees.js read it as they build)
  const isWebGPU = !!(renderer.backend && renderer.backend.isWebGPUBackend);
  window.NYC.quality.settle(isWebGPU);
  renderer.shadowMap.enabled = window.NYC.quality.tier !== 'low';
  try { window.mcPerf?.quality(window.NYC.quality, probe); } catch (e) { /* never in the way */ }
  if (!isWebGPU) {
    const label = document.querySelector('.brand-subtitle')?.firstChild;
    if (label && label.nodeType === Node.TEXT_NODE) label.textContent = label.textContent.replace('WebGPU', 'WebGL 2');
  }
  // (loadfix) A lost GPU device (a driver reset, Windows' GPU timeout on a long frame, the GPU process dying) or a lost
  // WebGL context: three stops drawing, but the game, its HUD and its voices would run on over a frozen or black
  // frame. Stop everything instead and reload once on WebGL 2 (sessionStorage mc.gpu.lost: the story's own save brings
  // the player back), or, if that was WebGL 2 already, say so with a Reload button
  let deviceLost = false;
  renderer.onDeviceLost = (info) => {
    if (deviceLost) return;
    deviceLost = true;
    renderer._isDeviceLost = true;
    console.error('[gfx] device lost', info && (info.message || info.reason));
    try { renderer.setAnimationLoop(null); } catch { /* already stopped */ }
    window.dispatchEvent(new CustomEvent('mc:gpu-lost', { detail: { backend: isWebGPU ? 'webgpu' : 'webgl2' } }));
    try { for (const ctx of window.__wgCtx || []) ctx.close?.().catch?.(() => {}); } catch { /* no audio */ } // (index.html keeps every context)
    try { document.querySelectorAll('audio,video').forEach((m) => m.pause()); } catch { /* none */ }
    const first = isWebGPU && !lostBefore && gpuParam !== '1';
    if (first) { try { sessionStorage.setItem('mc.gpu.lost', '1'); } catch { /* storage blocked */ } }
    window.NYC.showNeedsWebGPU(first ? 'reloading' : 'lost');
    if (first) setTimeout(() => location.reload(), 1500);
  };

  // 2. Build Scene & Physical Atmospheric Sky / PMREM IBL / 4096x4096 Shadow Lighting
  const scene = new THREE.Scene();
  const lightingSystem = new LightingSystem(scene, renderer);
  markInit('lighting');
  // (perf) The sun's cascades are drawn inside the city's own render (the first lit material's update), after that render
  // has recomputed every world matrix; each cascade's render(scene, ...) recomputed them all again (three's _renderScene:
  // scene.updateMatrixWorld()), two full passes over the scene's thousands of objects a frame for nothing. Inside a render
  // of the city, a cascade's render skips it
  {
    const render0 = renderer.render.bind(renderer), sunShadow = lightingSystem.sunLight.shadow;
    let inCity = 0;
    renderer.render = function (scn, camera, ...rest) {
      if (scn !== scene) return render0(scn, camera, ...rest);
      const cascade = inCity > 0 && camera && camera.isOrthographicCamera && scene.matrixWorldAutoUpdate === true &&
        (camera === sunShadow.getCamera(0) || camera === sunShadow.getCamera(1));
      if (cascade) scene.matrixWorldAutoUpdate = false;
      inCity++;
      try { return render0(scn, camera, ...rest); } finally {
        inCity--;
        if (cascade) scene.matrixWorldAutoUpdate = true;
      }
    };
  }

  if (loadingStatus) {
    loadingStatus.textContent = LOADING_TEXT;
  }
  await loadCityData(setLoadingProgress);
  markInit('data');
  if (loadingStatus) {
    loadingStatus.textContent = LOADING_TEXT;
  }

  // 3. Build the city: ground & curb islands, buildings, street details & traffic
  const cityGrid = buildSFGround(scene);
  markInit('cityGrid');
  await breathe();
  const region = buildSFRegion(scene);
  markInit('region');
  await breathe();
  const { colliders: landmarkColliders } = buildLandmarks(scene);
  // The Golden Gate and Bay bridges (sf-bridges.js, P5.2); the Bay Bridge's decks carry the I-80 freeway (grade-separation.js)
  const bridges = window.NYC.buildSFBridges(scene);
  window.NYC.bridgeDeckAt = bridges.bridgeDeckAt;
  landmarkColliders.push(...bridges.colliders);
  markInit('landmarks');
  await breathe();
  const cityBlocks = buildCityBlocks(scene, { sf: true });
  markInit('blocks');
  await breathe();
  const allColliders = [...landmarkColliders, ...cityBlocks.colliders, ...(cityGrid.colliders || [])];
  // (Mog City, the high quality lighting tier only: the buildings' height map for the sky occlusion, js/sky-occlusion.js:
  // San Francisco's or a Hometown town's, framed round its buildings; a streamed tile's are added as it loads)
  if (window.NYC.HQL && window.NYC.HQL.on()) {
    window.NYC.HQL.build(allColliders, { skip: new Set(bridges.colliders) });
    markInit('skyOcclusion');
  }

  // The road network (road-network.js), for the street furniture & the traffic built on it. Buildings turned along
  // non-grid streets have oriented colliders whose world bounds reach past their lots: they stay inside the property
  // line anyway, so the network (lanes & sidewalks) doesn't need them
  // The street network and everything on it stand on the core's terrain only: the regional terrain patches
  // must not turn streets past its edge into land
  window.NYC.Terrain.patchesEnabled = false;
  const roadNetwork = buildRoadNetwork(cityGrid.sidewalks, [...cityGrid.footprints, ...allColliders.filter((c) => !c.obb)]);
  markInit('roads');
  await breathe();
  const streetDetails = buildSFStreetDetails(scene, roadNetwork, allColliders);
  markInit('streetDetails');
  await breathe();
  const trafficSystem = createTrafficSystem(scene, cityGrid.sidewalks, [], { network: roadNetwork });
  markInit('traffic');
  await breathe();
  // Tunnels, bridges and freeway decks (grade-separation.js): their floors for the player and the cameras, their walls
  // and columns as colliders, the freeways' lanes for the highway traffic
  const gradeSeparation = roadNetwork
    ? buildGradeSeparation(scene, roadNetwork)
    : { colliders: [], highwayLanes: [], floorAt: () => null, roofAt: () => Infinity };
  window.NYC.GradeSeparation = gradeSeparation;
  if (cityGrid.terrain) cityGrid.terrain.rebuild(); // the portals carved
  markInit('grade');
  await breathe();
  const highwayTraffic = createHighwayTraffic(scene, gradeSeparation.highwayLanes);
  // Streetcars, light rail & cable cars on the Muni route runs (sf-transit.js, P4.6)
  const transit = window.NYC.buildSFTransit(scene);
  // ?debug=roads: the road network's lanes, junction curves, arms & control drawn over the ground (road-network.js)
  if (new URLSearchParams(location.search).get('debug') === 'roads') {
    scene.add(window.NYC.buildRoadDebug(roadNetwork || buildRoadNetwork(cityGrid.sidewalks, [])));
  }
  if (trafficSystem.network) buildRoadPaint(scene, trafficSystem.network);
  window.NYC.Terrain.patchesEnabled = true;
  markInit('roadPaint');
  await breathe();

  // 4. Initialize Third-Person Controllers (Person, Car, Cyclist, Helicopter) & Multi-Camera System
  // Outline buildings retain their exact rendered polygon; compound landmark parts remain separate.
  const controllerManager = new ThirdPersonControllerManager(scene, [...allColliders.flatMap((c) => c.parts || [c]), ...gradeSeparation.colliders]);
  const cameraSystem = new CameraSystem(renderer.domElement, controllerManager);
  cameraSystem.onResize(...renderSize());
  const touchControls = new TouchControls(controllerManager);
  markInit('controllers');
  await breathe();

  // Island-wide static geometry: chunk & distance-cull the small props, shadow stand-ins for the big casters
  // (scene-culling.js)
  const cullingRoots = ['ManhattanCityGrid', 'ManhattanCityBlocks', 'ManhattanStreetDetails', 'ManhattanLandmarks', 'Boroughs', 'SFGround', 'SFBuildings', 'SFStreetDetails', 'SFLandmarks', 'SFBridges']
    .map((name) => scene.getObjectByName(name))
    .filter(Boolean);
  // (r14) a Hometown town's small props in chunks 2.5x wider (scene-culling.js propCell): the same props drawn, ~half the
  // draw calls for them in the view and the cascades
  const cullingStats = setupSceneCulling(scene, cullingRoots, lightingSystem.sunLight.shadow,
    document.documentElement.dataset.city === 'pkg' ? { propCell: 2.5 } : {});
  markInit('culling');
  await breathe();

  // Small InstancedMeshes (<= 1000 instances) keep their matrices in uniform buffers that three.js
  // re-uploads on every draw of every pass (~2.5 MB/frame with the shadow cascades, stalling the GPU queue).
  // Storage attributes are only uploaded when instanceMatrix.needsUpdate is set.
  // (loadfix: on WebGPU only, as New York's js/main.js: three's WebGL 2 backend can't read an instance's matrix from a
  // storage buffer)
  if (isWebGPU) {
    scene.traverse((object) => {
      if (object.isInstancedMesh) {
        object.instanceMatrix = new THREE.StorageInstancedBufferAttribute(object.instanceMatrix.array, 16);
      }
    });
  }

  // 5. TSL RenderPipeline with Half-Res Screen Space Reflections (SSRNode), Bloom & Filmic Toning
  //    SSR skips pixels with zero metalness, so fading it out with distance spares the far facades
  const scenePass = pass(scene, cameraSystem.camera);
  // The multisampled colour attachments (output, normal, metalRough) only need resolving, never storing: discarding
  // them spares the GPU writing 3 x 4 samples per pixel to memory every frame (transient, memoryless attachments where
  // the browser supports them). The multisampled depth stays stored: SSR reads it.
  scenePass.renderTarget.storeMultisampledColorBuffer = false;
  const ssrFade = smoothstep(360.0, 180.0, positionView.z.negate());
  const sceneMRT = mrt({
    output: output,
    normal: normalView,
    metalRough: vec2(metalness.mul(ssrFade), roughness)
  });
  sceneMRT.setBlendMode('normal', new THREE.BlendMode(THREE.MaterialBlending));
  sceneMRT.setBlendMode('metalRough', new THREE.BlendMode(THREE.MaterialBlending));
  scenePass.setMRT(sceneMRT);

  const scenePassColor = scenePass.getTextureNode('output');
  const scenePassDepth = scenePass.getTextureNode('depth');
  const scenePassNormal = scenePass.getTextureNode('normal');
  const scenePassMetalRough = scenePass.getTextureNode('metalRough');

  const ssrPass = ssr(scenePassColor, scenePassDepth, scenePassNormal, {
    metalnessNode: scenePassMetalRough.r,
    roughnessNode: scenePassMetalRough.g,
    camera: cameraSystem.camera
  });
  ssrPass.resolutionScale = 0.5;
  ssrPass.blurQuality = 1;
  ssrPass.maxDistance.value = 42;
  // (Mog City, the high quality lighting tier: rays out to 120 m, as the enhanced Slop New York's; js/sky-occlusion.js)
  if (window.NYC.HQL && window.NYC.HQL.on()) ssrPass.maxDistance.value = 120;
  ssrPass.thickness.value = 0.85;
  ssrPass.quality.value = 0.35;
  ssrPass.intensity.value = 0.50;
  ssrPass.screenEdgeFadeBlack = true;

  let colorGrade = createPostProcessing(renderer, scenePassColor, ssrPass, scenePassDepth, cameraSystem.camera, lightingSystem);
  let { bloomPass } = colorGrade;
  let renderPipeline = new THREE.RenderPipeline(renderer, colorGrade.outputNode);

  const pipelineCache = new Map([[true, { colorGrade, bloomPass, renderPipeline }]]);
  let paused = false, pauseDirty = false;
  function setShadows(enabled) {
    if (lightingSystem.sunLight.castShadow === enabled) return;
    lightingSystem.sunLight.castShadow = enabled;
    scene.traverse(object => {
      for (const material of [].concat(object.material || [])) material.needsUpdate = true;
    });
    pauseDirty = true;
  }
  function applyQuality(id) {
    const q = QUALITY_PRESETS[id];
    region.setQuality?.(q.distance, q.trees);
    ssrPass.resolutionScale = q.reflectionScale;
    setShadows(q.shadows);
    if (!pipelineCache.has(q.reflections)) {
      const grade = createPostProcessing(renderer, scenePassColor, vec4(0), scenePassDepth, cameraSystem.camera, lightingSystem);
      pipelineCache.set(false, { colorGrade: grade, bloomPass: grade.bloomPass, renderPipeline: new THREE.RenderPipeline(renderer, grade.outputNode) });
    }
    const fogEnabled = colorGrade.fogEnabled.value;
    ({ colorGrade, bloomPass, renderPipeline } = pipelineCache.get(q.reflections));
    colorGrade.fogEnabled.value = fogEnabled;
    colorGrade.applyPreset(lightingSystem.activePresetId);
    document.body.dataset.quality = id;
    if (window.__NYC_APP) {
      window.__NYC_APP.renderPipeline = renderPipeline;
      Object.assign(window.__NYC_APP.postFX, { colorGrade, bloomPass });
    }
    pauseDirty = true;
  }

  // 6. Wire UI Controls (Strictly using safe DOM APIs: textContent, classList, addEventListener)
  const modeButtons = document.querySelectorAll('[data-mode]');
  const cameraButtons = document.querySelectorAll('[data-camera]');
  const timeButtons = document.querySelectorAll('[data-time]');
  const teleportButtons = document.querySelectorAll('[data-teleport]');
  const hudToggleBtn = document.getElementById('btn-toggle-hud');
  const modeSwitch = document.getElementById('mode-switch');
  touchControls.onAvailabilityChange = placeModeIndicator;

  const elFps = document.getElementById('hud-fps');
  const elMode = document.getElementById('hud-active-mode');
  const elCamera = document.getElementById('hud-active-camera');
  const elSpeed = document.getElementById('hud-speed');
  const elSpeedMeter = document.getElementById('hud-speed-meter');
  const elAltitude = document.getElementById('hud-altitude');
  const elLocation = document.getElementById('hud-location');
  const elControlsHint = document.getElementById('hud-controls-hint');
  // (Mog City: the game pad, as in New York: js/gamepad-controls.js, wagmi/pad.js)
  const gamepadControls = new GamepadControls(controllerManager, cameraSystem, {
    onCycleMode: (step) => {
      const modes = ['person', 'car', 'cyclist', 'helicopter'];
      selectMode(modes[(modes.indexOf(controllerManager.activeMode) + step + modes.length) % modes.length]);
    },
    onCycleCamera: cycleCamera,
    onToggleMap: () => mapSystem.toggleFullMap(!mapSystem.isFullMapOpen),
    onCloseMap: () => mapSystem.toggleFullMap(false)
  });

  // Keyboard guide for each mode: [keys, action]
  // (Mog City's, as in New York (js/main.js): on foot he walks the way you press, relative to the camera; X puts the car
  // back on the road (wagmi/game.js), R is the radio)
  const controlHints = {
    person: [[['W', 'A', 'S', 'D'], 'Move'], [['Shift'], 'Sprint'], [['Space'], 'Jump'], [['Drag'], 'Orbit']],
    car: [[['W', 'S'], 'Drive / Reverse'], [['A', 'D'], 'Steer'], [['Shift'], 'Boost'], [['Drag'], 'Orbit']],
    cyclist: [[['W', 'S'], 'Pedal / Brake'], [['A', 'D'], 'Lean & Turn'], [['Shift'], 'Sprint'], [['Drag'], 'Orbit']],
    helicopter: [[['W', 'S'], 'Pitch'], [['A', 'D'], 'Yaw'], [['Space', 'E'], 'Ascend'], [['Q', 'C'], 'Descend'], [['Shift'], 'Boost']]
  };
  // ...and the same guide on a game pad, when a pad was the last thing used (wagmi/pad.js: setHintInput)
  const controlHintsPad = {
    person: [[['LS'], 'Move'], [['RS'], 'Look'], [['L3'], 'Sprint'], [['A'], 'Jump']],
    car: [[['RT', 'LT'], 'Drive / Reverse'], [['LS'], 'Steer'], [['X'], 'Boost'], [['RS'], 'Look']],
    cyclist: [[['RT', 'LT'], 'Pedal / Brake'], [['LS'], 'Lean & Turn'], [['X'], 'Sprint'], [['RS'], 'Look']],
    helicopter: [[['LS'], 'Pitch & Yaw'], [['RT', 'LT'], 'Ascend / Descend'], [['X'], 'Boost'], [['RS'], 'Look']]
  };
  let hintPad = false;
  // Boosted top speeds in mph: full scale of the speed meter (Mog City: Dan's car has a dial of its own, carDial; any
  // other car, a story's sheet, a town fleet's model, a picked car, the horse, its real mph, full at its own top, carTopMph)
  const topSpeedMph = { person: 18, car: 176, cyclist: 43, helicopter: 116 };
  const carTopMph = (c) => (c.dial === 'dan' ? 176 : Math.max(1, (c.noBoost ? c.topSpeed : c.boostSpeed ?? c.topSpeed) ?? 56) * 2.237);
  // (Mog City, as js/main.js: Dan's car's dial peaks at 176 and never shows a frozen number: double its real mph up to the
  // cruise (34 m/s: 152), the boost's over the last 24 (56 m/s: 176); held at either top it wanders the 3 under it. Only
  // Dan's car, wagmi/game.js car.dial 'dan': a picked pickup on that scale read 149 at its 26.5 m/s, 59 mph)
  let dialLast = -1;
  function carDial(c, boosting) {
    const v = Math.abs(c.speed), v1 = c.topSpeed ?? 34, v2 = c.boostSpeed ?? 56;
    const at = v <= v1 ? 152 * v / v1 : 152 + 24 * Math.min(1, (v - v1) / (v2 - v1));
    const nb = c.noBoost || v2 <= v1, cap = (c.boosting ?? boosting) && !nb ? v2 : v1;
    if (Math.abs(v - cap) > cap * 0.005) return (dialLast = Math.round(nb ? 152 * Math.min(v, v1) / v1 : at));
    const top = cap === v2 && !nb ? 176 : 152;
    let n; do n = top - Math.floor(Math.random() * 4); while (n === dialLast);
    return (dialLast = n);
  }
  // (a car with no boost, a world's van or truck, has no Boost line)
  let hintNoBoost = false;
  function renderControlHints(mode) {
    if (!elControlsHint) return;
    hintNoBoost = mode === 'car' && !!controllerManager.entities.car?.noBoost;
    const items = ((hintPad ? controlHintsPad : controlHints)[mode] || []).filter(([, action]) => !(hintNoBoost && action === 'Boost')).map(([keys, action]) => {
      const item = document.createElement('span');
      item.className = 'hint';
      for (const key of keys) {
        const kbd = document.createElement('kbd');
        kbd.textContent = key;
        if (hintPad) kbd.dataset.pad = key;
        item.appendChild(kbd);
      }
      const label = document.createElement('span');
      label.className = 'hint-label';
      label.textContent = action;
      item.appendChild(label);
      return item;
    });
    elControlsHint.replaceChildren(...items);
  }
  // (Mog City) the guide in the pad's buttons (true) or the keyboard's (false)
  function setHintInput(pad) {
    if (hintPad === !!pad) return;
    hintPad = !!pad;
    renderControlHints(controllerManager.activeMode);
  }

  // The taxi-yellow pill under the selected mode glides from button to button
  function placeModeIndicator() {
    const active = modeSwitch ? modeSwitch.querySelector('.mode-btn.active') : null;
    if (!active) return;
    modeSwitch.style.setProperty('--ind-x', `${active.offsetLeft}px`);
    modeSwitch.style.setProperty('--ind-w', `${active.offsetWidth}px`);
  }

  function selectMode(mode) {
    controllerManager.setMode(mode);
    touchControls.setMode(controllerManager.activeMode);
    gamepadControls.reset();
    modeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });
    document.body.dataset.mode = mode;
    placeModeIndicator();
    const ent = controllerManager.getActiveEntity();
    if (elMode) elMode.textContent = ent.label;
    renderControlHints(mode);

    // If currently on a static scenic camera, switch to 3rd-Person Chase so user sees their selected character/vehicle
    const currentCam = cameraSystem.getActivePreset();
    if (currentCam.category !== 'follow') {
      selectCamera('chase', false);
    }
  }

  function selectCamera(camId, snap = false) {
    cameraSystem.setCameraPreset(camId, snap);
    cameraButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-camera') === camId);
    });
    const preset = cameraSystem.getActivePreset();
    if (elCamera) elCamera.textContent = preset.name;
  }

  // Steps through CAMERA_PRESETS (V / Shift+V, and the arrows either side of the camera name)
  function cycleCamera(step) {
    const n = CAMERA_PRESETS.length;
    const idx = CAMERA_PRESETS.findIndex((p) => p.id === cameraSystem.activePresetId);
    selectCamera(CAMERA_PRESETS[(idx + step + n) % n].id, true);
  }

  function selectTime(timeId) {
    lightingSystem.applyPreset(timeId);
    colorGrade.applyPreset(lightingSystem.activePresetId);
    timeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-time') === timeId);
    });
  }

  // Follow the real wrapped toolbar height; time labels, zoom and touch controls can change it. (Mog City: its markup,
  // New York's, has no shared top bar; its stylesheet places the HUD itself)
  const topbar = document.querySelector('.hud-topbar');
  if (topbar) {
    const placeHudContent = () => document.documentElement.style.setProperty(
      '--hud-content-top', `${Math.ceil(topbar.getBoundingClientRect().bottom) + 12}px`
    );
    new ResizeObserver(placeHudContent).observe(topbar);
    window.addEventListener('resize', placeHudContent);
    placeHudContent();
  }

  // Popovers (native [popover]: light dismiss & Esc for free) open against the control that toggles them: data-anchor
  // names the element they sit above / below, data-align the one whose right edge they line up with
  const popovers = document.querySelectorAll('.popover[popover]');
  const supportsPopover = typeof HTMLElement.prototype.togglePopover === 'function';
  function closePopovers() {
    if (!supportsPopover) return;
    popovers.forEach((pop) => {
      if (pop.matches(':popover-open')) pop.hidePopover();
    });
  }
  popovers.forEach((pop) => {
    const invoker = document.querySelector(`[popovertarget="${pop.id}"]`);
    pop.addEventListener('beforetoggle', (e) => {
      const open = e.newState === 'open';
      if (invoker) invoker.classList.toggle('is-open', open);
      if (!open) return;
      const anchor = document.getElementById(pop.dataset.anchor) || invoker;
      const align = document.getElementById(pop.dataset.align) || invoker;
      if (!anchor || !align) return;
      const r = anchor.getBoundingClientRect();
      const spaceAbove = Math.max(0, r.top - 20);
      const spaceBelow = Math.max(0, window.innerHeight - r.bottom - 20);
      let above = pop.dataset.side === 'above';
      // The camera control moves to the top on touch screens; open toward the available space.
      if ((above ? spaceAbove : spaceBelow) < 160) above = spaceAbove > spaceBelow;
      pop.style.right = `${Math.max(8, window.innerWidth - align.getBoundingClientRect().right)}px`;
      if (above) {
        pop.style.top = 'auto';
        pop.style.bottom = `${window.innerHeight - r.top + 8}px`;
        pop.style.maxHeight = `${spaceAbove}px`;
      } else {
        pop.style.bottom = 'auto';
        pop.style.top = `${r.bottom + 8}px`;
        pop.style.maxHeight = `${spaceBelow}px`;
      }
    });
  });

  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectMode(btn.getAttribute('data-mode'));
    });
  });

  cameraButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectCamera(btn.getAttribute('data-camera'), true);
      closePopovers();
    });
  });

  const camPrevBtn = document.getElementById('cam-prev');
  const camNextBtn = document.getElementById('cam-next');
  if (camPrevBtn) camPrevBtn.addEventListener('click', () => cycleCamera(-1));
  if (camNextBtn) camNextBtn.addEventListener('click', () => cycleCamera(1));

  timeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectTime(btn.getAttribute('data-time'));
    });
  });

  // A mouse click mustn't leave the focus on a HUD button, or Space (jump / ascend) and Enter would press it again
  document.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('button') : null;
    if (btn && e.detail > 0) btn.blur();
  });

  // Where you are: the place's name over its street corner, drawn as a pair of NYC street-name signs
  const roadNames = new Set(window.NYC.ROADS.map((r) => r.name));
  const placeNames = new Set(window.NYC.NYC_LANDMARKS.map((l) => l.name));
  let locationText = '';
  function renderLocation(label) {
    if (!elLocation || label === locationText) return;
    locationText = label;
    let place = '';
    let streets = label;
    const split = label.indexOf(' · ');
    if (split >= 0) {
      place = label.slice(0, split);
      streets = label.slice(split + 3);
    } else if (placeNames.has(label) || (!label.includes(' & ') && !roadNames.has(label))) {
      place = label;
      streets = '';
    }
    const nodes = [];
    if (place) {
      const el = document.createElement('div');
      el.className = 'location-place';
      el.textContent = place;
      nodes.push(el);
    }
    if (streets) {
      const row = document.createElement('div');
      row.className = 'location-signs';
      if (streets.startsWith('near ')) {
        streets = streets.slice(5);
        const near = document.createElement('span');
        near.className = 'location-near';
        near.textContent = 'near';
        row.appendChild(near);
      }
      for (const name of streets.split(' & ').filter((n) => n.trim())) {
        const sign = document.createElement('span');
        sign.className = 'street-sign';
        sign.textContent = name;
        row.appendChild(sign);
      }
      nodes.push(row);
    }
    elLocation.replaceChildren(...nodes);
  }

  // (Mog City) The lane nearest (x, z) within R m (the road network's lane centrelines, as wagmi/storyrun/places.js finds
  // them): { x, z, heading } facing along it, or null
  function laneNear(x, z, R) {
    let best = null;
    for (const e of trafficSystem.network?.edges || []) {
      if (e.len < 12) continue;
      if (e.bore && e.bore.kind === 'deck') continue; // (a Hometown package's deck: arrivals are on the ground)
      const mx = e.sx + e.dx * e.len / 2, mz = e.sz + e.dz * e.len / 2;
      if (Math.abs(mx - x) > R + e.len / 2 || Math.abs(mz - z) > R + e.len / 2) continue;
      const t = Math.max(6, Math.min(e.len - 6, (x - e.sx) * e.dx + (z - e.sz) * e.dz));
      for (const l of e.lanes) {
        const px = e.sx + e.dx * t + e.rx * l, pz = e.sz + e.dz * t + e.rz * l, d = Math.hypot(px - x, pz - z);
        if (d < R && (!best || d < best.d)) best = { x: px, z: pz, heading: Math.atan2(e.dx, e.dz), d };
      }
    }
    return best;
  }

  // No heading: face along the nearest street (controllers.js roadHeading)
  function teleportTo(x, z, heading = NaN) {
    const box = window.NYC.GEO?.box;
    if (box && (x < box.x0 || x > box.x1 || z < box.z0 || z > box.z1)) selectMode('helicopter');
    const destination = controllerManager.teleportActiveTo(x, z, heading);
    touchControls.reset();
    gamepadControls.reset();
    cameraSystem.resetForTeleport();
    selectCamera('chase', true);
    mapSystem.waypoint = {
      x: destination.x,
      z: destination.z,
      name: getLocationLabel(destination.x, destination.z)
    };
    return destination;
  }

  const mapSystem = new NYCMapSystem({
    controllerManager,
    cameraSystem,
    trafficSystem,
    onToggle: (open) => {
      controllerManager.resetInput();
      touchControls.setEnabled(!open);
      gamepadControls.setEnabled(!open);
      const mapHint = document.getElementById('fullmap-hover-info');
      if (open && touchControls.available && mapHint) {
        mapHint.textContent = 'Tap to teleport · Drag to pan · Use + / − to zoom';
      }
    },
    onTeleport: teleportTo
  });

  teleportButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-teleport');
      const loc = window.NYC.TELEPORT_LOCATIONS[key];
      if (loc) {
        if (loc.mode) selectMode(loc.mode);
        teleportTo(loc.x, loc.z, loc.heading);
      }
      closePopovers();
    });
  });

  const openMapBtn = document.getElementById('btn-open-map');
  if (openMapBtn) openMapBtn.addEventListener('click', () => mapSystem.toggleFullMap(true));

  if (hudToggleBtn) {
    hudToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('hud-minimized');
      const isMin = document.body.classList.contains('hud-minimized');
      hudToggleBtn.setAttribute('aria-pressed', String(isMin));
      hudToggleBtn.setAttribute('aria-label', isMin ? 'Show HUD' : 'Hide HUD');
      hudToggleBtn.title = isMin ? 'Show the HUD [H]' : 'Clean view: hide the HUD [H]';
      if (isMin) closePopovers();
    });
  }

  // Global keyboard shortcuts for modes (1-4), cameras (V / 5-0), and HUD (H)
  window.addEventListener('keydown', (e) => {
    if (isTypingInField(e)) return;
    switch (e.code) {
      case 'Digit1':
        selectMode('person');
        break;
      case 'Digit2':
        selectMode('car');
        break;
      case 'Digit3':
        selectMode('cyclist');
        break;
      case 'Digit4':
        selectMode('helicopter');
        break;
      case 'Digit5':
        selectCamera('chase', true);
        break;
      case 'Digit6':
        selectCamera('action', true);
        break;
      case 'Digit7':
        selectCamera('pov', true);
        break;
      case 'Digit8':
        selectCamera('fifthAve', true);
        break;
      case 'Digit9':
        selectCamera('timesSquare', true);
        break;
      case 'Digit0':
        selectCamera('chryslerGCT', true);
        break;
      case 'KeyV':
        cycleCamera(e.shiftKey ? -1 : 1);
        break;
      case 'KeyH':
        if (hudToggleBtn) hudToggleBtn.click();
        break;
    }
  });

  // (Mog City) The renderer took the window's size at the start, before `await renderer.init()` and the city's data
  // (loadCityData, seconds on a first visit); a resize while those waited (a game page's Play takes its frame full
  // screen while the city still loads) went to no listener, and the canvas kept the old, smaller size in a corner of
  // the full screen until the next resize (ESC and back). So the listener is fitted once now, to whatever size the
  // window has by the time it exists.
  const fitToWindow = () => {
    cameraSystem.onResize(...renderSize());
    renderer.setSize(...renderSize(), !benchmarkResolution);
    placeModeIndicator();
    if (mapSystem.isFullMapOpen) {
      mapSystem.resizeFullCanvas();
      mapSystem.renderFullMap();
    }
  };
  window.addEventListener('resize', fitToWindow);
  fitToWindow();

  // Initialize default selection, overridable from the URL (debug & screenshot harness, see debugParams below):
  // ?mode=person|car|cyclist|heli  ?time=golden|midday|twilight|midnight  ?teleport=x,z,headingDeg  ?hud=0
  const urlParams = new URLSearchParams(location.search);
  // (the fork's fog presets, ?fog=clear|haze|marine; Mog City has no fog menu: the haze, the fork's own default)
  lightingSystem.setFogPreset(urlParams.get('fog') || 'haze');
  // (a Hometown package's far field picks its fog when it arrives after boot, cities/pkg/js/pkg-far.js; an explicit ?fog wins)
  window.NYC.setFogPreset = (id) => { if (!urlParams.has('fog')) lightingSystem.setFogPreset(id); };
  if (window.NYC.pkgFarFog) window.NYC.setFogPreset(window.NYC.pkgFarFog);
  const urlMode = { heli: 'helicopter', helicopter: 'helicopter', person: 'person', car: 'car', cyclist: 'cyclist' }[urlParams.get('mode')];
  // Every player model starts parked on the ground at the first teleport, clear of buildings & each other. (Mog City:
  // on the Embarcadero by the Ferry Building, the car first, onto the lane nearest Embarcadero Plaza (652, -683) and
  // facing along it, and Dan by it (the game puts him out at its door: wagmi/city.js); the sandbox's bike and helicopter,
  // which the game doesn't use, parked out of the way at Market & Montgomery. Market & Montgomery for all if the lanes
  // are missing)
  // (a Hometown package: its compiled arrival, downtown, onto the lane nearest it)
  const PKG_SPAWN = window.NYC.PKG && window.NYC.PKG.spawn;
  const spawn = PKG_SPAWN ? laneNear(PKG_SPAWN.x, PKG_SPAWN.z, 150) || PKG_SPAWN : laneNear(652, -683, 90) || window.NYC.TELEPORT_LOCATIONS.market;
  const parking = window.NYC.TELEPORT_LOCATIONS.market || spawn;
  if (spawn) {
    for (const [mode, at] of [['car', spawn], ['person', spawn], ['cyclist', parking], ['helicopter', parking]]) {
      controllerManager.setMode(mode);
      controllerManager.teleportActiveTo(at.x, at.z, at.heading);
    }
  }
  selectMode(urlMode || 'car');
  selectCamera('chase', true);
  selectTime(['golden', 'midday', 'twilight', 'midnight'].includes(urlParams.get('time')) ? urlParams.get('time') : 'golden');
  // Benchmark-only baseline skips fog composition. Clear remains a light aerial haze.
  if (urlParams.get('fog') === 'off') colorGrade.fogEnabled.value = 0;
  if (urlParams.has('teleport')) {
    // a named destination (TELEPORT_LOCATIONS) or x,z,headingDeg
    const named = window.NYC.TELEPORT_LOCATIONS[urlParams.get('teleport')];
    const [tx, tz, th = 180] = urlParams.get('teleport').split(',').map(Number);
    if (named) { if(named.mode) selectMode(named.mode); teleportTo(named.x, named.z, named.heading); }
    else if (Number.isFinite(tx) && Number.isFinite(tz)) teleportTo(tx, tz, (th * Math.PI) / 180);
  }
  if (urlParams.get('hud') === '0') document.body.classList.add('hud-minimized');
  // the web fonts change the buttons' widths once they arrive
  if (document.fonts) document.fonts.ready.then(placeModeIndicator);
  markInit('ui');

  // The loading screen stays up while the shaders compile (precompileShaders() & the warm-up frame, see the loop) and
  // until the first frame is on screen
  if (loadingStatus) {
    loadingStatus.textContent = LOADING_TEXT;
  }

  // (Mog City) the graphics for this load (window.NYC.quality, above): High or Low as chosen, set now before anything
  // compiles; Auto starts high and the frame times of the city's first 3 s settle it (the loop). The fork's own
  // ?quality=low|medium|high still pins one (its benchmarks)
  const quality = window.NYC.quality;
  const qualityParam = urlParams.get('quality');
  const requestedQuality = QUALITY_PRESETS[qualityParam] ? qualityParam : null;
  if (requestedQuality) quality.tier = requestedQuality;
  if (quality.tier !== 'high') applyQuality(quality.tier);
  const autoFrames = []; let autoSeconds=0, autoDone=Boolean(requestedQuality || !quality.measuring || urlParams.has('bench') || urlParams.has('capture'));
  // (perf) the resolution follows the frame time on every tier (js/gfx-auto.js adapt: down fast, up slowly; at the floor
  // the tier steps down live, medium or high to low, and the next load builds lighter). Not on the fixed-size benchmarks
  const adaptive = window.mcGfx && !benchmarkResolution && !requestedQuality ? window.mcGfx.adapt({
    quality, probe,
    setScale: (k) => { renderer.setPixelRatio(k); renderer.setSize(...renderSize()); },
    tierDown(next) {
      if (next !== 'low' && next !== 'medium') return false;
      if (quality.tier === next || !QUALITY_PRESETS[next]) return false;
      applyQuality(next);
      quality.tier = next;
      return true;
    }
  }) : null;

  // Debug & screenshot harness state (URL: ?cam=x,y,z,yawDeg,pitchDeg  ?freeze=1  ?bench=name):
  // `camera` pins the view to a fixed pose, `freeze` stops traffic, `bench` flies a scripted path (BENCH_PATHS) and logs
  // "[bench] name median_ms p95_ms fps" when done (also left in __NYC_APP.bench)
  // ?camGround=1: the ?cam y is height above the ground
  const fogCompare = urlParams.has('fogCompare');
  const fogBlocks = Array.from({ length: 8 }, () => []);
  const debugState = { camera: null, freeze: fogCompare || urlParams.get('freeze') === '1', bench: null };
  if (urlParams.has('cam')) {
    const [x, y, z, yaw = 0, pitch = 0] = urlParams.get('cam').split(',').map(Number);
    const y0 = urlParams.get('camGround') === '1' ? window.NYC.Terrain.groundAt(x, z) : 0;
    if ([x, y, z].every(Number.isFinite)) debugState.camera = { x, y: y + y0, z, yaw, pitch };
  }
  // (a Hometown town's paths, around its arrival: town-street = a turn on the spot 1.7 m up at the arrival, town-aerial =
  // a loop 220 m up round it. Its y over the ground, as BENCH_ON_GROUND's)
  const benchSpawn = window.NYC.PKG && window.NYC.PKG.spawn;
  const TOWN_BENCH = benchSpawn ? {
    'town-street': [[benchSpawn.x, 1.7, benchSpawn.z, 0, -3], [benchSpawn.x, 1.7, benchSpawn.z, 360, -3]],
    'town-aerial': [0, 90, 180, 270, 360].map((a) => [benchSpawn.x + 350 * Math.sin((a * Math.PI) / 180), 220, benchSpawn.z + 350 * Math.cos((a * Math.PI) / 180), a, -25])
  } : {};
  const benchName = urlParams.get('bench');
  if (BENCH_PATHS[benchName] || TOWN_BENCH[benchName]) {
    const name = benchName;
    debugState.bench = { name, keys: BENCH_PATHS[name] || TOWN_BENCH[name], onGround: BENCH_ON_GROUND.has(name) || !!TOWN_BENCH[name], t: -2, frames: [], gpu: [], work: [] };
  }

  // Expose programmatic API for testing & inspection
  let currentFps = 60;
  window.__NYC_APP = {
    renderer,
    scene,
    renderPipeline,
    postFX: { scenePass, ssrPass, bloomPass, colorGrade },
    cullingStats,
    cityBlocks,
    quadtree: cityBlocks.quadtree,
    trafficSystem,
    highwayTraffic,
    controllerManager,
    touchControls,
    cameraSystem,
    lightingSystem,
    mapSystem,
    quality, // (Mog City: the graphics, also window.NYC.quality)
    gamepadControls, // (Mog City: wagmi/pad.js)
    setHintInput, // (Mog City: wagmi/pad.js)
    selectMode,
    selectCamera,
    cycleCamera,
    selectTime,
    warm, // (loadfix: the game's late arrivals' shaders built ahead of their first frame, see warm())
    getFps: () => currentFps,
    debug: {
      // draw calls, triangles & live counts for the probe (tools/dev/probe.mjs)
      stats: () => ({
        fps: currentFps,
        calls: renderer.info.render.drawCalls ?? renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        terrain: cityGrid.terrain ? cityGrid.terrain.stats() : null,
        region: region.stats(),
        gpuMB: gpuMegabytes()
      }),
      heightAt: (x, z) => window.NYC.Terrain.heightAt(x, z),
      groundAt: (x, z) => window.NYC.Terrain.groundAt(x, z),
      teleport: (x, z, headingDeg = 180) => teleportTo(x, z, (headingDeg * Math.PI) / 180),
      setTime: selectTime,
      freeze: (on) => { debugState.freeze = !!on; },
      setCamera: (pose) => { debugState.camera = pose; }
    }
  };

  // GPU memory the scene's geometry and its materials' own data textures take, estimated from their CPU-side arrays
  // (each counted once; render targets, the shadow map and textures inside node graphs, such as the 1 m ground mask,
  // aren't included)
  function gpuMegabytes() {
    const seen = new Set();
    let bytes = 0;
    const add = (a) => {
      if (!a || seen.has(a)) return;
      seen.add(a);
      bytes += a.array ? a.array.byteLength : 0;
    };
    scene.traverse((o) => {
      const g = o.geometry;
      if (g) {
        add(g.index);
        for (const a of Object.values(g.attributes)) add(a);
      }
      if (o.isInstancedMesh) add(o.instanceMatrix);
      const m = o.material;
      for (const t of m ? Object.values(m).filter((v) => v && v.isTexture) : []) {
        if (!seen.has(t)) { seen.add(t); bytes += t.image?.data?.byteLength || 0; }
      }
    });
    return Math.round(bytes / 1e6);
  }

  // 6b. Shader pre-compilation behind the loading screen. compileAsync() builds the node graphs in slices and has the GPU
  //     process compile the pipelines in parallel, but after every 8 ms slice it waits for a rendered frame, which
  //     leaves the main thread idle about half the time while nothing else animates; several calls side by side keep
  //     it busy (warm cache: 2.1 s instead of 4.0 s). (Rendering straight away compiled ~500 pipelines one after
  //     another: ~25 s with a cold shader cache.)
  const COMPILE_POOL = 16;
  const nextTask = () => (globalThis.scheduler?.yield ? globalThis.scheduler.yield() : new Promise((resolve) => setTimeout(resolve, 0)));
  async function precompileShaders() {
    // An empty frame first: it sets up the post-processing chain, which configures the scene pass's render target
    // (MSAA samples, depth format), so the pipelines compiled below are the very ones the scene pass asks for
    scene.visible = false;
    renderPipeline.render();
    scene.visible = true;
    markInit('postFX');

    // Every visible object with frustum culling off (like the warm-up frame, see the loop). Plain meshes that share
    // a material share its shader, so one job compiles them in turn (the first build serves the rest); every
    // instanced mesh gets a build of its own
    const culled = [];
    const jobs = [];
    const jobByMaterial = new Map();
    scene.traverseVisible((o) => {
      if (o.frustumCulled) {
        culled.push(o);
        o.frustumCulled = false;
      }
      if (!o.isMesh && !o.isLine && !o.isPoints && !o.isSprite) return;
      // chunks of one mesh share its pipeline (the first one compiles it) and the shadow stand-ins only ever draw in
      // the shadow maps (the warm-up frame compiles those)
      if (o.userData.sharesPipelineWith || o.userData.shadowProxy) return;
      if (o.isInstancedMesh || Array.isArray(o.material)) {
        jobs.push([o]);
        return;
      }
      let job = jobByMaterial.get(o.material);
      if (!job) {
        job = [];
        jobByMaterial.set(o.material, job);
        jobs.push(job);
      }
      job.push(o);
    });

    renderer.setRenderTarget(scenePass.renderTarget);
    renderer.setMRT(sceneMRT);
    const compile = async (object) => {
      // Each compile starts in a task of its own: compileAsync() keeps one precompilation state on the renderer,
      // which must not be mid-step for two of them in the same microtask checkpoint
      await nextTask();
      try {
        await renderer.compileAsync(object, cameraSystem.camera, scene);
      } catch (e) {
        console.warn('[compile]', e); // the warm-up frame compiles it instead
      }
    };
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        for (const object of job) await compile(object);
        done++;
        if (loadingStatus) {
          loadingStatus.textContent = `${LOADING_TEXT} ${Math.round((done / jobs.length) * 100)}%`;
        }
        setLoadingProgress(done / jobs.length);
      }
    };
    await Promise.all(Array.from({ length: COMPILE_POOL }, worker));
    renderer.setMRT(null);
    renderer.setRenderTarget(null);
    for (const o of culled) o.frustumCulled = true;
  }

  await precompileShaders();
  markInit('compile');

  // (loadfix) warm(objects): what the game adds once the city runs (a story's cast, its hero, a set piece) compiled for
  // the very target the city's frame draws them into (the scene pass: its attachments, its samples), not the canvas, the
  // frames held meanwhile (the loop draws nothing while warming: compileAsync() renders into the scene pass's target).
  // Without it every new material compiled on its first frame: on WebGPU one long stall per person, on WebGL 2 (where a
  // program links synchronously) a frozen minute as a story's opening began. Default: every top-level object of the
  // scene that isn't the static city. { scene, camera }: another scene drawn through the same pass (a story's set)
  // { target }: a render target of its own in place of the scene pass's (a video call's tile, wagmi/storyrun/vcall-draw.js),
  // no MRT, as js/main.js has it (ignored here, a call's { tile } warm-up compiled the scene pass again, the loop held a
  // second time, and the tile's pipelines were still built on its first draw: the RC review's 180-400 ms frame as a
  // call came up on the car's screen). { hold: false }: the loop not held (a call's office prepared mid-drive): each of
  // its top-level objects compiled in a task of its own, the renderer's target put back as soon as each compileAsync()
  // has taken it (it is read before the compile's first await), the pipelines finished off the loop
  let warming = 0;
  async function warm(objects, { scene: where = scene, camera = cameraSystem.camera, target = null, hold = true } = {}) {
    const city = new Set(cullingRoots);
    let list = (objects ? [].concat(objects) : scene.children.filter((o) => !city.has(o) && !o.userData.shadowProxy)).filter((o) => o && o.isObject3D);
    if (!hold) list = list.flatMap((o) => (o.isScene ? o.children : [o]));
    if (!list.length || deviceLost) return;
    if (hold) warming++;
    try {
      for (const o of list) {
        await nextTask();
        if (deviceLost) return;
        const rt0 = renderer.getRenderTarget(), mrt0 = renderer.getMRT ? renderer.getMRT() : null;
        let p = null;
        renderer.setRenderTarget(target || scenePass.renderTarget);
        renderer.setMRT(target ? null : sceneMRT);
        // (held: the target and MRT kept until the compile is done, as before the RC's hitch fix: three builds each
        // object's nodes after its first await, reading the renderer's MRT then, and with the scene pass's MRT put back
        // early its materials came out with one output for the pass's three (WebGPU: 'targets[1]', renderPipeline_eyes
        // and the rest, Cold Harbor's opening and Jensen Heist's PH-1, the r35 release play). Not held: put back at once)
        try { p = renderer.compileAsync(o, camera, where); if (hold) await p; } catch (e) { console.warn('[warm]', e); }
        finally { renderer.setRenderTarget(rt0); renderer.setMRT(mrt0); }
        if (!hold) try { await p; } catch (e) { console.warn('[warm]', e); }
      }
    } finally {
      if (hold) warming--;
    }
  }

  // 6. Animation Loop
  let lastTime = performance.now();
  let elapsed = 0;
  let frameCount = 0;
  let fpsTimer = 0;
  let warmedUp = false; // see the first frame below

  if (elFps) elFps.textContent = '60';

  // Pins the camera to the ?cam pose, or flies the ?bench path once the city is on screen and records frame times
  function setCameraPose({ x, y, z, yaw, pitch }) {
    const cam = cameraSystem.camera;
    cameraSystem.currentPos.set(x, y, z);
    cam.position.set(x, y, z);
    cam.rotation.set((pitch * Math.PI) / 180, (yaw * Math.PI) / 180, 0, 'YXZ');
    cam.updateMatrixWorld();
  }
  function updateDebugCamera(rawDt) {
    const b = debugState.bench;
    if (!b) {
      if (debugState.camera) setCameraPose(debugState.camera);
      return;
    }
    if (window.__NYC_APP.ready && !b.done) {
      b.t += rawDt;
      if (b.t >= 0) b.frames.push(rawDt * 1000);
      if (b.t >= 0) b.work.push(lastWork); // (the loop's own work, the frame before: CPU, not the wait for the GPU or vsync)
      if (b.t >= BENCH_SECONDS) {
        b.done = true;
        const ms = b.frames.slice().sort((p, q) => p - q);
        const median = ms[Math.floor(ms.length / 2)];
        const p95 = ms[Math.floor(ms.length * 0.95)];
        window.__NYC_APP.bench = { name: b.name, medianMs: +median.toFixed(2), p95Ms: +p95.toFixed(2), fps: Math.round(1000 / median), frames: ms.length, width: renderer.domElement.width, height: renderer.domElement.height, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null };
        const gpu = b.gpu.slice().sort((a, c) => a - c);
        const work = b.work.slice().sort((p, q) => p - q);
        if (work.length) Object.assign(window.__NYC_APP.bench, { workMedianMs: +work[Math.floor(work.length / 2)].toFixed(2), workP95Ms: +work[Math.floor(work.length * 0.95)].toFixed(2) });
        if (gpu.length) Object.assign(window.__NYC_APP.bench, { gpuMedianMs: +gpu[Math.floor(gpu.length / 2)].toFixed(3), gpuSamples: gpu.length });
        if (fogCompare) {
          const med = values => { const sorted = values.slice().sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };
          const blocks = fogBlocks.map((samples, i) => ({ fog: [0, 1, 1, 0][i % 4], medianMs: med(samples), samples: samples.length }));
          const deltas = [0, 2, 4, 6].map(i => blocks[i].medianMs == null || blocks[i + 1].medianMs == null ? null :
            (blocks[i + 1].medianMs - blocks[i].medianMs) * (blocks[i + 1].fog ? 1 : -1));
          window.__NYC_APP.bench.fogComparison = { camera: debugState.camera || 'path-start', order: 'ABBAABBA', blocks, pairedDeltasMs: deltas, medianDeltaMs: med(deltas.filter(x => x !== null)) };
        }
        document.body.dataset.benchResult = JSON.stringify(window.__NYC_APP.bench);
        console.log(`[bench-details] ${JSON.stringify(window.__NYC_APP.bench)}`);
        console.log(`[bench-stats] ${JSON.stringify(window.__NYC_APP.debug.stats())}`);
        console.log(`[bench] ${b.name} median_ms=${median.toFixed(2)} p95_ms=${p95.toFixed(2)} fps=${Math.round(1000 / median)}`);
        if (urlParams.get('benchIdle') === '1') {
          renderer.setAnimationLoop(null);
          // Leave the complete scene resident while the browser has an opportunity to collect transient garbage.
          setTimeout(() => console.log(`[bench-idle] ${JSON.stringify({ name: b.name, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null })}`), 20000);
        }
      }
    }
    if (fogCompare) colorGrade.fogEnabled.value = [0, 1, 1, 0][Math.min(7, Math.floor(Math.max(0, b.t) / 5)) % 4];
    const pose = fogCompare && debugState.camera ? { ...debugState.camera } : samplePath(b.keys, fogCompare ? 0 : Math.min(1, Math.max(0, b.t / BENCH_SECONDS)));
    if (b.onGround && !(fogCompare && debugState.camera)) pose.y += window.NYC.Terrain.groundAt(pose.x, pose.z);
    setCameraPose(pose);
  }

  let gpuTimingPending = false;
  let gpuFrames = 0; // (frames since the last GPU timing resolve)
  let lastWork = 0; // (perf) the last frame's own work, ms: the loop from its start to the frame handed to the GPU
  renderer.setAnimationLoop((now) => {
    const rawDt = (now - lastTime) * 0.001;
    lastTime = now;
    if (warming) return; // (loadfix: warm() holds the frame, see above)
    if (paused) {
      if (pauseDirty) { region.update(cameraSystem.camera, elapsed); lightingSystem.update(cameraSystem.currentPos, elapsed); renderPipeline.render(); pauseDirty=false; }
      return;
    }
    if (warmedUp && window.__NYC_APP.ready) { adaptive?.update(rawDt, !document.hidden, lastWork); window.mcPerf?.frame(rawDt, lastWork); }
    const workStart = performance.now();
    // (Mog City: the city runs on under the full map, as New York's does)
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    elapsed = fogCompare ? 10 : elapsed + dt;

    // Update 3rd-person controllers, camera, signals, traffic & vehicle collisions, building LODs, and dynamic shadow focus
    gamepadControls.update(dt);
    controllerManager.update(dt, elapsed);
    cameraSystem.update(dt, elapsed);
    updateDebugCamera(rawDt);
    // traffic divides by its step (traffic.js), so a frozen city still steps by a negligible 0.1 ms
    const trafficDt = debugState.freeze ? 1e-4 : dt;
    streetDetails.signalClock.value = elapsed;
    trafficSystem.update(
      trafficDt,
      elapsed,
      cameraSystem.currentPos,
      controllerManager.getActiveEntity(),
      controllerManager.activeMode,
      cameraSystem.camera
    );
    // (SF 2040, wagmi/apocalypse: trafficSystem.abandon(true) leaves the freeways' cars and the streetcars where they stand)
    const stood = trafficSystem.abandoned;
    highwayTraffic.update(stood ? 1e-4 : trafficDt, cameraSystem.camera, controllerManager.getActiveEntity(), controllerManager.activeMode);
    transit.update(debugState.freeze || stood ? 0 : dt);
    bridges.update(cameraSystem.camera);
    region.update(cameraSystem.camera, elapsed);
    cityBlocks.update(cameraSystem.currentPos.x, cameraSystem.currentPos.z);
    if (cityBlocks.updateLights) cityBlocks.updateLights(cameraSystem.camera);
    if (streetDetails.update) streetDetails.update(cameraSystem.camera);
    lightingSystem.update(cameraSystem.currentPos, elapsed);
    mapSystem.update();
    if (window.NYC.HQL) window.NYC.HQL.update(lightingSystem.hemiLight, window.NYC.cityUniforms?.uCanyonBounce?.value);
    if (warmedUp) updateSceneCulling(cameraSystem.camera.position); // the warm-up frame draws every chunk
    if (cityGrid.terrain) cityGrid.terrain.update(cameraSystem.camera.position, elapsed);

    // Render frame via TSL RenderPipeline (SSR + Bloom)
    if (!warmedUp) {
      // First frame = pipeline warm-up behind the loading screen, for what precompileShaders() can't reach (the shadow
      // map passes): with frustum culling off, every visible material's pipelines compile now instead of stalling the
      // first time the camera turns towards it (one chunk / shadow stand-in per shared pipeline is enough)
      // (loadfix) Only one object per pipeline is drawn unculled (its materials, kind of mesh, vertex layout and shadow
      // flags), the others of that pipeline hidden for the frame: drawing the whole town at once, every building, every
      // terrain and ground tile into every shadow cascade, was a frame long enough on a modest GPU (Windows' 2 s GPU
      // timeout) to lose the device, which left the game running over a black or frozen frame
      const culled = [], hidden = [], seen = new Set();
      const pipelineKey = (o) => {
        if (!(o.isMesh || o.isLine || o.isPoints || o.isSprite) || o.children.length || !o.geometry) return null;
        const g = o.geometry, mats = [].concat(o.material || []);
        return [mats.map((m) => m.uuid).join(','), o.type, !!o.isInstancedMesh, !!o.isSkinnedMesh, !!o.isBatchedMesh,
          o.castShadow, o.receiveShadow, !!g.index, Object.keys(g.morphAttributes || {}).join(','),
          Object.entries(g.attributes).map(([k, a]) => `${k}:${a.itemSize}:${a.array?.constructor?.name}:${!!a.isInstancedBufferAttribute}`).sort().join(',')].join('|');
      };
      scene.traverse((o) => {
        if (o.frustumCulled && !o.userData.sharesPipelineWith) {
          const key = pipelineKey(o);
          if (key !== null) {
            if (seen.has(key)) {
              if (o.visible) { o.visible = false; hidden.push(o); }
              return;
            }
            seen.add(key);
          }
          culled.push(o);
          o.frustumCulled = false;
        }
      });
      renderPipeline.render();
      for (const o of culled) o.frustumCulled = true;
      for (const o of hidden) o.visible = true;
      markInit('warmup');
    }
    renderPipeline.render();
    // (Mog City, the high quality lighting tier only: a face of the player vehicle's reflection probe, after the frame)
    if (warmedUp && window.NYC.HQL) window.NYC.HQL.heroUpdate(window.__NYC_APP);
    lastWork = performance.now() - workStart;
    if (warmedUp && window.__NYC_APP.ready && !autoDone) {
      autoSeconds += rawDt; autoFrames.push(rawDt * 1000);
      if (autoSeconds >= 3) {
        autoDone = true;
        const id = chooseQuality(autoFrames);
        quality.auto = quality.tier = quality.next = id;
        if (id !== 'high') applyQuality(id);
      }
    }
    const timedBench = debugState.bench;
    gpuFrames++;
    if (warmedUp && renderer.backend.trackTimestamp && timedBench && !timedBench.done && !gpuTimingPending) {
      gpuTimingPending = true;
      // (the queries since the last resolve: every frame since, so its total over their count is a frame's)
      const perFrames = Math.max(1, gpuFrames);
      gpuFrames = 0;
      const block = Math.floor(timedBench.t / 5);
      const settledBlock = fogCompare && timedBench.t >= 0 && timedBench.t % 5 >= 1 && block < 8;
      renderer.resolveTimestampsAsync().then(ms => {
        if (settledBlock && !timedBench.done && Number.isFinite(ms)) fogBlocks[block].push(ms / perFrames);
        if (timedBench.t >= 0 && !timedBench.done && Number.isFinite(ms)) timedBench.gpu.push(ms / perFrames);
      }).catch(error => console.warn('GPU timing unavailable:', error.message)).finally(() => { gpuTimingPending = false; });
    }
    if (!warmedUp) {
      warmedUp = true;
      markInit('firstFrame');
      // The loading screen stays up until the GPU has got through the first frame (and the pipelines its warm-up
      // compiled), i.e. until the city is actually on screen
      const device = renderer.backend.device;
      Promise.resolve(device && device.queue.onSubmittedWorkDone()).catch(() => {}).then(() => {
        // (loadfix) a device lost on the way (onSubmittedWorkDone resolves on a lost device too) is never "ready": the
        // card of onDeviceLost stays, not the start screen over no city
        if (deviceLost || renderer._isDeviceLost) return;
        markInit('gpu');
        console.log(`[init] ${initTimings.join(', ')}`);
        try { window.mcPerf?.init(initTimings); } catch (e) { /* never in the way */ }
        initTimings = null;
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        setLoadingProgress(1);
        window.__NYC_APP.ready = true;
        // A still preview keeps its WebGPU context but releases the GPU between screenshot reviews.
        if (urlParams.get('still') === '1' || urlParams.get('capture') === '1') renderer.setAnimationLoop(null);
        // Review-only export: the canvas is fixed at 1280×720 even in a narrow preview tab.
        if (urlParams.get('capture') === '1') {
          const image = document.createElement('img');
          image.id = 'review-capture';
          image.alt = 'San Francisco review capture';
          image.src = renderer.domElement.toDataURL('image/png');
          image.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#111;z-index:10000';
          document.body.appendChild(image);
        }
      });
    }

    // Telemetry uses wall time, not the clamped simulation step, so slow frames and high-refresh displays report
    // their actual frame rate (updates DOM every 250ms).
    frameCount++;
    fpsTimer += Math.max(0, rawDt);
    if (fpsTimer >= 0.25) {
      currentFps = Math.round(frameCount / fpsTimer);
      frameCount = 0;
      fpsTimer = 0;

      const activeEnt = controllerManager.getActiveEntity();
      const mode = controllerManager.activeMode;
      const mph = mode === 'car' && activeEnt.dial === 'dan' ? carDial(activeEnt, controllerManager.keys.boost) : Math.round(Math.abs(activeEnt.speed) * 2.237);
      const altFt = Math.max(0, Math.round(activeEnt.position.y * 3.281));

      if (elFps) {
        elFps.textContent = String(currentFps);
        elFps.className = currentFps >= 50 ? 'fps-ok' : currentFps >= 30 ? 'fps-warn' : 'fps-bad';
      }
      if (elSpeed) elSpeed.textContent = String(mph);
      if (elSpeedMeter) elSpeedMeter.style.transform = `scaleX(${Math.min(1, mph / ((mode === 'car' ? carTopMph(activeEnt) : topSpeedMph[mode]) || 80))})`;
      if (mode === 'car' && !!activeEnt.noBoost !== hintNoBoost) renderControlHints(mode);
      document.body.classList.toggle('is-boosting', controllerManager.keys.boost && mph > 0 && !(mode === 'car' && activeEnt.noBoost));
      if (elAltitude) elAltitude.textContent = altFt.toLocaleString('en-US');
      // The street corner of the player on the follow cameras, of the camera itself on the scenic ones
      const where = cameraSystem.getActivePreset().category === 'follow' ? activeEnt.position : cameraSystem.currentPos;
      renderLocation(getLocationLabel(where.x, where.z));
    }
  });
}

function showBootError(message) {
  const overlay = document.getElementById('loading-overlay');
  overlay?.classList.remove('hidden');
  overlay?.classList.add('boot-error');
  for (const hud of document.querySelectorAll('.hud')) hud.inert = true;
  const status = document.getElementById('loading-status');
  if (status) { status.textContent=message; status.setAttribute('role','alert'); }
  const track = overlay?.querySelector('.loader-track'); if(track) track.hidden=true;
  const retry = document.createElement('button'); retry.textContent='Try again'; retry.type='button'; retry.className='tool-btn';
  retry.addEventListener('click', () => location.reload()); status?.after(retry);
}
initApp().catch(error => { console.error('City initialization failed:', error); showBootError('The city could not start. Check your connection and WebGPU support, then try again.'); });

})();
