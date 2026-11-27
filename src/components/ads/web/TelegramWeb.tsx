import { useEffect, useState } from "react";
import { AlertTriangle, Check, Download, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import PartnerReport, { type ReportTarget } from "@/components/ads/PartnerReport";
import { Highlighted, TgAvatar } from "@/components/ads/AdsShared";
import UndoRing from "@/components/UndoRing";
import { Dropdown } from "@/components/ui/dropdown";
import { DateField } from "@/components/ui/date-field";
import { PR_STATUS, colorOf, ctr, deletePromo, entityStats, nf, placeLabel, promoStatus, savePromo, subsText, textIssues, type AdStats, type Promo, type PromoInput } from "@/lib/adsModel";
import { periodText, shortDay } from "@/lib/bannersModel";
import { AdMark, DeleteAsk, Kebab, WEmpty, WModal, WSwitch, WTag } from "./AdsWebShared";

const EMPTY: PromoInput = { name: "", handle: "", subscribers: null, description: "", placement: "telegram-top", game: "", startsOn: null, endsOn: null, active: true, reviewStatus: "pending", rejectReason: "", priceNote: "" };
const clean = (h: string) => h.trim().replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "").replace(/\/.*$/, "");
/** pending text with a future start reads «Заплановано» (as in the design), otherwise «На перевірці» */
const tagOf = (p: Promo) => { const s = promoStatus(p); return s === "pending" ? (p.startsOn && p.startsOn > new Date().toISOString().slice(0, 10) ? { cls: "is-sched", label: "Заплановано" } : { cls: "is-done", label: "На перевірці" }) : PR_STATUS[s]; };
const range = (p: Pick<Promo, "startsOn" | "endsOn">) => (p.startsOn && p.endsOn ? `${p.startsOn.slice(0, 7) === p.endsOn.slice(0, 7) ? shortDay(p.startsOn).split(" ")[0] : shortDay(p.startsOn)} — ${shortDay(p.endsOn)}` : p.startsOn || p.endsOn ? periodText(p) : "без терміну");

type Props = {
  list: Promo[]; stats: AdStats | null; online: boolean; reload: () => void;
  setList: (fn: (l: Promo[]) => Promo[]) => void; creating: boolean; setCreating: (v: boolean) => void;
};

/** The group card exactly as users see it in the app. */
function TgPreview({ f }: { f: Pick<PromoInput, "name" | "handle" | "subscribers" | "description"> }) {
  const hits = textIssues(f.description).hits;
  return (
    <div className="v3-adw-tgprev">
      <div className="v3-adw-tgprev-h">
        <TgAvatar handle={f.handle} name={f.name || "?"} color={f.name ? colorOf(f.name) : "#b8bec9"} />
        <span><strong>{f.name || "Назва групи"}</strong><small>@{clean(f.handle) || "username"}{f.subscribers != null ? ` · ${subsText(f.subscribers)}` : ""}</small></span>
        <AdMark />
      </div>
      <p>{f.description ? <Highlighted text={f.description} hits={hits} /> : <span className="is-muted">Тут з’явиться опис групи</span>}</p>
      <span className="v3-adw-tgbtn">Відкрити в Telegram</span>
    </div>
  );
}

