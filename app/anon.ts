'use client';
/**
 * The id this browser makes for itself: the "player" behind votes, finished
 * runs and Mog-off picks. With no accounts it stops accidental double counts
 * and nothing more; it is a signal, not an identity.
 */
export function playerId(): string {
  try {
    let id = JSON.parse(localStorage.getItem('gamemog:voter') ?? 'null') as string | null;
    if (!id) {
      id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      localStorage.setItem('gamemog:voter', JSON.stringify(id));
    }
    return id;
  } catch {
    return 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  }
}
