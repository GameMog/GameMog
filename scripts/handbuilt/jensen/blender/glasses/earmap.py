import os
import sys, bpy, numpy as np, mathutils
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import scene as S
from mathutils.bvhtree import BVHTree
o=S.load_head(); me=o.data; mats=[m.name for m in me.materials]; si=mats.index('skin')
V=[v.co.copy() for v in me.vertices]; F=[list(p.vertices) for p in me.polygons if p.material_index==si]
bvh=BVHTree.FromPolygons(V,F)
s=1
print("y\\z  " + " ".join("%6.3f"%z for z in np.arange(1.60,1.665,0.005)))
for y in np.arange(-0.10,0.02,0.01):
    row=[]
    for z in np.arange(1.60,1.665,0.005):
        hi=bvh.ray_cast(mathutils.Vector((0.0,y,z)),mathutils.Vector((1,0,0)))
        ho=bvh.ray_cast(mathutils.Vector((0.2,y,z)),mathutils.Vector((-1,0,0)))
        xi=hi[0].x if hi[0] else 0; xo=ho[0].x if ho[0] else 0
        row.append("%3.0f/%2.0f"%(xi*1000,(xo-xi)*1000))
    print("%6.3f "%y+" ".join(row))
