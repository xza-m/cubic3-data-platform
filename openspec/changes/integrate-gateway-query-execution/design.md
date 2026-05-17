# Design: 统一控制面 + 可隔离查询执行面

## Context

本项目的目标是让 Agent-first 问数可以稳定使用数仓数据，同时保留业务人员和数据开发人员对语义资产的可操作性。语义运行时已经形成明确职责：

- `Ontology`：Agent-first 的业务语义入口。
- `Cube`：技术语义和执行 SQL 的结构化底座。
- `Domain`：业务上下文和资产组织，不作为执行语义载体。
- `Governance`：权限、审批、审计、风险判定。
- `Execution Compiler`：把已解析的业务语义编译成可执行 SQL 与资源集合。

缺失的是最终执行面：一个能承接编译后 SQL、保持异步状态、执行 MaxCompute 查询、保存结果对象、提供 trace 和恢复能力的通用查询执行子系统。

`dw-query-gateway` 的现有设计正好覆盖这个执行面，但它作为独立平台继续存在会带来重复身份、重复权限、重复审计和跨服务调用。该 change 采用“吸收设计，不修改原仓”的方式，将查询执行面集成到本项目。

## Goals / Non-Goals

### Goals

- 建立本项目内面向 Agent / Runtime 的统一查询执行能力 `query-execution`。
- 保持控制面与执行面逻辑隔离，但部署上仍属于同一项目。
- 让 Agent-first Runtime 可以从 `/api/v1/agent/semantic/execute` 进入真实执行闭环。
- Worker 执行前必须校验 `ExecutionTicketSnapshot`，确保 SQL、资源、主体、审批状态一致。
- 复用本项目现有 DataSource、RBAC、Governance、Semantic Layer 和 AdapterFactory。
- 将 `dw-query-gateway` 中成熟的状态机、lease、result object、MaxCompute 操作设计迁移到本项目；worker heartbeat 第一版只作为可选监控增强，不作为恢复正确性的依赖。

### Non-Goals

- 不修改原始 `dw-query-gateway` 项目。
- 不把 `dw-query-gateway` 作为运行时外部服务依赖。
- 不新增第三套语义 mapping 或第三个真相源。
- 不把执行面做成用户可见的“查询网关资产中心”。
- 不让 Worker 读取 Ontology、Cube YAML 或自行做语义决策。
- 不在第一版支持跨数据源执行、分布式调度系统或对象存储强依赖。
- 不强制 SQL Lab 迁移到异步 job 协议；SQL Lab 是数据开发同步工具面，Query Execution 是 Agent / Runtime 受治理执行面。

## Architecture

```text
┌────────────────────────────────────────────────────────────┐
│ Unified Control Plane                                      │
│                                                            │
│  Agent Semantic Runtime                                    │
│  - Router: active Ontology only                            │
│  - Mapper: readonly binding to active Cube                 │
│  - Compiler: SQL + resource_set + sql_hash                 │
│  - Governance: allow / deny / approval_required            │
│  - ExecutionTicketSnapshot                                 │
└────────────────────────────────────────────────────────────┘
                           │
                           │ submit ticketed query job
                           ▼
┌────────────────────────────────────────────────────────────┐
│ Query Execution API                                        │
│                                                            │
│  QuerySubmissionService                                    │
│  QueryResultService                                        │
│  SqlGuard                                                  │
│  QueryExecutionRepository                                  │
└────────────────────────────────────────────────────────────┘
                           │
                           │ PostgreSQL job queue
                           ▼
┌────────────────────────────────────────────────────────────┐
│ Isolated Execution Plane                                   │
│                                                            │
│  QueryExecutionWorker                                      │
│  - claim with SKIP LOCKED                                  │
│  - validate ticket                                         │
│  - submit / poll / fetch / persist                         │
│  - cancel / retry / recover                                │
│                                                            │
│  WarehouseExecutionAdapter                                 │
│  - MaxCompute first                                        │
└────────────────────────────────────────────────────────────┘
```

