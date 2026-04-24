# 异步数据导出 · 设计

## Context

**现状**：
- 同步执行 `/api/v1/queries/execute` 走 `ExecuteQueryHandler.handle()`（线程内同步调用 adapter）→ 硬编码 `LIMIT` → 直接返回 ≤10000 行
- 异步任务基础设施完整：`app/infrastructure/tasks/task_queue.py` 封装 RQ（Redis Queue）；`app/infrastructure/tasks/jobs/` 已有 `extraction_job.py`（包含文件产出 + FileDeliveryService 交付）与 `sql_query_job.py`（异步 SQL 执行写回 SQLQuery 表）
- `FileDeliveryService`（`app/infrastructure/adapters/file_delivery/`）已支持 OSS + 本地 + 飞书三种 backend
- 归档的 `QueryBuilder.tsx` 原型调用 `/api/v1/queries/export` —— 证明这个端点**曾经被规划过**，只是从未在 backend 实现

**约束**：
- 单用户 memory / RQ worker 共享 —— 不能让一个大查询撑爆 worker
- OSS 上传耗时占总时长的 20~60%（extraction 的生产观测）
- 多租户 —— 用户 A 不能看 / 下载 / 取消 用户 B 的导出
- 结果文件有过期（避免永久占用）

**利益相关方**：
- K12 教研：需要全量学情/题库导出
- BI：需要宽表结果集分析
- 平台 SRE：关心 queue depth、worker 健康、存储水位

## Goals / Non-Goals

**Goals:**
- 大结果集（万行~百万行）可导出
- 长查询（分钟级）不阻塞 HTTP
- 用户可在 `/queries/exports` 查看自己的任务并下载 / 取消
- 复用已有 RQ + FileDeliveryService + AdapterFactory，**不引入新基础设施**
- 与现有 `/queries/visual` 并排，互不干扰

**Non-Goals:**
- 多种格式：MVP 只 CSV；Parquet/Excel 留作 follow-up
- 跨用户共享库：纯个人导出
- 计划任务：由订阅中心 / schedule 能力覆盖
- 列级自定义 mask：沿用 dataset sensitivity
- ClickHouse/MaxCompute 原生 `SELECT INTO OUTFILE` 加速：先基线，后优化
- 断点续传 / 分片下载：超 2GB 的需求再设计

## Decisions

### D1. 任务模型：单独的 `query_exports` 表 vs 复用 `sql_queries`

**Alternatives**：
- A. **（选中）** 新建 `query_exports` 表
- B. 复用 `sql_queries` 表，加 `is_export` / `export_file_url` 列
- C. 复用 `extraction_runs`（提取任务）

**Rationale**：
- sql_queries 语义是"保存的查询"（用户的书签），不是"一次执行实例"；混入 export 会让表变胖且语义混乱
- extraction_runs 是"从数据源到 dataset 的 ETL"，用户手动导出不属于这个语义
- 独立表 → 清晰的生命周期管理 + 独立的配额控制 + 独立的权限校验

**Trade-off**：一张新表 + 一条 migration，但值得；这条线**肯定**会长期独立演进（支持 Excel / 支持 Parquet / 支持共享库）

### D2. 任务提交模型：同步创建记录 + 异步 enqueue job

**流程**：
1. `POST /queries/export` → service 验证 SQL / 校验 source_id 权限 / 配额检查
2. service 在 request 线程内**同步** `INSERT INTO query_exports (... status='pending')` 并返回 `export_id`
3. 同一事务结束后 `task_queue.enqueue('app.infrastructure.tasks.jobs.query_export_job.execute_query_export_job', export_id)`
4. 立即响应 HTTP `202 Accepted + { data: { export_id, status: 'pending' } }`
5. 前端 `useExportStatus(export_id)` 轮询（5s 间隔），或 Round 4 后可通过 SSE 推送

**Rationale**：
- 仿照 extraction 模块已有的 `ExecuteTaskHandler`（见 app/application/extraction/handlers/execute_task_handler.py），团队心智模型成本低
- 同步创建记录保证用户一定能在列表里看到任务（即便 worker 暂时不可用）
- job 用 `export_id` 作为唯一入参，job 内部自行加载所有上下文

### D3. 文件格式与大小上限

**MVP**：
- 格式：**仅 CSV**（UTF-8 BOM，Excel 兼容），列分隔符 `,`，字段值用 `"` 包裹，`""` 转义
- 行数上限：**单任务 100 万行**（超出返回 validation 错误，建议拆 partition）
- 文件大小上限：**单任务 2 GB**（超出任务标记为 failed，保留错误上下文）
- 空结果集：仍产出只含表头的 CSV（用户可验证 SQL）

**Rationale**：
- CSV 是覆盖面最广的格式，所有 BI 工具 / Excel / pandas 都能吃
- 100 万行约等于 50~200 MB CSV（按列宽），在 worker 内存 + Redis / OSS 网络带宽范围内
- 2 GB 是运维可接受的单文件大小上限；更大的需求建议拆 partition（dataset 层的 ds 分区）

