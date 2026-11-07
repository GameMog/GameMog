// Pickup Time, ACT II (PT-6..PT-10): writes act2.json into the repo's .scratch/showcase/pickup-time (git-ignored; PT_OUT
// names another folder)
//   node storykit/showcase/pickup-time/gen_act2.mjs [out file]
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const DIR = process.env.PT_OUT || path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', '.scratch', 'showcase', 'pickup-time');
mkdirSync(DIR, { recursive: true });
const OUT = process.argv[2] || path.join(DIR, 'act2.json');

const TAG = { JO: 'john', CA: 'carissa', DE: 'delgado', AG: 'agnes', HM: 'headmaster', MA: 'ma', BE: 'benny', DC: 'calloway', OK: 'okafor', LO: 'lou', BU: 'bunny', PE: 'pell', TE: 'teddy', RO: 'rollo', MK: 'mack', DA: 'dash' };
// a call sheet block: one line per "TAG (secs): text"
const S = (src) => src.trim().split('\n').map((r) => r.trim()).filter(Boolean).map((r) => {
  const m = /^([A-Z]{2}) \((\d+(?:\.\d+)?)\): (.+)$/.exec(r);
  if (!m) throw new Error('bad line: ' + r);
  if (!TAG[m[1]]) throw new Error('bad tag: ' + r);
  return { who: TAG[m[1]], text: m[3], secs: +m[2] + 0.6 };
});
const HOLD = (k = 0) => ({
  pause: [{ who: 'carissa', text: k % 2 ? "Don't hang up on me, I'll know." : "You got out. I'll hold. I'm eating your fries." }],
  resume: [{ who: 'carissa', text: 'There you are. Where were we? Oh right. Crisis.' }]
});
// the car phone, riding a drive / tail / pursuit
const carPhone = (o) => ({ at: o.at ?? 1, type: 'call', who: 'carissa', role: 'Car phone', auto: true, inCar: true, lines: o.lines, ...(o.extra ? { extra: o.extra } : {}), ...(o.wrap ? { wrap: o.wrap } : {}), hold: o.hold || HOLD(o.k || 0), ...(o.until ? { until: o.until } : {}) });
// close-ups for a cutscene
const close = (who, line, dur = 4) => who === 'john'
  ? { cam: { rel: 'player', right: 0.28, up: 0.02, fwd: 1.15 }, look: { rel: 'player', up: -0.05 }, fov: 30, dur, say: 'john', line }
  : { cam: { rel: who, right: 0.22, up: 0.0, fwd: 1.05 }, look: { rel: who, up: -0.04 }, fov: 30, dur, say: who, line };
const caption = (place, text, dur = 3.2) => ({ cam: { rel: 'player', right: 0.9, up: 0.55, fwd: -2.2 }, look: { rel: 'player', up: -0.5, fwd: 0.8 }, fov: 45, dur, caption: text });
// a set (Mog City's runner draws it in place of the street, as Mog City's opening draws Mr. Big's study): the room and
// who stands where in it (x right, z toward the way in, metres from its middle), so nobody is on a street with the traffic
const room = (name, people, o = {}) => ({ room: name, people, ...o });
const at = (who, x, z, o = {}) => ({ who, at: [x, z], ...o });
const money = (n) => ({ type: 'set', set: { meters: { ransom: { add: n } } } });
const clue = () => ({ type: 'set', set: { meters: { clues: { add: 1 } } } });
const ring = (who, role, lines, voicemail, extra = {}) => ({ type: 'call', who, role, lines, ...(voicemail ? { voicemail: { text: voicemail } } : {}), ...extra });
const DELGADO_VM = "You don't pick up? I have your son's backpack. Pick up.";

