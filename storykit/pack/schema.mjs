// Story Kit: STORY PACK v2, the schema. `node storykit/pack/schema.mjs` writes schema.json from this file (the check
// compares the two, so edit here, never the JSON).
//
// A pack is pure data: no code, no coordinates, no URLs outside its own voice folder. It names:
//   base       { engine, city, cityBuild }: the engine and city build it runs on (mogcity-1: Mog City's own, New York);
//              on a Mog, copied from the parent and locked (an older storykit-1 parent's moves to mogcity-1, same city)
//   dressing   { time, season, weather, holiday[], blackout? }: what the city wears (a Mog may change it, the city stays)
//   cast[]     people: a Character Forge sheet (scripts/forge/character-sheet.schema.json), an anchor, a Kokoro voice block;
//              or a shipped model from the cast registry (public/storykit/cast/registry.json: { model: 'mogcity/dan' })
//   pets[]     animals, as animals (a dog is a pet with species "dog", never a person renamed); a registry pet by model
//   vehicles[] rides: a vehicle sheet (storykit/vehicles/vehicle-sheet.schema.json) or one of the engine's stock cars
//   acts[]     of missions[], each with its vehicle, its verbs and the runner's steps (Mog City wagmi/storyrun/runner.js)
//   voices     the voice manifest: line id -> { voice, status: ready | pending, clip, hash }
// Places are names: "@key" from the city's place list (storykit/pack/cities.ts) or the pack's own aliases of them.
//
// gate.ts reads the JSON Schema below and adds the rules a schema can't say: places exist in the city, verbs map to the
// mission's vehicle, no kind renamed into another, foreign-city labels, likeness, moderation, the Mog lock.
import { KOKORO_VOICES, COLOUR_VOICES } from '../voices/voice-design.js';
import REGISTRY from '../../public/storykit/cast/registry.json' with { type: 'json' };

export const PACK_VERSION = 2;
export const FORGE_SHEET = 'https://gamemog.com/schema/forge/character-sheet.v2.json';
export const VEHICLE_SHEET = 'https://gamemog.com/storykit/vehicles/vehicle-sheet.schema.json';

// ── the closed lists the gate also reads ──
// mogcity-1: Mog City's own engine and look (mc.gamemog.com, its storyrun: the HUD, calls, cutscenes, fights, chases and
// free roam between missions are Mog City's). Every new Create and Mog is written for it; storykit-1 is the older engine,
// read only so older packs still pass the gate.
export const ENGINES = ['storykit-1', 'mogcity-1'];
// Mog City's authored set pieces a `scene` step plays by name (its own code, cast, camera and lines, never a copy; Mog City
// wagmi/storyrun/runner.js SCENES). Only on mogcity-1.
export const MOGCITY_SCENES = {
  opening: 'the opening: the van in the park, Dan and the Suits, then Mr. Big\'s video call from his study (about 80 s)',
  'm1.arrival': 'Mission 1: the van arrives at the park and the Suits get out (the fight follows)',
  'm1.tracker': 'Mission 1: the laptop tracker close-up, Dan sees where it is going',
  'm1.park': 'set dressing, at once: the park as Mission 1 dresses it, the van at its mark, the street there held clear',
};
export const CITIES = ['ny', 'sf'];
export const TIMES = ['golden', 'midday', 'twilight', 'midnight', 'dawn'];
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const WEATHER = ['clear', 'overcast', 'rain', 'storm', 'fog', 'snow'];
export const HOLIDAYS = ['christmas', 'new-year', 'halloween', 'thanksgiving', 'lunar-new-year', 'valentines', 'independence-day', 'diwali', 'hanukkah', 'pride'];
// a power cut in part of Manhattan (Mog City wagmi/storyrun/dressing.js): left out, the power is on
export const BLACKOUTS = ['midtown', 'downtown', 'manhattan'];
// archetype anchors (STORY-KIT-PLAN 3.3 #5): the hand-polished person a sheet varies from; 'none' starts from the base
export const ANCHORS = ['none', 'old-boss', 'young-hero', 'grandmother', 'grandfather', 'chef', 'cop', 'doorman', 'teen',
  'office-worker', 'driver', 'fixer', 'nurse', 'mechanic', 'street-vendor', 'musician',
  // (AN, 4 Nov: three more with hand-tuned sheets, storykit/anchors.json)
  'young-mother', 'club-promoter', 'veteran'];
