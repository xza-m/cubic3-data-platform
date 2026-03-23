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

test('在目录中创建 catalog，并在建模入口选择该目录创建领域', async ({ page }) => {
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
  await expect(page.getByTestId('domain-summary-panel')).toContainText(domainName)
})
