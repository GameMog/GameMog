import { io, sharp } from './tk.mjs'; import fs from 'node:fs';
const doc = await io.read(process.argv[2]); const m = doc.getRoot().listMaterials().find((x) => x.getName() === 'skin');
const t = m.getBaseColorTexture(); console.log(t.getMimeType(), t.getSize());
await sharp(Buffer.from(t.getImage())).png().toFile(process.argv[3]);
