// The network TileSource (wagmi/world/tiles.js) for Hometown tiles on the national grid hg1: each tile fetched as the
// compiler wrote it (tools/hometown/compile.py, HTL1: gzip of 'HTL1', u32 header length, the JSON header, sections),
// from a tile store or the tile service: GET {base}/tiles/{buildId}/hg1-{domain}/0/{c}/{r} (server/tiles, or the
// compiler's own store served statically: ?tileBase=, default /.scratch/hometown/store), decoded and placed in the
// session frame (cities/sf/docs/STREAMING.md section 2):
//   tile (c, r) at x0 = (c - c0) 512 / k0, z0 = (r - r0) 512 / k0, size 512 / k0 (square: k0 is the descriptor's)
//   vertices tile-local float32, u / (100 k0) (never an absolute grid metre in float32: |v| <= ~530 m)
//   heights: 257 x 257 posts, step 2 / k0, y = cm / 100 - yOffset, with the interim water shim (one engine water
//            level: wet posts within 1 m of it are engine water, every other post >= waterLevel + 0.3)
// Layers: heights, mask (512 x 512 1 m cells, cell 1 / k0; class 6 water), buildings, roads (nodes by id, links by
// node id: the runtime stitches border nodes 'b:...' across tiles), header. has(ix, iz): the descriptor's tile set or
// else the domain's bounds. Decoding runs on the page's thread (DecompressionStream, async): a worker is the next step.
import { TILE, TILE_CM, BOUNDS, tileId } from './grid.js';

const td = new TextDecoder();

// HTL1 bytes (already gunzipped) -> { header, sections: { name: Uint8Array | object } }
export function parseHTL1(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (td.decode(u8.subarray(0, 4)) !== 'HTL1') throw new Error('not an HTL1 tile');
  const n = dv.getUint32(4, true);
  const header = JSON.parse(td.decode(u8.subarray(8, 8 + n)));
  const o = 8 + n, sections = {};
  for (const s of header.sections) {
    const b = u8.slice(o + s.offset, o + s.offset + s.bytes);
    sections[s.name] = s.enc === 'json' ? JSON.parse(td.decode(b))
      : s.enc === 'u16' ? new Uint16Array(b.buffer, 0, b.byteLength / 2)
        : s.enc === 'i32' ? new Int32Array(b.buffer, 0, b.byteLength / 4) : b;
    sections[s.name + 'Enc'] = s.enc;
  }
  return { header, sections };
}

async function gunzip(buf) {
  const ds = new DecompressionStream('gzip');
  return new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer());
}

// The interim water shim for one post: engine water (y = wl) or land at least 0.3 m above it. An inner post reads its
// 1 m mask cell (the post is the cell's NW corner). A post on the tile's edge is shared with the neighbour, which holds
// none of this tile's mask cells (and this tile none of its), so a mask read there could decide differently on the two
// sides and crack the seam: an edge post decides from its height alone, which both tiles hold to the cm. It is engine
// water when it sits exactly at the engine level (the compiler sets a wet post to its water's level_cm, and only wet
// posts land on it but for a chance cm-exact bank post).
export function engineWater(postCm, y, i, j, P, mask, wl, wlCm) {
  const edge = i === 0 || j === 0 || i === P - 1 || j === P - 1;
  const wet = edge ? postCm === wlCm : mask[2 * j * 512 + 2 * i] === 6 && Math.abs(y - wl) <= 1;
  return wet ? wl : Math.max(y, wl + 0.3);
}

