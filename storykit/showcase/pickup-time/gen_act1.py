# Writes act1.json: Pickup Time, ACT I (PT-1..PT-5), from the story bible's 3 and its 3A call sheets (the bible is not in the repo). python3 storykit/showcase/pickup-time/gen_act1.py
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
# out: the repo's .scratch/showcase/pickup-time (git-ignored), where merge.mjs reads the fragments
OUT = os.environ.get('PT_OUT') or os.path.join(HERE, '..', '..', '..', '.scratch', 'showcase', 'pickup-time')
os.makedirs(OUT, exist_ok=True)
TAG = {'JO': 'john', 'CA': 'carissa', 'DE': 'delgado', 'AG': 'agnes', 'HM': 'headmaster', 'MA': 'ma', 'BE': 'benny',
       'DC': 'calloway', 'OK': 'okafor', 'LO': 'lou', 'TE': 'teddy', 'RO': 'rollo', 'OD': 'odette', 'HO': 'hooks', 'TA': 'tank'}

def L(block):
    """'CA: text' per line -> spoken lines"""
    out = []
    for raw in block.strip().splitlines():
        raw = raw.strip()
        if not raw: continue
        tag, text = raw.split(':', 1)
        out.append({'who': TAG[tag.strip()], 'text': text.strip()})
    return out

def carphone(at, lines, extra=(), wrap='', pause='', resume='', **kw):
    c = {'at': at, 'type': 'call', 'who': 'carissa', 'auto': True, 'inCar': True, 'lines': L(lines)}
    if extra: c['extra'] = [L(b) for b in extra]
    if wrap: c['wrap'] = L(wrap)
    c['hold'] = {'pause': L(pause or "CA: You got out. I'll hold. I'm eating your fries."),
                 'resume': L(resume or 'CA: There you are. Where were we? Oh right. Crisis.')}
    c.update(kw)
    return c

def ring(who, lines, voicemail, **kw):
    c = {'type': 'call', 'who': who, 'ring': 6, 'lines': L(lines), 'voicemail': {'text': voicemail}}
    c.update(kw)
    return c

def shot(who, line=None, cam=None, look=None, dur=None, **kw):
    """a close-up on a cast member by id (the runner follows the head), 'player' for John"""
    rel = 'player' if who == 'john' else who
    s = {'cam': cam or {'rel': rel, 'right': 0.3, 'up': 0.02, 'fwd': 1.25}, 'look': look or {'rel': rel, 'up': -0.04}, 'fov': 32}
    if line: s.update({'say': who, 'line': line})
    if dur: s['dur'] = dur
    s.update(kw)
    return s

def over(speaker, at, line, **kw):
    """an over-the-shoulder: the camera behind John, looking at `at` (a cast id), `speaker` saying the line"""
    s = {'cam': {'rel': 'player', 'right': -0.45, 'up': 0.15, 'fwd': -1.1}, 'look': {'rel': at, 'up': -0.05}, 'fov': 36, 'say': speaker, 'line': line}
    s.update(kw)
    return s

# a set (Mog City's runner draws it in place of the street, as Mog City's opening draws Mr. Big's study): the room and
# who stands where in it (x right, z toward the way in, metres from its middle), so nobody is on a street with the traffic
def room(name, *people, **kw):
    s = {'room': name, 'people': [dict(p) for p in people]}
    s.update(kw)
    return s
def at(who, x, z, **kw):
    p = {'who': who, 'at': [x, z]}
    p.update(kw)
    return p

CLUE = {'meters': {'clues': {'add': 1}}}
def cash(n): return {'meters': {'ransom': {'add': n}}}

