import { useMemo, useState } from "react";
import { ChevronRight, Megaphone, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import BannerEditor from "@/components/banners/BannerEditor";
import { createBanner, deleteBanner, updateBanner, updateBannerSlot } from "@/lib/adminBannersApi";
import { SCREENS, STATUS, kyivToday, periodText, screenOf, shortDay, slotName, slotState, slotWhere, statusOf, timeline, type BStatus } from "@/lib/bannersModel";
import type { Banner, BannerSlotState } from "@/types";

type Props = {
  banners: Banner[] | null;
  slots: BannerSlotState[];
  error: string;
  wide: boolean;
  online: boolean;
  reload: () => Promise<void> | void;
  setBanners: (fn: (b: Banner[]) => Banner[]) => void;
  setSlots: (fn: (s: BannerSlotState[]) => BannerSlotState[]) => void;
  editor: { open: boolean; banner: Banner | null; preset?: { slot: number; screen: string } };
  setEditor: (e: { open: boolean; banner: Banner | null; preset?: { slot: number; screen: string } }) => void;
};

type CFilter = "all" | BStatus;

export default function BannersTab({ banners, slots, error, wide, online, reload, setBanners, setSlots, editor, setEditor }: Props) {
  const [screen, setScreen] = useState("matches");
  const [cf, setCf] = useState<CFilter>("all");
  const [deleting, setDeleting] = useState<Banner | null>(null);
  const [busyDel, setBusyDel] = useState(false);
  const [showErr, setShowErr] = useState(false);
  const today = kyivToday();
  const list = banners || [];
  const scr = screenOf(screen);
  const st = useMemo(() => [1, 2].map((n) => slotState(list, screen, n, today)), [list, screen, today]);
  const counts = useMemo(() => { const c = { live: 0, sched: 0, off: 0, done: 0 }; list.forEach((b) => { c[statusOf(b, today)]++; }); return c; }, [list, today]);
  const free = st.filter((s) => !s.occupied).length;
  const ph = (n: number) => slots.find((s) => s.slot === n)?.placeholderEnabled ?? false;

  const openNew = (slot = 1) => setEditor({ open: true, banner: null, preset: { slot, screen } });
  const openEdit = (b: Banner) => setEditor({ open: true, banner: b });

  async function toggle(b: Banner) {
    const on = !b.active;
    try {
      await updateBanner(b.id, { active: on });
      setBanners((x) => x.map((y) => (y.id === b.id ? { ...y, active: on } : y)));
      if (on) toast.success("Банер увімкнено", { description: `«${b.title}» · ${periodText(b)}` });
      else toast.success("Банер вимкнено", { description: `Слот ${b.slot ?? 1} тепер ${ph(b.slot ?? 1) && (b.screen || "matches") === "matches" ? "показує плейсхолдер" : "прихований у застосунку"}`, action: { label: "Увімкнути", onClick: () => toggle({ ...b, active: false }) } });
    } catch (e) { toast.error(on ? "Не вдалося увімкнути банер" : "Не вдалося вимкнути банер", { description: (e as Error).message }); }
  }
  async function togglePh(n: number) {
    const cur = ph(n);
    try { const r = await updateBannerSlot(n, !cur); setSlots((s) => [...s.filter((x) => x.slot !== n), r]); toast.success(cur ? "Плейсхолдер вимкнено" : "Плейсхолдер увімкнено", { description: cur ? `Слот ${n} у застосунку прихований, поки немає банера` : `У слоті ${n} — «Тут може бути ваша реклама»` }); }
    catch (e) { toast.error("Не вдалося змінити плейсхолдер", { description: (e as Error).message }); }
  }
  async function doDelete() {
    if (!deleting) return;
    const b = deleting; setBusyDel(true);
    try {
      await deleteBanner(b.id);
      setBanners((x) => x.filter((y) => y.id !== b.id)); setDeleting(null); setEditor({ open: false, banner: null });
      toast.success("Банер видалено", { description: `«${b.title}» прибрано з кампаній`, duration: 10_000, className: "v3-toast-10s", action: { label: "Повернути", onClick: async () => { try { await createBanner({ active: b.active, screen: b.screen, startsOn: b.startsOn ?? null, endsOn: b.endsOn ?? null, slot: b.slot, title: b.title, description: b.description, imageUrl: b.imageUrl, href: b.href }); toast.info("Банер повернуто", { description: `«${b.title}»` }); reload(); } catch (e) { toast.error("Не вдалося повернути банер", { description: (e as Error).message }); } } } });
    } catch (e) { toast.error("Не вдалося видалити банер", { description: (e as Error).message }); }
    finally { setBusyDel(false); }
  }
  async function disableInstead() {
    if (!deleting) return;
    const b = deleting; setDeleting(null);
    if (b.active) await toggle(b);
    setEditor({ open: false, banner: null });
  }

  const tag = (s: BStatus | "free") => <span className={`v3-bn-tag ${STATUS[s].cls}`}><i />{STATUS[s].label}</span>;

  function slotCard(n: number) {
    const s = st[n - 1], b = s.current;
    if (!b) return (
      <article key={n} className="v3-wcard v3-bn-slot">
        <div className="v3-bn-slot-h"><div><strong>{slotName(n)}</strong><span>{slotWhere(screen, n)}</span></div>{tag("free")}</div>
        <div className={`v3-bn-free${screen === "matches" && ph(n) ? "" : " is-hidden"}`}>
          {screen === "matches" && ph(n) ? <><strong>Слот вільний</strong><span>Користувачі бачать плейсхолдер реклами</span></> : <><strong>У застосунку слот прихований</strong><span>Користувачі не бачать нічого на цьому місці</span></>}
        </div>
        <dl className="v3-bn-dl">
          <div><dt>Розмір зображення</dt><dd>1100 × 260 px · до 1,5 МБ</dd></div>
          <div><dt>Останній банер тут</dt><dd>{s.last ? `${s.last.title.length > 28 ? s.last.title.slice(0, 28) + "…" : s.last.title}${s.last.endsOn ? ` · до ${shortDay(s.last.endsOn)}` : ""}` : "ще не було"}</dd></div>
        </dl>
        <div className="v3-bn-slot-f">
          {screen === "matches" ? <label className="v3-bn-sw"><input type="checkbox" role="switch" className="v3-switch" checked={ph(n)} disabled={!online} onChange={() => togglePh(n)} />{wide ? "Плейсхолдер «Тут може бути ваша реклама»" : ph(n) ? "Плейсхолдер увімкнено" : "Плейсхолдер вимкнено"}</label> : <span className="v3-bn-muted">Без плейсхолдера на цьому екрані</span>}
          <button type="button" className="v3-btn v3-btn-primary v3-btn-sm" disabled={!online} onClick={() => openNew(n)}>+ Додати</button>
        </div>
      </article>
    );
    const t = timeline(b, today), on = t.st === "live" || t.st === "sched";
    return (
      <article key={n} className="v3-wcard v3-bn-slot">
        <div className="v3-bn-slot-h"><div><strong>{slotName(n)}</strong><span>{slotWhere(screen, n)}</span></div>{tag(t.st)}</div>
        <div className={`v3-bn-img${t.st === "done" || t.st === "off" ? " is-dim" : ""}`}>{b.imageUrl ? <img src={b.imageUrl} alt={b.title} /> : <span>Без зображення</span>}</div>
        <div className="v3-bn-title"><strong>{b.title}</strong></div>
        <div className="v3-bn-prog"><div><span>{periodText(b)}</span><b>{t.left}</b></div><i><span style={{ width: `${t.prog}%` }} className={on ? "" : "is-gray"} /></i></div>
        {t.st === "done" ? (
          <>
            <p className="v3-bn-done">Завершився {b.endsOn ? shortDay(b.endsOn) : ""} — у застосунку вже не показується, слот фактично вільний.</p>
            <div className="v3-bn-pair"><button type="button" className="v3-btn v3-btn-ghost" disabled={!online} onClick={() => openEdit(b)}>Подовжити</button><button type="button" className="v3-btn v3-btn-primary" disabled={!online} onClick={() => openNew(n)}>Замінити</button></div>
          </>
        ) : (
          <>
            <dl className="v3-bn-dl">
              <div><dt>Посилання</dt><dd className="is-link">{b.href ? b.href.replace(/^https?:\/\//, "") : "—"}</dd></div>
              <div><dt>Оновив</dt><dd>{b.updatedBy ? `@${b.updatedBy}` : "—"}{b.changedAt || b.updatedAt ? ` · ${shortDay((b.changedAt || b.updatedAt)!.slice(0, 10))}` : ""}</dd></div>
            </dl>
            <div className="v3-bn-next"><span>Далі в слоті</span><strong>{s.upcoming ? s.upcoming.title : "нічого не заплановано"}</strong><span>{s.upcoming ? `${s.upcoming.startsOn ? `з ${shortDay(s.upcoming.startsOn)}` : ""}${s.upcoming.active ? "" : " · вимкнено"}` : "—"}</span></div>
            <div className="v3-bn-slot-f">
              <label className="v3-bn-sw"><input type="checkbox" role="switch" className="v3-switch" aria-label="Показ банера" checked={b.active} disabled={!online} onChange={() => toggle(b)} />{b.active ? "Увімкнено" : "Вимкнено"}</label>
              <button type="button" className="v3-btn v3-btn-dark v3-btn-sm" onClick={() => openEdit(b)}>Редагувати</button>
            </div>
          </>
        )}
      </article>
    );
  }

  const rows = list.filter((b) => cf === "all" || statusOf(b, today) === cf).sort((a, b) => { const o = { live: 0, sched: 1, off: 2, done: 3 }; return o[statusOf(a, today)] - o[statusOf(b, today)] || (b.startsOn || "").localeCompare(a.startsOn || ""); });

  if (error && banners === null) return (
    <div className="v3-dcard v3-uerror" role="alert">
      <span className="v3-uerror-ico" aria-hidden="true">!</span>
      <strong>Не вдалося завантажити банери</strong>
      <span>Банери в застосунку працюють як раніше — недоступний лише список в адмінці.</span>
      {showErr && <code className="v3-uerror-det">{error}</code>}
      <div><button type="button" className="v3-btn v3-btn-blue" onClick={() => reload()}>Спробувати ще раз</button><button type="button" className="v3-btn v3-btn-ghost-dark" aria-expanded={showErr} onClick={() => setShowErr(!showErr)}>{showErr ? "Сховати" : "Деталі"}</button></div>
    </div>
  );
  if (banners === null) return (
    <div className="v3-bn-skel" role="status" aria-label="Завантаження банерів">
      <div className="v3-bn-skgrid">{[0, 1].map((i) => <div key={i} className="v3-wcard"><i style={{ width: "55%", height: 12 }} /><i style={{ height: 80 }} /><i style={{ width: "75%", height: 10 }} /><i style={{ width: "45%", height: 10 }} /></div>)}</div>
      <div className="v3-wcard">{[0, 1].map((i) => <div key={i} className="v3-bn-skrow"><i style={{ width: 52, height: 34 }} /><i style={{ flex: 1, height: 12 }} /><i style={{ width: 80, height: 20, borderRadius: 999 }} /></div>)}</div>
    </div>
  );

  return (
    <>
      {!online && <div className="v3-offline-users" role="status"><WifiOff size={16} aria-hidden="true" /><span>Немає інтернету. Зміни банерів не збережуться — дочекайтесь з’єднання.</span><button type="button" className="v3-btn v3-btn-ghost-dark v3-btn-sm" onClick={() => { if (navigator.onLine) reload(); else toast.info("Досі немає з’єднання"); }}>Перевірити ще раз</button></div>}

      {wide && (
        <section className="v3-bn-sums" aria-label="Підсумки">
          <div className="v3-bn-sum is-blue"><div className="l">Показуються зараз</div><div className="v">{counts.live}</div></div>
          <div className="v3-bn-sum"><div className="l">Заплановано</div><div className="v">{counts.sched}</div></div>
          <div className="v3-bn-sum"><div className="l">Вимкнено / завершено</div><div className="v">{counts.off + counts.done}</div></div>
          <div className="v3-bn-sum"><div className="l">Вільні слоти</div><div className="v is-free">{free} <small>з 2</small></div></div>
        </section>
      )}

      {list.length === 0 ? (
        <div className="v3-wcard v3-bt-empty v3-bn-empty">
          <span className="v3-ue-ico" aria-hidden="true"><Megaphone size={24} /></span>
          <strong>Банерів ще немає</strong>
          <span>Додайте перший банер — оберіть слот і період показу. На екрані «Матчі» вільні обидва слоти.</span>
          <button type="button" className="v3-btn v3-btn-primary" disabled={!online} onClick={() => openNew(1)}>Створити банер</button>
        </div>
      ) : (
        <>
          <section className="v3-bn-main">
            {wide && (
              <div className="v3-dcard v3-bn-scheme">
                <div><strong>Схема екрана «{scr.label}»</strong><p>Де користувач побачить банери</p></div>
                <label className="v3-bn-scr"><span className="sr-only">Екран</span><select value={screen} onChange={(e) => setScreen(e.target.value)}>{SCREENS.map((s) => <option key={s.id} value={s.id}>{s.label}{list.some((b) => (b.screen || "matches") === s.id) ? "" : " · порожньо"}</option>)}</select></label>
                <div className="v3-bn-phone">
                  <i style={{ height: 14, width: "50%" }} /><span>{scr.before}</span><i style={{ height: 56 }} />
                  <div className={`v3-bn-ws${st[0].occupied ? " is-on" : ""}`}>Слот 1</div>
                  <span>{scr.mid}</span><i style={{ height: 40 }} /><i style={{ height: 40 }} />
                  <div className={`v3-bn-ws${st[1].occupied ? " is-on" : ""}`}>Слот 2</div>
                  <span>{scr.after}</span><i style={{ height: 40 }} />
                </div>
                <div className="v3-bn-legend"><span><i className="is-on" />зайнятий</span><span><i />вільний</span></div>
              </div>
            )}
            <div className="v3-bn-slots">{slotCard(1)}{slotCard(2)}</div>
          </section>

          {wide ? (
            <section className="v3-wcard v3-bn-camp">
              <div className="v3-bn-camp-h">
                <div><h2>Усі кампанії</h2><p>Клік по рядку відкриває редактор банера. Завершені й вимкнені зберігаються — їх можна змінити й запустити знову</p></div>
                <div className="v3-seg v3-seg-soft" role="group" aria-label="Фільтр кампаній">
                  {([["all", "Усі", list.length], ["live", "Показуються", counts.live], ["sched", "Заплановані", counts.sched], ["done", "Завершені", counts.done], ["off", "Вимкнені", counts.off]] as [CFilter, string, number][]).filter(([k, , n]) => k === "all" || k === "live" || n > 0 || k === cf).map(([k, l, n]) => <button key={k} type="button" className={cf === k ? "is-on" : ""} aria-pressed={cf === k} onClick={() => setCf(k)}>{l} · {n}</button>)}
                </div>
              </div>
              <div className="v3-bn-table">
                <div className="v3-bn-crow is-h"><span>Банер</span><span>Слот</span><span>Період</span><span>Статус</span><span /></div>
                {rows.length === 0 && <p className="v3-bn-none">Немає кампаній із таким статусом.</p>}
                {rows.map((b) => (
                  <div key={b.id} className="v3-bn-crow" role="button" tabIndex={0} onClick={() => openEdit(b)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(b); } }}>
                    <span className="v3-bn-cname">{b.imageUrl ? <img src={b.imageUrl} alt="" /> : <i />}<strong>{b.title}</strong></span>
                    <span>{slotName(b.slot ?? 1)}{(b.screen || "matches") !== "matches" ? ` · ${screenOf(b.screen).label}` : ""}</span>
                    <span>{periodText(b)}</span>
                    <span>{tag(statusOf(b, today))}</span>
                    <span className="v3-bn-cact"><button type="button" className="v3-btn v3-btn-ghost v3-btn-sm" onClick={(e) => { e.stopPropagation(); openEdit(b); }}>Редагувати</button></span>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <>
              <div className="v3-bn-mcamp-h"><strong>Усі кампанії</strong><span>{list.length}</span></div>
              <div className="v3-dcard v3-bn-mcamp">
                {rows.map((b) => (
                  <button key={b.id} type="button" className="v3-bn-mrow" onClick={() => openEdit(b)}>
                    {b.imageUrl ? <img src={b.imageUrl} alt="" className={statusOf(b, today) === "live" ? "" : "is-dim"} /> : <i />}
                    <span><strong>{b.title}</strong><small>{screenOf(b.screen).label} · {periodText(b)}</small></span>
                    {tag(statusOf(b, today))}
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <BannerEditor open={editor.open} banner={editor.banner} preset={editor.preset} banners={list} online={online}
        onClose={() => setEditor({ open: false, banner: null })}
        onSaved={() => { setEditor({ open: false, banner: null }); reload(); }}
        onAskDelete={(b) => setDeleting(b)} />

      <Dialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <DialogContent className="v3-modal sm:max-w-[520px]">
          <div className="v3-modal-iconrow">
            <span className="v3-modal-ico is-red" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path d="M9 7V4h6v3" /></svg></span>
            <div><DialogTitle className="v3-modal-title">Видалити банер?</DialogTitle><DialogDescription className="v3-modal-sub">«{deleting?.title}» зникне з екрана «{screenOf(deleting?.screen).label}». Якщо хочете лише призупинити показ — просто вимкніть його.</DialogDescription></div>
          </div>
          <div className="v3-modal-actions">
            {deleting?.active && <button type="button" className="v3-btn v3-btn-ghost" onClick={disableInstead}>Вимкнути замість цього</button>}
            <button type="button" className="v3-btn v3-btn-red" disabled={busyDel || !online} onClick={doDelete}>{busyDel ? "Видаляємо…" : "Видалити"}</button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
