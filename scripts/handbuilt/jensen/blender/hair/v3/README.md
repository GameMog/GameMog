# v3 hair + brows (Jensen)
Pipeline (python = ../env/hair/bin/python, run from this folder):
  tools/groom.py [params.json]  -> work/groom.npz   guide strands over the scalp (bind space), hairline-stopped at back/nape
  tools/atlas.py                -> atlas/hair_*     32-tile strand atlas: basecolor(root dark->silver->light tip), alpha, depth, roottip, id, normal, packed data
  tools/cards.py                -> work/mesh/hair*  layered cards (inner/front/mid/outer/side/fly/line) + hairCap
  tools/brows.py atlas ; tools/brows.py  -> brow atlas + 2 conforming card layers carrying the face's 33 targets
  node tools/build.mjs work/jensen-test.glb work/f/jensen.glb full   (studio test)
  node tools/build.mjs work/jensen-test.glb hair.glb part             (assembler deliverable)
  ./shoot.sh <abs shots.json> <abs outdir>
Sources: no downloads; every texture is procedurally rasterised. The reference photo was only measured/looked at.

## 19 Nov rework (owner: "hair is NOT slicked back")
  ./run.sh <tag> [shots.json]  (ATLAS=1 to rebuild the atlas): groom -> cards -> studio build -> shots in work/<tag>
  params.json "tousle": coherent noise fields over the scalp (dir ~4.5 cm clumps turning together, fine ~1.4 cm wave,
  hgt: clumps standing at different heights so the top is not a smooth shell, flick: tips lifting per class); tuck 0.45->0.15.
  cards.json: twist raised moderately, tipW 0.3 (pointed card ends), lineTone 0.6 (hairline no white sprinkles).
  atlas.py: strand ends staggered (shorter strands toward the tile edges), stronger tip fade; tone.json root 0.45 / rootLen 0.3.
  The slick version is kept: tools/groom-slick.py, work/params-slick.json, work/atlas-slick/, work/hair-slick.glb.

## 19 Nov iteration 2 (art director score 4: "pale-grey wig puff")
  Rollback: work/it1/ (params, cards, tone, hairline, atlas, tools, hair.glb of iteration 1).
  Colour: tone.json silver 0.34->0.30, darkFrac 0.18->0.26 (pepper strands), tipLift 0.05, warm-grey tint; cards.py: a coherent
    salt-and-pepper field over the head (pepper 0.3, ~2.2 cm patches, smooth across cards, so no card outline shows; per-card
    tones were tried and showed every card as a block) + darker toward the hairline (lineDark 0.18).
  Shape: params.json H side 0.0055 / low 0.0032 / back 0.0095 / top 0.019, quiff 0.040 (peak at the front-top), L side 0.026;
    tip flick only over the top (tousle.flickTop) and none on the sides; flyaways top-only (fly topOnly 22 deg).
  Hairline: hairline.json temples raised (phi 30-52 deg: +3-5 deg), a little recession at the temples.
  Texture: atlas clumps fewer/larger with stronger pull; side twist 5, outer 14.
  Spec: hair material roughness 0.8 + KHR_materials_specular 0.5 (engine multiplies its own spec by this).
