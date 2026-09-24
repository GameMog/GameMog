// Runtime check fixture: a plain velodrome-shaped oval banked 42 degrees in
// the bends, ridden by the cyclist kit. It hands its scene and track to the
// check (self.__cyc) so the check can measure the banking, the lean and where
// the feet and hands are. Not a published world.
(function () {
  var PI = Math.PI;
  // a 333 m oval: two straights and two banked bends (bank in degrees as the 4th value)
  var pts = [], R = 28, S = 50;
  for (var i = 0; i < 40; i++) {
    var u = i / 40, per = 2 * S + 2 * PI * R, d = u * per, x, z, bank;
    if (d < S) { x = -S / 2 + d; z = -R; bank = 12; }
    else if (d < S + PI * R) { var a = (d - S) / R; x = S / 2 + Math.sin(a) * R; z = -Math.cos(a) * R; bank = 42; }
    else if (d < 2 * S + PI * R) { x = S / 2 - (d - S - PI * R); z = R; bank = 12; }
    else { var b = (d - 2 * S - PI * R) / R; x = -S / 2 - Math.sin(b) * R; z = Math.cos(b) * R; bank = 42; }
    // anticlockwise, as velodromes are ridden: left-hand bends, the right edge raised
    pts.push([x, 0, -z, bank]);
  }
  GameMog.world({
    assets: ['human-athlete-male', 'human-athlete-female'],
    theme: { sky: '#9BC4E6', fog: '#DDE6EE', ink: '#101820', panel: '#FFFFFF', accent: '#E4002B', font: 'Barlow Condensed' },
    graphics: { exposure: 1, environment: true, shadows: { extent: 30, mapSize: 2048 } },
    camera: { distance: 6.5, height: 2.6, fov: 58 },
    track: { width: 8, points: pts },
    build: function (ctx) {
      var T = ctx.THREE; self.__cyc = { scene: ctx.scene, track: ctx.track };
      var sun = new T.DirectionalLight('#FFF1DC', 3); sun.position.set(40, 80, 30); sun.castShadow = true;
      ctx.scene.add(sun, new T.HemisphereLight('#CFE3F7', '#8A7A66', 1));
      ctx.sky({ top: '#3F7FCB', horizon: '#DDE9F2', bottom: '#8C9AA6', sun: [0.4, 0.7, 0.3] });
      var g = new T.PlaneGeometry(400, 400); g.rotateX(-PI / 2);
      ctx.scene.add(new T.Mesh(g, new T.MeshStandardMaterial({ color: '#7C8B6A' })));
      ctx.scene.add(ctx.track.ribbon({ material: new T.MeshStandardMaterial({ color: '#C79A62', roughness: 0.6 }) }));
      ctx.scene.add(ctx.track.ribbon({ width: 0.12, offset: -2.6, material: new T.MeshBasicMaterial({ color: '#D12' }), y: 0.03 }));
      ctx.scene.add(ctx.track.ribbon({ width: 1.2, offset: -4.6, material: new T.MeshStandardMaterial({ color: '#2A5DB0' }), y: 0.03 }));
    },
    player: function (ctx) { return ctx.assets.cyclist('human-athlete-male', { skin: 'african', height: 1.84, outfit: { top: '#15264F', trim: '#E4002B', shorts: '#15264F', shoes: '#FFFFFF', pattern: 'band', bib: { name: 'LAB', number: '1' } }, bike: { kind: 'track', frame: '#E4002B', trim: '#FFFFFF' }, helmet: { color: '#FFFFFF', trim: '#E4002B' }, name: 'Lab (USA)', color: '#15264F' }); },
    rival: function (ctx, k) { return ctx.assets.cyclist(k % 2 ? 'human-athlete-female' : 'human-athlete-male', { skin: 'caucasian', height: 1.74, outfit: { top: '#1E9E4A', trim: '#FFD83A', shorts: '#1E9E4A', shoes: '#111', pattern: 'band', bib: { name: 'R' + k, number: String(k) } }, bike: { kind: k % 2 ? 'road' : 'track', frame: '#1E9E4A' }, name: 'Rival ' + k, color: '#1E9E4A' }); },
    obstacles: function () { return []; },
  });
})();
