#!/usr/bin/env node
// Stand-in for tools/hometown/compile.py for the subprocess adapter's tests:
//   node fake-compiler-cmd.mjs tile <buildId> <id>             -> deterministic bytes on stdout (exit 3 = refused when c is 13)
//   node fake-compiler-cmd.mjs block <buildId> <L2 id>         -> an HTB1 stream of its 16 children (c 13 refused)
//   node fake-compiler-cmd.mjs describe <placeId> <stage>      -> a stage-1 descriptor
const [mode, a, b] = process.argv.slice(2);
const body = (bid, id) => Buffer.from(JSON.stringify({ format: 'subprocess-tile', buildId: bid, id }));
if (mode === 'tile') {
  const c = a && b.split('/')[2];
  if (c === '13') { process.stderr.write(JSON.stringify({ refused: 'scripted refusal for c=13' }) + '\n'); process.exit(3); }
  if (c === '14') { process.stderr.write('scripted failure for c=14\n'); process.exit(1); }
  process.stdout.write(body(a, b));
} else if (mode === 'block') {
  const [gd, L, C, R] = b.split('/'), n = 2 ** Number(L), parts = [Buffer.from('HTB1')];
  const u32 = (v) => { const x = Buffer.alloc(4); x.writeUInt32LE(v); return x; };
  for (let r = R * n; r < R * n + n; r++) for (let c = C * n; c < C * n + n; c++) {
    const id = Buffer.from(`${gd}/0/${c}/${r}`);
    parts.push(u32(id.length), id);
    if (c === 13) { const why = Buffer.from('scripted refusal'); parts.push(u32(0xffffffff), u32(why.length), why); continue; }
    const t = body(a, id.toString()); parts.push(u32(t.length), t);
  }
  process.stdout.write(Buffer.concat(parts));
} else if (mode === 'describe') {
  process.stdout.write(JSON.stringify(b === '2' ? { yOffset: 7, waterLevel: -10 } : { domain: 'conus', origin: { c0: 12, r0: 7 }, k0: 1, gamma0: 0, tiles: ['hg1-conus/0/12/7', 'hg1-conus/0/12/6'] }));
}