/* ------------------------------------------------------------------ PT-6 -- */
const PT6 = {
  id: 'PT-6', title: "Teddy's Garage", vehicle: 'rides.gt', verbs: ['drive', 'walk', 'fight', 'escape', 'boost'],
  start: { '@': 'teddy-garage', mode: 'walk' }, time: 'midday', traffic: 0.45,
  stakes: "Teddy's garage. Three guys. One bag. Go get your money back. Technically it's his money.",
  passLine: 'Paid with his own money. Twenty streets left to search.',
  steps: [
    { id: 'outside', type: 'call', who: 'carissa', role: 'On the phone', auto: true, lines: S(`
      CA (4): Three men. You're one man. You're one man with a bad knee.
      JO (3): My knee is fine.
      CA (4): Your knee made a noise at Milo's birthday. On the bouncy castle.
      JO (3): Everyone's knee makes a noise on a bouncy castle.
      CA (5): Just come back out. That's all. Get the bag, get the boy's name, come back out.
      JO (2): I'll come back out.
      CA (3): Promise it. No. Don't promise. Just do it.`) },
    { type: 'walk', to: '@teddy-garage', radius: 4, objective: 'Walk into **the garage**.' },
    // (inside the garage: John in from the street door, the three of them in his way, Teddy by the lift)
    { type: 'cutscene', set: room('garage', [at('john', 0.2, 2.6, { face: 'mack', look: 'mack' }), at('mack', 0.5, 1.1, { face: 'john', look: 'john' }), at('hooks', -1.2, 0.4, { face: 'john', look: 'john', pose: 'arms' }),
      at('tank', 1.9, 0.2, { face: 'john', look: 'john' }), at('teddy', -2.6, -1.4, { face: 'john' })]), shots: [
      close('mack', 'Pizza guy. You lost?', 3.4),
      close('john', "I'm here for a bag and a kid.", 3.4),
      close('mack', 'We got a bag.', 3)
    ] },
    { id: 'garage-clock', type: 'timer', name: 'garage', seconds: 210, label: 'THEY CALL IT IN', fail: 'hard', why: 'Rollo found out. The bag is gone.', checkpoint: true },
    { id: 'fight', type: 'fight', enemies: ['mack', 'hooks', 'tank'], arena: '@teddy-garage', win: 'ko-all', timer: 150, rules: 'full', objective: 'Put **all three** down.', why: 'They put you down. The bag stayed with them.' },
    { type: 'search', at: '@teddy-garage', label: 'take the bag', secs: 1.5, objective: 'Take **the bag**.' },
    money(64000),
    { type: 'cutscene', set: room('garage', [at('teddy', -1.3, -0.6, { face: 'john', look: 'john' }), at('john', -0.4, 0.6, { face: 'teddy', look: 'teddy' })]), shots: [
      close('teddy', "I just drive. I didn't know it was a kid till the car.", 4.2),
      close('john', 'Your mother says come home.', 3),
      close('teddy', '...She said that?', 2.6)
    ] },
    { type: 'search', at: '@teddy-garage', on: 'place', label: "search Teddy's car", secs: 1.5, objective: "Search **Teddy's car**." },
    { type: 'cutscene', shots: [caption('@teddy-garage', 'PARKING · W 12_ ST · 2:41 PM', 3.4)] },
    clue(),
    { type: 'timer', name: 'garage', stop: true },
    { type: 'walk', to: '@teddy-garage', enterCar: true, objective: 'Get in **the Vantor GT**.' },
    { id: 'chase', type: 'pursuit', goal: 'lose', kind: 'crew', count: 3, level: 2, loseDist: 170, loseTime: 5, roles: ['chaser', 'cutter', 'chaser'], checkpoint: true,
      objective: "Lose **Rollo's cars**.", during: [carPhone({ at: 2, k: 1, lines: S(`
        CA (3): You came out. You came out! Are you hurt?
        JO (4): My knuckles are filing a complaint. I got a receipt. W, one, two, something.
        CA (6): Twelve-something street. That's every street from a hundred and ten to a hundred and twenty-nine.
        JO (3): Twenty streets. That's progress.
        CA (5): I'm writing them down. I've got a crayon and a juice box and I'm writing them down.
        CA (5): Why do I have a juice box? Because I'm a mother, John, there's always a juice box.`),
        extra: [S(`
          JO (4): Delgado called. He said Milo fell asleep on his coat.
          CA (2): On his coat.
          JO (2): Yeah.
          CA (5): He sleeps on coats. He's done it since he was two. Wherever there's a coat.
          CA (5): That man has my son asleep on his coat and I'm in traffic on Second Avenue.
          JO (2): Carissa.
          CA (5): I'm fine. I'm not fine. I'm going to bite the steering wheel. Keep driving.`), S(`
          CA (4): Did he say anything else? About Miami?
          JO (3): His wife left him.
          CA (4): Good. No. Not good. I don't know. Don't make me feel sorry for him.
          JO (4): I'm not. I'm just telling you what he said.
          CA (5): You always do this. You understand the bad guy. You did it with the parrot man.
          JO (3): The parrot man was misunderstood.
          CA (3): He was a pirate, John.`)],
        wrap: S(`
          CA (3): Lost them? Okay. Washington Square. Bunny wants to see you.
          JO (2): Bunny. Of course. Bunny.`) }),
      // (PACING 2: Delgado rings as Rollo's cars come out, call waiting over Carissa: not at the garage door)
      { at: 3, interrupts: true, persist: true, ring: 6, ...ring('delgado', 'Blocked number', S(`
      DE (4): You paid me sixty-four thousand dollars of my own money.
      JO (4): You said a million. You didn't say whose.
      DE (4): Funny. Your wife is funnier. Rollo, wake up the others.
      DE (5): John, do you know what I do every night? I count. What I had. What you took.
      DE (5): The boat. The house on the water. My wife, who left when the money did.
      JO (3): I'm sorry about your wife.
      DE (5): Don't. You're not sorry. You're a planner. You're planning while you say it.
      DE (3): Your boy fell asleep. On my coat.`), DELGADO_VM) },
    ] },
    // (Delgado heard out before Benny's note)
    { type: 'wait', secs: 30, call: true },
    { type: 'voicenote', who: 'benny', role: 'Benny · Slice Marin, Worth St', text: "Boss. Two guys from Lou's office are measuring the ovens. They called me 'the asset'. Am I the asset? Call me.", secs: 7 },
    // (PACING 2: her Gregory call rides the drive to Washington Square, where Bunny waits: not the car parked after the chase)
    { id: 'gregory', type: 'drive', to: '@chess-tables', objective: 'Head for **Washington Square**.', during: [carPhone({ k: 1, lines: S(`
      CA (4): Benny says Lou's guys are measuring the ovens.
      JO (3): Lou's thorough. He'll measure the mice.
      CA (4): We don't have mice. We have one mouse. Gregory. He's practically staff.
      JO (3): Gregory goes with the chain.
      CA (4): Gregory stays with us. He's family. He's the only one who never lied to me today.
      JO (2): Ouch.
      CA (3): Sorry. Not sorry. Tired. Washington Square.`) })] }
  ]
};

