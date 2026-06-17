---
doc_type: prd
status: accepted
source_of_truth: design-input
owner: product-engineering
last_reviewed: 2026-06-05
---

# 语义建设工作台 PRD

## 1. 产品定位

语义建设工作台面向数据建模工程师，帮助他们从业务域、物理表、字段证据、已有语义资产和业务建设目标快速冷启动语义资产建设。

工作台的最终交付目标是发布到语义中心，使语义资产进入稳定、可治理、可复用状态。Data Agent、BI、数据分析、报表、业务应用和自动化任务都是语义中心消费者，不是语义建设的发布终点。

一句话定位：

> 语义建设工作台帮助数仓建模工程师从业务域、物理表或业务问题快速生成可审阅的语义资产队列，并通过字段候选、证据、SQL、Diff 和发布校验，把资产发布到语义中心。

## 2. 目标用户与任务

核心用户：

- 数据建模工程师：选择建设范围、审阅字段候选、调整 Cube / Ontology / Binding 草案、完成发布校验。
- 语义资产 Owner：负责命名、口径治理、影响确认、发布与回滚判断。

协作者：

- 数据产品经理：确认业务对象、指标口径、命名和优先级。
- 分析师 / BI 开发者：验证已发布语义是否能被分析和看板复用。
- 治理管理员：确认权限、审计、发布门禁和语义资产生命周期策略。

下游消费者：

- Data Agent
- BI
- 数据分析
- 报表
- 业务应用
- 自动化任务

## 3. 设计原则

- **Spec-first**：固定语义 Spec 是真值。AI 只能生成建议、解释证据和提出 patch，不能成为持久化真值。
- **Workbench-first**：主体验是高密度配置工作台，不是聊天页。AI 是侧边助手，不抢占工程师的字段审阅画布。
- **Semantic Center-first**：发布目标统一是语义中心。下游消费者只消费已发布语义资产。
- **Gateway-boundary**：平台只做控制面、治理面和展示面；生产查询、dry-run、compiled SQL 和执行预演必须通过 `dw-query-gateway` 或等价执行面能力。
- **Human-in-the-loop**：字段采纳、口径变更、发布确认和影响确认都必须由人完成。

对应工程原则：

- **KISS**：统一入口、统一项目上下文和统一发布链路，减少 `/new` 与 `/batch` 并行心智。
- **YAGNI**：先不做完整多人审批、批量自动发布和后台异步 Agent；先把可审阅、可验证、可发布闭环做实。
- **SOLID**：AI 建议、字段审阅、Spec 编译、Gateway SQL dry-run、发布 diff 各自独立，避免互相侵入。
- **DRY**：单资产快速模式与批量语义建设模式共用同一套字段候选表、资产审阅、发布校验和路由上下文。

## 4. 核心对象

- **Build Project**：一次语义建设项目，承载业务域、建设范围、候选来源、项目状态和发布目标。
- **Build Blueprint**：AI 或人工生成的建设蓝图，描述要建什么、为什么建、优先级、依赖和风险。
- **Asset Package**：一个可审阅资产单元，可以是单个 Cube、View、Ontology Binding，或强关联的一组语义变更。
- **Field Candidate**：字段级候选，包含物理字段、建议语义名、角色、类型、聚合、口径、证据、冲突、风险和人工动作。
- **Proposal**：一次可发布变更草案，包含 Spec patch、字段采纳结果和发布前校验状态。
- **Release**：发布到语义中心的版本记录，包含 semantic spec、compiled SQL、release diff、consumer validation 和审计记录。

对象关系：

```text
Build Project
  -> Build Blueprint
  -> Asset Package[]
  -> Field Candidate[]
  -> Proposal
  -> Release
  -> Semantic Center
```

## 5. 统一产品形态

主入口收敛为一个“语义建设”入口。由于当前 `/semantic/workbench` 已被语义诊断工作台占用，首期统一入口已使用 `/semantic/modeling-workbench`；后续若诊断工作台改名，再评估是否迁移到更短的 `/semantic/workbench`。

兼容模式：

- 快速单资产模式：面向一张事实表、一个指标或一个业务对象，自动创建轻量 Build Project，候选队列只有一个 Asset Package。
- 批量语义建设模式：面向一个业务域或一组候选物理表，先生成 Build Blueprint 和候选资产队列，再逐项审阅 Asset Package。

旧入口处理：

- `/semantic/modeling-copilot/new` 不再作为产品主入口，不注册兼容重定向。
- `/semantic/modeling-copilot/batch` 不再作为独立产品主入口，不注册兼容重定向。
- `/semantic/modeling-copilot/:sessionId` 不再作为独立会话页，不注册兼容重定向；会话只作为工作台内部状态。
- 当前 P2 MVP 的稳定验证入口已收敛到 `/semantic/modeling-workbench` 与 `/semantic/modeling-workbench/quick`，旧 Copilot UI 路由直接下线，避免同一能力存在多套入口心智。

## 6. 页面结构

左栏：建设项目与候选队列。

