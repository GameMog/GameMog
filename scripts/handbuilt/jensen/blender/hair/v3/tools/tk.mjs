import { createRequire } from 'node:module';
export const require = createRequire(process.env.FORGE_TOOLBOX_DIR.replace(/\/?$/, '/') + 'node_modules/');
export const { NodeIO, Document } = require('@gltf-transform/core');
export const { ALL_EXTENSIONS, EXTMeshoptCompression } = require('@gltf-transform/extensions');
const { MeshoptDecoder, MeshoptEncoder } = require('meshoptimizer'); await MeshoptDecoder.ready; await MeshoptEncoder.ready;
export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
export const sharp = require('sharp');
