// Mandi's Revenge: writes storykit/packs/mandis-revenge.json (Story Kit v2, a showcase in the Chicago town) from the
// owner-approved story outline (25 Nov 2026). Every conversation scene is a video call (vcall) and every side character
// is seen only on the foldable phone (calls.style 'fold'): their car-phone calls show them on its inner screen
// (call.video), and a vcall plays on it, big, in the middle. The one exception is the opening's audition, which is on
// Mandi's laptop (device 'laptop': the full-screen call in a laptop's frame). Run from the GameMog checkout:
//   node storykit/showcase/mandis-revenge/gen.mjs
// The town's pin (base.hometown) is read from town.json.gz (the CityPackage the pack is gated with); the people's
// sheets are sheets/ (written by sheets.mjs). Mandi's and Jay's bodies are private premium assets, never in this repo.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
// (the voice record, written by scripts/storykit-showcase-mandi.ts --voice <dir>)
const VOICE = 'deploy/migrations/mandis-revenge-voice.json';
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
// (a shot with one spoken line: its say and line, with the line's delivery; a shot's lines are 2 or more)
const S1 = (l) => ({ say: l.who, line: l.text, ...opt(l) });

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
    speech: { rhythm: 'none', habit: 'cracks his knuckles', jokes: 'none', never: 'speaks', motifs: ['the red hat'] } },
  { id: 'deckhand-blue', color: '#2456A6', sheet: sheet('deckhand-blue'), anchor: 'fixer',
    voice: { id: 'deckhand-blue-v1', blend: { am_echo: 0.7, am_onyx: 0.3 }, speed: 1.0, pitch: -0.6, description: 'a stocky silent man; grunts only' },
    speech: { rhythm: 'none', habit: 'a whistle', jokes: 'none', never: 'speaks', motifs: ['the blue hat'] } },
];

// ── places (every one a key of the Chicago build's frame; names only, never the real businesses') ──
// 28 Nov, the story pass (the owner: "disappointing, incomplete, not impressive, no polish"; the playtest FIXLIST B2/B3):
// every story place is now the real Chicago place the script names, on the street at it: Jay's lot under the Lake St
// tracks, the pier's Dock St by the wheel (walked out from its foot), the Riverwalk on Wacker (the finish line at LaSalle, upstream at Columbus:
// the river runs backwards, away from the lake, so upstream is east, by Michigan Ave), the stadium's own lot on Waldron Dr. Each start
// that the GPS sent the wrong way first carries the heading of its first leg (README: Pacing).
// 28 Nov (2): the city agent's anchors (Mandi/review/city2/ANCHORS.md, MogCity mandi-city: the Lake St L, the pier and
// its wheel, the Riverwalk's wall, the stadium's lot) are compiled into a newer Chicago bundle than the one this pack is
// pinned to. So that one pack plays on both, each anchored place is an `offset` from a key both bundles have (the old
// overture keys stay in the new bundle), measured in the engine (the key's own lane point and heading) to land on the
// anchor's point within a metre: on the new bundle the L, the
// wheel and the river wall stand there; on the r42 bundle the same spot is the same street. (Re-point `@` to the anchor
// keys once production runs the mandi-city bundle and town.json.gz is re-pinned: README.)
const places = {
  studio: { '@': 'parking28', name: "Mandi's block, by the tracks" },
  // (anchor jay-lot: the car park beside the Lake St L, (4367.8, -5316.3))
  // (heading 270: KC-2 starts here facing west along Lake St, toward the salon; facing east, its route looped north over
  // the river and the test drive got stuck twice. The offset is in that heading's frame)
  'jay-lot': { '@': 'restaurant1602', name: "Jay's lot, under the Lake St tracks", heading: 270, offset: { right: -16.7, fwd: 17.2 } },
  // (Kiki's salon on W Lake St, under the same L as Jay's lot, 1.1 km west: the drive was 2.4 km to the old West Loop lot)
  salon: { '@': 'restaurant1373', name: "Kiki's salon" },
  // (M7: the crew meets on Franklin by the river, a block from the Riverwalk: the convoy is a minute, not four)
  crew: { '@': 'parking130', name: 'the lot on Franklin, by the river' },
  warehouse: { '@': 'parking15', name: 'the warehouse lot' },
  ramp: { '@': 'parking225', name: 'the ramp to the lower level' },
  // (heading: its lane faces the way out to the mirror plaza; the GPS's first leg was a U-turn on Wacker: 2.5 km, now 2.0)
  'lower-level': { '@': 'parking103', name: 'the lower level', heading: 186 },
  mirror: { '@': 'park143', name: 'the mirror plaza' },
  harbor: { '@': 'park15', name: 'the harbor drive' },
  // (the pier: she parks at its foot on E Illinois St and walks out to the wheel (anchor wheel's foot, (6199.7, -6162.3)):
  // every car route along the pier looped 2-6 km on the r42 lanes)
  'pier-foot': { '@': 'restaurant1151', name: 'the foot of the pier' },
  pier: { '@': 'restaurant1805', name: 'the pier, by the wheel', offset: { right: 51.5, fwd: 27.6 } },
  'south-lot': { '@': 'parking182', name: 'the south end of the avenue' },
  // (anchor stadium-lot is this key's own point, (5827.7, -2631.3))
  'stadium-lot': { '@': 'parking165', name: "the stadium's lot" },
  // (the Riverwalk on Wacker at LaSalle: the finish line, Kiki's stream; the west-end anchor is 300 m from the crew's lot)
  riverwalk: { '@': 'park137', name: 'the Riverwalk' },
  // (anchor riverwalk-east's foot by the river wall (4574.0, -5515.3), walked to from the finish: the ducks and the
  // fight, upstream, as the river runs backwards, away from the lake)
  'upstream-wall': { '@': 'bank168', name: 'the river wall, upstream', offset: { right: -48.9, fwd: 7.4 } },
  // (M8's chase starts here, 27 Nov (the owner: "cut to 60 seconds"): E Ohio St, a block west of Michigan Ave, the limo
  // ahead: east on Ohio, then south down Michigan Ave onto the bridge, 0.8 km)
  'ohio': { '@': 'parking83', name: 'E Ohio St, north of the river' },
  'north-ave': { '@': 'bank212', name: 'Michigan Ave, north of the river' },
  bridge: { '@': 'parking73', name: 'the river bridge' },
  // (the epilogue: the pier at first light, at the foot of the wheel (anchor wheel); Jay 2.5 m north of her, landward: she
  // stands on the harbor side, so the lens on her from his side has the skyline across the water behind her: the coordinator's 28 Nov note, "Chicago unmistakable behind her")
  dawn: { '@': 'restaurant1805', name: 'the pier at dawn', offset: { right: 51.5, fwd: 27.6 } },
  'dawn-jay': { '@': 'restaurant1805', name: 'the pier at dawn', offset: { right: 49, fwd: 27.9 } },
};

// ── the opening (a cutscene: the place card, Mandi at her ring light, Diego in his lounge, the title over the Kastell) ──
// (night: Chicago in late November is dark by 4:30; 7:40 PM is full night, never the golden dusk it played as: H5)
const opening = {
  place: '@studio', time: 'midnight',
  sets: {
    studio: { room: 'office-study', light: 'night', people: [{ who: 'mandi', at: [0, -0.6], face: 0, pose: 'idle', look: 'lens' }] },
    lounge: { room: 'office-exec', light: 'night', people: [{ who: 'diego', at: [0, -1.2], face: 0, pose: 'sitTalk', look: 'lens' }] },
  },
  shots: [
    { cam: { rel: 'player', right: -4, up: 70, fwd: -80 }, to: { rel: 'player', right: 0, up: 35, fwd: -50 }, look: 'player', fov: 55, dur: 6, where: { name: 'Chicago, Illinois', sub: 'The Loop · 7:40 PM · November' } },
    { set: 'studio', cam: { rel: 'mandi', right: 0.2, up: 0.1, fwd: 1.5 }, look: { rel: 'mandi' }, fov: 38, dur: 6, card: { who: 'mandi', is: 'hero', role: 'model, Look 14, one shot at this' },
      say: 'mandi', line: 'Ring light on. Hair done. Laptop at the angle Bernie swears by. Okay, Chicago. Cast me.' },
    { set: 'studio', cam: { rel: 'mandi', right: -0.5, up: 0.25, fwd: 1.1 }, look: { rel: 'mandi' }, fov: 40, dur: 5,
      say: 'mandi', line: 'And nobody calls. Not Jay. Especially not Jay. Tonight is about me.', how: 'deadpan' },
    // (the antagonist's card: Diego in his riverboat lounge, the night's Derby on the river below)
    { set: 'lounge', cam: { rel: 'diego', right: 0.3, up: 0.1, fwd: 1.6 }, look: { rel: 'diego' }, fov: 36, dur: 7, card: { who: 'diego', is: 'antagonist', role: "runs the river's Duck Derby, from a riverboat" },
      say: 'diego', line: 'Number seven is the favourite again tonight. He has never once won. Somebody always believes. Pour the champagne.', how: 'smug' },
    // (the Kastell at the kerb, the hero by it: no stage-direction caption, the car is the shot)
    { cam: { rel: 'player', right: 5, up: 1.6, fwd: 7 }, look: { rel: 'player', up: -0.2 }, fov: 48, dur: 4 },
    { cam: { rel: 'player', right: -6, up: 4, fwd: -16 }, look: 'player', dur: 4, title: true },
  ],
};

// ── Mission 1: Out of Frame ──
// AU1: the audition on her laptop (the one call not on the fold phone): three people, every tile live (the playtest's
// three "Waiting to join..." tiles are gone). The client is on the call with his camera off, and Simone says so: the
// plant MP-4 pays off (Velvet Lake's client was Diego). Kiki's texts arrive over the grid as her screen share. Jay's
// kidnapping is no longer on the laptop: it is a call on the drive (J1), Jane-and-Dan style, so the player has the wheel
// a minute sooner.
const AU1 = { type: 'vcall', id: 'au1', title: "Velvet Lake Casting · Swim '27 · Look 14", time: 'night', device: 'laptop', people: [
  { who: P, office: 'study', label: 'Mandi Reyes', sub: 'her studio corner · ring light' },
  { who: 'simone', office: 'startup', label: 'Simone Vance', sub: 'Velvet Lake · client on, cam off' },
  { who: 'bernie', office: 'car', sub: 'his car · double-parked', cam: 'low' }],
  lines: [
    V('simone', 'Look Fourteen. Mandi. Our client is on the line with his camera off. He likes to listen first.'),
    V(P, 'Hi, client.'),
    V('simone', 'He does not say hi. Give me summer on the lake.'),
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
    Ev('share', 'simone', { slide: { title: 'KIKI · 2 MORE', lines: ['he is wearing a SIGN', 'a sign that says I OWE DIEGO'] } }),
    V(P, 'Who is Diego?', { how: 'hushed' }),
    V('simone', 'Is Diego part of the look?'),
    V(P, 'Nobody is part of the look. Sorry. Go on.', { overlap: true }),
    Ev('unshare', 'simone'),
    V('simone', 'The client says thank you. He says he has seen enough.', { pre: 0.6 }),
    V(P, 'Is that good?'),
    V('simone', "We'll be in touch."),
    V('bernie', "She said in touch! That's basically a... Mandi? Sweetheart? Can you hear me n...", { cut: 0.75 }),
    Ev('drop', 'bernie'),
  ] };

