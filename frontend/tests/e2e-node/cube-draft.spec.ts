import { expect, test } from '@playwright/test'
import { gotoSemantic, prepareAuthenticatedPage, selectFirstSchemaTable, uniqueName } from './helpers'

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)
})

test('Cube 草稿链路从语义工作台起步', async ({ page }) => {
  const cubeName = `playwright_cube_${Date.now()}`
  const cubeTitle = uniqueName('Playwright Cube 草稿')

  await gotoSemantic(page, '/semantic/workbench')
  await expect(page).toHaveURL(/\/semantic\/workbench(?:\?.*)?$/)
  await expect(page.getByRole('heading', { name: '语义工作台' })).toBeVisible()
  await expect(page.getByText('AI 辅助建模', { exact: true }).first()).toBeVisible()
  const generateDraftButton = page.getByTestId('cube-generate-draft')
  const saveDraftButton = page.getByTestId('cube-banner-save-draft')
  await expect(generateDraftButton).toBeDisabled()

  await selectFirstSchemaTable(page)
  await expect(generateDraftButton).toBeEnabled()
  await generateDraftButton.click()
  await expect(page.getByText('Cube 草稿已生成', { exact: true }).first()).toBeVisible()

  await page.getByTestId('cube-draft-name').fill(cubeName)
  await page.getByTestId('cube-draft-title').fill(cubeTitle)
  await saveDraftButton.click()

  await page.waitForURL(new RegExp(`/semantic/workbench\\?cube=${cubeName}&tab=modeling$`), { timeout: 15_000 })
  await expect(page.getByTestId('devtools-tab-modeling')).toHaveAttribute('data-state', 'active')
  await expect(page.getByRole('link', { name: '发布' })).toBeVisible()
  await expect(page.getByText(cubeTitle, { exact: true })).toBeVisible()
  await expect(page.getByText('草稿', { exact: true }).first()).toBeVisible()
})
