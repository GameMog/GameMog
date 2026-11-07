// Story Kit: a passed v2 pack's voice plan, shared by `npm run storykit:pack` (scripts/storykit-pack.ts, repo packs in
// public/) and the world store (lib/storykit-store.ts, a creator's world on GameMog's own disk). No file system here.
import { gatePack, personName } from './gate.ts';
import { recordedClip } from './registry.ts';
import { SHOWCASE_PACKS } from './schema.mjs';
import { lintVoiceBlock, KOKORO_VOICES, VOICE_MODEL, voiceKey, clipBase } from '../voices/voice-design.js';

/** A cast member's voice block as the voice pass reads it (the gate's base: kokoro, or the heaviest English voice). */
export function voiceBlockOf(c: any) {
  const blend = c.voice.blend || null;
  const base = c.voice.kokoro || Object.entries((blend || {}) as Record<string, number>).filter(([id]) => id in KOKORO_VOICES).sort((x, y) => y[1] - x[1])[0]?.[0];
  return lintVoiceBlock({ id: c.voice.id, base, blend: blend || { [base]: 1 }, speed: c.voice.speed, pitch: c.voice.pitch, description: c.voice.description }).block;
}
/**
 * What the voice pass renders and the engine plays: each speaker's block and every spoken line with its clip's name
 * (<line hash>-<voice key>, in packs/<id>/voice/). A choice's prompt is shown on screen, not spoken, so it has no clip.
 * A line spoken in a registry voice (unchanged) with the words of one of its shipped recordings plays that recording:
 * the line's `rec` is its URL beside the page (storykit/pack/registry.ts), and the voice pass never renders it.
 * `dir`: where the clips are, relative to the Story Kit page (a stored world's clips are content-hashed URLs instead,
 * listed in the plan's own `clips`, so its dir is '').
 */
export function voicePlanOf(pack: any, dir = `packs/${pack.id}/voice/`) {
  const name = (id: string) => personName(pack.cast.find((c: any) => c.id === id)) || id.replace(/(^|-)([a-z])/g, (_: string, a: string, b: string) => (a ? ' ' : '') + b.toUpperCase());
  const blocks = new Map(pack.cast.map((c: any) => [c.id, voiceBlockOf(c)]));
  // (a showcase (SHOWCASE_PACKS) is gated as one: longer than a Create, so the plain gate refuses it and lists no lines)
  const lines = gatePack(pack, SHOWCASE_PACKS.includes(pack.id) ? { showcase: true } : {}).lines.filter((l) => !/\.p$/.test(l.id));
  return {
    model: VOICE_MODEL, dir,
    cast: Object.fromEntries(pack.cast.map((c: any) => { const b: any = blocks.get(c.id); return [name(c.id), { id: c.id, voice: b.id, key: voiceKey(b), block: b }]; })),
    lines: lines.map((l) => {
      const b: any = blocks.get(l.who), rec = recordedClip(pack.cast.find((c: any) => c.id === l.who)?.voice, l.text);
      return { id: l.id, who: name(l.who), voice: b.id, text: l.text, hash: l.hash, clip: clipBase(l.text, b), ...(rec ? { rec: rec.url, recId: rec.id, secs: rec.secs } : {}) };
    })
  };
}
