# Jensen hair + brows (Blender groom -> game-ready cards)

All original work (procedural groom and an atlas baked from Blender hair curves); no third-party textures, photos or
scans, so nothing to credit. The owner reference was used by eye only.


## Iteration 2 (art director's fixes)
- **Silhouette:** the groom is now built in shells (`groom.py`, `params.json` classes inner/mid/outer/top/line). Each
  guide rises quickly to its shell's height, lies along that shell, then its tip tucks under the shell above (tuck 0.65
  over the last 35%). The silhouette is made of card bodies, not tips. The front rises 25-31 mm off the forehead's top
  (p90 24 mm, p99 31 mm) and rolls straight back over the crown (outward splay 0.1). The quiff region starts lower at
  the front (`region()`), so it lifts off the hairline instead of lying on the forehead.
- **Hairline:** about 10 mm lower (`front` 0.043, from 0.047, and the fringe tiles' roots now begin near the root, so
  the visible line drops more). Its edge wobbles irregularly (+-3 mm). A new **hairline strip** of short fine hairs
  (overlapping segments that conform to the skin, `cards.json` `hl`) runs along the front and temples. It is sparse at
  its lower edge and dense into the hair, so the line fades in over about 1 cm and no card roots show. Card roots taper
  to 25% width, and the hairCap now reaches within 7 mm of the hairline (was 25 mm).
- **Cards:** 2,340 wider soft clump cards (8-22 mm, was 5-13 mm), taper 0.25 (was 0.6), 4 shells + the line class.
  **75,296 tris** (was 82,880). The atlas is re-baked: 6 tile kinds (dense, medium, clump, soft, fringe, wisp). Strand
  lengths spread over each tile's top third and tips thin to a fraction of a pixel, so ends feather. Sides feather
  (beta 1.5-1.8), roots are staggered over ~11% of the tile and fade over 10%. **Alpha cut 0.35** (engine: coverage
  smoothstep 0.15-0.55 under MSAA).
- **Colour:** root-to-tip gradient in the atlas: root 0.072 linear (sRGB ~30%) to body 0.24 to tip 0.43 (sRGB ~70%),
  12% darker and 12% lighter strands (salt and pepper), and stronger depth darkening. COLOR_0 now also darkens each
  card toward its root (x0.5 at the scalp), the inner shells (x0.45), the sides (x0.7) and the hairline (x0.7), with a
  +-7% per-card variation. The roots read dark, the outside silver. The engine's Kajiya-Kay sheen gives the anisotropic
  highlight.
