// frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts
//
// P34 - 对话原生 ModelingCopilot 最小闭环 smoke。
// 业务问题 -> 启动 session -> 处理阻断 -> 编辑 spec -> 应用语义 -> 确认发布。

import { test, expect } from '@playwright/test'
import { envelope, gotoV2, installApiCatchAll, prepareV2Page } from './helpers'

const QUESTION = '查询最近7天学生评论数，按学校汇总'

type FlowPhase = 'created' | 'analyzed' | 'accepted' | 'confirmed' | 'saved' | 'published'

function sessionPayload(phase: FlowPhase) {
  const analyzed = phase !== 'created'
  const confirmed = phase === 'confirmed' || phase === 'saved' || phase === 'published'
  const hasProposal = phase === 'saved' || phase === 'published'
  const cubeDraftAccepted = phase === 'accepted' || confirmed
  return {
    id: 'session_agent_1',
    user_goal: QUESTION,
    entry_type: 'business_question',
    status: phase === 'published' ? 'completed' : 'active',
    principal_id: null,
    title: null,
    current_proposal_id: hasProposal ? 'proposal_agent_1' : null,
    conversation: [
      { role: 'user', content: QUESTION },
      ...(analyzed
        ? [{ role: 'assistant', content: '我已识别建模目标并完成已有语义与候选资产检索。' }]
        : []),
    ],
    workbench_state: {
      agent_message: analyzed
        ? '我已识别建模目标并完成已有语义与候选资产检索。'
        : '我会先理解建模目标，并检索已有语义。',
      semantic_canvas: {
        objects: analyzed
          ? [{ name: 'student_comment', title: '学生评论', status: 'active' }]
          : [],
        metrics: analyzed
          ? [{ name: 'student_comment_total_count', title: '学生评论总数', status: 'active' }]
          : [],
        dimensions: analyzed
          ? [
              { name: 'comment_school_name', title: '学校名称', status: 'active' },
              { name: 'comment_published_at', title: '评论发布时间', status: 'active' },
            ]
          : [],
        bindings: analyzed
          ? [
              {
                metric: 'student_comment_total_count',
                measure_ref: 'dwd_interaction_comment_reports_df.total_count',
                status: 'linked',
              },
            ]
          : [],
        policies: analyzed
          ? [{ name: 'school_scope', visibility: 'restricted', status: 'restricted' }]
          : [],
      },
      candidate_cards: analyzed
        ? [
            {
              id: 'cube_dwd_interaction_comment_reports_df',
              name: 'dwd_interaction_comment_reports_df',
              title: '学生评论举报事实表 Cube',
              recommended_value: 'dwd_interaction_comment_reports_df',
              score: 0.82,
              reason: '真实评论/举报明细表已发布为 active Cube，可支撑学生评论数按学校汇总。',
            },
          ]
        : [],
      required_confirmations:
        analyzed && !confirmed
          ? [
              {
                id: 'confirm_school_dimension',
                title: '学校维度',
                question: '学校维度从哪个字段取？',
                recommended_value: 'comment_school_name',
                recommended_reason: '真实 Cube 已暴露 comment_school_name，能直接支撑按学校名称汇总。',
                blocking: true,
              },
            ]
          : [],
      evidence_summary: analyzed
        ? [
            {
              id: 'question-intent',
              type: 'user_goal',
              trust_level: 'P1',
              extracted_claim: QUESTION,
            },
          ]
        : [],
      source_evidence: analyzed
        ? {
            source_table: {
              name: 'df_cb_258187.dwd_interaction_comment_reports_df',
              title: '学生评论举报明细表',
              grain: '一条学生评论/举报事件',
              freshness: 'T+1',
            },
            fields: [
              { name: 'comment_school_name', title: '学校名称', type: 'string', role: 'dimension', evidence: '按学校汇总字段' },
              { name: 'report_id', title: '举报 ID', type: 'string', role: 'measure_source', evidence: '计数字段' },
              { name: 'comment_published_at', title: '评论发布时间', type: 'datetime', role: 'time', evidence: '最近 7 天过滤' },
            ],
            sample_rows: [
              { comment_school_name: '示例学校', report_id: 'r_1001', comment_published_at: '2026-05-10 09:00:00' },
            ],
            recommendations: [
              {
                id: 'source-table',
                title: '为什么选择这张表',
                reason: '该表同时包含学校、评论、发布时间与举报状态字段。',
              },
            ],
          }
        : undefined,
      readiness: {
        canonical_ready: phase === 'published',
        exploratory_ready: analyzed,
        reasons:
          phase === 'published'
            ? []
            : analyzed && !confirmed
              ? ['business_owner_confirmation_required', 'binding_not_approved']
              : ['ready_to_save'],
      },
      publish_result:
        phase === 'published'
          ? {
              status: 'published',
              proposal_id: 'proposal_agent_1',
              details: {
                cube: { name: 'dwd_interaction_comment_reports_df', status: 'active' },
                ontology: { object: 'student_comment', status: 'active' },
              },
            }
          : undefined,
      raw_spec: analyzed
        ? {
            spec_version: 'v1',
            cube: {
              name: 'dwd_interaction_comment_reports_df',
              title: '学生评论',
              source: 'df_cb_258187.dwd_interaction_comment_reports_df',
              dimensions: [
                { name: 'comment_school_name', type: 'string', expr: 'comment_school_name' },
                { name: 'comment_published_at', type: 'datetime', expr: 'comment_published_at' },
              ],
              measures: [
                { name: 'total_count', type: 'count', sql: 'COUNT(`report_id`)', time_dimension: 'comment_published_at' },
              ],
            },
            ontology: {
              object: { name: 'student_comment', title: '学生评论' },
              metrics: [
                {
                  name: 'student_comment_total_count',
                  title: '学生评论总数',
                  measure_refs: ['dwd_interaction_comment_reports_df.total_count'],
                },
              ],
            },
          }
        : {},
      cube_draft_accepted: cubeDraftAccepted,
      validation_summary: [],
      proposal_summary:
        hasProposal ? { id: 'proposal_agent_1', status: 'validated' } : {},
      proposal_patch: analyzed
        ? {
            source_mode: 'agent_led',
            source_kind: 'business_question',
            user_question: QUESTION,
            business_subject: '学生评论',
            candidate_table: 'df_cb_258187.dwd_interaction_comment_reports_df',
          }
        : {},
      advanced_refs: { proposal_id: hasProposal ? 'proposal_agent_1' : null },
    },
    tool_traces: analyzed
      ? [
          { tool: 'search_ontology', status: 'completed', summary: '已检索 active Ontology 资产' },
          { tool: 'generate_semantic_draft', status: 'completed', summary: '已生成草稿' },
        ]
      : [],
  }
}