- 新建 / 切换 Build Project。
- 展示建设范围、Blueprint 状态、候选 Asset Package 队列。
- 标记每个候选资产的状态：待审阅、需补范围、高风险、校验中、可发布、已发布。

中栏：主设计画布。

- 默认展示当前 Asset Package 的字段候选表。
- 支持字段采纳、忽略、改写、角色选择、聚合方式、语义名、口径和风险处理。
- 支持切换到语义草案、Spec diff、compiled SQL 和发布影响视图。

右栏：AI 诊断与证据助手。

- 展示当前字段、资产或发布校验的证据。
- 解释 AI 建议来源、相似语义资产、冲突和风险。
- 提供修复建议、命名建议、口径补齐建议。
- 展示 Gateway SQL dry-run、consumer validation 和 release diff 的诊断结果。

## 7. 端到端流程

```text
新建建设项目
  -> 选择建设范围（业务域 / 物理表 / 主题 / 已有语义覆盖）
  -> 生成或编辑 Build Blueprint
  -> 生成候选 Asset Package 队列
  -> 审阅字段候选
  -> 生成语义草案 Proposal
  -> 查看 semantic spec / compiled SQL / release diff / impact boundary
  -> 通过 gateway SQL dry-run 与消费者可用性验证
  -> 人工确认发布到语义中心
  -> 记录 Release 与审计
```

## 8. AI 介入边界

AI 可做：

- 生成 Build Blueprint，解释建设范围覆盖度和风险。
- 推荐候选物理表、事实主题、维度主题和指标候选。
- 生成字段候选：语义名、角色、类型、聚合、单位、置信度和证据。
- 补充语义草案说明、命名建议、口径解释和修复建议。
- 解释 dry-run 失败、release diff 风险和 consumer validation 失败原因。

AI 不可做：

- 不直接发布到语义中心。
- 不绕过字段候选审阅。
- 不绕过 Spec schema、compiled SQL、release diff 和 dry-run 门禁。
- 不覆盖已发布资产而不生成 diff。
- 不把 Data Agent 当作发布目标或真值源。

取舍结论：

- 生成和解释类能力内嵌在工作台内，减少用户在聊天框和配置表之间复制粘贴。
- 保存、编译、校验、发布和审计走固定 Spec 与后端规则，保证可重复、可追踪、可回滚。

## 9. 字段候选表

字段候选表是数仓建模工程师的核心工作面。首期必须支持：

- 物理字段名和来源表。
- 建议语义名，可人工改写。
- 字段角色：维度、度量、时间、属性、主键、外键。
- 类型和聚合：语义类型、默认聚合、单位、过滤条件。
- 口径说明：业务定义、计算条件和排除规则。
- 证据：字段画像、血缘使用、已有语义资产、AI 推理摘要、样本或查询日志来源。
- 冲突：与全局 Glossary、已有 Cube、已有指标口径的命名或定义冲突。
- 风险：低、中、高；高风险不得批量采纳。
- 动作：采纳、忽略、改写、合并、退回重生成。

## 10. 发布校验契约

发布校验不能由前端拼接，也不能由平台控制面直接执行生产查询。后端需提供只读发布预演契约：语义中心负责持久化语义资产，并封装语义到物理 SQL 的编译能力；工作台 release-preview 需把候选 Spec 投影为临时 runtime manifest，并复用语义中心统一编译模块生成物理 SQL；gateway 是执行面，只接收物理 SQL 做 dry-run、guardrail 或实际执行，不接收 `semantic_spec`。Data Agent、BI 和数据分析只消费语义中心发布资产，不直接依赖建模工具。

首期 API 路径：

- `POST /api/v1/semantic/modeling-copilot/sessions/:session_id/release-preview`

请求体：

```json
{
  "namespace": "default",
  "sample_questions": ["昨天活跃学生数是多少？"],
  "viewer_roles": ["ops_readonly"]
}
```

`viewer_roles` 表示本次发布预演要模拟的下游消费者角色，只进入语义中心编译预演，不作为请求用户的授权事实，也不透传给 gateway。响应体位于 `data.workbench_state.release_preview`，包含 `semantic_spec`、`semantic_compile`、`compiled_sql`、`release_diff`、`impact_summary`、`gateway_validation` 和 `consumer_validation`。`semantic_compile` 表示语义中心编译预演状态，内部通过 `ExecutionCompilerPreviewService -> QueryCompiler` 统一生成 `QueryDSL / logical_sql / resource_set / sql_hash / traceability`；`compiled_sql` 只能来自语义中心编译结果。后端仅在拿到物理 SQL 后通过 `GatewayQueryClient.dry_run_sql` 调用 gateway。未生成物理 SQL 时，`gateway_validation.status` 明确返回 `not_configured`，并说明未调用 gateway；当执行面不可用或返回失败时，状态返回 `failed`，由前端发布预演面板展示失败信息。

gateway SQL dry-run 已配置并返回 `passed` 时的契约示例：

