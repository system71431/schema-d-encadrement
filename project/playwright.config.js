import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

// Tests Playwright. Émulation mobile via Chromium uniquement (pas de
// dépendance WebKit/Firefox côté CI). Deux profils : étroit (375 façon
// iPhone SE) et standard (393 façon Pixel 5). Ces tests vérifient les
// flows critiques de la lecture mobile : popup en bottom-sheet, pinch/pan,
// SHA dans la toolbar.

// En CI (GitHub Actions), Playwright trouve son propre Chromium via
// `npx playwright install --with-deps chromium`. En local sandbox, on
// pointe vers le binaire préinstallé à `/opt/pw-browsers/...`. On bascule
// automatiquement en testant son existence.
const SANDBOX_CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const launchOptions = {
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
  ...(fs.existsSync(SANDBOX_CHROME) ? { executablePath: SANDBOX_CHROME } : {}),
};

const baseChromium = {
  ...devices["Desktop Chrome"],
  isMobile: false,
  hasTouch: true,
  defaultBrowserType: "chromium",
};

export default defineConfig({
  testDir: "./tests",
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "off",
    screenshot: "only-on-failure",
    launchOptions,
  },
  projects: [
    { name: "small-375",  use: { ...baseChromium, viewport: { width: 375, height: 667 } }, testIgnore: /editor\.spec\.js/ },
    { name: "medium-393", use: { ...baseChromium, viewport: { width: 393, height: 851 } }, testIgnore: /editor\.spec\.js/ },
    // Desktop : pour les flux d'édition (le bouton « Éditer » est masqué
    // par CSS sous 600px). Tests dédiés dans `tests/editor.spec.js`.
    { name: "desktop", use: { ...baseChromium, viewport: { width: 1280, height: 800 }, hasTouch: false }, testMatch: /editor\.spec\.js/ },
  ],
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
