import { io } from './tk.mjs';
const doc = await io.read(process.argv[2]), R = doc.getRoot();
for (const n of R.listNodes()) if (n.getMesh()) { const m=n.getMesh(); console.log('node',n.getName(),'mesh',m.getName(),'skin',!!n.getSkin(), JSON.stringify(m.getExtras()).slice(0,120));
 for (const p of m.listPrimitives()) { const mt=p.getMaterial(); console.log('  prim mat',mt?.getName(),'verts',p.getAttribute('POSITION').getCount(),'tris',(p.getIndices()?.getCount()||0)/3,'targets',p.listTargets().length,'attrs',p.listSemantics().join(','),'alpha',mt?.getAlphaMode(),mt?.getAlphaCutoff(), JSON.stringify(mt?.getExtras()).slice(0,200)); } }
console.log('extensions', R.listExtensionsUsed().map(e=>e.extensionName).join(','));
const sk=R.listSkins()[0]; console.log('joints',sk.listJoints().length, sk.listJoints().findIndex(j=>j.getName()==='head'));
