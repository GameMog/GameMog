import type { Metadata } from 'next';
import { SiteHeader, SiteFooter } from '../header';
import { MeMaker } from './maker';

export const metadata: Metadata = { title: 'You | GameMog' };

/** Where "That's me. Run" goes: a path on this site only, never another site. */
function safeThen(then: unknown): string {
  return typeof then === 'string' && /^\/(?!\/)[\w\-/.?=&%]*$/.test(then) ? then : '/g/la-olympics-2028';
}

export default async function MePage({ searchParams }: { searchParams: Promise<{ then?: string }> }) {
  const { then } = await searchParams;
  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <MeMaker then={safeThen(then)} />
      </main>
      <SiteFooter />
    </>
  );
}