# ─────────────────────────────── PT-1 · Pickup Time ───────────────────────────────
pt1 = {
 'id': 'PT-1', 'title': 'Pickup Time', 'vehicle': 'rides.gt', 'verbs': ['drive', 'walk', 'boost'],
 'start': {'@': 'bank', 'mode': 'walk'}, 'time': 'midday', 'traffic': 0.35,
 'stakes': "Call me back. NOW. It's Milo.",
 'passLine': 'The first thirty-eight grand. The longest afternoon of your life just started.',
 'timerLine': 'Beat the armored truck to the safe.',
 'steps': [
  {'type': 'transition', 'kicker': 'WALL ST', 'text': 'Wall St & Broad St · Financial District · 2:52 PM', 'secs': 3},
  {'type': 'cutscene', 'set': room('bank-office', at('pell', 0, -1.5, face='john', look='john'), at('john', 0.05, 0.3, face='pell', look='pell')), 'shots': [
    over('pell', 'pell', 'Mr. Marin, a pizza chain in its fifth year is a risk profile, not a business.', dur=4.5),
    shot('john', "It's twelve stores. People love it. There's a pizza with a fried egg.", dur=4.5),
    shot('pell', 'Which is precisely the risk. Have a pleasant afternoon.', dur=4)]},
  ring('carissa', """
    CA: Don't talk. Listen. I'm at the school. Milo's not here.
    JO: What do you mean not here. It's two fifty.
    CA: Ms. Okafor says a nanny signed him out at two fifteen. Family emergency.
    JO: We don't have a nanny.
    CA: I KNOW we don't have a nanny, John. She had a nanny haircut. White hair. Cardigan. Very professional.
    CA: Then my phone buzzes. Unknown number. A photo of Milo eating fries. And a name.
    JO: Which name.
    CA: The one from Miami. Delgado.
    JO: ...Okay. Okay. I'm getting in the car.
    CA: Don't you dare hang up on me. Not today. Not once today.
    JO: I won't. I'm putting you on the car.""",
    'John Marin, if you send me to voicemail today of all days, I will haunt you. Call me back. It\'s Milo.',
    ring=10, answer={'flags': {'answered': True}}),
  {'type': 'set', 'set': CLUE},
  {'type': 'dm', 'name': 'Unknown number', 'text': "One million. 10 PM. You'll be told where. No cops, planner. Pickup time.", 'secs': 5},
  {'type': 'say', 'who': 'john', 'text': 'One million. I have... a pizza chain and eleven thousand dollars.', 'secs': 3.5},
  {'type': 'walk', 'to': '@bank', 'enterCar': True, 'objective': 'Get in your **{ride.name}**.'},
  {'type': 'timer', 'name': 'safe', 'seconds': 300, 'label': 'SAFE PICKUP', 'fail': 'soft', 'flag': 'late1', 'lateLabel': 'LATE',
   'why': 'The armored truck got there first.'},
  # (PACING: the race named before it starts: the truck is on his map from Wall St)
  {'type': 'dm', 'name': 'Benny (Slice Marin No. 1)', 'text': "boss the armored truck just pulled out of wall st. it's on your map. beat it here or the safe goes to the bank", 'secs': 7},
  {'type': 'stops', 'checkpoint': True, 'objective': 'Stop {n} of {of}: **{name}**',
   'stops': [{'@': 'atm-franklin', 'name': 'the ATM on Franklin St', 'set': cash(2000)}, {'@': 'store-one', 'name': 'Slice Marin No. 1'}],
   'during': [
    # (PACING: the race made visible: the armored truck sets off from Wall St for the store, its blip on the radar the
    # whole way, timed to the safe's clock; the timer is the rule, the truck is the face of it)
    {'at': 6, 'type': 'ally', 'ally': 'truck', 'name': 'the armored truck', 'car': 'van', 'color': '#4B5248', 'from': '@bank', 'to': '@a1-truck', 'speed': 11, 'secs': 270},
    carphone(2, """
      CA: Okay. Breathing. I'm breathing. Where are you going?
      JO: The ATM, then the first store. The safe has the week's take.
      CA: An ATM. For a ransom. You're going to get two hundred dollars and a receipt.
      JO: Daily limit's two thousand.
      CA: Oh, two thousand, great, we'll get him back in installments.
      JO: The armored truck takes the safe at three oh five. I can beat it.
      CA: Then beat it. Drive like we used to drive. Not like a dad.
      JO: I drive like a dad because I'm a dad.
      CA: Not today, you're not. Today you're a getaway with a car seat.""",
      extra=["""
      CA: I should have been here at two. The meeting was at two. I moved it.
      JO: Why'd you move it.
      CA: Nails. I moved our son's teacher meeting for nails, John.
      JO: If you'd been there at two, she'd have come at one. They planned this. It's not the nails.
      CA: Don't be nice to me right now. I can't do nice. Be mean.
      JO: Your nails look terrible.
      CA: You haven't seen them.
      JO: I can hear them. They sound terrible.
      CA: ...Thank you. That helped. That's sick, but it helped.""", """
      CA: He took his walkie-talkie to school today. The dinosaur one.
      JO: The one that beeps at three in the morning?
      CA: That's the one. I hated it. I'd give anything to hear it beep right now.""", """
      CA: Did you tell her? Your mother?
      JO: How do I tell my mother her grandson is... no. Not yet.
      CA: Fine. But when she finds out, I'm telling her you knew first."""],
      wrap="""
      JO: The store's ahead. I can see the sign.
      CA: SLICE MARIN. In letters you can see from space. We may as well have put up a map.
      JO: It's good branding.
      CA: It's a confession with a logo.
      CA: Go. Get the money. I'm getting in my car. I can't sit at a school gate looking at the swings.""",
      pause="CA: Hold on. Your other line's lit. It says MA. Take it, or she'll call me.",
      resume="CA: Well?\nJO: Ricotta. She wants to know about ricotta."),
    {'at': 40, 'type': 'call', 'who': 'ma', 'interrupts': True, 'ring': 6, 'lines': L("""
      MA: Johnny! It's your mother. Are you eating? You sound like you're driving.
      JO: I'm driving, Ma.
      MA: Sunday. Lasagna. Does Milo still hate ricotta or was that a phase?
      JO: Ma, it's not a good time.
      MA: It's never a good time with you. Your father had a good time once. Nineteen eighty-one.
      JO: Milo loves ricotta. Bye, Ma.
      MA: He told me he hates it. Last week. To my face. Put him on.
      JO: He's... at school. I'll call you back.
      MA: You never call back. Kiss him for me.
      JO: ...I will."""), 'voicemail': {'text': "Johnny, it's your mother. Call me. It's about ricotta."}},
    {'at': 100, 'type': 'call', 'who': 'benny', 'interrupts': True, 'auto': True, 'role': 'Voice note',
     'lines': L("BE: Boss, it's Benny. The truck's early, it's at Worth already, I'm stalling him with a calzone. Hurry.")},
   ]},
  {'type': 'say', 'who': 'john', 'text': 'Two thousand. Zero point two percent of a kid.', 'secs': 3, 'wait': False},
  {'type': 'timer', 'name': 'safe', 'stop': True},
  {'type': 'walk', 'to': '@store-one', 'leaveCar': True, 'objective': 'Go in the back to the **safe**.'},
  {'type': 'search', 'at': '@store-one', 'on': 'place', 'label': 'open the safe', 'secs': 2.5, 'objective': 'Open the **safe**: hold F.'},
  {'type': 'set', 'set': cash(36000)},
  {'type': 'say', 'if': 'late1 == true', 'who': 'john', 'text': "Armored truck nearly beat me to it. Don't tell Carissa.", 'secs': 3},
  {'type': 'cutscene', 'set': room('pizzeria', at('john', 0.9, 0.2, face=200), sign='SLICE MARIN No. 1'), 'shots': [
    shot('john', 'Thirty-eight down. Nine hundred and sixty-two to go.', dur=4),
    shot('john', "That's a lot of pizza.", cam={'rel': 'player', 'right': 1.6, 'up': 0.4, 'fwd': 2.6}, dur=3.5)]},
  # (PACING: the hook out: he is being watched already)
  {'type': 'dm', 'name': 'Unknown number', 'text': 'Nice store, planner. Lot of windows. My friends will say hello on Centre Street.', 'secs': 6},
 ]}

