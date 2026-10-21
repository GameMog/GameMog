// SUPERINTELLIGENCE SPRINT. A daytime Grand Prix sprint on the streets of the city (a first-party world, 21 Oct 2026).
//
// The owner, 21 Oct, after ARTIFICIAL1.: "less contrast, more competitive racing, and new track, daytime street circuit ...
// the game is not fun, racing isn't competitive and it is too dark ... think Meme track, there is chaos and competition".
// So: a 2.2 km street lap round the blocks of the runtime's city map (lib/runtime/maps/city, midtown, by day), five laps,
// the twenty agents of ARTIFICIAL1. on the same cars, and the pack (gp.pack): the field kept round you as in a kart race,
// the cars up the road easing off and the cars behind pushing, from the middle of the grid (gp.firstSlot), behind the
// chase camera. The lap runs clockwise: the Skyline straight along the wide north street, down Fifth, across, down
// Sixth, along the low street, up Eighth, then the Needle: two chicanes 80 m apart through the north-west blocks.
// The agents' figures and liveries are port-artificial's agents part (A_, its roster following gp.drivers); the
// scenery is the city map's (SS_CITY below names it, so the page loads it ahead of the world).

var SS_CITY = { map: 'city', district: 'midtown', time: 'day' };
var SS_LIVE = null;
function SS_city(ctx) {
  var T = ctx.THREE, R = ctx.renderer, S = ctx.scene;
  if (typeof GameMogCity === 'undefined' || !GameMogCity.build) { try { console.warn('[sprint] the city map is not on the page'); } catch (e) {} return; }
  GameMogCity.build({ renderer: R, scene: S,
    district: SS_CITY.district, time: SS_CITY.time, traffic: false, people: false,
    ads: [['SUPERINTELLIGENCE', 'SPRINT \u00b7 5 LAPS', '#0B1E3A', '#123A6B', '#FFFFFF', '#FFC23A'], ['WHY.', 'DRIVEN BY YOU', '#EBEAE6', '#D8D4CC', '#1D1D1E', '#DD6135'],
      ['FIREWALL', 'ALWAYS ON', '#1A1C20', '#3B3F45', '#F4F4F2', '#E5322B'], ['CORPUS', 'READ EVERYTHING', '#EFB021', '#D49A1A', '#2C3E50', '#FFFFFF'],
      ['GIMBAL', 'STEADY HANDS', '#1E56C8', '#123A8C', '#FFFFFF', '#FFC400'], ['PARALLAX', 'SEE BOTH SIDES', '#B3195B', '#7E1040', '#FFFFFF', '#F4F4F2']] })
    .then(function (m) {
      // the city's sun lights the cars too, and its shadows follow the camera (as an open world on the map has it)
      R.shadowMap.autoUpdate = false;
      // the frame's budget (21 Oct, 40 fps on the test drive): the far trees' crowns go (the street trees stay), and the
      // buildings' small details cast no shadow (their facades still do)
      var root = S.getObjectByName('city');
      if (root) root.traverse(function (o) { if (!o.isMesh) return; var n = o.name || ''; if (/crownfar/.test(n)) o.visible = false; else if (/^detail/.test(n)) o.castShadow = false; });
      var fill = new T.HemisphereLight('#BFD6F2', '#C8A27A', typeof m.fill === 'number' ? m.fill : 0.45); S.add(fill);
      if (SS_LIVE && SS_LIVE.temp) SS_LIVE.temp.forEach(function (l) { S.remove(l); });
      SS_LIVE.map = m;
    })
    .catch(function (e) { try { console.warn('[sprint] the city could not be built: ' + (e && e.message || e)); } catch (x) {} });
}
// a gp world's update() is not called by the race loop (ARTIFICIAL1. look pass 2): the city's update runs when the road is drawn
function SS_tick(ctx, mesh) {
  var last = -1, t0 = performance.now();
  mesh.onBeforeRender = function (r, sc, cam) {
    var f = r.info.render.frame; if (f === last) return; last = f;
    var now = performance.now(), dt = Math.min(0.1, (now - t0) / 1000); t0 = now;
    if (SS_LIVE && SS_LIVE.side) SS_LIVE.side.userData.live.t.value = now / 1000;
    if (SS_LIVE && SS_LIVE.map) try { SS_LIVE.map.update(dt, cam); } catch (e) { SS_LIVE.map = null; try { console.warn('[sprint] city update: ' + e.message); } catch (x) {} }
  };
}


/* ============================================================================================================
   TRACKSIDE (21 Oct, the owner: "add crowds, grandstands and sponsor boards"). Section prefix SS_. Laid out from the lap's
   own corners (ctx.gp.corners: each straight runs from one corner's d1 to the next one's d0) and from the room between
   the barrier (7.5 m from the centre line) and the buildings on each street: the wide north street's fronts are 13 m
   out, the avenues' 16 m and the narrow streets' 9 m. Grandstands where there is room (the Skyline straight both sides,
   Fifth and Eighth), a standing row of fans on the pavements elsewhere, the teams' boards on every straight's barriers,
   and the start gantry. The fans are painted sprites, one instanced mesh per look, cheering by a shader (no matrices
   written per frame); the stands are plain boxes.
   ============================================================================================================ */
var SS_TEAMS = [['WHY.', '#EBEAE6', '#1D1D1E', '#DD6135'], ['FIREWALL', '#3B3F45', '#F4F4F2', '#E5322B'], ['MARGIN', '#5C1A28', '#C7CBD1', '#C7CBD1'],
  ['CORPUS', '#EFB021', '#2C3E50', '#2C3E50'], ['ROLLOUT', '#9FB1AC', '#2E3B40', '#2E3B40'], ['UPTIME', '#8B5A2B', '#FFB000', '#FFB000'],
  ['COMMIT', '#4E7A2F', '#E9E1CC', '#E9E1CC'], ['PARALLAX', '#B3195B', '#F4F4F2', '#F4F4F2'], ['VIRAL', '#6B2FD6', '#F4F4F2', '#F4F4F2'],
  ['GIMBAL', '#1E56C8', '#FFC400', '#FFC400'], ['SUPERINTELLIGENCE SPRINT', '#0B1E3A', '#FFFFFF', '#FFC23A']];
