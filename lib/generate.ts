import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { DIFFICULTIES, WorldSpecSchema, type WorldSpec } from './worldspec';
import { buildTrack, buildLanes, assignLanes } from './track';
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
  tagline: z.string().describe('One short line under the title. Under 12 words.'),
  blurb: z.string().describe('Two sentences of flavour for the game page.'),
  difficulty: z.enum(DIFFICULTIES).describe('gentle for a relaxed world, brutal for a hostile one'),

  track: z.object({
    size: z.number().describe('0.55 = tight and quick, 1.3 = long and sweeping'),
    corners: z.number().describe('7-16 control points; more means more direction changes'),
    twistiness: z.number().describe('0 = almost circular, 1 = strong straights and hairpins'),
    elevation: z.number().describe('0 = flat, 1 = rolling hills'),
    seed: z.number().describe('any integer'),
  }),

  character: z
    .object({
      name: z.string().describe('A name for the uploaded character, or one that fits the world if no image was given.'),
      fur: z.string().describe("#RRGGBB read off the character's own body — its dominant colour, not its background."),
      personality: z.string().describe('One short line on who they are. Steers the tone of the result copy.'),
    })
    .describe('The player. If an image is attached, this describes THAT character, not an invented one.'),

  racers: z
    .array(
      z.object({
        name: z.string().describe('1-10 characters, fits the world'),
        fur: z.string().describe('#RRGGBB. Must read clearly against the ground colour.'),
      })
    )
    .describe('3 to 5 RIVALS, not counting the player. Each distinct from the player and from each other.'),

  palette: z.object({
    light: z.string().describe('#RRGGBB key light — the colour of the sun here'),
    skyLow: z.string().describe('#RRGGBB sky at the horizon'),
    skyMid: z.string().describe('#RRGGBB sky midway up'),
    skyHigh: z.string().describe('#RRGGBB sky overhead'),
    skyAmbient: z.string().describe('#RRGGBB bounce light from above'),
    groundAmbient: z.string().describe('#RRGGBB bounce light from below'),
    fog: z.string().describe('#RRGGBB distance haze — usually close to skyLow'),
    fogDensity: z.number().describe('0.0015 clear, 0.005 thick. Above 0.006 hides the next corner.'),
    terrainMoss: z.string().describe('#RRGGBB dominant ground'),
    terrainPale: z.string().describe('#RRGGBB lighter ground patches'),
    terrainSand: z.string().describe('#RRGGBB ground beside the track'),
    terrainAccent: z.string().describe('#RRGGBB rarer ground tint'),
    moodRamp: z
      .array(
        z.object({
          accent: z.string().describe('#RRGGBB UI accent for this lap'),
          fog: z.string().describe('#RRGGBB fog for this lap'),
          light: z.string().describe('#RRGGBB key light for this lap'),
          sky: z.string().describe('#RRGGBB sky tint multiplier, near white'),
        })
      )
      .describe('Exactly 3, one per lap: calm, then tense, then urgent. The world should visibly heat up.'),
  }),

  props: z.object({
    capCount: z.number().describe('0-220 large scenery pieces (giant mushroom-like forms)'),
    capPalettes: z
      .array(z.object({ top: z.string(), under: z.string(), stem: z.string() }))
      .describe('3-5 colour trios for the large scenery'),
    tuftCount: z.number().describe('0-3200 small ground tufts'),
    tuftPalettes: z.array(z.object({ top: z.string(), base: z.string() })).describe('2-3 pairs'),
    lanternSpacing: z.number().describe('14-50 metres between trackside lights'),
    lanternPost: z.string(),
    lanternBulb: z.string().describe('#RRGGBB glowing — keep it bright'),
    lanternGlow: z.string(),
    gatePost: z.string(),
    gateBanner: z.string(),
    gatePennants: z.array(z.string()).describe('4 flag colours'),
    isletCount: z.number().describe('0-12 floating islands in the sky'),
    isletCaps: z.array(z.string()).describe('3 colours'),
    sporeCount: z.number().describe('0-2600 drifting motes'),
    sporeHue: z.number().describe('0-1 base hue of the motes'),
    sporeHueSpread: z.number().describe('0-0.3'),
    sporeSat: z.number().describe('0-1'),
  }),

  placeTitles: z.array(z.string()).describe('Exactly 6 headlines, 1st place to 6th. Voice of this world.'),
  placeLines: z.array(z.string()).describe('Exactly 6 lines, 1st to 6th. One sentence each.'),
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
  // the player is always index 0; the brief lists rivals only
  const rivals = Array.isArray(b.racers) ? b.racers.slice(0, 5) : [];
  const racerCount = Math.max(2, Math.min(6, rivals.length + 1));
  const lanes = buildLanes(racerCount, roadHalf);
  const laneOrder = assignLanes(racerCount);

  const track = buildTrack(
    {
      size: clamp(b.track?.size, 0.55, 1.3, 0.9),
      corners: clamp(b.track?.corners, 7, 16, 11),
      twistiness: clamp(b.track?.twistiness, 0, 1, 0.55),
      elevation: clamp(b.track?.elevation, 0, 1, 0.4),
      seed: Math.floor(clamp(b.track?.seed, 1, 1e9, 7)),
    },
    roadHalf
  );

  const ramp = pad(b.palette?.moodRamp, 3, () => ({
    accent: '#C9A25E', fog: '#E7D4B9', light: '#FFF0D2', sky: '#FFFFFF',
  }));
  const tints = ['rgba(60,44,28,.30)', 'rgba(96,56,24,.36)', 'rgba(120,48,18,.44)'];

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
        name: (locked?.name || b.character?.name || 'You').slice(0, 12),
        fur: hex(locked?.fur ?? b.character?.fur, '#F0DEBD'),
        you: true,
        lane: laneOrder[0],
      },
      ...rivals.slice(0, racerCount - 1).map((r, i) => ({
        name: (r?.name || `Rival ${i + 1}`).slice(0, 12),
        fur: hex(r?.fur, ['#B6DEC4', '#F2C2CB', '#C0C8EE', '#F3DC9B', '#CFC0E4'][i % 5]),
        you: false,
        lane: laneOrder[i + 1],
      })),
    ],
    palette: {
      light: hex(b.palette?.light, '#FFF0D2'),
      skyLow: hex(b.palette?.skyLow, '#F9E6CE'),
      skyMid: hex(b.palette?.skyMid, '#EEE0D0'),
      skyHigh: hex(b.palette?.skyHigh, '#A4BFE5'),
      skyAmbient: hex(b.palette?.skyAmbient, '#BAD2EC'),
      groundAmbient: hex(b.palette?.groundAmbient, '#7E8C5E'),
      fog: hex(b.palette?.fog, '#E7D4B9'),
      fogDensity: clamp(b.palette?.fogDensity, 0.0012, 0.0055, 0.0027),
      sunDir: [0.44, 0.4, 0.44],
      terrain: {
        moss: hex(b.palette?.terrainMoss, '#8CAE77'),
        pale: hex(b.palette?.terrainPale, '#B6C994'),
        sand: hex(b.palette?.terrainSand, '#CEB891'),
        accent: hex(b.palette?.terrainAccent, '#C9AAA3'),
      },
      moodRamp: ramp.map((m, i) => ({
        accent: hex(m?.accent, ['#7FB268', '#C9A25E', '#D0684A'][i]),
        fog: hex(m?.fog, ['#E7D4B9', '#E9C99C', '#E3AC8A'][i]),
        light: hex(m?.light, ['#FFF0D2', '#FFE7BC', '#FFD49C'][i]),
        sky: hex(m?.sky, ['#FFFFFF', '#FFF2E2', '#FFE4CC'][i]),
        tint: tints[i],
      })) as WorldSpec['palette']['moodRamp'],
    },
    props: {
      caps: {
        count: Math.round(clamp(b.props?.capCount, 0, 220, 120)),
        palettes: pad(b.props?.capPalettes, Math.max(1, Math.min(5, b.props?.capPalettes?.length ?? 3)), () => ({
          top: '#E9A08E', under: '#D87B6C', stem: '#F6E3CE',
        })).map((p) => [hex(p?.top, '#E9A08E'), hex(p?.under, '#D87B6C'), hex(p?.stem, '#F6E3CE')]) as WorldSpec['props']['caps']['palettes'],
      },
      tufts: {
        count: Math.round(clamp(b.props?.tuftCount, 0, 3200, 2200)),
        palettes: pad(b.props?.tuftPalettes, Math.max(1, Math.min(3, b.props?.tuftPalettes?.length ?? 2)), () => ({
          top: '#A9C78E', base: '#84A96B',
        })).map((p) => [hex(p?.top, '#A9C78E'), hex(p?.base, '#84A96B')]) as WorldSpec['props']['tufts']['palettes'],
      },
      lanterns: {
        spacing: clamp(b.props?.lanternSpacing, 14, 50, 22),
        post: hex(b.props?.lanternPost, '#9E8564'),
        bulb: hex(b.props?.lanternBulb, '#FFE9B8'),
        glow: hex(b.props?.lanternGlow, '#FFD98F'),
      },
      gate: {
        post: hex(b.props?.gatePost, '#E3C79A'),
        banner: hex(b.props?.gateBanner, '#E9A08E'),
        pennants: pad(b.props?.gatePennants, 4, (i) => ['#F6E3CE', '#C9DCA6', '#F0C7CF', '#C5B6E4'][i]).map((c) => hex(c)),
      },
      islets: {
        count: Math.round(clamp(b.props?.isletCount, 0, 12, 6)),
        caps: pad(b.props?.isletCaps, 3, (i) => ['#E9A08E', '#C9DCA6', '#C5B6E4'][i]).map((c) => hex(c)),
      },
      spores: {
        count: Math.round(clamp(b.props?.sporeCount, 0, 2600, 1400)),
        hue: clamp(b.props?.sporeHue, 0, 1, 0.1),
        hueSpread: clamp(b.props?.sporeHueSpread, 0, 0.3, 0.1),
        sat: clamp(b.props?.sporeSat, 0, 1, 0.55),
      },
    },
    copy: {
      placeTitles: pad(b.placeTitles, 6, (i) => ['YOU TOOK IT', 'SO CLOSE', 'ON THE PODIUM', 'GOOD RUN', 'KEEP GOING', 'NEXT TIME'][i]).map((s) => String(s).slice(0, 40)),
      placeLines: pad(b.placeLines, 6, () => 'The race is over. Run it back.').map((s) => String(s).slice(0, 180)),
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
      name: (b.character?.name || 'You').slice(0, 12),
      fur: normaliseHex(b.character?.fur, hintFur ?? '#F0DEBD'),
      personality: b.character?.personality?.slice(0, 200),
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
  const rnd = () => ((Math.sin(seed * 9301 + 49297) * 233280) % 1 + 1) % 1;
  const hue = rnd();
  const wheel = (h: number, s: number, l: number) => {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h * 12) % 12;
      const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(255 * v).toString(16).padStart(2, '0');
    };
    return ('#' + f(0) + f(8) + f(4)).toUpperCase();
  };
  const character: Character = locked ?? {
    name: 'You', fur: wheel(hue, 0.4, 0.8), source: 'default',
  };
  const brief = {
    character: { name: character.name, fur: character.fur, personality: character.personality ?? '' },
    title: prompt.split(/\s+/).slice(0, 3).join(' ') || 'Offline Run',
    tagline: 'Generated without a model — set ANTHROPIC_API_KEY for the real thing.',
    blurb: `A placeholder world derived from "${prompt.slice(0, 80)}". It is playable, but nothing here was designed.`,
    difficulty: 'standard',
    track: { size: 0.9, corners: 11, twistiness: 0.55, elevation: 0.4, seed },
    racers: [0, 1, 2, 3].map((i) => ({ name: `Rival ${i + 1}`, fur: wheel((hue + 0.2 + i * 0.17) % 1, 0.45, 0.72) })),
    palette: {
      light: wheel(hue, 0.35, 0.9), skyLow: wheel(hue, 0.3, 0.86), skyMid: wheel(hue, 0.22, 0.84),
      skyHigh: wheel((hue + 0.55) % 1, 0.4, 0.72), skyAmbient: wheel((hue + 0.5) % 1, 0.35, 0.8),
      groundAmbient: wheel((hue + 0.3) % 1, 0.25, 0.42), fog: wheel(hue, 0.28, 0.82), fogDensity: 0.0027,
      terrainMoss: wheel((hue + 0.32) % 1, 0.3, 0.58), terrainPale: wheel((hue + 0.32) % 1, 0.28, 0.7),
      terrainSand: wheel(hue, 0.25, 0.72), terrainAccent: wheel((hue + 0.12) % 1, 0.25, 0.7),
      moodRamp: [0, 1, 2].map((i) => ({
        accent: wheel((hue + 0.1 + i * 0.08) % 1, 0.5, 0.55 - i * 0.05),
        fog: wheel((hue + i * 0.03) % 1, 0.3 + i * 0.08, 0.82 - i * 0.05),
        light: wheel((hue + i * 0.02) % 1, 0.3 + i * 0.1, 0.9 - i * 0.04),
        sky: wheel(hue, 0.08 * i, 1 - 0.04 * i),
      })),
    },
    props: {
      capCount: 120, capPalettes: [0, 1, 2].map((i) => ({
        top: wheel((hue + i * 0.2) % 1, 0.4, 0.7), under: wheel((hue + i * 0.2) % 1, 0.4, 0.58), stem: wheel(hue, 0.2, 0.9),
      })),
      tuftCount: 2200, tuftPalettes: [0, 1].map((i) => ({
        top: wheel((hue + 0.32) % 1, 0.32, 0.66 + i * 0.06), base: wheel((hue + 0.32) % 1, 0.32, 0.5 + i * 0.05),
      })),
      lanternSpacing: 22, lanternPost: wheel(hue, 0.2, 0.45), lanternBulb: wheel(hue, 0.35, 0.9), lanternGlow: wheel(hue, 0.4, 0.8),
      gatePost: wheel(hue, 0.25, 0.75), gateBanner: wheel((hue + 0.1) % 1, 0.45, 0.68),
      gatePennants: [0, 1, 2, 3].map((i) => wheel((hue + i * 0.17) % 1, 0.4, 0.8)),
      isletCount: 6, isletCaps: [0, 1, 2].map((i) => wheel((hue + i * 0.2) % 1, 0.4, 0.72)),
      sporeCount: 1400, sporeHue: hue, sporeHueSpread: 0.1, sporeSat: 0.5,
    },
    placeTitles: ['FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH'],
    placeLines: [
      'You took it.', 'Beaten by a stride.', 'On the podium.',
      'A clean run, just short.', 'The band got away from you.', 'Run it back.',
    ],
  } as Brief;

  const { spec, moved } = protectCharacter(expandBrief(brief, character), character);
  return { spec, character, adjustments: moved };
}

export { WorldSpecSchema, BriefSchema };
