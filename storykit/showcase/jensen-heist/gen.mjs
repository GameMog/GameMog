// Jensen Heist: writes storykit/packs/jensen-heist.json (Story Kit v2, a showcase in the San Jose town) from the
// script (the story bible, draft 2, 18 Nov 2026), every conversation scene a video call (vcall) and every car-phone
// call on the car's screen (call video). Run from the GameMog checkout: node storykit/showcase/jensen-heist/gen.mjs
// The town's pin (base.hometown) is read from town.json.gz (the CityPackage the pack is gated with); the people's
// sheets are the hand-built cast's (sheets/), whose bodies the migration ships (scripts/storykit-showcase-jensen.ts).
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const HERE = 'storykit/showcase/jensen-heist', OUT = 'storykit/packs/jensen-heist.json';
const sheet = (id) => JSON.parse(readFileSync(`${HERE}/sheets/${id}.json`, 'utf8'));
const town = JSON.parse(gunzipSync(readFileSync(`${HERE}/town.json.gz`)).toString('utf8'));
const lock = { place: town.placeId, buildId: town.compilerVersion, tiles: town.tileSet.hash, formatVersion: town.lockVersion === 3 ? 3 : 2, grid: town.grid, domain: town.domain,
  origin: { c0: town.origin.c0, r0: town.origin.r0 }, k0: town.k0, gamma0: town.gamma0, yOffset: town.yOffset, waterLevel: town.waterLevel };

// ── helpers ──
const DL = ['how', 'pre', 'post', 'overlap', 'cut', 'muted', 'secs'];
const opt = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => DL.includes(k)));
// a spoken line (calls, cutscene exchanges): L('marge', 'text', { how })
const L = (who, text, o) => ({ who, text, ...opt(o) });
// a video-call line and event
const V = (who, line, o) => ({ who, line, ...opt(o) });
const Ev = (d, who, extra = {}) => (who ? { do: d, who, ...extra } : { do: d, ...extra });
const say = (who, text, o = {}) => ({ type: 'say', who, text, ...o });
const SAYAT = (at, who, text, o = {}) => ({ type: 'say', at, who, text, wait: false, ...o });
const P = 'player';

// ── cast ──
const cast = [
  { id: 'jensen', color: '#0E6B6E', sheet: { ...sheet('jensen'), role: 'hero: founder-CEO of Greenlight Silicon, in his black leather jacket' },
    anchor: 'old-boss', voice: { id: 'jensen-v1', blend: { am_adam: 0.6, am_eric: 0.4 }, speed: 1.06, pitch: -0.3, description: "an older man, a warm bright baritone, quick and delighted, a showman's lift at the ends of sentences; standard American delivery" },
    face: { smile: 0.18 },
    speech: { rhythm: 'lists of three that build into a pitch, then the product', habit: '"Let me show you something"; "spiritually"', jokes: 'benchmarks things nobody measures, means every superlative', never: 'sarcasm; when he is hurt he gets quieter and simpler', motifs: ['the jacket', 'the lucky oven', 'booth three', 'the one square'] } },
  { id: 'board', model: 'mogcity/mrbig', color: '#6B3A2A', name: 'Mr. Board', role: 'ex-bank boss from back east, collector of board seats',
    // (his own voice block, not Mr. Big's British bm_lewis: every Jensen Heist voice is standard American. It names his
    // clips and is the Kokoro fallback for a line with no clip; his shipped voice is the rendered one)
    voice: { id: 'board-v1', blend: { am_onyx: 0.8, am_michael: 0.2 }, speed: 0.94, pitch: -0.6, description: 'a man in his sixties, a deep smooth bass-baritone, unhurried and courteous, a faint smile in it; standard American delivery' },
    speech: { rhythm: 'long smooth corporate clauses, a shareholder letter', habit: 'speaks of himself as the Board; "Big fan." "Regards."', jokes: 'courteous menace; buys something small first', never: 'raises his voice', motifs: ['the mahogany chair', 'the velvet bag', 'the mug', 'a parking lot in New York'] } },
  { id: 'marge', color: '#C9A227', sheet: sheet('marge'),
    anchor: 'office-worker', voice: { id: 'marge-v1', blend: { af_river: 0.7, af_nova: 0.3 }, speed: 1.0, pitch: -1.4, description: 'a woman in her fifties, dry and low, crisp consonants, even and unhurried until the one time she is not' },
    speech: { rhythm: 'clean full sentences that sound like a run of show', habit: '"Standby." "Copy." "T-minus."', jokes: 'dry, treats the jacket as cast with a call time', never: 'says yes to Jensen just because he asked', motifs: ['nineteen keynotes', 'the fog machine fire', 'the headset', 'watching from the seats'] } },
  { id: 'nico', color: '#8FB3D9', sheet: { ...sheet('nico'), logline: 'Came west four days ago in the lime roadster; names every pothole.' },
    anchor: 'driver', voice: { id: 'nico-v1', blend: { am_fenrir: 0.6, am_santa: 0.4 }, speed: 1.12, pitch: -1.0, description: 'a man in his forties, gravelly and fast, warm underneath, a storyteller who never stops for breath' },
    speech: { rhythm: 'one-breath run-on stories held together with and and so', habit: 'calls Jensen "boss"; rates everything out of eleven', jokes: 'names potholes, talks to the car', never: 'asks about a man\'s generosity', motifs: ['the banker kid', 'the hot dogs', 'the screaming curb', 'Gary and the Pope'] } },
  { id: 'lola', color: '#E8B23A', sheet: sheet('lola'),
    anchor: 'street-vendor', voice: { id: 'lola-v1', blend: { af_sarah: 0.5, af_kore: 0.5 }, speed: 1.04, pitch: -0.6, description: 'a woman in her fifties, a bright alto, unimpressed and quick, warm only by accident' },
    speech: { rhythm: 'short questions and prices', habit: '"Who needs that?" "That costs extra."', jokes: 'refuses to be benchmarked', never: 'says out loud that she cares about him', motifs: ['the blue cooler', 'the one burner', 'the door that says open', 'the dog'] } },
  { id: 'wesley', color: '#7FD1C7', sheet: sheet('wesley'),
    anchor: 'young-hero', voice: { id: 'wesley-v1', blend: { am_liam: 0.6, am_echo: 0.4 }, speed: 1.14, pitch: 1.6, description: 'a nineteen-year-old, a young tenor, fast, every sentence going uphill' },
    speech: { rhythm: 'and-and-and run-ons that keep adding', habit: '"Chat says"', jokes: 'every sentence a superlative', never: 'lets a scene go by without asking for a signature', motifs: ['Pruitt holding his spot', 'the signed phone', "his mom's car", 'the cone'] } },
  { id: 'dex', color: '#2F5FD0', sheet: sheet('dex'),
    anchor: 'club-promoter', voice: { id: 'dex-v1', blend: { am_echo: 0.5, am_eric: 0.5 }, speed: 1.08, pitch: 1.0, description: 'a man in his thirties, light and nasal-bright, restarting his sentences halfway' },
    speech: { rhythm: 'sentences that restart: "We\'re... okay, what we are is..."', habit: '"Pivot!" when the talk turns on him', jokes: 'misused startup words, radical honesty', never: 'manages not to confess', motifs: ['the vest', 'the review that said "a chip"', 'the wedding next door', 'the muffin'] } },
  { id: 'intern-a', color: '#4A78E0', sheet: { ...sheet('intern-a'), name: 'Intern One' },
    anchor: 'office-worker', voice: { id: 'intern-a-v1', blend: { am_puck: 0.7, am_liam: 0.3 }, speed: 1.1, pitch: 1.2, description: 'a young man, polite and eager, a little shaky' },
    speech: { rhythm: 'polite questions', habit: 'says sir', jokes: 'takes everything as career advice', never: 'means any harm', motifs: ['the reference', 'unpaid', 'the cooler'] } },
  { id: 'intern-b', color: '#6C8FE6', sheet: { ...sheet('intern-b'), name: 'Intern Two' },
    anchor: 'office-worker', voice: { id: 'intern-b-v1', blend: { am_eric: 0.6, am_puck: 0.4 }, speed: 1.05, pitch: 2.0, description: 'a young man, a higher anxious voice, always counting' },
    speech: { rhythm: 'short anxious exclamations', habit: 'corrects the count', jokes: 'thinks a fight is team-building', never: 'gets the number wrong', motifs: ['sixty-one coffees', 'team-building'] } },
  { id: 'director-a', color: '#4B4F58', sheet: { ...sheet('director-a'), name: 'Director Grey' },
    anchor: 'office-worker', voice: { id: 'director-a-v1', blend: { am_onyx: 0.7, am_michael: 0.3 }, speed: 1.0, pitch: -0.8, description: 'a man in his fifties, a flat clipped baritone, every sentence a motion' },
    speech: { rhythm: 'motions', habit: '"Motion to..."', jokes: 'procedure in a fistfight', never: 'acts without a vote', motifs: ['quorum', 'the lanyard'] } },
  { id: 'director-b', color: '#2C3442', sheet: { ...sheet('director-b'), name: 'Director Navy' },
    anchor: 'office-worker', voice: { id: 'director-b-v1', blend: { am_onyx: 0.6, am_echo: 0.4 }, speed: 0.92, pitch: -1.8, description: 'a man in his fifties, slower and lower, a flat baritone that seconds things; standard American delivery' },
    speech: { rhythm: 'one word, then the vote', habit: '"Seconded."', jokes: 'deadpan quorum', never: 'makes a motion of his own', motifs: ["Marge's headset", 'eleven'] } },
];

// ── places (every one a key of the San Jose build's frame; names only, never the real ones) ──
const places = {
  kitchen: { '@': 'parking55', name: 'the kitchen studio' },
  'stage-run': { '@': 'stadium4', name: "the arena's front drive" },
  market: { '@': 'parking41', name: 'the market square' },
  'santa-clara': { '@': 'hotel33', name: 'Santa Clara Street' },
  station: { '@': 'parking32', name: 'the station' },
  'station-lot': { '@': 'park65', name: 'the green by the station' },
  diner: { '@': 'restaurant31', name: 'the corner diner' },
  'museum-lot': { '@': 'hotel36', name: 'the lot behind the science museum' },
  'museum-van': { '@': 'hotel36', name: "Dex's broadcast van", offset: { right: 0, fwd: 22 } },
  'convention-dock': { '@': 'parking42', name: 'the convention hall dock' },
  viaduct: { '@': 'parking5', name: 'the 280 viaduct' },
  stack: { '@': 'restaurant160', name: 'the stack' },
  'north-87': { '@': 'park47', name: 'the 87, northbound' },
  'rose-garden': { '@': 'parking63', name: 'the rose garden' },
  'rose-lawn': { '@': 'parking63', name: 'the rose garden lawn', offset: { right: 0, fwd: 18 } },
  arena: { '@': 'stadium4', name: 'the arena' },
  'arena-line': { '@': 'park54', name: 'the fan line' },
  'arena-approach': { '@': 'stadium4', name: "the arena's front, a block short of the dock" },
  'arena-dock': { '@': 'parking64', name: 'the arena loading dock' },
  'stage-door': { '@': 'parking64', name: 'the stage door', offset: { right: 18, fwd: 0 } },
  'backlot-a': { '@': 'parking64', name: 'the back lot', offset: { right: -20, fwd: 10 } },
  'backlot-b': { '@': 'parking64', name: 'the back lot', offset: { right: 0, fwd: 24 } },
  'backlot-c': { '@': 'parking64', name: 'the back lot', offset: { right: 12, fwd: 12 } },
};

// (the opening's kitchen: the kitchen office, the room the K1 call is in)
const OPENING_ROOM = 'office-kitchen';

// ── the opening (a cutscene: the place card, the name cards, the title) ──
const opening = {
  place: '@kitchen', time: 'midday',
  stage: [{ who: 'nico', at: { rel: 'player', right: 3, fwd: 6 } }],
  sets: {
    kitchen: { room: OPENING_ROOM, light: 'day', people: [
      { who: 'jensen', at: [-0.2, -0.85], face: 0, pose: 'talk', look: 'lens' },
      { who: 'marge', at: [1.4, 0.6], face: 'jensen', pose: 'arms', prop: 'walkie' }] },
    boardroom: { room: 'bank-office', light: 'golden', people: [{ who: 'board', at: [0, -1.5], face: 8, pose: 'sitTalk', look: 'lens' }] },
  },
  shots: [
    { cam: { rel: 'player', right: -2, up: 60, fwd: -80 }, to: { rel: 'player', right: 0, up: 30, fwd: -45 }, look: '@arena', fov: 55, dur: 6, where: { name: 'San Jose, California', sub: 'South of downtown · 9:04 AM' } },
    // (Nico by the lime roadster: the lens off his right shoulder, the car beyond him; the paint is the car-colour set-up)
    { cam: { rel: 'nico', right: 4.6, up: 1.0, fwd: 1.4 }, look: { rel: 'nico', up: -0.2, fwd: 2.0 }, fov: 58, dur: 4, card: { who: 'nico', is: 'ally', role: 'the car guy, four days in from back east, fresh paint job' } },
    { set: 'kitchen', cam: { rel: 'jensen', right: 0.2, up: 0.1, fwd: 1.4 }, look: { rel: 'jensen' }, fov: 38, dur: 7, card: { who: 'jensen', is: 'hero', role: 'founder, CEO, owner of one jacket' },
      say: 'jensen', line: "Good morning, San Jose! Tonight, the fastest chip ever made, and because you're family, you see it first, straight out of my oven." },
    { set: 'kitchen', cam: { rel: 'marge', right: 0.4, up: 0.05, fwd: 1.6 }, look: { rel: 'marge' }, fov: 38, dur: 5, card: { who: 'marge', is: 'ally', role: 'stage manager, nineteen keynotes, none on time' },
      say: 'marge', line: "Ten hours to doors, Jensen. Open the oven, smile, and let's be off the air by nine-ten.", how: 'deadpan' },
    { set: 'kitchen', cam: { rel: 'jensen', right: -0.5, up: 0.3, fwd: -1.2 }, look: { rel: 'jensen' }, fov: 40, dur: 4, sub: 'THE OVEN: EMPTY. A PLATE OF OATMEAL RAISIN COOKIES. A CARD.' },
    { set: 'boardroom', cam: { rel: 'board', right: 0.3, up: 0.1, fwd: 1.5 }, look: { rel: 'board' }, fov: 36, dur: 6, card: { who: 'board', is: 'antagonist', role: 'ex-bank boss from back east, collector of board seats' },
      say: 'board', line: "Big fan. I took it out so it wouldn't burn. Regards, the Board.", how: 'smug' },
    // (Marge cuts in, and he doesn't hear her: K1 opens on "I said 'we're off' at 'Marge.'")
    { set: 'kitchen', cam: { rel: 'jensen', right: 0.15, up: 0.08, fwd: 1.2 }, look: { rel: 'jensen' }, fov: 38, dur: 5,
      lines: [L('jensen', 'Ha! Okay. Everybody, quick logo spin. Marge? Logo spin. Marge!', { pre: 0.4, cut: 0.9 }), L('marge', "Off. We're off.", { overlap: true, how: 'deadpan' })] },
    // (the title over the hero by the lime roadster, parked at his side; the pack's vehicles carry the paint)
    { cam: { rel: 'player', right: -6, up: 4, fwd: -16 }, look: 'player', dur: 5, title: true },
  ],
};

