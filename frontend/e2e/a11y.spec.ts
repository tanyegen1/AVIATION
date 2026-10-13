import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { createProject, login, seedProcessed } from './helpers'

// Automated WCAG 2 A/AA scan of every screen. It catches a subset of
// issues (contrast, names, roles, landmarks) — not a substitute for a
// manual keyboard and screen-reader pass.
async function seriousViolations(page: Page, label: string): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // The PDF canvas/text layer is the uploaded document, not our UI.
    .exclude('.react-pdf__Page')
    .exclude('.react-pdf__Thumbnail')
    .analyze()
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  const report = serious.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n  ')}`)
  return report.map((r) => `[${label}] ${r}`)
}

async function expectNoSeriousViolations(page: Page, label: string) {
  const report = await seriousViolations(page, label)
  expect(report, report.join('\n')).toEqual([])
}

test('public pages', async ({ page }) => {
  await page.goto('/')
  const report = await seriousViolations(page, 'landing')
  await page.goto('/login')
  report.push(...(await seriousViolations(page, 'login')))
  expect(report, report.join('\n')).toEqual([])
})

test('reviewer screens', async ({ page }) => {
  await login(page)
  const projectId = await createProject(page, 'E2E accessibility')
  const [docId] = await seedProcessed(page, projectId, ['D1_status_sheet.pdf', 'D1_release_record.pdf', 'B1_status_missing_serial.pdf'])

  const screens: [string, string, string][] = [
    ['projects', '/projects', '.project-card'],
    ['overview', `/projects/${projectId}`, '.checklist'],
    ['documents', `/projects/${projectId}/documents`, '.doc-item'],
    ['review workspace', `/projects/${projectId}/documents/${docId}`, '.field-card'],
    ['findings', `/projects/${projectId}/findings`, '.finding-panel'],
    ['matches', `/projects/${projectId}/findings?view=matches`, '.compare-row'],
    ['export', `/projects/${projectId}/export`, '.readiness-list, .readiness-clear'],
  ]
  // Scan every screen before asserting, so one run reports everything.
  const report: string[] = []
  for (const [label, path, ready] of screens) {
    await page.goto(path)
    await expect(page.locator(ready).first()).toBeVisible()
    report.push(...(await seriousViolations(page, label)))
  }
  expect(report, report.join('\n')).toEqual([])

  // Dialogs too.
  await page.goto(`/projects/${projectId}/documents/${docId}`)
  await expect(page.locator('.field-card').first()).toBeVisible()
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expectNoSeriousViolations(page, 'shortcuts dialog')
})

test('keyboard: skip link, dialog focus trap and focus return', async ({ page }) => {
  await login(page)

  // First Tab lands on the skip link, which moves focus to the content.
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()

  // Dialog: focus moves in, Tab stays inside, Escape closes and returns focus.
  const opener = page.getByRole('button', { name: 'New project' })
  await opener.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'New project' })
  await expect(dialog).toBeVisible()
  await expect(page.locator('#name')).toBeFocused()
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
})
