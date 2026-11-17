/**
 * A forged person's clothes follow their work (Story Kit, the Character Forge sheets of a story's cast).
 *
 * A builder reply can dress a working man in a business suit: Okemah's fixture hero, "the mechanic who came home",
 * forged in a single-breasted suit (suit-jacket, which the forge makes with a shirt and tie). After the gate, every cast
 * sheet whose OWN words name a job (its role first, then its logline; the hero's also the creator's look) and that wears
 * clothes that clash with that job gets the job's clothes, from the forge's own garments (scripts/forge/library.mjs,
 * the sheet schema's item lists) and its anchors (scripts/forge/anchors) where one exists:
 *   hands-on work (garage, welding, docks, a truck) the mechanic anchor's work shirt, dark trousers, work boots
 *   construction   a khaki work shirt, jeans, work boots        farm      denim overalls over a tee, work boots
 *   ranch          a brown work shirt, jeans, boots              chef/cook the chef anchor's whites, dark trousers, boots
 *   nurse/doctor   scrubs (the nurse anchor: one colour top and trousers, white sneakers)
 *   cop/guard      a plain dark uniform jacket (its trim the cloth's colour: no gold, no badge, no cap), trousers, boots
 *   delivery       a plain slate tee (no company colours), dark trousers, sneakers
 *   teacher/office smart casual: a long-sleeve shirt, trousers, dress shoes (the office worker anchor's)
 *   student        a hoodie, jeans, white sneakers (the young hero anchor's)
 *   boss/executive the old boss anchor's dark suit and dress shoes
 * What clashes: a suit or a doorman's coat on a working person, another job's uniform (overalls, a uniform jacket, a
 * chef's jacket) on anyone, and on someone in boots for a living (hands, construction, farm, ranch) dress shoes or suit
 * trousers too. Everyday clothes (a tee, a hoodie, a coat) are never changed, and a boss or an office worker keeps a suit.
 * Only the person's own words count: a job named after an owner's or a relation's word in the same clause ("owns every
 * garage in the county", "the mechanic's boss", "married to a cop"), or after "former"/"retired", is someone else's or
 * past. Words that ask for a look (the creator's look for the hero, or clothes named in the role or logline: "in his one
 * good suit") keep the clothes as written. Cast whose words name no job are untouched. Pure: the same sheet gives the
 * same clothes, and fitting twice changes nothing. No logos: plain colours only. A western hat in the person's own words
 * (a cowboy hat, a Stetson), or a peaked cap on a ranch hand, becomes the forge's cowboy-hat whatever else the words ask.
 *   workOf(words)                -> the job the words name for this person (null: none)
 *   fitWardrobe(sheet, look?)    -> the changes made ([] when the clothes already fit), the sheet changed in place
 *   fitCastWardrobes(pack, look?) -> { [castId]: changes } for every sheet changed (look: the hero's, from the creator)
 */

type Garment = { item: string; color?: string; accent?: string; pattern?: string };
type Sheet = { role?: string; logline?: string; identity?: { body?: string }; wardrobe?: { top?: Garment; bottom?: Garment; shoes?: Garment; over?: Garment[]; headwear?: Garment } };
export type Job = 'boss' | 'medic' | 'security' | 'chef' | 'construction' | 'hands' | 'farm' | 'ranch' | 'delivery' | 'office' | 'student';