// the leaving beat: she closes the laptop (no caption: the shot is her face), Jay's text lands, she takes Jay's leather
// jacket off the hook (she never gave it back; she carries it, the bikini and the slides stay on: the owner, 25 Nov)
// (prop hook: the jacket over her arm, MogCity props `jacket`; until it exists the line carries it)
const LEAVE = { type: 'cutscene', id: 'leave', set: { room: 'office-study', light: 'night', people: [{ who: 'mandi', at: [0, -0.6], face: 0, pose: 'phone' }] }, shots: [
  { cam: { rel: 'mandi', right: 0.1, up: 0.05, fwd: 1.3 }, look: { rel: 'mandi' }, fov: 36, dur: 3.5, say: 'mandi', line: '"Pick up. Emergency. There is a boat."', how: 'deadpan' },
  { cam: { rel: 'mandi', right: -0.4, up: 0.1, fwd: 1.0 }, look: { rel: 'mandi' }, fov: 34, dur: 3, say: 'mandi', line: 'Of course there is a boat.', pre: 0.6 },
  { cam: { rel: 'mandi', right: 0.6, up: 0.3, fwd: 1.6 }, look: { rel: 'mandi' }, fov: 40, dur: 5,
    say: 'mandi', line: "Okay. No time to change. Keys, phone, and his jacket. He's not getting it back either." },
] };

// J1: Jay on the car phone from the riverboat (video: Diego's lounge behind him), the kidnapping told while she drives;
// Brick takes the phone off him, politely. B1: Bernie rings in behind it (call waiting) with what he knows about Diego.
const J1 = { type: 'call', who: 'jay', auto: true, inCar: true, at: 2, video: { office: 'exec' },
  lines: [
    L('jay', "Mandi! You picked up. You never pick up."),
    L('mandi', 'You texted emergency. And boat.'),
    L('jay', "Okay, so, technically, I'm kind of kidnapped.", { how: 'hushed' }),
    L('mandi', 'Kind of.'),
    L('jay', "There's a sign round my neck. It says I owe Diego. Very nice handwriting, honestly."),
    L('mandi', 'Who is Diego?'),
    L('jay', 'Diego Vale. He runs the Duck Derby. On the river. With the ducks.'),
    L('mandi', 'How much, Jay?'),
    L('jay', 'Forty thousand. On a duck. Number seven. He was so fast in practice.'),
    L('mandi', 'A rubber duck.'),
    L('jay', "Quackson. He's got a little racing stripe. He came eleventh. Of eleven."),
    L('mandi', 'Where are you?'),
    L('jay', "A boat with a chandelier. It smells like cologne and pond. Mandi, I think he wants me forever.", { cut: 0.85 }),
    L('brick', "Hello. Sorry. This is Brick. I'm going to take the phone now, Jay."),
    L('mandi', 'Who is this?'),
    L('brick', 'I work for Mr. Vale. He says the number is real, and the time is midnight. Sorry about this.'),
    L('mandi', 'Is he okay?', { pre: 0.6 }),
    L('brick', "He's polishing the brass. He's very bad at it. Goodnight, Mandi."),
  ],
  wrap: [L('mandi', "I'm here. His car's here. Of course his car's here.")],
  hold: { pause: [L('jay', "Wait, who is that? Is that Bernie? Don't tell Bernie.")], resume: [L('jay', 'Okay, hi, still kidnapped.')] } };

const B1 = { type: 'call', who: 'bernie', auto: true, inCar: true, at: 58, video: { office: 'car' },
  lines: [
    L('bernie', "Sweetheart! Simone said in touch. In touch is basically a yes. In this business that's a parade."),
    L('mandi', 'Bernie, Jay just got kidnapped.'),
    L('bernie', 'During the audition? Was it a good angle for you?'),
    L('mandi', 'Bernie.'),
    L('bernie', 'Sorry, sorry. Who has him?'),
    L('mandi', 'A man called Diego Vale. Forty thousand, on a rubber duck.'),
    L('bernie', "Diego Vale. The Duck Derby. Oh, sweetheart, everybody on the river knows that guy. He's...", { cut: 0.6 }),
    L('mandi', 'Bernie? You cut out at "he\'s."'),
    L('bernie', "...very theatrical. Wears a white suit in November. Don't sign anything he gives you."),
    L('mandi', 'Why would he give me anything to sign?'),
    L('bernie', "Everybody gives a pretty girl a contract. That's the whole city. Where are you going?"),
    L('mandi', "Jay's lot. Under the Lake Street tracks. He parks there when he's hiding from me."),
    L('bernie', "In that outfit? It's November!"),
    L('mandi', "The heater's on full. I've got his jacket on the seat. I'm fine."),
  ],
  extra: [
    [L('bernie', "You know what Simone said after your first audition? 'She's got a face that waits for you.'"), L('mandi', 'Is that good?'),
      L('bernie', "I don't know! I've been chewing on it for two years!"), L('mandi', 'Put it on my card, Bernie.')],
    [L('bernie', "Hold on, I'm double-parked and a man in a vest is writing me a poem."), L('mandi', "That's a ticket, Bernie."),
      L('bernie', "It's got a rhyme scheme. Let me call you right... I'll call you righ...", { cut: 0.7 })],
  ],
  wrap: [L('mandi', "I'm at the lot. Bernie, I'll call you after."), L('bernie', 'Be careful, sweetheart. And smile with your eyes, in case.')],
  hold: { pause: [L('bernie', "Go, go. I'll hold. I've been holding my whole career.")], resume: [L('bernie', "You're back! What did I miss? Is he rescued?")] } };

// D1: Diego, first face, from his riverboat lounge: the terms, $40,000 by midnight. Jay polishes brass behind him (a
// tile of his own on the boat, muted); he calls her "the girl in the leopard" and she seems familiar to him (the plant)
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
    V(P, 'Have we met? You look at me like we have.'),
    V('diego', 'I have a very good memory for faces. Yours, especially.', { pre: 0.6, how: 'smug' }),
    V(P, 'And his car?'),
    V('diego', 'Collateral. A man will come by to collect it, and to keep you calm. Do let him.'),
    V(P, "I'm extremely calm."),
    V('diego', 'Regards to the leopard.'),
  ] };

const M1 = { id: 'OF-1', title: 'Out of Frame', vehicle: 'kastell', start: '@studio', time: 'midnight', weather: 'clear', card: 'slam', verbs: ['drive', 'fight'],
  stakes: "Forty thousand dollars on a rubber duck. Jay's kidnapped, and you're still in the bikini.", passLine: 'Midnight. Forty thousand. And a man called Diego.',
  steps: [
    AU1,
    LEAVE,
    { type: 'transition', kicker: '7:52 PM', text: "MANDI'S REVENGE", sub: "I said I'd get you back.", secs: 4 },
    { type: 'drive', to: '@jay-lot', objective: "Get to **Jay's lot** under the Lake St tracks", during: [J1, B1] },
    // (parked at the lot: the calls say their last lines and wrap before she gets out, 30 s at most)
    { type: 'wait', secs: 30, call: true },
    // (the coupe is the search's own prop, parked at the ring in Jay's red: the playtest's H4, a ring 15 m from a car parked
    // elsewhere; prop hook for the driver-door search animation: engine)
    { type: 'search', at: '@jay-lot', label: "search Jay's car", on: 'place', prop: 'sedan', propColor: '#B3121F', secs: 2, objective: "Search **Jay's red coupe**." },
    say('mandi', 'A betting slip. Duck Derby. Forty thousand, number seven, "Quackson." He signed it with a heart.'),
    { type: 'dm', from: 'kiki', text: "Girl. GIRL. His story has a boat, a sign, and a man in a white suit. Who is the white suit.", secs: 6 },
    D1,
    { type: 'npc', who: 'deckhand-red', at: '@jay-lot' },
    say('mandi', "You're the man who keeps me calm? Great. Watch this.", { how: 'deadpan' }),
    { type: 'fight', enemies: ['deckhand-red'], arena: '@jay-lot', win: 'ko-all', rules: 'lesson', timer: 25, objective: 'Stay calm. Make **him** stay calm.',
      during: [SAYAT(3, 'mandi', 'These are slides. I am fighting you in slides.'), SAYAT(9, 'mandi', "That's for the sign round his neck."),
        SAYAT(15, 'mandi', 'And that one is for the handwriting.')] },
    say('mandi', 'Okay. Forty thousand by midnight. Kiki knows everybody. Kiki will know somebody.', { wait: true }),
  ] };

