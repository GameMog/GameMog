// How long a prompt may be, shown under each box (Create: a world or a story world, 2000; a Mog, 600). The build route
// (app/api/generate/route.ts) refuses longer; the boxes stop at the cap.
export const CREATE_PROMPT_MAX = 2000;
export const MOG_PROMPT_MAX = 600;

export function CharCount({ n, max }: { n: number; max: number }) {
  const near = n >= max * 0.9;
  return (
    <p className="dim-2" aria-live="polite"
      style={{ margin: '6px 0 0', textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums', ...(near ? { opacity: 1, fontWeight: 600 } : null) }}>
      {n.toLocaleString('en-US')} / {max.toLocaleString('en-US')} characters
    </p>
  );
}
