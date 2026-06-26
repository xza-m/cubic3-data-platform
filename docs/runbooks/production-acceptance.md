---
doc_type: runbook
status: current
source_of_truth: primary
owner: engineering
last_reviewed: 2026-06-10
---

# 生产验收运行手册（Phase 4/5/6 外设联调）

本文档是单机 Docker 生产验收的统一入口，覆盖 roadmap Phase 4（应用消费）、Phase 5（受控问数）、Phase 6（DataAgent 与全栈收敛）的全部外设验收项。验收结论统一记录在本文件，不拆分多个文件。

本轮验收时间：2026-06-10。结果标记：✅ 通过 / ⚠️ 部分通过 / ⛔ 阻塞（缺有效凭证）。

执行前提：宿主机 `.env` 已配置以下密钥（不入库）：

| 变量 | 用途 | 必需阶段 | 本轮状态 |
| --- | --- | --- | --- |
| `SUPERSET_BASE_URL` / `SUPERSET_USERNAME` / `SUPERSET_PASSWORD` | BI 看板截图推送 | Phase 4 | 有效（admin/admin，2026-06-11 验证；UI 另支持飞书 SSO） |
| `FEISHU_APP_ID` / `FEISHU_APP_SECRET` / `FEISHU_CHAT_ID` | 飞书消息渠道与 P2P 问数 | Phase 4 / 5 | 有效（真实送达验证通过） |
| MaxCompute 数据源凭证（平台内数据源配置，非环境变量） | schema_drift / 真实查询 | Phase 4 / 5 | 有效（2026-06-10 更新，schema 浏览与真实查询通过） |
| `QUERY_GATEWAY_BASE_URL` / `QUERY_GATEWAY_PLATFORM_SERVICE_TOKEN` | dw-query-gateway 执行链路 | Phase 5 / 6 | 有效（telemetry 返回真实数据） |
| `LLM_API_KEY` / `LLM_API_BASE` / `LLM_MODEL` | 智能问数 LLM | Phase 5 | 已配置 |
| `AGENT_CODEX_ENABLED=true` + 镜像内 Codex CLI 登录态 | 建模 Copilot codex_sdk runtime | Phase 6 | 有效（宿主机 `~/.codex` 挂载，2026-06-11 真实 run 通过） |

## 1. 单机 Docker 全栈启动

```bash
docker compose up -d --build
docker compose ps          # nginx / backend / rq_worker(x2) / postgres / redis 均应 healthy/running
curl http://localhost:81/health
```

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| compose 全部服务启动且健康 | ✅ | `docker compose ps`：6 容器 Up（nginx/backend/rq_worker×2/postgres/redis） |
| `GET /health` 返回 200 | ✅ | `{"code":0,"data":{"status":"ok"}}` |
| `flask db upgrade` 至 0010（含 definition_hash / message.source） | ✅ | `flask db current` → `0010_diagnose_def_hash (head)` |
| 前端 SPA 可访问（`http://localhost:81/`） | ✅ | HTTP 200（nginx 托管 dist-v2 构建产物） |

## 2. 核心链路 smoke（接入 → 语义 → 查询）

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 登录获取 token（admin） | ✅ | `POST /api/v1/auth/login` 返回 JWT |
| 数据源列表 / 测试连接 | ✅ | PostgreSQL 实例（id 900001）与 MaxCompute 实例（id 4，2026-06-10 更新凭证）测试连接均成功 |
| 语义 compile：`POST /api/v1/semantic/compile` 返回 SQL + `definition_hash` | ✅ | smoke cube 编译返回 SQL 与 64 位 hash |
| 语义 query：`POST /api/v1/semantic/query` 返回证据包 | ✅ | smoke cube（绑定 PG 源）真实执行，返回 columns/sql/definition_hash/execution_time_ms/row_count |
| 错误分类 error_code 生效 | ✅ | 未绑定 cube → `datasource_binding_error`；语法错误 → `sql_syntax_error`（含 hint） |
| DevTools 查询执行 Tab 可视化证据包 | ✅ | 接口层验证通过；前端 Tab 走同一 `/semantic/query` |

本轮验收发现并修复的两个真实缺陷：

1. **编译器方言引用缺陷**：`QueryCompiler` 硬编码反引号别名（MaxCompute 风格），对 PostgreSQL 源生成非法 SQL。修复：`SQLDialect.quote_identifier()` 按方言引用（PG 用双引号）。
2. **查询缓存失效缺陷**：Cube 定义更新后 `SemanticQueryService` 的 compiler/JoinGraph 缓存不失效，`/semantic/query` 持续按旧定义编译。修复：`CubeModelingService._after_save` 同步失效查询服务缓存。

