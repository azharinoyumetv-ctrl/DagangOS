// Local review only. Uses the actual portal routing and never proxies API calls.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {Readable} from 'node:stream';
import worker from '../src/index.js';
const root=resolve(import.meta.dirname,'../public');
const dapuros = process.argv.includes('--dapuros');
const port = dapuros ? 8795 : 8794;
const origin = `http://127.0.0.1:${port}`;
const appPublic = {
 geraina: resolve(import.meta.dirname, '../GerainaOS/frontend/public'),
 dapuros: resolve(import.meta.dirname, '../DapurOS/frontend/public'),
};
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.svg':'image/svg+xml','.txt':'text/plain','.mp4':'video/mp4','.vtt':'text/vtt; charset=utf-8'};
const env={ASSETS:{async fetch(request){
 const url=new URL(request.url),pathname=decodeURIComponent(url.pathname);
 const file=resolve(root,'.'+pathname);
 if(!file.startsWith(root+sep))return new Response('Not found',{status:404});
 let data;try{data=await readFile(file);}catch{
  const product=pathname.match(/^\/(geraina|dapuros)\/assets\//)?.[1];
  if(!product)return new Response('Not found',{status:404});
  const fallback=resolve(appPublic[product],'.'+pathname.slice(product.length+1));
  if(!fallback.startsWith(appPublic[product]+sep))return new Response('Not found',{status:404});
  try{data=await readFile(fallback);}catch{return new Response('Not found',{status:404});}
 }
 const headers={'Content-Type':types[extname(file)]||'application/octet-stream','Content-Length':String(data.length),'Cache-Control':'no-store'};
 if(extname(file)==='.mp4'){
  headers['Accept-Ranges']='bytes';
  const range=request.headers.get('Range');
  if(range && request.method==='GET'){
   const match=/^bytes=(\d*)-(\d*)$/.exec(range);
   const start=match?.[1]?Number(match[1]):match?.[2]?Math.max(0,data.length-Number(match[2])):NaN;
   const end=match?.[1]&&match?.[2]?Math.min(Number(match[2]),data.length-1):data.length-1;
   if(!Number.isSafeInteger(start)||start<0||start>=data.length||end<start)return new Response(null,{status:416,headers:{...headers,'Content-Length':'0','Content-Range':`bytes */${data.length}`}});
   headers['Content-Range']=`bytes ${start}-${end}/${data.length}`;headers['Content-Length']=String(end-start+1);
   return new Response(data.subarray(start,end+1),{status:206,headers});
  }
 }
 return new Response(request.method==='HEAD'?null:data,{headers});
}}};
const server=createServer(async(req,res)=>{
 try{
  if(req.url.startsWith('/api/')){res.writeHead(401,{'Content-Type':'application/json'});res.end('{"detail":"Local visual preview: account services disabled"}');return;}
  const result=await worker.fetch(new Request(origin+req.url,{method:req.method,headers:req.headers}),env,{});
  res.writeHead(result.status,Object.fromEntries(result.headers));
  if(result.body)Readable.fromWeb(result.body).pipe(res);else res.end();
 }catch(error){console.error(error.message);res.writeHead(500);res.end('Local preview failed');}
});
const page = dapuros ? '/dapuros#galeri-dapuros' : '/geraina#lihat-geraina';
server.listen(port,'127.0.0.1',()=>console.log(`Local showcase review: ${origin}${page}`));