// ── Mission 2: Kiki's Chair ──
// K1 was a stop-and-talk video call on black after a silent two-minute drive (kc2-01, kc2-02). It is the drive now: Kiki
// from her salon chair on the car phone, live to her followers, the whole way to the salon, with Bernie heard in her
// comments. KT runs the tail, with its react pools.
const K1 = { type: 'call', who: 'kiki', auto: true, inCar: true, at: 2, video: { office: 'greenroom' }, span: 1,
  lines: [
    L('kiki', "Girl, you're live, say hi, eleven hundred people are watching you drive in a bikini."),
    L('mandi', 'Kiki, turn it off.'),
    L('kiki', "Hold on, hold on, I'm turning it off. ...It's off. It's mostly off."),
    L('mandi', 'I need forty thousand dollars by midnight.'),
    L('kiki', 'Okay. What have you got?'),
    L('mandi', 'Three hundred and twelve.'),
    L('kiki', "So we're short thirty-nine thousand, six hundred and eighty-eight. I did your nails, I can do math."),
    L('mandi', "Is that Bernie in your comments?"),
    L('kiki', 'He says he can do eight hundred. And a lunch. He typed "and a lunch" four times.'),
    L('mandi', 'Tell him thank you.'),
    L('kiki', "Okay, real talk. My cousin runs ducks for the Derby. Every race night the runners carry the take in a yellow van."),
    L('mandi', 'The take. As in the money.'),
    L('kiki', "It leaves my block at half past. Yellow, loud, a duck on the roof. You can't miss it."),
    L('mandi', "So I follow the duck van and take Diego's money to pay Diego."),
    L('kiki', "Girl, that's not a crime, that's a refund."),
  ],
  extra: [
    [L('kiki', "My client wants to know if the leopard is real."), L('mandi', "It's a print, Kiki."), L('kiki', "She says that's what a real leopard would say.")],
    [L('kiki', 'How did Jay even meet a crime boss?'), L('mandi', 'At a duck race. On a boat.'), L('kiki', "That's not meeting a crime boss, that's being on a field trip with one."),
      L('mandi', 'He wore my jacket to it. His jacket. The one I took.')],
    [L('kiki', 'Do you still love him?', { pre: 0.6 }), L('mandi', "I'm driving, Kiki."), L('kiki', "That's not a no."), L('mandi', "It's a driving.")],
    [L('kiki', 'The comments want to know what Jay did.'), L('mandi', 'Forty thousand dollars on a rubber duck.'), L('kiki', 'They said "which duck."'), L('mandi', 'Number seven.'),
      L('kiki', 'They said "oh no. Not seven."')],
  ],
  wrap: [L('kiki', "I see you on the map! The van's out front. Don't look at it. Look at it a little. Go!")] };

const KT = { type: 'call', who: 'kiki', auto: true, inCar: true, at: 3, video: { office: 'greenroom' },
  lines: [
    L('kiki', "Okay, I'm watching you on the map. Don't get close. Duck people are paranoid."),
    L('mandi', 'Why are duck people paranoid?'),
    L('kiki', "Because everybody wants the ducks! Hold on, hold on, my client's nail just popped off."),
    L('mandi', 'Kiki. Focus.'),
    L('kiki', "I'm focused. I can do a full set and a car chase. So what's the plan with Jay?"),
    L('mandi', 'I get him off the boat.'),
    L('kiki', 'And then?'),
    L('mandi', "And then I drop him at his mother's and I go home."),
    L('kiki', 'Girl, you said that last time. And the time with the horse.'),
    L('mandi', 'The horse was not my fault.'),
    L('kiki', "It was a little bit your fault. You gave it a carrot. It followed you for a mile."),
  ],
  extra: [
    [L('kiki', "My comments are asking if you're cold."), L('mandi', "Tell them I'm in a heated luxury vehicle."), L('kiki', "They're asking what kind."), L('mandi', 'The kind that gets my ex back.')],
    [L('kiki', 'My cousin says the van guy stops for every yellow light.'), L('mandi', 'A careful criminal.'), L('kiki', 'He failed his test four times. He respects yellow now.')],
  ],
  wrap: [L('kiki', "It stopped! The warehouses. Go slow, go quiet, and don't lose a slide.")],
  react: {
    tooClose: [L('kiki', "Too close! Girl, you're on its bumper!"), L('kiki', 'Back off, back off, they can see your headlights.')],
    lost: [L('kiki', "Where did it go? I lost it on the map."), L('kiki', 'Left! I think it went left. Or right. Go!')],
    hit: [L('kiki', 'Was that you or a dumpster?'), L('kiki', 'The comments heard that. The comments are worried.')],
  } };

const M2 = { id: 'KC-2', title: "Kiki's Chair", vehicle: 'kastell', start: '@jay-lot', time: 'midnight', weather: 'drizzle', card: 'slam', verbs: ['drive', 'tail', 'sneak', 'fight'],
  stakes: "You've got three hundred and twelve dollars. Diego's runners have the night's take.", passLine: 'The van keys. And a very heavy duffel.',
  steps: [
    { type: 'transition', kicker: '8:20 PM', text: 'WEST LOOP' },
    { type: 'drive', to: '@salon', objective: "Get to **Kiki's salon**", during: [K1] },
    { type: 'tail', name: 'the Derby van', car: 'suv', color: '#F2C200', route: ['@salon', '@warehouse'], ahead: 60, speed: 15, lostDist: 280,
      objective: "Follow the yellow Derby van. Don't get spotted.", during: [KT] },
    { type: 'car', name: 'derbyvan', car: 'van', color: '#F2C200', at: '@warehouse' },
    { type: 'npc', who: 'deckhand-blue', at: '@warehouse' },
    { type: 'stealth', mode: 'walk', to: '@warehouse', objective: 'Sneak through the lot to **the van**.',
      units: [{ '@': 'warehouse', kind: 'scout', roam: 20, name: 'The deckhand with the whistle' }],
      onDetect: { set: { label: 'Spotted: the whistle', flags: { spotted2: true } } },
      during: [SAYAT(3, 'mandi', 'Slides on gravel. This is how I die.', { how: 'hushed' }),
        { type: 'dm', at: 8, from: 'jay', text: 'is now a bad time to say sorry', secs: 6 }, SAYAT(15, 'mandi', 'Yes, Jay. It is.', { how: 'hushed' }),
        { type: 'dm', at: 22, from: 'jay', text: 'ok what about now', secs: 5 }] },
    { type: 'npc', who: 'deckhand-red', at: '@warehouse' },
    say('mandi', 'You again. How is your calm?', { how: 'tease' }),
    { type: 'fight', enemies: ['deckhand-red', 'deckhand-blue'], arena: '@warehouse', win: 'ko-all', rules: 'full', timer: 45, objective: 'Get **the van keys**.',
      during: [SAYAT(4, 'mandi', 'Two of you. Fine. I did two auditions today.'), SAYAT(14, 'mandi', 'Is that a whistle? Did you bring a whistle to this?'),
        SAYAT(24, 'mandi', "Keys. Thank you. You've been very professional.")] },
    say('mandi', "Got the keys. And a duffel the size of Bernie. It's going in my trunk.", { wait: true }),
  ] };

// ── Mission 3: Lower Level ──
const BR1 = { type: 'call', who: 'brick', auto: true, inCar: true, at: 4, video: { office: 'car' }, register: 'fast',
  lines: [
    L('brick', "Hello, Mandi. It's Brick. I'm the one behind you. In the black car. Sorry about this."),
    L('mandi', 'Are you calling me during a chase?'),
    L('brick', "I didn't want you to think it was personal. Mr. Vale would like his duffel back."),
    L('mandi', 'Tell Mr. Vale to come and get it.'),
    L('brick', "I am. That's this. That's what this is."),
    L('brick', 'You took that corner very well. I wrote it down.'),
    L('mandi', 'Are you knitting while you drive?'),
    L('brick', "Only at the lights. It's a scarf. It's for my mother."),
    L('mandi', 'What colour?'),
    L('brick', 'Leopard. She saw your audition. She thinks you have kind eyes.', { pre: 0.5 }),
  ],
  extra: [[L('brick', 'Could you slow down a little? My needles keep rolling under the seat.'), L('mandi', 'No.'), L('brick', "That's fair. I'd say no too.")],
    [L('brick', 'Mr. Vale says you have a very good face for leather.'), L('mandi', 'Tell Mr. Vale my face is busy.'), L('brick', "I'll tell him. He won't hear it. He only likes to listen first.")]],
  wrap: [L('brick', "Oh. I've lost you. That's on me. Have a good night, Mandi.")],
  react: {
    tooClose: [L('brick', "I'm right behind you. Sorry. I'll drop back a little."), L('brick', 'You can see my car now. It is the polite one.')],
    hit: [L('brick', "Are you all right? That sounded expensive."), L('brick', 'Please be careful. Mr. Vale wants the duffel, not you hurt.')],
    lost: [L('brick', "Where did you go? I'm going to check the lower level. Don't tell me."), L('brick', "I've lost you. That never happens. I'm impressed.")],
  } };

// (the duffel opened at her own trunk: a hold of F at the Kastell's tailgate, then the reveal shot looking into it.
// Prop hook: MogCity props `duffel` (open) full of `duck`s; until they exist the trunk and her face carry it)
// (MogCity mandi-props: the open duffel full of sevens set in the Kastell's trunk as the first shot cuts in; an engine
// without props plays the same shots on her face)
const DUCKS = { type: 'cutscene', id: 'ducks', shots: [
  { props: [{ id: 'duffel', kind: 'duffel-open', at: { car: 'player', part: 'trunk' } }],
    cam: { rel: 'player', right: 0.9, up: 0.35, fwd: 1.4 }, look: { rel: 'player', up: -0.2 }, move: 'push', amount: 0.15, fov: 36, dur: 3, say: 'mandi', line: '...No.', how: 'deadpan' },
  { cam: { rel: 'player', right: -1.0, up: 0.6, fwd: 1.6 }, look: { rel: 'player', up: -0.5, fwd: 0.8 }, move: 'push', amount: 0.2, fov: 42, dur: 4,
    say: 'mandi', line: "Ducks. It's all ducks. Every one of them a number seven.", pre: 0.6 },
  { cam: { rel: 'player', right: 0.4, up: 0.1, fwd: 1.2 }, look: { rel: 'player' }, move: 'push', amount: 0.1, warm: true, fov: 34, dur: 3.5,
    say: 'mandi', line: 'I stole a duffel full of ducks. Bernie is going to love this.' },
] };

const D2 = { type: 'vcall', id: 'd2', title: 'DV · Private Line', time: 'night', layout: 'speaker', people: [
  { who: 'diego', office: 'exec', label: 'Diego Vale', sub: 'the riverboat · the lounge' },
  { who: P, office: 'car', label: 'Mandi', sub: 'the lower level', cam: 'low' },
  { who: 'jay', office: 'exec', label: "JAY'S PHONE", sub: 'the lounge · brass, still', cam: 'wide', late: true }],
  lines: [
    V('diego', 'You stole my ducks.'),
    V(P, 'I stole your duffel. The ducks were inside.'),
    V('diego', "Tonight's race needs those ducks. Without them it is just a river."),
    V(P, 'Why are they all sevens?'),
    V('diego', 'Because seven is the favourite. Seven is always the favourite.', { pre: 0.5, how: 'smug' }),
    Ev('join', 'jay'),
    V('jay', "Mandi, they're numbered. He's going to know which ones are gone. He knows all their names."),
    V('diego', "I do. So. The deadline moves. Ten o'clock, not midnight. Forty thousand, and every duck."),
    V(P, "Or what? You'll make him polish more brass?"),
    V('diego', 'Or he joins the race. Number forty-one. I have a very small life jacket.'),
    V('jay', "He's not joking. He measured me."),
    V('diego', "Ten o'clock, leopard. Regards."),
  ] };

