import { expect, test } from '@playwright/test'
import { ensureCubeAvailable, gotoSemantic, prepareAuthenticatedPage } from './helpers'

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)
})

test('在 Cube 管理中浏览资产并进入工作台对象态', async ({ page }) => {
  await ensureCubeAvailable(page)
  await gotoSemantic(page, '/semantic/cubes')
  await expect(page.getByRole('heading', { name: 'Cube 管理' })).toBeVisible()

  const multiDomainItem = page.locator('div').filter({ hasText: '多领域引用' }).first()
  if (await multiDomainItem.count()) {
    await expect(multiDomainItem).toBeVisible()
  }

  const emptyState = page.getByText('没有命中当前条件的 Cube', { exact: false })
  if (await emptyState.isVisible().catch(() => false)) {
    await gotoSemantic(page, '/semantic/cubes?status=all')
    await expect(page.getByRole('heading', { name: 'Cube 管理' })).toBeVisible()
  }

  const firstViewButton = page.getByRole('button', { name: '查看' }).first()
  await expect(firstViewButton).toBeVisible()
  await firstViewButton.click()

  const workbenchLink = page.getByRole('link', { name: /工作台/ }).first()
  await expect(workbenchLink).toBeVisible()
  await workbenchLink.click()

  await expect(page).toHaveURL(/\/semantic\/workbench\?cube=.*&tab=(preview|modeling)$/)
  await expect(page.getByRole('heading', { name: '语义工作台' })).toBeVisible()
})
