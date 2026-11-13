// Mog City: which city this page plays, read in one place. index.html reads the address once (?city=sf: San Francisco,
// ?city=pkg&pkg=<id>: a Hometown package, anything else New York), picks that city's scripts by it and sets
// window.NYC.CITY; everything else asks here.
//   cityId()          'ny' | 'sf' | 'pkg': window.NYC.CITY once index.html has set it; before that (a module evaluated ahead of
//                     the city's own globals, or a node test with a `location` of its own) the same rule on the address
//   cityQuery(id)     the address part that opens a page in that city (for messages that tell a player where to go)
export const CITIES = { ny: 'New York', sf: 'San Francisco' };

export function cityId() {
  const set = globalThis.window?.NYC?.CITY ?? globalThis.NYC?.CITY;
  if (set === 'sf' || set === 'ny' || set === 'pkg') return set;
  try {
    const Q = new URLSearchParams(globalThis.location?.search || '');
    // (a package by id, ?pkg=, or a town from GameMog by its lock, ?town=&tc=&ts=: wagmi/world/town-src.js)
    return Q.get('city') === 'sf' ? 'sf' : Q.get('city') === 'pkg' && (/^[a-z0-9-]{1,40}$/.test(Q.get('pkg') || '') || /^us-[0-9]{7}$/.test(Q.get('town') || '')) ? 'pkg' : 'ny';
  } catch { return 'ny'; }
}

export const cityQuery = (id) => {
  if (id !== 'pkg') return `?city=${id}`;
  const T = globalThis.window?.NYC?.TOWN;
  return T ? `?city=pkg&town=${T.place}&tc=${T.buildId}&ts=${T.tiles}` : `?city=pkg&pkg=${globalThis.window?.NYC?.PKG?.id || ''}`;
};