// ── Mission 1: Preheat ──
// K1: the empty oven. Jobs: the mute gag is his flaw in one joke (he presents to a room that can't hear him, and he
// didn't hear Marge say "off"); the card is evidence; Nico brings the car in and sets up its colour; Marge plants the
// jacket's call time (the ST1 payoff line, verbatim); it ends on his first act of will: "Nico, keys. Marge, no hold."
// (he drives himself all day, Nico's car: Nico stays at the house minding the oven, where BT-3 finds him)
const K1 = { type: 'vcall', id: 'k1', title: 'Oven Stream: Post-Show', time: 'day', people: [
  { who: P, office: 'kitchen', label: 'Jensen', sub: 'his kitchen · the oven stream', muted: true },
  { who: 'marge', office: 'backstage', sub: 'Stage manager · GreenLive' },
  { who: 'nico', office: 'car', sub: 'in the car, out front', late: true, cam: 'low' }],
  lines: [
    V(P, 'Marge? Marge, can you hear me? Are we off?'),
    V('marge', 'I said "we\'re off" at "Marge." You\'ve been on mute since the logo spin.', { how: 'deadpan' }),
    Ev('unmute', P),
    V(P, "Tell me we're off the stream, because my face is still doing the launch."),
    V('marge', 'Forty thousand people just watched you shout my name at an oven. Chat thinks I\'m the chip.'),
    V(P, "It's not empty. There are cookies in there."),
    V('marge', 'Are they your cookies?'),
    Ev('share', P, { slide: { title: 'THE CARD, FROM MY OVEN', lines: ["Big fan. I took it out so it wouldn't burn.", 'Regards, the Board.', 'P.S. Your chairmanship is next.'] } }),
    V(P, 'There\'s a P.S. "Your chairmanship is next." Who puts a P.S. on a ransom cookie?'),
    V('marge', "A man who's never once been told no, and never by a cookie."),
    Ev('unshare', P),
    V('marge', "You kept the only working prototype of the fastest chip on Earth in an oven that's never been switched on."),
    V(P, 'Let me show you something. That oven is lucky, it has never burned a thing, and ninety percent of my best ideas came...', { cut: 0.8 }),
    V('marge', "It's unplugged.", { overlap: true }),
    V(P, 'Luckily unplugged.'),
    Ev('join', 'nico'),
    V('nico', "Car's out front, boss. I had her painted for you, and the guy called the colour \"keynote.\""),
    V('marge', "It's a highlighter.", { overlap: true, how: 'deadpan' }),
    V(P, "It's perfect."),
    V('nico', "Why's everybody got a funeral face?"),
    V('marge', 'Somebody took Brisket.'),
    V('nico', 'The sandwich?'),
    V(P, "The chip! Its real name's the Kestrel, it's on the box, and nobody ever calls it the Kestrel...", { cut: 0.85 }),
    V('nico', "Why'd you name a chip after a sandwich?"),
    V(P, "Brisket isn't a sandwich, Nico. Brisket is twelve hours, low and slow, and then it changes your life."),
    V('nico', "Boss, with respect, that's every sandwich I ever had, and I had a lot of sandwiches in New York."),
    V('marge', "Seven o'clock, twenty thousand people, one velvet stand. What do I put on the stand, Jensen?"),
    V(P, 'The jacket?'),
    V('marge', 'I am not launching the jacket. It has a call time, six-thirty, and I tell the crew, "The jacket\'s in, he\'s coming."'),
    V(P, 'It would sell out.'),
    V('marge', 'I\'m putting out a forty-minute hold. "Technical difficulties," nobody panics, we...', { cut: 0.6 }),
    V(P, 'Nico, keys. Marge, no hold.'),
    V('nico', "Keys are in her, boss. I'll mind the oven.", { pre: 0.3 }),
  ] };

// C1: Marge on the car screen, over both legs (span). The plot is in the first 7 lines (the hold argued, not
// re-explained; the box of air; the 4 PM deal; the run of show; the fog machine fire); the Board in 8-13. Every
// joke the brief moves out is an extra; the first extra is the seats exchange (ST3's "Watch one from the seats" pays
// it off). The arena stop between the legs is the chair plant: the man in the lanyard on the street, a beat on him,
// two lines (span 5: npc, beat, say, say, drive 2). A scene arriving wraps it first (Mog City runner wrapSpan), so the
// wrap is heard at the market.
const C1 = { type: 'call', who: 'marge', auto: true, inCar: true, at: 2, span: 5, video: { office: 'backstage' },
  lines: [
    L('marge', 'You said "no hold" and left the meeting. That\'s not a decision, Jensen, that\'s a door.'),
    L('jensen', 'Here\'s the plan. Lola sees everyone who eats in this city, and everyone eats, so we start at...', { cut: 0.8 }),
    L('marge', 'Her window, I know. And at seven you open a box of air in front of twenty thousand people.'),
    L('jensen', "Give me till four. If I don't have it by four, you call it, and I'll stand next to you while you do."),
    L('marge', '...Four. Copy. Drop the run of show at the stage door on your way, and nobody says the word "fog."', { pre: 0.4 }),
    L('jensen', 'The fog was beautiful.', { overlap: true }),
    L('marge', 'The fog set off the sprinklers over four thousand laptops.', { how: 'deadpan' }),
    L('jensen', 'Who\'s "the Board"? Our board brings fruit.'),
    L('marge', 'Not our board. A man with point four percent of us and a mattress company, and I want my two minutes back.'),
    L('jensen', "Point four isn't a seat, it's a crumb. You can't run a company from a crumb."),
    L('marge', 'You found cookies. Follow the crumbs.'),
    L('jensen', "Here's what we know. Somebody took one box, left eight cookies and wrote a P.S. That's a planner."),
    L('marge', "That's a creep with a pastry budget."),
  ],
  extra: [
    [L('jensen', 'Have you ever watched one from the seats? One of ours?'), L('marge', "I've watched nineteen from the wings, one from a catwalk, and one from inside a road case."),
      L('jensen', 'Why a road case?'), L('marge', 'The headset cable reached the road case. Nothing else did.'), L('jensen', 'Tonight you watch from the seats.'),
      L('marge', 'Tonight I watch the clock. ...Ask me after.', { how: 'warm', pre: 0.6 })],
    [L('marge', 'Want to hear the run of show? It calms me down.'), L('jensen', 'Please.'),
      L('marge', 'Seven-oh-oh, house to half. Seven-oh-one, the screen does the sunrise. Seven-oh-two, you walk out.'),
      L('jensen', 'Seven-oh-one and a half. Half a minute of nothing, then the sunrise, then...', { cut: 0.8 }),
      L('marge', 'You walked out at seven-nineteen last year. Anticipation built, then it went to get a pretzel.')],
    [L('jensen', "How's the screen?"), L('marge', 'Ninety metres. You can see it from the airport, and a pilot called the front office to complain.'),
      L('jensen', 'About the brightness?'), L('marge', 'About your face. He said it looked like it was coming in to land.'), L('jensen', 'That is the dream, Marge.')],
    [L('jensen', "Fans in tents since Tuesday. Tent one, tent two, a little tent for the first tent. That's a platform, Marge..."),
      L('marge', "That's a fire lane. I've had the marshal on the phone twice."),
      L('jensen', 'We said "limited supply" and we meant it. We made one Brisket. We are sold out of the one.'),
      L('marge', "And now we're sold out of zero, which is a launch I've never had to write a cue for.")],
    [L('marge', "Are you speeding? You sound like you're speeding."), L('jensen', "I'm doing a live demo of the brakes."), L('marge', "The brakes don't need a demo."),
      L('jensen', "Everything needs a demo, Marge. That's my whole career.")],
  ],
  wrap: [L('marge', "That's the market square. I can hear the grill from here."), L('jensen', "Lola's grill has a frequency. It's like a choir that also makes lunch."),
    L('marge', "Four o'clock. Then I call it. Copy?"), L('jensen', 'Copy. Mostly.')],
  // (pause and resume fit both a call waiting (W1) and him getting out of the car)
  hold: { pause: [L('marge', "Go on, I'll hold. I held a curtain for eleven minutes once.")], resume: [L('marge', "You're back, and you're smiling, I can hear it. Where were we? Panic.")] } };

// W1: call waiting in leg 2. The blur has a job: Wesley won't show the cam because Pruitt is asleep on him in the
// line (Pruitt's set-up, in main).
const W1 = { type: 'call', who: 'wesley', interrupts: true, inCar: true, at: 6, video: { office: 'green', blur: true },
  lines: [
    L('wesley', "Oh my gosh, it's actually you, Chat, it's actually him, and he picked up, and I'm not even crying yet, and...", { cut: 0.9 }),
    L('jensen', 'Who is this?', { overlap: true }),
    L('wesley', "Wesley! TroutStream! Jacket-black hoodie, jacket-black socks, and a jacket-black cat, and he was black already but it counts."),
    L('jensen', 'Wesley. How did you get this number?'),
    L('wesley', 'You gave it to me! You signed my phone and then you called yourself on it to test the marker!'),
    L('jensen', '...That does sound like me. Why is your background blurry?'),
    L('wesley', "Privacy! Pruitt's asleep on my leg, and he's holding our spot, and if he wakes up we lose row one!"),
    L('wesley', "Your oven stream cut off and Chat thinks it's a bit, and is it a bit? Blink twice if it's a bit!"),
    L('jensen', 'Wesley, this is a video call. I can see your cat.'),
    L('wesley', "Blink anyway! Okay, Pruitt's waking up, I gotta go, love the jacket, bye, bye!"),
  ] };

// L1: Lola won't do VIPs in the lunch rush, so Jensen, ninth in her line, has to call her from it. March is planted
// here (C pays it off in LO3: "You forgot." / "I forgot."); his answer is the flaw: he presents over it and changes
// the subject.
const L1 = { type: 'vcall', id: 'l1', title: "Lola's Window", time: 'golden', people: [
  { who: 'lola', office: 'truck', sub: "Lola's · the truck kitchen", cam: 'wide' },
  { who: P, office: 'lot', label: 'Jensen', sub: "ninth in line at Lola's", blur: true, cam: 'low' }],
  lines: [
    V(P, "Lola! I'm ninth in line. I can see you, you can see me, so why are we on a...", { cut: 0.8 }),
    V('lola', 'No.', { overlap: true }),
    V(P, "I didn't say anything."),
    V('lola', "Lunch rush. I don't do VIPs, and ninth is ninth. Also you've got the face, you're going to rate my brisket."),
    Ev('hand', P),
    V(P, 'Lola, I just want to say, out loud, this is thirty percent more flavour per bite than last quarter...', { cut: 0.85 }),
    V('lola', "Don't benchmark my food. Do I benchmark your computers?"),
    V(P, "You could! I'd love that."),
    V('lola', "Fine. They're loud and they cost too much. Eat."),
    V(P, 'Somebody took Brisket.'),
    V('lola', "You're eating brisket."),
    V(P, 'The other Brisket. The chip. I named it right here, at this window, remember?'),
    V('lola', 'You ate three ribs, named a computer and sat on my cooler for an hour.'),
    V(P, 'Best launch I ever did.'),
    V('lola', 'You booked me for the March launch. Sixty plates. Nobody came to get them.'),
    V(P, 'March was a learning quarter.'),
    V('lola', '...Mm.', { pre: 0.6 }),
    V(P, 'Who came through the square early? Big group, weird order.'),
    V('lola', 'Eight vests, forty brisket rolls, and then they want a box that stays cold all day. Who needs cold all day?'),
    V(P, 'Somebody carrying something that runs hot. Lola, let me show you. Hold your hand over my laptop vent...', { cut: 0.8 }),
    V('lola', "I'm not touching your laptop."),
    V(P, "Brisket runs warmer than that. You'd need a cooler."),
    V('lola', 'I gave them my good cooler. The blue one. That costs extra.'),
    V(P, "Blue vests and a blue cooler. That's Cobalt. That's Dex."),
    V('lola', 'The vest kid? He tried to pay me in "tokens," so I drew a sandwich on a napkin and gave him that.'),
    V(P, 'Where are they now?'),
    V('lola', 'Dented blue SUV behind the market, saying "pivot" on speaker for an hour. You want a roll for the road?'),
    V(P, '...Two.'),
    V('lola', "That's eight dollars. You're still ninth. Go, they're moving.", { pre: 0.4 }),
  ] };

// M1: two drive steps (the runner drives a `to` list to its nearest place, runner.js:488), C1 spanning both. The arena
// stop: Director Grey on the street with the chair, the beat on him, two waiting `say` steps (each a step the span
// counts: npc, beat, say, say, drive 2's end = span 5); a mission line waits for the call's line playing, the call for
// the mission's line (calls.js:884). W1 rings in leg 2.
const M1 = { id: 'PH-1', title: 'Preheat', vehicle: 'roadster', start: '@kitchen', time: 'midday', card: 'slam', verbs: ['drive'],
  stakes: 'Ten hours to doors, and the only working prototype is gone.', passLine: 'Blue vests, a blue cooler. Follow the crumbs.',
  steps: [
    { type: 'transition', kicker: '9:06 AM', text: 'THE KITCHEN STUDIO' },
    K1,
    { type: 'car', name: 'lolatruck', car: 'van', color: '#E8B23A', at: '@market' },
    { type: 'npc', who: 'lola', at: '@market' },
    { type: 'drive', to: '@stage-run', objective: 'Drop the run of show at **the arena**', during: [C1] },
    // (the plant, seen: a man in a lanyard wheels a mahogany chair along the arena's front toward its doors, ahead of
    // the car; a beat on him from the road as Jensen asks)
    { type: 'npc', who: 'director-a', at: { rel: 'player', right: 6, fwd: 5 }, push: 'chair', lanyard: true, walk: { fwd: 16, secs: 15 } },
    { type: 'beat', shot: { cam: { rel: 'director-a', right: -4.2, up: 0.75, fwd: 7.5 }, look: { rel: 'director-a', up: -0.3 }, lookTo: { rel: 'director-a', up: -0.3, fwd: 5 }, fov: 36 }, dur: 6,
      say: { who: 'jensen', text: 'Marge, why is a man in a lanyard wheeling a mahogany chair into my arena?' } },
    say('marge', "It's on the manifest as \"furniture, executive.\" I assumed it was yours.", { how: 'deadpan' }),
    say('jensen', 'I sit on a stool.'),
    { type: 'drive', to: '@market', objective: "Get to **Lola's truck** at the market square", during: [W1] },
    L1,
    say('jensen', "Blue vests, a blue cooler, and my lucky oven's only child.", { wait: false }),
  ] };

