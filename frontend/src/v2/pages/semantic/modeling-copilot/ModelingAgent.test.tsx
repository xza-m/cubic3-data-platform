// frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
//
// 对话原生 ModelingAgent Copilot 工作台测试。
// 覆盖：
//   - 业务问题启动 -> 结构化卡片（discovered + confirmation）渲染
//   - 阻断确认 -> 保存 Proposal 流程
//   - 沙盒预演不污染正式 runtime
//   - 权限错误（INSUFFICIENT_ROLE）友好展示
//   - sessions 左栏列表 / 新建会话 / 删除入口

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AppError } from '@v2/api/types'
import type { SemanticModelingCopilotSession } from '@v2/api/semantic'
import type { AgentRuntimeManagementSnapshot } from '@v2/api/agent-runtime'

// ── mock hooks（与真实接口形状一致，但只关心 mutateAsync 调用） ───────────────
const createSession = vi.fn()
const sendMessage = vi.fn()
const confirmAssumption = vi.fn()
const acceptCubeDraft = vi.fn()
const previewSandbox = vi.fn()
const saveProposal = vi.fn()
const publishProposal = vi.fn()
const deleteSessionMut = vi.fn()
const renameSessionMut = vi.fn()
const updateSpecMut = vi.fn()
const startRuntimeProvider = vi.fn()

let activeSessionFixture: SemanticModelingCopilotSession | null = null
let sessionsFixture: SemanticModelingCopilotSession[] = []
let activeReviewFixture: unknown = null
let runtimeSnapshotFixture: AgentRuntimeManagementSnapshot | undefined = undefined

function makeQueryResult<T>(data: T | undefined, isError = false) {
  return {
    data,
    isLoading: false,
    isFetching: false,
    isError,
    error: undefined,
    refetch: vi.fn(),
  }
}

vi.mock('@v2/hooks/semantic', () => ({
  useSemanticModelingCopilotSession: () => makeQueryResult(activeSessionFixture ?? undefined),
  useSemanticModelingCopilotReview: () => makeQueryResult(activeReviewFixture ?? undefined),
  useSemanticModelingCopilotSessions: () =>
    makeQueryResult({ items: sessionsFixture, total: sessionsFixture.length }),
  useCreateSemanticModelingCopilotSession: () => ({ mutateAsync: createSession, isPending: false }),
  useSendSemanticModelingCopilotMessage: () => ({ mutateAsync: sendMessage, isPending: false }),
  useConfirmSemanticModelingCopilotAssumption: () => ({ mutateAsync: confirmAssumption, isPending: false }),
  useAcceptSemanticModelingCopilotCubeDraft: () => ({ mutateAsync: acceptCubeDraft, isPending: false }),
  usePreviewSemanticModelingCopilotSandbox: () => ({ mutateAsync: previewSandbox, isPending: false }),
  useSaveSemanticModelingCopilotProposal: () => ({ mutateAsync: saveProposal, isPending: false }),
  usePublishSemanticModelingCopilotProposal: () => ({ mutateAsync: publishProposal, isPending: false }),
  useDeleteSemanticModelingCopilotSession: () => ({ mutateAsync: deleteSessionMut, isPending: false }),
  useRenameSemanticModelingCopilotSession: () => ({ mutateAsync: renameSessionMut, isPending: false }),
  useUpdateSemanticModelingCopilotSpec: () => ({ mutate: updateSpecMut, mutateAsync: updateSpecMut, isPending: false }),
}))

vi.mock('@v2/hooks/agent-runtime', () => ({
  useAgentRuntimeStatus: () => makeQueryResult(runtimeSnapshotFixture),
  useStartAgentRuntimeProvider: () => ({ mutateAsync: startRuntimeProvider, isPending: false }),
}))

import ModelingAgent from './ModelingAgent'

// ── 固定 fixture：覆盖 discovered + confirmation + saved 三类卡 ──────────────

