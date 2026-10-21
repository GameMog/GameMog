// ARTIFICIAL1. A Grand Prix at night in Port Artificial (a first-party world, published 18 Oct 2026 by migration 2026-10-18-artificial1).
//
// The lap is the 5,361.9 m Port Artificial street circuit, 17 turns, written as segments and never rescaled: the
// runtime builds it into a table every half metre (lib/runtime/gp-track.js) and races twenty cars on it, 3 laps, the
// five red lights, the Flap on three straights, track limits and places (lib/runtime/gp*.js). Every car is driven by an
// AI agent: yours is the WHY. V-07 (model-why-v07, given away by its owner under CC0; the WHY. wordmark stays the owner's
// mark), with Muse at the wheel for you ("MUSE · DRIVEN BY YOU"); the nineteen others are agents in ten invented teams,
// on the same car in their own colours. The world writes no player(), rival() or music (the cars and the sound are the
// runtime's).
//
// The look is the runtime map port-artificial (lib/runtime/maps/port-artificial.js), which gp.map below asks for: the scenery
// (S_: road, kerbs, barriers, city, harbour, stands, crowd, the pit building, the Black Box, the Spire, the baked night light)
// and the agents (A_: the twenty agents in their cars, the glass cockpit, the liveries). Call its names as below; they are
// declared by the map, ahead of this module.

/* ============================================================================================================
   LOOK v2 (21 Oct 2026, the owner: "more futuristic, higher contrast and feel like the future of agentic racing").
   Section prefix L_. A higher-contrast night grade over the scenery's, and neon lines along the circuit: a line at
   the foot and one along the top of every barrier, in the circuit's two neon colours, glowing at 1.3 (large or long
   glowing parts glow at 1 to 1.5: lib/runtime/API.md), one draw call a line.
   ============================================================================================================ */
