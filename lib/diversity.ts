/**
 * Catalogue diversity.
 *
 * Enums fixed one half of the sameness problem and exposed the other. Given a
 * continuous range a model answers with the middle; given a list it answers
 * with its favourite. Measured over nine generated worlds: 8 of 9 serpentine
 * tracks, 8 of 9 eared creatures, 7 of 9 "standard" difficulty — two of five
 * options used, every time.
 *
 * No amount of prompting reliably fixes that, because it is not a
 * misunderstanding; the model genuinely prefers those options. So the platform
 * corrects it, the same way the world yields to an uploaded character: the
 * model's choice is kept unless the catalogue is already saturated with it, in
 * which case it rotates to whatever is most under-used.
 *
 * On a catalogue meant to hold a great many small games, variety across the
 * shelf is a product requirement, not a matter of taste.
 */

export type Counts = Record<string, number>;

/** Above this share of recent worlds, an option is considered saturated. */
const SATURATION = 0.34;
/** Below this many worlds there is no catalogue to balance against. */
const MIN_SAMPLE = 6;

export type Debias<T extends string> = {
  value: T;
  /** Set when the platform overrode the model, so it can be shown, not hidden. */
  note?: string;
};

export function debias<T extends string>(
  chosen: T,
  options: readonly T[],
  recent: Counts,
  label: string
): Debias<T> {
  if (!options.includes(chosen)) return { value: options[0] };

  const total = options.reduce((n, o) => n + (recent[o] ?? 0), 0);
  if (total < MIN_SAMPLE) return { value: chosen };

  const share = (recent[chosen] ?? 0) / total;
  if (share <= SATURATION) return { value: chosen };

  // rotate to the least-used option, breaking ties by list order so the result
  // is deterministic for a given catalogue
  let best = chosen;
  let bestN = Infinity;
  for (const o of options) {
    const n = recent[o] ?? 0;
    if (n < bestN) { bestN = n; best = o; }
  }
  if (best === chosen) return { value: chosen };

  return {
    value: best,
    note: `${label}: ${chosen} → ${best} (${Math.round(share * 100)}% of recent worlds were already ${chosen})`,
  };
}

/** Tally one field across a set of already-published specs. */
export function tally<T extends string>(values: (T | undefined)[]): Counts {
  const out: Counts = {};
  for (const v of values) if (v) out[v] = (out[v] ?? 0) + 1;
  return out;
}
