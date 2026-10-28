import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createState,advancePower,lightLevel,hexColor} from './dist/state.js';
const root=path.resolve('dist');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const code=fs.readFileSync(path.join(root,'app.js'),'utf8');
const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
for(const match of code.matchAll(/\$\('([^']+)'\)/g))assert(ids.has(match[1]),'Missing UI element '+match[1]);
for(const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g))assert(fs.existsSync(path.resolve(root,match[1])),'Missing page asset '+match[1]);
for(const p of ['side','front','top'])assert(html.includes(`data-panel="${p}"`));
const file=fs.readFileSync(path.join(root,'assets/pc-assembly.glb'));
assert.equal(file.readUInt32LE(0),0x46546c67);assert.equal(file.readUInt32LE(4),2);assert.equal(file.readUInt32LE(8),file.length);
const gltf=JSON.parse(file.subarray(20,20+file.readUInt32LE(12)).toString('utf8'));
assert.equal(gltf.scenes.length,1,'Only the exported assembly should be included');
const rotors=gltf.nodes.filter(n=>n.extras?.kind==='rotor');assert.equal(rotors.length,11);assert.equal(rotors.filter(n=>n.extras.rgb).length,6);
for(const name of ['glass_side','glass_front','cover_top','power_button','static_10','static_20','static_30','static_40','static_50','static_case'])assert(gltf.nodes.some(n=>n.name===name),'Missing model group '+name);
assert(!gltf.nodes.some(n=>n.name==='Cube'),'No unrelated default cube');
assert(gltf.materials.some(m=>m.name.includes('WEB_RGB_ROTOR')));assert(gltf.materials.some(m=>m.name.includes('WEB_RGB_DIFFUSER')));
assert(gltf.materials.some(m=>m.name.includes('exact GEN5 product-photo')),'Motherboard photograph preserved');
assert(gltf.materials.some(m=>m.name.includes('PowerColor fan label')),'GPU hub decals preserved');
assert(gltf.images?.length>=3,'Packed reference textures');
for(const view of gltf.bufferViews)assert(view.byteOffset+view.byteLength<=gltf.buffers[view.buffer].byteLength,'Buffer view bounds');
assert(gltf.extensionsRequired.includes('KHR_draco_mesh_compression'));
for(const name of ['draco_wasm_wrapper.js','draco_decoder.wasm'])assert(fs.existsSync(path.join(root,'vendor/examples/jsm/libs/draco/gltf',name)));
// Verify all local ESM dependencies, including the browser decoder entrypoint.
const seen=new Set();
function visit(file){
 file=path.resolve(file);if(seen.has(file))return;seen.add(file);assert(fs.existsSync(file),'Missing module '+file);
 const contents=fs.readFileSync(file,'utf8');
 for(const match of contents.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){
  let spec=match[1],target;
  if(spec==='three')target=path.join(root,'vendor/build/three.module.js');
  else if(spec.startsWith('three/addons/'))target=path.join(root,'vendor/examples/jsm',spec.slice(13));
  else if(spec.startsWith('.'))target=path.resolve(path.dirname(file),spec);
  else continue;
  visit(target);
 }
}
visit(path.join(root,'app.js'));
const s=createState();assert.equal(lightLevel(s,0),0);assert.equal(s.speed,0);assert.equal(hexColor('bad'),'#ff9d50');
s.powered=true;for(let i=0;i<400;i++)advancePower(s,1/60);assert(s.speed>.99);assert(lightLevel(s,0)>.74);
s.effect='breathe';for(let t=0;t<20;t+=.1)assert(lightLevel(s,t)>=0&&lightLevel(s,t)<=.75);
s.brightness=0;assert.equal(lightLevel(s,5),0);s.brightness=.75;s.powered=false;
for(let i=0;i<600;i++)advancePower(s,1/60);assert.equal(s.speed,0);assert.equal(s.powerAmount,0);assert.equal(lightLevel(s,10),0);
console.log(JSON.stringify({ok:true,modelMB:Number((file.length/1048576).toFixed(2)),rotors:rotors.length,argbRotors:6,panels:3,textures:gltf.images.length,materials:gltf.materials.length,modules:seen.size,browserTested:false},null,2));
