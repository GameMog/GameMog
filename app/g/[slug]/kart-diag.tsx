'use client';
import { useEffect, useState } from 'react';

/**
 * A kart race's diagnostics (the owner, 8 Oct: Meme Kart ran on his Galaxy Z Fold 5 in Firefox for Android and crashed
 * in Chrome for Android). Two parts, both opened from the game page's own address:
 *
 *   ?kdiag=nomusic,noitems   switches for the race, passed on to the play frame's address; lib/runtime/kart-guard.js
 *                            reads them there and each takes a part of the race out whole (see SWITCHES), so the one
 *                            that makes a crash go away names its cause
 *   ?kdiag=info              this card, before the race boots: the browser, the GPU and its WebGL2 limits, the memory,
 *                            the sound's rate, and how the last race on this device ended (the guard's steps, kept by
 *                            the page under the frame), in plain text to screenshot; then the race, on a tap
 *
 * Nothing here leaves the device: the card only reads it.
 */
export const SWITCHES: [string, string][] = [
  ['nomusic', 'no score (no OfflineAudioContext)'],
  ['nosfx', 'no engines, crowd or effects sound'],
  ['noaudio', 'no AudioContext at all'],
  ['noprep', 'nothing made ahead on the start screen (no renderer.compile)'],
  ['noitems', 'no items or crates'],
  ['lowlod', 'racers at their far level only'],
  ['nopost', 'no bloom, grade or multisampled target'],
  ['noshadow', 'no shadow map'],
  ['nomorph', 'racers without expressions (morph targets)'],
  ['noguard', 'no crash-guard wrappers'],
  ['lowdpr', 'one pixel a point'],
];
const NAMES = SWITCHES.map(([k]) => k);

/** Where a kart race's running boot is kept (lib/runtime/kart-guard.js's steps, by play-frame.tsx), and its last bad end. */
export const KART_BOOT_KEY = 'gamemog:kart:boot', KART_LAST_KEY = 'gamemog:kart:last';

/** ?kdiag= read: 'info' and the race's switches, known ones only, each once, in the table's order. */
export function readKdiag(v: string | null | undefined) {
  const asked = new Set(String(v ?? '').toLowerCase().split(/[\s,+]+/).filter(Boolean));
  return { info: asked.has('info'), switches: NAMES.filter((k) => asked.has(k)) };
}

/** The links to try, one switch each and then the pairs most worth trying together. */
export const KDIAG_TRIES = [...NAMES, 'nomusic,nosfx', 'noprep,noitems', 'nopost,noshadow,lowdpr', 'lowlod,nomorph', 'noaudio,noprep,noitems,lowlod,nopost,noshadow,lowdpr'];

type Nav = Navigator & {
  deviceMemory?: number;
  userAgentData?: { platform?: string; mobile?: boolean; getHighEntropyValues?: (h: string[]) => Promise<{ model?: string; platform?: string; platformVersion?: string; fullVersionList?: { brand: string; version: string }[] }> };
};

async function readDevice(): Promise<string[]> {
  const L: string[] = [], nav = navigator as Nav;
  L.push(`Browser: ${nav.userAgent}`);
  try {
    const h = await nav.userAgentData?.getHighEntropyValues?.(['model', 'platformVersion', 'fullVersionList']);
    if (h) L.push(`Device: ${h.model || '?'} · ${h.platform ?? ''} ${h.platformVersion ?? ''} · ${(h.fullVersionList ?? []).filter((b) => !/not.?a.?brand/i.test(b.brand)).map((b) => `${b.brand} ${b.version}`).join(', ')}`);
  } catch {}
  L.push(`Memory: ${nav.deviceMemory ?? '?'} GB (deviceMemory) · ${nav.hardwareConcurrency ?? '?'} cores`);
  const pm = (performance as Performance & { memory?: { jsHeapSizeLimit: number; usedJSHeapSize: number } }).memory;
  if (pm) L.push(`JS heap: ${Math.round(pm.usedJSHeapSize / 1048576)} MB used, limit ${Math.round(pm.jsHeapSizeLimit / 1048576)} MB`);
  L.push(`Screen: ${screen.width}x${screen.height} @${devicePixelRatio} · window ${innerWidth}x${innerHeight} · touch ${matchMedia('(pointer: coarse)').matches ? 'yes' : 'no'}`);

  // the graphics: a WebGL2 context of its own, read and let go of
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2');
    if (!gl) L.push('WebGL2: NOT AVAILABLE');
    else {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      L.push(`GPU: ${dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)}`);
      L.push(`GPU vendor: ${dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)}`);
      L.push(`GL: ${gl.getParameter(gl.VERSION)} · ${gl.getParameter(gl.SHADING_LANGUAGE_VERSION)}`);
      const P = (n: string) => { const v = gl.getParameter((gl as unknown as Record<string, number>)[n]); return v && typeof v === 'object' && 'length' in v ? Array.from(v as ArrayLike<number>).join('x') : String(v); };
      const lim = ['MAX_TEXTURE_SIZE', 'MAX_RENDERBUFFER_SIZE', 'MAX_VIEWPORT_DIMS', 'MAX_SAMPLES', 'MAX_VERTEX_UNIFORM_VECTORS', 'MAX_FRAGMENT_UNIFORM_VECTORS', 'MAX_VARYING_VECTORS',
        'MAX_VERTEX_UNIFORM_COMPONENTS', 'MAX_FRAGMENT_UNIFORM_COMPONENTS', 'MAX_UNIFORM_BLOCK_SIZE', 'MAX_VERTEX_UNIFORM_BLOCKS', 'MAX_FRAGMENT_UNIFORM_BLOCKS', 'MAX_VERTEX_ATTRIBS',
        'MAX_TEXTURE_IMAGE_UNITS', 'MAX_VERTEX_TEXTURE_IMAGE_UNITS', 'MAX_COMBINED_TEXTURE_IMAGE_UNITS', 'MAX_ARRAY_TEXTURE_LAYERS', 'MAX_3D_TEXTURE_SIZE', 'MAX_DRAW_BUFFERS'];
      L.push('WebGL2 limits:');
      for (let i = 0; i < lim.length; i += 2) L.push('  ' + lim.slice(i, i + 2).map((n) => `${n.replace(/^MAX_/, '')} ${P(n)}`).join(' · '));
      try { L.push(`  RGBA16F multisample: ${Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES) as Int32Array).join(',') || 'none'}`); } catch {}
      const ext = ['EXT_color_buffer_float', 'EXT_color_buffer_half_float', 'OES_texture_float_linear', 'KHR_parallel_shader_compile', 'EXT_texture_filter_anisotropic', 'WEBGL_multi_draw', 'OVR_multiview2'];
      L.push(`Extensions: ${ext.map((e) => `${e.replace(/^(EXT|OES|KHR|WEBGL|OVR)_/, '')} ${gl.getExtension(e) ? 'yes' : 'no'}`).join(' · ')}`);
      const a = gl.getContextAttributes();
      if (a) L.push(`Context: antialias ${a.antialias ? 'yes' : 'no'} · ${(gl.getSupportedExtensions() ?? []).length} extensions`);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch (e) { L.push(`WebGL2: failed (${(e as Error)?.message ?? e})`); }

  // the sound: a context made and closed again (it plays nothing)
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) L.push('Audio: NO AudioContext');
    else {
      const ac = new AC();
      L.push(`Audio: ${ac.sampleRate} Hz · base latency ${Math.round((ac.baseLatency ?? 0) * 1000)} ms · ${ac.state} · OfflineAudioContext ${typeof OfflineAudioContext !== 'undefined' ? 'yes' : 'no'}`);
      await ac.close().catch(() => {});
    }
  } catch (e) { L.push(`Audio: failed (${(e as Error)?.message ?? e})`); }
  return L;
}

