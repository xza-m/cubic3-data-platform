# ROADMAP: CUBIC3 企业数据应用平台

**Granularity:** standard  
**Basis:** brownfield 现有 `React SPA + Flask API + PostgreSQL/Redis/RQ` 平台骨架  
**Priority order:** 先核心平台稳定与语义中心完整，再做应用消费，最后做智能问数 / DataAgent 验证

## Ordering Rationale

1. 先稳住数据接入、数据集、预览和部署底座，避免后续所有能力建立在不稳定输入上。
2. 再补齐语义对象生命周期与领域目录，让语义资产组织层先可用、可查、可管。
3. 然后完成语义运行闭环与查询可信，保证编译、发布、查询、漂移和追踪都能闭环。
4. 接着做应用模板与实例消费，验证语义层可以稳定向应用侧输出。
5. 最后再做智能问数与垂直 DataAgent，避免把 AI 建在未收敛的语义契约上。

## Phase Plan

| Phase | Name | Goal | Mapped Requirements | UI Hint |
|---|---|---|---|---|
| 1 | 基础接入与运行底座稳定化 | 把异构数据接入、元数据同步、数据集维护、查询预览和单机部署底座先做稳，确保后续语义工作有可信输入。 | `DATA-01` `DATA-02` `DATA-03` `DATA-04` `DATA-05` `OPS-01` | 数据中心、数据集页 |
| 2 | 语义对象生命周期与领域目录 | 补齐 `Cube / View / Domain / Recipe` 的创建、编辑、归属和目录化组织能力，让语义中心具备真正的治理入口。 | `SEM-01` `SEM-02` `SEM-03` `SEM-04` `SEM-05` `DOM-01` `DOM-02` `DOM-03` `DOM-04` | 语义工作台、领域目录 |
| 3 | 语义运行闭环与查询可信 | 围绕 `DevTools` 收敛编译、查询、物化、漂移检测和查询可信证据，让语义对象从“能建”走向“能调试、能回放、能验证”，而不把语义中心扩成消费查询平台。 | `RUN-01` `RUN-02` `RUN-03` `RUN-04` `RUN-05` `QRY-01` `QRY-02` `QRY-03` `QRY-04` | `DevTools`、对象详情摘要 |
| 4 | 应用模板与实例消费 | 用最小可运行模板验证语义层消费能力，落地至少一个应用实例样板并约束在现有模板体系内。 | `APP-01` `APP-02` `APP-03` `APP-04` `APP-05` | 应用中心、订阅管理 |
| 5 | 受控智能问数验证 | 在已稳定的语义层之上打通问数闭环，重点验证流程完整、结果可追踪，而不是追求效果最优。 | `AIQ-01` `AIQ-02` | DataChat / 问数入口 |
| 6 | DataAgent 验证与最终生产收敛 | 用垂直 `DataAgent` 场景证明语义层可支撑智能扩展，并把部署后的核心页面与流程收敛到内部可用标准。 | `DAG-01` `DAG-02` `OPS-02` `OPS-03` | DataAgent 工作台、系统状态页 |
| 7 | 语义消费收口·发布累积 | 让 active runtime manifest 累积 namespace 内所有已发布资产、成为完整多 cube 目录（含基线重建），消除"每次发布整盘替换、活菜单只剩 1 个 cube"的结构缺陷；只动发布/release 侧，不碰消费侧。 | `CONSUME-01` | 无前端（后端 release 服务） |
| 8 | 语义消费收口·问数切 official | DataChat 全局问数 grounding/discovery 统一读 active manifest（runtime_mode=official），打通"自助建模发布的 cube → 问数能消费出数"；comment demo 不回归。 | `CONSUME-02` | DataChat / 问数入口 |
| 9 | 语义消费收口·文档对齐与验收 | 文档把"semantic router 已切 RuntimeSemanticCatalog/manifest"从应然标为已落地，全平台 verify 回归。 | `CONSUME-03` | 文档 |

## 里程碑 M7：语义消费收口（2026-06-26 立项）

> 打通"自助建模发布的 cube → DataChat 问数能消费出数"。根因：语义消费"双轨断点"——发布只写运行时快照且不累积（manifest 永远单 cube）；DataChat 问数读 YAML 而非 manifest。修复方向 = 统一到单一事实源 active manifest（不写 YAML，贴合 `docs/architecture/semantic-binding-and-rls.md` §1.4）。Phase 7→8→9 顺序执行，各自独立可上线/回滚。

## Current Position

> 对齐时间：2026-06-10（Phase 3-6 收尾方案执行后更新）。2026-03 之后大量能力通过 roadmap 外主线（语义建设工作台 / Modeling Copilot、semantic release 治理、权限中心、query gateway、架构优化六阶段）落地。

