import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {renderSubscriptionPricing,readReceipt} from '../src/subscription-checkout.js';
const require=createRequire(new URL('../GerainaOS/frontend/package.json',import.meta.url));
const {chromium}=require('playwright');
const secret='pricing-browser-check-only',token='disposable.test.token-for-local-checkout';
const env={SUBSCRIPTION_SIGNING_KEY:secret,XENDIT_SECRET_KEY:'local-only',XENDIT_WEBHOOK_TOKEN:'local-only'};
const out=new URL('../tmp/subscription-pricing/',import.meta.url);mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
 for(const scenario of ['active','provider-unavailable','anonymous']){
  const context=await browser.newContext(),page=await context.newPage();
  let checkout;
  await context.addInitScript(({token,scenario})=>{if(scenario!=='anonymous')localStorage.setItem('geraina_token',token);},{token,scenario});
  await context.route('**/*',async route=>{
   const r=route.request(),url=new URL(r.url());
   if(url.origin!=='https://dagangos.com')return route.abort();
   if(url.pathname==='/geraina/pricing')return route.fulfill({contentType:'text/html',body:await renderSubscriptionPricing(readFileSync(new URL('../public/marketing/geraina-pricing.html',import.meta.url),'utf8'),'geraina',new Request(r.url()),scenario==='provider-unavailable'?{SUBSCRIPTION_SIGNING_KEY:secret}:env)});
   if(url.pathname==='/api/subscriptions/current')return route.fulfill({json:{subscription:{tier:'pro',period:'monthly',active:true,expires_at:'2027-01-01T00:00:00Z'}}});
   if(url.pathname==='/geraina/checkout'){checkout=new URLSearchParams(r.postData());return route.fulfill({body:'<!doctype html><h1>Checkout intercepted</h1>',contentType:'text/html'});}
   if(url.pathname==='/geraina/login')return route.fulfill({body:'<!doctype html><h1>Login required</h1>',contentType:'text/html'});
   if(['/subscription-pricing.js','/product-public.css','/subscription-checkout.css'].includes(url.pathname))return route.fulfill({path:fileURLToPath(new URL('../public'+url.pathname,import.meta.url))});
   return route.fulfill({status:404,body:''});
  });
  await page.goto('https://dagangos.com/geraina/pricing');
  if(scenario==='active'){
   await page.getByRole('link',{name:'Kelola langganan',exact:true}).waitFor();
   assert.equal(await page.locator('#plan-pro button').isDisabled(),true);
   await page.locator('.billing-toggle button[value="yearly"]').click();
   assert.equal(await page.locator('#plan-pro button').isEnabled(),true);
   await page.locator('#plan-pro button').click();await page.getByRole('heading',{name:'Checkout intercepted'}).waitFor();
   const cart=await readReceipt(checkout.get('cart'),secret);assert.equal(cart.period,'yearly');assert.equal(cart.tier,'pro');assert.equal(cart.amount,3490000);assert.equal(checkout.get('access_token'),token);
  }else if(scenario==='provider-unavailable'){
   await page.getByRole('link',{name:'Kelola langganan',exact:true}).waitFor();
   await page.locator('.billing-toggle button[value="yearly"]').click();
   assert.equal(await page.locator('.plan-purchase button:enabled').count(),0);
   assert.equal(checkout,undefined);
  }else{
   await page.locator('#plan-starter button').click();await page.getByRole('heading',{name:'Login required'}).waitFor();
   assert.equal(new URL(page.url()).pathname,'/geraina/login');assert.equal(checkout,undefined);
   const intent=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('dagangos_checkout_geraina')));assert.equal(intent.tier,'starter');
  }
  results.push({scenario,status:'passed'});await context.close();
 }
}finally{await browser.close();}
writeFileSync(new URL('verification.json',out),JSON.stringify({status:'passed',results,productionWrites:0,providerRequests:0},null,2));
console.log(JSON.stringify({status:'passed',results}));
