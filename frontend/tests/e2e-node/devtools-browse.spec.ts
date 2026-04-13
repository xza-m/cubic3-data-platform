import { expect, test } from '@playwright/test'
import { ensureCubeAvailable, gotoSemantic, prepareAuthenticatedPage } from './helpers'

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)
})

test('在语义工作台中切换三栏建模分区与高级视图', async ({ page }) => {
  await gotoSemantic(page, '/semantic/tools')
  await expect(page).toHaveURL(/\/semantic\/workbench(?:\?.*)?$/)
  await expect(page.getByText('语义工作台')).toBeVisible()
  await expect(page.getByTestId('semantic-resource-pane')).toBeVisible()
  await expect(page.getByTestId('semantic-main-pane')).toBeVisible()
  await expect(page.getByTestId('semantic-inspector-pane')).toBeVisible()

  await ensureCubeAvailable(page)
  const firstViewButton = page.getByRole('button', { name: '查看详情' }).first()
  await expect(firstViewButton).toBeVisible()
  await firstViewButton.click()
  await page.getByRole('link', { name: /工作台/ }).first().click()

  await expect(page).toHaveURL(/\/semantic\/workbench\?cube=.*&tab=(preview|modeling)$/)
  const currentCubeName = new URL(page.url()).searchParams.get('cube')
  await expect(page.getByTestId('semantic-workbench-title')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Measures' })).toBeVisible()

  await page.getByRole('button', { name: 'Measures' }).click()
  await expect(page.getByLabel('Measure name')).toBeVisible()

  await page.getByRole('button', { name: 'Dimensions' }).click()
  await expect(page.getByLabel('Dimension name')).toBeVisible()

  await page.getByRole('button', { name: '代码' }).click()
  await expect(page.getByTestId('yaml-editor-tab')).toBeVisible()

  await gotoSemantic(page, `/semantic/workbench?cube=${currentCubeName}&tab=python`)
  await expect(page.getByText('Python 实现预览')).toBeVisible()
})
