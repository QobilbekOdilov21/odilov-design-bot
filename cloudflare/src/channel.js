import { esc } from './constants.js';
import { send } from './telegram.js';

function channelHandle(env) {
  const raw = String(env.CHANNEL_USERNAME || '').replace(/^@/, '').trim();
  if (raw) return raw.toLowerCase();
  const match = String(env.PORTFOLIO_URL || '').match(/^https?:\/\/(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]+)/);
  return (match?.[1] || 'odilovstudio').toLowerCase();
}

export async function startPublish(ctx, userId) {
  if (!(await ctx.db.isAdmin(userId,ctx.ownerId)))
    return send(ctx.api,userId,'⛔ Faqat admin kanalga post joylay oladi.');
  await ctx.db.clearSession(userId);
  await ctx.db.setSession(userId,'publish_post');
  return send(ctx.api,userId,
    '📢 <b>Kanalga post joylash</b>\n\n' +
    'Matn, rasm, video yoki hujjatni shu chatga yuboring. ' +
    'Bot uni @'+esc(channelHandle(ctx.env))+' kanaliga chiqaradi.\n\n/cancel — bekor qilish.');
}

export async function publishChannelMessage(ctx,msg) {
  const user=msg?.from?.id;
  if (!user || !(await ctx.db.isAdmin(user,ctx.ownerId))) {
    if (user) await ctx.db.clearSession(user);
    return;
  }
  if (!msg.message_id || !msg.chat?.id)
    return send(ctx.api,user,'Xabarni qayta yuboring.');
  if (!(String(msg.text||'').trim() || msg.photo?.length || msg.video ||
        msg.document || msg.animation || msg.audio))
    return send(ctx.api,user,'Faqat matn, rasm, video, audio yoki fayl yuboring. /cancel — bekor qilish.');

  let copied;
  try {
    copied=await ctx.api('copyMessage',{
      chat_id:'@'+channelHandle(ctx.env),from_chat_id:msg.chat.id,message_id:msg.message_id
    });
    if (!Number.isSafeInteger(copied?.message_id))
      throw Error('Kanal xabar IDsi qaytmadi');
  } catch(error) {
    console.error('Channel publish API failed',error?.name||'error');
    return send(ctx.api,user,
      '❌ Kanalga yuborilmadi. Botning Post Messages huquqini va kanal manzilini tekshiring.\n' +
      esc(String(error?.message||'Telegram xatosi').slice(0,160)));
  }
  await ctx.db.clearSession(user).catch(()=>{});
  const link='https://t.me/'+channelHandle(ctx.env)+'/'+copied.message_id;
  return send(ctx.api,user,'✅ <b>Post kanalga chiqarildi.</b>\n\n'+esc(link)).catch(()=>{});
}

export async function checkChannelPermissions(ctx,adminId) {
  if (!(await ctx.db.isAdmin(adminId,ctx.ownerId)))
    return send(ctx.api,adminId,'⛔ Ruxsat yo‘q.');
  const handle=channelHandle(ctx.env);
  let chat,bot,member;
  try {
    chat=await ctx.api('getChat',{chat_id:'@'+handle});
    bot=await ctx.api('getMe');
    member=await ctx.api('getChatMember',{chat_id:chat.id,user_id:bot.id});
  } catch(error) {
    return send(ctx.api,adminId,'⚠️ Kanal yoki bot ruxsatlarini tekshirib bo‘lmadi.\n'+
      esc(String(error?.message||'Telegram API xatosi').slice(0,240)));
  }
  const status=member?.status||'unknown';
  const canPost=status==='creator'||member?.can_post_messages===true;
  return send(ctx.api,adminId,
    '🔍 <b>Kanal tekshiruvi</b>\n\nKanal: @'+esc(handle)+
    '\nKanal ID: <code>'+esc(chat.id)+'</code>'+
    '\nBot: @'+esc(bot.username||'unknown')+
    '\nBot holati: <b>'+esc(status)+'</b>'+
    '\nPost joylash: '+(canPost?'✅ Berilgan':'❌ Berilmagan'));
}
