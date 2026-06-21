# Platform UI Governance P2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不新增跨模块统一工作台的前提下，完成平台界面第二轮治理：清理产品页面技术外露、统一配置/诊断展示方式、收敛语义运行预览、补齐模块内组件一致性，并输出阶段记录。

**Architecture:** 采用“模块归属 + 共享展示规范”的治理方式。业务证据、诊断信息和配置详情仍嵌入数据中心、语义中心、应用市场、配置中心等原模块；共享层只沉淀标签映射、折叠详情、空态、表格密度和 JSON 展示等小型展示组件，不建设新的跨模块工作台。

**Tech Stack:** React 18, TypeScript, Vite, TanStack Query, Vitest, Playwright, Flask API, Makefile validation entrypoints.

---

## Scope Check

本轮治理覆盖：

- 产品页面中的“演示 / 测试 / 占位 / mock”类口径清理。
- 配置 JSON / Schema / 脱敏连接配置的默认展示方式治理。
- 语义 Workbench 运行预览的业务化表达和折叠详情。
- 配置中心渠道、订阅、详情页的组件一致性治理。
- 表格、空态、对象名、ID 展示、底层枚举展示的统一规则。
- 阶段性修复记录与验证记录。

本轮不覆盖：

- 新增统一诊断工作台。
- 重做导航信息架构。
- 改动后端语义链路、gateway 协议或权限策略。
- 大规模替换 UI 框架。
- 把 DevTools 中的专业诊断信息改成普通业务文案。

工程原则：

- **KISS**：模块内就地治理，不引入新的总控页面。
- **YAGNI**：只治理当前已暴露的体验问题，不为未来假设扩展复杂信息架构。
- **SOLID**：页面负责业务布局，通用展示规则沉淀为小组件或映射函数，避免页面混杂格式化细节。
- **DRY**：底层枚举、技术名、JSON 展示和空态规则集中复用，避免各页面各写一套。

## Alternative Strategies

### 方案 A：模块内治理 + 共享展示规范（推荐）

做法：

- 每个问题回到原模块修复。
- 对重复出现的展示模式抽出轻量组件或工具函数。
- 不改变现有路由和模块职责。

优点：

- 用户心智稳定，符合当前产品结构。
- 改动面可控，每个阶段可独立验收。
- 避免为了治理 UI 再创造一个“治理中心”。

缺点：

- 需要维护一套清晰的展示规范，否则后续仍可能发散。

适用场景：

- 当前平台已经有清晰模块边界，问题主要来自页面表达、组件一致性和底层信息外露。

### 方案 B：统一诊断 / 证据工作台

做法：

- 新增一个跨模块入口，统一收纳配置、诊断、证据、执行记录。

优点：

- 对平台管理员集中排障更直接。

缺点：

- 容易跨越数据中心、语义中心、配置中心和应用市场边界。
- 对普通用户心智更重，且当前需求未证明需要新模块。
- 会引入新的权限、路由、查询聚合和维护成本。

适用场景：

- 后续出现明确的 SRE / 管理员排障角色，并且跨模块证据查询成为高频任务。

本计划选择方案 A。

## File Structure

优先修改文件：

- `frontend/src/v2/pages/semantic/modeling-copilot/components/BatchModelingWorkbench.tsx`
  - 清理“演示模式 / 演示数据”等产品口径。
- `frontend/src/v2/pages/semantic/modeling-copilot/batchModeling.ts`
  - 同步修正 fallback 数据的展示标签，避免传到 UI 后仍显示 demo 语义。
- `frontend/src/v2/pages/apps/AppDetail.tsx`
  - App 配置 Schema 默认从原始 JSON 改为摘要 + 折叠详情。
- `frontend/src/v2/pages/apps/instances/InstanceDetail.tsx`
  - 应用实例配置默认从原始 JSON 改为摘要 + 折叠详情。
- `frontend/src/v2/pages/data/_shared/datasource-detail-content.tsx`
  - 数据连接脱敏配置默认折叠，并用字段摘要替代大段 JSON。
