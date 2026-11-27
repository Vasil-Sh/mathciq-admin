import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, WifiOff } from "lucide-react";
import PillTrack from "@/components/PillTrack";
import ExportCsvButton from "@/components/ExportCsvButton";
import RollingNumber from "@/components/RollingNumber";
import { downloadCsv } from "@/lib/csv";
import { bookmakerStatus, ctr, entityStats, fetchAdStats, nf, pctChange, promoStatus, type AdStats, type Bookmaker, type Promo } from "@/lib/adsModel";
import { shortDay, slotState, statusOf } from "@/lib/bannersModel";
import type { AppSettings, Banner, BannerSlotState } from "@/types";
import BannersWeb from "./BannersWeb";
import TelegramWeb from "./TelegramWeb";
import PartnersWeb from "./PartnersWeb";
import StatsWeb, { statRows, type SRange } from "./StatsWeb";
import { pl } from "./AdsWebShared";

export type AdTab = "banners" | "telegram" | "bookmakers" | "stats";
type Editor = { open: boolean; banner: Banner | null; preset?: { slot: number; screen: string } };
type Props = {
  tab: AdTab; setTab: (t: AdTab) => void; online: boolean; today: string;
  banners: Banner[] | null; slots: BannerSlotState[]; bnErr: string; loadBanners: () => Promise<void> | void;
  setBanners: (fn: (b: Banner[]) => Banner[]) => void; setSlots: (fn: (s: BannerSlotState[]) => BannerSlotState[]) => void;
  editor: Editor; setEditor: (e: Editor) => void;
  bms: Bookmaker[] | null; bmErr: string; setBms: (fn: (l: Bookmaker[]) => Bookmaker[]) => void;
  promos: Promo[] | null; prErr: string; setPromos: (fn: (l: Promo[]) => Promo[]) => void;
  week: AdStats | null; settings: AppSettings | null; setSettings: (s: AppSettings) => void; loadAds: () => void;
  creatingBm: boolean; setCreatingBm: (v: boolean) => void; creatingPr: boolean; setCreatingPr: (v: boolean) => void;
};

const daysTo = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

