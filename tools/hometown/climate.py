# tools/hometown/climate.py: the climate a point's open ground has, from its longitude / latitude alone (coarse Koppen
# groups for the conterminous US; no place is named, no per-town rule): what the land between the houses looks like
# where the map data says nothing (compile.py MASK, the core's default ground and its hillsides) and the far field's
# land class (far.py), so the core and the far ground agree at the core's edge.
#
#   arid   the deserts (BWh / BWk): the Mojave, Sonoran and Chihuahuan south of 37.5 N between the coastal ranges and
#          the Rockies' front (-117 .. -104), and the Great Basin (37.5 .. 42.5 N, -119.8 .. -112): bare tan ground
#   dry    the steppes (BSk / BSh) and the summer-dry coast: everything else west of the 100th meridian (the classic
#          aridity line) except the wet Pacific Northwest and north coast: dry grass and scrub
#   humid  the rest (Cfa / Dfa / Dfb, the Pacific Northwest west of the Cascades, the coast north of 38 N west of -123):
#          green grass, wooded hillsides
import numpy as np

HUMID, ARID, DRY = 0, 2, 3          # (far.py's class numbers: 1 is water there)
NAMES = {HUMID: 'humid', ARID: 'arid', DRY: 'dry'}


def zone_code(lon, lat):
    """Climate code(s) (HUMID, ARID, DRY) at lon / lat (degrees; scalars or arrays)."""
    lon, lat = np.asarray(lon, dtype=float), np.asarray(lat, dtype=float)
    arid = ((lat < 37.5) & (lon > -117.0) & (lon < -104.0)) | ((lat >= 37.5) & (lat < 42.5) & (lon > -119.8) & (lon < -112.0))
    wet_west = ((lon < -121.0) & (lat >= 42.0)) | ((lon < -123.0) & (lat >= 38.0))
    dry = (lon < -100.0) & ~arid & ~wet_west
    out = np.where(arid, ARID, np.where(dry, DRY, HUMID)).astype(np.uint8)
    return out if out.ndim else int(out)


def zone(lon, lat):
    """'humid' | 'arid' | 'dry' at one point."""
    return NAMES[int(zone_code(lon, lat))]
