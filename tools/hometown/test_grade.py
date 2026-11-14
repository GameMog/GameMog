# python tools/hometown/test_grade.py: the deck solver's cases (grade.py), synthetic ground, no data.
import random
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import grade as G  # noqa: E402

FAIL = []


def check(name, ok, info=''):
    print(('ok   ' if ok else 'FAIL ') + name + ('  ' + info if info else ''))
    if not ok:
        FAIL.append(name)


def flat(L, h=100.0):
    return [h for _ in G.stations(L)]


def chord_gap(ys, ss, y0, y1, L):
    return min(y - (y0 + (y1 - y0) * s / L) for y, s in zip(ys, ss))


# 1. an overpass with nothing under it: the chord, no sag
L = 200
p = G.Piece(('s1', 0), 'A', 'B', L, 0, L, True, [100 + 0.02 * s for s in G.stations(L)])
out, st = G.solve([p], {'A': 100.0, 'B': 104.0}, set())
check('no crossing: the chord, no sag', abs(chord_gap(out[('s1', 0)], p.ss, 100, 104, L)) < 0.06, str(st))

# 2. a ravine bridge: ground dips 30 m in the middle; the deck stays on the chord
gr = [100 - 30 * max(0, 1 - abs(s - 150) / 100) for s in G.stations(300)]
p = G.Piece(('s2', 0), 'A', 'B', 300, 0, 300, False, gr)
out, st = G.solve([p], {'A': 100.0, 'B': 100.0}, set())
check('ravine: no dip', min(out[('s2', 0)]) > 99.9, 'min %.2f' % min(out[('s2', 0)]))

# 3. a river bridge between high banks: water 25 m below; constraint water + 6 is met by the chord
gr = [75.0 if 60 < s < 340 else 100.0 for s in G.stations(400)]
p = G.Piece(('s3', 0), 'A', 'B', 400, 0, 400, True, gr, fixed=[(s, 81.0) for s in G.stations(400) if 60 < s < 340])
out, st = G.solve([p], {'A': 100.0, 'B': 100.0}, set())
check('river between high banks: stays at the chord', min(out[('s3', 0)]) > 99.9 and st['gradeRelaxed'] == 0, str(st))

# 4. an overpass over an unconnected street on flat ground: lifted to 6.5 m, smooth, anchors on the ground
L = 300
p = G.Piece(('s4', 0), 'A', 'B', L, 0, L, False, flat(L), fixed=[(150, 106.5 + 0.3)])
out, st = G.solve([p], {'A': 100.0, 'B': 100.0}, set())
ys = out[('s4', 0)]
check('overpass: clears the street by 6.5 m', G.interp(p.ss, ys, 150) >= 106.5 - 0.05, '%.2f' % G.interp(p.ss, ys, 150))
check('overpass: ends at the anchors', ys[0] == 100.0 and ys[-1] == 100.0)
check('overpass: grades <= 7%', st['maxGrade'] <= 0.07, str(st['maxGrade']))

# 5. a deck chain of two pieces through a FREE node, the street under the second piece
pa = G.Piece(('s5', 0), 'A', 'M', 150, 0, 150, False, flat(150))
pb = G.Piece(('s5', 1), 'M', 'B', 150, 0, 150, False, flat(150), fixed=[(20, 106.8)])
out, st = G.solve([pa, pb], {'A': 100.0, 'M': 100.0, 'B': 100.0}, {'M'})
ya, yb = out[('s5', 0)], out[('s5', 1)]
check('free node: both pieces agree there', abs(ya[-1] - yb[0]) < 0.011, '%.2f %.2f' % (ya[-1], yb[0]))
check('free node: lifted to clear the street', G.interp(pb.ss, yb, 20) >= 106.3, '%.2f' % G.interp(pb.ss, yb, 20))

# 6. a double deck / a 3-level stack: the level-2 deck crosses over the level-1 deck, which crosses a street
L = 800
low = G.Piece(('a-low', 0), 'L0', 'L1', L, 0, L, True, flat(L), fixed=[(400, 106.8)])
high = G.Piece(('b-high', 0), 'H0', 'H1', L, 0, L, True, flat(L), under=[(400, ('a-low', 0), 400, 6.8)])
top = G.Piece(('c-top', 0), 'T0', 'T1', L, 0, L, False, flat(L), under=[(400, ('b-high', 0), 400, 6.8)])
out, st = G.solve([top, high, low], {'L0': 100.0, 'L1': 100.0, 'H0': 100.0, 'H1': 100.0, 'T0': 100.0, 'T1': 100.0}, set())
yl, yh, yt = (G.interp(low.ss, out[k], 400) for k in [('a-low', 0), ('b-high', 0), ('c-top', 0)])
check('stack: 3 levels each >= 6.5 m apart', yh - yl >= 6.5 - 0.1 and yt - yh >= 6.5 - 0.1, '%.2f %.2f %.2f' % (yl, yh, yt))

