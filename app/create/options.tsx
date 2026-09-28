'use client';
import { HAZARDS, MUSIC_TRACKS, type Hazards, type MusicTrack, type WorldOptions } from '@/lib/world-options';

const HAZARD_LABEL: Record<Hazards, string> = { fewer: 'Fewer each lap', same: 'The same every lap', more: 'More each lap' };
const Chevron = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden><path d="M5 8 L10 13 L15 8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/**
 * The creator's platform options, on Create and on Mog (the owner, 26 Sep):
 * obstacles each lap, and music (off unless ticked). The runtime enforces
 * them, whatever the world's code says. "Open world" (27 Sep) builds a place
 * to roam and survive in instead of a lap race; the obstacles do not apply.
 */
export function WorldOptionsFields({ value, onChange, disabled }: { value: WorldOptions; onChange: (o: WorldOptions) => void; disabled?: boolean }) {
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
      <label className="ccheck">
        <input type="checkbox" checked={!!value.open} disabled={disabled} onChange={(e) => onChange({ ...value, open: e.target.checked })} />
        <span>Open world</span>
      </label>
      <label className="ccheck">
        <input type="checkbox" checked={!!value.music} disabled={disabled}
          onChange={(e) => onChange({ ...value, music: e.target.checked ? (value.music ?? MUSIC_TRACKS[0].id) : null })} />
        <span>Add music</span>
      </label>
      {value.music && (
        <label className="cselect">
          <span>Track</span>
          <select value={value.music} disabled={disabled} onChange={(e) => onChange({ ...value, music: e.target.value as MusicTrack })}>
            {MUSIC_TRACKS.map((t) => <option key={t.id} value={t.id}>{t.label} ({t.style.toLowerCase()})</option>)}
          </select>
          <Chevron />
        </label>
      )}
    </div>
  );
}
