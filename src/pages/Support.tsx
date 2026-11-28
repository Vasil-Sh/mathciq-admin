import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, ChevronDown, ExternalLink, RefreshCw, Search, Send, WifiOff, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import PillTrack from "@/components/PillTrack";
import RollingNumber from "@/components/RollingNumber";
import UndoRing from "@/components/UndoRing";
import { useMedia, useOnline } from "@/hooks/useMediaOnline";
import { useAuth } from "@/contexts/AuthContext";
import { plural } from "@/lib/dashboardInsights";
import { usePageSearch, isPhoneWidth } from "@/lib/pageSearch";
import { openTelegram } from "@/lib/telegram";
import SupportWeb from "@/components/support/SupportWeb";
import {
  DEFAULT_TEMPLATES, GVIEW, KIND, fetchGroup, gView, PLAN, REASONS, STATUS, ago, approveGroup, bubbleTime, fetchGroups, fetchTemplates, fetchTicket, fetchTickets,
  minutesText, patchTicket, rejectGroup, replyTicket,
  type GStatus, type GroupDetail, type GroupList, type TFilter, type TKind, type TMessage, type TStatus, type Template, type TgGroup, type TicketDetail, type TicketList,
} from "@/lib/supportApi";

type Tab = "tickets" | "groups";
const FILTERS: { key: TFilter; label: string }[] = [{ key: "open", label: "Відкриті" }, { key: "new", label: "Нові" }, { key: "mine", label: "Мої" }, { key: "resolved", label: "Вирішені" }];
const KINDS: { value: TKind | "all"; label: string }[] = [{ value: "all", label: "Усі типи" }, { value: "problem", label: "Проблеми" }, { value: "idea", label: "Побажання" }, { value: "question", label: "Питання" }];
type GFilter = GStatus | "all" | "errors";
const GFILTERS: { key: GFilter; label: string }[] = [{ key: "all", label: "Усі" }, { key: "pending", label: "Перевірити" }, { key: "errors", label: "Помилки" }, { key: "rejected", label: "Заблоковані" }];
const STATUS_OPTS: TStatus[] = ["open", "in_progress", "waiting", "resolved"];
const NOBODY = "—";
/** What each status means — the phone «Статус» sheet shows it next to the tag. */
const STATUS_NOTE = (s: TStatus, user: string) => ({ open: "щойно надійшло, ніхто не взяв", in_progress: "адмін розбирається", waiting: "відповіли, чекаємо користувача", resolved: `закрито — @${user} отримає сповіщення`, closed: "закрито" })[s];
const initials = (name: string) => name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "TG";

