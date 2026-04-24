// frontend/tests/e2e-v2/p26-ontology-workbench-smoke.spec.ts
//
// P26 — Ontology 工作台结构 smoke（补齐 Round 3 清理时迁移 e2e-node 遗留的缺口）。
//
// 覆盖：
//   - /semantic/ontology 工作台能打开
//   - fixture 里的对象（学生 / 课程）可见
//   - 主操作 CTA（新建对象）存在
//
// 参考文档：docs/quality/e2e-coverage-gaps.md §4。

import { test, expect } from '@playwright/test'
import { envelope, gotoV2, installApiCatchAll, mockJsonRoute, prepareV2Page } from './helpers'

const WORKBENCH_FIXTURE = {
  items: [
    {
      name: 'student',
      title: '学生',
      description: '学生主体对象',
      status: 'active',
      stats: { property_count: 2, metric_count: 0, relation_count: 1, action_count: 0, rule_count: 0 },
      risk_summary: { stale_count: 0, consistency_count: 0 },
      last_activity: null,
    },
    {
      name: 'lesson',
      title: '课程',
      description: '课程对象',
      status: 'active',
      stats: { property_count: 3, metric_count: 2, relation_count: 2, action_count: 0, rule_count: 0 },
      risk_summary: { stale_count: 0, consistency_count: 0 },
      last_activity: null,
    },
  ],
  total: 2,
}

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
  await mockJsonRoute(page, '**/api/v1/ontology/workbench/objects', envelope(WORKBENCH_FIXTURE))
})

test('P26 Ontology 工作台能打开并列出 fixture 对象 @p26', async ({ page }) => {
  await gotoV2(page, '/semantic/ontology')
  await expect(page).toHaveURL(/\/semantic\/ontology$/)

  // fixture 对象
  await expect(page.getByText('学生').first()).toBeVisible()
  await expect(page.getByText('课程').first()).toBeVisible()

  // 新建对象 CTA（Workbench 头部 `<Plus />` + 文本 "新建"）
  const createBtn = page.getByRole('button', { name: /新建/ }).first()
  await expect(createBtn).toBeVisible()
})
