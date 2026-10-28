(function () {
// js/main.js
// Main entry point for New York City (Midtown Manhattan) in Three.js WebGPURenderer & TSL (three.js dev, see index.html)

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
const { buildCityGrid } = window.NYC;
const { buildBoroughs } = window.NYC;
const { buildLandmarks } = window.NYC;
const { buildCityBlocks } = window.NYC;
const { buildStreetDetails } = window.NYC;
const { createTrafficSystem, createHighwayTraffic } = window.NYC;
const { buildRoadPaint } = window.NYC;
const { ThirdPersonControllerManager } = window.NYC;
const { TouchControls } = window.NYC;
const { GamepadControls } = window.NYC;
const { CameraSystem, CAMERA_PRESETS } = window.NYC;
const { LightingSystem } = window.NYC;
const { NYCMapSystem } = window.NYC;
const { setupSceneCulling, updateSceneCulling } = window.NYC;

// (Mog City) Graphics tier, picked before the renderer is made: 'high' is the city as built (every knob below
// unset, so each module keeps its own constant), 'phone' a lighter city for phones, 'low' the plainest one, for
// devices without WebGPU (three's WebGL2 backend). ?gfx=high|phone|low wins, then the saved choice
// (localStorage 'wagmi.gfx', the pause menu's Graphics row), then auto: phone on a phone (coarse primary pointer and a
// screen no wider than 500 CSS px either way up), low without WebGPU, high otherwise. Nothing switches live: the
// shadows, the reflections and MSAA would recompile every pipeline (a 3 s stall), so a choice applies on the next load.
// The tiers' knobs are published on window.NYC.quality, which lighting.js, traffic.js, post-processing.js,
// scene-culling.js and the cameras read as they build.
const GFX_KEY = 'wagmi.gfx';
const GFX_TIERS = {
  high: { farScale: 1 },
  phone: {
    shadows: true, shadowTile: 1024, shadowFar: 140, shadowFarMax: 300, propShadows: false, nearShadowsOnly: true,
    ssr: false, bloomScale: 0.25, bloomStrength: 1, antialias: true,
    cars: 120, buses: 12, peds: 150, headlights: 32, clusters: [256, 64, 28, 48],
    propScale: 0.55, staticFar: 3000, farScale: 0.7, adaptive: true
  },
  low: {
    shadows: false, ssr: false, bloomScale: 0.25, bloomStrength: 0.6, antialias: false,
    cars: 90, buses: 8, peds: 0, headlights: 16, clusters: [256, 64, 28, 48],
    propScale: 0.5, staticFar: 2500, farScale: 0.6, adaptive: true
  }
};
const gfxValid = (v) => v === 'high' || v === 'phone' || v === 'low';
const gfxStore = {
  get() {
    try { return window.localStorage.getItem(GFX_KEY); } catch (e) { return null; }
  },
  set(v) {
    try {
      if (v === 'auto') window.localStorage.removeItem(GFX_KEY);
      else window.localStorage.setItem(GFX_KEY, v);
    } catch (e) { /* private mode: the choice lasts this page only */ }
  }
};
function autoGfxTier() {
  if (!navigator.gpu) return 'low';
  let coarse = false;
  try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) { /* old browsers */ }
  const short = Math.min(window.screen.width || Infinity, window.screen.height || Infinity);
  // (a touch-first device with no mouse or trackpad, such as a foldable or a tablet, is a phone too, whatever its size)
  let fine = true;
  try { fine = window.matchMedia('(any-pointer: fine)').matches; } catch (e) { /* old browsers */ }
  return coarse && (short <= 500 || !fine) ? 'phone' : 'high';
}
function createQuality() {
  let override = null;
  try { override = new URLSearchParams(window.location.search).get('gfx'); } catch (e) { /* no URL */ }
  if (!gfxValid(override)) override = null;
  const saved = gfxStore.get();
  const choice = gfxValid(saved) ? saved : 'auto';
  const auto = autoGfxTier();
  const tier = override || (choice === 'auto' ? auto : choice);
  const q = {
    tier, // what this load runs
    choice, // what the player picked: 'auto' | 'high' | 'low' (| 'phone')
    auto, // what auto picks on this device
    override, // ?gfx= (wins over the choice, this load only)
    backend: navigator.gpu ? 'webgpu' : 'webgl2', // settled once the renderer is up
    next: tier, // what the next load will run
    // Saves the choice for the next load (no live switch); returns the tier that load will run
    set(c) {
      const v = c === 'auto' || gfxValid(c) ? c : 'auto';
      gfxStore.set(v);
      q.choice = v;
      q.next = q.override || (v === 'auto' ? q.auto : v);
      return q.next;
    }
  };
  Object.assign(q, GFX_TIERS[tier]);
  return q;
}
// Once the renderer is up: drop to the low tier when the WebGPU device couldn't be had after all (unless a tier was
// picked), and never build the crowd on WebGL2
function settleQuality(q, isWebGPU) {
  q.backend = isWebGPU ? 'webgpu' : 'webgl2';
  if (isWebGPU) return;
  if (!q.override && q.choice === 'auto' && q.tier !== 'low') {
    q.tier = q.auto = q.next = 'low';
    Object.assign(q, GFX_TIERS.low);
  }
  q.peds = 0; // the crowd reads its poses from a storage buffer per instance, which WebGL2 can't do
}
const quality = createQuality();
window.NYC.quality = quality;

// (Mog City) Adaptive resolution, phone and low tiers only: after 3 s of play, a median frame over 22 ms for 2 s
// steps the 3D canvas down (1.0 -> 0.85 -> 0.7 of a CSS pixel), under 14 ms for 5 s steps it back up. Only the canvas
// size changes (no pipeline recompiles); devicePixelRatio is never used for it.
function createAdaptiveResolution(renderer) {
  const STEPS = [1.0, 0.85, 0.7];
  const win = [];
  let step = 0;
  let playT = 0;
  let slowT = 0;
  let fastT = 0;
  return {
    get scale() { return STEPS[step]; },
    update(rawDt) {
      const ms = rawDt * 1000;
      // a frame over 250 ms is a stall (the pause menu, a hidden tab, a compile), not the frame rate
      if (!(ms > 0) || ms > 250) return;
      playT += rawDt;
      win.push(ms);
      if (win.length > 31) win.shift();
      if (playT < 3 || win.length < 15) return;
      const sorted = win.slice().sort((a, b) => a - b);
      const median = sorted[sorted.length >> 1];
      slowT = median > 22 ? slowT + rawDt : 0;
      fastT = median < 14 ? fastT + rawDt : 0;
      let next = step;
      if (slowT >= 2 && step < STEPS.length - 1) next = step + 1;
      else if (fastT >= 5 && step > 0) next = step - 1;
      if (next === step) return;
      step = next;
      slowT = fastT = 0;
      win.length = 0;
      renderer.setPixelRatio(STEPS[step]);
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
  };
}

async function initApp() {
  const container = document.getElementById('canvas-container');
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingStatus = document.getElementById('loading-status');
  const loadingTrack = loadingOverlay ? loadingOverlay.querySelector('.loader-track') : null;
  const loadingFill = document.getElementById('loading-progress');
  // The loading bar sweeps while the city is being built (the main thread is busy) and fills as the shaders compile
  // (Mog City: the start gate's instant title, index.html, draws the same as a thin line: --wg-load, wg-load-fill)
  const setLoadingProgress = (p) => {
    const k = Math.min(1, Math.max(0, p));
    document.documentElement.style.setProperty('--wg-load', k.toFixed(3));
    document.documentElement.classList.add('wg-load-fill');
    if (!loadingFill) return;
    if (loadingTrack) loadingTrack.classList.remove('is-indeterminate');
    loadingFill.style.transform = `scaleX(${k})`;
  };
  // (Mog City: plain words for the player while it loads, not the engine's steps)
  const LOADING_TEXT = 'Loading Manhattan…';

  if (loadingStatus) {
    loadingStatus.textContent = LOADING_TEXT;
  }

  // 1. Initialize Three.js WebGPURenderer with 32-bit float reversedDepthBuffer
  // (Mog City: the graphics tier's MSAA, shadows and light clusters, see GFX_TIERS)
  const renderer = new THREE.WebGPURenderer({
    antialias: quality.antialias !== false,
    powerPreference: 'high-performance',
    reversedDepthBuffer: true
  });
  renderer.setPixelRatio(1.0);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = quality.shadows !== false;
  if (ClusteredLighting) {
    renderer.lighting = new ClusteredLighting(...(quality.clusters || [256, 32, 28, 48]));
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

  await renderer.init();
  markInit('renderer');
  // (Mog City) Without WebGPU, WebGPURenderer draws with its WebGL2 backend: settle the tier on it (auto goes low)
  // and say which backend it is under the title
  const isWebGPU = !!(renderer.backend && renderer.backend.isWebGPUBackend);
  settleQuality(quality, isWebGPU);
  renderer.shadowMap.enabled = quality.shadows !== false;
  if (!isWebGPU) {
    const subtitle = document.querySelector('.brand-subtitle');
    const label = subtitle && subtitle.firstChild;
    if (label && label.nodeType === Node.TEXT_NODE) label.textContent = label.textContent.replace('WebGPU', 'WebGL 2');
  }

  // 2. Build Scene & Physical Atmospheric Sky / PMREM IBL / 4096x4096 Shadow Lighting
  const scene = new THREE.Scene();
  const lightingSystem = new LightingSystem(scene, renderer);
  markInit('lighting');

  if (loadingStatus) {
    loadingStatus.textContent = LOADING_TEXT;
  }

  // 3. Build Manhattan Geography, Iconic Landmarks, Blocks, Street Details & Traffic
  const cityGrid = buildCityGrid(scene);
  markInit('cityGrid');
  const boroughs = buildBoroughs(scene, { sidewalks: cityGrid.sidewalks });
  markInit('boroughs');
  const { colliders: landmarkColliders } = buildLandmarks(scene);
  markInit('landmarks');
  const cityBlocks = buildCityBlocks(scene);
  markInit('blocks');
  const allColliders = [...landmarkColliders, ...cityBlocks.colliders, ...boroughs.colliders, ...(cityGrid.colliders || [])];

  const streetDetails = buildStreetDetails(scene);
  markInit('streetDetails');
  // Buildings turned along non-grid streets have oriented colliders whose world bounds reach past their lots: they stay
  // inside the property line anyway, so the road network (lanes & sidewalks) doesn't need them.
  // Elevated building sections that clear even a bus don't obstruct ground traffic (Mog City: after Slop New York 49b2ef2)
  const trafficSystem = createTrafficSystem(scene, cityGrid.sidewalks, [
    ...cityGrid.footprints,
    ...streetDetails.footprints,
    ...allColliders.filter((c) => !c.obb && (c.minY ?? 0) < 3.5)
  ]);
  markInit('traffic');
  const highwayTraffic = createHighwayTraffic(scene, cityGrid.highwayLanes);
  buildRoadPaint(scene, trafficSystem.network);
  markInit('roadPaint');

  // 4. Initialize Third-Person Controllers (Person, Car, Cyclist, Helicopter) & Multi-Camera System
  const controllerManager = new ThirdPersonControllerManager(scene, allColliders);
  const cameraSystem = new CameraSystem(renderer.domElement, controllerManager);
  const touchControls = new TouchControls(controllerManager);
  markInit('controllers');

  // Island-wide static geometry: chunk & distance-cull the small props, shadow stand-ins for the big casters
  // (scene-culling.js)
  const cullingRoots = ['ManhattanCityGrid', 'ManhattanCityBlocks', 'ManhattanStreetDetails', 'ManhattanLandmarks', 'Boroughs']
    .map((name) => scene.getObjectByName(name))
    .filter(Boolean);
  // (Mog City: no shadow stand-ins on a tier without shadows; the phone tier's props cull nearer, see scene-culling.js)
  const cullingStats = setupSceneCulling(scene, cullingRoots, quality.shadows === false ? null : lightingSystem.sunLight.shadow, quality);

  // (Mog City) The static city's world matrices, once, including the chunks and shadow stand-ins made above: its
  // buildings, street details, trees, landmarks, boroughs and road markings never move as objects (the tree levels,
  // the building details' streaming, the tram and the breakables change instance buffers only), so the per-frame
  // matrix walk skips them. After Slop New York 64ad030, adapted: upstream stops the whole scene's matrix updates and
  // updates its moving groups by hand, but wagmi adds its characters, sets, effects and cars straight to the scene,
  // and they must keep moving; only these groups are frozen.
  const staticCity = [...cullingRoots, scene.getObjectByName('RoadMarkings'), ...scene.children.filter((o) => o.userData.shadowProxy)]
    .filter(Boolean);
  scene.updateMatrixWorld(true);
  let staticObjects = 0;
  for (const root of staticCity) {
    root.traverse((o) => {
      o.matrixAutoUpdate = false;
      staticObjects++;
    });
    root.matrixWorldAutoUpdate = false;
  }
  cullingStats.staticRoots = staticCity.length;
  cullingStats.staticObjects = staticObjects;
  markInit('culling');

  // Small InstancedMeshes (<= 1000 instances) keep their matrices in uniform buffers that three.js
  // re-uploads on every draw of every pass (~2.5 MB/frame with the shadow cascades, stalling the GPU queue).
  // Storage attributes are only uploaded when instanceMatrix.needsUpdate is set.
  // (Mog City: on WebGPU only. Three's WebGL2 backend can't read an instance's matrix from a storage buffer: the
  // city came out torn into spikes at 3 fps)
  if (isWebGPU) {
    scene.traverse((object) => {
      if (object.isInstancedMesh) {
        object.instanceMatrix = new THREE.StorageInstancedBufferAttribute(object.instanceMatrix.array, 16);
      }
    });
  }

  // 5. TSL RenderPipeline with Half-Res Screen Space Reflections (SSRNode), Bloom & Filmic Toning
  //    Fade out distant and matte surfaces so SSR spends its rays on visible glossy reflections.
  //    (Mog City: the matte cut-off, binary refine and reflection mask ported from Slop New York by Mr.doob, MIT, commit d837961)
  const scenePass = pass(scene, cameraSystem.camera);
  // The multisampled colour attachments (output, normal, metalRough) only need resolving, never storing: discarding
  // them spares the GPU writing 3 x 4 samples per pixel to memory every frame (transient, memoryless attachments where
  // the browser supports them). The multisampled depth stays stored: SSR reads it.
  scenePass.renderTarget.storeMultisampledColorBuffer = false;
  const scenePassColor = scenePass.getTextureNode('output');
  // (Mog City) The phone and low tiers draw no reflections: no SSR pass and a single colour attachment. It is still
  // an MRT of its own: the decals, puddles, contact shadows and effects that write their own normal / metalRough
  // (material.mrtNode) are merged into it, and with no MRT at all their shaders would have no output left
  let sceneMRT;
  let ssrPass = null;
  let reflections = vec4(0);
  if (quality.ssr === false) {
    sceneMRT = mrt({ output: output });
    scenePass.setMRT(sceneMRT);
  } else {
    const ssrFade = smoothstep(360.0, 180.0, positionView.z.negate());
    const maxSSRRoughness = 0.75;
    sceneMRT = mrt({
      output: output,
      normal: normalView,
      metalRough: vec2(roughness.lessThan(maxSSRRoughness).select(metalness.mul(ssrFade), 0), roughness)
    });
    sceneMRT.setBlendMode('normal', new THREE.BlendMode(THREE.MaterialBlending));
    sceneMRT.setBlendMode('metalRough', new THREE.BlendMode(THREE.MaterialBlending));
    scenePass.setMRT(sceneMRT);

    const scenePassDepth = scenePass.getTextureNode('depth');
    const scenePassNormal = scenePass.getTextureNode('normal');
    const scenePassMetalRough = scenePass.getTextureNode('metalRough');

    ssrPass = ssr(scenePassColor, scenePassDepth, scenePassNormal, {
      metalnessNode: scenePassMetalRough.r,
      roughnessNode: scenePassMetalRough.g,
      camera: cameraSystem.camera
    });
    ssrPass.resolutionScale = 0.5;
    ssrPass.blurQuality = 1;
    ssrPass.maxDistance.value = 42;
    ssrPass.thickness.value = 0.85;
    // Fewer coarse steps, then refine detected hits to keep reflection edges precise.
    ssrPass.quality.value = 0.25;
    ssrPass.binaryRefine = true;
    ssrPass.intensity.value = 0.50;
    ssrPass.screenEdgeFadeBlack = true;

    // Roughness mip blur must not spread reflections back onto matte or nonreflective surfaces.
    const reflectionMask = scenePassMetalRough.r.greaterThan(0).select(smoothstep(maxSSRRoughness, 0.55, scenePassMetalRough.g), 0);
    reflections = ssrPass.mul(reflectionMask);
  }
  const colorGrade = createPostProcessing(renderer, scenePassColor, reflections, quality);
  const { bloomPass } = colorGrade;
  const renderPipeline = new THREE.RenderPipeline(renderer, colorGrade.outputNode);

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
  // (Mog City: on foot he walks the way you press, relative to the camera, so one Move for the four keys)
  const controlHints = {
    person: [[['W', 'A', 'S', 'D'], 'Move'], [['Shift'], 'Sprint'], [['Space'], 'Jump'], [['Drag'], 'Orbit']],
    car: [[['W', 'S'], 'Drive / Reverse'], [['A', 'D'], 'Steer'], [['Shift'], 'Boost'], [['Drag'], 'Orbit']],
    cyclist: [[['W', 'S'], 'Pedal / Brake'], [['A', 'D'], 'Lean & Turn'], [['Shift'], 'Sprint'], [['Drag'], 'Orbit']],
    helicopter: [[['W', 'S'], 'Pitch'], [['A', 'D'], 'Yaw'], [['Space', 'E'], 'Ascend'], [['Q', 'C'], 'Descend'], [['Shift'], 'Boost']]
  };
  // (Mog City) ...and the same guide on a game pad, when a pad was the last thing used (wagmi/pad.js: setHintInput): the
  // buttons by their standard names, drawn as that pad's own (kbd data-pad)
  const controlHintsPad = {
    person: [[['LS'], 'Move'], [['RS'], 'Look'], [['L3'], 'Sprint'], [['A'], 'Jump']],
    car: [[['RT', 'LT'], 'Drive / Reverse'], [['LS'], 'Steer'], [['X'], 'Boost'], [['RS'], 'Look']],
    cyclist: [[['RT', 'LT'], 'Pedal / Brake'], [['LS'], 'Lean & Turn'], [['X'], 'Sprint'], [['RS'], 'Look']],
    helicopter: [[['LS'], 'Pitch & Yaw'], [['RT', 'LT'], 'Ascend / Descend'], [['X'], 'Boost'], [['RS'], 'Look']]
  };
  let hintPad = false;
  // Boosted top speeds in mph (controllers.js caps them at 8.2, 36, 19 & 52 m/s): full scale of the speed meter
  // (Mog City: Dan's car has a dial of its own, carDial: the meter fills to its 176)
  const topSpeedMph = { person: 18, car: 176, cyclist: 43, helicopter: 116 };
  // (Mog City, the owner 24 Oct: Dan's car peaks at 176 and never shows a frozen number. Double its real mph up to
  // the cruise (34 m/s, 76 mph: 152), the boost's 76-125 mph over the last 24 (56 m/s: 176); held at either top it
  // wanders the 3 under it (149-152, 173-176), a new number every update)
  let dialLast = -1;
  function carDial(c, boosting) {
    const v = Math.abs(c.speed), v1 = c.topSpeed ?? 34, v2 = c.boostSpeed ?? 56;
    const at = v <= v1 ? 152 * v / v1 : 152 + 24 * Math.min(1, (v - v1) / (v2 - v1));
    // (held at a top: at the boost's while it burns, at the cruise's otherwise; the boost dying away is no top)
    const cap = (c.boosting ?? boosting) ? v2 : v1;
    if (Math.abs(v - cap) > cap * 0.005) return (dialLast = Math.round(at));
    const top = cap === v2 ? 176 : 152;
    let n; do n = top - Math.floor(Math.random() * 4); while (n === dialLast);
    return (dialLast = n);
  }

  function renderControlHints(mode) {
    if (!elControlsHint) return;
    const items = ((hintPad ? controlHintsPad : controlHints)[mode] || []).map(([keys, action]) => {
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
      for (const name of streets.split(' & ')) {
        const sign = document.createElement('span');
        sign.className = 'street-sign';
        sign.textContent = name;
        row.appendChild(sign);
      }
      nodes.push(row);
    }
    elLocation.replaceChildren(...nodes);
  }

  function teleportTo(x, z, heading = Math.PI) {
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

  window.addEventListener('resize', () => {
    cameraSystem.onResize(window.innerWidth, window.innerHeight);
    renderer.setSize(window.innerWidth, window.innerHeight);
    placeModeIndicator();
    if (mapSystem.isFullMapOpen) {
      mapSystem.resizeFullCanvas();
      mapSystem.renderFullMap();
    }
  });

  // Initialize default selection
  selectMode('car');
  selectCamera('chase', true);
  selectTime('golden');
  // the web fonts change the buttons' widths once they arrive
  if (document.fonts) document.fonts.ready.then(placeModeIndicator);
  markInit('ui');

  // The loading screen stays up while the shaders compile (precompileShaders() & the warm-up frame, see the loop) and
  // until the first frame is on screen
  if (loadingStatus) {
    loadingStatus.textContent = LOADING_TEXT;
  }

  // Expose programmatic API for testing & inspection
  let currentFps = 60;
  window.__NYC_APP = {
    renderer,
    scene,
    renderPipeline,
    postFX: { scenePass, ssrPass, bloomPass, colorGrade }, // (Mog City: ssrPass null on the phone & low tiers)
    quality, // (Mog City: the graphics tier, also window.NYC.quality)
    cullingStats,
    cityBlocks,
    quadtree: cityBlocks.quadtree,
    trafficSystem,
    highwayTraffic,
    controllerManager,
    touchControls,
    gamepadControls,
    cameraSystem,
    lightingSystem,
    mapSystem,
    selectMode,
    selectCamera,
    cycleCamera,
    setHintInput,
    selectTime,
    getFps: () => currentFps
  };

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
    // instanced mesh gets a build of its own unless its chunks share a pipeline
    // (Mog City: the first visible chunk compiles, after Slop New York 539289a)
    const culled = [];
    const jobs = [];
    const jobByMaterial = new Map();
    const pipelines = new Set();
    scene.traverseVisible((o) => {
      if (o.frustumCulled) {
        culled.push(o);
        o.frustumCulled = false;
      }
      if (!o.isMesh && !o.isLine && !o.isPoints && !o.isSprite) return;
      // Use the first visible chunk: the original representative may be in an inactive tree cell. Shadow stand-ins
      // only draw in the shadow maps (the warm-up frame compiles those).
      if (o.userData.shadowProxy) return;
      const pipeline = o.userData.sharesPipelineWith || o;
      if (pipelines.has(pipeline)) return;
      pipelines.add(pipeline);
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

  // 6. Animation Loop
  let lastTime = performance.now();
  let elapsed = 0;
  let frameCount = 0;
  let fpsTimer = 0;
  let warmedUp = false; // see the first frame below

  if (elFps) elFps.textContent = '60';
  // (Mog City) the phone & low tiers' canvas resolution follows the frame time (see createAdaptiveResolution)
  const adaptiveResolution = quality.adaptive ? createAdaptiveResolution(renderer) : null;

  renderer.setAnimationLoop((now) => {
    const rawDt = (now - lastTime) * 0.001;
    lastTime = now;
    if (adaptiveResolution && warmedUp) adaptiveResolution.update(rawDt);
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    elapsed += dt;

    // Update 3rd-person controllers, camera, signals, traffic & vehicle collisions, building LODs, and dynamic shadow focus
    gamepadControls.update(dt);
    controllerManager.update(dt, elapsed);
    cameraSystem.update(dt, elapsed);
    streetDetails.signalClock.value = elapsed;
    trafficSystem.update(
      dt,
      elapsed,
      cameraSystem.currentPos,
      controllerManager.getActiveEntity(),
      controllerManager.activeMode,
      cameraSystem.camera
    );
    highwayTraffic.update(dt, cameraSystem.camera, controllerManager.getActiveEntity(), controllerManager.activeMode);
    if (boroughs.update) boroughs.update(elapsed); // Roosevelt Island Tramway cabins
    cityBlocks.update(cameraSystem.currentPos.x, cameraSystem.currentPos.z);
    if (cityBlocks.updateLights) cityBlocks.updateLights(cameraSystem.camera);
    if (streetDetails.update) streetDetails.update(cameraSystem.camera);
    lightingSystem.update(cameraSystem.currentPos);
    mapSystem.update();
    if (warmedUp) updateSceneCulling(cameraSystem.camera.position); // the warm-up frame draws every chunk

    // Render frame via TSL RenderPipeline (SSR + Bloom)
    if (!warmedUp) {
      // First frame = pipeline warm-up behind the loading screen, for what precompileShaders() can't reach (the shadow
      // map passes): with frustum culling off, every visible material's pipelines compile now instead of stalling the
      // first time the camera turns towards it (one chunk / shadow stand-in per shared pipeline is enough)
      const culled = [];
      const pipelines = new Set();
      scene.traverseVisible((o) => {
        const pipeline = o.userData.sharesPipelineWith || o;
        if (pipelines.has(pipeline)) return;
        pipelines.add(pipeline);
        if (o.frustumCulled) {
          culled.push(o);
          o.frustumCulled = false;
        }
      });
      renderPipeline.render();
      for (const o of culled) o.frustumCulled = true;
      markInit('warmup');
    }
    renderPipeline.render();
    if (!warmedUp) {
      warmedUp = true;
      markInit('firstFrame');
      // The loading screen stays up until the GPU has got through the first frame (and the pipelines its warm-up
      // compiled), i.e. until the city is actually on screen
      const device = renderer.backend.device;
      Promise.resolve(device && device.queue.onSubmittedWorkDone()).catch(() => {}).then(() => {
        markInit('gpu');
        console.log(`[init] ${initTimings.join(', ')}`);
        initTimings = null;
        // (Mog City) the lighter tiers' memory at ready, for the phone checks
        if (quality.tier !== 'high') {
          const mem = renderer.info.memory;
          const heap = performance.memory ? `, JS heap ${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB` : '';
          console.log(`[gfx] ${quality.tier} on ${quality.backend}: ${mem.geometries} geometries, ${mem.textures} textures${mem.texturesSize ? ` (${Math.round(mem.texturesSize / 1048576)} MB)` : ''}${heap}`);
        }
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        setLoadingProgress(1);
        window.__NYC_APP.ready = true;
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
      const mph = mode === 'car' ? carDial(activeEnt, controllerManager.keys.boost) : Math.round(Math.abs(activeEnt.speed) * 2.237);
      const altFt = Math.max(0, Math.round(activeEnt.position.y * 3.281));

      if (elFps) {
        elFps.textContent = String(currentFps);
        elFps.className = currentFps >= 50 ? 'fps-ok' : currentFps >= 30 ? 'fps-warn' : 'fps-bad';
      }
      if (elSpeed) elSpeed.textContent = String(mph);
      if (elSpeedMeter) elSpeedMeter.style.transform = `scaleX(${Math.min(1, mph / (topSpeedMph[mode] || 80))})`;
      document.body.classList.toggle('is-boosting', controllerManager.keys.boost && mph > 0);
      if (elAltitude) elAltitude.textContent = altFt.toLocaleString('en-US');
      // The street corner of the player on the follow cameras, of the camera itself on the scenic ones
      const where = cameraSystem.getActivePreset().category === 'follow' ? activeEnt.position : cameraSystem.currentPos;
      renderLocation(getLocationLabel(where.x, where.z));
    }
  });
}

initApp();

})();
