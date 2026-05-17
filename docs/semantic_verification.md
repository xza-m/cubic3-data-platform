---
doc_type: baseline
status: current
source_of_truth: primary
owner: frontend
last_reviewed: 2026-05-06
---

# 语义中心固定验证流程

## 目标
语义中心改动不再只依赖 `tsc` 或 `pytest` 单侧通过，而是固定执行“共享四层 + 语义专项”：

1. 层 1：静态检查
2. 层 2：类型与接口检查
3. 层 3：自动化回归
4. 层 4：浏览器关键路径烟测

## 服务就绪要求
执行浏览器烟测前，确保以下服务可用：

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
2. `make test-query-execution`
3. `make test-modeling-agent`
4. `make verify-backend`
5. `make verify-frontend`
6. `make smoke-semantic`

## v2 浏览器回归重点

Round 4 D+21 后，legacy `make test-regression-semantic` 与 `make semantic-layout` 目标已经移除。当前 v2 浏览器覆盖分为两类：

- 默认前端 smoke：`make smoke-frontend`，底层为 `npm run e2e:smoke`，覆盖 v2 cutover 的低副作用关键路径。
- 语义专项 smoke：`make smoke-semantic`，覆盖领域创建、领域发布与建模助手 Agent 任务流三条真实链路。
- 建模助手 Agent 专项：`make test-modeling-agent`，覆盖 `spec-draft -> draft-from-spec -> validate -> agent-ready-check -> apply -> publish` 的后端最小链路、`Domain context-preview` 上下文预览，以及 `/semantic/modeling-agent/new` 顶层任务流。
- Agent-first Runtime 专项：后端单测覆盖 `/api/v1/agent/semantic/plan` 固定 `runtime_mode=official`、official 只命中 active Ontology、Glossary canonical entity 必须 active、Mapper 稳定 Binding 输出、业务意图生成带 `dsl_version=v1` 的 `QueryDSL` 后经统一 `QueryCompiler` 出 SQL、stale measure 与非 active Cube 编译阻断、DSL 显式引用 restricted 字段阻断；`SemanticRuntimePreflightService` 会在真实环境验收前检查 object、metric、measure_refs、cube 与 measure 是否 active 且可解析，缺失时 fail fast。
- 统一查询执行面专项：`make test-query-execution`，覆盖 `ExecutionTicketSnapshot`、SQL Guard、query job 幂等提交、Agent 语义 job 必须携带 `QueryDSL v1` 治理快照、result object 元数据、Worker 单 job 状态机、lease 续租与过期恢复、取消下沉、过期结果清理、MaxCompute 错误分类，以及 `/api/v1/query-execution/jobs` 提交 / 状态 / 事件 / 取消 API。
- Agent-first Runtime E2E 验收：`tests/integration/query_execution/test_agent_runtime_e2e.py` 通过真实 Flask HTTP 调用 `/api/v1/agent/semantic/execute`，再驱动真实 `QueryExecutionWorkerService`，最后读取 status / events / result，验证 active Ontology + active Cube 编译目标进入 query job 并产出 READY result。当前验收包含“最近 7 天学生评论数按学校汇总”的业务 case；目标表 `df_cb_258187.dwd_interaction_comment_reports_df`、学校维度、时间字段、`comment_count` measure 和 restricted 字段都来自测试内已发布语义资产 fixture，而不是来自请求入参。验收会断言 `query_dsl.dsl_version=v1`，并包含 `student_comment_cube.comment_count`、`student_comment_cube.school_name` 与最近 7 天时间过滤；同时断言 `student_name`、`student_mobile`、`comment_content` 等 restricted 字段不进入 SQL 和结果。外部数仓使用 fake warehouse adapter，避免测试依赖真实 MaxCompute 环境。
- 真实环境资产预检：`make preflight-agent-runtime` 只读取当前配置的 Cube / Ontology YAML 资产，默认检查 `StudentComment / comment_count / student_comment_cube.comment_count / df_cb_258187.dwd_interaction_comment_reports_df`，不执行 SQL，也不访问外部数仓。该入口不并入默认 `make verify-semantic`；若测试环境尚未发布该语义资产，会返回非零退出码和缺失清单。
- 真实执行验收：`make live-agent-runtime` 是 opt-in 入口，会用临时控制面数据库注册真实 MaxCompute 数据源，并通过真实 `/api/v1/agent/semantic/execute`、`QueryExecutionWorkerService` 和 `DataSourceWarehouseExecutionAdapter` 执行“查询最近 7 天学生评论数，按学校汇总”。该入口要求环境提供 `MAXCOMPUTE_ACCESS_ID`、`MAXCOMPUTE_ACCESS_KEY`、`MAXCOMPUTE_PROJECT`、`MAXCOMPUTE_ENDPOINT`（可从 `ODPSCMD_HOME/conf/odps_config.ini` 读取非密钥的 project / endpoint），不打印密钥；验收会断言 SQL 来自 Cube / Ontology 绑定、结果包含学校维度和评论数，且 `student_name`、`student_mobile`、`comment_content` 等 restricted 字段不进入 SQL 或结果。该入口访问真实外部数仓，不并入默认 `make verify-semantic`。

