/**
 * Story Kit: a forged person's clothes follow their work (lib/storykit-wardrobe.ts). Part of `npm run check`; alone:
 *   node --import ./scripts/ts-resolve.mjs scripts/storykit-wardrobe-check.ts
 *
 * Okemah's fixture hero, "the mechanic who came home", was written in a business suit (suit-jacket, forged with a shirt
 * and tie): the build now gives him the mechanic anchor's work clothes and boots, and leaves the boss's suit, the ally's
 * coat and the muscle's jacket alone (no hands-on work in their words). A look or role that asks for a suit keeps it; a
 * farmer gets overalls; the fitted sheet is still a valid Character Forge sheet; fitting twice changes nothing.
 * The common jobs (scrubs, a plain uniform, chef's whites, construction, delivery, smart casual, a student's hoodie, a
 * rancher's shirt, a boss's suit) each end in garments the forge's lists have; and a job someone else has ("owns every
 * garage", "the mechanic's boss", "married to a cop", "retired") or a look the words ask for changes nothing.
 */
import { readFileSync } from 'node:fs';
import { Validator } from '../storykit/pack/validate.ts';
import FORGE from './forge/character-sheet.schema.json' with { type: 'json' };
import { fitWardrobe, fitCastWardrobes, workOf } from '../lib/storykit-wardrobe.ts';
import { compile } from './forge/compile.mjs';

