import { expect, test } from '@playwright/test'
import { prepareAuthenticatedPage } from './helpers'

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)
})

test('平台壳层支持模块导航', async ({ page }) => {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /欢迎回来/ })).toBeVisible()
  await expect(page.getByText('数据健康')).toBeVisible()

  const sidebar = page.getByTestId('app-shell-sidebar')
  const datasourceButton = sidebar.getByRole('button', { name: /^数据源$/ })

  if (!(await datasourceButton.isVisible())) {
    await sidebar.getByRole('button', { name: /^数据中心$/ }).click()
  }

  await datasourceButton.click()
  await expect(page).toHaveURL(/\/data-center\/datasources$/)
})
