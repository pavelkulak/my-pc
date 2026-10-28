import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {createState,advancePower,lightLevel,hexColor,clamp} from './state.js';

const $=id=>document.getElementById(id);
const state=createState();
const host=$('canvas-host'),viewer=document.querySelector('.viewer');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const panels={},rotors=[],rgbMaterials=new Set(),neutral=new THREE.Color('#d5d9dc');
const color=new THREE.Color(state.color),q=new THREE.Quaternion();
let model,ready=false,lastTime=0,elapsed=0,cameraMove=null,powerMesh;
let renderer,scene,camera,controls,composer,bloom;
const announce=message=>{$('announcement').textContent=message;};
const offsets={side:new THREE.Vector3(-.14,0,0),front:new THREE.Vector3(0,0,.15),top:new THREE.Vector3(0,.12,0)};
const views={hero:[-.79,.57,.95],side:[-1.05,.32,.02],rear:[-.23,.37,-1.08],top:[-.3,1.25,.35]};
const cameraTarget=new THREE.Vector3(0,.247,0);

function fail(error){
 console.error('PC Studio:',error);
 $('loading').classList.remove('done');$('loading-label').textContent='Не удалось открыть 3D-модель';
 $('loading-size').textContent='Проверь WebGL и обнови страницу. Нужен современный браузер с аппаратным ускорением.';
 document.querySelector('.loader-ring').style.display='none';
}
function setPower(){
 if(!ready)return;
 state.powered=!state.powered;document.body.classList.toggle('is-on',state.powered);
 $('power').setAttribute('aria-pressed',String(state.powered));
 $('power-label').textContent=state.powered?'ON':'OFF';
 $('power-action').textContent=state.powered?'Выключить компьютер':'Включить компьютер';
 $('power-description').textContent=state.powered?'Остановить вентиляторы и погасить свет':'Запусти вентиляторы и подсветку';
 $('status-text').textContent=state.powered?'КОМПЬЮТЕР ВКЛЮЧЁН':'ПИТАНИЕ ВЫКЛЮЧЕНО';
 $('lighting-note').textContent=state.powered?'COUGAR + Aurora + T-Force · подсветка синхронизирована.':'Цвет загорится при включении компьютера.';
 announce(state.powered?'Компьютер включён. Вентиляторы и общая подсветка запущены.':'Компьютер выключен. Подсветка гаснет, вентиляторы останавливаются.');
}
function setColor(value){
 state.color=hexColor(value);$('color-picker').value=state.color;$('hex-value').textContent=state.color.toUpperCase();
 document.documentElement.style.setProperty('--rgb',state.color);
 for(const b of document.querySelectorAll('[data-color]')){const selected=b.dataset.color===state.color;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));}
}
function togglePanel(name){
 if(!ready||!panels[name])return;
 state.panels[name]=!state.panels[name];panels[name].object.visible=true;
 const button=document.querySelector(`[data-panel="${name}"]`);
 button.setAttribute('aria-pressed',String(state.panels[name]));
 button.innerHTML=(state.panels[name]?'Вернуть':'Снять')+'<svg aria-hidden="true"><use href="#i-arrow"/></svg>';
 announce(`${name==='side'?'Боковое стекло':name==='front'?'Переднее стекло':'Верхняя крышка'} ${state.panels[name]?'снято':'установлено'}.`);
 $('hit-hint').hidden=true;
}
function setView(name){
 const end=new THREE.Vector3(...views[name]);
 cameraMove={from:camera.position.clone(),to:end,start:performance.now(),duration:reducedMotion?1:750};
 controls.target.copy(cameraTarget);
 for(const b of document.querySelectorAll('[data-view]')){const selected=b.dataset.view===name;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));}
}
function wireUI(){
 $('power').addEventListener('click',setPower);
 for(const b of document.querySelectorAll('[data-color]'))b.addEventListener('click',()=>setColor(b.dataset.color));
 $('color-picker').addEventListener('input',e=>setColor(e.target.value));
 $('brightness').addEventListener('input',e=>{const v=Number(e.target.value);state.brightness=clamp(v/100);$('brightness-value').value=v+'%';e.target.style.background=`linear-gradient(to right,#a9c88e ${v}%,#363d30 ${v}%)`;});
 for(const b of document.querySelectorAll('[data-effect]'))b.addEventListener('click',()=>{
  state.effect=b.dataset.effect;
  for(const other of document.querySelectorAll('[data-effect]')){const active=other===b;other.classList.toggle('selected',active);other.setAttribute('aria-pressed',String(active));}
 });
 for(const b of document.querySelectorAll('[data-panel]'))b.addEventListener('click',()=>togglePanel(b.dataset.panel));
 for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>setView(b.dataset.view));
 $('reset-view').addEventListener('click',()=>setView('hero'));
 $('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await viewer.requestFullscreen();}catch{announce('Полноэкранный режим недоступен в этом окне.');}});
}