- Phase 1 / Phase 2：已完成（2026-03-25 / 2026-03-26），结论不变。
- Phase 3（语义运行闭环与查询可信）：**已达成（D-09 口径修订）**。compile/query 返回 `definition_hash` + 稳定 `error_code` 分类（dsl_validate / compile / datasource_binding / sql_syntax / permission / timeout / schema_mismatch 等 + hint）；`DiagnoseRun` 记录定义版本（migration 0010）；DevTools 新增「查询执行」Tab 展示标准证据包（SQL / 主关联对象 / 结果样本 / 行数 / 耗时 / 错误分类 / 定义版本）；CompilePanel 传完整 JSON DSL；诊断历史一键回放（前端回填）；URL 深链 `?tab=query&object=<cube>`。**D-09 裁剪决策**：不把物化动作硬搬进 DevTools——ViewDetail「触发物化」保留为运营动作，CubeDetail / ViewDetail 增加「去 DevTools 调试」深链承担调试与证据职责；即"DevTools 是唯一调试与证据入口，但不是唯一运营动作入口"，取代原 D-01"唯一正式运行入口"表述。
- Phase 4（应用模板与实例消费）：**代码侧完成，外设验收基本通过（2026-06-11 更新）**。env.sample 补 `AGENT_CODEX_*` 段；compose 透传 `SUPERSET_*`；订阅 trigger → delivery → channel 合约测试落地（失败写 `SubscriptionDeliveryLog`）。真实联调（见 `docs/runbooks/production-acceptance.md`）：飞书渠道真实送达 + 交付日志 ✅；schema_drift_check 复跑 ✅；anomaly_monitor 真实业务监控实例（举报量阈值告警）触发并送达飞书 ✅（修复 executor `context.instance` 属性错误）；bi_dashboard_push ✅（2026-06-11 下午：Superset db 账号可用，executor 重构为真实 API 合约——原实现调用不存在的 screenshot 端点；截图因部署侧未开 `EnableDashboardScreenshotEndpoints`/`THUMBNAILS` 降级为链接推送，订阅送达飞书成功）。
- Phase 5（受控智能问数验证）：**代码侧完成，主链路真实出数已打通并经正式建模链路复现（2026-06-11）**。三层回退（semantic router → agent → legacy LLM）统一写 `Message.source` 与 `via_semantic_layer`（migration 0010）；legacy 回答前置「未经语义层验证」标注；三层全部补写 `agent_query_log`；DataChat 来源徽标 + semantic plan trace。真实联调：2026-06-10 本地 gateway 首跑 `total_count=434249`；2026-06-11 Modeling Copilot 正式链路发布（Release 11）后经远程线上 gateway（10.1.20.87）复现 `total_count=435910`（instance `20260611064350701g48ay1685s1`）。累计修复 6 个真实缺陷（policy decision_id 回写、published cube 状态强制 active、execute 端 principal 解析对齐、measure 聚合不再双重包裹、runtime catalog 不识别单数 `ontology.object`、ontology 资产 draft 状态未提升 active）；飞书 P2P 一问一答已于 2026-06-11 傍晚真人联调通过（Agent Loop 降级 SQL 直查 MaxCompute 出数，交互卡片送达，`agent_query_log` 落库）。
- Phase 6（DataAgent 验证与生产收敛）：**验收通过（2026-06-11）**。`docker compose up` 全栈（nginx/backend/rq_worker×2/postgres/redis）启动健康，migration 0010 head，核心链路 smoke（登录 → 数据源 → 语义 compile/query 证据包 → 订阅交付）通过；镜像内 Codex CLI 0.133.0 可用；codex_sdk 真实 run 通过（review_proposal run succeeded，复审输出为真实语义判断而非 mock）。
- 本轮验收发现并修复两个真实缺陷：① `QueryCompiler` 硬编码反引号别名导致 PostgreSQL 源 SQL 非法（新增 `SQLDialect.quote_identifier`）；② Cube 定义更新后查询服务 compiler/JoinGraph 缓存不失效（`_after_save` 同步失效查询缓存）。
- Roadmap 外已完成主线（2026-03 后）：语义建设工作台 / Modeling Copilot（含批量建模）、semantic release 治理与发布预览、轻量权限中心（ADR-013，access + governance）、dw-query-gateway 对接、架构与交互优化六阶段（2026-06，后端 ≈8.5 / 前端 ≈9.0，含错误处理统一、copilot 服务拆分、ConfirmDialog、i18n 中文单语收敛、ModelingAgent 拆分、IA/权限门控/全局搜索）。
- 剩余阻塞项（2026-06-11 傍晚最终更新，见 `docs/runbooks/production-acceptance.md` §6）：Codex run ✅、anomaly_monitor ✅、正式建模链路重发布 ✅、bi_dashboard_push ✅、飞书 P2P 问数 ✅ 全部解除，**单机 Docker 生产验收关账**。可选改进：旧 YAML cube `source_id` 失效绑定清理、Superset 截图 feature flag、cubic3 独立飞书应用（与 hermes 共存）。

## Phase Success Criteria

### Phase 1: 基础接入与运行底座稳定化

