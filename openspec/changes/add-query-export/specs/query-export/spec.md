# query-export 能力 · 规格

## ADDED Requirements

### Requirement: 用户提交导出任务

系统 SHALL 允许认证用户通过 `POST /api/v1/queries/export` 提交一个异步数据导出任务，接受与 `/api/v1/queries/execute` 相同形态的输入（`source_id` + `sql_query`，可选 `visual_spec`），同步返回 `202 Accepted` 与刚创建的 `export_id`，不等待执行结果。

#### Scenario: 成功提交导出任务

- **WHEN** 认证用户 POST 合法的 `{ source_id, sql_query }`，且拥有该数据源的 SELECT 权限
- **THEN** 系统 SHALL 在 `query_exports` 表创建一条 `status='pending'` 记录
- **AND** 将执行任务 enqueue 到 RQ 的 `query_export` 队列
- **AND** 返回 HTTP 202，body 含 `{ code: 0, data: { export_id, status: 'pending', created_at } }`

#### Scenario: 用户无数据源权限

- **WHEN** 认证用户对 `source_id` 没有 SELECT 权限
- **THEN** 系统 SHALL 返回 HTTP 403，错误码 `PERMISSION_DENIED`
- **AND** 不创建 `query_exports` 记录

#### Scenario: SQL 为空或明显非法

- **WHEN** `sql_query` 为空字符串 / 非 SELECT 语句 / 含 DML 关键字
- **THEN** 系统 SHALL 返回 HTTP 400，错误码 `INVALID_SQL`
- **AND** 不创建记录

#### Scenario: 配额超限

- **WHEN** 用户当日已提交任务数 ≥ 20，或并发运行中任务 ≥ 3
- **THEN** 系统 SHALL 返回 HTTP 429，错误码 `EXPORT_QUOTA_EXCEEDED`
- **AND** body 含 `retry_after_seconds` 提示

### Requirement: 用户查询任务状态

系统 SHALL 允许任务创建人通过 `GET /api/v1/queries/exports/{export_id}` 查询任务当前状态，含结果文件的下载链接（如果 `status='success'`）。

#### Scenario: 查询进行中的任务

- **WHEN** 创建人 GET 一个 `status='running'` 的任务
- **THEN** 系统 SHALL 返回 `{ export_id, status: 'running', row_count: null, file_url: null }`

#### Scenario: 查询已完成的任务

- **WHEN** 创建人 GET 一个 `status='success'` 的任务
- **THEN** 系统 SHALL 返回包含 `file_url`（OSS 签名 URL 或本地下载代理 URL）、`file_size_bytes`、`row_count`、`expires_at` 的完整 payload

#### Scenario: 非创建人访问

- **WHEN** 用户 B 尝试 GET 用户 A 创建的任务
- **THEN** 系统 SHALL 返回 HTTP 404（**不**返回 403，避免枚举攻击）

#### Scenario: 已过期任务

- **WHEN** 创建人 GET 一个 `status='expired'` 的任务
- **THEN** 系统 SHALL 返回记录，但 `file_url=null`，并在 body 含 `expired_at` 与 `message='File expired on …'`

### Requirement: 用户列出自己的导出任务

系统 SHALL 允许用户通过 `GET /api/v1/queries/exports` 分页获取**自己**发起的所有导出任务，默认按 `created_at desc` 排序。

#### Scenario: 默认分页

- **WHEN** 用户 GET `/api/v1/queries/exports?page=1&page_size=20`
- **THEN** 系统 SHALL 返回 `{ items, total, page, page_size, total_pages }`
- **AND** `items` 中只含当前用户的记录

#### Scenario: 按状态过滤

- **WHEN** 用户 GET `/api/v1/queries/exports?status=success`
- **THEN** 系统 SHALL 仅返回 `status='success'` 的当前用户记录

### Requirement: 用户取消导出任务

系统 SHALL 允许创建人通过 `POST /api/v1/queries/exports/{export_id}/cancel` 取消未完成的任务。

#### Scenario: 取消排队中的任务

- **WHEN** 创建人对 `status='pending'` 的任务调用 cancel
- **THEN** 系统 SHALL 将任务从 RQ 队列移除
- **AND** 写 `status='cancelled'`、`cancelled_at=now()`
- **AND** 返回 HTTP 200

