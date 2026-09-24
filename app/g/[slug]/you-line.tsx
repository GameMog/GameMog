'use client';
import Link from 'next/link';
import { useMe } from '../../me-store';

/** Who you play as in this world, or the way to put yourself in it. */
export function YouLine({ slug }: { slug: string }) {
  const me = useMe();
  const to = `/me?then=${encodeURIComponent(`/g/${slug}`)}`;
  if (me === undefined) return <p className="by" style={{ minHeight: 24 }} />;
  return me
    ? <p className="by">Playing as <b>{me.name}</b> · <Link href={to} style={{ color: 'var(--blue)' }}>Change</Link></p>
    : <p className="by"><Link href={to} style={{ color: 'var(--blue)', fontWeight: 600 }}>Put yourself in this game</Link></p>;
}
