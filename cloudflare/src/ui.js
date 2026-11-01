import { keyboard as kb, STATUS, esc, truncate, TRANSITIONS } from './constants.js';

export function home(isAdmin, hasDraft) {
  const rows = [];
  if (hasDraft) rows.push([['▶️ Buyurtmani davom ettirish','nav:resume']]);
  rows.push([['🎨 Buyurtma','nav:new'],['📂 Portfolio','nav:portfolio']],
    [['💰 Narxlar','nav:prices'],['📋 Buyurtmalarim','nav:myorders']],
    [['📞 Bog‘lanish','nav:contact'],['ℹ️ Yordam','nav:help']]);
  if (isAdmin) rows.push([['🛡 Admin panel','adm:home']]);
  return kb(rows);
}
export const cancel = () => kb([[['❌ Bekor qilish','nav:cancel']]]);
export const skip = step => kb([[['⏭ O‘tkazib yuborish',`skip:${step}`]],[['❌ Bekor qilish','nav:cancel']]]);
export const doneFiles = () => kb([[['✅ Davom etish','skip:files']],[['❌ Bekor qilish','nav:cancel']]]);
export const reviewKb = () => kb([[['✅ Tasdiqlash','nav:confirm']],[['✏️ Qaytadan','nav:new'],['❌ Bekor qilish','nav:cancel']]]);
export const serviceMenu = services => kb([...services.map(s=>[[s.label,`svc:${s.code}`]]),[['⬅️ Orqaga','nav:home']]]);
export const myOrders = orders => kb([...orders.map(o=>[[`#${o.id} · ${truncate(o.title,20)}`,`usr:order:${o.id}`]]),[['🏠 Menyu','nav:home']]]);
export function adminHome() { return kb([
  [['🆕 Yangi','adm:list:new:0'],['📋 Barchasi','adm:list:all:0']],
  [['✅ Qabul qilingan','adm:list:accepted:0'],['🛠 Jarayonda','adm:list:in_progress:0']],
  [['👤 Menga biriktirilgan','adm:list:mine:0'],['📊 Statistika','adm:stats']],
  [['🛠 Xizmatlar / narxlar','adm:services'],['👥 Adminlar','adm:admins']],
  [['🔎 ID orqali qidirish','adm:find'],['🏠 Menyu','nav:home']]
]); }
export function adminList(orders, filter, page, hasNext) {
  const rows=orders.map(o=>[[`#${o.id} ${truncate(o.title,28)} · ${STATUS[o.status]||o.status}`,`adm:order:${o.id}`]]);
  const p=[]; if(page>0)p.push(['⬅️ Oldingi',`adm:list:${filter}:${page-1}`]);
  if(hasNext)p.push(['Keyingi ➡️',`adm:list:${filter}:${page+1}`]); if(p.length)rows.push(p);
  rows.push([['⬅️ Admin panel','adm:home']]); return kb(rows);
}
export function adminOrder(order) {
  const rows=(TRANSITIONS[order.status]||[]).map(to=>[[STATUS[to],`adm:status:${order.id}:${to}`]]);
  rows.push([['👤 Mas’ul admin','adm:assign:'+order.id],['💬 Mijozga javob','adm:reply:'+order.id]],
    [['📝 Ichki izoh','adm:note:'+order.id],['📎 Fayllar','adm:files:'+order.id]],
    [['📜 Tarix','adm:history:'+order.id],['🔄 Yangilash','adm:order:'+order.id]],
    [['⬅️ Buyurtmalar','adm:list:all:0']]);
  return kb(rows);
}
export const assignMenu = (orderId,admins,owner) => kb([
  [['➖ Mas’ulni olib tashlash',`adm:assignok:${orderId}:0`]],
  [['👑 Bosh admin',`adm:assignok:${orderId}:${owner}`]],
  ...admins.filter(a=>Number(a.user_id)!==Number(owner)).map(a=>[[truncate(a.name,28),`adm:assignok:${orderId}:${a.user_id}`]]),
  [['⬅️ Buyurtma','adm:order:'+orderId]]
]);
export const adminManage = (admins, owner) => kb([
  [['➕ Admin qo‘shish','adm:add']],
  ...admins.filter(a=>Number(a.user_id)!==Number(owner)).map(a=>[[`🗑 ${truncate(a.name,25)}`,`adm:remove:${a.user_id}`]]),
  [['⬅️ Admin panel','adm:home']]
]);
export const adminRemoveConfirm = id => kb([
  [['🗑 Ha, o‘chirish',`adm:rmok:${id}`]],
  [['❌ Orqaga','adm:admins']]
]);
export const adminServices = services => kb([
  ...services.map(s=>[[`${s.active?'✅':'🚫'} ${truncate(s.label,24)}`,`adm:service:${s.code}`]]),
  [['⬅️ Admin panel','adm:home']]
]);
export const adminService = s => kb([
  [['💰 Narxni o‘zgartirish',`adm:price:${s.code}`]],
  [[s.active?'🚫 Xizmatni o‘chirish':'✅ Xizmatni yoqish',`adm:toggle:${s.code}`]],
  [['⬅️ Xizmatlar','adm:services']]
]);
export const deleteConfirm = () => kb([[['🗑 Ha, o‘chirilsin','privacy:confirm']],[['❌ Bekor','privacy:abort']]]);
export function orderText(order, service, { admin = false, assigned = '' } = {}) {
  let t = `<b>📦 BUYURTMA #${order.id}</b>\n${STATUS[order.status]||esc(order.status)}\n\n`+
    `<b>🎨 Xizmat:</b> ${esc(service?.label || order.service)}\n`+
    `<b>📝 Loyiha:</b> ${esc(order.title)}\n`+
    `<b>📄 Brief:</b> ${esc(truncate(order.brief,1600))}\n`+
    `<b>📅 Muddat:</b> ${esc(order.deadline||'Ko‘rsatilmagan')}\n`+
    `<b>💰 Budjet:</b> ${esc(order.budget||'Ko‘rsatilmagan')}\n`+
    `<b>📞 Aloqa:</b> ${esc(order.contact||'Telegram orqali')}`;
  if(admin) t += `\n<b>👤 Mijoz:</b> ${esc(order.customer_name)} (ID: <code>${order.customer_id}</code>)`+
    `\n<b>👨‍💻 Mas’ul:</b> ${esc(assigned||'Tayinlanmagan')}\n<b>📝 Ichki izoh:</b> ${esc(order.internal_note||'—')}`;
  return t;
}
