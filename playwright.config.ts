import { type PlaywrightTestConfig, defineConfig, devices } from '@playwright/test'

/**
 * Browser journey tests (Q04 #189). Local by default: starts the dev
 * server with sign-in required against the local Supabase stack. Point
 * `E2E_BASE_URL` at a deployed environment to run the same suite there.
 *
 * `E2E_SERVER=preview` tests the production build instead (`pnpm build`,
 * then `pnpm preview`), as CI does. A dev server still starts beside it
 * for the few tests that drive the app's own modules (`@dev-server`).
 * `E2E_WEBKIT=1` adds the WebKit smoke project. See docs/e2e.md.
 */

// Each checkout can pick its own port; a server already on it is never
// reused, so a run can't silently test another worktree's code.
const PORT = Number(process.env.E2E_PORT ?? 5199)
const DEV_PORT = PORT + 1
const PREVIEW = process.env.E2E_SERVER === 'preview' && !process.env.E2E_BASE_URL
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`
const devURL = `http://localhost:${DEV_PORT}`

// Tests tagged `@dev-server` import `/src/...` in the page, which only the
// Vite dev server serves. With a preview build they move to `dev-modules`.
const DEV_ONLY = /@dev-server/

// Touch and iPad cover input and layout, not every journey (A6, A7).
const TOUCH_SPECS = ['touch.spec.ts', 'smoke.spec.ts']

/** Pro tools start on: the suite drives the expert controls. */
function storageFor({ url }: { url: string }) {
  return { cookies: [], origins: [{ origin: new URL(url).origin, localStorage: [{ name: 'flp-pro-tools', value: 'on' }] }] }
}

const appEnv = { VITE_FLP_REQUIRE_AUTH: 'true', VITE_FLP_CONTACT_EMAIL: 'alpha@example.test' }

const devServer = ({ port }: { port: number }) => ({
  command: `pnpm dev --port ${port} --strictPort`,
  url: `http://localhost:${port}`,
  env: appEnv,
  reuseExistingServer: false,
  timeout: 120_000,
})

function webServer(): PlaywrightTestConfig['webServer'] {
  if (process.env.E2E_BASE_URL) {
    return undefined
  }

  if (!PREVIEW) {
    return devServer({ port: PORT })
  }

  return [
    {
      // The build reads the same VITE_* values the dev server would.
      command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
      url: baseURL,
      env: appEnv,
      reuseExistingServer: false,
      timeout: 300_000,
    },
    devServer({ port: DEV_PORT }),
  ]
}

const projects: PlaywrightTestConfig['projects'] = [
  {
    name: 'chromium',
    testIgnore: ['touch.spec.ts'],
    grepInvert: PREVIEW ? DEV_ONLY : undefined,
    use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
  },
  {
    // A touch phone-sized Chromium: CDP touch emulation, coarse pointer.
    name: 'chromium-touch',
    testMatch: TOUCH_SPECS,
    use: { ...devices['Pixel 7'] },
  },
  {
    // iPad Pro 11 size and touch in Chromium (WebKit's own run is the smoke below).
    name: 'ipad',
    testMatch: TOUCH_SPECS,
    use: {
      ...devices['Desktop Chrome'],
      viewport: devices['iPad Pro 11'].viewport,
      deviceScaleFactor: devices['iPad Pro 11'].deviceScaleFactor,
      userAgent: devices['iPad Pro 11'].userAgent,
      isMobile: true,
      hasTouch: true,
    },
  },
]

if (PREVIEW) {
  projects.push({
    name: 'dev-modules',
    grep: DEV_ONLY,
    testIgnore: ['touch.spec.ts'],
    use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, baseURL: devURL, storageState: storageFor({ url: devURL }) },
  })
}

if (process.env.E2E_WEBKIT) {
  // Non-blocking in CI until WebGL2 is proven in WebKit on Linux.
  projects.push({ name: 'webkit-smoke', testMatch: ['smoke.spec.ts'], use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } } })
}

export default defineConfig({
  testDir: 'e2e',
  // One account per test; tests in a file share nothing but the server.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // Baselines per OS: CI's are Linux; a Mac run writes its own beside them.
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{projectName}/{testFilePath}/{arg}{ext}',
  use: {
    baseURL,
    // `signIn({ pro: false })` and `guided.spec.ts` cover Guided.
    storageState: storageFor({ url: baseURL }),
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
  },
  projects,
  webServer: webServer(),
})
