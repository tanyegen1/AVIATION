import { expect, test } from '@playwright/test'
import { createProject, login, seedProcessed } from './helpers'

test('every screen fits a 390px phone without sideways scrolling', async ({ page }) => {
  await login(page)
  const projectId = await createProject(page, 'E2E mobile — Uçak bakım')
  const [docId] = await seedProcessed(page, projectId, ['D1_status_sheet.pdf', 'D1_release_record.pdf'])

  const paths = [
    '/',
    '/projects',
    `/projects/${projectId}`,
    `/projects/${projectId}/documents`,
    `/projects/${projectId}/documents/${docId}`,
    `/projects/${projectId}/findings`,
    `/projects/${projectId}/findings?view=matches`,
    `/projects/${projectId}/export`,
  ]
  for (const path of paths) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `horizontal overflow on ${path}`).toBeLessThanOrEqual(0)
  }

  // Narrow screens show the inbox list first, then the detail with a way back.
  await page.goto(`/projects/${projectId}/findings?view=matches`)
  await page.locator('.inbox-item').first().click()
  await expect(page.locator('.compare-row').first()).toBeVisible()
  await expect(page.locator('.inbox-list')).toBeHidden()
  await page.getByRole('button', { name: 'All matches' }).click()
  await expect(page.locator('.inbox-list')).toBeVisible()
})
