import { useState } from "react";
import { Monitor, Smartphone, ImageOff } from "lucide-react";

export default function BannerPreview({ src }: { src: string }) {
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return <section className="banner-device-preview" aria-label="Попередній перегляд банера">
    <div className="banner-preview-controls" role="group" aria-label="Пристрій для перегляду">
      <button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}><Monitor size={16} />Комп’ютер</button>
      <button type="button" aria-pressed={device === "phone"} onClick={() => setDevice("phone")}><Smartphone size={16} />Телефон</button>
    </div>
    <p>{device === "desktop" ? "Ширина 1100 px · прокручуйте горизонтально, щоб оглянути весь банер." : "Ширина 375 px · перевірте читабельність тексту на телефоні."}</p>
    <div className="banner-preview-scroll" tabIndex={0} role="region" aria-label="Прев’ю з горизонтальним прокручуванням">
      <div className={`banner-preview-device is-${device}`}>
        <div className="banner-preview-context" aria-hidden="true"><span /> <span /></div>
        {failedSrc === src ? <div className="banner-preview-error" role="status"><ImageOff size={20} />Не вдалося завантажити зображення. Перевірте URL.</div> : <img key={src} src={src} alt="Попередній перегляд банера" onError={() => setFailedSrc(src)} />}
        <div className="banner-preview-context" aria-hidden="true"><span /> <span /></div>
      </div>
    </div>
  </section>;
}
