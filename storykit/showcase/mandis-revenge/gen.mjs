// Mandi's Revenge: writes storykit/packs/mandis-revenge.json (Story Kit v2, a showcase in the Chicago town) from the
// owner-approved story outline (25 Nov 2026). Every conversation scene is a video call (vcall) and every side character
// is seen only on the foldable phone (calls.style 'fold'): their car-phone calls show them on its inner screen
// (call.video), and a vcall plays on it, big, in the middle. The one exception is the opening's audition, which is on
// Mandi's laptop (device 'laptop': the full-screen call in a laptop's frame). Run from the GameMog checkout:
//   node storykit/showcase/mandis-revenge/gen.mjs
// The town's pin (base.hometown) is read from town.json.gz (the CityPackage the pack is gated with); the people's
// sheets are sheets/ (written by sheets.mjs). Mandi's and Jay's bodies are private premium assets, never in this repo.
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const HERE = 'storykit/showcase/mandis-revenge', OUT = 'storykit/packs/mandis-revenge.json';
const sheet = (id) => JSON.parse(readFileSync(`${HERE}/sheets/${id}.json`, 'utf8'));
const town = JSON.parse(gunzipSync(readFileSync(`${HERE}/town.json.gz`)).toString('utf8'));
const lock = { place: town.placeId, buildId: town.compilerVersion, tiles: town.tileSet.hash, formatVersion: town.lockVersion === 3 ? 3 : 2, grid: town.grid, domain: town.domain,
  origin: { c0: town.origin.c0, r0: town.origin.r0 }, k0: town.k0, gamma0: town.gamma0, yOffset: town.yOffset, waterLevel: town.waterLevel };

// ── helpers (Jensen Return's) ──
const DL = ['how', 'pre', 'post', 'overlap', 'cut', 'muted', 'secs'];
const opt = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => DL.includes(k)));
const L = (who, text, o) => ({ who, text, ...opt(o) });
const V = (who, line, o) => ({ who, line, ...opt(o) });
const Ev = (d, who, extra = {}) => (who ? { do: d, who, ...extra } : { do: d, ...extra });
const say = (who, text, o = {}) => ({ type: 'say', who, text, ...o });
const SAYAT = (at, who, text, o = {}) => ({ type: 'say', at, who, text, wait: false, ...o });
const P = 'player';

// ── cast ──
const cast = [
  { id: 'mandi', color: '#C9A227', sheet: sheet('mandi'), anchor: 'young-hero',
    voice: { id: 'mandi-v1', blend: { af_heart: 0.6, af_nova: 0.4 }, speed: 1.06, pitch: 0.2, description: 'a woman in her late twenties, a warm bright mezzo, quick and wry, dropping to dead calm when she means it; standard American delivery' },
    speech: { rhythm: 'short, quick, a joke and then the plan', habit: '"Okay." before she does the hard thing', jokes: 'deadpan about her own outfit, never about anyone else\'s', never: 'begs, or takes Jay back', motifs: ['the leopard', 'the slides', 'the Kastell', "Jay's jacket"] } },
  { id: 'jay', color: '#B3121F', sheet: sheet('jay'), anchor: 'young-hero',
    voice: { id: 'jay-v1', blend: { am_puck: 0.6, am_liam: 0.4 }, speed: 1.12, pitch: 0.4, description: 'a man around thirty, an easy sheepish tenor, talking fast because he is guilty, which is always' },
    speech: { rhythm: 'apologies that turn into a bet halfway', habit: '"Okay, so, technically"', jokes: 'odds on everything', never: 'stays sorry for longer than a sentence', motifs: ['number seven', 'the red coupe', 'the jacket', 'the sponge'] } },
  { id: 'diego', color: '#F1ECE0', sheet: sheet('diego'), anchor: 'old-boss',
    voice: { id: 'diego-v1', blend: { am_onyx: 0.7, am_michael: 0.3 }, speed: 0.92, pitch: -0.4, description: 'a man in his fifties, a smooth rich baritone, courteous and amused, savouring every word; never shouts' },
    speech: { rhythm: 'long courteous sentences with a pause before the threat', habit: 'calls her "the girl in the leopard"; "Regards."', jokes: 'treats a duck race as grand opera', never: 'raises his voice', motifs: ['the Derby', 'number seven', 'DV leather', 'the riverboat'] } },
  { id: 'kiki', color: '#C8A2E8', sheet: sheet('kiki'), anchor: 'young-mother',
    voice: { id: 'kiki-v1', blend: { af_sarah: 0.6, af_kore: 0.4 }, speed: 1.14, pitch: 0.6, description: 'a young woman, a fast bright alto, cutting in with "girl" and "hold on, hold on"' },
    speech: { rhythm: 'three thoughts at once', habit: '"Girl." "Hold on, hold on."', jokes: 'counts views like money', never: 'stops filming', motifs: ['the salon chair', 'the livestream', 'her cousin', 'the lilac minivan'] } },
  { id: 'bernie', color: '#6E6A5E', sheet: sheet('bernie'), anchor: 'old-boss',
    voice: { id: 'bernie-v1', blend: { am_santa: 0.6, am_fenrir: 0.4 }, speed: 1.04, pitch: -0.8, description: 'a man in his sixties, gravelly and frantic, a big-hearted wheeze' },
    speech: { rhythm: 'half a sentence, then the signal goes', habit: '"Sweetheart." "Can you hear me now?"', jokes: 'every no is basically a yes', never: 'gets a full sentence through', motifs: ['double-parked', 'the signal', 'Simone', '"she\'s a natural"'] } },
  { id: 'gloria', color: '#1F2B3A', sheet: sheet('gloria'), anchor: 'office-worker',
    voice: { id: 'gloria-v1', blend: { af_river: 0.7, af_nicole: 0.3 }, speed: 0.98, pitch: -1.2, description: 'a woman in her forties, crisp and low, every sentence a column of numbers' },
    speech: { rhythm: 'figures, then the verdict', habit: 'rounds nothing', jokes: 'bookkeeping as threat', never: 'guesses', motifs: ['the ledger', 'the powder room', 'number seven', 'the train'] } },
  { id: 'brick', color: '#14161A', sheet: sheet('brick'), anchor: 'fixer',
    voice: { id: 'brick-v1', blend: { am_onyx: 0.6, am_echo: 0.4 }, speed: 0.88, pitch: -1.6, description: 'a big man with a soft slow bass, polite to a fault' },
    speech: { rhythm: 'slow, polite, an apology first', habit: '"Sorry about this."', jokes: 'knits through threats', never: 'is rude', motifs: ['the knitting', 'the scarf', 'Mr. Vale'] } },
  { id: 'simone', color: '#111111', sheet: sheet('simone'), anchor: 'office-worker',
    voice: { id: 'simone-v1', blend: { af_nicole: 0.6, af_alloy: 0.4 }, speed: 0.96, pitch: -0.6, description: 'a woman in her forties, cool and clipped, a half-sigh in every note' },
    speech: { rhythm: 'one direction at a time', habit: '"Give me..."', jokes: 'directions nobody can act', never: 'says yes early', motifs: ['the lake', 'the look', '"we\'ll be in touch"'] } },
  { id: 'deckhand-red', color: '#B3261E', sheet: sheet('deckhand-red'), anchor: 'fixer',
    voice: { id: 'deckhand-red-v1', blend: { am_fenrir: 0.7, am_onyx: 0.3 }, speed: 1.0, pitch: -1.0, description: 'a big silent man; grunts only' },
    speech: { rhythm: 'none', habit: 'cracks his knuckles', jokes: 'none', never: 'speaks', motifs: ['the red cap'] } },
  { id: 'deckhand-blue', color: '#2456A6', sheet: sheet('deckhand-blue'), anchor: 'fixer',
    voice: { id: 'deckhand-blue-v1', blend: { am_echo: 0.7, am_onyx: 0.3 }, speed: 1.0, pitch: -0.6, description: 'a stocky silent man; grunts only' },
    speech: { rhythm: 'none', habit: 'a whistle', jokes: 'none', never: 'speaks', motifs: ['the blue cap'] } },
];

