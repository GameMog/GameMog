// ACT III of Pickup Time (PT-11..PT-15) -> act3.json in the repo's .scratch/showcase/pickup-time (git-ignored; PT_OUT
// names another folder)
// node storykit/showcase/pickup-time/gen_act3.mjs   (BIBLE §3 missions 11-15, §3A call sheets (they win), §4 the finale and the epilogue)
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const DIR = process.env.PT_OUT || path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', '.scratch', 'showcase', 'pickup-time');
mkdirSync(DIR, { recursive: true });
const OUT = path.join(DIR, 'act3.json');

const TAG = { JO: 'john', CA: 'carissa', DE: 'delgado', AG: 'agnes', MA: 'ma', BE: 'benny', DC: 'calloway', TE: 'teddy', RO: 'rollo', MK: 'marjorie', CO: 'coach', MI: 'milo' };
// a call sheet's lines, as the BIBLE writes them: "CA (4): text" one a line
const L = (s) => s.trim().split('\n').map((x) => x.trim()).filter(Boolean).map((x) => {
  const m = x.match(/^([A-Z]{2}) \((\d+(?:\.\d+)?)\): (.+)$/); if (!m) throw new Error('bad line: ' + x);
  if (!TAG[m[1]]) throw new Error('tag ' + m[1]);
  return { who: TAG[m[1]], text: m[3], secs: +m[2] };
});
// (Carissa's head mark sits low on her rig: her close-ups look a little higher to frame her eyes)
const LIFT = { carissa: 0.16 };
const close = (who, line, o = {}) => ({ cam: { rel: who, fwd: 1.15, right: 0.22, up: LIFT[who] || 0, ...(o.cam || {}) }, look: { rel: who, up: (LIFT[who] || 0) - 0.04 }, fov: 30, dur: o.dur || 3.8, say: who === 'player' ? 'john' : who, line });
// (John from over the shoulder of whoever he talks to (o.from), else from in front of him)
const hero = (line, o = {}) => ({ cam: o.from ? { rel: o.from, right: 0.34, up: 0.1, fwd: -0.55 } : { rel: 'player', fwd: 1.15, right: -0.25, up: 0.2, ...(o.cam || {}) }, look: { rel: 'player', up: 0.12 }, fov: 32, dur: o.dur || 3.4, say: 'john', line });
const HOLD = { pause: L(`CA (4): It's beeping. Who's beeping? Go, I'll hold. I'm eating your fries.`), resume: L(`CA (4): There you are. Where were we? Oh right. Crisis.`) };
const carPhone = (lines, o = {}) => ({ at: o.at ?? 1, type: 'call', who: 'carissa', auto: true, inCar: true, lines, ...(o.extra ? { extra: o.extra } : {}), ...(o.wrap ? { wrap: o.wrap } : {}), hold: o.hold || HOLD, ...(o.if ? { if: o.if } : {}) });
const VM_DELGADO = { text: "You don't pick up? I have your son's backpack. Pick up.", secs: 4 };
// a set (Mog City's runner draws it in place of the street, as Mog City's opening draws Mr. Big's study): the room and
// who stands where in it (x right, z toward the way in, metres from its middle), so nobody is on a street with the traffic
const room = (name, people, o = {}) => ({ room: name, people, ...o });
const at = (who, x, z, o = {}) => ({ who, at: [x, z], ...o });
const ransom = (add, label) => ({ type: 'set', set: { meters: { ransom: { add } }, ...(label ? { label } : {}) } });

/* ---------------------------------------------------------------- PT-11 -- */
// Carissa on the address (was a standing call at the lease office, c1-carissa; PACING 3: the start of her car phone to the UN)
const C1_CARISSA = L(`
  CA (5): A hundred and twenty-fifth. I'm on Madison, I could be there in twenty minutes.
  JO (3): No. Not alone. He has six guys and a floor.
  CA (4): He has my son and a floor. I have a car and a bad attitude.
  JO (4): Wait for me. Please. I need you on the phone more than I need you in a fight.
  CA (5): ...That's the nicest thing you've ever said and I hate it. Fine. I'll wait. Near.
  JO (3): A hundred and twenty-fifth. The street with the old sign.
  CA (5): The theater sign. Milo told Okafor 'a big old sign that lights up'. He's been describing it to us all day.
  JO (3): He's smart.
  CA (3): He's YOUR smart. I'm the loud.`);
