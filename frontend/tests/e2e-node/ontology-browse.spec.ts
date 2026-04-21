import { expect, test } from '@playwright/test'
import { gotoSemantic, prepareAuthenticatedPage } from './helpers'

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)
})

test('本体工作台展示 OWV2 对象壳层、对象详情和索引页结构', async ({ page }) => {
  await gotoSemantic(page, '/semantic/ontology')

  const workbenchHeader = page.locator('header').filter({ hasText: '本体工作台' }).last()
  await expect(workbenchHeader.getByText('语义中心 / 本体工作台 / 对象列表', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '对象列表' })).toBeVisible()
  await expect(page.getByPlaceholder('搜索对象...')).toBeVisible()
  await expect(page.getByRole('button', { name: '+ 新建对象' })).toBeVisible()
  await expect(page.getByText('选择对象查看详情', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '+ 新建对象' }).click()
  await expect(page.getByText('新建对象', { exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '对象定义' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '字段列表' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '关系图' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '规则' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '历史' })).toBeVisible()
  await expect(page.getByText('聚合根配置', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '业务指标索引' }).click()
  await expect(workbenchHeader.getByText('语义中心 / 本体工作台 / 业务指标索引', { exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('搜索指标...')).toBeVisible()
  await expect(page.getByText('指标列表', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '关系索引' }).click()
  await expect(workbenchHeader.getByText('语义中心 / 本体工作台 / 关系索引', { exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('搜索关系...')).toBeVisible()
  await expect(page.getByText('关系列表', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '规则与治理' }).click()
  await expect(workbenchHeader.getByText('语义中心 / 本体工作台 / 规则与治理', { exact: true })).toBeVisible()
  await expect(page.getByText('规则列表', { exact: true })).toBeVisible()
})