// ── Mission 2: Cold Box ──
// D1: Dex on the car screen through the tail. Kept nearly whole; the "a chip" review is now main (C pays it off:
// A1's "also", the finale's "Dex: present"); the vest riff is an extra; every old car-colour line is the
// green car now (a lime that got a sports scholarship). Main 24 lines.
const D1 = { type: 'call', who: 'dex', auto: true, inCar: true, at: 4, video: { office: 'startup' },
  lines: [
    L('dex', "Jensen! My guy! It's Dex, from Cobalt, we met at all of them. Saw the oven stream, brutal, and we're not... nobody's happy about it."),
    L('jensen', "How's the C1 doing, Dex?"),
    L('dex', 'Great. Fast. Way faster since this morning. Not because of anything. Pivot.'),
    L('jensen', 'Since this morning.'),
    L('dex', "Did I say morning? Morning's a legacy concept."),
    L('jensen', 'Is your car blue, Dex?'),
    L('dex', "Why are we... okay, what we're doing is, we're not talking about colours, colour's also a legacy concept."),
    L('jensen', "Somebody's paying for your afternoon, Dex. Who?"),
    L('dex', "Who's paying? There's no... there's a partner. A strategic partner. With a lovely voice and a velvet... with a voice."),
    L('jensen', "Let me show you something, Dex. You've got a cooler, an SUV, and eight men in vests, and that's...", { cut: 0.8 }),
    L('dex', "It's a mobile strategy!", { overlap: true }),
    L('dex', 'Quick hypothetical. How hot does a chip run? In a cooler? For no reason?'),
    L('jensen', "Warm. Very warm. It doesn't like coolers."),
    L('dex', 'Totally hypothetical, totally fine. You know our chip got one review? The whole review was "a chip." You get "a new era," and I get a noun.'),
    L('jensen', 'A noun is a start, Dex. Nouns are where everything starts.'),
    L('dex', "Don't... don't be nice, it's very confusing while I'm doing a crime."),
    L('jensen', 'Can I ask you something real? Why do you want my chip?'),
    L('dex', "Okay, radical honesty. I don't want your... I want what happens when you hold it up. Twenty thousand people, man, don't your knees go?"),
    L('jensen', 'Every time.', { pre: 0.4 }),
    L('dex', 'Really?'),
    L('jensen', 'Every time. You walk out anyway, and the knees catch up around the second slide.'),
    L('dex', 'My knees have never been asked. I did one keynote, in a hotel, and the ballroom next door had a wedding.'),
    L('jensen', 'How did it go?'),
    L('dex', "They clapped for the wrong thing, is how. Somebody's uncle gave a toast through the wall and got a standing ovation."),
  ],
  extra: [
    [L('dex', 'How\'s the jacket? Still leather? You ever think about a vest?'), L('jensen', 'Never once.'),
      L('dex', 'Vests are the future, man, because your arms are free, and when your arms are... the ideas are free, is the point.'),
      L('jensen', 'Where do you even buy those?'), L('dex', 'We make them, in-house, vertical integration.'), L('jensen', 'You make vests and chips?'),
      L('dex', "We make vests. The chips are... the chips are a journey we're on.")],
    [L('dex', "My guys say there's a green car behind them, real shiny, like a lime that got a sports scholarship."),
      L('jensen', "It's not lime, Dex, the colour's called keynote. ...There's a lot of those in San Jose."),
      L('dex', "Is there? I don't think there... Pivot. Ignore me, I'm a lot today.")],
  ],
  wrap: [L('dex', "My guys just stopped. Why'd they stop? Why are you breathing like you just parked?"), L('jensen', 'Talk soon, Dex.'),
    L('dex', 'Wait, is the lime... are you the lime? Pivot! Pivot!', { how: 'urgent' })],
  react: {
    tooClose: [L('dex', "Guys say the green car's really close, like, smelling distance, which is weird, right?"), L('dex', "Is that you on my bumper? That's a joke. Unless it isn't. Is it?")],
    lost: [L('dex', 'Oh, they lost the lime! Huge win for us. Huge. Who even cares.'), L('dex', "Green car's gone. Good. Great. I'm calm. The vest is calm.")],
  } };

// I1: the beaten intern asks for a quick sync "so it's documented", while Jensen stands next to him on the grass.
// Intern Two joins late just to correct the count. The Board bought them something small first (61 coffees). It ends
// on a choice Jensen makes: no police for unpaid interns; they take Lola's cooler back, with a tip.
const I1 = { type: 'vcall', id: 'i1', title: 'Quick Sync (Intern)', time: 'day', people: [
  { who: 'intern-a', office: 'green', label: 'Intern One', sub: 'the green by the station', blur: true, cam: 'low' },
  { who: P, office: 'green', label: 'Jensen', sub: 'the green by the station', blur: true, cam: 'low' },
  { who: 'intern-b', office: 'green', label: 'Intern Two', sub: 'the green, still on the grass', blur: true, cam: 'low', late: true }],
  lines: [
    V('intern-a', 'Thanks for joining my quick sync, sir. I like things documented. For my reference.'),
    V(P, "I'm standing right next to you."),
    V('intern-a', 'And it\'s going really well. Can I put you down as a reference?'),
    V(P, 'You want me as your reference?'),
    V('intern-a', "You're the most famous person who's ever hit me."),
    V(P, "Where's the chip?"),
    V('intern-a', 'We had it for one drive! A suit took it at the plaza. Velvet bag.'),
    V(P, 'Did he say anything?'),
    V('intern-a', '"Thank you, intern." Like it was my name. He bought the whole team coffee first, sixty coffees...', { cut: 0.85 }),
    Ev('join', 'intern-b'),
    V('intern-b', 'Sixty-one!', { overlap: true, how: 'urgent' }),
    V('intern-a', "He left this for you. On Lola's napkin. He said you'd know the booth."),
    Ev('share', 'intern-a', { slide: { title: "LOLA'S NAPKIN", lines: ["Booth three. One o'clock.", 'Come alone.', 'Regards, the Board.'] } }),
    V('intern-a', 'Are you going to call the police?'),
    V('intern-b', "We're unpaid! Is that a crime? Is it a crime for us or for them?"),
    V(P, "No police. You've got a strong left and good manners. Take Lola her cooler back, with a tip, and tell her I sent you.", { pre: 0.5 }),
    Ev('unshare', 'intern-a'),
    V('intern-a', 'How much of a tip?'),
    V(P, 'The more you tip... you know what, just a big one.'),
  ] };

const M2 = { id: 'CB-2', title: 'Cold Box', vehicle: 'roadster', start: '@market', time: 'midday', card: 'slam', verbs: ['drive', 'tail', 'fight'],
  stakes: "Dex's guys have the blue cooler. Don't get spotted.", passLine: "Booth three. One o'clock. Come alone.",
  steps: [
    { type: 'tail', name: 'the Cobalt SUV', car: 'suv', color: '#2F5FD0', route: ['@market', '@santa-clara', '@station', '@station-lot'], ahead: 60, speed: 11, lostDist: 220,
      objective: "Follow the Cobalt SUV. Don't get spotted.", during: [D1] },
    { type: 'car', name: 'cobaltsuv', car: 'suv', color: '#2F5FD0', at: '@station-lot' },
    { type: 'npc', who: 'intern-a', at: '@station-lot' },
    { type: 'npc', who: 'intern-b', at: '@station-lot' },
    say('intern-a', "It's the CEO! The real one! Somebody hide the cooler!", { wait: false }),
    { type: 'fight', enemies: ['intern-a', 'intern-b'], arena: '@station-lot', win: 'ko-all', rules: 'lesson', timer: 90, objective: 'Deal with the interns.',
      during: [SAYAT(2, 'intern-a', "We're interns! This isn't even paid!"), SAYAT(8, 'intern-b', "Is this team-building? Nobody said anything about team-building!"),
        SAYAT(14, 'jensen', 'Elbows in. Good form. Terrible career choice.'), SAYAT(22, 'intern-a', "Dex said you'd be nicer!"), SAYAT(30, 'jensen', 'I am being nice. This is my nice.')] },
    I1,
  ] };

// ── Mission 3: Booth Three ──
// WRITER B, round 2. Drop-in replacement for gen.mjs from "// ── Mission 3: Booth Three ──" up to (not including)
// "// ── Mission 6: Take Private ──". Uses only gen.mjs's own helpers (L, V, Ev, say, SAYAT, P).
const N1 = { type: 'call', who: 'nico', auto: true, inCar: true, video: { office: 'kitchen' },
  lines: [
    L('nico', "Boss, I'm at the house with the oven, and it's got a vibe now, like a crime show where the oven did it."),
    L('jensen', "Nico, the napkin says booth three, one o'clock, and it's signed the Board."),
    L('nico', 'Your board? The fruit people?'),
    L('jensen', 'Why does everyone say that? No. A man. From New York.'),
    L('nico', "...Big guy, silver hair, talks like a cheque you can't cash, buys you a little something before he asks?", { pre: 0.4 }),
    L('jensen', 'You know him?'),
    L('nico', "Boss, the car knows him. Sit facing the door, and whatever he buys you, say thank you and don't eat it."),
    L('jensen', "Let me show you how I'll play it. Warm, open, a little pancake diplomacy, and then...", { cut: 0.8 }),
    L('nico', 'Facing the door.', { overlap: true }),
    L('nico', "Also there's a cookie on your counter with a bite out of it, and it's not a human bite, I'm thinking the dog."),
    L('jensen', "I don't have a dog."),
    L('nico', 'Then we got a second suspect.', { how: 'deadpan' }),
    L('jensen', "Nico, this car. The steering, the brakes, and the way the seat holds you like it's proud of..."),
    L('nico', 'Rate her.', { overlap: true }),
    L('jensen', 'Ten.'),
    L('nico', "Out of eleven. I use eleven so nobody ever gets a ten, and nobody's ever got an eleven, not even me."),
    L('jensen', 'People keep pointing at her.'),
    L('nico', "She was white for the kid. For you she's keynote, and keynote is a colour people point at."),
    L('jensen', "I'll tell you the real booth story after."),
    L('nico', "I've heard it four times this week, boss. Monday you had two friends with you, Tuesday it was eleven, Wednesday there was a dog."),
    L('jensen', '...There was a dog outside. He was there in his heart.', { pre: 0.4 }),
    L('nico', 'I can hear the curb, boss. The curb is screaming.'),
  ],
  extra: [
    [L('nico', 'Watch for the one on Santa Clara, the big one, I call him Gary.'), L('jensen', 'You named a pothole?'),
      L('nico', 'I named all of them, Gary and Little Gary and the Pope, and you\'ll know the Pope when you hit him, because everybody in the car starts praying.')],
    [L('jensen', "Where did you even get this car? We don't make cars."),
      L('nico', "So the banker kid, right, he gets framed for a thing and then unframed for the thing, and there's mustard everywhere, and he says keep it, I'm taking the train a while."),
      L('jensen', 'He gave you a hypercar.'),
      L('nico', "He paid me in hot dogs, twice, good hot dogs, and then he gave me a hypercar, and I don't ask questions about a man's generosity.")],
    [L('nico', 'Can I ask a personal thing? How many of those jackets you got?'), L('jensen', 'One.'), L('nico', 'One.'),
      L('jensen', 'One at a time. When one retires it goes somewhere nice. A closet with very good lighting, and a little card with the years it served.'),
      L('nico', 'Like a racehorse.'), L('jensen', 'Exactly like a racehorse.')],
    [L('jensen', 'What did you give yourself? Out of eleven.'), L('nico', 'A seven, once, in Queens, and I cried in a car wash.')],
  ],
  wrap: [L('nico', "You're there? I hear the bell on the door. Order the pancakes, for the story."), L('jensen', 'The story already has pancakes.'),
    L('nico', 'Then the story gets seconds. Facing the door, boss.')],
  hold: { pause: [L('nico', "Out of the car? Don't leave the keys on the seat. The kid left the keys on the seat once and look what happened. Me.")],
    resume: [L('nico', 'Back. Good. I was talking to the oven and lost my thread.')] } };

// The Board is a tablet propped in booth three; his two Directors sit in the next booths, on the call from their phones.
// Speaker layout: every line here is <= 120 characters.
const B1 = { type: 'vcall', id: 'b1', title: 'Booth Three', time: 'day', layout: 'speaker', people: [
  { who: 'board', office: 'study', label: 'Mr. Board', sub: 'Mahogany Partners · remote' },
  { who: P, office: 'diner', label: 'Jensen', sub: 'booth three · the corner diner', blur: true, cam: 'low' },
  { who: 'director-a', office: 'diner', sub: 'booth four · the corner diner', blur: true, cam: 'low', muted: true }],
  lines: [
    V('board', 'Jensen, big fan, please sit. I saved your booth, which took some doing, because there was a family in it.'),
    V(P, "You're a tablet. You're a tablet propped against the syrup."),
    V('board', "I'm a remote-first chairman, Jensen. I never sit in a room I haven't bought."),
    V(P, 'What did you do to the family?'),
    V('board', 'I bought their pancakes, all of them, and the futures on their pancakes. They left very full and slightly confused.'),
    V(P, "Point four percent of my company. That's not a seat, that's a cushion."),
    V('board', "I'm a large man, Jensen, and I'd like a larger chair."),
    V('board', 'New York and I agreed to see other people. A young man with a laptop, and his friend with a tracker.'),
    V(P, 'What did they teach you?'),
    V('board', 'Never be the CEO. Be the man who fires the CEO, because he gets the nicer chair.'),
    V(P, "Where's my chip?"),
    V('board', "Safe, and somewhere warm, because it runs warm, doesn't it? Like you. I respect warmth; I've never had any myself."),
    V(P, 'What do you want?'),
    V('board', 'One signature on one letter that makes me chairman. Then tonight I walk out on your stage and launch your Brisket.'),
    Ev('share', 'board', { slide: { title: 'A LETTER FOR SIGNATURE', lines: ['I, Jensen, appoint the Board chairman.', 'Sign here.'], big: 'SIGN' } }),
    V(P, 'You want to do my keynote.'),
    V('board', "I want to do a keynote, and yours is the only one with a screen big enough for my face."),
    Ev('unshare', 'board'),
    V(P, 'Do you know what happened in this booth? A rainy night, eleven friends, a napkin, and a pen you had to blow on...', { cut: 0.8 }),
    V('board', "Please don't.", { how: 'deadpan', overlap: true }),
    V('director-a', 'Motion to escort.'),
    V('board', "Gregory, you're on mute.", { how: 'deadpan' }),
    Ev('unmute', 'director-a'),
    V('director-a', 'Motion to escort.'),
    V('board', "Not yet, Gregory. He hasn't said no."),
    V(P, 'I drew one square on that napkin, one, and every chip we ever made is that square.', { how: 'warm', pre: 0.6 }),
    V('board', 'Was it raining? The waitress says sunny, and she tells it with a dog.'),
    V(P, '...It was spiritually raining.'),
    V('board', 'Sign the letter, Jensen. The more you sign, the more you save.'),
    V(P, "Don't. Don't do my line."),
    V('board', "It's a very good line, and I'm putting it on a mug. A boardroom mug, with a gavel for a handle."),
    V(P, '...Where do I sign?'),
  ] };

