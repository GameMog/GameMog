#!/usr/bin/env node
// node server/tiles/bin/serve.mjs [--port 4694] [--host 127.0.0.1] [config options: src/config.mjs]
import { parse, serviceFrom } from '../src/config.mjs';
import { createServer } from '../src/http.mjs';

const o = parse(process.argv.slice(2), { port: { type: 'string', default: '4694' }, host: { type: 'string', default: '127.0.0.1' }, quiet: { type: 'boolean', default: false } });
const service = await serviceFrom(o, { log: (e) => { if (!o.quiet || e.event !== 'request') process.stderr.write(`${JSON.stringify(e)}\n`); } });
const server = createServer(service, { log: (e) => { if (!o.quiet || e.event !== 'request') process.stderr.write(`${JSON.stringify(e)}\n`); } });
server.listen(Number(o.port), o.host, () => {
  process.stderr.write(`tiles: http://${o.host}:${o.port} store=${service.store.describe()} versions=${[...service.compilers.keys()].join(',')} current=${service.currentVersion}\n`);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