function reviewPayload(phase: FlowPhase) {
  const session = sessionPayload(phase)
  const analyzed = phase !== 'created'
  const confirmed = phase === 'confirmed' || phase === 'saved' || phase === 'published'
  const hasProposal = phase === 'saved' || phase === 'published'
  const published = phase === 'published'
  const blockers =
    analyzed && !confirmed
      ? [
          {
            id: 'confirm_school_dimension',
            severity: 'required',
            title: '学校维度口径待确认',
            description: '学校维度从哪个字段取？',
            technical_hint: 'comment_school_name',
            source: 'confirmation',
          },
          {
            id: 'binding_not_approved',
            severity: 'required',
            title: '语义绑定审批未完成',
            description: '发布前需要处理该 readiness 阻塞。',
            technical_hint: 'binding_not_approved',
            source: 'readiness',
          },
        ]
      : []
  return {
    session_id: session.id,
    proposal_id: hasProposal ? 'proposal_agent_1' : null,
    status: published ? 'published' : blockers.length > 0 ? 'blocked' : hasProposal ? 'ready_to_publish' : 'ready_to_save',
    status_label: published
      ? '已发布 · Data Agent 可消费'
      : blockers.length > 0
        ? '当前只能保存草稿'
        : hasProposal
          ? '发布前检查通过，等待确认发布'
          : '草稿可保存',
    changes: analyzed
      ? [
          {
            id: 'cube',
            type: 'cube',
            title: '新增 Cube',
            technical_name: 'dwd_interaction_comment_reports_df',
            reason: '真实评论/举报明细表已发布为 active Cube，可支撑学生评论数按学校汇总。',
            impact: '支撑学生评论数、学校汇总、审核治理与后续智能问数路由。',
          },
          {
            id: 'metric',
            type: 'metric',
            title: '新增指标',
            technical_name: 'student_comment_total_count',
            reason: '用户问题直接要求“评论数”。',
            impact: '进入智能问数默认指标候选。',
          },
          {
            id: 'object',
            type: 'object',
            title: '语义对象',
            technical_name: 'student_comment',
            reason: '查询表达中的主体是“学生评论”。',
            impact: '承接字段、指标和策略。',
          },
        ]
      : [],
    blockers,
    reason_explanations: analyzed
      ? [
          {
            target_id: 'cube',
            question: '为什么推荐 dwd_interaction_comment_reports_df？',
            answer: '真实评论/举报明细表已发布为 active Cube。',
            evidence_refs: [],
          },
        ]
      : [],
    data_agent_consumption: {
      state: published ? 'available' : blockers.length > 0 ? 'draft_only' : 'ready_after_publish',
      label: published ? '正式 Data Agent 可消费' : '正式 Data Agent 暂不可消费',
      reasons: blockers.map((item) => item.id),
    },
      primary_action: {
        action: published ? 'none' : hasProposal ? 'publish' : 'save_proposal',
        label: published ? '已发布' : hasProposal ? '发布' : '保存草稿',
        disabled: false,
      },
    source_evidence: (session.workbench_state as Record<string, unknown>).source_evidence,
    trace_state: {
      events: analyzed
        ? [
            { id: 'tool_search', type: 'tool', title: 'search_ontology', status: 'completed', summary: '已检索 active Ontology 资产' },
            { id: 'tool_draft', type: 'tool', title: 'generate_semantic_draft', status: 'completed', summary: '已生成草稿' },
            ...(confirmed
              ? [{ id: 'human_confirm', type: 'human', title: '用户确认学校维度', status: 'completed', summary: 'comment_school_name' }]
              : []),
            ...(hasProposal
              ? [{ id: 'audit_save', type: 'audit', title: 'Proposal 保存审计', status: 'completed', summary: 'proposal_agent_1' }]
              : []),
            ...(published
              ? [{ id: 'audit_publish', type: 'audit', title: '发布审计', status: 'completed', summary: '正式 Data Agent 可消费' }]
              : []),
          ]
        : [],
    },
    publish_gate: {
      state: published ? 'published' : blockers.length > 0 ? 'blocked' : hasProposal ? 'ready_to_publish' : 'ready_to_save',
      label: published
        ? '发布门禁已通过'
        : blockers.length > 0
          ? '发布门禁阻塞'
          : hasProposal
            ? '发布前检查通过'
            : '草稿可保存',
      steps: [
        { id: 'spec', label: 'Spec 完整', status: analyzed ? 'passed' : 'blocked', description: 'raw_spec 已生成' },
        { id: 'blockers', label: '阻塞项清零', status: blockers.length > 0 ? 'blocked' : 'passed', description: blockers.length > 0 ? '仍有阻塞项' : '阻塞项已处理' },
        { id: 'runtime', label: '正式 runtime', status: published ? 'passed' : 'pending', description: published ? 'Data Agent 可消费' : '发布后生效' },
      ],
    },
    post_publish_validation: {
      status: published ? 'passed' : 'not_run',
      label: published ? '样例问答验收通过' : '发布后验收待运行',
      sample_question: QUESTION,
      runtime_route: published ? 'student_comment_cube' : null,
      result_summary: published ? '正式 Data Agent 已能命中 student_comment_cube。' : '语义资产发布后再运行。',
    },
  }
}

