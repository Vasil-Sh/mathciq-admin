import { whenIdle } from "@/lib/apiClient";

/**
 * The launch screen (#mq-splash in index.html) stays until the first screen has its data:
 * the session check is done and no request is in flight for a short moment — so the app
 * opens with numbers, not with skeletons. Never longer than 8 s; at least 0.6 s, no flash.
 */
let done = false;
export function hideSplashWhenReady(): void {
  if (done) return;
  done = true;
  const el = document.getElementById("mq-splash");
  if (!el) return;
  const t0 = performance.now();
  const out = () => { el.classList.add("is-out"); window.setTimeout(() => el.remove(), 400); };
  const cap = window.setTimeout(out, 8000);
  const settle = async () => {
    // the screen is a lazy chunk: give it a moment to load and fire its first requests
    await new Promise((r) => window.setTimeout(r, 350));
    // wait for a quiet moment: idle now and still idle 250 ms later (pages often fire a second wave)
    for (let i = 0; i < 6; i++) {
      await whenIdle();
      await new Promise((r) => window.setTimeout(r, 250));
      if (await Promise.race([whenIdle().then(() => true), new Promise<boolean>((r) => window.setTimeout(() => r(false), 0))])) break;
    }
    const wait = Math.max(0, 600 - (performance.now() - t0));
    window.setTimeout(() => { window.clearTimeout(cap); out(); }, wait);
  };
  void settle();
}
