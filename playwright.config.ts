import { defineConfig, devices } from "@playwright/test";

// Screen tests: the admin runs against recorded backend answers (e2e/fixtures/api.json),
// so no backend or database is needed. Each test runs on a phone and on a desktop.
const PORT = 5175;
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure", locale: "uk-UA", timezoneId: "Europe/Kyiv" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    env: { VITE_API_URL: "/api" },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
