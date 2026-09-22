import type { WorldSpec } from '@/lib/worldspec';

/**
 * Cover art, drawn from the world itself.
 *
 * A games portal is a wall of thumbnails, and we have no screenshots, so the
 * tile is generated from the WorldSpec: the real sky gradient, the real ground,
 * the world's actual track loop projected into perspective, and the actual cast
 * at their actual rigged proportions. Two worlds look different on the shelf
 * because they *are* different, not because a decorative gradient was seeded.
 */

type P = [number, number, number];

function project(points: P[], scale: number, w: number, hy: number, depth: number) {
  const pts = points.map(([x, , z]) => [x * scale, z * scale] as [number, number]);
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const spanX = Math.max(...xs) - Math.min(...xs) || 1;
  const spanZ = Math.max(...zs) - Math.min(...zs) || 1;
  const midX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const midZ = (Math.max(...zs) + Math.min(...zs)) / 2;
  const k = (w * 0.82) / spanX;
  return pts.map(([x, z]) => [
    w / 2 + (x - midX) * k,
    hy + depth + (z - midZ) * k * 0.4,
  ] as [number, number]);
}

/** Closed Catmull-Rom through the projected points, as one smooth path. */
function loopPath(p: [number, number][]) {
  if (p.length < 3) return '';
  const n = p.length;
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

function Racer({
  x, y, s, fur, skin, rig,
}: { x: number; y: number; s: number; fur: string; skin: string; rig?: WorldSpec['racers'][0]['rig'] }) {
  const g = rig?.girth ?? 1, h = rig?.height ?? 1;
  const rx = 13 * s * g, ry = 16 * s * h;
  const faceR = 6.4 * s * (rig?.faceSize ?? 1);
  const fy = y - ry * 0.42;
  const eye = rig?.eye ?? '#0E0C0B';
  const spread = 2.6 * s * (rig?.eyeSpread ?? 1);
  const eyeR = 1.25 * s * (rig?.eyeSize ?? 1);
  const topper = rig?.topper ?? 'none';
  const tk = (rig?.topperSize ?? 1) * s;
  return (
    <g>
      {topper === 'ears' && (
        <>
          <ellipse cx={x - rx * 0.52} cy={y - ry * 0.92} rx={3.2 * tk} ry={5.4 * tk} fill={fur} />
          <ellipse cx={x + rx * 0.52} cy={y - ry * 0.92} rx={3.2 * tk} ry={5.4 * tk} fill={fur} />
        </>
      )}
      {topper === 'horns' && (
        <>
          <path d={`M${x - rx * 0.44},${y - ry * 0.82} l${-2.4 * tk},${-7 * tk} l${5 * tk},${2.4 * tk} Z`} fill={fur} />
          <path d={`M${x + rx * 0.44},${y - ry * 0.82} l${2.4 * tk},${-7 * tk} l${-5 * tk},${2.4 * tk} Z`} fill={fur} />
        </>
      )}
      {topper === 'antennae' && (
        <>
          <path d={`M${x - rx * 0.3},${y - ry * 0.85} q${-2 * tk},${-5 * tk} ${-4 * tk},${-6.5 * tk}`} stroke={fur} strokeWidth={1.3 * tk} fill="none" strokeLinecap="round" />
          <path d={`M${x + rx * 0.3},${y - ry * 0.85} q${2 * tk},${-5 * tk} ${4 * tk},${-6.5 * tk}`} stroke={fur} strokeWidth={1.3 * tk} fill="none" strokeLinecap="round" />
          <circle cx={x - rx * 0.3 - 4 * tk} cy={y - ry * 0.85 - 6.5 * tk} r={1.9 * tk} fill={fur} />
          <circle cx={x + rx * 0.3 + 4 * tk} cy={y - ry * 0.85 - 6.5 * tk} r={1.9 * tk} fill={fur} />
        </>
      )}
      {topper === 'crest' && (
        <path d={`M${x - 4 * tk},${y - ry * 0.86} q${4 * tk},${-7 * tk} ${8 * tk},0 Z`} fill={fur} />
      )}
      {/* legs */}
      <rect x={x - rx * 0.44} y={y + ry * 0.62} width={3.4 * s} height={5.6 * s * (rig?.legLength ?? 1)} rx={1.7 * s} fill={fur} />
      <rect x={x + rx * 0.44 - 3.4 * s} y={y + ry * 0.62} width={3.4 * s} height={5.6 * s * (rig?.legLength ?? 1)} rx={1.7 * s} fill={fur} />
      {/* body */}
      <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={fur} />
      {/* face */}
      <ellipse cx={x} cy={fy} rx={faceR} ry={faceR * 1.05} fill={skin} />
      <circle cx={x - spread} cy={fy - 0.4 * s} r={eyeR} fill={eye} />
      <circle cx={x + spread} cy={fy - 0.4 * s} r={eyeR} fill={eye} />
    </g>
  );
}

export function Cover({ spec, seed = 0, wide = false }: { spec: WorldSpec; seed?: number; wide?: boolean }) {
  const W = 300, H = wide ? 169 : 300;
  const horizon = wide ? 74 : 138;
  const p = spec.palette;
  const uid = `c${seed}${spec.meta.title.replace(/\W/g, '').slice(0, 6)}`;

  const loop = project(spec.track.points as P[], spec.track.scale, W, horizon, wide ? 40 : 58);
  const path = loopPath(loop);

  // scenery along the horizon, from the world's own cap colours
  const caps = spec.props.caps.palettes;
  const hs = wide ? 0.55 : 1;
  const hills = [0, 1, 2].map((i) => ({
    cx: [60, 168, 262][i],
    cy: horizon + [6, 2, 9][i] * hs,
    rx: [78, 96, 72][i],
    ry: [34, 44, 30][i] * hs,
    fill: i === 1 ? p.terrain.moss : i === 0 ? p.terrain.pale : p.terrain.accent,
  }));

  // the front three racers, biggest first, standing on the near edge of the loop
  const cast = spec.racers.slice(0, 3);
  const spots: [number, number, number][] = wide
    ? [[150, 146, 0.62], [92, 137, 0.52], [208, 139, 0.55]]
    : [[150, 252, 1.0], [86, 238, 0.82], [214, 240, 0.86]];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label={`${spec.meta.title} cover`}>
      <defs>
        <linearGradient id={`${uid}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.skyHigh} />
          <stop offset="52%" stopColor={p.skyMid} />
          <stop offset="100%" stopColor={p.skyLow} />
        </linearGradient>
        <linearGradient id={`${uid}gnd`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.terrain.pale} />
          <stop offset="100%" stopColor={p.terrain.moss} />
        </linearGradient>
        {/* haze belongs at the horizon, where distance actually is */}
        <linearGradient id={`${uid}vig`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.fog} stopOpacity="0" />
          <stop offset="38%" stopColor={p.fog} stopOpacity="0.42" />
          <stop offset="58%" stopColor={p.fog} stopOpacity="0" />
          <stop offset="100%" stopColor={p.fog} stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${uid}clip`}><rect width={W} height={H} rx="0" /></clipPath>
      </defs>

      <g clipPath={`url(#${uid}clip)`}>
        <rect width={W} height={H} fill={`url(#${uid}sky)`} />

        {/* sun / light source */}
        <circle cx={232} cy={wide ? 30 : 54} r={wide ? 17 : 26} fill={p.light} opacity="0.5" />
        <circle cx={232} cy={wide ? 30 : 54} r={wide ? 9 : 13} fill={p.light} opacity="0.85" />

        {/* distant scenery */}
        {caps.slice(0, 4).map((c, i) => {
          const cx = 34 + i * 74, cy = horizon - (wide ? 6 : 10) - (i % 2) * (wide ? 5 : 8), r = (wide ? 11 : 17) - (i % 3) * (wide ? 2 : 3);
          return (
            <g key={i} opacity="0.92">
              <rect x={cx - 1.8} y={cy} width="3.6" height={wide ? 10 : 16} fill={c[2]} />
              <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.6} fill={c[0]} />
            </g>
          );
        })}

        <rect width={W} height={H} fill={`url(#${uid}vig)`} />

        {/* ground */}
        <path d={`M0,${horizon} Q${W / 2},${horizon - (wide ? 9 : 16)} ${W},${horizon} L${W},${H} L0,${H} Z`} fill={`url(#${uid}gnd)`} />
        {hills.map((h, i) => <ellipse key={i} cx={h.cx} cy={h.cy} rx={h.rx} ry={h.ry} fill={h.fill} opacity="0.5" />)}

        {/* the world's actual racing loop */}
        <path d={path} fill="none" stroke={p.terrain.sand} strokeWidth={wide ? 13 : 21} strokeLinejoin="round" opacity="0.96" />
        <path d={path} fill="none" stroke={p.fog} strokeWidth={wide ? 13 : 21} strokeLinejoin="round" opacity="0.16" />
        <path d={path} fill="none" stroke="#fff" strokeWidth={wide ? 1.1 : 1.6} strokeDasharray={wide ? "4 6" : "5 8"} opacity="0.5" strokeLinejoin="round" />

        {/* the cast, at their own proportions */}
        {cast.map((r, i) => (
          <Racer
            key={r.name}
            x={spots[i][0]} y={spots[i][1]} s={spots[i][2]}
            fur={r.fur}
            skin={mixHex(r.fur, '#FDF2DE', 0.72)}
            rig={r.rig}
          />
        ))}

      </g>
    </svg>
  );
}

function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => {
    const x = (pa >> sh) & 255, y = (pb >> sh) & 255;
    return Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}
