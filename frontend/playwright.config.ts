import { defineConfig, devices } from '@playwright/test'

// End-to-end suite: drives the real FastAPI backend (demo mode, throwaway
// database) serving the built frontend. Run `npm run build` first, then
// `npm run test:e2e`. First time on a new machine: `npx playwright install chromium`.
const PORT = Number(process.env.E2E_PORT ?? 8765)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // one backend, one SQLite file
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {},
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command: './e2e/start-server.sh',
    url: `http://127.0.0.1:${PORT}/api/status`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { E2E_PORT: String(PORT) },
  },
})
