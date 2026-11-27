import { useState } from "react";
import { BarChart3 } from "lucide-react";
import PillTrack from "@/components/PillTrack";
import PartnerReport, { type ReportTarget } from "@/components/ads/PartnerReport";
import { DateField } from "@/components/ui/date-field";
import { WModal } from "./AdsWebShared";
import { ctr, nf, placeLabel, type AdStats, type Bookmaker, type Promo } from "@/lib/adsModel";
import { screenOf, shortDay } from "@/lib/bannersModel";
import type { Banner } from "@/types";

export type SRange = { days: number } | { from: string; to: string };
export type SRow = { key: string; name: string; where: string; kind: string; impressions: number; clicks: number; target: ReportTarget | null };
const DOT: Record<string, string> = { banner: "#6d4bf0", telegram: "#2aa6df", bookmaker: "#e5484d" };

/** Rows of «За місцями й партнерами»: one per placement, named from the loaded lists. */
export function statRows(stats: AdStats | null, banners: Banner[], bms: Bookmaker[], promos: Promo[]): SRow[] {
  return (stats?.rows || []).map((r) => {
    const [kind, a, b] = r.placement.split(":");
    let name = r.entityId || r.placement, where = r.placement, target: ReportTarget | null = null;
    if (kind === "banner") { const bn = banners.find((x) => x.id === r.entityId); name = `Слот ${b || bn?.slot || "?"} · ${bn?.title || `банер №${r.entityId}`}`; where = `Банер · ${screenOf(a).label}`; }
    else if (kind === "bookmaker") { const bm = bms.find((x) => x.id === r.entityId); name = bm?.name || `Букмекер №${r.entityId}`; where = `Букмекер · ${a === "list" ? "список матчів" : "деталі матчу"}`; if (bm) target = { kind: "bookmaker", b: bm }; }
    else if (kind === "telegram") { const p = promos.find((x) => x.id === r.entityId); name = p?.name || `Група №${r.entityId}`; where = p ? placeLabel(p) : "Telegram"; if (p) target = { kind: "telegram", p }; }
    return { key: `${r.placement}|${r.entityId}`, name, where, kind, impressions: r.impressions, clicks: r.clicks, target };
  }).sort((x, y) => y.clicks - x.clicks);
}

