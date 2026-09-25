'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminBuild, AdminScore, AdminWorld, Kpis, Range, Row, Stats } from '@/lib/analytics';
import { setScore, setWorld, signOut } from './actions';
import { LineChart } from './chart';
import { Bar, BlurIn, MorphButton, Num, Segmented, Toasts, Toggle, useToast, type Busy } from './motion';
import { Palette, type Command } from './palette';

type Tab = 'overview' | 'worlds' | 'builds' | 'names' | 'traffic';
const TABS = [
  { id: 'overview', label: 'Overview' }, { id: 'worlds', label: 'Worlds' }, { id: 'builds', label: 'Builds' },
  { id: 'names', label: 'Names' }, { id: 'traffic', label: 'Traffic' },
] as const satisfies readonly { id: Tab; label: string }[];
const RANGE_ITEMS = [{ id: '24h', label: '24h' }, { id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }] as const satisfies readonly { id: Range; label: string }[];
const RANGE_WORDS: Record<Range, string> = { '24h': 'the day before', '7d': 'the week before', '30d': 'the 30 days before' };

export type AdminData = { stats: Record<Range, Stats>; worlds: AdminWorld[]; builds: AdminBuild[]; scores: AdminScore[]; active: number };

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

function Board({ stats, worlds: initialWorlds, builds, scores: initialScores, active }: AdminData) {
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
    ...RANGE_ITEMS.map((r) => ({ id: `range-${r.id}`, label: `Show the last ${r.id === '24h' ? '24 hours' : r.label}`, group: 'Range', always: true, run: () => { setRange(r.id); setTab((t) => (t === 'overview' || t === 'traffic' ? t : 'overview')); } })),
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
          {(tab === 'overview' || tab === 'traffic') && <Segmented label="Range" pill items={RANGE_ITEMS} value={range} onChange={setRange} />}
        </div>
      </header>

      <main className="adm-main">
        <BlurIn k={tab === 'overview' || tab === 'traffic' ? `${tab}-${range}` : tab}>
          {tab === 'overview' && <Overview s={s} />}
          {tab === 'worlds' && <Worlds worlds={worlds} hidden={hiddenCount} publish={publish} />}
          {tab === 'builds' && <Builds builds={builds} titles={new Map(worlds.map((w) => [w.slug, w.title]))} />}
          {tab === 'names' && <Names scores={scores} setScores={setScores} />}
          {tab === 'traffic' && <Traffic s={s} />}
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

function Overview({ s }: { s: Stats }) {
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
        <Kpi label="Est. API spend" k="spend" s={s} format={money} hint="Estimated from counted builds; the Anthropic Console has the exact figure" />
      </section>

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
            <div><dt>Est. spend per build</dt><dd>{n.builds ? money(n.spend / n.builds) : '$0.00'}</dd></div>
          </dl>
          <p className="fine">Spend is estimated from how long each build wrote for, calibrated on builds whose tokens were counted: about $0.11 a minute for a world and $0.17 for a Mog. Your Anthropic Console has the exact bill.</p>
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
function Builds({ builds, titles }: { builds: AdminBuild[]; titles: Map<string, string> }) {
  const [show, setShow] = useState<'all' | 'worlds' | 'mogs' | 'failed'>('all');
  const list = builds.filter((b) => show === 'all' || (show === 'failed' ? !b.ok : show === 'mogs' ? b.mog : !b.mog));
  const spend = list.reduce((a, b) => a + b.cost, 0);
  return (
    <section className="card flush">
      <div className="tools">
        <p className="tools-t">{list.length} builds, about {money(spend)}</p>
        <Segmented label="Show" pill value={show} onChange={setShow}
          items={[{ id: 'all', label: 'All' }, { id: 'worlds', label: 'Worlds' }, { id: 'mogs', label: 'Mogs' }, { id: 'failed', label: 'Failed' }] as const} />
      </div>
      <ul className="rows">
        {list.map((b) => (
          <li key={b.id} className="build">
            <p className="build-h">
              <span className={b.ok ? 'chip' : 'chip bad'}>{b.ok ? 'Built' : 'Failed'}</span>
              <span className="chip">{b.mog ? 'Mog' : 'World'}{b.photo ? ' + photo' : ''}</span>
              <span className="dim">{ago(b.at)} · {b.minutes.toFixed(0)} min · {b.passes || 0} pass{b.passes === 1 ? '' : 'es'} · {money(b.cost)}</span>
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
function Bars({ rows, unit, sub }: { rows: Row[]; unit: string; sub?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="none">Nothing in this range yet.</p>;
  return (
    <ul className="bars">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`}>
          <div className="fn-t">
            <span>{r.href ? <Link href={r.href} target="_blank">{r.label}</Link> : r.label}</span>
            <b>{r.value.toLocaleString('en-US')} <small>{unit}{r.sub !== undefined && sub ? ` · ${r.sub} ${sub}` : ''}</small></b>
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