// ── places (every one a key of the Chicago build's frame; names only, never the real businesses') ──
// The Loop and the river from compiler 0.14.0's downtown box (the core step moved it from the Census point onto the
// Loop). Each one is a lot or a park on the street; the nearest sensitive place in the town's data is in the README.
const places = {
  // (27 Nov, the owner: "M1 move to street level". Her lot was park19, a lot on Lower Wacker: the drive to Jay's lot
  // looped 4.9 km to get up and out. A lot on S Wabash Ave under the tracks instead, on the street: the way to Jay's lot
  // is down Wabash and along Van Buren under the tracks, 1.1 km. Nowhere nearer park19 has a direct way to it: the traffic
  // graph has no lane south from Monroe to Van Buren on Wells, LaSalle or Clark, so every route from the Loop's north
  // half to S Franklin St goes round by the West Loop)
  studio: { '@': 'parking28', name: "Mandi's block, by the tracks" },
  'jay-lot': { '@': 'parking251', name: "Jay's lot, under the tracks" },
  salon: { '@': 'parking108', name: "Kiki's salon" },
  warehouse: { '@': 'parking15', name: 'the warehouse lot' },
  ramp: { '@': 'parking225', name: 'the ramp to the lower level' },
  'lower-level': { '@': 'parking103', name: 'the lower level' },
  mirror: { '@': 'park143', name: 'the mirror park' },
  harbor: { '@': 'park15', name: 'the harbor drive' },
  pier: { '@': 'park30', name: 'the pier' },
  'south-lot': { '@': 'parking182', name: 'the south end of the avenue' },
  'stadium-lot': { '@': 'parking165', name: "the stadium's lot" },
  riverwalk: { '@': 'park62', name: 'the riverwalk' },
  upstream: { '@': 'park152', name: 'the north branch, upstream' },
  // (M8's run-up: Michigan Ave north of the river, the limo's way onto the bridge going south, a straight 200 m to the
  // north leaf's hinge; the bridge itself is the bascule nearest parking73, Michigan Ave's: MogCity cities/sf/js/bascule.js)
  // (M8's chase starts here, 27 Nov (the owner: "cut to 60 seconds"): E Ohio St, a block west of Michigan Ave, the limo
  // ahead: east on Ohio, then south down Michigan Ave onto the bridge, 0.8 km; from upstream it was 2.3 km)
  'ohio': { '@': 'parking83', name: 'E Ohio St, north of the river' },
  'north-ave': { '@': 'bank212', name: 'Michigan Ave, north of the river' },
  bridge: { '@': 'parking73', name: 'the river bridge' },
  dawn: { '@': 'park137', name: 'the riverwalk at dawn' },
};

// ── the opening (a cutscene: the place card, Mandi at her ring light, the title over the Kastell) ──
const opening = {
  place: '@studio', time: 'twilight',
  sets: {
    studio: { room: 'office-study', light: 'night', people: [{ who: 'mandi', at: [0, -0.6], face: 0, pose: 'idle', look: 'lens' }] },
    lounge: { room: 'office-exec', light: 'night', people: [{ who: 'diego', at: [0, -1.2], face: 0, pose: 'sitTalk', look: 'lens' }] },
  },
  shots: [
    { cam: { rel: 'player', right: -4, up: 70, fwd: -80 }, to: { rel: 'player', right: 0, up: 35, fwd: -50 }, look: 'player', fov: 55, dur: 6, where: { name: 'Chicago, Illinois', sub: 'The Loop · 7:40 PM' } },
    { set: 'studio', cam: { rel: 'mandi', right: 0.2, up: 0.1, fwd: 1.5 }, look: { rel: 'mandi' }, fov: 38, dur: 6, card: { who: 'mandi', is: 'hero', role: 'model, Look 14, one shot at this' },
      say: 'mandi', line: 'Ring light on. Hair done. Laptop at the angle Bernie swears by. Okay, Chicago. Cast me.' },
    { set: 'studio', cam: { rel: 'mandi', right: -0.5, up: 0.25, fwd: 1.1 }, look: { rel: 'mandi' }, fov: 40, dur: 5,
      say: 'mandi', line: 'And nobody calls. Not Jay. Especially not Jay. Tonight is about me.', how: 'deadpan' },
    // (the antagonist's card: Diego in his riverboat lounge, the night's Derby on the river below)
    { set: 'lounge', cam: { rel: 'diego', right: 0.3, up: 0.1, fwd: 1.6 }, look: { rel: 'diego' }, fov: 36, dur: 7, card: { who: 'diego', is: 'antagonist', role: "runs the river's Duck Derby, from a riverboat" },
      say: 'diego', line: 'Number seven is the favourite again tonight. He has never once won. Somebody always believes. Pour the champagne.', how: 'smug' },
    // (the Kastell at the kerb under the tracks, the hero by it; the pack's vehicles carry the paint)
    { cam: { rel: 'player', right: 5, up: 1.6, fwd: 7 }, look: { rel: 'player', up: -0.2 }, fov: 48, dur: 5, sub: 'THE KASTELL. PARKED UNDER THE TRACKS. READY FOR NOTHING.' },
    { cam: { rel: 'player', right: -6, up: 4, fwd: -16 }, look: 'player', dur: 4, title: true },
  ],
};

// ── Mission 1: Out of Frame ──
// AU1: the audition on her laptop (the one call not on the fold phone). The CLIENT · DV tile never turns its camera on
// (a late tile that never joins: it reads "Waiting to join"), the plant M4 pays off. Jay joins late from a riverboat
// in an I OWE DIEGO sign; Brick joins from his own phone ("it felt rude to lean"), politely asks Simone to mute.
const AU1 = { type: 'vcall', id: 'au1', title: "Velvet Lake Casting · Swim '27 · Look 14", time: 'night', device: 'laptop', people: [
  { who: P, office: 'study', label: 'Mandi Reyes', sub: 'her studio corner · ring light' },
  { who: 'simone', office: 'startup', label: 'Simone Vance', sub: 'Velvet Lake Casting' },
  { who: 'bernie', office: 'car', sub: 'his car · double-parked', cam: 'low' },
  { who: 'diego', office: 'exec', label: 'CLIENT · DV', sub: 'camera off', late: true, muted: true },
  { who: 'jay', office: 'exec', label: "JAY'S PHONE", sub: 'a boat, apparently', late: true, cam: 'low' },
  { who: 'brick', office: 'exec', label: 'Guest', sub: 'the same boat', late: true, cam: 'low' }],
  lines: [
    V('simone', 'Look Fourteen. Mandi. Good. Give me summer on the lake.'),
    V(P, 'Summer on the lake. Okay.'),
    V('bernie', "She's a natural. Simone, she's a nat...", { cut: 0.7 }),
    Ev('freeze', 'bernie'),
    V('simone', 'Lovely. Now give me the wind off the lake in November.'),
    V(P, '...Like this?', { pre: 0.5 }),
    V('simone', 'You shivered. Nobody shivers. Keep it.'),
    Ev('unfreeze', 'bernie'),
    V('bernie', "...tural. Did I miss it? I missed it. She's a natural."),
    V('simone', 'Now give me "you forgot your keys."'),
    V(P, 'I have never once forgotten my keys.', { how: 'deadpan' }),
    V('simone', "That face. That's the face of a woman who forgot her keys. Yes."),
    Ev('share', 'simone', { slide: { title: 'KIKI · 3 NEW MESSAGES', lines: ['GIRL.', "Check Jay's story.", 'Why is Jay on a BOAT.'] } }),
    V(P, 'Sorry, that is not... my screen is sharing my texts.'),
    V('simone', 'Love the distraction. The glance at the phone. Keep it.'),
    Ev('unshare', 'simone'),
    Ev('join', 'jay'),
    V('jay', "Mandi. Hey. Don't hang up. You're still on my calendar from when I used to help you prep."),
    V(P, 'Jay, I am in an audition. Why are you wearing a sign?'),
    V('jay', 'It says I owe Diego. Okay, so, technically, I\'m kind of kidnapped.', { how: 'hushed' }),
    V('simone', 'Is he part of the look?'),
    V(P, 'He is not part of the look.', { overlap: true }),
    Ev('join', 'brick'),
    V('brick', 'Hello. Sorry. I joined from my own phone, it felt rude to lean into his.'),
    V('brick', 'Would you mind muting, ma\'am? This is a family matter.'),
    V('simone', 'Of course.', { how: 'deadpan' }),
    Ev('mute', 'simone'),
    V('brick', 'Mr. Vale says tell her the number, Jay.'),
    V('jay', 'Forty thousand. On a duck. Number seven. He was so fast in practice.'),
    V(P, 'A rubber duck, Jay?'),
    V('jay', "Quackson. He's got a little racing stripe. Mandi, I think he's going to make me work it off forever, and the boat smells like...", { cut: 0.8 }),
    Ev('drop', 'jay'),
    Ev('drop', 'brick'),
    Ev('unmute', 'simone'),
    V('simone', "We'll be in touch."),
    V('bernie', "She said in touch! That's basically a... Mandi? Sweetheart? Can you hear me n...", { cut: 0.75 }),
    Ev('drop', 'bernie'),
  ] };