const PT11 = {
  id: 'PT-11', title: 'Cielo Azul', vehicle: 'rides.slice-van', verbs: ['drive', 'walk', 'escape', 'deliver'],
  start: { '@': 'lease-office', face: 'chrysler' }, time: 'golden', traffic: 0.55,
  stakes: "The company's called Cielo Azul. Somebody by Grand Central leased them a floor. Find out which one.",
  passLine: 'You sold the chain. You know the building. Nine forty-five.',
  steps: [
    { type: 'walk', id: 'to-office', to: '@lease-office', leaveCar: true, radius: 8, objective: 'Walk into **the property office** by the terminal.', checkpoint: true },
    { type: 'search', id: 'files', at: '@lease-office', label: 'search the lease files', secs: 3, objective: 'Find **the Cielo Azul lease**.' },
    { type: 'cutscene', id: 'address', shots: [
      { cam: { rel: 'player', right: 0.9, up: 0.25, fwd: -2.4 }, look: { rel: 'player', up: 9, fwd: 18 }, fov: 50, dur: 4, caption: 'CIELO AZUL HOLDINGS · SUITE 900 · W 125TH ST & FREDERICK DOUGLASS BLVD' },
    ] },
    { type: 'set', id: 'clue10', set: { meters: { clues: { add: 1 } }, label: 'THE ADDRESS' } },
    { type: 'call', id: 'c2-marjorie', who: 'marjorie', lines: L(`
      MK (5): John Marin. Heard you're liquidating. One fifty for the whole chain. Recipes, ovens, the whistling van.
      JO (2): It's worth two million.
      MK (5): On a Tuesday. Tonight it's worth what I say. My courier's at the UN plaza. Sign by seven.`),
      choice: { who: 'marjorie', prompt: 'Sell Slice Marin?', timeout: 12, default: 0, flag: 'sale', options: [
        { text: 'Sell it.', value: 'sold', reply: "Pleasure. I'm keeping the egg pizza. It's weird, but it sells." },
        { text: 'Not the egg pizza.', value: 'egg', reply: 'Fine. You keep the egg pizza. One fifty. Sign.', set: { flags: { eggpizza: true } } },
      ] },
      voicemail: { text: "Marin. Crust Brothers. One fifty, the whole chain. My courier's at the UN plaza. Sign by seven.", secs: 5 } },
    { type: 'timer', id: 'sign-clock', name: 'sign', seconds: 140, label: 'SIGN BY 7', fail: 'hard', why: "Marjorie walked. The offer's gone.", checkpoint: true },
    { type: 'drive', id: 'to-un', to: '@un', objective: "Meet **Marjorie's courier** at the UN plaza.", during: [
      // (PACING 3: her 125th St call rides this drive, ahead of 'You're selling it.': not standing at the lease office.
      // Marjorie's offer rings first, so the sign clock and the UN plaza are set before he gets in)
      carPhone([...C1_CARISSA, ...L(`
        CA (2): You're selling it.
        JO (2): It's just pizza.
        CA (6): It's not just pizza. You learned to toss dough off a video. You burned your eyebrows twice.
        JO (2): Three times.
        CA (5): We'll make a new one. We're very good at starting over. We have practice.`)], { extra: [L(`
        JO (4): Remember the first store? Worth Street. The oven didn't work for a month.
        CA (5): We sold cold pizza and called it 'artisanal'. People paid more.
        JO (4): You did the sign by hand. The 'S' was backwards.
        CA (4): It was a design choice! People came in to tell us. Then they bought a slice.
        JO (3): Best marketing we ever had.
        CA (4): Milo learned to walk in that store. Between table four and the register.
        JO (2): Table four.
        CA (3): Table four. Sell it. Sell all of it.`), L(`
        CA (4): John, what if we pay and he doesn't give him back?
        JO (3): Then we take him.
        CA (4): You said that like the old you.
        JO (3): I am the old me. Just for tonight.
        CA (3): ...I missed him a little. Don't tell the new you.`)] }),
    ] },
    // (PACING 3: her call is ~52 s and the drive ~40 s at a player's pace: what is left of it is heard out at the plaza,
    // in the van, before he gets out (ends as soon as the call does))
    { type: 'wait', id: 'un-call', secs: 25, call: true },
    { type: 'walk', id: 'to-courier', to: '@un', leaveCar: true, radius: 8, objective: "Walk over to **the courier**." },
    { type: 'search', id: 'sign', at: '@un', label: 'sign the papers', secs: 2.5, objective: 'Sign **the sale papers**.' },
    ransom(150000, 'SLICE MARIN SOLD'),
    { type: 'timer', id: 'signed', name: 'sign', stop: true },
    { type: 'transition', id: 'deadline', kicker: 'NEW DEADLINE', text: '9:45 PM', secs: 1.8 },
    { type: 'pursuit', id: 'to-bryant', goal: 'reach', to: '@bryant', kind: 'crew', count: 3, level: 2, roles: ['chaser', 'cutter', 'blocker'], checkpoint: true,
      objective: 'Get to **Bryant Park** with them on your tail.', during: [
        carPhone(L(`
          CA (4): Bryant Park, the trees, then cut west. They can't follow a pizza van through a crowd.
          JO (3): Everyone follows a pizza van through a crowd.
          CA (3): Then give them a show. Honk the whistle.
          CA (4): Nine forty-five. He moved it. That's a man who's scared, John.
          JO (3): Or a man who's ready.
          CA (4): Both. He can be both. We're both.`), { extra: [L(`
      CA (4): You did it. You sold it. How do you feel?
      JO (3): Light. Like I left my wallet somewhere.
      CA (4): You did leave your wallet somewhere. It's in my car. Since Tuesday.
      JO (3): I've been looking for that.
      CA (4): I know. I watched you look. It was very relaxing.
      CA (4): Nine twenty-five. Nine twenty-five and we're at nine twenty-five thousand. Is that a sign?
      JO (2): It's a coincidence.
      CA (4): Everything's a sign tonight. Let me have the sign.
      JO (2): It's a sign.
      CA (3): Thank you. Go to Times Square. Benny parked your baby there.`)], wrap: L(`CA (4): Benny's at Times Square with the coupe. Swap back. You're gonna need speed.`) }),
      // (PACING 2: Delgado rings as the crew's cars come out, call waiting over Carissa: not standing by the courier)
      { at: 3, type: 'call', id: 'c5-delgado', interrupts: true, persist: true, ring: 6, who: 'delgado', lines: L(`
      DE (4): Pell called. You know about the ninth floor.
      JO (4): I know the street, the building and the suite.
      DE (6): Then you're early. So the price is early too. Nine forty-five. And now my friends are worried about you.
      DE (5): You sold your pizza. I heard. How does it feel, John, to lose the thing you built?
      JO (3): Like nothing. It's dough.
      DE (5): That's what I said about the boat. Then I lay awake for five years. Nine forty-five.`), voicemail: VM_DELGADO },
        { at: 55, type: 'call', id: 'c4-benny', who: 'benny', interrupts: true, persist: true, ring: 6, lines: L(`
      BE (4): Boss. Marjorie's people are here. They're putting up a new sign.
      BE (5): The guys wanted to say... thanks. For the job. And the egg pizza. Mostly the egg pizza.
      JO (3): Thanks, Benny. Keep the van.
      BE (2): Really?
      JO (4): Marjorie doesn't know about the van. Keep the van. Deliver something.
      BE (4): Boss. Whatever this is, go win it.`), voicemail: { text: "Boss, it's Benny. Marjorie's people are putting up a new sign. The guys say thanks. Go win it.", secs: 5 } },
      ] },
    // (the calls that rode the chase, heard out at the park)
    { type: 'wait', id: 'wrap-up', secs: 30, call: true },
    { type: 'wait', secs: 30, call: true },
  ],
};

