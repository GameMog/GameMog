import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { DIFFICULTIES, WorldSpecSchema, type WorldSpec } from './worldspec';
import { buildTrack, buildLanes, assignLanes } from './track';
import { mix, darken, lighten, shiftHue } from './color';
import { playtest, type PlaytestReport } from './playtest';
import { protectCharacter, type Character, type CharacterImage } from './character';

export const MODEL = 'claude-opus-5';

/**
 * The model's output surface — deliberately narrower than a WorldSpec.
 *
 * It picks the things a person would describe out loud (a mood, a palette, who
 * is racing, what the place is called) and four legible track knobs. Everything
 * mechanical — spline points, lane offsets, timing windows, physics — is
 * derived from those. Narrowing the surface is what makes generation reliable:
 * there are simply fewer ways for it to come back wrong.
 *
 * Colours are plain strings here rather than regex-constrained, because a
 * rejected generation is worse than one that needs a "#" prepended. They get
 * normalised, then validated strictly, then playtested.
 */
const BriefSchema = z.object({
  title: z.string().describe('2-4 words. The name of the world, not the genre.'),
  tagline: z.string().describe('One short line under the title, under 12 words.'),
  blurb: z.string().describe('Two sentences of flavour for the game page.'),
  difficulty: z.enum(DIFFICULTIES).describe('gentle for a relaxed world, brutal for a hostile one'),

  trackSize: z.number().describe('0.55 tight and quick, 1.3 long and sweeping'),
  trackCorners: z.number().describe('7-16 control points; more means more direction changes'),
  trackTwist: z.number().describe('0 almost circular, 1 strong straights and hairpins'),
  trackHills: z.number().describe('0 flat, 1 rolling'),
  seed: z.number().describe('any integer'),

  characterName: z.string().describe('The player. If an image is attached, name THAT character.'),
  characterFur: z.string().describe("#RRGGBB read off the character's body, ignoring its backdrop."),
  characterNote: z.string().describe('One short line on who they are. Steers the result copy.'),

  rivalNames: z.array(z.string()).describe('3 or 4 rival names that fit this world. Keep each under 14 characters — they are shown on a narrow leaderboard and longer names are cut off.'),
  rivalColours: z.array(z.string()).describe('One #RRGGBB per rival, same order. Each must read clearly against the ground.'),

  sun: z.string().describe('#RRGGBB key light — the colour of the light source here'),
  skyTop: z.string().describe('#RRGGBB sky overhead'),
  skyHorizon: z.string().describe('#RRGGBB sky at the horizon'),
  fog: z.string().describe('#RRGGBB distance haze, usually near skyHorizon'),
  fogDensity: z.number().describe('0.0015 clear, 0.005 thick. Over 0.006 hides the next corner.'),
  ground: z.string().describe('#RRGGBB the dominant ground'),
  path: z.string().describe('#RRGGBB the running surface, distinct from ground'),

  moodAccents: z
    .array(z.string())
    .describe('Exactly 3 #RRGGBB, one per lap: calm, tense, urgent. The world heats up along this ramp.'),

  sceneryColours: z.array(z.string()).describe('3 or 4 #RRGGBB for the large scenery forms.'),
  sceneryCount: z.number().describe('0-200 large scenery pieces'),
  groundCoverColour: z.string().describe('#RRGGBB small tufts underfoot'),
  groundCoverCount: z.number().describe('0-3000'),
  lightColour: z.string().describe('#RRGGBB glow of the trackside lights — keep it bright'),
  lightSpacing: z.number().describe('14-50 metres between trackside lights'),
  skyIsletCount: z.number().describe('0-12 floating islands'),
  moteCount: z.number().describe('0-2600 drifting motes'),
  moteHue: z.number().describe('0-1'),

  placeTitles: z.array(z.string()).describe('Exactly 6 headlines, 1st to 6th, in this world\'s voice.'),
  placeLines: z.array(z.string()).describe('Exactly 6 one-sentence lines, 1st to 6th.'),
});

type Brief = z.infer<typeof BriefSchema>;

