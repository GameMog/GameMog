'use client';
import { DiscordPill, GlassFont } from '../../discord-pill';
import type { DareView, Target } from '@/lib/dare';

/**
 * The dare loop on the game page (the owner, 10 Oct; mockups round 2, boards 4 and 4b): a game page opened with
 * ?dare=<id> (the dare landing's PLAY) holds the dare, and these are its two glass surfaces, both over the game:
 *
 *  - DareStart: one gold PLAY over the frame, when the page could not start the game by itself (the document was not
 *    already full screen). Its tap is the gesture that takes the frame full screen.
 *  - DareResult: the finished run against the dare. Lost: "SO CLOSE · 462 SHORT", you against them, gold RACE AGAIN,
 *    glass MOG IT BACK, a quiet "Send it back". Won: a big gold "+731", gold SEND IT BACK, glass MOG IT BACK, a quiet
 *    "Race again". The community pill sits under the card, as on the other dare surfaces.
 *
 * Rendered only with a dare in context (app/g/[slug]/play-frame.tsx loads this file on demand), so every game page
 * without one is exactly as it was. The glass is app/glass.css (gl- and dv- classes, loaded with app/discord-pill.tsx).
 */

/** What POST /api/dares/<id>/result answers (app/api/dares/[id]/result/route.ts). */
export type DareOutcome = { beaten: boolean; margin: number | null; marginText: string | null; you: Target; them: Target | null };

/** The dare's PLAY, over the frame: who dared you and what to beat, in one chip, then the button. */
export function DareStart({ view, onPlay }: { view: DareView; onPlay: () => void }) {
  return (
    <div className="gl dv-start">
      <GlassFont />
      {(view.name || view.target) && (
        <span className="gl-glass gl-chip">
          {view.name && `${view.name} dared you`}{view.name && view.target && <span className="dv-sep"> · </span>}
          {view.target && <span className="dv-nb">Beat <b className="gl-ox" style={{ color: 'var(--gl-warm)', fontWeight: 600 }}>{view.target.text}</b></span>}
        </span>
      )}
      <button type="button" className="gl-pill gl-gold" onClick={onPlay} aria-label={`Play ${view.game.title}`}>
        <PlayMark /> Play
      </button>
    </div>
  );
}

/**
 * The way out of the frame taking the screen on a phone with no element full screen (an iPhone: app/glass.css
 * .gl-fill.gl-pseudo), top right inside the frame, once a run is over (mid-run it would sit on the game's HUD).
 */
export function DareExit({ onExit }: { onExit: () => void }) {
  return (
    <button type="button" className="gl gl-glass gl-chip" onClick={onExit} aria-label="Leave full screen"
      style={{ position: 'absolute', top: 'max(10px, env(safe-area-inset-top))', right: 'max(10px, env(safe-area-inset-right))', zIndex: 5 }}>
      Exit
    </button>
  );
}

const lowerWins = (t: Target) => t.board === 'time' || t.board === 'place';
const raceLike = (t: Target) => t.board === 'kart' || t.board === 'level' || t.board === 'time' || t.board === 'place';

/** The bar lengths of two runs on one board: the better one full, the other in proportion. */
function widths(a: Target, b: Target): [number, number] {
  const x = Math.max(0, a.value), y = Math.max(0, b.value);
  if (lowerWins(a)) {
    const best = Math.min(x || Infinity, y || Infinity);
    return [x ? best / x : 0, y ? best / y : 0].map((v) => (Number.isFinite(v) ? v : 0)) as [number, number];
  }
  const top = Math.max(x, y) || 1;
  return [x / top, y / top];
}

/**
 * The finished run against the dare. `mode` 'over' sits inside the frame (the frame is full screen, or big enough);
 * 'sheet' sits just under it (a phone's small inline frame). `compact`: a short frame, so the card is tighter.
 */
export function DareResult({ view, outcome, mode, compact, onAgain, onSendBack }: {
  view: DareView; outcome: DareOutcome; mode: 'over' | 'sheet'; compact: boolean;
  onAgain: () => void; onSendBack: () => void;
}) {
  const { you, them, beaten } = outcome;
  const who = view.name || 'Them';
  const again = raceLike(you) ? 'Race again' : 'Play again';
  const mogHref = `/mog/${view.game.slug}?dare=${encodeURIComponent(view.id)}`;
  const m = outcome.marginText ?? '';
  const tie = !!them && !beaten && outcome.margin === 0;

  let cap: string, shout: string, sub: string;
  if (!them) { cap = 'Your run'; shout = you.text; sub = you.sub; }
  else if (beaten) { cap = 'Dare beaten'; shout = you.board === 'time' ? `-${m}` : `+${m}`; sub = view.name ? `You beat ${view.name}` : 'You beat the dare'; }
  else { cap = 'So close'; shout = tie ? 'Tied' : `${m} short`; sub = `of ${view.name ? `${view.name}’s ` : ''}${them.text}`; }
  const big = beaten || !them;
  const [wy, wt] = them ? widths(you, them) : [1, 0];

  return (
    <div className={`gl ${mode === 'over' ? 'dv-over' : 'dv-sheet'}${compact ? ' dv-compact' : ''}`} role="dialog" aria-label={cap}>
      <GlassFont />
      <div className="dv-stack">
        <div className="dv-card gl-glass gl-deep gl-lit">
          <div className="gl-cap" style={{ color: 'var(--gl-warm)' }}>{cap}</div>
          <div className={`gl-shout dv-shout${big ? ' dv-win' : ''}`}>{shout}</div>
          {sub && <p className="dv-sub">{sub}</p>}
          {them && (
            <div className="dv-bars">
              <Bar name="You" text={you.text} w={wy} hi={beaten} />
              <Bar name={who} text={them.text} w={wt} hi={!beaten} />
            </div>
          )}
          {/* (two across where they fit, one above the other on a phone) */}
          <div className="dv-btns" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {big
              ? <button type="button" className="gl-pill gl-gold" onClick={onSendBack}>Send it back <Arrow /></button>
              : <button type="button" className="gl-pill gl-gold" onClick={onAgain}>{again}</button>}
            <a className="gl-pill gl-acc" href={mogHref}>Mog it back</a>
          </div>
          {big
            ? <button type="button" className="gl-cap dv-quiet" onClick={onAgain}>{again}</button>
            : <button type="button" className="gl-cap dv-quiet" onClick={onSendBack}>Send it back</button>}
        </div>
        <div className="dv-foot"><DiscordPill /></div>
      </div>
    </div>
  );
}

function Bar({ name, text, w, hi }: { name: string; text: string; w: number; hi: boolean }) {
  return (
    <div className={`dv-bar${hi ? ' dv-hi' : ''}`}>
      <span className="gl-cap">{name}</span>
      <span className="dv-track"><i style={{ width: `${Math.round(Math.max(0, Math.min(1, w)) * 1000) / 10}%` }} /></span>
      <span className="gl-ox dv-val">{text}</span>
    </div>
  );
}

const PlayMark = () => (
  <svg width={16} height={16} viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M6.6 3.7a.9.9 0 011.4-.8l8.2 5.3a.9.9 0 010 1.6l-8.2 5.3a.9.9 0 01-1.4-.8z" /></svg>
);
const Arrow = () => (
  <svg width={14} height={14} viewBox="0 0 20 20" fill="currentColor" aria-hidden><path d="M6 4h10v10h-2V7.4l-8.3 8.3-1.4-1.4L12.6 6H6z" /></svg>
);
