# Build the Kastell GLB (Mandi's Revenge: Mandi's car, a boxy black luxury off-roader), modelled from nothing in this
# script (no downloaded model, no texture): every panel a slab of its own with a few millimetres of shut line round it
# and a dark backing under the gaps, the flared arches swept along the wheel's arc, exposed hinges on every door, round
# lamps (a chrome bezel, a reflector bowl, a projector, an LED ring and a domed lens), a three-louvre grille with no
# emblem, fender-top indicators, a side-hinged tailgate carrying a covered spare (a plain cover, no emblem), side steps,
# side pipes, solid axles under it, 20 inch twin-spoke wheels on tyres with grooves, shoulder blocks and a ribbed
# sidewall, brake discs and calipers, and a cabin (quilted seats, a dash with round vents, a wide screen, a grab handle,
# a console, door cards, carpet and a headliner). No maker's name, crest, badge or lettering anywhere.
#   Blender -b --factory-startup --python gwagon/build.py -- /tmp/gwagon-raw.glb [debug.blend]
# Blender's frame: x across (+x the car's left, the driver's side), -y forward (the nose), z up; metres; the axles'
# middle on x = y = 0 and the tyres on z = 0. Objects are named <part>_<material> (the game finishes each by its
# material's name: wagmi/storyrun/gwagon.js); the front doors door_<side>_*, the wheels wheel_<corner>_*.
import bpy, bmesh, sys, json, math
from mathutils import Vector, Matrix
args = sys.argv[sys.argv.index('--') + 1:]
OUT = args[0]
DEBUG = len(args) > 1 and args[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
PI = math.pi

# ------------------------------------------------------------------ dimensions
WB, TRACK = 2.89, 1.64            # wheelbase, track
TR, TW, RIM_R = 0.392, 0.275, 0.254   # tyre radius and width (275/50 R20), the rim's
AXF, AXR = -WB / 2, WB / 2        # the axles' y
SX = 0.925                         # the body's side (outer face of the lower panels)
GX = 0.872                         # the greenhouse's side (glass and pillars, set in from the belt)
Z0, BELT, ROOF = 0.46, 1.30, 1.95   # the panels' foot, the belt line (high: the glass a third of the side), the roof's top
HOODZ = 1.255                       # the hood's and the front fenders' tops, just under the belt: an upright nose
HR = -1.0                           # the hood's back edge (the windscreen's cowl behind it)
YF, YR = -2.10, 2.12                # the front face (lamps, grille) and the back face (tailgate): 4.8 m over the spare
GAP = 0.0065                       # a shut line
ARCH = 0.475                       # the wheel arch's radius in the panels

parts = []   # (group, material, object)
MATS = {}
def mat(name):
    if name not in MATS: MATS[name] = bpy.data.materials.new(name)
    return MATS[name]

def obj_from_bm(bm, group, m, smooth=35):
    me = bpy.data.meshes.new(f'{group}_{m}'); bm.normal_update(); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(f'{group}_{m}', me); sc.collection.objects.link(o); me.materials.append(mat(m))
    o['smooth'] = smooth
    parts.append((group, m, o)); return o

def bevel_obj(o, width, seg=2, angle=40):
    md = o.modifiers.new('bv', 'BEVEL'); md.width = width; md.segments = seg; md.limit_method = 'ANGLE'
    md.angle_limit = math.radians(angle); md.harden_normals = False; md.miter_outer = 'MITER_ARC'
    bpy.context.view_layer.objects.active = o
    for x in sc.objects: x.select_set(False)
    o.select_set(True); bpy.ops.object.modifier_apply(modifier=md.name)

def mirror_bm(bm, axis=0):
    s = [1, 1, 1]; s[axis] = -1
    bmesh.ops.scale(bm, vec=Vector(s), verts=bm.verts); bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return bm

def box(size, at, rot=None):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if rot is not None: bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=rot)
    bmesh.ops.translate(bm, vec=Vector(at), verts=bm.verts)
    return bm

def add_box(group, m, size, at, bevel=0.0, seg=2, rot=None, mirror=False, angle=40):
    """a beveled box; mirror: also its twin across x (group 'X' -> its L/R twin by name)"""
    outs = []
    for sd in ((1, -1) if mirror else (1,)):
        bm = box(size, at, rot)
        if sd < 0: mirror_bm(bm)
        g = group.replace('@', 'L' if sd > 0 else 'R')
        o = obj_from_bm(bm, g, m)
        if bevel > 0: bevel_obj(o, bevel, seg, angle)
        outs.append(o)
    return outs

def add_ring(group, m, size, at, bevel=0.0, rot=None, mirror=False, w=0.028):
    """a box's outline as a frame of four bars round its thin axis (a seal round a pane)"""
    t = min(range(3), key=lambda i: size[i]); a, b = [i for i in range(3) if i != t]
    outs = []
    for sgn in (-1, 1):
        for (ax, ox) in ((a, b), (b, a)):
            sz = list(size); sz[ox] = w
            off = [0.0, 0.0, 0.0]; off[ox] = sgn * (size[ox] / 2 - w / 2)
            for sd in ((1, -1) if mirror else (1,)):
                bm = box(sz, off)
                if rot is not None: bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=rot)
                bmesh.ops.translate(bm, vec=Vector(at), verts=bm.verts)
                if sd < 0: mirror_bm(bm)
                outs.append(obj_from_bm(bm, group.replace('@', 'L' if sd > 0 else 'R'), m))
    return outs

def panel(group, m, plane, outline, depth, at, holes=(), bevel=0.006, seg=2, mirror=False, flip=False):
    """a flat panel: a 2D outline (with holes) filled and pushed out to a slab `depth` thick.
    plane 'yz': outline in (y, z), the slab from x=at to at+depth (a side). 'xz': (x, z), y from at to at+depth (a face).
    'xy': (x, y), z from at to at+depth (a top)."""
    outs = []
    for sd in ((1, -1) if mirror else (1,)):
        bm = bmesh.new()
        def v3(p, d):
            a, b = p
            if plane == 'yz': return Vector((at + d, a, b))
            if plane == 'xz': return Vector((a, at + d, b))
            return Vector((a, b, at + d))
        loops = [outline] + list(holes)
        edges = []
        for lp in loops:
            vs = [bm.verts.new(v3(p, 0)) for p in lp]
            for i in range(len(vs)): edges.append(bm.edges.new((vs[i], vs[(i + 1) % len(vs)])))
        bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=True, edges=edges)
        faces = list(bm.faces)
        ex = bmesh.ops.extrude_face_region(bm, geom=faces)
        nv = [e for e in ex['geom'] if isinstance(e, bmesh.types.BMVert)]
        dv = {'yz': Vector((depth, 0, 0)), 'xz': Vector((0, depth, 0)), 'xy': Vector((0, 0, depth))}[plane]
        bmesh.ops.translate(bm, vec=dv, verts=nv)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if sd < 0: mirror_bm(bm)
        o = obj_from_bm(bm, group.replace('@', 'L' if sd > 0 else 'R'), m, smooth=30)
        if bevel > 0: bevel_obj(o, bevel, seg, 30)
        outs.append(o)
    return outs

def _cutter(bm):
    me = bpy.data.meshes.new('cut'); bm.normal_update(); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('cut', me); sc.collection.objects.link(o); return o

def block(group, m, lo, hi, bevel=0.0, seg=4, cuts=(), mirror=False, smooth=30):
    """a solid box from lo to hi, every edge rounded (bevel: the radius, seg segments, a real car's soft corners), then
    each cutter (a bmesh, in the left side's coordinates) taken out of it (an arch, a lamp's pocket); mirror: its twin"""
    outs = []
    for sd in ((1, -1) if mirror else (1,)):
        size = [hi[i] - lo[i] for i in range(3)]; at = [(hi[i] + lo[i]) / 2 for i in range(3)]
        o = obj_from_bm(box(size, at), group.replace('@', 'L' if sd > 0 else 'R'), m, smooth)
        bpy.context.view_layer.objects.active = o
        for x in sc.objects: x.select_set(False)
        o.select_set(True)
        if bevel > 0:
            md = o.modifiers.new('bv', 'BEVEL'); md.width = bevel; md.segments = seg; md.limit_method = 'NONE'; md.miter_outer = 'MITER_ARC'
            bpy.ops.object.modifier_apply(modifier=md.name)
        for c in cuts:
            co = _cutter(c())
            md = o.modifiers.new('cut', 'BOOLEAN'); md.operation = 'DIFFERENCE'; md.object = co; md.solver = 'EXACT'
            bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier=md.name)
            bpy.data.objects.remove(co, do_unlink=True)
        if sd < 0:
            bm = bmesh.new(); bm.from_mesh(o.data); mirror_bm(bm); bm.to_mesh(o.data); bm.free()
        outs.append(o)
    return outs

