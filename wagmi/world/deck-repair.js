// Mog City, Hometown towns: a town's deck profiles mended as its bundle arrives, before the city's scripts read them
// (index.html, a town from GameMog or a package: window.NYC.GEO.roadGraph). Stored worlds keep the build their town was
// pinned to, so what the compiler got wrong in a build is put right here, at play time, for every build.
//
// A V to the water (the owner, 15 Nov, Cold Harbor: "the road and bridges ... some were broken"): a deck node where the
// compiler's solve (tools/hometown/compile.py _closure, grade.py) anchored a bridge's deck to the ground because the
// pieces meeting there began in different solve cells (Long Beach's cell line runs along the LA River's east bank): the
// PCH and Queensway decks came down to the river's surface mid-span and climbed out again at the steepest grade. Such a
// node (every link at it a deck, none a tunnel; every one of them climbing away from it, DIP_RISE over the first
// DIP_PROBE m; the node itself near the ground) is lifted onto the line between where each side's climb levels off,
// and each link's profile blended up to that line from the node to there (never lowered: what stands higher stays).
//   repairDecks(GEO) -> { lifted: [{ node, x, z, from, to }] }   (mutates GEO.roadGraph.links' field [12] in place)
export const DIP_PROBE = 20;     // m: how far along each link the climb away from the node is measured
export const DIP_RISE = 0.06;    // grade every link at the node climbs away from it, at least
export const DIP_GROUND = 2.5;   // m: the node stands at most this far over the lowest of its links' ends (its anchor)
export const LEVEL_GRADE = 0.02; // the climb has levelled off once the next 10 m rise less than this
export const MAX_REACH = 400;    // m: a side's climb is looked at this far out, at most
const TUNNEL = 2;

function linkPts(N, l) {
  const pts = [[N[2 * l[0]], N[2 * l[0] + 1]]];
  const inner = l[6] || [];
  for (let k = 0; k + 1 < inner.length; k += 2) pts.push([inner[k], inner[k + 1]]);
  pts.push([N[2 * l[1]], N[2 * l[1] + 1]]);
  return pts;
}
function lengthOf(pts) { let L = 0; for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); return L; }
// the profile's height s m from the link's first point
function at(elev, s) {
  const st = elev[0], n = elev.length - 1;
  const f = Math.max(0, s) / st, k = Math.floor(f);
  if (k >= n - 1) return elev[n];
  return elev[1 + k] + (elev[2 + k] - elev[1 + k]) * (f - k);
}
// a link seen from one of its ends: its height d m away from that end
const side = (o) => (d) => at(o.elev, o.end === 'a' ? d : o.L - d);
// the unit direction a link leaves the node by
function leave(o) {
  const p = o.end === 'a' ? o.pts : o.pts.slice().reverse();
  let k = 1; while (k < p.length - 1 && Math.hypot(p[k][0] - p[0][0], p[k][1] - p[0][1]) < 8) k++;
  const dx = p[k][0] - p[0][0], dz = p[k][1] - p[0][1], m = Math.hypot(dx, dz) || 1;
  return [dx / m, dz / m];
}

export function repairDecks(GEO) {
  const out = { lifted: [] };
  const RG = GEO && GEO.roadGraph, N = RG && RG.nodes, links = RG && RG.links;
  if (!Array.isArray(N) || !Array.isArray(links)) return out;
  const inc = new Map();
  links.forEach((l, i) => {
    if (!Array.isArray(l)) return;
    for (const [n, end] of [[l[0], 'a'], [l[1], 'b']]) { if (!inc.has(n)) inc.set(n, []); inc.get(n).push({ i, end }); }
  });
  const isDeck = (l) => Array.isArray(l[12]) && l[12].length > 2 && l[12][0] > 0 && !((l[7] || 0) & TUNNEL);
  for (const [n, list] of inc) {
    if (list.length < 2 || list.some(({ i }) => !isDeck(links[i]))) continue;
    const sides = list.map(({ i, end }) => { const l = links[i], pts = linkPts(N, l); return { i, end, l, elev: l[12], pts, L: lengthOf(pts) }; });
    if (sides.some((o) => o.L < 4)) continue;
    const y0s = sides.map((o) => side(o)(0)), y = Math.min(...y0s);
    if (Math.max(...y0s) - y > 0.5) continue; // (the links don't meet at one height there: not one node's anchor)
    // every side climbs away from it
    const rises = sides.map((o) => { const d = Math.min(DIP_PROBE, o.L); return (side(o)(d) - side(o)(0)) / d; });
    if (Math.min(...rises) < DIP_RISE) continue;
    // ... and where each side's climb levels off (or its link ends, or MAX_REACH)
    for (const o of sides) {
      const h = side(o), lim = Math.min(o.L, MAX_REACH);
      let d = Math.min(DIP_PROBE, lim);
      while (d + 10 <= lim && (h(d + 10) - h(d)) / 10 >= LEVEL_GRADE) d += 10;
      o.reach = d; o.top = h(d); o.dir = leave(o);
    }
    // the node's own anchor: no higher than the lowest end's ground it was pinned to (DIP_GROUND), the plateaus well over it
    if (Math.min(...sides.map((o) => o.top)) - y < 3) continue;
    // the line between the two sides most nearly opposite (the road through it): its height at the node
    let best = null;
    for (let a = 0; a < sides.length; a++) for (let b = a + 1; b < sides.length; b++) {
      const c = sides[a].dir[0] * sides[b].dir[0] + sides[a].dir[1] * sides[b].dir[1];
      if (!best || c < best.c) best = { c, A: sides[a], B: sides[b] };
    }
    if (!best || best.c > -0.5) continue; // (no road runs through it: a dead end's ramp foot, left as it is)
    const { A, B } = best;
    const H = A.top + (B.top - A.top) * (A.reach / (A.reach + B.reach));
    if (H - y < DIP_GROUND) continue;
    // each side's profile blended up to the line from H at the node to where its climb levelled off
    for (const o of sides) {
      const e = o.elev, st = e[0], n = e.length - 1, reach = o.reach, top = o.top;
      for (let k = 0; k < n; k++) {
        const s = Math.min(o.L, k * st), d = o.end === 'a' ? s : o.L - s;
        if (d > reach) continue;
        const line = H + (top - H) * (d / reach);
        if (line > e[1 + k]) e[1 + k] = +line.toFixed(2);
      }
    }
    out.lifted.push({ node: n, x: N[2 * n], z: N[2 * n + 1], from: +y.toFixed(2), to: +H.toFixed(2) });
  }
  return out;
}
