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
 * A name counts as named by its full name or its distinctive core ("the Prairie Rose" for Prairie Rose Diner, "Okemah
 * High" for Okemah High School; never a bare town, street or common word): nameForms below.
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
  [/\b(?:pre-?school|day ?care|child ?care|kindergarten|nursery|learning cent(?:er|re)|early learning|montessori|head start)\b/i, 'childcare'],
  [/\b(?:hospital|clinic|medical|health (?:center|centre|clinic)|urgent care|emergency room|nursing home|hospice|rehab(?:ilitation)? center)\b/i, 'health'],
  [/\b(?:church|cathedral|chapel|mosque|synagogue|temple|shrine|parish|tabernacle|kingdom hall|gurdwara|monastery|convent|ministr(?:y|ies)|congregation|assembly of god|church of christ|masjid|baptist|methodist|lutheran|presbyterian|episcopal(?:ian)?|catholic|pentecostal|mennonite|adventist|nazarene|apostolic)\b/i, 'worship'],
  [/\b(?:police|sheriff|courthouse|county jail|jail|prison)\b/i, 'police'],
  [/\b(?:fire (?:station|department|dept|hall)|firehouse|fireboat station)\b/i, 'fire'],
  [/\b(?:memorial|cemetery|graveyard|grave yard|mausoleum|funeral|crematorium)\b/i, 'memorial'],
  [/\b(?:shelter|soup kitchen|food bank|food pantry|rescue mission)\b/i, 'shelter'],
];
/** "St. Mary's", "Saint Anne's": a church's name, when its kind says nothing else (not a business or a home by kind).
 * A place tagged with a religion (religion=*) is a place of worship whatever its name. */