// what a mission asks the player to do; gate.ts VERBS says which ride (or none) can do each
export const VERBS = ['drive', 'walk', 'boost', 'hop', 'dash', 'ram', 'escape', 'chase', 'tail', 'follow', 'carry', 'sneak', 'deliver', 'pedal', 'lean', 'wheelie', 'tow', 'fight'];
export const STOCK_CARS = ['trailhand', 'vandal', 'roadster'];
export const STEP_KINDS = ['drive', 'stops', 'walk', 'pursuit', 'timer', 'call', 'voicemail', 'voicenote', 'choice', 'cutscene',
  'place', 'set', 'say', 'wait', 'goto', 'end', 'label', 'transition', 'vignette', 'wallet', 'actEnd', 'comfort', 'tail',
  'stealth', 'patrol', 'convoy', 'trigger', 'beat', 'roadblock', 'passenger', 'npc', 'fight', 'dm', 'search', 'scene', 'tow'];
// the kinds Mog City's runner has no part for yet (Mog City wagmi/storyrun/runner.js KINDS_STUB): on mogcity-1 they pass
// at once without playing, so a story never rests on one (gate.ts warns; the builder refuses them in a new story)
export const MOGCITY_STUBS = ['convoy', 'comfort', 'patrol', 'roadblock', 'passenger', 'wallet', 'stealth'];
// the cast registry (public/storykit/cast/registry.json): shipped, hand-polished people (a GLB with its own clips and face,
// its recorded lines), voice-only people with recorded lines, and pets. storykit/cast/README.md
export const CAST_MODELS = Object.entries(REGISTRY.models).filter(([, m]) => m.kind !== 'pet').map(([k]) => k);
export const PET_MODELS = Object.entries(REGISTRY.models).filter(([, m]) => m.kind === 'pet').map(([k]) => k);
export const LIMITS = { bytes: 160_000, acts: 3, missions: 9, steps: 60, cast: 12, pets: 3, vehicles: 6, lines: 600 };

// ── builders ──
const S = (maxLength, extra = {}) => ({ type: 'string', maxLength, ...extra });
const N = (minimum, maximum, extra = {}) => ({ type: 'number', minimum, maximum, ...extra });
const I = (minimum, maximum, extra = {}) => ({ type: 'integer', minimum, maximum, ...extra });
const E = (list, extra = {}) => ({ enum: list, ...extra });
const B = { type: 'boolean' };
const R = (name) => ({ $ref: `#/$defs/${name}` });
const O = (properties, required = [], extra = {}) => ({ type: 'object', additionalProperties: false, required, properties, ...extra });
const A = (items, maxItems, minItems = 0, extra = {}) => ({ type: 'array', items, minItems, maxItems, ...extra });
const ONE = (...oneOf) => ({ oneOf });

// fields every step can carry (missions/README.md "Fields every step can carry"), the during list added per step
const COMMON = {
  id: R('stepId'), if: R('cond'), checkpoint: B, at: N(0, 600, { description: 'a side step only (during, do): seconds in' }), after: R('set'), goto: R('stepId'), end: B, persist: B, until: R('stepId'),
  backdrop: O({ place: R('placeRef'), text: R('label'), sub: R('line'), color: R('colour') })
};
const step = (type, props, required = []) => O({ type: { const: type }, ...COMMON, during: A(R('sideStep'), 6), ...props }, ['type', ...required]);
const camRef = R('camRef');
// a cutscene shot: `say` + `line` is a cast member's spoken line under the shot (a subtitle until its clip is ready)
const shot = O({ cam: camRef, to: camRef, look: camRef, lookTo: camRef, dur: N(0.5, 12), fov: N(20, 90), sub: R('line'), say: R('castRef'), line: R('speech'), caption: R('label') }, ['cam']);
// a choice's fields: a choice step, or the choice at the end of an answered call (call.choice)
const CHOICE = {
  prompt: S(120), who: R('castRef'), timeout: N(3, 30), default: ONE(I(0, 3), { type: 'null' }), defaultText: S(80),
  options: A(O({ text: S(80), set: R('set'), reply: R('speech'), goto: R('stepId'), value: R('slug'), label: S(24) }, ['text']), 4, 2),
  silenceReply: R('speech'), silenceValue: R('slug'), silenceLabel: S(24), fork: S(8, { pattern: '^[A-Z0-9]{1,8}$' }), flag: R('flag')
};

