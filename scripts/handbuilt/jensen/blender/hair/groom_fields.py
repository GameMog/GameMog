PRM = json.load(open(D + '/params.json'))
def hair_area(x0, y, z, n=0.0, front=0.047, temple=0.006):
    x = abs(x0)
    yf = EY + front + 0.008 * sm(0.015, 0.045, x) + n * 0.002; f = sm(yf - 0.003, yf + 0.004, y)
    zt = EZ - 0.038 + temple - 0.03 * sm(EY + 0.05, EY - 0.005, y) + n * 0.002
    ysb = EY - 0.012 - 0.05 * sm(0.03, -0.02, z) + n * 0.002
    side = sm(zt + 0.004, zt - 0.004, z) * sm(ysb - 0.003, ysb + 0.004, y) * sm(0.03, 0.05, x + 0.04 * sm(0.0, -0.05, z))
    ex = (y - (EY - 0.024)) / 0.028; ez = (z - 0.03) / 0.024; ed = math.hypot(ex, ez); ear = sm(0.058, 0.07, x) * sm(1.1, 0.96, ed)
    return float(np.clip(max(f, side) * (1 - ear), 0, 1))

def region(q):
    top = sm(EY + 0.03, EY + 0.08, q[1])
    front = sm(HC[2] - 0.03, HC[2] + 0.06, q[2])
    back = sm(HC[2] - 0.035, HC[2] - 0.095, q[2])
    low = sm(EY + 0.035, EY - 0.03, q[1])
    return top, front, back, low

def thick(q):
    top, front, back, low = region(q)
    H = (1 - top) * PRM['Hside'] + top * ((1 - front) * PRM['Hcrown'] + front * PRM['Hfront'])
    return H * (1 - back * low) + PRM['Hnape'] * back * low

