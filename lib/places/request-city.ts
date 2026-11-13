import type { PlaceSelection } from './types.ts';

export type CityRequest = { status: 'stub'; place: PlaceSelection; requestedAt: number };

/**
 * STUB. Asks for a town's city: later this calls the Hometown tile service, which compiles each tile
 * on first request and caches it forever by compiler version (Hometown Build Spec v1, Milestone 6).
 * For now it only hands the selection back, with no network call.
 */
export async function requestCity(place: PlaceSelection): Promise<CityRequest> {
  // (geoid and domain: the tile service's descriptor projects the town on the hg1 grid domain its GEOID names)
  const { placeId, name, state, bbox, lat, lon, geoid, domain } = place;
  return { status: 'stub', place: { placeId, name, state, bbox, lat, lon, geoid, domain }, requestedAt: Date.now() };
}
