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


test('every successive channel post gets its own comment button',async()=>{
  const x=await setup();
  await x.send(channelPost('odilovstudio',42));
  await x.send(channelPost('odilovstudio',43));
  await x.send(channelPost('odilovstudio',44));
  const edits=x.log.filter(e=>e.method==='editMessageReplyMarkup');
  assert.equal(edits.length,3);
  assert.deepEqual(edits.map(e=>e.params.message_id),[42,43,44]);
  assert.deepEqual(edits.map(e=>e.params.reply_markup.inline_keyboard.at(-1)[0].url),[
    'https://t.me/odilovstudiobot?start=c_1',
    'https://t.me/odilovstudiobot?start=c_2',
    'https://t.me/odilovstudiobot?start=c_3'
  ]);
  assert.deepEqual(x.sqlite.prepare('SELECT button_status FROM channel_posts ORDER BY id').all().map(v=>v.button_status),
    ['ready','ready','ready']);
});

test('Telegram edit failure is visible to admins and can be repaired by post number',async()=>{
  const x=await setup();
  const calls=[];
  let fail=true;
  const api=async(method,params)=>{
    calls.push({method,params});
    if(method==='editMessageReplyMarkup' && fail)throw Error("editMessageReplyMarkup: Bad Request: message can't be edited");
    return {message_id:1};
  };
  await handleUpdate(x.env,channelPost('odilovstudio',42),api,x.store);
  assert.equal(x.sqlite.prepare('SELECT button_status FROM channel_posts WHERE message_id=42').get().button_status,'failed');
  await handleUpdate(x.env,msg(111,'/posts'),api,x.store);
  assert.match(calls.at(-1).params.text,/message can&#39;t be edited/);
  fail=false;
  await handleUpdate(x.env,msg(111,'/fixpost 42'),api,x.store);
  assert.equal(x.sqlite.prepare('SELECT button_status FROM channel_posts WHERE message_id=42').get().button_status,'ready');
  assert.ok(calls.some(c=>c.method==='sendMessage'&&c.params.text.includes('izoh tugmasi qo')));
});

test('edited channel post reattempts failed comment markup but ignores already attached buttons',async()=>{
  const x=await setup();
  let blocked=true,edits=0;
  const api=async(method)=>{
    if(method==='editMessageReplyMarkup') {
      edits++;
      if(blocked)throw Error('editMessageReplyMarkup: Bad Request: message cannot be edited');
    }
    return {message_id:1};
  };
  await handleUpdate(x.env,channelPost('odilovstudio',50),api,x.store);
  assert.equal(edits,1);
  blocked=false;
  await handleUpdate(x.env,{
    update_id:8001,edited_channel_post:channelPost('odilovstudio',50).channel_post
  },api,x.store);
  assert.equal(edits,2);
  assert.equal(x.sqlite.prepare('SELECT button_status FROM channel_posts WHERE message_id=50').get().button_status,'ready');
  await handleUpdate(x.env,{
    update_id:8002,edited_channel_post:channelPost('odilovstudio',50).channel_post
  },api,x.store);
  assert.equal(edits,2);
});


test('channel permission diagnosis shows actual Telegram edit rights and channel identity',async()=>{
  const x=await setup();
  await x.send(channelPost());
  const api=async(method,params)=>{
    if(method==='getChat')return {id:-1001256789012,type:'channel',username:'odilovstudio'};
    if(method==='getMe')return {id:99,username:'odilovstudiobot'};
    if(method==='getChatMember')return {status:'administrator',can_edit_messages:false,can_post_messages:true};
    if(method==='sendMessage') {
      assert.equal(params.chat_id,111);
      assert.match(params.text,/Xabarlarni tahrirlash: ❌ Berilmagan/);
      assert.match(params.text,/Qayd etilgan postlarning kanal IDsi: ✅ Bir xil/);
      return {message_id:5};
    }
    throw Error('Unexpected '+method);
  };
  await handleUpdate(x.env,msg(111,'/checkchannel'),api,x.store);
});


test('admin /publish posts copied media and attaches comment button to the new channel message',async()=>{
  const x=await setup(), calls=[];
  const api=async(method,params)=>{
    calls.push({method,params});
    if(method==='getChat')return {id:-1001256789012,type:'channel',username:'odilovstudio'};
    if(method==='copyMessage')return {message_id:76};
    return {message_id:calls.length};
  };
  await handleUpdate(x.env,msg(111,'/start'),api,x.store);
  await handleUpdate(x.env,msg(111,'/publish'),api,x.store);
  assert.equal((await x.store.session(111)).action,'publish_post');
  const u=msg(111,undefined,{text:undefined,photo:[{file_id:'test_photo'}]});
  await handleUpdate(x.env,u,api,x.store);
  assert.ok(calls.some(c=>c.method==='copyMessage' && c.params.chat_id===-1001256789012));
  const edit=calls.find(c=>c.method==='editMessageReplyMarkup');
  assert.equal(edit.params.message_id,76);
  assert.equal(edit.params.reply_markup.inline_keyboard[0][0].url,'https://t.me/odilovstudiobot?start=c_1');
  assert.equal(x.sqlite.prepare('SELECT button_status FROM channel_posts WHERE message_id=76').get().button_status,'ready');
  assert.equal(await x.store.session(111),null);
  assert.ok(calls.some(c=>c.method==='sendMessage'&&c.params.text.includes('Post kanalga chiqarildi')));
});

test('non-admin cannot publish, and failed edit does not cause duplicate copied channel post',async()=>{
  const x=await setup(),calls=[];
  const api=async(method,params)=>{
    calls.push({method,params});
    if(method==='getChat')return {id:-1001256789012,type:'channel',username:'odilovstudio'};
    if(method==='copyMessage')return {message_id:87};
    if(method==='editMessageReplyMarkup')throw Error('Bad Request: message to edit not found');
    return {message_id:1};
  };
  await handleUpdate(x.env,msg(222,'/publish'),api,x.store);
  assert.equal(calls.filter(c=>c.method==='copyMessage').length,0);
  await handleUpdate(x.env,msg(111,'/publish'),api,x.store);
  await handleUpdate(x.env,msg(111,'Yangi post'),api,x.store);
  assert.equal(calls.filter(c=>c.method==='copyMessage').length,1);
  assert.equal(x.sqlite.prepare('SELECT button_status FROM channel_posts WHERE message_id=87').get().button_status,'failed');
  assert.equal(await x.store.session(111),null);
  assert.ok(calls.some(c=>c.method==='sendMessage'&&c.params.text.includes('izoh tugmasini')));
});
