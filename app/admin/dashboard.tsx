'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminBuild, AdminScore, AdminWorld, WorldVisibility, Kpis, McKpis, McStats, Range, Row, Stats } from '@/lib/analytics';
import { repinStory, setScore, setVisibility, signOut } from './actions';
import { LineChart } from './chart';
import { Bar, BlurIn, MorphButton, Num, Segmented, Toasts, useToast, type Busy } from './motion';
import { Palette, type Command } from './palette';
import type { KartReportRow } from '@/lib/kart-report';
import type { PerfAdmin, PerfGroup, PerfSession } from '@/lib/perf';
import type { DareLoop, LoopWindow } from '@/lib/funnel';
import type { StoreUsage } from '@/lib/storykit-store';
import type { StoryReconcileRow, StoryTownRow } from '@/lib/storykit-publish';
import type { BackupsAdmin } from '@/lib/backups';
import type { AdminGame } from '@/lib/admin-games';

/** The Story Kit's store on the owner's screen, only while the switch is on or owner-only (else null: nothing shown). */
export type StoryKitAdmin = StoreUsage & { mode: 'owner' | 'on' };

type Tab = 'overview' | 'dares' | 'games' | 'worlds' | 'builds' | 'names' | 'traffic' | 'mogcity' | 'perf' | 'reports';
const TABS = [
  { id: 'overview', label: 'Overview' }, { id: 'dares', label: 'Dares' }, { id: 'games', label: 'Games' }, { id: 'worlds', label: 'Worlds' }, { id: 'builds', label: 'Builds' },
  { id: 'names', label: 'Names' }, { id: 'traffic', label: 'Traffic' }, { id: 'mogcity', label: 'Mog City' }, { id: 'perf', label: 'Machines' }, { id: 'reports', label: 'Crashes' },
] as const satisfies readonly { id: Tab; label: string }[];
const RANGE_ITEMS = [{ id: '24h', label: '24h' }, { id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }, { id: 'all', label: 'All time' }] as const satisfies readonly { id: Range; label: string }[];
// (All time has no period before it: its numbers say since when instead, Delta)
const RANGE_WORDS: Record<Exclude<Range, 'all'>, string> = { '24h': 'the day before', '7d': 'the week before', '30d': 'the 30 days before' };
const RANGE_COMMANDS: Record<Range, string> = { '24h': 'Show the last 24 hours', '7d': 'Show the last 7 days', '30d': 'Show the last 30 days', all: 'Show all time' };
const since = (at: number) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
// the tabs that follow the range switch
const ranged = (t: Tab) => t === 'overview' || t === 'traffic' || t === 'mogcity' || t === 'perf';

// slots: capacity now (lib/build-limits.ts): the builds running, of the site's cap (BUILD_SLOTS); the builds waiting in
// line, of its length (BUILD_QUEUE_MAX); and the day's spend (Los Angeles's day, running builds at their estimate) against
// its ceiling (BUILD_DAILY_USD)
export type Capacity = { held: number; max: number; queue: number; queueMax: number; spent: number; inFlight: number; perBuild: number; ceiling: number };
// mc: Mog City (mc.gamemog.com), counted apart from everything else here (lib/analytics.ts mcStats)
/** The production town builder's status (lib/hometown-build/server.ts builderStatus), only while HOMETOWN_BUILDER is not off. */
export type TownBuilderAdmin = {
  mode: string; frame: boolean; build: { configured: string | null; current: string | null; learned?: boolean; stale?: string | null; stamp?: string | null; workersReport: string[]; mismatch: boolean };
  workers: { id: string; build: string | null; slots: number; seen: number }[]; slots: number; queue: { prio: number; state: string; n: number; weight: number }[];
  costs: Record<string, { ewmaMs: number; n: number }>;
  /** degraded: built whole with tiles that could not be built laid as flat ground; failed: the job and its error;
   *  pending: picks waiting for the first builder to report its build */
  towns: { byState: { state: string; source: string; n: number }[]; pending?: number;
    degraded?: { n: number; recent: { place: string; name: string | null; absent: number }[] };
    failed?: { place: string; name: string | null; job: string | null; why: string | null }[] };
  canary: { runs: number; mismatches: number }; etaError: { n: number; meanPct: number } | null;
  /** on-demand builders (Render Workflows runs, lib/hometown-build/dispatch.ts); null when HOMETOWN_RUNS is off */
  runs?: { problem?: string; inFlight?: number; maxRuns?: number; byState?: Record<string, number>; plan?: { want: number; ready: number } | null;
    lastError?: { status: number; message: string } | null; holdS?: number } | null;
};
export type AdminData = { stats: Record<Range, Stats>; games: AdminGame[]; worlds: AdminWorld[]; builds: AdminBuild[]; scores: AdminScore[]; active: number; reports: KartReportRow[]; perf?: PerfAdmin | null; slots: Capacity; loop: DareLoop; mc: Record<Range, McStats>; storykit?: StoryKitAdmin | null; towns?: TownBuilderAdmin | null; storyTowns?: StoryTownRow[] | null; backups?: BackupsAdmin | null; reconcile?: StoryReconcileRow[] | null };

export function Dashboard(props: AdminData) {
  return <Toasts><Board {...props} /></Toasts>;
}

const money = (n: number) => `$${n.toFixed(2)}`;
const kindOf = (w: AdminWorld) => (w.format === 'race' ? 'Classic' : w.parent_title ? 'Mog' : 'World');
export function ago(at: number) {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Board({ stats, games, worlds: initialWorlds, builds, scores: initialScores, active, reports, perf = null, slots, loop, mc, storykit = null, towns = null, storyTowns = null, backups = null, reconcile = null }: AdminData) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [range, setRange] = useState<Range>('7d');
  const [worlds, setWorlds] = useState(initialWorlds);
  const [scores, setScores] = useState(initialScores);
  const [palette, setPalette] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  // fresh numbers every minute; the counters spring to them
  useEffect(() => { setWorlds(initialWorlds); }, [initialWorlds]);
  useEffect(() => { setScores(initialScores); }, [initialScores]);
  useEffect(() => { const t = setInterval(() => router.refresh(), 60_000); return () => clearInterval(t); }, [router]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((o) => !o); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);


  // who can open a world: live (listed), link (unlisted: anyone with the link), owner (only this session)
  const visibility = useCallback(async (w: AdminWorld, v: WorldVisibility) => {
    const next = { hidden: v === 'live' ? 0 : 1, unlisted: v === 'link' ? 1 : 0 }, was = { hidden: w.hidden, unlisted: w.unlisted };
    setWorlds((all) => all.map((x) => (x.id === w.id ? { ...x, ...next } : x)));
    try {
      if (!(await setVisibility(w.id, v))) throw new Error('missing');
      toast(v === 'live' ? `${w.title} is live` : v === 'link' ? `${w.title}: anyone with the link can play it` : `${w.title}: only you can open it`);
      router.refresh();
    } catch {
      setWorlds((all) => all.map((x) => (x.id === w.id ? { ...x, ...was } : x)));
      toast('That did not save. Try again.');
    }
  }, [router, toast]);

  const commands = useMemo<Command[]>(() => [
    ...TABS.map((t) => ({ id: `tab-${t.id}`, label: `Go to ${t.label}`, group: 'Tab', always: true, run: () => setTab(t.id) })),
    ...RANGE_ITEMS.map((r) => ({ id: `range-${r.id}`, label: RANGE_COMMANDS[r.id], group: 'Range', always: true, run: () => { setRange(r.id); setTab((t) => (ranged(t) ? t : 'overview')); } })),
    { id: 'refresh', label: 'Refresh the numbers', group: 'Data', always: true, run: () => { router.refresh(); toast('Numbers refreshed'); } },
    ...worlds.flatMap((w) => [
      { id: `pub-${w.id}`, label: `${w.hidden ? 'Make live' : 'Make only-me'} ${w.title}`, group: kindOf(w), run: () => visibility(w, w.hidden ? 'live' : 'owner') },
      { id: `link-${w.id}`, label: `Link only: ${w.title}`, group: kindOf(w), run: () => visibility(w, 'link') },
      { id: `open-${w.id}`, label: `Open ${w.title}`, group: 'Page', run: () => window.open(`/g/${w.slug}`, '_blank', 'noopener') },
    ]),
    { id: 'signout', label: 'Sign out', group: 'Account', always: true, run: async () => { await signOut(); router.refresh(); } },
  ], [worlds, visibility, router, toast]);

  const s = stats[range];
  const hiddenCount = worlds.filter((w) => w.hidden).length;

  return (
    <div className="adm">
      <header className="adm-top">
        <div className="adm-row">
          <Link href="/" className="adm-mark" aria-label="GameMog home">GameMog<span>Admin</span></Link>
          <button ref={trigger} type="button" className="adm-k" onClick={() => setPalette(true)} aria-label="Open the command menu">
            <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden><circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" fill="none" /><path d="M13.5 13.5 L17.5 17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            <span className="adm-k-t">Search or jump to</span><kbd>&#8984;K</kbd>
          </button>
          <span className="adm-live" title="People on the site in the last five minutes"><i />{active} now</span>
          <button type="button" className="adm-out" onClick={async () => { await signOut(); router.refresh(); }}>Sign out</button>
        </div>
        <div className="adm-row adm-nav">
          <Segmented label="Sections" items={TABS} value={tab} onChange={setTab} counts={{ games: games.length, worlds: worlds.length, builds: builds.length }} />
          {ranged(tab) && <Segmented label="Range" pill items={RANGE_ITEMS} value={range} onChange={setRange} />}
        </div>
      </header>

      <main className="adm-main">
        <BlurIn k={ranged(tab) ? `${tab}-${range}` : tab}>
          {tab === 'overview' && <Overview s={s} slots={slots} storykit={storykit} towns={towns} storyTowns={storyTowns} backups={backups} reconcile={reconcile} />}
          {tab === 'dares' && <Dares loop={loop} />}
          {tab === 'games' && <Games games={games} />}
          {tab === 'worlds' && <Worlds worlds={worlds} hidden={hiddenCount} visibility={visibility} />}
          {tab === 'builds' && <Builds builds={builds} titles={new Map(worlds.map((w) => [w.slug, w.title]))} />}
          {tab === 'names' && <Names scores={scores} setScores={setScores} />}
          {tab === 'traffic' && <Traffic s={s} />}
          {tab === 'mogcity' && <MogCity m={mc[range]} />}
          {tab === 'perf' && <Machines range={range} initial={perf} />}
          {tab === 'reports' && <Reports reports={reports} />}
        </BlurIn>
      </main>

      <Palette open={palette} onClose={() => setPalette(false)} commands={commands} anchor={trigger} />
    </div>
  );
}

