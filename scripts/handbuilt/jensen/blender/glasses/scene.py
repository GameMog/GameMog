# shared: load Jensen's GLB (rest pose, old glasses faces removed), lights, world, cameras
import bpy, bmesh, math, mathutils, os
GLB=os.environ.get('JH_GLB', os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../../../storykit/handbuilt/jensen/jensen.glb'))
def load_head(glb=GLB):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    arm=bpy.data.objects['Armature']; arm.data.pose_position='REST'
    # make armature/mesh identity so mesh-local (= glTF bind space) is world space
    arm.parent=None; arm.matrix_world=mathutils.Matrix.Identity(4)
    o=bpy.data.objects['Mesh_0']
    for n in ('Icosphere',):
        if n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[n])
    mats=[m.name for m in o.data.materials]
    kill={mats.index(n) for n in ('glasses','lens-edges','lenses') if n in mats}
    bm=bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in kill], context='FACES')
    bm.to_mesh(o.data); bm.free()
    for ob in list(bpy.data.objects):
        if ob.type=='MESH' and ob.name in ('pack',): ob.hide_render=True
    return o
def world(strength=0.35, hdr='studio.exr'):
    w=bpy.data.worlds.new('w'); bpy.context.scene.world=w; w.use_nodes=True
    nt=w.node_tree; bg=nt.nodes['Background']
    import glob
    p=glob.glob('/Applications/Blender.app/Contents/Resources/*/datafiles/studiolights/world/'+hdr)[0]
    env=nt.nodes.new('ShaderNodeTexEnvironment'); env.image=bpy.data.images.load(p)
    mp=nt.nodes.new('ShaderNodeMapping'); tc=nt.nodes.new('ShaderNodeTexCoord')
    mp.inputs['Rotation'].default_value[2]=math.radians(200)
    nt.links.new(tc.outputs['Generated'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], env.inputs['Vector'])
    # lighting from the HDR, but the camera sees a dark backdrop
    lp=nt.nodes.new('ShaderNodeLightPath'); mix=nt.nodes.new('ShaderNodeMixShader'); dark=nt.nodes.new('ShaderNodeBackground')
    dark.inputs['Color'].default_value=(0.012,0.013,0.016,1); bg.inputs['Strength'].default_value=strength
    nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    out=nt.nodes['World Output']
    nt.links.new(bg.outputs[0], mix.inputs[1]); nt.links.new(dark.outputs[0], mix.inputs[2]); nt.links.new(lp.outputs['Is Camera Ray'], mix.inputs['Fac'])
    nt.links.new(mix.outputs[0], out.inputs['Surface'])
def area(name, loc, target, power, size, color=(1,1,1)):
    l=bpy.data.lights.new(name,'AREA'); l.energy=power; l.size=size; l.color=color
    ob=bpy.data.objects.new(name,l); bpy.context.collection.objects.link(ob); ob.location=loc
    d=mathutils.Vector(target)-mathutils.Vector(loc); ob.rotation_euler=d.to_track_quat('-Z','Y').to_euler(); return ob
EYE=mathutils.Vector((0,-0.129,1.625))
def lights():
    area('key',(-0.55,-0.75,1.95),EYE,55,0.6,(1,0.95,0.9))
    area('fill',(0.7,-0.6,1.65),EYE,14,0.9,(0.9,0.95,1))
    area('rim',(0.35,0.55,1.95),EYE,40,0.4,(0.9,0.95,1))
    area('rimL',(-0.45,0.5,1.8),EYE,25,0.4)
def camera(name, loc, target, lens=85):
    c=bpy.data.cameras.new(name); c.lens=lens; c.dof.use_dof=False
    ob=bpy.data.objects.new(name,c); bpy.context.collection.objects.link(ob); ob.location=loc
    d=mathutils.Vector(target)-mathutils.Vector(loc); ob.rotation_euler=d.to_track_quat('-Z','Y').to_euler(); return ob
def views():
    T=EYE+mathutils.Vector((0,0.03,-0.015))
    def at(az, el, dist, tgt, lens):
        a=math.radians(az); e=math.radians(el)
        loc=mathutils.Vector(tgt)+dist*mathutils.Vector((math.sin(a)*math.cos(e), -math.cos(a)*math.cos(e), math.sin(e)))
        return loc
    return {
      'front': (at(0,2,0.62,T,85),T,85),
      '34': (at(-38,4,0.62,T,85),T,85),
      'profile': (at(-90,2,0.62,T+mathutils.Vector((0,0.0,0)),85),T,85),
      'eyes': (at(-12,3,0.30,EYE+mathutils.Vector((0,0,0.004)),100),EYE+mathutils.Vector((0,0,0.004)),100),
    }
def render_setup(engine='CYCLES', samples=96, res=(1280,720)):
    s=bpy.context.scene; s.render.engine=engine; s.render.resolution_x, s.render.resolution_y = res
    s.render.image_settings.file_format='JPEG'; s.render.image_settings.quality=92
    s.view_settings.view_transform='AgX'; s.view_settings.look='AgX - Medium High Contrast' if 'AgX - Medium High Contrast' in [i.identifier for i in s.view_settings.bl_rna.properties['look'].enum_items] else 'None'
    if engine=='CYCLES':
        s.cycles.samples=samples; s.cycles.use_denoising=True; s.cycles.device='CPU'
        s.render.threads_mode='FIXED'; s.render.threads=6
        s.cycles.max_bounces=8; s.cycles.transparent_max_bounces=32; s.cycles.transmission_bounces=8
