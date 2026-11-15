import test from 'node:test';import assert from 'node:assert/strict';import {payoutBalance,payoutCanExecute} from '../src/affiliate-payout-policy.js';
const day=86400000;const now=Date.parse('2026-12-25T02:00:00Z');
const acquisitions=Array.from({length:10},(_,i)=>({orderId:`order-${i}`,commission:14900,reversed:0,paidAt:new Date(now-30*day).toISOString()}));
const calc=overrides=>payoutBalance({acquisitions,payouts:[],waitDays:30,asOf:now,...overrides});
test('ten matured Starter referrals reach the threshold only after 30 days',()=>{
 assert.equal(calc().available,149000);assert.equal(calc({asOf:now-1}).available,0);assert.equal(calc({asOf:now-1}).pending,149000);
 assert.equal(payoutCanExecute({balance:calc().available,minimum:149000,payoutDay:25,approved:true,asOf:now}),true);
 assert.equal(payoutCanExecute({balance:134100,minimum:149000,payoutDay:25,approved:true,asOf:now}),false);
 assert.equal(payoutCanExecute({balance:149000,minimum:149000,payoutDay:25,approved:false,asOf:now}),false);
 assert.equal(payoutCanExecute({balance:149000,minimum:149000,payoutDay:25,approved:true,asOf:Date.parse('2026-12-24T16:59:59Z')}),false);
 assert.equal(payoutCanExecute({balance:149000,minimum:149000,payoutDay:25,approved:true,asOf:Date.parse('2026-12-24T17:00:00Z')}),true);
});
test('reversals and reserved or completed payouts reduce available balance without losing debt',()=>{
 const reversed=acquisitions.map((x,i)=>({...x,reversed:i===0?14900:0}));
 const result=calc({acquisitions:reversed,payouts:[{id:'p1',amount:149000,status:'succeeded'},{id:'p2',amount:1000,status:'failed'}]});
 assert.equal(result.available,0);assert.equal(result.carryForward,-14900);
 assert.throws(()=>calc({acquisitions:[acquisitions[0],acquisitions[0]]}),/Duplicate/);
 assert.throws(()=>calc({payouts:[{id:'p1',amount:149000,status:'unknown'}]}),/Unknown/);
});
