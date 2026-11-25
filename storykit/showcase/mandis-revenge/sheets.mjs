// Mandi's Revenge: writes the seen people's Character Forge sheets (sheets/<id>.json). Every person is invented; no
// real likeness. Mandi's and Jay's sheets name their look for the pack's gate only: their bodies are hand-built premium
// assets kept out of this repo (the README says how the pack reaches them); everyone else is forged from their sheet
// (node scripts/forge/forge.mjs <out> storykit/showcase/mandis-revenge/sheets/<id>.json). Run from the GameMog checkout:
//   node storykit/showcase/mandis-revenge/sheets.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
const HERE = 'storykit/showcase/mandis-revenge/sheets';

const FACE = {
  jaw: 'average', cheeks: 'average', cheekbones: 'average', faceWidth: 'average',
  nose: { width: 'average', length: 'average', tip: 'average', bridge: 'straight' }, browRidge: 'average',
  chin: { projection: 'average', length: 'average', width: 'average' }, eyes: 'brown', brows: { color: 'dark-brown', weight: 'average' },
  eyeShape: 'average', eyeBags: 'none', mouth: { lips: 'average', width: 'average', cupidsBow: 'average', corners: 'neutral' },
  ears: { size: 'average', angle: 'flat' }, skull: { shape: 'oval' }, forehead: 'average', faceLength: 'average',
};
const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? merge(a[k], v) : v; return o; };
const person = (p) => ({
  id: p.id, name: p.name, role: p.role, logline: p.logline,
  identity: { age: p.age, body: p.body, presentation: p.body === 'female' ? 'woman' : 'man', heightCm: p.height, build: p.build },
  heritage: { note: 'invented person; no real likeness', blend: p.blend, skin: p.skin },
  face: merge(FACE, p.face), hair: p.hair, facialHair: { style: p.beard || 'none' }, wardrobe: p.wardrobe,
  ...(p.props ? { props: p.props } : {}),
  posture: p.posture, personality: p.personality, voice: { id: `${p.id}-v1`, ...p.voice },
});

