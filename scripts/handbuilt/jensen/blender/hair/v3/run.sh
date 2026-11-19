#!/bin/zsh
# run.sh: the v3 (19 Nov, tousled) groom -> part file hair.glb (work/ and atlas/ are generated here, not committed)
#   env: PY (a Python with numpy/scipy/pillow), FORGE_TOOLBOX_DIR (gltf-transform),
#        JH_GLB (the body the groom is fitted on; default the shipped jensen.glb), ATLAS=1 rebuilds the strand atlas
#   then: node ../../parts.mjs --hair blender/hair/v3/hair.glb --fit <tag>=$JH_GLB --fitOf hair=<tag>
set -e; H=${0:a:h}; cd $H; P=${PY:-python3}; mkdir -p work
G=${JH_GLB:-$H/../../../../../../storykit/handbuilt/jensen/jensen.glb}
node tools/extract.mjs $G work/head
[ -n "$ATLAS" -o ! -d atlas ] && $P tools/atlas.py | tail -1
$P tools/groom.py params.json work/groom.npz | tail -3
$P tools/cards.py work/groom.npz work/mesh | tail -2
$P tools/brows.py atlas && $P tools/brows.py | tail -1
node tools/build.mjs $G hair.glb part | tail -1
