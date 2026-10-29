import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
const root=path.resolve('dist');const modules=new Map();
function get(file){
 file=path.resolve(file);if(modules.has(file))return modules.get(file);
 const module=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{identifier:file});modules.set(file,module);return module;
}
const app=get(path.join(root,'app.js'));
await app.link((name,parent)=>{
 if(name==='three')return get(path.join(root,'vendor/build/three.module.js'));
 if(name.startsWith('three/addons/'))return get(path.join(root,'vendor/examples/jsm',name.slice(13)));
 if(name.startsWith('.'))return get(path.resolve(path.dirname(parent.identifier),name));
 throw new Error('Unknown module '+name);
});
console.log('Linked all named imports:',modules.size,'modules');
