// frontend/tests/e2e-v2/visual/v2-visual.spec.ts
//
// W5.F — Round 3 visual baseline for the v2 (redesign) frontend.
//
// Replaces the legacy `tests/e2e-node/platform.visual.spec.ts` and
// `tests/e2e-node/semantic.visual.spec.ts`, which were authored against the
// pre-redesign UI (different headings, routes, markup) and are no longer
// representative of what users see.
//
// Coverage (5 first-impression screens):
//   V01  /dashboard
//   V02  /data-center/connections
//   V03  /semantic/cubes
//   V04  /semantic/ontology/objects
//   V05  /settings
//
// Conventions:
//   - All API traffic is mocked via `installApiCatchAll` + `mockJsonRoute`.
//     We never depend on a live backend in this suite.
//   - Date.now() is frozen via `freezeClock` for any page that renders
//     relative timestamps (e.g. Cube list — `fmtRelative`).
//   - Each test waits for a stable, semantically meaningful element BEFORE
//     snapshotting so we never race the React tree.
//   - `animations: 'disabled'` and `caret: 'hide'` are passed explicitly so
//     the assertion is robust even if the global config is changed.

import { test, expect, type Page } from '@playwright/test'
import {
  envelope,
  gotoV2,
  installApiCatchAll,
  mockJsonRoute,
  prepareV2Page,
} from '../helpers'
import dsFx from '../fixtures/datasources.json' with { type: 'json' }
import dsetFx from '../fixtures/datasets.json' with { type: 'json' }
import ontoFx from '../fixtures/ontology.json' with { type: 'json' }
import prefFx from '../fixtures/preferences.json' with { type: 'json' }

// Frozen clock: any `new Date()` / `Date.now()` returns this instant.
// Pinned a few hours into 2026-04-21 so cube `updated_at` values from
// 2026-04-15 etc. produce stable relative strings ("6 days ago").
const FROZEN_NOW_ISO = '2026-04-21T10:00:00+08:00'

async function freezeClock(page: Page, isoInstant: string): Promise<void> {
  await page.addInitScript((iso: string) => {
    const fixedTime = new Date(iso).valueOf()
    const RealDate = Date

    class MockDate extends RealDate {
      constructor(...args: ConstructorParameters<DateConstructor>) {
        if (args.length === 0) {
          super(fixedTime)
          return
        }
        super(...(args as [number]))
      }

      static now() {
        return fixedTime
      }
    }

    Object.defineProperty(MockDate, 'parse', { value: RealDate.parse })
    Object.defineProperty(MockDate, 'UTC', { value: RealDate.UTC })
    Object.defineProperty(MockDate, Symbol.hasInstance, {
      value: (instance: unknown) => instance instanceof RealDate,
    })
    ;(window as unknown as { Date: DateConstructor }).Date = MockDate as unknown as DateConstructor
  }, isoInstant)
}

// Shared snapshot options. `caret: 'hide'` avoids blinking text caret diff
// in any auto-focused input; `animations: 'disabled'` is a belt-and-braces
// guarantee on top of `playwright.config.ts`.
const SHOT_OPTS = {
  fullPage: true as const,
  maxDiffPixels: 220,
  animations: 'disabled' as const,
  caret: 'hide' as const,
}

// ── V01  /dashboard ──────────────────────────────────────────────────────────

const dashboardOverview = {
  stats: {
    datasource_total: 12,
    dataset_total: 87,
    semantic_model_total: 34,
    today_query_count: 218,
  },
  trends: {
    datasource_month_delta: 3,
    dataset_week_delta: 9,
    query_count_week: 1240,
  },
  health: {
    datasource_connectivity: 0.98,
    semantic_coverage: 0.86,
    query_success_rate: 0.94,
  },
  recent_queries: [
    {
      id: 1,
      name: '日活按学段',
      datasource_name: '教学 PostgreSQL',
      status: 'success',
      executed_at: '2026-04-21T09:30:00+08:00',
    },
    {
      id: 2,
      name: '答题失败率',
      datasource_name: '教学 PostgreSQL',
      status: 'failed',
      executed_at: '2026-04-21T09:10:00+08:00',
    },
    {
      id: 3,
      name: 'AI 课完课率',
      datasource_name: '学习行为仓',
      status: 'running',
      executed_at: '2026-04-21T09:00:00+08:00',
    },
  ],
}

