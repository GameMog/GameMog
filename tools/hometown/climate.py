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
#
# The warm band (warmth(): what grows there and how it is built, never the ground class, so zone() and the far field are
# as before): a coarse Koppen A / warm-C rule from longitude / latitude alone, deterministic, no place named
#   tropical     inside the tropics (|lat| < 23.5: Hawaii, Puerto Rico and the Virgin Islands, Guam and the Marianas,
#                American Samoa) and the Florida peninsula south of 27.0 N (Am / Aw: Miami, the Keys, Palm Beach, Naples)
#   subtropical  the rest of the peninsula south of 29.2 N (Tampa, Orlando, Daytona: palms, live oaks) and the south
#                Texas coast and Rio Grande valley (south of 28.0 N between -99.6 and -96.8: Corpus Christi,
#                Brownsville, McAllen, Laredo)
#   None         everywhere else
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


TROPICAL, SUBTROPICAL = 'tropical', 'subtropical'
FLORIDA = (-83.0, -79.8)          # the peninsula's longitudes (west of the Atlantic coast, east of the Gulf's Big Bend)
FLORIDA_TROPICAL, FLORIDA_SUBTROPICAL = 27.0, 29.2
TEXAS = (-99.6, -96.8, 28.0)      # the south Texas coast and the Rio Grande valley: lon west, east, lat north


def in_florida(lon, lat):
    """The Florida peninsula and the Keys (south of FLORIDA_SUBTROPICAL; the panhandle is not in it)."""
    return FLORIDA[0] < lon < FLORIDA[1] and 24.3 < lat < FLORIDA_SUBTROPICAL


def warmth(lon, lat):
    """'tropical' | 'subtropical' | None at one point (lon / lat in degrees; lon may be normalised past -180)."""
    lon, lat = float(lon), float(lat)
    if abs(lat) < 23.5:
        return TROPICAL
    if in_florida(lon, lat):
        return TROPICAL if lat < FLORIDA_TROPICAL else SUBTROPICAL
    if TEXAS[0] < lon < TEXAS[1] and 24.0 < lat < TEXAS[2]:
        return SUBTROPICAL
    return None


def zone_name(lon, lat):
    """The climate a tile header names: the warm band where there is one, else the ground zone ('humid' | 'arid' | 'dry')."""
    return warmth(lon, lat) or zone(lon, lat)