/* ------------------------------------------------------------ overview -- */
function Delta({ now, before, range, from }: { now: number; before: number | null; range: Range; from: number }) {
  if (range === 'all' || before === null) return <p className="kpi-d" title={`Everything recorded since ${since(from)}`}>Since launch</p>;
  if (!before && !now) return <p className="kpi-d">None in {RANGE_WORDS[range]} either</p>;
  if (!before) return <p className="kpi-d">New this period</p>;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <p className="kpi-d">Same as {RANGE_WORDS[range]}</p>;
  return (
    <p className="kpi-d">
      <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden><path d={pct > 0 ? 'M5 1 L9.5 8.5 H0.5 Z' : 'M5 9 L9.5 1.5 H0.5 Z'} fill="currentColor" /></svg>
      {Math.abs(pct)}% {pct > 0 ? 'up' : 'down'} on {RANGE_WORDS[range]}
    </p>
  );
}

function Kpi({ label, k, s, format, hint }: { label: string; k: keyof Kpis; s: Stats; format?: (n: number) => string; hint?: string }) {
  return (
    <div className="kpi" title={hint}>
      <p className="kpi-l">{label}</p>
      <p className="kpi-n"><Num value={s.now[k]} format={format} /></p>
      <Delta now={s.now[k]} before={s.before ? s.before[k] : null} range={s.range} from={s.from} />
    </div>
  );
}

function Overview({ s, slots, storykit, towns, storyTowns, backups, reconcile }: { s: Stats; slots: AdminData['slots']; storykit: StoryKitAdmin | null; towns: TownBuilderAdmin | null; storyTowns: StoryTownRow[] | null; backups: BackupsAdmin | null; reconcile: StoryReconcileRow[] | null }) {
  const n = s.now;
  const funnel = [
    { label: 'Visited', value: n.visitors },
    { label: 'Opened a game', value: n.gameViewers },
    { label: 'Pressed Play', value: n.starters },
    { label: 'Finished a run', value: n.finishers },
  ];
  return (
    <>
      <section className="kpis">
        <Kpi label="Visitors" k="visitors" s={s} hint="Browsers that opened at least one page" />
        <Kpi label="Page views" k="views" s={s} />
        <Kpi label="Pressed Play" k="starters" s={s} hint="Visitors who pressed a game's Play button" />
        <Kpi label="Finished a run" k="finishers" s={s} hint="Players who finished a run, unassisted" />
        <Kpi label="Builds" k="builds" s={s} hint="Worlds and Mogs the builder finished, pass or fail" />
        <Kpi label="Published" k="published" s={s} hint="New games on the site, Mogs included" />
        <Kpi label="Avg build" k="buildMinutes" s={s} format={(v) => `${v.toFixed(1)} min`} hint="Time to a playable draft" />
        <Kpi label="API spend" k="spend" s={s} format={money} hint="The tokens every pass used, priced, since 9 Oct; builds before then estimated from their time. The Anthropic Console has the bill" />
      </section>

      <CapacityCard c={slots} />
      {storykit && <StoryKitCard k={storykit} />}
      {reconcile && <StoryReconcileCard rows={reconcile} />}
      {towns && <TownBuilderCard t={towns} />}
      {storyTowns && storyTowns.some((r) => r.state !== 'current' || r.gap) && <StoryTownsCard rows={storyTowns} />}
      <BackupsCard b={backups} />

      <section className="card">
        <div className="card-h">
          <h2>Visitors and page views</h2>
          <p className="legend"><span><i className="k visitors" />Visitors</span><span><i className="k views" />Page views</span></p>
        </div>
        <LineChart points={s.series} bucket={s.bucket} k={s.range} />
      </section>

      <div className="two">
        <section className="card">
          <div className="card-h"><h2>From visit to finish line</h2></div>
          <ol className="funnel">
            {funnel.map((f, i) => (
              <li key={f.label}>
                <div className="fn-t"><span>{f.label}</span><b><Num value={f.value} /></b></div>
                <div className="track"><Bar share={n.visitors ? f.value / n.visitors : 0} delay={i * 0.07} /></div>
                {i > 0 && <p className="fn-c">{funnel[i - 1].value ? `${Math.round((f.value / funnel[i - 1].value) * 100)}% of the step before` : 'No one reached the step before'}</p>}
              </li>
            ))}
          </ol>
        </section>
        <section className="card">
          <div className="card-h"><h2>Creation</h2></div>
          <dl className="facts">
            <div><dt>Opened Create</dt><dd><Num value={n.createViewers} /></dd></div>
            <div><dt>Builds finished</dt><dd><Num value={n.builds} /></dd></div>
            <div><dt>Built cleanly</dt><dd>{n.builds ? `${Math.round((n.buildsOk / n.builds) * 100)}%` : 'None yet'}</dd></div>
            <div><dt>Published</dt><dd><Num value={n.published} />{n.mogs ? <small> incl. {n.mogs} Mog{n.mogs === 1 ? '' : 's'}</small> : null}</dd></div>
            <div><dt>Left before the end</dt><dd><Num value={n.abandoned} /><small> stopped when the creator left</small></dd></div>
            <div><dt>Stopped by a restart</dt><dd><Num value={n.interrupted} /></dd></div>
            {/* every build the spend counts, those still running included (their passes so far are in it) */}
            <div><dt>Spend per build</dt><dd>{n.builds + n.abandoned + n.interrupted + n.running ? money(n.spend / (n.builds + n.abandoned + n.interrupted + n.running)) : '$0.00'}</dd></div>
          </dl>
          <p className="fine">Since 9 Oct spend is what each pass of each build really used, priced per token{n.spendEstimated > 0 ? `; ${money(n.spendEstimated)} of it is from older builds, estimated from how long they wrote for (about $0.11 a minute for a world and $0.17 for a Mog)` : ''}. A build the creator left stops at once, and costs only what it had written. Your Anthropic Console has the exact bill.</p>
        </section>
      </div>
    </>
  );
}

