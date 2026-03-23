import { expect, test } from '@playwright/test'
import { ensureCubeAvailable, gotoSemantic, prepareAuthenticatedPage } from './helpers'

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)
})

test('在开发工具中切换资源与工作区标签', async ({ page }) => {
  await gotoSemantic(page, '/semantic/tools')
  await expect(page.getByRole('heading', { name: '开发工具' })).toBeVisible()

  let firstEditableResource = page.locator('[data-testid^="semantic-resource-item-cube-"]').first()
  if (await firstEditableResource.count() === 0) {
    firstEditableResource = page.locator('[data-testid^="semantic-resource-item-view-"]').first()
  }
  if (await firstEditableResource.count() === 0) {
    await ensureCubeAvailable(page)
    await gotoSemantic(page, '/semantic/tools')
    await expect(page.getByRole('heading', { name: '开发工具' })).toBeVisible()
    firstEditableResource = page.locator('[data-testid^="semantic-resource-item-cube-"]').first()
  }

  await expect(firstEditableResource).toBeVisible()
  await firstEditableResource.click()

  await expect(page.getByTestId('devtools-workspace-header')).toContainText('Workspace')
  await expect(page.getByTestId('yaml-editor-tab')).toBeVisible()

  await page.getByTestId('devtools-tab-compiler').click()
  await expect(page.getByText('DSL 输入', { exact: true })).toBeVisible()

  await page.getByTestId('devtools-tab-sync').click()
  await expect(page.getByText('Schema Drift 定义', { exact: true })).toBeVisible()
})
