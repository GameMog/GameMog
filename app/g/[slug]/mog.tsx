import Link from 'next/link';
import { family, getGameById, mogsOf, type GameRow } from '@/lib/db';
import { canMog, MOG_SOON } from '@/lib/custom-game';
import { MogOff } from './mog-off';

/**
 * Mog on the game page: where this game came from, what has challenged it,
 * and how its family ranks by the picks of players who played both sides.
 */
export function Lineage({ game }: { game: GameRow }) {
  const parent = game.parent_id ? getGameById(game.parent_id) : null;
  // (the original is always credited, docs/RULES.md: a Mog of a Mog names it too)
  const root = game.root_id && game.root_id !== game.parent_id ? getGameById(game.root_id) : null;
  const fam = family(game.id), mogs = mogsOf(game.id).length;
  const leads = fam.length > 1 && fam[0].id === game.id && fam[0].wins > 0;
  if (!parent && !mogs) return null;
  // (the dare loop, 10 Oct: "Remixed from X", the words of the dare card and landing, and the whole family one tap away)
  return (
    <p className="by">
      {parent ? <>Remixed from <Link href={`/g/${parent.slug}`}><b>{parent.title}</b></Link></> : null}
      {root ? <>. Original: <Link href={`/g/${root.slug}`}><b>{root.title}</b></Link></> : null}
      {!parent && mogs ? <>Challenged by {mogs} Mog{mogs === 1 ? '' : 's'}</> : null}
      {leads ? <>. <b>Leads its family</b></> : null}
      {fam.length > 1 ? <> · <Link href={`/g/${game.slug}/family`}>See the family</Link></> : null}
    </p>
  );
}

export function MogOffPanel({ game }: { game: GameRow }) {
  const parent = game.parent_id ? getGameById(game.parent_id) : null;
  if (!parent) return null;
  return <MogOff child={{ id: game.id, slug: game.slug, title: game.title }} parent={{ id: parent.id, slug: parent.slug, title: parent.title }} idea={game.mog_prompt} />;
}

export function MogsPanel({ game }: { game: GameRow }) {
  const fam = family(game.id), children = mogsOf(game.id);
  const byId = new Map(fam.map((m) => [m.id, m]));
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <p style={{ fontSize: 16, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 560 }}>
          A Mog challenges a game with a better variation. Players who have finished a run in both pick the
          better one, and the family is ranked by those picks.
        </p>
        {/* (a game that cannot be mogged yet says so, 12 Oct: a penalty shootout) */}
        {canMog(game)
          ? <Link className="btn" href={`/mog/${game.slug}`}>Mog this game</Link>
          : <p className="dim" style={{ fontSize: 14, lineHeight: 1.5, maxWidth: 320 }}>{MOG_SOON}</p>}
      </div>

      <h2 style={{ marginBottom: 8 }}>Mogs of this game</h2>
      {children.length ? (
        <table className="bd" style={{ marginBottom: 24 }}>
          <thead><tr><th>Mog</th><th>The idea</th><th>Mog-off</th><th>Players</th></tr></thead>
          <tbody>
            {children.map((c) => {
              const m = byId.get(c.id);
              return (
                <tr key={c.id}>
                  <td style={{ minWidth: 170 }}><Link href={`/g/${c.slug}`}><b>{c.title}</b></Link></td>
                  <td className="dim">{c.mog_prompt}</td>
                  <td>{m ? `${m.wins} won, ${m.losses} lost` : '-'}</td>
                  <td>{m?.players ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : <p className="dim" style={{ marginBottom: 24 }}>{canMog(game) ? 'Nobody has mogged this game yet. Be the first.' : 'Nobody has mogged this game yet.'}</p>}

      {fam.length > 1 && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <h2>The family, ranked</h2>
            <Link href={`/g/${game.slug}/family`}>See the whole family</Link>
          </div>
          <table className="bd">
            <thead><tr><th /><th>Game</th><th>Generation</th><th>Rating</th><th>Mog-offs</th><th>Players</th></tr></thead>
            <tbody>
              {fam.map((m) => (
                <tr key={m.id} style={m.id === game.id ? { fontWeight: 700 } : undefined}>
                  <td>{m.rank}</td>
                  <td><Link href={`/g/${m.slug}`}>{m.title}</Link></td>
                  <td>{m.generation === 0 ? 'Original' : m.generation}</td>
                  <td>{m.elo}</td>
                  <td>{m.wins} won, {m.losses} lost</td>
                  <td>{m.players}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
