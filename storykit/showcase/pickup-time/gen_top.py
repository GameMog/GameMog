# Writes top.json (Pickup Time's top level: everything but acts). python3 storykit/showcase/pickup-time/gen_top.py
import json, os, copy
HERE = os.path.dirname(os.path.abspath(__file__))
GM = os.path.normpath(os.path.join(HERE, '..', '..', '..'))   # the GameMog checkout
# out: the repo's .scratch/showcase/pickup-time (git-ignored), where merge.mjs reads the fragments
OUT = os.environ.get('PT_OUT') or os.path.join(HERE, '..', '..', '..', '.scratch', 'showcase', 'pickup-time')
os.makedirs(OUT, exist_ok=True)

def V(id, desc, kokoro=None, blend=None, speed=1.0, pitch=0.0):
    v = {'id': id}
    if kokoro: v['kokoro'] = kokoro
    if blend: v['blend'] = blend
    v.update({'speed': speed, 'pitch': pitch, 'description': desc})
    return v

# (Bunny Ferraby began as a forged sheet on the grandmother anchor, set to 58; she, Teddy and Pell now wear hand-built
# bodies from the cast registry: hand/bunny, hand/young-hero, hand/pell)
cast = [
    {'id': 'john', 'model': 'hand/john', 'name': 'John Marin', 'role': 'owns Slice Marin pizza, used to plan heists', 'color': '#F2B33D',
     'voice': V('pt-john', 'a man in his late thirties, warm mid-low baritone, dry and a little tired, quick when scared', blend={'am_michael': 0.7, 'am_puck': 0.3}, speed=1.0, pitch=-0.6)},
    {'id': 'carissa', 'model': 'hand/carissa', 'name': 'Carissa Marin', 'role': "John's wife, does school pickup every day", 'color': '#FF6F91',
     'voice': V('pt-carissa', 'a woman in her mid-thirties, bright warm alto, fast and playful, drops low when she means it', blend={'af_heart': 0.7, 'af_nicole': 0.3}, speed=1.08, pitch=-1.0)},
    {'id': 'delgado', 'model': 'hand/pedro', 'name': 'Pedro Delgado', 'role': 'the underboss who lost everything when they ran', 'color': '#C0392B',
     'voice': V('pt-delgado', 'a man in his fifties, low and even, a slight Spanish lilt, never raises it', blend={'bm_george': 0.6, 'am_onyx': 0.25, 'em_alex': 0.15}, speed=0.9, pitch=-1.4)},
    {'id': 'agnes', 'model': 'hand/agnes', 'name': 'Agnes Teodoro', 'role': 'the Nanny: white hair, very polite, not theirs', 'color': '#B9A6E3',
     'voice': V('pt-agnes', 'an older woman, soft clear mezzo, measured and polite, a little tremble', blend={'af_kore': 0.7, 'bf_emma': 0.3}, speed=0.9, pitch=0.4)},
    {'id': 'milo', 'model': 'hand/milo', 'name': 'Milo', 'role': 'their son, six, in first grade', 'color': '#4ADE80',
     'voice': V('pt-milo', 'a small boy, high and bright, sleepy', blend={'af_aoede': 0.7, 'af_sky': 0.3}, speed=1.12, pitch=2.5)},
    {'id': 'teddy', 'model': 'hand/young-hero', 'name': 'Teddy', 'role': "the Nanny's son, who drives for Delgado", 'color': '#9AA3AD',
     'voice': V('pt-teddy', 'a young man, nervous, quick light voice', blend={'am_puck': 0.8, 'am_liam': 0.2}, speed=1.1, pitch=1.8)},
    {'id': 'rollo', 'model': 'mogcity/suit-knox', 'name': 'Rollo', 'role': "Delgado's crew boss in the city", 'color': '#E67E22',
     'voice': V('pt-rollo', 'a thick-set man, amused, gravelly mid voice', blend={'am_fenrir': 0.7, 'am_onyx': 0.3}, speed=0.95, pitch=-0.8)},
    {'id': 'hooks', 'model': 'mogcity/suit-hooks', 'role': "one of Delgado's crew", 'color': '#7F8C8D'},
    {'id': 'tank', 'model': 'mogcity/suit-tank', 'role': "the widest of Delgado's crew", 'color': '#95A5A6'},
    {'id': 'mack', 'model': 'mogcity/suit-mack', 'role': "Delgado's crew, the driver", 'color': '#A3A3A3'},
    {'id': 'lou', 'model': 'hand/old-boss', 'name': 'Lou Varga', 'role': 'a bail bondsman who once owed John his life', 'color': '#D4A017',
     'voice': V('pt-lou', 'an older man, gravelly, quick, cheerful', blend={'bm_daniel': 0.7, 'am_onyx': 0.3}, speed=1.05, pitch=-0.5)},
    {'id': 'bunny', 'model': 'hand/bunny', 'name': 'Bunny Ferraby', 'role': 'a loan shark who plays chess for money in Washington Square', 'color': '#8E44AD',
     'voice': V('pt-bunny', 'a woman near sixty, smoky low alto, unhurried, amused', blend={'af_alloy': 0.7, 'af_nicole': 0.3}, speed=0.95, pitch=-1.8)},
    {'id': 'pell', 'model': 'hand/pell', 'name': 'Gordon Pell', 'role': 'the loan officer who said no', 'color': '#2E86C1',
     'voice': V('pt-pell', 'a man in his forties, nasal, precise, faintly bored', kokoro='am_eric', speed=1.04, pitch=0)},
    {'id': 'okafor', 'voiceOnly': True, 'name': 'Ms. Okafor', 'role': "Milo's first-grade teacher", 'color': '#5DADE2',
     'voice': V('pt-okafor', 'a woman around forty, calm warm teacher voice, crisp, kind and quick', blend={'bf_emma': 0.75, 'af_nicole': 0.25}, speed=0.98, pitch=-1.2)},
    {'id': 'headmaster', 'voiceOnly': True, 'name': 'Mr. Ashby', 'role': 'Head of School', 'color': '#6C7A89',
     'voice': V('pt-headmaster', 'an older man, precise British tenor-baritone, careful and procedural, kind underneath', blend={'bm_fable': 0.8, 'bm_george': 0.2}, speed=0.95, pitch=-0.3)},
    {'id': 'ma', 'voiceOnly': True, 'name': 'Ma', 'role': "John's mother", 'color': '#F39C12',
     'voice': V('pt-ma', 'an older woman, bright and chatty, fast, a warm nasal edge', blend={'af_sarah': 0.6, 'af_river': 0.4}, speed=1.12, pitch=0.8)},
    {'id': 'benny', 'voiceOnly': True, 'name': 'Benny', 'role': 'Slice Marin store manager', 'color': '#E74C3C',
     'voice': V('pt-benny', 'a young man, quick and eager, slightly breathless', blend={'am_eric': 0.6, 'am_puck': 0.4}, speed=1.15, pitch=0.4)},
    {'id': 'calloway', 'voiceOnly': True, 'name': 'Det. Calloway', 'role': 'the detective three cars back', 'color': '#34495E',
     'voice': V('pt-calloway', 'a woman of fifty, flat dry low voice, unhurried, amused', blend={'af_nova': 0.7, 'af_kore': 0.3}, speed=0.95, pitch=-2.0)},
    {'id': 'odette', 'voiceOnly': True, 'name': 'Odette', 'role': 'a fence with a back door on the Bowery', 'color': '#F5B7B1',
     'voice': V('pt-odette', 'a woman in her fifties, silky, amused, a little French colour', blend={'bf_isabella': 0.8, 'ff_siwis': 0.2}, speed=1.0, pitch=-0.6)},
    {'id': 'marjorie', 'voiceOnly': True, 'name': 'Marjorie Klee', 'role': 'a buyer for pizza chains', 'color': '#F0E68C',
     'voice': V('pt-marjorie', 'a brisk businesswoman, bright, fast, unsentimental', kokoro='af_sarah', speed=1.1, pitch=-0.4)},
    {'id': 'coach', 'voiceOnly': True, 'name': 'Coach', 'role': 'a street-race bookie', 'color': '#48C9B0',
     'voice': V('pt-coach', 'a wiry man, fast-talking, raspy', blend={'am_liam': 0.6, 'am_echo': 0.4}, speed=1.12, pitch=0.6)},
]