/* ------------------------------------------------------------------ PT-7 -- */
const PT7 = {
  id: 'PT-7', title: 'The Vig', vehicle: 'rides.gt', verbs: ['drive', 'walk', 'tail', 'fight', 'escape', 'boost'],
  start: { '@': 'chess-tables', mode: 'walk' }, time: 'midday', traffic: 0.4,
  stakes: 'Bunny Ferraby lends to people banks hate. Banks hate you. Perfect match.',
  passLine: 'Bunny owns a piece of you now. Everybody does.',
  steps: [
    { type: 'walk', to: '@chess-tables', radius: 4, objective: 'Find **Bunny** at **the chess tables**.' },
    // (Bunny at her stone table in the park, a game on; John across it)
    { type: 'cutscene', set: room('park', [at('bunny', 0.75, 0, { face: 'john', look: 'john', pose: 'sitTalk', seat: 0.47 }), at('john', -0.85, 0.1, { face: 'bunny', look: 'bunny' })]), shots: [
      close('bunny', "Sit. You play? No? Good, I hate losing to amateurs.", 4),
      close('john', 'Two hundred thousand.', 2.6),
      close('bunny', "Two hundred, ten percent today, and a favor. A kid named Dash owes me forty. He's got a blue hatch.", 5.4),
      close('john', "I don't do favors.", 2.6),
      close('bunny', "Then you don't do loans. I'll start the clock.", 3.4)
    ] },
    { id: 'clock', type: 'timer', name: 'clock', seconds: 320, label: "BUNNY'S CLOCK", fail: 'hard', why: "Bunny's chess clock ran out. So did her offer.", checkpoint: true },
    { type: 'walk', to: '@chess-tables', enterCar: true, objective: 'Get in **the Vantor GT**.' },
    // (the owner, PT-7: "I followed for 5 minutes but nothing happened": by Bank St the planner's way was 3.0 km, over 5 min
    // at a follower's pace, longer than BUNNY'S CLOCK. Now round the block: University Pl, E 10th St and down 5th Ave to
    // the Mews, about 470 m, a minute or so, the tail meter counting it down)
    { id: 'tail', type: 'tail', route: ['@washsq', '@a2-mews'], car: 'lowered', color: '#2F6FD6', name: "Dash's blue hatch", speed: 10,
      objective: 'Follow **Dash** to **Washington Mews**. Not too close.', during: [carPhone({ lines: S(`
        CA (4): You're collecting for a loan shark. Today. With our son kidnapped.
        JO (2): She's very nice.
        CA (5): She's named Bunny, John. Nobody named Bunny is very nice. That's a trap name.
        JO (4): She lends two hundred. Nobody else will lend us two hundred.
        CA (4): Because nobody else knows we're the kind of people who need two hundred by tonight.`),
        extra: [S(`
          CA (5): I want to call the detective. I'm serious this time. I have her card. Ashby gave it to me.
          JO (3): If Delgado sees cops, he moves Milo.
          CA (5): And if he doesn't see cops, he keeps Milo! What's the plan where he gives him back, John?
          JO (3): We pay. He gives him back.
          CA (5): That's not a plan. That's a hope with a spreadsheet.
          JO (4): It's what we have.
          CA (3): ...It's what YOU have.
          JO (2): Meaning what.
          CA (5): Meaning I'm in a car doing nothing while you collect for a woman named after a rabbit.`), S(`
          JO (4): You're not doing nothing. You found Teodoro. You found the minivan.
          CA (4): I found a sticker. I found a business card. You found a fist fight.
          JO (3): You want the fist fights?
          CA (3): I want ONE fist fight. One. With Rollo.`)],
        wrap: S(`
          CA (4): Is that Dash? He looks twelve. Don't hit a twelve-year-old.
          JO (3): He's thirty-one. He has a mortgage.`) })] },
    { type: 'walk', to: '@washmews', leaveCar: true, radius: 5, objective: 'Get out and catch **Dash** in **the Mews**.' },
    { id: 'mews', type: 'fight', enemies: ['dash', 'hooks'], arena: '@washmews', win: 'ko-all', timer: 90, rules: 'full', objective: "Get **Bunny's forty** back.", why: "Dash got away with Bunny's forty." },
    { type: 'search', at: '@washmews', label: 'take the envelope', secs: 1, objective: 'Take **the envelope**.' },
    { type: 'timer', name: 'clock', stop: true },
    { type: 'call', who: 'bunny', role: 'The chess tables', auto: true, lines: S(`
      BU (5): Forty, from Dash? You're hired. Two hundred, minus my twenty. One eighty in your trunk.
      JO (2): In my trunk?
      BU (5): I'm fast. Also somebody called the cops about a fight in the Mews. Bye.`) },
    ring('ma', "Ma", S(`
      MA (4): Johnny. A policewoman called me. At home. Asking about you.
      JO (2): Ma...
      MA (5): She asked if you ever lived in Florida. I said my son lives in New York and makes pizza.
      MA (3): Johnny. Where is Milo.
      JO (4): Ma, I need you to not call Carissa. Okay? Not now.
      MA (5): Something's wrong. I can hear it. You sounded like this when you were nine and the hamster.
      JO (3): Ma. Please.
      MA (5): I'm making the lasagna. I'm making it now. Bring him home to eat it. You hear me?
      JO (2): I hear you.`), "Johnny, it's your mother. A policewoman called the house. Call me back. I'm making the lasagna."),
    { type: 'search', at: '@washmews', on: 'ride', part: 'trunk', label: 'check the trunk', secs: 1.2, objective: 'Check the {ride}\'s **trunk**.' },
    money(180000),
    { type: 'say', who: 'john', text: 'One hundred and eighty thousand dollars. In my trunk. Next to the spare.', secs: 3.4 },
    { id: 'cops', type: 'pursuit', goal: 'lose', kind: 'police', count: 2, level: 1, loseDist: 160, loseTime: 5, checkpoint: true, objective: 'Lose **the police**.',
      during: [
        carPhone({ at: 2, k: 1, lines: S(`
          CA (3): Are those sirens? Are those YOUR sirens?
          JO (3): Bystanders called it in.
          CA (6): You beat up a man named Dash in a mews. That's the most rich-person crime I've ever heard.
          JO (2): He started it.`),
          extra: [S(`
            JO (4): Calloway called me. My mother gave her my number.
            CA (4): Your MOTHER. Your mother talked to a detective?
            JO (4): She told her I hated swimming.
            CA (5): That's actually useful intel, you do hate swimming. Did your mother cry?
            JO (3): She's making lasagna.
            CA (4): Oh no. She's making lasagna. She only makes it when someone's dying.`)],
          wrap: S(`
            CA (6): Lose them, babe. Then come up. He wants a 'good faith payment'. A hundred thousand, Chelsea Park, a bench.
            JO (2): That's a trap.
            CA (4): Obviously it's a trap. Go anyway. Be clever.`),
          hold: { pause: [{ who: 'carissa', text: "It's beeping. Who's beeping? Go, I'll hold." }], resume: [{ who: 'carissa', text: "I'm back. Who was it?" }] } }),
        { at: 15, type: 'call', who: 'calloway', role: 'NYPD · Detective', interrupts: true, persist: true, lines: S(`
          DC (5): Mr. Marin. Detective Calloway. Is that a siren behind you or are you near a fire?
          JO (3): Wrong number.
          DC (6): Your mother gave me this number. She also told me you were a very good boy who hated swimming.
          JO (3): I'm a little busy, detective.
          DC (6): I bet. Your son's school says your son is missing. Your wife won't return calls. And you're in a chase.
          DC (4): People who aren't in trouble usually call me back.
          JO (4): People who aren't in trouble don't have to.
          DC (3): Cute. I'll be at the school. Come see me.`),
          voicemail: { text: "Mr. Marin. Detective Ruth Calloway. You'll want to call me before I want to call you." } }
      ] },
    // (the detective heard out: a chase lost fast no longer ends the mission on her mid-line)
    { type: 'wait', secs: 30, call: true }
  ]
};

