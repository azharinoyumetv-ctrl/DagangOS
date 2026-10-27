// Use the real deployed pricing page and assets. API/checkout POSTs are
// intercepted so this never creates an invoice or changes a customer account.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../GerainaOS/frontend/package.json',import.meta.url)),{chromium}=require('playwright');
const out=new URL('../tmp/purchase-public/',import.meta.url);mkdirSync(out,{recursive:true});
const results=[],browser=await chromium.launch({channel:'chrome',headless:true});
try{
 for(const [profile,viewport] of [['phone',{width:412,height:915}],['xiaomi',{width:1016,height:1100}],['samsung',{width:1480,height:924}]]){
  const context=await browser.newContext({viewport}),page=await context.newPage();let posts=0;const assets=[];
  await context.addInitScript(()=>localStorage.setItem('geraina_token','public-read-only-fixture-token'));
  await context.route('**/*',route=>{
   const r=route.request(),u=new URL(r.url());
   if(u.origin!=='https://dagangos.com')return route.abort();
   if(u.pathname.startsWith('/api/'))return route.fulfill({json:u.pathname==='/api/subscriptions/current'?{subscription:null}:{}});
   if(u.pathname==='/geraina/checkout'&&r.method()==='POST'){
    posts++;const body=new URLSearchParams(r.postData());assert.equal(body.get('access_token'),'public-read-only-fixture-token');assert.ok(body.get('cart'));
    return route.fulfill({contentType:'text/html',body:'<!doctype html><h1>Public checkout intercepted</h1>'});
   }
   if(r.method()!=='GET')return route.abort();return route.continue();
  });
  page.on('response',r=>{if(/\/subscription-(feedback\.(css|js)|pricing\.js)/.test(r.url()))assets.push({url:r.url(),status:r.status()});});
  await page.goto('https://dagangos.com/geraina/pricing');
  assert.deepEqual(await page.locator('.price-card h2').allTextContents(),['Starter','Pro','Business']);
  assert.equal(await page.locator('[data-anonymous-trial]').count(),0);
  assert.equal(assets.length,3);assert.ok(assets.every(r=>r.status===200));
  await page.evaluate(()=>{const original=HTMLFormElement.prototype.submit;window.__submitCalls=0;HTMLFormElement.prototype.submit=function(){window.__submitCalls++;window.__submitOnce=()=>original.call(this);};});
  await page.locator('#plan-starter button').scrollIntoViewIfNeeded();
  const feedback=await page.evaluate(()=>{const f=document.querySelector('#plan-starter form'),start=performance.now();f.querySelector('button').click();return{ms:performance.now()-start,busy:f.getAttribute('aria-busy'),spinner:!!f.querySelector('.checkout-spinner')};});
  assert.equal(feedback.busy,'true');assert.ok(feedback.spinner&&feedback.ms<150);
  await page.locator('.checkout-progress').waitFor({state:'visible'});await page.evaluate(()=>document.querySelector('#plan-starter form').requestSubmit());
  await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.__submitCalls),1);
  await page.screenshot({path:fileURLToPath(new URL(profile+'-loading.png',out))});
  await page.evaluate(()=>window.__submitOnce());await page.getByRole('heading',{name:'Public checkout intercepted'}).waitFor();assert.equal(posts,1);
  results.push({profile,status:'passed',feedbackMs:feedback.ms,checkoutPosts:posts,assets});await context.close();
 }
}finally{await browser.close();}
writeFileSync(new URL('verification.json',out),JSON.stringify({status:'passed',results,productionWrites:0,providerRequests:0},null,2));
console.log(JSON.stringify({status:'passed',checks:results.length}));