const SAINT_NAME = /^(?:[Tt]he\s+)?(?:S[Tt]\.?|[Ss]aint)\s+\p{Lu}\p{L}*['’]s\b/u;
const RESIDENCE_NAME = /\b(?:residence|homestead|home of|'s house|house of)\b/i;

const tagValues = (tags: string[] = []) => tags.map((t) => (t.includes('=') ? t.split('=').slice(1).join('=') : t).toLowerCase().replace(/[\s-]+/g, '_'));
const tagged = (tags: string[] = [], key: string) => tags.filter((t) => t.toLowerCase().startsWith(`${key}=`)).map((t) => t.slice(key.length + 1));

/** What a place is, for the rules: sensitive (and why), a home, a business. */
export function classify(p: { kind: string; name: string; tags?: string[] }): PlaceClass {
  const kinds = [p.kind.toLowerCase().replace(/[\s-]+/g, '_'), ...tagValues(p.tags)];
  const sens = kinds.map((k) => SENSITIVE_KINDS[k]).find(Boolean) ?? null;
  const religion = tagged(p.tags, 'religion').length > 0;
  const byKind = kinds.some((k) => k in BUSINESS_KINDS || RESIDENCE_KINDS.has(k));
  const nameRule = NAME_RULES.find(([re]) => re.test(p.name))?.[1] ?? (SAINT_NAME.test(p.name) && !byKind ? 'worship' : null);
  const byName: Sensitive | null = nameRule ?? (religion ? 'worship' : null);
  const residence = kinds.some((k) => RESIDENCE_KINDS.has(k)) || RESIDENCE_NAME.test(p.name) || (p.tags ?? []).some((t) => t === 'private' || t === 'access=private');
  const business = !sens && !residence && (kinds.some((k) => k in BUSINESS_KINDS) || tagged(p.tags, 'brand').length > 0 || tagged(p.tags, 'operator:type').includes('private'));
  const sensitive = sens ?? byName;
  return { sensitive, residence, business, why: sens ? `its kind (${kinds.find((k) => SENSITIVE_KINDS[k])})` : byName ? (nameRule ? 'its name' : 'its religion tag') : residence ? 'a private home' : business ? 'a business' : '' };
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

/**
 * A name's forms that count as naming it in a player's words, normalised (norm): the full name, its CORE (the name
 * with "the" and the words that say what it is, not which one, stripped: "Prairie Rose" of "Prairie Rose Diner",
 * "Okemah High" of "Okemah High School" as its short form) and the short forms "X High", "X Elementary", "X Middle".
 * A core counts only when it is distinctive: two or more words not all generic, street or town words ("First Street" of
 * "First Street Chapel" is a street, "Okemah" of "Okemah Police Department" the town), or one word of 5 letters or more
 * that is not a common word, a street or the town ("Thunderbird"; not "veterans", "crossroads", "highland").
 */
const KIND_SUFFIXES = ['junior high school', 'high school', 'middle school', 'elementary school', 'grade school', 'primary school', 'secondary school',
  'school district', 'school', 'elementary', 'middle', 'academy', 'learning center', 'learning centre', 'day care', 'daycare', 'child care', 'childcare',
  'preschool', 'kindergarten', 'montessori', 'medical center', 'medical centre', 'health center', 'health centre', 'health clinic', 'hospital', 'clinic',
  'urgent care', 'nursing home', 'church of christ', 'church', 'chapel', 'cathedral', 'temple', 'mosque', 'masjid', 'synagogue', 'parish', 'tabernacle',
  'cemetery', 'graveyard', 'memorial park', 'memorial', 'funeral home', 'police department', 'police station', 'police', 'sheriffs office',
  'fire department', 'fire station', 'fire hall', 'department', 'station', 'shelter', 'center', 'centre', 'inc', 'llc', 'co', 'company', 'corp',
  'diner', 'cafe', 'restaurant', 'grill', 'bar', 'pub', 'tavern', 'motel', 'hotel', 'inn', 'lodge', 'fuel', 'gas', 'store', 'shop', 'market', 'house',
  'and', 'the'].map((x) => x.split(' '));
/** Words that alone (or together, only with each other) are not a name: structure, streets, common prose. */
const COMMON = new Set(['veterans', 'veteran', 'crossroads', 'community', 'central', 'national', 'american', 'united', 'country', 'valley', 'river',
  'creek', 'hills', 'family', 'people', 'citizens', 'friends', 'peace', 'freedom', 'liberty', 'victory', 'pioneer', 'frontier', 'heritage', 'sunset',
  'sunrise', 'golden', 'silver', 'highland', 'highlands', 'lakeside', 'riverside', 'hillside', 'westside', 'eastside', 'southside', 'northside', 'downtown',
  'uptown', 'midtown', 'broadway', 'lincoln', 'washington', 'jefferson', 'madison', 'franklin', 'jackson', 'maple', 'cedar', 'walnut', 'chestnut',
  'spruce', 'willow', 'magnolia', 'union', 'church', 'school', 'college', 'center', 'square', 'county', 'state', 'public', 'local', 'little', 'small',
  'great', 'grand', 'royal', 'children', 'kids', 'senior', 'seniors', 'christian', 'faith', 'grace', 'trinity', 'saint', 'holy', 'sacred',
  'harvest', 'prairie', 'meadow', 'garden', 'gardens', 'village', 'western', 'eastern', 'southern', 'northern', 'corner', 'station', 'crossing', 'junction',
  'highway', 'interstate', 'route', 'third', 'second', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'evening', 'morning', 'night',
  'civic', 'foods', 'budget', 'ambassador', 'chase', 'waffle', 'holiday', 'chinese', 'mexican', 'italian', 'french', 'korean', 'filipino', 'indian',
  'beacon', 'palms', 'canyon', 'metropolitan', 'capital', 'capitol', 'empire', 'eagle', 'eagles', 'falcon', 'phoenix', 'summit', 'pacific',
  'atlantic', 'regional', 'general', 'premier', 'quality', 'economy', 'express', 'super', 'discount', 'friendly', 'happy', 'lucky',
  'sunny', 'sunshine', 'rainbow', 'fire', 'fighters', 'firefighters', 'police', 'officers', 'volunteers', 'soldiers', 'sailors', 'marines', 'world', 'war',
  // given names that are surnames too (a character may be called this)
  'george', 'georges', 'allen', 'james', 'john', 'johns', 'mary', 'marys', 'peter', 'paul', 'thomas', 'charles', 'henry', 'william', 'joseph', 'michael',
  'david', 'daniel', 'robert', 'richard', 'edward', 'martin', 'louis', 'arthur', 'walter', 'harold', 'wallace', 'grant', 'marshall', 'sherman', 'mason',
  'carter', 'cooper', 'parker', 'turner', 'walker', 'miller', 'smith', 'jones', 'brown', 'davis', 'wilson', 'taylor', 'clark', 'lewis', 'young', 'hampton']);
const STREET_WORDS = new Set(['street', 'st', 'avenue', 'ave', 'road', 'rd', 'drive', 'dr', 'lane', 'ln', 'boulevard', 'blvd', 'court', 'ct', 'way',
  'place', 'pl', 'terrace', 'circle', 'parkway', 'highway', 'hwy', 'route', 'trail', 'n', 's', 'e', 'w', 'north', 'south', 'east', 'west']);
/** "X High School" is also "X High" (and "X Junior High", "X Elementary", "X Middle"). */
const SHORT_FORMS = [['high', 'school'], ['elementary', 'school'], ['middle', 'school']];
const endsWith = (t: string[], tail: string[]) => tail.length <= t.length && tail.every((w, i) => t[t.length - tail.length + i] === w);

export type NameContext = { plain: Set<string> };
/** The words of a town that never make a name alone: its own name, its state's, its main roads', its districts'. */
export function nameContext(pkg?: Pick<CityPackage, 'name' | 'state' | 'places' | 'roadsSummary' | 'districts'>): NameContext {
  const plain = new Set<string>();
  const add = (s: string) => { for (const w of norm(s).trim().split(' ')) if (w) plain.add(w); };
  if (pkg) {
    add(pkg.name); add(pkg.state);
    for (const r of pkg.roadsSummary?.main ?? []) add(r);
    for (const d of pkg.districts ?? []) add(d.name);
    for (const p of pkg.places) for (const st of tagged(p.tags, 'street')) add(st);
  }
  return { plain };
}
export function nameForms(name: string, ctx: NameContext = nameContext()): string[] {
  const full = norm(name).trim(), tokens = full.split(' ').filter(Boolean);
  const forms = new Set<string>(full ? [full] : []);
  const plainWord = (w: string) => GENERIC.has(w) || STREET_WORDS.has(w) || ctx.plain.has(w) || /^\d/.test(w);
  let t = tokens.slice();
  while (t[0] === 'the' || t[0] === 'a') t = t.slice(1);
  if (SHORT_FORMS.some((tail) => endsWith(t, tail) && t.length > tail.length)) forms.add(t.slice(0, -1).join(' '));
  const named = t.length;
  for (let cut = true; cut && t.length;) { cut = false; for (const s of KIND_SUFFIXES) if (endsWith(t, s) && t.length > s.length) { t = t.slice(0, t.length - s.length); cut = true; break; } }
  while (t[0] === 'the' || t[0] === 'a') t = t.slice(1);
  // (one word is a core only when a kind word was stripped from it, "Thunderbird" of "Thunderbird Motel": "The Quinn" is
  // already its full name, and "Quinn" alone may be anyone's)
  const distinctive = t.length >= 2 ? t.some((w) => !plainWord(w) && !COMMON.has(w))
    : t.length === 1 && t.length < named && t[0].length >= 5 && !plainWord(t[0]) && !COMMON.has(t[0]);
  if (distinctive) forms.add(t.join(' '));
  return [...forms];
}
/** Whether a text names a place (by its full name, its core or a short form), case- and punctuation-insensitively. */
export const namedIn = (text: string, forms: string[]) => { const t = norm(text); return forms.some((f) => t.includes(` ${f} `)); };

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
export const VIOLENT_WORDS = /\b(?:blow(?:s|ing|n)?\s+(?:it\s+|them\s+)?up|blew\s+(?:it\s+|them\s+)?up|bomb\w*|explo(?:de|des|ded|ding|sion|sions|sive|sives)|detonat\w*|shoot\w*|shots?|gunfire|gunfight|gunm[ae]n|crash(?:es|ed|ing)?|ram(?:s|med|ming)?|burn(?:s|ed|ing)?\s+(?:it\s+)?down|torch(?:es|ed|ing)?|set\s+fire|arson|attack\w*|kill\w*|murder\w*|stab\w*|fight\w*|brawl\w*|wreck\w*|raid\w*|ambush\w*|hostage\w*|smash\w*|storm(?:s|ed|ing)?\s+the|siege|massacre|shootout)\b/i;
/** Generic words for sensitive places, for the same sentence rule. */
const SENSITIVE_NOUNS = /\b(?:schools?|schoolyard|kindergarten|daycare|day care|hospitals?|clinics?|emergency room|churche?s?|chapels?|cathedrals?|mosques?|synagogues?|temples?|police station|precinct|sheriff'?s office|fire station|firehouse|memorials?|cemeter(?:y|ies)|graveyard|graves?|shelters?|nursing home)\b/i;

/** Camera phrases with "shot" in them are not violence; every other "shot" is gunfire. A "shot" is a camera word only in
 * a camera noun phrase: a camera modifier after a determiner or a sentence start ("a wide shot", "Establishing shot of",
 * "the over-the-shoulder shot"), a determiner and "shot of" / "shot shows" ("one last shot of", "the shot shows"), or
 * "in this shot". When it reads as a verb ("the hero shot guards", "Then the hero shot.", "shot at", "was shot",
 * "got shot", "shot him") or is unclear, it is violence: refusing beats letting gunfire at a school through. */
const DET = String.raw`(?:a|an|the|this|that|these|those|each|every|one|two|our|your|their|its|another|same|next|first|last|final|opening|closing|single|quick|slow|brief|long|extreme|very|sweeping|steady|handheld|static|full|dramatic|wide)`;
/** Modifiers that only ever describe a camera shot. */
const CAM = String.raw`(?:wide|wider|close|closer|close-?up|extreme\s+close(?:-?up)?|long|medium|establishing|tracking|aerial|crane|overhead|low[- ]angle|high[- ]angle|over[- ]the[- ]shoulder|cutaway|cut-away|point[- ]of[- ]view|pov|dolly|panning|tight|insert|reverse|wide-angle)`;
/** Words that are camera modifiers but also people or things that can fire ("the hero shot", "the group shot at"). */
const CAM_NOUN = String.raw`(?:hero|group|drone|still|camera|reaction|beauty|split|pan|master|two|three)`;
/** What may come before a camera phrase: a sentence start, a determiner (and its adjectives), or "cut to" / "open on". */
const LEAD = String.raw`(?:^|[.!?;:,(—–-]\s*|\b(?:to|on|with|then|and)\s+|\b${DET}\s+)(?:${DET}\s+){0,2}`;
/** Camera verbs that may follow "shot" ("the shot shows", "a wide shot pans"). */
const CAM_VERB = String.raw`(?:shows?|reveals?|pans?|cuts?|opens?|frames?|holds?|captures?|lingers?|tracks?|follows?|sweeps?|zooms?|pulls?\s+back|pushes?\s+in|establishes|fades?|dissolves?|showing|revealing|framing|panning)`;
/** After a clear camera modifier + "shot": an end, a pause, "of", "from above", a camera verb, or "and"/"as"/"while". */
const CAM_AFTER = new RegExp(String.raw`^(?:\s*$|\s*[.,:;!?)—–]|\s+-|\s+(?:of|list|from\s+(?:above|below|the\s+air|overhead|a\s+distance|afar|across)|over|across|along|${CAM_VERB}|and|as|while|then)\b)`, 'i');
/** After a camera-ish noun + "shot", or a determiner + bare "shot": only "of", a colon or dash, a list, or a camera verb. */
const STRICT_AFTER = new RegExp(String.raw`^(?:\s*[:—–]|\s+-|\s+(?:of|list|${CAM_VERB})\b)`, 'i');
const CAM_BEFORE = new RegExp(String.raw`${LEAD}${CAM}\s+$`, 'i');
const CAM_NOUN_BEFORE = new RegExp(String.raw`(?:^|[.!?;:(]\s*|\b(?:a|an|to|on)\s+)${CAM_NOUN}\s+$`, 'i');
const DET_BEFORE = new RegExp(String.raw`(?:^|[.!?;:(]\s*|\b${DET}\s+)$`, 'i');
const IN_SHOT_BEFORE = /\b(?:in|within|out\s+of|throughout)\s+(?:the\s+)?(?:this|that|the|each|every|one|same|next|last|final|first|opening|closing|wide|establishing)\s+$/i;
/** "was shot", "got shot", "being shot" (and "were still shot"): always gunfire. */
const PASSIVE_BEFORE = /\b(?:is|was|were|are|be|been|being|get|gets|got|gotten|getting)\s+(?:\w+\s+)?$/i;
/** Firing, weapon or impact words: a sentence with one of these anywhere reads every "shot" as gunfire ("The sniper took a
 * long shot across the schoolyard.", "A long shot then shattered the window."), however camera-like the phrase. ("fire"
 * as in "fire station" / "fire truck" is a place or a thing, not firing.) */
const GUNFIRE_CONTEXT = /\b(?:fire(?!\s*(?:station|stations|house|truck|trucks|engine|engines|department|dept|fighters?|hydrants?|escape|alarm|exit|drill|chief|crew|hall))|fires|fired|firing|sniper\w*|gun\w*|rifles?|pistols?|revolvers?|shotguns?|bullets?|triggers?|aim|aims|aimed|aiming|shatter\w*|smash\w*|hit|hits|struck|strike|strikes|ricochet\w*|wound\w*|kill\w*|dropped)\b/i;
const isCameraShot = (s: string, at: number, word: string) => {
  const before = s.slice(0, at), after = s.slice(at + word.length);
  if (GUNFIRE_CONTEXT.test(s)) return false;
  if (PASSIVE_BEFORE.test(before) || /^\s+at\b/i.test(after)) return false;
  if (CAM_BEFORE.test(before)) return CAM_AFTER.test(after);
  if (CAM_NOUN_BEFORE.test(before)) return STRICT_AFTER.test(after);
  if (IN_SHOT_BEFORE.test(before)) return true;
  if (DET_BEFORE.test(before)) return STRICT_AFTER.test(after);
  return false;
};
const VIOLENT_ALL = new RegExp(VIOLENT_WORDS.source, 'gi');
/** The first violent word in a sentence that is not a camera "shot", or null. */
export const violenceIn = (s: string): RegExpExecArray | null => {
  VIOLENT_ALL.lastIndex = 0;
  for (let m = VIOLENT_ALL.exec(s); m; m = VIOLENT_ALL.exec(s)) {
    if (/^shots?$/i.test(m[0]) && isCameraShot(s, m.index, m[0])) continue;
    return m;
  }
  return null;
};
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
  const ctx = nameContext(pkg);
  const withheld = withheldNames(pkg).map((w) => ({ ...w, forms: nameForms(w.name, ctx) }));
  const sensitiveNames = [...pkg.places, ...pkg.landmarks].filter((p) => classify(p).sensitive).map((p) => p.name)
    .concat(Object.values(aliases).filter((a) => a.name && resolve(a['@']) && classify(resolve(a['@'])!).sensitive).map((a) => a.name!))
    .map((name) => ({ name, forms: nameForms(name, ctx) }));
  for (const t of texts) {
    for (const w of withheld) if (namedIn(t.text, w.forms)) { out.push(`${t.at}: "${clip(t.text)}" names "${w.name}", ${w.why}; real businesses, brands and private people are never named (use a generic word: "the diner", "the gas station").`); break; }
    const addr = ADDRESS.exec(t.text);
    if (addr) out.push(`${t.at}: "${clip(t.text)}" has a street address ("${addr[0].trim()}"); a story never gives a real address (name the corner or the place instead).`);
    for (const s of sentences(t.text)) {
      const v = violenceIn(s);
      if (!v) continue;
      const named = sensitiveNames.find((n) => namedIn(s, n.forms))?.name, noun = SENSITIVE_NOUNS.exec(s);
      if (named || noun) { out.push(`${t.at}: "${clip(s)}" puts violence ("${v[0]}") at ${named ? `"${named}"` : `"${noun![0]}"`}; schools, hospitals, places of worship, police and fire stations, memorials and shelters are never the scene of a fight, crash or explosion.`); break; }
    }
  }
  return [...new Set(out)];
}
const clip = (s: string) => (s.length > 90 ? `${s.slice(0, 87)}...` : s);
