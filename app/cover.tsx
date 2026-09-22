import type { WorldSpec } from '@/lib/worldspec';

/**
 * Cover art, drawn from the world itself.
 *
 * The first version drew each world as a small landscape: sky, sun, track loop,
 * three racers the size of beans. It was faithful, and at 150px it failed. Every
 * tile shared one composition in a different pastel tint, so a shelf of twenty
 * worlds read as one picture repeated, next to a Roblox shelf of loud key art.
 *
 * Key art works at thumbnail size because it spends the whole frame on one
 * thing: a character close enough to see its face, the title lettered large
 * with a heavy outline, and a background saturated enough to separate the tile
 * from its neighbours. This file does that, still entirely from the WorldSpec:
 * the creature is drawn from its own rig, the colours come from the world's
 * palette pushed to full strength, and the composition is one of five, picked
 * from the title so a world always gets the same one and a shelf gets a mix.
 *
 * Flat cel shading and outlines only. No gradients: they are what made the
 * previous covers read as soft.
 */

type Racer = WorldSpec['racers'][number];
type Rig = NonNullable<Racer['rig']>;

/* ------------------------------------------------------------- colour -- */
function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const l = (mx + mn) / 2;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h < 0 ? h + 360 : h, s, l];
}

function hsl(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => {
    const x = (pa >> sh) & 255, y = (pb >> sh) & 255;
    return Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`.toUpperCase();
}

function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * c((n >> 16) & 255) + 0.7152 * c((n >> 8) & 255) + 0.0722 * c(n & 255);
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const hueGap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * A background for a character: a hue the world actually uses, far enough round
 * the wheel from the creature's fur that the two never merge, at a saturation
 * that holds its own next to a neighbouring tile, and at a lightness chosen
 * against the fur rather than by taste.
 */
function backdrop(spec: WorldSpec, fur: string) {
  const p = spec.palette;
  const [fh, fs] = hexToHsl(fur);
  const candidates = [
    p.skyMid, p.skyHigh, p.skyLow, p.terrain.moss, p.moodRamp[0].accent,
    p.moodRamp[1].accent, spec.props.caps.palettes[0][0], p.terrain.accent, p.moodRamp[2].accent,
  ];
  let hue = (fh + 180) % 360;
  for (const c of candidates) {
    const [h, s, l] = hexToHsl(c);
    if (s < 0.14 || l < 0.06 || l > 0.94) continue;
    if (fs > 0.15 && hueGap(h, fh) < 38) continue;
    hue = h; break;
  }

  // pale creatures go on a deep ground, dark ones on a bright one
  const pale = lum(fur) > 0.3;
  let l = pale ? 0.40 : 0.64;
  let a = hsl(hue, 0.66, l);
  for (let i = 0; i < 6 && contrast(a, fur) < 1.9; i++) {
    l = Math.min(0.8, Math.max(0.16, l + (pale ? -0.05 : 0.05)));
    a = hsl(hue, 0.66, l);
  }
  return {
    a,
    b: hsl(hue, 0.66, Math.min(0.86, l + 0.07)),
    ink: hsl(hue, 0.6, 0.12),
  };
}

/* ----------------------------------------------------------- creature -- */
/**
 * One creature, drawn from its rig. Local space: feet at (0,0), roughly 105
 * units tall at default proportions. The fuzzy outline is the rig's own fur
 * length and density; the hood, face, eyes, mouth and topper follow the same
 * bounded multipliers the 3D engine uses, so a cover and a race show the same
 * animal.
 */
function Creature({ r, accent, mirror = false, uid }: { r: Racer; accent: string; mirror?: boolean; uid: string }) {
  const rig: Partial<Rig> = r.rig ?? {};
  const g = (k: keyof Rig, d: number) => (typeof rig[k] === 'number' ? (rig[k] as number) : d);
  const fur = r.fur;
  const ink = mix(fur, '#1B1422', 0.72);
  const shade = mix(fur, '#1B1422', 0.26);
  const light = mix(fur, '#FFFFFF', 0.42);
  const skin = mix(fur, '#FFF1DE', 0.72);

  const h = 78 * g('height', 1);
  const w = 66 * g('girth', 1);
  const legH = 13 * g('legLength', 1);
  const cy = -legH - h / 2 + 5;
  const top = cy - h / 2;
  const e = (0.5 - g('slouch', 0.5)) * 0.28;
  const amp = 0.012 + 0.014 * g('furLength', 1);
  const nFur = Math.max(10, Math.round(22 * g('furDensity', 1)));

  const egg = (dx = 0, dy = 0) => {
    let d = '';
    for (let i = 0; i <= 150; i++) {
      const t = (i / 150) * Math.PI * 2;
      const st = Math.sin(t), ct = Math.cos(t);
      const bump = 1 + amp * Math.sin(nFur * t);
      const x = dx + (w / 2) * ct * (1 + e * st) * bump;
      const y = cy + dy + (h / 2) * st * bump;
      d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return d + 'Z';
  };
  const body = egg();

  const faceR = w * 0.34 * g('faceSize', 1) * (1 + (0.845 - g('faceOpen', 0.845)) * 1.4);
  const fy = cy - h * 0.13 - g('eyeHeight', 0) * h * 0.12;
  const ex = faceR * 0.4 * g('eyeSpread', 1);
  const erx = faceR * 0.13 * g('eyeSize', 1), ery = erx * 1.3;
  const eyeInk = rig.eye ?? '#0E0C0B';
  const iris = lum(eyeInk) > 0.25;
  const my = fy + faceR * 0.36;
  const mw = faceR * 0.36 * g('mouthWidth', 1);
  const md = faceR * 0.2 * g('mouthCurve', 1);
  const blush = Math.min(1, 0.45 * g('blush', 1));
  const tk = g('topperSize', 1);
  const topper = rig.topper ?? 'none';
  const stance = g('legStance', 1);
  const armG = g('armGirth', 1), armL = g('armLength', 1);
  const sw = 2.2;

  return (
    <g transform={mirror ? 'scale(-1,1)' : undefined}>
      {/* behind the body */}
      {topper === 'ears' && [-1, 1].map((s) => (
        <g key={s} transform={`translate(${s * w * 0.28},${top + 6}) rotate(${s * 16})`}>
          <ellipse cx={0} cy={-13 * tk} rx={8.5 * tk} ry={16 * tk} fill={fur} stroke={ink} strokeWidth={sw} />
          <ellipse cx={0} cy={-12 * tk} rx={4.2 * tk} ry={10 * tk} fill={skin} />
        </g>
      ))}
      {topper === 'crest' && (
        <path
          d={`M${-w * 0.2},${top + 8} Q${-w * 0.16},${top - 16 * tk} ${-w * 0.07},${top + 2} Q0,${top - 24 * tk} ${w * 0.07},${top + 2} Q${w * 0.16},${top - 16 * tk} ${w * 0.2},${top + 8} Z`}
          fill={mix(fur, accent, 0.55)} stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
      )}
      {[-1, 1].map((s, i) => (
        <ellipse key={s} cx={s * w * 0.22 * stance} cy={-legH / 2 - (i ? 0 : 3)} rx={7.5} ry={legH / 2 + 4}
          fill={shade} stroke={ink} strokeWidth={sw} />
      ))}

      {/* body, cel shaded: a shade crescent low and right, a highlight high and left */}
      <clipPath id={`${uid}b`}><path d={body} /></clipPath>
      <path d={body} fill={shade} />
      <g clipPath={`url(#${uid}b)`}>
        <path d={egg(-w * 0.1, -h * 0.07)} fill={fur} />
        <ellipse cx={-w * 0.2} cy={top + h * 0.2} rx={w * 0.13} ry={h * 0.07} fill={light}
          transform={`rotate(-24 ${-w * 0.2} ${top + h * 0.2})`} />
      </g>
      <path d={body} fill="none" stroke={ink} strokeWidth={sw} strokeLinejoin="round" />

      {/* arms, mid-stride: one forward, one back */}
      <ellipse cx={-w / 2 + 1} cy={cy + h * 0.06} rx={6.5 * armG} ry={12 * armL} fill={fur} stroke={ink} strokeWidth={sw}
        transform={`rotate(34 ${-w / 2 + 1} ${cy + h * 0.06})`} />
      <ellipse cx={w / 2 - 1} cy={cy + h * 0.1} rx={6.5 * armG} ry={12 * armL} fill={shade} stroke={ink} strokeWidth={sw}
        transform={`rotate(-28 ${w / 2 - 1} ${cy + h * 0.1})`} />

      {/* the hood opening and the face inside it */}
      <ellipse cx={0} cy={fy} rx={faceR * 1.14} ry={faceR * 1.06} fill={shade} />
      <ellipse cx={0} cy={fy} rx={faceR} ry={faceR * 0.93} fill={skin} stroke={ink} strokeWidth={1.4} />
      {[-1, 1].map((s) => (
        <ellipse key={s} cx={s * faceR * 0.62} cy={fy + faceR * 0.24} rx={faceR * 0.17} ry={faceR * 0.1}
          fill="#FF7F98" opacity={blush} />
      ))}
      {[-1, 1].map((s) => (
        <g key={s}>
          <ellipse cx={s * ex} cy={fy - faceR * 0.06} rx={erx} ry={ery} fill={eyeInk} />
          {iris && <circle cx={s * ex} cy={fy - faceR * 0.04} r={erx * 0.55} fill="#110D10" />}
          <circle cx={s * ex - erx * 0.3} cy={fy - faceR * 0.06 - ery * 0.38} r={erx * 0.4} fill="#FFFFFF" />
        </g>
      ))}
      <path d={`M${-mw / 2},${my} Q0,${my + md * 1.7} ${mw / 2},${my} Z`} fill="#5E1F2A" stroke={ink}
        strokeWidth={1.4} strokeLinejoin="round" />

      {/* in front of the body */}
      {topper === 'horns' && [-1, 1].map((s) => (
        <path key={s}
          d={`M${s * w * 0.16},${top + 10} Q${s * w * 0.2},${top - 8 * tk} ${s * w * 0.36},${top - 20 * tk} Q${s * w * 0.3},${top - 2 * tk} ${s * w * 0.3},${top + 12} Z`}
          fill="#F3E4C4" stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
      ))}
      {topper === 'antennae' && [-1, 1].map((s) => (
        <g key={s}>
          <path d={`M${s * w * 0.12},${top + 5} Q${s * w * 0.14},${top - 16 * tk} ${s * w * 0.3},${top - 24 * tk}`}
            fill="none" stroke={ink} strokeWidth={2.4} strokeLinecap="round" />
          <circle cx={s * w * 0.3} cy={top - 24 * tk} r={5 * tk} fill={accent} stroke={ink} strokeWidth={sw} />
        </g>
      ))}
    </g>
  );
}

function Placed({ r, x, y, s, accent, uid, mirror, tilt = 0 }: {
  r: Racer; x: number; y: number; s: number; accent: string; uid: string; mirror?: boolean; tilt?: number;
}) {
  return (
    <g transform={`translate(${x},${y}) rotate(${tilt}) scale(${s})`}>
      <Creature r={r} accent={accent} mirror={mirror} uid={uid} />
    </g>
  );
}

/* -------------------------------------------------------------- title -- */
/**
 * The title, lettered: uppercase, heavy, a thick outline, and a solid extrude
 * underneath. A leading "The" drops to a small line of its own, the way a game
 * logo sets it. Line breaks are chosen to balance, and every line is fitted to
 * the width it is given rather than trusted to.
 */
function breakTitle(title: string) {
  let words = title.toUpperCase().split(/\s+/).filter(Boolean);
  let small: string | undefined;
  if (words[0] === 'THE' && words.length > 1) { small = 'THE'; words = words.slice(1); }
  const text = words.join(' ');
  if (text.length <= 11 || words.length === 1) return { small, lines: [text] };
  let best = [text], bestMax = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const m = Math.max(a.length, b.length);
    if (m < bestMax) { bestMax = m; best = [a, b]; }
  }
  if (bestMax > 14 && words.length >= 3) {
    for (let i = 1; i < words.length - 1; i++)
      for (let j = i + 1; j < words.length; j++) {
        const ls = [words.slice(0, i), words.slice(i, j), words.slice(j)].map((x) => x.join(' '));
        const m = Math.max(...ls.map((l) => l.length));
        if (m < bestMax) { bestMax = m; best = ls; }
      }
  }
  return { small, lines: best };
}

