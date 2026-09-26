import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SiteHeader, SiteFooter } from '../header';
import { pageMeta } from '../seo';

export const metadata = pageMeta({ name: 'Asset library', path: '/library', description: 'The free characters, motion capture and skies every GameMog world is built from, with where each one came from and its licence.' });
export const dynamic = 'force-static';

type Source = { title: string; author: string; license: string; licenseUrl: string; licenseText?: string; homepage: string };
type Asset = { kind: string; title: string; description: string; sources: string[]; derived?: string; meta?: Record<string, unknown>; files: Record<string, { sha256: string; bytes: number }>; bytes: number };

const LICENCE: Record<string, string> = { 'CC0-1.0': 'CC0 1.0 (public domain dedication)', 'LicenseRef-CMU-Mocap': 'Free for all uses (CMU Graphics Lab)' };
const KIND: Record<string, string> = { human: 'Character', hdri: 'Sky', texture: 'Surface', music: 'Music' };
const mb = (b: number) => `${(b / 1e6).toFixed(1)} MB`;

/**
 * The platform's licensed assets, and where every one of them came from.
 * Worlds can only load what is listed here, and the runtime refuses any file
 * whose SHA-256 does not match this list.
 */
export default function Library() {
  const lib = JSON.parse(readFileSync(join(process.cwd(), 'public', 'assets', 'library.json'), 'utf8')) as { sources: Record<string, Source>; assets: Record<string, Asset> };
  const assets = Object.entries(lib.assets);
  return (
    <>
      <SiteHeader on="Library" />
      <main className="wrap prose" style={{ paddingTop: 24, paddingBottom: 60 }}>
        <h1>Asset library</h1>
        <p className="dim" style={{ marginTop: 6 }}>
          Realistic people, motion capture and skies that any GameMog world can use. Every file is
          built from a licensed source, listed here with its author and licence, and checked against
          its SHA-256 each time a game loads it. A world names what it needs in <code>assets</code>;
          nothing else can be loaded.
        </p>

        {assets.map(([id, a]) => (
          <section key={id} className="panel" style={{ marginTop: 16 }}>
            <label className="lbl">{KIND[a.kind] ?? a.kind} &middot; <code>{id}</code> &middot; {mb(a.bytes)} in {Object.keys(a.files).length} files</label>
            <h2 style={{ margin: '2px 0 6px' }}>{a.title}</h2>
            <p>{a.description}</p>
            {a.derived ? <p>{a.derived}</p> : null}
            <p style={{ marginBottom: 4 }}><strong>Built from</strong></p>
            <ul style={{ margin: 0 }}>
              {a.sources.map((s) => (
                <li key={s}>
                  <a href={lib.sources[s].homepage}>{lib.sources[s].title}</a>, {lib.sources[s].author}. Licence:{' '}
                  <a href={lib.sources[s].licenseUrl}>{LICENCE[lib.sources[s].license] ?? lib.sources[s].license}</a>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <h2>Credits</h2>
        <p>
          Bodies, skins, hair, eyebrows, eyelashes and eyes: the MakeHuman project, released under CC0.
          Motion: the CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), created with
          funding from NSF EIA-0196217; the run is subject 9, trial 1, the standing start subject 104,
          trial 53, and the idle and fall subject 90, trial 16. The sprint is our own amplification of
          the captured run. Sky: Joburg Central Sunset by Dimitrios Savva and Greg Zaal, Poly Haven,
          CC0. None of these require credit; we give it anyway.
        </p>
        <p className="dim">
          The raw data is not sold or offered for download as a product. It is converted into these
          assets, which exist to run inside GameMog games.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
