# Requirements: CUBIC3 企业数据应用平台

**Defined:** 2026-03-25  
**Core Value:** 在统一语义层支撑下，让企业内部用户可以稳定地完成从数据接入、数据建模、数据查询到数据应用消费的完整闭环

## v1 Requirements

本次 v1 面向 brownfield 仓库的“生产可用强化”，重点是把现有能力做稳、做通、做成可持续演进的内部平台。智能能力纳入 v1，但仅限验证性落地，不以效果最优为目标。

### 数据接入与数据集

- [x] **DATA-01**: 用户可以在内网环境下接入至少一种异构数据源并完成连接校验
- [x] **DATA-02**: 用户可以对已接入数据源执行元数据同步，并看到最新的表结构结果
- [x] **DATA-03**: 用户可以创建、查看和维护数据集，并在界面中看到关键元数据信息
- [x] **DATA-04**: 用户可以对数据集进行查询预览，并获得稳定可返回的预览结果
- [x] **DATA-05**: 当数据接入、同步或预览失败时，用户可以看到明确的失败原因

### 语义对象生命周期

- [x] **SEM-01**: 用户可以创建和保存 `Cube` 草稿，并继续编辑已有 `Cube`
- [x] **SEM-02**: 用户可以创建和维护 `View`，并查看其与语义对象的关联信息
- [x] **SEM-03**: 用户可以创建和维护 `Domain`，并把语义对象归属到对应领域
- [x] **SEM-04**: 用户可以创建和维护 `Recipe`，并让其与查询语义对象形成可消费关系
- [x] **SEM-05**: `Cube / View / Domain / Recipe` 至少具备清晰、可流转、可感知的生命周期状态

### 领域设计与领域目录

- [x] **DOM-01**: 用户可以在领域目录中查看领域对象列表、状态和基础描述信息
- [x] **DOM-02**: 用户可以在领域设计流程中维护领域与语义对象之间的组织关系
- [x] **DOM-03**: 用户可以在领域目录中搜索、筛选或定位目标语义资产
- [x] **DOM-04**: 用户可以从领域目录进入对应领域或语义对象的治理与建模入口

### 语义运行闭环

- [ ] **RUN-01**: 用户可以基于语义对象执行编译，并看到可执行的编译结果
- [ ] **RUN-02**: 用户可以基于语义对象执行查询，并获得可复现的查询结果
- [ ] **RUN-03**: 用户可以对符合条件的语义对象执行物化或等价发布动作，并看到状态结果
- [ ] **RUN-04**: 用户可以执行 Schema / Drift 检测，并看到检测结果与风险状态
- [ ] **RUN-05**: 语义运行链路在核心路径上具备稳定性，能够支撑后续应用与智能能力消费

### 查询可信与可追踪性

- [ ] **QRY-01**: 用户在执行语义查询时可以查看生成 SQL 或等价可解释结果
- [ ] **QRY-02**: 用户可以查看查询历史、失败原因或关键运行状态
- [ ] **QRY-03**: 用户可以在平台内复现核心查询结果，而不依赖隐式页面状态
- [ ] **QRY-04**: 用户可以感知语义查询相关的刷新、缓存或发布状态信息（若适用）

### 应用模板与实例

- [ ] **APP-01**: 平台至少提供一个可运行的数据异常监控订阅实例
- [ ] **APP-02**: 平台至少提供一个可运行的数据看板订阅实例
- [ ] **APP-03**: 平台至少提供一个可运行的数据集订阅实例
- [ ] **APP-04**: 平台至少提供一个可运行的 Schema 漂移检测实例
- [ ] **APP-05**: 应用实例建立在现有应用 base 模板或等价约束模板之上，而不是完全自由扩展

### 验证性智能能力

- [ ] **AIQ-01**: 用户可以基于平台语义层发起智能问数，并完成从提问到结果返回的闭环
- [ ] **AIQ-02**: 智能问数输出可以不稳定，但必须可追踪其使用的语义对象、查询结果或失败原因
- [ ] **DAG-01**: 平台至少提供一个垂直场景 `DataAgent` 验证链路
- [ ] **DAG-02**: `DataAgent` 必须建立在现有语义层能力之上，而不是绕开语义层直接成为通用 Agent 平台

### 部署与生产可用

- [x] **OPS-01**: 平台可以通过当前单机 Docker 方式在内网环境中完成部署
- [ ] **OPS-02**: 核心链路在部署后可实际运行，包括数据接入、语义中心、查询能力和应用实例
- [ ] **OPS-03**: 平台内部主要页面与功能流在目标内网环境下保持基本顺滑和稳定

