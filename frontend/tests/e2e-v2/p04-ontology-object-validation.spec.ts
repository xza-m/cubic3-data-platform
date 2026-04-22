// frontend/tests/e2e-v2/p04-ontology-object-validation.spec.ts
//
// P4 — 本体对象编辑 Tab（Round 4 · R-001-P04）
//
// 覆盖：
//   1. 编辑页路由可达（/objects/:name/edit），表单回填当前值
//   2. 字段级校验：清空必填"显示名称"触发内联错误
//   3. 撤销全部：把表单恢复到 baseline
//   4. 字段变更对比面板：修改前后 diff 可见
//   5. 保存：POST /ontology/objects 幂等 upsert，成功后 toast + 跳回详情页

import { test, expect } from '@playwright/test'
import { gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page, envelope } from './helpers'
import ontFx from './fixtures/ontology.json' with { type: 'json' }

// overview 的最小可渲染骨架（ObjectDetail 渲染需要它，否则 OntologyObjectContent 会因字段缺失 crash）。
const OVERVIEW_STUB = {
  object: {
    name: 'student',
    title: '学生',
    description: '学生主体对象',
    aliases: [],
    status: 'active',
  },
  stats: { property_count: 0, metric_count: 0, relation_count: 0, action_count: 0, rule_count: 0 },
  capabilities: { properties: [], actions: [] },
  associations: { metrics: [], relations: [], rules: [] },
  governance: { stale_items: [], consistency_items: [], audit_total: 0, recent_audits: [] },
  lifecycle: { history_items: [], history_total: 0, last_activity: null },
}

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(
    page,
    '**/api/v1/semantic/ontology/objects?**',
    envelope(ontFx.objects),
  )
  await mockJsonRoute(
    page,
    /\/api\/v1\/ontology\/objects\/student$/,
    envelope(ontFx.object_detail),
  )
  // ObjectDetail 挂的 overview hook 必须提供完整 shape。
  await mockJsonRoute(
    page,
    /\/api\/v1\/ontology\/workbench\/objects\/student\/overview$/,
    envelope(OVERVIEW_STUB),
  )
})

test('P04 本体对象 编辑Tab 校验/撤销/保存 @p04', async ({ page }) => {
  // 拦截 POST /ontology/objects（upsert），返回带修改后的新 title。
  let postBody: Record<string, unknown> | null = null
  await page.route('**/api/v1/ontology/objects', async (route) => {
    const req = route.request()
    if (req.method() !== 'POST') return route.continue()
    try {
      postBody = req.postDataJSON() as Record<string, unknown>
    } catch {
      postBody = null
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
          ...ontFx.object_detail,
          title: (postBody?.title as string) ?? ontFx.object_detail.title,
          description: postBody?.description ?? ontFx.object_detail.description,
        }),
      ),
    })
  })

  // 1. 打开详情页 → 点"编辑"。
  await gotoV2(page, '/semantic/ontology/objects/student')
  await page.getByRole('button', { name: /编辑/ }).first().click()

  // 2. 落在编辑页，"显示名称"回填为 "学生"。
  await expect(page).toHaveURL(/\/semantic\/ontology\/objects\/student\/edit$/)
  const titleInput = page.getByTestId('object-edit-title')
  await expect(titleInput).toHaveValue('学生')

  // 3. 清空标题 → 内联校验错误可见；保存按钮禁用。
  await titleInput.fill('')
  const errorBanner = page.getByTestId('object-edit-error')
  await expect(errorBanner).toBeVisible()
  await expect(errorBanner).toContainText(/不可为空|required/i)
  await expect(page.getByTestId('object-edit-save')).toBeDisabled()

  // 4. 撤销全部 → 恢复 baseline。
  await page.getByTestId('object-edit-reset').click()
  await expect(titleInput).toHaveValue('学生')
  await expect(errorBanner).toBeHidden()

  // 5. 修改为合法新值 → diff 面板显示变化。
  await titleInput.fill('学生（改）')
  await expect(page.getByTestId('object-edit-dirty-chip')).toBeVisible()
  const diffList = page.getByTestId('object-edit-diff-list')
  await expect(diffList).toBeVisible()
  await expect(diffList).toContainText('学生（改）')

  // 6. 保存 → POST 被命中 → 跳转回详情页。
  await page.getByTestId('object-edit-save').click()
  await expect(page).toHaveURL(/\/semantic\/ontology\/objects\/student$/)
  expect(postBody).not.toBeNull()
  expect(postBody).toMatchObject({ name: 'student', title: '学生（改）' })
})
