#!/usr/bin/env node
// Stand-in for M2's per-tile compiler command, for the subprocess adapter's tests:
//   node fake-compiler-cmd.mjs <version> <z>/<x>/<y> <west,south,east,north>  -> deterministic bytes on stdout
// Exit 3 when the tile's x is 13 (a scripted failure).
const [version, tile, bbox] = process.argv.slice(2);
const [, x] = tile.split('/');
if (x === '13') { process.stderr.write('scripted failure for x=13\n'); process.exit(3); }
process.stdout.write(JSON.stringify({ format: 'subprocess-tile', version, tile, bbox: bbox.split(',').map(Number) }));
