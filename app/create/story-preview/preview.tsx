'use client';
import { useEffect, useState } from 'react';
import { SiteHeader, SiteFooter } from '../../header';
import { StoryShow, portraitOf, type StoryWork, type StoryPerson } from '../story-show';

/** Night Shift's people, missions and a line, as the browser stages would report them (dev preview only). */
const CAST: StoryPerson[] = [
  { id: 'dez', name: 'Dez Amaro', color: '#F2C14E', role: 'Night-shift cab driver', state: 'waiting' },
  { id: 'kwon', name: 'Mrs. Kwon', color: '#E8726A', role: 'The last fare of the night', state: 'waiting' },
  { id: 'ray', name: 'Sgt. Ray Ortega', color: '#86A8E0', role: 'Precinct sergeant', state: 'waiting' },
];
const MISSIONS = [{ id: 'NS-1', title: 'Last Fare' }, { id: 'NS-2', title: 'Snow Tail' }, { id: 'NS-3', title: 'Home Before Dawn' }];
const SUBJECT = 'A night-shift cab driver in a snowstorm picks up a fare who knows too much. Three calls from a worried grandmother, a grey car that will not let go.';

export function StoryPreview({ stage, mode }: { stage: string; mode: 'create' | 'mog' }) {
  const [portraits, setPortraits] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState('');
  const [startedAt] = useState(() => Date.now() - 187_000);
  useEffect(() => {
    let live = true;
    (async () => {
      for (const c of CAST) {
        try {
          const url = await portraitOf(`/storykit/cast/test-night-shift/${c.id}.glb`);
          if (live) setPortraits((p) => ({ ...p, [c.id]: url }));
        } catch (e) { if (live) setFailed((e as Error).message); }
      }
    })();
    return () => { live = false; };
  }, []);
  const withP = (c: StoryPerson, state: StoryPerson['state'], ms?: number): StoryPerson => ({ ...c, state, ms, portrait: state === 'done' || state === 'forging' ? portraits[c.id] : undefined });
  const done = CAST.map((c, i) => withP(c, 'done', [2800, 3400, 3100][i]));
  const work: StoryWork | null =
    stage === 'cast' ? { stage: 'forging', city: 'ny', cast: [withP(CAST[0], 'done', 2800), withP(CAST[1], 'done', 3400), { ...CAST[2], state: 'forging' }] }
    : stage === 'voices' ? { stage: 'voicing', city: 'ny', cast: done, voices: { done: 14, total: 24, line: { who: 'Mrs. Kwon', text: 'Fifty years of books, and a cab driver kept them.' } } }
    : stage === 'drive' ? { stage: 'driving', city: 'ny', cast: done, drive: { missions: [{ ...MISSIONS[0], state: 'passed' }, { ...MISSIONS[1], state: 'driving' }, { ...MISSIONS[2], state: 'waiting' }] } }
    : stage === 'art' ? { stage: 'art', city: 'ny', cast: done, art: { headshot: portraits.dez, hero: 'Dez Amaro' } }
    : null;
  const ready = stage === 'write' || stage === 'check' || CAST.every((c) => portraits[c.id]) || !!failed;
  return (
    <>
      <SiteHeader on="Create" />
      <main className="wrap" style={{ paddingBottom: 80, paddingTop: 24 }}>
        <div data-preview-ready={ready ? '1' : '0'} data-preview-error={failed || undefined}>
          <StoryShow mode={mode} stage={stage === 'check' ? 'checking' : 'writing'} chars={stage === 'write' ? 23000 : 40000}
            startedAt={startedAt} now={Date.now()} story={work} subject={mode === 'mog' ? 'Christmas Eve, in the snow' : SUBJECT} cityName="New York" />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
