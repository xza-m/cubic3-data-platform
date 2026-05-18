# Tasks: 集成 dw-query-gateway 查询执行面

## 1. 规格与基线确认

- [x] 1.1 校验本 OpenSpec：`openspec validate integrate-gateway-query-execution --strict`
- [x] 1.2 复查 `dw-query-gateway` 的 QueryService、QueryWorkerService、QueryRepository、MaxComputeService、SQLValidator，仅作为参考输入
- [x] 1.3 确认实现过程中不修改 `/Users/xuan/Work/cursor_projects/dw-query-gateway`
- [x] 1.4 在本项目创建实施分支，保持变更只落在 `cubic3-data-platform`

## 2. 数据模型与迁移

- [x] 2.1 新增 `app/infrastructure/query_execution/models.py`
- [x] 2.2 新增 Alembic migration，创建 `query_execution_jobs`，包含 `ticket_snapshot_json` 和 `governance_snapshot_json`
- [x] 2.3 为 `query_execution_jobs` 增加 `UNIQUE(principal_id, idempotency_key)`、`INDEX(status, lease_expires_at, created_at)`、`INDEX(principal_id, created_at)`、`INDEX(sql_hash)`
- [x] 2.4 新增 Alembic migration，创建 `query_execution_events`
- [x] 2.5 新增 Alembic migration，创建 `query_result_objects`，包含 `UNIQUE(query_id)`
- [x] 2.6 将 `query_worker_heartbeats` 标记为可选监控增强；如第一版实现，不得让恢复逻辑依赖 heartbeat
- [x] 2.7 编写模型迁移测试，验证字段、索引、唯一约束和外键约束

## 3. Domain 与 Ports

- [x] 3.1 新增 `app/domain/query_execution/enums.py`
- [x] 3.2 新增 `app/domain/query_execution/entities.py`
- [x] 3.3 新增 `app/domain/query_execution/ports.py`
- [x] 3.4 编写状态转换单测，覆盖合法转换、非法转换、terminal 状态不可再变更
- [x] 3.5 编写 `ExecutionTicketSnapshot` 过期、hash mismatch、resource mismatch、approval mismatch 的领域校验单测

## 4. Repository 与状态机

- [x] 4.1 新增 `app/infrastructure/query_execution/repositories.py`
- [x] 4.2 实现创建 job、创建 event、读取 job、按 principal 校验访问
- [x] 4.3 实现 idempotency key 去重：客户端 key 优先，Agent Runtime 默认 `sha256(principal_id + route_type + source_id + sql_hash + time_bucket_hour)`，窗口 1 小时
- [x] 4.4 实现 `claim_next_query`，使用 `FOR UPDATE SKIP LOCKED` 短事务 claim，更新 lease 后立即 commit，不在长查询期间持有 row lock
- [x] 4.5 实现 lease renew、lease expired recover；heartbeat 如实现仅用于监控
- [x] 4.6 实现 cancel flag 和状态转换事件写入
- [x] 4.7 编写 repository 集成测试，覆盖 claim 并发、recover、cancel、event trace

## 5. SQL Guard 与执行票据

- [x] 5.1 新增 `app/application/query_execution/sql_guard.py`
- [x] 5.2 从 gateway SQLValidator 设计迁入 readonly 校验、危险关键字拒绝、空 SQL 拒绝、默认 LIMIT 策略
- [x] 5.3 补齐 SQL Guard 规则：只允许单条 SQL，拒绝多语句，拒绝 `INSERT OVERWRITE`，递归检查 CTE 和子查询，默认 LIMIT 使用 `QUERY_EXECUTION_DEFAULT_LIMIT=50000`
- [x] 5.4 新增 `app/application/query_execution/ticket_service.py`
- [x] 5.5 实现 `ExecutionTicketSnapshot` 生成：绑定 principal、semantic_plan、source、resource_set、sql_hash、data_level、approval_id、expires_at，不创建独立 ticket 表，不生成 signature
- [x] 5.6 实现 worker 侧 ticket snapshot 校验：过期、hash mismatch、resource mismatch、approval 缺失均阻断执行
- [x] 5.7 编写单测覆盖 deny、approval_required、allow、ticket mismatch、SQL Guard 多语句和写语法拒绝

## 6. Result Store

- [x] 6.1 新增 `app/infrastructure/query_execution/result_store.py`
- [x] 6.2 实现本地 spool 写入，要求 web 与 query-worker 共享 `QUERY_EXECUTION_SPOOL_DIR`
- [x] 6.3 实现 result object DRAFT -> READY 生命周期
- [x] 6.4 实现结果读取权限校验、过期判断和安全路径校验，禁止读取 spool 目录外文件
- [x] 6.5 实现 result cleanup：扫描过期 READY 结果，删除物理文件，标记 EXPIRED，失败写入 event
- [x] 6.6 实现 fetch 熔断配置：`QUERY_EXECUTION_MAX_PREVIEW_ROWS`、`QUERY_EXECUTION_MAX_RESULT_BYTES`；`QUERY_EXECUTION_FETCH_CHUNK_ROWS` 随异步 MaxCompute 长轮询增强后置
- [x] 6.7 编写单测覆盖 DRAFT 不可读、READY 可读、非 owner 404、过期结果不可下载、cleanup、超大结果失败

