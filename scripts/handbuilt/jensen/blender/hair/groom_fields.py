# shared groom fields (exec'd by groom.py and cards.py; needs D, EY, EZ, HC, sm, np, math, json in scope)
PRM = json.load(open(D + '/params.json'))
_FRONT = PRM.get('front', 0.043)
def _hn(x, z):
    # (the hairline's irregular soft edge: two octaves of smooth wobble along it, +-~3 mm)
    return 0.6 * math.sin(x * 210 + 1.3) + 0.4 * math.sin(x * 470 + 4.1) + 0.3 * math.sin(z * 380 + 0.7)

def hair_area(x0, y, z, n=0.0, front=None, temple=0.006):
    x = abs(x0); front = _FRONT if front is None else front
    w = _hn(x0, z) * 0.0015
    yf = EY + front + 0.008 * sm(0.018, 0.048, x) + n * 0.002 + w; f = sm(yf - 0.003, yf + 0.004, y)
    zt = EZ - 0.038 + temple - 0.03 * sm(EY + 0.05, EY - 0.005, y) + n * 0.002
    ysb = EY - 0.012 - 0.05 * sm(0.03, -0.02, z) + n * 0.002
    side = sm(zt + 0.004, zt - 0.004, z) * sm(ysb - 0.003, ysb + 0.004, y) * sm(0.03, 0.05, x + 0.04 * sm(0.0, -0.05, z))
    ex = (y - (EY - 0.024)) / 0.028; ez = (z - 0.03) / 0.024; ed = math.hypot(ex, ez); ear = sm(0.058, 0.07, x) * sm(1.12, 0.96, ed)
    return float(np.clip(max(f, side) * (1 - ear), 0, 1))

def region(q):
    top = sm(EY + 0.03, EY + 0.08, q[1])
    front = sm(HC[2] - 0.03, HC[2] + 0.06, q[2])
    back = sm(HC[2] - 0.035, HC[2] - 0.095, q[2])
    low = sm(EY + 0.035, EY - 0.03, q[1])
    # (at the front the top starts lower: the quiff stands off the forehead's top from the hairline up; and the sides of
    # the skull's top (the parietal ridges) keep a little less, so the head of hair isn't wider than the head)
    top = max(top, sm(EY + 0.028, EY + 0.062, q[1]) * sm(HC[2] + 0.04, HC[2] + 0.075, q[2]))
    top *= 1 - PRM.get('ridgeCut', 0.35) * sm(0.042, 0.068, abs(q[0]))
    return top, front, back, low

def thick(q):
    top, front, back, low = region(q)
    Ht = (1 - front) * PRM['Hcrown'] + front * PRM['Hfront']
    Hu = (1 - top) * PRM['Hside'] + top * Ht
    Hb = (1 - low) * ((1 - top) * PRM['Hside'] * 1.3 + top * PRM['Hback']) + low * PRM['Hnape']
    return Hu * (1 - back) + Hb * back

def length(q):
    top, front, back, low = region(q)
    Lt = (1 - front) * PRM['Lcrown'] + front * PRM['Lfront']
    Lu = (1 - top) * PRM['Lside'] + top * Lt
    Lb = (1 - low) * ((1 - top) * PRM['Lside'] + top * PRM['Lback']) + low * PRM['Lnape']
    return Lu * (1 - back) + Lb * back
