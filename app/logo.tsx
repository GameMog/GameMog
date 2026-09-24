import Link from 'next/link';
import { GOLD, INK, MARK } from '@/lib/brand';

/** The crown tile (lib/brand.ts), drawn inline so it is sharp at any size. */
export function Mark({ size = 34 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox={MARK.viewBox} aria-hidden focusable="false">
      <rect width="64" height="64" rx={MARK.radius} fill={GOLD} />
      <path d={MARK.crown} fill={INK} />
      <rect {...MARK.band} fill={INK} />
    </svg>
  );
}

/** The mark and the name, linking home. */
export function Wordmark({ size }: { size?: number }) {
  return (
    <Link href="/" className="wordmark" aria-label="GameMog home">
      <Mark size={size} /><b>GameMog</b>
    </Link>
  );
}