/* ---------------------------------------------------------------- PT-12 -- */
const PT12 = {
  id: 'PT-12', title: 'Yard Race', vehicle: 'rides.gt', verbs: ['drive', 'walk', 'escape', 'boost'],
  start: { '@': 'timessq', mode: 'walk' }, time: 'golden', traffic: 0.6,
  stakes: "There's a race at the container yards. Coach says the pot's a hundred and twenty. Entry's sixty. You're the best driver I ever married.",
  passLine: 'New yard record. Fifteen grand to go.',
  steps: [
    { type: 'call', id: 'c6-carissa', who: 'carissa', auto: true, role: 'On call', lines: L(`
      CA (4): Benny left the coupe by the big screens. He said it got three compliments and a ticket.
      CA (5): John. Coach. The race guy. I found him because he still owes me from the old days.
      JO (2): Owes you what?
      CA (5): I won his car once. Then I gave it back because it smelled like feet. He's never forgotten.
      CA (3): Win his pot. Then I'll tell you the one with the llama.`) },
    { type: 'call', id: 'c1-coach', who: 'coach', lines: L(`
      CO (5): Marin? Sixty to enter. Three checkpoints, Tenth Avenue, finish at the yard. Beat a minute fifty-five.
      JO (2): And if I lose?
      CO (4): Then I'm sixty richer and you're walking to Harlem.`) },
    ransom(-60000, 'ENTRY'),
    { type: 'transition', id: 'record', kicker: 'THE YARD RECORD', text: '1:55', secs: 1.6 },
    { type: 'timer', id: 'yard-clock', name: 'yard', seconds: 115, label: 'YARD RECORD', fail: 'hard', why: "Coach's record held. You lost the entry.", checkpoint: true },
    { type: 'stops', id: 'race', stops: [{ '@': 'tenth47', name: '10th Ave & W 47th St' }, { '@': 'tenth55', name: '10th Ave & W 55th St' }, { '@': 'race-yard', name: 'the container yard' }],
      objective: 'Checkpoint {n} of {of}: **{name}**', during: [
        carPhone(L(`
          CA (6): GO GO GO. Don't talk. I'll talk. Left lane. LEFT lane. That's a bus, go around the bus.
          CA (5): This is how you drove the day I met you. Fifty yards, three cop cars, one flower stand.
          CA (5): You paid for the flowers! You came back and paid for the flowers. That's when I knew.`), { at: 0.5, extra: [L(`
          CA (3): You paid for the flowers. That's when I knew.
          JO (3): Knew what?
          CA (5): That you were a criminal who felt bad. That's my whole type. You're my whole type.`), L(`
          CA (4): Remember the night he was born? You drove to the hospital at the speed limit.
          JO (4): I was carrying the most important thing in the world.
          CA (5): You were carrying a bag. I was carrying the most important thing in the world. In me.
          JO (2): Fair.
          CA (5): Drive like that's not true. Drive like it's the old days. Go go go.`)] }),
      ] },
    { type: 'timer', id: 'yard-done', name: 'yard', stop: true },
    { type: 'call', id: 'coach-pays', who: 'coach', auto: true, role: 'On call', lines: L(`
      CO (6): One forty-nine. New record. One twenty in your trunk, champ. Now leave, the cops follow me everywhere.`) },
    ransom(120000, 'THE POT'),
    { type: 'pursuit', id: 'cops', goal: 'lose', kind: 'police', count: 3, level: 3, loseDist: 200, loseTime: 6, checkpoint: true, objective: 'Lose **the police**.', during: [
      carPhone(L(`
        CA (4): Ninety-eight five. We're ninety-eight five, John. That's almost a whole million.
        JO (3): Almost isn't the number.
        CA (5): Almost is a great number. Almost is how we got married. Almost didn't, remember?
        JO (3): You said I was 'fine'.
        CA (4): You WERE fine. Now lose the cops.`), { wrap: L(`
        JO (4): Agnes called. The side door sticks. On the street behind the building. Bakery downstairs.
        CA (4): A bakery. He's sleeping over a bakery. He'll be so happy. He'll smell like bread.`) }),
      { at: 5, type: 'call', id: 'c4-calloway', who: 'calloway', interrupts: true, lines: L(`
        DC (5): Mr. Marin. You just set a record in a container yard. I have the radio chatter.
        JO (3): Are those your cars behind me?
        DC (5): They're traffic. I'm not chasing you. I'm three cars back eating a pretzel.
        DC (6): Your wife's calendar, a loan shark, a bank locker, a container yard. You're raising money.
        DC (4): Kidnappers don't take checks. How much?
        JO (2): A million.
        DC (4): ...Call me before you hand it over. That's not a request.`),
        voicemail: { text: 'Mr. Marin, Detective Calloway. Call me before you hand anything over. That is not a request.', secs: 5 } },
      // (PACING: Agnes's tip comes in on the other line mid-chase, not at the yard gate)
      { at: 40, type: 'call', id: 'c3-agnes', who: 'agnes', interrupts: true, persist: true, ring: 6, lines: L(`
      AG (4): Mr. Marin. Agnes Teodoro. I remembered something. I wrote it down.
      AG (6): The man Rollo smelled of bread. Fresh bread. He said 'the bakery downstairs never stops'.
      AG (4): And he complained the side door sticks. On the street behind. He had to kick it.
      JO (3): The street behind. Thank you, Agnes.
      AG (5): My son hasn't come home. If you see him... no. Never mind. I'm sorry. Good luck.`),
      voicemail: { text: "Mr. Marin, it's Agnes. The side door sticks, on the street behind. There's a bakery downstairs. Good luck.", secs: 6 } },
    ] },
    { type: 'wait', id: 'wrap-up', secs: 30, call: true },
    { type: 'wait', secs: 30, call: true },
    // (PACING 2: her closer rides the drive to Bryant Park, where the toll run starts: not parked after the chase)
    { type: 'drive', id: 'to-bryant', to: '@bryant', objective: 'Head for **Bryant Park**.', during: [
      carPhone(L(`
      CA (3): The detective's eating a pretzel behind you?
      JO (3): Three cars back. She wants a call before the handover.
      CA (4): Are you going to call her?
      JO (3): I don't know yet.
      CA (5): If you call her, Delgado might know. If you don't, we're alone with six guys.
      JO (3): We were always alone with six guys.
      JO (3): I'll call her. When I can see the building.
      CA (3): Okay. That's a plan. That's a real plan. I'm proud of you.
      JO (2): Thanks.
      CA (3): Don't get used to it.`)),
    ] },
  ],
};

