---
doc_type: baseline
status: current
source_of_truth: primary
owner: frontend
last_reviewed: 2026-05-20
---

# 语义中心固定验证流程

## 目标
语义中心改动不再只依赖 `tsc` 或 `pytest` 单侧通过，而是固定执行“共享四层 + 语义专项”：

1. 层 1：静态检查
2. 层 2：类型与接口检查
3. 层 3：自动化回归
4. 层 4：浏览器关键路径烟测

## 服务就绪要求
执行领域创建 / 发布浏览器烟测前，确保以下服务可用：

- 前端开发服务：`http://127.0.0.1:3000`
- 后端 API 与代理已刷新到最新代码

推荐顺序：

```bash
docker compose restart backend nginx
cd /path/to/cubic3-data-platform/frontend
npm run dev -- --host 127.0.0.1
```

## 固定验证入口

```bash
cd /path/to/cubic3-data-platform
make verify-semantic
```

其中语义 smoke 的底层命令等价于：

```bash
cd /path/to/cubic3-data-platform
make smoke-semantic
```

`make verify-semantic` 会顺序执行：

1. `make test-agent-runtime`
2. `make test-modeling-agent`
3. `make verify-backend`
4. `make verify-frontend`
5. `make smoke-semantic`

## 生产候选验证入口

语义平台进入生产候选时使用更严格的入口：

```bash
cd /path/to/cubic3-data-platform
make verify-semantic-prod
```

上线前需要真实预生产库、live smoke 和 PostgreSQL 并发补证时，使用严格入口：

```bash
make semantic-prod-readiness-report

DATABASE_URL="postgresql://..." \
SEMANTIC_FIXTURE_NAMESPACE="qa_live_20260519" \
SEMANTIC_PROD_LIVE=1 \
make verify-semantic-prod-strict
```

该入口用于验证 B1 生产资产底座，顺序包含：

1. `make verify-alembic`：确认迁移拓扑仍是单 head。
2. `make test-semantic-prod-registry`：覆盖 SQL Registry、Publish Gate、Release / Snapshot、真实 governance audit repository 同事务、rollback service / API、active snapshot 和测试清理。
3. `make semantic-baseline-dry-run`：如果设置 `DATABASE_URL`，检查存量库 schema fingerprint；未设置时只输出 skip，不自动 stamp。
4. `docker compose build nginx`：用 `docker/nginx.Dockerfile` 执行 `npm run build:v2`，并通过 `frontend/.dockerignore` 排除本地测试与 Playwright 产物。
5. `make verify-semantic`：复用语义中心固定交付入口。
6. `make smoke-semantic-live`：默认 skip；只有 `SEMANTIC_PROD_LIVE=1` 时运行真实 Modeling Copilot live smoke。
7. `make semantic-fixture-cleanup`：默认无 namespace 时跳过；设置 `SEMANTIC_FIXTURE_NAMESPACE` 后，使用同一个 `DATABASE_URL` 调用 `scripts/checks/semantic_fixture_cleanup.py`，由 `SemanticTestFixtureManager` 按 namespace 清理 SQL Registry / Release / Snapshot / Copilot session / Proposal 和 YAML fixture 输出。

`make verify-semantic-prod-strict` 在上述入口前先运行 `make semantic-prod-env-required`，要求：

- `DATABASE_URL`：同一个语义平台 PostgreSQL 库，用于 schema fingerprint、fixture cleanup 和 release 并发验证；本地可指向 Docker PG，上线前指向独立线上/预生产库。
- `SEMANTIC_PROD_LIVE=1`：真实 Modeling Copilot live smoke。
- `SEMANTIC_FIXTURE_NAMESPACE`：清理 live / fixture 测试资产。

严格入口还会运行 `make test-semantic-postgres-concurrency`，验证 PostgreSQL advisory lock、`release_no` 串行分配、`previous_release_id` 锁内重算和 active snapshot partial unique 约束。

`make semantic-prod-readiness-report` 会输出不含明文数据库密码的 JSON 报告，用于上线前先盘点 strict gate 的三类补证输入：PostgreSQL `DATABASE_URL`、live smoke 和 fixture namespace。报告只做盘点，不替代 `make verify-semantic-prod-strict`。

### Runtime 治理与观测补证

