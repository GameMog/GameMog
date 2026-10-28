'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminBuild, AdminScore, AdminWorld, Kpis, McKpis, McStats, Range, Row, Stats } from '@/lib/analytics';
import { setScore, setWorld, signOut } from './actions';
import { LineChart } from './chart';
import { Bar, BlurIn, MorphButton, Num, Segmented, Toasts, Toggle, useToast, type Busy } from './motion';
import { Palette, type Command } from './palette';
import type { KartReportRow } from '@/lib/kart-report';
import type { DareLoop, LoopWindow } from '@/lib/funnel';

type Tab = 'overview' | 'dares' | 'worlds' | 'builds' | 'names' | 'traffic' | 'mogcity' | 'reports';
const TABS = [
  { id: 'overview', label: 'Overview' }, { id: 'dares', label: 'Dares' }, { id: 'worlds', label: 'Worlds' }, { id: 'builds', label: 'Builds' },
  { id: 'names', label: 'Names' }, { id: 'traffic', label: 'Traffic' }, { id: 'mogcity', label: 'Mog City' }, { id: 'reports', label: 'Crashes' },
] as const satisfies readonly { id: Tab; label: string }[];
const RANGE_ITEMS = [{ id: '24h', label: '24h' }, { id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }] as const satisfies readonly { id: Range; label: string }[];
const RANGE_WORDS: Record<Range, string> = { '24h': 'the day before', '7d': 'the week before', '30d': 'the 30 days before' };
// the tabs that follow the range switch
const ranged = (t: Tab) => t === 'overview' || t === 'traffic' || t === 'mogcity';

// slots: capacity now (lib/build-limits.ts): the builds running, of the site's cap (BUILD_SLOTS); the builds waiting in
// line, of its length (BUILD_QUEUE_MAX); and the day's spend (Los Angeles's day, running builds at their estimate) against
// its ceiling (BUILD_DAILY_USD)
export type Capacity = { held: number; max: number; queue: number; queueMax: number; spent: number; inFlight: number; perBuild: number; ceiling: number };
// mc: Mog City (mc.gamemog.com), counted apart from everything else here (lib/analytics.ts mcStats)
export type AdminData = { stats: Record<Range, Stats>; worlds: AdminWorld[]; builds: AdminBuild[]; scores: AdminScore[]; active: number; reports: KartReportRow[]; slots: Capacity; loop: DareLoop; mc: Record<Range, McStats> };

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

function Board({ stats, worlds: initialWorlds, builds, scores: initialScores, active, reports, slots, loop, mc }: AdminData) {
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

  const publish = useCallback(async (w: AdminWorld, live: boolean, quiet = false) => {
    setWorlds((all) => all.map((x) => (x.id === w.id ? { ...x, hidden: live ? 0 : 1 } : x)));
    try {
      if (!(await setWorld(w.id, !live))) throw new Error('missing');
      if (!quiet) toast(live ? `${w.title} is live again` : `${w.title} is unpublished`, { label: 'Undo', run: () => publish(w, !live, true) });
      router.refresh();
    } catch {
      setWorlds((all) => all.map((x) => (x.id === w.id ? { ...x, hidden: live ? 1 : 0 } : x)));
      toast('That did not save. Try again.');
    }
  }, [router, toast]);

  const commands = useMemo<Command[]>(() => [
    ...TABS.map((t) => ({ id: `tab-${t.id}`, label: `Go to ${t.label}`, group: 'Tab', always: true, run: () => setTab(t.id) })),
    ...RANGE_ITEMS.map((r) => ({ id: `range-${r.id}`, label: `Show the last ${r.id === '24h' ? '24 hours' : r.label}`, group: 'Range', always: true, run: () => { setRange(r.id); setTab((t) => (ranged(t) ? t : 'overview')); } })),
    { id: 'refresh', label: 'Refresh the numbers', group: 'Data', always: true, run: () => { router.refresh(); toast('Numbers refreshed'); } },
    ...worlds.flatMap((w) => [
      { id: `pub-${w.id}`, label: `${w.hidden ? 'Restore' : 'Unpublish'} ${w.title}`, group: kindOf(w), run: () => publish(w, !!w.hidden) },
      { id: `open-${w.id}`, label: `Open ${w.title}`, group: 'Page', run: () => window.open(`/g/${w.slug}`, '_blank', 'noopener') },
    ]),
    { id: 'signout', label: 'Sign out', group: 'Account', always: true, run: async () => { await signOut(); router.refresh(); } },
  ], [worlds, publish, router, toast]);

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
          <Segmented label="Sections" items={TABS} value={tab} onChange={setTab} counts={{ worlds: worlds.length, builds: builds.length }} />
          {ranged(tab) && <Segmented label="Range" pill items={RANGE_ITEMS} value={range} onChange={setRange} />}
        </div>
      </header>

      <main className="adm-main">
        <BlurIn k={ranged(tab) ? `${tab}-${range}` : tab}>
          {tab === 'overview' && <Overview s={s} slots={slots} />}
          {tab === 'dares' && <Dares loop={loop} />}
          {tab === 'worlds' && <Worlds worlds={worlds} hidden={hiddenCount} publish={publish} />}
          {tab === 'builds' && <Builds builds={builds} titles={new Map(worlds.map((w) => [w.slug, w.title]))} />}
          {tab === 'names' && <Names scores={scores} setScores={setScores} />}
          {tab === 'traffic' && <Traffic s={s} />}
          {tab === 'mogcity' && <MogCity m={mc[range]} />}
          {tab === 'reports' && <Reports reports={reports} />}
        </BlurIn>
      </main>

      <Palette open={palette} onClose={() => setPalette(false)} commands={commands} anchor={trigger} />
    </div>
  );
}

/* ------------------------------------------------------------ overview -- */
function Delta({ now, before, range }: { now: number; before: number; range: Range }) {
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
      <Delta now={s.now[k]} before={s.before[k]} range={s.range} />
    </div>
  );
}

function Overview({ s, slots }: { s: Stats; slots: AdminData['slots'] }) {
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

/* -------------------------------------------------------------- worlds -- */
function Worlds({ worlds, hidden, publish }: { worlds: AdminWorld[]; hidden: number; publish: (w: AdminWorld, live: boolean) => void }) {
  const [show, setShow] = useState<'all' | 'live' | 'hidden'>('all');
  const [q, setQ] = useState('');
  const list = worlds.filter((w) => (show === 'all' || (show === 'hidden') === !!w.hidden) && `${w.title} ${w.prompt ?? ''} ${w.mog_prompt ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <section className="card flush">
      <div className="tools">
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles and prompts" aria-label="Search worlds" />
        <Segmented label="Show" pill value={show} onChange={setShow}
          items={[{ id: 'all', label: 'All' }, { id: 'live', label: 'Live' }, { id: 'hidden', label: 'Unpublished' }] as const}
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
            <label className="row-live"><span>{w.hidden ? 'Unpublished' : 'Live'}</span><Toggle on={!w.hidden} onChange={(on) => publish(w, on)} label={`${w.title} is live`} /></label>
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
      <Delta now={m.now[k]} before={m.before[k]} range={m.range} />
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
