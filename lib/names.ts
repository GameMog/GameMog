/**
 * What a player types that other players will read (the dare loop, 10 Oct): a name on a game or a dare, and a dare's
 * short message. No accounts, so this is the whole of the moderation a player's words get before they are shown; the
 * owner can still hide a dare or a game from /admin. Pure (no node imports), so a page can check as you type and the
 * server checks again.
 *
 * Every check runs on a normalised copy: NFKC (full-width and maths letters become plain ones), lookalike Cyrillic and
 * Greek letters read as Latin, leetspeak read as letters (0 as o, 1 as i, 3 as e, @ as a, $ as s...), camelCase and
 * separators split into words, and the separators removed for the strongest words, which are matched anywhere, with
 * any letter repeated. Shorter words that hide inside ordinary ones (Scunthorpe, therapist, cocktail) only match as a
 * whole word, plural or -ed/-er/-ing forms included.
 *
 * The lists are kept modest and stored ROT13, so the public repo does not read as a list of slurs.
 */

export type Clean = { ok: true; value: string } | { ok: false; error: string };

/** Direction overrides, isolates and marks, zero-width characters and other invisible formatting. */
const INVISIBLE = /[\p{Cc}\p{Cf}\u2028\u2029]/gu;

const rot13 = (s: string) => s.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + 13) % 26) + 97));
const list = (s: string) => s.split(' ').filter(Boolean).map(rot13);

/** Matched anywhere in the separator-free form. */
const ANYWHERE = list('avttre avttn avtyrg snttbg ergneq genaal jrgonpx shpx fuvg juber fyhg ovgpu nffubyr onfgneq cbea uvgyre xvyylbhefrys enturnq gbjryurnq wvmm cravf intvan qvyqb furznyr fvrturvy qvpxurnq pbpxfhpxre');
/** Matched as a whole word (with a plural or -ed, -er, -ers, -ing ending). */
const WORDS = list('phag encvfg crqb cnrqb xlf anmv puvax tbbx xvxr fcvp pbba ornare qlxr cnxv qvpx pbpx chffl phz encr nany gjng jnax jnaxre snt avt urvy xxx gvgf obbof');
/** Names only GameMog itself could carry: anywhere in the name ("TheGameMogTeam")... */
const RESERVED_ANYWHERE = ['gamemog', 'moderator', 'official'];
/** ...as a word in it ("Site Admin", "StaffBot")... */
const RESERVED_WORDS = ['admin', 'administrator', 'staff', 'support', 'mod', 'mods', 'owner'];
/** ...or as the whole name. */
const RESERVED_WHOLE = ['team', 'system', 'root', 'anon', 'anonymous', 'null', 'undefined', 'you', 'me', 'gm', 'discord'];

/** Phrases, matched on the words in order (kill yourself). */
const PHRASES = new RegExp(`(?:^| )(?:${list('xvyy arpx unat').join('|')}) (?:${list('lbhefrys lbhe frys hefrys lbfrys').join('|')})(?: |$)`);

// each letter may repeat (fuuuck), so "aaa" in the list reads as "a+" in the text
const anyRe = new RegExp(ANYWHERE.map((w) => w.split('').map((c) => `${c}+`).join('')).join('|'));
const wordRe = new RegExp(`^(?:${WORDS.join('|')})(?:s|es|ed|er|ers|ing)?$`);