def arc(cy, cz, r, a0, a1, n):
    return [(cy + r * math.cos(a0 + (a1 - a0) * i / n), cz + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]

def circle(cx, cz, r, n=40):
    return [(cx + r * math.cos(2 * PI * i / n), cz + r * math.sin(2 * PI * i / n)) for i in range(n)]

def lathe(profile, seg, axis='x'):
    """a solid of revolution: profile [(along, radius)], about the axis x (wheels) or y (lamps), closed round"""
    bm = bmesh.new(); rings = []
    for k in range(seg):
        a = 2 * PI * k / seg; c, s = math.cos(a), math.sin(a); ring = []
        for (u, r) in profile:
            if axis == 'x': ring.append(bm.verts.new((u, r * c, r * s)))
            else: ring.append(bm.verts.new((r * c, u, r * s)))
        rings.append(ring)
    for k in range(seg):
        A, Bn = rings[k], rings[(k + 1) % seg]
        for i in range(len(profile) - 1):
            try: bm.faces.new((A[i], A[i + 1], Bn[i + 1], Bn[i]))
            except ValueError: pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def place(bm, at, rot=None):
    if rot is not None: bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=rot)
    bmesh.ops.translate(bm, vec=Vector(at), verts=bm.verts); return bm

def torus(R, r, seg=40, sseg=8, axis='y'):
    bm = bmesh.new(); rings = []
    for k in range(seg):
        a = 2 * PI * k / seg; ring = []
        for j in range(sseg):
            b = 2 * PI * j / sseg; rr = R + r * math.cos(b); h = r * math.sin(b)
            ring.append(bm.verts.new((rr * math.cos(a), h, rr * math.sin(a)) if axis == 'y' else (h, rr * math.cos(a), rr * math.sin(a))))
        rings.append(ring)
    for k in range(seg):
        A, Bn = rings[k], rings[(k + 1) % seg]
        for j in range(sseg): bm.faces.new((A[j], A[(j + 1) % sseg], Bn[(j + 1) % sseg], Bn[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def cyl(r, depth, seg=24, axis='x', cap=True):
    h = depth / 2
    prof = ([(-h, 0.0)] if cap else []) + [(-h, r), (h, r)] + ([(h, 0.0)] if cap else [])
    return lathe(prof, seg, axis)

def emit(group, m, bm, mirror=False, smooth=35):
    outs = []
    if mirror:
        twin = bm.copy(); mirror_bm(twin)
        outs.append(obj_from_bm(bm, group.replace('@', 'L'), m, smooth)); outs.append(obj_from_bm(twin, group.replace('@', 'R'), m, smooth))
    else: outs.append(obj_from_bm(bm, group, m, smooth))
    return outs

# ================================================================== the body
T = 0.035   # a panel's thickness
# --- the side panels (lower body), left side; mirrored. Their outlines in (y, z), shut lines between them
DOOR_F = (-1.005, 0.090)    # the front door's front and back edges
DOOR_R = (0.090 + GAP, 1.065)
# (the arch from its front foot round over the top to its back foot)
def arch_pts(cy, a0=10, a1=170, step=6):
    return [(cy - ARCH * math.cos(math.radians(a)), 0.39 + ARCH * math.sin(math.radians(a))) for a in range(a0, a1 + 1, step)]
fa = arch_pts(AXF)
HX = 0.672                          # the hood's half width: the fenders outside it carry the lamps
LX, LZ, LR = 0.788, 1.02, 0.095    # the round lamps' middles and radius
arch_cut = lambda cy: (lambda: place(cyl(ARCH, 0.9, 56, 'x'), (0.75, cy, 0.39)))
lamp_cut = lambda: place(cyl(LR + 0.004, 0.24, 40, 'y'), (LX, YF, LZ))
# the front fenders: solid, every edge rounded, the arch and the lamp's pocket cut out of them
block('body', 'Paint', (HX + GAP, YF, Z0), (SX, DOOR_F[0] - GAP, HOODZ), bevel=0.03, seg=4, cuts=(arch_cut(AXF), lamp_cut), mirror=True)
block('door_@', 'Paint', (SX - 0.05, DOOR_F[0], Z0), (SX, DOOR_F[1], BELT), bevel=0.012, seg=3, mirror=True)
block('body', 'Paint', (SX - 0.05, DOOR_R[0], Z0), (SX, DOOR_R[1], BELT), bevel=0.012, seg=3, cuts=(arch_cut(AXR),), mirror=True)
ra = arch_pts(AXR)
block('body', 'Paint', (0.74 + GAP, DOOR_R[1] + GAP, Z0), (SX, YR, BELT), bevel=0.03, seg=4, cuts=(arch_cut(AXR),), mirror=True)
# (the dark backing under every shut line: a shell just inside the panels)
add_box('body', 'Gap', (0.01, YR - DOOR_F[0] - 0.06, BELT - Z0 - 0.02), (SX - 0.056, (DOOR_F[0] + YR) / 2, (Z0 + BELT) / 2), mirror=True)
# --- the belt ledge: where the greenhouse steps in from the body (a rubber seal along it, chrome over it)
add_box('body', 'Paint', (SX - GX + 0.01, DOOR_R[1] - DOOR_R[0], 0.03), ((SX + GX) / 2 - 0.005, (DOOR_R[0] + DOOR_R[1]) / 2, BELT - 0.012), bevel=0.006, mirror=True)
add_box('door_@', 'Paint', (SX - GX + 0.01, DOOR_F[1] - DOOR_F[0], 0.03), ((SX + GX) / 2 - 0.005, (DOOR_F[0] + DOOR_F[1]) / 2, BELT - 0.012), bevel=0.006, mirror=True)
add_box('body', 'Paint', (SX - GX + 0.01, YR - 0.02 - DOOR_R[1] - GAP, 0.03), ((SX + GX) / 2 - 0.005, (DOOR_R[1] + GAP + YR - 0.02) / 2, BELT - 0.012), bevel=0.006, mirror=True)
for (y0, y1, g) in ((DOOR_F[0], DOOR_F[1], 'door_@'), (DOOR_R[0], DOOR_R[1], 'body')):
    add_box(g, 'Chrome', (0.012, y1 - y0 - 0.03, 0.008), (GX + 0.012, (y0 + y1) / 2, BELT + 0.006), bevel=0.003, mirror=True)
# --- the protective strip along the side: black rubber with a chrome inlay, broken at every shut line
SZ = 0.86
for (y0, y1, g) in ((YF + 0.30, fa[-1][0] - 0.02, 'body'), (DOOR_F[0] + 0.02, DOOR_F[1] - 0.02, 'door_@'), (DOOR_R[0] + 0.02, ra[0][0] + 0.02, 'body')):
    add_box(g, 'Rubber', (0.014, y1 - y0, 0.05), (SX + 0.006, (y0 + y1) / 2, SZ), bevel=0.005, mirror=True)
    add_box(g, 'Chrome', (0.006, y1 - y0 - 0.02, 0.008), (SX + 0.014, (y0 + y1) / 2, SZ), bevel=0.002, mirror=True)
# --- the hood between the fenders and the fenders' tops (the indicators stand on their front corners)
block('body', 'Paint', (-HX, YF + 0.01, HOODZ - 0.057), (HX, HR, HOODZ - 0.013), bevel=0.016, seg=3)
# (the hood's bulge: a low raised centre)
block('body', 'Paint', (-0.46, YF + 0.10, HOODZ - 0.025), (0.46, HR - 0.06, HOODZ - 0.006), bevel=0.014, seg=3)
add_box('body', 'Gap', (2 * SX - 0.04, HR - YF - 0.08, 0.01), (0, (YF + HR) / 2 + 0.04, HOODZ - 0.065))
# (the windscreen's cowl, black, with its wipers)
add_box('body', 'Trim', (2 * GX - 0.02, 0.08, 0.06), (0, HR + 0.035, HOODZ + 0.012), bevel=0.01)
for x0 in (0.22, -0.40):
    add_box('body', 'Trim', (0.56, 0.012, 0.014), (x0, HR + 0.01, HOODZ + 0.05), bevel=0.004, rot=Matrix.Rotation(math.radians(8), 4, 'Y'))
    add_box('body', 'Trim', (0.08, 0.025, 0.02), (x0 - 0.24, HR + 0.01, HOODZ + 0.045), bevel=0.005)

# --- the front face: the fenders' faces round the lamps, the grille between them, the bumper under
# the grille: a chrome surround, three louvres in the body's colour each with a chrome top edge, a black mesh behind. No emblem
GW, G0, G1 = 0.628, 0.78, HOODZ - 0.05
add_box('body', 'Grille', (2 * GW, 0.02, G1 - G0), (0, YF + 0.045, (G0 + G1) / 2))
for (sx, sz, ax, az) in ((2 * GW + 0.04, 0.025, 0, G1), (2 * GW + 0.04, 0.025, 0, G0), (0.025, G1 - G0, GW + 0.008, (G0 + G1) / 2), (0.025, G1 - G0, -GW - 0.008, (G0 + G1) / 2)):
    add_box('body', 'Chrome', (sx, 0.03, sz), (ax, YF + 0.012, az), bevel=0.006)
for k in range(3):
    z = G0 + 0.075 + k * (G1 - G0 - 0.09) / 2.6
    add_box('body', 'Paint', (2 * GW - 0.03, 0.035, 0.062), (0, YF + 0.02, z), bevel=0.01, rot=Matrix.Rotation(math.radians(-10), 4, 'X'))
    add_box('body', 'Chrome', (2 * GW - 0.04, 0.01, 0.006), (0, YF + 0.004, z + 0.03), bevel=0.002)
# (the valance under the grille, closing the face down to the bumper)
block('body', 'Trim', (-HX - 0.01, YF + 0.005, 0.64), (HX + 0.01, YF + 0.06, G0 + 0.01), bevel=0.01, seg=2)
# the round lamps: a chrome bezel, the housing, the reflector bowl (body_Headlight), a projector, the LED ring, a domed lens
for sd in (1, -1):
    x = sd * LX
    emit('body', 'Chrome', place(torus(LR + 0.004, 0.011, 48, 8), (x, YF - 0.002, LZ)))
    emit('body', 'Trim', place(cyl(LR + 0.003, 0.11, 40, 'y', cap=False), (x, YF + 0.06, LZ)))
    kl = LR / 0.118; bowl = lathe([(0.10, 0.0), (0.095, 0.03 * kl), (0.075, 0.07 * kl), (0.045, 0.10 * kl), (0.02, LR - 0.004)], 40, 'y')
    emit('body', 'Headlight', place(bowl, (x, YF, LZ)))
    emit('body', 'Lens', place(lathe([(0.0, 0.0), (0.004, 0.02), (0.012, 0.034), (0.03, 0.038)], 20, 'y'), (x, YF + 0.025, LZ)))
    emit('body', 'Chrome', place(torus(0.036, 0.006, 28, 6), (x, YF + 0.055, LZ)))
    emit('body', 'DRL', place(torus(LR - 0.018, 0.006, 48, 6), (x, YF + 0.012, LZ)))
    emit('body', 'Lens', place(lathe([(-0.022, 0.0), (-0.018, 0.04), (-0.01, 0.08), (0.0, LR + 0.002)], 40, 'y'), (x, YF + 0.004, LZ)))
    # the indicator on the fender's top front corner: an amber lens on a chrome foot
    add_box('body', 'Chrome', (0.15, 0.16, 0.012), (sd * (HX + SX) / 2, YF + 0.10, HOODZ + 0.006), bevel=0.004)
    add_box('ind_' + ('L' if sd > 0 else 'R'), 'Indicator', (0.135, 0.145, 0.045), (sd * (HX + SX) / 2, YF + 0.10, HOODZ + 0.034), bevel=0.018, seg=3)
    # the side repeater, on the fender behind the arch
    add_box('ind_' + ('L' if sd > 0 else 'R'), 'Indicator', (0.012, 0.07, 0.022), (sd * (SX + 0.004), fa[-1][0] - 0.12, 0.98), bevel=0.005)
# the bumper: black and soft-cornered, its top in the body's colour; a lower intake of diamond mesh in a chrome frame,
# round fog lamps in chrome bezels, two red tow hooks under it, parking sensors, a brushed skid plate, the plate
BZ0, BZ1, BY = 0.42, 0.665, YF - 0.16
IW, IZ0, IZ1 = 0.50, 0.432, 0.50
block('body', 'Trim', (-(SX + 0.025), BY, BZ0), (SX + 0.025, YF + 0.03, BZ1), bevel=0.04, seg=4, cuts=(lambda: box((2 * IW, 0.09, IZ1 - IZ0), (0, BY, (IZ0 + IZ1) / 2)),))
block('body', 'Paint', (-(SX + 0.02), BY + 0.004, BZ1 - 0.05), (SX + 0.02, YF + 0.0, BZ1 + 0.006), bevel=0.024, seg=3)
add_box('body', 'Grille', (2 * IW, 0.01, IZ1 - IZ0), (0, BY + 0.04, (IZ0 + IZ1) / 2))
add_ring('body', 'Chrome', (2 * IW + 0.022, 0.016, IZ1 - IZ0 + 0.022), (0, BY - 0.006, (IZ0 + IZ1) / 2), w=0.011)
for row in range(2):
    for k in range(30):
        x = -IW + 0.02 + k * (2 * IW - 0.04) / 29 + (0.0165 if row else 0)
        if abs(x) > IW - 0.015: continue
        add_box('body', 'Mesh', (0.026, 0.032, 0.026), (x, BY + 0.02, IZ0 + 0.018 + row * 0.033), rot=Matrix.Rotation(PI / 4, 4, 'Y'))
for sd in (1, -1):
    fx, fz = sd * 0.72, 0.56
    emit('body', 'Chrome', place(torus(0.047, 0.008, 36, 6), (fx, BY - 0.004, fz)))
    emit('body', 'Trim', place(cyl(0.05, 0.03, 32, 'y', cap=False), (fx, BY + 0.01, fz)))
    emit('body', 'Headlight', place(lathe([(0.035, 0.0), (0.024, 0.025), (0.004, 0.044)], 28, 'y'), (fx, BY, fz)))
    emit('body', 'DRL', place(torus(0.034, 0.003, 32, 5), (fx, BY + 0.0, fz)))
    emit('body', 'Lens', place(lathe([(-0.01, 0.0), (-0.006, 0.03), (0.0, 0.046)], 28, 'y'), (fx, BY - 0.002, fz)))
    # (the tow hooks: an open loop on a bracket, red)
    hk = torus(0.032, 0.011, 20, 8, axis='x')
    keep = [v for v in hk.verts if v.co.z > -0.012]
    bmesh.ops.delete(hk, geom=[v for v in hk.verts if v.co.z <= -0.012], context='VERTS')
    emit('body', 'Hook', place(hk, (sd * 0.47, BY - 0.035, 0.405)))
    add_box('body', 'Hook', (0.03, 0.06, 0.025), (sd * 0.47, BY + 0.0, 0.408), bevel=0.006)
    # (the bumper's corner wrapping round to the arch)
    block('body', 'Trim', (SX - 0.02 if sd > 0 else -(SX + 0.03), YF - 0.02, 0.44), (SX + 0.03 if sd > 0 else -(SX - 0.02), YF + 0.32, 0.665), bevel=0.02, seg=3)
    for x in (0.25, 0.62): emit('body', 'Trim', place(cyl(0.011, 0.008, 16, 'y'), (sd * x, BY - 0.003, 0.61)))
block('body', 'Step', (-0.42, BY + 0.02, 0.375), (0.42, YF + 0.12, 0.42), bevel=0.012, seg=2)
for x in (-0.36, -0.12, 0.12, 0.36): emit('body', 'Chrome', place(cyl(0.009, 0.006, 6, 'z'), (x, BY + 0.06, 0.376)) if False else place(lathe([(-0.003, 0.0), (-0.003, 0.009), (0.003, 0.007), (0.003, 0.0)], 6, 'y'), (x, BY + 0.06, 0.373), Matrix.Rotation(PI / 2, 4, 'X')))
add_box('body', 'Plate', (0.305, 0.006, 0.152), (0, BY - 0.012, 0.585))
add_box('body', 'Trim', (0.325, 0.01, 0.17), (0, BY - 0.004, 0.585), bevel=0.004)

# --- the flared arches: a band swept round each arch, in the body's colour, its edge rolled
def flare(cy, a0=8, a1=172, n=34):
    bm = bmesh.new(); prof = [(SX - 0.02, ARCH - 0.005), (SX + 0.022, ARCH - 0.004), (SX + 0.046, ARCH + 0.012), (SX + 0.052, ARCH + 0.05), (SX + 0.042, ARCH + 0.08), (SX - 0.002, ARCH + 0.09)]
    rings = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n); c, s = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((x, cy - r * c, 0.39 + r * s)) for (x, r) in prof])
    for i in range(n):
        for j in range(len(prof) - 1): bm.faces.new((rings[i][j], rings[i][j + 1], rings[i + 1][j + 1], rings[i + 1][j]))
    # (the ends closed)
    for rg in (rings[0], rings[-1]): bm.faces.new(rg)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm
