// Mog City story runner: a video call's picture (vcall.js lays the call out, sets.js holds the offices). Every
// participant's office is drawn through its own webcam (the set's own lens, sets.js S.cam, framed on them) into a
// texture of its own, the size of their tile on the screen; then the tiles are put together on one frame, in place of
// the city's, each with its rounded corners, and that frame goes through the city's own passes (the same exposure,
// grade, filmic tone and bloom as the street: a lamp in an office glows). A tile can be:
//   frozen   its texture not drawn again: the picture holds (a frozen feed), the rest of the call goes on
//   blur     the background blurred behind them: the office drawn without them, small, and spread as it is laid
//            under them; then they are drawn alone over it (their room's light still on them)
//   dim      the tile drawn dark (someone not there yet, or gone: the call's UI says so over it)
// Webcam pace: with more than two tiles, the ones not talking are drawn every other frame (a call's 30 frames a
// second), the one talking every frame.
//   const G = createGrid(W);  G.set(tiles | null, { bg })  G.draw(sets, { direct, render0, args })  G.dispose()
//   tiles: [{ id (the set), rect: [x, y, w, h] css px of the canvas, cam: { pos, look, fov }, frozen, blur, dim, live }]
import * as THREE from 'three/webgpu';
import { texture, uv, uniform, vec2, vec3, vec4, float, abs, max, min, length, smoothstep, mix, Fn, positionGeometry } from 'three/tsl';
import { feedClip, rtSize, rtKeep } from './vcall-plan.js';

const BLUR_DIV = 4;
// (the car screen's picture: at most this many px wide)
const FEED_MAX = 720;