const BC = { type: 'choice', prompt: "Sign the Board's letter?", who: 'jensen', timeout: 8, default: 0, options: [
  { text: 'Sign the letter', reply: "There. 'To my biggest fan. Stay humble. Love, Jensen.'" },
  { text: 'Sign the napkin instead', reply: "Here. A napkin from booth three, signed 'Love, Jensen.' It's worth more than your seat." }] };

const B2 = { type: 'vcall', id: 'b2', title: 'Booth Three', time: 'day', people: [
  { who: 'board', office: 'study', label: 'Mr. Board', sub: 'Mahogany Partners · remote' },
  { who: P, office: 'diner', label: 'Jensen', sub: 'booth three · the corner diner', blur: true, cam: 'low' },
  { who: 'director-a', office: 'diner', sub: 'booth four · the corner diner', blur: true, cam: 'low' },
  { who: 'director-b', office: 'diner', sub: 'the booth by the door, the diner', blur: true, cam: 'low', late: true }],
  lines: [
    V('board', 'You signed it "love."'),
    V(P, 'I sign everything "love." Hoodies, phones, a cooler this morning. Legally it\'s a greeting card.'),
    V('board', 'Then we do it the long way. Gregory, now.'),
    Ev('join', 'director-b'),
    V('director-a', 'Motion to escort, as moved earlier.'),
    V('director-b', 'Seconded.', { overlap: true }),
    V('board', 'Do run, Jensen. You look wonderful running toward things.'),
    V(P, "I'll get the check."),
    V('board', 'I bought the check.', { how: 'smug' }),
  ] };

const M2C = { type: 'call', who: 'marge', auto: true, inCar: true, register: 'fast', video: { office: 'backstage' },
  lines: [
    L('marge', 'Why is there a siren in your voice?'),
    L('jensen', "There's no siren. There are four very tall men in suits behind me."),
    L('marge', 'Board men?'),
    L('jensen', 'Directors. They have lanyards, and they vote before they turn.'),
    L('marge', 'Lose them by the station, the side streets are narrow there. Suits hate narrow.'),
    L('jensen', 'He wants to do the keynote, Marge. My keynote, on my screen, with my...', { cut: 0.8 }),
    L('marge', "He can't.", { overlap: true }),
    L('marge', "He's not on the run of show. Which is odd, because it came back from the printer an hour ago saying 'Presenter: TBC.'"),
    L('jensen', 'Printer gremlin.', { overlap: true }),
    L('marge', "I didn't write TBC. I don't know anyone called TBC."),
    L('jensen', 'Marge, he has a letter.'),
    L('marge', 'I have a clipboard. In my building the clipboard is the law. Left. Left!'),
    L('jensen', 'Copy!', { overlap: true }),
    L('jensen', 'How do you know the side streets?'),
    L('marge', "Nineteen keynotes. I've been chased by a lot of suits, mostly about invoices."),
    L('marge', 'Did you eat anything he bought you?'),
    L('jensen', 'One pancake. A Board pancake.'),
    L('marge', 'You took food from the man who robbed you.'),
    L('jensen', 'It was ninety-one percent a very good pancake, and the other nine percent was guilt.'),
    L('marge', "Don't benchmark the enemy's pancakes."),
  ],
  extra: [[L('marge', 'Is the jacket okay?'), L('jensen', 'The jacket is fine.'), L('marge', 'Say it like you mean it.'), L('jensen', 'The jacket is having the best day of its life.')]],
  wrap: [L('marge', 'Talk to me. Did you lose them?'), L('jensen', "They're stuck behind a bus. I think they're filling out a form about it."),
    L('marge', 'Good. Three hours to my four o\'clock. Breathe in the car, not on the jacket.')] };

const M3 = { id: 'BT-3', title: 'Booth Three', vehicle: 'roadster', start: '@station', time: 'midday', card: 'slam', verbs: ['drive', 'escape'],
  stakes: 'The napkin says booth three. Sit facing the door.', passLine: 'He wants your stage. He has a letter. You have a clipboard.',
  steps: [
    { type: 'transition', kicker: '12:41 PM', text: 'THE CORNER DINER' },
    { type: 'drive', to: '@diner', objective: 'Get to the corner diner. Booth three.', during: [N1] },
    { type: 'walk', to: '@diner', leaveCar: true, objective: 'Booth three' },
    B1, BC, B2,
    { type: 'pursuit', kind: 'crew', name: "the Board's Directors", level: 2, goal: 'lose', loseDist: 220, objective: 'Lose the Directors.', during: [M2C] },
  ] };

// ── Mission 4: Dome Light ──
const LO1 = { type: 'call', who: 'lola', ring: 6, lines: [
  L('lola', 'You owe me a cooler.'),
  L('jensen', "An intern's bringing it back. With a tip."),
  L('lola', "An intern's bringing my cooler?"),
  L('jensen', 'He was very polite. He wants a reference.'),
  L('lola', 'From you or from me?'),
  L('jensen', '...Probably both by now.'),
  L('lola', 'The vest kids came back. Sixty coffees, to a van behind the science museum. Who orders sixty coffees to a van?'),
  L('jensen', 'Somebody with sixty interns and one laptop. What did they say?'),
  L('lola', '"We\'re putting the number up at two-thirty." Said it like I should be impressed. I charged him for sixty-one. Go.'),
  L('jensen', 'Lola, if this works, the more you buy...', { cut: 0.8 }),
  L('lola', "Don't finish it.", { overlap: true }),
] };

// Wesley's feed is blurred on purpose: he is hiding that he left the line, and Jensen catches it.
const W2 = { type: 'call', who: 'wesley', auto: true, inCar: true, video: { office: 'lot', blur: true },
  lines: [
    L('wesley', "Okay don't be mad, but I left the line, and Pruitt's holding my spot lying down in it full length, which is very legal."),
    L('jensen', 'Wesley, why is there a dome behind your blur?'),
    L('wesley', "That's not a dome, that's a very round building I'm standing near, for content!"),
    L('jensen', "You're at the science museum."),
    L('wesley', "Chat said Cobalt guys were carrying coffees to a van back here, so I followed them, and the vest guy's in the van going 'come on, come on' at a laptop!"),
    L('jensen', 'Wesley, never follow men with coffees, never stream a crime, and never...', { cut: 0.75 }),
    L('wesley', 'Already streaming!', { overlap: true }),
    L('jensen', 'Can you see a little silver box? Warm. Probably sitting on a cooler.'),
    L('wesley', 'No box! Just a laptop, and a sticky note that says "THE NUMBER," and a cable to the big outdoor screen, and an upload bar, and it\'s moving!'),
    L('jensen', "So he hasn't got the chip. He's got our number, and he's putting it on his screen."),
    L('wesley', 'Chat is losing it, Chat says "is this a heist," is this a heist?'),
    L('jensen', "It's a product recovery."),
    L('wesley', "Chat says that's exactly what a heist would say."),
    L('wesley', "Chat's like four thousand people and one of them is my aunt Deb, so it's mostly Deb being sharp."),
  ],
  extra: [
    [L('wesley', "The upload bar's at sixty percent and the vest guy's doing a little dance."), L('jensen', 'Is it a good dance?'),
      L('wesley', "It's a vest dance, elbows only, and the rest of him looks scared of the elbows.")],
    [L('wesley', "Somebody's looking at me, a big guy in a blue vest holding a muffin like it's a weapon."), L('jensen', 'Act natural.'),
      L('wesley', "I'm streaming behind the recycling bins with a ring light!"), L('jensen', 'Then act unnatural, very confidently.'),
      L('wesley', '...He waved. He waved at Chat. Chat adores him now.')],
  ],
  wrap: [L('wesley', "I see the green car on the cam! Hi! Okay there's two interns, one by the coffee and one on the van."), L('jensen', 'Stay where you are.'),
    L('wesley', "Chat says go round the back of the van. Chat's been here on a field trip.")] };

// The cable pull froze Dex's stream: X1 opens on his frozen picture; he switches to his phone (unfreeze).
const X1 = { type: 'vcall', id: 'x1', title: 'COBALT C1: LIVE UPLOAD', time: 'golden', people: [
  { who: 'dex', office: 'van', sub: 'Cobalt Circuitry · the van' },
  { who: P, office: 'lot', label: 'Jensen', sub: 'behind the van', blur: true, cam: 'low' },
  { who: 'wesley', office: 'lot', sub: 'behind the recycling bins', blur: true, cam: 'low' },
  { who: 'intern-a', office: 'lot', sub: 'Cobalt · unpaid · the lot', blur: true, cam: 'low', late: true },
  { who: 'intern-b', office: 'lot', sub: 'Cobalt · unpaid · the lot', blur: true, cam: 'low', late: true }],
  lines: [
    Ev('freeze', 'dex'),
    V('dex', 'No no no no, not now, it was at ninety-four percent!'),
    V(P, "Dex. You're frozen. Step away from the van."),
    V('dex', "The van's frozen, you froze the... okay, I'm switching to my phone, nobody look at my phone."),
    Ev('unfreeze', 'dex'),
    V('dex', "That's a public screen, man, you can't just... it belongs to everyone!"),
    V(P, "I just did. Where's the chip?"),
    V('dex', "Okay. Okay okay okay. Radical honesty. It's not here. He gave it to me for ten seconds, which was enough for one number."),
    V(P, 'And then?'),
    V('dex', "And then a suit took it back in a velvet bag, and I've got one number, and it's so big I can't show my engineers."),
    V('wesley', "Chat says what's the number?"),
    V(P, 'Nobody says the number.'),
    V('dex', 'Nobody says the number.', { overlap: true }),
    V(P, 'Why are you helping him, Dex?'),
    V('dex', "He said I'd get the warm-up, five minutes, before you, on the big screen, in front of people who aren't at a wedding."),
    V(P, "Did he buy you something first? Something small, so you'd owe him?"),
    V('dex', '...A muffin. A really good muffin.', { pre: 0.4 }),
    V(P, "He bought my booth's pancakes, Dex. He's not giving you five minutes. You're getting the lobby."),
    V('dex', '...How would you know that? He even sent me the spot for the van. A pin, with a little gavel on it.', { pre: 0.4 }),
    V(P, 'He buys you something small, then he gives you an address. He does it to everyone.'),
    V('dex', "That's... I'm going to... pivot. I'm pivoting out of this conversation, physically. Guys? Guys!"),
    V(P, 'Dex, wait, you still have a...', { cut: 0.6 }),
    Ev('join', 'intern-a'), Ev('join', 'intern-b'),
    V('intern-a', 'We brought the sixty coffees!'),
    V('intern-b', 'Sixty-one!', { overlap: true }),
    V('dex', 'Not now! Somebody hold the van door, gently, he\'s a legend!'),
    Ev('drop', 'dex'),
    V('intern-a', 'Sir? Is now a good time for that reference?'),
  ] };

const M4 = { id: 'DL-4', title: 'Dome Light', vehicle: 'roadster', start: '@santa-clara', time: 'golden', card: 'slam', verbs: ['drive', 'sneak', 'carry'],
  stakes: "At 2:30 Dex puts Greenlight's number up as his own.", passLine: 'One number, no chip. A velvet bag went the other way.',
  steps: [
    { type: 'transition', kicker: '2:15 PM', text: 'THE SCIENCE MUSEUM' },
    LO1,
    { type: 'timer', name: 'upload', seconds: 300, label: 'UPLOAD', fail: 'hard', why: 'The upload finished. Cobalt just announced your number as theirs.' },
    { type: 'drive', to: '@museum-lot', objective: 'Get to the lot behind the science museum', during: [W2] },
    { type: 'car', name: 'dexvan', car: 'van', color: '#2F5FD0', at: '@museum-van' },
    { type: 'npc', who: 'dex', at: '@museum-van' },
    { type: 'npc', who: 'wesley', at: '@museum-lot' },
    { type: 'stealth', mode: 'walk', to: '@museum-van', objective: 'Slip past the interns to the van.',
      units: [{ '@': 'museum-lot', kind: 'scout', roam: 20, name: 'The intern with the coffee tray' }, { '@': 'museum-van', kind: 'scout', radius: 25, name: 'The intern on the van' }],
      onDetect: { set: { label: 'Spotted: they lock the van', flags: { spotted4: true } } },
      during: [SAYAT(3, 'intern-a', "Did someone order sixty-one coffees? Who's the sixty-first for?"), SAYAT(12, 'wesley', "Pssst. I'm behind the recycling bins. Don't look at the ring light.", { how: 'hushed' })] },
    { type: 'search', at: '@museum-van', label: 'pull the cable', prop: 'van', secs: 2.5 },
    { type: 'timer', name: 'upload', stop: true },
    X1,
    // the ride: Wesley tries to confess (the cone) and Jensen talks over him; then the midpoint: Jensen makes a plan
    { type: 'passenger', who: 'wesley', from: '@museum-lot', to: '@arena-line', seat: 'front', limit: 45, limitSecs: 6, fail: 'soft', warn: 'Wesley: Chat says we\'re speeding and Chat gets carsick!',
      objective: 'Drive Wesley back to the fan line, under 45.', pickObjective: 'Pick up Wesley.',
      during: [SAYAT(4, 'wesley', "I'm in the car. I'm in the car. Chat, I'm in the actual car, and it smells like leather and confidence."),
        SAYAT(11, 'wesley', 'Can I ask you something? Hypothetically. If a fan sold a thing you signed, to a collector, for like, rent...'),
        SAYAT(18, 'jensen', "Wesley, I've signed your phone, your hoodie, your skateboard and something in your driveway."),
        SAYAT(26, 'wesley', "My aunt Deb's car! She won't wash it, it's been three years, and birds avoid it out of respect."),
        SAYAT(34, 'jensen', 'Wesley, new job. Whatever he tells me next, he wants me looking at it, so you look at the arena: the dock, the back lot, every car.'),
        SAYAT(44, 'wesley', "From the fan line? I can see the whole dock from the fan line! I'm your EYES!")] },
    { type: 'dm', from: 'board', text: "Your rival says you touched his van. Rude. My Directors are bringing a case to the convention hall dock. Don't come. Regards, the Board.", secs: 8 },
    say('jensen', "'Don't come.' He gave me the address. He gives everyone the address."),
    say('jensen', 'So we go. On purpose, this time.'),
  ] };

