// A video call's plan (wagmi/storyrun/vcall-plan.js: the pure part of vcall.js) and its offices' names.
//   node --test tests/vcall.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { planCall, layout, gridOf, camOf, faceOf, rtSize, FRAME, CROWN, OFFICE_LOOKS, CALL_EVENTS } from '../wagmi/storyrun/vcall-plan.js';

const CALL = () => ({
  type: 'vcall', title: 'Colter Family Call', people: [
    { who: 'Tessa Colter', office: 'kitchen' }, { who: 'player', office: 'study', muted: true },
    { who: 'Vance Mercer', office: 'exec', late: true, blur: true, sub: 'Mercer Holdings' }],
  lines: [
    { who: 'Tessa Colter', text: 'Dad, they hit Wade.' },
    { who: 'player', text: 'Stay with the herd.' },
    { who: 'Tessa Colter', text: "You're on mute.", how: 'deadpan' },
    { do: 'unmute', who: 'player' },
    { who: 'Jack Colter', text: 'Stay with the herd.', cut: 0.6 },
    { do: 'join', who: 'Vance Mercer' },
    { who: 'Vance Mercer', text: 'Twelve million, Jack.', overlap: true },
    { do: 'share', who: 'Vance Mercer', slide: { title: 'A Fair Offer', lines: ['Three hundred acres', '', 'x'.repeat(90)], big: '$12M' } },
    { do: 'wait', secs: 9 },
    { do: 'drop', who: 'Vance Mercer' },
    { who: 'Vance Mercer', text: 'Still here?' }],
});

test('a call plan: the hero as player and by name, mute carried to his lines, events in order', () => {
  const P = planCall(CALL(), { hero: 'Jack Colter' });
  assert.equal(P.error, undefined);
  assert.deepEqual(P.people.map((p) => p.who), ['Tessa Colter', 'Jack Colter', 'Vance Mercer']);
  assert.equal(P.people[1].isHero, true); assert.equal(P.people[2].late, true); assert.equal(P.people[2].blur, true);
  const lines = P.items.filter((i) => i.line).map((i) => i.line);
  // (his first line is said on mute: he starts muted; after the unmute it is heard)
  assert.equal(lines[1].who, 'Jack Colter'); assert.equal(lines[1].muted, true);
  assert.equal(lines[3].muted, undefined); assert.equal(lines[3].cut, 0.6);
  assert.equal(lines[2].how, 'deadpan'); assert.equal(lines[4].overlap, true);
  // (the line after the drop is not in the plan: nobody talks after they leave)
  assert.equal(lines.length, 5); assert.ok(P.warn.some((w) => /not in the call/.test(w)));
  const ev = P.items.filter((i) => i.ev).map((i) => i.ev);
  assert.deepEqual(ev.map((e) => e.do), ['unmute', 'join', 'share', 'wait', 'drop']);
  // (a slide's sizes; a wait clamped to 4 s)
  assert.equal(ev[2].slide.lines.length, 2); assert.equal(ev[2].slide.lines[1].length, 64); assert.equal(ev[2].slide.big, '$12M');
  assert.equal(ev[3].secs, 4);
});

test('a call plan refuses too few people and an empty call, and drops strangers', () => {
  assert.ok(planCall({ people: [{ who: 'A', office: 'exec' }], lines: [{ who: 'A', text: 'Hi.' }] }).error);
  assert.ok(planCall({ people: [{ who: 'A', office: 'exec' }, { who: 'B', office: 'den' }], lines: [{ do: 'mute', who: 'A' }] }).error);
  const P = planCall({ people: [{ who: 'A', office: 'exec' }, { who: 'B', office: 'den' }, { who: 'A', office: 'kitchen' }], lines: [{ who: 'C', text: 'Hi.' }, { who: 'B', text: 'Hello.' }, { do: 'teleport', who: 'A' }] });
  assert.equal(P.people.length, 2); assert.equal(P.people[1].office, 'exec');
  assert.equal(P.items.length, 1);
});

