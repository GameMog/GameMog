// Mog City: the gallery's art slots, how a work is framed, lit and shown at the size the camera needs.
//
// Parts of this file are adapted from oncyber (https://github.com/oncyberio/oncyber), MIT License:
//   Copyright (c) 2021-2026 Oncyber
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
//   documentation files (the "Software"), to deal in the Software without restriction, including without limitation
//   the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
//   permit persons to whom the Software is furnished to do so, subject to the following conditions:
//   The above copyright notice and this permission notice shall be included in all copies or substantial portions of
//   the Software.
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
//   THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
//   TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//   SOFTWARE.
// What is adapted (code only; no oncyber model, avatar, texture, font or other asset is used):
//   borderBox()   the frame's size round a work: BORDER_SIZE and the height's border scaled by the work's aspect, so the
//                 frame reads the same width on all four sides (frontend/components/_3DExhibit-v2/three/factory/border/
//                 index.js, and SpaceArtwork.setBorder in .../factory/artwork/abstract.js)
//   lodDistances() the near/far switch: the full-size picture within 20 m (oncyber's MAX_HI_IMAGE_DISTANCE_SQ), grown
//                 with the work's area, let go past twice that (its UNLOAD = LOAD x 4, squared) (.../factory/artwork/
//                 LODmesh/LODmesh.js computeLoadHiDistanceSq, lodTarget)
//   imageTexture() a picture's texture: sRGB, mipmapped, linear filtering (.../LODmesh/materials/imagematerial.js)
// Everything else here (the gilt moulding, the mat, the cartouche, the wall wash, the slot API) is Mog City's own.
//
//   const S = artSlot(THREE, { w, h, draw, near, far, gilt, matte, badge })   a framed work: S.group (the frame, the
//          mat, the picture, the cartouche), S.mat (its picture's material), S.lod(distance, may) each frame (true when
//          it drew its full-size copy: one a frame, the caller's budget), S.setImage(img) to show another picture in it
//          (a real work fetched at runtime, wagmi/gallery/tokens.js: scaled down in memory to MAX_SIDE on its long side),
//          S.original() to go back to ours, S.setBadge(texture) the cartouche's enamel (the frame's, not the
//          picture's: whatever hangs in it, the mark stays)
import * as THREE_NS from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fitSize, MAX_SIDE } from './tokens.js';

export const BORDER_SIZE = 0.05;               // (oncyber factory/border BORDER_SIZE)
export const HI_DIST = 20;                     // (oncyber MAX_HI_IMAGE_DISTANCE_SQ = 20 ** 2)

// the frame's outer size round a w x h work: the same border on all four sides (oncyber's borderSizeWidth/Height)
export function borderBox(w, h, border = BORDER_SIZE) {
  return { w: w * (1 + border), h: h * (1 + border / (h / w)) };
}
// the distances (m) the picture goes to full size within, and back to its small copy past (oncyber's LODMesh)
export function lodDistances(w, h, scale = 1) {
  const area = Math.max(w * h) || 1;
  const load = HI_DIST * Math.max(1, (scale * area) / 5);
  return { load, unload: load * 2 };
}
// a texture of a picture (canvas or image): sRGB, mipmaps (oncyber ImageMaterial)
export function imageTexture(THREE, img) {
  const t = img instanceof HTMLCanvasElement ? new THREE.CanvasTexture(img) : new THREE.Texture(img);
  t.colorSpace = THREE.SRGBColorSpace; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };

// the gilt moulding as one geometry: four mitred rails (a box each, bevel faked by a second, thinner, inner step) and
// the dark mat inside it, all merged into the frame's own two meshes
function moulding(THREE, w, h, gilt, mat, depth = 0.09) {
  const g = new THREE.Group();
  const outer = borderBox(w, h, 0.11), inner = borderBox(w, h, 0.05);
  const parts = [];
  const rail = (x, y, rw, rh, d, z) => parts.push(new THREE.BoxGeometry(rw, rh, d).translate(x, y, z));
  const tw = (outer.w - inner.w) / 2, th = (outer.h - inner.h) / 2;
  for (const s of [-1, 1]) {
    rail(0, s * (outer.h - th) / 2, outer.w, th, depth, depth / 2);
    rail(s * (outer.w - tw) / 2, 0, tw, inner.h, depth, depth / 2);
    // (the inner step, a little lower: the moulding's profile)
    rail(0, s * (inner.h + 0.018) / 2, inner.w + 0.036, 0.018, depth * 0.6, depth * 0.3);
    rail(s * (inner.w + 0.018) / 2, 0, 0.018, inner.h, depth * 0.6, depth * 0.3);
  }
  g.add(new THREE.Mesh(mergeGeometries(parts), gilt)); for (const p of parts) p.dispose();
  // (the mat: a dark linen band between the moulding and the picture)
  const m = new THREE.Mesh(new THREE.PlaneGeometry(inner.w, inner.h), mat); m.position.z = 0.004; g.add(m);
  return { group: g, outer };
}