**Follow-up**：Parquet / Excel / xlsx（xlsx 单 sheet 104 万行上限，设计时留扩展点）

### D4. 存储后端：复用 FileDeliveryService

- **OSS（阿里云）**：主要路径。PUT 到 `oss://{bucket}/exports/{user_id}/{export_id}.csv`，生成 **签名 URL**（TTL 24h）
- **本地**（回落）：写到 `data/exports/{user_id}/{export_id}.csv`；API 返回 `/api/v1/queries/exports/{export_id}/download` 代理下载
- **飞书**：不做（个人导出不需要飞书通知；真要飞书可以让订阅中心 forward）

**Rationale**：FileDeliveryService 已有现成代码、已在生产被 extraction 模块使用；降低实现与运维复杂度。

### D5. 过期与清理

- 每条 `query_exports` 记录有 `expires_at`（默认 `created_at + 7 days`）
- 后台 scheduler job 每小时扫描 `expires_at < now() and status != 'expired'`：删 OSS/本地文件、`status='expired'`、`file_url=NULL`
- 用户重建：支持 `POST /queries/exports/{id}/rerun`（重新提交一次，返回新 export_id）

### D6. 配额与限流

- 单用户**并发**运行中任务数上限：**3**（防单人刷屏）
- 单用户**每日**提交任务数上限：**20**
- 超限：API 返回 `429` + 结构化错误码 `EXPORT_QUOTA_EXCEEDED`，带 retry_after 提示
- 全局 RQ queue depth > 100 时，入队降级：返回 `503` + `queue_saturated`

### D7. 权限模型

- 任务创建：用户必须对 `source_id` 有 SELECT 权限（复用现有 `DataSourcePermission` 检查）
- 任务查询 / 下载 / 取消：仅创建人本人（字段 `query_exports.user_id == current_user.id`）
- 管理员：暂**不**给管理员 override 查看权限（避免 PII 侧漏；需要时走审计日志）

### D8. 敏感字段处理

- 查询结果列如果对应 dataset 的 `is_sensitive=true` 字段（同 dataset_detail-content 的渲染约定）：**默认 mask**（同 `/queries/execute` 现有行为）
- 如果用户的角色含 `sensitive_data:view_raw` 权限：mask 关闭
- **BREAKING** 无；只是导出与同步执行的 mask 规则保持一致

### D9. 观测性

- 新增 metrics：`query_export.enqueued_total` / `query_export.finished_total{status}` / `query_export.duration_ms`（histogram）/ `query_export.file_size_bytes`（histogram）
- 审计日志：复用现有 audit_tables，记录 `export_created` / `export_downloaded` / `export_cancelled`

## Risks / Trade-offs

- **[大查询内存压力]** 一条 SELECT 回来 500 MB 结果集在 worker 内存里攒 → 撑爆 → Mitigation：adapter 支持 streaming cursor（已有 postgres/maxcompute 支持），pandas to_csv 用 chunksize=50000 分批 flush；worker memory limit 2GB
- **[OSS 上传慢]** 单线程上传 1 GB 文件可达分钟级 → Mitigation：后续上 OSS multipart upload；MVP 单文件即可
- **[存储膨胀]** 用户刷刷导出 → 占满 OSS bucket → Mitigation：D5 的 7 天过期 + D6 的配额
- **[OSS 签名 URL 泄露]** 24h TTL 期间别人拿到 URL 可直接下 → 风险可控（URL 只给本人）但需要前端**不**在日志里打 URL
- **[取消不生效]** RQ 运行中的 job 硬中断困难 → Mitigation：cancel 时设 `query_exports.status='cancelling'`，job 每 chunk 检查一次数据库 status；未启动的 job 直接从 queue 删

## Migration Plan

纯新增，无 migration。部署顺序：
1. DB migration 创建 `query_exports` 表（空表，不影响任何现有流量）
2. 后端上线（新 endpoints + job + service），未开量
3. 前端上线（新 `/queries/exports` 页 + 按钮，feature flag 包住）
4. 内部灰度：仅平台 SRE 账号可见"导出为文件"按钮
5. 全量放开 flag
6. 观测一周后，开始推广给 BI / 教研用户

**回滚**：关 feature flag 隐藏前端按钮；后端端点保留（无害）。DB 表保留（无害）。

## Open Questions

- Parquet 到底要不要放在 MVP？BI 用户可能更想要 Parquet 直接落 Hive。**当前决策**：留 follow-up，先 CSV 验证全链路
- `/queries/exports/{id}/rerun` 是新端点 vs 前端自动"复制参数发起新任务"？**当前决策**：后端 rerun 更简单，前端直接调
- 配额 20/day 是否可按角色差异化？先一刀切，Round 5 再按数据反馈调整
- 过期后要保留 record 还是硬删？**当前决策**：保留 record（file 删，用户在列表里能看到"已过期"）
