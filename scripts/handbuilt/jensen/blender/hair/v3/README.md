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
