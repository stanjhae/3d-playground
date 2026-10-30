import { defineConfig, devices } from '@playwright/test'

/**
 * Browser journey tests (Q04 #189). Local by default: starts the dev
 * server with sign-in required against the local Supabase stack. Point
 * `E2E_BASE_URL` at a deployed environment to run the same suite there.
 */

const PORT = 5199
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: 'e2e',
  // One account per test; tests in a file share nothing but the server.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm dev --port ${PORT} --strictPort`,
        url: baseURL,
        env: { VITE_FLP_REQUIRE_AUTH: 'true' },
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
