import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../src/index.js';
import {gerainaCanonicalPath} from '../src/geraina-public.js';

const env = {ASSETS:{async fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === '/geraina/index.html') return new Response('<!doctype html><html><head></head><body><div id="root"></div></body></html>');
  try { return new Response(await readFile(new URL('../public'+path, import.meta.url))); }
  catch { return new Response('Missing',{status:404}); }
}}};
const get = path => worker.fetch(new Request('https://dagangos.com'+path), env, {});

test('the existing main DagangOS product link reaches the unified Geraina page',async()=>{
  const source=await readFile(new URL('../public/portal.js',import.meta.url),'utf8');
  const target=source.match(/name: "Geraina POS"[^\n]+?href: "([^"]+)"/)?.[1];
  assert.equal(target,'/geraina');
  const response=await get(target);assert.equal(response.status,200);
  const body=await response.text();assert.match(body,/data-geraina-public/);assert.match(body,/data-geraina-hero/);
  assert.doesNotMatch(body,/<div id="root">/);
});

test('Geraina public URL variants redirect to the canonical page and retain the query', async()=>{
  for (const [oldPath, canonical] of [['/geraina/','/geraina'],['/geraina/index.html','/geraina'],['/geraina/pricing/','/geraina/pricing'],['/geraina/android/','/geraina/android'],['/marketing/geraina.html','/geraina']]) {
    for (const method of ['GET','HEAD']) {
      const response=await worker.fetch(new Request('https://dagangos.com'+oldPath+'?ref=android',{method}),env,{});
      assert.equal(response.status,308);assert.equal(response.headers.get('Location'),'https://dagangos.com'+canonical+'?ref=android');
    }
  }
  assert.equal(gerainaCanonicalPath('/geraina/login'),null);
  assert.equal(gerainaCanonicalPath('/geraina/app/pos/'),null);
});

test('homepage, pricing and Android use the same Geraina navigation with an internal contact section',async()=>{
  let header;
  for (const path of ['/geraina','/geraina/pricing','/geraina/android']) {
    const response=await get(path);assert.equal(response.status,200);
    const body=await response.text(),current=body.match(/<header class="geraina-header">[\s\S]*?<\/header>/)?.[0];
    assert.ok(current);assert.match(current,/href="\/geraina#kontak"/);
    assert.doesNotMatch(current,/href="\/"|sumber-daya|https:\/\/dagangos\.com/);
    assert.match(current,/aria-controls="geraina-navigation"/);
    const normalized=current.replace(/ aria-current="page"/g,'');
    if(header)assert.equal(normalized,header);else header=normalized;
    assert.match(body,/<footer class="geraina-footer">[\s\S]*?href="https:\/\/dagangos\.com\/"/);
    assert.doesNotMatch(body,/<!-- geraina-header -->|<!-- geraina-footer -->/);
  }
});

test('unified home retains the feature modules and solution workflow', async()=>{
  const html=await(await get('/geraina')).text();
  for(const id of ['fitur','solusi','kontak'])assert.match(html,new RegExp('id="'+id+'"'));
  for(const module of ['POS & kasir','Inventori','Pembelian & supplier','Laporan','Multi-outlet','Staf & hak akses'])assert.ok(html.includes(module));
  assert.match(html,/data-geraina-chat/);assert.match(html,/mailto:support@dagangos.com/);
  assert.match(html,/<img data-geraina-hero src="\/geraina\/assets\/scenes\/geraina-retail\.png"/);
  assert.doesNotMatch(html,/<aside class="hero-card">/);
  assert.doesNotMatch(html,/data-hero-motion|Jeda animasi|Putar animasi/);
});

test('web app pages cross the public-site boundary while application routes retain their shell',async()=>{
  const html=await(await get('/geraina/login')).text();
  assert.match(html,/<div id="root">/);assert.match(html,/data-geraina-web-app/);
  assert.match(html,/\/geraina-public\.js/);
  assert.doesNotMatch(html,/Operasional retail, dari kasir/);
});
