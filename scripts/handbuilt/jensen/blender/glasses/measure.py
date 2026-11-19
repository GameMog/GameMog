import os
import bpy, bmesh, numpy as np
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.environ.get('JH_GLB', os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../../../storykit/handbuilt/jensen/jensen.glb')))
arm=bpy.data.objects['Armature']; arm.data.pose_position='REST'
o=bpy.data.objects['Mesh_0']; me=o.data
print("mw", [list(map(lambda v: round(v,4), r)) for r in o.matrix_world])
co=np.array([v.co[:] for v in me.vertices])
mats=[m.name for m in me.materials]
def verts_of(name):
    i=mats.index(name); s=set()
    for p in me.polygons:
        if p.material_index==i: s.update(p.vertices)
    return np.array(sorted(s))
ev=verts_of('eyes'); E=co[ev]
for side in (1,-1):
    P=E[E[:,0]*side>0]
    A=np.c_[2*P, np.ones(len(P))]; b=(P**2).sum(1); c=np.linalg.lstsq(A,b,rcond=None)[0]; r=np.sqrt(c[3]+c[:3]@c[:3])
    print("eye",side, np.round(c[:3],4), round(r,4), "front y", round(P[:,1].min(),4), "x range", round(P[:,0].min(),4), round(P[:,0].max(),4), "z range", round(P[:,2].min(),4), round(P[:,2].max(),4))
sv=verts_of('skin'); S=co[sv]
ez=E[:,2].mean(); ey=E[:,1].mean()
print("eye mean", round(E[:,0].mean(),4), round(ey,4), round(ez,4))
# profile along midline: forward-most skin (min y) per z near x=0
mid=S[np.abs(S[:,0])<0.003]
for z in np.arange(ez-0.05, ez+0.05, 0.005):
    q=mid[np.abs(mid[:,2]-z)<0.0025]
    if len(q): print("mid z %.4f  fronty %.4f"%(z, q[:,1].min()))
# head half width at eye height by y slices
band=S[np.abs(S[:,2]-ez)<0.006]
for y in np.arange(ey-0.02, ey+0.12, 0.01):
    q=band[np.abs(band[:,1]-y)<0.005]
    if len(q): print("eyeZ y %.3f halfW %.4f"%(y, np.abs(q[:,0]).max()))
# ear: skin verts with |x| largest per z/y region behind eyes
for z in np.arange(ez-0.06, ez+0.04, 0.01):
    q=S[(np.abs(S[:,2]-z)<0.005)&(S[:,1]>ey+0.03)&(S[:,1]<ey+0.15)]
    if len(q): k=np.argmax(np.abs(q[:,0])); print("z %.3f maxX %.4f at y %.4f"%(z,abs(q[k,0]),q[k,1]))
# nose side at various x near bridge: front y at eye z band for x offsets
for x in np.arange(0,0.03,0.003):
    q=S[(np.abs(S[:,0]-x)<0.0015)&(np.abs(S[:,2]-(ez+0.0))<0.003)]
    if len(q): print("eyeZ x %.3f fronty %.4f"%(x,q[:,1].min()))
for x in np.arange(0,0.03,0.003):
    q=S[(np.abs(S[:,0]-x)<0.0015)&(np.abs(S[:,2]-(ez-0.012))<0.003)]
    if len(q): print("eyeZ-12 x %.3f fronty %.4f"%(x,q[:,1].min()))
g=verts_of('glasses'); G=co[g]; print("old glasses bbox", np.round(G.min(0),4), np.round(G.max(0),4))
bv=verts_of('brows'); B=co[bv]; print("brows bbox", np.round(B.min(0),4), np.round(B.max(0),4))
h=verts_of('hair'); H=co[h]; print("hair bbox", np.round(H.min(0),4), np.round(H.max(0),4))
print("shapekeys",[k.name for k in me.shape_keys.key_blocks])