/* ---------------------------------------------------------------- PT-13 -- */
// (the BIBLE starts it at the toll itself; it starts 16 blocks south at Bryant Park, so Carissa's dread call has a drive
// to fill and the roadblock is something he drives up to)
const PT13 = {
  id: 'PT-13', title: 'The Toll', vehicle: 'rides.gt', verbs: ['drive', 'walk', 'fight', 'escape', 'boost'],
  start: { '@': 'bryant', face: 'centralpark' }, time: 'golden', traffic: 0.55,
  stakes: 'Drive past the park, slowly. My people want to see the money exists.',
  passLine: 'You got past the park. Teddy wants out.',
  steps: [
    { type: 'roadblock', id: 'rollo-block', at: '@toll', r: 8, cars: 2, kind: 'crew', crew: 2, text: "ROLLO'S ROADBLOCK" },
    { type: 'drive', id: 'to-toll', to: '@toll', radius: 26, stop: true, objective: "Pull up to **Rollo's cars** on Central Park South.", checkpoint: true, during: [
      carPhone(L(`
        CA (4): Fifteen grand short. I can hear you doing math.
        JO (2): I'm not doing math.
        CA (4): Your breathing does a long division sound. I married it.
        CA (5): John. I keep seeing him in the doorway. Every door. Every shop door I drive past.
        JO (3): We're forty blocks away.
        CA (5): Forty blocks is nothing. Forty blocks is a bus ride. He's a bus ride from me.
        JO (4): We'll be there by nine thirty. Maybe sooner.
        CA (4): What if he moves him? What if 'the ninth floor' was a lie too?
        JO (4): Then the walkie tells us. Half a mile. We'll know.
        CA (4): Okay. Okay. Say a joke. I need a joke.
        JO (4): What's a pirate's favorite pizza?
        CA (2): Don't you dare.
        JO (2): Pepper-arrr-oni.
        CA (4): That's the worst one you've ever... that's Milo's. That's Milo's joke.
        JO (2): Yeah.
        CA (3): ...I'm crying in a crosswalk now. Thanks.`)),
    ] },
    { type: 'call', id: 'c2-delgado', who: 'delgado', lines: L(`
      DE (5): John. Rollo is in front of you. Think of him as a toll booth with feelings.
      DE (5): Your boy woke up. He asked for his mother. I told him she's coming. Was I lying?
      JO (3): She's coming.
      DE (4): Good. I'd like to meet her again. She broke my nose once. With a fire extinguisher.
      JO (3): You remember that.
      DE (3): I remember everything, John. That's my problem.`), voicemail: VM_DELGADO },
    { type: 'walk', id: 'get-out', to: '@toll', leaveCar: true, radius: 14, objective: 'Get out and talk to **Rollo**.' },
    { type: 'npc', id: 'rollo-kerb', who: 'rollo', at: { rel: 'player', right: 2.4, fwd: 1.5 } },
    { type: 'npc', id: 'tank-kerb', who: 'tank', at: { rel: 'player', right: 4, fwd: 3 } },
    { type: 'cutscene', id: 'toll-talk', shots: [
      close('rollo', 'Planner. Boss says this road has a toll. Fifty grand.'),
      hero("That's not a thing.", { dur: 2.6, from: 'rollo' }),
      close('rollo', "Kid's nine floors up watching cartoons. Everything is a thing tonight.", { dur: 4.2 }),
    ] },
    { type: 'choice', id: 'toll', who: 'rollo', prompt: 'Rollo wants fifty thousand.', timeout: 8, default: 0, flag: 'toll', options: [
      { text: 'Pay the toll.', value: 'paid', reply: 'Pleasure doing business. Drive safe. Nine forty-five.', set: { meters: { ransom: { add: -50000 } }, label: 'THE TOLL' } },
      { text: 'Go through him.', value: 'fought', reply: "Oh, I hoped you'd say that.", set: { flags: { fought: true } } },
    ] },
    { type: 'npc', id: 'rollo-off', remove: 'rollo-kerb' },
    { type: 'npc', id: 'tank-off', remove: 'tank-kerb' },
    { type: 'fight', id: 'brawl', if: 'fought', enemies: ['rollo', 'tank', 'hooks'], arena: '@toll', win: 'survive', timer: 45, objective: 'Stay **on your feet**.', checkpoint: true },
    { type: 'timer', id: 'park-clock', name: 'park', seconds: 105, label: 'PAST THE PARK', fail: 'hard', why: "Delgado's people closed the street behind you.", checkpoint: true },
    { type: 'pursuit', id: 'crew-chase', if: 'fought', goal: 'lose', kind: 'crew', count: 3, level: 4, loseDist: 200, loseTime: 6, objective: "Lose **Rollo's cars**." },
    { type: 'drive', id: 'to-tenth', to: '@tenth55', objective: 'Get clear, west to **10th Ave**.', stopTimer: 'park', during: [
      carPhone(L(`CA (4): You paid a TOLL? To a man named Rollo? I'm going to have that on a mug.`).concat(L(`
        CA (4): Your mother called me after she called you. She said she knew about Florida.
        JO (3): She says it was the oranges.
        CA (4): I TOLD you a hundred oranges was too many oranges.
        CA (5): John. Teddy wants to meet you. Lincoln Center. He sounds scared. Like Milo scared.
        CA (4): And after Teddy... I'm coming up. I'm done circling. I'm coming.
        JO (3): Wait for my call.
        CA (3): I'll wait for your call. Nearby. Very nearby.`)), { at: 1, if: '!fought' }),
      carPhone(L(`CA (5): You fought Rollo? In front of the park? With the horse carriages watching?`).concat(L(`
        CA (4): Your mother called me after she called you. She said she knew about Florida.
        JO (3): She says it was the oranges.
        CA (4): I TOLD you a hundred oranges was too many oranges.
        CA (5): John. Teddy wants to meet you. Lincoln Center. He sounds scared. Like Milo scared.
        CA (4): And after Teddy... I'm coming up. I'm done circling. I'm coming.
        JO (3): Wait for my call.
        CA (3): I'll wait for your call. Nearby. Very nearby.`)), { at: 1, if: 'fought' }),
      { at: 16, type: 'call', id: 'c3-ma', who: 'ma', interrupts: true, lines: L(`
        MA (4): Johnny. I lit the candle. Then I called Father Dominic.
        JO (2): Ma...
        MA (5): Then I called your cousin Frankie, who knows people. Then I uncalled Frankie. Frankie's an idiot.
        MA (5): Listen to me. You were always the boy who came home late. Come home late tonight. With him.
        JO (2): I will.
        MA (4): And Johnny? Whatever you did before. Florida. I knew. A mother knows.
        JO (2): You knew?
        MA (5): You sent me a hundred oranges. Who sends a hundred oranges? Go. The lasagna's in.`),
        voicemail: { text: "Johnny, it's your mother. I lit the candle. Come home late tonight. With him. The lasagna's in.", secs: 6 } },
    ] },
    { type: 'wait', id: 'wrap-up', secs: 16, call: true },
    { type: 'call', id: 'c5-carissa', who: 'carissa', auto: true, inCar: true, hold: HOLD, lines: L(`
      CA (4): Teddy sounded so young. Like a boy calling his mom from camp.
      JO (3): He's twenty-four.
      CA (4): Twenty-four is a boy calling his mom from camp. You were twenty-four on the boat.
      JO (3): I was very mature on the boat.
      CA (4): You cried when the parrot bit you.
      JO (3): It bit me on the face, Carissa.
      CA (4): It was a small bite. It was a love bite. The parrot loved you.
      JO (3): Everyone loves me tonight. Pirates. Parrots. Rollo.
      CA (5): I love you. The rest are opinions. Go meet Teddy. Bring him a sandwich, he sounded hungry.
      JO (3): I don't have a sandwich.
      CA (4): Then be nice. Nice is a sandwich. Go.`) },
  ],
};