// the leaving beat: she closes the laptop, holds a breath, takes Jay's leather jacket off the hook (she never gave it
// back; she carries it, the bikini and the slides stay on: the owner, 25 Nov), keys, phone, out the door
const LEAVE = { type: 'cutscene', id: 'leave', set: { room: 'office-study', light: 'night', people: [{ who: 'mandi', at: [0, -0.6], face: 0, pose: 'idle' }] }, shots: [
  { cam: { rel: 'mandi', right: 0.1, up: 0.05, fwd: 1.3 }, look: { rel: 'mandi' }, fov: 36, dur: 4, sub: 'THE LAPTOP CLOSES.' },
  { cam: { rel: 'mandi', right: 0.6, up: 0.3, fwd: 1.6 }, look: { rel: 'mandi' }, fov: 40, dur: 5,
    say: 'mandi', line: "Okay. No time to change. Keys, phone, and his jacket. He's not getting it back either." },
] };

// B1: Bernie on the car phone, at the wheel, over the drive to Jay's lot
const B1 = { type: 'call', who: 'bernie', auto: true, inCar: true, at: 3, video: { office: 'car' },
  lines: [
    L('bernie', "Sweetheart! Simone said in touch. In touch is basically a yes. In this business that's a parade."),
    L('mandi', 'Bernie, Jay just got kidnapped on my audition.'),
    L('bernie', 'On camera? Was it a good angle for you?'),
    L('mandi', 'Bernie.'),
    L('bernie', 'Sorry, sorry. Who has him?'),
    L('mandi', 'Somebody called Diego. Jay owes him forty thousand dollars on a rubber duck.'),
    L('bernie', "Diego Vale. The Duck Derby. Oh, sweetheart, everybody on the river knows that guy. He's...", { cut: 0.6 }),
    L('mandi', 'Bernie? You cut out at "he\'s."'),
    L('bernie', "...very theatrical. Wears a white suit in November. Don't sign anything he gives you."),
    L('mandi', 'Why would he give me anything to sign?'),
    L('bernie', "Everybody gives a pretty girl a contract. That's the whole city. Where are you going?"),
    L('mandi', "Jay's lot. Under the tracks. He leaves the car there when he's hiding from me."),
    L('bernie', "In that outfit? It's November!"),
    L('mandi', "I've got the heater on full and a jacket on the passenger seat. I'm fine."),
  ],
  extra: [
    [L('bernie', "You know what Simone told me after your first audition? 'She's got a face that waits for you.'"), L('mandi', 'Is that good?'),
      L('bernie', "I don't know! I've been chewing on it for two years!"), L('mandi', 'Put it on my card, Bernie.')],
    [L('bernie', "Hold on, I'm double-parked and a man in a vest is writing me a poem."), L('mandi', "That's a ticket, Bernie."),
      L('bernie', "It's got a rhyme scheme. Let me call you right... I'll call you righ...", { cut: 0.7 })],
  ],
  wrap: [L('mandi', "I'm at the lot. His car's here. Bernie, I'll call you after."), L('bernie', 'Be careful, sweetheart. And smile with your eyes, in case.')],
  hold: { pause: [L('bernie', "Go, go. I'll hold. I've been holding my whole career.")], resume: [L('bernie', "You're back! What did I miss? Is he rescued?")] } };

// D1: Diego, first face, from his riverboat lounge: the terms, $40,000 by midnight. Jay polishes brass behind him (a
// tile of his own on the boat, muted); he calls her "the girl in the leopard"
const D1 = { type: 'vcall', id: 'd1', title: 'DV · Private Line', time: 'night', layout: 'speaker', people: [
  { who: 'diego', office: 'exec', label: 'Diego Vale', sub: 'the riverboat · the lounge' },
  { who: P, office: 'car', label: 'Mandi', sub: "Jay's lot · under the tracks", cam: 'low' },
  { who: 'jay', office: 'exec', label: "JAY'S PHONE", sub: 'the lounge · polishing brass', muted: true, cam: 'wide' }],
  lines: [
    V('diego', 'Ah. The girl in the leopard. Jay said you would come for him. He bet on it, naturally.'),
    V(P, 'What does he owe you? The real number.'),
    V('diego', 'Forty thousand on number seven. Seven came eleventh, of eleven. An honest race, and an honest debt.'),
    V(P, "I've got three hundred and twelve dollars and a ring light."),
    V('diego', 'Then you have until midnight. Forty thousand, or Jay works it off. Forever is such a lovely word.'),
    V('jay', "Mandi! He's got me polishing the duck trophies, there's like ninety of them...", { muted: true }),
    V('diego', 'He is muted. He is always muted. It is the only way to enjoy him.'),
    V(P, 'And his car?'),
    V('diego', 'Collateral. A man will come by to collect it, and to keep you calm. Do let him.'),
    V(P, "I'm extremely calm."),
    V('diego', 'Regards to the leopard.'),
  ] };

const M1 = { id: 'OF-1', title: 'Out of Frame', vehicle: 'kastell', start: '@studio', time: 'twilight', card: 'slam', verbs: ['drive', 'fight'],
  stakes: "Forty thousand dollars on a rubber duck. Jay's kidnapped, and you're still in the bikini.", passLine: 'Midnight. Forty thousand. And a man called Diego.',
  steps: [
    AU1,
    LEAVE,
    { type: 'transition', kicker: '7:52 PM', text: "MANDI'S REVENGE", sub: "I said I'd get you back.", secs: 4 },
    { type: 'car', name: 'jaycoupe', car: 'sedan', color: '#B3121F', at: '@jay-lot' },
    { type: 'drive', to: '@jay-lot', objective: "Get to **Jay's lot** under the tracks", during: [B1] },
    // (the 52 s drive ends before Bernie's call: parked at the lot, the call says its last lines and its wrap before
    // she gets out, as M3's after the chase; over the moment it hangs up, 30 s at most)
    { type: 'wait', secs: 30, call: true },
    { type: 'search', at: '@jay-lot', label: "search Jay's car", on: 'place', prop: false, secs: 2, objective: "Search Jay's red coupe." },
    { type: 'dm', from: 'kiki', text: "Girl. GIRL. His story has a boat, a sign, and a man in a white suit. Who is the white suit.", secs: 6 },
    say('mandi', 'A betting slip. Duck Derby. Forty thousand, number seven, "Quackson." He signed it with a heart.'),
    D1,
    { type: 'npc', who: 'deckhand-red', at: '@jay-lot' },
    { type: 'fight', enemies: ['deckhand-red'], arena: '@jay-lot', win: 'ko-all', rules: 'lesson', timer: 20, objective: 'Stay calm. Make him stay calm.',
      during: [SAYAT(2, 'mandi', "You're the man who keeps me calm? Great. Watch this."), SAYAT(10, 'mandi', 'These are slides. I am fighting you in slides.')] },
    say('mandi', 'Okay. Forty thousand by midnight. Kiki will know somebody.', { wait: true }),
  ] };

