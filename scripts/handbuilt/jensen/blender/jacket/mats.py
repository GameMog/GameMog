# materials for the jacket pieces (Blender preview; the GLB carries the same values)
import bpy, os
H = os.path.dirname(os.path.abspath(__file__))
# it2 hardware: the zips gunmetal (dark, slight specular), the snaps dull nickel (glTF linear base colour factors)
GUNMETAL, GUN_ROUGH = (0.15, 0.15, 0.16, 1), 0.36
COAT, COAT_ROUGH, SPEC = 0.35, 0.28, 0.5
NICKEL, NICKEL_ROUGH = (0.17, 0.165, 0.16, 1), 0.48   # v3: duller, darker nickel (it3 read as chrome discs)
def leather_mat():
    m = bpy.data.materials.get('leather') or bpy.data.materials.new('leather'); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bs = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(bs.outputs[0], out.inputs[0])
    def tex(f, cs):
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(H + '/tex/' + f, check_existing=True); t.image.colorspace_settings.name = cs; return t
    bc = tex('leather_basecolor.png', 'sRGB'); nt.links.new(bc.outputs[0], bs.inputs['Base Color'])
    orm = tex('leather_orm.png', 'Non-Color'); sp = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(orm.outputs[0], sp.inputs[0]); nt.links.new(sp.outputs[1], bs.inputs['Roughness'])
    nm = tex('leather_normal.png', 'Non-Color'); nmn = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(nm.outputs[0], nmn.inputs[1]); nt.links.new(nmn.outputs[0], bs.inputs['Normal'])
    # it3: specular halved (glTF KHR_materials_specular 0.5) and a thin clearcoat on the grain's plateaus (KHR_materials_clearcoat
    # 0.35 x leather_coat, roughness 0.28): narrow dark-grey highlights instead of a broad tan wash
    bs.inputs['Specular IOR Level'].default_value = 0.25
    ct = tex('leather_coat.png', 'Non-Color'); mth = nt.nodes.new('ShaderNodeMath'); mth.operation = 'MULTIPLY'; mth.inputs[1].default_value = COAT
    nt.links.new(ct.outputs[0], mth.inputs[0]); nt.links.new(mth.outputs[0], bs.inputs['Coat Weight'])
    bs.inputs['Coat Roughness'].default_value = COAT_ROUGH; bs.inputs['Coat IOR'].default_value = 1.5
    nt.links.new(nmn.outputs[0], bs.inputs['Coat Normal'])
    return m
def metal_mat():
    m = bpy.data.materials.get('hardware') or bpy.data.materials.new('hardware'); m.use_nodes = True; bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = GUNMETAL; bs.inputs['Metallic'].default_value = 1.0; bs.inputs['Roughness'].default_value = GUN_ROUGH; return m
def snap_mat():
    m = bpy.data.materials.get('snaps') or bpy.data.materials.new('snaps'); m.use_nodes = True; bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = NICKEL; bs.inputs['Metallic'].default_value = 1.0; bs.inputs['Roughness'].default_value = NICKEL_ROUGH; return m
def tape_mat():
    # it3: the centre zip strip (tape + chain), textured: tex/zip_basecolor, zip_orm (R AO, G rough, B metal), zip_normal
    m = bpy.data.materials.get('zip-tape') or bpy.data.materials.new('zip-tape'); m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bs = nt.nodes.new('ShaderNodeBsdfPrincipled'); nt.links.new(bs.outputs[0], out.inputs[0])
    def tex(f, cs):
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(H + '/tex/' + f, check_existing=True); t.image.colorspace_settings.name = cs; t.extension = 'REPEAT'; t.interpolation = 'Cubic'; return t
    bc = tex('zip_basecolor.png', 'sRGB'); nt.links.new(bc.outputs[0], bs.inputs['Base Color'])
    orm = tex('zip_orm.png', 'Non-Color'); sp = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(orm.outputs[0], sp.inputs[0])
    nt.links.new(sp.outputs[1], bs.inputs['Roughness']); nt.links.new(sp.outputs[2], bs.inputs['Metallic'])
    nm = tex('zip_normal.png', 'Non-Color'); nmn = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(nm.outputs[0], nmn.inputs[1]); nt.links.new(nmn.outputs[0], bs.inputs['Normal'])
    return m
