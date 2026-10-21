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
  const shootout = kind === 'shootout', gp = kind === 'gp', fixed = shootout || gp;
  const sent: WorldOptions = fixed ? { hazards: 'same', music: null, open: false, coins: inherited.coins } : options;
  const go = () => gen.run({ mogOf: slug, prompt: idea.trim(), options: sent });
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
        ) : null}
        <textarea id="idea" rows={3} maxLength={600} value={idea}
          placeholder={`One line is enough: what would make ${title} better?`}
          onChange={(e) => setIdea(e.target.value)} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
          {(shootout ? SHOOTOUT_IDEAS : gp ? GP_IDEAS : IDEAS).map((x) => <button key={x} className="tag" onClick={() => setIdea(x)}>{x}</button>)}
        </div>
        {fixed ? null : <WorldOptionsFields value={options} onChange={setOptions} disabled={gen.busy} lockOpen />}
        <button className="btn" onClick={go} disabled={gen.busy || idea.trim().length < 4}>
          {gen.busy ? 'Mog in progress' : 'Mog it'}
        </button>
      </div>
      <GenerationProgress gen={gen} mode="mog" subject={idea} open={sent.open} kind={kind} />
      <DraftResult gen={gen} mode="mog" kind={kind} parentTitle={title} dare={dare} publishLabel="Publish your Mog" againLabel="Try another take" onAgain={go}
        note={<p className="t-meta dim" style={{ marginBottom: 16 }}>Published, it is listed as a Mog of {title}, and anyone who has played both can pick the better one.</p>} />
    </>
  );
}