// ── Mission 5: Signed, Sealed ──
const M3C = { type: 'call', who: 'marge', ring: 6, lines: [
  L('marge', 'Sound check\'s done. The screen did the sunrise and a man in the third row cried.'),
  L('jensen', 'A fan?', { overlap: true }),
  L('marge', 'A rigger. A sandbag fell on his lunch. Listen: somebody booked the convention hall loading dock an hour ago, "a delivery for the Board."'),
  L('jensen', "That's two blocks from the arena."),
  L('marge', "That's a staging point. You stage a thing next to a stage when you want it on the stage."),
  L('jensen', "It's five past four, Marge. You said four."),
  L('marge', "I know what I said. ...I haven't called it. Go get the delivery before I remember how to.", { pre: 0.5 }),
] };

const LO2 = { type: 'call', who: 'lola', auto: true, inCar: true, video: { office: 'truck' },
  lines: [
    L('lola', 'The suits were at my window. A whole tray of black coffees, to go, to the convention hall, and they voted on the lids.'),
    L('jensen', "I know. I'm on my way there."),
    L('lola', 'You know? Then why did I call?'),
    L('jensen', 'Because you were worried.'),
    L('lola', "I don't worry. Worry costs extra."),
    L('lola', 'Marge called me. No garlic for you before the keynote.'),
    L('jensen', 'One clove. Spiritually, garlic is a vegetable.'),
    L('lola', "Spiritually. That's new. Last year your jacket smelled like my truck for a month, and a dog followed you onto the stage."),
    L('jensen', "...So that's where the dog came from.", { pre: 0.4 }),
    L('lola', 'What dog?'),
    L('jensen', 'The dog in the story! He\'s been in the story all week, and nobody believed me.'),
    L('lola', 'Nobody believes you because you tell it a different way every time.'),
    L('jensen', 'Every version is true, Lola. Let me show you why. The rain, the friends, and the...', { cut: 0.8 }),
    L('lola', 'Here we go.', { overlap: true }),
    L('lola', 'You want my secret? Eleven years, one burner, and a sign I painted on an old door that said "open." That\'s all it said.'),
    L('jensen', 'No screen, no fog, no countdown. Just "open."'),
    L('lola', "I never tell people it's the best. I let them tell me.", { pre: 0.5 }),
    L('jensen', "...That's a very pointed secret."),
    L('lola', "It's a very pointed truck."),
  ],
  extra: [
    [L('lola', 'You named that thing wrong, you know, and that\'s bad luck. Who names a computer after lunch?'),
      L('jensen', 'Brisket is a perfect name, and let me show you why...', { cut: 0.85 }), L('lola', 'Here we go.', { overlap: true }),
      L('jensen', "Bark, fat, meat. Heat, time, patience. Layers that only work because of what's under them. That's honestly how a chip works."),
      L('lola', 'Is it?'), L('jensen', "Roughly. Spiritually. Don't tell an engineer.")],
    [L('lola', 'The fan line goes round the arena twice. I can see it from my window.'), L('jensen', 'Twice?'),
      L('lola', "There's a man on the ground selling spots in it, twenty bucks a spot. Who pays that?"), L('jensen', "That's a secondary market."),
      L('lola', "That's a guy named Pruitt lying down. He's got a little umbrella now.")],
    [L('lola', 'Say it. You want to say it.'), L('jensen', "I don't."), L('lola', 'You want to say it so bad your hands are sweating on the wheel.'),
      L('jensen', '...The more you buy...', { cut: 0.9 }), L('lola', 'There it is.', { overlap: true }), L('jensen', "I didn't finish it. It doesn't count."), L('lola', 'It counts. It always counts.')],
  ],
  wrap: [L('lola', 'Go get your sandwich.'), L('jensen', 'Chip.'), L('lola', 'Sandwich.', { how: 'tease' })] };

// The Directors don't walk up: their black cars hold the dock and they join Jensen's call to read a statement,
// raising a hand before each line, because procedure.
const S1 = { type: 'vcall', id: 's1', title: 'Delivery for the Board', time: 'golden', people: [
  { who: P, office: 'lot', label: 'Jensen', sub: 'the convention hall dock', blur: true, cam: 'low' },
  { who: 'director-a', office: 'car', sub: 'the black cars, outside', blur: true, late: true },
  { who: 'director-b', office: 'car', sub: 'the black cars, outside', blur: true, late: true }],
  lines: [
    V(P, 'Velvet, very soft, and warm. Okay. Okay. ...Why is it shaped like a cone?'),
    Ev('share', P, { slide: { title: 'THE CASE', lines: ['A velvet bag. Warm. Shaped wrong.', 'Inside: a traffic cone.', "In marker: 'To Wesley. Love, Jensen.'"] } }),
    V(P, '"To Wesley. Love, Jensen." I signed this. Last year. I signed this exact cone.'),
    Ev('unshare', P),
    V(P, 'He knew I would come. ...Good. I knew he knew.', { pre: 0.4 }),
    Ev('join', 'director-a'), Ev('join', 'director-b'),
    Ev('hand', 'director-a'),
    V(P, '...Yes? You, in the black car.'),
    V('director-a', 'Mr. Jensen, we have a prepared statement. The Board sends his regards, and his Directors.'),
    V(P, 'How many of you are there?'),
    V('director-a', 'Eleven. We have quorum.'),
    Ev('hand', 'director-b'),
    V('director-b', 'Seconded.'),
    V(P, "He sent you a cone and told you it was a chip. Doesn't that bother you?"),
    V('director-a', 'Motion to not be bothered.'),
    V('director-b', 'Seconded.', { overlap: true }),
    V(P, "I'm keeping the cone, I'm keeping the velvet, and I'm keeping...", { cut: 0.75 }),
    Ev('hand', 'director-a'),
    V('director-a', 'Motion to retrieve the cone.'),
    V('director-b', 'Seconded.', { overlap: true }),
  ] };

// The Board is annoyed, for once: Jensen didn't sit down on the curb. The chair (A's M1 plant) and the parking lot
// slip out. Plot order matters: W3 rings at 50 s and puts this call on hold.
const BD1 = { type: 'call', who: 'board', auto: true, inCar: true, at: 3, video: { office: 'study' },
  lines: [
    L('board', 'Jensen. You opened my cone.'),
    L('jensen', "It's not your cone. It's Wesley's cone."),
    L('board', "I bought it, and whatever I buy becomes mine, which is the only rule I've ever really understood."),
    L('jensen', 'Then why do you sound annoyed?'),
    L('board', 'People open the cone and sit down on the curb, Jensen. You got back in your car.'),
    L('jensen', "Where's Brisket?"),
    L('board', "Somewhere a vest can't benchmark it. You frightened Dex, by the way; he's in a parking garage, pivoting in small circles."),
    L('jensen', 'You were never giving him the warm-up.'),
    L('board', "I give everyone a warm-up, and then I give them a lobby. It's a very nice lobby. There's a ficus."),
    L('jensen', 'And what do you give yourself?'),
    L('board', 'A chair. A tasteful one, in mahogany, already on your stage, that swivels toward the money.'),
    L('jensen', "...That was you. The chair in my dock this morning.", { pre: 0.4 }),
    L('board', "You sat on a stool and didn't look twice. Big fan.", { how: 'smug' }),
    L('jensen', 'So you have my stage, my line, and my...', { cut: 0.8 }),
    L('board', 'Our chip.', { overlap: true }),
    L('board', "And I'm renaming it. \"Brisket\" sounds edible. The Mahogany One."),
    L('jensen', 'It sounds like a dresser.'),
    L('board', 'A dresser that could buy a hotel.'),
    L('jensen', 'Why my stage? You could buy any stage in California.'),
    L('board', "Because twenty thousand people will stand up when your chip comes out, and I'd like to be the one holding it when they do.", { pre: 0.4 }),
    L('jensen', 'And back in New York?'),
    L('board', "In New York they booed me in a parking lot, which is a very particular sound. I'd like, once, to be applauded indoors."),
    L('jensen', "That's... that's almost sad.", { how: 'warm' }),
    L('board', "Don't. Don't be warm at me while my Directors are gaining."),
    L('jensen', 'Let me show you something. Your Directors are on a freeway, in a convoy, voting on lanes. Four cars, eleven men, one motion.'),
    L('board', "They're very fast voters."),
    L('jensen', 'They seconded a lane change. I watched it happen.'),
    L('board', 'Sign the letter, Jensen, and they turn around. The more you sign...', { cut: 0.85 }),
    L('jensen', "Don't!", { overlap: true }),
    L('board', "You can't stop me saying it. I have the mug now."),
  ],
  extra: [
    [L('board', 'Do you know what a chairman does, Jensen?'), L('jensen', 'Sits?'),
      L('board', "Sits higher. That's the whole job: a taller chair, and someone else's applause."), L('jensen', "That's two jobs."), L('board', "Not if you're doing it right.")],
  ],
  wrap: [L('board', "Eleven Directors, lost to a bus lane. I'll be raising this at the next meeting."), L('jensen', "When's the next meeting?"),
    L('board', "Seven o'clock. Your stage. Bring the cone.")],
  hold: { pause: [L('board', "Take your call. I'll wait. I'm very good at waiting for people to fold.")],
    resume: [L('board', 'Back? Was that a fan? How quaint. Where was I. Ah, yes: threatening you.')] } };

// Wesley's confession (the car, "hypothetically") and his new job paying off: the grey SUV, set up for M6.
const W3 = { type: 'call', who: 'wesley', interrupts: true, inCar: true, at: 50, video: { office: 'green', blur: true },
  lines: [
    L('wesley', 'Hi. Hi. Before you say anything, I know, I know, I know.'),
    L('jensen', 'You sold my cone.'),
    L('wesley', 'A guy in a suit offered me a thousand dollars and said he was a collector and he had a velvet bag, and collectors have velvet bags!'),
    L('wesley', 'I tried to tell you in the car! Hypothetically!'),
    L('jensen', '...You did. I signed a door instead.', { pre: 0.5 }),
    L('wesley', "I'm the worst fan, I'm a bad fan, and Chat is being so mean to me right now."),
    L('jensen', "Hey. Hey. You're not a bad fan.", { how: 'warm', pre: 0.6 }),
    L('wesley', "I'm not?"),
    L('jensen', "You're the only fan I've ever called back while eleven men chased me down a freeway."),
    L('wesley', 'Eleven?', { overlap: true }),
    L('jensen', 'They have quorum.'),
    L('wesley', "But I did the job! I'm watching the dock like you said, and the cone guy, the collector, just got into a grey SUV behind the arena!"),
    L('jensen', 'Wesley, which way did it...', { cut: 0.7 }),
    L('wesley', "I'm gonna fix it so hard!"),
  ] };

const M5 = { id: 'SS-5', title: 'Signed, Sealed', vehicle: 'roadster', start: '@arena-line', time: 'golden', card: 'slam', verbs: ['drive', 'escape'],
  stakes: "A delivery for the Board, two blocks from the arena.", passLine: 'A decoy cone, eleven Directors, and a grey SUV.',
  steps: [
    { type: 'transition', kicker: '4:05 PM', text: 'THE CONVENTION HALL' },
    M3C,
    { type: 'drive', to: '@convention-dock', objective: 'Get to the convention hall dock', during: [LO2] },
    { type: 'roadblock', at: '@convention-dock', kind: 'crew', cars: 2, crew: 2, ram: true, ramSpeed: 12, text: "Directors' cars", to: '@convention-dock', objective: 'Get past the black cars.' },
    { type: 'search', at: '@convention-dock', label: 'open the case', prop: 'case', secs: 2 },
    S1,
    { type: 'drive', to: '@viaduct', objective: 'Get up on the 280.' },
    { type: 'pursuit', kind: 'crew', name: "the Board's Directors", level: 3, goal: 'lose', loseDist: 240, objective: 'Lose the Directors on the freeway.', during: [BD1, W3] },
  ] };


// ── Mission 6: Take Private ──
const N2 = { type: 'call', who: 'nico', auto: true, inCar: true, video: { office: 'truck' },
  lines: [
    L('nico', "Boss, I'm in Lola's truck watching the kid's stream. Grey SUV, northbound on the 87, signal on, doing thirty. You on him?"),
    L('jensen', "I'm on him. Not too close."),
    L('nico', "Not too close is the whole art. You tail a guy like you're dating his cousin, interested but not weird."),
    L('jensen', "That's a terrible analogy."),
    L('nico', "Twenty years tailing guys, every analogy's terrible, and they all work."),
    L('jensen', 'He pulled over again. Nico, why does he keep pulling over?'),
    L('nico', "Board guys can't turn without a vote, so they stop, they vote, they turn, and you'll catch them at the first big lawn, 'cause a lawn's where you hold a meeting."),
    L('jensen', 'The rose garden.'),
    L('nico', 'In New York I watched eleven of them hold a meeting in a rowboat, and nobody steered, and they went in circles for an hour and voted it a success.'),
    L('jensen', "Nico. Why'd you really leave New York?"),
    L('nico', 'Honest? The kid with the laptop. Watching him get his name back... it made me want a new one.', { pre: 0.6 }),
    L('jensen', 'A new name?'),
    L('nico', 'A new everything. Sun. Brisket. A boss who says please.'),
    L('jensen', 'I say please!', { overlap: true }),
    L('nico', 'You say "please welcome." It\'s different.'),
    L('jensen', '...Please welcome, to the Greenlight family: Nico. The car guy. Pothole namer. Out-of-eleven guy.', { cut: 0.85 }),
    L('nico', "See, that's nice. That's a nine."),
    L('jensen', 'Out of eleven?'),
    L('nico', "Don't push it."),
  ],
  wrap: [L('nico', "That's the garden. All four of them on the lawn with a flip chart, voting where to stand."), L('jensen', 'Where do I park?'),
    L('nico', "Somewhere they'll ticket you. It's more dramatic.")],
  react: {
    tooClose: [L('nico', "Back off, you're in his mirror like a bad tattoo."), L('nico', "Too close! You're a lime in his mirror, boss!")],
    lost: [L('nico', "Where'd he go? Find a lawn, boss. They'll be voting on it."), L('nico', 'Lost him? Look for the only car with its signal on.')],
  } };

