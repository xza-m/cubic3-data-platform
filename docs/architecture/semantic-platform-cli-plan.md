# 语义平台 CLI 化完整规划方案（Agent-Operable Semantic Platform）

**status:** draft（待评审 / 规划方案）
**created:** 2026-06-28
**owner:** 语义中心 / DataAgent / 平台工程
**scope:** 把资产/元数据/cube/本体/语义查询/plan/意图识别/治理/发布等全平台能力 CLI 化，使 AI agent（Claude/Codex）能端到端操作语义平台
**配套:** `intent-understanding-layer-design.md`、`analytical-data-agent-layer-design.md`、ADR-013/014/016

---

## 1. 背景与目标

平台已把"问数"做通（L1 意图理解 + 可回答性门控 + L1→L2 编译执行）。但 agent 目前只是问数的**消费者**——要让 agent 真正给平台**提效**，它得能像人一样操作语义层：扫资产、建 cube、维护本体、调试查询、治理授权、发布。这些今天只有**给人的 UI/API**，缺**给 agent 的操作面（CLI）**。

> **核心理念**：CLI 化 = 把语义平台变成 **agent-operable 的 headless 系统**。CLI 是 agent 的操作面，对应人的 UI。这与"Data Agent 应操作语义层而非裸数据"一脉相承。CLI 应是**薄封装**——零新建领域逻辑，只把既有 application 服务包成命令。

**现状（重要）**：仓库**已有一个 CLI** `cli/cubic3_dp_cli/`（Typer，**HTTP-client 风格**，打 `/api/v1`，bearer/api-key 鉴权），已覆盖 `auth / datasource / governance / describe`。本方案是**扩展它**到全域，而非从零建。

## 2. 关键架构决策：一个 in-process 命令核 + 两前端（本地 CLI / 现有 HTTP）

这是 CLI 化的**枢纽决策**。形态是**"一个 in-process 命令核 + 前端"**（已定 2026-06-28：**本地 CLI 为主 + 复用现有 HTTP，不做 MCP**）：

```
        ┌─ 本地 CLI（主）────  in-process: create_app(role='cli') 直调 DI，全覆盖 60+ 操作零端点
in-process │                   agent 能 exec/SSH 进平台机器时用（当前 docker exec 即是）
命令核 ────┤
(薄封装DI) └─ 现有 HTTP ───────  cubic3_dp_cli / API：agent 远程、只有网络时用既有端点子集
```

- **in-process 命令核**：`create_app(role='cli') + app_context` 直调 DI 服务（参考 `wsgi.py`/`run_worker.py`），是**唯一的能力实现**，薄封装、全覆盖 60+ 操作、零新建端点。**这是 agent 的主操作面。**
- **前端 A — 本地 CLI（主）**：在平台机器上（容器内/exec/SSH）跑命令核。当前 session 即 `docker exec` 进容器，已验证此路可行。
- **前端 B — 现有 HTTP（`cubic3_dp_cli` / API）**：agent 远程、无 shell 时走既有 API 端点子集（auth/datasource/governance/describe 已有）。**不为全部 60+ 操作补端点**——远程只覆盖已有端点的能力，全能力靠本地 CLI。
- **不做 MCP**（用户 2026-06-28 决定）：本地 CLI + HTTP 已够，不引入额外协议层。

**关键洞察（远程拓扑）**：决定"agent 与平台不同位置能不能用"的，**不是 in-process vs HTTP，而是 agent 有没有办法在平台机器上执行进程**：
- **能 exec/SSH**（哪怕 agent 本体在别处）→ 本地 CLI（全能力）。当前 `docker exec` 即是。
- **只有网络、无 shell** → 走现有 HTTP 端点子集（能力受现有端点限制）。

**结论**：以 **in-process 命令核 + 本地 CLI** 为骨干和主操作面；远程用既有 HTTP，不补端点、不做 MCP。

## 3. 命令树（七域全景）

