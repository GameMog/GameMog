/**
 * Story Kit: what the pack gate knows about each city, as static data (the gate runs on the server, where no city loads).
 *
 *  PLACES      the city's place list: every key a pack may name with "@key" (New York: the spawn keys and named corners
 *              Mog City's runner resolves, wagmi/storyrun/places.js, drift-checked there by node --test; San Francisco:
 *              the arrivals and PLACES of the module kept for later, storykit/cities/sf/city.js, which
 *              scripts/storykit-pack-check.ts reads). `foot`: more than 40 m off the lanes, a walk target only.
 *              `startOnly`: no lanes in the route graph (the FDR), a start or a place step only.
 *  CAM_POINTS  the city's named cutscene camera points (city.camPoint).
 *  BUILDS      the city builds a pack's base.cityBuild may name (the current one first).
 *  SELF        how the city's own name is written; FOREIGN  words that place a text in another city (the Dognapped Mog
 *              was Chicago street labels on New York): refused in on-screen labels, a warning in dialogue.
 */
export type Place = { name: string; foot?: true; startOnly?: true };
export type CityId = 'ny' | 'sf';

export const CITY_NAME: Record<CityId, string> = { ny: 'New York', sf: 'San Francisco' };

/**
 * A hometown (Hometown, Build Spec v1): a US town compiled from open data, its pack's base.city 'hometown' and its town
 * pinned in base.hometown { place, compiler, tiles }. It has no static list here: the gate reads its city package's
 * table (storykit/hometown/hometown-gate.ts cityTableOf), passed as gatePack(pack, { city }). Without one a hometown
 * pack is refused, so nothing that gates without a table (the store, the builder's New York path) lets one through.
 */
export const HOMETOWN = 'hometown';
/**
 * base.hometown: the town pinned. v1 { place, compiler, tiles }; v2 (the national grid hg1) adds the session frame the
 * town's descriptor pinned (grid, domain, origin, k0, gamma0, yOffset, waterLevel; compiler is the buildId).
 */
export type HometownLock = {
  place: string; compiler: string; tiles: string;
  formatVersion?: 2 | 3; grid?: 'hg1'; domain?: string; origin?: { c0: number; r0: number }; k0?: number; gamma0?: number; yOffset?: number; waterLevel?: number;
};
/** every part of a lock the gate compares (a v1 lock has the first three) */
export const LOCK_KEYS = ['place', 'compiler', 'tiles', 'formatVersion', 'grid', 'domain', 'origin', 'k0', 'gamma0', 'yOffset', 'waterLevel'] as const;
export type CityTable = {
  /** the town's name, as the gate's words say it ("Okemah, Oklahoma") */
  name: string;
  /** every "@key" a pack may name: the package's places (private homes left out), in cities.ts's Place shape */
  places: Record<string, Place>;
  camPoints: string[];
  /** the cityBuilds Mog City's engine plays the town at (one: hometown-<compiler version>) */
  builds: string[];
  /** the town the pack must pin, exactly */
  lock: HometownLock;
  /** how the town's own name is written (never a foreign city in its own story) */
  self: string[];
};

export const BUILDS: Record<CityId, string[]> = {
  ny: ['ny-bc7d0b3-1'],
  sf: ['sf-bc7d0b3-1'],
};

/**
 * Mog City's engine (base.engine mogcity-1, mc.gamemog.com): the cities it plays and the build each names. Only New
 * York so far: Mog City's own map (its js/, the frame the older storykit-1 New York shared), whose place library (Mog City
 * wagmi/storyrun/places.js) resolves every key of PLACES.ny above, with no named camera points. A city map added
 * later joins here.
 */
export const MOGCITY_BUILDS: Partial<Record<CityId, string[]>> = { ny: ['ny-mogcity-1'] };
export const ENGINE_BUILDS: Record<string, Partial<Record<CityId, string[]>>> = { 'storykit-1': BUILDS, 'mogcity-1': MOGCITY_BUILDS };
/** The builds a pack may name for its engine and city (none: that engine does not play that city). */
export const buildsFor = (engine: string, city: CityId): string[] => ENGINE_BUILDS[engine]?.[city] ?? [];

