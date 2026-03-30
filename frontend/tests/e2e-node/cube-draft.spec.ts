import { expect, test } from '@playwright/test'
import { gotoSemantic, prepareAuthenticatedPage, selectFirstSchemaTable, uniqueName } from './helpers'

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)
})

test('从物理表生成并保存 Cube 草稿', async ({ page }) => {
  const cubeName = `playwright_cube_${Date.now()}`
  const cubeTitle = uniqueName('Playwright Cube 草稿')

  await gotoSemantic(page, '/semantic/cubes/new')
  await expect(page.locator('h1').filter({ hasText: '新建 Cube' }).first()).toBeVisible()
  await selectFirstSchemaTable(page)
  await page.getByTestId('cube-generate-draft').click()
  await expect(page.getByText('Cube 草稿已生成', { exact: true }).first()).toBeVisible()
  await page.getByTestId('cube-draft-name').fill(cubeName)
  await page.getByTestId('cube-draft-title').fill(cubeTitle)
  await page.getByTestId('cube-banner-save-draft').click()
  await page.waitForURL(new RegExp(`/semantic/cubes/${cubeName}$`), { timeout: 15_000 })
  await expect(page.getByRole('link', { name: '编辑基础信息' })).toBeVisible()
  await expect(page.locator(`input[value="${cubeTitle}"]`).first()).toBeVisible()
  await expect(page.getByText('草稿', { exact: true }).first()).toBeVisible()
})
