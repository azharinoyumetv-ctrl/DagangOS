import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../src/index.js';
import {dapurosCanonicalPath} from '../src/dapuros-public.js';

const env = {ASSETS:{async fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === '/dapuros/index.html') return new Response('<!doctype html><html><head></head><body><div id="root"></div></body></html>');
  try { return new Response(await readFile(new URL('../public'+path, import.meta.url))); }
  catch { return new Response('Missing',{status:404}); }
}}};
const get = path => worker.fetch(new Request('https://dagangos.com'+path), env, {});

test('main DagangOS product navigation opens the unified DapurOS page',async()=>{
  const source=await readFile(new URL('../public/portal.js',import.meta.url),'utf8');
  const target=source.match(/name: "DapurOS"[^\n]+?href: "([^"]+)"/)?.[1];
  assert.equal(target,'/dapuros');
  const response=await get(target);assert.equal(response.status,200);
  const body=await response.text();assert.match(body,/data-dapuros-public/);assert.match(body,/data-dapuros-hero/);
  assert.doesNotMatch(body,/<div id="root">/);
});

test('DapurOS public aliases redirect without altering app or payment routes',async()=>{
  for(const [oldPath,canonical] of [['/dapuros/','/dapuros'],['/dapuros/index.html','/dapuros'],['/dapuros/pricing/','/dapuros/pricing'],['/marketing/dapuros.html','/dapuros'],['/marketing/dapuros-pricing.html','/dapuros/pricing']]){
    for(const method of ['GET','HEAD']){
      const response=await worker.fetch(new Request('https://dagangos.com'+oldPath+'?ref=main',{method}),env,{});
      assert.equal(response.status,308);assert.equal(response.headers.get('Location'),'https://dagangos.com'+canonical+'?ref=main');
    }
  }
  for(const path of ['/dapuros/login','/dapuros/app/pos/','/dapuros/checkout','/dapuros/qr/table-1'])assert.equal(dapurosCanonicalPath(path),null);
});

test('DapurOS home and pricing share product-local navigation and contact',async()=>{
  let header;
  for(const path of ['/dapuros','/dapuros/pricing','/dapuros/android']){
    const body=await(await get(path)).text(),current=body.match(/<header class="dapuros-header">[\s\S]*?<\/header>/)?.[0];
    assert.ok(current);assert.match(current,/href="\/dapuros#kontak"/);
    assert.doesNotMatch(current,/href="\/"|sumber-daya|https:\/\/dagangos\.com/);
    assert.match(current,/aria-controls="dapuros-navigation"/);
    const normalized=current.replace(/ aria-current="page"/g,'');
    if(header)assert.equal(normalized,header);else header=normalized;
    assert.match(body,/<footer class="dapuros-footer">[\s\S]*?href="https:\/\/dagangos\.com\/"/);
    assert.doesNotMatch(body,/<!-- dapuros-header -->|<!-- dapuros-footer -->|geraina-public\.js/);
  }
});

test('DapurOS retains its six restaurant modules, workflow and original hero',async()=>{
  const body=await(await get('/dapuros')).text();
  for(const id of ['fitur','solusi','kontak'])assert.match(body,new RegExp('id="'+id+'"'));
  for(const title of ['POS Restoran','Kitchen Display System','QR Self Ordering','Manajemen Meja','Resep & Inventori Bahan','Laporan Operasional'])assert.ok(body.includes(title));
  assert.match(body,/data-dapuros-chat/);assert.match(body,/mailto:support@dagangos.com/);
  assert.match(body,/<img data-dapuros-hero src="\/dapuros\/assets\/scenes\/dapuros-kitchen\.png"/);
  assert.doesNotMatch(body,/<aside class="hero-card">/);
  assert.doesNotMatch(body,/data-hero-motion|Jeda animasi|Putar animasi/);
});

test('DapurOS login and app routes retain the React shell with the public navigation boundary',async()=>{
  for(const path of ['/dapuros/login','/dapuros/register','/dapuros/app/pos','/dapuros/app/kds']){
    const body=await(await get(path)).text();
    assert.match(body,/<div id="root">/);assert.match(body,/data-dapuros-web-app/);assert.match(body,/\/dapuros-public\.js/);
    assert.doesNotMatch(body,/data-dapuros-public|Dari pesanan meja sampai/);
  }
});

test('DapurOS pricing retains the three paid purchase forms and billing controls',async()=>{
  const body=await(await get('/dapuros/pricing')).text();
  assert.equal((body.match(/class="plan-purchase" method="post" action="\/dapuros\/checkout"/g)||[]).length,3);
  assert.match(body,/aria-label="Periode langganan"/);
  for(const tier of ['starter','pro','business'])assert.match(body,new RegExp('id="plan-'+tier+'"'));
  assert.match(body,/\/subscription-pricing\.js/);
});
