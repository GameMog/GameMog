import sys as _s; _a=_s.argv[1:]; _s.argv=['solve.py']
from solve import *
rows = corr_to_mh(CT, CB)
for tag in _a:
    Ad=anchors_mh(rows, np.load(WK+f'/d-{tag}.npy'))
    print(tag, ' '.join(f'{n}{(1000*Ad[i]).round(1).tolist()}' for n,i in (('tip',4),('subn',2),('nasion',168),('ala',48),('ulip',0),('llip',17),('chin',152),('chin2',175),('mcorner',61),('cheekb',117),('jawang',172),('brow',105))))