// a decoded tile -> its layers in the session frame fr = { c0, r0, k0, yOffset, waterLevel }
export function placeTile(fr, { header: h, sections: s }) {
  const k0 = fr.k0, c = h.c, r = h.r;
  const x0 = ((c - fr.c0) * TILE) / k0, z0 = ((r - fr.r0) * TILE) / k0;
  const P = h.posts, cm = new Float64Array(P * P);
  if (s.terrainEnc === 'u16') for (let i = 0; i < P * P; i++) cm[i] = s.terrain[i] + h.base_cm;
  else for (let i = 0; i < P * P; i++) cm[i] = s.terrain[i];
  const wl = fr.waterLevel, hasWater = Number.isFinite(wl) && wl > -9.99;
  // (the engine level in absolute cm: the compiler flattens a wet post to its water's level_cm exactly, and the package's
  // waterLevel is that level minus yOffset)
  const wlCm = Math.round((wl + fr.yOffset) * 100);
  const hf = new Float32Array(P * P);
  for (let j = 0; j < P; j++) for (let i = 0; i < P; i++) {
    let y = cm[j * P + i] / 100 - fr.yOffset;
    if (hasWater) {
      y = engineWater(cm[j * P + i], y, i, j, P, s.mask, wl, wlCm);
    }
    hf[j * P + i] = y;
  }
  const loc = (u) => u / (100 * k0);
  const bv = s.bverts || new Int32Array(0), verts = new Float32Array(bv.length);
  for (let i = 0; i < bv.length; i++) verts[i] = loc(bv[i]);
  const nodes = (s.roads?.nodes || []).map((n) => ({ id: n.id, x: x0 + loc(n.u), z: z0 + loc(n.v), control: n.control ?? 0, border: !!n.border }));
  // (a deck's profile, elev [step cm, y cm NAVD88...]: session metres, as the legacy package's link field [12])
  const links = (s.roads?.links || []).map((l) => ({ ...l, pts: l.pts.map(([u, v]) => [x0 + loc(u), z0 + loc(v)]),
    ...(l.elev ? { elev: [l.elev[0] / (100 * k0), ...l.elev.slice(1).map((y) => y / 100 - fr.yOffset)] } : {}) }));
  return {
    header: h, x0, z0, size: TILE / k0,
    heights: { x0, z0, step: 2 / k0, n: P, h: hf },
    mask: { x0, z0, cell: 1 / k0, n: 512, m: s.mask },
    buildings: { origin: [x0, z0], records: (s.buildings || []).map((b) => ({ ...b, base: b.base / 100 - fr.yOffset, roof: b.roof / 100 - fr.yOffset, peak: b.peak / 100 - fr.yOffset })), verts },
    roads: { nodes, links },
    blocks: s.blocks || [], places: s.places || [], water: s.water || [], trees: s.trees || new Int32Array(0),
  };
}

// createNetTileSource({ base, buildId, domain, c0, r0, k0, yOffset, waterLevel, tiles?: Set of ids, fetch? })
export function createNetTileSource(o) {
  const get = o.fetch || ((u) => fetch(u));
  const [bc, br] = BOUNDS[o.domain];
  return {
    id: 'hg1-' + o.domain, version: o.buildId, grid: 'hg1', domain: o.domain, c0: o.c0, r0: o.r0, size: TILE / o.k0,
    has(ix, iz) {
      const c = o.c0 + ix, r = o.r0 + iz;
      if (o.tiles) return o.tiles.has(tileId(o.domain, c, r));
      return c >= 0 && r >= 0 && c <= bc && r <= br;
    },
    async load(ix, iz) {
      const t0 = globalThis.performance?.now?.() ?? Date.now();
      const c = o.c0 + ix, r = o.r0 + iz;
      const res = await get(`${o.base}/tiles/${o.buildId}/hg1-${o.domain}/0/${c}/${r}`);
      if (!res.ok) throw new Error(`tile ${tileId(o.domain, c, r)}: HTTP ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      // (the store's bytes are gzip; a service that already decoded them sends HTL1 itself)
      const raw = buf[0] === 0x1f && buf[1] === 0x8b ? await gunzip(buf) : buf;
      const tile = placeTile(o, parseHTL1(raw));
      return { bytes: buf.byteLength, layers: tile, ms: (globalThis.performance?.now?.() ?? Date.now()) - t0 };
    },
  };
}
export { TILE_CM };