type SourceFlowPhase = 'candidate' | 'generated'

function sourceCandidateSessionPayload(phase: SourceFlowPhase) {
  const generated = phase === 'generated'
  return {
    id: 'session_source_candidate_1',
    user_goal: 'Data Agent 没听懂"班级活跃度"，帮我补语义',
    entry_type: 'business_question',
    status: 'active',
    principal_id: null,
    current_proposal_id: null,
    conversation: [
      { role: 'user', content: 'Data Agent 没听懂"班级活跃度"，帮我补语义' },
      {
        role: 'assistant',
        content: generated
          ? '已使用 dw.dwd_class_activity_df 生成可审阅 spec。'
          : '我找到了候选数据来源。请先选择一项，我会基于它生成可审阅 spec。',
      },
    ],
    workbench_state: {
      agent_message: generated
        ? '已使用 dw.dwd_class_activity_df 生成可审阅 spec。'
        : '我找到了候选数据来源。请先选择一项，我会基于它生成可审阅 spec。',
      semantic_canvas: {
        objects: [{ name: 'class', title: '班级', status: 'draft' }],
        metrics: [{ name: 'class_activity', title: '班级活跃度', status: 'candidate' }],
        dimensions: [{ name: 'class_id', title: '班级', status: 'candidate' }],
        bindings: [],
        policies: [],
      },
      candidate_cards: [],
      source_candidates: [
        {
          id: 'table:7:dw:dwd_class_activity_df',
          asset_type: 'table',
          source_kind: 'physical_table',
          source_id: 7,
          database: 'dw',
          table: 'dwd_class_activity_df',
          name: 'dw.dwd_class_activity_df',
          title: '班级活跃事实表',
          confidence: 'high',
          score: 0.86,
          evidence: ['数据源表缓存命中，未实时连接外部库'],
          selected: generated,
        },
      ],
      required_confirmations: [],
      readiness: {
        canonical_ready: false,
        exploratory_ready: generated,
        reasons: generated ? ['ready_to_save'] : ['source_candidate_confirmation_required', 'spec_not_generated'],
      },
      raw_spec: generated
        ? {
            spec_version: 'v1',
            source: {
              source_kind: 'physical_table',
              source_id: 7,
              database: 'dw',
              table: 'dwd_class_activity_df',
            },
            cube: {
              name: 'dwd_class_activity_df',
              title: '班级活跃度',
              source: 'dw.dwd_class_activity_df',
              dimensions: [{ name: 'class_id', type: 'string', expr: 'class_id' }],
              measures: [{ name: 'active_count', type: 'count', sql: 'COUNT(*)' }],
            },
            ontology: {
              object: { name: 'class', title: '班级' },
              metrics: [{ name: 'class_activity', title: '班级活跃度', measure_refs: ['dwd_class_activity_df.active_count'] }],
            },
          }
        : {},
      proposal_patch: {
        source_mode: 'agent_led',
        source_kind: generated ? 'physical_table' : 'business_question',
        user_question: 'Data Agent 没听懂"班级活跃度"，帮我补语义',
        source_id: generated ? 7 : undefined,
        database: generated ? 'dw' : undefined,
        table: generated ? 'dwd_class_activity_df' : undefined,
        candidate_table: generated ? 'dw.dwd_class_activity_df' : undefined,
      },
      advanced_refs: {
        spec_available: generated,
        source_candidates_available: !generated,
        candidate_source_table: generated ? 'dw.dwd_class_activity_df' : undefined,
      },
    },
    tool_traces: generated
      ? [
          { tool: 'rank_candidate_assets', status: 'completed', summary: '已召回候选数据来源' },
          { tool: 'confirm_source_candidate', status: 'completed', summary: '已确认数据来源 dw.dwd_class_activity_df' },
          { tool: 'generate_semantic_draft', status: 'completed', summary: '已生成可审阅 spec' },
        ]
      : [
          { tool: 'rank_candidate_assets', status: 'completed', summary: '已召回候选数据来源' },
          { tool: 'generate_semantic_draft', status: 'skipped', summary: '等待确认候选数据来源' },
        ],
  }
}

