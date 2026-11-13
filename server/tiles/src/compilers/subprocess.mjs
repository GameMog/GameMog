import { spawn } from 'node:child_process';

// Runs an external compiler (M2's tools/hometown/ Python compiler) once per tile: argv with placeholders
// {version} {z} {x} {y} {west} {south} {east} {north}, no shell. The tile's bytes are read from stdout; exit 0 = done.
// A non-zero exit, a timeout or empty stdout is an error (nothing is cached; the next request retries).
//   createSubprocessCompiler({ version: '0.1.0', argv: ['python3', 'tools/hometown/compile.py', '--tile', '{z}/{x}/{y}',
//     '--bbox', '{west},{south},{east},{north}', '--out', '-'], contentType: 'application/octet-stream',
//     contentEncoding: 'gzip', cwd: repoRoot })
export function createSubprocessCompiler({ version, argv, cwd, env, contentType = 'application/octet-stream', contentEncoding = 'identity', timeoutMs = 120000, maxBytes = 64 * 1024 * 1024 }) {
  if (!version || !Array.isArray(argv) || !argv.length) throw new Error('subprocess compiler needs version and argv');
  return {
    version,
    compileTile(key) {
      const [west, south, east, north] = key.bbox;
      const vars = { version: key.version, z: key.z, x: key.x, y: key.y, west, south, east, north };
      const args = argv.map((a) => a.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)));
      return new Promise((resolve, reject) => {
        const child = spawn(args[0], args.slice(1), { cwd, env: env || process.env, stdio: ['ignore', 'pipe', 'pipe'] });
        const out = [];
        let size = 0, err = '';
        const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`compiler timed out after ${timeoutMs} ms`)); }, timeoutMs);
        child.stdout.on('data', (d) => { size += d.length; if (size > maxBytes) child.kill('SIGKILL'); else out.push(d); });
        child.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
        child.on('error', (e) => { clearTimeout(timer); reject(e); });
        child.on('close', (code) => {
          clearTimeout(timer);
          if (size > maxBytes) return reject(new Error(`compiler output over ${maxBytes} bytes`));
          if (code !== 0) return reject(new Error(`compiler exited ${code}: ${err.trim().slice(-500)}`));
          if (!size) return reject(new Error('compiler wrote no bytes'));
          resolve({ body: Buffer.concat(out), contentType, contentEncoding });
        });
      });
    },
  };
}
