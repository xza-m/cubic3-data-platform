---
doc_type: archive
status: active
source_of_truth: false
owner: frontend
last_reviewed: 2026-06-18
---

# 平台 UI Governance P2 执行记录

## 执行边界

- 采用“模块内治理 + 共享展示规范”。
- 不新增跨模块统一诊断工作台。
- 本轮按用户要求跳过 Phase 3：语义 Workbench 运行预览产品化。
- 不改动后端语义链路、gateway 协议或权限策略。

## Phase 0：扫描基线与守护栏

状态：已执行。

扫描命令：

```bash
rg -n "(/api/|api/v1|app_code|app_instance_id|channel_id|trace_id|query_id|raw_spec|payload|mc_m[0-9]|route_type|policy_decision)" frontend/src/v2/pages frontend/src/v2/components frontend/src/v2/layout --glob '!**/*.test.*'
rg -n "(TODO|FIXME|占位|placeholder|mock|Mock|fixture|演示|测试数据|示例|暂未|待接入)" frontend/src/v2/pages frontend/src/v2/components frontend/src/v2/layout --glob '!**/*.test.*'
```

结论：

- `/api/v1` 大多数命中为代码注释或 API 层导入，不是界面泄漏。
- DevTools 中的 `semantic_plan_id`、`sql_hash`、`principal_id` 属于专业诊断页面，本轮不按普通用户问题处理。
- 普通页面需要治理的主要问题集中在：建模冷启动演示口径、配置 JSON 默认铺开、渠道/订阅组件一致性、权限表格底层枚举和长文本。

## Phase 1：文案与底层术语清理

状态：已完成。

处理内容：

- 将语义冷启动的“演示数据 / 演示模式”改为“手动范围 / 待确认候选队列”。
- 将同步记录和应用执行记录中的 `Run #`、`Task #` 主视觉改为“同步记录 / 关联任务 / 执行记录”。
- 新增 `frontend/src/v2/lib/displayLabels.ts`，统一执行方式和触发类型的展示标签。
- 将权限中心中的“演示初始化”来源改为“初始化导入”。

验证：

- `npm run test:unit -- src/v2/lib/displayLabels.test.ts` 通过。
- `npm run build:v2` 通过。

## Phase 2：配置 JSON 与 Schema 模块内收敛

状态：已完成。

处理内容：

- 新增 `StructuredDetails`，用于 JSON / 文本详情的“摘要优先、详情折叠、可复制”展示。
- App 详情页配置结构默认展示配置项和必填项摘要，原始结构折叠。
- 应用实例详情页配置参数和调度配置默认展示摘要，原始 JSON 折叠。
- 数据源详情页脱敏连接配置默认展示安全摘要，原始脱敏 JSON 折叠。
- 应用实例创建页配置结构折叠，保留配置内容编辑态。
- 应用执行详情输出 JSON 折叠，错误信息改为普通错误块。

## Phase 3：语义 Workbench 运行预览产品化

状态：按用户要求跳过。

## Phase 4：配置中心组件一致性

状态：已完成。

处理内容：

- 渠道列表和订阅列表复用通用 `PeekPanel`，替代内联侧栏。
- 渠道配置、订阅过滤条件、订阅投递配置改为折叠详情。
- 渠道测试按钮保留为行内图标按钮，并展示测试结果状态。
- 订阅创建时继续使用“应用名 · 实例名 · 状态”和“渠道名 · 类型 · 状态”的选择项。

## Phase 5：表格、空态和密度统一

状态：已完成。

处理内容：

- 新增 `EmptyState` 和 `TechnicalValue` 两个轻量共享组件。
- 同步记录空态统一为标题 + 一行说明。
- 同步记录、执行记录、关联任务等技术标识弱化为可复制辅助值。
- 权限中心行级范围已保持“摘要 + hover 详情”模式，本轮只补底层文案漏出。

## Phase 6：验证与发布记录

状态：已完成。

已执行验证：

- `npm run test:unit -- src/v2/lib/displayLabels.test.ts`：通过。
- `npm run lint && npm run test:unit -- src/v2/lib/displayLabels.test.ts src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.test.tsx`：通过。
- `npm run i18n:coverage`：通过，缺失 key 为 0，裸露中文计数未超过基线。
- `npm run build:v2`：通过。
- `npx playwright test --config tests/e2e-v2/playwright.config.ts tests/e2e-v2/p17-extraction-run-rerun.spec.ts tests/e2e-v2/p33-extraction-tasks-shell.spec.ts tests/e2e-v2/smoke/interaction-contract.spec.ts -g "P17|P33|C03|C07"`：通过，4 条关键回归用例通过。
- `make test-modeling-agent`：通过，覆盖后端 semantic/modeling 与前端 modeling-agent 单测。
- `make verify-changed`：通过；本次变更触发仓库级校验，包含 lint、typecheck、OpenAPI contract、后端单测、前端单测、前端 smoke、semantic smoke、gateway observability smoke 与 docs health。

最终扫描：

- `Run #`、`Task #`、`演示数据`、`配置 Schema`、底层执行枚举等关键词未在普通用户界面发现新的直接泄漏。
- 剩余 `mc_m*`、`data_m2_detail_reader` 命中为内部映射、权限归一化逻辑或测试桩，不作为界面文案展示。
- 应用实例创建页保留 JSON 编辑器与折叠 Schema，属于配置编辑场景的必要能力。

非阻塞提示：

- Playwright / Vite 输出 `Browserslist` 数据过期和 Node `module.register()` deprecation warning，未影响本轮验证结果，建议后续工具链维护窗口单独处理。