/* ------------------------------------------------------------------ PT-8 -- */
const PT8 = {
  id: 'PT-8', title: 'Good Faith', vehicle: 'rides.gt', verbs: ['drive', 'walk', 'tail', 'fight', 'escape', 'boost'],
  start: { '@': 'flatiron', face: 'chelsea' }, time: 'midday', traffic: 0.5,
  stakes: 'A hundred thousand. The bench in Chelsea Park. Then walk away.',
  passLine: 'You paid good faith. Then you took it back with interest.',
  steps: [
    ring('delgado', 'Blocked number', S(`
      DE (5): A hundred thousand. The bench in Chelsea Park. Then walk away, don't look back.
      JO (3): How do I know you'll keep your word?
      DE (5): You don't. That's what good faith means. I learned it from you, on the boat.
      DE (4): Your son asked me if I'm a pirate. I said no. He seemed disappointed.`), DELGADO_VM),
    { id: 'bench', type: 'timer', name: 'bench', seconds: 200, label: 'THE BENCH', fail: 'hard', why: "Nobody came. Delgado says you're not serious.", checkpoint: true },
    { type: 'drive', to: '@drop-park', objective: 'Take **$100,000** to **the bench in Chelsea Park**.', during: [carPhone({ lines: S(`
        CA (5): I'm doing the math. If he wanted good faith he'd give US something.
        JO (4): He's testing if we'll do what he says.
        CA (4): We never do what anybody says. That's our whole marriage.`),
        extra: [S(`
          CA (4): Don't put the bag down. I changed my mind. Don't put the bag down.
          JO (4): You told me to go. Twenty minutes ago. You said be clever.
          CA (5): Twenty minutes ago I was braver. I've been eating gas station almonds since then.
          JO (4): If I don't drop it, he knows we won't play. Then what?
          CA (3): Then we play a different game.
          JO (2): Which game?
          CA (4): I DON'T KNOW, John, you're the planner! Plan a different game!
          JO (3): I'm planning THIS game!
          CA (2): Mm.
          JO (2): Carissa.
          CA (3): I'm here. I'm just being quiet so I don't say something.
          JO (2): Say it.`), S(`
          CA (5): If you'd taken that loan meeting a month ago, like I said, we'd have the money in the bank.
          JO (3): That's not fair.
          CA (3): I know it's not fair. That's why I was being quiet.
          CA (4): I'm sorry. I'm not sorry. I'm sorry. Both. Put the bag down.
          JO (2): Okay.`)],
        wrap: S(`CA (3): Go. I'll be quiet. I'm not hanging up.`) }),
      // (PACING: the detective has cars out: a checkpoint across the way to the bench, a hundred grand on the seat. Ram it or
      // go round, the bench's clock running)
      { type: 'roadblock', at: '@drop-park', back: 70, r: 14, cars: 2, kind: 'police', text: "CALLOWAY'S CHECKPOINT" }] },
    { type: 'walk', to: '@drop-park', leaveCar: true, radius: 4, objective: 'Walk the bag to **the bench**.' },
    { type: 'search', at: '@drop-park', label: 'leave the bag', secs: 1.5, objective: 'Leave **the bag** on the bench.' },
    money(-100000),
    { type: 'timer', name: 'bench', stop: true },
    { type: 'say', who: 'john', text: "Walk away. Don't look back. ...I'm looking back.", secs: 3 },
    { type: 'npc', id: 'mack-b', who: 'mack', at: { rel: 'player', right: 8, fwd: 12 } },
    { type: 'beat', shot: { cam: { rel: 'mack', right: 0.5, up: 0.1, fwd: 2.4 }, look: { rel: 'mack', up: -0.2 }, fov: 34 }, dur: 3.4, say: { who: 'mack', text: "Boss doesn't need to know about all of it." } },
    { type: 'call', who: 'carissa', role: 'On the phone', auto: true, lines: S(`
      CA (3): You're back? Is it gone? Is the money gone?
      JO (3): It's gone. Wait. Somebody's picking it up.
      CA (3): Did he just say 'all of it'?
      JO (3): He's skimming. From Delgado.
      CA (4): Oh, I LOVE a thief who steals from a thief. Follow him.`) },
    { type: 'npc', remove: 'mack-b' },
    { type: 'walk', to: '@drop-park', enterCar: true, objective: 'Back in **the Vantor GT**.' },
    // (a tail is a minute or so, the tail meter counting it down: by W 24th St it was 1.4 km, now straight to 11th Ave, 1.0 km)
    { id: 'tail', type: 'tail', route: ['@chelseapark', '@westchelsea'], car: 'suv', color: '#141414', name: "the bagman's SUV", objective: 'Tail **the bagman**.',
      during: [
        carPhone({ at: 1, lines: S(`
          CA (4): Is that him? The black one? Stay back. Stay way back.
          JO (3): I've done this before.
          CA (4): You've done it from the OTHER side. Different skill.
          JO (3): Same skill. Different seat.`),
          extra: [S(`
            JO (5): Calloway. She's watching the bench. She read your calendar. 'Pickup, ten PM'.
            CA (5): I put it in the calendar! I put a kidnapping in the family calendar! With a reminder!
            JO (3): Why would you do that?
            CA (5): Because I put everything in the calendar! It's how I don't lose my mind!
            JO (4): Okay. Okay. She knows something's at ten. She doesn't know where.
            CA (3): Neither do we.
            JO (4): We will. The bagman's turning. I'm going after him.
            CA (4): Get it back. Every dollar. And John? I'm sorry I said the loan thing.
            JO (3): You were right about the loan thing.
            CA (3): I know. Still sorry.`)],
          wrap: S(`CA (3): Get out. Hit somebody for me. Gently. Then not gently.`),
          hold: { pause: [{ who: 'carissa', text: "It's beeping. Who's beeping? Go, I'll hold." }], resume: [{ who: 'carissa', text: 'Who was it? Him?' }] } }),
        { at: 14, type: 'call', who: 'calloway', role: 'NYPD · Detective', interrupts: true, lines: S(`
          DC (5): Mr. Marin. A hundred thousand dollars on a park bench is a strange way to feed pigeons.
          JO (3): You're watching me?
          DC (5): I'm watching the bench. A man with a bag is watching the bench. You're in a black car watching him.
          DC (4): Lot of watching. Want to tell me who's on the other end?
          JO (3): I can't.
          DC (5): Can't is a big word. Won't is honester. Call me before ten, Mr. Marin.
          JO (2): Why ten?
          DC (4): Because that's when your wife's phone says she has an appointment. 'Pickup'.`),
          voicemail: { text: "Mr. Marin. Calloway. A bag on a park bench is a strange way to feed pigeons. Call me before ten." } }
      ] },
    { type: 'walk', to: '@westchelsea', leaveCar: true, radius: 5, objective: 'Get out. **The bagman** is here.' },
    { id: 'skim', type: 'fight', enemies: ['mack', 'hooks', 'tank'], arena: '@westchelsea', win: 'ko-all', timer: 150, rules: 'full', checkpoint: true, objective: 'Take the bag back from **the bagman** and his friends.', why: 'The bagman kept the bag.' },
    { type: 'search', at: '@westchelsea', label: 'take the bag back', secs: 1.5, objective: 'Take **the bag** back.' },
    money(115000),
    { type: 'search', at: '@westchelsea', label: "read the bagman's phone", secs: 1, objective: "Read **the bagman's phone**." },
    { type: 'cutscene', shots: [caption('@westchelsea', '9TH FLOOR STAYS DARK TILL MIDNIGHT', 3.6)] },
    clue(),
    { type: 'call', who: 'carissa', role: 'On the phone', auto: true, lines: S(`
      CA (3): Did you get it? All of it?
      JO (4): All of it. And his cut. Fifteen grand of a skimmer's retirement.
      CA (4): We just made money on a ransom drop. Is that a first? That has to be a first.
      JO (3): Write it in the calendar.
      CA (3): I'm never using the calendar again.
      CA (3): It's beeping. It's him. Answer him. Be polite. He hates polite.`) },
    ring('delgado', 'Blocked number', S(`
      DE (4): Mack says you took the bag back. Mack says a lot of things.
      JO (3): Mack had his own bag. Check his car.
      DE (5): ...Thank you, John. That is genuinely helpful. The price is still a million.`), DELGADO_VM)
  ]
};

