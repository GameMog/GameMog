'use client';
import { useEffect, useRef, useState } from 'react';
import { SiteHeader, SiteFooter, Icon } from '../header';
import { prepareUpload, type CharacterImage } from '@/lib/character';
import { Cover } from '../cover';
import type { WorldSpec } from '@/lib/worldspec';
import { useGeneration, GenerationProgress, DraftResult } from './generation';
import { WorldOptionsFields } from './options';
import { DEFAULT_OPTIONS, type WorldOptions } from '@/lib/world-options';

type Finding = { level: 'error' | 'warn'; code: string; message: string };
type Report = { ok: boolean; findings: Finding[]; stats: Record<string, number> };

/**
 * Sixty ideas to start from, four at a time (the owner, 24 Sep). They turn
 * over on their own every few seconds, shuffled for each visit, and stop
 * while a creator is hovering over them or has started writing their own.
 */
const GAME_IDEAS = [
  { title: "Firefly swamp", text: "Pepe and his frog friends race laps of a firefly swamp at dusk. Mossy logs, lily pads, snapping turtles, a lantern-lit boardwalk." },
  { title: "Snowball village", text: "A snowball rolls laps of a mountain village at night. Snowmen and sleds on the road, warm windows, falling snow." },
  { title: "Gutter regatta", text: "Paper boats race round a rainy city gutter. Floating leaves and bottle caps, drains, neon reflections in the puddles." },
  { title: "Breakfast table", text: "Tiny robots race laps of a breakfast table. Cereal spills, a toast rack, the cat watching from the edge." },
  { title: "Canyon rally", text: "Dune buggies race a red-rock canyon at sunset. Tumbleweeds, rockfalls, a hot-air balloon drifting overhead." },
  { title: "Cherry blossom park", text: "Kids on scooters race round a park in cherry blossom season. Petals in the air, picnic blankets, a koi pond bridge." },
  { title: "Volcano rim", text: "Lizards race the rim of an island volcano. Lava bubbles, black sand, steam vents that burst without warning." },
  { title: "Neon night city", text: "Hoverbikes race a rain-soaked city at 3am. Neon signs, noodle stalls, delivery drones crossing the road." },
  { title: "Haunted manor", text: "Ghosts race the hallways of a haunted manor. Swinging chandeliers, portraits whose eyes follow you, a candle-lit ballroom." },
  { title: "Coral reef", text: "Sea turtles race round a coral reef in bright shallow water. Schools of fish, drifting jellyfish, sunbeams through the waves." },
  { title: "Jungle temple", text: "Explorers race through a jungle temple overgrown with vines. Rolling stones, rope bridges, golden idols." },
  { title: "Harvest farm", text: "Piglets race round a farm at harvest time. Pumpkin patches, hay bales, a tractor crossing the lane." },
  { title: "Polar station", text: "Penguins race round a research station at the South Pole. Ice floes, snowcats, the aurora overhead." },
  { title: "Toy box", text: "Wind-up toys race across a bedroom floor. Building blocks, a train set, a sleepy dog in the way." },
  { title: "Space station ring", text: "Astronauts race round a spinning space station. Floating tools, airlocks, Earth turning past the windows." },
  { title: "Canal city", text: "Gondolas race the canals of a floating city at golden hour. Stone bridges, market boats, pigeons taking off." },
  { title: "Rooftop run", text: "Parkour runners race across rooftops at dusk. Water towers, clotheslines, a flock of pigeons." },
  { title: "Candy kingdom", text: "Gingerbread racers run laps of a candy kingdom. Chocolate rivers, gumdrop hills, lollipop trees." },
  { title: "Dinosaur valley", text: "Baby dinosaurs race through a prehistoric valley. Giant ferns, a sleeping T. rex, bubbling tar pits." },
  { title: "Stadium lights", text: "Sprinters race laps of a packed stadium at night. Camera flashes, waving flags, a flame burning at the far end." },
  { title: "Alpine resort", text: "Snowboarders race round an alpine resort. Chairlifts, pine trees, snow cannons blasting the piste." },
  { title: "Moon base", text: "Rovers race across the Moon. Craters, landers, Earth rising over the horizon." },
  { title: "Medieval market", text: "Knights on donkeys race through a medieval market. Fruit carts, jugglers, a castle on the hill." },
  { title: "Beach boardwalk", text: "Surfers race round a seaside boardwalk. Ice cream carts, seagulls, the pier lights coming on." },
  { title: "Mushroom forest", text: "Snails race through a giant mushroom forest glowing at night. Spore clouds, dewdrops, beetles marching past." },
  { title: "Sunken city", text: "Mermaids race round a sunken city. Bubble streams, statues covered in shells, a curious octopus." },
  { title: "Train yard", text: "Rail workers race through a train yard at dawn. Rolling freight cars, signal lights, drifting steam." },
  { title: "Sky islands", text: "Birds race between floating islands above the clouds. Waterfalls into nothing, windmills, balloons." },
  { title: "Bamboo forest", text: "Pandas race through a misty bamboo forest. Falling leaves, stone lanterns, a quiet stream." },
  { title: "Coastal circuit", text: "Go-karts race a street circuit by the sea. Tyre walls, grandstands, the water glittering past the barriers." },
  { title: "Ice palace", text: "Skaters race round a palace carved from ice. Frozen fountains, crystal chandeliers, snow falling indoors." },
  { title: "Summer garden", text: "Ladybugs race round a vegetable garden at noon. Watering cans, tomato vines, a sprinkler sweeping the path." },
  { title: "Pirate cove", text: "Pirates race round a hidden cove. Treasure chests, cannons, a parrot shouting directions." },
  { title: "Library after hours", text: "Bookworms race through a library after closing. Toppling books, rolling ladders, a snoring librarian." },
  { title: "Savanna sunset", text: "Zebras race across the savanna at sunset. Acacia trees, watering holes, a lion watching from the grass." },
  { title: "Chocolate factory", text: "Robots race along a chocolate factory's conveyor belts. Stirring vats, wrapping machines, falling cocoa beans." },
  { title: "Rainforest canopy", text: "Monkeys race along the treetops of a rainforest. Hanging vines, toucans, a thunderstorm rolling in." },
  { title: "Carnival night", text: "Clowns race round a carnival at night. Carousels, popcorn stands, a Ferris wheel lighting up." },
  { title: "Frozen lake", text: "Huskies pull sleds round a frozen lake under the northern lights. Cracking ice, log cabins, a moose crossing." },
  { title: "Airport at night", text: "Baggage carts race round an airport at night. Taxiing jets, runway lights, a runaway suitcase." },
  { title: "Chariot circus", text: "Chariots race an ancient stadium. Cheering crowds, marble columns, a sudden sandstorm." },
  { title: "Cloud kingdom", text: "Paper planes race through a kingdom in the clouds. Rainbow bridges, cloud castles, a friendly thunderbird." },
  { title: "Aquarium tunnel", text: "Kids race through an aquarium tunnel. Sharks gliding overhead, glass walls, a school trip crowd." },
  { title: "Frontier town", text: "Cowboys race round a dusty frontier town. Saloon doors, tumbleweeds, a train pulling in." },
  { title: "Rush hour crossing", text: "Cats race through a city crossing at rush hour. Umbrellas, taxis, giant video screens overhead." },
  { title: "Glacier lagoon", text: "Seals race round a glacier lagoon. Floating icebergs, calving ice walls, puffins overhead." },
  { title: "Kitchen after hours", text: "Mice race round a restaurant kitchen after closing. Pots and pans, a spilled flour sack, a cheese wheel finish." },
  { title: "Lighthouse storm", text: "Seagulls race round a lighthouse in a storm. Crashing waves, slick rocks, the beam sweeping the sea." },
  { title: "Twilight orchard", text: "Fairies race through an orchard at twilight. Glowing apples, fireflies, a sleepy owl." },
  { title: "Mountain monastery", text: "Goats race round a monastery high in the mountains. Prayer flags, stone steps, clouds below." },
  { title: "Desert oasis", text: "Camels race round a desert oasis. Palm trees, rolling dunes, a caravan passing through." },
  { title: "Future city", text: "Delivery bots race round a city of the future. Flying cars, glass towers, glowing billboards." },
  { title: "Bayou at dawn", text: "Otters race round a bayou at dawn. Cypress roots, airboats, herons taking off." },
  { title: "Board game", text: "Game pieces race round a giant board game. Rolling dice, card piles, a spilled drink." },
  { title: "Castle moat", text: "Ducks race round a castle moat. Drawbridges, archers on the walls, lily pads." },
  { title: "Greenhouse jungle", text: "Chameleons race through a giant greenhouse. Misting pipes, orchids, steamed-up glass." },
  { title: "Harbor festival", text: "Crabs race round a harbor festival. Fishing boats, lanterns on strings, fireworks over the water." },
  { title: "Clockwork city", text: "Clockwork mice race through a city of gears. Turning cogs, steam pipes, a giant swinging pendulum." },
  { title: "Midnight mall", text: "Shopping carts race through an empty mall at midnight. Escalators, fountains, mannequins that seem to move." },
  { title: "Ice oval", text: "Speed skaters race an Olympic oval of mirror ice. Lane blocks, a roaring crowd, rows of lights reflected below." },
];