## Module Boundaries

### Domain

Create `app/domain/query_execution/`:

- `entities.py`
  - `QueryJob`
  - `QueryEvent`
  - `ResultObject`
  - `ExecutionTicketSnapshot`
  - `WorkerHeartbeat`（可选监控增强）
- `enums.py`
  - `QueryJobStatus`
  - `ResultObjectStatus`
  - `QueryRouteType`
  - `PolicyExecutionDecision`
- `ports.py`
  - `QueryExecutionRepository`
  - `ResultStore`
  - `WarehouseExecutionAdapter`

Domain 层只定义状态、实体、接口和状态转换规则，不依赖 Flask、SQLAlchemy 或 pyodps。

### Application

Create `app/application/query_execution/`:

- `submission_service.py`
  - 接收控制面提交的 SQL、票据和上下文。
  - 运行最终 SQL Guard。
  - 创建 `QueryJob`。
  - 返回 `query_id`、`poll_url`、`result_url`、`trace_id`。
- `ticket_service.py`
  - 根据 Governance allow 结果生成 `ExecutionTicketSnapshot`。
  - 绑定 `principal_id`、`sql_hash`、`resource_set`、`data_level`、`approval_id`、`expires_at`。
  - 第一版不生成加密签名，不单独持久化 ticket 表。
- `worker_service.py`
  - Worker 主状态机。
  - claim、renew lease、submit、poll、fetch、persist、cancel、recover。
- `result_service.py`
  - 读取结果对象。
  - 做 owner / permission 校验。
- `sql_guard.py`
  - 执行前兜底安全校验。
  - 只允许 readonly SQL。
  - 拒绝危险关键字、空 SQL、未授权数据源、过大结果等。
- `schemas.py`
  - API request/response DTO。

### Infrastructure

Create `app/infrastructure/query_execution/`:

- `models.py`
  - SQLAlchemy models for `query_execution_jobs`、`query_execution_events`、`query_result_objects`。
  - `query_worker_heartbeats` 可作为监控增强项后置。
- `repositories.py`
  - PostgreSQL repository。
  - 使用 `SELECT ... FOR UPDATE SKIP LOCKED` claim。
- `result_store.py`
  - 第一版使用本地 spool 目录。
  - 后续可接 OSS，但接口提前收敛在 `ResultStore`。
- `adapters/maxcompute_adapter.py`
  - 从本项目 DataSource 配置创建 pyodps client。
  - 提供 submit、status、fetch、cancel。

### Interface

Create `app/interfaces/api/v1/query_execution.py`:

- `POST /api/v1/query-execution/jobs`
- `GET /api/v1/query-execution/jobs/{query_id}`
- `GET /api/v1/query-execution/jobs/{query_id}/events`
- `GET /api/v1/query-execution/jobs/{query_id}/results`
- `POST /api/v1/query-execution/jobs/{query_id}/cancel`

Modify `app/interfaces/api/v1/agent.py`:

- Add `POST /api/v1/agent/semantic/execute`
- Keep `POST /api/v1/agent/semantic/plan` as preview/planning API.

### Worker

Create `app/workers/query_execution_worker.py`:

- Same codebase and image as web API.
- Separate process/container role.
- Configurable `QUERY_WORKER_ID`、`QUERY_WORKER_IDLE_SLEEP_SECONDS`、`QUERY_EXECUTION_LEASE_SECONDS`、`QUERY_RESULT_CLEANUP_INTERVAL_SECONDS`、`QUERY_EXECUTION_MAX_SUBMIT_ATTEMPTS`。
- May periodically write heartbeat for observability, but recovery MUST rely on job lease.
- Uses PostgreSQL leases instead of Redis queue.

## Data Model

### `ExecutionTicketSnapshot`

`ExecutionTicketSnapshot` 第一版不建独立物理表，内嵌保存到 `query_execution_jobs.ticket_snapshot_json`。它是控制面生成、执行面校验的不可变快照。

