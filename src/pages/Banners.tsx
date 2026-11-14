import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Plus } from "lucide-react";
import BannersTab from "@/components/banners/BannersTab";
import PartnersTab from "@/components/ads/PartnersTab";
import TelegramTab from "@/components/ads/TelegramTab";
import StatsTab from "@/components/ads/StatsTab";
import { AdsSums } from "@/components/ads/AdsShared";
import { fetchBanners, fetchBannerSlots } from "@/lib/adminBannersApi";
import { fetchSettings } from "@/lib/adminSettingsApi";
import { kyivToday, slotState, statusOf } from "@/lib/bannersModel";
import { bookmakerStatus, fetchAdStats, fetchBookmakers, fetchPromos, promoStatus, type AdStats, type Bookmaker, type Promo } from "@/lib/adsModel";
import { nf } from "@/lib/adsModel";
import { useMedia, useOnline } from "@/hooks/useMediaOnline";
import type { AppSettings, Banner, BannerSlotState } from "@/types";

type Tab = "banners" | "telegram" | "bookmakers" | "stats";
const TABS: { id: Tab; label: string }[] = [{ id: "banners", label: "Банери" }, { id: "telegram", label: "Telegram-групи" }, { id: "bookmakers", label: "Букмекери" }, { id: "stats", label: "Статистика" }];

