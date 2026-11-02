// Public assets with an isolated API fixture: never saves a production booking.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('../DapurOS/frontend/node_modules/playwright');
const base=process.env.DAPUROS_WEBSITE_BASE_URL||'http://127.0.0.1:8799',origin=new URL(base).origin;
const out='tmp/dapuros-reservations';mkdirSync(out,{recursive:true});
const checks=[],browser=await chromium.launch({channel:'chrome',headless:true});
try {
 for(const width of [393,1280])for(const plan of ['business','starter','pro']) {
  const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'}),errors=[],writes=[];
  const user={id:'reservation-fixture',store_id:'reservation-store',store_name:'Reservation verification',email:'reservation@example.invalid',role:'Cashier',plan,current_module:'dapuros',stores:[{module:'dapuros',store_id:'reservation-store'}]};
  await context.addInitScript(user=>{localStorage.setItem('dapuros_token','isolated-reservation-fixture');localStorage.setItem('dapuros_user',JSON.stringify(user));},user);
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==origin&&!(url.origin==='https://dagangos.com'&&url.pathname.startsWith('/api/')))return route.abort();
   if(!url.pathname.startsWith('/api/'))return route.continue();
   if(req.method()!=='GET'){writes.push(url.pathname);return route.abort();}
   let json=[];
   if(url.pathname==='/api/auth/me')json=user;
   else if(url.pathname==='/api/floors')json=[{id:'floor',name:'Lantai 1',level:1}];
   else if(url.pathname==='/api/tables')json=[{id:'table',floor_id:'floor',label:'Meja 1',capacity:4,status:'Vacant'}];
   else if(url.pathname==='/api/payments/options')json={methods:{cash:{enabled:true,displayed:true}},ewallet_channels:[]};
   else if(url.pathname==='/api/settings')json={general:{store_name:user.store_name,timezone:'Asia/Jakarta'}};
   else if(url.pathname.startsWith('/api/records/')||url.pathname==='/api/products/catalogue')json={items:[],total:0,next_cursor:null};
   else if(url.pathname==='/api/subscriptions/current')json={plan,can_manage:false,addons:{offers:[],purchases:[]}};
   return route.fulfill({json});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.routeWebSocket('**/*',socket=>socket.close());
  await page.goto(base+'/dapuros/app/pos');
  await page.getByTestId('table-card-table').click();
  const open=page.getByTestId('reservation-open');await open.waitFor();
  if(plan==='business') {
   assert.equal(await open.isEnabled(),true);await open.click();
   await page.getByTestId('reservation-name').fill('Reservation verification');
   assert.equal(await page.getByTestId('reservation-save').isEnabled(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
   await page.screenshot({path:`${out}/business-${width}.png`,fullPage:true});
   await page.getByTestId('reservation-modal').getByRole('button',{name:'Batal',exact:true}).click();
  } else {assert.equal(await open.isDisabled(),true);assert.match(await open.textContent(),/Business/);}
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  checks.push({width,plan,status:'passed',apiFixture:true,productionWrites:0});await context.close();
 }
 const page=await browser.newPage();await page.goto(base+'/dapuros/pricing');
 assert.match(await page.locator('#plan-business').textContent(),/Reservasi meja atas nama pelanggan/);
 for(const plan of ['starter','pro'])assert.doesNotMatch(await page.locator('#plan-'+plan).textContent(),/Reservasi meja atas nama pelanggan/);
 const result={status:'passed',base,verifiedAt:new Date().toISOString(),checks,businessOnlyPricing:true,productionWrites:0};
 writeFileSync(`${out}/verification.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
} finally {await browser.close();}
