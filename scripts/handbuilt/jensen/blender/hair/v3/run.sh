#!/bin/zsh
# run.sh <tag> [shots.json]: groom -> atlas -> cards -> studio build -> shots in work/<tag>
set -e; H=${0:a:h}; cd $H; P=${PY:-python3}; mkdir -p work
$P tools/groom.py params.json work/groom.npz | tail -3
[ -n "$ATLAS" ] && $P tools/atlas.py | tail -1
$P tools/cards.py work/groom.npz work/mesh | tail -2
node tools/build.mjs work/jensen-test.glb work/f/jensen.glb full | tail -1
./shoot.sh $H/${2:-shots-v.json} $H/work/$1 > work/$1.log 2>&1 || { tail -20 work/$1.log; exit 1; }
$P tools/sheet.py work/$1.jpg work/$1/jensen/*.jpg
