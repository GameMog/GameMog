'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { playerId } from '../../anon';

type Side = { id: string; slug: string; title: string };
type State = { child: number; parent: number; uncounted: number; pick: string | null; played: { child: boolean; parent: boolean } };

/**
 * The Mog-off: this Mog, or the game it challenged? Anyone can pick. A pick
 * counts toward the family's ranking only once this browser has finished a
 * run in both, which is the difference between an opinion and a selection.
 */
export function MogOff({ child, parent, idea }: { child: Side; parent: Side; idea: string | null }) {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    fetch(`/api/mogs?child=${encodeURIComponent(child.id)}&voter=${playerId()}`).then((r) => r.json()).then((d) => { if (d && typeof d.child === 'number') setS(d); }).catch(() => {});
  }, [child.id]);
  useEffect(() => {
    load();
    const on = () => load();
    addEventListener('gamemog:run', on);
    return () => removeEventListener('gamemog:run', on);
  }, [load]);

  async function pick(winner: string) {
    setBusy(true);
    try {
      const r = await fetch('/api/mogs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ child: child.id, voter: playerId(), winner: s?.pick === winner ? null : winner }) });
      if (r.ok) setS(await r.json());
    } finally { setBusy(false); }
  }

  const both = !!s && s.played.child && s.played.parent;
  const total = s ? s.child + s.parent : 0;
  return (
    <section className="panel" style={{ marginTop: 16 }} aria-label="Mog-off">
      <label className="lbl">Mog-off</label>
      <p style={{ fontSize: 16, lineHeight: 1.5, marginBottom: 12 }}>
        <b>{child.title}</b> challenges <Link href={`/g/${parent.slug}`}><b>{parent.title}</b></Link>
        {idea ? <span className="dim">: {idea}</span> : null}
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        {[child, parent].map((g) => (
          <button key={g.id} className={`btn${s?.pick === g.id ? '' : ' outline'}`} disabled={busy} onClick={() => pick(g.id)}>
            {s?.pick === g.id ? `You picked ${g === child ? 'this Mog' : 'the original'}` : `${g === child ? 'This Mog' : 'The original'} is better`}
          </button>
        ))}
      </div>
      <p className="t-meta dim">
        {total ? `Counted picks: this Mog ${s!.child}, the original ${s!.parent}.` : 'No counted picks yet.'}
        {s && s.uncounted ? ` ${s.uncounted} more waiting on a run in both.` : ''}
      </p>
      <p className="t-meta dim" style={{ marginTop: 4 }}>
        {both
          ? 'You have played both, so your pick counts.'
          : <>Your pick counts once you have finished a run in both: {s?.played.child ? 'this Mog done' : 'this Mog to play'}, {s?.played.parent ? 'the original done' : <Link href={`/g/${parent.slug}`}>the original to play</Link>}.</>}
      </p>
    </section>
  );
}
