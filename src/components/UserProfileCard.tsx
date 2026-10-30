import UserPayments from "@/components/UserPayments";
import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {UserAvatar} from '@/components/UserDirectory';
import {api} from '@/lib/apiClient';
import {toast} from 'sonner';
import type {UserData} from '@/types';
type Note={content:string;version:number;updatedBy:string|null;updatedAt:string|null};
type Data={user:{username:string;telegram:string;role:string;startDate:string;endDate:string;priceMonth:string;createdAt:string};note:Note;stats:{currency:string;bets:number;wins:number;losses:number;pending:number;staked:string;profit:string}[]};
type Event={id:string;actor_name:string;created_at:string;action:string;target:string;status:string;details:Record<string,unknown>};
const labels:Record<string,string>={endDate:'Підписка до',startDate:'Підписка з',priceMonth:'Тариф',role:'Роль',username:'Логін',telegram:'Telegram'};
function date(value?:string|null){return value ? new Date(value.length===10 ? value+'T12:00:00' : value).toLocaleDateString('uk-UA',{timeZone:'Europe/Kyiv'}) : '—'}
export default function UserProfileCard({user,onClose,onEdit,onUserChanged}:{user:UserData;onClose:()=>void;onEdit:()=>void;onUserChanged:()=>void}) {
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 const [events,setEvents]=useState<Event[]>([]),[historyError,setHistoryError]=useState('');
 const [draft,setDraft]=useState(''),[saving,setSaving]=useState(false);
 const [paymentState,setPaymentState]=useState({dirty:false,busy:false});
 const noteDirty=data !== null && draft !== data.note.content;
 const dirty=noteDirty || paymentState.dirty;
 const locked=saving || paymentState.busy;
 const [confirmClose,setConfirmClose]=useState(false);
 useEffect(()=>{let live=true;setLoading(true);setError('');setHistoryError('');
 api.get<Data>(`/admin/users/${user.id}/card`).then(value=>{if(live){setData(value);setDraft(value.note.content)}}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)});
 api.get<{entries:Event[]}>(`/admin/audit?userId=${user.id}`).then(value=>{if(live)setEvents(value.entries.slice(0,10))}).catch(()=>{if(live)setHistoryError('Не вдалося завантажити історію')});
 return()=>{live=false};},[user.id,revision]);
 async function save(){setSaving(true);try{const note=await api.put<Note>(`/admin/users/${user.id}/note`,{content:draft,version:data!.note.version});setData(current=>current?{...current,note}:current);toast.success('Нотатку збережено');const history=await api.get<{entries:Event[]}>(`/admin/audit?userId=${user.id}`).catch(()=>null);if(history)setEvents(history.entries.slice(0,10));}catch(e){toast.error((e as Error).message)}finally{setSaving(false)}}
 async function paymentChanged(){onUserChanged();const fresh=await api.get<Data>(`/admin/users/${user.id}/card`).catch(()=>null);if(fresh)setData(current=>current?{...current,user:fresh.user}:fresh);const history=await api.get<{entries:Event[]}>(`/admin/audit?userId=${user.id}`).catch(()=>null);if(history)setEvents(history.entries.slice(0,10))}
 function close(){if(locked)return;if(dirty)setConfirmClose(true);else onClose()}
 return <Dialog open onOpenChange={open=>{if(!open)close()}}><DialogContent className="user-profile-dialog" onInteractOutside={e=>{if(dirty||locked){e.preventDefault();close()}}} onEscapeKeyDown={e=>{if(dirty||locked){e.preventDefault();close()}}}>
 <DialogHeader><div className="user-profile-identity"><UserAvatar user={user}/><div><DialogTitle>{data?.user.username || user.username}</DialogTitle><DialogDescription>{data?.user.telegram || user.telegram || 'Telegram не вказано'} · {user.isAdmin?'Адміністратор':'Користувач'}</DialogDescription></div></div></DialogHeader>
 <div className="user-profile-body">{loading?<p role="status">Завантаження картки…</p>:error?<div role="alert"><p>{error}</p><Button onClick={()=>setRevision(v=>v+1)}>Повторити</Button></div>:data && <>
 <section><div className="user-profile-section-title"><h3>Профіль і підписка</h3><Button size="sm" variant="outline" className="profile-action-secondary" disabled={dirty||locked} onClick={onEdit}>Редагувати</Button></div><dl className="user-profile-facts"><div><dt>Тариф / місяць</dt><dd>₴{Number(data.user.priceMonth).toLocaleString('uk-UA')}</dd></div><div><dt>Створено</dt><dd>{date(data.user.createdAt)}</dd></div><div><dt>Початок підписки</dt><dd>{date(data.user.startDate)}</dd></div><div><dt>Завершення</dt><dd>{date(data.user.endDate)}</dd></div></dl>{noteDirty&&<p className="text-sm text-muted">Збережіть нотатку перед редагуванням профілю.</p>}</section>
 <UserPayments username={data.user.username} telegram={data.user.telegram} userId={user.id!} endDate={data.user.endDate} priceMonth={data.user.priceMonth} onChanged={()=>{void paymentChanged()}} onStateChange={setPaymentState}/>
 <section><h3>Статистика ставок</h3><p className="user-profile-description">За весь час · суми у гривнях. Групи — за початковою валютою ставки. Профіт — за виграшами та програшами.</p>{!data.stats.length?<p className="text-muted">Ставок ще немає.</p>:data.stats.map(stat=><div className="user-profile-stats" key={stat.currency}><strong>Ставки у {stat.currency || "UAH"}</strong><span>{stat.bets} ставок</span><span>{stat.wins} виграшів / {stat.losses} програшів</span><span>{stat.pending} очікують</span><span>Обіг, ₴: {Number(stat.staked).toLocaleString('uk-UA')}</span><span>Профіт, ₴: {Number(stat.profit).toLocaleString('uk-UA')}</span></div>)}</section>
 <section><h3>Внутрішня нотатка</h3><p className="user-profile-description">Видима лише адміністраторам.</p><textarea aria-label="Внутрішня нотатка" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={5000} rows={5} disabled={locked}/><div className="user-profile-note-footer"><span>{draft.length}/5000{data.note.updatedBy && ` · ${data.note.updatedBy}, ${date(data.note.updatedAt)}`}</span><Button size="sm" disabled={!noteDirty||locked} onClick={save}>{saving?'Збереження…':'Зберегти нотатку'}</Button></div></section>
 <section><div className="user-profile-section-title"><h3>Останні зміни</h3><Link to={`/audit?userId=${user.id}&username=${encodeURIComponent(user.username)}`} onClick={e=>{if(dirty||locked){e.preventDefault();toast.info('Спочатку збережіть зміни')}}}>Уся історія →</Link></div><p className="user-profile-description">Історія з моменту підключення журналу.</p>{historyError?<p role="alert">{historyError}</p>:!events.length?<p className="text-muted">Змін ще не зафіксовано.</p>:<ol className="user-profile-history">{events.map(event=><li key={event.id}><div><strong>{event.actor_name}</strong><span>{date(event.created_at)} · {event.status==='success'?'Виконано':event.status==='failed'?'Помилка':'Не підтверджено'}</span></div><p>{event.target.endsWith('/payments')?'Додавання оплати':event.target.endsWith('/cancel')?'Скасування оплати':event.target.endsWith('/note')?'Оновлення нотатки':event.target.endsWith('/reset-password')?'Скидання пароля':event.action==='POST'?'Створення акаунта':event.action==='DELETE'?'Видалення акаунта':'Оновлення акаунта'}</p>{Object.entries((event.details._changes || {}) as Record<string,{before:unknown;after:unknown}>).map(([key,value])=><small key={key}>{labels[key]||key}: {String(value.before??'—')} → {String(value.after??'—')}</small>)}</li>)}</ol>}</section>
 </>}</div>
 {confirmClose?<div className="user-profile-confirm" role="alert"><p>Є незбережені зміни.</p><Button variant="outline" className="profile-action-secondary" onClick={()=>setConfirmClose(false)}>Залишитися</Button><Button variant="destructive" onClick={onClose}>Закрити без збереження</Button></div>:<div className="user-profile-footer"><Button variant="outline" className="profile-action-secondary" disabled={locked} onClick={close}>Закрити</Button></div>}
 </DialogContent></Dialog>;
}
