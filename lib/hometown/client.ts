/**
 * The address a request is counted against, read only from a header the client cannot write: a new town build (POST
 * /api/towns, HOMETOWN_PER_IP_HOUR), and since 16 Nov every other per-address limit too: the owner's sign-in lockout
 * (app/admin/session.ts signInKey), the kart crash reports (app/api/kart-report), the dares (lib/dare.ts clientKey) and the
 * machine reports (app/api/perf). They took the first X-Forwarded-For (or Netlify's or Cloudflare's header) as sent, so a
 * client that sent its own got a fresh address on every ask. (The local checks that send their own X-Forwarded-For still
 * name themselves: with no proxy, the one hop is theirs, below.)
 *
 *   On Render (RENDER=true, which Render sets on every service): Render serves a web service through Cloudflare, whose
 *   edge sets CF-Connecting-IP and True-Client-IP itself (a value a client sent is replaced), while Render's own proxy
 *   only appends to X-Forwarded-For (a client's entries stay at its left). So the address is CF-Connecting-IP, else
 *   True-Client-IP, else the last X-Forwarded-For hop (the one Render's proxy added).
 *   Elsewhere (a local server, or another host behind one proxy): the last X-Forwarded-For hop, the one the nearest
 *   proxy added; a client's own entries are to its left and never read. (Next's own server fills X-Forwarded-For with
 *   the socket's address only when it is missing, so with no proxy at all, a local dev server, a client can still name
 *   itself: there is nothing to trust there.) Cloudflare's headers are
 *   not read off Render: nothing there replaces them. HOMETOWN_TRUSTED_HOPS=n (1 to 5, default 1) reads the n-th hop
 *   from the right, for a host behind n proxies.
 *   None of these: 'local'.
 */
const IP = /^[0-9A-Fa-f:.]{2,45}$/;
const clean = (v: string | null | undefined): string | null => { const s = (v ?? '').trim(); return s && IP.test(s) ? s : null; };

export function townClientKey(req: { headers: { get(name: string): string | null } }, env: Record<string, string | undefined> = process.env): string {
  const h = req.headers;
  const hops = (h.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const n = Math.min(5, Math.max(1, Math.floor(Number(env.HOMETOWN_TRUSTED_HOPS) || 1)));
  const hop = clean(hops[hops.length - n]);
  if (env.RENDER === 'true') return clean(h.get('cf-connecting-ip')) ?? clean(h.get('true-client-ip')) ?? hop ?? 'local';
  return hop ?? 'local';
}