const HEAVY = "'Arial Black','Arial Bold',Gadget,'Helvetica Neue',Arial,sans-serif";
const EM = 0.76; // average advance of a heavy uppercase glyph, in ems

/** The size a title would be set at in a given box. */
function titleSize(title: string, maxW: number, cap: number) {
  const { lines } = breakTitle(title);
  return Math.min(cap, maxW / (Math.max(...lines.map((l) => l.length)) * EM));
}

function Title({ title, x, y, anchor, maxW, cap, fill, ink, from = 'bottom' }: {
  title: string; x: number; y: number; anchor: 'start' | 'middle' | 'end';
  maxW: number; cap: number; fill: string; ink: string; from?: 'bottom' | 'top' | 'center';
}) {
  const { small, lines } = breakTitle(title);
  const size = titleSize(title, maxW, cap);
  const lh = size * 0.98;
  const smallSize = size * 0.46;
  const smallGap = smallSize * 1.5;
  const blockH = lines.length * lh + (small ? smallGap : 0);
  let y0 = from === 'bottom' ? y - blockH : from === 'center' ? y - blockH / 2 : y;

  const rows: { text: string; size: number; baseline: number }[] = [];
  const smallRow = small ? { text: small, size: smallSize, baseline: y0 + smallSize * 0.86 } : null;
  if (small) y0 += smallGap;
  lines.forEach((l, i) => rows.push({ text: l, size, baseline: y0 + lh * i + size * 0.84 }));
  // drawn last, so the main line's outline cannot paint over it
  if (smallRow) rows.push(smallRow);

  return (
    <g fontFamily={HEAVY} fontWeight={900} textAnchor={anchor}>
      {rows.map((row, i) => {
        const est = row.text.length * row.size * EM;
        const fit = est > maxW * 0.98 ? { textLength: maxW, lengthAdjust: 'spacingAndGlyphs' as const } : {};
        return (
          <g key={i}>
            <text x={x} y={row.baseline + row.size * 0.1} fontSize={row.size} fill={ink}
              stroke={ink} strokeWidth={row.size * 0.24} strokeLinejoin="round" {...fit}>{row.text}</text>
            <text x={x} y={row.baseline} fontSize={row.size} fill={fill}
              stroke={ink} strokeWidth={row.size * 0.2} strokeLinejoin="round"
              style={{ paintOrder: 'stroke' }} {...fit}>{row.text}</text>
          </g>
        );
      })}
    </g>
  );
}

