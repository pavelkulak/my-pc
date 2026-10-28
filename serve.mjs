import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
const root=path.resolve('dist'),port=Number(process.env.PORT||4318);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary','.wasm':'application/wasm','.png':'image/png','.webp':'image/webp'};
http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');let requested;try{requested=decodeURIComponent(url.pathname);}catch{res.writeHead(400);res.end();return;}
 const file=path.resolve(root,'.'+(requested==='/'?'/index.html':requested));
 if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache'});if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);});
}).listen(port,'127.0.0.1',()=>console.log(`Local: http://localhost:${port}`));