type Kept = { at?: number; slug?: string; kind?: string; step?: string; message?: string; hidden?: boolean; info?: { trail?: unknown; diag?: unknown; heap?: { used?: number; limit?: number } | null; gpu?: unknown } | null };

/** How the last race on this device ended badly: a boot still kept (the tab died: not yet reported), else the last kept. */
function readLast(): string[] {
  let k: Kept | null = null, fresh = false;
  try {
    const boot = localStorage.getItem(KART_BOOT_KEY);
    if (boot) { k = JSON.parse(boot) as Kept; fresh = true; }
    else { const last = localStorage.getItem(KART_LAST_KEY); if (last) k = JSON.parse(last) as Kept; }
  } catch {}
  if (!k || typeof k.at !== 'number') return ['Last crash: none recorded on this device'];
  const ago = Math.round((Date.now() - k.at) / 60000), info = k.info ?? null;
  const L = [`Last crash: ${fresh || k.kind === 'crash' ? 'the tab died while racing or loading' : k.kind === 'context-lost' ? 'the graphics were lost (context lost)' : k.kind || 'error'} · ${ago < 1 ? 'just now' : ago < 120 ? `${ago} min ago` : `${Math.round(ago / 60)} h ago`} · ${k.slug ?? ''}${k.hidden ? ' · page was hidden' : ''}`];
  L.push(`  last step: ${k.step || '?'}`);
  if (k.message) L.push(`  error: ${k.message}`);
  if (info?.diag) L.push(`  switches then: ${String(info.diag)}`);
  if (info?.heap) L.push(`  JS heap then: ${info.heap.used ?? '?'} / ${info.heap.limit ?? '?'} MB`);
  if (Array.isArray(info?.trail) && info.trail.length) { L.push('  steps before it (step @ms heap):'); info.trail.slice(-14).forEach((s) => L.push(`    ${String(s).slice(0, 80)}`)); }
  return L;
}

/** The card: plain text to screenshot, the links to try, and the race on a tap. */
export function KartDiagCard({ slug, switches, onStart }: { slug: string; switches: string[]; onStart: () => void }) {
  const [text, setText] = useState('Reading this device...');
  const [copied, setCopied] = useState(false);
  const named = switches.join(', ') || 'none';
  // (once: a new array of the same switches each render is not a new device to read)
  useEffect(() => {
    // (the last crash read first: the page's own crash effect takes the kept boot away as it reports it)
    const last = readLast();
    let on = true;
    readDevice().then((dev) => { if (on) setText([...dev, '', ...last, '', `Switches for the next race: ${named}`, `Page: ${location.pathname}${location.search}`, `At: ${new Date().toISOString()}`].join('\n')); });
    return () => { on = false; };
  }, [named]);
  const go = (s: string) => `/g/${slug}?kdiag=${s}`;
  return (
    <div className="panel" style={{ marginBottom: 12, display: 'grid', gap: 10 }}>
      <b style={{ fontSize: 18 }}>Kart diagnostics</b>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', font: '12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace' }}>{text}</pre>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn" onClick={onStart}>Start the race{switches.length ? ` (${switches.join(', ')})` : ''}</button>
        <button className="btn" onClick={() => { navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {}); }}>{copied ? 'Copied' : 'Copy text'}</button>
      </div>
      <div className="t-meta dim">
        Try one at a time (each opens the race with that part taken out):
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
          {KDIAG_TRIES.map((s) => {
            const one = SWITCHES.find(([k]) => k === s);
            return <li key={s}><a href={go(s)}>{s}</a>{one ? ` · ${one[1]}` : ''}</li>;
          })}
        </ul>
      </div>
    </div>
  );
}