/* ---------------------------------------------------------------- PT-14 -- */
const PT14 = {
  id: 'PT-14', title: 'The Whale', vehicle: 'rides.gt', verbs: ['drive', 'walk', 'fight', 'escape', 'boost'],
  start: { '@': 'plaza', mode: 'walk' }, time: 'golden', traffic: 0.55,
  stakes: "Lincoln Center. The fountain. Come alone. I mean it, alone, not 'alone with your wife on speaker'.",
  passLine: 'The key to the side door. Twenty-five short. And your wife is here.',
  steps: [
    { type: 'call', id: 'c1-teddy', who: 'teddy', lines: L(`
      TE (4): Mr. Marin? It's Teddy. Teodoro. My ma said you were polite to her.
      TE (5): I'm at the fountain. Come alone. I mean alone, not 'alone with your wife on speaker'.
      JO (2): She'll hear anyway.
      TE (3): Yeah. My ma's like that too.`) },
    { type: 'walk', id: 'to-fountain', to: '@plaza', radius: 6, objective: 'Meet **Teddy** at the fountain.', checkpoint: true },
    // (the plaza, by the fountain, in the low sun)
    { type: 'cutscene', id: 'teddy-flips', set: room('plaza', [at('teddy', 0.9, -0.6, { face: 'john', look: 'john' }), at('john', -0.4, 0.5, { face: 'teddy', look: 'teddy' })]), shots: [
      close('teddy', 'Ma called me. She said a man came to her door and was polite to her. She cried for an hour.', { dur: 5 }),
      hero("Your mother's a good person.", { dur: 2.6, from: 'teddy' }),
      close('teddy', "Yeah. Side door, a Hundred Twenty-Sixth. This card opens it. Ninth floor's a stairwell away.", { dur: 4.6 }),
      close('teddy', 'And this. Forty. My cut. Ma said give it back or don\'t come home.', { dur: 4 }),
      hero('Go home, Teddy.', { dur: 2.4, from: 'teddy' }),
    ] },
    { type: 'set', id: 'teddys-cut', set: { meters: { ransom: { add: 40000 } }, flags: { keycard: true }, label: "TEDDY'S CUT" } },
    { type: 'call', id: 'c5-carissa', who: 'carissa', auto: true, role: 'On call', lines: L(`
      CA (3): Well? Was he scared?
      JO (4): Terrified. He gave me a key card and forty grand and he called me sir.
      CA (4): Sir. Nobody's called you sir since the judge.
      JO (3): The judge didn't mean it.
      CA (3): The judge definitely didn't mean it.
      JO (4): Side door on a Hundred Twenty-Sixth. Ninth floor's one stairwell up.
      CA (4): The door that sticks. Agnes said it sticks. He kicks it.
      JO (3): Then I'll kick it.
      CA (4): You'll swipe it, John. You have a card. Use the card. Be a dad about it.`) },
    { type: 'timer', id: 'museum-clock', name: 'museum', seconds: 160, label: 'TO THE MUSEUM', fail: 'hard', why: "Rollo's cars boxed you in.", checkpoint: true },
    { type: 'pursuit', id: 'to-museum', goal: 'reach', to: '@amnh', kind: 'crew', count: 3, level: 3, roles: ['chaser', 'cutter', 'chaser'],
      objective: "Get to **the museum** with Rollo's cars behind you.", during: [
        carPhone(L(`
          CA (4): The museum. He loves the museum. The whale. He calls it 'the big boy'.
          JO (4): I know, I've stood under the big boy for nine hours of my life.
          CA (3): He'd be standing under it right now if...
          CA (3): No. No crying in a car chase. Drive.`), { extra: [L(`
          CA (4): I'm parking. Park and Ninety-Seventh. I'm out of the car. My legs are shaking.
          JO (3): You said you'd wait.
          CA (5): I'm waiting! At a different place! Closer! That's still waiting, it's waiting with ambition!
          JO (3): Carissa...
          CA (5): I'm not sitting this one out, John. You can be mad Thursday. We'll do both fights Thursday.`), L(`
          CA (4): I've got something for you. When you get here. Don't ask.
          JO (2): What is it?
          CA (4): I said don't ask. You never listen. It's a surprise. It's cereal.
          JO (2): Cereal?
          CA (3): Drive, John.`)], wrap: L(`
          CA (4): Rollo's behind you, I can hear his horn, he honks like a goose.
          CA (4): Hit him once for Agnes. Once for Teddy. Then one for me.`), hold: { pause: L(`CA (3): It's beeping. That's him. It's always him at the worst time.`), resume: HOLD.resume } }),
      // (PACING 2: Delgado rings with Rollo's cars on him, call waiting over Carissa: not at the fountain)
      { at: 6, type: 'call', id: 'c2-delgado', interrupts: true, persist: true, ring: 6, who: 'delgado', lines: L(`
      DE (3): Teddy's phone is off. Teddy's phone is never off.
      JO (3): Maybe Teddy went home.
      DE (3): Nobody goes home tonight, John.
      DE (5): I've been honest with you all day. You know why? Because when it ends, I want you to remember I was fair.
      JO (3): Fair? You took a six-year-old.
      DE (5): You took a fifty-year-old's whole life. We disagree on the math.`), voicemail: VM_DELGADO },
      ] },
    { type: 'timer', id: 'museum-made', name: 'museum', stop: true },
    { type: 'walk', id: 'steps', to: '@amnh', leaveCar: true, radius: 10, objective: 'Out on **the museum steps**.' },
    { type: 'fight', id: 'museum-fight', enemies: ['rollo', 'mack', 'hooks'], arena: '@amnh', win: 'ko-all', timer: 150, hp: 120, objective: "Put **Rollo's crew** down.", why: "Rollo's crew put you down.", checkpoint: true },
    { type: 'cutscene', id: 'three', shots: [
      hero("That's three. Nine forty-five.", { dur: 3 }),
      { cam: { rel: 'player', right: -1.6, up: 0.6, fwd: 3.2 }, look: { rel: 'player', up: -0.2 }, fov: 40, dur: 2.8, sub: 'Incoming · CARISSA' },
    ] },
    { type: 'voicenote', id: 'c4-agnes', who: 'agnes', text: 'Mr. Marin. Teddy came home. He\'s eating soup. He told me what he did for you. Thank you for telling him. Bring your boy home too.', secs: 8 },
    { type: 'drive', id: 'to-carissa', to: '@ues', objective: 'Get to **Carissa** at Park Ave & E 97th St.', checkpoint: true, during: [
      carPhone(L(`
        CA (4): You're coming. I can see the avenue. I'm standing next to a hydrant like a dog.
        JO (3): I'm six minutes out.
        CA (4): Six minutes. I can do six minutes. I've done six years.
        JO (2): Five years.
        CA (5): Six with the pregnancy. Pregnancy counts. Pregnancy counts double.
        JO (3): Is that how it works?
        CA (4): That's exactly how it works. I'm in charge of the math now. I have a crayon.
        CA (5): John. I've been on the phone with you for six hours. It's the longest we've talked since the boat.
        JO (3): I know.
        CA (4): I don't want to hang up. Even after. Even at home.
        JO (3): Then don't. Stay on through dinner.
        CA (4): I'll put you on speaker in the kitchen. Like a weird radio.
        JO (2): Deal.`), { wrap: L(`CA (4): I see your car. I see you. Hang up. No, don't hang up. Okay, hang up.`) }),
      // (PACING: Rollo's last two cars, out of the museum's side street: shake them before you lead them to Carissa)
      { at: 22, type: 'pursuit', goal: 'lose', kind: 'crew', count: 2, level: 2, loseDist: 190, loseTime: 5, alert: "Rollo's last cars. Don't lead them to Carissa." },
      // (and up the West Side the police pick up the plate: the long run north is never a cruise)
      { at: 150, type: 'pursuit', goal: 'lose', kind: 'police', count: 2, level: 2, loseDist: 190, loseTime: 5, alert: 'Patrol cars have your plate. Lose them before Park Avenue.' },
    ] },
  ],
};

