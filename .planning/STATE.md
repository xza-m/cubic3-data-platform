# STATE: CUBIC3 企业数据应用平台

## Project Reference

- **Project doc:** `.planning/PROJECT.md`
- **Core value:** 在统一语义层支撑下，让企业内部用户可以稳定地完成从数据接入、数据建模、数据查询到数据应用消费的完整闭环

## Current Status

- **Project status:** Phase 3-6 验收基本关账（2026-06-11）：Phase 1/2/3 完成；Phase 4/5/6 验收通过——问数主链路经 **Modeling Copilot 正式链路发布（Release 11）+ 远程线上 gateway** 复现真实出数（435910）；anomaly_monitor 真实业务告警送达飞书 ✅；codex_sdk 真实 run ✅；schema_drift_check ✅（详见 `ROADMAP.md` Current Position 与 `docs/runbooks/production-acceptance.md`）
- **Milestone status:** 2026-03 后大量能力经 roadmap 外主线落地（Modeling Copilot、semantic release、权限中心、query gateway、架构优化六阶段）
- **Current focus:** Phase 3-6 全部外设验收项已关账，单机 Docker 生产验收完成；2026-06-12 双层语义绑定规范定稿后，**M1+M2 已实施收敛并通过真实环境 E2E 验收**（Release 12 主链路 + 收敛批次：release 状态机 / Agent 通道优先级合约 / free SQL 同链裁决，证据见 `docs/runbooks/production-acceptance.md` 2026-06-12 复跑记录）；**M3 RLS 平台侧已实施完成**（2026-06-12 深夜：五构件 + 双主体 + metadata visibility + Key 模式 A/B + release pin 消费方；2026-06-14 过渡口径改为 `RLS_ENFORCEMENT_MODE` 开关、默认 `observe`——求值写审计但不阻断、网关零感知，先闭环语义评估，`deny`/`enforce` 留待 gateway 注入就绪；见 Next Actions 8）
- **Plan readiness:** D-01 已按 D-09 口径修订：DevTools 是唯一调试与证据入口，但运营动作（物化）保留在详情页
- **Phase 8 进行中（语义消费收口·问数切 official）:** Wave 1 (08-01, TDD-RED) 已完成（2026-06-26, commit `cf7ae51`）——立失败断言坐实 `SendMessageHandler._handle_via_semantic_router` 调 `execute_plan` 时未传 `runtime_mode="official"`。**Wave 2 (08-02, GREEN) 已完成（2026-06-26, commits `e5151cb`/`73862ce`/`674dcd1`）**：D1 核心一行 handler 切 `runtime_mode="official"`（08-01 RED 转 GREEN）；兜底两条路径经确认正确（无快照→诚实「语义运行时尚未就绪」；未命中→legacy 诚实兜底「未能找到口径」），仅加注释固化不扩行为；D2 cube discovery 切 active manifest（manifest 优先 + registry 兜底，与 grounding 同源）；新增 official 三条闭环边界集成测试（出数/无快照诚实兜底/comment 不命中 D3，全程 stub 不实连真实数据源）。四文件合并 **38 passed**，未碰 grounding/intent/编译器/YAML。**待执行者做 D4 运维桥接 + 真实闭环验证**（重启 docker 加载 Phase 7+8、跑 `rebuild_active_baseline`、经真实 DataChat 问"学生答题统计 总数"断言真实出数；见 08-02-SUMMARY 待办）。
- **Phase 8.1 进行中（治理地基 + 物理直表收口，3 plans / 3 waves，CONSUME-04）:** Wave 1 (08.1-01, TDD-RED) 已完成（2026-06-26, commits `e439db4`/`e9f8341`）——立 RED 断言坐实四缺陷：① **principal 透传命门**（`send_message_handler.py:99-103` 写死 `viewer_roles=[]` 零 `principal_context`，`execute_plan` 当前不收 → 真实角色到不了治理引擎 → 即便持 `data_m1_reader` 也 deny）；② **agent 第 2 层物理直表旁路未短路**（全局会话 `dataset_id is None` 当前建物理 adapter + running log 后吞错）；③ **兜底不统一**（全局会话/agent 软失败当前落 `source='legacy_llm'`，应统一 `fallback`）；④ 物理 legacy 路待删（xfail 标注）。**命门重述结论（对账实测）：principal 未透传，非『无治理管线』——post_compile 实测已在 `runtime_service.py:113/126` 链路**。两文件合并 `3 failed, 10 passed, 4 xfailed, 2 xpassed`（RED 已坐实，目标断言 `principal_context is None`/`source != fallback`），production 零改动。**Wave 2 (08.1-02, GREEN) 已完成（2026-06-26, commits `fcb4d35`/`6c6daad`，10min/2 tasks/6 files）**：① principal 透传（决策 4）——`SendMessageCommand` 加 `principal_context`/`viewer_roles` 可选字段、`conversations.py` send-message `@require_auth` + `principal_context_from_bearer` 经 command 透传、handler `execute_plan(principal_context=command.principal_context)`（删写死 `viewer_roles=[]`），**未重复引 post_compile**（grep 防回归 == 0，治理由已在链路的 runtime_service.execute 完成）；② 删两条物理直表旁路（决策 2）——legacy `_execute_query`/`AdapterFactory`/`LEGACY_DISCLAIMER`/物理 else 体净删 + agent 第 2 层 `dataset_id is None` → `return None` 短路；③ 统一诚实兜底（决策 5）——`_build_unanswerable_fallback`（`source='fallback'`/`status='unanswerable'`/`via_semantic_layer is False`），治理 deny / 未命中 / 主链全失败三类收敛；④ 拒匿名（决策 3）。两测试文件 `17 passed` 无 xfail，route_coverage 拒匿名回归修正 `28 passed`，不新增 DI 注入。**归档**：observe 不动（deny 在 access-grant 段、与 RLS mode 无关）、访问策略已 seed 不新配。**待 D4 运维桥接**：部署后给 DataChat 主体绑 `data_m1_reader` + 真实问「学生答题统计 总数」断出数。**Wave 3 (08.1-03) 待执行**：前端 dataset 文案校准 + 跨入口治理一致性冒烟 + 回归与文档同步。
- **Phase 10 进行中（编译器默认分区注入，2 plans / 2 waves，TDD，CONSUME-06）:** 第④道门（四道门最后一道）。根因：`compiler.py:204-218` 块7 只在 `cube.partition.latest_expr` 非空时注入分区谓词；对 `latest_expr=null` 的 date 型分区 cube（如 answer_records，实测 28 分区 cube 中 21 个 latest_expr 空）在无显式时间过滤时短路 → 编译裸 `SELECT ... FROM table`（无 WHERE 分区段）→ 撞 MaxCompute 全表扫描保护 ODPS-0130071 → DataChat 问数答不出。**Wave 1 (10-01, TDD-RED) 已完成（2026-06-26, commits `f192c8f`/`a49242b`，~2min/2 tasks/1 file）**：新增 `TestCompilerDefaultPartitionInjection`（Test A-H，8 用例）+ 翻转 `test_latest_partition_fallback`，固定时钟 `today=date(2026,6,26)`、窗口字面量写死 `20260620~20260626`（D2：win=min(7,max(max_range_days-1,1))，end=today，start=today-(win-1)；ANSWER max_range_days=90 → win=7）。覆盖：A 默认注入 / B-C 守护显式过滤（filters+time_dimensions）/ D 非date不注 / E source_sql不注 / F latest_expr优先MAX_PT / G 未知format→CompilationError（D5）/ H scoped_table_refs 安全锚点（审查补正③）。全套 `9 failed, 45 passed`——9 失败=8 新增+1 翻转，均首红因 `today=` TypeError（Wave 2 须先实现 keyword-only `today`，计划预期红），既有 45 绿零破坏，`git diff app/` 全空（零生产代码改动）。**Wave 2 (10-02, GREEN) 已完成（2026-06-26, commit `cfbe55e`，~2min/2 tasks/1 file）**：compiler.py 五处改动严格按 <interfaces> 契约——① `QueryCompiler.__init__` 加 keyword-only `today`（D4，生产调用点位置参零破坏）；② 块7 扩为「latest_expr 优先 > 默认7天 date 窗口 > 不注入」，仅 `part.type=="date"` 且 `source_sql` 空的物理表注入，走方言中立 `dialect.partition_condition`（非 MaxCompute 绝不注 MAX_PT）；③ `_has_explicit_partition_filter`（比对 (cube.name, part.field)，覆盖 filters+time_dimensions）取代旧 `has_time_range`（只比 cube.name），收紧 D3 缺口；④ `_fmt_strftime` 未知 format→CompilationError（D5）；⑤ 模块常量 `DEFAULT_PARTITION_WINDOW_DAYS=7` + `_FMT_STRFTIME`。**整套 test_compiler.py `54 passed`**（9 RED 转 GREEN + 既有 45 零回归），**Task 2 零断言校准**——既有 ANSWER fixture 用例全部经子串 in / negative 反证（默认段只引入 answer_date 范围谓词，不引入 answer_result/MAX_PT）/ scoped_table_refs exact-equal（注入不动 scoped_table_refs）幸存，实证 D1-D5 实现精准未偏离决策；dialects.py/entities.py/YAML/生产调用点零 diff。**风险登记**：`date.today()` 依赖容器 TZ，UTC 容器边界日凌晨可能比 MaxCompute +08 业务日历早一天——内网单机本期接受，运维侧确认容器 TZ=Asia/Shanghai 或登记偏移。**待 D4 运维桥接**（执行者运维侧做，不计入本 plan 验收门）：真实出数（DataChat 问「学生答题统计 总数」应绕过 ODPS-0130071 返最近 7 天）、docker 复跑 smoke 不回归、容器 TZ 核实。Phase 10（第④道门）代码侧关账。

