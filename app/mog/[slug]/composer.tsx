'use client';
import { useState } from 'react';
import { useGeneration, GenerationProgress, DraftResult } from '../../create/generation';
import { WorldOptionsFields } from '../../create/options';
import type { WorldOptions } from '@/lib/world-options';
import type { WorldMode } from '@/lib/custom-game';

const IDEAS = [
  'Set it at night in a thunderstorm',
  'Make the obstacles move and the track twist',
  'Swap the cast for a new crew with their own look',
  'Take it somewhere nobody would expect',
  'Make it look like a toy set on a kitchen table',
];
// a penalty shootout's (13 Oct): a Mog of one changes the world round the kick (the sides and their kits, the stadium,
// the sky and the weather, the crowd, how the keeper looks), never the kick itself (lib/runtime/API.md)
const SHOOTOUT_IDEAS = [
  'A snowy night final in Reykjavik',
  'Make the keeper a chrome robot',
  'Swap the sides: Brazil v Japan',
  'A sunny afternoon final in an old bowl',
  'A thunderstorm under the floodlights',
];
// a Grand Prix's (21 Oct): a Mog of one changes the place's look, the cast and the words (names, liveries, radio,
// the neon), never the racing itself (lib/runtime/API.md "Grand Prix")
const GP_IDEAS = [
  'Ten new teams with their own colours and names',
  'Make the neon green and gold',
  'Give every agent new radio lines with more attitude',
  'Rename the city and its corners',
  'A one-lap sprint',
];

// a Mog City episode's (3 Nov): a Mog changes the words and the looks (names, lines, signs, colours, the difficulty),
// never the missions or the places (lib/runtime/API.md "Mog City episodes")
const EPISODE_IDEAS = [
  'Make it a comedy: every Suit is a failed stand-up',
  'Rename the bank and every sign in the city',
  'Navy suits and blue shirts for the whole crew',
  'Harder fights and a faster getaway',
  'Rewrite Jane as the boss and Dan as her intern',
];

/**
 * The consent step (3 Nov, the owner: real people allowed with consent, public figures included, when it is them or
 * they agreed): a Mog that names a real person says who, on what basis, and that they are adults and nothing in it is
 * false and damaging about them. The build route reads it again (lib/episode.ts readConsent) and the gate holds the
 * pack to it; the game's page then carries a small line saying so.
 */
type ConsentState = { on: boolean; names: string; basis: '' | 'self' | 'permission'; adult: boolean };
function consentOf(c: ConsentState) {
  if (!c.on) return { ok: true as const, value: null };
  const names = c.names.split(',').map((n) => n.trim()).filter(Boolean);
  if (!names.length || names.length > 3 || !names.every((n) => n.length >= 2 && n.length <= 40)) return { ok: false as const, value: null };
  if (!c.basis || !c.adult) return { ok: false as const, value: null };
  return { ok: true as const, value: { names, basis: c.basis, adult: true } };
}
function ConsentStep({ value, onChange, disabled }: { value: ConsentState; onChange: (c: ConsentState) => void; disabled: boolean }) {
  return (
    <fieldset className="consent" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', margin: '0 0 12px' }}>
      <label className="ccheck" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={value.on} disabled={disabled} onChange={(e) => onChange({ ...value, on: e.target.checked })} />
        <span>My Mog names a real person</span>
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
          <label className="ccheck" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={value.adult} disabled={disabled} onChange={(e) => onChange({ ...value, adult: e.target.checked })} style={{ marginTop: 3 }} />
            <span>They are adults, and nothing in this Mog presents something false and damaging about them as true.</span>
          </label>
          <p className="t-meta dim" style={{ margin: 0 }}>Anyone else real gets a made-up name. Real companies and brands always do.</p>
        </div>
      )}
    </fieldset>
  );
}

/**
 * `dare`: the dare this Mog answers, when the challenger came from a dare's "Mog it back" (/mog/<slug>?dare=<id>);
 * carried to the publish and to the dare they send next, so the dare's funnel counts it mogged back. `kind`: the
 * original's kind of game (lib/custom-game.ts worldMode), which its Mog keeps.
 */
