// Floating origin (?origin=float; cities/sf/docs/STREAMING.md "Floating origin"). The world contract's coordinates
// stay what they are: absolute metres in the city's frame, in JavaScript's 64-bit numbers, for every system (physics,
// the road graph, the chase, the crowds, story markers, saved games). What a 32-bit GPU sees is rebased instead: each
// render of the city's scene draws it, and its camera, shifted by -origin, so everything near the player is near 0 in
// render space wherever the player is. The origin moves (a rebase) when the camera is over `threshold` m from it.
//   - the scene's root and the camera are shifted for the scene's own renders (renderer.render(scene, ...)) and put
//     back right after, matrices and all: a raycast, getWorldPosition or a projected marker between frames sees the
//     absolute frame as before. A nested render (the shadow cascades) runs inside the shifted one.
//   - the lights whose direction is their position (the sun, the sky's hemisphere light) are kept where they were.
//   - objects three doesn't recompute (matrixWorldAutoUpdate false: New York's frozen static city and trees) get
//     their world matrices shifted by hand for the render, from a list walked once per rebase.
//   - shaders: index.html swaps TSL's positionWorld and cameraPosition for themselves + NYC.ORIGIN (a uniform, the
//     origin during the city's renders, 0 otherwise), so a world-anchored pattern or the ground mask stays put;
//     window.NYC.renderOrigin is the same offset for the scripts that read the camera while it draws (trees.js).
// API (world.origin): { enabled, x, z, threshold, rebases, log, rebase(x, z), toRender(p), toWorld(p), on(fn) }.
const APP = () => globalThis.window?.__NYC_APP || null;

export function floatingOriginWanted() {
  try { return new URLSearchParams(globalThis.location?.search || '').get('origin') === 'float'; } catch { return false; }
}

export function createFloatingOrigin() {
  const q = (() => { try { return new URLSearchParams(location.search); } catch { return new URLSearchParams(); } })();
  const O = {
    enabled: false, x: 0, z: 0,
    threshold: Math.max(16, +q.get('originN') || 1000),
    // (the origin snaps to a grid this fine, m)
    snap: Math.max(1, +q.get('originSnap') || 1),
    rebases: 0, log: [], renders: 0, shiftMs: 0,
    // (the frozen objects shifted by hand: how many, the last walk that found them, ms, and how many walks)
    frozen: 0, frozenMs: 0, frozenWalks: 0,
    listeners: new Set(),
    on(fn) { O.listeners.add(fn); return () => O.listeners.delete(fn); },
    toRender: (p) => ({ ...p, x: p.x - O.x, z: p.z - O.z }),
    toWorld: (p) => ({ ...p, x: p.x + O.x, z: p.z + O.z }),
    rebase(x, z, why = 'call') {
      const nx = Math.round(x / O.snap) * O.snap, nz = Math.round(z / O.snap) * O.snap;
      if (nx === O.x && nz === O.z) return false;
      const from = { x: O.x, z: O.z };
      O.x = nx; O.z = nz; O.rebases++;
      const e = { n: O.rebases, from, to: { x: nx, z: nz }, why, t: +(globalThis.performance?.now() / 1000 || 0).toFixed(2) };
      O.log.push(e); if (O.log.length > 50) O.log.shift();
      for (const f of O.listeners) { try { f(e); } catch (err) { console.warn('[origin] listener', err); } }
      return true;
    },
    install,
  };

  function install(app = APP()) {
    if (O.enabled || !app?.renderer || !app.scene) return false;
    const { renderer, scene } = app, N = globalThis.window?.NYC || {};
    const U = N.ORIGIN || null; // (index.html's TSL patch: absent, shaders see render space)
    N.renderOrigin = N.renderOrigin || { x: 0, z: 0 };
    const render0 = renderer.render.bind(renderer);
    let depth = 0;
    const kept = []; // the lights kept in place: [light, x, z]
    // The frozen: objects whose world matrix three never recomputes (matrixWorldAutoUpdate false: New York's static
    // city roots, js/main.js, and its trees, js/trees.js). The scene's shift can't reach them, so each render moves
    // their matrices' translation by -origin itself (a pure translation in world space: elements 12 and 14) and puts
    // the exact old values back after; the matrices under them that three does recompute follow from these. The
    // list is gathered by one walk of the scene at each rebase (and at the first shifted render), not every frame.
    let frozen = [], frozenAt = -1, saved = new Float64Array(0);
    function gatherFrozen() {
      const t0 = performance.now(), list = [];
      scene.traverse((o) => { if (o !== scene && o.matrixWorldAutoUpdate === false) list.push(o); });
      frozen = list; frozenAt = O.rebases;
      if (saved.length < list.length * 2) saved = new Float64Array(list.length * 2);
      O.frozen = list.length; O.frozenMs = +(performance.now() - t0).toFixed(2); O.frozenWalks++;
    }
    renderer.render = function (scn, camera, ...rest) {
      if (scn !== scene || depth > 0) return render0(scn, camera, ...rest);
      const cam = app.cameraSystem?.camera;
      // the camera's distance from the origin decides (the camera is what is drawn round)
      const at = cam || camera;
      if (at && Math.hypot(at.position.x - O.x, at.position.z - O.z) > O.threshold) O.rebase(at.position.x, at.position.z, 'distance');
      if (!O.x && !O.z) return render0(scn, camera, ...rest);
      depth++;
      const shiftCam = camera && !camera.parent; // (a camera in the scene moves with it)
      scene.position.x -= O.x; scene.position.z -= O.z;
      if (shiftCam) { camera.position.x -= O.x; camera.position.z -= O.z; camera.updateMatrixWorld(); }
      kept.length = 0;
      for (const o of scene.children) if (o.isSunLight || o.isHemisphereLight || (o.isDirectionalLight && !o.target?.parent)) { kept.push(o); o.position.x += O.x; o.position.z += O.z; }
      if (frozenAt !== O.rebases) gatherFrozen();
      for (let i = 0; i < frozen.length; i++) {
        const e = frozen[i].matrixWorld.elements;
        saved[2 * i] = e[12]; saved[2 * i + 1] = e[14]; e[12] -= O.x; e[14] -= O.z;
      }
      if (U) U.value.set(O.x, 0, O.z);
      N.renderOrigin.x = O.x; N.renderOrigin.z = O.z;
      try { return render0(scn, camera, ...rest); }
      finally {
        const t1 = performance.now();
        scene.position.x += O.x; scene.position.z += O.z;
        for (const o of kept) { o.position.x -= O.x; o.position.z -= O.z; }
        for (let i = 0; i < frozen.length; i++) { const e = frozen[i].matrixWorld.elements; e[12] = saved[2 * i]; e[14] = saved[2 * i + 1]; }
        if (shiftCam) { camera.position.x += O.x; camera.position.z += O.z; camera.updateMatrixWorld(); }
        if (U) U.value.set(0, 0, 0);
        N.renderOrigin.x = 0; N.renderOrigin.z = 0;
        // (every matrix back in the absolute frame before anything reads one)
        scene.updateMatrixWorld();
        depth--;
        O.renders++;
        O.shiftMs += performance.now() - t1; // (the cost: matrices put back)
      }
    };
    O.enabled = true;
    console.info(`[origin] floating origin on: rebase past ${O.threshold} m${U ? '' : ' (no TSL patch: world-anchored shaders follow the render frame)'}`);
    return true;
  }
  return O;
}
