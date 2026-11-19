# materials for the jacket pieces (Blender preview; the GLB carries the same values)
import bpy, os
H = os.path.dirname(os.path.abspath(__file__))
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
    bs.inputs['Base Color'].default_value = (0.56, 0.56, 0.58, 1); bs.inputs['Metallic'].default_value = 1.0; bs.inputs['Roughness'].default_value = 0.26; return m
def tape_mat():
    m = bpy.data.materials.get('zip-tape') or bpy.data.materials.new('zip-tape'); m.use_nodes = True; bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (0.012, 0.012, 0.013, 1); bs.inputs['Roughness'].default_value = 0.8; return m