- `frontend/src/v2/pages/semantic/ontology/Workbench.tsx`
  - Runtime 预览业务化，底层枚举和 SQL 放入折叠详情。
- `frontend/src/v2/pages/config/channels/Channels.tsx`
  - 渠道新建、编辑、测试入口样式统一。
- `frontend/src/v2/pages/config/channels/ChannelDetail.tsx`
  - 详情页动作区、测试结果、配置摘要统一。
- `frontend/src/v2/pages/config/subscriptions/Subscriptions.tsx`
  - 订阅新建、应用实例显示名、渠道显示名统一。
- `frontend/src/v2/pages/config/subscriptions/SubscriptionDetail.tsx`
  - 详情页动作区、绑定对象、最近推送结果统一。
- `frontend/src/v2/pages/config/access/AccessIdentity.tsx`
  - 只做枚举标签、行级范围 hover、表格密度收敛，不做大重构。

按需新增文件：

- `frontend/src/v2/components/common/StructuredDetails.tsx`
  - 轻量折叠详情组件，用于 JSON / SQL / 诊断证据的“摘要优先、详情后置”展示。
- `frontend/src/v2/components/common/TechnicalValue.tsx`
  - 底层 ID、枚举、路径的低权重展示与复制能力。
- `frontend/src/v2/components/common/EmptyState.tsx`
  - 统一空态标题、说明和主行动。
- `frontend/src/v2/lib/displayLabels.ts`
  - 统一枚举到中文业务标签的映射，例如执行方式、策略等级、运行路径。
- `frontend/src/v2/lib/displayLabels.test.ts`
  - 覆盖关键枚举映射，避免后续再泄漏底层值。

文档文件：

- `docs/archive/platform-ui-governance-p2-2026-06-18.md`
  - 阶段执行记录、验证记录、遗留风险。
- `docs/prd/admin_diagnostic_evidence_panel_prd.md`
  - 若执行中发现诊断证据边界需要调整，只更新“模块归属 + 统一证据模式”的说明，不改成统一工作台。

## Phase 0: Baseline And Guardrails

目标：先锁定规则和扫描基线，防止边做边扩范围。

- [ ] 确认本轮只采用“模块内治理 + 共享展示规范”，不新增跨模块工作台。
- [ ] 使用关键词扫描普通页面中的技术外露：

```bash
rg -n "(/api/|api/v1|app_code|app_instance_id|channel_id|trace_id|query_id|raw_spec|payload|mc_m[0-9]|route_type|policy_decision)" frontend/src/v2/pages frontend/src/v2/components frontend/src/v2/layout --glob '!**/*.test.*'
```

- [ ] 使用关键词扫描占位与演示口径：

```bash
rg -n "(TODO|FIXME|占位|placeholder|mock|Mock|fixture|演示|测试数据|示例|暂未|待接入)" frontend/src/v2/pages frontend/src/v2/components frontend/src/v2/layout --glob '!**/*.test.*'
```

- [ ] 把命中项分为三类：
  - 普通用户页面必须治理。
  - 管理员 / DevTools 页面允许保留，但需要弱化或折叠。
  - 代码注释或测试文件不作为 UI 问题。
- [ ] 在 `docs/archive/platform-ui-governance-p2-2026-06-18.md` 建立阶段记录骨架。

验收标准：

- 有明确的命中清单。
- 每个命中项有归属模块和处理结论。
- 没有把 DevTools 的专业诊断误判为普通用户问题。

## Phase 1: 文案与底层术语清理

目标：先处理最小风险的产品表达问题，不改变数据链路。

- [ ] 修复 `BatchModelingWorkbench.tsx` 中用户可见的“演示模式 / 演示数据”。
  - 推荐表达：
    - “演示数据（不选真实源）”改为“手动范围（暂不绑定数据源）”。
    - “演示模式会生成前端样例计划”改为“未选择数据源时，将根据当前输入生成待确认范围”。
