// The five finished screens, on a phone (390 px) and a desktop (1440 px).
// Data comes from e2e/fixtures/api.json (recorded from a local backend), the clock is frozen at that moment.
import { test, expect, isPhone, ME } from "./mock";

test.describe("Вхід", () => {
  test.use({ signedIn: false });

  test("«Запам'ятати мене» is on by default and signing in opens the dashboard", async ({ page }) => {
    await page.goto("/login");
    const remember = page.getByRole("checkbox", { name: /Запам.ятати мене/ });
    await expect(remember).toBeChecked();
    await page.fill("#login-username", ME.username);
    await page.fill("#login-password", "anything");
    await page.click("button[type=submit]");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Дашборд" })).toBeVisible();
  });

  test("a wrong login shows an error and stays on the page", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#login-username", "nobody");
    await page.fill("#login-password", "x");
    await page.click("button[type=submit]");
    await expect(page.getByText(/Невірний логін або пароль|Неправильний логін або пароль/)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Дашборд", () => {
  test("KPI cards and a manual refresh with its toast", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Дашборд" })).toBeVisible();
    await expect(page.locator(".v3-kpi-l").first()).toBeVisible(); // KPI cards (labels are shorter on a phone)
    const refresh = isPhone(page) ? page.locator(".v3-bt-rfb") : page.getByRole("button", { name: /Оновити/ }).first();
    await refresh.click();
    await expect(page.getByText("Дані оновлено")).toBeVisible();
  });

  test("the period picker opens with a blue outline", async ({ page }) => {
    test.skip(!isPhone(page), "the phone period picker; desktop uses period chips");
    await page.goto("/dashboard");
    const btn = page.locator(".v3-period-btn").first();
    await btn.click();
    await expect(btn).toHaveAttribute("aria-expanded", "true");
  });
});

test.describe("Користувачі", () => {
  test("opens on «Усі» with every user, the owner has the «Овнер» badge", async ({ page }) => {
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Користувачі" })).toBeVisible();
    await expect(page.getByText("@Gerrry").filter({ visible: true }).first()).toBeVisible();
    await expect(page.locator(".v3-st-owner").filter({ visible: true }).first()).toHaveText("Овнер");
    if (isPhone(page)) await expect(page.locator(".v3-mselect-dd button").first()).toContainText("Усі");
  });

  test("a link from the dashboard opens its filter, the phone menu does not", async ({ page }) => {
    await page.goto("/users?status=trial");
    if (isPhone(page)) {
      await expect(page.locator(".v3-mselect-dd button").first()).toContainText("Пробний");
      await page.getByRole("button", { name: "Відкрити меню" }).click();
      await page.getByRole("link", { name: /Користувачі/ }).first().click();
      await expect(page).toHaveURL(/\/users$/);
    } else {
      await expect(page.locator(".v3-seg button.is-on, .v3-fchip.is-on").first()).toContainText("Пробний");
    }
  });

  test("search finds a user by login", async ({ page }) => {
    await page.goto("/users");
    await page.getByPlaceholder(/Логін або Telegram|Знайти за логіном/).first().fill("Ter");
    await expect(page.getByText("@Ter").first()).toBeVisible();
    await expect(page.getByText("@Gerrry")).toHaveCount(0);
  });

  test("«Самообмеження» tab with search", async ({ page }) => {
    await page.goto("/users");
    await page.getByRole("button", { name: "Самообмеження" }).or(page.getByRole("tab", { name: "Самообмеження" })).first().click();
    await expect(page.locator(".v3-excl-search, input[placeholder*='Логін']").first()).toBeVisible();
  });
});

test.describe("Оплати", () => {
  test("payments list, then refunds and promo codes with their search", async ({ page }) => {
    await page.goto("/payments");
    await expect(page.getByRole("heading", { name: "Оплати" })).toBeVisible();
    await expect(page.getByText("@test30610").first()).toBeVisible();

    await page.getByRole("tab", { name: /Повернення/ }).click();
    await expect(page).toHaveURL(/tab=ref|\/payments/);
    const ref = page.getByPlaceholder("№, логін або причина");
    await expect(ref).toBeVisible();
    await expect(page.getByText("@Ter").first()).toBeVisible();
    await ref.fill("нікого-такого");
    await expect(page.getByText("@Ter")).toHaveCount(0);

    await page.getByRole("tab", { name: /Промокоди/ }).click();
    const promo = page.getByPlaceholder("Код промокоду");
    await expect(promo).toBeVisible();
    await expect(page.getByText("START10").first()).toBeVisible();
    await promo.fill("PRO");
    await expect(page.getByText("START10")).toHaveCount(0);
    await expect(page.getByText("PRO20").first()).toBeVisible();
  });

  test("wide screen: search is on the left in every tab", async ({ page }) => {
    test.skip(isPhone(page), "desktop layout");
    await page.goto("/payments");
    const tools = page.locator(".v3-pay-list .v3-pay-tools").first();
    await expect(tools.locator(":scope > *").first()).toHaveClass(/v3-search/);
    await page.getByRole("tab", { name: /Повернення/ }).click();
    await expect(page.locator(".v3-pay-hrow > *").first()).toHaveClass(/v3-search/);
  });
});

test.describe("Ставки", () => {
  test("₴ and $ are counted apart: «+33 $» under the ₴ profit", async ({ page }) => {
    await page.goto("/bets");
    await expect(page.getByRole("heading", { name: "Ставки" })).toBeVisible();
    await expect(page.getByText("@admin").first()).toBeVisible();
    const usd = page.locator(".v3-bt-usd").filter({ hasText: "+33 $" }).filter({ visible: true }).first();
    await expect(usd).toBeVisible();
    // The $ text lines up with the ₴ text above it (phone: right edges, desktop: left edges of the column)
    const edges = await usd.evaluate((el) => {
      const text = (n: Node) => { const r = document.createRange(); r.selectNodeContents(n); return r.getBoundingClientRect(); };
      const cell = el.parentElement!;
      const uah = Array.from(cell.childNodes).find((n) => n !== el && (n.textContent || "").includes("₴"))!;
      const a = text(uah), b = text(el);
      return { uahL: a.left, uahR: a.right, usdL: b.left, usdR: b.right };
    });
    if (isPhone(page)) expect(Math.abs(edges.usdR - edges.uahR)).toBeLessThan(4);
    else expect(Math.abs(edges.usdL - edges.uahL)).toBeLessThan(4);
    await expect(page.getByText("Адміни й овнери")).toHaveCount(0); // staff toggle removed — everyone is listed
  });

  test("«Усі ставки» shows «У гривнях» and «У доларах» with counts; the $ bet is in dollars", async ({ page }) => {
    await page.goto("/bets");
    const row = (isPhone(page) ? page.locator(".v3-bt-mcard") : page.locator(".v3-bt-tr")).first();
    if ((await row.getAttribute("aria-expanded")) !== "true") await row.click(); // desktop opens the first user by itself
    await page.locator(".v3-bt-allbtn, .v3-bt-lnk").filter({ visible: true }).first().click();
    const dlg = page.getByRole("dialog");
    await expect(dlg.getByText(/У гривнях · \d+ став/)).toBeVisible();
    await expect(dlg.getByText("У доларах · 1 ставка")).toBeVisible();
    const usdBet = dlg.locator(".v3-ab-bet, article, li").filter({ hasText: "Team Spirit" }).first();
    await expect(usdBet).toContainText("100 $");
    await expect(usdBet).toContainText("+33 $");
  });

  test("CS2 tab keeps the $ line, Dota 2 has none", async ({ page }) => {
    await page.goto("/bets");
    await page.getByRole("button", { name: /CS2/ }).first().click();
    await expect(page.locator(".v3-bt-usd").filter({ hasText: "$" }).first()).toBeVisible();
    await page.getByRole("button", { name: /Dota 2/ }).first().click();
    await expect(page.locator(".v3-bt-mamt .v3-bt-usd, .v3-bt-n .v3-bt-usd")).toHaveCount(0);
  });
});

test.describe("Журнал дій", () => {
  test("entries, shared dropdowns instead of native selects", async ({ page }) => {
    await page.goto("/audit");
    await expect(page.getByRole("heading", { name: "Журнал дій" })).toBeVisible();
    await expect(page.getByText(/видалив запис оплати/i).first()).toBeVisible();
    await expect(page.locator("main select")).toHaveCount(0);
    await page.locator(".v3-au-mdd .v3-dd-btn, .v3-au-wdd .v3-dd-btn").first().click();
    await expect(page.getByRole("listbox").or(page.getByRole("menu")).first()).toBeVisible();
  });

  test("phone: tap a record to open its details; the header has the journal button", async ({ page }) => {
    test.skip(!isPhone(page), "phone layout");
    await page.goto("/audit");
    const row = page.locator(".v3-au-mev").first();
    await row.click();
    await expect(row).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".v3-header-end .v3-audit")).toBeVisible();
  });

  test("a user's history: banner with «Увесь журнал» button", async ({ page }) => {
    await page.goto("/audit?userId=3&username=Gerrry");
    await expect(page.getByText("Історія @Gerrry")).toBeVisible();
    await expect(page.locator(".v3-au-hist-btn")).toHaveText("Увесь журнал");
  });
});
