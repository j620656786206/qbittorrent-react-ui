import { defineConfig, devices } from '@playwright/test'

// Story 2.0: the browser smoke. Chromium only, one worker, tests in order:
// they share the fake server's mode. The web server is the built app behind
// scripts/fake-qbit.mjs, which only ever talks to the fake qBittorrent it
// starts itself (AD-15). Run `npm run build` first.
// https://playwright.dev/docs/test-webserver
// https://playwright.dev/docs/ci#github-actions

const CI = Boolean(process.env.CI)
const PORT = 3100
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  timeout: 60_000,
  reporter: CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node scripts/fake-qbit.mjs --port ${PORT}`,
    url: `${BASE_URL}/healthz`,
    // Never test a stale fake-qbit or another server on the port.
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
    // SIGTERM lets fake-qbit stop the app and remove its temporary CONFIG_DIR.
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
})
