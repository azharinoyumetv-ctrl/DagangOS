import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import worker from '../src/index.js';
const env={ASSETS:{async fetch(request){try{return new Response(await readFile(new URL('../public'+new URL(request.url).pathname,import.meta.url)));}catch{return new Response('Missing',{status:404});}}}};
const get=(path,method='GET')=>worker.fetch(new Request('https://dagangos.com'+path,{method}),env,{});

test('DapurOS follows Geraina homepage-to-Android download navigation',async()=>{
  const home=await(await get('/dapuros')).text();
  assert.match(home,/<nav[^>]*>[\s\S]*?href="\/dapuros\/android"/);
  assert.match(home,/class="shell dapuros-platforms"[\s\S]*?href="\/dapuros\/android"/);
  assert.match(home,/data-dapuros-hero/);assert.doesNotMatch(home,/data-download-link/);
  const page=await get('/dapuros/android');assert.equal(page.status,200);const html=await page.text();
  assert.match(html,/data-dapuros-public/);assert.match(html,/\/dapuros-android\.js/);assert.match(html,/Android 14/);assert.match(html,/data-download-link/);
  assert.doesNotMatch(html,/geraina-android\.js|Geraina-POS-/);
  assert.match(html,/class="hero shell"[\s\S]*?data-download-link/);assert.match(html,/id="instalasi"/);
  for(const path of ['/dapuros/android/','/marketing/dapuros-android.html']){
    const alias=await get(path);assert.equal(alias.status,308);assert.equal(alias.headers.get('Location'),'https://dagangos.com/dapuros/android');
  }
});

test('published-path candidate bytes and identity match the DapurOS manifest',async()=>{
  const metadata=await get('/downloads/dapuros/latest.json');assert.equal(metadata.status,200);assert.equal(metadata.headers.get('Cache-Control'),'no-cache');
  const release=await metadata.json();assert.equal(release.applicationId,'com.dagangos.dapuros');assert.equal(release.minimumSdk,34);
  assert.notEqual(release.signingCertificateSha256,'52e14a39a7da4f5f528838f33602860e35960373070a6132d08f682487494ec8');
  const response=await get(release.downloadUrl);assert.equal(response.status,200);
  assert.match(response.headers.get('Content-Type'),/application\/vnd\.android\.package-archive/);assert.match(response.headers.get('Cache-Control'),/immutable/);
  const data=Buffer.from(await response.arrayBuffer());assert.equal(data.length,release.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),release.sha256);
});

test('APK HEAD requests retain download headers without returning a body',async()=>{
  const release=JSON.parse(await readFile(new URL('../public/downloads/dapuros/latest.json',import.meta.url),'utf8'));
  const response=await get(release.downloadUrl,'HEAD');assert.equal(response.status,200);assert.equal((await response.arrayBuffer()).byteLength,0);
  assert.match(response.headers.get('Content-Disposition'),/DapurOS-POS-1\.0\.0\.apk/);assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
});

test('DapurOS binary routes reject unsupported names writes and missing files',async()=>{
  for(const path of ['/downloads/dapuros/Geraina-POS-1.0.0.apk','/downloads/dapuros/DapurOS-POS-99.0.0.apk','/downloads/dapuros/signing.jks'])assert.equal((await get(path)).status,404);
  assert.equal((await get('/downloads/dapuros/latest.json','POST')).status,405);
});