/** Builds now and today's spend, at a glance: what the build limits are holding (lib/build-limits.ts). */
function CapacityCard({ c }: { c: Capacity }) {
  const share = c.ceiling > 0 ? Math.min(1, c.spent / c.ceiling) : 1;
  const resting = c.spent >= c.ceiling;
  return (
    <section className="card">
      <div className="card-h"><h2>Capacity now</h2></div>
      <dl className="facts">
        <div><dt>Building</dt><dd>{c.held} of {c.max}<small> slots in use</small></dd></div>
        <div><dt>In line</dt><dd>{c.queue}<small> waiting, up to {c.queueMax}</small></dd></div>
        <div><dt>Spent today</dt><dd>{money(c.spent)} of {money(c.ceiling)}<small>{resting ? ' resting until midnight, Los Angeles time' : ` ${money(Math.max(0, c.ceiling - c.spent))} left`}</small></dd></div>
      </dl>
      <div className="track" aria-hidden style={{ marginTop: 12 }}><Bar share={share} /></div>
      <p className="fine">Los Angeles day. Running builds count {money(c.perBuild)} each until they cost more{c.inFlight > 0 ? ` (${money(c.inFlight)} now)` : ''}. At the ceiling no new build starts and the line is let go; running builds finish.</p>
    </section>
  );
}

// the Story Kit's world store (lib/storykit-store.ts): what it holds against its disk, and its size guard (new story
// worlds stop at the guard; published ones are kept for ever, so the store only grows)
const mb = (n: number) => `${(n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0)} MB`;
function StoryKitCard({ k }: { k: StoryKitAdmin }) {
  const pctOf = Math.round(k.share * 100), guardPct = Math.round((k.guard / Math.max(1, k.disk)) * 100);
  return (
    <section className="card">
      <div className="card-h"><h2>Story Kit store</h2></div>
      <dl className="facts">
        <div><dt>Switch</dt><dd>{k.mode === 'owner' ? 'Owner only' : 'On for everyone'}</dd></div>
        <div><dt>Stored</dt><dd>{mb(k.used)} of {mb(k.disk)}<small> {pctOf}% used, {k.blobs} files</small></dd></div>
        <div><dt>Published worlds</dt><dd>{k.kept}<small> {mb(k.keptBytes)}, kept for ever</small></dd></div>
        <div><dt>Drafts</dt><dd>{k.open}<small> open now, {k.today} opened in 24 h</small></dd></div>
      </dl>
      <div className="track" aria-hidden style={{ marginTop: 12 }}><Bar share={Math.min(1, k.share)} /></div>
      <p className="fine">{k.guarded
        ? `New story worlds are paused: the store is past its guard (${guardPct}% of ${mb(k.disk)}). Published worlds still play. Raise STORYKIT_DISK_MB if the disk has room, or move the store off the disk.`
        : `New story worlds stop at ${guardPct}% (${mb(k.guard)}), ${mb(Math.max(0, k.guard - k.used))} from now; drafts already open can finish. STORYKIT_DISK_MB sets the size.`}</p>
      <p className="fine">A published story world with no key art (its test drive never played it): <a href="/storykit/keyart.html">take its key art</a> in this browser.</p>
      <p className="fine">A published story world whose lines have no voice (every hometown story before 14 Nov): <a href="/storykit/revoice.html">record its voices</a> in this browser.</p>
    </section>
  );
}

// the story reconcile (lib/storykit-publish.ts storyReconcile): a listed story game the store does not hold whole and
// kept, and a kept world no game plays
const RECONCILE_KIND: Record<StoryReconcileRow['kind'], string> = { missing: 'Draft missing', unkept: 'Not kept', 'no-world': 'World file missing', orphan: 'Kept, no game' };
function StoryReconcileCard({ rows }: { rows: StoryReconcileRow[] }) {
  return (
    <section className="card">
      <div className="card-h"><h2>Story reconcile</h2></div>
      {rows.length === 0
        ? <p className="fine">Every published story world is kept in the store with the world file it plays, and every kept world has its game.</p>
        : (
          <ul className="fine">
            {rows.map((r) => (
              <li key={`${r.kind}-${r.storeId}-${r.gameId}`}><b>{RECONCILE_KIND[r.kind]}</b>{' '}{r.slug ? <a href={`/g/${r.slug}`}>{r.title ?? r.slug}</a> : <code>{r.storeId}</code>}{r.hidden ? ' (hidden)' : ''}: {r.words}</li>
            ))}
          </ul>
        )}
    </section>
  );
}

// the nightly snapshot of the live data (lib/backups.ts, deploy/backups.mjs) and the owner's off-disk copy of it: the
// catalog, the Story Kit store and the town queue, with every file the published story worlds use
function BackupsCard({ b }: { b: BackupsAdmin | null }) {
  return (
    <section className="card">
      <div className="card-h"><h2>Backups</h2></div>
      {b ? (
        <dl className="facts">
          <div><dt>Newest snapshot</dt><dd>{b.day}<small> {b.games ?? '?'} games, {mb(b.bytes)} of databases</small></dd></div>
          <div><dt>Story files</dt><dd>{b.blobs}<small> {mb(b.blobBytes)}, the published story worlds'</small></dd></div>
          <div><dt>On the disk</dt><dd>{b.count}<small> daily snapshots, the last 7 kept</small></dd></div>
        </dl>
      ) : <p className="fine">No snapshot on the disk yet: the nightly job takes the first one (data/backups), or the download below takes one now.</p>}
      <p className="fine"><a href="/api/admin/backup" download>Download the newest backup</a> (a .tar.gz of the snapshot and the story files) and keep it off this disk. <code>node deploy/restore.mjs</code> puts it back on a new disk. The snapshots share the server&apos;s one disk, so check Render&apos;s own disk snapshots on the dashboard too.{b && !b.nightly ? ' The nightly job is off on this server (GAMEMOG_BACKUPS).' : ''}</p>
    </section>
  );
}

