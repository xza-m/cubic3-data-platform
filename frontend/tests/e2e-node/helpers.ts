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

export async function selectFirstSchemaTable(page: Page) {
  const tableLocator = page.locator('[data-testid^="schema-node-table-"]')
  const schemaLocator = page.locator('[data-testid^="schema-node-schema-"]')
  const databaseLocator = page.locator('[data-testid^="schema-node-database-"]')

  if (await tableLocator.count() === 0) {
    if (await schemaLocator.count() === 0) {
      await databaseLocator.first().waitFor({ state: 'visible', timeout: 15_000 })
      await databaseLocator.first().click()
    }

    if (await tableLocator.count() === 0) {
      await schemaLocator.first().waitFor({ state: 'visible', timeout: 15_000 })
      await schemaLocator.first().click()
    }
  }

  await tableLocator.first().waitFor({ state: 'visible', timeout: 15_000 })
  await tableLocator.first().click()
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

export async function ensureCubeAvailable(page: Page) {
  await gotoSemantic(page, '/semantic/cubes')
  await expect(page.getByRole('heading', { name: 'Cube 管理' })).toBeVisible()

  const firstItem = page.locator('[data-testid^="cube-management-item-"]').first()
  const emptyState = page.getByText('没有命中当前条件的 Cube', { exact: false })
  await Promise.race([
    firstItem.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => null),
    emptyState.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => null),
  ])

  if (await firstItem.count()) {
    return
  }

  const cubeTitle = uniqueName('Playwright Cube 草稿')
  await gotoSemantic(page, '/semantic/cubes/new')
  await expect(page.getByRole('heading', { name: '新建 Cube' })).toBeVisible()
  await selectFirstSchemaTable(page)
  await page.getByTestId('cube-generate-draft').click()
  await expect(page.getByText('Cube 草稿已生成', { exact: false })).toBeVisible()
  await page.getByTestId('cube-draft-title').fill(cubeTitle)
  await page.getByTestId('cube-save-draft').click()
  await page.waitForURL(/\/semantic\/cubes\/[^/]+$/, { timeout: 15_000 })
}
