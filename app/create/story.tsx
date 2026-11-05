'use client';
import { createContext, useContext, useState } from 'react';
import { STORY_CITIES, isStoryCity, type StoryCity } from '@/lib/storykit-site';
import { useGeneration, GenerationProgress, DraftResult } from './generation';
import { ConsentStep, consentOf, type ConsentState } from './consent';
import { Lock, Pin } from './story-show';

/**
 * Story Kit worlds on CREATE and MOG (STORYKIT=on, lib/storykit-site.ts; the owner: CREATE A WORLD picks a city from a
 * dropdown, a Mog keeps its parent's city locked and remixes the story, the people, the cars and the voices).
 *
 *   StoryKitFlag      the server's switch, handed to /create's client page by its layout
 *   StoryCityField    the City dropdown: New York and San Francisco, the cities to come shown and not offered
 *   StoryCityCard     /create's side panel for a story: the city picked and what every story gets
 *   StoryMogComposer  /mog/<story world>: the city as a locked chip, what can change, the idea, the consent step
 *
 * A story build is sent to the build route (app/api/generate, lib/storykit-build.ts) as { prompt, story: { city },
 * consent }; a Mog as { mogOf, prompt, consent }: the server knows the original is a story world and takes its city from
 * it, never from the request. Its show is app/create/story-show.tsx.
 */
const Flag = createContext(false);
export function StoryKitFlag({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <Flag.Provider value={on}>{children}</Flag.Provider>;
}
export function useStoryKit() { return useContext(Flag); }

const Chevron = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden><path d="M5 8 L10 13 L15 8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export function StoryCityField({ value, onChange, disabled }: { value: StoryCity; onChange: (c: StoryCity) => void; disabled?: boolean }) {
  return (
    <label className="cselect skcity">
      <span>City</span>
      <select value={value} disabled={disabled} onChange={(e) => { if (isStoryCity(e.target.value)) onChange(e.target.value); }}>
        {STORY_CITIES.map((c) => <option key={c.id} value={c.id} disabled={!c.ready}>{c.ready ? c.name : `${c.name} (coming soon)`}</option>)}
      </select>
      <Chevron />
    </label>
  );
}

/** What every story world gets, whatever its idea: the side panel's list and the page's rules. */
export const STORY_RULES = [
  { title: 'A real city', text: 'Every mission is on the city\'s own streets, with their real names. You pick the city; its Mogs keep it.' },
  { title: 'Three acts', text: 'A short story of 6 to 9 missions: drives, chases, tails, pick-ups, calls and choices against the clock.' },
  { title: 'Its own people', text: 'Every person is built from a description for this story: body, face, clothes, hair, the way they walk.' },
  { title: 'Its own voices', text: 'Every line is spoken in an invented voice. A line waiting for its recording plays as a subtitle.' },
  { title: 'Its own cars', text: 'The cars are designed for the story, and every mission is one the car it gives you can do.' },
  { title: 'Hour and weather', text: 'Day or night, the season, rain or snow: the city is dressed for the story.' },
  { title: 'Built in your browser', text: 'Your browser forges the people, records the voices and draws the key art, so keep the tab open.' },
  { title: 'Played before it publishes', text: 'A test driver plays every mission through in your browser before it can go live.' },
];

/** Ideas for a story, city by city (the places named are on each city's place list, storykit/pack/cities.ts). */
export const STORY_IDEAS: Record<StoryCity, { title: string; text: string }[]> = {
  ny: [
    { title: 'Night Shift', text: 'A night-shift cab driver in a snowstorm picks up a fare who knows too much. Three calls from a worried grandmother, a grey car that will not let go.' },
    { title: 'The last delivery', text: 'A bike courier turned driver has one night to deliver a sealed envelope from Grand Central to the Lower East Side, and everyone wants it first.' },
    { title: 'Bodega heist', text: 'Two cousins plan the smallest heist in Manhattan: the corner bodega\'s lottery winnings. Their getaway car is their uncle\'s ancient van.' },
    { title: 'Wedding run', text: 'The best man lost the rings. Times Square to the Flatiron in a borrowed limo, with the bride\'s mother on the phone the whole way.' },
    { title: 'Detective\'s rookie', text: 'A tired detective and her overeager rookie tail a black sedan across Midtown on a rainy autumn night.' },
    { title: 'Christmas Eve', text: 'A tow-truck driver tries to get home for Christmas Eve while the whole city breaks down around her. Snow, lights, one last call-out.' },
  ],
  sf: [
    { title: 'Fog line', text: 'A food-truck chef races the fog across San Francisco to cater a tech billionaire\'s party, with a rival truck on her tail.' },
    { title: 'Hill climb', text: 'A retired getaway driver is pulled back for one job: three pick-ups on the steepest hills in the city, before the morning fog lifts.' },
    { title: 'Bay bridge', text: 'A ride-share driver finds a phone in the back seat. Its owner keeps calling, and so does someone who sounds much less friendly.' },
    { title: 'Summer of love', text: 'Two old bandmates reunite for one last gig and have to collect the rest of the band from all over the city in a borrowed camper van.' },
    { title: 'Night market', text: 'A night-market vendor has to get across the city with a stolen recipe book before dawn, with her aunt giving directions by phone.' },
    { title: 'Moving day', text: 'A pair of movers with a rattling truck, a grand piano and a client who keeps changing the address.' },
  ],
};