/* ------------------------------------------------------------- scenery -- */
function Burst({ cx, cy, a, b, n = 18 }: { cx: number; cy: number; a: string; b: string; n?: number }) {
  const R = 700;
  return (
    <g>
      <rect x={-50} y={-50} width={500} height={500} fill={a} />
      {Array.from({ length: n }, (_, i) => {
        if (i % 2) return null;
        const t0 = (i / n) * Math.PI * 2, t1 = ((i + 1) / n) * Math.PI * 2;
        return (
          <path key={i} fill={b}
            d={`M${cx},${cy} L${cx + Math.cos(t0) * R},${cy + Math.sin(t0) * R} L${cx + Math.cos(t1) * R},${cy + Math.sin(t1) * R} Z`} />
        );
      })}
    </g>
  );
}

function SpeedLines({ x, y, colour, rows = 5, len = 70 }: { x: number; y: number; colour: string; rows?: number; len?: number }) {
  return (
    <g stroke={colour} strokeLinecap="round" opacity={0.55}>
      {Array.from({ length: rows }, (_, i) => (
        <line key={i} x1={x - len * (0.55 + ((i * 37) % 10) / 20)} y1={y + i * 13} x2={x} y2={y + i * 13}
          strokeWidth={4.5 - (i % 2) * 1.5} />
      ))}
    </g>
  );
}

