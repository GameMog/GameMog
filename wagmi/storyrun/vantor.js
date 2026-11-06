// Mog City: the Vantor GT with a downloaded body (a world's car { model: 'mogcity/gt' }, unless body: 'built'). The same car as
// wagmi/storyrun/gt.js, and the same interface, but its skin, wheels, doors, lamps and cabin are a ready-made model's:
// assets/vehicles/vantor/vantor-gt.glb, made from "Porsche GT3 RS" by Black Snow (CC BY 4.0, assets/vehicles/vantor/
// CREDITS.md) with every badge, crest, maker's name and model lettering taken out, its hidden mechanicals removed and
// simplified. Here it is finished in the Vantor's matte black (its trim, carbon, glass, wheels and lamps to match, the
// crest's empty well capped), its calipers red, its lamps lit, 'VANTOR GT' and the plate put on its tail;
// it is scaled to the GT's wheelbase and set on the GT's axles.
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
  // (the owner, 6 Nov: "the car needs a matte finish and polish") A satin black like a factory matte wrap: rough, a thin
  // soft clear coat and a faint sheen, so the sun leaves broad soft highlights along the body lines and no mirror of the
  // sky, and it still reads as black paint. Round it, everything that is not paint finished so it holds up beside it:
  // satin carbon (the roof, the wing's blades, the lid's stripes), satin black trim, piano-black glass trim, smoked glass,
  // dark gunmetal wheels with gloss black centres on matte rubber, clear lamp lenses, the lamps lit. o.finish 'gloss'
  // keeps the old gloss black. Every part is matched by its node's name and its own material's name (m.userData.mat);
  // the model's own materials (most of them mirror-smooth, the glTF default metal) are left only inside the cabin.
  const P = (p) => new THREE.MeshPhysicalNodeMaterial(p), S = (p) => new THREE.MeshStandardNodeMaterial(p), DS = THREE.DoubleSide;
  const gloss = o.finish === 'gloss';
  const paint = gloss ? M.paint : P({ color: o.paint ?? '#060607', metalness: 0, roughness: 0.6, specularIntensity: 0.42, clearcoat: 0.1, clearcoatRoughness: 0.4, sheen: 0.25, sheenColor: '#1E2126', sheenRoughness: 0.45, side: DS });
  let carbonTex = null; src.traverse((m) => { if (!carbonTex && m.isMesh && /carbon_roof/.test(m.material?.name || '')) carbonTex = m.material.map || null; });
  const X = {
    paint,
    carbon: P({ color: '#34363A', map: carbonTex, metalness: 0, roughness: 0.5, specularIntensity: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.3, side: DS }),   // satin carbon
    trim: S({ color: '#0E0F11', metalness: 0, roughness: 0.68, side: DS }),         // satin black plastic, a shade off the paint
    piano: P({ color: '#050506', metalness: 0, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03, side: DS }),   // the black glass round the windows
    seal: S({ color: '#08090A', metalness: 0, roughness: 0.85, side: DS }),        // rubber seals, the underside
    grille: S({ color: '#141518', metalness: 0.6, roughness: 0.5, alphaTest: 0.5, side: DS }),
    darkChrome: P({ color: '#3A3D42', metalness: 1, roughness: 0.22, side: DS }),
    tip: P({ color: '#6E6A66', metalness: 1, roughness: 0.32, side: DS }),        // the tips: brushed titanium
    rim: P({ color: '#26282C', metalness: 0.9, roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.2, side: DS }),   // dark gunmetal
    hub: P({ color: '#060607', metalness: 0.2, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, side: DS }),     // gloss black
    tyre: S({ color: '#141416', metalness: 0, roughness: 0.94 }),
    window: P({ color: '#06070A', metalness: 0, roughness: 0.03, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.84, depthWrite: false, side: DS }),
    lens: P({ color: '#FFFFFF', metalness: 0, roughness: 0.02, transparent: true, opacity: 0.06, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false, side: DS }),
    redLens: P({ color: '#5A0A0E', metalness: 0, roughness: 0.05, transparent: true, opacity: 0.55, clearcoat: 1, depthWrite: false, side: DS }),
    reflector: P({ color: '#4A0508', metalness: 0, roughness: 0.15, clearcoat: 1, emissive: '#C0101A', emissiveIntensity: 0.25 }),
    housing: S({ color: '#0B0C0E', metalness: 0.3, roughness: 0.4, side: DS }),
    // the lamp's LED body: dark chrome with a faint cold glow, its projector (lit) bright
    led: P({ color: '#2A2D31', metalness: 0.8, roughness: 0.2, emissive: '#DCE6F2', emissiveIntensity: 0.18 }),
  };
  if (X.carbon.map) X.carbon.map.anisotropy = 8;
  const MAT = { caliper: M.caliper, disc: M.disc, nut: M.nut, lit: M.drl, tail: M.tail, tailCore: M.tailCore, under: M.under };
  const pick = (n, mt) => {
    if (/caliper/i.test(n)) return MAT.caliper;
    if (/amdb11_brake|brakedisc/i.test(n)) return /misc_chrome/i.test(mt) ? MAT.nut : MAT.disc;
    if (/wheels_chrome/i.test(n)) return /GT3RS_black/.test(mt) ? X.hub : X.rim;
    if (/^Object_4/i.test(n)) return X.tyre;
    if (/headlight_[LR]_led/i.test(n)) return /headlight_high/.test(mt) ? MAT.lit : /led_lights/.test(mt) ? X.led : /headlight_1\.001$/.test(mt) ? X.darkChrome : X.housing;
    if (/headlightglass/i.test(n)) return X.lens;
    if (/fascia_glass/i.test(n)) return /antichrome/.test(mt) ? X.redLens : X.lens;
    if (/fascia_mid/i.test(n)) return /brakelight/.test(mt) ? MAT.tailCore : /taillight/.test(mt) ? MAT.tail : X.housing;
    if (/windshield|doorglass|quarterglass|backlight/i.test(n)) return /glass_int/.test(mt) ? null : X.window;
    if (/exhausttip/i.test(n)) return /exhausttip_antichrome/.test(mt) ? X.tip : X.seal;
    if (/carPaint\.003/.test(mt)) return paint;
    if (/carPaint\.008/.test(mt)) return X.seal;
    if (/carbon_roof/.test(mt)) return X.carbon;
    if (/plastic_mgl_060606FF\.001|plastic_mgl\.00[12]/.test(mt)) return X.trim;
    if (/metal_radiator/.test(mt)) return null;
    if (/blackGlass/.test(mt)) return X.piano;
    if (/headlight_1\.001_1/.test(mt)) return X.seal;
    if (/^TwiXeR_992\.001$/.test(mt)) return MAT.under;
    if (/chrome\.003/.test(mt)) return X.darkChrome;
    if (/red\.001$/.test(mt)) return X.reflector;
    return undefined;
  };
  src.traverse((m) => {
    if (!m.isMesh) return;
    const mt = (m.userData.mat ??= m.material?.name || '');
    m.castShadow = true; m.receiveShadow = true;
    const to = pick(m.name, mt);
    if (to === null) {
      if (/glass_int/.test(mt)) m.visible = false;   // (the windows' inner pane: one pane of smoked glass, no second layer sorting against it)
      else if (/metal_radiator/.test(mt)) { const map = m.material.map; m.material = X.grille.clone(); m.material.map = map; m.material.alphaMap = null; }
    } else if (to) m.material = to;
  });

  /* ------------------------------------------------------ the crest's well -- */
  // the crest taken off the front lid left its shield-shaped hole (the well under it showing, a maker's crest in outline):
  // capped with a patch of the lid's own carbon, its height and its weave's UVs fitted to the lid round the hole, 1.5 mm
  // under the lid's skin so only the hole shows it
  {
    let lid = null; src.traverse((m) => { if (!lid && m.isMesh && /carbon_hood/.test(m.name) && /carbon_roof/.test(m.userData.mat)) lid = m; });
    if (lid) {
      g.updateMatrixWorld(true);
      const rc = new THREE.Raycaster(), down = V3(0, -1, 0).transformDirection(g.matrixWorld), hits = [], miss = [];
      const lb = g.worldToLocal(box(lid).getCenter(V3())), top = 3;
      // the lid's front middle, where the crest sat: scanned 1 cm apart
      const fz = (() => { let z1 = null; for (let z = lb.z; z < lb.z + 1.5; z += 0.01) { rc.set(g.localToWorld(V3(0.12, top, z)), down); if (rc.intersectObject(lid, false).length) z1 = z; } return z1; })();
      if (fz != null) {
        for (let z = fz - 0.22; z <= fz + 0.001; z += 0.01) for (let x = -0.1; x <= 0.1001; x += 0.01) {
          rc.set(g.localToWorld(V3(x, top, z)), down); const h = rc.intersectObject(lid, false)[0];
          if (h && h.uv) { const p = g.worldToLocal(h.point.clone()); hits.push([x, z, p.y, h.uv.x, h.uv.y]); } else if (z < fz - 0.02) miss.push([x, z]);
        }
      }
      if (miss.length && miss.length < 120 && hits.length > 40) {
        const mx = [Math.min(...miss.map((m) => m[0])) - 0.015, Math.max(...miss.map((m) => m[0])) + 0.015], mz = [Math.min(...miss.map((m) => m[1])) - 0.015, Math.max(...miss.map((m) => m[1])) + 0.015];
        const cx = (mx[0] + mx[1]) / 2, cz = (mz[0] + mz[1]) / 2;
        // a quadratic in x and z through the lid round the hole (least squares), for its height and each UV
        const near = hits.filter((h) => Math.abs(h[0] - cx) < 0.09 && Math.abs(h[1] - cz) < 0.09), terms = (x, z) => { x -= cx; z -= cz; return [1, x, z, x * x, x * z, z * z]; };
        const fit = (k) => {
          const A = Array.from({ length: 6 }, () => new Array(7).fill(0));
          for (const h of near) { const t = terms(h[0], h[1]); for (let i = 0; i < 6; i++) { for (let j = 0; j < 6; j++) A[i][j] += t[i] * t[j]; A[i][6] += t[i] * h[k]; } }
          for (let i = 0; i < 6; i++) A[i][i] += 1e-9;
          for (let c = 0; c < 6; c++) { let p = c; for (let r = c + 1; r < 6; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; for (let r = 0; r < 6; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let j = c; j < 7; j++) A[r][j] -= f * A[c][j]; } }
          const w = A.map((r, i) => r[6] / r[i]); return (x, z) => terms(x, z).reduce((s, t, i) => s + t * w[i], 0);
        };
        const fy = fit(2), fu = fit(3), fv = fit(4);
        const geo = new THREE.PlaneGeometry(mx[1] - mx[0], mz[1] - mz[0], 8, 8).rotateX(-Math.PI / 2), pos = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) + cx, z = pos.getZ(i) + cz; pos.setXYZ(i, x, fy(x, z) - 0.0015, z); uv.setXY(i, fu(x, z), fv(x, z)); }
        geo.computeVertexNormals();
        if ([...pos.array, ...uv.array].every(Number.isFinite)) { const cap = new THREE.Mesh(geo, X.carbon); cap.name = 'vantor-crest-cap'; cap.receiveShadow = true; g.add(cap); }
      }
    }
  }

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
    const fy = o.frontPlateY ?? 0.285, zf = skinZ(fy, -1);   // (its top clear of the bumper's lip)
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