- 至少一种异构数据源可以完成接入、连接校验和元数据同步。
- 数据集可以被创建、查看、维护，并能稳定返回查询预览结果。
- 接入、同步、预览失败时，用户可以看到可操作的失败原因。
- 单机 Docker 部署路径可用，且能支撑基础数据中心流程。

### Phase 2: 语义对象生命周期与领域目录

- `Cube / View / Domain / Recipe` 可以创建、编辑、保存并继续维护。
- 领域目录能展示领域对象列表、状态、描述和基础搜索/筛选能力。
- 语义对象与领域之间的组织关系可见、可维护、可追踪。
- 生命周期状态对用户可感知，且在编辑和保存时保持一致。

### Phase 3: 语义运行闭环与查询可信

- `DevTools` 是唯一正式运行入口，语义对象可以在其中完成编译、查询、物化或等价发布以及漂移检测。
- 每次调试都能查看标准证据包，包括 SQL、对象摘要、结果样本、执行耗时、错误分类 / hint 与定义版本标识。
- `ViewDetail / CubeDetail` 只保留最近运行摘要和跳转，不再承担正式运行动作。
- 轻量调试历史和回放能力只服务 `DevTools` 内排查与验证，不扩成平台级查询历史产品。

### Phase 4: 应用模板与实例消费

- 至少一个数据异常监控订阅、一个数据看板订阅、一个数据集订阅和一个 Schema 漂移检测实例可运行。
- 应用实例建立在现有 base 模板或等价约束模板之上，而不是自由拼装。
- 应用消费链路能稳定访问语义层输出并回写实例状态。

### Phase 5: 受控智能问数验证

- 问数流程可以从提问完整走到结果返回。
- 智能问数输出即使不稳定，也必须能追踪到语义对象、查询结果或失败原因。
- 问数链路不直接绕开语义层，且具备最小可回退能力。

### Phase 6: DataAgent 验证与最终生产收敛

- 至少一条垂直 `DataAgent` 验证链路可以运行，并明确依赖现有语义层。
- 部署后的核心链路可以实际运行，覆盖数据接入、语义中心、查询能力和应用实例。
- 内网主要页面和功能流在目标部署环境下保持基本顺滑和稳定。
- 生产收敛以单机 Docker 可用为边界，不扩展到多租户、权限治理或云原生目标。

### Phase 7: 语义消费收口·发布累积（`CONSUME-01`）

- 连续发布 cube A、再发布 cube B 后，active runtime manifest 同时包含 A 与 B（按 `asset_key` 去重、新覆盖旧），不再被整盘替换为单 cube。
- `rollback_to` 语义为"恢复那一版的全量目录"；现有 release 状态机不回归（published→superseded、单 namespace 单 active 不变量保持）。
- 一次性基线重建：当前应在线的 cube 集合（至少答题 cube + comment demo cube）合并进一个全量 active release 作为起点。
- 全程不写 YAML、不改消费侧（不切 official / 不改 grounding / 不改 discovery）；comment demo 既有发布链路（`p34-modeling-agent-live`）不被打挂。

**Plans:** 2 plans（wave 1 RED → wave 2 GREEN，TDD）

Plans:
- [ ] 07-PLAN.md — Wave 1: 发布累积 RED 测试（坐实不累积 + comment 不在 manifest）
- [ ] 07-02-PLAN.md — Wave 2: publish 按 asset_key 累积合并（GREEN）+ compatibility 累积口径 + rollback 护栏 + 基线重建 service 方法

### Phase 8: 语义消费收口·问数切 official（`CONSUME-02`）

- DataChat 全局问数读 active manifest（`send_message_handler` 传 `runtime_mode="official"`），自助建模发布的 cube 可被问到并出数。
- "能问什么" discovery 与 grounding 同源（均来自 active manifest）。
- comment demo 经 DataChat 仍可问到出数 **当且仅当其 cube 已发布进全量 manifest**（由 Phase 7 基线重建保证）；切 official 后，仅在 YAML、未发布的 cube 不再被命中是预期方向（CONTEXT D3，单一事实源），本期不为保 comment 做 YAML 并集。
- 无 active 快照时诚实回"运行时尚未就绪"，不 500、不伪造。

**Plans:** 2 plans（wave 1 RED → wave 2 GREEN，TDD）

Plans:
- [ ] 08-PLAN.md — Wave 1: RED 测试（坐实 send_message_handler 未传 runtime_mode="official"）
- [ ] 08-02-PLAN.md — Wave 2: D1 切 official（GREEN）+ 兜底语义确认 + D2 discovery 同源 + official 出数/无快照诚实兜底/comment 不命中集成测试

### Phase 9: 语义消费收口·文档对齐与验收（`CONSUME-03`）

- `docs/architecture/semantic-binding-and-rls.md` §1.4 / `README` 把"router 已统一切 RuntimeSemanticCatalog/manifest"由应然标为已落地。
- 全平台 `make verify` 回归通过；`p34 / p32` 不回归。
