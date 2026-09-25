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
  // a phone gets one native picker instead of a tray of chips several rows deep
  return (
    <>
      <div className="chips" role="tablist" aria-label="Filter by genre">
        {['All', ...genres].map((g) => (
          <button key={g} role="tab" aria-selected={g === value} className={`chip${g === value ? ' on' : ''}`} onClick={() => change(g)}>{g}</button>
        ))}
      </div>
      <label className="chipselect">
        <span>Genre</span>
        <select value={value} onChange={(e) => change(e.target.value)}>
          {['All', ...genres].map((g) => <option key={g} value={g}>{g === 'All' ? 'All genres' : g}</option>)}
        </select>
        <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden><path d="M5 8 L10 13 L15 8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </label>
    </>
  );
}
