import { z } from 'zod';
import { contrast, distance, pushApart } from './color';
import type { WorldSpec } from './worldspec';

/**
 * An uploaded character is the one thing in a world that is not up for
 * negotiation.
 *
 * "Change the track without losing the character's appearance" only holds if
 * something enforces it, so the rule here is: the character's colour is fixed,
 * and when the generated world would swallow it, the *world* moves. Terrain
 * shifts away from the character, not the other way round.
 */

export const CharacterSchema = z.object({
  name: z.string().min(1).max(14),
  fur: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** A short read of who they are; steers the world's copy, not its mechanics. */
  personality: z.string().max(200).optional(),
  /** Where the colour came from, so the UI can be honest about it. */
  source: z.enum(['upload', 'model', 'manual', 'default']).default('default'),
});
export type Character = z.infer<typeof CharacterSchema>;

export const ImageSchema = z.object({
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  /** base64, no data: prefix. Client downsamples before sending. */
  data: z.string().min(64).max(2_200_000),
});
export type CharacterImage = z.infer<typeof ImageSchema>;

/** How far apart a racer and the ground must read before one hides the other. */
const MIN_SEPARATION = 135;

export type Protection = {
  spec: WorldSpec;
  moved: string[];
};

/**
 * Lock the character into a generated world and repair anything that would
 * hide it. Returns what had to move, so the creator is told rather than
 * silently overruled.
 */
export function protectCharacter(spec: WorldSpec, character: Character): Protection {
  const moved: string[] = [];
  const next: WorldSpec = structuredClone(spec);
  const fur = character.fur.toUpperCase();

  // 1. the player wears the character, exactly
  const player = next.racers.find((r) => r.you) ?? next.racers[0];
  if (player) {
    player.name = character.name.slice(0, 14);
    player.fur = fur;
  }

  // 2. ground must not swallow them
  const t = next.palette.terrain;
  for (const key of ['moss', 'pale', 'sand'] as const) {
    const before = t[key];
    const after = pushApart(before, fur, MIN_SEPARATION, 1.45);
    if (after !== before) {
      t[key] = after as typeof before;
      moved.push(`terrain ${key} moved ${before} → ${after} so ${character.name} stays visible`);
    }
  }

  // 3. rivals must not be mistaken for the player, and must not vanish either.
  //    The prompt asks the model for this; asking is not enforcing, and the
  //    whole point of a fixed engine is that correctness does not depend on a
  //    model remembering an instruction.
  for (const r of next.racers) {
    if (r === player) continue;

    if (distance(r.fur, fur) < 45) {
      const after = pushApart(r.fur, fur, 65);
      if (after !== r.fur) {
        moved.push(`${r.name} recoloured ${r.fur} → ${after} to stay distinct from ${character.name}`);
        r.fur = after as typeof r.fur;
      }
    }

    // Match the playtest's gate exactly, on both metrics. Distance catches a
    // rival the same hue as the ground; contrast catches one that differs in
    // hue but sits at the same brightness, which a hue metric alone misses.
    // Targets are set above the floor of the cast we have actually watched race.
    const ground = next.palette.terrain.moss;
    if (distance(r.fur, ground) < 100 || contrast(r.fur, ground) < 1.3) {
      const after = pushApart(r.fur, ground, 120, 1.45);
      // never fix a rival by making it look like the player
      if (after !== r.fur && distance(after, fur) >= 45) {
        moved.push(`${r.name} recoloured ${r.fur} → ${after} to stand out from the ground`);
        r.fur = after as typeof r.fur;
      }
    }
  }

  return { spec: next, moved };
}

/**
 * Dominant colour of an image, ignoring the near-white backdrop that product
 * shots and sticker exports almost always carry. A plain average returns white
 * for exactly the kind of image people upload.
 *
 * Runs in the browser (needs canvas), and is what makes the offline path
 * actually respond to an upload rather than ignoring it.
 */
export function dominantColourFromImage(img: HTMLImageElement): string {
  const N = 64;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '#F0DEBD';
  ctx.drawImage(img, 0, 0, N, N);

  let px: Uint8ClampedArray;
  try {
    px = ctx.getImageData(0, 0, N, N).data;
  } catch {
    return '#F0DEBD'; // tainted canvas
  }

  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
    if (a < 128) continue;
    if (r > 244 && g > 244 && b > 244) continue;  // paper-white backdrop
    if (r < 18 && g < 18 && b < 18) continue;     // outline / drop shadow
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  if (!buckets.size) return '#F0DEBD';

  let best = { n: 0, r: 0, g: 0, b: 0 };
  for (const e of buckets.values()) if (e.n > best.n) best = e;
  const hex =
    '#' +
    [best.r / best.n, best.g / best.n, best.b / best.n]
      .map((v) => Math.round(v).toString(16).padStart(2, '0'))
      .join('');
  return hex.toUpperCase();
}

/**
 * Downsample to a long edge of `max` and re-encode as JPEG.
 * A character reference needs no fidelity, and the vision docs are explicit
 * that downsampling is the right move when it is not needed — it keeps the
 * request small and the token cost honest.
 */
export function prepareUpload(file: File, max = 768): Promise<{ image: CharacterImage; preview: string; dominant: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not an image we can read.'));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable.'));
        // flatten onto white: transparent PNGs otherwise read as black
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = c.toDataURL('image/jpeg', 0.86);
        resolve({
          image: { mediaType: 'image/jpeg', data: dataUrl.split(',')[1] },
          preview: dataUrl,
          dominant: dominantColourFromImage(img),
        });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