// the published hometown story worlds pinned to an older build of their town (lib/storykit-upgrade.ts): those that play
// the current whole town anyway, those kept on their pinned build and why, and a one-click re-pin that gates the pack
// against the new build before anything changes (actions.ts repinStory)
const STORY_STATE: Record<StoryTownRow['state'], string> = { current: 'Current', waiting: 'Waiting', upgrade: 'Plays the new town', held: 'Kept on its build', unknown: 'Unknown' };
function StoryTownsCard({ rows: initial }: { rows: StoryTownRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<Record<string, string>>({});
  useEffect(() => { setRows(initial); }, [initial]);
  const repin = async (r: StoryTownRow) => {
    setBusy(r.slug);
    try {
      const x = await repinStory(r.slug);
      setSaid((m) => ({ ...m, [r.slug]: x.ok ? `Re-pinned to ${x.build}.${x.notes?.length ? ` Notes: ${x.notes.join('; ')}` : ''}` : `Not re-pinned: ${x.error}${x.problems?.length ? ` ${x.problems.join(' | ')}` : ''}` }));
      if (x.ok) { setRows((all) => all.map((y) => (y.slug === r.slug ? { ...y, state: 'current', pinned: x.build ?? y.pinned, why: [], words: `plays its own build (${x.build})` } : y))); router.refresh(); }
    } catch (e) { setSaid((m) => ({ ...m, [r.slug]: `Not re-pinned: ${String((e as Error)?.message ?? e)}` })); }
    finally { setBusy(null); }
  };
  const shown = rows.filter((r) => r.state !== 'current' || r.gap);
  return (
    <section className="card">
      <div className="card-h"><h2>Story towns</h2></div>
      <table className="lt">
        <thead><tr><th>Story</th><th>Pinned</th><th>Now</th><th /></tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.slug}>
              <td><a href={`/g/${r.slug}`}>{r.title}</a>{r.hidden ? <small> hidden</small> : null}</td>
              <td><small>{r.pinned}</small></td>
              <td>{STORY_STATE[r.state]}<small> {r.state === 'held' ? r.why.join('; ') : r.state === 'upgrade' ? `the whole town at ${r.build}${r.notes.length ? `; ${r.notes.join('; ')}` : ''}` : r.state === 'waiting' ? `${r.build}: its whole town is not built yet` : ''}</small>{r.gap ? <p className="fine"><strong>{r.gap.words}</strong>{r.gap.places.length ? `: ${r.gap.places.join(', ')}` : ''}</p> : null}{said[r.slug] ? <p className="fine">{said[r.slug]}</p> : null}</td>
              <td>{(r.state === 'held' || r.state === 'upgrade') && <button type="button" className="adm-out" disabled={busy === r.slug} onClick={() => repin(r)}>{busy === r.slug ? 'Checking' : `Re-pin to ${r.build}`}</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fine">A story pinned to an older build plays its town&apos;s current whole town by itself when every place it uses is the same place there (same kind, within 30 m). Kept on its build: a place moved or became another place. Re-pin checks the story against the new build&apos;s map and the place rules first; nothing changes unless it passes, and the old world is kept. District only: a story published while its town&apos;s whole town was not built (or failed) plays the spawn district, and the places listed are not on its map until the whole town is built; delist it from Worlds to fix.</p>
    </section>
  );
}

// the production town builder (lib/hometown-build): the workers and their slots, the queue by priority, the build the
// workers report against HOMETOWN_BUILD, the job costs, the determinism canary and the wait estimate's error
const PRIO = ['P0 spawn path', 'P1 rest of town', 'P2 far + bundles', 'P3 rebuilds', 'P4', 'P5 pre-warm'];
function TownBuilderCard({ t }: { t: TownBuilderAdmin }) {
  const byPrio = new Map<number, { queued: number; leased: number }>();
  for (const r of t.queue) { const x = byPrio.get(r.prio) ?? { queued: 0, leased: 0 }; if (r.state === 'leased') x.leased += r.n; else x.queued += r.n; byPrio.set(r.prio, x); }
  const towns = (st: string) => t.towns.byState.filter((r) => r.state === st).reduce((a, r) => a + r.n, 0);
  return (
    <section className="card">
      <div className="card-h"><h2>Town builder</h2></div>
      <dl className="facts">
        <div><dt>Switch</dt><dd>{t.mode === 'owner' ? 'Owner only' : 'On for everyone'}<small>{t.frame ? ' spawn first (frame)' : ' whole town'}</small></dd></div>
        <div><dt>Workers</dt><dd>{t.workers.length}<small> {t.slots} slots live</small></dd></div>
        {t.runs && <div><dt>Runs</dt><dd>{t.runs.problem ? 'not starting' : `${t.runs.inFlight ?? 0} in flight`}<small>{t.runs.problem ? ` ${t.runs.problem}` : ` of ${t.runs.maxRuns} at most; wants ${t.runs.plan?.want ?? 0} for ${t.runs.plan?.ready ?? 0} ready jobs, ${t.runs.byState?.completed ?? 0} done${t.runs.lastError ? `; last error HTTP ${t.runs.lastError.status}${t.runs.holdS ? `, waiting ${t.runs.holdS} s` : ''}` : ''}`}</small></dd></div>}
        <div><dt>Build</dt><dd>{t.build.current ?? (t.build.learned === false ? 'learning' : 'none')}<small>{t.build.mismatch ? ` workers report ${t.build.workersReport.join(', ')}: not HOMETOWN_BUILD` : t.build.configured ? ' HOMETOWN_BUILD' : t.build.learned === false ? ` a new workflow deploy: a run is started to learn its build${t.build.stale ? ` (built towns keep playing at ${t.build.stale})` : ''}` : ' learned from the runs'}</small></dd></div>
        <div><dt>Towns</dt><dd>{towns('full')} built<small> {towns('asked') + towns('framing') + towns('district') + towns('growing')} building, {towns('failed')} failed{t.towns.degraded?.n ? `, ${t.towns.degraded.n} with flat patches` : ''}{t.towns.pending ? `, ${t.towns.pending} waiting for a builder to start` : ''}</small></dd></div>
        <div><dt>Canary</dt><dd>{t.canary.mismatches ? `${t.canary.mismatches} MISMATCH` : 'clean'}<small> {t.canary.runs} recompiled elsewhere</small></dd></div>
        <div><dt>Wait estimate</dt><dd>{t.etaError ? `${t.etaError.meanPct}% off` : 'no data yet'}<small>{t.etaError ? ` over ${t.etaError.n} towns` : ''}</small></dd></div>
      </dl>
      <table className="lt" style={{ marginTop: 12 }}>
        <thead><tr><th>Queue</th><th>Waiting</th><th>Running</th></tr></thead>
        <tbody>{[...byPrio].sort((a, b) => a[0] - b[0]).map(([p, x]) => <tr key={p}><td>{PRIO[p] ?? `P${p}`}</td><td>{x.queued}</td><td>{x.leased}</td></tr>)}</tbody>
      </table>
      <p className="fine">Job time (moving average): {Object.entries(t.costs).map(([k, c]) => `${k} ${(c.ewmaMs / 1000).toFixed(1)} s (${c.n})`).join(', ') || 'none yet'}.</p>
      {!!t.towns.degraded?.recent.length && <p className="fine">Built with flat patches (map tiles that could not be built): {t.towns.degraded.recent.map((d) => `${d.name ?? d.place} (${d.absent} tile${d.absent === 1 ? '' : 's'})`).join(', ')}.</p>}
      {!!t.towns.failed?.length && <p className="fine">Not built: {t.towns.failed.slice(0, 5).map((f) => `${f.name ?? f.place}${f.why ? `: ${f.why.slice(0, 120)}` : ''}`).join('; ')}.</p>}
    </section>
  );
}

/* --------------------------------------------------------------- dares -- */
// the dare loop (lib/funnel.ts): the owner's success numbers and the dare funnel, today (Los Angeles) beside the last 7
// days, and the dares most opened this week. Read-only; a % is of the row above
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '');
const STEPS: { label: string; n: (w: LoopWindow) => number; of?: (w: LoopWindow) => string; hint?: string }[] = [
  { label: 'Dares sent', n: (w) => w.sent },
  { label: 'Opened', n: (w) => w.opened, of: (w) => pct(w.sentOpened, w.sent), hint: 'People who opened a dare; the % is of the dares sent that someone opened' },
  { label: 'Pressed Play', n: (w) => w.played, of: (w) => pct(w.played, w.opened) },
  { label: 'Finished', n: (w) => w.finished, of: (w) => pct(w.finished, w.played) },
  { label: 'Beat the dare', n: (w) => w.beaten, of: (w) => pct(w.beaten, w.finished) },
  { label: 'Mogged back', n: (w) => w.moggedBack, hint: 'Dared players who answered with a dare on their own Mog of the game' },
  { label: 'Shared', n: (w) => w.shared, hint: 'Dare links shared or copied, the sender\'s included' },
  { label: 'Sent their own', n: (w) => w.passedOn, of: (w) => pct(w.passedOn, w.recipients), hint: 'People who opened a dare and then sent one of their own; the % is of everyone who opened one' },
];

function Tile({ label, hint, value, format, sub }: { label: string; hint: string; value: number; format?: (n: number) => string; sub: string }) {
  return (
    <div className="kpi" title={hint}>
      <p className="kpi-l">{label}</p>
      <p className="kpi-n"><Num value={value} format={format} /></p>
      <p className="kpi-d">{sub}</p>
    </div>
  );
}