var L_NEON = { left: '#19E0FF', right: '#FF2E9A', glow: 1.3 };
var L_GRAPHICS = Object.assign({}, S_GRAPHICS, {
  exposure: 1.0,
  bloom: { strength: 0.42, threshold: 1.35, radius: 0.55 },
  grade: { contrast: 1.18, saturation: 1.3, warmth: -0.05, vignette: 0.36, grain: 0.008, split: 0.16 },
});
function L_strip(ctx, G, side, up, w, color) {
  var T = ctx.THREE, tab = G.table, L = tab.L, step = ctx.quality === 'low' ? 4 : 2, n = Math.ceil(L / step), pos = [], idx = [], wl = {};
  for (var i = 0; i <= n; i++) {
    var d = (i * step) % L, W = tab.wallsAt(d, wl), lat = side * ((side < 0 ? W.left : W.right) - 0.12);
    var a = tab.posAt(d, lat - side * w / 2, up, {}), b = tab.posAt(d, lat + side * w / 2, up, {});
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    if (i) { var k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  var m = new T.Mesh(g, new T.MeshStandardMaterial({ color: '#05060A', emissive: color, emissiveIntensity: L_NEON.glow, roughness: 0.5, side: T.DoubleSide }));
  m.frustumCulled = false; m.userData.gpFurniture = true; m.name = 'a1-neon';
  return m;
}
/* LOOK v2, pass 2 (21 Oct): the futuristic city. Neon on the towers (corner lines and a crown band on the tall box towers,
   in the circuit's neon, one instanced draw call), holographic billboards of the agents round the lap (their tag, number,
   name and team, flickering like a projection, one draw call), and searchlights sweeping over the main straight (one draw
   call). The phone tier keeps a third of the tower neon and half the billboards. */
var L_PAL = ['#19E0FF', '#FF2E9A', '#19E0FF', '#B44DFF', '#FF2E9A', '#FFB020', '#22FF9A'];
function L_hash(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function L_towers(ctx) {
  var T = ctx.THREE, low = ctx.quality === 'low', src = [], m4 = new T.Matrix4(), b = new T.Box3(), v = new T.Vector3();
  ctx.scene.traverse(function (o) { if (o.isInstancedMesh && /^city-box[123]$/.test(o.name || '')) src.push(o); });
  var lines = [];
  src.forEach(function (o, oi) {
    o.updateWorldMatrix(true, false); if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    for (var i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m4); b.copy(o.geometry.boundingBox).applyMatrix4(m4).applyMatrix4(o.matrixWorld); b.getSize(v);
      if (v.y < 60 || v.x > 90 || v.z > 90) continue;
      var h = L_hash(oi * 1000 + i); if (low && h > 0.33) continue; if (h > 0.8) continue;
      var c = new T.Color(L_PAL[Math.floor(L_hash(i * 7 + oi) * L_PAL.length)]), y0 = b.min.y, y1 = b.max.y, H = y1 - y0;
      // two vertical corner lines from a quarter up to the roof, and a crown band just under it
      lines.push([b.min.x, y0 + H * 0.25 + H * 0.375, b.min.z, 0.45, H * 0.75, 0.45, c]);
      lines.push([b.max.x, y0 + H * 0.25 + H * 0.375, b.max.z, 0.45, H * 0.75, 0.45, c]);
      var cy = y1 - Math.min(6, H * 0.06), w = v.x + 0.6, d = v.z + 0.6, cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
      lines.push([cx, cy, b.min.z - 0.3, w, 0.7, 0.4, c], [cx, cy, b.max.z + 0.3, w, 0.7, 0.4, c], [b.min.x - 0.3, cy, cz, 0.4, 0.7, d, c], [b.max.x + 0.3, cy, cz, 0.4, 0.7, d, c]);
    }
  });
  if (!lines.length) return null;
  var im = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ color: '#FFFFFF' }), lines.length), o3 = new T.Object3D();
  lines.forEach(function (l, i) { o3.position.set(l[0], l[1], l[2]); o3.scale.set(l[3], l[4], l[5]); o3.updateMatrix(); im.setMatrixAt(i, o3.matrix); im.setColorAt(i, l[6]); });
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.frustumCulled = false; im.userData.gpFurniture = true; im.name = 'a1-tower-neon';
  return im;
}
function L_billboards(ctx, G) {
  var T = ctx.THREE, tab = G.table, L = tab.L, low = ctx.quality === 'low', ds = (A_ROSTER.drivers || []).slice(0, 8);
  if (!ds.length) return null;
  var tex = ctx.textures.canvas(2048, 1024, function (g, W, H) {
    g.clearRect(0, 0, W, H);
    ds.forEach(function (d, k) {
      var x = (k % 4) * 512, y = Math.floor(k / 4) * 512, col = d.upper && d.upper.toUpperCase() !== '#EBEAE6' ? d.upper : '#19E0FF';
      var gr = g.createLinearGradient(x, y, x, y + 512); gr.addColorStop(0, 'rgba(255,255,255,0.02)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.10)'); gr.addColorStop(1, 'rgba(255,255,255,0.03)');
      g.fillStyle = gr; g.fillRect(x + 16, y + 16, 480, 480); g.globalAlpha = 0.16; g.fillStyle = col; g.fillRect(x + 16, y + 16, 480, 480); g.globalAlpha = 1;
      g.strokeStyle = col; g.lineWidth = 10; g.strokeRect(x + 22, y + 22, 468, 468);
      for (var sl = 0; sl < 480; sl += 6) { g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(x + 16, y + 16 + sl, 480, 2); }
      g.textAlign = 'center'; g.fillStyle = col;
      var fit = function (txt, size, maxW) { g.font = '800 ' + size + 'px Oxanium, Arial, sans-serif'; while (g.measureText(txt).width > maxW && size > 20) { size -= 4; g.font = '800 ' + size + 'px Oxanium, Arial, sans-serif'; } };
      fit(d.tla || '', 190, 420); g.fillText(d.tla || '', x + 256, y + 250);
      g.fillStyle = '#FFFFFF'; fit('#' + (d.num || ''), 64, 420); g.fillText('#' + (d.num || ''), x + 256, y + 330);
      fit(String(d.name || '').toUpperCase(), 46, 420); g.fillText(String(d.name || '').toUpperCase(), x + 256, y + 390);
      g.fillStyle = col; fit('AGENT ONLINE · ' + String(d.team || '').toUpperCase(), 30, 430); g.fillText('AGENT ONLINE · ' + String(d.team || '').toUpperCase(), x + 256, y + 450);
    });
  });
  var n = low ? 6 : 12, pos = [], uv = [], idx = [], wl = {}, S = 18;
  for (var i = 0; i < n; i++) {
    var d0 = ((i + 0.37) / n) * L, side = i % 2 ? 1 : -1, W = tab.wallsAt(d0, wl), lat = side * ((side < 0 ? W.left : W.right) + 8);
    var c = tab.posAt(d0, lat, 13, {}), a = tab.posAt(d0 - S / 2, lat, 13, {}), e = tab.posAt(d0 + S / 2, lat, 13, {});
    var tx = (e.x - a.x) / S, tz = (e.z - a.z) / S, k = i % ds.length, u0 = (k % 4) / 4, v0 = 1 - (Math.floor(k / 4) + 1) / 2, base = pos.length / 3;
    // the panel faces the road: its left edge downstream on the left of the road, upstream on the right
    var sx = side < 0 ? tx : -tx, sz = side < 0 ? tz : -tz;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { pos.push(c.x + sx * q[0] * S / 2, c.y + q[1] * S / 2, c.z + sz * q[0] * S / 2); uv.push(u0 + (q[0] + 1) / 8, v0 + (q[1] + 1) / 4); });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  var m = new T.Mesh(geo, new T.MeshBasicMaterial({ map: tex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, color: new T.Color('#FFFFFF').multiplyScalar(1.7) }));
  m.frustumCulled = false; m.userData.gpFurniture = true; m.name = 'a1-holo-billboards';
  return m;
}
function L_beams(ctx, G) {
  var T = ctx.THREE, tab = G.table, n = ctx.quality === 'low' ? 4 : 8, wl = {};
  var cone = new T.CylinderGeometry(12, 1.6, 240, 16, 1, true); cone.translate(0, 120, 0);
  // the fade is baked into vertex colours (additive, so black is clear): bright at the lamp, gone by two-thirds up
  var cp = cone.attributes.position, cc = [];
  for (var q = 0; q < cp.count; q++) { var f = Math.max(0, 1 - cp.getY(q) / 170); f = f * f; cc.push(f, f, f); }
  cone.setAttribute('color', new T.Float32BufferAttribute(cc, 3));
  var im = new T.InstancedMesh(cone, new T.MeshBasicMaterial({ color: '#FFFFFF', vertexColors: true, transparent: true, opacity: 0.24, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }), n);
  var bases = [];
  for (var i = 0; i < n; i++) { var d0 = ((i + 0.15) / n) * tab.L, sd = i % 2 ? 1 : -1, W = tab.wallsAt(d0, wl), p = tab.posAt(d0, sd * ((sd < 0 ? W.left : W.right) + 48), 26, {}); bases.push([p.x, p.y, p.z, i]); im.setColorAt(i, new T.Color(L_PAL[i % L_PAL.length]).multiplyScalar(1.6)); }
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.frustumCulled = false; im.userData.gpFurniture = true; im.name = 'a1-searchlights'; im.userData.bases = bases;
  return im;
}
var L_LIVE = null;
function L_update(ctx, t) {
  if (!L_LIVE) return;
  var o3 = L_LIVE.o3;
  if (L_LIVE.beams) {
    var im = L_LIVE.beams;
    im.userData.bases.forEach(function (b, i) { o3.position.set(b[0], b[1], b[2]); o3.rotation.set(0.35 * Math.sin(t * 0.42 + i * 1.3), i * 0.8, 0.5 * Math.sin(t * 0.31 + i * 0.9)); o3.scale.set(1, 1, 1); o3.updateMatrix(); im.setMatrixAt(i, o3.matrix); });
    im.instanceMatrix.needsUpdate = true;
  }
  if (L_LIVE.boards) L_LIVE.boards.material.opacity = 0.78 + 0.1 * Math.sin(t * 9.1) * Math.sin(t * 2.3) + (Math.sin(t * 0.7) > 0.985 ? -0.4 : 0);
}
function L_build(ctx, G) {
  var grp = new ctx.THREE.Group(); grp.name = 'a1-look-v2'; grp.userData.gpFurniture = true;
  [[-1, L_NEON.left], [1, L_NEON.right]].forEach(function (s) {
    grp.add(L_strip(ctx, G, s[0], 0.12, 0.16, s[1]));   // at the barrier's foot
    grp.add(L_strip(ctx, G, s[0], 1.13, 0.08, s[1]));   // along its top
  });
  var tw = L_towers(ctx), bb = L_billboards(ctx, G), be = L_beams(ctx, G);
  [tw, bb, be].forEach(function (m) { if (m) grp.add(m); });
  L_LIVE = { o3: new ctx.THREE.Object3D(), beams: be, boards: bb };
  // a gp world's update() is not called by the race loop, so the sweep runs when the beams are drawn (once per frame)
  if (be) { var lastF = -1; be.onBeforeRender = function (r) { var f = r.info.render.frame; if (f === lastF) return; lastF = f; try { L_update(ctx, performance.now() / 1000); } catch (e) { be.onBeforeRender = function () {}; } }; }
  ctx.scene.add(grp);
  return grp;
}
GameMog.world({
  gp: {
    map: 'port-artificial',   // the place: Port Artificial's scenery and agents (S_ and A_), a runtime map
    laps: 3, field: 20, you: 'muse', youTag: 'DRIVEN BY YOU', grid: 'quali', endAfter: 60,
    trails: { length: 22, height: 0.42, apart: 0.72, glow: 0.9 },   // light trails behind every agent's car, in its own colour (21 Oct)
    car: 'model-why-v07',
    // the racing line, baked: minimum curvature over the lap at 1,500 sweeps (the design lap model's own count), in whole
    // centimetres (lib/runtime/gp-ai.js encode); the runtime computes it again (600 sweeps) if the lap ever changes
    line: 'gpl1.e86627830a9e4a53.1340.1500.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',
    limits: { strikes: 3, penalty: 5 },
    lights: { gap: 1, hold: [0.2, 3] },
    gearbox: 'auto',
    // the player drives from the chase camera (the default), the T-cam or the cockpit; TV cameras only in the intro, the
    // demo, replays and the podium (RULES 1f). The TV lenses round the lap (C1-C19 and the helicopter, H1) are lane B's,
    // placed from the circuit's features (scripts/.scratch/gp/m2/B/world-cameras.mjs): d along the lap, lat across it
    // (m), up (m over the road); look: the Spire the title sits on [x, y, z, height], the helicopter's run, the podium,
    // the Black Box. The tunnel's exposure (ev -1) waits for the look kit's lit tunnel. The kerb-height lenses (C4, C7, C8,
    // C12, C18) stand 1.4 m up and on the road side of the barrier (the greybox's walls are 1.1 m): lower, or behind it,
    // they saw the wall (the director also checks every lens's sightline past the walls, gp.cameras.wallTop, default 1.1)
    cameras: { start: 'cockpit', allow: ['chase', 'tcam', 'cockpit'], glass: true, tunnelEv: -0.5,
      tv: [
        { id: 'C1', kind: 'overhead', d: 0, lat: 0, up: 8.8, range: 300, name: 'start gantry, back down the grid' },
        { id: 'C2', kind: 'fixed', d: 60, lat: 8, up: 40, range: 460, name: 'main grandstand roof, high' },
        { id: 'C3', kind: 'fixed', d: 440, lat: 51.5, up: 24, range: 420, name: 'Origin, high' },
        { id: 'C4', kind: 'fixed', d: 653.3, lat: 8.3, up: 1.4, range: 150, name: 'Bootstrap exit, kerb' },
        { id: 'C5', kind: 'fixed', d: 1123.9, lat: -20.5, up: 4, range: 620, name: 'Spire Plaza, long lens down the climb', fov: [3, 30] },
        { id: 'C6', kind: 'fixed', d: 1161.5, lat: -77.5, up: 60, range: 700, name: 'Spire terrace, the skyline' },
        { id: 'C7', kind: 'fixed', d: 1161.5, lat: 9.3, up: 1.4, range: 150, name: 'Singularity apex, low' },
        { id: 'C8', kind: 'fixed', d: 1374.1, lat: -7.4, up: 1.4, range: 220, name: 'Hallucination, low behind the crest' },
        { id: 'C9', kind: 'overhead', d: 1781.3, lat: 0, up: 10.5, range: 300, name: 'Neural Arch footbridge' },
        { id: 'C10', kind: 'fixed', d: 2116.3, lat: 38.5, up: 18, range: 420, name: 'Dropout, high outside' },
        { id: 'C11', kind: 'fixed', d: 2563.1, lat: -7.7, up: 3, range: 200, name: 'inside the Black Box tunnel', tunnel: true },
        { id: 'C12', kind: 'fixed', d: 2868.3, lat: -7.4, up: 1.4, range: 260, name: 'Tidegate Bridge rail, back into the tunnel mouth' },
        { id: 'C13', kind: 'fixed', d: 3922.9, lat: 12, up: 6, range: 260, name: 'Breakwater speed trap, side-on' },
        { id: 'C14', kind: 'rail', d: 3593.5, lat: -11, up: 3, range: 240, name: 'Breakwater rail, a dolly on the sea wall', rail: [3434.1, 3752.9] },
        { id: 'C15', kind: 'fixed', d: 4080.9, lat: -23.5, up: 3, range: 640, name: 'Overfit, long lens head-on up the Breakwater', fov: [3, 30] },
        { id: 'C16', kind: 'fixed', d: 4409.3, lat: -83.5, up: 30, range: 520, name: 'Beacon lighthouse gallery' },
        { id: 'C17', kind: 'fixed', d: 4803.2, lat: -16.5, up: 9, range: 260, name: 'Old Port balcony' },
        { id: 'C18', kind: 'fixed', d: 5087.9, lat: 7.82, up: 1.4, range: 150, name: 'Full Stop apex, low' },
        { id: 'C19', kind: 'fixed', d: 0, lat: -10.2, up: 4.5, range: 260, name: 'pit wall gantry, the line' },
        { id: 'H1', kind: 'heli', name: 'the helicopter' },
      ],
      look: { spire: [733.4, 20, -701.3, 320], h1: { from: [200, 100, 650], to: [200, 75, 250] }, podium: { d: 0, lat: -17, up: 9 }, tunnel: [2380.5, 2755.3] },
      demo: ['C2', 'C6', 'C8', 'C11', 'C12', 'C14', 'C15', 'H1'],
    },
    // the Black Box, a 375 m tunnel (d along the lap, m): the race writes tunnel { in, out } there, and no radio is spoken in it
    tunnels: [[2380.5, 2755.3]],
    // the intro's words (EXPERIENCE X28, X07): the title is the world's, the line under it the race's (km, turns, laps)
    intro: { sub: 'Port Artificial Grand Prix', tagline: '20 agents. 1 human.', kicker: 'The birth of agentic racing' },
    // the radio (X25): the PIT engineer's lines (each device's words where they differ; {name}, {side}, {gap}, {where},
    // {place}, {tla} are filled from the race) and each agent's lines by moment: beaten (you passed it), passed (it
    // passed you), memory (it learned your move), chatter (once a lap, nearby). Data, so a new cast or a Mog rewrites it;
    // an agent with no entry speaks its own radio lines above
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
      { id: 'Z1', name: 'Breakwater', detect: ['T9', 1, 40], from: ['T11', 1], to: ['breakwater', 1, -140] },
      { id: 'Z2', name: 'The Prompt', detect: ['T16', 1, 20], from: ['the-prompt-2', 0, 60], to: ['the-prompt', 1, -120] },
      { id: 'Z3', name: 'Gradient', detect: ['T1', 0.5], from: ['T2', 1, 15], to: ['gradient-climb-2', 1, -135] },
    ],
    sectors: [['T7', 1], ['breakwater', 0.86]],
    corners: { T1: 'Origin', T2: 'Bootstrap', T3: 'Gradient', T4: 'Singularity', T5: 'Hallucination', T6: 'Synapse I', T7: 'Synapse II',
      T8: 'Synapse III', T9: 'Dropout', T10: 'Black Box', T11: 'Tidegate', T12: 'Overfit', T13: 'Overfit', T14: 'Beacon', T15: 'Kernel',
      T16: 'Cache', T17: 'Full Stop' },
    // ten invented teams (cut order): the livery's upper, lower and coachline colours, the flank lettering and the number
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
  // Port Artificial, 5,361.9 m: the amended segment lap (gp5k/track5k-amend.gp.js), verbatim
  track: {start: {x: 0,z: 0,heading: 90},width: 14,segments: [['S',480,'the-prompt'],['A',-90,23,14,'T1'],['S',75,'origin-exit'],['A',35,55,20,'T2'],['S',70,'gradient-climb'],['A',-20,420,40,'T3'],['S',215,'gradient-climb-2'],['A',165,17.5,12,'T4'],['S',100,'spire-plaza'],['A',-10,450,30,'T5'],['S',70,'over-the-crest'],['A',-45,105,30,'T6'],['S',35,'synapses'],['A',80,95,30,'T7'],['S',35,'synapses-2'],['A',-25,130,30,'T8'],['S','fit','spire-drop'],['A',-90,24,14,'T9'],['S',160,'black-box-approach'],['A',192,130,45,'T10'],['S',40,'tidegate-bridge'],['A',-12,600,40,'T11'],['S','fit','breakwater'],['A',90,15,7,'T12'],['S',10,'overfit'],['A',-90,15,7,'T13'],['S',160,'marina-run'],['A',110,80,40,'T14'],['S',200,'west-quay'],['A',90,19,12,'T15'],['S',130,'old-port'],['A',-110,20,12,'T16'],['S',140,'old-port-climb'],['A',90,25,14,'T17'],['S',250,'the-prompt-2']],elevation: {ramps: [[507.6,1118.3,20],[1347,2134.3,-19.2],[2218.8,2428.5,-2.3],[2697.7,2926.2,2.5],[4729.9,5044.6,3.5],[5090.6,5299.4,-4.5]],crests: [[1347,190,3.5],[2926.2,280,3.5]]},widths: [[5090.6,560.1,16,40],[1090.3,1212.7,16,40],[1292.7,2027.9,13,40],[2226.8,2975.9,13,40],[3168.5,4071.7,15,50],[4596.4,5074.6,12,40],[4041.7,4152.8,12,30]],bank: [[488,522.1,2,25],[613.1,650.7,-1.5,25],[1138.3,1184.7,-2,25],[1300.7,1393.3,-1.5,25],[1479.3,1575.7,2,25],[1626.7,1773.4,-2.5,25],[1824.4,1895.1,2,25],[2119.1,2154.8,-2,25],[2330.8,2795.4,-4,25],[4310.8,4488.4,-3,25],[4704.4,4730.2,-1,25],[4876.2,4910.6,1,25],[5066.6,5103.9,-2,25]],verge: 1.5,runoff: [[1108.8,1192.7,'L',8,15],[4007.9,4152.8,'L',10,15],[4341.5,4516.4,'L',5,15],[4666.4,4738.2,'L',3,15],[5037.6,5121.9,'L',5,15],[446.4,540.1,'R',14,15],[2027.9,2172.8,'R',12,15],[4848.7,4918.6,'R',3,15]]},
  // the look: the scenery part (S_, scenery.part.js) replaces the M1 greybox, lamps, road light bake, harbour and sky; the agents part
  // (A_, agents.part.js) puts the twenty agents in their cars, draws the glass cockpit and the liveries (it needs the scenery's
  // lit-material wrapper, so it installs second). endo: the Couloir skull's chrome comes from the runtime's endo.js kit (endoScript)
  graphics: L_GRAPHICS,
  theme: S_THEME,
  assets: ['model-why-v07', 'audio-a1-engine-v4', 'audio-crowd-shootout'].concat(S_ASSETS),
  build(ctx) {
    var SC = S_build(ctx, ctx.gp), AG = null;
    try { L_build(ctx, ctx.gp); } catch (e) { try { console.warn('[look v2] ' + e.message); } catch (x) {} }
    try { AG = A_install(ctx, { lit: SC && SC.lit, drivers: this.gp && this.gp.drivers }); window.__A_AG = AG; } catch (e) { try { console.warn('[agents] install failed: ' + e.message + ' ' + String(e.stack || '').split('\n').slice(0, 3).join(' | ')); window.__A_FAIL = String(e.stack || e); } catch (x) { /* */ } }
  },
  update(ctx, t, dt) { S_update(ctx, t, dt); try { L_update(ctx, t); } catch (e) { L_LIVE = null; } },
});
