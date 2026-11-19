// Shared test setup: replays recorded backend answers, freezes the clock at the moment
// they were recorded, signs in as the owner, and fails a test on page errors or on
// requests the recording does not know (= the screen started calling something new).
import { test as base, expect, type Page } from "@playwright/test";
import fixture from "./fixtures/api.json" with { type: "json" };

type Rec = { status: number; body: unknown };
const responses = fixture.responses as Record<string, Rec>;
const norm = (p: string) => p.replace(/\/\d+(?=\/|$)/g, "/:id");
const byPattern = new Map<string, Rec>();
for (const [k, v] of Object.entries(responses)) { const n = norm(k); if (!byPattern.has(n)) byPattern.set(n, v); }

export const ME = (responses["GET /auth/me"].body as { username: string });

async function mockApi(page: Page, unknown: string[]) {
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, "");
    const key = `${req.method()} ${path}`;
    if (req.method() === "POST" && path === "/auth/login") {
      const { username } = JSON.parse(req.postData() || "{}");
      return route.fulfill({ json: username === ME.username
        ? { success: true, isAdmin: true, token: "test-token", refreshToken: "test-refresh", user: { isOwner: true } }
        : { success: false, error: "Невірний логін або пароль" } });
    }
    const hit = responses[key] || byPattern.get(norm(key));
    if (hit) return route.fulfill({ status: hit.status, json: hit.body });
    if (req.method() !== "GET") return route.fulfill({ json: { success: true } }); // writes: accept, nothing to persist
    unknown.push(key);
    return route.fulfill({ status: 404, json: { error: "not recorded" } });
  });
  // Telegram photos are not reachable in tests — avatars fall back to initials
  await page.route(/t\.me\//, (r) => r.abort());
}

export const test = base.extend<{ signedIn: boolean; guard: void }>({
  signedIn: [true, { option: true }],
  guard: [async ({ page, signedIn }, use, info) => {
    const unknown: string[] = [];
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: new Date(fixture.recordedAt) });
    await mockApi(page, unknown);
    if (signedIn) {
      await page.addInitScript((u) => {
        localStorage.setItem("authToken", "test-token");
        localStorage.setItem("refreshToken", "test-refresh");
        localStorage.setItem("username", u);
        localStorage.setItem("userRole", "admin");
        localStorage.setItem("isOwner", "1");
      }, ME.username);
    }
    await use();
    expect(errors, `page errors in «${info.title}»`).toEqual([]);
    expect(unknown, "requests the recording does not cover — re-record with e2e/tools/record.mjs").toEqual([]);
  }, { auto: true }],
});
export { expect };
export const isPhone = (page: Page) => (page.viewportSize()?.width || 0) < 768;
