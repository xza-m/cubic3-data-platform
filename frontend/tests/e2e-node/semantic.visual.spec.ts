import { expect, test, type Page } from '@playwright/test'
import { ensureCubeAvailable, gotoSemantic, prepareAuthenticatedPage } from './helpers'

const WORKBENCH_CUBES_FIXTURE = {
  data: {
    cubes: [
      {
        name: 'fixture_cube_draft',
        title: 'Playwright Cube 草稿 01',
        description: '视觉基线固定夹具',
        table: 'answer_records',
        domain_ids: [],
        domains: [],
        domain_count: 0,
        dimensions: [],
        measures: [],
        dimension_count: 3,
        measure_count: 3,
        status: 'draft',
        state_summary: {
          sync_status: 'warn',
        },
      },
      {
        name: 'fixture_cube_active',
        title: 'Playwright Cube 已发布 01',
        description: '视觉基线固定夹具',
        table: 'answer_records',
        domain_ids: [],
        domains: [],
        domain_count: 0,
        dimensions: [],
        measures: [],
        dimension_count: 4,
        measure_count: 2,
        status: 'active',
        state_summary: {
          sync_status: 'ok',
        },
      },
    ],
    total: 2,
  },
}

async function mockWorkbenchVisualApis(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname === '/api/v1/semantic/catalogs') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            catalogs: [],
            total: 0,
          },
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/semantic/domains') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            domains: [],
            total: 0,
          },
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/semantic/cubes') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(WORKBENCH_CUBES_FIXTURE),
      })
      return
    }

    if (url.pathname === '/api/v1/semantic/views') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            views: [],
            total: 0,
          },
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/semantic/recipes') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            recipes: [],
            total: 0,
          },
        }),
      })
      return
    }

    await route.continue()
  })
}

test.beforeEach(async ({ page }) => {
  await prepareAuthenticatedPage(page)
})

test('领域目录首屏视觉基线', async ({ page }) => {
  await gotoSemantic(page, '/semantic/domains')
  await expect(page).toHaveURL(/\/semantic\/domains\/.+/)
  await expect(page.getByTestId('domain-canvas-page')).toBeVisible()
  await expect(page.getByRole('button', { name: '领域目录' })).toBeVisible()
  await expect(page).toHaveScreenshot('semantic-domain-management.png', { fullPage: true, maxDiffPixelRatio: 0.02 })
})

test('领域设计首屏视觉基线', async ({ page }) => {
  await gotoSemantic(page, '/semantic/domains/academic')
  await expect(page.getByTestId('domain-canvas-page')).toBeVisible()
  await expect(page.getByText('Cube 库')).toBeVisible()
  await expect(page).toHaveScreenshot('semantic-domain-design.png', { fullPage: true })
})

test('Cube 管理首屏视觉基线', async ({ page }) => {
  await ensureCubeAvailable(page)
  await gotoSemantic(page, '/semantic/cubes')
  await expect(page.getByRole('heading', { name: 'Cube 管理' })).toBeVisible()
  await expect(page).toHaveScreenshot('semantic-cube-management.png', { fullPage: true, maxDiffPixels: 200 })
})

test('Cube 工作台首屏视觉基线', async ({ page }) => {
  await mockWorkbenchVisualApis(page)
  await gotoSemantic(page, '/semantic/workbench')
  await expect(page.getByRole('heading', { name: '语义工作台' })).toBeVisible()
  await expect(page.getByText('Playwright Cube 草稿 01')).toBeVisible()
  await expect(page.getByText('Playwright Cube 已发布 01')).toBeVisible()
  await expect(page).toHaveScreenshot('semantic-cube-design.png', { fullPage: true })
})

test('View 详情首屏视觉基线', async ({ page }) => {
  await gotoSemantic(page, '/semantic/views/student_answer_analysis')
  await expect(page.getByTestId('view-related-cubes')).toBeVisible()
  await expect(page).toHaveScreenshot('semantic-view-detail.png', { fullPage: true, maxDiffPixels: 220 })
})

test('开发工具 Recipe 工作区视觉基线', async ({ page }) => {
  await gotoSemantic(page, '/semantic/tools?kind=recipe&resource=answer_accuracy_by_subject&file=answer_accuracy_by_subject')
  await expect(page).toHaveURL(/\/semantic\/workbench\?/)
  await expect(page.getByRole('heading', { name: '语义工作台' })).toBeVisible()
  await expect(page.getByTestId('yaml-editor-tab')).toBeVisible()
  await expect(page).toHaveScreenshot('semantic-devtools.png', {
    maxDiffPixels: 200,
    caret: 'hide',
    mask: [page.locator('.monaco-editor')],
  })
})
