// frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.artifactPanel.test.tsx
//
// 语义建设工作台 · 右侧产物面板（从 ModelingAgent.test.tsx 按工作台区块拆分）。

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { WorkbenchCandidateState } from "./workbenchContext";

vi.mock("@v2/hooks/semantic", async () => (await import("./ModelingAgent.testkit")).semanticHooksMock);
vi.mock("@v2/hooks/agent-runtime", async () => (await import("./ModelingAgent.testkit")).agentRuntimeHooksMock);
vi.mock("@v2/hooks/accessPermissions", async () => (await import("./ModelingAgent.testkit")).accessPermissionsHooksMock);

import ModelingAgent from "./ModelingAgent";
import {
  fixtures,
  resetModelingAgentTestState,
  expandArtifacts,
  sendMessage,
  confirmAssumption,
  updateSpecMut,
  ANALYZED_SESSION,
  CODEX_MANAGED_RUNTIME_SNAPSHOT,
  NO_SOURCE_SESSION,
  SOURCE_CANDIDATE_SESSION,
  DATA_ASSET_SOURCE_CANDIDATE_SESSION,
} from "./ModelingAgent.testkit";

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
          path="/semantic/modeling-workbench/quick"
          element={<ModelingAgent {...props} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ModelingAgent · 右侧产物面板", () => {
  beforeEach(() => {
    resetModelingAgentTestState();
  });

  it("资产审阅面板展示 Cube 层和轻本体锚定摘要", () => {
    fixtures.activeSession = {
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
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = ANALYZED_SESSION;
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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

  it("展示平台 AI 状态但不在主流程暴露 runtime 切换器", () => {
    fixtures.activeSession = ANALYZED_SESSION;
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

    expect(screen.getByTestId("agent-runtime-status")).toHaveTextContent(
      "AI · OpenAI",
    );
    expect(
      screen.queryByRole("button", { name: /启动 Codex/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Agent Runtime:/)).not.toBeInTheDocument();
  });

  it("已有待发布资产且复审服务需要连接时只提示去平台设置，不在业务页启动服务", () => {
    fixtures.runtimeSnapshot = CODEX_MANAGED_RUNTIME_SNAPSHOT;
    fixtures.activeSession = {
      ...ANALYZED_SESSION,
      current_proposal_id: "proposal_1",
    };
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = {
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
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = ANALYZED_SESSION;
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = ANALYZED_SESSION;
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = ANALYZED_SESSION;
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = {
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

    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = {
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
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        sandbox_preview: undefined,
      },
    };
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = ANALYZED_SESSION;
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = NO_SOURCE_SESSION;
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_no_source");

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
    fixtures.activeSession = SOURCE_CANDIDATE_SESSION;
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
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_source_candidate");

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

  it("来源候选待确认时底部状态不误报所有口径已就绪", () => {
    fixtures.activeSession = SOURCE_CANDIDATE_SESSION;
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_source_candidate");

    expect(screen.getByText("等待确认数据来源")).toBeInTheDocument();
    expect(screen.queryByText("所有口径已就绪")).not.toBeInTheDocument();
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
    fixtures.activeSession = {
      ...SOURCE_CANDIDATE_SESSION,
      workbench_state: {
        ...SOURCE_CANDIDATE_SESSION.workbench_state,
        raw_spec: ANALYZED_SESSION.workbench_state.raw_spec,
      },
    };

    renderAt("/semantic/modeling-workbench/quick?sessionId=session_source_candidate", {
      workbenchContext: context,
      embeddedInWorkbench: true,
    });

    expect(screen.getByText("推荐数据来源")).toBeInTheDocument();
    expect(screen.getByText("来源已确认")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /使用此来源/ })).toBeNull();
  });

  it("推荐数据来源展示数据资产底座候选的资产引用与证据边界", () => {
    fixtures.activeSession = DATA_ASSET_SOURCE_CANDIDATE_SESSION;
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_data_asset_source_candidate");

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
    fixtures.activeSession = {
      ...ANALYZED_SESSION,
      current_proposal_id: "proposal_1",
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        proposal_summary: { id: "proposal_1", status: "validated" },
      },
    };
    fixtures.activeReview = {
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
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = {
      ...ANALYZED_SESSION,
      tool_traces: [],
    };
    fixtures.activeReview = {
      session_id: "session_1",
      status: "ready_to_save",
      changes: [],
      blockers: [],
      reason_explanations: [],
      trace_state: { events: [] },
    };
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = {
      ...ANALYZED_SESSION,
      current_proposal_id: "proposal_1",
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        publish_result: { status: "published", proposal_id: "proposal_1" },
      },
    };
    fixtures.activeReview = {
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
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = {
      ...ANALYZED_SESSION,
      current_proposal_id: "proposal_1",
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        publish_result: { status: "published", proposal_id: "proposal_1" },
      },
    };
    fixtures.activeReview = {
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
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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

  it("Review 展示字段候选摘要", () => {
    fixtures.activeSession = {
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
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = {
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
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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

  it("字段候选 trace 缺失时从当前语义草案派生候选明细", () => {
    fixtures.activeSession = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        raw_spec: ANALYZED_SESSION.workbench_state.raw_spec,
      },
    };
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

    const canvas = screen.getByTestId("field-candidate-main-canvas");
    const review = within(canvas).getByTestId("field-candidate-review");
    expect(within(canvas).getByText("3 个候选")).toBeInTheDocument();
    expect(within(review).getByText("学校名称")).toBeInTheDocument();
    expect(within(review).getByText("comment_school_name")).toBeInTheDocument();
    expect(within(review).getByText("total_count")).toBeInTheDocument();
    expect(within(review).queryByText("等待字段候选")).not.toBeInTheDocument();
  });

  it("字段候选主画布忽略异常候选并兼容 selected_role 与字符串置信度", () => {
    fixtures.activeSession = {
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
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

    const canvas = screen.getByTestId("field-candidate-main-canvas");
    const review = within(canvas).getByTestId("field-candidate-review");
    expect(review).toBeInTheDocument();
    expect(within(review).getByText("学校名称")).toBeInTheDocument();
    expect(within(review).getByText("comment_school_name")).toBeInTheDocument();
    expect(within(review).getByText("dimension")).toBeInTheDocument();
    expect(within(review).getByText("high")).toBeInTheDocument();
    expect(review).not.toHaveTextContent("bad-candidate");
  });
});
