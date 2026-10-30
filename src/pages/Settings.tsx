import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, Settings2, Save, CircleDollarSign, CalendarRange, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { fetchSettings, updateSettings } from "@/lib/adminSettingsApi";

export default function Settings() {
  const [priceText, setPriceText] = useState("");
  const [daysText, setDaysText] = useState("30");
  const [specText, setSpecText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSettings()
      .then((s) => {
        setPriceText(s.defaultMonthlyPrice ? String(s.defaultMonthlyPrice) : "");
        setDaysText(String(s.subscriptionDays ?? 30));
        setSpecText(s.bannerSpecText ?? "");
      })
      .catch((e) => setError((e as Error).message || "Не вдалося завантажити налаштування"))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const price = parseFloat(priceText.replace(",", "."));
      const days = parseInt(daysText, 10);
      const updated = await updateSettings({
        defaultMonthlyPrice: Number.isFinite(price) && price >= 0 ? price : 0,
        subscriptionDays: Number.isInteger(days) && days >= 1 ? days : 30,
        bannerSpecText: specText,
      });
      setPriceText(updated.defaultMonthlyPrice ? String(updated.defaultMonthlyPrice) : "");
      setDaysText(String(updated.subscriptionDays));
      setSpecText(updated.bannerSpecText);
      toast.success("Налаштування збережено");
    } catch (e) {
      setError((e as Error).message || "Не вдалося зберегти");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container flex items-center justify-center py-24 text-muted">
        <Loader2 className="animate-spin mr-2" size={20} />
        Завантаження налаштувань…
      </div>
    );
  }

  return (
    <div className="page-container">
      <p className="page-eyebrow">ПАНЕЛЬ КЕРУВАННЯ</p>
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="page-title">Налаштування</h1>
          <p className="page-subtitle">
            Тарифи, тривалість підписок і текст для рекламодавців.
          </p>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          Зберегти
        </Button>
      </div>

      {error && (
        <Alert className="mt-6 border-red-200 bg-danger-bg">
          <AlertTriangle size={16} className="text-danger shrink-0" />
          <AlertDescription className="text-danger">{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CircleDollarSign size={20} />
              </span>
              <div>
                <h2 className="text-base font-semibold text-ink">Тариф за замовчуванням</h2>
                <p className="text-sm text-muted">Підставляється під час створення користувача.</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settings-price">Вартість на місяць (грн)</Label>
              <Input
                id="settings-price"
                inputMode="decimal"
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settings-days">Тривалість підписки (днів)</Label>
              <Input
                id="settings-days"
                inputMode="numeric"
                value={daysText}
                onChange={(e) => setDaysText(e.target.value)}
                placeholder="30"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Megaphone size={20} />
              </span>
              <div>
                <h2 className="text-base font-semibold text-ink">Текст для рекламодавців</h2>
                <p className="text-sm text-muted">Копіюється на сторінці «Банери».</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settings-spec">Вимоги до банера</Label>
              <textarea
                id="settings-spec"
                value={specText}
                onChange={(e) => setSpecText(e.target.value)}
                rows={10}
                className="w-full rounded-lg border border-hairline bg-white p-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Вимоги до рекламного банера MatchIQ…"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-muted">
        <Settings2 size={14} />
        Зміни зберігаються глобально для всіх адміністраторів.
      </div>
    </div>
  );
}
