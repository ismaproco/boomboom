import { expect, test } from '@playwright/test'

const routes = ['/', '/markets', '/articles', '/popular'] as const

for (const route of routes) {
  test(`smoke ${route} loads without console errors`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))

    const response = await page.goto(route)
    expect(response?.ok()).toBeTruthy()
    await expect(page.locator('body')).toBeVisible()
    expect(errors, `console errors on ${route}`).toEqual([])
  })
}

test('navigate home to popular', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/')
  await page.goto('/popular')
  await expect(page.locator('body')).toBeVisible()
  expect(errors).toEqual([])
})