/** Phone: a sheet; wide screen: the dark panel on the right that re-enters when the selection changes. */
function Pane({ wide, open, paneKey, label, onClose, children }: { wide: boolean; open: boolean; paneKey: string; label: string; onClose: () => void; children: React.ReactNode }) {
  if (wide) return open ? <aside key={paneKey} className="v3-dcard v3-pay-aside v3-sp-aside v3-ad-pane" aria-label={label}>{children}</aside> : null;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="v3-modal v3-ad-sheet v3-sp-sheet">
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <DialogDescription className="sr-only">Розмова, відповідь і статус</DialogDescription>
        <div className="v3-sp-aside is-sheet">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

function SendButton({ busy, done, onClick, disabled }: { busy: boolean; done: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={`v3-btn v3-btn-primary v3-sp-send${busy ? " is-busy" : ""}${done ? " is-done" : ""}`} disabled={disabled || busy} onClick={onClick} aria-live="polite">
      {busy ? "Надсилаємо…" : done ? <><Check size={15} strokeWidth={3} aria-hidden="true" />Надіслано</> : <><Send size={15} aria-hidden="true" />Надіслати</>}
    </button>
  );
}

// ───────────────────────── one ticket ─────────────────────────
function TicketPane({ d, templates, me, assignees, load = {}, online, onUpdate }: {
  d: TicketDetail; templates: Template[]; me: string; assignees: string[]; load?: Record<string, number>; online: boolean;
  onUpdate: (patch: { status?: TStatus; assignee?: string | null; message?: TMessage }) => void;
}) {
  const t = d.ticket;
  const phone = useMedia("(max-width: 767px)");
  const [text, setText] = useState("");
  const [tpl, setTpl] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [send, setSend] = useState<"" | "busy" | "done">("");
  const [flip, setFlip] = useState(0);
  const bottom = useRef<HTMLDivElement>(null);
  const msgs: TMessage[] = [{ author: t.username, fromAdmin: false, body: t.message, createdAt: t.createdAt }, ...d.messages];
  const st = STATUS[t.status];
  const meta = [d.context.aiToday != null ? `AI сьогодні ${d.context.aiToday}${d.context.aiLimit ? ` з ${d.context.aiLimit}` : ""}` : "", t.meta?.device || "", t.meta?.appVersion ? `v${t.meta.appVersion.replace(/^v/, "")}` : "", t.meta?.screen ? `Екран: ${t.meta.screen}` : ""].filter(Boolean);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [d.messages.length]);

  async function setStatus(next: TStatus) {
    const was = t.status;
    if (next === was) return;
    onUpdate({ status: next }); setFlip((x) => x + 1);
    try {
      await patchTicket(t.id, { status: next });
      toast.success(`№${t.id} · ${STATUS[next].label}`, {
        description: next === "resolved" ? `@${t.username} отримає сповіщення, що звернення закрито` : "Статус змінено",
        duration: 10_000, className: "v3-toast-10s",
        action: { label: <UndoRing />, onClick: () => { onUpdate({ status: was }); setFlip((x) => x + 1); patchTicket(t.id, { status: was }).catch((e) => toast.error("Не вдалося повернути статус", { description: (e as Error).message })); } },
      });
    } catch (e) { onUpdate({ status: was }); toast.error("Не вдалося змінити статус", { description: (e as Error).message }); }
  }
  async function setAssignee(v: string) {
    const next = v === NOBODY ? null : v.replace(/^@/, "");
    const was = t.assignee;
    onUpdate({ assignee: next });
    try { await patchTicket(t.id, { assignee: next }); toast.info(next ? `Відповідальний: @${next}` : "Відповідального знято", { description: `№${t.id} · ${t.subject}` }); }
    catch (e) { onUpdate({ assignee: was }); toast.error("Не вдалося змінити відповідального", { description: (e as Error).message }); }
  }
  async function doSend() {
    if (send) return;
    if (!text.trim()) { setShake((x) => x + 1); toast.error("Напишіть відповідь", { description: "Або оберіть шаблон над полем" }); return; }
    setSend("busy");
    try {
      const r = await replyTicket(t.id, text.trim(), t.status === "resolved" ? "resolved" : undefined);
      onUpdate({ status: r.status, assignee: r.assignee, message: r.message }); setFlip((x) => x + 1);
      setText(""); setTpl(null); setShake(0); setSend("done");
      toast.success("Відповідь надіслано", { description: `@${t.username} побачить її в застосунку${r.telegram ? " й у Telegram" : ""}` });
      window.setTimeout(() => setSend(""), 1400);
    } catch (e) { setSend(""); toast.error("Не вдалося надіслати", { description: (e as Error).message }); }
  }

  return <>
    <div className="v3-sp-head">
      <div><span className="v3-sp-kicker">{KIND[t.kind] || "Звернення"} · №{t.id}</span><div className="v3-sp-title">{t.subject}</div></div>
      <span key={`${t.status}-${flip}`} className={`v3-tag ${st.cls} v3-sp-flip`}>{st.label}</span>
    </div>
    <div className="v3-sp-chips">
      <Link to={`/users?q=${encodeURIComponent(t.username)}`} className="v3-sp-chip is-link">@{t.username}{t.plan ? ` · ${PLAN[t.plan] || t.plan}` : ""} <ArrowRight size={12} aria-hidden="true" /></Link>
      {meta.map((m) => <span key={m} className="v3-sp-chip">{m}</span>)}
    </div>
    <div className="v3-sp-thread" aria-label="Розмова">
      {msgs.map((m, i) => (
        <div key={m.id || `m${i}`} className={`v3-sp-bub${m.fromAdmin ? " is-me" : ""}`} style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
          <span>@{m.author} · {bubbleTime(m.createdAt)}</span>{m.body}
        </div>
      ))}
      <div ref={bottom} />
    </div>
    {t.status !== "resolved" && t.status !== "closed" && d.context.hints?.map((h) => <div key={h} className="v3-sp-hintb">Підказка: {h[0].toLowerCase() + h.slice(1)}</div>)}
    <div className="v3-sp-reply">
      <div className="v3-sp-tpls" role="group" aria-label="Шаблони відповіді">
        {templates.map((p) => <button key={p.id} type="button" className={`v3-sp-tpl${tpl === p.id ? " is-on" : ""}`} aria-pressed={tpl === p.id} onClick={() => { if (tpl === p.id) { setTpl(null); setText(""); } else { setTpl(p.id); setText(p.body); } }}>{p.title}</button>)}
      </div>
      <label className="sr-only" htmlFor={`sp-reply-${t.id}`}>Відповідь</label>
      <textarea id={`sp-reply-${t.id}`} key={`r-${shake}`} className={`v3-ad-in v3-sp-text${shake ? (shake % 2 ? " v3-shake-a" : " v3-shake-b") : ""}${shake && !text.trim() ? " is-err" : ""}`} rows={3} maxLength={5000}
        placeholder="Відповідь — прийде в застосунок і в Telegram" value={text} onChange={(e) => { setText(e.target.value); if (tpl) setTpl(null); }} />
    </div>
    <div className="v3-sp-acts">
      <Dropdown className="v3-ad-dd" ariaLabel="Статус" value={t.status === "closed" ? "resolved" : t.status} onChange={(v) => setStatus(v as TStatus)}
        sheet={{ title: "Статус", note: `№${t.id} · ${t.subject}`, cls: "v3-sp-ddsheet" }}
        options={STATUS_OPTS.map((s) => ({ value: s, label: STATUS[s].label, sheetLabel: <span className="v3-sp-sopt"><span className={`v3-tag ${STATUS[s].cls}`}>{STATUS[s].label}</span><small>{STATUS_NOTE(s, t.username)}</small></span> }))} />
      <Dropdown className="v3-ad-dd" ariaLabel="Відповідальний" value={t.assignee ? `@${t.assignee}` : NOBODY} onChange={setAssignee}
        sheet={{ title: "Відповідальний", note: `Хто веде звернення №${t.id}`, cls: "v3-sp-ddsheet" }}
        options={[
          ...assignees.map((a) => ({ value: `@${a}`, label: phone ? `@${a}` : `@${a}${a === me ? " (я)" : ""}`, sheetLabel: <span className="v3-sp-aopt"><i aria-hidden="true">{initials(a)}</i><b>@{a}</b><small>{a === me ? "я · " : ""}в роботі {load[a] ?? 0}</small></span> })),
          { value: NOBODY, label: phone ? "Ніхто" : NOBODY, sheetLabel: <span className="v3-sp-aopt"><i aria-hidden="true">—</i><b>Ніхто</b><small>зняти</small></span> },
        ]} />
      <SendButton busy={send === "busy"} done={send === "done"} disabled={!online} onClick={doSend} />
    </div>
  </>;
}