# ─────────────────────────────── PT-2 · Courthouse Money ───────────────────────────────
pt2 = {
 'id': 'PT-2', 'title': 'Courthouse Money', 'vehicle': 'rides.gt', 'verbs': ['drive', 'walk', 'escape', 'boost'],
 'start': {'@': 'courthouse', 'mode': 'walk'}, 'time': 'midday', 'traffic': 0.4,
 'stakes': "Lou the bondsman owes you. He's on the courthouse steps. He's always on the courthouse steps.",
 'passLine': 'Lou owns your pizza chain now. You own a chance.',
 'timerLine': 'Lou leaves at 3:30.',
 'steps': [
  {'type': 'transition', 'kicker': 'FOLEY SQUARE', 'text': 'Centre St & Worth St · 3:10 PM', 'secs': 2.5},
  {'type': 'timer', 'name': 'lou', 'seconds': 240, 'label': 'LOU LEAVES', 'fail': 'soft', 'lateLabel': 'LATE', 'flag': 'late2', 'why': 'Lou left. You caught him at his car.'},
  {'type': 'walk', 'to': '@courthouse', 'objective': 'Find **Lou** on the courthouse steps.'},
  {'type': 'cutscene', 'set': room('steps', at('lou', 0.2, -1.6, face='john', look='john'), at('john', 0.1, -0.1, face='lou', look='lou')), 'shots': [
    over('lou', 'lou', 'Johnny Marin. You still put pineapple on the pies?', dur=4),
    shot('john', 'Lou, I need a hundred and fifty thousand dollars. Today.', dur=4),
    shot('lou', 'For that I need collateral. The chain.', dur=3.5),
    shot('john', '...The chain. Fine. Take the papers.', dur=3.5)]},
  {'type': 'choice', 'who': 'lou', 'prompt': 'Lou wants the chain as collateral.', 'timeout': 8, 'default': 0, 'flag': 'haggle',
   'options': [
    {'text': 'Sign it over.', 'value': 'no', 'set': cash(150000), 'reply': 'Pleasure. And Johnny? Thin crust is a cry for help.'},
    {'text': 'Haggle (costs 20 s).', 'value': 'yes', 'set': cash(150000), 'reply': 'Fine, the Tribeca store stays yours. You just cost yourself twenty seconds.'}]},
  {'type': 'timer', 'name': 'lou', 'add': -20, 'if': 'haggle == yes'},
  {'type': 'call', 'who': 'carissa', 'auto': True, 'role': 'On call', 'lines': L("""
    CA: School says she signed out as A. Teodoro. Family friend.
    CA: She knew the password, John. Pepperoni.
    JO: Only we know pepperoni.
    CA: How did it go with Lou? Did you have to sign anything?
    JO: The chain. As collateral.
    CA: Our chain. The whole thing. To a man who calls me 'sweetheart cakes'.
    JO: He gave us a hundred and fifty.
    CA: ...Okay. Sweetheart cakes can have it.""")},
  {'type': 'set', 'set': CLUE},
  {'type': 'walk', 'to': '@courthouse', 'enterCar': True, 'objective': 'Get back in your **{ride.name}**.'},
  {'type': 'timer', 'name': 'lou', 'stop': True},
  ring('delgado', """
    DE: John. You sound well. Pizza agrees with you.
    JO: If you touch him...
    DE: He's eating ice cream. I'm not a monster. I'm an accountant who got robbed.
    DE: Five years ago you emptied my boat and my life. Now you pay it back. With interest, I'm being kind.
    JO: Put him on. I want to hear him.
    DE: He doesn't want to talk to you. Here. Say something to your father.""",
    "You don't pick up? I have your son's backpack. Pick up.", role='Unknown number'),
  {'type': 'trigger', 'cue': 'walkie2', 'say': {'who': 'delgado', 'text': '(two soft beeps)'}},
  {'type': 'wait', 'secs': 2},
  {'type': 'call', 'who': 'delgado', 'auto': True, 'role': 'Unknown number', 'lines': L("""
    DE: He just pressed his little toy. Twice. Children. Ten o'clock, John.
    DE: And John? Tell the school to send the police home. Or I'll know.
    DE: Look in your mirror. My friends are saying hello.""")},
  {'type': 'pursuit', 'checkpoint': True, 'goal': 'lose', 'kind': 'crew', 'count': 2, 'level': 2, 'loseDist': 160, 'loseTime': 6, 'los': 4, 'alert': 'Two black cars. Lose them.',
   'objective': "Lose **Delgado's crew**.",
   'during': [carphone(4, """
      CA: What did he say? You went quiet. You never go quiet.
      JO: He put Milo on. He didn't talk. He pressed his walkie twice.
      CA: Two beeps. Two beeps means he's okay. That's our game. Me and him.
      JO: You have a game?
      CA: We have a whole language, John, you work late.
      CA: Are those horns yours? Are you being chased? Already?
      JO: Two black cars. Very polite. Very fast.
      CA: Take Chambers. No, the other Chambers. There's only one Chambers. TAKE IT.
      JO: I'm taking it!
      CA: You used to lose cops in a minivan with a mattress on the roof.
      JO: The mattress was aerodynamic.""",
      extra=["""
      CA: The school called the police. The headmaster called me after he called you.
      JO: Delgado knows. He already knows.
      CA: Then he's watching the school. Which means he's watching me. Good.
      JO: Good?
      CA: Let him watch. I'm the scariest thing at that school and that includes the lunch lady.""", """
      CA: Is it bad that I'm a little bit proud of how fast you're driving?
      JO: Yes.
      CA: Okay. Still proud."""],
      wrap="""
      CA: Quiet? You lost them? Look at you. My husband the felon.
      JO: Former.
      CA: Former felon. Current hero. Go to Tribeca, Benny has the van."""),
    # (PACING: the school's call comes in mid-chase, call waiting over Carissa: no standing at the kerb for it)
    {'at': 3, 'type': 'call', 'who': 'headmaster', 'interrupts': True, 'persist': True, 'ring': 6, 'lines': L("""
    HM: Mr. Marin. Lionel Ashby, Head of School. I'm so sorry to call under these circumstances.
    JO: Have you found anything?
    HM: Procedure requires me to inform you we've notified the police. A detective is on her way.
    JO: No. You can't. Call them off.
    HM: I can't 'call off' the police, Mr. Marin. That's rather the point of them.
    HM: Is there a reason you'd prefer they weren't involved? A custody matter, perhaps?
    JO: There's no custody matter. We're married. Happily. Mostly.
    HM: Then the detective will help. Her name is Calloway. She's very thorough.
    JO: Great. Thorough. Great."""), 'voicemail': {'text': "Mr. Marin, this is Lionel Ashby, Head of School. Please return my call. It's procedural, and urgent."}},
   ]},
  # (the school's call heard out before the mission ends)
  {'type': 'wait', 'secs': 30, 'call': True},
  {'type': 'wait', 'secs': 30, 'call': True},
  # (PT-2's one clue is the sign-out, set after Carissa's call above: a second here made the count 11 of 10)
  {'type': 'say', 'who': 'john', 'text': "One fifty. That's a whole Lou.", 'secs': 2.5},
  # (PACING: the hook out: he heard about the police)
  {'type': 'dm', 'name': 'Unknown number', 'text': 'I told you to send the police home. Every cop I see near that school, the boy waits an hour longer for his dinner.', 'secs': 6},
 ]}

