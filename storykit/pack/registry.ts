// Story Kit: the cast registry on the platform's side (the gate, the voice plan, the builder). The registry itself is
// public/storykit/cast/registry.json (the engine reads it too); storykit/cast/README.md has the format and the rules.
//   modelOf(key)            the registry's entry ('mogcity/dan'), or null
//   nearVoice(key)          its voice block for lines it never recorded (a Kokoro block designed to sit near the original)
//   seedSheet(key, id)      the Character Forge sheet a Mog starts from when it changes that person (storykit/cast/seeds.json)
//   recordedClip(c, text)   the shipped recording of that line, when the speaker's voice block is a registry voice and the
//                           words are one of its recorded lines: { id, url, secs } (url relative to the Story Kit page)
import REGISTRY from '../../public/storykit/cast/registry.json' with { type: 'json' };
import MOGCITY from '../../public/storykit/cast/mogcity/voice/manifest.json' with { type: 'json' };
import SEEDS from '../cast/seeds.json' with { type: 'json' };
import { lintVoiceBlock, KOKORO_VOICES, voiceKey } from '../voices/voice-design.js';

type Json = any;
export type Model = {
  kind: 'person' | 'voice' | 'pet'; world: string; built?: 'hand'; name: string; role: string; glb?: string; rig?: 'cast66' | 'suit'; man?: string; look?: string;
  clips?: Record<string, string>; face?: Json; props?: string[]; height?: number; can: string[]; anchor?: string; species?: string; breed?: string; build?: string;
  voice?: { recorded?: string; lines?: number; f0?: number; near: Json }; seed?: string; credit: string;
};
export const MODELS: Record<string, Model> = (REGISTRY as Json).models;
const SETS: Record<string, { lines: { id: string; who: string; text: string; file: string; dur: number }[] }> = { mogcity: MOGCITY as Json };
const SET_DIR: Record<string, string> = Object.fromEntries(Object.entries((REGISTRY as Json).voices as Record<string, string>).map(([k, f]) => [k, f.replace(/[^/]+$/, '')]));

export const modelOf = (key: unknown): Model | null => (typeof key === 'string' && Object.hasOwn(MODELS, key) ? MODELS[key] : null);
/** A hand-built person (built: 'hand', 'hand/...'): a Story Kit body Mog City does not ship, so the world carries their GLB. */
export const handBuilt = (key: unknown) => modelOf(key)?.built === 'hand';
export const can = (key: unknown, what: string) => !!modelOf(key)?.can.includes(what);
/** The model's voice block for lines it never recorded (the pack's cast[].voice when it leaves it out). */
export const nearVoice = (key: string) => { const m = modelOf(key); return m?.voice ? JSON.parse(JSON.stringify(m.voice.near)) : null; };
/** The sheet a Mog starts from when it changes a shipped person: their seed, given the cast id (the voice stays theirs). */
export function seedSheet(key: string, id?: string) {
  const s = (SEEDS as Json).seeds[key]; if (!s) return null;
  const sheet = JSON.parse(JSON.stringify(s));
  if (id) sheet.id = id;
  return sheet;
}
export const seeds = (): Record<string, Json> => (SEEDS as Json).seeds;

// a cast member's voice block as the voice pass keys it (the same as runner.ts voiceBlockOf, without importing it)
const blockOf = (v: Json) => {
  const blend = v.blend || null;
  const base = v.kokoro || Object.entries((blend || {}) as Record<string, number>).filter(([id]) => id in KOKORO_VOICES).sort((x, y) => y[1] - x[1])[0]?.[0];
  return lintVoiceBlock({ id: v.id, base, blend: blend || { [base]: 1 }, speed: v.speed, pitch: v.pitch, description: v.description }).block;
};
// voice key -> the recorded set and speaker (a registry voice, exactly as the registry has it)
const RECORDED = new Map<string, { set: string; who: string }>();
for (const [key, m] of Object.entries(MODELS)) if (m.voice?.recorded) RECORDED.set(voiceKey(blockOf(m.voice.near)), { set: key.split('/')[0], who: m.voice.recorded });
// Mog City's own spelling of a line for its recordings (wagmi/radio/voices.js key): case and punctuation don't count
const words = (t: string) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const BY_TEXT = new Map<string, Json>();
for (const [set, s] of Object.entries(SETS)) for (const l of s.lines) BY_TEXT.set(`${set}|${l.who}|${words(l.text)}`, l);

/** A line's shipped recording: the speaker's voice block is a registry voice (unchanged) and the words are its line's. */
export function recordedClip(voice: Json, text: string): { id: string; url: string; secs: number } | null {
  if (!voice) return null;
  const r = RECORDED.get(voiceKey(blockOf(voice))); if (!r) return null;
  const l = BY_TEXT.get(`${r.set}|${r.who}|${words(text)}`);
  return l ? { id: l.id, url: SET_DIR[r.set] + l.file, secs: l.dur } : null;
}
/** Every recorded line of a model (for the builder's prompt and the checks). */
export const recordedLines = (key: string) => { const m = modelOf(key), w = m?.voice?.recorded; return w ? SETS[key.split('/')[0]].lines.filter((l) => l.who === w) : []; };
