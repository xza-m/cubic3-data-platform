# query-execution 能力 · 规格

## ADDED Requirements

### Requirement: Agent / Runtime 统一查询执行面

系统 SHALL 在本项目内提供面向 Agent / Runtime 的统一查询执行面，用于承接 Agent Runtime、后续应用 Runtime 和自动化问数产生的受治理只读 SQL 查询任务。

#### Scenario: Agent Runtime 提交查询任务

- **WHEN** `/api/v1/agent/semantic/execute` 已完成 active Ontology 路由、active Cube 绑定、SQL 编译和治理判定
- **THEN** 系统 SHALL 通过 `QuerySubmissionService` 创建 `query_execution_jobs` 记录
- **AND** 记录 `semantic_plan_id`、`ticket_snapshot_json`、`governance_snapshot_json`、`source_id`、`sql_hash`、`resource_set_json`、`data_level`
- **AND** 返回 `query_id`、`poll_url`、`result_url` 和 `trace_id`

#### Scenario: Runtime 提交手写 SQL 查询任务

- **WHEN** 后续应用 Runtime 或自动化问数提交手写 SQL
- **THEN** 系统 SHALL 复用同一 `query-execution` 执行面
- **AND** `route_type` SHALL 为 `manual_sql`
- **AND** 查询仍然必须通过 SQL Guard 和数据源权限校验

#### Scenario: SQL Lab 保留同步开发工具面

- **WHEN** 数据开发人员在 SQL Lab 发起异构数据源调试查询
- **THEN** 系统 MAY 保留现有同步查询路径
- **AND** SQL Lab SHALL 通过 RBAC 限制开放给数据开发或管理角色
- **AND** SQL Lab SHALL 执行只读 SQL 校验和基础审计
- **AND** SQL Lab SHALL NOT 被视为 Agent Runtime 的正式执行链路

#### Scenario: 不依赖外部 gateway 服务

- **WHEN** 本项目执行查询任务
- **THEN** 系统 SHALL 不要求原始 `dw-query-gateway` 服务运行
- **AND** 不从原始 `dw-query-gateway` 仓库 import Python 模块
- **AND** 不修改原始 `dw-query-gateway` 项目文件

### Requirement: Execution Ticket Snapshot 作为控制面到执行面的安全合同

系统 SHALL 使用 `ExecutionTicketSnapshot` 连接语义控制面和查询执行面。第一版 ticket snapshot 内嵌保存到 `query_execution_jobs`，Worker 只执行持有有效 ticket snapshot 的查询任务。

#### Scenario: 允许执行时生成 ticket snapshot

- **WHEN** Governance 返回 `allow`
- **THEN** `ExecutionTicketService` SHALL 生成 ticket snapshot
- **AND** ticket snapshot SHALL 绑定 `principal_id`、`source_id`、`sql_hash`、`resource_set_json`、`data_level`、`policy_decision`、`approval_id`、`expires_at`
- **AND** 系统 SHALL 将 ticket snapshot 写入 `query_execution_jobs.ticket_snapshot_json`
- **AND** 第一版 SHALL 不创建独立 `execution_tickets` 表，不生成 HMAC/JWT signature

#### Scenario: 需要审批时不执行

- **WHEN** Governance 返回 `approval_required`
- **THEN** 系统 SHALL 返回审批材料
- **AND** 不创建 executable ticket snapshot
- **AND** 不创建 `query_execution_jobs` 记录

#### Scenario: 被拒绝时不执行

- **WHEN** Governance 返回 `deny`
- **THEN** 系统 SHALL 返回 blocked 诊断
- **AND** 不创建 ticket
- **AND** 不创建 `query_execution_jobs` 记录

#### Scenario: Worker 校验 ticket 失败

- **WHEN** Worker 发现 ticket 过期、`sql_hash` 不一致、`resource_set` 不一致或缺少必需审批 ID
- **THEN** Worker SHALL 将 job 标记为 `FAILED`
- **AND** 写入 `query_execution_events`
- **AND** 不向数仓提交 SQL

