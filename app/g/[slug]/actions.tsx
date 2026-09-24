'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '../../header';
import { playerId } from '../../anon';

/**
 * The play button and the row under it, laid out the way Roblox lays out its
 * game page: one large icon button, then Favorite on the left and the vote pair
 * on the right with the ratio drawn between them.
 *
 * Everything here is real. Votes are stored server-side against an id this
 * browser generates for itself. Favorites have no server because there are no
 * accounts to hang them on, so they live in this browser and say so by
 * carrying no count.
 */
type Counts = { up: number; down: number };

const read = <T,>(k: string, d: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
};
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const voterId = playerId;

const short = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K` : String(n);

export function GameActions({ gameId, slug, title, initial }: {
  gameId: string; slug: string; title: string; initial: Counts;
}) {
  const [counts, setCounts] = useState(initial);
  const [mine, setMine] = useState<-1 | 0 | 1>(0);
  const [fav, setFav] = useState(false);

  useEffect(() => {
    setMine(read<Record<string, -1 | 1>>('gamemog:votes', {})[gameId] ?? 0);
    setFav(read<string[]>('gamemog:favorites', []).includes(gameId));
  }, [gameId]);

  /* Play takes the embedded game full screen and asks it for its start
     screen: until then the world only races itself, with nothing over it.
     The frame stays in this page, so the finished race can still post its
     result to the leaderboard. */
  function play() {
    const box = document.getElementById('play');
    const frame = box?.querySelector('iframe');
    frame?.contentWindow?.postMessage({ source: 'gamemog-host', type: 'play' }, '*');
    if (box?.requestFullscreen) box.requestFullscreen().catch(() => box.scrollIntoView({ block: 'center' }));
    else box?.scrollIntoView({ block: 'center' });
    frame?.focus();
  }

  async function vote(v: -1 | 1) {
    const next = mine === v ? 0 : v;
    const before = { counts, mine };
    // optimistic, then reconciled with what the server actually holds
    setMine(next);
    setCounts((c) => ({
      up: c.up + (next === 1 ? 1 : 0) - (mine === 1 ? 1 : 0),
      down: c.down + (next === -1 ? 1 : 0) - (mine === -1 ? 1 : 0),
    }));
    try {
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gameId, voter: voterId(), value: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setCounts(await res.json());
      const all = read<Record<string, -1 | 1>>('gamemog:votes', {});
      if (next) all[gameId] = next; else delete all[gameId];
      write('gamemog:votes', all);
    } catch {
      setCounts(before.counts); setMine(before.mine);
    }
  }

  function favourite() {
    const list = read<string[]>('gamemog:favorites', []);
    const next = !fav;
    write('gamemog:favorites', next ? [...new Set([...list, gameId])] : list.filter((x) => x !== gameId));
    setFav(next);
  }

  const total = counts.up + counts.down;
  const ratio = total ? counts.up / total : 0;

  return (
    <div className="gactions">
      <button className="btn cta" onClick={play} aria-label={`Play ${title}`}>
        <Icon name="play" size={30} />
      </button>
      <div className="arow">
        <button className="act" onClick={favourite} aria-pressed={fav}>
          <Icon name="star" size={24} /><span>{fav ? 'Favorited' : 'Favorite'}</span>
        </button>
        <Link className="act" href={`/mog/${slug}`}>
          <Icon name="remix" size={24} /><span>Mog</span>
        </Link>
        <div className="votes">
          <button className="act" onClick={() => vote(1)} aria-pressed={mine === 1} aria-label="Like">
            <Icon name="thumbUp" size={24} /><span>{short(counts.up)}</span>
          </button>
          <div className="votebar" aria-label={total ? `${Math.round(ratio * 100)}% liked` : 'No votes yet'}>
            <i style={{ width: `${ratio * 100}%` }} />
          </div>
          <button className="act" onClick={() => vote(-1)} aria-pressed={mine === -1} aria-label="Dislike">
            <Icon name="thumbDown" size={24} /><span>{short(counts.down)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
