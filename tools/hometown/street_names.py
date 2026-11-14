# tools/hometown/street_names.py: a street name as a sign spells it, from the compiler's road names (compile.py
# pretty_raw: upper case, suffixes and directions abbreviated, "N 3RD ST"). Python's str.title() wrote "N 3Rd St",
# "S 14Th St", "Mcdonald Ave", "St John'S Rd", "Us Hwy 1", "Ne 2Nd Ave"; street_case writes "N 3rd St", "S 14th St",
# "McDonald Ave", "St John's Rd", "US Hwy 1", "NE 2nd Ave".
#
#   ordinals         digits + st/nd/rd/th lower case: "1st", "22nd", "103rd", "14th"
#   directions       N S E W NE NW SE SW in capitals (every single letter is a capital: "Glen D Johnson Rd", "I-95")
#   abbreviations    route prefixes and initialisms kept in capitals (US, SR, CR, FM, RM, SH, CSAH, CTH, STH, BIA, FS, MLK,
#                    JFK, FDR, LBJ, Roman numerals II..XII); a word with digits in it that is no ordinal stays as it is
#                    ("A1A", "N3770 Rd", "SR-A1A")
#   Mc / Mac / O'    "McDonald", "McAllister"; Mac only for the MAC_NAMES (so "Macon", "Mack", "Machado" stay as they are);
#                    "O'Brien", "D'Iberville", "L'Enfant"; any other apostrophe ends a word in lower case ("John's")
#   of / the / and   lower case after the first word ("Ave of the Americas")
#   anything else    a capital and lower case; hyphens, slashes and "&" separate words ("Wilkes-Barre Blvd")
#
# Deterministic and idempotent (street_case(street_case(s)) == street_case(s)), pure stdlib, no locale. Its output is
# also what the engine's pkgNameCase (cities/pkg/js/pkg-hud.js) leaves unchanged, so a package from a compiler with
# this and one from before it read the same in game. Tests: test_street_names.py.
import re

KEEP_UPPER = frozenset((
    'NE', 'NW', 'SE', 'SW',
    'US', 'SR', 'CR', 'FM', 'RM', 'SH', 'CSAH', 'CTH', 'STH', 'BIA', 'FS',
    'MLK', 'JFK', 'FDR', 'LBJ',
    'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII',
))
SMALL = frozenset(('OF', 'THE', 'AND'))
MAC_NAMES = frozenset((
    'MACALLISTER', 'MACARTHUR', 'MACAULAY', 'MACDONALD', 'MACDOUGAL', 'MACDOUGALL', 'MACDUFF', 'MACFARLANE', 'MACGREGOR',
    'MACINTYRE', 'MACKAY', 'MACKENZIE', 'MACKINNON', 'MACLAREN', 'MACLEAN', 'MACLEOD', 'MACMILLAN', 'MACNEIL',
    'MACPHERSON', 'MACQUEEN', 'MACRAE',
))
ELIDED = frozenset(('O', 'D', 'L'))     # O'Brien, D'Iberville, L'Enfant

_WORD = re.compile(r"[^\W_]+(?:['’][^\W_]+)*")
_ORDINAL = re.compile(r'^(\d+)(ST|ND|RD|TH)$')
_APOS = re.compile(r"(['’])")


def _cap(w):
    """One upper-case word of letters, capitalised (Mc, the Mac names)."""
    if len(w) > 2 and w.startswith('MC'):
        return 'Mc' + w[2] + w[3:].lower()
    if w in MAC_NAMES:
        return 'Mac' + w[3] + w[4:].lower()
    return w[0] + w[1:].lower()


def _word(w, first):
    if w.isdigit():
        return w
    m = _ORDINAL.match(w)
    if m:
        return m.group(1) + m.group(2).lower()
    if any(ch.isdigit() for ch in w):
        return w
    if len(w) == 1 or w in KEEP_UPPER:
        return w
    if not first and w in SMALL:
        return w.lower()
    parts = _APOS.split(w)
    if len(parts) > 1:
        head = parts[0]
        if head in ELIDED:
            return head + parts[1] + _cap(parts[2]) + ''.join(parts[3:]).lower()
        return _cap(head) + ''.join(parts[1:]).lower()
    return _cap(w)


def street_case(name):
    """A road name ("N 3RD ST", "n 3Rd st", "N 3rd St") -> "N 3rd St". '' for none."""
    s = ' '.join(str(name or '').split()).upper()
    out, last, n = [], 0, 0
    for m in _WORD.finditer(s):
        out.append(s[last:m.start()])
        out.append(_word(m.group(0), n == 0))
        last, n = m.end(), n + 1
    out.append(s[last:])
    return ''.join(out)
