# Jensen Heist: the black leather moto jacket (Blender part "jacket", 18 Nov 2026)

`jacket.glb` is a real garment built in Blender 5.3 on Jensen's own body and skinned to his forge rig. It has no
photo-derived textures and does not use the reference image's pixels.

## What is in the GLB

One node, `moto-jacket`, with one mesh of three primitives. Its skin is jensen.glb's skin, copied unchanged: the same 66
joints in the same order, the same inverse binds and the same node tree. JOINTS_0 indexes that joint list. Positions
are in his bind space (glTF Y-up, metres), the same space as the body in jensen.glb.

| primitive / material | tris | what |
|---|---|---|
| `leather` | 22,294 | Body shell, turned edges and facings, band collar, two snap tabs. Double-sided. 4096 normal map, 2048 base colour, 2048 ORM (R = AO, G = roughness, B = 0), all JPG. |
| `hardware` | 7,584 | Metal (metallic 1, roughness 0.26, nickel 0.56): the full-length centre-front zip (teeth, slider, pull, top and bottom stops), the chest zip pocket and two slanted hand-warmer zips (teeth, slider, pull each), and four snaps. |
| `zip-tape` | 764 | Black zip tape (roughness 0.8). |

The total is **30,642 triangles**. No tangents are stored: three.js derives them from the UVs, and the normal map is
in the glTF/OpenGL convention. Every material has the extras `{garment: 'leather-moto-jacket', kind: 'cloth', layer: 5, part}`.
gltf-validator reports 0 errors. The only warnings are "runtime tangents" and "skinned node not root"; the second also
appears on the original jensen.glb.

## How it was made (scripts here, run in order; `run_chain.sh` reruns s30 to s80)

1. `dump.mjs`, `fullbody2.py`: jensen.glb has the skin under the old jacket cut away, so I rebuilt his **full bind
   body**. I took the forge base body (`public/assets/human-athlete-male`, MakeHuman hm08), moved it to his bind
   through each joint's move, and spread the remaining difference harmonically from the 8.4k vertices still present
   in his GLB. The median error at those vertices is 6 mm.
2. `s10_form.py`: the fitted form. The body is smoothed and given 1.3 to 2 cm of ease. The torso is bridged to its
   hull so the leather hangs straight from the chest, the hem band is snug, and the sleeves are rounded. It is then
   voxel-remeshed and cut with clean planar edges at the hem (y 0.962), the cuffs (0.8 cm past the wrist) and a tilted
   neckline. Finally it is pushed at least 7 mm off the body.
3. `s20_sim.py`: **cloth sim** (leather settings, 36 frames, the body as collider), pinned softly at the yoke, the
   neckline and the sleeve caps.
4. `s30_geo.py`: elbow compression folds, stacking above the cuffs, folds at the small of the back, and padded
   oval shoulder panels. The centre front is cut open for the zip. Rolled leather edges with inside facings are added
   at the hem, fronts and cuffs. Then the **stand-up band collar** (rolled top, square front ends with rounded
   corners) and **two snap tabs**: tab A on the band at his right, tab B at the collar's foot on his left chest.
5. `s40_hw.py`: all the metal described above, modelled.
6. `s50_uv.py`: a decimate to budget, then the real pattern panels: fronts, back, front and back yokes, hem band,
   two-piece sleeves, cuffs, shoulder panels, collar, tabs and facings. These are UV seams, unwrapped into one atlas
   at about 0.35 mm per texel at 4K.
7. `s60_bake.py` + `s61_tex.py`: baked position, normal and panel maps, then every detail computed per texel in 3D:
   - grain from ambientCG Leather026 and Poly Haven leather_white (CC0), applied triplanar so it continues across
     panel seams
   - sewn seams (groove, seam-allowance ridge, topstitching with real dashes) on every panel line
   - quilted channels on the shoulder panels
   - welted pocket lips with a topstitched box around each
   - collar and tab edge-stitching and fine elbow creases
   - edge wear on ridges and edges, and roughness/sheen variation
8. `s80_skin.py`: **skinning**.
   - Weights are transferred from his body (nearest face, interpolated), lightly smoothed and capped at 4 influences.
   - **Neck band:** the collar and the jacket within about 4 cm of the neckline share one smooth weight set (the
     neckline's own, by angle round the neck), so they never part or cross. The collar's top adds up to 25% `neck01`
     so it hugs the neck.
   - Tab A takes the collar's weights, and tab B and all the metal take the nearest shell point's weights.
   - **Pose-cap**, as in the forge's post.mjs: the shoulder cap is rounded and the shoulder line given its slope in
     the runner's idle (Dan idle 1.2 s, armhang levelled), then carried back into the bind through each point's
     skinning matrix. The bind A-pose therefore has slightly soft shoulder tops. That is intended, and it is the same
     trade-off the forge makes.
9. `s85_pose.py`: pose tests with cast-clips.glb, bound by bone name as the runtime does (armhang levelled).
   **0 points of his still-visible skin poke through** in rest, walk, sitTalk, talk, argue and shrug.
10. `s90_glb.mjs`: writes the GLB. `s95_final.py`: the final renders.

`skin.blend` holds the rigged jacket (objects `leather`, `metal`, `tape` on armature `rig`, bones at his bind with
identity rest rotations). `tex/` holds the PNG texture masters.

## For the assembler

- **Swap:** remove the old jacket nodes `uniform`, `uniform-hem` and `uniform-collar` from jensen.glb, then add this
  mesh on a node that uses jensen.glb's skin. The joint order is identical, so JOINTS_0 can be copied as is. Keep the
  `neckline` crew piece (the tee), the `pack` (tee/jeans/shoes) and the body. The face morph targets are on the body
  primitives and are not touched; this file has no morphs.
- **Body cut-away:** the skin in jensen.glb was trimmed for the old jacket. My coverage is nearly the same:
  - hem at y 0.962 with the edge rolled under (old: 0.956)
  - sleeves to about 0.8 cm past the wrist joint
  - the collar zipped to the top
  
  I found no gaps in the renders. If the forge re-derives the hide list, use this jacket's shell.
- **moto.mjs / collar.mjs / tailorPass etc.:** these passes paint the old library jacket. Do not run them on this
  mesh, because they look for `uniform`/`suit-db` materials. The garment tag is still `leather-moto-jacket`, so
  Mog City's polish will treat it as leather.
- **Not yet in it:** cuff zips; a lining material (inside faces are leather, doubleSided). The bind-pose A-shape
  looks slightly dented at the shoulder tops because of the pose-cap; it is right in every arms-down clip.
- **Licences:** ambientCG Leather026 (CC0) and Poly Haven leather_white by Rob Tuytel (CC0). The geometry, pattern,
  stitching and hardware are original work. No CC-BY assets are used. Credits are also in the GLB's `asset.extras.jacket`.
