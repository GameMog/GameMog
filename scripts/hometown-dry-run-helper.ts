/**
 * deploy/town-builder/dry-run.sh's helper: what the production builder decides for a place, printed for the shell.
 *   gazetteer <placeId>   the compiler's places-file entry the worker gets (THE play box: lib/hometown/box.ts)
 *   regions <placeId>     the L4 region blocks round the town's tile range ("C,R" lines, one ring of margin)
 */
import { placeById } from '../lib/places/search.ts';
import { gazetteerOf } from '../lib/hometown-build/towns.ts';
import { stage1 } from '../lib/hometown-build/grid.ts';

const [cmd, id] = process.argv.slice(2);
const p = placeById(id ?? '');
if (!p) { console.error(`no place ${id}`); process.exit(2); }
const g = gazetteerOf(p);
if (cmd === 'gazetteer') console.log(JSON.stringify({ format: 'hometown-places', places: { [p.placeId]: g } }));
else if (cmd === 'regions') {
  const s = stage1(p.placeId, { geoid: g.geoid, anchor: g.anchor, bbox: g.bbox });
  const [c0, r0, c1, r1] = s.tileRange, out: string[] = [];
  for (let C = (c0 >> 4) - 1; C <= (c1 >> 4) + 1; C++) for (let R = (r0 >> 4) - 1; R <= (r1 >> 4) + 1; R++) out.push(`${s.domain} ${C} ${R}`);
  console.log(out.join('\n'));
} else { console.error('gazetteer | regions'); process.exit(2); }
