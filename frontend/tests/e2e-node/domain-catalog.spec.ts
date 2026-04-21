import { expect, test } from '@playwright/test'
import {
  createCatalogViaUi,
  createDomainViaUi,
  gotoSemantic,
  prepareAuthenticatedPage,
  uniqueName,
} from './helpers'

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)
})

test('领域目录首屏展示目录治理摘要', async ({ page }) => {
  await gotoSemantic(page, '/semantic/domains')
  await expect(page).toHaveURL(/\/semantic\/domains\/.+\?panel=catalog$/, { timeout: 20_000 })
  await expect(page.getByTestId('domain-canvas-page')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('domain-tree-panel')).toBeVisible()
  await expect(page.getByRole('button', { name: '领域目录' })).toBeVisible()
  await expect(page.getByTestId('domain-join-panel').getByText('领域说明', { exact: true })).toBeVisible()
  await expect(page.getByTestId('domain-join-panel').getByText('Cube 关系', { exact: true })).toBeVisible()
})

test('domain-list-search 可以筛选领域', async ({ page }) => {
  const domainName = uniqueName('qa-domain-search 目录检索领域')

  await createDomainViaUi(page, domainName)
  await gotoSemantic(page, '/semantic/domains')
  await expect(page).toHaveURL(/\/semantic\/domains\/.+\?panel=catalog$/, { timeout: 20_000 })

  await page.getByPlaceholder('搜索目录、领域、Cube...').fill(domainName)
  const domainRow = page.getByTestId('domain-tree-panel').locator('button').filter({ hasText: domainName }).first()
  await expect(domainRow).toBeVisible()
})

test('领域目录页只保留视图切换，不再暴露内联创建入口', async ({ page }) => {
  await gotoSemantic(page, '/semantic/domains')
  await expect(page).toHaveURL(/\/semantic\/domains\/.+\?panel=catalog$/, { timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Cube 库' })).toBeVisible()
  await expect(page.getByRole('button', { name: '领域目录' })).toBeVisible()
  await expect(page.locator('[data-testid="domain-create-trigger"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="catalog-create-trigger"]')).toHaveCount(0)
})

test('在目录中创建 catalog，并在右侧摘要切换到选中领域', async ({ page }) => {
  const suffix = Date.now()
  const catalogName = `QA 目录 ${suffix}`
  const catalogCode = `qa_catalog_${suffix}`
  const domainName = uniqueName('qa-domain-catalog 目录领域')

  await createCatalogViaUi(page, catalogName, catalogCode)
  await createDomainViaUi(page, domainName, catalogName)

  await gotoSemantic(page, '/semantic/domains')
  await page.getByPlaceholder('搜索目录、领域、Cube...').fill(catalogName)
  const catalogRow = page.getByTestId('domain-tree-panel').locator('button').filter({ hasText: catalogName }).first()
  await expect(catalogRow).toBeVisible()
  await catalogRow.click()
  await page.getByPlaceholder('搜索目录、领域、Cube...').fill(domainName)
  const domainRow = page.getByTestId('domain-tree-panel').locator('button').filter({ hasText: domainName }).first()
  await expect(domainRow).toBeVisible()
  await domainRow.click()
  await expect(page.getByTestId('domain-join-panel').getByText(domainName, { exact: true })).toBeVisible()
  await expect(page.getByTestId('domain-join-panel').getByText('领域说明', { exact: true })).toBeVisible()
})
