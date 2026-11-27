// Dan's clips on another body of his rig (wagmi/retarget.js): each limb's segment put where Dan's is on every key
// (the rest retarget), the root's travel scaled by leg length, a gait's pace on its legs, his walk's arms hung in;
// and where the engine uses it (the forged hero, the cast's forged bodies, the set and street walks).
//   node --test tests/retarget.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const RT = await import('../wagmi/retarget.js');
// (three.js for the maths, from a GameMog checkout beside this one; the math tests skip without one)
const THREE_AT = [path.join(ROOT, '..', 'node_modules/three/build/three.module.js'), path.join(ROOT, 'node_modules/three/build/three.module.js')].find((f) => fs.existsSync(f));
const THREE = THREE_AT ? await import(THREE_AT) : null;

// a two-bone limb: upperarm01_L at the origin pointing at lowerarm01_L; both rigs share the bone's frame (identity),
// the target's elbow 17 deg forward of the source's
function rigs() {
  const { Vector3, Quaternion } = THREE, I = new Quaternion();
  const src = { bind: new Map([['upperarm01_L', { p: new Vector3(0, 0, 0), q: I.clone() }], ['lowerarm01_L', { p: new Vector3(0, -0.3, 0), q: I.clone() }]]), bones: new Map() };
  const a = (17 * Math.PI) / 180;
  const dst = { bind: new Map([['upperarm01_L', { p: new Vector3(0, 0, 0), q: I.clone() }], ['lowerarm01_L', { p: new Vector3(0, -0.3 * Math.cos(a), 0.3 * Math.sin(a)), q: I.clone() }]]), bones: new Map() };
  return { src, dst };
}

test('the rest retarget measures each long bone against Dan and swings the body onto his on every key', (t) => {
  if (!THREE) return t.skip('no three.js beside this checkout');
  const { src: s, dst: d } = rigs();
  const { corr, deg } = RT.restCorrections(THREE, s, d);
  assert.ok(Math.abs(deg.upperarm01_L - 17) < 0.1, String(deg.upperarm01_L));
  // (a key turning the arm 40 deg out about the forward axis: the target's segment lands where the source's does)
  const key = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.7);
  const clip = new THREE.AnimationClip('walk', 1, [new THREE.QuaternionKeyframeTrack('upperarm01_L.quaternion', [0, 1], [...key.toArray(), ...key.toArray()])]);
  const [out] = RT.retargetClips(THREE, [clip], { corr, parentOf: () => 'shoulder01_L' });
  const q2 = new THREE.Quaternion().fromArray(out.tracks[0].values, 0);
  const seg = (r, q) => r.bind.get('lowerarm01_L').p.clone().sub(r.bind.get('upperarm01_L').p).normalize().applyQuaternion(q);
  assert.ok(seg(d, q2).angleTo(seg(s, key)) < 1e-4, 'the target segment follows the source');
  assert.ok(seg(d, key).angleTo(seg(s, key)) > 0.29, 'and without the retarget it is 17 deg off');
  // (the clip given is untouched; a parent's correction is taken off its children's keys)
  assert.deepEqual(Array.from(clip.tracks[0].values.slice(0, 4)), key.toArray().map((x) => Math.fround(x)));
  const child = new THREE.AnimationClip('walk', 1, [new THREE.QuaternionKeyframeTrack('upperarm02_L.quaternion', [0], [0, 0, 0, 1])]);
  const [c2] = RT.retargetClips(THREE, [child], { corr, parentOf: (n) => (n === 'upperarm02_L' ? 'upperarm01_L' : null) });
  assert.ok(new THREE.Quaternion().fromArray(c2.tracks[0].values).angleTo(corr.upperarm01_L.clone().invert()) < 1e-5);
});

test('a difference past 45 deg is not a pose: left alone; the root travel scales by leg length', (t) => {
  if (!THREE) return t.skip('no three.js beside this checkout');
  const { src: s, dst: d } = rigs();
  d.bind.get('lowerarm01_L').p.set(0.3, 0, 0);
  assert.equal(RT.restCorrections(THREE, s, d).corr.upperarm01_L, undefined);
  const clip = new THREE.AnimationClip('walk', 1, [new THREE.VectorKeyframeTrack('root.position', [0], [0.01, 1.0, -0.08])]);
  const [out] = RT.retargetClips(THREE, [clip], { rootScale: 0.8 });
  assert.deepEqual(Array.from(out.tracks[0].values).map((x) => +x.toFixed(4)), [0.008, 0.8, -0.064]);
});

