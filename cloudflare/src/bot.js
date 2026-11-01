import { Store } from './db.js';
import { esc, clean, MAX_ASSETS, STATUS, isPositiveId } from './constants.js';
import { telegram, send, editOrSend, notifyUser } from './telegram.js';
import * as ui from './ui.js';
import { handleChannelPost, showPostComments, handleCommentCallback, handleCommentText, listChannelPostStatus, repairPost, checkChannelPermissions, startPublish, publishChannelMessage } from './comments.js';

const ownerId = env => Number(env.OWNER_ID);
const userName = u => [u?.first_name,u?.last_name].filter(Boolean).join(' ').slice(0,130) || 'Mijoz';
const messageOf = x => x?.message || null;
const rowsToText = (list) => list.map(s=>`${s.label}: <b>${esc(s.price)}</b>`).join('\n');
const briefPrompt = {
  title: '📝 Loyiha nomini yozing (3–100 belgi).',
  brief: '📄 Dizayn haqida batafsil brief yuboring (kamida 10 belgi).\nRang, o‘lcham, maqsad va qo‘shimcha talablarni ko‘rsating.',
  files: '📎 5 tagacha rasm yoki hujjat yuboring. Tugatgach «Davom etish» tugmasini bosing.',
  deadline: '📅 Tayyor bo‘lish muddatini yozing (masalan: 10-noyabr, 3 kun) yoki o‘tkazib yuboring.',
  budget: '💰 Taxminiy budjetingizni yozing (masalan: 300 000 so‘m) yoki o‘tkazib yuboring.',
  contact: '📞 Telefon, username yoki aloqa usulini yuboring (ixtiyoriy).'
};