const ANALYZED_SESSION: SemanticModelingCopilotSession = {
  id: 'session_1',
  user_goal: '查询最近7天学生评论数，按学校汇总',
  entry_type: 'business_question',
  status: 'active',
  conversation: [
    { role: 'user', content: '查询最近7天学生评论数，按学校汇总' },
    { role: 'assistant', content: '我已识别建模目标并完成已有语义与候选资产检索。' },
  ],
  workbench_state: {
    agent_message: '我已识别建模目标并完成已有语义与候选资产检索。',
    semantic_canvas: {
      objects: [{ name: 'student_comment', title: '学生评论', status: 'active' }],
      metrics: [{ name: 'student_comment_total_count', title: '学生评论总数', status: 'active' }],
      dimensions: [
        { name: 'comment_school_name', title: '学校名称', status: 'active' },
        { name: 'comment_published_at', title: '评论发布时间', status: 'active' },
      ],
      bindings: [
        {
          metric: 'student_comment_total_count',
          measure_ref: 'dwd_interaction_comment_reports_df.total_count',
          status: 'linked',
        },
      ],
      policies: [{ name: 'school_scope', visibility: 'restricted', status: 'restricted' }],
    },
    candidate_cards: [
      {
        id: 'cube_dwd_interaction_comment_reports_df',
        name: 'dwd_interaction_comment_reports_df',
        title: '学生评论举报事实表 Cube',
        score: 0.82,
        reason: '真实评论/举报明细表已发布为 active Cube，可支撑学生评论数按学校汇总。',
      },
    ],
    required_confirmations: [
      {
        id: 'confirm_school_dimension',
        title: '学校维度',
        question: '学校维度从哪个字段取？',
        recommended_value: 'comment_school_name',
        recommended_reason: '真实 Cube 已暴露 comment_school_name，能直接支撑按学校名称汇总。',
        explain: '业务问题里的"学校"需要落到学生评论事实表上的发布者学校字段，影响最终 GROUP BY 粒度。',
        blocking: true,
      },
    ],
      evidence_summary: [
        {
          id: 'question-intent',
          type: 'user_goal',
          trust_level: 'P1',
          extracted_claim: '查询最近7天学生评论数，按学校汇总',
        },
      ],
      source_evidence: {
        source_table: {
          name: 'df_cb_258187.dwd_interaction_comment_reports_df',
          title: '学生评论举报明细表',
          grain: '一条学生评论/举报事件',
          freshness: 'T+1',
        },
        fields: [
          {
            name: 'comment_school_name',
            title: '学校名称',
            type: 'string',
            role: 'dimension',
            evidence: '按学校汇总需要落到评论发布者学校字段。',
          },
          {
            name: 'report_id',
            title: '举报 ID',
            type: 'string',
            role: 'measure_source',
            evidence: '评论数可按 report_id 去重计数。',
          },
          {
            name: 'comment_published_at',
            title: '评论发布时间',
            type: 'datetime',
            role: 'time',
            evidence: '最近 7 天过滤需要稳定时间字段。',
          },
        ],
        sample_rows: [
          {
            comment_school_name: '示例学校',
            report_id: 'r_1001',
            comment_published_at: '2026-05-10 09:00:00',
          },
        ],
        recommendations: [
          {
            id: 'source-table',
            title: '为什么选择这张表',
            reason: '该表同时包含学校、评论、发布时间与举报状态字段。',
          },
        ],
      },
      readiness: {
        canonical_ready: false,
        exploratory_ready: true,
        reasons: ['business_owner_confirmation_required', 'binding_not_approved'],
      },
    raw_spec: {
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
    },
    proposal_patch: {
      source_mode: 'agent_led',
      source_kind: 'business_question',
      user_question: '查询最近7天学生评论数，按学校汇总',
      business_subject: '学生评论',
      candidate_table: 'df_cb_258187.dwd_interaction_comment_reports_df',
    },
  },
  tool_traces: [
    { tool: 'search_ontology', status: 'completed', summary: '已检索 active Ontology 资产' },
  ],
}

const RUNTIME_SNAPSHOT: AgentRuntimeManagementSnapshot = {
  providers: [
    {
      runtime_name: 'openai_compatible',
      label: 'OpenAI Runtime',
      configured: true,
      available: true,
      status: 'ready',
      message: 'OpenAI Runtime 已配置。',
      operations: ['test_connection'],
      details: { model: 'gpt-4o-mini' },
    },
    {
      runtime_name: 'codex_app_server',
      label: 'Codex App Server',
      configured: false,
      available: false,
      status: 'disabled',
      message: 'Codex app-server 未启用。',
      operations: [],
      details: { ui_managed: false },
    },
  ],
  action_bindings: [
    {
      action: 'semantic.modeling.generate_candidates',
      default_runtime: 'openai_compatible',
      allowed_runtimes: ['openai_compatible'],
      expose_selector: false,
      requires_connection: false,
      reason: 'fixed_openai_low_latency',
    },
    {
      action: 'semantic.modeling.review_proposal',
      default_runtime: 'codex_app_server',
      allowed_runtimes: ['codex_app_server'],
      expose_selector: false,
      requires_connection: true,
      reason: 'fixed_codex_workspace',
    },
  ],
}

const CODEX_MANAGED_RUNTIME_SNAPSHOT: AgentRuntimeManagementSnapshot = {
  ...RUNTIME_SNAPSHOT,
  providers: RUNTIME_SNAPSHOT.providers.map((provider) =>
    provider.runtime_name === 'codex_app_server'
      ? {
          ...provider,
          configured: true,
          available: false,
          status: 'not_verified',
          message: 'Codex app-server 已配置，等待真实联通测试。',
          operations: ['test_connection', 'start', 'logs', 'capabilities'],
          details: { ui_managed: true },
        }
      : provider,
  ),
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/semantic/modeling-copilot/new" element={<ModelingAgent />} />
        <Route path="/semantic/modeling-copilot/:sessionId" element={<ModelingAgent />} />
      </Routes>
    </MemoryRouter>,
  )
}

function expandArtifacts(artifacts: HTMLElement) {
  const expand = within(artifacts).queryByRole('button', { name: '展开' })
  if (expand) fireEvent.click(expand)
}

const NO_SOURCE_SESSION: SemanticModelingCopilotSession = {
  id: 'session_no_source',
  user_goal: 'Data Agent 没听懂"班级活跃度"，帮我补语义',
  entry_type: 'business_question',
  status: 'active',
  conversation: [
    { role: 'user', content: 'Data Agent 没听懂"班级活跃度"，帮我补语义' },
    { role: 'assistant', content: '还缺少可生成 spec 的源表线索，请继续补充物理表或候选数据集。' },
  ],
  workbench_state: {
    agent_message: '还缺少可生成 spec 的源表线索，请继续补充物理表或候选数据集。',
    semantic_canvas: {
      objects: [{ name: 'class', title: '班级', status: 'draft' }],
      metrics: [{ name: 'class_activity', title: '班级活跃度', status: 'candidate' }],
      dimensions: [{ name: 'class_id', title: '班级', status: 'candidate' }],
      bindings: [],
      policies: [],
    },
    candidate_cards: [],
    required_confirmations: [],
    evidence_summary: [
      {
        id: 'metric-definition',
        type: 'business_rule',
        trust_level: 'P2',
        extracted_claim: '用户希望补齐班级活跃度语义',
      },
    ],
    readiness: {
      canonical_ready: false,
      exploratory_ready: false,
      reasons: ['need_source_table', 'spec_not_generated'],
    },
    raw_spec: {},
    proposal_patch: {
      source_mode: 'agent_led',
      source_kind: 'business_question',
      user_question: 'Data Agent 没听懂"班级活跃度"，帮我补语义',
      business_subject: '班级活跃度',
    },
  },
  tool_traces: [
    { tool: 'generate_semantic_draft', status: 'skipped', summary: '缺少源表，跳过 spec 生成' },
  ],
}

