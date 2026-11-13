// The national grid hg1 for the tile service: the domain registry, its key bounds and the id grammar, re-exported from
// the client's twin (wagmi/world/grid.js, itself checked against tools/hometown/grid-vectors.json, which the Python
// compiler writes and is the only authority on projection and ownership). The service never computes which tiles a
// place covers: that list comes from the compiler's session descriptor (stage 1).
export { GRID, DOMAINS, BOUNDS, TILE, TILE_CM, CTX_L, BLOCK_L, domain, domainOfGeoid, tileId, parseTileId, checkTile, tileSetLines } from '../../../wagmi/world/grid.js';