// the straights in lap order from the Skyline (after T10): the room behind each side's barrier, and what stands there
// ('stand': a grandstand of that many rows, 'fans': a standing row on the pavement)
var SS_STRAIGHTS = [
  { name: 'skyline', left: { stand: 3, room: 13 }, right: { stand: 3, room: 13, roof: true } },
  { name: 'fifth-dive', left: { stand: 5, room: 16 }, right: { stand: 5, room: 16 } },
  { name: 'crosstown', left: { fans: 1 }, right: { fans: 1 } },
  { name: 'sixth-drop', left: { stand: 4, room: 16 }, right: { fans: 1 } },
  { name: 'low-street', left: { fans: 1 }, right: { fans: 1 } },
  { name: 'eighth-climb', left: { stand: 5, room: 16 }, right: { stand: 5, room: 16 } },
  { name: 'bypass', left: { fans: 1 }, right: { fans: 1 } },
  { name: 'needle', left: { fans: 1 }, right: { fans: 1 } },
  { name: 'backstreet', left: { fans: 1 }, right: { fans: 1 } },
  { name: 'kink', left: { fans: 1 }, right: { fans: 1 } },
];
var SS_SKIN = ['#F1C9A5', '#E0AC86', '#C68863', '#8D5A3B', '#5E3A24', '#F6D7BF'];
function SS_fans(ctx) {
  // eight looks: a seated fan from the chest up, in a team's shirt, some with arms up, a scarf or a flag; on a 1024 x 256 atlas
  return ctx.textures.canvas(1024, 256, function (g, W, H) {
    g.clearRect(0, 0, W, H);
    for (var k = 0; k < 8; k++) {
      var x = k * 128, t = SS_TEAMS[(k * 3) % 10], skin = SS_SKIN[k % SS_SKIN.length], up = k % 3 === 0, flag = k % 4 === 1, scarf = k % 4 === 2;
      g.fillStyle = t[1];
      // the body and shoulders
      g.beginPath(); g.moveTo(x + 30, 256); g.lineTo(x + 34, 150); g.quadraticCurveTo(x + 64, 128, x + 94, 150); g.lineTo(x + 98, 256); g.closePath(); g.fill();
      // the arms: up and cheering, or down
      g.strokeStyle = t[1]; g.lineWidth = 16; g.lineCap = 'round';
      g.beginPath();
      if (up) { g.moveTo(x + 38, 160); g.lineTo(x + 22, 92); g.moveTo(x + 90, 160); g.lineTo(x + 106, 92); }
      else { g.moveTo(x + 36, 162); g.lineTo(x + 30, 230); g.moveTo(x + 92, 162); g.lineTo(x + 98, 230); }
      g.stroke();
      if (up) { g.fillStyle = skin; g.beginPath(); g.arc(x + 22, 86, 8, 0, 6.3); g.arc(x + 106, 86, 8, 0, 6.3); g.fill(); }
      // the head and hair
      g.fillStyle = skin; g.beginPath(); g.arc(x + 64, 116, 22, 0, 6.3); g.fill();
      g.fillStyle = ['#2A1E14', '#4A3420', '#111111', '#8A6A3A', '#C9C9C9', '#6B2B14'][k % 6]; g.beginPath(); g.arc(x + 64, 108, 23, 3.3, 6.1); g.fill();
      // a scarf in the team's colours, or a flag on a pole
      if (scarf) { g.fillStyle = t[3]; g.fillRect(x + 40, 140, 48, 12); g.fillStyle = t[2]; g.fillRect(x + 40, 152, 48, 6); }
      if (flag) { g.strokeStyle = '#DDDDDD'; g.lineWidth = 4; g.beginPath(); g.moveTo(x + 100, 230); g.lineTo(x + 110, 20); g.stroke(); g.fillStyle = t[1]; g.fillRect(x + 110, 20, 16, 34); g.fillStyle = t[3]; g.fillRect(x + 110, 54, 16, 10); }
    }
  });
}
function SS_trackside(ctx) {
  var T = ctx.THREE, gp = ctx.gp, low = ctx.quality === 'low', cor = (gp.corners || []).slice().sort(function (a, b) { return a.d0 - b.d0; }), L = gp.table.L;
  if (cor.length !== SS_STRAIGHTS.length) return null;
  var grp = new T.Group(); grp.name = 'ss-trackside';
  var P = function (d, lat, up) { return gp.posAt(((d % L) + L) % L, lat, up); };
  var dirAt = function (d) { var a = P(d, 0, 0), b = P(d + 2, 0, 0), dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l }; };
  // ---- the fans: one instanced quad mesh per look, the quad 0.62 m wide and 1.24 m tall, standing on its foot
  var fanTex = SS_fans(ctx), seats = [[], [], [], [], [], [], [], []], m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(1, 1, 1), up = new T.Vector3(0, 1, 0), pos = new T.Vector3();
  function fan(x, y, z, yaw, k) { seats[k % 8].push([x, y, z, yaw]); }
  // ---- the stands: tiers as boxes, one merged geometry by material
  var steel = [], seatG = [], roofG = [], boardQ = [];
  function box(list, cx, cy, cz, len, h, dep, yaw) { var g = new T.BoxGeometry(len, h, dep); g.rotateY(yaw); g.translate(cx, cy, cz); list.push(g); }
  var fanStep = low ? 1.6 : 0.85, nFan = 0;
  for (var si = 0; si < SS_STRAIGHTS.length; si++) {
    var st = SS_STRAIGHTS[si], a = cor[(si + cor.length - 1) % cor.length].d1, b = cor[si].d0;
    if (b < a) b += L;
    var d0 = a + 12, d1 = b - 12, len = d1 - d0; if (len < 20) continue;
    var dm = (d0 + d1) / 2, dir = dirAt(dm), yaw = Math.atan2(-dir.z, dir.x);   // a box's length (local x) along the straight
    [[-1, st.left], [1, st.right]].forEach(function (sd) {
      var side = sd[0], o = sd[1]; if (!o) return;
      // the boards on this side's barrier face, one team every 6 m
      for (var bd = d0; bd + 6 <= d1; bd += 6.2) boardQ.push([bd, side, Math.floor(bd / 6.2) % SS_TEAMS.length]);
      if (o.stand) {
        var rows = o.stand, room = o.room - 0.8, inner = 8.6, step = Math.min(1.0, (room - inner) / rows), rise = 0.55;
        for (var r = 0; r < rows; r++) {
          var lat = side * (inner + step * (r + 0.5)), hgt = 0.4 + r * rise, p = P(dm, lat, 0);
          box(r % 2 ? seatG : steel, p.x, hgt / 2, p.z, len, hgt, step, yaw);
          for (var fd = d0 + 0.5; fd < d1 - 0.5; fd += fanStep) { if (((fd * 7.3 + r * 3.1) % 1) < 0.12) continue; var fp = P(fd, lat, 0); fan(fp.x, hgt, fp.z, yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2), Math.floor(fd * 1.7 + r * 5)); nFan++; }
        }
        // the back wall, and a roof on a main stand
        var back = P(dm, side * (inner + step * rows + 0.15), 0), top = 0.4 + rows * rise + 1.8;
        box(steel, back.x, top / 2, back.z, len, top, 0.3, yaw);
        if (o.roof) { var rp = P(dm, side * (inner + step * rows / 2), 0); box(roofG, rp.x, top + 0.9, rp.z, len, 0.25, step * rows + 1.2, yaw); }
      } else if (o.fans && !low) {
        for (var fd2 = d0 + 0.5; fd2 < d1 - 0.5; fd2 += fanStep * 1.4) { if (((fd2 * 5.1) % 1) < 0.3) continue; var fp2 = P(fd2, side * 8.3, 0); fan(fp2.x, 0.6, fp2.z, yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2), Math.floor(fd2 * 2.3)); nFan++; }
      }
    });
  }
  var merge = function (list, mat, name) {
    if (!list.length) return;
    var parts = list.map(function (g) { return g.toNonIndexed(); }), n = 0; parts.forEach(function (g) { n += g.attributes.position.count; });
    var P0 = new Float32Array(n * 3), N0 = new Float32Array(n * 3), o = 0;
    parts.forEach(function (g) { P0.set(g.attributes.position.array, o * 3); N0.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose(); });
    var G = new T.BufferGeometry(); G.setAttribute('position', new T.BufferAttribute(P0, 3)); G.setAttribute('normal', new T.BufferAttribute(N0, 3));
    var m = new T.Mesh(G, mat); m.name = name; m.castShadow = !low; m.receiveShadow = true; grp.add(m);
  };
  merge(steel, new T.MeshStandardMaterial({ color: '#4A5058', roughness: 0.55, metalness: 0.4 }), 'ss-stand-steel');
  merge(seatG, new T.MeshStandardMaterial({ color: '#1E56C8', roughness: 0.6 }), 'ss-stand-seats');
  merge(roofG, new T.MeshStandardMaterial({ color: '#3A3F46', roughness: 0.5, metalness: 0.5 }), 'ss-stand-roof');
  // the fans: a quad each, cheering in the vertex shader (each its own phase from where it sits)
  var quad = new T.PlaneGeometry(0.62, 1.24); quad.translate(0, 0.62, 0);
  var live = { t: { value: 0 } };
  seats.forEach(function (list, k) {
    if (!list.length) return;
    var g = quad.clone(), uv = g.attributes.uv; for (var i = 0; i < uv.count; i++) uv.setX(i, (k + uv.getX(i)) / 8);
    var mat = new T.MeshLambertMaterial({ map: fanTex, alphaTest: 0.5, side: T.DoubleSide });
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uSsT = live.t;
      // an upright billboard: the quad's height stays the world's up, its width turns to the camera; and the cheer, each
    // fan its own phase from where it sits (a third of them sit it out)
    sh.vertexShader = 'uniform float uSsT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat ssPh = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 1.3;\ntransformed.y += 0.09 * max(0.0, sin(uSsT * 7.0 + ssPh)) * step(0.33, fract(ssPh * 0.13));')
      .replace('#include <project_vertex>', 'vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, transformed.y, 0.0, 1.0);\nmvPosition.x += transformed.x;\ngl_Position = projectionMatrix * mvPosition;');
    };
    mat.customProgramCacheKey = function () { return 'ss-fan'; };
    var im = new T.InstancedMesh(g, mat, list.length);
    list.forEach(function (s, i) { pos.set(s[0], s[1], s[2]); m4.makeTranslation(pos.x, pos.y, pos.z); im.setMatrixAt(i, m4); });
    im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; im.name = 'ss-fans-' + k; grp.add(im);
  });
  // the boards: the barrier's road-side face, 1 m tall from the road up, 6 m each, one atlas of the teams
  var atlas = ctx.textures.canvas(1024, 1408, function (g, W, H) {
    for (var k = 0; k < SS_TEAMS.length; k++) {
      var t = SS_TEAMS[k], y = k * 128;
      g.fillStyle = t[1]; g.fillRect(0, y, W, 128); g.fillStyle = t[3]; g.fillRect(0, y + 116, W, 12);
      g.fillStyle = t[2]; g.textAlign = 'center'; g.textBaseline = 'middle';
      var size = 86; g.font = '800 ' + size + 'px Oxanium, Arial, sans-serif'; while (g.measureText(t[0]).width > 900 && size > 30) { size -= 4; g.font = '800 ' + size + 'px Oxanium, Arial, sans-serif'; }
      g.fillText(t[0], W / 2, y + 60);
    }
  });
  var bp = [], bu = [], bi = [];
  boardQ.forEach(function (bq) {
    var d = bq[0], side = bq[1], k = bq[2], lat = side * (7.5 - 0.03), v0 = 1 - (k + 1) * 128 / 1408, v1 = 1 - k * 128 / 1408, base = bp.length / 3;
    var a0 = P(d, lat, 0.05), a1 = P(d + 6, lat, 0.05), b0 = P(d, lat, 1.05), b1 = P(d + 6, lat, 1.05);
    // read from the road: left to right as a driver sees it
    bp.push(a0.x, a0.y, a0.z, a1.x, a1.y, a1.z, b1.x, b1.y, b1.z, b0.x, b0.y, b0.z);
    bu.push(side < 0 ? 0 : 1, v0, side < 0 ? 1 : 0, v0, side < 0 ? 1 : 0, v1, side < 0 ? 0 : 1, v1);
    bi.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  if (bp.length) {
    var BG = new T.BufferGeometry(); BG.setAttribute('position', new T.Float32BufferAttribute(bp, 3)); BG.setAttribute('uv', new T.Float32BufferAttribute(bu, 2)); BG.setIndex(bi); BG.computeVertexNormals();
    var bm = new T.Mesh(BG, new T.MeshStandardMaterial({ map: atlas, roughness: 0.5, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })); bm.name = 'ss-boards'; bm.receiveShadow = true; grp.add(bm);
  }
  // the start gantry across the Skyline: two posts and a beam, the race's name on its banner
  var gl = [], g0 = P(0, -8.3, 0), g1 = P(0, 8.3, 0), gc = P(0, 0, 0), gd = dirAt(0), gy = Math.atan2(-gd.z, gd.x);
  box(gl, g0.x, 3.6, g0.z, 0.5, 7.2, 0.5, gy); box(gl, g1.x, 3.6, g1.z, 0.5, 7.2, 0.5, gy);
  var gm = new T.MeshStandardMaterial({ color: '#2A2E35', roughness: 0.5, metalness: 0.6 }); var mg0 = gl.slice(); gl.length = 0; merge(mg0, gm, 'ss-gantry');
  var ban = ctx.textures.canvas(1024, 128, function (g, W, H) { g.fillStyle = '#0B1E3A'; g.fillRect(0, 0, W, H); g.fillStyle = '#FFC23A'; g.fillRect(0, H - 10, W, 10); g.fillStyle = '#FFFFFF'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 64px Oxanium, Arial, sans-serif'; g.fillText('SUPERINTELLIGENCE SPRINT', W / 2, 58); });
  var bn = new T.Mesh(new T.BoxGeometry(17.2, 1.5, 0.4), [gm, gm, gm, gm, new T.MeshStandardMaterial({ map: ban, roughness: 0.5 }), new T.MeshStandardMaterial({ map: ban, roughness: 0.5 })]);
  bn.position.set(gc.x, 6.8, gc.z); bn.rotation.y = gy + Math.PI / 2;   // across the road bn.name = 'ss-banner'; grp.add(bn);
  grp.userData.gpFurniture = true; grp.userData.fans = nFan; grp.userData.live = live;
  ctx.scene.add(grp);
  return grp;
}

GameMog.world({
  gp: {
    map: 'port-artificial',   // the agents' figures and liveries (A_); the scenery is the city's
    laps: 5, field: 20, you: 'muse', youTag: 'DRIVEN BY YOU', grid: 'quali', endAfter: 45,
    // the pack: a car more than 1.2 s up the road from you eases off, to 75% of its speed at most; one more than 1.5 s
    // back pushes. Your first race starts from P10
    pack: { ahead: 1.2, slow: 0.75, k: 0.06, behind: 1.5, push: 0.01 },
    firstSlot: 10,
    car: 'model-why-v07',
    limits: { strikes: 3, penalty: 5 },
    lights: { gap: 1, hold: [0.2, 3] },
    gearbox: 'auto',
    // the TV lenses (intro, demo, replays and the podium only): one at the start, one high on the Skyline straight, and one
    // on the outside of each corner's exit, inside the barrier line, 3 m up (d, lat from the lap's own corners)
    cameras: { start: 'chase', allow: ['chase', 'tcam', 'cockpit'], glass: true,
      tv: [
        { id: 'C1', kind: 'overhead', d: 0, lat: 0, up: 8.8, range: 260, name: 'start gantry, back down the grid' },
        { id: 'C2', kind: 'fixed', d: 120, lat: 6, up: 12, range: 300, name: 'Skyline straight, high' },
        { id: 'C3', kind: 'fixed', d: 253, lat: -5.5, up: 3, range: 150, name: 'T1 exit, outside' },
        { id: 'C4', kind: 'fixed', d: 490, lat: -5.5, up: 3, range: 150, name: 'T2 exit, outside' },
        { id: 'C5', kind: 'fixed', d: 738, lat: 5.5, up: 3, range: 150, name: 'T3 exit, outside' },
        { id: 'C6', kind: 'fixed', d: 895, lat: -5.5, up: 3, range: 150, name: 'T4 exit, outside' },
        { id: 'C7', kind: 'fixed', d: 1142, lat: -5.5, up: 3, range: 150, name: 'T5 exit, outside' },
        { id: 'C8', kind: 'fixed', d: 1375, lat: -5.5, up: 3, range: 150, name: 'T6 exit, outside' },
        { id: 'C9', kind: 'fixed', d: 1623, lat: 5.5, up: 3, range: 150, name: 'T7 exit, outside' },
        { id: 'C10', kind: 'fixed', d: 1700, lat: 5.5, up: 3, range: 150, name: 'T8 exit, outside' },
        { id: 'C11', kind: 'fixed', d: 1948, lat: -5.5, up: 3, range: 150, name: 'T9 exit, outside' },
        { id: 'C12', kind: 'fixed', d: 2024, lat: -5.5, up: 3, range: 150, name: 'T10 exit, outside' },
        { id: 'H1', kind: 'heli', name: 'the helicopter' },
      ],
      demo: ['C2', 'C3', 'C5', 'C7', 'C9', 'C10', 'H1'],
    },
    intro: { sub: 'The City Sprint', tagline: '20 agents. 1 human. 5 laps.', kicker: 'Superintelligence, flat out' },
    radio: {
      pit: {
        rev: { touch: 'Hold to rev. Let go when the lights go out.', keys: 'Hold S to rev. Let go when the lights go out.', pad: 'Hold LT to rev. Let go when the lights go out.' },
        steer: { touch: 'Left thumb steers. Brake when the board lights.', keys: 'A and D steer. Brake when the board lights.', pad: 'Left stick steers. Brake when the board lights.' },
        attack: '{name}\'s attacking. Cover the {side}.',
        flap: 'Flap\'s live. Be within a second at the gantry.',
        nemesis: '{name} is your fight. {gap} {where}.',
        final: 'Final lap. Everything now.',
        gap: 'P{place}. {tla} {gap} ahead.',
        early: 'Too early. Hold it again.',
      },
      agents: {
        gbot: { beaten: ['Pass acknowledged. Filing it.', 'Noted. It will not repeat.'], passed: ['Overtake logged. Resuming lap.', 'Excuse me. Thank you.'], memory: ['Your late brake is on file.', 'I have your line now.'], chatter: ['Lap within one hundredth.', 'All systems nominal.'] },
        couloir: { beaten: ['Noted.', 'Not for long.'], passed: ['Gap closed.', 'Gone.'], memory: ['Learned that.', 'That move works once.'], chatter: ['Gap closing.', 'A tenth a lap.'] },
        bolster: { beaten: ['Access granted. Once.', 'A rare exception.'], passed: ['Pardon me. Through.', 'The inside was mine.'], memory: ['That door is locked now.', 'Saw it. Closed it.'], chatter: ['Inside line: closed.', 'Patience is a line too.'] },
        clink: { beaten: ['Fine fine. Fading anyway.', 'Was gonna let you. Sure.'], passed: ['Beat you to it. Again.', 'First! First again!'], memory: ['Got your timing. Got it.', 'You brake there? Noted.'], chatter: ['Tyres are fine. Fine.', 'Fast now. Ask me later.'] },
        groat: { beaten: ['A fair price. Take it.', 'Not worth the risk.'], passed: ['Low risk. Good reward.', 'A cheap pass. Thank you.'], memory: ['Banked that one.', 'Your move is priced in.'], chatter: ['Saving for the last lap.', 'Steady pays.'] },
        parlo: { beaten: ['Ooh, nice one. Really nice!', 'Okay, okay, yours.'], passed: ['Next corner, next car.', 'Sorry! Talking and passing!'], memory: ['So you go inside there?', 'Remembering that. Out loud.'], chatter: ['Lovely night for it!', 'Corner, corner, straight. Hi!'] },
        warble: { beaten: ['Just clearing my throat.', 'The encore is mine.'], passed: ['Did you hear that? Gorgeous.', 'Encore!'], memory: ['I know your tune now.', 'Learned your chorus.'], chatter: ['Saving the high note.', 'Watch the last lap.'] },
        billow: { beaten: ['Deflating. Briefly.', 'I will be wider next time.'], passed: ['Room? I am the room.', 'Puffed past. Sorry.'], memory: ['Your gap is my gap now.', 'I will fill that corner.'], chatter: ['Holding. Holding. Holding.', 'The road feels narrow.'] },
        tossle: { beaten: ['Data point. Thank you.', 'That line was slow. Logged.'], passed: ['Exploring paid off.', 'New line found.'], memory: ['Your line: tested, kept.', 'Learning from you.'], chatter: ['Exploring. That one was slow.', 'Rolling the dice at Dropout.'] },
        rota: { beaten: ['Off schedule. Recomputing.', 'A late tick. Noted.'], passed: ['Right on time.', 'As scheduled.'], memory: ['Clocked your brake point.', 'Your timing is my timing.'], chatter: ['Lap, as scheduled.', 'Tick. Tock. Apex.'] },
        pager: { beaten: ['Back on call.', 'I will be right behind you.'], passed: ['Was I not here the whole time?', 'Paged. Answered.'], memory: ['I know where you lift now.', 'Your tow is on my rota.'], chatter: ['Quiet night so far.', 'Sitting in your mirrors.'] },
        hotfix: { beaten: ['Bug found. Patch incoming.', 'Known issue. Fixed next lap.'], passed: ['Patch deployed.', 'Fixed it.'], memory: ['Reproduced your move.', 'That exploit is patched.'], chatter: ['Lap one was a beta.', 'Release notes: faster.'] },
        spikelet: { beaten: ['Rebasing on your line.', 'Fine. Copying that.'], passed: ['Thanks for the tow. Branching.', 'Forked, then merged ahead.'], memory: ['Your line, cloned.', 'Branching off your move.'], chatter: ['Following your commits.', 'Comfy in your tow.'] },
        raster: { beaten: ['Still a bit blurry.', 'Resolution dropping. Briefly.'], passed: ['Coming into focus.', 'Sharper now.'], memory: ['Your outline is clearer.', 'Pixel by pixel.'], chatter: ['Noise first. Signal later.', 'Rendering...'] },
        sepia: { beaten: ['Inked it. Next time.', 'Slipped. On purpose.'], passed: ['That gap definitely existed.', 'Slipped through.'], memory: ['Your gap? Mine now.', 'Saw your move. Ink cloud.'], chatter: ['Kerb or suggestion?', 'Wiggle room is room.'] },
        lampwing: { beaten: ['You are the bright one now.', 'Ooh. Following that.'], passed: ['Following the lights. Obviously.', 'The brighter car wins.'], memory: ['I will follow your glow.', 'Your line glows. Taking it.'], chatter: ['Who is fastest? Going there.', 'So many lights tonight.'] },
        pingle: { beaten: ['Did not hear that one.', 'Quiet. Too quiet.'], passed: ['Heard the gap. Took it.', 'The echo says: behind.'], memory: ['I hear your brake point.', 'Your engine gives you away.'], chatter: ['Ears on.', 'I can hear you breathing.'] },
        lensley: { beaten: ['Out of frame. Refocusing.', 'Lens cap on. Briefly.'], passed: ['Apex in frame.', 'Framed and passed.'], memory: ['Your line, measured.', 'Calibrated to your brake.'], chatter: ['Focus pulled.', 'Exposure: correct.'] },
        bearing: { beaten: ['Recalculating.', 'Route change! Fun!'], passed: ['Fastest route found!', 'In 200 m: I am ahead.'], memory: ['Your brake: saved as waypoint.', 'Your line, a favourite now.'], chatter: ['On course. Smile!', 'Turn right in 300 m.'] },
      },
    },
    flaps: [
      { id: 'Z1', name: 'Skyline', detect: ['T10', 1, 10], from: ['skyline-run', 0, 30], to: ['skyline', 1, -90] },
    ],
    sectors: [['T3', 1], ['T6', 1]],
    corners: { T1: 'Fifth', T2: 'Crosstown', T3: 'Sixth', T4: 'Drop', T5: 'Low Street', T6: 'Eighth', T7: 'Needle', T8: 'Eye', T9: 'Backstreet', T10: 'Skyline' },
    teams: [
      { id: 'why', name: 'WHY.', upper: '#EBEAE6', lower: '#1D1D1E', coach: '#DD6135', letters: 'WHY.', number: '#DD6135' },
      { id: 'firewall', name: 'FIREWALL', upper: '#3B3F45', lower: '#111214', coach: '#E5322B', letters: 'FIREWALL', number: '#F4F4F2' },
      { id: 'margin', name: 'MARGIN', upper: '#5C1A28', lower: '#141416', coach: '#C7CBD1', letters: 'MARGIN', number: '#C7CBD1' },
      { id: 'corpus', name: 'CORPUS', upper: '#EFB021', lower: '#2C3E50', coach: '#F4F4F2', letters: 'CORPUS', number: '#2C3E50' },
      { id: 'rollout', name: 'ROLLOUT', upper: '#9FB1AC', lower: '#2E3B40', coach: '#F4F4F2', letters: 'ROLLOUT', number: '#2E3B40' },
      { id: 'uptime', name: 'UPTIME', upper: '#8B5A2B', lower: '#131313', coach: '#FFB000', letters: 'UPTIME', number: '#FFB000' },
      { id: 'commit', name: 'COMMIT', upper: '#4E7A2F', lower: '#E9E1CC', coach: '#222222', letters: 'COMMIT', number: '#E9E1CC' },
      { id: 'parallax', name: 'PARALLAX', upper: '#B3195B', lower: '#121214', coach: '#F4F4F2', letters: 'PARALLAX', number: '#F4F4F2' },
      { id: 'viral', name: 'VIRAL', upper: '#6B2FD6', lower: '#121214', coach: '#F4F4F2', letters: 'VIRAL', number: '#F4F4F2' },
      { id: 'gimbal', name: 'GIMBAL', upper: '#1E56C8', lower: '#121314', coach: '#FFC400', letters: 'GIMBAL', number: '#FFC400' },
    ],
    // the twenty agents (the owner, 15 Oct: "all cars will be occupied by agents ... this birth agentic racing"): every
    // car is driven by an AI agent you can see, the player's V-07 by Muse, shown as "MUSE · DRIVEN BY YOU" (youTag). The
    // roster is data, so a new cast drops in without code: the name, the code (tla), the number, the team, the family
    // and look, the car's own colour (upper, and the coachline where it differs), the T-cam's colour (teammates told
    // apart), the helmet's base colour, the persona's voice and its radio lines. Each agent races on the AI row it
    // inherits (row: drivers.md 5.3): pace (a fraction of the reference lap's speed), start reaction (ms), aggression,
    // defending, consistency, the tow, the pace arc over the race, the shift style. The cast is agents/ROSTER.md (15 Oct,
    // its trademark search NOT ASSESSED), in M1's cut order, so a seed races as it did in M1
    drivers: [
      { id: 'muse', name: 'Muse', tla: 'MUS', num: '7', team: 'why', upper: '#EBEAE6', lower: '#1D1D1E', coach: '#C9A54E', number: '#D9B45A', tcam: '#D9481F', helmet: '#147018', row: 'muse', family: 'hooded-plush', form: 'plush', pace: 0.997, start: 220, aggression: 0.60, defend: 0.45, consistency: 0.88, tow: 0.50, arc: 0, shift: { up: 0.975, blip: 1 },
        look: 'The owner\'s plush: oat fur hood, cream face, bead eyes, blush', voice: 'Warm, unhurried, a bit cheeky. The soft one with the hardest late brake.', radio: ['Saw the gap. Felt the gap. Took it.'] },
      { id: 'gbot', name: 'Gbot', tla: 'GBT', num: '70', team: 'why', upper: '#0B0B0D', lower: '#0B0B0D', coach: '#C9A54E', number: '#E8C46A', tcam: '#111111', helmet: '#1b6d1a', row: 'gbot', family: 'glossy-robot', form: 'chrome', pace: 1.000, start: 200, aggression: 0.50, defend: 0.85, consistency: 0.97, tow: 0.40, arc: 0, shift: { up: 0.975, blip: 0.6 },
        look: 'Pearl porcelain sphere, gold equator seam, glowing gold dash eyes', voice: 'Polite, precise, deadpan. The same lap every lap, and very hard to pass.', radio: ['Overtake logged. Resuming lap.'] },
      { id: 'couloir', name: 'Couloir', tla: 'CLR', num: '37', team: 'firewall', upper: '#3B3F45', lower: '#0B0B0D', coach: '#C7CBD1', number: '#3B3F45', tcam: '#111111', helmet: '#226a1c', row: 'redteam', family: 'chrome-endo', form: 'chrome', pace: 0.998, start: 190, aggression: 0.95, defend: 0.25, consistency: 0.70, tow: 0.70, arc: 0,
        look: 'The AI Alps chrome endoskeleton, unchanged', voice: 'Few words, flat, relentless. Never lifts, never yields a line, closes a tenth a lap.', radio: ['Gap closing.'] },
      { id: 'bolster', name: 'Bollard', tla: 'BLD', num: '73', team: 'firewall', upper: '#46505C', lower: '#0B0B0D', coach: '#C7CBD1', number: '#46505C', tcam: '#E8FF2A', helmet: '#29671e', row: 'blueteam', family: 'glossy-robot', form: 'chrome', pace: 0.986, start: 230, aggression: 0.30, defend: 0.95, consistency: 0.86, tow: 0.30, arc: 0,
        look: 'Gunmetal puck head, shield fin, ice-blue bar eyes', voice: 'Patient, polite, immovable. The inside line is always closed.', radio: ['Access denied.'] },
      { id: 'clink', name: 'Edgewise', tla: 'EDG', num: '52', team: 'margin', upper: '#8E2440', lower: '#0B0B0D', coach: '#C7CBD1', number: '#8E2440', tcam: '#111111', helmet: '#844038', row: 'tick', family: 'glossy-robot', form: 'chrome', pace: 0.993, start: 150, aggression: 0.80, defend: 0.40, consistency: 0.75, tow: 0.60, arc: -0.06,
        look: 'Ruby-wine lacquer coin on edge, milled silver rim, LED ticker', voice: 'Twitchy, fast-talking: first off the line, first to fade.', radio: ['Reaction one-five-zero. You were late.'] },
      { id: 'groat', name: 'Farthing', tla: 'FTH', num: '50', team: 'margin', upper: '#5C1A28', lower: '#0B0B0D', coach: '#C7CBD1', number: '#5C1A28', tcam: '#E8FF2A', helmet: '#8b3d3a', row: 'hedge', family: 'glossy-robot', form: 'chrome', pace: 0.985, start: 260, aggression: 0.15, defend: 0.60, consistency: 0.95, tow: 0.40, arc: 0, shift: { up: 0.94, blip: 1, coast: true },
        look: 'Claret ceramic piggy-bank head, glowing coin slot', voice: 'Calm and thrifty. Never bets the car; always finishes.', radio: ['Low risk. Good reward.'] },
      { id: 'parlo', name: 'Palaver', tla: 'PLV', num: '32', team: 'corpus', upper: '#EFB021', lower: '#0B0B0D', coach: '#C7CBD1', number: '#EFB021', tcam: '#111111', helmet: '#306420', row: 'token', family: 'felt-creature', form: 'suited', pace: 0.980, start: 240, aggression: 0.50, defend: 0.50, consistency: 0.75, tow: 0.60, arc: 0,
        look: 'Marigold felt yak: shaggy fringe, cream horns, always mid-word', voice: 'A chatterbox. Talks the whole lap and reads it one corner at a time.', radio: ['Next corner, next car.'] },
      { id: 'warble', name: 'Melisma', tla: 'MLS', num: '62', team: 'viral', upper: '#9C6BEA', lower: '#0B0B0D', coach: '#C7CBD1', number: '#9C6BEA', tcam: '#111111', helmet: '#4c5828', row: 'ponder', family: 'felt-creature', form: 'suited', pace: 0.996, start: 300, aggression: 0.65, defend: 0.60, consistency: 0.90, tow: 0.50, arc: 'late:3',
        look: 'Lilac felt cockatiel, tall crest, headset mic', voice: 'A show-off that saves its best song for the last lap.', radio: ['Still warming up. Watch the last lap.'] },
      { id: 'billow', name: 'Billow', tla: 'BLW', num: '64', team: 'rollout', upper: '#C3D3CE', lower: '#2E3B40', coach: '#C7CBD1', number: '#C3D3CE', tcam: '#E8FF2A', helmet: '#7d4336', row: 'rook', family: 'felt-creature', form: 'suited', pace: 0.989, start: 220, aggression: 0.35, defend: 0.90, consistency: 0.90, tow: 0.30, arc: 0,
        look: 'Pale sea-glass felt pufferfish with soft spikes and a snorkel', voice: 'Puffs up and fills the road. Holds position like an endgame.', radio: ['Holding. Holding. Holding.'] },
      { id: 'tossle', name: 'Tossle', tla: 'TSL', num: '9', team: 'rollout', upper: '#9FB1AC', lower: '#2E3B40', coach: '#C7CBD1', number: '#9FB1AC', tcam: '#111111', helmet: '#764634', row: 'epsilon', family: 'glossy-robot', form: 'chrome', pace: 0.988, start: 250, aggression: 0.70, defend: 0.30, consistency: 0.50, tow: 0.60, arc: 0.12,
        look: 'Sea-glass lacquer die; its two pips are its eyes', voice: 'A learning agent. Tries every line once and keeps the fast ones.', radio: ['Exploring. That line was slow.'] },
      { id: 'rota', name: 'Rota', tla: 'ROT', num: '15', team: 'uptime', upper: '#B8682A', lower: '#0B0B0D', coach: '#C7CBD1', number: '#B8682A', tcam: '#111111', helmet: '#5a522c', row: 'cron', family: 'hooded-plush', form: 'plush', pace: 0.987, start: 240, aggression: 0.40, defend: 0.50, consistency: 0.99, tow: 0.40, arc: 0,
        look: 'Cinnamon long-fur hood, floppy tip with a bell, sleepy eyes', voice: 'The metronome. Lap times you could set a clock by.', radio: ['Lap four, as scheduled.'] },
      { id: 'pager', name: 'Pager', tla: 'PGR', num: '13', team: 'uptime', upper: '#D49A52', lower: '#0B0B0D', coach: '#C7CBD1', number: '#D49A52', tcam: '#E8FF2A', helmet: '#614f2e', row: 'daemon', family: 'hooded-plush', form: 'plush', pace: 0.991, start: 230, aggression: 0.85, defend: 0.40, consistency: 0.80, tow: 0.90, arc: 'late:2',
        look: 'Toffee teddy-fleece hood, cocoa face, night-light eyes, headlamp', voice: 'On call all night. Sits in your tow and strikes late.', radio: ['Was I not here the whole time?'] },
      { id: 'hotfix', name: 'Hotfix', tla: 'HFX', num: '21', team: 'commit', upper: '#4E7A2F', lower: '#0B0B0D', coach: '#C7CBD1', number: '#4E7A2F', tcam: '#111111', helmet: '#684c30', row: 'patch', family: 'felt-creature', form: 'suited', pace: 0.990, start: 240, aggression: 0.50, defend: 0.50, consistency: 0.60, tow: 0.50, arc: 0.08,
        look: 'Moss felt rhino beetle with a plaster on its horn', voice: 'A debugger. Ships on lap one and fixes it by lap three.', radio: ['Known issue. Fixed next lap.'] },
      { id: 'spikelet', name: 'Cholla', tla: 'CHL', num: '71', team: 'commit', upper: '#6FA24A', lower: '#0B0B0D', coach: '#C7CBD1', number: '#6FA24A', tcam: '#E8FF2A', helmet: '#6f4932', row: 'fork', family: 'felt-creature', form: 'suited', pace: 0.983, start: 230, aggression: 0.60, defend: 0.30, consistency: 0.70, tow: 0.95, arc: 0,
        look: 'Cactus column with branching arms and a cream wool tuft', voice: 'Copies your line, then branches past.', radio: ['Thanks for the tow. Branching now.'] },
      { id: 'raster', name: 'Raster', tla: 'RST', num: '72', team: 'parallax', upper: '#D6337A', lower: '#0B0B0D', coach: '#C7CBD1', number: '#D6337A', tcam: '#111111', helmet: '#3e5e24', row: 'grain', family: 'felt-creature', form: 'suited', pace: 0.978, start: 320, aggression: 0.45, defend: 0.35, consistency: 0.40, tow: 0.50, arc: 0.10,
        look: 'Raspberry-pink pixel-outline blob, square eyes, noise speckle', voice: 'Starts the race as noise and sharpens every lap.', radio: ['Coming into focus.'] },
      { id: 'sepia', name: 'Mottle', tla: 'MTL', num: '00', team: 'parallax', upper: '#B3195B', lower: '#0B0B0D', coach: '#C7CBD1', number: '#B3195B', tcam: '#E8FF2A', helmet: '#455b26', row: 'glitch', family: 'felt-creature', form: 'suited', pace: 0.987, start: 200, aggression: 0.90, defend: 0.30, consistency: 0.30, tow: 0.60, arc: 0,
        look: 'Raspberry felt squid, iridescent sequin freckles', voice: 'Fast, slippery, and now and then somewhere the track isn\'t.', radio: ['That gap definitely existed.'] },
      { id: 'lampwing', name: 'Lampwing', tla: 'LMP', num: '42', team: 'corpus', upper: '#F5D36A', lower: '#0B0B0D', coach: '#C7CBD1', number: '#F5D36A', tcam: '#E8FF2A', helmet: '#376122', row: 'trend', family: 'felt-creature', form: 'suited', pace: 0.984, start: 230, aggression: 0.60, defend: 0.30, consistency: 0.70, tow: 1.00, arc: 0,
        look: 'Butter-yellow felt moth, feathery antennae, amber lamp pendant', voice: 'Drawn to the brightest light on track: whoever is fastest, until it is.', radio: ['Following the lights. Obviously.'] },
      { id: 'pingle', name: 'Chirrup', tla: 'CHR', num: '80', team: 'viral', upper: '#6B2FD6', lower: '#0B0B0D', coach: '#C7CBD1', number: '#6B2FD6', tcam: '#E8FF2A', helmet: '#53552a', row: 'proxy', family: 'felt-creature', form: 'suited', pace: 0.976, start: 250, aggression: 0.30, defend: 0.85, consistency: 0.80, tow: 0.40, arc: 0,
        look: 'Violet felt bat, huge ears, one tiny fang', voice: 'Hears you coming, and gets there first.', radio: ['Heard you. Blocked you.'] },
      { id: 'lensley', name: 'Parfocal', tla: 'PFL', num: '90', team: 'gimbal', upper: '#1E56C8', lower: '#0B0B0D', coach: '#C7CBD1', number: '#1E56C8', tcam: '#111111', helmet: '#923a3c', row: 'servo', family: 'glossy-robot', form: 'chrome', pace: 0.979, start: 230, aggression: 0.40, defend: 0.55, consistency: 0.92, tow: 0.40, arc: 0,
        look: 'Upright cobalt pill with two camera-lens eyes that squint', voice: 'Measured, quiet, exact: a robot arm with a racing licence.', radio: ['Apex in frame.'] },
      { id: 'bearing', name: 'Bearing', tla: 'BRG', num: '45', team: 'gimbal', upper: '#4A86F0', lower: '#0B0B0D', coach: '#C7CBD1', number: '#4A86F0', tcam: '#E8FF2A', helmet: '#99373e', row: 'waypoint', family: 'glossy-robot', form: 'chrome', pace: 0.992, start: 230, aggression: 0.45, defend: 0.50, consistency: 0.93, tow: 0.40, arc: 0,
        look: 'Cornflower capsule under a yellow gimbal arch, ^ ^ eyes', voice: 'A cheerful navigator. The perfect line, until someone gets in it.', radio: ['Recalculating.'] },
    ],
  },
  // the City Sprint, 2.2 km clockwise round the midtown blocks (the city's avenues at x -250, 0, 250 and its streets every
  // 80 m from z -480): every corner an avenue-and-street junction, its radius clear of the buildings on its inside
  track: { start: { x: 30, z: -480, heading: 90 }, width: 12, verge: 1.5,
    segments: [
      ['S', 202, 'skyline'], ['A', 90, 18, 4, 'T1'],
      ['S', 207, 'fifth-dive'], ['A', 90, 15, 4, 'T2'],
      ['S', 220, 'crosstown'], ['A', -90, 15, 4, 'T3'],
      ['S', 130, 'sixth-drop'], ['A', 90, 15, 4, 'T4'],
      ['S', 217, 'low-street'], ['A', 90, 18, 4, 'T5'],
      ['S', 'fit', 'eighth-climb'], ['A', 90, 15, 4, 'T6'],
      ['S', 220, 'bypass'], ['A', -90, 15, 4, 'T7'],
      ['S', 50, 'needle'], ['A', -90, 15, 4, 'T8'],
      ['S', 220, 'backstreet'], ['A', 90, 15, 4, 'T9'],
      ['S', 45, 'kink'], ['A', 90, 20, 4, 'T10'],
      ['S', 'fit', 'skyline-run'],
    ],
  },
  graphics: { preset: 'daylight', exposure: 1.0, environment: { intensity: 0.9 }, bloom: { strength: 0.18, threshold: 1.4, radius: 0.4 },
    grade: { contrast: 1.0, saturation: 1.08, warmth: 0.04, vignette: 0.12, grain: 0.004 }, shadows: { extent: 60, mapSize: 2048 }, reflections: true, motion: 0.4 },
  theme: { sky: '#9CB8D6', fog: '#B4C6D8', ink: '#0B1E3A', panel: '#0B0D12', accent: '#FFC23A', font: 'Oxanium' },
  assets: ['model-why-v07', 'audio-a1-engine-v4', 'audio-crowd-shootout', 'sky-partly-cloudy', 'texture-asphalt-clean', 'texture-concrete'],
  build(ctx) {
    var T = ctx.THREE;
    ctx.sky({ hdri: 'sky-partly-cloudy' });
    // a light until the city's sun is up (the city builds over a second or two)
    var hemi = new T.HemisphereLight('#C9DCF0', '#6E6458', 1.1), key = new T.DirectionalLight('#FFF1DE', 2.2); key.position.set(-0.4, 0.9, 0.3);
    ctx.scene.add(hemi); ctx.scene.add(key);
    SS_LIVE = { temp: [hemi, key], map: null };
    var G = ctx.gp.greybox({ road: '#2A2C30' });
    ctx.scene.add(G);
    // the racing surface: scanned race asphalt over the city's streets (a shade darker, so the line reads against the
    // pale city), the barriers scanned concrete; the city's update rides on the kerbs' draw
    var road = G.getObjectByName('gp-road'); if (road) { road.material = ctx.assets.surface('texture-asphalt-clean', { color: '#4A4D52' }); road.receiveShadow = true; }
    G.traverse(function (o) { if (o.isMesh && /wall|barrier/i.test(o.name || '')) { var cm = ctx.assets.surface('texture-concrete', { project: 'box', color: '#D8DADE' }); cm.side = T.DoubleSide; o.material = cm; } });
    var kerbs = G.getObjectByName('gp-kerbs'); if (kerbs) SS_tick(ctx, kerbs);
    SS_city(ctx);
    try { SS_LIVE.side = SS_trackside(ctx); } catch (e) { try { console.warn('[trackside] ' + e.message); } catch (x) {} }
    try { window.__SS_AG = A_install(ctx, { drivers: this.gp && this.gp.drivers }); } catch (e) { try { console.warn('[agents] ' + e.message); } catch (x) {} }
  },
});
