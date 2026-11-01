import { esc, isPositiveId } from './constants.js';
import { send, editOrSend } from './telegram.js';

const q = (ctx, sql, ...args) => ctx.db.db.prepare(sql).bind(...args);
const PAGE_SIZE = 5;
const MAX_PAGES = 200;

function channelHandle(env) {
  const raw = String(env.CHANNEL_USERNAME || '').replace(/^@/, '').trim();
  if (raw) return raw.toLowerCase();
  const m = String(env.PORTFOLIO_URL || '').match(/^https?:\/\/(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)/);
  return (m?.[1] || 'odilovstudio').toLowerCase();
}
function botHandle(env) {
  const name = String(env.BOT_USERNAME || 'odilovstudiobot').replace(/^@/, '');
  if (!/^[A-Za-z0-9_]{5,32}$/.test(name)) throw new Error('BOT_USERNAME invalid');
  return name;
}
function postLink(post) {
  return post.channel_username && /^[A-Za-z0-9_]{5,32}$/.test(post.channel_username)
    ? `https://t.me/${post.channel_username}/${post.message_id}`
    : null;
}
function commentsKeyboard(post, page, total, canDelete, items) {
  const kb = [[{ text:'✍️ Izoh yozish', callback_data:`c:add:${post.id}` }]];
  if (canDelete) for (const item of items)
    kb.push([{text:`🗑 #${item.id} izohni o‘chirish`,callback_data:`c:del:${post.id}:${item.id}:${page}`}]);
  const pagination = [];
  if (page > 0) pagination.push({text:'⬅️ Oldingi',callback_data:`c:view:${post.id}:${page-1}`});
  if ((page + 1) * PAGE_SIZE < total && page < MAX_PAGES - 1)
    pagination.push({text:'Keyingi ➡️',callback_data:`c:view:${post.id}:${page+1}`});
  if (pagination.length) kb.push(pagination);
  const url = postLink(post);
  if (url) kb.push([{text:'📢 Kanal postiga qaytish',url}]);
  kb.push([{text:'🏠 Asosiy menyu',callback_data:'nav:home'}]);
  return {inline_keyboard:kb};
}


async function setPostStatus(ctx, postId, status, error = null) {
  await q(ctx,'UPDATE channel_posts SET button_status=?,last_error=? WHERE id=?',status,error,postId).run();
}
function matchingChannel(env, chat) {
  return chat?.type==='channel' && String(chat.username||'').toLowerCase()===channelHandle(env);
}
export async function handleChannelPost(ctx, msg, { force = false } = {}) {
  if (!matchingChannel(ctx.env,msg.chat) || !Number.isSafeInteger(msg.chat.id) ||
      !Number.isSafeInteger(msg.message_id) || msg.message_id <= 0) return {skipped:true};
  await q(ctx,`INSERT OR IGNORE INTO channel_posts(chat_id,message_id,channel_username)
    VALUES(?,?,?)`,msg.chat.id,msg.message_id,msg.chat.username).run();
  const post=await q(ctx,'SELECT * FROM channel_posts WHERE chat_id=? AND message_id=?',
    msg.chat.id,msg.message_id).first();
  if (!post) throw Error('Channel post could not be saved');
  if (post.button_status==='ready' && !force) return {ok:true,alreadyAdded:true};

  const existing=Array.isArray(msg.reply_markup?.inline_keyboard) ? msg.reply_markup.inline_keyboard : [];
  const marker=`https://t.me/${botHandle(ctx.env)}?start=c_${post.id}`;
  const rows=existing
    .map(row=>row.filter(button=>button.url!==marker))
    .filter(row=>row.length).slice(0,7);
  rows.push([{text:'💬 Izoh qoldirish',url:marker}]);

  let lastError=null;
  for (const delay of [0,800,1800]) {
    if (delay) await new Promise(resolve=>setTimeout(resolve,delay));
    try {
      await ctx.api('editMessageReplyMarkup',{
        chat_id:msg.chat.id,message_id:msg.message_id,
        reply_markup:{inline_keyboard:rows}
      });
      await setPostStatus(ctx,post.id,'ready');
      return {ok:true,postId:post.id};
    } catch(error) {
      lastError=String(error?.message||error).slice(0,180);
      if (/message is not modified/i.test(lastError)) {
        await setPostStatus(ctx,post.id,'ready');
        return {ok:true,alreadyAdded:true};
      }
      if (!/(Too Many Requests|retry after|HTTP 429|HTTP 5\d\d|message to edit not found)/i.test(lastError))
        break;
    }
  }
  await setPostStatus(ctx,post.id,'failed',lastError);
  console.error('Channel comment button failed',msg.chat.id,msg.message_id,lastError);
  // Do not retry a permanently uneditable post indefinitely. Admin can repair it via /fixpost.
  return {ok:false,postId:post.id,reason:lastError};
}