export const SHEETS = [
  person({ id: 'mandi', name: 'Mandi Reyes', role: "hero: an aspiring model, still in her audition bikini", logline: 'Rescued her ex for years and swore she would quit. One more night.',
    age: 27, body: 'female', height: 170, build: { frame: 'medium', weight: 'slim', muscle: 'athletic' }, blend: { african: 0.15, asian: 0.0, european: 0.85 },
    skin: { tone: 'light-medium', undertone: 'warm', makeup: 'natural', lipTint: 'rose' }, face: { cheekbones: 'high', eyes: 'hazel', eyeShape: 'almond', mouth: { lips: 'full' } },
    hair: { style: 'long', color: 'brown' }, wardrobe: { top: { item: 'tee', color: '#C9A227' }, bottom: { item: 'skirt', color: '#B07A3A' }, shoes: { item: 'sneakers', color: '#F2B6C6' } },
    posture: { stance: 'proud', pace: 'quick', gestures: 'tucks her hair back, points with her keys', idle: 'idle', walk: 'ual' }, // (Quaternius's walk: the owner, Nov 25; Mog City's wagmi/retarget.js WALK_STYLES)
    personality: { traits: ['quick', 'loyal', 'wry', 'unflappable'], speech: 'quick and wry, dead calm when she means it' },
    voice: { description: 'warm bright mezzo, quick and wry', pitch: 'mid', rate: 'quick' } }),
  person({ id: 'jay', name: 'Jay', role: "Mandi's ex, who bets on everything", logline: 'Charming, lucky in nothing, forty thousand down on a rubber duck.',
    age: 30, body: 'male', height: 180, build: { frame: 'medium', weight: 'average', muscle: 'average' }, blend: { african: 0.3, asian: 0.0, european: 0.7 },
    skin: { tone: 'tan', undertone: 'warm', makeup: 'none', lipTint: 'natural' }, face: { jaw: 'square', mouth: { corners: 'up' } },
    hair: { style: 'short-curly', color: 'dark-brown' }, beard: 'stubble',
    wardrobe: { top: { item: 'tee', color: '#E8E4DA' }, bottom: { item: 'jeans', color: '#2F3A4C', pattern: 'denim' }, shoes: { item: 'white-sneakers', color: '#F4F4F0' } },
    posture: { stance: 'relaxed', pace: 'restless', gestures: 'rubs the back of his neck, grins when caught', idle: 'shift', walk: 'walk' },
    personality: { traits: ['charming', 'guilty', 'hopeful', 'reckless'], speech: 'fast when he is guilty, which is always' },
    voice: { description: 'easy sheepish tenor, fast when guilty', pitch: 'mid', rate: 'quick' } }),
  person({ id: 'diego', name: 'Diego Vale', role: "boss of the river's Duck Derby, on his riverboat", logline: 'Dapper, theatrical, wants a leather brand of his own and a face to sell it.',
    age: 55, body: 'male', height: 178, build: { frame: 'medium', weight: 'stocky', muscle: 'average' }, blend: { african: 0.0, asian: 0.0, european: 1.0 },
    skin: { tone: 'light-medium', undertone: 'olive', makeup: 'none', lipTint: 'natural' }, face: { cheeks: 'full', eyeBags: 'light', mouth: { corners: 'up' } },
    hair: { style: 'slicked', color: 'salt-and-pepper' }, beard: 'moustache',
    wardrobe: { top: { item: 'suit-jacket-db', color: '#F1ECE0', accent: '#8A1C2B' }, bottom: { item: 'suit-trousers', color: '#F1ECE0' }, shoes: { item: 'dress', color: '#6B4226' } },
    posture: { stance: 'proud', pace: 'slow', gestures: 'opens a hand like a showman, savours a pause', idle: 'arms', walk: 'walkCool' },
    personality: { traits: ['courteous', 'amused', 'theatrical', 'vain'], speech: 'savours every word, never shouts' },
    voice: { description: 'smooth rich baritone, amused', pitch: 'low', rate: 'slow' } }),
  person({ id: 'kiki', name: 'Kiki Moss', role: "Mandi's best friend, a nail tech who livestreams everything", logline: 'Runs half of the city group chats from her salon chair.',
    age: 26, body: 'female', height: 160, build: { frame: 'small', weight: 'average', muscle: 'average' }, blend: { african: 0.9, asian: 0.0, european: 0.1 },
    skin: { tone: 'brown', undertone: 'warm', makeup: 'lipstick', lipTint: 'berry' }, face: { cheeks: 'full', eyes: 'dark-brown', mouth: { lips: 'full', corners: 'up' } },
    hair: { style: 'box-braids', color: 'black' }, wardrobe: { top: { item: 'hoodie', color: '#C8A2E8' }, bottom: { item: 'track-pants', color: '#2B2B33' }, shoes: { item: 'white-sneakers', color: '#F4F4F0' } },
    props: [{ kind: 'phone' }],
    posture: { stance: 'relaxed', pace: 'quick', gestures: 'films everything, waves her nails', idle: 'phone', walk: 'walk' },
    personality: { traits: ['loud', 'loyal', 'nosy', 'funny'], speech: 'fast, cuts in with "girl" and "hold on"' },
    voice: { description: 'fast bright alto', pitch: 'mid', rate: 'quick' } }),
  person({ id: 'bernie', name: 'Bernie Szabo', role: "Mandi's small-time agent, always double-parked", logline: 'Takes every call from his car; his signal always cuts out at the worst moment.',
    age: 64, body: 'male', height: 168, build: { frame: 'medium', weight: 'heavy', muscle: 'soft' }, blend: { african: 0.0, asian: 0.0, european: 1.0 },
    skin: { tone: 'light', undertone: 'neutral', makeup: 'none', lipTint: 'natural' }, face: { cheeks: 'jowly', eyeBags: 'heavy', nose: { width: 'wide' } },
    hair: { style: 'balding', color: 'grey' }, beard: 'none',
    wardrobe: { top: { item: 'suit-jacket', color: '#6E6A5E' }, bottom: { item: 'suit-trousers', color: '#6E6A5E' }, shoes: { item: 'dress', color: '#3B2A1E' } },
    props: [{ kind: 'glasses' }],
    posture: { stance: 'slouched', pace: 'restless', gestures: 'mops his brow, waves the phone', idle: 'phone', walk: 'walkHeavy' },
    personality: { traits: ['frantic', 'big-hearted', 'optimistic'], speech: 'gravelly and frantic, with a wheeze' },
    voice: { description: 'gravelly frantic older man', pitch: 'mid-low', rate: 'quick' } }),
  person({ id: 'gloria', name: 'Gloria Steele', role: "Diego's accountant, quietly done with him", logline: 'Keeps the Derby ledger; every sentence a column of numbers.',
    age: 46, body: 'female', height: 168, build: { frame: 'medium', weight: 'slim', muscle: 'average' }, blend: { african: 0.0, asian: 0.6, european: 0.4 },
    skin: { tone: 'light-medium', undertone: 'neutral', makeup: 'natural', lipTint: 'red' }, face: { eyeShape: 'almond', cheekbones: 'high' },
    hair: { style: 'bob', color: 'black' }, wardrobe: { top: { item: 'suit-jacket', color: '#1F2B3A' }, bottom: { item: 'trousers', color: '#1F2B3A' }, shoes: { item: 'dress', color: '#111111' } },
    props: [{ kind: 'glasses' }],
    posture: { stance: 'upright', pace: 'steady', gestures: 'taps a pen against the ledger', idle: 'arms', walk: 'walk' },
    personality: { traits: ['precise', 'dry', 'tired', 'brave'], speech: 'crisp and low' },
    voice: { description: 'crisp low alto, precise', pitch: 'mid-low', rate: 'steady' } }),
  person({ id: 'brick', name: 'Brick', role: "Diego's huge, gentle enforcer, who knits", logline: 'Apologises before every shove; knits between jobs.',
    age: 38, body: 'male', height: 196, build: { frame: 'broad', weight: 'heavy', muscle: 'strong' }, blend: { african: 0.7, asian: 0.0, european: 0.3 },
    skin: { tone: 'dark-brown', undertone: 'warm', makeup: 'none', lipTint: 'natural' }, face: { jaw: 'heavy', browRidge: 'strong', mouth: { corners: 'up' } },
    hair: { style: 'shaved', color: 'black' }, beard: 'short-boxed',
    wardrobe: { top: { item: 'suit-jacket', color: '#14161A' }, bottom: { item: 'suit-trousers', color: '#14161A' }, shoes: { item: 'dress', color: '#0E0E0E' }, over: [{ item: 'scarf', color: '#D98BA8', accent: '#F3E1EA' }] },
    posture: { stance: 'guarded', pace: 'slow', gestures: 'holds his hands up to say sorry first', idle: 'arms', walk: 'walkHeavy' },
    personality: { traits: ['polite', 'gentle', 'huge', 'loyal'], speech: 'soft slow bass, polite to a fault' },
    voice: { description: 'soft slow bass, polite', pitch: 'low', rate: 'slow' } }),
  person({ id: 'simone', name: 'Simone Vance', role: 'casting director, impossible to impress', logline: 'Bored, chic, and right about everything until the very end.',
    age: 44, body: 'female', height: 174, build: { frame: 'small', weight: 'thin', muscle: 'average' }, blend: { african: 0.0, asian: 0.0, european: 1.0 },
    skin: { tone: 'very-light', undertone: 'cool', makeup: 'lipstick', lipTint: 'red' }, face: { cheekbones: 'high', eyes: 'grey-blue', mouth: { lips: 'thin', corners: 'down' } },
    hair: { style: 'bob-tucked', color: 'platinum' }, wardrobe: { top: { item: 'long-sleeve', color: '#111111' }, bottom: { item: 'trousers', color: '#111111' }, shoes: { item: 'dress', color: '#111111' } },
    props: [{ kind: 'round-glasses' }],
    posture: { stance: 'upright', pace: 'slow', gestures: 'a half-sigh, one finger raised', idle: 'arms', walk: 'walkCool' },
    personality: { traits: ['bored', 'chic', 'clipped', 'secretly kind'], speech: 'cool and clipped, a half-sigh in every note' },
    voice: { description: 'cool clipped alto with a sigh', pitch: 'mid-low', rate: 'slow' } }),
  person({ id: 'deckhand-red', name: 'Deckhand Red', role: "one of Diego's deckhands, who brawls and says nothing", logline: 'Red cap, red knuckles, no lines.',
    age: 33, body: 'male', height: 185, build: { frame: 'broad', weight: 'average', muscle: 'strong' }, blend: { african: 0.0, asian: 0.0, european: 1.0 },
    skin: { tone: 'light', undertone: 'warm', makeup: 'none', lipTint: 'natural' }, face: { jaw: 'square' },
    hair: { style: 'buzz', color: 'auburn' }, beard: 'full-trimmed',
    wardrobe: { top: { item: 'long-sleeve', color: '#F2F0EA', accent: '#1E2A44', pattern: 'stripe' }, bottom: { item: 'loose-trousers', color: '#1E2A44' }, shoes: { item: 'work-boots', color: '#3A2A1C' }, headwear: { item: 'knit-beanie', color: '#B3261E' } },
    posture: { stance: 'guarded', pace: 'steady', gestures: 'cracks his knuckles', idle: 'arms', walk: 'walkHeavy' },
    personality: { traits: ['silent', 'tough'], speech: 'says nothing' }, voice: { description: 'grunts only', pitch: 'low', rate: 'steady' } }),
  person({ id: 'deckhand-blue', name: 'Deckhand Blue', role: "one of Diego's deckhands, who brawls and says nothing", logline: 'Blue cap, a whistle, no lines.',
    age: 29, body: 'male', height: 178, build: { frame: 'medium', weight: 'stocky', muscle: 'athletic' }, blend: { african: 0.5, asian: 0.0, european: 0.5 },
    skin: { tone: 'tan', undertone: 'warm', makeup: 'none', lipTint: 'natural' }, face: { cheeks: 'full' },
    hair: { style: 'buzz', color: 'black' }, beard: 'goatee',
    wardrobe: { top: { item: 'long-sleeve', color: '#F2F0EA', accent: '#1E2A44', pattern: 'stripe' }, bottom: { item: 'loose-trousers', color: '#1E2A44' }, shoes: { item: 'work-boots', color: '#3A2A1C' }, headwear: { item: 'knit-beanie', color: '#2456A6' } },
    posture: { stance: 'guarded', pace: 'steady', gestures: 'rolls his shoulders', idle: 'arms', walk: 'walkHeavy' },
    personality: { traits: ['silent', 'tough'], speech: 'says nothing' }, voice: { description: 'grunts only', pitch: 'mid-low', rate: 'steady' } }),
];

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(HERE, { recursive: true });
  for (const s of SHEETS) writeFileSync(`${HERE}/${s.id}.json`, JSON.stringify(s, null, 1) + '\n');
  console.log(`wrote ${SHEETS.length} sheets to ${HERE}`);
}
