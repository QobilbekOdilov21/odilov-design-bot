import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/db.js';

export function dbFixture(){
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../migrations/0002_post_comments.sql', import.meta.url), 'utf8'));
  const db = {
    prepare(sql) { return { bind(...args) { const st=sqlite.prepare(sql);
      return { first: async()=>st.get(...args)||null, all:async()=>({results:st.all(...args)}),
        run:async()=>({meta:{changes:st.run(...args).changes}}) }; } }; }
  };
  return { store:new Store(db),db,sqlite };
}
export function fakeApi(){
  const log=[];
  async function api(method,params){
    log.push({method,params});
    if(method==='copyMessage')return {message_id:21};
    return {message_id:log.length};
  }
  return {api,log};
}
export function fakeEnv(db){return {DB:db,OWNER_ID:'111',BOT_TOKEN:'TEST:fake',WEBHOOK_SECRET:'testing-secret'};}
export function msg(userId,text,extra={}){
  return {update_id:Math.floor(Math.random()*100000),message:{message_id:1,from:{id:userId,first_name:`User ${userId}`},chat:{id:userId,type:'private'},text,...extra}};
}
export function cb(userId,data){return {update_id:Math.floor(Math.random()*100000),callback_query:{id:'q1',from:{id:userId,first_name:`User ${userId}`},data,message:{message_id:1,chat:{id:userId,type:'private'}}}};}