// a picture no bigger than MAX_SIDE on its long side (a canvas of it, in memory), or the picture itself
function fitted(img) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, f = fitSize(iw, ih, MAX_SIDE);
  if (f.w === iw && f.h === ih) return img;
  const [c, x] = canvas(f.w, f.h); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, f.w, f.h);
  return c;
}

export function artSlot(THREE = THREE_NS, { w, h, draw, near = [768, 960], far = [192, 240], gilt, matte, badge = null }) {
  const [fc, fx] = canvas(far[0], far[1]); draw(fx, fc.width, fc.height);
  const farTex = imageTexture(THREE, fc);
  // (the picture unlit, a touch over white: lit by its wall wash in paint, as the pavilion's works are)
  const mat = new THREE.MeshBasicMaterial({ map: farTex, color: new THREE.Color(1.06, 1.06, 1.06) });
  const group = new THREE.Group();
  const fr = moulding(THREE, w, h, gilt, matte);
  group.add(fr.group);
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); pic.position.z = 0.01; group.add(pic);
  // the cartouche: an oval enamel crowning the top rail, in a gilt rim (the frame's own: a real work hung in it keeps
  // it; on top, so his own head never hides it from the camera behind him)
  let badgeMesh = null;
  if (badge) {
    const bw = badge.w || 0.3, bh = badge.h || 0.24, by = fr.outer.h / 2 + (badge.lift ?? 0.04);
    const rim = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32).scale(bw * 1.22, bh * 1.22, 1), gilt); rim.position.set(0, by, 0.1); group.add(rim);
    badgeMesh = new THREE.Mesh(new THREE.CircleGeometry(0.5, 32).scale(bw, bh, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(badge.k ?? 0.86, badge.k ?? 0.86, badge.k ?? 0.86) }));
    badgeMesh.position.set(0, by, 0.106); group.add(badgeMesh);
  }
  const { load, unload } = lodDistances(w, h);
  // (its full-size copy drawn a little before it is needed, so walking up to it never waits on the drawing)
  const warm = load * 1.5;
  let nearTex = null, ext = null, extTex = null;
  const S = {
    group, mat, pic, outer: fr.outer, w, h, at: new THREE.Vector3(), badge: badgeMesh,
    // (the camera's distance: the full-size copy made within `warm` when `may` (the caller's one-a-frame budget), shown
    // from then on, let go past `unload`); true when it drew
    lod(d, may = true) {
      if (ext) return false;
      if (d < warm && !nearTex && may) { const [c, x] = canvas(near[0], near[1]); draw(x, near[0], near[1]); nearTex = imageTexture(THREE, c); mat.map = nearTex; mat.needsUpdate = true; return true; }
      else if (d > unload && nearTex) { mat.map = farTex; mat.needsUpdate = true; nearTex.dispose(); nearTex = null; }
      return false;
    },
    get warm() { return !!nearTex; },
    setBadge(t) { if (!badgeMesh) return; badgeMesh.material.map = t; badgeMesh.material.needsUpdate = true; },
    // another picture in this frame (a real work fetched at runtime): scaled down to MAX_SIDE (in memory), fitted inside
    // the frame's opening at its own aspect, the mat showing round it; never stored anywhere but this texture
    setImage(img0) {
      const img = fitted(img0);
      ext = img; extTex?.dispose(); extTex = imageTexture(THREE, img);
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, k = Math.min(w / iw, h / ih);
      pic.scale.set((iw * k) / w, (ih * k) / h, 1);
      mat.map = extTex; mat.needsUpdate = true;
    },
    original() { if (!ext) return; ext = null; extTex?.dispose(); extTex = null; pic.scale.set(1, 1, 1); mat.map = nearTex || farTex; mat.needsUpdate = true; },
    get external() { return !!ext; },
    dispose() { farTex.dispose(); nearTex?.dispose(); extTex?.dispose(); mat.dispose(); badgeMesh?.material.dispose(); group.traverse((o) => o.geometry?.dispose()); },
  };
  return S;
}

// a soft pool of light on the wall round a work, as from a ceiling spot (one additive plane: no light of its own)
export function wallWash(THREE, w, h, color = 'rgba(255,214,160,0.55)') {
  const [c, x] = canvas(128, 128);
  const g = x.createRadialGradient(64, 40, 4, 64, 64, 64); g.addColorStop(0, color); g.addColorStop(0.55, color.replace(/[\d.]+\)$/, '0.22)')); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.renderOrder = 2;
  return m;
}