// each job's words, as nouns for the person (phrases first, so "head of security" is one match). Order breaks a tie only.
const JOBS: [Job, RegExp][] = [
  ['boss', /\b(crime ?boss(es)?|boss(es)?|kingpins?|crime lords?|executives?|ceos?|chief executives?|tycoons?|magnates?|moguls?|bankers?|businessm[ae]n|businesswom[ae]n|business ?owners?|landlords?|landlady|lawyers?|attorneys?|mayor|investors?|financiers?)\b/gi],
  ['security', /\b(chief of police|police (officers?|chief)|patrol (officers?|m[ae]n)|peace officers?|security (officers?|guards?|chief)|corrections? officers?|correctional officers?|(night|prison|bank|mall|gate|museum|hospital|school) guards?|policem[ae]n|policewom[ae]n|cops?|police|sheriffs?|deput(y|ies)|troopers?|marshals?|watchm[ae]n)\b/gi],
  // (not "security" alone: a security crew's lead, a head of security, a bodyguard may well wear a suit)
  ['medic', /\b(nurses?|doctors?|surgeons?|physicians?|orderl(y|ies)|med(ical)? techs?|(er|ward|night|hospital) staff)\b/gi],
  ['chef', /\b(chefs?|sous-chefs?|(line|head|short-order|fry|prep|diner|camp|ranch|school|army|grill) cooks?|(?<=\b(?:the|a|an) )cooks?|kitchen hands?|bakers?)\b/gi],
  ['construction', /\b(construction (workers?|crew|foreman|foremen)?|builders?|bricklayers?|stonemasons?|roofers?|carpenters?|framers?|site (workers?|foreman)|foreman|foremen|hard ?hats?)\b/gi],
  ['hands', /\b(mechanics?|grease ?monkey|garages?|auto ?shop|body ?shop|tow(-| )?(truck|driver|yard)s?|welders?|welding|machinists?|plumbers?|electricians?|linem[ae]n|dock ?workers?|dockhands?|longshorem[ae]n|truckers?|truck ?drivers?|oil ?field|roughnecks?|miners?|loggers?|janitors?|handym[ae]n|repairm[ae]n|mill ?(hands?|workers?)|factory (hands?|workers?)|fix(es|ing)? (trucks|cars|engines|tractors)|scrapyard|junkyard|salvage yard)\b/gi],
  ['farm', /\b(farmers?|farmhands?|farm ?hands?|farm ?girl|farm ?boy|dairym[ae]n|growers?)\b/gi],
  ['ranch', /\b(ranchers?|ranch ?hands?|cowboys?|cowgirls?|cowhands?|wranglers?|cattlem[ae]n|cattlewom[ae]n)\b/gi],
  ['delivery', /\b(delivery (drivers?|m[ae]n|guys?|girls?|boys?|riders?)|couriers?|mail ?carriers?|postm[ae]n|postwom[ae]n|mailm[ae]n|van drivers?)\b/gi],
  ['office', /\b(school ?teachers?|teachers?|professors?|principals?|librarians?|tutors?|accountants?|bookkeepers?|clerks?|office workers?|secretar(y|ies)|receptionists?|reporters?|journalists?|bank tellers?|loan officers?|insurance (agents?|m[ae]n)|realtors?|real estate agents?)\b/gi],
  ['student', /\b(students?|schoolkids?|schoolgirls?|schoolboys?|high ?schoolers?|teenagers?|freshm[ae]n|sophomores?|college kids?|undergrads?|grad students?)\b/gi],
];
// a word before the job in the same clause that makes it someone else's, or no longer theirs: an owner's or a buyer's
// word, a relation, a preposition ("works for the boss", "from the garage")
const OTHERS = /\b(owns?|owned|owning|runs?|ran|running|buys?|bought|buying|controls?|controlled|bankrolls?|finances?|funds?|wants?|wanted|hates?|hated|blames?|owes?|owed|chases?|hunts?|sells?|sold|selling|rents?|leases?|hires?|hired|fires?|fired|employs?|pays?|paid|bribes?|blackmails?|threatens?|protects?|loves?|married|marries|dates?|dating|for|against|from|than|like|with|without|about|of|son|daughter|wife|husband|brother|sister|mother|father|mom|dad|widow(er)?|friend|rival|enemy|partner|kid|niece|nephew|cousin|uncle|aunt|grand(son|daughter)|boyfriend|girlfriend|former|ex|retired|onetime|one-time|would-be|wannabe|fake|teach(es|ing)?|taught|treats?|knows?|knew|meets?|met|calls?|helps?|saves?|serves?|feeds?|arrests?|kills?|killed|watch(es|ed)?|trusts?|fears?|follows?|tells?|told|warns?|robs?|robbed|fights?|fought|leads?|led|trains?|trained|hides?|covers?|pretends?|poses?|posing)\b/i;
// a surname that is also a job word ("raised by Baker"): a capital inside a sentence is a name, not the job
const NAMES = /^(bakers?|carpenters?|marshals?|foreman|miners?)$/i;
// a clause ends at punctuation or a joining word
const CLAUSE = /[.;,:!?()—]|\b(and|but|who|whose|which|that|while|until|since|because|when)\b/gi;
// words that ask for a look: then the clothes are as written
const LOOK = /\b(suits?|suited|tie|necktie|blazer|tux(edo)?|three-piece|business ?wear|dressed|gown|uniform(ed)?|overalls|dungarees|scrubs|apron|jackets?|coats?|hoodies?|sweat ?shirts?|t-?shirts?|tees?|shirts?|blouses?|sweaters?|jeans|trousers|pants|slacks|skirts?|shorts|boots|sneakers|trainers|heels|loafers|shoes|hats?|beanies?|outfits?|wears?|wearing|worn|clothes|clothing)\b/i;