/* ----------------------------------------------------------- normalising -- */
const FALLBACK = '#CCCCCC';
function hex(v: unknown, fallback = FALLBACK): string {
  if (typeof v !== 'string') return fallback;
  let s = v.trim().replace(/^0x/i, '');
  if (!s.startsWith('#')) s = '#' + s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = '#' + s.slice(1).split('').map((c) => c + c).join('');
  }
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : fallback;
}
const clamp = (n: unknown, lo: number, hi: number, dflt: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;

function pad<T>(arr: T[] | undefined, len: number, fill: (i: number) => T): T[] {
  const a = Array.isArray(arr) ? arr.slice(0, len) : [];
  while (a.length < len) a.push(fill(a.length));
  return a;
}

/**
 * Brief -> WorldSpec. Everything the model could get wrong is clamped here
 * rather than rejected, so a slightly sloppy generation still ships a playable
 * world. Only things that cannot be repaired reach the playtest as errors.
 */
export function expandBrief(b: Brief, locked?: Character): WorldSpec {
  const roadHalf = 5.9;
  const rivalNames = Array.isArray(b.rivalNames) ? b.rivalNames.slice(0, 5) : [];
  const rivalColours = Array.isArray(b.rivalColours) ? b.rivalColours : [];
  const racerCount = Math.max(2, Math.min(6, rivalNames.length + 1));
  const lanes = buildLanes(racerCount, roadHalf);
  const laneOrder = assignLanes(racerCount);

  const track = buildTrack(
    {
      size: clamp(b.trackSize, 0.55, 1.3, 0.9),
      corners: clamp(b.trackCorners, 7, 16, 11),
      twistiness: clamp(b.trackTwist, 0, 1, 0.55),
      elevation: clamp(b.trackHills, 0, 1, 0.4),
      seed: Math.floor(clamp(b.seed, 1, 1e9, 7)),
    },
    roadHalf
  );

  const sun = hex(b.sun, '#FFF0D2');
  const skyTop = hex(b.skyTop, '#A4BFE5');
  const skyHorizon = hex(b.skyHorizon, '#F9E6CE');
  const fog = hex(b.fog, '#E7D4B9');
  const ground = hex(b.ground, '#8CAE77');
  const path = hex(b.path, '#CEB891');

  // Three accents carry the escalation; the rest of each rung is derived so the
  // ramp stays coherent instead of being three unrelated palettes.
  const accents = pad(b.moodAccents, 3, (i) => ['#7FB268', '#C9A25E', '#D0684A'][i]).map((c, i) =>
    hex(c, ['#7FB268', '#C9A25E', '#D0684A'][i])
  );
  const tints = ['rgba(60,44,28,.30)', 'rgba(96,56,24,.36)', 'rgba(120,48,18,.44)'];
  const moodRamp = accents.map((accent, i) => ({
    accent,
    fog: mix(fog, accent, i * 0.22),
    light: mix(sun, accent, i * 0.16),
    sky: mix('#FFFFFF', accent, i * 0.10),
    tint: tints[i],
  })) as WorldSpec['palette']['moodRamp'];

  const scenery = pad(
    b.sceneryColours,
    Math.max(1, Math.min(5, b.sceneryColours?.length ?? 3)),
    (i) => ['#E9A08E', '#C9DCA6', '#C5B6E4'][i % 3]
  ).map((c) => hex(c, '#E9A08E'));
  const cover = hex(b.groundCoverColour, '#A9C78E');
  const lightCol = hex(b.lightColour, '#FFE9B8');

  return {
    schemaVersion: 1,
    format: 'race',
    difficulty: DIFFICULTIES.includes(b.difficulty as never) ? b.difficulty : 'standard',
    meta: {
      title: (b.title || 'Untitled Run').slice(0, 40),
      tagline: (b.tagline || 'A race through somewhere new.').slice(0, 140),
      blurb: (b.blurb || 'A rhythm footrace. Tap in time to stride.').slice(0, 400),
    },
    track: { ...track, roadHalf, lanes },
    racers: [
      {
        name: (locked?.name || b.characterName || 'You').slice(0, 14),
        fur: hex(locked?.fur ?? b.characterFur, '#F0DEBD'),
        you: true,
        lane: laneOrder[0],
      },
      ...rivalNames.slice(0, racerCount - 1).map((n, i) => ({
        name: (n || `Rival ${i + 1}`).slice(0, 14),
        fur: hex(rivalColours[i], ['#B6DEC4', '#F2C2CB', '#C0C8EE', '#F3DC9B', '#CFC0E4'][i % 5]),
        you: false,
        lane: laneOrder[i + 1],
      })),
    ],
    palette: {
      light: sun,
      skyLow: skyHorizon,
      skyMid: mix(skyHorizon, skyTop, 0.45),
      skyHigh: skyTop,
      skyAmbient: lighten(skyTop, 0.12),
      groundAmbient: darken(ground, 0.28),
      fog,
      fogDensity: clamp(b.fogDensity, 0.0012, 0.0055, 0.0027),
      sunDir: [0.44, 0.4, 0.44],
      terrain: {
        moss: ground,
        pale: lighten(ground, 0.22),
        sand: path,
        accent: shiftHue(ground, 28),
      },
      moodRamp,
    },
    props: {
      caps: {
        count: Math.round(clamp(b.sceneryCount, 0, 200, 120)),
        // one colour in, a consistent cap/underside/stem trio out
        palettes: scenery.map((c) => [c, darken(c, 0.16), lighten(c, 0.4)]) as WorldSpec['props']['caps']['palettes'],
      },
      tufts: {
        count: Math.round(clamp(b.groundCoverCount, 0, 3000, 2200)),
        palettes: [
          [cover, darken(cover, 0.2)],
          [lighten(cover, 0.16), cover],
        ] as WorldSpec['props']['tufts']['palettes'],
      },
      lanterns: {
        spacing: clamp(b.lightSpacing, 14, 50, 22),
        post: darken(lightCol, 0.55),
        bulb: lightCol,
        glow: mix(lightCol, '#FFFFFF', 0.12),
      },
      gate: {
        post: lighten(path, 0.2),
        banner: scenery[0],
        pennants: [scenery[0], scenery[1] ?? lighten(scenery[0], 0.3), scenery[2] ?? shiftHue(scenery[0], 40), lighten(path, 0.4)],
      },
      islets: { count: Math.round(clamp(b.skyIsletCount, 0, 12, 6)), caps: scenery.slice(0, 3) },
      spores: {
        count: Math.round(clamp(b.moteCount, 0, 2600, 1400)),
        hue: clamp(b.moteHue, 0, 1, 0.1),
        hueSpread: 0.1,
        sat: 0.55,
      },
    },
    copy: {
      placeTitles: pad(b.placeTitles, 6, (i) => ['YOU TOOK IT', 'SO CLOSE', 'ON THE PODIUM', 'GOOD RUN', 'KEEP GOING', 'NEXT TIME'][i]).map((s2) => String(s2).slice(0, 40)),
      placeLines: pad(b.placeLines, 6, () => 'The race is over. Run it back.').map((s2) => String(s2).slice(0, 180)),
    },
  };
}

/* ------------------------------------------------------------- generate -- */
const SYSTEM = `You design worlds for a rhythm footrace game.

The racers are small, round, fuzzy creatures with a hooded face — soft and
characterful, never grim. Whatever setting you are given, render it in that
register: a haunted world is spooky-cosy, a volcanic world is warm and glowing,
an undersea world is dim and luminous. Cute is the house style; keep it.

You choose a mood, a palette, a cast, and the shape of the loop. You do not
choose how the game plays — timing, physics and controls are fixed.

If an image is attached it is the player's character. Read its actual dominant
body colour — not the backdrop it was photographed or exported against — and put
that in character.fur. Name it and describe it from what you can see. Then build
a world that flatters it: the ground must not be the same tone as the character,
and no rival may be close enough to be mistaken for them.

Rules that matter:
- racers lists RIVALS only. The player comes from character.
- Every colour must read clearly against terrainMoss. No racer should be within
  a hair of the ground colour or it vanishes mid-race.
- The moodRamp must visibly escalate across the three laps: lap 1 calm, lap 2
  tense, lap 3 urgent. Push the fog and light warmer or colder, not just darker.
- fogDensity above 0.005 hides the next corner. Stay under it unless the world
  is explicitly meant to be blind.
- placeTitles and placeLines are exactly six entries, best result first, in the
  voice of this specific world. Do not write generic praise.
- Colours are #RRGGBB.`;

export type GenerateResult = {
  ok: boolean;
  spec?: WorldSpec;
  report?: PlaytestReport;
  character?: Character;
  /** What had to move to keep the character visible. Shown, not hidden. */
  adjustments?: string[];
  attempts: number;
  ms: number;
  error?: string;
};

const normaliseHex = (v: unknown, fallback: string) => hex(v, fallback);

/** Prompt, optional character image, optional repair note. */
function userContent(prompt: string, image: CharacterImage | undefined, hintFur: string | undefined, note: string) {
  const parts: Anthropic.ContentBlockParam[] = [];
  if (image) {
    parts.push({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } });
    parts.push({
      type: 'text',
      text:
        'This is the player character. Read its dominant BODY colour, ignoring any white or transparent backdrop' +
        (hintFur ? ` (a sample of the image suggests roughly ${hintFur}, but trust your own reading)` : '') +
        '. Give it a name and a one-line personality, then build the world below around it.',
    });
  }
  parts.push({ type: 'text', text: note ? `${prompt}\n\n${note}` : prompt });
  return parts;
}

