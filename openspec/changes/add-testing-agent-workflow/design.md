## Context
当前项目已经具备后端 `pytest`、前端 `tsc` / `build` 和少量 Playwright 浏览器烟测能力，但这些能力没有统一抽象，也没有明确哪些改动必须跑哪些验证。最近的领域创建链路暴露出：单元测试和构建都通过，但真实浏览器仍会因端口、代理、服务刷新问题失败。

## Goals / Non-Goals
- Goals:
  - 抽象统一的测试 Agent / 验证工作流
  - 定义前端分层固定流程
  - 将语义中心关键路径 Playwright 烟测纳入固定清单
  - 保持测试友好、低摩擦、可脚本化
- Non-Goals:
  - 不引入新的测试框架
  - 不要求所有前端改动都跑重型 E2E
  - 不把测试 Agent 做成独立服务或复杂调度系统

## Decisions
- Decision: 引入 Testing Agent 作为“验证工作流抽象”，而不是业务 Agent。
  - Rationale: 该抽象只负责组织验证步骤和任务矩阵，不参与业务能力实现。
- Decision: 采用三层验证模型。
  - L1 基础门禁：`tsc` + `build`
  - L2 关键路径烟测：Playwright-cli
  - L3 发布前组合回归：多条关键烟测成组执行
- Decision: 前端 Playwright E2E 是 Testing Agent 清单中的一种任务，不是唯一任务。
  - Rationale: 后续可并入截图比对、无障碍检查、后端接口冒烟等任务。
- Decision: 将“何种改动触发何种验证”固化为规则，而不是依赖人工记忆。

## Risks / Trade-offs
- 风险: 如果把所有改动都强制绑定 Playwright，会增加开发摩擦。
  - Mitigation: 仅对语义中心和关键交互改动要求 L2。
- 风险: 本地运行环境差异会导致烟测不稳定。
  - Mitigation: 固定脚本入口、显式 `BASE_URL`、明确服务刷新要求。

## Migration Plan
1. 先通过 OpenSpec 固化工作流与触发规则。
2. 保持现有 `domain-smoke` 脚本，纳入固定清单。
3. 后续按价值逐步增加 `domain-publish-smoke`、`cube-draft-smoke` 等脚本。
4. 若时机成熟，再将 Testing Agent 接入 CI 或本地统一验证命令。

## Open Questions
- 是否需要新增统一命令，例如 `npm run verify:semantic`，把 `tsc/build/domain-smoke` 收口为一个入口？
- 是否需要对后端语义改动定义对应的浏览器或 API 烟测矩阵？