### Requirement: 查询任务生命周期

系统 SHALL 通过 PostgreSQL 持久化查询任务、状态转换和执行事件。

#### Scenario: 创建查询任务

- **WHEN** 查询请求通过 SQL Guard、权限和 ticket 校验
- **THEN** 系统 SHALL 创建 `status='QUEUED'` 的 `query_execution_jobs` 记录
- **AND** 写入 `event_type='job_created'` 的 `query_execution_events` 记录

#### Scenario: 幂等提交

- **WHEN** 同一 principal 使用相同 `idempotency_key` 重复提交同一查询
- **THEN** 系统 SHALL 返回已有 `query_id`
- **AND** 不创建重复 job

#### Scenario: 服务端生成幂等键

- **WHEN** Agent Runtime 提交查询但未提供 `idempotency_key`
- **THEN** 系统 SHALL 使用 `sha256(principal_id + route_type + source_id + sql_hash + time_bucket_hour)` 生成幂等键
- **AND** 幂等窗口 SHALL 默认为 1 小时

#### Scenario: 幂等窗口外重新提交

- **WHEN** 同一 SQL 在幂等窗口外重新提交
- **THEN** 系统 MAY 创建新的 query job
- **AND** 新 job SHALL 拥有新的 `query_id`

#### Scenario: 状态转换可追踪

- **WHEN** job 状态从一个状态变更到另一个状态
- **THEN** 系统 SHALL 写入一条 `query_execution_events`
- **AND** event SHALL 包含 `from_status`、`to_status`、`event_type` 和 `payload_json`

### Requirement: 可隔离 Worker 执行面

系统 SHALL 提供独立进程运行的 Query Worker，用 PostgreSQL job queue claim 查询任务，并执行数仓查询。

#### Scenario: Worker claim 查询任务

- **WHEN** Worker 可用且存在 `status='QUEUED'` 的 job
- **THEN** Worker SHALL 使用 `SELECT ... FOR UPDATE SKIP LOCKED` claim 一条 job
- **AND** 写入 `lease_owner` 和 `lease_expires_at`
- **AND** 将状态转换为 `CLAIMED`
- **AND** claim 事务 SHALL 立即 commit，后续 submit、poll、fetch、persist 不得持有该 row lock

#### Scenario: Worker 长查询续期

- **WHEN** Worker 正在 poll 一个长查询
- **THEN** Worker SHALL 定期更新 `lease_expires_at`
- **AND** 续期失败时 SHALL 停止处理当前 job
- **AND** 不得在长查询期间持有数据库事务锁

#### Scenario: Worker 执行成功

- **WHEN** Worker 成功提交、轮询、获取并持久化查询结果
- **THEN** job SHALL 依次经过 `SUBMITTING`、`RUNNING`、`FETCHING`、`PERSISTING`
- **AND** 最终状态 SHALL 为 `SUCCEEDED`
- **AND** 结果对象状态 SHALL 为 `READY`

#### Scenario: Worker 心跳

- **WHEN** Worker 正常运行
- **THEN** Worker MAY 定期 upsert `query_worker_heartbeats`
- **AND** heartbeat SHALL 只用于监控和排障
- **AND** job 恢复正确性 SHALL 只依赖 `lease_expires_at`

#### Scenario: Lease 过期恢复

- **WHEN** job 处于非终态且 `lease_expires_at` 已过期
- **THEN** 可用 Worker SHALL claim 该 job 进行恢复
- **AND** 根据是否已有 `engine_query_id` 决定继续 poll 或重新提交
- **AND** 已有 `engine_query_id` 的 job SHALL 优先继续 poll，避免重复提交到数仓

### Requirement: 查询取消

系统 SHALL 支持取消排队中或运行中的查询任务。

#### Scenario: 取消排队任务

- **WHEN** 用户取消 `QUEUED` 或 `CLAIMED` 但尚未提交到数仓的 job
- **THEN** 系统 SHALL 将 job 状态改为 `CANCELED`
- **AND** 不调用数仓 cancel API

