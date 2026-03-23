import { expect, test } from '@playwright/test'
import { gotoSemantic, prepareAuthenticatedPage } from './helpers'

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)
})

test('领域目录首屏视觉基线', async ({ page }) => {
  await gotoSemantic(page, '/semantic/domains')
  await expect(page.getByRole('heading', { name: '领域目录' })).toBeVisible()
  await expect(page).toHaveScreenshot('semantic-domain-management.png', { fullPage: true, maxDiffPixels: 150 })
})

test('领域设计首屏视觉基线', async ({ page }) => {
  await gotoSemantic(page, '/semantic/domains/academic')
  await expect(page.getByRole('heading', { name: '领域设计' })).toBeVisible()
  await expect(page).toHaveScreenshot('semantic-domain-design.png', { fullPage: true })
})

test('Cube 管理首屏视觉基线', async ({ page }) => {
  await gotoSemantic(page, '/semantic/cubes')
  await expect(page.getByRole('heading', { name: 'Cube 管理' })).toBeVisible()
  await expect(page).toHaveScreenshot('semantic-cube-management.png', { fullPage: true, maxDiffPixels: 200 })
})

test('Cube 设计首屏视觉基线', async ({ page }) => {
  await gotoSemantic(page, '/semantic/cubes/new')
  await expect(page.getByRole('heading', { name: '新建 Cube' })).toBeVisible()
  await expect(page).toHaveScreenshot('semantic-cube-design.png', { fullPage: true })
})
