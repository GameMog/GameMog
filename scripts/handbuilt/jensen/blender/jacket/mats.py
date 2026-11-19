# materials for the jacket pieces (Blender preview; the GLB carries the same values)
import bpy, os
H = os.path.dirname(os.path.abspath(__file__))
# it2 hardware: the zips gunmetal (dark, slight specular), the snaps dull nickel (glTF linear base colour factors)
GUNMETAL, GUN_ROUGH = (0.15, 0.15, 0.16, 1), 0.36
NICKEL, NICKEL_ROUGH = (0.28, 0.27, 0.26, 1), 0.52
def leather_mat():
    m = bpy.data.materials.get('leather') or bpy.data.materials.new('leather'); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bs = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(bs.outputs[0], out.inputs[0])
    def tex(f, cs):
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(H + '/tex/' + f, check_existing=True); t.image.colorspace_settings.name = cs; return t
    bc = tex('leather_basecolor.png', 'sRGB'); nt.links.new(bc.outputs[0], bs.inputs['Base Color'])
    orm = tex('leather_orm.png', 'Non-Color'); sp = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(orm.outputs[0], sp.inputs[0]); nt.links.new(sp.outputs[1], bs.inputs['Roughness'])
    nm = tex('leather_normal.png', 'Non-Color'); nmn = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(nm.outputs[0], nmn.inputs[1]); nt.links.new(nmn.outputs[0], bs.inputs['Normal'])
    bs.inputs['Specular IOR Level'].default_value = 0.5
    return m
def metal_mat():
    m = bpy.data.materials.get('hardware') or bpy.data.materials.new('hardware'); m.use_nodes = True; bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = GUNMETAL; bs.inputs['Metallic'].default_value = 1.0; bs.inputs['Roughness'].default_value = GUN_ROUGH; return m
def snap_mat():
    m = bpy.data.materials.get('snaps') or bpy.data.materials.new('snaps'); m.use_nodes = True; bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = NICKEL; bs.inputs['Metallic'].default_value = 1.0; bs.inputs['Roughness'].default_value = NICKEL_ROUGH; return m
def tape_mat():
    m = bpy.data.materials.get('zip-tape') or bpy.data.materials.new('zip-tape'); m.use_nodes = True; bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (0.012, 0.012, 0.013, 1); bs.inputs['Roughness'].default_value = 0.8; return m