export const PLACES: Record<CityId, Record<string, Place>> = {
  ny: {
    // the fork's spawn keys (Mog City js/city-config.js TELEPORT_LOCATIONS)
    empire: { name: 'the Empire State Building (5th Ave & W 36th St)' },
    timessq: { name: 'Times Square (7th Ave & W 46th St)' },
    chrysler: { name: 'the Chrysler Building (Lexington Ave & E 40th St)' },
    grandcentral: { name: 'Grand Central (Park Ave & E 40th St)' },
    bryant: { name: 'Bryant Park (6th Ave & W 41st St)' },
    flatiron: { name: 'the Flatiron (5th Ave & E 25th St)' },
    centralpark: { name: 'Central Park South (6th Ave & W 57th St)' },
    owtc: { name: 'One World Trade Center', foot: true },
    // the named corners (Mog City wagmi/storyrun/places.js)
    tower: { name: 'Park Ave & E 51st St' },
    towergarage: { name: 'Lexington Ave & E 52nd St' },
    les: { name: 'Orchard St & Rivington St' },
    ludlow: { name: 'Ludlow St & E Houston St' },
    delancey: { name: 'Delancey St & Essex St (Williamsburg Bridge)' },
    soho: { name: 'Prince St & Greene St' },
    bowery: { name: 'Bowery & E Houston St' },
    meatpacking: { name: 'Gansevoort St & Washington St' },
    chelsea: { name: 'W 24th St & 10th Ave (galleries)' },
    tribeca: { name: 'Franklin St & Hudson St' },
    canal: { name: 'Canal St & Varick St (Holland Tunnel)' },
    westvillage: { name: 'Bank St & Greenwich St' },
    foley: { name: 'Foley Square (Centre St & Worth St)' },
    hudsonyards: { name: 'W 33rd St & 11th Ave' },
    lincoln: { name: 'Lincoln Center (Columbus Ave & W 63rd St)' },
    amnh: { name: 'the museum (Columbus Ave & W 79th St)' },
    ues: { name: 'Park Ave & E 97th St' },
    un: { name: 'E 42nd St & 1st Ave (the UN)' },
    harlem: { name: 'Harlem (W 125th St & Frederick Douglass Blvd)' },
    timessquare: { name: 'Times Square (7th Ave & W 46th St)' },
    wallst: { name: 'Wall St & Broad St' },
    // Mog City's story places (its port, .scratch/storykit/MOGCITY-PORT.md)
    murrayhill: { name: 'Madison Ave & E 37th St (Murray Hill)' },
    chelseapark: { name: 'Chelsea Park (9th Ave & W 28th St)' },
    tenth47: { name: '10th Ave & W 47th St' },
    tenth55: { name: '10th Ave & W 55th St' },
    westyards: { name: '12th Ave & W 55th St (the container yards)' },
    javits: { name: '11th Ave & W 34th St (the convention center)' },
    heraldsq: { name: 'Herald Square (6th Ave & W 34th St)' },
    westchelsea: { name: '11th Ave & W 22nd St (West Chelsea)' },
    washsq: { name: 'Washington Square (5th Ave & Washington Sq N)' },
    washmews: { name: '5th Ave & W 8th St (Washington Mews)' },
    sdrpark: { name: 'Sara D. Roosevelt Park (Forsyth St & Rivington St)' },
    // on the FDR itself: no lanes in the route graph
    fdr: { name: 'FDR Drive at E 34th St (northbound)', startOnly: true },
    'fdr-un': { name: 'FDR Drive by the UN (E 45th St, southbound)', startOnly: true },
  },
  sf: {
    // arrivals (storykit/cities/sf/js/city-config.js TELEPORT_DEFS and LANDMARK_TELEPORTS)
    powell: { name: 'Powell St & California St' },
    market: { name: 'Montgomery St & Market St' },
    mission: { name: 'Dolores St by the Mission' },
    ferry: { name: 'the Ferry Building' },
    salesforce: { name: 'the tower on Mission St' },
    transamerica: { name: 'the pyramid on Montgomery St' },
    coit: { name: 'Coit Tower' },
    lombard: { name: 'the crooked block of Lombard St' },
    wharf: { name: "Fisherman's Wharf" },
    unionsquare: { name: 'Union Square' },
    chinatown: { name: 'the Dragon Gate' },
    civiccenter: { name: 'City Hall' },
    oraclepark: { name: 'the ballpark at China Basin' },
    nobhill: { name: 'the cathedral on Nob Hill' },
    // the place library (storykit/cities/sf/city.js PLACES)
    touchdown: { name: 'Fremont & Harrison' },
    bayramp: { name: 'the Bay Bridge on-ramp at 1st St' },
    ramp5th: { name: 'the 5th St bridge ramp' },
    ramp280: { name: 'the I-280 ramps at King St' },
    ramp101: { name: 'the US-101 ramps at 10th St' },
    octavia: { name: 'Market & Octavia' },
    larkin_eddy: { name: 'Larkin & Eddy' },
    leavenworth_eddy: { name: 'Leavenworth & Eddy' },
    civic: { name: 'Civic Center' },
    bart16: { name: '16th St BART' },
    mission_14: { name: 'Mission at 14th' },
    valencia_15: { name: 'Valencia & 15th' },
    dolores_15: { name: 'Dolores at 15th' },
    under280: { name: 'under I-280 at 16th' },
    third_16: { name: '3rd & 16th' },
    mission_rock: { name: '3rd & Mission Rock' },
    fourth_mb: { name: '4th St in Mission Bay' },
    pier48: { name: 'Pier 48', foot: true },
    pier28: { name: 'Piers 26–28', foot: true },
    pier9: { name: 'Pier 9', foot: true },
    pier24: { name: 'the Pier 24 dock' },
    tenth_harrison: { name: '10th & Harrison' },
    sixth_folsom: { name: '6th & Folsom' },
    bryant: { name: 'Bryant St by the Hall of Justice' },
    hall: { name: 'the Hall of Justice', foot: true },
    vanness: { name: 'Van Ness Ave' },
    broadway: { name: 'Broadway in Pacific Heights' },
    goldengate_ave: { name: 'Golden Gate Ave' },
    king_4th: { name: 'King & 4th' },
    emb_mission: { name: 'the Embarcadero at Mission' },
    emb_bryant: { name: 'the Embarcadero at Bryant' },
    folsom_2nd: { name: 'Folsom & 2nd' },
    harrison_8th: { name: 'Harrison & 8th' },
    channel_4th: { name: 'Channel & 4th' },
    vn_broadway: { name: 'Van Ness & Broadway' },
  },
};

