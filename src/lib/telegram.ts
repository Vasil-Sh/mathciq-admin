export function telegramUsername(raw:string|null|undefined):string {
 let value=(raw||'').trim();
 if(/^(https?:\/\/)?(www\.)?(t\.me|telegram\.me)\//i.test(value)) {
   try {const url=new URL(/^https?:/i.test(value)?value:`https://${value}`);value=url.pathname.replace(/^\//,'').replace(/\/$/,'');} catch {return '';}
 }
 value=value.replace(/^@/,'');
 return /^[a-zA-Z0-9_]{5,32}$/.test(value)?value:'';
}
