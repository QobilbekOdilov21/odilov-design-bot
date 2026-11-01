import test from 'node:test';
import assert from 'node:assert/strict';
import { dbFixture, fakeApi, fakeEnv, msg, cb } from './support.mjs';
import { handleUpdate } from '../src/bot.js';

async function setup(){
  const d=dbFixture(), a=fakeApi(), env=fakeEnv(d.db);
  return {...d,...a,env,send:(update)=>handleUpdate(env,update,a.api,d.store)};
}
function channelPost(username='odilovstudio', messageId=42) {
  return {update_id:7000+messageId,channel_post:{
    message_id:messageId,chat:{id:-1001256789012,type:'channel',username},text:'Yangi dizayn'
  }};
}

test('bot adds comment button to a matching channel post',async()=>{
  const x=await setup();
  await x.send(channelPost());
  const edit=x.log.find(e=>e.method==='editMessageReplyMarkup');
  assert.equal(edit.params.chat_id,-1001256789012);
  assert.equal(edit.params.message_id,42);
  assert.deepEqual(edit.params.reply_markup.inline_keyboard[0],[
    {text:'💬 Izoh qoldirish',url:'https://t.me/odilovstudiobot?start=c_1'}
  ]);
  assert.equal((await x.sqlite.prepare('SELECT count(*) AS n FROM channel_posts').get()).n,1);
});

test('bot ignores unrelated channels and does not duplicate channel post registrations',async()=>{
  const x=await setup();
  await x.send(channelPost('someone_else',55));
  assert.equal(x.log.length,0);
  await x.send(channelPost());
  await x.send(channelPost());
  assert.equal(x.sqlite.prepare('SELECT count(*) AS n FROM channel_posts').get().n,1);
});

test('deep-link creates a public-in-bot thread; customer writes, other users read, admin moderates',async()=>{
  const x=await setup();
  await x.send(channelPost());
  await x.send(msg(222,'/start c_1'));
  assert.match(x.log.at(-1).params.text,/Post #42 izohlari/);
  await x.send(cb(222,'c:add:1'));
  await x.send(msg(222,'Zo\u2018r <b>logo</b>!'));
  assert.equal(x.sqlite.prepare('SELECT COUNT(*) AS n FROM post_comments').get().n,1);
  assert.match(x.log.at(-1).params.text,/&lt;b&gt;logo&lt;\/b&gt;/);
  await x.send(cb(333,'c:view:1:0'));
  assert.match(x.log.findLast(e=>e.method==='editMessageText').params.text,/Zo\u2018r/);
  await x.send(cb(333,'c:del:1:1:0'));
  assert.equal(x.sqlite.prepare('SELECT COUNT(*) AS n FROM post_comments').get().n,1);
  await x.send(cb(111,'c:del:1:1:0'));
  assert.equal(x.sqlite.prepare('SELECT COUNT(*) AS n FROM post_comments').get().n,0);
});

test('comment input length, spam delay and cancel are enforced',async()=>{
  const x=await setup();
  await x.send(channelPost());
  await x.send(msg(222,'/start c_1'));
  await x.send(cb(222,'c:add:1'));
  await x.send(msg(222,'a'));
  assert.equal(x.sqlite.prepare('SELECT COUNT(*) AS n FROM post_comments').get().n,0);
  await x.send(msg(222,'Ajoyib dizayn'));
  await x.send(cb(222,'c:add:1'));
  await x.send(msg(222,'Ikkinchi izoh'));
  assert.equal(x.sqlite.prepare('SELECT COUNT(*) AS n FROM post_comments').get().n,1);
  await x.send(cb(222,'c:cancel:1'));
  assert.equal(await x.store.session(222),null);
});

test('channel post with existing buttons preserves them',async()=>{
  const x=await setup();
  const update=channelPost();
  update.channel_post.reply_markup={inline_keyboard:[[{text:'Kanal',url:'https://t.me/odilovstudio'}]]};
  await x.send(update);
  const buttons=x.log[0].params.reply_markup.inline_keyboard;
  assert.equal(buttons.length,2);
  assert.equal(buttons[0][0].text,'Kanal');
  assert.equal(buttons[1][0].text,'💬 Izoh qoldirish');
});