const actEndCard = O({
  title: R('label'), heading: R('label'), stats: A(O({ label: S(24), value: S(24) }, ['label', 'value']), 6),
  story: A(R('line'), 4), quote: O({ text: R('line'), by: R('castRef'), tag: R('slug'), missing: R('line') }, ['text']),
  meter: R('slug'), minSecs: N(0, 12), signed: S(40),
  next: O({ kicker: S(24), text: S(80), sub: R('line'), at: N(0, 1000), secs: N(1, 8) }, ['text'])
});

const STEPS = {
  drive: step('drive', { to: ONE(R('placeRef'), A(R('placeRef'), 6, 1)), radius: N(3, 60), stop: B, objective: R('objective'), bonus: N(0, 600), flag: R('flag'), uTurns: B, snap: B }, ['to']),
  stops: step('stops', { stops: A(R('stopRef'), 8, 1), radius: N(3, 60), objective: R('objective') }, ['stops']),
  walk: step('walk', { to: R('placeRef'), radius: N(1, 20), leaveCar: B, enterCar: B, beam: B, objective: R('objective') }, ['to']),
  pursuit: step('pursuit', {
    count: R('value'), level: I(1, 5), kind: E(['crew', 'police']), goal: E(['lose', 'reach', 'escort']), to: R('placeRef'), radius: N(3, 60),
    los: N(0, 20), roles: A(E(['chaser', 'cutter', 'pacer', 'blocker']), 6), until: N(5, 600), loseDist: N(40, 400), loseTime: N(1, 30),
    alert: R('label'), peelText: R('label'), objective: R('objective'), bonus: N(0, 600), flag: R('flag')
  }, ['goal']),
  timer: step('timer', { seconds: R('value'), label: S(16), fail: E(['hard', 'soft']), flag: R('flag'), why: R('line'), set: R('set'), lateLabel: S(16), stop: B }),
  call: step('call', {
    who: R('castRef'), role: S(40), ring: N(2, 20), lines: A(R('spoken'), 40), answer: R('set'), decline: R('set'),
    // the car phone (Mog City's): it answers itself, talks only while the hero is at the wheel (on hold when he gets out,
    // with the hold lines), plays its extra blocks while the leg it rides on lasts, and wraps up when that leg ends
    auto: { ...B, description: 'answers itself (no ring, no decline): a call the hero always takes, on the car phone' },
    inCar: { ...B, description: 'talks only while the hero is in a car; on foot it holds (hold.pause), back in it resumes (hold.resume)' },
    extra: A(A(R('spoken'), 12, 1), 8, 0, { description: 'more talk, block by block, after the lines and while the step it rides on still runs (a long drive)' }),
    wrap: A(R('spoken'), 6, 0, { description: 'when the step it rides on ends (he arrived), the line being said finishes, then these, then the call ends' }),
    hold: O({ pause: A(R('spoken'), 2), resume: A(R('spoken'), 2) }, [], { description: 'inCar: what is said when he gets out, and when he is back at the wheel' }),
    voicemail: O({ text: R('speech'), secs: N(0.5, 20), from: R('castRef'), flag: R('flag'), set: R('set') }, ['text']),
    outgoing: B, pickup: B, tag: R('slug'), duck: B, carry: B,
    choice: O(CHOICE, ['prompt', 'options'], { description: 'a timed choice when the call is answered, after its lines' })
  }, ['who']),
  voicemail: step('voicemail', { who: R('castRef'), role: S(40), text: R('speech'), secs: N(0.5, 20), time: R('clock'), set: R('set') }, ['who', 'text']),
  voicenote: step('voicenote', { who: R('castRef'), role: S(40), text: R('speech'), secs: N(0.5, 20), time: R('clock'), set: R('set') }, ['who', 'text']),
  choice: step('choice', CHOICE, ['prompt', 'options']),
  cutscene: step('cutscene', { shots: A(shot, 12, 1), place: R('placeRef') }, ['shots']),
  place: step('place', { at: R('placeRef'), time: E(TIMES), bonus: N(0, 600) }, ['at']),
  set: step('set', { set: R('set') }, ['set']),
  say: step('say', { who: R('castRef'), text: R('speech'), secs: N(0.5, 12), wait: B }, ['who', 'text']),
  wait: step('wait', { secs: N(0, 30), call: { ...B, description: 'ends early once no call is live (a car phone wrapping up), secs at most' } }, ['secs']),
  goto: step('goto', { to: R('stepId') }, ['to']),
  end: step('end', { fail: R('line') }),
  label: step('label', { label: S(24) }, ['label']),
  transition: step('transition', { kicker: S(24), text: S(80), sub: R('line'), secs: N(1, 8), clock: R('clock'), at: N(0, 1000), time: E(TIMES), place: R('placeRef'), traffic: N(0, 1), set: R('set') }, ['text']),
  vignette: step('vignette', {
    place: R('placeRef'), color: R('colour'),
    shots: A(O({ dur: N(0.5, 12), text: S(120), sub: R('line'), caption: R('label'), say: R('castRef'), line: R('speech'), cam: camRef, to: camRef, look: camRef, lookTo: camRef, fov: N(20, 90), color: R('colour'), if: R('cond') }), 12, 1)
  }, ['shots']),
  wallet: step('wallet', { title: S(40), bills: A(O({ name: S(40), amount: N(0, 1e6), due: S(24) }, ['name', 'amount']), 6, 1), pop: N(1, 20) }, ['bills']),
  actEnd: step('actEnd', { ...actEndCard.properties }),
  comfort: step('comfort', {
    who: R('beingRef'), label: S(24), start: N(0, 1), refill: N(0, 0.5), fail: E(['hard', 'soft']), flag: R('flag'), why: R('line'), set: R('set'),
    drain: O({ brake: N(0, 1), lateral: N(0, 1), hit: N(0, 1), bump: N(0, 1), time: N(0, 0.2) }),
    lines: A(O({ below: N(0, 1), who: R('castRef'), text: R('speech') }, ['below', 'who', 'text']), 6)
  }, ['who']),
  tail: step('tail', {
    name: S(40), car: E(['lowered', 'sedan', 'suv']), color: R('colour'), route: A(R('placeRef'), 12, 2), ahead: N(20, 200), speed: N(3, 30),
    ring: N(10, 60), spotTime: N(1, 10), lostDist: N(60, 400), lostTime: N(3, 30), objective: R('objective')
  }, ['route']),
  stealth: step('stealth', {
    units: A(O({ '@': R('placeKey'), kind: E(['police', 'scout']), roam: N(0, 200), radius: N(10, 80), heading: R('heading') }, ['@']), 8, 1),
    radius: N(10, 80), detect: N(0.5, 10), lightsOff: N(0, 1), call: N(1, 2), foot: N(0, 1),
    onDetect: ONE(E(['fail']), O({ goto: R('stepId') }, ['goto']), O({ set: R('set') }, ['set']), O({ pursuit: O({ count: R('value'), level: I(1, 5) }) }, ['pursuit'])),
    why: R('line'), hint: R('label')
  }, ['units']),
  patrol: step('patrol', { count: I(1, 4), near: R('placeRef'), roam: N(50, 600), radius: N(10, 120), limit: N(5, 40), heat: N(0, 100), escalate: I(1, 6), pursuit: O({ count: R('value'), level: I(1, 5) }) }),
  convoy: step('convoy', {
    route: A(R('placeRef'), 12, 2), cars: I(1, 8), lead: E(['hearse', 'van', 'sedan', 'suv']), speed: N(3, 20), gap: N(6, 40),
    band: A(N(2, 80), 2, 2), refill: N(0, 0.5), fail: ONE(E(['hard', 'soft']), { type: 'null' }), flag: R('flag'), label: S(24), objective: R('objective'),
    drain: N(0, 0.5)
  }, ['route']),
  trigger: step('trigger', {
    street: S(40), area: O({ '@': R('placeKey'), r: N(5, 200) }, ['@', 'r']), when: R('cond'), once: B, cue: S(16, { pattern: '^[a-z][a-z-]{0,15}$' }),
    say: R('sayLine'), set: R('set'), flag: R('flag'), atStart: B, do: A(R('sideStep'), 6)
  }),
  beat: step('beat', { shot: O({ cam: camRef, look: camRef, to: camRef, lookTo: camRef, fov: N(20, 90) }, ['cam']), dur: N(0.5, 6), say: R('sayLine') }, ['shot']),
  roadblock: step('roadblock', { at: R('placeRef'), r: N(6, 40), cars: I(1, 4), kind: E(['police', 'crew']), text: R('label') }, ['at']),
  passenger: step('passenger', { who: R('beingRef'), board: B, seat: E(['front', 'rear', 'rear-left']), from: R('placeRef'), to: R('placeRef'), secs: N(1, 8) }, ['who']),
  // a street fight on foot (Mog City's W.combat): the hero against cast members with a body
  fight: step('fight', {
    enemies: A(R('castRef'), 8, 1, { description: 'who he fights: cast ids with a body (a seen person, never the hero); an id twice is two of them' }),
    arena: { ...R('placeRef'), description: 'where: he is put there on foot, the men come at him from ahead' },
    win: E(['ko-all', 'survive'], { description: 'ko-all: every man put down for good; survive: on his feet when the timer runs out' }),
    timer: N(10, 300, { description: 'seconds: ko-all within it (else failed), or how long to hold on (survive needs it)' }),
    rules: E(['lesson', 'full'], { description: 'lesson: forgiving, one man at a time, plain blows; full (default): feints, red kicks, a guessed counter whiffs' }),
    hp: N(40, 400, { description: "the hero's health (100)" }), objective: R('objective'), why: R('line')
  }, ['enemies', 'arena', 'win']),
  // a text message on the phone (Mog City's DMs): from a cast member, or a name ("Unknown number"); read, never voiced
  dm: step('dm', { from: R('castRef'), name: S(40), text: S(280), secs: N(2, 20), wait: B }, ['text']),
  // hold a key at a spot on foot (search the van, take a dropped phone): F held for secs inside the ring. on: 'ride' is
  // a search of the hero's own car (its trunk, a door's glovebox, under its hood) held at the car wherever he parked it,
  // following it; `at` is then where he drives it to (the route's target until he is there). Mog City's runner also
  // takes a search whose words name the car's trunk, boot or glovebox, or the car by name, as one; on: 'place' says not
  search: step('search', { at: R('placeRef'), label: S(40, { description: 'what holding does, lower case: "search the van", "search the trunk"' }), secs: N(0.3, 6), radius: N(1.5, 12), objective: R('objective'),
    on: E(['place', 'ride'], { description: "place (default): hold F at the place. ride: at the hero's own car (the mission's vehicle), wherever he parked it: its trunk, door or hood (part)" }),
    part: E(['trunk', 'door', 'hood'], { description: "with on: 'ride', which part of the car (trunk if left out; door for the glovebox, the seats or the door pockets)" }) }, ['at', 'label']),
  // a tow (Mog City's runner): a car stands at the target place; the hero's wrecker (a ride with the tow ability) backs up
  // to its nose, F held at the wheel hooks it on the wheel-lift, then it is towed to `to` and let down there
  tow: step('tow', {
    target: { ...R('placeRef'), description: 'where the car to tow stands (on the kerb, a little before that corner): a drive place' },
    car: S(48, { pattern: '^(sedan|suv|taxi|pickup|van|minivan|[a-z0-9][a-z0-9.-]{0,47})$', description: "the car on the hook: a city body (sedan, suv, taxi, pickup, van, minivan; sedan if left out) or one of the pack's vehicles by id (its sheet: an ambulance is a van sheet with a livery)" }),
    color: R('colour'), name: S(40, { description: 'what it is called on screen, lower case: "the ambulance"' }),
    to: { ...R('placeRef'), description: 'where it is towed to and let down: a drive place' },
    radius: N(3, 60), secs: N(0.3, 6), objective: R('objective'), hookObjective: R('objective'), dropObjective: R('objective'), bonus: N(0, 600), flag: R('flag')
  }, ['target', 'to']),
  // one of Mog City's authored set pieces (MOGCITY_SCENES), as the shipped game plays it; mogcity-1 only
  scene: step('scene', { name: E(Object.keys(MOGCITY_SCENES), { description: Object.entries(MOGCITY_SCENES).map(([k, v]) => `${k}: ${v}`).join('; ') }), time: E(TIMES, { description: 'the time of day after it' }) }, ['name']),
  npc: step('npc', { who: R('beingRef'), at: ONE(R('placeRef'), O({ rel: { const: 'player' }, right: N(-20, 20), fwd: N(-20, 20) }, ['rel'], { description: "beside the player (the kerb is to the right), facing him" })), color: R('colour'), remove: R('slug') })
};