B3 起，生产候选验证还需要确认 Runtime trace 和观测入口可用：

- `GET /api/v1/semantic/health`：检查 active Runtime snapshot 是否 ready，并返回 `version_pin`、`asset_count`、`binding_count`、`policy_count`。
- `GET /api/v1/governance/audit-traces`：按 `semantic_plan_id`、`sql_hash`、`route_type`、`principal_id` 回查治理链路。
- `/api/v1/agent/semantic/plan` 只返回 preview-only ticket，不返回 `query_id`、`poll_url`、`result_url`。
- `/api/v1/agent/semantic/execute` 只有 `policy_decision=allow` 且存在可执行 SQL target 时才提交到 `dw-query-gateway`；deny / approval_required 只返回治理材料。
- `GatewayAccessContext` 必须包含 `policy_decision`、principal、resource refs、SQL hash、ticket preview 等治理上下文；正式执行事实、结果对象和运行态指标以 `dw-query-gateway` 为准。
- 结构化日志会输出 `metric_event=agent_semantic_execute.submitted` 或 `agent_semantic_execute.blocked`，用于日志侧统计提交量、阻断量、release_no 和 snapshot 维度。

存量库 baseline 补证示例：

```bash
DATABASE_URL="postgresql://..." make semantic-baseline-dry-run
```

真实 live 补证示例：

```bash
SEMANTIC_PROD_LIVE=1 make smoke-semantic-live
```

注意：`verify-semantic-prod` 是发布候选闸门，不并入默认 `make verify`。`verify-semantic-prod-strict` 是上线前闸门；如果 Docker、真实数据源、预生产库或 live 凭据不可用，需要在交付说明里明确未跑项和剩余风险。

## v2 浏览器回归重点

Round 4 D+21 后，legacy `make test-regression-semantic` 与 `make semantic-layout` 目标已经移除。当前 v2 浏览器覆盖分为两类：

- 默认前端 smoke：`make smoke-frontend`，底层为 `npm run e2e:smoke`，覆盖 v2 cutover 的低副作用关键路径。
- 语义专项 smoke：`make smoke-semantic`，覆盖领域创建、领域发布、治理问题、数据资产底座四条真实后端链路，以及 P34 Modeling Copilot 对话闭环。
- 语义建设工作台专项：`make test-modeling-agent`，覆盖内部 `SemanticModelDraftBuilder`、Copilot session API、候选资产确认、spec 生成、保存 Proposal、发布门禁、`Domain context-preview` 上下文预览，以及 `/semantic/modeling-workbench` / `/semantic/modeling-workbench/quick` 顶层任务流；旧 Copilot UI 入口不再注册兼容重定向。
- Agent-first Runtime 专项：后端单测覆盖 `/api/v1/agent/semantic/plan` 固定 `runtime_mode=official`、official 必须命中 active SQL runtime snapshot，且 router / mapper / compiler 直接从 snapshot manifest 的 published `spec` 还原语义 catalog；active Ontology、Glossary canonical entity 必须 active，YAML 同名资产不得 fallback，stale measure 与非 active Cube 编译阻断；学生评论真实资产回归覆盖 `Ontology -> Binding -> QueryDSL -> SQL`，要求“最近 N 天”时间过滤和“按学校汇总”维度分组进入最终 SQL。
- Gateway 边界专项：覆盖 `/api/v1/agent/semantic/execute` 提交 gateway、OpenAPI 不暴露本仓内部执行面、查询工作台继续走 DataSource Adapter SPI，确保正式查询不会回落到本仓本地执行链路。
- Modeling Copilot 后端回归：
  - `tests/unit/test_semantic_modeling_copilot_registration.py` 覆盖 DI 注册、关键 route health 和 fail-fast，避免生产启动成功但 Copilot API 静默缺失。
  - `tests/unit/infrastructure/semantic/test_sql_modeling_copilot_repositories.py` 覆盖 SQL session / Proposal 仓储；`SEMANTIC_MODELING_COPILOT_STORE=sql` 是生产默认，`yaml` 仅用于 local / fixture。
  - `tests/unit/application/semantic/test_source_candidate_recall_service.py` 覆盖配置化 source scoring；学生评论查询优先召回 `dwd_interaction_comment_reports_df`，避免被 `view_student_answer_analysis` 这类答题视图抢占，同时用非学生评论规则证明新增领域不需要改通用召回服务。
  - `tests/unit/application/semantic/test_modeling_copilot_service.py` 覆盖历史坏样本的确认来源、spec repair、保存 Proposal 和发布前校验阻塞解释。
  - `tests/integration/test_semantic_modeling_copilot_api.py` 覆盖 not found / validation / LLM required / internal error 的结构化错误码。

