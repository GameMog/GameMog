// SF 2040: what is still burning.
//   windows  a few clusters of windows in the walk-ups and the old fronts burning, the fire flickering behind the glass
//            and soot licked up the wall over them: drawn by the city's facade material itself, so they sit in its own
//            windows (cities/sf/js/tsl-materials.js createPreWarBuildingMaterial, cityUniforms.uFireWindows)
//   wrecks   one in three of the burnt-out cars in the streets still alight (trafficSystem.abandon's burnt ones), within
//            WRECK_R m of the camera: fx.js's fires, flames and smoke, on them
//   createBurning(W, fx) -> { update(camera, dt), count(), setOn(on) }
const WRECK_R = 170;

export function createBurning(W, fx) {
  const app = W.app, N = W.world.look;
  const setOn = (on) => { if (N.cityUniforms?.uFireWindows) N.cityUniforms.uFireWindows.value = on ? 1 : 0; };
  setOn(true);
  const wrecks = []; fx.sources.set('wrecks', wrecks);
  let wreckT = 0;
  function wrecksUpdate(c) {
    wrecks.length = 0;
    const cars = app.trafficSystem?.cars || [];
    for (let i = 0; i < cars.length; i++) {
      const v = cars[i];
      if (!v.burnt || v.disabled || !v.edge || i % 3) continue;
      if (Math.hypot(v.x - c.position.x, v.z - c.position.z) > WRECK_R) continue;
      wrecks.push({ x: v.x, y: (v.y || 0) + 1.0, z: v.z, s: 0.95 });
    }
  }
  function update(c, dt = 0.016) {
    if ((wreckT -= dt) <= 0) { wreckT = 0.5; wrecksUpdate(c); }
  }
  return { update, setOn, count: () => ({ wrecks: wrecks.length, windows: N.cityUniforms?.uFireWindows?.value || 0 }) };
}
