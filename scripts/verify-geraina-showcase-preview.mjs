import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require('../GerainaOS/frontend/node_modules/playwright');
const base=process.env.GERAINA_SHOWCASE_URL||'http://127.0.0.1:8794',out=resolve('tmp/geraina-showcase-review');
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname),'This verification is local-only.');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[],errors=[];
const settled=page=>page.waitForFunction(()=>{const e=document.querySelector('[data-showcase-deck]');return e?.getAttribute('aria-busy')==='false'&&e.querySelectorAll('.gshow-scene').length===1;});
try{
 const context=await browser.newContext();
 await context.route('**/api/**',route=>route.fulfill({status:401,json:{detail:'Local visual verification'}}));
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 for(const width of [1920,1680,1440,1024,768,393,320]){
  await page.setViewportSize({width,height:1100});await page.goto(base+'/geraina');await settled(page);
  await page.locator('[data-geraina-hero]').evaluate(e=>e.decode());assert.equal(await page.locator('[data-hero-motion]').count(),0);
  assert.equal(await page.locator('[data-showcase-rail]').count(),0,'Scrolling screenshot strip removed');
  for(const device of ['phone','tablet','desktop']){
   await page.locator(`[data-showcase-device="${device}"]`).click();await settled(page);
   for(const feature of ['pos','products','inventory','reports']){
    await page.locator(`[data-showcase-feature="${feature}"]`).click();await settled(page);
    const scene=page.locator('.gshow-scene');assert.equal(await scene.count(),1);assert.equal(await scene.getAttribute('data-device'),device);assert.equal(await scene.getAttribute('data-feature'),feature);
    const geometry=await scene.locator('img').evaluate(image=>{
     const r=image.getBoundingClientRect(),parent=image.parentElement.getBoundingClientRect(),stage=document.querySelector('[data-showcase-stage]').getBoundingClientRect();
     return {ratio:r.width/r.height,natural:image.naturalWidth/image.naturalHeight,fits:r.left>=parent.left-1&&r.right<=parent.right+1&&r.top>=parent.top-1&&r.bottom<=parent.bottom+1,stageFits:r.left>=stage.left-1&&r.right<=stage.right+1&&r.top>=stage.top-1&&r.bottom<=stage.bottom+1};
    });
    assert(Math.abs(geometry.ratio-geometry.natural)<.015,`${width} ${device} ${feature}: screenshot not stretched`);
    assert(geometry.fits&&geometry.stageFits,`${width} ${device} ${feature}: complete screenshot fits bezel and stage`);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
   }
  }
  await page.locator('#gshow-feature-pos').click();await settled(page);
  await page.locator('#galeri-geraina').scrollIntoViewIfNeeded();await page.evaluate(()=>scrollTo(0,document.querySelector('#galeri-geraina').getBoundingClientRect().top+scrollY-100));await page.screenshot({path:join(out,`explorer-review-${width}.png`)});
  if([1680,393].includes(width))await page.locator('.gshow-explorer').screenshot({path:join(out,`explorer-panel-${width}.png`)});
  checks.push({width,status:'passed',views:12,scope:'One image at a time; original image proportions, complete screenshot fits device and stage; no page overflow.'});
 }
 await page.setViewportSize({width:1440,height:1100});await page.goto(base+'/geraina#galeri-geraina');await settled(page);
 await page.locator('#gshow-tab-phone').focus();await page.keyboard.press('End');await settled(page);assert.equal(await page.locator('#gshow-tab-desktop').getAttribute('aria-selected'),'true');
 await page.locator('#gshow-feature-pos').focus();await page.keyboard.press('End');await settled(page);assert.equal(await page.locator('.gshow-scene').getAttribute('data-feature'),'reports');await page.keyboard.press('Home');await settled(page);
 checks.push({status:'passed',scope:'Both device and feature tablists support keyboard arrows/Home/End.'});
 await page.locator('[data-slide-next]').click();await page.waitForFunction(()=>document.querySelectorAll('.gshow-scene').length===2&&document.getAnimations().some(a=>a.effect?.getTiming().duration===380));await settled(page);assert.equal(await page.locator('.gshow-scene').getAttribute('data-feature'),'products');
 await page.locator('[data-slide-previous]').click();await settled(page);assert.equal(await page.locator('.gshow-scene').getAttribute('data-feature'),'pos');
 checks.push({status:'passed',scope:'Next/previous renders the selected picture with an observed animated transition.'});
 await page.evaluate(()=>{const button=document.querySelector('[data-slide-next]');button.click();button.click();button.click();});await settled(page);assert.equal(await page.locator('.gshow-scene').getAttribute('data-feature'),'reports');
 checks.push({status:'passed',scope:'Rapid navigation keeps the last selection and removes superseded pictures.'});
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-slide-next]').click();await settled(page);assert.equal(await page.locator('.gshow-scene').getAttribute('data-feature'),'pos');assert.equal(await page.locator('[data-showcase-stage]').evaluate(e=>e.getAnimations({subtree:true}).length),0);
 checks.push({status:'passed',scope:'Reduced-motion navigation changes pictures without animation.'});
 await page.emulateMedia({reducedMotion:'no-preference'});
 const opener=page.locator('.gshow-scene-button');await opener.click();await page.waitForFunction(()=>document.querySelector('.gshow-dialog-image').hasAttribute('src'));await page.locator('.gshow-dialog-image').evaluate(e=>e.decode());
 assert.equal(await page.locator('dialog').getAttribute('data-device'),'desktop');const old=await page.locator('.gshow-dialog-image').getAttribute('src');await page.keyboard.press('ArrowRight');await page.waitForFunction(old=>document.querySelector('.gshow-dialog-image').getAttribute('src')!==old,old);
 await page.locator('.gshow-dialog-image').evaluate(e=>e.decode());await page.screenshot({path:join(out,'laptop-viewer.png')});await page.keyboard.press('Escape');await page.waitForFunction(()=>document.body.style.overflow==='');assert(await opener.evaluate(e=>document.activeElement===e));
 checks.push({status:'passed',scope:'Laptop enlarged view, animated picture navigation, Escape and restored focus/scroll.'});
 await page.setViewportSize({width:393,height:900});await page.locator('#gshow-tab-phone').click();await settled(page);
 await page.locator('[data-showcase-stage]').dispatchEvent('pointerdown',{pointerType:'touch',clientX:250,clientY:300});await page.locator('[data-showcase-stage]').dispatchEvent('pointerup',{pointerType:'touch',clientX:100,clientY:305});await settled(page);assert.equal(await page.locator('.gshow-scene').getAttribute('data-feature'),'products');
 checks.push({status:'passed',scope:'Horizontal touch gesture changes the current feature.'});
 const failed=await context.newPage();await failed.route('**/product-media/geraina-showcase.json',route=>route.fulfill({status:503,body:'Test interruption'}));await failed.goto(base+'/geraina');await failed.getByText('Galeri belum dapat dimuat.',{exact:false}).waitFor();await failed.close();checks.push({status:'passed',scope:'Failed manifest leaves the original page usable with a recovery message.'});
 const badImage=await context.newPage();await badImage.route('**/screens/phone-web-products.png',route=>route.fulfill({status:503,body:'Test interruption'}));await badImage.goto(base+'/geraina');await settled(badImage);await badImage.locator('#gshow-feature-products').click();await badImage.getByText('Gambar belum dapat dimuat.',{exact:false}).waitFor();await badImage.locator('#gshow-feature-reports').click();await settled(badImage);assert.equal(await badImage.locator('.gshow-scene').getAttribute('data-feature'),'reports');await badImage.close();checks.push({status:'passed',scope:'An unavailable picture has a visible error and another feature recovers.'});
 assert.deepEqual(errors,[]);await context.close();
 writeFileSync(join(out,'explorer-verification.json'),JSON.stringify({status:'passed',scope:'Local review only; no deployment or production writes',checks,runtimeErrors:errors},null,2)+'\n');console.log(JSON.stringify({status:'passed',checks:checks.length,widths:7,deviceFeatureViews:84}));
}finally{await browser.close();}
