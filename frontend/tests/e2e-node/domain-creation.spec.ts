import { expect, test } from '@playwright/test'
import { createDomainViaUi, prepareAuthenticatedPage, uniqueName } from './helpers'

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)
})

test('创建领域后进入领域画布', async ({ page }) => {
  const domainName = uniqueName('Playwright 领域草稿')
  await createDomainViaUi(page, domainName)

  await expect(page.getByTestId('domain-canvas-page')).toBeVisible()
  await expect(page.getByText('Cube 库')).toBeVisible()
  await expect(page.getByText(domainName, { exact: false })).toBeVisible()
  await expect(page.getByText('创建领域失败', { exact: false })).toHaveCount(0)
})
