import { useCallback, useEffect, useRef, useState } from "react";
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
  Copy,
  Ruler,
  ChevronDown,
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
} from "@/lib/adminBannersApi";
import type { Banner, BannerInput } from "@/types";

const EMPTY_FORM: BannerInput = {
  active: false,
  title: "",
  description: "",
  imageUrl: "",
  href: "",
};

/** Текст-інструкція з вимогами до банера — для надсилання рекламодавцям. */
const BANNER_SPEC_TEXT = `Вимоги до рекламного банера MatchIQ

• Формат: горизонтальний банер (широкий), співвідношення ≈ 11:1.
• Рекомендований розмір: 1600×140 px (або будь-яке ширше з тим самим співвідношенням).
• Мінімальна ширина: 1200 px.
• Формат файлу: PNG, JPG або WebP.
• Максимальний розмір файлу: 1 МБ.

Важливо:
• Банер показується на всю ширину стрічки матчів і масштабується за висотою (≈112 px).
• Не розміщуйте важливий текст або логотип ближче ніж 20 px до країв — вони можуть обрізатись або виглядати стиснуто.
• Використовуйте великий контрастний текст, оскільки банер може зменшуватись на мобільних пристроях.
• Віддавайте перевагу світлому або нейтральному фону — він краще вписується у світлий інтерфейс розкладу.`;

export default function Banners() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [form, setForm] = useState<BannerInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Banner | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Оберіть файл зображення");
      return;
    }
    if (file.size > 1024 * 1024) {
      toast.error("Зображення має бути до 1 МБ");
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
      const data = await fetchBanners();
      setBanners(data);
    } catch (e) {
      setError((e as Error).message || "Не вдалося завантажити банери");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (banner: Banner) => {
    setEditing(banner);
    setForm({
      active: banner.active,
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

  return (
    <div className="page-container">
      <p className="page-eyebrow">РОЗКЛАД МАТЧІВ</p>
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="page-title">Банери</h1>
          <p className="page-subtitle">
            Рекламні банери, які показуються на екрані «Матчі» між секціями
            розкладу.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} /> Додати банер
        </Button>
      </div>

      {/* Інструкція з вимогами до розмірів банера */}
      <Card className="mt-6 border-primary/20">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <button
              type="button"
              className="flex items-center gap-3 text-left flex-1 min-w-0"
              onClick={() => setSpecOpen((o) => !o)}
              aria-expanded={specOpen}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                <Ruler size={20} />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-semibold text-ink">
                  Вимоги до банера
                </span>
                <span className="block text-sm text-muted mt-0.5">
                  Скопіюйте цей текст і надішліть рекламодавцю.
                </span>
              </span>
              <ChevronDown
                size={18}
                className={`ml-auto text-muted transition-transform shrink-0 ${specOpen ? "rotate-180" : ""}`}
              />
            </button>
            {specOpen && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard?.writeText(BANNER_SPEC_TEXT).then(
                    () => toast.success("Інструкцію скопійовано"),
                    () => toast.error("Не вдалося скопіювати"),
                  );
                }}
              >
                <Copy size={14} /> Скопіювати
              </Button>
            )}
          </div>
          {specOpen && (
            <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-surface-subtle border border-hairline p-4 text-[13px] leading-relaxed text-body font-sans">
              {BANNER_SPEC_TEXT}
            </pre>
          )}
        </CardContent>
      </Card>

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
      ) : banners.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="py-20 text-center">
            <Megaphone
              size={40}
              className="mx-auto mb-4 text-subtle"
              strokeWidth={1.2}
            />
            <p className="text-body font-medium">Банерів ще немає</p>
            <p className="text-sm text-muted mt-1">
              Додайте перший банер, щоб показувати його на екрані «Матчі».
            </p>
            <Button className="mt-5" onClick={openCreate}>
              <Plus size={16} /> Додати банер
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {banners.map((banner) => (
            <Card key={banner.id} className="overflow-hidden">
              <div className="h-32 bg-surface-subtle flex items-center justify-center border-b border-hairline relative">
                {banner.imageUrl ? (
                  <img
                    src={banner.imageUrl}
                    alt={banner.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                    }}
                  />
                ) : (
                  <ImageIcon size={36} className="text-subtle" strokeWidth={1.2} />
                )}
              </div>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-ink leading-snug line-clamp-1">
                      {banner.title}
                    </h3>
                    {banner.description && (
                      <p className="text-sm text-muted mt-1.5 line-clamp-2">
                        {banner.description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={banner.active}
                    onClick={() => toggleActive(banner)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                      banner.active ? "bg-primary" : "bg-hairline"
                    }`}
                    title={banner.active ? "Вимкнути банер" : "Увімкнути банер"}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        banner.active ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
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
                <div className="flex items-center gap-2 mt-5 pt-4 border-t border-hairline">
                  <Badge variant={banner.active ? "active" : "default"}>
                    {banner.active ? "Активний" : "Неактивний"}
                  </Badge>
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(banner)}
                    >
                      <Pencil size={14} /> Редагувати
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:text-danger"
                      onClick={() => setDeleting(banner)}
                    >
                      <Trash2 size={14} /> Видалити
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Редагувати банер" : "Новий банер"}
            </DialogTitle>
            <DialogDescription>
              Банер зʼявиться на екрані «Матчі», якщо він активний.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
                      PNG, JPG, WebP до 1 МБ
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
              {form.imageUrl && (
                <div className="mt-2 rounded-lg border border-hairline overflow-hidden bg-surface-subtle">
                  <img
                    src={form.imageUrl}
                    alt="Попередній перегляд банера"
                    className="w-full h-32 object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                    }}
                  />
                </div>
              )}
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
              <span className="text-sm text-ink">Показувати банер на екрані «Матчі»</span>
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
