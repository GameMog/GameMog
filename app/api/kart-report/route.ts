import { cookies } from 'next/headers';
import { REPORT_MAX_BYTES, allowReport, cleanReport, kartReports, storeReport } from '@/lib/kart-report';
import { COOKIE, validSession } from '../../admin/session';

export const runtime = 'nodejs';

/**
 * A kart race's crash report (lib/kart-report.ts), sent on by the game page for the sandboxed frame, which has no
 * network of its own. Small, checked field by field, rate-limited; 204 when kept.
 */
export async function POST(req: Request) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return new Response(null, { status: 403 });
  if (Number(req.headers.get('content-length') ?? 0) > REPORT_MAX_BYTES) return new Response(null, { status: 413 });
  const text = await req.text().catch(() => '');
  if (text.length > REPORT_MAX_BYTES) return new Response(null, { status: 413 });
  let b: unknown;
  try { b = JSON.parse(text); } catch { return new Response(null, { status: 400 }); }
  const r = cleanReport(b, req.headers.get('user-agent') ?? '');
  if (!r) return new Response(null, { status: 400 });
  const h = req.headers;
  const who = h.get('x-nf-client-connection-ip') ?? h.get('x-forwarded-for')?.split(',')[0].trim() ?? h.get('x-real-ip') ?? 'local';
  if (!allowReport(who)) return new Response(null, { status: 429 });
  storeReport(r);
  return new Response(null, { status: 204 });
}

/** The newest reports, for the owner only (the /admin session); to anyone else, nothing is here. */
export async function GET() {
  if (!validSession((await cookies()).get(COOKIE)?.value)) return new Response('Not found', { status: 404 });
  return Response.json({ reports: kartReports(200) }, { headers: { 'cache-control': 'no-store' } });
}
