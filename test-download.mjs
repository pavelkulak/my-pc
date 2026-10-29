import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {downloadBinary,verifyGLB} from './dist/download.js';
const bytes=Uint8Array.from({length:8192},(_,i)=>i%251),calls=new Map();let active=0,maxActive=0;
const progress=[];
function partial(start,end,body=bytes.slice(start,end+1),tag='"v1"'){
 return new Response(body,{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'ETag':tag}});
}
const fetchImpl=async(url,{headers})=>{
 const [start,end]=headers.Range.slice(6).split('-').map(Number);const last=Math.min(end,bytes.length-1);
 const count=(calls.get(start)||0)+1;calls.set(start,count);active++;maxActive=Math.max(active,maxActive);
 await new Promise(resolve=>setTimeout(resolve,1));active--;
 if(start===20&&count===1)return new Response(new ReadableStream({start(c){c.error(new TypeError('Failed to fetch'));}}),{status:206,headers:{'Content-Range':`bytes ${start}-${last}/${bytes.length}`,'ETag':'"v1"'}});
 if(start===1044&&count===1)return partial(start,last,bytes.slice(start,last));
 return partial(start,last);
};
const result=await downloadBinary('https://example.test/model.glb',{fetchImpl,chunkSize:1024,concurrency:3,retryDelay:0,onProgress:p=>progress.push(p.loaded)});
assert.deepEqual(new Uint8Array(result),bytes);assert.equal(calls.get(20),2);assert.equal(calls.get(1044),2);assert(maxActive<=3);
assert.equal(progress.at(-1),bytes.length);for(let i=1;i<progress.length;i++)assert(progress[i]>=progress[i-1]);
let fullCalls=0;
assert.deepEqual(new Uint8Array(await downloadBinary('https://example.test/no-range',{fetchImpl:async()=>{fullCalls++;return new Response(bytes,{headers:{'Content-Length':String(bytes.length)}});}})),bytes);assert.equal(fullCalls,1);
await assert.rejects(downloadBinary('https://example.test/changed',{fetchImpl:async(url,{headers})=>{const [a,b]=headers.Range.slice(6).split('-').map(Number);return partial(a,Math.min(b,bytes.length-1),bytes.slice(a,Math.min(b+1,bytes.length)),a?'"v2"':'"v1"');},retryDelay:0}),/обновились/);
await assert.rejects(downloadBinary('https://example.test/missing',{fetchImpl:async()=>new Response('missing',{status:404}),retryDelay:0}),/HTTP 404/);
await assert.rejects(downloadBinary('https://example.test/timeout',{fetchImpl:(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))),timeout:1,retries:0}),/Aborted/);
const original=fs.readFileSync('dist/assets/pc-assembly.glb');verifyGLB(original.buffer.slice(original.byteOffset,original.byteOffset+original.byteLength));
assert.throws(()=>verifyGLB(original.buffer.slice(original.byteOffset,original.byteOffset+100)),/не полностью/);
console.log('Download regression checks passed: interrupted stream, short range, concurrency, progress, non-range server, changed file, 404, timeout and GLB integrity.');
if(process.argv.includes('--remote')){
 const start=Date.now();let last=-1;
 const data=await downloadBinary('https://my-pc-sage.vercel.app/assets/pc-assembly.glb',{onProgress:({loaded,total})=>{const step=Math.floor(loaded/total*4);if(step!==last){last=step;console.log(`Remote transfer: ${Math.round(loaded/total*100)}%`);}}});
 verifyGLB(data);const hash=b=>crypto.createHash('sha256').update(new Uint8Array(b)).digest('hex');assert.equal(hash(data),hash(original));
 console.log('Vercel model downloaded and SHA256 verified:',data.byteLength,'bytes in',((Date.now()-start)/1000).toFixed(1),'s. No browser used.');
}
