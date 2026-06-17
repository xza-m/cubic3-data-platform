// frontend/src/v2/pages/semantic/modeling-copilot/ModelingAgent.sessionRail.test.tsx
//
// 语义建设工作台 · 会话列表（从 ModelingAgent.test.tsx 按工作台区块拆分）。

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  fireEvent,
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

describe("ModelingAgent · 会话列表", () => {
  beforeEach(() => {
    resetModelingAgentTestState();
  });

  it("左栏 sessions 列表渲染并标记 active / 已保存状态", () => {
    fixtures.sessions = [
      { ...ANALYZED_SESSION, id: "session_1", title: "订单退款率" },
      {
        ...ANALYZED_SESSION,
        id: "session_2",
        title: "班级活跃度",
        current_proposal_id: "proposal_a91c2b",
      },
    ];
    fixtures.activeSession = fixtures.sessions[0];
    const { container } = renderAt("/semantic/modeling-workbench/quick?sessionId=session_1");

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
    fixtures.sessions = Array.from({ length: 10 }, (_, index) => ({
      ...ANALYZED_SESSION,
      id: `recent_${index}`,
      title: `近三天会话 ${index + 1}`,
      updated_at: new Date(now - index * 60 * 1000).toISOString(),
    }));
    fixtures.sessions.push({
      ...ANALYZED_SESSION,
      id: "old_session",
      title: "四天前会话",
      updated_at: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(),
    });
    fixtures.activeSession = fixtures.sessions[0];
    const { container } = renderAt("/semantic/modeling-workbench/quick?sessionId=recent_0");

    const sidebar = container.querySelector("aside") as HTMLElement;
    expect(within(sidebar).getByText("10")).toBeInTheDocument();
    expect(within(sidebar).queryByText("四天前会话")).not.toBeInTheDocument();
    expect(within(sidebar).getByText("近三天会话 1")).toBeInTheDocument();
    expect(within(sidebar).queryByText("近三天会话 9")).not.toBeInTheDocument();

    fireEvent.click(within(sidebar).getByRole("button", { name: "下一页" }));
    expect(within(sidebar).getByText("2/2")).toBeInTheDocument();
    expect(within(sidebar).getByText("近三天会话 9")).toBeInTheDocument();
  });
});
