import { Store } from './db.js';
import { handleUpdate } from './bot.js';

export default {
  async fetch(request, env) {
    const url=new URL(request.url);
    // No website, no admin UI, no public query endpoints.
    if(url.pathname!=='/webhook')return new Response('Not Found',{status:404});
    if(request.method!=='POST')return new Response('Method Not Allowed',{status:405});
    const provided=request.headers.get('X-Telegram-Bot-Api-Secret-Token')||'';
    if(!env.WEBHOOK_SECRET||provided!==env.WEBHOOK_SECRET)return new Response('Forbidden',{status:403});
    if(Number(request.headers.get('content-length')||0)>1_000_000)return new Response('Request Too Large',{status:413});
    let update;
    try { update=await request.json(); } catch {return new Response('Bad JSON',{status:400});}
    if(!Number.isSafeInteger(update?.update_id))return new Response('Bad Update',{status:400});
    const db=new Store(env.DB);
    const claimed=await db.claimUpdate(update.update_id);
    if(!claimed)return new Response('OK');
    try { await handleUpdate(env,update); }
    catch(error) {
      await db.unclaimUpdate(update.update_id).catch(()=>{});
      console.error('Telegram update failed',update.update_id,error?.name||'error');
      return new Response('Retry',{status:500});
    }
    return new Response('OK');
  }
};