export async function listChannelPostStatus(ctx, adminId) {
  if (!(await ctx.db.isAdmin(adminId,ctx.ownerId))) return send(ctx.api,adminId,'⛔ Ruxsat yo‘q.');
  const rows=(await q(ctx,'SELECT * FROM channel_posts ORDER BY id DESC LIMIT 10').all()).results;
  const lines=rows.map(p=>{
    const status=p.button_status==='ready'?'✅':p.button_status==='failed'?'❌':'⏳';
    const link=postLink(p);
    return `${status} Post #${p.message_id}${link ? ' · '+esc(link) : ''}`+
      (p.button_status==='failed'? `\n⚠️ ${esc(p.last_error||'Telegram API xatosi')}` : '');
  });
  return send(ctx.api,adminId,'📢 <b>Kanal izoh tugmalari</b>\n\n'+
    (lines.join('\n\n')||'Hozircha kanal posti qayd etilmagan.')+
    '\n\nTugma chiqmagan post ID sini /fixpost 123 orqali qayta ishlating.');
}

export async function repairPost(ctx,adminId,postMessageId) {
  if (!(await ctx.db.isAdmin(adminId,ctx.ownerId))) return send(ctx.api,adminId,'⛔ Ruxsat yo‘q.');
  if (!isPositiveId(postMessageId)) return send(ctx.api,adminId,'Masalan: /fixpost 123 — kanal postining ID si.');
  const channel=await q(ctx,'SELECT chat_id,channel_username FROM channel_posts ORDER BY id DESC LIMIT 1').first();
  if (!channel) return send(ctx.api,adminId,'Avval bot kanalga post admini qilib qo‘shilishi va kamida bitta yangi postni olishi kerak.');
  const result=await handleChannelPost(ctx,{
    chat:{type:'channel',id:channel.chat_id,username:channel.channel_username},
    message_id:Number(postMessageId)
  },{force:true});
  if (result.ok) return send(ctx.api,adminId,`✅ Kanal posti #${postMessageId} uchun izoh tugmasi qo‘shildi.`);
  return send(ctx.api,adminId,`❌ Post #${postMessageId}: ${esc(result.reason||'Tugma qo‘shilmadi')}.\n\nBotning Edit messages huquqini tekshiring.`);
}

export async function showPostComments(ctx, userId, postId, callback=null, page=0) {
  if (!isPositiveId(postId)) return send(ctx.api,userId,'Post ID noto‘g‘ri.');
  const post = await q(ctx,'SELECT * FROM channel_posts WHERE id=?',postId).first();
  if (!post) return callback
    ? editOrSend(ctx.api,callback,'Bu post topilmadi.') : send(ctx.api,userId,'Bu post topilmadi.');
  const offset = Math.max(0,Math.min(MAX_PAGES - 1,Math.floor(Number(page)||0))) * PAGE_SIZE;
  const currPage = Math.floor(offset/PAGE_SIZE);
  const counts = await q(ctx,'SELECT COUNT(*) AS n FROM post_comments WHERE post_id=?',postId).first();
  const total=counts?.n||0;
  const items=(await q(ctx,`SELECT c.id,c.text,u.name,u.username FROM post_comments c
    JOIN users u ON u.id=c.user_id WHERE c.post_id=? ORDER BY c.id DESC LIMIT ? OFFSET ?`,
    postId,PAGE_SIZE,offset).all()).results;
  const visible=items.map(item=>
    `<b>#${item.id} · ${esc(item.name)}</b>\n${esc(item.text)}`).join('\n\n');
  const title=`💬 <b>Post #${post.message_id} izohlari</b>\nJami: ${total}\n\n`;
  const message=title+(visible||'Hali izoh yo‘q. Birinchi bo‘lib izoh qoldiring.');
  const admin=await ctx.db.isAdmin(userId,ctx.ownerId);
  const markup=commentsKeyboard(post,currPage,total,admin,items);
  return callback ? editOrSend(ctx.api,callback,message,markup) : send(ctx.api,userId,message,markup);
}

