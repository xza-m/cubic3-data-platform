import { expect, test } from '@playwright/test'
import { gotoSemantic, prepareAuthenticatedPage, uniqueName } from './helpers'

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)
})

test('从物理表生成并保存 Cube 草稿', async ({ page }) => {
  const cubeTitle = uniqueName('Playwright Cube 草稿')

  await gotoSemantic(page, '/semantic/cubes/new')
  await expect(page.getByRole('heading', { name: '新建 Cube' })).toBeVisible()
  await page.locator('[data-testid^="schema-node-table-"]').first().waitFor({ timeout: 15_000 })
  await page.locator('[data-testid^="schema-node-table-"]').first().click()
  await page.getByTestId('cube-generate-draft').click()
  await expect(page.getByText('Cube 草稿已生成', { exact: false })).toBeVisible()
  await expect(page.getByText('Cube 草稿', { exact: true })).toBeVisible()
  await page.getByTestId('cube-draft-title').fill(cubeTitle)
  await page.getByTestId('cube-save-draft').click()
  await page.waitForURL(/\/semantic\/cubes\/[^/]+$/, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: cubeTitle })).toBeVisible()
  await expect(page.getByText('draft', { exact: true }).first()).toBeVisible()
})
