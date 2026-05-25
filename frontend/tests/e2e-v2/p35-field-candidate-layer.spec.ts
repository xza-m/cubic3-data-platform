// frontend/tests/e2e-v2/p35-field-candidate-layer.spec.ts
//
// P35 - 字段候选层交付验证。
// 覆盖 Cube 创建入口文案与字段候选 preview API 的非可加指标建议。

import { test, expect } from '@playwright/test'
import { envelope, gotoV2, installApiCatchAll, prepareV2Page } from './helpers'

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)
})

test('cube creation presents candidate-based generation wording', async ({ page }) => {
  await gotoV2(page, '/semantic/cubes/new')

  await expect(page.getByText('从数据集候选生成')).toBeVisible()
  await expect(page.getByText('从数据源候选生成')).toBeVisible()
  await expect(page.getByText('先生成字段候选').first()).toBeVisible()
})

test('field candidate preview API returns non-additive measure suggestion', async ({ page }) => {
  const requestBody = {
    source: {
      source_kind: 'physical_table',
      database: 'df_cb_258187',
      table: 'ads_bi_question_base_stats_df',
    },
    columns: [
      { name: 'question_id', type: 'BIGINT', comment: '题目 ID' },
      { name: 'p75_difficulty', type: 'DECIMAL(10,4)', comment: 'P75 难度' },
    ],
  }
  let receivedBody: unknown = null

  await page.route('**/api/v1/semantic/field-candidates/preview', async (route) => {
    receivedBody = JSON.parse(route.request().postData() || '{}')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope({
        candidate_set_id: 'fcand_e2e',
        fields: [
          { field: 'question_id', selected_role: 'dimension.identifier', issue_codes: [] },
          {
            field: 'p75_difficulty',
            selected_role: 'measure.non_additive',
            issue_codes: ['non_additive_unconfirmed'],
          },
        ],
      })),
    })
  })

  await gotoV2(page, '/semantic/cubes/new')
  const response = await page.evaluate(async (body) => {
    const resp = await fetch('/api/v1/semantic/field-candidates/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return {
      ok: resp.ok,
      payload: await resp.json(),
    }
  }, requestBody)

  expect(response.ok).toBeTruthy()
  expect(receivedBody).toEqual(requestBody)

  const payload = response.payload
  const data = payload.data ?? payload
  const candidates = data.fields ?? data.candidates ?? []
  const p75 = candidates.find((candidate: Record<string, unknown>) => {
    return candidate.field === 'p75_difficulty' || candidate.name === 'p75_difficulty'
  })

  expect(p75).toBeTruthy()
  expect(p75.selected_role).toBe('measure.non_additive')

  const issueCodes = Array.isArray(p75.issue_codes)
    ? p75.issue_codes
    : Array.isArray(p75.issues)
      ? p75.issues.map((issue: Record<string, unknown>) => issue.code)
      : []
  expect(issueCodes).toContain('non_additive_unconfirmed')
})