## v2 Requirements

这些能力有明确价值，但不属于当前 v1 交付范围。

### 智能应用扩展

- **AIX-01**: 平台支持更完整的智能问数效果优化与评估体系
- **AIX-02**: 平台支持多个垂直 `DataAgent` 场景的标准化扩展
- **AIX-03**: 平台支持通用 Agent 工具编排、记忆与治理能力

### 应用生产能力

- **APPX-01**: 平台支持基于应用模板的低代码配置式应用生产
- **APPX-02**: 平台支持 AI 引导式应用生成与装配
- **APPX-03**: 平台支持更丰富的应用模板市场与分发治理能力

### 平台治理与规模化

- **PLT-01**: 平台支持多租户隔离能力
- **PLT-02**: 平台支持完整权限治理与访问控制体系
- **PLT-03**: 平台支持云原生、高可用和更复杂的生产部署拓扑

## Out of Scope

明确排除当前不做的范围，避免 roadmap 阶段再次把它们带回 v1。

| Feature | Reason |
|---------|--------|
| 多租户 | 当前阶段只面向内网单环境，优先保证单环境核心链路可用 |
| 权限体系实现 | 本轮明确不做权限层面的任何正式实现 |
| 通用 Agent 平台化 | 当前只做问数和垂直 `DataAgent` 验证，不建设通用平台 |
| 低代码 / AI 引导式应用生产正式落地 | 只作为后续方向和决策背景，不纳入本轮交付 |
| 云原生 / 高可用 / 分布式部署 | 当前以单机 Docker 内网部署为准 |
| 语义中心 UI/UX 全量重做 | 建模体验优化将作为独立项目推进 |
| 开放式扩展开发框架 | 当前优先做模板约束和主链路闭环，不做开放平台 |

## Traceability

由 roadmap 阶段补齐每个需求与 phase 的对应关系，且每条 v1 需求只能映射到一个 phase。

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Completed |
| DATA-02 | Phase 1 | Completed |
| DATA-03 | Phase 1 | Completed |
| DATA-04 | Phase 1 | Completed |
| DATA-05 | Phase 1 | Completed |
| SEM-01 | Phase 2 | Completed |
| SEM-02 | Phase 2 | Completed |
| SEM-03 | Phase 2 | Completed |
| SEM-04 | Phase 2 | Completed |
| SEM-05 | Phase 2 | Completed |
| DOM-01 | Phase 2 | Completed |
| DOM-02 | Phase 2 | Completed |
| DOM-03 | Phase 2 | Completed |
| DOM-04 | Phase 2 | Completed |
| RUN-01 | Phase 3 | Pending |
| RUN-02 | Phase 3 | Pending |
| RUN-03 | Phase 3 | Pending |
| RUN-04 | Phase 3 | Pending |
| RUN-05 | Phase 3 | Pending |
| QRY-01 | Phase 3 | Pending |
| QRY-02 | Phase 3 | Pending |
| QRY-03 | Phase 3 | Pending |
| QRY-04 | Phase 3 | Pending |
| APP-01 | Phase 4 | Pending |
| APP-02 | Phase 4 | Pending |
| APP-03 | Phase 4 | Pending |
| APP-04 | Phase 4 | Pending |
| APP-05 | Phase 4 | Pending |
| AIQ-01 | Phase 5 | Pending |
| AIQ-02 | Phase 5 | Pending |
| DAG-01 | Phase 6 | Pending |
| DAG-02 | Phase 6 | Pending |
| OPS-01 | Phase 1 | Completed |
| OPS-02 | Phase 6 | Pending |
| OPS-03 | Phase 6 | Pending |
| CONSUME-04 | Phase 8.1 | In Progress |
| CONSUME-06 | Phase 10 | Completed |

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0

> 脚注：`CONSUME-0x` 系列为 v1 后增量收口需求（问数语义消费链路：治理地基对齐 + 物理直表收口 + 诚实兜底 + 编译器默认分区注入），**不并入上表 v1 35 条 Coverage 计数**，仅补登台账可追溯性。`CONSUME-04`（Phase 8.1，治理地基 + 物理直表收口）状态随 Wave 3 收尾推进；`CONSUME-05`（L1 意图理解升级）留 Phase 8.2；`CONSUME-06`（Phase 10，编译器默认分区注入：date 型分区 cube 无显式过滤时注入默认最近 7 天窗口绕开 ODPS-0130071）已于 2026-06-26 GREEN 落地、代码侧关账（commit `cfbe55e`，整套 test_compiler.py `54 passed`），真实出数/docker 复跑为运维待办。

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-26 after Phase 2 execution*
