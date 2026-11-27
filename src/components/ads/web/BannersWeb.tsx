import { useMemo, useState } from "react";
import { AlertTriangle, Image as ImageIcon, Pencil, Percent, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import BannerEditor from "@/components/banners/BannerEditor";
import PillTrack from "@/components/PillTrack";
import UndoRing from "@/components/UndoRing";
import { createBanner, deleteBanner, updateBanner, updateBannerSlot } from "@/lib/adminBannersApi";
import { STATUS, periodText, screenOf, shortDay, slotState, statusOf, timeline, type BStatus } from "@/lib/bannersModel";
import { entityStats, nf, ctr, type AdStats } from "@/lib/adsModel";
import type { Banner, BannerSlotState } from "@/types";
import { AdMark, DeleteAsk, Kebab, WEmpty, WSwitch, WTag, pl } from "./AdsWebShared";

type Editor = { open: boolean; banner: Banner | null; preset?: { slot: number; screen: string } };
type Props = {
  banners: Banner[]; slots: BannerSlotState[]; stats: AdStats | null; online: boolean; today: string;
  reload: () => Promise<void> | void; setBanners: (fn: (b: Banner[]) => Banner[]) => void; setSlots: (fn: (s: BannerSlotState[]) => BannerSlotState[]) => void;
  editor: Editor; setEditor: (e: Editor) => void;
};
type CF = "all" | "live" | "sched" | "off";

const WHERE = ["", "верхній · між «Зараз грають» і «Найближчі матчі»", "нижній · перед «Завершені матчі»"];
const daysTo = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const host = (href?: string | null) => (href || "").replace(/^https?:\/\//, "").replace(/\/$/, "");

/** Banner as the user sees it: the picture, or a purple card with the title when there is no picture yet. */
/** «Завершено» is a solid red tag with white text */
const BTag = ({ s }: { s: BStatus }) => <WTag cls={s === "done" ? "is-redfill" : STATUS[s].cls} label={STATUS[s].label} />;

export function BannerArt({ b, dim }: { b: Pick<Banner, "title" | "imageUrl" | "href">; dim?: boolean }) {
  return (
    <div className={`v3-adw-art${dim ? " is-dim" : ""}${b.imageUrl ? " has-img" : ""}`}>
      {b.imageUrl ? <img src={b.imageUrl} alt={b.title} /> : <><span className="v3-adw-art-ic" aria-hidden="true"><Percent size={20} /></span><span><strong>{b.title || "Назва банера"}</strong><small>{host(b.href) || "посилання"}</small></span></>}
      <AdMark />
    </div>
  );
}

export default function BannersWeb({ banners, slots, stats, online, today, reload, setBanners, setSlots, editor, setEditor }: Props) {
  const [cf, setCf] = useState<CF>("all");
  const [del, setDel] = useState<Banner | null>(null);
  const [busy, setBusy] = useState(false);
  const st = useMemo(() => [1, 2].map((n) => slotState(banners, "matches", n, today)), [banners, today]);
  const ph = (n: number) => slots.find((s) => s.slot === n)?.placeholderEnabled ?? false;
  const openNew = (slot = 1) => setEditor({ open: true, banner: null, preset: { slot, screen: "matches" } });
  const openEdit = (b: Banner) => setEditor({ open: true, banner: b });
  const counts = useMemo(() => { const c = { live: 0, sched: 0, off: 0 }; banners.forEach((b) => { const s = statusOf(b, today); c[s === "done" ? "off" : s]++; }); return c; }, [banners, today]);

  async function toggle(b: Banner, undo = false) {
    const on = !b.active;
    setBanners((x) => x.map((y) => (y.id === b.id ? { ...y, active: on } : y)));
    try {
      await updateBanner(b.id, { active: on });
      if (undo) toast.info(on ? "Банер знову показується" : "Банер знову вимкнено", { description: `«${b.title}»` });
      else if (on) toast.success("Показ увімкнено", { description: `«${b.title}» · ${periodText(b)}` });
      else toast.success("Показ вимкнено", { description: `Слот ${b.slot ?? 1} тепер ${ph(b.slot ?? 1) ? "показує заглушку" : "прихований у застосунку"}`, duration: 10_000, className: "v3-toast-10s", action: { label: <UndoRing label="Повернути" />, onClick: () => { void toggle({ ...b, active: false }, true); } } });
    } catch (e) { setBanners((x) => x.map((y) => (y.id === b.id ? { ...y, active: b.active } : y))); toast.error("Не вдалося змінити показ", { description: (e as Error).message }); }
  }
  async function togglePh(n: number) {
    const cur = ph(n), before = slots;
    setSlots((s) => (s.some((y) => y.slot === n) ? s.map((y) => (y.slot === n ? { ...y, placeholderEnabled: !cur } : y)) : [...s, { slot: n, placeholderEnabled: !cur } as BannerSlotState]));
    try { const r = await updateBannerSlot(n, !cur); setSlots((s) => [...s.filter((x) => x.slot !== n), r]); toast.success(cur ? "Плейсхолдер вимкнено" : "Плейсхолдер увімкнено", { description: cur ? `Слот ${n} у застосунку прихований, поки немає банера` : `У слоті ${n} — заглушка MatchIQ` }); }
    catch (e) { setSlots(() => before); toast.error("Не вдалося змінити плейсхолдер", { description: (e as Error).message }); }
  }
  async function remove() {
    const b = del; if (!b) return;
    setBusy(true);
    try {
      await deleteBanner(b.id);
      setBanners((x) => x.filter((y) => y.id !== b.id)); setDel(null); setEditor({ open: false, banner: null });
      toast.success("Банер видалено", { description: `«${b.title}» прибрано із застосунку`, duration: 10_000, className: "v3-toast-10s", action: { label: <UndoRing label="Повернути" />, onClick: async () => { try { await createBanner({ active: b.active, screen: b.screen, startsOn: b.startsOn ?? null, endsOn: b.endsOn ?? null, slot: b.slot, title: b.title, description: b.description, imageUrl: b.imageUrl, href: b.href }); toast.info("Банер повернуто", { description: `«${b.title}»` }); reload(); } catch (e) { toast.error("Не вдалося повернути банер", { description: (e as Error).message }); } } } });
    } catch (e) { toast.error("Не вдалося видалити банер", { description: (e as Error).message }); }
    setBusy(false);
  }

  function slotCard(n: number) {
    const s = st[n - 1], b = s.current;
    const head = (tag: React.ReactNode) => <div className="v3-adw-slot-h"><div><strong>Слот {n}</strong><span>{WHERE[n]}</span></div>{tag}</div>;
    if (!b) return (
      <article key={n} className="v3-adw-card v3-adw-slot" style={{ animationDelay: `${n * 40}ms` }}>
        {head(<WTag cls="is-off" label="Порожній" />)}
        <div className="v3-adw-free">{ph(n) ? <><strong>Слот вільний</strong><span>Користувачі бачать заглушку MatchIQ «Тут може бути ваша реклама»</span></> : <><strong>У застосунку слот прихований</strong><span>Користувачі не бачать нічого на цьому місці</span></>}</div>
        <dl className="v3-adw-dl">
          <div><dt>Розмір зображення</dt><dd>1100 × 260 px · до 1,5 МБ</dd></div>
          <div><dt>Останній банер тут</dt><dd>{s.last ? `${s.last.title.length > 26 ? s.last.title.slice(0, 26) + "…" : s.last.title}${s.last.endsOn ? ` · до ${shortDay(s.last.endsOn)}` : ""}` : "ще не було"}</dd></div>
          <div><dt>Плейсхолдер</dt><dd>заглушка MatchIQ, коли банера немає</dd></div>
        </dl>
        <div className="v3-adw-slot-f">
          <button type="button" className="v3-uwb is-green" disabled={!online} onClick={() => openNew(n)}><Plus size={15} aria-hidden="true" />Створити банер</button>
          <WSwitch on={ph(n)} label="Плейсхолдер" disabled={!online} onChange={() => togglePh(n)} />
        </div>
      </article>
    );
    const t = timeline(b, today), bs = t.st as BStatus;
    const left = b.endsOn && bs === "live" ? daysTo(today, b.endsOn) : null;
    const soon = left !== null && left <= 3;
    const cl = entityStats(stats, "banner:", b.id);
    return (
      <article key={n} className="v3-adw-card v3-adw-slot" style={{ animationDelay: `${n * 40}ms` }}>
        {head(<BTag s={bs} />)}
        <button type="button" className="v3-adw-artbtn" aria-label={`Редагувати «${b.title}»`} onClick={() => openEdit(b)}><BannerArt b={b} dim={bs === "off" || bs === "done"} /></button>
        {soon && <div className="v3-adw-warn"><AlertTriangle size={14} aria-hidden="true" />{left === 0 ? "Сьогодні останній день" : `Закінчується через ${left} ${pl(left!, "день", "дні", "днів")}`} — {shortDay(b.endsOn!)}</div>}
        {bs === "done" && <div className="v3-adw-warn">Завершився {b.endsOn ? shortDay(b.endsOn) : ""} — у застосунку вже не показується</div>}
        <dl className="v3-adw-dl">
          <div><dt>Період</dt><dd>{periodText(b)}</dd></div>
          <div><dt>Посилання</dt><dd>{b.href ? <a href={b.href} target="_blank" rel="noreferrer">{host(b.href)}</a> : "—"}</dd></div>
          {cl.impressions ? <div><dt>Кліки · 7 днів</dt><dd>{nf(cl.clicks)} · CTR {ctr(cl.clicks, cl.impressions)}</dd></div>
            : <div><dt>Оновив</dt><dd>{b.updatedBy ? `@${b.updatedBy}` : "—"}{b.changedAt || b.updatedAt ? ` · ${shortDay((b.changedAt || b.updatedAt)!.slice(0, 10))}` : ""}</dd></div>}
          <div><dt>Далі в слоті</dt><dd>{s.upcoming ? <>{s.upcoming.title}{s.upcoming.startsOn ? ` · з ${shortDay(s.upcoming.startsOn)}` : ""}<WTag cls={s.upcoming.active ? "is-sched" : "is-off"} label={s.upcoming.active ? "Заплановано" : "Вимкнено"} /></> : "нічого не заплановано"}</dd></div>
        </dl>
        <div className="v3-adw-slot-f">
          <span className="v3-adw-btns">
            {(soon || bs === "done") && <button type="button" className="v3-uwb is-green" disabled={!online} onClick={() => openEdit(b)}>Подовжити</button>}
            <button type="button" className="v3-uwb" onClick={() => openEdit(b)}>Редагувати</button>
          </span>
          {bs !== "done" && <WSwitch on={b.active} label={b.active ? "Показ увімкнено" : "Показ вимкнено"} disabled={!online} onChange={() => toggle(b)} />}
        </div>
      </article>
    );
  }

  const rows = banners.filter((b) => { const s = statusOf(b, today); return cf === "all" || (cf === "off" ? s === "off" || s === "done" : s === cf); })
    .sort((a, b) => { const o = { live: 0, sched: 1, off: 2, done: 3 }; return o[statusOf(a, today)] - o[statusOf(b, today)] || (b.startsOn || "").localeCompare(a.startsOn || ""); });

  return (
    <>
      {banners.length === 0 ? (
        <WEmpty icon={<ImageIcon size={20} />} title="Банерів ще немає" text="Обидва слоти на екрані «Матчі» вільні. Створіть перший банер — оберіть слот і період показу."
          action={<button type="button" className="v3-uwb is-green" disabled={!online} onClick={() => openNew(1)}><Plus size={15} aria-hidden="true" />Створити банер</button>} />
      ) : <>
        <section className="v3-adw-slots">{slotCard(1)}{slotCard(2)}</section>
        <section className="v3-adw-card v3-adw-camp">
          <div className="v3-adw-camp-h">
            <h2>Усі кампанії <span>{banners.length}</span></h2>
            <div className="v3-adw-seg" role="group" aria-label="Фільтр кампаній">
              <PillTrack active={cf} />
              {([["all", "Усі", banners.length], ["live", "Активні", counts.live], ["sched", "У черзі", counts.sched], ["off", "Вимкнені", counts.off]] as [CF, string, number][]).map(([k, l, c]) => <button key={k} type="button" className={cf === k ? "is-on" : ""} aria-pressed={cf === k} onClick={() => setCf(k)}>{l} · {c}</button>)}
            </div>
          </div>
          <div className="v3-adw-tr v3-adw-bncols is-th"><span>Банер</span><span>Місце</span><span>Період</span><span className="is-r">Кліки · 7 дн.</span><span>Статус</span><span /></div>
          {rows.length === 0 && <p className="v3-adw-none">Немає кампаній із таким статусом</p>}
          {rows.map((b, i) => { const s = statusOf(b, today), c = entityStats(stats, "banner:", b.id); return (
            <div key={b.id} className="v3-adw-tr v3-adw-bncols" role="button" tabIndex={0} style={{ animationDelay: `${i * 30}ms` }} onClick={() => openEdit(b)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(b); } }}>
              <span className="v3-adw-bname">{b.imageUrl ? <img src={b.imageUrl} alt="" /> : <i aria-hidden="true" />}<strong>{b.title}</strong></span>
              <span>Слот {b.slot ?? 1} · {screenOf(b.screen).label}</span>
              <span>{periodText(b)}</span>
              <span className="is-r is-num">{nf(c.clicks)}</span>
              <span><BTag s={s} /></span>
              <span className="is-r"><Kebab label={`Дії: ${b.title}`} items={[
                { label: "Редагувати", icon: <Pencil size={14} />, run: () => openEdit(b) },
                ...(s !== "done" ? [{ label: b.active ? "Вимкнути показ" : "Увімкнути показ", icon: <Power size={14} />, disabled: !online, run: () => toggle(b) }] : []),
                { label: "Видалити", icon: <Trash2 size={14} />, red: true, disabled: !online, run: () => setDel(b) },
              ]} /></span>
            </div>
          ); })}
        </section>
      </>}

      <BannerEditor open={editor.open} banner={editor.banner} preset={editor.preset} banners={banners} online={online}
        onClose={() => setEditor({ open: false, banner: null })}
        onSaved={() => { setEditor({ open: false, banner: null }); reload(); }}
        onAskDelete={(b) => setDel(b)} />
      <DeleteAsk open={!!del} title="Видалити банер?" busy={busy} onClose={() => setDel(null)} onDelete={remove}
        text={<>«{del?.title}» зникне із застосунку і зі списку.<br />Статистика лишиться у звітах.</>}
        alt={del?.active && statusOf(del, today) !== "done" ? { label: "Вимкнути замість цього", run: () => { const b = del; setDel(null); setEditor({ open: false, banner: null }); void toggle(b); } } : undefined} />
    </>
  );
}