test('the layout: every tile inside the screen, none overlapping, 16:9, the speaker stage on top', () => {
  for (const [w, h] of [[1280, 720], [1920, 1080], [390, 844], [844, 390]]) for (let n = 2; n <= 6; n++) {
    const L = layout(n, w, h, { top: 54, bottom: 172 });
    assert.equal(L.tiles.length, n);
    for (const [x, y, tw, th] of L.tiles) {
      assert.ok(x >= 0 && y >= 0 && x + tw <= w + 1 && y + th <= h + 1, `tile off screen ${w}x${h} n${n}`);
      assert.ok(Math.abs(tw / th - 16 / 9) < 0.05);
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = L.tiles[i], b = L.tiles[j];
      assert.ok(a[0] + a[2] <= b[0] + 1 || b[0] + b[2] <= a[0] + 1 || a[1] + a[3] <= b[1] + 1 || b[1] + b[3] <= a[1] + 1, `tiles ${i} and ${j} overlap`);
    }
  }
  assert.deepEqual([gridOf(4, 1200, 600).c, gridOf(2, 1200, 600).c, gridOf(3, 350, 700).c], [2, 2, 1]);
  const S = layout(4, 1280, 720, { mode: 'speaker', stage: 2 });
  assert.ok(S.tiles[2][2] > S.tiles[0][2] * 2 && S.tiles[2][1] < S.tiles[0][1]);
  const sh = layout(3, 1280, 720, { mode: 'speaker', stage: 'share' });
  assert.ok(sh.stage && sh.tiles.every((t) => t[1] > sh.stage[1] + sh.stage[3] - 1));
});

test('a webcam: in front of the eyes, a little under them, looking at them', () => {
  const c = camOf([0, 1.2, 0]);
  assert.ok(c.pos[2] > 0.6 && c.pos[2] < 1.1 && c.pos[1] < 1.2 && c.pos[1] > 1.05 && c.fov >= 36 && c.fov <= 50);
  assert.ok(camOf([0, 1.2, 0], 'wide').pos[2] > c.pos[2]);
});

// (the face in a tile as the lens sees it: crown and chin projected, as a share of the tile's height; the eyes' place from
// the top; the lens's tilt)
function framed(eyes, cam, face) {
  const [px, py, pz] = cam.pos, [lx, ly, lz] = cam.look;
  const f = [lx - px, ly - py, lz - pz], n = Math.hypot(...f); f.forEach((v, i) => (f[i] = v / n));
  // (the lens's up: the world's up less its share along the look)
  const u = [-f[0] * f[1], 1 - f[1] * f[1], -f[2] * f[1]], un = Math.hypot(...u); u.forEach((v, i) => (u[i] = v / un));
  const half = Math.tan((cam.fov * Math.PI) / 360);
  const yOf = (p) => { const d = [p[0] - px, p[1] - py, p[2] - pz], z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2], y = d[0] * u[0] + d[1] * u[1] + d[2] * u[2]; return y / z / half; };
  const crown = yOf([eyes[0], eyes[1] + CROWN * face, eyes[2]]), chin = yOf([eyes[0], eyes[1] - (1 - CROWN) * face, eyes[2]]), e = yOf(eyes);
  return { share: (crown - chin) / 2, eyesFromTop: (1 - e) / 2, tilt: (Math.asin(f[1]) * 180) / Math.PI };
}

test('every tile: head and shoulders at eye level, the face 30-40% of the tile, whatever the body', () => {
  for (const kind of ['close', 'low', 'wide']) for (const face of [0.19, 0.215, 0.235, 0.26, 0.29]) for (const eyes of [[0, 1.05, 0.02], [0.1, 1.24, -0.06], [0, 1.6, 0.1]]) {
    const F = framed(eyes, camOf(eyes, kind, { face }), face), at = `${kind} face ${face} eyes ${eyes}`;
    assert.ok(F.share >= 0.29 && F.share <= 0.41, `${at}: face ${F.share.toFixed(3)} of the tile`);
    assert.ok(F.eyesFromTop > 0.36 && F.eyesFromTop < 0.48, `${at}: eyes ${F.eyesFromTop.toFixed(3)} from the top`);
    // (eye level: never looking up a nose from the knees, nor down on the crown)
    assert.ok(Math.abs(F.tilt) <= 6, `${at}: tilt ${F.tilt.toFixed(1)} deg`);
    // (the crown inside the frame, with room over it)
    assert.ok(F.eyesFromTop - F.share * CROWN / 1 > 0.05, `${at}: crown cut`);
  }
  // (a bigger head is framed from further off, the same share)
  assert.ok(camOf([0, 1.2, 0], 'close', { face: 0.27 }).pos[2] > camOf([0, 1.2, 0], 'close', { face: 0.2 }).pos[2]);
  // (the kinds keep their order of closeness: close the biggest face, wide the smallest)
  assert.ok(FRAME.close.frac > FRAME.low.frac && FRAME.low.frac > FRAME.wide.frac);
  // (a body's face by its height: an average grown-up's 0.235 m, kept to 0.18-0.30, nonsense read as average)
  assert.ok(Math.abs(faceOf(1.75) - 0.2345) < 0.001);
  assert.equal(faceOf(0.2), faceOf(1.75)); assert.equal(faceOf(NaN), faceOf(1.75));
  assert.equal(faceOf(2.5), 0.3); assert.ok(faceOf(1.5) < faceOf(1.9));
});

