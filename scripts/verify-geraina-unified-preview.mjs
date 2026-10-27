import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require('../GerainaOS/frontend/node_modules/playwright');
const base=process.env.GERAINA_PREVIEW_URL||'http://127.0.0.1:8792';
const out=resolve(process.env.GERAINA_PREVIEW_REPORT_DIR||'tmp/geraina-unified-preview');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[],mutations=[];
async function context(options={}){
  const ctx=await browser.newContext(options);
  await ctx.route('**/api/**',route=>{
    const request=route.request();
    if(request.method()!=='GET'){mutations.push(request.url());return route.fulfill({status:403,body:'Test blocks mutations'});}
    return route.fulfill({status:401,contentType:'application/json',body:'{"detail":"Sign in"}'});
  });
  return ctx;
}
try{
 const ctx=await context(),page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 const paths=['/geraina','/geraina/pricing','/geraina/android'];
 for(const width of [1440,1024,768,393,320]){
  for(const path of paths){
   await page.setViewportSize({width,height:1000});await page.goto(base+path);
   await page.locator('.geraina-header').waitFor();
   if(path==='/geraina'){
    const hero=page.locator('[data-geraina-hero]');await hero.evaluate(image=>image.decode());
    assert.ok(await hero.evaluate(image=>image.naturalWidth>0&&image.getBoundingClientRect().height>=300),'Original retail hero loads and has a usable frame');
   }
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${path} fits ${width}px`);
   const nav=page.getByRole('navigation',{name:'Navigasi Geraina',exact:true});
   if(width<=820){
    const toggle=page.getByRole('button',{name:'Menu',exact:true});await toggle.click();
    await page.getByRole('link',{name:'Fitur',exact:true}).waitFor({state:'visible'});
    assert.equal(await toggle.getAttribute('aria-expanded'),'true');
    await page.keyboard.press('Escape');assert.equal(await toggle.getAttribute('aria-expanded'),'false');
    await toggle.click();
   }
   assert.equal(await nav.getByRole('link',{name:'Kontak',exact:true}).getAttribute('href'),'/geraina#kontak');
   await nav.getByRole('link',{name:'Kontak',exact:true}).click();
   await page.waitForURL(base+'/geraina#kontak');
   assert.equal(new URL(page.url()).origin,new URL(base).origin);
   await page.locator('#kontak').waitFor({state:'visible'});
   await page.goto(base+path);
   if(width===1440&&path==='/geraina'){
    for(const image of await page.locator('main img').all())await image.evaluate(img=>{img.scrollIntoView({block:'center',behavior:'instant'});return img.decode();});
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:join(out,'home-full.png'),fullPage:true,animations:'disabled'});
   }
   await page.screenshot({path:join(out,`${path.split('/').pop()}-${width}.png`),animations:'disabled'});
   checks.push(`${path}: ${width}px layout, mobile controls, internal contact destination`);
  }
 }
 for(const width of [1440,393]){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/');
  if(width===393)await page.getByRole('button',{name:'Buka navigasi',exact:true}).click();
  await page.locator('.main-nav a[href="/produk"]').click();await page.waitForURL(base+'/produk');
  const product=page.locator('a.product-row#geraina-pos');assert.equal(await product.getAttribute('href'),'/geraina');
  await product.click();await page.waitForURL(base+'/geraina');await page.locator('.geraina-header').waitFor();
  await page.locator('[data-geraina-hero]').evaluate(image=>image.decode());
  assert.equal(await page.locator('.neo-nav').count(),0);
  checks.push(`Main DagangOS navigation → Produk → Geraina opens the one unified destination at ${width}px`);
 }
 await page.goto(base+'/geraina/?ref=preview#fitur');
 assert.equal(new URL(page.url()).pathname,'/geraina');assert.equal(new URL(page.url()).search,'?ref=preview');assert.equal(new URL(page.url()).hash,'#fitur');
 checks.push('Trailing slash redirects retain query and section');
 checks.push('Original retail hero image loads in its responsive frame at all five widths');
 await page.goto(base+'/geraina');
 const contrast=await page.evaluate(()=>{
  const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number);
  const luminance=value=>rgb(value).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
  return ['.geraina-nav-button','.hero .button','.geraina-feature-index','.geraina-capabilities span','.geraina-workflow li>span','.geraina-device-label','.geraina-contact-detail>span','.geraina-hero-motion'].map(selector=>{
   const el=document.querySelector(selector);let node=el,bg;
   while(node){bg=getComputedStyle(node).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent')break;node=node.parentElement;}
   const light=luminance(getComputedStyle(el).color),dark=luminance(bg);
   return {selector,ratio:(Math.max(light,dark)+.05)/(Math.min(light,dark)+.05)};
  });
 });
 for(const sample of contrast)assert.ok(sample.ratio>=4.5,`${sample.selector} text contrast ${sample.ratio.toFixed(2)}`);
 checks.push('New navigation, buttons and small section labels meet 4.5:1 text contrast');
 await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});await page.goto(base+'/geraina');
 const scene=page.locator('.geraina-hero-scene');await page.locator('[data-geraina-hero]').evaluate(image=>image.decode());
 await page.waitForFunction(()=>{
  const items=document.querySelector('.geraina-hero-scene').getAnimations({subtree:true});
  return items.length===8&&items.every(animation=>animation.playState==='running');
 });
 const animationNames=await scene.evaluate(node=>[...new Set(node.getAnimations({subtree:true}).map(animation=>animation.animationName))].sort());
 assert.deepEqual(animationNames,['geraina-retail-camera','geraina-retail-particle','geraina-retail-sweep','geraina-sigil-float','geraina-sigil-pulse']);
 const firstFrame=await scene.screenshot({path:join(out,'hero-motion-before.png'),animations:'allow'});
 const beforeScale=await page.locator('[data-geraina-hero]').evaluate(image=>new DOMMatrixReadOnly(getComputedStyle(image).transform).a);
 await page.waitForFunction(prior=>Math.abs(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('[data-geraina-hero]')).transform).a-prior)>.001,beforeScale,{timeout:5000});
 const secondFrame=await scene.screenshot({path:join(out,'hero-motion-after.png'),animations:'allow'});
 assert.notDeepEqual(firstFrame,secondFrame,'Rendered frames change while original hero effects run');
 checks.push('Eight live animations restore camera motion, light sweep, particles, floating emblem and pulsing rings; rendered frames change');
 await page.getByRole('button',{name:'Jeda animasi',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.geraina-hero-scene').getAnimations({subtree:true}).every(animation=>animation.playState==='paused'));
 const pausedTransform=await page.locator('[data-geraina-hero]').evaluate(image=>getComputedStyle(image).transform);
 await page.waitForTimeout(220);
 assert.equal(await page.locator('[data-geraina-hero]').evaluate(image=>getComputedStyle(image).transform),pausedTransform);
 await page.getByRole('button',{name:'Putar animasi',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.geraina-hero-scene').getAnimations({subtree:true}).every(animation=>animation.playState==='running'));
 checks.push('Hero pause and resume controls stop and restart actual motion');
 await page.locator('#kontak').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('.geraina-hero-scene').classList.contains('is-offscreen')&&document.querySelector('.geraina-hero-scene').getAnimations({subtree:true}).every(animation=>animation.playState==='paused'));
 await scene.scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>!document.querySelector('.geraina-hero-scene').classList.contains('is-offscreen')&&document.querySelector('.geraina-hero-scene').getAnimations({subtree:true}).every(animation=>animation.playState==='running'));
 checks.push('Hero motion pauses offscreen and resumes when visible');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForFunction(()=>document.querySelector('.geraina-hero-scene').getAnimations({subtree:true}).length===0);
 assert.equal(await page.locator('[data-hero-motion]').isVisible(),false);
 assert.equal(await page.locator('[data-geraina-hero]').evaluate(image=>getComputedStyle(image).transform),'none');
 checks.push('Reduced-motion preference disables every hero animation');
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto(base+'/geraina#kontak');await page.getByRole('button',{name:'Tanya Geraina',exact:true}).click();
 await page.locator('.dagangos-support__panel').waitFor({state:'visible'});
 await page.locator('.dagangos-support__close').click();
 checks.push('Geraina contact opens the existing Geraina chat without sending a message');
 // A client-side React link must cross back into the canonical public page.
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(base+'/geraina/login');await page.locator('.auth-brand').waitFor();await page.locator('.auth-brand').click();
 await page.waitForURL(base+'/geraina');await page.locator('.geraina-header').waitFor();
 assert.equal(await page.locator('.neo-nav').count(),0);
 checks.push('React login logo returns to the unified public home, not the old landing');
 await page.goto(base+'/geraina/login');
 await page.locator('.auth-header a[href="/geraina/pricing"]').click();
 await page.waitForURL(base+'/geraina/pricing');await page.locator('.geraina-header').waitFor();
 checks.push('React account link reaches unified pricing');
 for(const scenario of ['valid','expired','unavailable']){
  const account=await context({viewport:{width:1440,height:1000}});
  await account.addInitScript(()=>localStorage.setItem('geraina_token','preview-test-token'));
  await account.route('**/api/auth/me',route=>scenario==='unavailable'?route.abort():route.fulfill({status:scenario==='valid'?200:401,contentType:'application/json',body:JSON.stringify(scenario==='valid'?{id:'preview-account',role:'Owner'}:{detail:'Expired'})}));
  const p=await account.newPage();await p.goto(base+'/geraina');
  if(scenario==='valid')await p.locator('[data-geraina-dashboard]').waitFor({state:'visible'});
  else await p.locator('[data-geraina-login]').waitFor({state:'visible'});
  assert.equal(await p.evaluate(()=>localStorage.getItem('geraina_token')),'preview-test-token');
  checks.push(`Account header: ${scenario} session preserves account storage and usable navigation`);await account.close();
 }
 const nojs=await context({javaScriptEnabled:false,viewport:{width:393,height:900}}),plain=await nojs.newPage();
 await plain.goto(base+'/geraina');await plain.getByRole('link',{name:'Kontak',exact:true}).waitFor({state:'visible'});
 checks.push('Mobile navigation remains accessible without JavaScript');await nojs.close();
 assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);
 const report={status:'passed',base,checks,contrast,animationNames,errors,mutations,scope:'Browser verification of the selected target; no invoice creation, emails or merchant changes'};
 writeFileSync(join(out,'verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 await ctx.close();
}finally{await browser.close();}