type Ok = (name: string, cond: boolean, detail?: string) => void;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
// (a valid sheet to dress: the mechanic anchor's, its wardrobe replaced by each case's)
const FORGE_BASE = JSON.parse(readFileSync('scripts/forge/anchors/anchor-mechanic.json', 'utf8'));

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
  ok('the role wins over the logline (a mechanic among the farms is a mechanic)', workOf('the mechanic who came home') === 'hands' && workOf('a farmer') === 'farm' && workOf('the loan officer') === 'office' && workOf('the man who wants the grain money') === null);

  // the common jobs of a hometown story, each in the forge's own garments (scripts/forge/library.mjs and the sheet
  // schema's item lists, no invented meshes); decided from the person's own words, never the story's
  const ITEMS = (FORGE as any).properties.wardrobe.properties, listed = (k: string) => new Set(String(ITEMS[k].description).split(/[|:]/).map((x: string) => x.trim().split(/[ (]/)[0]).filter(Boolean));
  const tops = listed('top'), bottoms = listed('bottom'), shoes = listed('shoes');
  const W = (t: string, b: string, s: string) => ({ top: { item: t, color: '#202830' }, bottom: { item: b }, shoes: { item: s } });
  const person = (role: string, logline: string, w: any, body = 'male') => ({ role, logline, identity: { body }, wardrobe: w });
  const SUIT = () => W('suit-jacket', 'suit-trousers', 'dress');
  const dressed: [string, any, string | null, string[]][] = [
    ['a night nurse in a suit gets scrubs (one colour top and trousers, white sneakers)', person('the night nurse', 'Has seen every kind of trouble come through the doors.', W('suit-jacket', 'trousers', 'dress'), 'female'), null, ['tee', 'loose-trousers', 'white-sneakers']],
    ['the town doctor in a doorman\'s coat gets scrubs', person('the town doctor', 'Stitches up whoever comes in.', W('doorman-coat', 'suit-trousers', 'dress')), null, ['tee', 'trousers', 'white-sneakers']],
    ['the sheriff in a suit gets a plain uniform (no gold trim, no cap), trousers and boots', person('the sheriff', 'Keeps the peace, mostly.', SUIT()), null, ['uniform-jacket', 'trousers', 'boots']],
    ['a night guard in overalls gets the same uniform', person('the night guard at the mill', 'Sees everything after dark.', W('overalls', 'jeans', 'sneakers')), null, ['uniform-jacket', 'trousers', 'boots']],
    ['a diner cook in a suit gets the chef\'s whites', person('the diner cook', 'Keeps the grill hot.', SUIT(), 'female'), null, ['chef-jacket', 'loose-trousers', 'work-boots']],
    ['a roofer in a suit gets a work shirt, jeans and work boots', person('the roofer', 'Up a ladder by six every morning.', SUIT()), null, ['long-sleeve', 'jeans', 'work-boots']],
    ['construction named in the logline counts (a role with no job)', person('the cousin', 'Works construction out on the highway.', SUIT()), null, ['long-sleeve', 'jeans', 'work-boots']],
    ['a delivery driver in a suit gets a plain tee, trousers and sneakers', person('the delivery driver', 'Knows every porch in town.', SUIT()), null, ['tee', 'trousers', 'sneakers']],
    ['a teacher in overalls gets smart casual (her sneakers kept)', person('the high school teacher', 'Grades papers at the diner.', W('overalls', 'jeans', 'sneakers'), 'female'), null, ['long-sleeve', 'loose-trousers', 'sneakers']],
    ['a college student in a double-breasted suit gets a hoodie, jeans and sneakers', person('the college student home for summer', 'Wants out of this town.', W('suit-jacket-db', 'suit-trousers', 'dress')), null, ['hoodie', 'jeans', 'white-sneakers']],
    ['a rancher in a suit gets a western shirt, jeans and cowboy boots (a farmer keeps the overalls)', person('the rancher next door', 'Three hundred head and a bad back.', SUIT()), null, ['western-shirt', 'jeans', 'cowboy-boots']],
    ['a boss forged in overalls gets the old boss\'s suit', person('the boss', 'Runs the feed store and the town.', W('overalls', 'jeans', 'work-boots')), null, ['suit-jacket', 'suit-trousers', 'dress']],
    ['a woman executive in a work jacket gets a suit jacket over trousers', person('the executive', 'Flew in to close the plant.', W('uniform-jacket', 'jeans', 'sneakers'), 'female'), null, ['suit-jacket', 'trousers', 'dress']],
  ];
  for (const [name, p, look, want] of dressed) {
    const changes = fitWardrobe(p, look), got = [p.wardrobe.top.item, p.wardrobe.bottom.item, p.wardrobe.shoes.item];
    const known = tops.has(got[0]) && bottoms.has(got[1]) && shoes.has(got[2]), probs = v.check((FORGE as any).$id, { ...clone(FORGE_BASE), wardrobe: p.wardrobe }).problems;
    ok(name, changes.length > 0 && got.join() === want.join() && known && !probs.length && !fitWardrobe(p, look).length, `${got.join(' / ')}${known ? '' : ' (not in the forge\'s lists)'} ${probs.slice(0, 2).join('; ')}`);
  }
  // a western hat (Colter Land, 16 Nov: the rancher's "cowboy hat" was forged as a peaked cap and read as a pith helmet)
  {
    const hatted = (p: any, look: string | null, why: string) => { const ch = fitWardrobe(p, look); const hw = (p.wardrobe as any).headwear;
      const probs = v.check((FORGE as any).$id, { ...clone(FORGE_BASE), wardrobe: p.wardrobe }).problems;
      ok(why, ch.some((c: string) => c.startsWith('headwear')) && hw?.item === 'cowboy-hat' && /^#[0-9A-F]{6}$/i.test(hw.color) && !probs.length && !fitWardrobe(p, look).length, `${JSON.stringify(hw)} ${probs.slice(0, 2).join('; ')}`); };
    const jack = person('owner of the Colter Ranch', 'Fifty years on the same land.', W('long-sleeve', 'jeans', 'boots')); (jack.wardrobe as any).headwear = { item: 'peaked-cap', color: '#C9A05A' };
    hatted(jack, 'a weathered rancher in his sixties, grey stubble, a cowboy hat', 'a cowboy hat in the creator\'s look becomes the forge\'s cowboy-hat (its colour kept), not a peaked cap');
    const hand = person('the ranch hand', 'Up before the cattle.', W('long-sleeve', 'jeans', 'boots')); (hand.wardrobe as any).headwear = { item: 'peaked-cap' };
    hatted(hand, null, 'a ranch hand in a peaked cap gets a cowboy hat');
    const stet = person('the drifter', 'Rides in under a black Stetson.', W('tee', 'jeans', 'boots'));
    hatted(stet, null, 'a Stetson in the logline gets a cowboy hat (no job named)');
    const owner = person('owner of the Colter Ranch', 'Fifty years on the same land.', W('long-sleeve', 'jeans', 'boots')); (owner.wardrobe as any).headwear = { item: 'peaked-cap', color: '#C9A05A' };
    hatted(owner, null, 'the owner of a ranch (a role naming no job, no look) in a peaked cap gets a cowboy hat');
    const pi = person('a 1947 private detective', 'Rain on his grey felt hat.', W('suit-jacket', 'suit-trousers', 'dress')); (pi.wardrobe as any).headwear = { item: 'none' };
    ok('a detective in a felt hat gets no cowboy hat', !fitWardrobe(pi).some((c: string) => c.startsWith('headwear')) && (pi.wardrobe as any).headwear.item === 'none');
    const never = person('the drifter', 'He never wore a cowboy hat in his life.', W('tee', 'jeans', 'boots'));
    ok('"never wore a cowboy hat" gets no cowboy hat', !fitWardrobe(never).some((c: string) => c.startsWith('headwear')) && (never.wardrobe as any).headwear?.item !== 'cowboy-hat');
    const blunt = person('the drifter', 'A no-nonsense man, a cowboy hat pulled low.', W('tee', 'jeans', 'boots'));
    hatted(blunt, null, '"no-nonsense" before the hat is not a no');
    const kid = person('the college student', 'Home for the summer.', W('hoodie', 'jeans', 'sneakers')); (kid.wardrobe as any).headwear = { item: 'ball-cap' };
    ok('a student in a ball cap keeps it (no western hat in his words)', !fitWardrobe(kid).length && (kid.wardrobe as any).headwear.item === 'ball-cap');
  }
  // western wear (Colter Land, 16 Nov: "it doesn't look like Montana"): ranch and rodeo people in pearl-snap shirts,
  // cowboy boots and a belt; a ranch's people with no job named in the shirt and belt; town people untouched
  {
    const valid = (p: any) => !v.check((FORGE as any).$id, { ...clone(FORGE_BASE), wardrobe: p.wardrobe }).problems.length;
    const hand = person('the ranch hand', 'Up before the cattle.', W('long-sleeve', 'jeans', 'boots')); const ch = fitWardrobe(hand);
    ok('a ranch hand in a work shirt and boots gets a western shirt, cowboy boots and a belt (valid, fitting again changes nothing)', hand.wardrobe.top.item === 'western-shirt' && hand.wardrobe.shoes.item === 'cowboy-boots' && (hand.wardrobe as any).over?.[0]?.item === 'western-belt' && valid(hand) && !fitWardrobe(hand).length, ch.join('; '));
    const bull = person('the bull rider', 'Eight seconds at a time.', W('tee', 'jeans', 'work-boots'));
    ok('a bull rider is a ranch hand for his clothes', fitWardrobe(bull).length > 0 && bull.wardrobe.top.item === 'western-shirt' && bull.wardrobe.shoes.item === 'cowboy-boots');
    const son = person("the rancher's son", 'Home from Missoula, wants none of the Colter Ranch.', W('long-sleeve', 'jeans', 'sneakers'));
    ok("the rancher's son (no job of his own, on a ranch) gets the shirt and belt, keeps his sneakers", fitWardrobe(son).length > 0 && son.wardrobe.top.item === 'western-shirt' && son.wardrobe.shoes.item === 'sneakers' && valid(son));
    const dev = person('the developer from Denver', 'Wants to buy the Colter Ranch and pave it.', W('suit-jacket', 'suit-trousers', 'dress'));
    ok('a developer who wants to buy the ranch keeps his suit', !fitWardrobe(dev).length && dev.wardrobe.top.item === 'suit-jacket');
    const asked = person('the ranch hand', 'Always in his grey hoodie.', W('hoodie', 'jeans', 'boots'));
    ok('a ranch hand whose words ask for a hoodie keeps it', !fitWardrobe(asked).some((c: string) => c.startsWith('top')) && asked.wardrobe.top.item === 'hoodie');
  }
  const security = person('the sheriff', '', SUIT()); fitWardrobe(security);
  ok('the uniform carries no insignia: its trim is the cloth\'s own colour and no cap is added', security.wardrobe.top.accent === security.wardrobe.top.color && !(security.wardrobe as any).headwear);
  // left as written
  const kept: [string, any, string | null][] = [
    ['a boss whose logline merely mentions garages keeps his suit (the false positive)', person('the boss', 'Owns every garage between here and the county line.', SUIT()), null],
    ['an owner\'s role names garages he does not work in: kept', person('the man who owns the garages', 'Wants the whole street.', SUIT()), null],
    ['the mechanic\'s boss is the boss, not a mechanic', person("the mechanic's boss", 'Signs the checks.', SUIT()), null],
    ['a retired cop is no longer in uniform', person('the retired cop', 'Fishes and remembers.', SUIT()), null],
    ['a cop\'s wife is not a cop', person('the woman married to a cop', 'Holds the family together.', W('suit-jacket', 'trousers', 'dress'), 'female'), null],
    ['someone who teaches students is not a student', person('the woman next door', 'Teaches the students at the high school.', W('suit-jacket', 'trousers', 'dress'), 'female'), null],
    ['a security crew\'s handler is no guard in uniform (a security detail wears suits)', person("the security crew's Midtown handler", 'Keeps the client moving.', SUIT()), null],
    ['a surname is not a job ("raised by Baker")', person('the drifter', 'Raised by Baker after the fire.', SUIT()), null],
    ['the creator\'s look keeps a nurse in the jacket it asks for', person('the nurse', 'Back on nights.', W('suit-jacket', 'trousers', 'dress'), 'female'), 'in her late mother\'s good jacket'],
    ['a logline that names the clothes keeps them ("his one good suit")', person('the sheriff', 'Wears his one good suit to every funeral.', SUIT()), null],
    ['a county clerk keeps a suit (smart is right for the office)', person('the county clerk', 'Knows where the deeds are.', SUIT()), null],
    ['a nurse off shift in a hoodie keeps it (everyday clothes are never changed)', person('the nurse', 'Off shift.', W('hoodie', 'jeans', 'sneakers'), 'female'), null],
    ['a diner cook in a coat keeps it', person('the diner cook who knows everyone', 'Keeps the coffee hot and the secrets hotter.', W('overcoat', 'trousers', 'dress')), null],
  ];
  for (const [name, p, look] of kept) { const before = JSON.stringify(p.wardrobe), changes = fitWardrobe(p, look); ok(name, !changes.length && JSON.stringify(p.wardrobe) === before, changes.join('; ')); }
  // the other cast of a pack untouched: a pack of five, one of them the false positive, only the nurse is changed
  const pack = { hero: 'hero', cast: [
    { id: 'hero', sheet: person('the night nurse', 'Back on nights at the county hospital.', W('suit-jacket', 'trousers', 'dress'), 'female') },
    { id: 'boss', sheet: person('the boss', 'Owns every garage in the county and the sheriff too.', SUIT()) },
    { id: 'ally', sheet: person('the diner cook who knows everyone', 'Keeps the coffee hot.', W('overcoat', 'trousers', 'dress')) },
    { id: 'goon', sheet: person('the muscle', 'Does what he is paid to do.', SUIT()) },
    { id: 'kid', sheet: person('the kid brother', 'Wants to be a mechanic like his dad.', W('hoodie', 'jeans', 'sneakers')) },
  ] };
  const was = pack.cast.map((c) => JSON.stringify(c.sheet.wardrobe)), fitted = fitCastWardrobes(pack, null);
  ok('in a cast, only the person whose own words clash with their clothes is changed', Object.keys(fitted).join() === 'hero' && pack.cast.slice(1).every((c, i) => JSON.stringify(c.sheet.wardrobe) === was[i + 1]), JSON.stringify(fitted));
  // (VM: the forge wears one library coat over the torso: an overcoat over a suit's jacket is the coat over the suit's
  // shirt, tie and trousers, the jacket left off. The jacket under the coat came out through it in every view: Colter
  // Land's developer, a dark suit under a cream coat, read as a coat in dark patches)
  const dress = (wardrobe: any) => compile({ ...clone(FORGE_BASE), wardrobe }).cfg as any, items = (c: any) => c.lib.map((l: any) => l.item).join(',');
  const coated = dress({ top: { item: 'suit-jacket', color: '#2A2A2E' }, bottom: { item: 'suit-trousers', color: '#2A2A2E' }, shoes: { item: 'dress' }, over: [{ item: 'overcoat', color: '#D8C8A0' }] });
  ok('forge: an overcoat over a suit\'s jacket is one coat over the suit (no jacket under it; the suit\'s shirt, tie and trousers kept)', items(coated) === 'overcoat' && !!coated.suit && coated.wear.some((w: any) => w[0] === 'male_elegantsuit01'), items(coated));
  const suited = dress({ top: { item: 'suit-jacket', color: '#2A2A2E' }, bottom: { item: 'suit-trousers', color: '#2A2A2E' }, shoes: { item: 'dress' } });
  ok('forge: a suit without a coat keeps its jacket', items(suited) === 'suit-jacket', items(suited));
  // (WW) the forge's western wear: a belt tucks a western shirt in; under a ranch jacket or a duster the belt and the
  // shirt's collar are left off (the coat's own cover them); a belt over any other top is left off, logged
  const shirt = { item: 'western-shirt', color: '#8E2E2A', accent: '#232C3C', pattern: 'plaid' }, jeans = { item: 'jeans', color: '#2C3646' }, boots = { item: 'cowboy-boots', color: '#5A3A26' };
  const belted = dress({ top: shirt, bottom: jeans, shoes: boots, over: [{ item: 'western-belt' }, { item: 'vest', pattern: 'leather' }, { item: 'bandana' }] });
  ok('forge: a western shirt with a belt, a vest and a bandana: boots, the tucked shirt, the belt, the vest, the bandana in that order', items(belted) === 'cowboy-boots,western-shirt,western-belt,vest,bandana' && belted.lib[1].tuck === true && belted.wear.some((w: any) => w[4]?.fillBand), items(belted));
  const coatedW = dress({ top: shirt, bottom: jeans, shoes: boots, over: [{ item: 'western-belt' }, { item: 'duster' }] });
  ok('forge: under a duster the belt is left off, the shirt tucked and collarless', items(coatedW) === 'cowboy-boots,western-shirt,duster' && coatedW.lib[1].tuck === true && coatedW.lib[1].noCollar === true, items(coatedW));
  const teeBelt = compile({ ...clone(FORGE_BASE), wardrobe: { top: { item: 'tee' }, bottom: jeans, shoes: boots, over: [{ item: 'western-belt' }] } });
  ok('forge: a western belt over a tee is left off (logged), never a belt over an untucked top', !(teeBelt.cfg as any).lib.some((l: any) => l.item === 'western-belt') && teeBelt.log.some((l: string) => /western-belt left off/.test(l)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let failures = 0;
  runWardrobeChecks((name, cond, detail) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && detail ? `\n     ${detail}` : ''}`); if (!cond) failures++; });
  console.log(`\n${failures ? `${failures} FAILED` : 'all wardrobe checks passed'}\n`);
  process.exit(failures ? 1 : 0);
}
