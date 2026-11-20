# dump the skinned jacket objects to export/ for s90 (same as s80/s82's dump), as a function
import bpy, bmesh, numpy as np, json, os
import lib
JN = lib.JN
def dump(H, L, M, T, SN):
    # ---- dump for the GLB writer (same as s80's)
    def weights(o):
        W = np.zeros((len(o.data.vertices), len(JN)), np.float32); gi = {g.index: JN.index(g.name) for g in o.vertex_groups if g.name in JN}
        for v in o.data.vertices:
            for g in v.groups:
                if g.group in gi: W[v.index, gi[g.group]] = g.weight
        return W
    def cap(W):
        J4 = np.argsort(-W, 1)[:, :4]; W4 = np.take_along_axis(W, J4, 1); W4 = np.clip(W4, 0, None)
        W4[W4 < 0.01] = 0; W4 /= np.maximum(W4.sum(1, keepdims=True), 1e-9); J4 = np.where(W4 > 0, J4, 0); return J4, W4
    for o in (L, M, T, SN):
        bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(o.data); bm.free()
    os.makedirs(H + '/export', exist_ok=True)
    info = {}
    for o, name in ((L, 'leather'), (M, 'hardware'), (T, 'zip-tape'), (SN, 'snaps')):
        m = o.data; m.calc_loop_triangles(); has_uv = len(m.uv_layers) > 0
        if has_uv: m.calc_tangents(uvmap=m.uv_layers[0].name)
        keys = {}; pos = []; nor = []; uv = []; tan = []; jj = []; ww = []; tri = []
        Wv = weights(o); Jv, Wv4 = cap(Wv)
        for lt in m.loop_triangles:
            t_ = []
            for li in lt.loops:
                l = m.loops[li]; vi = l.vertex_index
                u = tuple(np.round(m.uv_layers[0].data[li].uv, 6)) if has_uv else (0.0, 0.0)
                key = (vi, u, tuple(np.round(l.normal, 4)))
                if key not in keys:
                    keys[key] = len(pos); pos.append(m.vertices[vi].co[:]); nor.append(l.normal[:]); uv.append((u[0], 1 - u[1]))
                    tan.append((*l.tangent[:], l.bitangent_sign) if has_uv else (1, 0, 0, 1)); jj.append(Jv[vi]); ww.append(Wv4[vi])
                t_.append(keys[key])
            tri.append(t_)
        pos = lib.b2g(np.array(pos)).astype(np.float32); nor = lib.b2g(np.array(nor)).astype(np.float32)
        tan = np.array(tan, np.float32); tg = lib.b2g(tan[:, :3]).astype(np.float32); tan = np.concatenate([tg, tan[:, 3:]], 1)
        for arr, nm in ((pos, 'pos'), (nor, 'nor'), (np.array(uv, np.float32), 'uv'), (tan, 'tan'), (np.array(jj, np.uint16), 'j'), (np.array(ww, np.float32), 'w'), (np.array(tri, np.uint32).ravel(), 'idx')):
            arr.tofile(H + f'/export/{name}.{nm}.bin')
        info[name] = {'verts': len(pos), 'tris': len(tri)}
    json.dump(info, open(H + '/export/info.json', 'w')); print('dump', info)