for cy in (AXF, AXR): emit('body', 'Paint', flare(cy), mirror=True, smooth=50)
# (the arches' liners: black, inside)
for cy in (AXF, AXR):
    bm = bmesh.new(); n = 24; rings = []
    for i in range(n + 1):
        a = math.radians(8 + 164 * i / n); c, s = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((x, cy - (ARCH - 0.01) * c, 0.39 + (ARCH - 0.01) * s)) for x in (0.60, SX + 0.04)])
    for i in range(n): bm.faces.new((rings[i][0], rings[i][1], rings[i + 1][1], rings[i + 1][0]))
    emit('body', 'Under', bm, mirror=True)

# --- the sills, the side steps and the side pipes
add_box('body', 'Trim', (0.05, DOOR_R[1] - DOOR_F[0] + 0.02, 0.09), (SX - 0.02, (DOOR_F[0] + DOOR_R[1]) / 2, 0.43), bevel=0.012, mirror=True)
SY0, SY1, SZT = DOOR_F[0] + 0.02, 0.74, 0.37
add_box('body', 'Step', (0.20, SY1 - SY0, 0.035), (SX - 0.02 + 0.03, (SY0 + SY1) / 2, SZT - 0.018), bevel=0.012, seg=3, mirror=True)
for k in range(4):
    add_box('body', 'Rubber', (0.022, SY1 - SY0 - 0.08, 0.008), (SX - 0.06 + 0.042 * k, (SY0 + SY1) / 2, SZT + 0.002), bevel=0.003, mirror=True)
