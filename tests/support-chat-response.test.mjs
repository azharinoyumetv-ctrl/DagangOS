import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.js';

const diagnostic = '⚠️ Provider authentication failed: No access token found for Nous Portal login. Run `hermes model` to re-authenticate.';
const secrets = 'Invalid API key sk-not-a-real-key-but-must-not-leak123';
const request = (surface = 'geraina', message = 'halo') => new Request('https://dagangos.com/api/support-chat', {
  method: 'POST', headers: {'Content-Type':'application/json', Referer:`https://dagangos.com/${surface === 'dagangos' ? '' : surface}`},
  body: JSON.stringify({surface, message, conversationId:'test-private-errors'}),
});

async function withProvider(response, run) {
  const saved = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url,'https://wmp.dagangos.com/api/support-chat');
    assert.ok(options.signal, 'Provider requests have a bounded timeout');
    if(response instanceof Error)throw response;
    return response.clone();
  };
  try {await run();} finally {globalThis.fetch=saved;}
}

async function assertUnavailable(surface, status = 503) {
  const response=await worker.fetch(request(surface),{},{}),body=await response.json();
  assert.equal(response.status,status);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal(response.headers.get('X-DagangOS-Scope'),surface);
  assert.equal(body.code,status===429?'support_rate_limited':'support_unavailable');
  const publicText=JSON.stringify(body);
  assert.doesNotMatch(publicText,/nous|hermes|token|api key|sk-not|traceback|ECONNREFUSED/i);
  if(status===503){
    assert.match(body.error,/Asisten otomatis sedang tidak tersedia/);
    assert.ok(body.error.includes(surface==='dagangos'?'https://dagangos.com/kontak':`https://dagangos.com/${surface}#kontak`));
  }
}

test('HTTP 200 provider login warnings never become public replies on any product',async()=>{
  for(const surface of ['geraina','dapuros','dagangos']){
    await withProvider(Response.json({reply:diagnostic}),()=>assertUnavailable(surface));
  }
});

test('provider failures and malformed success payloads fail closed',async()=>{
  for(const payload of [
    {result:diagnostic}, {reply:secrets}, {reply:'⚠️ A future provider diagnostic not known to this website'},
    {error:{message:secrets},reply:'Looks successful'}, {success:false,reply:'Looks successful'},
    {available:false,reply:'Looks successful'}, {reply:''}, {reply:{text:diagnostic}}, null,
  ])await withProvider(Response.json(payload),()=>assertUnavailable('geraina'));
  await withProvider(new Response('<html>Internal traceback and private diagnostics</html>'),()=>assertUnavailable('dapuros'));
});

test('upstream HTTP and network errors never forward private error bodies',async()=>{
  for(const status of [401,403,429,500,502,503]){
    await withProvider(Response.json({error:diagnostic+' '+secrets},{status}),()=>assertUnavailable('dapuros',status===429?429:503));
  }
  await withProvider(new Error('ECONNREFUSED private-host '+secrets),()=>assertUnavailable('geraina'));
  await withProvider(new DOMException('Private timeout detail','TimeoutError'),()=>assertUnavailable('dagangos'));
});

test('ordinary product replies remain available and local guidance does not depend on the provider',async()=>{
  const reply='Anda dapat mengelola transaksi dan persediaan dalam sistem yang sama.';
  await withProvider(Response.json({reply}),async()=>{
    const response=await worker.fetch(request(),{},{});
    assert.equal(response.status,200);assert.equal((await response.json()).reply,reply);
  });
  const saved=globalThis.fetch;globalThis.fetch=()=>{throw Error('Local guidance must not call the provider');};
  try{
    for(const surface of ['geraina','dapuros']){
      const response=await worker.fetch(request(surface,'Apa saja fitur produk ini?'),{},{});
      assert.equal(response.status,200);assert.match((await response.json()).reply,/mencakup/);
    }
  }finally{globalThis.fetch=saved;}
});