test("a gait's pace on the body's legs: speed over the capture speed times the leg ratio, clamped 0.6-1.6", () => {
  assert.equal(RT.gaitPace('walk', RT.GAIT_SPEED.walk, 1), 1);
  assert.ok(Math.abs(RT.gaitPace('walk', RT.GAIT_SPEED.walk, 0.8) - 1.25) < 1e-9);
  assert.equal(RT.gaitPace('walk', 0.2, 1), 0.6);
  assert.equal(RT.gaitPace('walk', 9, 1), 1.6);
  assert.equal(RT.gaitPace('dance', 2, 1), 1);
  assert.deepEqual(Object.keys(RT.HANG).sort(), ['drunkWalk', 'walk', 'walkF', 'walkHeavy']);
});

test("his walk's arms hung in: the swing kept, only the gaits HANG names change, the source clip untouched", (t) => {
  if (!THREE) return t.skip('no three.js beside this checkout');
  const q = (x, y, z, w) => [x, y, z, w];
  const tr = (n) => new THREE.QuaternionKeyframeTrack(n + '.quaternion', [0, 0.5], [...q(0, 0, 0, 1), ...q(0, 0, 0, 1)]);
  const walk = new THREE.AnimationClip('walk', 0.5, ['upperarm01_L', 'upperarm02_L', 'lowerarm01_L', 'upperarm01_R', 'upperarm02_R', 'lowerarm01_R'].map(tr));
  const idle = new THREE.AnimationClip('idle', 0.5, [tr('upperarm01_L')]);
  const [w2, i2] = RT.hangArms(THREE, [walk, idle]);
  assert.equal(i2, idle);
  const ua = new THREE.Quaternion().fromArray(w2.tracks[0].values), fa = new THREE.Quaternion().fromArray(w2.tracks[2].values);
  // (the left upper arm swung in about the forward axis by HANG.walk[0], its forearm by HANG.walk[1] more)
  const down = new THREE.Vector3(0, -1, 0);
  assert.ok(Math.abs((down.clone().applyQuaternion(ua).x * 180) / Math.PI + RT.HANG.walk[0]) < 0.2);
  assert.ok(Math.abs(((down.clone().applyQuaternion(ua.clone().multiply(fa)).x) * 180) / Math.PI + RT.HANG.walk[0] + RT.HANG.walk[1]) < 0.6);
  assert.deepEqual(Array.from(walk.tracks[0].values), [0, 0, 0, 1, 0, 0, 0, 1]);
});

