import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public/subscription-pricing.js',import.meta.url),'utf8');
const reader=source.match(/^const readToken = [\s\S]*?;\r?\n/m)?.[0];
assert.ok(reader,'Pricing must resolve the product session before making authenticated requests');
for(const module of ['dapuros','geraina']) {
 const other=module==='dapuros'?'geraina':'dapuros';
 const read=values=>vm.runInNewContext(reader+'readToken()',{module,localStorage:{getItem:key=>values[key]||null}});
 test(`${module} pricing uses its own account before any legacy suite alias`,()=>{
  assert.equal(read({[`${module}_token`]:'own','dagangos_token':'legacy',[`${other}_token`]:'other'}),'own');
 });
 test(`${module} pricing honors explicit sign-out while the companion remains signed in`,()=>{
  assert.equal(read({[`${module}_signed_out`]:'1','dagangos_token':'legacy',[`${other}_token`]:'other'}),undefined);
 });
 test(`${module} pricing can validate a legacy suite login before the first product sign-in`,()=>{
  assert.equal(read({[`${other}_token`]:'shared-login'}),'shared-login');
 });
}