const SOURCE_CANDIDATE_SESSION: SemanticModelingCopilotSession = {
  ...NO_SOURCE_SESSION,
  id: 'session_source_candidate',
  state: 'awaiting_confirmation',
  state_version: 4,
  conversation: [
    { role: 'user', content: 'Data Agent 没听懂"班级活跃度"，帮我补语义' },
    { role: 'assistant', content: '我找到了候选数据来源。请先选择一项，我会基于它生成可审阅 spec。' },
  ],
  workbench_state: {
    ...NO_SOURCE_SESSION.workbench_state,
    agent_message: '我找到了候选数据来源。请先选择一项，我会基于它生成可审阅 spec。',
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
        score_breakdown: { source_base: 0.42, lexical_match: 0.28, canonical_table_boost: 0.08 },
        why_selected: '综合得分最高：命中班级互动活跃事实表，来自 datasource 元数据缓存。',
        evidence: ['数据源表缓存命中，未实时连接外部库'],
      },
    ],
    readiness: {
      canonical_ready: false,
      exploratory_ready: false,
      reasons: ['source_candidate_confirmation_required', 'spec_not_generated'],
    },
  },
}

const DATA_ASSET_SOURCE_CANDIDATE_SESSION: SemanticModelingCopilotSession = {
  ...SOURCE_CANDIDATE_SESSION,
  id: 'session_data_asset_source_candidate',
  workbench_state: {
    ...SOURCE_CANDIDATE_SESSION.workbench_state,
    source_candidates: [
      {
        id: 'data-asset:dw_smoke:dwd_data_asset_smoke_df',
        asset_type: 'data_asset_table',
        name: 'dwd_data_asset_smoke_df',
        title: '数据资产底座 smoke 评论事实表',
        asset_ref: {
          qualified_name: 'data-asset-smoke.df_cb_258187.dw_smoke.dwd_data_asset_smoke_df',
        },
        evidence_bundle: {
          runtime_truth: false,
          sample_profile: {
            row_count: 128,
            partition_count: 1,
            profile_status: 'fresh',
          },
        },
      },
    ],
  },
}