test.beforeEach(async ({ page }) => {
  await prepareV2Page(page)
  await installApiCatchAll(page)

  // 用闭包跟随 phase：messages -> analyzed，confirm -> confirmed，save -> saved，publish -> published。
  // GET /sessions/<id> 返回当前 phase，避免 invalidate 后被旧数据覆盖。
  let phase: FlowPhase = 'created'

  // sessions list (空列表，不影响主区)
  await page.route('**/api/v1/semantic/modeling-copilot/sessions?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope({ items: [], total: 0 })),
    })
  })
  // 不带 query string 的 list 兜底
  await page.route('**/api/v1/semantic/modeling-copilot/sessions', async (route, request) => {
    if (request.method() === 'POST') {
      const payload = request.postDataJSON() as Record<string, unknown>
      expect(payload.user_goal).toBe(QUESTION)
      expect(payload.entry_type).toBe('business_question')
      phase = 'created'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope(sessionPayload('created'))),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope({ items: [], total: 0 })),
    })
  })

  await page.route(
    '**/api/v1/semantic/modeling-copilot/sessions/session_agent_1/messages',
    async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>
      expect(payload.message).toBe(QUESTION)
      phase = 'analyzed'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope(sessionPayload('analyzed'))),
      })
    },
  )

  await page.route(
    '**/api/v1/semantic/modeling-copilot/sessions/session_agent_1/confirmations',
    async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>
      expect(payload.confirmation_id).toBe('confirm_school_dimension')
      phase = 'confirmed'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope(sessionPayload('confirmed'))),
      })
    },
  )

  await page.route(
    '**/api/v1/semantic/modeling-copilot/sessions/session_agent_1/accept-cube-draft',
    async (route) => {
      phase = 'accepted'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope(sessionPayload('accepted'))),
      })
    },
  )

  await page.route(
    '**/api/v1/semantic/modeling-copilot/sessions/session_agent_1/save-proposal',
    async (route) => {
      phase = 'saved'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope(sessionPayload('saved'))),
      })
    },
  )

  // PATCH /spec：模拟右侧完整 raw_spec 编辑回写。
  let patchedCubeName: string | null = null
  let patchedSpecSensitivity: string | null = null
  await page.route(
    '**/api/v1/semantic/modeling-copilot/sessions/session_agent_1/spec',
    async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>
      const spec = (payload.spec ?? null) as Record<string, unknown> | null
      const cube = (payload.cube ?? {}) as Record<string, unknown>
      const baseline = sessionPayload(phase)
      if (spec && typeof spec === 'object') {
        const business = (spec.business ?? {}) as Record<string, unknown>
        if (typeof business.sensitivity_level === 'string') patchedSpecSensitivity = business.sensitivity_level
      }
      if (typeof cube.name === 'string') patchedCubeName = cube.name
      const merged = {
        ...baseline,
        workbench_state: {
          ...baseline.workbench_state,
          raw_spec:
            spec && typeof spec === 'object'
              ? spec
              : {
                  ...(baseline.workbench_state.raw_spec ?? {}),
                  cube: {
                    ...((baseline.workbench_state.raw_spec as Record<string, unknown> | undefined)?.cube as
                      | Record<string, unknown>
                      | undefined),
                    ...cube,
                  },
                },
          agent_message: '已根据你的工作台编辑刷新 spec 与校验结果。',
        },
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope(merged)),
      })
    },
  )

  // 暴露给 test body 用，校验 PATCH 真的发出了
  // @ts-expect-error - 借助 page._patchedCubeName 暴露给 test body
  page._getPatchedCubeName = () => patchedCubeName
  // @ts-expect-error - 借助 page._patchedSpecSensitivity 暴露给 test body
  page._getPatchedSpecSensitivity = () => patchedSpecSensitivity

  await page.route(
    '**/api/v1/semantic/modeling-copilot/sessions/session_agent_1/publish',
    async (route) => {
      phase = 'published'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope(sessionPayload('published'))),
      })
    },
  )

  await page.route(
    '**/api/v1/semantic/modeling-copilot/sessions/session_agent_1/review',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope(reviewPayload(phase))),
      })
    },
  )

  await page.route(
    '**/api/v1/semantic/modeling-copilot/sessions/session_agent_1',
    async (route, request) => {
      if (request.method() !== 'GET') {
        await route.fallback()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope(sessionPayload(phase))),
      })
    },
  )
})