补充的 mock 型 v2 E2E 用例位于 `frontend/tests/e2e-v2/`，包括：

- `p24-cube-browse-smoke.spec.ts`：Cube 管理首屏。
- `p25-domain-catalog-smoke.spec.ts`：Domain 目录首屏。
- `p26-ontology-workbench-smoke.spec.ts`：`/semantic/ontology` 工作台结构。
- `p29-legacy-redirect-smoke.spec.ts`：语义旧入口重定向。

底层 `make smoke-semantic` 会继续执行：

1. `npm run e2e:domain-smoke`
2. `npm run e2e:domain-publish-smoke`
3. `npm run e2e:modeling-agent-smoke`

## 状态契约

`make smoke-semantic` 不是默认仓库 smoke，而是语义专项、有状态 smoke：

- 会创建或更新草稿、测试数据和语义资产
- 依赖前端开发服务、最新后端代码和可写语义目录
- 依赖真实后端 JWT：默认用 `DOMAIN_SMOKE_USERNAME` / `DOMAIN_SMOKE_PASSWORD`
  登录 `/api/v1/auth/login` 获取；也可显式设置 `DOMAIN_SMOKE_AUTH_TOKEN`
- 默认使用 `http://127.0.0.1:3102` 作为临时前端端口，避免占用日常开发的
  `3000`；如需复用已有前端服务，可设置 `SEMANTIC_SMOKE_USE_EXISTING_SERVER=1`
- 不承诺 hermetic，也不保证对工作区和数据零副作用
- 只应在语义关键路径改动时作为交付门禁运行

如果你需要可回收结果，优先在独立测试环境、临时数据空间或可清理本地环境中执行。

## 三条浏览器烟测

### 1. `domain-smoke`
- 创建业务上下文草稿
- 跳转资产画布
- 校验 `draft` 状态

### 2. `domain-publish-smoke`
- 创建业务上下文草稿
- 从 `Cube 库` 拖入至少一个 Cube
- 发布业务上下文 YAML
- 校验状态变为 `active`

### 3. `modeling-agent-smoke`
- 打开 `/semantic/modeling-agent/new` 顶层建模助手任务流
- 选择 active 数据源和物理事实表，生成 `SemanticModelingAgentSpec`
- 基于用户确认后的 spec 生成 Cube + Ontology 草稿
- 执行草稿校验并保存草稿资产，不进入旧 `/semantic/workbench?cube=...` 调试上下文

## 说明
- 浏览器烟测使用 `playwright-cli`
- 烟测失败时会在 `frontend/tests/artifacts/` 下输出截图
- `make verify-semantic` 是语义中心的交付入口；默认仓库交付入口仍是 `make verify`
- `tsc` 与单测已经归入 `make verify-frontend`；浏览器级验证由 `make smoke-frontend` 与 `make smoke-semantic` 承接
- 当前固定验证流程只覆盖语义中心主路径，不替代完整回归测试体系
