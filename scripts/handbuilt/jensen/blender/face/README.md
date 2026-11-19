# Jensen face, the Blender track (part "face")

All of this is original work: procedural, sculpted by eye, with no photo input. The reference was only looked at, and
none of its pixels were used. Licence: CC0, so no credit line is needed.

## What is here

| Path | What |
|---|---|
| `head.glb` | The real Jensen pipeline output (`build.mjs` plus the face passes below, the recommended rest mouth "grin B"), 11.3 MB. It has the same 33 morph targets with the same names as the current `jensen.glb`. |
| `head-sculpt.target` | The head sculpt as a MakeHuman `.target`: base.obj vertex index, then dx dy dz in MakeHuman units. 3100 body vertices, peak 7.25 mm. |
| `maps/skin-albedo.png`, `maps/skin-mr.png`, `maps/skin-normal.png` | 4096 skin maps on the existing hm08 UV atlas. Albedo is a warm light tan with mottling, a little blood colour at the nose and cheeks, muted lips and darker pore and line cavities. The MR map is glTF: G = roughness (T-zone and lips shinier, pores drier), B = 0. The normal map is the build's own normal plus baked pores, micro relief and moderate fine lines (forehead, crow's feet, faint under-eye lines). Everything below the neck is the build's own map, upscaled. |
| `maps/eyes-albedo.png` | A new 1024 eye texture in the build's eye layout: dark warm-brown iris with radial fibres, a collarette and a soft limbal ring (the red rim is gone), a warm sclera with faint vessels. **The alpha channel is kept on purpose**: the cornea shell maps to the transparent corner square. |
| `node/face-pass.mjs` | The build passes: `sculptPass`, `mapsPass`, `mouthBagPass`, `teethRigidPass`. |
| `node/make-build.mjs` → `node/build-face.mjs` | Generates a copy of the worktree's `jensen/build.mjs` with absolute imports and the passes inserted, so the build can run from scratch without touching the worktree. |
| `src/sculpt.py` + `src/sculpt.json` | The sculpt: symmetric soft deformers on the SAME vertices (cheekbones broader and forward, temples, a cheek hollow, jowls removed, a tapered lower jaw, the chin 6 mm shorter and a little forward and broader, broader nose wings and tip, a wider mouth, lips and corners, a nasolabial cheek mass, the brow ridge). It writes the `.target`. |
| `src/bake.py` | The Cycles bake of the skin maps (about 4.5 min at 4096 on 6 threads). |
| `src/eyetex.py` | The eye texture generator. |
| `src/views.py`, `src/final.py`, `src/talk.py`, `src/scene.py`, `src/montage.py` | Preview and verification renders. |

## How to apply it in the build (ASSEMBLER)

1. Copy `node/face-pass.mjs` to `scripts/handbuilt/jensen/face-pass.mjs`. Its only import root is `JH_HANDBUILT`, which defaults to the jh-hero worktree's `scripts/handbuilt/`. In the repo, change it to `new URL('../', import.meta.url).pathname`.
2. Put `head-sculpt.target` and the `maps/` folder somewhere the build reads. The repo is public, so the files must be original/CC0 (they are). For example, use `storykit/handbuilt/jensen/face/` or the `.scratch` face folder.
3. In `build.mjs`, add these steps (this is exactly what `make-build.mjs` does):
   - `['sculpt', () => sculptPass(doc, FACEB + 'head-sculpt.target')]` right **after `'holes'`**. It must come before `scalp`, `strands`, `eyes` and `glasses`, because those regenerate the hair cap, the strand cards and the frames from the new skin surface. That is why hair and glasses fit in `head.glb`.
   - `['facemaps', () => mapsPass(doc, FACEB + 'maps/')]` right **after `'daylight'`**. It replaces the skin albedo, MR and normal and the eye base colour.
   - `['mouthbag', () => mouthBagPass(doc)]` after `facemaps` (any point **before `'morphs'`**, so that it gets zero targets).
   - `['teethrigid', () => teethRigidPass(doc)]` right **after `'morphs'`**.
4. Recommended rest mouth ("grin B", see `face-06`): it reads less smirky and is closer to the reference's parted lips:
   `JH_GRIN='[["jawOpen",0.07],["mouthSmileLeft",0.04],["mouthSmileRight",0.04],["browInnerUp",0.1],["browOuterUpLeft",0.18],["browOuterUpRight",0.18],["eyeWideLeft",0.14],["eyeWideRight",0.14]]'`
   You can also make this the default in the `grin` step. `head.glb` was built with it.
5. Build as usual: `source hb-env.sh; node scripts/handbuilt/jensen/build.mjs`. The scratch equivalent is `node node/build-face.mjs out.glb`, which takes about 35 s.

## Must know

- **Morphs survive.** The sculpt is a rest-shape bake through `facekit.bakeRest`: same points, same order, mapped by UV and not by index. `addMorphs` runs afterwards on the new shape. All 33 targets are present and were rendered from `head.glb`'s own shape keys (`face-04`). `viseme_sil` has no points, exactly as before.
- **Maps are frozen from the current build.** They were baked from today's `jensen.glb` textures, after the paint, age, scalp, daylight and scatter passes. If you change those passes (skin tone, scalp paint), re-bake: `blender -b --python src/bake.py -- <new jensen.glb> maps 4096`. To change the tone, edit the `hsv` and `graded` multiply in `bake.py`.
- `teecrew` runs after `facemaps` and paints the tee's crew neck onto the new albedo a second time. That is harmless (the same dark colour), but it is the reason `facemaps` sits before it.
- **The mouth fix is new.** Before it, an open mouth showed a tall grey wall of lower teeth with shards behind it. `facekit` carries each lower-teeth point by the nearby lip and chin skin, so the teeth stretched. `teethRigidPass` swings the lower teeth as one rigid piece about a jaw hinge, and `mouthBagPass` adds a dark oral cavity: an inward-facing, single-sided ellipsoid skinned like the upper teeth. **Still open:** small skin triangles at the inner lower-lip corners at full jawOpen 0.55. These are the MakeHuman lip mesh and they are already in `jensen.glb`. At the runtime cap (about 0.3 to 0.55, with visemes scaling the jaw to 0.5) they are minor.
- **Not done, to be honest about it:** the fine detail is a procedural height field baked through Cycles. It was not a hand multires sculpt, but the normal-map output is the same kind. The hm08 face gets about 860 px across at 4096, so pores read in close-ups (`face-05`) but not at webcam distance. I added no extra cornea mesh: the existing eye shell keeps its clearcoat and is wet in the renders. Brows and lashes are the build's own; the sculpt carries them. The face silhouette in 3/4 view shows some low-poly faceting at the far cheekbone, because the hm08 head is only about 3k vertices.
- **Size:** `head.glb` is 11.3 MB, against 10.5 MB for the current `jensen.glb`. The 4096 webps add about 1.6 MB. To save space, downscale the skin maps to 2048 in `mapsPass`; the pores mostly go, but the lines and tone stay.
- **Previews in Blender** render the imported rig as posed by the GLB. The cameras and lights follow the posed head's eye frame (`scene.eye_center`), and the head bone's scale of 1.08 is included.