test('V01 /dashboard 视觉基线 @visual', async ({ page }) => {
  await freezeClock(page, FROZEN_NOW_ISO)
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/access/me/preferences', envelope(prefFx.default))
  await mockJsonRoute(page, '**/api/v1/dashboard/overview', envelope(dashboardOverview))

  await gotoV2(page, '/dashboard')

  await expect(
    page.getByRole('heading', { name: /语义优先的数据工作台/ }),
  ).toBeVisible()
  await expect(page.getByText('日活按学段')).toBeVisible()
  await expect(page.getByText('98%')).toBeVisible()

  await expect(page).toHaveScreenshot('v01-dashboard.png', SHOT_OPTS)
})

// ── V02  /data-center/connections ────────────────────────────────────────────

test('V02 /data-center/connections 视觉基线 @visual', async ({ page }) => {
  await freezeClock(page, FROZEN_NOW_ISO)
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/access/me/preferences', envelope(prefFx.default))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources/types', envelope(dsFx.types))
  // Match both `?page=...` query strings and a bare URL.
  await mockJsonRoute(page, '**/api/v1/data-center/datasources?**', envelope(dsFx.list))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources', envelope(dsFx.list))
  await mockJsonRoute(page, '**/api/v1/data-center/datasets?**', envelope(dsetFx.list))
  await mockJsonRoute(page, '**/api/v1/data-center/datasources/1', envelope(dsFx.detail))

  await gotoV2(page, '/data-center/connections')

  // Page has no <h1>; assert on a row + on the search placeholder which is a
  // stable structural element.
  await expect(page.getByText('教学 PostgreSQL').first()).toBeVisible()
  await expect(page.getByPlaceholder('搜索连接名称、类型或描述…')).toBeVisible()

  await expect(page).toHaveScreenshot('v02-data-center-connections.png', SHOT_OPTS)
})

// ── V03  /semantic/cubes ─────────────────────────────────────────────────────

const cubesList = {
  cubes: [
    {
      name: 'fct_lesson',
      title: '课程事实',
      datasource_name: '教学 PostgreSQL',
      domain_name: '教学域',
      status: 'active',
      dimensions_count: 6,
      measures_count: 4,
      updated_at: '2026-04-15T08:00:00+08:00',
    },
    {
      name: 'fct_exam',
      title: '考试事实',
      datasource_name: '教学 PostgreSQL',
      domain_name: '教学域',
      status: 'draft',
      dimensions_count: 5,
      measures_count: 3,
      updated_at: '2026-04-10T08:00:00+08:00',
    },
    {
      name: 'fct_homework',
      title: '作业事实',
      datasource_name: '教学 PostgreSQL',
      domain_name: '教学域',
      status: 'review',
      dimensions_count: 4,
      measures_count: 3,
      updated_at: '2026-04-05T08:00:00+08:00',
    },
  ],
  total: 3,
  page: 1,
}

test('V03 /semantic/cubes 视觉基线 @visual', async ({ page }) => {
  await freezeClock(page, FROZEN_NOW_ISO)
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/access/me/preferences', envelope(prefFx.default))
  await mockJsonRoute(page, '**/api/v1/semantic/cubes**', envelope(cubesList))

  await gotoV2(page, '/semantic/cubes')

  // PipelineHero header is the most stable text on first paint.
  await expect(page.getByText('双层语义建模')).toBeVisible()
  await expect(page.getByText('课程事实')).toBeVisible()

  await expect(page).toHaveScreenshot('v03-semantic-cubes.png', SHOT_OPTS)
})

// ── V04  /semantic/ontology/objects ──────────────────────────────────────────

test('V04 /semantic/ontology/objects 视觉基线 @visual', async ({ page }) => {
  await freezeClock(page, FROZEN_NOW_ISO)
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/access/me/preferences', envelope(prefFx.default))
  await mockJsonRoute(page, '**/api/v1/ontology/objects', envelope(ontoFx.objects))
  await mockJsonRoute(page, '**/api/v1/ontology/objects/student', envelope(ontoFx.object_detail))

  await gotoV2(page, '/semantic/ontology/objects')

  await expect(page.getByText('业务对象').first()).toBeVisible()
  await expect(page.getByText('学生').first()).toBeVisible()

  await expect(page).toHaveScreenshot('v04-ontology-objects.png', SHOT_OPTS)
})

// ── V05  /settings ───────────────────────────────────────────────────────────

test('V05 /settings 视觉基线 @visual', async ({ page }) => {
  await freezeClock(page, FROZEN_NOW_ISO)
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/access/me/preferences', envelope(prefFx.default))

  await gotoV2(page, '/settings')

  await expect(page.getByRole('heading', { name: '我的偏好' })).toBeVisible()

  await expect(page).toHaveScreenshot('v05-settings.png', SHOT_OPTS)
})