- [ ] 修复 `batchModeling.ts` 中传给 UI 的 demo/fallback label。
  - 内部函数名可保留，用户可见字段不能出现 demo/mock。
- [ ] 修复对象名、任务名、执行记录标题中的裸 ID 主视觉。
  - 业务名优先，ID 放二级信息或复制控件。
- [ ] 补充 `displayLabels.ts`，统一把常见底层枚举映射为业务标签：
  - `mc_m0_reader` -> `基础数据读取`
  - `mc_m1_reader` -> `汇总数据读取`
  - `mc_m2_detail_reader` -> `明细数据读取`
  - `m3_raw_block` -> `原始敏感数据限制`
- [ ] 为 `displayLabels.ts` 添加单元测试。

推荐验证：

```bash
make verify-changed
```

阶段记录：

- 记录清理的术语列表。
- 记录保留的术语及保留原因。

## Phase 2: 配置 JSON 与 Schema 的模块内收敛

目标：保留必要技术详情，但默认不把 JSON / Schema / 脱敏连接配置铺在主界面。

- [ ] 新增或复用折叠详情组件 `StructuredDetails`。
  - 默认展示摘要。
  - 详情折叠。
  - 支持复制。
  - 支持 `json` / `sql` / `text` 三种内容类型。
- [ ] `AppDetail.tsx`：
  - `配置 Schema` 默认展示字段数量、必填项数量、最后更新时间。
  - 原始 Schema 放入“查看结构详情”。
- [ ] `InstanceDetail.tsx`：
  - `配置参数` 默认展示配置项数量和关键状态。
  - `schedule_config` 默认展示调度方式、人可读周期和启停状态。
  - 原始 JSON 放入折叠详情。
- [ ] `datasource-detail-content.tsx`：
  - `连接配置（已脱敏）` 默认展示连接类型、主机/项目、Schema、认证方式是否已配置。
  - 原始脱敏 JSON 放入折叠详情。
- [ ] 保证敏感信息不因为新摘要逻辑重新暴露。

推荐验证：

```bash
make verify-changed
```

阶段记录：

- 记录每个模块保留的摘要字段。
- 记录原始详情的折叠入口。

## Phase 3: 语义 Workbench 运行预览产品化

目标：语义模块内仍保留运行证据，但默认讲业务结论，不直接暴露 route_type、policy_decision、SQL 等底层信息。

- [ ] `Workbench.tsx` 中把 Runtime 预览分为三层：
  - 业务结论：是否可理解、是否可执行、是否命中权限、需要用户补充什么。
  - 执行路径：语义解析、绑定、权限、计划生成的状态标签。
  - 技术详情：逻辑 SQL、route type、policy decision 等折叠展示。
- [ ] 使用 `displayLabels.ts` 统一映射底层运行状态。
- [ ] SQL 默认折叠，按钮文案使用“查看 SQL 详情”，不要直接把 SQL 当主内容。
- [ ] 对失败态补充主行动：
  - “补充字段映射”
  - “检查权限”
  - “返回语义资产”
- [ ] 保持 DevTools 页面不受本阶段业务化限制，但可以复用标签映射。

推荐验证：

```bash
make verify-changed
```

阶段记录：

- 记录语义 Workbench 的默认显示信息和折叠详情信息。

## Phase 4: 配置中心组件一致性

目标：渠道和订阅页面从“能用”提升到“平台一致”，但不改变后端能力。

- [ ] `Channels.tsx`：
  - 新建 / 编辑 / 测试按钮使用统一按钮样式。
  - 渠道类型展示为业务标签。
  - 测试结果展示为成功、失败、超时、未配置四类状态。
- [ ] `ChannelDetail.tsx`：
  - 把基础信息、投递配置、测试记录、最近订阅拆成清晰区块。
  - 原始配置折叠。
