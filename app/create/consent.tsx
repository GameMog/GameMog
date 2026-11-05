'use client';

/**
 * The consent step (3 Nov, the owner: real people allowed with consent, public figures included, when it is them or
 * they agreed): a Mog that names a real person says who, on what basis, and that they are adults and nothing in it is
 * false and damaging about them. The build route reads it again (lib/episode.ts readConsent) and the gate holds the
 * pack to it; the game's page then carries a small line saying so.
 */
export type ConsentState = { on: boolean; names: string; basis: '' | 'self' | 'permission'; adult: boolean };
/** The consent as the build route reads it (lib/episode.ts readConsent), or not ok while the step is unfinished. */
export function consentOf(c: ConsentState) {
  if (!c.on) return { ok: true as const, value: null };
  const names = c.names.split(',').map((n) => n.trim()).filter(Boolean);
  if (!names.length || names.length > 3 || !names.every((n) => n.length >= 2 && n.length <= 40)) return { ok: false as const, value: null };
  if (!c.basis || !c.adult) return { ok: false as const, value: null };
  return { ok: true as const, value: { names, basis: c.basis, adult: true } };
}
/** `what`: what the creator is making, in the step's words ('Mog', or 'story' on CREATE for a Story Kit world). */
export function ConsentStep({ value, onChange, disabled, what = 'Mog' }: { value: ConsentState; onChange: (c: ConsentState) => void; disabled: boolean; what?: string }) {
  return (
    <fieldset className="consent" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', margin: '0 0 12px' }}>
      <label className="ccheck" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={value.on} disabled={disabled} onChange={(e) => onChange({ ...value, on: e.target.checked })} />
        <span>My {what} names a real person</span>
      </label>
      {value.on && (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <label className="lbl" htmlFor="consent-names" style={{ marginBottom: 0 }}>Their names (up to 3, separated by commas)</label>
          <input id="consent-names" type="text" maxLength={130} value={value.names} disabled={disabled} autoComplete="off" spellCheck={false}
            onChange={(e) => onChange({ ...value, names: e.target.value })} style={{ maxWidth: 420 }} />
          <div role="radiogroup" aria-label="Consent" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <label className="ccheck" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="radio" name="consent-basis" checked={value.basis === 'self'} disabled={disabled} onChange={() => onChange({ ...value, basis: 'self' })} />
              <span>I am this person</span>
            </label>
            <label className="ccheck" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="radio" name="consent-basis" checked={value.basis === 'permission'} disabled={disabled} onChange={() => onChange({ ...value, basis: 'permission' })} />
              <span>I have their permission</span>
            </label>
          </div>
          <label className="ccheck" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', height: 'auto', padding: '12px 14px', lineHeight: 1.4 }}>
            <input type="checkbox" checked={value.adult} disabled={disabled} onChange={(e) => onChange({ ...value, adult: e.target.checked })} style={{ marginTop: 1, flex: '0 0 auto' }} />
            <span>They are adults, and nothing in this {what} presents something false and damaging about them as true.</span>
          </label>
          <p className="t-meta dim" style={{ margin: 0 }}>Anyone else real gets a made-up name. Real companies and brands always do.</p>
        </div>
      )}
    </fieldset>
  );
}

