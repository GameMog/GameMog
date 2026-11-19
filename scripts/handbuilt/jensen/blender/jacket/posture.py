# Posture fix for the cast clips (owner 18 Nov, Art of Manliness posture guide): from the side the ear, shoulder point,
# hip and ankle stack on one plumb line; no sway-back, no forward head, chin level, arms hanging at the sides.
# The idles lean the chest back (shoulders ~7 cm behind the hips); sitTalk slumps toward the screen.
# Fix: a forward (or back) pitch spread over the lumbar/thoracic spine, the neck pitched to bring the ear over the
# shoulder, the head counter-rotated so its world orientation (gaze, chin) is unchanged, and the upper arms
# counter-rotated so they keep hanging as before. Rotation axis = the hips' lateral axis per key (so turning clips
# work). Per clip, constant angles solved numerically from the plumb measurements.
# Writes dump/clips_fixed.json (same format as clips.json) and posture.json (angles + before/after plumb in cm).
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ['CLIPS'] = 'clips.json'
import json, math, copy, numpy as np
from mathutils import Matrix, Vector, Quaternion
import lib
H = os.path.dirname(os.path.abspath(__file__))
SRC = json.load(open(lib.D + 'clips.json'))
JD = {j['name']: j for j in lib.JOINTS}
HEADB = Vector(JD['head']['bind']); EAR_OFF = Vector((0, 0.025, -0.02))  # ear canal from the head joint (bind, glTF)
SPINE = {'spine05': 0.30, 'spine04': 0.30, 'spine03': 0.25, 'spine02': 0.15, 'spine01': 0.0}
ORDER = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01']
def cums(th, ph):
    c = {}; acc = 0.0
    for b in ORDER: acc += th * SPINE[b]; c[b] = acc
    c['neck01'] = th + ph; c['neck02'] = th + ph; c['neck03'] = th + ph; c['head'] = 0.0  # head keeps its world orientation
    for s in ('L', 'R'):
        c['clavicle_' + s] = th; c['shoulder01_' + s] = th; c['upperarm01_' + s] = 0.0   # arms keep hanging as they did
    return c
def parent_cum(c, b):
    p = JD[b]['parent']
    while p and p not in c: p = JD[p]['parent']
    return c.get(p, 0.0) if p else 0.0
def world(clipname, t):
    lib.CL = CUR; return lib.clip_pose(clipname, t)
def plumb(W):
    g = lambda n: W[n].translation
    hip = (g('upperleg01_L') + g('upperleg01_R')) / 2; ank = (g('foot_L') + g('foot_R')) / 2
    sh = (g('upperarm01_L') + g('upperarm01_R')) / 2
    ear = W["head"] @ EAR_OFF   # IBMs are translations: posed = W @ (bind - joint bind)
    # measured along the hips' forward axis (horizontal, square to the lateral axis)
    lat = (g('upperleg01_L') - g('upperleg01_R')); lat.y = 0; lat.normalize(); fwd = lat.cross(Vector((0, 1, 0)))
    if fwd.z < 0 and abs(fwd.z) > abs(fwd.x): pass
    f = lambda p: p.dot(fwd)
    return {'ear': f(ear), 'shoulder': f(sh), 'hip': f(hip), 'ankle': f(ank), 'fwd': fwd}
def axis_at(W):
    lat = W['upperleg01_L'].translation - W['upperleg01_R'].translation; lat.y = 0; return lat.normalized()
_WC = {}
def src_world(name, t):
    k = (name, round(float(t), 5))
    if k not in _WC:
        lib.CL = SRC; _WC[k] = lib.clip_pose(name, float(t))
    return _WC[k]