// ── Mission 2: Kiki's Chair ──
const K1 = { type: 'vcall', id: 'k1', title: "Kiki's Chair (LIVE)", time: 'night', people: [
  { who: 'kiki', office: 'greenroom', label: 'Kiki', sub: "Kiki's chair · the salon" },
  { who: P, office: 'car', label: 'Mandi', sub: "outside Kiki's salon", cam: 'low' },
  { who: 'bernie', office: 'car', sub: 'still double-parked', late: true, cam: 'low' }],
  lines: [
    V('kiki', "Girl, you're live, say hi, eleven hundred people are watching you sit in a car in a bikini."),
    V(P, 'Kiki, turn it off.'),
    V('kiki', "Hold on, hold on, I'm turning it off. ...It's off. It's mostly off."),
    V(P, 'I need forty thousand dollars by midnight.'),
    V('kiki', 'Okay. What have you got?'),
    V(P, 'Three hundred and twelve.'),
    V('kiki', "So we're short thirty-nine thousand, six hundred and eighty-eight. I did your nails, I can do math."),
    Ev('join', 'bernie'),
    V('bernie', "I can do eight hundred! I can do eight hundred and a lunch."),
    V(P, 'Thank you, Bernie.'),
    V('kiki', 'My cousin runs ducks for the Derby. Every race night the runners carry the take in a yellow van.'),
    V('kiki', "It just left the block. Yellow, loud, a duck on the roof. You can't miss it."),
    V(P, "So I follow the duck van and take Diego's money to pay Diego."),
    V('kiki', "Girl, that's not a crime, that's a refund."),
    V('bernie', "I didn't hear that. My signal's very bad right n...", { cut: 0.7 }),
    Ev('drop', 'bernie'),
  ] };

const KT = { type: 'call', who: 'kiki', auto: true, inCar: true, at: 3, video: { office: 'greenroom' },
  lines: [
    L('kiki', "Okay, I'm watching you on the map. Don't get close. Duck people are paranoid."),
    L('mandi', 'Why are they paranoid?'),
    L('kiki', "Because everybody wants the ducks! Hold on, hold on, my client's nail just popped off."),
    L('mandi', 'Kiki. Focus.'),
    L('kiki', "I'm focused. I can do a full set and a car chase. So what's the plan with Jay?"),
    L('mandi', 'I get him off the boat.'),
    L('kiki', 'And then?'),
    L('mandi', 'And then I drop him off at his mother\'s and I go home.'),
    L('kiki', 'Girl, you said that last time. And the time with the horse.'),
    L('mandi', 'The horse was not my fault.'),
    L('kiki', "It was a little bit your fault. You gave it a carrot. It followed you for a mile."),
  ],
  extra: [[L('kiki', "My comments are asking if you're cold."), L('mandi', "Tell them I'm in a heated luxury vehicle."), L('kiki', "They're asking what kind."), L('mandi', 'The kind that gets my ex back.')]],
  wrap: [L('kiki', "It stopped! The warehouses. Go slow, go quiet, and don't lose a slide.")],
  react: {
    tooClose: [L('kiki', "Too close! Girl, you're on its bumper!"), L('kiki', 'Back off, back off, they can see your headlights.')],
    lost: [L('kiki', "Where did it go? I lost it on the map."), L('kiki', 'Left! I think it went left. Or right. Go!')],
  } };

const M2 = { id: 'KC-2', title: "Kiki's Chair", vehicle: 'kastell', start: '@jay-lot', time: 'twilight', card: 'slam', verbs: ['drive', 'tail', 'sneak', 'fight'],
  stakes: "You've got three hundred and twelve dollars. Diego's runners have the night's take.", passLine: 'The van keys. And a very heavy duffel.',
  steps: [
    { type: 'transition', kicker: '8:20 PM', text: 'WEST LOOP' },
    { type: 'drive', to: '@salon', objective: "Get to **Kiki's salon**" },
    K1,
    // (the salon to the warehouse lot: about 0.8 km straight, a minute and a half behind it)
    { type: 'tail', name: 'the Derby van', car: 'suv', color: '#F2C200', route: ['@salon', '@warehouse'], ahead: 60, speed: 15, lostDist: 280,
      objective: "Follow the yellow Derby van. Don't get spotted.", during: [KT] },
    { type: 'car', name: 'derbyvan', car: 'van', color: '#F2C200', at: '@warehouse' },
    { type: 'npc', who: 'deckhand-blue', at: '@warehouse' },
    { type: 'stealth', mode: 'walk', to: '@warehouse', objective: 'Sneak through the lot to the van.',
      units: [{ '@': 'warehouse', kind: 'scout', roam: 20, name: 'The deckhand with the whistle' }],
      onDetect: { set: { label: 'Spotted: the whistle', flags: { spotted2: true } } },
      during: [{ type: 'dm', at: 8, from: 'jay', text: 'is now a bad time to say sorry', secs: 6 }, SAYAT(16, 'mandi', 'Yes, Jay. It is.', { how: 'hushed' })] },
    { type: 'npc', who: 'deckhand-red', at: '@warehouse' },
    { type: 'fight', enemies: ['deckhand-red', 'deckhand-blue'], arena: '@warehouse', win: 'ko-all', rules: 'lesson', timer: 25, objective: 'Get the van keys.',
      during: [SAYAT(2, 'mandi', 'You again. How is your calm?'), SAYAT(12, 'mandi', "Keys. Thank you. You've been very professional.")] },
    say('mandi', "Got the keys. And a duffel the size of Bernie. Okay. Let's go.", { wait: true }),
  ] };

// ── Mission 3: Lower Level ──
const BR1 = { type: 'call', who: 'brick', auto: true, inCar: true, at: 4, video: { office: 'car' }, register: 'fast',
  lines: [
    L('brick', "Hello, Mandi. It's Brick. I'm the one behind you. In the black car. Sorry about this."),
    L('mandi', 'Are you calling me during a chase?'),
    L('brick', "I didn't want you to think it was personal. Mr. Vale would like his van back."),
    L('mandi', "Tell Mr. Vale to come and get it."),
    L('brick', "I am. That's this. That's what this is."),
    L('brick', 'You took the corner very well. I wrote it down.'),
    L('mandi', 'Are you knitting while you drive?'),
    L('brick', "Only at the lights. It's a scarf. It's for my mother."),
  ],
  wrap: [L('brick', "Oh. I've lost you. That's on me. Have a good night, Mandi.")] };

const DUCKS = { type: 'cutscene', id: 'ducks', shots: [
  { cam: { rel: 'player', right: 1.6, up: 0.6, fwd: 2.4 }, look: { rel: 'player', up: -0.4 }, fov: 40, dur: 4, sub: 'THE DUFFEL UNZIPS.' },
  { cam: { rel: 'player', right: -1.2, up: 1.4, fwd: 1.8 }, look: { rel: 'player', up: -0.6, fwd: 0.6 }, fov: 44, dur: 5, sub: 'RUBBER DUCKS. THOUSANDS OF THEM. NUMBERED. NO CASH.',
    say: 'mandi', line: "Ducks. It's all ducks. I stole a van full of ducks." },
] };