/* ------------------------------------------------------------------ PT-9 -- */
const PT9 = {
  id: 'PT-9', title: 'The Banker', vehicle: 'rides.gt', verbs: ['drive', 'walk', 'escape', 'boost'],
  start: { '@': 'pell-condo', mode: 'walk' }, time: 'golden', traffic: 0.5,
  stakes: "Remember the loan guy who said no? He's on Delgado's payroll. He sold them our address.",
  passLine: "The banker paid. The coupe's hot. Harlem, somewhere.",
  steps: [
    { type: 'call', who: 'carissa', role: 'On the phone', auto: true, lines: S(`
      CA (6): I called the bank pretending to be you. Pell left at noon. 'Personal day.'
      CA (5): Then I checked who co-signed Milo's emergency card. Our bank's notary stamp. Pell's stamp.
      JO (2): Pell?
      CA (4): He gave them pepperoni, John. The loan man. The loan man you were seeing today.
      CA (5): Why were you seeing a loan man today? You said the stores were 'great'. You said 'killing it'.
      JO (3): Can we do this after?
      CA (4): No. We've done everything after. Tell me now.`) },
    { type: 'walk', to: '@pell-condo', radius: 4, objective: 'Find **Pell** at **his tower**.' },
    // (the lobby of his glass tower: Pell by the desk, John in from the street)
    { type: 'cutscene', set: room('lobby', [at('pell', 1.6, 1.85, { face: 'john', look: 'john' }), at('john', 0.4, 2.7, { face: 'pell', look: 'pell' })]), shots: [
      close('pell', "Mr. Marin. You've reconsidered our risk profile?", 3.6),
      close('john', "You sold my son's school form to Delgado.", 3.4),
      close('pell', 'I sold a form. What people do with forms is not my department.', 4),
      close('john', "Where's the money he pays you.", 3)
    ] },
    { type: 'choice', who: 'pell', prompt: 'Pell is reaching for his phone.', timeout: 8, default: 0, flag: 'pellphone', options: [
      { text: 'Grab the phone.', reply: 'Fine! Locker two-twelve, the convention center. Cielo Azul Holdings. They lease something in Harlem.', value: 'grabbed' },
      { text: 'Let him call.', reply: 'Yes, police? A man in a pizza... sports car... is threatening me. Locker two-twelve. Cielo Azul. Harlem. Happy?', value: 'called', set: { flags: { pellcalled: true } } }
    ] },
    { type: 'cutscene', shots: [caption('@pell-condo', 'CIELO AZUL HOLDINGS · AN OFFICE IN HARLEM', 3.4)] },
    clue(),
    { id: 'locker', type: 'timer', name: 'locker', seconds: 150, label: "PELL'S LOCKER", fail: 'hard', why: "Pell's people emptied the locker.", checkpoint: true },
    { type: 'walk', to: '@pell-condo', enterCar: true, objective: 'Get in **the Vantor GT**.' },
    { type: 'drive', to: '@javits', objective: "Get to **Pell's locker** at **the convention center**.", during: [carPhone({ lines: S(`
        CA (2): Well?
        JO (5): Locker first. It's one block. Then I tell you everything. I promise.
        CA (4): One block. I'm counting the block. I'm counting out loud.
        JO (2): Carissa.
        CA (3): Forty feet. Thirty feet. Go get his sock money.`),
        wrap: S(`CA (3): That's the convention center. Go. I'm staying on.`) })] },
    { type: 'walk', to: '@lockers', leaveCar: true, radius: 4, objective: 'Find **locker 212**.' },
    { type: 'search', at: '@lockers', label: 'open locker 212', secs: 2, objective: 'Open **locker 212**.' },
    money(140000),
    { type: 'timer', name: 'locker', stop: true },
    { type: 'cutscene', shots: [close('john', 'A hundred and forty thousand dollars and a gym sock. Banking.', 4)] },
    ring('agnes', 'The nanny', S(`
      AG (4): Mr. Marin. It's Agnes Teodoro. I hope this is not a bad moment.
      JO (3): It's... a moment. Go ahead.
      AG (6): I have not stopped thinking about your boy. He held my hand crossing Lexington. He said 'you hold it tighter than my mom'.
      AG (6): He asked if he'd be back for pizza night. I said yes. I'd like that to be true, Mr. Marin.
      AG (4): If I remember anything else, I'll call. I'm writing it all down. Forty-one years, I write it down.`),
      "Mr. Marin, it's Agnes Teodoro. Your boy asked if he'd be back for pizza night. I said yes. Please make it true."),
    { type: 'walk', to: '@lockers', enterCar: true, objective: 'Back in **the Vantor GT**.' },
    { id: 'cops', type: 'pursuit', goal: 'lose', kind: 'police', count: { base: 2, add: [{ if: 'pellcalled == true', n: 1 }] }, level: 3, loseDist: 200, loseTime: 7, alert: 'They have the plate. Lose them, and say it to her now.', checkpoint: true, objective: 'Lose **the police**.',
      during: [carPhone({ at: 2, k: 1, lines: S(`
        CA (6): They've got your plate. Black sports coupe, Slice Marin owner. Your car is famous now.
        JO (2): I love this car.
        CA (6): You love it more than our first apartment and that apartment had a bath IN THE KITCHEN.
        CA (2): Now. Tell me now.
        JO (4): The chain's broke. Since winter. Three stores are losing money every month.
        CA (2): Since winter.
        JO (5): I thought one loan would fix it. I didn't want you to worry. You were happy.
        CA (5): I was happy because I didn't know! That's not happy, John, that's uninformed!
        JO (4): I was protecting you.
        CA (6): You were protecting the PLANNER. The guy who always has it handled. You never let me drive anymore.
        JO (3): You want to drive? You're driving right now!
        CA (5): I'm driving in CIRCLES on the East Side while you make every call!
        JO (4): Because if I get it wrong, it's on me, not you!
        CA (5): It's not on you! He's OUR son! It's on us! It's always been on us!
        JO (2): Yeah.
        CA (3): Say something.
        JO (4): I went to the bank because I was scared. That's it. That's the whole plan.
        CA (2): ...Okay.
        CA (4): Okay. I'm still angry. I'm going to be angry until about Thursday.
        JO (3): Thursday's fair.`),
        extra: [S(`
          JO (5): Agnes called. She said Milo held her hand crossing Lexington. Said she holds it tighter than you.
          CA (2): ...He said that?
          JO (2): Yeah.
          CA (5): I hold it loose so he feels like a big boy. I let go too early sometimes. I always let go too early.
          JO (3): You didn't let go today. Someone took it.
          CA (3): Stop being nice, I'm still angry.
          JO (2): Thursday.
          CA (3): Thursday. Lose the police.`), S(`
          CA (4): Do you think Milo knows? That it's us? That we're why?
          JO (4): He's six. He thinks it's an adventure. A nanny and ice cream and a pirate.
          CA (5): I hope he thinks that forever. I hope he never knows what we were.
          JO (4): He'll know what we are. That's what counts.`)],
        wrap: S(`
          CA (5): Ditch it at Murray Hill. Benny's bringing the van. Nobody looks twice at a pizza van.
          CA (5): Ms. Okafor called. She'll talk to you at the school. Only you. Bring the van.`) }),
        // (PACING: Pell's call lands as the sirens do: no standing at the lockers for it)
        { at: 4, type: 'call', who: 'pell', role: 'Loan officer', interrupts: true, persist: true, ring: 6, lines: S(`
          PE (4): Mr. Marin. That was my retirement. You understand I have to report a theft.
          JO (3): Report it. Tell them where it came from.
          PE (5): ...On reflection, I'll report a lost gym sock. Please don't call my branch.
          PE (3): And you'll find the police already know your plate. That one wasn't me. Mostly.`), voicemail: { text: "Mr. Marin. Gordon Pell. The police know your plate. That one wasn't me. Mostly." } },
      ] },
    // (Pell, then the fight in the car, heard out after the police are lost)
    { type: 'wait', secs: 30, call: true },
    { type: 'wait', secs: 30, call: true },
    { type: 'wait', secs: 30, call: true }
  ]
};

