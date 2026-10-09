'use client';
import { useState } from 'react';
import { useGeneration, GenerationProgress, DraftResult } from '../../create/generation';
import { WorldOptionsFields } from '../../create/options';
import type { WorldOptions } from '@/lib/world-options';

const IDEAS = [
  'Set it at night in a thunderstorm',
  'Make the obstacles move and the track twist',
  'Swap the cast for a new crew with their own look',
  'Take it somewhere nobody would expect',
  'Make it look like a toy set on a kitchen table',
];

export function MogComposer({ slug, title, inherited }: { slug: string; title: string; inherited: WorldOptions }) {
  const gen = useGeneration();
  const [idea, setIdea] = useState('');
  // a Mog starts from the original's options; the challenger can change them,
  // all but its kind (an open world stays one, a race stays a race); and on
  // the original's own soundtrack when it has one (lib/world-options.ts
  // optionsOf, 9 Oct), to keep, take out or swap for a library track
  const [options, setOptions] = useState<WorldOptions>(inherited);
  const go = () => gen.run({ mogOf: slug, prompt: idea.trim(), options });
  return (
    <>
      <div className="panel" style={{ marginBottom: 16 }}>
        <label className="lbl" htmlFor="idea">How your Mog beats it</label>
        <textarea id="idea" rows={3} maxLength={600} value={idea}
          placeholder={`One line is enough: what would make ${title} better?`}
          onChange={(e) => setIdea(e.target.value)} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
          {IDEAS.map((x) => <button key={x} className="tag" onClick={() => setIdea(x)}>{x}</button>)}
        </div>
        <WorldOptionsFields value={options} onChange={setOptions} disabled={gen.busy} lockOpen />
        <button className="btn" onClick={go} disabled={gen.busy || idea.trim().length < 4}>
          {gen.busy ? 'Mog in progress' : 'Mog it'}
        </button>
      </div>
      <GenerationProgress gen={gen} mode="mog" subject={idea} open={options.open} />
      <DraftResult gen={gen} publishLabel="Publish your Mog" againLabel="Try another take" onAgain={go}
        note={<p className="t-meta dim" style={{ marginBottom: 16 }}>Published, it is listed as a Mog of {title}, and anyone who has played both can pick the better one.</p>} />
    </>
  );
}
