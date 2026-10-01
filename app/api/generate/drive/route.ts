import { NextResponse } from 'next/server';
import { submitDrive } from '@/lib/test-drive';

export const runtime = 'nodejs';

/**
 * The creator's page reports the test drive it ran (lib/test-drive.ts). Only a
 * draft the builder is waiting on, with the token the build stream gave that
 * page, is accepted; anything else is refused.
 */
export async function POST(req: Request) {
  let body: { draftId?: unknown; token?: unknown; raw?: unknown; cover?: unknown; covers?: unknown; artIcon?: unknown; artWide?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Malformed request.' }, { status: 400 }); }
  if (typeof body.draftId !== 'string' || typeof body.token !== 'string') return NextResponse.json({ error: 'Malformed request.' }, { status: 400 });
  const ok = submitDrive(body.draftId, body.token, (body.raw ?? {}) as Record<string, unknown>, { cover: body.cover, covers: body.covers, artIcon: body.artIcon, artWide: body.artWide });
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'No test drive is waiting for that.' }, { status: 404 });
}
