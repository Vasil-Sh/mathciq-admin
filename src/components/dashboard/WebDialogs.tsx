import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Download, Send } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import UserAvatar from "@/components/UserAvatar";
import { composeMessage, type MessageKind } from "@/lib/messages";
import { TEMPLATES } from "@/lib/settingsModel";
import { fetchPayments, type PaymentRow } from "@/lib/paymentsModel";
import { downloadCsv } from "@/lib/csv";
import { plural } from "@/lib/dashboardInsights";
import type { AppSettings } from "@/types";

const MONTHS_FULL = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
const MONTHS_LOC = ["січні", "лютому", "березні", "квітні", "травні", "червні", "липні", "серпні", "вересні", "жовтні", "листопаді", "грудні"];
const money = (n: number) => `${n.toLocaleString("uk-UA")} ₴`;
const dmy = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "");

/* ───────── «Написати» (design «Ризик відтоку · Написати»): template, editable text, opens the chat ───────── */
export interface WriteWho { id: number; username: string; telegram?: string | null; plan?: string; endDate?: string; priceMonth?: number | string }
export function WriteDialog({ open, onOpenChange, who, tg, signal, settings, kind = "tplInactive", idleDays }: {
  open: boolean; onOpenChange: (v: boolean) => void; who: WriteWho; tg: string; signal?: React.ReactNode; settings?: AppSettings | null; kind?: MessageKind; idleDays?: number | null;
}) {
  const [tpl, setTpl] = useState<MessageKind | "own">(kind);
  const [text, setText] = useState("");
  useEffect(() => { if (open) { setTpl(kind); setText(composeMessage(kind, settings, who, idleDays) || ""); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (k: MessageKind | "own") => { setTpl(k); if (k !== "own") setText(composeMessage(k, settings, who, idleDays) || ""); };
  const plan = who.plan === "pro" ? "Pro" : who.plan === "trial" ? "Пробний" : "Базова";
  const send = () => {
    const t = text.trim();
    if (navigator.clipboard && t) navigator.clipboard.writeText(t).then(() => toast.success("Текст скопійовано", { description: `Вставте його в чаті з @${who.username}` })).catch(() => {});
    window.open(tg, "_blank", "noopener");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="v3-modal v3-dwm sm:max-w-[560px]">
        <DialogTitle className="v3-modal-title">Написати @{who.username}</DialogTitle>
        <DialogDescription className="sr-only">Шаблон, текст повідомлення і чат у Telegram</DialogDescription>
        <div className="v3-dwm-who">
          <UserAvatar username={who.username} telegram={who.telegram} />
          <span><strong>@{who.username} · {plan}</strong><small>{signal}{who.endDate && <span className="v3-dwm-chip">підписка до {dmy(who.endDate).slice(0, 5)}</span>}</small></span>
          <Link to={`/users?q=${encodeURIComponent(who.username)}`} className="v3-dwm-link">Картка →</Link>
        </div>
        <span className="v3-dwm-l">Шаблон</span>
        <div className="v3-dwm-chips" role="group" aria-label="Шаблон">
          {TEMPLATES.map((t) => <button key={t.key} type="button" className={tpl === t.key ? "is-on" : ""} aria-pressed={tpl === t.key} onClick={() => pick(t.key)}>{t.title}</button>)}
          <button type="button" className={tpl === "own" ? "is-on" : ""} aria-pressed={tpl === "own"} onClick={() => pick("own")}>Свій текст</button>
        </div>
        <label className="v3-dwm-l v3-dwm-lrow" htmlFor="dwm-text"><span>Повідомлення</span><small>{text.length} / 1000</small></label>
        <textarea id="dwm-text" className="v3-dwm-ta" rows={5} maxLength={1000} value={text} onChange={(e) => { setText(e.target.value); if (tpl !== "own") setTpl("own"); }} />
        <p className="v3-dwm-tg"><Send size={13} aria-hidden="true" />Відкриється чат у Telegram{who.telegram ? ` · @${who.telegram.replace(/^@/, "")}` : ""} — текст скопіюємо, вставте його</p>
        <div className="v3-modal-foot">
          <span className="v3-hint">Шаблони — у Налаштуваннях</span>
          <div className="v3-modal-actions">
            <button type="button" className="v3-btn v3-btn-ghost" onClick={() => onOpenChange(false)}>Скасувати</button>
            <button type="button" className="v3-btn v3-dwm-green" disabled={!text.trim()} onClick={send}><Send size={15} aria-hidden="true" />Надіслати</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────── «Експорт оплат у CSV» (design): period, columns ───────── */
type ExPeriod = "month" | "year" | "all";
const COLS = ["Дата", "Користувач", "Сума", "Тариф", "Хто записав", "Скасовані"] as const;
export function ExportPaymentsDialog({ open, onOpenChange, month, year, basicPrice, proPrice }: {
  open: boolean; onOpenChange: (v: boolean) => void; month: string; year: number; basicPrice?: number; proPrice?: number;
}) {
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [per, setPer] = useState<ExPeriod>("month");
  const [cols, setCols] = useState<Set<string>>(new Set(COLS.filter((c) => c !== "Скасовані")));
  useEffect(() => { if (open && !rows) fetchPayments("").then((r) => setRows(r.payments)).catch(() => setRows([])); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = (rows || []).filter((p) => p.status !== "cancelled");
  const of = (k: ExPeriod, list: PaymentRow[]) => list.filter((p) => k === "all" || (k === "month" ? p.paidOn.slice(0, 7) === month : p.paidOn.slice(0, 4) === String(year)));
  const sum = (l: PaymentRow[]) => l.reduce((s, p) => s + Number(p.amount || 0), 0);
  const mName = `${MONTHS_FULL[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
  const first = live.length ? live.map((p) => p.paidOn).sort()[0] : "";
  const opts: { k: ExPeriod; t: string; s: string }[] = [
    { k: "month", t: mName, s: rows ? `${of("month", live).length} ${plural(of("month", live).length, "оплата", "оплати", "оплат")} · ${money(sum(of("month", live)))}` : "рахуємо…" },
    { k: "year", t: `${year} рік`, s: rows ? `${of("year", live).length} ${plural(of("year", live).length, "оплата", "оплати", "оплат")} · ${money(sum(of("year", live)))}` : "рахуємо…" },
    { k: "all", t: "Усі оплати", s: first ? `з першої записаної · ${dmy(first)}` : "з першої записаної" },
  ];
  const plan = (p: PaymentRow) => (basicPrice && proPrice ? (Math.abs(Number(p.amount) - proPrice) < Math.abs(Number(p.amount) - basicPrice) ? "Pro" : "Базова") : "");
  const go = () => {
    const list = of(per, cols.has("Скасовані") ? rows || [] : live);
    const head = COLS.filter((c) => cols.has(c) && c !== "Скасовані");
    const withStatus = cols.has("Скасовані");
    downloadCsv(`matchiq-payments-${per === "month" ? month : per === "year" ? year : "all"}.csv`, [...head, ...(withStatus ? ["Статус"] : [])],
      list.map((p) => [...head.map((c) => (c === "Дата" ? dmy(p.paidOn) : c === "Користувач" ? `@${p.username}` : c === "Сума" ? Number(p.amount) : c === "Тариф" ? plan(p) : p.createdBy)), ...(withStatus ? [p.status === "cancelled" ? "скасована" : "записана"] : [])]));
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="v3-modal v3-dwm sm:max-w-[520px]">
        <DialogTitle className="v3-modal-title">Експорт оплат у CSV</DialogTitle>
        <DialogDescription className="v3-modal-sub">Файл відкривається в Excel і Google Таблицях</DialogDescription>
        <span className="v3-dwm-l">Період</span>
        <div className="v3-dwm-radios" role="radiogroup" aria-label="Період">
          {opts.map((o) => <button key={o.k} type="button" role="radio" aria-checked={per === o.k} className={per === o.k ? "is-on" : ""} onClick={() => setPer(o.k)}><i aria-hidden="true" /><span><strong>{o.t}</strong><small>{o.s}</small></span></button>)}
        </div>
        <span className="v3-dwm-l">Стовпці</span>
        <div className="v3-dwm-cols" role="group" aria-label="Стовпці">
          {COLS.map((c) => { const on = cols.has(c); return <label key={c} className={on ? "is-on" : ""}><input type="checkbox" className="sr-only" checked={on} onChange={() => { const n = new Set(cols); if (on) n.delete(c); else n.add(c); setCols(n); }} /><span className={`v3-ck${on ? " is-on" : ""}`} aria-hidden="true">{on && <Check size={12} strokeWidth={3.2} />}</span>{c}</label>; })}
        </div>
        <div className="v3-modal-foot">
          <span className="v3-hint">Скасовані оплати не потрапляють у файл, якщо їх не позначити</span>
          <div className="v3-modal-actions">
            <button type="button" className="v3-btn v3-btn-ghost" onClick={() => onOpenChange(false)}>Скасувати</button>
            <button type="button" className="v3-btn v3-dwm-green" disabled={!rows || cols.size === 0 || (cols.size === 1 && cols.has("Скасовані"))} onClick={go}><Download size={15} aria-hidden="true" />Завантажити CSV</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────── «Утримання · Деталі →» (design): tiles, months, who did not renew ───────── */
export interface RetMonth { month: string; total: number; renewed: number; ended: number; rate: number | null }
export interface Lapsed { user: { id: number; username: string; telegram?: string | null; plan?: string; endDate?: string }; ended: string; tenure?: string }
export function RetentionDialog({ open, onOpenChange, focus, months, lapsed, current, renderWrite, onExport }: {
  open: boolean; onOpenChange: (v: boolean) => void; focus: RetMonth | null; months: RetMonth[]; lapsed: Lapsed[]; current: string;
  renderWrite: (l: Lapsed) => React.ReactNode; onExport: () => void;
}) {
  const fi = focus ? Number(focus.month.slice(5, 7)) - 1 : 0;
  const last3 = useMemo(() => months.slice(-3).reverse(), [months]);
  if (!focus) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="v3-modal v3-dwm sm:max-w-[620px]">
        <DialogTitle className="v3-modal-title">Утримання · {MONTHS_FULL[fi].toLowerCase()} {focus.month.slice(0, 4)}</DialogTitle>
        <DialogDescription className="v3-modal-sub">Хто продовжує підписку після її закінчення</DialogDescription>
        <div className="v3-dwm-tiles">
          <div className="is-blue"><small>Утримання</small><b>{focus.rate === null ? "—" : `${focus.rate}%`}</b></div>
          <div><small>Продовжили</small><b>{focus.renewed}<em> з {focus.total}</em></b></div>
          <div><small>Відтік</small><b className={focus.ended ? "is-red" : undefined}>{focus.ended}</b></div>
        </div>
        <div className="v3-dwm-table" role="table" aria-label="Утримання за місяцями">
          <div role="row" className="is-th"><span role="columnheader">Місяць</span><span role="columnheader">Закінчились</span><span role="columnheader">Продовжили</span><span role="columnheader">Пішли</span><span role="columnheader">Утримання</span></div>
          {last3.map((m) => {
            const cur = m.month === current;
            return (
              <div role="row" key={m.month} className={m.month === focus.month ? "is-on" : undefined}>
                <span role="cell">{MONTHS_FULL[Number(m.month.slice(5, 7)) - 1]}</span>
                <span role="cell">{m.total}</span>
                <span role="cell">{cur || !m.total ? "—" : m.renewed}</span>
                <span role="cell" className={!cur && m.ended ? "is-red" : undefined}>{cur || !m.total ? "—" : m.ended}</span>
                <span role="cell" className={cur ? "is-live" : m.month === focus.month ? "is-blue" : undefined}>{cur ? "ще триває" : m.rate === null ? "—" : `${m.rate}%`}</span>
              </div>
            );
          })}
        </div>
        {lapsed.length > 0 && <>
          <span className="v3-dwm-l">Не продовжили в {MONTHS_LOC[fi]} · {lapsed.length}</span>
          <ul className="v3-dwm-lapsed">
            {lapsed.map((l) => (
              <li key={l.user.id}>
                <UserAvatar username={l.user.username} telegram={l.user.telegram} />
                <span><Link to={`/users?q=${encodeURIComponent(l.user.username)}`}><strong>@{l.user.username}</strong></Link><small>{l.user.plan === "pro" ? "Pro" : l.user.plan === "trial" ? "Пробний" : "Базова"}{l.tenure ? ` · ${l.tenure}` : ""}</small></span>
                <small className="v3-dwm-when">закінчилась {l.ended}</small>
                {renderWrite(l)}
              </li>
            ))}
          </ul>
        </>}
        <div className="v3-modal-foot">
          <span className="v3-hint">Як рахуємо: підписки, що закінчились у місяці; «продовжили» — нова оплата протягом 7 днів після кінця</span>
          <div className="v3-modal-actions"><button type="button" className="v3-btn v3-btn-ghost" onClick={onExport}><Download size={15} aria-hidden="true" />Експорт CSV</button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────── «Матчі за 7 днів · день» (design): what the parsers collected that day ───────── */
export interface WeekDay { day: string; total: number; noScore: number; withOdds: number }
export function MatchesDayDialog({ open, onOpenChange, day, bySource, sourceName, since }: {
  open: boolean; onOpenChange: (v: boolean) => void; day: WeekDay | null; bySource?: { source: string; n: number }[]; sourceName: (s: string) => string; since?: string | null;
}) {
  if (!day) return null;
  const d = new Date(`${day.day}T12:00:00Z`);
  const title = d.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const SRC_DOT = ["#3a6df0", "#7aa2ff", "#f0a020", "#8b5cf6", "#1f9d55", "#9aa3b2"];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="v3-modal v3-dwm sm:max-w-[620px]">
        <DialogTitle className="v3-modal-title">{title[0].toUpperCase() + title.slice(1)}</DialogTitle>
        <DialogDescription className="v3-modal-sub">Матчі, які зібрали парсери за день</DialogDescription>
        <div className="v3-dwm-tiles is-3">
          <div><b>{day.total}</b><small>зібрано</small></div>
          <div className={day.noScore ? "is-bad" : undefined}><b>{day.noScore}</b><small>без рахунку</small></div>
          <div><b>{day.withOdds}</b><small>з коефіцієнтами</small></div>
        </div>
        {!!bySource?.length && <>
          <span className="v3-dwm-l">Звідки матчі · за 7 днів</span>
          <ul className="v3-dwm-src">{bySource.map((s, i) => <li key={s.source}><i style={{ background: SRC_DOT[i % SRC_DOT.length] }} aria-hidden="true" /><span>{sourceName(s.source)}</span><b>{s.n}</b></li>)}</ul>
        </>}
        <div className="v3-modal-foot">
          <span className="v3-hint">{since ? `Рахуємо з ${new Date(`${since}T12:00:00Z`).toLocaleDateString("uk-UA", { day: "numeric", month: "short", timeZone: "UTC" })}, коли з’явився облік` : "Дані парсерів за останні 7 днів"}</span>
          <div className="v3-modal-actions"><Link to="/matches?tab=parsers" className="v3-btn v3-dwm-green" onClick={() => onOpenChange(false)}>Парсери →</Link></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
