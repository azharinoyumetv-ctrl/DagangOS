import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {renderSubscriptionPricing,readReceipt,signReceipt,selection,handleSubscriptionCheckout} from '../src/subscription-checkout.js';
const require=createRequire(new URL('../GerainaOS/frontend/package.json',import.meta.url));
const {chromium}=require('playwright');
const secret='purchase-experience-local-only',token='disposable.test.token-for-local-checkout';
const env={SUBSCRIPTION_SIGNING_KEY:secret,XENDIT_SECRET_KEY:'local-only',XENDIT_WEBHOOK_TOKEN:'local-only'};
const out=new URL('../tmp/purchase-experience/',import.meta.url);mkdirSync(out,{recursive:true});
const results=[],browser=await chromium.launch({channel:'chrome',headless:true});
const choice={...selection('geraina','starter','monthly'),provider:'xendit',orderId:'DG-geraina-'+'a'.repeat(32),expires:Date.now()+3600000};
let confirmHtml;
const realFetch=globalThis.fetch;
try{
 globalThis.fetch=async()=>Response.json({owner_id:'11111111-1111-4111-8111-111111111111',store_id:'22222222-2222-4222-8222-222222222222',order_id:choice.orderId,amount:choice.amount,active_subscription:{tier:'pro',period:'monthly',expires_at:'2027-01-01T00:00:00Z'}});
 confirmHtml=await(await handleSubscriptionCheckout(new Request('https://dagangos.com/geraina/checkout',{method:'POST',headers:{Origin:'https://dagangos.com','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({cart:await signReceipt(choice,secret),access_token:token})}),env)).text();
}finally{globalThis.fetch=realFetch;}
try{
 for(const [profile,viewport] of [['phone',{width:412,height:915}],['xiaomi',{width:1016,height:1100}],['samsung',{width:1480,height:924}]]){
  for(const scenario of ['active','provider-unavailable','anonymous','slow-click','resume','forged-resume','expired-intent','confirmation']){
   console.log('Checking '+profile+' '+scenario);
   const context=await browser.newContext({viewport}),page=await context.newPage();page.setDefaultTimeout(8000);
   const posts=[];let currentRequests=0,release;
   const waiting=new Promise(resolve=>{release=resolve;});
   await context.addInitScript(({token,scenario})=>{
    if(scenario!=='anonymous')localStorage.setItem('geraina_token',token);
    if(['resume','expired-intent'].includes(scenario))sessionStorage.setItem('dagangos_checkout_geraina',JSON.stringify({tier:'starter',period:'monthly',expires:Date.now()+(scenario==='resume'?60000:-1)}));
   },{token,scenario});
   await context.route('**/*',async route=>{
    const r=route.request(),url=new URL(r.url());if(url.origin!=='https://dagangos.com')return route.abort();
    if(url.pathname==='/geraina/pricing')return route.fulfill({contentType:'text/html',body:await renderSubscriptionPricing(readFileSync(new URL('../public/marketing/geraina-pricing.html',import.meta.url),'utf8'),'geraina',new Request(r.url()),scenario==='provider-unavailable'?{SUBSCRIPTION_SIGNING_KEY:secret}:env)});
    if(url.pathname==='/api/subscriptions/current'){currentRequests++;return route.fulfill({json:{subscription:{tier:'pro',period:'monthly',active:true,expires_at:'2027-01-01T00:00:00Z'}}});}
    if(url.pathname==='/geraina/checkout'){
     if(r.method()==='GET')return route.fulfill({contentType:'text/html',body:confirmHtml});
     posts.push(new URLSearchParams(r.postData()));if(['slow-click','confirmation'].includes(scenario))await Promise.race([waiting,new Promise(resolve=>setTimeout(resolve,5000))]);
     return route.fulfill({contentType:'text/html',body:'<!doctype html><h1>Checkout intercepted</h1>'});
    }
    if(url.pathname==='/geraina/login')return route.fulfill({contentType:'text/html',body:'<!doctype html><h1>Login required</h1>'});
    if(['/subscription-pricing.js','/subscription-feedback.js','/subscription-feedback.css','/product-public.css','/subscription-checkout.css'].includes(url.pathname))return route.fulfill({path:fileURLToPath(new URL('../public'+url.pathname,import.meta.url))});
    return route.fulfill({status:404,body:''});
   });
   const resume=['resume','forged-resume','expired-intent'].includes(scenario);
   await page.goto('https://dagangos.com/geraina/'+(scenario==='confirmation'?'checkout':'pricing'+(resume?'?period=monthly&plan=starter&checkout=1':''))).catch(e=>{if(!e.message.includes('ERR_ABORTED'))throw e;});
   if(scenario==='resume'){
    await page.getByRole('heading',{name:'Checkout intercepted'}).waitFor();assert.equal(posts.length,1);assert.equal(currentRequests,0,'Saved purchase skips the redundant status request');
   }else{
    if(scenario!=='confirmation'){
     assert.equal(await page.locator('.price-card').count(),3);assert.equal(await page.getByRole('heading',{name:'Free Trial',exact:true}).count(),0);
     assert.deepEqual(await page.locator('.price-card h2').allTextContents(),['Starter','Pro','Business']);
     assert.equal(await page.locator('[data-anonymous-trial]').count(),scenario==='anonymous'?1:0);
    }
    if(scenario==='active'){
     await page.getByRole('link',{name:'Kelola langganan',exact:true}).waitFor();assert.equal(await page.locator('#plan-pro button').isDisabled(),true);
     await page.locator('.billing-toggle button[value="yearly"]').click();assert.equal(await page.locator('#plan-pro button').isEnabled(),true);
     await page.locator('#plan-pro button').click();await page.getByRole('heading',{name:'Checkout intercepted'}).waitFor();
     const cart=await readReceipt(posts[0].get('cart'),secret);assert.deepEqual([cart.tier,cart.period,cart.amount],['pro','yearly',3490000]);
    }else if(scenario==='provider-unavailable'){
     await page.getByRole('link',{name:'Kelola langganan',exact:true}).waitFor();await page.locator('.billing-toggle button[value="yearly"]').click();assert.equal(await page.locator('.plan-purchase button:enabled').count(),0);assert.equal(posts.length,0);
    }else if(scenario==='anonymous'){
     await page.locator('#plan-starter button').click();await page.getByRole('heading',{name:'Login required'}).waitFor();assert.equal(posts.length,0);
    }else if(['slow-click','confirmation'].includes(scenario)){
     const selector=scenario==='confirmation'?'form[data-subscription-submit]':'#plan-starter form';
     // Hold the browser's navigation handoff so assertions inspect the painted
     // document rather than racing a pending main-frame navigation in CDP.
     await page.evaluate(()=>{const original=HTMLFormElement.prototype.submit;window.__submitCalls=0;HTMLFormElement.prototype.submit=function(){window.__submitCalls++;window.__releaseSubmit=()=>original.call(this);};});
     const feedback=await page.evaluate(selector=>{const form=document.querySelector(selector),start=performance.now();form.querySelector('button[type="submit"]').click();return{ms:performance.now()-start,busy:form.getAttribute('aria-busy'),spinner:!!form.querySelector('.checkout-spinner'),disabled:form.querySelector('button').disabled};},selector);
     assert.equal(feedback.busy,'true');assert.ok(feedback.spinner&&feedback.disabled);assert.ok(feedback.ms<150,JSON.stringify(feedback));
     await page.waitForFunction(()=>document.querySelector('.checkout-progress')?.offsetHeight>0);
     await page.evaluate(selector=>document.querySelector(selector).requestSubmit(),selector);
     await new Promise(resolve=>setTimeout(resolve,300));assert.equal(await page.evaluate(()=>window.__submitCalls),1,'Repeated submit cannot create a second payment request');
     await page.screenshot({path:fileURLToPath(new URL(profile+'-'+scenario+'.png',out))});
     release();await page.evaluate(()=>window.__releaseSubmit());await page.getByRole('heading',{name:'Checkout intercepted'}).waitFor();assert.equal(posts.length,1);
     results.push({profile,scenario,status:'passed',feedbackMs:feedback.ms,posts:1});await context.close();continue;
    }else{
     await page.getByRole('link',{name:'Kelola langganan',exact:true}).waitFor();assert.equal(posts.length,0,'URL or expired intent cannot initiate payment');
    }
   }
   if(posts[0])assert.equal(posts[0].get('access_token'),token);
   results.push({profile,scenario,status:'passed',posts:posts.length,currentRequests});await context.close();
  }
 }
}finally{await browser.close();}
writeFileSync(new URL('verification.json',out),JSON.stringify({status:'passed',results,productionWrites:0,providerRequests:0},null,2));
console.log(JSON.stringify({status:'passed',checks:results.length,maximumFeedbackMs:Math.max(...results.map(r=>r.feedbackMs||0))}));