vehicles = [
    {'stock': 'gt', 'id': 'rides.gt', 'label': 'Vantor GT', 'plate': 'JM 0838'},
    {'v': 1, 'id': 'rides.slice-van', 'label': 'the Slice Marin van', 'noun': 'van', 'family': 'car4', 'class': 'van', 'era': 2018, 'condition': 'daily',
     'body': {'rear': 'box', 'doors': 4, 'doorType': 'sliding', 'roof': 'high', 'trim': 'black', 'crease': 'single'},
     'paint': {'base': '#F4EFE6', 'finish': 'gloss', 'second': '#C0392B', 'split': 'lower', 'livery': {'kind': 'delivery', 'text': 'SLICE MARIN', 'number': '12'}},
     'wheels': {'style': 'steel-hubcap', 'finish': 'silver', 'tyre': 'road'},
     'props': ['delivery-boxes', 'clipboard', 'air-freshener'],
     'sound': {'engine': 'i4', 'character': 0.2, 'horn': 'musical'},
     'handling': {'pace': -0.4, 'weight': 0.5, 'character': 'floaty'}, 'abilities': ['boost'],
     'story': {'owner': 'john', 'nickname': 'the pizza van', 'oneLine': 'Twelve stores, one van, a slice on the roof.'}, 'plate': 'SLICE 12'},
    {'v': 1, 'id': 'rides.carissa-suv', 'label': "Carissa's SUV", 'noun': 'suv', 'family': 'car4', 'class': 'suv', 'era': 2021, 'condition': 'daily',
     'paint': {'base': '#EDE6D6', 'finish': 'pearl'}, 'wheels': {'style': 'multi-spoke', 'finish': 'silver', 'tyre': 'road'},
     'props': ['booster', 'child-seat', 'roof-box', 'coffee-cups', 'diaper-bag'], 'sound': {'engine': 'v6', 'horn': 'toot'},
     'handling': {'pace': 0.1, 'character': 'planted'}, 'abilities': ['boost'],
     'story': {'owner': 'carissa', 'nickname': 'the family car', 'oneLine': 'Cream, spotless outside, a crime scene of crackers inside.'}, 'plate': 'CM 0611'},
    {'v': 1, 'id': 'rides.crew-suv', 'label': 'the black SUV', 'noun': 'suv', 'family': 'car4', 'class': 'suv', 'era': 2023, 'condition': 'showroom',
     'paint': {'base': '#141414', 'finish': 'satin'}, 'wheels': {'style': 'multi-spoke', 'finish': 'black', 'tyre': 'road'},
     'sound': {'engine': 'v8'}, 'abilities': ['boost', 'ram'],
     'story': {'owner': 'delgado', 'nickname': 'the black SUV', 'oneLine': "Delgado's crew car: tinted, quiet, always two blocks back."}, 'plate': 'DLG 400'},
]

