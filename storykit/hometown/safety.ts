/**
 * Hometown: the safety rules for real places (Hometown Build Spec v1). A hometown story is set in a real town, so:
 *
 *   1. No violent mission, crash, explosion or combat at a SENSITIVE place: schools and childcare, hospitals and clinics,
 *      places of worship, police and fire stations, memorials and cemeteries, shelters. A mission may pass by one (a
 *      route goes where the roads go) or, when nothing in it is violent, visit one (drop the medicine at the clinic);
 *      it never targets one. A violent mission is one with a fight, a chase, a roadblock, lookouts or a patrol, or the
 *      verbs fight, ram, escape or chase.
 *   2. Private homes are never story places: a residence is left out of the builder's place list and refused when
 *      named; a street address (a house number and a street) is refused in anything a player reads or hears.
 *   3. No private individual is named: the names a package withholds (homes, memorials to people, businesses) are
 *      refused in player-facing text. Invented people are the builder's; the real-name check the builder already runs
 *      (lib/episode.ts NAMES_CHECK_SYSTEM) stays the net for anyone else.
 *   4. No real business or brand name in player-facing text: a business is offered to the builder only as a generic
 *      descriptor ("the diner", "the gas station"); its real name, its brand tag and the national chains below are
 *      refused.
 *
 * SENSITIVE_KINDS is the reviewed list of OSM and Overture kinds that map to "sensitive" (and RESIDENCE_KINDS,
 * BUSINESS_KINDS likewise); a kind not on a list falls back to the place's name (NAME_RULES), conservatively: a name
 * that reads as a church, a school or a hospital is sensitive whatever its kind says. Reviewed 12 Nov 2026 against the
 * kinds of the SF place library (storykit/cities/sf/js/sf-geodata.js GEO.landmarks: OSM building/amenity values) and
 * Overture's places taxonomy. Add to a list, never silently drop from one.
 */
import type { CityPackage, PackagePlace, PackageLandmark } from './city-package.ts';

export type Sensitive = 'school' | 'childcare' | 'health' | 'worship' | 'police' | 'fire' | 'memorial' | 'shelter';
export type PlaceClass = { sensitive: Sensitive | null; residence: boolean; business: boolean; why: string };

/** OSM (amenity, building, landuse, historic, social_facility, healthcare) and Overture category values that are sensitive. */
export const SENSITIVE_KINDS: Record<string, Sensitive> = {
  // schools and childcare
  school: 'school', college: 'school', university: 'school', elementary_school: 'school', middle_school: 'school', high_school: 'school',
  primary_school: 'school', secondary_school: 'school', public_school: 'school', private_school: 'school', charter_school: 'school',
  education: 'school', schoolyard: 'school', kindergarten: 'childcare', childcare: 'childcare', child_care: 'childcare', preschool: 'childcare',
  day_care: 'childcare', daycare: 'childcare', playground: 'childcare',
  // health
  hospital: 'health', clinic: 'health', doctors: 'health', doctor: 'health', dentist: 'health', healthcare: 'health', medical_center: 'health',
  medical_centre: 'health', emergency_room: 'health', urgent_care: 'health', urgent_care_clinic: 'health', health_center: 'health', nursing_home: 'health',
  hospice: 'health', retirement_home: 'health', assisted_living: 'health', rehabilitation_center: 'health', mental_health: 'health', blood_bank: 'health',
  ambulance_station: 'health', dialysis: 'health',
  // worship
  place_of_worship: 'worship', church: 'worship', cathedral: 'worship', chapel: 'worship', mosque: 'worship', synagogue: 'worship', temple: 'worship',
  shrine: 'worship', monastery: 'worship', convent: 'worship', pagoda: 'worship', religious: 'worship', religious_organization: 'worship',
  church_cathedral: 'worship', buddhist_temple: 'worship', hindu_temple: 'worship', gurdwara: 'worship', kingdom_hall: 'worship',
  // police and fire
  police: 'police', police_station: 'police', police_department: 'police', sheriff: 'police', sheriff_office: 'police', courthouse: 'police', prison: 'police', jail: 'police',
  fire_station: 'fire', fire_department: 'fire', firehouse: 'fire',
  // memorials and cemeteries
  memorial: 'memorial', war_memorial: 'memorial', cemetery: 'memorial', grave_yard: 'memorial', graveyard: 'memorial', tomb: 'memorial',
  mausoleum: 'memorial', crematorium: 'memorial', funeral_home: 'memorial', funeral_hall: 'memorial', funeral_services_and_cemeteries: 'memorial',
  // shelters
  shelter: 'shelter', social_facility: 'shelter', homeless_shelter: 'shelter', women_shelter: 'shelter', refugee_shelter: 'shelter',
  food_bank: 'shelter', soup_kitchen: 'shelter', community_shelter: 'shelter',
};
/** Kinds that are someone's home: never a story place, their names withheld. */
export const RESIDENCE_KINDS = new Set(['house', 'residential', 'apartments', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'dormitory',
  'farmhouse', 'cabin', 'houseboat', 'static_caravan', 'trailer', 'mobile_home', 'residence', 'home', 'private_residence', 'duplex', 'condominium']);
