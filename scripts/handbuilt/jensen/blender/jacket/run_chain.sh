#!/bin/zsh
# rebuild geometry -> hardware -> UV -> bake -> textures
B=/Applications/Blender.app/Contents/MacOS/Blender
cd ${0:a:h}
for s in s30_geo s40_hw s50_uv s60_bake s61_tex s80_skin; do
  echo "== $s"; $B -b --python $s.py 2>&1 | grep -E "^\[|done|teeth|shell|m per|leather|baked|Error|Trace|line [0-9]" | tail -5
done