async function userMenu(ctx, id) {
  const draft = await ctx.db.draft(id);
  const admin = await ctx.db.isAdmin(id, ctx.ownerId);
  return ui.home(admin, !!draft);
}
async function mainMenu(ctx, id, replyQuery=null) {
  const text = '<b>ODILOV STUDIO</b> — Creative Design 🎨\n\nProfessional grafik dizayn buyurtmalari uchun menyudan bo‘lim tanlang.';
  const kb = await userMenu(ctx, id);
  if (replyQuery) return editOrSend(ctx.api, replyQuery, text, kb);
  return send(ctx.api, id, text, kb);
}
async function startOrder(ctx, id, q=null) {
  await ctx.db.clearSession(id);
  await ctx.db.startDraft(id);
  const s = await ctx.db.services(true);
  const text = s.length ? '<b>🎨 Xizmatni tanlang</b>\nQanday dizayn kerak?' : 'Hozircha buyurtmalar uchun xizmat mavjud emas. Keyinroq urinib ko‘ring.';
  return q ? editOrSend(ctx.api, q, text, s.length?ui.serviceMenu(s):ui.home(false,false)) : send(ctx.api, id, text, s.length?ui.serviceMenu(s):undefined);
}
async function draftPrompt(ctx, id, draft, q=null) {
  if (!draft) return mainMenu(ctx,id,q);
  if (draft.stage === 'service') {
    const services=await ctx.db.services(true);
    return q ? editOrSend(ctx.api,q,'🎨 Xizmatni tanlang:',ui.serviceMenu(services)) : send(ctx.api,id,'🎨 Xizmatni tanlang:',ui.serviceMenu(services));
  }
  if (draft.stage === 'review') return sendReview(ctx,id,q);
  const prompt = briefPrompt[draft.stage] || 'Ma’lumot yuboring.';
  const kb = draft.stage === 'files' ? ui.doneFiles() : ['deadline','budget','contact'].includes(draft.stage) ? ui.skip(draft.stage) : ui.cancel();
  if (q) return editOrSend(ctx.api,q,prompt,kb);
  return send(ctx.api,id,prompt,kb);
}
async function sendReview(ctx,id,q=null) {
  const d=await ctx.db.draft(id);
  if (!d) return mainMenu(ctx,id,q);
  const v=d.data;
  const s=await ctx.db.service(v.service);
  const text='<b>✅ Buyurtmani tekshiring</b>\n\n'+
    `<b>Xizmat:</b> ${esc(s?.label||v.service)}\n`+
    `<b>Loyiha:</b> ${esc(v.title)}\n`+
    `<b>Brief:</b> ${esc(v.brief)}\n`+
    `<b>Referens:</b> ${(v.files||[]).length} ta\n`+
    `<b>Muddat:</b> ${esc(v.deadline||'Belgilanmagan')}\n`+
    `<b>Budjet:</b> ${esc(v.budget||'Kelishiladi')}\n`+
    `<b>Aloqa:</b> ${esc(v.contact||'Telegram')}`;
  return q ? editOrSend(ctx.api,q,text,ui.reviewKb()) : send(ctx.api,id,text,ui.reviewKb());
}
async function advance(ctx, id, stage, data, q=null) {
  await ctx.db.saveDraft(id,stage,data);
  return draftPrompt(ctx,id,await ctx.db.draft(id),q);
}
async function finishOrder(ctx,id,q) {
  const {order,created} = await ctx.db.submitDraft(id);
  if(!order) return editOrSend(ctx.api,q,'Buyurtma allaqachon tasdiqlangan yoki bekor qilingan.',await userMenu(ctx,id));
  await editOrSend(ctx.api,q,`🎉 <b>Buyurtma #${order.id} qabul qilindi!</b>\nMenejerimiz buyurtmani ko‘rib chiqadi. Holatini «Buyurtmalarim» bo‘limidan kuzating.`,await userMenu(ctx,id));
  if(created) {
    const details = await orderDetail(ctx,order,true);
    for(const target of await allAdmins(ctx)) await notifyUser(ctx.api,target,`🔔 <b>YANGI BUYURTMA</b>\n\n${details}`,ui.adminOrder(order));
  }
}
async function allAdmins(ctx) {
  const admins=await ctx.db.admins();
  return [...new Set([ctx.ownerId,...admins.map(a=>Number(a.user_id))])];
}
async function orderDetail(ctx,order,admin=false) {
  const svc=await ctx.db.service(order.service);
  const as=order.assignee_id ? (await ctx.db.getUser(order.assignee_id)) : null;
  return ui.orderText(order,svc,{admin,assigned:as?.name|| (Number(order.assignee_id)===ctx.ownerId?'Bosh admin':'')});
}
async function showCustomerOrders(ctx,id,q=null) {
  const orders=await ctx.db.userOrders(id);
  const t=orders.length?'📋 <b>Sizning buyurtmalaringiz</b>':'Hali buyurtma yo‘q.';
  return q ? editOrSend(ctx.api,q,t,ui.myOrders(orders)) : send(ctx.api,id,t,ui.myOrders(orders));
}
async function showAdmin(ctx, id, q=null) {
  if(!(await ctx.db.isAdmin(id,ctx.ownerId))) return send(ctx.api,id,'⛔ Sizda admin huquqi yo‘q.');
  await ctx.db.clearSession(id);
  const text='🛡 <b>ODILOV STUDIO — Admin panel</b>\n\nBarcha operatsiyalar ushbu Telegram bot ichida bajariladi.';
  return q ? editOrSend(ctx.api,q,text,ui.adminHome()) : send(ctx.api,id,text,ui.adminHome());
}
async function showAdminList(ctx,filter,page,q) {
  if(!['new','accepted','in_progress','completed','cancelled','all','mine'].includes(filter)) return;
  const o=await ctx.db.orders(filter,page,8,q.from.id);
  return editOrSend(ctx.api,q,`📋 <b>Buyurtmalar</b> · ${esc(filter)} · ${page+1}-sahifa`,ui.adminList(o.slice(0,8),filter,page,o.length>8));
}
async function showAdminOrder(ctx,id,q) {
  const o=await ctx.db.order(id);
  if(!o) return editOrSend(ctx.api,q,'Buyurtma topilmadi.',ui.adminHome());
  return editOrSend(ctx.api,q,await orderDetail(ctx,o,true),ui.adminOrder(o));
}
async function showAdmins(ctx,q) {
  const admins=await ctx.db.admins();
  const isOwner=q.from.id===ctx.ownerId;
  let text='👥 <b>Adminlar</b>\n\n'+`👑 Bosh admin · <code>${ctx.ownerId}</code>\n`;
  for(const a of admins) text+=`👤 ${esc(a.name)} · <code>${a.user_id}</code>\n`;
  if(!isOwner) text+='\nFaqat bosh admin adminlarni qo‘shishi/o‘chirishi mumkin.';
  const keyboard=isOwner?ui.adminManage(admins,ctx.ownerId):ui.adminHome();
  return editOrSend(ctx.api,q,text,keyboard);
}
async function showServices(ctx,q) {
  const services=await ctx.db.services();
  return editOrSend(ctx.api,q,'🛠 <b>Xizmatlar va narxlar</b>\nXizmatni tanlang.',ui.adminServices(services));
}
async function showPrices(ctx,id,q=null) {
  const services=await ctx.db.services(true);
  const text='💰 <b>Xizmatlar va narxlar</b>\n\n'+rowsToText(services)+'\n\nAniq narx brief va ish hajmiga bog‘liq.';
  return q?editOrSend(ctx.api,q,text,ui.home(false,false)):send(ctx.api,id,text);
}
async function showStats(ctx,q) {
  const rows=await ctx.db.stats();
  const stats=Object.fromEntries(rows.map(x=>[x.status,x.count]));
  const all=Object.values(stats).reduce((a,b)=>a+b,0);
  const text=`📊 <b>Buyurtmalar statistikasi</b>\n\nJami: <b>${all}</b>\n`+
    Object.entries(STATUS).map(([k,v])=>`${v}: ${stats[k]||0}`).join('\n');
  return editOrSend(ctx.api,q,text,ui.adminHome());
}
async function showAssets(ctx,orderId,q) {
  const files=await ctx.db.orderAssets(orderId);
  if(!files.length) return editOrSend(ctx.api,q,'Ushbu buyurtmada fayl yo‘q.',ui.adminOrder(await ctx.db.order(orderId)));
  for(const f of files) {
    try { await ctx.api('copyMessage',{chat_id:q.from.id,from_chat_id:f.original_chat_id,message_id:f.original_message_id}); }
    catch { await send(ctx.api,q.from.id,`⚠️ Faylni yuborib bo‘lmadi: ${esc(f.file_name||f.media_type)}.`); }
  }
  return send(ctx.api,q.from.id,`📎 Buyurtma #${orderId}: ${files.length} ta referens.`,ui.adminOrder(await ctx.db.order(orderId)));
}
async function handleAdminAction(ctx,action,q) {
  const id=q.from.id;
  if(!(await ctx.db.isAdmin(id,ctx.ownerId))) return editOrSend(ctx.api,q,'⛔ Ruxsat yo‘q.');
  const chunks=action.split(':');
  const name=chunks[0];
  if(name==='home') return showAdmin(ctx,id,q);
  if(name==='list') return showAdminList(ctx,chunks[1],Number(chunks[2]||0),q);
  if(name==='order') return showAdminOrder(ctx,Number(chunks[1]),q);
  if(name==='stats') return showStats(ctx,q);
  if(name==='find') {await ctx.db.setSession(id,'find');return editOrSend(ctx.api,q,'🔎 Buyurtma ID raqamini kiriting.',ui.adminHome());}
  if(name==='services') return showServices(ctx,q);
  if(name==='service') {
    const s=await ctx.db.service(chunks[1]); if(!s)return showServices(ctx,q);
    return editOrSend(ctx.api,q,`<b>${esc(s.label)}</b>\nNarx: ${esc(s.price)}\nHolat: ${s.active?'✅ Faol':'🚫 O‘chirilgan'}`,ui.adminService(s));
  }
  if(name==='price') {
    if(id!==ctx.ownerId) return editOrSend(ctx.api,q,'⛔ Narxlarni faqat bosh admin o‘zgartiradi.');
    const s=await ctx.db.service(chunks[1]); if(!s)return;
    await ctx.db.setSession(id,'price',null,{service:s.code});
    return editOrSend(ctx.api,q,`💰 ${esc(s.label)} uchun yangi narx matnini yuboring (masalan: 250 000 so‘mdan).`,ui.adminService(s));
  }
  if(name==='toggle') {
    if(id!==ctx.ownerId)return editOrSend(ctx.api,q,'⛔ Faqat bosh admin.');
    await ctx.db.toggleService(chunks[1]);return showServices(ctx,q);
  }
  if(name==='admins') return showAdmins(ctx,q);
  if(name==='add') {
    if(id!==ctx.ownerId)return editOrSend(ctx.api,q,'⛔ Faqat bosh admin.');
    await ctx.db.setSession(id,'addadmin');
    return editOrSend(ctx.api,q,'➕ Yangi adminning Telegram raqamli ID sini yuboring. U oldin botga /start yuborgan bo‘lishi kerak.',ui.adminHome());
  }
  if(name==='remove') {
    if(id!==ctx.ownerId || !isPositiveId(chunks[1]) || Number(chunks[1])===id)return;
    return editOrSend(ctx.api,q,`Admin ${chunks[1]} rostdan o‘chirilsinmi?`,ui.adminRemoveConfirm(chunks[1]));
  }
  if(name==='rmok') {
    if(id!==ctx.ownerId || !isPositiveId(chunks[1]) || Number(chunks[1])===id)return;
    const changed=await ctx.db.removeAdmin(Number(chunks[1]));
    if(changed)await notifyUser(ctx.api,Number(chunks[1]),'Sizning ODILOV STUDIO admin huquqingiz olib tashlandi.');
    return showAdmins(ctx,q);
  }
  if(name==='status') {
    const orderId=Number(chunks[1]); const target=chunks[2];
    const order=await ctx.db.changeStatus(orderId,target,id);
    if(!order)return showAdminOrder(ctx,orderId,q);
    await notifyUser(ctx.api,order.customer_id,`📦 Buyurtma <b>#${order.id}</b> statusi: ${STATUS[target]||esc(target)}`);
    return showAdminOrder(ctx,orderId,q);
  }
  if(name==='assign') {
    const orderId=Number(chunks[1]);if(!await ctx.db.order(orderId))return;
    const admins=await ctx.db.admins();
    return editOrSend(ctx.api,q,`👤 Buyurtma #${orderId} uchun mas’ul adminni belgilang.`,ui.assignMenu(orderId,admins,ctx.ownerId));
  }
  if(name==='assignok') {
    const orderId=Number(chunks[1]); const aId=Number(chunks[2]);
    if(aId!==0 && !(await ctx.db.isAdmin(aId,ctx.ownerId)))return editOrSend(ctx.api,q,'Bunday admin mavjud emas.');
    const order=await ctx.db.assign(orderId,aId||null,id);
    if(order && aId) await notifyUser(ctx.api,aId,`👤 Sizga buyurtma #${orderId} biriktirildi.`,ui.adminOrder(order));
    return showAdminOrder(ctx,orderId,q);
  }
  if(name==='reply' || name==='note') {
    const orderId=Number(chunks[1]); if(!await ctx.db.order(orderId))return;
    await ctx.db.setSession(id,name,orderId);
    return editOrSend(ctx.api,q,name==='reply'?`💬 Buyurtma #${orderId} mijoziga yuboriladigan xabarni yozing. (/cancel — bekor qilish)`:`📝 Buyurtma #${orderId} uchun ichki izoh yozing. (/cancel — bekor qilish)`,ui.adminOrder(await ctx.db.order(orderId)));
  }
  if(name==='files') return showAssets(ctx,Number(chunks[1]),q);
  if(name==='history') {
    const orderId=Number(chunks[1]);const rows=await ctx.db.orderHistory(orderId);
    const hist=rows.map(x=>`• ${esc(x.created_at)} · ${esc(x.kind)} · ${esc(x.old_value||'—')} → ${esc(x.new_value||'—')} (ID ${x.actor_id})`).join('\n');
    return editOrSend(ctx.api,q,`📜 <b>Buyurtma #${orderId} tarixi</b>\n\n${hist||'Yozuv yo‘q'}`,ui.adminOrder(await ctx.db.order(orderId)));
  }
}