/* ---------------------------------------------------------------- PT-15 -- */
const PT15 = {
  id: 'PT-15', title: 'Pickup', vehicle: 'rides.gt', verbs: ['drive', 'walk', 'follow', 'sneak', 'fight', 'boost'],
  start: { '@': 'ues', mode: 'walk' }, time: 'golden', traffic: 0.4,
  stakes: 'Park and Ninety-Seventh. Bring the car. Bring everything.',
  passLine: 'Milo is in the back seat. Every dollar went somewhere. Nobody cares.',
  steps: [
    { type: 'transition', id: 'ues-card', kicker: 'UPPER EAST SIDE', text: 'Park Ave & E 97th St · 8:35 PM', secs: 2.6 },
    // Carissa arrives: her own cream SUV pulls up beside him and she gets out (the ally her convoy follows later)
    { type: 'ally', id: 'she-arrives', who: 'carissa', ally: 'carissa', name: "Carissa's SUV", car: 'rides.carissa-suv', from: '@a3-park-96', to: '@a3-park-97', speed: 9, out: true,
      objective: "Wait for **Carissa**. That's her SUV.", checkpoint: true },
    { type: 'npc', id: 'carissa-kerb', who: 'carissa', at: { rel: 'player', right: 1.5, fwd: 1.3 } },
    { type: 'cutscene', id: 'arrival', shots: [
      close('carissa', "Hi. Hi. Don't hug me, I'll fall apart. Okay, hug me. Okay, stop.", { dur: 4.4 }),
      hero("We're twenty-four thousand eight hundred short.", { dur: 3, from: 'carissa' }),
      close('carissa', "No we're not.", { dur: 2.2, cam: { fwd: 1.6, right: 0.4, up: -0.2 } }),
      hero("Is that... Miami money? You said we put it all in the pizza.", { dur: 3.8, from: 'carissa' }),
      close('carissa', "I said we put 'basically' all of it in the pizza. I kept a cereal box. For emergencies. And shoes.", { dur: 5.2 }),
      hero("How much is in there?", { dur: 2.2, from: 'carissa' }),
      close('carissa', 'Exactly what we need. I counted it in the car. At red lights. Mostly at green lights.', { dur: 4.6 }),
    ] },
    { type: 'set', id: 'cereal-box', set: { meters: { ransom: { to: 1000000 } }, label: 'THE CEREAL BOX' } },
    { type: 'say', id: 'million', who: 'john', text: 'One million dollars.', secs: 2 },
    { type: 'say', id: 'pickup-time', who: 'carissa', text: 'Pickup time.', secs: 1.6 },
    { type: 'npc', id: 'carissa-in', remove: 'carissa' },
    { type: 'transition', id: 'nightfall', kicker: 'NIGHTFALL', text: 'W 125th St · Harlem · 9:40 PM', time: 'midnight', secs: 3 },
    // two beeps at 200 m: Milo's walkie answering (the clue)
    { type: 'trigger', id: 'walkie-200', area: { '@': 'harlem', r: 200 }, cue: 'walkie2', say: { who: 'carissa', text: "Two beeps. Two beeps! He's okay. He's okay." }, set: { flags: { twobeeps: true } }, do: [
      { at: 3.4, type: 'say', who: 'john', text: 'Two beeps.', secs: 1.6, wait: false },
      { at: 5.4, type: 'say', who: 'carissa', text: "He's telling us. He's been telling us all day.", secs: 3, wait: false },
    ] },
    { type: 'timer', id: 'run-clock', name: 'nine45', seconds: 285, label: 'NINE FORTY-FIVE', fail: 'hard', why: "Nine forty-five. Delgado didn't wait.", checkpoint: true },
    { type: 'convoy', id: 'follow-carissa', ally: 'carissa', who: 'carissa', route: ['@ues', '@harlem'], speed: 19, gap: 14, band: [6, 45], fail: 'soft', label: 'STAY WITH CARISSA',
      why: 'Keep up, planner.', objective: 'Follow **Carissa** the back way to **125th St**.', during: [
        carPhone(L(`
          CA (5): Park under the tracks, then Lenox. Stay on my bumper. I drive like a mom now, it's terrifying.
          JO (3): You drive like you did in the old days.
          CA (4): I drive like a mom in the old days. That's the scariest kind.
          CA (2): If this goes wrong...
          JO (3): It doesn't go wrong. You planned it.
          CA (2): You were the planner.
          JO (3): I was the planner. You were the plan.`), { at: 2, extra: [L(`
          CA (4): The tracks are above us. It's loud. Can you hear me?
          JO (3): I can always hear you. That's my problem.
          CA (4): Funny. Funny man. Funny man in a black car behind his wife.
          CA (4): John. When we get there, you go first. I'll be right behind. Always right behind.
          JO (3): Like the night we met.
          CA (5): The night we met, you were behind ME. I was driving. You were in the trunk.
          JO (3): It was a very nice trunk.
          CA (2): It really was.`), L(`
          CA (4): Your mother's at our place. She has a key. She's never given back a key.
          JO (3): She's making lasagna in our kitchen?
          CA (4): She's making lasagna in our kitchen with no ricotta and three candles.
          JO (3): What kind of candles?
          CA (4): All the kinds, John. Every kind of candle.
          CA (4): The headmaster called me. He said if we need anything, he's 'available'.
          JO (3): Ashby? Ashby said that?
          CA (5): He said it like a man who's never been available. He's coming round. Everybody's coming round.
          CA (4): I can see the sign. The old one. It's lit. It's so pretty, John.
          JO (3): He said it lights up.
          CA (3): He said it lights up. He was right.`), L(`
          CA (3): What if he's not there?
          JO (2): He's there.
          CA (3): What if he's scared?
          JO (4): Then we'll be there, and he won't be scared anymore.
          CA (3): What if I'm scared?
          JO (3): You're always scared. You go anyway.
          CA (4): ...That's the nicest worst thing you've ever said.`)] }),
        // the walkie-talkie closing in (Milo's, in John's pocket): static, then one beep (and John calls Calloway), then
        // the two beeps at 200 m (the trigger before the timer)
        { at: 110, type: 'trigger', id: 'walkie-static', cue: 'walkie', say: { who: 'john', text: '[static]... nothing.' } },
        { at: 185, type: 'trigger', id: 'walkie-one', cue: 'walkie', say: { who: 'carissa', text: "Half a mile. He's in range. Come on, baby." } },
        { at: 191, type: 'call', id: 'c2-calloway', who: 'calloway', interrupts: true, role: 'Outgoing call', lines: L(`
          JO (3): Detective. It's John Marin.
          DC (3): Before ten. Good boy.
          JO (5): A hundred twenty-fifth and Frederick Douglass. The office building over the bakery. Ninth floor.
          DC (3): How many?
          JO (3): Six. And a boss. And my son.
          DC (4): I'm eleven minutes out. Don't do anything before eleven minutes.
          JO (3): I can't promise that.
          DC (4): I know. Nobody in your family promises anything. Eleven minutes.`) },
      ] },
    { type: 'timer', id: 'run-made', name: 'nine45', stop: true },
    { type: 'call', id: 'c3-delgado', who: 'delgado', lines: L(`
      DE (3): I see your car. And hers. Together. That's nice.
      DE (4): Come to the front. Bring the bag. Leave the walkie-talkie in the car.
      JO (3): How do you know about the walkie?
      DE (5): Because he's been beeping it for an hour. Two beeps. Over and over. It's driving Rollo mad.
      DE (3): Come up the front, John. Pickup time.`), voicemail: { text: 'Come up the front, John. Bring the bag. Pickup time.', secs: 4 } },
    { type: 'walk', id: 'to-front', to: '@hideout', leaveCar: true, radius: 8, objective: 'Walk up to **the office building**. Slowly.', checkpoint: true },
    { type: 'npc', id: 'del-front', who: 'delgado', at: { rel: 'player', right: 0.6, fwd: 3.4 } },
    { type: 'npc', id: 'rollo-front', who: 'rollo', at: { rel: 'player', right: -1.4, fwd: 4.4 } },
    { type: 'npc', id: 'tank-front', who: 'tank', at: { rel: 'player', right: 2.6, fwd: 4.2 } },
    { type: 'npc', id: 'mack-front', who: 'mack', at: { rel: 'player', right: -2.8, fwd: 3.2 } },
    { type: 'npc', id: 'hooks-front', who: 'hooks', at: { rel: 'player', right: 3.8, fwd: 2.8 } },
    { type: 'npc', id: 'carissa-back', who: 'carissa', at: { rel: 'player', right: -1.3, fwd: -0.8 } },
    { type: 'cutscene', id: 'exchange', shots: [
      { cam: { rel: 'player', right: 2.2, up: 1.2, fwd: -4.2 }, look: { rel: 'delgado' }, fov: 42, dur: 5.2, say: 'delgado', line: 'John. And Carissa. You look exactly the same. I look like what you did to me.' },
      hero("One million dollars. Where's my son.", { dur: 3.2, from: 'delgado' }),
      close('delgado', 'Upstairs. Safe. Bored.', { dur: 2.6 }),
      close('delgado', "You know what I learned, losing everything? Money doesn't make it even. Knowing does.", { dur: 5.2 }),
      close('delgado', 'So tonight you get to know. Rollo, take the bag. Keep the boy.', { dur: 4 }),
      close('carissa', 'Oh, absolutely not.', { dur: 2.4 }),
    ] },
    ...['rollo-front', 'tank-front', 'mack-front', 'hooks-front', 'carissa-back'].map((id) => ({ type: 'npc', remove: id })),
    { type: 'fight', id: 'crew-fight', enemies: ['rollo', 'tank', 'mack', 'hooks', 'hooks'], arena: '@hideout', win: 'ko-all', timer: 120, rules: 'full', hp: 130,
      objective: "Put **Delgado's crew** down.", why: 'They took the bag and the boy.', checkpoint: true },
    { type: 'npc', id: 'carissa-near', who: 'carissa', at: { rel: 'player', right: -2.2, fwd: -1.6 } },
    { type: 'call', id: 'c4-carissa', who: 'carissa', auto: true, role: 'Right behind you', lines: L(`
      CA (3): Are you hurt? You're bleeding. That's your eyebrow. You only have the one good one.
      JO (2): Stay back. He's next.
      CA (3): I'm right behind. Like I said. Like always.
      JO (2): I know.`) },
    { type: 'npc', id: 'del-jacket', who: 'delgado', at: { rel: 'player', right: 0.4, fwd: 3 } },
    { type: 'cutscene', id: 'jacket', shots: [
      close('delgado', 'I used to do this myself. Before I had people.', { dur: 3.6 }),
      hero('Me too. Before I had pizza.', { dur: 2.8, from: 'delgado' }),
    ] },
    { type: 'npc', remove: 'del-jacket' },
    { type: 'npc', remove: 'carissa-near' },
    { type: 'fight', id: 'delgado-fight', enemies: ['delgado'], arena: '@hideout', win: 'ko-all', timer: 90, hp: 120, objective: 'Put **Pedro Delgado** down.', why: 'Delgado put you down.', checkpoint: true },
    { type: 'stealth', id: 'lookout', units: [{ '@': 'harlem', kind: 'scout', roam: 30, radius: 18, side: 1, name: 'The lookout on 125th' }], to: '@side-door', detect: 2, foot: 1,
      onDetect: { pursuit: { count: 2, level: 3 } }, objective: "Get round to **the side door on W 126th St** without the lookout seeing you.",
      hint: 'Keep out of the **cones**. **E** from behind takes him down.' },
    { type: 'search', id: 'key-card', at: '@side-door', label: 'swipe the key card', secs: 2, objective: "Use Teddy's card on **the side door**." },
    { type: 'trigger', id: 'two-beeps', cue: 'walkie2' },
    // the rescue and the reunion, in the side street by the open steel door (a set: the stairwell's warm light spilling
    // out onto the pavement). A small figure in the doorway with his dinosaur walkie; his one line at his own height;
    // John down on one knee; Milo walks into him; Carissa down beside them, her arms round both; held, close, quiet
    { type: 'cutscene', id: 'rescue', set: room('alley', [
      at('milo', 0.6, -3.55, { face: 0, prop: 'walkie', hand: { side: 'R', at: [0.08, 0.62, 0.16] }, look: 'john' }),
      at('john', 0.75, -0.9, { face: 'milo', look: 'milo' }),
      at('carissa', -0.15, -0.6, { face: 'milo', look: 'milo' })], { light: 'night' }), shots: [
      { cam: { rel: 'john', right: 2.6, up: -0.6, fwd: -3.6 }, to: { rel: 'john', right: 2.1, up: -0.65, fwd: -3.0 }, look: { rel: 'milo', up: -0.25 }, fov: 40, dur: 3.8, caption: 'The side door · W 126th St' },
      { cam: { rel: 'milo', fwd: 1.1, up: 0.02, right: 0.25 }, to: { rel: 'milo', fwd: 0.85, up: 0.0, right: 0.2 }, look: { rel: 'milo', up: -0.06 }, fov: 34, dur: 3.8, say: 'milo', line: 'Is it pickup time?' },
      { ...close('carissa', "It's pickup time, baby.", { dur: 3.2 }), act: [{ who: 'carissa', at: [0.0, -1.2], face: 'milo', look: 'milo' }] },
      { cam: { rel: 'milo', right: -0.3, up: 0.0, fwd: -0.55 }, look: { rel: 'john', up: 0.0 }, fov: 34, dur: 3.2, say: 'john', line: 'Two beeps. I heard you.',
        act: [{ who: 'john', at: [0.68, -1.75], face: 'milo', pose: 'kneel', look: 'milo' }] },
      // (he walks into his father's arms)
      { cam: { rel: 'john', right: 2.0, up: -0.25, fwd: 0.6 }, to: { rel: 'john', right: 1.45, up: -0.3, fwd: 0.35 }, look: { rel: 'john', up: -0.2, fwd: 0.35 }, fov: 38, dur: 4.6,
        act: [{ who: 'milo', at: [0.62, -3.05], face: 'john', walk: { to: [0.76, -1.92], secs: 1.4, after: 0.3 }, hug: 'john', look: 'john' },
              { who: 'john', hug: 'milo' },
              { who: 'carissa', at: [0.18, -1.62], face: 'milo', pose: 'crouch', hug: 'john', look: 'milo' }] },
      // (close, over his father's right shoulder from behind: Milo's face over it, eyes shut tight or open on the night, his
      // arms round his father's neck, John's round his back; the lens creeps in)
      { cam: { rel: 'john', right: 0.34, up: 0.16, fwd: -0.85 }, to: { rel: 'john', right: 0.3, up: 0.14, fwd: -0.72 }, look: { rel: 'milo', up: -0.12 }, fov: 34, dur: 5.0 },
      // (wide and still, the three of them in the doorway's light)
      { cam: { rel: 'john', right: -1.6, up: 0.5, fwd: -3.0 }, to: { rel: 'john', right: -1.9, up: 0.9, fwd: -3.9 }, look: { rel: 'john', up: -0.3, fwd: 0.3 }, fov: 36, dur: 4.4 },
    ] },
    { type: 'roadblock', id: 'police', at: '@harlem', r: 24, cars: 3, kind: 'police', text: 'POLICE' },
    { type: 'npc', id: 'del-cuffed', who: 'delgado', at: { rel: 'player', right: 3, fwd: 4 } },
    { type: 'cutscene', id: 'arrest', shots: [
      { ...close('delgado', "You'll miss me, John. Nobody else ever chased you this hard.", { dur: 4.6 }), caption: 'Delgado, under arrest' },
      hero('Nobody else ever got this close.', { dur: 3, from: 'delgado' }),
      close('carissa', 'Bye, Pedro. Enjoy the cafeteria. I hear it\'s beige.', { dur: 3.6 }),
    ] },
    // the three of them together under the old sign, the last picture before MISSION PASSED
    { type: 'npc', remove: 'del-cuffed' },
    { type: 'npc', id: 'milo-end', who: 'milo', at: { rel: 'player', right: 0.8, fwd: 0.7 } },
    { type: 'npc', id: 'carissa-end', who: 'carissa', at: { rel: 'player', right: -0.9, fwd: 0.5 } },
    { type: 'cutscene', id: 'together', shots: [
      { cam: { rel: 'player', right: 0.4, up: 0.5, fwd: 4.6 }, to: { rel: 'player', right: 0.2, up: 0.35, fwd: 3.4 }, look: { rel: 'player', fwd: 0.5, up: -0.45 }, fov: 40, dur: 4.6, caption: 'The Marins · W 125th St · 9:52 PM' },
      { cam: { rel: 'player', right: -2.6, up: 1.1, fwd: 5.2 }, look: { rel: 'player', fwd: 0.5, up: -0.5 }, fov: 42, dur: 3.6, say: 'carissa', line: "Okay. Everybody in the car. We're going home." },
    ] },
    { type: 'voicenote', id: 'ma-epilogue', who: 'ma', text: "Johnny. The detective lady called. She said Milo's fine. I'm putting more cheese in. No ricotta. Bring him Sunday.", secs: 7 },
  ],
};

