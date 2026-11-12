// Mog City: which city this page plays, read in one place. index.html reads the address once (?city=sf: San Francisco,
// anything else New York), picks that city's scripts by it and sets window.NYC.CITY; everything else asks here.
//   cityId()          'ny' | 'sf': window.NYC.CITY once index.html has set it; before that (a module evaluated ahead of
//                     the city's own globals, or a node test with a `location` of its own) the same rule on the address
//   cityQuery(id)     the address part that opens a page in that city (for messages that tell a player where to go)
export const CITIES = { ny: 'New York', sf: 'San Francisco' };

export function cityId() {
  const set = globalThis.window?.NYC?.CITY ?? globalThis.NYC?.CITY;
  if (set === 'sf' || set === 'ny') return set;
  try { return new URLSearchParams(globalThis.location?.search || '').get('city') === 'sf' ? 'sf' : 'ny'; } catch { return 'ny'; }
}

export const cityQuery = (id) => `?city=${id}`;
