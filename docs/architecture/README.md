---
doc_type: architecture-index
status: maintained
source_of_truth: secondary
owner: engineering
last_reviewed: 2026-06-03
---

# 架构设计目录

本目录保存“当前架构为什么这样设计”的正文说明。
它不替代 [技术栈与架构说明](../TECH_STACK_AND_ARCHITECTURE.md) 的现状基线，也不替代 `docs/prd/` 与专题设计文档中的变更说明。

## 适用范围

- 想理解系统边界、模块职责和运行拓扑
- 想知道前后端为什么这样拆分
- 想查看当前仍有效的架构决策记录

不适合：

- 查启动命令、端口、代理和排障细节
- 直接判断某个历史方案是否仍有效
- 把某次规划稿、专题设计稿或原型稿当作已落地事实

## 推荐阅读顺序

1. [system-overview.md](system-overview.md)：系统全景、能力域、运行路径
2. [backend.md](backend.md)：后端分层、依赖注入、异步任务与语义存储
3. [frontend.md](frontend.md)：前端路由域、页面模型、数据访问与验证策略
4. [decisions/README.md](decisions/README.md)：当前仍有效的架构决策记录
5. [decisions/ADR-012-dataset-data-asset-and-query-boundary.md](decisions/ADR-012-dataset-data-asset-and-query-boundary.md)：固定 `Dataset`、数据资产底座、平台交互式查询和 `dw-query-gateway` 生产执行事实源边界
6. [agent-ready-semantic-governance.md](agent-ready-semantic-governance.md)：Agent 语义规划、飞书 SSO Principal、两阶段权限、ExecutionProfile、ticket 与 gateway / MaxCompute RAM 适配边界
7. [access-gateway-maxcompute-ram.md](access-gateway-maxcompute-ram.md)：访问网关到 MaxCompute 的 RAM User、Project Role、CredentialBinding、观测和 smoke 方案
8. [source-candidate-recall-scoring.md](source-candidate-recall-scoring.md)：建模 Copilot 从业务问题召回候选数据源的本地元数据打分、解释和门槛
9. [semantic-data-asset-foundation.md](semantic-data-asset-foundation.md)：数据资产底座作为元数据事实层，通过 `AssetRef + EvidenceBundle` 桥接 Cube、本体、投影与语义治理，并复用现有 Schema drift 链路
10. [semantic-field-candidate-layer.md](semantic-field-candidate-layer.md)：拟采纳设计；物理表 / Dataset / 数据资产证据进入 Cube 与本体建模前，统一经过字段候选层做类型映射、角色判断、指标语义推断与 Review
11. [agent-runtime-platform.md](agent-runtime-platform.md)：平台级 Agent 推理 Runtime 当前基线与目标设计；OpenAI-compatible 已接入，Codex app-server 当前是 workspace / client / adapter skeleton 和 opt-in live smoke
12. 双层语义架构约束：优先阅读 ADR-007 ~ ADR-009
13. 如果正在推进业务指标与分析指标的联邦追踪，优先对照 `README.md` 和 `TECH_STACK_AND_ARCHITECTURE.md` 中的 Phase 2 描述

## 当前文件

- [system-overview.md](system-overview.md)
  - 当前系统全景、主能力域、同步/异步/语义三条主路径
- [backend.md](backend.md)
  - Flask App Factory、依赖注入容器、后端分层与运行角色
- [frontend.md](frontend.md)
  - React SPA 路由结构、页面域、共享壳层与校验策略
- [decisions/README.md](decisions/README.md)
  - ADR 索引与维护规则
- [decisions/ADR-012-dataset-data-asset-and-query-boundary.md](decisions/ADR-012-dataset-data-asset-and-query-boundary.md)
  - 固定 `DataSource`、平台应用层 `Dataset`、数据资产底座、语义资产、平台交互式查询历史和 `dw-query-gateway` 查询遥测的职责边界；新增聚合统计和页面文案的事实源约束
- [semantic-data-asset-foundation.md](semantic-data-asset-foundation.md)
  - 数据资产底座只作为元数据事实层，不直接服务语义；通过 `AssetRef + EvidenceBundle` 为 Cube 工作台、Ontology-Cube Projection、本体工作台与语义治理提供证据；Schema 漂移复用 `SchemaSyncService + AssetSnapshotSchemaInspector + SemanticGovernanceIssueService`
