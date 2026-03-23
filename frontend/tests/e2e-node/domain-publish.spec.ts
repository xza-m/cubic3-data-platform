import { expect, test } from '@playwright/test'
import {
  createDomainViaUi,
  dragLibraryCubeToCanvas,
  prepareAuthenticatedPage,
  uniqueName,
} from './helpers'

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)
})

test('拖入 Cube 后发布领域', async ({ page }) => {
  const domainName = uniqueName('Playwright 领域发布')
  await createDomainViaUi(page, domainName)

  await expect(page.getByRole('heading', { name: '领域设计' })).toBeVisible()
  const cubes = page.locator('[data-testid^="domain-library-cube-"]')
  await expect(cubes.first()).toBeVisible()
  const cubeCount = await cubes.count()
  expect(cubeCount).toBeGreaterThan(0)

  const usedIndexes = new Set<number>()
  let dragIndex = Date.now() % cubeCount
  usedIndexes.add(dragIndex)
  await dragLibraryCubeToCanvas(page, dragIndex)

  let published = false
  for (let attempt = 0; attempt < Math.min(3, cubeCount); attempt += 1) {
    const responsePromise = page.waitForResponse((response) => {
      return response.url().includes('/publish') && response.request().method() === 'POST'
    })
    await page.getByTestId('publish-domain-button').click()
    const response = await responsePromise
    const payload = await response.json()

    if (response.ok() && payload?.data?.status === 'active') {
      published = true
      break
    }

    const message = String(payload?.message || payload?.error || '')
    if (!message.includes('结构完全重复')) {
      throw new Error(`领域发布返回异常: ${message || response.status()}`)
    }

    const nextIndex = Array.from({ length: cubeCount }, (_, index) => index).find((index) => !usedIndexes.has(index))
    if (nextIndex === undefined) {
      throw new Error('领域发布因重复结构被拦截，且没有更多 Cube 可用于生成唯一结构')
    }
    usedIndexes.add(nextIndex)
    dragIndex = nextIndex
    await dragLibraryCubeToCanvas(page, dragIndex)
  }

  expect(published).toBe(true)
  await expect(page.getByText('领域画布已就绪', { exact: false })).toBeVisible()
  await expect(page.getByText('发布失败', { exact: false })).toHaveCount(0)
})
