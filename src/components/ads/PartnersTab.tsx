import { useEffect, useState } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdLabel, EditorPanel, LockedLabel } from "@/components/ads/AdsShared";
import { BM_STATUS, bookmakerStatus, deleteBookmaker, dmy, entityStats, initials, licenseLine, licenseState, nf, saveBookmaker, textIssues, type AdStats, type Bookmaker, type BookmakerInput } from "@/lib/adsModel";
import { updateSettings } from "@/lib/adminSettingsApi";
import { plural } from "@/lib/dashboardInsights";
import type { AppSettings } from "@/types";

const EMPTY: BookmakerInput = { name: "", licenseNumber: "", licenseUntil: null, moderationText: "", link: "", buttonText: "Коефіцієнт у партнера → перейти", clickPrice: null, showOddsInList: true, showMatchDetails: true, active: true };

type Props = {
  list: Bookmaker[] | null; error: string; stats: AdStats | null; settings: AppSettings | null; wide: boolean; online: boolean;
  reload: () => void; setList: (fn: (l: Bookmaker[]) => Bookmaker[]) => void; setSettings: (s: AppSettings) => void;
  creating: boolean; setCreating: (v: boolean) => void;
};

export default function PartnersTab({ list, error, stats, settings, wide, online, reload, setList, setSettings, creating, setCreating }: Props) {
  const [selId, setSelId] = useState<string | null>(null);
  const [f, setF] = useState<BookmakerInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const items = list || [];
  const sel = items.find((b) => b.id === selId) || null;
  const editing = creating || !!sel;

  useEffect(() => { if (wide && !selId && !creating && items.length) setSelId(items[0].id); }, [wide, items, selId, creating]);
  useEffect(() => {
    if (creating) { setF(EMPTY); return; }
    if (sel) setF({ name: sel.name, licenseNumber: sel.licenseNumber, licenseUntil: sel.licenseUntil, moderationText: sel.moderationText, link: sel.link, buttonText: sel.buttonText, clickPrice: sel.clickPrice, showOddsInList: sel.showOddsInList, showMatchDetails: sel.showMatchDetails, active: sel.active });
  }, [creating, sel?.id, sel?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (p: Partial<BookmakerInput>) => setF((x) => ({ ...x, ...p }));
  const listOn = settings?.adsOddsInList ?? true, detOn = settings?.adsMatchDetails ?? true;
  const issues = textIssues(f.buttonText);
  const linkBad = !!f.link && !/^https?:\/\/\S+$/i.test(f.link);

  async function toggleGlobal(key: "adsOddsInList" | "adsMatchDetails") {
    const next = !(settings?.[key] ?? true);
    const name = key === "adsOddsInList" ? "Коефіцієнти в списку матчів" : "Деталі матчу";
    try {
      setSettings(await updateSettings({ [key]: next }));
      if (next) toast.success(`«${name}» увімкнено`, { description: "Партнери знову показуються на цьому місці" });
      else toast.success(`«${name}» вимкнено`, { description: key === "adsOddsInList" ? "Плашки букмекерів зникли з рядків матчів для всіх" : "Блок «Коефіцієнт у партнера» зник для всіх", action: { label: "Повернути", onClick: () => toggleGlobal(key) } });
    } catch (e) { toast.error("Не вдалося змінити місце показу", { description: (e as Error).message }); }
  }

  async function save() {
    if (!f.name.trim()) { toast.error("Вкажіть назву партнера"); return; }
    if (linkBad) { toast.error("Посилання має починатися з https://"); return; }
    if (issues.rules.length) { toast.error("Текст не пройшов перевірку", { description: "Приберіть «бонус», «безплатно» і обіцянки заробітку" }); return; }
    setSaving(true);
    try {
      const saved = await saveBookmaker(creating ? null : sel!.id, { ...f, licenseUntil: f.licenseUntil || null, clickPrice: f.clickPrice === null || (f.clickPrice as unknown) === "" ? null : Number(f.clickPrice) });
      setList((l) => creating ? [...l, saved] : l.map((x) => (x.id === saved.id ? saved : x)));
      setCreating(false); setSelId(saved.id);
      if (!saved.licenseNumber) toast.error("Потрібна ліцензія PlayCity", { description: `${saved.name} збережено як чернетку — без ліцензії не показується` });
      else toast.success("Партнера збережено", { description: `${saved.name} · ліцензія PlayCity № ${saved.licenseNumber}` });
      if (!wide) setSelId(null);
    } catch (e) { toast.error("Не вдалося зберегти партнера", { description: (e as Error).message }); }
    finally { setSaving(false); }
  }
  async function toggleActive(b: Bookmaker) {
    try {
      const saved = await saveBookmaker(b.id, { active: !b.active });
      setList((l) => l.map((x) => (x.id === saved.id ? saved : x)));
      if (!saved.active) toast.success("Розміщення вимкнено", { description: `${saved.name} більше не показується`, action: { label: "Увімкнути", onClick: () => toggleActive(saved) } });
      else toast.success("Розміщення увімкнено", { description: `${saved.name} знову показується` });
    } catch (e) { toast.error("Не вдалося змінити партнера", { description: (e as Error).message }); }
  }
  async function remove(b: Bookmaker) {
    try {
      await deleteBookmaker(b.id); setList((l) => l.filter((x) => x.id !== b.id)); setSelId(null);
      toast.success("Партнера видалено", { description: b.name, duration: 10_000, className: "v3-toast-10s", action: { label: "Повернути", onClick: async () => { try { await saveBookmaker(null, { ...b }); reload(); } catch (e) { toast.error("Не вдалося повернути", { description: (e as Error).message }); } } } });
    } catch (e) { toast.error("Не вдалося видалити партнера", { description: (e as Error).message }); }
  }

  if (error && list === null) return <div className="v3-dcard v3-uerror" role="alert"><span className="v3-uerror-ico" aria-hidden="true">!</span><strong>Не вдалося завантажити партнерів</strong><span>{error}</span><div><button type="button" className="v3-btn v3-btn-blue" onClick={reload}>Спробувати ще раз</button></div></div>;

  const listPartners = items.filter((b) => b.showOddsInList && bookmakerStatus(b) !== "draft" && bookmakerStatus(b) !== "expired" && b.active);
  const detPartners = items.filter((b) => b.showMatchDetails && bookmakerStatus(b) !== "draft" && bookmakerStatus(b) !== "expired" && b.active);
  const sList = entityStats(stats, "bookmaker:list"), sDet = entityStats(stats, "bookmaker:details");
  const oddsChip = (name: string) => <span className="v3-ad-odds"><span className="v3-ad-odds-ic">{initials(name).slice(0, 2)}</span><span><small>РЕКЛАМА · 21+</small><b>1,51 <i>|</i> 2,58</b></span></span>;

  const places = (
    <section className="v3-wcard v3-ad-places">
      <div className="v3-ad-places-h"><div><h2>Місця показу</h2><p>Вимкнене місце зникає із застосунку одразу для всіх користувачів. Партнерів не видаляє.</p></div><AdLabel /></div>
      <div className="v3-ad-places-g">
        <div className="v3-ad-place">
          <div className="v3-ad-place-h"><span><strong>Коефіцієнти в списку матчів</strong><small>Плашка в рядку матчу · «Зараз грають» і найближчі</small></span><input type="checkbox" role="switch" className="v3-switch" aria-label="Коефіцієнти в списку матчів" checked={listOn} disabled={!online || !settings} onChange={() => toggleGlobal("adsOddsInList")} /></div>
          {wide && <div className="v3-ad-mock"><span className="v3-ad-mock-m"><small>Приклад · CS2 · LIVE</small><b>Команда A <i>vs</i> Команда B</b></span>{oddsChip(listPartners[0]?.name || "Партнер")}</div>}
          <span className="v3-ad-place-f">{listPartners.length ? <>Партнери: <b>{listPartners.map((b) => b.name).join(", ")}</b> · {nf(sList.impressions)} показів · {nf(sList.clicks)} кліків за 7 днів</> : "Немає партнерів із цим місцем"}</span>
        </div>
        <div className="v3-ad-place">
          <div className="v3-ad-place-h"><span><strong>Деталі матчу</strong><small>Блок «Коефіцієнт у партнера» під коефіцієнтами</small></span><input type="checkbox" role="switch" className="v3-switch" aria-label="Деталі матчу" checked={detOn} disabled={!online || !settings} onChange={() => toggleGlobal("adsMatchDetails")} /></div>
          {wide && <div className="v3-ad-mock"><span>Коефіцієнт у партнера <b>1,74</b></span><span className="v3-ad-mock-link">{(detPartners[0]?.name || "Партнер")} → перейти</span></div>}
          <span className="v3-ad-place-f">{detPartners.length ? <>{detPartners.map((b) => b.name).join(", ")} · {nf(sDet.impressions)} показів · {nf(sDet.clicks)} кліків за 7 днів</> : "Немає партнерів із цим місцем"}</span>
        </div>
      </div>
    </section>
  );

  const editor = (
    <EditorPanel wide={wide} open={editing} title={creating ? "Новий партнер" : sel?.name || ""} sub={creating ? "Букмекер з ліцензією PlayCity" : undefined} onClose={() => { setCreating(false); setSelId(null); }}>
      <div className="v3-ad-f"><label htmlFor="bm-name">Назва <span>*</span></label><input id="bm-name" className="v3-ad-in" value={f.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} /></div>
      <div className="v3-ad-row2">
        <div className="v3-ad-f"><label htmlFor="bm-lic">Номер ліцензії PlayCity <span>*</span></label><input id="bm-lic" className={`v3-ad-in${f.licenseNumber.trim() ? "" : " is-err"}`} value={f.licenseNumber} placeholder="Не вказано" onChange={(e) => set({ licenseNumber: e.target.value })} /></div>
        <div className="v3-ad-f"><label htmlFor="bm-until">Діє до</label><input id="bm-until" type="date" className={`v3-ad-in${licenseState(f).st === "expired" ? " is-err" : licenseState(f).st === "soon" ? " is-warn" : ""}`} value={f.licenseUntil || ""} onChange={(e) => set({ licenseUntil: e.target.value || null })} /></div>
      </div>
      {!f.licenseNumber.trim() ? <span className="v3-ad-msg is-bad">Рекламувати можна лише ліцензованих організаторів. Без номера партнер збережеться як чернетка й не з’явиться в застосунку.</span>
        : licenseState(f).st === "soon" ? <span className="v3-ad-msg is-warn">Ліцензія діє до {dmy(f.licenseUntil!)} — через {licenseState(f).left} {plural(licenseState(f).left!, "день", "дні", "днів")}. Після цієї дати партнер зникне з застосунку автоматично.</span>
        : licenseState(f).st === "expired" ? <span className="v3-ad-msg is-bad">Ліцензія минула — партнер не показується. Внесіть нову дату.</span>
        : <span className="v3-ad-msg">Перевірте номер у реєстрі PlayCity перед збереженням. Після дати «Діє до» партнер зникне автоматично.</span>}
      <div className="v3-ad-f"><label htmlFor="bm-link">Партнерське посилання</label><input id="bm-link" className={`v3-ad-in${linkBad ? " is-err" : ""}`} type="url" value={f.link} placeholder="https://" onChange={(e) => set({ link: e.target.value })} />{!f.link && <span className="v3-ad-hint">Без посилання партнер лишається чернеткою</span>}</div>
      <div className="v3-ad-f"><label htmlFor="bm-btn">Текст кнопки</label><input id="bm-btn" className={`v3-ad-in${issues.rules.length ? " is-err" : ""}`} value={f.buttonText} maxLength={100} onChange={(e) => set({ buttonText: e.target.value })} />{issues.rules.map((r) => <span key={r} className="v3-ad-msg is-bad">• {r}</span>)}</div>
      <div className="v3-ad-f"><label htmlFor="bm-price">Ціна за клік, ₴ <small>для звіту партнеру</small></label><input id="bm-price" className="v3-ad-in" type="number" min={0} step="0.5" value={f.clickPrice ?? ""} onChange={(e) => set({ clickPrice: e.target.value === "" ? null : Number(e.target.value) })} /></div>
      <span className="v3-ad-lbl">Де показувати {f.name || "партнера"}</span>
      <div className="v3-ad-opt">
        <div className="v3-ad-opt-h"><span><strong>Список матчів</strong><small>коефіцієнти П1 / П2 у рядку матчу{listOn ? "" : " · місце вимкнено для всіх"}</small></span><input type="checkbox" role="switch" className="v3-switch" aria-label="Список матчів" checked={f.showOddsInList} onChange={(e) => set({ showOddsInList: e.target.checked })} /></div>
        {f.showOddsInList && <div className="v3-ad-mock is-sm"><span className="v3-ad-mock-m"><small>Команда A vs Команда B · LIVE</small></span>{oddsChip(f.name || "Партнер")}</div>}
      </div>
      <div className="v3-ad-opt">
        <div className="v3-ad-opt-h"><span><strong>Деталі матчу</strong><small>блок «Коефіцієнт у партнера»{detOn ? "" : " · місце вимкнено для всіх"}</small></span><input type="checkbox" role="switch" className="v3-switch" aria-label="Деталі матчу" checked={f.showMatchDetails} onChange={(e) => set({ showMatchDetails: e.target.checked })} /></div>
        {f.showMatchDetails && <div className="v3-ad-mock is-sm"><span>Коефіцієнт у партнера <b>1,74</b></span><span className="v3-ad-mock-link">{f.buttonText ? f.buttonText.replace(/^Коефіцієнт у партнера\s*/, `${f.name || "Партнер"} `) : `${f.name || "Партнер"} → перейти`}</span></div>}
      </div>
      <span className="v3-ad-hint">{f.licenseNumber ? `Ліцензія PlayCity № ${f.licenseNumber} · ` : ""}«Азартні ігри можуть викликати залежність» показуємо поруч з кожним місцем.</span>
      <LockedLabel />
      <div className="v3-ad-acts">
        {!creating && sel ? <button type="button" className="v3-btn v3-btn-ghost-dark" disabled={!online || bookmakerStatus(sel) === "draft"} onClick={() => toggleActive(sel)}>{sel.active ? "Вимкнути" : "Увімкнути"}</button> : <button type="button" className="v3-btn v3-btn-ghost-dark" onClick={() => setCreating(false)}>Скасувати</button>}
        <button type="button" className="v3-btn v3-btn-primary" disabled={!online || saving} onClick={save}>{saving ? "Зберігаємо…" : f.licenseNumber.trim() ? "Зберегти" : "Зберегти чернетку"}</button>
      </div>
      {!creating && sel && <button type="button" className="v3-ad-del" onClick={() => remove(sel)}><Trash2 size={14} aria-hidden="true" />Видалити партнера</button>}
    </EditorPanel>
  );

  const row = (b: Bookmaker) => {
    const st = bookmakerStatus(b), lic = licenseLine(b), s = entityStats(stats, "bookmaker:", b.id), on = sel?.id === b.id && wide && !creating;
    return (
      <button key={b.id} type="button" className={`v3-ad-tr v3-ad-bmcols${on ? " is-sel" : ""}${st === "draft" ? " is-muted" : ""}`} onClick={() => { setCreating(false); setSelId(b.id); }}>
        <span className="v3-ad-cell2"><strong>{b.name}</strong><small>{b.link ? b.link.replace(/^https?:\/\//, "") : "посилання не вказано"}</small></span>
        <span className="v3-ad-cell2"><span>{lic.main}</span><small className={`is-${lic.tone}`}>{lic.sub}</small></span>
        <span className="v3-ad-tags">{st === "draft" || st === "expired" ? "—" : <>{b.showOddsInList && <span className="v3-ad-ptag">Список матчів</span>}{b.showMatchDetails && <span className="v3-ad-ptag">Деталі матчу</span>}{!b.showOddsInList && !b.showMatchDetails && "—"}</>}</span>
        <span>{st === "draft" ? "—" : nf(s.clicks)}</span>
        <span className="v3-ad-r"><span className={`v3-bn-tag ${BM_STATUS[st].cls}`}>{BM_STATUS[st].label}</span></span>
      </button>
    );
  };

  return (
    <>
      {places}
      <section className="v3-ad-main">
        <div className="v3-wcard v3-ad-table">
          <div className="v3-ad-table-h"><h2>Букмекери-партнери</h2><p>Показуємо лише ліцензованих PlayCity. Без чинної ліцензії партнер автоматично зникає з застосунку.</p></div>
          {list === null ? <div className="v3-ad-load" role="status">Завантажуємо партнерів…</div> : items.length === 0 ? (
            <div className="v3-bt-empty"><span className="v3-ue-ico" aria-hidden="true">₴</span><strong>Партнерів ще немає</strong><span>Додайте букмекера з ліцензією PlayCity — оберіть, де показувати його коефіцієнти.</span><button type="button" className="v3-btn v3-btn-primary" disabled={!online} onClick={() => { setSelId(null); setCreating(true); }}>Додати партнера</button></div>
          ) : wide ? (
            <>
              <div className="v3-ad-tr v3-ad-bmcols is-h"><span>Партнер</span><span>Ліцензія PlayCity</span><span>Де показується</span><span>Кліки · 7 дн.</span><span className="v3-ad-r">Статус</span></div>
              {items.map(row)}
            </>
          ) : (
            <div className="v3-ad-mlist">{items.map((b) => { const st = bookmakerStatus(b), lic = licenseLine(b), s = entityStats(stats, "bookmaker:", b.id); return (
              <button key={b.id} type="button" className={`v3-ad-mcard${st === "draft" ? " is-muted" : ""}`} onClick={() => { setCreating(false); setSelId(b.id); }}>
                <span><strong>{b.name}</strong><small className={`is-${lic.tone}`}>{lic.tone === "ok" ? `PlayCity ${lic.main}` : lic.sub}</small></span>
                <span className={`v3-bn-tag ${BM_STATUS[st].cls}`}>{st === "soon" ? "Спливає" : BM_STATUS[st].label}</span>
                <small className="v3-ad-mcard-f">{st === "draft" ? "Без ліцензії PlayCity не показується" : `${[b.showOddsInList && "Список матчів", b.showMatchDetails && "деталі матчу"].filter(Boolean).join(" · ") || "місця не обрано"} · ${nf(s.clicks)} кліків за 7 днів`}</small>
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            ); })}</div>
          )}
        </div>
        {editor}
      </section>
      {!wide && <div className="v3-ad-note"><AdLabel /><span>додається до кожного розміщення автоматично</span></div>}
    </>
  );
}
