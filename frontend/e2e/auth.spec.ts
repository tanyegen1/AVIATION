import { expect, test } from '@playwright/test'
import { PASSWORD } from './helpers'

test('landing page is public and the app is behind the password gate', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: /enter workspace/i }).first()).toBeVisible()

  await page.goto('/projects')
  await expect(page).toHaveURL(/\/login$/)

  await page.fill('#password', 'not-the-password')
  await page.getByRole('button', { name: /enter/i }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)

  await page.fill('#password', PASSWORD)
  await page.getByRole('button', { name: /enter/i }).click()
  await expect(page).toHaveURL(/\/projects$/)

  // Unknown API paths are 404s, never the SPA shell.
  const res = await page.request.get('/api/definitely-not-a-route')
  expect(res.status()).toBe(404)

  await page.getByRole('button', { name: /log out/i }).first().click()
  await expect(page).toHaveURL(/\/login$/)
})
