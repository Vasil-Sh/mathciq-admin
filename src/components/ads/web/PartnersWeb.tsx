import { useEffect, useState } from "react";
import { Banknote, Check, Download, Pencil, Plus, Power, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import PartnerReport, { type ReportTarget } from "@/components/ads/PartnerReport";
import UndoRing from "@/components/UndoRing";
import PillTrack from "@/components/PillTrack";
import { DateField } from "@/components/ui/date-field";
import { BM_STATUS, bookmakerStatus, colorOf, deleteBookmaker, dmy, entityStats, initials, nf, saveBookmaker, textIssues, type AdStats, type Bookmaker, type BookmakerInput } from "@/lib/adsModel";
import { updateSettings } from "@/lib/adminSettingsApi";
import type { AppSettings } from "@/types";
import { AdMark, DeleteAsk, Kebab, WEmpty, WModal, pl } from "./AdsWebShared";

const EMPTY: BookmakerInput = { name: "", licenseNumber: "", licenseUntil: null, moderationText: "", link: "", buttonText: "Коефіцієнт у партнера → перейти", clickPrice: null, showOddsInList: true, showMatchDetails: false, active: true };
const placesText = (b: Pick<Bookmaker, "showOddsInList" | "showMatchDetails">) => b.showOddsInList && b.showMatchDetails ? "список матчів і деталі" : b.showOddsInList ? "список матчів" : b.showMatchDetails ? "деталі матчу" : "місце не обрано";

type Props = {
  list: Bookmaker[]; stats: AdStats | null; settings: AppSettings | null; online: boolean; today: string; reload: () => void;
  setList: (fn: (l: Bookmaker[]) => Bookmaker[]) => void; setSettings: (s: AppSettings) => void; creating: boolean; setCreating: (v: boolean) => void;
};

const Logo = ({ name }: { name: string }) => <span className="v3-adw-logo" style={{ background: name ? colorOf(name) : "#b8bec9" }} aria-hidden="true">{initials(name || "?").slice(0, 2)}</span>;

export default function PartnersWeb({ list, stats, settings, online, today, reload, setList, setSettings, creating, setCreating }: Props) {
  const [editId, setEditId] = useState<string | null>(null);
  const [f, setF] = useState<BookmakerInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"pc" | "phone">("pc");
  const [del, setDel] = useState<Bookmaker | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const editing = creating || !!editId;
  useEffect(() => {
    if (creating) { setF(EMPTY); return; }
    const b = list.find((x) => x.id === editId);
    if (b) setF({ name: b.name, licenseNumber: b.licenseNumber, licenseUntil: b.licenseUntil, moderationText: b.moderationText, link: b.link, buttonText: b.buttonText, clickPrice: b.clickPrice, showOddsInList: b.showOddsInList, showMatchDetails: b.showMatchDetails, active: b.active });
  }, [creating, editId]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (p: Partial<BookmakerInput>) => setF((x) => ({ ...x, ...p }));
  const close = () => { setCreating(false); setEditId(null); };
  const linkBad = !!f.link && !/^https?:\/\/\S+$/i.test(f.link);
  const issues = textIssues(f.buttonText);
  const listOn = settings?.adsOddsInList ?? true, detOn = settings?.adsMatchDetails ?? true;

  async function save() {
    if (!f.name.trim()) { toast.error("Вкажіть назву партнера"); document.getElementById("bmw-name")?.focus(); return; }
    if (!f.licenseNumber.trim()) { toast.error("Вкажіть номер ліцензії PlayCity", { description: "Без ліцензії партнер не показується" }); document.getElementById("bmw-lic")?.focus(); return; }
    if (linkBad) { toast.error("Посилання має починатися з https://"); document.getElementById("bmw-link")?.focus(); return; }
    if (issues.rules.length) { toast.error("Текст кнопки не пройшов перевірку", { description: "Приберіть «бонус», «безплатно» і обіцянки заробітку" }); return; }
    setSaving(true);
    try {
      const saved = await saveBookmaker(creating ? null : editId, { ...f, licenseUntil: f.licenseUntil || null, clickPrice: f.clickPrice === null ? null : Number(f.clickPrice) });
      setList((l) => (creating ? [...l, saved] : l.map((x) => (x.id === saved.id ? saved : x))));
      close();
      toast.success(creating ? "Партнера додано" : "Партнера збережено", { description: saved.link ? `${saved.name} · ліцензія № ${saved.licenseNumber}` : `${saved.name} — без посилання лишається чернеткою` });
    } catch (e) { toast.error("Не вдалося зберегти партнера", { description: (e as Error).message }); }
    setSaving(false);
  }
  async function toggle(b: Bookmaker) {
    setList((l) => l.map((x) => (x.id === b.id ? { ...x, active: !b.active } : x)));
    try { const saved = await saveBookmaker(b.id, { active: !b.active }); setList((l) => l.map((x) => (x.id === saved.id ? saved : x))); toast.success(saved.active ? "Партнера увімкнено" : "Партнера вимкнено", { description: saved.name }); }
    catch (e) { setList((l) => l.map((x) => (x.id === b.id ? { ...x, active: b.active } : x))); toast.error("Не вдалося змінити партнера", { description: (e as Error).message }); }
  }
  async function toggleGlobal(key: "adsOddsInList" | "adsMatchDetails", want?: boolean) {
    const next = want ?? !(settings?.[key] ?? true), before = settings;
    const name = key === "adsOddsInList" ? "Коефіцієнти в списку матчів" : "Деталі матчу";
    if (before) setSettings({ ...before, [key]: next });
    try {
      setSettings(await updateSettings({ [key]: next }));
      if (next) toast.success(`«${name}» увімкнено`, { description: "Партнери знову показуються на цьому місці" });
      else toast.success(`«${name}» вимкнено`, { description: "Місце зникло із застосунку для всіх", action: { label: <UndoRing label="Повернути" />, onClick: () => toggleGlobal(key, true) } });
    } catch (e) { if (before) setSettings(before); toast.error("Не вдалося змінити місце показу", { description: (e as Error).message }); }
  }
  async function remove() {
    const b = del; if (!b) return;
    setDelBusy(true);
    try {
      await deleteBookmaker(b.id); setList((l) => l.filter((x) => x.id !== b.id)); setDel(null);
      toast.success("Партнера видалено", { description: b.name, duration: 10_000, className: "v3-toast-10s", action: { label: <UndoRing label="Повернути" />, onClick: async () => { try { const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = b; await saveBookmaker(null, rest); reload(); } catch (e) { toast.error("Не вдалося повернути", { description: (e as Error).message }); } } } });
    } catch (e) { toast.error("Не вдалося видалити", { description: (e as Error).message }); }
    setDelBusy(false);
  }

  const who = (k: "showOddsInList" | "showMatchDetails") => list.filter((b) => b[k]).map((b) => b.name);
  const places = (
    <aside className="v3-adw-card v3-adw-places">
      <h2>Місця показу <span className="v3-adw-pill">Реклама · 21+</span></h2>
      <p>Вимкнене місце зникає із застосунку одразу для всіх. Партнерів не видаляє.</p>
      {([["adsOddsInList", "Коефіцієнти в списку матчів", "Плашка в рядку матчу · «Зараз грають» і найближчі", listOn, who("showOddsInList")], ["adsMatchDetails", "Деталі матчу", "Блок «Коефіцієнт у партнера» під коефіцієнтами", detOn, who("showMatchDetails")]] as const).map(([k, t, sub, on, names]) => (
        <div key={k} className="v3-adw-place">
          <span><strong>{t}</strong><small>{sub}</small><em className={names.length ? "" : "is-muted"}>{names.length ? names.join(", ") : "Немає партнерів із цим місцем"}</em></span>
          <button type="button" role="switch" aria-checked={on} aria-label={t} disabled={!online} className={`v3-pswitch${on ? " is-on" : ""}`} onClick={() => toggleGlobal(k)}><span /></button>
        </div>
      ))}
      <small className="v3-adw-note">«Азартні ігри можуть викликати залежність» показуємо поруч з кожним місцем.</small>
    </aside>
  );

  return (
    <>
      <section className="v3-adw-split">
        {list.length === 0 ? (
          <WEmpty icon={<Banknote size={20} />} title="Партнерів ще немає" text="Додайте букмекера з ліцензією PlayCity — оберіть, де показувати його коефіцієнти."
            action={<button type="button" className="v3-uwb is-green" disabled={!online} onClick={() => setCreating(true)}><Plus size={15} aria-hidden="true" />Додати партнера</button>} />
        ) : (
          <div className="v3-adw-card v3-adw-bms">
            <h2>Букмекери-партнери <span>{list.length}</span></h2>
            {list.map((b, i) => { const s = bookmakerStatus(b, today), c = entityStats(stats, "bookmaker:", b.id); return (
              <div key={b.id} className="v3-adw-bm" style={{ animationDelay: `${i * 40}ms` }}>
                <div className="v3-adw-bm-r">
                  <Logo name={b.name} />
                  <span className="v3-adw-bm-n"><strong>{b.name}</strong><small>{b.licenseNumber ? `PlayCity № ${b.licenseNumber}${b.licenseUntil ? ` · до ${dmy(b.licenseUntil)}` : ""}` : "ліцензію не вказано"}</small></span>
                  <span className="v3-adw-bm-s"><small>{placesText(b)}</small><b>{nf(c.clicks)} {pl(c.clicks, "клік", "кліки", "кліків")}{c.clicks ? " за 7 днів" : ""}</b></span>
                  <span className={`v3-uwt ${s === "live" ? "is-green" : s === "soon" ? "is-amber" : s === "off" ? "is-grey" : "is-red"}`}>{BM_STATUS[s].label}</span>
                  <Kebab label={`Дії: ${b.name}`} items={[
                    { label: "Редагувати", icon: <Pencil size={14} />, disabled: !online, run: () => setEditId(b.id) },
                    { label: "Звіт для партнера", icon: <Download size={14} />, run: () => setReport({ kind: "bookmaker", b }) },
                    ...(s === "live" || s === "off" || s === "soon" ? [{ label: b.active ? "Вимкнути" : "Увімкнути", icon: <Power size={14} />, disabled: !online, run: () => toggle(b) }] : []),
                    { label: "Видалити", icon: <Trash2 size={14} />, red: true, disabled: !online, run: () => setDel(b) },
                  ]} />
                </div>
                {s === "expired" && <div className="v3-adw-bm-bad"><XCircle size={15} aria-hidden="true" /><span>Ліцензія минула — партнер не показується. Внесіть нову дату.</span><button type="button" className="v3-uwb is-white" disabled={!online} onClick={() => setEditId(b.id)}>Оновити ліцензію</button></div>}
                {s === "draft" && <div className="v3-adw-bm-bad"><XCircle size={15} aria-hidden="true" /><span>{b.licenseNumber ? "Немає партнерського посилання — партнер лишається чернеткою." : "Немає ліцензії PlayCity — партнер не показується."}</span><button type="button" className="v3-uwb is-white" disabled={!online} onClick={() => setEditId(b.id)}>Доповнити</button></div>}
              </div>
            ); })}
          </div>
        )}
        {places}
      </section>

      <WModal open={editing} onClose={close} width={780} className="v3-adwm-2col" title={creating ? "Новий партнер" : f.name || "Партнер"} sub="Букмекер з ліцензією PlayCity">
        <div className="v3-adwm-cols">
          <div className="v3-adwm-form">
            <div className="v3-uwm-f"><label htmlFor="bmw-name">Назва <b>*</b></label><input id="bmw-name" maxLength={100} value={f.name} placeholder="Наприклад, Favbet" onChange={(e) => set({ name: e.target.value })} /></div>
            <div className="v3-adwm-row">
              <div className="v3-uwm-f"><label htmlFor="bmw-lic">Номер ліцензії PlayCity <b>*</b></label><input id="bmw-lic" maxLength={60} value={f.licenseNumber} placeholder="№" onChange={(e) => set({ licenseNumber: e.target.value })} /></div>
              <div className="v3-uwm-f"><label id="bmw-until-l">Діє до</label><DateField id="bmw-until" labelledBy="bmw-until-l" value={f.licenseUntil || ""} onChange={(v) => set({ licenseUntil: v || null })} /></div>
            </div>
            <div className="v3-uwm-f"><label htmlFor="bmw-link">Партнерське посилання</label><input id="bmw-link" className={linkBad ? "is-bad" : ""} value={f.link} placeholder="https://" autoCapitalize="none" spellCheck={false} onChange={(e) => set({ link: e.target.value.trim() })} /><small className={linkBad ? "is-err" : ""}>{linkBad ? "Посилання має починатися з https://" : "Без посилання партнер лишається чернеткою"}</small></div>
            <div className="v3-adwm-row">
              <div className="v3-uwm-f"><label htmlFor="bmw-btn">Текст кнопки</label><input id="bmw-btn" className={issues.rules.length ? "is-bad" : ""} maxLength={60} value={f.buttonText} onChange={(e) => set({ buttonText: e.target.value })} /></div>
              <div className="v3-uwm-f"><label htmlFor="bmw-price">Ціна за клік, ₴</label><input id="bmw-price" inputMode="decimal" value={f.clickPrice ?? ""} placeholder="0" onChange={(e) => { const v = e.target.value.replace(",", ".").replace(/[^\d.]/g, ""); set({ clickPrice: v === "" ? null : (v as unknown as number) }); }} /><small className="is-blue">для звіту партнеру</small></div>
            </div>
            <span className="v3-adw-cap">Де показувати партнера</span>
            {([["showOddsInList", "Список матчів", "коефіцієнти П1 / П2 у рядку матчу"], ["showMatchDetails", "Деталі матчу", "блок «Коефіцієнт у партнера»"]] as const).map(([k, t, sub]) => (
              <button key={k} type="button" role="checkbox" aria-checked={f[k]} className={`v3-adw-chk-card${f[k] ? " is-on" : ""}`} onClick={() => set({ [k]: !f[k] } as Partial<BookmakerInput>)}>
                <i aria-hidden="true">{f[k] && <Check size={12} strokeWidth={3} />}</i><span><strong>{t}</strong><small>{sub}</small></span>
              </button>
            ))}
          </div>
          <aside className="v3-adwm-prev">
            <div className="v3-adwm-prev-h"><span className="v3-adw-cap">Як побачать користувачі</span>
              <div className="v3-adw-seg is-sm" role="group" aria-label="Пристрій"><PillTrack active={view} />{([["pc", "Комп’ютер"], ["phone", "Телефон"]] as const).map(([k, l]) => <button key={k} type="button" className={view === k ? "is-on" : ""} aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>)}</div>
            </div>
            <div className={`v3-adw-bmprev${view === "phone" ? " is-phone" : ""}`}>
              <span className="v3-adw-bmprev-top">MatchIQ · Матчі</span>
              <div className="v3-adw-bmprev-m">
                <span><strong>Команда A vs Команда B</strong><small><b>LIVE</b> BLAST Premier · BO3</small></span>
                {f.showOddsInList && <><Logo name={f.name} /><em>1,51</em><em>2,58</em></>}
              </div>
              {f.showMatchDetails && <div className="v3-adw-bmprev-d"><span>Коефіцієнт у партнера · деталі матчу</span><b>1,74</b><i>{(f.buttonText || "Партнер").split("→")[0].trim().length > 12 ? "Партнер →" : `${(f.buttonText || "Партнер").split("→")[0].trim()} →`}</i></div>}
              <AdMark />
            </div>
            <small className="v3-adw-note">«Азартні ігри можуть викликати залежність» показуємо поруч з кожним місцем.</small>
          </aside>
        </div>
        <div className="v3-uwm-foot"><span>Мітка «Реклама · 21+» — завжди увімкнена</span><div><button type="button" className="v3-uwb" onClick={close}>Скасувати</button><button type="button" className="v3-uwb is-green" disabled={!online || saving} onClick={save}>{saving ? "Зберігаємо…" : "Зберегти"}</button></div></div>
      </WModal>

      <DeleteAsk open={!!del} title="Видалити партнера?" busy={delBusy} onClose={() => setDel(null)} onDelete={remove} text={<>«{del?.name}» зникне із застосунку і зі списку. Статистика лишиться у звітах.</>} />
      <PartnerReport target={report} onClose={() => setReport(null)} />
    </>
  );
}
