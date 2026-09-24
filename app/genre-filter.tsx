'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Genres as GameStop's tab chips (docs/design/premium.md): a quiet tray with
 * the chosen genre lifted onto white. Every chip filters for real; the URL
 * carries the choice, so a filtered chart can be shared.
 */
export function GenreFilter({ genres, value }: { genres: string[]; value: string }) {
  const router = useRouter(), pathname = usePathname(), current = useSearchParams();
  function change(next: string) {
    const query = new URLSearchParams(current.toString());
    if (next === 'All') query.delete('genre'); else query.set('genre', next);
    router.replace(`${pathname}${query.size ? `?${query}` : ''}`, { scroll: false });
  }
  return (
    <div className="chips" role="tablist" aria-label="Filter by genre">
      {['All', ...genres].map((g) => (
        <button key={g} role="tab" aria-selected={g === value} className={`chip${g === value ? ' on' : ''}`} onClick={() => change(g)}>{g}</button>
      ))}
    </div>
  );
}