async function handleCallback(ctx,q) {
  const id=q.from.id; const data=q.data||'';
  if(data.length>64)return;
  if(data.startsWith('c:')) return handleCommentCallback(ctx,data,q);
  if(data.startsWith('adm:')) return handleAdminAction(ctx,data.slice(4),q);
  if(data==='nav:home') return mainMenu(ctx,id,q);
  if(data==='nav:new')return startOrder(ctx,id,q);
  if(data==='nav:resume')return draftPrompt(ctx,id,await ctx.db.draft(id),q);
  if(data==='nav:cancel') {await ctx.db.clearDraft(id);await ctx.db.clearSession(id);return mainMenu(ctx,id,q);}
  if(data==='nav:confirm')return finishOrder(ctx,id,q);
  if(data==='nav:portfolio')return editOrSend(ctx.api,q,`📂 <b>Portfolio</b>\n${esc(ctx.env.PORTFOLIO_URL||'Kanal manzili hozircha kiritilmagan.')}`,await userMenu(ctx,id));
  if(data==='nav:contact')return editOrSend(ctx.api,q,`📞 <b>Bog‘lanish</b>\n${ctx.env.MANAGER_USERNAME?'@'+esc(ctx.env.MANAGER_USERNAME.replace(/^@/,'')):'Bog‘lanish ma’lumotlari sozlanmagan.'}`,await userMenu(ctx,id));
  if(data==='nav:prices')return showPrices(ctx,id,q);
  if(data==='nav:help')return editOrSend(ctx.api,q,'ℹ️ Buyurtma berish uchun xizmatni tanlang, brief va kerakli materiallarni yuboring. /cancel orqali anketa to‘xtatiladi.',await userMenu(ctx,id));
  if(data==='nav:myorders')return showCustomerOrders(ctx,id,q);
  if(data.startsWith('svc:')) {
    const draft=await ctx.db.draft(id); const svc=await ctx.db.service(data.slice(4));
    if(!draft||!svc?.active||draft.stage!=='service')return editOrSend(ctx.api,q,'Buyurtmani qayta boshlang.',await userMenu(ctx,id));
    return advance(ctx,id,'title',{service:svc.code,files:[]},q);
  }
  if(data.startsWith('skip:')) {
    const step=data.slice(5), d=await ctx.db.draft(id);if(!d||d.stage!==step)return;
    const next={files:'deadline',deadline:'budget',budget:'contact',contact:'review'}[step];
    if(!next)return;
    return advance(ctx,id,next,d.data,q);
  }
  if(data.startsWith('usr:order:')) {
    const o=await ctx.db.order(Number(data.slice(10)));
    if(!o||o.customer_id!==id)return editOrSend(ctx.api,q,'Buyurtma topilmadi.');
    return editOrSend(ctx.api,q,await orderDetail(ctx,o),ui.myOrders(await ctx.db.userOrders(id)));
  }
  if(data==='privacy:confirm') {
    await ctx.db.deleteUser(id);
    return editOrSend(ctx.api,q,'🗑 Sizga tegishli ma’lumotlar bot bazasidan o‘chirildi. Admin chatlariga avval yuborilgan xabarlar alohida saqlanishi mumkin.');
  }
  if(data==='privacy:abort')return mainMenu(ctx,id,q);
}
async function handleSession(ctx,msg,session) {
  const id=msg.from.id;const text=clean(msg.text,1500);
  if(!(await ctx.db.isAdmin(id,ctx.ownerId))) {await ctx.db.clearSession(id);return false;}
  if(!text) {await send(ctx.api,id,'Matn yuboring yoki /cancel bosing.');return true;}
  if(session.action==='find') {
    if(!isPositiveId(text)) {await send(ctx.api,id,'Faqat buyurtmaning raqamli ID sini yuboring.');return true;}
    await ctx.db.clearSession(id);
    const o=await ctx.db.order(Number(text));
    return send(ctx.api,id,o?await orderDetail(ctx,o,true):'Buyurtma topilmadi.',o?ui.adminOrder(o):ui.adminHome());
  }
  if(session.action==='addadmin') {
    if(id!==ctx.ownerId) {await ctx.db.clearSession(id);return false;}
    if(!isPositiveId(text)||Number(text)===ctx.ownerId) {await send(ctx.api,id,'To‘g‘ri raqamli ID yuboring (o‘zingiznikini emas).');return true;}
    const ok=await ctx.db.addAdmin(Number(text),id);
    if(!ok) {await send(ctx.api,id,'Foydalanuvchi topilmadi. Avval yangi admin botga /start yuborishi kerak.');return true;}
    await ctx.db.clearSession(id);
    await notifyUser(ctx.api,Number(text),'✅ Siz ODILOV STUDIO botida admin etib tayinlandingiz. /admin menyusidan foydalaning.');
    return send(ctx.api,id,`✅ Admin ${text} qo‘shildi.`,ui.adminHome());
  }
  if(session.action==='price') {
    if(id!==ctx.ownerId) {await ctx.db.clearSession(id);return false;}
    if(text.length>100) {await send(ctx.api,id,'Narx matni 100 belgidan oshmasin.');return true;}
    await ctx.db.setPrice(session.data.service,text);
    await ctx.db.clearSession(id);
    return send(ctx.api,id,'✅ Narx yangilandi.',ui.adminHome());
  }
  const order=await ctx.db.order(session.order_id);
  if(!order) {await ctx.db.clearSession(id);return send(ctx.api,id,'Buyurtma topilmadi.');}
  if(session.action==='note') {
    await ctx.db.note(order.id,text,id);await ctx.db.clearSession(id);
    return send(ctx.api,id,`✅ #${order.id} uchun ichki izoh saqlandi.`,ui.adminOrder(await ctx.db.order(order.id)));
  }
  if(session.action==='reply') {
    // Keep session if user blocked bot: admin can retry /cancel.
    try { await send(ctx.api,order.customer_id,`💬 <b>ODILOV STUDIO</b> · Buyurtma #${order.id}\n\n${esc(text)}`); }
    catch { return send(ctx.api,id,'⚠️ Xabar yetkazilmadi. Mijoz botni bloklagan bo‘lishi mumkin. /cancel yoki qayta yozing.'); }
    await ctx.db.history(order.id,id,'reply',null,'Mijozga xabar yuborildi');
    await ctx.db.clearSession(id);
    return send(ctx.api,id,'✅ Mijozga xabar yuborildi.',ui.adminOrder(order));
  }
  await ctx.db.clearSession(id);return false;
}
async function handleDraftMessage(ctx,msg,draft) {
  const id=msg.from.id;
  const text=clean(msg.text,2000);
  const d=draft.data;
  if(draft.stage==='files') {
    let file;
    if(msg.photo?.length)file={type:'photo',file_id:msg.photo.at(-1).file_id,chat_id:msg.chat.id,message_id:msg.message_id};
    if(msg.document)file={type:'document',file_id:msg.document.file_id,chat_id:msg.chat.id,message_id:msg.message_id,file_name:clean(msg.document.file_name,150)};
    if(!file) {await send(ctx.api,id,'Rasm yoki hujjat yuboring. Yoki «Davom etish» bosing.',ui.doneFiles());return;}
    const files=d.files||[];
    if(files.length>=MAX_ASSETS)return send(ctx.api,id,'Maksimal 5 ta fayl. «Davom etish» tugmasini bosing.',ui.doneFiles());
    files.push(file);d.files=files;
    await ctx.db.saveDraft(id,'files',d);
    return send(ctx.api,id,`✅ ${files.length}/5 ta referens qabul qilindi.`,ui.doneFiles());
  }
  if(!text)return send(ctx.api,id,'Matn yuboring yoki tugmadan foydalaning.');
  if(draft.stage==='title') {
    if(text.length<3||text.length>100)return send(ctx.api,id,'Loyiha nomi 3–100 belgi bo‘lishi kerak.');
    return advance(ctx,id,'brief',{...d,title:text});
  }
  if(draft.stage==='brief') {
    if(text.length<10)return send(ctx.api,id,'Brief kamida 10 ta belgidan iborat bo‘lsin.');
    return advance(ctx,id,'files',{...d,brief:text,files:[]});
  }
  if(draft.stage==='deadline')return advance(ctx,id,'budget',{...d,deadline:text.slice(0,120)});
  if(draft.stage==='budget')return advance(ctx,id,'contact',{...d,budget:text.slice(0,120)});
  if(draft.stage==='contact')return advance(ctx,id,'review',{...d,contact:text.slice(0,150)});
  return draftPrompt(ctx,id,draft);
}
async function handleMessage(ctx,msg) {
  if(msg.chat?.type!=='private'||!msg.from?.id)return;
  const id=msg.from.id;
  const text=String(msg.text||'').trim();
  const cmd=text.split(/\s+/)[0]?.toLowerCase()?.split('@')[0];
  if(cmd==='/start') {
    await ctx.db.clearSession(id);
    const payload=text.split(/\s+/)[1]||'';
    if(/^c_[1-9]\d{0,14}$/.test(payload))return showPostComments(ctx,id,Number(payload.slice(2)));
    return mainMenu(ctx,id);
  }
  if(cmd==='/cancel') {await ctx.db.clearSession(id);await ctx.db.clearDraft(id);return send(ctx.api,id,'❌ Amal bekor qilindi.',await userMenu(ctx,id));}
  if(cmd==='/order')return startOrder(ctx,id);
  if(cmd==='/myorders')return showCustomerOrders(ctx,id);
  if(cmd==='/admin')return showAdmin(ctx,id);
  if(cmd==='/posts')return listChannelPostStatus(ctx,id);
  if(cmd==='/checkchannel')return checkChannelPermissions(ctx,id);
  if(cmd==='/publish')return startPublish(ctx,id);
  if(cmd==='/fixpost')return repairPost(ctx,id,text.split(/\s+/)[1]||'');
  if(cmd==='/stats'&&await ctx.db.isAdmin(id,ctx.ownerId)) {
    const rows=await ctx.db.stats();return send(ctx.api,id,'📊 '+rows.map(r=>`${STATUS[r.status]}: ${r.count}`).join('\n'),ui.adminHome());
  }
  if(cmd==='/prices')return showPrices(ctx,id);
  if(cmd==='/portfolio')return send(ctx.api,id,esc(ctx.env.PORTFOLIO_URL||'Portfolio manzili hali kiritilmagan.'));
  if(cmd==='/help')return send(ctx.api,id,'/order — buyurtma berish\n/myorders — buyurtmalarim\n/admin — admin panel\n/cancel — bekor\n/delete_my_data — ma’lumotlarni o‘chirish');
  if(cmd==='/privacy')return send(ctx.api,id,'🔒 Buyurtma uchun Telegram ID, ism, brief va ixtiyoriy kontakt saqlanadi. Ma’lumotlar D1 bazada turadi. /delete_my_data o‘chiradi. Referens fayl IDlari ham saqlanadi.');
  if(cmd==='/delete_my_data')return send(ctx.api,id,'Barcha buyurtmalaringiz va ma’lumotlaringiz bazadan o‘chirilsinmi? Admin chatlariga yuborilgan eski xabarlar saqlanib qolishi mumkin.',ui.deleteConfirm());
  if(cmd?.startsWith('/'))return send(ctx.api,id,'Noma’lum buyruq. /help');
  const session=await ctx.db.session(id);
  if(session?.action==='post_comment') return handleCommentText(ctx,msg,session);
  if(session?.action==='publish_post') return publishChannelMessage(ctx,msg);
  if(session)return handleSession(ctx,msg,session);
  const draft=await ctx.db.draft(id);
  if(draft)return handleDraftMessage(ctx,msg,draft);
  return mainMenu(ctx,id);
}

export async function handleUpdate(env, update, apiOverride = null, dbOverride = null) {
  const db = dbOverride || new Store(env.DB);
  const api = apiOverride || telegram(env);
  const ctx={db,api,env,ownerId:ownerId(env)};
  if(!isPositiveId(env.OWNER_ID))throw Error('OWNER_ID not set or invalid');
  if(update.channel_post)return handleChannelPost(ctx,update.channel_post);
  if(update.edited_channel_post)return handleChannelPost(ctx,update.edited_channel_post);
  const from=update.message?.from||update.callback_query?.from;
  if(!from?.id)return;
  // register users on every interaction, even if they changed display name
  await db.user(from.id,from.username,userName(from));
  if(update.message) return handleMessage(ctx,update.message);
  if(update.callback_query) {
    const q=update.callback_query;
    try { await handleCallback(ctx,q); }
    finally { await api('answerCallbackQuery',{callback_query_id:q.id}).catch(()=>{}); }
  }
}