#### Scenario: 取消运行任务

- **WHEN** 用户取消已有 `engine_query_id` 的 job
- **THEN** 系统 SHALL 写入 `cancel_requested=true`
- **AND** Worker SHALL 调用对应 `WarehouseExecutionAdapter.cancel(engine_query_id)`
- **AND** 最终将 job 状态改为 `CANCELED`

#### Scenario: 取消已完成任务

- **WHEN** 用户取消 `SUCCEEDED`、`FAILED` 或 `CANCELED` 的 job
- **THEN** 系统 SHALL 返回 HTTP 409
- **AND** 不改变 job 状态

### Requirement: 结果对象生命周期

系统 SHALL 将查询结果保存为 `query_result_objects`，并区分 DRAFT 与 READY 状态。

#### Scenario: 结果持久化过程中不可读

- **WHEN** result object 处于 `DRAFT`
- **THEN** 结果读取 API SHALL 返回结果未就绪
- **AND** 不暴露部分文件路径

#### Scenario: 结果就绪后可读

- **WHEN** result object 状态为 `READY`
- **THEN** 创建人或授权主体 SHALL 可通过 result API 读取 preview 或下载结果
- **AND** 响应 SHALL 包含 `row_count`、`byte_size`、`content_type`、`expires_at`

#### Scenario: 结果文件共享目录

- **WHEN** 系统使用本地 spool 保存结果
- **THEN** web API 和 query-worker SHALL 挂载同一个 `QUERY_EXECUTION_SPOOL_DIR`
- **AND** result object SHALL 只保存共享目录内的安全路径
- **AND** API SHALL 拒绝读取 spool 目录外的任意路径

#### Scenario: 非授权用户访问结果

- **WHEN** 用户访问不属于自己且未被授权的 `query_id` 结果
- **THEN** 系统 SHALL 返回 HTTP 404
- **AND** 不泄露该查询是否存在

#### Scenario: 过期结果清理

- **WHEN** result object 状态为 `READY` 且 `expires_at < now()`
- **THEN** cleanup job 或 Worker idle loop SHALL 删除物理文件
- **AND** 将 result object 状态改为 `EXPIRED`
- **AND** 清理失败 SHALL 写入 `query_execution_events`

#### Scenario: Fetch 阶段结果过大

- **WHEN** Worker fetch 结果累计字节数超过 `QUERY_EXECUTION_MAX_RESULT_BYTES`
- **THEN** Worker SHALL 停止 fetch
- **AND** 将 job 标记为 `FAILED`
- **AND** error_code SHALL 为 `RESULT_TOO_LARGE`
- **AND** event payload SHALL 包含已写入字节数和建议改走导出任务

#### Scenario: Fetch 使用流式写入

- **WHEN** Worker 从数仓拉取结果
- **THEN** Worker SHOULD 在适配器支持时使用 streaming 或 chunked fetch
- **AND** 第一版同步适配器 SHALL 至少通过 `QUERY_EXECUTION_MAX_RESULT_BYTES` 对结果规模硬熔断
- **AND** preview SHALL 最多保存 `QUERY_EXECUTION_MAX_PREVIEW_ROWS`

### Requirement: SQL Guard

系统 SHALL 在所有进入执行面的 SQL 上执行最终安全校验。

#### Scenario: 拒绝写操作

- **WHEN** SQL 包含 `INSERT`、`INSERT OVERWRITE`、`UPDATE`、`DELETE`、`MERGE`、`DROP`、`TRUNCATE`、`ALTER`、`CREATE`、`REPLACE`、`GRANT`、`REVOKE` 等危险操作
- **THEN** SQL Guard SHALL 拒绝该查询
- **AND** 系统 SHALL 不创建可执行 job

#### Scenario: 拒绝多语句

- **WHEN** SQL 包含多条语句
- **THEN** SQL Guard SHALL 返回 `INVALID_SQL`
- **AND** 系统 SHALL 不创建 job

