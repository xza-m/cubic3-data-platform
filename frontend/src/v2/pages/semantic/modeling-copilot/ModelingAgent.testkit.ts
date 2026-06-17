// frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.testkit.ts
//
// ModelingAgent 拆分测试的共享 testkit：mock 句柄、fixtures、hooks mock 对象与状态重置。
// 各测试文件通过 vi.mock(..., async () => (await import("./ModelingAgent.testkit")).xxx) 装配。

import { vi } from "vitest";
import { fireEvent, within } from "@testing-library/react";
import type { SemanticModelingCopilotSession } from "@v2/api/semantic";
import type { AgentRuntimeManagementSnapshot } from "@v2/api/agent-runtime";

// ── mock hooks 句柄（与真实接口形状一致，但只关心 mutateAsync 调用） ──────────
export const createSession = vi.fn();
export const sendMessage = vi.fn();
export const confirmAssumption = vi.fn();
export const acceptCubeDraft = vi.fn();
export const previewSandbox = vi.fn();
export const previewRelease = vi.fn();
export const saveProposal = vi.fn();
export const publishProposal = vi.fn();
export const deleteSessionMut = vi.fn();
export const renameSessionMut = vi.fn();
export const updateSpecMut = vi.fn();

export const fixtures = {
  activeSession: null as SemanticModelingCopilotSession | null,
  sessions: [] as SemanticModelingCopilotSession[],
  activeReview: null as unknown,
  runtimeSnapshot: undefined as AgentRuntimeManagementSnapshot | undefined,
};

export function makeQueryResult<T>(data: T | undefined, isError = false) {
  return {
    data,
    isLoading: false,
    isFetching: false,
    isError,
    error: undefined,
    refetch: vi.fn(),
  };
}

export const semanticHooksMock = {
  useSemanticModelingCopilotSession: () =>
    makeQueryResult(fixtures.activeSession ?? undefined),
  useSemanticModelingCopilotReview: () =>
    makeQueryResult(fixtures.activeReview ?? undefined),
  useSemanticModelingCopilotSessions: () =>
    makeQueryResult({ items: fixtures.sessions, total: fixtures.sessions.length }),
  useCreateSemanticModelingCopilotSession: () => ({
    mutateAsync: createSession,
    isPending: false,
  }),
  useSendSemanticModelingCopilotMessage: () => ({
    mutateAsync: sendMessage,
    isPending: false,
  }),
  useConfirmSemanticModelingCopilotAssumption: () => ({
    mutateAsync: confirmAssumption,
    isPending: false,
  }),
  useAcceptSemanticModelingCopilotCubeDraft: () => ({
    mutateAsync: acceptCubeDraft,
    isPending: false,
  }),
  usePreviewSemanticModelingCopilotSandbox: () => ({
    mutateAsync: previewSandbox,
    isPending: false,
  }),
  usePreviewSemanticModelingCopilotRelease: () => ({
    mutateAsync: previewRelease,
    isPending: false,
  }),
  useSaveSemanticModelingCopilotProposal: () => ({
    mutateAsync: saveProposal,
    isPending: false,
  }),
  usePublishSemanticModelingCopilotProposal: () => ({
    mutateAsync: publishProposal,
    isPending: false,
  }),
  useDeleteSemanticModelingCopilotSession: () => ({
    mutateAsync: deleteSessionMut,
    isPending: false,
  }),
  useRenameSemanticModelingCopilotSession: () => ({
    mutateAsync: renameSessionMut,
    isPending: false,
  }),
  useUpdateSemanticModelingCopilotSpec: () => ({
    mutate: updateSpecMut,
    mutateAsync: updateSpecMut,
    isPending: false,
  }),
};

export const agentRuntimeHooksMock = {
  useAgentRuntimeStatus: () => makeQueryResult(fixtures.runtimeSnapshot),
};

// F6：<Can> 权限门控在单测中默认放行（避免依赖真实 auth/me 查询）。
export const accessPermissionsHooksMock = {
  useAccessPermissions: () => ({
    permissions: ["*"],
    isAuthenticated: true,
    isLoading: false,
  }),
  hasAccessPermission: (permissions: string[], required: string) =>
    !required || permissions.includes("*") || permissions.includes(required),
  permissionsFromUser: () => ["*"],
};

// ── 固定 fixture：覆盖 discovered + confirmation + saved 三类卡 ──────────────

