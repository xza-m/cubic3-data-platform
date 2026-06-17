// frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.chatFlow.test.tsx
//
// 语义建设工作台 · 对话流与确认动作（从 ModelingAgent.test.tsx 按工作台区块拆分）。

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { getBuilderAiActions } from "./builderAiActions";
import type { WorkbenchCandidateState } from "./workbenchContext";

vi.mock("@v2/hooks/semantic", async () => (await import("./ModelingAgent.testkit")).semanticHooksMock);
vi.mock("@v2/hooks/agent-runtime", async () => (await import("./ModelingAgent.testkit")).agentRuntimeHooksMock);
vi.mock("@v2/hooks/accessPermissions", async () => (await import("./ModelingAgent.testkit")).accessPermissionsHooksMock);

import ModelingAgent from "./ModelingAgent";
import {
  fixtures,
  resetModelingAgentTestState,
  createSession,
  sendMessage,
  confirmAssumption,
  acceptCubeDraft,
  saveProposal,
  ANALYZED_SESSION,
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

describe("ModelingAgent · 对话流与确认动作", () => {
  beforeEach(() => {
    resetModelingAgentTestState();
  });

  it("从空态发送业务问题，调 createSession + sendMessage", async () => {
    renderAt("/semantic/modeling-workbench/quick");

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
    renderAt("/semantic/modeling-workbench/quick", { workbenchContext: context });

    expect(screen.getByText("资产审阅待启动")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "先确认字段证据，再生成 Cube 与本体草案",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("准备开始")).not.toBeInTheDocument();
    expect(screen.queryByText("AI · Codex")).not.toBeInTheDocument();
    const composer = screen.getByLabelText("建模目标") as HTMLTextAreaElement;
    expect(composer.value).toContain("dwd_learning_activity_df");
    expect(composer.value).toContain("学情分析事实主题候选");
    expect(
      screen.getByText("确认 dwd_learning_activity_df 的字段证据"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("基于学生评论事实表建设评论数语义资产"),
    ).not.toBeInTheDocument();
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
      <MemoryRouter initialEntries={["/semantic/modeling-workbench/quick"]}>
        <Routes>
          <Route
            path="/semantic/modeling-workbench/quick"
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
    renderAt("/semantic/modeling-workbench/quick");

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
    fixtures.activeSession = ANALYZED_SESSION;
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

    expect(screen.getByText("已发现的语义资产")).toBeInTheDocument();
    expect(screen.getAllByText("学生评论总数").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("dwd_interaction_comment_reports_df.total_count")
        .length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("需要你确认")).toBeInTheDocument();
    expect(screen.getByText("学校维度")).toBeInTheDocument();
    // 顶栏 readiness chip 用业务文案而不是英文
    expect(screen.getAllByText("请确认 1 项口径").length).toBeGreaterThan(0);
  });

  it("点击字段候选 AI 动作只填入 composer，不自动发送", () => {
    fixtures.activeSession = {
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
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

    fireEvent.click(screen.getByRole("button", { name: /生成字段候选/ }));

    const expectedPrompt = getBuilderAiActions("field_candidates").find(
      (action) => action.label === "生成字段候选",
    )?.prompt;
    expect(screen.getByLabelText("建模目标")).toHaveValue(expectedPrompt);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("使用推荐按钮把推荐值传给 confirm", async () => {
    fixtures.activeSession = ANALYZED_SESSION;
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
      },
    };
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = {
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
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = {
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

    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1", {
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
    fixtures.activeSession = {
      ...ANALYZED_SESSION,
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        raw_spec: {
          cubes: [{ name: "student_comment_cube", source: "dwd_x" }],
        } as Record<string, unknown>,
      },
    };
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

    fireEvent.click(screen.getByRole("button", { name: /接受草稿/ }));
    await waitFor(() =>
      expect(acceptCubeDraft).toHaveBeenCalledWith({ sessionId: "session_1" }),
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("空态渲染：未提供 sessionId 时显示语义冷启动引导卡", () => {
    fixtures.activeSession = null;
    renderAt("/semantic/modeling-workbench/quick");

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
    fixtures.activeSession = null;
    renderAt("/semantic/modeling-workbench/quick");

    fireEvent.click(screen.getByText("基于学生评论事实表建设评论数语义资产"));
    const composer = screen.getByLabelText("建模目标") as HTMLTextAreaElement;
    expect(composer.value).toBe("基于学生评论事实表建设评论数语义资产");
  });
});
