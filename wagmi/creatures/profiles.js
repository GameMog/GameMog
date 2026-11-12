// Mog City: how each library creature fights (wagmi/creatures/fighter.js plays them). Every number is the creature's own,
// at its own height (asset.json height; a creature made bigger or smaller scales them): the clip times were read off
// its clips by forward kinematics (the striking bone's path through each clip), the reaches are where that bone is at
// the moment it lands, and the body it lands with is its skin's capsules (body.js).
// A blow: clip, from (where the clip starts: the wind-up's first frame worth showing), hit (the clip's moment of
// contact), until (where it ends), tele (s from the start of the swing to contact: the wind-up is slowed or quickened
// to fill it, so the cue and the body tell the same story), limbs (the capsules that land it, tested against Dan's
// body from a beat before contact to a beat after), range (from the creature's root to Dan's middle at contact, m),
// use [min, max] (the root distances it is chosen from), dmg (x the creature's damage), counter (yellow: a counter
// stops it; else red: dodge it), heavy (it puts Dan down), quake { r, at, ahead } (a red ring on the street: inside it
// at contact, Dan goes down whatever he does; its middle at the bone `at` or `ahead` m in front), travel { from, to,
// max } (it covers ground toward Dan between those clip times: a lunge or a leap, up to max m), dip (the T-rex's neck
// brought down so its bite meets a man on foot, rad), mounted (only at a man high up: a rider), w (how often), win
// [before, after] (its contact window, clip s round hit), tol (how near its capsules must come, m), ts1 (its pace after
// contact), phase (a boss's phase blow: never a turn of its own), voice / voiceAt (its sound, and how much later).
// The rest: hp, dmg (base), speed (m/s, its fastest in a fight), turn (rad/s), poise (heavy blows it takes before it
// staggers; a counter counts two), ring (the director's slot round Dan, m), foot (its footprint's radius for walls and
// the others, m), spacing (how far the others keep from it), heavy (not shoved, thrown or put down by Dan's blows: the
// big ones, and any taller than 2.6 m), special (its display: a roar, a chest beat), idle (its lair's loop), alias
// (the fight's bone names on its own bones: hips, spine1, spine2, neck, head), steps (its footfalls, the pack sounds;
// stepsGrass on a park's grass), voice (its sounds: hurt, strike, land, down, roar, beat), beats (its chest beat's
// thumps, clip s), shake (its footfalls felt through the view), gaitless (no walk clip: its legs are swung by the
// code), graze (wildlife: its neck bones bent down to graze, and how far).
// Sounds are the library's packs (wagmi/library/sounds.js names): no Kenney punch on Dan's blows (the owner's rule: his
// fists keep the fight's own synthesised sounds); these are the creatures' own feet, roars, armour and slams.
const IMP = 'pack:sounds-impact/', SCI = 'pack:sounds-scifi/', HORSE = 'pack:sounds-horse/';