export const ANALYZED_SESSION: SemanticModelingCopilotSession = {
  id: "session_1",
  user_goal: "查询最近7天学生评论数，按学校汇总",
  entry_type: "business_question",
  status: "active",
  conversation: [
    { role: "user", content: "查询最近7天学生评论数，按学校汇总" },
    {
      role: "assistant",
      content: "我已识别建模目标并完成已有语义与候选资产检索。",
    },
  ],
  workbench_state: {
    agent_message: "我已识别建模目标并完成已有语义与候选资产检索。",
    semantic_canvas: {
      objects: [
        { name: "student_comment", title: "学生评论", status: "active" },
      ],
      metrics: [
        {
          name: "student_comment_total_count",
          title: "学生评论总数",
          status: "active",
        },
      ],
      dimensions: [
        { name: "comment_school_name", title: "学校名称", status: "active" },
        {
          name: "comment_published_at",
          title: "评论发布时间",
          status: "active",
        },
      ],
      bindings: [
        {
          metric: "student_comment_total_count",
          measure_ref: "dwd_interaction_comment_reports_df.total_count",
          status: "linked",
        },
      ],
      policies: [
        {
          name: "school_scope",
          visibility: "restricted",
          status: "restricted",
        },
      ],
    },
    candidate_cards: [
      {
        id: "cube_dwd_interaction_comment_reports_df",
        name: "dwd_interaction_comment_reports_df",
        title: "学生评论举报事实表 Cube",
        score: 0.82,
        reason:
          "真实评论/举报明细表已发布为 active Cube，可支撑学生评论数按学校汇总。",
      },
    ],
    required_confirmations: [
      {
        id: "confirm_school_dimension",
        title: "学校维度",
        question: "学校维度从哪个字段取？",
        recommended_value: "comment_school_name",
        recommended_reason:
          "真实语义资产已暴露 comment_school_name，能直接支撑按学校名称汇总。",
        explain:
          '业务问题里的"学校"需要落到学生评论事实表上的发布者学校字段，影响最终 GROUP BY 粒度。',
        blocking: true,
      },
    ],
    evidence_summary: [
      {
        id: "question-intent",
        type: "user_goal",
        trust_level: "P1",
        extracted_claim: "查询最近7天学生评论数，按学校汇总",
      },
    ],
    source_evidence: {
      source_table: {
        name: "df_cb_258187.dwd_interaction_comment_reports_df",
        title: "学生评论举报明细表",
        grain: "一条学生评论/举报事件",
        freshness: "T+1",
      },
      fields: [
        {
          name: "comment_school_name",
          title: "学校名称",
          type: "string",
          role: "dimension",
          evidence: "按学校汇总需要落到评论发布者学校字段。",
        },
        {
          name: "report_id",
          title: "举报 ID",
          type: "string",
          role: "measure_source",
          evidence: "评论数可按 report_id 去重计数。",
        },
        {
          name: "comment_published_at",
          title: "评论发布时间",
          type: "datetime",
          role: "time",
          evidence: "最近 7 天过滤需要稳定时间字段。",
        },
      ],
      sample_rows: [
        {
          comment_school_name: "示例学校",
          report_id: "r_1001",
          comment_published_at: "2026-05-10 09:00:00",
        },
      ],
      recommendations: [
        {
          id: "source-table",
          title: "为什么选择这张表",
          reason: "该表同时包含学校、评论、发布时间与举报状态字段。",
        },
      ],
    },
    readiness: {
      canonical_ready: false,
      exploratory_ready: true,
      reasons: ["business_owner_confirmation_required", "binding_not_approved"],
    },
    raw_spec: {
      spec_version: "v1",
      cube: {
        name: "dwd_interaction_comment_reports_df",
        title: "学生评论",
        source: "df_cb_258187.dwd_interaction_comment_reports_df",
        dimensions: [
          {
            name: "comment_school_name",
            type: "string",
            expr: "comment_school_name",
          },
          {
            name: "comment_published_at",
            type: "datetime",
            expr: "comment_published_at",
          },
        ],
        measures: [
          {
            name: "total_count",
            type: "count",
            sql: "COUNT(`report_id`)",
            time_dimension: "comment_published_at",
          },
        ],
      },
      ontology: {
        object: { name: "student_comment", title: "学生评论" },
        metrics: [
          {
            name: "student_comment_total_count",
            title: "学生评论总数",
            measure_refs: ["dwd_interaction_comment_reports_df.total_count"],
          },
        ],
      },
    },
    proposal_patch: {
      source_mode: "agent_led",
      source_kind: "business_question",
      user_question: "查询最近7天学生评论数，按学校汇总",
      business_subject: "学生评论",
      candidate_table: "df_cb_258187.dwd_interaction_comment_reports_df",
    },
  },
  tool_traces: [
    {
      tool: "search_ontology",
      status: "completed",
      summary: "已检索 active Ontology 资产",
    },
  ],
};

