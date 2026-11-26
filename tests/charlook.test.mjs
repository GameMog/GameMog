// A world's people lit and framed for the close lens (`look: 'cinematic'`, wagmi/storyrun/charlight.js, Mandi's Revenge
// 25 Nov): the pack's option checked, the portrait lens on its calls, and every world without it exactly as before (no rig
// added to any shader, the calls' webcam as it was).
//   node --test tests/charlook.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
globalThis.location ??= new URL('http://127.0.0.1:4981/?pack=x');
const { check, PEOPLE_LOOKS } = await import('../wagmi/storyrun/pack.js');
const { camOf, FRAME, PORTRAIT } = await import('../wagmi/storyrun/vcall-plan.js');

const ROOT = new URL('..', import.meta.url).pathname;
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pack = (f) => JSON.parse(src('tools/storyrun/test-packs/' + f));

test('look: cinematic or none, anything else refused', () => {
  const w = pack('fold-phone.json');
  assert.deepEqual(check(w), []);
  w.look = 'cinematic'; assert.deepEqual(check(w), []);
  w.look = 'noir'; assert.ok(check(w).some((e) => /^look: one of cinematic/.test(e)));
  // (charlight.js reads the same words)
  assert.match(src('wagmi/storyrun/charlight.js'), new RegExp(`export const LOOKS = ${JSON.stringify(PEOPLE_LOOKS).replace(/"/g, "'").replace(/[[\]]/g, '\\$&')}`));
});

test('the portrait lens: the same framing, a longer lens from further back, at eye level', () => {
  for (const kind of Object.keys(FRAME)) {
    const a = camOf([0, 1.4, 0], kind), b = camOf([0, 1.4, 0], kind, { portrait: true });
    assert.ok(b.fov < a.fov && b.fov === PORTRAIT[kind].fov, kind);
    assert.ok(b.pos[2] > a.pos[2] * 1.3, kind);
    // (the face the same share of the tile: its height over the frame's at the lens's distance)
    const share = (c) => 1 / (2 * c.pos[2] * Math.tan((c.fov * Math.PI) / 360));
    assert.ok(Math.abs(share(a) / share(b) - 1) < 0.05, kind);
    assert.ok(b.pos[1] <= 1.4 + 1e-9 && b.pos[1] >= 1.4 - 0.1, kind);
  }
  assert.deepEqual(camOf([0, 1.4, 0]), camOf([0, 1.4, 0], 'close', { portrait: false }));
});

test('a world without it: nothing added', () => {
  const pol = src('wagmi/storyrun/polish.js');
  assert.match(pol, /if \(!n\?\.isNodeMaterial \|\| n\.userData\?\.rig \|\| !charLook\(\)\) return n;/);
  const cl = src('wagmi/storyrun/charlight.js');
  assert.match(cl, /if \(!scene \|\| !charLook\(\)\) return;/);
  assert.match(src('wagmi/storyrun/vcall.js'), /camOf\(eyes, kind, \{ face, portrait: !!charLook\(\) \}\)/);
});

test('a close shot on a face brought to its eye level; a wide, low or high shot left as written', async () => {
  const { eyeLevel, EYE_UP, EYE_HIGH } = await import('../wagmi/storyrun/vcall-plan.js');
  const head = [0, 1.55, 0], look = [0, 1.55, 0];
  // (the opening's laptop close: 1.1 m out, 0.25 over the head's bone: down to at most EYE_HIGH degrees over the eyes)
  const e = eyeLevel([0.5, 1.8, 1.0], look, head);
  const h = Math.hypot(0.5, 1.0), ey = 1.55 + EYE_UP;
  assert.ok(e && Math.abs(e.lens[1] - (ey + h * Math.tan((EYE_HIGH * Math.PI) / 180))) < 1e-9 && e.lens[0] === 0.5 && e.lens[2] === 1.0);
  assert.ok(Math.abs(e.look[1] - (ey - 0.01)) < 1e-9);
  // (a lens under the eyes comes up to them)
  assert.equal(eyeLevel([0, 1.4, 1.2], look, head).lens[1], ey);
  // (left as written: a wide shot, a look away from the head, a written high angle)
  assert.equal(eyeLevel([3, 3, 8], look, head), null);
  assert.equal(eyeLevel([0, 1.6, 1.2], [0, 1.0, 0.6], head), null);
  assert.equal(eyeLevel([0, 2.4, 1.5], look, head), null);
  assert.equal(eyeLevel(null, look, head), null);
  const run = fs.readFileSync(path.join(ROOT, 'wagmi/storyrun/runner.js'), 'utf8');
  assert.match(run, /if \(charLook\(\) && !fr && scL/);
});

test('the portrait framing puts the eyes on the upper third of the tile', () => {
  // (the eyes' height over the look point as a share of the frame's height at their distance: up)
  for (const kind of Object.keys(FRAME)) {
    const c = camOf([0, 1.4, 0], kind, { portrait: true }), d = c.pos[2], H = 2 * d * Math.tan((c.fov * Math.PI) / 360);
    const fromTop = 0.5 - (1.4 - c.look[1]) / H;
    assert.ok(fromTop > 0.3 && fromTop < 0.38, `${kind} ${fromTop}`);
  }
  const vc = src('wagmi/storyrun/vcall.js');
  // (a laptop's bezel: the tiles laid out inside it and each picture drawn on its tile)
  assert.match(vc, /const bx = root\.clientLeft \|\| 0, by = root\.clientTop \|\| 0;/);
  assert.match(vc, /rect: fs \|\| !\(bx \|\| by\) \? r : \[r\[0\] \+ bx, r\[1\] \+ by, r\[2\], r\[3\]\]/);
  // (under the look, the webcam on the eye mesh itself)
  assert.match(vc, /if \(charLook\(\)\) \{ const m = meshEyes\(fig, v\); if \(m\) return m; \}/);
});

test("the eyes' own layers (a GLB's eyeOcclusion and tearLine) are finished on every look; garments painted on skin keep their colour", () => {
  const pol = src('wagmi/storyrun/polish.js');
  assert.match(pol, /const isEyeOcc = \(m\) => m\?\.userData\?\.kind === 'eyeOcclusion' \|\| m\?\.name === 'eyeOcclusion';/);
  assert.match(pol, /const isTear = \(m\) => m\?\.userData\?\.kind === 'tearLine' \|\| m\?\.name === 'tearLine';/);
  assert.match(pol, /\} else if \(eyes && !r8 && isEyeOcc\(m\)\) \{/);
  assert.match(pol, /n = new THREE\.MeshBasicNodeMaterial\(\);/);
  // (the skin's own layers kept off a print: the wrap and the light through, the sheen, the grade under the look)
  assert.match(pol, /const mk = builder\.material\.userData\?\.skinMask \? skinMask\(diffuseContribution\) : float\(1\);/);
  assert.match(pol, /if \(charLook\(\)\) \{ n\.colorNode = vec4\(mix\(c0grade, n\.colorNode\.rgb, skinMask\(c0grade\)\), materialColor\.a\); garmentSafe\(n\); \}/);
});