for yb in (SY0 + 0.25, SY1 - 0.25):
    add_box('body', 'Under', (0.22, 0.05, 0.06), (SX - 0.12, yb, SZT - 0.06), mirror=True)
for yb in (0.82, 0.93):
    p = lathe([(-0.10, 0.032), (0.06, 0.032), (0.07, 0.036), (0.07, 0.03), (-0.02, 0.028)], 24, 'x')
    emit('body', 'Exhaust', place(p, (SX - 0.04, yb, 0.345)), mirror=True)
    emit('body', 'Under', place(lathe([(0.05, 0.0), (0.05, 0.027)], 20, 'x'), (SX - 0.04, yb, 0.345)), mirror=True)

# --- the greenhouse: the pillars (in the body's colour), the roof with its drip rails, the glass in black rubber
WS0, WS1 = (-0.965, HOODZ + 0.045), (-0.85, ROOF - 0.06)     # the windscreen's foot and head (y, z): upright, a little raked
def on_ws(t): return (WS0[0] + (WS1[0] - WS0[0]) * t, WS0[1] + (WS1[1] - WS0[1]) * t)
rake = math.atan2(WS1[0] - WS0[0], WS1[1] - WS0[1])
wlen = math.hypot(WS1[0] - WS0[0], WS1[1] - WS0[1])
# A-pillars
for sd in (1, -1):
    add_box('body', 'Trim', (0.075, 0.07, wlen + 0.04), (sd * (GX - 0.025), (WS0[0] + WS1[0]) / 2 + 0.01, (WS0[1] + WS1[1]) / 2), bevel=0.012, rot=Matrix.Rotation(-rake, 4, 'X'))
# the windscreen (lighter glass) in a rubber frame, a black frit round it
WSW = 2 * GX - 0.13
add_ring('body', 'Rubber', (WSW + 0.03, 0.012, wlen + 0.02), ((0), (WS0[0] + WS1[0]) / 2 + 0.008, (WS0[1] + WS1[1]) / 2), rot=Matrix.Rotation(-rake, 4, 'X'))
add_box('body', 'Windscreen', (WSW, 0.006, wlen - 0.02), (0, (WS0[0] + WS1[0]) / 2, (WS0[1] + WS1[1]) / 2), rot=Matrix.Rotation(-rake, 4, 'X'))
# the roof, a little crowned, its gutters (drip rails) along both edges and a third brake light at its back
RY0, RY1 = WS1[0] - 0.03, YR - 0.01
add_box('body', 'Paint', (2 * GX + 0.006, RY1 - RY0, 0.075), (0, (RY0 + RY1) / 2, ROOF - 0.0375), bevel=0.03, seg=3)
# (the windscreen's header: a deep bar in the body's colour over the glass)
add_box('body', 'Paint', (2 * GX - 0.02, 0.09, 0.07), (0, WS1[0] + 0.005, WS1[1] - 0.005), bevel=0.02, seg=3, rot=Matrix.Rotation(-rake, 4, 'X'))
add_box('body', 'Paint', (2 * GX - 0.20, RY1 - RY0 - 0.12, 0.014), (0, (RY0 + RY1) / 2, ROOF + 0.002), bevel=0.012, seg=3)
for sd in (1, -1):
    add_box('body', 'Trim', (0.022, RY1 - RY0 + 0.02, 0.03), (sd * (GX + 0.009), (RY0 + RY1) / 2, ROOF - 0.05), bevel=0.006)
add_box('body', 'Brake', (0.42, 0.02, 0.025), (0, RY1 + 0.004, ROOF - 0.045), bevel=0.006)
# the pillars and door frames: B (between the doors), C (behind the rear door), D (the back corner)
PZ0, PZ1 = BELT, ROOF - 0.072
def post(g, y, w, m='Trim', d=0.06):
    add_box(g, m, (d, w, PZ1 - PZ0), (GX - d / 2 + 0.012, y, (PZ0 + PZ1) / 2), bevel=0.01, mirror=True)
# the front door's frame: its front edge along the A-pillar, its top rail, its back edge (the B-pillar's front half)
add_box('door_@', 'Trim', (0.05, DOOR_F[1] - DOOR_F[0] - 0.09, 0.045), (GX - 0.013, (DOOR_F[0] + 0.09 + DOOR_F[1]) / 2, PZ1 - 0.022), bevel=0.01, mirror=True)
add_box('door_@', 'Trim', (0.06, 0.075, PZ1 - PZ0), (GX - 0.013, DOOR_F[1] - 0.0325, (PZ0 + PZ1) / 2), bevel=0.01, mirror=True)
add_box('door_@', 'Trim', (0.05, 0.06, wlen), (GX - 0.013, (WS0[0] + WS1[0]) / 2 + 0.075, (WS0[1] + WS1[1]) / 2), bevel=0.01, rot=Matrix.Rotation(-rake, 4, 'X'), mirror=True)
add_ring('door_@', 'Rubber', (0.014, DOOR_F[1] - DOOR_F[0] - 0.17, PZ1 - PZ0 - 0.04), (GX - 0.012, (DOOR_F[0] + DOOR_F[1]) / 2 + 0.055, (PZ0 + PZ1) / 2 - 0.005), mirror=True)
add_ring('door_@', 'Chrome', (0.006, DOOR_F[1] - DOOR_F[0] - 0.17 + 0.012, PZ1 - PZ0 - 0.028), (GX + 0.013, (DOOR_F[0] + DOOR_F[1]) / 2 + 0.055, (PZ0 + PZ1) / 2 - 0.005), mirror=True, w=0.013)  # (a bright surround round the glass)
add_box('door_@', 'Windscreen', (0.006, DOOR_F[1] - DOOR_F[0] - 0.19, PZ1 - PZ0 - 0.06), (GX - 0.004, (DOOR_F[0] + DOOR_F[1]) / 2 + 0.06, (PZ0 + PZ1) / 2 - 0.005), mirror=True)
# (the quarter light's divider at the front of the door glass)
add_box('door_@', 'Rubber', (0.016, 0.022, PZ1 - PZ0 - 0.06), (GX - 0.002, DOOR_F[0] + 0.23, (PZ0 + PZ1) / 2 - 0.01), mirror=True)
# the rear door's frame and glass, the B pillar's back half, the C pillar
add_box('body', 'Trim', (0.05, DOOR_R[1] - DOOR_R[0], 0.045), (GX - 0.013, (DOOR_R[0] + DOOR_R[1]) / 2, PZ1 - 0.022), bevel=0.01, mirror=True)
post('body', DOOR_R[0] + 0.045, 0.09, d=0.06)
post('body', DOOR_R[1] - 0.045, 0.09, d=0.06)
add_ring('body', 'Rubber', (0.014, DOOR_R[1] - DOOR_R[0] - 0.08, PZ1 - PZ0 - 0.04), (GX - 0.012, (DOOR_R[0] + DOOR_R[1]) / 2, (PZ0 + PZ1) / 2 - 0.005), mirror=True)
add_ring('body', 'Chrome', (0.006, DOOR_R[1] - DOOR_R[0] - 0.08 + 0.012, PZ1 - PZ0 - 0.028), (GX + 0.013, (DOOR_R[0] + DOOR_R[1]) / 2, (PZ0 + PZ1) / 2 - 0.005), mirror=True, w=0.013)  # (a bright surround round the glass)
add_box('body', 'Glass', (0.006, DOOR_R[1] - DOOR_R[0] - 0.10, PZ1 - PZ0 - 0.06), (GX - 0.004, (DOOR_R[0] + DOOR_R[1]) / 2, (PZ0 + PZ1) / 2 - 0.005), mirror=True)
# the cargo side window and the D pillar
add_box('body', 'Trim', (0.05, YR - DOOR_R[1] - 0.06, 0.045), (GX - 0.013, (DOOR_R[1] + YR) / 2, PZ1 - 0.022), bevel=0.01, mirror=True)
# (the D pillar wide and black: a short quarter window behind the rear door, a 5-door's, not a third pane as long)
post('body', YR - 0.215, 0.40, d=0.06)
QW0, QW1 = DOOR_R[1] + 0.06, YR - 0.40
add_ring('body', 'Rubber', (0.014, QW1 - QW0 + 0.03, PZ1 - PZ0 - 0.04), (GX - 0.012, (QW0 + QW1) / 2, (PZ0 + PZ1) / 2 - 0.005), mirror=True)
add_ring('body', 'Chrome', (0.006, QW1 - QW0 + 0.042, PZ1 - PZ0 - 0.028), (GX + 0.013, (QW0 + QW1) / 2, (PZ0 + PZ1) / 2 - 0.005), mirror=True, w=0.013)  # (a bright surround round the glass)
add_box('body', 'Glass', (0.006, QW1 - QW0 + 0.01, PZ1 - PZ0 - 0.06), (GX - 0.004, (QW0 + QW1) / 2, (PZ0 + PZ1) / 2 - 0.005), mirror=True)
add_box('body', 'Trim', (0.05, 0.05, PZ1 - PZ0), (GX - 0.013, DOOR_R[1] + 0.03, (PZ0 + PZ1) / 2), bevel=0.01, mirror=True)