const M4C = { type: 'call', who: 'marge', ring: 4, lines: [
  L('marge', 'They took my headset.'),
  L('jensen', 'Marge? Who took your...', { cut: 0.6 }),
  L('marge', 'Eleven men in suits walked into my building and took my headset off my head. Nobody touches the headset, Jensen. NOBODY.', { how: 'angry' }),
  L('jensen', 'Are you okay?'),
  L('marge', "I'm in the dock office next to a mop. They locked the stage doors, and the Board is in your green room eating our board's fruit."),
  L('jensen', "Marge. I've got Brisket."),
  L('marge', '...You do?', { pre: 0.5 }),
  L('jensen', "It's in Lola's cooler, a little dusty, very happy to see me."),
  L('marge', 'Good. Then here\'s the rest. The "furniture, executive" is centre stage, and TBC has a name now. It\'s his.'),
  L('jensen', 'He just left me a voicemail. He never wanted the chip. He wanted me out of the building.', { how: 'hesitant' }),
  L('marge', 'It worked.', { overlap: true, how: 'deadpan' }),
  L('marge', 'T-minus twenty-two. Doors are open, the fans are in, and our stage belongs to a man with a swivel chair.'),
  L('jensen', 'How do I get in?'),
  L('marge', "You don't get in. You get delivered. Lola's truck has a dock pass, so stay behind Lola."),
  L('jensen', 'Marge. I should have looked at the chair.', { pre: 0.6 }),
  L('marge', 'Yes. ...Get delivered.', { pre: 0.4 }),
] };

const M6 = { id: 'TP-6', title: 'Take Private', vehicle: 'roadster', start: '@viaduct', time: 'golden', card: 'slam', verbs: ['drive', 'tail', 'fight', 'escape', 'carry'],
  stakes: "Wesley's watching the docks. The cone guy's grey SUV keeps stopping to vote.", passLine: 'Brisket is back. The stage is not.',
  steps: [
    { type: 'transition', kicker: '5:20 PM', text: 'THE STACK' },
    { type: 'voicenote', who: 'wesley', secs: 12, text: "Grey SUV, the cone guy's, off the stack and up the 87, and they keep pulling over to vote, so they're slow! I'm your EYES! Chat says go!" },
    { type: 'tail', name: 'the grey SUV', car: 'suv', color: '#6E7378', route: ['@stack', '@north-87', '@rose-garden'], ahead: 70, speed: 12, objective: "Tail the grey SUV to the Board's offsite.", during: [N2] },
    { type: 'npc', who: 'wesley', at: '@rose-garden' },
    { type: 'fight', enemies: ['director-a', 'director-a', 'director-b', 'director-b'], arena: '@rose-lawn', win: 'ko-all', rules: 'full', hp: 120, timer: 120, objective: 'Break up the board meeting.',
      during: [SAYAT(2, 'director-a', 'Motion to restrain!'), SAYAT(4, 'director-b', 'Seconded.'), SAYAT(6, 'jensen', 'Motion denied!'),
        SAYAT(16, 'director-a', 'All in favour of hitting him?'),
        SAYAT(26, 'director-a', 'Watch the jacket! The Board wants the jacket!'),
        SAYAT(34, 'jensen', 'Nobody gets the jacket. The jacket has a call time.')] },
    say('jensen', "There you are. Warm, a little dusty, and you've had a very big day.", { pre: 0.6 }),
    say('jensen', 'Wesley. You hold it. Like a baby bird.', { how: 'warm' }),
    say('wesley', "You're giving me Brisket? Chat. CHAT. I'm holding a baby bird!", { wait: false }),
    { type: 'passenger', who: 'wesley', board: true, seat: 'front', secs: 2 },
    { type: 'comfort', who: 'wesley', label: 'BRISKET HEAT', start: 1, refill: 0.05, fail: 'soft', drain: { bump: 0.25, hit: 0.35, lateral: 0.15, brake: 0.1 },
      why: "Brisket overheated in Wesley's hands. It still works, but it's very upset.",
      lines: [{ below: 0.8, who: 'wesley', text: "It's getting warm. It's getting so warm. Is it supposed to be this warm?" },
        { below: 0.6, who: 'jensen', text: 'Hold it level, Wesley. Like a cake. Like a very expensive cake.' },
        { below: 0.4, who: 'wesley', text: "It's beeping! Does it beep? Chat says it's never beeped before!" },
        { below: 0.2, who: 'jensen', text: "Lola's cooler. We need Lola's cooler. Don't let go." }] },
    { type: 'pursuit', kind: 'crew', name: "the Board's Directors", level: 3, goal: 'reach', to: '@market', radius: 12, objective: "Get Brisket to Lola's cooler.",
      during: [SAYAT(6, 'wesley', "There's four black cars behind us and they're all signalling. Who signals in a chase?")] },
    say('lola', 'Give it here. Cooler. Blue one. That costs extra, and so does the ice.', { wait: true }),
    say('jensen', 'Wesley. Good eyes.', { how: 'warm' }),
    say('wesley', "Good EYES. Okay. I'm going back to the line, Pruitt's been lying there since four.", { wait: false }),
    { type: 'passenger', who: 'wesley', board: false },
    { type: 'voicemail', who: 'board', secs: 12, text: 'Congratulations on the chip. Keep it; you were never going to reach the stand with it. Men chase what they love, Jensen. I find that very convenient. My Directors have your building. Regards.' },
    M4C,
    { type: 'actEnd', title: 'QUORUM', stats: [{ label: 'Directors', value: 'outvoted, for now' }, { label: 'Brisket', value: 'in a cooler' }],
      cliff: { kicker: 'T-MINUS 22', text: 'THE BOARD HAS THE BUILDING', sub: 'The chair, the run of show, the dock. And the headset.' } },
  ] };

// ── Mission 7: Fan Line ──
const LO3 = { type: 'call', who: 'lola', auto: true, inCar: true, at: 2, video: { office: 'car' },
  lines: [
    L('lola', "Stay behind me. Don't pass me. Nobody passes the truck."),
    L('jensen', 'Copy.'),
    L('lola', 'Don\'t "copy" me. Am I Marge?'),
    L('lola', 'Better. At the dock I say "catering," and you say nothing, because you\'re a busboy.'),
    L('jensen', "Lola, I'm wearing the jacket. Everyone in the world knows the jacket."),
    L('lola', 'So take it off.'),
    L('jensen', '...No.'),
    L('lola', "Then you're a busboy in a jacket. It's San Jose. Who looks twice?"),
    L('jensen', 'Lola. About March.', { pre: 0.5 }),
    L('lola', 'Learning quarter.', { overlap: true, how: 'deadpan' }),
    L('jensen', "I've been telling people I didn't forget I booked you."),
    L('lola', 'You forgot.'),
    L('jensen', 'I forgot.', { pre: 0.4 }),
    L('jensen', "I'd book you again. Every March."),
    L('lola', 'Every March costs extra.'),
    L('jensen', 'Then I\'ll pay extra, and I\'ll sign the check "love."'),
    L('lola', 'I know you will. You sign everything "love." It\'s the one thing about you I\'d never change.', { pre: 0.6 }),
    L('jensen', 'Lola. The more you buy...', { cut: 0.8 }),
    L('lola', "Don't finish it.", { overlap: true }),
  ],
  wrap: [L('lola', 'Dock\'s blocked. Black cars. You shove, I yell.'), L('jensen', 'What do you yell?'), L('lola', '"Catering!" It opens every door in this city.')],
  hold: { pause: [L('lola', "Who's calling you in a convoy? Take it. Stay behind me.")], resume: [L('lola', 'You done? Good. Still behind me? Good.')] } };

const W4 = { type: 'call', who: 'wesley', interrupts: true, inCar: true, at: 45, video: { office: 'house', blur: true },
  lines: [
    L('wesley', "I'm in! Row one! There's twenty thousand people in here, and like nine thousand of them watch me!"),
    L('jensen', 'Nine thousand?'),
    L('wesley', "It's a lot of guys named Kyle. Here's the plan: when the Board walks out, nobody claps, not one clap, total silence."),
    L('jensen', 'Twenty thousand people, silent?'),
    L('wesley', 'Chat\'s calling it "the quiet launch," and Pruitt\'s handing out signs that just say "no," lowercase, because it\'s more hurtful.'),
    L('jensen', "That's... honestly brilliant."),
    L('wesley', 'You think I\'m brilliant?', { overlap: true }),
    L('jensen', "I think you're a good fan, Wesley. I think you're a good... I think you're good.", { how: 'warm', pre: 0.5 }),
    L('wesley', 'Can I put that on a shirt?'),
    L('jensen', 'You can put it on a shirt.'),
    L('wesley', 'Chat! He said I can put it on a shirt!'),
  ] };

const A1 = { type: 'vcall', id: 'a1', title: 'Dock Door', time: 'golden', people: [
  { who: 'marge', office: 'backstage', sub: 'headset: a spare, no channel' },
  { who: P, office: 'truck', label: 'Jensen', sub: "Lola's truck · in the back", cam: 'low' },
  { who: 'lola', office: 'lot', sub: 'the dock door · "catering"', blur: true, cam: 'low' },
  { who: 'dex', office: 'van', sub: 'Cobalt · the van, pivoting', late: true, blur: true }],
  lines: [
    V('marge', "You're late."),
    V(P, "It's six fifty-one."),
    V('marge', "By my standards you're late. By anyone else's, you're a miracle. Don't tell anyone I said that."),
    V('lola', 'I told the suits sixty brisket plates and a busboy. Where do you want them?'),
    V('marge', 'Plates to the green room. Busboy to the stage, through about eleven men.'),
    Ev('join', 'dex'),
    V('dex', "Wait! Wait wait wait! Don't hit me! I'm pivoting!"),
    V(P, 'Which way?', { overlap: true }),
    V('dex', 'Your way! He gave me the lobby, Jensen, the real lobby, a table by the coat check with a sign that says "also."'),
    V(P, '"Also."'),
    V('dex', '"Also: Cobalt." Under a ficus. I\'ve never been so humiliated by a plant.'),
    V('lola', 'You want to help? Grab a tray.'),
    V('dex', "I'll... okay, what I'll do is take the side door. My interns are loyal and emotionally unavailable, which is... it's actually perfect."),
    V(P, 'Dex. Thank you.'),
    V('dex', 'Don\'t thank me. Mention me, in the keynote, once. Like, "Dex: present."'),
    Ev('drop', 'dex'),
    V('marge', 'Walkie. Channel two. You walk out at seven, not seven-oh-one, not seven-nineteen.'),
    V(P, "Seven. Copy. And Marge, I'll get your headset back."),
    V('marge', "You'd better. I can't call a cue into a mop."),
    V(P, 'You could. It would be a very short show.', { cut: 0.7 }),
    V('lola', 'Down. Suits.', { overlap: true, how: 'hushed' }),
  ] };

const M7 = { id: 'FL-7', title: 'Fan Line', vehicle: 'roadster', start: '@market', time: 'twilight', card: 'slam', verbs: ['drive', 'follow', 'fight'],
  stakes: "The Board has the building. Lola's truck has a dock pass. Stay behind Lola.", passLine: 'Through the dock door, with a busboy in a jacket.',
  steps: [
    { type: 'transition', kicker: '6:38 PM', text: 'THE MARKET SQUARE' },
    { type: 'timer', name: 'show', seconds: 480, label: 'DOORS', fail: 'hard', why: 'Seven o\'clock. Mr. Board walked out on your stage.' },
    { type: 'convoy', route: ['@market', '@santa-clara', '@arena-approach'], lead: 'van', color: '#E8B23A', name: "Lola's truck", who: 'lola', band: [8, 40],
      objective: "Stay behind Lola's truck to the arena.", during: [LO3, W4] },
    { type: 'roadblock', at: '@arena-dock', kind: 'crew', cars: 3, crew: 2, ram: true, to: '@arena-dock', objective: 'Clear the dock.' },
    A1,
    { type: 'fight', enemies: ['director-a', 'director-b', 'director-a'], arena: '@arena-dock', win: 'survive', timer: 50, rules: 'full', objective: 'Hold the dock door.',
      during: [SAYAT(3, 'dex', 'Interns! Synergy! Go!'), SAYAT(12, 'lola', 'Not my trays! Hit him, not my trays!'), SAYAT(22, 'marge', 'Five minutes. Jensen. Five.'),
        SAYAT(32, 'director-a', 'Point of order!'), SAYAT(40, 'jensen', 'Order denied!')] },
    { type: 'timer', name: 'show', stop: true },
  ] };

// ── Mission 8: Showtime ──
// H1: the hijack, as the set-up call. The Board's pre-show runs on the arena screen from Jensen's green room; Jensen's
// calendar joins him to it by itself, on a ninety-metre screen, from the back of Lola's truck.
const H1 = { type: 'vcall', id: 'h1', title: 'GREENLIVE · PRE-SHOW', time: 'night', layout: 'speaker', people: [
  { who: 'board', office: 'greenroom', label: 'Mr. Board', sub: "Jensen's green room" },
  { who: 'marge', office: 'backstage', sub: 'headset: a spare, no channel' },
  { who: 'wesley', office: 'house', sub: 'row one · live', blur: true, cam: 'low' },
  { who: P, office: 'truck', label: 'Jensen', sub: "Lola's truck, the dock", late: true, cam: 'low' }],
  lines: [
    V('board', 'Good evening, San Jose. A short pre-show from the green room, which is mine now. The fruit is excellent.'),
    Ev('share', 'board', { slide: { title: 'THE MAHOGANY ONE', lines: ['Formerly Brisket, which sounded edible', 'On a velvet stand of anticipation', 'Available: never'], big: 'SOLD OUT' } }),
    V('board', 'The Mahogany One. So exclusive that nobody can have it, which is the purest form of demand.'),
    V('wesley', 'Chat. The stand is empty. Chat, the stand is EMPTY.', { how: 'hushed' }),
    V('marge', "He's launching a box of air. I said so at nine this morning.", { how: 'deadpan' }),
    V('board', "Marge. You're not on the run of show, I'm afraid. I've had it reprinted."),
    V('marge', "If I had my headset, you'd be on mute."),
    V('board', 'Then how lucky for us both that a Director of mine is wearing it, and...', { cut: 0.7 }),
    Ev('join', P),
    V('wesley', 'JENSEN JOINED! Twenty thousand people just cheered a notification!', { how: 'shout' }),
    V(P, "Hi. Sorry. It's on my calendar.", { how: 'hushed' }),
    V(P, "And you're in my green room, launching my chip with no chip in it."),
    V('board', 'The chip was never the product. The waiting is the product.', { how: 'smug' }),
    V(P, "Brisket isn't a feeling. It's edible. Spiritually."),
    Ev('unshare', 'board'),
    V('board', 'Then do bring it to the stage door. My Directors would adore a word.', { cut: 0.8 }),
    V('wesley', 'Chat says, totally unrelated, a navy suit looks great by a barrier. On the back lot.'),
    V('board', '...What?'),
    V('wesley', 'Chat stuff.', { overlap: true }),
    V(P, 'Thank you, Chat.'),
    V('marge', 'Four minutes. Go get my voice back.'),
  ] };