describe('ModelingAgent · 对话原生 Copilot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    activeSessionFixture = null
    sessionsFixture = []
    activeReviewFixture = null
    runtimeSnapshotFixture = RUNTIME_SNAPSHOT
    startRuntimeProvider.mockResolvedValue({
      runtime_name: 'codex_app_server',
      operation: 'start',
      status: 'succeeded',
      message: '已提交 Codex app-server 启动。',
    })
    createSession.mockResolvedValue({ ...ANALYZED_SESSION, conversation: [{ role: 'user', content: '查询最近7天学生评论数，按学校汇总' }] })
    sendMessage.mockResolvedValue(ANALYZED_SESSION)
    acceptCubeDraft.mockResolvedValue({
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        cube_draft_accepted: true,
      },
    })
    confirmAssumption.mockResolvedValue({
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
      },
    })
    previewSandbox.mockResolvedValue({
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        sandbox_preview: { status: 'ready', pollutes_official_route: false },
      },
    })
    saveProposal.mockResolvedValue({
      ...ANALYZED_SESSION,
      current_proposal_id: 'proposal_1',
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        proposal_summary: { id: 'proposal_1', status: 'validated' },
      },
    })
  })

  it('从空态发送业务问题，调 createSession + sendMessage', async () => {
    renderAt('/semantic/modeling-copilot/new')

    expect(screen.getByText('告诉我你想分析什么数据')).toBeInTheDocument()

    const composer = screen.getByLabelText('建模目标')
    fireEvent.change(composer, { target: { value: '查询最近7天学生评论数，按学校汇总' } })
    fireEvent.click(screen.getByRole('button', { name: /发送/ }))

    await waitFor(() =>
      expect(createSession).toHaveBeenCalledWith({
        user_goal: '查询最近7天学生评论数，按学校汇总',
        entry_type: 'business_question',
      }),
    )
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        sessionId: 'session_1',
        message: '查询最近7天学生评论数，按学校汇总',
      }),
    )
  })

  it('已有 session 时展示结构化卡片：已发现的语义资产 + 需要你确认', () => {
    activeSessionFixture = ANALYZED_SESSION
    renderAt('/semantic/modeling-copilot/session_1')

    expect(screen.getByText('已发现的语义资产')).toBeInTheDocument()
    expect(screen.getByText('学生评论总数')).toBeInTheDocument()
    expect(screen.getByText('dwd_interaction_comment_reports_df.total_count')).toBeInTheDocument()
    expect(screen.getByText('需要你确认')).toBeInTheDocument()
    expect(screen.getByText('学校维度')).toBeInTheDocument()
    // 顶栏 readiness chip 用业务文案而不是英文
    expect(screen.getAllByText('请确认 1 项口径').length).toBeGreaterThan(0)
  })

  it('展示平台 Runtime 状态但不在 Copilot 主流程暴露 runtime 切换器', () => {
    activeSessionFixture = ANALYZED_SESSION
    renderAt('/semantic/modeling-copilot/session_1')

    expect(screen.getByTestId('agent-runtime-status')).toHaveTextContent('AI · OpenAI')
    expect(screen.queryByRole('button', { name: /启动 Codex/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Agent Runtime:/)).not.toBeInTheDocument()
  })

  it('已有 Proposal 且 Codex action 需要连接时才展示受控启动入口', async () => {
    runtimeSnapshotFixture = CODEX_MANAGED_RUNTIME_SNAPSHOT
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      current_proposal_id: 'proposal_1',
    }
    renderAt('/semantic/modeling-copilot/session_1')

    expect(screen.getByTestId('codex-review-runtime-notice')).toHaveTextContent('Codex 复审未连接')
    fireEvent.click(screen.getByRole('button', { name: '启动 Codex' }))

    await waitFor(() => expect(startRuntimeProvider).toHaveBeenCalledWith('codex_app_server'))
  })

  it('保持 Chat 为主界面，把 Proposal Review 放到右侧 artifact panel', () => {
    activeSessionFixture = ANALYZED_SESSION
    renderAt('/semantic/modeling-copilot/session_1')

    const chat = screen.getByTestId('chat-workspace')
    const artifacts = screen.getByTestId('artifact-panel')

    expect(within(chat).getByText('已发现的语义资产')).toBeInTheDocument()
    expect(within(chat).getByText('需要你确认')).toBeInTheDocument()
    expect(within(artifacts).getByTestId('proposal-review-workbench')).toBeInTheDocument()
    expect(within(artifacts).getByText('专家详情')).toBeInTheDocument()
    expect(within(artifacts).getByText('摘要 / 语义定义 / 数据来源 / 预演 / 审计')).toBeInTheDocument()
    expect(within(artifacts).getByRole('button', { name: '数据来源' })).toBeInTheDocument()
    expect(within(artifacts).getByText('已确认')).toBeInTheDocument()
    expect(within(artifacts).getByText('语义草稿')).toBeInTheDocument()
    expect(within(artifacts).getByText('已生成')).toBeInTheDocument()
    expect(within(artifacts).getAllByText('发布前检查').length).toBeGreaterThan(0)
    expect(within(artifacts).getByText(/流程已阻塞：学校维度口径待确认/)).toBeInTheDocument()
    expect(within(artifacts).getByRole('button', { name: /语义定义/ })).toBeInTheDocument()
    expect(within(artifacts).getByRole('button', { name: /审计回放/ })).toBeInTheDocument()
    expect(within(artifacts).queryByRole('button', { name: /发布|保存|使用推荐/ })).not.toBeInTheDocument()

    expect(within(artifacts).getByTestId('proposal-review-workbench')).toBeInTheDocument()
    expect(within(artifacts).getAllByText('摘要').length).toBeGreaterThan(0)
    expect(within(artifacts).getByText(/学校维度口径待确认/)).toBeInTheDocument()
    expect(within(artifacts).getByText('为什么卡住')).toBeInTheDocument()
    expect(within(artifacts).getByText(/变更摘要/)).toBeInTheDocument()
    expect(within(artifacts).getByText('发布前状态')).toBeInTheDocument()
    expect(screen.getAllByText('dwd_interaction_comment_reports_df').length).toBeGreaterThan(0)
    expect(screen.getAllByText('student_comment').length).toBeGreaterThan(0)
    expect(screen.getAllByText('student_comment_total_count').length).toBeGreaterThan(0)
    expect(within(artifacts).getByText(/学校维度口径待确认/)).toBeInTheDocument()
    expect(within(artifacts).queryByText('语义绑定审批未完成')).not.toBeInTheDocument()
    expect(within(artifacts).queryByRole('button', { name: /发布|保存|使用推荐|改 spec/ })).not.toBeInTheDocument()
  })

  it('Chat 中打开 Spec 编辑会切到右侧 Spec tab，并提供 AI 编辑入口', async () => {
    activeSessionFixture = ANALYZED_SESSION
    renderAt('/semantic/modeling-copilot/session_1')

    const artifacts = screen.getByTestId('artifact-panel')
    fireEvent.click(within(screen.getByTestId('chat-workspace')).getByRole('button', { name: /在右侧编辑 Spec/ }))

    expect(within(artifacts).getByLabelText('完整 raw_spec JSON')).toBeInTheDocument()
    expect(within(artifacts).queryByTestId('cube-editor')).not.toBeInTheDocument()
    fireEvent.click(within(artifacts).getByRole('button', { name: /让 Copilot 改 spec/ }))
    expect(screen.getByLabelText('建模目标')).toHaveValue('请基于当前完整 raw_spec 修改 spec：')
  })

  it('右侧 Spec 支持直接编辑完整 raw_spec 并 PATCH spec', async () => {
    activeSessionFixture = ANALYZED_SESSION
    renderAt('/semantic/modeling-copilot/session_1')

    const artifacts = screen.getByTestId('artifact-panel')
    fireEvent.click(within(screen.getByTestId('chat-workspace')).getByRole('button', { name: /在右侧编辑 Spec/ }))

    const fullSpecEditor = within(artifacts).getByLabelText('完整 raw_spec JSON')
    const nextSpec = {
      ...(ANALYZED_SESSION.workbench_state.raw_spec as Record<string, unknown>),
      business: { subject: '学生评论', sensitivity_level: 'internal' },
    }
    fireEvent.change(fullSpecEditor, { target: { value: JSON.stringify(nextSpec, null, 2) } })
    fireEvent.click(within(artifacts).getByRole('button', { name: /保存完整 spec/ }))

    await waitFor(() =>
      expect(updateSpecMut).toHaveBeenCalledWith({
        sessionId: 'session_1',
        body: {
          spec: expect.objectContaining({
            business: { subject: '学生评论', sensitivity_level: 'internal' },
          }),
        },
      }),
    )
  })

  it('右侧 Review 只读辅助，口径确认仍从 Chat 主链路完成', async () => {
    activeSessionFixture = ANALYZED_SESSION
    renderAt('/semantic/modeling-copilot/session_1')

    const artifacts = screen.getByTestId('artifact-panel')
    expect(within(artifacts).queryByRole('button', { name: /使用推荐/ })).not.toBeInTheDocument()
    fireEvent.click(within(screen.getByTestId('chat-workspace')).getByRole('button', { name: /使用推荐/ }))

    await waitFor(() =>
      expect(confirmAssumption).toHaveBeenCalledWith({
        sessionId: 'session_1',
        confirmationId: 'confirm_school_dimension',
        value: 'comment_school_name',
      }),
    )
  })

  it('流程状态留在 Chat，右侧轻量 Review 只提示下一步', () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      tool_traces: [
        ...ANALYZED_SESSION.tool_traces,
        { tool: 'generate_semantic_draft', status: 'completed', summary: '已生成可审阅 spec' },
      ],
    }

    renderAt('/semantic/modeling-copilot/session_1')

    const chatState = screen.getByTestId('copilot-run-state')
    expect(within(chatState).getByText('当前状态：等待你确认口径')).toBeInTheDocument()
    expect(within(chatState).getByText('在 Chat 的确认卡片里处理；后台没有继续运行。')).toBeInTheDocument()
    expect(within(chatState).getByText('generate_semantic_draft · completed')).toBeInTheDocument()

    const railGuidance = screen.getByTestId('artifact-guidance')
    expect(within(railGuidance).getByText(/流程已阻塞：学校维度口径待确认/)).toBeInTheDocument()
    expect(within(railGuidance).getByText(/在左侧 Chat 的确认卡片里使用推荐值/)).toBeInTheDocument()
    expect(screen.queryByTestId('artifact-run-state')).not.toBeInTheDocument()
  })

  it('右侧 Preview tab 展示草稿态沙盒预演和 Data Agent 消费边界', () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        sandbox_preview: {
          status: 'ready',
          pollutes_official_route: false,
          sample_questions: ['最近 7 天学生评论数按学校汇总'],
        },
      },
    }
    renderAt('/semantic/modeling-copilot/session_1')

    const artifacts = screen.getByTestId('artifact-panel')
    expandArtifacts(artifacts)
    fireEvent.click(within(artifacts).getByRole('button', { name: '预演结果' }))

    expect(within(artifacts).getByText('草稿态沙盒预演')).toBeInTheDocument()
    expect(within(artifacts).getByText('不污染正式 runtime')).toBeInTheDocument()
    expect(within(artifacts).getByText('正式 Data Agent 暂不可消费')).toBeInTheDocument()
    expect(within(artifacts).getByText('最近 7 天学生评论数按学校汇总')).toBeInTheDocument()
  })

  it('右侧 Source tab 展示源表字段、样本行和推荐证据', () => {
    activeSessionFixture = ANALYZED_SESSION
    renderAt('/semantic/modeling-copilot/session_1')

    const artifacts = screen.getByTestId('artifact-panel')
    expandArtifacts(artifacts)
    fireEvent.click(within(artifacts).getByRole('button', { name: '数据来源' }))

    expect(within(artifacts).getByTestId('artifact-source-panel')).toBeInTheDocument()
    expect(within(artifacts).getByText('源表证据')).toBeInTheDocument()
    expect(within(artifacts).getByText('df_cb_258187.dwd_interaction_comment_reports_df')).toBeInTheDocument()
    expect(within(artifacts).getByText('comment_school_name')).toBeInTheDocument()
    expect(within(artifacts).getByText('样本行')).toBeInTheDocument()
    expect(within(artifacts).getByText('为什么选择这张表')).toBeInTheDocument()
  })

  it('缺少物理表或数据集时，右侧只提示回 Chat 补齐建模输入', () => {
    activeSessionFixture = NO_SOURCE_SESSION
    renderAt('/semantic/modeling-copilot/session_no_source')

    const artifacts = screen.getByTestId('artifact-panel')
    const guidance = within(artifacts).getByTestId('artifact-guidance')
    expect(within(guidance).getByText('流程已阻塞：补充源表或数据集')).toBeInTheDocument()
    expect(within(guidance).getByText(/后台没有任务在运行/)).toBeInTheDocument()
    expect(within(artifacts).queryByText('生成完整 spec')).not.toBeInTheDocument()

    const nudge = screen.getByTestId('chat-flow-nudge')
    expect(within(nudge).getByText('已阻塞')).toBeInTheDocument()
    expect(within(nudge).getByText('流程已阻塞：缺少数据来源')).toBeInTheDocument()
    expect(within(nudge).getByText(/当前没有后台任务在运行/)).toBeInTheDocument()
    fireEvent.click(within(nudge).getByRole('button', { name: /填入模板/ }))
    expect(screen.getByLabelText('建模目标')).toHaveValue(
      '源表/数据集是 <database.table>；指标口径是 <计算规则>；按 <分组字段> 分组；时间字段是 <字段名>。',
    )

    expandArtifacts(artifacts)
    fireEvent.click(within(artifacts).getByRole('button', { name: '数据来源' }))
    expect(within(artifacts).getByText('待补充源表/数据集')).toBeInTheDocument()
    expect(within(artifacts).getByText(/补充源表\/数据集、指标计算口径、分组字段和时间字段/)).toBeInTheDocument()
  })

  it('召回候选来源后在 Chat 中确认，右侧只做轻量提示', async () => {
    activeSessionFixture = SOURCE_CANDIDATE_SESSION
    sendMessage.mockResolvedValue({
      ...SOURCE_CANDIDATE_SESSION,
      workbench_state: {
        ...SOURCE_CANDIDATE_SESSION.workbench_state,
        readiness: { canonical_ready: false, exploratory_ready: true, reasons: ['ready_to_save'] },
        raw_spec: ANALYZED_SESSION.workbench_state.raw_spec,
      },
    })
    renderAt('/semantic/modeling-copilot/session_source_candidate')

    expect(screen.getByText('推荐数据来源')).toBeInTheDocument()
    expect(screen.getByText('班级活跃事实表')).toBeInTheDocument()
    expect(screen.getByText('dw.dwd_class_activity_df')).toBeInTheDocument()
    expect(screen.getByText(/综合得分最高/)).toBeInTheDocument()
    expect(screen.getByText(/评分明细/)).toHaveTextContent('canonical_table_boost +0.08')
    expect(screen.getByText('awaiting_confirmation · v4')).toBeInTheDocument()
    expect(screen.getByTestId('copilot-run-state')).toHaveTextContent('当前状态：等待你确认数据来源')
    expect(screen.getByTestId('copilot-run-state')).toHaveTextContent('后台没有继续运行')
    const artifacts = screen.getByTestId('artifact-panel')
    expect(within(artifacts).getByTestId('artifact-guidance')).toHaveTextContent('流程已阻塞：确认数据来源')

    fireEvent.click(screen.getByRole('button', { name: /使用此来源/ }))

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        sessionId: 'session_source_candidate',
        message: '使用这个来源：dw.dwd_class_activity_df',
        action: 'confirm_source_candidate',
        candidate_id: 'table:7:dw:dwd_class_activity_df',
      }),
    )
  })

  it('推荐数据来源展示数据资产底座候选的资产引用与证据边界', () => {
    activeSessionFixture = DATA_ASSET_SOURCE_CANDIDATE_SESSION
    renderAt('/semantic/modeling-copilot/session_data_asset_source_candidate')

    expect(screen.getByText('数据资产底座 smoke 评论事实表')).toBeInTheDocument()
    expect(screen.getByText('data_asset_table')).toBeInTheDocument()
    expect(screen.getByText('data-asset-smoke.df_cb_258187.dw_smoke.dwd_data_asset_smoke_df')).toBeInTheDocument()
    expect(screen.getByText('EvidenceBundle')).toBeInTheDocument()
    expect(screen.getByText('runtime_truth=false')).toBeInTheDocument()
    expect(screen.getByText(/行数：128/)).toBeInTheDocument()
  })

  it('右侧 Trace tab 回放工具调用、用户动作和发布审计链路', () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      current_proposal_id: 'proposal_1',
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        proposal_summary: { id: 'proposal_1', status: 'validated' },
      },
    }
    activeReviewFixture = {
      session_id: 'session_1',
      proposal_id: 'proposal_1',
      status: 'ready_to_publish',
      status_label: '发布前检查通过，等待确认发布',
      changes: [],
      blockers: [],
      reason_explanations: [],
      data_agent_consumption: { state: 'ready_after_publish', label: '发布后 Data Agent 可消费', reasons: [] },
      primary_action: { action: 'publish', label: '发布', disabled: false },
      trace_state: {
        events: [
          { id: 'tool_search', type: 'tool', title: 'search_ontology', status: 'completed', summary: '已检索 active Ontology 资产' },
          { id: 'human_confirm', type: 'human', title: '用户确认学校维度', status: 'completed', summary: 'comment_school_name' },
          { id: 'audit_save', type: 'audit', title: '发布审计准备', status: 'ready', summary: 'proposal_1 已进入发布前检查' },
        ],
      },
    }
    renderAt('/semantic/modeling-copilot/session_1')

    const artifacts = screen.getByTestId('artifact-panel')
    fireEvent.click(within(artifacts).getByRole('button', { name: '审计回放' }))

    expect(within(artifacts).getByTestId('artifact-trace-panel')).toBeInTheDocument()
    expect(within(artifacts).getByText('Trace 回放')).toBeInTheDocument()
    expect(within(artifacts).getByText('search_ontology')).toBeInTheDocument()
    expect(within(artifacts).getByText('用户确认学校维度')).toBeInTheDocument()
    expect(within(artifacts).getByText('发布审计准备')).toBeInTheDocument()
  })

  it('Review 展示 Publish Gate 与发布后 Data Agent 验收状态', () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      current_proposal_id: 'proposal_1',
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        publish_result: { status: 'published', proposal_id: 'proposal_1' },
      },
    }
    activeReviewFixture = {
      session_id: 'session_1',
      proposal_id: 'proposal_1',
      status: 'published',
      status_label: '已发布 · Data Agent 可消费',
      changes: [],
      blockers: [],
      reason_explanations: [],
      data_agent_consumption: { state: 'available', label: '正式 Data Agent 可消费', reasons: [] },
      primary_action: { action: 'none', label: '已发布', disabled: true },
      publish_gate: {
        state: 'published',
        label: '发布门禁已通过',
        steps: [
          { id: 'spec', label: 'Spec 完整', status: 'passed', description: 'raw_spec 已保存' },
          { id: 'sandbox', label: '沙盒预演', status: 'passed', description: '草稿预演通过' },
          { id: 'runtime', label: '正式 runtime', status: 'passed', description: 'Data Agent 可消费' },
        ],
      },
      post_publish_validation: {
        status: 'passed',
        label: '样例问答验收通过',
        sample_question: '最近 7 天学生评论数按学校汇总',
        runtime_route: 'student_comment_cube',
        result_summary: '正式 Data Agent 已能命中 student_comment_cube。',
      },
    }
    renderAt('/semantic/modeling-copilot/session_1')

    const artifacts = screen.getByTestId('artifact-panel')
    expandArtifacts(artifacts)

    expect(within(artifacts).getByText('发布前状态')).toBeInTheDocument()
    expect(within(artifacts).getAllByText('发布前检查').length).toBeGreaterThan(0)
    expect(within(artifacts).getByText('发布门禁已通过')).toBeInTheDocument()
    expect(within(artifacts).getByText('发布后验收')).toBeInTheDocument()
    expect(within(artifacts).getByText('样例问答验收通过')).toBeInTheDocument()
    expect(within(artifacts).getByText('student_comment_cube')).toBeInTheDocument()
  })

  it('使用推荐按钮把推荐值传给 confirm', async () => {
    activeSessionFixture = ANALYZED_SESSION
    renderAt('/semantic/modeling-copilot/session_1')

    fireEvent.click(within(screen.getByTestId('chat-workspace')).getByRole('button', { name: /使用推荐/ }))
    await waitFor(() =>
      expect(confirmAssumption).toHaveBeenCalledWith({
        sessionId: 'session_1',
        confirmationId: 'confirm_school_dimension',
        value: 'comment_school_name',
      }),
    )
  })

  it('阻断确认全部清空后「应用语义」按钮可用 -> 调 saveProposal', async () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
      },
    }
    renderAt('/semantic/modeling-copilot/session_1')

    fireEvent.click(within(screen.getByTestId('chat-next-action')).getByRole('button', { name: /应用语义/ }))
    await waitFor(() =>
      expect(saveProposal).toHaveBeenCalledWith({ sessionId: 'session_1' }),
    )
  })

  it('Cube 草稿待应用时允许直接「应用语义」，保留接受草稿作为显式锁定动作', async () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        raw_spec: { cubes: [{ name: 'student_comment_cube', source: 'dwd_x', dimensions: [], measures: [] }] } as Record<string, unknown>,
      },
    }
    renderAt('/semantic/modeling-copilot/session_1')

    expect(screen.getByText('建议新建 Cube')).toBeInTheDocument()
    expect(screen.getAllByText('student_comment_cube').length).toBeGreaterThan(0)
    const applyBtn = screen.getByRole('button', { name: /应用语义/ })
    expect(applyBtn).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /接受草稿/ })).toBeInTheDocument()
    fireEvent.click(applyBtn)
    await waitFor(() =>
      expect(saveProposal).toHaveBeenCalledWith({ sessionId: 'session_1' }),
    )
  })

  it('接受 Cube 草稿 -> 走确定性 accept action，不发起 sendMessage', async () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        raw_spec: { cubes: [{ name: 'student_comment_cube', source: 'dwd_x' }] } as Record<string, unknown>,
      },
    }
    renderAt('/semantic/modeling-copilot/session_1')

    fireEvent.click(screen.getByRole('button', { name: /接受草稿/ }))
    await waitFor(() =>
      expect(acceptCubeDraft).toHaveBeenCalledWith({ sessionId: 'session_1' }),
    )
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('已保存 Proposal 后展示「确认发布」按钮，点击调 publish', async () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      current_proposal_id: 'proposal_x',
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        proposal_summary: { id: 'proposal_x', status: 'validated' },
      },
    }
    renderAt('/semantic/modeling-copilot/session_1')

    expect(screen.getByText('语义已应用 · 待发布')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /确认发布/ }))
    await waitFor(() =>
      expect(publishProposal).toHaveBeenCalledWith({ sessionId: 'session_1' }),
    )
  })

  it('发布失败时在 Chat 主链路展示可定位的阻断项', async () => {
    publishProposal.mockRejectedValueOnce(
      new AppError('PUBLISH_FAILED', 400, '发布建模语义失败: Applied assets drift from approved semantic_diff'),
    )
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      current_proposal_id: 'proposal_x',
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        proposal_summary: { id: 'proposal_x', status: 'validated' },
      },
    }
    renderAt('/semantic/modeling-copilot/session_1')

    fireEvent.click(screen.getByRole('button', { name: /确认发布/ }))

    const failure = await screen.findByTestId('copilot-action-error')
    expect(within(failure).getByText('发布失败')).toBeInTheDocument()
    expect(within(failure).getByText(/已批准差异和应用资产不一致/)).toBeInTheDocument()
    expect(within(failure).getByRole('button', { name: /打开 Spec/ })).toBeInTheDocument()
  })

  it('沙盒预演 blocked 给出业务化引导文案', () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        sandbox_preview: { status: 'blocked', summary: '暂无 spec' },
        // Cube 草稿存在但未接受
        raw_spec: { cubes: [{ name: 'c1', source: 'dwd_x' }] } as Record<string, unknown>,
      },
    }
    renderAt('/semantic/modeling-copilot/session_1')

    expect(screen.getByText('沙盒预演被阻塞：Cube 草稿还没接受')).toBeInTheDocument()
  })

  it('Review 展示字段候选摘要', () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        raw_spec: {
          ...ANALYZED_SESSION.workbench_state.raw_spec,
          cube: {
            ...(ANALYZED_SESSION.workbench_state.raw_spec?.cube as Record<string, unknown>),
            field_candidate_trace: {
              candidate_set_id: 'fcs_student_comment',
              measure_count: 2,
              dimension_count: 3,
              risk_summary: { high: 1, medium: 2 },
            },
          },
        },
      },
    }
    renderAt('/semantic/modeling-copilot/session_1')

    const artifacts = screen.getByTestId('artifact-panel')
    expect(within(artifacts).getByText('字段候选 Review')).toBeInTheDocument()
    expect(within(artifacts).getByText('fcs_student_comment')).toBeInTheDocument()
    expect(within(artifacts).getByText('指标 2')).toBeInTheDocument()
    expect(within(artifacts).getByText('维度 3')).toBeInTheDocument()
    expect(within(artifacts).getByText('风险 high 1 / medium 2')).toBeInTheDocument()
  })

  it('沙盒预演调 previewSandbox，不污染 runtime', async () => {
    activeSessionFixture = ANALYZED_SESSION
    renderAt('/semantic/modeling-copilot/session_1')

    fireEvent.click(within(screen.getByTestId('chat-next-action')).getByRole('button', { name: /沙盒预演/ }))
    await waitFor(() =>
      expect(previewSandbox).toHaveBeenCalledWith({ sessionId: 'session_1' }),
    )
  })

  it('权限不足时给出业务化中文错误', async () => {
    createSession.mockRejectedValueOnce(
      new AppError('INSUFFICIENT_ROLE', 403, 'Insufficient permissions', {
        required_roles: ['platform_admin'],
        principal_roles: ['viewer'],
      }),
    )

    renderAt('/semantic/modeling-copilot/new')

    fireEvent.change(screen.getByLabelText('建模目标'), {
      target: { value: '查询最近7天学生评论数，按学校汇总' },
    })
    fireEvent.click(screen.getByRole('button', { name: /发送/ }))

    expect(await screen.findByText(/当前账号不能执行该建模动作/)).toBeInTheDocument()
    expect(screen.getByText(/当前角色 viewer/)).toBeInTheDocument()
  })

  it('左栏 sessions 列表渲染并标记 active / 已保存状态', () => {
    sessionsFixture = [
      { ...ANALYZED_SESSION, id: 'session_1', title: '订单退款率' },
      {
        ...ANALYZED_SESSION,
        id: 'session_2',
        title: '班级活跃度',
        current_proposal_id: 'proposal_a91c2b',
      },
    ]
    activeSessionFixture = sessionsFixture[0]
    const { container } = renderAt('/semantic/modeling-copilot/session_1')

    const aside = container.querySelector('aside')
    expect(aside).not.toBeNull()
    const sidebar = aside as HTMLElement
    expect(within(sidebar).getByText('AI 建模')).toBeInTheDocument()
    expect(within(sidebar).getByText('最近 3 天')).toBeInTheDocument()
    expect(within(sidebar).getByText('订单退款率')).toBeInTheDocument()
    expect(within(sidebar).getByText('班级活跃度')).toBeInTheDocument()

    const savedRow = within(sidebar).getByText('班级活跃度').closest('button')
    expect(savedRow).not.toBeNull()
    expect(within(savedRow as HTMLElement).getByText('已保存')).toBeInTheDocument()
  })

  it('左栏最近会话只展示近三天，并对列表分页', () => {
    const now = Date.now()
    sessionsFixture = Array.from({ length: 10 }, (_, index) => ({
      ...ANALYZED_SESSION,
      id: `recent_${index}`,
      title: `近三天会话 ${index + 1}`,
      updated_at: new Date(now - index * 60 * 1000).toISOString(),
    }))
    sessionsFixture.push({
      ...ANALYZED_SESSION,
      id: 'old_session',
      title: '四天前会话',
      updated_at: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
    })
    activeSessionFixture = sessionsFixture[0]
    const { container } = renderAt('/semantic/modeling-copilot/recent_0')

    const sidebar = container.querySelector('aside') as HTMLElement
    expect(within(sidebar).getByText('10')).toBeInTheDocument()
    expect(within(sidebar).queryByText('四天前会话')).not.toBeInTheDocument()
    expect(within(sidebar).getByText('近三天会话 1')).toBeInTheDocument()
    expect(within(sidebar).queryByText('近三天会话 9')).not.toBeInTheDocument()

    fireEvent.click(within(sidebar).getByRole('button', { name: '下一页' }))
    expect(within(sidebar).getByText('2/2')).toBeInTheDocument()
    expect(within(sidebar).getByText('近三天会话 9')).toBeInTheDocument()
  })

  it('空态渲染：未提供 sessionId 时显示引导卡', () => {
    activeSessionFixture = null
    renderAt('/semantic/modeling-copilot/new')

    expect(screen.getByText('告诉我你想分析什么数据')).toBeInTheDocument()
    expect(screen.getByText('查询最近 7 天学生评论数，按学校汇总')).toBeInTheDocument()
  })

  it('点击示例卡把文案预填到 composer', () => {
    activeSessionFixture = null
    renderAt('/semantic/modeling-copilot/new')

    fireEvent.click(screen.getByText('查询最近 7 天学生评论数，按学校汇总'))
    const composer = screen.getByLabelText('建模目标') as HTMLTextAreaElement
    expect(composer.value).toBe('查询最近 7 天学生评论数，按学校汇总')
  })
})
