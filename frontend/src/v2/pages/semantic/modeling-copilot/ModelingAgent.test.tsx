// frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.test.tsx
//
// 语义建设工作台单资产 Builder 测试。
// 覆盖：
//   - 业务问题启动 -> 结构化卡片（discovered + confirmation）渲染
//   - 阻断确认 -> 保存 Proposal 流程
//   - 可用性预演不污染语义中心发布快照
//   - 权限错误（INSUFFICIENT_ROLE）友好展示
//   - sessions 左栏列表 / 新建会话 / 删除入口

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AppError } from "@v2/api/types";
import type { SemanticModelingCopilotSession } from "@v2/api/semantic";
import type { AgentRuntimeManagementSnapshot } from "@v2/api/agent-runtime";
import { getBuilderAiActions } from "./builderAiActions";
import type { WorkbenchCandidateState } from "./workbenchContext";

// ── mock hooks（与真实接口形状一致，但只关心 mutateAsync 调用） ───────────────
const createSession = vi.fn();
const sendMessage = vi.fn();
const confirmAssumption = vi.fn();
const acceptCubeDraft = vi.fn();
const previewSandbox = vi.fn();
const previewRelease = vi.fn();
const saveProposal = vi.fn();
const publishProposal = vi.fn();
const deleteSessionMut = vi.fn();
const renameSessionMut = vi.fn();
const updateSpecMut = vi.fn();

let activeSessionFixture: SemanticModelingCopilotSession | null = null;
let sessionsFixture: SemanticModelingCopilotSession[] = [];
let activeReviewFixture: unknown = null;
let runtimeSnapshotFixture: AgentRuntimeManagementSnapshot | undefined =
  undefined;

function makeQueryResult<T>(data: T | undefined, isError = false) {
  return {
    data,
    isLoading: false,
    isFetching: false,
    isError,
    error: undefined,
    refetch: vi.fn(),
  };
}

vi.mock("@v2/hooks/semantic", () => ({
  useSemanticModelingCopilotSession: () =>
    makeQueryResult(activeSessionFixture ?? undefined),
  useSemanticModelingCopilotReview: () =>
    makeQueryResult(activeReviewFixture ?? undefined),
  useSemanticModelingCopilotSessions: () =>
    makeQueryResult({ items: sessionsFixture, total: sessionsFixture.length }),
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
}));

vi.mock("@v2/hooks/agent-runtime", () => ({
  useAgentRuntimeStatus: () => makeQueryResult(runtimeSnapshotFixture),
}));

import ModelingAgent from "./ModelingAgent";

// ── 固定 fixture：覆盖 discovered + confirmation + saved 三类卡 ──────────────

const ANALYZED_SESSION: SemanticModelingCopilotSession = {
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

const RUNTIME_SNAPSHOT: AgentRuntimeManagementSnapshot = {
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
      runtime_name: "codex_app_server",
      label: "Codex App Server",
      configured: false,
      available: false,
      status: "disabled",
      message: "Codex app-server 未启用。",
      operations: [],
      details: { ui_managed: false },
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
      default_runtime: "codex_app_server",
      allowed_runtimes: ["codex_app_server"],
      expose_selector: false,
      requires_connection: true,
      reason: "fixed_codex_workspace",
    },
  ],
};

const CODEX_MANAGED_RUNTIME_SNAPSHOT: AgentRuntimeManagementSnapshot = {
  ...RUNTIME_SNAPSHOT,
  providers: RUNTIME_SNAPSHOT.providers.map((provider) =>
    provider.runtime_name === "codex_app_server"
      ? {
          ...provider,
          configured: true,
          available: false,
          status: "not_verified",
          message: "Codex app-server 已配置，等待真实联通测试。",
          operations: ["test_connection", "start", "logs", "capabilities"],
          details: { ui_managed: true },
        }
      : provider,
  ),
};

