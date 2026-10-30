import { useCallback, useEffect, useRef, useState } from "react";
import BannerPreview from "@/components/BannerPreview";
import {
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Image as ImageIcon,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  uploadBannerImage,
  fetchBannerSlots,
  updateBannerSlot,
} from "@/lib/adminBannersApi";
import type { Banner, BannerInput, BannerSlotState } from "@/types";

const EMPTY_FORM: BannerInput = {
  active: false,
  screen: "matches", startsOn: null, endsOn: null,
  slot: 1,
  title: "",
  description: "",
  imageUrl: "",
  href: "",
};

const BANNER_SCREENS = [
  { id: "matches", label: "Матчі" },
  { id: "journal", label: "Журнал ставок" },
  { id: "analytics", label: "Аналітика" },
  { id: "strategies", label: "Стратегії" },
  { id: "risky-teams", label: "Ризиковані команди" },
] as const;

function campaignStatus(banner: Banner) {
 const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 if (!banner.active) return 'Вимкнено';
 if (banner.endsOn && banner.endsOn < today) return 'Завершено';
 if (banner.startsOn && banner.startsOn > today) return 'Заплановано';
 return 'Показується';
}
export default function Banners() {
  const [screen, setScreen] = useState<string>("matches");
  const screenLabel = BANNER_SCREENS.find((item) => item.id === screen)?.label;
  const [banners, setBanners] = useState<Banner[]>([]);
  const [slots, setSlots] = useState<BannerSlotState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [form, setForm] = useState<BannerInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Banner | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Оберіть файл зображення");
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      toast.error("Зображення має бути до 1,5 МБ");
      return;
    }
    setUploading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("read error"));
        reader.readAsDataURL(file);
      });
      const url = await uploadBannerImage(data, file.type);
      setForm((prev) => ({ ...prev, imageUrl: url }));
      toast.success("Зображення завантажено");
    } catch (e) {
      toast.error((e as Error).message || "Помилка завантаження");
    } finally {
      setUploading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [data, slotData] = await Promise.all([
        fetchBanners(),
        fetchBannerSlots(),
      ]);
      setBanners(data);
      setSlots(slotData);
    } catch (e) {
      setError((e as Error).message || "Не вдалося завантажити банери");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = (slot = 1) => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, slot, screen });
    setFormOpen(true);
  };

  const openEdit = (banner: Banner) => {
    setEditing(banner);
    setForm({
      active: banner.active,
      screen: banner.screen || "matches", startsOn: banner.startsOn || null, endsOn: banner.endsOn || null,
      slot: banner.slot ?? 1,
      title: banner.title,
      description: banner.description || "",
      imageUrl: banner.imageUrl || "",
      href: banner.href || "",
    });
    setFormOpen(true);
  };

  const submit = async () => {
    if (!form.title.trim()) {
      toast.error("Вкажіть назву банера");
      return;
    }
    if (form.startsOn && form.endsOn && form.startsOn > form.endsOn) { toast.error("Завершення не може бути раніше початку"); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateBanner(editing.id, form);
        toast.success("Банер оновлено");
      } else {
        await createBanner(form);
        toast.success("Банер створено");
      }
      setFormOpen(false);
      await load();
    } catch (e) {
      toast.error((e as Error).message || "Помилка збереження");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    try {
      await deleteBanner(deleting.id);
      toast.success("Банер видалено");
      setDeleting(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message || "Помилка видалення");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (banner: Banner) => {
    try {
      await updateBanner(banner.id, { active: !banner.active });
      setBanners((prev) =>
        prev.map((b) =>
          b.id === banner.id ? { ...b, active: !banner.active } : b
        )
      );
    } catch (e) {
      toast.error((e as Error).message || "Помилка оновлення");
    }
  };

  const togglePlaceholder = async (slot: number) => {
    const current =
      slots.find((s) => s.slot === slot)?.placeholderEnabled ?? false;
    try {
      const updated = await updateBannerSlot(slot, !current);
      setSlots((prev) => {
        const rest = prev.filter((s) => s.slot !== slot);
        return [...rest, updated];
      });
    } catch (e) {
      toast.error((e as Error).message || "Помилка оновлення");
    }
  };

  return (
    <div className="page-container admin-banners-screen">
      <div className="admin-page-hero">
        <div>
          <p className="page-eyebrow">КОНТЕНТ ЗАСТОСУНКУ</p><h1 className="page-title">Банери</h1>
          <p className="page-subtitle">
            Рекламні розміщення за екранами застосунку.
          </p>
        </div>
        <Button onClick={() => openCreate()}>
          <Plus size={16} /> Додати банер
        </Button>
      </div>

      <section className="admin-banner-screens" aria-label="Екрани показу банерів">
        <div className="admin-banner-screen-tabs" role="group" aria-label="Оберіть екран">
          {BANNER_SCREENS.map((item) => <button key={item.id} type="button" aria-pressed={screen === item.id} onClick={() => setScreen(item.id)}>
            <span>{item.label}</span>
          </button>)}
        </div>

      </section>

      {error && (
        <Alert className="mt-6 border-red-200 bg-danger-bg">
          <AlertTriangle size={16} className="text-danger shrink-0" />
          <AlertDescription className="text-danger">{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24 text-muted">
          <Loader2 className="animate-spin mr-2" size={20} />
          Завантаження банерів…
        </div>
      ) : banners.filter((b) => (b.screen || "matches") === screen).length === 0 ? (
        <Card className="mt-6">
          <CardContent className="py-20 text-center">
            <Megaphone
              size={40}
              className="mx-auto mb-4 text-subtle"
              strokeWidth={1.2}
            />
            <p className="text-body font-medium">Банерів ще немає</p>
            <p className="text-sm text-muted mt-1">
              Додайте перший банер для екрана «{screenLabel}».
            </p>
            <Button className="mt-5" onClick={() => openCreate()}>
              <Plus size={16} /> Додати банер
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="admin-banner-grid">
          {[1, 2].flatMap<{slot:number;banner:Banner | undefined}>(slot => {
            const items = banners.filter(b => (b.screen || "matches") === screen && (b.slot ?? 1) === slot);
            return items.length ? items.map(banner => ({slot,banner})) : [{slot,banner:undefined}];
          }).map(({slot,banner}) => {
            const slotLabel = slot === 1 ? "Слот 1 · верхній" : "Слот 2 · нижній";
            const placeholderEnabled =
              slots.find((s) => s.slot === slot)?.placeholderEnabled ?? false;
            if (!banner) {
              return (
                <Card key={slot} className="admin-banner-slot admin-banner-slot-empty">
                  <div className="admin-banner-slot-header">
                    <span className="text-sm font-semibold text-ink">
                      {slotLabel}
                    </span>
                    <Badge variant="default">Порожній</Badge>
                  </div>
                  <CardContent className="flex min-h-[180px] flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                    <Megaphone
                      size={32}
                      className="text-subtle"
                      strokeWidth={1.2}
                    />
                    <p className="text-sm text-muted">
                      У цьому слоті немає банера.
                    </p>
                    <Button size="sm" onClick={() => openCreate(slot)}>
                      <Plus size={14} /> Додати банер
                    </Button>
                  </CardContent>
                  <div className="flex items-center gap-2 border-t border-hairline px-5 py-4">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={placeholderEnabled}
                      disabled={screen !== "matches"} onClick={() => togglePlaceholder(slot)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                        placeholderEnabled ? "bg-primary" : "bg-hairline"
                      }`}
                      title={
                        placeholderEnabled
                          ? "Вимкнути плейсхолдер"
                          : "Увімкнути плейсхолдер"
                      }
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          placeholderEnabled ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                    <span className="text-sm text-muted">
                      {screen !== "matches" ? "Без плейсхолдера" : placeholderEnabled ? "Плейсхолдер увімкнено" : "Плейсхолдер вимкнено"}
                    </span>
                  </div>
                </Card>
              );
            }
            return (
              <Card key={banner.id} className="admin-banner-slot">
                <div className="admin-banner-slot-header">
                  <span className="text-sm font-semibold text-ink">
                    {slotLabel}
                  </span>
                  <Badge variant={campaignStatus(banner) === "Показується" ? "active" : "default"}>
                    {campaignStatus(banner)}
                  </Badge>
                </div>
                <div className="admin-banner-preview">
                  {banner.imageUrl ? (
                    <img
                      src={banner.imageUrl}
                      alt={banner.title}
                      className="admin-banner-image"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display =
                          "none";
                      }}
                    />
                  ) : (
                    <ImageIcon
                      size={36}
                      className="text-subtle"
                      strokeWidth={1.2}
                    />
                  )}
                </div>
                <CardContent className="p-5">
                  <h3 className="font-semibold text-ink leading-snug line-clamp-1">
                    {banner.title}
                  </h3>
                  <p className="text-sm text-muted mt-2">{banner.startsOn || "Без дати початку"} → {banner.endsOn || "Без завершення"}</p>
                  {banner.description && (
                    <p className="text-sm text-muted mt-1.5 line-clamp-2">
                      {banner.description}
                    </p>
                  )}
                  {banner.href && (
                    <a
                      href={banner.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary mt-3 hover:underline"
                    >
                      <ExternalLink size={12} /> Посилання
                    </a>
                  )}
                  <div className="mt-4 flex items-center gap-2 border-t border-hairline pt-4">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={banner.active}
                      onClick={() => toggleActive(banner)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                        banner.active ? "bg-primary" : "bg-hairline"
                      }`}
                      title={
                        banner.active ? "Вимкнути банер" : "Увімкнути банер"
                      }
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          banner.active ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                    <span className="text-sm text-muted">
                      {banner.active ? "Увімкнено" : "Вимкнено"}
                    </span>
                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(banner)}
                      >
                        <Pencil size={14} /> Редагувати
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-danger hover:text-danger"
                        onClick={() => setDeleting(banner)}
                      >
                        <Trash2 size={14} /> Видалити
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="banner-editor-dialog">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Редагувати банер" : "Новий банер"}
            </DialogTitle>
            <DialogDescription>
              Оберіть екран, слот і період показу. В одному слоті одночасно показується один банер.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 banner-editor-body">
            <div className="space-y-1.5"><Label htmlFor="banner-screen">Екран показу</Label><select id="banner-screen" className="w-full border rounded-xl p-3" value={form.screen || 'matches'} onChange={e => setForm({...form, screen:e.target.value})}>{BANNER_SCREENS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label htmlFor="banner-start">Початок показу</Label><Input id="banner-start" type="date" value={form.startsOn || ''} onChange={e => setForm({...form, startsOn:e.target.value || null})} /></div>
              <div><Label htmlFor="banner-end">Останній день показу</Label><Input id="banner-end" type="date" min={form.startsOn || undefined} value={form.endsOn || ''} onChange={e => setForm({...form, endsOn:e.target.value || null})} /></div>
            </div>
            <p className="text-xs text-muted">За часом Києва, включно з останнім днем. Без дат — без обмежень. Після завершення банер автоматично зникає з застосунку.</p>
            <div className="space-y-1.5">
              <Label htmlFor="banner-title">Назва</Label>
              <Input
                id="banner-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Наприклад: Ексклюзивний промокод"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Слот показу</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, slot: 1 })}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    form.slot === 1
                      ? "border-primary bg-primary/5"
                      : "border-hairline hover:border-primary/40"
                  }`}
                >
                  <span className="block text-sm font-semibold text-ink">
                    Слот 1 — верхній
                  </span>
                  <span className="block text-xs text-muted mt-1">
                    {form.screen === "matches" ? "Між «Зараз грають» і «Найближчі матчі»" : "Перед основним вмістом екрана"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, slot: 2 })}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    form.slot === 2
                      ? "border-primary bg-primary/5"
                      : "border-hairline hover:border-primary/40"
                  }`}
                >
                  <span className="block text-sm font-semibold text-ink">
                    Слот 2 — нижній
                  </span>
                  <span className="block text-xs text-muted mt-1">
                    {form.screen === "matches" ? "Перед «Завершені матчі»" : "Після основного вмісту екрана"}
                  </span>
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="banner-desc">Опис</Label>
              <Input
                id="banner-desc"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Короткий текст під заголовком"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="banner-image">Зображення</Label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFile(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-hairline hover:border-primary/50 bg-surface-subtle/40"
                }`}
              >
                {uploading ? (
                  <div className="flex items-center justify-center gap-2 text-muted">
                    <Loader2 className="animate-spin" size={18} />
                    Завантаження…
                  </div>
                ) : (
                  <>
                    <UploadCloud
                      size={28}
                      className="mx-auto text-subtle"
                      strokeWidth={1.4}
                    />
                    <p className="text-sm text-body mt-2 font-medium">
                      Перетягніть фото сюди або натисніть
                    </p>
                    <p className="text-xs text-muted mt-1">
                      PNG, JPG, WebP до 1,5 МБ
                    </p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = "";
                  }}
                />
              </div>
              <Input
                id="banner-image"
                value={form.imageUrl}
                onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                placeholder="…або вставте URL зображення"
              />
              {form.imageUrl && <BannerPreview src={form.imageUrl} />}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="banner-href">Посилання</Label>
              <Input
                id="banner-href"
                value={form.href}
                onChange={(e) => setForm({ ...form, href: e.target.value })}
                placeholder="https://…"
              />
            </div>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="h-4 w-4 rounded border-hairline accent-[#4278f5]"
              />
              <span className="text-sm text-ink">Увімкнути показ у вибраний період</span>
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFormOpen(false)}
              disabled={saving}
            >
              Скасувати
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving && <Loader2 className="animate-spin" size={14} />}
              {editing ? "Зберегти" : "Створити"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Видалити банер?</DialogTitle>
            <DialogDescription>
              Банер «{deleting?.title}» буде видалено назавжди.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={saving}
            >
              Скасувати
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={saving}
            >
              {saving && <Loader2 className="animate-spin" size={14} />}
              Видалити
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
