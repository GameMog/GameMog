    /* ================================================== Grand Prix: the show around the race (ARTIFICIAL1 M2, lane C2) == */
    // gp-stage.js. Pasted into boot() by gp.js at /*@include gp-stage.js*/. ONE top-level binding, GpStage; every other
    // name lives inside it, so nothing of v1's boot() is shadowed. VIEW: the page only through env.
    //
    // The podium stage and its fireworks, the flag-waver, the brake and activation boards, the agents' standing forms
    // (EXPERIENCE.md 6.1, lane C2: X14, X16, X21, X22, X33).
    //
    //   GpStage.stage(env) -> St | null           null: none of it yet (gp.js runs as M1)
    //     env = { THREE, three, scene, renderer, camera, quality, T, cfg, warn, page(e, data) }
    //   St = { event(e), frame(dt, state, camera), play(id, o) -> bool /* 'flag' | 'podium' */, dispose() }
    //
    // STUB (M2 hour 0, the integrator): the look waits for look round 3 and the agents' cockpit work.
    var GpStage = (function () {
      function stage(env) { return null; }
      return { stage: stage };
    })();