const PASSED_RELEASE_PREVIEW = {
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

function renderAt(
  path: string,
  props: {
    workbenchContext?: WorkbenchCandidateState | null;
    embeddedInWorkbench?: boolean;
  } = {},
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/semantic/modeling-copilot/new"
          element={<ModelingAgent {...props} />}
        />
        <Route
          path="/semantic/modeling-copilot/:sessionId"
          element={<ModelingAgent {...props} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function expandArtifacts(artifacts: HTMLElement) {
  const expand = within(artifacts).queryByRole("button", { name: "展开" });
  if (expand) fireEvent.click(expand);
}

const NO_SOURCE_SESSION: SemanticModelingCopilotSession = {
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

const SOURCE_CANDIDATE_SESSION: SemanticModelingCopilotSession = {
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

const DATA_ASSET_SOURCE_CANDIDATE_SESSION: SemanticModelingCopilotSession = {
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

describe("ModelingAgent · 语义建设工作台", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeSessionFixture = null;
    sessionsFixture = [];
    activeReviewFixture = null;
    runtimeSnapshotFixture = RUNTIME_SNAPSHOT;
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
  });

  it("从空态发送业务问题，调 createSession + sendMessage", async () => {
    renderAt("/semantic/modeling-copilot/new");

    const builderGoal = "基于学生评论事实表建设评论数语义资产";
    expect(
      screen.getByText("从数仓数据建设可发布的语义资产"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /发布到语义中心后，Data Agent、BI、数据分析等消费者按同一快照验证/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(builderGoal)).toBeInTheDocument();

    const composer = screen.getByLabelText("建模目标");
    fireEvent.change(composer, { target: { value: builderGoal } });
    fireEvent.click(screen.getByRole("button", { name: /发送/ }));

    await waitFor(() =>
      expect(createSession).toHaveBeenCalledWith({
        user_goal: builderGoal,
        entry_type: "business_question",
      }),
    );
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        sessionId: "session_1",
        message: builderGoal,
      }),
    );
  });

  it("从工作台候选进入时预填候选目标，并在创建会话时携带上下文", async () => {
    const context: WorkbenchCandidateState = {
      workbenchMode: "batch",
      projectId: "build-learning",
      candidateId: "build-learning:fact:dwd-learning-activity-df",
      candidateTitle: "学情分析事实主题候选",
      target: "semantic_center",
      source: "dwd_learning_activity_df",
      grain: "一条学习行为事件",
      risk: "low",
      evidence: ["表画像显示行为时间字段完整。"],
    };
    renderAt("/semantic/modeling-copilot/new", { workbenchContext: context });

    const composer = screen.getByLabelText("建模目标") as HTMLTextAreaElement;
    expect(composer.value).toContain("dwd_learning_activity_df");
    expect(composer.value).toContain("学情分析事实主题候选");
    const expectedGoal = composer.value;

    fireEvent.click(screen.getByRole("button", { name: /发送/ }));

    await waitFor(() =>
      expect(createSession).toHaveBeenCalledWith({
        user_goal: expectedGoal,
        entry_type: "table_known",
        workbench_context: expect.objectContaining({
          projectId: "build-learning",
          candidateId: "build-learning:fact:dwd-learning-activity-df",
          target: "semantic_center",
          source: "dwd_learning_activity_df",
          grain: "一条学习行为事件",
        }),
      }),
    );
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        sessionId: "session_1",
        message: expectedGoal,
      }),
    );
  });

  it("候选上下文由 API 后到时，替换系统占位预填但不覆盖用户手写内容", async () => {
    const fallbackContext: WorkbenchCandidateState = {
      workbenchMode: "batch",
      projectId: "build-learning",
      candidateId: "build-learning:fact:dwd-learning-activity-df",
      candidateTitle: "build-learning:fact:dwd-learning-activity-df",
      target: "semantic_center",
      source: "未知源表",
      grain: "待确认粒度",
      risk: "medium",
      evidence: [],
    };
    const resolvedContext: WorkbenchCandidateState = {
      ...fallbackContext,
      candidateTitle: "学情分析事实主题候选",
      source: "dwd_learning_activity_df",
      grain: "一条学习行为事件",
      risk: "low",
      evidence: ["表画像显示行为时间字段完整。"],
    };

    const renderWithContext = (context: WorkbenchCandidateState) => (
      <MemoryRouter initialEntries={["/semantic/modeling-copilot/new"]}>
        <Routes>
          <Route
            path="/semantic/modeling-copilot/new"
            element={<ModelingAgent workbenchContext={context} />}
          />
        </Routes>
      </MemoryRouter>
    );

    const { rerender } = render(renderWithContext(fallbackContext));
    const composer = screen.getByLabelText("建模目标") as HTMLTextAreaElement;
    await waitFor(() => expect(composer.value).toContain("未知源表"));

    rerender(renderWithContext(resolvedContext));
    await waitFor(() => expect(composer.value).toContain("dwd_learning_activity_df"));
    expect(composer.value).toContain("一条学习行为事件");

    fireEvent.change(composer, { target: { value: "我手动改过的建设目标" } });
    rerender(
      renderWithContext({
        ...resolvedContext,
        grain: "更新后的粒度",
      }),
    );

    expect(composer.value).toBe("我手动改过的建设目标");
  });

  it("不把 Data Agent 表达成语义建设终点", () => {
    renderAt("/semantic/modeling-copilot/new");

    expect(screen.queryByText(/发布给 Data Agent/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/正式 Data Agent runtime/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /发布到语义中心后，Data Agent、BI、数据分析等消费者按同一快照验证/,
      ),
    ).toBeInTheDocument();
  });

  it("已有 session 时展示结构化卡片：已发现的语义资产 + 需要你确认", () => {
    activeSessionFixture = ANALYZED_SESSION;
    renderAt("/semantic/modeling-copilot/session_1");

    expect(screen.getByText("已发现的语义资产")).toBeInTheDocument();
    expect(screen.getByText("学生评论总数")).toBeInTheDocument();
    expect(
      screen.getByText("dwd_interaction_comment_reports_df.total_count"),
    ).toBeInTheDocument();
    expect(screen.getByText("需要你确认")).toBeInTheDocument();
    expect(screen.getByText("学校维度")).toBeInTheDocument();
    // 顶栏 readiness chip 用业务文案而不是英文
    expect(screen.getAllByText("请确认 1 项口径").length).toBeGreaterThan(0);
  });

  it("资产审阅面板展示 Cube 层和轻本体锚定摘要", () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        raw_spec: {
          cube: {
            name: "student_comment_cube",
            source: "public.dwd_student_comment",
            dimensions: { school_id: {}, published_at: {} },
            measures: { comment_count: {} },
          },
          ontology: {
            object: { title: "学生评论" },
            metrics: [
              {
                title: "学生评论数",
                measure_refs: ["student_comment_cube.comment_count"],
              },
            ],
          },
        },
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    const artifacts = screen.getByTestId("artifact-panel");
    expect(within(artifacts).getByText("两层语义建设")).toBeInTheDocument();
    expect(
      within(artifacts).getByText(/student_comment_cube · 2 维度 · 1 度量/),
    ).toBeInTheDocument();
    expect(
      within(artifacts).getByText(/学生评论 · 1 个指标术语 · 1 个绑定/),
    ).toBeInTheDocument();
    expect(screen.getAllByText("2 维度 · 1 度量").length).toBeGreaterThan(0);
    expect(screen.queryByText("0 维度 · 0 度量")).not.toBeInTheDocument();
  });

  it("已有 session 时展示 Builder stepper，并把语义草案标记为当前步骤", () => {
    activeSessionFixture = ANALYZED_SESSION;
    renderAt("/semantic/modeling-copilot/session_1");

    const stepper = screen.getByTestId("semantic-builder-stepper");
    expect(stepper).toHaveAttribute("aria-label", "语义冷启动进度");

    const stepLabels = [
      "建设范围",
      "来源证据",
      "字段候选",
      "语义草案",
      "发布校验",
      "发布结果",
    ];
    stepLabels.forEach((label) => {
      expect(within(stepper).getByText(label)).toBeInTheDocument();
    });

    const activeStep = within(stepper).getByText("语义草案").closest("li");
    expect(activeStep).not.toBeNull();
    expect(activeStep).toHaveAttribute("data-active", "true");
    expect(activeStep).toHaveAttribute("aria-current", "step");

    const actionPanel = screen.getByTestId("builder-ai-actions");
    expect(within(actionPanel).getByText("AI 建模助手")).toBeInTheDocument();
    expect(within(actionPanel).getAllByRole("button").length).toBeGreaterThan(
      0,
    );
  });

  it("点击字段候选 AI 动作只填入 composer，不自动发送", () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        source_evidence: undefined,
        source_candidates: [],
        field_candidate_trace: {
          candidate_set_id: "fcs_student_comment",
          candidates: [],
        },
        raw_spec: {},
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    fireEvent.click(screen.getByRole("button", { name: /生成字段候选/ }));

    const expectedPrompt = getBuilderAiActions("field_candidates").find(
      (action) => action.label === "生成字段候选",
    )?.prompt;
    expect(screen.getByLabelText("建模目标")).toHaveValue(expectedPrompt);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("展示平台 AI 状态但不在主流程暴露 runtime 切换器", () => {
    activeSessionFixture = ANALYZED_SESSION;
    renderAt("/semantic/modeling-copilot/session_1");

    expect(screen.getByTestId("agent-runtime-status")).toHaveTextContent(
      "AI · OpenAI",
    );
    expect(
      screen.queryByRole("button", { name: /启动 Codex/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Agent Runtime:/)).not.toBeInTheDocument();
  });

  it("已有待发布资产且复审服务需要连接时只提示去平台设置，不在业务页启动服务", () => {
    runtimeSnapshotFixture = CODEX_MANAGED_RUNTIME_SNAPSHOT;
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      current_proposal_id: "proposal_1",
    };
    renderAt("/semantic/modeling-copilot/session_1");

    expect(screen.getByTestId("codex-review-runtime-notice")).toHaveTextContent(
      "资产复审服务未连接",
    );
    expect(
      screen.queryByRole("button", { name: "启动 Codex" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "打开 AI 服务设置" }),
    ).toBeInTheDocument();
  });

  it("展示字段候选主画布并保留右侧发布检查", () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        raw_spec: {
          ...ANALYZED_SESSION.workbench_state.raw_spec,
          cube: {
            ...(ANALYZED_SESSION.workbench_state.raw_spec?.cube as Record<
              string,
              unknown
            >),
            field_candidate_trace: {
              candidate_set_id: "fcs_student_comment",
              candidates: [
                {
                  candidate_index: 1,
                  field: "comment_id",
                  label: "评论数",
                  role: "measure",
                  aggregation: "count",
                  confidence: 0.92,
                  evidence: "按评论 ID 计数可表达评论数。",
                  risk: "medium",
                },
              ],
            },
          },
        },
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    const chat = screen.getByTestId("chat-workspace");
    const fieldCanvas = screen.getByTestId("field-candidate-main-canvas");
    const artifacts = screen.getByTestId("artifact-panel");

    expect(within(chat).getByText("已发现的语义资产")).toBeInTheDocument();
    expect(within(chat).getByText("需要你确认")).toBeInTheDocument();
    expect(fieldCanvas).toBeInTheDocument();
    expect(within(fieldCanvas).getByText("字段候选主画布")).toBeInTheDocument();
    expect(
      within(fieldCanvas).getByRole("table", { name: "字段候选审阅" }),
    ).toBeInTheDocument();
    expect(within(fieldCanvas).getByText("评论数")).toBeInTheDocument();
    expect(
      within(artifacts).getByTestId("proposal-review-workbench"),
    ).toBeInTheDocument();
    expect(within(artifacts).getByText("资产审阅")).toBeInTheDocument();
    expect(
      within(artifacts).getByText(
        "建设摘要 / 字段候选 / 语义草案 / 来源证据 / 可用性验证 / 审计记录",
      ),
    ).toBeInTheDocument();
    expect(
      within(artifacts).getByRole("button", { name: "字段候选" }),
    ).toBeInTheDocument();
    expect(
      within(artifacts).getByRole("button", { name: "来源证据" }),
    ).toBeInTheDocument();
    expect(
      within(artifacts).getByRole("button", { name: /审计记录/ }),
    ).toBeInTheDocument();
    expect(within(artifacts).getByText("已确认")).toBeInTheDocument();
    expect(within(artifacts).getByText("语义草稿")).toBeInTheDocument();
    expect(within(artifacts).getByText("已生成")).toBeInTheDocument();
    expect(within(artifacts).getAllByText("发布前检查").length).toBeGreaterThan(
      0,
    );
    expect(
      within(artifacts).getByText(/流程已阻塞：学校维度口径待确认/),
    ).toBeInTheDocument();
    expect(
      within(artifacts).getByRole("button", { name: /语义草案/ }),
    ).toBeInTheDocument();
    expect(
      within(artifacts).queryByRole("button", {
        name: /发布到语义中心|保存|使用推荐/,
      }),
    ).not.toBeInTheDocument();

    expect(
      within(artifacts).getByTestId("proposal-review-workbench"),
    ).toBeInTheDocument();
    expect(within(artifacts).getAllByText("建设摘要").length).toBeGreaterThan(
      0,
    );
    expect(
      within(artifacts).getByText(/学校维度口径待确认/),
    ).toBeInTheDocument();
    expect(within(artifacts).getByText("为什么卡住")).toBeInTheDocument();
    expect(within(artifacts).getByText(/变更摘要/)).toBeInTheDocument();
    expect(
      within(artifacts).getByText("发布到语义中心检查"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("dwd_interaction_comment_reports_df").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("student_comment").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("student_comment_total_count").length,
    ).toBeGreaterThan(0);
    expect(
      within(artifacts).getByText(/学校维度口径待确认/),
    ).toBeInTheDocument();
    expect(
      within(artifacts).queryByText("语义绑定审批未完成"),
    ).not.toBeInTheDocument();
    expect(
      within(artifacts).queryByRole("button", {
        name: /发布到语义中心|保存|使用推荐|改语义配置/,
      }),
    ).not.toBeInTheDocument();
    expect(artifacts).not.toHaveTextContent(
      /Proposal|runtime_truth|EvidenceBundle|AI Runtime|Codex runtime|打开 Spec|最终 spec|validated|可审阅 artifact|待修复 · validation/,
    );
  });

  it("建设主流程中打开语义配置编辑会切到右侧语义草案 tab，并提供 AI 编辑入口", async () => {
    activeSessionFixture = ANALYZED_SESSION;
    renderAt("/semantic/modeling-copilot/session_1");

    const artifacts = screen.getByTestId("artifact-panel");
    fireEvent.click(
      within(screen.getByTestId("chat-workspace")).getByRole("button", {
        name: /在右侧编辑语义配置/,
      }),
    );

    expect(
      within(artifacts).getByLabelText("完整语义草案"),
    ).toBeInTheDocument();
    expect(
      within(artifacts).queryByTestId("cube-editor"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(artifacts).getByRole("button", { name: /让 AI 调整语义配置/ }),
    );
    expect(screen.getByLabelText("建模目标")).toHaveValue(
      "请基于当前完整语义草案调整语义配置：",
    );
  });

  it("右侧高级语义配置支持直接编辑完整草案并 PATCH spec", async () => {
    activeSessionFixture = ANALYZED_SESSION;
    renderAt("/semantic/modeling-copilot/session_1");

    const artifacts = screen.getByTestId("artifact-panel");
    fireEvent.click(
      within(screen.getByTestId("chat-workspace")).getByRole("button", {
        name: /在右侧编辑语义配置/,
      }),
    );

    const fullSpecEditor = within(artifacts).getByLabelText("完整语义草案");
    const nextSpec = {
      ...(ANALYZED_SESSION.workbench_state.raw_spec as Record<string, unknown>),
      business: { subject: "学生评论", sensitivity_level: "internal" },
    };
    fireEvent.change(fullSpecEditor, {
      target: { value: JSON.stringify(nextSpec, null, 2) },
    });
    fireEvent.click(
      within(artifacts).getByRole("button", { name: /保存高级语义配置/ }),
    );

    await waitFor(() =>
      expect(updateSpecMut).toHaveBeenCalledWith({
        sessionId: "session_1",
        body: {
          spec: expect.objectContaining({
            business: { subject: "学生评论", sensitivity_level: "internal" },
          }),
        },
      }),
    );
  });

  it("右侧 Review 只读辅助，口径确认仍从建设主流程完成", async () => {
    activeSessionFixture = ANALYZED_SESSION;
    renderAt("/semantic/modeling-copilot/session_1");

    const artifacts = screen.getByTestId("artifact-panel");
    expect(
      within(artifacts).queryByRole("button", { name: /使用推荐/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(screen.getByTestId("chat-workspace")).getByRole("button", {
        name: /使用推荐/,
      }),
    );

    await waitFor(() =>
      expect(confirmAssumption).toHaveBeenCalledWith({
        sessionId: "session_1",
        confirmationId: "confirm_school_dimension",
        value: "comment_school_name",
      }),
    );
  });

  it("流程状态留在建设主流程，右侧轻量 Review 只提示下一步", () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      tool_traces: [
        ...ANALYZED_SESSION.tool_traces,
        {
          tool: "generate_semantic_draft",
          status: "completed",
          summary: "已生成可审阅 spec",
        },
      ],
    };

    renderAt("/semantic/modeling-copilot/session_1");

    const chatState = screen.getByTestId("copilot-run-state");
    expect(
      within(chatState).getByText("当前状态：等待你确认口径"),
    ).toBeInTheDocument();
    expect(
      within(chatState).getByText(
        "在建设主流程的确认卡片里处理；后台没有继续运行。",
      ),
    ).toBeInTheDocument();
    expect(
      within(chatState).getByText("generate_semantic_draft · completed"),
    ).toBeInTheDocument();

    const railGuidance = screen.getByTestId("artifact-guidance");
    expect(
      within(railGuidance).getByText(/流程已阻塞：学校维度口径待确认/),
    ).toBeInTheDocument();
    expect(
      within(railGuidance).getByText(/在建设主流程的确认卡片里使用推荐值/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("artifact-run-state")).not.toBeInTheDocument();
  });

  it("右侧 Preview tab 展示草稿可用性验证和 Data Agent 消费边界", () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        sandbox_preview: {
          status: "ready",
          pollutes_official_route: false,
          sample_questions: ["最近 7 天学生评论数按学校汇总"],
        },
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    const artifacts = screen.getByTestId("artifact-panel");
    expandArtifacts(artifacts);
    fireEvent.click(
      within(artifacts).getByRole("button", { name: "可用性验证" }),
    );

    expect(within(artifacts).getByLabelText("可用性验证")).toBeInTheDocument();
    const previewPanel = within(artifacts).getByTestId(
      "artifact-preview-panel",
    );
    expect(within(artifacts).getByText("草稿可用性验证")).toBeInTheDocument();
    expect(
      within(artifacts).getByText("不写入语义中心发布快照"),
    ).toBeInTheDocument();
    expect(
      within(artifacts).getByText("Data Agent 暂不可基于语义中心发布快照验证"),
    ).toBeInTheDocument();
    expect(
      within(artifacts).getByText("最近 7 天学生评论数按学校汇总"),
    ).toBeInTheDocument();
    expect(previewPanel).not.toHaveTextContent("沙盒预演");
    expect(previewPanel).not.toHaveTextContent("runtime");
    expect(previewPanel).not.toHaveTextContent("Cube spec");
  });

  it("右侧 Preview tab 未运行时展示可用性验证 fallback 文案", () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        sandbox_preview: undefined,
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    const artifacts = screen.getByTestId("artifact-panel");
    expandArtifacts(artifacts);
    fireEvent.click(
      within(artifacts).getByRole("button", { name: "可用性验证" }),
    );

    const previewPanel = within(artifacts).getByTestId(
      "artifact-preview-panel",
    );
    expect(
      within(previewPanel).getByText("尚未运行可用性验证"),
    ).toBeInTheDocument();
    expect(
      within(previewPanel).getByText(
        "运行可用性预演后，这里会展示草稿是否能支撑原始业务问题。",
      ),
    ).toBeInTheDocument();
    expect(previewPanel).not.toHaveTextContent("沙盒预演");
    expect(previewPanel).not.toHaveTextContent("runtime");
    expect(previewPanel).not.toHaveTextContent("Cube spec");
  });

  it("右侧 Source tab 展示源表字段、样本行和推荐证据", () => {
    activeSessionFixture = ANALYZED_SESSION;
    renderAt("/semantic/modeling-copilot/session_1");

    const artifacts = screen.getByTestId("artifact-panel");
    expandArtifacts(artifacts);
    fireEvent.click(
      within(artifacts).getByRole("button", { name: "来源证据" }),
    );

    expect(
      within(artifacts).getByTestId("artifact-source-panel"),
    ).toBeInTheDocument();
    expect(within(artifacts).getByText("源表证据")).toBeInTheDocument();
    expect(
      within(artifacts).getByText(
        "df_cb_258187.dwd_interaction_comment_reports_df",
      ),
    ).toBeInTheDocument();
    expect(
      within(artifacts).getByText("comment_school_name"),
    ).toBeInTheDocument();
    expect(within(artifacts).getByText("样本行")).toBeInTheDocument();
    expect(within(artifacts).getByText("为什么选择这张表")).toBeInTheDocument();
  });

  it("缺少物理表或数据集时，右侧只提示在建设主流程补齐建模输入", () => {
    activeSessionFixture = NO_SOURCE_SESSION;
    renderAt("/semantic/modeling-copilot/session_no_source");

    const artifacts = screen.getByTestId("artifact-panel");
    const guidance = within(artifacts).getByTestId("artifact-guidance");
    expect(
      within(guidance).getByText("流程已阻塞：补充源表或数据集"),
    ).toBeInTheDocument();
    expect(
      within(guidance).getByText(/后台没有任务在运行/),
    ).toBeInTheDocument();
    expect(
      within(artifacts).queryByText("生成完整 spec"),
    ).not.toBeInTheDocument();

    const nudge = screen.getByTestId("chat-flow-nudge");
    expect(within(nudge).getByText("已阻塞")).toBeInTheDocument();
    expect(
      within(nudge).getByText("流程已阻塞：缺少数据来源"),
    ).toBeInTheDocument();
    expect(
      within(nudge).getByText(/当前没有后台任务在运行/),
    ).toBeInTheDocument();
    fireEvent.click(within(nudge).getByRole("button", { name: /填入模板/ }));
    expect(screen.getByLabelText("建模目标")).toHaveValue(
      "源表/数据集是 <database.table>；指标口径是 <计算规则>；按 <分组字段> 分组；时间字段是 <字段名>。",
    );

    expandArtifacts(artifacts);
    fireEvent.click(
      within(artifacts).getByRole("button", { name: "来源证据" }),
    );
    expect(
      within(artifacts).getByText("待补充源表/数据集"),
    ).toBeInTheDocument();
    expect(
      within(artifacts).getByText(
        /补充源表\/数据集、指标计算口径、分组字段和时间字段/,
      ),
    ).toBeInTheDocument();
  });

  it("召回候选来源后在建设主流程中确认，右侧只做轻量提示", async () => {
    activeSessionFixture = SOURCE_CANDIDATE_SESSION;
    sendMessage.mockResolvedValue({
      ...SOURCE_CANDIDATE_SESSION,
      workbench_state: {
        ...SOURCE_CANDIDATE_SESSION.workbench_state,
        readiness: {
          canonical_ready: false,
          exploratory_ready: true,
          reasons: ["ready_to_save"],
        },
        raw_spec: ANALYZED_SESSION.workbench_state.raw_spec,
      },
    });
    renderAt("/semantic/modeling-copilot/session_source_candidate");

    expect(screen.getByText("推荐数据来源")).toBeInTheDocument();
    expect(screen.getByText("班级活跃事实表")).toBeInTheDocument();
    expect(screen.getByText("dw.dwd_class_activity_df")).toBeInTheDocument();
    expect(screen.getByText(/综合得分最高/)).toBeInTheDocument();
    expect(screen.getByText(/评分明细/)).toHaveTextContent(
      "canonical_table_boost +0.08",
    );
    expect(screen.getByText("awaiting_confirmation · v4")).toBeInTheDocument();
    expect(screen.getByTestId("copilot-run-state")).toHaveTextContent(
      "当前状态：等待你确认数据来源",
    );
    expect(screen.getByTestId("copilot-run-state")).toHaveTextContent(
      "后台没有继续运行",
    );
    const artifacts = screen.getByTestId("artifact-panel");
    expect(
      within(artifacts).getByTestId("artifact-guidance"),
    ).toHaveTextContent("流程已阻塞：确认数据来源");

    fireEvent.click(screen.getByRole("button", { name: /使用此来源/ }));

    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        sessionId: "session_source_candidate",
        message: "使用这个来源：dw.dwd_class_activity_df",
        action: "confirm_source_candidate",
        candidate_id: "table:7:dw:dwd_class_activity_df",
      }),
    );
  });

  it("批量候选已有语义草稿时，推荐来源卡片降为只读状态", () => {
    const context: WorkbenchCandidateState = {
      workbenchMode: "batch",
      projectId: "build-learning-run-a",
      candidateId: "build-learning-run-a:fact:dwd-learning-activity-df",
      candidateTitle: "学情分析事实主题候选",
      target: "semantic_center",
      source: "dwd_learning_activity_df",
      grain: "一条学习行为事件",
      risk: "low",
      evidence: ["表画像显示行为时间字段完整。"],
    };
    activeSessionFixture = {
      ...SOURCE_CANDIDATE_SESSION,
      workbench_state: {
        ...SOURCE_CANDIDATE_SESSION.workbench_state,
        raw_spec: ANALYZED_SESSION.workbench_state.raw_spec,
      },
    };

    renderAt("/semantic/modeling-copilot/session_source_candidate", {
      workbenchContext: context,
      embeddedInWorkbench: true,
    });

    expect(screen.getByText("推荐数据来源")).toBeInTheDocument();
    expect(screen.getByText("来源已确认")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /使用此来源/ })).toBeNull();
  });

  it("推荐数据来源展示数据资产底座候选的资产引用与证据边界", () => {
    activeSessionFixture = DATA_ASSET_SOURCE_CANDIDATE_SESSION;
    renderAt("/semantic/modeling-copilot/session_data_asset_source_candidate");

    expect(
      screen.getByText("数据资产底座 smoke 评论事实表"),
    ).toBeInTheDocument();
    expect(screen.getByText("data_asset_table")).toBeInTheDocument();
    expect(
      screen.getByText(
        "data-asset-smoke.df_cb_258187.dw_smoke.dwd_data_asset_smoke_df",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("来源证据包")).toBeInTheDocument();
    expect(screen.getByText("语义中心事实源=否")).toBeInTheDocument();
    expect(screen.getByText(/行数：128/)).toBeInTheDocument();
  });

  it("右侧 Trace tab 回放工具调用、用户动作和发布审计链路", () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      current_proposal_id: "proposal_1",
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        proposal_summary: { id: "proposal_1", status: "validated" },
      },
    };
    activeReviewFixture = {
      session_id: "session_1",
      proposal_id: "proposal_1",
      status: "ready_to_publish",
      status_label: "待发布资产已保存，等待发布预演与确认",
      changes: [],
      blockers: [],
      reason_explanations: [],
      data_agent_consumption: {
        state: "ready_after_publish",
        label: "发布后消费者可验证",
        reasons: [],
      },
      primary_action: { action: "publish", label: "发布", disabled: false },
      trace_state: {
        events: [
          {
            id: "tool_search",
            type: "tool",
            title: "search_ontology",
            status: "completed",
            summary: "已检索 active Ontology 资产",
          },
          {
            id: "human_confirm",
            type: "human",
            title: "用户确认学校维度",
            status: "completed",
            summary: "comment_school_name",
          },
          {
            id: "audit_save",
            type: "audit",
            title: "发布审计准备",
            status: "ready",
            summary: "proposal_1 已进入发布前检查",
          },
        ],
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    const artifacts = screen.getByTestId("artifact-panel");
    fireEvent.click(
      within(artifacts).getByRole("button", { name: "审计记录" }),
    );

    expect(
      within(artifacts).getByTestId("artifact-trace-panel"),
    ).toBeInTheDocument();
    expect(
      within(artifacts).getByRole("heading", { name: "审计记录" }),
    ).toBeInTheDocument();
    expect(
      within(artifacts).getByText(/记录工具调用、用户确认和发布审计/),
    ).toBeInTheDocument();
    expect(within(artifacts).getByText("search_ontology")).toBeInTheDocument();
    expect(within(artifacts).getByText("用户确认学校维度")).toBeInTheDocument();
    expect(within(artifacts).getByText("发布审计准备")).toBeInTheDocument();
  });

  it("右侧 Trace tab 无事件时展示审计记录空态", () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      tool_traces: [],
    };
    activeReviewFixture = {
      session_id: "session_1",
      status: "ready_to_save",
      changes: [],
      blockers: [],
      reason_explanations: [],
      trace_state: { events: [] },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    const artifacts = screen.getByTestId("artifact-panel");
    fireEvent.click(
      within(artifacts).getByRole("button", { name: "审计记录" }),
    );

    expect(
      within(artifacts).getByRole("heading", { name: "审计记录" }),
    ).toBeInTheDocument();
    expect(within(artifacts).getByText(/暂无审计记录/)).toBeInTheDocument();
  });

  it("Review 展示发布到语义中心检查与发布后消费者验证状态", () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      current_proposal_id: "proposal_1",
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        publish_result: { status: "published", proposal_id: "proposal_1" },
      },
    };
    activeReviewFixture = {
      session_id: "session_1",
      proposal_id: "proposal_1",
      status: "published",
      status_label: "已发布 · 消费者可验证",
      changes: [],
      blockers: [],
      reason_explanations: [],
      data_agent_consumption: {
        state: "available",
        label: "消费者可基于语义中心验证",
        reasons: [],
      },
      primary_action: { action: "none", label: "已发布", disabled: true },
      publish_gate: {
        state: "published",
        label: "发布门禁已通过",
        steps: [
          {
            id: "semantic-draft",
            label: "语义草案完整",
            status: "passed",
            description: "语义草案已保存",
          },
          {
            id: "sandbox",
            label: "可用性预演",
            status: "passed",
            description: "草稿预演通过",
          },
          {
            id: "semantic-center",
            label: "语义中心生效",
            status: "passed",
            description: "发布资产已进入语义中心快照",
          },
        ],
      },
      post_publish_validation: {
        status: "passed",
        label: "样例问答验收通过",
        sample_question: "最近 7 天学生评论数按学校汇总",
        runtime_route: "student_comment_cube",
        result_summary:
          "Data Agent 样例已命中 student_comment_cube，BI 和数据分析可继续按同一语义资产验证。",
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    const artifacts = screen.getByTestId("artifact-panel");
    expandArtifacts(artifacts);

    expect(
      within(artifacts).getByText("发布到语义中心检查"),
    ).toBeInTheDocument();
    expect(within(artifacts).getAllByText("发布前检查").length).toBeGreaterThan(
      0,
    );
    expect(within(artifacts).getByText("发布门禁已通过")).toBeInTheDocument();
    expect(within(artifacts).getByText("发布后消费者验证")).toBeInTheDocument();
    expect(within(artifacts).getByText("样例问答验收通过")).toBeInTheDocument();
    expect(
      within(artifacts).getByText("student_comment_cube"),
    ).toBeInTheDocument();
    expect(within(artifacts).getByText(/语义中心路由/)).toBeInTheDocument();
    expect(within(artifacts).getByText(/BI 和数据分析/)).toBeInTheDocument();
  });

  it("发布后消费者验证面板归一化旧后端 Data Agent 与 runtime 文案", () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      current_proposal_id: "proposal_1",
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        publish_result: { status: "published", proposal_id: "proposal_1" },
      },
    };
    activeReviewFixture = {
      session_id: "session_1",
      proposal_id: "proposal_1",
      status: "published",
      status_label: "已发布 · 消费者可验证",
      changes: [],
      blockers: [],
      reason_explanations: [],
      data_agent_consumption: {
        state: "available",
        label: "正式 Data Agent 可消费",
        reasons: [],
      },
      primary_action: { action: "none", label: "已发布", disabled: true },
      post_publish_validation: {
        status: "passed",
        label: "正式 Data Agent 可消费",
        sample_question: "最近 7 天学生评论数按学校汇总",
        runtime_route: "student_comment_cube",
        result_summary:
          "正式 Data Agent 已能命中 student_comment_cube，正式 runtime 已生效。",
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    const artifacts = screen.getByTestId("artifact-panel");
    expandArtifacts(artifacts);

    expect(within(artifacts).getByText("发布后消费者验证")).toBeInTheDocument();
    expect(
      within(artifacts).getByText("消费者可基于语义中心发布快照验证"),
    ).toBeInTheDocument();
    expect(
      within(artifacts).getByText(/Data Agent 样例已命中 student_comment_cube/),
    ).toBeInTheDocument();
    expect(within(artifacts).getByText(/BI 和数据分析/)).toBeInTheDocument();
    expect(
      within(artifacts).getByText("student_comment_cube"),
    ).toBeInTheDocument();
    expect(
      within(artifacts).queryByText(/正式 Data Agent/),
    ).not.toBeInTheDocument();
    expect(
      within(artifacts).queryByText(/正式 runtime|[^_]runtime[^_]/),
    ).not.toBeInTheDocument();
  });

  it("使用推荐按钮把推荐值传给 confirm", async () => {
    activeSessionFixture = ANALYZED_SESSION;
    renderAt("/semantic/modeling-copilot/session_1");

    fireEvent.click(
      within(screen.getByTestId("chat-workspace")).getByRole("button", {
        name: /使用推荐/,
      }),
    );
    await waitFor(() =>
      expect(confirmAssumption).toHaveBeenCalledWith({
        sessionId: "session_1",
        confirmationId: "confirm_school_dimension",
        value: "comment_school_name",
      }),
    );
  });

  it("阻断确认全部清空后「生成语义资产」按钮可用 -> 调 saveProposal", async () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    fireEvent.click(
      within(screen.getByTestId("chat-next-action")).getByRole("button", {
        name: /生成语义资产/,
      }),
    );
    await waitFor(() =>
      expect(saveProposal).toHaveBeenCalledWith({ sessionId: "session_1" }),
    );
  });

  it("语义草稿待应用时允许直接「生成语义资产」，保留接受草稿作为显式锁定动作", async () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        raw_spec: {
          cubes: [
            {
              name: "student_comment_cube",
              source: "dwd_x",
              dimensions: [],
              measures: [],
            },
          ],
        } as Record<string, unknown>,
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    expect(screen.getByText("建议新建语义资产")).toBeInTheDocument();
    expect(screen.getAllByText("student_comment_cube").length).toBeGreaterThan(
      0,
    );
    const applyBtn = screen.getByRole("button", { name: /生成语义资产/ });
    expect(applyBtn).not.toBeDisabled();
    expect(
      screen.getByRole("button", { name: /接受草稿/ }),
    ).toBeInTheDocument();
    fireEvent.click(applyBtn);
    await waitFor(() =>
      expect(saveProposal).toHaveBeenCalledWith({ sessionId: "session_1" }),
    );
  });

  it("批量候选详情页隐藏接受草稿动作，保留生成语义资产主路径", async () => {
    const context: WorkbenchCandidateState = {
      workbenchMode: "batch",
      projectId: "build-learning-run-a",
      candidateId: "build-learning-run-a:fact:dwd-learning-activity-df",
      candidateTitle: "学情分析事实主题候选",
      target: "semantic_center",
      source: "dwd_learning_activity_df",
      grain: "一条学习行为事件",
      risk: "low",
      evidence: ["表画像显示行为时间字段完整。"],
    };
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        raw_spec: {
          cubes: [
            {
              name: "student_comment_cube",
              source: "dwd_x",
              dimensions: [],
              measures: [],
            },
          ],
        } as Record<string, unknown>,
      },
    };

    renderAt("/semantic/modeling-copilot/session_1", {
      workbenchContext: context,
      embeddedInWorkbench: true,
    });

    expect(screen.getByText("建议新建语义资产")).toBeInTheDocument();
    expect(screen.getByText("候选已确认")).toBeInTheDocument();
    expect(screen.getByText(/批量候选已确认来源/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /接受草稿/ })).toBeNull();

    const applyBtn = screen.getByRole("button", { name: /生成语义资产/ });
    expect(applyBtn).not.toBeDisabled();
    fireEvent.click(applyBtn);
    await waitFor(() =>
      expect(saveProposal).toHaveBeenCalledWith({ sessionId: "session_1" }),
    );
  });

  it("接受语义草稿 -> 走确定性 accept action，不发起 sendMessage", async () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        raw_spec: {
          cubes: [{ name: "student_comment_cube", source: "dwd_x" }],
        } as Record<string, unknown>,
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    fireEvent.click(screen.getByRole("button", { name: /接受草稿/ }));
    await waitFor(() =>
      expect(acceptCubeDraft).toHaveBeenCalledWith({ sessionId: "session_1" }),
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("已生成待发布资产后展示「发布到语义中心」按钮，点击调 publish", async () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      current_proposal_id: "proposal_x",
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        readiness: {
          canonical_ready: false,
          exploratory_ready: true,
          reasons: ["ready_to_publish"],
        },
        proposal_summary: { id: "proposal_x", status: "validated" },
        release_preview: PASSED_RELEASE_PREVIEW,
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    expect(screen.getByText("语义已应用 · 待发布")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /发布到语义中心/ }));
    await waitFor(() =>
      expect(publishProposal).toHaveBeenCalledWith({ sessionId: "session_1" }),
    );
  });

  it("待发布资产缺少发布预演时在主流程卡片直接提供预演入口", async () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      current_proposal_id: "proposal_x",
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        readiness: {
          canonical_ready: false,
          exploratory_ready: true,
          reasons: ["ready_to_publish"],
        },
        proposal_summary: { id: "proposal_x", status: "validated" },
        release_preview: undefined,
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    const publishButton = screen.getByRole("button", { name: /发布到语义中心/ });
    expect(publishButton).toBeDisabled();

    fireEvent.click(screen.getByTestId("saved-card-release-preview"));

    await waitFor(() =>
      expect(previewRelease).toHaveBeenCalledWith({
        sessionId: "session_1",
        body: {
          sample_questions: ["查询最近7天学生评论数，按学校汇总"],
        },
      }),
    );
    expect(publishProposal).not.toHaveBeenCalled();
  });

  it("来源或语义草案仍阻塞时禁用「发布到语义中心」", () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      current_proposal_id: "proposal_x",
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        readiness: {
          canonical_ready: false,
          exploratory_ready: false,
          reasons: ["source_candidate_confirmation_required", "spec_not_generated"],
        },
        proposal_summary: { id: "proposal_x", status: "validated" },
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    const publishButton = screen.getByRole("button", { name: /发布到语义中心/ });
    expect(publishButton).toBeDisabled();
    expect(screen.getAllByText(/发布门禁阻塞/).length).toBeGreaterThan(0);
    fireEvent.click(publishButton);
    expect(publishProposal).not.toHaveBeenCalled();
  });

  it("发布预演按钮调用 release-preview 且不触发正式发布", async () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      current_proposal_id: "proposal_x",
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        proposal_summary: { id: "proposal_x", status: "validated" },
        sandbox_preview: {
          status: "ready",
          pollutes_official_route: false,
          sample_questions: ["查询最近7天学生评论数，按学校汇总"],
        },
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    const artifacts = screen.getByTestId("artifact-panel");
    fireEvent.click(
      within(artifacts).getByRole("button", { name: /运行发布预演/ }),
    );

    await waitFor(() =>
      expect(previewRelease).toHaveBeenCalledWith({
        sessionId: "session_1",
        body: {
          sample_questions: ["查询最近7天学生评论数，按学校汇总"],
        },
      }),
    );
    expect(publishProposal).not.toHaveBeenCalled();
  });

  it("右侧发布预演展示语义编译未配置且不展示伪 compiled SQL", () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      current_proposal_id: "proposal_x",
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
            affected_consumers: ["Data Agent", "BI"],
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
    };
    renderAt("/semantic/modeling-copilot/session_1");

    const artifacts = screen.getByTestId("artifact-panel");
    expect(within(artifacts).getByText("发布预演")).toBeInTheDocument();
    expect(within(artifacts).getAllByText("未配置").length).toBeGreaterThan(0);
    expect(
      within(artifacts).getAllByText(
        "语义中心编译预演未配置，未生成物理 SQL。",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      within(artifacts).getByText("等待语义中心返回物理 SQL"),
    ).toBeInTheDocument();
    expect(
      within(artifacts).queryByText(/SELECT gateway_compiled_sql/),
    ).not.toBeInTheDocument();
  });

  it("右侧发布预演把 Gateway 405 展示为执行面未接通", () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      current_proposal_id: "proposal_x",
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        release_preview: {
          target: "semantic_center",
          semantic_compile: {
            status: "passed",
            message: "语义中心编译预演通过。",
          },
          compiled_sql: "SELECT 1",
          release_diff: {
            added: ["cube.dwd_interaction_comment_reports_df"],
            changed: [],
            removed: [],
          },
          impact_summary: {
            affected_assets: ["cube.dwd_interaction_comment_reports_df"],
            affected_consumers: ["Data Agent", "BI"],
            risk_level: "low",
          },
          gateway_validation: {
            status: "failed",
            message:
              "Gateway SQL dry-run 调用失败：gateway SQL dry-run failed: 405",
          },
          consumer_validation: {
            status: "pending",
            samples: [],
          },
        },
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    const artifacts = screen.getByTestId("artifact-panel");
    expect(within(artifacts).getByText("语义中心发布")).toBeInTheDocument();
    expect(within(artifacts).getByText("语义中心可发布")).toBeInTheDocument();
    expect(within(artifacts).getByText("Gateway 执行面验证")).toBeInTheDocument();
    expect(
      within(artifacts).getAllByText("执行面未接通").length,
    ).toBeGreaterThan(0);
    expect(
      within(artifacts).getByText(/不影响语义中心发布结果/),
    ).toBeInTheDocument();
    expect(within(artifacts).getByText("消费者验证")).toBeInTheDocument();
    expect(within(artifacts).getByText("等待执行面验证")).toBeInTheDocument();
    expect(within(artifacts).queryByText("未通过")).not.toBeInTheDocument();
    expect(
      within(artifacts).queryByText("发布预演 未通过"),
    ).not.toBeInTheDocument();
  });

  it("发布失败时在建设主流程展示可定位的阻断项", async () => {
    publishProposal.mockRejectedValueOnce(
      new AppError(
        "PUBLISH_FAILED",
        400,
        "发布建模语义失败: Applied assets drift from approved semantic_diff",
      ),
    );
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      current_proposal_id: "proposal_x",
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        readiness: {
          canonical_ready: false,
          exploratory_ready: true,
          reasons: ["ready_to_publish"],
        },
        proposal_summary: { id: "proposal_x", status: "validated" },
        release_preview: PASSED_RELEASE_PREVIEW,
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    fireEvent.click(screen.getByRole("button", { name: /发布到语义中心/ }));

    const failure = await screen.findByTestId("copilot-action-error");
    expect(within(failure).getByText("发布失败")).toBeInTheDocument();
    expect(
      within(failure).getByText(/已批准差异和应用资产不一致/),
    ).toBeInTheDocument();
    expect(
      within(failure).getByRole("button", { name: /打开语义配置/ }),
    ).toBeInTheDocument();
  });

  it("可用性预演 blocked 给出业务化引导文案", () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        sandbox_preview: { status: "blocked", summary: "暂无 spec" },
        // 语义草稿存在但未接受
        raw_spec: { cubes: [{ name: "c1", source: "dwd_x" }] } as Record<
          string,
          unknown
        >,
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    expect(
      screen.getByText("可用性预演被阻塞：语义草稿还没接受"),
    ).toBeInTheDocument();
  });

  it("Review 展示字段候选摘要", () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        raw_spec: {
          ...ANALYZED_SESSION.workbench_state.raw_spec,
          cube: {
            ...(ANALYZED_SESSION.workbench_state.raw_spec?.cube as Record<
              string,
              unknown
            >),
            field_candidate_trace: {
              candidate_set_id: "fcs_student_comment",
              measure_count: 2,
              dimension_count: 3,
              risk_summary: { high: 1, medium: 2 },
            },
          },
        },
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    const artifacts = screen.getByTestId("artifact-panel");
    expect(within(artifacts).getByText("字段候选摘要")).toBeInTheDocument();
    expect(
      within(artifacts).getByText("fcs_student_comment"),
    ).toBeInTheDocument();
    expect(within(artifacts).getByText("指标 2")).toBeInTheDocument();
    expect(within(artifacts).getByText("维度 3")).toBeInTheDocument();
    expect(
      within(artifacts).getByText("风险 high 1 / medium 2"),
    ).toBeInTheDocument();
  });

  it("字段候选主画布展示来自 field_candidate_trace 的候选明细", () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        raw_spec: {
          ...ANALYZED_SESSION.workbench_state.raw_spec,
          cube: {
            ...(ANALYZED_SESSION.workbench_state.raw_spec?.cube as Record<
              string,
              unknown
            >),
            field_candidate_trace: {
              candidate_set_id: "fcs_student_comment",
              candidates: [
                {
                  candidate_index: 1,
                  field: "comment_id",
                  label: "评论数",
                  role: "measure",
                  aggregation: "count",
                  confidence: 0.92,
                  evidence: "按评论 ID 计数可表达评论数。",
                  risk: "medium",
                },
              ],
            },
          },
        },
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    const canvas = screen.getByTestId("field-candidate-main-canvas");
    const review = within(canvas).getByTestId("field-candidate-review");
    expect(review).toBeInTheDocument();
    expect(within(review).getByText("字段候选审阅")).toBeInTheDocument();
    expect(
      within(canvas).getByRole("table", { name: "字段候选审阅" }),
    ).toBeInTheDocument();
    expect(within(review).getByText("评论数")).toBeInTheDocument();
    expect(within(review).getByText("comment_id")).toBeInTheDocument();
    expect(within(review).getByText("92%")).toBeInTheDocument();
  });

  it("字段候选主画布忽略异常候选并兼容 selected_role 与字符串置信度", () => {
    activeSessionFixture = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        raw_spec: {
          ...ANALYZED_SESSION.workbench_state.raw_spec,
          cube: {
            ...(ANALYZED_SESSION.workbench_state.raw_spec?.cube as Record<
              string,
              unknown
            >),
            field_candidate_trace: {
              candidate_set_id: "fcs_student_comment",
              candidates: [
                null,
                "bad-candidate",
                {
                  candidate_index: 2,
                  name: "comment_school_name",
                  label: "学校名称",
                  selected_role: "dimension",
                  confidence: "high",
                  evidence: "按学校汇总需要学校名称字段。",
                },
              ],
            },
          },
        },
      },
    };
    renderAt("/semantic/modeling-copilot/session_1");

    const canvas = screen.getByTestId("field-candidate-main-canvas");
    const review = within(canvas).getByTestId("field-candidate-review");
    expect(review).toBeInTheDocument();
    expect(within(review).getByText("学校名称")).toBeInTheDocument();
    expect(within(review).getByText("comment_school_name")).toBeInTheDocument();
    expect(within(review).getByText("dimension")).toBeInTheDocument();
    expect(within(review).getByText("high")).toBeInTheDocument();
    expect(review).not.toHaveTextContent("bad-candidate");
  });

  it("可用性预演调 previewSandbox，不污染语义中心发布快照", async () => {
    activeSessionFixture = ANALYZED_SESSION;
    renderAt("/semantic/modeling-copilot/session_1");

    fireEvent.click(
      within(screen.getByTestId("chat-next-action")).getByRole("button", {
        name: /可用性预演/,
      }),
    );
    await waitFor(() =>
      expect(previewSandbox).toHaveBeenCalledWith({ sessionId: "session_1" }),
    );
  });

  it("权限不足时给出业务化中文错误", async () => {
    createSession.mockRejectedValueOnce(
      new AppError("INSUFFICIENT_ROLE", 403, "Insufficient permissions", {
        required_roles: ["platform_admin"],
        principal_roles: ["viewer"],
      }),
    );

    renderAt("/semantic/modeling-copilot/new");

    fireEvent.change(screen.getByLabelText("建模目标"), {
      target: { value: "查询最近7天学生评论数，按学校汇总" },
    });
    fireEvent.click(screen.getByRole("button", { name: /发送/ }));

    expect(
      await screen.findByText(/当前账号不能执行该建模动作/),
    ).toBeInTheDocument();
    expect(screen.getByText(/当前角色 viewer/)).toBeInTheDocument();
  });

  it("左栏 sessions 列表渲染并标记 active / 已保存状态", () => {
    sessionsFixture = [
      { ...ANALYZED_SESSION, id: "session_1", title: "订单退款率" },
      {
        ...ANALYZED_SESSION,
        id: "session_2",
        title: "班级活跃度",
        current_proposal_id: "proposal_a91c2b",
      },
    ];
    activeSessionFixture = sessionsFixture[0];
    const { container } = renderAt("/semantic/modeling-copilot/session_1");

    const aside = container.querySelector("aside");
    expect(aside).not.toBeNull();
    const sidebar = aside as HTMLElement;
    expect(within(sidebar).getByText("语义资产冷启动")).toBeInTheDocument();
    expect(within(sidebar).getByText("最近 3 天")).toBeInTheDocument();
    expect(within(sidebar).getByText("订单退款率")).toBeInTheDocument();
    expect(within(sidebar).getByText("班级活跃度")).toBeInTheDocument();

    const savedRow = within(sidebar).getByText("班级活跃度").closest("button");
    expect(savedRow).not.toBeNull();
    expect(
      within(savedRow as HTMLElement).getByText("已保存"),
    ).toBeInTheDocument();
  });

  it("左栏最近会话只展示近三天，并对列表分页", () => {
    const now = Date.now();
    sessionsFixture = Array.from({ length: 10 }, (_, index) => ({
      ...ANALYZED_SESSION,
      id: `recent_${index}`,
      title: `近三天会话 ${index + 1}`,
      updated_at: new Date(now - index * 60 * 1000).toISOString(),
    }));
    sessionsFixture.push({
      ...ANALYZED_SESSION,
      id: "old_session",
      title: "四天前会话",
      updated_at: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
    });
    activeSessionFixture = sessionsFixture[0];
    const { container } = renderAt("/semantic/modeling-copilot/recent_0");

    const sidebar = container.querySelector("aside") as HTMLElement;
    expect(within(sidebar).getByText("10")).toBeInTheDocument();
    expect(within(sidebar).queryByText("四天前会话")).not.toBeInTheDocument();
    expect(within(sidebar).getByText("近三天会话 1")).toBeInTheDocument();
    expect(within(sidebar).queryByText("近三天会话 9")).not.toBeInTheDocument();

    fireEvent.click(within(sidebar).getByRole("button", { name: "下一页" }));
    expect(within(sidebar).getByText("2/2")).toBeInTheDocument();
    expect(within(sidebar).getByText("近三天会话 9")).toBeInTheDocument();
  });

  it("空态渲染：未提供 sessionId 时显示语义冷启动引导卡", () => {
    activeSessionFixture = null;
    renderAt("/semantic/modeling-copilot/new");

    expect(
      screen.getByText("从数仓数据建设可发布的语义资产"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("基于学生评论事实表建设评论数语义资产"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("semantic-builder-stepper"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("builder-ai-actions")).not.toBeInTheDocument();
  });

  it("点击示例卡把语义冷启动文案预填到 composer", () => {
    activeSessionFixture = null;
    renderAt("/semantic/modeling-copilot/new");

    fireEvent.click(screen.getByText("基于学生评论事实表建设评论数语义资产"));
    const composer = screen.getByLabelText("建模目标") as HTMLTextAreaElement;
    expect(composer.value).toBe("基于学生评论事实表建设评论数语义资产");
  });
});
