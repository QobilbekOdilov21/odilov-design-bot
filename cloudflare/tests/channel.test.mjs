import test from 'node:test';
import assert from 'node:assert/strict';
import { dbFixture, fakeApi, fakeEnv, msg, cb } from './support.mjs';
import { handleUpdate } from '../src/bot.js';

async function setup(){
  const d=dbFixture(),a=fakeApi(),env=fakeEnv(d.db);
  return {...d,...a,env,send:u=>handleUpdate(env,u,a.api,d.store)};
}
test('channel updates do not add comment buttons or save comments',async()=>{
  const x=await setup();
  await x.send({update_id:7100,channel_post:{message_id:42,chat:{id:-1001256789012,type:'channel',username:'odilovstudio'},text:'New design'}});
  assert.equal(x.log.length,0);
  assert.equal(x.sqlite.prepare('SELECT COUNT(*) AS n FROM channel_posts').get().n,0);
});
test('legacy comment links and callbacks cannot create comments',async()=>{
  const x=await setup();
  await x.send(msg(222,'/start c_1'));
  await x.send(cb(222,'c:add:1'));
  await x.send(msg(222,'A comment'));
  assert.equal(x.sqlite.prepare('SELECT COUNT(*) AS n FROM post_comments').get().n,0);
  assert.equal(await x.store.session(222),null);
});
test('old comment session is cleared without saving its text',async()=>{
  const x=await setup();
  await x.send(msg(222,'/start'));
  await x.store.setSession(222,'post_comment',null,{postId:1});
  await x.send(msg(222,'Old comment'));
  assert.equal(await x.store.session(222),null);
  assert.equal(x.sqlite.prepare('SELECT COUNT(*) AS n FROM post_comments').get().n,0);
});
test('admin can still publish posts without comment buttons',async()=>{
  const x=await setup();
  await x.send(msg(111,'/publish'));
  assert.equal((await x.store.session(111)).action,'publish_post');
  await x.send(msg(111,'New portfolio item'));
  const copied=x.log.find(e=>e.method==='copyMessage');
  assert.equal(copied.params.chat_id,'@odilovstudio');
  assert.equal(x.log.some(e=>e.method==='editMessageReplyMarkup'),false);
  assert.equal(await x.store.session(111),null);
});