test('the engine uses it: the forged hero and his gaits, the cast, the set and street walks', () => {
  const g = src('wagmi/game.js');
  assert.match(g, /PACK\.heroGLTF\(loadGLB, \(dan, g\) => \{ const r = danOn\(THREE, dan, g\); legRatio = r\.legRatio; onBody = true; return walkStyled\(THREE, r\.clips, heroStyle\); \}\)/);
  assert.match(g, /\.filter\(\(\[n\]\) => clipOf\(n\)\)\.map\(\(\[n, a, b\]\) => \[n, a \* legRatio, n === 'idle' \? b : b \* legRatio, n === 'walk' && !gaitNames\(\)\.includes\('jog'\) \? a \* legRatio \* WALK_HOLD : 0\]\)/);
  assert.match(g, /a0 = a\[3\] \|\| a\[1\]/);
  assert.match(g, /clips = \(onBody \? gltf\.animations : danClips\(THREE, gltf\.animations\)\)\.slice\(\)/);
  assert.match(g, /lean\(dt, p, v, L, air\);/);
  assert.match(src('wagmi/storyrun/cast.js'), /f\.legRatio = legRatio \* walkSp;/);
  assert.match(src('wagmi/storyrun/sets.js'), /P\.action\.setEffectiveTimeScale\(gaitPace\(w\.clip \|\| 'walk',/);
  assert.match(src('wagmi/storyrun/runner.js'), /fig\.play\('walk', true, 0\.3\)/);
  // (off switches for a side-by-side: ?retarget=0, ?gait=classic)
  assert.match(src('wagmi/retarget.js'), /get\('retarget'\) !== '0'/);
  assert.match(src('wagmi/retarget.js'), /get\('gait'\) !== 'classic'/);
});

test("the locomotion pack: Tripo's walk, run, idle, idleLook, swagger and phoneCall on Dan's 66 bones; speeds, gaits and sources in its extras", () => {
  const b = fs.readFileSync(path.join(ROOT, 'assets/anim/loco-walk.glb')), j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  assert.deepEqual(j.animations.map((a) => a.name), ['walk', 'run', 'idle', 'idleLook', 'swagger', 'phoneCall', 'walkUal']);
  for (const a of j.animations) assert.equal(a.channels.length, 67, a.name);
  const x = j.asset.extras.loco;
  assert.ok(x.speed.walk > 1.0 && x.speed.walk < 1.45, String(x.speed.walk));
  assert.ok(x.speed.run > 3.5 && x.speed.run < 5, String(x.speed.run));
  assert.ok(x.speed.swagger > 1.0 && x.speed.swagger < 1.6, String(x.speed.swagger));
  assert.deepEqual(x.gaits, ['idle', 'walk', 'run']);
  assert.match(src('wagmi/game.js'), /const GAIT_TOP = GAITS\.some\(\(\[n\]\) => n === 'sprint'\) \? 1\.6 : 1\.85;/);
  for (const n of Object.keys(x.from)) assert.match(x.from[n], n === 'walkUal' ? /Quaternius.*CC0/ : /Tripo/);
  assert.ok(x.speed.walkUal > 0.8 && x.speed.walkUal < 1.4, String(x.speed.walkUal));
  assert.match(src('wagmi/game.js'), /await loadLoco\(loadGLB\);/);
  assert.match(src('wagmi/game.js'), /gaitNames\(\)\.filter\(\(n\) => n !== 'idle'\)/);
  assert.match(src('wagmi/storyrun/cast.js'), /loadLoco\(loadGLB\)\.then\(\(\) => loadGLB\('assets\/characters\/dan\.glb'\)\)/);
  assert.match(src('NOTICE'), /loco-walk\.glb/);
});

test("a walk style: a cast entry's walk naming one (swagger) is their walk; any older name leaves the walk as it was", (t) => {
  assert.equal(RT.WALK_STYLES.get('swagger'), 'swagger'); assert.equal(RT.WALK_STYLES.get('ual'), 'walkUal');
  for (const n of ['walk', 'walkCool', 'walkHeavy', 'jog']) assert.ok(!RT.WALK_STYLES.has(n), n);
  if (!THREE) return t.skip('no three.js beside this checkout');
  const c = (name) => new THREE.AnimationClip(name, 1, []);
  const clips = [c('idle'), c('walk'), c('swagger'), c('walkUal')];
  assert.equal(RT.walkStyled(THREE, clips, 'walkCool'), clips);
  const s = RT.walkStyled(THREE, clips, 'swagger');
  assert.equal(s.length, 4); assert.equal(s[1].name, 'walk'); assert.notEqual(s[1], clips[1]);
  const u = RT.walkStyled(THREE, clips, 'ual'); assert.equal(u[1].name, 'walk'); assert.notEqual(u[1], s[1]);
  assert.equal(RT.walkStyled(THREE, clips, 'swagger'), s);
  assert.match(src('wagmi/game.js'), /const heroStyle = PACK\?\.ok \? PACK\.castOf\?\.\(PACK\.heroName\)\?\.walk : null;/);
  assert.match(src('wagmi/storyrun/cast.js'), /walkStyled\(THREE, rt\.clips, c\.walk\)/);
});

test('on the phone on foot: the call puts the phone to the hero\'s ear and takes it down after (game.js phoneLayer)', () => {
  assert.match(src('wagmi/game.js'), /Q\.phone = \(on\) =>/);
  assert.match(src('wagmi/game.js'), /phoneLayer\(dt\);\n\s*Q\.post\?\.\(d, p, air\);/);
  assert.match(src('wagmi/storyrun/runner.js'), /const onFoot = !inCar\(\) && W\.dan\?\.phone; if \(onFoot\) W\.dan\.phone\(true\);/);
  assert.match(src('wagmi/storyrun/runner.js'), /finally \{ talking = false; if \(onFoot\) W\.dan\.phone\(false\);/);
});

test('a body\'s own pose fix: Mandi\'s sheet asks for her sit and phone takes only; no other body, no other clip', async () => {
  const PF = await import('../wagmi/pose-fix.js');
  const g = (x) => ({ parser: { json: { asset: { extras: x } } } });
  assert.deepEqual(PF.poseFixOf(g({ forge: { landmarks: { sheet: 'mandi' } } })), { sit: 'lady', sitTalk: 'lady', phone: 'ear', phoneCall: 'ear' });
  assert.equal(PF.poseFixOf(g({ forge: { landmarks: { sheet: 'lola' } } })), null);
  assert.equal(PF.poseFixOf(g({})), null);
  assert.deepEqual(PF.poseFixOf(g({ poseFix: { sit: 'lady', walk: 'nope' } })), { sit: 'lady' });
  // (the walk, the owner's UAL walk and every other clip are never in the list)
  for (const k of Object.keys(PF.POSE_FIX.mandi)) assert.ok(!/walk|run|idle/i.test(k));
  assert.match(src('wagmi/retarget.js'), /poseFixOf\(bodyGltf\)/);
});