export default function AdsWeb(p: Props) {
  const { tab, setTab, online, today, banners, bms, promos, week } = p;
  const bl = banners || [], bm = bms || [], pr = promos || [];
  const loading = banners === null || bms === null || promos === null;
  const [range, setRange] = useState<SRange>({ days: 14 });
  const [st, setSt] = useState<AdStats | null>(null);
  const [stErr, setStErr] = useState("");
  useEffect(() => {
    if (tab !== "stats" || ("from" in range && !(range.from && range.to))) return;
    let off = false; setSt(null); setStErr("");
    fetchAdStats(range).then((s) => { if (!off) setSt(s); }).catch((e) => { if (!off) setStErr((e as Error).message || "Сервер не відповідає"); });
    return () => { off = true; };
  }, [tab, JSON.stringify(range)]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => statRows(st, bl, bm, pr), [st, bl, bm, pr]);

  const live = bl.filter((b) => statusOf(b, today) === "live").length;
  const occupied = [1, 2].filter((n) => slotState(bl, "matches", n, today).occupied).length;
  const queued = bl.filter((b) => statusOf(b, today) === "sched").length;
  const prLive = pr.filter((x) => promoStatus(x, today) === "live").length;
  const bmLive = bm.filter((b) => ["live", "soon"].includes(bookmakerStatus(b, today))).length;

  // «Потребують уваги»: banners ending in ≤3 days, texts waiting for approval, partners with a licence problem
  const att = useMemo(() => {
    const ending = bl.filter((b) => statusOf(b, today) === "live" && b.endsOn && daysTo(today, b.endsOn) <= 3);
    const pending = pr.filter((x) => x.reviewStatus === "pending");
    const lic = bm.filter((b) => ["expired", "draft"].includes(bookmakerStatus(b, today)));
    const notes = [ending.length ? (ending.length === 1 ? "банер закінчується" : `${ending.length} банери закінчуються`) : "", lic.length ? (lic.some((b) => bookmakerStatus(b, today) === "expired") ? "ліцензія минула" : "партнер без ліцензії") : "", pending.length ? (ending.length || lic.length ? "текст на схваленні" : pending.length === 1 ? "чекає схвалення тексту" : `${pending.length} тексти чекають схвалення`) : ""].filter(Boolean);
    return { n: ending.length + pending.length + lic.length, note: notes.join(" · "), ending, pending, lic };
  }, [bl, pr, bm, today]);
  // «Найближча зміна»: the earliest start or last day ahead
  const next = useMemo(() => {
    const ev: { day: string; text: string }[] = [];
    bl.forEach((b) => { const s = statusOf(b, today); if (s === "sched" && b.startsOn) ev.push({ day: b.startsOn, text: `«${b.title}» в слот ${b.slot ?? 1}` }); if (s === "live" && b.endsOn) ev.push({ day: b.endsOn, text: `останній день «${b.title}»` }); });
    pr.forEach((x) => { if (x.reviewStatus !== "rejected" && x.startsOn && x.startsOn >= today) ev.push({ day: x.startsOn, text: `старт ${x.name} у Telegram` }); });
    return ev.sort((a, b) => a.day.localeCompare(b.day))[0] || null;
  }, [bl, pr, today]);

  const wt = week?.totals;
  const bnW = entityStats(week, "banner:");
  const kpis = tab === "stats" ? (() => {
    const t = st?.totals, ch = t && st ? pctChange(t.impressions, st.previous.impressions) : null;
    const best = rows.filter((r) => r.impressions >= 50).sort((x, y) => y.clicks / y.impressions - x.clicks / x.impressions)[0];
    const len = "days" in range ? range.days : st?.daily.length || 0;
    return [
      { k: "imp", label: `Покази · ${len} ${pl(len, "день", "дні", "днів")}`, v: t ? nf(t.impressions) : "…", note: !t ? "" : ch === null ? `попередні ${len} ${pl(len, "день", "дні", "днів")} без даних` : `${ch > 0 ? "+" : ""}${ch}% до попередніх ${len} ${pl(len, "дня", "днів", "днів")}` },
      { k: "cl", label: "Кліки", v: t ? nf(t.clicks) : "…", note: t ? `CTR ${ctr(t.clicks, t.impressions)}` : "" },
      { k: "best", label: "Найкраще місце", v: best ? best.name.split(" · ")[0] : t ? "—" : "…", note: best ? `CTR ${ctr(best.clicks, best.impressions)} · ${best.kind === "banner" ? "Матчі" : best.where}` : t ? "потрібно від 50 показів" : "", sm: true },
      { k: "uniq", label: "Унікальні", v: t ? nf(t.uniqueUsers) : "…", note: t ? "бачили рекламу хоча б раз" : "" },
    ];
  })() : [
    { k: "cl", label: "Кліки · 7 днів", v: week ? nf(tab === "banners" && bnW.clicks ? bnW.clicks : wt!.clicks) : loading ? "…" : "0", note: !wt || !wt.impressions ? (tab === "bookmakers" ? "усі партнери" : bl.length + pr.length + bm.length ? "за всі розміщення" : "реклама ще не показувалась") : tab === "banners" && bnW.impressions ? `CTR ${ctr(bnW.clicks, bnW.impressions)} · банери` : tab === "bookmakers" ? "усі партнери" : "за всі розміщення" },
    { k: "imp", label: "Покази · 7 днів", v: week ? nf(wt!.impressions) : loading ? "…" : "0", note: "усі розміщення" },
    { k: "att", label: "Потребують уваги", v: loading ? "…" : String(att.n), note: att.note || "усе гаразд", warn: att.n > 0 },
    { k: "next", label: "Найближча зміна", v: loading ? "…" : next ? shortDay(next.day) : "—", note: next ? next.text : "нічого не заплановано", sm: true },
  ];

  const nothing = !loading && !bl.length && !pr.length && !bm.length;
  const sub = loading ? "завантажуємо…" : nothing ? "реклами ще немає"
    : tab === "banners" ? (bl.length ? `${live} ${pl(live, "банер показується", "банери показуються", "банерів показується")} · ${queued ? `${queued} у черзі` : `${2 - occupied} ${pl(2 - occupied, "слот вільний", "слоти вільні", "слотів вільно")}`}` : "банерів ще немає")
    : tab === "bookmakers" ? (bm.length ? `${bm.length} ${pl(bm.length, "партнер", "партнери", "партнерів")} · ${nf(entityStats(week, "bookmaker:").clicks)} ${pl(entityStats(week, "bookmaker:").clicks, "клік", "кліки", "кліків")} за 7 днів` : "партнерів ще немає")
    : tab === "stats" ? `${rows.length} ${pl(rows.length, "розміщення", "розміщення", "розміщень")} · ${st ? nf(st.totals.clicks) : "…"} ${pl(st?.totals.clicks || 0, "клік", "кліки", "кліків")} за ${"days" in range ? `${range.days} днів` : "період"}`
    : `${pr.length} ${pl(pr.length, "розміщення", "розміщення", "розміщень")} · ${nf(entityStats(week, "telegram:").clicks)} ${pl(entityStats(week, "telegram:").clicks, "клік", "кліки", "кліків")} за 7 днів`;

  const tabs: { id: AdTab; label: string; n: string }[] = [
    { id: "banners", label: "Банери", n: banners ? `${occupied}/2` : "…" },
    { id: "telegram", label: "Telegram", n: promos ? String(pr.filter((x) => !["rejected", "done"].includes(promoStatus(x, today))).length) : "…" },
    { id: "bookmakers", label: "Букмекери", n: bms ? String(bm.length) : "…" },
    { id: "stats", label: "Статистика", n: "" },
  ];
  const chip = loading ? null : tab === "banners" && att.ending[0] ? `«${att.ending[0].title}» ${daysTo(today, att.ending[0].endsOn!) === 0 ? "закінчується сьогодні" : `закінчується через ${daysTo(today, att.ending[0].endsOn!)} ${pl(daysTo(today, att.ending[0].endsOn!), "день", "дні", "днів")}`}`
    : tab === "telegram" && att.pending.length ? `${att.pending.length} ${pl(att.pending.length, "текст чекає", "тексти чекають", "текстів чекають")} схвалення`
    : tab === "bookmakers" && att.lic[0] ? (bookmakerStatus(att.lic[0], today) === "expired" ? `У ${att.lic[0].name} минула ліцензія` : `${att.lic[0].name} — чернетка`) : null;

  function exportCsv() {
    if (!st) return;
    downloadCsv(`ad-stats-${st.from}_${st.to}.csv`, ["Розміщення", "Місце", "Покази", "Кліки", "CTR"], rows.map((r) => [r.name, r.where, r.impressions, r.clicks, ctr(r.clicks, r.impressions)]));
  }
  const action = tab === "stats" ? <ExportCsvButton className="v3-uwb is-white" onClick={exportCsv} disabled={!st || !rows.length} />
    : tab === "banners" ? <button type="button" className="v3-uwb is-green" disabled={!online || banners === null} onClick={() => p.setEditor({ open: true, banner: null, preset: { slot: !slotState(bl, "matches", 1, today).occupied ? 1 : !slotState(bl, "matches", 2, today).occupied ? 2 : 1, screen: "matches" } })}><Plus size={15} aria-hidden="true" />Створити банер</button>
    : tab === "telegram" ? <button type="button" className="v3-uwb is-green" disabled={!online || promos === null} onClick={() => p.setCreatingPr(true)}><Plus size={15} aria-hidden="true" />Додати групу</button>
    : <button type="button" className="v3-uwb is-green" disabled={!online || bms === null} onClick={() => p.setCreatingBm(true)}><Plus size={15} aria-hidden="true" />Додати партнера</button>;

  const err = tab === "banners" ? p.bnErr && banners === null : tab === "telegram" ? p.prErr && promos === null : tab === "bookmakers" ? p.bmErr && bms === null : false;
  const tabLoading = tab === "banners" ? banners === null : tab === "telegram" ? promos === null : tab === "bookmakers" ? bms === null : false;

  return (
    <div className="v3-page v3-uw v3-adw">
      <section className="v3-uw-hero">
        <div><h1>Реклама</h1><p>{sub}</p></div>
        <div className="v3-uw-hacts">{action}</div>
      </section>
      {!online && <div className="v3-uw-off" role="status"><WifiOff size={15} aria-hidden="true" /><span>Немає інтернету. Зміни реклами не збережуться — дочекайтесь з’єднання.</span></div>}
      <section className="v3-pw-kpis" aria-label="Підсумки">
        {kpis.map((x, i) => (
          <div key={`${tab === "stats" ? "s" : "w"}-${x.k}`} className={`v3-pw-kpi${i === 0 ? " is-on" : ""}`} style={{ animationDelay: `${i * 40}ms` }}>
            <span>{x.label}</span>
            <strong className={`${"warn" in x && x.warn ? "is-warn" : ""}${"sm" in x && x.sm ? " is-sm" : ""}`}>{x.v === "…" ? "…" : <RollingNumber key={x.v} text={x.v} />}</strong>
            <small>{x.note}</small>
          </div>
        ))}
      </section>
      <div className="v3-uw-tools v3-adw-tools">
        <div className="v3-uw-tabs" role="tablist" aria-label="Розділи реклами">
          <PillTrack active={tab} />
          {tabs.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "is-on" : ""} onClick={() => setTab(t.id)}>{t.label}{t.n && <span className="v3-pw-tn">{t.n}</span>}</button>)}
        </div>
        {chip && <span key={chip} className="v3-adw-chip"><AlertTriangle size={13} aria-hidden="true" />{chip}</span>}
      </div>

      {err ? <div className="v3-adw-card"><div className="v3-uw-empty is-err" role="alert"><span>!</span><strong>Не вдалося завантажити</strong><p>{tab === "banners" ? p.bnErr : tab === "telegram" ? p.prErr : p.bmErr}. У застосунку реклама працює як раніше.</p><div><button type="button" className="v3-uwb is-green" onClick={() => { p.loadBanners(); p.loadAds(); }}>Спробувати ще раз</button></div></div></div>
        : tabLoading ? <section className="v3-adw-slots v3-adw-skel" role="status" aria-label="Завантаження">{[0, 1].map((i) => <div key={i} className="v3-adw-card"><i style={{ width: "40%", height: 14 }} /><i style={{ height: 66 }} /><i style={{ height: 10 }} /><i style={{ width: "65%", height: 10 }} /></div>)}</section>
        : tab === "banners" ? <BannersWeb banners={bl} slots={p.slots} stats={week} online={online} today={today} reload={p.loadBanners} setBanners={p.setBanners} setSlots={p.setSlots} editor={p.editor} setEditor={p.setEditor} />
        : tab === "telegram" ? <TelegramWeb list={pr} stats={week} online={online} reload={p.loadAds} setList={p.setPromos} creating={p.creatingPr} setCreating={p.setCreatingPr} />
        : tab === "bookmakers" ? <PartnersWeb list={bm} stats={week} settings={p.settings} online={online} today={today} reload={p.loadAds} setList={p.setBms} setSettings={p.setSettings} creating={p.creatingBm} setCreating={p.setCreatingBm} />
        : <StatsWeb stats={st} error={stErr} range={range} setRange={setRange} rows={rows} />}
    </div>
  );
}