> 验收用临时 `smoke_agent_query_logs` cube 已在验收后删除；复跑时按上述步骤重建即可。

## 3. Phase 4：四类系统实例真实联调

| 实例 | 外设依赖 | 验收点 | 结果 | 证据 |
| --- | --- | --- | --- | --- |
| 订阅 trigger → delivery → 飞书渠道 | 飞书 | 消息真实送达、`SubscriptionDeliveryLog` 写入 | ✅ | 渠道+订阅创建后手动触发，飞书群真实收到消息；delivery_logs 记录 `status=success, duration_ms=795` |
| `bi_dashboard_push` | Superset + 飞书 | 看板信息获取、消息送达（截图为可选增强） | ✅（2026-06-11 复跑） | 实例 4 推送看板「test(id=2)」：登录 + 看板信息获取成功，订阅 3 → 飞书渠道 delivery `status=success`。截图降级为链接推送——Superset 部署侧未开启 `EnableDashboardScreenshotEndpoints` / `THUMBNAILS` feature flag（需服务端配 celery + webdriver 后才有截图）；executor 已重构为真实 Superset API 合约（CSRF + cache_dashboard_screenshot → thumbnail 逐级尝试，均不可用时降级不报错） |
| `dataset_card_push` | 飞书 | 卡片送达、实例状态回写 | ⚠️ | 渠道链路已验证；环境内暂无数据集，实例未建 |
| `anomaly_monitor` | 数据源 + 飞书 | 阈值判定、告警送达 | ✅（2026-06-11 复跑） | 实例 3「学生评论举报量监控」：MaxCompute 最新分区真实查询（435910 > 阈值 100000）触发告警，订阅 2 → 飞书渠道 delivery `status=success`。注意订阅按 `app_instance_id` 绑定，新实例需配套新订阅 |
| `schema_drift_check` | MaxCompute + webhook | 漂移检测执行、webhook 送达 | ✅（2026-06-10 复跑） | execution 20 `status=success`，真实读取 MaxCompute 表结构并产出漂移报告（含 `type_mismatch` 等告警） |

说明：`schema_drift_check` 的 `webhook_url` 为实例级配置（实例 `config` JSON 内字段，或 `PATCH /api/v1/subscriptions/{id}` 更新），不走环境变量。

## 4. Phase 5：受控问数链路

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| gateway 观测 BFF（`/governance/gateway/observability`）可用 | ✅ | 返回真实 telemetry（query_count=4336 等），token 鉴权通过 |
| `/agent/semantic/plan` 可用 | ✅ | 返回完整 plan 结构（policy_decision / semantic_trace / ticket_preview） |
| `/agent/semantic/plan → /execute` 真实出数 | ✅（2026-06-11 远程线上 gateway 复跑） | 「学生评论总数」经语义层编译 → 治理 allow → 远程 dw-query-gateway（10.1.20.87:8009）→ MaxCompute 真实执行（instance `20260611064350701g48ay1685s1`），返回 `total_count=435910`；2026-06-10 本地 gateway 首跑 `total_count=434249` |
| Modeling Copilot 正式链路发布 cube 后复现出数 | ✅（2026-06-11） | 会话 → 确认来源 → 自动生成 spec（自动识别真实表/`source_id`/`ds` 分区）→ 工作台补 `partition.latest_expr` → 沙盒预演 → save-proposal → publish（Release 11）→ plan/execute 真实出数；注意 `PATCH /spec` 传 `{"spec": ...}` 为整体替换，分区等局部修改应传 `{"cube": ...}` 部分覆盖 |
| DataChat 三层来源徽标（语义层 / Agent / 直连 LLM-未验证） | ✅（代码+测试） | 后端 `message.source` + 前端徽标已落地，单测/组件测试覆盖；环境内无数据集，未做真实对话 |
| ~~legacy 回答带「未经语义层验证」前缀且 `agent_query_log` 全路径记录~~（历史口径，Phase 8.1 已废） | — | 物理直表旁路已删；新口径见下行「DataChat 答不出统一诚实兜底」 |
| DataChat 答不出统一诚实兜底（非 legacy 物理出数）+ principal 透传治理 | ✅（代码+测试） | **Phase 8.1（CONSUME-04）收口**：两条物理直表旁路（legacy 第 3 层 `_execute_query`/`AdapterFactory`/`LEGACY_DISCLAIMER` + agent 第 2 层全局会话）已删除；三类答不出（治理 deny / 未命中 / 主链全失败）统一收敛到 `_build_unanswerable_fallback`（`source='fallback'` / `status='unanswerable'` / `via_semantic_layer is False`），不产 SQL、不碰物理表。**治理**：DataChat 主链把真实 principal（`access_role_bindings` 权威源）透传给 `execute_plan`，治理裁决由下游 `runtime_service.execute` 的 `post_compile`（已在链路，`runtime_service.py:113/126`）完成，与 `/agent/semantic/plan` **同一治理链**（跨入口一致性集成断言 `test_two_entrances_principal_parity` 绿）。**D4 运维桥接前提**：DataChat 主体须绑 `data_m1_reader` 方能出数。**口径说明（对账纠偏）**：本期**不改 RLS 模式**（保持 `observe`）——出数钥匙=主体绑 `data_m1_reader`，`data_policy_not_matched` deny 发生在 access-grant 段（`access.py:693`），全程不读 `RLS_ENFORCEMENT_MODE`、与 RLS 模式无关；访问策略 / 执行档已 seed active（`m1_aggregate_read` / `mc_m1_reader`），**本期不配新策略**。`send_message_handler` + `test_datachat_official_consume` 集成断言覆盖（出数 / deny 兜底 / 跨入口一致性） |
| 飞书 P2P 问数一问一答 | ✅（2026-06-11 真人联调） | 真人私聊发「最近的学生评论举报总量是多少？」→ 长连接收到 `im.message.receive_v1` → Agent Loop 9 轮（知识库 → list_cubes/describe_cube → 语义 query 失败后降级 `execute_sql` 直查 MaxCompute）→ 返回 11,846,287 条（30 天）→ 交互卡片送达 → `agent_query_log` 落库 `status=success`。注意：同一飞书应用不能再被其他服务（如本机 hermes gateway，launchd `ai.hermes.gateway`）建长连接，否则事件被随机抢走 |

