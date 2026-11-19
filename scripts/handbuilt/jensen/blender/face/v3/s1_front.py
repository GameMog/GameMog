# cameras for the frontal correspondence render of the current head
from common import *
H = model.Head(); c = view_cams(H.P0, H, (('front', 0),), f=4200, W=1000, Hh=1000, dy=0.0)
json.dump(c, open(WK + '/cam-front.json', 'w')); print('mapped', (H.map >= 0).sum(), 'scale', H.s, 'skin tris', len(H.skinTris))
