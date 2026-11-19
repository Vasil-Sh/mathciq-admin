// Records real backend answers for the screen tests (e2e/fixtures/api.json).
// Run against a local stack: backend on :3001 with seed data, admin dev server on :5174 (VITE_API_URL=http://localhost:3001/api).
//   node e2e/tools/record.mjs <login> <password>
// The tests then replay these answers — no backend or database needed in CI.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const [login, password] = process.argv.slice(2);
if (!login || !password) { console.error("usage: node e2e/tools/record.mjs <login> <password>"); process.exit(1); }
const APP = process.env.APP_URL || "http://localhost:5174";
const out = {};
const skipped = new Set(["/auth/login", "/auth/refresh", "/auth/logout"]);

const browser = await chromium.launch();
async function session(viewport, isMobile) {
  const ctx = await browser.newContext({ viewport, isMobile, hasTouch: isMobile, extraHTTPHeaders: { "X-Forwarded-For": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  // The backend allows 100 requests/min per IP — give every recorded request its own address
  await ctx.route("**/api/**", (route) => route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } }));
  const page = await ctx.newPage();
  page.on("response", async (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/")) return;
    const path = u.pathname.slice(4);
    const key = `${r.request().method()} ${path}`;
    if (skipped.has(path) || out[key] || r.request().method() !== "GET" || r.status() !== 200) return;
    try { out[key] = { status: r.status(), body: await r.json() }; } catch { /* not json */ }
  });
  await page.goto(`${APP}/login`);
  await page.fill("#login-username", login);
  await page.fill("#login-password", password);
  await page.click("button[type=submit]");
  await page.waitForURL(/dashboard/);
  const go = async (p) => { await page.goto(APP + p); await page.waitForTimeout(2200); };
  const tap = async (sel) => { const l = page.locator(sel).first(); if (await l.count()) { await l.click().catch(() => {}); await page.waitForTimeout(1200); } };
  await go("/dashboard");
  await go("/users"); await page.locator(".v3-urow").first().click({ force: true }).catch(() => {}); await page.waitForTimeout(1200); await tap('button:has-text("Самообмеження")');
  await go("/payments"); await tap(".v3-pay-row"); await go("/payments?tab=ref"); await go("/payments?tab=promo");
  await go("/bets"); await tap(isMobile ? ".v3-bt-mcard" : ".v3-bt-tr"); await tap(".v3-bt-allbtn:visible");
  await go("/audit"); await go("/audit?userId=3&username=Gerrry");
  await ctx.close();
}
await session({ width: 1440, height: 900 }, false);
await session({ width: 390, height: 844 }, true);
await browser.close();

const fixture = { recordedAt: new Date().toISOString(), responses: out };
writeFileSync(new URL("../fixtures/api.json", import.meta.url), JSON.stringify(fixture, null, 1) + "\n");
console.log(`recorded ${Object.keys(out).length} answers:\n  ${Object.keys(out).sort().join("\n  ")}`);
