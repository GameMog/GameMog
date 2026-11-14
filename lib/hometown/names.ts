/**
 * A town's street names as a player reads them, in the Story Kit's place list and so in the missions it writes.
 *
 * The town compiler (MogCity tools/hometown/frame.py, up to 0.9.0) title-cases its arrivals' and mission places' street
 * names with Python's str.title(), which writes "N 3Rd St", "S 14Th St", "Mccord St", "St John'S Rd", "Us Hwy 62" and
 * "Ne 23Rd St"; the road graph keeps the capitals ("N 3RD ST"). Mog City puts the same names right when it loads a town
 * (cities/pkg/js/pkg-hud.js pkgNameCase, the same rules), so the builder's words and the game's labels agree.
 *
 *   nameCase(s)     a title-cased name put right: "N 3rd St", "McCord St", "St John's Rd", "US Hwy 62", "NE 23rd St";
 *                   text already spelled right is unchanged ("O'Connor St", "Okemah High School")
 *   titleStreet(s)  a road graph's capitals as a display name: "N 3RD ST" -> "N 3rd St", "O'CONNOR ST" -> "O'Connor St"
 */
export const nameCase = (s: string): string => String(s ?? '')
  .replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_, d: string, x: string) => d + x.toLowerCase())
  .replace(/\bMc([a-z])(?=[a-z])/g, (_, c: string) => 'Mc' + c.toUpperCase())
  .replace(/([A-Za-z])(['’])([A-Z])\b/g, (_, a: string, q: string, c: string) => a + q + c.toLowerCase())
  .replace(/\b(Ne|Nw|Se|Sw)\b(?= \S)/g, (w) => w.toUpperCase())
  .replace(/\b(Us|Sr|Fm)(?= (\d|Hwy\b|Highway\b|Route\b|Rte\b))/g, (w) => w.toUpperCase());

export const titleStreet = (s: string): string => nameCase(String(s ?? '').toLowerCase()
  .replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase())
  .replace(/\bO(['’])([a-z])/g, (_, q: string, c: string) => 'O' + q + c.toUpperCase()));