```text
principal_id
semantic_plan_id
route_type
source_id
project_name
sql_hash
resource_set_json
data_level
policy_decision
approval_id
expires_at
created_at
```

### `query_execution_jobs`

```text
id
trace_id
principal_id
route_type
semantic_plan_id
source_id
project_name
logical_sql
validated_sql
sql_hash
resource_set_json
data_level
ticket_snapshot_json
governance_snapshot_json
status
idempotency_key
engine_query_id
lease_owner
lease_expires_at
cancel_requested
retry_count
error_code
error_message
created_at
updated_at
submitted_at
finished_at
```

Required indexes and constraints:

```text
UNIQUE(principal_id, idempotency_key) WHERE idempotency_key IS NOT NULL
INDEX(status, lease_expires_at, created_at)
INDEX(principal_id, created_at)
INDEX(sql_hash)
```

### `query_execution_events`

```text
id
query_id
event_type
from_status
to_status
payload_json
created_at
```

### `query_result_objects`

```text
id
query_id
status
storage_type
content_type
file_path
row_count
byte_size
sha256
preview_json
expires_at
created_at
ready_at
```

Required constraints:

```text
UNIQUE(query_id)
```

### `query_worker_heartbeats`（可选增强）

第一版恢复正确性只依赖 `query_execution_jobs.lease_expires_at`。如实现 heartbeat，它只用于监控、容量展示和人工排障，不参与 job claim 的正确性判断。

```text
worker_id
status
running_count
concurrency_limit
last_heartbeat_at
started_at
payload_json
```

## Status Machine

```text
QUEUED
  -> CLAIMED
  -> SUBMITTING
  -> RUNNING
  -> FETCHING
  -> PERSISTING
  -> SUCCEEDED

Any non-terminal state
  -> CANCELING
  -> CANCELED

Recoverable failure
  -> QUEUED

Non-recoverable failure
  -> FAILED
```

Worker MUST write `query_execution_events` for all status transitions.

## Claim Transaction Boundary

`SELECT ... FOR UPDATE SKIP LOCKED` 只允许用于 claim 瞬间的短事务：

```text
BEGIN
SELECT id FROM query_execution_jobs
 WHERE status IN ('QUEUED', recoverable_states)
 ORDER BY created_at
 FOR UPDATE SKIP LOCKED
 LIMIT 1
UPDATE query_execution_jobs
 SET status='CLAIMED',
     lease_owner=:worker_id,
     lease_expires_at=:now + lease_ttl
 WHERE id=:id
INSERT query_execution_events(...)
COMMIT
```

Worker MUST NOT 在 MaxCompute submit、poll、fetch、persist 期间持有数据库事务锁。长查询期间只通过 `lease_expires_at` 续期和状态条件更新保持所有权。

## Execution Ticket Simplification

第一版保留 `ExecutionTicketSnapshot` 概念，但不引入独立 `execution_tickets` 表或加密签名。原因：

- 控制面与执行面属于同一项目、同一数据库信任边界。
- job 行已持久化 SQL、资源、主体、治理快照。
- Worker 可通过 `ticket_snapshot_json` 与 job 字段交叉校验。

Worker 执行前 MUST 校验：

- `ticket_snapshot_json.expires_at` 未过期。
- `ticket_snapshot_json.principal_id` 与 job `principal_id` 一致。
- `ticket_snapshot_json.sql_hash` 与 job `sql_hash` 一致。
- `ticket_snapshot_json.resource_set_json` 与 job `resource_set_json` 一致。
- `policy_decision='allow'`。
- 如 `data_level` 或 policy 要求审批，则 `approval_id` 必须存在且匹配。

跨服务执行面独立部署、跨信任域验票或离线执行出现后，再评估独立 ticket 表和 HMAC/JWT 签名。

## SQL Guard Rules

SQL Guard 是执行面最后一道兜底，不替代语义治理。第一版规则：

