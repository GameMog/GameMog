/**
 * Story Kit: the anchors (storykit/anchors.json, scripts/forge/anchors). Part of `npm run check`: every anchor is an
 * archetype the pack schema allows, its sheet is on disk, a valid Character Forge sheet named for it, an invented person
 * (no name the names check blocks), with a label, who and when to pick it; no two share a silhouette (sex, top, hair, headwear),
 * a hair style and colour within one body, or a build and height.
 */
import { readFileSync, existsSync } from 'node:fs';
import { ANCHORS } from '../storykit/pack/schema.mjs';
import { Validator } from '../storykit/pack/validate.ts';
import { isBlocked } from '../lib/names.ts';
import FORGE from './forge/character-sheet.schema.json' with { type: 'json' };

type Ok = (name: string, cond: boolean, detail?: string) => void;

export function runAnchorChecks(ok: Ok) {
  console.log('\nStory Kit: the anchors (hand-tuned sheets the builder picks from)');
  const A = JSON.parse(readFileSync('storykit/anchors.json', 'utf8')).anchors as { id: string; label: string; sheet: string; who: string; pick: string }[];
  ok(`every anchor is an archetype the pack schema allows, ids unique (${A.length})`, A.length >= 12 && A.every((a) => (ANCHORS as string[]).includes(a.id)) && new Set(A.map((a) => a.id)).size === A.length,
    A.filter((a) => !(ANCHORS as string[]).includes(a.id)).map((a) => a.id).join(' '));
  ok('every anchor has a label, who it is and when to pick it', A.every((a) => a.label && a.who?.length > 20 && a.pick?.length > 20));
  const v = new Validator([FORGE as any]);
  const sheets = A.map((a) => (existsSync(a.sheet) ? JSON.parse(readFileSync(a.sheet, 'utf8')) : null));
  const bad = A.filter((a, i) => { const s = sheets[i]; return !s || s.id !== `anchor-${a.id}` || s.voice?.id !== `anchor-${a.id}-v1` || v.check((FORGE as any).$id, s).problems.length; });
  ok('every anchor\'s sheet is on disk, named for it, and a valid Character Forge sheet', !bad.length, bad.map((a) => a.id).join(' '));
  ok('every anchor is an invented person (no name the names check blocks)', sheets.every((s) => s && !isBlocked(s.name)), sheets.filter((s) => s && isBlocked(s.name)).map((s) => s.name).join(', '));
  const sil = sheets.filter(Boolean).map((s) => `${s.identity.body}|${s.wardrobe.top.item}|${s.hair.style}|${s.wardrobe.headwear?.item || 'none'}`);
  ok('no two anchors share a silhouette (body, top, hair, headwear)', new Set(sil).size === sil.length);
  // (MV: the club promoter twinned the young hero (same curls, same build, same face words) and the teen and the nurse
  // shared twists: no two anchors of one body share a hair style in one colour, and none shares another's build and height (within 3 cm))
  const S = sheets.filter(Boolean), hair = S.map((s) => `${s.identity.body}|${s.hair.style}|${s.hair.color}`);
  ok('no two anchors of one body share a hair style and colour', new Set(hair).size === hair.length, hair.filter((h, i) => hair.indexOf(h) !== i).join(' '));
  const twin = S.flatMap((a, i) => S.slice(i + 1).filter((b) => a.identity.body === b.identity.body && JSON.stringify(a.identity.build) === JSON.stringify(b.identity.build) && Math.abs(a.identity.heightCm - b.identity.heightCm) <= 3).map((b) => a.id + '~' + b.id));
  ok('no two anchors share a build and a height (within 3 cm)', !twin.length, twin.join(' '));
  const ages = sheets.filter(Boolean).map((s) => s.identity.age), sexes = new Set(sheets.filter(Boolean).map((s) => s.identity.body));
  ok('the anchors span ages and both sexes', Math.min(...ages) < 20 && Math.max(...ages) > 70 && sexes.size === 2);
}