test('P34 对话原生 Copilot 从业务问题应用并发布语义 @smoke @p34', async ({ page }) => {
  await gotoV2(page, '/semantic/modeling-agent/new')

  // 空态：示例引导
  await expect(page.getByText('告诉我你想分析什么数据')).toBeVisible()

  // 发送业务问题
  await page.getByLabel('建模目标').fill(QUESTION)
  await page.getByRole('button', { name: /发送/ }).click()

  // Chat-first：中间仍是对话卡片，右侧 artifact panel 只做轻量辅助。
  await expect(page.getByTestId('chat-workspace')).toBeVisible()
  const artifacts = page.getByTestId('artifact-panel')
    await expect(artifacts).toBeVisible()
    await expect(page.getByTestId('copilot-run-state').getByText('当前状态：等待你确认口径')).toBeVisible()
    await expect(page.getByTestId('copilot-run-state').getByText('在 Chat 的确认卡片里处理；后台没有继续运行。')).toBeVisible()
    await expect(artifacts.getByTestId('proposal-review-workbench')).toBeVisible()
    await expect(artifacts.getByText('专家详情')).toBeVisible()
    await expect(artifacts.getByTestId('artifact-guidance').getByText(/流程已阻塞：学校维度口径待确认/)).toBeVisible()
    await expect(artifacts.getByRole('button', { name: /^语义定义$/ })).toBeVisible()
    await expect(artifacts.getByRole('button', { name: /^审计回放$/ })).toBeVisible()
    await expect(artifacts.getByTestId('artifact-run-state')).toHaveCount(0)
    await expect(artifacts.getByRole('button', { name: /使用推荐|保存|发布/ })).toHaveCount(0)

    const review = artifacts.getByTestId('proposal-review-workbench')
    await expect(review).toBeVisible()
    await expect(review.getByText('摘要').first()).toBeVisible()
    await expect(review.getByText('为什么卡住').first()).toBeVisible()
    await expect(review.getByText(/变更摘要/).first()).toBeVisible()
    await expect(review.getByRole('button', { name: /使用推荐|保存|发布|改 spec/ })).toHaveCount(0)
  await expect(page.getByText('dwd_interaction_comment_reports_df').first()).toBeVisible()
  await expect(page.getByText('student_comment').first()).toBeVisible()
  await expect(review.getByText('学校维度口径待确认')).toBeVisible()
  await expect(review.getByText('语义绑定审批未完成')).toHaveCount(0)
  await expect(page.getByText('已发现的语义资产').first()).toBeVisible()
  await expect(page.getByText('学生评论总数').first()).toBeVisible()
  await expect(page.getByText('dwd_interaction_comment_reports_df.total_count').first()).toBeVisible()
  await expect(page.getByText('需要你确认').first()).toBeVisible()
  await expect(page.getByText('学校维度').first()).toBeVisible()
  await expect(page.getByText('请确认 1 项口径').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /应用语义/ })).toHaveCount(0)

  // 可选草稿确认：接受 Cube 草稿不会触发 LLM，也不会绕过真正的口径阻塞。
  await page.getByTestId('chat-workspace').getByRole('button', { name: '接受草稿' }).click()
  await expect(page.getByText('Cube 草稿（已接受）').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /应用语义/ })).toHaveCount(0)

  // 阻断确认：主操作保留在 Chat 卡片里，右侧只做辅助审阅
  await page.getByTestId('chat-workspace').getByRole('button', { name: '使用推荐' }).click()

    // confirm 完后阻断确认卡片消失，主链路进入应用语义。
    await expect(page.getByText('需要你确认')).toHaveCount(0)
    await expect(page.getByTestId('chat-next-action').getByRole('button', { name: /应用语义/ })).toBeEnabled()
    await expect(review.getByText('可以应用语义').first()).toBeVisible()

  // 我的判断依据折叠
  await page.getByRole('button', { name: /我的判断依据/ }).click()
  await expect(page.getByText(QUESTION).first()).toBeVisible()

  // Chat 中打开 Spec 编辑：右侧切到 Spec tab，改 cube 名称，验证 PATCH 已发出
  await page.getByTestId('chat-workspace').getByRole('button', { name: /在右侧编辑 Spec/ }).click()
  await expect(page.getByTestId('artifact-spec-panel')).toBeVisible()
  await expect(artifacts.getByLabel('完整 raw_spec JSON')).toBeVisible()
  const rawSpecEditor = artifacts.getByLabel('完整 raw_spec JSON')
  const fullSpec = JSON.parse(await rawSpecEditor.inputValue()) as Record<string, unknown>
  fullSpec.business = { subject: '学生评论', sensitivity_level: 'internal' }
  await rawSpecEditor.fill(JSON.stringify(fullSpec, null, 2))
  await artifacts.getByRole('button', { name: /保存完整 spec/ }).click()
  // @ts-expect-error - test fixture 暴露
  expect(page._getPatchedSpecSensitivity()).toBe('internal')
  await expect(page.getByTestId('artifact-spec-panel').locator('[data-testid="cube-editor"]')).toHaveCount(0)
  await artifacts.getByRole('button', { name: /让 Copilot 改 spec/ }).click()
  await expect(page.getByLabel('建模目标')).toHaveValue('请基于当前完整 raw_spec 修改 spec：')
  await page.getByLabel('建模目标').fill(QUESTION)

  // 右侧 Preview tab：展示草稿态沙盒预演边界
    await artifacts.getByRole('button', { name: /^数据来源$/ }).click()
  await expect(page.getByTestId('artifact-source-panel')).toBeVisible()
  await expect(page.getByText('源表证据')).toBeVisible()
  await expect(page.getByText('comment_school_name').first()).toBeVisible()
  await expect(page.getByText('样本行')).toBeVisible()
  await expect(page.getByText('为什么选择这张表')).toBeVisible()

    await artifacts.getByRole('button', { name: /^审计回放$/ }).click()
  await expect(page.getByTestId('artifact-trace-panel')).toBeVisible()
  await expect(page.getByText('Trace 回放')).toBeVisible()
  await expect(page.getByText('search_ontology')).toBeVisible()
  await expect(page.getByText('用户确认学校维度')).toBeVisible()

  // 右侧 Preview tab：展示草稿态沙盒预演边界
    await artifacts.getByRole('button', { name: /^预演结果$/ }).click()
  await expect(page.getByText('草稿态沙盒预演')).toBeVisible()
  await expect(page.getByText('不污染正式 runtime')).toBeVisible()
  await expect(page.getByText('正式 Data Agent 暂不可消费').first()).toBeVisible()

    // 应用语义（save proposal）
    await page.getByTestId('chat-next-action').getByRole('button', { name: /应用语义/ }).click()
    await expect(page.getByText('语义已应用 · 待发布').first()).toBeVisible()
    await expect(page.getByTestId('copilot-run-state').getByText('当前状态：草稿已保存，等待发布')).toBeVisible()
    await expect(page.getByTestId('copilot-run-state').getByText('下一步在 Chat 中确认发布，发布后正式问数才会使用。')).toBeVisible()
    await expect(page.getByText('proposal_agent_1').first()).toBeVisible()

    // 第二步：确认发布
    await page.getByRole('button', { name: /确认发布/ }).click()
    await expect(page.getByText('语义已发布').first()).toBeVisible()
    await expect(page.getByText('已发布 · Data Agent 可消费').first()).toBeVisible()
    await artifacts.getByRole('button', { name: /^摘要$/ }).click()
    await expect(page.getByText('发布前状态').first()).toBeVisible()
    await expect(page.getByText('发布门禁已通过').first()).toBeVisible()
    await expect(page.getByText('发布后验收').first()).toBeVisible()
  await expect(page.getByText('样例问答验收通过').first()).toBeVisible()
})

