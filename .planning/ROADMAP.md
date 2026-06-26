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
| 8.1 | 语义消费收口·治理地基与物理直表收口 | 让 DataChat 主链与全局 Agent API 走同一治理管线（pre_route/post_compile + principal 透传 + 拒匿名），彻底删除两条"直接扫物理表产 SQL"旁路（legacy 第3层 + agent 第2层），统一收敛到诚实兜底；堵死"从 Ontology 直接产 SQL / 直接扫物理表"的红线。 | `CONSUME-04` | DataChat / 问数入口 |
| 8.2 | 语义消费收口·L1 意图理解升级 | 把 L1 从纯字符串子串匹配升级为"LLM 抽取 → 严格 grounding 白名单（只认已发布 candidate）→ 诚实兜底"，先建 eval 护栏，全程 env 默认关、真实 LLM 验证后再开。 | `CONSUME-05` | 无前端（后端 router） |
| 9 | 语义消费收口·文档对齐与验收 | 文档把"semantic router 已切 RuntimeSemanticCatalog/manifest"从应然标为已落地，全平台 verify 回归。 | `CONSUME-03` | 文档 |

## 里程碑 M7：语义消费收口（2026-06-26 立项）

> 打通"自助建模发布的 cube → DataChat 问数能消费出数"。根因：语义消费"双轨断点"——发布只写运行时快照且不累积（manifest 永远单 cube）；DataChat 问数读 YAML 而非 manifest。修复方向 = 统一到单一事实源 active manifest（不写 YAML，贴合 `docs/architecture/semantic-binding-and-rls.md` §1.4）。Phase 7→8→8.1→8.2→9 顺序执行，各自独立可上线/回滚。Phase 8.1/8.2（2026-06-26 追加）把"问数符合 L1→L2 架构"的三处偏离收口：8.1 治理地基对齐 + 删两条物理直表旁路，8.2 L1 grounding 升级。

**完成状态（2026-06-26，Phase 7/8/9）**：
- ✅ **Phase 7 发布累积**：`semantic_release_service.publish` 改按 `asset_key` 累积 namespace 全部已发布资产 + `rebuild_active_baseline` 基线重建；附带修 `_build_compatibility_declaration` 保留资产误报 breaking。在线坐实 active manifest 单 cube → 2 cube。443 语义单测 + 27 release 集成全绿。
- ✅ **Phase 8 DataChat 切 official**：`send_message_handler` 传 `runtime_mode="official"`，DataChat 主链读 active manifest，official 下 grounding 命中已发布 cube 并编译 SQL（实测 "学生答题统计 总数" → route_type=cube）。**D2 discovery 同源已回退**（commit dc0da25）——`GET /semantic/cubes` 是 Cube 管理列表通用契约，切 manifest 越界打破管理页；留 follow-up（应走 DataChat 专属 manifest 端点，不复用通用列表）。
- ✅ **Phase 9 文档对齐 + verify**：§1.4 标注 DataChat 主链已落地 official；全后端 2671 passed / 3 skipped。
- 🔴 **遗留（独立 M3 RLS 待办，非 M7 范围）**：published cube 经 DataChat 消费出数被治理访问层默认拒绝（`governance/access.py:698` 无匹配访问策略→deny；handler `viewer_roles=[]` 写死；`observe` 模式在 router 路径仍阻断）。命脉前两道门（manifest 单一事实源 + grounding/编译）已通，第③道门（访问授权）属 M3——需给已发布 cube 配访问策略 + handler 传真实角色 + 查 observe 为何在 router 路径阻断。旁证：DataAgent 运行时工具路径已真出数 3989 万（cube 确实可消费）。

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
- [x] 08-PLAN.md — Wave 1: RED 测试（坐实 send_message_handler 未传 runtime_mode="official"）✅ 2026-06-26（`cf7ae51`）
- [x] 08-02-PLAN.md — Wave 2: D1 切 official（GREEN）+ 兜底语义确认 + D2 discovery 同源 + official 出数/无快照诚实兜底/comment 不命中集成测试 ✅ 2026-06-26（`e5151cb`/`73862ce`/`674dcd1`，四文件 38 passed）；D4 运维桥接 + 真实闭环验证待执行者做

### Phase 8.1: 语义消费收口·治理地基与物理直表收口（`CONSUME-04`）

> 背景：Phase 8 切 official 后，问数"符合 L1→L2 架构"仍有三处偏离，本期收口前两处（治理地基 + 物理直表），L1 升级留 Phase 8.2。锁定口径（2026-06-26）：完整治理对齐 / 彻底删两条物理直表路 / 必须登录。详见 `.planning/phases/08.1-*/08.1-CONTEXT.md`。

