import { expect, test } from '@playwright/test'
import { createProject, fixturePath, login, seedProcessed } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page)
})

test('upload, process and review fields with the keyboard', async ({ page }) => {
  // Create the project through the UI.
  await page.getByRole('button', { name: 'New project' }).click()
  await page.fill('#name', 'E2E review flow')
  await page.getByRole('dialog').getByRole('button', { name: 'Create project' }).click()
  await expect(page).toHaveURL(/\/projects\/[^/]+\/documents$/)
  await expect(page.getByText('Demo — synthetic documents and simulated extraction').first()).toBeVisible()

  // Multi-file upload through the dropzone, including a duplicate.
  await page.locator('.dropzone input[type=file]').setInputFiles([
    fixturePath('A1_status_sheet.pdf'),
    fixturePath('A1_release_record.pdf'),
  ])
  await expect(page.locator('.doc-item')).toHaveCount(2)
  await page.locator('.dropzone input[type=file]').setInputFiles([fixturePath('A1_status_sheet.pdf')])
  await expect(page.locator('.doc-item')).toHaveCount(3)
  await expect(page.locator('.upload-result', { hasText: 'Duplicate' })).toBeVisible()

  // A duplicate's viewer points back to the original instead of offering to process it.
  await page.locator('.doc-item', { hasText: 'Same file as an earlier upload' }).locator('a.doc-name').click()
  await expect(page.getByText('Duplicate of an earlier upload')).toBeVisible()
  await page.getByRole('link', { name: 'Open the original' }).click()
  await expect(page.locator('.review-title h1')).toHaveText('A1_status_sheet.pdf')
  await page.goBack()
  await page.goBack()
  await expect(page.locator('.doc-item')).toHaveCount(3)

  // Process both originals through the processing dialog.
  for (const name of ['A1_status_sheet.pdf', 'A1_release_record.pdf']) {
    const process = page
      .locator('.doc-item', { hasText: name })
      .getByRole('button', { name: 'Process', exact: true })
    await process.click()
    await page.getByRole('dialog').getByRole('button', { name: 'Start processing' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(process).toHaveCount(0)
  }
  await expect(page.locator('.doc-item .badge', { hasText: /^processed$/i })).toHaveCount(2)

  // Review workspace: N selects, C confirms and advances, E corrects.
  await page
    .locator('.doc-item', { hasText: 'A1_status_sheet.pdf' })
    .filter({ hasNotText: 'Same file as an earlier upload' })
    .locator('a.doc-name')
    .click()
  await expect(page.locator('.field-card').first()).toBeVisible()
  const progress = page.locator('.review-progress-label')
  await expect(progress).toContainText('0 of')

  await page.keyboard.press('n')
  const first = await page.locator('.field-card.is-active .field-name').textContent()
  await page.keyboard.press('c')
  await expect(progress).toContainText('1 of')
  await expect(page.locator('.field-card.is-active .field-name')).not.toHaveText(first ?? '')

  await page.keyboard.press('e')
  const input = page.getByLabel('Corrected value')
  await expect(input).toBeFocused()
  await input.fill('CORRECTED-E2E')
  await page.keyboard.press('Enter')
  await expect(page.locator('.field-original').first()).toContainText('Original extracted value')
  await expect(progress).toContainText('2 of')

  // Shortcut help is reachable from the keyboard and closes with Escape.
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('confirm a match, decide findings, follow evidence, export', async ({ page }) => {
  const projectId = await createProject(page, 'E2E findings')
  await seedProcessed(page, projectId, ['D1_status_sheet.pdf', 'D1_release_record.pdf', 'B1_status_missing_serial.pdf'])

  // Before any match is confirmed only the per-document check has findings.
  await page.goto(`/projects/${projectId}/findings?view=matches`)
  await expect(page.locator('.compare-row').first()).toBeVisible()
  await expect(page.locator('.compare-row', { hasText: 'Serial number' })).toContainText('same')
  await page.keyboard.press('c')
  await expect(page.locator('.inbox-item.is-decided')).toHaveCount(1)

  // Confirming the D1 pair surfaces the decreasing-hours discrepancy.
  await page.getByRole('tab', { name: /Findings/ }).click()
  const decreasing = page.locator('.inbox-item', { hasText: 'Decreasing cumulative flight hours' })
  await expect(decreasing).toBeVisible()
  await decreasing.click()
  await expect(page.locator('.finding-panel-head h2')).toHaveText('Decreasing cumulative flight hours')

  // Evidence opens the exact cited field on its page.
  await page.locator('.evidence-item').first().getByRole('link', { name: 'Open page' }).click()
  await expect(page).toHaveURL(/\/documents\/[^?]+\?page=1&field=/)
  await expect(page.locator('.field-card.is-active')).toBeVisible()
  await page.goBack()

  // Decide every open finding from the keyboard; the inbox advances.
  await expect(page.locator('.finding-panel')).toBeVisible()
  const openTab = page.getByRole('tab', { name: /Findings/ }).locator('.chip-count')
  await expect(openTab).toHaveText('2')
  await page.keyboard.press('c')
  await expect(openTab).toHaveText('1')
  await page.keyboard.press('d')
  await expect(openTab).toHaveText('0')

  // Overview reflects the decisions; export previews the real report.
  await page.goto(`/projects/${projectId}`)
  await expect(page.locator('.checklist-step', { hasText: 'Decide findings' })).toHaveClass(/is-done/)
  await page.goto(`/projects/${projectId}/export`)
  await expect(page.locator('.viewer-canvas canvas')).toBeVisible({ timeout: 20_000 })
  const pdf = await page.request.get(`/api/projects/${projectId}/export.pdf`)
  expect(pdf.headers()['content-type']).toBe('application/pdf')
  expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF')
})

test('a clean project says "no findings from the selected checks", never "compliant"', async ({ page }) => {
  const projectId = await createProject(page, 'E2E clean')
  await seedProcessed(page, projectId, ['A1_status_sheet.pdf'])
  await page.goto(`/projects/${projectId}/findings`)
  await expect(page.getByText('No findings from the selected checks')).toBeVisible()
  const text = (await page.locator('main, .shell').first().innerText()).toLowerCase()
  for (const banned of ['compliant', 'airworthy', 'certified', 'verified authentic']) {
    expect(text).not.toContain(banned)
  }
})