# ─────────────────────────────── PT-3 · Dough Run ───────────────────────────────
pt3 = {
 'id': 'PT-3', 'title': 'Dough Run', 'vehicle': 'rides.slice-van', 'verbs': ['drive', 'walk', 'deliver', 'escape', 'boost'],
 'start': {'@': 'store-tribeca', 'mode': 'walk'}, 'time': 'midday', 'traffic': 0.45,
 'stakes': "Benny's got the van. Every store's register, cash only, before the bank sweep at four.",
 'passLine': 'Four stores, one van, fifty-two grand in pizza money. And a name: Teodoro.',
 'timerLine': 'Every register before the bank sweep.',
 'steps': [
  {'type': 'dm', 'from': 'carissa', 'text': "Benny left the keys in the van. Don't eat the inventory.", 'secs': 4},
  {'type': 'walk', 'to': '@store-tribeca', 'enterCar': True, 'objective': 'Get in the **Slice Marin van**.'},
  ring('benny', """
    BE: Boss, keys are in the visor. Don't touch the big slice, it's held on with hope.
    JO: Benny, I need every register. Cash only.
    BE: Every register? Boss, are we getting robbed? Are WE robbing?
    JO: Nobody's robbing. It's a... family thing.
    BE: My uncle said that once. Then we didn't see him for eighteen months. Okay. Cash. I'll call ahead.""",
    "Boss, it's Benny. Keys are in the visor. Call me."),
  {'type': 'set', 'set': cash(13000)},
  {'type': 'say', 'who': 'john', 'text': 'Franklin Street register. Thirteen. Smells like garlic and bad decisions.', 'secs': 3.5},
  {'type': 'timer', 'name': 'sweep', 'seconds': 350, 'label': 'BANK SWEEP', 'fail': 'hard', 'checkpoint': True,
   'why': 'The bank sweep took the registers.'},
  {'type': 'stops', 'objective': 'Cash pickup {n} of {of}: **{name}**',
   'stops': [{'@': 'store-soho', 'name': 'the Prince St store', 'bonus': 15, 'set': cash(13000)},
             {'@': 'washsq', 'name': 'the Waverly Pl store', 'bonus': 15, 'set': cash(13000)},
             {'@': 'westvillage', 'name': 'the Bank St store', 'bonus': 15, 'set': cash(13000)}],
   'during': [
    carphone(2, """
      CA: Okay, I made a spreadsheet. Don't laugh.
      JO: I'm the spreadsheet guy.
      CA: You were the spreadsheet guy. I'm the spreadsheet guy now. Column B is 'things we can sell'.
      JO: What's in column B.
      CA: Your watch. My ring. The good blender.
      JO: Nobody pays a ransom with a blender.
      CA: It's a very good blender, John.""",
      extra=["""
      CA: How's the van?
      JO: There's a pizza on the roof. A big plastic slice. It whistles over thirty.
      CA: Our brand whistles. I love that for us.""", """
      CA: Okay, he's eating. That's good. That's... I'm going to be sick.
      CA: Pull over? No. Don't pull over. Keep going. I'll be sick for both of us.
      JO: Do you need me to talk?
      CA: Yes. Talk. Say anything. Tell me about the van.
      JO: It smells like garlic and somebody's left a whole pepperoni roll under the seat.
      CA: Eat it.
      JO: It's from Tuesday.
      CA: Eat it anyway. You haven't eaten since breakfast. I know you.""", """
      CA: Milo wanted to be a delivery driver when he grew up. Then an astronaut. Then a tree.
      JO: A tree?
      CA: He said trees don't have homework. He's not wrong.""", """
      CA: I keep thinking we should call the detective. Tell her everything.
      JO: Everything? Carissa. 'Everything' is five years and three states.
      CA: I know what everything is. I was there for most of it. I drove for most of it.
      JO: Then you know what happens to Milo's parents if we tell her everything.
      CA: ...I hate when you're right in that voice.
      JO: What voice.
      CA: The planner voice. It's back. I hate it. Don't stop."""],
      pause='CA: It\'s beeping. Who is it? Take it, take it.',
      resume="CA: I'm back. Was it him?\nJO: He says Milo's eating bread. Crusts off. No butter."),
    {'at': 45, 'type': 'call', 'who': 'delgado', 'interrupts': True, 'ring': 6, 'role': 'Unknown number', 'lines': L("""
      DE: John, you're driving a pizza van. Did you think I wouldn't notice a pizza van?
      JO: It's a family business.
      DE: I had a family business. You remember. Boats. Warehouses. A man with a parrot.
      DE: Now I have one office and a boy who only eats bread with the crusts cut off.
      JO: Plain. He likes it plain. No butter.
      DE: We know. He told us. Very firmly. He's your wife's son.
      DE: Keep driving, John. Tick, tock."""), 'voicemail': {'text': "You don't pick up? I have your son's backpack. Pick up."}},
    # (PACING: he did notice the pizza van: a black sedan comes for it between the stores; lose it or carry it with you)
    {'at': 85, 'type': 'pursuit', 'goal': 'lose', 'kind': 'crew', 'count': 1, 'level': 1, 'loseDist': 140, 'loseTime': 4, 'alert': 'A black sedan is on the van. Shake it.'},
    # (and a second car the length of Hudson St later: the run never goes quiet for long)
    {'at': 225, 'type': 'pursuit', 'goal': 'lose', 'kind': 'crew', 'count': 1, 'level': 1, 'loseDist': 150, 'loseTime': 4, 'alert': 'Another one. Same plates. Keep the cash moving.'},
   ]},
  {'type': 'timer', 'name': 'sweep', 'stop': True},
  {'type': 'dm', 'name': 'Rider #4 (Slice Marin)', 'text': 'boss a green minivan with a dino sticker just got dumped at the tunnel on canal. looked like a kids seat in it', 'secs': 5},
  {'type': 'car', 'name': 'minivan', 'car': 'minivan', 'color': '#2F6B45', 'at': '@minivan'},
  {'type': 'drive', 'to': '@minivan', 'checkpoint': True, 'objective': 'Check the **green minivan** at the tunnel.',
   'during': [carphone(1, """
      JO: Rider says a green minivan got dumped at the tunnel. Dino sticker.
      CA: Dino sticker. He puts that sticker on everything. The fridge. The dog next door.
      JO: We don't know it's him.
      CA: I know it's him.""",
      wrap="""
      CA: Is he there? John. Is he in it?
      JO: It's empty. Hang on. Getting out.""")]},
  {'type': 'walk', 'to': '@minivan', 'leaveCar': True, 'objective': 'Walk to the **minivan**.'},
  {'type': 'search', 'at': '@minivan', 'on': 'place', 'label': 'search the minivan', 'secs': 3, 'objective': 'Search the **minivan**: hold F.'},
  {'type': 'cutscene', 'shots': [
    shot('john', "Car seat. Dino sticker. And a card. 'Teodoro Family Care, Orchard Street.'", dur=5),
    shot('john', "She's not a nanny. She's a business.", cam={'rel': 'player', 'right': 1.8, 'up': 0.5, 'fwd': 3.2}, dur=3.5)]},
  {'type': 'set', 'set': CLUE},
  {'type': 'call', 'who': 'carissa', 'auto': True, 'role': 'On call', 'lines': L("""
    CA: Orchard Street. That's ten minutes from our old place.
    CA: She's been our neighbor. John, she's been our NEIGHBOR.
    JO: Then she knows the neighborhood. And we know her name.
    CA: Teodoro. I'm writing it on my hand. In eyeliner.""")},
  {'type': 'car', 'name': 'minivan', 'remove': True},
 ]}