// the stage: the arena's stage set room (Mog City wagmi/storyrun/stage-room.js: the LED wall at z -9, the deck to its
// lip at z 0.6, the barrier at z 2.4 with its gap by the front row's mahogany chair at [-1, 3.5], the standing pit from
// z 3.3 and the seats rising behind; the house calm, or up on its feet). Blocking: people on the deck stand about z -2.2
// cheated out to the house (faces toward +z); every camera is placed in the room (at) and written relative to the
// person it is on (rel, in their frame: the engine's camPt), so each line plays over its speaker. Seven people at most.
const STAGE_ROOM = 'stage';
const stage = (people, o = {}) => ({ room: STAGE_ROOM, light: 'night', sign: o.sign || 'GREENLIVE', ...(o.house ? { house: o.house } : {}), people });
const HEAD = 1.62, rad = (d) => (d * Math.PI) / 180, fx = (v) => Math.round(v * 100) / 100;
// a point in the room [x, y, z] as a camera point relative to someone standing at [x, z] facing `face` degrees
const camAt = (who, P, p) => { const h = rad(P.face), dx = p[0] - P.at[0], dz = p[2] - P.at[1]; return { rel: who, right: fx(-Math.cos(h) * dx + Math.sin(h) * dz), up: fx(p[1] - HEAD), fwd: fx(Math.sin(h) * dx + Math.cos(h) * dz) }; };
// a shot of `who` (standing as B[who]) from p, looking at their face (or at `at`, a point in the room, through them)
const shotOn = (B, who, p, o = {}) => ({ cam: camAt(who, B[who], p), look: o.at ? camAt(who, B[who], o.at) : { rel: who }, fov: o.fov || 34, dur: o.dur || 4 });
// a close-up: from `dist` m in front of them, `off` degrees round from their nose (+ to their right), at eye height
const close = (B, who, o = {}) => { const P = B[who], h = rad(P.face + (o.off || 0)), d = o.dist || 1.35; return shotOn(B, who, [P.at[0] + Math.sin(h) * d, HEAD + (o.up ?? 0.04), P.at[1] + Math.cos(h) * d], { fov: o.fov || 33, dur: o.dur }); };
const pp = (who, B, extra = {}) => ({ who, at: B[who].at, face: B[who].face, ...extra });

// where everyone stands (each cutscene's own copy changes a few)
const ST = {
  board: { at: [0, -2.2], face: 0 }, jensen: { at: [-6.6, -3.0], face: 90 }, marge: { at: [-7.7, -3.4], face: 80 },
  wesley: { at: [1.5, 3.5], face: 180 }, lola: { at: [4.5, 4.3], face: 185 }, dex: { at: [-3.6, 4.7], face: 175 },
  'director-b': { at: [5.6, -3.0], face: -90 }, 'director-a': { at: [6.6, -2.7], face: -100 },
};
const TWO = { board: { at: [0.1, -2.2], face: -40 }, jensen: { at: [-1.1, -2.2], face: 40 } };
// (the front row's mahogany chair at [-1, 3.5] facing the stage: sat in, her feet a little behind its middle, the seat's height)
const SEAT_AT = [-1, 3.85], SEAT_Y = 0.56;

// ST1: the quiet launch. The Board's mic dies; Marge has her headset; the jacket's in; Jensen walks on.
const B1s = { ...ST, ...{ board: { at: [0.1, -2.2], face: -40 } }, jensen: { ...ST.jensen } };
const ST1 = { type: 'cutscene', id: 'st1', set: stage([pp('board', ST, { pose: 'talk' }), pp('jensen', ST, { pose: 'idle', hidden: true }), pp('marge', ST, { pose: 'arms' }), pp('wesley', ST, { pose: 'idle' }), pp('lola', ST, { pose: 'arms' }), pp('director-b', ST, { pose: 'idle' })]), shots: [
  // (the house from its back rows: twenty thousand heads, the phones, the beams, the Board alone on the deck)
  { ...shotOn(ST, 'board', [2.6, 5.4, 14.5], { at: [0, 2.6, -4], fov: 48, dur: 5 }), caption: 'THE ARENA · 7:00 PM',
    say: 'board', line: "Good evening, I'm the Board, and I'll be your Jensen tonight. Please hold your applause." },
  { ...close(ST, 'wesley', { off: -15 }), dur: 3.5, caption: 'TWENTY THOUSAND FANS. NOT ONE CLAP.', say: 'wesley', line: 'Nobody clap. Nobody clap.', how: 'hushed' },
  { ...close(ST, 'board', { off: 10, dist: 1.5 }), dur: 4.5, say: 'board', line: '...Thank you for holding it. Forever, apparently.', pre: 0.8 },
  { ...close(ST, 'marge', { off: 20 }), dur: 3, say: 'marge', line: 'Sound, can you hear me? Cut his mic.', how: 'deadpan' },
  { ...close(ST, 'board', { off: -25, dist: 2.4, up: 0.1 }), fov: 38, dur: 2.5, caption: '(HIS MIC IS DEAD)', act: [{ who: 'board', pose: 'argue' }] },
  { ...close(ST, 'marge', { off: 5, dist: 1.2 }), dur: 3.5, say: 'marge', line: "The jacket's in. ...He's coming.", how: 'hushed', pre: 0.4 },
  // (the walk on, from behind him in the wings: the lit deck, the wall, the house beyond)
  { ...shotOn(ST, 'jensen', [-8.9, 1.85, -3.9], { at: [0, 1.6, -1.2], fov: 46, dur: 3.6 }), act: [{ who: 'jensen', hidden: false, walk: { to: TWO.jensen.at, secs: 3.2, then: 'talk' } }, { who: 'board', face: -40, pose: 'idle' }] },
  { ...close(ST, 'wesley', { off: 10, dist: 1.2 }), dur: 2.2, say: 'wesley', line: 'NOW clap! NOW!', how: 'shout', act: [{ who: 'wesley', pose: 'cheer' }] },
  { ...close(B1s, 'board', { off: 15 }), dur: 3, say: 'board', line: "Jensen. You're not on the run of show." },
  { ...close(ST, 'marge', { off: 25 }), dur: 3, say: 'marge', line: 'He is now. I just wrote him in.', how: 'deadpan', act: [{ who: 'jensen', face: 40, pose: 'talk' }] },
  // (the two of them from the front row, both faces: the Board wants the box, Jensen gives the room its name)
  { ...shotOn(TWO, 'board', [-0.5, 1.55, 1.7], { at: [-0.5, 1.45, -2.2], fov: 40, dur: 6 }),
    lines: [L('board', "You brought it. How thoughtful. Hand it here, and I'll thank you by name."), L('jensen', 'Ladies and gentlemen. Brisket.'), L('board', "That's my keynote.")] },
  { ...close(TWO, 'jensen', { off: -10 }), dur: 3.5, say: 'jensen', line: "It's a lovely keynote. You have a lovely chair.", how: 'warm' },
] };

const crowd = (n, extra = {}) => ({ meters: { crowd: { add: n } }, ...extra });
const K1C = { type: 'choice', prompt: 'The room is yours. Open with...', who: 'jensen', timeout: 8, default: 1, options: [
  { text: 'The jacket', set: crowd(20), reply: 'First, a thank-you to the jacket. Twenty years, every keynote, on time. Unlike me.' },
  { text: 'The tents', set: crowd(35), reply: "Somebody here slept in a tent since Tuesday, and somebody slept in a smaller tent inside his tent. This one's for you." },
  { text: 'A benchmark', set: crowd(10), reply: 'Let me show you something. Ninety-one percent of you are standing, the fastest standing ever measured indoors.' }] };

// ST2: the booth story, told true. The Board's mic is dead, so what he says now only Jensen hears.
const B2s = { ...ST, ...TWO };
const B2j = { ...B2s, jensen: { at: TWO.jensen.at, face: 12 } };
const ST2 = { type: 'cutscene', id: 'st2', set: stage([pp('board', B2s, { pose: 'idle' }), pp('jensen', B2s, { pose: 'talk' }), pp('marge', ST, { pose: 'arms' }), pp('wesley', ST, { pose: 'idle' }), pp('lola', ST, { pose: 'arms' }), pp('director-b', ST, { pose: 'idle' })]), shots: [
  // (Lola cuts in from the pit: a deliberate interjection over the Board, the shot is his)
  { ...close(B2s, 'board', { off: -5 }), dur: 4.5,
    lines: [L('board', "Off the record, since I'm off the air: name a price for the room. I'll put the brisket on Mahogany.", { cut: 0.85 }), L('lola', 'Not for sale.', { overlap: true, how: 'deadpan' })] },
  // (to the house, from the pit: the wall behind him)
  { ...shotOn(B2j, 'jensen', [-0.2, 1.45, 1.9], { fov: 40, dur: 5 }), act: [{ who: 'jensen', face: 12, pose: 'talk' }],
    say: 'jensen', line: 'Let me tell you the real story. Booth three, coffee, a napkin, a pen you had to blow on, and no dog.' },
  { ...close(ST, 'lola', { off: -12, dist: 1.3 }), dur: 4, act: [{ who: 'lola', pose: 'argue' }],
    say: 'lola', line: 'There was a dog! He followed you from my truck, and he also eats cookies!', how: 'shout' },
  { ...close(B2j, 'jensen', { off: 8, dist: 1.2 }), dur: 2.5, say: 'jensen', line: '...There was a dog.', pre: 0.4 },
  { ...close(B2j, 'jensen', { off: -8, dist: 1.5 }), dur: 4.5, say: 'jensen', line: 'I drew one square on that napkin. Thirty years, people ask what was in it.' },
  { ...close(ST, 'wesley', { off: 12, dist: 1.15 }), dur: 2.4, say: 'wesley', line: 'What was in it?', how: 'hushed' },
  { ...close(B2j, 'jensen', { off: 4, dist: 1.1 }), dur: 4.5, say: 'jensen', line: "Nothing. It was a room. I just didn't know who'd be in it yet.", how: 'warm', pre: 0.5, act: [{ who: 'jensen', face: 40 }] },
  { ...close(B2s, 'board', { off: -15, dist: 1.25 }), dur: 3, say: 'board', line: 'Is this the part where I lose?', how: 'hushed' },
  { ...close(TWO, 'jensen', { off: -12 }), dur: 4, say: 'jensen', line: 'This is the part where you sign something. You love a signature, and so do I.' },
] };

const K2C = { type: 'choice', prompt: 'What does the Board sign?', who: 'jensen', timeout: 8, default: 0, options: [
  { text: 'His resignation', set: crowd(20), reply: "Your resignation from my board. Point four percent. Sign it 'love'; it's legally a greeting card." },
  { text: "Wesley's cone", set: crowd(15, { flags: { cone: true } }), reply: "Wesley's cone. You paid a thousand dollars for it. Sign it 'sorry,' and he'll sell it for two." },
  { text: 'Give him his applause', set: crowd(30, { flags: { applause: true } }),
    reply: "Ladies and gentlemen, Mr. Board is resigning from our board. He's always wanted a standing ovation indoors. Let's give him one, all the way to the exit." }] };

// ST3A: the Board's exit with the applause he always wanted: the house on its feet (seen from the stage, over the two
// of them), then his face with it (he turns to it), the line, and out. ST3B: a plain exit.
const B3a = { ...ST, board: { at: TWO.board.at, face: 22 }, jensen: TWO.jensen };
const B3b = { ...B3a, board: { at: TWO.board.at, face: 50 } };
// (his walk off: from the pit's edge over the front heads, the deck and the wall, him going stage right)
const exitShot = (B, clip) => ({ ...shotOn(B, 'board', [1.2, 3.1, 6.6], { at: [3.4, 1.5, -2.6], fov: 46, dur: 4.5 }), act: [{ who: 'board', walk: { to: [9.5, -2.6], secs: 5, clip, then: 'idle' } }] });
const ST3A = { type: 'cutscene', id: 'st3a', if: 'applause == true', set: stage([pp('board', B3a, { pose: 'idle' }), pp('jensen', B3a, { pose: 'idle' }), pp('marge', ST, { pose: 'arms' }), pp('wesley', ST, { pose: 'cheer' }), pp('lola', ST, { pose: 'idle' })], { house: 'up' }), shots: [
  { ...shotOn(B3a, 'board', [1.6, 3.4, -7.4], { at: [-0.6, 2.2, 7], fov: 54, dur: 4.5 }), caption: 'TWENTY THOUSAND PEOPLE STAND UP' },
  { ...close(B3a, 'jensen', { off: -10 }), dur: 2.6, say: 'jensen', line: 'Big fan.', how: 'warm' },
  // (his face, turned to the house on its feet: from upstage right, the pit filling the left of the frame behind him)
  { ...shotOn(B3b, 'board', [6.0, 1.8, -4.5], { at: [0, 1.5, 0.5], fov: 44, dur: 3.4 }), act: [{ who: 'board', face: 50 }], say: 'board', line: '...Regards.', pre: 0.5 },
  { ...close(B3b, 'board', { off: -8, dist: 1.4 }), dur: 5, say: 'board', line: "...It's louder than I thought. Is it always this loud?", how: 'hushed', pre: 1.0 },
  { ...close(B3a, 'jensen', { off: 6, dist: 1.25 }), dur: 3, say: 'jensen', line: 'Only indoors.', how: 'warm' },
  exitShot(B3b, 'walk'),
] };
const ST3B = { type: 'cutscene', id: 'st3b', if: 'applause != true', set: stage([pp('board', B2s, { pose: 'idle' }), pp('jensen', B2s, { pose: 'idle' }), pp('marge', ST, { pose: 'arms' }), pp('wesley', ST, { pose: 'idle' }), pp('lola', ST, { pose: 'idle' }), pp('director-b', ST, { pose: 'idle' })]), shots: [
  // (the two of them from the front row, both faces)
  { ...shotOn(TWO, 'board', [-0.5, 1.55, 1.7], { at: [-0.5, 1.45, -2.2], fov: 38, dur: 6 }),
    lines: [L('board', '...Regards.'), L('jensen', 'Close enough.'), L('board', "This isn't over, Jensen. Did you know I'm still on the board of a mattress company?"), L('jensen', 'Get some rest.')] },
  exitShot(TWO, 'walkCool'),
] };

