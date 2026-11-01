import test from 'node:test';
import assert from 'node:assert/strict';
import { dbFixture,fakeApi,fakeEnv,msg,cb } from './support.mjs';
import { handleUpdate } from '../src/bot.js';
import { isValidTransition,esc } from '../src/constants.js';
import worker from '../src/index.js';

async function setup(){const d=dbFixture(),a=fakeApi(),env=fakeEnv(d.db);return {...d,...a,env,send:u=>handleUpdate(env,u,a.api,d.store)};}
async function createOrder(ctx,user=222){
  await ctx.send(msg(user,'/start'));
  await ctx.send(cb(user,'nav:new'));
  await ctx.send(cb(user,'svc:logo'));
  await ctx.send(msg(user,'Coffee House'));
  await ctx.send(msg(user,'Modern minimal coffee logo in black and red'));
  await ctx.send(cb(user,'skip:files'));
  await ctx.send(cb(user,'skip:deadline'));
  await ctx.send(cb(user,'skip:budget'));
  await ctx.send(cb(user,'skip:contact'));
  await ctx.send(cb(user,'nav:confirm'));
  return ctx.store.order(1);
}

test('HTML encoding stops user supplied HTML injection',()=>{
  assert.equal(esc('<img src="x"> & hello'), '&lt;img src=&quot;x&quot;&gt; &amp; hello');
});
test('owner privileges protected, random user denied',async()=>{
  const x=await setup();await x.send(msg(111,'/start'));await x.send(msg(222,'/start'));
  assert.equal(await x.store.isAdmin(111,111),true);
  assert.equal(await x.store.isAdmin(222,111),false);
  await x.send(cb(222,'adm:home'));
  assert.match(x.log.at(-2)?.params?.text||'',/Ruxsat|huquqi/);
});
test('full customer order wizard creates one durable order',async()=>{
  const x=await setup();let order=await createOrder(x);
  assert.equal(order.title,'Coffee House');assert.equal(order.status,'new');
  assert.equal((await x.store.userOrders(222)).length,1);
  assert.equal(await x.store.draft(222),null);
  assert.ok(x.log.some(e=>e.method==='sendMessage'&&e.params.chat_id===111&&String(e.params.text).includes('YANGI BUYURTMA')));
  await x.send(cb(222,'nav:confirm'));
  assert.equal((await x.store.userOrders(222)).length,1);
});
test('unauthorized admin cannot add admins',async()=>{
  const x=await setup();await x.send(msg(111,'/start'));await x.send(msg(222,'/start'));
  await x.send(cb(222,'adm:add'));
  assert.equal(await x.store.session(222),null);
  assert.equal(await x.store.isAdmin(222,111),false);
});
test('owner can add admin after target starts bot and revoke privileges',async()=>{
  const x=await setup();await x.send(msg(111,'/start'));await x.send(msg(222,'/start'));
  await x.send(cb(111,'adm:add'));await x.send(msg(111,'222'));
  assert.equal(await x.store.isAdmin(222,111),true);
  await x.send(cb(111,'adm:rmok:222'));
  assert.equal(await x.store.isAdmin(222,111),false);
  assert.equal(await x.store.isAdmin(111,111),true);
});
test('unknown recipient cannot be added as admin',async()=>{
  const x=await setup();await x.send(msg(111,'/start'));await x.send(cb(111,'adm:add'));
  await x.send(msg(111,'999'));assert.equal(await x.store.isAdmin(999,111),false);
  assert.equal((await x.store.session(111)).action,'addadmin');
});
test('status transition rules and customer notification',async()=>{
  const x=await setup();await createOrder(x);
  assert.equal(isValidTransition('new','completed'),false);
  await x.send(cb(111,'adm:status:1:completed'));assert.equal((await x.store.order(1)).status,'new');
  await x.send(cb(111,'adm:status:1:accepted'));assert.equal((await x.store.order(1)).status,'accepted');
  await x.send(cb(111,'adm:status:1:in_progress'));await x.send(cb(111,'adm:status:1:completed'));
  assert.equal((await x.store.order(1)).status,'completed');
  assert.ok(x.log.some(e=>e.method==='sendMessage'&&e.params.chat_id===222&&String(e.params.text).includes('Tayyor')));
});
test('assignment only to authorized admin and note persisted',async()=>{
  const x=await setup();await createOrder(x);await x.send(cb(111,'adm:assignok:1:999'));
  assert.equal((await x.store.order(1)).assignee_id,null);
  await x.send(cb(111,'adm:assignok:1:111'));
  assert.equal((await x.store.order(1)).assignee_id,111);
  await x.send(cb(111,'adm:note:1'));await x.send(msg(111,'Priority client'));
  assert.equal((await x.store.order(1)).internal_note,'Priority client');
});
test('admin reply is sent to customer from within bot',async()=>{
  const x=await setup();await createOrder(x);
  await x.send(cb(111,'adm:reply:1'));await x.send(msg(111,'Assalomu alaykum, brief qabul qilindi!'));
  assert.ok(x.log.some(e=>e.method==='sendMessage'&&e.params.chat_id===222&&String(e.params.text).includes('brief qabul qilindi')));
  assert.equal(await x.store.session(111),null);
});
test('price and service toggle are owner-only',async()=>{
  const x=await setup();await x.send(msg(111,'/start'));await x.send(msg(222,'/start'));
  await x.send(cb(222,'adm:toggle:logo'));assert.equal((await x.store.service('logo')).active,1);
  await x.send(cb(111,'adm:toggle:logo'));assert.equal((await x.store.service('logo')).active,0);
  await x.send(cb(111,'adm:price:logo'));await x.send(msg(111,'250 000 so‘mdan'));
  assert.equal((await x.store.service('logo')).price,'250 000 so‘mdan');
});
test('customer cannot view other customers orders',async()=>{
  const x=await setup();await createOrder(x);
  await x.send(msg(333,'/start'));await x.send(cb(333,'usr:order:1'));
  assert.ok(!x.log.some(e=>e.params?.chat_id===333&&String(e.params?.text).includes('Coffee House')));
});
test('privacy deletion cascades orders, assets and drafts',async()=>{
  const x=await setup();await createOrder(x);
  await x.send(cb(222,'privacy:confirm'));
  assert.equal(await x.store.order(1),null);
  assert.equal((await x.store.userOrders(222)).length,0);
});
test('file attachments persist by Telegram message id',async()=>{
  const x=await setup();await x.send(msg(222,'/start'));await x.send(cb(222,'nav:new'));
  await x.send(cb(222,'svc:logo'));await x.send(msg(222,'New logo'));await x.send(msg(222,'Really interesting project for logo'));
  await x.send({update_id:44,message:{message_id:17,from:{id:222,first_name:'Client'},chat:{id:222,type:'private'},photo:[{file_id:'photo-123'}]}});
  await x.send(cb(222,'skip:files'));await x.send(cb(222,'skip:deadline'));
  await x.send(cb(222,'skip:budget'));await x.send(cb(222,'skip:contact'));await x.send(cb(222,'nav:confirm'));
  const f=await x.store.orderAssets(1);assert.equal(f.length,1);assert.equal(f[0].original_message_id,17);
});
test('duplicate webhook update id is rejected by D1',async()=>{
  const x=await setup();assert.equal(await x.store.claimUpdate(100),true);
  assert.equal(await x.store.claimUpdate(100),false);
  await x.store.unclaimUpdate(100);assert.equal(await x.store.claimUpdate(100),true);
});
test('webhook rejects unauthorized requests, bad JSON and nonexistent pages',async()=>{
  const x=await setup();let r=await worker.fetch(new Request('https://example.workers.dev/'),x.env);assert.equal(r.status,404);
  r=await worker.fetch(new Request('https://example.workers.dev/webhook',{method:'POST',body:'{}'}),x.env);assert.equal(r.status,403);
  r=await worker.fetch(new Request('https://example.workers.dev/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':'testing-secret'},body:'not json'}),x.env);assert.equal(r.status,400);
  r=await worker.fetch(new Request('https://example.workers.dev/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':'testing-secret'},body:'{}'}),x.env);assert.equal(r.status,400);
});