export const PROFILES = {
  'creature-knight': {
    name: 'Knight', hp: 60, dmg: 9, speed: 3.0, turn: 9, poise: 1, ring: null, foot: 0.42, spacing: 0.85,
    alias: { hips: 'pelvis', spine1: 'spine1', spine2: 'chest', neck: 'neck', head: 'head' },
    blows: {
      // the right gauntlet: drawn back from 1.38 s, at full stretch (0.70 m out, 1.50 m up) at 2.00 s
      jabR: { clip: 'Attack', from: 1.38, hit: 2.0, until: 2.45, tele: 0.72, limbs: ['hand_R', 'forearm_R'], range: 0.86, use: [0, 1.6], dmg: 1, counter: true, w: 2 },
      // the left one: drawn back from 2.75 s, out (0.68 m) at 3.29 s
      jabL: { clip: 'Attack', from: 2.75, hit: 3.29, until: 3.8, tele: 0.66, limbs: ['hand_L', 'forearm_L'], range: 0.86, use: [0, 1.6], dmg: 1, counter: true, w: 2 },
      // the push kick: the right foot comes up from 1.85 s and is out (0.89 m, 1.0 m up) at 2.28 s, held, then down
      kick: { clip: 'Kick', from: 1.8, hit: 2.28, until: 3.6, tele: 0.9, limbs: ['toe_R', 'foot_R', 'shin_R'], range: 1.0, use: [0, 1.8], dmg: 1.25, counter: false, w: 1, ts1: 1.5 },
    },
    special: null,
    steps: [{ s: IMP + 'footstep_concrete', vol: 0.45, rate: 0.85 }, { s: IMP + 'impactMetal_light', vol: 0.08, rate: 1.5 }],
    stepsGrass: [{ s: IMP + 'footstep_grass', vol: 0.4, rate: 1.25 }, { s: IMP + 'impactMetal_light', vol: 0.08, rate: 1.5 }],
    voice: { hurt: [{ s: IMP + 'impactPlate_light', vol: 0.32, rate: 1.1 }], down: [{ s: IMP + 'impactPlate_medium', vol: 0.5, rate: 0.8 }] },
  },
  'creature-centaur': {
    name: 'Centaur', hp: 170, dmg: 12, speed: 3.8, turn: 5, poise: 2, ring: 3.8, foot: 0.7, spacing: 1.5, heavy: true,
    alias: { hips: 'waist', spine1: 'hspine', spine2: 'hchest', neck: 'neck', head: 'head' },
    blows: {
      // the backhand: the right arm up and back (1.25 s), swung through at full stretch (1.75 m out, at a man's head) at 1.85 s
      swipe: { clip: 'Attack', from: 1.2, hit: 1.85, until: 2.6, tele: 0.8, limbs: ['hand_R', 'forearm_R'], range: 1.85, use: [0, 2.6], dmg: 1, counter: true, w: 3 },
      // up on its hind legs (0.5-1.0 s, held), and the forehooves down onto him (through 0.7 m at 2.72 s)
      rear: { clip: 'Rear', from: 0.45, hit: 2.72, until: 3.3, tele: 1.5, limbs: ['fpaw_L', 'fpaw_R', 'metacarpus_L', 'metacarpus_R', 'fforearm_L', 'fforearm_R'], range: 1.25, use: [0, 2.2], dmg: 1.8, counter: false, heavy: true, w: 1, win: [-0.18, 0.1] },
    },
    special: 'Rear',
    steps: [{ s: IMP + 'impactWood_light', vol: 0.3, rate: 0.7 }],
    stepsGrass: [{ s: IMP + 'footstep_grass', vol: 0.35, rate: 1.1 }],
    voice: { hurt: [], land: [{ s: IMP + 'impactWood_heavy', vol: 0.55, rate: 0.6 }] },
  },
  'creature-ogre': {
    name: 'Ogre', hp: 300, dmg: 14, speed: 2.6, turn: 4.5, poise: 2, ring: 4.0, foot: 0.75, spacing: 1.6, heavy: true,
    alias: { hips: 'pelvis', spine1: 'spine1', spine2: 'spine2', neck: 'head', head: 'head' },
    blows: {
      // the hammer fist: the right arm up over his head (to 2.74 m at 1.5 s) and down (1.98 m, 1.03 m out at 1.75 s; his chest at 1.88)
      smash: { clip: 'Attack', from: 0.45, hit: 1.76, until: 2.6, tele: 1.05, limbs: ['hand_R', 'forearm_R'], range: 1.2, use: [0, 2.0], dmg: 1.2, counter: true, w: 2, win: [-0.1, 0.16] },
      // both fists up (0.75 s) and into the street before him (0.38 m up, 0.62 m out at 1.36 s): a red ring round where they land
      slam: { clip: 'GroundSlam', from: 0.08, hit: 1.36, until: 2.6, tele: 1.3, quake: { r: 2.6, ahead: 0.62 }, range: 1.6, use: [0, 2.6], dmg: 1.6, counter: false, heavy: true, w: 2 },
    },
    special: 'GroundSlam',
    steps: [{ s: IMP + 'impactSoft_heavy', vol: 0.45, rate: 0.55 }],
    voice: { land: [{ s: IMP + 'impactMining', vol: 0.8, rate: 0.6 }, { s: SCI + 'lowFrequency_explosion', vol: 0.5, rate: 1.3 }] },
  },
  'creature-ape': {
    name: 'Ape', hp: 240, dmg: 14, speed: 3.4, turn: 6, poise: 2, ring: 3.6, foot: 0.8, spacing: 1.6, heavy: true,
    alias: { hips: 'pelvis', spine1: 'spine1', spine2: 'chest', neck: 'head', head: 'head' },
    blows: {
      // up on its legs, arms high (to 3 m at 1.4 s), and both fists down into the street (2.15 s), lunging at him on the way
      pound: { clip: 'Jump', from: 0.15, hit: 2.15, until: 2.85, tele: 1.45, quake: { r: 1.9, ahead: 0.9 }, travel: { from: 0.75, to: 2.1, max: 2.6 }, range: 1.5, use: [0, 4.2], dmg: 1.7, counter: false, heavy: true, w: 1 },
      // the same leap from well out: a bound across the gap and both fists down on him (a wider ring, the whole wind-up to
      // see it coming)
      leap: { clip: 'Jump', from: 0.15, hit: 2.15, until: 2.85, tele: 1.35, quake: { r: 2.3, ahead: 0.9 }, travel: { from: 0.6, to: 2.1, max: 8 }, range: 1.5, use: [4.2, 13], dmg: 1.8, counter: false, heavy: true, w: 2 },
    },
    special: 'ChestBeat',
    steps: [{ s: IMP + 'impactSoft_medium', vol: 0.35, rate: 0.6 }],
    voice: { land: [{ s: IMP + 'impactSoft_heavy', vol: 0.8, rate: 0.55 }, { s: SCI + 'lowFrequency_explosion', vol: 0.4, rate: 1.5 }], beat: [{ s: IMP + 'impactSoft_heavy', vol: 0.6, rate: 0.8 }] },
    // (its chest beat's thumps, clip s: the hands meeting the chest)
    beats: [1.5, 1.72, 1.94, 3.78, 4.0],
  },
  'creature-mech': {
    name: 'Mech', hp: 380, dmg: 16, speed: 3.2, turn: 3.5, poise: 3, ring: 5.0, foot: 1.0, spacing: 2.2, heavy: true,
    alias: { hips: 'pelvis', spine1: 'pelvis', spine2: 'chest', neck: 'chest', head: 'chest' },
    blows: {
      // the left foot up (1.62-2.25 s) and down (2.45 s): a red ring round where it lands
      stomp: { clip: 'Stomp', from: 1.45, hit: 2.45, until: 3.2, tele: 1.25, quake: { r: 3.0, at: 'toe_L' }, range: 2.0, use: [0, 3.2], dmg: 1.6, counter: false, heavy: true, w: 2 },
      // down into a crouch, up (1.12 s), across the gap and down on him (2.3 s): a wider ring
      leap: { clip: 'Jump', from: 0.3, hit: 2.3, until: 3.2, tele: 1.6, quake: { r: 3.4, ahead: 0 }, travel: { from: 1.1, to: 2.25, max: 7 }, range: 1.0, use: [4.5, 11], dmg: 2, counter: false, heavy: true, w: 2 },
      // the swipe (its right arm through 2.7-3.0 m: over a man on foot) only at a rider up on a horse
      swipe: { clip: 'Attack', from: 0.2, hit: 0.86, until: 1.8, tele: 0.85, limbs: ['hand_R', 'forearm_R', 'hand_L', 'forearm_L'], range: 1.5, use: [0, 2.4], dmg: 1.5, counter: false, heavy: true, mounted: true, w: 3 },
      // a shell from its arm at a man kept at range: the ring falls where he stood as it fired (quake.target), held
      // there for the whole wind-up: keep moving and it lands behind him
      volley: { clip: 'Attack', from: 0.2, hit: 0.86, until: 1.8, tele: 1.5, quake: { r: 2.4, target: true }, range: 6, use: [5, 22], dmg: 1.2, counter: false, heavy: true, w: 3, voice: 'fire' },
    },
    special: 'Stomp',
    steps: [{ s: IMP + 'impactMetal_heavy', vol: 0.5, rate: 0.5 }, { s: SCI + 'doorClose', vol: 0.18, rate: 0.55 }],
    voice: { hurt: [{ s: SCI + 'impactMetal', vol: 0.35, rate: 1 }], land: [{ s: IMP + 'impactMetal_heavy', vol: 0.9, rate: 0.45 }, { s: SCI + 'lowFrequency_explosion', vol: 0.55, rate: 1.1 }], fire: [{ s: SCI + 'laserLarge_000', vol: 0.5, rate: 0.6 }] },
  },
  'creature-trex': {
    name: 'T. rex', hp: 900, dmg: 20, speed: 3.4, turn: 2.2, poise: 3, ring: 7.4, foot: 1.3, spacing: 3.6, heavy: true,
    alias: { hips: 'pelvis', spine1: 'spine1', spine2: 'chest', neck: 'neck1', head: 'head' },
    blows: {
      // the bite: the head up and over (0-0.25 s), then down and forward, the jaw at its lowest at 0.72 s; on its own the
      // jaw bottoms out 2.4 m up (over a man), so its neck is brought down into it (dip) to meet him from its head
      bite: { clip: 'Attack', from: 0, hit: 0.72, until: 1.75, tele: 1.25, limbs: ['jaw', 'head'], range: 5.0, use: [3.6, 6.4], dmg: 2.2, counter: false, heavy: true, dip: 0.62, w: 1, win: [-0.14, 0.12] },
      // a man under it, at its legs: the hop (its Jump: down into a crouch, both feet up, down at 2.0 s): a red ring
      // round its feet
      stomp: { clip: 'Jump', from: 0.05, hit: 2.0, until: 2.9, tele: 1.45, quake: { r: 3.6, ahead: 0.7 }, range: 1.5, use: [0, 3.9], dmg: 1.4, counter: false, heavy: true, w: 1 },
      // (a boss's phase: the roar, its head up and its jaws wide (0.62 s), a blast that throws down whoever is close;
      // never one of its turns, only when its health crosses a phase)
      roar: { clip: 'Roar', from: 0, hit: 0.62, until: 3.25, tele: 1.1, quake: { r: 5.5, ahead: 1.6 }, range: 3, use: [0, 99], dmg: 0.25, counter: false, heavy: true, phase: true, voice: 'roar', voiceAt: 0.45 },
    },
    special: 'Roar',
    steps: [{ s: IMP + 'impactSoft_heavy', vol: 0.65, rate: 0.42 }, { s: SCI + 'lowFrequency_explosion', vol: 0.3, rate: 1.7 }],
    voice: {
      // the roar: low rumbles layered on its Roar clip (the packs have no animal: the size of it is in the rumble)
      roar: [{ s: SCI + 'lowFrequency_explosion', vol: 1, rate: 0.55, at: 0.35 }, { s: SCI + 'explosionCrunch', vol: 0.55, rate: 0.42, at: 0.45 }, { s: SCI + 'spaceEngineLow', vol: 0.45, rate: 0.4, at: 0.4, len: 1.9 }, { s: SCI + 'lowFrequency_explosion', vol: 0.6, rate: 0.75, at: 1.2 }],
      strike: [{ s: IMP + 'impactWood_heavy', vol: 0.8, rate: 0.55 }, { s: IMP + 'impactSoft_heavy', vol: 0.6, rate: 0.6 }],
      down: [{ s: SCI + 'lowFrequency_explosion', vol: 1, rate: 0.7 }, { s: IMP + 'impactSoft_heavy', vol: 1, rate: 0.4 }],
    },
    shake: 0.22, // (its footfalls shake the view this much, close by)
  },
  'creature-scorpion': {
    name: 'Scorpion', hp: 70, dmg: 10, speed: 4.2, turn: 5, poise: 2, ring: 3.2, foot: 1.0, spacing: 1.7, gaitless: true,
    alias: { hips: 'pelvis', spine1: 'pelvis', spine2: 'abdomen', neck: 'head', head: 'head' },
    blows: {
      // the claws opened wide (to 0.62 s) and snapped shut in front of it (1.02 s), at a man's shins
      pinch: { clip: 'Attack', from: 0.3, hit: 1.02, until: 2.0, tele: 0.85, limbs: ['chela_L', 'chela_R', 'finger_fixed_L', 'finger_move_L', 'finger_fixed_R', 'finger_move_R'], range: 1.3, use: [0, 2.0], dmg: 1, counter: true, w: 1, win: [-0.12, 0.12] },
      // a pounce: up off its legs and the tail down where he stands (a small ring), covering the gap on the way
      pounce: { clip: 'Jump', from: 0.2, hit: 1.45, until: 2.4, tele: 0.95, quake: { r: 1.5, ahead: 0.9 }, travel: { from: 0.35, to: 1.4, max: 4.5 }, range: 1.2, use: [2.0, 6.5], dmg: 1.1, counter: false, w: 2 },
    },
    special: 'ClawSnap', idle: 'ClawSnap',
    steps: [{ s: IMP + 'impactGeneric_light', vol: 0.12, rate: 1.7 }],
    voice: { strike: [{ s: IMP + 'impactWood_light', vol: 0.5, rate: 1.6 }], hurt: [{ s: IMP + 'impactPlate_light', vol: 0.2, rate: 1.8 }] },
  },
  // (wildlife: herds graze and run, wagmi/creatures/herd.js; no blows, so never a fighter)
  'creature-horse': {
    name: 'Horse', hp: 80, dmg: 0, speed: 8.8, turn: 4, poise: 2, ring: null, foot: 0.6, spacing: 1.6,
    alias: { hips: 'pelvis', spine1: 'spine1', spine2: 'chest', neck: 'neck1', head: 'head' },
    blows: {}, special: null,
    // (its neck bones, root to head, and how far each is bent down to graze, rad)
    graze: [['neck1', 0.62], ['neck2', 0.5], ['head', 0.32]],
    steps: [{ s: IMP + 'footstep_concrete', vol: 0.3, rate: 0.55 }],
    stepsGrass: [{ s: IMP + 'footstep_grass', vol: 0.32, rate: 1.05 }],
    // (a herd's own: a far whinny across the herd now and then, a snort close by; a neigh as it bolts. herd.js)
    voice: { call: [{ s: HORSE + 'herd', vol: 1.3, ref: 16 }], near: [{ s: HORSE + 'snort', vol: 0.45 }], alarm: [{ s: HORSE + 'neigh', vol: 1, ref: 12 }] },
  },
};

// (a kind's display name for the boss bar and the messages)
export const nameOf = (id) => PROFILES[id]?.name || String(id).replace(/^creature-/, '');
