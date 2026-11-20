import os, sys, json, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import model, fitlib as fl
V = os.environ.get('JH_FACE_DIR') or os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')); WK = os.environ.get('JH_FACE_WORK') or (V + '/work')
def view_cams(P, H, names=(('front', 0), ('34', 35), ('profile', 90)), f=5200, W=900, Hh=1100, dist=1.6, dy=-0.035):
    E = P[np.concatenate([H.eyeV['l'], H.eyeV['r']])].mean(0); out = []
    for nm, ang in names:
        a = np.radians(ang); C = E + dist * np.array([np.sin(a), -0.004, np.cos(a)]); R, t = fl.look(C, E + [0, dy, 0])
        out.append(fl.cam(nm, R, t, f, W, Hh, E))
    return out
