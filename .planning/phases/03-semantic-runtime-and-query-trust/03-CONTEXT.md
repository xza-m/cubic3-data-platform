# Phase 3: 语义运行闭环与查询可信 - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

打通语义中心中“可编译、可调试、可发布/物化、可检测、可回放”的运行闭环，并补齐足以支撑排查与验证的查询可信证据。Phase 3 的运行能力只服务语义对象调试与验证，不把语义中心扩成最终消费查询平台；真实业务调用仍在应用层完成。本阶段重点是把 `DevTools` 收敛为唯一正式运行入口，并让对象详情页只承担状态摘要与跳转职责。

</domain>

<decisions>
## Implementation Decisions

### 运行入口与产品定位
- **D-01:** Phase 3 中平台内唯一正式语义运行入口是 `DevTools`；`CubeDetail / ViewDetail / 目录页` 只保留最近运行摘要、状态结果和跳转。
- **D-02:** 语义中心的重点仍是语义建设与规模化治理；运行能力只服务调试与验证，不作为平台内真实业务查询入口。
- **D-03:** 真实消费调用继续发生在应用层，Phase 3 不把语义中心扩成面向分析师或业务用户的长期查询工作台。

### 查询可信证据包
- **D-04:** `DevTools` 每次调试至少要稳定展示“标准证据包”：编译 SQL、主对象/关联对象摘要、结果样本与行数、执行时间、错误分类与 hint、当前定义版本标识（如 `definition_hash` 或等价摘要）。
- **D-05:** Phase 3 的“查询可信”强调调试可解释和问题排查，不要求构建完整查询分析产品，也不要求复杂可视化结果消费。

### 调试历史与重放闭环
- **D-06:** 只在 `DevTools` 内保留轻量调试历史，不建设独立查询历史产品。
- **D-07:** 每条调试历史至少保存：对象标识、DSL 快照、编译 SQL、结果摘要、执行时间、错误信息、定义版本标识。
- **D-08:** 用户可以在 `DevTools` 中对历史记录执行一键回放，回到当前调试面板重新执行。

### 物化与漂移检测口径
- **D-09:** 物化/重新发布、漂移检测和结果查看都收敛到 `DevTools`；详情页不再承担正式运行动作。
- **D-10:** `CubeDetail / ViewDetail` 继续保留最近发布、最近漂移状态、最近检测时间等摘要，但完整运行证据与操作都回到 `DevTools`。

### the agent's Discretion
- `DevTools` 内调试历史的具体留存方式、展示密度和默认排序。
- “主对象 / 关联对象摘要”的具体字段结构与呈现样式。
- 结果样本、错误分类、hint 和版本标识的排版方式，以及摘要卡片的具体信息层级。
- 物化/漂移结果在详情页上的摘要文案和跳转动作名称。

</decisions>

<specifics>
## Specific Ideas

- 用户明确强调：语义中心的重点在语义建设和规模化，运行只是调试能力，不是平台内真实消费入口。
- 用户明确指出：真实调用不在语义中心平台上，而是在应用层；因此 Phase 3 不应演化出第二个查询产品。
- 用户接受把 `DevTools` 作为唯一正式运行入口，只要对象详情页还能稳定提供运行摘要和跳转。
- 用户希望“查询可信”服务于调试和排查，所以标准证据包应覆盖 SQL、对象上下文、结果摘要、执行耗时、错误 hint 和定义版本。

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 项目范围与阶段目标
- `.planning/PROJECT.md` — 当前 brownfield 约束、语义层优先级和“运行只服务调试”的平台边界。
- `.planning/REQUIREMENTS.md` — Phase 3 对应的 `RUN-01` 至 `RUN-05`、`QRY-01` 至 `QRY-04` requirement。
- `.planning/ROADMAP.md` — Phase 3 的目标、成功标准与排序理由。
- `.planning/STATE.md` — 前两阶段已锁定前提、当前推进顺序和已知验证阻塞。

### 架构与语义工作台基线
- `docs/TECH_STACK_AND_ARCHITECTURE.md` — 当前 `React SPA + Flask API + PostgreSQL/Redis/RQ` 技术栈与语义中心在系统中的位置。
- `docs/architecture/README.md` — 当前架构目录与系统边界说明。
- `docs/architecture/decisions/ADR-001-platform-baseline.md` — 平台分层、运行角色和不可突破的总体基线。
- `docs/architecture/decisions/ADR-002-semantic-assets-in-yaml.md` — 语义对象的 YAML 承载与定义文件边界。
- `docs/architecture/decisions/ADR-004-semantic-workbench-page-model.md` — `DevTools`、详情页和语义工作台页面模型分工。
- `docs/architecture/decisions/ADR-005-domain-oriented-api-boundary.md` — `/api/v1/semantic/*` 的业务边界与接口组织方式。

### 语义层产品设计与验证
- `docs/prd/semantic_layer_prd.md` — 语义层对象、工作台、运行与调试相关设计输入。
- `docs/semantic_verification.md` — 语义中心专项验证入口、浏览器回归与状态契约。
- `docs/quality/testing.md` — 仓库统一验证入口与四层校验原则。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/pages/Semantic/DevTools.tsx`：现有 `定义文件 / 编译调试 / Schema 同步` 工作台骨架，是 Phase 3 的主入口基础。
- `frontend/src/components/Semantic/DevTools/CompileDebugTab.tsx`：现有编译调试承载面，可继续扩展标准证据包和调试历史。
- `frontend/src/components/Semantic/DevTools/SchemaSyncTab.tsx`：现有 Schema 同步与漂移检测入口，可承接运行闭环中的漂移结果展示。
- `frontend/src/pages/Semantic/ViewDetail.tsx`：已有发布摘要、漂移摘要和 SQL 展示，可收敛为“只展示摘要和跳转”的详情页模式。
- `frontend/src/pages/Semantic/CubeDetail.tsx`：已有最近漂移状态与对象摘要，可补充运行摘要跳转而不扩成运行台。

### Established Patterns
- 后端继续沿用 `interfaces -> application -> domain -> infrastructure` 分层，运行相关 API 应保持薄接口层，编排落在 `app/application/semantic/*`。
- 语义中心工作台已经有“详情页给摘要、工具页做重操作”的现实基础，Phase 3 应沿这条路径继续收敛而不是新开页面模型。
- 语义对象继续以 YAML 为主承载，因此运行闭环应围绕“当前定义版本”做可信标识，而不是引入新持久化中心。

### Integration Points
- `app/application/semantic/semantic_query_service.py`：编译 DSL、执行语义查询、返回 SQL/错误 hint 的核心编排点。
- `app/application/semantic/semantic_service.py`：语义定义与查询服务的统一门面，可作为 DevTools 的后端聚合入口。
- `app/application/semantic/view_publish_service.py`：现有物化/发布状态和 `definition_hash` 的关键实现边界。
- `app/application/semantic/schema_sync_service.py`：漂移检测、结果汇总与状态回写的核心服务。
- `app/interfaces/api/v1/semantic.py`：`compile`、`query`、`materialize`、`materialize-status`、`schema-sync` 等运行入口的对外 API 边界。

</code_context>

<deferred>
## Deferred Ideas

- 独立的查询历史产品、跨页面历史管理或分析师查询工作台，延后到后续应用层或查询中心相关阶段。
- 语义中心内的运行看板或运营大盘，不纳入 Phase 3。
- 面向最终业务消费的查询结果展示增强，继续留在应用层处理。

</deferred>

---

*Phase: 03-semantic-runtime-and-query-trust*
*Context gathered: 2026-03-26*
