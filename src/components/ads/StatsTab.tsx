import { useEffect, useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/csv";
import { ctr, dmy, fetchAdStats, licenseState, nf, pctChange, placeLabel, type AdStats, type Bookmaker, type Promo } from "@/lib/adsModel";
import { screenOf, shortDay } from "@/lib/bannersModel";
import type { Banner } from "@/types";

type Range = { days: number } | { from: string; to: string };
type Props = { banners: Banner[]; bookmakers: Bookmaker[]; promos: Promo[]; wide: boolean; exportRef: (fn: (() => void) | null, report: (() => void) | null) => void };

export default function StatsTab({ banners, bookmakers, promos, wide, exportRef }: Props) {
  const [range, setRange] = useState<Range>({ days: 14 });
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [showCustom, setShowCustom] = useState(false);
  const [stats, setStats] = useState<AdStats | null>(null);
  const [error, setError] = useState("");
  const [selKey, setSelKey] = useState<string | null>(null);

  useEffect(() => {
    let off = false; setError("");
    fetchAdStats(range).then((s) => { if (!off) setStats(s); }).catch((e) => { if (!off) setError((e as Error).message); });
    return () => { off = true; };
  }, [JSON.stringify(range)]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => (stats?.rows || []).map((r) => {
    const key = `${r.placement}|${r.entityId}`;
    let name = r.entityId || r.placement, where = r.placement, note = "", warn = false, partner = "";
    const [kind, a, b] = r.placement.split(":");
    if (kind === "banner") { const bn = banners.find((x) => x.id === r.entityId); name = bn?.title || `Банер №${r.entityId || "?"}`; where = `Банер · ${screenOf(a).label}, слот ${b || bn?.slot || "?"}`; note = "власна реклама"; }
    else if (kind === "bookmaker") {
      const bm = bookmakers.find((x) => x.id === r.entityId); name = bm?.name || `Букмекер №${r.entityId || "?"}`; partner = name;
      where = `Букмекер · ${a === "list" ? "список матчів (плашка в рядку)" : "деталі матчу"}`;
      const lic = bm ? licenseState(bm) : null;
      if (lic?.st === "soon" && bm?.licenseUntil) { note = `ліцензія спливає ${shortDay(bm.licenseUntil)}`; warn = true; }
      else if (bm?.clickPrice) note = `рахунок за кліки · ${nf(r.clicks)} × ${String(bm.clickPrice).replace(".", ",")} ₴ = ${nf(r.clicks * bm.clickPrice)} ₴`;
    } else if (kind === "telegram") { const p = promos.find((x) => x.id === r.entityId); name = p?.name || `Група №${r.entityId || "?"}`; partner = name; where = p ? placeLabel(p) : `Telegram · ${a === "top" ? "верх списку" : "деталі матчу"}`; note = p?.priceNote || (p?.startsOn ? `з ${shortDay(p.startsOn)}` : ""); }
    return { ...r, key, name, where, note, warn, partner };
  }), [stats, banners, bookmakers, promos]);

  const best = rows.filter((r) => r.impressions >= 50).sort((x, y) => y.clicks / y.impressions - x.clicks / x.impressions)[0];
  const t = stats?.totals, ch = t && stats ? pctChange(t.impressions, stats.previous.impressions) : null;
  const len = stats ? stats.daily.length : 0;
  const maxClicks = Math.max(1, ...(stats?.daily || []).map((d) => d.clicks));
  const sel = rows.find((r) => r.key === selKey) || null;
  const period = stats ? `${shortDay(stats.from)} — ${shortDay(stats.to)}` : "";

  useEffect(() => {
    const exportAll = () => {
      if (!stats) return;
      downloadCsv(`ad-stats-${stats.from}_${stats.to}.csv`, ["Розміщення", "Місце", "Покази", "Кліки", "CTR", "Примітка"], rows.map((r) => [r.name, r.where, r.impressions, r.clicks, ctr(r.clicks, r.impressions), r.note]));
      toast.success("Файл готовий", { description: `ad-stats-${stats.from}_${stats.to}.csv · ${rows.length} рядків` });
    };
    const report = () => {
      if (!stats) return;
      const partner = sel?.partner;
      if (!partner) { toast.info("Оберіть рядок партнера", { description: "Клацніть рядок букмекера або групи в таблиці нижче" }); return; }
      const mine = rows.filter((r) => r.partner === partner);
      const file = `report-${partner.replace(/\s+/g, "_")}-${stats.from}_${stats.to}.csv`;
      downloadCsv(file, ["Партнер", "Місце", "Період", "Покази", "Кліки", "CTR", "Примітка"], mine.map((r) => [partner, r.where, `${dmy(stats.from)} — ${dmy(stats.to)}`, r.impressions, r.clicks, ctr(r.clicks, r.impressions), r.note]));
      toast.success("Звіт готовий", { description: `${partner} · ${period} · CSV` });
    };
    exportRef(exportAll, report);
    return () => exportRef(null, null);
  }, [stats, rows, sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const seg = (
    <div className="v3-seg v3-ad-seg" role="group" aria-label="Період">
      {[7, 14, 30].map((d) => <button key={d} type="button" className={"days" in range && range.days === d && !showCustom ? "is-on" : ""} onClick={() => { setShowCustom(false); setRange({ days: d }); }}>{d} днів</button>)}
      <button type="button" className={showCustom ? "is-on" : ""} onClick={() => setShowCustom(true)}>Свій</button>
    </div>
  );

  if (error && !stats) return <div className="v3-dcard v3-uerror" role="alert"><span className="v3-uerror-ico" aria-hidden="true">!</span><strong>Не вдалося завантажити статистику</strong><span>{error}</span><div><button type="button" className="v3-btn v3-btn-blue" onClick={() => setRange({ ...range })}>Спробувати ще раз</button></div></div>;

  return (
    <>
      <section className="v3-ad-sums" aria-label="Підсумки за період">
        <div className="v3-ad-sum is-blue"><div className="l">Покази{period ? ` · ${period}` : ""}</div><div className="v">{t ? nf(t.impressions) : "—"}</div><div className="n">{ch === null ? `попередні ${len || ""} днів без даних` : `${ch > 0 ? "+" : ""}${ch}% до попередніх ${len} днів`}</div></div>
        <div className="v3-ad-sum"><div className="l">Кліки</div><div className="v">{t ? nf(t.clicks) : "—"}</div><div className="n">CTR {t ? ctr(t.clicks, t.impressions) : "—"}</div></div>
        <div className="v3-ad-sum"><div className="l">Найкраще місце</div><div className="v is-sm">{best ? best.name : "—"}</div><div className="n">{best ? `CTR ${ctr(best.clicks, best.impressions)} · ${best.where}` : "потрібно від 50 показів"}</div></div>
        <div className="v3-ad-sum"><div className="l">Унікальні користувачі</div><div className="v">{t ? nf(t.uniqueUsers) : "—"}</div><div className="n">{t && t.impressions && !t.uniqueUsers ? "застосунок ще не передає користувача" : "бачили рекламу хоча б раз"}</div></div>
      </section>

      <section className="v3-dcard v3-ad-chart">
        <div className="v3-ad-chart-h">
          <div><strong>Кліки по днях</strong><span>Усі місця разом · дні за Києвом</span></div>
          {seg}
        </div>
        {showCustom && (
          <form className="v3-ad-custom" onSubmit={(e) => { e.preventDefault(); if (custom.from && custom.to && custom.from <= custom.to) setRange({ ...custom }); else toast.error("Перевірте дати", { description: "Кінець не може бути раніше початку" }); }}>
            <label>З <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
            <label>По <input type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
            <button type="submit" className="v3-btn v3-btn-blue v3-btn-sm">Показати</button>
          </form>
        )}
        {!stats ? <div className="v3-ad-load" role="status">Завантажуємо…</div> : t && t.impressions + t.clicks === 0 ? (
          <div className="v3-ad-nostats"><span aria-hidden="true"><BarChart3 size={20} /></span><strong>Статистики за цей період немає</strong><small>Покази й кліки з’являться після перших показів реклами в застосунку.</small></div>
        ) : (
          <>
            <div className="v3-ad-bars" role="img" aria-label={`Кліки по днях, максимум ${maxClicks}`}>
              {stats.daily.map((d) => <div key={d.day} className="v3-ad-bar" title={`${dmy(d.day)}: ${nf(d.clicks)} кліків · ${nf(d.impressions)} показів`}><span style={{ height: `${Math.max(d.clicks ? 3 : 0, (d.clicks / maxClicks) * 100)}%` }} /></div>)}
            </div>
            <div className="v3-ad-axis">{stats.daily.map((d, i) => <span key={d.day}>{len <= 16 || i % Math.ceil(len / 15) === 0 ? Number(d.day.slice(8)) : ""}</span>)}</div>
          </>
        )}
      </section>

      <section className="v3-wcard v3-ad-table">
        <div className="v3-ad-table-h"><h2>За місцями й партнерами</h2><p>Для рахунку партнеру: оберіть рядок → «Звіт для партнера».</p></div>
        {rows.length === 0 ? <p className="v3-ad-foot">Подій за період немає.</p> : wide ? (
          <>
            <div className="v3-ad-tr v3-ad-stcols is-h"><span>Розміщення</span><span>Покази</span><span>Кліки</span><span>CTR</span><span>Примітка</span></div>
            {rows.map((r) => (
              <button key={r.key} type="button" className={`v3-ad-tr v3-ad-stcols${selKey === r.key ? " is-sel" : ""}`} aria-pressed={selKey === r.key} onClick={() => setSelKey(selKey === r.key ? null : r.key)}>
                <span className="v3-ad-cell2"><strong>{r.name}</strong><small>{r.where}</small></span>
                <span>{nf(r.impressions)}</span><span><b>{nf(r.clicks)}</b></span><span>{ctr(r.clicks, r.impressions)}</span>
                <span className={`v3-ad-note-c${r.warn ? " is-warn" : ""}`}>{r.note}</span>
              </button>
            ))}
          </>
        ) : (
          <div className="v3-ad-mlist">{rows.map((r) => (
            <button key={r.key} type="button" className={`v3-ad-mcard${selKey === r.key ? " is-on" : ""}`} onClick={() => setSelKey(selKey === r.key ? null : r.key)}>
              <span><strong>{r.name}</strong><small>{r.where}</small></span>
              <span className="v3-ad-mnum">{nf(r.clicks)}<small>кліків</small></span>
              <small className="v3-ad-mcard-f">{nf(r.impressions)} показів · CTR {ctr(r.clicks, r.impressions)}{r.note ? ` · ${r.note}` : ""}</small>
            </button>
          ))}</div>
        )}
      </section>
    </>
  );
}