const RACE_IDEAS = [
  { title: 'Drowned cathedral', text: 'A drowned cathedral city at low tide. Barnacled spires, green glass light, lanterns made of jellyfish.' },
  { title: 'Grandfather clock', text: 'The inside of a grandfather clock. Brass gears the size of hills, dust in the light, everything ticking.' },
  { title: 'Whale night market', text: 'A night market on the back of a sleeping whale. Paper lanterns, steam, warm reds against black water.' },
  { title: 'Dying star orchard', text: 'An orchard on a dying star. White grass, long shadows, fruit that glows because nothing else does.' },
];

/**
 * What the Runtime supplies, so an idea never has to: shown after the idea,
 * because a creator comes to describe a world, not to configure an engine.
 */
const RULES = [
  { title: '3D, from behind', text: 'Every world is 3D, seen from behind your character by the chase camera.' },
  { title: 'Endless laps', text: 'There is no finish line. Your level is the lap you are on.' },
  { title: 'A rival every lap', text: 'One rival lines up beside you. Every lap another joins, faster and meaner than the last.' },
  { title: 'Faster every lap', text: 'You, the whole field and the moving obstacles all speed up together.' },
  { title: 'One touch ends it', text: 'Touch a rival or an obstacle and the run is over.' },
  { title: 'Collect the GM', text: 'Golden GM line the track. The leaderboard ranks the lap reached, then GM.' },
  { title: 'Arrows and Space', text: 'Arrow keys steer and change speed, Space pauses, touch buttons on phones.' },
  { title: 'Raced before it publishes', text: 'A bot plays every new world in a real browser before it can go live.' },
];