## 5. Phase 6：DataAgent 与 Codex runtime

| 验收项 | 结果 | 证据 |
| --- | --- | --- |
| 镜像内 Codex CLI 可用 | ✅ | `openai_codex_sdk/vendor/.../codex --version` → `codex-cli 0.133.0` |
| `AGENT_CODEX_ENABLED=true` 真实 codex_sdk run | ✅（2026-06-11） | `POST /modeling-copilot/sessions/{id}/review-runs` 触发 `semantic.modeling.review_proposal`，run `succeeded`（约 44s），事件流完整（run.started → item.completed×3 → run.succeeded） |
| `CodexRunService` run 状态与产物落库 | ✅（2026-06-11） | run/events 经 `/agent-runtime/runs/{id}` 与 `/events` 可查；复审输出为真实语义判断（指出草稿 `COUNT(report_id)` 与目标 `COUNT(comment_id)` 口径偏差），证明非 mock |

## 6. 验收结论

- **总体结论**：平台侧全栈（Docker 编排、迁移、API、语义证据包、订阅交付、gateway 观测）验收通过；**问数主链路（plan → 治理 → gateway → MaxCompute 真实出数）已于 2026-06-10 端到端打通**。
- **2026-06-10 复跑记录（MaxCompute 凭证就绪后）**：
  - 数据源 id 4 凭证更新后测试连接通过，schema 浏览可列出 568 张表。
  - 语义资产重新发布（Release 8/9）：cube 物理绑定从本地 PostgreSQL 模拟表切换到 `df_cb_258187.dwd_interaction_comment_reports_df`，并补 `partition.latest_expr = max_pt(...)` 以满足 gateway `partitionRequired` 校验。
  - 当前联调环境 `QUERY_GATEWAY_BASE_URL` 指向 `http://10.1.20.87:8009`，并需与 gateway 侧 `PLATFORM_SERVICE_TOKEN` 对齐；仅在本机自启 `dw-query-gateway` 容器时才使用 `http://host.docker.internal:8009`（注意 shell 环境变量会覆盖 `.env`，重建容器前需 unset）。
  - `/agent/semantic/execute` 真实出数：`total_count=434249`（MaxCompute instance `20260610105842730gzc1vgh7aze5`）。
