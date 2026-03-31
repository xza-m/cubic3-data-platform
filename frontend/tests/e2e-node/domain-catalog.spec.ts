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
  await expect(page.getByRole('heading', { name: '领域目录' })).toBeVisible()
  await expect(page.getByTestId('domain-tree-panel')).toBeVisible()
  await expect(page.getByTestId('domain-canvas-preview')).toBeVisible()
})

test('domain-list-search 可以筛选领域', async ({ page }) => {
  const domainName = uniqueName('Playwright 目录检索领域')

  await createDomainViaUi(page, domainName)
  await gotoSemantic(page, '/semantic/domains')
  await expect(page.getByRole('heading', { name: '领域目录' })).toBeVisible()

  await page.getByTestId('domain-tree-search').fill(domainName)
  await expect(page.locator('[data-testid^="domain-list-item-"]').filter({ hasText: domainName }).first()).toBeVisible()
})

test('领域目录页只保留视图切换，不再暴露内联创建入口', async ({ page }) => {
  await gotoSemantic(page, '/semantic/domains')
  await expect(page.getByRole('heading', { name: '领域目录' })).toBeVisible()
  await expect(page.getByTestId('domain-view-toggle')).toBeVisible()
  await expect(page.locator('[data-testid="domain-create-trigger"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="catalog-create-trigger"]')).toHaveCount(0)
})

test('在目录中创建 catalog，并在右侧摘要切换到选中领域', async ({ page }) => {
  const suffix = Date.now()
  const catalogName = `Playwright 目录 ${suffix}`
  const catalogCode = `playwright_catalog_${suffix}`
  const domainName = uniqueName('Playwright 目录领域')

  await createCatalogViaUi(page, catalogName, catalogCode)
  await createDomainViaUi(page, domainName, catalogName)

  await gotoSemantic(page, '/semantic/domains')
  await page.getByTestId(`domain-catalog-${catalogCode}`).click()
  const domainRow = page.locator('[data-testid^="domain-list-item-"]').filter({ hasText: domainName }).first()
  await expect(domainRow).toBeVisible()
  await domainRow.click()
  await expect(page.getByTestId('domain-canvas-preview').getByText(domainName, { exact: true })).toBeVisible()
  await expect(page.getByTestId('domain-open-design')).toBeVisible()
})