test('a picture\'s render target: css size times the dpr, capped, never under 16 px', () => {
  assert.deepEqual(rtSize(320, 180, 1, 720), [320, 180]);
  assert.deepEqual(rtSize(320, 180, 2, 720), [640, 360]);
  // (a 3x phone held to 2x, then the width cap)
  assert.deepEqual(rtSize(320, 180, 3, 720), [640, 360]);
  assert.deepEqual(rtSize(500, 281, 2, 720), [720, 405]);
  assert.deepEqual(rtSize(4, 2, 1), [16, 16]);
  // (the car screen's picture is never under its css size: vcall-draw.js asks at the screen's dpr, at least 1, not at the
  // city's render scale, which smeared it)
  const src = fs.readFileSync(new URL('../wagmi/storyrun/vcall-draw.js', import.meta.url), 'utf8');
  assert.match(src, /feed \? rtSize\(w, h, Math\.max\(1, globalThis\.devicePixelRatio \|\| 1\), FEED_MAX\)/);
  assert.match(src, /size\(r, w, h, true\)/);
});

test('the offices: one room per look, each with a seat, and the step kind is the runner\'s', async () => {
  const src = fs.readFileSync(new URL('../wagmi/storyrun/offices.js', import.meta.url), 'utf8');
  for (const k of OFFICE_LOOKS) assert.match(src, new RegExp(`^function ${k}\\(K, def\\)`, 'm'), `no office ${k}`);
  assert.match(src, /export const LOOKS = \['exec', 'startup', 'backstage', 'boardroom', 'kitchen', 'study', 'van', 'greenroom', 'truck', 'diner', 'lot', 'green', 'car', 'house'\]/);
  assert.deepEqual(OFFICE_LOOKS, ['exec', 'startup', 'backstage', 'boardroom', 'kitchen', 'study', 'van', 'greenroom', 'truck', 'diner', 'lot', 'green', 'car', 'house']);
  globalThis.location ??= new URL('http://127.0.0.1:4981/?pack=x');
  const { STEP_KINDS } = await import('../wagmi/storyrun/pack.js');
  assert.ok(STEP_KINDS.has('vcall'));
  assert.equal(CALL_EVENTS.length, 12);
});