- 只允许单条 SQL 语句。
- 只允许 readonly 查询。
- 拒绝多语句分隔符产生的第二条语句。
- 拒绝 `INSERT`、`INSERT OVERWRITE`、`UPDATE`、`DELETE`、`MERGE`、`DROP`、`TRUNCATE`、`ALTER`、`CREATE`、`REPLACE`、`GRANT`、`REVOKE`。
- CTE 和子查询中的关键字同样必须被检查。
- 空 SQL、只有注释的 SQL、无法解析的 SQL 均返回 `INVALID_SQL`。
- 默认 `LIMIT` 使用配置项 `QUERY_EXECUTION_DEFAULT_LIMIT`，默认值沿用平台口径 `50000`。
- 导出类任务可以豁免默认 LIMIT，但必须走导出专用行数、字节数和权限限制。

## Idempotency

`idempotency_key` 第一版规则：

- 客户端可以显式传入 `idempotency_key`。
- 未传入时，服务端为 Agent Runtime 生成兜底 key：`sha256(principal_id + route_type + source_id + sql_hash + time_bucket_hour)`。
- 默认幂等窗口为 1 小时。
- 命中同一 `principal_id + idempotency_key` 时，API 返回已有 `query_id`，不创建重复 job。
- 已进入终态且超过窗口的同 SQL 请求可创建新 job。

## Result Storage And Cleanup

第一版使用本地 spool，但 web API 与 query-worker MUST 挂载同一个共享目录：

```text
QUERY_EXECUTION_SPOOL_DIR=/data/query-execution-spool
```

容器部署时 `web` 与 `query-worker` 必须挂载同一个 Docker volume 或 Kubernetes PVC。`query_result_objects.file_path` 只能保存该共享目录下的相对路径或规范化安全路径，禁止保存任意绝对路径。

结果生命周期：

- Worker fetch 前创建 `DRAFT` result object。
- Worker 完成写入、校验 `sha256` 后将 result object 改为 `READY`。
- `DRAFT` 对 API 不可读。
- cleanup job 或 worker idle loop 定期扫描 `READY AND expires_at < now()`。
- 清理成功后删除物理文件，将 result object 改为 `EXPIRED`。
- 清理失败必须写入 `query_execution_events`，不得静默吞掉。

## Fetch Protection

Worker fetch 阶段 SHOULD 使用 streaming/chunked 方式写入 result store，禁止在支持分片的适配器中把完整结果一次性载入内存。第一版复用现有同步 `DataSourceAdapter` 时，先通过 `QUERY_EXECUTION_MAX_RESULT_BYTES` 做硬熔断；真正 MaxCompute 长轮询和 chunk fetch 随异步适配器增强后置。

第一版配置项：

```text
QUERY_EXECUTION_MAX_PREVIEW_ROWS=1000
QUERY_EXECUTION_MAX_RESULT_BYTES=524288000  # 500 MB
QUERY_EXECUTION_FETCH_CHUNK_ROWS=5000
```

当结果字节数超过 `QUERY_EXECUTION_MAX_RESULT_BYTES`：

- Worker SHALL 停止 fetch。
- job SHALL 标记为 `FAILED`。
- error_code SHALL 为 `RESULT_TOO_LARGE`。
- event payload SHALL 包含已写入字节数和建议改走导出任务。

## MaxCompute Error Classification

MaxCompute adapter MUST 将错误分为可重试和不可重试：

- 可重试：网络超时、临时服务不可用、限流、worker 进程中断后可继续 poll 的已提交 instance。
- 不可重试：SQL 语法错误、权限不足、表不存在、字段不存在、quota 明确不足、SQL Guard 漏过的写操作。

默认最大重试次数为 3 次，由 `QUERY_EXECUTION_MAX_SUBMIT_ATTEMPTS` 控制。第一版对 submit 阶段的 retryable 错误做即时重试并写入 `query_execution_events`；指数退避随异步 MaxCompute 长轮询增强后置。

