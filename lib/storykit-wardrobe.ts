/**
 * A forged person's clothes follow their work (Story Kit, the Character Forge sheets of a story's cast).
 *
 * A builder reply can dress a working man in a business suit: Okemah's fixture hero, "the mechanic who came home",
 * forged in a single-breasted suit (suit-jacket, which the forge makes with a shirt and tie). After the gate, every
 * cast sheet whose role, logline or (for the hero) the creator's own look names hands-on work, and that wears suit or
 * dress clothes, gets the work clothes of the nearest anchor instead: the mechanic's work shirt, dark trousers and work
 * boots (storykit/anchors.json `mechanic`), or a farm's overalls and boots. Someone whose words ask for a suit keeps it.
 * Original garments from the forge's own list, no logos. Pure: the same sheet gives the same clothes.
 *   fitWardrobe(sheet, look?)  -> the changes made ([] when the clothes already fit), the sheet changed in place
 *   fitCastWardrobes(pack, look?) -> { [castId]: changes } for every sheet changed (look: the hero's, from the creator)
 */

type Garment = { item: string; color?: string; accent?: string; pattern?: string };
type Sheet = { role?: string; logline?: string; wardrobe?: { top?: Garment; bottom?: Garment; shoes?: Garment; over?: Garment[]; headwear?: Garment } };

// hands-on work: a garage, a farm, a building site, a dock, a truck
const FARM = /\b(farmers?|farmhands?|farm ?hands?|ranchers?|ranch ?hands?|cowboys?|cowhands?|wranglers?|cattlem[ae]n)\b/i;
const HANDS = /\b(mechanics?|grease ?monkey|garages?|auto ?shop|body ?shop|tow(-| )?(truck|driver|yard)s?|welders?|welding|machinists?|builders?|construction workers?|roofers?|carpenters?|plumbers?|electricians?|linem[ae]n|dock ?workers?|dockhands?|longshorem[ae]n|truckers?|truck ?drivers?|oil ?field|roughnecks?|miners?|loggers?|janitors?|handym[ae]n|repairm[ae]n|fix(es|ing)? (trucks|cars|engines|tractors)|scrapyard|junkyard|salvage yard)\b/i;
// the person's own words asking for dress clothes
const DRESSED = /\b(suits?|suited|tie|necktie|blazer|tux(edo)?|three-piece|business ?wear|dressed up|in a jacket and tie)\b/i;
const FORMAL_TOP = new Set(['suit-jacket', 'suit-jacket-db', 'doorman-coat']);

// the mechanic anchor's work clothes (scripts/forge/anchors/anchor-mechanic.json): a blue-grey work shirt-jacket, dark
// trousers, work boots; the farm's: denim overalls over a tee, work boots
const WORK = { top: { item: 'uniform-jacket', color: '#3E4A55' }, bottom: { item: 'trousers', color: '#2A2E33' }, shoes: { item: 'work-boots', color: '#2A211C' } };
const FARMWEAR = { top: { item: 'overalls', color: '#3D5573', accent: '#C9C1B0' }, bottom: { item: 'jeans', color: '#2C3646' }, shoes: { item: 'work-boots', color: '#4A3626' } };

export function workOf(words: string): 'farm' | 'hands' | null {
  if (FARM.test(words)) return 'farm';
  if (HANDS.test(words)) return 'hands';
  return null;
}

export function fitWardrobe(sheet: Sheet | null | undefined, look?: string | null): string[] {
  const w = sheet?.wardrobe;
  if (!sheet || !w || !w.top || !w.bottom || !w.shoes) return [];
  // (the role first: "the mechanic who came home" is a mechanic whatever the logline says of the farms round him)
  const work = workOf(sheet.role || '') || workOf([sheet.logline, look].filter(Boolean).join(' · '));
  if (!work || DRESSED.test(look || '') || DRESSED.test(sheet.role || '')) return [];
  const formal = FORMAL_TOP.has(w.top.item), dressShoes = w.shoes.item === 'dress', suitLegs = w.bottom.item === 'suit-trousers';
  if (!formal && !dressShoes && !suitLegs) return [];
  const to = work === 'farm' ? FARMWEAR : WORK, out: string[] = [];
  if (formal) {
    out.push(`top ${w.top.item} -> ${to.top.item}`);
    w.top = { ...to.top };
    // (overalls bring their own legs; a work shirt keeps jeans, the rest get the work trousers)
    if (work === 'farm' || w.bottom.item !== 'jeans') { out.push(`bottom ${w.bottom.item} -> ${to.bottom.item}`); w.bottom = { ...to.bottom }; }
  } else if (suitLegs) { out.push(`bottom ${w.bottom.item} -> ${to.bottom.item}`); w.bottom = { ...to.bottom }; }
  if (formal || dressShoes) {
    if (w.shoes.item !== 'work-boots') { out.push(`shoes ${w.shoes.item} -> work-boots`); w.shoes = { ...to.shoes }; }
  }
  return out;
}

export function fitCastWardrobes(pack: { hero?: string; cast?: { id?: string; sheet?: Sheet }[] } | null | undefined, look?: string | null): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const c of pack?.cast ?? []) {
    if (!c?.sheet) continue;
    const changed = fitWardrobe(c.sheet, c.id === pack?.hero ? look : null);
    if (changed.length) out[String(c.id)] = changed;
  }
  return out;
}
