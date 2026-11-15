# tools/hometown/looks.py (stage 0): a building's or part's walls, colours and roof from the OSM tags Overture carries
# (building:colour -> facade_color, roof:colour -> roof_color, building:material -> facade_material, roof:material ->
# roof_material, roof:shape -> roof_shape). Pure functions of one row's values: integer, deterministic, no state.
# What the engine gets (sf-buildings v4 fields, compile.BFIELDS): wall (a WALLS index), wallRGB / roofRGB (0xRRGGBB,
# 0 = none: the engine's region palette), facade (a FACADES index: the tower curtain-wall choice).
#
# The colours are clamped so a tag never paints a block pure black, pure white or neon: lightness into
# [L_MIN, L_MAX], saturation at most S_WALL (walls) / S_ROOF (roofs). A colour that comes out 0x000000 is written
# 0x010101 (0 reads as "no colour").
import colorsys
import re

L_MIN, L_MAX = 0.18, 0.90
S_WALL, S_ROOF = 0.55, 0.60
HEX = re.compile(r'^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$')
# (the few colour names OSM mappers type instead of a hex; Overture passes them through as written)
NAMES = {'white': 0xffffff, 'black': 0x000000, 'grey': 0x808080, 'gray': 0x808080, 'red': 0xa0403a, 'brown': 0x7a5a44, 'yellow': 0xe0c870,
         'beige': 0xd8cbb0, 'tan': 0xc8b090, 'blue': 0x5a7090, 'green': 0x5f7a58, 'orange': 0xc07a48, 'silver': 0xc0c0c0, 'maroon': 0x703838,
         'cream': 0xefe6cf, 'pink': 0xd8a8a0, 'darkgrey': 0x505050, 'darkgray': 0x505050, 'lightgrey': 0xc8c8c8, 'lightgray': 0xc8c8c8}
# building:material -> compile.WALLS name
WALL_OF = {'brick': 'brick', 'stone': 'stone', 'sandstone': 'stone', 'limestone': 'stone', 'granite': 'stone', 'marble': 'stone',
           'concrete': 'concrete', 'cement_block': 'concrete', 'reinforced_concrete': 'concrete', 'plaster': 'stucco', 'stucco': 'stucco',
           'render': 'stucco', 'wood': 'wood', 'timber_framing': 'wood', 'log': 'wood', 'metal': 'metal', 'steel': 'metal', 'aluminium': 'metal',
           'metal_plates': 'metal', 'glass': 'glass', 'mirror': 'glass', 'vinyl': 'siding', 'plastic': 'siding', 'clapboard': 'clapboard',
           'wood_siding': 'clapboard', 'adobe': 'stucco'}
# building:material -> compile.FACADES name (towers and midrises only: their curtain wall)
FACADE_OF = {'glass': 'glass', 'mirror': 'glass', 'metal': 'metal', 'steel': 'metal', 'aluminium': 'metal', 'metal_plates': 'metal',
             'concrete': 'concrete', 'reinforced_concrete': 'concrete', 'stone': 'stone', 'sandstone': 'stone', 'limestone': 'stone',
             'granite': 'stone', 'marble': 'stone', 'brick': 'terracotta'}
# roof:material -> a roof colour when roof:colour is not tagged
ROOF_MAT = {'slate': 0x4a4f55, 'roof_tiles': 0xa95f45, 'tile': 0xa95f45, 'copper': 0x6f9c8a, 'metal': 0x8e9396, 'tin': 0x8e9396,
            'metal_sheet': 0x8e9396, 'concrete': 0x8e8e89, 'tar_paper': 0x5a5a58, 'asphalt': 0x5a5a58, 'asphalt_shingle': 0x605c58,
            'eternit': 0x8a8a86, 'glass': 0x9fb3bc, 'grass': 0x6f8a52, 'gravel': 0x9a968e, 'wood': 0x7a6450, 'thatch': 0x9a8458,
            'stone': 0x8a8580}


def parse_rgb(v):
    """'#RRGGBB' / '#RGB' / a few names -> int, or None."""
    if v is None:
        return None
    s = str(v).strip().lower().replace(' ', '')
    if s in NAMES:
        return NAMES[s]
    m = HEX.match(s)
    if not m:
        return None
    h = m.group(1)
    if len(h) == 3:
        h = ''.join(ch * 2 for ch in h)
    return int(h, 16)


def clamp_rgb(rgb, smax):
    """int 0xRRGGBB -> int, lightness in [L_MIN, L_MAX] and saturation at most smax (HLS); never 0 (0x010101)."""
    r, g, b = ((rgb >> 16) & 255) / 255.0, ((rgb >> 8) & 255) / 255.0, (rgb & 255) / 255.0
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    l = min(L_MAX, max(L_MIN, l))
    s = min(smax, s)
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    out = (int(round(r * 255)) << 16) | (int(round(g * 255)) << 8) | int(round(b * 255))
    return out or 0x010101


def wall_rgb(v):
    rgb = parse_rgb(v)
    return 0 if rgb is None else clamp_rgb(rgb, S_WALL)


def roof_rgb(color, material=None):
    rgb = parse_rgb(color)
    if rgb is None:
        m = (material or '').strip().lower()
        rgb = ROOF_MAT.get(m)
    return 0 if rgb is None else clamp_rgb(rgb, S_ROOF)


def wall_name(material):
    return WALL_OF.get((material or '').strip().lower())


def facade_name(material):
    return FACADE_OF.get((material or '').strip().lower())


def look_of(ex, parent=None):
    """{wall, facade, wallRGB, roofRGB} names / ints of one extras row (dict); a part's own values win over its parent's."""
    ex = ex or {}
    parent = parent or {}
    mat = ex.get('facade_material') or parent.get('facade_material')
    return {'wall': wall_name(mat), 'facade': facade_name(mat),
            'wallRGB': wall_rgb(ex.get('facade_color') or parent.get('facade_color')),
            'roofRGB': roof_rgb(ex.get('roof_color') or (None if ex.get('roof_material') else parent.get('roof_color')),
                                ex.get('roof_material') or parent.get('roof_material'))}
