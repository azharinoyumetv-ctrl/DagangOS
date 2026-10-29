import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {addonSelection,signReceipt,readReceipt,renderSubscriptionPricing,handleSubscriptionCheckout as checkout} from '../src/subscription-checkout.js';
const env={SUBSCRIPTION_SIGNING_KEY:'addon-contract-only',XENDIT_SECRET_KEY:'local-only',XENDIT_WEBHOOK_TOKEN:'local-only'};
const owner='11111111-1111-4111-8111-111111111111',store='22222222-2222-4222-8222-222222222222';
const paymentUrl='https://checkout.xendit.co/web/addon-fixture';
const choice=(id='extra_device',extra={})=>({...addonSelection('dapuros',id),provider:'xendit',orderId:'DG-dapuros-'+'a'.repeat(32),expires:Date.now()+60000,...extra});
async function submit(cart,form={}){return checkout(new Request('https://dagangos.com/dapuros/checkout',{method:'POST',headers:{Origin:'https://dagangos.com','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({cart:await signReceipt(cart,env.SUBSCRIPTION_SIGNING_KEY),access_token:'addon.contract.account-token-only',...form})}),env);}
function gateway(t,options={}){
 const invoices=[];let claimed=false;
 t.mock.method(globalThis,'fetch',async(address,request)=>{
  const url=new URL(address),body=JSON.parse(request.body||'{}');
  if(url.pathname==='/api/subscriptions/orders'){
   if(options.denied)return Response.json({detail:options.denied},{status:400});
   if(options.pending)return Response.json({detail:{code:'addon_pending',receipt:'existing.signed-reference',message:'Pending checkout'}},{status:409});
   const cart=addonSelection('dapuros',body.addonId);
   return Response.json({owner_id:owner,store_id:store,order_id:body.orderId,...cart,renewalId:body.renewalId||null,base_expires_at:'2027-01-01T00:00:00Z'});
  }
  if(url.pathname.endsWith('/reference'))return Response.json({ok:true});
  if(url.pathname.endsWith('/invoice-claim')){const result=!claimed;claimed=true;return Response.json({claimed:result});}
  assert.equal(url.origin,'https://api.xendit.co');assert.equal(url.pathname,'/v2/invoices');invoices.push(body);
  return Response.json({external_id:body.external_id,amount:body.amount,currency:'IDR',invoice_url:paymentUrl});
 });
 return invoices;
}
test('both add-ons have signed monthly selections with the required tier and fixed price',async()=>{
 assert.equal(addonSelection('dapuros','extra_device').amount,49000);assert.equal(addonSelection('dapuros','extra_outlet').amount,199000);
 assert.equal(addonSelection('unknown','extra_device'),null);assert.equal(addonSelection('dapuros','extra_device','yearly'),null);
 for(const id of ['extra_device','extra_outlet']){
  const cart=choice(id);assert.deepEqual(await readReceipt(await signReceipt(cart,env.SUBSCRIPTION_SIGNING_KEY),env.SUBSCRIPTION_SIGNING_KEY),cart);
  const invalid={...cart,amount:1};assert.equal(await readReceipt(await signReceipt(invalid,env.SUBSCRIPTION_SIGNING_KEY),env.SUBSCRIPTION_SIGNING_KEY),null);
 }
});
test('quote confirmation makes no invoice and repeated confirmation makes only one',async t=>{
 const invoices=gateway(t),cart=choice();
 const quote=await submit(cart);assert.equal(quote.status,200);assert.match(quote.headers.get('Content-Security-Policy'),/form-action 'self' https:\/\/checkout.xendit.co https:\/\/checkout-staging.xendit.co;/);const html=await quote.text();assert.match(html,/Konfirmasi pembelian add-on/);assert.match(html,/49.000/);assert.match(html,/tanpa penagihan otomatis/);assert.match(html,/2027/);assert.equal(invoices.length,0);
 const paid=await submit(cart,{confirm_addon:'yes'});assert.equal(paid.status,303);assert.equal(paid.headers.get('Location'),paymentUrl);assert.equal(invoices.length,1);assert.equal(invoices[0].amount,49000);assert.match(invoices[0].description,/Device kasir tambahan/);
 const repeat=await submit(cart,{confirm_addon:'yes'});assert.equal(repeat.status,303);assert.match(repeat.headers.get('Location'),/^\/dapuros\/order\?receipt=/);assert.equal(invoices.length,1);
});
test('outlet add-on and renewal bind the correct owner, price and entitlement to the receipt',async t=>{
 const invoices=gateway(t),renewal='DG-dapuros-'+'b'.repeat(32),cart=choice('extra_outlet',{renewalId:renewal});
 const result=await submit(cart,{confirm_addon:'yes'});assert.equal(result.status,303);assert.equal(invoices[0].amount,199000);
 const receipt=new URL(invoices[0].success_redirect_url).searchParams.get('receipt');const bound=await readReceipt(receipt,env.SUBSCRIPTION_SIGNING_KEY);
 assert.deepEqual([bound.kind,bound.addonId,bound.renewalId,bound.ownerId,bound.storeId],['addon','extra_outlet',renewal,owner,store]);
});
test('ineligible plans and existing pending checkouts never create another invoice',async t=>{
 for(const option of [{denied:'Paket Pro aktif diperlukan'},{pending:true}]){
  const invoices=gateway(t,option),result=await submit(choice(),{confirm_addon:'yes'});const html=await result.text();assert.equal(invoices.length,0);
  assert.match(html,option.denied?/Pro aktif/:/Periksa atau lanjutkan/);t.mock.restoreAll();
 }
});
test('anonymous add-on checkout preserves only validated selection through sign-in',async t=>{
 const invoices=gateway(t),result=await submit(choice(),{access_token:''});assert.equal(result.status,303);
 const next=new URL(result.headers.get('Location'),'https://dagangos.com').searchParams.get('next');assert.equal(next,'/dapuros/pricing?period=monthly&addon=extra_device&checkout=1');assert.equal(invoices.length,0);
});
test('pricing renders two signed add-on forms and only three paid package cards',async()=>{
 const html=await renderSubscriptionPricing(await readFile('public/marketing/dapuros-pricing.html','utf8'),'dapuros',new Request('https://dagangos.com/dapuros/pricing'),env);
 assert.doesNotMatch(html,/\{\{[A-Z_]+\}\}/);assert.equal((html.match(/data-addon-id=/g)||[]).length,2);assert.equal((html.match(/class="price-card/g)||[]).length,3);
});