# 7. a ramp merge node: a ramp (free node at its top) meets the mainline deck
main = G.Piece(('m', 0), 'M0', 'J', 200, 0, 200, True, flat(200), fixed=[(100, 106.8)])
main2 = G.Piece(('m', 1), 'J', 'M1', 200, 0, 200, True, flat(200))
ramp = G.Piece(('r', 0), 'R0', 'J', 150, 0, 150, False, flat(150))
out, st = G.solve([main, main2, ramp], {'M0': 100.0, 'J': 100.0, 'M1': 100.0, 'R0': 100.0}, {'J'})
check('merge node: three pieces agree', abs(out[('m', 0)][-1] - out[('m', 1)][0]) < 0.011 and abs(out[('r', 0)][-1] - out[('m', 1)][0]) < 0.011)

# 8. a deck interval inside its piece (anchors at u0, u1 on the ground; at-grade outside)
gr = [100.0 - (8 if 80 < s < 120 else 0) for s in G.stations(200)]
p = G.Piece(('s8', 0), 'A', 'B', 200, 60, 140, False, gr)
out, st = G.solve([p], {'A': 100.0, 'B': 100.0}, set())
ys = out[('s8', 0)]
check('inner deck: ground outside, chord inside', all(abs(y - g) < 1e-9 for y, g, s in zip(ys, gr, p.ss) if s < 60 or s > 140) and min(y for y, s in zip(ys, p.ss) if 60 <= s <= 140) > 99.9)

# 9. an impossible constraint 5 m from an anchor: held to RELAX, counted
p = G.Piece(('s9', 0), 'A', 'B', 100, 0, 100, False, flat(100), fixed=[(5, 106.8)])
out, st = G.solve([p], {'A': 100.0, 'B': 100.0}, set())
check('too close to an anchor: relaxed, no step', st['gradeRelaxed'] == 1 and out[('s9', 0)][1] - 100 <= 0.5 + 1e-6, str(st))

# 9b. a deck interval ending inside its piece 14 m past a road it crosses (the rest of the piece on fill, the ground
#     climbing a hillside): the deck end moves out over the fill until the road is cleared, never a car's height over it
L = 200
gr = [100.0 + max(0.0, s - 150) * 0.4 for s in G.stations(L)]
p = G.Piece(('s9b', 0), 'A', 'B', L, 0, 150, False, gr, fixed=[(136, 106.8)])
out, st = G.solve([p], {'A': 100.0, 'B': gr[-1]}, set())
ys = out[('s9b', 0)]
check('deck end inside the piece moves out to clear a crossing near it', G.interp(p.ss, ys, 136) >= 106.8 - 0.05 and st['deckEndsMoved'] == 1 and st['unmet'] == 0,
      '%.2f %s' % (G.interp(p.ss, ys, 136), st))
check('... and lands on the ground beyond, no step', all(y >= g - 1e-9 for y, g in zip(ys, gr)) and abs(ys[-1] - gr[-1]) < 1e-9 and
      max(abs(ys[k + 1] - ys[k]) for k in range(len(ys) - 1) if ys[k] - gr[k] > 1e-6 or ys[k + 1] - gr[k + 1] > 1e-6) <= G.RELAX * G.STEP + 0.05,
      str([round(v, 1) for v in ys[25:]]))
# 9c. ... the same end with no constraint near it stays where the data put it
p = G.Piece(('s9c', 0), 'A', 'B', L, 0, 150, False, gr, fixed=[(60, 106.8)])
out, st = G.solve([p], {'A': 100.0, 'B': gr[-1]}, set())
check('deck end with nothing near it stays', st['deckEndsMoved'] == 0 and all(abs(y - g) < 1e-9 for y, g, s in zip(out[('s9c', 0)], gr, p.ss) if s > 150))

# 10. determinism under shuffled input
ps = lambda: [G.Piece(('m', 0), 'M0', 'J', 200, 0, 200, True, flat(200), fixed=[(100, 106.8)]), G.Piece(('m', 1), 'J', 'M1', 200, 0, 200, True, flat(200)),
              G.Piece(('r', 0), 'R0', 'J', 150, 0, 150, False, flat(150))]
ref, _ = G.solve(ps(), {'M0': 100.0, 'J': 100.0, 'M1': 100.0, 'R0': 100.0}, {'J'})
same = True
for i in range(5):
    q = ps()
    random.Random(i).shuffle(q)
    o, _ = G.solve(q, {'M0': 100.0, 'J': 100.0, 'M1': 100.0, 'R0': 100.0}, {'J'})
    same &= o == ref
check('determinism under shuffled order', same)

print('%d failed' % len(FAIL))
sys.exit(1 if FAIL else 0)