const D2 = { type: 'vcall', id: 'd2', title: 'DV · Private Line', time: 'night', layout: 'speaker', people: [
  { who: 'diego', office: 'exec', label: 'Diego Vale', sub: 'the riverboat · the lounge' },
  { who: P, office: 'car', label: 'Mandi', sub: 'the lower level', cam: 'low' },
  { who: 'jay', office: 'exec', label: "JAY'S PHONE", sub: 'the lounge · brass, still', cam: 'wide', late: true }],
  lines: [
    V('diego', 'You stole my ducks.'),
    V(P, 'I stole your van. The ducks came with it.'),
    V('diego', "Tonight's race needs those ducks. Without them it is just a river."),
    Ev('join', 'jay'),
    V('jay', "Mandi, they're numbered. He's going to know which ones are gone. He knows all their names."),
    V('diego', 'I do. So. The deadline moves. Ten o\'clock, not midnight. Forty thousand, and every duck.'),
    V(P, "Or what? You'll make him polish more brass?"),
    V('diego', 'Or he joins the race. Number forty-one. I have a very small life jacket.'),
    V('jay', "He's not joking. He measured me."),
    V('diego', 'Ten o\'clock, leopard. Regards.'),
  ] };

const M3 = { id: 'LL-3', title: 'Lower Level', vehicle: 'kastell', start: '@warehouse', time: 'midnight', weather: 'rain', card: 'slam', verbs: ['drive', 'escape'],
  stakes: "Brick wants the van back. He's very polite about it.", passLine: 'Ten o\'clock. Forty thousand. And every single duck.',
  steps: [
    { type: 'transition', kicker: '8:46 PM', text: 'THE WAREHOUSES' },
    { type: 'pursuit', checkpoint: true, kind: 'crew', name: "Brick's black car", level: 2, count: 1, behind: 60, goal: 'lose', loseDist: 220, loseTime: 20, objective: 'Lose Brick.', during: [BR1] },
    { type: 'wait', secs: 20, call: true },
    { type: 'roadblock', at: '@ramp', kind: 'crew', cars: 2, crew: 0, ram: true, ramSpeed: 12, text: "the deckhands' carts", to: '@lower-level', objective: 'Ram through the carts to the lower level.' },
    DUCKS,
    D2,
    { type: 'dm', from: 'kiki', text: "Girl my cousin says the race is RIGGED. Every night. Says ask the accountant. Who has an accountant for ducks??", secs: 7 },
  ] };

// ── Mission 4: Mirror Park ──
const G1 = { type: 'vcall', id: 'g1', title: 'Unknown · Encrypted', time: 'night', people: [
  { who: 'gloria', office: 'greenroom', label: 'Gloria Steele', sub: 'the boat · the powder room', cam: 'close' },
  { who: P, office: 'car', label: 'Mandi', sub: 'the mirror park', cam: 'low' }],
  lines: [
    V('gloria', "Gloria Steele. I keep Diego's books. We have four minutes before he wonders where I am."),
    V(P, 'You texted me from the bathroom?'),
    V('gloria', 'The powder room. It has a lock and a mirror. That is all an accountant needs.'),
    Ev('share', 'gloria', { slide: { title: 'DUCK DERBY · LEDGER · NOVEMBER', lines: ['No. 7 "Quackson": weighted keel', 'Odds sold: 40 to 1', 'Payout if he wins: everything'], big: '$0' } }),
    V('gloria', "Number seven was built to lose. A lead keel. He's the favourite every week, and he sinks every week."),
    V(P, 'So Jay never had a chance.'),
    V('gloria', "Nobody does. That's the business."),
    Ev('unshare', 'gloria'),
    Ev('share', 'gloria', { slide: { title: 'LEDGER · OUTGOING', lines: ['Velvet Lake Casting: retainer', 'Swim \'27 · client DV', 'Look 14: "the leopard"'] } }),
    V(P, '...Velvet Lake. That\'s my audition.'),
    V('gloria', "Diego paid for it. He was the client. Camera off. He wants a face for his leather line, and he picked yours."),
    V(P, "He set Jay up to get to me?"),
    V('gloria', 'Jay was the cheapest way in. Forty thousand. Diego thinks you are worth a great deal more.'),
    Ev('unshare', 'gloria'),
    V(P, 'Why are you telling me?'),
    V('gloria', "Eleven years of his rounding. I'm done. My car's in the park. Get me out past his cart and I'll give you the ledger."),
  ] };

const M4 = { id: 'MP-4', title: 'Mirror Park', vehicle: 'kastell', start: '@lower-level', time: 'midnight', card: 'slam', verbs: ['drive', 'follow'],
  stakes: 'An unknown number. "Meet me at the mirror. Come alone. Bring the ducks."', passLine: 'Diego was the client. He picked her face.',
  steps: [
    { type: 'dm', name: 'Unknown number', text: 'Meet me at the mirror. Come alone. Bring the ducks.', secs: 6 },
    { type: 'timer', name: 'deadline', seconds: 540, label: 'DEADLINE', fail: 'soft', lateLabel: 'LATE', why: "Ten o'clock came and went. Diego added a duck to the race." },
    { type: 'drive', to: '@mirror', objective: 'Get to **the mirror park**',
      during: [SAYAT(10, 'mandi', 'Come alone, bring the ducks. Sure. Totally normal text.'), SAYAT(40, 'mandi', "If this is Jay's mother, I'm turning around.")] },
    G1,
    { type: 'convoy', checkpoint: true, route: ['@mirror', '@harbor'], speed: 12, car: 'sedan', color: '#7C8A96', name: "Gloria's car", who: 'gloria', band: [8, 40], hp: 120,
      objective: "Get Gloria's car out past the cart.", during: [SAYAT(6, 'gloria', 'Stay close. I drive the speed limit, to the decimal.'), SAYAT(30, 'gloria', 'Cart on the right. Do not let him tap my door.'), SAYAT(60, 'gloria', "That's the harbor. I can breathe here.")] },
    { type: 'timer', name: 'deadline', stop: true },
    say('gloria', "The ledger is yours when Jay is off that boat. I don't hand evidence to people who might lose.", { wait: true }),
  ] };

// ── Mission 5: Pier Pressure ──
const BE2 = { type: 'call', who: 'bernie', auto: true, inCar: true, at: 3, video: { office: 'car' },
  lines: [
    L('bernie', "Sweetheart. Sit down. Are you sitting? You're driving, you're sitting."),
    L('mandi', 'Bernie, what is it?'),
    L('bernie', "A client wants you exclusive. Ten years. It's huge. It's the biggest offer I've ever touched."),
    L('mandi', 'Who is the client?'),
    L('bernie', 'Somebody called DV. Leather goods. Who is DV?'),
    L('mandi', 'DV is the man who kidnapped Jay.'),
    L('bernie', "...So that's a no? That sounds like a no. Let me get the details, I'll put him on a call."),
    L('mandi', "Put him on at the pier. I'll be there in two minutes."),
  ],
  wrap: [L('bernie', "I'm conferencing everyone. Simone too. Be gracious. Be... can you hear me n...", { cut: 0.7 })] };

const C1 = { type: 'vcall', id: 'c1', title: "Velvet Lake Casting · Look 14 · Offer", time: 'night', people: [
  { who: 'diego', office: 'exec', label: 'Diego Vale', sub: 'DV · the riverboat' },
  { who: 'simone', office: 'startup', label: 'Simone Vance', sub: 'Velvet Lake Casting' },
  { who: 'bernie', office: 'car', sub: 'still double-parked', cam: 'low' },
  { who: P, office: 'car', label: 'Mandi', sub: 'the pier', cam: 'low' }],
  lines: [
    V('diego', 'Camera on, at last. I did so enjoy your audition. The November wind. The keys.'),
    V(P, 'You were the client.'),
    V('diego', 'I am always the client. Ten years as the face of DV. The debt forgiven. Jay freed. Tonight.'),
    V('simone', "It's a very good offer. I hate that it's a very good offer."),
    V('bernie', "It's a great offer. Sweetheart, it's... is he a criminal? He seems like a criminal."),
    Ev('share', 'diego', { slide: { title: 'DV LEATHER · EXCLUSIVE', lines: ['Term: ten (10) years', 'The face: Mandi Reyes', 'Wardrobe: as auditioned'], big: '10 YRS' } }),
    V(P, '"Wardrobe: as auditioned."'),
    V('diego', 'The leopard sells, leopard. I only know what sells.'),
    Ev('unshare', 'diego'),
  ] };

