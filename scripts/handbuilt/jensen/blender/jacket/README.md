# Jensen Heist: the black leather moto jacket (Blender part "jacket", iteration 2, 19 Nov 2026)

`jacket.glb` is a real garment built in Blender 5.3 on Jensen's own body and skinned to his forge rig (jensen.glb's skin,
same 66 joints, order and inverse binds). No photo-derived textures; the reference photo was used by eye only.
Iteration 1 (scripts, GLB, textures) is kept in `it1/`.

## Iteration 2: what changed (art director's 7 fixes + owner notes)

1. **Flat front, no hump.** `common.flatten_front` sets the centre-line profile of the front to ONE plane from the chest
   to the hem band (glTF z 0.140 at the chest, 0.139 above the band, the band tucked 3 mm); the back likewise one plane (it2b), applied to the fitted form
   (s10) and again after the cloth sim (s30), spread round the front by cos(angle) so the cross-section keeps its shape.
   Measured bind profile (centre front, glTF z): 13.9-14.1 cm from the hem band to the chest (it1: 13.1-14.0, bulging
   at the belly). **Hem lowered 2.7 cm** (y 0.935, it1 0.962) so the 5 cm hem band overlaps the jeans' waistband; the band
   is pushed 4 mm clear of the jeans all round (jeans are now a collider in the sim and the form). See "Assembler" for
   the tee hem.
2. **Zipper**: narrow dark tape (about 8 mm visible: GAP 4 mm each side), 4 mm modelled gunmetal teeth at 1.5 mm pitch,
   small slider (12 mm) and 21 mm pull at the collar top, smaller stops. Material `hardware` is now gunmetal
   (base 0.15, metallic 1, roughness 0.36), not chrome.
3. **Snap tabs**: both on the band collar, one each side (it1 had one floating on the chest), 40 x 15 mm, two 8 mm snaps
   each, in a separate `snaps` primitive of dull nickel (base 0.28, roughness 0.52).
4. **Grain**: 3.6x finer (tile 15 cm to 4.2 cm; leather_white 6 cm to 3 cm), at about 40% of it1's normal strength, with
   the sources pre-filtered to the atlas texel so it does not alias. Broad geometric creases added under the arms
   (fanning from the armpit) and at the waist sides (never across the flat front), on top of the elbow and back-waist
   folds. Roughness: higher overall (0.54 mean), lower on high points (sheen), higher in creases, smaller patch variation.
5. **Shoulders**: bigger quilted panels over the shoulder top and down the upper arm (12.5 x 8.8 cm oval, channels every
   2 cm, 1.3 mm deep, stitched), the shoulder line 9 mm narrower per side (about 4%) and 2.6 cm of slope (it1 1.8),
   applied in the idle pose and carried back to the bind; the move field is smoothed so the cap does not crumple.
6. **Collar**: 15% lower (3.4 cm front / 4.0 cm back, it1 4.0 / 4.7) and a thin band (2.4 mm, it1 3.4) with an edge stitch.
7. **Stitching**: princess seams front and back (yoke to hem band, lapped, one row of topstitching) added to the yoke,
   side, armhole, sleeve and band seams; the thread is a lighter dark grey (linear 0.046, it1 0.020). The chest and hand
   zip pockets moved inboard so they clear the princess seams.

**Posture (owner note 2, Art of Manliness plumb line).** The clips are shared (`public/storykit/cast/cast-clips.glb`), so
I did not touch them in the worktree. `posture.py` solves a fix per clip; `s97_clips.mjs` writes a corrected copy:
`clips/cast-clips.posture.glb` (same file, only these rotation channels changed: idle, talk, phone, arms, sitTalk,
sit). The fix is a forward pitch spread over the spine (spine05..02 at 30/30/25/15%), a neck pitch to bring the ear
over the shoulder, and the head and upper arms counter-rotated so the gaze and the hanging arms are unchanged. Angles
and before/after plumb numbers are in `posture.json`. Along the hips' forward axis (cm):

| clip | spine | neck | shoulder vs hip before -> after | ear vs shoulder before -> after |
|---|---|---|---|---|
| idle | +4.8 deg | +10.4 deg | -3.2 -> +0.5 | -1.4 -> +1.5 |
| talk | +6.8 | -25.2 | -4.8 -> +0.5 | +5.8 -> +3.0 |
| phone | +6.6 | -25.2 | -4.6 -> +0.5 | +5.6 -> +2.8 |
| arms | +4.4 | -25.2 | -2.9 -> +0.5 | +5.8 -> +2.5 |
| sitTalk | -5.5 | -25.2 | +7.3 -> +3.0 (upright, not slumped) | +9.7 -> +4.5 |
| sit | -7.8 | -25.2 | +9.0 -> +3.0 | +9.6 -> +4.0 |

