/**
 * Where the owner's screen (app/admin) is served (the owner, 12 Oct: not at /admin, which anyone would try, but at an
 * address of the owner's own). The repo is public, so the address is never written down: only a slow fingerprint of it
 * (PBKDF2-SHA-256, 60,000 rounds), so it cannot be read here or cheaply guessed from here. middleware.ts serves app/admin
 * at the one path whose fingerprint matches and answers /admin itself with the 404 page; the hit beacon drops visits to it.
 *
 * Only a single lowercase segment of 6 to 24 letters is ever fingerprinted, and once per segment (cached), so ordinary
 * pages, assets and games never pay for it. Web Crypto, so it runs in the middleware and in Node alike.
 */
const SALT = 'gamemog-owner-screen-v1';
const ROUNDS = 60000;
const FINGERPRINT = 'dd1e4d74827954117ddebe5fd0cd71e6e877bcf1ea77c536c450e150d0404195';
const seen = new Map<string, boolean>();
// (a fingerprint costs a few tens of milliseconds: at most 30 new words a minute are tried, so a flood of made-up
// addresses cannot tie the server up; past that a word is simply not the owner's, and is tried again next minute)
let budget = 30, refill = 0;

async function fingerprint(word: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(word), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT), iterations: ROUNDS }, key, 256);
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Whether a path (as the address bar has it) is the owner's screen. */
export async function isOwnerPath(pathname: string): Promise<boolean> {
  const m = /^\/([a-z]{6,24})\/?$/.exec(pathname);
  if (!m) return false;
  const word = m[1];
  const hit = seen.get(word);
  if (hit !== undefined) return hit;
  const now = Date.now();
  if (now >= refill) { budget = 30; refill = now + 60_000; }
  if (budget <= 0) return false;
  budget--;
  const yes = (await fingerprint(word)) === FINGERPRINT;
  if (seen.size > 2000) seen.clear();
  seen.set(word, yes);
  return yes;
}
