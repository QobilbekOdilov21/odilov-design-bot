import readline from 'node:readline';

// Never print or save the bot token. Run locally in a terminal.
const rl=readline.createInterface({input:process.stdin,output:process.stdout});
function ask(question,{hidden=false}={}){
  return new Promise(resolve=>{
    if(hidden){
      const original=rl._writeToOutput;
      rl._writeToOutput=function(v){ if(v.includes(question)||v.includes('\n'))original.call(rl,v);else original.call(rl,'*'); };
      rl.question(question,answer=>{rl._writeToOutput=original;resolve(answer.trim());});
    }else rl.question(question,answer=>resolve(answer.trim()));
  });
}
try {
  const token=await ask('BotFather tokeni (ekranda berkitiladi): ',{hidden:true});
  if(!/^\d+:[\w-]{25,}$/.test(token))throw Error('Token formatini tekshiring.');
  if(process.argv.includes('--info')) {
    const r=await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const data=await r.json();
    if(!data.ok)throw Error('Telegram API xato.');
    console.log('URL:',data.result?.url||'(yo‘q)');
    console.log('Oxirgi xato:',data.result?.last_error_message||'(yo‘q)');
  } else {
    const url=await ask('Worker URL (https://...workers.dev): ');
    const secret=await ask('WEBHOOK_SECRET (Render/Cloudflare secret bilan BIR XIL): ',{hidden:true});
    if(!/^https:\/\/[\w.-]+(?:\:\d+)?\/?$/.test(url)||!/^[-_A-Za-z0-9]{20,256}$/.test(secret))throw Error('URL yoki secret noto‘g‘ri.');
    const r=await fetch(`https://api.telegram.org/bot${token}/setWebhook`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({url:url.replace(/\/$/,'')+'/webhook',secret_token:secret,allowed_updates:['message','callback_query'],drop_pending_updates:false})
    });
    const data=await r.json();
    if(!data.ok)throw Error(data.description||'Webhook sozlanmadi');
    console.log('✅ Webhook o‘rnatildi. Token saqlanmadi.');
  }
} catch(error){console.error('Xatolik:',error.message);process.exitCode=1;}
finally{rl.close();}
