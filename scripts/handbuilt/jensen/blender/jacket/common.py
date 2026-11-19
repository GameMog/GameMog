# Shared design constants for Jensen's moto jacket (Blender space: Z up, he faces -Y, his left is +X).
import math, numpy as np
from mathutils import Vector
import lib
J = {j['name']: Vector(lib.g2b(j['bind'])[0]) for j in lib.JOINTS}
HEM = 0.962
GAP = 0.0038          # half the front opening the zip chain sits in
YOKE_F = 1.372        # chest yoke seam height (front)
YOKE_B = 1.385        # back yoke seam
BAND = 0.05           # hem band height
CUFF = 0.065          # cuff band length
SIDE_PHI = math.radians(104)  # side seam: angle round the body from centre front
NECK_EY = 0.0
def phi(p):  # angle round the body's vertical axis, 0 at centre front, + toward his left
    return math.atan2(p[0], -(p[1] - 0.0))
def arm(s):
    A, B, C = J['upperarm01_' + s], J['lowerarm01_' + s], J['wrist_' + s]
    return A, B, C
def armhole(s):
    """plane (point, normal) splitting sleeve from body"""
    A, B, C = arm(s); u = (B - A).normalized(); sh = J['shoulder01_' + s]
    pt = A - u * 0.012
    n = (u + Vector((0, 0, 0.35))).normalized()  # tipped so the armhole runs high on the shoulder, low in the pit
    return pt, n
def arm_frame(s, p):
    """(segment, t along arm from shoulder in m, phi round the arm, radius) of point p"""
    A, B, C = arm(s); p = Vector(p)
    u1 = (B - A); L1 = u1.length; u1 /= L1; u2 = (C - B); L2 = u2.length; u2 /= L2
    t1 = (p - A).dot(u1)
    if t1 < L1: u, base, t = u1, A, t1
    else: u, base, t = u2, B, L1 + (p - B).dot(u2)
    # a reference direction: forward (-Y) made square to the axis
    f = Vector((0, -1, 0)); f = (f - u * f.dot(u)).normalized(); g = u.cross(f)
    r = p - (base + u * ((p - base).dot(u)))
    return t, math.atan2(r.dot(g), r.dot(f)) * (1 if s == 'L' else -1), r.length, L1 + L2
