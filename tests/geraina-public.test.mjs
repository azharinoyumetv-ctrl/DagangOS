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
  const decoded=html.replaceAll('&amp;','&');
  for(const module of ['POS & kasir','Inventori','Pembelian & supplier','Laporan','Multi-outlet','Staf & hak akses'])assert.ok(decoded.includes(module));
  assert.equal((html.match(/data-geraina-feature-image/g)||[]).length,6);
  for(const screen of ['desktop-web-pos','desktop-web-inventory','feature-purchase','desktop-web-reports','feature-branches','feature-staff'])assert.ok(html.includes(`/product-media/geraina/screens/${screen}.png`));
  assert.match(html,/data-geraina-chat/);assert.match(html,/mailto:support@dagangos.com/);
  assert.match(html,/<img data-geraina-hero src="\/geraina\/assets\/scenes\/geraina-retail\.png"/);
  assert.doesNotMatch(html,/<aside class="hero-card">/);
  assert.doesNotMatch(html,/data-hero-motion|Jeda animasi|Putar animasi/);
});

test('promotional videos and captions reach asset storage, preserving seek responses',async()=>{
  const calls=[];
  const videoEnv={ASSETS:{async fetch(request){
    calls.push({path:new URL(request.url).pathname,range:request.headers.get('Range')});
    if(request.url.endsWith('/missing.mp4'))return new Response('Missing',{status:404});
    if(request.url.endsWith('.vtt'))return new Response('WEBVTT\n\n',{headers:{'Content-Type':'text/vtt'}});
    return new Response(new Uint8Array([1,2,3]),{status:206,headers:{'Content-Type':'video/mp4','Content-Range':'bytes 0-2/100'}});
  }}};
  const base='https://dagangos.com/product-media/geraina/videos/';
  const video=await worker.fetch(new Request(base+'scanner-integrations-review.mp4',{headers:{Range:'bytes=0-2'}}),videoEnv,{});
  assert.equal(video.status,206);assert.equal(video.headers.get('Content-Type'),'video/mp4');
  assert.equal(video.headers.get('Content-Range'),'bytes 0-2/100');assert.equal(calls[0].range,'bytes=0-2');
  assert.deepEqual([...new Uint8Array(await video.arrayBuffer())],[1,2,3]);
  const captions=await worker.fetch(new Request(base+'scanner-integrations-id.vtt'),videoEnv,{});
  assert.equal(captions.headers.get('Content-Type'),'text/vtt');assert.match(await captions.text(),/^WEBVTT/);
  const missing=await worker.fetch(new Request(base+'missing.mp4'),videoEnv,{});
  assert.equal(missing.status,404);assert.doesNotMatch(await missing.text(),/<!doctype|id="root"/i);
});

test('web app pages cross the public-site boundary while application routes retain their shell',async()=>{
  const html=await(await get('/geraina/login')).text();
  assert.match(html,/<div id="root">/);assert.match(html,/data-geraina-web-app/);
  assert.match(html,/\/geraina-public\.js/);
  assert.doesNotMatch(html,/Operasional retail, dari kasir/);
});