function Dares({ loop }: { loop: DareLoop }) {
  const { today: t, week: w, top } = loop;
  const raced = (x: LoopWindow) => (x.recipients ? (x.racers / x.recipients) * 100 : 0);
  return (
    <>
      <section className="kpis five">
        <Tile label="First races" value={w.firstRaces} sub={`${t.firstRaces} today`} hint="Players whose first finished run ever was in the last 7 days" />
        <Tile label="Replayed" value={w.replayers} sub={`${t.replayers} today`} hint="Players who finished a game they had already finished" />
        <Tile label="Mogs published" value={w.mogs} sub={`${t.mogs} today`} hint="Mogs players published" />
        <Tile label="Links shared" value={w.shared} sub={`${t.shared} today`} hint="Dare links shared or copied, once per person and dare" />
        <Tile label="Dared players who raced" value={raced(w)} format={(v) => (w.recipients ? `${Math.round(v)}%` : 'None yet')}
          sub={w.recipients ? `${w.racers} of ${w.recipients}${t.recipients ? ` · ${pct(t.racers, t.recipients)} today` : ''}` : 'No one opened a dare yet'}
          hint="People who opened a dare and pressed Play on it" />
      </section>
      <p className="fine">Last 7 days, with today below each number.</p>

      <div className="two">
        <section className="card">
          <div className="card-h"><h2>Dare loop</h2></div>
          <table className="lt">
            <thead><tr><th scope="col" aria-label="Step" /><th scope="col">Today</th><th scope="col">7 days</th></tr></thead>
            <tbody>
              {STEPS.map((s) => (
                <tr key={s.label} title={s.hint}>
                  <th scope="row">{s.label}</th>
                  {[t, w].map((x, i) => <td key={i}><b>{s.n(x).toLocaleString('en-US')}</b><small>{s.of?.(x) ?? ''}</small></td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fine">From the people who opened a dare in each window, and how far they got. A % is of the row above; Sent their own is of everyone who opened one. Senders&apos; own plays are not counted.</p>
        </section>
        <section className="card flush">
          <div className="tools"><p className="tools-t">Most opened dares, last 7 days</p></div>
          <ul className="rows">
            {top.map((d) => (
              <li key={d.id} className={d.hidden ? 'row off' : 'row'}>
                <div className="row-m">
                  <p className="row-t"><Link href={d.url} target="_blank">{d.title}</Link>{d.hidden ? <span className="chip">Hidden</span> : null}</p>
                  <p className="row-s">{d.name ?? 'No name'}{d.message ? `: ${d.message}` : ''}</p>
                  <p className="row-n">{d.opened} opened · {d.played} pressed Play · {d.beaten} beat it · sent {ago(d.createdAt)}</p>
                </div>
              </li>
            ))}
            {!top.length && <li className="none">No dares opened in the last 7 days.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}

/* --------------------------------------------------------------- games -- */
// every game, hidden ones too, with the plays, players, likes and Mogs the public pages showed until 23 Nov (lib/admin-games.ts:
// the same functions); ranked by plays, sorted by any column, filtered by text, and downloaded as the CSV of the rows shown
type GameCol = { id: keyof AdminGame | 'rank'; label: string; left?: boolean; total?: boolean; show: (g: AdminGame, i: number) => React.ReactNode; csv: (g: AdminGame, i: number) => string | number };
const day = (at: number) => new Date(at).toISOString().slice(0, 10);
const yes = (b: boolean) => (b ? 'yes' : '');
const GAME_COLS: GameCol[] = [
  { id: 'rank', label: '#', show: (_, i) => i + 1, csv: (_, i) => i + 1 },
  { id: 'title', label: 'Title', left: true, show: (g) => <Link href={`/g/${g.slug}`} target="_blank">{g.title}</Link>, csv: (g) => g.title },
  { id: 'slug', label: 'Slug', left: true, show: (g) => g.slug, csv: (g) => g.slug },
  { id: 'plays', label: 'Plays', total: true, show: (g) => g.plays.toLocaleString('en-US'), csv: (g) => g.plays },
  { id: 'players', label: 'Players', total: true, show: (g) => g.players.toLocaleString('en-US'), csv: (g) => g.players },
  { id: 'up', label: 'Likes', total: true, show: (g) => g.up, csv: (g) => g.up },
  { id: 'down', label: 'Dislikes', total: true, show: (g) => g.down, csv: (g) => g.down },
  { id: 'likePct', label: 'Like %', show: (g) => (g.likePct === null ? '-' : `${g.likePct}%`), csv: (g) => g.likePct ?? '' },
  { id: 'mogs', label: 'Mogs', total: true, show: (g) => g.mogs, csv: (g) => g.mogs },
  { id: 'generation', label: 'Gen', show: (g) => g.generation, csv: (g) => g.generation },
  { id: 'parent', label: 'Mog of', left: true, show: (g) => g.parent ?? '', csv: (g) => g.parent ?? '' },
  { id: 'created_at', label: 'Created', show: (g) => day(g.created_at), csv: (g) => day(g.created_at) },
  { id: 'genre', label: 'Genre', left: true, show: (g) => g.genre, csv: (g) => g.genre },
  { id: 'mode', label: 'Mode', left: true, show: (g) => g.mode, csv: (g) => g.mode },
  { id: 'city', label: 'City / town', left: true, show: (g) => g.city ?? '', csv: (g) => g.city ?? '' },
  { id: 'hidden', label: 'Hidden', left: true, show: (g) => (g.hidden ? (g.unlisted ? 'link only' : 'hidden') : ''), csv: (g) => (g.hidden ? (g.unlisted ? 'link only' : 'hidden') : '') },
  { id: 'firstParty', label: 'First-party', left: true, show: (g) => yes(g.firstParty), csv: (g) => yes(g.firstParty) },
];
const cell = (v: string | number) => { const t = String(v); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

function Games({ games }: { games: AdminGame[] }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ by: GameCol['id']; desc: boolean }>({ by: 'plays', desc: true });
  // the rank is the plays rank, whatever the sort
  const ranked = useMemo(() => new Map([...games].sort((a, b) => b.plays - a.plays || b.created_at - a.created_at).map((g, i) => [g.id, i])), [games]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const shown = games.filter((g) => !needle || `${g.title} ${g.slug} ${g.genre} ${g.mode} ${g.city ?? ''} ${g.parent ?? ''}`.toLowerCase().includes(needle));
    const key = (g: AdminGame) => (sort.by === 'rank' ? ranked.get(g.id)! : g[sort.by]);
    return shown.sort((a, b) => {
      const x = key(a), y = key(b);
      const c = x === y ? 0 : x === null || x === undefined ? 1 : y === null || y === undefined ? -1
        : typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : Number(x) - Number(y);
      return (sort.desc ? -c : c) || ranked.get(a.id)! - ranked.get(b.id)!;
    });
  }, [games, q, sort, ranked]);
  const sum = (k: keyof AdminGame) => list.reduce((n, g) => n + (Number(g[k]) || 0), 0);
  const up = sum('up'), down = sum('down');
  const by = (id: GameCol['id']) => setSort((s) => (s.by === id ? { by: id, desc: !s.desc } : { by: id, desc: !['title', 'slug', 'parent', 'genre', 'mode', 'city', 'rank'].includes(id) }));
  const download = () => {
    const lines = [GAME_COLS.map((c) => cell(c.label)).join(','), ...list.map((g) => GAME_COLS.map((c) => cell(c.csv(g, ranked.get(g.id)!))).join(','))];
    const url = URL.createObjectURL(new Blob([`${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `gamemog-games-${day(Date.now())}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="card flush">
      <div className="tools">
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by title, slug, genre, mode or city" aria-label="Filter games" />
        <p className="tools-t">{list.length} of {games.length} games</p>
        <button type="button" className="dl" onClick={download}>Download CSV</button>
      </div>
      <div className="gtab">
        <table className="lt">
          <thead>
            <tr>
              {GAME_COLS.map((c) => (
                <th key={c.id} scope="col" className={`${c.left ? 'l' : ''}${sort.by === c.id ? ' on' : ''}`} aria-sort={sort.by === c.id ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                  <button type="button" onClick={() => by(c.id)}>{c.label}{sort.by === c.id ? (sort.desc ? ' \u2193' : ' \u2191') : ''}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((g) => (
              <tr key={g.id} className={g.hidden ? 'off' : undefined}>
                {GAME_COLS.map((c) => <td key={c.id} className={c.left ? 'l' : undefined}>{c.show(g, ranked.get(g.id)!)}</td>)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              {GAME_COLS.map((c) => (
                <td key={c.id} className={c.left ? 'l' : undefined}>
                  {c.id === 'title' ? `Total, ${list.length} games` : c.id === 'likePct' ? (up + down ? `${Math.round((up / (up + down)) * 100)}%` : '-') : c.total ? sum(c.id as keyof AdminGame).toLocaleString('en-US') : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
        {!list.length && <p className="fine">No games match.</p>}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- worlds -- */
function Worlds({ worlds, hidden, visibility }: { worlds: AdminWorld[]; hidden: number; visibility: (w: AdminWorld, v: WorldVisibility) => void }) {
  const [show, setShow] = useState<'all' | 'live' | 'hidden'>('all');
  const [q, setQ] = useState('');
  const list = worlds.filter((w) => (show === 'all' || (show === 'hidden') === !!w.hidden) && `${w.title} ${w.prompt ?? ''} ${w.mog_prompt ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <section className="card flush">
      <div className="tools">
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles and prompts" aria-label="Search worlds" />
        <Segmented label="Show" pill value={show} onChange={setShow}
          items={[{ id: 'all', label: 'All' }, { id: 'live', label: 'Live' }, { id: 'hidden', label: 'Not live' }] as const}
          counts={{ hidden }} />
      </div>
      <ul className="rows">
        {list.map((w) => (
          <li key={w.id} className={w.hidden ? 'row off' : 'row'}>
            <Thumb slug={w.slug} />
            <div className="row-m">
              <p className="row-t"><Link href={`/g/${w.slug}`} target="_blank">{w.title}</Link><span className="chip">{kindOf(w)}</span></p>
              <p className="row-s">{w.parent_title ? `Mog of ${w.parent_title}: ${w.mog_prompt ?? ''}` : !w.prompt || w.prompt.startsWith('first-party world') ? 'First-party world, published by GameMog' : w.prompt}</p>
              <p className="row-n">{w.plays.toLocaleString('en-US')} loads · {w.players} finished · {w.up} up, {w.down} down · {w.mogs} Mogs · {ago(w.created_at)}</p>
            </div>
            <div className="row-live" title="Live: on GameMog's lists. Link only: off every list, but anyone with its link can play it. Only me: its link is 'not found' for everyone but you.">
              <Segmented label={`Who can open ${w.title}`} pill value={(w.hidden ? (w.unlisted ? 'link' : 'owner') : 'live') as WorldVisibility} onChange={(v) => visibility(w, v)}
                items={[{ id: 'live', label: 'Live' }, { id: 'link', label: 'Link only' }, { id: 'owner', label: 'Only me' }] as const} />
            </div>
          </li>
        ))}
        {!list.length && <li className="none">No worlds match.</li>}
      </ul>
    </section>
  );
}

function Thumb({ slug }: { slug: string }) {
  const [bad, setBad] = useState(false);
  return <span className="thumb">{!bad && <img src={`/g/${slug}/cover`} alt="" loading="lazy" onError={() => setBad(true)} />}</span>;
}

/* -------------------------------------------------------------- builds -- */
// how a build stands (lib/analytics.ts BuildStatus): abandoned, the creator left and it stopped; interrupted, the server did
const STATUS_WORDS: Record<AdminBuild['status'], string> = { running: 'Building', done: 'Built', error: 'Failed', abandoned: 'Abandoned', interrupted: 'Interrupted' };
function Builds({ builds, titles }: { builds: AdminBuild[]; titles: Map<string, string> }) {
  const [show, setShow] = useState<'all' | 'worlds' | 'mogs' | 'failed' | 'stopped'>('all');
  const list = builds.filter((b) => show === 'all' || (show === 'failed' ? b.status === 'error' : show === 'stopped' ? b.status === 'abandoned' || b.status === 'interrupted' : show === 'mogs' ? b.mog : !b.mog));
  const spend = list.reduce((a, b) => a + b.cost, 0), estimated = list.filter((b) => b.estimated).length, running = builds.filter((b) => b.status === 'running').length;
  return (
    <section className="card flush">
      <div className="tools">
        <p className="tools-t">{list.length} builds, {money(spend)}{estimated ? ` (${estimated} from before 9 Oct estimated)` : ''}{running ? ` · ${running} building now` : ''}</p>
        <Segmented label="Show" pill value={show} onChange={setShow}
          items={[{ id: 'all', label: 'All' }, { id: 'worlds', label: 'Worlds' }, { id: 'mogs', label: 'Mogs' }, { id: 'failed', label: 'Failed' }, { id: 'stopped', label: 'Stopped' }] as const} />
      </div>
      <ul className="rows">
        {list.map((b) => (
          <li key={b.id} className="build">
            <p className="build-h">
              <span className={b.status === 'error' ? 'chip bad' : 'chip'}>{STATUS_WORDS[b.status]}</span>
              <span className="chip">{b.mog ? 'Mog' : 'World'}{b.photo ? ' + photo' : ''}</span>
              <span className="dim">
                {ago(b.at)}{b.status === 'interrupted' ? '' : ` · ${b.minutes.toFixed(0)} min${b.status === 'running' ? ' so far' : ''}`} · {b.passes || 0} pass{b.passes === 1 ? '' : 'es'} · <span title={b.estimated ? 'Estimated from build time: built before tokens were recorded' : b.floor ? 'At least: a pass was cut short before its output was counted' : 'The tokens its passes used, priced'}>{b.estimated ? 'est. ' : ''}{money(b.cost)}{b.floor ? '+' : ''}</span>
              </span>
            </p>
            {b.mogOf && <p className="build-of">Mog of <Link href={`/g/${b.mogOf}`} target="_blank">{titles.get(b.mogOf) ?? b.mogOf}</Link></p>}
            <p className="build-p">{b.prompt}</p>
            {b.problem && <p className="build-x">{b.problem}</p>}
          </li>
        ))}
        {!list.length && <li className="none">No builds here.</li>}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------- crashes -- */
// what kart races reported from players' devices (lib/kart-report.ts): the newest first, the device and how far it got
const KIND_WORDS: Record<string, string> = { error: 'Error', rejection: 'Error', 'context-lost': 'Graphics lost', crash: 'Page died' };
function Reports({ reports }: { reports: KartReportRow[] }) {
  return (
    <section className="card flush">
      <div className="tools"><p className="tools-t">What kart races reported from players' devices, newest first. No names or addresses are kept. Also as JSON at /api/kart-report.</p></div>
      <ul className="rows">
        {reports.map((r) => {
          const d = r.data as { ua?: string; tier?: string; mem?: number; screen?: string; dpr?: number; gpu?: string; heap?: { used: number; limit: number } | null; t?: number; stack?: string; hidden?: boolean };
          return (
            <li key={r.id} className="build">
              <p className="build-h">
                <span className={r.kind === 'context-lost' || r.kind === 'crash' ? 'chip bad' : 'chip'}>{KIND_WORDS[r.kind] ?? r.kind}</span>
                <span className="chip">{r.device}{d.tier ? ` · ${d.tier}` : ''}</span>
                <span className="dim">{ago(r.at)}{r.slug ? <> · <Link href={`/g/${r.slug}`} target="_blank">{r.slug}</Link></> : null}{r.step ? ` · at ${r.step}` : ''}{d.t != null ? ` · ${(d.t / 1000).toFixed(1)} s in` : ''}{d.hidden ? ' · was in the background' : ''}</span>
              </p>
              <p className="build-p">{[d.gpu, d.mem ? `${d.mem} GB` : '', d.screen ? `${d.screen} @${d.dpr ?? 1}x` : '', d.heap ? `heap ${d.heap.used}/${d.heap.limit} MB` : ''].filter(Boolean).join(' · ') || 'No device details'}</p>
              {r.message && <p className="build-x">{r.message}</p>}
              {(d.stack || d.ua) && <p className="build-of dim" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{d.stack ? `${d.stack}\n` : ''}{d.ua}</p>}
            </li>
          );
        })}
        {!reports.length && <li className="none">No crash reports. Good.</li>}
      </ul>
    </section>
  );
}

/* --------------------------------------------------------------- names -- */
function Names({ scores, setScores }: { scores: AdminScore[]; setScores: React.Dispatch<React.SetStateAction<AdminScore[]>> }) {
  const toast = useToast();
  const [busy, setBusy] = useState<Record<number, Busy>>({});
  async function flip(s: AdminScore) {
    const hide = !s.hidden;
    setBusy((b) => ({ ...b, [s.id]: 'busy' }));
    try {
      const [ok] = await Promise.all([setScore(s.id, hide), new Promise((r) => setTimeout(r, 450))]);
      if (!ok) throw new Error('missing');
      setBusy((b) => ({ ...b, [s.id]: 'done' }));
      await new Promise((r) => setTimeout(r, 650));
      setScores((all) => all.map((x) => (x.id === s.id ? { ...x, hidden: hide ? 1 : 0 } : x)));
      setBusy((b) => ({ ...b, [s.id]: 'idle' }));
      toast(hide ? `${s.player} is off the ${s.title} board` : `${s.player} is back on the board`);
    } catch {
      setBusy((b) => ({ ...b, [s.id]: 'error' }));
      setTimeout(() => setBusy((b) => ({ ...b, [s.id]: 'idle' })), 500);
      toast('That did not save. Try again.');
    }
  }
  return (
    <section className="card flush">
      <div className="tools"><p className="tools-t">Names people typed onto leaderboards, newest first. Hiding one takes it off the board; nothing is deleted.</p></div>
      <ul className="rows">
        {scores.map((s) => (
          <li key={s.id} className={s.hidden ? 'row off name' : 'row name'}>
            <div className="row-m">
              <p className="row-t"><b className="who">{s.player}</b></p>
              <p className="row-n"><Link href={`/g/${s.slug}`} target="_blank">{s.title}</Link> · {s.score != null ? `${s.score.toLocaleString('en-US')} pts` : `${(s.time_ms / 1000).toFixed(2)} s`} · {ago(s.created_at)}</p>
            </div>
            <MorphButton small quiet={!!s.hidden} state={busy[s.id] ?? 'idle'} onClick={() => flip(s)}>{s.hidden ? 'Restore' : 'Hide'}</MorphButton>
          </li>
        ))}
        {!scores.length && <li className="none">No names yet.</li>}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------- traffic -- */
// a count's word: one visitor, two visitors (units like "opened" or "pressed Play" stay as they are)
const per = (n: number | string | undefined, word: string) => (Number(n) === 1 && word.endsWith('s') ? word.slice(0, -1) : word);

function Bars({ rows, unit, sub }: { rows: Row[]; unit: string; sub?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="none">Nothing in this range yet.</p>;
  return (
    <ul className="bars">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`}>
          <div className="fn-t">
            <span>{r.href ? <Link href={r.href} target="_blank">{r.label}</Link> : r.label}</span>
            <b>{r.value.toLocaleString('en-US')} <small>{per(r.value, unit)}{r.sub !== undefined && sub ? ` · ${r.sub} ${per(r.sub, sub)}` : ''}</small></b>
          </div>
          <div className="track"><Bar share={r.value / max} delay={i * 0.04} /></div>
        </li>
      ))}
    </ul>
  );
}

function Traffic({ s }: { s: Stats }) {
  return (
    <div className="two">
      <section className="card"><div className="card-h"><h2>Pages</h2></div><Bars rows={s.pages} unit="views" sub="visitors" /></section>
      <section className="card"><div className="card-h"><h2>Games people opened</h2></div><Bars rows={s.games} unit="opened" sub="pressed Play" /></section>
      <section className="card"><div className="card-h"><h2>Where visitors came from</h2></div><Bars rows={s.sources} unit="visitors" /></section>
      <section className="card"><div className="card-h"><h2>Devices</h2></div><Bars rows={s.devices} unit="visitors" /></section>
    </div>
  );
}

/* ------------------------------------------------------------ mog city -- */
// Mog City (mc.gamemog.com; the owner, 27 Oct), counted apart (lib/analytics.ts mcStats): who came, who pressed start,
// how far the story went, and for how long
const playTime = (ms: number) => {
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};

function McKpi({ label, k, m, format, hint, extra }: { label: string; k: keyof McKpis; m: McStats; format?: (n: number) => string; hint?: string; extra?: string }) {
  return (
    <div className="kpi" title={hint}>
      <p className="kpi-l">{label}</p>
      <p className="kpi-n"><Num value={m.now[k]} format={format} /></p>
      <Delta now={m.now[k]} before={m.before ? m.before[k] : null} range={m.range} from={m.from} />
      {extra && <p className="kpi-x">{extra}</p>}
    </div>
  );
}

function MogCity({ m }: { m: McStats }) {
  const n = m.now;
  // the story as one funnel: the visit, the start, then each mission's title card and its pass, in story order
  const steps: { label: string; value: number; fails?: number }[] = [
    { label: 'Visited', value: n.visitors },
    { label: 'Pressed start', value: n.players },
    ...m.missions.flatMap((x) => [{ label: `${x.label} started`, value: x.started }, { label: `${x.label} passed`, value: x.passed, fails: x.fails }]),
  ];
  // the chart's dark line is players and its light one visitors (lib/analytics.ts McPoint)
  const points = m.series.map((p) => ({ at: p.at, visitors: p.players, views: p.visitors }));
  return (
    <>
      <section className="kpis">
        <McKpi label="Visitors" k="visitors" m={m} hint="Browsers that opened Mog City" extra={`${n.loads.toLocaleString('en-US')} page load${n.loads === 1 ? '' : 's'}`} />
        <McKpi label="Players" k="players" m={m} hint="Visitors who pressed start on the title" extra={n.visitors ? `${Math.round((n.players / n.visitors) * 100)}% of visitors` : undefined} />
        <McKpi label="Starts" k="starts" m={m} hint="Presses of start, a player's second visit included" extra={n.players ? `${(n.starts / n.players).toFixed(1)} per player` : undefined} />
        <McKpi label="Play time" k="playMs" m={m} format={playTime} hint="Time played with the game's tab in view, from the press of start" extra={n.players ? `${playTime(n.playMs / n.players)} per player` : undefined} />
      </section>
      <p className="fine">
        Counted on its own at <a href="https://mc.gamemog.com" target="_blank" rel="noopener noreferrer">mc.gamemog.com</a>: none of it is in the Overview or Traffic numbers,
        and a browser signed in here is not counted. Play time stops while the tab is hidden or no one has touched a control for five minutes.
      </p>

      <section className="card">
        <div className="card-h">
          <h2>Visitors and players</h2>
          <p className="legend"><span><i className="k visitors" />Players</span><span><i className="k views" />Visitors</span></p>
        </div>
        <LineChart points={points} bucket={m.bucket} k={`mc-${m.range}`} names={{ visitors: 'Players', views: 'Visitors', empty: 'No one on Mog City in this range yet.' }} />
      </section>

      <div className="two">
        <section className="card">
          <div className="card-h"><h2>From visit to the last mission</h2></div>
          <ol className="funnel">
            {steps.map((f, i) => (
              <li key={f.label}>
                <div className="fn-t"><span>{f.label}</span><b><Num value={f.value} /></b></div>
                <div className="track"><Bar share={n.visitors ? f.value / n.visitors : 0} delay={i * 0.05} /></div>
                {i > 0 && (
                  <p className="fn-c">
                    {steps[i - 1].value ? `${Math.round((f.value / steps[i - 1].value) * 100)}% of the step before` : 'No one reached the step before'}
                    {f.fails ? ` · ${f.fails.toLocaleString('en-US')} failed run${f.fails === 1 ? '' : 's'}` : ''}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
        <section className="card"><div className="card-h"><h2>Why missions were failed</h2></div><Bars rows={m.fails} unit="fails" sub="players" /></section>
        <section className="card"><div className="card-h"><h2>Where visitors came from</h2></div><Bars rows={m.sources} unit="visitors" /></section>
        <section className="card"><div className="card-h"><h2>Devices</h2></div><Bars rows={m.devices} unit="visitors" /></section>
      </div>
    </>
  );
}

/* ------------------------------------------------------------ machines -- */
// How each machine runs the game (16 Nov, friends' QA; lib/perf.ts): Mog City's own report of every load (wagmi/perf.js),
// anonymous: a random id a browser tab, the graphics card, the browser's family and major, the tier its Auto picked
const msS = (ms: number | null | undefined) => (ms == null ? '-' : ms >= 10_000 ? `${(ms / 1000).toFixed(0)} s` : `${(ms / 1000).toFixed(1)} s`);
const msF = (ms: number | null | undefined) => (ms == null ? '-' : `${ms} ms`);
const OUTCOME: Record<string, string> = { ready: 'Ready', late: 'Ready after 90 s', stuck: 'Stuck', lost: 'Graphics lost', error: 'Error', left: 'Left while loading' };

function PerfTable({ rows, first }: { rows: PerfGroup[]; first: string }) {
  if (!rows.length) return <p className="none">Nothing in this range yet.</p>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="ptab">
        <thead><tr><th>{first}</th><th>Loads</th><th>Ready in</th><th>Frame p50</th><th>p95</th><th>p99</th><th>Long / min</th><th title="Seconds of frames over 250 ms">Stalled</th><th>WebGL 2</th><th>Stepped down</th><th>Stuck</th><th>Tier</th></tr></thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.key}>
              <td>{g.key}</td><td>{g.n}</td><td>{msS(g.readyMs)}</td><td>{msF(g.p50)}</td><td>{msF(g.p95)}</td><td>{msF(g.p99)}</td>
              <td>{g.longPerMin ?? '-'}</td><td>{g.stallSecs ? `${g.stallSecs} s` : 0}</td><td>{g.webgl2}</td><td>{g.downgraded}</td><td>{g.stuck ? <b className="bad">{g.stuck}</b> : 0}</td><td>{g.tier ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Machine({ s }: { s: PerfSession }) {
  const [open, setOpen] = useState(false);
  const phases = Object.entries(s.phases);
  const bad = s.outcome !== 'ready';
  return (
    <li className="build">
      <p className="build-h">
        <button type="button" className="chip" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? '−' : '+'} {s.code}</button>
        <span className={bad ? 'chip bad' : 'chip'}>{OUTCOME[s.outcome] ?? s.outcome}</span>
        <span className="chip">{s.tier ?? '?'}{s.backend ? ` · ${s.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2'}` : ''}</span>
        {s.owner && <span className="chip">you</span>}
        <span className="dim">{ago(s.at)} · {s.game ?? s.town ?? s.engine ?? '?'} · ready {msS(s.readyMs)} · frames p50 {msF(s.p50)} p95 {msF(s.p95)}{s.playSecs ? ` · ${Math.round(s.playSecs / 60)} min played` : ''}{s.stallSecs ? ` · ${s.stallSecs} s stalled` : ''}</span>
      </p>
      <p className="build-p">{[s.gpu ?? 'unknown graphics', s.cls ? `(${s.cls})` : '', s.browser, s.os, s.cores ? `${s.cores} cores` : '', s.mem ? `${s.mem} GB` : '', s.screen ? `${s.screen} @${s.dpr ?? 1}x` : ''].filter(Boolean).join(' · ')}</p>
      {open && (
        <div className="build-of dim" style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>
          {`Auto picked ${s.tierAuto ?? '?'} (${s.why ?? '?'}); choice ${s.tierChoice ?? '?'}${s.override ? `, this load ?tier=${s.override}` : ''}; backend ${s.backend ?? '?'}${s.backendWhy ? ` (${s.backendWhy})` : ''}; CPU check ${s.cpuMs ?? '?'} ms; display ${s.refreshMs ?? '?'} ms a frame\n`}
          {`First byte ${msS(s.ttfb)} · city ready ${msS(s.readyMs)} · story ${msS(s.storyMs)} · start pressed ${msS(s.gateMs)} · errors ${s.errors} · graphics lost ${s.lost}\n`}
          {phases.length ? `Build: ${phases.map(([k, v]) => `${k} ${v} ms`).join(', ')}\n` : ''}
          {s.events.map((e) => `${e.kind} ${e.what ?? ''} ${String(e.from ?? '')} → ${String(e.to ?? '')}${e.live ? ' (live)' : ''} · ${e.why ?? ''}${e.p50 != null ? ` at p50 ${e.p50} ms` : ''}\n`).join('')}
          {s.windows.map((w) => `${w.scene ?? '?'} · ${w.tier ?? '?'} @${Math.round((w.scale ?? 1) * 100)}% · ${w.secs ?? 0} s · p50 ${w.p50 ?? '?'} p95 ${w.p95 ?? '?'} ms · work p95 ${w.work95 ?? '?'} ms · ${w.long50 ?? 0} long${w.stalls ? ` · ${w.stalls} stalls, ${w.stallSecs ?? 0} s` : ''}\n`).join('')}
        </div>
      )}
    </li>
  );
}

// The range shown, read for that range only: the page's own (its first range, the owner left out) until another range
// or the owner's own loads are asked for, then GET /api/perf (again when the page's numbers refresh, every minute)
function Machines({ range, initial }: { range: Range; initial: PerfAdmin | null }) {
  const [q, setQ] = useState('');
  const [noOwner, setNoOwner] = useState(true);
  const own = !!initial && initial.range === range && initial.ownerExcluded === noOwner;
  const [fetched, setFetched] = useState<{ key: string; p: PerfAdmin | null } | null>(null);
  const want = `${range}.${noOwner ? 0 : 1}`;
  useEffect(() => {
    if (own) return;
    let live = true;
    fetch(`/api/perf?range=${range}&owner=${noOwner ? 0 : 1}`, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<PerfAdmin>) : null)).catch(() => null)
      .then((p) => { if (live) setFetched({ key: want, p }); });
    return () => { live = false; };
  }, [own, range, noOwner, want, initial]);
  const p = own ? initial : fetched && fetched.key === want ? fetched.p : undefined;
  const filter = (
    <label className="fine" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <input type="checkbox" checked={noOwner} onChange={(e) => setNoOwner(e.target.checked)} /> Leave out my own loads
    </label>
  );
  if (p === undefined) return <>{filter}<p className="none">Reading the machine reports…</p></>;
  if (!p) return <>{filter}<p className="none">The machine reports could not be read.</p></>;
  const k = p.kpis;
  const list = q.trim() ? p.sessions.filter((s) => s.code.toLowerCase().startsWith(q.trim().toLowerCase())) : p.sessions;
  return (
    <>
      {filter}
      <section className="kpis">
        <div className="kpi" title="Browser tab sessions that loaded the game"><p className="kpi-l">Sessions</p><p className="kpi-n"><Num value={k.sessions} /></p><p className="kpi-x">{k.loads} load{k.loads === 1 ? '' : 's'} · {k.playMin} min played</p></div>
        <div className="kpi" title="Loads whose city came up"><p className="kpi-l">Ready</p><p className="kpi-n">{k.readyPct == null ? '-' : `${k.readyPct}%`}</p><p className="kpi-x">{k.stuckPct ? `${k.stuckPct}% stuck` : 'none stuck'}</p></div>
        <div className="kpi" title="From the page's start to the city on screen"><p className="kpi-l">Load to ready</p><p className="kpi-n">{msS(k.readyMedian)}</p><p className="kpi-x">p90 {msS(k.readyP90)}</p></div>
        <div className="kpi" title="Loads whose resolution or tier was stepped down for slow frames"><p className="kpi-l">Stepped down</p><p className="kpi-n">{k.downgradedPct == null ? '-' : `${k.downgradedPct}%`}</p><p className="kpi-x">{k.lost} graphics device{k.lost === 1 ? '' : 's'} lost</p></div>
      </section>
      <p className="fine">
        Every load of Mog City, its stories and its towns reports how it ran: no names, no addresses, a random id for the browser tab only, the browser&apos;s family and version,
        and the graphics card. Nothing is sent with Do Not Track or Global Privacy Control on. A friend finds their own session by the code in the game&apos;s Graphics menu.
      </p>
      <section className="card"><div className="card-h"><h2>By machine: graphics card and browser</h2></div><PerfTable rows={p.byMachine} first="Machine" /></section>
      <div className="two">
        <section className="card"><div className="card-h"><h2>By game</h2></div><PerfTable rows={p.byGame} first="Game" /></section>
        <section className="card"><div className="card-h"><h2>By tier</h2></div><PerfTable rows={p.byTier} first="Tier" /></section>
      </div>
      <section className="card"><div className="card-h"><h2>Frame times, every machine</h2></div><Bars rows={p.hist} unit="frames" /></section>
      <section className="card flush">
        <div className="tools">
          <p className="tools-t">The worst loads first: stuck, lost or failed, then the slowest frames. Open one for its timings, its steps and its minutes of play.</p>
          <input className="adm-in" placeholder="Find a code" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a session by its code" style={{ maxWidth: 160 }} />
        </div>
        <ul className="rows">
          {list.map((s) => <Machine key={`${s.sid}.${s.n}`} s={s} />)}
          {!list.length && <li className="none">{q ? 'No session with that code in this range.' : 'No machine has reported in this range yet.'}</li>}
        </ul>
      </section>
    </>
  );
}