补充的 mock 型 v2 E2E 用例位于 `frontend/tests/e2e-v2/`，包括：

- `p24-cube-browse-smoke.spec.ts`：Cube 管理首屏。
- `p25-domain-catalog-smoke.spec.ts`：Domain 目录首屏。
- `p26-ontology-workbench-smoke.spec.ts`：`/semantic/ontology` 工作台结构。
- `p29-legacy-redirect-smoke.spec.ts`：查询旧深链重定向，以及旧语义入口不再注册的路由边界。
- `p34-modeling-agent-smoke.spec.ts`：语义建设工作台从业务问题到口径确认、Spec 编辑、应用语义、确认发布的闭环；同时覆盖批量候选审阅、旧 Copilot UI 入口不再注册，以及没有可复用 Cube 时的候选来源确认 -> 确定性生成 Spec 分支。

底层 `make smoke-semantic` 会继续执行：

1. `npm run e2e:domain-smoke`
2. `npm run e2e:domain-publish-smoke`
3. `npm run e2e:governance-issues-smoke`
4. `npm run e2e:data-assets-smoke`
5. `npm run e2e:modeling-agent-smoke`

## 状态契约

`make smoke-semantic` 不是默认仓库 smoke，而是语义专项 smoke：

- `domain-smoke` / `domain-publish-smoke` 会创建或更新草稿、测试数据和语义资产
- `domain-smoke` / `domain-publish-smoke` / `governance-issues-smoke` / `data-assets-smoke` 依赖前端开发服务、最新后端代码和可写语义目录
- 依赖真实后端 JWT：默认用 `DOMAIN_SMOKE_USERNAME` / `DOMAIN_SMOKE_PASSWORD`
  登录 `/api/v1/auth/login` 获取；也可显式设置 `DOMAIN_SMOKE_AUTH_TOKEN`
- 默认使用 `http://127.0.0.1:3102` 作为临时前端端口，避免占用日常开发的
  `3000`；如需复用已有前端服务，可设置 `SEMANTIC_SMOKE_USE_EXISTING_SERVER=1`
- `modeling-agent-smoke` 使用 `frontend/tests/e2e-v2/p34-modeling-agent-smoke.spec.ts` 的 Playwright mock API 闭环，默认由 v2 Playwright 配置启动临时 Vite 服务，不写入后端或语义目录
- 发布前需要真实后端证据时，可显式运行 `npm run e2e:modeling-agent-smoke:live`；该入口会创建 session、保存 Proposal 并发布语义资产，不进入默认 smoke
- 真实后端运行时默认使用 SQL 仓储保存 Copilot session / Proposal；未执行当前 Alembic 初始化 / 增量迁移时不要运行 live smoke。生产首次上线空库应从 `0001_initial_schema` 初始化；需要本地 YAML 夹具时显式设置 `SEMANTIC_MODELING_COPILOT_STORE=yaml`
- 生产语义资产事实源为 SQL Registry；YAML 仅用于测试 fixture、示例 seed 和调试导出，不作为生产写入路径，也不作为离线迁移输入
- Runtime 生产读取只允许走 active runtime snapshot；draft、Proposal 和 YAML 同名资产不得被 Runtime fallback 命中
- 真实 Agent Runtime 补证可按需运行 `make preflight-agent-runtime` 和 `make live-agent-runtime`：前者只检查 active Ontology / Cube / Measure 绑定，后者会提交真实 MaxCompute 执行验收
- `data-assets-smoke` 会写入确定性 `data-asset-smoke` 元数据夹具，覆盖资产同步、资产雷达、物理表列表、表证据包、`schema_source=asset_snapshot` 治理问题契约，并创建真实 Modeling Copilot session 验证资产底座到 Copilot 入口的连接
- 整个入口不承诺 hermetic，也不保证领域 smoke 或资产 smoke 对工作区和数据零副作用
- 只应在语义关键路径改动时作为交付门禁运行