- **Brows:** about 20% lighter (body 0.08 linear, was 0.075 over a much denser, blockier coverage), finer individual
  hairs (1,500 + 300 strays, thinner radius), soft top and bottom edges (beta 2.2), and a band that thins toward the tail
  (geometry `browTail` 0.35 and the tile's own taper).

## Output
- `hair.glb`: Jensen's skeleton and skin (copied unchanged from `storykit/handbuilt/jensen/jensen.glb` at b14e97a7) plus three
  skinned meshes in his bind space. Every vertex is 100% on joint `head` (index 65), so the forge's 1.08 head scale and
  every pose carry them.
  - node `jensen-hair`, mesh `hair`:
    - primitive **hair**: 2,340 strand cards + the hairline strip, 63,505 verts, 75,296 tris. Material `hair`: MASK at 0.35, double-sided, base
      colour = `atlas/hair_basecolor.webp` (RGBA). Extras `{hairTone:'light', hairNormals:'volume'}`. NORMAL holds
      volume normals (85% toward the head of hair's volume). COLOR_0 is a per-card occlusion tint (inner layers 0.62,
      outer 1.0, sides x0.75).
    - primitive **hairCap**: an opaque under-shell, 434 tris, 0.4 to 3.5 mm off the scalp. It stops 7 mm behind the
      front hairline. Material `hairCap`, colour from COLOR_0 (dark root grey, 0.06 linear).
  - node `jensen-brows`, mesh `brows`: primitive **brows**: 2 conforming card layers per brow, 512 tris. Material `brows`:
    MASK at 0.3, `atlas/brows_basecolor.webp`. **It has all 33 face morph targets**, named and ordered as the skin's
    (mesh extras `targetNames`), carried from the skin under each brow vertex. face-baked.js drives them by name like the
    skin.
- `atlas/`: hair 2048x2048 (16 tiles of 256x1024 in 2 rows of 8; root at each tile's bottom, tip at its top) and brows
  1024x512 (2 tiles of 1024x256: dense base on top, sparse top layer below; brow head at u=0). Each has these maps:
  `_basecolor` (.png and .webp, sRGB + alpha), `_alpha`, `_depth` (1 = outermost strand), `_roottip` (0 root to 1 tip),
  `_id` (random per strand), `_normal` (tangent space: x along u, y toward the tip), and `_data_rt-id-depth-alpha.png`
  (the four packed as RGBA).
  Tile kinds (index = row*8 + col): 0-2 dense; 3-5 medium; 6-9 clump; 10, 11 fringe (roots staggered over the bottom
  30%, used by the line cards and the hairline strip); 12, 13 soft; 14, 15 wisp. The bottom 10% of every tile fades in.

## Pipeline (rerun in order)
1. `node decomp.mjs <jensen.glb> jensen-plain.glb`, then `Blender -b --python prep.py -- <dir>`. This imports his head and
   strips the old hair, hairCap and brows into `prep.blend`.
2. `Blender -b prep.blend --python groom.py -- <dir>`: the groom (`params.json`) -> `groom.npz` (guides in glTF space).
   It grows each guide over a scalp field (KD tree on the head skin) along a comb field: up and back off the front
   hairline, straight back over the top, back and slightly up at the sides, down at the back. It keeps a target
   standoff (32 mm front-top, 14 mm crown, 6 mm sides, 5 mm nape) and tucks the tips into the volume.
   `preview.py` renders it as real hair curves (Principled Hair).
3. `Blender -b --factory-startup --python atlas.py -- <dir>/tex hair|brows`: bakes the strand clumps in Cycles
   (ortho), one pass each. Then `node compose.mjs hair|brows <dir>/atlas` (colour ramp in `tone.json`).
4. `Blender -b prep.blend --python cards.py -- <dir> ""`: groom -> cards, cap and brows (`cards.json`) -> `meshes/*.bin`.
   Pass views to render them too.
5. `node build_glb.mjs <jensen.glb> hair.glb`. `final.py` renders the shipped glb on his head.

## For the assembler
- **Merging into jensen.glb:** drop the old `hair`, `hairCap` and `brows` primitives. They live in the body mesh, which
  shares one point set with the skin, so they must go before `addMorphs`, or remove them and their targets after. Then
  add the two meshes from hair.glb as their own skinned nodes on the same skin. Keep `hair` and `hairCap` in a mesh with
  no targets, and `brows` in its own mesh with its 33 targets. If you rebuild through build.mjs, skip the
  `strands` step and the forge brows. The brows are drawn by the `brows` material name.
- **Engine path (checked in Mog City's `wagmi/storyrun/polish.js`):** material `hair` with a texture -> `softCard`
  `HairMaterial` (alpha-to-coverage under MSAA on the texture alpha, eased +/-0.2 round the 0.35 cut, Kajiya-Kay sheen).
  `hairTone:'light'` gives the calmer silver mottle. `hairNormals:'volume'` stops `shapeHair` from re-bending these
  normals, but it still writes the flow tangent "away from the crown", which runs root-ward on the front cards; KK only
  shifts slightly. `brows` -> `softCard` (soft edge). `hairCap` is not a card (`CARD` regex), so it is drawn opaque.
  The engine ignores the normal and data maps (strands use geometric normals), so only the base colour is embedded. The
  data and normal maps are in `atlas/` for any future shader. The engine does not depth-sort: MASK + coverage, no
  blending, as before.
- **Scalp paint:** the skin texture's scalp paint (scalpPass) is light grey (~128) and has two unpainted UV-seam lines
  across the back of the head (pink lines in `wip/bald.jpg`). Through hair they show as orange streaks. Paint the seams
  and darken the scalp to a root grey of about sRGB 85-95 under the hair; the hairline cards fade into it. The cap
  covers all but the front 7 mm.
- **Brows on a blink:** the skin's own `eyeBlink*` targets move the brow skin by up to about 5 mm, so the brows move up to
  9.5 mm on a blink (the old forge brows moved 8 mm the same way). Lids under each brow vertex are ignored. If that
  reads as a brow drop, damp the eyeBlink rows of the brow targets (scale 0.4) in `build_glb.mjs`.
- **Size:** 7.1 MB with plain float accessors. Meshopt and quantise it like the rest of jensen.glb (it shrinks to about 2 MB).
  The old hair was 325k tris; this is 83k.
- **Not done:** no check in the live three.js engine yet. Run it in-game (cut-scene close-up and webcam) after merging. The
  cut-scene and webcam framing is where the old hair showed shards.