places = {
    'bank': {'@': 'wallst', 'name': 'the bank on Wall St'},
    'atm-franklin': {'@': 'tribeca', 'name': 'the ATM on Franklin St'},
    'store-one': {'@': 'foley', 'name': 'Slice Marin No. 1, Worth St'},
    'courthouse': {'@': 'foley', 'name': 'the courthouse steps, Foley Square'},
    'store-tribeca': {'@': 'tribeca', 'name': 'Slice Marin, Franklin St'},
    'minivan': {'@': 'canal', 'name': 'the green minivan at the tunnel mouth'},
    'store-soho': {'@': 'soho', 'name': 'Slice Marin, Prince St'},
    'agnes-home': {'@': 'les', 'name': "Agnes's building on Orchard St"},
    'teddy-garage': {'@': 'sdrpark', 'name': 'the garage on Forsyth St'},
    'chess-tables': {'@': 'washsq', 'name': 'the chess tables, Washington Square'},
    'drop-park': {'@': 'chelseapark', 'name': 'the bench in Chelsea Park'},
    'pell-condo': {'@': 'hudsonyards', 'name': 'the glass tower on W 33rd St'},
    'lockers': {'@': 'javits', 'name': 'the lockers at the convention center'},
    'school': {'@': 'murrayhill', 'name': 'Murray Hill Grammar, E 37th St'},
    'lease-office': {'@': 'grandcentral', 'name': 'the property office by the terminal'},
    'race-yard': {'@': 'westyards', 'name': 'the container yard on 12th Ave'},
    'toll': {'@': 'centralpark', 'name': 'Central Park South, 6th Ave'},
    'plaza': {'@': 'lincoln', 'name': 'the plaza at Lincoln Center'},
    'hideout': {'@': 'harlem', 'name': 'the office building on W 125th St'},
    'side-door': {'@': 'harlem', 'name': 'the side door on W 126th St', 'offset': {'right': 24, 'fwd': 0}},
    'odette-door': {'@': 'bowery', 'name': "Odette's back door on the Bowery"},
    'school-corner': {'@': 'murrayhill', 'name': 'the corner by the school', 'offset': {'right': 0, 'fwd': 22}},
}