统一形态：`semantic <domain> <verb> [--principal <id>] [--as <id>] [--json|--human] [--dry-run|--yes] [--schema] [--live]`。一命令一动作（禁聚合大命令），每个动词薄封装一个既有服务。

### 3.1 资产 + 元数据 + 数据源（`datasource` / `asset` / `field`）
- `datasource list|show|validate|scan|create|update|delete` — `ListDatasourcesHandler`/`TestConnectionHandler`/目录同步 `execute_datasource_catalog_sync_job`
- `datasource databases|tables` — schema browser 第1/2层（缓存优先 `TableCacheService`，`--live` 触 adapter）
- `asset list|show|fields|evidence` — `DataAssetService.list_tables/list_fields/build_table_evidence`（**读 `data_asset_fields`/snapshots 缓存，绕开 MaxCompute live**）
- `asset scan|sync` — 元数据同步入库（写 `data_asset_tables/fields/snapshots`）
- `asset diagnose` — 资产雷达（失败同步/陈旧 profile/漂移风险）+ `drift` schema 漂移检测
- `field classify` — 字段语义候选（dimension/measure/time/technical + selected_role），`--llm` 走推理增强

### 3.2 cube + 建模（`cube`）
- `cube list|show|describe` — 读注册表（`semantic_definition_service` / `data_asset_fields` 列）
- `cube draft` — 从缓存列/证据包生成 cube 草稿（`build_cube_draft_payload`，**列直喂绕 MaxCompute**）；`--live` 才 `generate_cube_draft`
- `cube validate|expand` — 静态校验 / View 展开

### 3.3 本体 ontology（`object`/`metric`/`glossary`/`relation`/`action`/`policy`）
- `<kind> list|show|search` — 各本体仓库只读
- `<kind> upsert` — `save_*`（**注意：无独立 update，是整条覆盖 upsert**；CLI 须读-改-写防丢字段）
- `<kind> publish|validate` — draft→active 门控（measure_refs 非空、归属对象须 active）
- `metric explain` — 绑定链路（metric→measure_ref→cube）解析态 + stale 标注
- `ontology diagnose` — 全局绑定健康（stale_check / 本体↔cube 一致性 / 双向 diff）

### 3.4 view + 语义查询 + plan + 执行（`view` / `query`）
- `view list|get|validate|publish` — `semantic_definition_service` + `view_publish_service`（publish 走门控）
- `query compile` — QueryDSL→logical SQL（`QueryCompiler`，纯函数零门，**低风险高价值**）
- `query plan` — NL→principal+pre_route→router.plan→compile_preview（dry-run 不执行）
- `query explain` — plan 可解释展开（planning_steps + traceability + bindings + scoped_table_refs）
- `query run|execute` — 开发态 DSL 直执行 / 正式治理执行（`--live`，dev 多 503/blocked）
- `query status` — execute 异步任务态（gateway_query_id → 进度/行数）
- `query diagnose` — DevTools 证据包（为何失败/被拦/出空，聚合 error_code+hint+绑定+治理）

### 3.5 意图识别 + router + DataChat（`intent` / `chat`）
- `intent route|plan` — 语义路由 / 多步计划（`semantic_router/preview_service`）
- `intent extract` — L1 结构化意图抽取中间产物（`IntentExtraction` 槽位）
- `intent answerability` — 可回答性四态门控（answerable/need_clarify/out_of_coverage/out_of_scope）
- `intent eval` — golden 离线 eval（`tests/eval/run_intent_eval.py` 升格为命令）
- `chat ask` — 完整 DataChat 单轮（会话持久化）
- `chat observe` — 线上观察（`observe_datachat.py` 升格：结果分布 + 缺口维度排行 + 样例）

