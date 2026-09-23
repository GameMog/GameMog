'use client';
import { useState } from 'react';
import { useGeneration, GenerationProgress, DraftResult } from '../../create/generation';

const IDEAS = [
  'Set it at night in a thunderstorm',
  'Make the obstacles move and the track twist',
  'Swap the cast for a new crew with their own look',
  'Take it somewhere nobody would expect',
  'Make it look like a toy set on a kitchen table',
];

export function MogComposer({ slug, title }: { slug: string; title: string }) {
  const gen = useGeneration();
  const [idea, setIdea] = useState('');
  const go = () => gen.run({ mogOf: slug, prompt: idea.trim() });
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
        <button className="btn" onClick={go} disabled={gen.busy || idea.trim().length < 4}>
          {gen.busy ? 'Writing your Mog' : 'Mog it'}
        </button>
      </div>
      <GenerationProgress gen={gen} />
      <DraftResult gen={gen} publishLabel="Publish your Mog" againLabel="Try another take" onAgain={go}
        note={<p className="t-meta dim" style={{ marginBottom: 16 }}>Published, it is listed as a Mog of {title}, and anyone who has played both can pick the better one.</p>} />
    </>
  );
}