const FORMAL = ['suit-jacket', 'suit-jacket-db', 'doorman-coat'], WORK_TOPS = ['overalls', 'uniform-jacket', 'chef-jacket'];
const BOOTS = ['work-boots', 'boots'];
type Fit = {
  top: Garment; bottom: Garment; bottomF?: Garment; shoes: Garment;
  clash: string[];     // tops that are wrong for the job (replaced, with the legs and shoes that go with them)
  legs: string[];      // bottoms kept when the top is replaced
  feet: string[];      // shoes kept when the top is replaced
  strict?: boolean;    // boots for a living: dress shoes or suit trousers alone are changed too
};
// (the anchors' own colours where an anchor has the job: scripts/forge/anchors/anchor-*.json)
const FITS: Record<Job, Fit> = {
  hands: { top: { item: 'uniform-jacket', color: '#3E4A55' }, bottom: { item: 'trousers', color: '#2A2E33' }, shoes: { item: 'work-boots', color: '#2A211C' },
    clash: [...FORMAL, 'chef-jacket'], legs: ['jeans'], feet: BOOTS, strict: true },
  construction: { top: { item: 'long-sleeve', color: '#7A6F55' }, bottom: { item: 'jeans', color: '#33404F' }, shoes: { item: 'work-boots', color: '#5A4430' },
    clash: [...FORMAL, 'chef-jacket'], legs: ['jeans', 'ripped-jeans', 'trousers'], feet: BOOTS, strict: true },
  farm: { top: { item: 'overalls', color: '#3D5573', accent: '#C9C1B0' }, bottom: { item: 'jeans', color: '#2C3646' }, shoes: { item: 'work-boots', color: '#4A3626' },
    clash: [...FORMAL, 'chef-jacket'], legs: [], feet: BOOTS, strict: true },
  ranch: { top: { item: 'long-sleeve', color: '#6E4B32' }, bottom: { item: 'jeans', color: '#2C3646' }, shoes: { item: 'boots', color: '#4A3626' },
    clash: [...FORMAL, 'chef-jacket'], legs: ['jeans', 'ripped-jeans'], feet: BOOTS, strict: true },
  chef: { top: { item: 'chef-jacket', color: '#ECEBE6' }, bottom: { item: 'trousers', color: '#262628' }, bottomF: { item: 'loose-trousers', color: '#262628' }, shoes: { item: 'work-boots', color: '#1A1816' },
    clash: [...FORMAL, 'overalls', 'uniform-jacket'], legs: ['trousers', 'loose-trousers'], feet: [...BOOTS, 'work-shoes', 'sneakers'] },
  medic: { top: { item: 'tee', color: '#24324A' }, bottom: { item: 'trousers', color: '#24324A' }, bottomF: { item: 'loose-trousers', color: '#24324A' }, shoes: { item: 'white-sneakers', color: '#E9E8E3', accent: '#9AA3A8' },
    clash: [...FORMAL, ...WORK_TOPS], legs: [], feet: ['white-sneakers', 'sneakers', 'work-shoes'] },
  security: { top: { item: 'uniform-jacket', color: '#1F2633', accent: '#1F2633' }, bottom: { item: 'trousers', color: '#1A1E27' }, shoes: { item: 'boots', color: '#151417' },
    clash: [...FORMAL, 'overalls', 'chef-jacket'], legs: ['trousers', 'loose-trousers'], feet: [...BOOTS, 'work-shoes'] },
  delivery: { top: { item: 'tee', color: '#4A5866' }, bottom: { item: 'trousers', color: '#2E3238' }, shoes: { item: 'sneakers', color: '#2A2A2C', accent: '#2A2A2C' },
    clash: [...FORMAL, 'overalls', 'chef-jacket'], legs: ['trousers', 'loose-trousers', 'jeans', 'track-pants'], feet: [...BOOTS, 'sneakers', 'white-sneakers', 'work-shoes', 'skate-shoes'] },
  office: { top: { item: 'long-sleeve', color: '#465063' }, bottom: { item: 'trousers', color: '#2A2C31' }, bottomF: { item: 'loose-trousers', color: '#2A2C31' }, shoes: { item: 'dress', color: '#2B2420' },
    clash: WORK_TOPS, legs: ['trousers', 'loose-trousers', 'skirt', 'jeans'], feet: ['dress', 'work-shoes', 'sneakers', 'white-sneakers'] },
  student: { top: { item: 'hoodie', color: '#3A3F48', accent: '#E6E4DE' }, bottom: { item: 'jeans', color: '#2C3646' }, shoes: { item: 'white-sneakers', color: '#ECEAE4', accent: '#8C9AA8' },
    clash: [...FORMAL, ...WORK_TOPS], legs: ['jeans', 'ripped-jeans', 'track-pants', 'skirt', 'trousers', 'loose-trousers'], feet: ['sneakers', 'white-sneakers', 'skate-shoes', ...BOOTS] },
  boss: { top: { item: 'suit-jacket', color: '#26272C', accent: '#5A1E24' }, bottom: { item: 'suit-trousers', color: '#26272C' }, bottomF: { item: 'trousers', color: '#26272C' }, shoes: { item: 'dress', color: '#1E1A18' },
    clash: WORK_TOPS, legs: ['suit-trousers', 'trousers', 'loose-trousers', 'skirt'], feet: ['dress', 'work-shoes'] },
};

