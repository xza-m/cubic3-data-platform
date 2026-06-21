// frontend/tests/e2e-v2/p17-extraction-run-rerun.spec.ts
//
// Round 4 · R-001-P17d — 同步 Run 重跑 + 日志面板 happy path.
//
// Upstream changes that unblock this spec (all landed 2026-04-22):
//   • R-001-P17a  `重跑` 按钮（列表行 / PeekPanel 内 / 详情页）
//   • R-001-P17b  日志面板（PeekPanel 内，走 GET /extraction/runs/:id/logs）
//   • 后端 POST /extraction/runs/:id/rerun 已上线
//
// 覆盖点：
//   1. 列表渲染 + Peek 打开，日志面板从后端拉取三条日志
//   2. `失败` 状态允许重跑；点击 `重跑` 发 POST + 切到新 Run
//   3. `运行中` 状态禁用 `重跑`（runs_after_rerun 中 9002 为 running）

import { test, expect } from '@playwright/test'
import {
  gotoV2,
  installApiCatchAll,
  mockJsonRoute,
  prepareV2Page,
  envelope,
} from './helpers'
import exFx from './fixtures/extraction.json' with { type: 'json' }

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)

  // 默认列表（重跑前）：1 条 failed
  await mockJsonRoute(page, '**/api/v1/extraction/runs?**', envelope(exFx.runs))
  // 日志（带参数 & 不带参数都匹配）
  await mockJsonRoute(page, /\/api\/v1\/extraction\/runs\/9001\/logs/, envelope(exFx.logs))
  await mockJsonRoute(page, /\/api\/v1\/extraction\/runs\/9002\/logs/, envelope({ items: [], total: 0, page: 1, page_size: 50 }))
})

test('P17 同步 Run 日志可见 + 重跑 @p17', async ({ page }) => {
  // ── Arrange: 重跑 POST 返回 9002 + 之后列表切到 2 条 ─────────────────────
  let rerunPostCount = 0
  await page.route('**/api/v1/extraction/runs/9001/rerun', async (route) => {
    rerunPostCount += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope(exFx.rerun_result)),
    })
    // 一旦 rerun 成功，后续列表查询切到 runs_after_rerun
    await mockJsonRoute(page, '**/api/v1/extraction/runs?**', envelope(exFx.runs_after_rerun))
  })

  // ── Act: 进入 runs 列表 ─────────────────────────────────────────────────
  await gotoV2(page, '/data-center/sync/runs')

  // 渲染同步记录 9001 行 + 行内 `重跑` 按钮（对 failed 允许点击）
  const row9001 = page.getByText(/^记录 9001$/)
  await expect(row9001).toBeVisible()
  await expect(page.getByTestId('run-rerun-9001')).toBeEnabled()
  await expect(page.getByText('同步记录 undefined')).toHaveCount(0)

  // ── 打开 Peek，确认日志面板里能看到 INFO / WARNING / ERROR ───────────
  await row9001.click()

  const peek = page.getByRole('complementary', { name: '行预览' })
  await expect(peek).toBeVisible()

  const logList = peek.getByTestId('run-logs')
  await expect(logList).toBeVisible()
  await expect(logList.getByText('starting sync')).toBeVisible()
  await expect(logList.getByText('retry #1 due to timeout')).toBeVisible()
  await expect(logList.getByText('connection refused').first()).toBeVisible()
  await expect(logList.getByText('INFO', { exact: true })).toBeVisible()
  await expect(logList.getByText('WARNING', { exact: true })).toBeVisible()
  await expect(logList.getByText('ERROR', { exact: true })).toBeVisible()

  // ── Act: 点击 Peek 里的 `重跑` ─────────────────────────────────────────
  const peekRerunBtn = peek.getByTestId('run-rerun')
  await expect(peekRerunBtn).toBeEnabled()
  await peekRerunBtn.click()

  await expect.poll(() => rerunPostCount).toBe(1)

  // 列表自动刷新（useRerunExtractionRun invalidate 后重拉），出现同步记录 9002
  await expect(page.getByText(/^记录 9002$/)).toBeVisible({ timeout: 5000 })

  // 9002 对应的 `重跑` 按钮因为 running 而 disabled
  await expect(page.getByTestId('run-rerun-9002')).toBeDisabled()
})