## 7. MaxCompute Adapter

- [x] 7.1 新增 `app/infrastructure/query_execution/adapters/maxcompute_adapter.py`
- [x] 7.2 从本项目 DataSource 配置解析 MaxCompute 连接信息
- [x] 7.3 实现 submit、get_status、fetch_result、cancel；第一版复用现有 DataSourceAdapter 同步查询，streaming/chunked MaxCompute 长轮询后置
- [x] 7.4 不沿用 gateway 全局 AK/SK 环境变量作为主路径
- [x] 7.5 实现 MaxCompute 错误分类：网络/限流/临时不可用可重试，语法/权限/表字段不存在/quota 明确不足不可重试
- [x] 7.6 编写 fake adapter 单测和 MaxCompute adapter 合同测试

## 8. Worker 执行面

- [x] 8.1 新增 `app/application/query_execution/worker_service.py`
- [x] 8.2 实现 worker loop：claim、validate ticket snapshot、submit、poll、fetch、persist；heartbeat 如实现仅作为监控
- [x] 8.3 实现 cancel handling：API 写 cancel flag，Worker 调用 adapter cancel
- [x] 8.4 实现 recover handling：lease 过期后可重新 claim recoverable job，已有 `engine_query_id` 时继续 poll，避免重复提交
- [x] 8.5 在 poll 循环中定期 renew lease；续期失败时停止处理当前 job
- [x] 8.6 新增 `app/workers/query_execution_worker.py`
- [x] 8.7 编写 worker 集成测试，使用 fake adapter 模拟成功、失败、取消、恢复、续期失败、结果过大

## 9. Query Execution API

- [x] 9.1 新增 `app/application/query_execution/submission_service.py`
- [x] 9.2 新增 `app/application/query_execution/result_service.py`
- [x] 9.3 新增 `app/application/query_execution/schemas.py`
- [x] 9.4 新增 `app/interfaces/api/v1/query_execution.py`
- [x] 9.5 注册 API blueprint 与 DI providers
- [x] 9.6 编写 API 测试覆盖 submit、status、events、results、cancel

## 10. Agent-first Runtime 接入

- [x] 10.1 修改 `app/interfaces/api/v1/agent.py`，新增 `POST /api/v1/agent/semantic/execute`
- [x] 10.2 修改 Agent Runtime application service，执行顺序固定为 route -> bind -> compile -> policy -> ticket -> submit
- [x] 10.3 `policy_decision=deny` 时返回 blocked，不签发 ticket，不创建 job
- [x] 10.4 `policy_decision=approval_required` 时返回审批材料，不签发 executable ticket，不创建 job
- [x] 10.5 `policy_decision=allow` 时生成 `ExecutionTicketSnapshot` 并创建 query job
- [x] 10.6 响应中返回 `query_id`、`poll_url`、`result_url`、`semantic_trace`
- [x] 10.7 编写 Agent execute 集成测试，覆盖 active Ontology + active Cube 到 query job 的闭环

## 11. Runtime 执行入口边界

- [x] 11.1 明确 SQL Lab 是数据开发同步工具面，不强制迁移到 `query-execution`
- [x] 11.2 第一版明确 Agent Execute 走新执行面；SQL Lab 保留同步异构数据源查询路径
- [x] 11.3 禁止 Agent / Runtime 新增绕过 `query-execution` 的数仓执行路径
- [x] 11.4 为 SQL Lab 与 Query Execution 的职责边界补充 spec / design 文档

## 12. 文档与运行方式

- [x] 12.1 更新 `docs/architecture/`，说明统一控制面 + 可隔离执行面
- [x] 12.2 更新 `docs/semantic_verification.md`，补充 Agent execute 到查询结果的闭环验证
- [x] 12.3 更新 `docs/quality/testing.md`，新增 query execution 验证入口
- [x] 12.4 如新增 worker 启动命令或共享 spool volume，更新 `README.md`、`docs/QUICK_START.md`、`docs/STARTUP_GUIDE.md`

## 13. 验证入口

- [x] 13.1 新增或扩展 `make test-query-execution`
- [x] 13.2 扩展 `make verify-semantic`，覆盖 `/api/v1/agent/semantic/execute`
- [x] 13.3 执行 `make verify-detect`
- [x] 13.4 执行受影响的后端测试、语义测试和 API smoke
- [x] 13.5 记录无法运行的外部 MaxCompute 测试前置条件与替代 fake adapter 结果