type Character = { name: string; fur: string; personality?: string; source?: string };

/** The ideas, four at a time: they turn over on their own, or on request. */
function IdeaDeck({ ideas, value, onPick, still }: { ideas: { title: string; text: string }[]; value: string; onPick: (text: string) => void; still: boolean }) {
  const PER = 4, pages = Math.ceil(ideas.length / PER);
  const [order, setOrder] = useState<number[]>(() => ideas.map((_, i) => i));
  const [page, setPage] = useState(0);
  const [hover, setHover] = useState(false);
  // a fresh shuffle for each visit, after the first paint so the server and the page agree
  useEffect(() => {
    const o = ideas.map((_, i) => i);
    for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
    setOrder(o);
  }, [ideas]);
  useEffect(() => {
    if (hover || still || pages < 2) return;
    const t = setInterval(() => setPage((p) => (p + 1) % pages), 9000);
    return () => clearInterval(t);
  }, [hover, still, pages]);
  const shown = order.slice(page * PER, page * PER + PER).map((i) => ideas[i]).filter(Boolean);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <div className="cideashead">
        <p className="lbl">Or start from one of these</p>
        {pages > 1 && (
          <div className="cideasnav">
            <span className="dim-2">{page + 1} of {pages}</span>
            <button type="button" className="tag" onClick={() => setPage((p) => (p + pages - 1) % pages)} aria-label="Previous ideas">Back</button>
            <button type="button" className="tag" onClick={() => setPage((p) => (p + 1) % pages)}>More ideas</button>
          </div>
        )}
      </div>
      <div className="cideas" aria-live="polite">
        {shown.map((idea) => (
          <button key={idea.title} className={`cideacard${value === idea.text ? ' on' : ''}`} onClick={() => onPick(idea.text)}>
            <b>{idea.title}</b><span>{idea.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Create() {
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<CharacterImage | null>(null);
  const [preview, setPreview] = useState('');
  const [hintFur, setHintFur] = useState('');
  const [charName, setCharName] = useState('');
  const [character, setCharacter] = useState<Character | null>(null);
  const [adjustments, setAdjustments] = useState<string[]>([]);
  const [options, setOptions] = useState<WorldOptions>(DEFAULT_OPTIONS);
  const fileRef = useRef<HTMLInputElement>(null);
  const gen = useGeneration();
  const { busy, error, setError, draft } = gen;
  const [spec, setSpec] = useState<Record<string, unknown> | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [offline, setOffline] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // 'game': Opus writes the whole game. 'race': the tuned rhythm-race template.
  // every future game is a world on the runtime; the race template remains for
  // the worlds already built on it and for running without an API key
  const kind = 'game' as 'game' | 'race';

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError('');
    if (!/^image\/(png|jpeg|jpg|webp|gif)$/.test(file.type)) {
      setError('That needs to be a PNG, JPEG, WebP or GIF.');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError('That image is over 12MB. Try a smaller one.');
      return;
    }
    try {
      // Resized in the browser: a character reference needs no fidelity, and
      // it keeps the upload (and the vision token cost) small.
      const { image: img, preview: p, dominant } = await prepareUpload(file);
      setImage(img); setPreview(p); setHintFur(dominant);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function clearCharacter() {
    setImage(null); setPreview(''); setHintFur(''); setCharName('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function generate() {
    setSpec(null); setReport(null); setCharacter(null); setAdjustments([]);
    const data = await gen.run({
      kind,
      prompt: kind === 'game' && charName ? `${prompt}\n\nThe player's character is called ${charName}.` : prompt,
      image: image ?? undefined,
      hintFur: hintFur || undefined,
      characterName: charName || undefined,
      options,
    }) as { spec?: Record<string, unknown>; report?: Report; offline?: boolean; character?: Character; adjustments?: string[] } | null;
    if (!data) return;
    if (data.spec) {
      setSpec(data.spec); setReport(data.report ?? null); setOffline(!!data.offline);
      setCharacter(data.character ?? null); setAdjustments(data.adjustments ?? []);
    } else if (data.report) setReport(data.report);
  }

  // the race template's spec publishes here; a written world publishes from its draft
  async function publish() {
    if (!spec) return;
    setPublishing(true);
    try {
      const res = await fetch('/api/games', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec, prompt }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Publish failed'); setReport(data.report ?? report); }
      else location.href = `/g/${data.slug}`;
    } finally { setPublishing(false); }
  }

  const meta = spec?.meta as { title?: string; tagline?: string; blurb?: string } | undefined;
  const racers = (spec?.racers ?? []) as { name: string; fur: string }[];

  return (
    <>
      <SiteHeader on="Create" />
      <main className="wrap" style={{ paddingBottom: 80 }}>
        <div className="chead">
          <h1>Create a world</h1>
          <p className="secsub">
            Describe a place and GameMog builds it: the track, the rivals, the obstacles, the light and
            the sound. It goes on the charts, and anyone can Mog it with a better version.
          </p>
        </div>

        <div className="cgrid">
          <section className="panel cidea">
            <label className="lbl" htmlFor="p">Your world</label>
            <textarea
              id="p" rows={6} value={prompt}
              placeholder="Where is the race, who runs it, and what is in the way? Name the place, its light and its obstacles. The more specific, the better."
              onChange={(e) => setPrompt(e.target.value)}
            />
            <WorldOptionsFields value={options} onChange={setOptions} disabled={busy} />
            <div className="cgo">
              <p className="dim-2">You describe the world. The rules below come with it.</p>
              <button className="btn big" onClick={generate} disabled={busy || prompt.trim().length < 8}>
                {busy ? 'Creating your world' : 'Build the world'}
              </button>
            </div>
            <IdeaDeck ideas={kind === 'game' ? GAME_IDEAS : RACE_IDEAS} value={prompt} onPick={setPrompt} still={busy || prompt.trim().length > 0} />
          </section>

          <aside className="panel cchar">
            <label className="lbl">Your character <span className="opt">(optional)</span></label>
            <div
              className={`cdrop${preview ? ' has' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
              style={preview ? { backgroundImage: `url(${preview})` } : undefined}
              role="button" tabIndex={0} aria-label="Add a picture of your character"
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
            >
              {!preview && <span><Icon name="plus" size={28} /><b>Drop a picture</b>or click to choose one</span>}
            </div>
            <input
              type="text" placeholder="Name them (optional)" value={charName}
              onChange={(e) => setCharName(e.target.value.slice(0, 14))}
              style={{ marginTop: 12 }} aria-label="Character name"
            />
            {hintFur ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, lineHeight: 1.5, marginTop: 10 }}>
                <i style={{ width: 22, height: 22, borderRadius: 4, background: hintFur, border: '1px solid var(--line)', flex: '0 0 auto' }} />
                <span className="dim">Read <b>{hintFur}</b> off the body, ignoring the backdrop. The world will move aside rather than let this colour get lost.</span>
              </div>
            ) : (
              <p className="dim" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 10 }}>
                GameMog builds your character from this picture. Without one, it designs its own.
              </p>
            )}
            {preview && (
              <button className="tag" style={{ marginTop: 10 }} onClick={clearCharacter}>Remove</button>
            )}
            <input
              ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </aside>
        </div>

        <GenerationProgress gen={gen} mode="create" subject={prompt} />

        {report && report.findings.length > 0 && (
          <div className="panel" style={{ marginBottom: 16 }}>
            <label className="lbl">Playtest</label>
            {report.findings.map((f, i) => (
              <div key={i} className={`msg ${f.level}`}>
                <b>{f.level}</b><span>{f.message}</span>
              </div>
            ))}
          </div>
        )}

        <DraftResult gen={gen} publishLabel="Publish and get a link" againLabel="Make another" onAgain={generate} />

        {spec && meta && (
          <div className="panel">
            {offline && (
              <div className="msg warn" style={{ marginBottom: 14 }}>
                <b>offline</b>
                <span>The world builder isn&apos;t connected, so this world was generated automatically
                  rather than designed. It is playable but arbitrary.</span>
              </div>
            )}
            <div style={{ borderRadius: 8, overflow: 'hidden', marginBottom: 16, width: 300 }}>
              <Cover spec={spec as unknown as WorldSpec} seed={7} />
            </div>
            {character && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <i style={{ width: 24, height: 24, borderRadius: 4, background: character.fur, border: '1px solid var(--line)' }} />
                <div style={{ fontSize: 14 }}>
                  <b>{character.name}</b> runs this one
                  {character.personality ? <span className="dim">. {character.personality}</span> : null}
                </div>
              </div>
            )}
            {adjustments.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                {adjustments.map((a, i) => (
                  <div key={i} className="msg info"><b>kept</b><span>{a}</span></div>
                ))}
              </div>
            )}
            <h2>{meta.title}</h2>
            <p className="dim" style={{ marginBottom: 10, fontSize: 16 }}>{meta.tagline}</p>
            <p style={{ fontSize: 16, lineHeight: 1.55, marginBottom: 14 }}>{meta.blurb}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
              <span className="tag">{String(spec.difficulty)}</span>
              <span className="tag">{report?.stats.lapMetres}m lap</span>
              <span className="tag">about {report?.stats.estRaceSeconds}s race</span>
              <span className="tag">{racers.length} racers</span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn" onClick={publish} disabled={publishing || !report?.ok}>
                {publishing ? 'Publishing' : 'Publish and get a link'}
              </button>
              <button className="btn outline" onClick={generate} disabled={busy}>Try again</button>
            </div>
          </div>
        )}

        <section className="sec">
          <div className="sechead">
            <div className="sectext">
              <h2 className="sectitle">How every world plays</h2>
              <p className="secsub">The GameMog Runtime supplies the rules, so every world is fair to race and fair to Mog.</p>
            </div>
          </div>
          <ol className="crules">
            {RULES.map((r, i) => (
              <li key={r.title}>
                <span className="n">{String(i + 1).padStart(2, '0')}</span>
                <b>{r.title}</b>
                <span>{r.text}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
