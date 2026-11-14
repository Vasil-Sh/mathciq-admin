import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import BannersTab from "@/components/banners/BannersTab";
import { fetchBanners, fetchBannerSlots } from "@/lib/adminBannersApi";
import { kyivToday, slotState, statusOf } from "@/lib/bannersModel";
import { useMedia, useOnline } from "@/hooks/useMediaOnline";
import type { Banner, BannerSlotState } from "@/types";

type Tab = "banners";
const TABS: { id: Tab; label: string }[] = [{ id: "banners", label: "Банери" }];

export default function Banners() {
  const wide = useMedia("(min-width: 1180px)");
  const online = useOnline();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id || "banners") as Tab;
  const [banners, setBannersState] = useState<Banner[] | null>(null);
  const [slots, setSlotsState] = useState<BannerSlotState[]>([]);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<{ open: boolean; banner: Banner | null; preset?: { slot: number; screen: string } }>({ open: false, banner: null });

  const load = useCallback(async () => {
    try {
      const [b, s] = await Promise.all([fetchBanners(), fetchBannerSlots().catch(() => [] as BannerSlotState[])]);
      setBannersState(b); setSlotsState(s); setError("");
    } catch (e) { setError((e as Error).message || "Сервер не відповідає"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const today = kyivToday();
  const list = banners || [];
  const live = list.filter((b) => statusOf(b, today) === "live").length;
  const occupied = useMemo(() => [1, 2].filter((n) => slotState(list, "matches", n, today).occupied).length, [list, today]);

  return (
    <div className="v3-page v3-ads">
      <section className="v3-hero v3-hero-row">
        <div>
          <h1 className="v3-title">Реклама</h1>
          <p className="v3-subtitle"><span className="v3-hide-mobile">Банери в застосунку, на кожному місці — мітка «Реклама · 21+», її не вимкнути. Час — київський.</span><span className="v3-only-mobile">{live} {live === 1 ? "банер показується" : "банерів показується"} · {2 - occupied} {2 - occupied === 1 ? "слот вільний" : "слоти вільні"}</span></p>
        </div>
        {tab === "banners" && <>
          <button type="button" className="v3-btn v3-btn-primary v3-hide-mobile" disabled={!online || banners === null} onClick={() => setEditor({ open: true, banner: null, preset: { slot: 1, screen: "matches" } })}><Plus size={17} aria-hidden="true" />Новий банер</button>
          <button type="button" className="v3-fab v3-only-mobile" aria-label="Новий банер" disabled={!online || banners === null} onClick={() => setEditor({ open: true, banner: null, preset: { slot: 1, screen: "matches" } })}><Plus size={20} strokeWidth={2.4} aria-hidden="true" /></button>
        </>}
      </section>

      {TABS.length > 1 && (
        <div className="v3-ptabs v3-ads-tabs" role="tablist" aria-label="Розділи реклами">
          {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`v3-ptab${tab === t.id ? " is-on" : ""}`} onClick={() => setParams(t.id === "banners" ? {} : { tab: t.id })}>{t.label}{t.id === "banners" && banners ? <span>{occupied}/2</span> : null}</button>)}
        </div>
      )}

      {tab === "banners" && (
        <BannersTab banners={banners} slots={slots} error={error} wide={wide} online={online} reload={load}
          setBanners={(fn) => setBannersState((b) => fn(b || []))} setSlots={(fn) => setSlotsState((s) => fn(s))}
          editor={editor} setEditor={setEditor} />
      )}
    </div>
  );
}