/* --------------------------------------------------------------- cover -- */
/** Each composition and the box its title is set in. */
const LAYOUTS = [
  { name: 'portrait', maxW: 272, cap: 46 },
  { name: 'versus', maxW: 276, cap: 40 },
  { name: 'pack', maxW: 272, cap: 44 },
  { name: 'track', maxW: 214, cap: 38 },
  { name: 'side', maxW: 184, cap: 40 },
] as const;

/** Below this a title stops reading at 150px, which is the whole point of it. */
const MIN_TITLE = 27;

/**
 * The composition comes from the title, so a world always looks the same and a
 * shelf gets a mix; but a composition whose title box would set this title too
 * small is skipped. "Marginalia Wood" in a narrow side panel was a title nobody
 * could read, which is worse than a repeated layout.
 */
function pickLayout(title: string, h: number) {
  for (let i = 0; i < LAYOUTS.length; i++) {
    const l = LAYOUTS[(h + i) % LAYOUTS.length];
    if (titleSize(title, l.maxW, l.cap) >= MIN_TITLE) return l.name;
  }
  return 'portrait';
}

export function Cover({ spec, seed = 0, wide = false }: { spec: WorldSpec; seed?: number; wide?: boolean }) {
  const W = 300, H = wide ? 169 : 300;
  const title = spec.meta.title;
  const h = hash(title);
  const uid = `k${seed}${h.toString(36)}`;
  const me = spec.racers.find((r) => r.you) ?? spec.racers[0];
  const rivals = spec.racers.filter((r) => r !== me);
  const lead = rivals[rivals.length - 1] ?? me;
  const bg = backdrop(spec, me.fur);
  const accent = spec.palette.moodRamp[2].accent;
  const layout = wide ? 'wide' : pickLayout(title, h);
  const letter = h & 32 ? '#FFFFFF' : '#FFD84A';
  const id = (i: number) => `${uid}c${i}`;

  let art: React.ReactNode;

  if (layout === 'portrait') {
    art = (
      <>
        <Burst cx={150} cy={170} a={bg.a} b={bg.b} />
        {rivals[0] && <Placed r={rivals[0]} x={44} y={318} s={1.15} accent={accent} uid={id(1)} />}
        {rivals[1] && <Placed r={rivals[1]} x={256} y={318} s={1.15} accent={accent} uid={id(2)} mirror />}
        <Placed r={me} x={150} y={338} s={2.3} accent={accent} uid={id(0)} />
        <Title title={title} x={150} y={290} anchor="middle" maxW={272} cap={46} fill={letter} ink={bg.ink} />
      </>
    );
  } else if (layout === 'versus') {
    const right = hsl((hexToHsl(lead.fur)[0] + 170) % 360, 0.62, lum(lead.fur) > 0.3 ? 0.4 : 0.62);
    art = (
      <>
        <Burst cx={80} cy={170} a={bg.a} b={bg.b} n={14} />
        <path d="M176,0 L300,0 L300,300 L124,300 Z" fill={right} />
        <path d="M168,0 L184,0 L132,300 L116,300 Z" fill="#FFFFFF" />
        <Placed r={me} x={80} y={272} s={1.5} accent={accent} uid={id(0)} />
        <Placed r={lead} x={222} y={272} s={1.5} accent={accent} uid={id(1)} mirror />
        <Title title="VS" x={150} y={140} anchor="middle" maxW={90} cap={50} fill="#FFD84A" ink={bg.ink} from="center" />
        <Title title={title} x={150} y={292} anchor="middle" maxW={276} cap={40} fill={letter} ink={bg.ink} />
      </>
    );
  } else if (layout === 'pack') {
    art = (
      <>
        <Burst cx={150} cy={100} a={bg.a} b={bg.b} n={22} />
        <SpeedLines x={70} y={150} colour="#FFFFFF" />
        <SpeedLines x={290} y={120} colour="#FFFFFF" rows={4} />
        {rivals[2] && <Placed r={rivals[2]} x={150} y={196} s={0.75} accent={accent} uid={id(3)} />}
        {rivals[0] && <Placed r={rivals[0]} x={60} y={234} s={1.05} accent={accent} uid={id(1)} tilt={-6} />}
        {rivals[1] && <Placed r={rivals[1]} x={240} y={234} s={1.05} accent={accent} uid={id(2)} tilt={6} mirror />}
        <Placed r={me} x={150} y={330} s={2.0} accent={accent} uid={id(0)} />
        <Title title={title} x={150} y={292} anchor="middle" maxW={272} cap={44} fill={letter} ink={bg.ink} />
      </>
    );
  } else if (layout === 'track') {
    const road = hsl(hexToHsl(spec.palette.terrain.sand)[0], 0.42, 0.7);
    art = (
      <>
        <Burst cx={210} cy={120} a={bg.a} b={bg.b} n={16} />
        <path d="M-20,262 C80,206 196,226 320,150 L320,238 C204,302 96,300 -20,342 Z" fill={road} stroke={bg.ink} strokeWidth={3} />
        <path d="M-20,302 C86,256 200,266 320,194" fill="none" stroke="#FFFFFF" strokeWidth={4} strokeDasharray="14 12" />
        {rivals[0] && <Placed r={rivals[0]} x={70} y={276} s={0.85} accent={accent} uid={id(1)} tilt={-8} />}
        <SpeedLines x={150} y={200} colour="#FFFFFF" />
        <Placed r={me} x={206} y={284} s={1.55} accent={accent} uid={id(0)} tilt={-7} />
        <Title title={title} x={286} y={50} anchor="end" maxW={214} cap={38} fill={letter} ink={bg.ink} from="top" />
      </>
    );
  } else if (layout === 'side') {
    art = (
      <>
        <Burst cx={228} cy={170} a={bg.a} b={bg.b} n={20} />
        {rivals[0] && <Placed r={rivals[0]} x={58} y={320} s={1.0} accent={accent} uid={id(1)} />}
        <Placed r={me} x={228} y={366} s={2.7} accent={accent} uid={id(0)} />
        <Title title={title} x={16} y={138} anchor="start" maxW={184} cap={40} fill={letter} ink={bg.ink} from="center" />
      </>
    );
  } else {
    // wide: 16:9, for the hero and the game page while the engine boots
    art = (
      <>
        <Burst cx={212} cy={96} a={bg.a} b={bg.b} n={24} />
        <SpeedLines x={196} y={112} colour="#FFFFFF" rows={4} len={50} />
        {rivals[0] && <Placed r={rivals[0]} x={284} y={190} s={0.95} accent={accent} uid={id(1)} mirror />}
        {rivals[1] && <Placed r={rivals[1]} x={158} y={192} s={0.82} accent={accent} uid={id(2)} />}
        <Placed r={me} x={220} y={214} s={1.6} accent={accent} uid={id(0)} />
        <Title title={title} x={14} y={84} anchor="start" maxW={148} cap={34} fill={letter} ink={bg.ink} from="center" />
      </>
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label={`${title} cover`}>
      <defs><clipPath id={`${uid}clip`}><rect width={W} height={H} /></clipPath></defs>
      <g clipPath={`url(#${uid}clip)`}>{art}</g>
    </svg>
  );
}