### 3.6 发布 + 提案管线 + manifest（`proposal` / `release` / `manifest`）
- `proposal create|confirm-source|draft|update-spec|validate|gap|approve|apply|publish` — **7 步门控管线**（`modeling_proposal_service`，硬顺序不可跳级）
- `release list|show|validate|publish|rebuild-baseline|rollback|deprecate|revoke` — 发布状态机（`semantic_release_service`）
- `release validate` — 发布前门控预演（binding-matrix gate + runtime schema + policy + 依赖环）
- `manifest show|explain|diff` — active runtime manifest（`runtime_snapshot_service`）

### 3.7 治理 + 运行时前门（`governance` / `runtime`）
- `governance principal resolve|list|show` — `RoleBindingResolver` / `PrincipalResolver`
- `governance grant|scope` — 授权（PUT permission-packages）/ RLS scope
- `governance service-principal create` — 服务虚拟用户 + 签发 API Key
- `governance policy|profile list|show|create|update` — data-policy / execution-profile
- `governance decision-preview` — 策略裁决预演（pre_route + post_compile，给 principal+targets）
- `runtime show|test|start|stop|invoke` — ADR-016 AI 前门（provider 生命周期 + 推理）

## 4. Agent-friendly 设计规范（八条）

1. **双输出契约**：默认 human 可读；`--json` 机器可读。结构化结果走 **stdout**、进度/日志走 **stderr**。统一复用 `app/shared/response.py` 的 `success()/error()` envelope（`{code,message,data,trace_id}`）。
2. **名词域 + 原子动词**：`semantic <domain> <verb>`，一命令一动作，禁聚合大命令；按现有 application 边界切域。
3. **统一 in-process 装配**：新增 CLI bootstrap（照搬 `run_worker.py`：`create_app(role='cli') + app_context`），依赖一律从 DI 容器取，**不自己 new 服务**。
4. **身份显式透传**：`--principal <id>`（必填，对应"必须登录"），bootstrap 调 `RoleBindingResolver` 解析真实 PrincipalContext；`--as` 双主体；**绝不在 CLI 自造角色**。
5. **写操作三件套**：`--dry-run` 预览 / `--yes` 确认 / 默认拒危险动作；保证幂等（复用 proposal/release 的 idempotency_key）。
6. **机器可读错误 + 语义化退出码**：error envelope 带稳定 `error_code` 字符串 + `hint`；门控失败结构化反馈（哪步、哪个 gate、缺什么）。退出码区分 用法错/鉴权/门控阻断/数据源不可用。
7. **读先于写 + 自描述 + 离线优先**：提供 `asset fields` / `cube describe` 让 agent 先读结构；`--schema` 输出命令的输入输出契约；**默认读缓存（`data_asset_fields`/snapshot）绕 MaxCompute live**，`--live` 才触 adapter，失败退化缓存 + 专用退出码。
8. **可组合 + 确定性 + 打包成 skill**：NDJSON 流式分页；确定性输出；打包成 `semantic-cli` agent skill（SKILL.md：触发条件 + 执行顺序 + 禁止行为 + 阶段门禁，参考 `lark-shared`/`dw-*` skills）。

## 5. 跨域硬约束与坑（盘点实证）

| 坑 | 影响 | CLI 对策 |
|---|---|---|
| **MaxCompute live 在 dev 挂** | 任何 `adapter.get_table_schema/list_tables/execute` 直挂 | **默认走 `data_asset_fields`/snapshot 缓存**；`--live` 显式触；失败退化缓存 + exit code |
| **持久化双轨**（YAML 文件仓 + DB registry） | 发布要走 registry，建模草稿可能落 YAML；混用出"双轨断点" | CLI 明确：发布链路一律走 SQL asset registry（`_uses_sql_registry`）；草稿态标清在哪轨 |
| **门控提案管线 7 步硬顺序** | validate(无 blocker)→approve(须 validated)→apply(须 approved)→publish，不可跳级 | `proposal` 子命令逐步暴露 + `gap`/`validate` 先看门；`publish-cube` 高层命令串联但失败把阻断原因结构化返回 |
| **principal/data 角色透传** | 角色权威源是 `access_role_bindings`；写操作都要真实主体 | `--principal` 必填 + `RoleBindingResolver`；写操作校验 data 角色 |
| **RLS fail-closed** | `execute` 命中 row_scope 且 deny/enforce → 内网默认拒（503/blocked） | `query execute` 明确呈现 blocked/approval 半态；`--dry-run`=plan 不触执行 |
| **治理双轨**（gateway vs runtime_service） | 出数两条物理路径，口径可能不一 | CLI 统一走治理轨（`semantic_gateway_execute_service`），不暴露绕治理的裸 SQL 路 |
| **本体 upsert 全量覆盖、无 delete** | agent 直接 update 会静默丢字段；无删除动作 | `<kind> upsert` 强制读-改-写；文档标注无 delete |

