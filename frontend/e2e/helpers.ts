import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PASSWORD = 'e2e-test-password' // matches e2e/start-server.sh
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../../backend/fixtures/pdfs')

export const fixturePath = (name: string) => join(FIXTURES, name)

export async function login(page: Page) {
  await page.goto('/login')
  await page.fill('#password', PASSWORD)
  await page.getByRole('button', { name: /enter/i }).click()
  await expect(page).toHaveURL(/\/projects$/)
}

/** Creates a project and returns its id (API, through the page's session). */
export async function createProject(page: Page, name: string): Promise<string> {
  const res = await page.request.post('/api/projects', { data: { name } })
  expect(res.ok()).toBeTruthy()
  return (await res.json()).id
}

export async function uploadFixture(page: Page, projectId: string, name: string): Promise<string> {
  const res = await page.request.post(`/api/projects/${projectId}/documents`, {
    multipart: { file: { name, mimeType: 'application/pdf', buffer: readFileSync(fixturePath(name)) } },
  })
  expect(res.ok()).toBeTruthy()
  return (await res.json()).id
}

/** Uploads and processes fixtures in demo mode, waiting until all finish. */
export async function seedProcessed(page: Page, projectId: string, names: string[]): Promise<string[]> {
  const ids: string[] = []
  for (const name of names) {
    const id = await uploadFixture(page, projectId, name)
    const res = await page.request.post(`/api/documents/${id}/jobs`, { data: { mode: 'demo', page_start: 1, page_end: 1 } })
    expect(res.ok()).toBeTruthy()
    ids.push(id)
  }
  await expect
    .poll(async () => {
      const docs = await (await page.request.get(`/api/projects/${projectId}/documents`)).json()
      return docs.every((d: { status: string }) => !['queued', 'processing'].includes(d.status))
    })
    .toBe(true)
  return ids
}
