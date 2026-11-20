#!/bin/zsh
# it2: full rebuild form -> sim -> geometry -> hardware -> UV -> bake -> textures -> skin -> GLB
B=/Applications/Blender.app/Contents/MacOS/Blender
cd ${0:a:h}
for s in ${=FROM:-s10_form s20_sim} s30_geo s40_hw s50_uv s60_bake s61_tex s80_skin; do
  echo "== $s $(date +%T)"; $B -b --python $s.py 2>&1 | grep -E "^\[|done|teeth|shell|m per|leather|baked|Error|Trace|line [0-9]|jacket|collar|pushed|moved|posecap|posed fit|dump" | tail -8
done
node s90_glb.mjs