export function MogComposer({ slug, title, inherited, dare, kind }: { slug: string; title: string; inherited: WorldOptions; dare?: string | null; kind?: WorldMode }) {
  const gen = useGeneration();
  const [idea, setIdea] = useState('');
  // a Mog starts from the original's options; the challenger can change them,
  // all but its kind (an open world stays one, a race stays a race); and on
  // the original's own soundtrack when it has one (lib/world-options.ts
  // optionsOf, 9 Oct), to keep, take out or swap for a library track
  const [options, setOptions] = useState<WorldOptions>(inherited);
  // (a penalty shootout has none to choose, 13 Oct: no obstacles, no GM, and no music, the crowd is its sound; the
  // build route sets the same for any Mog of one)
  // (a Grand Prix the same, 21 Oct: its engines and its crowd are its sound)
  // (and a Mog City episode, 3 Nov: the city's own sound, no options, and the consent step)
  const shootout = kind === 'shootout', gp = kind === 'gp', episode = kind === 'episode', fixed = shootout || gp || episode;
  const sent: WorldOptions = fixed ? { hazards: 'same', music: null, open: false, coins: inherited.coins } : options;
  const [consent, setConsent] = useState<ConsentState>({ on: false, names: '', basis: '', adult: false });
  const said = consentOf(consent);
  const go = () => gen.run({ mogOf: slug, prompt: idea.trim(), options: sent, ...(episode ? { consent: said.value } : {}) });
  return (
    <>
      <div className="panel" style={{ marginBottom: 16 }}>
        <label className="lbl" htmlFor="idea">How your Mog beats it</label>
        {shootout ? (
          <p className="dim" style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 10, maxWidth: '64ch' }}>
            Change the two sides and their kits, the stadium, the sky and the weather, the crowd, or how the keeper
            looks. The kick, the keeper&apos;s skill and the cameras stay the same in every shootout.
          </p>
        ) : gp ? (
          <p className="dim" style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 10, maxWidth: '64ch' }}>
            Change the teams and their liveries, the agents&apos; names and radio lines, the neon and the light, or the
            city&apos;s name. The cars, the agents&apos; racing and the cameras stay the same in every Grand Prix.
          </p>
        ) : episode ? (
          <p className="dim" style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 10, maxWidth: '64ch' }}>
            Change the episode&apos;s title, the cast&apos;s names and looks, their lines, the signs and the city&apos;s
            names, Dan&apos;s car paint or how hard the fights are. The missions, the places and the game stay Mog City&apos;s.
            Lines you rewrite are read by the player&apos;s browser voice; the rest keep their recordings.
          </p>
        ) : null}
        <textarea id="idea" rows={3} maxLength={600} value={idea}
          placeholder={`One line is enough: what would make ${title} better?`}
          onChange={(e) => setIdea(e.target.value)} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
          {(shootout ? SHOOTOUT_IDEAS : gp ? GP_IDEAS : episode ? EPISODE_IDEAS : IDEAS).map((x) => <button key={x} className="tag" onClick={() => setIdea(x)}>{x}</button>)}
        </div>
        {fixed ? null : <WorldOptionsFields value={options} onChange={setOptions} disabled={gen.busy} lockOpen />}
        {episode && <ConsentStep value={consent} onChange={setConsent} disabled={gen.busy} />}
        <button className="btn" onClick={go} disabled={gen.busy || idea.trim().length < 4 || !said.ok}>
          {gen.busy ? 'Mog in progress' : 'Mog it'}
        </button>
      </div>
      <GenerationProgress gen={gen} mode="mog" subject={idea} open={sent.open} kind={kind} />
      <DraftResult gen={gen} mode="mog" kind={kind} parentTitle={title} dare={dare} publishLabel="Publish your Mog" againLabel="Try another take" onAgain={go}
        note={<p className="t-meta dim" style={{ marginBottom: 16 }}>Published, it is listed as a Mog of {title}, and anyone who has played both can pick the better one.</p>} />
    </>
  );
}
