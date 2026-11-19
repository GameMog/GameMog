import numpy as np, sys, os; sys.path.insert(0, os.path.dirname(__file__))
from scalp import Scalp, region, vnormals
sc = Scalp(n=1000)
P, IX = sc.P, sc.HIX; N = vnormals(P, IX)
used = np.unique(IX); r = region(P)
col = np.where((r > 0)[:, None], [0.8, 0.1, 0.1], [0.9, 0.75, 0.6]); col[(r > -3) & (r <= 0)] = [0.2, 0.6, 0.2]
np.savez(sys.argv[1], P=(P + N * 0.0004).astype(np.float32), IX=IX.astype(np.int32).ravel(), COL=col.astype(np.float32))