The neck hit its 25 degree limit on talk/phone/arms/sit, so those keep 2.5-4.5 cm of forward head; argue, shrug and
wave lean in on purpose and were left alone. In raw glTF z for idle at 1.2 s the left shoulder moved from 5.8 cm behind
the hip to 2.1 cm. The renders here use the fixed clips (`lib.py` loads `dump/clips_fixed.json` when present).

## What is in the GLB

One node, `moto-jacket`, one mesh of four primitives, 31,843 triangles, 5.8 MB:

| primitive / material | tris | what |
|---|---|---|
| `leather` | 22,331 | shell, turned edges and facings, band collar, two collar tabs. Double-sided. 4096 normal, 2048 base colour, 2048 ORM (R AO, G roughness). |
| `hardware` | 7,824 | gunmetal: centre-front zip (teeth, slider, pull, stops), chest and two hand-warmer zips |
| `zip-tape` | 800 | black tape (roughness 0.8) |
| `snaps` | 888 | four dull-nickel snaps on the collar tabs |

Every material has the extras `{garment: 'leather-moto-jacket', kind: 'cloth', layer: 5, part}`. gltf-validator: 0 errors,
2 warnings (runtime tangents; skinned node not root, also on jensen.glb).

## Pipeline (run in order; `run_all.sh` does s10 to s90, `FROM=" " ./run_all.sh` starts at s30)

s10 form (fitted, flat front, hem, jeans clearance) -> s20 cloth sim (leather, body + jeans colliders) -> s30
construction (flatten, band clear of jeans, creases, shoulder panels, zip opening, turned edges, collar, tabs) -> s40
hardware -> s50 pattern panels + UV atlas -> s60 bakes -> s61 textures -> s80 skinning (weight transfer, neck band,
shoulder round/slope/narrow in the idle) -> s90 GLB. s85 pose tests, s95 final renders, posture.py + s97 the clips.

## For the assembler

- **Swap:** remove `uniform`, `uniform-hem`, `uniform-collar` from jensen.glb; add this mesh on a node using jensen.glb's
  skin (JOINTS_0 copies as is). Keep `neckline`, `pack` and the body. Face morph targets are untouched (none here).
  The GLB now has a 4th primitive `snaps`; give it the same treatment as `hardware`.
- **Tee hem: hide it.** The tee (`pack` primitive with garment male_casualsuit06, layer 2, p13 in my dump) flares to
  glTF z 0.154 at y 0.975-1.01, in front of any flat jacket front. That flare was the black band under the it1 hem.
  It is fully covered by this jacket: delete its triangles whose vertices are all below y 1.05 (the renders here do
  exactly that). Do NOT push the jacket out over it, as that would bring the belly hump back.
- **Clips:** to get the posture fix, use `clips/cast-clips.posture.glb` in place of `public/storykit/cast/cast-clips.glb`
  (shared by the whole cast, which matches the owner's "every character" rule). Check the other cast members' idle
  in the game before shipping it.
- **Body cut-away:** coverage grew downward (hem 0.935, was 0.962), so no new gaps. Sleeves, collar unchanged in reach.
- **Pose tests:** `s85_pose.py` reports no poke-through in rest/walk/sitTalk/talk/argue/shrug, but jensen.glb has no
  visible skin left under the jacket to test, so that check is vacuous. The renders are the real check.
- **Do not** run moto.mjs / collar.mjs / tailor passes on this mesh.
- **Licences:** ambientCG Leather026 (CC0), Poly Haven leather_white by Rob Tuytel (CC0). Geometry, pattern, stitching
  and hardware are original. No CC-BY. Credits are in `asset.extras.jacket`.

## Known limits

- The back is now one plane too (`flatten_back`: glTF z -0.131 at y 1.30 to -0.121 at the band; it1 bulged to -0.136 at
  the lumbar). Seated (sitTalk) the back still rounds outward at the lower back from linear skinning as the spine bends;
  the webcam framing does not show it.
- A small bump remains at each shoulder point in the arms-down idle (the body's own square shoulder).
- No cuff zips; no lining material (inside faces are leather).

---

# Iteration 1 notes (kept for reference)

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