def corrected(name, th, ph, times=None):
    """the clip's channels with the corrections baked in (each channel at its own key times, or at `times`)"""
    src = SRC['clips'][name]; c = cums(th, ph)
    out = copy.deepcopy(src) if times is None else {}
    for b in c:
        key = b + '|rotation'
        if key not in src: continue
        if times is None:
            T = src[key]['t']; V = np.array(src[key]['v'], np.float64).reshape(len(T), 4)
        else:
            T = list(times); V = np.zeros((len(T), 4))
            for i, t in enumerate(T): q = src_world(name, t)  # filled below from the local
        NV = np.zeros((len(T), 4))
        for i, t in enumerate(T):
            W = src_world(name, t); ax = axis_at(W)
            cp = parent_cum(c, b); cj = c[b]
            Rp = W[JD[b]['parent']].to_quaternion()
            via = Quaternion()
            for v in JD[b].get('via', []):
                if not v['name'].startswith('armhang_'): via = via @ Quaternion((v['r'][3], *v['r'][:3]))
            Rj = W[b].to_quaternion()
            q = (Quaternion(ax, cp) @ Rp @ via).inverted() @ Quaternion(ax, cj) @ Rj; q.normalize()
            q0 = (Rp @ via).inverted() @ Rj
            if q.dot(q0) < 0: q = -q
            NV[i] = [q.x, q.y, q.z, q.w]
        if times is None: out[key]['v'] = NV.ravel().tolist()
        else: out[key] = {'t': T, 'v': NV.ravel().tolist(), 'interp': 'LINEAR'}
    if times is not None:   # every other channel sampled at the same times so the clip is complete
        for key, ch in src.items():
            if key in out: continue
            out[key] = ch
    return out
def measure(name, clipdata, n=9):
    global CUR
    CUR = {'clips': {name: clipdata}}
    T = SRC['clips'][name]['spine05|rotation']['t']; ts = np.linspace(T[0], T[-1], n)
    acc = {'ear': 0, 'shoulder': 0, 'hip': 0, 'ankle': 0}
    for t in ts:
        lib.CL = CUR; p = plumb(lib.clip_pose(name, float(t)))
        for k in acc: acc[k] += p[k] / n
    return acc
# targets (cm, along his forward axis): standing: shoulder over the hip (0.5 cm ahead), ear 1.5 cm ahead of the
# shoulder at most; seated: shoulder 3 cm ahead of the hip (upright, not slumped toward the screen), ear over the shoulder
STAND = ['idle', 'talk', 'phone', 'arms']   # argue/shrug/wave lean IN on purpose (gestures): left as they are
SEAT = ['sitTalk', 'sit']
res = {}; FIX = copy.deepcopy(SRC)
for name in STAND + SEAT:
    T_ = SRC['clips'][name]['spine05|rotation']['t']; TS = [float(t) for t in np.linspace(T_[0], T_[-1], 9)]
    m0 = measure(name, SRC['clips'][name])
    seat = name in SEAT
    def err(th, ph):
        m = measure(name, corrected(name, th, ph, TS))
        tgt_sh = m['hip'] + (0.03 if seat else 0.005)
        return m['shoulder'] - tgt_sh, m['ear'] - (m['shoulder'] + 0.015), m
    th, ph = 0.0, 0.0
    for it in range(7):   # Newton on each angle (nearly decoupled: theta moves the shoulder, phi the ear)
        e1, e2, m = err(th, ph)
        if abs(e1) < 0.003 and abs(e2) < 0.003: break
        d = 0.02; a1, _, _ = err(th + d, ph); _, b2, _ = err(th, ph + d)
        th -= e1 / ((a1 - e1) / d); ph -= e2 / ((b2 - e2) / d)
        th = max(-0.30, min(0.30, th)); ph = max(-0.44, min(0.30, ph))
    FIX['clips'][name] = corrected(name, th, ph)
    m1 = measure(name, FIX['clips'][name])
    res[name] = {'spine_pitch_deg': round(math.degrees(th), 2), 'neck_pitch_deg': round(math.degrees(ph), 2),
                 'before_cm': {k: round(v * 100, 1) for k, v in m0.items()}, 'after_cm': {k: round(v * 100, 1) for k, v in m1.items()}}
    print(name, json.dumps(res[name]), flush=True)
json.dump(FIX, open(lib.D + 'clips_fixed.json', 'w'))
json.dump({'what': 'posture fix per clip: forward pitch about the hips lateral axis spread over spine05..spine02 (30/30/25/15%), neck01/02/03 each + neck pitch on top, head and upper arms keep their world orientation', 'spine_share': SPINE, 'clips': res}, open(H + '/posture.json', 'w'), indent=1)
print('wrote clips_fixed.json')
