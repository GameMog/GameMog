# tools/hometown/test_street_names.py: street_names.street_case, the frame's street names as a sign spells them.
#   unit (always): ordinals, directions, route prefixes and initialisms, Mc / Mac / O', apostrophes, small words,
#     hyphens and slashes, digits in words; deterministic and idempotent; any case in, the same out; none of the
#     engine's mis-casing marks (tests/street-names.test.mjs MISCASED) in what it writes; frame.py no longer title-cases
#   data (when the proof towns' frames are built, .scratch/r5/gm/*/frame.json): every road name of theirs cased cleanly
#   <venv>/bin/python tools/hometown/test_street_names.py   (stdlib only: plain python3 runs it too)
import glob
import json
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from street_names import street_case  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '../..'))
# the engine's test of a mis-cased name (tests/street-names.test.mjs), plus str.title()'s Mac and route marks
MISCASED = re.compile(r"\b\d+(St|Nd|Rd|Th)\b|\bMc[a-z]|[a-z]['’][A-Z]\b|\b(Ne|Nw|Se|Sw) \S|\bUs Hwy\b|\b(Us|Sr|Cr|Fm)(-| \d)")

CASES = {
    # ordinals
    'N 3RD ST': 'N 3rd St', 'S 14TH ST': 'S 14th St', 'N 1ST AVE': 'N 1st Ave', 'S 2ND ST': 'S 2nd St', '101ST ST': '101st St',
    '103RD ST': '103rd St', '22ND AVE': '22nd Ave', '96TH ST': '96th St', 'E NINETH ST': 'E Nineth St',
    # directions and quarters
    'NE 23RD ST': 'NE 23rd St', 'NW 10TH ST': 'NW 10th St', 'SE 1ST AVE': 'SE 1st Ave', 'SW 8TH ST': 'SW 8th St',
    'E BAY HARBOR DR': 'E Bay Harbor Dr', 'W BROADWAY ST': 'W Broadway St', 'GLEN D JOHNSON RD': 'Glen D Johnson Rd',
    # routes and initialisms
    'US HWY 62': 'US Hwy 62', 'US 1': 'US 1', 'US-1': 'US-1', 'SR 51': 'SR 51', 'SR-A1A': 'SR-A1A', 'CR 12': 'CR 12',
    'FM 1960 RD': 'FM 1960 Rd', 'I-95': 'I-95', 'I 95 EXPY': 'I 95 Expy', 'A1A': 'A1A', 'N3770 RD': 'N3770 Rd',
    'MLK JR BLVD': 'MLK Jr Blvd', 'JOHN PAUL II DR': 'John Paul II Dr', 'CSAH 5': 'CSAH 5', '9700 BLOCK': '9700 Block',
    # Mc / Mac / O'
    'MCDONALD AVE': 'McDonald Ave', 'MCCORD ST': 'McCord St', 'MCALLISTER ST': 'McAllister St', 'MC ST': 'Mc St',
    'MACARTHUR CSWY': 'MacArthur Cswy', 'MACDONALD RD': 'MacDonald Rd', 'MACON ST': 'Macon St', 'MACK AVE': 'Mack Ave',
    'MACHADO WAY': 'Machado Way', "O'BRIEN ST": "O'Brien St", "O'CONNOR ST": "O'Connor St", "D'IBERVILLE BLVD": "D'Iberville Blvd",
    "L'ENFANT PLZ": "L'Enfant Plz", "ST JOHN'S RD": "St John's Rd", "MCDONALD'S DR": "McDonald's Dr", 'O’BRIEN ST': 'O’Brien St',
    # small words, hyphens, slashes, &
    'AVENUE OF THE AMERICAS': 'Avenue of the Americas', 'THE ALAMEDA': 'The Alameda', 'WILKES-BARRE BLVD': 'Wilkes-Barre Blvd',
    'HAULOVER BEACH PARK PATH & RD': 'Haulover Beach Park Path & Rd', 'MAIN/ELM ST': 'Main/Elm St',
    'WOODY GUTHRIE BLVD': 'Woody Guthrie Blvd', 'HARBOUR WAY': 'Harbour Way', 'CALLE PEÑA': 'Calle Peña',
    # none, spacing
    '': '', None: '', '  N   3RD  ST ': 'N 3rd St',
}


class StreetCase(unittest.TestCase):
    def test_cases(self):
        for a, b in CASES.items():
            self.assertEqual(street_case(a), b, a)

    def test_idempotent_and_any_case(self):
        for a, b in CASES.items():
            self.assertEqual(street_case(b), b, b)
            if a:
                self.assertEqual(street_case(a.lower()), b, a.lower())
                self.assertEqual(street_case(str(a).title()), b, str(a).title())

    def test_deterministic(self):
        names = sorted(k for k in CASES if k)
        self.assertEqual([street_case(n) for n in names], [street_case(n) for n in names])

    def test_no_miscasing_marks(self):
        for a, b in CASES.items():
            self.assertIsNone(MISCASED.search(b), b)
        # (and the marks do catch what str.title() wrote)
        for bad in ('N 3Rd St', 'Mcdonald Ave', "St John'S Rd", 'Us Hwy 62', 'Ne 23Rd St', 'Sr 51'):
            self.assertIsNotNone(MISCASED.search(bad), bad)

    def test_frame_does_not_title_case(self):
        with open(os.path.join(HERE, 'frame.py')) as fh:
            src = fh.read()
        self.assertNotIn("['street'].title()", src)
        self.assertIn('street_case(', src)


class ProofTownFrames(unittest.TestCase):
    """Every road name of a built proof-town frame (the build's own pretty_raw names), cased with no mis-casing mark."""

    def test_frames(self):
        files = sorted(glob.glob(os.path.join(ROOT, '.scratch/r5/gm/*/frame.json')))
        if not files:
            self.skipTest('no proof-town frames built here')
        n = 0
        for f in files:
            with open(f) as fh:
                F = json.load(fh)
            for s in F.get('streets') or []:
                c = street_case(s['name'])
                self.assertIsNone(MISCASED.search(c), '%s -> %s' % (s['name'], c))
                self.assertEqual(street_case(c), c)
                n += 1
        self.assertGreater(n, 0)


if __name__ == '__main__':
    unittest.main()