const M3 = { id: 'LL-3', title: 'Lower Level', vehicle: 'kastell', start: '@warehouse', time: 'midnight', weather: 'drizzle', card: 'slam', verbs: ['drive', 'escape'],
  stakes: "Brick wants the duffel back. He's very polite about it.", passLine: "Ten o'clock. Forty thousand. And every single duck.",
  steps: [
    { type: 'transition', kicker: '8:46 PM', text: 'THE WAREHOUSES' },
    { type: 'pursuit', checkpoint: true, kind: 'crew', name: "Brick's black car", level: 2, count: 1, behind: 45, goal: 'lose', loseDist: 300, loseTime: 30, cam: 'low', sting: 'roar',
      alert: 'A black sedan, very politely tailgating.', objective: 'Lose **Brick**.', during: [BR1] },
    { type: 'wait', secs: 20, call: true },
    { type: 'roadblock', at: '@ramp', kind: 'crew', cars: 2, crew: 0, ram: true, ramSpeed: 12, text: "The deckhands' carts across the ramp. Ram through.", to: '@lower-level', objective: 'Ram through the carts to **the lower level**.',
      during: [SAYAT(2, 'mandi', 'Golf carts. He parked golf carts across the ramp.'), SAYAT(7, 'mandi', 'Okay, Kastell. Be a tank. Be a polite tank.'),
        // (the drive down to the lower level: Kiki on the phone about the duffel nobody has opened yet)
        { type: 'call', who: 'kiki', auto: true, inCar: true, at: 12, video: { office: 'greenroom' },
          lines: [
            L('kiki', 'Girl. The stream saw a black car chasing you. Are you okay? Are you famous?'),
            L('mandi', "I'm fine. He apologised the whole way."),
            L('kiki', 'That was Brick. Everybody likes Brick. He knits at weddings.'),
            L('kiki', "So? How much is in the duffel? Forty? Fifty? Don't tell me. Tell me."),
            L('mandi', "I haven't opened it."),
            L('kiki', "You stole a duffel and you didn't look in it? Who raised you?"),
            L('mandi', 'My aunt. She also never looked in things.'),
            L('kiki', 'Go under the street, park somewhere dark, and open it on camera. For me. For the comments.'),
            L('mandi', 'No camera, Kiki.'),
            L('kiki', 'Half a camera.'),
          ],
          extra: [[L('kiki', 'The comments are guessing. Somebody said gold. Somebody said a smaller duffel.'), L('mandi', 'Tell them I will let them know.'), L('kiki', 'They will riot.')]],
          wrap: [L('kiki', "Open it. Call me back. I'm holding my breath. I'm not, I'm doing a pedicure.")] }] },
    say('mandi', "Okay. Under the street. Nobody's following. Let's see what forty thousand dollars looks like.", { how: 'hushed' }),
    { type: 'search', at: '@lower-level', on: 'ride', part: 'trunk', label: 'open the duffel', secs: 2, objective: 'Open **the duffel** in the Kastell\'s trunk.' },
    DUCKS,
    D2,
    // (a voice note from Bernie: the client again, a second plant before Gloria's reveal)
    { type: 'voicenote', who: 'bernie', text: "Sweetheart, Simone called. She says the client can't stop talking about the leopard. Is that good? Call me. Not now. Now's fine." },
    { type: 'dm', from: 'kiki', text: "Girl my cousin says the race is RIGGED. Every night. Says ask the accountant. Who has an accountant for ducks??", secs: 7 },
    say('mandi', 'Somebody who rounds very carefully.', { wait: true }),
  ] };

// ── Mission 4: Mirror Park ──
// (the drive to the mirror: Jay calls from the riverboat's bathroom; he heard someone in the OTHER powder room, the
// accountant's, which sets up Gloria before she texts)
const JB = { type: 'call', who: 'jay', auto: true, inCar: true, at: 14, video: { office: 'exec', blur: true },
  lines: [
    L('jay', "Hey. It's me. I'm in the bathroom. Diego has two bathrooms on this boat.", { how: 'hushed' }),
    L('mandi', 'Why are you calling me from a bathroom?'),
    L('jay', "Because they took my phone and this is a different phone. It was in a drawer with a duck in it."),
    L('mandi', 'Are you okay?'),
    L('jay', "I'm great. I'm learning brass. Mandi, there's a lady in the other bathroom. On the phone. Doing numbers."),
    L('mandi', 'What numbers?'),
    L('jay', '"Forty to one. Weighted keel. Round it down." She sounded really tired of rounding.'),
    L('mandi', 'Jay, I got a text. Meet me at the mirror. Come alone. Bring the ducks.'),
    L('jay', "Oh, that's a trap. That's a hundred percent a trap. Bring snacks.", { cut: 0.8 }),
    L('jay', "Somebody's knocking. Love you. I mean... bye.", { how: 'hushed' }),
  ],
  wrap: [L('mandi', "He said love you. He doesn't get to say love you.")] };

const G1 = { type: 'vcall', id: 'g1', title: 'Unknown · Encrypted', time: 'night', live: 'wait', people: [
  { who: 'gloria', office: 'greenroom', label: 'Gloria Steele', sub: 'the boat · the powder room', cam: 'close' },
  { who: P, office: 'car', label: 'Mandi', sub: 'the mirror plaza', cam: 'low' }],
  lines: [
    V('gloria', "Gloria Steele. I keep Diego's books. We have four minutes before he wonders where I am."),
    V(P, "You're the lady in the other bathroom."),
    V('gloria', 'The powder room. It has a lock and a mirror. That is all an accountant needs.'),
    Ev('share', 'gloria', { slide: { title: 'DUCK DERBY · LEDGER · NOVEMBER', lines: ['No. 7 "Quackson": weighted keel', 'Odds sold: 40 to 1', 'Payout if he wins: everything'], big: '$0' } }),
    V('gloria', "Number seven was built to lose. A lead keel. He's the favourite every week, and he sinks every week."),
    V(P, 'So Jay never had a chance.'),
    V('gloria', "Nobody does. That's the business."),
    Ev('unshare', 'gloria'),
    Ev('share', 'gloria', { slide: { title: 'LEDGER · OUTGOING', lines: ['Velvet Lake Casting: retainer', "Swim '27 · client DV", 'Look 14: "the leopard"'] } }),
    V(P, "...Velvet Lake. That's my audition.", { pre: 0.7 }),
    V('gloria', 'Diego paid for it. He was the client. Camera off. He wants a face for his leather line, and he picked yours.'),
    V(P, 'He likes to listen first.', { how: 'deadpan' }),
    V('gloria', 'Jay was the cheapest way in. Forty thousand. Diego thinks you are worth a great deal more.'),
    Ev('unshare', 'gloria'),
    V(P, 'Why are you telling me?'),
    V('gloria', "Eleven years of his rounding. I'm done. My car's at the plaza. Get me out past his cart and I'll give you the ledger."),
  ] };

// (the convoy has a threat now: Diego rings Mandi halfway, asking after his accountant, while Gloria drives in front)
// (Gloria on the car phone from the car in front, the whole convoy; Diego rings in behind her: call waiting)
const GL = { type: 'call', who: 'gloria', auto: true, inCar: true, at: 3, video: { office: 'car' },
  lines: [
    L('gloria', 'Stay close. I drive the speed limit, to the decimal.'),
    L('mandi', 'You signal for parking spaces, Gloria.'),
    L('gloria', 'I signal for everything. It is free.'),
    L('mandi', 'How long have you worked for him?'),
    L('gloria', 'Eleven years. I started on a Tuesday. I have hated Tuesdays since.'),
  ],
  extra: [
    [L('gloria', 'The cart is two cars behind you. Green. It has a horn that plays a song.'), L('mandi', 'What song?'), L('gloria', 'You will know it when you hear it. Everyone hates it.')],
    [L('mandi', 'Why the powder room? Why not just leave?'), L('gloria', 'Because I wanted the ledger more than I wanted the door.'), L('mandi', "That's very romantic, Gloria."), L('gloria', 'It is very accurate.')],
    [L('gloria', 'Do you love him? Jay.', { pre: 0.6 }), L('mandi', "That's not a number, Gloria."), L('gloria', 'Everything is a number. Yours is taking a long time to round.')],
  ],
  wrap: [L('gloria', "That's the harbor. I can breathe here.")],
  hold: { pause: [L('gloria', 'Take it. If it is him, say nothing true.')], resume: [L('gloria', 'Was that him? Your voice went very flat. Good.')] },
  react: {
    tooClose: [L('gloria', 'You are eleven feet from my bumper. Make it twenty.'), L('gloria', 'Closer is not safer. It is just closer.')],
    hit: [L('gloria', 'That was my door. I will be adding it up later.'), L('gloria', 'I felt that. My spreadsheet felt that.')],
  } };

const DG = { type: 'call', who: 'diego', auto: true, inCar: true, at: 28, interrupts: true, video: { office: 'exec' },
  lines: [
    L('diego', 'Leopard. A small question. Have you seen my accountant?'),
    L('mandi', "I don't know your accountant."),
    L('diego', 'Grey car. Drives the speed limit to the decimal. She is never late, and tonight she is late.'),
    L('mandi', 'Maybe she got a better offer.'),
    L('diego', 'There is no better offer. I make all the offers.', { pre: 0.5, how: 'smug' }),
    L('mandi', "I'm a little busy, Diego."),
    L('diego', 'Of course. The ducks. Ten o\'clock. Regards.'),
  ] };

const M4 = { id: 'MP-4', title: 'Mirror Park', vehicle: 'kastell', start: '@lower-level', time: 'midnight', weather: 'drizzle', card: 'slam', verbs: ['drive', 'follow'],
  stakes: 'An unknown number. "Meet me at the mirror. Come alone. Bring the ducks."', passLine: 'Diego was the client. He picked her face.',
  steps: [
    { type: 'dm', name: 'Unknown number', text: 'Meet me at the mirror. Come alone. Bring the ducks.', secs: 6 },
    { type: 'timer', name: 'deadline', seconds: 360, label: 'DEADLINE', fail: 'soft', lateLabel: 'LATE', why: "Ten o'clock came and went. Diego added a duck to the race." },
    { type: 'drive', to: '@mirror', objective: 'Get to **the mirror plaza**',
      during: [SAYAT(4, 'mandi', 'Come alone, bring the ducks. Sure. Totally normal text.'), JB,
        { type: 'dm', at: 66, from: 'kiki', text: 'why is your dot going to the park. is it a date. is it JAY', secs: 6 },
        SAYAT(74, 'mandi', 'Two bathrooms. Who needs two bathrooms on a boat?'), SAYAT(92, 'mandi', 'A lady doing numbers. Okay. Okay, Chicago. Show me.', { how: 'hushed' })] },
    G1,
    { type: 'convoy', checkpoint: true, route: ['@mirror', '@harbor'], speed: 12, car: 'sedan', color: '#7C8A96', name: "Gloria's car", who: 'gloria', band: [8, 40], hp: 120,
      objective: "Get **Gloria's car** out past the cart.",
      during: [GL, DG] },
    { type: 'timer', name: 'deadline', stop: true },
    say('gloria', "The ledger is yours when Jay is off that boat. I don't hand evidence to people who might lose.", { wait: true }),
    say('mandi', "I'm not going to lose, Gloria."),
    say('gloria', 'Everybody says that. I have the numbers.', { wait: true }),
  ] };