export const CAM_POINTS: Record<CityId, string[]> = {
  ny: [],
  sf: ['bridge-west-span', 'bridge-from-rincon', 'bridge-deck-far', 'bridge-mid', 'bridge-near', 'bay-east'],
};

export const SELF: Record<CityId, string[]> = {
  ny: ['New York', 'NYC', 'Manhattan'],
  sf: ['San Francisco', 'SF', 'the Bay'],
};

// Words that put a text in a particular other city. Whole words, any case. Kept to names that mean one place (SoHo,
// Broadway and Lincoln Park are left out: they are in several of these cities).
const SIGNATURE: Record<string, string[]> = {
  'New York': ['New York', 'NYC', 'Manhattan', 'Brooklyn', 'the Bronx', 'Harlem', 'Times Square', 'Wall Street', 'Staten Island', 'Tribeca', 'the FDR', 'Queensboro', 'Williamsburg Bridge'],
  'San Francisco': ['San Francisco', 'Golden Gate Bridge', 'Embarcadero', 'Alcatraz', 'Haight-Ashbury', 'Nob Hill', 'Tenderloin', 'Bay Bridge', 'Oakland', "Fisherman's Wharf", 'Frisco'],
  Chicago: ['Chicago', 'Chi-town', 'Wrigley', 'Wrigleyville', 'Lake Shore Drive', 'Lake Shore Dr', 'Michigan Avenue', 'Michigan Ave', 'Magnificent Mile', 'Navy Pier', 'the Loop', 'Wacker', "O'Hare", 'Millennium Park', 'Lake Michigan', 'Wicker Park', 'Pilsen', 'Cook County', 'the L train'],
  'Los Angeles': ['Los Angeles', 'Hollywood', 'Sunset Boulevard', 'Sunset Blvd', 'Santa Monica', 'Venice Beach', 'Beverly Hills', 'Malibu', 'Rodeo Drive', 'Compton'],
  London: ['London', 'Piccadilly', 'the Thames', 'Trafalgar', 'Big Ben', 'Shoreditch', 'Westminster', 'Camden Town'],
  Paris: ['Paris', 'Champs-Élysées', 'Champs-Elysees', 'Eiffel', 'Montmartre', 'the Seine'],
  Tokyo: ['Tokyo', 'Shibuya', 'Shinjuku', 'Akihabara'],
  Miami: ['Miami', 'South Beach', 'Biscayne', 'Little Havana'],
  'Las Vegas': ['Las Vegas', 'Vegas'],
  Boston: ['Boston'], Seattle: ['Seattle'], Toronto: ['Toronto'], Singapore: ['Singapore'], Detroit: ['Detroit'],
  Philadelphia: ['Philadelphia', 'Philly'], Atlanta: ['Atlanta'], 'New Orleans': ['New Orleans'], Houston: ['Houston'], Dallas: ['Dallas'],
};
const OWN: Record<CityId, string> = { ny: 'New York', sf: 'San Francisco' };
// another city's word that is also a street here (New York's Houston St, in its own place list: "below Houston")
const LOCAL: Record<CityId, string[]> = { ny: ['Houston'], sf: [] };
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The other cities a text names, for a story set in `city`: [{ city, word }] (empty when it names none). */
export function foreignIn(text: string, city: CityId | string, own?: string[]): { city: string; word: string }[] {
  const out: { city: string; word: string }[] = [];
  // (a hometown names itself: `own` is its own names, so a story set in a town that shares a name with one of these is not foreign)
  const mine = own ? own.map((w) => w.toLowerCase()) : [];
  for (const [other, words] of Object.entries(SIGNATURE)) {
    if (other === OWN[city as CityId] || mine.includes(other.toLowerCase())) continue;
    for (const w of words) {
      if ((LOCAL[city as CityId] ?? []).includes(w) || mine.includes(w.toLowerCase())) continue;
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])${esc(w)}(?=$|[^\\p{L}\\p{N}])`, 'iu');
      if (re.test(text)) { out.push({ city: other, word: w }); break; }
    }
  }
  return out;
}
