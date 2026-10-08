import { KartScore, KART_INK, raceClock, ordinal, type KartTier } from '@/lib/kart-score';
import type { ScoreRow } from '@/lib/db';

/**
 * A kart race's score on the page (the owner, 8 Oct): the tier chip, the bar toward 10,000 and the board, one row a
 * player. No hooks, so the post panel (a client component) shows the same chip and bar as the board. The colours are
 * the tiers' own (lib/runtime/kart-score.js), every chip in the site's ink; nothing moves.
 */
export function TierChip({ tier, dnf = false, size = 11 }: { tier: KartTier; dnf?: boolean; size?: number }) {
  // (a race called before your finish: an outline DNF in place of the tier)
  const style: React.CSSProperties = dnf
    ? { color: 'var(--ink-3)', border: '1px solid var(--ink-3)', background: 'transparent' }
    : { color: KART_INK, background: tier.color, border: `1px solid ${tier.id === 'hodl' ? 'var(--line)' : tier.color}` };
  return (
    <span style={{ ...style, display: 'inline-block', fontSize: size, lineHeight: `${size + 5}px`, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', padding: '1px 6px', borderRadius: 'var(--r-btn)', whiteSpace: 'nowrap' }}>
      {dnf ? 'DNF' : tier.name}
    </span>
  );
}

/** A thin bar toward 10,000, with a tick at the MOG, Diamond Hands and Green Candle cut-offs so near-equal bars still read. */
export function ScoreBar({ score, tier, height = 4 }: { score: number; tier: KartTier; height?: number }) {
  const ticks = KartScore.TIERS.filter((t) => ['mog', 'diamond', 'candle'].includes(t.id)).map((t) => t.min);
  return (
    <div aria-hidden style={{ position: 'relative', height, background: 'var(--line-2)', borderRadius: height / 2, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, right: 'auto', width: `${Math.max(0, Math.min(100, score / 100))}%`, background: tier.bar }} />
      {ticks.map((t) => <div key={t} style={{ position: 'absolute', top: 0, bottom: 0, left: `${t / 100}%`, width: 1, background: 'var(--surface)' }} />)}
    </div>
  );
}

/** The small line under a name: 2:06.8 · 1st · 38 GM · 3 hits (a called race: ~3:01.0 · DNF). */
export function kartLine(r: { timeMs: number; place: number; gm: number | null; hits: number | null; est: boolean }, gmOn = true) {
  return [`${r.est ? '~' : ''}${raceClock(r.timeMs)}`, r.est ? 'DNF' : r.place ? ordinal(r.place) : '', gmOn ? `${r.gm ?? 0} GM` : '', `${r.hits ?? 0} ${r.hits === 1 ? 'hit' : 'hits'}`].filter(Boolean).join(' · ');
}

/** The board: rank, player, the score as a big number with its tier, the bar toward 10,000, and the run under the name. */
export function KartBoard({ rows, gmOn = true, provisional = false }: { rows: ScoreRow[]; gmOn?: boolean; provisional?: boolean }) {
  return (
    <div style={{ maxWidth: 760 }}>
      <p className="t-meta dim-2" style={{ margin: '0 0 10px' }}>
        Ranked by score, out of 10,000 (the perfect race). Each player once, by their best run.
        {provisional && ' This track\'s perfect times are still estimated, so its scores are provisional.'}
      </p>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, background: 'var(--surface)', borderRadius: 'var(--r)', boxShadow: 'var(--elev)', overflow: 'hidden' }}>
        {rows.map((s, i) => {
          const score = s.score ?? 0, tier = KartScore.tier(score), est = !!s.est;
          return (
            <li key={s.id} style={{ display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr) auto', columnGap: 10, rowGap: 4, alignItems: 'center', padding: '12px 14px 13px', borderTop: i ? '1px solid var(--line-2)' : 'none' }}>
              <span style={{ gridRow: '1 / span 2', fontSize: 15, fontWeight: 800, color: i < 3 ? 'var(--ink)' : 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
              <b style={{ fontSize: 15, fontWeight: 700, lineHeight: '20px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.player}</b>
              <b style={{ justifySelf: 'end', fontSize: 22, fontWeight: 800, lineHeight: '24px', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}>{score.toLocaleString('en-US')}</b>
              <span className="t-meta dim-2" style={{ fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {kartLine({ timeMs: s.time_ms, place: s.place, gm: s.gm, hits: s.kos, est }, gmOn)}
              </span>
              <span style={{ justifySelf: 'end' }}><TierChip tier={tier} dnf={est} /></span>
              <div style={{ gridColumn: '2 / span 2', marginTop: 4 }}><ScoreBar score={score} tier={tier} /></div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
