export class TelegramError extends Error {
  constructor(method, message) { super(`${method}: ${message}`); this.name = 'TelegramError'; }
}
export function telegram(env, fetcher = fetch) {
  const token = env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN missing');
  return async (method, data = {}) => {
    const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    let payload;
    try { payload = await response.json(); } catch { throw new TelegramError(method, `HTTP ${response.status}`); }
    if (!response.ok || !payload.ok) throw new TelegramError(method, String(payload.description || response.status));
    return payload.result;
  };
}
export function send(api, chat_id, text, reply_markup) {
  return api('sendMessage', { chat_id, text: text.slice(0, 4096), parse_mode: 'HTML',
    disable_web_page_preview: true, ...(reply_markup ? { reply_markup } : {}) });
}
export async function editOrSend(api, query, text, reply_markup) {
  const msg = query.message;
  if (msg?.chat?.id && msg?.message_id) {
    try {
      return await api('editMessageText', { chat_id: msg.chat.id, message_id: msg.message_id,
        text: text.slice(0, 4096), parse_mode: 'HTML', disable_web_page_preview: true,
        ...(reply_markup ? { reply_markup } : {}) });
    } catch (error) {
      if (String(error.message).includes('message is not modified')) return;
    }
  }
  return send(api, query.from.id, text, reply_markup);
}
export function notifyUser(api, id, text, kb) {
  return send(api, id, text, kb).catch(err => { console.warn(`Telegram delivery failed to user_id=${id}: ${err.name}`); return null; });
}
