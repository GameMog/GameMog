import { spawn } from 'node:child_process';

// Runs the external compiler (tools/hometown/compile.py) with argv templates, no shell. Placeholders: {buildId}
// {grid} {domain} {L} {c} {r} {id} (the hg1 id 'hg1-conus/0/5806/8582'), {placeId} {stage}.
//   argv          one tile: HTL1 bytes on stdout          ['python3', 'tools/hometown/compile.py', '--tile', '{id}', '--out', '-']
//   blockArgv     an L2 block: an HTB1 stream on stdout   [..., '--block', '{id}', '--out', '-']
//                 ('HTB1', then per child: u32 id length, id, u32 body length (0xffffffff: refused, then u32 reason
//                 length, reason), body)
//   ctxArgv       a context block                        [..., '--ctx', '{id}', '--out', '-']
//   describeArgv  the session descriptor (JSON)          [..., '--descriptor', '{placeId}', '--stage', '{stage}']
// Exit 0 = done; exit 3 = refused (stderr JSON {refused}); anything else, a timeout or empty stdout is an error
// (nothing is cached; the next request retries). The child gets an allow-listed environment, never this process's
// (the storage secrets TILES_S3_* stay here). Every argv's output is the compiler's: it must equal the build's id
// (buildId) it was registered under.
export const ENV_ALLOW = ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'SYSTEMROOT', 'SystemRoot'];

export function childEnv({ env, envAllow = [] } = {}, from = process.env) {
  const out = {};
  for (const k of [...ENV_ALLOW, ...envAllow]) if (from[k] !== undefined) out[k] = from[k];
  return { ...out, ...env };
}

function runChild(argv, vars, { cwd, env, timeoutMs, maxBytes }) {
  const args = argv.map((a) => a.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)));
  return new Promise((resolve, reject) => {
    const child = spawn(args[0], args.slice(1), { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    let size = 0, err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`compiler timed out after ${timeoutMs} ms`)); }, timeoutMs);
    child.stdout.on('data', (d) => { size += d.length; if (size > maxBytes) { child.kill('SIGKILL'); reject(new Error('compiler output too large')); } else out.push(d); });
    child.stderr.on('data', (d) => { err += d; if (err.length > 64e3) err = err.slice(-32e3); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 3) {
        let why = err.trim().slice(-500);
        try { why = JSON.parse(err.trim().split('\n').pop()).refused || why; } catch { /* plain text */ }
        return reject(Object.assign(new Error('refused: ' + why), { refused: why }));
      }
      if (code !== 0) return reject(new Error(`compiler exited ${code}: ${err.trim().slice(-500)}`));
      if (!size) return reject(new Error('compiler wrote no bytes'));
      resolve(Buffer.concat(out));
    });
  });
}

export function parseHTB1(buf) {
  if (buf.subarray(0, 4).toString('latin1') !== 'HTB1') throw new Error('not an HTB1 block stream');
  const children = [];
  let o = 4;
  while (o < buf.length) {
    const n = buf.readUInt32LE(o); o += 4;
    const id = buf.subarray(o, o + n).toString('utf8'); o += n;
    const m = buf.readUInt32LE(o); o += 4;
    if (m === 0xffffffff) { const k = buf.readUInt32LE(o); o += 4; children.push({ id, refused: buf.subarray(o, o + k).toString('utf8') }); o += k; continue; }
    children.push({ id, body: buf.subarray(o, o + m) }); o += m;
  }
  return children;
}

export function createSubprocessCompiler({ version, argv, blockArgv, ctxArgv, describeArgv, cwd, env, envAllow, contentType = 'application/octet-stream', contentEncoding = 'identity', timeoutMs = 600000, maxBytes = 256 * 1024 * 1024 }) {
  if (!version || !Array.isArray(argv) || !argv.length) throw new Error('subprocess compiler needs version and argv');
  const o = { cwd, env: childEnv({ env, envAllow }), timeoutMs, maxBytes };
  const vars = (k) => ({ buildId: k.buildId ?? version, version: k.buildId ?? version, grid: k.grid ?? 'hg1', domain: k.domain, L: k.L ?? 0, c: k.c, r: k.r, id: `hg1-${k.domain}/${k.L ?? 0}/${k.c}/${k.r}` });
  const C = {
    version,
    async compileTile(key) { return { body: await runChild(argv, vars(key), o), contentType, contentEncoding }; },
  };
  if (blockArgv) C.compileBlock = async (b) => ({ children: parseHTB1(await runChild(blockArgv, vars(b), o)).map((ch) => (ch.refused ? ch : { ...ch, contentType, contentEncoding })) });
  if (ctxArgv) C.compileCtx = async (k) => ({ body: await runChild(ctxArgv, vars(k), o), contentType, contentEncoding });
  if (describeArgv) C.describePlace = async (place, stage = 1) => JSON.parse((await runChild(describeArgv, { placeId: place.placeId, stage }, o)).toString('utf8'));
  return C;
}