## 6. 分期路线

| 期 | 内容 | 价值 / 风险 |
|---|---|---|
| **P0 骨架** | CLI bootstrap（in-process `create_app(role='cli')`）+ 输出契约（`--json`/envelope）+ `--principal` 透传 + 退出码 + `--schema`。复用并统一现有 `cubic3_dp_cli` | 地基；低风险 |
| **P1 读域** | datasource/asset/cube/ontology/view/manifest 的 `list/show/describe/fields/evidence`（**全只读、缓存优先、零门**） | agent 立刻能"看清"平台；零风险，最高性价比 |
| **P2 查询/诊断域** | `query compile/plan/explain/diagnose` + `intent route/extract/answerability` + `chat observe` + `intent eval` | agent 能"调试问数"；低-中风险（compile/plan 无门） |
| **P3 建模/发布写域** | `cube draft` + `proposal` 7 步 + `release publish/rebuild/rollback` + `ontology upsert/publish` | **agent 能建模发布**（闭合班级学情 cube 那类需求）；**高风险**——门控管线 + 持久化双轨 + MaxCompute |
| **P4 治理 + 前门** | `governance principal/grant/scope/policy/decision-preview` + `runtime` 前门 | agent 能授权/治理；中风险（写操作鉴权） |
| **打包** | 每期增量并入 `semantic-cli` skill（SKILL.md：阶段门禁 + 禁止行为） | 让任意 agent 可用 |

**建议起手**：P0 + P1（in-process 骨架 + 全只读读域）—— 小、零风险、立刻让 agent 能"看清"整个语义平台，也把 in-process 装配这条地基验证通。P3 的发布写域是真正解决"补建模"的，但要先有 P0/P1 地基 + 单独啃门控管线。

## 7. 打包成 Agent Skill

CLI 做完后打包成 `semantic-cli` skill（`~/.agents/skills/semantic-cli/SKILL.md`），参考本环境范式：
- **触发条件**：用户提到建模/语义层/cube/问数调试/治理授权时。
- **Agent 快速执行顺序**：先 `auth`（`--principal`）→ 读结构（`asset fields`/`cube describe`）→ 再写（`cube draft`/`proposal`）。
- **禁止行为**：不凭自然语言猜表名/字段名（先 `list`/`describe`）；不跳门控（proposal 7 步顺序）；不绕治理直执行裸 SQL；写操作必须 `--dry-run` 预览 + `--yes`。
- **阶段门禁**：发布前必须 `release validate` 过 gate；建模前必须 `asset fields` 读真实列。

## 8. 风险与边界

- **范围**：CLI 是薄封装，**零新建领域逻辑**；所有命令复用既有 DI 服务。
- **不做**：不引分布式/重组件；不在 CLI 自造鉴权/角色；不暴露绕治理的裸 SQL 执行。
- **最大依赖**：in-process 装配的前置假设（§2）+ MaxCompute 缓存策略 + 门控管线的正确驱动。
- **现有 CLI**：`cubic3_dp_cli` 作为起点扩展；HTTP-client 与 in-process 两风格须在 P0 统一口径。

---

*本方案把"给 agent 的语义平台操作面"系统化。落地从 P0/P1 起，先让 agent 能读、再让 agent 能建模发布。*
