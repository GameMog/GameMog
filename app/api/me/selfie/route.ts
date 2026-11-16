import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { DEFAULT_ME, KITS, SELFIE_SCHEMA, sanitizeMe } from '@/lib/me';
import { RESTING, SELFIE_EST_USD, SELFIE_LATER, allowSelfie, priceCall, recordPaidCall, resting } from '@/lib/build-limits';
import { townClientKey } from '@/lib/hometown/client';

export const runtime = 'nodejs';

/** Quick and cheap: reading a selfie is a small, visual job. */
const ME_MODEL = process.env.GAMEMOG_ME_MODEL ?? 'claude-sonnet-5';

const PROMPT = `This is a selfie from someone making their own game character: a realistic athlete who will be them in every game. Match what you can see to the character options so the character resembles them.

Report only visible appearance: the colour of their skin (the cheek, in normal light), their hair, their eyes and their build. Do not identify the person, and do not infer their ethnicity, gender or anything else about who they are. The body model is only a starting shape that they can change.

If the photo does not clearly show exactly one person's face, set usable to false. If the person is clearly a young child, set youngChild to true.`;

const say = (status: number, error: string) => NextResponse.json({ error }, { status });

/**
 * One selfie in, a character out (docs/PRODUCT.md: a resemblance, never a
 * copy). The photo is read once, in memory, and is never written anywhere:
 * not to the database, not to disk, not to a log. Only the character, a few
 * colours and choices, goes back to the page.
 */
export async function POST(req: Request) {
  let body: { image?: unknown; age13?: unknown };
  try { body = await req.json(); } catch { return say(400, 'Malformed request.'); }
  if (body.age13 !== true) return say(403, 'GameMog is for people 13 and over.');
  const m = typeof body.image === 'string' ? /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(body.image) : null;
  if (!m) return say(400, 'Send one photo: JPEG, PNG or WebP.');
  if (m[2].length > 2_800_000) return say(413, 'That photo is too large.');
  if (!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)) {
    return say(503, 'Reading a selfie needs the model, which is not set up here. You can pick your look instead.');
  }
  // the owner's key (16 Nov, lib/build-limits.ts): no call once the day's spend is at its ceiling, a few reads an hour per
  // address and a ceiling an hour for the site, and every call's cost counted in the day's spend
  if (resting()) return NextResponse.json({ error: RESTING, resting: true }, { status: 503 });
  if (!allowSelfie(townClientKey(req))) return NextResponse.json({ error: SELFIE_LATER }, { status: 429, headers: { 'retry-after': '900' } });

  let res: Anthropic.Message;
  try {
    res = await new Anthropic().messages.create({
      model: ME_MODEL,
      max_tokens: 600,
      output_config: { format: { type: 'json_schema', schema: SELFIE_SCHEMA as unknown as Record<string, unknown> } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: m[1] as 'image/jpeg' | 'image/png' | 'image/webp', data: m[2] } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });
  } catch (e) {
    recordPaidCall('selfie', SELFIE_EST_USD);
    return say(502, `The photo could not be read right now (${(e as Error).message.slice(0, 120)}).`);
  }
  recordPaidCall('selfie', priceCall(ME_MODEL, res.usage));
  if (res.stop_reason === 'refusal') return say(422, 'That photo could not be used. Try another, or pick your look instead.');

  let r: { usable?: boolean; youngChild?: boolean; tone?: string; hair?: string; hairColor?: string; eyes?: string; build?: string; body?: string };
  try {
    const text = res.content.find((b) => b.type === 'text');
    r = JSON.parse(text && text.type === 'text' ? text.text : '');
  } catch { return say(502, 'The photo could not be read right now.'); }
  if (r.youngChild) return say(403, 'GameMog is for people 13 and over.');
  if (!r.usable) return say(422, 'We need one clear photo of your face.');

  const me = sanitizeMe({
    ...DEFAULT_ME, body: r.body, tone: r.tone, hair: r.hair, hairColor: r.hairColor, eyes: r.eyes, build: r.build,
    kit: KITS[Math.floor(Math.random() * KITS.length)],
  });
  return NextResponse.json({ me });
}