- [semantic-field-candidate-layer.md](semantic-field-candidate-layer.md)
  - 拟采纳设计；字段候选层作为数据资产证据到 Cube / Ontology 草案之间的中间抽象，统一物理类型映射、字段角色判断、指标聚合与可加性推断；Cube 草案应从 `FieldCandidateSet` 生成，不能让物理字段或 Dataset 字段直接成为正式语义真相
- [agent-runtime-platform.md](agent-runtime-platform.md)
  - 当前基线与目标设计；Agent 推理 Runtime 上提为平台级能力层，通过统一 `AgentInferenceRuntimeService / AgentInferenceRuntimeRouter / Context Pack / ToolSpec Adapter / Runtime Policy / Trace` 对接 OpenAI-compatible LLM 和 Codex app-server；OpenAI-compatible 已接入低延迟主链，语义建模 Copilot 是首个消费者，Codex 当前保持 workspace / client / adapter skeleton、fake tests 和显式 opt-in live smoke
- [agent-ready-semantic-governance.md](agent-ready-semantic-governance.md)
  - 当前 Agent-ready 语义规划主链、飞书 SSO 作为身份事实来源、轻量 `Principal` 投影、`PrincipalContext` 兼容、两阶段 `PolicyDecision`、M3/raw 拦截、`TicketPreview / ExecutionTicket`、`ExecutionProfile` 与 gateway / MaxCompute RAM 适配边界
  - 具体 gateway -> MaxCompute RAM User 与 Project Role 方案见 [access-gateway-maxcompute-ram.md](access-gateway-maxcompute-ram.md)
  - Modeling Copilot 候选源召回与元数据打分方案见 [source-candidate-recall-scoring.md](source-candidate-recall-scoring.md)
  - 当前新增双层语义架构约束：
    - 对齐检查（内部实现为 `Semantic Mapper`）只做只读投影与一致性检测
    - `BusinessMetric` 采用语义公式而非执行公式
    - 执行预览（内部实现为 `Execution Compiler Preview`）在第一阶段提供最小可执行性验证
  - 当前已进入 Phase 2 最小落地：
    - `BusinessMetric -> Measure` 双向追踪
    - `Measure -> BusinessMetric` 反向引用
    - `Cube -> Object / Metric` 反向回看
    - stale / impact 继续围绕指标联邦增强
  - 当前已补入 Phase 3 最小投影能力：
    - `BusinessRelation -> Join Path` 预览
    - `BusinessAction -> Event Fact Cube` 预览
    - 关系/动作的最小 stale 校验
  - 当前已补入 Phase 4 最小路由能力：
    - 语义路由与执行规划（内部实现为 `Semantic Router / Planner`）按对象、关系、动作、业务指标和最小意图词做多意图路由
    - 输出 `cube / knowledge / hybrid / tool / blocked` 路由结果
    - 生成 `planning_mode`、多步 planning steps、`dependencies`、`expected_outputs` 与最小可回溯执行计划
    - 已补入 `/api/v1/semantic-router/execute-plan`，将稳定 plan 直接下发到最小统一执行运行时
  - 当前已补入 Phase 5 最小执行编译统一能力：
    - 内部 `Execution Compiler` 统一提供 `SQL / Retrieval / Tool Call` 执行预览
    - `compile-preview / plan-preview` 返回统一执行预览结构
    - `execute` 提供最小统一运行时：`SQL / Retrieval / Tool` 已接入最小真实执行，其中 `Tool` 当前限制为只读工具
    - `execute` 同时返回统一 `governance_trace / audit_trace_id`，用于记录命中策略、角色与执行状态
    - 智能问数消息主链已优先尝试走语义路由与统一执行运行时，仅在未命中或执行失败时回退旧链路
  - 当前已补入 Phase 6 最小语义权限挂点：
    - 内部 `Policy Metadata` 作为对象 / 动作 / 业务指标的最小语义权限元数据
    - 语义路由与执行规划可按服务端 `PrincipalContext` 做最小权限阻断
    - 执行预览可返回 `allow / blocked` 执行结果
  - 当前已补入 Agent-ready Phase 1 治理收敛：
    - `/api/v1/agent/semantic/plan` 作为 Agent-first official Runtime 主入口，由 `AgentPlanHandler` 编排 `PrincipalResolver -> Pre-route Policy -> Semantic Router -> Semantic Mapper -> Execution Compiler -> Post-compile Policy`
    - `/api/v1/agent/semantic/execute` 作为 Agent-first 查询执行入口，在 `policy_decision=allow` 时提交受治理查询到 `dw-query-gateway`；审批或拒绝只返回治理材料，不提交 gateway
    - 本仓不再保留内部查询执行 Worker、执行 job 或结果 spool；`dw-query-gateway` 负责正式执行、SQL guard、审计、结果对象和运行态事实
    - 网关观测页只读消费 `dw-query-gateway` telemetry / readyz，并在 data-platform BFF 层做基础告警评价；告警输入和运行态事实仍以 gateway 为准
    - SQL Lab、查询工作台、元数据探查和预览的定位是交互式异构数据源工具面，继续走 DataSource Adapter SPI
    - official Runtime 只读取 active SQL runtime snapshot manifest 中的 published `Ontology` 与 published `Cube` `spec`；draft、Proposal 和 YAML 同名资产不得 fallback；诊断类 `/semantic-router/*` 保留 preview，用于工作台 route / binding / compile / policy / trace 排障
    - Bearer、API Key 和飞书委托入口统一归一为 `PrincipalContext`；请求体角色、JWT 角色声明和 `viewer_roles` 不参与授权
    - `Semantic Mapper` 输出稳定 `projection_result / resolved_bindings / binding_status / binding_issues`，`Execution Compiler` 输出 `query_dsl / logical_sql / resource_set / sql_hash / data_level / ticket_material / bindings / traceability`；`QueryDSL v1` 是运行时唯一 SQL 生成输入，restricted 字段显式引用会被编译阻断
    - `/api/v1/semantic-router/execute-plan` 与 `/api/v1/execution-compiler/execute` 命中 `M3/raw/ods` 时返回 `require_approval`，不真实执行
    - 治理审计默认写入 PostgreSQL `governance_audit_traces`，支持按 `principal_id / semantic_plan_id / sql_hash / decision / policy` 过滤
    - `/api/docs/openapi.json` 作为唯一 OpenAPI 输出入口，当前已为第一批只读 / 预览 / 审计接口补入 Agent 风险扩展和字段级 `data` schema；`make typecheck-contracts` 负责阻断核心契约缺失、重复 `operationId` 与非法 Agent 扩展字段
  - 当前建模助手统一收敛为语义建设工作台契约：
    - `/semantic/modeling-workbench`、`/semantic/modeling-workbench/quick` 与候选详情路由是语义中心顶层冷启动产品入口，不归入 `/semantic/cubes/new` 层级；旧 `/semantic/modeling-copilot/new`、`/semantic/modeling-copilot/batch` 与 `/semantic/modeling-copilot/:sessionId` 仅保留兼容重定向
    - `/api/v1/semantic/modeling-copilot/sessions/*` 是唯一 Copilot 会话 API；旧 spec 草稿 / 校验 / 发布直连后端公开 route 与产品主链路已下线，不再作为新的建模助手产品入口或公开会话 API
    - 迁移期 Proposal 兼容面仍可保留为内部 / 前端兼容 client、types、hooks，例如 Proposal API 与 `SemanticModelingAgentSpec` 构建期类型；这些兼容面不代表新的产品入口或公开会话契约
    - 内部 `SemanticModelDraftBuilder` 继续承接确定性 spec 生成、校验、候选资产确认、Proposal 保存和发布门禁材料组装；它是应用层构建器，不是公开 API 名称
    - 数据资产底座只提供元数据事实、`AssetRef` 与 `EvidenceBundle`，不直接生成语义真相；Copilot 草案优先使用证据包里的 `schema_snapshot`，缺失时才走 datasource adapter fallback
    - `/semantic/modeling-workbench/quick` 的单资产体验采用建设主流程结构：中间主画布承载业务问题、字段候选、口径确认和语义草案，右侧 Artifact 面板按需展示 `Review / Spec / Source / Preview / Trace`，生成的 Proposal Review 不阻断建设流；当前五个 artifact 均已接入产品化主链路
    - `/api/v1/semantic/modeling-copilot/sessions/<session_id>/review` 是建模助手的只读 artifact 投影，用于展示候选变更、阻塞项、原因解释、源表证据、Trace 回放、Publish Gate 和发布后验收；它不引入第二套语义资产模型，正式真相仍是已发布 Cube、Ontology、Binding 与 Policy
    - Modeling Copilot session / Proposal 是构建期协作状态，生产默认通过 `SEMANTIC_MODELING_COPILOT_STORE=sql` 写入 PostgreSQL；YAML 仓储只保留为 local / fixture adapter
    - 生产语义资产事实源已切到 SQL Registry / Release / Runtime Snapshot；YAML 仅用于本地 fixture、示例 seed 和调试导出，不做生产双写或离线迁移输入；架构决策见 ADR-010
    - 候选源召回的领域加分、相邻域扣分、canonical source / spec 修复均由 `SourceCandidateScoringConfig` 规则承载，新增领域优先补元数据规则，不在通用召回服务里继续写业务 if
    - `save_proposal` 只接受已生成或已编辑的 `raw_spec`，业务问题不能直接绕过 spec 校验进入 Proposal 草稿，避免旧 `business_question` source kind 误入治理发布链；Copilot 会在保存 / 校验前通过 `SemanticModelDraftBuilder` 确定性补齐 measure、grain、time_dimension、additivity、binding_status、policy 和最小证据包
    - Chat 内"使用推荐 / 接受 Cube 草稿 / 解释阻塞项"是确定性状态动作，不调用 LLM；自由业务问题和新意图理解仍进入 LLM Runtime
    - `/api/v1/semantic/domains/<domain_id>/context-preview` 将 Domain 收窄为业务主题、候选资产、默认上下文和 Agent 提示预览；Domain 不作为指标、关系、动作或 Join 的第三套真相源，业务上下文资产画布也不再维护关系边
  - 当前前端已提供 `/semantic/ontology` 的业务语义工作台首期版本：
    - 覆盖对象、属性、关系、动作、业务指标、术语、语义权限的最小建模
    - 支持只读投影预览、指标联邦追踪、运行时路由预演、统一执行预览、最小治理挂点预览，以及业务语义与 `Cube` 的最小双向跳转
    - 运行时面板已可展示 `planning_mode`、主命中和多意图命中结果，帮助确认复杂问题会进入哪条执行链
    - 当前运行时面板已支持手动触发 `execute-plan`，直接查看最近执行结果、审计记录与执行回溯
    - 权限页已接入 `Policy Impact` 治理影响总览、真实治理挂点预演、最近治理执行结果和最近审计记录：前端直接消费语义路由、执行预览、`execute` 与 `policy-audit` 返回，展示授权与未授权角色下的 `allow / blocked` 结果、治理挂点状态、命中策略和执行状态
    - 权限页的最近审计记录已支持按 `决策 / 路由` 做最小筛选，便于聚焦订单域的放行、阻断与直连执行路径
    - 当前主编辑区已补入统一的“发布 / 影响 / 历史”面板，用于承接业务语义资产的发布链、影响分析和历史回看
    - 当前主编辑区已补入最近一次发布失败的内联展示，用于直接回看阻断原因，而不再只依赖 toast
    - 当前治理查询已补入 `/api/v1/governance/audit-traces` 列表接口，`Cube` 激活也已接入最小业务语义优先准入校验：认证 Measure 若缺少 `BusinessMetric` 反向引用，将阻止发布
    - 当前业务语义发布链已进一步收紧：业务指标、关系、动作、权限在发布前会校验依赖对象是否已激活、是否具备最小分析投影依据；校验失败会直接阻断发布
    - 智能问数后端消息主链已开始返回 `semantic_plan` 相关上下文；当前 v2 `/data-chat` 仍是占位页，尚未恢复完整聊天界面
    - 当前已补入订单域模板预览与一键应用入口：`/api/v1/ontology/templates/order-domain` 与业务语义工作台顶部操作区可快速生成订单域对象、属性、关系、动作、指标、术语和权限初始样板，作为后续复制到第二域的基线模板
    - 当前工作台总览页已补入轻量 Agent 预演面板，可直接调用 `/api/v1/agent/semantic/plan` 查看 route、compiled SQL、policy decision 与 `preview_only` ticket

## 与其他文档的分工

- 当前现状、脚本、端口：看 [../TECH_STACK_AND_ARCHITECTURE.md](../TECH_STACK_AND_ARCHITECTURE.md)、[../QUICK_START.md](../QUICK_START.md)、[../STARTUP_GUIDE.md](../STARTUP_GUIDE.md)
- 产品目标和方案边界：看 [../prd/README.md](../prd/README.md)
- 设计草案和原型：看 [../reference-design/README.md](../reference-design/README.md)
- 历史重构和迁移背景：看 [../archive/README.md](../archive/README.md)
- 规划中变更：看 `docs/prd/README.md`、相关 ADR 与对应专题设计文档

## 维护规则

- 架构边界、运行拓扑、核心模块职责变化后，优先更新本目录和 `TECH_STACK_AND_ARCHITECTURE.md`
- ADR 只记录仍有效的当前决策；失效决策转入历史归档或在 ADR 中明确被替代
- 目录内文档以“当前态”为主，不追加一次性实施流水账
