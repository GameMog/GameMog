/**
 * "Me": the player's own character, the one thing that travels through every
 * world (docs/PRODUCT.md). It is a resemblance built from the licensed human
 * models in the asset library, described by a handful of settings. It is
 * never a photo, and no photo is kept.
 *
 * The runtime has its own lenient copy of these limits (lib/runtime/v1.js,
 * readMe); this file is the authority for everything the site accepts.
 */

/**
 * Whether games put your character in the lead. Paused by the owner (23 Sep)
 * until the character is right: games play their own heroes, and /me still
 * makes and previews your character. The runtime keeps full support.
 */
export const YOU_IN_GAMES = false;

export const HAIR = ['short02', 'short04', 'afro01', 'none'] as const;
export const EYES = ['brown', 'brownlight', 'blue'] as const;
export const BUILD = ['slim', 'athletic', 'strong'] as const;
export const PATTERN = ['plain', 'band', 'sash', 'stripes', 'split'] as const;

export type Me = {
  v: 1;
  /** On your bib and your results, 1 to 14 characters. */
  name: string;
  /** The two body models in the library: a is the taller, broader build. */
  body: 'a' | 'b';
  /** Your skin tone. The runtime picks the nearest skin texture and tints it to this. */
  tone: string;
  /** Face shape 1 to 3, or 0 for the one that goes with the skin texture. */
  face: 0 | 1 | 2 | 3;
  hair: (typeof HAIR)[number];
  hairColor: string;
  eyes: (typeof EYES)[number];
  build: (typeof BUILD)[number];
  kit: { top: string; trim: string; pattern: (typeof PATTERN)[number]; number: string };
};

export const TONES = ['#F1D3BE', '#E2B495', '#C98F6B', '#A86F4D', '#7E4E33', '#56341F'];
export const HAIR_COLORS = ['#1A1410', '#3B2616', '#6B4526', '#A8743F', '#D9B36C', '#8C8C8C'];
export const KITS: Me['kit'][] = [
  { top: '#15264F', trim: '#D22B3A', pattern: 'band', number: '7' },
  { top: '#C8102E', trim: '#F2F2F2', pattern: 'sash', number: '7' },
  { top: '#0B6E4F', trim: '#F4C542', pattern: 'band', number: '7' },
  { top: '#111111', trim: '#F4C542', pattern: 'stripes', number: '7' },
  { top: '#F2F2F2', trim: '#335FFF', pattern: 'split', number: '7' },
  { top: '#F28C28', trim: '#15264F', pattern: 'plain', number: '7' },
];

export const DEFAULT_ME: Me = {
  v: 1, name: 'YOU', body: 'a', tone: TONES[2], face: 0, hair: 'short04', hairColor: HAIR_COLORS[0],
  eyes: 'brown', build: 'athletic', kit: KITS[0],
};

const HEX = /^#[0-9A-Fa-f]{6}$/;
const hex = (v: unknown, d: string) => (typeof v === 'string' && HEX.test(v) ? v.toUpperCase() : d);
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

/** Anything in, a valid Me out: every field falls back to the default. */
export function sanitizeMe(input: unknown): Me {
  const m = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const k = (m.kit && typeof m.kit === 'object' ? m.kit : {}) as Record<string, unknown>;
  const name = typeof m.name === 'string' ? m.name.replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 14) : '';
  const num = typeof k.number === 'string' || typeof k.number === 'number' ? String(k.number).replace(/\D/g, '').slice(0, 3) : '';
  return {
    v: 1,
    name: name || DEFAULT_ME.name,
    body: m.body === 'b' ? 'b' : 'a',
    tone: hex(m.tone, DEFAULT_ME.tone),
    face: ([0, 1, 2, 3] as const).includes(m.face as 0) ? (m.face as Me['face']) : 0,
    hair: pick(m.hair, HAIR, DEFAULT_ME.hair),
    hairColor: hex(m.hairColor, DEFAULT_ME.hairColor),
    eyes: pick(m.eyes, EYES, DEFAULT_ME.eyes),
    build: pick(m.build, BUILD, DEFAULT_ME.build),
    kit: {
      top: hex(k.top, DEFAULT_ME.kit.top),
      trim: hex(k.trim, DEFAULT_ME.kit.trim),
      pattern: pick(k.pattern, PATTERN, DEFAULT_ME.kit.pattern),
      number: num || DEFAULT_ME.kit.number,
    },
  };
}

/**
 * The fragment a game frame's URL carries: `#me=<base64url JSON>`. A fragment
 * never reaches the server, so your name stays out of request logs, and the
 * world has you before it builds anything.
 */
export function meFragment(me: Me): string {
  const json = JSON.stringify(me);
  const b64 = typeof btoa === 'function'
    ? btoa(String.fromCharCode(...new TextEncoder().encode(json)))
    : Buffer.from(json, 'utf8').toString('base64');
  return '#me=' + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * What Claude reports from a selfie. Only what can be seen: colours, a hair
 * style, eye colour and build. It is never asked for ethnicity, gender or age
 * beyond one safety question, and it never names anyone.
 */
export const SELFIE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['usable', 'youngChild', 'tone', 'hair', 'hairColor', 'eyes', 'build', 'body'],
  properties: {
    usable: { type: 'boolean', description: 'Exactly one real person\'s face is clearly visible.' },
    youngChild: { type: 'boolean', description: 'The person is clearly a young child.' },
    tone: { type: 'string', description: 'The skin colour of the cheek in normal light, as #RRGGBB.' },
    hair: { type: 'string', enum: ['short02', 'short04', 'afro01', 'none'], description: 'short02: close-cropped. short04: short with some length on top. afro01: full natural volume. none: bald or shaved.' },
    hairColor: { type: 'string', description: 'The hair colour as #RRGGBB.' },
    eyes: { type: 'string', enum: ['brown', 'brownlight', 'blue'], description: 'Closest eye colour.' },
    build: { type: 'string', enum: ['slim', 'athletic', 'strong'], description: 'Closest overall build, from the face, neck and shoulders.' },
    body: { type: 'string', enum: ['a', 'b'], description: 'Which of two body models to start from: a is taller and broader, b is shorter and narrower. The player can change it.' },
  },
} as const;
