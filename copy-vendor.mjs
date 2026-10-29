import fs from 'node:fs';
import path from 'node:path';
const source=path.resolve(process.argv[2]||'node_modules/three');
if(!fs.existsSync(path.join(source,'package.json')))throw new Error('Three.js source not found. Pass its package directory as the first argument. The ready-to-run site already includes dist/vendor.');
const dest=path.resolve('dist/vendor');
const seen=new Set();
function copy(relative){
 relative=path.normalize(relative);if(seen.has(relative))return;seen.add(relative);
 const input=path.join(source,relative),output=path.join(dest,relative);
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.copyFileSync(input,output);
 if(relative.endsWith('.js')){
  const code=fs.readFileSync(input,'utf8');
  for(const m of code.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))copy(path.join(path.dirname(relative),m[1]));
 }
}
copy('build/three.module.js');
for(const entry of ['loaders/GLTFLoader.js','loaders/DRACOLoader.js','controls/OrbitControls.js','environments/RoomEnvironment.js','postprocessing/EffectComposer.js','postprocessing/RenderPass.js','postprocessing/UnrealBloomPass.js','postprocessing/OutputPass.js'])copy('examples/jsm/'+entry);
for(const name of ['draco_wasm_wrapper.js','draco_decoder.wasm'])copy('examples/jsm/libs/draco/gltf/'+name);
copy('LICENSE');
console.log('Vendored Three.js 0.185.1:',seen.size,'files');