// lookalike letters from other scripts that read as Latin ones
const HOMOGLYPH: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ɡ: 'g', ո: 'n',
  α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ω: 'w',
};
const LEET: Record<string, string> = { '0': 'o', '2': 'z', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', $: 's', '!': 'i', '|': 'l', '+': 't', '€': 'e', '£': 'l', '¡': 'i' };

/**
 * The forms a text is checked in. words: split on anything not a letter (and, in one pass, on camelCase), with letters
 * spelled out one at a time (c o c k, c.o.c.k) run back together. chunks: each space-separated piece with everything
 * but its letters removed (f.u_c-k), where the strongest words are matched anywhere. Each with and without leetspeak,
 * with 1 read as i and as l. lines: the words in order, for phrases. whole: all of its letters run together (only for a whole reserved name).
 */
function forms(text: string): { words: string[]; chunks: string[]; whole: string[]; lines: string[] } {
  const out = { words: [] as string[], chunks: [] as string[], whole: [] as string[], lines: [] as string[] };
  const plain = text.normalize('NFKC').replace(INVISIBLE, '');
  for (const camel of [false, true]) {
    const base = (camel ? plain.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2') : plain)
      .toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/./gu, (c) => HOMOGLYPH[c] ?? c);
    for (const one of ['i', 'l']) {
      for (const leet of [false, true]) {
        const t = leet ? base.replace(/[0-9@$!|+€£¡]/g, (c) => (c === '1' ? one : LEET[c] ?? c)) : base;
        const words = t.split(/[^a-z]+/).filter(Boolean);
        let run = '';
        for (const w of words) {
          if (w.length === 1) { run += w; continue; }
          if (run.length > 1) out.words.push(run);
          run = '';
          out.words.push(w);
        }
        if (run.length > 1) out.words.push(run);
        if (!camel) out.lines.push(words.join(' '));
        if (!camel) { out.chunks.push(...t.split(/\s+/).map((c) => c.replace(/[^a-z]/g, '')).filter(Boolean)); out.whole.push(t.replace(/[^a-z]/g, '')); }
      }
    }
  }
  return out;
}

/** Whether a text carries a blocked word, however it is spelled out. */
export function isBlocked(text: string): boolean {
  const f = forms(text);
  return f.chunks.some((c) => anyRe.test(c)) || f.words.some((w) => wordRe.test(w) || anyRe.test(w)) || f.lines.some((l) => PHRASES.test(l));
}

/** Whether a name reads as GameMog's own (GameMog, Admin, Official...). */
export function isReserved(name: string): boolean {
  const f = forms(name);
  return f.chunks.some((c) => RESERVED_ANYWHERE.some((r) => c.includes(r))) || f.words.some((w) => RESERVED_WORDS.includes(w))
    || f.whole.some((w) => RESERVED_WHOLE.includes(w));
}

const strip = (v: string) => v.normalize('NFKC').replace(/[\t\n\r]/g, ' ').replace(INVISIBLE, '');
const length = (v: string) => [...v].length;

/**
 * A player's name, as shown on a game ("Created by") and a dare ("A dare from"): 2 to 20 letters, numbers, spaces and
 * . ' _ - (anything else is dropped, as lib/me.ts does), not GameMog's own, and nothing blocked.
 */
export function cleanName(input: unknown): Clean {
  if (typeof input !== 'string') return { ok: false, error: 'Add your name.' };
  const v = strip(input).replace(/[^\p{L}\p{N} .'_-]/gu, '').replace(/\s+/g, ' ').replace(/^[ .'_-]+|[ .'_-]+$/g, '');
  if (length(v) < 2) return { ok: false, error: 'Use at least 2 letters.' };
  if (length(v) > 20) return { ok: false, error: 'Keep it to 20 letters.' };
  if (!/\p{L}/u.test(v)) return { ok: false, error: 'Use at least one letter.' };
  if (isReserved(v)) return { ok: false, error: 'That name is taken.' };
  if (isBlocked(v)) return { ok: false, error: 'Pick another name.' };
  return { ok: true, value: v };
}

/** Links are not part of a dare: no web addresses, written out or bare (x.com, discord.gg/...). */
const LINK = /(?:https?:|www\.|\b[a-z0-9-]{1,63}\s?(?:\.|\(dot\)|\[dot\])\s?(?:com|net|org|gg|io|ly|me|xyz|app|co|tv|ru|info|link|site|online|shop|live)\b)/i;

/**
 * A dare's message: one line, at most 140 characters, no links, nothing blocked. Empty is fine ({ ok: true, value: '' }).
 * Invisible characters go; a long run of combining marks (stacked "Zalgo" text) is cut to two.
 */
export function cleanMessage(input: unknown): Clean {
  if (input == null) return { ok: true, value: '' };
  if (typeof input !== 'string') return { ok: false, error: 'That message did not come through.' };
  const v = strip(input).replace(/(\p{M}{2})\p{M}+/gu, '$1').replace(/\s+/g, ' ').trim();
  if (length(v) > 140) return { ok: false, error: 'Keep it to 140 characters.' };
  if (LINK.test(v)) return { ok: false, error: 'No links in a dare.' };
  if (isBlocked(v)) return { ok: false, error: 'Keep it friendly.' };
  return { ok: true, value: v };
}