#### Scenario: 检查 CTE 和子查询

- **WHEN** SQL 在 CTE 或子查询中包含危险操作
- **THEN** SQL Guard SHALL 拒绝该查询
- **AND** 系统 SHALL 不创建 job

#### Scenario: 拒绝空 SQL

- **WHEN** SQL 为空或只包含注释
- **THEN** SQL Guard SHALL 返回 `INVALID_SQL`
- **AND** 系统 SHALL 不创建 job

#### Scenario: 限制默认结果规模

- **WHEN** SQL 未声明结果限制且请求不属于导出任务
- **THEN** SQL Guard SHALL 应用 `QUERY_EXECUTION_DEFAULT_LIMIT`
- **AND** 记录最终 `validated_sql`

#### Scenario: 导出任务豁免默认 LIMIT

- **WHEN** 请求属于导出任务
- **THEN** SQL Guard MAY 不注入默认 LIMIT
- **AND** 导出任务 SHALL 通过导出专用的行数、字节数、权限和审计限制

### Requirement: 数据源与项目绑定

系统 SHALL 使用本项目 DataSource 和权限体系解析执行引擎、凭据、项目和 SQL 方言。

#### Scenario: 使用平台 DataSource 凭据

- **WHEN** job 引用 `source_id`
- **THEN** `WarehouseExecutionAdapter` SHALL 从本项目 DataSource 配置获取连接信息
- **AND** 不使用 gateway 全局 AK/SK 作为主路径

#### Scenario: MaxCompute 可重试错误

- **WHEN** MaxCompute 查询遇到网络超时、限流或临时服务不可用
- **THEN** adapter SHALL 将错误标记为 retryable
- **AND** Worker SHALL 按 `QUERY_EXECUTION_MAX_SUBMIT_ATTEMPTS` 控制的次数重试 submit 阶段
- **AND** 每次重试 SHALL 写入 `query_execution_events`

#### Scenario: MaxCompute 不可重试错误

- **WHEN** MaxCompute 查询遇到 SQL 语法错误、权限不足、表不存在、字段不存在、quota 明确不足
- **THEN** adapter SHALL 将错误标记为 non-retryable
- **AND** Worker SHALL 将 job 标记为 `FAILED`
- **AND** 不再重试

#### Scenario: 数据源无权限

- **WHEN** principal 对 `source_id` 没有查询权限
- **THEN** 系统 SHALL 拒绝提交 job
- **AND** 返回权限诊断

#### Scenario: 非 active Cube 编译结果不可执行

- **WHEN** Agent Runtime 编译结果引用非 active Cube
- **THEN** 系统 SHALL 在提交执行面前阻断
- **AND** 不创建 ticket 或 job

### Requirement: 查询执行 API

系统 SHALL 提供查询执行 API，支持提交任务、查询状态、读取事件、读取结果和取消任务。

#### Scenario: 提交任务

- **WHEN** 客户端 POST `/api/v1/query-execution/jobs`
- **THEN** 系统 SHALL 返回 HTTP 202
- **AND** body SHALL 包含 `query_id`、`status`、`poll_url`、`result_url`、`trace_id`

#### Scenario: 查询任务状态

- **WHEN** 客户端 GET `/api/v1/query-execution/jobs/{query_id}`
- **THEN** 系统 SHALL 返回该 job 的状态、时间戳、执行引擎 ID、错误摘要和 trace 信息

#### Scenario: 查询事件

- **WHEN** 客户端 GET `/api/v1/query-execution/jobs/{query_id}/events`
- **THEN** 系统 SHALL 按时间顺序返回该 job 的状态转换事件

#### Scenario: 读取结果

- **WHEN** 客户端 GET `/api/v1/query-execution/jobs/{query_id}/results`
- **THEN** 系统 SHALL 在结果 READY 时返回 preview 或下载材料
- **AND** 在结果未就绪时返回明确状态
