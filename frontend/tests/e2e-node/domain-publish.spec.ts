import { expect, test, type Page, type Response } from '@playwright/test'
import {
  createUniqueCubeForDomain,
  createDomainViaUi,
  dragLibraryCubeToCanvas,
  prepareAuthenticatedPage,
  uniqueName,
} from './helpers'

async function readJsonSafely(response: Response) {
  try {
    const raw = await response.text()
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

async function readPublishMessage(page: Page, payload: Record<string, unknown> | null, response: Response) {
  const failureToast = page.getByText('发布失败', { exact: false }).first()
  const toastText = (await failureToast.textContent().catch(() => '')) || ''
  return String(payload?.message || payload?.error || toastText || response.status())
}

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)
})

test('拖入 Cube 后发布领域', async ({ page }) => {
  const uniqueCubeName = await createUniqueCubeForDomain(page)
  const domainName = uniqueName('qa-domain-publish 领域发布')
  await createDomainViaUi(page, domainName)

  await expect(page.getByTestId('domain-canvas-page')).toBeVisible()
  const targetCube = page.getByTestId(`domain-library-cube-${uniqueCubeName}`)
  let published = false

  if (await targetCube.isVisible().catch(() => false)) {
    const targetIndex = await targetCube.evaluate((node) => {
      const siblings = Array.from(node.parentElement?.querySelectorAll('[data-testid^="domain-library-cube-"]') || [])
      return siblings.indexOf(node as HTMLElement)
    })
    expect(targetIndex).toBeGreaterThanOrEqual(0)
    await dragLibraryCubeToCanvas(page, targetIndex)
  } else {
    const cubes = page.locator('[data-testid^="domain-library-cube-"]')
    await expect(cubes.first()).toBeVisible()
    const cubeCount = await cubes.count()
    expect(cubeCount).toBeGreaterThan(0)

    const usedIndexes = new Set<number>()
    let dragIndex = Date.now() % cubeCount
    usedIndexes.add(dragIndex)
    await dragLibraryCubeToCanvas(page, dragIndex)

    for (let attempt = 0; attempt < cubeCount; attempt += 1) {
      const responsePromise = page.waitForResponse((response) => {
        return response.url().includes('/publish') && response.request().method() === 'POST'
      })
      await page.getByRole('button', { name: '保存' }).click()
      const response = await responsePromise
      const payload = await readJsonSafely(response)
      const successToast = page.getByText('领域 YAML 发布成功', { exact: true })

      if (response.ok() && (payload?.data?.status === 'active' || (await successToast.isVisible().catch(() => false)))) {
        published = true
        break
      }

      const message = await readPublishMessage(page, payload, response)
      if (!message.includes('结构完全重复')) {
        throw new Error(`领域发布返回异常: ${message || response.status()}`)
      }

      const nextIndex = Array.from({ length: cubeCount }, (_, index) => index).find((index) => !usedIndexes.has(index))
      if (nextIndex === undefined) {
        await expect(page.getByText('结构完全重复', { exact: false })).toBeVisible()
        return
      }
      usedIndexes.add(nextIndex)
      dragIndex = nextIndex
      await dragLibraryCubeToCanvas(page, dragIndex)
    }
  }

  if (!published) {
    const responsePromise = page.waitForResponse((response) => {
      return response.url().includes('/publish') && response.request().method() === 'POST'
    })
    await page.getByRole('button', { name: '保存' }).click()
    const response = await responsePromise
    const payload = await readJsonSafely(response)
    if (!response.ok() || payload?.data?.status !== 'active') {
      const message = await readPublishMessage(page, payload, response)
      if (message.includes('结构完全重复')) {
        await expect(page.getByText('结构完全重复', { exact: false })).toBeVisible()
        return
      }
      throw new Error(`领域发布返回异常: ${message || response.status()}`)
    }
  }

  await expect(page.getByText('领域 YAML 发布成功', { exact: true })).toBeVisible()
  await expect(page.getByText('发布失败', { exact: false })).toHaveCount(0)
})