# --- the exposed hinges: two on every door's front edge, a barrel on a pin with a leaf onto the panel either side
for (yh, zs) in ((DOOR_F[0], (0.70, 1.12)), (DOOR_R[0] - GAP / 2, (0.70, 1.12))):
    for z in zs:
        b = cyl(0.02, 0.09, 16, 'x'); bmesh.ops.rotate(b, verts=b.verts, cent=Vector(), matrix=Matrix.Rotation(PI / 2, 4, 'Y'))
        emit('body', 'Paint', place(b, (SX + 0.02, yh, z)), mirror=True)
        add_box('body', 'Paint', (0.01, 0.075, 0.06), (SX + 0.006, yh - 0.04, z), bevel=0.004, mirror=True)
        add_box('body', 'Paint', (0.01, 0.075, 0.06), (SX + 0.006, yh + 0.04, z), bevel=0.004, mirror=True)
        for dz in (-0.046, 0.046): emit('body', 'Chrome', place(lathe([(-0.004, 0.0), (-0.004, 0.009), (0.004, 0.006), (0.004, 0.0)], 12, 'y'), (SX + 0.02, yh, z + dz), Matrix.Rotation(PI / 2, 4, 'X')), mirror=True)
# --- the door handles: a chrome pull with its push button, on a black plate (the front door's on the door)
for (y1, g) in ((DOOR_F[1], 'door_@'), (DOOR_R[1], 'body')):
    yc = y1 - 0.16
    add_box(g, 'Trim', (0.006, 0.20, 0.05), (SX + 0.002, yc, BELT - 0.2), bevel=0.003, mirror=True)
    add_box(g, 'Handle', (0.03, 0.17, 0.028), (SX + 0.02, yc + 0.01, BELT - 0.2), bevel=0.009, seg=3, mirror=True)
    b = cyl(0.011, 0.02, 16, 'x'); emit(g, 'Handle', place(b, (SX + 0.03, yc - 0.085, BELT - 0.2)), mirror=True)
# --- the mirrors, on the front doors: a housing in the body's colour, a black arm, the glass, an indicator strip
for sd in (1, -1):
    g = 'door_L' if sd > 0 else 'door_R'
    my, mz = DOOR_F[0] + 0.12, BELT + 0.11
    for (m, size, at, bv) in (('Trim', (0.10, 0.05, 0.05), (GX + 0.04, my, BELT + 0.03), 0.01), ('Mirror_cap', (0.21, 0.10, 0.155), (GX + 0.155, my, mz), 0.04), ('Mirror', (0.18, 0.006, 0.125), (GX + 0.155, my + 0.052, mz), 0.012), ('Indicator', (0.12, 0.01, 0.012), (GX + 0.175, my - 0.03, mz - 0.07), 0.004)):
        bm = box(size, at)
        if sd < 0: mirror_bm(bm)
        o = obj_from_bm(bm, g, m); bevel_obj(o, bv, 3)

# --- the back: the rear quarters' faces with the tall tail lamps, the side-hinged tailgate, the covered spare, the bumper
TLX0, TLX1, TLZ0, TLZ1 = 0.762, SX - 0.036, 0.76, 1.16
for sd in (1, -1):
    xc = sd * (TLX0 + TLX1) / 2; w = TLX1 - TLX0
    add_box('body', 'Chrome', (w + 0.012, 0.03, TLZ1 - TLZ0 + 0.012), (xc, YR - 0.012, (TLZ0 + TLZ1) / 2), bevel=0.006)
    for (m, z0, z1) in (('Tail_light', 1.055, 1.15), ('Brake', 0.945, 1.045), ('Indicator', 0.85, 0.935), ('Reverse', 0.77, 0.84)):
        lg = ('ind_' + ('L' if sd > 0 else 'R')) if m == 'Indicator' else 'body'
        add_box(lg, m, (w - 0.012, 0.03, z1 - z0), (xc, YR + 0.006, (z0 + z1) / 2), bevel=0.006)
        # (each section's own two rings behind its lens)
        for k in range(2):
            emit(lg, m, place(torus(0.022, 0.004, 16, 5), (xc + (k - 0.5) * 0.06, YR + 0.023, (z0 + z1) / 2)))
    add_box('body', 'Tail_lens', (w - 0.006, 0.008, TLZ1 - TLZ0 - 0.006), (xc, YR + 0.024, (TLZ0 + TLZ1) / 2), bevel=0.004)
# the tailgate: hinged on the right (-x) side, its glass, its handle, its hinges
TG0, TG1 = -0.74, 0.74
block('body', 'Paint', (TG0, YR - 0.05, Z0 + 0.02), (TG1, YR, BELT), bevel=0.014, seg=3)
add_box('body', 'Paint', (TG1 - TG0, 0.05, 0.05), (0, YR - 0.02, PZ1 - 0.02), bevel=0.012)
for xx in (TG0 + 0.03, TG1 - 0.03): add_box('body', 'Paint', (0.06, 0.05, PZ1 - PZ0), (xx, YR - 0.02, (PZ0 + PZ1) / 2), bevel=0.012)
add_box('body', 'Paint', (TG1 - TG0, 0.05, 0.05), (0, YR - 0.02, BELT + 0.01), bevel=0.012)
add_ring('body', 'Rubber', (TG1 - TG0 - 0.10, 0.012, PZ1 - PZ0 - 0.06), (0, YR - 0.01, (PZ0 + PZ1) / 2))
add_box('body', 'Glass', (TG1 - TG0 - 0.12, 0.006, PZ1 - PZ0 - 0.08), (0, YR - 0.004, (PZ0 + PZ1) / 2))
add_box('body', 'Gap', (2 * SX - 0.06, 0.01, BELT - Z0 - 0.02), (0, YR - 0.04, (Z0 + BELT) / 2))
for z in (0.74, 1.14, 1.66):
    b = cyl(0.016, 0.085, 16, 'x'); bmesh.ops.rotate(b, verts=b.verts, cent=Vector(), matrix=Matrix.Rotation(PI / 2, 4, 'Y'))
    emit('body', 'Paint', place(b, (TG0 - 0.004, YR + 0.018, z)))
    add_box('body', 'Paint', (0.08, 0.01, 0.06), (TG0 + 0.035, YR + 0.004, z), bevel=0.004)
add_box('body', 'Trim', (0.20, 0.006, 0.05), (0.55, YR + 0.002, 1.17), bevel=0.003)
add_box('body', 'Handle', (0.17, 0.028, 0.028), (0.55, YR + 0.018, 1.17), bevel=0.009, seg=3)
# the spare: a tyre on a carrier, under a hard cover in the body's colour with a plain centre, a chrome ring. No emblem
SPY, SPZ = YR + 0.035 + TW / 2 + 0.02, 1.06
add_box('body', 'Under', (0.30, 0.06, 0.30), (0, YR + 0.04, SPZ), bevel=0.01)
def tyre_profile(r=TR, w=TW, rim=RIM_R):
    h = w / 2
    return [(-h + 0.03, rim + 0.004), (-h - 0.002, rim + 0.03), (-h - 0.012, rim + 0.075), (-h - 0.012, r - 0.06), (-h - 0.004, r - 0.025), (-h + 0.012, r - 0.006),
            (-h + 0.03, r), (h - 0.03, r), (h - 0.012, r - 0.006), (h + 0.004, r - 0.025), (h + 0.012, r - 0.06), (h + 0.012, rim + 0.075), (h + 0.002, rim + 0.03), (h - 0.03, rim + 0.004)]