const act = {
  id: 'act3', name: 'ACT III · DELIVERY',
  timeline: {
    'PT-11': { clock: '6:50 PM', time: 'golden' }, 'PT-12': { clock: '7:15 PM', time: 'golden' }, 'PT-13': { clock: '7:40 PM', time: 'golden' },
    'PT-14': { clock: '8:05 PM', time: 'golden' }, 'PT-15': { clock: '8:35 PM', time: 'golden' },
  },
  end: {
    title: 'PICKUP TIME', heading: 'One afternoon. Wall St to 125th St.',
    stats: [{ label: 'RANSOM RAISED', value: '$1,000,000' }, { label: 'CLUES', value: '10 / 10' }, { label: 'STORES SOLD', value: '12' }, { label: 'LEMON BARS OWED', value: '1 TRAY' }, { label: 'TIME', value: '9:52 PM' }],
    meter: 'ransom',
    story: [
      'The million went into an evidence locker. Lou got his papers back. Bunny got a lifetime of free pizza she did not ask for.',
      'Agnes Teodoro babysits on Thursdays now. Teddy drives a delivery van. Marjorie kept the egg pizza.',
      'Ms. Okafor got her lemon bars on Monday. Carissa made them. They were terrible.',
      'On Tuesday, John picked Milo up from school. At three. On time. Pickup time.',
    ],
    quote: { text: "Two beeps means I'm okay.", by: 'milo' },
    next: { kicker: 'FREE ROAM', text: "New York is yours. The coupe is in the impound. Carissa's SUV is not." },
  },
  missions: [PT11, PT12, PT13, PT14, PT15],
};
const places = { 'a3-park-96': { '@': 'ues', name: 'Park Ave & E 96th St', offset: { right: 0, fwd: -60 } }, 'a3-park-97': { '@': 'ues', name: 'Park Ave & E 97th St', offset: { right: 0, fwd: -22 } } };
writeFileSync(OUT, JSON.stringify({ act, places }) + '\n');
console.log('act3.json', JSON.stringify({ act, places }).length, 'bytes;', act.missions.map((m) => `${m.id}:${m.steps.length}`).join(' '));
