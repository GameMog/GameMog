// Mog City: the Vantor GT with a downloaded body (a world's car { model: 'mogcity/gt' }, unless body: 'built'). The same car as
// wagmi/storyrun/gt.js, and the same interface, but its skin, wheels, doors, lamps and cabin are a ready-made model's:
// assets/vehicles/vantor/vantor-gt.glb, made from "Porsche GT3 RS" by Black Snow (CC BY 4.0, assets/vehicles/vantor/
// CREDITS.md) with every badge, crest, maker's name and model lettering taken out, its hidden mechanicals removed and
// simplified. Here it is painted the Vantor's gloss black, its wheels black over red calipers, its lamps lit, 'VANTOR GT'
// and the plate put on its tail; it is scaled to the GT's wheelbase and set on the GT's axles.
//
// What it keeps of gt.js (buildGT is built first and its own body hidden): the driver's anchor and seat marks, the wheel
// his hands hold (moved to the model's own wheel, which turns with it), the boost's flame (moved to the model's tips),
// setThrust / setElectric / update / setDoor. The model's wheels and doors are put into gt.js's own lists, so update()
// turns and steers them and setDoor() swings them out on a hinge at their front edge.
//   const rs = await buildVantor(THREE, { paint?, plate? })
import { buildGT } from './gt.js';
import { loadGLB } from '../glb.js';
import { CREDITS } from '../credits.js';

export const VANTOR_GLB = new URL('../../assets/vehicles/vantor/vantor-gt.glb', import.meta.url).href;