sp = lathe(tyre_profile(), 56, 'x'); bmesh.ops.rotate(sp, verts=sp.verts, cent=Vector(), matrix=Matrix.Rotation(PI / 2, 4, 'Z'))
emit('spare', 'Tire', place(sp, (0, SPY, SPZ)))
cover = lathe([(-TW / 2 - 0.02, TR + 0.012), (TW / 2 + 0.01, TR + 0.016), (TW / 2 + 0.03, TR + 0.002), (TW / 2 + 0.042, TR - 0.03), (TW / 2 + 0.048, 0.20), (TW / 2 + 0.05, 0.0)], 56, 'y')
emit('spare', 'Paint', place(cover, (0, SPY + 0.0, SPZ)), smooth=60)
emit('spare', 'Chrome', place(torus(0.205, 0.008, 56, 8), (0, SPY + TW / 2 + 0.05, SPZ)))
emit('spare', 'Trim', place(lathe([(0.0, 0.0), (0.004, 0.12), (0.0, 0.198)], 48, 'y'), (0, SPY + TW / 2 + 0.05, SPZ)))
# the rear bumper with its step, the plate above it on the tailgate's foot, the plate lamps, the tow hitch cover
block('body', 'Trim', (-(SX + 0.02), YR - 0.02, 0.435), (SX + 0.02, YR + 0.13, 0.655), bevel=0.04, seg=4)
add_box('body', 'Step', (0.70, 0.07, 0.016), (0, YR + 0.11, 0.66), bevel=0.006)
for sd in (1, -1): add_box('body', 'Reverse', (0.05, 0.01, 0.025), (sd * 0.70, YR + 0.132, 0.49), bevel=0.004)
add_box('body', 'Brake', (0.07, 0.01, 0.03), (-0.62, YR + 0.132, 0.49), bevel=0.004)
add_box('body', 'Plate', (0.305, 0.006, 0.152), (0.0, YR + 0.134, 0.55))
add_box('body', 'Chrome', (0.325, 0.01, 0.17), (0.0, YR + 0.128, 0.55), bevel=0.004)
# --- under it: the floor, the frame rails, the solid axles with their differentials, the fuel tank
add_box('body', 'Under', (2 * SX - 0.12, YR - YF - 0.3, 0.05), (0, (YF + YR) / 2, 0.40))
for sd in (1, -1): add_box('body', 'Under', (0.08, YR - YF - 0.2, 0.12), (sd * 0.48, (YF + YR) / 2, 0.36), bevel=0.01)
for ay in (AXF, AXR):
    b = cyl(0.045, TRACK - 0.22, 16, 'x'); emit('body', 'Under', place(b, (0, ay, 0.39)))
    emit('body', 'Under', place(lathe([(-0.10, 0.0), (-0.09, 0.08), (0.0, 0.13), (0.09, 0.08), (0.10, 0.0)], 16, 'y'), (0.12, ay, 0.39)))
add_box('body', 'Under', (0.7, 0.6, 0.18), (0, 0.65, 0.36), bevel=0.02)

# ================================================================== the cabin
FLOOR = 0.32
add_box('body', 'Carpet', (2 * GX - 0.06, YR - 0.06 + 1.0, 0.02), (0, (YR - 0.06 - 1.0) / 2, FLOOR), bevel=0.005)
add_box('body', 'Headliner', (2 * GX - 0.04, RY1 - RY0 - 0.06, 0.012), (0, (RY0 + RY1) / 2, ROOF - 0.058))
for sd in (1, -1):
    # the inner walls behind the rear doors and the cargo area's sides
    add_box('body', 'Interior', (0.02, YR - DOOR_R[0] - 0.04, BELT - FLOOR), (sd * (SX - T - 0.03), (DOOR_R[0] + YR) / 2, (FLOOR + BELT) / 2))
    # the pillars' trims inside
    for y in (DOOR_F[1], DOOR_R[1]): add_box('body', 'Headliner', (0.03, 0.08, PZ1 - PZ0), (sd * (GX - 0.05), y, (PZ0 + PZ1) / 2), bevel=0.01)
# the front doors' cards: a panel, an armrest in leather, a chrome pull, a speaker grille
for sd in (1, -1):
    g = 'door_L' if sd > 0 else 'door_R'
    for (m, size, at, bv) in (('Interior', (0.03, DOOR_F[1] - DOOR_F[0] - 0.04, BELT - FLOOR - 0.06), (SX - T - 0.03, (DOOR_F[0] + DOOR_F[1]) / 2, (FLOOR + BELT) / 2 + 0.02), 0.01),
                              ('Leather', (0.07, 0.42, 0.05), (SX - T - 0.07, (DOOR_F[0] + DOOR_F[1]) / 2 + 0.08, 0.80), 0.018),
                              ('Leather', (0.04, DOOR_F[1] - DOOR_F[0] - 0.10, 0.10), (SX - T - 0.05, (DOOR_F[0] + DOOR_F[1]) / 2, BELT - 0.08), 0.015),
                              ('Metal', (0.02, 0.10, 0.02), (SX - T - 0.055, (DOOR_F[0] + DOOR_F[1]) / 2 - 0.12, 0.93), 0.006),
                              ('Grille', (0.012, 0.16, 0.12), (SX - T - 0.048, DOOR_F[0] + 0.18, 0.52), 0.01)):
        bm = box(size, at)
        if sd < 0: mirror_bm(bm)
        o = obj_from_bm(bm, g, m); bevel_obj(o, bv, 2)
# the dash: its body, a padded top in leather, a brushed-metal band across, the wide screen in a black bezel, four round
# vents, the passenger's grab handle, the glovebox's line, the column
add_box('Dash', 'Dash', (2 * GX - 0.06, 0.30, 0.34), (0, -0.72, 0.98), bevel=0.05, seg=3)
add_box('Dash', 'Leather', (2 * GX - 0.07, 0.30, 0.06), (0, -0.74, 1.15), bevel=0.025, seg=3)
add_box('Dash', 'Metal', (2 * GX - 0.08, 0.01, 0.035), (0, -0.565, 0.94), bevel=0.004)
add_box('Dash', 'Trim', (0.92, 0.03, 0.19), (0.22, -0.585, 1.10), bevel=0.012, rot=Matrix.Rotation(math.radians(-10), 4, 'X'))
for x in (0.73, 0.10, -0.12, -0.73):
    emit('Dash', 'Metal', place(torus(0.045, 0.009, 28, 6), (x, -0.565, 0.86 if abs(x) < 0.5 else 1.02)))
    emit('Dash', 'Grille', place(lathe([(0.0, 0.0), (0.01, 0.042)], 20, 'y'), (x, -0.56, 0.86 if abs(x) < 0.5 else 1.02)))
    add_box('Dash', 'Metal', (0.075, 0.008, 0.008), (x, -0.552, 0.86 if abs(x) < 0.5 else 1.02))