- [ ] `Subscriptions.tsx`：
  - 新建订阅时应用实例显示应用名 + 实例名，不显示裸 ID。
  - 渠道选择显示渠道名称 + 类型。
  - 列表内更新时间、启用态、事件类型统一标签。
- [ ] `SubscriptionDetail.tsx`：
  - 展示订阅对象、渠道、事件、最近投递结果。
  - 原始绑定 ID 只作为辅助复制字段。

推荐验证：

```bash
make verify-changed
```

阶段记录：

- 记录渠道测试按钮和订阅选择器的行为。
- 若缺少后端字段，记录后端字段缺口，不在前端硬造数据。

## Phase 5: 表格、空态和密度统一

目标：解决页面行高被长文本撑开、空态说明重复、对象列表主次信息混乱的问题。

- [ ] 新增或复用 `EmptyState`，统一空态：
  - 标题一句话。
  - 辅助说明最多一行。
  - 主行动最多一个。
- [ ] `AccessIdentity.tsx`：
  - 行级范围默认显示摘要。
  - 完整范围 hover / popover 展示。
  - 执行方式全部使用业务标签，不显示底层枚举。
- [ ] 对普通列表页统一对象卡片规则：
  - 标题显示业务名。
  - 技术名作为二级信息。
  - 原始 ID 不进入主标题。
- [ ] 对表格长文本字段统一处理：
  - 默认单行或双行截断。
  - hover 展示完整内容。
  - 可复制技术值。

推荐验证：

```bash
make verify-changed
```

阶段记录：

- 记录调整过的表格和空态。

## Phase 6: Verification And Release Record

目标：确认本轮治理闭环，并留下平台级修复记录。

- [ ] 执行变更检测：

```bash
make verify-detect
```

- [ ] 执行变更验证：

```bash
make verify-changed
```

- [ ] 如涉及跨模块 UI 较多，补充仓库级验证：

```bash
make lint
make typecheck
make test
```

- [ ] 本地服务验证：
  - 访问 `/data-center`
  - 访问 `/semantic/cubes`
  - 访问 `/semantic/assets`
  - 访问 `/semantic/modeling-copilot`
  - 访问 `/apps`
  - 访问 `/apps/instances/new`
  - 访问 `/config/access`
  - 访问 `/config/channels`
  - 访问 `/config/subscriptions`
- [ ] 更新 `docs/archive/platform-ui-governance-p2-2026-06-18.md`：
  - 阶段清单。
  - 修改文件。
  - 验证命令与结果。
  - 保留项与原因。
  - 后续建议。

最终验收标准：

- 普通业务页面不再出现明显 API 路由、后端枚举、原始 ID 主视觉、mock/demo 口径。
- JSON / SQL / Schema / 诊断证据默认不铺满主界面。
- 模块内证据仍可追溯，不被删除。
- 渠道、订阅、应用实例、语义 Workbench 的组件行为一致。
- `make verify-changed` 通过；若失败，必须修复或记录阻塞原因。

## Execution Rules

- 每个 Phase 完成后更新阶段记录。
- Phase 内遇到纯实现问题直接修复。
- 如果发现需要调整模块边界、新增后端接口、改变权限模型或引入统一工作台，立即暂停讨论。
- 每个 Phase 尽量单独提交，提交信息使用：
  - `chore(ui): clean product-facing technical labels`
  - `refactor(ui): collapse structured technical details`
  - `refactor(semantic): productize workbench runtime preview`
  - `refactor(config): align channel subscription ui`
  - `docs: record platform ui governance p2`

## Self Review

覆盖情况：

- 已覆盖文案口径、配置详情、语义预览、配置中心、表格空态、阶段记录和验证。
- 已排除统一诊断工作台、后端协议变更和 DevTools 诊断降级。

风险：

- 某些页面缺少后端可读字段时，不能在前端伪造业务名，需要记录字段缺口。
- 折叠详情组件如果设计过重，会违背 KISS；优先实现小组件。
- 过度清理技术信息可能影响管理员排障；本计划只默认折叠，不删除证据。