const SIGN = { type: 'choice', prompt: "Sign Diego's contract?", who: 'mandi', timeout: 8, default: 0, options: [
  { text: 'Tear it up', reply: "Here's my signature. It comes in two pieces." },
  { text: 'Sign it "Not Today"', reply: 'Signed. N-O-T, T-O-D-A-Y. Read it slowly.' }] };

const C2 = { type: 'vcall', id: 'c2', title: "Velvet Lake Casting · Look 14 · Offer", time: 'night', people: [
  { who: 'diego', office: 'exec', label: 'Diego Vale', sub: 'DV · the riverboat' },
  { who: 'simone', office: 'startup', label: 'Simone Vance', sub: 'Velvet Lake Casting' },
  { who: 'bernie', office: 'car', sub: 'still double-parked', cam: 'low' },
  { who: P, office: 'car', label: 'Mandi', sub: 'the pier', cam: 'low' }],
  lines: [
    Ev('freeze', 'bernie'),
    V('diego', 'Ah. A no. I adore a no. It means we keep talking.'),
    V('simone', 'For the record, that was the best take of the night.', { how: 'deadpan' }),
    V('diego', 'Brick is beside you, leopard. He will apologise first. He always does.'),
    V(P, 'Tell him I accept.'),
  ] };

const M5 = { id: 'PP-5', title: 'Pier Pressure', vehicle: 'kastell', start: '@harbor', time: 'midnight', card: 'slam', verbs: ['drive', 'fight'],
  stakes: 'A ten-year contract with the man who kidnapped Jay.', passLine: 'Forty thousand views. One torn contract.',
  steps: [
    { type: 'transition', kicker: '9:24 PM', text: 'THE PIER', sub: 'The wheel is lit.' },
    { type: 'drive', to: '@pier', objective: 'Get to **the pier**', during: [BE2] },
    C1, SIGN, C2,
    { type: 'npc', who: 'brick', at: '@pier' },
    say('brick', 'Sorry about this. I really am. Please hold my knitting.', { wait: true }),
    { type: 'fight', enemies: ['brick'], arena: '@pier', win: 'ko-all', rules: 'lesson', timer: 25, hp: 120, objective: 'Get past Brick.',
      during: [SAYAT(4, 'brick', 'Sorry. Sorry. That one was mostly the wind.'), SAYAT(12, 'mandi', 'You are very hard to dislike.'), SAYAT(19, 'brick', "Thank you. I'm trying a new stitch.")] },
    say('brick', "Ow. Good. Mr. Vale is at the stadium lot, with the limo. Jay's washing it. I didn't tell you.", { wait: true }),
    { type: 'dm', from: 'kiki', text: "Girl I clipped the tear-up from your phone cam. 40K views. FORTY K. The comments want a name for the leopard", secs: 7 },
  ] };

// ── Mission 6: Wrong Way Jay ──
const R1 = { type: 'cutscene', id: 'reunion', shots: [
  { cam: { rel: 'jay', right: 1.2, up: 0.1, fwd: 2.2 }, look: { rel: 'jay' }, fov: 38, dur: 4, say: 'jay', line: "Mandi! You came! I knew you'd come. I had it at even money." },
  { cam: { rel: 'player', right: -1.0, up: 0.1, fwd: 2.0 }, look: { rel: 'player' }, fov: 38, dur: 4, say: 'mandi', line: 'Hold this.' },
  { cam: { rel: 'jay', right: 0.8, up: 0.2, fwd: 1.6 }, look: { rel: 'jay' }, fov: 40, dur: 4, sub: 'A SPONGE.', say: 'jay', line: "...It's wet." },
] };

const AFTER6 = { type: 'vcall', id: 'a6', title: 'Rescued (Mostly)', time: 'night', people: [
  { who: 'jay', office: 'car', label: 'Jay', sub: 'the passenger seat', cam: 'low' },
  { who: 'kiki', office: 'greenroom', label: 'Kiki', sub: "Kiki's chair · the salon" },
  { who: 'bernie', office: 'car', sub: 'double-parked, forever', cam: 'low', late: true },
  { who: P, office: 'car', label: 'Mandi', sub: 'the driver\'s seat', cam: 'low' }],
  lines: [
    V('kiki', 'Is that him? Hold on, hold on. Jay. You owe me a full set.'),
    V('jay', 'Hi, Kiki. Hi, Bernie. Mandi. I mean it. I am really, truly, all the way sorry.'),
    V(P, 'Okay.'),
    Ev('join', 'bernie'),
    V('jay', 'And I learned something. About ducks. And about you. Mostly about you.'),
    V('jay', "So, real quick. Can I bet on you? Tonight? I've got a really good feeling about you."),
    V(P, 'No.', { overlap: true }),
    V('kiki', 'No.', { overlap: true }),
    V('bernie', 'No!', { overlap: true }),
    V('jay', "...That's fair. That's a fair room."),
  ] };

const M6 = { id: 'WW-6', title: 'Wrong Way Jay', vehicle: 'kastell', start: '@south-lot', time: 'midnight', weather: 'rain', card: 'slam', verbs: ['drive', 'tail', 'sneak', 'escape'],
  stakes: "Brick says Jay's washing the limo at the stadium lot. Brick didn't tell you.", passLine: 'Jay is in the car. The jacket is not his.',
  steps: [
    { type: 'transition', kicker: '9:48 PM', text: 'THE LAKEFRONT' },
    { type: 'tail', name: "Diego's white limo", car: 'sedan', color: '#F4F2EC', route: ['@south-lot', '@stadium-lot'], ahead: 70, speed: 16, lostDist: 280,
      objective: "Tail Diego's limo to the stadium lot.",
      during: [SAYAT(6, 'mandi', 'A white limo in November. He wants to be seen.'), SAYAT(40, 'mandi', 'Okay, Jay. Wash slowly. I\'m coming.'),
        { type: 'dm', at: 70, from: 'kiki', text: 'Cousin says Jay is in a CHAUFFEUR CAP. A cap, girl. Bring your phone up.', secs: 6 }] },
    { type: 'car', name: 'limo', car: 'sedan', color: '#F4F2EC', at: '@stadium-lot' },
    { type: 'npc', who: 'jay', at: '@stadium-lot' },
    { type: 'npc', who: 'deckhand-red', at: '@stadium-lot' },
    { type: 'npc', who: 'deckhand-blue', at: '@stadium-lot' },
    { type: 'stealth', mode: 'walk', to: '@stadium-lot', objective: 'Sneak past the deckhands to Jay.',
      units: [{ '@': 'stadium-lot', kind: 'scout', roam: 25, name: 'Deckhand Red' }, { '@': 'stadium-lot', kind: 'scout', radius: 25, side: 1, name: 'Deckhand Blue' }],
      onDetect: { pursuit: { count: 2, level: 2 } },
      during: [SAYAT(4, 'mandi', 'Slides on asphalt. Very quiet. Very fashion.', { how: 'hushed' })] },
    R1,
    { type: 'passenger', checkpoint: true, who: 'jay', board: true, seat: 'front', secs: 2 },
    { type: 'pursuit', kind: 'crew', name: "Diego's deckhands", level: 2, count: 2, behind: 55, goal: 'lose', loseDist: 220, loseTime: 20, objective: 'Lose the deckhands.',
      during: [SAYAT(3, 'jay', 'Is that my jacket?'), SAYAT(5, 'mandi', 'No.'), SAYAT(8, 'jay', "It is. That's my jacket, on the seat."), SAYAT(11, 'mandi', "It's mine now."),
        SAYAT(20, 'jay', 'Left! No, your left! Okay, both lefts were fine.'), SAYAT(32, 'jay', "You drive like you're mad at me. ...Because you're mad at me.")] },
    AFTER6,
  ] };

