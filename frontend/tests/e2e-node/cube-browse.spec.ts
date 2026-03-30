import { expect, test } from '@playwright/test'
import { ensureCubeAvailable, getFirstCubeNameFromManagement, gotoSemantic, prepareAuthenticatedPage } from './helpers'

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)
})

test('在 Cube 管理中浏览模型并进入关系画布', async ({ page }) => {
  await ensureCubeAvailable(page)
  await gotoSemantic(page, '/semantic/cubes')
  await expect(page.getByRole('heading', { name: 'Cube 管理' })).toBeVisible()

  const multiDomainItem = page.locator('div').filter({ hasText: '多领域引用' }).first()
  if (await multiDomainItem.count()) {
    await expect(multiDomainItem).toBeVisible()
  }

  const cubeName = await getFirstCubeNameFromManagement(page)
  await gotoSemantic(page, `/semantic/cubes/${cubeName}`)

  await expect(page).toHaveURL(new RegExp(`/semantic/cubes/${cubeName}/edit$`))
  await expect(page.getByRole('heading', { name: '编辑 Cube' })).toBeVisible()
})