test('P34 候选来源确认后确定性生成 spec @smoke @p34', async ({ page }) => {
  let phase: SourceFlowPhase = 'candidate'

  await page.route(
    '**/api/v1/semantic/modeling-copilot/sessions/session_source_candidate_1/messages',
    async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>
      expect(payload.action).toBe('confirm_source_candidate')
      expect(payload.candidate_id).toBe('table:7:dw:dwd_class_activity_df')
      phase = 'generated'
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope(sourceCandidateSessionPayload('generated'))),
      })
    },
  )

  await page.route(
    '**/api/v1/semantic/modeling-copilot/sessions/session_source_candidate_1/review',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope({ session_id: 'session_source_candidate_1', status: phase, blockers: [] })),
      })
    },
  )

  await page.route(
    '**/api/v1/semantic/modeling-copilot/sessions/session_source_candidate_1',
    async (route, request) => {
      if (request.method() !== 'GET') {
        await route.fallback()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(envelope(sourceCandidateSessionPayload(phase))),
      })
    },
  )

  await gotoV2(page, '/semantic/modeling-agent/session_source_candidate_1')

  await expect(page.getByTestId('chat-workspace').getByText('推荐数据来源')).toBeVisible()
  await expect(page.getByText('班级活跃事实表')).toBeVisible()
  await expect(page.getByText('dw.dwd_class_activity_df')).toBeVisible()
  await expect(page.getByTestId('copilot-run-state').getByText('当前状态：等待你确认数据来源')).toBeVisible()
  await expect(page.getByTestId('copilot-run-state').getByText(/后台没有继续运行/)).toBeVisible()
  await expect(page.getByTestId('artifact-guidance').getByText('流程已阻塞：确认数据来源')).toBeVisible()

  await page.getByRole('button', { name: /使用此来源/ }).click()

    await expect(page.getByText('已使用 dw.dwd_class_activity_df 生成可审阅 spec。')).toBeVisible()
    await expect(page.getByTestId('copilot-run-state').getByText('当前状态：草稿已生成，可预演')).toBeVisible()
    await expect(page.getByText('Cube 草稿').first()).toBeVisible()
    await page.getByTestId('artifact-panel').getByRole('button', { name: /^语义定义$/ }).click()
    await expect(page.getByTestId('artifact-spec-panel')).toBeVisible()
  await expect(page.getByLabel('完整 raw_spec JSON')).toContainText('dwd_class_activity_df')
})