- **治理管线对齐**：DataChat 主链（`send_message_handler._handle_via_semantic_router`）与全局 Agent API（`/agent/semantic/plan`）走同一治理裁决——复用 `AccessPolicyDecisionService` 的 `pre_route` / `post_compile`（DI 已有，`container.py:323`），不再只写死 `viewer_roles=[]`；同一治理主体在两入口提同一问，`policy_decision.decision` 一致。
- **principal 透传 + 拒匿名**：`conversations.py` send-message 从 `optional_auth` 收紧为必须登录（与 `agent.py` 同口径），principal 解析只在 interfaces 层（碰 `g`），经 `SendMessageCommand` 透传进 application；不在 handler 注入 `PrincipalResolver`（`execute_plan` 内部已 `_resolve_roles`）。
- **两条物理直表旁路彻底删除**：① legacy 第 3 层 `_handle_via_legacy_llm` 物理分支 + `_execute_query`（绕 dw-query-gateway，违反 `base_adapter.py:117`）；② agent 第 2 层 `DataChatChannel`→`tool_registry.py:144 self._adapter.execute_query`。两条都删，无 env 灰度回退口子。
- **统一诚实兜底**：语义/agent 答不出（semantic 软失败 / 未命中 / agent 短路）统一收敛到 `_build_unanswerable_fallback()`（`source='fallback'` / `status='unanswerable'`），不产 SQL、不碰物理表；`_handle_via_agent` 对全局会话（`dataset_id is None`）短路 `return None` 消除死路径。
- **零新框架/端口/枚举**：全部复用既有构件（`AccessPolicyDecisionService` / `PrincipalResolver` / 诚实兜底范式 / 统一响应异常）；AI 入口净减少（删一条绕前门的 `OpenAIService.generate_sql` 路径）。
- **回归与文档**：改 `test_datachat_official_consume.py:313`（`legacy_llm`→`fallback`）+ 改写受影响 GREEN 单测 + 更新 `docs/runbooks/production-acceptance.md:80`；前端 DataChat dataset 选择器文案校准为"范围提示（可选）"；全平台 `make verify` 回归通过。

**Plans:** 3 plans（wave 1 RED → wave 2 GREEN 原子批次 → wave 3 收尾，TDD）

Plans:
- [x] 08.1-01-PLAN.md — Wave 1: RED + 定向探查（坐实治理缺口/物理直表/兜底不统一/匿名放行 + execute_plan 顶层无 resource_set 须重编译）
- [ ] 08.1-02-PLAN.md — Wave 2: GREEN 原子批次（治理对齐 pre_route/post_compile + principal 透传 + 拒匿名 + 删两条物理路 + 统一诚实兜底 + DI 装配）
- [ ] 08.1-03-PLAN.md — Wave 3: 收尾（前端未登录引导 + 跨入口一致性冒烟 + 文档同步 production-acceptance.md:80 + make verify + 真实闭环 checkpoint）

### Phase 8.2: 语义消费收口·L1 意图理解升级（`CONSUME-05`）

> 背景：L1 当前是纯 `_normalize(candidate) in normalized_question` 子串首命中匹配，LLM 抽取只是"盲拼词袋到 match_text"无 grounding，坏术语直接污染。锁定口径（2026-06-26）：严格 grounding 白名单（同义词靠 glossary aliases）。依赖 Phase 8.1 的诚实兜底作为 grounding 失败的安全落点。

- **严格 grounding 白名单**：LLM 抽取的术语只采纳能 `_normalize` 命中 official active manifest **已发布 candidate**（metric/object/relation/action name·title·aliases + glossary term·canonical·aliases）的，命不中即丢弃；grounding 单点落 router 的 `_ground_terms`（真值来自 `RuntimeSemanticCatalog.from_manifest`），并加最小长度护栏（防短 candidate 如"量""数"变污染源）。
- **不过度工程**（对抗审查结论）：砍掉打分/阈值/多候选消歧体系（现状首命中只在同类型多命中才"盲取第一个"，罕见），只加一行"更长 candidate 优先"；砍双重 grounding（不给 `LlmIntentExtractionService` 加永远传 None 的 `grounding_fn`）；不复用语义不匹配的 `_dimension_match_score`。
- **eval 护栏先建**：新增 `test_intent_grounding_eval.py`（坏术语污染必被丢弃 / 口语问句→期望 route_type / grounding 全丢→blocked→下游兜底文案），作为开 env 的硬前置门。
- **AI 仍走单前门**：经 `AgentInferenceRuntimeService.complete('global_ask.intent_extract')`，不新增 action/枚举/端口/provider；`SEMANTIC_ROUTER_LLM_INTENT_ENABLED` 默认 false（**新增** `env.sample` 条目，当前缺失），关闭态与今天逐字节等价；内网真实 LLM 验证达标后手动置 true。
- 文档：`docs/architecture/README.md`（L1 路由命中语义由"子串"变"已发布 candidate grounding"）+ `docs/quality/testing.md`（新 eval 入口）同步。

### Phase 9: 语义消费收口·文档对齐与验收（`CONSUME-03`）

- `docs/architecture/semantic-binding-and-rls.md` §1.4 / `README` 把"router 已统一切 RuntimeSemanticCatalog/manifest"由应然标为已落地。
- 全平台 `make verify` 回归通过；`p34 / p32` 不回归。