// ── Mission 7: Double or Nothing ──
const PLAN = { type: 'vcall', id: 'plan', title: 'The Crew', time: 'night', people: [
  { who: 'kiki', office: 'greenroom', label: 'Kiki', sub: "the salon · the stream rig" },
  { who: 'gloria', office: 'car', label: 'Gloria', sub: 'her car · the ledger', cam: 'low' },
  { who: 'jay', office: 'car', label: 'Jay', sub: 'the passenger seat', cam: 'low' },
  { who: 'bernie', office: 'car', sub: 'double-parked, emotionally', cam: 'low' },
  { who: P, office: 'car', label: 'Mandi', sub: 'the driver\'s seat', cam: 'low' }],
  lines: [
    V('gloria', 'Jay is off the boat. The ledger is yours. Here is what it proves.'),
    Ev('share', 'gloria', { slide: { title: 'TONIGHT · THE BIG DERBY', lines: ['Every bettor in the city on number seven', 'Seven built to sink', 'The house keeps it all'] } }),
    V('kiki', 'And I stream the race. Live. With the ledger on screen. Forty thousand people already follow the leopard.'),
    V(P, "So everybody sees it's rigged while it's rigged."),
    V('jay', 'What if seven wins, though?'),
    V('gloria', 'Seven cannot win. Seven has a keel.'),
    V('jay', "One seven can't. But we've got a van full of ducks. How many sevens?"),
    V('gloria', '...Nine hundred and eighty. Every spare seven he owns.', { pre: 0.5 }),
    V(P, 'Jay. That is the first good bet you have ever made.'),
    V('jay', 'I have a system.'),
    V('bernie', "I'm in! What am I in?"),
    Ev('unshare', 'gloria'),
    V(P, "Kiki, you're in the minivan. I'm behind you to the riverwalk. Then the ducks go in upstream."),
  ] };

const PHONES = { type: 'cutscene', id: 'phones', shots: [
  { cam: { rel: 'player', right: 3, up: 3, fwd: 8 }, look: 'player', fov: 50, dur: 4, sub: 'NINE HUNDRED AND EIGHTY NUMBER SEVENS FLOAT PAST THE FINISH.' },
  { cam: { rel: 'player', right: -2, up: 1.5, fwd: 4 }, look: 'player', fov: 44, dur: 5, sub: "KIKI'S STREAM: THE LEDGER, LIVE. THE BETTORS' PHONES LIGHT UP.",
    lines: [L('kiki', 'Forty-one thousand watching. Hold on, hold on, the comments just found out about the keel.'), L('mandi', 'And Diego?'), L('kiki', 'Diego just found out about the comments.')] },
] };

const M7 = { id: 'DN-7', title: 'Double or Nothing', vehicle: 'kastell', start: '@salon', time: 'midnight', weather: 'mist', card: 'slam', verbs: ['drive', 'follow', 'fight'],
  stakes: "The big race. Gloria's ledger, Kiki's stream, and nine hundred and eighty sevens.", passLine: 'A thousand sevens won. The house lost.',
  steps: [
    { type: 'transition', kicker: '10:31 PM', text: 'THE BIG DERBY' },
    PLAN,
    { type: 'convoy', checkpoint: true, route: ['@salon', '@riverwalk'], speed: 12, car: 'minivan', color: '#C8A2E8', name: "Kiki's minivan", who: 'kiki', band: [8, 40], hp: 140,
      objective: "Stay behind Kiki's minivan to the riverwalk.",
      during: [SAYAT(5, 'kiki', 'The rig is on the roof. Do not let anyone tap me, girl, that rig was a birthday present.'), SAYAT(35, 'jay', "She's going thirty-one in a thirty. That's wild."), SAYAT(65, 'kiki', "Riverwalk! I'm setting up. Go drop the ducks!")] },
    { type: 'timer', name: 'race', seconds: 180, label: 'RACE', fail: 'hard', why: 'The race started without the sevens. Seven sank, the house won.' },
    { type: 'drive', to: '@upstream', objective: 'Get the ducks **upstream** before the race starts', stopTimer: 'race',
      during: [SAYAT(4, 'jay', "Upstream. Okay. Which way is upstream? Rivers don't have signs."), SAYAT(9, 'mandi', 'This river runs backwards, Jay. Trust me.')] },
    { type: 'search', at: '@upstream', label: 'tip the ducks in', prop: 'bag', secs: 2.5, objective: 'Tip the ducks into the river.' },
    PHONES,
    { type: 'npc', who: 'deckhand-red', at: '@upstream' },
    { type: 'npc', who: 'deckhand-blue', at: '@upstream' },
    { type: 'fight', enemies: ['deckhand-red', 'deckhand-blue'], arena: '@upstream', win: 'ko-all', rules: 'full', timer: 25, objective: 'Hold the riverbank.',
      during: [SAYAT(3, 'jay', "I'll hold your jacket!"), SAYAT(5, 'mandi', 'You will not hold my jacket.'), SAYAT(15, 'jay', 'Behind you! The red one! The other red one!')] },
    say('kiki', "Girl. The sevens won. A thousand sevens won. The bettors are swimming after them.", { wait: true }),
  ] };

// ── Mission 8: Bridge Up ──
const D3 = { type: 'vcall', id: 'd3', title: 'DV · Private Line', time: 'night', layout: 'speaker', people: [
  { who: 'diego', office: 'car', label: 'Diego Vale', sub: 'the limo · leaving', cam: 'low' },
  { who: P, office: 'car', label: 'Mandi', sub: 'E Ohio St', cam: 'low' }],
  lines: [
    V('diego', 'Brava. Truly. A thousand sevens. I could not have staged it better.'),
    V(P, "You're running."),
    V('diego', "I'm relocating, with the night's take, which is still technically mine. The bridges go up at eleven for the boats."),
    Ev('freeze', 'diego'),
    Ev('unfreeze', 'diego'),
    V('diego', 'By the time they come down, I am a rumour. Regards to the leopard.'),
    V(P, 'Jay. Seatbelt.'),
  ] };

// (the jump is played, not cut to: the bridge step rises as the Kastell comes down Michigan Ave behind the limo (near),
// the bells and Jay's lines over it, and the hero shot is the engine's (jump): slow motion as she leaves the north leaf,
// the lens flying alongside her on the river's side, the Kastell lit against the Loop's towers, handed back as she lands)
const JUMP = { type: 'bridge', id: 'bridge-up', checkpoint: true, at: '@bridge', to: 12, dur: 3, near: 170,
  jump: { scale: 0.3, side: 'right', ahead: -7, out: 14, up: 0.5, lead: 6, fov: 44, key: 80, hold: 0.7 },
  do: [
    SAYAT(0.2, 'jay', 'The bells. Those are the bridge bells.'),
    SAYAT(2.6, 'jay', "Mandi. Mandi, the bridge is going up. The bridge is going up!"),
    SAYAT(5.6, 'mandi', 'I know.', { how: 'deadpan' }),
  ] };

