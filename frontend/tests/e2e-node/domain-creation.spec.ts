import { expect, test } from '@playwright/test'
import { createDomainViaUi, prepareAuthenticatedPage, uniqueName } from './helpers'

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)
})

test('创建领域后进入领域画布', async ({ page }) => {
  const domainName = uniqueName('Playwright 领域草稿')
  await createDomainViaUi(page, domainName)

  await expect(page.getByRole('heading', { name: '领域设计' })).toBeVisible()
  await expect(page.getByTestId('domain-inspector-panel').getByText(domainName, { exact: false })).toBeVisible()
  await expect(page.getByText('草稿', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('创建领域失败', { exact: false })).toHaveCount(0)
})
