// frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.publish.test.tsx
//
// 语义建设工作台 · 保存与发布链路（从 ModelingAgent.test.tsx 按工作台区块拆分）。

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
import type { WorkbenchCandidateState } from "./workbenchContext";

vi.mock("@v2/hooks/semantic", async () => (await import("./ModelingAgent.testkit")).semanticHooksMock);
vi.mock("@v2/hooks/agent-runtime", async () => (await import("./ModelingAgent.testkit")).agentRuntimeHooksMock);
vi.mock("@v2/hooks/accessPermissions", async () => (await import("./ModelingAgent.testkit")).accessPermissionsHooksMock);

import ModelingAgent from "./ModelingAgent";
import {
  fixtures,
  resetModelingAgentTestState,
  createSession,
  previewSandbox,
  previewRelease,
  publishProposal,
  ANALYZED_SESSION,
  PASSED_RELEASE_PREVIEW,
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

describe("ModelingAgent · 保存与发布链路", () => {
  beforeEach(() => {
    resetModelingAgentTestState();
  });

  it("已生成待发布资产后展示「发布到语义中心」按钮，点击调 publish", async () => {
    fixtures.activeSession = {
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
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

    expect(screen.getByText("语义已应用 · 待发布")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("chat-workspace")).getByTestId(
        "release-preview-panel",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /发布到语义中心/ }));
    await waitFor(() =>
      expect(publishProposal).toHaveBeenCalledWith({ sessionId: "session_1" }),
    );
  });

  it("待发布资产缺少发布预演时在主流程卡片直接提供预演入口", async () => {
    fixtures.activeSession = {
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
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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

  it("维度资产发布预演使用当前资产字段生成消费者样例", async () => {
    fixtures.activeSession = {
      ...ANALYZED_SESSION,
      user_goal: "基于 dim_school_df 建设学校维度语义资产",
      entry_type: "table_known",
      current_proposal_id: "proposal_dim_school",
      workbench_state: {
        ...ANALYZED_SESSION.workbench_state,
        required_confirmations: [],
        readiness: {
          canonical_ready: false,
          exploratory_ready: true,
          reasons: ["ready_to_publish"],
        },
        proposal_summary: { id: "proposal_dim_school", status: "validated" },
        sandbox_preview: {
          status: "ready",
          sample_questions: ["查询业务对象的核心指标"],
        },
        raw_spec: {
          cube: {
            name: "dim_school",
            title: "学校维度",
            source: "df_cb_258187.dim_school_df",
            dimensions: [
              { name: "school_name", title: "学校名称", expr: "school_name" },
              { name: "province_name", title: "省份", expr: "province_name" },
              { name: "city_name", title: "城市", expr: "city_name" },
            ],
            measures: [],
          },
        },
        release_preview: undefined,
      },
    };
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

    fireEvent.click(screen.getByTestId("saved-card-release-preview"));

    await waitFor(() =>
      expect(previewRelease).toHaveBeenCalledWith({
        sessionId: "session_1",
        body: {
          sample_questions: [
            "按省份统计学校数",
            "按城市统计学校数",
            "学校维度资产当前覆盖哪些学校",
          ],
        },
      }),
    );
  });

  it("来源或语义草案仍阻塞时禁用「发布到语义中心」", () => {
    fixtures.activeSession = {
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
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

    const publishButton = screen.getByRole("button", { name: /发布到语义中心/ });
    expect(publishButton).toBeDisabled();
    expect(screen.getAllByText(/发布门禁阻塞/).length).toBeGreaterThan(0);
    fireEvent.click(publishButton);
    expect(publishProposal).not.toHaveBeenCalled();
  });

  it("发布预演按钮调用 release-preview 且不触发正式发布", async () => {
    fixtures.activeSession = {
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
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = {
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
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = {
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
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = {
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
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.activeSession = {
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
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

    expect(
      screen.getByText("可用性预演被阻塞：语义草稿还没接受"),
    ).toBeInTheDocument();
  });

  it("可用性预演调 previewSandbox，不污染语义中心发布快照", async () => {
    fixtures.activeSession = ANALYZED_SESSION;
    renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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

    renderAt("/semantic/modeling-workbench/quick");

    fireEvent.change(screen.getByLabelText("建模目标"), {
      target: { value: "查询最近7天学生评论数，按学校汇总" },
    });
    fireEvent.click(screen.getByRole("button", { name: /发送/ }));

    expect(
      await screen.findByText(/当前账号不能执行该建模动作/),
    ).toBeInTheDocument();
    expect(screen.getByText(/当前角色 viewer/)).toBeInTheDocument();
  });
});