/* ----------------------------------------------------------------- PT-10 -- */
const PT10 = {
  id: 'PT-10', title: 'Show and Tell', vehicle: 'rides.slice-van', verbs: ['drive', 'walk', 'sneak', 'deliver', 'escape'],
  start: { '@': 'flatiron', face: 'murrayhill' }, time: 'golden', traffic: 0.5,
  stakes: "Ms. Okafor. Side door. There's a detective out front, so don't be you.",
  passLine: 'A dinosaur walkie-talkie and three grand in lemon bar money.',
  steps: [
    { type: 'transition', kicker: 'MURRAY HILL', text: 'Murray Hill Grammar · E 37th St · 6:25 PM', secs: 2.6 },
    // (PACING 2: parked up the block, not at the front: the sneak starts 50 m up Madison from the corner)
    { type: 'drive', to: '@a2-van', objective: 'Take the van to **Murray Hill Grammar**. Park up the block.', during: [carPhone({ lines: S(`
        CA (4): Okay. Before you go in. I need to say something and you need to not talk.
        JO (2): Okay.
        CA (6): I was mean in the car. About the bank. You were scared. I get scared too. I just scream at it.
        CA (5): I'm not mad you went to the bank. I'm mad you went alone. Don't go alone anymore. To anything.
        JO (3): I'm going into the school alone.
        CA (4): You're going in with me in your ear. That's not alone. That's never been alone.
        JO (2): Okay.`),
        wrap: S(`CA (3): Okay. Go get the dinosaur.`) }),
      // (PACING: Ms. Okafor rings as the van comes up Madison: no standing at the kerb for it)
      { at: 18, type: 'call', interrupts: true, persist: true, ring: 6, who: 'okafor', role: 'Ms. Okafor · First grade', lines: S(`
      OK (5): Mr. Marin? Adaeze Okafor. Please don't come to the front, there's a detective with a very small notepad.
      JO (3): Is Milo... did he say anything? Before?
      OK (6): He said the nice lady promised a big street with an old sign that lights up. He was excited. I'm so sorry.
      OK (5): He brought one of his walkie-talkies to show and tell. The other one's in his cubby. Green, a dinosaur.
      OK (6): Box says half a mile. He showed the whole class. Two beeps means 'I'm okay', apparently. It's a family code.
      JO (2): It is. It's our code.
      OK (4): Side door's propped with a dictionary. Cubby is the third from the window. Go.`),
      answer: { flags: { okafor: true } },
      voicemail: { text: "Mr. Marin, it's Ms. Okafor. Side door, third cubby, the green walkie-talkie. Please hurry." } }] },
    // (the teacher's call, heard out at the kerb if the drive didn't hold all of it)
    { type: 'wait', secs: 30, call: true },
    { type: 'say', who: 'john', text: 'Last time I was here was the bake sale. I bought forty dollars of lemon bars to look supportive.', secs: 4 },
    { id: 'round', type: 'timer', name: 'round', seconds: 210, label: 'DETECTIVE ROUND', fail: 'hard', why: 'The detective came round the side. You had to leave.', checkpoint: true },
    // (PACING 2: the side door is 60 m down E 37th St, not 26 m up Madison: past Calloway's partner on Madison, a
    // plainclothes officer walking the north pavement up to the door and back, and one at the kerb across the street;
    // the cones on the ground, the '?' over each head and the UNSEEN bar say how close it is. 60 to 90 s at a sneak)
    { id: 'sneak', type: 'stealth', units: [
      { '@': 'murrayhill', kind: 'police', roam: 25, radius: 22, side: 1, name: "Calloway's partner" },
      { '@': 'a2-beat', kind: 'police', roam: 34, radius: 22, side: 1, name: 'The officer on E 37th St' },
      { '@': 'a2-kerb', kind: 'police', radius: 22, side: -1, name: 'The officer across the street' }
    ], to: '@a2-side-door', mode: 'walk', detect: 2.5, foot: 1,
      onDetect: { goto: 'caught' }, label: 'UNSEEN', hint: "Stay out of **their sight**. Keep to their backs; cross over when one turns.", why: 'They saw you.', objective: 'Down E 37th St to the **side door**, without being seen.',
      // (PACING: the headmaster rings while he sneaks: he can see the van from his window)
      during: [
        { at: 2, id: 'ashby', type: 'call', interrupts: true, persist: true, ring: 6, who: 'headmaster', role: 'Mr. Ashby · Headmaster', lines: S(`
        HM (5): Mr. Marin, you're on the school grounds. I can see your van from my window. The pizza van.
        JO (3): I'm picking up some of Milo's things.
        HM (5): The detective is in my office. She'd like you to pick up your things with her.
        JO (4): Mr. Ashby. Please. Thirty seconds. I'll explain everything tomorrow.
        HM (4): ...I'm going to look at this spreadsheet for exactly thirty seconds, Mr. Marin.
        HM (3): It's a very long spreadsheet. Go.`),
        voicemail: { text: 'Mr. Marin. Lionel Ashby. I can see your van from my window. The detective would like a word. So would I.' }  }
      ] },
    { type: 'search', at: '@a2-side-door', label: 'take the green walkie-talkie', secs: 2, objective: 'Third cubby from the window: take **the green walkie-talkie**.' },
    { type: 'set', set: { meters: { clues: { add: 1 } }, flags: { walkie: true } } },
    // (the headmaster heard out before Carissa comes back on)
    { type: 'wait', secs: 20, call: true },
    { type: 'call', who: 'carissa', role: 'On the phone', auto: true, lines: S(`
      CA (4): Did you get it? Put it on. Leave it on. Never turn it off.
      JO (3): Range is half a mile.
      CA (5): Then we get within half a mile. Then he beeps twice. Then we get our son.
      JO (4): There's a lockbox on the shelf. The PTA one. You're the treasurer.`),
      choice: { who: 'carissa', prompt: 'The PTA lockbox is on the shelf. Carissa is the treasurer.', timeout: 10, default: 0, flag: 'lockbox', options: [
        { text: "Take it. We'll pay it back.", value: 'took', reply: 'Three thousand two hundred dollars of lemon bar money. I will personally bake it back. Monday.', set: { meters: { ransom: { add: 3200 } } } },
        { text: 'Leave it.', value: 'left', reply: "Respectable. Wrong, but respectable. Also it's empty. I already took it this morning. For the field trip. Long story.", set: { meters: { ransom: { add: 3200 } } } }
      ] } },
    { type: 'timer', name: 'round', stop: true },
    { type: 'call', who: 'carissa', role: 'On the phone', auto: true, lines: S(`
      JO (3): Carissa. What was the PTA money for?
      CA (5): For the field trip! To the museum. To see the big boy. They were going Friday.
      JO (3): Then they're still going Friday.
      CA (2): ...Yeah?
      JO (3): Yeah. And you're chaperoning.
      CA (4): I hate chaperoning. Thirty kids and a whale. I'd do it every day.
      CA (3): John. I love you. I'm still angry.
      JO (2): Thursday.
      CA (3): Thursday. Go. It's beeping, someone's calling you.`) },
    { type: 'walk', to: '@school', enterCar: true, objective: 'Back to **the van**.' },
    { type: 'goto', to: 'done10' },
    { id: 'caught', type: 'cutscene', shots: [
      close('john', 'Evening, officer. Pizza for the PTA?', 3.2),
      caption('@school', "HE DIDN'T BUY IT.", 2.6)
    ] },
    { type: 'end', fail: 'The detective stopped you at the side door.' },
    { id: 'done10', type: 'say', who: 'john', text: 'I have his walkie. I have half a mile.', secs: 2.6 },
    // (PACING: the detective's partner made the van on the way out: a cruiser on a pizza van, and Ma on the other line)
    { id: 'van-chase', type: 'pursuit', goal: 'lose', kind: 'police', count: 1, level: 1, loseDist: 150, loseTime: 4, checkpoint: true,
      alert: "Calloway's partner made the van. Lose him.", objective: 'Lose **the cruiser**.', during: [
        { at: 6, type: 'call', who: 'ma', role: 'Ma', interrupts: true, persist: true, ring: 6, lines: S(`
          MA (4): Johnny. Carissa called me. She told me everything.
          JO (2): Ma, I'm sorry.
          MA (5): Sorry? You're sorry? You let me talk about ricotta for ten minutes.
          MA (4): Who has him. Give me a name. I want a name.
          JO (3): Ma. You can't do anything.
          MA (6): I raised you in a two-bedroom over a laundromat. I can do anything. Give me a name.
          JO (3): Delgado.
          MA (5): Delgado. Fine. I'm lighting a candle. Not the nice kind. The other kind.
          JO (2): There's another kind?
          MA (4): Your grandmother had another kind. Go get my grandson.`), voicemail: { text: "Johnny. Carissa told me everything. Call your mother. Then go get my grandson." } },
      ] },
    { type: 'wait', secs: 30, call: true },
    { type: 'drive', to: '@grandcentral', objective: 'Head for **Grand Central**.', during: [carPhone({ k: 1, lines: S(`
        CA (4): Your mother's lighting a candle. The other kind.
        JO (3): She told me. What's the other kind?
        CA (5): I asked. She said 'the kind your grandmother used on the landlord'. The landlord moved to Ohio.
        JO (3): So it works.
        CA (3): Apparently it works.
        CA (5): John, the walkie. Put it on the dash. Turn it up. I want to hear it when he beeps.
        JO (3): It won't reach until we're close.
        CA (4): I know. I want to hear it not beep. So I'll know the difference.
        JO (2): Okay. It's on.
        CA (4): ...It's so quiet. I hate quiet. Talk to me until it beeps.`),
        wrap: S(`
          JO (5): Grand Central's ahead. The lease office. If Cielo Azul rented a floor, they signed something.
          CA (4): People always sign something. That's how we got caught in Tampa.`) })] }
  ]
};

