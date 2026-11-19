# v3b posture step 2 (owner 19 Nov: chest and stomach NOT protruding; seated upright). The cast clips zig-zag the
# trunk: sitTalk pitches spine05 +28, spine04 -1, spine03 +18, spine02 +31, spine01 -7 degrees (idle +15/-12/+4/+6/-14),
# which folds the torso front into a belly-out / chest-in V even on a flat body. Here, per key, the five spine bones
# get ONE shared pose delta D* (a rigid trunk from the hips to the upper chest): the average of their deltas, turned so
# the hip->upper-chest chord points exactly where it did (so the shoulders, neck and arms land where they were).
# neck01 and both clavicles keep their world orientation (gaze and arms unchanged). Root/hips untouched.
# Input dump/clips_fixed_v3pre.json (posture.py's output), writes dump/clips_fixed.json; s97 writes the GLB.
import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ['CLIPS'] = 'clips_fixed_v3pre.json'
import json, copy, numpy as np
from mathutils import Matrix, Vector, Quaternion
import lib
CLIPS = ['idle', 'talk', 'phone', 'arms', 'sitTalk', 'sit']
SP = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01']
KIDS = ['neck01', 'clavicle_L', 'clavicle_R']
src = json.load(open(lib.D + 'clips_fixed_v3pre.json')); out = copy.deepcopy(src)
JD = {j['name']: j for j in lib.JOINTS}
# bind world matrices (rest quats)
def bindW():
    W = {}
    for j in lib.JOINTS:
        r = j['rest']['r']; q = Quaternion((r[3], r[0], r[1], r[2])); q.normalize()
        M = W[j['parent']] if j['parent'] else Matrix.Identity(4)
        W[j['name']] = M @ Matrix.Translation(Vector(j['rest']['t'])) @ q.to_matrix().to_4x4()
    return W
WB = bindW()
# the skin's inverse binds are pure translations: the bind world rotation of every joint is identity, so a joint's
# deforming delta IS its world rotation (the joints' rest quats are not the bind)
RB = {n: Quaternion() for n in SP + KIDS + ['root']}
chord_b = (Vector(JD['spine01']['bind']) - Vector(JD['spine05']['bind'])).normalized()
def qavg(qs):
    a = qs[0]; s = np.zeros(4)
    for q in qs:
        v = np.array(q[:]); v = v if np.dot(v, np.array(a[:])) >= 0 else -v; s += v
    s /= np.linalg.norm(s); return Quaternion(s)
def solve(clip, t):
    W = lib.clip_pose(clip, t); R = {n: W[n].to_quaternion() for n in W}
    D = [R[n] @ RB[n].inverted() for n in SP]
    Da = qavg(D)
    chord_p = (W['spine01'].translation - W['spine05'].translation).normalized()
    Ds = (Da @ chord_b).rotation_difference(chord_p) @ Da
    cap = CAP.get(clip)
    if cap is not None:   # seated upright for video calls: the trunk leans at most `cap` degrees forward of the hips
        import math
        a = R['root'] @ chord_b; fwd = R['root'] @ Vector((0, 0, 1)); lat = R['root'] @ Vector((1, 0, 0))
        def pitch(D_): b = D_ @ chord_b; return math.degrees(math.atan2(b.dot(fwd), b.dot(a)) - math.atan2(a.dot(fwd), a.dot(a)))
        p0 = pitch(Ds)
        if p0 > cap:
            best = min((Quaternion(lat, math.radians(sg * (p0 - cap) * f)) @ Ds for sg in (1, -1) for f in np.linspace(0.5, 1.6, 45)),
                       key=lambda Dt: abs(pitch(Dt) - cap))
            Ds = best
        PITCH.setdefault(clip, []).append((round(p0, 1), round(pitch(Ds), 1)))
    new = {n: Ds @ RB[n] for n in SP}
    loc = {}
    par = {'spine05': R['root']}
    for i, n in enumerate(SP):
        p = R[JD[n]['parent']] if n == 'spine05' else new[JD[n]['parent']]
        loc[n] = p.inverted() @ new[n]
    for k in KIDS: loc[k] = new['spine01'].inverted() @ R[k]
    return loc
CAP = {'sitTalk': 8.0, 'sit': 8.0}; PITCH = {}
rep = {}
for clip in CLIPS:
    c = src['clips'][clip]; oc = out['clips'][clip]; n = 0
    for b in SP + KIDS:
        key = b + '|rotation'
        if key not in c:
            print('MISSING channel', clip, key); continue
        T = c[key]['t']; V = []
        for t in T:
            q = solve(clip, t)[b]; q.normalize(); V += [q.x, q.y, q.z, q.w]
        oc[key] = dict(c[key]); oc[key]['v'] = V; n += 1
    rep[clip] = n
json.dump(out, open(lib.D + 'clips_fixed.json', 'w'))
print('POSTURE2 channels rewritten', rep)
print('POSTURE2 trunk pitch before->after (deg)', {k: v[:3] for k, v in PITCH.items()})