#### Scenario: 取消运行中的任务

- **WHEN** 创建人对 `status='running'` 的任务调用 cancel
- **THEN** 系统 SHALL 写 `status='cancelling'`
- **AND** worker job 在下一个 chunk boundary 检测到后主动 abort 并将 `status` 置为 `cancelled`
- **AND** API 立即返回 HTTP 202（不阻塞等待 worker）

#### Scenario: 取消已完成任务

- **WHEN** 创建人对 `status='success'` / `'failed'` / `'expired'` 的任务调用 cancel
- **THEN** 系统 SHALL 返回 HTTP 409，错误码 `EXPORT_NOT_CANCELLABLE`

### Requirement: 导出任务的文件生命周期

系统 SHALL 为每条成功完成的导出任务维护 `expires_at`（默认 `created_at + 7 天`），到期后删除物理文件但保留数据库记录。

#### Scenario: 过期清理

- **WHEN** scheduler 扫描到 `status='success' AND expires_at < now()`
- **THEN** 系统 SHALL 从 OSS（或本地）删除对应文件
- **AND** 将记录的 `status` 改为 `'expired'`、`file_url=null`
- **AND** 保留 `row_count`、`file_size_bytes` 字段以供审计

### Requirement: 任务执行产出

系统 SHALL 在任务执行期间通过 RQ worker 完成实际的数据导出工作，成功时将结果文件写入 OSS（优先）或本地回落路径。

#### Scenario: 成功执行

- **WHEN** worker 消费 `query_export` 队列中的任务
- **THEN** worker SHALL 把 `status` 置为 `'running'`
- **AND** 通过 AdapterFactory 获取 datasource adapter 执行 SQL
- **AND** 以 chunk（每 50,000 行）方式流式写 CSV（UTF-8 BOM）
- **AND** 通过 FileDeliveryService 上传到 OSS 或本地
- **AND** 生成签名 URL（OSS）或代理 URL（本地）并写回 `file_url`
- **AND** 将 `status` 置为 `'success'`，写 `row_count` / `file_size_bytes`

#### Scenario: 行数超限

- **WHEN** 执行中累计行数达到 1,000,000
- **THEN** worker SHALL 停止读取
- **AND** 将 `status` 置为 `'failed'`
- **AND** 写 `error_message='row count exceeded limit 1000000'`

#### Scenario: 文件大小超限

- **WHEN** 累计字节数达到 2 GB
- **THEN** worker SHALL 停止读取
- **AND** 将 `status` 置为 `'failed'`
- **AND** 写 `error_message='file size exceeded limit 2GB'`

#### Scenario: 数据源连接失败

- **WHEN** adapter 执行 SQL 抛连接异常
- **THEN** worker SHALL 将 `status` 置为 `'failed'`
- **AND** 写 `error_message` 含异常摘要（不含敏感 credential）

### Requirement: 敏感字段 mask

系统 SHALL 在导出流程中对 dataset 标记为 `is_sensitive=true` 的字段应用 mask 规则，除非用户拥有 `sensitive_data:view_raw` 权限。

#### Scenario: 非特权用户导出含敏感字段

- **WHEN** 导出结果集含 dataset 字段 `phone`（`is_sensitive=true`, `mask_rule='phone-middle-4'`）
- **AND** 用户**不**拥有 `sensitive_data:view_raw` 权限
- **THEN** 导出文件中 `phone` 列 SHALL 应用 `mask_rule`（示例："13800001111" → "138****1111"）

#### Scenario: 特权用户导出含敏感字段

- **WHEN** 用户拥有 `sensitive_data:view_raw` 权限
- **THEN** 系统 SHALL **不**对敏感字段应用 mask，导出原值

### Requirement: 审计日志

系统 SHALL 为每次导出任务的关键状态变更写 audit log。

#### Scenario: 任务创建与下载

- **WHEN** 用户提交导出任务
- **THEN** 系统 SHALL 写一条 `action='export_created'` 的审计日志，含 `user_id` / `source_id` / `sql_query` / `export_id`

- **WHEN** 用户访问 `file_url` 下载文件（本地代理路径）
- **THEN** 系统 SHALL 写一条 `action='export_downloaded'` 的审计日志
