# Change: 集成 dw-query-gateway 查询执行面

## Why

当前语义中心已经收敛为 Agent-first Runtime：正式问数链路先消费已发布 Ontology，再绑定 active Cube，并由执行编译器生成可治理、可审计的 SQL。这个链路目前仍缺少一个稳定的查询执行承接面，导致“语义理解”和“真实执行”之间还没有生产级闭环。

`dw-query-gateway` 已经验证过单体内双平面的异步查询执行设计：API 控制面负责鉴权、校验、提交和结果访问，Worker 执行面负责 claim、submit、poll、fetch、persist、recover、cancel。该设计适合被吸收到本项目中，作为 `cubic3-data-platform` 的可隔离执行面。

本项目仍处于设计开发阶段，因此不采用“长期保留两个平台”的过渡路线。最终形态直接收敛为：

```text
cubic3-data-platform = 统一控制面 + 可隔离执行面
```

其中统一控制面承载语义、身份、权限、治理、审批、审计和用户入口；可隔离执行面承载查询任务状态机、Worker、结果对象和具体数仓适配器。

## What Changes

- 新增 `query-execution` 能力规格，定义统一查询执行面、执行票据、查询任务、执行事件、结果对象、Worker 心跳、取消和恢复。
- 新增本项目内的查询执行模块，而不是修改或运行原始 `dw-query-gateway` 项目。
- 将 `dw-query-gateway` 的成熟设计迁入本项目实现边界：
  - PostgreSQL 任务队列。
  - `SELECT ... FOR UPDATE SKIP LOCKED` 任务 claim。
  - lease / recovery，以及可选 worker heartbeat 监控。
  - query event 追踪。
  - result object DRAFT/READY 生命周期。
  - MaxCompute submit / poll / fetch / cancel 适配能力。
- 新增 `/api/v1/query-execution/*` 查询执行 API，用于提交、查看、取消和读取结果。
- 新增 `/api/v1/agent/semantic/execute`，将 Agent-first Runtime 接入查询执行面。
- 新增 `ExecutionTicketSnapshot` 作为控制面与执行面之间的安全合同，第一版内嵌保存到 `query_execution_jobs`，Worker 只执行持有有效票据快照的任务。
- 统一控制面继续使用本项目现有身份、RBAC、DataSource、Semantic Layer、Governance，不迁移 `dw-query-gateway` 的 Feishu session、用户表或项目白名单配置。

## Non-Goals

- 不修改原始 `dw-query-gateway` 仓库。
- 不通过跨仓 import、submodule、包依赖或运行外部 gateway 服务完成集成。
- 不新增独立“查询网关平台”或用户可见资产中心。
- 不引入 Redis/MQ 作为查询执行队列；第一版使用 PostgreSQL job queue。
- 不重做复杂 NL 理解能力；Agent 业务理解仍由 Semantic Runtime 负责。
- 不让执行面读取 Ontology 或自行解释业务语义。
- 不迁移 `dw-query-gateway` 的 Feishu 登录、refresh token、用户 availability 逻辑。
- 不在第一版实现跨数据源 Join、行级权限下推或多租户执行集群。
- 不在第一版引入独立 `execution_tickets` 表、HMAC/JWT 签名或跨信任域离线验票。

## Impact

- Affected specs:
  - 新增 `query-execution`
  - 补充 `semantic-layer`
- Affected code:
  - 新增：`app/domain/query_execution/`
  - 新增：`app/application/query_execution/`
  - 新增：`app/infrastructure/query_execution/`
  - 新增：`app/interfaces/api/v1/query_execution.py`
  - 新增：`app/workers/query_execution_worker.py`
  - 修改：`app/interfaces/api/v1/agent.py`
  - 修改：`app/application/execution_compiler/`
  - 修改：`app/application/governance/`
  - 修改：`app/di/container.py`
  - 新增：Alembic migration for `query_execution_*`
- Affected docs:
  - `docs/architecture/`
  - `docs/semantic_verification.md`
  - `docs/quality/testing.md`
  - `README.md` / local runbook if worker startup commands change

## Compatibility

现有语义诊断 API、SQL Lab、查询模板和导出能力不在本 change 中直接删除。实现完成后，它们应逐步改为复用新的 `query-execution` 执行面，避免长期存在多套执行链路。

第一版只要求 Agent-first Runtime 走新执行面；SQL Lab 和旧查询入口可以短期双轨保留，但不得新增新的直接 adapter 执行路径。
