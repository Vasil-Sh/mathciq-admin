export function telegramUsername(raw:string|null|undefined):string {
 let value=String(raw??'').trim(); // API may send digit-only handles as numbers
 if(/^(https?:\/\/)?(www\.)?(t\.me|telegram\.me)\//i.test(value)) {
   try {const url=new URL(/^https?:/i.test(value)?value:`https://${value}`);value=url.pathname.replace(/^\//,'').replace(/\/$/,'');} catch {return '';}
 }
 value=value.replace(/^@/,'');
 return /^[a-zA-Z0-9_]{5,32}$/.test(value)?value:'';
}

/**
 * Open a Telegram chat.
 * On a phone, go straight to the Telegram app (tg://) so the admin app is not left on a blank t.me page in an in-app browser;
 * if Telegram is not installed (the page is still visible after a moment), fall back to the web link.
 * On a computer, open t.me in a new tab as before.
 */
export function openTelegram(handle: string) {
  const h = telegramUsername(handle) || String(handle || "").trim().replace(/^@/, "");
  if (!h) return;
  const web = `https://t.me/${encodeURIComponent(h)}`;
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (!touch) { window.open(web, "_blank", "noopener"); return; }
  let left = false;
  const onHide = () => { if (document.visibilityState === "hidden") left = true; };
  document.addEventListener("visibilitychange", onHide);
  window.location.href = `tg://resolve?domain=${encodeURIComponent(h)}`;
  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onHide);
    if (!left && document.visibilityState === "visible") window.open(web, "_blank", "noopener");
  }, 1200);
}