const mission = O({
  id: R('missionId'), title: S(48), vehicle: R('rideRef'), verbs: A(E(VERBS), 8, 0, { uniqueItems: true }),
  start: R('placeRef'), traffic: N(0, 1), stakes: R('line'), passLine: R('line'), note: R('line'), timerLine: S(80), label: S(24),
  reward: R('set'), hiddenMeters: A(R('slug'), 4), next: R('missionId'), hidden: B, steps: A({ $ref: '#/$defs/step' }, LIMITS.steps, 1)
}, ['id', 'title', 'vehicle', 'start', 'steps']);

const voice = {
  type: 'object', additionalProperties: false, required: ['id', 'description'],
  description: 'A Kokoro-82M voice (storykit/voices/voice-design.js): one stock voice, or a blend of up to 3, then speed and pitch. An invented voice, never a recording or an imitation of a person.',
  properties: {
    id: S(60, { pattern: '^[a-z0-9-]{2,60}$', description: "the voice's id; the cast sheet's voice.id names the same" }),
    kokoro: E(Object.keys(KOKORO_VOICES), { description: 'one English stock voice (the base)' }),
    blend: { type: 'object', minProperties: 1, maxProperties: 3, propertyNames: E([...Object.keys(KOKORO_VOICES), ...COLOUR_VOICES]), additionalProperties: N(0, 1), description: 'up to 3 voices and their weights (normalised); the heaviest English stock voice is the base, other languages at most 0.35' },
    speed: N(0.8, 1.2), pitch: N(-2.5, 2.5, { description: 'semitones, after rendering' }),
    description: S(160, { description: 'the voice in words: age, warmth, pace, accent. Never "sounds like" anyone' })
  },
  anyOf: [{ required: ['kokoro'] }, { required: ['blend'] }]
};

