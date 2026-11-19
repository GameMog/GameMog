# dumptex.py GLB OUTDIR : the skin's and the eyes' textures as png (+ material json)
import sys, json, struct, io, os; from PIL import Image
p, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
b = open(p, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]; J = json.loads(b[20:20 + n]); o = 20 + n; bl = struct.unpack('<I', b[o:o + 4])[0]; B = b[o + 8:o + 8 + bl]
def img(ti):
    t = J['textures'][ti]; src = t.get('source', t.get('extensions', {}).get('EXT_texture_webp', {}).get('source')); im = J['images'][src]; bv = J['bufferViews'][im['bufferView']]
    return Image.open(io.BytesIO(B[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]))
for m in J['materials']:
    if m['name'] not in ('skin', 'eyes'): continue
    print(m['name'], json.dumps({k: v for k, v in m.items() if k != 'name'})[:600])
    pb = m.get('pbrMetallicRoughness', {})
    for key, ti in (('albedo', pb.get('baseColorTexture', {}).get('index')), ('mr', pb.get('metallicRoughnessTexture', {}).get('index')), ('normal', m.get('normalTexture', {}).get('index'))):
        if ti is None: continue
        im = img(ti); im.save(f"{out}/{m['name']}-{key}.png"); print(' ', key, im.size, im.mode)
