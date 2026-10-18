    /* ============================================================= Grand Prix: the car view (ARTIFICIAL1 M2, lane C2) == */
    // gp-car.js. Pasted into boot() by gp.js at /*@include gp-car.js*/. ONE top-level binding, GpCar; every other name
    // lives inside it, so nothing of v1's boot() is shadowed. VIEW: the page only through env.
    //
    // The twenty cars and the agents in them (EXPERIENCE.md 6.1, lane C2: the car view moves out of gp.js; the agents'
    // roster is the world's data, gp.drivers). Until it lands, gp.js's M1 car view draws every car (gpModelView, the
    // library's model-why-v07, or the code-built stand-in).
    //
    //   GpCar.view(env) -> V | null              null: gp.js's own car view
    //     env = { THREE, three, scene, renderer, camera, quality, T, cfg, asset /* ASSETS[gp.car] or null */, warn }
    //   V = { group, model, levels, onboard(mode), pose(R, alpha, focus /* filled */), tris(), event(e), dispose() }
    //
    // STUB (M2 hour 0, the integrator): the look waits for look round 3 and the agents' cockpit work.
    var GpCar = (function () {
      function view(env) { return null; }
      return { view: view };
    })();