// ── Mission 5: Pier Pressure ──
const BE2 = { type: 'call', who: 'bernie', auto: true, inCar: true, at: 3, video: { office: 'car' },
  lines: [
    L('bernie', "Sweetheart. Sit down. Are you sitting? You're driving, you're sitting."),
    L('mandi', 'Bernie, what is it?'),
    L('bernie', "A client wants you exclusive. Ten years. It's huge. It's the biggest offer I've ever touched."),
    L('mandi', 'Who is the client?'),
    L('bernie', 'Somebody called DV. Leather goods. Who is DV?'),
    L('mandi', 'DV is the man who kidnapped Jay.', { pre: 0.5 }),
    L('bernie', "...So that's a no? That sounds like a no. Let me get the details, I'll put him on a call."),
    L('mandi', 'Put him on at the pier. By the wheel. I want to see his face when I say it.'),
    L('bernie', "Say what? Say yes? Sweetheart, say it with your eyes."),
  ],
  extra: [
    [L('bernie', 'Can I tell you something? I never liked Jay.'), L('mandi', 'You loved Jay.'), L('bernie', 'I loved Jay. He paid for lunch once. Once!')],
    [L('bernie', "Ten years. You know what I'd be in ten years? Seventy-four."), L('mandi', "You're seventy-one now?"), L('bernie', "Don't tell Simone. She thinks I'm a hundred.")],
    [L('bernie', 'Is it windy there? It sounds windy.'), L('mandi', "It's the lake, Bernie. It's November."), L('bernie', "That's the face! That's the November face!")],
  ],
  wrap: [L('bernie', "I'm conferencing everyone. Simone too. Be gracious. Be... can you hear me n...", { cut: 0.7 })] };

const C1 = { type: 'vcall', id: 'c1', title: "Velvet Lake Casting · Look 14 · Offer", time: 'night', live: 'wait', people: [
  { who: 'diego', office: 'exec', label: 'Diego Vale', sub: 'DV · the riverboat' },
  { who: 'simone', office: 'startup', label: 'Simone Vance', sub: 'Velvet Lake Casting' },
  { who: 'bernie', office: 'car', sub: 'still double-parked', cam: 'low' },
  { who: P, office: 'car', label: 'Mandi', sub: 'the pier · by the wheel', cam: 'low' }],
  lines: [
    V('diego', 'Camera on, at last. I did so enjoy your audition. The November wind. The keys.'),
    V(P, 'You were the client.'),
    V('diego', 'I am always the client. Ten years as the face of DV. The debt forgiven. Jay freed. Tonight.'),
    V('simone', "It's a very good offer. I hate that it's a very good offer."),
    V('bernie', "It's a great offer. Sweetheart, it's... is he a criminal? He seems like a criminal."),
    Ev('share', 'diego', { slide: { title: 'DV LEATHER · EXCLUSIVE', lines: ['Term: ten (10) years', 'The face: Mandi Reyes', 'Wardrobe: as auditioned'], big: '10 YRS' } }),
    V(P, '"Wardrobe: as auditioned."'),
    V('diego', 'The leopard sells, leopard. I only know what sells.'),
    V(P, 'You set Jay up. Forty thousand on a duck that sinks. To get to me.'),
    V('diego', 'I set nothing up. Jay walked onto my boat. Jay always walks onto the boat.', { how: 'smug' }),
    Ev('unshare', 'diego'),
  ] };

const SIGN = { type: 'choice', prompt: "Sign Diego's contract?", who: 'mandi', timeout: 8, default: 0, options: [
  { text: 'Tear it up', reply: "Here's my signature. It comes in two pieces." },
  { text: 'Sign it "Not Today"', reply: 'Signed. N-O-T, T-O-D-A-Y. Read it slowly.' }] };

const C2 = { type: 'vcall', id: 'c2', title: "Velvet Lake Casting · Look 14 · Offer", time: 'night', live: 'wait', people: [
  { who: 'diego', office: 'exec', label: 'Diego Vale', sub: 'DV · the riverboat' },
  { who: 'simone', office: 'startup', label: 'Simone Vance', sub: 'Velvet Lake Casting' },
  { who: 'bernie', office: 'car', sub: 'still double-parked', cam: 'low' },
  { who: P, office: 'car', label: 'Mandi', sub: 'the pier · by the wheel', cam: 'low' }],
  lines: [
    Ev('freeze', 'bernie'),
    V('diego', 'Ah. A no. I adore a no. It means we keep talking.'),
    V('simone', 'For the record, that was the best take of the night.', { how: 'deadpan' }),
    V('diego', 'Brick is beside you, leopard. He will apologise first. He always does.'),
    V(P, 'Tell him I accept.'),
  ] };

// (Brick's own entrance, the playtest's B5: he is seen putting his knitting down before the fight, and he talks on screen)
const BRICK = { type: 'cutscene', id: 'brick', shots: [
  { frame: 'two', on: 'brick', at: 'player', dur: 3.5, lines: [L('brick', 'Hello, Mandi. Sorry about this. I really am.'), L('mandi', 'Are you holding knitting?')] },
  { frame: 'close', on: 'brick', dur: 4, lines: [L('brick', "It's the scarf. For my mother. Would you hold it? I don't want it to get punched."), L('mandi', "I'm not holding your scarf, Brick.", { overlap: true })] },
  { frame: 'ots', on: 'player', at: 'brick', dur: 3.5, lines: [L('brick', "That's fair. I'll put it on the bench."), L('mandi', 'Thank you.'), L('brick', 'Okay. Ready when you are.')] },
] };

const M5 = { id: 'PP-5', title: 'Pier Pressure', vehicle: 'kastell', start: '@ohio', time: 'midnight', weather: 'wind', card: 'slam', verbs: ['drive', 'fight'],
  stakes: 'A ten-year contract with the man who kidnapped Jay.', passLine: 'Forty thousand views. One torn contract.',
  steps: [
    { type: 'transition', kicker: '9:24 PM', text: 'THE PIER' },
    { type: 'drive', to: '@pier-foot', objective: 'Get to **the pier**', during: [BE2] },
    { type: 'walk', to: '@pier', leaveCar: true, objective: 'Walk out the pier to **the wheel**',
      during: [SAYAT(2, 'mandi', 'Okay. The wind off the lake in November. Keep it.', { how: 'deadpan' }), SAYAT(14, 'mandi', 'Slides on wet boards. Bernie, you owe me.'),
        { type: 'dm', at: 22, from: 'kiki', text: 'bernie says youre about to be on a call with the WHITE SUIT. do NOT shiver', secs: 6 },
        SAYAT(30, 'mandi', 'There it is. The wheel. Lit up like it is a normal night.'), SAYAT(44, 'mandi', 'Okay, Diego. Camera on. Let me see you.', { how: 'hushed' })] },
    C1, SIGN, C2,
    { type: 'npc', who: 'brick', at: '@pier' },
    { type: 'npc', who: 'deckhand-red', at: '@pier' },
    BRICK,
    { type: 'fight', enemies: ['brick', 'deckhand-red'], arena: '@pier', win: 'ko-all', rules: 'full', timer: 60, hp: 140, objective: 'Get past **Brick**.', sting: 'hit',
      during: [SAYAT(4, 'brick', 'Sorry. Sorry. That one was mostly the wind.'), SAYAT(12, 'mandi', 'You are very hard to dislike.'), SAYAT(19, 'brick', "Thank you. I'm trying a new stitch."),
        SAYAT(28, 'mandi', 'The red hat again? Do you guys only own one hat each?'), SAYAT(38, 'brick', 'Please mind the scarf. Please mind the scarf.')] },
    say('brick', "Ow. Good. Mr. Vale is at the stadium lot, with the limo. Jay's washing it. I didn't tell you.", { wait: true }),
    { type: 'dm', from: 'kiki', text: "Girl I clipped the tear-up from your phone cam. 40K views. FORTY K. The comments want a name for the leopard", secs: 7 },
  ] };