export async function handleCommentCallback(ctx, data, callback) {
  const [,action,id,extra,pageRaw]=data.split(':');
  const user=callback.from.id;
  if (!isPositiveId(id)) return;
  const postId=Number(id);
  if (action==='view') return showPostComments(ctx,user,postId,callback,Number(extra)||0);
  if (action==='cancel') {
    const session=await ctx.db.session(user);
    if (session?.action==='post_comment') await ctx.db.clearSession(user);
    return showPostComments(ctx,user,postId,callback);
  }
  if (action==='add') {
    const exists=await q(ctx,'SELECT id FROM channel_posts WHERE id=?',postId).first();
    if (!exists) return editOrSend(ctx.api,callback,'Post topilmadi.');
    await ctx.db.setSession(user,'post_comment',null,{postId});
    return editOrSend(ctx.api,callback,
      '✍️ <b>Izohingizni yozing</b>\n2–600 belgili matn yuboring. /cancel — bekor qilish.',
      {inline_keyboard:[[{text:'❌ Bekor qilish',callback_data:`c:cancel:${postId}`}]]});
  }
  if (action==='del') {
    if (!(await ctx.db.isAdmin(user,ctx.ownerId))) return editOrSend(ctx.api,callback,'⛔ Ruxsat yo‘q.');
    if (!isPositiveId(extra)) return;
    await q(ctx,'DELETE FROM post_comments WHERE id=? AND post_id=?',Number(extra),postId).run();
    return showPostComments(ctx,user,postId,callback,Number(pageRaw)||0);
  }
}

export async function handleCommentText(ctx, msg, session) {
  const user=msg.from.id, postId=Number(session?.data?.postId);
  const text=String(msg.text || '').trim();
  if (!isPositiveId(postId)) {
    await ctx.db.clearSession(user);
    return send(ctx.api,user,'Izoh sessiyasi eskirgan. /start yuboring.');
  }
  if (text.length<2 || text.length>600)
    return send(ctx.api,user,'Izoh 2–600 belgidan iborat matn bo‘lsin. /cancel — bekor qilish.');
  const post=await q(ctx,'SELECT id FROM channel_posts WHERE id=?',postId).first();
  if (!post) {
    await ctx.db.clearSession(user);
    return send(ctx.api,user,'Kanal posti topilmadi.');
  }
  const count=await q(ctx,'SELECT COUNT(*) AS n FROM post_comments WHERE post_id=? AND user_id=?',postId,user).first();
  if (count.n>=5) {
    await ctx.db.clearSession(user);
    return send(ctx.api,user,'Bu postga eng ko‘pi bilan 5 ta izoh yozishingiz mumkin.');
  }
  const recent=await q(ctx,`SELECT id FROM post_comments WHERE post_id=? AND user_id=?
    AND created_at > datetime('now','-30 seconds') LIMIT 1`,postId,user).first();
  if (recent) return send(ctx.api,user,'Bir postga ketma-ket izoh yuborishdan oldin 30 soniya kuting.');
  await q(ctx,'INSERT INTO post_comments(post_id,user_id,text) VALUES(?,?,?)',postId,user,text).run();
  await ctx.db.clearSession(user);
  return showPostComments(ctx,user,postId);
}
