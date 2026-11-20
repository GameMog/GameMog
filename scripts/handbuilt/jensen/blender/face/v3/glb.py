import json, struct, numpy as np
CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8, 5122: np.int16, 5120: np.int8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def read(path):
    b = open(path, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]
    J = json.loads(b[20:20 + n]); o = 20 + n; bl = struct.unpack('<I', b[o:o + 4])[0]; B = b[o + 8:o + 8 + bl]
    def acc(i):
        a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]; dt = CT[a['componentType']]; nc = NC[a['type']]
        st = bv.get('byteStride'); off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        if st and st != nc * np.dtype(dt).itemsize:
            raw = np.frombuffer(B, np.uint8, a['count'] * st, off).reshape(a['count'], st)[:, :nc * np.dtype(dt).itemsize]
            return np.frombuffer(raw.tobytes(), dt).reshape(a['count'], nc)
        return np.frombuffer(B, dt, a['count'] * nc, off).reshape(a['count'], nc) if nc > 1 else np.frombuffer(B, dt, a['count'], off)
    return J, acc