export const RUNTIME_SNAPSHOT: AgentRuntimeManagementSnapshot = {
  providers: [
    {
      runtime_name: "openai_compatible",
      label: "OpenAI Runtime",
      configured: true,
      available: true,
      status: "ready",
      message: "OpenAI Runtime 已配置。",
      operations: ["test_connection"],
      details: { model: "gpt-4o-mini" },
    },
    {
      runtime_name: "codex_sdk",
      label: "Codex SDK",
      configured: false,
      available: false,
      status: "disabled",
      message: "Codex SDK 未启用。",
      operations: [],
      details: { provider: "codex-sdk", ui_managed: false },
    },
  ],
  action_bindings: [
    {
      action: "semantic.modeling.generate_candidates",
      default_runtime: "openai_compatible",
      allowed_runtimes: ["openai_compatible"],
      expose_selector: false,
      requires_connection: false,
      reason: "fixed_openai_low_latency",
    },
    {
      action: "semantic.modeling.review_proposal",
      default_runtime: "codex_sdk",
      allowed_runtimes: ["codex_sdk"],
      expose_selector: false,
      requires_connection: true,
      reason: "fixed_codex_workspace",
    },
  ],
};

export const CODEX_MANAGED_RUNTIME_SNAPSHOT: AgentRuntimeManagementSnapshot = {
  ...RUNTIME_SNAPSHOT,
  providers: RUNTIME_SNAPSHOT.providers.map((provider) =>
    provider.runtime_name === "codex_sdk"
      ? {
          ...provider,
          configured: true,
          available: false,
          status: "not_verified",
          message: "Codex SDK 已配置，等待真实联通测试。",
          operations: ["test_connection", "capabilities"],
          details: { provider: "codex-sdk", ui_managed: true },
        }
      : provider,
  ),
};

export const PASSED_RELEASE_PREVIEW = {
  target: "semantic_center",
  semantic_compile: {
    status: "passed",
    message: "语义中心编译预演通过。",
  },
  compiled_sql: "",
  release_diff: {
    added: ["cube.dwd_interaction_comment_reports_df"],
    changed: [],
    removed: [],
  },
  impact_summary: {
    affected_assets: ["cube.dwd_interaction_comment_reports_df"],
    affected_consumers: ["Data Agent", "BI", "数据分析"],
    risk_level: "low",
  },
  gateway_validation: {
    status: "not_configured",
    message: "Gateway 执行面未接通，不影响语义中心编译门禁。",
  },
  consumer_validation: {
    status: "pending",
    samples: [],
  },
};

export const NO_SOURCE_SESSION: SemanticModelingCopilotSession = {
  id: "session_no_source",
  user_goal: 'Data Agent 没听懂"班级活跃度"，帮我补语义',
  entry_type: "business_question",
  status: "active",
  conversation: [
    { role: "user", content: 'Data Agent 没听懂"班级活跃度"，帮我补语义' },
    {
      role: "assistant",
      content: "还缺少可生成语义草案的源表线索，请继续补充物理表或候选数据集。",
    },
  ],
  workbench_state: {
    agent_message:
      "还缺少可生成语义草案的源表线索，请继续补充物理表或候选数据集。",
    semantic_canvas: {
      objects: [{ name: "class", title: "班级", status: "draft" }],
      metrics: [
        { name: "class_activity", title: "班级活跃度", status: "candidate" },
      ],
      dimensions: [{ name: "class_id", title: "班级", status: "candidate" }],
      bindings: [],
      policies: [],
    },
    candidate_cards: [],
    required_confirmations: [],
    evidence_summary: [
      {
        id: "metric-definition",
        type: "business_rule",
        trust_level: "P2",
        extracted_claim: "用户希望补齐班级活跃度语义",
      },
    ],
    readiness: {
      canonical_ready: false,
      exploratory_ready: false,
      reasons: ["need_source_table", "spec_not_generated"],
    },
    raw_spec: {},
    proposal_patch: {
      source_mode: "agent_led",
      source_kind: "business_question",
      user_question: 'Data Agent 没听懂"班级活跃度"，帮我补语义',
      business_subject: "班级活跃度",
    },
  },
  tool_traces: [
    {
      tool: "generate_semantic_draft",
      status: "skipped",
      summary: "缺少源表，跳过 spec 生成",
    },
  ],
};

