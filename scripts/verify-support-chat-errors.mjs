import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require('../GerainaOS/frontend/node_modules/playwright');
const base=process.env.SUPPORT_CHECK_URL||'http://127.0.0.1:8792';
const out=resolve(process.env.SUPPORT_CHECK_REPORT_DIR||'tmp/support-chat-errors-local');mkdirSync(out,{recursive:true});
const diagnostic='⚠️ Provider authentication failed: No access token found for Nous Portal login. Run `hermes model` to re-authenticate.';
const privateError='private-host ECONNREFUSED sk-synthetic-private-value-not-a-real-secret';
const normal='Silakan lihat fitur produk dan pilihan paket melalui menu di atas.';
const scenarios=[
 {name:'http-200-provider-warning',status:200,payload:{reply:diagnostic}},
 {name:'future-warning',status:200,payload:{reply:'⚠️ A new internal diagnostic from a future provider'}},
 {name:'http-error-private-body',status:502,payload:{error:privateError}},
 {name:'http-200-failure-flag',status:200,payload:{success:false,reply:normal}},
 {name:'malformed-json',status:200,body:'<html>'+privateError+'</html>'},
 {name:'network-failure',abort:true},
 {name:'rate-limited',status:429,payload:{error:privateError}},
 {name:'ordinary-reply',status:200,payload:{reply:normal}},
];
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[],requests=[];
let active=scenarios[0];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/api/**',async route=>{
  if(!route.request().url().includes('/api/support-chat'))return route.fulfill({status:401,body:'{}'});
  requests.push(route.request().postDataJSON());
  if(active.abort)return route.abort();
  return route.fulfill({status:active.status,contentType:'application/json',body:active.body||JSON.stringify(active.payload)});
 });
 async function send(){
  await page.locator('.dagangos-support__form textarea').fill('halo');
  await page.locator('.dagangos-support__send').click();
  await page.waitForFunction(()=>!document.querySelector('.dagangos-support__send').disabled&&!document.querySelector('.dagangos-support__messages').textContent.includes('Menyiapkan jawaban'));
  const reply=await page.locator('.dagangos-support__message--assistant').last().textContent();
  assert.doesNotMatch(reply,/nous|hermes|token|sk-synthetic|private-host|ECONNREFUSED|future provider/i);
  return reply;
 }
 for(const surface of ['geraina','dapuros','dagangos']){
  const path=surface==='dagangos'?'/':'/'+surface;
  for(const scenario of scenarios){
   active=scenario;await page.setViewportSize({width:1440,height:1000});await page.goto(base+path);
   await page.locator('.dagangos-support__launcher').click();const reply=await send();
   if(scenario.name==='ordinary-reply')assert.equal(reply,normal);
   else if(scenario.status===429)assert.match(reply,/Pesan terlalu cepat/);
   else assert.match(reply,/Asisten otomatis sedang tidak tersedia/);
   assert.equal(await page.locator('.dagangos-support__send').isEnabled(),true);
   checks.push(`${surface}: ${scenario.name} uses only a safe public reply`);
   if(scenario.name==='http-200-provider-warning'){
    await page.screenshot({path:join(out,`${surface}-safe-error.png`),animations:'disabled'});
    active=scenarios.at(-1);assert.equal(await send(),normal);
    const sent=requests.at(-1);assert.ok(!sent.messages.some(item=>item.role==='assistant'&&/Nous|Hermes|⚠/i.test(item.content)));
    checks.push(`${surface}: recovers after failure without adding provider errors to conversation history`);
   }
  }
  active=scenarios[0];await page.setViewportSize({width:393,height:900});await page.goto(base+path);
  await page.locator('.dagangos-support__launcher').click();assert.match(await send(),/Asisten otomatis sedang tidak tersedia/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.keyboard.press('Escape');assert.equal(await page.locator('.dagangos-support__panel').isVisible(),false);
  checks.push(`${surface}: phone chat handles provider failure and closes normally`);
 }
 assert.deepEqual(errors,[]);
 const report={status:'passed',base,checks,pageErrors:errors,scope:'Browser API responses are intercepted; no real messages are sent to a provider, inbox or customer'};
 writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,base,checks:checks.length,pageErrors:errors}));
 await context.close();
}finally{await browser.close();}
