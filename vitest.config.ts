import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// Logic tests (src/**/*.test.ts). Screen tests live in e2e/ and run with Playwright.
export default mergeConfig(viteConfig, defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node", setupFiles: ["src/test/setup.ts"] },
}));
