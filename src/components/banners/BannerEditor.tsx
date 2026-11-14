import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ImageOff, Info, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { createBanner, updateBanner, uploadBannerImage } from "@/lib/adminBannersApi";
import { ACCEPT, MAX_BYTES, SCREENS, STATUS, fmtBytes, kyivToday, overlaps, periodText, screenOf, shortDay, slotName, slotWhere, statusOf, timeline } from "@/lib/bannersModel";
import type { Banner, BannerInput } from "@/types";

const EMPTY: BannerInput = { active: true, screen: "matches", startsOn: null, endsOn: null, slot: 1, title: "", description: "", imageUrl: "", href: "" };

type Props = {
  open: boolean;
  banner: Banner | null;
  preset?: { slot: number; screen: string };
  banners: Banner[];
  online: boolean;
  onClose: () => void;
  onSaved: (b: Banner, created: boolean) => void;
  onAskDelete: (b: Banner) => void;
};

export default function BannerEditor({ open, banner, preset, banners, online, onClose, onSaved, onAskDelete }: Props) {
  const [f, setF] = useState<BannerInput>(EMPTY);
  const [file, setFile] = useState<{ name: string; size: number; w?: number; h?: number } | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [device, setDevice] = useState<"desk" | "phone">("desk");
  const input = useRef<HTMLInputElement>(null);
  const initial = useRef("");

  useEffect(() => {
    if (!open) return;
    const next: BannerInput = banner
      ? { active: banner.active, screen: banner.screen || "matches", startsOn: banner.startsOn || null, endsOn: banner.endsOn || null, slot: banner.slot ?? 1, title: banner.title, description: banner.description || "", imageUrl: banner.imageUrl || "", href: banner.href || "" }
      : { ...EMPTY, slot: preset?.slot ?? 1, screen: preset?.screen ?? "matches" };
    setF(next); initial.current = JSON.stringify(next);
    setFile(null); setFileErr(null); setImgFailed(false); setUrlMode(false); setDevice("desk");
  }, [open, banner, preset]);

  const set = (patch: Partial<BannerInput>) => setF((x) => ({ ...x, ...patch }));
  const dirty = JSON.stringify(f) !== initial.current;
  const scr = screenOf(f.screen);
  const today = kyivToday();
  const clash = useMemo(() => f.active ? banners.find((b) => b.id !== banner?.id && b.active && (b.screen || "matches") === f.screen && (b.slot ?? 1) === f.slot && statusOf(b, today) !== "done" && overlaps(b, f)) : undefined, [banners, banner, f, today]);
  const otherSlotBusy = (slot: number) => banners.find((b) => b.id !== banner?.id && b.active && (b.screen || "matches") === f.screen && (b.slot ?? 1) === slot && statusOf(b, today) !== "done");
  const badDates = !!(f.startsOn && f.endsOn && f.startsOn > f.endsOn);
  const after = timeline({ ...(banner || ({} as Banner)), ...f, id: banner?.id || "new" } as Banner, today);
  const canSave = online && !saving && !uploading && !!f.title.trim() && !clash && !badDates && !fileErr;

  async function pick(fl: File | undefined) {
    if (!fl) return;
    if (!ACCEPT.includes(fl.type)) { setFileErr("Підходять PNG, JPG або WebP"); setFile({ name: fl.name, size: fl.size }); toast.error("Непідходящий формат", { description: "Завантажте PNG, JPG або WebP до 1,5 МБ" }); return; }
    if (fl.size > MAX_BYTES) { setFileErr("Зображення має бути до 1,5 МБ"); setFile({ name: fl.name, size: fl.size }); toast.error("Зображення завелике", { description: `${fmtBytes(fl.size)} — максимум 1,5 МБ. Стисніть і спробуйте ще раз.` }); return; }
    setFileErr(null); setUploading(true);
    try {
      const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej(new Error("Не вдалося прочитати файл")); r.readAsDataURL(fl); });
      const dims = await new Promise<{ w: number; h: number } | null>((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res(null); im.src = URL.createObjectURL(fl); });
      const url = await uploadBannerImage(data, fl.type);
      set({ imageUrl: url }); setImgFailed(false); setFile({ name: fl.name, size: fl.size, w: dims?.w, h: dims?.h });
      if (dims && (dims.w !== 1100 || dims.h !== 260)) toast.error("Неправильний розмір", { description: `Потрібно 1100 × 260 px, а у файлу ${dims.w} × ${dims.h}` });
    } catch (e) { toast.error("Не вдалося завантажити зображення", { description: (e as Error).message }); }
    finally { setUploading(false); if (input.current) input.current.value = ""; }
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    const body: BannerInput = { ...f, title: f.title.trim(), description: f.description.trim(), href: f.href.trim(), imageUrl: f.imageUrl.trim() };
    try {
      const saved = banner ? await updateBanner(banner.id, body) : await createBanner(body);
      const res = { ...(banner || {}), ...body, ...(saved || {}) } as Banner;
      const st = statusOf(res, today);
      if (st === "sched" && res.startsOn) toast.success("Банер запланований", { description: `Почне показуватись ${shortDay(res.startsOn)} о 00:00` });
      else toast.success("Банер збережено", { description: `«${res.title}» · слот ${res.slot ?? 1} · ${periodText(res)}` });
      onSaved(res, !banner);
    } catch (e) {
      const msg = (e as Error).message || "";
      if (/перетин|overlap|зайнят|conflict/i.test(msg)) toast.error("Слот уже зайнятий", { description: msg });
      else toast.error("Не вдалося зберегти банер", { description: msg || "Сервер не відповідає" });
    } finally { setSaving(false); }
  }

  const img = f.imageUrl && !imgFailed ? f.imageUrl : "";
  const bannerImg = (cls: string, label: string) => (
    <div className={`v3-bed-slot ${cls}`}>
      {img ? <img src={img} alt={f.title || "Банер"} onError={() => setImgFailed(true)} /> : <div className="v3-bed-noimg">{imgFailed ? "Зображення не завантажилось" : "Тут буде банер 1100 × 260"}</div>}
      <span>{label}</span>
    </div>
  );
  const appRows = (n: number) => Array.from({ length: n }, (_, i) => <div key={i} className="v3-bed-row"><i /><i /></div>);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="v3-modal v3-bed" aria-describedby="bed-sub">
        <div className="v3-bed-form">
          <div className="v3-bed-head">
            <div><DialogTitle className="v3-bed-title">{banner ? "Редагувати банер" : "Новий банер"}</DialogTitle><DialogDescription id="bed-sub" className="v3-bed-sub">{scr.label} · слот {f.slot}{banner?.createdAt ? ` · створено ${shortDay(banner.createdAt.slice(0, 10))}` : ""}{dirty && banner ? " · є незбережені зміни" : ""}</DialogDescription></div>
            <button type="button" className="v3-bed-x" aria-label="Закрити" onClick={onClose}><X size={16} /></button>
          </div>

          <section className="v3-bed-sec">
            <h3>Вміст</h3>
            <div className="v3-bed-f"><label htmlFor="b-title">Назва <span>*</span></label><input id="b-title" className="v3-bed-in" value={f.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} placeholder="Наприклад, MATCHIQ20 — знижка 20%" /></div>
            <div className="v3-bed-f"><label htmlFor="b-desc">Опис</label><input id="b-desc" className="v3-bed-in" value={f.description} onChange={(e) => set({ description: e.target.value })} /><span className="v3-bed-hint">Короткий текст під заголовком</span></div>
            <div className="v3-bed-f"><label htmlFor="b-href">Посилання</label><input id="b-href" className="v3-bed-in" type="url" inputMode="url" value={f.href} onChange={(e) => set({ href: e.target.value })} placeholder="https://" /></div>
            <div className="v3-bed-f">
              <label>Зображення</label>
              <input ref={input} type="file" accept={ACCEPT.join(",")} hidden onChange={(e) => pick(e.target.files?.[0])} />
              {fileErr ? (
                <div className="v3-bed-file is-err">
                  <span className="v3-bed-thumb is-err" aria-hidden="true"><AlertTriangle size={18} /></span>
                  <div><strong>{file?.name}{file ? ` · ${fmtBytes(file.size)}` : ""}</strong><span className="v3-bed-hint">{fileErr}</span></div>
                  <button type="button" className="v3-bed-mini" onClick={() => input.current?.click()}>Обрати інший</button>
                </div>
              ) : imgFailed ? (
                <div className="v3-bed-file is-err">
                  <span className="v3-bed-thumb is-err" aria-hidden="true"><ImageOff size={18} /></span>
                  <div><strong>Не вдалося завантажити зображення</strong><span className="v3-bed-hint">Перевірте URL або завантажте файл до 1,5 МБ</span></div>
                  <button type="button" className="v3-bed-mini" onClick={() => input.current?.click()}>Завантажити</button>
                </div>
              ) : (
                <div className="v3-bed-file">
                  {f.imageUrl ? <img className="v3-bed-thumb" src={f.imageUrl} alt="" onError={() => setImgFailed(true)} /> : <span className="v3-bed-thumb" aria-hidden="true" />}
                  <div><strong>{uploading ? "Завантажуємо…" : file?.name || (f.imageUrl ? f.imageUrl.split("/").pop() : "Файл не обрано")}</strong><span className="v3-bed-hint">{file?.w ? `${file.w} × ${file.h} · ` : ""}{file ? `${fmtBytes(file.size)} · ` : ""}1100 × 260 · до 1,5 МБ</span></div>
                  <button type="button" className="v3-bed-mini" disabled={uploading || !online} onClick={() => input.current?.click()}>{f.imageUrl ? "Замінити" : "Обрати файл"}</button>
                </div>
              )}
              {urlMode ? <input className={`v3-bed-in${imgFailed ? " is-err" : ""}`} type="url" aria-label="URL зображення" value={f.imageUrl} placeholder="https://…/banner.png" onChange={(e) => { set({ imageUrl: e.target.value }); setImgFailed(false); setFile(null); setFileErr(null); }} /> : <button type="button" className="v3-bed-link" onClick={() => setUrlMode(true)}>…або вставте URL зображення</button>}
              <div className="v3-bed-note"><Info size={16} aria-hidden="true" /><span>Увесь текст банера — «ПРОМОКОД», заголовок, кнопка — це частина картинки. Назву й опис вище бачать лише адміністратори та програми зчитування екрана. Мітку «Реклама · 21+» ставимо поверх банера автоматично — не додавайте її в картинку.</span></div>
            </div>
          </section>

          <section className="v3-bed-sec">
            <h3>Де показувати</h3>
            <div className="v3-bed-f"><label htmlFor="b-screen">Екран</label><select id="b-screen" className="v3-bed-in" value={f.screen || "matches"} onChange={(e) => set({ screen: e.target.value })}>{SCREENS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
            <div className="v3-bed-opts" role="radiogroup" aria-label="Слот">
              {[1, 2].map((n) => { const busy = otherSlotBusy(n); return (
                <button key={n} type="button" role="radio" aria-checked={f.slot === n} className={`v3-opt${f.slot === n ? " is-on" : ""}`} onClick={() => set({ slot: n })}>
                  <strong>{slotName(n)}</strong><small>{slotWhere(f.screen, n)}{busy ? ` · зайнятий${busy.endsOn ? ` до ${shortDay(busy.endsOn)}` : ""}` : ""}</small>
                </button>
              ); })}
            </div>
          </section>

          <section className="v3-bed-sec">
            <h3>Період показу</h3>
            <div className="v3-bed-row2">
              <div className="v3-bed-f"><label htmlFor="b-from">Початок показу</label><input id="b-from" className="v3-bed-in" type="date" value={f.startsOn || ""} onChange={(e) => set({ startsOn: e.target.value || null })} /></div>
              <div className="v3-bed-f"><label htmlFor="b-to">Останній день показу</label><input id="b-to" className={`v3-bed-in${clash || badDates ? " is-err" : ""}`} type="date" value={f.endsOn || ""} min={f.startsOn || undefined} aria-invalid={!!(clash || badDates)} aria-describedby={clash || badDates ? "b-overlap" : undefined} onChange={(e) => set({ endsOn: e.target.value || null })} /></div>
            </div>
            {(clash || badDates) && <div id="b-overlap" role="alert" className="v3-bed-alert"><AlertTriangle size={16} aria-hidden="true" /><span>{badDates ? "Останній день не може бути раніше початку." : `Перетинається з «${clash!.title}» (${periodText(clash!)}) у цьому ж слоті. Змініть дати або вимкніть ту кампанію.`}</span></div>}
            <span className="v3-bed-hint">За часом Києва, включно з останнім днем. Без дат — без обмежень. Після завершення банер зникне з застосунку автоматично.</span>
            <label className="v3-bed-toggle"><input type="checkbox" role="switch" className="v3-switch" checked={f.active} onChange={(e) => set({ active: e.target.checked })} />Увімкнути показ у вибраний період</label>
          </section>

          {!online && <div className="v3-bed-alert is-warn" role="status"><AlertTriangle size={16} aria-hidden="true" /><span>Немає інтернету. Зміни банерів не збережуться — дочекайтесь з’єднання.</span></div>}
          <div className="v3-bed-foot">
            {banner && <button type="button" className="v3-bed-del" onClick={() => onAskDelete(banner)}><Trash2 size={15} aria-hidden="true" />Видалити банер</button>}
            <span className="v3-bed-sp" />
            <button type="button" className="v3-btn v3-btn-ghost" onClick={onClose}>Скасувати</button>
            <button type="button" className="v3-btn v3-btn-primary" disabled={!canSave} onClick={save}>{saving ? "Зберігаємо…" : "Зберегти"}</button>
          </div>
        </div>

        <aside className="v3-bed-prev" aria-label="Попередній перегляд">
          <div className="v3-bed-prev-h">
            <div><strong>Попередній перегляд</strong><div>Екран «{scr.label}» · так банер побачать користувачі</div></div>
            <div className="v3-bed-dev" role="group" aria-label="Пристрій"><button type="button" className={device === "desk" ? "is-on" : ""} aria-pressed={device === "desk"} onClick={() => setDevice("desk")}>Комп’ютер</button><button type="button" className={device === "phone" ? "is-on" : ""} aria-pressed={device === "phone"} onClick={() => setDevice("phone")}>Телефон</button></div>
          </div>
          <div className="v3-bed-stage">
            <div className={`v3-bed-app${device === "phone" ? " is-phone" : ""}`}>
              <div className="v3-bed-app-top"><span><i />MatchIQ</span>{device === "desk" && <span className="v3-bed-app-nav"><b>{scr.label}</b><span>Аналітика</span><span>Стратегії</span><span>Профіль</span></span>}<span className="v3-bed-app-av" /></div>
              <div className="v3-bed-app-h">{scr.label}</div>
              <div className="v3-bed-app-l">{scr.before}</div>
              {appRows(device === "phone" ? 1 : 2)}
              {f.slot === 1 && bannerImg("", device === "phone" ? "СЛОТ 1" : "СЛОТ 1 · КОМП’ЮТЕР")}
              <div className="v3-bed-app-l">{scr.mid}</div>
              {appRows(2)}
              {f.slot === 2 && <><div className="v3-bed-app-l">…</div>{bannerImg("", device === "phone" ? "СЛОТ 2" : "СЛОТ 2 · КОМП’ЮТЕР")}<div className="v3-bed-app-l">{scr.after}</div>{appRows(1)}</>}
            </div>
          </div>
          {device === "phone" && <div className="v3-bed-alert is-warn"><AlertTriangle size={16} aria-hidden="true" /><span>На телефоні банер має висоту ~89 px. Дрібний текст на картинці може не читатися — шрифт від 22 px, важливе в лівих 2/3.</span></div>}
          <div className="v3-bed-req">
            <strong>Вимоги до зображення</strong>
            <ul><li><b>1100 × 260 px</b> — рекомендований розмір</li><li><b>PNG, JPG, WebP</b> — до 1,5 МБ</li><li><b>Текст на картинці</b> — щонайменше 22 px</li><li><b>Важливе</b> — у лівих 2/3, праворуч може обрізатись</li></ul>
          </div>
          <div className="v3-bed-tiles">
            <div><span>Статус після збереження</span><strong className={STATUS[after.st].cls}>{STATUS[after.st].label}</strong></div>
            <div><span>{after.st === "sched" ? "Почнеться" : "Залишилось"}</span><strong>{after.left.replace(/^ще /, "")}</strong></div>
            <div><span>Місце</span><strong>{scr.label} · слот {f.slot}</strong></div>
          </div>
        </aside>
      </DialogContent>
    </Dialog>
  );
}