const FINAL = { type: 'vcall', id: 'final', title: "Velvet Lake Casting · Swim '27 · Look 14", time: 'night', end: 'leave', people: [
  { who: 'simone', office: 'startup', label: 'Simone Vance', sub: 'Velvet Lake Casting' },
  { who: 'bernie', office: 'car', sub: 'parked. Legally.', cam: 'low' },
  { who: 'kiki', office: 'greenroom', label: 'Kiki', sub: "Kiki's chair · 41K live" },
  { who: 'gloria', office: 'car', label: 'Gloria', sub: 'a train out of town · the ledger', cam: 'low' },
  { who: P, office: 'car', label: 'Mandi', sub: 'the riverwalk · dawn', cam: 'low' },
  { who: 'jay', office: 'car', label: "JAY'S PHONE", sub: 'somewhere, sorry', late: true, cam: 'low' }],
  lines: [
    V('simone', "The new client watched Kiki's stream. All of it. You're the face. In the leopard."),
    V(P, '...I got it?'),
    V('simone', 'You got it. Try to forget your keys more often.', { how: 'warm' }),
    V('bernie', "Can you hear me? Can you hear me? I can hear me! Sweetheart, you're the face!", { how: 'shout' }),
    V('bernie', "I'm crying. My signal works and I'm crying."),
    V('kiki', 'GIRL!', { how: 'shout' }),
    V('gloria', 'The ledger is with the river police. I rounded nothing.'),
    Ev('join', 'jay'),
    V('jay', 'So... are we back?'),
    V(P, "I said I'd get you back. I never said I'd take you back.", { pre: 0.6 }),
    V('jay', 'Can I at least have the jacket?'),
    V(P, 'No.'),
  ] };

const M8 = { id: 'BU-8', title: 'Bridge Up', vehicle: 'kastell', start: '@ohio', time: 'midnight', weather: 'rain', card: 'slam', verbs: ['drive', 'tail', 'fight'],
  stakes: 'Diego is leaving with the cash. The bridges go up at eleven.', passLine: "I said I'd get you back. I never said I'd take you back.",
  steps: [
    { type: 'transition', kicker: '10:58 PM', text: 'THE RIVER BRIDGES' },
    D3,
    // (the bridge first, so a retry from its checkpoint arms it again: it waits for her near it, then rises)
    JUMP,
    { type: 'tail', name: "Diego's white limo", car: 'sedan', color: '#F4F2EC', route: ['@ohio', '@north-ave', '@bridge'], ahead: 60, speed: 20, ring: 10, spotTime: 10, lostDist: 220,
      objective: 'Catch the limo before the bridge.',
      during: [SAYAT(4, 'jay', "He's got a tiny flag on the hood. That's how you know he's evil."), SAYAT(30, 'mandi', 'Hold on to something.'),
        SAYAT(34, 'jay', "I'm holding the sponge!")] },
    // (the limo pulled up just past the bridge, on Michigan Ave: she lands, pulls up on it, and Diego gets out)
    { type: 'drive', to: '@bridge', radius: 24, objective: 'Pull up on the limo.' },
    { type: 'car', name: 'limo8', car: 'sedan', color: '#F4F2EC', at: '@bridge' },
    { type: 'npc', who: 'diego', at: '@bridge' },
    say('diego', 'Leopard. I have never thrown a punch. I would like you to know I am about to.', { wait: true }),
    { type: 'fight', enemies: ['diego'], arena: '@bridge', win: 'ko-all', rules: 'lesson', timer: 20, objective: 'Settle up with Diego.',
      during: [SAYAT(3, 'diego', 'Was that one? Did I throw one?'), SAYAT(9, 'mandi', 'That was a wave, Diego.'), SAYAT(15, 'diego', 'My loafers! These are Italian!')] },
    say('mandi', "Forty thousand, Diego. Jay's debt. Paid in full, in ducks.", { wait: true }),
    say('jay', "He fell in. He fell in the river with all the sevens. He's fine, he's floating. Everything in there floats."),
    FINAL,
    { type: 'actEnd', title: "MANDI'S REVENGE", story: ["She walks the riverwalk at dawn, in the leopard and the slides, with Jay's jacket over her arm."],
      stats: [{ label: 'Ducks', value: '980 sevens, all winners' }, { label: 'Jay', value: 'returned, not taken back' }] },
  ] };

// (the medals: gold, silver and bronze by the time from the mission's start and its damage; first targets, before any
// test drive: each mission's outline length plus a minute)
const MEDALS = { 'OF-1': [270, 360, 540], 'KC-2': [300, 390, 540], 'LL-3': [240, 330, 480], 'MP-4': [270, 360, 510],
  'PP-5': [270, 360, 510], 'WW-6': [300, 390, 540], 'DN-7': [330, 420, 600], 'BU-8': [300, 390, 540] };
for (const m of [M1, M2, M3, M4, M5, M6, M7, M8]) { const [g, s, b] = MEDALS[m.id]; m.medals = { gold: { secs: g, damage: 10 }, silver: { secs: s, damage: 30 }, bronze: { secs: b } }; }

const pack = {
  storykit: 2, id: 'mandis-revenge', title: "Mandi's Revenge", kicker: 'CHICAGO, IL', tagline: "I said I'd get you back. I never said I'd take you back.",
  credits: { lines: [
    'Every person in this story is invented. Mandi and Jay are original models made for this game; the rest of the cast is built from CC0 MakeHuman parts.',
    "The Kastell: Mog City's own black off-roader, with no maker's badges; a look-alike with no connection to any car maker.",
  ],
  cast: [
    { name: 'Mandi Reyes', role: 'model, Look 14' }, { name: 'Jay', role: 'her ex' }, { name: 'Diego Vale', role: 'the Duck Derby' },
    { name: 'Kiki Moss', role: 'nail tech and livestreamer' }, { name: 'Bernie Szabo', role: 'her agent' }, { name: 'Gloria Steele', role: "Diego's accountant" },
    { name: 'Brick', role: "Diego's enforcer" }, { name: 'Simone Vance', role: 'casting director' },
    { name: 'Deckhand Red', role: 'deckhand' }, { name: 'Deckhand Blue', role: 'deckhand' }] },
  // (a ring that runs out is answered; the calls on Mog City's foldable phone, MogCity docs/VCALL.md)
  calls: { ringOut: 'answer', style: 'fold' },
  // (its people lit and framed for the close lens: Mog City's charlight.js, a soft key at eye level, eye-level closes,
  // a portrait lens on the calls; the owner's "make her as attractive as possible", 25 Nov)
  look: 'cinematic',
  base: { engine: 'mogcity-1', city: 'hometown', cityBuild: `hometown-${lock.buildId}`.slice(0, 39),
    hometown: { place: lock.place, compiler: lock.buildId, tiles: lock.tiles, formatVersion: lock.formatVersion, grid: lock.grid, domain: lock.domain, origin: lock.origin, k0: lock.k0, gamma0: lock.gamma0, yOffset: lock.yOffset, waterLevel: lock.waterLevel } },
  // (the weather round the camera, MogCity js/weather.js: a drizzle on every night mission; the chases' own rain, the
  // river's mist: each mission's `weather`)
  dressing: { time: 'twilight', season: 'autumn', weather: 'clear', holiday: [], nightWeather: 'drizzle' },
  hero: 'mandi', ride: 'kastell', opening,
  hud: { calm: true },
  // (the hero's car: Mog City's Kastell (stock gwagon), the black luxury off-roader, paint only, no badges)
  places, cast, vehicles: [{ stock: 'gwagon', id: 'kastell', label: 'Kastell', paint: '#060708' }],
  acts: [
    { id: 'act-1', name: 'The Call', missions: [M1, M2] },
    { id: 'act-2', name: 'The Ducks', missions: [M3, M4] },
    { id: 'act-3', name: 'The Offer', missions: [M5, M6] },
    { id: 'act-4', name: 'Revenge', missions: [M7, M8] },
  ],
};
writeFileSync(OUT, JSON.stringify(pack, null, 1) + '\n');
console.log('wrote', OUT, JSON.stringify(pack).length, 'bytes');