export function createGrid(W) {
  const app = W.app, renderer = app.renderer;
  let tiles = null, feedOn = null, frameNo = 0, bgColor = new THREE.Color('#0E1014');
  const comp = new THREE.Scene(); comp.name = 'storyrun-vcall';
  comp.background = bgColor;
  const ortho = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);
  const R = new Map(); // id -> { fg, bg, mesh, U, drawn }
  let warmRT = null;
  const _c = new THREE.Color();
  // (a feed's quad put off the screen for a render by any camera but the city's own: a reflection's or a mirror's)
  const OFF = new THREE.Vector2(9, 9);
  // (read the right way up on both backends: on WebGL 2 the tiles were drawn upside down, 19 Nov, a no-WebGPU browser's
  // After the Show with Nico and Jensen on their heads; the render target reads top down through uv() on both)
  const flipY = true;

  function rtOf(id, { alpha = false } = {}) {
    let r = R.get(id);
    if (r) return r;
    const opt = { type: THREE.HalfFloatType, samples: 4 };
    const fg = new THREE.RenderTarget(16, 16, opt), bg = new THREE.RenderTarget(8, 8, { type: THREE.HalfFloatType });
    fg.texture.colorSpace = THREE.LinearSRGBColorSpace; bg.texture.colorSpace = THREE.LinearSRGBColorSpace;
    bg.texture.minFilter = bg.texture.magFilter = THREE.LinearFilter;
    const U = { size: uniform(new THREE.Vector2(16, 16)), rad: uniform(10), blur: uniform(0), dim: uniform(0), px: uniform(new THREE.Vector2(1 / 8, 1 / 8)), back: uniform(new THREE.Color('#0E1014')),
      cc: uniform(new THREE.Vector2(9, 9)), cs: uniform(new THREE.Vector2(0, 0)) };
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.colorNode = Fn(() => {
      // (a render target is read top down here, on WebGPU and on WebGL 2 alike: read it the right way up)
      const u0 = uv(), u = flipY ? vec2(u0.x, float(1).sub(u0.y)) : u0;
      const f = texture(fg.texture, u);
      // (the office behind them, spread: two rings of taps round the middle of the small picture, wide and soft)
      const p = U.px.mul(1.5);
      let b = texture(bg.texture, u).rgb.mul(0.12);
      const ring = (r, k) => { for (let a = 0; a < 8; a++) { const t = (a / 8) * Math.PI * 2 + r; b = b.add(texture(bg.texture, u.add(vec2(Math.cos(t), Math.sin(t)).mul(p).mul(r))).rgb.mul(k)); } };
      ring(1, 0.055); ring(2.2, 0.055);
      const col = mix(f.rgb, mix(b, f.rgb, f.a), U.blur).mul(float(1).sub(U.dim.mul(0.85)));
      // (the tile's rounded corners, a pixel's soft edge)
      const q = abs(u0.sub(0.5).mul(U.size)).sub(U.size.mul(0.5).sub(U.rad));
      const d = length(max(q, vec2(0, 0))).add(min(max(q.x, q.y), float(0))).sub(U.rad);
      const m = smoothstep(float(0.75), float(-0.75), d);
      return alpha ? vec4(col, m) : vec4(mix(vec3(U.back), col, m), 1);
    })();
    mat.toneMapped = true; mat.depthTest = false; mat.depthWrite = false; if (alpha) mat.transparent = true;
    // (a car-screen feed (alpha) is placed in clip space, where its rect is on the screen (feedClip): not a quad put in
    // the world in front of the lens, which was where the lens had been when the feed was drawn. A camera moved after
    // that, in the frame's own render (an in-cabin or side view, 19 Nov), left the quad behind it: the tile showed the
    // street, the car's panels or the driver through it, not the caller)
    if (alpha) mat.vertexNode = vec4(positionGeometry.xy.mul(U.cs).add(U.cc), float(0), float(1));
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); mesh.frustumCulled = false; if (alpha) mesh.renderOrder = 9999; else comp.add(mesh);
    r = { fg, bg, mesh, U, drawn: false, w: 0, h: 0, cc: new THREE.Vector2(9, 9) };
    if (alpha) {
      // (never hit by a ray cast into the city: it is on the screen, not anywhere in the street)
      mesh.raycast = () => {};
      // (only the city's own camera shows it, whichever view it is in; any other lens drawing the city's scene has it off
      // the screen)
      const rr = r;
      mesh.onBeforeRender = (_r, _s, camera) => { const main = camera === app.cameraSystem?.camera || camera === app.postFX?.scenePass?.camera; rr.U.cc.value.copy(main ? rr.cc : OFF); };
    }
    R.set(id, r);
    return r;
  }

  // (a tile at the city's own pixel ratio, its width at most 1600 px; the car screen's small picture at the screen's
  // own (devicePixelRatio, at most 2, never under its css size), FEED_MAX px wide at most: at the city's ratio (the
  // render scale a slower machine drops to, 0.6-0.75) its 320 x 180 css px were drawn from about 200 x 112 and the faces
  // smeared, the cast critic, 20 Nov. Drawn every other frame, as before)
  function size(r, w, h, feed = false) {
    // (a call's tile: its target kept through a re-layout while it is near the size it needs, rtKeep)
    const [pw, ph] = feed ? rtSize(w, h, Math.max(1, globalThis.devicePixelRatio || 1), FEED_MAX) : rtKeep([r.w, r.h], rtSize(w, h, renderer.getPixelRatio?.() || 1, 1600));
    if (r.w !== pw || r.h !== ph) {
      r.fg.setSize(pw, ph); r.bg.setSize(Math.max(8, Math.round(pw / BLUR_DIV)), Math.max(8, Math.round(ph / BLUR_DIV)));
      r.w = pw; r.h = ph; r.drawn = false;
      r.U.px.value.set(1 / r.bg.width, 1 / r.bg.height);
    }
  }

  function shoot(S, t, r) {
    const c = t.cam, cam = S.cam;
    cam.position.set(c.pos[0], c.pos[1], c.pos[2]); cam.up.set(0, 1, 0); cam.lookAt(c.look[0], c.look[1], c.look[2]);
    const asp = t.rect[2] / Math.max(1, t.rect[3]);
    if (cam.fov !== c.fov || Math.abs(cam.aspect - asp) > 1e-4) { cam.fov = c.fov; cam.aspect = asp; cam.updateProjectionMatrix(); }
    S.inGrid = true; S.fcam = c; S.update();
    if (t.blur) {
      // (the office alone, small: the people put out of it a moment)
      const hid = [];
      for (const P of S.people.values()) { if (P.fig?.root?.visible) { P.fig.root.visible = false; hid.push(P.fig.root); } if (P.blob?.visible) { P.blob.visible = false; hid.push(P.blob); } }
      renderer.setRenderTarget(r.bg); renderer.render(S.scene, cam);
      for (const o of hid) o.visible = true;
      // (then them alone, over nothing: the room's light kept on them)
      const g = S.K?.group, bg0 = S.scene.background, ca = renderer.getClearAlpha(); renderer.getClearColor(_c);
      if (g) g.visible = false; S.scene.background = null; renderer.setClearColor(0x000000, 0);
      try { renderer.setRenderTarget(r.fg); renderer.render(S.scene, cam); }
      finally { if (g) g.visible = true; S.scene.background = bg0; renderer.setClearColor(_c, ca); }
    } else { renderer.setRenderTarget(r.fg); renderer.render(S.scene, cam); }
    r.drawn = true;
  }

  const G = {
    get on() { return !!tiles; },
    set(list, { bg = null } = {}) {
      tiles = list && list.length ? list : null;
      if (bg) { bgColor.set(bg); }
      for (const [id, r] of R) r.mesh.visible = !!tiles && tiles.some((t) => t.id === id && !t.hidden);
    },
    draw(sets, { direct, render0, args }) {
      frameNo++;
      const cv = renderer.domElement, W0 = cv.clientWidth || innerWidth, H0 = cv.clientHeight || innerHeight;
      ortho.left = 0; ortho.right = W0; ortho.top = 0; ortho.bottom = -H0; ortho.updateProjectionMatrix();
      const many = tiles.filter((t) => !t.under).length > 2;
      for (const t of tiles) {
        const S = sets.get(t.id); if (!S || t.hidden) continue;
        const r = rtOf(t.id), [x, y, w, h] = t.rect;
        size(r, w, h);
        r.mesh.visible = true; r.mesh.renderOrder = t.under ? -1 : 0; r.mesh.position.set(x + w / 2, -(y + h / 2), 0); r.mesh.scale.set(w, h, 1);
        r.U.size.value.set(w, h); r.U.rad.value = t.radius ?? 10; r.U.blur.value = t.blur ? 1 : 0; r.U.dim.value = t.dim ? 1 : 0; r.U.back.value.copy(bgColor);
        // (the picture held while frozen; the ones not talking at half pace on a big call)
        const due = !r.drawn || (!t.frozen && (!many || t.live || (frameNo + (t.slot || 0)) % 2 === 0));
        if (due && !t.dim) shoot(S, t, r);
        else if (!r.drawn) { renderer.setRenderTarget(r.fg); renderer.clear(); r.drawn = true; }
      }
      for (const [id, r] of R) if (!tiles.some((t) => t.id === id && !t.hidden)) r.mesh.visible = false;
      renderer.setRenderTarget(null);
      // (the call's frame through the city's passes, as a set's is (sets.js); else straight to the canvas)
      const sp = app.postFX?.scenePass;
      if (sp && !direct) {
        const ssr = app.postFX.ssrPass, s0 = sp.scene, c0 = sp.camera, i0 = ssr ? ssr.intensity.value : 0;
        sp.scene = comp; sp.camera = ortho; if (ssr) ssr.intensity.value = 0;
        try { return render0(...args); } finally { sp.scene = s0; sp.camera = c0; if (ssr) ssr.intensity.value = i0; }
      }
      renderer.render(comp, ortho);
    },
    // a call on the car's screen while he drives (a call step's `video`): one office through its webcam into a small
    // picture over the street, top right, its rounded corners; drawn before the city's frame, the picture a quad in the
    // city's scene placed in clip space where its rect is (so it goes through the city's own passes with the street, the
    // street keeps drawing, and it is there from every camera: chase, in the cabin, a side view)
    feed(f) {
      feedOn = f || null;
      if (!f) { const r = R.get('feed'); if (r) r.mesh.removeFromParent(); }
    },
    get feedOn() { return !!feedOn; },
    drawFeed(sets) {
      const f = feedOn, S = sets.get(f.id); if (!S) return;
      const r = rtOf('feed', { alpha: true }), [, , w, h] = f.rect;
      r.mesh.visible = true; size(r, w, h, true); r.U.size.value.set(w, h); r.U.rad.value = f.radius ?? 10; r.U.blur.value = f.blur ? 1 : 0; r.U.dim.value = 0;
      if ((frameNo++ & 1) === 0 || !r.drawn) shoot(S, { cam: f.cam, rect: f.rect, blur: f.blur }, r);
      renderer.setRenderTarget(null);
      // (where the rect is on the screen, in clip space: no lens's place, aim or field of view in it)
      const cv = renderer.domElement, W0 = cv.clientWidth || innerWidth, H0 = cv.clientHeight || innerHeight;
      const c = feedClip(f.rect, W0, H0);
      r.cc.set(c.cx, c.cy); r.U.cc.value.copy(r.cc); r.U.cs.value.set(c.sx, c.sy);
      if (r.mesh.parent !== app.scene) app.scene.add(r.mesh);
    },
    // (targets like a tile's, its picture and its blurred office, for a set's pipelines compiled ahead: sets.js prepare
    // { tile }; the format and samples are what a pipeline is built for, not the size)
    warmTargets() {
      if (!warmRT) warmRT = [new THREE.RenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 4 }), new THREE.RenderTarget(8, 8, { type: THREE.HalfFloatType })];
      return warmRT;
    },
    // (the picture a tile shows now, for a phone's or the car's screen: its texture)
    texture(id) { return R.get(id)?.fg.texture || null; },
    dispose() {
      for (const r of R.values()) { r.fg.dispose(); r.bg.dispose(); r.mesh.geometry.dispose(); r.mesh.material.dispose(); r.mesh.removeFromParent(); }
      if (warmRT) { for (const t of warmRT) t.dispose(); warmRT = null; }
      R.clear(); tiles = null;
    },
  };
  return G;
}