export const SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://gamemog.com/storykit/pack/story-pack.v2.json',
  title: 'GameMog Story Kit: story pack v2',
  description: 'A story for Mog City\'s engine (base.engine mogcity-1: mc.gamemog.com plays it with its own HUD, calls, cutscenes, fights and chases), as data only. Closed word lists, bounded numbers (clamped by the gate, not refused) and bounded texts (refused when too long). Places are names from the city; people are Character Forge sheets; rides are vehicle sheets or the engine\'s stock cars; voices are Kokoro blends. gate.ts holds the rules beyond this schema.',
  type: 'object', additionalProperties: false,
  required: ['storykit', 'id', 'title', 'base', 'dressing', 'cast', 'vehicles', 'acts'],
  properties: {
    storykit: { const: PACK_VERSION },
    id: R('packId'),
    parent: { ...R('packId'), description: 'a Mog: the pack it remixes (its base is copied and locked)' },
    title: S(48), kicker: S(24), tagline: S(80),
    base: O({ engine: E(ENGINES), city: E(CITIES), cityBuild: S(40, { pattern: '^[a-z]{2,8}-[a-z0-9.-]{1,30}$' }) }, ['engine', 'city', 'cityBuild'],
      { description: 'what the story runs on; on a Mog, equal to the parent\'s (locked)' }),
    dressing: O({ time: E(TIMES), season: E(SEASONS), weather: E(WEATHER), holiday: A(E(HOLIDAYS), 2, 0, { uniqueItems: true }),
      blackout: E(BLACKOUTS, { description: 'the power is out there (midtown: 34th to 59th St; downtown: below 34th St; manhattan: all of it, the boroughs over the rivers lit): dark windows, street lights and billboards, dead signals, emergency cars, stranded cars, generator-lit islands. Left out, the power is on' }) }, ['time', 'season', 'weather']),
    hero: { ...R('castRef'), description: 'the player character (a cast id)' },
    ride: { ...R('rideId'), description: 'the free-drive ride (a vehicle id); the first vehicle when left out' },
    hud: O({
      clock: O({ label: S(12), format: E(['count', 'age', 'text']), unit: S(12, { pattern: '^[a-z]{1,12}$' }), unitLabel: S(12), zero: S(24) }),
      meters: A(O({ id: R('slug'), label: S(12), kind: E(['money', 'count', 'pips', 'bar', 'hidden'], { description: 'count: a plain number that only adds up (supporters), money without the dollars or the choices' }), start: N(-1e6, 1e6), min: N(-1e6, 1e6), max: N(-1e6, 1e6), pips: I(1, 10), cool: N(0, 100), heat: B, prefix: S(2) }, ['id', 'kind']), 4)
    }),
    places: { type: 'object', maxProperties: 24, propertyNames: R('placeKey'), additionalProperties: O({ '@': R('placeKey'), name: S(60), face: R('placeKey'), heading: R('heading') }, ['@']),
      description: 'the pack\'s own names for city places: { key: { "@": cityKey, name } }. Never a coordinate.' },
    cast: A(O({
      id: R('slug'), anchor: E(ANCHORS), color: R('colour'), voiceOnly: { ...B, description: 'heard, never seen (a dispatcher on the phone): no sheet, no body' },
      model: E(CAST_MODELS, { description: 'a shipped person from the cast registry (public/storykit/cast/registry.json), as they are: their own body, clips, face and recorded lines. No sheet. anchor and voice default to the registry\'s' }),
      name: S(40, { description: 'a model person\'s name (a sheet carries its own): a rename keeps the body' }), role: S(60, { description: 'a model person\'s role' }),
      sheet: { $ref: FORGE_SHEET }, voice
    }, ['id', 'color']), LIMITS.cast, 1),
    pets: A(O({ id: R('slug'), name: S(40), species: E(['dog'], { description: 'the rigged animals the engine has' }), breed: E(['mixed', 'terrier', 'shepherd', 'retriever', 'bulldog', 'husky', 'poodle', 'spaniel']), coat: R('colour'), size: E(['small', 'medium', 'large']), owner: R('castRef'),
      model: E(PET_MODELS, { description: 'a shipped pet from the cast registry (mogcity/moon: Moon, a small white fluffy dog); without one a dog is built the same way in its coat and size' }),
      follows: { ...B, description: 'stays with its owner, the hero, as the player plays: trots after them on foot, rides in the car beside them, sits when they stop' } }, ['id', 'name', 'species']), LIMITS.pets),
    vehicles: A({ oneOf: [
      O({ stock: E(STOCK_CARS, { description: "one of the stock cars as it is (trailhand and vandal: their sheets in storykit/vehicles; roadster: Mog City's own)" }), id: R('rideId'), paint: R('colour') }, ['stock']),
      { $ref: VEHICLE_SHEET }
    ] }, LIMITS.vehicles, 1),
    acts: A(O({
      id: R('slug'), name: S(24),
      timeline: { type: 'object', maxProperties: 9, propertyNames: R('missionId'), additionalProperties: O({ at: N(0, 1000), clock: R('clock'), time: E(TIMES), skip: S(60), date: S(40) }) },
      end: R('actEndCard'), missions: A(mission, 6, 1)
    }, ['id', 'missions']), LIMITS.acts, 1),
    voices: { type: 'object', maxProperties: LIMITS.lines, propertyNames: R('lineId'), additionalProperties: O({
      voice: R('slug'), status: E(['ready', 'pending']), clip: ONE(S(160, { pattern: '^voices/[a-z0-9][a-z0-9_/-]{0,120}\\.(ogg|opus|mp3|wav|m4a)$' }), { type: 'null' }), hash: S(8, { pattern: '^[0-9a-f]{8}$' })
    }, ['voice', 'status']), description: 'the voice manifest: line id -> its clip (relative to the pack) or pending. Lines left out are pending; subtitles play until a clip is ready.' }
  },
  $defs: {
    packId: S(40, { pattern: '^[a-z0-9][a-z0-9-]{1,39}$' }),
    slug: S(40, { pattern: '^[a-z0-9][a-z0-9-]{0,39}$' }),
    rideId: S(48, { pattern: '^[a-z0-9][a-z0-9.-]{0,47}$' }),
    rideRef: S(48, { pattern: '^(on-foot|[a-z0-9][a-z0-9.-]{0,47})$', description: 'a vehicle id, or on-foot' }),
    missionId: S(12, { pattern: '^[A-Z0-9][A-Z0-9-]{0,11}$' }),
    stepId: S(24, { pattern: '^[a-z0-9][a-z0-9_-]{0,23}$' }),
    lineId: S(64, { pattern: '^[A-Z0-9-]{1,12}(\\.[a-z0-9]{1,6}){1,6}$' }),
    flag: S(40, { pattern: "^[A-Za-z0-9 _'-]{1,40}$" }),
    placeKey: S(40, { pattern: '^[a-z0-9][a-z0-9_-]{0,39}$' }),
    placeRef: ONE(S(41, { pattern: '^@[a-z0-9][a-z0-9_-]{0,39}$' }), O({ '@': R('placeKey'), face: R('placeKey'), heading: R('heading'), mode: E(['car', 'walk']) }, ['@'])),
    stopRef: ONE(S(41, { pattern: '^@[a-z0-9][a-z0-9_-]{0,39}$' }), O({ '@': R('placeKey'), name: S(60), bonus: N(0, 600), set: R('set') }, ['@'])),
    camRef: ONE(S(41, { pattern: '^(player|@[a-z0-9][a-z0-9_-]{0,39}|[a-z][a-z0-9-]{1,39})$', description: "'player', a place, or the city's named camera point" }),
      O({ rel: S(40, { pattern: '^(player|[a-z0-9][a-z0-9-]{0,39})$', description: "'player' (his position, in his frame) or a cast id with a body on the street (their head, in their frame)" }), right: N(-80, 80), up: N(-10, 120), fwd: N(-80, 80) }, ['rel'])),
    castRef: R('slug'),
    beingRef: { ...R('slug'), description: 'a cast id (with a body) or a pet id' },
    heading: N(-360, 360, { description: 'degrees, 0 faces +z' }),
    clock: S(12),
    colour: S(7, { pattern: '^#[0-9A-Fa-f]{6}$' }),
    label: S(80, { description: 'on-screen words: titles, captions, objectives' }),
    objective: S(120, { description: 'the HUD objective; **bold**, {n} {of} {name} and ride tokens ({ride}, {ride.name}, {ride.board}, {ride.go}, {ride.park})' }),
    line: S(160),
    speech: S(200, { description: 'a spoken line (voiced; a subtitle until its clip is ready)' }),
    spoken: O({ who: R('castRef'), text: R('speech'), secs: N(0.5, 20) }, ['who', 'text']),
    sayLine: O({ who: R('castRef'), text: R('speech') }, ['who', 'text']),
    cond: ONE(S(120), O({ all: A({ $ref: '#/$defs/cond' }, 6, 1) }, ['all']), O({ any: A({ $ref: '#/$defs/cond' }, 6, 1) }, ['any']), O({ not: { $ref: '#/$defs/cond' } }, ['not'])),
    value: ONE(N(0, 3600), O({ base: N(0, 3600), add: A(O({ if: R('cond'), n: N(-3600, 3600) }, ['if', 'n']), 6), min: N(0, 3600), max: N(0, 3600) }, ['base'])),
    amount: ONE(N(-1e6, 1e6), O({ add: N(-1e6, 1e6) }, ['add']), O({ to: N(-1e6, 1e6) }, ['to'])),
    setOne: O({
      meters: { type: 'object', maxProperties: 6, propertyNames: R('slug'), additionalProperties: R('amount') },
      flags: { type: 'object', maxProperties: 12, propertyNames: R('flag'), additionalProperties: ONE(B, S(40), N(-1e6, 1e6), O({ add: N(-1e6, 1e6) }, ['add'])) },
      label: S(24), if: R('cond'),
      wallet: A(O({ name: S(40), amount: N(0, 1e6), due: S(24) }, ['name', 'amount']), 6)
    }),
    set: ONE(R('setOne'), A(R('setOne'), 6, 1)),
    actEndCard,
    sideStep: { $ref: '#/$defs/step', description: 'a step started alongside another (during, a trigger\'s do); gate.ts refuses a side step inside a side step' },
    step: { oneOf: Object.values(STEPS) }
  }
};

// node storykit/pack/schema.mjs  ->  storykit/pack/schema.json
if (import.meta.url === `file://${process.argv[1]}`) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(new URL('./schema.json', import.meta.url), JSON.stringify(SCHEMA, null, 1) + '\n');
  console.log('wrote storykit/pack/schema.json');
}