/** the job these words name for this person: the earliest job word that is not someone else's or a past one */
export function workOf(words: string): Job | null {
  const text = String(words || ''), cuts = [0, ...[...text.matchAll(CLAUSE)].map((m) => m.index! + m[0].length)];
  let best: { at: number; job: Job } | null = null;
  for (const [job, re] of JOBS) {
    for (const m of text.matchAll(re)) {
      const at = m.index!, after = text.slice(at + m[0].length, at + m[0].length + 2);
      if (best && at >= best.at) break;
      if (/^['’]s/.test(after)) continue;   // the mechanic's boss: the boss
      if (NAMES.test(m[0]) && /^[A-Z]/.test(m[0]) && at > 0 && !/[.!?]\s*$/.test(text.slice(0, at))) continue;
      const from = Math.max(...cuts.filter((c) => c <= at));
      if (OTHERS.test(text.slice(from, at))) continue;
      best = { at, job }; break;
    }
  }
  return best?.job ?? null;
}

// a western hat in the person's own words (Colter Land, 16 Nov: "a cowboy hat" had only a peaked cap to be, and read as
// a pith helmet): the forge's cowboy-hat (scripts/forge/core.mjs, style 'cowboy'), its colour kept when it has one
const WESTERN_HAT = /\b(cowboy hats?|stetsons?|western hats?|ten[- ]gallon hats?|cattleman(?:'s)? hats?|ranch hats?|straw cowboy)\b/gi;
// (a plain felt hat is a detective's fedora too, and "never wore a cowboy hat" asks for none: no/never/without within
// three words before the hat, in the same clause, says no)
const NO_HAT = /\b(?:never|no|without)\s(?:\s*[\w'’]+){0,3}\s*$/i;   // ("no-nonsense" or a comma between is not a no)
const westernHat = (words: string) => [...String(words || '').matchAll(WESTERN_HAT)].some((m) => !NO_HAT.test(words.slice(0, m.index!)));
const RANCH = /\branch(?:es)?\b/i;
const HAT_FELT = '#7A5A3C', HAT_BAND = '#2A2018';
/** the headwear the person's own words or job call for: a cowboy hat for a western hat in the words, or in place of a
 * uniform's peaked cap on a ranch hand, or on anyone whose role or logline is a ranch ("owner of the Colter Ranch" names
 * no job), the peaked cap being the only stiff cap the forge had */
function fitHeadwear(sheet: Sheet, words: string, job: Job | null): string[] {
  const w = sheet.wardrobe!, now = w.headwear?.item || 'none';
  if (now === 'cowboy-hat') return [];
  const ranch = job === 'ranch' || RANCH.test([sheet.role, sheet.logline].filter(Boolean).join(' . '));
  if (!(westernHat(words) || (ranch && now === 'peaked-cap'))) return [];
  w.headwear = { item: 'cowboy-hat', color: w.headwear?.color && now !== 'hood-up' ? w.headwear.color : HAT_FELT, accent: HAT_BAND };
  return [`headwear ${now} -> cowboy-hat`];
}

export function fitWardrobe(sheet: Sheet | null | undefined, look?: string | null): string[] {
  const w = sheet?.wardrobe;
  if (!sheet || !w || !w.top || !w.bottom || !w.shoes) return [];
  // (the role first: "the mechanic who came home" is a mechanic whatever the logline says of the farms round him)
  const job = workOf(sheet.role || '') || workOf([sheet.logline, look].filter(Boolean).join(' . '));
  const hat = fitHeadwear(sheet, [look, sheet.role, sheet.logline].filter(Boolean).join(' . '), job);
  if (!job || [look, sheet.role, sheet.logline].some((s) => s && LOOK.test(s))) return hat;
  const fit = FITS[job], fem = sheet.identity?.body === 'female', out: string[] = [...hat];
  const set = (k: 'top' | 'bottom' | 'shoes', g: Garment) => { out.push(`${k} ${w[k]!.item} -> ${g.item}`); w[k] = { ...g }; };
  const legs = fem && fit.bottomF ? fit.bottomF : fit.bottom;
  if (fit.clash.includes(w.top.item)) {
    // (overalls bring their own legs, so they go with them; other legs stay when they suit the job)
    const overalls = w.top.item === 'overalls';
    set('top', fit.top);
    if (overalls || !fit.legs.includes(w.bottom.item)) set('bottom', legs);
    if (!fit.feet.includes(w.shoes.item)) set('shoes', fit.shoes);
  } else if (fit.strict) {
    if (w.bottom.item === 'suit-trousers' && w.top.item !== 'overalls') set('bottom', legs);
    if (w.shoes.item === 'dress') set('shoes', fit.shoes);
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