// ST3: everyone gets a piece of the room. The Directors adjourn, Dex is present, Marge sits in the chair.
const B3 = { ...ST, jensen: { at: [-0.6, -2.2], face: 0 }, marge: { at: [-3.4, 0.1], face: 60 }, 'director-a': { at: [5.4, -2.6], face: -110 }, 'director-b': { at: [6.4, -3.0], face: -100 } };
const B3j = { ...B3, jensen: { at: B3.jensen.at, face: -35 } }, B3m = { ...B3, marge: { at: B3.marge.at, face: 180 } }, B3s = { ...B3, marge: { at: SEAT_AT, face: 180 } };
const ST3 = { type: 'cutscene', id: 'st3', set: stage([pp('jensen', B3, { pose: 'talk' }), pp('marge', B3, { pose: 'arms' }), pp('wesley', B3, { pose: 'idle' }), pp('dex', B3, { pose: 'idle' }), pp('director-a', B3, { pose: 'idle' }), pp('director-b', B3, { pose: 'idle' })]), shots: [
  { ...shotOn(B3, 'director-a', [3.9, 1.6, -1.6], { at: [6.0, 1.55, -2.9], fov: 38, dur: 3.5 }),
    lines: [L('director-a', 'Motion to adjourn.'), L('director-b', 'Seconded.', { overlap: true })] },
  { ...close(B3, 'dex', { off: -10, dist: 1.4 }), dur: 3, act: [{ who: 'dex', pose: 'wave' }], say: 'dex', line: 'Dex! Present!', how: 'shout' },
  { ...close(B3, 'jensen', { off: -12, dist: 1.4 }), dur: 3.2, say: 'jensen', line: 'Ladies and gentlemen: Dex. Present.' },
  // (Jensen's three words are off; the shot is Marge's, at the lip with her headset)
  { ...close(B3, 'marge', { off: 15 }), dur: 6, lines: [L('marge', 'Seven-oh-four.'), L('jensen', 'Is that bad?'), L('marge', "It's four minutes late. ...It's the earliest we've ever been.", { how: 'warm', pre: 0.6 })] },
  { ...close(B3j, 'jensen', { off: 10 }), dur: 4.5, act: [{ who: 'jensen', face: -35 }], say: 'jensen', line: "Marge. Front row. Watch one from the seats. I'll call my own cues: sunrise, walk, chip." },
  { ...close(B3, 'marge', { off: 5, dist: 1.25 }), dur: 3, say: 'marge', line: 'The only empty seat is his chair.' },
  { ...close(B3j, 'jensen', { off: -6, dist: 1.2 }), dur: 2.4, say: 'jensen', line: 'It swivels.', how: 'tease' },
  // (down off the lip, through the barrier's gap to the chair, the pit standing behind her)
  // (the lens low on the floor before the lip, in line with the barrier's gap and clear of her way to it: the chair seen
  // through the gap, not over the barrier's top rail, so she is in it to the knees, not a head behind the barrier: 19 Nov)
  // (she comes to the chair from its front with her back to us; the turn and the sit are off the lens: the shot is cut
  // on her way, a beat on Jensen watching her go covers her arrival, and she is seen again sat facing the stage. Held
  // to the end, her body went through the chair's back and turned 180 degrees in a frame, 19 Nov)
  { ...shotOn(B3m, 'marge', [-0.3, 1.3, 1.0], { at: [-1.0, 1.0, 3.6], fov: 46, dur: 3.2 }),
    act: [{ who: 'marge', walk: { to: SEAT_AT, secs: 4.2, then: 'sit' }, face: 180, seat: SEAT_Y }],
    say: 'marge', line: 'Standby, sunrise.', how: 'hushed', pre: 1.2 },
  { ...close(B3, 'jensen', { off: 14, dist: 1.6 }), dur: 1.8 },
  { ...close(B3s, 'marge', { off: -8, dist: 1.3 }), dur: 2.6, caption: 'FRONT ROW, IN THE MAHOGANY CHAIR' },
] };
// ST3W: Wesley's name on the wall (the set's sign is his line, the house's ninety metres of it)
const B3w = { ...ST, jensen: { at: [-0.6, -2.2], face: 8 }, wesley: { at: [1.5, 3.5], face: 190 } };
const ST3W = { type: 'cutscene', id: 'st3w', set: stage([pp('jensen', B3w, { pose: 'talk' }), pp('wesley', B3w, { pose: 'phone', prop: 'phone' }), pp('marge', { marge: { at: SEAT_AT, face: 180 } }, { pose: 'sit', seat: SEAT_Y }), pp('lola', ST, { pose: 'idle' }), pp('dex', ST, { pose: 'idle' })], { sign: 'TO WESLEY TROUT, MY EYES. LOVE, JENSEN' }), shots: [
  { ...close(B3w, 'wesley', { off: -14, dist: 1.2 }), dur: 3.5, say: 'wesley', line: 'Can you... would you... just once more?' },
  // (from the barrier: Jensen on the deck, the wall behind him saying it ninety metres wide)
  { ...shotOn(B3w, 'jensen', [0.1, 1.9, 2.9], { at: [-0.1, 3.2, -6], fov: 54, dur: 5.5 }), say: 'jensen', line: '"To Wesley Trout, my eyes. Love, Jensen." It\'s on the screen.' },
  { ...close(B3w, 'wesley', { off: 10, dist: 1.1 }), dur: 3.5, say: 'wesley', line: 'He knows my LAST name.', how: 'hushed' },
  // (back on Jensen: the frame held while he chooses how to launch it, his line over it: Mog City's runner holds a
  // set's last frame through the choice after it)
  { ...close(B3w, 'jensen', { off: -6, dist: 1.4 }), dur: 1.6 },
] };

const K3C = { type: 'choice', prompt: 'Launch it.', who: 'jensen', timeout: 6, default: 0, options: [
  { text: 'Say the line', set: crowd(15), reply: 'Ladies and gentlemen, the Greenlight Kestrel. We made exactly one. And remember: the more you buy, the more you save!' },
  { text: 'Let them say it', set: crowd(30, { flags: { ovation: true } }), reply: 'Ladies and gentlemen, the Greenlight Kestrel. We made exactly one. And remember...' }] };

// ST4: the line. Let them say it, and twenty thousand people finish it for him (a caption: no crowd voices), and Lola
// sees him do the thing she does; say it, and she groans. Either way, the plate is free.
const B4 = { ...ST, jensen: { at: [-0.6, -2.2], face: 0 }, marge: { at: SEAT_AT, face: 180 } };
const ST4P = (house) => stage([pp('jensen', B4, { pose: 'cheer' }), pp('wesley', B4, { pose: 'cheer' }), pp('lola', B4, { pose: 'idle' }), pp('dex', B4, { pose: 'idle' }), pp('marge', B4, { pose: 'sit', seat: SEAT_Y })], house ? { house } : {});
const ST4A = { type: 'cutscene', id: 'st4a', if: 'ovation == true', set: ST4P('up'), shots: [
  { ...shotOn(B4, 'jensen', [1.4, 3.2, -7.6], { at: [-0.4, 2.2, 7], fov: 54, dur: 5 }), caption: 'TWENTY THOUSAND PEOPLE: "...THE MORE YOU SAVE!"' },
  { ...close(B4, 'lola', { off: -12, dist: 1.3 }), dur: 3.5, say: 'lola', line: '...See? You let them tell you.', how: 'warm', pre: 0.6 },
  // (his close in his talk, not the house's cheer: the cheer's bounce took his head out of a 33-degree close, 19 Nov)
  { ...close(B4, 'jensen', { off: 8, dist: 1.3 }), dur: 2.6, act: [{ who: 'jensen', pose: 'talk' }], say: 'jensen', line: 'I let them tell me.' },
  { ...close(B4, 'lola', { off: 10, dist: 1.3 }), dur: 3.5, say: 'lola', line: "Here. This one's free. Don't get used to it." },
  // (Wesley at the barrier, his phone up: held for his line after the scene, Chat's verdict)
  { ...close(B4, 'wesley', { off: 12, dist: 1.25 }), dur: 1.6, act: [{ who: 'wesley', pose: 'phone', prop: 'phone' }] },
] };
const ST4B = { type: 'cutscene', id: 'st4b', if: 'ovation != true', set: ST4P(null), shots: [
  { ...close(B4, 'lola', { off: -12, dist: 1.3 }), dur: 2.6, say: 'lola', line: 'Every time.', how: 'deadpan' },
  { ...close(B4, 'jensen', { off: 8, dist: 1.3 }), dur: 2.2, act: [{ who: 'jensen', pose: 'talk' }], say: 'jensen', line: 'Too much?' },
  { ...close(B4, 'lola', { off: 10, dist: 1.3 }), dur: 3.5, say: 'lola', line: "...Here. This one's free anyway. Don't get used to it.", pre: 0.5 },
  { ...close(B4, 'wesley', { off: 12, dist: 1.25 }), dur: 1.6, act: [{ who: 'wesley', pose: 'phone', prop: 'phone' }] },
] };

const F3 = { type: 'vcall', id: 'f3', title: 'After the Show', time: 'night', end: 'leave', people: [
  { who: 'nico', office: 'truck', sub: "Lola's truck, the last plate" },
  { who: P, office: 'greenroom', label: 'Jensen', sub: 'his green room, finally' }],
  lines: [
    V('nico', "Boss. The car's parked, nobody touched her, I'm eating the last plate, and the whole day, start to finish? Eleven out of eleven."),
    V(P, 'I thought nobody gets an eleven.'),
    Ev('wait', null, { secs: 0.8 }),
    V('nico', 'Nobody did. Till today.'),
    V(P, "We're naming the car tomorrow. There'll be a keynote, a little card, and a...", { cut: 0.75 }),
    V('nico', 'She\'s got one. The paint guy called the colour "keynote." ...We call her Seven-Oh-Four.', { pre: 0.4 }),
    V(P, "...That's a ten."),
    V('nico', 'Out of eleven.', { overlap: true }),
  ] };

const M8 = { id: 'ST-8', title: 'Showtime', vehicle: 'roadster', start: '@arena', time: 'twilight', card: 'slam', verbs: ['sneak', 'fight'],
  stakes: 'Seven o\'clock. The Board walks out first unless you do.', passLine: 'Seven-oh-four. The earliest keynote in Greenlight history.',
  steps: [
    { type: 'transition', kicker: '6:52 PM', text: 'THE ARENA · LOADING DOCK' },
    H1,
    { type: 'timer', name: 'curtain', seconds: 240, label: 'CURTAIN', fail: 'hard', why: 'Seven o\'clock. The Board walked out first.' },
    { type: 'stealth', mode: 'walk', to: '@stage-door', objective: 'Sneak across the back lot to the stage door.',
      units: [{ '@': 'backlot-a', kind: 'scout', roam: 25, name: 'The Director with the clipboard' }, { '@': 'backlot-b', kind: 'scout', radius: 30, name: "The Director with Marge's headset" },
        { '@': 'backlot-c', kind: 'scout', roam: 15, name: 'The Director by the barrier' }],
      onDetect: { set: { label: 'Spotted', meters: { crowd: { add: -10 } } } },
      during: [SAYAT(4, 'marge', "Channel two. Three suits on the lot. Wesley's right, the navy one's by the barrier. Go left of the trucks.", { how: 'hushed' }),
        SAYAT(20, 'marge', 'Quiet. They hear leather.', { how: 'hushed' })] },
    { type: 'fight', enemies: ['director-b', 'director-a'], arena: '@stage-door', win: 'ko-all', rules: 'full', timer: 60, hp: 100, objective: "Get Marge's headset back.",
      during: [SAYAT(2, 'director-a', 'Motion to keep the headset!'), SAYAT(4, 'director-b', 'Seconded.'),
        SAYAT(12, 'director-b', 'Fog. Go.'),
        SAYAT(16, 'marge', 'Not the fog. Not. The. Fog.', { how: 'urgent' }),
        SAYAT(22, 'jensen', "Motion denied, and that one's personal.")] },
    say('marge', 'I can hear my headset breathing. Standby, sunrise. ...Spiritually, we\'re on time.', { wait: false }),
    { type: 'timer', name: 'curtain', stop: true },
    ST1, K1C, ST2, K2C, ST3A, ST3B, ST3, ST3W, K3C, ST4A, ST4B,
    say('wesley', "Chat says that's the loudest room in San Jose history. Chat's crying. Kyle's crying.", { if: 'crowd >= 70', how: 'shout' }),
    say('wesley', "Chat says that was a solid nine. Out of eleven. Nico's going to be so proud.", { if: 'crowd < 70' }),
    F3,
    { type: 'actEnd', title: 'THE MORE YOU BUY', story: ['Seven-oh-four. The earliest keynote in Greenlight history.'], meter: 'crowd', stats: [{ label: 'Directors', value: '11, adjourned' }] },
    { type: 'dm', from: 'board', text: 'Big fan. Still. Regards, the Former Board.', secs: 8 },
    { type: 'dm', from: 'board', text: 'P.S. The mattress company would like a keynote.', secs: 6 },
    { type: 'dm', from: 'wesley', text: 'Pruitt got seat one. He\'s still lying down.', secs: 6 },
  ] };


const pack = {
  storykit: 2, id: 'jensen-heist', title: 'Jensen Heist', kicker: 'SAN JOSE', tagline: 'Ten hours to showtime. One chip. One jacket.',
  base: { engine: 'mogcity-1', city: 'hometown', cityBuild: `hometown-${lock.buildId}`.slice(0, 39),
    hometown: { place: lock.place, compiler: lock.buildId, tiles: lock.tiles, formatVersion: lock.formatVersion, grid: lock.grid, domain: lock.domain, origin: lock.origin, k0: lock.k0, gamma0: lock.gamma0, yOffset: lock.yOffset, waterLevel: lock.waterLevel } },
  dressing: { time: 'midday', season: 'autumn', weather: 'clear', holiday: [] },
  hero: 'jensen', ride: 'roadster', opening,
  hud: { meters: [{ id: 'crowd', label: 'CROWD', kind: 'bar', start: 0, min: 0, max: 100 }] },
  // (the hero's car: Mog City's roadster in the parody company's lime green, paint only, no logo or livery)
  places, cast, vehicles: [{ stock: 'roadster', paint: '#76B900' }],
  acts: [
    { id: 'act-1', name: 'Preheat', missions: [M1, M2] },
    { id: 'act-2', name: 'Booth Three', missions: [M3, M4] },
    { id: 'act-3', name: 'Quorum', missions: [M5, M6] },
    { id: 'act-4', name: 'Showtime', missions: [M7, M8] },
  ],
};
writeFileSync(OUT, JSON.stringify(pack, null, 1) + '\n');
console.log('wrote', OUT, JSON.stringify(pack).length, 'bytes');