export type GenerateInput = {
  prompt: string;
  image?: CharacterImage;
  /** A colour read off the upload in the browser, offered as a hint. */
  hintFur?: string;
};

export async function generateWorld(input: GenerateInput | string): Promise<GenerateResult> {
  const { prompt, image, hintFur } = typeof input === 'string' ? { prompt: input, image: undefined, hintFur: undefined } : input;
  const started = Date.now();
  const client = new Anthropic();
  let attempts = 0;
  let lastReport: PlaytestReport | undefined;
  let note = '';

  // One repair pass: if the playtest rejects a world, the findings go back as
  // instructions. Beyond two attempts it is cheaper to fail loudly than to keep
  // paying for a model that is misreading the brief.
  while (attempts < 2) {
    attempts++;
    let res;
    try {
      res = await client.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        messages: [{ role: 'user', content: userContent(prompt, image, hintFur, note) }],
        output_config: { format: zodOutputFormat(BriefSchema) },
      });
    } catch (e) {
      return { ok: false, attempts, ms: Date.now() - started, error: (e as Error).message };
    }

    if (res.stop_reason === 'refusal') {
      return {
        ok: false, attempts, ms: Date.now() - started,
        error: 'The model declined this prompt. Try describing the setting differently.',
      };
    }
    const brief = res.parsed_output;
    if (!brief) {
      note = 'Your previous reply did not parse. Return the structured world only.';
      continue;
    }

    const b = brief as Brief;
    let spec = expandBrief(b);
    let moved: string[] = [];

    // The character outranks the world. If the generated palette would hide
    // them, the palette is what gives way.
    const character: Character = {
      name: (b.characterName || 'You').slice(0, 12),
      fur: normaliseHex(b.characterFur, hintFur ?? '#F0DEBD'),
      personality: b.characterNote?.slice(0, 200),
      source: image ? 'upload' : 'model',
    };
    ({ spec, moved } = protectCharacter(spec, character));

    const report = playtest(spec);
    lastReport = report;
    if (report.ok) return { ok: true, spec, report, character, adjustments: moved, attempts, ms: Date.now() - started };

    note =
      'Your previous world failed automatic playtesting. Fix exactly these and return the whole world again:\n' +
      report.findings.filter((f) => f.level === 'error').map((f) => `- ${f.message}`).join('\n');
  }

  return {
    ok: false, attempts, ms: Date.now() - started, report: lastReport,
    error: 'Could not produce a playable world after two attempts.',
  };
}

