import { useEffect, useState } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdLabel, EditorPanel, Highlighted } from "@/components/ads/AdsShared";
import { PR_STATUS, colorOf, deletePromo, entityStats, initials, nf, placeLabel, promoStatus, savePromo, subsText, textIssues, type AdStats, type Promo, type PromoInput } from "@/lib/adsModel";
import { periodText } from "@/lib/bannersModel";

const EMPTY: PromoInput = { name: "", handle: "", subscribers: null, description: "", placement: "telegram-top", game: "", startsOn: null, endsOn: null, active: true, reviewStatus: "pending", rejectReason: "", priceNote: "" };

type Props = {
  list: Promo[] | null; error: string; stats: AdStats | null; wide: boolean; online: boolean;
  reload: () => void; setList: (fn: (l: Promo[]) => Promo[]) => void; creating: boolean; setCreating: (v: boolean) => void;
};

export default function TelegramTab({ list, error, stats, wide, online, reload, setList, creating, setCreating }: Props) {
  const [selId, setSelId] = useState<string | null>(null);
  const [f, setF] = useState<PromoInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const items = list || [];
  const sel = items.find((p) => p.id === selId) || null;
  const editing = creating || !!sel;

  useEffect(() => { if (wide && !selId && !creating && items.length) setSelId(items[0].id); }, [wide, items, selId, creating]);
  useEffect(() => {
    setRejecting(false);
    if (creating) { setF(EMPTY); return; }
    if (sel) setF({ name: sel.name, handle: sel.handle, subscribers: sel.subscribers, description: sel.description, placement: sel.placement, game: sel.game, startsOn: sel.startsOn, endsOn: sel.endsOn, active: sel.active, reviewStatus: sel.reviewStatus, rejectReason: sel.rejectReason, priceNote: sel.priceNote });
  }, [creating, sel?.id, sel?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Partial<PromoInput>) => setF((x) => ({ ...x, ...p }));
  const issues = textIssues(`${f.name} ${f.description}`);
  const descIssues = textIssues(f.description);
  const badDates = !!(f.startsOn && f.endsOn && f.startsOn > f.endsOn);
  const handleOk = /^@?[A-Za-z0-9_]{4,64}$/.test(f.handle.trim().replace(/^https?:\/\/t\.me\//i, ""));

  async function save(review?: "approved" | "rejected") {
    if (!f.name.trim()) { toast.error("Вкажіть назву групи"); return; }
    if (!handleOk) { toast.error("Вкажіть @username групи", { description: "Латиниця, цифри й _, від 4 символів" }); return; }
    if (badDates) { toast.error("Кінець не може бути раніше початку"); return; }
    const status = review || f.reviewStatus;
    if (status === "approved" && issues.rules.length) { toast.error("Текст не пройшов перевірку", { description: "Приберіть «бонус», «безплатно» і обіцянки заробітку", action: { label: "Показати", onClick: () => document.getElementById("tg-desc")?.focus() } }); return; }
    if (status === "rejected" && !f.rejectReason.trim()) { toast.error("Вкажіть причину відхилення"); return; }
    setSaving(true);
    try {
      const body = { ...f, reviewStatus: status, handle: f.handle.trim().replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, ""), game: f.placement === "match-details" ? f.game : "" as const };
      const saved = await savePromo(creating ? null : sel!.id, body);
      setList((l) => creating ? [saved, ...l] : l.map((x) => (x.id === saved.id ? saved : x)));
      setCreating(false); setSelId(wide ? saved.id : null); setRejecting(false);
      if (creating) toast.success("Групу додано", { description: `${saved.name} · ${placeLabel(saved)} · ${periodText(saved)}` });
      else if (review === "approved") toast.success("Текст схвалено", { description: `${saved.name} ${promoStatus(saved) === "live" ? "уже показується" : "покажемо в обрані дати"}` });
      else if (review === "rejected") toast.success("Розміщення відхилено", { description: saved.name });
      else toast.success("Збережено", { description: `${saved.name} · ${placeLabel(saved)}` });
    } catch (e) { toast.error("Не вдалося зберегти групу", { description: (e as Error).message }); }
    finally { setSaving(false); }
  }
  async function toggleActive(p: Promo) {
    try {
      const saved = await savePromo(p.id, { active: !p.active });
      setList((l) => l.map((x) => (x.id === saved.id ? saved : x)));
      if (!saved.active) toast.success("Розміщення вимкнено", { description: `${saved.name} більше не показується`, action: { label: "Увімкнути", onClick: () => toggleActive(saved) } });
      else toast.success("Розміщення увімкнено", { description: saved.name });
    } catch (e) { toast.error("Не вдалося змінити розміщення", { description: (e as Error).message }); }
  }
  async function remove(p: Promo) {
    try {
      await deletePromo(p.id); setList((l) => l.filter((x) => x.id !== p.id)); setSelId(null);
      toast.success("Розміщення видалено", { description: p.name, duration: 10_000, className: "v3-toast-10s", action: { label: "Повернути", onClick: async () => { try { await savePromo(null, { ...p }); reload(); } catch (e) { toast.error("Не вдалося повернути", { description: (e as Error).message }); } } } });
    } catch (e) { toast.error("Не вдалося видалити", { description: (e as Error).message }); }
  }

  if (error && list === null) return <div className="v3-dcard v3-uerror" role="alert"><span className="v3-uerror-ico" aria-hidden="true">!</span><strong>Не вдалося завантажити розміщення</strong><span>{error}</span><div><button type="button" className="v3-btn v3-btn-blue" onClick={reload}>Спробувати ще раз</button></div></div>;

  const rejected = items.filter((p) => p.reviewStatus === "rejected" && p.rejectReason);
  const preview = (
    <div className="v3-ad-tgcard">
      <div className="v3-ad-tgcard-h"><span className="v3-ad-tgwho"><span className="v3-ad-tgav" style={{ background: colorOf(f.name || "?") }}>{initials(f.name || "?")}</span><span><strong>{f.name || "Назва групи"}</strong><small>{f.subscribers != null ? `${subsText(f.subscribers)} підписників` : `@${f.handle.replace(/^@/, "") || "username"}`}</small></span></span><AdLabel /></div>
      {f.description && <span className="v3-ad-tgdesc"><Highlighted text={f.description} hits={descIssues.hits} /></span>}
      <span className="v3-ad-tgbtn">Відкрити в Telegram</span>
    </div>
  );

  const editor = (
    <EditorPanel wide={wide} open={editing} title={creating ? "Нова група" : sel?.name || ""} sub={creating ? "Платне розміщення Telegram-групи" : sel ? PR_STATUS[promoStatus(sel)].label : undefined} onClose={() => { setCreating(false); setSelId(null); }}>
      <span className="v3-ad-lbl">Як побачать користувачі</span>
      {preview}
      <div className="v3-ad-row2">
        <div className="v3-ad-f"><label htmlFor="tg-name">Назва <span>*</span></label><input id="tg-name" className="v3-ad-in" value={f.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} /></div>
        <div className="v3-ad-f"><label htmlFor="tg-handle">@username <span>*</span></label><input id="tg-handle" className={`v3-ad-in${f.handle && !handleOk ? " is-err" : ""}`} value={f.handle} placeholder="@group" onChange={(e) => set({ handle: e.target.value })} /></div>
      </div>
      <div className="v3-ad-f"><label htmlFor="tg-desc">Опис групи</label><textarea id="tg-desc" className={`v3-ad-in v3-ad-ta${descIssues.rules.length ? " is-err" : ""}`} maxLength={300} rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} /><span className="v3-ad-hint">{f.description.length}/300 · без бонусів, «безплатно» й обіцянок заробітку</span>{issues.rules.map((r) => <span key={r} className="v3-ad-msg is-bad">• {r}</span>)}</div>
      <div className="v3-ad-row2">
        <div className="v3-ad-f"><label htmlFor="tg-subs">Підписників</label><input id="tg-subs" className="v3-ad-in" type="number" min={0} value={f.subscribers ?? ""} onChange={(e) => set({ subscribers: e.target.value === "" ? null : Number(e.target.value) })} /></div>
        <div className="v3-ad-f"><label htmlFor="tg-place">Місце показу</label><select id="tg-place" className="v3-ad-in" value={f.placement} onChange={(e) => set({ placement: e.target.value as PromoInput["placement"] })}><option value="telegram-top">Telegram · верх списку</option><option value="match-details">Деталі матчу</option></select></div>
      </div>
      {f.placement === "match-details" && <div className="v3-ad-f"><label htmlFor="tg-game">Гра</label><select id="tg-game" className="v3-ad-in" value={f.game} onChange={(e) => set({ game: e.target.value as PromoInput["game"] })}><option value="">Усі матчі</option><option value="CS2">CS2</option><option value="Dota 2">Dota 2</option></select></div>}
      <div className="v3-ad-row2">
        <div className="v3-ad-f"><label htmlFor="tg-from">Початок</label><input id="tg-from" type="date" className="v3-ad-in" value={f.startsOn || ""} onChange={(e) => set({ startsOn: e.target.value || null })} /></div>
        <div className="v3-ad-f"><label htmlFor="tg-to">Кінець</label><input id="tg-to" type="date" className={`v3-ad-in${badDates ? " is-err" : ""}`} value={f.endsOn || ""} min={f.startsOn || undefined} onChange={(e) => set({ endsOn: e.target.value || null })} /></div>
      </div>
      <div className="v3-ad-f"><label htmlFor="tg-price">Умови оплати <small>для звіту</small></label><input id="tg-price" className="v3-ad-in" maxLength={200} value={f.priceNote} placeholder="Наприклад, фіксована ціна за місяць" onChange={(e) => set({ priceNote: e.target.value })} /></div>
      {f.reviewStatus === "approved" && !issues.rules.length ? <div className="v3-ad-check"><span>✓</span>Текст пройшов перевірку · без бонусів і обіцянок заробітку</div>
        : f.reviewStatus === "rejected" ? <div className="v3-ad-check is-bad"><span>✕</span>Відхилено: {f.rejectReason || "причину не вказано"}</div>
        : <div className="v3-ad-check is-warn"><span>!</span>{creating ? "Після збереження текст потрібно схвалити — до того група не показується" : "Текст ще не схвалено — група не показується"}</div>}
      {rejecting && <div className="v3-ad-f"><label htmlFor="tg-reason">Причина відхилення <span>*</span></label><input id="tg-reason" className="v3-ad-in" maxLength={500} value={f.rejectReason} placeholder="Наприклад, обіцянка «гарантований прибуток»" onChange={(e) => set({ rejectReason: e.target.value })} /></div>}
      {!creating && sel && f.reviewStatus !== "approved" && !rejecting && (
        <div className="v3-ad-acts"><button type="button" className="v3-btn v3-btn-ghost-dark" disabled={!online} onClick={() => setRejecting(true)}>Відхилити</button><button type="button" className="v3-btn v3-btn-blue" disabled={!online || saving || !!issues.rules.length} onClick={() => save("approved")}>Схвалити текст</button></div>
      )}
      {rejecting ? (
        <div className="v3-ad-acts"><button type="button" className="v3-btn v3-btn-ghost-dark" onClick={() => setRejecting(false)}>Скасувати</button><button type="button" className="v3-btn v3-btn-red" disabled={!online || saving || !f.rejectReason.trim()} onClick={() => save("rejected")}>Відхилити</button></div>
      ) : (
        <div className="v3-ad-acts">
          {!creating && sel ? <button type="button" className="v3-btn v3-btn-ghost-dark" disabled={!online || sel.reviewStatus !== "approved"} onClick={() => toggleActive(sel)}>{sel.active ? "Вимкнути" : "Увімкнути"}</button> : <button type="button" className="v3-btn v3-btn-ghost-dark" onClick={() => setCreating(false)}>Скасувати</button>}
          <button type="button" className="v3-btn v3-btn-primary" disabled={!online || saving} onClick={() => save()}>{saving ? "Зберігаємо…" : "Зберегти"}</button>
        </div>
      )}
      {!creating && sel && <button type="button" className="v3-ad-del" onClick={() => remove(sel)}><Trash2 size={14} aria-hidden="true" />Видалити розміщення</button>}
    </EditorPanel>
  );

  return (
    <>
      <section className="v3-ad-main">
        <div className="v3-wcard v3-ad-table">
          <div className="v3-ad-table-h"><h2>Реклама Telegram-груп</h2><p>Картка групи показується в розділі «Telegram» застосунку або в деталях матчу. Показуємо лише після схвалення тексту.</p></div>
          {list === null ? <div className="v3-ad-load" role="status">Завантажуємо розміщення…</div> : items.length === 0 ? (
            <div className="v3-bt-empty"><span className="v3-ue-ico" aria-hidden="true">✈</span><strong>Розміщень ще немає</strong><span>Додайте групу, оберіть місце показу й термін — після схвалення тексту картка з’явиться в застосунку.</span><button type="button" className="v3-btn v3-btn-primary" disabled={!online} onClick={() => { setSelId(null); setCreating(true); }}>Додати групу</button></div>
          ) : wide ? (
            <>
              <div className="v3-ad-tr v3-ad-tgcols is-h"><span>Група</span><span>Місце показу</span><span>Термін</span><span>Кліки / покази</span><span className="v3-ad-r">Статус</span></div>
              {items.map((p) => { const st = promoStatus(p), s = entityStats(stats, "telegram:", p.id), on = sel?.id === p.id && !creating; return (
                <button key={p.id} type="button" className={`v3-ad-tr v3-ad-tgcols${on ? " is-sel" : ""}`} onClick={() => { setCreating(false); setSelId(p.id); }}>
                  <span className="v3-ad-tgwho"><span className="v3-ad-tgav" style={{ background: st === "rejected" ? "#8a93a2" : colorOf(p.name) }}>{initials(p.name)}</span><span><strong>{p.name}</strong><small>@{p.handle}{p.subscribers != null ? ` · ${subsText(p.subscribers)}` : ""}</small></span></span>
                  <span>{placeLabel(p)}</span>
                  <span className="v3-ad-dim">{p.startsOn || p.endsOn ? periodText(p) : "—"}</span>
                  <span>{s.impressions || s.clicks ? `${nf(s.clicks)} / ${nf(s.impressions)}` : "—"}</span>
                  <span className="v3-ad-r"><span className={`v3-bn-tag ${PR_STATUS[st].cls}`}>{PR_STATUS[st].label}</span></span>
                </button>
              ); })}
              {rejected.map((p) => <p key={p.id} className="v3-ad-foot">«{p.name}» відхилено: {p.rejectReason}</p>)}
            </>
          ) : (
            <div className="v3-ad-mlist">{items.map((p) => { const st = promoStatus(p); return (
              <button key={p.id} type="button" className="v3-ad-mcard" onClick={() => { setCreating(false); setSelId(p.id); }}>
                <span><strong>{p.name}</strong><small>@{p.handle} · {placeLabel(p)}</small></span>
                <span className={`v3-bn-tag ${PR_STATUS[st].cls}`}>{PR_STATUS[st].label}</span>
                <small className="v3-ad-mcard-f">{p.startsOn || p.endsOn ? periodText(p) : "без дат"}{st === "rejected" && p.rejectReason ? ` · ${p.rejectReason}` : ""}</small>
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            ); })}</div>
          )}
        </div>
        {editor}
      </section>
    </>
  );
}