```json
{
  "compiled_sql": "SELECT date_trunc('day', paid_at) AS paid_date, SUM(amount) AS revenue FROM dwd_orders WHERE paid_at IS NOT NULL GROUP BY 1",
  "sample_question": "昨天各业务线收入是多少？",
  "semantic_compile": {
    "status": "passed",
    "source": "semantic_center"
  },
  "impact_summary": {
    "affected_assets": ["cube.order_revenue"],
    "affected_consumers": ["Data Agent", "BI"],
    "risk_level": "medium"
  },
  "release_diff": {
    "added": ["measure.revenue"],
    "changed": ["dimension.business_line"],
    "removed": []
  },
  "gateway_validation": {
    "status": "passed",
    "source": "dw-query-gateway SQL dry-run"
  }
}
```

接入原则：

- `compiled_sql` 只来自语义中心编译能力，不从前端拼接，也不由 gateway 根据 `semantic_spec` 生成。
- `impact_summary` 来自发布影响分析，不从 UI 文案推断。
- `release_diff` 来自 Proposal / Release diff，不读取临时 raw spec 字符串。
- `consumer_validation` 来自语义样例问题、gateway SQL dry-run 或下游消费者兼容性检查，不从 AI 文案推断。
- 前端只能消费 `release-preview` 契约或显式 fixture，不得拼接 SQL，不得暗示未配置 gateway 时已真实执行。

## 11. 当前 P2 MVP 偏离与收敛要求

当前已落地：

- `/semantic/modeling-workbench` 前端批量建设范围 intake，旧 `/semantic/modeling-copilot/batch` 不再注册。
- 扫描计划预览、候选资产队列和资产建设画布接续入口。
- 快速单资产模式 `/semantic/modeling-workbench/quick`，旧 `/semantic/modeling-copilot/new` 不再注册。

主要偏离：

- 批量候选打开工作台已通过统一 candidate 路由携带 `projectId`、`candidateId` 和 candidate context；后续需接真实 Build Project 持久化。
- 资产建设画布主工作区已提升字段候选主画布，但仍沿用部分过渡布局，后续需进一步弱化聊天式心智。
- 发布校验已提供只读 `release-preview` 契约，返回 `semantic_spec`、`semantic_compile`、`compiled_sql`、`release_diff`、`impact_summary`、`gateway_validation` 和 `consumer_validation`；后端只在语义中心生成物理 SQL 后接入可配置 gateway SQL dry-run，前端已提供发布预演入口和结果面板。未生成物理 SQL 时不会调用 gateway，执行面失败时返回 `failed` 并保持只读诊断。
- 首期已按统一入口兼容 / 重定向旧路由，长期仍需继续收敛导航文案，避免回到“语义冷启动”和“批量冷启动”两个并列心智。

收敛要求：

- 用统一 Build Project 上下文串联快速模式与批量模式。
- 将字段候选表提升为中栏主画布。
- 将 AI 面板降级为右侧解释与修复助手。
- 将旧路由兼容 / 重定向保持在统一 `/semantic/modeling-workbench` 入口下。
- 发布目标文案、状态和动作统一指向语义中心。

## 12. 成功指标

- Time to first semantic draft
- 字段候选命中率
- 人工字段修改比例
- 草案到发布转化率
- 发布校验通过率
- 发布后消费者可用性通过率
- 语义资产被消费者复用次数
- 发布后返工率
- 重复语义资产拦截率
- 发布后 30 天消费者查询命中率
- 发布后 90 天无消费资产占比

## 13. P0 / P1 范围切分

P0 聚焦当前单资产建设工作台收敛：统一语义建设工作台心智，展示字段候选主画布、Cube 层与轻本体锚定，拆分语义中心编译、Gateway 执行面验证和消费者验证状态。P0 不建设完整本体治理。

P1 聚焦前期冷启动规模化：持久化 Build Project，接入真实批量扫描，生成可审阅 Asset Package 队列，并在字段候选主画布中连续处理多个候选资产。

P1 的 Build Project 是建设期对象，不是语义中心资产本身。Asset Package 只是待审阅候选单元，只有通过 Proposal、release-preview 和发布门禁后，才会进入语义中心发布快照。

完整本体关系图、术语生命周期、跨域术语冲突、复杂审批和发布后消费治理属于语义中心治理面，不纳入本次 P0/P1。P1 不是后期治理，而是 Build Project / Asset Package 冷启动规模化。

## 14. 首期验收

- 入口文案使用“语义建设”，不再把 Copilot 当作产品主名。
- 空态表达“发布到语义中心”，并列出 Data Agent、BI、数据分析等下游消费者。
- 主动作从“应用语义”或“打开 Copilot”改为“新建建设项目”或“生成语义资产”。
- 发布动作表达为“发布到语义中心”。
- 中栏主工作区展示字段候选表，而不是对话流。
- 右侧面板用“AI 助手 / 证据 / 发布检查 / 可用性验证 / 审计记录”描述任务。
- 页面首屏不直接暴露 `raw_spec`、`runtime`、`readiness` 等实现词。
- 路由和导航至少有一处稳定的统一“语义建设”入口。