外部 MaxCompute 实测需要满足以下前置条件：平台 `DataSource` 已配置可用 MaxCompute 凭据、项目名与 endpoint 正确、执行账号具备目标表 `SELECT` 权限、网络可访问 MaxCompute 服务。本 change 的自动化验证使用 fake adapter 覆盖 submit、status、fetch、cancel、错误分类和包装逻辑，不依赖外部 MaxCompute 环境。

## Agent-first Execute Flow

```text
POST /api/v1/agent/semantic/execute
  1. Resolve principal
  2. pre_route governance check
  3. Route against active Ontology
  4. Bind to active Cube
  5. Compile SQL, resource_set, data_level, sql_hash
  6. post_compile governance check
  7. If denied: return blocked, no ticket, no job
  8. If approval_required: return approval material, no job
  9. If allowed: build ExecutionTicketSnapshot
  10. Submit QueryJob
  11. Return query_id, poll_url, result_url, semantic_trace
```

`/api/v1/agent/semantic/execute` SHALL not directly call data source adapters. All physical execution SHALL go through `query-execution`.

SQL Lab is a separate developer tool surface. It MAY keep its synchronous heterogeneous datasource query path, but it SHALL be protected by RBAC and readonly SQL validation. It is not part of the Agent Runtime execution contract.

## Gateway Integration Rule

This change imports design and behavior from `dw-query-gateway`; it SHALL NOT modify that project.

Allowed integration actions:

- Read gateway source as reference.
- Reimplement selected gateway logic in this project using this project's architecture.
- Copy small algorithmic patterns only when adapted to current naming, layering, and test style.
- Preserve behavior with tests rather than preserving file layout.

Disallowed integration actions:

- Editing files under `/Users/xuan/Work/cursor_projects/dw-query-gateway`.
- Adding a git submodule to that repo.
- Importing gateway Python modules at runtime.
- Requiring the gateway FastAPI service to be running for this platform to execute queries.
- Reusing gateway-specific Feishu auth/session tables.

## Deployment

First production-like deployment uses one repo and one image with two roles:

```text
web:
  flask api

query-worker:
  python -m app.workers.query_execution_worker
```

Both roles share PostgreSQL. Query Worker does not expose public HTTP APIs.

When local spool is enabled, both roles MUST mount the same shared spool volume. If shared volume is unavailable, the deployment MUST disable file download and only expose metadata until an object-store `ResultStore` is configured.

## Risks / Trade-offs

- **迁移工作量较大**：直接收敛最终形态会一次性新增执行模型、Worker 和 API。通过小步 TDD、fake adapter、再接 MaxCompute 降低风险。
- **SQL Lab 与 Runtime 职责不同**：SQL Lab 保留为数据开发同步工具面；Agent / Runtime 查询必须走 `query-execution`，避免正式问数链路绕开治理。
- **执行面不能污染语义层**：Worker 只消费 ticket 和 SQL，不读取 Ontology/Cube。
- **凭据来源要统一**：MaxCompute 凭据必须来自本项目 DataSource/secret 体系，不沿用 gateway 的全局 AK/SK 环境变量。
- **结果文件生命周期**：第一版本地 spool 必须共享挂载并具备清理机制，后续可替换为 OSS `ResultStore`。
- **旧查询入口契约差异**：SQL Lab 不强制迁移到异步协议；查询模板、应用 Runtime 等面向正式消费的入口后续再逐步接入 `query-execution`。

## Principle Check

- **KISS**：单项目内双平面，避免两个平台、两套身份、两套审计。
- **YAGNI**：第一版不引入 Redis/MQ、对象存储强依赖、多集群调度。
- **SOLID**：控制面做语义和治理，执行面做任务和引擎适配，接口由 ports 隔离。
- **DRY**：Agent 与后续应用 Runtime 统一复用 `query-execution`；SQL Lab 可复用 SQL Guard、DataSourceAdapter 和审计规范，但不强行复用异步 job 用户链路。