// ── Mission 6: Wrong Way Jay ──
// (the tail had two lines in 3.2 minutes, ww6-03: Kiki's cousin is on the car phone the whole way now)
const KW = { type: 'call', who: 'kiki', auto: true, inCar: true, at: 3, video: { office: 'greenroom' }, register: 'whisper',
  lines: [
    L('kiki', 'Okay, my cousin is at the stadium. He says the limo is going there. He says Jay is wearing yellow rubber gloves.'),
    L('mandi', 'Gloves.'),
    L('kiki', "Yellow gloves, girl. Up to the elbow. Bring your phone up, I'm begging you."),
    L('mandi', "Kiki, is your cousin in Diego's crew?"),
    L('kiki', "He's in every crew. He's a temp. He did a wedding on Thursday."),
    L('mandi', 'What else does the temp know?'),
    L('kiki', 'Two deckhands, red hat and blue hat. Red is still sore about you. Blue has a whistle.'),
    L('mandi', 'We met. He uses it a lot.'),
    L('kiki', 'And Diego is not in the limo. Diego is on the boat, watching the race set up.'),
    L('mandi', 'So it is just Jay and a sponge.'),
    L('kiki', 'Jay and a sponge and the gloves. Hold on, hold on, the stream is asking if you two are getting back together.'),
    L('mandi', 'Tell the stream no.'),
    L('kiki', "They don't believe you. Ninety percent don't believe you."),
  ],
  extra: [
    [L('kiki', "Can I say something? Last year, when he left. You were sad for like a month."), L('mandi', 'Two weeks.'), L('kiki', 'A month. You ate cereal for dinner.'), L('mandi', "It's a good dinner.")],
    [L('kiki', 'What are you going to say to him?'), L('mandi', 'Hold this.'), L('kiki', 'Hold what?'), L('mandi', "You'll see.")],
    [L('kiki', "The limo has a tiny flag on the hood. Who has a flag? Is it a country?"), L('mandi', "It's a duck, Kiki. It's a flag of a duck.")],
    [L('kiki', 'Real question. Why do you still have his jacket?'), L('mandi', 'It was cold.'), L('kiki', 'It was June.'), L('mandi', 'It was cold in June, Kiki.')],
    [L('kiki', "My cousin says Jay waxed the limo twice. He says it's the best it's ever looked."), L('mandi', 'He was always good at the wrong things.'),
      L('kiki', 'Girl, that is the saddest compliment.'), L('mandi', "It's the only kind he gets.")],
    [L('kiki', 'Okay. Where are you taking him after?'), L('mandi', "His mother's."), L('kiki', 'His mother hates you.'), L('mandi', 'His mother adores me. She hates him.'), L('kiki', 'Fair.')],
    [L('kiki', 'Okay, real talk. Are you going to cry when you see him?'), L('mandi', 'No.'), L('kiki', "Okay. I am. I'm going to cry on stream.")],
    [L('kiki', "The stream wants to know if you'll forgive him."), L('mandi', "Tell the stream I'm working on it."), L('kiki', 'Girl.'), L('mandi', "Slowly. I'm working on it slowly.", { pre: 0.6 })],
  ],
  wrap: [L('kiki', "It's parking. Okay. Okay. Go get your man. Your ex man. Go get him and then leave him.")],
  react: {
    tooClose: [L('kiki', 'Too close, girl, a white limo has mirrors too!'), L('kiki', 'Back off, you are in his rear-view.')],
    lost: [L('kiki', "My cousin says you're losing it. He's waving. He's not supposed to wave."), L('kiki', "Where'd it go? It's a white limo, how do you lose a white limo?")],
  } };

// THE REUNION (B6, the emotional centre): Jay at the white limo with a bucket and a sponge, talking to the car (prop hook:
// MogCity `limo` and `sponge`/`bucket`; until they exist the limo is the white sedan parked there and the sponge is in
// the lines). The deckhands she slipped past are asleep in the limo (Jay's line; they leave the lot before it). Over the
// shoulder pairs, a beat of silence, her reaction close, a hug she gives him for one breath, then the sponge.
const R1 = { type: 'cutscene', id: 'reunion', shots: [
  { props: [{ id: 'bucket', kind: 'bucket', at: { car: 'limo', part: 'side', side: 1, along: -1.2 } }, { id: 'suds', kind: 'suds', at: { car: 'limo', part: 'hood' } },
      { id: 'suds2', kind: 'suds', at: { car: 'limo', part: 'roof', along: 1.2 } }, { id: 'sponge', kind: 'sponge', at: { hold: 'jay', hand: 'right' } }],
    frame: 'two', on: 'jay', at: 'player', move: 'push', amount: 0.1, dur: 4.5, lines: [L('jay', '...and that, Mr. Limo, is why you never bet on a duck with feelings.', { how: 'sad' }), L('mandi', 'Jay.', { pre: 0.6 })] },
  { frame: 'react', on: 'jay', dur: 1.1 },
  { frame: 'ots', on: 'player', at: 'jay', dur: 4.5, lines: [L('jay', 'Mandi.', { how: 'hesitant' }), L('jay', "You came. You're in the bikini. You came in the bikini.")] },
  { frame: 'close', on: 'player', dur: 3.5, ...S1(L('mandi', 'I came from an audition, Jay. You called during my audition.')) },
  { frame: 'ots', on: 'jay', at: 'player', dur: 4.5, lines: [L('jay', "I didn't call. I texted. Calling felt like a lot."), L('mandi', 'Are you hurt?', { pre: 0.7, how: 'warm' })] },
  { frame: 'close', on: 'jay', dur: 4, lines: [L('jay', 'Just my knees. He made me do the hubcaps.'), L('jay', "I'm really sorry, Mandi. Not the bet sorry. The other one.", { pre: 0.6, how: 'sad' })] },
  { frame: 'push', on: 'player', dur: 2.2 },
  { props: [{ id: 'sponge', drop: true }], frame: 'two', on: 'player', at: 'jay', dur: 3.5, act: [{ who: 'player', hug: 'jay' }, { who: 'jay', hug: 'player' }], ...S1(L('mandi', 'I know.', { how: 'warm' })) },
] };
// (the hug ends with the scene; the next one stands them apart: Jay's act a plain face, which lets go of her)
const R2 = { type: 'cutscene', id: 'sponge', shots: [
  { frame: 'two', on: 'jay', at: 'player', dur: 4, act: [{ who: 'jay', pose: 'idle' }],
    lines: [L('mandi', 'Okay. That is enough of that.'), L('jay', 'I had you at even money to come.', { how: 'tease' })] },
  { props: [{ id: 'sponge', at: { hold: 'player', hand: 'right' } }], frame: 'ots', on: 'player', at: 'jay', dur: 2, ...S1(L('mandi', 'Hold this.')) },
  { props: [{ id: 'sponge', at: { hold: 'jay', hand: 'right' } }], frame: 'two', on: 'jay', at: 'player', dur: 4, lines: [L('jay', "...It's wet."), L('mandi', "It's your sponge, Jay. Where are the deckhands?")] },
  { frame: 'close', on: 'jay', dur: 4, lines: [L('jay', 'Asleep in the limo. I gave them the good towels.'), L('mandi', 'Get in the car.')] },
] };

const M6 = { id: 'WW-6', title: 'Wrong Way Jay', vehicle: 'kastell', start: '@south-lot', time: 'midnight', weather: 'rain', card: 'slam', verbs: ['drive', 'tail', 'sneak', 'escape'],
  stakes: "Brick says Jay's washing the limo at the stadium lot. Brick didn't tell you.", passLine: 'Jay is in the car. The jacket is not his.',
  steps: [
    { type: 'transition', kicker: '9:48 PM', text: 'THE LAKEFRONT' },
    { type: 'tail', name: "Diego's white limo", car: 'sedan', stretch: 2.6, color: '#F4F2EC', route: ['@south-lot', '@stadium-lot'], ahead: 70, speed: 17, lostDist: 280,
      objective: "Tail Diego's limo to **the stadium lot**.", during: [KW, SAYAT(80, 'mandi', 'A white limo in November. He wants to be seen.')] },
    { type: 'car', name: 'limo', car: 'sedan', stretch: 2.6, color: '#F4F2EC', at: '@stadium-lot' },
    { type: 'npc', who: 'jay', at: '@stadium-lot' },
    { type: 'npc', who: 'deckhand-red', at: '@stadium-lot' },
    { type: 'npc', who: 'deckhand-blue', at: '@stadium-lot' },
    { type: 'stealth', mode: 'walk', to: '@stadium-lot', objective: 'Sneak past the deckhands to **Jay**.',
      units: [{ '@': 'stadium-lot', kind: 'scout', roam: 25, name: 'Deckhand Red' }, { '@': 'stadium-lot', kind: 'scout', radius: 25, side: 1, name: 'Deckhand Blue' }],
      onDetect: { pursuit: { count: 2, level: 2 } },
      during: [SAYAT(3, 'mandi', 'Slides on asphalt. Very quiet. Very fashion.', { how: 'hushed' }), SAYAT(12, 'jay', "Hey. Hey, Mr. Limo. You're doing great.", { how: 'hushed' }),
        SAYAT(18, 'mandi', 'He is talking to the car.', { how: 'hushed' })] },
    // (the two she slipped past go to sleep in the limo: off the lot before the reunion, so nobody stands idle in it)
    { type: 'npc', remove: 'deckhand-red', who: 'deckhand-red' },
    { type: 'npc', remove: 'deckhand-blue', who: 'deckhand-blue' },
    // (the reunion staged, the playtest's B6: Jay stood 1.1 m in front of her, not inside her, the limo and the bucket beside)
    { type: 'npc', who: 'jay', at: { rel: 'player', right: 0.2, fwd: 1.1 } },
    R1,
    R2,
    { type: 'passenger', checkpoint: true, who: 'jay', board: true, seat: 'front', secs: 2 },
    { type: 'pursuit', kind: 'crew', name: "Diego's deckhands", level: 2, count: 2, behind: 55, goal: 'lose', loseDist: 220, loseTime: 20, objective: 'Lose **the deckhands**.', sting: 'screech', alert: 'The deckhands woke up.',
      during: [SAYAT(3, 'jay', "They woke up. I knew the towels were too good. Is that my jacket?"), SAYAT(8, 'mandi', 'No.'), SAYAT(11, 'jay', "It is. That's my jacket, on the seat."), SAYAT(14, 'mandi', "It's mine now."),
        // (a6 was a stop-and-talk call after the chase: it is the car phone over the chase, the crew meeting Jay)
        { type: 'call', who: 'kiki', auto: true, inCar: true, at: 18, video: { office: 'greenroom' },
          lines: [
            L('kiki', 'Is that him? Hold on, hold on. Jay. You owe me a full set.'),
            L('jay', 'Hi, Kiki. Hi, comments. Mandi. I mean it. I am really, truly, all the way sorry.'),
            L('mandi', 'I am mad at you, Jay. I can be mad and drive.'),
            L('kiki', "Bernie's in the comments. He says welcome back. He says he never liked you."),
            L('jay', 'He loved me. I paid for lunch once.'),
            L('jay', "So, real quick. Can I bet on you? Tonight? I've got a really good feeling about you."),
            L('mandi', 'No.', { overlap: true }),
            L('kiki', 'No.', { overlap: true }),
            L('jay', "...That's fair. That's a fair room."),
          ],
          extra: [[L('kiki', 'Gloria is here. She brought a binder. A big one.'), L('jay', 'Who is Gloria?'), L('mandi', 'The lady in the other bathroom.'), L('jay', 'Oh. She rounds.')]],
          wrap: [L('kiki', "You lost them! Come to the lot on Franklin, by the river. Gloria's here with the binder.")] }] },
    { type: 'wait', secs: 25, call: true },
    say('jay', 'Thanks for coming to get me.', { how: 'warm', pre: 0.6 }),
    say('mandi', "Don't make it weird, Jay.", { wait: true }),
  ] };