# ─────────────────────────────── PT-4 · The Painting ───────────────────────────────
pt4 = {
 'id': 'PT-4', 'title': 'The Painting', 'vehicle': 'rides.gt', 'verbs': ['drive', 'walk', 'fight', 'escape', 'boost'],
 'start': {'@': 'store-soho', 'mode': 'walk'}, 'time': 'midday', 'traffic': 0.4,
 'stakes': 'The SoHo store\'s back office. The ugly painting. Bring it.',
 'passLine': 'The horse is gone. A hundred and twenty-five grand, and Milo is uptown.',
 'timerLine': 'Odette closes at four.',
 'steps': [
  {'type': 'dm', 'from': 'carissa', 'text': 'Benny swapped the van back. He says you owe him a car wash.', 'secs': 4},
  {'type': 'call', 'who': 'carissa', 'auto': True, 'role': 'On call', 'lines': L("""
    CA: The painting. The one with the sad horse.
    JO: It's not a horse. It's a very famous...
    CA: It's a sad horse, John. I've looked at it every time I pee at that store.
    JO: It was the only thing from the boat I kept.
    CA: You kept a stolen painting in a pizza toilet. That's either genius or why we're here.
    JO: Genius.
    CA: Why we're here.""")},
  {'type': 'walk', 'to': '@store-soho', 'objective': 'Go in the back for the **sad horse**.'},
  {'type': 'search', 'at': '@store-soho', 'on': 'place', 'label': 'take the painting', 'secs': 2, 'objective': 'Take the **painting**: hold F.'},
  {'type': 'cutscene', 'set': room('pizzeria', at('john', 0.2, -0.4, face=0), at('hooks', 1.3, 1.9, face='john', look='john'), at('tank', -0.9, 2.1, face='john', look='john', pose='arms'), sign='SLICE MARIN SoHo'), 'shots': [
    over('hooks', 'hooks', "That's the boss's horse.", dur=3),
    shot('john', "It's not a horse.", dur=2.5),
    shot('tank', 'Looks like a horse.', dur=2.5)]},
  {'type': 'timer', 'name': 'odette', 'seconds': 260, 'label': 'ODETTE CLOSES', 'fail': 'hard', 'checkpoint': True,
   'why': "Odette closed. She doesn't reopen for anyone."},
  {'type': 'fight', 'enemies': ['hooks', 'tank'], 'arena': '@store-soho', 'win': 'ko-all', 'rules': 'lesson', 'timer': 120,
   'objective': 'Put **both of them** down.', 'why': 'They walked off with the horse.'},
  {'type': 'search', 'at': '@store-soho', 'on': 'place', 'label': 'take his phone', 'secs': 1.2, 'objective': "Take the big one's **phone**."},
  {'type': 'cutscene', 'shots': [
    {'cam': {'rel': 'player', 'right': 0.3, 'up': 0.02, 'fwd': 1.25}, 'look': {'rel': 'player', 'up': -0.04}, 'fov': 32, 'dur': 4,
     'caption': 'boss says keep the kid fed. uptown by 4'}]},
  {'type': 'set', 'set': CLUE},
  {'type': 'say', 'who': 'john', 'text': "Uptown. That's... most of uptown.", 'secs': 2.5},
  {'type': 'walk', 'to': '@store-soho', 'enterCar': True, 'objective': 'Get in your **{ride.name}**.'},
  ring('odette', """
    OD: Darling. Is it the horse?
    JO: It's not a horse.
    OD: It's the horse. One twenty-five. Cash. My back door. Before four.
    JO: It's worth two million.
    OD: To a museum, darling. To me it's a horse that's wanted in four countries. One twenty-five.
    JO: Fine.
    OD: And do tell Carissa I still have her red coat. From the gala. She left in a hurry.""",
    'Darling, it is Odette. The horse, my back door, before four. Kisses.', ring=6),
  {'type': 'drive', 'to': '@odette-door', 'stopTimer': 'odette', 'objective': "Take the painting to **Odette's back door**.",
   'during': [
    carphone(1, """
      CA: You hung up. You were talking to someone. Was it Odette? It was Odette.
      JO: She says she has your coat.
      CA: My RED coat? I loved that coat. I left it on a fire escape with a security guard chasing me.
      JO: You were incredible that night.
      CA: I was twenty-nine and I could do a pull-up. Now I can't open a juice box without a knife.
      CA: John. Is this how we get him back? Stealing and selling and running? Like before?
      JO: It's how we get the money. Getting him back is something else.""",
      extra=["""
      JO: The guy's phone said uptown by four.
      CA: Uptown. Uptown's huge. Uptown's half the island. That narrows it to... uptown.
      JO: It means not Brooklyn, not Jersey, not a boat. He kept him here.
      CA: He kept him close. Why would he keep him close?
      JO: Because he wants to watch us come to him.
      CA: ...I hate him.""", """
      CA: What else, then? Getting him back.
      JO: I don't know yet. I'll know. I always know eventually.
      CA: You said 'eventually' on the boat. Eventually we were in a dinghy at three in the morning.
      JO: We got out.
      CA: We got out. Okay. Get us out again."""],
      wrap="CA: Hand it over. Get the money. And John? Ask about my coat.",
      pause="CA: It's beeping. Is that your mother? It's your mother.",
      resume='CA: Is she okay? Does she know?\nJO: She thinks I have onions.'),
    {'at': 30, 'type': 'call', 'who': 'ma', 'interrupts': True, 'ring': 6, 'lines': L("""
      MA: Johnny, I called the school to say hello to Milo and a man with an accent hung up on me.
      JO: That's the headmaster, Ma. He's British.
      MA: British! At a public school! What's he doing, teaching them to queue?
      JO: Ma, I'm really busy right now.
      MA: You're always busy. Busy busy. Your father was busy and look, he's dead.
      JO: Dad is alive, Ma. He's in the den.
      MA: He's in the den, which is the same thing. Kiss Milo.
      JO: I... will.
      MA: You said that this morning. You sound funny. Are you crying? Is it the onions?
      JO: It's the onions, Ma. Bye."""), 'voicemail': {'text': "Johnny, it's your mother. The school hung up on me. Call me."}},
    # (PACING: the fight in the store got called in: a cruiser on him on the way to Odette's, the clock still running)
    {'at': 14, 'type': 'pursuit', 'goal': 'lose', 'kind': 'police', 'count': 1, 'level': 1, 'loseDist': 140, 'loseTime': 4, 'alert': 'Somebody called in the fight. Lose the cruiser.'},
   ]},
  {'type': 'walk', 'to': '@odette-door', 'leaveCar': True, 'objective': "Walk to **Odette's back door**."},
  {'type': 'search', 'at': '@odette-door', 'on': 'place', 'label': 'hand over the painting', 'secs': 2, 'objective': 'Hand over the **painting**: hold F.'},
  {'type': 'set', 'set': cash(125000)},
  {'type': 'cutscene', 'shots': [
    {'cam': {'rel': 'player', 'right': -3.5, 'up': 1.4, 'fwd': -5}, 'look': 'player', 'fov': 40, 'dur': 4.5,
     'say': 'odette', 'line': 'Pleasure, darling. Tell your wife I said the horse misses her.'}]},
  {'type': 'walk', 'to': '@odette-door', 'enterCar': True, 'objective': 'Back to your **{ride.name}**.'},
  {'type': 'call', 'who': 'carissa', 'auto': True, 'inCar': True, 'lines': L("""
    CA: Did she say anything about my coat?
    JO: She says it still smells like smoke and bad decisions.
    CA: That's the coat! That's exactly how that coat smells!
    CA: One twenty-five. Three sixty-five total. We're a third of a kid.
    JO: Don't say it like that.
    CA: I have to say it like that. If I say it the normal way I'll drive into the river.""")},
 ]}

