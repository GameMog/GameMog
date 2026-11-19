# shared: import the GLB, a neutral studio rig, cameras on the head
import bpy, math
from mathutils import Vector
def load(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    for o in list(bpy.data.objects):
        if o.name.startswith('Icosphere'): bpy.data.objects.remove(o)
    return bpy.data.objects['Mesh_0']
def mat_verts(o,name):
    m=o.data; ei=[i for i,s in enumerate(m.materials) if s.name==name][0]
    ids=set()
    for p in m.polygons:
        if p.material_index==ei: ids.update(p.vertices)
    return sorted(ids)
FRAME=None
def eye_center(o):
    """evaluated (posed) eye midpoint; sets FRAME = (E, right, fwd, up) of the posed head"""
    global FRAME
    dg=bpy.context.evaluated_depsgraph_get(); me=o.evaluated_get(dg).to_mesh()
    ids=mat_verts(o,'eyes'); mw=o.matrix_world
    L=[i for i in ids if o.data.vertices[i].co.x>0]; R=[i for i in ids if o.data.vertices[i].co.x<0]
    cl=mw@(sum((me.vertices[i].co for i in L),Vector())/len(L)); cr=mw@(sum((me.vertices[i].co for i in R),Vector())/len(R))
    E=(cl+cr)/2; right=(cl-cr).normalized()
    up=Vector((0,0,1)); fwd=right.cross(up).normalized()
    up=fwd.cross(right).normalized()
    FRAME=(E,right,fwd,up)
    return E
def studio(engine='EEVEE', res=(1280,720), bg=(0.035,0.035,0.04)):
    sc=bpy.context.scene
    sc.render.engine='BLENDER_EEVEE' if engine=='EEVEE' else 'CYCLES'
    if engine!='EEVEE':
        sc.cycles.samples=96; sc.cycles.use_denoising=True; sc.cycles.device='CPU'
        try: sc.cycles.threads_mode='FIXED'; sc.render.threads=6
        except: pass
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.image_settings.file_format='JPEG'; sc.render.image_settings.quality=92
    sc.view_settings.view_transform='AgX'; sc.view_settings.look='None'
    w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True
    bgn=w.node_tree.nodes['Background']; bgn.inputs[0].default_value=(*bg,1); bgn.inputs[1].default_value=1.0
    def light(name, typ, loc, energy, size, col=(1,1,1)):
        L=bpy.data.lights.new(name, typ); L.energy=energy; L.color=col
        if typ=='AREA': L.size=size
        ob=bpy.data.objects.new(name,L); sc.collection.objects.link(ob); ob.location=loc
        return ob
    return light
def aim(ob, target):
    d=Vector(target)-ob.location; ob.rotation_euler=d.to_track_quat('-Z','Y').to_euler()
def rig(light, E):
    # key high front-left (his right), warm; fill soft; rim from behind; like a keynote stage key
    _,R,F,U=FRAME
    V=lambda a,b,c: R*a-F*b+U*c
    k=light('key','AREA',E+V(0.55,-0.75,0.45),55,0.6,(1,0.96,0.9)); aim(k,E)
    f=light('fill','AREA',E+V(-0.8,-0.6,0.05),14,1.0,(0.9,0.94,1)); aim(f,E)
    r=light('rim','AREA',E+V(-0.35,0.7,0.35),45,0.5,(0.95,0.97,1)); aim(r,E)
    r2=light('rim2','AREA',E+V(0.5,0.6,0.2),25,0.5); aim(r2,E)
def camera(E, view='front', lens=85, dist=0.62, dz=-0.03, side=1):
    sc=bpy.context.scene
    if 'cam' in bpy.data.objects: cam=bpy.data.objects['cam']
    else:
        cd=bpy.data.cameras.new('cam'); cam=bpy.data.objects.new('cam',cd); sc.collection.objects.link(cam); sc.camera=cam
    cam.data.lens=lens
    ang={'front':0,'34':35,'profile':90,'webcam':8}[view]*side
    a=math.radians(ang); E0,R,F,U=FRAME; tgt=E-F*0.03+U*dz
    up={'webcam':0.06}.get(view,0.0)
    cam.location=tgt+R*(math.sin(a)*dist)+F*(math.cos(a)*dist)+U*up
    aim(cam,tgt); cam.data.dof.use_dof=False
    return cam
def apply_maps(d):
    """swap the skin material's albedo / metallicRoughness / normal for the baked ones in folder d (if present)"""
    import os
    nodes = list(bpy.data.materials['skin'].node_tree.nodes) + list(bpy.data.materials['eyes'].node_tree.nodes)
    for n in nodes:
        if n.type != 'TEX_IMAGE': continue
        f = {'Image_0': 'skin-albedo.png', 'Image_6': 'skin-mr.png', 'skin-normal': 'skin-normal.png', 'Image_1': 'eyes-albedo.png'}.get(n.image.name)
        if f and os.path.exists(os.path.join(d, f)):
            cs = n.image.colorspace_settings.name; im = bpy.data.images.load(os.path.join(d, f)); im.colorspace_settings.name = cs; n.image = im
            print('MAP', f)