// ── Mission 7: Double or Nothing ──
const PLAN = { type: 'vcall', id: 'plan', title: 'The Crew', time: 'night', live: true, people: [
  { who: 'kiki', office: 'van', label: 'Kiki', sub: 'the minivan · the stream rig' },
  { who: 'gloria', office: 'car', label: 'Gloria', sub: 'her car · the ledger', cam: 'low' },
  { who: 'jay', office: 'car', label: 'Jay', sub: 'the passenger seat', cam: 'low' },
  { who: 'bernie', office: 'car', sub: 'double-parked, emotionally', cam: 'low' },
  { who: P, office: 'car', label: 'Mandi', sub: "the driver's seat", cam: 'low' }],
  lines: [
    V('gloria', 'Jay is off the boat. The ledger is yours. Here is what it proves.'),
    Ev('share', 'gloria', { slide: { title: 'TONIGHT · THE BIG DERBY', lines: ['Every bettor in the city on number seven', 'Seven built to sink', 'The house keeps it all'] } }),
    V('kiki', 'And I stream the race. Live. With the ledger on screen. Forty thousand people already follow the leopard.'),
    V(P, "So everybody sees it's rigged while it's rigged."),
    V('jay', 'What if seven wins, though?'),
    V('gloria', 'Seven cannot win. Seven has a keel.'),
    V('jay', "One seven can't. But we've got a duffel full of ducks. How many sevens?"),
    V('gloria', '...Nine hundred and eighty. Every spare seven he owns.', { pre: 0.5 }),
    V(P, 'Jay. That is the first good bet you have ever made.'),
    V('jay', 'I have a system.'),
    V('bernie', "I'm in! What am I in?"),
    Ev('unshare', 'gloria'),
    V(P, "Kiki, you're in the minivan, to the Riverwalk. I'm right behind you. Then the ducks go in upstream."),
    V('gloria', 'The race starts at eleven. I have never once seen it start late.'),
  ] };

// (the convoy had 3.8 minutes of silence, dn7-02: Kiki is on the car phone with the stream, Jay in the seat beside her)
const KV = { type: 'call', who: 'kiki', auto: true, inCar: true, at: 3, video: { office: 'van' },
  lines: [
    L('kiki', 'The rig is on the roof. Do not let anyone tap me, girl, that rig was a birthday present.'),
    L('jay', 'Whose birthday?'),
    L('kiki', 'Mine, Jay. From me. I deserved it.'),
    L('mandi', 'How many are watching?'),
    L('kiki', "Twelve thousand and climbing. They're voting on your name. Leopard is winning. Mandi is second."),
    L('jay', 'Can I vote?'),
    L('mandi', 'No.'),
    L('kiki', "Gloria's in the comments. She just corrected somebody's math."),
    L('jay', 'Mandi. While we drive. About the jacket.'),
    L('mandi', 'Not now, Jay.'),
    L('jay', "Okay. Later. I'll put it on the calendar. I'm still on your calendar.", { how: 'hesitant' }),
  ],
  extra: [
    [L('kiki', 'Diego just commented. On my stream. He said "Regards."'), L('mandi', 'Block him.'), L('kiki', 'I pinned him. Engagement is engagement.')],
    [L('jay', 'Did you know the river runs backwards?'), L('mandi', 'Everybody knows that, Jay.'), L('jay', "I didn't. I've been betting on ducks for a year.")],
    [L('kiki', 'Okay, the comments want to know if Jay is cute.'), L('mandi', 'Tell them he is a liability.'), L('jay', 'A cute liability.'), L('kiki', 'They said that too.')],
    [L('kiki', "My cousin's on the boat. He says Diego changed suits. Same suit, but whiter."), L('jay', "He's got four of them. Same one. I polished the buttons.")],
  ],
  wrap: [L('kiki', "Riverwalk! I'm setting up. Go drop the ducks upstream, by Michigan!")],
  react: {
    tooClose: [L('kiki', "Girl, you're in my mirror. You're in all my mirrors."), L('kiki', 'Back up, the rig is fragile, I love it.')],
    lost: [L('kiki', 'Where are you? Stay behind me, I am the parade!'), L('kiki', "You're gone! The comments think you left. Come back!")],
  } };

// (the ducks go in: Mandi tips the duffel over the rail at the Riverwalk upstream (prop hook: the duffel and the
// 980-duck flotilla, MogCity props `duck`/`flotilla`, drifting west on the river toward the finish); the shots look at
// the water, never at her: B1)
const PHONES = { type: 'cutscene', id: 'phones', shots: [
  { flotilla: [{ id: 'sevens', at: '@upstream-wall', count: 980, pour: 3 }],
    cam: { rel: 'player', right: 0, up: 3.5, fwd: 10 }, look: { rel: 'player', fwd: 26, up: -4 }, move: 'track', amount: 4, fov: 50, dur: 4.5,
    lines: [L('jay', 'Look at them go.', { how: 'warm' }), L('mandi', 'All of them sevens.')] },
  { cam: { rel: 'player', right: -3, up: 2.2, fwd: 6 }, look: { rel: 'player', fwd: 30, right: -8, up: -3 }, move: 'push', amount: 0.2, fov: 44, dur: 5,
    lines: [L('kiki', 'Forty-one thousand watching. Hold on, hold on, the comments just found out about the keel.'), L('mandi', 'And Diego?'), L('kiki', 'Diego just found out about the comments.')] },
  { frame: 'close', on: 'player', dur: 3, ...S1(L('kiki', "Girl. Two deckhands, running your way. They're not here for the race.")) },
] };

const M7 = { id: 'DN-7', title: 'Double or Nothing', vehicle: 'kastell', start: '@crew', time: 'midnight', weather: 'rain', card: 'slam', verbs: ['drive', 'follow', 'fight'],
  stakes: "The big race. Gloria's ledger, Kiki's stream, and nine hundred and eighty sevens.", passLine: 'A thousand sevens won. The house lost.',
  steps: [
    { type: 'transition', kicker: '10:31 PM', text: 'THE BIG DERBY' },
    PLAN,
    { type: 'convoy', checkpoint: true, route: ['@crew', '@riverwalk'], speed: 12, car: 'minivan', color: '#C8A2E8', name: "Kiki's minivan", who: 'kiki', band: [8, 40], hp: 140,
      objective: "Stay behind **Kiki's minivan** to the Riverwalk.", during: [KV] },
    { type: 'timer', name: 'race', seconds: 90, label: 'RACE', fail: 'hard', why: 'The race started without the sevens. Seven sank, the house won.' },
    // (upstream on foot along the Riverwalk with the duffel, 230 m: every car route to it from the finish looped 2 km)
    { type: 'walk', to: '@upstream-wall', leaveCar: true, objective: 'Carry the ducks **upstream** along the Riverwalk before the race starts',
      during: [SAYAT(3, 'jay', "Upstream. Okay. Which way is upstream? Rivers don't have signs."), SAYAT(8, 'mandi', 'This river runs backwards, Jay. Upstream is the lake.'),
        SAYAT(14, 'jay', 'Who reversed a river?'), SAYAT(18, 'mandi', 'Chicago. In 1900. Hold the duffel.'), SAYAT(30, 'jay', "It's so heavy. Nine hundred and eighty is a lot of sevens."),
        { type: 'dm', at: 40, from: 'diego', text: 'I see your friend is streaming. How modern. Regards.', secs: 6 }] },
    { type: 'search', at: '@upstream-wall', label: 'tip the ducks in', prop: 'bag', secs: 2.5, objective: 'Tip **the ducks** into the river.' },
    { type: 'timer', name: 'race', stop: true },
    PHONES,
    { type: 'npc', who: 'deckhand-red', at: '@upstream-wall' },
    { type: 'npc', who: 'deckhand-blue', at: '@upstream-wall' },
    { type: 'fight', enemies: ['deckhand-red', 'deckhand-blue'], arena: '@upstream-wall', win: 'ko-all', rules: 'full', timer: 60, objective: 'Hold **the Riverwalk** till the sevens pass.', sting: 'hit',
      during: [SAYAT(3, 'jay', "I'll hold your jacket!"), SAYAT(5, 'mandi', 'You will not hold my jacket.'), SAYAT(15, 'jay', 'Behind you! The red one! The other red one!'),
        SAYAT(26, 'mandi', 'Third time tonight, Red. Get a new job.'), SAYAT(36, 'jay', "They're passing the finish! The sevens are passing the finish!")] },
    say('kiki', "Girl. The sevens won. A thousand sevens won. The bettors are swimming after them.", { wait: true }),
    say('jay', 'Mandi. Your duck won. Our duck. Your duck.', { how: 'warm' }),
  ] };

// ── Mission 8: Bridge Up ──
// (d3 was a stop on the phone before the chase: Diego taunts on the car phone from the limo while she chases it)
const D3 = { type: 'call', who: 'diego', auto: true, inCar: true, at: 2, video: { office: 'car' }, register: 'fast',
  lines: [
    L('diego', 'Brava. Truly. A thousand sevens. I could not have staged it better.'),
    L('mandi', "You're running."),
    L('diego', "I'm relocating, with the night's take, which is still technically mine. The bridges go up at eleven for the boats."),
    L('jay', "He's got a tiny flag on the hood. That's how you know he's evil."),
    L('diego', 'It is a duck, Jay. It is a heraldic duck.', { how: 'deadpan' }),
    L('mandi', "Why me, Diego? Out of every face in this city."),
    L('diego', 'Because you shivered. Nobody shivers. You were the only true thing on that call.', { pre: 0.6 }),
    L('mandi', "That's the nicest thing a kidnapper has ever said to me."),
    L('diego', 'By the time the bridge comes down, I am a rumour. Regards to the leopard.'),
  ],
  react: {
    tooClose: [L('diego', 'So close, leopard. Mind the paint.'), L('diego', 'I can see your face in my mirror. Still a natural.')],
    lost: [L('diego', 'Gone already? I am disappointed.'), L('diego', 'Over here, leopard. I am the white one.')],
  } };

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

// THE BOSS FIGHT (B5): two phases and a finisher. Diego gets out of the limo (prop hooks: the limo, Diego's white suit
// jacket and cane, the cast agent's wardrobe), sets his two deckhands on her; then he takes her on himself; the finisher
// is shot on the river: he goes over the rail into the water full of sevens (prop hook: the splash, the flotilla).
const BOSS1 = { type: 'cutscene', id: 'boss-in', shots: [
  { frame: 'two', on: 'diego', at: 'player', dur: 3.5, ...S1(L('diego', 'Leopard. You jumped a bridge. In slides.', { how: 'smug' })) },
  { frame: 'ots', on: 'player', at: 'diego', dur: 4, lines: [L('mandi', "Forty thousand, Diego. Jay's debt."), L('diego', 'Paid in what, exactly?')] },
  { frame: 'close', on: 'player', dur: 3, ...S1(L('mandi', 'In ducks.', { how: 'deadpan' })) },
  { frame: 'two', on: 'diego', at: 'player', dur: 4, lines: [L('diego', 'Gentlemen. The leopard would like to dance.'), L('jay', 'Oh no. Not Red again.')] },
] };