function init(){
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<650?1.25:1.6));
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.93;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.setClearColor(0x171c14,0);host.appendChild(renderer.domElement);
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();fail(new Error('WebGL context lost'));});
 scene=new THREE.Scene();
 camera=new THREE.PerspectiveCamera(37,1,.015,8);camera.position.set(...views.hero);
 controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(cameraTarget);controls.enableDamping=true;controls.dampingFactor=.07;controls.minDistance=.58;controls.maxDistance=1.8;controls.maxPolarAngle=Math.PI*.85;controls.enablePan=false;controls.update();
 controls.addEventListener('start',()=>{cameraMove=null;$('hit-hint').hidden=true;});
 const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
 const env=pmrem.fromScene(room,.03);scene.environment=env.texture;scene.environmentIntensity=.85;room.dispose();pmrem.dispose();
 scene.add(new THREE.HemisphereLight(0xdbe4ef,0x32392d,1.1));
 const key=new THREE.DirectionalLight(0xfff4e7,3.3);key.position.set(-.6,1.0,.8);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.near=.05;key.shadow.camera.far=3;key.shadow.camera.left=-.7;key.shadow.camera.right=.7;key.shadow.camera.top=.8;key.shadow.camera.bottom=-.8;key.shadow.bias=-.00015;key.shadow.normalBias=.001;scene.add(key);
 const fill=new THREE.DirectionalLight(0xc4d9ef,1.5);fill.position.set(.7,.55,.3);scene.add(fill);
 const rim=new THREE.DirectionalLight(0xecf6e0,2);rim.position.set(.1,.8,-.7);scene.add(rim);
 const floor=new THREE.Mesh(new THREE.CircleGeometry(.85,96),new THREE.ShadowMaterial({opacity:.22}));floor.rotation.x=-Math.PI/2;floor.position.y=-.001;floor.receiveShadow=true;scene.add(floor);
 composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
 bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.18,.28,1.25);composer.addPass(bloom);composer.addPass(new OutputPass());
 const resize=()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h);composer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};
 new ResizeObserver(resize).observe(host);resize();wireUI();setupPicking();
 const draco=new DRACOLoader();draco.setDecoderPath('./vendor/examples/jsm/libs/draco/gltf/');draco.setDecoderConfig({type:'wasm'});
 const loader=new GLTFLoader();loader.setDRACOLoader(draco);
 loader.load('./assets/pc-assembly.glb',async gltf=>{
  try{
   model=gltf.scene;scene.add(model);
   model.traverse(o=>{
    if(o.userData.kind==='rotor')rotors.push({object:o,axis:new THREE.Vector3(...o.userData.axis).normalize(),base:o.quaternion.clone(),angle:0,direction:o.userData.direction||1});
    if(o.userData.kind==='glass'||o.userData.kind==='cover'){
     const name=o.userData.panel;panels[name]={object:o,base:o.position.clone(),progress:0};
     if(o.userData.kind==='glass')o.traverse(mesh=>{
      if(!mesh.isMesh)return;
      mesh.material=new THREE.MeshPhysicalMaterial({color:0xf2f5f7,metalness:0,roughness:.035,transmission:.98,thickness:.004,ior:1.47,attenuationColor:new THREE.Color('#d9e0e2'),attenuationDistance:.9,envMapIntensity:.6,clearcoat:.25,clearcoatRoughness:.045,side:THREE.DoubleSide,depthWrite:false});
      mesh.castShadow=false;mesh.receiveShadow=false;mesh.userData.glass=true;
     });
    }
    if(o.userData.kind==='power')powerMesh=o;
    if(!o.isMesh)return;
    o.frustumCulled=true;
    if(!o.userData.glass){o.castShadow=true;o.receiveShadow=true;}
    const mats=Array.isArray(o.material)?o.material:[o.material];
    for(const m of mats){
     if(m.name.includes('WEB_RGB')){rgbMaterials.add(m);m.color.copy(neutral);m.emissive.set(0);m.emissiveIntensity=0;m.metalness=0;m.roughness=.4;}
     m.side=THREE.DoubleSide;
     if(m.map)m.map.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    }
   });
   if(rotors.length!==11||!panels.side||!panels.front||!panels.top||rgbMaterials.size<2)throw new Error('Incomplete model interaction metadata');
   $('loading-label').textContent='Настраиваем свет и стекло…';
   await renderer.compileAsync(scene,camera);
   ready=true;$('power').disabled=false;for(const b of document.querySelectorAll('[data-panel]'))b.disabled=false;
   $('loading').classList.add('done');setTimeout(()=>{$('loading').hidden=true;},500);draco.dispose();
   announce('Модель готова. Нажмите кнопку питания или выберите панель корпуса.');
  }catch(e){fail(e);}
 },event=>{if(event.lengthComputable)$('loading-size').textContent=`${Math.round(event.loaded/event.total*100)}% · ${(event.total/1048576).toFixed(1)} МБ`;},fail);
 renderer.setAnimationLoop(animate);
}

