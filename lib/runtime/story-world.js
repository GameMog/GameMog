// Runtime check fixture: a story told as the GM comes in (open.story; AI Alps, the owner 4 Oct: "with a Cut scene
// explaining the next level mission every 1500 GM"), at the scale of a check: a goal of 400 GM with beats at 100 and
// 200 (and a third at 300). The first beat's scene opens through a machine's eyes (shot.vision: a red wash, lines typed
// out, a box on the DJ's head), then cuts to an ordinary shot; the DJ stays to fight. The second raises the heat to 3
// and sends a named boss; the third raises it to 6 and names none (the heat's own boss comes). The check passes 100 GM
// and sees the scene play, skips it with Enter and finds the run going on as it was, then sees the autopilot pass 200
// GM with no scene. It listens for the chapters, knockouts and heat through ctx.on (self.__story). Not a published
// world.
(function () {
  GameMog.world({
    assets: ['human-athlete-male'],
    theme: { sky: '#1C2234', fog: '#3A4258', ink: '#FFFFFF', accent: '#FF7A3D', font: 'Oxanium' },
    graphics: { exposure: 1, environment: true },
    camera: { distance: 4.4, height: 1.6, fov: 54 },
    open: {
      bounds: { x: [-30, 30], z: [-30, 30] },
      spawn: [0, 0, 0],
      civilians: 2, maxEnemies: 2, health: 1000,
      heat: { every: 180 },
      weapons: false,
      goal: { gm: 400, title: 'Paid in full', text: 'The check is over.' },
      hud: { gm: 'Fund', banner: 'A story check.' },
      story: {
        objective: 'Get 100 GM',
        beats: [
          { gm: 100, banner: 'Chapter 2', objective: 'Find the DJ', shots: [
            { t: 2.6, fade: 'in', cam: { from: [-1.4, 1.65, 2.4], to: [-1.1, 1.65, 3.2], look: 'dj' },
              cast: [{ id: 'og', at: [0, 0], face: [0, 8] }, { id: 'dj', kind: 'thug', name: 'DJ Volt', at: [0, 8], face: 'og', stay: true }],
              vision: { tint: '#FF1A1A', lines: ['TARGET: DJ VOLT', 'THREAT: LOW', 'MISSION: FIND THE DJ'], track: 'dj' } },
            { t: 3, cam: { from: [4, 2.2, -2], to: [3.4, 2, -1], look: 'og' }, say: 'He knows where the money went.' },
          ] },
          { gm: 200, banner: 'Chapter 3', objective: 'Take the Promoter down', heat: 3, boss: 'The Promoter', shots: [
            { t: 2.4, cam: { from: [2, 1.7, -3], to: [1.6, 1.7, -2.4], look: 'og' }, cast: [{ id: 'og', at: [0, 0], face: [0, 8] }],
              vision: { tint: '#22E0FF', lines: ['NEW TARGET: THE PROMOTER'] } },
          ] },
          { gm: 300, banner: 'Chapter 4', objective: 'Hold the floor', heat: 6, shots: [
            { t: 2, cam: { from: [-2, 1.7, -3], to: [-1.6, 1.7, -2.4], look: 'og' }, cast: [{ id: 'og', at: [0, 0], face: [0, 8] }], say: 'They are sending everyone.' },
          ] },
        ],
      },
      crew: { thug: { hp: 1, gm: 5, names: ['Bouncer'] }, boss: { names: ['Big Lou'] } },
    },
    build: function (ctx) {
      var T = ctx.THREE;
      // what the world hears of the open world's moments through ctx.on (a world that tells a story asks for them by
      // telling it); handed to the check as self.__story
      var heard = { chapter: [], knockout: 0, heat: 0 };
      self.__story = heard;
      ctx.on('chapter', function (e) { heard.chapter.push(e.chapter); });
      ctx.on('knockout', function () { heard.knockout++; });
      ctx.on('heat', function () { heard.heat++; });
      ctx.sky({ top: '#141A2A', horizon: '#4A5270', bottom: '#20222A' });
      ctx.scene.add(new T.HemisphereLight('#C8D4EC', '#3A3630', 0.9));
      var sun = new T.DirectionalLight('#FFE6C8', 1.8); sun.position.set(-12, 20, -6); ctx.scene.add(sun);
      var ground = new T.Mesh(new T.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ color: '#6E7480', roughness: 0.9 })); ctx.scene.add(ground);
      // a booth at the far end, lit, so the scene has something in it
      var booth = new T.Mesh(new T.BoxGeometry(3, 1.1, 1), new T.MeshStandardMaterial({ color: '#2A2E3A', emissive: '#FF3D7F', emissiveIntensity: 0.25 }));
      booth.position.set(0, 0.55, 10); ctx.scene.add(booth); ctx.solid(booth);
    },
    player: function (ctx) {
      return ctx.assets.human('human-athlete-male', { name: 'Tester', color: '#FF7A3D', skin: 'caucasian', hair: 'short04', height: 1.9, build: { muscle: 0.9, lean: 0.4 } });
    },
  });
})();
