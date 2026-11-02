// Deployed DapurOS assets with explicit API fixtures; no production save is permitted.
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('../DapurOS/frontend/node_modules/playwright');
const base=process.env.DAPUROS_WEBSITE_BASE_URL||'http://127.0.0.1:8799',origin=new URL(base).origin;
const metadata=JSON.parse(readFileSync('public/downloads/dapuros/latest.json','utf8'));
const out='tmp/dapuros-product-editor';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[];
try {
 for(const width of [393,1016,1480])for(const plan of ['business','starter']){
  const mobile=width<1200;
  const context=await browser.newContext({viewport:{width,height:1100},serviceWorkers:'block',...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'}:{})});
  const user={id:'editor-fixture',store_id:'editor-store',store_name:'DapurOS verification',email:'editor@example.invalid',role:'Owner',plan,current_module:'dapuros',stores:[{module:'dapuros',store_id:'editor-store'}]};
  const reads=[],writes=[],errors=[];
  await context.addInitScript(user=>{localStorage.setItem('dapuros_token','isolated-editor-fixture');localStorage.setItem('dapuros_user',JSON.stringify(user));},user);
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin!==origin&&!(url.origin==='https://dagangos.com'&&url.pathname.startsWith('/api/')))return route.abort();
   if(!url.pathname.startsWith('/api/'))return route.continue();
   if(request.method()!=='GET'){writes.push(url.pathname);return route.abort();}
   reads.push(url.pathname);let json=[];
   const records=items=>({items,total:items.length,next_cursor:null});
   if(url.pathname==='/api/auth/me')json=user;
   else if(url.pathname==='/api/products/catalogue')json=records([{id:'product-fixture',name:'Menu fixture',price:10000,cost:1000,stock:10,category:'Legacy menu',unit:'pcs',recipe:[]}]);
   else if(url.pathname==='/api/products/category-names')json=['Legacy menu'];
   else if(url.pathname==='/api/records/categories')json=records([{id:'category-fixture',name:'Saved category'}]);
   else if(url.pathname==='/api/records/units')json=records([{id:'unit-fixture',name:'Kilogram',short_name:'kg'}]);
   else if(url.pathname==='/api/records/ingredients')json=records([{id:'beans-fixture',name:'Biji resep',unit:'g',stock:1000}]);
   else if(url.pathname.startsWith('/api/records/'))json=records([]);
   else if(url.pathname==='/api/settings')json={general:{store_name:user.store_name,timezone:'Asia/Jakarta'}};
   else if(url.pathname==='/api/subscriptions/current')json={plan,can_manage:true,addons:{offers:[],purchases:[]}};
   return route.fulfill({json});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.routeWebSocket('**/*',socket=>socket.close());
  await page.goto(base+'/dapuros/app/products');await page.getByTestId('new-product-btn').waitFor();
  assert(!reads.includes('/api/records/units'),'Product browsing must not fetch unit choices');
  await page.getByTestId('new-product-btn').click();
  const category=page.getByTestId('pf-category'),unit=page.getByTestId('pf-unit');
  assert.equal(await category.evaluate(element=>element.tagName),'SELECT');assert.equal(await unit.evaluate(element=>element.tagName),'SELECT');
  await category.selectOption({label:'Saved category'});await unit.selectOption({label:'Kilogram (kg)'});
  assert.equal(await category.inputValue(),'category:Saved category');assert.equal(await unit.inputValue(),'unit:kg');
  assert.equal(await page.getByTestId('pf-photo-camera').count(),mobile?1:0);
  assert.equal(await page.getByTestId('pf-camera-input').getAttribute('capture'),'environment');
  assert.equal(await page.getByTestId('pf-image-input').getAttribute('capture'),null);
  assert.equal(await page.getByTestId('bom-add-ingredient-toggle').count(),plan==='business'?1:0);
  if(plan==='starter')assert(!reads.includes('/api/records/ingredients'));
  await page.getByTestId('pf-name').fill('Unsaved verification');
  const chooser=page.waitForEvent('filechooser');await page.getByTestId('pf-photo-gallery').click();await(await chooser).setFiles([]);
  assert.equal(await page.getByTestId('pf-name').inputValue(),'Unsaved verification');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  assert(await page.getByTestId('product-form-modal').evaluate(element=>element.parentElement===document.body));
  await page.screenshot({path:`${out}/${plan}-${width}.png`,fullPage:false});
  await page.getByTestId('pf-cancel').click();assert.equal(await page.getByTestId('product-form-modal').count(),0);
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  checks.push({width,plan,status:'passed',apiFixture:true,checks:['saved-category','saved-unit-symbol','photo-actions','recipe-entitlement','cancel-keeps-draft','viewport-fit'],productionWrites:0});
  await context.close();
 }
 const result={status:'passed',base,version:metadata.version,verifiedAt:new Date().toISOString(),checks,productionWrites:0};
 writeFileSync(`${out}/verification.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
