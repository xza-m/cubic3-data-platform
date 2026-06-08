// frontend/tests/e2e-v2/p34-modeling-agent-runtime.spec.ts
//
// P34 - Copilot 只消费平台 runtime 状态，Codex SDK 联通诊断留在平台设置页。

import { expect, test } from '@playwright/test'
import { envelope, gotoV2, installApiCatchAll, prepareV2Page } from './helpers'

const SESSION_ID = 'session_runtime_1'
const QUESTION = '查询最近7天学生评论数，按学校汇总'

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)

  await page.route('**/api/v1/agent-runtime/providers/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope(runtimeSnapshot())),
    })
  })

  await page.route('**/api/v1/semantic/modeling-copilot/sessions?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
          items: [sessionSummary()],
          total: 1,
          page: 1,
          page_size: 50,
        }),
      ),
    })
  })

  await page.route(`**/api/v1/semantic/modeling-copilot/sessions/${SESSION_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope(sessionDetail())),
    })
  })

  await page.route(`**/api/v1/semantic/modeling-copilot/sessions/${SESSION_ID}/review`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope(reviewPayload())),
    })
  })
})

test('Copilot 不展示 runtime 切换或 Codex 启动，平台设置页只保留 SDK 连接测试 @smoke @p34', async ({ page }) => {
  let testRequested = false

  await page.route('**/api/v1/agent-runtime/providers/codex_sdk/test', async (route) => {
    testRequested = true
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        envelope({
          runtime_name: 'codex_sdk',
          operation: 'test',
          status: 'succeeded',
          message: 'Codex SDK 联通测试通过',
          details: { provider: 'codex-sdk', transport: 'sdk' },
        }),
      ),
    })
  })

  await gotoV2(page, `/semantic/modeling-workbench/quick?sessionId=${SESSION_ID}`)

  await expect(page.getByTestId('agent-runtime-status')).toHaveText('AI · OpenAI')
  await expect(page.getByRole('button', { name: '启动 Codex' })).toHaveCount(0)
  await expect(page.getByText(/Agent Runtime:/)).toHaveCount(0)
  await expect(page.getByTestId('codex-review-runtime-notice')).toContainText('资产复审服务未连接')

  await page.getByRole('button', { name: '打开 AI 服务设置' }).click()
  await expect(page).toHaveURL(/\/settings\?tab=agent-runtime/)
  await expect(page.getByRole('tabpanel', { name: 'AI Runtime' })).toBeVisible()
  await expect(page.getByText('Codex SDK', { exact: true })).toBeVisible()
  await expect(page.getByText('sdk', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '启动 Codex' })).toHaveCount(0)

  await page.getByRole('button', { name: '测试连接' }).last().click()
  await expect.poll(() => testRequested).toBe(true)
  await expect(page.getByText('Codex SDK 联通测试通过')).toBeVisible()
})

function runtimeSnapshot() {
  return {
    can_manage: true,
    providers: [
      {
        runtime_name: 'openai_compatible',
        label: 'OpenAI Runtime',
        configured: true,
        available: true,
        status: 'ready',
        message: 'OpenAI Runtime 已配置。',
        operations: ['test'],
      },
      {
        runtime_name: 'codex_sdk',
        label: 'Codex SDK',
        configured: true,
        available: false,
        status: 'not_verified',
        message: 'Codex SDK 等待联通测试。',
        operations: ['test', 'capabilities', 'logs'],
        details: {
          provider: 'codex-sdk',
          transport: 'sdk',
          sandbox: 'read-only',
          project_root: '/tmp/cubic3',
          runtime_root: '/tmp/cubic3/.cubic3/agent-codex',
        },
      },
    ],
    action_bindings: [
      {
        action: 'semantic.modeling.generate_spec',
        default_runtime: 'openai_compatible',
        allowed_runtimes: ['openai_compatible'],
        expose_selector: false,
        requires_connection: false,
        reason: '低延迟语义草稿生成固定走 OpenAI-compatible runtime。',
      },
      {
        action: 'semantic.modeling.review_proposal',
        default_runtime: 'codex_sdk',
        allowed_runtimes: ['codex_sdk'],
        expose_selector: false,
        requires_connection: true,
        reason: '语义 Proposal 复审固定走 Codex runtime。',
      },
    ],
  }
}

function sessionSummary() {
  return {
    id: SESSION_ID,
    title: '学生评论汇总',
    user_goal: QUESTION,
    status: 'active',
    current_proposal_id: 'proposal_runtime_1',
    updated_at: '2026-05-29T10:00:00+08:00',
  }
}

function sessionDetail() {
  return {
    ...sessionSummary(),
    entry_type: 'business_question',
    conversation: [
      { role: 'user', content: QUESTION },
      { role: 'assistant', content: '我已生成可复审的语义 Proposal。' },
    ],
    workbench_state: {
      agent_message: '我已生成可复审的语义 Proposal。',
      readiness: {
        canonical_ready: false,
        exploratory_ready: true,
        reasons: ['proposal_review_required'],
      },
      semantic_canvas: {
        objects: [{ name: 'student_comment', title: '学生评论', status: 'draft' }],
        metrics: [{ name: 'student_comment_total_count', title: '学生评论总数', status: 'draft' }],
        dimensions: [],
        bindings: [],
        policies: [],
      },
      required_confirmations: [],
      candidate_cards: [],
      raw_spec: {
        cube: {
          name: 'student_comment',
          title: '学生评论',
          dimensions: [{ name: 'school_name', type: 'string', expr: 'school_name' }],
          measures: [{ name: 'comment_count', type: 'count', sql: 'COUNT(comment_id)' }],
        },
        ontology: {
          object: { name: 'student_comment', title: '学生评论' },
          metrics: [{ name: 'student_comment_total_count', title: '学生评论总数' }],
        },
      },
      source_evidence: {
        source_table: {
          name: 'df_cb_258187.dwd_interaction_comment_reports_df',
          title: '学生评论举报明细表',
          grain: '一条学生评论/举报事件',
        },
        fields: [{ name: 'school_name', title: '学校名称', type: 'string', role: 'dimension' }],
      },
    },
    tool_traces: [{ tool: 'generate_semantic_draft', status: 'success' }],
  }
}

function reviewPayload() {
  return {
    status: 'ready',
    proposal_id: 'proposal_runtime_1',
    summary: '等待 Codex runtime 复审。',
    changes: [],
    blockers: [],
    data_agent_consumption: {
      runtime_truth: false,
      status: 'draft',
      hint: '未发布前不进入消费者验证。',
    },
  }
}