add_box('Dash', 'Metal', (0.34, 0.035, 0.025), (-0.42, -0.53, 0.99), bevel=0.012, seg=3)
for xx in (-0.27, -0.57): add_box('Dash', 'Metal', (0.025, 0.06, 0.04), (xx, -0.55, 0.99), bevel=0.008)
add_box('Dash', 'Trim', (0.50, 0.006, 0.004), (-0.42, -0.566, 0.80))
add_box('Dash', 'Dash', (0.10, 0.12, 0.22), (0.40, -0.57, 0.92), bevel=0.03, rot=Matrix.Rotation(math.radians(-24), 4, 'X'))
# the console: its body, the armrest, a selector, three buttons in a row on the dash's foot
add_box('Dash', 'Dash', (0.26, 1.00, 0.40), (0, -0.20, FLOOR + 0.20), bevel=0.03)
add_box('Dash', 'Leather', (0.24, 0.36, 0.06), (0, 0.10, FLOOR + 0.42), bevel=0.025, seg=3)
add_box('Dash', 'Metal', (0.20, 0.30, 0.01), (0, -0.30, FLOOR + 0.40), bevel=0.004)
emit('Dash', 'Metal', place(lathe([(0.0, 0.0), (0.0, 0.03), (0.04, 0.03), (0.05, 0.02), (0.05, 0.0)], 20, 'y'), (0, -0.40, FLOOR + 0.41), Matrix.Rotation(PI / 2, 4, 'X')))
for k in range(3): add_box('Dash', 'Chrome', (0.04, 0.02, 0.025), (-0.06 + k * 0.06, -0.575, 0.765), bevel=0.006)
# the screen: one wide glass panel across the driver's half of the dash, facing him
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
bmesh.ops.scale(bm, vec=Vector((0.86, 0.16, 1)), verts=bm.verts)
bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=Matrix.Rotation(math.radians(-80), 4, 'X'))
bmesh.ops.translate(bm, vec=Vector((0.22, -0.567 - 0.003, 1.10)), verts=bm.verts)
so = obj_from_bm(bm, 'Screen', 'Screen'); so.name = 'Screen'; so.data.name = 'Screen'
# the seats: quilted, each cushion and back a centre of tucks between two bolsters, a headrest on posts
SEAT_X, SEAT_Y, CUSH = 0.40, -0.13, 0.60
def seat(group, x, y, w=0.52, bench=False):
    tilt = Matrix.Rotation(math.radians(-14 if not bench else -12), 4, 'X')
    cw = w - 0.12
    add_box(group, 'Leather', (w - 0.18, 0.40, CUSH - 0.13 - FLOOR), (x, y, FLOOR + (CUSH - 0.13 - FLOOR) / 2), bevel=0.02)
    for sx in (-1, 1): add_box(group, 'Leather', (0.07, 0.52, 0.15), (x + sx * (w / 2 - 0.035), y, CUSH - 0.055), bevel=0.03, seg=3)
    for k in range(5):
        add_box(group, 'Leather', (cw - 0.01, 0.094, 0.11), (x, y - 0.21 + k * 0.105, CUSH - 0.075), bevel=0.035, seg=3)
        # (a contrast stitch along each tuck's top, both edges)
        for e in (-0.034, 0.034): add_box(group, 'Stitch', (cw - 0.05, 0.003, 0.003), (x, y - 0.21 + k * 0.105 + e, CUSH - 0.019))
    for sx in (-1, 1): add_box(group, 'Stitch', (0.003, 0.48, 0.003), (x + sx * (w / 2 - 0.068), y, CUSH + 0.019))
    # (the back: its tucks and bolsters turned with it about its foot)
    by, bz = y + 0.30, CUSH + 0.31
    def back(size, off, bv, m='Leather'):
        bm = box(size, (0, 0, 0)); bmesh.ops.translate(bm, vec=Vector(off), verts=bm.verts)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=Vector(), matrix=tilt); bmesh.ops.translate(bm, vec=Vector((x, by, bz)), verts=bm.verts)
        o = obj_from_bm(bm, group, m)
        if bv > 0: bevel_obj(o, bv, 3)
    back((w, 0.10, 0.64), (0, 0.02, 0), 0.03)
    for sx in (-1, 1): back((0.075, 0.13, 0.58), (sx * (w / 2 - 0.035), -0.02, -0.01), 0.032)
    for k in range(6):
        back((cw - 0.01, 0.06, 0.088), (0, -0.045, -0.24 + k * 0.095), 0.028)
        for e in (-0.03, 0.03): back((cw - 0.05, 0.003, 0.003), (0, -0.0765, -0.24 + k * 0.095 + e), 0, 'Stitch')
    if not bench:
        back((0.28, 0.10, 0.17), (0, 0.03, 0.43), 0.045)
        for sx in (-0.08, 0.08): back((0.012, 0.012, 0.10), (sx, 0.03, 0.33), 0.004)
for (sd, sk) in ((1, 'L'), (-1, 'R')): seat(f'Seat_{sk}', sd * SEAT_X, SEAT_Y)
seat('Seat_back', 0, 1.38, w=1.42, bench=True)
for sx in (-0.45, 0.45):
    add_box('Seat_back', 'Leather', (0.26, 0.09, 0.15), (sx, 1.38 + 0.36, CUSH + 0.70), bevel=0.04, seg=3)
# the cargo floor and the back of the bench
add_box('body', 'Carpet', (2 * GX - 0.08, 0.40, 0.02), (0, YR - 0.26, 0.55), bevel=0.005)
# the steering wheel: its rim, the hub (a plain pad, no emblem) and three spokes; its axis toward the driver and up (as
# gt.js's yoke: 0.42 rad)
WHEEL_AT = Vector((SEAT_X, -0.47, 1.00)); axis = Vector((0, math.cos(0.42), math.sin(0.42)))
q = Vector((0, 0, 1)).rotation_difference(axis).to_matrix().to_4x4()
def sw(group_name, m, bm):
    bmesh.ops.transform(bm, matrix=Matrix.Translation(WHEEL_AT) @ q, verts=bm.verts)
    o = obj_from_bm(bm, group_name, m); o.name = group_name; o.data.name = group_name; return o
rimb = torus(0.18, 0.019, 48, 10, axis='y')
bmesh.ops.rotate(rimb, verts=rimb.verts, cent=Vector(), matrix=Matrix.Rotation(PI / 2, 4, 'X'))
sw('Steering_wheel_rim', 'Steering_wheel', rimb)
hub = lathe([(-0.03, 0.0), (-0.03, 0.06), (0.0, 0.068), (0.025, 0.06), (0.03, 0.0)], 28, 'y'); bmesh.ops.rotate(hub, verts=hub.verts, cent=Vector(), matrix=Matrix.Rotation(PI / 2, 4, 'X'))
sw('Steering_wheel_hub', 'Steering_wheel', hub)
sp = bmesh.new()
for (a, L) in ((0, 0.13), (PI, 0.13), (-PI / 2, 0.13)):
    b = box((L, 0.035, 0.014), (L / 2 + 0.05, 0, 0)); bmesh.ops.rotate(b, verts=b.verts, cent=Vector(), matrix=Matrix.Rotation(a, 4, 'Z'))
    me = bpy.data.meshes.new('t'); b.to_mesh(me); b.free(); sp.from_mesh(me); bpy.data.meshes.remove(me)
sw('Steering_wheel_spokes', 'Metal', sp)