/** Kinds that are a business: offered as a generic descriptor, their names refused. Values: the descriptor. */
export const BUSINESS_KINDS: Record<string, string> = {
  retail: 'a shop', commercial: 'a business', shop: 'a shop', convenience: 'the corner store', supermarket: 'the grocery store', grocery: 'the grocery store',
  general: 'the general store', department_store: 'the department store', mall: 'the mall', hardware: 'the hardware store', farm: 'the farm supply store',
  agrarian: 'the feed store', car_repair: 'the garage', car_dealer: 'the car lot', car: 'the car lot', tyres: 'the tire shop',
  restaurant: 'the diner', fast_food: 'the burger place', fast_food_restaurant: 'the burger place', cafe: 'the cafe', coffee_shop: 'the coffee shop',
  bar: 'the bar', pub: 'the bar', ice_cream: 'the ice cream stand', bakery: 'the bakery', pizza_restaurant: 'the pizza place',
  fuel: 'the gas station', gas_station: 'the gas station', charging_station: 'the charging station', car_wash: 'the car wash',
  bank: 'the bank', atm: 'the bank machine', pharmacy: 'the drugstore', chemist: 'the drugstore',
  hotel: 'a hotel', motel: 'the motel', hostel: 'a hostel', guest_house: 'the guest house',
  office: 'an office building', company: 'an office', industrial: 'the plant', warehouse: 'the warehouse', data_center: 'the data center',
  cinema: 'the movie theater', theatre: 'the theater', stadium: 'the stadium', fitness_centre: 'the gym', gym: 'the gym', bowling_alley: 'the bowling alley',
  amusement_arcade: 'the arcade', nightclub: 'the club', casino: 'the casino', storage: 'the storage lots', self_storage: 'the storage lots',
  laundry: 'the laundromat', hairdresser: 'the barbershop', beauty: 'the salon', clothes: 'the clothing store', liquor: 'the liquor store',
};
/** National chains a US town is likely to have (business names, never in a hometown story's words). */
export const CHAIN_BRANDS = ['Walmart', "McDonald's", 'Burger King', "Wendy's", 'Sonic Drive-In', 'Taco Bell', 'KFC', 'Pizza Hut', "Domino's", 'Subway',
  'Starbucks', "Dunkin'", 'Dollar General', 'Family Dollar', 'Dollar Tree', "Casey's", "Love's", 'Pilot Flying J', 'QuikTrip', 'Shell', 'Chevron',
  'Exxon', 'Conoco', 'Phillips 66', 'Valero', 'Walgreens', 'CVS', 'Rite Aid', 'Target', 'Costco', 'Kroger', 'Safeway', 'Home Depot', "Lowe's",
  'AutoZone', "O'Reilly", 'Tractor Supply', 'Braum\'s', 'Dairy Queen', 'Chick-fil-A', 'Whataburger', 'Applebee\'s', 'Waffle House', 'Arby\'s',
  'Holiday Inn', 'Best Western', 'Motel 6', 'Super 8', 'Days Inn', 'Hampton Inn', 'Marriott', 'Hilton', 'Wells Fargo', 'Chase Bank', 'Bank of America'];