- **2026-06-11 复跑记录（正式链路验收）**：
  - 远程线上 gateway（10.1.20.87）补齐 `MAXCOMPUTE_M0/M1/M2_ACCESS_KEY_*` 凭据绑定后，execute 链路切回远程并真实出数（435910）。
  - Modeling Copilot 正式链路（会话 → 确认 → spec → 沙盒 → proposal → publish Release 11）发布的 cube 复现真实出数；过程中修复 runtime catalog 两个真实缺陷：① copilot spec 用单数 `ontology.object` 而 catalog 只读复数 `objects`，发布后业务对象在运行态丢失；② 发布快照内 ontology object/metric 残留 draft 状态未提升 active（此前只修了 cube）。回归单测 `test_runtime_manifest_catalog.py` 已覆盖。
  - `anomaly_monitor` 真实业务监控实例（举报量 > 10 万告警）触发并经订阅送达飞书群；修复 executor `context.instance` 属性错误（应为 `context.instance_name`）。
  - codex_sdk 真实 run 通过（OpenAI 配额恢复后），复审输出为真实语义判断。
  - 全量后端单测 2020 passed。
- **2026-06-11 下午补充**：`bi_dashboard_push` 验收通过（Superset db 账号 admin 可用）；executor 原实现调用的 `POST /dashboard/{id}/screenshot` 为不存在的端点，已重构为真实 Superset API 合约并支持「截图不可用降级为链接推送」。Superset 侧若需真实截图，需开启 `EnableDashboardScreenshotEndpoints` 或 `THUMBNAILS` feature flag（含 celery + webdriver）。
- **2026-06-11 傍晚补充（飞书 P2P 问数真人联调通过）**：
  - 首次联调消息被本机 hermes gateway（同一飞书应用的另一条长连接）抢走；`launchctl bootout gui/$UID/ai.hermes.gateway` 暂停后事件正确投递到 cubic3。**运维约束：一个飞书应用同时只能由一套服务建长连接**，若需恢复 hermes，应为 cubic3 申请独立飞书应用。
  - 联调中补建了 `data_agent` AppInstance（id 5，`knowledge.datasource_id=4`），此前缺失会导致消息被忽略。
  - 已知改进项（不阻断）：Agent `query` 工具走语义层时，YAML 仓库旧 cube（`student_comment_cube` 等）`source_id=1` 绑定失效报 `datasource_binding_error`，Agent 自动降级 SQL 直查成功；后续可清理旧 cube 或统一 catalog 来源为 published manifest。
- **2026-06-12 复跑记录（语义闭环 M1+M2 验收，对应 `docs/architecture/semantic-binding-and-rls.md`）**：
  - 绑定规范与运行时收口落地：`cube_bindings` / `measure_refs[primary]` 结构化 Schema、publish gate 断链校验矩阵（解析范围=同批∪active manifest）、Agent 语义工具与 router / DevTools / View 发布统一切 manifest catalog（运行时 DI 不再注入 YAML 仓储）、Copilot 草稿即绑定 + cube/ontology 同批发布 + readiness binding blocker + mapper 建模态推荐。
  - Copilot 真实建模发布：会话 → 来源确认 → spec → publish 产 **Release 12**（`rel_a85b5fff…`，cube + ontology 同批，gate 通过，资产正确落 active）。
  - DataChat 问数真实出数：Agent 经语义工具 `list_cubes` / `query`（manifest catalog 支撑）返回最近 7 天每日举报总数（429,873 ~ 437,961），evidence 携带 `release_id` / `snapshot_id`；`agent_query_log` id 5 `status=success`。
  - 飞书信道回归：工具集对齐（`channels=["feishu","datachat"]`）后 P2P 会话正常应答（`agent_query_log` id 2 success；真人问数出数已于 2026-06-11 验证）。
  - DevTools 回放：semantic router `plan → execute-plan`（official 模式）经 manifest 编译执行真实出数。
  - View 发布：`comment_report_daily` 视图发布 virtual dataset 成功，走同一 catalog。
  - 本轮发现并修复的真实缺陷：① conversation 模块事务未提交（仓储绑定容器 scoped_session，handler/API 层补 `repo.commit()`）；② `DatasetField` 描述属性为 `comment` 而非 `description`；③ MaxCompute 适配器返回结构化列定义 `[{name,type}]` 未归一化导致 `unhashable type`；④ `execute-plan` 未向编译链透传 `runtime_mode` / `runtime_manifest` / `analysis_intent`，导致回落 YAML 旁路与全表扫描；⑤ `SemanticDefinitionService.invalidate_cache` 未触发 YAML 仓储 `reload()`，文件写入后读旧定义；⑥ 建模态 cube YAML `source_id` 漂移（1→4）对齐。以上均补回归单测。
  - 验证：`make verify` 全绿（lint / typecheck / 后端前端测试 / 63 条 smoke）。
- **剩余阻断项**：无。全部外设验收项关账，单机 Docker 生产验收完成。