# ================================================================== the wheels
def wheel(c, at, outer):
    """c: corner; outer: +1 if its face looks to +x"""
    g = f'wheel_{c}'; built = []
    def put(bm, m, name, smooth=40):
        if outer < 0: mirror_bm(bm)
        bmesh.ops.translate(bm, vec=Vector(at), verts=bm.verts)
        o = obj_from_bm(bm, g, m, smooth); o['wkey'] = f'{g}_{name}'; built.append(o)
    # the tyre: its carcass with three circumferential grooves in the tread, a ribbed band and a rim guard on the sidewall
    h = TW / 2
    prof = tyre_profile()
    tread = []
    for (u, r) in prof:
        tread.append((u, r))
    # (the grooves: cut into the tread's flat between its shoulders)
    P = prof[:6] + [(-h + 0.03, TR), (-0.072, TR), (-0.068, TR - 0.011), (-0.056, TR - 0.011), (-0.052, TR), (-0.012, TR), (-0.008, TR - 0.011), (0.008, TR - 0.011), (0.012, TR),
                    (0.052, TR), (0.056, TR - 0.011), (0.068, TR - 0.011), (0.072, TR), (h - 0.03, TR)] + prof[8:]
    tb = lathe(P, 60, 'x'); put(tb, 'Tire', 'tire')
    # shoulder blocks, every 7.5 degrees, both shoulders, staggered (the chunky edge of the tread)
    bb = bmesh.new()
    for k in range(48):
        for s in (-1, 1):
            a = 2 * PI * (k + (0.5 if s > 0 else 0)) / 48
            b = box((0.04, 0.026, 0.008), (s * (h - 0.05), 0, TR - 0.002))
            bmesh.ops.rotate(b, verts=b.verts, cent=Vector(), matrix=Matrix.Rotation(a, 4, 'X'))
            me = bpy.data.meshes.new('t'); b.to_mesh(me); b.free(); bb.from_mesh(me); bpy.data.meshes.remove(me)
    put(bb, 'Tire', 'tire', smooth=20)
    # (the sidewall's raised ring and ribs, on its outer face)
    ring = lathe([(h + 0.010, 0.300), (h + 0.016, 0.304), (h + 0.016, 0.318), (h + 0.010, 0.322)], 60, 'x'); put(ring, 'Tire', 'tire')
    rb = bmesh.new()
    for k in range(40):
        a = 2 * PI * k / 40
        b = box((0.006, 0.012, 0.030), (h + 0.012, 0, 0.345)); bmesh.ops.rotate(b, verts=b.verts, cent=Vector(), matrix=Matrix.Rotation(a, 4, 'X'))
        me = bpy.data.meshes.new('t'); b.to_mesh(me); b.free(); rb.from_mesh(me); bpy.data.meshes.remove(me)
    put(rb, 'Tire', 'tire', smooth=20)
    # (raised sidewall marks in two arcs, top and bottom, like a size and load line: plain blocks of varied width, no words)
    lb = bmesh.new(); import random; rnd = random.Random(7)
    for base in (PI / 2, -PI / 2):
        a = base - 0.55
        while a < base + 0.55:
            wdt = rnd.choice((0.006, 0.009, 0.012, 0.016)); da = wdt / 0.33 + 0.006 / 0.33
            if rnd.random() < 0.85:
                b = box((0.003, wdt, 0.014), (h + 0.0115, 0, 0.33)); bmesh.ops.rotate(b, verts=b.verts, cent=Vector(), matrix=Matrix.Rotation(a, 4, 'X'))
                me = bpy.data.meshes.new('t'); b.to_mesh(me); b.free(); lb.from_mesh(me); bpy.data.meshes.remove(me)
            a += da
    put(lb, 'Tire', 'tire', smooth=20)
    # the rim: its barrel (dark), a polished lip, the face's six twin spokes, the hub, six lug nuts, a plain cap
    R = RIM_R
    barrel = lathe([(-h + 0.02, R - 0.004), (-h + 0.02, R - 0.02), (h - 0.06, R - 0.03), (h - 0.03, R - 0.05), (h - 0.015, R - 0.03), (h - 0.008, R - 0.004)], 48, 'x')
    put(barrel, 'Rim', 'rim')
    lip = lathe([(h - 0.012, R - 0.024), (h + 0.004, R - 0.014), (h + 0.006, R + 0.006), (h - 0.004, R + 0.01)], 48, 'x'); put(lip, 'Rim_lip', 'rimlip')
    spk = bmesh.new()
    for k in range(6):
        for d in (-1, 1):
            a = 2 * PI * k / 6 + d * 0.085
            L = R - 0.09
            b = bmesh.new(); bmesh.ops.create_cube(b, size=1.0)
            bmesh.ops.scale(b, vec=Vector((0.034, L, 0.032)), verts=b.verts)
            for v in b.verts:
                t = (v.co.y + L / 2) / L
                v.co.z *= 1.0 - 0.35 * t                 # (tapering outward)
                v.co.x -= 0.045 * t                       # (dished: the spoke's outer end set back)
            bmesh.ops.translate(b, vec=Vector((h - 0.02, L / 2 + 0.07, 0)), verts=b.verts)
            bmesh.ops.rotate(b, verts=b.verts, cent=Vector(), matrix=Matrix.Rotation(a, 4, 'X'))
            me = bpy.data.meshes.new('t'); b.to_mesh(me); b.free(); spk.from_mesh(me); bpy.data.meshes.remove(me)
    put(spk, 'Rim', 'rim', smooth=30)
    hubb = lathe([(h - 0.05, 0.0), (h - 0.05, 0.085), (h - 0.012, 0.085), (h - 0.006, 0.07), (h - 0.004, 0.0)], 36, 'x'); put(hubb, 'Rim', 'rim')
    cap = lathe([(h - 0.006, 0.0), (h + 0.004, 0.0), (h + 0.004, 0.028), (h - 0.006, 0.032)], 28, 'x'); put(cap, 'Rim_lip', 'rimlip')
    nb = bmesh.new()
    for k in range(6):
        a = 2 * PI * (k + 0.5) / 6
        b = lathe([(-0.01, 0.0), (-0.01, 0.011), (0.006, 0.011), (0.012, 0.007), (0.012, 0.0)], 6, 'x')
        bmesh.ops.translate(b, vec=Vector((h - 0.004, 0.055 * math.cos(a), 0.055 * math.sin(a))), verts=b.verts)
        me = bpy.data.meshes.new('t'); b.to_mesh(me); b.free(); nb.from_mesh(me); bpy.data.meshes.remove(me)
    put(nb, 'Chrome', 'rimnuts', smooth=20)
    # the brake: a disc (spins) and a caliper (steers, does not spin: wagmi/storyrun/gwagon.js)
    disc = lathe([(-0.016, 0.09), (-0.016, 0.19), (0.016, 0.19), (0.016, 0.09)], 40, 'x'); bmesh.ops.translate(disc, vec=Vector((h - 0.115, 0, 0)), verts=disc.verts)
    put(disc, 'Disc', 'disc')
    cal = bmesh.new()
    for (cy_, cz_) in ((0.0, 0.0),):
        b = bmesh.new(); prof2 = []
        n = 8; r0, r1 = 0.15, 0.215
        for i in range(n + 1):
            a = math.radians(95 + 70 * i / n)
            prof2.append((r0 * math.cos(a), r0 * math.sin(a)));
        outer_ = [(r1 * math.cos(math.radians(95 + 70 * i / n)), r1 * math.sin(math.radians(95 + 70 * i / n))) for i in range(n + 1)][::-1]
        loop = prof2 + outer_
        vs = [b.verts.new((h - 0.095, y, z)) for (y, z) in loop]
        f = b.faces.new(vs)
        ex = bmesh.ops.extrude_face_region(b, geom=[f]); nv = [e for e in ex['geom'] if isinstance(e, bmesh.types.BMVert)]
        bmesh.ops.translate(b, vec=Vector((-0.06, 0, 0)), verts=nv)
        bmesh.ops.recalc_face_normals(b, faces=b.faces)
        me = bpy.data.meshes.new('t'); b.to_mesh(me); b.free(); cal.from_mesh(me); bpy.data.meshes.remove(me)
    put(cal, 'Caliper', 'caliper', smooth=30)
    return built
for (c, y, sd) in (('FL', AXF, 1), ('FR', AXF, -1), ('BL', AXR, 1), ('BR', AXR, -1)):
    wheel(c, (sd * TRACK / 2, y, TR), sd)
# the spare's rim (behind its cover, seen from the side)
srim = lathe([(-TW / 2 + 0.02, RIM_R - 0.004), (TW / 2 - 0.02, RIM_R - 0.004), (TW / 2 - 0.02, 0.0)], 40, 'x'); bmesh.ops.rotate(srim, verts=srim.verts, cent=Vector(), matrix=Matrix.Rotation(PI / 2, 4, 'Z'))
emit('spare', 'Rim', place(srim, (0, SPY, SPZ)))

# ================================================================== join, name, export
# every part by group and material, one object each (the doors door_<side>_<material>, the wheels' parts kept apart by
# name), smooth within its angle
from collections import defaultdict
groups = defaultdict(list)
for (g, m, o) in parts:
    if o.name not in [x.name for x in sc.objects]: continue
    if g.startswith('wheel_'): groups[('__self__', o['wkey'])].append(o)
    elif o.name.startswith('Steering_wheel') or o.name == 'Screen': groups[('__self__', o.name)].append(o)
    else: groups[(g, m)].append(o)
final = []
for (g, m), objs in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = m if g == '__self__' else g if (g == m or (g.startswith('Seat_') and m == 'Leather')) else f'{g}_{m}'
    o.data.name = o.name
    ang = o.get('smooth', 35)
    bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0002)
    # (the paint's UVs: a box projection in metres / 0.3, so the game's flake map lies at one scale over every panel)
    if m in ('Paint', 'Mirror_cap'):
        uvl = bm.loops.layers.uv.new('UVMap')
        for f in bm.faces:
            n = f.normal; ax = max(range(3), key=lambda i: abs(n[i])); u_, v_ = [i for i in range(3) if i != ax]
            for l in f.loops: l[uvl].uv = (l.vert.co[u_] / 0.3, l.vert.co[v_] / 0.3)
    bm.to_mesh(o.data); bm.free()
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(ang), keep_sharp_edges=True)
    final.append(o)
# (each material its own plain colour, so the pack's dedup keeps them apart by name; the game finishes each by name)
import hashlib
for m in bpy.data.materials:
    h = hashlib.md5(m.name.encode()).hexdigest()
    rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    m.diffuse_color = (*rgb, 1); m.use_nodes = True
    bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf: bsdf.inputs['Base Color'].default_value = (*rgb, 1)
tris = 0; per = {}
for o in sc.objects:
    if o.type != 'MESH': continue
    n = sum(len(p.vertices) - 2 for p in o.data.polygons); tris += n; per[o.name] = n
log = {'tris': tris, 'objects': len([o for o in sc.objects if o.type == 'MESH']), 'top': sorted(per.items(), key=lambda kv: -kv[1])[:12]}
print('BUILDLOG', json.dumps(log))
if DEBUG: bpy.ops.wm.save_as_mainfile(filepath=DEBUG)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_image_format='NONE', export_apply=True, export_yup=True,
    export_texcoords=True, export_normals=True, export_materials='EXPORT', export_extras=False, export_cameras=False, export_lights=False, export_animations=False)