export const SOURCE_CANDIDATE_SESSION: SemanticModelingCopilotSession = {
  ...NO_SOURCE_SESSION,
  id: "session_source_candidate",
  state: "awaiting_confirmation",
  state_version: 4,
  conversation: [
    { role: "user", content: 'Data Agent 没听懂"班级活跃度"，帮我补语义' },
    {
      role: "assistant",
      content:
        "我找到了候选数据来源。请先选择一项，我会基于它生成可审阅 spec。",
    },
  ],
  workbench_state: {
    ...NO_SOURCE_SESSION.workbench_state,
    agent_message:
      "我找到了候选数据来源。请先选择一项，我会基于它生成可审阅 spec。",
    source_candidates: [
      {
        id: "table:7:dw:dwd_class_activity_df",
        asset_type: "table",
        source_kind: "physical_table",
        source_id: 7,
        database: "dw",
        table: "dwd_class_activity_df",
        name: "dw.dwd_class_activity_df",
        title: "班级活跃事实表",
        confidence: "high",
        score: 0.86,
        score_breakdown: {
          source_base: 0.42,
          lexical_match: 0.28,
          canonical_table_boost: 0.08,
        },
        why_selected:
          "综合得分最高：命中班级互动活跃事实表，来自 datasource 元数据缓存。",
        evidence: ["数据源表缓存命中，未实时连接外部库"],
      },
    ],
    readiness: {
      canonical_ready: false,
      exploratory_ready: false,
      reasons: ["source_candidate_confirmation_required", "spec_not_generated"],
    },
  },
};

export const DATA_ASSET_SOURCE_CANDIDATE_SESSION: SemanticModelingCopilotSession = {
  ...SOURCE_CANDIDATE_SESSION,
  id: "session_data_asset_source_candidate",
  workbench_state: {
    ...SOURCE_CANDIDATE_SESSION.workbench_state,
    source_candidates: [
      {
        id: "data-asset:dw_smoke:dwd_data_asset_smoke_df",
        asset_type: "data_asset_table",
        name: "dwd_data_asset_smoke_df",
        title: "数据资产底座 smoke 评论事实表",
        asset_ref: {
          qualified_name:
            "data-asset-smoke.df_cb_258187.dw_smoke.dwd_data_asset_smoke_df",
        },
        evidence_bundle: {
          runtime_truth: false,
          sample_profile: {
            row_count: 128,
            partition_count: 1,
            profile_status: "fresh",
          },
        },
      },
    ],
  },
};

export function expandArtifacts(artifacts: HTMLElement) {
  const expand = within(artifacts).queryByRole("button", { name: "展开" });
  if (expand) fireEvent.click(expand);
}

/** 重置 mock 与 fixtures（等价于原 ModelingAgent.test.tsx 的 beforeEach）。 */
export function resetModelingAgentTestState() {
    vi.clearAllMocks();
    fixtures.activeSession = null;
    fixtures.sessions = [];
    fixtures.activeReview = null;
    fixtures.runtimeSnapshot = RUNTIME_SNAPSHOT;
    createSession.mockResolvedValue({
      ...ANALYZED_SESSION,
      conversation: [
        { role: "user", content: "查询最近7天学生评论数，按学校汇总" },
      ],
    });
    sendMessage.mockResolvedValue(ANALYZED_SESSION);
    acceptCubeDraft.mockResolvedValue({
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        cube_draft_accepted: true,
      },
    });
    confirmAssumption.mockResolvedValue({
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
      },
    });
    previewSandbox.mockResolvedValue({
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        sandbox_preview: { status: "ready", pollutes_official_route: false },
      },
    });
    previewRelease.mockResolvedValue({
      ...ANALYZED_SESSION,
      current_proposal_id: "proposal_1",
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        release_preview: {
          target: "semantic_center",
          semantic_compile: {
            status: "not_configured",
            message: "语义中心编译预演未配置，未生成物理 SQL。",
          },
          compiled_sql: "",
          release_diff: {
            added: ["cube.dwd_interaction_comment_reports_df"],
            changed: [],
            removed: [],
          },
          impact_summary: {
            affected_assets: ["cube.dwd_interaction_comment_reports_df"],
            affected_consumers: ["Data Agent", "BI", "数据分析"],
            risk_level: "low",
          },
          gateway_validation: {
            status: "not_configured",
            message: "等待语义中心返回物理 SQL，未调用 gateway SQL dry-run。",
          },
          consumer_validation: {
            status: "pending",
            samples: [
              {
                question: "查询最近7天学生评论数，按学校汇总",
                consumer: "semantic_center",
                status: "pending_gateway_validation",
              },
            ],
          },
        },
      },
    });
    saveProposal.mockResolvedValue({
      ...ANALYZED_SESSION,
      current_proposal_id: "proposal_1",
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        proposal_summary: { id: "proposal_1", status: "validated" },
      },
    });
}