# (Agnes's front room on Orchard St: she has him in off the step; they talk across the coffee table)
AGNES = room('apartment', at('agnes', -0.55, -0.15, face='john', look='john'), at('john', 0.75, 0.45, face='agnes', look='agnes'))

# ─────────────────────────────── PT-5 · The Nanny ───────────────────────────────
pt5 = {
 'id': 'PT-5', 'title': 'The Nanny', 'vehicle': 'rides.gt', 'verbs': ['drive', 'walk', 'tail', 'boost'],
 'start': {'@': 'agnes-home', 'mode': 'walk'}, 'time': 'midday', 'traffic': 0.4,
 'stakes': 'Teodoro Family Care. Orchard and Rivington. Third floor. Go be nice. Then don\'t be.',
 'passLine': "A nanny with a conscience, eight grand back, and her son's garage on Forsyth.",
 'timerLine': "Stay on Teddy before he calls it in.",
 'steps': [
  {'type': 'call', 'who': 'carissa', 'auto': True, 'role': 'On call', 'lines': L("""
    CA: Be nice to her first. Old ladies hate being rushed.
    JO: She kidnapped our son.
    CA: Allegedly. With paperwork. Look, be nice, then be the other thing. You know the other thing.
    JO: The face?
    CA: The face. The one you did at the car dealer. He gave us floor mats.
    JO: Those were good floor mats.
    CA: Do the face. Get the mats. Go.""")},
  {'type': 'walk', 'to': '@agnes-home', 'objective': "Ring **Agnes Teodoro's** bell."},
  {'type': 'cutscene', 'set': AGNES, 'shots': [
    over('agnes', 'agnes', 'Mr. Marin. I am so terribly sorry. Please, come off the step, people will look.', dur=4.5),
    shot('john', 'You took my son out of school.', dur=3),
    shot('agnes', 'I was told his father was in hospital. That his mother was not well. I had paperwork.', dur=5),
    shot('agnes', "I've done this forty-one years. I have never once been lied to with paperwork.", dur=4.5,
         cam={'rel': 'agnes', 'right': -0.35, 'up': 0.02, 'fwd': 1.15}),
    shot('john', 'Where is he.', dur=2.5)]},
  {'type': 'choice', 'who': 'agnes', 'prompt': 'Agnes is shaking.', 'timeout': 10, 'default': 0, 'flag': 'asked',
   'options': [
    {'text': 'Ask kindly.', 'value': 'kind', 'set': CLUE,
     'reply': 'A man named Rollo took him at Rivington. He complained about an elevator. An office uptown, on the big street with the old theater sign.'},
    {'text': 'Lean on her.', 'value': 'lean', 'set': CLUE,
     'reply': "You don't frighten me, Mr. Marin. I raised a boy who drives for those people. But I'll tell you anyway."}]},
  {'type': 'say', 'if': 'asked == lean', 'who': 'agnes', 'text': 'A man named Rollo took him at Rivington. An office uptown, on the big street with the old theater sign.', 'secs': 6},
  {'type': 'set', 'set': {'flags': {'rollo': True}}},
  {'type': 'cutscene', 'set': AGNES, 'shots': [
    shot('agnes', 'And take this. Eight thousand dollars. It is what they paid me. I don\'t want it in my house.', dur=5),
    shot('john', 'Mrs. Teodoro...', dur=2.5)]},
  {'type': 'set', 'set': cash(8000)},
  {'type': 'cutscene', 'set': room('apartment', at('agnes', -0.9, -1.85, face='john', look='john'), at('john', 0.4, -0.95, face='agnes', look='agnes')), 'shots': [
    shot('agnes', "That's my son. Teddy. Oh, Teddy, no.", dur=3.5, cam={'rel': 'agnes', 'right': 0.6, 'up': 0.1, 'fwd': 1.6}),
    shot('john', 'He works for Delgado.', dur=2.5),
    shot('agnes', 'He drives for him. Follow him, Mr. Marin. And when you find him, tell him his mother said come home.', dur=5.5)]},
  {'type': 'walk', 'to': '@agnes-home', 'enterCar': True, 'objective': 'Get in your **{ride.name}**. Quick.'},
  {'type': 'timer', 'name': 'teddy', 'seconds': 225, 'label': "TEDDY'S PHONE", 'fail': 'hard', 'checkpoint': True,
   'why': 'Teddy called it in. They know you\'re coming.'},
  # (the owner, after PT-7's 3 km tail: a tail is a minute or so. By Delancey, Ludlow and the Bowery the planner's way was
  # 3.4 km, 8.5 min at Teddy's 9 m/s; now straight from Orchard St to the garage on Forsyth, about 620 m, the tail meter
  # counting it down. Benny's voice note, 120 s in, is moved to after the tail, where it is still heard)
  {'type': 'tail', 'checkpoint': True, 'route': ['@les', '@sdrpark'], 'car': 'sedan', 'color': '#5A5F66',
   'name': "Teddy's sedan", 'ahead': 60, 'speed': 9, 'objective': "Tail **Teddy's sedan**. Don't get spotted.",
   'during': [
    carphone(4, """
      CA: You're tailing a nanny's son. In a black sports car. Very subtle.
      JO: It's dark gray.
      CA: It's black, John. It's the blackest car in the city. It's a funeral with a spoiler.
      JO: Shh. He's turning.
      CA: Don't shh me, I'm not in the car. I'm three avenues away eating a granola bar for strength.""",
      extra=["""
      CA: She gave the money back? The nanny?
      JO: Eight thousand. She was crying.
      CA: I want to hate her. Why is she the nicest person we've met today.
      JO: She asked me to tell her son to come home.
      CA: Did you promise?
      JO: ...Kind of.
      CA: You can't promise that. You don't keep promises today. You only keep secrets.
      JO: What does that mean.
      CA: It means you didn't tell me the painting was still in the store. For five years.
      JO: I didn't want you to worry.
      CA: I'm worrying NOW, John! Retroactively! It's very efficient!
      JO: Can we fight after?""", """
      CA: Yes. After. I'm writing it on my other hand.
      CA: Is he still ahead of you? Don't get close. You always get close.
      JO: I'm a block back.
      CA: Make it a block and a half. Half blocks are where people get caught.""", """
      CA: John. Did she say if he cried? When she took him?
      JO: She said he asked if Daddy was okay. She told him you were in hospital.
      CA: ...He asked about you.
      JO: Yeah.
      CA: He asked about YOU. Not me. I do pickup every day, and he asked about you.
      JO: Because I'm never at pickup. He thought something was wrong.
      CA: That's the saddest compliment I've ever heard. For both of us."""],
      wrap="""
      JO: He stopped at a garage on Forsyth.
      CA: Forsyth. Okay. Don't go in alone. ...You're going in alone. Of course you are.""",
      pause="CA: Your phone's lit up. Take it, but don't lose him.",
      resume="CA: Who was that?\nJO: Ashby. The detective's asking if we have 'a history'."),
    {'at': 40, 'type': 'call', 'who': 'headmaster', 'interrupts': True, 'ring': 6, 'lines': L("""
      HM: Mr. Marin, Lionel Ashby. The detective asked whether your family has... a history.
      JO: A history of what?
      HM: She was vague. She used the word 'interesting'. Twice. I'm not comfortable with 'interesting'.
      JO: We're a pizza family. We're the least interesting family in the school.
      HM: Mrs. Marin once ran the bake sale's cash box like a casino. Children were placing bets.
      JO: That was a fundraiser.
      HM: It was a craps table, Mr. Marin. Good day."""), 'voicemail': {'text': 'Mr. Marin. Ashby again. The detective has some questions. Please call back.'}},
    {'at': 150, 'type': 'timer', 'name': 'teddy', 'stop': True},
   ]},
  {'type': 'timer', 'name': 'teddy', 'stop': True},
  {'type': 'say', 'who': 'john', 'text': 'He stopped at a garage on Forsyth.', 'secs': 2.5},
  {'type': 'call', 'who': 'benny', 'auto': True, 'role': 'Voice note',
   'lines': L("BE: Boss, Lou's guys took the Worth Street oven. The big one. They needed four guys and a song.")},
 ]}