// its line in the pause menu's Credits (CC BY 4.0 asks for it wherever the car is shown)
export const VANTOR_CREDIT = { what: 'The Vantor GT\'s body: "Porsche GT3 RS"', who: 'Black Snow', note: 'modified: badges, crest and lettering removed, simplified, repainted; the game\'s car is a look-alike with no connection to any car maker', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', src: 'https://sketchfab.com/3d-models/porsche-gt3-rs-e738eae819c34d19a31dd066c45e0f3d' };

export async function buildVantor(THREE, o = {}) {
  const gltf = await loadGLB(VANTOR_GLB);
  { const sec = CREDITS.find((c) => c.heading === 'Vehicles'); if (sec && !sec.lines.includes(VANTOR_CREDIT)) sec.lines.push(VANTOR_CREDIT); }
  const rs = buildGT(THREE, o), g = rs.group, M = rs.materials, V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  // gt.js's own body put away: all but the driver's anchor, the flame (its plumes, sprites and glow) and the wheel he holds
  const plumes = [];
  for (const ch of g.children) {
    if (ch === rs.anchor) continue;
    if (ch.isLight || ch.isSprite || ch.userData.len != null) { plumes.push(ch); continue; }
    if (ch === rs.yoke) { ch.traverse((m) => { if (m.isMesh) m.visible = false; }); continue; }
    ch.visible = false;
  }

  /* --------------------------------------------------- the model, placed -- */
  const src = gltf.scene.clone(true);
  const holder = new THREE.Group(); holder.name = 'vantor-ext'; holder.add(src); g.add(holder);
  const find = (re) => { const out = []; src.traverse((n) => { if (re.test(n.name)) out.push(n); }); return out; };
  const tops = (re) => find(re).filter((n) => !re.test(n.parent?.name || ''));   // (a part's node, not its meshes too)
  const box = (objs) => { const b = new THREE.Box3(); for (const x of [].concat(objs)) b.expandByObject(x); return b; };
  const centre = (objs) => box(objs).getCenter(V3());
  src.updateMatrixWorld(true);
  const rims = tops(/wheels_20x9/);
  if (rims.length !== 4) throw new Error('vantor: expected 4 wheels, found ' + rims.length);
  // which way is forward: the axis the wheels spread along most, towards the front bumper
  const wc = rims.map((r) => centre(r)), span = (k) => Math.max(...wc.map((c) => c[k])) - Math.min(...wc.map((c) => c[k]));
  const along = span('x') > span('z') ? 'x' : 'z', nose = centre(tops(/bumper_F/)), tail = centre(tops(/bumper_R/));
  const ang = along === 'z' ? (nose.z > tail.z ? 0 : Math.PI) : (nose.x > tail.x ? -Math.PI / 2 : Math.PI / 2);
  src.rotation.y = ang; src.updateMatrixWorld(true);
  // the scale that sets its axles on the GT's (2 x rs.axle apart), its middle between them, the tyres on y = 0
  const wcs = rims.map((r) => centre(r)), fz = Math.max(...wcs.map((c) => c.z)), rz = Math.min(...wcs.map((c) => c.z));
  const k = (2 * rs.axle) / (fz - rz);
  src.scale.multiplyScalar(k); src.updateMatrixWorld(true);
  const tyres = tops(/^Object_4/), ground = box(tyres.length ? tyres : rims).min.y, mid = centre(rims);
  src.position.set(-mid.x, -ground, -mid.z); src.updateMatrixWorld(true);
  g.updateMatrixWorld(true);

  /* -------------------------------------------------------------- paint -- */
  // by each part's own name (its first material's name is in it): gloss black body, black wheels, red calipers, lamps lit
  const wheelM = M.wheel, rubber = M.rubber;
  const discM = M.disc;
  const lit = M.drl, tailM = M.tail, glassM = M.glass;
  // (the lamp's LED body: dark chrome with a faint cold glow, its projector (lit) bright)
  const ledM = new THREE.MeshPhysicalNodeMaterial({ color: '#2A2D31', metalness: 0.8, roughness: 0.2, emissive: '#DCE6F2', emissiveIntensity: 0.18 });
  const paintRe = /carPaint(?!008)|carbon_roof|carbon_Wing.*carbon|carbon_hood.*carbon|spoiler/i;
  src.traverse((m) => {
    if (!m.isMesh) return;
    const n = m.name;
    m.castShadow = true; m.receiveShadow = true;
    if (/caliper/i.test(n)) m.material = M.caliper;
    else if (/amdb11_brake|brakedisc/i.test(n)) m.material = /misc_chrome/i.test(n) ? M.nut : discM;
    else if (/wheels_chrome|GT3RS_black/i.test(n)) m.material = wheelM;
    else if (/^Object_4/i.test(n)) m.material = rubber;
    else if (paintRe.test(n)) m.material = M.paint;
    else if (/headlight_[LR]_led.*headlight_high/i.test(n)) m.material = lit;
    else if (/headlight_[LR]_led.*led_lights/i.test(n)) m.material = ledM;
    else if (/brakelight|taillight|fascia_mid/i.test(n)) m.material = tailM;
    else if (/windshield|doorglass|quarterglass|backlight/i.test(n) && /glass/i.test(n)) m.material = glassM;
  });

  /* -------------------------------------------------------------- wheels -- */
  // each corner's rim, tyre and disc turn in a spin group on its axle (x), inside a group that steers (y); the caliper
  // steers but does not turn
  const parts = [...tyres, ...tops(/brakedisc/)];
  rs.wheels.length = 0;
  for (const rim of rims) {
    const c = centre(rim), W = new THREE.Group(), spin = new THREE.Group(); W.add(spin); W.position.copy(g.worldToLocal(c.clone())); g.add(W);
    W.updateMatrixWorld(true);
    const mine = [rim, ...parts.filter((p) => centre(p).distanceTo(c) < 0.4)];
    for (const p of mine) {
      const cal = []; p.traverse((m) => { if (m.isMesh && /caliper/i.test(m.name)) cal.push(m); });
      spin.attach(p); for (const m of cal) W.attach(m);
    }
    const tb = box(mine.filter((p) => /^Object_4/.test(p.name)));
    const r = tb.isEmpty() ? 0.34 : (tb.max.y - tb.min.y) / 2;
    rs.wheels.push({ W, spin, front: W.position.z > 0, r });
  }

  /* --------------------------------------------------------------- doors -- */
  // each side's door skin, its glass, its trim, its inner panel and its mirror, hung on a hinge at the door's front edge
  for (const [nm, re] of [['L', /door_L|doorglass_L|doorpanel_L|mirror_L/], ['R', /door_R|doorglass_R|doorpanel_R|mirror_R/]]) {
    const ps = tops(re); if (!ps.length) continue;
    const skin = tops(nm === 'L' ? /gt3rs_door_L/ : /gt3rs_door_R/), b = box(skin.length ? skin : ps);
    const sd = Math.sign(b.getCenter(V3()).x) || 1, sideK = sd > 0 ? 'L' : 'R';
    const pivot = new THREE.Group(); pivot.name = 'door' + sideK;
    pivot.position.copy(g.worldToLocal(V3(sd > 0 ? b.max.x - 0.04 : b.min.x + 0.04, (b.min.y + b.max.y) / 2, b.max.z - 0.03)));
    g.add(pivot); pivot.updateMatrixWorld(true);
    for (const p of ps) pivot.attach(p);
    rs.doors[sideK] = { pivot, axis: V3(0, -sd, 0), t: 0 };
  }

  /* ---------------------------------------------------- the wheel he holds -- */
  // gt.js's wheel (its marks for his hands) moved to the model's, and the model's wheel turned with it
  const steer = tops(/steer_3/);
  if (steer.length && rs.yoke) {
    const c = g.worldToLocal(centre(steer));
    rs.yoke.position.copy(c); rs.yoke.updateMatrixWorld(true);
    const spin = rs.yoke.children[0]; for (const p of steer) spin.attach(p);
  }

  /* ------------------------------------------------------------ the flame -- */
  // gt.js's twin tongues moved onto the model's tips
  const tips = tops(/exhausttip_3/);
  if (tips.length) {
    const tb = box(tips), tc = g.worldToLocal(tb.getCenter(V3())), tz = g.worldToLocal(V3(0, 0, tb.min.z)).z;
    const ref = plumes.find((p) => p.userData.len != null), sp = plumes.find((p) => p.isSprite);
    const dz = ref ? tz - (ref.position.z + 0.012) : 0, dy = sp ? tc.y - sp.position.y : 0;
    for (const p of plumes) { p.position.z += dz; p.position.y += dy; p.position.x += tc.x; }
  }

  /* ---------------------------------------------------- 'VANTOR GT', plate -- */
  const meshes = []; src.traverse((m) => { if (m.isMesh && m.visible) meshes.push(m); });
  const ray = new THREE.Raycaster();
  // where the body's skin is, from behind (dir +1) or ahead (dir -1), at height y in the middle
  const skinZ = (y, dir, x = 0) => { g.updateMatrixWorld(true); ray.set(g.localToWorld(V3(x, y, dir > 0 ? -8 : 8)), V3(0, 0, dir).transformDirection(g.matrixWorld)); const h = ray.intersectObjects(meshes, false)[0]; return h ? g.worldToLocal(h.point.clone()).z : null; };
  const canvasTex = (w, h, draw) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const bar = tops(/fascia_mid/), barY = bar.length ? g.worldToLocal(centre(bar)).y : 0.8;
  {
    const tex = canvasTex(1024, 128, (cx, w, h) => { cx.clearRect(0, 0, w, h); cx.fillStyle = '#E8EBEF'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.font = "600 92px 'Helvetica Neue', 'Arial', sans-serif"; cx.fillText('V A N T O R    G T', w / 2, h / 2 + 4); });
    const mm = new THREE.MeshPhysicalNodeMaterial({ map: tex, transparent: true, metalness: 0.9, roughness: 0.2, alphaTest: 0.3 });
    const y = o.labelY ?? barY - 0.075, z = skinZ(y, 1) ?? -2.3;
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.0525), mm); pl.position.set(0, y, z - 0.006); pl.rotation.y = Math.PI; g.add(pl);
  }
  {
    const ptex = canvasTex(512, 256, (cx, w, h) => {
      cx.fillStyle = '#F2F1EA'; cx.fillRect(0, 0, w, h); cx.strokeStyle = '#1B2A4A'; cx.lineWidth = 10; cx.strokeRect(8, 8, w - 16, h - 16);
      cx.fillStyle = '#1B2A4A'; cx.font = "700 132px 'Arial Narrow', 'Arial', sans-serif"; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(o.plate || 'JM 0838', w / 2, h * 0.56);
      cx.font = "600 34px 'Arial', sans-serif"; cx.fillText('EMPIRE', w / 2, h * 0.16);
    });
    const pm = new THREE.MeshStandardNodeMaterial({ map: ptex, roughness: 0.4, metalness: 0.1 });
    const py = o.plateY ?? 0.5, zb = skinZ(py, 1) ?? -2.3;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(0.305, 0.155), pm); back.position.set(0, py, zb - 0.008); back.rotation.y = Math.PI; g.add(back);
    const fy = o.frontPlateY ?? 0.3, zf = skinZ(fy, -1);
    if (zf != null) { const front = new THREE.Mesh(new THREE.PlaneGeometry(0.305, 0.155), pm); front.position.set(0, fy, zf + 0.008); g.add(front); }
  }

  // its box, for all that runs into it or round it
  g.updateMatrixWorld(true);
  const bb = new THREE.Box3(); for (const m of meshes) bb.expandByObject(m);
  const lo = g.worldToLocal(bb.min.clone()), hi = g.worldToLocal(bb.max.clone());
  const hx = Math.max(Math.abs(lo.x), Math.abs(hi.x));
  return Object.assign(rs, {
    length: hi.z - lo.z, width: 2 * hx, height: hi.y, body: { hx, z0: lo.z - 0.02, z1: hi.z + 0.03, top: hi.y }, ext: holder, kind: 'gt',
  });
}
