'use client';
import { HAZARDS, MUSIC_TRACKS, type Hazards, type MusicChoice, type WorldOptions } from '@/lib/world-options';

const HAZARD_LABEL: Record<Hazards, string> = { fewer: 'Fewer each lap', same: 'The same every lap', more: 'More each lap' };
const Chevron = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden><path d="M5 8 L10 13 L15 8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/**
 * The creator's platform options, on Create and on Mog (the owner, 26 Sep):
 * obstacles each lap, and music (off unless picked). The runtime enforces
 * them, whatever the world's code says. "Open world" (27 Sep) builds a place
 * to roam and survive in instead of a lap race; the obstacles do not apply.
 * "No GM" (1 Oct) takes the coins and the goal out of an open world.
 * The music is one choice (9 Oct): "No music" or a library track, and first,
 * on a Mog of a game with its own soundtrack, "Original soundtrack (its name)",
 * where the Mog starts (the original's, kept in `soundtrack` whatever is
 * picked, so it can be picked again). "No music" there is 'none', the
 * original's taken out; anywhere else it is no music as it always was (null).
 */
/** `lockOpen`: a Mog keeps its original's kind, an open world or a race (the owner, 1 Oct: no "Open world" box on a Mog). */
export function WorldOptionsFields({ value, onChange, disabled, lockOpen }: { value: WorldOptions; onChange: (o: WorldOptions) => void; disabled?: boolean; lockOpen?: boolean }) {
  return (
    <div className="copts">
      {!value.open && (
        <label className="cselect">
          <span>Obstacles</span>
          <select value={value.hazards} disabled={disabled} onChange={(e) => onChange({ ...value, hazards: e.target.value as Hazards })}>
            {HAZARDS.map((h) => <option key={h} value={h}>{HAZARD_LABEL[h]}</option>)}
          </select>
          <Chevron />
        </label>
      )}
      {!lockOpen && (
        <label className="ccheck">
          <input type="checkbox" checked={!!value.open} disabled={disabled} onChange={(e) => onChange({ ...value, open: e.target.checked })} />
          <span>Open world</span>
        </label>
      )}
      {value.open && (
        <label className="ccheck">
          <input type="checkbox" checked={!value.coins} disabled={disabled} onChange={(e) => onChange({ ...value, coins: !e.target.checked })} />
          <span>No GM</span>
        </label>
      )}
      <label className="cselect">
        <span>Music</span>
        <select value={value.music === 'original' && !value.soundtrack ? 'none' : value.music ?? 'none'} disabled={disabled}
          onChange={(e) => onChange({ ...value, music: e.target.value === 'none' ? (value.soundtrack ? 'none' : null) : e.target.value as MusicChoice })}>
          {value.soundtrack && <option value="original">{`Original soundtrack (${value.soundtrack.label})`}</option>}
          <option value="none">No music</option>
          {MUSIC_TRACKS.map((t) => <option key={t.id} value={t.id}>{`${t.label} (${t.style.toLowerCase()})`}</option>)}
        </select>
        <Chevron />
      </label>
    </div>
  );
}
