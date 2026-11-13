/**
 * Hometown place search: what a picked place hands on, to the Create page and later to the tile
 * service. Types only, so the browser can import them without the index (lib/places/search.ts).
 */
export type Place = {
  /** Stable: "us-" and the Census GEOID (state FIPS + place FIPS), e.g. "us-4054200" for Okemah, OK. */
  placeId: string;
  name: string;
  /** USPS code, e.g. "OK". */
  state: string;
  stateName: string;
  /** "city", "town", "village", "CDP", ... */
  kind: string;
  /** The Census internal point, degrees. */
  lat: number;
  lon: number;
  /**
   * [west, south, east, north], degrees. APPROXIMATE: a square around the internal point sized from the
   * land and water area (the Gazetteer has no outline); the tile service replaces it with the real extent.
   */
  bbox: [number, number, number, number];
  /** 2010 Census population; null for a place first listed after 2010. */
  pop: number | null;
  landKm2: number;
};

/** What the Create page passes on when a town is picked: the contract with the tile service. */
export type PlaceSelection = Pick<Place, 'placeId' | 'name' | 'state' | 'bbox' | 'lat' | 'lon'>;