function setupPicking(){
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let start=null;
 function pick(event,occlusion=false){
  if(!ready)return null;
  const box=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1);ray.setFromCamera(pointer,camera);
  const hits=[];
  for(const [name,p] of Object.entries(panels)){
   if(!p.object.visible||p.progress>.15)continue;
   if(name==='side'&&camera.position.x>-.11)continue;
   if(name==='front'&&camera.position.z<.225)continue;
   if(name==='top'&&camera.position.y<.48)continue;
   const point=ray.ray.intersectBox(new THREE.Box3().setFromObject(p.object),new THREE.Vector3());
   if(point)hits.push({object:p.object,distance:point.distanceTo(camera.position)});
  }
  if(powerMesh)hits.push(...ray.intersectObject(powerMesh,true));
  hits.sort((a,b)=>a.distance-b.distance);
  // Occlusion check against the complete model prevents clicking glass through steel panels.
  const closest=occlusion?ray.intersectObject(model,true).find(hit=>{
   for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;
   return true;
  }):null;
  for(const hit of hits){
   let o=hit.object;while(o&&!o.userData.kind)o=o.parent;
   if(o&&(!closest||hit.distance<=closest.distance+.005))return {object:o,hit};
  }
  return null;
 }
 renderer.domElement.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};});
 renderer.domElement.addEventListener('pointerup',e=>{
  if(!start)return;const distance=Math.hypot(e.clientX-start.x,e.clientY-start.y);start=null;if(distance>6)return;
  const target=pick(e,true);if(!target)return;
  if(target.object.userData.kind==='power')setPower();else togglePanel(target.object.userData.panel);
 });
 renderer.domElement.addEventListener('pointermove',e=>{
  if(e.pointerType==='touch'||start)return;
  const target=pick(e),hint=$('hit-hint');renderer.domElement.style.cursor=target?'pointer':'grab';
  if(!target){hint.hidden=true;return;}
  const label=target.object.userData.kind==='power'?(state.powered?'Выключить':'Включить'):target.object.userData.panel==='top'?'Снять крышку':'Снять стекло';
  hint.innerHTML=label+'<svg aria-hidden="true"><use href="#i-arrow"/></svg>';
  const box=viewer.getBoundingClientRect();hint.style.left=Math.min(e.clientX-box.left,box.width-140)+'px';hint.style.top=Math.min(e.clientY-box.top,box.height-65)+'px';hint.hidden=false;
 });
 renderer.domElement.addEventListener('pointerleave',()=>{start=null;$('hit-hint').hidden=true;});
 renderer.domElement.addEventListener('pointercancel',()=>{start=null;});
}

function animate(time){
 const dt=Math.min((time-lastTime)/1000||0,.05);lastTime=time;elapsed+=dt;advancePower(state,dt);
 if(cameraMove){const t=clamp((performance.now()-cameraMove.start)/cameraMove.duration),e=t*t*(3-2*t);camera.position.lerpVectors(cameraMove.from,cameraMove.to,e);if(t>=1)cameraMove=null;}
 controls.update();
 for(const rotor of rotors){
  if(!reducedMotion)rotor.angle=(rotor.angle+dt*state.speed*24*rotor.direction)%(Math.PI*2);
  q.setFromAxisAngle(rotor.axis,rotor.angle);rotor.object.quaternion.copy(rotor.base).multiply(q);
 }
 for(const [name,p] of Object.entries(panels)){
  const target=Number(state.panels[name]);p.progress+=(target-p.progress)*(reducedMotion?1:1-Math.exp(-dt*8));
  if(Math.abs(target-p.progress)<.001)p.progress=target;
  p.object.visible=p.progress<.998;
  p.object.position.copy(p.base).addScaledVector(offsets[name],p.progress);
 }
 const level=lightLevel(state,reducedMotion?0:elapsed);
 if(state.effect==='spectrum'&&!reducedMotion)color.setHSL((elapsed*.035)%1,.85,.6);else color.set(state.color);
 for(const m of rgbMaterials){m.color.copy(neutral).lerp(color,Math.min(1,level*.78));m.emissive.copy(color);m.emissiveIntensity=level*(m.name.includes('ROTOR')?.85:2.8);}
 bloom.strength=.19*state.powerAmount;
 composer.render();
}
try{init();}catch(e){fail(e);}
