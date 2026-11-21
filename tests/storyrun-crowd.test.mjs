// The story runner's house (wagmi/storyrun/crowd-plan.js, crowd.js): an arena's crowd of people, not figures, drawn in
// a fixed number of draw calls whatever its size.
//   node --test tests/storyrun-crowd.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = await import('../wagmi/storyrun/crowd-plan.js');
const src = (f) => fs.readFileSync(path.join(ROOT, 'wagmi/storyrun', f), 'utf8');

test(`the draw-call budget: one instanced mesh per part, whatever the size of the house`, () => {
  assert.equal(P.BUDGET.drawCalls, Object.values(P.PARTS).reduce((a, b) => a + b, 0));
  assert.equal(P.BUDGET.drawCalls, 30);
  const crowd = src('crowd.js');
  // (meshes are made in two places only, part() and IM(), never per person)
  assert.equal((crowd.match(/new THREE\.InstancedMesh\(/g) || []).length, 2);
  assert.doesNotMatch(crowd, /new THREE\.(Mesh|SkinnedMesh|Sprite)\(/);
  // (the parts it makes are the budget's: two levels of detail for the near parts, one for the rest)
  const parts = [...crowd.matchAll(/part\('(\w+)', \[([^\]]*)\]/g)].map((m) => [m[1], m[2].split('),').length]);
  const ims = [...crowd.matchAll(/IM\([^;]*?'crowd\.(\w+)'\)/g)].map((m) => [m[1], 1]);
  // (the hair: a mesh per style but bald, each in two levels of detail)
  assert.match(crowd, /for \(const name of HAIR_STYLES\) \{\s*if \(!HG\[0\]\[name\]\) continue;/);
  assert.match(crowd, /part\(`hair-\$\{name\}`, \[HG\[0\]\[name\], HG\[1\]\[name\]\]/);
  assert.equal(P.PARTS.hair, 2 * (P.HAIR_STYLES.length - 1));
  assert.deepEqual(Object.fromEntries([...parts, ...ims, ['hair', P.PARTS.hair]]), P.PARTS);
  // (the masked parts' per-instance data in one interleaved buffer: a WebGPU pipeline has eight vertex buffers)
  assert.match(crowd, /new THREE\.InstancedInterleavedBuffer\(/);
});

test(`the instance budget: a house too big is cut to it; the stage set's house fits it`, () => {
  const big = P.planHouse({ w: 120, bowl: { rows: 40, per: 160 }, far: { rows: 30, per: 200 }, full: 1 });
  assert.equal(big.near.length, P.BUDGET.near); assert.equal(big.far.length, P.BUDGET.far);
  for (const up of [false, true]) {
    const h = P.planHouse({ up });
    assert.ok(h.near.length > 300 && h.near.length <= P.BUDGET.near, `near ${h.near.length}`);
    assert.ok(h.far.length > 300 && h.far.length <= P.BUDGET.far, `far ${h.far.length}`);
  }
  // (the WebGL2 pit: its people join the near ones, kept clear of the set's own)
  const pit = [{ x: 0, z: 4 }, { x: 4.5, z: 4.3 }, { x: -3, z: 5 }];
  const h = P.planHouse({ pit, clear: [[4.5, 4.3]] });
  assert.equal(h.near.filter((p) => p.tier === 'pit').length, 2);
});

test(`people, not figures: faces, hair styles, skin, clothes and heights all vary; the back rows darker`, () => {
  const h = P.planHouse({ up: true });
  const all = [...h.near, ...h.far];
  const n = (k) => new Set(all.map((p) => p[k])).size;
  assert.ok(n('skin') >= 10); assert.ok(n('hair') >= 9); assert.ok(n('hairStyle') === P.HAIR_STYLES.length); assert.ok(n('face') === P.FACES);
  assert.ok(n('cloth') === P.CLOTHES); assert.ok(n('c1') >= 15);
  const sc = all.map((p) => p.scale); assert.ok(Math.max(...sc) - Math.min(...sc) > 0.15);
  assert.ok(h.near.filter((p) => p.stand).length > h.near.length * 0.6, 'up: on their feet');
  assert.ok(P.planHouse({}).near.filter((p) => p.stand).length < 60, 'calm: seated');
  const row = (j) => h.near.find((p) => p.row === j).dim;
  assert.ok(row(0) > row(4) && row(4) > row(8));
  assert.ok(Math.max(...h.far.map((p) => p.dim)) < row(8), 'the far tier darker than the bowl');
  // (the same house every time)
  assert.deepEqual(P.planHouse({ up: true }).near.slice(0, 5).map((p) => [p.x, p.skin, p.hairStyle]), h.near.slice(0, 5).map((p) => [p.x, p.skin, p.hairStyle]));
});

test(`the cheer: each their own, staggered; the far tier's frames in the atlas; the levels of detail`, () => {
  const h = P.planHouse({ up: true }), hands = [{}, {}], poles = [{}, {}];
  const styles = new Set(), poses = new Set(), at = [];
  for (const p of h.near.slice(0, 120)) { P.cheer(p, 12.3, true, hands, poles); styles.add(p.style); at.push(hands[1].y); }
  for (const s of ['v', 'clap', 'pump', 'phone']) assert.ok(styles.has(s), s);
  assert.ok(new Set(at.map((y) => y.toFixed(2))).size > 20, 'not in lockstep');
  for (const p of h.far.slice(0, 200)) for (const t of [1, 2.5, 7]) { const k = P.farPose(p, t, true); assert.ok(k >= 0 && k < P.FAR_POSES.length); poses.add(k); }
  assert.ok(poses.size >= 6);
  // (calm: at rest, a clap, a phone up; never the arms up)
  for (const p of h.far.slice(0, 200)) for (const t of [1, 4, 9]) assert.ok([0, 3, 4, 5].includes(P.farPose(p, t, false)));
  assert.equal(P.lodOf(5, -1), 0); assert.equal(P.lodOf(20, -1), 1);
  assert.equal(P.lodOf(P.LOD_NEAR + 0.5, 0), 0, 'hysteresis'); assert.equal(P.lodOf(P.LOD_NEAR + 0.5, 1), 1);
});

test(`the stage set room seats the house (crowd.js), not faceless figures`, () => {
  const st = src('stage-room.js');
  assert.match(st, /import \{ crowd \} from '\.\/crowd\.js';/);
  assert.match(st, /const house = crowd\(K\.group, planHouse\(\{ w, up, clear, pit: pitAt, seed: 281 \}\), \{ up \}\);/);
  assert.match(st, /house\.tick\(t, S\?\.cam, glowAt\)/);
  assert.doesNotMatch(st, /IM\(torsoGeo\(\)/);
  assert.doesNotMatch(st, /function lightPit/);
  // (nothing drawn from outside: the atlas is the canvas's own)
  const crowd = src('crowd.js');
  assert.doesNotMatch(crowd, /loadGLB|TextureLoader|\.glb'|\.png'|\.jpg'/);
});
