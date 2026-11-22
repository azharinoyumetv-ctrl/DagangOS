import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
for (const product of ['geraina','dapuros']) {
 const entries=JSON.parse(await readFile(`public/product-media/${product}.json`,'utf8')); const ids=new Set();
 for (const item of entries) {
  for (const key of ['id','productId','type','src','headline','description','alt','locale','order','device','featureId','status']) assert.ok(item[key]!==undefined && item[key]!=='',`${product}: missing ${key}`);
  assert.equal(item.productId,product); assert.ok(!ids.has(item.id),`duplicate ${item.id}`);ids.add(item.id);
  if(item.status!=='published')continue;
  assert.ok(item.src.startsWith('/')&&!item.src.includes('..'));const bytes=await readFile(join('public',item.src));
  if(item.type==='image' && item.src.endsWith('.png')) {assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20);assert.ok(w>=320&&h>=320,`${item.id}: image too small`);console.log(`${item.id}: ${w}x${h} PNG`);}
 }
}
