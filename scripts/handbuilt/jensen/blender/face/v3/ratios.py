# ratios.py IMG [crop x0 y0 x1 y1 scale] : MediaPipe 478 -> face proportions, measured in the face's own frontal frame
# (landmarks un-rotated by MediaPipe's pose matrix, so a 3/4 photo reads as frontal). LOCAL measurement only.
import sys, json, numpy as np, subprocess, os
from PIL import Image
img = sys.argv[1]; V = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if len(sys.argv) > 2:
    x0, y0, x1, y1, s = map(float, sys.argv[2:7]); im = Image.open(img).convert('RGB').crop((x0, y0, x1, y1))
    im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS); tmp = V + '/work/m3/_crop.png'; im.save(tmp); img = tmp
sys.path.insert(0, V + '/scripts'); import detect as D
d = D.detect(img, V + '/dl/model/face_landmarker.task')
if d is None: print('NO FACE'); sys.exit(1)
P = np.array(d['px']); M = np.array(d['M']); R = M[:3, :3]
# image px (y down, z ~ depth in px) -> roughly metric-shaped; undo the head's rotation
Q = P * [1, -1, -1]; Q = Q - Q.mean(0); F = Q @ R            # into the head frame (R maps head->camera)
def dist(a, b, ax=None):
    v = F[a] - F[b]; return abs(v[ax]) if ax is not None else np.linalg.norm(v)
H = dist(10, 152, 1); N = dist(168, 152, 1)
r = {'yaw_pitch_roll_deg': np.degrees([np.arctan2(-R[2, 0], np.hypot(R[2, 1], R[2, 2])), np.arctan2(R[2, 1], R[2, 2]), np.arctan2(R[1, 0], R[0, 0])]).round(1).tolist(),
     'bizyg/face(10-152)': dist(234, 454, 0) / H, 'bizyg/nasion-chin': dist(234, 454, 0) / N,
     'cheek(123-352)/bizyg': dist(123, 352, 0) / dist(234, 454, 0), 'jaw(172-397)/bizyg': dist(172, 397, 0) / dist(234, 454, 0),
     'gonial(58-288)/bizyg': dist(58, 288, 0) / dist(234, 454, 0),
     'mouth(61-291)/bizyg': dist(61, 291, 0) / dist(234, 454, 0), 'mouth/IOD(33-263)': dist(61, 291, 0) / dist(33, 263, 0),
     'alar(48-278)/IOD': dist(64, 294, 0) / dist(33, 263, 0), 'lower3rd(2-152)/face': dist(2, 152, 1) / H,
     'mid(168-2)/face': dist(168, 2, 1) / H, 'chinW(148-377)/bizyg': dist(148, 377, 0) / dist(234, 454, 0),
     'cornerDrop(61,291 vs 0)/mouthW': ((F[61, 1] + F[291, 1]) / 2 - F[13, 1]) / dist(61, 291, 0)}
print(json.dumps({k: (round(v, 3) if isinstance(v, float) else v) for k, v in r.items()}))