// ───────────────────────── one group ─────────────────────────
function GroupPane({ g, online, onChange }: { g: TgGroup; online: boolean; onChange: (id: string, next: GStatus, reason: string | null) => void }) {
  const [reason, setReason] = useState(0);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [det, setDet] = useState<GroupDetail | null>(null);
  const askT = useRef<number | undefined>(undefined);
  useEffect(() => {
    setAsk(false); window.clearTimeout(askT.current); setDet(null);
    const r = REASONS.indexOf((g.flagReason || "") as (typeof REASONS)[number]); setReason(r >= 0 ? r : 0);
    let live = true;
    fetchGroup(g.id).then((d) => { if (live) setDet(d); }).catch(() => {});
    return () => { live = false; };
  }, [g.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => window.clearTimeout(askT.current), []);
  const view = gView(g); const st = GVIEW[view];
  const people = g.people || 1;
  const phone = useMedia("(max-width: 767px)");
  const texts = det?.group.flaggedTexts || [];
  async function act(next: GStatus) {
    const was = g.moderationStatus, wasReason = g.rejectReason;
    const why = next === "rejected" ? REASONS[reason] : null;
    setBusy(true);
    try {
      if (next === "rejected") await rejectGroup(g.id, why!); else await approveGroup(g.id);
      onChange(g.id, next, why);
      const undo = { label: <UndoRing />, onClick: () => { (was === "rejected" ? rejectGroup(g.id, wasReason || REASONS[0]) : approveGroup(g.id)).then(() => onChange(g.id, was, wasReason)).catch((e) => toast.error("Не вдалося повернути", { description: (e as Error).message })); } };
      // a pending group cannot be sent back to «pending» — undo only between active and blocked
      const opts = was === "pending" ? {} : { duration: 10_000, className: "v3-toast-10s", action: undo };
      if (next === "rejected") toast.success(`${g.name} заблоковано`, { description: `${why} · група зникла в ${people} ${plural(people, "людини", "людей", "людей")}${g.addedBy ? `, @${g.addedBy} отримає пояснення` : ""}`, ...opts });
      else toast.success(was === "pending" ? `${g.name} — усе гаразд` : `${g.name} розблоковано`, { description: was === "pending" ? "Позначку знято, розбір працює далі" : "Група знову видна людям, які її додали", ...opts });
    } catch (e) { toast.error("Не вдалося змінити стан групи", { description: (e as Error).message }); }
    finally { setBusy(false); setAsk(false); }
  }
  function block() {
    if (!ask) { setAsk(true); window.clearTimeout(askT.current); askT.current = window.setTimeout(() => setAsk(false), 3000); return; }
    void act("rejected");
  }
  const link = g.link ? (g.link.startsWith("http") ? g.link : `https://${g.link.replace(/^@/, "t.me/")}`) : null;
  const ERR_HOW: Record<string, string> = {
    none: "Без посилання розбір не знає, звідки брати прогнози. Попросіть додати посилання на групу.",
    bad: "Посилання веде не на Telegram. Потрібне посилання виду t.me/назва.",
    private: "Це посилання-запрошення в закриту групу: її пости не видно. Попросіть публічне посилання або додати бота MatchIQ у групу.",
  };
  return <>
    <div className="v3-sp-head">
      {phone && <span className="v3-sp-gav v3-sp-hav" aria-hidden="true">{initials(g.name)}</span>}
      <div><div className="v3-sp-title">{g.name}</div><span className="v3-sp-kicker">{[g.link?.replace(/^https?:\/\//, ""), g.game, g.addedBy ? `додав @${g.addedBy}${people > 1 ? ` +${people - 1}` : ""}` : ""].filter(Boolean).join(" · ")}</span></div>
      <span key={view} className={`v3-tag ${st.cls} v3-sp-flip`}>{st.label}</span>
    </div>
    {link && g.linkState !== "bad" && <a className="v3-sp-chip is-link v3-sp-open" href={link} target="_blank" rel="noreferrer">Відкрити в Telegram <ExternalLink size={12} aria-hidden="true" /></a>}
    {texts.length > 0 && view !== "rejected" && <>
      <span className="v3-sp-lbl">Чому позначено</span>
      {texts.map((x, i) => <div key={x.field} className="v3-sp-post" style={{ animationDelay: `${i * 80}ms` }}>«{x.parts.map((p, k) => p.hl ? <mark key={k} className="v3-sp-hl">{p.t}</mark> : <span key={k}>{p.t}</span>)}»<small>{x.field === "name" ? "назва групи" : "опис від користувача"}</small></div>)}
    </>}
    {!texts.length && g.comment && view !== "error" && <><span className="v3-sp-lbl">Опис від користувача</span><div className="v3-sp-post">«{g.comment}»<small>додано {bubbleTime(g.createdAt)}</small></div></>}
    {view === "error" && <div className="v3-sp-errb"><strong>{g.linkProblem ? g.linkProblem[0].toUpperCase() + g.linkProblem.slice(1) : "Розбір не працює"}</strong><span>{ERR_HOW[g.linkState || "none"]}</span></div>}
    {phone && view === "error" && g.addedBy && <button type="button" className="v3-btn v3-sp-write" disabled={!online} onClick={() => openTelegram(g.addedBy!)}><Send size={15} aria-hidden="true" />Написати @{g.addedBy}</button>}
    {view === "ok" && <div className="v3-sp-gstats">
      <div><span>Прогнозів · 7 дн.</span><b>{g.bets7d ?? 0}</b></div>
      <div style={{ animationDelay: "60ms" }}><span>Влучність</span><b>{g.hitRate != null ? `${g.hitRate}%` : "—"}</b></div>
      <div style={{ animationDelay: "120ms" }}><span>Останній</span><b>{g.lastBetAt ? ago(g.lastBetAt).replace(" тому", "") : "—"}</b></div>
    </div>}
    {view === "rejected" ? <>
      <div className="v3-sp-note">Заблоковано{g.reviewedAt ? ` ${bubbleTime(g.reviewedAt)}` : ""}{g.rejectReason ? ` · ${g.rejectReason}` : ""}{g.reviewedBy ? ` · @${g.reviewedBy}` : ""}. Група прихована в {people} {plural(people, "людини", "людей", "людей")}, розбір зупинено.</div>
      <button type="button" className="v3-btn v3-btn-ghost-dark" disabled={!online || busy} onClick={() => act("approved")}>Розблокувати</button>
    </> : <>
      <div className="v3-sp-reason"><span className="v3-sp-lbl">Причина блокування</span>
        <div className="v3-seg v3-sp-seg" role="group" aria-label="Причина блокування">
          <PillTrack active={reason} />
          {REASONS.map((r, i) => <button key={r} type="button" className={reason === i ? "is-on" : ""} aria-pressed={reason === i} onClick={() => setReason(i)}>{phone ? r.split(" ")[0] : r}</button>)}
        </div>
      </div>
      <span className="v3-sp-hint">{phone
        ? `Група зникне в усіх, хто її додав (${people} ${plural(people, "людина", "людини", "людей")}), розбір зупиниться.${g.addedBy ? ` @${g.addedBy} отримає пояснення.` : ""}`
        : `Після блокування група зникне в усіх, хто її додав (${people} ${plural(people, "людина", "людини", "людей")}), розбір зупиниться.${g.addedBy ? ` Користувачу @${g.addedBy} прийде пояснення.` : ""}`}</span>
      <div className={`v3-sp-gacts${g.moderationStatus === "pending" ? "" : " is-one"}`}>
        {g.moderationStatus === "pending" && <button type="button" className="v3-btn v3-btn-ghost-dark" disabled={!online || busy} onClick={() => act("approved")}>Усе гаразд</button>}
        <button type="button" className={`v3-btn v3-btn-red${ask ? " v3-pay-cx is-ask" : ""}${busy ? " is-busy" : ""}`} disabled={!online || busy} onClick={block}>{busy ? "Блокуємо…" : ask ? "Точно заблокувати?" : phone ? "Заблокувати" : "Заблокувати групу"}</button>
      </div>
    </>}
  </>;
}

// ───────────────────────── page ─────────────────────────
function SupportLegacy() {
  const wide = useMedia("(min-width: 1180px)");
  const phone = useMedia("(max-width: 767px)");
  const online = useOnline();
  const { user } = useAuth();
  const me = user?.username || "";
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "groups" ? "groups" : "tickets";

  // tickets
  const [filter, setFilter] = useState<TFilter>("open");
  const [kind, setKind] = useState<TKind | "all">("all");
  const [q, setQ] = useState("");
  const [list, setList] = useState<TicketList | null>(null);
  const [err, setErr] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [sheet, setSheet] = useState(false);
  const [templates, setTemplates] = useState<Template[]>(DEFAULT_TEMPLATES);
  const [rk, setRk] = useState(0);
  // groups
  const [gf, setGf] = useState<GFilter>("all");
  const [gq, setGq] = useState("");
  const [groups, setGroups] = useState<GroupList | null>(null);
  const [gErr, setGErr] = useState("");
  const [gSel, setGSel] = useState<string | null>(null);
  const [gSheet, setGSheet] = useState(false);
  // phone: one «Звернення» sheet for state and type (design SupportMobileFilter)
  const [filtOpen, setFiltOpen] = useState(false);
  const [fDraft, setFDraft] = useState<TFilter>("open");
  const [kDraft, setKDraft] = useState<TKind | "all">("all");
  const [draftN, setDraftN] = useState<number | null>(null);
  // phone: the 🔍 in the header searches the current tab
  const pageSearch = usePageSearch(tab === "tickets" ? "Тема або логін" : "Назва або хто додав");
  useEffect(() => {
    if (!isPhoneWidth()) return;
    if (tab === "tickets") { setQ(pageSearch.q); setGq(""); } else { setGq(pageSearch.q); setQ(""); }
  }, [pageSearch.q, tab]);

  const loadTickets = useCallback(async () => {
    try { setList(await fetchTickets(filter, kind === "all" ? "" : kind, q)); setErr(""); }
    catch (e) { setErr((e as Error).message || "Сервер не відповідає"); }
  }, [filter, kind, q]);
  const loadGroups = useCallback(async () => {
    try { setGroups(await fetchGroups(gf, gq)); setGErr(""); }
    catch (e) { setGErr((e as Error).message || "Сервер не відповідає"); }
  }, [gf, gq]);
  useEffect(() => { const id = window.setTimeout(loadTickets, q ? 250 : 0); return () => window.clearTimeout(id); }, [loadTickets, q]);
  useEffect(() => { const id = window.setTimeout(loadGroups, gq ? 250 : 0); return () => window.clearTimeout(id); }, [loadGroups, gq]);
  useEffect(() => { fetchTemplates().then(setTemplates).catch(() => {}); }, []);
  useEffect(() => {
    if (!filtOpen) return;
    let live = true;
    fetchTickets(fDraft, kDraft === "all" ? "" : kDraft, q).then((x) => { if (live) setDraftN(x.tickets.filter((t) => fDraft !== "open" || !["resolved", "closed"].includes(t.status)).length); }).catch(() => {});
    return () => { live = false; };
  }, [filtOpen, fDraft, kDraft, q]);

  const tickets = list?.tickets || [];
  // wide: keep a ticket open on the right
  useEffect(() => { if (wide && tickets.length && !tickets.some((t) => t.id === selId)) setSelId(tickets[0].id); }, [wide, tickets, selId]);
  useEffect(() => {
    if (!selId) { setDetail(null); return; }
    let live = true;
    fetchTicket(selId).then((d) => { if (live) setDetail(d); }).catch((e) => { if (live) toast.error("Не вдалося відкрити звернення", { description: (e as Error).message }); });
    return () => { live = false; };
  }, [selId]);
  const gList = groups?.groups || [];
  useEffect(() => { if (wide && gList.length && !gList.some((g) => g.id === gSel)) setGSel(gList[0].id); }, [wide, gList, gSel]);
  const gCur = gList.find((g) => g.id === gSel) || null;

  const assignees = useMemo(() => {
    const s = new Set<string>(me ? [me] : []);
    tickets.forEach((t) => { if (t.assignee) s.add(t.assignee); });
    list?.stats.inWorkBy.forEach((a) => s.add(a.assignee));
    if (detail?.ticket.assignee) s.add(detail.ticket.assignee);
    return [...s];
  }, [me, tickets, list, detail]);

  const load = useMemo(() => Object.fromEntries((list?.stats.inWorkBy || []).map((a) => [a.assignee, a.count])), [list]);
  function updateTicket(patch: { status?: TStatus; assignee?: string | null; message?: TMessage }) {
    setDetail((d) => d ? { ...d, ticket: { ...d.ticket, ...(patch.status ? { status: patch.status } : {}), ...(patch.assignee !== undefined ? { assignee: patch.assignee } : {}) }, messages: patch.message ? [...d.messages, patch.message] : d.messages } : d);
    setList((l) => l ? { ...l, tickets: l.tickets.map((t) => t.id === selId ? { ...t, ...(patch.status ? { status: patch.status } : {}), ...(patch.assignee !== undefined ? { assignee: patch.assignee } : {}) } : t) } : l);
    // counts and summary follow from the server
    window.setTimeout(() => { fetchTickets(filter, kind === "all" ? "" : kind, q).then((x) => setList((l) => l ? { ...l, counts: x.counts, stats: x.stats } : x)).catch(() => {}); }, 300);
  }
  function changeGroup(id: string, next: GStatus, reason: string | null) {
    setGroups((g) => g ? { ...g, groups: g.groups.map((x) => x.id === id ? { ...x, moderationStatus: next, rejectReason: reason, reviewedBy: me, reviewedAt: new Date().toISOString() } : x) } : g);
    window.setTimeout(() => { fetchGroups(gf, gq).then((x) => setGroups((g) => g ? { ...g, counts: x.counts } : x)).catch(() => {}); }, 300);
  }

  const c = list?.counts;
  const s = list?.stats;
  const gc = groups?.counts;
  const gs = groups?.summary;
  const visible = tickets.filter((t) => filter !== "open" || !["resolved", "closed"].includes(t.status));
  const sub = tab === "tickets" ? (s ? `${s.new} ${plural(s.new, "нове", "нові", "нових")} · ${s.inWork} в роботі` : "Завантажуємо…") : (gc ? `${gc.pending} на перевірці · ${gc.errors ?? 0} з помилкою` : "Завантажуємо…");

  const sums = tab === "tickets" ? [
    { k: "n", l: "Нові", v: s ? String(s.new) : "—", n: s?.oldestNewAt ? `найстаріше — ${ago(s.oldestNewAt)}` : "нових немає", on: true, go: () => { setFilter("new"); setRk((x) => x + 1); } },
    { k: "w", l: "В роботі", v: s ? String(s.inWork) : "—", n: s?.inWorkBy.length ? s.inWorkBy.map((a) => `@${a.assignee} ${a.count}`).join(" · ") : "ніхто не взяв", go: () => { setFilter("mine"); setRk((x) => x + 1); } },
    { k: "f", l: "Середня перша відповідь", v: s ? minutesText(s.avgFirstReplyMin) : "—", n: "за 7 днів" },
    { k: "r", l: "Вирішено за тиждень", v: s ? String(s.resolvedWeek) : "—", n: s ? `проблем ${s.resolvedProblems} · побажань ${s.resolvedIdeas}` : "", go: () => { setFilter("resolved"); setRk((x) => x + 1); } },
  ] : [
    { k: "a", l: "Груп у користувачів Pro", v: gs ? String(gs.all) : gc ? String(gc.all) : "—", n: gs ? `у ${gs.people} ${plural(gs.people, "людини", "людей", "людей")}` : "", on: true, go: () => { setGf("all"); setRk((x) => x + 1); } },
    { k: "ok", l: "Розбір працює", v: gs ? String(gs.working) : "—", n: gs ? `прогнозів за 7 днів: ${gs.bets7d.toLocaleString("uk-UA")}` : "" },
    { k: "e", l: "З помилкою розбору", v: gs ? String(gs.errors) : "—", n: gs?.errors ? gs.errorKinds.join(" · ") : "помилок немає", amber: !!gs?.errors, go: () => { setGf("errors"); setRk((x) => x + 1); } },
    { k: "p", l: "Потребують перевірки", v: gc ? String(gc.pending) : "—", n: gs?.pendingReason ? `схоже на «${gs.pendingReason.toLowerCase()}»` : gc?.pending ? "перегляньте перед показом" : "усе перевірено", bad: !!gc?.pending, go: () => { setGf("pending"); setRk((x) => x + 1); } },
  ];

  const errorCard = (msg: string, retry: () => void) => (
    <div className="v3-dcard v3-uerror" role="alert">
      <span className="v3-uerror-ico" aria-hidden="true">!</span>
      <strong>Не вдалося завантажити {tab === "tickets" ? "звернення" : "групи"}</strong>
      <span>{msg}</span>
      <div><button type="button" className="v3-btn v3-btn-blue" onClick={retry}><RefreshCw size={14} aria-hidden="true" />Спробувати ще раз</button></div>
    </div>
  );
  const skel = (n: number) => Array.from({ length: n }, (_, i) => <div key={i} className="v3-pay-row v3-sp-row is-skel" aria-hidden="true"><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" style={{ width: "60%" }} /><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" /></div>);

  // ── tickets: empty for good (nothing ever came in) ──
  const noTicketsAtAll = !!list && !err && c && c.open + c.resolved === 0 && !q && kind === "all";
  const emptyAll = (
    <section className="v3-sp-zero">
      <div className="v3-wcard v3-sp-zero-card">
        <span className="v3-ue-ico v3-float v3-halo" aria-hidden="true"><Check size={24} strokeWidth={2.6} /></span>
        <strong>Звернень поки немає</strong>
        <p>Коли користувач надішле «Проблему чи побажання» з профілю, воно з’явиться тут з контекстом: план, пристрій, екран.<span className="v3-hide-mobile"> Нові звернення видно й на дашборді.</span></p>
      </div>
      <div className="v3-dcard v3-sp-zero-st">
        <strong>Статуси</strong>
        {(["open", "in_progress", "waiting", "resolved"] as TStatus[]).map((k, i) => <div key={k} className="v3-sp-strow" style={{ animationDelay: `${300 + i * 70}ms` }}><span className={`v3-tag ${STATUS[k].cls}`}>{STATUS[k].label}</span><span>{["щойно надійшло, ніхто не взяв", "адмін розбирається", "відповіли, чекаємо користувача", "закрито — відкриється, якщо напишуть"][i]}</span></div>)}
      </div>
    </section>
  );
  const emptyFiltered = (
    <div className="v3-sp-none">Немає звернень у цьому фільтрі · <button type="button" className="v3-link-btn" onClick={() => { setFilter("open"); setKind("all"); setQ(""); setRk((x) => x + 1); }}>показати відкриті <ArrowRight size={13} aria-hidden="true" /></button></div>
  );

  const ticketsDesk = (
    <section className="v3-pay-main">
      <div className="v3-wcard v3-pay-list" aria-busy={!list}>
        <div className="v3-pay-tools">
          <label className="v3-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Пошук звернень" placeholder="Логін або текст" value={q} onChange={(e) => { setQ(e.target.value); setRk((x) => x + 1); }} />{q && <button type="button" onClick={() => setQ("")} aria-label="Очистити пошук"><X size={14} /></button>}</label>
          <div className="v3-seg v3-seg-soft" role="group" aria-label="Фільтр звернень">
            <PillTrack active={filter} />
            {FILTERS.map((f) => <button key={f.key} type="button" className={filter === f.key ? "is-on" : ""} aria-pressed={filter === f.key} onClick={() => { setFilter(f.key); setRk((x) => x + 1); }}>{f.label}{c && c[f.key] ? <span className="v3-seg-n">{c[f.key]}</span> : null}</button>)}
          </div>
          <Dropdown className="is-light" ariaLabel="Тип звернення" value={kind} onChange={(v) => { setKind(v as TKind | "all"); setRk((x) => x + 1); }} options={KINDS} />
        </div>
        <div className="v3-pay-th v3-sp-row" role="row"><span>Звернення</span><span>Відповідальний</span><span>Оновлено</span><span className="v3-pay-r">Статус</span></div>
        {!list ? skel(5) : visible.length ? <div className={`v3-pay-rows ${rk % 2 ? "a" : "b"}`}>{visible.map((t, i) => {
          const st = STATUS[t.status]; const on = t.id === selId;
          return (
            <button key={t.id} type="button" className={`v3-pay-row v3-sp-row${on ? " is-sel" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }} aria-pressed={on} onClick={() => setSelId(t.id)}>
              <span className="v3-sp-subj"><span className="v3-sp-subj-t">{t.status === "open" && <i className="v3-sp-dot" aria-hidden="true" />}<strong>{t.subject}</strong></span><small>{KIND[t.kind]} · @{t.username}{t.plan ? ` · ${PLAN[t.plan] || t.plan}` : ""}</small></span>
              <span className="v3-sp-muted">{t.assignee ? `@${t.assignee}` : "—"}</span>
              <span className="v3-sp-muted is-sm">{ago(t.updatedAt || t.createdAt)}</span>
              <span className="v3-pay-r"><span key={t.status} className={`v3-tag ${st.cls} v3-sp-flip`}>{st.label}</span></span>
            </button>
          );
        })}</div> : emptyFiltered}
      </div>
      <Pane wide open={!!detail} paneKey={detail?.ticket.id || "-"} label={detail ? `Звернення №${detail.ticket.id}` : "Звернення"} onClose={() => setSelId(null)}>
        {detail && <TicketPane d={detail} templates={templates} me={me} assignees={assignees} online={online} onUpdate={updateTicket} />}
      </Pane>
      {list && !visible.length && !detail && <aside className="v3-dcard v3-pay-aside"><div className="v3-pay-empty is-dark"><span>Оберіть звернення, щоб побачити розмову.</span></div></aside>}
    </section>
  );

  const ticketsMobile = (
    <div className="v3-sp-m">
      <div className="v3-pay-mf">
        <Dropdown className="v3-mselect-dd" ariaLabel="Фільтр звернень" value={filter} onChange={(v) => { setFilter(v as TFilter); setRk((x) => x + 1); }} options={FILTERS.map((f) => ({ value: f.key, label: f.label }))} />
        <Dropdown className="v3-mselect-dd" align="right" ariaLabel="Тип звернення" value={kind} onChange={(v) => { setKind(v as TKind | "all"); setRk((x) => x + 1); }} options={KINDS} />
      </div>
      <ul className={`v3-pay-mlist ${rk % 2 ? "a" : "b"}`}>
        {!list ? Array.from({ length: 4 }, (_, i) => <li key={i} className="v3-pay-mcard is-skel" aria-hidden="true"><span className="v3-skel v3-skel-light" style={{ width: "60%" }} /></li>)
          : visible.length ? visible.map((t, i) => (
            <li key={t.id} style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}><button type="button" className="v3-pay-mcard v3-sp-mcard" onClick={() => { setSelId(t.id); setSheet(true); }}>
              <span className="v3-sp-mcard-l"><strong>{t.subject}</strong><small>{KIND[t.kind]} · @{t.username} · {ago(t.updatedAt || t.createdAt).replace(" тому", "")}</small></span>
              <span className={`v3-tag ${STATUS[t.status].cls}`}>{STATUS[t.status].label}</span>
            </button></li>
          )) : <li className="v3-wcard v3-pay-mnone">{emptyFiltered}</li>}
      </ul>
      {!!gc?.pending && <div className="v3-sp-alert"><span><i className="v3-sp-dot is-live" aria-hidden="true" />{gc.pending} {plural(gc.pending, "Telegram-група чекає", "Telegram-групи чекають", "Telegram-груп чекають")} перевірки</span><button type="button" className="v3-link-btn" onClick={() => setParams({ tab: "groups" })}>Перевірити <ArrowRight size={13} aria-hidden="true" /></button></div>}
      <Pane wide={false} open={sheet && !!detail} paneKey={detail?.ticket.id || "-"} label={detail ? `Звернення №${detail.ticket.id}` : "Звернення"} onClose={() => { setSheet(false); }}>
        {detail && <TicketPane d={detail} templates={templates} me={me} assignees={assignees} online={online} onUpdate={updateTicket} />}
      </Pane>
    </div>
  );

  // ── phone (design «Підтримка, мобільна») ──
  const KYIV_DAY = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(new Date(iso));
  const dayTitle = (iso: string) => {
    const d = KYIV_DAY(iso), now = Date.now();
    if (d === KYIV_DAY(new Date(now).toISOString())) return "Сьогодні";
    if (d === KYIV_DAY(new Date(now - 864e5).toISOString())) return "Вчора";
    return new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", day: "numeric", month: "long" }).format(new Date(iso));
  };
  const byDay = (() => {
    const out: [string, typeof visible][] = [];
    visible.forEach((t) => { const k = dayTitle(t.updatedAt || t.createdAt); const last = out[out.length - 1]; if (last && last[0] === k) last[1].push(t); else out.push([k, [t]]); });
    return out;
  })();
  const resetTickets = () => { setFilter("open"); setKind("all"); setQ(""); pageSearch.setQ(""); pageSearch.setOpen(false); setRk((x) => x + 1); };
  const openFilt = () => { setFDraft(filter); setKDraft(kind); setDraftN(visible.length); setFiltOpen(true); };
  const fLabel = FILTERS.find((f) => f.key === filter)?.label || "Відкриті";
  const msk = (n: number) => Array.from({ length: n }, (_, i) => <li key={i} className="v3-sp-pcard is-skel" aria-hidden="true"><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" /></li>);
  const ticketsPhone = (
    <div className="v3-sp-m">
      {list && <div className="v3-sp-pf">
        <button type="button" className="v3-sp-fbtn" aria-haspopup="dialog" onClick={openFilt}><span>{fLabel}{c ? ` · ${c[filter] ?? 0}` : ""}</span><ChevronDown size={16} strokeWidth={2.4} aria-hidden="true" /></button>
        <button type="button" className="v3-sp-fbtn" aria-haspopup="dialog" onClick={openFilt}><span>{KINDS.find((k) => k.value === kind)?.label}</span><ChevronDown size={16} strokeWidth={2.4} aria-hidden="true" /></button>
      </div>}
      {!list ? <ul className="v3-sp-plist">{msk(4)}</ul>
        : visible.length ? <div key={rk} className="v3-sp-plist">{byDay.map(([day, xs]) => <section key={day} className="v3-sp-pday">
            <p className="v3-sp-gh"><span>{day}</span><span>{xs.length}</span></p>
            <ul>{xs.map((t, i) => (
              <li key={t.id} style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}><button type="button" className="v3-sp-pcard" onClick={() => { setSelId(t.id); setSheet(true); }}>
                <span className="v3-sp-pr1">{t.status === "open" && <i className="v3-sp-dot" aria-hidden="true" />}<strong>{t.subject}</strong><span className={`v3-tag ${STATUS[t.status].cls}`}>{STATUS[t.status].label}</span></span>
                <span className="v3-sp-pr2"><small>{[KIND[t.kind], `@${t.username}`, t.plan ? PLAN[t.plan] || t.plan : ""].filter(Boolean).join(" · ")}{t.assignee && <> · <b>@{t.assignee}</b></>}</small><small>{ago(t.updatedAt || t.createdAt).replace(" тому", "")}</small></span>
              </button></li>
            ))}</ul>
          </section>)}</div>
        : <div className="v3-sp-pnone"><span className="v3-sp-pico" aria-hidden="true"><Search size={18} /></span><strong>{q.trim() ? `За «${q.trim()}» звернень немає` : "Немає звернень у цьому фільтрі"}</strong><span>Змініть фільтр або подивіться всі відкриті.</span><button type="button" className="v3-sp-pbtn" onClick={resetTickets}>Показати відкриті</button></div>}
      <Dialog open={filtOpen} onOpenChange={setFiltOpen}>
        <DialogContent className="v3-sheet v3-pay-sheet v3-sp-filt">
          <div className="v3-sp-fh"><DialogTitle>Звернення</DialogTitle><DialogDescription>Які показати</DialogDescription></div>
          <span className="v3-sp-fl">Стан</span>
          <div className="v3-sp-fsts" role="group" aria-label="Стан">{FILTERS.map((f) => (
            <button key={f.key} type="button" className={fDraft === f.key ? "is-on" : ""} aria-pressed={fDraft === f.key} onClick={() => setFDraft(f.key)}><span>{f.label}</span><b>{c ? c[f.key] ?? 0 : ""}</b><i aria-hidden="true">{fDraft === f.key && <Check size={16} strokeWidth={2.6} />}</i></button>
          ))}</div>
          <span className="v3-sp-fl">Тип</span>
          <div className="v3-sp-fseg" role="group" aria-label="Тип"><PillTrack active={kDraft} />{KINDS.map((k) => <button key={k.value} type="button" className={kDraft === k.value ? "is-on" : ""} aria-pressed={kDraft === k.value} onClick={() => setKDraft(k.value)}>{k.value === "all" ? "Усі" : k.label}</button>)}</div>
          <button type="button" className="v3-sp-apply" onClick={() => { setFilter(fDraft); setKind(kDraft); setRk((x) => x + 1); setFiltOpen(false); }}>Показати{draftN != null ? ` ${draftN}` : ""}</button>
        </DialogContent>
      </Dialog>
      <Pane wide={false} open={sheet && !!detail} paneKey={detail?.ticket.id || "-"} label={detail ? `Звернення №${detail.ticket.id}` : "Звернення"} onClose={() => { setSheet(false); }}>
        {detail && <TicketPane d={detail} templates={templates} me={me} assignees={assignees} load={load} online={online} onUpdate={updateTicket} />}
      </Pane>
    </div>
  );

  // no groups at all → a proper empty state; nothing in this filter / search → a way back to all
  const noGroupsAtAll = !!groups && (groups.counts?.all ?? groups.groups.length) === 0;
  const gEmpty = noGroupsAtAll
    ? <div className="v3-sp-gzero"><span className="v3-ue-ico v3-float v3-halo" aria-hidden="true"><Send size={22} /></span><strong>Груп ще немає</strong><span>Коли користувач Pro додасть свою Telegram-групу зі ставками, {phone ? "вона з’явиться тут. Підозрілі ми позначимо — їх варто переглянути." : "вона з’явиться тут на перевірку: посилання, хто додав, що знайшов парсер."}</span></div>
    : <div className="v3-sp-gzero"><span className="v3-ue-ico v3-float v3-halo" aria-hidden="true"><Search size={22} /></span><strong>Нічого не знайдено</strong><span>{gq.trim() ? `За «${gq.trim()}» груп немає.` : "У цьому фільтрі груп немає."}</span><button type="button" className="v3-btn v3-btn-primary" onClick={() => { setGf("all"); setGq(""); setRk((x) => x + 1); }}>Показати всі</button></div>;
  const groupRow = (g: TgGroup, i: number) => {
    const v = gView(g); const st = GVIEW[v]; const on = g.id === gSel;
    return (
      <button key={g.id} type="button" className={`v3-pay-row v3-sp-grow${on ? " is-sel" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }} aria-pressed={on} onClick={() => setGSel(g.id)}>
        <span className="v3-sp-gname"><span className="v3-sp-gav" aria-hidden="true">{g.name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "TG"}</span><span><strong>{g.name}</strong><small>{g.link?.replace(/^https?:\/\//, "") || "без посилання"}</small></span></span>
        <span>{g.addedBy ? `@${g.addedBy}${(g.people || 1) > 1 ? ` +${(g.people || 1) - 1}` : ""}` : "—"}</span>
        <span className={`v3-sp-parse is-${v}`}>{v === "rejected" ? "—" : v === "error" ? g.linkProblem : v === "pending" ? (g.flagReason ? `схоже: ${g.flagReason.toLowerCase()}` : "на перевірці") : "✓ працює"}</span>
        <span>{v === "rejected" ? "—" : g.bets7d ?? 0}</span>
        <span className="v3-pay-r"><span key={v} className={`v3-tag ${st.cls} v3-sp-flip`}>{st.label}</span></span>
      </button>
    );
  };
  const groupsMobile = (
    <div className="v3-sp-m">
      <div className="v3-pay-mf">
        <label className="v3-msearch"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Пошук груп" placeholder="Назва або хто додав" value={gq} onChange={(e) => { setGq(e.target.value); setRk((x) => x + 1); }} />{gq && <button type="button" onClick={() => setGq("")} aria-label="Очистити пошук"><X size={14} /></button>}</label>
        <Dropdown className="v3-mselect-dd" align="right" ariaLabel="Фільтр груп" value={gf} onChange={(v) => { setGf(v as GFilter); setRk((x) => x + 1); }} options={GFILTERS.map((f) => ({ value: f.key, label: `${f.label}${gc ? ` · ${gc[f.key]}` : ""}` }))} />
      </div>
      <ul className={`v3-pay-mlist ${rk % 2 ? "a" : "b"}`}>
        {!groups ? Array.from({ length: 3 }, (_, i) => <li key={i} className="v3-pay-mcard is-skel" aria-hidden="true"><span className="v3-skel v3-skel-light" style={{ width: "60%" }} /></li>)
          : gList.length ? gList.map((g, i) => (
            <li key={g.id} style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}><button type="button" className="v3-pay-mcard v3-sp-mcard" onClick={() => { setGSel(g.id); setGSheet(true); }}>
              <span className="v3-sp-gav" aria-hidden="true">{g.name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "TG"}</span>
              <span className="v3-sp-mcard-l"><strong>{g.name}</strong><small>{[g.addedBy ? `@${g.addedBy}` : "", gView(g) === "error" ? g.linkProblem : gView(g) === "ok" ? `${g.bets7d ?? 0} за 7 днів` : g.game].filter(Boolean).join(" · ")}</small></span>
              <span className={`v3-tag ${GVIEW[gView(g)].cls}`}>{GVIEW[gView(g)].label}</span>
            </button></li>
          )) : <li className="v3-wcard v3-pay-mnone">{gEmpty}</li>}
      </ul>
      <Pane wide={false} open={gSheet && !!gCur} paneKey={gCur?.id || "-"} label={gCur ? gCur.name : "Група"} onClose={() => setGSheet(false)}>
        {gCur && <GroupPane g={gCur} online={online} onChange={changeGroup} />}
      </Pane>
    </div>
  );
  const gMeta = (g: TgGroup) => {
    const v = gView(g); const who = g.addedBy ? `@${g.addedBy}${(g.people || 1) > 1 ? ` +${(g.people || 1) - 1}` : ""}` : "";
    const what = v === "pending" ? (g.flagReason ? `схоже: ${g.flagReason.toLowerCase()}` : "на перевірці") : v === "error" ? g.linkProblem : v === "ok" ? `${g.bets7d ?? 0} за 7 днів` : (g.rejectReason || "").toLowerCase();
    return [who, what].filter(Boolean).join(" · ");
  };
  const groupsPhone = (
    <div className="v3-sp-m">
      {groups && !noGroupsAtAll && <Dropdown className="v3-mselect-dd v3-sp-gdd" ariaLabel="Фільтр груп" value={gf} onChange={(v) => { setGf(v as GFilter); setRk((x) => x + 1); }}
        sheet={{ title: "Групи", note: "Які показати", cls: "v3-sp-ddsheet" }}
        options={GFILTERS.map((f) => ({ value: f.key, label: `${f.label}${gc ? ` · ${gc[f.key] ?? 0}` : ""}`, sheetLabel: f.label, hint: gc ? String(gc[f.key] ?? 0) : undefined }))} />}
      {!groups ? <ul className="v3-sp-plist">{msk(4)}</ul>
        : gList.length ? <ul key={rk} className="v3-sp-plist">{gList.map((g, i) => (
          <li key={g.id} style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}><button type="button" className="v3-sp-pcard is-g" onClick={() => { setGSel(g.id); setGSheet(true); }}>
            <span className="v3-sp-gav" aria-hidden="true">{initials(g.name)}</span>
            <span className="v3-sp-mcard-l"><strong>{g.name}</strong><small>{gMeta(g)}</small></span>
            <span className={`v3-tag ${GVIEW[gView(g)].cls}`}>{GVIEW[gView(g)].label}</span>
          </button></li>
        ))}</ul>
        : <div className="v3-sp-pnone is-g">{gEmpty}</div>}
      <Pane wide={false} open={gSheet && !!gCur} paneKey={gCur?.id || "-"} label={gCur ? gCur.name : "Група"} onClose={() => setGSheet(false)}>
        {gCur && <GroupPane g={gCur} online={online} onChange={changeGroup} />}
      </Pane>
    </div>
  );
  const groupsView = (
    <section className="v3-pay-main">
      <div className="v3-wcard v3-pay-list" aria-busy={!groups}>
        <div className="v3-pay-tools">
          <label className="v3-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Пошук груп" placeholder="Назва групи або хто додав" value={gq} onChange={(e) => { setGq(e.target.value); setRk((x) => x + 1); }} />{gq && <button type="button" onClick={() => setGq("")} aria-label="Очистити пошук"><X size={14} /></button>}</label>
          <div className="v3-seg v3-seg-soft" role="group" aria-label="Фільтр груп">
            <PillTrack active={gf} />
            {GFILTERS.map((f) => { const n = gc ? gc[f.key] : 0; return <button key={f.key} type="button" className={gf === f.key ? "is-on" : ""} aria-pressed={gf === f.key} onClick={() => { setGf(f.key); setRk((x) => x + 1); }}>{f.label}{n ? <span className="v3-seg-n">{n}</span> : null}</button>; })}
          </div>
        </div>
        <div className="v3-pay-th v3-sp-grow" role="row"><span>Група</span><span>Додав</span><span>Розбір прогнозів</span><span>7 днів</span><span className="v3-pay-r">Стан</span></div>
        {!groups ? skel(4) : gList.length ? <div className={`v3-pay-rows ${rk % 2 ? "a" : "b"}`}>{gList.map(groupRow)}</div> : gEmpty}
      </div>
      <Pane wide open={!!gCur} paneKey={gCur?.id || "-"} label={gCur ? gCur.name : "Група"} onClose={() => setGSel(null)}>
        {gCur && <GroupPane g={gCur} online={online} onChange={changeGroup} />}
      </Pane>
    </section>
  );

  return (
    <div className="v3-page v3-support">
      <section className="v3-hero v3-hero-row">
        <div>
          <h1 className="v3-title">Підтримка</h1>
          <p className="v3-subtitle"><span className="v3-hide-mobile">Звернення з форми «Проблема чи побажання» й модерація Telegram-груп, які додали користувачі Pro.</span><span className="v3-only-mobile">{sub}</span></p>
        </div>
      </section>

      {!online && <div className="v3-offline-users" role="status"><WifiOff size={16} aria-hidden="true" /><span>Немає інтернету. Відповіді й зміни не збережуться — дочекайтесь з’єднання.</span></div>}

      {phone && !(tab === "tickets" && noTicketsAtAll) && !(tab === "groups" && noGroupsAtAll) && (
        <section key={`mk-${tab}`} className="v3-sp-mkpis" aria-label="Підсумки">
          {(tab === "tickets" ? !list : !groups) ? [0, 1].map((i) => <div key={i} className="is-skel" aria-hidden="true"><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" /><span className="v3-skel v3-skel-light" /></div>)
            : (tab === "tickets" ? [sums[0], sums[1]] : [{ ...sums[0], l: "Груп у Pro" }, sums[3]]).map((x, i) => (
              <button key={x.k} type="button" className={i === 0 ? "is-blue" : ""} onClick={x.go} disabled={!x.go}>
                <span>{x.l}</span>
                <b className={x.k === "p" && x.v !== "0" ? "is-bad" : ""}><RollingNumber key={`${x.k}-${x.v}`} text={x.v} /></b>
                <small>{x.n}</small>
              </button>
            ))}
        </section>
      )}

      <div className="v3-mx-tabsw v3-sp-tabsw">
        <div className="v3-pay-tabs v3-mx-tabs v3-sp-tabs" role="tablist" aria-label="Розділи підтримки">
          <PillTrack active={tab} />
          <button type="button" role="tab" aria-selected={tab === "tickets"} className={`v3-pay-tab${tab === "tickets" ? " is-on" : ""}`} onClick={() => setParams({})}><span className="v3-pay-tab-n">{c ? c.open : "…"}</span>Звернення{phone && c?.open ? <span className="v3-sp-tc">· {c.open}</span> : null}</button>
          <button type="button" role="tab" aria-selected={tab === "groups"} className={`v3-pay-tab${tab === "groups" ? " is-on" : ""}${gc?.pending ? " is-err" : ""}`} onClick={() => setParams({ tab: "groups" })}><span className="v3-pay-tab-n">{gc ? gc.pending || gc.all : "…"}</span>{phone ? "Telegram-групи" : "Telegram-групи Pro"}{phone && gc && (gc.pending || gc.all) ? <span className="v3-sp-tc">· {gc.pending || gc.all}</span> : null}</button>
        </div>
      </div>

      {wide && !(tab === "tickets" && noTicketsAtAll) && (
        <section key={`sums-${tab}`} className="v3-sums v3-pay-sums v3-sp-sums" aria-label="Підсумки">
          {sums.map((x) => (
            <button key={x.k} type="button" className={`v3-sum${x.on ? " is-on" : ""}${x.go ? "" : " is-static"}`} onClick={x.go} disabled={!x.go}>
              <span className="v3-sum-l">{x.l}</span>
              <strong className={`v3-sum-v${"bad" in x && x.bad ? " v3-mx-bad" : ""}${"amber" in x && x.amber ? " v3-mx-amber" : ""}`}><RollingNumber key={`${x.k}-${x.v}`} text={x.v} /></strong>
              <span className="v3-sum-n"><span className="v3-pay-note">{x.n}</span></span>
            </button>
          ))}
        </section>
      )}

      <div key={`pane-${tab}`} className="v3-pay-pane">
        {tab === "tickets"
          ? (err && !list ? errorCard(err, loadTickets) : noTicketsAtAll ? emptyAll : wide ? ticketsDesk : phone ? ticketsPhone : ticketsMobile)
          : (gErr && !groups ? errorCard(gErr, loadGroups) : wide ? groupsView : phone ? groupsPhone : groupsMobile)}
      </div>
      {tab === "tickets" && !list && !err && <span className="sr-only" role="status">Завантаження звернень…</span>}
    </div>
  );
}

/** Phone keeps its own layout; from 768 px the light web page. */
export default function Support() {
  const phone = useMedia("(max-width: 767px)");
  return phone ? <SupportLegacy /> : <SupportWeb />;
}
