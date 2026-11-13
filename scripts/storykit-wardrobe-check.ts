/**
 * Story Kit: a forged person's clothes follow their work (lib/storykit-wardrobe.ts). Part of `npm run check`; alone:
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-wardrobe-check.ts
 *
 * Okemah's fixture hero, "the mechanic who came home", was written in a business suit (suit-jacket, forged with a shirt
 * and tie): the build now gives him the mechanic anchor's work clothes and boots, and leaves the boss's suit, the ally's
 * coat and the muscle's jacket alone (no hands-on work in their words). A look or role that asks for a suit keeps it; a
 * farmer gets overalls; the fitted sheet is still a valid Character Forge sheet; fitting twice changes nothing.
 */
import { readFileSync } from 'node:fs';
import { Validator } from '../storykit/pack/validate.ts';
import FORGE from './forge/character-sheet.schema.json' with { type: 'json' };
import { fitWardrobe, fitCastWardrobes, workOf } from '../lib/storykit-wardrobe.ts';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export function runWardrobeChecks(ok: Ok) {
  console.log('\nStory Kit: clothes follow the work (lib/storykit-wardrobe.ts)');
  const v = new Validator([FORGE as any]);
  for (const f of ['storykit/hometown/fixtures/okemah.reply.json', 'storykit/hometown/fixtures/okemah-us-4054200.reply.json']) {
    const pack = clone(JSON.parse(readFileSync(f, 'utf8')).pack);
    const before = Object.fromEntries(pack.cast.map((c: any) => [c.id, JSON.stringify(c.sheet?.wardrobe)]));
    const fitted = fitCastWardrobes(pack, null);
    const hero = pack.cast.find((c: any) => c.id === pack.hero).sheet;
    ok(`${f.split('/').pop()}: the mechanic hero in work clothes (${hero.wardrobe.top.item}, ${hero.wardrobe.bottom.item}, ${hero.wardrobe.shoes.item}), no suit`,
      hero.wardrobe.top.item === 'uniform-jacket' && hero.wardrobe.shoes.item === 'work-boots' && !/suit/.test(JSON.stringify(hero.wardrobe)), JSON.stringify(fitted));
    ok(`${f.split('/').pop()}: only the hero changed (the boss, the ally and the muscle keep theirs)`, Object.keys(fitted).join() === pack.hero
      && pack.cast.filter((c: any) => c.id !== pack.hero).every((c: any) => JSON.stringify(c.sheet?.wardrobe) === before[c.id]), Object.keys(fitted).join());
    const probs = v.check((FORGE as any).$id, hero).problems;
    ok(`${f.split('/').pop()}: the fitted hero is still a valid Character Forge sheet`, !probs.length, probs.slice(0, 3).join('; '));
    ok(`${f.split('/').pop()}: fitting again changes nothing`, !Object.keys(fitCastWardrobes(pack, null)).length);
  }
  const suit = () => ({ role: 'the mechanic who came home', logline: 'fixing trucks', wardrobe: { top: { item: 'suit-jacket', color: '#202830' }, bottom: { item: 'suit-trousers' }, shoes: { item: 'dress' } } });
  const a = suit();
  ok('a look that asks for a suit keeps it', !fitWardrobe(a, 'a mechanic in his one good suit, for the funeral').length && a.wardrobe.top.item === 'suit-jacket');
  const b = suit(); b.role = 'the farmer who will not sell';
  fitWardrobe(b);
  ok('a farmer in a suit gets overalls and work boots', b.wardrobe.top.item === 'overalls' && b.wardrobe.shoes.item === 'work-boots');
  const c = suit(); c.role = 'the banker'; c.logline = 'holds the notes on half the county';
  ok('a banker keeps his suit', !fitWardrobe(c).length && c.wardrobe.top.item === 'suit-jacket');
  const d = { role: 'the tow driver', logline: '', wardrobe: { top: { item: 'hoodie' }, bottom: { item: 'jeans' }, shoes: { item: 'sneakers' } } };
  ok('a worker already in everyday clothes is left alone', !fitWardrobe(d).length && d.wardrobe.top.item === 'hoodie');
  ok('the role wins over the logline (a mechanic among the farms is a mechanic)', workOf('the mechanic who came home') === 'hands' && workOf('a farmer') === 'farm' && workOf('the loan officer') === null);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failures = 0;
  runWardrobeChecks((name, cond, detail) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && detail ? `\n     ${detail}` : ''}`); if (!cond) failures++; });
  console.log(`\n${failures ? `${failures} FAILED` : 'all wardrobe checks passed'}\n`);
  process.exit(failures ? 1 : 0);
}