const act = {
  id: 'act2', name: 'ACT II · CARRYOUT',
  timeline: {
    'PT-6': { clock: '4:45 PM', time: 'midday' }, 'PT-7': { clock: '5:10 PM', time: 'midday' }, 'PT-8': { clock: '5:35 PM', time: 'midday' },
    'PT-9': { clock: '6:00 PM', time: 'golden' }, 'PT-10': { clock: '6:25 PM', time: 'golden' }
  },
  // (the act's end card, as Act I's and Act III's: after PT-10, before PT-11)
  end: {
    title: 'END OF ACT II', heading: 'CARRYOUT',
    stats: [{ label: 'RANSOM', value: '$775,200' }, { label: 'CLUES', value: '9 of 10' }, { label: 'CLOCK', value: '6:46 PM' }],
    story: [
      "Teddy's garage, a loan shark's ledger, a fake drop and a banker who sold them out.",
      'Cielo Azul Holdings leases an office in Harlem. Milo has one dinosaur walkie-talkie. John has the other.',
    ],
    quote: { text: "I'm not mad you went to the bank. I'm mad you went alone.", by: 'carissa' },
    next: { kicker: 'ACT III', text: 'DELIVERY', sub: 'The address. The chain for sale. The money has to be exact.' },
  },
  missions: [PT6, PT7, PT8, PT9, PT10]
};
const out = {
  act,
  // (E 37th St runs east from the Madison corner: heading 90 puts fwd along it (east) and right across it (south))
  places: {
    'a2-van': { '@': 'murrayhill', name: 'Madison Ave, up the block from the school', offset: { right: 0, fwd: 50 } },
    'a2-side-door': { '@': 'murrayhill', name: 'the side door on E 37th St', heading: 90, offset: { right: 4.5, fwd: 58 } },
    'a2-beat': { '@': 'murrayhill', name: 'E 37th St, the north pavement', heading: 90, offset: { right: 12, fwd: 18 } },
    'a2-kerb': { '@': 'murrayhill', name: 'E 37th St, the south kerb', heading: 90, offset: { right: 12, fwd: 36 } },
    // (PT-7: Dash's stop, on 5th Ave just up from W 8th St, the Mews' gate: 5th & W 8th faces east, so right -30 is 30 m up 5th)
    'a2-mews': { '@': 'washmews', name: 'Washington Mews', offset: { right: -30, fwd: -15 } }
  },
  cast: [{ id: 'dash', model: 'mogcity/suit-dash', color: '#2F6FD6' }]
};
// checks of my own: no em dashes, line lengths, step counts
const txt = JSON.stringify(out);
if (/[—–]/.test(txt)) throw new Error('em/en dash');
let lines = 0;
JSON.stringify(out, (k, v) => { if (v && typeof v === 'object' && typeof v.text === 'string' && v.who) { lines++; if (v.text.length > 200) throw new Error('long line ' + v.text); } return v; });
for (const m of act.missions) console.log(m.id, m.steps.length, 'steps');
console.log('spoken lines', lines, 'bytes', txt.length);
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
console.log('wrote', OUT);
