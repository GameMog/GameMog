// copy a GLB without EXT_meshopt_compression (so numpy can read and patch its buffers)
import { createRequire } from 'node:module';
const require = createRequire(process.env.FORGE_TOOLBOX_DIR.replace(/\/?$/, '/') + 'node_modules/');
const { NodeIO } = require('@gltf-transform/core'); const { ALL_EXTENSIONS } = require('@gltf-transform/extensions'); const { MeshoptDecoder, MeshoptEncoder } = require('meshoptimizer');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(process.argv[2]);
for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName === 'EXT_meshopt_compression') e.dispose();
await io.write(process.argv[3], doc); console.log('plain written');
