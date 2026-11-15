import test from 'node:test';import assert from 'node:assert/strict';import {createPayout,getPayout} from '../src/affiliate-payout-provider.js';
const reference='affiliate-11111111-1111-4111-8111-111111111111';
const input={reference,amount:149000,bankCode:'ID_BCA',accountName:'Mitra Test',accountNumber:'0000000000'};
const expected={id:'disb-11111111-1111-4111-8111-111111111111',reference_id:reference,currency:'IDR',amount:149000,status:'ACCEPTED'};

test('provider adapter reuses the approved reference as idempotency key and validates the response',async t=>{
 const real=globalThis.fetch;t.after(()=>{globalThis.fetch=real});const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json(expected)};
 const first=await createPayout('test-key',input);const second=await createPayout('test-key',input);
 assert.equal(first.id,second.id);assert.equal(calls[0].options.headers['idempotency-key'],reference);
 assert.equal(calls[0].options.body,calls[1].options.body);assert.equal(JSON.parse(calls[0].options.body).amount,149000);
 assert.equal((await getPayout('test-key',{id:first.id,reference,amount:149000})).status,'ACCEPTED');
});

test('provider adapter fails closed for mismatched evidence and ambiguous errors',async t=>{
 const real=globalThis.fetch;t.after(()=>{globalThis.fetch=real});
 globalThis.fetch=async()=>Response.json({...expected,amount:1});
 await assert.rejects(()=>createPayout('test-key',input),/did not match/);
 globalThis.fetch=async()=>new Response('',{status:500});
 await assert.rejects(()=>createPayout('test-key',input),/requires reconciliation/);
 await assert.rejects(()=>createPayout('test-key',{...input,accountNumber:'not-a-number'}),/Invalid/);
});