export default function TelegramWeb({ list, stats, online, reload, setList, creating, setCreating }: Props) {
  const [selId, setSelId] = useState<string | null>(list[0]?.id ?? null);
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState<PromoInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [checkOpen, setCheckOpen] = useState(false);
  const [rejOpen, setRejOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [del, setDel] = useState<Promo | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const sel = list.find((p) => p.id === selId) || null;
  const editing = creating || !!editId;
  useEffect(() => { if (!sel && list.length) setSelId(list[0].id); }, [list, sel]);
  useEffect(() => {
    if (creating) { setF(EMPTY); return; }
    const p = list.find((x) => x.id === editId);
    if (p) setF({ name: p.name, handle: p.handle, subscribers: p.subscribers, description: p.description, placement: p.placement, game: p.game, startsOn: p.startsOn, endsOn: p.endsOn, active: p.active, reviewStatus: p.reviewStatus, rejectReason: p.rejectReason, priceNote: p.priceNote });
  }, [creating, editId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Partial<PromoInput>) => setF((x) => ({ ...x, ...p }));
  const issues = textIssues(`${f.name} ${f.description}`);
  const handleOk = /^[A-Za-z0-9_]{4,64}$/.test(clean(f.handle));
  const badDates = !!(f.startsOn && f.endsOn && f.startsOn > f.endsOn);
  const close = () => { setCreating(false); setEditId(null); };

  async function save() {
    if (!f.name.trim()) { toast.error("Вкажіть назву групи"); document.getElementById("tgw-name")?.focus(); return; }
    if (!handleOk) { toast.error("Перевірте @username групи", { description: f.handle.trim() ? "Лише латиниця, цифри й _, щонайменше 4 символи" : "Поле обов’язкове" }); document.getElementById("tgw-handle")?.focus(); return; }
    if (badDates) { toast.error("Кінець не може бути раніше початку"); return; }
    setSaving(true);
    try {
      // a changed text goes back to review
      const old = list.find((x) => x.id === editId);
      const textChanged = !!old && (old.description !== f.description || old.name !== f.name);
      const saved = await savePromo(creating ? null : editId, { ...f, handle: clean(f.handle), game: f.placement === "match-details" ? f.game : "", reviewStatus: creating || textChanged ? "pending" : f.reviewStatus });
      setList((l) => (creating ? [saved, ...l] : l.map((x) => (x.id === saved.id ? saved : x))));
      setSelId(saved.id); close();
      toast.success(creating ? "Групу додано" : "Збережено", { description: saved.reviewStatus === "pending" ? `${saved.name} · текст чекає схвалення` : `${saved.name} · ${placeLabel(saved)}` });
    } catch (e) { toast.error("Не вдалося зберегти групу", { description: (e as Error).message }); }
    setSaving(false);
  }
  async function review(p: Promo, status: "approved" | "rejected") {
    if (status === "approved" && textIssues(`${p.name} ${p.description}`).rules.length) { toast.error("Текст не пройшов перевірку", { description: "Приберіть «бонус», «безплатно» і обіцянки заробітку" }); return; }
    if (status === "rejected" && !reason.trim()) { document.getElementById("tgw-reason")?.focus(); return; }
    setSaving(true);
    try {
      const saved = await savePromo(p.id, { reviewStatus: status, rejectReason: status === "rejected" ? reason.trim() : "", ...(status === "rejected" ? { active: false } : {}) });
      setList((l) => l.map((x) => (x.id === saved.id ? saved : x)));
      setCheckOpen(false); setRejOpen(false); setReason("");
      if (status === "approved") toast.success("Текст схвалено", { description: promoStatus(saved) === "live" ? `${saved.name} уже показується` : `${saved.name} з’явиться в застосунку${saved.startsOn ? ` ${shortDay(saved.startsOn)}` : ""}` });
      else toast.success("Текст відхилено", { description: `${saved.name} · власник побачить причину` });
    } catch (e) { toast.error("Не вдалося зберегти рішення", { description: (e as Error).message }); }
    setSaving(false);
  }
  async function toggle(p: Promo) {
    setList((l) => l.map((x) => (x.id === p.id ? { ...x, active: !p.active } : x)));
    try {
      const saved = await savePromo(p.id, { active: !p.active });
      setList((l) => l.map((x) => (x.id === saved.id ? saved : x)));
      toast.success(saved.active ? "Показ увімкнено" : "Показ вимкнено", { description: saved.name });
    } catch (e) { setList((l) => l.map((x) => (x.id === p.id ? { ...x, active: p.active } : x))); toast.error("Не вдалося змінити показ", { description: (e as Error).message }); }
  }
  async function remove() {
    const p = del; if (!p) return;
    setDelBusy(true);
    try {
      await deletePromo(p.id); setList((l) => l.filter((x) => x.id !== p.id)); setDel(null); if (selId === p.id) setSelId(null);
      toast.success("Розміщення видалено", { description: p.name, duration: 10_000, className: "v3-toast-10s", action: { label: <UndoRing label="Повернути" />, onClick: async () => { try { await savePromo(null, { ...p }); reload(); } catch (e) { toast.error("Не вдалося повернути", { description: (e as Error).message }); } } } });
    } catch (e) { toast.error("Не вдалося видалити", { description: (e as Error).message }); }
    setDelBusy(false);
  }

  if (!list.length) return <>
    <WEmpty icon={<Send size={20} />} title="Розміщень ще немає" text="Додайте платну Telegram-групу — вона з’явиться у списку груп застосунку з міткою «Реклама · 21+»."
      action={<button type="button" className="v3-uwb is-green" disabled={!online} onClick={() => setCreating(true)}><Plus size={15} aria-hidden="true" />Додати групу</button>} />
    {editorModal()}
  </>;

  const ss = sel ? entityStats(stats, "telegram:", sel.id) : { impressions: 0, clicks: 0 };
  const sst = sel ? promoStatus(sel) : "off";
  const selIssues = sel ? textIssues(`${sel.name} ${sel.description}`) : { rules: [] as string[], hits: [] };
  const menu = (p: Promo) => [
    { label: "Редагувати", icon: <Pencil size={14} />, disabled: !online, run: () => setEditId(p.id) },
    { label: "Звіт для партнера", icon: <Download size={14} />, run: () => setReport({ kind: "telegram", p }) },
    { label: "Відкрити в Telegram", icon: <Send size={14} />, run: () => window.open(`https://t.me/${p.handle}`, "_blank", "noopener") },
    { label: "Видалити розміщення", icon: <Trash2 size={14} />, red: true, disabled: !online, run: () => setDel(p) },
  ];
  const rows3 = (p: Promo) => <>
    <div><dt>Місце показу</dt><dd>{placeLabel(p)}</dd></div>
    <div><dt>Період</dt><dd>{range(p)}</dd></div>
    <div><dt>Умови оплати</dt><dd>{p.priceNote || "не вказані"}</dd></div>
    {p.createdAt && <div><dt>Додано</dt><dd>{shortDay(p.createdAt.slice(0, 10))}</dd></div>}
  </>;

  function editorModal() {
    return (
      <WModal open={editing} onClose={close} width={760} className="v3-adwm-2col" title={creating ? "Нова група" : f.name || "Група"} sub={creating ? "Платне розміщення Telegram-групи" : "Зміна опису поверне текст на схвалення"}>
        <div className="v3-adwm-cols">
          <div className="v3-adwm-form">
            <div className="v3-adwm-row">
              <div className="v3-uwm-f"><label htmlFor="tgw-name">Назва <b>*</b></label><input id="tgw-name" value={f.name} maxLength={100} placeholder="Назва групи" onChange={(e) => set({ name: e.target.value })} /></div>
              <div className="v3-uwm-f"><label htmlFor="tgw-handle">@username <b>*</b></label><input id="tgw-handle" className={f.handle && !handleOk ? "is-bad" : ""} value={f.handle} placeholder="@group" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-invalid={!!f.handle && !handleOk} onChange={(e) => set({ handle: e.target.value })} /></div>
            </div>
            <div className="v3-uwm-f"><label htmlFor="tgw-desc">Опис групи</label><textarea id="tgw-desc" className={issues.rules.length ? "is-bad" : ""} rows={3} maxLength={300} value={f.description} placeholder="Про що група" onChange={(e) => set({ description: e.target.value })} />
              <small className={issues.rules.length ? "is-err" : ""}>{issues.rules.length ? `Заборонено: ${issues.rules.join(", ")}` : `${f.description.length}/300 · без бонусів, «безплатно» й обіцянок заробітку`}</small></div>
            <div className="v3-adwm-row">
              <div className="v3-uwm-f"><label htmlFor="tgw-subs">Підписників</label><input id="tgw-subs" inputMode="numeric" value={f.subscribers ?? ""} placeholder="Наприклад, 5 400" onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); set({ subscribers: v === "" ? null : Number(v) }); }} /></div>
              <div className="v3-uwm-f"><label>Місце показу</label><Dropdown className="v3-ad-dd" ariaLabel="Місце показу" value={f.placement} onChange={(v) => set({ placement: v })} options={[{ value: "telegram-top" as PromoInput["placement"], label: "Telegram · верх списку" }, { value: "match-details" as PromoInput["placement"], label: "Деталі матчу" }]} /></div>
            </div>
            {f.placement === "match-details" && <div className="v3-uwm-f"><label>Гра</label><Dropdown className="v3-ad-dd" ariaLabel="Гра" value={(f.game || "all") as string} onChange={(v) => set({ game: (v === "all" ? "" : v) as PromoInput["game"] })} options={[{ value: "all", label: "Усі матчі" }, { value: "CS2", label: "CS2" }, { value: "Dota 2", label: "Dota 2" }]} /></div>}
            <div className="v3-adwm-row">
              <div className="v3-uwm-f"><label id="tgw-from-l">Початок</label><DateField id="tgw-from" labelledBy="tgw-from-l" value={f.startsOn || ""} onChange={(v) => set({ startsOn: v || null })} /></div>
              <div className="v3-uwm-f"><label id="tgw-to-l">Кінець</label><DateField id="tgw-to" labelledBy="tgw-to-l" value={f.endsOn || ""} min={f.startsOn || undefined} onChange={(v) => set({ endsOn: v || null })} />{badDates && <small className="is-err">Кінець раніше початку</small>}</div>
            </div>
            <div className="v3-uwm-f"><label htmlFor="tgw-price">Умови оплати</label><input id="tgw-price" maxLength={200} value={f.priceNote} placeholder="Наприклад, фіксована ціна за місяць" onChange={(e) => set({ priceNote: e.target.value })} /><small className="is-blue">для звіту партнеру</small></div>
          </div>
          <aside className="v3-adwm-prev"><span className="v3-adw-cap">Як побачать користувачі</span><TgPreview f={f} /></aside>
        </div>
        <div className="v3-uwm-foot"><span>{creating ? "Після збереження текст потрібно схвалити — до того група не показується" : "Новий текст спершу схвалюєте ви"}</span><div><button type="button" className="v3-uwb" onClick={close}>Скасувати</button><button type="button" className="v3-uwb is-green" disabled={!online || saving} onClick={save}>{saving ? "Зберігаємо…" : "Зберегти"}</button></div></div>
      </WModal>
    );
  }

  return (
    <>
      <section className="v3-adw-split">
        <div className="v3-adw-card v3-adw-tg">
          <div className="v3-adw-tr v3-adw-tgcols is-th"><span>Група</span><span>Період</span><span className="is-r">Кліки · 7 дн.</span><span className="is-r">Статус</span></div>
          {list.map((p, i) => { const s = promoStatus(p), c = entityStats(stats, "telegram:", p.id); return (
            <button key={p.id} type="button" className={`v3-adw-tr v3-adw-tgcols${sel?.id === p.id ? " is-sel" : ""}`} style={{ animationDelay: `${i * 30}ms` }} aria-pressed={sel?.id === p.id} onClick={() => setSelId(p.id)}>
              <span className="v3-adw-who"><TgAvatar handle={p.handle} name={p.name} color={s === "rejected" ? "#8a93a2" : colorOf(p.name)} /><span><strong>{p.name}</strong><small>@{p.handle}{p.subscribers != null ? ` · ${subsText(p.subscribers)} підписників` : ""}</small></span></span>
              <span>{range(p)}</span>
              <span className="is-r is-num"><b>{c.clicks ? nf(c.clicks) : "—"}</b></span>
              <span className="is-r"><WTag {...tagOf(p)} /></span>
            </button>
          ); })}
          <p className="v3-adw-note">Платні групи стоять у списку груп застосунку з міткою «Реклама · 21+». Новий текст спершу схвалюєте ви — без бонусів і обіцянок заробітку.</p>
        </div>

        {sel && (
          <aside key={sel.id} className="v3-adw-card v3-adw-panel">
            <div className="v3-adw-panel-h">
              <TgAvatar handle={sel.handle} name={sel.name} color={sst === "rejected" ? "#8a93a2" : colorOf(sel.name)} />
              <span><strong>{sel.name}</strong><small>@{sel.handle}{sel.subscribers != null ? ` · ${subsText(sel.subscribers)} підписників` : ""}</small></span>
              <WTag {...tagOf(sel)} />
              <Kebab label={`Дії: ${sel.name}`} items={menu(sel)} />
            </div>
            {sel.reviewStatus === "pending" ? <div className="v3-adw-warn"><AlertTriangle size={14} aria-hidden="true" />Текст ще не схвалено — група не показується</div>
              : sel.reviewStatus === "rejected" ? <div className="v3-adw-warn is-red"><X size={14} aria-hidden="true" />Відхилено: {sel.rejectReason || "причину не вказано"}</div>
              : <div className="v3-adw-warn is-ok"><Check size={14} aria-hidden="true" />Текст пройшов перевірку</div>}
            <div className="v3-adw-tiles"><div><span>Покази</span><b>{ss.impressions ? nf(ss.impressions) : "—"}</b></div><div><span>Кліки</span><b>{ss.clicks ? nf(ss.clicks) : "—"}</b></div><div><span>CTR</span><b>{ss.impressions ? ctr(ss.clicks, ss.impressions) : "—"}</b></div></div>
            <div className="v3-adw-seen"><span className="v3-adw-cap">Як бачать користувачі</span><p><Highlighted text={sel.description || "Опису немає"} hits={selIssues.hits} /></p><AdMark /></div>
            <dl className="v3-adw-dl">{rows3(sel)}</dl>
            <div className="v3-adw-panel-f">
              {sel.reviewStatus === "pending" ? <>
                <button type="button" className="v3-uwb is-softred" disabled={!online} onClick={() => { setReason(""); setRejOpen(true); }}>Відхилити</button>
                <button type="button" className="v3-uwb is-green" disabled={!online} onClick={() => setCheckOpen(true)}>Схвалити текст</button>
              </> : sel.reviewStatus === "rejected" ? <>
                <button type="button" className="v3-uwb" disabled={!online} onClick={() => setEditId(sel.id)}>Редагувати текст</button>
              </> : <>
                <WSwitch on={sel.active} label={sel.active ? "Показ увімкнено" : "Показ вимкнено"} disabled={!online || sst === "done"} onChange={() => toggle(sel)} />
                <button type="button" className="v3-uwb" disabled={!online} onClick={() => setEditId(sel.id)}>Редагувати</button>
              </>}
            </div>
          </aside>
        )}
      </section>

      {editorModal()}

      {sel && <WModal open={checkOpen} onClose={() => setCheckOpen(false)} width={720} className="v3-adwm-2col" title="Перевірка тексту" sub={`${sel.name} · @${sel.handle}`}>
        <div className="v3-adwm-cols is-rev">
          <aside className="v3-adwm-prev"><span className="v3-adw-cap">Як побачать користувачі</span><TgPreview f={sel} /></aside>
          <div>
            <dl className="v3-adw-dl">{rows3(sel)}</dl>
            <p className="v3-adw-chk-h">Перевірте перед схваленням</p>
            <ul className="v3-adw-chk">
              <li className={/бонус|безплат/i.test(selIssues.rules.join()) ? "is-bad" : ""}>{/бонус|безплат/i.test(selIssues.rules.join()) ? <X size={14} /> : <Check size={14} />}Немає бонусів і «безплатно»</li>
              <li className={selIssues.rules.some((r) => !/бонус|безплат/i.test(r)) ? "is-bad" : ""}>{selIssues.rules.some((r) => !/бонус|безплат/i.test(r)) ? <X size={14} /> : <Check size={14} />}Немає обіцянок заробітку чи «гарантованих» прогнозів</li>
              <li><Check size={14} />Посилання веде саме в цю групу</li>
            </ul>
            {selIssues.rules.length ? <div className="v3-adw-warn is-red"><X size={14} aria-hidden="true" />У тексті є заборонене — схвалити не можна</div> : <div className="v3-adw-warn"><AlertTriangle size={14} aria-hidden="true" />Текст ще не схвалено — група не показується</div>}
          </div>
        </div>
        <div className="v3-uwm-foot"><span>Рішення потрапить у журнал дій</span><div><button type="button" className="v3-uwb is-softred" disabled={saving} onClick={() => { setCheckOpen(false); setReason(""); setRejOpen(true); }}>Відхилити</button><button type="button" className="v3-uwb is-green" disabled={!online || saving || !!selIssues.rules.length} onClick={() => review(sel, "approved")}>{saving ? "Зберігаємо…" : "Схвалити текст"}</button></div></div>
      </WModal>}

      {sel && <WModal open={rejOpen} onClose={() => setRejOpen(false)} width={440} title="Відхилити текст" sub={`${sel.name} · @${sel.handle}`}>
        <blockquote className="v3-adw-quote">«{sel.description || "Опису немає"}»</blockquote>
        <div className="v3-uwm-f"><label htmlFor="tgw-reason">Причина відхилення <b>*</b></label><textarea id="tgw-reason" autoFocus rows={3} maxLength={500} value={reason} placeholder="Наприклад, обіцянка «гарантований прибуток»" onChange={(e) => setReason(e.target.value)} /><small>Власник групи побачить причину</small></div>
        <div className="v3-uwm-foot"><span>Група лишиться вимкненою, поки текст не виправлять</span><div><button type="button" className="v3-uwb" onClick={() => setRejOpen(false)}>Скасувати</button><button type="button" className="v3-uwb is-red" disabled={!online || saving || !reason.trim()} onClick={() => review(sel, "rejected")}>{saving ? "Зберігаємо…" : "Відхилити"}</button></div></div>
      </WModal>}

      <DeleteAsk open={!!del} title="Видалити розміщення?" busy={delBusy} onClose={() => setDel(null)} onDelete={remove} text={<>«{del?.name}» зникне із застосунку і зі списку. Статистика лишиться у звітах.</>} />
      <PartnerReport target={report} onClose={() => setReport(null)} />
    </>
  );
}
