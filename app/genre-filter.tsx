'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function GenreFilter({ genres, value }: { genres: string[]; value: string }) {
  const router = useRouter(), pathname = usePathname(), current = useSearchParams();
  function change(next: string) {
    const query = new URLSearchParams(current.toString());
    if (next === 'All') query.delete('genre'); else query.set('genre', next);
    router.replace(`${pathname}${query.size ? `?${query}` : ''}`);
  }
  return (
    <label className="pill filterpill">
      <span>Genre: {value}</span>
      <span className="down" aria-hidden />
      <select aria-label="Filter by genre" value={value} onChange={(e) => change(e.target.value)}>
        <option>All</option>
        {genres.map((genre) => <option key={genre}>{genre}</option>)}
      </select>
    </label>
  );
}
