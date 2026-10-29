import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {Readable} from 'node:stream';
import worker from '../src/index.js';
const root=resolve(import.meta.dirname,'../dist');
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.ico':'image/x-icon','.svg':'image/svg+xml','.apk':'application/vnd.android.package-archive','.txt':'text/plain'};
const env={ASSETS:{async fetch(request){
  const url=new URL(request.url),file=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+sep))return new Response('Not found',{status:404});
  try{const data=await readFile(file);return new Response(request.method==='HEAD'?null:data,{headers:{'Content-Type':types[extname(file)]||'application/octet-stream','Content-Length':String(data.length)}});}catch{return new Response('Not found',{status:404});}
}}};
const server=createServer(async(req,res)=>{
  try{
    if(req.url==='/__local_test_shutdown'){res.end('Stopped local release fixture');server.close();return;}
    const result=await worker.fetch(new Request('http://127.0.0.1:8799'+req.url,{method:req.method,headers:req.headers}),env,{});
    res.writeHead(result.status,Object.fromEntries(result.headers));
    if(result.body)Readable.fromWeb(result.body).pipe(res);else res.end();
  }catch{res.writeHead(500);res.end('Local release fixture failed');}
});
server.listen(8799,'127.0.0.1',()=>console.log('DapurOS local release fixture ready at http://127.0.0.1:8799'));