export default function Banners() {
  const wide = useMedia("(min-width: 1180px)");
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id || "banners") as Tab;
  const [banners, setBannersState] = useState<Banner[] | null>(null);
  const [slots, setSlotsState] = useState<BannerSlotState[]>([]);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<{ open: boolean; banner: Banner | null; preset?: { slot: number; screen: string } }>({ open: false, banner: null });
  const [bms, setBms] = useState<Bookmaker[] | null>(null);
  const [bmErr, setBmErr] = useState("");
  const [promos, setPromos] = useState<Promo[] | null>(null);
  const [prErr, setPrErr] = useState("");
  const [week, setWeek] = useState<AdStats | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [creatingBm, setCreatingBm] = useState(false);
  const [creatingPr, setCreatingPr] = useState(false);
  const statsActions = useRef<{ exp: (() => void) | null; rep: (() => void) | null }>({ exp: null, rep: null });

  const load = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([fetchBanners(), fetchBannerSlots().catch(() => [] as BannerSlotState[])]);
      setBannersState(b); setSlotsState(s); setError("");
    } catch (e) { setError((e as Error).message || "Сервер не відповідає"); }
  }, []);
  const loadAds = useCallback(() => {
    fetchBookmakers().then((x) => { setBms(x); setBmErr(""); }).catch((e) => setBmErr((e as Error).message));
    fetchPromos().then((x) => { setPromos(x); setPrErr(""); }).catch((e) => setPrErr((e as Error).message));
    fetchAdStats({ days: 7 }).then(setWeek).catch(() => setWeek(null));
    fetchSettings().then(setSettings).catch(() => {});
  }, []);
  useEffect(() => { load(); loadAds(); }, [load, loadAds]);

  const today = kyivToday();
  const list = banners || [];
  const live = list.filter((b) => statusOf(b, today) === "live").length;
  const occupied = useMemo(() => [1, 2].filter((n) => slotState(list, "matches", n, today).occupied).length, [list, today]);
  const bmLive = (bms || []).filter((b) => ["live", "soon"].includes(bookmakerStatus(b, today)));
  const prLive = (promos || []).filter((p) => promoStatus(p, today) === "live");
  const attention = useMemo(() => {
    const notes: string[] = [];
    (bms || []).forEach((b) => { const s = bookmakerStatus(b, today); if (s === "draft") notes.push(`ліцензія ${b.name}`); else if (s === "soon" || s === "expired") notes.push(`ліцензія ${b.name} спливає`); });
    const pending = (promos || []).filter((p) => p.reviewStatus === "pending").length;
    if (pending) notes.push(pending === 1 ? "текст на перевірці" : `${pending} тексти на перевірці`);
    return { n: notes.length ? (bms || []).filter((b) => ["draft", "soon", "expired"].includes(bookmakerStatus(b, today))).length + pending : 0, note: notes.join(" · ") };
  }, [bms, promos, today]);

  const newAction = tab === "banners" ? { label: "Новий банер", run: () => setEditor({ open: true, banner: null, preset: { slot: 1, screen: "matches" } }), ready: banners !== null }
    : tab === "telegram" ? { label: "Додати групу", run: () => setCreatingPr(true), ready: promos !== null }
    : tab === "bookmakers" ? { label: "Додати партнера", run: () => setCreatingBm(true), ready: bms !== null } : null;

  const sub = tab === "banners" ? `${live} ${live === 1 ? "банер показується" : "банерів показується"} · ${2 - occupied} ${2 - occupied === 1 ? "слот вільний" : "слоти вільні"}`
    : `${live + bmLive.length + prLive.length} розміщень · ${week ? nf(week.totals.clicks) : "—"} кліків за 7 днів`;

  return (
    <div className="v3-page v3-ads">
      <section className="v3-hero v3-hero-row">
        <div>
          <h1 className="v3-title">Реклама</h1>
          <p className="v3-subtitle"><span className="v3-hide-mobile">Банери в застосунку, Telegram-групи й букмекери-партнери. На кожному місці — мітка «Реклама · 21+», її не вимкнути. Час — київський.</span><span className="v3-only-mobile">{sub}</span></p>
        </div>
        <div className="v3-chips">
          {tab === "stats" && <>
            <button type="button" className="v3-chip v3-hide-mobile" onClick={() => statsActions.current.rep?.()}>Звіт для партнера · CSV</button>
            <button type="button" className="v3-btn v3-btn-primary" onClick={() => statsActions.current.exp?.()}><Download size={15} aria-hidden="true" />Експорт CSV</button>
          </>}
          {newAction && <>
            <button type="button" className="v3-btn v3-btn-primary v3-hide-mobile" disabled={!online || !newAction.ready} onClick={newAction.run}><Plus size={17} aria-hidden="true" />{newAction.label}</button>
            <button type="button" className="v3-fab v3-only-mobile" aria-label={newAction.label} disabled={!online || !newAction.ready} onClick={newAction.run}><Plus size={20} strokeWidth={2.4} aria-hidden="true" /></button>
          </>}
        </div>
      </section>

      <div className="v3-ptabs v3-ads-tabs" role="tablist" aria-label="Розділи реклами">
        {TABS.map((t) => {
          const n = t.id === "banners" ? (banners ? `${occupied}/2` : "") : t.id === "telegram" ? (promos ? String(promos.filter((p) => !["rejected", "done"].includes(promoStatus(p, today))).length) : "") : t.id === "bookmakers" ? (bms ? String(bmLive.length) : "") : "";
          return <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`v3-ptab${tab === t.id ? " is-on" : ""}`} onClick={() => setParams(t.id === "banners" ? {} : { tab: t.id })}>{t.label}{n ? <span>{n}</span> : null}</button>;
        })}
      </div>

      {(tab === "telegram" || tab === "bookmakers") && wide && <AdsSums stats={week} active={{ banners: live, telegram: prLive.length, bookmakers: bmLive.length }} attention={attention} />}
      {(tab === "telegram" || tab === "bookmakers") && !wide && (
        <section className="v3-ad-mkpis">
          <div className="is-blue"><span>Кліки · 7 днів</span><b>{week ? nf(week.totals.clicks) : "—"}</b></div>
          <div><span>Потребують уваги</span><b className={attention.n ? "is-warn" : ""}>{attention.n}</b></div>
        </section>
      )}

      {tab === "banners" && (
        <BannersTab banners={banners} slots={slots} error={error} wide={wide} online={online} reload={load}
          setBanners={(fn) => setBannersState((b) => fn(b || []))} setSlots={(fn) => setSlotsState((s) => fn(s))}
          editor={editor} setEditor={setEditor} />
      )}
      {tab === "bookmakers" && <PartnersTab list={bms} error={bmErr} stats={week} settings={settings} wide={wide} online={online} reload={loadAds} setList={(fn) => setBms((l) => fn(l || []))} setSettings={setSettings} creating={creatingBm} setCreating={setCreatingBm} />}
      {tab === "telegram" && <TelegramTab list={promos} error={prErr} stats={week} wide={wide} online={online} reload={loadAds} setList={(fn) => setPromos((l) => fn(l || []))} creating={creatingPr} setCreating={setCreatingPr} />}
      {tab === "stats" && <StatsTab banners={list} bookmakers={bms || []} promos={promos || []} wide={wide} exportRef={(exp, rep) => { statsActions.current = { exp, rep }; }} />}
    </div>
  );
}
