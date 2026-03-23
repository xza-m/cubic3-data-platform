import { expect, type Page } from '@playwright/test'

const AUTH_TOKEN = process.env.DOMAIN_SMOKE_AUTH_TOKEN ?? 'playwright-smoke-token'

export function uniqueName(prefix: string) {
  return `${prefix} ${Date.now()}`
}

export async function prepareAuthenticatedPage(page: Page) {
  await page.addInitScript((token: string) => {
    window.localStorage.setItem('auth_token', token)
  }, AUTH_TOKEN)
}

export async function gotoSemantic(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
}

export async function createDomainViaUi(page: Page, domainName: string, catalogName?: string) {
  await gotoSemantic(page, '/semantic/modeling')
  await expect(page.getByRole('heading', { name: '领域建模' })).toBeVisible()
  if (catalogName) {
    await page.getByTestId('domain-create-catalog-select').click()
    await page.getByRole('option', { name: catalogName }).click()
  }
  await page.getByTestId('domain-create-name').fill(domainName)
  await page.getByTestId('domain-create-submit').click()
  await page.waitForURL(/\/semantic\/domains\/[^/]+$/, { timeout: 15_000 })
}

export async function dragLibraryCubeToCanvas(page: Page, index = 0) {
  const cube = page.locator('[data-testid^="domain-library-cube-"]').nth(index)
  const surface = page.getByTestId('domain-canvas-surface')
  await cube.waitFor({ state: 'visible', timeout: 10_000 })
  await surface.waitFor({ state: 'visible', timeout: 10_000 })
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
  await cube.dispatchEvent('dragstart', { dataTransfer })
  await surface.dispatchEvent('dragover', { dataTransfer })
  await surface.dispatchEvent('drop', { dataTransfer })
}

export async function createCatalogViaUi(page: Page, catalogName: string, catalogCode: string) {
  await gotoSemantic(page, '/semantic/domains')
  await expect(page.getByRole('heading', { name: '领域目录' })).toBeVisible()
  await page.getByTestId('catalog-create-trigger').click()
  await page.getByTestId('catalog-editor-name').fill(catalogName)
  await page.getByTestId('catalog-editor-code').fill(catalogCode)
  await page.getByTestId('catalog-editor-submit').click()
  await expect(page.getByTestId(`domain-catalog-${catalogCode}`)).toBeVisible()
}
