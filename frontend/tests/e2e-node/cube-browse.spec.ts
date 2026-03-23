import { expect, test } from '@playwright/test'
import { gotoSemantic, prepareAuthenticatedPage } from './helpers'

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)
})

test('在 Cube 管理中浏览模型并进入设计页', async ({ page }) => {
  await gotoSemantic(page, '/semantic/cubes')
  await expect(page.getByRole('heading', { name: 'Cube 管理' })).toBeVisible()

  const firstItem = page.locator('[data-testid^="cube-management-item-"]').first()
  await expect(firstItem).toBeVisible()
  await firstItem.locator('[data-testid^="cube-open-design-"]').first().click()

  await expect(page.getByRole('heading', { name: 'Cube 设计' }).or(page.getByRole('heading', { name: '新建 Cube' }))).toBeVisible()
})
