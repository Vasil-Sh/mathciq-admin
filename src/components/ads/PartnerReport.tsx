import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import PillTrack from "@/components/PillTrack";
import { DateField } from "@/components/ui/date-field";
import { colorOf, ctr, dmy, fetchAdStats, initials, nf, type AdStats, type Bookmaker, type Promo } from "@/lib/adsModel";
import { shortDay } from "@/lib/bannersModel";
import { downloadCsv } from "@/lib/csv";

/** Phone sheet «Звіт для партнера» (design AdsMobileReport): period, three numbers, what to pay, copy / CSV. */
export type ReportTarget = { kind: "bookmaker"; b: Bookmaker } | { kind: "telegram"; p: Promo };
type Range = { days: number } | { from: string; to: string };

const plural = (n: number, a: string, b: string, c: string) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };

export default function PartnerReport({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const [range, setRange] = useState<Range>({ days: 14 });
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [stats, setStats] = useState<AdStats | null>(null);
  const [err, setErr] = useState("");
  const key = "days" in range ? String(range.days) : "custom";

  useEffect(() => {
    if (!target) return;
    let off = false; setStats(null); setErr("");
    fetchAdStats(range).then((s) => { if (!off) setStats(s); }).catch((e) => { if (!off) setErr((e as Error).message); });
    return () => { off = true; };
  }, [target, JSON.stringify(range)]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = target ? (target.kind === "bookmaker" ? target.b.name : target.p.name) : "";
  const id = target ? (target.kind === "bookmaker" ? target.b.id : target.p.id) : "";
  const prefix = target?.kind === "bookmaker" ? "bookmaker:" : "telegram:";
  const rows = (stats?.rows || []).filter((r) => r.placement.startsWith(prefix) && r.entityId === id);
  const imp = rows.reduce((a, r) => a + r.impressions, 0), clicks = rows.reduce((a, r) => a + r.clicks, 0);
  const where = [...new Set(rows.map((r) => { const a = r.placement.split(":")[1]; return a === "list" ? "список матчів" : a === "details" ? "деталі матчу" : a === "top" ? "верх списку" : a; }))];
  const price = target?.kind === "bookmaker" ? target.b.clickPrice : null;
  const terms = target?.kind === "telegram" ? target.p.priceNote : "";
  const due = price ? clicks * price : null;
  const period = stats ? `${shortDay(stats.from)} — ${shortDay(stats.to)}` : "…";
  const money = (n: number) => `${nf(Math.round(n * 100) / 100)} ₴`;
  const text = () => [`Звіт для партнера · ${name}`, `Період: ${stats ? `${dmy(stats.from)} — ${dmy(stats.to)}` : ""}`, `Покази: ${nf(imp)}`, `Кліки: ${nf(clicks)}`, `CTR: ${ctr(clicks, imp)}`,
    where.length ? `Місця: ${where.join(", ")}` : "", price ? `Ціна за клік: ${money(price)}` : terms ? `Умови оплати: ${terms}` : "", due != null ? `До сплати: ${money(due)}` : ""].filter(Boolean).join("\n");
  const copy = async () => { try { await navigator.clipboard.writeText(text()); toast.success("Звіт скопійовано", { description: `${name} · ${period}` }); } catch { toast.error("Не вдалося скопіювати"); } };
  const csv = () => {
    if (!stats) return;
    downloadCsv(`report-${name.replace(/\s+/g, "_")}-${stats.from}_${stats.to}.csv`, ["Партнер", "Місце", "Період", "Покази", "Кліки", "CTR", "Ціна за клік", "До сплати"],
      (rows.length ? rows : [{ placement: prefix, entityId: id, impressions: 0, clicks: 0 }]).map((r) => [name, r.placement, `${dmy(stats.from)} — ${dmy(stats.to)}`, r.impressions, r.clicks, ctr(r.clicks, r.impressions), price ?? terms ?? "", price ? Math.round(r.clicks * price * 100) / 100 : ""]));
    toast.success("Звіт готовий", { description: `${name} · ${period} · CSV` });
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="v3-sheet v3-pay-sheet v3-ad-rep">
        <div className="v3-ad-rep-h">
          <span className="v3-ad-rep-ic" style={{ background: colorOf(name || "?") }} aria-hidden="true">{initials(name || "?").slice(0, 2)}</span>
          <div><DialogTitle>Звіт для партнера</DialogTitle><DialogDescription>{name} · {period}</DialogDescription></div>
        </div>
        <span className="v3-ad-rep-l">Період</span>
        <div className="v3-ad-rep-seg" role="group" aria-label="Період"><PillTrack active={key} />
          {([["7", "7 днів"], ["14", "14 днів"], ["30", "30 днів"], ["custom", "Свій"]] as const).map(([k, l]) => <button key={k} type="button" className={key === k ? "is-on" : ""} aria-pressed={key === k} onClick={() => { if (k === "custom") { if (custom.from && custom.to) setRange({ ...custom }); else setRange({ from: "", to: "" }); } else setRange({ days: Number(k) }); }}>{l}</button>)}
        </div>
        {key === "custom" && <div className="v3-ad-rep-cf">
          <div className="v3-field"><label id="rep-from-l">Від</label><DateField id="rep-from" labelledBy="rep-from-l" value={custom.from} onChange={(v) => { const c = { ...custom, from: v }; setCustom(c); if (c.from && c.to) setRange(c); }} /></div>
          <div className="v3-field"><label id="rep-to-l">До</label><DateField id="rep-to" labelledBy="rep-to-l" value={custom.to} min={custom.from || undefined} onChange={(v) => { const c = { ...custom, to: v }; setCustom(c); if (c.from && c.to) setRange(c); }} /></div>
        </div>}
        {err ? <p className="v3-ad-rep-err" role="alert">Не вдалося порахувати: {err}</p> : <>
          <div className="v3-ad-rep-tiles" aria-busy={!stats}>
            <div><span>Покази</span><b>{stats ? nf(imp) : "…"}</b></div>
            <div><span>Кліки</span><b>{stats ? nf(clicks) : "…"}</b></div>
            <div><span>CTR</span><b>{stats ? ctr(clicks, imp) : "…"}</b></div>
          </div>
          <dl className="v3-ad-rep-dl">
            <div><dt>Місця</dt><dd>{where.length ? where.join(" · ") : "показів не було"}</dd></div>
            {target?.kind === "bookmaker" ? <div><dt>Ціна за клік</dt><dd>{price ? money(price) : "не вказана"}</dd></div> : <div><dt>Умови оплати</dt><dd>{terms || "не вказані"}</dd></div>}
            {due != null && <div className="is-due"><dt>До сплати</dt><dd>{stats ? money(due) : "…"}</dd></div>}
          </dl>
          <p className="v3-ad-rep-note">{price ? `${nf(clicks)} ${plural(clicks, "клік", "кліки", "кліків")} × ${money(price)}. Кліки рахуємо унікальні за добу.` : "Кліки рахуємо унікальні за добу."}</p>
        </>}
        <div className="v3-ad-rep-acts">
          <button type="button" className="is-grey" disabled={!stats} onClick={copy}>Копіювати</button>
          <button type="button" className="is-green" disabled={!stats} onClick={csv}><Download size={16} aria-hidden="true" />Завантажити CSV</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
