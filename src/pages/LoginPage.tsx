import TopoBackground from "@/components/kokonutui/topo-background";
import { useEffect, useRef, useState } from "react";
import { BarChart3, Check, Lock, LogIn, MonitorSmartphone, ShieldCheck, WifiOff } from "lucide-react";
import { useLogin } from "@/hooks/useLogin";

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

const ROTATING = ["підписками", "рекламою", "матчами"];

/** «Керуйте підписками / рекламою / матчами» — слово змінюється з підйомом. */
function RotatingWord() {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setI((v) => (v + 1) % ROTATING.length), 2400);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="v3-rot-word" aria-live="off">
      <span key={i} className="v3-rot-word-in">{ROTATING[i]}</span>
    </span>
  );
}

export default function LoginPage() {
  const { username, setUsername, password, setPassword, isLoading, error, errorKind, handleSubmit, notAdmin, resetNotAdmin, locked, lockLeft } = useLogin();
  const mmss = `${Math.floor(lockLeft / 60)}:${String(lockLeft % 60).padStart(2, "0")}`;
  const emptyUser = errorKind === "empty" && !username.trim();
  const emptyPass = errorKind === "empty" && !password.trim();
  const [sessionEnded] = useState(() => sessionStorage.getItem("sessionEnded") === "1");
  const [revokedAt] = useState(() => Number(sessionStorage.getItem("sessionsRevokedAt") || 0) || null);
  const appUrl = import.meta.env.VITE_APP_URL as string | undefined;
  const [showPassword, setShowPassword] = useState(false);
  const online = useOnline();

  // Хитання полів і кнопки: лічильник перезапускає анімацію (чергуємо дві однакові keyframes).
  const [shake, setShake] = useState(0);
  useEffect(() => { if (error) setShake((v) => v + 1); }, [error, errorKind]);
  const shakeCls = shake ? (shake % 2 ? " v3-shake-a" : " v3-shake-b") : "";

  // Неактивна кнопка (без зв'язку / пауза) не мовчить: хитається й пояснює чому.
  const [nudge, setNudge] = useState(0);
  const [tip, setTip] = useState(false);
  const tipTimer = useRef<number | undefined>(undefined);
  const blocked = !online || locked;
  const onSubmitClick = (e: React.MouseEvent) => {
    if (!blocked) return;
    e.preventDefault();
    setNudge((v) => v + 1);
    setTip(true);
    window.clearTimeout(tipTimer.current);
    tipTimer.current = window.setTimeout(() => setTip(false), 2200);
  };
  useEffect(() => () => window.clearTimeout(tipTimer.current), []);

  // Зв'язок повернувся — плашка на 3 с зеленіє.
  const wasOffline = useRef(!online);
  const [backOnline, setBackOnline] = useState(false);
  useEffect(() => {
    if (!online) { wasOffline.current = true; setBackOnline(false); return; }
    if (wasOffline.current) {
      wasOffline.current = false;
      setBackOnline(true);
      const id = window.setTimeout(() => setBackOnline(false), 3000);
      return () => window.clearTimeout(id);
    }
  }, [online]);

  // Пауза після спроб: смужка в кнопці тане від повної до нуля.
  const lockTotal = useRef(0);
  if (locked && lockLeft > lockTotal.current) lockTotal.current = lockLeft;
  if (!locked) lockTotal.current = 0;
  const lockPct = locked && lockTotal.current ? (lockLeft / lockTotal.current) * 100 : 0;

  return (
    <main className="v3-login">
      <TopoBackground className="v3-login-topo" seed={26} interval={0.07} speed={0.6} />
      <div className="v3-login-grid">
        <section className="v3-login-story" aria-labelledby="v3-login-story-title">
          <div className="v3-logo v3-logo-static">
            <span className="v3-logo-mark"><BarChart3 size={18} strokeWidth={2.4} aria-hidden="true" /></span>
            <span className="v3-logo-name">MatchIQ</span>
            <span className="v3-logo-badge">Admin</span>
          </div>
          <div>
            <h1 id="v3-login-story-title">Уся платформа.<br />Один робочий простір.</h1>
            <p>Керуйте <RotatingWord /> — дані, доступи та контент поруч.</p>
          </div>
          <ul className="v3-login-tiles">
            <li><strong>Користувачі та підписки</strong><span>Акаунти й доступ до MatchIQ</span></li>
            <li><strong>Показники та записи</strong><span>Аналітика платформи й ставки</span></li>
            <li className="is-blue"><strong>Контент застосунку</strong><span>Реклама, матчі й підтримка</span></li>
          </ul>
        </section>

        {notAdmin ? (
        <section className="v3-login-form" aria-labelledby="v3-login-title">
          <div>
            <p className="v3-login-eyebrow">Вхід адміністратора</p>
            <h2 id="v3-login-title">Це акаунт користувача</h2>
            <p className="v3-login-lead"><b>@{notAdmin}</b> — акаунт користувача. Адмінка доступна лише овнеру й адміністраторам.</p>
          </div>
          <div className="v3-login-alt">
            {appUrl && <a href={appUrl} className="v3-btn v3-btn-primary">Відкрити застосунок MatchIQ</a>}
            <button type="button" className="v3-btn v3-btn-ghost" onClick={resetNotAdmin}><LogIn size={16} aria-hidden="true" />Увійти іншим акаунтом</button>
          </div>
        </section>
        ) : (
        <section className="v3-login-form" aria-labelledby="v3-login-title">
          <div>
            <p className="v3-login-eyebrow">Вхід адміністратора</p>
            <h2 id="v3-login-title">З поверненням.</h2>
            <p className="v3-login-lead">Увійдіть, щоб керувати користувачами, підписками та даними MatchIQ.</p>
          </div>

          {sessionEnded && online && <p className="v3-login-banner v3-login-banner-blue" role="status"><MonitorSmartphone size={16} aria-hidden="true" className="v3-bob" />{revokedAt ? `Вас вийшло з усіх пристроїв (Налаштування → Сесії, ${new Date(revokedAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}). Увійдіть знову.` : "Сесія завершилась. Увійдіть знову — повернемо вас на ту саму сторінку."}</p>}
          {locked && <p className="v3-login-banner v3-login-banner-red" role="alert"><Lock size={16} aria-hidden="true" className="v3-lock-wiggle" />Забагато невдалих спроб входу.</p>}
          {!online && <p className="v3-login-banner" role="status"><WifiOff size={16} aria-hidden="true" />Немає інтернету. Кнопка запрацює, щойно зв’язок повернеться.</p>}
          {online && backOnline && <p className="v3-login-banner v3-login-banner-green" role="status"><Check size={16} aria-hidden="true" className="v3-login-pop" />З’єднання відновлено — можна входити.</p>}

          <form onSubmit={(e) => { if (blocked) { e.preventDefault(); onSubmitClick(e as unknown as React.MouseEvent); return; } handleSubmit(e); }} aria-label="Вхід адміністратора" aria-busy={isLoading} noValidate>
            <div className="v3-field">
              <label htmlFor="login-username">Логін</label>
              <input id="login-username" name="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="Логін без @" disabled={locked} aria-invalid={emptyUser || errorKind === "auth"} className={emptyUser || errorKind === "auth" ? shakeCls.trim() : undefined} />
            </div>
            <div className="v3-field">
              <label htmlFor="login-password">Пароль</label>
              <div className={"v3-input-wrap" + (emptyPass || errorKind === "auth" ? shakeCls : "")}>
                <input id="login-password" name="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Введіть пароль" disabled={locked} aria-invalid={emptyPass || errorKind === "auth"} aria-describedby={error ? "login-error" : undefined} />
                <button type="button" className="v3-input-action" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword}>{showPassword ? "Сховати" : "Показати"}</button>
              </div>
              {error && errorKind !== "empty" && !locked && <p id="login-error" role="alert" className="v3-field-error">{error}</p>}
            </div>
            <div className="v3-login-submit-wrap">
              {tip && blocked && <span className="v3-login-tip" role="status">{locked ? `Вхід на паузі — ще ${mmss}` : "Немає інтернету — зачекайте"}</span>}
              <button type="submit" disabled={isLoading} aria-disabled={blocked || undefined} onClick={onSubmitClick} className={"v3-btn v3-btn-primary v3-login-submit" + (blocked ? " is-blocked" : "") + (nudge ? (nudge % 2 ? " v3-shake-a" : " v3-shake-b") : "")}>
                {locked && <span className="v3-login-drain" style={{ width: `${lockPct}%` }} aria-hidden="true" />}
                {isLoading && <span className="v3-login-prog" aria-hidden="true" />}
                <span className="v3-login-submit-label">
                  {locked ? <><Lock size={15} aria-hidden="true" />Спробуйте через {mmss}</> : isLoading ? <><span className="v3-spin" aria-hidden="true" />Входимо…</> : <>Увійти до робочого простору <span className="v3-login-arrow" aria-hidden="true">→</span></>}
                </span>
              </button>
            </div>
            {errorKind === "empty" && error && <p id="login-error" role="alert" className="v3-field-error v3-center">{error}</p>}
            {locked && <p className="v3-login-hint">Вхід заблоковано на 5 хв після 5 невдалих спроб. Овнер бачить це в журналі дій.</p>}
          </form>

          <p className="v3-login-security"><ShieldCheck size={16} aria-hidden="true" />Лише для авторизованих адміністраторів</p>
        </section>
        )}
      </div>
    </main>
  );
}
