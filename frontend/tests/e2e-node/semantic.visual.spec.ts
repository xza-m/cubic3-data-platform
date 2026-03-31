import { expect, test, type Page } from '@playwright/test'
import { ensureCubeAvailable, gotoSemantic, prepareAuthenticatedPage } from './helpers'

const CUBE_DESIGN_DATASOURCE_FIXTURE = {
  data: {
    items: [
      {
        id: 17,
        name: 'test_pg_17',
        source_type: 'postgresql',
        description: '视觉基线固定夹具',
        is_active: true,
      },
    ],
  },
}

const CUBE_DESIGN_GRAPH_FIXTURE = {
  data: {
    nodes: Array.from({ length: 12 }, (_, index) => ({
      id: `fixture_cube_${index + 1}`,
      title: `Playwright Cube 草稿 ${String(index + 1).padStart(2, '0')}`,
      type: index % 3 === 0 ? 'fact' : 'dimension',
      dimensions: 3,
      measures: 3,
      status: 'draft',
      source_id: 17,
      source_binding_summary: {
        source_name: 'test_pg_17',
        source_type: 'postgresql',
        database: 'appdb',
        schema: 'public',
      },
      state_summary: {
        sync_status: 'ok',
      },
    })),
    edges: [],
  },
}

async function mockCubeDesignVisualApis(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname === '/api/v1/data-center/datasources') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CUBE_DESIGN_DATASOURCE_FIXTURE),
      })
      return
    }

    if (url.pathname === '/api/v1/semantic/graph') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CUBE_DESIGN_GRAPH_FIXTURE),
      })
      return
    }

    if (url.pathname === '/api/v1/data-center/datasources/17/databases') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: ['appdb', 'shop_db'],
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/data-center/datasources/17/schemas') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
        }),
      })
      return
    }

    if (url.pathname === '/api/v1/data-center/datasources/17/tables') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
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

test('Cube 设计首屏视觉基线', async ({ page }) => {
  await mockCubeDesignVisualApis(page)
  await gotoSemantic(page, '/semantic/cubes/new')
  await expect(page.getByRole('heading', { name: '新建 Cube' })).toBeVisible()
  await expect(page.getByText('Playwright Cube 草稿 01')).toBeVisible()
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
