// Read large static assets in retryable byte ranges instead of one fragile stream.
export async function downloadBinary(url,{fetchImpl=globalThis.fetch,onProgress=()=>{},chunkSize=256*1024,concurrency=3,retries=3,timeout=20000,retryDelay=250,maxBytes=32*1024*1024}={}){
 const target=String(url);
 let total=0,etag='',received=0,complete=false,stopped=false;
 const controllers=new Set();
 const progress=()=>onProgress({loaded:received,total});
 const error=(message,retryable=false)=>Object.assign(new Error(message),{retryable});
 async function request(start,end){
  for(let attempt=0;attempt<=retries;attempt++){
   const abort=new AbortController();controllers.add(abort);
   const timer=setTimeout(()=>abort.abort(),timeout);
   try{
    const headers={Range:`bytes=${start}-${end}`};if(etag&&!etag.startsWith('W/'))headers['If-Range']=etag;
    const response=await fetchImpl(target,{headers,signal:abort.signal,cache:'no-cache',credentials:'same-origin'});
    if(response.status!==200&&response.status!==206)throw error(`HTTP ${response.status}: ${new URL(target,globalThis.location?.href||'http://localhost').pathname}`,response.status===408||response.status===429||response.status>=500);
    const currentTag=response.headers.get('ETag')||'';
    if(etag&&currentTag&&etag!==currentTag)throw error('Файлы сайта обновились во время загрузки. Обнови страницу.');
    if(!etag)etag=currentTag;
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.byteLength>maxBytes)throw error('Файл модели превышает допустимый размер.');
    if(response.status===200){
     const encoding=response.headers.get('Content-Encoding');
     const expected=encoding&&encoding!=='identity'?0:Number(response.headers.get('Content-Length'));
     if(expected&&expected!==bytes.byteLength)throw error('Файл передан не полностью.',true);
     if(total&&bytes.byteLength!==total)throw error('Размер файла изменился во время загрузки.');
     return {bytes,full:true,size:bytes.byteLength};
    }
    const range=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range')||'');
    if(!range)throw error('Сервер не сообщил диапазон полученных байтов.');
    const first=Number(range[1]),last=Number(range[2]),size=Number(range[3]);
    if(!size||size>maxBytes||first!==start||last!==Math.min(end,size-1)||last<first)throw error('Сервер вернул неверный диапазон файла.');
    if(bytes.length!==last-first+1)throw error('Часть файла передана не полностью.',true);
    if(total&&size!==total)throw error('Размер файла изменился во время загрузки.');
    return {bytes,full:false,size};
   }catch(cause){
    if(stopped)throw cause;
    const retryable=cause.retryable??(cause instanceof TypeError||cause.name==='AbortError'||cause.name==='TimeoutError');
    if(attempt===retries||!retryable)throw new Error(`Не удалось загрузить ${new URL(target,globalThis.location?.href||'http://localhost').pathname}: ${cause.message}`,{cause});
   }finally{clearTimeout(timer);controllers.delete(abort);}
   await new Promise(resolve=>setTimeout(resolve,retryDelay*2**attempt));
  }
 }
 try{
  const first=await request(0,19);total=first.size;
  if(!total)throw error('Получен пустой файл.');
  const result=new Uint8Array(total);result.set(first.bytes);received=first.bytes.length;progress();
  if(first.full)return result.buffer;
  let next=received;
  async function worker(){
   while(next<total&&!complete){
    const start=next,end=Math.min(total-1,start+chunkSize-1);next=end+1;
    const part=await request(start,end);
    if(complete)return;
    if(part.full){result.set(part.bytes);received=total;complete=true;progress();return;}
    result.set(part.bytes,start);received+=part.bytes.length;progress();
   }
  }
  await Promise.all(Array.from({length:Math.max(1,Math.min(4,concurrency))},worker));
  if(received!==total)throw error('Модель получена не полностью. Попробуй загрузить её ещё раз.');
  return result.buffer;
 }finally{stopped=true;for(const abort of controllers)abort.abort();}
}

export function verifyGLB(data){
 if(!(data instanceof ArrayBuffer)||data.byteLength<20)throw new Error('Вместо модели получен пустой или неполный файл.');
 const header=new DataView(data);
 if(header.getUint32(0,true)!==0x46546c67||header.getUint32(4,true)!==2)throw new Error('По адресу модели вернулся другой файл.');
 if(header.getUint32(8,true)!==data.byteLength)throw new Error('Модель получена не полностью.');
 return data;
}
