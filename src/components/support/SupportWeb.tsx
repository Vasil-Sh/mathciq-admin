import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Ban, Check, ChevronDown, ExternalLink, Lightbulb, MessageSquare, RefreshCw, Search, Send, WifiOff, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import PillTrack from "@/components/PillTrack";
import RollingNumber from "@/components/RollingNumber";
import UndoRing from "@/components/UndoRing";
import { useOnline } from "@/hooks/useMediaOnline";
import { useAuth } from "@/contexts/AuthContext";
import { plural } from "@/lib/dashboardInsights";
import { openTelegram } from "@/lib/telegram";
import {
  DEFAULT_TEMPLATES, GVIEW, KIND, PLAN, REASONS, STATUS, ago, approveGroup, bubbleTime, fetchGroup, fetchGroups, fetchTemplates, fetchTicket, fetchTickets, gView, minutesText, patchTicket, rejectGroup, replyTicket,
  type GStatus, type GroupDetail, type GroupList, type TFilter, type TKind, type TMessage, type TStatus, type Template, type TgGroup, type Ticket, type TicketDetail, type TicketList,
} from "@/lib/supportApi";

type Tab = "tickets" | "groups";
type GFilter = GStatus | "all" | "errors";
const FILTERS: { key: TFilter; label: string }[] = [{ key: "open", label: "Відкриті" }, { key: "new", label: "Нові" }, { key: "mine", label: "Мої" }, { key: "resolved", label: "Вирішені" }];
const KINDS: { value: TKind | "all"; label: string }[] = [{ value: "all", label: "Усі типи" }, { value: "problem", label: "Проблеми" }, { value: "idea", label: "Побажання" }, { value: "question", label: "Питання" }];
const GFILTERS: { key: GFilter; label: string }[] = [{ key: "all", label: "Усі" }, { key: "pending", label: "Перевірити" }, { key: "errors", label: "Помилки" }, { key: "rejected", label: "Заблоковані" }];
const STATUS_OPTS: TStatus[] = ["open", "in_progress", "waiting", "resolved"];
/** light web tag colour per status */
const ST_CLS: Record<TStatus, string> = { open: "is-blue", in_progress: "is-amber", waiting: "is-violet", resolved: "is-green", closed: "is-green" };
const ST_NOTE = (s: TStatus, user: string) => ({ open: "щойно надійшло, ніхто не взяв", in_progress: "адмін розбирається", waiting: "відповіли, чекаємо користувача", resolved: `закрито — @${user} отримає сповіщення`, closed: "закрито" }[s]);
const G_CLS: Record<string, string> = { pending: "is-amber", ok: "is-green", error: "is-red", rejected: "is-grey" };
const COLORS = ["#e8590c", "#2f6fed", "#7c3aed", "#475467", "#0e9f6e", "#d6336c", "#1098ad"];
const colorOf = (s: string) => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const initials = (name: string) => name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "TG";
const KYIV = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv" }).format(new Date(iso));
const dayTitle = (iso: string) => {
  const d = KYIV(iso), now = Date.now();
  if (d === KYIV(new Date(now).toISOString())) return "Сьогодні";
  if (d === KYIV(new Date(now - 864e5).toISOString())) return "Вчора";
  return new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", day: "numeric", month: "long" }).format(new Date(iso));
};
const shortAgo = (iso: string) => {
  const a = ago(iso); if (dayTitle(iso) === "Сьогодні") return a.replace(" тому", "").replace("годин", "год").replace("хвилин", "хв");
  if (dayTitle(iso) === "Вчора") return "вчора";
  return new Intl.DateTimeFormat("uk-UA", { timeZone: "Europe/Kyiv", day: "numeric", month: "short" }).format(new Date(iso));
};

