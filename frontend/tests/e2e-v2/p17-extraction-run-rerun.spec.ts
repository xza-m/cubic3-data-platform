// frontend/tests/e2e-v2/p17-extraction-run-rerun.spec.ts
//
// P17 — 抽取 Run 详情 日志面板 + 重跑 happy path.
//
// FIXME(W4.C): rerun button is delivered by W3.C and the precise data-testid
// is WIP. Lift once W3.C merges.

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import exFx from './fixtures/extraction.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/data-center/extraction-runs?**', envelope(exFx.runs))
  await mockJsonRoute(page, '**/api/v1/data-center/extraction-runs/9001', envelope(exFx.run_detail))
  await mockJsonRoute(page, '**/api/v1/data-center/extraction-runs/9001/logs**', envelope({ items: exFx.run_detail.logs, total: 2 }))
  await mockJsonRoute(page, '**/api/v1/data-center/extraction-tasks/201/execute', envelope({ run_id: 9002 }))
})

// FIXME(W5.G-blocked): `ExtractionRunDetailContent` does not render a
//   logs panel and exposes no "重跑" button. Both pieces of UI need to
//   ship before this spec can assert anything beyond P18 (the jump-to-task
//   slice that already exists).
test.fixme('P17 抽取Run 日志可见 + 重跑 @p17', async ({ page }) => {
  await gotoV2(page, '/extraction/runs/9001')
  await expect(page.getByText('学习行为抽取').first()).toBeVisible()
})
