import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.API_PORT ?? 3210)
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