/** Pill button with a small menu under it; closes on outside click and Esc. */
function Pop({ label, cls = "", head, children, open, setOpen }: { label: ReactNode; cls?: string; head: string; children: ReactNode; open: boolean; setOpen: (v: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", off); document.removeEventListener("keydown", esc); };
  }, [open, setOpen]);
  return (
    <div ref={ref} className="v3-spw-pop">
      <button type="button" className={`v3-spw-popb ${cls}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>{label}<ChevronDown size={13} aria-hidden="true" /></button>
      {open && <div className="v3-spw-menu" role="menu"><span className="v3-spw-menu-h">{head}</span>{children}</div>}
    </div>
  );
}

// ───────────── ticket on the right ─────────────
function TicketView({ d, templates, me, assignees, load, online, onUpdate }: {
  d: TicketDetail; templates: Template[]; me: string; assignees: string[]; load: Record<string, number>; online: boolean;
  onUpdate: (patch: { status?: TStatus; assignee?: string | null; message?: TMessage }) => void;
}) {
  const t = d.ticket;
  const [text, setText] = useState("");
  const [tpl, setTpl] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [send, setSend] = useState<"" | "busy" | "done">("");
  const [stOpen, setStOpen] = useState(false);
  const [asOpen, setAsOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { setText(""); setTpl(null); setShake(0); }, [t.id]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "nearest" }); }, [d.messages.length, t.id]);
  const msgs: TMessage[] = [{ author: t.username, fromAdmin: false, body: t.message, createdAt: t.createdAt }, ...d.messages];
  const status = t.status === "closed" ? "resolved" : t.status;
  const aiFull = d.context.aiToday != null && d.context.aiLimit != null && d.context.aiToday >= d.context.aiLimit;
  const done = status === "resolved";

  async function setStatus(next: TStatus) {
    const was = t.status; setStOpen(false);
    if (next === was) return;
    onUpdate({ status: next });
    try {
      await patchTicket(t.id, { status: next });
      toast.success(`№${t.id} · ${STATUS[next].label}`, {
        description: next === "resolved" ? `@${t.username} отримає сповіщення` : "Статус змінено", duration: 10_000, className: "v3-toast-10s",
        action: { label: <UndoRing />, onClick: () => { onUpdate({ status: was }); patchTicket(t.id, { status: was }).catch((e) => toast.error("Не вдалося повернути статус", { description: (e as Error).message })); } },
      });
    } catch (e) { onUpdate({ status: was }); toast.error("Не вдалося змінити статус", { description: (e as Error).message }); }
  }
  async function setAssignee(next: string | null) {
    const was = t.assignee; setAsOpen(false);
    if (next === was) return;
    onUpdate({ assignee: next });
    try { await patchTicket(t.id, { assignee: next }); toast.info(next ? `Веде: @${next}` : "Відповідального знято", { description: `№${t.id} · ${t.subject}` }); }
    catch (e) { onUpdate({ assignee: was }); toast.error("Не вдалося змінити відповідального", { description: (e as Error).message }); }
  }
  async function doSend() {
    if (send) return;
    if (!text.trim()) { setShake((x) => x + 1); toast.error("Напишіть відповідь", { description: "Поле порожнє — оберіть шаблон або напишіть текст" }); return; }
    setSend("busy");
    try {
      const r = await replyTicket(t.id, text.trim(), done ? "resolved" : undefined);
      onUpdate({ status: r.status, assignee: r.assignee, message: r.message });
      setText(""); setTpl(null); setShake(0); setSend("done");
      toast.success("Відповідь надіслано", { description: `@${t.username} отримає її в застосунку${r.telegram ? " й у Telegram" : ""}` });
      window.setTimeout(() => setSend(""), 1400);
    } catch (e) { setSend(""); toast.error("Не вдалося надіслати", { description: (e as Error).message }); }
  }

  return (
    <>
      <div className="v3-spw-th">
        <div><span className="v3-spw-kick">{KIND[t.kind] || "Звернення"} · №{t.id}</span><h2>{t.subject}</h2></div>
        <div className="v3-spw-th-r">
          <Pop open={stOpen} setOpen={setStOpen} cls={`is-st ${ST_CLS[status]}`} head={`Статус · №${t.id}`} label={<>Статус: <b key={status} className="v3-spw-flip">{STATUS[status].label}</b></>}>
            {STATUS_OPTS.map((s) => <button key={s} type="button" role="menuitemradio" aria-checked={status === s} disabled={!online} className={status === s ? "is-on" : ""} onClick={() => setStatus(s)}>
              <i className={`v3-spw-dot ${ST_CLS[s]}`} aria-hidden="true" /><span><b>{STATUS[s].label}</b><small>{ST_NOTE(s, t.username)}</small></span>{status === s && <Check size={15} aria-hidden="true" />}</button>)}
          </Pop>
          <Pop open={asOpen} setOpen={setAsOpen} head={`Хто веде звернення №${t.id}`} label={<>Веде: <b>{t.assignee ? `@${t.assignee}` : "ніхто"}</b></>}>
            {assignees.map((a) => <button key={a} type="button" role="menuitemradio" aria-checked={t.assignee === a} disabled={!online} className={t.assignee === a ? "is-on" : ""} onClick={() => setAssignee(a)}>
              <i className="v3-spw-av" aria-hidden="true">{initials(a)}</i><span><b>@{a}</b><small>{a === me ? "я · " : ""}в роботі {load[a] || 0}</small></span>{t.assignee === a && <Check size={15} aria-hidden="true" />}</button>)}
            <button type="button" role="menuitemradio" aria-checked={!t.assignee} disabled={!online} className={!t.assignee ? "is-on" : ""} onClick={() => setAssignee(null)}>
              <i className="v3-spw-av is-none" aria-hidden="true">—</i><span><b>Ніхто</b><small>зняти відповідального</small></span>{!t.assignee && <Check size={15} aria-hidden="true" />}</button>
          </Pop>
        </div>
      </div>
      <div className="v3-spw-chips">
        <Link to={`/users?q=${encodeURIComponent(t.username)}`} className="v3-spw-chip is-user"><i aria-hidden="true">{initials(t.username)}</i>@{t.username}{t.plan ? ` · ${PLAN[t.plan] || t.plan}` : ""}<ArrowRight size={12} aria-hidden="true" /></Link>
        {d.context.aiToday != null && <span className={`v3-spw-chip${aiFull ? " is-red" : ""}`}>AI сьогодні {d.context.aiToday}{d.context.aiLimit ? ` з ${d.context.aiLimit}` : ""}</span>}
        {t.meta?.device && <span className="v3-spw-chip">{t.meta.device}</span>}
        {t.meta?.appVersion && <span className="v3-spw-chip">v{t.meta.appVersion.replace(/^v/, "")}</span>}
        {t.meta?.screen && <span className="v3-spw-chip">Екран: {t.meta.screen}</span>}
      </div>
      <div className="v3-spw-thread" aria-label="Розмова">
        {msgs.map((m, i) => (
          <div key={m.id || `m${i}`} className={`v3-spw-msg${m.fromAdmin ? " is-me" : ""}`} style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
            <span>@{m.author} · {bubbleTime(m.createdAt)}</span><p>{m.body}</p>
          </div>
        ))}
        {!done && d.context.hints?.map((h) => <div key={h} className="v3-spw-hint"><Lightbulb size={13} aria-hidden="true" />Підказка: {h[0].toLowerCase() + h.slice(1)}</div>)}
        <div ref={bottom} />
      </div>
      <div className="v3-spw-reply">
        <div className="v3-spw-tpls" role="group" aria-label="Шаблони відповіді">
          <span>Шаблони:</span>
          {templates.map((p) => <button key={p.id} type="button" className={tpl === p.id ? "is-on" : ""} aria-pressed={tpl === p.id} onClick={() => { if (tpl === p.id) { setTpl(null); setText(""); } else { setTpl(p.id); setText(p.body); } }}>{p.title}</button>)}
        </div>
        <label className="sr-only" htmlFor={`spw-reply-${t.id}`}>Відповідь</label>
        <textarea id={`spw-reply-${t.id}`} key={`r-${shake}`} className={`v3-spw-text${shake ? (shake % 2 ? " v3-shake-a" : " v3-shake-b") : ""}${shake && !text.trim() ? " is-err" : ""}`} rows={3} maxLength={5000}
          placeholder="Відповідь — прийде в застосунок і в Telegram" value={text} onChange={(e) => { setText(e.target.value); if (tpl) setTpl(null); }}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void doSend(); } }} />
        <div className="v3-spw-foot">
          <span>Після відповіді статус: <b>{done ? "Вирішено" : "Чекає відповіді"}</b></span>
          <div>
            {!done && <button type="button" className="v3-uwb" disabled={!online} onClick={() => setStatus("resolved")}>Вирішено без відповіді</button>}
            <button type="button" className={`v3-uwb is-green v3-spw-send${!text.trim() ? " is-idle" : ""}`} disabled={!online || send === "busy"} onClick={doSend} aria-live="polite">
              {send === "busy" ? "Надсилаємо…" : send === "done" ? <><Check size={15} strokeWidth={3} aria-hidden="true" />Надіслано</> : <><Send size={14} aria-hidden="true" />Надіслати</>}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ───────────── group on the right ─────────────
const RES: Record<string, [string, string]> = { win: ["зайшов", "is-win"], won: ["зайшов", "is-win"], loss: ["не зайшов", "is-loss"], lost: ["не зайшов", "is-loss"], lose: ["не зайшов", "is-loss"] };
function GroupView({ g, online, onChange }: { g: TgGroup; online: boolean; onChange: (id: string, next: GStatus, reason: string | null) => void }) {
  const [reason, setReason] = useState(0);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [det, setDet] = useState<GroupDetail | null>(null);
  useEffect(() => {
    setAsk(false); setDet(null);
    const r = REASONS.indexOf((g.flagReason || "") as (typeof REASONS)[number]); setReason(r >= 0 ? r : 0);
    let live = true; fetchGroup(g.id).then((x) => { if (live) setDet(x); }).catch(() => {});
    return () => { live = false; };
  }, [g.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const view = gView(g), people = g.people || 1;
  const texts = det?.group.flaggedTexts || [];
  const link = g.link ? (g.link.startsWith("http") ? g.link : `https://${g.link.replace(/^@/, "t.me/")}`) : null;
  const ERR: Record<string, string> = {
    none: "Без посилання розбір не знає, звідки брати прогнози. Попросіть додати посилання на групу.",
    bad: "Посилання веде не на Telegram. Потрібне посилання виду t.me/назва.",
    private: "Це посилання-запрошення в закриту групу: її пости не видно. Попросіть публічне посилання або додати бота MatchIQ у групу.",
  };
  const hint = `Група зникне в усіх, хто її додав (${people} ${plural(people, "людина", "людини", "людей")}), розбір зупиниться.${g.addedBy ? ` @${g.addedBy} отримає пояснення.` : ""}`;
  async function act(next: GStatus) {
    const was = g.moderationStatus, wasReason = g.rejectReason, why = next === "rejected" ? REASONS[reason] : null;
    setBusy(true);
    try {
      if (next === "rejected") await rejectGroup(g.id, why!); else await approveGroup(g.id);
      onChange(g.id, next, why);
      const undo = { label: <UndoRing />, onClick: () => { (was === "rejected" ? rejectGroup(g.id, wasReason || REASONS[0]) : approveGroup(g.id)).then(() => onChange(g.id, was, wasReason)).catch((e) => toast.error("Не вдалося повернути", { description: (e as Error).message })); } };
      const opts = was === "pending" ? {} : { duration: 10_000, className: "v3-toast-10s", action: undo };
      if (next === "rejected") toast.success(`${g.name} заблоковано`, { description: `${why} · група зникла в ${people} ${plural(people, "людини", "людей", "людей")}`, ...opts });
      else toast.success(was === "pending" ? `${g.name} — усе гаразд` : `${g.name} розблоковано`, { description: was === "pending" ? "Позначку знято, розбір працює далі" : "Група знову видна, розбір відновлено", ...opts });
    } catch (e) { toast.error("Не вдалося змінити стан групи", { description: (e as Error).message }); }
    finally { setBusy(false); setAsk(false); }
  }
  const meta = [g.link?.replace(/^https?:\/\//, "") || "без посилання", g.game, g.addedBy ? `додав @${g.addedBy}${people > 1 ? ` +${people - 1}` : ""}` : ""].filter(Boolean).join(" · ");
  return (
    <>
      <div className="v3-spw-gh">
        <span className="v3-spw-gav is-lg" style={{ background: colorOf(g.name) }} aria-hidden="true">{initials(g.name)}</span>
        <div><h2>{g.name}</h2><span className="v3-spw-kick">{meta}</span></div>
        <span key={view} className={`v3-uwt ${G_CLS[view]} v3-spw-flip`}>{GVIEW[view].label}</span>
        {link && g.linkState !== "bad" && <a className="v3-uwb" href={link} target="_blank" rel="noreferrer">Відкрити в Telegram<ExternalLink size={13} aria-hidden="true" /></a>}
      </div>
      {view === "error" && <div className="v3-spw-err"><strong>{g.linkProblem ? g.linkProblem[0].toUpperCase() + g.linkProblem.slice(1) : "Розбір не працює"}</strong><span>{ERR[g.linkState || "none"]}</span></div>}
      {view === "rejected" && <div className="v3-spw-note">Заблоковано{g.reviewedAt ? ` ${bubbleTime(g.reviewedAt)}` : ""}{g.rejectReason ? <> · <b>{g.rejectReason}</b></> : ""}{g.reviewedBy ? ` · @${g.reviewedBy}` : ""}. Група прихована в {people} {plural(people, "людини", "людей", "людей")}, розбір зупинено.</div>}
      {view === "ok" && <div className="v3-spw-tiles">
        <div><span>Прогнози · 7 дн.</span><b>{g.bets7d ?? 0}</b></div>
        <div><span>Влучність</span><b>{g.hitRate != null ? `${g.hitRate}%` : "—"}</b></div>
        <div><span>Останній</span><b>{g.lastBetAt ? ago(g.lastBetAt).replace(" тому", "").replace("годин", "год") : "—"}</b></div>
      </div>}
      {view === "ok" && !!det?.recentBets.length && <div className="v3-spw-bets"><span className="v3-spw-lbl">Останні прогнози</span>
        {det.recentBets.slice(0, 5).map((b, i) => { const r = RES[(b.result || "").toLowerCase()] || ["наживо", "is-live"]; return <div key={i}><span>{b.match || "Матч"}{b.betType ? ` · ${b.betType}` : ""}</span><b className={r[1]}>{r[0]}</b></div>; })}
      </div>}
      {view === "pending" && texts.length > 0 && <><span className="v3-spw-lbl">Чому позначено</span>
        {texts.map((x, i) => <div key={x.field} className="v3-spw-post" style={{ animationDelay: `${i * 70}ms` }}><span>«{x.parts.map((p, k) => p.hl ? <mark key={k}>{p.t}</mark> : <span key={k}>{p.t}</span>)}»</span><small>{x.field === "name" ? "назва групи" : "опис від користувача"}</small></div>)}
      </>}
      {view !== "rejected" && <>
        <span className="v3-spw-lbl">Причина блокування</span>
        <div className="v3-spw-seg" role="group" aria-label="Причина блокування">
          <PillTrack active={reason} />
          {REASONS.map((r, i) => <button key={r} type="button" className={reason === i ? "is-on" : ""} aria-pressed={reason === i} onClick={() => setReason(i)}>{r === "Договірні матчі" ? "Договірні" : r}</button>)}
        </div>
        <small className="v3-spw-small">{hint}</small>
      </>}
      <div className="v3-spw-gacts">
        {view === "rejected" ? <button type="button" className="v3-uwb" disabled={!online || busy} onClick={() => act("approved")}>{busy ? "Розблоковуємо…" : "Розблокувати"}</button> : <>
          {view === "pending" ? <button type="button" className="v3-uwb is-green" disabled={!online || busy} onClick={() => act("approved")}>Усе гаразд</button>
            : view === "error" && g.addedBy ? <button type="button" className="v3-uwb is-blue" disabled={!online} onClick={() => openTelegram(g.addedBy!)}>Написати @{g.addedBy}</button> : <span />}
          <button type="button" className="v3-uwb is-red" disabled={!online || busy} onClick={() => setAsk(true)}>Заблокувати</button>
        </>}
      </div>
      <Dialog open={ask} onOpenChange={(o) => { if (!o && !busy) setAsk(false); }}>
        <DialogContent className="v3-modal v3-uwm v3-uwm-del v3-adw-del" style={{ maxWidth: 400 }} onOpenAutoFocus={(e) => e.preventDefault()}>
          <span className="v3-uwm-ico is-red" aria-hidden="true"><Ban size={18} /></span>
          <DialogTitle className="v3-modal-title">Точно заблокувати?</DialogTitle>
          <DialogDescription className="v3-modal-sub">«{g.name}» зникне в усіх, хто її додав ({people} {plural(people, "людина", "людини", "людей")}), розбір зупиниться.{g.addedBy ? ` @${g.addedBy} отримає пояснення.` : ""}</DialogDescription>
          <div className="v3-spw-askrow"><span>Причина</span><b>{REASONS[reason]}</b></div>
          <button type="button" className="v3-uwb is-red" disabled={busy} onClick={() => act("rejected")}>{busy ? "Блокуємо…" : "Заблокувати"}</button>
          <button type="button" className="v3-uwb" disabled={busy} onClick={() => setAsk(false)}>Скасувати</button>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ───────────── page ─────────────
export default function SupportWeb() {
  const online = useOnline();
  const { user } = useAuth();
  const me = user?.username || "";
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "groups" ? "groups" : "tickets";
  const [filter, setFilter] = useState<TFilter>("open");
  const [kind, setKind] = useState<TKind | "all">("all");
  const [q, setQ] = useState("");
  const [list, setList] = useState<TicketList | null>(null);
  const [err, setErr] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [templates, setTemplates] = useState<Template[]>(DEFAULT_TEMPLATES);
  const [gf, setGf] = useState<GFilter>("all");
  const [gq, setGq] = useState("");
  const [groups, setGroups] = useState<GroupList | null>(null);
  const [gErr, setGErr] = useState("");
  const [gSel, setGSel] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    try { setList(await fetchTickets(filter, kind === "all" ? "" : kind, q)); setErr(""); } catch (e) { setErr((e as Error).message || "Сервер не відповідає"); }
  }, [filter, kind, q]);
  const loadGroups = useCallback(async () => {
    try { setGroups(await fetchGroups(gf, gq)); setGErr(""); } catch (e) { setGErr((e as Error).message || "Сервер не відповідає"); }
  }, [gf, gq]);
  useEffect(() => { const id = window.setTimeout(loadTickets, q ? 250 : 0); return () => window.clearTimeout(id); }, [loadTickets, q]);
  useEffect(() => { const id = window.setTimeout(loadGroups, gq ? 250 : 0); return () => window.clearTimeout(id); }, [loadGroups, gq]);
  useEffect(() => { fetchTemplates().then(setTemplates).catch(() => {}); }, []);

  const tickets = list?.tickets || [];
  const visible = tickets.filter((t) => filter !== "open" || !["resolved", "closed"].includes(t.status));
  useEffect(() => { if (visible.length && !visible.some((t) => t.id === selId)) setSelId(visible[0].id); if (list && !visible.length) setSelId(null); }, [list, visible.map((t) => t.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selId) { setDetail(null); return; }
    let live = true;
    fetchTicket(selId).then((x) => { if (live) setDetail(x); }).catch((e) => { if (live) toast.error("Не вдалося відкрити звернення", { description: (e as Error).message }); });
    return () => { live = false; };
  }, [selId]);
  const gList = groups?.groups || [];
  useEffect(() => { if (gList.length && !gList.some((g) => g.id === gSel)) setGSel(gList[0].id); }, [gList, gSel]);
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
    setList((l) => l ? { ...l, tickets: l.tickets.map((t) => t.id === selId ? { ...t, ...(patch.status ? { status: patch.status } : {}), ...(patch.assignee !== undefined ? { assignee: patch.assignee } : {}), updatedAt: new Date().toISOString() } : t) } : l);
    window.setTimeout(() => { fetchTickets(filter, kind === "all" ? "" : kind, q).then((x) => setList((l) => l ? { ...l, counts: x.counts, stats: x.stats } : x)).catch(() => {}); }, 300);
  }
  function changeGroup(id: string, next: GStatus, reason: string | null) {
    setGroups((g) => g ? { ...g, groups: g.groups.map((x) => x.id === id ? { ...x, moderationStatus: next, rejectReason: reason, reviewedBy: me, reviewedAt: new Date().toISOString() } : x) } : g);
    window.setTimeout(() => { fetchGroups(gf, gq).then((x) => setGroups((g) => g ? { ...g, counts: x.counts, summary: x.summary } : x)).catch(() => {}); }, 300);
  }

  const c = list?.counts, s = list?.stats, gc = groups?.counts, gs = groups?.summary;
  const waiting = tickets.filter((t) => t.status === "waiting").length;
  const noTickets = !!list && !err && !!c && c.open + c.resolved === 0 && !q && kind === "all";
  const noGroups = !!groups && (gc?.all ?? gList.length) === 0;
  const sub = tab === "tickets" ? (s ? `${s.new} ${plural(s.new, "нове", "нові", "нових")} · ${s.inWork} в роботі` : "завантажуємо…") : (gc ? `${gc.pending} на перевірці · ${gc.errors} з помилкою` : "завантажуємо…");
  const kpis = tab === "tickets" ? [
    { k: "n", l: "Нові", v: s ? String(s.new) : "…", n: !s ? "" : s.oldestNewAt ? `найстаріше — ${ago(s.oldestNewAt)}` : "усе розібрано", go: () => setFilter("new") },
    { k: "w", l: "В роботі", v: s ? String(s.inWork) : "…", n: !s ? "" : s.inWorkBy.length ? s.inWorkBy.map((a) => `@${a.assignee} · ${a.count}`).join(", ") : "ніхто не веде", go: () => setFilter("mine") },
    { k: "wt", l: "Чекають відповіді", v: list ? String(waiting) : "…", n: list ? "відповіли, чекаємо користувача" : "" },
    { k: "r", l: "Вирішено · 7 днів", v: s ? String(s.resolvedWeek) : "…", n: !s ? "" : s.resolvedWeek ? `середній час відповіді ${minutesText(s.avgFirstReplyMin)}` : "ще нічого не закрито", go: () => setFilter("resolved") },
  ] : [
    { k: "a", l: "Груп у Pro", v: gs ? String(gs.all) : gc ? String(gc.all) : "…", n: gs ? (gs.all ? `у ${gs.people} ${plural(gs.people, "людини", "людей", "людей")}` : "ще ніхто не додав") : "", go: () => setGf("all") },
    { k: "p", l: "Потребують перевірки", v: gc ? String(gc.pending) : "…", n: !gc ? "" : gs?.pendingReason ? `схоже на «${gs.pendingReason.toLowerCase()}»` : gc.pending ? "перегляньте" : "усе гаразд", warn: !!gc?.pending, go: () => setGf("pending") },
    { k: "e", l: "З помилкою", v: gc ? String(gc.errors) : "…", n: gc ? "закриті або недоступні" : "", bad: !!gc?.errors, go: () => setGf("errors") },
    { k: "b", l: "Заблоковано", v: gc ? String(gc.rejected) : "…", n: gc ? "приховані в усіх" : "", go: () => setGf("rejected") },
  ];

  const byDay = (() => { const out: [string, Ticket[]][] = []; visible.forEach((t) => { const k = dayTitle(t.updatedAt || t.createdAt); const last = out[out.length - 1]; if (last && last[0] === k) last[1].push(t); else out.push([k, [t]]); }); return out; })();
  const errorCard = (msg: string, retry: () => void) => (
    <div className="v3-adw-card"><div className="v3-uw-empty is-err" role="alert"><span>!</span><strong>Не вдалося завантажити {tab === "tickets" ? "звернення" : "групи"}</strong><p>{msg}</p><div><button type="button" className="v3-uwb is-green" onClick={retry}><RefreshCw size={14} aria-hidden="true" />Спробувати ще раз</button></div></div></div>
  );
  const skel = <section className="v3-spw-split" role="status" aria-label="Завантаження"><div className="v3-adw-card v3-spw-list v3-adw-skel">{[0, 1, 2, 3].map((i) => <i key={i} style={{ height: 52 }} />)}</div><div className="v3-adw-card v3-adw-skel v3-spw-main">{[24, 52, 40, 120].map((h, i) => <i key={i} style={{ height: h }} />)}</div></section>;
  const pick = <div className="v3-adw-card v3-spw-main v3-adw-empty"><span aria-hidden="true"><MessageSquare size={20} /></span><strong>Виберіть звернення</strong><p>Ліворуч — список. Тут буде переписка з користувачем і його контекст.</p></div>;

  const ticketsView = !list ? skel : (
    <section className="v3-spw-split">
      {noTickets ? <div className="v3-adw-card v3-spw-list v3-adw-empty"><span aria-hidden="true"><MessageSquare size={20} /></span><strong>Звернень поки немає</strong><p>Коли користувач надішле «Проблему чи побажання» з профілю, воно з’явиться тут з контекстом: план, пристрій, екран.</p></div>
        : !visible.length ? <div className="v3-adw-card v3-spw-list v3-adw-empty"><span aria-hidden="true"><MessageSquare size={20} /></span><strong>{q.trim() ? `За «${q.trim()}» звернень немає` : "Немає звернень у цьому фільтрі"}</strong><p>Змініть фільтр або подивіться всі відкриті.</p><button type="button" className="v3-uwb is-green" onClick={() => { setFilter("open"); setKind("all"); setQ(""); }}>Показати відкриті</button></div>
        : <div key={`${filter}-${kind}`} className="v3-adw-card v3-spw-list">{byDay.map(([day, xs]) => <section key={day}>
          <h3>{day} <span>{xs.length}</span></h3>
          {xs.map((t, i) => { const st = t.status === "closed" ? "resolved" : t.status; return (
            <button key={t.id} type="button" className={`v3-spw-item${t.id === selId ? " is-sel" : ""}`} style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }} aria-pressed={t.id === selId} onClick={() => setSelId(t.id)}>
              <span className="v3-spw-item-r1"><strong>{t.subject}</strong><small>{shortAgo(t.updatedAt || t.createdAt)}</small></span>
              <span className="v3-spw-item-r2"><span key={st} className={`v3-uwt ${ST_CLS[st]} v3-spw-flip`}>{STATUS[st].label}</span><small>{[KIND[t.kind], `@${t.username}`, t.plan ? PLAN[t.plan] || t.plan : "", t.assignee ? `веде @${t.assignee}` : ""].filter(Boolean).join(" · ")}</small></span>
            </button>
          ); })}
        </section>)}</div>}
      {detail && visible.some((t) => t.id === detail.ticket.id) ? <article key={detail.ticket.id} className="v3-adw-card v3-spw-main"><TicketView d={detail} templates={templates} me={me} assignees={assignees} load={load} online={online} onUpdate={updateTicket} /></article>
        : selId ? <div className="v3-adw-card v3-adw-skel v3-spw-main">{[24, 52, 40, 120].map((h, i) => <i key={i} style={{ height: h }} />)}</div> : pick}
    </section>
  );
  const groupsView = !groups ? skel : noGroups ? (
    <div className="v3-adw-card v3-adw-empty v3-spw-gzero"><span aria-hidden="true"><Send size={20} /></span><strong>Груп ще немає</strong><p>Коли користувач Pro додасть свою Telegram-групу зі ставками, вона з’явиться тут. Підозрілі ми позначимо — їх варто переглянути.</p></div>
  ) : (
    <section className="v3-spw-split">
      {gList.length ? <div key={gf} className="v3-adw-card v3-spw-list">{gList.map((g, i) => { const v = gView(g); return (
        <button key={g.id} type="button" className={`v3-spw-item is-g${g.id === gSel ? " is-sel" : ""}`} style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }} aria-pressed={g.id === gSel} onClick={() => setGSel(g.id)}>
          <span className="v3-spw-gav" style={{ background: colorOf(g.name) }} aria-hidden="true">{initials(g.name)}</span>
          <span className="v3-spw-gn"><strong>{g.name}</strong><small>{[g.addedBy ? `@${g.addedBy}${(g.people || 1) > 1 ? ` +${(g.people || 1) - 1}` : ""}` : "", v === "pending" ? (g.flagReason ? `схоже: ${g.flagReason.toLowerCase()}` : "на перевірці") : v === "error" ? g.linkProblem || "помилка розбору" : v === "rejected" ? (g.rejectReason || "").toLowerCase() : `${g.bets7d ?? 0} ${plural(g.bets7d ?? 0, "прогноз", "прогнози", "прогнозів")} за 7 днів`].filter(Boolean).join(" · ")}</small></span>
          <span key={v} className={`v3-uwt ${G_CLS[v]} v3-spw-flip`}>{GVIEW[v].label}</span>
        </button>
      ); })}</div>
        : <div className="v3-adw-card v3-spw-list v3-adw-empty"><span aria-hidden="true"><Search size={20} /></span><strong>{gq.trim() ? `За «${gq.trim()}» груп немає` : "У цьому фільтрі порожньо"}</strong><button type="button" className="v3-uwb is-green" onClick={() => { setGf("all"); setGq(""); }}>Показати всі</button></div>}
      {gCur ? <article key={gCur.id} className="v3-adw-card v3-spw-main v3-spw-gmain"><GroupView g={gCur} online={online} onChange={changeGroup} /></article>
        : <div className="v3-adw-card v3-spw-main v3-adw-empty"><span aria-hidden="true"><Send size={20} /></span><strong>Виберіть групу</strong></div>}
    </section>
  );

  return (
    <div className="v3-page v3-uw v3-spw">
      <section className="v3-uw-hero"><div><h1>Підтримка</h1><p>{sub}</p></div></section>
      {!online && <div className="v3-uw-off" role="status"><WifiOff size={15} aria-hidden="true" /><span>Немає інтернету. Відповіді й зміни не збережуться — дочекайтесь з’єднання.</span></div>}
      <section className="v3-pw-kpis" aria-label="Підсумки">
        {kpis.map((x, i) => (
          <button key={`${tab}-${x.k}`} type="button" className={`v3-pw-kpi${i === 0 ? " is-on" : ""}`} style={{ animationDelay: `${i * 40}ms` }} onClick={x.go} disabled={!x.go}>
            <span>{x.l}</span>
            <strong className={`${"warn" in x && x.warn ? "is-warn" : ""}${"bad" in x && x.bad ? " is-bad" : ""}`}>{x.v === "…" ? "…" : <RollingNumber key={`${x.k}-${x.v}`} text={x.v} />}</strong>
            <small>{x.n}</small>
          </button>
        ))}
      </section>
      <div className="v3-uw-tools v3-spw-tools">
        <div className="v3-uw-tabs" role="tablist" aria-label="Розділи підтримки">
          <PillTrack active={tab} />
          <button type="button" role="tab" aria-selected={tab === "tickets"} className={tab === "tickets" ? "is-on" : ""} onClick={() => setParams({})}>Звернення<span className="v3-pw-tn">{c ? c.open : "…"}</span></button>
          <button type="button" role="tab" aria-selected={tab === "groups"} className={tab === "groups" ? "is-on" : ""} onClick={() => setParams({ tab: "groups" })}>Telegram-групи<span className={`v3-pw-tn${gc?.pending ? " is-alert" : ""}`}>{gc ? gc.pending : "…"}</span></button>
        </div>
        {tab === "tickets" ? <>
          <div className="v3-spw-kinds" role="group" aria-label="Тип звернення">
            <PillTrack active={kind} />
            {KINDS.map((k) => <button key={k.value} type="button" className={kind === k.value ? "is-on" : ""} aria-pressed={kind === k.value} onClick={() => setKind(k.value)}>{k.label}</button>)}
          </div>
          <label className="v3-uw-search v3-spw-search"><Search size={15} aria-hidden="true" /><input type="search" aria-label="Пошук звернень" placeholder="Тема, логін або №" value={q} onChange={(e) => setQ(e.target.value)} />{q && <button type="button" aria-label="Очистити" onClick={() => setQ("")}><X size={13} /></button>}</label>
        </> : <>
          <label className="v3-uw-search v3-spw-search"><Search size={15} aria-hidden="true" /><input type="search" aria-label="Пошук груп" placeholder="Назва або посилання" value={gq} onChange={(e) => setGq(e.target.value)} />{gq && <button type="button" aria-label="Очистити" onClick={() => setGq("")}><X size={13} /></button>}</label>
        </>}
      </div>
      <div className="v3-uw-sortrow v3-pw-chiprow v3-spw-chiprow">
        {tab === "tickets"
          ? <div className="v3-uw-chips" role="group" aria-label="Стан звернень">{FILTERS.map((f) => <button key={f.key} type="button" className={filter === f.key ? "is-on" : ""} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}{c && <b>{c[f.key] ?? 0}</b>}</button>)}</div>
          : <div className="v3-uw-chips" role="group" aria-label="Фільтр груп">{GFILTERS.map((f) => <button key={f.key} type="button" className={gf === f.key ? "is-on" : ""} aria-pressed={gf === f.key} onClick={() => setGf(f.key)}>{f.label}{gc && <b>{gc[f.key] ?? 0}</b>}</button>)}</div>}
      </div>
      {tab === "tickets" ? (err && !list ? errorCard(err, loadTickets) : ticketsView) : (gErr && !groups ? errorCard(gErr, loadGroups) : groupsView)}
    </div>
  );
}