const BOSS2 = { type: 'cutscene', id: 'boss-two', shots: [
  { frame: 'close', on: 'diego', dur: 4, ...S1(L('diego', 'I have never thrown a punch. I would like you to know I am about to.', { how: 'deadpan' })) },
  { frame: 'ots', on: 'diego', at: 'player', dur: 3.5, lines: [L('mandi', 'Take the jacket off, Diego. It is white.'), L('diego', 'It is always white.')] },
] };

const FINISH = { type: 'cutscene', id: 'over-the-rail', shots: [
  { frame: 'low', on: 'player', dur: 3.5, lines: [L('diego', 'My loafers. These are Italian.', { how: 'scared' }), L('mandi', 'Then they can swim.')] },
  { frame: 'react', on: 'jay', dur: 3.5, ...S1(L('jay', 'He fell in! He fell in the river with all the sevens!', { how: 'shout' })) },
  { frame: 'two', on: 'jay', at: 'player', dur: 4.5, lines: [L('jay', "He's fine. He's floating. Everything in there floats."), L('mandi', 'Except number seven.', { how: 'deadpan' })] },
] };

// (the news, at the bridge after the fight: a short video call, every tile live, nobody waiting to join; then the time
// skip to dawn and the last scene in person: B7)
const FINAL = { type: 'vcall', id: 'final', title: "Velvet Lake Casting · Swim '27 · Look 14", time: 'night', people: [
  { who: 'simone', office: 'startup', label: 'Simone Vance', sub: 'Velvet Lake Casting' },
  { who: 'bernie', office: 'car', sub: 'parked. Legally.', cam: 'low' },
  { who: 'kiki', office: 'van', label: 'Kiki', sub: "the minivan · 41K live" },
  { who: 'gloria', office: 'car', label: 'Gloria', sub: 'a train out of town · the ledger', cam: 'low' },
  { who: P, office: 'car', label: 'Mandi', sub: 'the bridge · Michigan Ave', cam: 'low' }],
  lines: [
    V('simone', "The new client watched Kiki's stream. All of it. You're the face. In the leopard."),
    V(P, '...I got it?'),
    V('simone', 'You got it. Try to forget your keys more often.', { how: 'warm' }),
    V('bernie', "Can you hear me? Can you hear me? I can hear me! Sweetheart, you're the face!", { how: 'shout' }),
    V('bernie', "I'm crying. My signal works and I'm crying."),
    V('kiki', 'GIRL!', { how: 'shout' }),
    Ev('share', 'kiki', { slide: { title: 'KIKI · LIVE · 41,212', lines: ['leopard leopard leopard', 'DID SHE JUMP A BRIDGE', 'someone check on the sevens'] } }),
    V('gloria', 'The ledger is with the river police. I rounded nothing.'),
    Ev('unshare', 'kiki'),
    V(P, 'Thank you. All of you. I mean it.', { pre: 0.6, how: 'warm' }),
    V('kiki', "She means it. Chat, she means it. Screenshot it."),
  ] };

// (the epilogue, in person, at first light, on the pier: she stands facing the lake and the sunrise, the skyline across
// the harbor behind her in every shot of her face; Jay faces her, the lake behind him. Jay asks for the jacket; she
// says no. The last line is said to his face, never over a call (B7). Her close-ups have the skyline behind her (Jay
// stands west of her); prop hook: the jacket over her arm, a coffee cup in his hand)
const DAWN = { type: 'cutscene', id: 'dawn', shots: [
  { flotilla: [{ id: 'dawn-ducks', at: '@dawn', count: 600 }], props: [{ id: 'jacket', kind: 'jacket', at: { hold: 'player', hand: 'left' } }],
    frame: 'two', on: 'player', at: 'jay', move: 'drift', amount: 1.5, dur: 4.5, lines: [L('jay', "Look at it. The whole city, and it's finally quiet."), L('mandi', 'First time all night.')] },
  { frame: 'close', on: 'jay', dur: 4.5, lines: [L('jay', "I got you a coffee. It's from the cart. It's mostly hot."), L('mandi', 'Thank you.')] },
  { frame: 'close', on: 'jay', dur: 4, lines: [L('jay', 'So...', { how: 'hesitant' }), L('jay', 'Are we back?')] },
  { cam: { rel: 'player', right: 0.25, up: 0.05, fwd: 1.3 }, to: { rel: 'player', right: 0.18, up: 0.05, fwd: 1.0 }, look: { rel: 'player' }, fov: 34, dur: 5, ...S1(L('mandi', "I said I'd get you back. I never said I'd take you back.", { pre: 0.8 })) },
  { frame: 'react', on: 'jay', dur: 1.2 },
  { frame: 'close', on: 'jay', dur: 4, lines: [L('jay', "That's fair.", { how: 'sad' }), L('jay', 'Can I at least have the jacket?', { pre: 0.6 })] },
  { cam: { rel: 'player', right: -0.3, up: 0.05, fwd: 1.4 }, look: { rel: 'player' }, fov: 36, dur: 4, ...S1(L('mandi', 'No.', { pre: 0.5 })) },
  { frame: 'two', on: 'player', at: 'jay', dur: 4 },
] };

const M8 = { id: 'BU-8', title: 'Bridge Up', vehicle: 'kastell', start: '@ohio', time: 'midnight', weather: 'drizzle', card: 'slam', verbs: ['drive', 'tail', 'fight'],
  stakes: 'Diego is leaving with the cash. The bridges go up at eleven.', passLine: "I said I'd get you back. I never said I'd take you back.",
  steps: [
    { type: 'transition', kicker: '10:58 PM', text: 'THE RIVER BRIDGES' },
    // (the bridge first, so a retry from its checkpoint arms it again: it waits for her near it, then rises)
    JUMP,
    { type: 'tail', name: "Diego's white limo", car: 'sedan', stretch: 2.6, color: '#F4F2EC', route: ['@ohio', '@north-ave', '@bridge'], ahead: 60, speed: 20, ring: 10, spotTime: 10, lostDist: 220,
      objective: 'Catch **the limo** before the bridge.', during: [D3, SAYAT(44, 'mandi', 'Hold on to something.'), SAYAT(47, 'jay', "I'm holding the sponge!")] },
    // (the limo pulled up just past the bridge, on Michigan Ave: she lands, pulls up on it, and Diego gets out)
    { type: 'drive', to: '@bridge', radius: 24, objective: 'Pull up on **the limo**.' },
    { type: 'car', name: 'limo8', car: 'sedan', stretch: 2.6, color: '#F4F2EC', at: '@bridge' },
    { type: 'npc', who: 'diego', at: '@bridge' },
    { type: 'npc', who: 'deckhand-red', at: '@bridge' },
    { type: 'npc', who: 'deckhand-blue', at: '@bridge' },
    // (Jay gets out to watch: the finisher's two-shot and his lines are on him, on the street)
    { type: 'npc', who: 'jay', at: '@bridge' },
    BOSS1,
    { type: 'fight', checkpoint: true, enemies: ['deckhand-red', 'deckhand-blue'], arena: '@bridge', win: 'ko-all', rules: 'full', timer: 60, objective: 'Put **the deckhands** down.', sting: 'hit',
      during: [SAYAT(3, 'diego', 'Do be quick, gentlemen. The bridge is closing.'), SAYAT(12, 'jay', 'Get him, Mandi! Not Diego yet. The other one!'),
        SAYAT(22, 'diego', 'Twelve years I have paid these men. Twelve.', { how: 'deadpan' })] },
    BOSS2,
    { type: 'fight', checkpoint: true, enemies: ['diego'], arena: '@bridge', win: 'ko-all', rules: 'full', timer: 75, hp: 220, objective: 'Settle up with **Diego**.', sting: 'hit', shake: 0.4,
      during: [SAYAT(3, 'diego', 'Was that one? Did I throw one?'), SAYAT(9, 'mandi', 'That was a wave, Diego.'), SAYAT(16, 'diego', 'Forty to one, leopard. I set every price in this city.'),
        SAYAT(24, 'mandi', 'You set the price on my face.'), SAYAT(31, 'diego', 'And I was right. Look at you.'), SAYAT(40, 'jay', "Mandi, he's by the rail! The rail!")] },
    FINISH,
    { type: 'npc', remove: 'diego', who: 'diego' },
    FINAL,
    { type: 'transition', id: 'morning', kicker: '6:52 AM', text: 'THE PIER', sub: 'The morning after.', time: 'dawn', secs: 4 },
    { type: 'place', at: { '@': 'dawn', mode: 'walk' }, time: 'dawn' },
    // (Jay stood east of her along the pier (dawn-jay): over his shoulder she has the skyline across the harbor behind her)
    { type: 'npc', who: 'jay', at: { rel: 'player', right: 0.6, fwd: -2.6 } },
    DAWN,
    { type: 'actEnd', title: "MANDI'S REVENGE", story: ["She walks off the pier at first light, in the leopard and the slides, with Jay's jacket over her arm."],
      stats: [{ label: 'Ducks', value: '980 sevens, all winners' }, { label: 'Jay', value: 'returned, not taken back' }, { label: 'The jacket', value: 'hers' }] },
  ] };

// (the medals: gold, silver and bronze by the time from the mission's start and its damage. 28 Nov, from the story
// pass's test drive (autopilot at a player's pace, its fights assisted): gold its time plus a minute for a player's
// fights, silver plus two and a half, bronze plus five)
const MEDALS = { 'OF-1': [360, 450, 600], 'KC-2': [300, 390, 540], 'LL-3': [270, 360, 510], 'MP-4': [300, 390, 540],
  'PP-5': [270, 360, 510], 'WW-6': [390, 480, 630], 'DN-7': [270, 360, 510], 'BU-8': [300, 390, 540] };
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
    { name: 'Deckhand Red', role: 'deckhand' }, { name: 'Deckhand Blue', role: 'deckhand' }],
  // (the voices as the voice record credits them, split at its sentences (Mog City's line is 200 characters), as Jensen
  // Heist's; none before the record is in)
  ...(existsSync(VOICE) ? { voices: JSON.parse(readFileSync(VOICE, 'utf8')).credit.split(/(?<=\.) (?=[A-Z])/) } : {}) },
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
  // (Mog City mandi-props: a slow push on every street shot without a move of its own, the lens kept off walls)
  cine: { drift: 'push', room: true },
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