/** Deterministic stand-in so the whole product works without an API key. */
export function offlineWorld(prompt: string, locked?: Character): { spec: WorldSpec; character: Character; adjustments: string[] } {
  const seed = [...prompt].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const hue = ((Math.sin(seed) * 43758.5453) % 1 + 1) % 1;
  const wheel = (h: number, s: number, l: number) => {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h * 12) % 12;
      const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * v).toString(16).padStart(2, '0');
    };
    return ('#' + f(0) + f(8) + f(4)).toUpperCase();
  };

  const character: Character = locked ?? { name: 'You', fur: wheel(hue, 0.4, 0.8), source: 'default' };
  const ground = wheel((hue + 0.32) % 1, 0.3, 0.52);

  const brief: Brief = {
    title: prompt.split(/\s+/).slice(0, 3).join(' ') || 'Offline Run',
    tagline: 'Generated without a model — set ANTHROPIC_API_KEY for the real thing.',
    blurb: `A placeholder world derived from "${prompt.slice(0, 80)}". It is playable, but nothing here was designed.`,
    difficulty: 'standard',

    trackSize: 0.9, trackCorners: 11, trackTwist: 0.55, trackHills: 0.4, seed,

    characterName: character.name,
    characterFur: character.fur,
    characterNote: character.personality ?? '',

    rivalNames: [1, 2, 3, 4].map((i) => `Rival ${i}`),
    rivalColours: [0, 1, 2, 3].map((i) => wheel((hue + 0.2 + i * 0.17) % 1, 0.45, 0.72)),

    sun: wheel(hue, 0.35, 0.9),
    skyTop: wheel((hue + 0.55) % 1, 0.4, 0.72),
    skyHorizon: wheel(hue, 0.3, 0.86),
    fog: wheel(hue, 0.28, 0.82),
    fogDensity: 0.0027,
    ground,
    path: wheel(hue, 0.25, 0.72),

    moodAccents: [0, 1, 2].map((i) => wheel((hue + 0.1 + i * 0.08) % 1, 0.5, 0.55 - i * 0.05)),

    sceneryColours: [0, 1, 2].map((i) => wheel((hue + i * 0.2) % 1, 0.4, 0.7)),
    sceneryCount: 120,
    groundCoverColour: wheel((hue + 0.32) % 1, 0.32, 0.66),
    groundCoverCount: 2200,
    lightColour: wheel(hue, 0.35, 0.9),
    lightSpacing: 22,
    skyIsletCount: 6,
    moteCount: 1400,
    moteHue: hue,

    placeTitles: ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH'],
    placeLines: [
      'You took it.', 'Beaten by a stride.', 'On the podium.',
      'A clean run, just short.', 'The band got away from you.', 'Run it back.',
    ],
  };

  const { spec, moved } = protectCharacter(expandBrief(brief, character), character);
  return { spec, character, adjustments: moved };
}

export { WorldSpecSchema, BriefSchema };