# the opening (BIBLE 2), about 60 s; cameras on cast members by id (the runner follows the head). The people who matter
# are each in a set of their own (Mog City's runner draws it in place of the street, as Mog City's opening draws Mr. Big
# in his study): John across the loan officer's desk at the bank, Carissa in the school's corridor watching the Nanny
# walk Milo out to the yard, Delgado in his office uptown with the blinds down. Only the establishing wide and the title
# are on the street, and the runner holds the traffic clear round John for them.
opening = {
    'place': '@bank', 'time': 'midday',
    'stage': [],
    'sets': {
        'bank': {'room': 'bank-office', 'people': [
            {'who': 'pell', 'at': [0, -1.5], 'face': 'john', 'look': 'john'},
            {'who': 'john', 'at': [0.05, 0.3], 'face': 'pell', 'look': 'pell'}]},
        'school': {'room': 'school', 'people': [
            {'who': 'carissa', 'at': [1.05, 3.4], 'face': 172},
            {'who': 'agnes', 'at': [-0.25, -0.2], 'face': 180, 'hold': {'who': 'milo', 'side': 'L', 'their': 'R', 'k': 0.7},
             'walk': {'to': [-0.25, -6.0], 'secs': 7, 'after': 5.0}},
            {'who': 'milo', 'at': [-0.75, -0.2], 'face': 180, 'hold': {'who': 'agnes', 'side': 'R', 'their': 'L', 'k': 0.6},
             'walk': {'to': [-0.75, -6.0], 'secs': 7, 'after': 5.0}}]},
        'hideout': {'room': 'hideout', 'people': [
            {'who': 'delgado', 'at': [0.35, -1.75], 'face': 8, 'look': 'lens'}]},
    },
    'shots': [
        {'cam': {'rel': 'player', 'right': 5.5, 'up': 3, 'fwd': -12}, 'to': {'rel': 'player', 'right': 5, 'up': 2.5, 'fwd': -7}, 'look': {'rel': 'player', 'up': 60, 'fwd': 45}, 'lookTo': {'rel': 'player', 'up': 0}, 'fov': 62, 'dur': 6,
         'where': {'name': 'Financial District', 'sub': 'Wall St & Broad St · 2:48 PM'}},
        # (the bank, upstairs: over the loan officer's shoulder onto John across the desk)
        {'set': 'bank', 'cam': {'rel': 'pell', 'right': 0.42, 'up': 0.12, 'fwd': -0.75}, 'to': {'rel': 'pell', 'right': 0.36, 'up': 0.1, 'fwd': -0.6}, 'look': {'rel': 'player', 'up': -0.05}, 'fov': 34, 'dur': 7,
         'card': {'who': 'john', 'is': 'hero', 'role': 'owns Slice Marin pizza, used to plan heists'},
         'say': 'john', 'line': 'Five years clean. A pizza chain, a kid in first grade, and a loan officer who just said no.'},
        # (the school: Carissa at the office window, looking down the corridor)
        {'set': 'school', 'cam': {'rel': 'carissa', 'right': 0.3, 'up': 0.04, 'fwd': 1.25}, 'look': {'rel': 'carissa', 'up': -0.03}, 'fov': 34, 'dur': 6,
         'card': {'who': 'carissa', 'is': 'ally', 'role': "John's wife, does school pickup every day"}},
        # (over her shoulder: the Nanny walking Milo out to the yard by the hand)
        {'set': 'school', 'cam': {'rel': 'carissa', 'right': -0.38, 'up': 0.12, 'fwd': -0.85}, 'look': {'rel': 'agnes', 'up': -0.35}, 'fov': 38, 'dur': 7,
         'card': {'who': 'agnes', 'is': 'ally', 'role': 'the Nanny: white hair, very polite, not ours'},
         'say': 'carissa', 'line': "They said a nanny picked Milo up early. A family emergency. We don't have a nanny."},
        # (uptown: Delgado in his office, the blinds down, the sun through them in stripes)
        {'set': 'hideout', 'cam': {'rel': 'delgado', 'right': -0.9, 'up': 0.25, 'fwd': 3.0}, 'to': {'rel': 'delgado', 'right': -0.45, 'up': 0.06, 'fwd': 1.55}, 'look': {'rel': 'delgado', 'up': -0.1}, 'lookTo': {'rel': 'delgado', 'up': -0.03}, 'fov': 36, 'dur': 8,
         'card': {'who': 'delgado', 'is': 'antagonist', 'role': 'the underboss who lost everything when they ran'},
         'say': 'delgado', 'line': 'You took everything I had in Miami. One million dollars, by ten tonight, and you get your boy back.'},
        # (back at the bank: John on his feet by the door, the phone lighting up)
        {'set': 'bank', 'act': [{'who': 'john', 'at': [1.2, 1.55], 'face': 200, 'pose': 'phone', 'prop': 'phone'}, {'who': 'pell', 'face': 'john'}],
         'cam': {'rel': 'player', 'right': 0.6, 'up': 0.05, 'fwd': 1.9}, 'to': {'rel': 'player', 'right': 0.4, 'up': 0.02, 'fwd': 1.3}, 'look': {'rel': 'player', 'up': -0.08}, 'fov': 34, 'dur': 5, 'sub': 'Incoming call · CARISSA'},
        {'cam': {'rel': 'player', 'right': 4.5, 'up': 0.6, 'fwd': -6}, 'look': {'rel': 'player', 'up': 14, 'fwd': 30}, 'fov': 58, 'dur': 7, 'title': True},
    ],
}

top = {
    'storykit': 2, 'id': 'pickup-time', 'title': 'Pickup Time', 'kicker': 'NEW YORK',
    'tagline': 'One afternoon. One million. One first grader.',
    'base': {'engine': 'mogcity-1', 'city': 'ny', 'cityBuild': 'ny-mogcity-1'},
    'dressing': {'time': 'midday', 'season': 'spring', 'weather': 'clear', 'holiday': []},
    'hero': 'john', 'ride': 'rides.gt',
    'opening': opening,
    'hud': {'meters': [
        {'id': 'ransom', 'label': 'RANSOM', 'kind': 'money', 'start': 0, 'min': 0, 'max': 1000000, 'goal': 1000000},
        {'id': 'clues', 'label': 'CLUES', 'kind': 'count', 'start': 0, 'goal': 10},
    ]},
    'places': places, 'cast': cast, 'vehicles': vehicles, 'voices': {},
}
json.dump(top, open(os.path.join(OUT, 'top.json'), 'w'), indent=1, ensure_ascii=False)
print('wrote top.json', len(json.dumps(top)))