如果你需要可回收结果，优先在独立测试环境、临时数据空间或可清理本地环境中执行。

## 五条浏览器烟测

### 1. `domain-smoke`
- 创建业务上下文草稿
- 跳转资产画布
- 校验 `draft` 状态

### 2. `domain-publish-smoke`
- 创建业务上下文草稿
- 从 `Cube 库` 拖入至少一个 Cube
- 发布业务上下文 YAML
- 校验状态变为 `active`

### 3. `governance-issues-smoke`
- 使用真实登录获取 JWT
- 读取真实 `/api/v1/semantic/cubes`，选择当前环境里的 Cube
- 调用 `/api/v1/semantic/governance/issues?cube_name=...` 和全量治理问题接口
- 校验 `summary` / `items` 契约、issue 计数一致性和 severity 枚举
- 默认不要求环境一定存在漂移；如需在有种子数据的环境强制验证命中治理问题，可设置 `GOVERNANCE_SMOKE_REQUIRE_ISSUE=1`

### 4. `data-assets-smoke`
- 使用真实登录获取 JWT
- 调用 `POST /api/v1/semantic/assets/sync-runs` 写入确定性 MaxCompute-like 元数据 payload
- 调用 `GET /api/v1/semantic/assets/radar` 校验表数和字段数至少覆盖本次同步
- 调用 `GET /api/v1/semantic/assets/tables` 找回 smoke 物理表
- 调用 `GET /api/v1/semantic/assets/tables/<id>/evidence` 校验 `EvidenceBundle` 包含资产引用、schema 快照，且不被标记为 runtime truth
- 调用 `GET /api/v1/semantic/governance/issues?schema_source=asset_snapshot` 校验治理链路能读取资产快照来源
- 调用 `POST /api/v1/semantic/modeling-copilot/sessions` 用“查询最近 7 天学生评论数，按学校汇总”创建真实 Copilot session；当前创建契约不直接接收 EvidenceBundle，后续候选资产证据由 Copilot 召回链路读取
- 当前完成态要求该脚本在可写测试库中通过；404、鉴权失败或响应字段缺失都应视为数据资产底座或 Copilot session 契约回归。

### 5. `modeling-agent-smoke`
- 打开 `/semantic/modeling-workbench/quick`
- 从“查询最近 7 天学生评论数，按学校汇总”业务问题进入语义建设工作台
- 校验已有语义资产召回、口径确认、Spec 编辑、应用语义、确认发布和发布后验收提示
- 校验没有可复用 Cube 时的候选来源确认与确定性生成 Spec 分支；学生评论候选源应稳定落到 `df_cb_258187.dwd_interaction_comment_reports_df`

legacy `frontend/tests/e2e/cube_draft_smoke.py` 不再作为语义专项交付门禁。它仍可保留为诊断页手工回归参考，但不再代表当前 Modeling Copilot 产品闭环。

### 发布前 live 补证

`npm run e2e:modeling-agent-smoke:live` 使用 `frontend/tests/e2e-v2/p34-modeling-agent-live.spec.ts` 走真实后端：

- 登录真实后端并创建 Modeling Copilot session
- 发送学生评论业务问题；默认会在问题中显式带上 `df_cb_258187.dwd_interaction_comment_reports_df`，避免候选召回误选其它学生相关数据源
- 若已有 Cube 可复用则要求 trace 命中 `deterministic.fast_path`，若当前环境只召回候选来源则先确认评论事实表来源再要求 `generate_semantic_draft`
- 依次执行接受 Cube 草稿、沙盒预演、保存 Proposal、发布语义
- 打开真实 session 页面确认发布态可见

该入口有状态、有写入，不纳入默认 `make smoke-semantic`；建议只在发布前、语义后端契约变更或需要证明真实链路时运行。

## 说明
- 浏览器烟测使用 `playwright-cli`
- 烟测失败时会在 `frontend/tests/artifacts/` 下输出截图
- `make verify-semantic` 是语义中心的交付入口；默认仓库交付入口仍是 `make verify`
- `tsc` 与单测已经归入 `make verify-frontend`；浏览器级验证由 `make smoke-frontend` 与 `make smoke-semantic` 承接
- 当前固定验证流程只覆盖语义中心主路径，不替代完整回归测试体系