export default function StatsWeb({ stats, error, range, setRange, rows }: { stats: AdStats | null; error: string; range: SRange; setRange: (r: SRange) => void; rows: SRow[] }) {
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [pick, setPick] = useState(false);
  const [draft, setDraft] = useState({ from: "", to: "" });
  const [report, setReport] = useState<ReportTarget | null>(null);
  const key = "days" in range ? String(range.days) : "custom";
  const daily = stats?.daily || [];
  const max = Math.max(1, ...daily.map((d) => d.clicks));
  const peak = daily.reduce((m, d, i) => (d.clicks > (daily[m]?.clicks ?? -1) ? i : m), 0);
  const empty = !!stats && !stats.totals.impressions && !stats.totals.clicks;
  const many = daily.length > 16;

  return (
    <>
      <section className="v3-adw-card v3-adw-chart">
        <div className="v3-adw-chart-h">
          <div><h2>Кліки по днях</h2><p>Усі місця разом · дні за Києвом</p></div>
          <div className="v3-adw-seg" role="group" aria-label="Період">
            <PillTrack active={key} />
            {[7, 14, 30].map((d) => <button key={d} type="button" className={key === String(d) ? "is-on" : ""} aria-pressed={key === String(d)} onClick={() => setRange({ days: d })}>{d} днів</button>)}
            <button type="button" className={key === "custom" ? "is-on" : ""} aria-pressed={key === "custom"} aria-haspopup="dialog" onClick={() => { setDraft(custom); setPick(true); }}>{key === "custom" && custom.from && custom.to ? `${shortDay(custom.from)} — ${shortDay(custom.to)}` : "Свій"}</button>
          </div>
        </div>
        {error ? <div className="v3-uw-empty is-err" role="alert"><span>!</span><strong>Не вдалося завантажити статистику</strong><p>{error}</p></div>
          : !stats ? <div className="v3-adw-bars is-load" aria-busy="true">{Array.from({ length: 14 }, (_, i) => <span key={i}><i style={{ height: `${30 + ((i * 37) % 60)}%` }} /></span>)}</div>
          : empty ? <div className="v3-uw-empty"><span><BarChart3 size={18} /></span><strong>Статистики за цей період немає</strong><p>Покази й кліки з’являться після перших показів реклами.</p></div>
          : <>
            <div className={`v3-adw-bars${many ? " is-many" : ""}`} role="img" aria-label={`Кліки по днях: ${daily.map((d) => `${shortDay(d.day)} — ${d.clicks}`).join(", ")}`}>
              {daily.map((d, i) => <span key={d.day} title={`${shortDay(d.day)} · ${nf(d.clicks)} кліків · ${nf(d.impressions)} показів`}>{!many && <b className={i === peak ? "is-peak" : ""}>{nf(d.clicks)}</b>}<i className={i === peak ? "is-peak" : ""} style={{ height: `${Math.max(3, (d.clicks / max) * 100)}%`, animationDelay: `${i * 25}ms` }} /></span>)}
            </div>
            {daily.length > 0 && <div className="v3-adw-bars-x"><span>{shortDay(daily[0].day)}</span><span>{shortDay(daily[Math.floor(daily.length / 2)].day)}</span><span>{shortDay(daily[daily.length - 1].day)}</span></div>}
          </>}
      </section>

      {!empty && !error && stats && rows.length > 0 && (
        <section className="v3-adw-card v3-adw-places-t">
          <h2>За місцями й партнерами <small>Для рахунку партнеру — «Звіт для партнера» в рядку</small></h2>
          <div className="v3-adw-tr v3-adw-stcols is-th"><span>Місце або партнер</span><span className="is-r">Покази</span><span className="is-r">Кліки</span><span className="is-r">CTR</span><span /></div>
          {rows.map((r, i) => (
            <div key={r.key} className="v3-adw-tr v3-adw-stcols" style={{ animationDelay: `${i * 30}ms` }}>
              <span className="v3-adw-place-n"><i style={{ background: DOT[r.kind] || "#8a93a2" }} aria-hidden="true" /><span><strong>{r.name}</strong><small>{r.where}</small></span></span>
              <span className="is-r is-num">{nf(r.impressions)}</span>
              <span className="is-r is-num"><b>{nf(r.clicks)}</b></span>
              <span className="is-r is-num">{ctr(r.clicks, r.impressions)}</span>
              <span className="is-r">{r.target && <button type="button" className="v3-uwb" onClick={() => setReport(r.target)}>Звіт для партнера</button>}</span>
            </div>
          ))}
        </section>
      )}
      <WModal open={pick} onClose={() => setPick(false)} width={420} title="Свій період" sub="Дні за Києвом, обидві дати включно">
        <div className="v3-adwm-row">
          <div className="v3-uwm-f"><label id="sw-from-l">Від</label><DateField id="sw-from" labelledBy="sw-from-l" value={draft.from} onChange={(v) => setDraft((d) => ({ ...d, from: v }))} /></div>
          <div className="v3-uwm-f"><label id="sw-to-l">До</label><DateField id="sw-to" labelledBy="sw-to-l" value={draft.to} min={draft.from || undefined} onChange={(v) => setDraft((d) => ({ ...d, to: v }))} /></div>
        </div>
        {draft.from && draft.to && draft.from > draft.to && <small className="v3-adw-err">«До» раніше за «Від»</small>}
        <div className="v3-uwm-foot"><span /><div><button type="button" className="v3-uwb" onClick={() => setPick(false)}>Скасувати</button><button type="button" className="v3-uwb is-green" disabled={!draft.from || !draft.to || draft.from > draft.to} onClick={() => { setCustom(draft); setRange(draft); setPick(false); }}>Показати</button></div></div>
      </WModal>
      <PartnerReport target={report} onClose={() => setReport(null)} />
    </>
  );
}