act = {
 'id': 'act1', 'name': 'ACT I · PICKUP',
 'timeline': {'PT-1': {'clock': '2:52 PM', 'time': 'midday'}, 'PT-2': {'clock': '3:10 PM', 'time': 'midday'},
              'PT-3': {'clock': '3:30 PM', 'time': 'midday'}, 'PT-4': {'clock': '3:55 PM', 'time': 'midday'},
              'PT-5': {'clock': '4:20 PM', 'time': 'midday'}},
 'end': {'title': 'END OF ACT I', 'heading': 'PICKUP',
         'stats': [{'label': 'RANSOM', 'value': '$373,000'}, {'label': 'CLUES', 'value': '5 of 10'}, {'label': 'CLOCK', 'value': '4:41 PM'}],
         'story': ['A nanny with paperwork, a sad horse, a pizza van, and a bondsman who owns the chain now.',
                   "Milo is uptown, in an office on the big street with the old theater sign. Teddy drives for the man who has him."],
         'quote': {'text': "Two beeps means he's okay. That's our game. Me and him.", 'by': 'carissa'},
         'next': {'kicker': 'ACT II', 'text': 'CARRYOUT', 'sub': "Teddy's garage. Delgado's crew. The money gets harder."}},
 'missions': [pt1, pt2, pt3, pt4, pt5],
}
# (PACING: the armored truck pulls up just past the store's door, never on the mark he stops at)
places = {'a1-truck': {'@': 'foley', 'name': 'the armored truck at the store', 'offset': {'right': 0, 'fwd': 20}}}
json.dump({'act': act, 'places': places}, open(os.path.join(OUT, 'act1.json'), 'w'), indent=1, ensure_ascii=False)
print('wrote act1.json', len(json.dumps(act)))
