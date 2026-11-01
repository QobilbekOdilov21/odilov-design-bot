export const STATUS = Object.freeze({
  new: '🆕 Yangi', accepted: '✅ Qabul qilingan',
  in_progress: '🛠 Jarayonda', completed: '🎉 Tayyor', cancelled: '❌ Bekor qilingan'
});
export const TRANSITIONS = Object.freeze({
  new: ['accepted', 'cancelled'],
  accepted: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [], cancelled: []
});
export const STAGES = ['service', 'title', 'brief', 'files', 'deadline', 'budget', 'contact', 'review'];
export const MAX_ASSETS = 5;
export const truncate = (v, max = 160) => String(v ?? '').slice(0, max);
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const clean = (s, max = 1500) => String(s ?? '').trim().slice(0, max);
export const isPositiveId = (n) => /^\d{1,16}$/.test(String(n)) && Number(n) > 0 && Number.isSafeInteger(Number(n));
export const isValidTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);
export const html = (text) => esc(truncate(text, 1200));
export const keyboard = (rows) => ({ inline_keyboard: rows.map(row => row.map(([text, callback_data]) => ({ text, callback_data }))) });
