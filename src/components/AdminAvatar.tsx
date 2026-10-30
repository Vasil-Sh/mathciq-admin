import {telegramUsername} from "@/lib/telegram";
import {useEffect,useState} from 'react';
import {ShieldCheck} from 'lucide-react';
import {api} from '@/lib/apiClient';

export default function AdminAvatar({username}:{username?:string}) {
 const [handle,setHandle]=useState('');
 const [failed,setFailed]=useState(false);
 useEffect(()=>{
   let live=true;setHandle('');setFailed(false);
   if(username)api.get<{username:string;telegram?:string}>('/auth/me').then(user=>{
     if(!live||user.username!==username)return;
     const value=telegramUsername(user.telegram);
     if(/^[a-zA-Z0-9_]{5,32}$/.test(value))setHandle(value);
   }).catch(()=>{});
   return()=>{live=false};
 },[username]);
 return <span className="header-avatar admin-profile-avatar">{handle&&!failed?<img src={`https://t.me/i/userpic/320/${handle}.jpg`} alt={`Аватар ${username}`} onError={()=>setFailed(true)} onLoad={e=>{if(e.currentTarget.naturalWidth<=1)setFailed(true)}}/>:<ShieldCheck size={21} aria-label="Адміністратор"/>}</span>;
}