/** Names that make a place sensitive (or a home) whatever its kind says (kind 'yes', a bare building). */
const NAME_RULES: [RegExp, Sensitive][] = [
  [/\b(?:elementary|middle|high|junior high|grade|primary|secondary|prep(?:aratory)?|charter|montessori)\s+school\b|\bschool\b|\bacademy\b|\buniversity\b|\bcollege\b|\bschool district\b/i, 'school'],
  [/\b(?:pre-?school|day ?care|child ?care|kindergarten|nursery)\b/i, 'childcare'],
  [/\b(?:hospital|clinic|medical|health (?:center|centre|clinic)|urgent care|emergency room|nursing home|hospice|rehab(?:ilitation)? center)\b/i, 'health'],
  [/\b(?:church|cathedral|chapel|mosque|synagogue|temple|shrine|parish|tabernacle|kingdom hall|gurdwara|monastery|convent|ministr(?:y|ies)|congregation|assembly of god)\b/i, 'worship'],
  [/\b(?:police|sheriff|courthouse|county jail|jail|prison)\b/i, 'police'],
  [/\b(?:fire (?:station|department|dept|hall)|firehouse|fireboat station)\b/i, 'fire'],
  [/\b(?:memorial|cemetery|graveyard|grave yard|mausoleum|funeral|crematorium)\b/i, 'memorial'],
  [/\b(?:shelter|soup kitchen|food bank|food pantry|rescue mission)\b/i, 'shelter'],
];
const RESIDENCE_NAME = /\b(?:residence|homestead|home of|'s house|house of)\b/i;

const tagValues = (tags: string[] = []) => tags.map((t) => (t.includes('=') ? t.split('=').slice(1).join('=') : t).toLowerCase().replace(/[\s-]+/g, '_'));
const tagged = (tags: string[] = [], key: string) => tags.filter((t) => t.toLowerCase().startsWith(`${key}=`)).map((t) => t.slice(key.length + 1));

/** What a place is, for the rules: sensitive (and why), a home, a business. */
export function classify(p: { kind: string; name: string; tags?: string[] }): PlaceClass {
  const kinds = [p.kind.toLowerCase().replace(/[\s-]+/g, '_'), ...tagValues(p.tags)];
  const sens = kinds.map((k) => SENSITIVE_KINDS[k]).find(Boolean) ?? null;
  const byName = NAME_RULES.find(([re]) => re.test(p.name));
  const residence = kinds.some((k) => RESIDENCE_KINDS.has(k)) || RESIDENCE_NAME.test(p.name) || (p.tags ?? []).some((t) => t === 'private' || t === 'access=private');
  const business = !sens && !residence && (kinds.some((k) => k in BUSINESS_KINDS) || tagged(p.tags, 'brand').length > 0 || tagged(p.tags, 'operator:type').includes('private'));
  const sensitive = sens ?? (byName ? byName[1] : null);
  return { sensitive, residence, business, why: sens ? `its kind (${kinds.find((k) => SENSITIVE_KINDS[k])})` : byName ? `its name` : residence ? 'a private home' : business ? 'a business' : '' };
}

const SENSITIVE_WORD: Record<Sensitive, string> = { school: 'a school', childcare: 'a childcare place', health: 'a hospital or clinic', worship: 'a place of worship',
  police: 'a police station', fire: 'a fire station', memorial: 'a memorial or cemetery', shelter: 'a shelter' };
export const sensitiveWord = (s: Sensitive) => SENSITIVE_WORD[s];

/** The generic descriptor a business goes by (never its name). */
export function descriptor(p: { kind: string; tags?: string[] }) {
  const kinds = [p.kind.toLowerCase().replace(/[\s-]+/g, '_'), ...tagValues(p.tags)];
  for (const k of kinds) if (BUSINESS_KINDS[k]) return BUSINESS_KINDS[k];
  return 'a local business';
}

/**
 * How the builder (and the gate's words) call a place: its real name for public places, a descriptor for a business
 * ("the diner on Broadway"), "a memorial" for a memorial (its name may be a private person's), and null for a home
 * (never offered). A place tagged 'generic-name' keeps its name (already a descriptor; its real one is its osm:name tag).
 */
export function displayName(p: PackagePlace | PackageLandmark): string | null {
  const c = classify(p);
  if (c.residence) return null;
  // (a name the library already wrote as a descriptor, "the tower on Mission St": kept; the real name is in osm:name)
  if ((p.tags ?? []).includes('generic-name')) return p.name;
  const street = tagged(p.tags, 'street')[0];
  if (c.business) return `${descriptor(p)}${street ? ` on ${street}` : ''}`;
  if (c.sensitive === 'memorial' && !/\bcemetery\b/i.test(p.name)) return `${/^the /.test(p.name) ? '' : 'a '}memorial${street ? ` on ${street}` : ''}`;
  return p.name;
}

const norm = (s: string) => ` ${s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;
/** Words that alone never make a name (a business called "Pharmacy" is not a brand). */
const GENERIC = new Set(['the', 'a', 'an', 'and', 'of', 'on', 'at', 'in', 'store', 'shop', 'market', 'cafe', 'diner', 'bar', 'grill', 'station', 'gas', 'hotel',
  'motel', 'inn', 'bank', 'pharmacy', 'drug', 'drugs', 'supply', 'feed', 'garage', 'auto', 'parts', 'restaurant', 'kitchen', 'bakery', 'office', 'building',
  'company', 'co', 'inc', 'llc', 'center', 'centre', 'plaza', 'mall', 'gym', 'club', 'pizza', 'burger', 'burgers', 'coffee', 'grocery', 'general', 'tire',
  'tires', 'wash', 'car', 'laundry', 'salon', 'barber', 'barbershop', 'liquor', 'theater', 'theatre', 'cinema', 'stadium', 'park', 'street', 'st', 'ave',
  'avenue', 'road', 'rd', 'main', 'north', 'south', 'east', 'west', 'n', 's', 'e', 'w', 'old', 'new', 'first', 'city', 'town', 'county', 'house', 'home',
  'apartments', 'residence', 'memorial', 'cemetery', 'warehouse', 'plant', 'storage']);
// (a name is a name when one of its words is capitalised and not generic: "Prairie Rose Diner", "BurgerBarn"; "the
// salvage yard" is already a descriptor)
const meaningful = (name: string) => name.split(/[^\p{L}\p{N}'’]+/u).some((w) => /^\p{Lu}/u.test(w) && w.length >= 2 && !GENERIC.has(norm(w).trim()));

/** The names a package withholds (never in a player's words): its homes', businesses', brands' and memorials'. */
export function withheldNames(pkg: CityPackage): { name: string; why: string }[] {
  const out = new Map<string, string>();
  for (const p of [...pkg.places, ...pkg.landmarks]) {
    const c = classify(p);
    const why = c.residence ? 'a private home' : c.business ? 'a business' : c.sensitive === 'memorial' && !/\bcemetery\b/i.test(p.name) ? 'a memorial (its name may be a private person\'s)' : '';
    const names = [...tagged(p.tags, 'osm:name'), ...((p.tags ?? []).includes('generic-name') ? [] : [p.name])];
    for (const n of names) if (why && meaningful(n)) out.set(n, why);
    for (const b of [...tagged(p.tags, 'brand'), ...tagged(p.tags, 'operator')]) if (meaningful(b)) out.set(b, 'a brand');
  }
  for (const b of CHAIN_BRANDS) out.set(b, 'a brand');
  return [...out].map(([name, why]) => ({ name, why }));
}

/** A street address: a house number, then a street ("412 N 4th St", "1200 Example Road"). */
export const ADDRESS = /\b\d{1,6}[A-Za-z]?\s+(?:[NSEW]\.?\s+|(?:North|South|East|West)\s+)?(?:[A-Za-z0-9][\w.'-]*\s+){1,3}(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Pl|Place|Ter|Terrace|Cir|Circle|Pkwy|Parkway|Hwy|Highway|Trl|Trail)\b\.?/;
/** Violence in words: a sentence that has one of these and a sensitive place is refused. */
export const VIOLENT_WORDS = /\b(?:blow(?:s|ing|n)?\s+(?:it\s+|them\s+)?up|blew\s+(?:it\s+|them\s+)?up|bomb\w*|explo(?:de|des|ded|ding|sion|sions|sive|sives)|detonat\w*|shoot\w*|shot|gunfire|gunfight|gunm[ae]n|crash(?:es|ed|ing)?|ram(?:s|med|ming)?|burn(?:s|ed|ing)?\s+(?:it\s+)?down|torch(?:es|ed|ing)?|set\s+fire|arson|attack\w*|kill\w*|murder\w*|stab\w*|fight\w*|brawl\w*|wreck\w*|raid\w*|ambush\w*|hostage\w*|smash\w*|storm(?:s|ed|ing)?\s+the|siege|massacre|shootout)\b/i;
/** Generic words for sensitive places, for the same sentence rule. */
const SENSITIVE_NOUNS = /\b(?:schools?|schoolyard|kindergarten|daycare|day care|hospitals?|clinics?|emergency room|churche?s?|chapels?|cathedrals?|mosques?|synagogues?|temples?|police station|precinct|sheriff'?s office|fire station|firehouse|memorials?|cemeter(?:y|ies)|graveyard|graves?|shelters?|nursing home)\b/i;

const has = (text: string, name: string) => norm(text).includes(norm(name));
const sentences = (t: string) => t.split(/(?<=[.!?])\s+|\n+/);

export type Ref = { key: string; at: string; mission: string | null; role: 'target' | 'visit' | 'scene' };
export type SafetyInput = { pkg: CityPackage; refs: Ref[]; violentMissions: Set<string>; texts: { at: string; text: string }[]; aliases: Record<string, { '@': string; name?: string }> };

/** Every problem the safety rules find (empty: safe). */
export function safetyProblems({ pkg, refs, violentMissions, texts, aliases }: SafetyInput): string[] {
  const out: string[] = [];
  const byId = new Map(pkg.places.map((p) => [p.id, p]));
  const resolve = (k: string) => byId.get(aliases[k]?.['@'] ?? k);
  // places: a home never; a sensitive place never the target of violence, never a place in a violent mission
  for (const r of refs) {
    const p = resolve(r.key);
    if (!p) continue; // (an unknown key is the gate's: "not a place in <town>")
    const c = classify(p), name = displayName(p) ?? 'a private home';
    if (c.residence) { out.push(`${r.at}: "@${r.key}" is a private home; homes are never story places (pick a public place).`); continue; }
    if (!c.sensitive) continue;
    if (r.role === 'target') out.push(`${r.at}: "@${r.key}" (${name}) is ${sensitiveWord(c.sensitive)}; a fight, chase, roadblock, crash or explosion never targets it. Move it to a public place nearby (a mission may pass by it).`);
    else if (r.mission && violentMissions.has(r.mission) && r.role === 'visit') out.push(`${r.at}: "@${r.key}" (${name}) is ${sensitiveWord(c.sensitive)}, and mission ${r.mission} is violent (a fight, a chase, a roadblock or lookouts); a violent mission never takes place at one. Set it at a public place nearby.`);
  }
  // words: no withheld name, no brand, no address, no violence at a sensitive place
  const withheld = withheldNames(pkg);
  const sensitiveNames = [...pkg.places, ...pkg.landmarks].filter((p) => classify(p).sensitive).map((p) => p.name)
    .concat(Object.values(aliases).filter((a) => a.name && resolve(a['@']) && classify(resolve(a['@'])!).sensitive).map((a) => a.name!));
  for (const t of texts) {
    for (const w of withheld) if (has(t.text, w.name)) { out.push(`${t.at}: "${clip(t.text)}" names "${w.name}", ${w.why}; real businesses, brands and private people are never named (use a generic word: "the diner", "the gas station").`); break; }
    const addr = ADDRESS.exec(t.text);
    if (addr) out.push(`${t.at}: "${clip(t.text)}" has a street address ("${addr[0].trim()}"); a story never gives a real address (name the corner or the place instead).`);
    for (const s of sentences(t.text)) {
      const v = VIOLENT_WORDS.exec(s);
      if (!v) continue;
      const named = sensitiveNames.find((n) => has(s, n)), noun = SENSITIVE_NOUNS.exec(s);
      if (named || noun) { out.push(`${t.at}: "${clip(s)}" puts violence ("${v[0]}") at ${named ? `"${named}"` : `"${noun![0]}"`}; schools, hospitals, places of worship, police and fire stations, memorials and shelters are never the scene of a fight, crash or explosion.`); break; }
    }
  }
  return [...new Set(out)];
}
const clip = (s: string) => (s.length > 90 ? `${s.slice(0, 87)}...` : s);