## Completed Setup

- 项目初始化已完成
- codebase map 已完成
- project config 已读取
- research 已完成
- requirements 已定义并补齐 traceability
- phase 1 context / research / validation / plans 已生成
- phase 1 execute / summaries / verification 已完成
- phase 2 context / research / validation / plans / reviews 已生成
- phase 2 execute / summaries / verification 已完成（仓库级 `verify-semantic` 因无关 lint 问题阻塞，已记录）
- phase 3 context / discussion-log 已生成
- phase 3 research / validation / plans 已生成（2026-03 版本，部分前提已过期）
- 2026-06-10 完成项目现状与 roadmap 对齐（结论回写 `ROADMAP.md` Current Position）
- 2026-06-10 完成 Phase 3-6 收尾方案：Phase 3 证据包 + DevTools 闭环、Phase 5 问数可信标注、Phase 4 配置补齐与合约测试、单机 Docker 生产验收（runbook：`docs/runbooks/production-acceptance.md`）

## Working Memory

| Area | Memory |
|---|---|
| Architecture | 主线保持 `React SPA + Flask API + PostgreSQL/Redis/RQ`，不做大规模技术迁移 |
| Delivery target | 以内网单机 Docker 可用为当前交付边界 |
| Dependency order | 数据接入 -> 语义中心 -> 语义运行与查询 -> 应用消费 -> 智能验证 |
| Scope guardrails | 不引入多租户或云原生扩展；轻量权限治理已按 ADR-013 落地（access + governance），不再视为禁区 |
| Phase risk | 语义口径分叉、查询 fan-out、物理层漂移、AI 假答案、启动副作用 |
| Validation memory | 核心链路必须可追踪、可回放、可回归；失败原因不能被通用兜底吞掉 |
| Phase 1 context | 已落地 `PostgreSQL + MaxCompute`、三种数据集类型稳定可用、混合同步模式、`LIMIT 20` 样本预览与失败可见性 |
| Phase 1 verification | 已通过 Wave 1 后端定向 pytest、Wave 2 前端页面测试与 typecheck、Wave 3 `make test-regression-platform-data`、`tests/integration/test_api_routes_smoke.py`、`make verify-docs` |
| Phase 2 context | 已锁定 `Cube / Domain` 为正式建模对象，`View` 作为特殊 `Cube` 做展示层并入，`Recipe` 保持轻量对象；领域画布是真相、`Cube` 与 `Domain` 为多对多、目录页偏治理看板 |
| Phase 2 execution | 已收敛多领域投影、领域治理摘要、`View / Recipe` 轻量摘要与语义工作台展示；仓库级 `verify-semantic` 被无关前端 lint 阻塞，但定向 pytest、语义专项回归、`make typecheck-frontend`、`make verify-docs` 与 `make docs-impact` 已通过 |
| Phase 3 context | D-09 口径：DevTools 是唯一调试与证据入口（查询执行 Tab + 证据包 + 回放 + 深链已落地）；物化保留为详情页运营动作 |
| 2026-06 收尾 | Phase 3-6 代码侧全部收掉；Phase 5 legacy 回退保留但显式标注「未经语义层验证」并全路径落 `agent_query_log`；剩余阻塞全部是外部凭证（MaxCompute/Superset/Codex/飞书联调窗口） |
| 验收缺陷修复 | ① QueryCompiler 方言引用（PG 双引号）② Cube 更新后查询缓存失效（`_after_save` 同步失效）③ runtime catalog 不识别 copilot 发布的单数 `ontology.object` ④ 发布快照内 ontology 资产 draft 状态未提升 active ⑤ anomaly_monitor executor `context.instance` 属性错误 |
| Copilot 工作台 API 口径 | `PATCH /spec` 传 `{"spec": ...}` 为整体替换，局部修改（如补 partition）必须传 `{"cube": ...}` 部分覆盖；订阅按 `app_instance_id` 绑定，新实例需配套新订阅 |
| 架构基线 | 2026-06 架构优化六阶段完成：后端 ≈8.5 / 前端 ≈9.0；i18n 收敛为中文单语；ModelingAgent 与 semantic blueprint 已拆分；APScheduler 以单 worker + `ENABLE_SCHEDULER_JOBS` 约束 |

## Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260625-ros | 修复冷启动发布缺口:schema 快照透传分区标记(is_partition + partitions)以绑定 metric 时间维度 | 2026-06-25 | cc8bd5a | [260625-ros-schema-metric](./quick/260625-ros-schema-metric/) |

> 上线缺口根因:`_schema_snapshot_payload` 丢弃列级 `is_partition`/不生成顶层 `partitions`,使 `modeling_spec_repair` 派生链读不到分区 → ds 进不了 cube.dimensions → metric.time_dimension 为空 → 撞 `modeling_validation_matrix` 的 `metric_time_dimension_missing` 发布门禁。冷启动确定性建模对真实分区表无法发布(仅评论 canonical 路径可发)。修复为单点增量透传,3 个确定性单测全绿。**存量回填前提**:`build_table_evidence` 优先读旧持久化快照,修复只对新写入生效;已落地旧表(如 `dws_study_student_answer_kb_stat_di`)需部署后重新同步才带上 partitions。

## Next Actions

1. ~~MaxCompute 凭证~~ 已完成（2026-06-10）：plan→execute 真实出数 ✅、schema_drift_check 复跑 ✅。
2. ~~Modeling Copilot 正式链路重发布~~ 已完成（2026-06-11）：Release 11 发布后经远程线上 gateway 复现真实出数（435910）。
3. ~~codex_sdk 真实 run~~ 已完成（2026-06-11）：review_proposal run succeeded，复审输出为真实语义判断。
4. ~~anomaly_monitor 业务监控实例~~ 已完成（2026-06-11）：举报量阈值告警触发并经订阅送达飞书群。
5. ~~bi_dashboard_push~~ 已完成（2026-06-11）：Superset db 账号可用；executor 重构为真实 API 合约 + 截图降级链接推送；订阅送达飞书 ✅。（可选增强：Superset 侧开启 `EnableDashboardScreenshotEndpoints`/`THUMBNAILS` 后复跑可获真实截图）
6. ~~飞书 P2P 问数真人联调~~ 已完成（2026-06-11 傍晚）：真人私聊 → 长连接事件 → Agent Loop（语义 query 失败自动降级 SQL 直查 MaxCompute）→ 交互卡片回复送达 → `agent_query_log` 落库 success。注意运维约束：同一飞书应用只能由一套服务建长连接（联调时暂停了本机 hermes gateway）。
7. ~~验收关账~~ 已完成：`docs/runbooks/production-acceptance.md` 全部验收行 ✅，单机 Docker 生产验收完成。
8. 语义架构按 ADR-014（并行双门面 + 单一编译脊柱）收口，配套设计已定稿并通过评审补强（2026-06-12，`docs/architecture/semantic-binding-and-rls.md`，含 §6 六项硬化：release pin / metadata visibility / free SQL 收口 / 注入位置 / Warehouse Asset / 多身份一致性），按三个里程碑实施：
   - ~~**M1 绑定规范 + 运行时收口**~~ 已完成（2026-06-12 含收敛批次）：`cube_bindings` / `measure_refs[primary]` Schema 落实体、publish gate 断链校验矩阵、运行时 catalog 统一为 published manifest 并落到 DI 装配层、发布正确落 active；收敛批次补齐 release 完整状态机（published→superseded 显式落库、deprecate/revoke API + 审计、revoked 对 active/pinned 消费 fail closed、发布兼容性声明，迁移 `0011`）。
   - ~~**M2 Copilot 集成 + 信道对齐**~~ 已完成（2026-06-12 含收敛批次）：草稿生成即绑定、同批发布默认、release-preview / readiness binding blocker、信道语义工具集对齐（E2E：Release 12 + 双信道真实出数）；收敛批次补齐 Agent 通道优先级合约（AgentLoop 硬约束 `semantic_first_required` + 降级原因/tool_trace 记入 `agent_query_log`）与 free SQL 收口前置（FreeSqlGuard：resource_set + sql_hash 走 post_compile 同链裁决，解析失败 fail closed）。**未含**：语义包结构重整（D1 评估后另期：按建模态/发布态/运行时/资产底座分包，纯物理移动无行为收益，安排独立重构窗口）。
   - ~~**M3 RLS 平台侧五构件 + 身份硬化**~~ 已完成（2026-06-12 深夜，平台侧）：Wave 0 C1/A2 划界定案（裁决只在 DataPolicy 决策链，PolicyMetadata 降为展示偏好）→ Wave 1 数据链路（迁移 `0012`：row_scope 模板 + `access_principal_scopes` + 决策 effective_row_scope；governance API 解禁 + scope 管理 API + `PrincipalContext.data_scopes`）→ Wave 2 求值链路（post_compile 逐条求值，dimension_ref 经与编译同 release 的 manifest catalog 解析，on_missing deny；双主体 acting/subject；决策持久化 + m2_detail_read 种子模板）→ Wave 3 执行边界（free SQL / 非 gateway 引擎 / 注入未就绪三类 fail closed；GatewayAccessContext.v2；编译器 scoped_table_refs 注入锚点 + ticket 三元组）→ Wave 4 可见性与产品化（semantic.discover/describe 裁决 + Agent 工具与 search 脱敏 + PolicyMetadata 迁移端点 + Key 模式 A/B 签发 + 审计 UI 双主体归因）→ Wave 5 release pin 消费方（迁移 `0013`：API Key `semantic_pin`；RuntimeSemanticToolService 经 data_agent 实例 config、ExecutionCompilerPreviewService 经 `pinned_release_id` 按不可变 release 解析）。**裁剪**：飞书部门同步顺延（以 manual/issuance 来源跑通全链）。**过渡决策（2026-06-14 修订）**：因 gateway 仍有存量用户、直接注入影响生产可用，RLS 执行改由统一开关 `RLS_ENFORCEMENT_MODE` 控制（`off`/`observe`/`deny`/`enforce`，`AccessPolicyDecisionService` 单点读取、随 `PolicyDecisionResult.rls_enforcement_mode` 透传所有 fail-closed 落点与网关 context），**默认 `observe`**：求值 + 写审计但不阻断、`GatewayAccessContext` 维持 v1 网关零感知；`deny` 才 fail closed（free SQL=`row_scope_requires_semantic_path`、gateway 引擎=`scope_injection_unsupported`）。同步修复 execute 路径维度解析（registry cube_repository 回落，与编译同源）。真实环境 E2E：observe 放行 + 求值出 1 条 effective_row_scope、deny free SQL 仍拒（`make verify-backend` 全绿 + 容器内 DB 策略探针）。先用 observe 闭环语义评估，gateway `apply_scope` 就绪后再切 `enforce`（仍另期）。
   - P1 清单：View 发布契约迁 registry、绑定规范 v2（谓词变换 / 等价校验 / 统一 query 协议）、发布后消费配置自动化、知识库随发布生长；~~批量扫描接真实 inspector~~ **已完成**（2026-06-14，ADR-015：建模冷启动 Agent 化——`ModelingSourceScanner` 读真实表缓存→分层→`FieldCandidateService`→`ModelingAssetPackage`+确定性分诊；`scan_project` 真实源/回退/演示三路由零回归；前端加数据源+库选择与分诊分桶；无 LLM 可降级，发布权在人）。
9. （环境项）为 cubic3 申请独立飞书应用以与 hermes 共存；Superset 侧开启截图 feature flag（可选增强）。
