import { isValidTransition, STAGES } from './constants.js';

const q = (db, sql, ...args) => db.prepare(sql).bind(...args);
const json = (data) => JSON.stringify(data);
const parse = (data, fallback = {}) => { try { return JSON.parse(data || '{}'); } catch { return fallback; } };
export class Store {
  constructor(db) { this.db = db; }
  async user(id, username, name) {
    await q(this.db, `INSERT INTO users(id, username, name) VALUES(?,?,?)
      ON CONFLICT(id) DO UPDATE SET username=excluded.username,name=excluded.name`, id, username || null, name || 'User').run();
  }
  async getUser(id) { return q(this.db, 'SELECT * FROM users WHERE id=?', id).first(); }
  async admins() { return (await q(this.db, `SELECT admins.user_id,users.name,users.username FROM admins
      JOIN users ON users.id=admins.user_id ORDER BY admins.created_at`).all()).results; }
  async isAdmin(id, ownerId) {
    if (Number(id) === Number(ownerId)) return true;
    return !!(await q(this.db, 'SELECT user_id FROM admins WHERE user_id=?', id).first());
  }
  async addAdmin(id, actor) {
    const found = await this.getUser(id);
    if (!found) return false;
    await q(this.db, 'INSERT OR IGNORE INTO admins(user_id,added_by) VALUES(?,?)', id, actor).run();
    return true;
  }
  async removeAdmin(id) {
    const res = await q(this.db, 'DELETE FROM admins WHERE user_id=?', id).run();
    return res.meta.changes > 0;
  }
  async services(activeOnly = false) {
    return (await q(this.db, `SELECT * FROM services ${activeOnly ? 'WHERE active=1' : ''} ORDER BY sort_order,code`).all()).results;
  }
  async service(code) { return q(this.db, 'SELECT * FROM services WHERE code=?', code).first(); }
  async setPrice(code, price) { return (await q(this.db, 'UPDATE services SET price=? WHERE code=?', price, code).run()).meta.changes > 0; }
  async toggleService(code) { return (await q(this.db, 'UPDATE services SET active=1-active WHERE code=?', code).run()).meta.changes > 0; }
  async startDraft(id) {
    const key = crypto.randomUUID();
    await q(this.db, `INSERT INTO drafts(user_id,draft_key,stage,data_json) VALUES(?,?,'service','{}')
      ON CONFLICT(user_id) DO UPDATE SET draft_key=excluded.draft_key,stage='service',data_json='{}',updated_at=CURRENT_TIMESTAMP`, id, key).run();
  }
  async draft(id) {
    const row = await q(this.db, 'SELECT * FROM drafts WHERE user_id=?', id).first();
    return row ? { ...row, data: parse(row.data_json) } : null;
  }
  async saveDraft(id, stage, data) {
    if (!STAGES.includes(stage)) throw Error('Invalid draft stage');
    await q(this.db, 'UPDATE drafts SET stage=?,data_json=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?', stage, json(data), id).run();
  }
  async clearDraft(id) { await q(this.db, 'DELETE FROM drafts WHERE user_id=?', id).run(); }
  async submitDraft(id) {
    const draft = await this.draft(id);
    if (!draft || draft.stage !== 'review') return { order: null, created: false };
    const d = draft.data;
    const service = await this.service(d.service);
    if (!service || !service.active || !d.title || !d.brief) throw Error('Invalid or disabled service or incomplete draft');
    const user = await this.getUser(id);
    if (!user) throw Error('User not registered');
    const res = await q(this.db, `INSERT INTO orders(draft_key,customer_id,customer_name,service,title,brief,deadline,budget,contact)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(draft_key) DO NOTHING`, draft.draft_key, id, user.name, d.service,
      d.title, d.brief, d.deadline || null, d.budget || null, d.contact || null).run();
    const order = await q(this.db, 'SELECT * FROM orders WHERE draft_key=?', draft.draft_key).first();
    if (!order) throw Error('Order not persisted');
    if (res.meta.changes) {
      for (const file of (d.files || []).slice(0, 5)) {
        await q(this.db, `INSERT INTO assets(order_id,media_type,telegram_file_id,original_chat_id,original_message_id,file_name)
          VALUES(?,?,?,?,?,?)`, order.id, file.type, file.file_id, file.chat_id, file.message_id, file.file_name || null).run();
      }
      await this.history(order.id, id, 'created', null, 'new');
    }
    await q(this.db, 'DELETE FROM drafts WHERE user_id=? AND draft_key=?', id, draft.draft_key).run();
    return { order, created: res.meta.changes > 0 };
  }
  async order(id) { return q(this.db, 'SELECT * FROM orders WHERE id=?', id).first(); }
  async orderAssets(id) { return (await q(this.db, 'SELECT * FROM assets WHERE order_id=? ORDER BY id', id).all()).results; }
  async orderHistory(id) { return (await q(this.db, 'SELECT * FROM history WHERE order_id=? ORDER BY id DESC LIMIT 12', id).all()).results; }
  async userOrders(id, limit = 10) { return (await q(this.db, 'SELECT * FROM orders WHERE customer_id=? ORDER BY id DESC LIMIT ?', id, limit).all()).results; }
  async orders(filter = 'all', page = 0, pageSize = 8, adminId = null) {
    const offset = Math.max(0, Math.min(1000, page)) * pageSize;
    if (filter === 'mine') return (await q(this.db, 'SELECT * FROM orders WHERE assignee_id=? ORDER BY id DESC LIMIT ? OFFSET ?', adminId, pageSize + 1, offset).all()).results;
    if (filter !== 'all') return (await q(this.db, 'SELECT * FROM orders WHERE status=? ORDER BY id DESC LIMIT ? OFFSET ?', filter, pageSize + 1, offset).all()).results;
    return (await q(this.db, 'SELECT * FROM orders ORDER BY id DESC LIMIT ? OFFSET ?', pageSize + 1, offset).all()).results;
  }
  async stats() { return (await q(this.db, 'SELECT status,COUNT(*) as count FROM orders GROUP BY status').all()).results; }
  async changeStatus(orderId, status, actor) {
    const row = await this.order(orderId);
    if (!row || !isValidTransition(row.status, status)) return null;
    const res = await q(this.db, `UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status=?`, status, orderId, row.status).run();
    if (!res.meta.changes) return null;
    await this.history(orderId, actor, 'status', row.status, status);
    return this.order(orderId);
  }
  async assign(orderId, adminId, actor) {
    const row = await this.order(orderId);
    if (!row || ['completed','cancelled'].includes(row.status)) return null;
    const res = await q(this.db, `UPDATE orders SET assignee_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status NOT IN ('completed','cancelled')`, adminId, orderId).run();
    if (!res.meta.changes) return null;
    await this.history(orderId, actor, 'assigned', row.assignee_id == null ? null : String(row.assignee_id), adminId == null ? null : String(adminId));
    return this.order(orderId);
  }
  async note(orderId, note, actor) {
    const row = await this.order(orderId); if (!row) return null;
    await q(this.db, 'UPDATE orders SET internal_note=? WHERE id=?', note, orderId).run();
    await this.history(orderId, actor, 'note', null, note.slice(0, 60));
    return this.order(orderId);
  }
  async history(orderId, actor, kind, oldValue, newValue) {
    await q(this.db, 'INSERT INTO history(order_id,actor_id,kind,old_value,new_value) VALUES(?,?,?,?,?)', orderId, actor, kind, oldValue, newValue).run();
  }
  async session(userId) {
    const row = await q(this.db, 'SELECT * FROM sessions WHERE user_id=?', userId).first();
    return row ? { ...row, data: parse(row.data_json) } : null;
  }
  async setSession(userId, action, orderId = null, data = {}) {
    await q(this.db, `INSERT INTO sessions(user_id,action,order_id,data_json) VALUES(?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET action=excluded.action,order_id=excluded.order_id,data_json=excluded.data_json,created_at=CURRENT_TIMESTAMP`,
    userId, action, orderId, json(data)).run();
  }
  async clearSession(userId) { await q(this.db, 'DELETE FROM sessions WHERE user_id=?', userId).run(); }
  async deleteUser(userId) { return (await q(this.db, 'DELETE FROM users WHERE id=?', userId).run()).meta.changes > 0; }
  async claimUpdate(updateId) {
    const res = await q(this.db, 'INSERT OR IGNORE INTO processed_updates(update_id) VALUES(?)', updateId).run();
    return res.meta.changes > 0;
  }
  async unclaimUpdate(updateId) { await q(this.db, 'DELETE FROM processed_updates WHERE update_id=?', updateId).run(); }
  async purgeOldUpdates() { await q(this.db, "DELETE FROM processed_updates WHERE processed_at < datetime('now','-7 days')").run(); }
}