test('the call screen: the tiles end above two lines of subtitle, the cover over the tiles, a status above the name tag', () => {
  const src = fs.readFileSync(new URL('../wagmi/storyrun/vcall.js', import.meta.url), 'utf8');
  // (the subtitle sits 92 px up; a 2-line subtitle at 30 px is about 89 px tall: the strip's name tags clear it)
  assert.match(src, /bottom: Math\.max\(touch \? 132 : 172, \(touch \? 78 : 92\) \+ subH \+ 10\)/);
  assert.match(src, /subH = 2 \* lh \+/);
  for (const [w, h] of [[1280, 720], [1920, 1080], [1024, 768]]) {
    const subH = 2 * Math.min(30, Math.max(24, w * 0.0175)) * 1.25 + 14, bottom = Math.max(172, 92 + subH + 10);
    for (const stage of [0, 'share']) {
      const L = layout(4, w, h, { mode: 'speaker', stage, top: 54, bottom });
      for (const r of L.tiles) assert.ok(r[1] + r[3] <= h - 92 - subH, `${w}x${h} ${stage}: a tile's foot ${r[1] + r[3]} over the subtitle's top ${h - 92 - subH}`);
    }
  }
  // (the CONNECTING cover over the tiles, which wait unseen until laid out: no name tag cut to an ellipsis on it)
  assert.match(src, /\.cover \{ position: absolute; inset: 0; z-index: 3;/);
  assert.match(src, /el\.className = 'tile'; el\.style\.display = 'none';/);
  // (Waiting to join, Reconnecting: above the name tag, smaller in a strip's small tile)
  assert.match(src, /\.tile \.st \{ position: absolute; inset: 0 0 34px 0;/);
  assert.match(src, /p\.el\.classList\.toggle\('sm', r\[3\] < 170\)/);
});

test("a call puts each one's call sound back as it was (a speaker's own, or the manifest's)", () => {
  const src = fs.readFileSync(new URL('../wagmi/storyrun/vcall.js', import.meta.url), 'utf8');
  assert.match(src, /fx0\.set\(p\.who, W\.voice\?\.fxOf\?\.\(p\.who\)\); W\.voice\?\.fx\?\.\(p\.who, 'video'\);/);
  assert.match(src, /for \(const \[w, k\] of fx0\) W\.voice\?\.fx\?\.\(w, k\);/);
  // (the voices' own: set, read, cleared)
  const v = fs.readFileSync(new URL('../wagmi/radio/voices.js', import.meta.url), 'utf8');
  const fxOf = {}, api = new Function('fxOf', `return { ${v.match(/fx\(speaker, kind\) \{[^\n]*\},/)[0]} ${v.match(/fxOf\(speaker\) \{[^\n]*\},/)[0]} };`)(fxOf);
  assert.equal(api.fxOf('Marge'), undefined);
  api.fx('Marge', 'phone'); const was = api.fxOf('Marge'); api.fx('Marge', 'video'); api.fx('Marge', was); assert.equal(api.fxOf('Marge'), 'phone');
  const none = api.fxOf('Lola'); api.fx('Lola', 'video'); api.fx('Lola', none); assert.equal('Lola' in fxOf, false);
});

test("a car-screen feed is the call's one card: its name tag carries the status, the caller card goes while it is up", () => {
  const src = fs.readFileSync(new URL('../wagmi/storyrun/vcall.js', import.meta.url), 'utf8');
  assert.match(src, /body\.wg-vfeed-on #wg \.wg-caller \{ opacity: 0 !important;/);
  assert.match(src, /if \(on !== was && !\(cardOff && !on\)\) feedShown\(id, on\);/);
  // (a call waiting's feed: its office built while it rings, the card gone from the answer: runner.js callWaiting)
  assert.match(src, /if \(cardOff\) feedShown\(id, true\);/); assert.match(src, /return \{ play, feed, prefetch, feedDef, poolKey \};/);
  assert.match(src, /feeds--; feedShown\(id, false\);/);
});

test("a car-screen feed is where its rect is from every camera: placed in clip space, never from a lens's pose", async () => {
  const { feedClip } = await import('../wagmi/storyrun/vcall-plan.js');
  // (the unit quad's corners through feedClip land on the rect's corners in css px, on any screen)
  for (const [W, H, rect] of [[1280, 720, [944, 88, 316, 178]], [390, 844, [214, 64, 160, 90]], [2560, 1080, [10, 20, 30, 40]]]) {
    const c = feedClip(rect, W, H), px = (nx, ny) => [(nx + 1) / 2 * W, (1 - ny) / 2 * H];
    const [x0, y0] = px(c.cx - c.sx / 2, c.cy + c.sy / 2), [x1, y1] = px(c.cx + c.sx / 2, c.cy - c.sy / 2);
    for (const [a, b] of [[x0, rect[0]], [y0, rect[1]], [x1, rect[0] + rect[2]], [y1, rect[1] + rect[3]]]) assert.ok(Math.abs(a - b) < 1e-9, `${W}x${H} ${a} vs ${b}`);
  }
  // (a camera's pose, aim or field of view never enters it: the same rect, the same place)
  assert.deepEqual(feedClip([944, 88, 316, 178], 1280, 720), feedClip([944, 88, 316, 178], 1280, 720));
  assert.equal(feedClip([0, 0, 10, 10], 0, 0).sx, 20);
  // (the draw: the quad's vertex is its clip position; no camera matrix, no quad held a distance out in front of the lens)
  const src = fs.readFileSync(new URL('../wagmi/storyrun/vcall-draw.js', import.meta.url), 'utf8');
  const feed = src.slice(src.indexOf('drawFeed(sets) {'), src.indexOf('texture(id) {'));
  assert.match(src, /if \(alpha\) mat\.vertexNode = vec4\(positionGeometry\.xy\.mul\(U\.cs\)\.add\(U\.cc\), float\(0\), float\(1\)\);/);
  assert.match(feed, /const c = feedClip\(f\.rect, W0, H0\);/);
  assert.doesNotMatch(feed, /matrixWorld|cameraSystem|\.fov|applyMatrix4|quaternion/);
  // (shown to the city's own camera only, and never in a raycast)
  assert.match(src, /mesh\.onBeforeRender = \(_r, _s, camera\) => \{ const main = camera === app\.cameraSystem\?\.camera \|\| camera === app\.postFX\?\.scenePass\?\.camera;/);
  assert.match(src, /mesh\.raycast = \(\) => \{\};/);
});