/** /create's side panel for a story: the city picked, and what every story gets. */
export function StoryCityCard({ city }: { city: StoryCity }) {
  const c = STORY_CITIES.find((x) => x.id === city)!;
  return (
    <aside className="panel cchar skcard">
      <label className="lbl">Your city</label>
      <p className="skcard-name"><Pin />{c.name}</p>
      <p className="dim skcard-note">{c.note}</p>
      <ul className="skcard-list">
        {STORY_RULES.slice(2, 6).map((r) => <li key={r.title}><b>{r.title}</b><span>{r.text}</span></li>)}
      </ul>
      <p className="t-meta dim-2 skcard-desk">Story worlds play on a desktop or laptop browser. Phones come later.</p>
    </aside>
  );
}

const EMPTY_CONSENT: ConsentState = { on: false, names: '', basis: '', adult: false };

/** The consent step, for a story's create (the same step as a Mog's, app/create/consent.tsx). */
export function useStoryConsent() {
  const [consent, setConsent] = useState<ConsentState>(EMPTY_CONSENT);
  return { consent, setConsent, said: consentOf(consent) };
}

const MOG_IDEAS = [
  'Make it a comedy: the driver is a failed magician',
  'Swap the hero for her grandmother',
  'Christmas Eve, in the snow',
  'A new villain with a faster car',
  'Everyone talks like a 1940s gangster',
];

/**
 * /mog/<story world> (STORYKIT=on): the city is the original's, shown as a locked chip with no dropdown; the creator
 * says how their Mog remixes the rest. The page says what can change and what stays.
 */
export function StoryMogComposer({ slug, title, city, cityName, dare }: { slug: string; title: string; city: StoryCity; cityName: string; dare?: string | null }) {
  const gen = useGeneration();
  const [idea, setIdea] = useState('');
  const { consent, setConsent, said } = useStoryConsent();
  const go = () => gen.run({ mogOf: slug, prompt: idea.trim(), consent: said.value });
  return (
    <>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="skmoghead">
          <label className="lbl" htmlFor="idea" style={{ margin: 0 }}>How your Mog remixes it</label>
          <span className="skchip" title="A Mog keeps its original's city" data-city={city}><Lock />{cityName}</span>
        </div>
        <div className="skchange">
          <div>
            <p className="lbl">You can change</p>
            <ul>
              <li>The story and its three acts, the missions and the choices</li>
              <li>The people: new ones, or the same ones remade</li>
              <li>The cars, and who drives what</li>
              <li>The voices and every line</li>
            </ul>
          </div>
          <div>
            <p className="lbl">Stays the same</p>
            <ul>
              <li>The city: {cityName}, street for street</li>
              <li>Whatever you leave alone is kept from {title}, recordings included</li>
            </ul>
          </div>
        </div>
        <textarea id="idea" rows={3} maxLength={600} value={idea}
          placeholder={`One line is enough: how would you retell ${title}?`}
          onChange={(e) => setIdea(e.target.value)} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
          {MOG_IDEAS.map((x) => <button key={x} className="tag" onClick={() => setIdea(x)}>{x}</button>)}
        </div>
        <ConsentStep value={consent} onChange={setConsent} disabled={gen.busy} />
        <button className="btn" onClick={go} disabled={gen.busy || idea.trim().length < 4 || !said.ok}>
          {gen.busy ? 'Mog in progress' : 'Mog it'}
        </button>
      </div>
      <GenerationProgress gen={gen} mode="mog" subject={idea} kind="story" city={cityName} />
      <DraftResult gen={gen} mode="mog" kind="story" parentTitle={title} dare={dare} publishLabel="Publish your Mog" againLabel="Try another take" onAgain={go}
        note={<p className="t-meta dim" style={{ marginBottom: 16 }}>Published, it is listed as a Mog of {title}, in {cityName}, and anyone who has played both can pick the better one.</p>} />
    </>
  );
}
